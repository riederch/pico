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
| `packages/protocol/package.json` | `version` | Shared protocol package version | Yes |
| `packages/sync/package.json` | `version` | Sync helper package version | Yes |
| `pico_core/config.yaml` | `version` | Active Home Assistant add-on version shown by HA | Yes |
| `apps/ha-addon/config.yaml` | `version` | Historical/internal add-on draft; keep aligned while it exists | Yes, or delete the draft |
| `.github/workflows/ci.yml` | `type=raw,value=<version>` | Default-branch GHCR container tag | Yes |
| `README.md` | Home Assistant add-on tag/version text | Human-facing documentation | Yes |

## Active Home Assistant add-on path

The active Home Assistant add-on metadata lives in:

```text
pico_core/config.yaml
```

The older draft under `apps/ha-addon/config.yaml` is historical/internal. While it remains in the repository, its `version` field must stay aligned with `pico_core/config.yaml` to avoid confusion for Home Assistant, Codex, and future automation.

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
