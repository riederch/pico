# Pico versioning

This document is the central checklist for version bumps in Pico.

## Current version

```text
0.1.9
```

## Version locations

When the Pico version changes, update all version-bearing files in the same commit.

| Path | Field / value | Purpose | Required for release |
|---|---|---|---|
| `package.json` | `version` | Root workspace/package version | Yes |
| `apps/core/package.json` | `version` | Pico Core service package version | Yes |
| `apps/vault-daemon/package.json` | `version` | Vault daemon package version | Yes |
| `apps/web/package.json` | `version` | Web client package version | Yes |
| `packages/identity/package.json` | `version` | Identity package version | Yes |
| `packages/protocol/package.json` | `version` | Shared protocol package version | Yes |
| `packages/sync/package.json` | `version` | Sync helper package version | Yes |
| `packages/vault/package.json` | `version` | Vault package version | Yes |
| `apps/core/src/app.ts` | `SERVICE_VERSION` | Version served by the Foundation API | Yes |
| `apps/vault-daemon/src/daemon.ts` | `DAEMON_VERSION` | Version reported by the Vault daemon | Yes |
| `pico_core/config.yaml` | `version` | Active Home Assistant add-on version shown by HA | Yes |
| `README.md` | Current version text | Non-technical documentation | Yes |
| `ReadmeTech.md` | Current version and Home Assistant add-on tag/version text | Technical documentation | Yes |
| `pico_core/README.md` | Current version text | Add-on documentation | Yes |
| `pico_core/CHANGELOG.md` | version heading and image tag | Home Assistant-facing update notes | Yes |
| `docs/release/versioning.md` | every version reference | This checklist | Yes |

`scripts/check-version.mjs` enforces this table. If a version-bearing location
is added, add it there rather than relying on this list being read.

## Protocol version is a separate axis

The wire-contract version lives in `packages/protocol/src/index.ts` as
`picoProtocolVersion` and is deliberately **not** bumped with the release.

A packaging fix, a documentation release or a Home Assistant permission change
moves the product version without changing anything a peer can observe on the
wire. Advertising a new protocol version for one of those tells a consumer that
something changed when nothing did. ADR 0025 forbids the opposite error —
hiding a breaking communication change behind an unchanged protocol version —
and the number is only worth reading if both directions hold.

Raise `picoProtocolVersion` when wire semantics change: canonical bytes,
signature inputs, record shapes, envelope or claim semantics, or the meaning of
a capability. Do not raise it for a release bump.

Everything that states a compatibility claim — the conformance fixtures under
`docs/protocol/fixtures`, `docs/protocol/public-surfaces.md`,
`docs/protocol/compatibility-levels.md` and the ADR 0025 example — is checked
against `picoProtocolVersion`, not against the release version.

## Active Home Assistant add-on path

The active Home Assistant add-on metadata lives in:

```text
pico_core/config.yaml
```

`pico_core/` is the single source of truth for the Home Assistant add-on repository metadata. Historical add-on drafts must not be kept as live `config.yaml` files with the same slug, because that creates versioning and automation ambiguity.

The options/schema contract is enforced by the release gate:

```bash
pnpm addon:check
```

It rejects a `null` default in `options`, an option without a `schema` entry,
and a required `schema` entry without a default. The first of those once
shipped and stopped the add-on from starting on a real install: the Supervisor
reads a `null` default as a missing value and refuses the add-on even when the
schema marks the option optional. An optional option with no meaningful default
belongs in `schema` alone. The container smoke tests cannot catch this, because
they mount a finished `/data/options.json` and never run Supervisor validation.

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

The CI workflow does not carry a hardcoded version number. Semver container tags are derived from pushed Git tags such as `v0.1.9`, so `.github/workflows/ci.yml` is not a version-bearing file.

Tag builds run `scripts/check-release-tag.mjs` before Docker image metadata is generated. A tag build must use the exact Git tag `v${package.json.version}`; for example, package version `0.1.9` must be released from Git tag `v0.1.9`.

## Container image tags

`pico_core/config.yaml` stores the image name without a literal tag:

```text
ghcr.io/riederch/pico/core
```

The versioned release artifact for add-on version `0.1.9` is the matching semver image tag:

```text
ghcr.io/riederch/pico/core:0.1.9
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

Before publishing, CI builds local smoke-test images for both `linux/amd64` and `linux/arm64`. The `linux/amd64` image runs natively on the GitHub-hosted runner. The `linux/arm64` image runs through QEMU and must pass the same `/health` and dashboard-shell smoke checks. Direct-port smoke tests use `PICO_FOUNDATION_ACCESS_MODE=direct-token` with disposable tokens; there is no tokenless non-loopback smoke path.

Both local smoke-test images also run with a disposable `/data/options.json` containing `pico_foundation_token` and direct token mode. Those checks verify that direct API access returns `401` without the token and succeeds with the configured bearer token.

This does not replace real Home Assistant installation testing on arm64 hardware, but it prevents publishing an arm64 image that cannot boot far enough to serve the current Foundation diagnostics surface in CI.

## Migration and backup rule

Database migration safety rules are documented in:

```text
docs/release/backup-before-migration.md
```

Before a release with backup-requiring migrations is tagged, the release must document affected data, backup creation, restore expectations and the missing-backup failure behaviour.

## Release bump procedure

1. Choose the next semantic version, for example `0.1.9`.
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
   git tag v0.1.9
   git push origin v0.1.9
   ```

## Upgrade contract

What the release must guarantee for an already-deployed instance — surviving
state, change classes, image verification before touching Home Assistant, and
the honest rollback limits — is in:

```text
docs/release/upgrade-contract.md
```

Steps 6 and 7 above publish different image tag classes, and only the tag build
publishes the semver tag the add-on pulls. Confirm the image exists before
refreshing Home Assistant; the upgrade contract has the command.

## Home Assistant check after release

After the repository and container tag are updated, refresh Home Assistant's add-on repository cache:

```bash
ha supervisor reload
```

Then reopen the add-on store or restart Home Assistant if the UI still shows stale metadata.
