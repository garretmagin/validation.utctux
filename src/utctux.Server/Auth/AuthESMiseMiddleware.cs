using System.Net;
using System.Net.Http.Headers;
using Microsoft.EngSys.AuthES.Authorization;
using Microsoft.EngSys.AuthES.Identity;
using Microsoft.Extensions.Primitives;
using Microsoft.Identity.ServiceEssentials;
using Microsoft.IdentityModel.Tokens;
using AuthorizationData = Microsoft.EngSys.AuthES.Authorization.AuthorizationData;

namespace utctux.Server.Auth;

/// <summary>
/// ASP.NET Core middleware that validates Bearer tokens via MISE,
/// ported from <c>AuthESMiseAzFMiddleware</c> (Azure Functions).
/// </summary>
public sealed class AuthESMiseMiddleware : IMiddleware
{
    private readonly IMiseHandler _miseHandler;
    private readonly AuthorizationHelper _authHelper;
    private readonly ILogger<AuthESMiseMiddleware> _logger;

    public AuthESMiseMiddleware(
        IMiseHandler miseHandler,
        AuthorizationHelper authHelper,
        ILogger<AuthESMiseMiddleware> logger)
    {
        _miseHandler = miseHandler;
        _authHelper = authHelper;
        _logger = logger;
        AuthLogging.Logger = logger;
    }

    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        // Only validate tokens for /api routes; let health checks, static files, etc. through
        if (!context.Request.Path.StartsWithSegments("/api"))
        {
            await next(context);
            return;
        }

        try
        {
            var headers = context.Request.Headers
                .ToDictionary(h => h.Key, h => h.Value);

            // Fall back to auth cookie if no Authorization header present
            if (!headers.ContainsKey("Authorization"))
            {
                string? cookie = context.Request.Cookies[_authHelper.AuthPolicy.AuthCookieName];
                if (cookie is not null)
                {
                    headers["Authorization"] = new StringValues($"Bearer {cookie}");
                }
            }

            if (!headers.ContainsKey("Authorization"))
            {
                context.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                await context.Response.WriteAsync("Missing Authorization header");
                return;
            }

            MiseRequestAction action = _miseHandler.ValidateRequest(headers);
            MiseValidationResult result = await action.ExecuteAsync();

            if (result.HttpResponseStatusCode is not (int)HttpStatusCode.OK)
            {
                _logger.LogWarning("Token validation failed: {Error}", result.ErrorDescription);
                context.Response.StatusCode = result.HttpResponseStatusCode;
                await context.Response.WriteAsync(result.ErrorDescription ?? "Unauthorized");
                return;
            }

            AuthorizationData authData = await _authHelper.ProcessValidatedTokenAsync(result);

            if (authData is null)
            {
                context.Response.StatusCode = (int)HttpStatusCode.BadRequest;
                await context.Response.WriteAsync("Validated token not understood");
                return;
            }

            // Store raw token for downstream consumers
            if (headers.TryGetValue("Authorization", out var authHeaderValue)
                && AuthenticationHeaderValue.TryParse(authHeaderValue.ToString(), out var authHeader))
            {
                authData.SetRawToken(authHeader);
            }

            // Make auth data available to endpoint handlers
            context.Items[typeof(AuthorizationData)] = authData;

            // Set the ClaimsPrincipal so ASP.NET Core authorization works
            if (authData.Principal is not null)
            {
                context.User = authData.Principal;
            }

            await next(context);
        }
        catch (SecurityTokenException ex)
        {
            _logger.LogWarning(ex, "Security token rejected: {Message}", ex.Message);
            context.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            await context.Response.WriteAsync(ex.Message);
        }
    }
}
