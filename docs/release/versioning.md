# Pico versioning

This document is the central checklist for version bumps in Pico.

## Current version

```text
0.1.7
```

## Version locations

When the Pico version changes, update all version-bearing files in the same commit.

| Path | Field / value | Purpose | Required for release |
|---|---|---|---|
| `package.json` | `version` | Root workspace/package version | Yes |
| `apps/core/package.json` | `version` | Pico Core service package version | Yes |
| `apps/web/package.json` | `version` | Web client package version | Yes |
| `packages/protocol/package.json` | `version` | Shared protocol package version | Yes |
| `packages/sync/package.json` | `version` | Sync helper package version | Yes |
| `pico_core/config.yaml` | `version` | Active Home Assistant add-on version shown by HA | Yes |
| `README.md` | Current version text | Non-technical documentation | Yes |
| `ReadmeTech.md` | Current version and Home Assistant add-on tag/version text | Technical documentation | Yes |
| `pico_core/CHANGELOG.md` | version heading | Home Assistant-facing update notes | Yes |

## Active Home Assistant add-on path

The active Home Assistant add-on metadata lives in:

```text
pico_core/config.yaml
```

`pico_core/` is the single source of truth for the Home Assistant add-on repository metadata. Historical add-on drafts must not be kept as live `config.yaml` files with the same slug, because that creates versioning and automation ambiguity.

## README split

The repository has two root README files:

```text
README.md
ReadmeTech.md
```

`README.md` is the non-technical project introduction.

`ReadmeTech.md` is the full technical README. It must contain all information from `README.md` and may add additional technical detail.

Documentation consistency rules are documented in:

```text
docs/release/documentation-consistency.md
```

## Version consistency gate

The release gate includes:

```bash
pnpm version:check
```

This check compares the root package version with package metadata, Pico Home Core runtime version constants, Home Assistant add-on metadata, README current-version blocks, the latest add-on changelog heading, and current protocol compatibility examples.

The CI workflow does not carry a hardcoded version number. Semver container tags are derived from pushed Git tags such as `v0.1.7`, so `.github/workflows/ci.yml` is not a version-bearing file.

Tag builds run `scripts/check-release-tag.mjs` before Docker image metadata is generated. A tag build must use the exact Git tag `v${package.json.version}`; for example, package version `0.1.7` must be released from Git tag `v0.1.7`.

## Container image tags

`pico_core/config.yaml` stores the image name without a literal tag:

```text
ghcr.io/riederch/pico/core
```

The versioned release artifact for add-on version `0.1.7` is the matching semver image tag:

```text
ghcr.io/riederch/pico/core:0.1.7
```

The CI workflow publishes different tag classes for different events:

| Event | Expected GHCR tags |
|---|---|
| Push to `main` | `main` and `sha-*` tags only |
| Push to `v*` tag | Git ref tag, semver version tag and `sha-*` tag |
| Pull request | Build only; no push |

The Home Assistant add-on versioned image tag must be created by pushing the matching Git tag. A plain docs or code commit to `main` must not mutate an existing semver image tag.

## Multi-arch smoke tests

The CI workflow builds and publishes a multi-arch image for `linux/amd64` and `linux/arm64`.

Before publishing, CI builds local smoke-test images for both `linux/amd64` and `linux/arm64`. The `linux/amd64` image runs natively on the GitHub-hosted runner. The `linux/arm64` image runs through QEMU and must pass the same `/health` and dashboard-shell smoke checks. Direct-port smoke tests must choose an explicit `PICO_FOUNDATION_ACCESS_MODE`; the intentionally unprotected smoke uses `unsafe-trusted-local`.

Both local smoke-test images also run with a disposable `/data/options.json` containing `pico_foundation_token` and direct token mode. Those checks verify that direct API access returns `401` without the token and succeeds with the configured bearer token.

This does not replace real Home Assistant installation testing on arm64 hardware, but it prevents publishing an arm64 image that cannot boot far enough to serve the current Foundation diagnostics surface in CI.

## Migration and backup rule

Database migration safety rules are documented in:

```text
docs/release/backup-before-migration.md
```

Before a release with backup-requiring migrations is tagged, the release must document affected data, backup creation, restore expectations and the missing-backup failure behaviour.

## Release bump procedure

1. Choose the next semantic version, for example `0.1.7`.
2. Update every location listed in the table above.
3. Check whether the release contains backup-requiring database migrations. If yes, apply the backup-before-migration release rule.
4. Run the release gates locally:

   ```bash
   pnpm release:verify
   ```

5. Commit all version changes together.
6. Push to `main` and confirm the CI workflow is green. The `main` build publishes only mutable `main` and immutable `sha-*` image tags.
7. Create and push the matching Git tag. The tag build publishes the versioned image tag:

   ```bash
   git tag v0.1.7
   git push origin v0.1.7
   ```

## Home Assistant check after release

After the repository and container tag are updated, refresh Home Assistant's add-on repository cache:

```bash
ha supervisor reload
```

Then reopen the add-on store or restart Home Assistant if the UI still shows stale metadata.
