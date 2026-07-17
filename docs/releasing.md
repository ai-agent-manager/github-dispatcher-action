# Releases

This repo includes a manual GitHub Actions release workflow at `.github/workflows/release.yml`.

## Publishing a release

1. Open the **Release** workflow in GitHub Actions.
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
