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

## Major releases

Selecting `major` creates a new major release line. The workflow moves `latest` and the new major tag to the release commit. Existing major tags do not move, so consumers pinned to the previous major version remain on that compatible release line.

Before publishing a major release:

1. Update README examples to use the new major tag.
2. Document breaking changes and the required migration steps.
3. Remind `@latest` consumers to pin their current major tag if they are not ready to migrate.

## Pinned harness CLIs

Dockerfile pins the tool CLIs installed into the action image. When bumping pi:

- `@earendil-works/pi-coding-agent` in the Dockerfile
- `pi-provider-litellm` in the Dockerfile
- the provider's image-local path in `src/tools/pi.ts`

must stay compatible (`pi-provider-litellm@2.3.0` requires pi `>= 0.81.0`). Update both in the same change and note the versions in the README pi section.
