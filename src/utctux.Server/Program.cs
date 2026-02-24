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

api.MapPost("testresults/{*fqbn}", (string fqbn, bool? refresh, utctux.Server.Services.BackgroundJobManager jobMgr, utctux.Server.Services.TestResultsCache cache) =>
{
    if (refresh == true)
        cache.Remove(fqbn);

    if (!jobMgr.TryStartJob(fqbn, forceRefresh: refresh == true))
        return Results.Conflict(jobMgr.GetStatus(fqbn));

    return Results.Accepted(value: jobMgr.GetStatus(fqbn));
})
.WithName("PostTestResults");

api.MapGet("me", (HttpContext ctx) => Results.Ok(new { name = ctx.User.Identity?.Name }))
.WithName("GetMe");

app.MapDefaultEndpoints();

app.UseFileServer();

app.Run();

