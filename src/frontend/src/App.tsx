import { Routes, Route, Link, useLocation } from "react-router-dom";
import TestResultsPage from "./pages/TestResultsPage";
import "./App.css";

function NavBar() {
  const location = useLocation();
  return (
    <div className="flex-row padding-horizontal-16 padding-vertical-8" style={{ gap: "16px", borderBottom: "1px solid var(--palette-neutral-20, #eee)", alignItems: "center", justifyContent: "space-between" }}>
      <Link to="/" style={{ fontWeight: location.pathname === "/" || location.pathname.startsWith("/testresults") ? 700 : 400 }}>Test Results</Link>
      <span className="experiment-badge">
        Experiment
        <div className="experiment-tooltip">
          <div className="experiment-tooltip-content">
            This is an experimental page used to explore test-related data. If you find aspects of this site useful and want them integrated into Branch Health or other test-related experiences, please reach out to the team.
            <div style={{ marginTop: 10 }}>
              <a href="mailto:utctdev@microsoft.com?subject=ux.utct.dev%20feedback%2Fquestions" style={{ color: "#0078d4", fontWeight: 600 }}>
                📧 Send Feedback
              </a>
            </div>
          </div>
        </div>
      </span>
    </div>
  );
}

function App() {
  return (
    <div className="flex-grow flex-column">
      <NavBar />
      <Routes>
        <Route path="/" element={<TestResultsPage />} />
        <Route path="/testresults/:fqbn?" element={<TestResultsPage />} />
      </Routes>
    </div>
  );
}

export default App;
