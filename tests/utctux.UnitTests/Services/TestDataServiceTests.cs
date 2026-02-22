using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Shouldly;
using utctux.Server.Models;
using utctux.Server.Services;
using UtctClient.Data.Common;
using UtctClient.Data.Response;
using Xunit;

namespace utctux.UnitTests.Services;

public class TestDataServiceTests
{
    private static TestDataService CreateService(
        Mock<AuthService>? authMock = null,
        Mock<CloudTestService>? cloudTestMock = null,
        Mock<NovaService>? novaMock = null)
    {
        authMock ??= new Mock<AuthService>(
            NullLogger<AuthService>.Instance,
            Microsoft.Extensions.Options.Options.Create(new UtctAuthOptions()));
        cloudTestMock ??= new Mock<CloudTestService>(authMock.Object);
        novaMock ??= new Mock<NovaService>(authMock.Object, NullLogger<NovaService>.Instance);

        return new TestDataService(
            authMock.Object,
            cloudTestMock.Object,
            novaMock.Object,
            NullLogger<TestDataService>.Instance);
    }

    #region ExtractOrganizationName

    [Fact]
    public void ExtractOrganizationName_Uri_ReturnsOrgName()
    {
        var result = TestDataService.ExtractOrganizationName("https://dev.azure.com/myorg/myproject");
        result.ShouldBe("myorg");
    }

    [Fact]
    public void ExtractOrganizationName_PlainName_ReturnsSame()
    {
        var result = TestDataService.ExtractOrganizationName("myorg");
        result.ShouldBe("myorg");
    }

    [Fact]
    public void ExtractOrganizationName_VisualStudioComUri_ReturnsOrgName()
    {
        var result = TestDataService.ExtractOrganizationName("https://myorg.visualstudio.com/myproject");
        result.ShouldBe("myorg");
    }

    #endregion

    #region AggregateResults

    [Fact]
    public void AggregateResults_CloudTestSession_MatchedByDisplayName()
    {
        var svc = CreateService();

        var utctTestpasses = new List<UtctTestpass>
        {
            new()
            {
                TestpassName = "TestPass-A",
                ExecutionSystem = ExecutionSystem.CloudTest,
            },
        };

        var sessions = new List<TestSession>
        {
            new()
            {
                TestSessionId = Guid.NewGuid(),
                Status = "Completed",
                Result = "Passed",
                TestSessionRequest = new TestSessionRequest { DisplayName = "TestPass-A" },
                SessionTimelineData = new SessionTimelineData
                {
                    QueuedTime = DateTimeOffset.UtcNow,
                },
            },
        };

        var results = svc.AggregateResults(utctTestpasses, sessions, [], new());

        results.Count.ShouldBe(1);
        results[0].TestSession.ShouldNotBeNull();
        results[0].TestSession!.Result.ShouldBe("Passed");
    }

    [Fact]
    public void AggregateResults_CloudTestSession_UsesLatestByQueuedTime()
    {
        var svc = CreateService();

        var utctTestpasses = new List<UtctTestpass>
        {
            new()
            {
                TestpassName = "TestPass-A",
                ExecutionSystem = ExecutionSystem.CloudTest,
            },
        };

        var earlier = DateTimeOffset.UtcNow.AddHours(-2);
        var later = DateTimeOffset.UtcNow.AddHours(-1);

        var sessions = new List<TestSession>
        {
            new()
            {
                TestSessionId = Guid.NewGuid(),
                Status = "Completed",
                Result = "Failed",
                TestSessionRequest = new TestSessionRequest { DisplayName = "TestPass-A" },
                SessionTimelineData = new SessionTimelineData { QueuedTime = earlier },
            },
            new()
            {
                TestSessionId = Guid.NewGuid(),
                Status = "Completed",
                Result = "Passed",
                TestSessionRequest = new TestSessionRequest { DisplayName = "TestPass-A" },
                SessionTimelineData = new SessionTimelineData { QueuedTime = later },
            },
        };

        var results = svc.AggregateResults(utctTestpasses, sessions, [], new());

        results[0].TestSession!.Result.ShouldBe("Passed"); // Should pick later session
    }

    [Fact]
    public void AggregateResults_NovaTestpass_MatchedByName()
    {
        var svc = CreateService();

        var utctTestpasses = new List<UtctTestpass>
        {
            new()
            {
                TestpassName = "NovaPass-1",
                ExecutionSystem = ExecutionSystem.T3C,
            },
        };

        var novaData = new List<NovaTestpass>
        {
            new()
            {
                TestPassName = "NovaPass-1",
                StatusName = "Completed",
                PassRate = 100,
                ExecutionRate = 100,
            },
        };

        var results = svc.AggregateResults(utctTestpasses, [], novaData, new());

        results[0].NovaTestpass.ShouldNotBeNull();
        results[0].NovaTestpass!.TestPassName.ShouldBe("NovaPass-1");
    }

    [Fact]
    public void AggregateResults_NovaTestpass_IncludesBugs()
    {
        var svc = CreateService();

        var utctTestpasses = new List<UtctTestpass>
        {
            new()
            {
                TestpassName = "BuggyPass",
                ExecutionSystem = ExecutionSystem.T3C,
            },
        };

        var novaData = new List<NovaTestpass>
        {
            new()
            {
                TestPassName = "BuggyPass",
                Bugs = [new NovaBug { Number = 12345, DatabaseName = "OSPlat" }],
            },
        };

        var results = svc.AggregateResults(utctTestpasses, [], novaData, new());

        results[0].Bugs.Count.ShouldBe(1);
        results[0].Bugs[0].Number.ShouldBe(12345);
    }

    [Fact]
    public void AggregateResults_ChunkAvailability_Resolved()
    {
        var svc = CreateService();

        var buildGuid = Guid.NewGuid().ToString();
        var utctTestpasses = new List<UtctTestpass>
        {
            new()
            {
                TestpassName = "ChunkPass",
                ExecutionSystem = ExecutionSystem.T3C,
                TestpassDependencies = new List<TestpassDependency>
                {
                    new()
                    {
                        BuildGuid = buildGuid,
                        Drop = "drop1",
                        Flavor = "amd64fre",
                    },
                },
            },
        };

        var chunkLookup = new Dictionary<string, ChunkAvailabilityInfo>
        {
            [$"{buildGuid}:drop1:amd64fre"] = new("drop1", "amd64fre", TimeSpan.FromMinutes(30), DateTimeOffset.UtcNow),
        };

        var results = svc.AggregateResults(utctTestpasses, [], [], chunkLookup);

        results[0].ChunkAvailability.Count.ShouldBe(1);
        results[0].ChunkAvailability[0].ChunkName.ShouldBe("drop1");
    }

    [Fact]
    public void AggregateResults_EmptyInputs_ReturnsEmptyList()
    {
        var svc = CreateService();
        var results = svc.AggregateResults([], [], [], new());
        results.ShouldBeEmpty();
    }

    [Fact]
    public void AggregateResults_OrderedByExecSystemAndName()
    {
        var svc = CreateService();

        var utctTestpasses = new List<UtctTestpass>
        {
            new() { TestpassName = "ZPass", ExecutionSystem = ExecutionSystem.CloudTest },
            new() { TestpassName = "APass", ExecutionSystem = ExecutionSystem.CloudTest },
            new() { TestpassName = "MPass", ExecutionSystem = ExecutionSystem.T3C },
        };

        var results = svc.AggregateResults(utctTestpasses, [], [], new());

        // Sorted by ExecutionSystem + TestpassName
        results[0].TestpassSummary!.TestpassName.ShouldBe("APass");
    }

    #endregion

    #region ResolveChunkAvailability

    [Fact]
    public void ResolveChunkAvailability_NullDependencies_ReturnsEmpty()
    {
        var result = TestDataService.ResolveChunkAvailability(null, new());
        result.ShouldBeEmpty();
    }

    [Fact]
    public void ResolveChunkAvailability_EmptyLookup_ReturnsEmpty()
    {
        var deps = new List<TestpassDependency>
        {
            new() { BuildGuid = "guid", Drop = "drop", Flavor = "flavor" },
        };

        var result = TestDataService.ResolveChunkAvailability(deps, new());
        result.ShouldBeEmpty();
    }

    [Fact]
    public void ResolveChunkAvailability_MatchingKey_ReturnsInfo()
    {
        var deps = new List<TestpassDependency>
        {
            new() { BuildGuid = "guid1", Drop = "drop1", Flavor = "amd64fre" },
        };

        var lookup = new Dictionary<string, ChunkAvailabilityInfo>
        {
            ["guid1:drop1:amd64fre"] = new("drop1", "amd64fre", TimeSpan.FromMinutes(10), DateTimeOffset.UtcNow),
        };

        var result = TestDataService.ResolveChunkAvailability(deps, lookup);

        result.Count.ShouldBe(1);
        result[0].ChunkName.ShouldBe("drop1");
        result[0].Flavor.ShouldBe("amd64fre");
    }

    [Fact]
    public void ResolveChunkAvailability_MissingKey_ReturnsFallback()
    {
        var deps = new List<TestpassDependency>
        {
            new() { BuildGuid = "guid1", Drop = "drop1", Flavor = "amd64fre" },
        };

        var lookup = new Dictionary<string, ChunkAvailabilityInfo>
        {
            ["other:key:here"] = new("other", "flavor", null),
        };

        var result = TestDataService.ResolveChunkAvailability(deps, lookup);

        result.Count.ShouldBe(1);
        result[0].ChunkName.ShouldBe("drop1");
        result[0].AvailableAt.ShouldBeNull();
        result[0].AvailableAfterBuildStart.ShouldBeNull();
    }

    [Fact]
    public void ResolveChunkAvailability_SkipsIncompleteDeps()
    {
        var deps = new List<TestpassDependency>
        {
            new() { BuildGuid = null, Drop = "drop1", Flavor = "amd64fre" },
            new() { BuildGuid = "guid1", Drop = null, Flavor = "amd64fre" },
            new() { BuildGuid = "guid1", Drop = "drop1", Flavor = null },
            new() { BuildGuid = "", Drop = "drop1", Flavor = "amd64fre" },
        };

        var lookup = new Dictionary<string, ChunkAvailabilityInfo>
        {
            ["guid1:drop1:amd64fre"] = new("drop1", "amd64fre", null),
        };

        var result = TestDataService.ResolveChunkAvailability(deps, lookup);
        result.ShouldBeEmpty();
    }

    #endregion
}
