export interface ProgressMessage {
  timestamp: string;
  message: string;
}

export interface JobStatusResponse {
  status: "not_started" | "running" | "completed" | "failed";
  progress: ProgressMessage[];
  cachedAt: string | null;
  error: string | null;
}

export interface BuildInfo {
  fqbn: string;
  branch: string;
  buildId: number;
  registrationDate: string;
  status: string;
}

export interface TestpassDto {
  name: string;
  requirement: string;
  executionSystem: string;
  status: string;
  result: string;
  startTime: string | null;
  endTime: string | null;
  duration: string | null;
  detailsUrl: string;
  schedulePipelineUrl: string;
  type: string;
  scope: string;
  dependentChunks: unknown[];
  isRerun: boolean;
  rerunReason: string | null;
  rerunOwner: string | null;
  runs: TestpassDto[];
}

export interface TestResultsResponse {
  buildInfo: BuildInfo;
  summary: {
    total: number;
    passed: number;
    failed: number;
    running: number;
  };
  testpasses: TestpassDto[];
  timeRange: { min: string | null; max: string | null };
}
