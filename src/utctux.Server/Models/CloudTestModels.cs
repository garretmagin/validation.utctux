namespace utctux.Server.Models;

/// <summary>
/// Represents a CloudTest test session with its status, result, and timeline.
/// </summary>
public class TestSession
{
    public Guid TestSessionId { get; set; }
    public string? Status { get; set; }
    public string? Result { get; set; }
    public TestSessionRequest TestSessionRequest { get; set; } = new();
    public SessionTimelineData SessionTimelineData { get; set; } = new();
}

public class TestSessionRequest
{
    public string? DisplayName { get; set; }
}

public class SessionTimelineData
{
    public DateTimeOffset? QueuedTime { get; set; }
    public DateTimeOffset? ExecutionStartTime { get; set; }
    public DateTimeOffset? CompletedTime { get; set; }
}
