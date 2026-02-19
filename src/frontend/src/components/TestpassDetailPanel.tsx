import type { TestpassDto, ChunkAvailabilityDto } from "../types/testResults";
import MiniGanttChart from "./MiniGanttChart";

export interface TestpassDetailPanelProps {
  testpass: TestpassDto;
  buildRegistrationDate: string | null;
}

const panelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "row",
  gap: "16px",
  padding: "12px 16px",
  backgroundColor: "#f8f8f8",
  borderTop: "1px solid #e0e0e0",
};

const tableContainerStyle: React.CSSProperties = {
  flex: "0 0 40%",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const ganttContainerStyle: React.CSSProperties = {
  flex: "0 0 60%",
  minWidth: 0,
};

const thStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  textTransform: "uppercase",
  padding: "4px 8px",
  borderBottom: "1px solid #ddd",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  fontSize: "13px",
  padding: "4px 8px",
  borderBottom: "1px solid #eee",
  whiteSpace: "nowrap",
};

function formatDelta(timeSpanStr: string | null): { text: string; color: string } {
  if (!timeSpanStr) return { text: "—", color: "#999" };
  // TimeSpan serializes as "HH:MM:SS" or "d.HH:MM:SS"
  const parts = timeSpanStr.split(":");
  if (parts.length < 2) return { text: timeSpanStr, color: "#009000" };

  let hours = 0;
  let minutes = 0;
  // Handle "d.HH:MM:SS" format
  const firstPart = parts[0];
  if (firstPart.includes(".")) {
    const [days, hrs] = firstPart.split(".");
    hours = parseInt(days, 10) * 24 + parseInt(hrs, 10);
  } else {
    hours = parseInt(firstPart, 10);
  }
  minutes = parseInt(parts[1], 10);

  const text = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return { text, color: "#009000" };
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

function DependenciesTable({ chunks }: { chunks: ChunkAvailabilityDto[] }) {
  if (!chunks || chunks.length === 0) {
    return (
      <div style={{ fontStyle: "italic", color: "#999", fontSize: "13px" }}>
        No dependency data available
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
        Dependencies
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>Chunk Name</th>
            <th style={thStyle}>Flavor</th>
            <th style={thStyle}>Delivered At</th>
            <th style={thStyle}>Available After Build Start</th>
          </tr>
        </thead>
        <tbody>
          {chunks.map((chunk, i) => {
            const delta = formatDelta(chunk.availableAfterBuildStart);
            return (
              <tr key={i}>
                <td style={tdStyle}>{chunk.chunkName}</td>
                <td style={tdStyle}>{chunk.flavor || "—"}</td>
                <td style={tdStyle}>{formatDateTime(chunk.availableAt)}</td>
                <td style={tdStyle}>
                  <span style={{ color: delta.color }}>{delta.text}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RunsTable({ runs, currentName }: { runs: TestpassDto[]; currentName: string }) {
  if (!runs || runs.length === 0) return null;

  return (
    <div>
      <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
        Runs
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>Testpass Name</th>
            <th style={thStyle}>Start Time</th>
            <th style={thStyle}>End Time</th>
            <th style={thStyle}>Scheduled By</th>
            <th style={thStyle}>Reason</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run, i) => {
            const isCurrent = i === 0;
            const rowBg = isCurrent ? "#eef6ff" : undefined;
            return (
              <tr key={i} style={{ backgroundColor: rowBg }}>
                <td style={tdStyle}>
                  {run.detailsUrl ? (
                    <a
                      href={run.detailsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#0078d4", textDecoration: "none" }}
                    >
                      {run.name}
                    </a>
                  ) : (
                    run.name
                  )}
                  {run.isRerun && (
                    <span
                      style={{
                        marginLeft: "6px",
                        fontSize: "11px",
                        color: "#a0a0a0",
                      }}
                    >
                      (rerun)
                    </span>
                  )}
                </td>
                <td style={tdStyle}>{formatDateTime(run.startTime)}</td>
                <td style={tdStyle}>{formatDateTime(run.endTime)}</td>
                <td style={tdStyle}>{run.rerunOwner || "—"}</td>
                <td style={tdStyle}>{run.rerunReason || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function TestpassDetailPanel({
  testpass,
  buildRegistrationDate,
}: TestpassDetailPanelProps) {
  return (
    <div style={panelStyle}>
      <div style={tableContainerStyle}>
        <DependenciesTable chunks={testpass.dependentChunks} />
        <RunsTable runs={testpass.runs} currentName={testpass.name} />
      </div>
      <div style={ganttContainerStyle}>
        <MiniGanttChart testpass={testpass} buildRegistrationDate={buildRegistrationDate} />
      </div>
    </div>
  );
}
