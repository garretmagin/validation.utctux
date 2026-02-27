using Aspire.Hosting.Azure;

var builder = DistributedApplication.CreateBuilder(args);

builder.AddAzureContainerAppEnvironment("utctux-env");

var insights = builder.AddAzureApplicationInsights("appinsights");

var customDomain = builder.AddParameter("customDomain");
var certificateName = builder.AddParameter("certificateName");

var server = builder.AddProject<Projects.utctux_Server>("server")
    .WithHttpHealthCheck("/health")
    .WithExternalHttpEndpoints()
    .WithReference(insights)
    .PublishAsAzureContainerApp((infra, app) =>
    {
        app.ConfigureCustomDomain(customDomain, certificateName);
    });

if (builder.ExecutionContext.IsPublishMode)
{
    var identity = builder.AddAzureUserAssignedIdentity("id-utctux")
        .PublishAsExisting("id-utctux", "utctux");

    server.WithAzureUserAssignedIdentity(identity)
        .WithEnvironment("UtctAuth__ManagedIdentityClientId", identity.Resource.ClientId);
}

var webfrontend = builder.AddViteApp("webfrontend", "../frontend")
    .WithEndpoint("http", e => e.Port = 5173)
    .WithReference(server)
    .WaitFor(server);

server.PublishWithContainerFiles(webfrontend, "wwwroot");

builder.Build().Run();
