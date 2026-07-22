# Agent Manager - AI Skills Dispatcher GitHub Action

A GitHub Action that uses Agent Manager to install and run AI agent skills within your GitHub Workflows.

The action reads a skill manifest from your repo, installs the listed skills via [agent-manager](https://github.com/ai-agent-manager/agentman), filters them by the current event, and runs each matched skill through the configured AI tool in headless mode.

Currently supported tools:

- Claude Code (`claude-code`)
- GitHub Copilot CLI (`github-copilot`)

Output is posted as a PR comment, used to update the PR description, or committed back to the PR branch depending on skill autonomy.

> [!WARNING]
> `copilot-token` must be a fine-grained GitHub user PAT with Copilot access. Classic tokens are not supported.

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

## Usage

Add `.github/ai-skills.yml` to your repo:

```yaml
tools:
  - github-copilot
scope: repo

skills:
  - name: code-review-backend
    on: [pull_request.opened, pull_request.synchronize]
    autonomy: observe # posts output as a PR comment
    max_iterations: 15 # optional — defaults to 10 for Copilot

  - name: pr-description-generator
    on: [pull_request.opened]
    autonomy: suggest # updates the PR description
```

Add `.github/workflows/ai-dispatcher.yml`:

```yaml
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
          bundle-base-url: ${{ vars.BUNDLE_BASE_URL }} # e.g. https://bootstrap.example.com
          github-token: ${{ secrets.GITHUB_TOKEN }}
          copilot-token: ${{ secrets.COPILOT_GITHUB_TOKEN }}

          # Optional Claude inputs (needed only for claude-code skills)
          anthropic-auth-token: ${{ secrets.ANTHROPIC_AUTH_TOKEN }}
```

See full consumer examples:

- `examples/04-ai-skills-copilot-uc2.yml`

## Inputs

| Name                   | Required | Default                 | Description                                                                                                                    |
| ---------------------- | -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `config-path`          | no       | `.github/ai-skills.yml` | Path to the skill manifest in your repo.                                                                                       |
| `bundle-base-url`      | yes      | —                       | Skill Bundle base URL. Accessible location where skill bundles are hosted (e.g. https://bootstrap.example.com).                |
| `bundle-access-token`  | no       | —                       | Bearer token for bundle servers that require authentication (passed to agent-manager as `AGENTMAN_ACCESS_TOKEN`).              |
| `anthropic-auth-token` | no       | —                       | Anthropic API token. Required only when using `claude-code` skills.                                                            |
| `anthropic-base-url`   | no       | _(Anthropic default)_   | Override the Anthropic API base URL — useful when routing through a proxy.                                                     |
| `anthropic-model`      | no       | _(Claude Code default)_ | Override the default model.                                                                                                    |
| `github-token`         | yes      | —                       | Token used to post PR comments and edit PR descriptions.                                                                       |
| `copilot-token`        | no       | —                       | Fine-grained GitHub user PAT with Copilot access only. Classic tokens are not supported. Required for `github-copilot` skills. |

### Authenticated bundle servers

If your bundle server's discovery document declares `auth.required`, set `bundle-access-token` to a valid bearer token (e.g. from a repo secret, or minted via a client-credentials flow in an earlier workflow step). The runner cannot complete agent-manager's interactive browser login, so without a token the install step fails.

```yaml
with:
  bundle-base-url: https://bootstrap.example.com
  bundle-access-token: ${{ secrets.BUNDLE_ACCESS_TOKEN }}
```

## Skill manifest reference

Each skill in `ai-skills.yml` accepts:

| Field            | Required | Description                                                                                                                  |
| ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `name`           | yes      | Skill identifier as published by agent-manager.                                                                              |
| `on`             | yes      | List of triggers. Supported: `pull_request.opened`, `pull_request.synchronize`, `issue_comment.created`.                     |
| `autonomy`       | no       | `observe` (default) posts a PR comment. `suggest` updates the PR description. `act` commits changes to the PR branch.        |
| `tool`           | no       | Optional per-skill override (`claude-code` or `github-copilot`). If omitted, the first entry from top-level `tools` is used. |
| `max_budget_usd` | no       | Claude Code budget cap in USD. Defaults to `5` for Claude skills.                                                            |
| `max_iterations` | no       | GitHub Copilot iteration cap. Defaults to `10` for Copilot skills.                                                           |

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
