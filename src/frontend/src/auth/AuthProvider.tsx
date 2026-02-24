import { useEffect, useState, type ReactNode } from "react";
import {
  useMsal,
  useIsAuthenticated,
  MsalProvider,
} from "@azure/msal-react";
import {
  PublicClientApplication,
  EventType,
  type AuthenticationResult,
} from "@azure/msal-browser";
import { msalConfig, apiScopes } from "./msalConfig";
import AccessDeniedPage from "../components/AccessDeniedPage";

const msalInstance = new PublicClientApplication(msalConfig);

/**
 * Initializes MSAL, auto-redirects unauthenticated users,
 * and verifies the user has the required role before rendering the app.
 */
function AuthGate({ children }: { children: ReactNode }) {
  const { instance, inProgress, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [status, setStatus] = useState<
    "checking" | "authorized" | "forbidden"
  >("checking");

  useEffect(() => {
    if (inProgress !== "none") return;

    if (!isAuthenticated) {
      instance.loginRedirect({ scopes: apiScopes });
      return;
    }

    // Verify the user has the required role by calling a protected endpoint
    let cancelled = false;
    (async () => {
      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: apiScopes,
          account: accounts[0],
        });

        const res = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
        });

        if (cancelled) return;

        if (res.status === 403) {
          setStatus("forbidden");
        } else if (res.ok) {
          setStatus("authorized");
        } else {
          // Other errors (401 likely means token issue — retry login)
          await instance.acquireTokenRedirect({ scopes: apiScopes });
        }
      } catch {
        if (!cancelled) {
          await instance.acquireTokenRedirect({ scopes: apiScopes });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [instance, inProgress, isAuthenticated, accounts]);

  if (status === "forbidden") {
    return <AccessDeniedPage />;
  }

  if (status !== "authorized") {
    return <div style={{ padding: 32 }}>Signing in…</div>;
  }

  return <>{children}</>;
}

/**
 * Top-level auth provider. Wraps the app with MsalProvider + auto-redirect gate.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    msalInstance.initialize().then(() => {
      // Set active account from redirect response
      msalInstance.addEventCallback((event) => {
        if (
          event.eventType === EventType.LOGIN_SUCCESS &&
          (event.payload as AuthenticationResult)?.account
        ) {
          msalInstance.setActiveAccount(
            (event.payload as AuthenticationResult).account
          );
        }
      });

      // Handle redirect promise before rendering
      msalInstance.handleRedirectPromise().then((response) => {
        if (response?.account) {
          msalInstance.setActiveAccount(response.account);
        } else if (msalInstance.getAllAccounts().length > 0) {
          msalInstance.setActiveAccount(msalInstance.getAllAccounts()[0]);
        }
        setInitialized(true);
      });
    });
  }, []);

  if (!initialized) {
    return <div style={{ padding: 32 }}>Loading…</div>;
  }

  return (
    <MsalProvider instance={msalInstance}>
      <AuthGate>{children}</AuthGate>
    </MsalProvider>
  );
}
