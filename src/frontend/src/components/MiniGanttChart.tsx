import React, { useState, useRef, useEffect } from "react";
import type { TestpassDto, ChunkAvailabilityDto } from "../types/testResults";
import TreeView from "./CssTree";
import "./MiniGanttChart.css";

export interface MiniGanttChartProps {
  testpass: TestpassDto;
  buildRegistrationDate: string | null;
  buildRestartTimes?: string[];
  collapsedNodes: Set<string>;
  onToggle: (key: string) => void;
}

// --- Helpers ---

const ROW_HEIGHT = 24;
// box-sizing: border-box is active globally, so border is inside ROW_HEIGHT
const ROW_PITCH = ROW_HEIGHT;
const LABEL_WIDTH = 260;
const MAX_CHUNK_DEPTH = 10;

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
    const parsedDays = Number.parseInt(days, 10);
    const parsedHours = Number.parseInt(hrs, 10);
    if (Number.isNaN(parsedDays) || Number.isNaN(parsedHours)) return null;
    hours = parsedDays * 24 + parsedHours;
  } else {
    const parsedHours = Number.parseInt(firstPart, 10);
    if (Number.isNaN(parsedHours)) return null;
    hours = parsedHours;
  }
  minutes = Number.parseInt(parts[1], 10);
  if (Number.isNaN(minutes)) return null;
  if (parts.length >= 3) {
    seconds = Number.parseFloat(parts[2]);
    if (Number.isNaN(seconds)) return null;
  }
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

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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

// --- Cone-of-prediction tooltip hook ---

/** Cross product sign for point-in-triangle test. */
function crossSign(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  return (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
}

/**
 * Returns true if `point` is inside the triangle formed by the mouse exit
 * position (apex) and the two bottom corners of the tooltip rect (padded),
 * OR if the point is inside the padded tooltip rect itself.
 */
function isInCone(
  apexX: number, apexY: number,
  px: number, py: number,
  rect: DOMRect, pad: number,
): boolean {
  // Point inside padded tooltip rect?
  if (px >= rect.left - pad && px <= rect.right + pad &&
      py >= rect.top - pad && py <= rect.bottom + pad) return true;

  // Triangle: apex → bottom-left corner → bottom-right corner (padded)
  const bx = rect.left - pad, by = rect.bottom + pad;
  const cx = rect.right + pad, cy = rect.bottom + pad;
  const d1 = crossSign(px, py, apexX, apexY, bx, by);
  const d2 = crossSign(px, py, bx, by, cx, cy);
  const d3 = crossSign(px, py, cx, cy, apexX, apexY);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/**
 * Hook that keeps a tooltip visible while the cursor moves towards it,
 * using a cone-of-prediction (triangle from exit point to tooltip edges).
 * The tooltip stays interactive so links inside it can be clicked.
 */
function useTooltipCone() {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const overTooltipRef = useRef(false);
  const moveCleanupRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => { if (timerRef.current != null) { clearTimeout(timerRef.current); timerRef.current = null; } };
  const clearMove = () => { moveCleanupRef.current?.(); moveCleanupRef.current = null; };

  const hide = () => { clearTimer(); clearMove(); overTooltipRef.current = false; setShowTooltip(false); };

  const onTriggerEnter = () => { clearTimer(); clearMove(); overTooltipRef.current = false; setShowTooltip(true); };

  const onTriggerLeave = (e: React.MouseEvent) => {
    const exitX = e.clientX, exitY = e.clientY;
    const tip = tooltipRef.current;
    if (!tip) { hide(); return; }
    const rect = tip.getBoundingClientRect();
    const PAD = 40;

    const onMove = (ev: MouseEvent) => {
      if (tip.contains(ev.target as Node)) { clearMove(); overTooltipRef.current = true; return; }
      if (!isInCone(exitX, exitY, ev.clientX, ev.clientY, rect, PAD)) hide();
    };
    document.addEventListener("mousemove", onMove);
    moveCleanupRef.current = () => document.removeEventListener("mousemove", onMove);
    timerRef.current = setTimeout(() => { if (!overTooltipRef.current) hide(); }, 600);
  };

  const onTooltipEnter = () => { clearTimer(); clearMove(); overTooltipRef.current = true; };
  const onTooltipLeave = () => { overTooltipRef.current = false; clearTimer(); timerRef.current = setTimeout(hide, 150); };

  useEffect(() => () => { clearTimer(); clearMove(); }, []);

  return { showTooltip, onTriggerEnter, onTriggerLeave, onTooltipEnter, onTooltipLeave, tooltipRef };
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

interface TestpassBarProps {
  run: TestpassDto;
  toPct: (ms: number) => number;
  executionSystem: string;
  isCurrent: boolean;
  hasMultipleRuns: boolean;
}

function TestpassBar({
  run,
  toPct,
  executionSystem,
  isCurrent,
  hasMultipleRuns,
}: TestpassBarProps) {
  const { showTooltip, onTriggerEnter, onTriggerLeave, onTooltipEnter, onTooltipLeave, tooltipRef } = useTooltipCone();
  if (!run.startTime) return null;

  const rStart = new Date(run.startTime).getTime();
  const rEnd = run.endTime ? new Date(run.endTime).getTime() : Date.now();
  const left = toPct(rStart);
  const right = toPct(rEnd);
  const width = Math.max(right - left, 0.4);
  const durationMs = rEnd - rStart;
  const barColor = getBarColor(executionSystem, run.result, run.status);
  const isRunning = barColor === "running";

  const displayLabel = truncate(run.name, 100);

  return (
    <div style={{ ...rowStyle, position: "relative" }}>
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
          onMouseEnter={onTriggerEnter}
          onMouseLeave={onTriggerLeave}
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
          {showTooltip && (
            <div
              ref={tooltipRef}
              className="gantt-tooltip"
              style={{ pointerEvents: "auto" }}
              onMouseEnter={onTooltipEnter}
              onMouseLeave={onTooltipLeave}
            >
              <div className="gantt-tooltip-row">
                <strong>{run.name}</strong>
              </div>
              <div className="gantt-tooltip-row">
                <span className="gantt-tooltip-label">Duration:</span>
                <span>{formatDurationLabel(durationMs)}</span>
              </div>
              <div className="gantt-tooltip-row">
                <span className="gantt-tooltip-label">Start:</span>
                <span>{run.startTime ? formatTime(run.startTime) : "—"}</span>
              </div>
              <div className="gantt-tooltip-row">
                <span className="gantt-tooltip-label">End:</span>
                <span>{run.endTime ? formatTime(run.endTime) : isRunning ? "Running…" : "—"}</span>
              </div>
              {run.result && (
                <div className="gantt-tooltip-row">
                  <span className="gantt-tooltip-label">Result:</span>
                  <span>{run.result}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Types & helpers for tree rendering ---

interface PreparedChunk {
  chunkName: string;
  pct: number;
  deltaLabel: string;
  startPct?: number;
  subDeps: PreparedChunk[];
  isCriticalPath: boolean;
  startedAt: string | null;
  startedDeltaLabel: string | null;
  availableAt: string | null;
  durationLabel: string | null;
  mediaCreationUrl: string | null;
}

interface FlatTrack {
  chunk: PreparedChunk;
  barColor: string;
  barBorder: string;
  depth: number;
  key: string;
}

function flattenForTracks(
  chunks: PreparedChunk[],
  collapsedNodes: Set<string>,
  depth: number = 0,
  pathPrefix: string = "",
): FlatTrack[] {
  const result: FlatTrack[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const key = pathPrefix ? `${pathPrefix}-${i}` : `${i}`;
    result.push({
      chunk,
      barColor: chunk.isCriticalPath
        ? (depth === 0 ? "#f5c6c6" : "#fae0e0")
        : (depth === 0 ? "#b4d6fa" : "#dce8f5"),
      barBorder: chunk.isCriticalPath
        ? (depth === 0 ? "#c44" : "#d08888")
        : (depth === 0 ? "#0078d4" : "#a0b4c8"),
      depth,
      key,
    });
    if (chunk.subDeps.length > 0 && !collapsedNodes.has(key)) {
      result.push(...flattenForTracks(chunk.subDeps, collapsedNodes, depth + 1, key));
    }
  }
  return result;
}

// ChunkTreeLabels removed — using shared TreeView component instead

interface ChunkTrackRowProps {
  chunk: PreparedChunk;
  barColor: string;
  barBorder: string;
  top: number;
}

function ChunkTrackRow({ chunk, barColor, barBorder, top }: ChunkTrackRowProps) {
  const { showTooltip, onTriggerEnter, onTriggerLeave, onTooltipEnter, onTooltipLeave, tooltipRef } = useTooltipCone();
  return (
    <div
      className="mini-gantt-track-row"
      style={{ top: `${top}px`, height: `${ROW_HEIGHT}px` }}
      onMouseEnter={onTriggerEnter}
      onMouseLeave={onTriggerLeave}
    >
      {chunk.startPct != null && chunk.startPct < chunk.pct ? (
        <div style={{ position: "absolute", top: "50%", left: `${chunk.startPct}%`, width: `${chunk.pct - chunk.startPct}%`, height: "6px", transform: "translateY(-50%)", background: barColor, border: `1px solid ${barBorder}`, borderRadius: "2px" }} />
      ) : (
        <div style={{ position: "absolute", top: "50%", left: 0, width: `calc(${chunk.pct}% + 2px)`, height: "1px", background: "#c8d6e5" }} />
      )}
      <div style={{ position: "absolute", top: "50%", left: `${chunk.pct}%`, width: "8px", height: "8px", background: chunk.isCriticalPath ? "#c44" : "#0078d4", border: `1px solid ${chunk.isCriticalPath ? "#a33" : "#106ebe"}`, transform: "translate(-50%, -50%) rotate(45deg)" }} />
      <span style={{ position: "absolute", top: "50%", left: `${chunk.pct}%`, transform: "translate(8px, -50%)", fontSize: "10px", color: "#888", whiteSpace: "nowrap", fontWeight: 500 }}>
        {chunk.deltaLabel}
      </span>
      {showTooltip && (
        <div
          ref={tooltipRef}
          className="gantt-tooltip"
          style={{ left: `${chunk.pct}%`, pointerEvents: "auto" }}
          onMouseEnter={onTooltipEnter}
          onMouseLeave={onTooltipLeave}
        >
          <div className="gantt-tooltip-row">
            <strong>{chunk.chunkName}</strong>
          </div>
          {chunk.startedAt && (
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">Started:</span>
              <span>{formatTime(chunk.startedAt)}{chunk.startedDeltaLabel ? ` (${chunk.startedDeltaLabel})` : ""}</span>
            </div>
          )}
          <div className="gantt-tooltip-row">
            <span className="gantt-tooltip-label">Available:</span>
            <span>{chunk.availableAt ? formatTime(chunk.availableAt) : "—"} ({chunk.deltaLabel})</span>
          </div>
          {chunk.durationLabel && (
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">Duration:</span>
              <span>{chunk.durationLabel}</span>
            </div>
          )}
          {chunk.mediaCreationUrl && (
            <>
              <div className="gantt-tooltip-separator" />
              <div className="gantt-tooltip-row">
                <a
                  href={chunk.mediaCreationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#6db3f2", textDecoration: "underline" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  View in Media Creation
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

export default function MiniGanttChart({
  testpass,
  buildRegistrationDate,
  buildRestartTimes,
  collapsedNodes,
  onToggle,
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
    : testpass.startTime
      ? new Date(testpass.startTime).getTime()
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
      if (depth < MAX_CHUNK_DEPTH && c.subDependencies) {
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

  function prepareChunks(deps: ChunkAvailabilityDto[], depth: number): PreparedChunk[] {
    const prepared: PreparedChunk[] = [];
    for (const chunk of deps) {
      const deltaMs = parseTimeSpanToMs(chunk.availableAfterBuildStart);
      if (deltaMs == null) continue;

      const startMs = parseTimeSpanToMs(chunk.startedAfterBuildStart);
      const subDeps = depth < MAX_CHUNK_DEPTH && chunk.subDependencies
        ? prepareChunks(chunk.subDependencies, depth + 1)
        : [];
      const durationMs = startMs != null ? deltaMs - startMs : null;

      prepared.push({
        chunkName: chunk.chunkName,
        pct: toPct(buildStart + deltaMs),
        deltaLabel: formatDeltaShort(deltaMs),
        startPct: startMs != null ? toPct(buildStart + startMs) : undefined,
        subDeps,
        isCriticalPath: chunk.isCriticalPath ?? false,
        startedAt: chunk.startedAt ?? null,
        startedDeltaLabel: startMs != null ? formatDeltaShort(startMs) : null,
        availableAt: chunk.availableAt ?? null,
        durationLabel: durationMs != null && durationMs > 0 ? formatDurationLabel(durationMs) : null,
        mediaCreationUrl: chunk.mediaCreationUrl ?? null,
      });
    }
    return prepared;
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
  const visibleTracks = hasChunks ? flattenForTracks(chunks, collapsedNodes) : [];
  const totalChunkRows = visibleTracks.length;

  // Compute build restart positions as percentages
  const restartMarkers = (buildRestartTimes ?? [])
    .map((time) => ({ time, pct: toPct(new Date(time).getTime()) }))
    .filter((marker) => marker.pct > 0 && marker.pct < 100);

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
        Timeline from Build Start
      </div>

      {/* Column headers with angled labels */}
      <div
        style={{
          display: "flex",
          height: "18px",
          alignItems: "center",
          borderBottom: "2px solid #e0e0e0",
          marginBottom: "1px",
          marginTop: "40px",
        }}
      >
        <div
          style={{
            width: `${LABEL_WIDTH}px`,
            minWidth: `${LABEL_WIDTH}px`,
          }}
        />
        <div style={{ flex: 1, position: "relative", height: "100%" }}>
          {/* Build Started angled label */}
          <span
            style={{
              position: "absolute",
              left: "0%",
              transform: "rotate(-45deg)",
              transformOrigin: "bottom left",
              fontWeight: 600,
              color: "#004578",
              fontSize: "11px",
              top: "-14px",
              whiteSpace: "nowrap",
            }}
          >
            Build Started
          </span>
          {/* Build Started short line */}
          <span
            style={{
              position: "absolute",
              left: "0%",
              top: 0,
              bottom: 0,
              borderLeft: "2px dashed #004578",
              zIndex: 1,
            }}
          />
          {/* Build Restarted angled labels */}
          {restartMarkers.map((marker) => (
            <span key={marker.time}>
              <span
                style={{
                  position: "absolute",
                  left: `${marker.pct.toFixed(1)}%`,
                  transform: "rotate(-45deg)",
                  transformOrigin: "bottom left",
                  fontWeight: 600,
                  color: "#004578",
                  fontSize: "11px",
                  top: "-14px",
                  whiteSpace: "nowrap",
                }}
              >
                Build Restarted
              </span>
              <span
                style={{
                  position: "absolute",
                  left: `${marker.pct.toFixed(1)}%`,
                  top: 0,
                  bottom: 0,
                  borderLeft: "2px dashed #004578",
                  zIndex: 1,
                }}
              />
            </span>
          ))}
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
          <div style={{ position: "relative", display: "flex" }}>
            {/* Label tree panel */}
            <TreeView<PreparedChunk>
              items={chunks}
              getChildren={(c) => c.subDeps}
              collapsedNodes={collapsedNodes}
              onToggle={onToggle}
              renderContent={(chunk, depth) => (
                <span className="chunk-label" title={chunk.chunkName}>
                  {truncate(chunk.chunkName, 36 - depth * 2)}
                </span>
              )}
              className="mini-gantt-labels"
            />
            {/* Track bar panel */}
            <div
              style={{
                flex: 1,
                position: "relative",
                height: `${totalChunkRows * ROW_PITCH}px`,
                minWidth: 0,
              }}
            >
              {visibleTracks.map((t, i) => (
                <ChunkTrackRow
                  key={t.key}
                  chunk={t.chunk}
                  barColor={t.barColor}
                  barBorder={t.barBorder}
                  top={i * ROW_PITCH}
                />
              ))}
            </div>
          </div>
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
          {allRuns.map(({ run, isCurrent }, i) => {
            const runKey = `${run.name}-${run.startTime ?? "nostart"}-${run.endTime ?? "noend"}-${isCurrent ? "current" : "rerun"}-${i}`;
            return (
              <TestpassBar
                key={runKey}
                run={run}
                toPct={toPct}
                executionSystem={testpass.executionSystem}
                isCurrent={isCurrent}
                hasMultipleRuns={allRuns.length > 1}
              />
            );
          })}
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
                key={`${tick.label}-${tick.pct.toFixed(3)}`}
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


