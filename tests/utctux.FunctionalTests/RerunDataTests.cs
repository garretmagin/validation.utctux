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

    [Fact]
    public async Task LoadTestResults_SingleRunTestpass_HasExactlyOneRun()
    {
        // Arrange — a testpass known to have no reruns
        const string singleRunFqbn = "29537.1000.main.260219-1510";
        const string singleRunTestpassName = "WinBVT Container Manager [Enterprise-amd64-VMGen2-Containers-WinBVT]";

        var svc = CreateTestDataService();
        var progress = new Progress<string>(msg => output.WriteLine($"[Progress] {msg}"));

        // Act
        var (results, _) = await svc.LoadTestResultsAsync(singleRunFqbn, progress);

        // Assert — find the specific testpass
        var testpass = results.FirstOrDefault(r =>
            r.TestpassSummary?.TestpassName == singleRunTestpassName);

        Assert.NotNull(testpass);
        output.WriteLine($"Testpass: {testpass.TestpassSummary?.TestpassName}");
        output.WriteLine($"IsRerun: {testpass.TestpassSummary?.IsRerun}");
        output.WriteLine($"IsRerunsLikely: {testpass.IsRerunsLikely}");
        output.WriteLine($"IsNovaRerunLikely: {testpass.IsNovaRerunLikely}");
        output.WriteLine($"Runs count: {testpass.Runs.Count}");

        foreach (var run in testpass.Runs)
        {
            var name = run.TestpassSummary?.TestpassName
                ?? run.NovaTestpass?.TestPassName
                ?? "Unknown";
            output.WriteLine($"  Run: {name} | IsCurrentRun={run.IsCurrentRun}");
        }

        // Should have exactly 1 run (self-entry)
        Assert.Equal(1, testpass.Runs.Count);

        // The single run must be marked as current
        Assert.True(testpass.Runs[0].IsCurrentRun);
    }

    [Fact]
    public async Task InspectNovaRerunData_WPGPower_DumpsRerunInfo()
    {
        // Diagnostic test — no assertions, just outputs Nova rerun data for investigation.
        const string fqbn = "29538.1000.main.260220-1423";
        const string testpassName = "WPG RI Power [Enterprise-amd64-SP6-WPGPower-DES]";

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

        // Step 1: Load full test results to find the testpass
        var svc = CreateTestDataService();
        var progress = new Progress<string>(msg => output.WriteLine($"[Progress] {msg}"));
        var (results, buildRegDate) = await svc.LoadTestResultsAsync(fqbn, progress);

        output.WriteLine($"\n=== Build: {fqbn} ===");
        output.WriteLine($"Build registration date: {buildRegDate}");
        output.WriteLine($"Total testpasses loaded: {results.Count}");

        var testpass = results.FirstOrDefault(r =>
            r.TestpassSummary?.TestpassName == testpassName);

        if (testpass is null)
        {
            output.WriteLine($"\n⚠ Testpass '{testpassName}' not found in results.");
            output.WriteLine("Available testpasses containing 'WPG':");
            foreach (var r in results.Where(r => r.TestpassSummary?.TestpassName?.Contains("WPG", StringComparison.OrdinalIgnoreCase) == true))
            {
                output.WriteLine($"  - {r.TestpassSummary!.TestpassName}");
            }
            return;
        }

        // Step 2: Dump UTCT-level info
        output.WriteLine($"\n=== UTCT Data ===");
        output.WriteLine($"TestpassName: {testpass.TestpassSummary?.TestpassName}");
        output.WriteLine($"TestpassGuid: {testpass.TestpassSummary?.TestpassGuid}");
        output.WriteLine($"ExecutionSystem: {testpass.TestpassSummary?.ExecutionSystem}");
        output.WriteLine($"IsRerun: {testpass.TestpassSummary?.IsRerun}");
        output.WriteLine($"HasReruns: {testpass.TestpassSummary?.HasReruns}");
        output.WriteLine($"IsRerunsLikely: {testpass.IsRerunsLikely}");
        output.WriteLine($"IsNovaRerunLikely: {testpass.IsNovaRerunLikely}");

        if (testpass.TestpassSummary?.ParentTestpass is { } parent)
        {
            output.WriteLine($"ParentTestpass GUID: {parent.TestpassGuid}");
        }
        else
        {
            output.WriteLine("ParentTestpass: (none)");
        }

        if (testpass.TestpassSummary?.RerunTestpassReferences is { Count: > 0 } reruns)
        {
            output.WriteLine($"RerunTestpassReferences ({reruns.Count}):");
            foreach (var rerun in reruns)
            {
                output.WriteLine($"  GUID={rerun.TestpassGuid} | Reason={rerun.Reason} | Owner={rerun.Owner}");
            }
        }
        else
        {
            output.WriteLine("RerunTestpassReferences: (none)");
        }

        // Step 3: Dump Nova-level info
        output.WriteLine($"\n=== Nova Data ===");
        if (testpass.NovaTestpass is { } nova)
        {
            output.WriteLine($"TestPassId: {nova.TestPassId}");
            output.WriteLine($"TestPassGuid: {nova.TestPassGuid}");
            output.WriteLine($"TestPassName: {nova.TestPassName}");
            output.WriteLine($"StatusName: {nova.StatusName}");
            output.WriteLine($"PassRate: {nova.PassRate}");
            output.WriteLine($"ExecutionRate: {nova.ExecutionRate}");
            output.WriteLine($"StartTime: {nova.StartTime}");
            output.WriteLine($"EndTime: {nova.EndTime}");
            output.WriteLine($"Comments: {nova.Comments}");

            // Step 4: Query Nova Family API directly
            output.WriteLine($"\n=== Nova Family API (GUID={nova.TestPassGuid}) ===");
            try
            {
                var family = await novaService.GetTestPassFamilyAsync(nova.TestPassGuid);
                output.WriteLine($"TestPassId: {family.TestPassId}");
                output.WriteLine($"TestPassGuid: {family.TestPassGuid}");
                output.WriteLine($"ParentTestPassIds ({family.ParentTestPassIds.Count}): [{string.Join(", ", family.ParentTestPassIds)}]");
                output.WriteLine($"ChildTestPassIds ({family.ChildTestPassIds.Count}): [{string.Join(", ", family.ChildTestPassIds)}]");

                // Step 5: Resolve each relative via SummaryResults
                var allRelativeIds = new List<int>();
                allRelativeIds.AddRange(family.ParentTestPassIds);
                allRelativeIds.AddRange(family.ChildTestPassIds);

                foreach (var relativeId in allRelativeIds)
                {
                    output.WriteLine($"\n  --- Nova Relative (TestPassId={relativeId}) ---");
                    try
                    {
                        var summary = await novaService.GetTestPassSummaryByIdAsync(relativeId);
                        output.WriteLine($"  Name: {summary.Name}");
                        output.WriteLine($"  TestpassGuid: {summary.TestpassGuid}");
                        output.WriteLine($"  ExecutionStatus: {summary.ExecutionStatus}");
                        output.WriteLine($"  PassRate: {summary.PassRate}");
                        output.WriteLine($"  ExecutionRate: {summary.ExecutionRate}");
                        output.WriteLine($"  StartTime: {summary.StartTime}");
                        output.WriteLine($"  EndTime: {summary.EndTime}");
                        output.WriteLine($"  HasReruns: {summary.HasReruns}");
                        output.WriteLine($"  Comments: {summary.Comments}");
                        output.WriteLine($"  PreviousTestPassId: {summary.PreviousTestPassId}");
                        output.WriteLine($"  NextTestPassId: {summary.NextTestPassId}");
                    }
                    catch (Exception ex)
                    {
                        output.WriteLine($"  ⚠ Error: {ex.Message}");
                    }
                }
            }
            catch (Exception ex)
            {
                output.WriteLine($"⚠ Family API error: {ex.Message}");
            }

            // Step 6: Also query Nova Summary for the testpass itself
            output.WriteLine($"\n=== Nova Summary API (GUID={nova.TestPassGuid}) ===");
            try
            {
                var summary = await novaService.GetTestPassSummaryAsync(nova.TestPassGuid);
                output.WriteLine($"Name: {summary.Name}");
                output.WriteLine($"TestpassGuid: {summary.TestpassGuid}");
                output.WriteLine($"ExecutionStatus: {summary.ExecutionStatus}");
                output.WriteLine($"HasReruns: {summary.HasReruns}");
                output.WriteLine($"PreviousTestPassId: {summary.PreviousTestPassId}");
                output.WriteLine($"NextTestPassId: {summary.NextTestPassId}");
                output.WriteLine($"Comments: {summary.Comments}");
            }
            catch (Exception ex)
            {
                output.WriteLine($"⚠ Summary API error: {ex.Message}");
            }
        }
        else
        {
            output.WriteLine("(no Nova data)");
        }

        // Step 7: Dump resolved runs
        output.WriteLine($"\n=== Resolved Runs ({testpass.Runs.Count}) ===");
        foreach (var run in testpass.Runs)
        {
            var name = run.TestpassSummary?.TestpassName
                ?? run.NovaTestpass?.TestPassName
                ?? "Unknown";
            output.WriteLine($"\n  Run: {name}");
            output.WriteLine($"    IsCurrentRun: {run.IsCurrentRun}");
            output.WriteLine($"    UTCT GUID: {run.TestpassSummary?.TestpassGuid}");
            output.WriteLine($"    Nova GUID: {run.NovaTestpass?.TestPassGuid}");
            output.WriteLine($"    Nova ID: {run.NovaTestpass?.TestPassId}");
            output.WriteLine($"    Status: {run.Status}");
            output.WriteLine($"    Result: {run.Result}");
            output.WriteLine($"    Nova StartTime: {run.NovaTestpass?.StartTime}");
            output.WriteLine($"    Nova EndTime: {run.NovaTestpass?.EndTime}");
            output.WriteLine($"    RerunReason: {run.CurrentRerunReason}");
            output.WriteLine($"    RerunOwner: {run.CurrentRerunOwner}");
        }

        // Step 8: Dump chunk availability context
        if (testpass.ChunkAvailability.Count > 0)
        {
            output.WriteLine($"\n=== Chunk Availability ({testpass.ChunkAvailability.Count}) ===");
            foreach (var chunk in testpass.ChunkAvailability)
            {
                output.WriteLine($"  {chunk.ChunkName} ({chunk.Flavor}) | AvailableAt={chunk.AvailableAt} | Delta={chunk.AvailableAfterBuildStart}");
            }
        }
    }
}
