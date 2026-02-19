import { useState, useMemo, useCallback, Fragment } from "react";
import { Status, Statuses, StatusSize } from "azure-devops-ui/Status";
import { Icon } from "azure-devops-ui/Icon";
import type { TestpassDto } from "../types/testResults";
import TestpassDetailPanel from "./TestpassDetailPanel";

export interface TestpassTableProps {
  testpasses: TestpassDto[];
  buildRegistrationDate: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  Passed: "#009000",
  Failed: "#cd2828",
  Running: "#0078d4",
};

const DEFAULT_STATUS_COLOR = "#a0a0a0";

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
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return value;
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
}: TestpassTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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
                        border: "1px solid var(--palette-neutral-30, #ccc)",
                      }}
                    >
                      {tp.executionSystem}
                    </span>
                  ) : (
                    "\u2014"
                  )}
                </td>
                <td style={cellStyle}>{formatDateTime(tp.startTime)}</td>
                <td style={cellStyle}>{formatDateTime(tp.endTime)}</td>
                <td style={cellStyle}>{tp.duration ?? "\u2014"}</td>
              </tr>
              {isExpanded && (
                <tr>
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