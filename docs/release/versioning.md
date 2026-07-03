# Pico versioning

This document is the central checklist for version bumps in Pico.

## Current version

```text
0.1.4
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
| `.github/workflows/ci.yml` | `type=raw,value=<version>` | Default-branch GHCR container tag | Yes |
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

## Release bump procedure

1. Choose the next semantic version, for example `0.1.5`.
2. Update every location listed in the table above.
3. Run the release gates locally:

   ```bash
   pnpm release:verify
   ```

4. Commit all version changes together.
5. Push to `main` and confirm the CI workflow builds and pushes the matching GHCR tag.
6. For a tagged release, create and push the matching Git tag:

   ```bash
   git tag v0.1.5
   git push origin v0.1.5
   ```

## Home Assistant check after release

After the repository and container tag are updated, refresh Home Assistant's add-on repository cache:

```bash
ha supervisor reload
```

Then reopen the add-on store or restart Home Assistant if the UI still shows stale metadata.
