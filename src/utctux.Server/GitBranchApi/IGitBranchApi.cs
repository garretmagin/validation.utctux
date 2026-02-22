using Refit;

namespace utctux.Server.GitBranchApi;

/// <summary>
/// Refit interface for the OS GitBranch API.
/// </summary>
[Headers("Accept: application/json")]
public interface IGitBranchApi
{
    [Get("/branches/matchingQuery")]
    Task<BranchDefinitionResponse[]> GetBranchesByFieldAsync(
        [AliasAs("fieldReferenceName")] string fieldReferenceName,
        [AliasAs("fieldValue")] string fieldValue);
}

/// <summary>
/// Constants for the GitBranch API configuration.
/// </summary>
public static class GitBranchApiConstants
{
    public static readonly Uri BaseUrl = new("https://os-branch-api.azurefd.net/api/v1/");
    public const string Scope = "https://mspmecloud.onmicrosoft.com/os-branch-api/.default";
}
