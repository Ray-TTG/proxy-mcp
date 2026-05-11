import { PublicClientApplication } from "@azure/msal-node";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { exec } from "child_process";

const CACHE_FILE = ".msal_cache.json";
const CLIENT_ID = process.env.AZURE_CLIENT_ID; // VS Code Azure Resources app
const SCOPES = ["https://analysis.windows.net/powerbi/api/.default", "offline_access"];

if (!process.env.AZURE_TENANT_ID) {
  console.error("ERROR: AZURE_TENANT_ID is not set in .env");
  process.exit(1);
}

if (!process.env.AZURE_CLIENT_ID) {
  console.error("ERROR: AZURE_CLIENT_ID is not set in .env");
  process.exit(1);
}

// --- File system cache plugin ---
const cachePlugin = {
  beforeCacheAccess: async (cacheContext) => {
    if (existsSync(CACHE_FILE)) {
      cacheContext.tokenCache.deserialize(readFileSync(CACHE_FILE, "utf-8"));
    }
  },
  afterCacheAccess: async (cacheContext) => {
    if (cacheContext.cacheHasChanged) {
      writeFileSync(CACHE_FILE, cacheContext.tokenCache.serialize());
    }
  },
};

const pca = new PublicClientApplication({
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
  },
  cache: { cachePlugin },
});

/** @type {Promise<void> | null} Simple mutex for concurrent token requests */
let acquireInProgress = null;

/** @type {string | null} */
let cachedAccount = null;

function openBrowser(url) {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.log(`Could not open browser automatically. Please visit:\n${url}`);
  });
}

async function interactiveLogin() {
  console.log(`[${new Date().toISOString()}] Starting interactive login...`);
  const result = await pca.acquireTokenInteractive({
    scopes: SCOPES,
    openBrowser: async (url) => openBrowser(url),
    successTemplate: "<h1>Login successful! You can close this tab and return to the terminal.</h1>",
    errorTemplate: "<h1>Login failed: {error}</h1>",
  });
  cachedAccount = result.account;
  console.log(`[${new Date().toISOString()}] Login successful. Token cached.`);
  return result.accessToken;
}

/**
 * Initialize MSAL — attempt silent login from cache, fall back to interactive.
 */
export async function initAuth() {
  const accounts = await pca.getTokenCache().getAllAccounts();
  if (accounts.length > 0) {
    cachedAccount = accounts[0];
    try {
      await pca.acquireTokenSilent({ scopes: SCOPES, account: cachedAccount });
      console.log(`[${new Date().toISOString()}] Resumed session from cache for ${cachedAccount.username}`);
      return;
    } catch {
      console.log(`[${new Date().toISOString()}] Cached token expired or invalid, re-authenticating...`);
    }
  }
  await interactiveLogin();
}

/**
 * Get a valid access token, using silent refresh where possible.
 * Uses a simple mutex to prevent concurrent acquisition.
 * @returns {Promise<string>}
 */
export async function getValidToken() {
  if (acquireInProgress) return acquireInProgress;

  acquireInProgress = (async () => {
    try {
      if (!cachedAccount) throw new Error("No account — call initAuth first");

      try {
        const result = await pca.acquireTokenSilent({ scopes: SCOPES, account: cachedAccount });
        console.log(`[${new Date().toISOString()}] Token refreshed silently`);
        return result.accessToken;
      } catch (silentErr) {
        console.log(`[${new Date().toISOString()}] Silent refresh failed (${silentErr.errorCode}), re-authenticating interactively...`);
        return await interactiveLogin();
      }
    } finally {
      acquireInProgress = null;
    }
  })();

  return acquireInProgress;
}
