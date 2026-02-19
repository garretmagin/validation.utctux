using Refit;
using utctux.Server.Models;

namespace utctux.Server.Services;

/// <summary>
/// Refit interface for the Nova API.
/// </summary>
public interface INovaRestApi
{
    [Get("/TestReport/Default?buildString={buildString}")]
    Task<List<NovaTestpass>> GetTestReport(string buildString);

    [Get("/TestPass/SummaryResults?testPassGuid={testPassGuid}&noCache=true")]
    Task<NovaTestpassSummary> GetTestPassSummaryResults(Guid testPassGuid);

    [Get("/TestPass/Family?testPassGuid={testPassGuid}&noCache=true")]
    Task<NovaTestPassFamily> GetTestPassFamily(Guid testPassGuid);
}

/// <summary>
/// Wrapper around <see cref="INovaRestApi"/> that obtains authenticated clients via <see cref="AuthService"/>.
/// </summary>
public class NovaService
{
    private readonly AuthService _authService;
    private readonly ILogger<NovaService> _logger;

    public NovaService(AuthService authService, ILogger<NovaService> logger)
    {
        _authService = authService;
        _logger = logger;
    }

    private INovaRestApi Api => _authService.GetNovaApi<INovaRestApi>();

    /// <summary>
    /// Gets test reports for a given build string.
    /// </summary>
    public async Task<List<NovaTestpass>> GetTestReportAsync(string buildString)
    {
        _logger.LogDebug("Fetching Nova test report for build {BuildString}", buildString);
        return await Api.GetTestReport(buildString);
    }

    /// <summary>
    /// Gets detailed summary results for a test pass.
    /// </summary>
    public async Task<NovaTestpassSummary> GetTestPassSummaryAsync(Guid testPassGuid)
    {
        _logger.LogDebug("Fetching Nova summary for testpass {TestPassGuid}", testPassGuid);
        return await Api.GetTestPassSummaryResults(testPassGuid);
    }

    /// <summary>
    /// Gets the test pass family (parent/child rerun relationships).
    /// </summary>
    public async Task<NovaTestPassFamily> GetTestPassFamilyAsync(Guid testPassGuid)
    {
        _logger.LogDebug("Fetching Nova family for testpass {TestPassGuid}", testPassGuid);
        return await Api.GetTestPassFamily(testPassGuid);
    }
}
