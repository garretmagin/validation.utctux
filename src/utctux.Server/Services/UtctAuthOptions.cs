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
    /// When false, uses managed identity (production/server).
    /// </summary>
    public bool UseInteractiveAuth { get; set; }

    /// <summary>
    /// The UTCT API environment to target (e.g. "Production", "Staging").
    /// </summary>
    public string UtctApiEnvironment { get; set; } = "Production";
}
