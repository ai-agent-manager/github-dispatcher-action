# Agent Manager - AI Skills Dispatcher GitHub Action

A GitHub Action that uses Agent Manager to install and run AI agent skills within your GitHub Workflows.

The action reads a skill manifest from your repo, installs the listed skills via [agent-manager](https://github.com/ai-agent-manager/agentman), filters them by the current event, and runs each matched skill through the configured AI tool in headless mode.

Currently supported tools:
- Claude Code (`claude-code`)
- GitHub Copilot CLI (`github-copilot`)

Output is posted as a PR comment, used to update the PR description, or committed back to the PR branch depending on skill autonomy.

GitHub Copilot limitation:
- The only Copilot-specific requirement is `copilot-token`: it must be a fine-grained user PAT with Copilot access (not the default `GITHUB_TOKEN`).

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
    max_budget_usd: 5 # optional — defaults to $5

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
        if: github.event_name == 'issue_comment'
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

| Name                   | Required | Default                 | Description                                                                                                     |
| ---------------------- | -------- | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `config-path`          | no       | `.github/ai-skills.yml` | Path to the skill manifest in your repo.                                                                        |
| `bundle-base-url`      | yes      | —                       | Skill Bundle base URL. Accessible location where skill bundles are hosted (e.g. https://bootstrap.example.com). |
| `anthropic-auth-token` | yes      | —                       | API token used to run skills via Claude Code.                                                                   |
| `anthropic-base-url`   | no       | _(Anthropic default)_   | Override the Anthropic API base URL — useful when routing through a proxy.                                      |
| `anthropic-model`      | no       | _(Claude Code default)_ | Override the default model.                                                                                     |
| `github-token`         | yes      | —                       | Token used to post PR comments and edit PR descriptions.                                                        |
| `copilot-token`        | no       | —                       | Fine-grained GitHub user PAT with Copilot access. Required for `github-copilot` skills; this is the only Copilot-specific limitation. |

## Skill manifest reference

Each skill in `ai-skills.yml` accepts:

| Field            | Required | Description                                                                                                                                                 |
| ---------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`           | yes      | Skill identifier as published by agent-manager.                                                                                                             |
| `on`             | yes      | List of triggers. Supported: `pull_request.opened`, `pull_request.synchronize`, `issue_comment.created`.                                                  |
| `autonomy`       | no       | `observe` (default) posts a PR comment. `suggest` updates the PR description. `act` commits changes to the PR branch.                                     |
| `tool`           | no       | Optional per-skill override (`claude-code` or `github-copilot`). If omitted, the first entry from top-level `tools` is used.                             |
| `max_budget_usd` | no       | Claude Code budget cap in USD. Defaults to `5` for Claude skills.
## Development

```bash
npm ci
npm run build       # bundle into dist/index.js with ncc
npm test
npm run lint
npm run validate    # typecheck + test + build + lint
```

## Releases

This repo includes a manual GitHub Actions release workflow at `.github/workflows/release.yml`.

To publish a release:

1. Open the `Release` workflow in GitHub Actions.
2. Run it against the `main` branch.
3. Select `major`, `minor`, or `patch`.

The workflow will:

1. Bump `package.json` and `package-lock.json` using `npm version --no-git-tag-version`.
2. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run lint`.
3. Commit the version bump back to `main`.
4. Create and push a matching `vX.Y.Z` git tag.
5. Create a GitHub Release from that tag with generated release notes.
6. Force-update the `latest` tag to the same release commit.
7. Force-update the matching major tag such as `v1` to the same release commit.

## CI validation

The repo includes `.github/workflows/ci.yml`, which runs on every push and pull request and executes `npm run validate`.

That validation command runs:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. `npm run lint`

## Main branch protection

The workflow files support branch protection, but GitHub branch protection itself must be configured in the repository settings.

Recommended settings for `main`:

1. Require a pull request before merging.
2. Require the `CI / Validate` status check to pass before merging.
3. Restrict direct pushes to `main`.
4. Allow only the GitHub Actions app or an explicit release automation bypass to update `main` for the release workflow if you want releases to commit the version bump directly.

Without that repository setting, the release workflow cannot guarantee that it is the only path allowed to push to `main`.

## License

Apache-2.0
