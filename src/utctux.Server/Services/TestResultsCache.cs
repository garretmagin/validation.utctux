using Microsoft.Extensions.Caching.Memory;

namespace utctux.Server.Services;

public class TestResultsCache
{
    private readonly IMemoryCache _cache;
    private static readonly TimeSpan DefaultExpiry = TimeSpan.FromHours(1);

    public TestResultsCache(IMemoryCache cache)
    {
        _cache = cache;
    }

    // Get cached results for an FQBN
    public TestResultsCacheEntry? Get(string fqbn)
    {
        _cache.TryGetValue(GetKey(fqbn), out TestResultsCacheEntry? entry);
        return entry;
    }

    // Store results with timestamp
    public void Set(string fqbn, TestResultsCacheEntry entry, TimeSpan? expiry = null)
    {
        _cache.Set(GetKey(fqbn), entry, expiry ?? DefaultExpiry);
    }

    // Remove cached entry (for force refresh)
    public void Remove(string fqbn)
    {
        _cache.Remove(GetKey(fqbn));
    }

    private static string GetKey(string fqbn) => $"testresults:{fqbn}";
}

public class TestResultsCacheEntry
{
    public required object Results { get; init; }  // Will be TestResultsResponse once models are ready
    public DateTimeOffset CachedAt { get; init; } = DateTimeOffset.UtcNow;
}
