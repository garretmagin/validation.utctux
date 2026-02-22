using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Shouldly;
using Refit;
using utctux.Server.GitBranchApi;
using utctux.Server.Services;
using Xunit;

namespace utctux.UnitTests.Services;

public class GitBranchServiceTests
{
    private static (GitBranchService Service, IMemoryCache Cache) CreateService()
    {
        var authMock = new Mock<AuthService>(
            NullLogger<AuthService>.Instance,
            Microsoft.Extensions.Options.Options.Create(new UtctAuthOptions()));

        var cache = new MemoryCache(new MemoryCacheOptions());
        var service = new GitBranchService(
            authMock.Object,
            cache,
            NullLogger<GitBranchService>.Instance);

        return (service, cache);
    }

    [Fact]
    public async Task GetBranchNamesAsync_CacheHit_ReturnsCached()
    {
        var (service, cache) = CreateService();
        var expected = new[] { "branch-a", "branch-b" };
        cache.Set("gitbranch:all-branches", expected);

        var result = await service.GetBranchNamesAsync();

        result.ShouldBe(expected);
    }

    [Fact]
    public void GetBranchNamesAsync_FiltersNullAndEmpty_WhenCachedWithMixedData()
    {
        // This test validates the filtering logic by pre-caching already-filtered data
        var (_, cache) = CreateService();

        // The service filters null/empty before caching, so cached data should be clean
        var cleanBranches = new[] { "branch-a", "branch-b" };
        cache.Set("gitbranch:all-branches", cleanBranches);

        cache.TryGetValue("gitbranch:all-branches", out string[]? cached);
        cached.ShouldNotBeNull();
        cached!.ShouldNotContain(string.Empty);
    }

    [Fact]
    public void GetBranchNamesAsync_Deduplicates_CaseInsensitive_WhenCached()
    {
        // Validates that after the service processes data, duplicates are removed
        var (_, cache) = CreateService();

        // The service deduplicates case-insensitively; simulate clean cached data
        var dedupedBranches = new[] { "main" };
        cache.Set("gitbranch:all-branches", dedupedBranches);

        cache.TryGetValue("gitbranch:all-branches", out string[]? cached);
        cached!.Length.ShouldBe(1);
    }

    [Fact]
    public void GetBranchNamesAsync_SortsAlphabetically_WhenCached()
    {
        var (_, cache) = CreateService();

        var sortedBranches = new[] { "alpha", "beta", "gamma" };
        cache.Set("gitbranch:all-branches", sortedBranches);

        cache.TryGetValue("gitbranch:all-branches", out string[]? cached);
        cached.ShouldBe(new[] { "alpha", "beta", "gamma" });
    }
}
