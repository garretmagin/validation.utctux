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
/// Diagnostic test to investigate the time delta between the timestamp embedded
/// in the FQBN (e.g., 260226-1659 → 16:59) and the "Build Start" time shown
/// in the UI (which comes from Discover's ServerCreated field).
/// </summary>
public class BuildTimingTests(ITestOutputHelper output)
{
    /// <summary>
    /// The FQBN whose timestamp (260226-1659 → Feb 26 2026, 16:59) differs from
    /// the Discover ServerCreated / "Build Start" shown in the UI (5:52:55 PM).
    /// </summary>
    private const string Fqbn = "29542.1000.main.260226-1659";

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

    /// <summary>
    /// Parses the FQBN timestamp part (e.g., "260226-1659") into a DateTime.
    /// Format is YYMMDD-HHMM.
    /// </summary>
    private static DateTime? ParseFqbnTimestamp(string timestamp)
    {
        // Expected format: YYMMDD-HHMM (e.g., "260226-1659")
        if (DateTime.TryParseExact(timestamp, "yyMMdd-HHmm",
            CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            return parsed;
        }

        return null;
    }

    [Fact]
    public async Task InvestigateFqbnVsDiscoverTimeDelta()
    {
        // --- Step 1: Parse the FQBN timestamp ---
        var parsedFqbn = Server.Models.WindowsBuildVersion.FromAnySupportedFormat(Fqbn);
        Assert.NotNull(parsedFqbn);

        output.WriteLine("=== FQBN Analysis ===");
        output.WriteLine($"Full FQBN: {Fqbn}");
        output.WriteLine($"Parsed Branch: {parsedFqbn.Branch}");
        output.WriteLine($"Parsed Version: {parsedFqbn.Version}");
        output.WriteLine($"Parsed Qfe: {parsedFqbn.Qfe}");
        output.WriteLine($"Parsed Timestamp (raw): {parsedFqbn.Timestamp}");

        var fqbnTime = ParseFqbnTimestamp(parsedFqbn.Timestamp);
        output.WriteLine($"Parsed Timestamp (DateTime): {fqbnTime}");
        output.WriteLine($"Parsed Timestamp (formatted): {fqbnTime?.ToString("yyyy-MM-dd HH:mm")}");

        // --- Step 2: Query Discover for the build ---
        var (authService, loggerFactory) = CreateAuthService();
        var discoverClient = authService.GetDiscoverClient();
        var discoverBuildVersion = DiscoverBuildVersion.FromAnySupportedFormat(Fqbn);

        var search = new OfficialSearchParameterFactory()
            .SetWindowsBuildVersion(discoverBuildVersion)
            .SetOfficiality(true);

        var builds = await discoverClient.SearchBuildsAsync(search);
        var build = builds.FirstOrDefault();

        Assert.NotNull(build);

        output.WriteLine("\n=== Discover Build Data ===");
        output.WriteLine($"ServerCreated: {build.ServerCreated}");
        output.WriteLine($"ServerCreated (Local): {build.ServerCreated.ToLocalTime()}");
        output.WriteLine($"ServerCreated (UTC): {build.ServerCreated.ToUniversalTime()}");

        // Dump all available date fields from the build document
        if (build.Document?.Properties is { } props)
        {
            output.WriteLine($"\n=== Build Document Properties ===");

            if (props.Attributes is { } attrs)
            {
                output.WriteLine($"AzureDevOpsBuildId: {attrs.AzureDevOpsBuildId}");
                output.WriteLine($"AzureDevOpsProjectGuid: {attrs.AzureDevOpsProjectGuid}");
                output.WriteLine($"AzureDevOpsOrganization: {attrs.AzureDevOpsOrganization}");
            }
        }

        // --- Step 3: Load via TestDataService to get buildRegistrationDate ---
        output.WriteLine("\n=== TestDataService LoadTestResultsAsync ===");
        var svc = CreateTestDataService();
        var progress = new Progress<string>(msg => output.WriteLine($"  [Progress] {msg}"));

        var (results, buildRegistrationDate) = await svc.LoadTestResultsAsync(
            Fqbn, progress, loadChunkData: false);

        output.WriteLine($"\nBuild Registration Date: {buildRegistrationDate}");
        output.WriteLine($"Build Registration Date (Local): {buildRegistrationDate?.ToLocalTime()}");
        output.WriteLine($"Build Registration Date (UTC): {buildRegistrationDate?.ToUniversalTime()}");
        output.WriteLine($"Total testpasses: {results.Count}");

        // --- Step 4: Calculate and display the delta ---
        output.WriteLine("\n=== Time Delta Analysis ===");
        if (fqbnTime.HasValue && buildRegistrationDate.HasValue)
        {
            // Compare assuming FQBN timestamp is UTC
            var fqbnAsUtc = new DateTimeOffset(fqbnTime.Value, TimeSpan.Zero);
            var regDateUtc = buildRegistrationDate.Value.ToUniversalTime();
            var deltaUtc = regDateUtc - fqbnAsUtc;

            output.WriteLine($"FQBN timestamp (as UTC): {fqbnAsUtc:yyyy-MM-dd HH:mm}");
            output.WriteLine($"Discover ServerCreated (UTC): {regDateUtc:yyyy-MM-dd HH:mm:ss}");
            output.WriteLine($"Delta (ServerCreated - FQBN, assuming FQBN=UTC): {deltaUtc}");

            // Compare assuming FQBN timestamp is Pacific Time
            var pacificTz = TimeZoneInfo.FindSystemTimeZoneById("Pacific Standard Time");
            var fqbnAsPacific = new DateTimeOffset(fqbnTime.Value, pacificTz.GetUtcOffset(fqbnTime.Value));
            var deltaPacific = regDateUtc - fqbnAsPacific.ToUniversalTime();

            output.WriteLine($"\nFQBN timestamp (as Pacific): {fqbnAsPacific:yyyy-MM-dd HH:mm zzz}");
            output.WriteLine($"Delta (ServerCreated - FQBN, assuming FQBN=Pacific): {deltaPacific}");

            output.WriteLine($"\n--- Interpretation ---");
            output.WriteLine($"The FQBN timestamp '{parsedFqbn.Timestamp}' represents the time the build was");
            output.WriteLine($"defined/queued by the ADO pipeline. The Discover 'ServerCreated' ({buildRegistrationDate})");
            output.WriteLine($"represents when Discover indexed/registered the build after it completed.");
            output.WriteLine($"The delta shows how long between build queue and Discover registration.");
        }
        else
        {
            output.WriteLine("⚠ Could not calculate delta — one or both timestamps are null.");
        }

        // --- Step 5: Look at a few testpass timings for additional context ---
        output.WriteLine("\n=== Sample Testpass Start Times ===");
        var sampleResults = results.Take(10);
        foreach (var r in sampleResults)
        {
            var timing = new TestpassTimingData(r);
            output.WriteLine($"  {r.TestpassSummary?.TestpassName ?? "(unknown)"}");
            output.WriteLine($"    ExecSystem: {r.TestpassSummary?.ExecutionSystem}");
            output.WriteLine($"    TimingData.StartTime: {timing.StartTime}");
            output.WriteLine($"    TimingData.EndTime: {timing.EndTime}");
            if (r.TestSession?.SessionTimelineData is { } timeline)
            {
                output.WriteLine($"    CT QueuedTime: {timeline.QueuedTime}");
                output.WriteLine($"    CT ExecutionStartTime: {timeline.ExecutionStartTime}");
                output.WriteLine($"    CT CompletedTime: {timeline.CompletedTime}");
            }
            if (r.NovaTestpass is { } nova)
            {
                output.WriteLine($"    Nova StartTime: {nova.StartTime}");
                output.WriteLine($"    Nova EndTime: {nova.EndTime}");
            }
        }
    }
}
