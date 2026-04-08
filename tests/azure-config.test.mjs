import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { makeTempDir } from "./helpers.mjs";
import {
  isAzureConfigured,
  loadAzureConfig,
  getDefaultAzureModel,
  resetAzureConfig
} from "../plugins/codex/scripts/lib/azure-config.mjs";

const tempDir = makeTempDir("azure-config-test-");
const configPath = path.join(tempDir, "azure-openai.json");

const VALID_CONFIG = {
  apiVersion: "2025-04-01-preview",
  mainEndpoint: {
    url: "https://my-resource.cognitiveservices.azure.com",
    apiKey: "test-api-key-123",
    models: {
      "gpt-5.4": { tokensPerMinute: 1000000, requestsPerMinute: 10000, isDefault: true },
      "gpt-5.4-mini": { tokensPerMinute: 500000, requestsPerMinute: 5000 }
    }
  }
};

function writeConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

function removeConfig() {
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }
}

function setup() {
  process.env.AZURE_OPENAI_CONFIG = configPath;
  resetAzureConfig();
}

function setupDisabled() {
  process.env.AZURE_OPENAI_CONFIG = "";
  resetAzureConfig();
}

function teardown() {
  delete process.env.AZURE_OPENAI_CONFIG;
  resetAzureConfig();
}

test("isAzureConfigured returns false when file does not exist", () => {
  setup();
  try {
    removeConfig();
    assert.equal(isAzureConfigured(), false);
  } finally {
    teardown();
  }
});

test("isAzureConfigured returns false when AZURE_OPENAI_CONFIG is empty", () => {
  setupDisabled();
  try {
    assert.equal(isAzureConfigured(), false);
  } finally {
    teardown();
  }
});

test("isAzureConfigured returns true when valid config exists", () => {
  setup();
  try {
    writeConfig(VALID_CONFIG);
    assert.equal(isAzureConfigured(), true);
  } finally {
    teardown();
  }
});

test("loadAzureConfig parses valid config", () => {
  setup();
  try {
    writeConfig(VALID_CONFIG);
    const config = loadAzureConfig();
    assert.equal(config.apiVersion, "2025-04-01-preview");
    assert.equal(config.mainEndpoint.url, "https://my-resource.cognitiveservices.azure.com");
    assert.equal(config.mainEndpoint.apiKey, "test-api-key-123");
  } finally {
    teardown();
  }
});

test("loadAzureConfig throws when file is missing", () => {
  setup();
  try {
    removeConfig();
    assert.throws(() => loadAzureConfig(), /config file not found/);
  } finally {
    teardown();
  }
});

test("loadAzureConfig throws on invalid JSON", () => {
  setup();
  try {
    fs.writeFileSync(configPath, "{ bad json", "utf8");
    assert.throws(() => loadAzureConfig(), /invalid JSON/);
  } finally {
    teardown();
  }
});

test("loadAzureConfig throws when mainEndpoint is missing", () => {
  setup();
  try {
    writeConfig({ apiVersion: "2025-04-01-preview" });
    assert.throws(() => loadAzureConfig(), /missing "mainEndpoint"/);
  } finally {
    teardown();
  }
});

test("loadAzureConfig throws when url is missing", () => {
  setup();
  try {
    writeConfig({ mainEndpoint: { apiKey: "key" } });
    assert.throws(() => loadAzureConfig(), /missing a valid "url"/);
  } finally {
    teardown();
  }
});

test("loadAzureConfig throws when apiKey is missing", () => {
  setup();
  try {
    writeConfig({ mainEndpoint: { url: "https://example.com" } });
    assert.throws(() => loadAzureConfig(), /missing a valid "apiKey"/);
  } finally {
    teardown();
  }
});

test("loadAzureConfig defaults apiVersion when omitted", () => {
  setup();
  try {
    writeConfig({ mainEndpoint: { url: "https://example.com", apiKey: "key" } });
    const config = loadAzureConfig();
    assert.equal(config.apiVersion, "2025-04-01-preview");
  } finally {
    teardown();
  }
});

test("getDefaultAzureModel returns the isDefault model", () => {
  setup();
  try {
    writeConfig(VALID_CONFIG);
    assert.equal(getDefaultAzureModel(), "gpt-5.4");
  } finally {
    teardown();
  }
});

test("getDefaultAzureModel returns first model when none is isDefault", () => {
  setup();
  try {
    writeConfig({
      mainEndpoint: {
        url: "https://example.com",
        apiKey: "key",
        models: { "gpt-5.4-mini": { tokensPerMinute: 1000, requestsPerMinute: 10 } }
      }
    });
    assert.equal(getDefaultAzureModel(), "gpt-5.4-mini");
  } finally {
    teardown();
  }
});

test("getDefaultAzureModel returns null when no models configured", () => {
  setup();
  try {
    writeConfig({ mainEndpoint: { url: "https://example.com", apiKey: "key" } });
    assert.equal(getDefaultAzureModel(), null);
  } finally {
    teardown();
  }
});

test("getDefaultAzureModel returns null when config is missing", () => {
  setup();
  try {
    removeConfig();
    assert.equal(getDefaultAzureModel(), null);
  } finally {
    teardown();
  }
});
