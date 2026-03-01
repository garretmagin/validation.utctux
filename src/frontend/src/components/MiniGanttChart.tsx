import React from "react";
import type { TestpassDto, ChunkAvailabilityDto } from "../types/testResults";

export interface MiniGanttChartProps {
  testpass: TestpassDto;
  buildRegistrationDate: string | null;
}

// --- Helpers ---

const ROW_HEIGHT = 24;
// box-sizing: border-box is active globally, so border is inside ROW_HEIGHT
const ROW_PITCH = ROW_HEIGHT;
const LABEL_WIDTH = 260;

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
  paddingLeft: "6px",
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
  startPct,
  barColor = "#b4d6fa",
  barBorder = "#0078d4",
  indent = 0,
  labelFontSize = 12,
  prefix = "",
}: {
  chunkName: string;
  pct: number;
  deltaLabel: string;
  startPct?: number;
  barColor?: string;
  barBorder?: string;
  indent?: number;
  labelFontSize?: number;
  prefix?: string;
}) {
  const hasSpan = startPct != null && startPct < pct;
  return (
    <div style={rowStyle} title={`${chunkName}: ${deltaLabel}`}>
      <div
        style={{
          ...labelCellStyle,
          fontSize: `${labelFontSize}px`,
          paddingLeft: `${indent}px`,
        }}
        title={chunkName}
      >
        {prefix && (
          <span style={{ fontFamily: "monospace", color: "#c8d6e5", fontSize: "11px" }}>{prefix}</span>
        )}
        {truncate(chunkName, 40 - Math.floor(indent / 6))}
      </div>
      <div style={trackCellStyle}>
        {hasSpan ? (
          /* Production span bar from startPct to pct */
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: `${startPct}%`,
              width: `${pct - startPct}%`,
              height: "6px",
              transform: "translateY(-50%)",
              background: barColor,
              border: `1px solid ${barBorder}`,
              borderRadius: "2px",
            }}
          />
        ) : (
          /* Horizontal guide line from 0 to diamond */
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              width: `calc(${pct}% + 2px)`,
              height: "1px",
              background: "#c8d6e5",
            }}
          />
        )}
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
  const hasChunkData = (testpass.dependentChunks ?? []).some(
    (c) => parseTimeSpanToMs(c.availableAfterBuildStart) != null
  );

  if (!testpass.startTime && !(buildRegistrationDate && hasChunkData)) {
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

  const hasStartTime = !!testpass.startTime;

  const buildStart = buildRegistrationDate
    ? new Date(buildRegistrationDate).getTime()
    : hasStartTime
      ? new Date(testpass.startTime!).getTime()
      : Date.now();

  const tpEnd = testpass.endTime ? new Date(testpass.endTime).getTime() : Date.now();

  // Collect all chunk availability/start times to extend timeline
  function collectChunkTimesMs(deps: ChunkAvailabilityDto[], depth: number): number[] {
    const times: number[] = [];
    for (const c of deps) {
      const avail = parseTimeSpanToMs(c.availableAfterBuildStart);
      if (avail != null) times.push(buildStart + avail);
      const started = parseTimeSpanToMs(c.startedAfterBuildStart);
      if (started != null) times.push(buildStart + started);
      if (depth < 10 && c.subDependencies) {
        times.push(...collectChunkTimesMs(c.subDependencies, depth + 1));
      }
    }
    return times;
  }

  // Find the full extent of the timeline
  let latestEnd = tpEnd;
  if (testpass.runs) {
    for (const run of testpass.runs) {
      if (run.endTime) {
        latestEnd = Math.max(latestEnd, new Date(run.endTime).getTime());
      }
    }
  }
  const chunkTimes = collectChunkTimesMs(testpass.dependentChunks ?? [], 0);
  for (const t of chunkTimes) {
    latestEnd = Math.max(latestEnd, t);
  }

  const rawSpan = latestEnd - buildStart;
  const totalSpanMs = rawSpan > 0 ? rawSpan * 1.05 : 60000;

  const toPct = (timeMs: number) =>
    Math.max(0, Math.min(100, ((timeMs - buildStart) / totalSpanMs) * 100));

  // --- Chunk data ---
  interface PreparedChunk {
    chunkName: string;
    pct: number;
    deltaLabel: string;
    startPct?: number;
    subDeps: PreparedChunk[];
    isCriticalPath: boolean;
  }

  function prepareChunks(deps: ChunkAvailabilityDto[], depth: number): PreparedChunk[] {
    return deps
      .map((chunk) => {
        const deltaMs = parseTimeSpanToMs(chunk.availableAfterBuildStart);
        if (deltaMs == null) return null;
        const startMs = parseTimeSpanToMs(chunk.startedAfterBuildStart);
        const subDeps = depth < 10 && chunk.subDependencies
          ? prepareChunks(chunk.subDependencies, depth + 1)
          : [];
        return {
          chunkName: chunk.chunkName,
          pct: toPct(buildStart + deltaMs),
          deltaLabel: formatDeltaShort(deltaMs),
          startPct: startMs != null ? toPct(buildStart + startMs) : undefined,
          subDeps,
          isCriticalPath: chunk.isCriticalPath ?? false,
        };
      })
      .filter(Boolean) as PreparedChunk[];
  }

  const chunks = prepareChunks(testpass.dependentChunks ?? [], 0);

  // Sort chunks by availability time
  chunks.sort((a, b) => a.pct - b.pct);

  // --- Runs (current first, then reruns) ---
  const allRuns: { run: TestpassDto; isCurrent: boolean }[] = [];
  if (hasStartTime) {
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
          {(() => {
            // Build flat list of rows with row indices for connector lines
            type FlatRow = {
              chunk: PreparedChunk;
              parentStartPct?: number;
              depth: number;
              isLast: boolean;
              parentRowIdx?: number;
              barColor: string;
              barBorder: string;
              labelFontSize: number;
              rowIndex: number;
              // Track ancestor depths that need continuing vertical lines
              activeDepths: number[];
            };
            const flatRows: FlatRow[] = [];
            let rowIdx = 0;

            function flattenChunks(
              items: PreparedChunk[],
              depth: number,
              parentRowIdx?: number,
              parentStartPct?: number,
              activeDepths: number[] = [],
            ) {
              for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const isLast = i === items.length - 1;
                const myRowIdx = rowIdx++;
                // Active depths for continuing vertical lines: keep parent's, add current depth if not last
                const childActiveDepths = isLast
                  ? activeDepths.filter(d => d !== depth)
                  : [...activeDepths, depth];
                flatRows.push({
                  chunk: item,
                  parentStartPct,
                  depth,
                  isLast,
                  parentRowIdx,
                  barColor: item.isCriticalPath
                    ? (depth === 0 ? "#f5c6c6" : "#fae0e0")
                    : (depth === 0 ? "#b4d6fa" : "#dce8f5"),
                  barBorder: item.isCriticalPath
                    ? (depth === 0 ? "#c44" : "#d08888")
                    : (depth === 0 ? "#0078d4" : "#a0b4c8"),
                  labelFontSize: depth === 0 ? 12 : 10,
                  rowIndex: myRowIdx,
                  activeDepths: [...activeDepths],
                });
                // Recurse into sub-deps
                if (item.subDeps.length > 0) {
                  flattenChunks(item.subDeps, depth + 1, myRowIdx, item.startPct, childActiveDepths);
                }
              }
            }
            flattenChunks(chunks, 0);
            const totalRows = rowIdx;

            const TREE_STEP = 12;

            // Build tree line segments for the label-area SVG overlay
            const treeLabelLines: React.ReactNode[] = [];
            flatRows.forEach((r, i) => {
              if (r.depth <= 0) return;
              const rowTop = i * ROW_PITCH;
              const midY = rowTop + ROW_HEIGHT / 2;
              const x = (r.depth - 1) * TREE_STEP + 1;

              // Horizontal tick from trunk to label
              treeLabelLines.push(
                <line key={`h-${i}`} x1={x} y1={midY} x2={r.depth * TREE_STEP} y2={midY}
                  stroke="#c8d6e5" strokeWidth="1" />
              );

              // Is this the first child of its parent? (previous row is at a shallower depth)
              const prevRow = flatRows[i - 1];
              const isFirstChild = prevRow && prevRow.depth < r.depth;

              // Vertical line: 
              // - First child: start from parent's midY (extends up into parent row)
              // - Other children: start from top of this row
              const vTop = isFirstChild
                ? (i - 1) * ROW_PITCH + ROW_HEIGHT / 2
                : rowTop;
              const vBottom = r.isLast ? midY : rowTop + ROW_PITCH + 1;
              treeLabelLines.push(
                <line key={`v-${i}`} x1={x} y1={vTop} x2={x} y2={vBottom}
                  stroke="#c8d6e5" strokeWidth="1" />
              );

              // Continuing vertical lines for ancestor depths that still have siblings below
              for (const ad of r.activeDepths) {
                if (ad < r.depth) {
                  const ax = (ad - 1) * TREE_STEP + 1;
                  treeLabelLines.push(
                    <line key={`a-${i}-${ad}`} x1={ax} y1={rowTop} x2={ax} y2={rowTop + ROW_PITCH + 1}
                      stroke="#c8d6e5" strokeWidth="1" />
                  );
                }
              }
            });

            return (
              <div style={{ position: "relative" }}>
                {/* Tree lines SVG overlay in label area */}
                {treeLabelLines.length > 0 && (
                  <svg
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: `${LABEL_WIDTH}px`,
                      height: `${totalRows * ROW_PITCH}px`,
                      pointerEvents: "none",
                      zIndex: 1,
                    }}
                  >
                    {treeLabelLines}
                  </svg>
                )}
                {flatRows.map((r, i) => (
                  <div key={i} style={rowStyle} title={`${r.chunk.chunkName}: ${r.chunk.deltaLabel}`}>
                    <div style={{ ...labelCellStyle, fontSize: `${r.labelFontSize}px`, paddingLeft: `${r.depth * TREE_STEP + 6}px` }} title={r.chunk.chunkName}>
                      {truncate(r.chunk.chunkName, 38 - Math.floor(r.depth * 2))}
                    </div>
                    <div style={trackCellStyle}>
                      {r.chunk.startPct != null && r.chunk.startPct < r.chunk.pct ? (
                        <div style={{ position: "absolute", top: "50%", left: `${r.chunk.startPct}%`, width: `${r.chunk.pct - r.chunk.startPct}%`, height: "6px", transform: "translateY(-50%)", background: r.barColor, border: `1px solid ${r.barBorder}`, borderRadius: "2px" }} />
                      ) : (
                        <div style={{ position: "absolute", top: "50%", left: 0, width: `calc(${r.chunk.pct}% + 2px)`, height: "1px", background: "#c8d6e5" }} />
                      )}
                      <div style={{ position: "absolute", top: "50%", left: `${r.chunk.pct}%`, width: "8px", height: "8px", background: r.chunk.isCriticalPath ? "#c44" : "#0078d4", border: `1px solid ${r.chunk.isCriticalPath ? "#a33" : "#106ebe"}`, transform: "translate(-50%, -50%) rotate(45deg)" }} />
                      <span style={{ position: "absolute", top: "50%", left: `${r.chunk.pct}%`, transform: "translate(8px, -50%)", fontSize: "10px", color: "#888", whiteSpace: "nowrap", fontWeight: 500 }}>
                        {r.chunk.deltaLabel}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
          {/* Divider between chunks and runs */}
          <div style={{ height: "1px", background: "#dedede", margin: "2px 0" }} />
        </>
      )}

      {/* Testpass run rows — section header */}
      {allRuns.length > 0 && (
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
        </>
      )}

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


