using Microsoft.Extensions.Caching.Memory;
using Refit;
using utctux.Server.GitBranchApi;

namespace utctux.Server.Services;

/// <summary>
/// Provides branch listings from the GitBranch API with in-memory caching.
/// </summary>
public class GitBranchService(AuthService authService, IMemoryCache cache, ILogger<GitBranchService> logger)
{
    private const string CacheKey = "gitbranch:all-branches";
    private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(1);

    /// <summary>
    /// Gets active branch names, sorted alphabetically. Results are cached for 1 hour.
    /// Uses the matchingQuery endpoint to filter server-side by System.State=active.
    /// </summary>
    public async Task<string[]> GetBranchNamesAsync()
    {
        if (cache.TryGetValue(CacheKey, out string[]? cached) && cached is not null)
        {
            logger.LogDebug("Returning cached branch list ({Count} branches)", cached.Length);
            return cached;
        }

        logger.LogInformation("Fetching active branches from GitBranch API");
        var api = RestService.For<IGitBranchApi>(authService.GetGitBranchHttpClient());
        var branches = await api.GetBranchesByFieldAsync("System.State", "active");

        var result = branches
            .Select(b => b.BranchName)
            .Where(b => !string.IsNullOrEmpty(b))
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        cache.Set(CacheKey, result, CacheDuration);
        logger.LogInformation("Cached {Count} active branches from GitBranch API", result.Length);

        return result;
    }
}
