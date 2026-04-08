import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CODEX_HOME = path.join(os.homedir(), ".codex");
const CONFIG_TOML = path.join(CODEX_HOME, "config.toml");
const CREDENTIALS_FILE = path.join(CODEX_HOME, "azure-credentials.json");
const ENV_KEY = "AZURE_OPENAI_API_KEY";

/**
 * Save Azure credentials and write ~/.codex/config.toml.
 * Called by the /codex:azure-setup command.
 */
export function saveAzureSetup({ url, apiKey, model }) {
  let baseUrl = url.replace(/\/+$/, "");
  if (!baseUrl.endsWith("/openai/v1")) {
    baseUrl += "/openai/v1";
  }

  const toml = [
    `model = "${model}"`,
    `model_provider = "azure"`,
    `model_reasoning_effort = "medium"`,
    ``,
    `[model_providers.azure]`,
    `name = "Azure OpenAI"`,
    `base_url = "${baseUrl}"`,
    `env_key = "${ENV_KEY}"`,
    `wire_api = "responses"`,
    ``
  ].join("\n");

  fs.mkdirSync(CODEX_HOME, { recursive: true });
  fs.writeFileSync(CONFIG_TOML, toml, "utf8");
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify({ apiKey }, null, 2) + "\n", "utf8");

  return { configPath: CONFIG_TOML, credentialsPath: CREDENTIALS_FILE };
}

/**
 * Load the saved Azure API key from ~/.codex/azure-credentials.json.
 * Returns the key string, or null if not configured.
 */
export function loadAzureApiKey() {
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return typeof parsed.apiKey === "string" && parsed.apiKey ? parsed.apiKey : null;
  } catch {
    return null;
  }
}

/**
 * Check if Azure is configured: config.toml has azure provider + credentials exist.
 */
export function isAzureConfigured() {
  try {
    const toml = fs.readFileSync(CONFIG_TOML, "utf-8");
    if (!toml.includes('model_provider = "azure"')) {
      return false;
    }
    return loadAzureApiKey() !== null;
  } catch {
    return false;
  }
}

/**
 * Read the model from config.toml (first `model = "..."` line).
 */
export function getConfiguredModel() {
  try {
    const toml = fs.readFileSync(CONFIG_TOML, "utf-8");
    const match = toml.match(/^model\s*=\s*"([^"]+)"/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Read the base_url from config.toml.
 */
export function getConfiguredBaseUrl() {
  try {
    const toml = fs.readFileSync(CONFIG_TOML, "utf-8");
    const match = toml.match(/base_url\s*=\s*"([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Return an env object with AZURE_OPENAI_API_KEY set from stored credentials.
 * Used by app-server.mjs when spawning the Codex process.
 */
export function buildAzureEnv(baseEnv = process.env) {
  const apiKey = loadAzureApiKey();
  if (!apiKey) {
    return baseEnv;
  }
  return { ...baseEnv, [ENV_KEY]: apiKey };
}
