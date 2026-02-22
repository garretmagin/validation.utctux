import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from "react";
import { Status, Statuses, StatusSize } from "azure-devops-ui/Status";
import { Icon } from "azure-devops-ui/Icon";
import type { TestpassDto } from "../types/testResults";
import TestpassDetailPanel from "./TestpassDetailPanel";

export interface TestpassTableProps {
  testpasses: TestpassDto[];
  buildRegistrationDate: string | null;
  expandTestpass?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  Passed: "#009000",
  Failed: "#cd2828",
  Running: "#0078d4",
};

const DEFAULT_STATUS_COLOR = "#a0a0a0";

const ES_STYLES: Record<string, React.CSSProperties> = {
  CloudTest: { background: "#eff6fc", color: "#005a9e", border: "1px solid #005a9e" },
  T3C: { background: "#e8f5e9", color: "#2e7d32", border: "1px solid #2e7d32" },
};

const DEFAULT_ES_STYLE: React.CSSProperties = {
  border: "1px solid var(--palette-neutral-30, #ccc)",
};

function getStatusProps(result: string) {
  switch (result) {
    case "Passed":
      return Statuses.Success;
    case "Failed":
      return Statuses.Failed;
    case "Running":
      return Statuses.Running;
    default:
      return Statuses.Queued;
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  try {
    const d = new Date(value);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  } catch {
    return value;
  }
}

function formatDuration(value: string | null): string {
  if (!value) return "\u2014";
  // Parse .NET TimeSpan: "HH:MM:SS", "D.HH:MM:SS", or "HH:MM:SS.fff"
  const parts = value.split(":");
  if (parts.length < 2) return value;

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
  seconds = Math.round(parseFloat(parts[2] ?? "0"));

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0 && seconds > 0) return `${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function formatOffset(value: string | null, buildStart: string | null): React.ReactNode {
  if (!value || !buildStart) return null;
  try {
    const diffMs = new Date(value).getTime() - new Date(buildStart).getTime();
    if (diffMs < 0) return null;
    const totalMin = Math.floor(diffMs / 60000);
    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    let label: string;
    if (hrs === 0 && mins === 0) label = "T+0";
    else if (hrs === 0) label = `T+${mins}m`;
    else if (mins === 0) label = `T+${hrs}h`;
    else label = `T+${hrs}h ${mins}m`;
    return (
      <span style={{ color: "#888", fontSize: "0.85em", marginLeft: "6px" }}>
        ({label})
      </span>
    );
  } catch {
    return null;
  }
}

const COLUMN_COUNT = 8;

const headerStyle: React.CSSProperties = {
  padding: "8px 12px",
  textAlign: "left",
  fontSize: "12px",
  fontWeight: 600,
  textTransform: "uppercase",
  borderBottom: "2px solid #e0e0e0",
  whiteSpace: "nowrap",
};

const cellStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: "13px",
  borderBottom: "1px solid #eee",
  whiteSpace: "nowrap",
};

export default function TestpassTable({
  testpasses,
  buildRegistrationDate,
  expandTestpass,
}: TestpassTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const detailRowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    if (!expandTestpass) return;
    const name = expandTestpass.split("\0")[0];
    setExpandedRows((prev) => {
      if (prev.has(name)) return prev;
      const next = new Set(prev);
      next.add(name);
      return next;
    });
    // Double rAF to wait for the detail panel to render
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const mainRow = rowRefs.current.get(name);
        const detailRow = detailRowRefs.current.get(name);
        if (mainRow && detailRow) {
          const detailRect = detailRow.getBoundingClientRect();
          const mainRect = mainRow.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          // If either the detail bottom is off-screen or the main row top is off-screen,
          // scroll to put the main row at the top so the detail panel has maximum space
          if (detailRect.bottom > viewportHeight || mainRect.top < 0) {
            mainRow.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        } else if (mainRow) {
          mainRow.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }, [expandTestpass]);

  const toggleExpand = useCallback((name: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const sorted = useMemo(() => {
    return [...testpasses].sort((a, b) => {
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });
  }, [testpasses]);

  return (
    <table
      role="table"
      style={{ width: "100%", borderCollapse: "collapse" }}
    >
      <thead>
        <tr>
          <th style={{ ...headerStyle, width: "30px" }}></th>
          <th style={{ ...headerStyle, width: "10%" }}>Status</th>
          <th style={{ ...headerStyle, width: "25%" }}>Name</th>
          <th style={{ ...headerStyle, width: "10%" }}>Requirement</th>
          <th style={{ ...headerStyle, width: "12%" }}>Execution System</th>
          <th style={{ ...headerStyle, width: "14%" }}>Start Time</th>
          <th style={{ ...headerStyle, width: "14%" }}>End Time</th>
          <th style={{ ...headerStyle, width: "12%" }}>Duration</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((tp) => {
          const isExpanded = expandedRows.has(tp.name);
          const hasDetails =
            (tp.runs && tp.runs.length > 0) ||
            (tp.dependentChunks && tp.dependentChunks.length > 0);
          return (
            <Fragment key={tp.name}>
              <tr
                ref={(el) => { if (el) rowRefs.current.set(tp.name, el); }}
                style={{ cursor: hasDetails ? "pointer" : undefined }}
                onClick={hasDetails ? () => toggleExpand(tp.name) : undefined}
              >
                <td style={{ ...cellStyle, textAlign: "center", width: "30px", padding: "8px 4px" }}>
                  {hasDetails && (
                    <Icon
                      iconName={isExpanded ? "ChevronDown" : "ChevronRight"}
                      className="cursor-pointer"
                      ariaLabel={
                        isExpanded ? "Collapse details" : "Expand details"
                      }
                      ariaHidden={false}
                    />
                  )}
                </td>
                <td style={cellStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Status
                      {...getStatusProps(tp.result)}
                      size={StatusSize.m}
                    />
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#fff",
                        backgroundColor:
                          STATUS_COLORS[tp.result] ?? DEFAULT_STATUS_COLOR,
                      }}
                    >
                      {tp.result || "Unknown"}
                    </span>
                  </div>
                </td>
                <td style={cellStyle}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {tp.detailsUrl ? (
                      <a
                        href={tp.detailsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bolt-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {tp.name}
                      </a>
                    ) : (
                      <span>{tp.name}</span>
                    )}
                    {tp.schedulePipelineUrl && (
                      <a
                        href={tp.schedulePipelineUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Schedule Pipeline"
                        style={{ color: "#aaa", textDecoration: "none", verticalAlign: "middle", marginLeft: "4px", flexShrink: 0 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-2px" }}><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/></svg>
                      </a>
                    )}
                  </div>
                </td>
                <td style={cellStyle}>{tp.requirement || "\u2014"}</td>
                <td style={cellStyle}>
                  {tp.executionSystem ? (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        fontSize: "12px",
                        fontWeight: 600,
                        ...(ES_STYLES[tp.executionSystem] ?? DEFAULT_ES_STYLE),
                      }}
                    >
                      {tp.executionSystem}
                    </span>
                  ) : (
                    "\u2014"
                  )}
                </td>
                <td style={cellStyle}>
                  {formatDateTime(tp.startTime)}
                  {formatOffset(tp.startTime, buildRegistrationDate)}
                </td>
                <td style={cellStyle}>
                  {formatDateTime(tp.endTime)}
                  {formatOffset(tp.endTime, buildRegistrationDate)}
                </td>
                <td style={cellStyle}>{formatDuration(tp.duration) ?? "\u2014"}</td>
              </tr>
              {isExpanded && (
                <tr ref={(el) => { if (el) detailRowRefs.current.set(tp.name, el); else detailRowRefs.current.delete(tp.name); }}>
                  <td colSpan={COLUMN_COUNT} style={{ padding: 0 }}>
                    <TestpassDetailPanel
                      testpass={tp}
                      buildRegistrationDate={buildRegistrationDate}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}