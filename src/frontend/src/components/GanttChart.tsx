import { useMemo, useState } from "react";
import { Card } from "azure-devops-ui/Card";
import type { TestpassDto } from "../types/testResults";
import "./GanttChart.css";

interface GanttChartProps {
  testpasses: TestpassDto[];
  timeRange: { min: string | null; max: string | null };
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

function calculateTimeIntervals(totalSeconds: number): number {
  if (totalSeconds <= 3600) return Math.max(Math.ceil(totalSeconds / 600), 2);
  if (totalSeconds <= 7200) return 8;
  if (totalSeconds <= 14400) return 8;
  return 10;
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
}: {
  totalSeconds: number;
  bottom?: boolean;
}) {
  const intervals = calculateTimeIntervals(totalSeconds);
  const marks = [];
  for (let i = 0; i <= intervals; i++) {
    const percent = (i * 100) / intervals;
    const elapsed = (totalSeconds * i) / intervals;
    marks.push(
      <span
        key={i}
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
  index,
}: {
  tp: TestpassDto;
  leftPercent: number;
  widthPercent: number;
  durationText: string;
  index: number;
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
      <a href={`#testpass-${index}`} style={{ display: "contents" }}>
      <div
        className={`gantt-bar ${statusClass}`}
        style={{
          left: `${leftPercent.toFixed(2)}%`,
          width: `${widthPercent.toFixed(2)}%`,
        }}
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
          </div>
        )}
      </div>
      </a>
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

export default function GanttChart({ testpasses, timeRange }: GanttChartProps) {
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

  if (sortedTestpasses.length === 0) {
    return null;
  }

  return (
    <Card
      className="flex-grow"
      titleProps={{ text: "Execution Timeline", ariaLevel: 2 }}
    >
      <div className="gantt-container" style={{ padding: "0 20px 20px" }}>
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
        <TimelineRuler totalSeconds={totalSeconds} />

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
                <div className="gantt-label" title={tp.name}>
                  {tp.name}
                  {esClass && (
                    <span className={`gantt-es-badge ${esClass}`}>
                      {esClass === "cloudtest" ? "CT" : "T3C"}
                    </span>
                  )}
                </div>
                <div className="gantt-track">
                  <GanttBar
                    tp={tp}
                    leftPercent={leftPercent}
                    widthPercent={widthPercent}
                    durationText={durationText}
                    index={i}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom ruler */}
        <TimelineRuler totalSeconds={totalSeconds} bottom />
      </div>
    </Card>
  );
}
