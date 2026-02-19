namespace utctux.Server.Models;

/// <summary>
/// Represents a Nova/T3 testpass with execution details and results.
/// </summary>
public record NovaTestpass
{
    public long TestPassId { get; init; }
    public string? TestPassName { get; init; }
    public Guid TestPassGuid { get; init; }
    public DateTimeOffset? StartTime { get; init; }
    public DateTimeOffset? EndTime { get; init; }
    public string? StatusName { get; init; }
    public double PassRate { get; init; }
    public double ExecutionRate { get; init; }
    public string? Comments { get; init; }
    public List<NovaBug> Bugs { get; init; } = [];
    public Uri? ReportingUrl { get; init; }
}

/// <summary>
/// Represents a bug associated with a Nova testpass.
/// </summary>
public record NovaBug
{
    public int Number { get; init; }
    public string? DatabaseName { get; init; }
    public Uri? Url { get; init; }
}

/// <summary>
/// Detailed summary results for a Nova test pass.
/// </summary>
public class NovaTestpassSummary
{
    public int Id { get; set; }
    public string? TestpassGuid { get; set; }
    public string? Name { get; set; }
    public string? UniqueKey { get; set; }
    public string? BranchName { get; set; }
    public string? FullBuildNumber { get; set; }
    public string? BuildString { get; set; }
    public string? Type { get; set; }
    public string? TestpassCriteria { get; set; }
    public string? TestpassScope { get; set; }
    public string? ScheduleIntent { get; set; }
    public string? TestpassRequirement { get; set; }
    public bool IsOfficial { get; set; }
    public bool IsValid { get; set; }
    public bool IsLocked { get; set; }
    public bool IsExternal { get; set; }
    public bool IsMergeable { get; set; }
    public bool CanBePurged { get; set; }
    public bool HasReruns { get; set; }
    public DateTimeOffset? StartTime { get; set; }
    public DateTimeOffset? EndTime { get; set; }
    public int DurationInSeconds { get; set; }
    public double PassRate { get; set; }
    public double ExecutionRate { get; set; }
    public int TotalTestCaseCount { get; set; }
    public int PassedTestCaseCount { get; set; }
    public int FailedTestCaseCount { get; set; }
    public int SkippedTestCaseCount { get; set; }
    public int WarnedTestCaseCount { get; set; }
    public int BlockedTestCaseCount { get; set; }
    public int TotalTeuCount { get; set; }
    public int CompletedTeuCount { get; set; }
    public int InProgressTeuCount { get; set; }
    public int FailedTeuCount { get; set; }
    public int CancelledTeuCount { get; set; }
    public int FilteredTeuCount { get; set; }
    public int WaitingTeuCount { get; set; }
    public int NotScheduledTeuCount { get; set; }
    public int FailureCount { get; set; }
    public int BugCount { get; set; }
    public int ActiveBugCount { get; set; }
    public int ResolvedBugCount { get; set; }
    public int ClosedBugCount { get; set; }
    public bool TeusUploaded { get; set; }
    public string? Comments { get; set; }
    public DateTimeOffset? LastUpdateTime { get; set; }
    public string? Duration { get; set; }
    public int TotalRunTestCaseCount { get; set; }
    public double CompletedTeuPercent { get; set; }
    public string? ReportingUrl { get; set; }
    public int PreviousTestPassId { get; set; }
    public int NextTestPassId { get; set; }
    public DateTimeOffset? ExecutionEndTime { get; set; }
    public string? ExecutionStatus { get; set; }
    public string? BugIds { get; set; }
    public bool IsGradable { get; set; }
    public bool IsGraded { get; set; }
    public int TotalGraded { get; set; }
    public int TotalGradable { get; set; }
    public DateTimeOffset? GradeStartTime { get; set; }
    public DateTimeOffset? GradeCompleteTime { get; set; }
}

/// <summary>
/// Represents the parent/child rerun relationships for a Nova test pass.
/// </summary>
public record NovaTestPassFamily
{
    public string? TestPassGuid { get; init; }
    public int TestPassId { get; init; }
    public List<int> ParentTestPassIds { get; init; } = [];
    public List<int> ChildTestPassIds { get; init; } = [];
}
