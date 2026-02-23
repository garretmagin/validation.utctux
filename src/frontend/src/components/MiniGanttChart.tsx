import React from "react";
import type { TestpassDto } from "../types/testResults";

export interface MiniGanttChartProps {
  testpass: TestpassDto;
  buildRegistrationDate: string | null;
}

// --- Helpers ---

const ROW_HEIGHT = 24;
const LABEL_WIDTH = 240;

function formatTickTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hrs}:${String(mins).padStart(2, "0")}`;
}

function formatDeltaShort(ms: number): string {
  const totalMins = Math.floor(ms / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs === 0) return `T+${mins}m`;
  if (mins === 0) return `T+${hrs}h`;
  return `T+${hrs}h ${mins}m`;
}

function parseTimeSpanToMs(ts: string | null): number | null {
  if (!ts) return null;
  const parts = ts.split(":");
  if (parts.length < 2) return null;
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  const firstPart = parts[0];
  if (firstPart.includes(".")) {
    const [days, hrs] = firstPart.split(".");
    hours = parseInt(days, 10) * 24 + parseInt(hrs, 10);
  } else {
    hours = parseInt(firstPart, 10);
  }
  minutes = parseInt(parts[1], 10);
  if (parts.length >= 3) seconds = parseFloat(parts[2]);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

function formatDurationLabel(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.substring(0, max) + "\u2026" : str;
}

function getBarColor(
  executionSystem: string,
  result: string,
  status: string
): string {
  const res = result?.toLowerCase() ?? "";
  const st = status?.toLowerCase() ?? "";
  if (st === "running" || st === "inprogress") return "running";
  if (res === "failed" || res === "aborted") return "#cd2535";
  const es = executionSystem?.toLowerCase() ?? "";
  if (es.includes("cloudtest")) return res === "passed" ? "#107c10" : "#0078d4";
  if (es.includes("t3c")) return res === "passed" ? "#2e7d32" : "#0078d4";
  return res === "passed" ? "#107c10" : "#0078d4";
}

// --- Styles ---

const containerStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ebebeb",
  borderRadius: "4px",
  padding: "12px 16px 16px",
  position: "relative",
  fontSize: "12px",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: `${ROW_HEIGHT}px`,
  borderBottom: "1px solid #f0f0f0",
};

const labelCellStyle: React.CSSProperties = {
  width: `${LABEL_WIDTH}px`,
  minWidth: `${LABEL_WIDTH}px`,
  paddingRight: "8px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "12px",
  color: "#444",
  flexShrink: 0,
};

const trackCellStyle: React.CSSProperties = {
  flex: 1,
  position: "relative",
  height: "100%",
  minWidth: 0,
};

// --- Sub-components ---

function ChunkRow({
  chunkName,
  pct,
  deltaLabel,
}: {
  chunkName: string;
  pct: number;
  deltaLabel: string;
}) {
  return (
    <div style={rowStyle} title={`${chunkName}: ${deltaLabel}`}>
      <div style={labelCellStyle} title={chunkName}>
        {truncate(chunkName, 40)}
      </div>
      <div style={trackCellStyle}>
        {/* Horizontal guide line from 0 to diamond */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            width: `${pct}%`,
            height: "1px",
            background: "#c8d6e5",
          }}
        />
        {/* Diamond marker */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: `${pct}%`,
            width: "8px",
            height: "8px",
            background: "#0078d4",
            border: "1px solid #106ebe",
            transform: "translate(-50%, -50%) rotate(45deg)",
          }}
        />
        {/* Delta label */}
        <span
          style={{
            position: "absolute",
            top: "50%",
            left: `${pct}%`,
            transform: "translate(8px, -50%)",
            fontSize: "10px",
            color: "#888",
            whiteSpace: "nowrap",
            fontWeight: 500,
          }}
        >
          {deltaLabel}
        </span>
      </div>
    </div>
  );
}

function TestpassBar({
  run,
  toPct,
  executionSystem,
  isCurrent,
  hasMultipleRuns,
}: {
  run: TestpassDto;
  toPct: (ms: number) => number;
  executionSystem: string;
  isCurrent: boolean;
  hasMultipleRuns: boolean;
}) {
  if (!run.startTime) return null;

  const rStart = new Date(run.startTime).getTime();
  const rEnd = run.endTime ? new Date(run.endTime).getTime() : Date.now();
  const left = toPct(rStart);
  const right = toPct(rEnd);
  const width = Math.max(right - left, 0.4);
  const durationMs = rEnd - rStart;
  const barColor = getBarColor(executionSystem, run.result, run.status);
  const isRunning = barColor === "running";

  const label = isCurrent ? run.name : `${run.name}`;
  const displayLabel = truncate(label, 100);

  return (
    <div style={rowStyle} title={`${run.name} — ${formatDurationLabel(durationMs)}`}>
      <div
        style={{
          ...labelCellStyle,
          fontWeight: isCurrent ? 600 : 400,
          color: isCurrent ? "#333" : "#777",
        }}
        title={run.name}
      >
        {hasMultipleRuns && isCurrent && (
          <span style={{ marginRight: "4px", fontSize: "11px", color: "#999" }}>↻</span>
        )}
        {displayLabel}
      </div>
      <div style={trackCellStyle}>
        <div
          style={{
            position: "absolute",
            top: "3px",
            bottom: "3px",
            borderRadius: "2px",
            minWidth: "3px",
            left: `${left}%`,
            width: `${width}%`,
            background: isRunning
              ? "repeating-linear-gradient(-45deg, #0078d4, #0078d4 4px, #5ba0d6 4px, #5ba0d6 8px)"
              : barColor,
            opacity: isCurrent ? 0.9 : 0.6,
            border: isCurrent ? "none" : `1px dashed ${barColor === "running" ? "#0078d4" : barColor}`,
          }}
        >
          {width > 3.5 && (
            <span
              style={{
                position: "absolute",
                fontSize: "11px",
                color: "white",
                fontWeight: 600,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                whiteSpace: "nowrap",
                textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                pointerEvents: "none",
              }}
            >
              {formatDurationLabel(durationMs)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main Component ---

export default function MiniGanttChart({
  testpass,
  buildRegistrationDate,
}: MiniGanttChartProps) {
  if (!testpass.startTime) {
    return (
      <div
        style={{
          ...containerStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "80px",
        }}
      >
        <span style={{ fontStyle: "italic", color: "#999", fontSize: "13px" }}>
          No timing data available
        </span>
      </div>
    );
  }

  const buildStart = buildRegistrationDate
    ? new Date(buildRegistrationDate).getTime()
    : new Date(testpass.startTime).getTime();

  const tpEnd = testpass.endTime ? new Date(testpass.endTime).getTime() : Date.now();

  // Find the full extent of the timeline
  let latestEnd = tpEnd;
  if (testpass.runs) {
    for (const run of testpass.runs) {
      if (run.endTime) {
        latestEnd = Math.max(latestEnd, new Date(run.endTime).getTime());
      }
    }
  }

  const rawSpan = latestEnd - buildStart;
  const totalSpanMs = rawSpan > 0 ? rawSpan * 1.05 : 60000;

  const toPct = (timeMs: number) =>
    Math.max(0, Math.min(100, ((timeMs - buildStart) / totalSpanMs) * 100));

  // --- Chunk data ---
  const chunks = (testpass.dependentChunks ?? [])
    .map((chunk) => {
      const deltaMs = parseTimeSpanToMs(chunk.availableAfterBuildStart);
      if (deltaMs == null) return null;
      return {
        chunkName: chunk.chunkName,
        pct: toPct(buildStart + deltaMs),
        deltaLabel: formatDeltaShort(deltaMs),
      };
    })
    .filter(Boolean) as { chunkName: string; pct: number; deltaLabel: string }[];

  // Sort chunks by availability time
  chunks.sort((a, b) => a.pct - b.pct);

  // --- Runs (current first, then reruns) ---
  const allRuns: { run: TestpassDto; isCurrent: boolean }[] = [];
  if (testpass.runs && testpass.runs.length > 0) {
    // Current run first, then non-current
    const currentRuns = testpass.runs.filter((r) => r.isCurrentRun);
    const otherRuns = testpass.runs.filter((r) => !r.isCurrentRun);
    for (const r of currentRuns) allRuns.push({ run: r, isCurrent: true });
    for (const r of otherRuns) allRuns.push({ run: r, isCurrent: false });
  } else {
    // No runs array — use the testpass itself as the sole run
    allRuns.push({ run: testpass, isCurrent: true });
  }

  // --- Time axis ticks (snapped to 15-min boundaries) ---
  const totalSpanSec = totalSpanMs / 1000;
  const tickStep = (() => {
    // Nice round intervals; pick the smallest that keeps total ticks ≤ 12
    const candidates = [300, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400];
    for (const step of candidates) {
      if (Math.floor(totalSpanSec / step) <= 12) return step;
    }
    return 86400;
  })();
  const ticks: { pct: number; label: string }[] = [];
  for (let s = 0; s <= totalSpanSec; s += tickStep) {
    ticks.push({ pct: (s / totalSpanSec) * 100, label: formatTickTime(s) });
  }
  const tickCount = ticks.length - 1;

  const hasChunks = chunks.length > 0;

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
        Timeline from Build Start
      </div>

      {/* Column headers */}
      <div
        style={{
          display: "flex",
          height: "18px",
          alignItems: "center",
          borderBottom: "2px solid #e0e0e0",
          marginBottom: "1px",
        }}
      >
        <div
          style={{
            width: `${LABEL_WIDTH}px`,
            minWidth: `${LABEL_WIDTH}px`,
            fontSize: "10px",
            fontWeight: 600,
            textTransform: "uppercase",
            color: "#888",
            letterSpacing: "0.5px",
          }}
        />
        <div style={{ flex: 1, position: "relative", height: "100%" }}>
          {/* Build start line label */}
          <span
            style={{
              position: "absolute",
              left: 0,
              bottom: 0,
              fontSize: "9px",
              fontWeight: 600,
              color: "#004578",
              textTransform: "uppercase",
              letterSpacing: "0.3px",
            }}
          >
            Build Start
          </span>
        </div>
      </div>

      {/* Chunk rows — section header */}
      {hasChunks && (
        <>
          <div
            style={{
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "uppercase",
              color: "#0078d4",
              letterSpacing: "0.5px",
              padding: "4px 0 2px",
            }}
          >
            Dependencies
          </div>
          {chunks.map((c, i) => (
            <ChunkRow key={i} chunkName={c.chunkName} pct={c.pct} deltaLabel={c.deltaLabel} />
          ))}
          {/* Divider between chunks and runs */}
          <div style={{ height: "1px", background: "#dedede", margin: "2px 0" }} />
        </>
      )}

      {/* Testpass run rows — section header */}
      <div
        style={{
          fontSize: "10px",
          fontWeight: 600,
          textTransform: "uppercase",
          color: "#0078d4",
          letterSpacing: "0.5px",
          padding: "4px 0 2px",
        }}
      >
        Execution
      </div>
      {allRuns.map(({ run, isCurrent }, i) => (
        <TestpassBar
          key={i}
          run={run}
          toPct={toPct}
          executionSystem={testpass.executionSystem}
          isCurrent={isCurrent}
          hasMultipleRuns={allRuns.length > 1}
        />
      ))}

      {/* Time axis */}
      <div
        style={{
          display: "flex",
          height: "18px",
          marginTop: "4px",
          borderTop: "1px solid #dedede",
        }}
      >
        <div style={{ width: `${LABEL_WIDTH}px`, minWidth: `${LABEL_WIDTH}px` }} />
        <div style={{ flex: 1, position: "relative" }}>
          {ticks.map((tick, i) => {
            const isFirst = i === 0;
            const isLast = i === tickCount;
            const tickTransform = isFirst
              ? "translateX(0)"
              : isLast
                ? "translateX(-100%)"
                : "translateX(-50%)";
            return (
              <span
                key={i}
                style={{
                  position: "absolute",
                  top: "2px",
                  left: `${tick.pct}%`,
                  fontSize: "10px",
                  color: "#999",
                  transform: tickTransform,
                  whiteSpace: "nowrap",
                }}
              >
                {tick.label}
              </span>
            );
          })}
          {/* Build-start vertical line across all rows */}
        </div>
      </div>
    </div>
  );
}


