namespace utctux.Server.Models;

/// <summary>
/// Represents the availability timing of a chunk dependency relative to the build start.
/// </summary>
public record ChunkAvailabilityInfo(
    string ChunkName,
    string Flavor,
    TimeSpan? AvailableAfterBuildStart,
    DateTimeOffset? AvailableAt = null);
