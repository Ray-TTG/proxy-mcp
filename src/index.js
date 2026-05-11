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

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Incoming ${req.method} ${req.originalUrl}`);
  next();
});

const openApiProbe = (req, res) => {
  res.json({
    openapi: "3.0.0",
    info: { title: "Power BI MCP Proxy", version: "1.0.0" },
    servers: [{ url: `http://localhost:${PORT}` }],
    paths: {
      "/": {
        post: {
          summary: "Power BI MCP endpoint",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
          responses: {
            "200": { description: "MCP response" },
          },
        },
      },
    },
  });
};

app.get(["/v1/mcp/powerbiopenapi.json", "/v1/mcp/powerbi/openapi.json", "/openapi.json"], openApiProbe);

// Bearer token validation middleware
app.use(async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const key = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  /* 
    if (!key || key !== API_KEY) {
      return res.status(401).json({ error: "Unauthorized: invalid or missing Authorization Bearer token" });
    }
  */

  // Acquire upstream OAuth token and replace the incoming Bearer key with it
  try {
    const token = await getValidToken();
    req.headers["authorization"] = `Bearer ${token}`;
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
      console.log(`Connect from One Intelligence: URL = http://10.0.29.12:${PORT}, Bearer ${API_KEY}`);
    });
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
})();