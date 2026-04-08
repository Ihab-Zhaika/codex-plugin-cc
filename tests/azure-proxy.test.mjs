import http from "node:http";
import test from "node:test";
import assert from "node:assert/strict";

import { startAzureProxy, shutdownAzureProxy } from "../plugins/codex/scripts/lib/azure-proxy.mjs";

const AZURE_CONFIG = {
  apiVersion: "2025-04-01-preview",
  mainEndpoint: {
    url: "https://my-resource.cognitiveservices.azure.com",
    apiKey: "test-azure-key-abc"
  }
};

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

test("proxy starts and /health returns 200", async () => {
  const proxy = await startAzureProxy(AZURE_CONFIG);
  try {
    const res = await httpRequest(`http://127.0.0.1:${proxy.port}/health`);
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.status, "ok");
  } finally {
    await proxy.close();
  }
});

test("proxy returns 404 for unknown paths", async () => {
  const proxy = await startAzureProxy(AZURE_CONFIG);
  try {
    const res = await httpRequest(`http://127.0.0.1:${proxy.port}/v1/unknown`, { method: "POST" });
    assert.equal(res.statusCode, 404);
  } finally {
    await proxy.close();
  }
});

test("proxy baseUrl has correct format", async () => {
  const proxy = await startAzureProxy(AZURE_CONFIG);
  try {
    assert.match(proxy.baseUrl, /^http:\/\/127\.0\.0\.1:\d+\/v1$/);
  } finally {
    await proxy.close();
  }
});

test("shutdownAzureProxy is safe to call when no proxy running", async () => {
  // Should not throw.
  await shutdownAzureProxy();
});

// The following tests verify routing and header rewriting by intercepting the
// outbound request at the proxy level.  Since we cannot easily stand up a real
// Azure endpoint in CI, we instead start a second local HTTP server that
// pretends to be Azure and verify the proxy forwards correctly.

test("proxy rewrites /v1/responses to Azure URL and headers", async () => {
  let receivedReq = null;
  let receivedBody = "";

  // Fake Azure endpoint.
  const fakeAzure = http.createServer((req, res) => {
    receivedReq = { url: req.url, method: req.method, headers: { ...req.headers } };
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      receivedBody = body;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "resp_123" }));
    });
  });

  await new Promise((resolve) => fakeAzure.listen(0, "127.0.0.1", resolve));
  const fakePort = fakeAzure.address().port;

  const config = {
    apiVersion: "2025-04-01-preview",
    mainEndpoint: {
      url: `http://127.0.0.1:${fakePort}`,
      apiKey: "my-azure-key"
    }
  };

  const proxy = await startAzureProxy(config);
  try {
    const payload = JSON.stringify({ model: "gpt-5.4", input: "hello" });
    const res = await httpRequest(`http://127.0.0.1:${proxy.port}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer azure-proxy-passthrough",
        "Content-Length": Buffer.byteLength(payload)
      },
      body: payload
    });

    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).id, "resp_123");

    // Verify the proxy rewrote the URL.
    assert.ok(receivedReq.url.startsWith("/openai/responses"), `Expected Azure path, got: ${receivedReq.url}`);
    assert.ok(receivedReq.url.includes("api-version=2025-04-01-preview"), `Expected api-version param, got: ${receivedReq.url}`);

    // Verify the proxy replaced the Authorization header with api-key.
    assert.equal(receivedReq.headers["api-key"], "my-azure-key");
    assert.equal(receivedReq.headers["authorization"], undefined);

    // Verify body passed through.
    assert.equal(receivedBody, payload);
  } finally {
    await proxy.close();
    await new Promise((resolve) => fakeAzure.close(resolve));
  }
});

test("proxy rewrites /v1/chat/completions to Azure URL", async () => {
  let receivedUrl = null;

  const fakeAzure = http.createServer((req, res) => {
    receivedUrl = req.url;
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [] }));
    });
  });

  await new Promise((resolve) => fakeAzure.listen(0, "127.0.0.1", resolve));
  const fakePort = fakeAzure.address().port;

  const config = {
    apiVersion: "2025-04-01-preview",
    mainEndpoint: {
      url: `http://127.0.0.1:${fakePort}`,
      apiKey: "key"
    }
  };

  const proxy = await startAzureProxy(config);
  try {
    await httpRequest(`http://127.0.0.1:${proxy.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });

    assert.ok(receivedUrl.startsWith("/openai/chat/completions"));
    assert.ok(receivedUrl.includes("api-version=2025-04-01-preview"));
  } finally {
    await proxy.close();
    await new Promise((resolve) => fakeAzure.close(resolve));
  }
});

test("proxy returns 502 when upstream is unreachable", async () => {
  const config = {
    apiVersion: "2025-04-01-preview",
    mainEndpoint: {
      // Port 1 is almost certainly not listening.
      url: "http://127.0.0.1:1",
      apiKey: "key"
    }
  };

  const proxy = await startAzureProxy(config);
  try {
    const res = await httpRequest(`http://127.0.0.1:${proxy.port}/v1/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    assert.equal(res.statusCode, 502);
  } finally {
    await proxy.close();
  }
});
