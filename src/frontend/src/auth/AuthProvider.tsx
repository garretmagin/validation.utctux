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

const msalInstance = new PublicClientApplication(msalConfig);

/**
 * Initializes MSAL and auto-redirects unauthenticated users.
 */
function AuthGate({ children }: { children: ReactNode }) {
  const { instance, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (inProgress !== "none") return;

    if (!isAuthenticated) {
      instance.loginRedirect({ scopes: apiScopes });
    } else {
      setReady(true);
    }
  }, [instance, inProgress, isAuthenticated]);

  if (!ready) {
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
