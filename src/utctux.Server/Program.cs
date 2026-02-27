var builder = WebApplication.CreateBuilder(args);

// Add service defaults & Aspire client integrations.
builder.AddServiceDefaults();

// Add services to the container.
builder.Services.AddProblemDetails();
builder.Services.AddMemoryCache();
builder.Services.Configure<utctux.Server.Services.UtctAuthOptions>(
    builder.Configuration.GetSection(utctux.Server.Services.UtctAuthOptions.SectionName));
builder.Services.AddSingleton<utctux.Server.Services.AuthService>();
builder.Services.AddSingleton<utctux.Server.Services.NovaService>();
builder.Services.AddSingleton<utctux.Server.Services.TestResultsCache>();
builder.Services.AddSingleton<utctux.Server.Services.CloudTestService>();
builder.Services.AddSingleton<utctux.Server.Services.BuildListingService>();
builder.Services.AddSingleton<utctux.Server.Services.GitBranchService>();
builder.Services.AddSingleton<utctux.Server.Services.TestDataService>();
builder.Services.AddSingleton<utctux.Server.Services.BackgroundJobManager>();

// AuthES authentication & authorization (MISE-based token validation)
builder.Services.AddAuthESAuthentication(builder.Configuration);
builder.Services.AddAuthESAuthorization();
builder.Services.AddSingleton<utctux.Server.Auth.AuthESMiseMiddleware>();
builder.Services.AddAuthentication(utctux.Server.Auth.PassThroughAuthHandler.SchemeName)
    .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions,
        utctux.Server.Auth.PassThroughAuthHandler>(
        utctux.Server.Auth.PassThroughAuthHandler.SchemeName, null);
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("UsersOnly", policy => policy.RequireRole("Users"));
});

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
app.UseExceptionHandler();

app.UseMiddleware<utctux.Server.Auth.AuthESMiseMiddleware>();

// Serve static files before routing so the catch-all SPA fallback endpoint
// doesn't prevent StaticFileMiddleware from serving wwwroot assets.
app.UseFileServer();

app.UseRouting();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}


var api = app.MapGroup("/api").RequireAuthorization("UsersOnly");

api.MapGet("builds/branches", async (utctux.Server.Services.BuildListingService svc) =>
{
    try
    {
        return Results.Ok(await svc.GetBranchesAsync());
    }
    catch (Exception ex)
    {
        return Results.Problem(
            detail: ex.Message,
            title: "Failed to list branches",
            statusCode: 500);
    }
})
.WithName("GetBuildBranches");

api.MapGet("builds/branch/{branch}", async (string branch, int? count, utctux.Server.Services.BuildListingService svc) =>
{
    try
    {
        var builds = await svc.GetBuildsForBranchAsync(branch, count);
        return Results.Ok(builds);
    }
    catch (Exception ex)
    {
        return Results.Problem(
            detail: ex.Message,
            title: "Failed to list builds",
            statusCode: 500);
    }
})
.WithName("GetBuildsForBranch");

api.MapGet("testresults/{fqbn}/status", (string fqbn, utctux.Server.Services.BackgroundJobManager jobMgr) =>
{
    return Results.Ok(jobMgr.GetStatus(fqbn));
})
.WithName("GetTestResultsStatus");

api.MapGet("testresults/{*fqbn}", (string fqbn, utctux.Server.Services.TestResultsCache cache) =>
{
    var entry = cache.Get(fqbn);
    if (entry is null)
        return Results.NotFound();
    return Results.Ok(entry.Results);
})
.WithName("GetTestResults");

api.MapPost("testresults/{*fqbn}", (string fqbn, bool? refresh, HttpRequest request, utctux.Server.Services.BackgroundJobManager jobMgr, utctux.Server.Services.TestResultsCache cache) =>
{
    var forceRefresh = refresh == true;

    // If the client sent If-Modified-Since (e.g. page hard-reload), bypass cache entries older than that timestamp
    if (!forceRefresh
        && request.GetTypedHeaders().IfModifiedSince is { } ifModifiedSince
        && cache.Get(fqbn) is { } existing
        && existing.CachedAt < ifModifiedSince)
    {
        forceRefresh = true;
    }

    if (forceRefresh)
        cache.Remove(fqbn);

    if (!jobMgr.TryStartJob(fqbn, forceRefresh: forceRefresh))
        return Results.Conflict(jobMgr.GetStatus(fqbn));

    return Results.Accepted(value: jobMgr.GetStatus(fqbn));
})
.WithName("PostTestResults");

api.MapGet("me", (HttpContext ctx) => Results.Ok(new { name = ctx.User.Identity?.Name }))
.WithName("GetMe");

app.MapDefaultEndpoints();

// SPA fallback: serve index.html for client-side routes so React Router
// can handle them. Requests with recognized static-file extensions (e.g.
// .js, .css, .svg) that weren't already served by UseFileServer() get a
// proper 404 instead of index.html. FQBNs like "29541.1000.main.260225-1649"
// contain dots but have no recognized extension, so they correctly receive
// the SPA shell.
var contentTypeProvider = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
app.MapFallback("{*path}", async (HttpContext context) =>
{
    var path = context.Request.Path.Value ?? "";
    if (contentTypeProvider.TryGetContentType(path, out _))
    {
        context.Response.StatusCode = 404;
        return;
    }

    context.Response.ContentType = "text/html; charset=utf-8";
    await context.Response.SendFileAsync(
        app.Environment.WebRootFileProvider.GetFileInfo("index.html"));
});

app.Run();

