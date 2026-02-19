using Common.DiscoverClient;
using Common.DiscoverClient.SearchParameters;
using utctux.Server.Models;
using UtctClient;
using UtctClient.Data.Common;
using UtctClient.Data.Response;
using DiscoverBuildVersion = Common.DiscoverClient.WindowsBuildVersion;

namespace utctux.Server.Services;

/// <summary>
/// Orchestrates parallel data loading and aggregation for test results across
/// UTCT, CloudTest, and Nova APIs. Mirrors the loading pattern from the original
/// TestExecutionDataProvider but operates as a DI-registered service.
/// </summary>
public class TestDataService
{
    private readonly AuthService _authService;
    private readonly CloudTestService _cloudTestService;
    private readonly NovaService _novaService;
    private readonly ILogger<TestDataService> _logger;

    public TestDataService(
        AuthService authService,
        CloudTestService cloudTestService,
        NovaService novaService,
        ILogger<TestDataService> logger)
    {
        _authService = authService;
        _cloudTestService = cloudTestService;
        _novaService = novaService;
        _logger = logger;
    }

    /// <summary>
    /// Loads and aggregates test results from UTCT, CloudTest, and Nova for a given FQBN.
    /// </summary>
    public async Task<(List<AggregatedTestpassResult> Results, DateTimeOffset? BuildRegistrationDate)> LoadTestResultsAsync(
        string fqbn,
        IProgress<string>? progress = null,
        bool loadChunkData = true,
        CancellationToken cancellationToken = default)
    {
        // Phase 0: Resolve build identity via Discover
        progress?.Report("Resolving build identity...");
        _logger.LogInformation("Resolving build identity for FQBN: {Fqbn}", fqbn);

        var (organizationName, projectId, buildId, buildRegistrationDate) = await ResolveBuildIdentityAsync(fqbn, progress);

        if (organizationName is null || !projectId.HasValue || !buildId.HasValue)
        {
            progress?.Report("⚠ Could not resolve build identity — no ADO build info found.");
            _logger.LogWarning("Could not resolve build identity for FQBN: {Fqbn}", fqbn);
            return ([], null);
        }

        var parsedFqbn = Models.WindowsBuildVersion.FromAnySupportedFormat(fqbn);

        // Phase 1: Fire all data loads in parallel
        progress?.Report("Loading UTCT schedule data...");
        var utctClient = _authService.GetUtctApiClient();

        var summaryTask = LoadUtctScheduleDataAsync(utctClient, organizationName, projectId.Value, buildId.Value, progress);

        progress?.Report("Loading CloudTest sessions...");
        var cloudTestTask = LoadCloudTestSessionsAsync(projectId.Value, buildId.Value, progress);

        progress?.Report("Loading Nova test results...");
        var novaTask = parsedFqbn is not null
            ? LoadNovaTestReportAsync(parsedFqbn, progress)
            : Task.FromResult<List<NovaTestpass>>([]);

        await Task.WhenAll(summaryTask, cloudTestTask, novaTask).ConfigureAwait(false);

        var summaryList = summaryTask.Result;
        var cloudTestData = cloudTestTask.Result;
        var novaData = novaTask.Result;

        _logger.LogInformation(
            "Loaded {UtctCount} UTCT testpasses, {CtCount} CloudTest sessions, {NovaCount} Nova testpasses",
            summaryList.Count, cloudTestData.Count, novaData.Count);

        // Phase 2: Load chunk availability if requested
        var chunkLookup = new Dictionary<string, ChunkAvailabilityInfo>();
        if (loadChunkData && summaryList.Count > 0)
        {
            progress?.Report("Loading chunk availability...");
            chunkLookup = await LoadChunkAvailabilityAsync(summaryList, buildRegistrationDate, progress);
        }

        // Phase 3: Aggregate results
        progress?.Report("Aggregating test results...");
        var results = AggregateResults(summaryList, cloudTestData, novaData, chunkLookup);

        progress?.Report($"Loaded {results.Count} test results.");
        return (results, buildRegistrationDate);
    }

    private async Task<(string? OrgName, Guid? ProjectId, int? BuildId, DateTimeOffset? RegistrationDate)> ResolveBuildIdentityAsync(string fqbn, IProgress<string>? progress = null)
    {
        try
        {
            var discoverClient = _authService.GetDiscoverClient();
            var buildVersion = DiscoverBuildVersion.FromAnySupportedFormat(fqbn);

            var search = new OfficialSearchParameterFactory()
                .SetWindowsBuildVersion(buildVersion)
                .SetOfficiality(true);

            var builds = await discoverClient.SearchBuildsAsync(search);
            var build = builds.FirstOrDefault();

            if (build?.Document?.Properties?.Attributes is null)
            {
                return (null, null, null, null);
            }

            var attrs = build.Document.Properties.Attributes;
            var adoBuildId = attrs.AzureDevOpsBuildId;
            var adoProjectGuid = attrs.AzureDevOpsProjectGuid;
            var adoOrg = attrs.AzureDevOpsOrganization?.ToString();

            if (!adoBuildId.HasValue || !adoProjectGuid.HasValue || string.IsNullOrEmpty(adoOrg))
            {
                _logger.LogWarning("Build found but missing ADO info for FQBN: {Fqbn}", fqbn);
                return (null, null, null, null);
            }

            // Parse the ADO org URI to extract org name
            var orgName = ExtractOrganizationName(adoOrg);

            return (orgName, adoProjectGuid.Value, adoBuildId.Value, build.ServerCreated);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to resolve build identity for FQBN: {Fqbn}", fqbn);
            progress?.Report($"⚠ Error resolving build identity: {ex.Message}");
            return (null, null, null, null);
        }
    }

    private static string ExtractOrganizationName(string adoOrgValue)
    {
        if (Uri.TryCreate(adoOrgValue, UriKind.Absolute, out var uri))
        {
            return AzureDevOpsUri.CreateFromUri(uri).OrganizationName;
        }

        // If it's not a URI, assume it's already the org name
        return adoOrgValue;
    }

    private async Task<IReadOnlyList<UtctTestpass>> LoadUtctScheduleDataAsync(
        IUtctApiClient utctClient,
        string organizationName,
        Guid projectId,
        int buildId,
        IProgress<string>? progress = null)
    {
        try
        {
            var schedule = await utctClient.GetScheduleAsync(organizationName, projectId, buildId, resolveReferences: true).ConfigureAwait(false);

            if (schedule is null)
            {
                progress?.Report("⚠ No UTCT schedule found for this build.");
                _logger.LogDebug("No UTCT schedule found for build {BuildId}", buildId);
                return [];
            }

            var testpasses = schedule.TestpassReferences
                .Where(t => t.Testpass is not null)
                .Select(t => t.Testpass)
                .ToList();
            progress?.Report($"Loaded {testpasses.Count} UTCT testpasses.");
            return testpasses;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load UTCT schedule data for build {BuildId}", buildId);
            progress?.Report($"⚠ Error loading UTCT schedule data: {ex.Message}");
            return [];
        }
    }

    private async Task<IReadOnlyList<TestSession>> LoadCloudTestSessionsAsync(Guid projectId, int buildId, IProgress<string>? progress = null)
    {
        try
        {
            var sessions = await _cloudTestService.GetSessionsByBuildAsync(projectId.ToString("D"), buildId);
            progress?.Report($"Loaded {sessions.Count} CloudTest sessions.");
            return sessions;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load CloudTest sessions for build {BuildId}", buildId);
            progress?.Report($"⚠ Error loading CloudTest sessions: {ex.Message}");
            return [];
        }
    }

    private async Task<List<NovaTestpass>> LoadNovaTestReportAsync(Models.WindowsBuildVersion parsedFqbn, IProgress<string>? progress = null)
    {
        try
        {
            var buildString = $"{parsedFqbn.Branch.ToLower()}.{parsedFqbn.Version}.{parsedFqbn.Qfe}.20{parsedFqbn.Timestamp}";
            var testpasses = await _novaService.GetTestReportAsync(buildString);
            progress?.Report($"Loaded {testpasses.Count} Nova testpasses.");
            return testpasses;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load Nova test report for build {Branch}.{Version}", parsedFqbn.Branch, parsedFqbn.Version);
            progress?.Report($"⚠ Error loading Nova test results: {ex.Message}");
            return [];
        }
    }

    private List<AggregatedTestpassResult> AggregateResults(
        IReadOnlyList<UtctTestpass> summaryList,
        IReadOnlyList<TestSession> cloudTestData,
        List<NovaTestpass> novaData,
        Dictionary<string, ChunkAvailabilityInfo> chunkLookup)
    {
        var results = new List<AggregatedTestpassResult>();

        foreach (var summaryTestPass in summaryList)
        {
            NovaTestpass? novaTestpass = null;
            TestSession? session = null;
            var bugs = new List<NovaBug>();

            if (summaryTestPass.ExecutionSystem == ExecutionSystem.CloudTest)
            {
                // Get the most recently executed test session matching by display name
                var matchingSessions = cloudTestData
                    .Where(t => t.TestSessionRequest.DisplayName == summaryTestPass.TestpassName);

                if (matchingSessions.Any())
                {
                    session = matchingSessions
                        .OrderBy(t => t.SessionTimelineData.QueuedTime)
                        .LastOrDefault();
                }
            }
            else if (summaryTestPass.ExecutionSystem == ExecutionSystem.T3C)
            {
                // Match Nova testpass by name
                novaTestpass = novaData.FirstOrDefault(np => np.TestPassName == summaryTestPass.TestpassName);
                if (novaTestpass?.Bugs is not null)
                {
                    bugs.AddRange(novaTestpass.Bugs);
                }
            }

            // Resolve chunk availability for this testpass's dependencies
            var chunkAvailability = ResolveChunkAvailability(summaryTestPass.TestpassDependencies, chunkLookup);

            results.Add(new AggregatedTestpassResult
            {
                TestpassSummary = summaryTestPass,
                TestSession = session,
                NovaTestpass = novaTestpass,
                Bugs = bugs,
                ChunkAvailability = chunkAvailability,
            });
        }

        return results
            .OrderBy(t => t.TestpassSummary?.ExecutionSystem + t.TestpassSummary?.TestpassName)
            .ToList();
    }

    private async Task<Dictionary<string, ChunkAvailabilityInfo>> LoadChunkAvailabilityAsync(
        IReadOnlyList<UtctTestpass> summaryList,
        DateTimeOffset? buildRegistrationDate,
        IProgress<string>? progress = null)
    {
        var lookup = new Dictionary<string, ChunkAvailabilityInfo>();

        try
        {
            var discoverClient = _authService.GetDiscoverClient();

            // Collect unique (BuildGuid, Drop, Flavor) tuples from testpass dependencies
            var allDropEntries = summaryList
                .SelectMany(tp => tp.TestpassDependencies ?? [])
                .Where(d => !string.IsNullOrEmpty(d.Drop) && !string.IsNullOrEmpty(d.BuildGuid) && !string.IsNullOrEmpty(d.Flavor))
                .Select(d => (d.BuildGuid, d.Drop, d.Flavor))
                .Distinct()
                .ToList();

            if (allDropEntries.Count == 0)
            {
                return lookup;
            }

            _logger.LogInformation("Loading chunk availability for {Count} unique drops", allDropEntries.Count);

            // Fire GetDropAsync calls in parallel
            var dropTasks = allDropEntries.Select(async entry =>
            {
                try
                {
                    var drop = await discoverClient.GetDropAsync(entry.Drop, Guid.Parse(entry.BuildGuid), entry.Flavor).ConfigureAwait(false);
                    return (entry, Drop: drop, Success: true);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning("Failed to load drop info for {Drop} ({Flavor}): {Error}", entry.Drop, entry.Flavor, ex.Message);
                    return (entry, Drop: (Common.DiscoverClient.Models.Drop.ArtifactServiceDrop?)null, Success: false);
                }
            }).ToList();

            var dropResults = await Task.WhenAll(dropTasks).ConfigureAwait(false);

            foreach (var result in dropResults)
            {
                if (!result.Success || result.Drop is null)
                {
                    continue;
                }

                var availableTime = result.Drop.Created.HasValue
                    ? new DateTimeOffset(result.Drop.Created.Value, TimeSpan.Zero)
                    : (DateTimeOffset?)null;

                TimeSpan? delta = (availableTime.HasValue && buildRegistrationDate.HasValue)
                    ? availableTime.Value - buildRegistrationDate.Value
                    : null;

                var key = $"{result.entry.BuildGuid}:{result.entry.Drop}:{result.entry.Flavor}";
                lookup[key] = new ChunkAvailabilityInfo(
                    result.entry.Drop,
                    result.entry.Flavor,
                    delta,
                    availableTime);
            }

            _logger.LogInformation("Loaded chunk availability for {Resolved}/{Total} drops", lookup.Count, allDropEntries.Count);
            progress?.Report($"Loaded chunk availability for {lookup.Count}/{allDropEntries.Count} drops.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load chunk availability data");
            progress?.Report($"⚠ Error loading chunk availability data: {ex.Message}");
        }

        return lookup;
    }

    private static IReadOnlyList<ChunkAvailabilityInfo> ResolveChunkAvailability(
        IReadOnlyList<TestpassDependency>? dependencies,
        Dictionary<string, ChunkAvailabilityInfo> lookup)
    {
        if (dependencies is null || dependencies.Count == 0 || lookup.Count == 0)
        {
            return [];
        }

        var result = new List<ChunkAvailabilityInfo>();
        foreach (var dep in dependencies)
        {
            if (string.IsNullOrEmpty(dep.Drop) || string.IsNullOrEmpty(dep.BuildGuid) || string.IsNullOrEmpty(dep.Flavor))
            {
                continue;
            }

            var key = $"{dep.BuildGuid}:{dep.Drop}:{dep.Flavor}";
            if (lookup.TryGetValue(key, out var info))
            {
                result.Add(info);
            }
            else
            {
                result.Add(new ChunkAvailabilityInfo(dep.Drop, dep.Flavor, null, null));
            }
        }

        return result;
    }
}
