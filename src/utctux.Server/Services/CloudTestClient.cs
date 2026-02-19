using Refit;
using utctux.Server.Models;

namespace utctux.Server.Services;

/// <summary>
/// Refit interface for the CloudTest REST API.
/// </summary>
[Headers("Authorization: Bearer")]
public interface ICloudTestRestApi
{
    [Get("/api/sessions?pipelineIdentifier=vsts/build/{projectId}/{buildId}")]
    Task<IReadOnlyList<TestSession>> GetByPipelineAsync(string projectId, int buildId);
}

/// <summary>
/// Wrapper service that creates an authenticated CloudTest Refit client via AuthService.
/// </summary>
public class CloudTestService
{
    private readonly AuthService _authService;

    public CloudTestService(AuthService authService)
    {
        _authService = authService;
    }

    /// <summary>
    /// Gets test sessions for a specific ADO build.
    /// </summary>
    public Task<IReadOnlyList<TestSession>> GetSessionsByBuildAsync(string projectId, int buildId)
    {
        var api = _authService.GetCloudTestApi<ICloudTestRestApi>();
        return api.GetByPipelineAsync(projectId, buildId);
    }
}
