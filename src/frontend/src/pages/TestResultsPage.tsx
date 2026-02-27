import { useCallback, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Header, TitleSize } from "azure-devops-ui/Header";
import { Card } from "azure-devops-ui/Card";
import { ZeroData, ZeroDataActionType } from "azure-devops-ui/ZeroData";
import BuildSelector from "../components/BuildSelector";
import StatusPanel from "../components/StatusPanel";
import SummaryDashboard from "../components/SummaryDashboard";
import GanttChart from "../components/GanttChart";
import TestpassTable from "../components/TestpassTable";
import ResultsFilters from "../components/ResultsFilters";
import type { TestResultsFilters } from "../components/ResultsFilters";
import type { TestpassDto } from "../types/testResults";
import { useTestResults } from "../hooks/useTestResults";
import { useAuthFetch } from "../auth/useAuthFetch";

function matchesStatus(tp: TestpassDto, statusFilter: string): boolean {
  const s = tp.status?.toLowerCase() ?? "";
  const r = tp.result?.toLowerCase() ?? "";
  switch (statusFilter) {
    case "Passed":
      return r === "passed" || r === "succeeded";
    case "Failed":
      return r === "failed" || r === "timedout";
    case "Running":
      return s === "running" || s === "inprogress";
    default:
      return false;
  }
}

// Counter to ensure each click triggers useEffect even for the same testpass
let expandCounter = 0;

export default function TestResultsPage() {
  const { fqbn } = useParams<{ fqbn?: string }>();
  const navigate = useNavigate();
  const authFetch = useAuthFetch();
  const { status, progress, results, error, isTimeout, refresh } = useTestResults(fqbn, authFetch);
  const [filters, setFilters] = useState<TestResultsFilters>({
    executionSystem: null,
    requirement: "Required",
    status: null,
    scope: "Global",
  });
  const [expandTestpass, setExpandTestpass] = useState<string | null>(null);

  const onGanttBarClick = useCallback((name: string) => {
    setExpandTestpass(`${name}\0${++expandCounter}`);
  }, []);

  const filteredTestpasses = useMemo(() => {
    if (!results?.testpasses) return [];
    return results.testpasses.filter((tp) => {
      if (
        filters.executionSystem &&
        tp.executionSystem?.toLowerCase() !==
          filters.executionSystem.toLowerCase()
      )
        return false;
      if (
        filters.requirement &&
        tp.requirement?.toLowerCase() !== filters.requirement.toLowerCase()
      )
        return false;
      if (filters.status && !matchesStatus(tp, filters.status)) return false;
      if (filters.scope && tp.scope?.toLowerCase() !== filters.scope.toLowerCase()) return false;
      return true;
    });
  }, [results?.testpasses, filters]);

  const onFqbnSelected = useCallback(
    (selectedFqbn: string) => {
      navigate(`/testresults/${encodeURIComponent(selectedFqbn)}`);
    },
    [navigate]
  );

  return (
    <div className="flex-grow flex-column">
      <Header
        title="Test Results"
        titleSize={TitleSize.Large}
        commandBarItems={[]}
      />
      <div className="page-content flex-grow flex-column padding-16">
        <BuildSelector initialFqbn={fqbn} onFqbnSelected={onFqbnSelected} />

        {!fqbn && (
          <div className="margin-top-16">
            <ZeroData
              primaryText="No build selected"
              secondaryText="Select a build from the dropdown above to view test results."
              imagePath="/hero-icon.svg"
              imageAltText="No build selected"
              actionType={ZeroDataActionType.ctaButton}
              actionText=""
            />
          </div>
        )}

        {fqbn &&
          (status === "loading" || status === "polling" || status === "error") && (
            <StatusPanel status={status} progress={progress} error={error} isTimeout={isTimeout} onRetry={refresh} />
          )}

        {fqbn && status === "completed" && results && results.testpasses.length === 0 && (
          <div className="margin-top-16">
            <ZeroData
              primaryText="No test passes found"
              secondaryText="This build has no test pass data. Try refreshing or selecting a different build."
              imageAltText="No test passes"
              actionText="Refresh"
              actionType={ZeroDataActionType.ctaButton}
              onActionClick={refresh}
            />
          </div>
        )}

        {fqbn && status === "completed" && results && results.testpasses.length > 0 && (
          <>
            <SummaryDashboard
              buildInfo={results.buildInfo}
              summary={results.summary}
              testpasses={results.testpasses}
              timeRange={results.timeRange}
            />

            <div className="margin-top-16">
              <ResultsFilters onFilterChange={setFilters} />
            </div>

            <div className="margin-top-16">
              <GanttChart
                testpasses={filteredTestpasses}
                timeRange={results.timeRange}
                onBarClick={onGanttBarClick}
                buildStartTime={results.buildInfo.buildStartTime}
              />
            </div>

            <Card className="flex-grow margin-top-16">
              <TestpassTable testpasses={filteredTestpasses} buildRegistrationDate={results.buildInfo.buildStartTime} expandTestpass={expandTestpass} />
            </Card>
          </>
        )}

      </div>
    </div>
  );
}
