using System.Text.Json.Serialization;
using Refit;

namespace utctux.Server.Services;

/// <summary>
/// Refit interface for the Media Creation API.
/// </summary>
public interface IMediaCreationApi
{
    [Get("/api/v2.0/requestGraphs/search")]
    Task<IReadOnlyList<RequestGraphSearchResult>> SearchRequestGraphsAsync(
        [AliasAs("buildGuid")] Guid buildGuid);

    [Get("/api/v2.0/fullRequestGraphs/{graphId}")]
    Task<FullRequestGraph> GetFullRequestGraphAsync(
        Guid graphId,
        [AliasAs("includeExternals")] bool includeExternals = true,
        [AliasAs("includeDependencyRelations")] bool includeDependencyRelations = true);
}

// --- Response DTOs ---

public record RequestGraphSearchResult(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("fqbn")] string Fqbn,
    [property: JsonPropertyName("buildGuid")] Guid BuildGuid,
    [property: JsonPropertyName("isOfficial")] bool IsOfficial,
    [property: JsonPropertyName("isCanon")] bool IsCanon,
    [property: JsonPropertyName("isSynthetic")] bool IsSynthetic,
    [property: JsonPropertyName("isCancelled")] bool IsCancelled,
    [property: JsonPropertyName("createdTimeUtc")] DateTimeOffset CreatedTimeUtc);

public record FullRequestGraph(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("fqbn")] string? Fqbn,
    [property: JsonPropertyName("buildGuid")] Guid BuildGuid,
    [property: JsonPropertyName("isOfficial")] bool IsOfficial,
    [property: JsonPropertyName("buildableArtifacts")] IReadOnlyList<MediaCreationArtifact>? BuildableArtifacts,
    [property: JsonPropertyName("dependsOnRelations")] Dictionary<string, IReadOnlyList<string>>? DependsOnRelations,
    [property: JsonPropertyName("externalArtifacts")] IReadOnlyList<MediaCreationArtifact>? ExternalArtifacts);

public record MediaCreationArtifact(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("flavor")] string? Flavor,
    [property: JsonPropertyName("mediaType")] string? MediaType,
    [property: JsonPropertyName("currentState")] string? CurrentState,
    [property: JsonPropertyName("priority")] int Priority,
    [property: JsonPropertyName("artifactExecutionInfo")] MediaCreationExecutionInfo? ArtifactExecutionInfo);

public record MediaCreationExecutionInfo(
    [property: JsonPropertyName("createTimeUtc")] DateTimeOffset? CreateTimeUtc,
    [property: JsonPropertyName("lastModifiedTimeUtc")] DateTimeOffset? LastModifiedTimeUtc,
    [property: JsonPropertyName("startTimeUtc")] DateTimeOffset? StartTimeUtc,
    [property: JsonPropertyName("endTimeUtc")] DateTimeOffset? EndTimeUtc);
