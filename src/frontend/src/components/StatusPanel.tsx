import { useEffect, useRef } from "react";
import { Card } from "azure-devops-ui/Card";
import { Button } from "azure-devops-ui/Button";
import {
  MessageCard,
  MessageCardSeverity,
} from "azure-devops-ui/MessageCard";
import {
  Status,
  Statuses,
  StatusSize,
  type IStatusProps,
} from "azure-devops-ui/Status";
import type { ProgressMessage } from "../types/testResults";

type WorkflowStatus = "idle" | "loading" | "polling" | "completed" | "error";

interface StatusPanelProps {
  status: WorkflowStatus;
  progress: ProgressMessage[];
  error: string | null;
  isTimeout?: boolean;
  onRetry?: () => void;
}

function getStatusIndicator(status: WorkflowStatus): IStatusProps {
  switch (status) {
    case "loading":
    case "polling":
      return Statuses.Running;
    case "completed":
      return Statuses.Success;
    case "error":
      return Statuses.Failed;
    default:
      return Statuses.Queued;
  }
}

function getStatusLabel(status: WorkflowStatus): string {
  switch (status) {
    case "loading":
      return "Starting...";
    case "polling":
      return "Gathering data...";
    case "completed":
      return "Completed";
    case "error":
      return "Failed";
    default:
      return "Idle";
  }
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function StatusPanel({
  status,
  progress,
  error,
  isTimeout,
  onRetry,
}: StatusPanelProps) {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [progress.length]);

  return (
    <Card
      className="flex-grow margin-top-16"
      titleProps={{ text: "Data Gathering Progress" }}
    >
      <div className="flex-column padding-16" style={{ gap: "12px" }}>
        <div className="flex-row" style={{ alignItems: "center", gap: "8px" }}>
          <Status
            {...getStatusIndicator(status)}
            size={StatusSize.m}
            animated={status === "loading" || status === "polling"}
          />
          <span className="body-m font-weight-semibold">
            {getStatusLabel(status)}
          </span>
        </div>

        {error && (
          <MessageCard
            className="flex-self-stretch"
            severity={MessageCardSeverity.Error}
          >
            {error}
          </MessageCard>
        )}

        {isTimeout && !error && (
          <MessageCard
            className="flex-self-stretch"
            severity={MessageCardSeverity.Warning}
          >
            Data gathering is taking longer than expected. It has been running
            for over 10 minutes.
          </MessageCard>
        )}

        {status === "error" && onRetry && (
          <div>
            <Button text="Retry" iconProps={{ iconName: "Refresh" }} onClick={onRetry} />
          </div>
        )}

        {progress.length > 0 && (
          <div
            style={{
              maxHeight: "300px",
              overflowY: "auto",
              fontFamily: "monospace",
              fontSize: "12px",
              backgroundColor: "var(--palette-neutral-2, #f4f4f4)",
              borderRadius: "4px",
              padding: "8px",
            }}
          >
            {progress.map((msg, i) => {
              const isError = msg.message.startsWith("⚠");
              return (
                <div
                  key={i}
                  className="flex-row"
                  style={{ gap: "8px", padding: "2px 0" }}
                >
                  <span className="secondary-text" style={{ flexShrink: 0 }}>
                    [{formatTimestamp(msg.timestamp)}]
                  </span>
                  <span style={isError ? { color: "var(--status-error-text, #cd2535)", fontWeight: 600 } : undefined}>
                    {msg.message}
                  </span>
                </div>
              );
            })}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </Card>
  );
}
