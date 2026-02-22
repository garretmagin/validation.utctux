using Shouldly;
using utctux.Server.Models;
using UtctClient.Data.Common;
using UtctClient.Data.Response;
using Xunit;

namespace utctux.UnitTests.Models;

public class TestpassTimingDataTests
{
    private static AggregatedTestpassResult CreateCloudTestResult(
        string name = "TestPass1",
        string? sessionStatus = "Completed",
        string? sessionResult = "Passed",
        DateTimeOffset? execStart = null,
        DateTimeOffset? completedTime = null)
    {
        return new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass
            {
                TestpassName = name,
                ExecutionSystem = ExecutionSystem.CloudTest,
                Requirement = "BVT",
                Type = "Functional",
                Scope = "Desktop",
                CloudTestTenant = "https://cloudtest.microsoft.com",
                CloudTestSessionId = Guid.NewGuid(),
            },
            TestSession = new TestSession
            {
                Status = sessionStatus,
                Result = sessionResult,
                SessionTimelineData = new SessionTimelineData
                {
                    ExecutionStartTime = execStart,
                    CompletedTime = completedTime,
                },
            },
        };
    }

    private static AggregatedTestpassResult CreateNovaResult(
        string name = "TestPass1",
        string? statusName = "Completed",
        double passRate = 100,
        double executionRate = 100,
        DateTimeOffset? startTime = null,
        DateTimeOffset? endTime = null)
    {
        return new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass
            {
                TestpassName = name,
                ExecutionSystem = ExecutionSystem.T3C,
                Requirement = "Reliability",
                Type = "Stress",
                Scope = "Server",
            },
            NovaTestpass = new NovaTestpass
            {
                TestPassName = name,
                StatusName = statusName,
                PassRate = passRate,
                ExecutionRate = executionRate,
                StartTime = startTime,
                EndTime = endTime,
                TestPassGuid = Guid.NewGuid(),
            },
        };
    }

    #region Constructor - Time Source

    [Fact]
    public void Constructor_CloudTestResult_UsesSessionTimes()
    {
        var start = new DateTimeOffset(2024, 6, 1, 10, 0, 0, TimeSpan.Zero);
        var end = new DateTimeOffset(2024, 6, 1, 11, 0, 0, TimeSpan.Zero);
        var result = CreateCloudTestResult(execStart: start, completedTime: end);

        var timing = new TestpassTimingData(result);

        timing.StartTime.ShouldBe(start);
        timing.EndTime.ShouldBe(end);
    }

    [Fact]
    public void Constructor_T3CResult_UsesNovaTimes()
    {
        var start = new DateTimeOffset(2024, 6, 1, 10, 0, 0, TimeSpan.Zero);
        var end = new DateTimeOffset(2024, 6, 1, 12, 0, 0, TimeSpan.Zero);
        var result = CreateNovaResult(startTime: start, endTime: end);

        var timing = new TestpassTimingData(result);

        timing.StartTime.ShouldBe(start);
        timing.EndTime.ShouldBe(end);
    }

    [Fact]
    public void Constructor_NovaOnlyResult_UsesNovaTimes()
    {
        var start = new DateTimeOffset(2024, 6, 1, 10, 0, 0, TimeSpan.Zero);
        var end = new DateTimeOffset(2024, 6, 1, 12, 0, 0, TimeSpan.Zero);
        var result = new AggregatedTestpassResult
        {
            NovaTestpass = new NovaTestpass
            {
                TestPassName = "NovaOnly",
                StatusName = "Completed",
                PassRate = 100,
                ExecutionRate = 100,
                StartTime = start,
                EndTime = end,
            },
        };

        var timing = new TestpassTimingData(result);

        timing.StartTime.ShouldBe(start);
        timing.EndTime.ShouldBe(end);
    }

    [Fact]
    public void Constructor_NoTimingData_NullTimes()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass
            {
                ExecutionSystem = ExecutionSystem.CloudTest,
                CloudTestTenant = "https://cloudtest.microsoft.com",
                CloudTestSessionId = Guid.NewGuid(),
            },
        };

        var timing = new TestpassTimingData(result);

        timing.StartTime.ShouldBeNull();
        timing.EndTime.ShouldBeNull();
    }

    #endregion

    #region Constructor - Field Mapping

    [Fact]
    public void Constructor_MapsAllFields()
    {
        var result = CreateNovaResult(name: "MyTestpass", statusName: "Running", passRate: 100, executionRate: 100);
        result.TestpassSummary!.Requirement = "BVT";
        result.TestpassSummary.Type = "Functional";
        result.TestpassSummary.Scope = "Desktop";
        result.CurrentRerunReason = "Infrastructure failure";
        result.CurrentRerunOwner = "user@test.com";
        result.ChunkAvailability = [new ChunkAvailabilityInfo("chunk1", "amd64fre", TimeSpan.FromMinutes(30))];

        var timing = new TestpassTimingData(result);

        timing.TestpassName.ShouldBe("MyTestpass");
        timing.Requirement.ShouldBe("BVT");
        timing.ExecutionSystem.ShouldBe(ExecutionSystem.T3C);
        timing.Status.ShouldBe("Running");
        timing.TestpassType.ShouldBe("Functional");
        timing.TestpassScope.ShouldBe("Desktop");
        timing.CurrentRerunReason.ShouldBe("Infrastructure failure");
        timing.CurrentRerunOwner.ShouldBe("user@test.com");
        timing.DependentChunks.Count.ShouldBe(1);
    }

    [Fact]
    public void Constructor_NullSummary_UsesNovaDefaults()
    {
        var result = new AggregatedTestpassResult
        {
            NovaTestpass = new NovaTestpass
            {
                TestPassName = "NovaTestpass",
                StatusName = "Completed",
                PassRate = 100,
                ExecutionRate = 100,
            },
        };

        var timing = new TestpassTimingData(result);

        timing.TestpassName.ShouldBe("NovaTestpass");
        timing.Requirement.ShouldBe("Unknown");
        timing.ExecutionSystem.ShouldBeNull();
        timing.TestpassType.ShouldBe("Unknown");
        timing.TestpassScope.ShouldBe("Unknown");
    }

    [Fact]
    public void Constructor_Runs_RecursivelyMapped()
    {
        var childResult = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { TestpassName = "Child", ExecutionSystem = ExecutionSystem.T3C },
            NovaTestpass = new NovaTestpass { StatusName = "Completed", PassRate = 100, ExecutionRate = 100 },
            IsCurrentRun = true,
        };

        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { TestpassName = "Parent", ExecutionSystem = ExecutionSystem.T3C },
            NovaTestpass = new NovaTestpass { StatusName = "Completed", PassRate = 100, ExecutionRate = 100 },
            Runs = [childResult],
        };

        var timing = new TestpassTimingData(result);

        timing.Runs.Count.ShouldBe(1);
        timing.Runs[0].TestpassName.ShouldBe("Child");
        timing.Runs[0].IsCurrentRun.ShouldBeTrue();
    }

    #endregion

    #region Computed Properties

    [Fact]
    public void Duration_BothTimesSet_ReturnsSpan()
    {
        var start = new DateTimeOffset(2024, 6, 1, 10, 0, 0, TimeSpan.Zero);
        var end = new DateTimeOffset(2024, 6, 1, 11, 30, 0, TimeSpan.Zero);
        var result = CreateCloudTestResult(execStart: start, completedTime: end);

        var timing = new TestpassTimingData(result);

        timing.Duration.ShouldBe(TimeSpan.FromMinutes(90));
    }

    [Fact]
    public void Duration_MissingTime_ReturnsNull()
    {
        var result = CreateCloudTestResult(execStart: DateTimeOffset.UtcNow, completedTime: null);

        var timing = new TestpassTimingData(result);

        timing.Duration.ShouldBeNull();
    }

    [Fact]
    public void IsPassed_ResultContainsPassed_ReturnsTrue()
    {
        var result = CreateCloudTestResult(sessionResult: "Passed");
        var timing = new TestpassTimingData(result);
        timing.IsPassed.ShouldBeTrue();
    }

    [Fact]
    public void IsFailed_NotPassedNotRunning_ReturnsTrue()
    {
        var result = CreateCloudTestResult(sessionStatus: "Completed", sessionResult: "Failed");
        var timing = new TestpassTimingData(result);
        timing.IsFailed.ShouldBeTrue();
    }

    [Theory]
    [InlineData("Running")]
    [InlineData("InProgress")]
    [InlineData("Queued")]
    public void IsRunning_RunningStatus_ReturnsTrue(string status)
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass
            {
                ExecutionSystem = ExecutionSystem.CloudTest,
                CloudTestTenant = "https://cloudtest.microsoft.com",
                CloudTestSessionId = Guid.NewGuid(),
            },
            TestSession = new TestSession { Status = status, Result = "Unknown" },
        };

        var timing = new TestpassTimingData(result);
        timing.IsRunning.ShouldBeTrue();
    }

    [Fact]
    public void IsRunning_CompletedStatus_ReturnsFalse()
    {
        var result = CreateCloudTestResult(sessionStatus: "Completed", sessionResult: "Passed");
        var timing = new TestpassTimingData(result);
        timing.IsRunning.ShouldBeFalse();
    }

    [Fact]
    public void IsNovaOnly_NoSummary_ReturnsTrue()
    {
        var result = new AggregatedTestpassResult
        {
            NovaTestpass = new NovaTestpass { StatusName = "Completed", PassRate = 100, ExecutionRate = 100 },
        };

        var timing = new TestpassTimingData(result);
        timing.IsNovaOnly.ShouldBeTrue();
    }

    [Fact]
    public void IsNovaOnly_HasSummary_ReturnsFalse()
    {
        var result = CreateNovaResult();
        var timing = new TestpassTimingData(result);
        timing.IsNovaOnly.ShouldBeFalse();
    }

    [Fact]
    public void IsCurrentRun_Propagated()
    {
        var result = CreateNovaResult();
        result.IsCurrentRun = true;

        var timing = new TestpassTimingData(result);
        timing.IsCurrentRun.ShouldBeTrue();
    }

    #endregion

    #region URLs

    [Fact]
    public void DetailsUrl_NovaTestpass_HasNovaUrl()
    {
        var guid = Guid.NewGuid();
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { ExecutionSystem = ExecutionSystem.T3C },
            NovaTestpass = new NovaTestpass { TestPassGuid = guid, StatusName = "Completed", PassRate = 100, ExecutionRate = 100 },
        };

        var timing = new TestpassTimingData(result);
        timing.DetailsUrl.ShouldContain(guid.ToString());
        timing.DetailsUrl.ShouldContain("es.microsoft.com/Nova");
    }

    [Fact]
    public void SchedulePipelineUrl_NoAdoTenant_Empty()
    {
        var result = CreateNovaResult();
        result.TestpassSummary!.AzureDevOpsTenant = null;

        var timing = new TestpassTimingData(result);
        timing.SchedulePipelineUrl.ShouldBeEmpty();
    }

    #endregion
}
