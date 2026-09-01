# Agent Manager - AI Skills Dispatcher GitHub Action

A GitHub Action that uses Agent Manager to install and run AI agent skills within your GitHub Workflows.

The action reads a skill manifest from your repo, installs the listed skills via [agent-manager](https://github.com/ai-agent-manager/agentman), filters them by the current event, and runs each matched skill through the configured AI tool in headless mode.

Currently supported harnesses:

- Claude Code (`claude-code`)
- GitHub Copilot CLI (`github-copilot`)
- [pi](https://pi.dev) (`pi`) via a configured AI gateway

Output is posted as a PR comment, used to update the PR description, or committed back to the PR branch depending on skill autonomy.

## Shared settings

Use one auth hook and (when needed) one gateway URL. Adapters map these to vendor env vars at runtime.

| Setting                | Type     | Purpose                                                                      |
| ---------------------- | -------- | ---------------------------------------------------------------------------- |
| `AI_SKILLS_URL`        | Variable | Skill bundle base URL → `bundle-base-url`                                    |
| `AI_GATEWAY_URL`       | Variable | AI gateway base URL → `gateway-base-url` (Claude Code + pi)                  |
| `AI_GATEWAY_API_KEY`   | Secret   | Auth hook → `gateway-api-key`                                                |
| `AI_MODEL`             | Variable | Optional default model → `default-model` (prefer per-skill `model:`)         |
| `COPILOT_GITHUB_TOKEN` | Secret   | **Only** when mixing a gateway harness with native Copilot → `copilot-token` |

| Harness combo                     | Put in `AI_GATEWAY_API_KEY`                     | Also set                                                 |
| --------------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| Claude Code and/or pi             | Your gateway API key                            | `AI_GATEWAY_URL`                                         |
| Copilot only                      | Fine-grained user PAT with **Copilot Requests** | —                                                        |
| Gateway harnesses **and** Copilot | Gateway API key                                 | `AI_GATEWAY_URL` + `COPILOT_GITHUB_TOKEN` (PAT override) |

> [!WARNING]
> When `copilot-token` / `COPILOT_GITHUB_TOKEN` is used, it must be a fine-grained GitHub user PAT with Copilot access. Classic tokens are not supported.

> [!CAUTION]
> **Security: `act` autonomy + `issue_comment` triggers.**
> When your workflow uses `contents: write` and triggers on `issue_comment`, any
> content in a PR diff (including from forks) can influence the AI tool's output.
> With `autonomy: act`, the tool commits changes using the workflow's write token.
> This is a prompt-injection vector.
>
> Mitigations:
>
> - Restrict the workflow to comments from users with `write` association or higher
>   (e.g. `if: github.event.comment.author_association == 'MEMBER' || ...`).
> - Avoid `act` autonomy on repos that accept PRs from forks.
> - Consider running fork PRs in a read-only environment without `contents: write`.
> - The pi harness passes `-a` / `--approve` so headless CI does not hang on
>   project-trust prompts. That trusts project-local pi files (`.pi/`) from the
>   checked-out workspace — do not run pi skills on fork PRs, or run those jobs
>   without `contents: write`.

## Harness setups

Every harness uses the same workflow skeleton. Only the `ai-skills.yml` tool choice and which shared settings you fill in change.

```yaml
# .github/workflows/ai-dispatcher.yml
name: AI Skills Dispatcher

on:
  pull_request:
    types: [opened, synchronize]
  issue_comment:
    types: [created]

jobs:
  dispatch:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: write # required for autonomy: act
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Checkout PR branch (comment events)
        if: github.event_name == 'issue_comment' && github.event.issue.pull_request
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh pr checkout ${{ github.event.issue.number }}

      - uses: ai-agent-manager/github-dispatcher-action@latest
        with:
          bundle-base-url: ${{ vars.AI_SKILLS_URL }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          gateway-base-url: ${{ vars.AI_GATEWAY_URL }}
          gateway-api-key: ${{ secrets.AI_GATEWAY_API_KEY }}
          default-model: ${{ vars.AI_MODEL }}
          # Mixed gateway + Copilot only:
          # copilot-token: ${{ secrets.COPILOT_GITHUB_TOKEN }}
```

Suggested variable values (examples only):

| Variable         | Example                         |
| ---------------- | ------------------------------- |
| `AI_SKILLS_URL`  | `https://bootstrap.example.com` |
| `AI_GATEWAY_URL` | `https://gateway.example.com`   |
| `AI_MODEL`       | `claude-sonnet-4-6`             |

### Claude Code

```yaml
# .github/ai-skills.yml
tools:
  - claude-code
scope: repo
skills:
  - name: code-review-backend
    on: [pull_request.opened, pull_request.synchronize]
    autonomy: observe
    max_budget_usd: 5

  - name: pr-description-generator
    on: [pull_request.opened]
    autonomy: suggest
```

Required settings: `AI_SKILLS_URL`, `AI_GATEWAY_URL`, `AI_GATEWAY_API_KEY` (gateway API key). Optional: `AI_MODEL`.

See also `examples/02-ai-skills-install-and-run.yml`.

### GitHub Copilot

```yaml
# .github/ai-skills.yml
tools:
  - github-copilot
scope: repo
skills:
  - name: code-review-backend
    on: [pull_request.opened, pull_request.synchronize]
    autonomy: observe
    max_iterations: 15

  - name: pr-description-generator
    on: [pull_request.opened]
    autonomy: suggest
```

Required settings: `AI_SKILLS_URL`, `AI_GATEWAY_API_KEY` (fine-grained user PAT with Copilot Requests). `AI_GATEWAY_URL` is unused.

See also `examples/04-ai-skills-copilot-uc2.yml`.

### pi

pi routes model calls through the configured gateway. Print mode has no budget or iteration cap.

The action image pins both `@earendil-works/pi-coding-agent` (currently `0.84.1`) and `pi-provider-litellm` (currently `2.0.5`). Pi loads the provider from the image instead of downloading it at runtime. Bump both packages together because provider `2.0.5` requires pi `>= 0.81.0`.

```yaml
# .github/ai-skills.yml
tools:
  - pi # skills install to .agents/skills/ via agent-manager's agents provisioner
scope: repo
skills:
  - name: code-review-backend
    on: [pull_request.opened, pull_request.synchronize]
    autonomy: observe
    model: claude-sonnet-4-6

  - name: pr-description-generator
    on: [pull_request.opened]
    autonomy: suggest
    model: gpt-4o
```

Required settings: `AI_SKILLS_URL`, `AI_GATEWAY_URL`, `AI_GATEWAY_API_KEY` (gateway API key). Optional: `AI_MODEL` or per-skill `model:`. Prefer pinning `agent-manager-ref` to a release that includes the `agents` provisioner (for example `0.17.0`). Consumer config uses `tools: [pi]`; the dispatcher passes agent-manager's `agents` provisioner so skills land in `.agents/skills/`.

See also `examples/04-ai-skills-pi.yml`.

### Mixing a gateway harness with Copilot

Keep the gateway API key in `AI_GATEWAY_API_KEY`, set `AI_GATEWAY_URL`, and add `COPILOT_GITHUB_TOKEN` as the Copilot PAT override. Uncomment `copilot-token` in the workflow. Per-skill `tool:` selects the harness.

See also `examples/03b-ai-skills-mixed-tools.yml`.

## Inputs

| Name                  | Required | Default                 | Description                                                              |
| --------------------- | -------- | ----------------------- | ------------------------------------------------------------------------ |
| `config-path`         | no       | `.github/ai-skills.yml` | Path to the skill manifest in your repo.                                 |
| `bundle-base-url`     | yes      | —                       | Skill bundle base URL.                                                   |
| `bundle-access-token` | no       | —                       | Bearer token for authenticated bundle servers (`AGENTMAN_ACCESS_TOKEN`). |
| `agent-manager-ref`   | no       | `latest`                | npm version tag for `@ai-agent-manager/cli`.                             |
| `gateway-base-url`    | no       | —                       | Shared AI gateway URL (Claude Code + pi).                                |
| `gateway-api-key`     | no       | —                       | Shared auth hook (gateway API key or Copilot PAT).                       |
| `default-model`       | no       | —                       | Default model for Claude Code / pi; prefer per-skill `model:`.           |
| `github-token`        | yes      | —                       | Token used to post PR comments and edit PR descriptions.                 |
| `copilot-token`       | no       | —                       | Optional Copilot PAT override when mixing gateway + Copilot.             |

### Migrating to v2

Version 2 is a direct configuration break. It supports only `gateway-base-url`, `gateway-api-key`, and `default-model` for model access. The v1 `anthropic-*`, `litellm-*`, and `pi-model` inputs are not accepted and have no compatibility aliases in v2. Workflows that still use the v1 input model must remain pinned to v1 until they migrate.

### Authenticated bundle servers

If your bundle server's discovery document declares `auth.required`, set `bundle-access-token` to a valid bearer token (e.g. from a repo or environment secret, or minted via a client-credentials flow in an earlier workflow step). The runner cannot complete agent-manager's interactive browser login, so without a token the install step fails.

The GitHub Environment can have any name. If its secret uses agent-manager's standard `AGENTMAN_ACCESS_TOKEN` name, map that secret to the action input explicitly:

```yaml
with:
  bundle-base-url: https://bootstrap.example.com
  bundle-access-token: ${{ secrets.AGENTMAN_ACCESS_TOKEN }}
```

The action passes this value to the agent-manager CLI as `AGENTMAN_ACCESS_TOKEN`; the secret does not need to be renamed.

## Skill manifest reference

Each skill in `ai-skills.yml` accepts:

| Field            | Required | Description                                                                                                              |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `name`           | yes      | Skill identifier as published by agent-manager.                                                                          |
| `on`             | yes      | List of triggers. Supported: `pull_request.opened`, `pull_request.synchronize`, `issue_comment.created`.                 |
| `autonomy`       | no       | `observe` (default) posts a PR comment. `suggest` updates the PR description. `act` commits changes to the PR branch.    |
| `tool`           | no       | Per-skill harness: `claude-code`, `github-copilot`, or `pi`. If omitted, the first entry from top-level `tools` is used. |
| `model`          | no       | Model ID override (especially for pi). Overrides `default-model`.                                                        |
| `max_budget_usd` | no       | Claude Code budget cap in USD. Defaults to `5` for Claude skills. Unused by pi (print mode has no cap).                  |
| `max_iterations` | no       | GitHub Copilot iteration cap. Defaults to `10` for Copilot skills.                                                       |

## Documentation

- [Releasing](docs/releasing.md) — how to publish a new version
- [CI validation](docs/ci.md) — what the CI pipeline checks
- [Branch protection](docs/branch-protection.md) — recommended repository settings

## Development

```bash
npm ci
npm run validate    # typecheck + test + build + lint
--------------------
npm run test
npm run typecheck
npm run build       # bundle into dist/index.js with ncc
npm run lint
```

## License

Apache-2.0
