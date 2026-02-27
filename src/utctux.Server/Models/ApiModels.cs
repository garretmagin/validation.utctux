namespace utctux.Server.Models;

/// <summary>
/// Build identification and status information.
/// </summary>
public record BuildInfo
{
    public string? Fqbn { get; init; }
    public string? Branch { get; init; }
    public int? BuildId { get; init; }
    public DateTimeOffset? BuildStartTime { get; init; }
    public string? Status { get; init; }
}

/// <summary>
/// Full test results response for a build, including summary counts and testpass details.
/// </summary>
public record TestResultsResponse
{
    public BuildInfo? BuildInfo { get; init; }
    public TestResultsSummary Summary { get; init; } = new();
    public IReadOnlyList<TestpassDto> Testpasses { get; init; } = [];
    public TimeRangeDto? TimeRange { get; init; }
}

public record TestResultsSummary
{
    public int Total { get; init; }
    public int Passed { get; init; }
    public int Failed { get; init; }
    public int Running { get; init; }
    public int Unknown { get; init; }
}

public record TimeRangeDto
{
    public DateTimeOffset? Min { get; init; }
    public DateTimeOffset? Max { get; init; }
}

/// <summary>
/// Testpass data transfer object for API responses.
/// </summary>
public record TestpassDto
{
    public string? Name { get; init; }
    public string? Requirement { get; init; }
    public string? ExecutionSystem { get; init; }
    public string? Status { get; init; }
    public string? Result { get; init; }
    public DateTimeOffset? StartTime { get; init; }
    public DateTimeOffset? EndTime { get; init; }
    public TimeSpan? Duration { get; init; }
    public string? DetailsUrl { get; init; }
    public string? SchedulePipelineUrl { get; init; }
    public string? Type { get; init; }
    public string? Scope { get; init; }
    public IReadOnlyList<ChunkAvailabilityInfo> DependentChunks { get; init; } = [];
    public bool IsRerun { get; init; }
    public bool IsCurrentRun { get; init; }
    public string? RerunReason { get; init; }
    public string? RerunOwner { get; init; }
    public IReadOnlyList<TestpassDto> Runs { get; init; } = [];
}

/// <summary>
/// Response for polling job status during async data loading.
/// </summary>
public record JobStatusResponse
{
    public string Status { get; init; } = "Unknown";
    public IReadOnlyList<ProgressMessage> Progress { get; init; } = [];
    public DateTimeOffset? CachedAt { get; init; }
    public string? Error { get; init; }
}

/// <summary>
/// A timestamped progress message for long-running operations.
/// </summary>
public record ProgressMessage
{
    public DateTimeOffset Timestamp { get; init; }
    public string Message { get; init; } = string.Empty;
}
