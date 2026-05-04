# PowerBI Proxy MCP — Tutorial

## What this is
The Microsoft Power BI MCP server (https://api.fabric.microsoft.com/v1/mcp/powerbi) requires
OAuth/MSAL authentication, which most MCP clients (e.g. One Intelligence) don't support — they
only support simple API key or token-based auth.

This proxy sits in between:

One Intelligence ──(x-api-key)──► Proxy MCP ──(OAuth Bearer)──► Power BI MCP

It validates your API key, acquires a real OAuth token from Microsoft on your behalf, and forwards
the request upstream. Your MCP client never needs to know about OAuth.

## Prerequisites
Node.js 18 or higher
An Azure / Microsoft 365 account with access to Power BI
Access to the Azure Portal to register an app


### Step 1 — Register an App in Azure
You need to register a small app in your Azure tenant so MSAL can authenticate on your behalf.

Go to Azure Portal → Microsoft Entra ID → App Registrations → New Registration
Give it any name (e.g. powerbi-proxy)
Under Supported account types, leave the default (single tenant)
Click Register
Copy the Application (client) ID — you'll need this shortly.

Add a redirect URI.

Go to Authentication → Add a platform → Mobile and desktop applications
Check the box for http://localhost
Click Configure, then Save.


⚠️ You must use Mobile and desktop applications, not "Web". The Web platform requires HTTPS
and won't work with MSAL node's loopback redirect.


### Step 2 — Find your Tenant ID

Go to Azure Portal → Microsoft Entra ID → Overview
Copy the Tenant ID (a UUID like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)


### Step 3 — Configure the proxy
Fill in the values in .env:

PROXY_API_KEY=your-secret-key-here

AZURE_TENANT_ID=your-tenant-id-here

PORT=3000

The PROXY_API_KEY is a secret you choose — it's not issued by Microsoft. It's the password
your MCP client will use to talk to the proxy. Generate a secure random one.

### Step 4 — Install and run
```
npm install
node src/index.js
```

### Step 5 — Connect from One Intelligence
Configure MCP connection to Proxy in OI.

## Token lifetimes
TokenLifetimeAccess token1 hourRefresh token24 hours (up to 90 days with continuous use)

The proxy handles token rotation automatically on every request via acquireTokenSilent. MSAL
checks expiry internally and silently refreshes the access token using the refresh token before it
expires. You will only ever see the browser login prompt again if:

 - You haven't used the proxy for 90 days (refresh token fully expired), or
 - You manually delete .msal_cache.json


## Project structure
proxy-mcp/
  src/
    index.js        # Express app, API key middleware, startup
    auth.js         # MSAL setup, token cache, acquisition logic
    proxy.js        # http-proxy-middleware to Power BI MCP upstream
  .msal_cache.json  # Written at runtime — do NOT commit this
  .env              # Your secrets — do NOT commit this
  .env.example      # Safe template to commit
  .gitignore
  package.json
  readme.md       # This file