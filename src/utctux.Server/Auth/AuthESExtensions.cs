using Microsoft.EngSys.AuthES.Authorization;
using Microsoft.EngSys.AuthES.Identity;
using Microsoft.Identity.ServiceEssentials;

namespace Microsoft.Extensions.DependencyInjection;

/// <summary>
/// ASP.NET Core equivalents of AddAuthESAuthentication / AddAuthESAuthorization
/// from Microsoft.EngSys.AzureFunctions, ported for use in ASP.NET Core web apps.
/// </summary>
public static class AuthESExtensions
{
    /// <summary>
    /// Register AuthES authentication services (Identities and ExternalResources).
    /// </summary>
    public static void AddAuthESAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton(_ =>
        {
            var identities = new Identities();
            identities.AddIdentities(configuration);
            return identities;
        });

        services.AddSingleton(sp =>
        {
            var identities = sp.GetRequiredService<Identities>();
            var resources = new ExternalResources(identities);
            resources.AddResourcesAsync(configuration).GetAwaiter().GetResult();
            return resources;
        });
    }

    /// <summary>
    /// Register AuthES authorization services (AuthorizationHelper, AuthPolicy, MISE).
    /// </summary>
    public static void AddAuthESAuthorization(this IServiceCollection services)
    {
        var authHelper = CreateAuthorizationHelper(services);
        services.AddSingleton(_ => authHelper);
        services.AddSingleton(_ => authHelper.AuthPolicy);

        IConfiguration miseConfig = MiseConfigurationHelper.CreateMiseConfiguration(
            authHelper.AuthPolicy,
            AuthLogging.Logger);
        services.AddMiseStandard(miseConfig);
    }

    private static AuthorizationHelper CreateAuthorizationHelper(IServiceCollection services)
    {
        var serviceProvider = services.BuildServiceProvider();
        var config = serviceProvider.GetRequiredService<IConfiguration>();

        var authOptions = new Microsoft.EngSys.AuthES.Authorization.AuthorizationOptions();
        config.GetSection("Authorization").Bind(authOptions);

        AuthorizationPolicy? authPolicy;

        if (string.IsNullOrEmpty(authOptions.PolicyFileLocation))
        {
            authPolicy = AuthorizationPolicy.LoadFromConfiguration(config);
        }
        else if (File.Exists(authOptions.PolicyFileLocation))
        {
            authPolicy = AuthorizationPolicy.LoadFromFile(authOptions.PolicyFileLocation);
        }
        else
        {
            throw new InvalidOperationException(
                $"Authorization policy file not found: {authOptions.PolicyFileLocation}");
        }

        if (authPolicy is null)
        {
            throw new InvalidOperationException("Unable to load authorization policy");
        }

        return new AuthorizationHelper(services, authPolicy, authOptions);
    }
}
