# Releases

This repo includes a manual GitHub Actions release workflow at `.github/workflows/release.yml`.

## Preparing a release

Repository rules require every change to `main` to pass through a pull request. Prepare the version before publishing:

1. Create a release branch from `main`.
2. Run `npm version major --no-git-tag-version`, replacing `major` with `minor` or `patch` as needed.
3. Open a pull request containing the `package.json` and `package-lock.json` changes.
4. Merge the pull request after all required checks pass.

## Publishing a release

1. Confirm `package.json` on `main` contains the version to publish.
2. Confirm the matching `vX.Y.Z` tag does not already exist.
3. Open the **Release** workflow in GitHub Actions.
4. Run it against the `main` branch.

The workflow will:

1. Read the version from `package.json`.
2. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run lint`.
3. Create and push a matching `vX.Y.Z` git tag for the current `main` commit.
4. Create a GitHub Release from that tag with generated release notes.
5. Force-update the `latest` tag to the same release commit.
6. Force-update the matching major tag such as `v2` to the same release commit.

## Major releases

A major version bump creates a new major release line. The publishing workflow moves `latest` and the new major tag to the release commit. Existing major tags do not move, so consumers pinned to the previous major version remain on that compatible release line.

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
