import { useMemo, useState, useRef, useCallback } from "react";
import { Card } from "azure-devops-ui/Card";
import type { TestpassDto } from "../types/testResults";
import "./GanttChart.css";

const DEFAULT_LABEL_WIDTH = 280;
const MIN_LABEL_WIDTH = 120;
const MAX_LABEL_WIDTH = 800;

interface GanttChartProps {
  testpasses: TestpassDto[];
  timeRange: { min: string | null; max: string | null };
  onBarClick?: (testpassName: string) => void;
  buildStartTime?: string | null;
  buildRestartTimes?: string[];
}

function parseDuration(duration: string): number {
  // Parse .NET TimeSpan format: "HH:MM:SS" or "D.HH:MM:SS" or "HH:MM:SS.fff"
  const parts = duration.split(":");
  if (parts.length < 2) return 0;

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (parts[0].includes(".")) {
    const [days, h] = parts[0].split(".");
    hours = parseInt(days, 10) * 24 + parseInt(h, 10);
  } else {
    hours = parseInt(parts[0], 10);
  }
  minutes = parseInt(parts[1], 10);
  seconds = parseFloat(parts[2] ?? "0");

  return hours * 3600 + minutes * 60 + seconds;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

function formatElapsedTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs === 0 && mins === 0) return "T+0";
  if (hrs === 0) return `T+${mins}m`;
  if (mins === 0) return `T+${hrs}h`;
  return `T+${hrs}h${mins}m`;
}

function calculateTickStep(totalSeconds: number): number {
  // Nice round intervals; pick the smallest that keeps total ticks ≤ 12
  const candidates = [
    300,    // 5 min
    900,    // 15 min
    1800,   // 30 min
    3600,   // 1 hour
    7200,   // 2 hours
    14400,  // 4 hours
    21600,  // 6 hours
    43200,  // 12 hours
    86400,  // 24 hours
  ];
  for (const step of candidates) {
    if (Math.floor(totalSeconds / step) <= 12) return step;
  }
  return 86400;
}

function getStatusClass(tp: TestpassDto): string {
  const status = tp.status?.toLowerCase() ?? "";
  const result = tp.result?.toLowerCase() ?? "";
  if (status === "running" || status === "inprogress") return "running";
  if (status === "queued" || status === "notstarted") return "queued";
  if (result === "failed" || result === "timedout") return "failed";
  if (result === "passed" || result === "succeeded") return "passed";
  if (status === "completed") return "passed";
  return "queued";
}

function getEsClass(tp: TestpassDto): string {
  const es = tp.executionSystem?.toLowerCase() ?? "";
  if (es === "cloudtest") return "cloudtest";
  if (es === "t3c" || es === "t3") return "t3c";
  return "";
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface TooltipData {
  name: string;
  duration: string;
  startTime: string;
  endTime: string;
  executionSystem: string;
  type: string;
  scope: string;
}

function TimelineRuler({
  totalSeconds,
  bottom,
  firstTestPercent,
  firstTestLabel,
  restartPercents,
}: {
  totalSeconds: number;
  bottom?: boolean;
  firstTestPercent?: number;
  firstTestLabel?: string;
  restartPercents?: number[];
}) {
  const step = calculateTickStep(totalSeconds);
  const marks = [];
  for (let elapsed = 0; elapsed <= totalSeconds; elapsed += step) {
    const percent = (elapsed / totalSeconds) * 100;
    marks.push(
      <span
        key={elapsed}
        className="gantt-timeline-mark"
        style={{ left: `${percent.toFixed(1)}%` }}
      >
        {formatElapsedTime(elapsed)}
      </span>
    );
  }

  return (
    <div
      className={`gantt-timeline-ruler${bottom ? " bottom" : ""}`}
    >
      <div className="gantt-timeline-spacer" />
      <div className="gantt-timeline-track">
        {!bottom && (
          <span
            className="gantt-build-started-mark"
            style={{
              position: "absolute",
              left: "0%",
              transform: "rotate(-45deg)",
              transformOrigin: "bottom left",
              fontWeight: 600,
              color: "#004578",
              fontSize: "11px",
              top: "-14px",
            }}
          >
            Build Started
          </span>
        )}
        {firstTestPercent != null && firstTestLabel && !bottom && (
          <span
            style={{
              position: "absolute",
              left: `${firstTestPercent.toFixed(1)}%`,
              transform: "rotate(-45deg)",
              transformOrigin: "bottom left",
              fontWeight: 600,
              color: "#004578",
              fontSize: "11px",
              top: "-14px",
              whiteSpace: "nowrap",
            }}
          >
            First Test ({firstTestLabel})
          </span>
        )}
        {firstTestPercent != null && (
          <span
            style={{
              position: "absolute",
              left: `${firstTestPercent.toFixed(1)}%`,
              top: 0,
              bottom: 0,
              borderLeft: "2px dashed #004578",
              zIndex: 1,
            }}
          />
        )}
        <span
          className="gantt-build-started-line"
          style={{
            position: "absolute",
            left: "0%",
            top: 0,
            bottom: 0,
            borderLeft: "2px dashed #004578",
            zIndex: 1,
          }}
        />
        {/* Build restart markers */}
        {restartPercents?.map((pct, i) => (
          <span key={`restart-${i}`}>
            {!bottom && (
              <span
                style={{
                  position: "absolute",
                  left: `${pct.toFixed(1)}%`,
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
            )}
            <span
              style={{
                position: "absolute",
                left: `${pct.toFixed(1)}%`,
                top: 0,
                bottom: 0,
                borderLeft: "2px dashed #004578",
                zIndex: 1,
              }}
            />
          </span>
        ))}
        {marks}
      </div>
    </div>
  );
}

function GanttBar({
  tp,
  leftPercent,
  widthPercent,
  durationText,
  onBarClick,
  buildStartTime,
}: {
  tp: TestpassDto;
  leftPercent: number;
  widthPercent: number;
  durationText: string;
  onBarClick?: (testpassName: string) => void;
  buildStartTime?: string | null;
}){
  const [showTooltip, setShowTooltip] = useState(false);

  const statusClass = getStatusClass(tp);
  const tooltipData: TooltipData = {
    name: tp.name,
    duration: tp.duration ?? "—",
    startTime: tp.startTime ? formatTime(tp.startTime) : "—",
    endTime: tp.endTime ? formatTime(tp.endTime) : statusClass === "running" ? "Running…" : "—",
    executionSystem: tp.executionSystem ?? "Unknown",
    type: tp.type ?? "—",
    scope: tp.scope ?? "—",
  };

  return (
    <>
      <div
        className={`gantt-bar ${statusClass}`}
        style={{
          left: `${leftPercent.toFixed(2)}%`,
          width: `${widthPercent.toFixed(2)}%`,
        }}
        onClick={() => onBarClick?.(tp.name)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {tp.isRerun && (
          <span className="gantt-rerun-icon" title="Rerun">↻</span>
        )}
        {showTooltip && (
          <div className="gantt-tooltip">
            <div className="gantt-tooltip-row">
              <strong>{tooltipData.name}</strong>
            </div>
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">Duration:</span>
              <span>{tooltipData.duration}</span>
            </div>
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">Start:</span>
              <span>{tooltipData.startTime}</span>
            </div>
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">End:</span>
              <span>{tooltipData.endTime}</span>
            </div>
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">System:</span>
              <span>{tooltipData.executionSystem}</span>
            </div>
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">Type:</span>
              <span>{tooltipData.type}</span>
            </div>
            <div className="gantt-tooltip-row">
              <span className="gantt-tooltip-label">Scope:</span>
              <span>{tooltipData.scope}</span>
            </div>
            {tp.dependentChunks && tp.dependentChunks.length > 0 && (
              <>
                <div className="gantt-tooltip-separator" />
                <div className="gantt-tooltip-row">
                  <strong>Dependent Chunks</strong>
                </div>
                {[...tp.dependentChunks].sort((a, b) => {
                  if (!a.availableAt && !b.availableAt) return 0;
                  if (!a.availableAt) return 1;
                  if (!b.availableAt) return -1;
                  return new Date(a.availableAt).getTime() - new Date(b.availableAt).getTime();
                }).map((chunk, ci) => (
                  <div key={ci} className="gantt-tooltip-chunk">
                    <span className="gantt-tooltip-chunk-name">{chunk.chunkName}</span>
                    <span className="gantt-tooltip-chunk-detail">
                      {chunk.availableAt ? formatTime(chunk.availableAt) : "—"}
                      {chunk.availableAfterBuildStart
                        ? ` (T+${chunk.availableAfterBuildStart})`
                        : buildStartTime && chunk.availableAt
                          ? ` (T+${formatDuration(
                              (new Date(chunk.availableAt).getTime() -
                                new Date(buildStartTime).getTime()) /
                                1000
                            )})`
                          : ""}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
      {durationText && (
        <span
          className="gantt-duration"
          style={{ left: `${(leftPercent + widthPercent).toFixed(2)}%` }}
        >
          {durationText}
        </span>
      )}
    </>
  );
}

export default function GanttChart({ testpasses, timeRange, onBarClick, buildStartTime, buildRestartTimes }: GanttChartProps) {
  const [labelWidth, setLabelWidth] = useState(DEFAULT_LABEL_WIDTH);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startWidth: labelWidth };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const delta = ev.clientX - dragState.current.startX;
      const newWidth = Math.min(MAX_LABEL_WIDTH, Math.max(MIN_LABEL_WIDTH, dragState.current.startWidth + delta));
      setLabelWidth(newWidth);
    };

    const onMouseUp = () => {
      dragState.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [labelWidth]);

  const minTime = useMemo(() => new Date(timeRange.min ?? 0).getTime(), [timeRange.min]);
  const maxTime = useMemo(() => new Date(timeRange.max ?? 0).getTime(), [timeRange.max]);
  const totalSeconds = useMemo(
    () => {
      const raw = Math.max((maxTime - minTime) / 1000, 1);
      // Add 5% right-side padding so bars aren't jammed against the edge
      return raw * 1.05;
    },
    [minTime, maxTime]
  );

  const sortedTestpasses = useMemo(() => {
    return [...testpasses]
      .filter((tp) => tp.startTime != null)
      .sort(
        (a, b) =>
          new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime()
      );
  }, [testpasses]);

  // Compute first test marker position
  const firstTestStartMs = sortedTestpasses.length > 0
    ? new Date(sortedTestpasses[0].startTime!).getTime()
    : null;
  const firstTestOffsetSeconds = firstTestStartMs != null
    ? (firstTestStartMs - minTime) / 1000
    : null;
  const firstTestPercent = firstTestOffsetSeconds != null && firstTestOffsetSeconds > 0
    ? (firstTestOffsetSeconds / totalSeconds) * 100
    : undefined;
  const firstTestLabel = firstTestOffsetSeconds != null && firstTestOffsetSeconds > 0
    ? formatElapsedTime(firstTestOffsetSeconds)
    : undefined;

  // Compute restart marker positions
  const restartPercents = useMemo(() => {
    if (!buildRestartTimes || buildRestartTimes.length === 0) return undefined;
    return buildRestartTimes
      .map(t => {
        const ms = new Date(t).getTime();
        const offsetSec = (ms - minTime) / 1000;
        if (offsetSec <= 0 || offsetSec >= totalSeconds) return null;
        return (offsetSec / totalSeconds) * 100;
      })
      .filter((p): p is number => p != null);
  }, [buildRestartTimes, minTime, totalSeconds]);

  if (sortedTestpasses.length === 0) {
    return null;
  }

  return (
    <Card
      className="flex-grow"
      titleProps={{ text: "Execution Timeline", ariaLevel: 2 }}
    >
      <div className="gantt-container" style={{ padding: "0 20px 20px", "--gantt-label-width": `${labelWidth}px` } as React.CSSProperties}>
        {/* Legend */}
        <div className="gantt-legend">
          <div className="gantt-legend-section">
            <span className="gantt-legend-title">Status</span>
            <span className="gantt-legend-item">
              <span
                className="gantt-legend-color"
                style={{ background: "#107c10" }}
              />
              Passed
            </span>
            <span className="gantt-legend-item">
              <span
                className="gantt-legend-color"
                style={{ background: "#cd2535" }}
              />
              Failed
            </span>
            <span className="gantt-legend-item">
              <span
                className="gantt-legend-color"
                style={{ background: "#0078d4" }}
              />
              Running
            </span>
            <span className="gantt-legend-item">
              <span
                className="gantt-legend-color"
                style={{ background: "#666666" }}
              />
              Queued
            </span>
          </div>
          <div className="gantt-legend-section">
            <span className="gantt-legend-title">System</span>
            <span className="gantt-legend-item">
              <span className="gantt-es-badge cloudtest">CT</span>
              CloudTest
            </span>
            <span className="gantt-legend-item">
              <span className="gantt-es-badge t3c">T3C</span>
              T3C
            </span>
          </div>
        </div>

        {/* Top ruler */}
        <TimelineRuler
          totalSeconds={totalSeconds}
          firstTestPercent={firstTestPercent}
          firstTestLabel={firstTestLabel}
          restartPercents={restartPercents}
        />

        {/* Gantt rows */}
        <div className="gantt-rows">
          {sortedTestpasses.map((tp, i) => {
            const startMs = new Date(tp.startTime!).getTime();
            const endMs = tp.endTime
              ? new Date(tp.endTime).getTime()
              : Date.now();
            const leftPercent =
              ((startMs - minTime) / 1000 / totalSeconds) * 100;
            let widthPercent =
              ((endMs - startMs) / 1000 / totalSeconds) * 100;
            widthPercent = Math.max(widthPercent, 0.5);

            const durationSeconds = tp.duration
              ? parseDuration(tp.duration)
              : (endMs - startMs) / 1000;
            const durationText =
              durationSeconds >= 60 ? formatDuration(durationSeconds) : "";

            const esClass = getEsClass(tp);

            return (
              <div className="gantt-row" key={`${tp.name}-${i}`}>
                <div
                  className="gantt-label"
                  title={tp.name}
                  style={onBarClick ? { cursor: "pointer" } : undefined}
                  onClick={() => onBarClick?.(tp.name)}
                >
                  {tp.name}
                  {esClass && (
                    <span className={`gantt-es-badge ${esClass}`}>
                      {esClass === "cloudtest" ? "CT" : "T3C"}
                    </span>
                  )}
                </div>
                <div className="gantt-divider" onMouseDown={onDividerMouseDown} />
                <div className="gantt-track">
                  <GanttBar
                    tp={tp}
                    leftPercent={leftPercent}
                    widthPercent={widthPercent}
                    durationText={durationText}
                    onBarClick={onBarClick}
                    buildStartTime={buildStartTime}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom ruler */}
        <TimelineRuler
          totalSeconds={totalSeconds}
          bottom
          firstTestPercent={firstTestPercent}
          firstTestLabel={firstTestLabel}
          restartPercents={restartPercents}
        />
      </div>
    </Card>
  );
}
