using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace utctux.Server.Auth;

/// <summary>
/// A no-op authentication handler that defers to <see cref="AuthESMiseMiddleware"/>
/// for actual token validation. This handler exists solely so ASP.NET Core's
/// authorization middleware can issue Forbid (403) and Challenge (401) responses
/// when policy checks fail.
/// </summary>
public sealed class PassThroughAuthHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "AuthES";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        // The middleware already set HttpContext.User; just reflect that here.
        if (Context.User?.Identity?.IsAuthenticated == true)
            return Task.FromResult(AuthenticateResult.Success(
                new AuthenticationTicket(Context.User, Scheme.Name)));

        return Task.FromResult(AuthenticateResult.NoResult());
    }

    protected override Task HandleForbiddenAsync(AuthenticationProperties? properties)
    {
        Context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return Task.CompletedTask;
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties? properties)
    {
        Context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return Task.CompletedTask;
    }
}
