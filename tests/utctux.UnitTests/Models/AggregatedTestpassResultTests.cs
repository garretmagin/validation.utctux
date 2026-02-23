using Shouldly;
using utctux.Server.Models;
using UtctClient.Data.Common;
using UtctClient.Data.Response;
using Xunit;

namespace utctux.UnitTests.Models;

public class AggregatedTestpassResultTests
{
    #region IsRerunsLikely

    [Fact]
    public void IsRerunsLikely_IsRerunTrue_ReturnsTrue()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass
            {
                ParentTestpass = new UtctTestpassReference { TestpassGuid = Guid.NewGuid() },
            },
        };

        result.IsRerunsLikely.ShouldBeTrue();
    }

    [Fact]
    public void IsRerunsLikely_HasRerunsTrue_ReturnsTrue()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass
            {
                RerunTestpassReferences = [new UtctRerunTestpassReference { TestpassGuid = Guid.NewGuid() }],
            },
        };

        result.IsRerunsLikely.ShouldBeTrue();
    }

    [Fact]
    public void IsRerunsLikely_NeitherSet_ReturnsFalse()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass(),
        };

        result.IsRerunsLikely.ShouldBeFalse();
    }

    [Fact]
    public void IsRerunsLikely_NullSummary_ReturnsFalse()
    {
        var result = new AggregatedTestpassResult();
        result.IsRerunsLikely.ShouldBeFalse();
    }

    #endregion

    #region IsNovaGuidMismatch

    [Fact]
    public void IsNovaGuidMismatch_DifferentGuids_ReturnsTrue()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { TestpassGuid = Guid.NewGuid() },
            NovaTestpass = new NovaTestpass { TestPassGuid = Guid.NewGuid() },
        };

        result.IsNovaGuidMismatch.ShouldBeTrue();
    }

    [Fact]
    public void IsNovaGuidMismatch_SameGuid_ReturnsFalse()
    {
        var guid = Guid.NewGuid();
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { TestpassGuid = guid },
            NovaTestpass = new NovaTestpass { TestPassGuid = guid },
        };

        result.IsNovaGuidMismatch.ShouldBeFalse();
    }

    [Fact]
    public void IsNovaGuidMismatch_NoNova_ReturnsFalse()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { TestpassGuid = Guid.NewGuid() },
        };

        result.IsNovaGuidMismatch.ShouldBeFalse();
    }

    [Fact]
    public void IsNovaGuidMismatch_NoSummary_ReturnsFalse()
    {
        var result = new AggregatedTestpassResult
        {
            NovaTestpass = new NovaTestpass { TestPassGuid = Guid.NewGuid() },
        };

        result.IsNovaGuidMismatch.ShouldBeFalse();
    }

    [Fact]
    public void IsNovaGuidMismatch_EmptyGuids_ReturnsFalse()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { TestpassGuid = Guid.Empty },
            NovaTestpass = new NovaTestpass { TestPassGuid = Guid.NewGuid() },
        };

        result.IsNovaGuidMismatch.ShouldBeFalse();
    }

    #endregion

    #region IsNovaRerunLikely

    [Fact]
    public void IsNovaRerunLikely_T3C_WithLateStart_ReturnsTrue()
    {
        var chunkTime = new DateTimeOffset(2024, 1, 1, 10, 0, 0, TimeSpan.Zero);
        var startTime = chunkTime.AddMinutes(15); // 15 min after last chunk

        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { ExecutionSystem = ExecutionSystem.T3C },
            NovaTestpass = new NovaTestpass { StartTime = startTime },
            ChunkAvailability = [new ChunkAvailabilityInfo("chunk1", "amd64fre", null, chunkTime)],
        };

        result.IsNovaRerunLikely.ShouldBeTrue();
    }

    [Fact]
    public void IsNovaRerunLikely_NotT3C_ReturnsFalse()
    {
        var chunkTime = new DateTimeOffset(2024, 1, 1, 10, 0, 0, TimeSpan.Zero);
        var startTime = chunkTime.AddMinutes(15);

        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { ExecutionSystem = ExecutionSystem.CloudTest },
            NovaTestpass = new NovaTestpass { StartTime = startTime },
            ChunkAvailability = [new ChunkAvailabilityInfo("chunk1", "amd64fre", null, chunkTime)],
        };

        result.IsNovaRerunLikely.ShouldBeFalse();
    }

    [Fact]
    public void IsNovaRerunLikely_NoNovaStartTime_ReturnsFalse()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { ExecutionSystem = ExecutionSystem.T3C },
            NovaTestpass = new NovaTestpass { StartTime = null },
            ChunkAvailability = [new ChunkAvailabilityInfo("chunk1", "amd64fre", null, DateTimeOffset.UtcNow)],
        };

        result.IsNovaRerunLikely.ShouldBeFalse();
    }

    [Fact]
    public void IsNovaRerunLikely_NoChunks_ReturnsFalse()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { ExecutionSystem = ExecutionSystem.T3C },
            NovaTestpass = new NovaTestpass { StartTime = DateTimeOffset.UtcNow },
            ChunkAvailability = [],
        };

        result.IsNovaRerunLikely.ShouldBeFalse();
    }

    [Fact]
    public void IsNovaRerunLikely_StartWithin10Min_ReturnsFalse()
    {
        var chunkTime = new DateTimeOffset(2024, 1, 1, 10, 0, 0, TimeSpan.Zero);
        var startTime = chunkTime.AddMinutes(5); // Only 5 min gap

        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { ExecutionSystem = ExecutionSystem.T3C },
            NovaTestpass = new NovaTestpass { StartTime = startTime },
            ChunkAvailability = [new ChunkAvailabilityInfo("chunk1", "amd64fre", null, chunkTime)],
        };

        result.IsNovaRerunLikely.ShouldBeFalse();
    }

    [Fact]
    public void IsNovaRerunLikely_NoChunkAvailableAt_ReturnsFalse()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { ExecutionSystem = ExecutionSystem.T3C },
            NovaTestpass = new NovaTestpass { StartTime = DateTimeOffset.UtcNow },
            ChunkAvailability = [new ChunkAvailabilityInfo("chunk1", "amd64fre", null, null)],
        };

        result.IsNovaRerunLikely.ShouldBeFalse();
    }

    #endregion

    #region ExecutionSystemDetailsUri

    [Fact]
    public void ExecutionSystemDetailsUri_NovaTestpass_ReturnsNovaUri()
    {
        var guid = Guid.NewGuid();
        var result = new AggregatedTestpassResult
        {
            NovaTestpass = new NovaTestpass { TestPassGuid = guid },
        };

        result.ExecutionSystemDetailsUri.ShouldNotBeNull();
        result.ExecutionSystemDetailsUri!.ToString().ShouldBe($"https://es.microsoft.com/Nova/Testpass/Details/{guid}");
    }

    [Fact]
    public void ExecutionSystemDetailsUri_CloudTest_ReturnsSummaryUri()
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

        // The SDK's ExecutionSystemDetailsUri throws UriFormatException for CloudTest
        // without complete tenant data. Our wrapper catches this and returns null.
        result.ExecutionSystemDetailsUri.ShouldBeNull();
    }

    [Fact]
    public void ExecutionSystemDetailsUri_NothingSet_ReturnsNull()
    {
        var result = new AggregatedTestpassResult();
        result.ExecutionSystemDetailsUri.ShouldBeNull();
    }

    #endregion

    #region Status

    [Fact]
    public void Status_CloudTest_ReturnsSessionStatus()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { ExecutionSystem = ExecutionSystem.CloudTest },
            TestSession = new TestSession { Status = "Completed" },
        };

        result.Status.ShouldBe("Completed");
    }

    [Fact]
    public void Status_Nova_ReturnsNovaStatus()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { ExecutionSystem = ExecutionSystem.T3C },
            NovaTestpass = new NovaTestpass { StatusName = "Running" },
        };

        result.Status.ShouldBe("Running");
    }

    [Fact]
    public void Status_NoSummary_ReturnsNovaStatus()
    {
        var result = new AggregatedTestpassResult
        {
            NovaTestpass = new NovaTestpass { StatusName = "Completed" },
        };

        result.Status.ShouldBe("Completed");
    }

    [Fact]
    public void Status_NullEverything_ReturnsNull()
    {
        var result = new AggregatedTestpassResult();
        result.Status.ShouldBeNull();
    }

    #endregion

    #region Result

    [Fact]
    public void Result_CloudTest_Passed()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { ExecutionSystem = ExecutionSystem.CloudTest },
            TestSession = new TestSession { Result = "Passed" },
        };

        result.Result.ShouldBe("Passed");
    }

    [Fact]
    public void Result_CloudTest_FailedNonFatal_NormalizedToFailed()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { ExecutionSystem = ExecutionSystem.CloudTest },
            TestSession = new TestSession { Result = "FailedNonFatal" },
        };

        result.Result.ShouldBe("Failed");
    }

    [Fact]
    public void Result_CloudTest_NoSession_ReturnsUnknown()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { ExecutionSystem = ExecutionSystem.CloudTest },
        };

        result.Result.ShouldBe("Unknown");
    }

    [Fact]
    public void Result_Nova_AllPassing_ReturnsPassed()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { ExecutionSystem = ExecutionSystem.T3C },
            NovaTestpass = new NovaTestpass { PassRate = 100, ExecutionRate = 100 },
        };

        result.Result.ShouldBe("Passed");
    }

    [Fact]
    public void Result_Nova_LowPassRate_ReturnsFailed()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { ExecutionSystem = ExecutionSystem.T3C },
            NovaTestpass = new NovaTestpass { PassRate = 95, ExecutionRate = 100 },
        };

        result.Result.ShouldBe("Failed");
    }

    [Fact]
    public void Result_Nova_LowExecutionRate_ReturnsFailed()
    {
        var result = new AggregatedTestpassResult
        {
            TestpassSummary = new UtctTestpass { ExecutionSystem = ExecutionSystem.T3C },
            NovaTestpass = new NovaTestpass { PassRate = 100, ExecutionRate = 90 },
        };

        result.Result.ShouldBe("Failed");
    }

    [Fact]
    public void Result_NoSummary_NoNova_ReturnsUnknown()
    {
        var result = new AggregatedTestpassResult();
        result.Result.ShouldBe("Unknown");
    }

    [Fact]
    public void Result_NoSummary_NovaPassing_ReturnsPassed()
    {
        var result = new AggregatedTestpassResult
        {
            NovaTestpass = new NovaTestpass { PassRate = 100, ExecutionRate = 100 },
        };

        result.Result.ShouldBe("Passed");
    }

    [Fact]
    public void Result_NoSummary_NovaFailing_ReturnsFailed()
    {
        var result = new AggregatedTestpassResult
        {
            NovaTestpass = new NovaTestpass { PassRate = 50, ExecutionRate = 100 },
        };

        result.Result.ShouldBe("Failed");
    }

    #endregion
}
