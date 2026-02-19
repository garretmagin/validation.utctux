using System.Net.Http.Headers;
using System.Text.Json;

namespace utctux.Server.Models;

/// <summary>
/// Represents an Azure DevOps organization and project URI.
/// Supports both dev.azure.com/{org}/{project} and {org}.visualstudio.com/{project} formats.
/// </summary>
public class AzureDevOpsUri
{
    public Uri Uri => new($"{OrganizationUri}{Project}");

    public Uri OrganizationUri => new($"https://dev.azure.com/{OrganizationName}/");

    public string OrganizationName { get; set; } = string.Empty;

    public string Project { get; set; } = string.Empty;

    public Guid? ProjectGuid { get; set; }

    /// <summary>
    /// Parses an Azure DevOps URI into its organization and project components.
    /// Supports both https://dev.azure.com/{org}/{project}/... and https://{org}.visualstudio.com/{project}/... formats.
    /// </summary>
    public static AzureDevOpsUri CreateFromUri(Uri uri)
    {
        var parts = uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);

        var orgName = string.Empty;
        var projectName = string.Empty;

        if (uri.Host.Contains("dev.azure.com", StringComparison.OrdinalIgnoreCase))
        {
            orgName = parts[0];
            if (parts.Length > 1)
            {
                projectName = parts[1];
            }
        }
        else if (uri.Host.Contains("visualstudio.com", StringComparison.OrdinalIgnoreCase))
        {
            orgName = uri.Host.Split('.')[0];
            if (parts.Length > 0)
            {
                projectName = parts[0];
            }
        }

        Guid? projectGuid = null;
        if (Guid.TryParse(projectName, out var projectId))
        {
            projectGuid = projectId;
        }

        return new AzureDevOpsUri
        {
            OrganizationName = orgName,
            Project = projectName,
            ProjectGuid = projectGuid,
        };
    }

    /// <summary>
    /// Extracts a build ID from an Azure DevOps build results URI query string (buildId parameter).
    /// Returns null if the URI does not contain a buildId.
    /// </summary>
    public static int? ExtractBuildId(Uri uri)
    {
        var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
        var buildIdValue = query["buildId"];
        if (int.TryParse(buildIdValue, out var buildId))
        {
            return buildId;
        }

        return null;
    }

    /// <summary>
    /// Resolves the project GUID by calling the Azure DevOps Projects REST API.
    /// Requires an HttpClient with appropriate authentication already configured.
    /// </summary>
    public async Task ResolveProjectGuid(HttpClient httpClient, CancellationToken cancellationToken = default)
    {
        if (ProjectGuid.HasValue)
        {
            return;
        }

        var requestUri = $"{OrganizationUri}_apis/projects/{Uri.EscapeDataString(Project)}?api-version=7.1";

        using var request = new HttpRequestMessage(HttpMethod.Get, requestUri);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);

        if (doc.RootElement.TryGetProperty("id", out var idElement) &&
            Guid.TryParse(idElement.GetString(), out var resolvedGuid))
        {
            ProjectGuid = resolvedGuid;
        }
    }

    /// <summary>
    /// Generates an Azure DevOps build results URI.
    /// </summary>
    public static Uri GenerateBuildUri(Uri organizationUri, string projectGuidOrName, int buildId)
        => new(organizationUri, $"{projectGuidOrName}/_build/results?buildId={buildId}");

    /// <summary>
    /// Generates an Azure DevOps build results URI with job and task details.
    /// </summary>
    public static Uri GenerateBuildUri(Uri organizationUri, string projectGuidOrName, int buildId, Guid jobGuid, Guid taskGuid)
        => new(organizationUri, $"{projectGuidOrName}/_build/results?buildId={buildId}&view=logs&j={jobGuid}&t={taskGuid}");
}
