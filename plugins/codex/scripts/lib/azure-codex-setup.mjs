import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDefaultAzureModel } from "./azure-config.mjs";

const CODEX_HOME = path.join(os.homedir(), ".codex");
const CONFIG_TOML = path.join(CODEX_HOME, "config.toml");
const ENV_KEY = "AZURE_OPENAI_API_KEY";

/**
 * Ensure ~/.codex/config.toml has the Azure provider configured and return
 * an env object with AZURE_OPENAI_API_KEY set.
 *
 * The Codex CLI natively supports Azure via config.toml:
 *   model_provider = "azure"
 *   [model_providers.azure]
 *   base_url = "https://<resource>.openai.azure.com/openai/v1"
 *   env_key  = "AZURE_OPENAI_API_KEY"
 *   wire_api = "responses"
 */
export function ensureAzureCodexConfig(azureConfig, baseEnv = process.env) {
  const endpoint = azureConfig.mainEndpoint;
  const model = getDefaultAzureModel() ?? "gpt-5.4";

  // Build the Azure base_url: must end with /openai/v1
  // Accept both .cognitiveservices.azure.com and .openai.azure.com
  let baseUrl = endpoint.url.replace(/\/+$/, "");
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

  return {
    ...baseEnv,
    [ENV_KEY]: endpoint.apiKey
  };
}
