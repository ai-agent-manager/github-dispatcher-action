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

### Finding disclosure policy

Secret-scan logs remain summary-only because workflow logs and artifacts from this public repository are visible to readers. Detailed findings are:

1. Fully redacted by betterleaks before matched secret values leave the scanner.
2. Written as SARIF.
3. Uploaded from main-branch push runs to GitHub Code Scanning, where the repository's security alert details are restricted to users with write, maintain, or admin access.

The workflow does not upload the report as an Actions artifact or print verbose finding metadata. It does not upload SARIF for pull request runs because GitHub displays Code Scanning PR annotations to anyone with repository read access.

The betterleaks container is pinned by version and digest so a mutable image cannot change detection or redaction behaviour without review.
