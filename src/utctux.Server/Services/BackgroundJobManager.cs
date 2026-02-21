using System.Collections.Concurrent;
using utctux.Server.Models;

namespace utctux.Server.Services;

/// <summary>
/// Manages long-running test data gathering jobs with progress reporting.
/// Prevents duplicate jobs for the same FQBN and stores results in cache on completion.
/// </summary>
public class BackgroundJobManager
{
    private readonly ConcurrentDictionary<string, JobState> _jobs = new(StringComparer.OrdinalIgnoreCase);
    private readonly TestDataService _testDataService;
    private readonly TestResultsCache _cache;
    private readonly ILogger<BackgroundJobManager> _logger;

    private static readonly TimeSpan CleanupDelay = TimeSpan.FromMinutes(30);

    public BackgroundJobManager(
        TestDataService testDataService,
        TestResultsCache cache,
        ILogger<BackgroundJobManager> logger)
    {
        _testDataService = testDataService;
        _cache = cache;
        _logger = logger;
    }

    /// <summary>
    /// Start a job for the given FQBN. Returns false if already running.
    /// </summary>
    public bool TryStartJob(string fqbn, bool forceRefresh = false)
    {
        var state = _jobs.GetOrAdd(fqbn, _ => new JobState());

        lock (state)
        {
            if (state.Status == "running")
            {
                return false;
            }

            if (forceRefresh)
            {
                _cache.Remove(fqbn);
            }
            else if (_cache.Get(fqbn) is not null && state.Status == "completed")
            {
                return false;
            }

            // Reset state for a new run
            state.Status = "running";
            state.Error = null;
            state.CompletedAt = null;
            state.Progress.Clear();
        }

        _ = Task.Run(() => ExecuteJobAsync(fqbn, state));
        return true;
    }

    /// <summary>
    /// Get current status of a job.
    /// </summary>
    public JobStatusResponse GetStatus(string fqbn)
    {
        var cached = _cache.Get(fqbn);

        if (_jobs.TryGetValue(fqbn, out var state))
        {
            lock (state)
            {
                return new JobStatusResponse
                {
                    Status = state.Status,
                    Progress = state.Progress.ToList(),
                    CachedAt = cached?.CachedAt,
                    Error = state.Error,
                };
            }
        }

        // No job ever started — check cache
        if (cached is not null)
        {
            return new JobStatusResponse
            {
                Status = "completed",
                CachedAt = cached.CachedAt,
            };
        }

        return new JobStatusResponse { Status = "not_started" };
    }

    private async Task ExecuteJobAsync(string fqbn, JobState state)
    {
        try
        {
            var progress = new Progress<string>(message =>
            {
                lock (state)
                {
                    state.Progress.Add(new ProgressMessage
                    {
                        Timestamp = DateTimeOffset.UtcNow,
                        Message = message,
                    });
                }
            });

            _logger.LogInformation("Starting data gathering job for FQBN: {Fqbn}", fqbn);

            var (aggregated, buildRegistrationDate) = await _testDataService.LoadTestResultsAsync(fqbn, progress);

            // Convert AggregatedTestpassResult[] to TestResultsResponse via TestpassTimingData
            var timingData = aggregated.Select(r => new TestpassTimingData(r)).ToList();
            var response = MapToTestResultsResponse(fqbn, timingData, buildRegistrationDate);

            _cache.Set(fqbn, new TestResultsCacheEntry { Results = response });

            lock (state)
            {
                state.Status = "completed";
                state.CompletedAt = DateTimeOffset.UtcNow;
                state.Progress.Add(new ProgressMessage
                {
                    Timestamp = DateTimeOffset.UtcNow,
                    Message = "Job completed successfully.",
                });
            }

            _logger.LogInformation("Data gathering job completed for FQBN: {Fqbn}", fqbn);

            // Schedule cleanup of job state after delay
            _ = Task.Delay(CleanupDelay).ContinueWith(t => { _jobs.TryRemove(fqbn, out var _removed); });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Data gathering job failed for FQBN: {Fqbn}", fqbn);

            lock (state)
            {
                state.Status = "failed";
                state.Error = ex.Message;
                state.CompletedAt = DateTimeOffset.UtcNow;
                state.Progress.Add(new ProgressMessage
                {
                    Timestamp = DateTimeOffset.UtcNow,
                    Message = $"Job failed: {ex.Message}",
                });
            }

            // Cleanup failed jobs after delay too
            _ = Task.Delay(CleanupDelay).ContinueWith(t => { _jobs.TryRemove(fqbn, out var _removed); });
        }
    }

    private static TestResultsResponse MapToTestResultsResponse(string fqbn, List<TestpassTimingData> timingData, DateTimeOffset? buildRegistrationDate)
    {
        int passed = 0, failed = 0, running = 0, unknown = 0;
        DateTimeOffset? earliest = null;
        DateTimeOffset? latest = null;

        foreach (var tp in timingData)
        {
            if (tp.IsPassed) passed++;
            else if (tp.IsRunning) running++;
            else if (tp.IsFailed) failed++;
            else unknown++;

            if (tp.StartTime.HasValue && (!earliest.HasValue || tp.StartTime.Value < earliest.Value))
                earliest = tp.StartTime.Value;
            if (tp.EndTime.HasValue && (!latest.HasValue || tp.EndTime.Value > latest.Value))
                latest = tp.EndTime.Value;
        }

        return new TestResultsResponse
        {
            BuildInfo = new BuildInfo { Fqbn = fqbn, RegistrationDate = buildRegistrationDate },
            Summary = new TestResultsSummary
            {
                Total = timingData.Count,
                Passed = passed,
                Failed = failed,
                Running = running,
                Unknown = unknown,
            },
            Testpasses = timingData.Select(MapTestpass).ToList(),
            TimeRange = new TimeRangeDto
            {
                Min = buildRegistrationDate ?? earliest,
                Max = latest,
            },
        };
    }

    private static TestpassDto MapTestpass(TestpassTimingData tp)
    {
        return new TestpassDto
        {
            Name = tp.TestpassName,
            Requirement = tp.Requirement,
            ExecutionSystem = tp.ExecutionSystem?.ToString(),
            Status = tp.Status,
            Result = tp.Result,
            StartTime = tp.StartTime,
            EndTime = tp.EndTime,
            Duration = tp.Duration,
            DetailsUrl = tp.DetailsUrl,
            SchedulePipelineUrl = tp.SchedulePipelineUrl,
            Type = tp.TestpassType,
            Scope = tp.TestpassScope,
            DependentChunks = tp.DependentChunks,
            IsRerun = tp.IsRerun,
            IsCurrentRun = tp.IsCurrentRun,
            RerunReason = tp.CurrentRerunReason,
            RerunOwner = tp.CurrentRerunOwner,
            Runs = tp.Runs.Select(MapTestpass).ToList(),
        };
    }
}

/// <summary>
/// Tracks the state of a background data gathering job.
/// </summary>
public class JobState
{
    public string Status { get; set; } = "not_started";
    public List<ProgressMessage> Progress { get; } = new();
    public string? Error { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}
