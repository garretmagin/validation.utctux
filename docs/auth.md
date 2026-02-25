# Authentication & Authorization in utctux

This document describes how authentication (authn) and authorization (authz) work in utctux, covering the Entra ID app registrations, the server-side MISE/AuthES token validation pipeline, and the frontend MSAL.js integration.

## Architecture Overview

utctux uses a two-layer auth model:

1. **Inbound auth** — Validates that callers of the utctux REST API have a valid Entra ID token (described in this document)
2. **Outbound auth** — The server acquires its own tokens to call downstream services (CloudTest, Nova, UTCT, Discover) via the existing `AuthService` class

```
┌────────────────────────────────────────────────────────────────────┐
│                         Entra ID (Microsoft tenant)                │
│                  72f988bf-86f1-41af-91ab-2d7cd011db47              │
│                                                                    │
│   ┌──────────────┐         ┌──────────────┐                        │
│   │  utctux-spa  │         │  utctux-api  │                        │
│   │  (SPA app)   │         │  (API app)   │                        │
│   │              │ preauth │              │                        │
│   │  a557232a... │────────>│  a7cb231c... │                        │
│   └──────┬───────┘         └──────┬───────┘                        │
└──────────┼────────────────────────┼────────────────────────────────┘
           │                        │
           │ MSAL.js                │ MISE validates
           │ acquires token         │ Bearer tokens
           │                        │
    ┌──────▼───────┐         ┌──────▼────────────────┐
    │  React SPA   │         │  utctux.Server        │
    │  (frontend)  │─Bearer─>│  AuthESMiseMiddleware │
    │              │  token  │         │             │
    │  Port 5173   │         │  ┌──────▼──────────┐  │
    └──────────────┘         │  │  /api endpoints │  │
                             │  └─────────────────┘  │
                             │  Port 7394/5316       │
                             └───────────────────────┘
```

## Entra ID App Registrations

Two app registrations exist in the Microsoft tenant:

### utctux-api (Server)

| Property | Value |
|----------|-------|
| Display Name | `utctux-api` |
| Application (client) ID | `a7cb231c-7e92-4e78-8800-5241154741f2` |
| Object ID | `e9faa7fb-9e73-45d2-8b9a-d9ccac3c6a40` |
| Identifier URI | `api://utctux` |
| Sign-in audience | AzureADMyOrg (single tenant) |
| Service Tree ID | `ab5cbc9d-4eab-4d32-be1e-341745bc166b` |

**Exposed scope:**

| Scope | ID | Type | Description |
|-------|----|------|-------------|
| `access_as_user` | `2c1a4e8f-ecaf-4911-8585-c663a70196bf` | Delegated (User) | Access utctux API as the signed-in user |

**Pre-authorized applications:**

The SPA app (`a557232a...`) is pre-authorized for the `access_as_user` scope, which means users are not prompted for admin consent when signing in.

### utctux-spa (Frontend)

| Property | Value |
|----------|-------|
| Display Name | `utctux-spa` |
| Application (client) ID | `a557232a-261f-4ede-a01a-7b2b18b3c534` |
| Object ID | `577f140f-77db-4f6c-88a8-28f6d0bc7cc9` |
| Platform | Single-page application (PKCE, no client secret) |
| Sign-in audience | AzureADMyOrg (single tenant) |

**SPA Redirect URIs:**
- `http://localhost:5173` (Vite dev server)
- `https://localhost:7394` (ASP.NET Core HTTPS)
- `https://server.whitedune-20b41d8c.westus2.azurecontainerapps.io` (Azure Container Apps)

**API Permissions:**
- `utctux-api` → `access_as_user` (Delegated)

> **Adding production redirect URIs:** When deploying, add the production URL to the SPA redirect URIs via:
> ```bash
> az rest --method PATCH \
>   --uri "https://graph.microsoft.com/v1.0/applications/577f140f-77db-4f6c-88a8-28f6d0bc7cc9" \
>   --body '{"spa":{"redirectUris":["http://localhost:5173","https://localhost:7394","https://your-production-url"]}}' \
>   --headers "Content-Type=application/json"
> ```

## Server-Side Authentication

### Technology Stack

- **AuthES** (`Microsoft.EngSys.AuthES`, `Microsoft.EngSys.AuthES.Authorization`) — EngSys authentication/authorization library
- **MISE** (Microsoft Identity Service Essentials) — Token validation engine used internally by AuthES
- **ASP.NET Core middleware** — Custom `AuthESMiseMiddleware` ported from the Azure Functions `AuthESMiseAzFMiddleware`

### Why a Custom Port?

The canonical `AddAuthESAuthentication` and `AddAuthESAuthorization` extension methods live in the `Microsoft.EngSys.AzureFunctions` NuGet package, which:
- Targets net8.0 only (utctux targets net10.0)
- Depends on `Microsoft.Azure.Functions.Worker` (not applicable to ASP.NET Core)
- The middleware (`AuthESMiseAzFMiddleware`) implements `IFunctionsWorkerMiddleware`, not ASP.NET Core's `IMiddleware`

The equivalent logic is inlined in `src/utctux.Server/Auth/` using the underlying base packages which are compatible with net10.0.

### Service Registration

In `Program.cs`:

```csharp
// Register AuthES identity and resource management
builder.Services.AddAuthESAuthentication(builder.Configuration);

// Register AuthorizationHelper, AuthPolicy, and MISE engine
builder.Services.AddAuthESAuthorization();

// Register the ASP.NET Core middleware as a singleton
builder.Services.AddSingleton<AuthESMiseMiddleware>();

// Enable ASP.NET Core authorization
builder.Services.AddAuthorization();
```

#### `AddAuthESAuthentication(IConfiguration)`

Defined in `Auth/AuthESExtensions.cs`. Registers two singletons:
- **`Identities`** — Manages Azure identity configurations loaded from the `Identities` config section
- **`ExternalResources`** — Manages external resource (API) configurations with identity-authenticated HTTP clients

#### `AddAuthESAuthorization()`

Defined in `Auth/AuthESExtensions.cs`. Performs three steps:
1. Creates an `AuthorizationHelper` from the `Authorization` config section (loads audience mappings, roles, security groups)
2. Registers `AuthorizationHelper` and `AuthPolicy` as singletons
3. Generates a MISE configuration from the `AuthPolicy` and registers MISE via `AddMiseStandard()`

### Middleware Pipeline

```csharp
app.UseExceptionHandler();
app.UseMiddleware<AuthESMiseMiddleware>();  // Token validation
app.UseAuthorization();                     // ASP.NET Core authorization
```

### AuthESMiseMiddleware

Defined in `Auth/AuthESMiseMiddleware.cs`. Implements `IMiddleware` and performs:

1. **Path check** — Skips validation for non-`/api` routes (health checks at `/health`, `/alive`, static files, OpenAPI). Only `/api/*` requests are authenticated.

2. **Token extraction** — Reads the `Authorization: Bearer <token>` header. Returns `401 Unauthorized` if no header is present.

3. **MISE validation** — Passes request headers to `IMiseHandler.ValidateRequest()` which validates the JWT token against the configured inbound policies (audience, issuer, tenant, signing keys, lifetime).

4. **Token processing** — Calls `AuthorizationHelper.ProcessValidatedTokenAsync()` to extract claims, determine roles and security group memberships, and create an `AuthorizationData` object.

5. **Context population** — Stores `AuthorizationData` in `HttpContext.Items` for downstream endpoint handlers and sets `HttpContext.User` to the validated `ClaimsPrincipal`.

6. **Error handling** — Returns `401 Unauthorized` for missing/invalid tokens and `400 Bad Request` for tokens that validate but can't be processed. `SecurityTokenException` is caught and mapped to `401`.

### Endpoint Protection

All `/api` endpoints require both authentication and the `Users` role (via the `"UsersOnly"` policy on the API group). Users must be explicitly assigned this role to access any API functionality.

```csharp
var api = app.MapGroup("/api").RequireAuthorization("UsersOnly");

api.MapGet("me", ...);                    // Authorization check (used by frontend gate)
api.MapGet("builds/branches", ...);
api.MapGet("builds/branch/{branch}", ...);
api.MapGet("testresults/{fqbn}/status", ...);
api.MapGet("testresults/{*fqbn}", ...);
api.MapPost("testresults/{*fqbn}", ...);
```

The `"UsersOnly"` policy requires the `Users` role, which maps to app role `MSFT/Role:Users` in the Entra ID app registration. Users without this role see an Access Denied page with a link to request the [TM-TestScheduling entitlement](https://coreidentity.microsoft.com/manage/Entitlement/entitlement/tmtestschedu-0wu3).

> **Security note:** The middleware only accepts Bearer tokens via the `Authorization` header. Cookie-based authentication is intentionally not supported to prevent CSRF attacks.

### Access Control via TM-TestScheduling Entitlement

Access to utctux is gated by the **TM-TestScheduling** CoreIdentity entitlement. Users join the entitlement at [https://coreidentity.microsoft.com/manage/Entitlement/entitlement/tmtestschedu-0wu3](https://coreidentity.microsoft.com/manage/Entitlement/entitlement/tmtestschedu-0wu3), which adds them to one of two CCG (CoreIdentity Compliance Groups) security groups in the Microsoft tenant.

#### How it works

1. User joins the TM-TestScheduling entitlement via CoreIdentity
2. CoreIdentity adds the user to one of the two CCG security groups
3. Both groups are assigned the `Users` app role on the `utctux-api` service principal
4. When the user authenticates and requests a token for `api://utctux`, Entra ID includes `"Users"` in the token's `roles` claim
5. The AuthES middleware validates the token and the `"UsersOnly"` authorization policy checks for the `Users` role
6. If the role is missing, the frontend shows an Access Denied page with a link to request the entitlement

#### App Role Definition

The `Users` app role is defined on the `utctux-api` app registration:

| Property | Value |
|----------|-------|
| Display Name | `Users` |
| Value | `Users` |
| Role ID | `170952b3-b0e8-4b6f-8eb5-915b63fd9b30` |
| Allowed Member Types | User |

#### Assigned Security Groups

| Group Alias | Object ID | Source |
|-------------|-----------|--------|
| `CCG-tmtestschedu-0wu3-User-zq4j-1` | `0ef390f8-afc0-475f-b28b-ed6ba278f8a6` | TM-TestScheduling entitlement |
| `CCG-tmtestschedu-0wu3-User-irb1-1` | `9e1a3740-dddf-4635-a387-e8a41543ed98` | TM-TestScheduling entitlement |

> **Why two groups?** CoreIdentity entitlements split membership across multiple CCG groups to handle membership limits. Both groups must be assigned the app role so that all entitlement members get access regardless of which group they land in.

#### Managing role assignments

To view current assignments:
```bash
az rest --method GET \
  --uri "https://graph.microsoft.com/v1.0/servicePrincipals/ec654f8c-71f6-4b22-b87e-960494cabc82/appRoleAssignedTo" \
  --query "value[].{principal:principalDisplayName,type:principalType,role:appRoleId}" \
  -o table
```

To assign the role to a new group:
```bash
az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/servicePrincipals/ec654f8c-71f6-4b22-b87e-960494cabc82/appRoleAssignedTo" \
  --headers "Content-Type=application/json" \
  --body "{
    \"principalId\": \"<group-object-id>\",
    \"resourceId\": \"ec654f8c-71f6-4b22-b87e-960494cabc82\",
    \"appRoleId\": \"170952b3-b0e8-4b6f-8eb5-915b63fd9b30\"
  }"
```

> **Note:** This follows the same pattern as UTCT3's bicep deployment (`AADResources.bicep`), where the `User` app role is assigned to the TM-TestScheduling CCG groups via `Microsoft.Graph/appRoleAssignedTo@beta` resources.

### Configuration

`appsettings.json`:

```json
{
  "Authorization": {
    "Audiences": {
      "MSFT": "ResourceId=MSFT/a7cb231c-7e92-4e78-8800-5241154741f2; Audience=api://utctux"
    },
    "Roles": {
      "Users": "MSFT/Role:Users"
    },
    "SecurityGroups": {}
  }
}
```

| Field | Purpose |
|-------|---------|
| `Audiences.MSFT` | Maps the Microsoft tenant to the API app's resource ID and audience URI. MISE uses this to validate tokens. |
| `Roles.Users` | Defines a "Users" role mapped to `MSFT/Role:Users`. At least one role or security group must be defined for AuthES policy loading. |
| `SecurityGroups` | Empty — no security group requirements currently enforced. |

### NuGet Feed

The AuthES packages come from an internal Azure Artifacts feed added to `nuget.config`:

```
https://microsoft.pkgs.visualstudio.com/EngSys/_packaging/common.services/nuget/v3/index.json
```

## Frontend Authentication

### Technology Stack

- **`@azure/msal-browser`** — MSAL.js v2 for browser-based OAuth 2.0 / OIDC with PKCE
- **`@azure/msal-react`** — React bindings for MSAL.js (hooks and context providers)

### Component Architecture

```
main.tsx
└── AuthProvider            (src/auth/AuthProvider.tsx)
    ├── MsalProvider        (@azure/msal-react)
    │   └── AuthGate        (auto-redirects unauthenticated users)
    │       └── BrowserRouter
    │           └── App
    │               ├── BuildSelector    (uses useAuthFetch)
    │               └── TestResultsPage  (uses useAuthFetch → useTestResults)
```

### Initialization Flow

The `AuthProvider` component (`src/auth/AuthProvider.tsx`) handles MSAL initialization:

1. **Create MSAL instance** — `new PublicClientApplication(msalConfig)` at module scope
2. **Initialize** — Calls `msalInstance.initialize()` on mount
3. **Register event callback** — Listens for `LOGIN_SUCCESS` events to set the active account
4. **Handle redirect** — Calls `handleRedirectPromise()` to process the auth code from the Entra ID redirect
5. **Set active account** — From the redirect response or the first cached account
6. **Render children** — Only after initialization completes; shows "Loading…" during init

### Auto-Redirect & Authorization Gate (AuthGate)

The `AuthGate` component enforces both authentication and authorization:

1. Waits for MSAL `inProgress` to be `"none"` (no pending operations)
2. If not authenticated → calls `instance.loginRedirect({ scopes: apiScopes })`
3. If authenticated → calls `/api/me` to verify the user has the required role
4. If the server returns `403 Forbidden` → renders `AccessDeniedPage` with a link to request the entitlement
5. If authorized → renders the app
6. Shows "Signing in…" while checking

Users are automatically redirected to the Microsoft Entra ID login page on first visit. After sign-in, the browser redirects back to the app with an authorization code that MSAL exchanges for tokens.

### Token Acquisition for API Calls

The `useAuthFetch` hook (`src/auth/useAuthFetch.ts`) wraps the browser `fetch` API with automatic token attachment:

1. **Silent acquisition** — Calls `acquireTokenSilent()` to get a cached or refreshed access token
2. **Redirect fallback** — If silent acquisition fails (e.g., token expired and refresh failed), triggers `acquireTokenRedirect()`
3. **Attach header** — Adds `Authorization: Bearer <token>` to every request

```typescript
const authFetch = useAuthFetch();
const response = await authFetch("/api/builds/branches");
```

All components that make API calls use `useAuthFetch`:
- **`BuildSelector`** — Fetches branches and builds
- **`TestResultsPage`** → **`useTestResults`** — Triggers jobs, polls status, fetches results

### MSAL Configuration

`src/auth/msalConfig.ts`:

```typescript
const SPA_CLIENT_ID = "a557232a-261f-4ede-a01a-7b2b18b3c534";
const TENANT_ID = "72f988bf-86f1-41af-91ab-2d7cd011db47";

export const msalConfig: Configuration = {
  auth: {
    clientId: SPA_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: window.location.origin,
  },
  cache: { cacheLocation: "sessionStorage" },
};

export const apiScopes = ["api://utctux/access_as_user"];
```

| Setting | Value | Purpose |
|---------|-------|---------|
| `clientId` | `a557232a...` | The SPA app registration |
| `authority` | `https://login.microsoftonline.com/{tenant}` | Single-tenant Microsoft login |
| `redirectUri` | `window.location.origin` | Where Entra sends the auth code after login |
| `cacheLocation` | `sessionStorage` | Tokens stored per browser tab (cleared on tab close) |
| `apiScopes` | `api://utctux/access_as_user` | Delegated scope for the utctux API |

## End-to-End Auth Flow

```
User visits app
       │
       ▼
  AuthProvider initializes MSAL
       │
       ▼
  AuthGate: is user authenticated?
       │
       ├── No ──> loginRedirect() ──> Entra ID login page
       │                                      │
       │          <── redirect with code ─────┘
       │                     │
       │          handleRedirectPromise()
       │          exchanges code for tokens
       │                     │
       ├── Yes <─────────────┘
       │
       ▼
  App renders, user interacts
       │
       ▼
  API call triggered (e.g., fetch branches)
       │
       ▼
  useAuthFetch: acquireTokenSilent()
       │
       ├── Token cached ──▶ use it
       ├── Token expired ──▶ refresh via refresh token
       └── Refresh fails ──▶ acquireTokenRedirect()
       │
       ▼
  fetch("/api/...", { Authorization: "Bearer <token>" })
       │
       ▼
  AuthESMiseMiddleware:
       │
       ├── Path starts with /api? ── No ──▶ pass through
       │
       ├── Extract Bearer token from Authorization header
       │
       ├── MISE validates token (audience, issuer, signing keys, lifetime)
       │
       ├── ProcessValidatedTokenAsync() → AuthorizationData
       │
       ├── Set HttpContext.User = ClaimsPrincipal
       │
       └── next() → endpoint handler executes
```

## Relationship to Outbound Auth (AuthService)

The inbound auth system described here is **independent** of the existing `AuthService` class which handles outbound authentication to downstream services:

| Concern | System | Purpose |
|---------|--------|---------|
| **Inbound** (this doc) | AuthES/MISE + MSAL.js | Validate that the *caller* has a valid Entra token |
| **Outbound** | `AuthService` (MSAL `InteractiveBrowserCredential`) | Acquire tokens to call CloudTest, Nova, UTCT, Discover |

Currently, the user's identity is **not** propagated to downstream services (no on-behalf-of flow). The server authenticates to downstream services using its own identity. OBO may be added in the future when accessing ADO for content.

## Adding Role-Based or Security Group Authorization

To restrict specific endpoints to certain roles or security groups:

### 1. Define roles/groups in `appsettings.json`

```json
{
  "Authorization": {
    "Roles": {
      "Users": "MSFT/Role:Users",
      "Admins": "MSFT/Role:Admins"
    },
    "SecurityGroups": {
      "TestRunners": "MSFT/<security-group-object-id>"
    }
  }
}
```

### 2. Access AuthorizationData in endpoint handlers

```csharp
api.MapPost("testresults/{*fqbn}", (HttpContext ctx, ...) =>
{
    var authData = ctx.Items[typeof(AuthorizationData)] as AuthorizationData;
    if (authData is null || !authData.IsInRole("Admins"))
        return Results.Forbid();

    // ... handle request
});
```

### 3. Define app roles in the API app registration

```bash
az ad app update --id a7cb231c-7e92-4e78-8800-5241154741f2 \
  --app-roles '[{"allowedMemberTypes":["User"],"displayName":"Admin","isEnabled":true,"value":"Admins","id":"<new-guid>"}]'
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `AADSTS500011: resource principal not found` | Scope URI doesn't match identifier URI | Ensure scopes use `api://utctux/...` not `api://{clientId}/...` |
| `Need admin approval` | SPA not pre-authorized on API app | Add SPA as preAuthorizedApplication on the API app |
| Health check shows Unhealthy/Unauthorized | Middleware blocking `/health` endpoint | Middleware skips non-`/api` paths — verify `StartsWithSegments("/api")` check |
| `Missing roles or security groups configuration` | Empty Roles and SecurityGroups in config | At least one role or security group entry must be defined |
| 401 on API calls | Token expired or wrong audience | Check browser DevTools → Network → Authorization header; verify audience in appsettings matches `api://utctux` |
| 403 / Access Denied page shown | User is authenticated but lacks the `Users` role | User must join the [TM-TestScheduling entitlement](https://coreidentity.microsoft.com/manage/Entitlement/entitlement/tmtestschedu-0wu3); or verify the CCG group is assigned the app role |
| `No authenticationScheme was specified` | `AddAuthentication()` not called or no default scheme | Ensure `PassThroughAuthHandler` is registered as the default scheme via `AddAuthentication("AuthES").AddScheme(...)` |
| Silent token acquisition fails | Session expired | MSAL falls back to `acquireTokenRedirect()` automatically |
| `ServiceManagementReference field is required` | Microsoft tenant policy | Include `serviceManagementReference` in `az rest` body when creating app registrations |

## File Reference

| File | Purpose |
|------|---------|
| `src/utctux.Server/Auth/AuthESExtensions.cs` | `AddAuthESAuthentication` / `AddAuthESAuthorization` for ASP.NET Core |
| `src/utctux.Server/Auth/AuthESMiseMiddleware.cs` | ASP.NET Core middleware for MISE token validation |
| `src/utctux.Server/Auth/PassThroughAuthHandler.cs` | No-op auth handler bridging MISE middleware with ASP.NET Core authorization (Forbid/Challenge) |
| `src/utctux.Server/Program.cs` | Wires up auth services, middleware, and endpoint protection |
| `src/utctux.Server/appsettings.json` | Authorization config (audiences, roles, security groups) |
| `src/frontend/src/auth/msalConfig.ts` | MSAL configuration (client IDs, tenant, scopes) |
| `src/frontend/src/auth/AuthProvider.tsx` | MSAL initialization + auto-redirect + authorization gate |
| `src/frontend/src/auth/useAuthFetch.ts` | Fetch wrapper with automatic Bearer token |
| `src/frontend/src/components/AccessDeniedPage.tsx` | Access denied UI with entitlement request link |
| `nuget.config` | NuGet feed for AuthES packages |
