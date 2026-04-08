---
description: Configure Azure OpenAI endpoint for Codex
allowed-tools: Bash(node:*), AskUserQuestion
---

Use `AskUserQuestion` to ask all three questions at once:

1. **Azure OpenAI endpoint URL** — e.g. `https://your-resource.openai.azure.com`
2. **API key** — the Azure OpenAI API key
3. **Default model deployment name** — e.g. `gpt-5.4`, `gpt-5.3-codex`, `gpt-5.4-mini`

Then run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" azure-setup --url "<url>" --api-key "<api-key>" --model "<model>"
```

Present the output to the user. If successful, suggest running `/codex:setup` to verify.
