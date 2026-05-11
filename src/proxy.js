import { createProxyMiddleware } from "http-proxy-middleware";

const UPSTREAM = "https://api.fabric.microsoft.com";

export function createPowerBIProxy() {
  return createProxyMiddleware({
    target: UPSTREAM,
    changeOrigin: true,
    selfHandleResponse: false, // stream SSE directly, no buffering
    pathRewrite: { '^/': '/v1/mcp/powerbi' },
    on: {
      proxyReq: (proxyReq, req) => {
        // Authorization header is already set by the middleware in index.js
        // Log the forwarded path for debugging
        console.log(`[${new Date().toISOString()}] → ${req.method} ${proxyReq.path}`);
      },
      error: (err, req, res) => {
        console.error(`[${new Date().toISOString()}] Proxy error:`, err.message);
        if (!res.headersSent) {
          res.status(502).json({ error: "Proxy error", detail: err.message });
        }
      },
    },
  });
}
