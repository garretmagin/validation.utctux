import React from "react";
import type { TestpassDto, ChunkAvailabilityDto } from "../types/testResults";

export interface MiniGanttChartProps {
  testpass: TestpassDto;
  buildRegistrationDate: string | null;
}

// --- Helpers ---

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
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.substring(0, max) + "..." : str;
}

function getBarColor(
  executionSystem: string,
  result: string,
  status: string
): string {
  const es = executionSystem?.toLowerCase() ?? "";
  const res = result?.toLowerCase() ?? "";
  const st = status?.toLowerCase() ?? "";
  if (st === "running" || st === "inprogress") return "running";
  if (res === "failed" || res === "aborted") return "#cd2535";
  if (es.includes("cloudtest")) {
    return res === "passed" ? "#107c10" : "#0078d4";
  }
  if (es.includes("t3c")) {
    return res === "passed" ? "#2e7d32" : "#0078d4";
  }
  return res === "passed" ? "#107c10" : "#0078d4";
}

function getRerunBorderColor(result: string): string {
  const res = result?.toLowerCase() ?? "";
  if (res === "failed" || res === "aborted") return "#cd2535";
  if (res === "passed") return "#107c10";
  return "#0078d4";
}

// --- Styles ---

const containerStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ebebeb",
  borderRadius: "4px",
  padding: "12px 16px 20px",
  position: "relative",
};

const markersRowStyle: React.CSSProperties = {
  position: "relative",
  height: "20px",
  marginBottom: "2px",
};

const trackStyle: React.CSSProperties = {
  position: "relative",
  height: "28px",
  background: "#f4f4f4",
  borderRadius: "2px",
  marginBottom: "4px",
};

const axisStyle: React.CSSProperties = {
  position: "relative",
  height: "18px",
  borderTop: "1px solid #dedede",
  marginTop: "4px",
};

// --- Component ---

interface MarkerInfo {
  pct: number;
  label: string;
  fullName: string;
  deltaLabel: string;
}

function computeMarkerRows(markers: MarkerInfo[]): { marker: MarkerInfo; row: number }[] {
  // Simple collision avoidance: if two labels are within 15% of each other, bump to next row
  const sorted = [...markers].sort((a, b) => a.pct - b.pct);
  const result: { marker: MarkerInfo; row: number }[] = [];
  for (const m of sorted) {
    let row = 0;
    for (const placed of result) {
      if (placed.row === row && Math.abs(placed.marker.pct - m.pct) < 15) {
        row = Math.max(row, placed.row + 1);
      }
    }
    result.push({ marker: m, row });
  }
  return result;
}

export default function MiniGanttChart({
  testpass,
  buildRegistrationDate,
}: MiniGanttChartProps) {
  if (!testpass.startTime) {
    return (
      <div style={{ ...containerStyle, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80px" }}>
        <span style={{ fontStyle: "italic", color: "#999", fontSize: "13px" }}>
          No timing data available
        </span>
      </div>
    );
  }

  const buildStart = buildRegistrationDate
    ? new Date(buildRegistrationDate).getTime()
    : new Date(testpass.startTime).getTime();

  const tpStart = new Date(testpass.startTime).getTime();
  const tpEnd = testpass.endTime ? new Date(testpass.endTime).getTime() : Date.now();

  // Find latest end and earliest start across testpass and all runs
  let latestEnd = tpEnd;
  if (testpass.runs) {
    for (const run of testpass.runs) {
      if (run.endTime) {
        latestEnd = Math.max(latestEnd, new Date(run.endTime).getTime());
      }
    }
  }

  // Total timeline span with 5% padding
  const rawSpan = latestEnd - buildStart;
  const totalSpanMs = rawSpan > 0 ? rawSpan * 1.05 : 60000;

  const toPct = (timeMs: number) =>
    Math.max(0, Math.min(100, ((timeMs - buildStart) / totalSpanMs) * 100));

  // --- Dependency markers ---
  const markers: MarkerInfo[] = [];
  if (testpass.dependentChunks) {
    for (const chunk of testpass.dependentChunks) {
      const deltaMs = parseTimeSpanToMs(chunk.availableAfterBuildStart);
      if (deltaMs == null) continue;
      const pct = toPct(buildStart + deltaMs);
      markers.push({
        pct,
        label: truncate(chunk.chunkName, 20),
        fullName: chunk.chunkName,
        deltaLabel: formatDeltaShort(deltaMs),
      });
    }
  }

  const markerRows = computeMarkerRows(markers);
  const maxRow = markerRows.length > 0 ? Math.max(...markerRows.map((r) => r.row)) : -1;
  const markerLabelsHeight = (maxRow + 1) * 16 + 4;

  // --- Execution bar ---
  const barLeft = toPct(tpStart);
  const barRight = toPct(tpEnd);
  const barWidth = Math.max(barRight - barLeft, 0.3);
  const durationMs = tpEnd - tpStart;
  const barColor = getBarColor(testpass.executionSystem, testpass.result, testpass.status);
  const isRunning = barColor === "running";

  const barStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    height: "100%",
    borderRadius: "2px",
    minWidth: "3px",
    left: `${barLeft}%`,
    width: `${barWidth}%`,
    background: isRunning
      ? "repeating-linear-gradient(-45deg, #0078d4, #0078d4 4px, #5ba0d6 4px, #5ba0d6 8px)"
      : barColor,
    opacity: 0.9,
  };

  // --- Time axis ticks (8 intervals = 9 ticks) ---
  const tickCount = 8;
  const ticks: { pct: number; label: string }[] = [];
  for (let i = 0; i <= tickCount; i++) {
    const pct = (i / tickCount) * 100;
    const seconds = (totalSpanMs * (i / tickCount)) / 1000;
    ticks.push({ pct, label: formatTickTime(seconds) });
  }

  // --- Non-primary run bars (exclude current since it's already the main bar) ---
  const nonPrimaryRuns = (testpass.runs ?? []).filter((r) => !r.isCurrentRun);

  return (
    <div style={containerStyle}>
      {/* Section label */}
      <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>
        Timeline from Build Start
      </div>

      {/* Dependency diamond markers row */}
      {markers.length > 0 && (
        <div style={markersRowStyle}>
          {markers.map((m, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                top: 0,
                left: `${m.pct}%`,
                transform: "translateX(-50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
              title={`${m.fullName}: ${m.deltaLabel}`}
            >
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  background: "#0078d4",
                  transform: "rotate(45deg)",
                  border: "1px solid #106ebe",
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Execution track */}
      <div style={trackStyle}>
        {/* Marker lines through the track */}
        {markers.map((m, i) => (
          <div
            key={`line-${i}`}
            style={{
              position: "absolute",
              top: 0,
              left: `${m.pct}%`,
              width: "1px",
              height: "100%",
              background: "#0078d4",
              opacity: 0.4,
              transform: "translateX(-50%)",
            }}
          />
        ))}

        {/* Build start marker */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "2px",
            height: "100%",
            background: "#004578",
            opacity: 0.6,
          }}
        />

        {/* Main execution bar */}
        <div style={barStyle}>
          {barWidth > 4 && (
            <span
              style={{
                position: "absolute",
                fontSize: "12px",
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

        {/* Non-primary run bars (border only, no fill) */}
        {nonPrimaryRuns.map((run, i) => {
          if (!run.startTime) return null;
          const rStart = new Date(run.startTime).getTime();
          const rEnd = run.endTime ? new Date(run.endTime).getTime() : Date.now();
          const rLeft = toPct(rStart);
          const rRight = toPct(rEnd);
          const rWidth = Math.max(rRight - rLeft, 0.3);
          const rDuration = rEnd - rStart;
          const rColor = getRerunBorderColor(run.result);
          return (
            <div
              key={`run-${i}`}
              style={{
                position: "absolute",
                top: 0,
                height: "100%",
                borderRadius: "2px",
                minWidth: "3px",
                left: `${rLeft}%`,
                width: `${rWidth}%`,
                background: "transparent",
                border: `2px solid ${rColor}`,
                boxSizing: "border-box",
                opacity: 0.7,
                color: rColor,
              }}
            >
              {rWidth > 5 && (
                <span
                  style={{
                    position: "absolute",
                    fontSize: "11px",
                    color: "inherit",
                    fontWeight: 600,
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                  }}
                >
                  {formatDurationLabel(rDuration)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Dependency marker labels row */}
      {markers.length > 0 && (
        <div
          style={{
            position: "relative",
            marginTop: "2px",
            height: `${markerLabelsHeight}px`,
            overflow: "visible",
          }}
        >
          {markerRows.map(({ marker, row }, i) => (
            <React.Fragment key={i}>
              {row > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: `${marker.pct}%`,
                    top: 0,
                    width: "1px",
                    height: `${row * 16}px`,
                    background: "#0078d4",
                    opacity: 0.3,
                    transform: "translateX(-50%)",
                  }}
                />
              )}
              <span
                style={{
                  position: "absolute",
                  left: `${marker.pct}%`,
                  top: `${row * 16}px`,
                  fontSize: "11px",
                  color: "#666",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  transform: "translateX(-50%)",
                  lineHeight: "1.2",
                }}
                title={marker.fullName}
              >
                {marker.label} {marker.deltaLabel}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Time axis */}
      <div style={axisStyle}>
        {ticks.map((tick, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              top: 0,
              left: `${tick.pct}%`,
              fontSize: "11px",
              color: "#999",
              transform: "translateX(-50%)",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: "-4px",
                left: "50%",
                width: "1px",
                height: "4px",
                background: "#c8c8c8",
              }}
            />
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}


