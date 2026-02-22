using Microsoft.Extensions.Caching.Memory;
using Shouldly;
using utctux.Server.Models;
using utctux.Server.Services;
using Xunit;

namespace utctux.UnitTests.Services;

public class TestResultsCacheTests
{
    private TestResultsCache CreateCache() => new(new MemoryCache(new MemoryCacheOptions()));

    private static TestResultsCacheEntry CreateEntry() =>
        new() { Results = new TestResultsResponse() };

    [Fact]
    public void Get_ExistingKey_ReturnsCacheEntry()
    {
        var cache = CreateCache();
        var entry = CreateEntry();
        cache.Set("test-fqbn", entry);

        var result = cache.Get("test-fqbn");

        result.ShouldNotBeNull();
        result.ShouldBe(entry);
    }

    [Fact]
    public void Get_MissingKey_ReturnsNull()
    {
        var cache = CreateCache();

        var result = cache.Get("nonexistent");

        result.ShouldBeNull();
    }

    [Fact]
    public void Set_StoresWithDefaultExpiry()
    {
        var cache = CreateCache();
        var entry = CreateEntry();

        cache.Set("test-fqbn", entry);

        cache.Get("test-fqbn").ShouldNotBeNull();
    }

    [Fact]
    public void Set_CustomExpiry_UsesProvidedValue()
    {
        var cache = CreateCache();
        var entry = CreateEntry();

        cache.Set("test-fqbn", entry, TimeSpan.FromSeconds(1));

        cache.Get("test-fqbn").ShouldNotBeNull();
    }

    [Fact]
    public void Remove_ExistingKey_RemovesEntry()
    {
        var cache = CreateCache();
        var entry = CreateEntry();
        cache.Set("test-fqbn", entry);

        cache.Remove("test-fqbn");

        cache.Get("test-fqbn").ShouldBeNull();
    }

    [Fact]
    public void Get_CaseInsensitiveFqbn_AreDifferentKeys()
    {
        var cache = CreateCache();
        cache.Set("Main.Build", CreateEntry());

        // MemoryCache is case-sensitive by default, so different key
        cache.Get("main.build").ShouldBeNull();
    }
}
