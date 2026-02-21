using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using utctux.Server.Models;
using utctux.Server.Services;
using Xunit;
using Xunit.Abstractions;

namespace utctux.FunctionalTests;

/// <summary>
/// Functional tests that verify rerun data loading against live APIs.
/// These tests require valid cached credentials in %APPDATA%/utctux-auth-record.json.
/// </summary>
public class RerunDataTests(ITestOutputHelper output)
{
    private const string Fqbn = "29536.1000.main.260217-1323";
    private const string TestpassName = "WinBVT CLIENT [Enterprise-arm64-BR-WinBVT]";

    private TestDataService CreateTestDataService()
    {
        var loggerFactory = LoggerFactory.Create(builder =>
        {
            builder.AddConsole();
            builder.SetMinimumLevel(LogLevel.Debug);
        });

        var authOptions = Options.Create(new UtctAuthOptions
        {
            UseInteractiveAuth = true,
            UtctApiEnvironment = "Production",
        });

        var authService = new AuthService(
            loggerFactory.CreateLogger<AuthService>(),
            authOptions);

        var novaService = new NovaService(
            authService,
            loggerFactory.CreateLogger<NovaService>());

        var cloudTestService = new CloudTestService(authService);

        return new TestDataService(
            authService,
            cloudTestService,
            novaService,
            loggerFactory.CreateLogger<TestDataService>());
    }

    [Fact]
    public async Task LoadTestResults_RerunTestpass_HasNoDuplicateRuns()
    {
        // Arrange
        var svc = CreateTestDataService();
        var progress = new Progress<string>(msg => output.WriteLine($"[Progress] {msg}"));

        // Act
        var (results, _) = await svc.LoadTestResultsAsync(Fqbn, progress);

        // Assert — find the specific testpass
        var testpass = results.FirstOrDefault(r =>
            r.TestpassSummary?.TestpassName == TestpassName);

        Assert.NotNull(testpass);
        output.WriteLine($"Testpass: {testpass.TestpassSummary?.TestpassName}");
        output.WriteLine($"IsRerun: {testpass.TestpassSummary?.IsRerun}");
        output.WriteLine($"UTCT GUID: {testpass.TestpassSummary?.TestpassGuid}");
        output.WriteLine($"Nova GUID: {testpass.NovaTestpass?.TestPassGuid}");
        output.WriteLine($"Nova ID: {testpass.NovaTestpass?.TestPassId}");
        output.WriteLine($"Runs count: {testpass.Runs.Count}");

        foreach (var run in testpass.Runs)
        {
            var name = run.TestpassSummary?.TestpassName
                ?? run.NovaTestpass?.TestPassName
                ?? "Unknown";
            var utctGuid = run.TestpassSummary?.TestpassGuid;
            var novaGuid = run.NovaTestpass?.TestPassGuid;
            var novaId = run.NovaTestpass?.TestPassId;
            var start = run.NovaTestpass?.StartTime;
            var end = run.NovaTestpass?.EndTime;
            output.WriteLine($"  Run: {name}");
            output.WriteLine($"    UTCT GUID={utctGuid} | Nova GUID={novaGuid} | Nova ID={novaId}");
            output.WriteLine($"    Start={start} | End={end}");
            output.WriteLine($"    IsCurrentRun={run.IsCurrentRun} | IsRerun={run.TestpassSummary?.IsRerun}");
        }

        // Should have exactly 2 runs: the current + 1 sibling found via Nova family
        Assert.Equal(2, testpass.Runs.Count);

        // Exactly one should be marked as current
        Assert.Single(testpass.Runs, r => r.IsCurrentRun);

        // All GUIDs should be unique (no duplicates)
        var guids = testpass.Runs
            .Select(r => r.TestpassSummary?.TestpassGuid ?? r.NovaTestpass?.TestPassGuid ?? Guid.Empty)
            .Where(g => g != Guid.Empty)
            .ToList();
        Assert.Equal(guids.Count, guids.Distinct().Count());
    }
}
