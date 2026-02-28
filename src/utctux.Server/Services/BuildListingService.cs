using System.Globalization;
using Common.DiscoverClient;
using Common.DiscoverClient.Models.Official;
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
    /// Gets recent builds for the specified branch, with BXLO restart chains grouped.
    /// </summary>
    public async Task<BuildInfo[]> GetBuildsForBranchAsync(string branch, int? count)
    {
        var top = Math.Clamp(count ?? DefaultBuildCount, 1, MaxBuildCount);

        var client = authService.GetDiscoverClient();

        // Over-fetch to capture restart chain members that might be beyond `top`
        var fetchCount = Math.Min(top + (top / 2), MaxBuildCount);

        var search = new OfficialSearchParameterFactory()
            .SetBranch(branch)
            .SetTop(fetchCount)
            .SetOfficiality(true);

        var builds = await client.SearchBuildsAsync(search);

        var ordered = builds.OrderByDescending(b => b.ServerCreated).ToList();

        // Convert to BuildInfo with metadata
        var allBuilds = ordered.Select(b => ToBuildInfo(b)).ToList();

        // Group BXLO restart chains by buildingBranchRevision
        var grouped = GroupRestartChains(allBuilds, ordered);

        return grouped.Take(top).ToArray();
    }

    private static BuildInfo ToBuildInfo(OfficialBuildData b)
    {
        var attrs = b.Document?.Properties?.Attributes;
        var definition = b.Document?.Properties?.Definition;

        // Determine build start time
        DateTimeOffset? buildStartTime = null;
        string? buildingBranchRevision = null;
        if (attrs is not null &&
            attrs.TryGetValue("buildingBranchRevision", out var bxloRevObj) &&
            bxloRevObj is string bxloRev && !string.IsNullOrWhiteSpace(bxloRev))
        {
            buildingBranchRevision = bxloRev;
            buildStartTime = TestDataService.ParseRevisionTimestamp(bxloRev);
        }

        buildStartTime ??= TestDataService.ParseRevisionTimestamp(definition?.Revision);
        buildStartTime ??= b.ServerCreated;

        return new BuildInfo
        {
            Fqbn = b.Document?.FriendlyName,
            Branch = definition?.Branch,
            BuildId = attrs?.AzureDevOpsBuildId,
            BuildStartTime = buildStartTime,
            BuildType = ResolveBuildType(attrs),
        };
    }

    /// <summary>
    /// Determines the build type tag from Discover attributes.
    /// </summary>
    internal static string? ResolveBuildType(OfficialBuildAttributes? attrs)
    {
        if (attrs is null) return null;

        if (attrs.TryGetValue("buildEngine", out var engineObj) &&
            engineObj is string engine &&
            engine.Equals("BuildXL", StringComparison.OrdinalIgnoreCase))
        {
            return "BXL";
        }

        if (attrs.TryGetValue("buildWorkflow", out var workflowObj) &&
            workflowObj is string workflow)
        {
            if (workflow.Equals("Timebuild", StringComparison.OrdinalIgnoreCase))
                return "TB";
            return workflow;
        }

        return null;
    }

    /// <summary>
    /// Groups builds into restart chains based on buildingBranchRevision.
    /// Restarts point to an original build via buildingBranchRevision → Definition.Revision match.
    /// The most recent build in a chain is the primary; earlier ones become RelatedBuilds.
    /// </summary>
    private static List<BuildInfo> GroupRestartChains(
        List<BuildInfo> allBuilds,
        List<OfficialBuildData> rawBuilds)
    {
        // Build lookup: revision → (index, raw build data)
        var revisionToIndex = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < rawBuilds.Count; i++)
        {
            var rev = rawBuilds[i].Document?.Properties?.Definition?.Revision;
            if (!string.IsNullOrWhiteSpace(rev) && !revisionToIndex.ContainsKey(rev))
                revisionToIndex[rev] = i;
        }

        // Find which builds have buildingBranchRevision (are restarts)
        // Skip self-references where buildingBranchRevision equals the build's own revision
        var restartSourceRevisions = new Dictionary<int, string>(); // index → buildingBranchRevision
        for (int i = 0; i < rawBuilds.Count; i++)
        {
            var attrs = rawBuilds[i].Document?.Properties?.Attributes;
            var ownRevision = rawBuilds[i].Document?.Properties?.Definition?.Revision;
            if (attrs is not null &&
                attrs.TryGetValue("buildingBranchRevision", out var bxloRevObj) &&
                bxloRevObj is string bxloRev && !string.IsNullOrWhiteSpace(bxloRev) &&
                !string.Equals(bxloRev, ownRevision, StringComparison.OrdinalIgnoreCase))
            {
                restartSourceRevisions[i] = bxloRev;
            }
        }

        // Track which builds are "consumed" as children
        var consumed = new HashSet<int>();

        // For each restart, find its original and group them
        // Group by buildingBranchRevision value (all restarts pointing to same original)
        var chainsByOriginalRev = new Dictionary<string, List<int>>(StringComparer.OrdinalIgnoreCase);
        foreach (var (restartIdx, originalRev) in restartSourceRevisions)
        {
            if (!chainsByOriginalRev.TryGetValue(originalRev, out var chain))
            {
                chain = [];
                chainsByOriginalRev[originalRev] = chain;
            }
            chain.Add(restartIdx);
        }

        var result = new List<BuildInfo>();

        for (int i = 0; i < allBuilds.Count; i++)
        {
            if (consumed.Contains(i))
                continue;

            var build = allBuilds[i];
            var rev = rawBuilds[i].Document?.Properties?.Definition?.Revision;

            // Check if this build has restarts pointing to it (it's an original)
            if (rev is not null && chainsByOriginalRev.TryGetValue(rev, out var restartIndices))
            {
                // This original is consumed — the most recent restart becomes primary
                // (restarts are already in ServerCreated order since allBuilds is ordered)
                var primaryIdx = restartIndices.Min(); // smallest index = most recent (desc order)
                var children = new List<BuildInfo>();

                // Add all other restarts as children
                foreach (var idx in restartIndices.Where(idx => idx != primaryIdx))
                {
                    children.Add(allBuilds[idx]);
                    consumed.Add(idx);
                }

                // Add the original build as a child
                children.Add(build);
                consumed.Add(i);

                result.Add(allBuilds[primaryIdx] with { RelatedBuilds = children });
                consumed.Add(primaryIdx);
            }
            else if (restartSourceRevisions.ContainsKey(i))
            {
                // This is a restart whose original wasn't in our result set —
                // show it as primary (it's already the most recent)
                var originalRev = restartSourceRevisions[i];

                // Collect any sibling restarts pointing to the same original
                if (chainsByOriginalRev.TryGetValue(originalRev, out var siblings))
                {
                    var children = new List<BuildInfo>();
                    foreach (var sibIdx in siblings.Where(s => s != i && !consumed.Contains(s)))
                    {
                        children.Add(allBuilds[sibIdx]);
                        consumed.Add(sibIdx);
                    }

                    // If the original build is in our set, add it as child
                    if (revisionToIndex.TryGetValue(originalRev, out var origIdx) && !consumed.Contains(origIdx))
                    {
                        children.Add(allBuilds[origIdx]);
                        consumed.Add(origIdx);
                    }

                    if (children.Count > 0)
                        build = build with { RelatedBuilds = children };
                }

                result.Add(build);
            }
            else
            {
                // Standalone build — no restart chain involvement
                result.Add(build);
            }
        }

        return result;
    }
}
