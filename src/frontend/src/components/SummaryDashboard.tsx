import React, { useMemo } from "react";
import type { BuildInfo, TestpassDto } from "../types/testResults";

interface SummaryDashboardProps {
  buildInfo: BuildInfo;
  summary: { total: number; passed: number; failed: number; running: number };
  testpasses: TestpassDto[];
  timeRange: { min: string | null; max: string | null };
}

function parseDurationToSeconds(d: string | null): number {
  if (!d) return 0;
  const parts = d.split(":");
  if (parts.length !== 3) return 0;
  const [h, m, s] = parts.map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0m";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTOffset(baseDate: string, targetDate: string): string {
  const diffMs = new Date(targetDate).getTime() - new Date(baseDate).getTime();
  if (isNaN(diffMs) || diffMs < 0) return "T+0h 0m";
  const totalMin = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `T+${h}h ${m}m`;
}

function isPassed(result: string): boolean {
  const r = result?.toLowerCase() ?? "";
  return r === "passed" || r === "succeeded";
}

function isFailed(result: string): boolean {
  const r = result?.toLowerCase() ?? "";
  return r === "failed" || r === "timedout";
}

interface CategoryStats {
  total: number;
  passed: number;
  failed: number;
  wallClockSeconds: number;
  cpuSeconds: number;
}

function computeCategoryStats(testpasses: TestpassDto[]): CategoryStats {
  let minStart: number | null = null;
  let maxEnd: number | null = null;
  let cpuSeconds = 0;
  let passed = 0;
  let failed = 0;

  for (const tp of testpasses) {
    if (tp.startTime) {
      const t = new Date(tp.startTime).getTime();
      if (!isNaN(t) && (minStart === null || t < minStart)) minStart = t;
    }
    if (tp.endTime) {
      const t = new Date(tp.endTime).getTime();
      if (!isNaN(t) && (maxEnd === null || t > maxEnd)) maxEnd = t;
    }
    cpuSeconds += parseDurationToSeconds(tp.duration);
    if (isPassed(tp.result)) passed++;
    else if (isFailed(tp.result)) failed++;
  }

  const wallClockSeconds =
    minStart !== null && maxEnd !== null
      ? Math.max(0, (maxEnd - minStart) / 1000)
      : 0;

  return { total: testpasses.length, passed, failed, wallClockSeconds, cpuSeconds };
}

const statBoxStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "12px 20px",
  minWidth: 90,
};

const statValueStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  lineHeight: 1.2,
};

const statLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  textTransform: "uppercase",
  marginTop: 4,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#666",
  textTransform: "uppercase",
  marginBottom: 6,
  letterSpacing: 0.5,
};

const breakdownRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 13,
  marginBottom: 4,
};

function PassFailMarker({ passed, failed }: { passed: number; failed: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <span style={{ color: "#107c10", fontWeight: 600 }}>✓{passed}</span>
      <span style={{ color: "#c50f1f", fontWeight: 600 }}>✗{failed}</span>
    </span>
  );
}

export default function SummaryDashboard({
  buildInfo,
  summary,
  testpasses,
  timeRange,
}: SummaryDashboardProps) {
  const wallClockSeconds = useMemo(() => {
    if (!timeRange.min || !timeRange.max) return 0;
    const diffMs = new Date(timeRange.max).getTime() - new Date(timeRange.min).getTime();
    return isNaN(diffMs) ? 0 : Math.max(0, diffMs / 1000);
  }, [timeRange]);

  const byRequirement = useMemo(() => {
    const groups: Record<string, TestpassDto[]> = {};
    for (const tp of testpasses) {
      const key = tp.requirement || "Unknown";
      (groups[key] ??= []).push(tp);
    }
    return Object.entries(groups).map(([name, tps]) => ({
      name,
      ...computeCategoryStats(tps),
    }));
  }, [testpasses]);

  const byExecSystem = useMemo(() => {
    const groups: Record<string, TestpassDto[]> = {};
    for (const tp of testpasses) {
      const key = tp.executionSystem || "Unknown";
      (groups[key] ??= []).push(tp);
    }
    return Object.entries(groups).map(([name, tps]) => ({
      name,
      ...computeCategoryStats(tps),
    }));
  }, [testpasses]);

  const timingLabel = useMemo(() => {
    if (!timeRange.min || !timeRange.max) return null;
    const startOffset = formatTOffset(buildInfo.registrationDate, timeRange.min);
    const endOffset = formatTOffset(buildInfo.registrationDate, timeRange.max);
    return `${startOffset} → ${endOffset} (${formatDuration(wallClockSeconds)})`;
  }, [buildInfo.registrationDate, timeRange, wallClockSeconds]);

  const buildStartFormatted = useMemo(() => {
    const d = new Date(buildInfo.registrationDate);
    if (isNaN(d.getTime())) return buildInfo.registrationDate;
    return d.toLocaleString();
  }, [buildInfo.registrationDate]);

  return (
    <div
      style={{
        display: "flex",
        border: "1px solid #e1e1e1",
        borderRadius: 4,
        background: "#fff",
        marginTop: 16,
        overflow: "hidden",
      }}
    >
      {/* Left side: stat boxes */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "16px 20px",
          flexShrink: 0,
        }}
      >
        <div style={statBoxStyle}>
          <span style={{ ...statValueStyle, color: "#333" }}>{summary.total}</span>
          <span style={statLabelStyle}>Total</span>
        </div>
        <div style={statBoxStyle}>
          <span style={{ ...statValueStyle, color: "#107c10" }}>{summary.passed}</span>
          <span style={statLabelStyle}>Passed</span>
        </div>
        <div style={statBoxStyle}>
          <span style={{ ...statValueStyle, color: "#c50f1f" }}>{summary.failed}</span>
          <span style={statLabelStyle}>Failed</span>
        </div>
        <div style={statBoxStyle}>
          <span style={{ ...statValueStyle, color: "#0078d4" }}>{summary.running}</span>
          <span style={statLabelStyle}>Running</span>
        </div>
        <div style={statBoxStyle}>
          <span style={{ ...statValueStyle, color: "#333" }}>
            {formatDuration(wallClockSeconds)}
          </span>
          <span style={statLabelStyle}>Wall Clock</span>
        </div>
      </div>

      {/* Right side: breakdowns */}
      <div
        style={{
          borderLeft: "1px solid #e1e1e1",
          padding: "16px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          flex: 1,
          minWidth: 0,
        }}
      >
        {/* Timing */}
        <div>
          <div style={sectionTitleStyle}>Timing</div>
          <div style={{ fontSize: 13, marginBottom: 2 }}>
            <span style={{ color: "#666" }}>Build Start: </span>
            <span style={{ fontWeight: 600 }}>{buildStartFormatted}</span>
          </div>
          {timingLabel && (
            <div style={{ fontSize: 13 }}>
              <span style={{ color: "#666" }}>All: </span>
              <span style={{ fontWeight: 600 }}>{timingLabel}</span>
            </div>
          )}
        </div>

        {/* By Requirement */}
        <div>
          <div style={sectionTitleStyle}>By Requirement</div>
          {byRequirement.map((cat) => (
            <div key={cat.name} style={breakdownRowStyle}>
              <span style={{ fontWeight: 600, minWidth: 80 }}>{cat.name}</span>
              <span style={{ color: "#666" }}>({cat.total})</span>
              <PassFailMarker passed={cat.passed} failed={cat.failed} />
              <span style={{ color: "#888", fontSize: 12 }}>
                Wall {formatDuration(cat.wallClockSeconds)} · CPU{" "}
                {formatDuration(cat.cpuSeconds)}
              </span>
            </div>
          ))}
        </div>

        {/* By Execution System */}
        <div>
          <div style={sectionTitleStyle}>By Execution System</div>
          {byExecSystem.map((cat) => (
            <div key={cat.name} style={breakdownRowStyle}>
              <span style={{ fontWeight: 600, minWidth: 80 }}>{cat.name}</span>
              <span style={{ color: "#666" }}>({cat.total})</span>
              <PassFailMarker passed={cat.passed} failed={cat.failed} />
              <span style={{ color: "#888", fontSize: 12 }}>
                Wall {formatDuration(cat.wallClockSeconds)} · CPU{" "}
                {formatDuration(cat.cpuSeconds)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
