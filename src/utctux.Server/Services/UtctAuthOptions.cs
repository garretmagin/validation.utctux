namespace utctux.Server.Services;

/// <summary>
/// Configuration options for authentication behavior.
/// Bound from the "UtctAuth" configuration section.
/// </summary>
public class UtctAuthOptions
{
    public const string SectionName = "UtctAuth";

    /// <summary>
    /// When true, uses interactive/cached MSAL user tokens (local dev).
    /// When false, uses federated managed identity credential (production/server).
    /// </summary>
    public bool UseInteractiveAuth { get; set; }

    /// <summary>
    /// The Entra ID application (client) ID used for outbound service-to-service auth.
    /// Defaults to the UTCT app registration.
    /// </summary>
    public string ServiceClientId { get; set; } = "654d70d7-a63f-408d-81fe-6aeedb717be9";

    /// <summary>
    /// The client ID of the user-assigned managed identity used for federated credential auth.
    /// Required when <see cref="UseInteractiveAuth"/> is false.
    /// Set via environment variable <c>UtctAuth__ManagedIdentityClientId</c> in deployment.
    /// </summary>
    public string? ManagedIdentityClientId { get; set; }

    /// <summary>
    /// The UTCT API environment to target (e.g. "Production", "Staging").
    /// </summary>
    public string UtctApiEnvironment { get; set; } = "Production";
}
