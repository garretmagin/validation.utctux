using System.Globalization;
using Common.DiscoverClient;
using Common.DiscoverClient.SearchParameters;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using utctux.Server.Models;
using utctux.Server.Services;
using Xunit;
using Xunit.Abstractions;
using DiscoverBuildVersion = Common.DiscoverClient.WindowsBuildVersion;

namespace utctux.FunctionalTests;

/// <summary>
/// Diagnostic tests to investigate the time delta between the timestamp embedded
/// in the FQBN (e.g., 260226-1659 → 16:59 PT) and the build start time computed
/// from Discover document revision timestamps.
/// </summary>
public class BuildTimingTests(ITestOutputHelper output)
{
    /// <summary>
    /// Standard build FQBN (no BXLO restart). Build start should come from definition revision.
    /// </summary>
    private const string StandardFqbn = "29542.1000.main.260226-1659";

    /// <summary>
    /// BXLO restart FQBN. Build start should come from buildingBranchRevision attribute.
    /// </summary>
    private const string BxloRestartFqbn = "GE_CURRENT_DIRECTES_COREBUILD.26572.1002.20260225-2201";

    private (AuthService Auth, ILoggerFactory LoggerFactory) CreateAuthService()
    {
        var loggerFactory = LoggerFactory.Create(builder =>
        {
            builder.AddConsole();
            builder.SetMinimumLevel(LogLevel.Debug);
        });

        var authOptions = Options.Create(new UtctAuthOptions
        {
            UseInteractiveAuth = true,
            UtctApiEnvironment = "Production",
        });

        var authService = new AuthService(
            loggerFactory.CreateLogger<AuthService>(),
            authOptions);

        return (authService, loggerFactory);
    }

    private TestDataService CreateTestDataService()
    {
        var (authService, loggerFactory) = CreateAuthService();

        var novaService = new NovaService(
            authService,
            loggerFactory.CreateLogger<NovaService>());

        var cloudTestService = new CloudTestService(authService);

        return new TestDataService(
            authService,
            cloudTestService,
            novaService,
            loggerFactory.CreateLogger<TestDataService>());
    }

    [Fact]
    public void ParseRevisionTimestamp_ParsesCorrectly()
    {
        // Standard revision format
        var result = TestDataService.ParseRevisionTimestamp("260226-1659");
        Assert.NotNull(result);

        output.WriteLine($"Parsed '260226-1659': {result}");
        output.WriteLine($"  UTC: {result.Value.UtcDateTime}");
        output.WriteLine($"  Offset: {result.Value.Offset}");

        // Should be Feb 26, 2026 16:59 Pacific
        Assert.Equal(2026, result.Value.Year);
        Assert.Equal(2, result.Value.Month);
        Assert.Equal(26, result.Value.Day);
        Assert.Equal(16, result.Value.Hour);
        Assert.Equal(59, result.Value.Minute);

        // Null/empty returns null
        Assert.Null(TestDataService.ParseRevisionTimestamp(null));
        Assert.Null(TestDataService.ParseRevisionTimestamp(""));
        Assert.Null(TestDataService.ParseRevisionTimestamp("invalid"));
    }

    [Fact]
    public async Task StandardBuild_UsesDefinitionRevision()
    {
        var (authService, _) = CreateAuthService();
        var discoverClient = authService.GetDiscoverClient();
        var buildVersion = DiscoverBuildVersion.FromAnySupportedFormat(StandardFqbn);

        var search = new OfficialSearchParameterFactory()
            .SetWindowsBuildVersion(buildVersion)
            .SetOfficiality(true);

        var builds = await discoverClient.SearchBuildsAsync(search);
        var build = builds.FirstOrDefault();
        Assert.NotNull(build);

        var attrs = build.Document.Properties.Attributes;
        var definition = build.Document.Properties.Definition;

        output.WriteLine("=== Standard Build: Discover Document ===");
        output.WriteLine($"FQBN: {StandardFqbn}");
        output.WriteLine($"ServerCreated: {build.ServerCreated}");
        output.WriteLine($"Definition.Revision: {definition.Revision}");
        output.WriteLine($"Definition.Created: {definition.Created}");

        // Dump all attribute keys to see what's available
        output.WriteLine("\n=== All Attribute Keys ===");
        foreach (var key in attrs.Keys.OrderBy(k => k))
            output.WriteLine($"  {key} = {attrs[key]}");

        // Should NOT have buildingBranchRevision (standard build)
        var hasBxloRev = attrs.TryGetValue("buildingBranchRevision", out var bxloRevValue);
        output.WriteLine($"\nHas buildingBranchRevision: {hasBxloRev} (value: {bxloRevValue})");

        // Parse the revision timestamp
        var buildStart = TestDataService.ParseRevisionTimestamp(definition.Revision);
        Assert.NotNull(buildStart);

        output.WriteLine($"\n=== Computed Build Start ===");
        output.WriteLine($"From Definition.Revision '{definition.Revision}': {buildStart}");
        output.WriteLine($"ServerCreated (for comparison): {build.ServerCreated}");
        output.WriteLine($"Delta (ServerCreated - BuildStart): {build.ServerCreated - buildStart.Value.UtcDateTime}");
    }

    [Fact]
    public async Task BxloRestartBuild_UsesBuildingBranchRevision()
    {
        var (authService, _) = CreateAuthService();
        var discoverClient = authService.GetDiscoverClient();
        var buildVersion = DiscoverBuildVersion.FromAnySupportedFormat(BxloRestartFqbn);

        var search = new OfficialSearchParameterFactory()
            .SetWindowsBuildVersion(buildVersion)
            .SetOfficiality(true);

        var builds = await discoverClient.SearchBuildsAsync(search);
        var build = builds.FirstOrDefault();
        Assert.NotNull(build);

        var attrs = build.Document.Properties.Attributes;
        var definition = build.Document.Properties.Definition;

        output.WriteLine("=== BXLO Restart Build: Discover Document ===");
        output.WriteLine($"FQBN: {BxloRestartFqbn}");
        output.WriteLine($"ServerCreated: {build.ServerCreated}");
        output.WriteLine($"Definition.Revision: {definition.Revision}");
        output.WriteLine($"Definition.Created: {definition.Created}");

        // Dump all attribute keys
        output.WriteLine("\n=== All Attribute Keys ===");
        foreach (var key in attrs.Keys.OrderBy(k => k))
            output.WriteLine($"  {key} = {attrs[key]}");

        // Should HAVE buildingBranchRevision
        var hasBxloRev = attrs.TryGetValue("buildingBranchRevision", out var bxloRevValue);
        output.WriteLine($"\nHas buildingBranchRevision: {hasBxloRev}");
        output.WriteLine($"buildingBranchRevision value: {bxloRevValue}");

        Assert.True(hasBxloRev, "BXLO restart build should have buildingBranchRevision attribute");

        var bxloRevStr = bxloRevValue?.ToString();
        Assert.False(string.IsNullOrWhiteSpace(bxloRevStr));

        // Parse both timestamps
        var buildStartFromBxlo = TestDataService.ParseRevisionTimestamp(bxloRevStr);
        var buildStartFromRevision = TestDataService.ParseRevisionTimestamp(definition.Revision);

        output.WriteLine($"\n=== Computed Build Start ===");
        output.WriteLine($"From buildingBranchRevision '{bxloRevStr}': {buildStartFromBxlo}");
        output.WriteLine($"From Definition.Revision '{definition.Revision}': {buildStartFromRevision}");
        output.WriteLine($"ServerCreated (for comparison): {build.ServerCreated}");

        Assert.NotNull(buildStartFromBxlo);
        Assert.NotNull(buildStartFromRevision);

        // BXLO revision should be earlier than the restart's own revision
        output.WriteLine($"Delta (Revision - BxloRev): {buildStartFromRevision.Value - buildStartFromBxlo.Value}");
    }

    [Fact]
    public async Task FullPipeline_StandardBuild_ReturnsCorrectStartTime()
    {
        output.WriteLine("=== Full Pipeline Test: Standard Build ===");

        var svc = CreateTestDataService();
        var progress = new Progress<string>(msg => output.WriteLine($"  [Progress] {msg}"));

        var (results, buildStartTime) = await svc.LoadTestResultsAsync(
            StandardFqbn, progress, loadChunkData: false);

        Assert.NotNull(buildStartTime);
        output.WriteLine($"\nBuild Start Time: {buildStartTime}");
        output.WriteLine($"Build Start Time (Local): {buildStartTime.Value.ToLocalTime()}");
        output.WriteLine($"Total testpasses: {results.Count}");

        // The build start should be derived from the FQBN timestamp (260226-1659 → 4:59 PM PT)
        var expectedFqbnTime = TestDataService.ParseRevisionTimestamp("260226-1659");
        Assert.NotNull(expectedFqbnTime);

        output.WriteLine($"\nExpected (from FQBN): {expectedFqbnTime}");
        output.WriteLine($"Actual: {buildStartTime}");
        Assert.Equal(expectedFqbnTime.Value, buildStartTime.Value);

        // Show sample testpass timing offsets relative to new build start
        output.WriteLine("\n=== Sample Testpass Offsets (from build start) ===");
        foreach (var r in results.Take(5))
        {
            var timing = new TestpassTimingData(r);
            if (timing.StartTime.HasValue)
            {
                var offset = timing.StartTime.Value - buildStartTime.Value;
                output.WriteLine($"  {r.TestpassSummary?.TestpassName}: T+{offset.TotalHours:F1}h");
            }
        }
    }

    [Fact]
    public async Task BuildListing_GroupsBxloRestartChains()
    {
        output.WriteLine("=== Build Listing Grouping Test ===");

        var (authService, loggerFactory) = CreateAuthService();

        var gitBranchService = new GitBranchService(
            authService,
            new Microsoft.Extensions.Caching.Memory.MemoryCache(
                new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions()),
            loggerFactory.CreateLogger<GitBranchService>());

        var buildListingService = new BuildListingService(
            authService,
            gitBranchService,
            loggerFactory.CreateLogger<BuildListingService>());

        // Query a branch known to have BXLO restart builds
        var builds = await buildListingService.GetBuildsForBranchAsync(
            "ge_current_directes_corebuild", count: 15);

        output.WriteLine($"Total primary builds returned: {builds.Length}\n");

        int primaryIndex = 0;
        foreach (var build in builds)
        {
            var nLabel = primaryIndex == 0 ? "Latest" : $"N-{primaryIndex}";
            var hasChain = build.RelatedBuilds.Count > 0;

            output.WriteLine($"[{nLabel}] {build.BuildType ?? "?"} {build.Fqbn}");
            output.WriteLine($"       BuildId: {build.BuildId}  StartTime: {build.BuildStartTime}");

            if (hasChain)
            {
                output.WriteLine($"       Chain members ({build.RelatedBuilds.Count}):");
                foreach (var child in build.RelatedBuilds)
                {
                    output.WriteLine($"         └─ {child.BuildType ?? "?"} {child.Fqbn}");
                }
            }

            primaryIndex++;
        }

        // Verify basic structure
        Assert.True(builds.Length > 0, "Should have at least one build");

        // Check that BuildType is populated
        var withType = builds.Count(b => b.BuildType is not null);
        output.WriteLine($"\nBuilds with BuildType: {withType}/{builds.Length}");
        Assert.True(withType > 0, "At least some builds should have a BuildType");

        // Check for any grouped chains
        var chainsFound = builds.Count(b => b.RelatedBuilds.Count > 0);
        output.WriteLine($"Builds with restart chains: {chainsFound}");
    }
}
