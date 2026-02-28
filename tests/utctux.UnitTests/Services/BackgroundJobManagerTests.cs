using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Shouldly;
using utctux.Server.Models;
using utctux.Server.Services;
using UtctClient.Data.Common;
using UtctClient.Data.Response;
using Xunit;

namespace utctux.UnitTests.Services;

public class BackgroundJobManagerTests
{
    private readonly Mock<TestDataService> _testDataServiceMock;
    private readonly TestResultsCache _cache;
    private readonly BackgroundJobManager _jobManager;

    public BackgroundJobManagerTests()
    {
        // TestDataService requires concrete dependencies; we mock them to avoid real API calls.
        // For TryStartJob/GetStatus tests we mainly verify job state management, not actual data loading.
        var authServiceMock = new Mock<AuthService>(
            NullLogger<AuthService>.Instance,
            Microsoft.Extensions.Options.Options.Create(new UtctAuthOptions()));
        var cloudTestServiceMock = new Mock<CloudTestService>(authServiceMock.Object);
        var novaServiceMock = new Mock<NovaService>(authServiceMock.Object, NullLogger<NovaService>.Instance);

        _testDataServiceMock = new Mock<TestDataService>(
            authServiceMock.Object,
            cloudTestServiceMock.Object,
            novaServiceMock.Object,
            NullLogger<TestDataService>.Instance);

        _cache = new TestResultsCache(new MemoryCache(new MemoryCacheOptions()));
        _jobManager = new BackgroundJobManager(
            _testDataServiceMock.Object,
            _cache,
            NullLogger<BackgroundJobManager>.Instance);
    }

    #region GetStatus

    [Fact]
    public void GetStatus_NoJob_ReturnsNotStarted()
    {
        var status = _jobManager.GetStatus("unknown-fqbn");

        status.Status.ShouldBe("not_started");
        status.Progress.ShouldBeEmpty();
        status.CachedAt.ShouldBeNull();
        status.Error.ShouldBeNull();
    }

    [Fact]
    public void GetStatus_CachedButNoJob_ReturnsCompleted()
    {
        var fqbn = "cached-fqbn";
        _cache.Set(fqbn, new TestResultsCacheEntry { Results = new TestResultsResponse() });

        var status = _jobManager.GetStatus(fqbn);

        status.Status.ShouldBe("completed");
        status.CachedAt.ShouldNotBeNull();
    }

    #endregion

    #region TryStartJob

    [Fact]
    public void TryStartJob_NewJob_ReturnsTrue()
    {
        // Setup: LoadTestResultsAsync will never complete (we don't await it)
        _testDataServiceMock
            .Setup(s => s.LoadTestResultsAsync(It.IsAny<string>(), It.IsAny<IProgress<string>>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()))
            .Returns(new TaskCompletionSource<(List<AggregatedTestpassResult>, DateTimeOffset?, IReadOnlyList<DateTimeOffset>)>().Task);

        var result = _jobManager.TryStartJob("new-fqbn");

        result.ShouldBeTrue();
        _jobManager.GetStatus("new-fqbn").Status.ShouldBe("running");
    }

    [Fact]
    public void TryStartJob_AlreadyRunning_ReturnsFalse()
    {
        _testDataServiceMock
            .Setup(s => s.LoadTestResultsAsync(It.IsAny<string>(), It.IsAny<IProgress<string>>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()))
            .Returns(new TaskCompletionSource<(List<AggregatedTestpassResult>, DateTimeOffset?, IReadOnlyList<DateTimeOffset>)>().Task);

        _jobManager.TryStartJob("dup-fqbn");

        var result = _jobManager.TryStartJob("dup-fqbn");

        result.ShouldBeFalse();
    }

    [Fact]
    public void TryStartJob_CompletedWithCache_ReturnsFalse()
    {
        var fqbn = "completed-fqbn";
        var tcs = new TaskCompletionSource<(List<AggregatedTestpassResult>, DateTimeOffset?, IReadOnlyList<DateTimeOffset>)>();
        tcs.SetResult(([], null, Array.Empty<DateTimeOffset>()));

        _testDataServiceMock
            .Setup(s => s.LoadTestResultsAsync(fqbn, It.IsAny<IProgress<string>>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()))
            .Returns(tcs.Task);

        _jobManager.TryStartJob(fqbn);

        // Wait for the job to complete
        Thread.Sleep(500);

        var result = _jobManager.TryStartJob(fqbn);
        result.ShouldBeFalse();
    }

    [Fact]
    public void TryStartJob_ForceRefresh_ClearsAndRestarts()
    {
        var fqbn = "refresh-fqbn";
        _cache.Set(fqbn, new TestResultsCacheEntry { Results = new TestResultsResponse() });

        _testDataServiceMock
            .Setup(s => s.LoadTestResultsAsync(It.IsAny<string>(), It.IsAny<IProgress<string>>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()))
            .Returns(new TaskCompletionSource<(List<AggregatedTestpassResult>, DateTimeOffset?, IReadOnlyList<DateTimeOffset>)>().Task);

        var result = _jobManager.TryStartJob(fqbn, forceRefresh: true);

        result.ShouldBeTrue();
        _cache.Get(fqbn).ShouldBeNull(); // Cache should be cleared
    }

    #endregion

    #region MapToTestResultsResponse

    [Fact]
    public void MapToTestResultsResponse_CorrectSummaryCounts()
    {
        var timingData = new List<TestpassTimingData>
        {
            CreateTimingData("Passed", "Completed"),
            CreateTimingData("Passed", "Completed"),
            CreateTimingData("Failed", "Completed"),
            CreateTimingData("Unknown", "Running"),
        };

        var response = BackgroundJobManager.MapToTestResultsResponse("test-fqbn", timingData, null);

        response.Summary.Total.ShouldBe(4);
        response.Summary.Passed.ShouldBe(2);
        response.Summary.Failed.ShouldBe(1);
        response.Summary.Running.ShouldBe(1);
    }

    [Fact]
    public void MapToTestResultsResponse_TimeRange_UsesEarliestAndLatest()
    {
        var earliest = new DateTimeOffset(2024, 1, 1, 8, 0, 0, TimeSpan.Zero);
        var latest = new DateTimeOffset(2024, 1, 1, 20, 0, 0, TimeSpan.Zero);

        var timingData = new List<TestpassTimingData>
        {
            CreateTimingData("Passed", "Completed", earliest, earliest.AddHours(2)),
            CreateTimingData("Passed", "Completed", earliest.AddHours(4), latest),
        };

        var response = BackgroundJobManager.MapToTestResultsResponse("test-fqbn", timingData, null);

        response.TimeRange!.Min.ShouldBe(earliest);
        response.TimeRange.Max.ShouldBe(latest);
    }

    [Fact]
    public void MapToTestResultsResponse_EmptyList_ZeroCounts()
    {
        var response = BackgroundJobManager.MapToTestResultsResponse("test-fqbn", [], null);

        response.Summary.Total.ShouldBe(0);
        response.Summary.Passed.ShouldBe(0);
        response.Summary.Failed.ShouldBe(0);
        response.Testpasses.ShouldBeEmpty();
    }

    [Fact]
    public void MapToTestResultsResponse_WithBuildRegistrationDate_UsesAsMinTime()
    {
        var regDate = new DateTimeOffset(2024, 1, 1, 6, 0, 0, TimeSpan.Zero);
        var startTime = new DateTimeOffset(2024, 1, 1, 10, 0, 0, TimeSpan.Zero);

        var timingData = new List<TestpassTimingData>
        {
            CreateTimingData("Passed", "Completed", startTime, startTime.AddHours(1)),
        };

        var response = BackgroundJobManager.MapToTestResultsResponse("test-fqbn", timingData, regDate);

        response.TimeRange!.Min.ShouldBe(regDate);
        response.BuildInfo!.BuildStartTime.ShouldBe(regDate);
    }

    [Fact]
    public void MapTestpass_MapsAllFields()
    {
        var start = new DateTimeOffset(2024, 6, 1, 10, 0, 0, TimeSpan.Zero);
        var end = start.AddHours(2);
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass
            {
                TestpassName = "TestPass1",
                ExecutionSystem = UtctClient.Data.Common.ExecutionSystem.T3C,
                Requirement = "BVT",
                Type = "Functional",
                Scope = "Desktop",
            },
            NovaTestpass = new NovaTestpass
            {
                TestPassGuid = Guid.NewGuid(),
                StatusName = "Completed",
                PassRate = 100,
                ExecutionRate = 100,
                StartTime = start,
                EndTime = end,
            },
            CurrentRerunReason = "Infra failure",
            CurrentRerunOwner = "user@test.com",
            IsCurrentRun = true,
        };

        var timing = new TestpassTimingData(result);
        var dto = BackgroundJobManager.MapTestpass(timing);

        dto.Name.ShouldBe("TestPass1");
        dto.Requirement.ShouldBe("BVT");
        dto.ExecutionSystem.ShouldBe("T3C");
        dto.Status.ShouldBe("Completed");
        dto.Result.ShouldBe("Passed");
        dto.StartTime.ShouldBe(start);
        dto.EndTime.ShouldBe(end);
        dto.Duration.ShouldBe(TimeSpan.FromHours(2));
        dto.Type.ShouldBe("Functional");
        dto.Scope.ShouldBe("Desktop");
        dto.RerunReason.ShouldBe("Infra failure");
        dto.RerunOwner.ShouldBe("user@test.com");
        dto.IsCurrentRun.ShouldBeTrue();
    }

    [Fact]
    public void MapTestpass_NestedRuns_Mapped()
    {
        var childResult = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass
            {
                TestpassName = "Child",
                ExecutionSystem = UtctClient.Data.Common.ExecutionSystem.T3C,
            },
            NovaTestpass = new NovaTestpass { StatusName = "Completed", PassRate = 100, ExecutionRate = 100 },
            IsCurrentRun = true,
        };

        var parentResult = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass
            {
                TestpassName = "Parent",
                ExecutionSystem = UtctClient.Data.Common.ExecutionSystem.T3C,
            },
            NovaTestpass = new NovaTestpass { StatusName = "Completed", PassRate = 100, ExecutionRate = 100 },
            Runs = [childResult],
        };

        var timing = new TestpassTimingData(parentResult);
        var dto = BackgroundJobManager.MapTestpass(timing);

        dto.Runs.Count.ShouldBe(1);
        dto.Runs[0].Name.ShouldBe("Child");
        dto.Runs[0].IsCurrentRun.ShouldBeTrue();
    }

    #endregion

    #region Helpers

    private static TestpassTimingData CreateTimingData(
        string result, string status,
        DateTimeOffset? startTime = null, DateTimeOffset? endTime = null)
    {
        var execSystem = status == "Running" ? UtctClient.Data.Common.ExecutionSystem.CloudTest : UtctClient.Data.Common.ExecutionSystem.T3C;
        var agg = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass
            {
                TestpassName = $"TP-{result}",
                ExecutionSystem = execSystem,
                CloudTestTenant = execSystem == UtctClient.Data.Common.ExecutionSystem.CloudTest
                    ? "https://cloudtest.microsoft.com" : null,
                CloudTestSessionId = Guid.NewGuid(),
            },
        };

        if (execSystem == UtctClient.Data.Common.ExecutionSystem.CloudTest)
        {
            agg.TestSession = new TestSession
            {
                Status = status,
                Result = result,
                SessionTimelineData = new SessionTimelineData
                {
                    ExecutionStartTime = startTime,
                    CompletedTime = endTime,
                },
            };
        }
        else
        {
            agg.NovaTestpass = new NovaTestpass
            {
                StatusName = status,
                PassRate = result == "Passed" ? 100 : (result == "Failed" ? 50 : 0),
                ExecutionRate = 100,
                StartTime = startTime,
                EndTime = endTime,
            };
        }

        return new TestpassTimingData(agg);
    }

    #endregion
}
