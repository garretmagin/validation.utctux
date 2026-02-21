using UtctClient.Data.Common;

namespace utctux.Server.Models;

/// <summary>
/// Holds extracted timing data from <see cref="AggregatedTestpassResult"/> for visualization.
/// </summary>
public class TestpassTimingData
{
    public string TestpassName { get; }
    public string Requirement { get; }
    public ExecutionSystem? ExecutionSystem { get; }
    public string Status { get; }
    public DateTimeOffset? StartTime { get; }
    public DateTimeOffset? EndTime { get; }
    public string DetailsUrl { get; }
    public string TestpassType { get; }
    public string TestpassScope { get; }
    public string Result { get; }
    public IReadOnlyList<ChunkAvailabilityInfo> DependentChunks { get; }
    public string? CurrentRerunReason { get; }
    public string? CurrentRerunOwner { get; }
    public bool IsRerun { get; }
    public IReadOnlyList<TestpassTimingData> Runs { get; }
    public string SchedulePipelineUrl { get; }

    public TimeSpan? Duration => StartTime.HasValue && EndTime.HasValue
        ? EndTime.Value - StartTime.Value
        : null;

    public bool IsPassed => Result.Contains("Passed");
    public bool IsFailed => !IsPassed && !IsRunning;
    public bool IsRunning => Status is "Running" or "InProgress" or "Queued";

    /// <summary>
    /// True when the Run entry was discovered via Nova only (no UTCT TestpassSummary).
    /// </summary>
    public bool IsNovaOnly { get; }

    /// <summary>
    /// True when this entry in a Runs list represents the testpass that owns the list.
    /// </summary>
    public bool IsCurrentRun { get; }

    public TestpassTimingData(AggregatedTestpassResult result)
    {
        var hasSummary = result.TestpassSummary is not null;

        TestpassName = result.TestpassSummary?.TestpassName
            ?? result.NovaTestpass?.TestPassName
            ?? "Unknown";
        Requirement = result.TestpassSummary?.Requirement ?? "Unknown";
        ExecutionSystem = result.TestpassSummary?.ExecutionSystem;
        Status = result.Status ?? "Unknown";
        TestpassType = result.TestpassSummary?.Type ?? "Unknown";
        TestpassScope = result.TestpassSummary?.Scope ?? "Unknown";
        Result = result.Result ?? "Unknown";
        DependentChunks = result.ChunkAvailability ?? [];
        CurrentRerunReason = result.CurrentRerunReason;
        CurrentRerunOwner = result.CurrentRerunOwner;
        IsRerun = result.TestpassSummary?.IsRerun ?? false;
        IsNovaOnly = !hasSummary;
        IsCurrentRun = result.IsCurrentRun;
        Runs = (result.Runs ?? []).Select(r => new TestpassTimingData(r)).ToList();

        DetailsUrl = result.ExecutionSystemDetailsUri?.ToString() ?? "";

        SchedulePipelineUrl = result.TestpassSummary?.AzureDevOpsTenant is not null
            ? result.TestpassSummary.AzureDevOpsTaskUri?.ToString() ?? ""
            : "";

        if (result.TestpassSummary?.ExecutionSystem == UtctClient.Data.Common.ExecutionSystem.CloudTest && result.TestSession is not null)
        {
            StartTime = result.TestSession.SessionTimelineData?.ExecutionStartTime;
            EndTime = result.TestSession.SessionTimelineData?.CompletedTime;
        }
        else if ((result.TestpassSummary?.ExecutionSystem == UtctClient.Data.Common.ExecutionSystem.T3C ||
                  result.TestpassSummary?.ExecutionSystem == UtctClient.Data.Common.ExecutionSystem.T3) &&
                 result.NovaTestpass is not null)
        {
            StartTime = result.NovaTestpass.StartTime;
            EndTime = result.NovaTestpass.EndTime;
        }
        else if (!hasSummary && result.NovaTestpass is not null)
        {
            StartTime = result.NovaTestpass.StartTime;
            EndTime = result.NovaTestpass.EndTime;
        }
    }
}
