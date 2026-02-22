using System.Text.Json.Serialization;

namespace utctux.Server.GitBranchApi;

public record BranchDefinitionResponse(
    [property: JsonPropertyName("BranchName")] string? BranchName,
    [property: JsonPropertyName("Definition")] Definition? Definition,
    [property: JsonPropertyName("Fields")] Dictionary<string, string>? Fields);
