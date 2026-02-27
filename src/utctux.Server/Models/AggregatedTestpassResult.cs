using UtctClient.Data.Common;
using UtctClient.Data.Response;

namespace utctux.Server.Models;

/// <summary>
/// Aggregates data from multiple sources (UTCT, CloudTest, Nova) for a single testpass.
/// </summary>
public class AggregatedTestpassResult
{
    public UtctTestpass? TestpassSummary { get; set; }
    public TestSession? TestSession { get; set; }
    public NovaTestpass? NovaTestpass { get; set; }
    public IReadOnlyList<NovaBug> Bugs { get; set; } = [];
    public IReadOnlyList<ChunkAvailabilityInfo> ChunkAvailability { get; set; } = [];

    /// <summary>
    /// The reason this testpass was rerun, extracted from the parent's RerunTestpassReferences.
    /// Null if this testpass is the original (not a rerun).
    /// </summary>
    public string? CurrentRerunReason { get; set; }

    /// <summary>
    /// The user who scheduled this rerun, extracted from the parent's RerunTestpassReferences.
    /// Null if this testpass is the original (not a rerun).
    /// </summary>
    public string? CurrentRerunOwner { get; set; }

    /// <summary>
    /// All runs for this testpass including self (parent original, siblings, Nova-only reruns).
    /// Each entry is a fully hydrated <see cref="AggregatedTestpassResult"/>
    /// with its own <see cref="Runs"/> list always empty (flat, no recursion).
    /// The entry representing the current testpass has <see cref="IsCurrentRun"/> set to true.
    /// </summary>
    public IReadOnlyList<AggregatedTestpassResult> Runs { get; set; } = [];

    /// <summary>
    /// True when this entry in a Runs list represents the testpass that owns the list.
    /// </summary>
    public bool IsCurrentRun { get; set; }

    /// <summary>
    /// Whether this testpass is a rerun of another testpass or has reruns itself,
    /// indicating that UTCT-tracked run data should be resolved.
    /// </summary>
    public bool IsRerunsLikely => TestpassSummary?.IsRerun == true || TestpassSummary?.HasReruns == true;

    /// <summary>
    /// Whether the UTCT and Nova GUIDs disagree, indicating that Nova returned
    /// rerun data (new GUID) while UTCT still references the original schedule.
    /// This is a definitive signal that a Nova-side rerun occurred outside UTCT tracking.
    /// </summary>
    public bool IsNovaGuidMismatch =>
        TestpassSummary is not null &&
        NovaTestpass is not null &&
        TestpassSummary.TestpassGuid != Guid.Empty &&
        NovaTestpass.TestPassGuid != Guid.Empty &&
        TestpassSummary.TestpassGuid != NovaTestpass.TestPassGuid;

    /// <summary>
    /// Whether this testpass likely has Nova-only reruns not tracked by UTCT.
    /// True when the testpass is T3C, has a Nova start time, has chunk availability data,
    /// and started 10+ minutes after the latest dependency became available.
    /// </summary>
    public bool IsNovaRerunLikely
    {
        get
        {
            if (TestpassSummary?.ExecutionSystem != ExecutionSystem.T3C)
            {
                return false;
            }

            if (NovaTestpass?.StartTime is not { } startTime)
            {
                return false;
            }

            if (ChunkAvailability is null || ChunkAvailability.Count == 0)
            {
                return false;
            }

            DateTimeOffset? latestAvailableAt = null;
            foreach (var chunk in ChunkAvailability)
            {
                if (chunk.AvailableAt.HasValue)
                {
                    if (!latestAvailableAt.HasValue || chunk.AvailableAt.Value > latestAvailableAt.Value)
                    {
                        latestAvailableAt = chunk.AvailableAt.Value;
                    }
                }
            }

            if (!latestAvailableAt.HasValue)
            {
                return false;
            }

            var delayAfterDeps = startTime - latestAvailableAt.Value;
            return delayAfterDeps >= TimeSpan.FromMinutes(10);
        }
    }

    /// <summary>
    /// The URI to view details about this testpass in the execution system.
    /// For T3C/Nova testpasses, prefers <see cref="NovaTestpass.TestPassGuid"/> because
    /// the UTCT API's GUID can point at the original run rather than the actual rerun.
    /// For CloudTest, uses <see cref="TestpassSummary"/>'s computed URI.
    /// </summary>
    public Uri? ExecutionSystemDetailsUri
    {
        get
        {
            if (NovaTestpass is not null)
            {
                return new Uri($"https://es.microsoft.com/Nova/Testpass/Details/{NovaTestpass.TestPassGuid}");
            }

            try
            {
                if (TestpassSummary?.ExecutionSystemDetailsUri is not null)
                {
                    return TestpassSummary.ExecutionSystemDetailsUri;
                }
            }
            catch (UriFormatException)
            {
                // SDK may throw if CloudTest tenant data is incomplete
            }

            return null;
        }
    }

    public string? Status
    {
        get
        {
            if (TestpassSummary is null)
            {
                return NovaTestpass?.StatusName;
            }

            if (TestpassSummary.ExecutionSystem == ExecutionSystem.CloudTest)
            {
                return TestSession?.Status;
            }
            else
            {
                return NovaTestpass?.StatusName;
            }
        }
    }

    private static bool IsInProgressStatus(string? status) =>
        status is "Running" or "InProgress" or "Queued";

    public string? Result
    {
        get
        {
            if (TestpassSummary is null)
            {
                if (NovaTestpass is null)
                {
                    return "Unknown";
                }

                // Don't report incomplete rates as failure while the testpass is still running
                if (IsInProgressStatus(NovaTestpass.StatusName))
                {
                    return "InProgress";
                }

                return NovaTestpass.PassRate < 100 || NovaTestpass.ExecutionRate < 100 ? "Failed" : "Passed";
            }

            if (TestpassSummary.ExecutionSystem == ExecutionSystem.CloudTest)
            {
                var ctResult = TestSession?.Result ?? "Unknown";
                // CloudTest "FailedNonFatal" is still a failure — normalize to "Failed"
                return string.Equals(ctResult, "FailedNonFatal", StringComparison.OrdinalIgnoreCase)
                    ? "Failed"
                    : ctResult;
            }
            else
            {
                if (NovaTestpass is null)
                {
                    return "Unknown";
                }

                // Don't report incomplete rates as failure while the testpass is still running
                if (IsInProgressStatus(NovaTestpass.StatusName))
                {
                    return "InProgress";
                }

                return NovaTestpass.PassRate < 100 || NovaTestpass.ExecutionRate < 100 ? "Failed" : "Passed";
            }
        }
    }
}
