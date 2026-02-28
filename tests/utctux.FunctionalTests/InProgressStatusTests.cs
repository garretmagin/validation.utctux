using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using UtctClient.Data.Common;
using utctux.Server.Models;
using utctux.Server.Services;
using Xunit;
using Xunit.Abstractions;

namespace utctux.FunctionalTests;

/// <summary>
/// Functional tests that verify non-terminal testpasses (in-progress, waiting for dependencies)
/// are not incorrectly reported as Failed.
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
        var (results, _, _) = await svc.LoadTestResultsAsync(Fqbn, progress);

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

    [Fact]
    public async Task LoadTestResults_WaitingForDependencies_IsNotReportedAsFailed()
    {
        // Arrange — a testpass whose chunk dependencies are not yet available,
        // so scheduling hasn't been attempted. It should show as waiting, not failed.
        const string waitingTestpassName = "ACG AutoPlusCore ARM64 Server [ServerDataCenter-arm64-VM_4VP_8GB-DES_C2154-ACG-AutoPlusCore]";

        var svc = CreateTestDataService();
        var progress = new Progress<string>(msg => output.WriteLine($"[Progress] {msg}"));

        // Act
        var (results, _, _) = await svc.LoadTestResultsAsync(Fqbn, progress);

        // Assert — find the specific testpass
        var testpass = results.FirstOrDefault(r =>
            r.TestpassSummary?.TestpassName == waitingTestpassName);

        Assert.NotNull(testpass);
        output.WriteLine($"Testpass: {testpass.TestpassSummary?.TestpassName}");
        output.WriteLine($"Status: {testpass.Status}");
        output.WriteLine($"Result: {testpass.Result}");
        output.WriteLine($"NovaTestpass: {(testpass.NovaTestpass is null ? "null" : "present")}");
        output.WriteLine($"TestSession: {(testpass.TestSession is null ? "null" : "present")}");
        output.WriteLine($"ChunkAvailability count: {testpass.ChunkAvailability.Count}");

        foreach (var chunk in testpass.ChunkAvailability)
        {
            output.WriteLine($"  Chunk: {chunk.ChunkName} ({chunk.Flavor}) | AvailableAt={chunk.AvailableAt?.ToString() ?? "NOT AVAILABLE"}");
        }

        var timing = new TestpassTimingData(testpass);
        output.WriteLine($"TimingData.Status: {timing.Status}");
        output.WriteLine($"TimingData.Result: {timing.Result}");
        output.WriteLine($"TimingData.IsRunning: {timing.IsRunning}");
        output.WriteLine($"TimingData.IsFailed: {timing.IsFailed}");
        output.WriteLine($"TimingData.IsPassed: {timing.IsPassed}");

        // No execution should have started — Nova shows "NotStarted"
        Assert.NotNull(testpass.NovaTestpass);
        Assert.Equal("NotStarted", testpass.NovaTestpass!.StatusName);
        Assert.Null(testpass.TestSession);

        // Should have chunk dependencies, some of which are not yet available
        Assert.NotEmpty(testpass.ChunkAvailability);
        Assert.Contains(testpass.ChunkAvailability, chunk => chunk.AvailableAt is null);

        // The testpass should be reported as "WaitingForDependencies", not "Failed" or "Unknown"
        Assert.Equal("WaitingForDependencies", testpass.Status);
        Assert.Equal("WaitingForDependencies", testpass.Result);
        Assert.False(timing.IsFailed,
            $"Testpass waiting for dependencies should not be marked as Failed. Status='{timing.Status}', Result='{timing.Result}'");
    }

    [Fact]
    public async Task LoadTestResults_CloudTestWaitingForDependencies_IsNotReportedAsUnknown()
    {
        // Arrange — a CloudTest testpass whose chunk dependencies are not yet available.
        // CloudTest testpasses should also show "WaitingForDependencies" when no session
        // exists yet and chunks are still pending, rather than "Unknown".
        const string cloudTestFqbn = "29543.1000.main.260227-1625";
        const string cloudTestTestpassName = "ACG AutoPlusCore Desktop 1 CloudTest [Enterprise-amd64-VM-ACG-AutoPlusCore-CloudTest]";

        var svc = CreateTestDataService();
        var progress = new Progress<string>(msg => output.WriteLine($"[Progress] {msg}"));

        // Act
        var (results, _, _) = await svc.LoadTestResultsAsync(cloudTestFqbn, progress);

        // Assert — find the specific testpass
        var testpass = results.FirstOrDefault(r =>
            r.TestpassSummary?.TestpassName == cloudTestTestpassName);

        Assert.NotNull(testpass);
        output.WriteLine($"Testpass: {testpass.TestpassSummary?.TestpassName}");
        output.WriteLine($"ExecutionSystem: {testpass.TestpassSummary?.ExecutionSystem}");
        output.WriteLine($"Status: {testpass.Status}");
        output.WriteLine($"Result: {testpass.Result}");
        output.WriteLine($"NovaTestpass: {(testpass.NovaTestpass is null ? "null" : "present")}");
        output.WriteLine($"TestSession: {(testpass.TestSession is null ? "null" : "present")}");
        output.WriteLine($"ChunkAvailability count: {testpass.ChunkAvailability.Count}");

        foreach (var chunk in testpass.ChunkAvailability)
        {
            output.WriteLine($"  Chunk: {chunk.ChunkName} ({chunk.Flavor}) | AvailableAt={chunk.AvailableAt?.ToString() ?? "NOT AVAILABLE"}");
        }

        var timing = new TestpassTimingData(testpass);
        output.WriteLine($"TimingData.Status: {timing.Status}");
        output.WriteLine($"TimingData.Result: {timing.Result}");
        output.WriteLine($"TimingData.IsRunning: {timing.IsRunning}");
        output.WriteLine($"TimingData.IsFailed: {timing.IsFailed}");
        output.WriteLine($"TimingData.IsPassed: {timing.IsPassed}");

        // This is a CloudTest testpass
        Assert.Equal(ExecutionSystem.CloudTest, testpass.TestpassSummary!.ExecutionSystem);

        // No CloudTest session has been created yet because dependencies aren't available
        Assert.Null(testpass.TestSession);

        // Should have chunk dependencies, some of which are not yet available
        Assert.NotEmpty(testpass.ChunkAvailability);
        Assert.Contains(testpass.ChunkAvailability, chunk => chunk.AvailableAt is null);

        // The testpass should be reported as "WaitingForDependencies", not "Unknown"
        Assert.Equal("WaitingForDependencies", testpass.Status);
        Assert.Equal("WaitingForDependencies", testpass.Result);
        Assert.False(timing.IsFailed,
            $"CloudTest testpass waiting for dependencies should not be marked as Failed. Status='{timing.Status}', Result='{timing.Result}'");
    }

    [Fact]
    public async Task LoadTestResults_T3CNoNovaData_WaitingForDependencies_IsNotReportedAsUnknown()
    {
        // A T3C testpass where Nova returned no data (NovaTestpass is null),
        // but chunk dependencies are pending. Should show "WaitingForDependencies", not "Unknown".
        const string fqbn = "29543.1000.main.260227-1625";
        const string testpassName = "Desktop Updateability Media HCIv3 DES [ServerAzureStackHCICor-amd64-VMGen2-Media-UpdateabilityHCIv3-DES]";

        var svc = CreateTestDataService();
        var progress = new Progress<string>(msg => output.WriteLine($"[Progress] {msg}"));

        // Act
        var (results, _, _) = await svc.LoadTestResultsAsync(fqbn, progress);

        // Assert — find the specific testpass
        var testpass = results.FirstOrDefault(r =>
            r.TestpassSummary?.TestpassName == testpassName);

        Assert.NotNull(testpass);
        output.WriteLine($"Testpass: {testpass.TestpassSummary?.TestpassName}");
        output.WriteLine($"ExecutionSystem: {testpass.TestpassSummary?.ExecutionSystem}");
        output.WriteLine($"Status: {testpass.Status ?? "(null)"}");
        output.WriteLine($"Result: {testpass.Result ?? "(null)"}");
        output.WriteLine($"NovaTestpass: {(testpass.NovaTestpass is null ? "null" : "present")}");
        output.WriteLine($"TestSession: {(testpass.TestSession is null ? "null" : "present")}");
        output.WriteLine($"ChunkAvailability count: {testpass.ChunkAvailability.Count}");

        foreach (var chunk in testpass.ChunkAvailability)
        {
            output.WriteLine($"  Chunk: {chunk.ChunkName} ({chunk.Flavor}) | AvailableAt={chunk.AvailableAt?.ToString() ?? "NOT AVAILABLE"}");
        }

        var timing = new TestpassTimingData(testpass);
        output.WriteLine($"TimingData.Status: {timing.Status}");
        output.WriteLine($"TimingData.Result: {timing.Result}");
        output.WriteLine($"TimingData.IsFailed: {timing.IsFailed}");
        output.WriteLine($"TimingData.IsWaitingForDependencies: {timing.IsWaitingForDependencies}");

        // This is a T3C testpass where Nova has no data yet
        Assert.Equal(ExecutionSystem.T3C, testpass.TestpassSummary!.ExecutionSystem);
        Assert.Null(testpass.NovaTestpass);
        Assert.Null(testpass.TestSession);

        // Should have chunk dependencies, some of which are not yet available
        Assert.NotEmpty(testpass.ChunkAvailability);
        Assert.Contains(testpass.ChunkAvailability, chunk => chunk.AvailableAt is null);

        // The testpass should be reported as "WaitingForDependencies", not "Unknown"
        Assert.Equal("WaitingForDependencies", testpass.Status);
        Assert.Equal("WaitingForDependencies", testpass.Result);
        Assert.False(timing.IsFailed,
            $"Testpass waiting for dependencies should not be marked as Failed. Status='{timing.Status}', Result='{timing.Result}'");
    }
}
