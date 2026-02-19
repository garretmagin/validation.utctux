import { useState, useMemo, useCallback } from "react";
import {
  Table,
  SimpleTableCell,
} from "azure-devops-ui/Table";
import type { ITableColumn } from "azure-devops-ui/Table";
import { ObservableValue } from "azure-devops-ui/Core/Observable";
import { ArrayItemProvider } from "azure-devops-ui/Utilities/Provider";
import { Status, Statuses, StatusSize } from "azure-devops-ui/Status";
import { Icon } from "azure-devops-ui/Icon";
import type { TestpassDto } from "../types/testResults";

export interface TestpassTableProps {
  testpasses: TestpassDto[];
}

interface FlattenedRow {
  item: TestpassDto;
  depth: number;
  parentName: string | null;
  hasChildren: boolean;
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

const COL_WIDTH_STATUS = new ObservableValue(-10);
const COL_WIDTH_NAME = new ObservableValue(-25);
const COL_WIDTH_REQUIREMENT = new ObservableValue(-10);
const COL_WIDTH_EXEC_SYSTEM = new ObservableValue(-12);
const COL_WIDTH_START = new ObservableValue(-14);
const COL_WIDTH_END = new ObservableValue(-14);
const COL_WIDTH_DURATION = new ObservableValue(-12);

export default function TestpassTable({ testpasses }: TestpassTableProps) {
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

  // Sort by startTime, then flatten with expand state
  const flatRows = useMemo(() => {
    const sorted = [...testpasses].sort((a, b) => {
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

    const rows: FlattenedRow[] = [];
    for (const tp of sorted) {
      const hasChildren = tp.runs && tp.runs.length > 0;
      rows.push({ item: tp, depth: 0, parentName: null, hasChildren });
      if (hasChildren && expandedRows.has(tp.name)) {
        for (const run of tp.runs) {
          rows.push({
            item: run,
            depth: 1,
            parentName: tp.name,
            hasChildren: false,
          });
        }
      }
    }
    return rows;
  }, [testpasses, expandedRows]);

  const columns: ITableColumn<FlattenedRow>[] = useMemo(
    () => [
      {
        id: "status",
        name: "Status",
        width: COL_WIDTH_STATUS,
        renderCell: (
          _rowIndex: number,
          columnIndex: number,
          tableColumn: ITableColumn<FlattenedRow>,
          row: FlattenedRow
        ) => (
          <SimpleTableCell
            columnIndex={columnIndex}
            tableColumn={tableColumn}
            key={columnIndex}
          >
            <Status
              {...getStatusProps(row.item.result)}
              size={StatusSize.m}
            />
            <span
              className="margin-left-8"
              style={{
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: "10px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#fff",
                backgroundColor:
                  STATUS_COLORS[row.item.result] ?? DEFAULT_STATUS_COLOR,
              }}
            >
              {row.item.result || "Unknown"}
            </span>
          </SimpleTableCell>
        ),
      },
      {
        id: "name",
        name: "Name",
        width: COL_WIDTH_NAME,
        renderCell: (
          _rowIndex: number,
          columnIndex: number,
          tableColumn: ITableColumn<FlattenedRow>,
          row: FlattenedRow
        ) => (
          <SimpleTableCell
            columnIndex={columnIndex}
            tableColumn={tableColumn}
            key={columnIndex}
          >
            <div className="flex-row flex-center">
              {row.depth === 0 && row.hasChildren && (
                <Icon
                  iconName={
                    expandedRows.has(row.item.name)
                      ? "ChevronDown"
                      : "ChevronRight"
                  }
                  className="cursor-pointer margin-right-8"
                  onClick={() => toggleExpand(row.item.name)}
                  ariaLabel={
                    expandedRows.has(row.item.name)
                      ? "Collapse reruns"
                      : "Expand reruns"
                  }
                  ariaHidden={false}
                />
              )}
              {row.depth === 1 && (
                <span
                  className="margin-left-16 margin-right-8"
                  style={{ color: "var(--palette-neutral-40)" }}
                >
                  ↳
                </span>
              )}
              {row.item.detailsUrl ? (
                <a
                  href={row.item.detailsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bolt-link"
                >
                  {row.item.name}
                  {row.depth === 1 && row.item.isRerun && " (rerun)"}
                </a>
              ) : (
                <span>
                  {row.item.name}
                  {row.depth === 1 && row.item.isRerun && " (rerun)"}
                </span>
              )}
            </div>
          </SimpleTableCell>
        ),
      },
      {
        id: "requirement",
        name: "Requirement",
        width: COL_WIDTH_REQUIREMENT,
        renderCell: (
          _rowIndex: number,
          columnIndex: number,
          tableColumn: ITableColumn<FlattenedRow>,
          row: FlattenedRow
        ) => (
          <SimpleTableCell
            columnIndex={columnIndex}
            tableColumn={tableColumn}
            key={columnIndex}
          >
            <span>{row.item.requirement || "—"}</span>
          </SimpleTableCell>
        ),
      },
      {
        id: "executionSystem",
        name: "Execution System",
        width: COL_WIDTH_EXEC_SYSTEM,
        renderCell: (
          _rowIndex: number,
          columnIndex: number,
          tableColumn: ITableColumn<FlattenedRow>,
          row: FlattenedRow
        ) => (
          <SimpleTableCell
            columnIndex={columnIndex}
            tableColumn={tableColumn}
            key={columnIndex}
          >
            {row.item.executionSystem ? (
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  fontSize: "12px",
                  border: "1px solid var(--palette-neutral-30, #ccc)",
                }}
              >
                {row.item.executionSystem}
              </span>
            ) : (
              <span>—</span>
            )}
          </SimpleTableCell>
        ),
      },
      {
        id: "startTime",
        name: "Start Time",
        width: COL_WIDTH_START,
        renderCell: (
          _rowIndex: number,
          columnIndex: number,
          tableColumn: ITableColumn<FlattenedRow>,
          row: FlattenedRow
        ) => (
          <SimpleTableCell
            columnIndex={columnIndex}
            tableColumn={tableColumn}
            key={columnIndex}
          >
            <span>{formatDateTime(row.item.startTime)}</span>
          </SimpleTableCell>
        ),
      },
      {
        id: "endTime",
        name: "End Time",
        width: COL_WIDTH_END,
        renderCell: (
          _rowIndex: number,
          columnIndex: number,
          tableColumn: ITableColumn<FlattenedRow>,
          row: FlattenedRow
        ) => (
          <SimpleTableCell
            columnIndex={columnIndex}
            tableColumn={tableColumn}
            key={columnIndex}
          >
            <span>{formatDateTime(row.item.endTime)}</span>
          </SimpleTableCell>
        ),
      },
      {
        id: "duration",
        name: "Duration",
        width: COL_WIDTH_DURATION,
        renderCell: (
          _rowIndex: number,
          columnIndex: number,
          tableColumn: ITableColumn<FlattenedRow>,
          row: FlattenedRow
        ) => (
          <SimpleTableCell
            columnIndex={columnIndex}
            tableColumn={tableColumn}
            key={columnIndex}
          >
            <span>{row.item.duration ?? "—"}</span>
          </SimpleTableCell>
        ),
      },
    ],
    [expandedRows, toggleExpand]
  );

  const itemProvider = useMemo(
    () => new ArrayItemProvider<FlattenedRow>(flatRows),
    [flatRows]
  );

  return (
    <Table<FlattenedRow>
      columns={columns}
      itemProvider={itemProvider}
      role="table"
    />
  );
}
