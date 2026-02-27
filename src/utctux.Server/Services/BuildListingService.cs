using System.Globalization;
using Common.DiscoverClient;
using Common.DiscoverClient.SearchParameters;
using utctux.Server.Models;

namespace utctux.Server.Services;

/// <summary>
/// Lists branches via the GitBranch API and builds using the Discover client.
/// </summary>
public class BuildListingService(AuthService authService, GitBranchService gitBranchService, ILogger<BuildListingService> logger)
{
    private const int DefaultBuildCount = 10;
    private const int MaxBuildCount = 100;
    private readonly ILogger<BuildListingService> _logger = logger;

    /// <summary>
    /// Gets all non-defunct branch names from the GitBranch API.
    /// </summary>
    public async Task<string[]> GetBranchesAsync()
    {
        return await gitBranchService.GetBranchNamesAsync();
    }

    /// <summary>
    /// Gets recent builds for the specified branch.
    /// </summary>
    public async Task<BuildInfo[]> GetBuildsForBranchAsync(string branch, int? count)
    {
        var top = Math.Clamp(count ?? DefaultBuildCount, 1, MaxBuildCount);

        var client = authService.GetDiscoverClient();

        var search = new OfficialSearchParameterFactory()
            .SetBranch(branch)
            .SetTop(top)
            .SetOfficiality(true);

        var builds = await client.SearchBuildsAsync(search);

        return builds
            .OrderByDescending(b => b.ServerCreated)
            .Select(b =>
            {
                // Determine build start time from revision timestamps
                DateTimeOffset? buildStartTime = null;
                var attrs = b.Document?.Properties?.Attributes;
                if (attrs is not null &&
                    attrs.TryGetValue("buildingBranchRevision", out var bxloRevObj) &&
                    bxloRevObj is string bxloRev && !string.IsNullOrWhiteSpace(bxloRev))
                {
                    buildStartTime = TestDataService.ParseRevisionTimestamp(bxloRev);
                }

                buildStartTime ??= TestDataService.ParseRevisionTimestamp(
                    b.Document?.Properties?.Definition?.Revision);

                buildStartTime ??= b.ServerCreated;

                return new BuildInfo
                {
                    Fqbn = b.Document?.FriendlyName,
                    Branch = b.Document?.Properties?.Definition?.Branch,
                    BuildId = b.Document?.Properties?.Attributes?.AzureDevOpsBuildId,
                    BuildStartTime = buildStartTime,
                };
            })
            .ToArray();
    }
}
