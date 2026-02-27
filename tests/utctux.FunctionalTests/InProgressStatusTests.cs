using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using utctux.Server.Models;
using utctux.Server.Services;
using Xunit;
using Xunit.Abstractions;

namespace utctux.FunctionalTests;

/// <summary>
/// Functional tests that verify in-progress testpasses are not incorrectly reported as Failed.
/// These tests require valid cached credentials in %APPDATA%/utctux-auth-record.json.
/// </summary>
public class InProgressStatusTests(ITestOutputHelper output)
{
    private const string Fqbn = "29542.1000.main.260226-1659";
    private const string TestpassName = "WinBVT [Enterprise-amd64-SL7LNL]";

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
    public async Task LoadTestResults_InProgressTestpass_IsNotReportedAsFailed()
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
        output.WriteLine($"Status: {testpass.Status}");
        output.WriteLine($"Result: {testpass.Result}");

        var timing = new TestpassTimingData(testpass);
        output.WriteLine($"TimingData.Status: {timing.Status}");
        output.WriteLine($"TimingData.Result: {timing.Result}");
        output.WriteLine($"TimingData.IsRunning: {timing.IsRunning}");
        output.WriteLine($"TimingData.IsFailed: {timing.IsFailed}");
        output.WriteLine($"TimingData.IsPassed: {timing.IsPassed}");

        if (testpass.NovaTestpass is { } nova)
        {
            output.WriteLine($"Nova StatusName: {nova.StatusName}");
            output.WriteLine($"Nova PassRate: {nova.PassRate}");
            output.WriteLine($"Nova ExecutionRate: {nova.ExecutionRate}");
        }

        // A testpass whose status indicates it's still running should NOT be reported as Failed.
        // The raw Result property must return "InProgress" so it bubbles up correctly
        // to the testpass details table in the UX.
        Assert.True(timing.IsRunning,
            $"Expected testpass to be running, but Status was '{timing.Status}'");
        Assert.False(timing.IsFailed,
            $"In-progress testpass should not be marked as Failed. Status='{timing.Status}', Result='{timing.Result}'");
        Assert.NotEqual("Failed", testpass.Result);
        Assert.Equal("InProgress", testpass.Result);
    }
}
