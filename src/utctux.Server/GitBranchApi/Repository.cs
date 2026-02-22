using System.Text.Json.Serialization;

namespace utctux.Server.GitBranchApi;

public record Repository(
    [property: JsonPropertyName("Id")] string? Id,
    [property: JsonPropertyName("VstsInstance")] string? VstsInstance,
    [property: JsonPropertyName("VstsAccountName")] string? VstsAccountName,
    [property: JsonPropertyName("VstsProjectName")] string? VstsProjectName,
    [property: JsonPropertyName("VstsRepositoryName")] string? VstsRepositoryName);
