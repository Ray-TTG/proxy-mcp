import "dotenv/config";
import express from "express";
import { getValidToken, initAuth } from "./auth.js";
import { createPowerBIProxy } from "./proxy.js";

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.PROXY_API_KEY;

if (!API_KEY) {
  console.error("ERROR: PROXY_API_KEY is not set in .env");
  process.exit(1);
}

// API key validation middleware
app.use(async (req, res, next) => {
  const key = req.headers["x-api-key"];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized: invalid or missing x-api-key" });
  }

  // Acquire upstream token and inject it
  try {
    const token = await getValidToken();
    req.headers["authorization"] = `Bearer ${token}`;
    delete req.headers["x-api-key"];
    next();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed to acquire upstream token:`, err.message);
    return res.status(502).json({ error: "Failed to acquire upstream OAuth token" });
  }
});

app.use("/", createPowerBIProxy());

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});

// Init MSAL (interactive login if needed) then start server
(async () => {
  try {
    await initAuth();
    app.listen(PORT, () => {
      console.log(`[${new Date().toISOString()}] Proxy MCP running on http://localhost:${PORT}`);
      console.log(`Connect from One Intelligence: URL = http://localhost:${PORT}, header x-api-key = <your PROXY_API_KEY>`);
    });
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
})();