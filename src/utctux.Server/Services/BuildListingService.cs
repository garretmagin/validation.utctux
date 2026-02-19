using Common.DiscoverClient;
using Common.DiscoverClient.SearchParameters;
using utctux.Server.Models;

namespace utctux.Server.Services;

/// <summary>
/// Lists branches and builds using the Discover client.
/// </summary>
public class BuildListingService(AuthService authService, ILogger<BuildListingService> logger)
{
    private const int DefaultBuildCount = 10;
    private const int MaxBuildCount = 100;
    private const int BranchDiscoveryCount = 500;
    private readonly ILogger<BuildListingService> _logger = logger;

    /// <summary>
    /// Gets distinct branch names from recent official builds.
    /// </summary>
    public async Task<string[]> GetBranchesAsync()
    {
        var client = authService.GetDiscoverClient();

        var search = new OfficialSearchParameterFactory()
            .SetTop(BranchDiscoveryCount)
            .SetOfficiality(true);

        var builds = await client.SearchBuildsAsync(search);

        return builds
            .Select(b => b.Document?.Properties?.Definition?.Branch)
            .Where(b => !string.IsNullOrEmpty(b))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToArray()!;
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
            .Select(b => new BuildInfo
            {
                Fqbn = b.Document?.FriendlyName,
                Branch = b.Document?.Properties?.Definition?.Branch,
                BuildId = b.Document?.Properties?.Attributes?.AzureDevOpsBuildId,
                RegistrationDate = b.ServerCreated,
            })
            .ToArray();
    }
}
