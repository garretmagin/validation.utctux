import { useState, useEffect, useMemo, useCallback } from "react";
import { Dropdown } from "azure-devops-ui/Dropdown";
import { DropdownSelection } from "azure-devops-ui/Utilities/DropdownSelection";
import { Spinner, SpinnerSize } from "azure-devops-ui/Spinner";
import {
  MessageCard,
  MessageCardSeverity,
} from "azure-devops-ui/MessageCard";
import type { IListBoxItem } from "azure-devops-ui/ListBox";
import { useAuthFetch } from "../auth/useAuthFetch";

interface BuildInfo {
  fqbn: string;
  branch: string;
  buildId: number;
  buildStartTime: string;
  status: string;
  buildType: string | null;
  relatedBuilds: BuildInfo[];
}

interface BuildSelectorProps {
  initialFqbn?: string;
  onFqbnSelected: (fqbn: string) => void;
}

// Branch is always the second-to-last dot-separated segment in any FQBN format
function parseBranchFromFqbn(fqbn: string): string | null {
  const parts = fqbn.split(".");
  return parts.length >= 4 ? parts[parts.length - 2] : null;
}

/**
 * Strips the branch name from an FQBN for a shorter display.
 * E.g., "26572.1002.ge_current_directes_corebuild.260225-2201"
 *    → "26572.1002.20260225-2201"
 * Keeps the full timestamp with century prefix for readability.
 */
function shortFqbn(fqbn: string): string {
  const parts = fqbn.split(".");
  if (parts.length < 4) return fqbn;
  // parts: [buildNum, qfe, ..., branch, timestamp]
  const buildNum = parts[0];
  const qfe = parts[1];
  const timestamp = parts[parts.length - 1];
  // Add century prefix if timestamp is YYMMDD-HHMM format
  const display = /^\d{6}-\d{4}$/.test(timestamp) ? `20${timestamp}` : timestamp;
  return `${buildNum}.${qfe}.${display}`;
}

/** Badge styles for BXL/TB type labels */
const badgeBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1px 6px",
  borderRadius: "3px",
  fontSize: "0.75em",
  fontWeight: 600,
  marginRight: "8px",
  minWidth: "28px",
  textAlign: "center",
  backgroundColor: "#e0e0e0",
  color: "#555",
  cursor: "default",
};

const chevronBadge: React.CSSProperties = {
  ...badgeBase,
  cursor: "pointer",
  backgroundColor: "#d0d0d0",
};

/**
 * Build type badge that transforms into an expand chevron on hover.
 * Shows "+N" count indicator next to FQBN for expandable items.
 */
function ExpandableBadge({
  buildType,
  childCount,
  isExpanded,
  onToggle,
}: {
  buildType: string | null;
  childCount: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hasChildren = childCount > 0;

  if (!hasChildren) {
    return <span style={badgeBase}>{buildType ?? "?"}</span>;
  }

  return (
    <span
      style={hovered ? chevronBadge : badgeBase}
      title={isExpanded
        ? `Hide ${childCount} previous build attempt${childCount > 1 ? "s" : ""}`
        : `Show ${childCount} previous build attempt${childCount > 1 ? "s" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle();
      }}
    >
      {hovered
        ? (isExpanded ? "▾" : "›")
        : (buildType ?? "?")}
    </span>
  );
}

/** Maps short build type codes to full display names for the pill */
function fullTypeName(type: string): string {
  switch (type) {
    case "BXL": return "BUILDXL";
    case "TB": return "TIMEBUILD";
    default: return type.toUpperCase();
  }
}

function NLabel({ label }: { label: string }) {
  const isLatest = label === "Latest";
  return (
    <span style={{ marginLeft: "auto", paddingLeft: "12px" }}>
      <span
        style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: "10px",
          fontSize: "0.75em",
          fontWeight: 500,
          backgroundColor: isLatest ? "#e8f5e9" : "#f5f5f5",
          color: isLatest ? "#2e7d32" : "#888",
        }}
      >
        {label}
      </span>
    </span>
  );
}

export default function BuildSelector({
  initialFqbn,
  onFqbnSelected,
}: BuildSelectorProps) {
  const [branches, setBranches] = useState<string[]>([]);
  const [builds, setBuilds] = useState<BuildInfo[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingBuilds, setLoadingBuilds] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedChains, setExpandedChains] = useState<Set<string>>(new Set());
  const authFetch = useAuthFetch();

  const branchSelection = useMemo(() => new DropdownSelection(), []);
  const buildSelection = useMemo(() => new DropdownSelection(), []);

  // Fetch branches on mount
  useEffect(() => {
    const fetchBranches = async () => {
      setLoadingBranches(true);
      setError(null);
      try {
        const response = await authFetch("/api/builds/branches");
        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);
        const data: string[] = await response.json();
        setBranches(data.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch branches"
        );
      } finally {
        setLoadingBranches(false);
      }
    };
    fetchBranches();
  }, [authFetch]);

  // Auto-select branch from initialFqbn when branches are loaded
  useEffect(() => {
    if (!initialFqbn || branches.length === 0) return;
    const branch = parseBranchFromFqbn(initialFqbn);
    if (!branch) return;
    const index = branches.indexOf(branch);
    if (index >= 0 && selectedBranch !== branch) {
      branchSelection.select(index);
      setSelectedBranch(branch);
    }
  }, [initialFqbn, branches, branchSelection, selectedBranch]);

  // Fetch builds when branch changes
  useEffect(() => {
    if (!selectedBranch) {
      setBuilds([]);
      return;
    }
    const fetchBuilds = async () => {
      setLoadingBuilds(true);
      setError(null);
      setExpandedChains(new Set());
      try {
        const response = await authFetch(
          `/api/builds/branch/${encodeURIComponent(selectedBranch)}?count=20`
        );
        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);
        const data: BuildInfo[] = await response.json();
        setBuilds(data);

        // If initialFqbn matches a child, auto-expand that chain
        if (initialFqbn) {
          for (const b of data) {
            if (b.relatedBuilds?.some(r => r.fqbn === initialFqbn)) {
              setExpandedChains(new Set([b.fqbn]));
              break;
            }
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch builds"
        );
      } finally {
        setLoadingBuilds(false);
      }
    };
    fetchBuilds();
  }, [selectedBranch, initialFqbn, authFetch]);

  // Build the flattened item list with custom rendering
  const buildItems: IListBoxItem[] = useMemo(() => {
    const items: IListBoxItem[] = [];
    let nIndex = 0;

    for (const build of builds) {
      const nLabel = nIndex === 0 ? "Latest" : `N-${nIndex}`;
      const hasChildren = build.relatedBuilds && build.relatedBuilds.length > 0;
      const isExpanded = expandedChains.has(build.fqbn);
      const displayName = shortFqbn(build.fqbn);

      items.push({
        id: build.fqbn,
        text: displayName,
        render: (_rowIndex, _colIndex, _tableColumn, _tableItem) => (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              padding: "6px 8px",
              cursor: "pointer",
            }}
          >
            <ExpandableBadge
              buildType={build.buildType}
              childCount={hasChildren ? build.relatedBuilds.length : 0}
              isExpanded={isExpanded}
              onToggle={() => {
                setExpandedChains(prev => {
                  const next = new Set(prev);
                  if (next.has(build.fqbn)) next.delete(build.fqbn);
                  else next.add(build.fqbn);
                  return next;
                });
              }}
            />
            <span style={{ flex: 1 }}>
              {displayName}
              {hasChildren && !isExpanded && (
                <span style={{ marginLeft: "6px", fontSize: "0.8em", color: "#888" }}>
                  +{build.relatedBuilds.length}
                </span>
              )}
            </span>
            <NLabel label={nLabel} />
          </div>
        ),
      });

      // Insert expanded children
      if (hasChildren && isExpanded) {
        for (const child of build.relatedBuilds) {
          const childDisplay = shortFqbn(child.fqbn);
          items.push({
            id: child.fqbn,
            text: childDisplay,
            render: (_rowIndex, _colIndex, _tableColumn, _tableItem) => (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  padding: "6px 8px",
                  paddingLeft: "36px",
                }}
              >
                <span style={badgeBase}>{child.buildType ?? "?"}</span>
                <span>{childDisplay}</span>
              </div>
            ),
          });
        }
      }

      nIndex++;
    }

    return items;
  }, [builds, expandedChains]);

  // Pre-select matching build after items are created
  useEffect(() => {
    if (!initialFqbn || buildItems.length === 0) return;
    const matchIndex = buildItems.findIndex((item) => item.id === initialFqbn);
    if (matchIndex >= 0) {
      buildSelection.select(matchIndex);
    }
  }, [initialFqbn, buildItems, buildSelection]);

  const branchItems: IListBoxItem[] = useMemo(
    () => branches.map((b) => ({ id: b, text: b })),
    [branches]
  );

  const onBranchSelect = useCallback(
    (_event: React.SyntheticEvent<HTMLElement>, item: IListBoxItem) => {
      setSelectedBranch(item.id);
      setBuilds([]);
    },
    []
  );

  const onBuildSelect = useCallback(
    (_event: React.SyntheticEvent<HTMLElement>, item: IListBoxItem) => {
      onFqbnSelected(item.id);
    },
    [onFqbnSelected]
  );

  // Find the currently selected build for type pill display
  const selectedBuild = useMemo(() => {
    if (!initialFqbn) return null;
    for (const b of builds) {
      if (b.fqbn === initialFqbn) return b;
      const child = b.relatedBuilds?.find(r => r.fqbn === initialFqbn);
      if (child) return child;
    }
    return null;
  }, [builds, initialFqbn]);

  return (
    <div className="flex-column">
      {error && (
        <MessageCard
          className="margin-bottom-8"
          severity={MessageCardSeverity.Error}
          onDismiss={() => setError(null)}
        >
          {error}
        </MessageCard>
      )}
      <div className="flex-row flex-center" style={{ gap: "8px", flexWrap: "nowrap" }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#666", flexShrink: 0 }} title="Branch"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/></svg>
        <div style={{ minWidth: "400px", flex: "0 0 auto" }}>
          <Dropdown
            ariaLabel="Select branch"
            placeholder="Select a branch"
            items={branchItems}
            selection={branchSelection}
            onSelect={onBranchSelect}
            disabled={loadingBranches}
            showChecksColumn={false}
            className="flex-grow"
          />
        </div>
        {loadingBranches && <Spinner size={SpinnerSize.small} />}

        <span style={{ color: "#ccc", fontSize: "1.2em", padding: "0 4px" }}>/</span>

        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#666", flexShrink: 0 }} title="Build"><path d="M14 3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1"/><path d="M19 3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1"/><path d="m7 15 3 3"/><path d="m7 21 3-3H5a2 2 0 0 1-2-2v-2"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="3" width="7" height="7" rx="1"/></svg>
        <div style={{ minWidth: "400px", flex: "0 0 auto" }}>
          <Dropdown
            ariaLabel="Select build"
            placeholder={selectedBranch ? "Select a build" : "Select a branch first"}
            items={buildItems}
            selection={buildSelection}
            onSelect={onBuildSelect}
            disabled={!selectedBranch || loadingBuilds}
            showChecksColumn={false}
            className="flex-grow"
          />
        </div>
        {loadingBuilds && <Spinner size={SpinnerSize.small} />}

        {selectedBuild?.buildType && (
          <span
            style={{
              display: "inline-block",
              padding: "2px 10px",
              borderRadius: "12px",
              border: "1px solid #bbb",
              fontSize: "0.75em",
              fontWeight: 600,
              color: "#555",
              letterSpacing: "0.5px",
              whiteSpace: "nowrap",
            }}
          >
            {fullTypeName(selectedBuild.buildType)}
          </span>
        )}
      </div>
    </div>
  );
}
