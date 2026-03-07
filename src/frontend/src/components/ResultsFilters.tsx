import { useCallback, useState } from "react";

export interface TestResultsFilters {
  executionSystem: string | null; // null = all
  requirement: string | null;
  status: string | null;
  scope: string | null;
  nameFilter: string;
}

export interface ResultsFiltersProps {
  onFilterChange: (filters: TestResultsFilters) => void;
}

const INITIAL_FILTERS: TestResultsFilters = {
  executionSystem: null,
  requirement: "Required",
  status: null,
  scope: "Global",
  nameFilter: "",
};

interface ToggleGroupProps {
  label: string;
  options: { key: string | null; text: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
}

function ToggleGroup({ label, options, value, onChange }: ToggleGroupProps) {
  return (
    <div className="flex-row flex-center" style={{ gap: "4px" }}>
      <span
        style={{
          fontWeight: 600,
          fontSize: "12px",
          marginRight: "4px",
          whiteSpace: "nowrap",
        }}
      >
        {label}:
      </span>
      {options.map((opt) => (
        <button
          key={opt.key ?? "__all__"}
          onClick={() => onChange(opt.key)}
          style={{
            padding: "4px 12px",
            borderRadius: "12px",
            border:
              value === opt.key
                ? "1px solid var(--communication-background, #0078d4)"
                : "1px solid var(--palette-neutral-30, #ccc)",
            background:
              value === opt.key
                ? "var(--communication-background, #0078d4)"
                : "transparent",
            color:
              value === opt.key
                ? "#fff"
                : "var(--text-primary-color, inherit)",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: value === opt.key ? 600 : 400,
            lineHeight: "16px",
          }}
        >
          {opt.text}
        </button>
      ))}
    </div>
  );
}

export default function ResultsFilters({
  onFilterChange,
}: ResultsFiltersProps) {
  const [filters, setFilters] = useState<TestResultsFilters>(INITIAL_FILTERS);

  const update = useCallback(
    (patch: Partial<TestResultsFilters>) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch };
        onFilterChange(next);
        return next;
      });
    },
    [onFilterChange]
  );

  return (
    <div
      className="flex-row flex-wrap"
      style={{ gap: "16px", padding: "8px 0" }}
    >
      <ToggleGroup
        label="Execution System"
        options={[
          { key: null, text: "All" },
          { key: "CloudTest", text: "CloudTest" },
          { key: "T3C", text: "T3C" },
        ]}
        value={filters.executionSystem}
        onChange={(v) => update({ executionSystem: v })}
      />
      <ToggleGroup
        label="Requirement"
        options={[
          { key: null, text: "All" },
          { key: "Required", text: "Required" },
          { key: "Optional", text: "Optional" },
        ]}
        value={filters.requirement}
        onChange={(v) => update({ requirement: v })}
      />
      <ToggleGroup
        label="Status"
        options={[
          { key: null, text: "All" },
          { key: "Passed", text: "Passed" },
          { key: "Failed", text: "Failed" },
          { key: "Running", text: "Running" },
        ]}
        value={filters.status}
        onChange={(v) => update({ status: v })}
      />
      <ToggleGroup
        label="Scope"
        options={[
          { key: null, text: "All" },
          { key: "Global", text: "Global" },
          { key: "Local", text: "Local" },
        ]}
        value={filters.scope}
        onChange={(v) => update({ scope: v })}
      />
      <div className="flex-row flex-center" style={{ gap: "4px" }}>
        <span
          style={{
            fontWeight: 600,
            fontSize: "12px",
            marginRight: "4px",
            whiteSpace: "nowrap",
          }}
        >
          Name:
        </span>
        <div style={{ position: "relative", width: "180px" }}>
          <input
            type="text"
            placeholder="Filter by name…"
            value={filters.nameFilter}
            onChange={(e) => update({ nameFilter: e.target.value })}
            style={{
              padding: "4px 10px",
              paddingRight: "24px",
              borderRadius: "12px",
              border: "1px solid var(--palette-neutral-30, #ccc)",
              fontSize: "12px",
              lineHeight: "16px",
              width: "100%",
              outline: "none",
              background: "transparent",
              color: "var(--text-primary-color, inherit)",
              boxSizing: "border-box",
            }}
          />
          {filters.nameFilter && (
            <button
              onClick={() => update({ nameFilter: "" })}
              aria-label="Clear name filter"
              style={{
                position: "absolute",
                right: "6px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "0 2px",
                fontSize: "14px",
                lineHeight: 1,
                color: "var(--text-secondary-color, #999)",
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
