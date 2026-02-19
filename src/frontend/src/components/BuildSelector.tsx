import { useState, useEffect, useMemo, useCallback } from "react";
import { Dropdown } from "azure-devops-ui/Dropdown";
import { DropdownSelection } from "azure-devops-ui/Utilities/DropdownSelection";
import { Spinner, SpinnerSize } from "azure-devops-ui/Spinner";
import {
  MessageCard,
  MessageCardSeverity,
} from "azure-devops-ui/MessageCard";
import type { IListBoxItem } from "azure-devops-ui/ListBox";

interface BuildInfo {
  fqbn: string;
  branch: string;
  buildId: number;
  registrationDate: string;
  status: string;
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

  const branchSelection = useMemo(() => new DropdownSelection(), []);
  const buildSelection = useMemo(() => new DropdownSelection(), []);

  // Fetch branches on mount
  useEffect(() => {
    const fetchBranches = async () => {
      setLoadingBranches(true);
      setError(null);
      try {
        const response = await fetch("/api/builds/branches");
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
  }, []);

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
      try {
        const response = await fetch(
          `/api/builds/branch/${encodeURIComponent(selectedBranch)}?count=20`
        );
        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);
        const data: BuildInfo[] = await response.json();
        setBuilds(data);

        // If initialFqbn is provided, pre-select the matching build
        if (initialFqbn) {
          const matchIndex = data.findIndex((b) => b.fqbn === initialFqbn);
          if (matchIndex >= 0) {
            buildSelection.select(matchIndex);
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
  }, [selectedBranch, initialFqbn, buildSelection]);

  const branchItems: IListBoxItem[] = useMemo(
    () => branches.map((b) => ({ id: b, text: b })),
    [branches]
  );

  const buildItems: IListBoxItem[] = useMemo(
    () =>
      builds.map((b) => ({
        id: b.fqbn,
        text: b.fqbn,
      })),
    [builds]
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
      <div className="flex-row" style={{ gap: "16px", alignItems: "flex-end" }}>
        <div className="flex-column">
          <label className="body-m secondary-text margin-bottom-4">Branch</label>
          <div className="flex-row flex-center" style={{ gap: "8px", minWidth: "450px" }}>
            <Dropdown
              ariaLabel="Select branch"
              placeholder="Select a branch"
              items={branchItems}
              selection={branchSelection}
              onSelect={onBranchSelect}
              disabled={loadingBranches}
              className="flex-grow"
            />
            {loadingBranches && <Spinner size={SpinnerSize.small} />}
          </div>
        </div>
        <div className="flex-column">
          <label className="body-m secondary-text margin-bottom-4">Build</label>
          <div className="flex-row flex-center" style={{ gap: "8px", minWidth: "600px" }}>
            <Dropdown
              ariaLabel="Select build"
              placeholder={
                selectedBranch ? "Select a build" : "Select a branch first"
              }
              items={buildItems}
              selection={buildSelection}
              onSelect={onBuildSelect}
              disabled={!selectedBranch || loadingBuilds}
              className="flex-grow"
            />
            {loadingBuilds && <Spinner size={SpinnerSize.small} />}
          </div>
        </div>
      </div>
    </div>
  );
}
