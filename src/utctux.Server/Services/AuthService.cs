using Azure.Core;
using Azure.Identity;
using Common.DiscoverClient;
using Common.MsalAuth;
using Microsoft.Extensions.Options;
using Microsoft.Identity.Web;
using Refit;
using UtctClient;

namespace utctux.Server.Services;

/// <summary>
/// Provides authenticated HTTP clients for downstream APIs
/// (CloudTest, Nova, ADO, UTCT, Discover) using MSAL-based authentication.
/// </summary>
public class AuthService
{
    public const string CloudTestScope = "77c466d9-b133-4a83-a8f5-c94133051e06/.default";
    public const string CloudTestEndpoint = "https://api.prod.cloudtest.microsoft.com";

    public const string NovaApiScope = "https://mspmecloud.onmicrosoft.com/Es-novaapi/.default";
    public const string NovaApiBaseAddress = "https://api.es.microsoft.com/novaapi-pme/";

    public const string GitBranchApiScope = "https://mspmecloud.onmicrosoft.com/os-branch-api/.default";
    public const string GitBranchApiBaseAddress = "https://os-branch-api.azurefd.net/api/v1/";

    public const string AzureDevOpsScope = "499b84ac-1321-427f-aa17-267ca6975798/.default";

    private static readonly string AuthRecordPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "utctux-auth-record.json");

    private readonly ILogger<AuthService> _logger;
    private readonly UtctAuthOptions _options;
    private readonly Lazy<TokenCredential> _cachedCredential;
    private readonly Lazy<TokenCredential> _serviceCredential;

    public AuthService(ILogger<AuthService> logger, IOptions<UtctAuthOptions> options)
    {
        _logger = logger;
        _options = options.Value;
        _cachedCredential = new Lazy<TokenCredential>(CreateUserTokenCredential);
        _serviceCredential = new Lazy<TokenCredential>(CreateServiceTokenCredential);
    }

    /// <summary>
    /// Gets a <see cref="TokenCredential"/> for the current environment.
    /// Uses interactive/cached MSAL tokens for local dev, or federated
    /// managed identity credential for production.
    /// </summary>
    public TokenCredential GetTokenCredential()
    {
        if (_options.UseInteractiveAuth)
        {
            return _cachedCredential.Value;
        }

        return _serviceCredential.Value;
    }

    /// <summary>
    /// Gets an authenticated <see cref="HttpClient"/> for the CloudTest API.
    /// </summary>
    public HttpClient GetCloudTestHttpClient()
    {
        var client = CreateAuthenticatedHttpClient(CloudTestScope);
        client.BaseAddress = new Uri(CloudTestEndpoint);
        return client;
    }

    /// <summary>
    /// Gets an authenticated Refit client for the CloudTest API.
    /// </summary>
    public T GetCloudTestApi<T>() where T : class =>
        RestService.For<T>(GetCloudTestHttpClient());

    /// <summary>
    /// Gets an authenticated <see cref="HttpClient"/> for the Nova API.
    /// </summary>
    public HttpClient GetNovaHttpClient()
    {
        var client = CreateAuthenticatedHttpClient(NovaApiScope);
        client.BaseAddress = new Uri(NovaApiBaseAddress);
        return client;
    }

    /// <summary>
    /// Gets an authenticated Refit client for the Nova API.
    /// </summary>
    public T GetNovaApi<T>() where T : class =>
        RestService.For<T>(GetNovaHttpClient());

    /// <summary>
    /// Gets an authenticated <see cref="HttpClient"/> for the GitBranch API.
    /// </summary>
    public HttpClient GetGitBranchHttpClient()
    {
        var client = CreateAuthenticatedHttpClient(GitBranchApiScope);
        client.BaseAddress = new Uri(GitBranchApiBaseAddress);
        return client;
    }

    /// <summary>
    /// Gets an authenticated <see cref="HttpClient"/> for Azure DevOps.
    /// </summary>
    public HttpClient GetAdoHttpClient() =>
        CreateAuthenticatedHttpClient(AzureDevOpsScope);

    /// <summary>
    /// Gets a UTCT API client configured for the specified environment.
    /// Uses a token getter callback to acquire tokens on demand.
    /// </summary>
    public IUtctApiClient GetUtctApiClient(ApiEnvironment? apiEnvironment = null)
    {
        var env = apiEnvironment ?? Enum.Parse<ApiEnvironment>(_options.UtctApiEnvironment);
        var connectionInfo = UtctApiClient.GetApiConnectionInfo(env);
        Func<Task<string>>? tokenGetter = null;

        if (connectionInfo.RequiresAuth)
        {
            var credential = GetTokenCredential();
            tokenGetter = async () =>
            {
                var context = new TokenRequestContext([connectionInfo.AuthScope]);
                var token = await credential.GetTokenAsync(context, CancellationToken.None);
                return token.Token;
            };
        }

        return UtctApiClient.Create(connectionInfo, tokenGetter);
    }

    /// <summary>
    /// Gets a Discover build client targeting the PME tenant.
    /// </summary>
    public IDiscoverBuildClient GetDiscoverClient()
    {
        var settings = DiscoverClientSettings.TargetingPmeTenant();
        var credential = GetTokenCredential();
        return new DiscoverServiceClient(credential, AzureTenant.Microsoft, settings);
    }

    private HttpClient CreateAuthenticatedHttpClient(string scope)
    {
        var credential = GetTokenCredential();
        var tokenRequestContext = new TokenRequestContext([scope], tenantId: AzureTenant.Microsoft);
        var handler = new MsalHttpClientHandler(credential, tokenRequestContext)
        {
            InnerHandler = new HttpClientHandler()
        };
        return new HttpClient(handler);
    }

    /// <summary>
    /// Creates a <see cref="ClientAssertionCredential"/> using a user-assigned managed identity
    /// for federated credential authentication. Mirrors UTCT3's CloudAuthContextHelper pattern.
    /// </summary>
    private TokenCredential CreateServiceTokenCredential()
    {
        if (string.IsNullOrEmpty(_options.ManagedIdentityClientId))
        {
            throw new InvalidOperationException(
                "UtctAuth:ManagedIdentityClientId must be configured for production auth. " +
                "Set the UtctAuth__ManagedIdentityClientId environment variable.");
        }

        _logger.LogInformation("Using federated managed identity credential (MI: {MiClientId}, App: {AppClientId})",
            _options.ManagedIdentityClientId, _options.ServiceClientId);

        var assertion = new ManagedIdentityClientAssertion(_options.ManagedIdentityClientId);
        return new ClientAssertionCredential(
            AzureTenant.Microsoft,
            _options.ServiceClientId,
            async (ct) => await assertion.GetSignedAssertionAsync(null));
    }

    private TokenCredential CreateUserTokenCredential()
    {
        // Load a previously-saved AuthenticationRecord so the credential can
        // silently redeem cached refresh tokens without opening a browser.
        AuthenticationRecord? record = null;
        if (File.Exists(AuthRecordPath))
        {
            using var stream = File.OpenRead(AuthRecordPath);
            record = AuthenticationRecord.Deserialize(stream);
        }

        var options = new InteractiveBrowserCredentialOptions
        {
            TenantId = AzureTenant.Microsoft,
            ClientId = _options.ServiceClientId,
            TokenCachePersistenceOptions = new TokenCachePersistenceOptions
            {
                Name = "utctux-dev-cache",
            },
            AuthenticationRecord = record,
        };

        var credential = new InteractiveBrowserCredential(options);

        if (record is null)
        {
            // First run: force an interactive auth and persist the record
            // so future runs (and requests within this run) are silent.
            // Use a scope from the app registration's allowed resources.
            var context = new TokenRequestContext([AzureDevOpsScope]);
            var newRecord = credential.Authenticate(context);
            using var stream = File.Create(AuthRecordPath);
            newRecord.Serialize(stream);
        }

        return credential;
    }
}
