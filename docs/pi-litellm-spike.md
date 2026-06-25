# Pi + LiteLLM spike

Hypothesis: run agent-manager skills through the [pi.dev](https://pi.dev) open harness, routing all model calls via a LiteLLM-compatible gateway instead of Claude Code or GitHub Copilot.

## Is pi compatible with LiteLLM?

**Yes.** Pi does not talk to LiteLLM natively, but the community extension [`pi-provider-litellm`](https://pi.dev/packages/pi-provider-litellm) registers a `litellm` provider that:

1. Authenticates with `LITELLM_BASE_URL` + `LITELLM_API_KEY`
2. Discovers models from `/model/info` or falls back to **`/v1/models`** (OpenAI-compatible)
3. Sends chat completions through the proxy

Any gateway that exposes `/v1/models` works — for example:

```bash
curl -s https://litellm.example.com/v1/models \
  -H "Authorization: Bearer sk-example-gateway-key"
```

## Gateway credentials

Pi's LiteLLM extension reads **`LITELLM_BASE_URL`** and **`LITELLM_API_KEY`**. If your gateway documents different variable names, map them in the workflow:

| Your gateway (example) | Pi extension env var |
|------------------------|----------------------|
| `GATEWAY_BASE_URL=https://litellm.example.com` | `LITELLM_BASE_URL=https://litellm.example.com` |
| `GATEWAY_API_KEY=sk-example-gateway-key` | `LITELLM_API_KEY=sk-example-gateway-key` |

The dispatcher action accepts these as inputs:

```yaml
with:
  litellm-base-url: https://litellm.example.com
  litellm-api-key: ${{ secrets.LITELLM_API_KEY }}
  pi-model: litellm/claude-sonnet-4-6
```

Do **not** append `/v1` to the base URL — the extension adds API paths.

## Multi-model routing

Model IDs returned by your gateway's `/v1/models` endpoint are selectable:

- **Globally:** `pi-model` action input
- **Per skill:** `model:` in `.github/ai-skills.yml`

Example:

```yaml
tools:
  - agents
scope: repo
skills:
  - name: code-review-backend
    tool: pi
    on: [pull_request.opened, pull_request.synchronize]
    autonomy: observe
    model: claude-sonnet-4-6

  - name: security-audit
    tool: pi
    on: [pull_request.opened]
    autonomy: observe
    model: gpt-4o
```

At runtime the adapter runs:

```bash
pi -e npm:pi-provider-litellm -p -a --no-session \
  --model litellm/claude-sonnet-4-6 \
  --skill code-review-backend \
  "$(cat /tmp/prompt.txt)"
```

## Skill installation

Agent-manager installs skills to `.agents/skills/<skill-name>/` when `tools: [agents]` is set. Pi auto-discovers that path.

Set `tool: pi` on each skill so the dispatcher runs the pi harness — install location and runtime are separate concerns.

## Known gaps / risks

- **Tool use in CI:** pi runs with full built-in tools (`read`, `write`, `bash`, …). For `observe`-only skills consider restricting tools in a follow-up.
- **Budget caps:** no stable iteration/budget signal in pi print mode yet — budget warnings are not implemented.
- **Network:** the runner must reach your LiteLLM gateway URL.
- **Extension fetch:** `-e npm:pi-provider-litellm` downloads from npm on first run; pin or bake into the Docker image for reproducibility if needed.

## Test workflow secrets

| Secret | Example value |
|--------|---------------|
| `LITELLM_API_KEY` | `sk-example-gateway-key` |
| `GITHUB_TOKEN` | Default Actions token (PR read/write) |

See `examples/04-ai-skills-pi-litellm.yml` for a full manifest example.
