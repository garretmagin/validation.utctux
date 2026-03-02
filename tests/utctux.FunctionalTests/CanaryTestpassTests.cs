using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using utctux.Server.Models;
using utctux.Server.Services;
using Xunit;
using Xunit.Abstractions;

namespace utctux.FunctionalTests;

/// <summary>
/// Functional tests that verify completed testpasses with 100% pass rate
/// are correctly reported as "Passed".
/// </summary>
public class CanaryTestpassTests(ITestOutputHelper output)
{
    private const string Fqbn = "29543.1000.rs_es.260227-1650";
    private const string TestpassName = "Canary [Enterprise-arm64-SP11_Canary]";

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

        var mediaCreationService = new MediaCreationService(
            authService,
            loggerFactory.CreateLogger<MediaCreationService>());

        return new TestDataService(
            authService,
            cloudTestService,
            novaService,
            mediaCreationService,
            loggerFactory.CreateLogger<TestDataService>());
    }

    [Fact]
    public async Task LoadTestResults_CompletedCanaryTestpass_IsReportedAsPassed()
    {
        // Arrange
        var svc = CreateTestDataService();
        var progress = new Progress<string>(msg => output.WriteLine($"[Progress] {msg}"));

        // Act
        var (results, _, _) = await svc.LoadTestResultsAsync(Fqbn, progress);

        // Assert — find the specific testpass
        var testpass = results.FirstOrDefault(r =>
            r.TestpassSummary?.TestpassName == TestpassName);

        Assert.NotNull(testpass);
        output.WriteLine($"Testpass: {testpass.TestpassSummary?.TestpassName}");
        output.WriteLine($"ExecutionSystem: {testpass.TestpassSummary?.ExecutionSystem}");
        output.WriteLine($"Status: {testpass.Status}");
        output.WriteLine($"Result: {testpass.Result}");

        if (testpass.NovaTestpass is { } nova)
        {
            output.WriteLine($"Nova TestPassName: {nova.TestPassName}");
            output.WriteLine($"Nova StatusName: {nova.StatusName}");
            output.WriteLine($"Nova PassRate: {nova.PassRate}");
            output.WriteLine($"Nova ExecutionRate: {nova.ExecutionRate}");
            output.WriteLine($"Nova StartTime: {nova.StartTime}");
            output.WriteLine($"Nova EndTime: {nova.EndTime}");
        }
        else
        {
            output.WriteLine("NovaTestpass: null (no Nova data matched!)");
        }

        output.WriteLine($"TestSession: {(testpass.TestSession is null ? "null" : "present")}");
        output.WriteLine($"ChunkAvailability count: {testpass.ChunkAvailability.Count}");

        var timing = new TestpassTimingData(testpass);
        output.WriteLine($"TimingData.Status: {timing.Status}");
        output.WriteLine($"TimingData.Result: {timing.Result}");
        output.WriteLine($"TimingData.IsRunning: {timing.IsRunning}");
        output.WriteLine($"TimingData.IsFailed: {timing.IsFailed}");
        output.WriteLine($"TimingData.IsPassed: {timing.IsPassed}");

        // The testpass completed with 100% pass rate and 100% completion rate.
        // It must be reported as Passed, not Unknown or Failed.
        Assert.Equal("Passed", testpass.Result);
        Assert.True(timing.IsPassed,
            $"Completed testpass with 100% pass/completion rate should be Passed, but was Result='{timing.Result}', Status='{timing.Status}'");
    }
}
