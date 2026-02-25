import type { Configuration } from "@azure/msal-browser";
import { LogLevel } from "@azure/msal-browser";

const SPA_CLIENT_ID = "a557232a-261f-4ede-a01a-7b2b18b3c534";
const TENANT_ID = "72f988bf-86f1-41af-91ab-2d7cd011db47"; // Microsoft tenant
export const API_CLIENT_ID = "a7cb231c-7e92-4e78-8800-5241154741f2";

export const msalConfig: Configuration = {
  auth: {
    clientId: SPA_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
    },
  },
};

export const apiScopes = ["api://utctux/access_as_user"];
