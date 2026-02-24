import { useMsal } from "@azure/msal-react";
import { useCallback } from "react";
import { apiScopes } from "./msalConfig";

/**
 * Returns a fetch wrapper that automatically attaches a Bearer token.
 */
export function useAuthFetch() {
  const { instance, accounts } = useMsal();

  return useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      if (accounts.length === 0) {
        await instance.loginRedirect({ scopes: apiScopes });
        throw new Error("Redirecting to login");
      }

      let accessToken: string;
      try {
        const response = await instance.acquireTokenSilent({
          scopes: apiScopes,
          account: accounts[0],
        });
        accessToken = response.accessToken;
      } catch {
        await instance.acquireTokenRedirect({ scopes: apiScopes });
        throw new Error("Redirecting for token acquisition");
      }

      return fetch(url, {
        ...init,
        headers: {
          ...init?.headers,
          Authorization: `Bearer ${accessToken}`,
        },
      });
    },
    [instance, accounts]
  );
}
