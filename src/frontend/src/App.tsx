import { Routes, Route, Link, useLocation } from "react-router-dom";
import TestResultsPage from "./pages/TestResultsPage";

function NavBar() {
  const location = useLocation();
  return (
    <div className="flex-row padding-horizontal-16 padding-vertical-8" style={{ gap: "16px", borderBottom: "1px solid var(--palette-neutral-20, #eee)" }}>
      <Link to="/" style={{ fontWeight: location.pathname === "/" || location.pathname.startsWith("/testresults") ? 700 : 400 }}>Test Results</Link>
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
