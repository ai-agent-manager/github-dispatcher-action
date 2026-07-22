# CI validation

The repo includes `.github/workflows/ci.yml`, which runs on every push and pull request and executes `npm run validate`.

That validation command runs:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. `npm run lint`

## Secret scan

`.github/workflows/secret-scan.yml` runs betterleaks:

- **Pull requests** scan only the PR's own commit range (`base..head`), mirroring the pre-push hook, so a finding on an unrelated branch cannot fail the PR.
- **Pushes to main** scan every ref in the repository — the global safety net that catches a leak pushed anywhere, including branches with no open PR.

Private extra rules can be supplied via the `BETTERLEAKS_CONFIG_TOML` repo secret without appearing in this public repo. Audited false positives are ignored via `.betterleaksignore`.
