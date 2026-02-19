import { useState, useEffect, useCallback, useRef } from "react";
import type {
  JobStatusResponse,
  ProgressMessage,
  TestResultsResponse,
} from "../types/testResults";

type WorkflowStatus = "idle" | "loading" | "polling" | "completed" | "error";

interface UseTestResultsReturn {
  status: WorkflowStatus;
  progress: ProgressMessage[];
  results: TestResultsResponse | null;
  error: string | null;
  isTimeout: boolean;
  refresh: () => void;
}

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export function useTestResults(
  fqbn: string | undefined
): UseTestResultsReturn {
  const [status, setStatus] = useState<WorkflowStatus>("idle");
  const [progress, setProgress] = useState<ProgressMessage[]>([]);
  const [results, setResults] = useState<TestResultsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTimeout, setIsTimeout] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollStartRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const refresh = useCallback(() => {
    setRefreshCounter((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!fqbn) {
      setStatus("idle");
      setProgress([]);
      setResults(null);
      setError(null);
      return;
    }

    cleanup();

    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;

    const encodedFqbn = encodeURIComponent(fqbn);

    const triggerAndPoll = async () => {
      setStatus("loading");
      setProgress([]);
      setResults(null);
      setError(null);
      setIsTimeout(false);
      pollStartRef.current = Date.now();

      try {
        // 1. Trigger data gathering
        const refreshParam = refreshCounter > 0 ? "?refresh=true" : "";
        const postRes = await fetch(`/api/testresults/${encodedFqbn}${refreshParam}`, {
          method: "POST",
          signal,
        });
        if (!postRes.ok && postRes.status !== 409) {
          throw new Error(`Failed to trigger data gathering (${postRes.status})`);
        }

        // 2. Start polling status
        setStatus("polling");

        const pollStatus = async (): Promise<boolean> => {
          const statusRes = await fetch(
            `/api/testresults/${encodedFqbn}/status`,
            { signal }
          );
          if (!statusRes.ok) {
            throw new Error(`Failed to fetch status (${statusRes.status})`);
          }
          const jobStatus: JobStatusResponse = await statusRes.json();
          setProgress(jobStatus.progress);

          // Timeout detection
          if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
            setIsTimeout(true);
          }

          if (jobStatus.status === "completed") {
            // 3. Fetch full results
            const resultsRes = await fetch(
              `/api/testresults/${encodedFqbn}`,
              { signal }
            );
            if (!resultsRes.ok) {
              throw new Error(`Failed to fetch results (${resultsRes.status})`);
            }
            const data: TestResultsResponse = await resultsRes.json();
            setResults(data);
            setStatus("completed");
            return true;
          }

          if (jobStatus.status === "failed") {
            setError(jobStatus.error ?? "Data gathering failed");
            setStatus("error");
            return true;
          }

          return false; // keep polling
        };

        // Initial poll
        const done = await pollStatus();
        if (done) return;

        // Set up interval polling
        intervalRef.current = setInterval(async () => {
          try {
            const done = await pollStatus();
            if (done) {
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
              }
            }
          } catch (err) {
            if (signal.aborted) return;
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            setError(err instanceof Error ? err.message : "Polling failed");
            setStatus("error");
          }
        }, POLL_INTERVAL_MS);
      } catch (err) {
        if (signal.aborted) return;
        const message =
          err instanceof TypeError
            ? "Network error — please check your connection and try again."
            : err instanceof Error
              ? err.message
              : "An unexpected error occurred";
        setError(message);
        setStatus("error");
      }
    };

    triggerAndPoll();

    return cleanup;
  }, [fqbn, refreshCounter, cleanup]);

  return { status, progress, results, error, isTimeout, refresh };
}
