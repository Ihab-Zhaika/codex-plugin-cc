import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

let singletonProxy = null;

/**
 * Start the Azure OpenAI proxy if not already running, or return the existing one.
 * @param {import("./azure-config.mjs").default} [azureConfig]
 * @returns {Promise<{ port: number, baseUrl: string, close: () => Promise<void> }>}
 */
export async function ensureAzureProxy(azureConfig) {
  if (singletonProxy) {
    return singletonProxy;
  }

  if (!azureConfig) {
    const { loadAzureConfig } = await import("./azure-config.mjs");
    azureConfig = loadAzureConfig();
  }

  singletonProxy = await startAzureProxy(azureConfig);
  return singletonProxy;
}

export async function shutdownAzureProxy() {
  if (!singletonProxy) {
    return;
  }
  const proxy = singletonProxy;
  singletonProxy = null;
  await proxy.close();
}

/**
 * @param {{ apiVersion: string, mainEndpoint: { url: string, apiKey: string } }} azureConfig
 */
export async function startAzureProxy(azureConfig) {
  const azureBaseUrl = azureConfig.mainEndpoint.url.replace(/\/+$/, "");
  const azureApiKey = azureConfig.mainEndpoint.apiKey;
  const apiVersion = azureConfig.apiVersion;

  const PATH_MAP = {
    "/v1/responses": "/openai/responses",
    "/v1/chat/completions": "/openai/chat/completions"
  };

  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    const matchedPath = PATH_MAP[req.url?.split("?")[0]];
    if (!matchedPath) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const targetUrl = new URL(`${azureBaseUrl}${matchedPath}`);
    targetUrl.searchParams.set("api-version", apiVersion);

    const forwardHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if (lower === "authorization" || lower === "host" || lower === "connection") {
        continue;
      }
      forwardHeaders[key] = value;
    }
    forwardHeaders["api-key"] = azureApiKey;

    const proxyOptions = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
      path: `${targetUrl.pathname}${targetUrl.search}`,
      method: req.method,
      headers: forwardHeaders
    };

    const transport = targetUrl.protocol === "https:" ? https : http;

    const proxyReq = transport.request(proxyOptions, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (error) => {
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Azure proxy upstream error: ${error.message}` }));
      }
    });

    req.pipe(proxyReq);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}/v1`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}
