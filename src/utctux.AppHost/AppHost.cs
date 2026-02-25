var builder = DistributedApplication.CreateBuilder(args);

builder.AddAzureContainerAppEnvironment("utctux-env");

var insights = builder.AddAzureApplicationInsights("appinsights");

var server = builder.AddProject<Projects.utctux_Server>("server")
    .WithHttpHealthCheck("/health")
    .WithExternalHttpEndpoints()
    .WithReference(insights);

var webfrontend = builder.AddViteApp("webfrontend", "../frontend")
    .WithEndpoint("http", e => e.Port = 5173)
    .WithReference(server)
    .WaitFor(server);

server.PublishWithContainerFiles(webfrontend, "wwwroot");

builder.Build().Run();
