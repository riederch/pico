# Pico versioning

This document is the central checklist for version bumps in Pico.

## Current version

```text
0.2.1
```

## Version locations

When the Pico version changes, update all version-bearing files in the same commit.

| Path | Field / value | Purpose | Required for release |
|---|---|---|---|
| `package.json` | `version` | Root workspace/package version | Yes |
| `apps/core/package.json` | `version` | Pico Core service package version | Yes |
| `apps/relay/package.json` | `version` | Pico Relay package version | Yes |
| `packages/link-relay-client/package.json` | `version` | Relay client package version | Yes |
| `apps/vault-daemon/package.json` | `version` | Vault daemon package version | Yes |
| `apps/web/package.json` | `version` | Web client package version | Yes |
| `packages/identity/package.json` | `version` | Identity package version | Yes |
| `packages/protocol/package.json` | `version` | Shared protocol package version | Yes |
| `packages/sync/package.json` | `version` | Sync helper package version | Yes |
| `packages/vault/package.json` | `version` | Vault package version | Yes |
| `apps/core/src/app.ts` | `SERVICE_VERSION` | Version served by the Foundation API | Yes |
| `apps/vault-daemon/src/daemon.ts` | `DAEMON_VERSION` | Version reported by the Vault daemon | Yes |
| `pico_home/config.yaml` | `version` | Active Home Assistant add-on version shown by HA | Yes |
| `README.md` | Current version text | Non-technical documentation | Yes |
| `ReadmeTech.md` | Current version and Home Assistant add-on tag/version text | Technical documentation | Yes |
| `pico_home/README.md` | Current version text | Add-on documentation | Yes |
| `pico_home/CHANGELOG.md` | version heading and image tag | Home Assistant-facing update notes | Yes |
| `docs/release/versioning.md` | every version reference | This checklist | Yes |

`scripts/check-version.mjs` enforces this table. If a version-bearing location
is added, add it there rather than relying on this list being read.

## One version, three deliverables

ADR 0153 PK4. A tag publishes all three at the same number:

```text
v0.2.1
├── ghcr.io/riederch/pico/home:0.2.1     Pico Home, the Home Assistant add-on
├── ghcr.io/riederch/pico/relay:0.2.1    Pico Relay, a standalone container
└── pico-companion_0.2.1_amd64.deb       Pico Client, attached to the release
```

The cost is recorded rather than discovered: a client-only fix raises the
Home's version too, and Home Assistant offers an update containing nothing for
that install. The alternative - three version lines and a hand-kept
interoperability matrix - buys accuracy in a number nobody interoperates on,
because the wire contract is `picoProtocolVersion` and always was.

## Format freeze: has a kept identity been founded?

```text
Nein. Stand 2026-08-09, erklaert vom Nutzer.
```

**As long as this says no, a surface that carries no compatibility claim may
change its bytes under its existing version name** (ADR 0134). No v2, no
deprecation branch: the format is corrected and the old shape ceases to exist.

The freeze is *not* a launch, a release tag or an announcement. It is the first
identity someone intends to keep. A Recovery Card is printed on paper and a
founded Home holds signed records; both outlive the decisions that produced
them, and the moment that binds is the moment the first such artifact stops
being disposable. That can be your own first real Pico, long before anything is
public.

No code can detect that intent, so it is declared here rather than derived.
When it changes, change this line first — everything else follows from it.

An in-place revision still owes four things, whatever this line says:
regenerated vectors under the same name; ADR status notes rather than rewritten
bodies (ADR 0128); a statement of what becomes unreadable, since development
artifacts are disposable by declaration and not by assumption; and
applicability only where `docs/protocol/public-surfaces.md` and
`docs/protocol/compatibility-levels.md` record no claim.

After the freeze this section is spent, and ordinary versioning applies.

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
pico_home/config.yaml
```

`pico_home/` is the single source of truth for the Home Assistant add-on repository metadata. Historical add-on drafts must not be kept as live `config.yaml` files with the same slug, because that creates versioning and automation ambiguity.

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

The CI workflow does not carry a hardcoded version number. Semver container tags are derived from pushed Git tags such as `v0.2.0`, so `.github/workflows/ci.yml` is not a version-bearing file.

Tag builds run `scripts/check-release-tag.mjs` before Docker image metadata is generated. A tag build must use the exact Git tag `v${package.json.version}`; for example, package version `0.2.1` must be released from Git tag `v0.2.1`.

## Container image tags

`pico_home/config.yaml` stores the image name without a literal tag:

```text
ghcr.io/riederch/pico/home
```

The versioned release artifact for add-on version `0.2.1` is the matching semver image tag:

```text
ghcr.io/riederch/pico/home:0.2.1
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

1. Choose the next semantic version, for example `0.2.1`.
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
   git tag v0.2.1
   git push origin v0.2.1
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
