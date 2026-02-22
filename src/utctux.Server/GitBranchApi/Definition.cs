using System.Text.Json.Serialization;

namespace utctux.Server.GitBranchApi;

public record Definition(
    [property: JsonPropertyName("DefinitionName")] string? DefinitionName,
    [property: JsonPropertyName("Repository")] Repository? Repository);
