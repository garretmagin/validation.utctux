using System.Net.Http.Headers;
using System.Text.Json;
using Azure.Core;
using Common.MsalAuth;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using utctux.Server.Services;
using Xunit;
using Xunit.Abstractions;

namespace utctux.FunctionalTests;

/// <summary>
/// Diagnostic tests to explore the Media Creation API and understand
/// the request graph structure for a given build.
/// </summary>
public class MediaCreationTests(ITestOutputHelper output)
{
    private const string MediaCreationBaseUrl = "https://mediacreation-media.microsoft.com";
    private const string MediaCreationScope = "https://mediacreation.mspmecloud.onmicrosoft.com/MediaCreation-thanos-MediaApi/.default";
    private const string TestBuildGuid = "2b591687-9ab0-4399-da35-2011c6eee48d";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
    };

    private HttpClient CreateMediaCreationHttpClient()
    {
        var loggerFactory = LoggerFactory.Create(b => b.AddConsole().SetMinimumLevel(LogLevel.Warning));
        var authOptions = Options.Create(new UtctAuthOptions
        {
            UseInteractiveAuth = true,
            UtctApiEnvironment = "Production",
        });
        var authService = new AuthService(loggerFactory.CreateLogger<AuthService>(), authOptions);

        var credential = authService.GetTokenCredential();
        var tokenRequestContext = new TokenRequestContext([MediaCreationScope]);
        var handler = new MsalHttpClientHandler(credential, tokenRequestContext)
        {
            InnerHandler = new HttpClientHandler()
        };
        var client = new HttpClient(handler)
        {
            BaseAddress = new Uri(MediaCreationBaseUrl),
        };
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return client;
    }

    [Fact]
    public async Task PrintMediaRequestGraph_ForBuildGuid()
    {
        using var client = CreateMediaCreationHttpClient();

        // Step 1: Search for request graphs by build GUID
        output.WriteLine($"=== Searching for request graphs for build GUID: {TestBuildGuid} ===\n");

        var searchUrl = $"/api/v2.0/requestGraphs/search?buildGuid={TestBuildGuid}";
        var searchResponse = await client.GetAsync(searchUrl);
        var searchBody = await searchResponse.Content.ReadAsStringAsync();

        output.WriteLine($"GET {searchUrl}");
        output.WriteLine($"Status: {searchResponse.StatusCode}");

        if (!searchResponse.IsSuccessStatusCode)
        {
            output.WriteLine($"Error: {searchBody}");
            Assert.Fail($"Search failed with {searchResponse.StatusCode}: {searchBody}");
        }

        var searchResults = JsonSerializer.Deserialize<JsonElement>(searchBody);
        var prettySearch = JsonSerializer.Serialize(searchResults, JsonOptions);
        output.WriteLine($"Search Results:\n{prettySearch}\n");

        // Step 2: For each graph found, get the full request graph
        if (searchResults.ValueKind == JsonValueKind.Array)
        {
            foreach (var graph in searchResults.EnumerateArray())
            {
                var graphId = graph.GetProperty("id").GetString();
                var fqbn = graph.TryGetProperty("fqbn", out var fqbnProp) ? fqbnProp.GetString() : "(null)";
                var isOfficial = graph.TryGetProperty("isOfficial", out var officialProp) && officialProp.GetBoolean();

                output.WriteLine($"=== Full Request Graph: {graphId} (FQBN: {fqbn}, Official: {isOfficial}) ===\n");

                var fullGraphUrl = $"/api/v2.0/fullRequestGraphs/{graphId}?includeExternals=true&includeDependencyRelations=true";
                var fullGraphResponse = await client.GetAsync(fullGraphUrl);
                var fullGraphBody = await fullGraphResponse.Content.ReadAsStringAsync();

                output.WriteLine($"GET {fullGraphUrl}");
                output.WriteLine($"Status: {fullGraphResponse.StatusCode}");

                if (fullGraphResponse.IsSuccessStatusCode)
                {
                    var fullGraph = JsonSerializer.Deserialize<JsonElement>(fullGraphBody);
                    var prettyGraph = JsonSerializer.Serialize(fullGraph, JsonOptions);
                    output.WriteLine($"Full Graph:\n{prettyGraph}\n");

                    // Print summary of buildable artifacts
                    if (fullGraph.TryGetProperty("buildableArtifacts", out var artifacts) &&
                        artifacts.ValueKind == JsonValueKind.Array)
                    {
                        output.WriteLine($"--- Buildable Artifacts ({artifacts.GetArrayLength()}) ---");
                        foreach (var artifact in artifacts.EnumerateArray())
                        {
                            var name = artifact.TryGetProperty("name", out var n) ? n.GetString() : "?";
                            var flavor = artifact.TryGetProperty("flavor", out var f) ? f.GetString() : "?";
                            var state = artifact.TryGetProperty("currentState", out var s) ? s.GetString() : "?";
                            var mediaType = artifact.TryGetProperty("mediaType", out var mt) ? mt.GetString() : "?";
                            output.WriteLine($"  [{state}] {name} / {flavor} (type: {mediaType})");
                        }
                        output.WriteLine("");
                    }

                    // Print dependency relations
                    if (fullGraph.TryGetProperty("dependsOnRelations", out var deps) &&
                        deps.ValueKind == JsonValueKind.Object)
                    {
                        output.WriteLine($"--- Dependency Relations ---");
                        foreach (var dep in deps.EnumerateObject())
                        {
                            var dependents = dep.Value.EnumerateArray().Select(v => v.GetString()).ToList();
                            output.WriteLine($"  {dep.Name} depends on: [{string.Join(", ", dependents)}]");
                        }
                        output.WriteLine("");
                    }

                    // Print external artifacts
                    if (fullGraph.TryGetProperty("externalArtifacts", out var externals) &&
                        externals.ValueKind == JsonValueKind.Array && externals.GetArrayLength() > 0)
                    {
                        output.WriteLine($"--- External Artifacts ({externals.GetArrayLength()}) ---");
                        foreach (var ext in externals.EnumerateArray())
                        {
                            var name = ext.TryGetProperty("name", out var n) ? n.GetString() : "?";
                            var flavor = ext.TryGetProperty("flavor", out var f) ? f.GetString() : "?";
                            var state = ext.TryGetProperty("currentState", out var s) ? s.GetString() : "?";
                            output.WriteLine($"  [{state}] {name} / {flavor}");
                        }
                        output.WriteLine("");
                    }
                }
                else
                {
                    output.WriteLine($"Error fetching full graph: {fullGraphBody}");
                }
            }
        }

        // Step 3: Also get optimistic media requests for the build
        output.WriteLine($"=== Optimistic Media Requests for build GUID: {TestBuildGuid} ===\n");

        var optimisticUrl = $"/api/v3.0/onDemandMedia/GetOptimisticMediaRequests/{TestBuildGuid}";
        var optimisticResponse = await client.GetAsync(optimisticUrl);
        var optimisticBody = await optimisticResponse.Content.ReadAsStringAsync();

        output.WriteLine($"GET {optimisticUrl}");
        output.WriteLine($"Status: {optimisticResponse.StatusCode}");

        if (optimisticResponse.IsSuccessStatusCode)
        {
            var optimisticResults = JsonSerializer.Deserialize<JsonElement>(optimisticBody);
            var prettyOptimistic = JsonSerializer.Serialize(optimisticResults, JsonOptions);
            output.WriteLine($"Optimistic Requests:\n{prettyOptimistic}\n");
        }
        else
        {
            output.WriteLine($"Error: {optimisticBody}");
        }
    }
}
