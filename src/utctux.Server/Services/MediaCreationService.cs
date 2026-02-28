namespace utctux.Server.Services;

/// <summary>
/// Service wrapper for the Media Creation API.
/// Provides methods to search request graphs and fetch full dependency graphs.
/// </summary>
public class MediaCreationService
{
    private readonly AuthService _authService;
    private readonly ILogger<MediaCreationService> _logger;

    public MediaCreationService(AuthService authService, ILogger<MediaCreationService> logger)
    {
        _authService = authService;
        _logger = logger;
    }

    public async Task<FullRequestGraph?> GetRequestGraphForBuildAsync(Guid buildGuid)
    {
        try
        {
            var api = _authService.GetMediaCreationApi<IMediaCreationApi>();
            var searchResults = await api.SearchRequestGraphsAsync(buildGuid);

            // Find the first official, non-cancelled, non-synthetic graph
            var graph = searchResults
                .Where(r => r.IsOfficial && !r.IsCancelled && !r.IsSynthetic)
                .OrderByDescending(r => r.CreatedTimeUtc)
                .FirstOrDefault();

            if (graph is null)
            {
                _logger.LogInformation("No official request graph found for build GUID {BuildGuid}", buildGuid);
                return null;
            }

            _logger.LogInformation("Found request graph {GraphId} for build GUID {BuildGuid}", graph.Id, buildGuid);
            return await api.GetFullRequestGraphAsync(graph.Id);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load Media Creation request graph for build GUID {BuildGuid}", buildGuid);
            return null;
        }
    }
}
