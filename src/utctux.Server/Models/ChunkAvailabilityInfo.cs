namespace utctux.Server.Models;

/// <summary>
/// Represents the availability timing of a chunk dependency relative to the build start,
/// with optional production start time and sub-dependencies from the media creation graph.
/// </summary>
public record ChunkAvailabilityInfo(
    string ChunkName,
    string Flavor,
    TimeSpan? AvailableAfterBuildStart,
    DateTimeOffset? AvailableAt = null,
    TimeSpan? StartedAfterBuildStart = null,
    DateTimeOffset? StartedAt = null,
    IReadOnlyList<ChunkAvailabilityInfo>? SubDependencies = null,
    bool IsCriticalPath = false,
    string? MediaCreationUrl = null);
