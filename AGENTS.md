# AGENTS.md — AI Coding Agent Instructions

## Architecture

.NET Aspire app with three layers: **AppHost** (orchestrator), **Server** (.NET 10 ASP.NET Core API), and **Frontend** (React 18 + TypeScript + Vite). The server aggregates test result data from four upstream services (UTCT, CloudTest, Nova, Discover) into a unified view of Windows build testpass results.

### Data Flow

External APIs → `AuthService` (MSAL tokens) → parallel loaders in `TestDataService` → `AggregatedTestpassResult` → `BackgroundJobManager` (async jobs + caching) → REST API → React frontend polls via `useTestResults` hook.

### Key Concepts

- **FQBN** = Fully Qualified Build Name (e.g., `19583.1000.main.200309-1320`), parsed by `WindowsBuildVersion` (4/5/6-part formats)
- **Testpass** = A scheduled test job (not individual test cases)
- **Chunk** = Build artifact/component dependency tracked for availability timing
- **Rerun** = Re-executed testpass; detected via UTCT `IsRerun` flag or inferred from >10min delay after last dependency

## Server (`src/utctux.Server/`)

All services registered as **singletons** in `Program.cs`. API routes defined inline via minimal API (`app.MapGroup("/api")`).

### API Endpoints

| Method | Route | Behavior |
|--------|-------|----------|
| GET | `/api/builds/branches` | List branch names |
| GET | `/api/builds/branch/{branch}?count=N` | Recent builds (count clamped 1–100) |
| POST | `/api/testresults/{fqbn}?refresh=true` | Start async data-gathering job → 202/409 |
| GET | `/api/testresults/{fqbn}/status` | Poll job progress |
| GET | `/api/testresults/{fqbn}` | Fetch cached results → 200/404 |

### Service Responsibilities

| Service | Role |
|---------|------|
| `AuthService` | MSAL token provider; interactive browser auth (dev) with disk-cached `AuthenticationRecord` at `%APPDATA%/utctux-auth-record.json` |
| `TestDataService` | Orchestrates parallel `Task.WhenAll()` loads from UTCT, CloudTest, Nova |
| `CloudTestClient` / `NovaClient` | Refit-generated HTTP clients with `MsalHttpClientHandler` for auth |
| `BuildListingService` | Build/branch enumeration via Discover SDK |
| `BackgroundJobManager` | Fire-and-forget `Task.Run()` jobs with lock-based state, `IProgress<string>` updates |
| `TestResultsCache` | `IMemoryCache` wrapper with 1-hour TTL |

### Patterns

- **DTOs use C# records** (immutable, value semantics) with file-scoped namespaces
- **Nullable reference types enabled** — respect nullability throughout
- **Refit interfaces** (`ICloudTestRestApi`, `INovaRestApi`) for external HTTP APIs
- **Error handling**: try-catch in loaders → log warning → return empty collections; prefix error progress messages with `⚠`
- **No explicit `ConfigureAwait(false)`** — follows ASP.NET Core conventions
- **Resilience**: `AddStandardResilienceHandler()` on all HTTP clients

## Frontend (`src/frontend/`)

React 18 + TypeScript 5.9 + Vite 7.2. UI components from `azure-devops-ui`. No state management library — uses a custom hook + component-local state.

### Component Hierarchy

```
App.tsx → TestResultsPage
  ├─ BuildSelector      (cascading branch → build dropdowns)
  ├─ StatusPanel         (progress log, auto-scroll, retry)
  ├─ SummaryDashboard    (stat cards, breakdowns by requirement/exec system)
  ├─ ResultsFilters      (toggle groups: exec system, requirement, status, scope)
  ├─ GanttChart          (full timeline, color-coded bars, tooltips, click-to-scroll)
  └─ TestpassTable       (sortable, expandable rows)
      └─ TestpassDetailPanel (dependencies + MiniGanttChart + reruns)
```

### Async Workflow (`useTestResults` hook)

1. POST triggers job → 2. Poll `/status` every 3s → 3. Fetch results on completion. States: `idle | loading | polling | completed | error`. 10-minute timeout warning.

### Vite Proxy

`/api` requests proxy to `SERVER_HTTPS` or `SERVER_HTTP` env vars (set by Aspire service discovery).

## Build & Run

```bash
# Build everything (via Aspire AppHost)
dotnet build src/utctux.AppHost/utctux.AppHost.csproj

# Run with hot-reload
dotnet watch run --project src/utctux.AppHost/utctux.AppHost.csproj

# Frontend only
cd src/frontend && npm run dev
```

VS Code tasks `build`, `publish`, `watch` are preconfigured in `.vscode/tasks.json`.

NuGet feeds: nuget.org + Microsoft `validation.ctproto` (see `nuget.config`).

## External Dependencies

| Service | Auth Scope | Client |
|---------|-----------|--------|
| UTCT | ADO scope (`499b84ac...`) | `UtctClient` SDK |
| CloudTest | `77c466d9.../.default` | Refit |
| Nova | `mspmecloud.onmicrosoft.com/Es-novaapi/.default` | Refit |
| Discover | ADO scope | `DiscoverClient` SDK |
