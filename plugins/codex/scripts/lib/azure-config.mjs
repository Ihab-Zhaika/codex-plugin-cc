import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let cachedConfig = null;

const EXAMPLE_CONFIG = `{
  "apiVersion": "2025-04-01-preview",
  "mainEndpoint": {
    "url": "https://your-resource.openai.azure.com",
    "apiKey": "your-api-key",
    "models": {
      "gpt-5.4": { "tokensPerMinute": 1000000, "requestsPerMinute": 10000, "isDefault": true }
    }
  }
}`;

export function getAzureConfigPath() {
  // When AZURE_CODEX_PLUGIN_CONFIG is set (even to ""), it overrides the default path.
  // Set to "" to disable Azure config detection entirely.
  if ("AZURE_CODEX_PLUGIN_CONFIG" in process.env) {
    return process.env.AZURE_CODEX_PLUGIN_CONFIG;
  }
  return path.join(os.homedir(), ".claude", "azure-claude-codex-plugin.json");
}

export function isAzureConfigured() {
  try {
    loadAzureConfig();
    return true;
  } catch {
    return false;
  }
}

export function loadAzureConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = getAzureConfigPath();

  let raw;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch {
    throw new Error(
      `Azure config file not found at ${configPath}\n\n` +
        `Create the file with the following format:\n${EXAMPLE_CONFIG}`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Azure config file at ${configPath} contains invalid JSON.\n\n` +
        `Expected format:\n${EXAMPLE_CONFIG}`
    );
  }

  if (!parsed.mainEndpoint || typeof parsed.mainEndpoint !== "object") {
    throw new Error(
      `Azure config is missing "mainEndpoint".\n\n` +
        `Expected format:\n${EXAMPLE_CONFIG}`
    );
  }

  const mainEndpoint = parsed.mainEndpoint;

  if (!mainEndpoint.url || typeof mainEndpoint.url !== "string") {
    throw new Error(
      `Azure config "mainEndpoint" is missing a valid "url".\n\n` +
        `Expected format:\n${EXAMPLE_CONFIG}`
    );
  }

  if (!mainEndpoint.apiKey || typeof mainEndpoint.apiKey !== "string") {
    throw new Error(
      `Azure config "mainEndpoint" is missing a valid "apiKey".\n\n` +
        `Expected format:\n${EXAMPLE_CONFIG}`
    );
  }

  const config = {
    apiVersion:
      typeof parsed.apiVersion === "string" && parsed.apiVersion
        ? parsed.apiVersion
        : "2025-04-01-preview",
    mainEndpoint: {
      url: mainEndpoint.url,
      apiKey: mainEndpoint.apiKey,
      ...(mainEndpoint.models && typeof mainEndpoint.models === "object"
        ? { models: mainEndpoint.models }
        : {})
    }
  };

  cachedConfig = config;
  return config;
}

export function getDefaultAzureModel() {
  try {
    const config = loadAzureConfig();
    const models = config.mainEndpoint.models;
    if (!models || typeof models !== "object") {
      return null;
    }
    for (const [name, value] of Object.entries(models)) {
      if (value && typeof value === "object" && value.isDefault) {
        return name;
      }
    }
    const keys = Object.keys(models);
    return keys.length > 0 ? keys[0] : null;
  } catch {
    return null;
  }
}

export function resetAzureConfig() {
  cachedConfig = null;
}
