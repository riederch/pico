# Home Assistant add-on release structure

## Status

Accepted for the foundation phase.

The Pico repository is also the first Home Assistant add-on repository.

## Repository layout

```text
repository.yaml
pico_core/
  config.yaml
  README.md
  DOCS.md
  CHANGELOG.md
```

The source code remains in the monorepo:

```text
apps/core
packages/protocol
packages/sync
docker/core.Dockerfile
```

## Add-on image

The add-on uses a prebuilt image:

```text
ghcr.io/riederch/pico/core
```

The CI pipeline builds and pushes a multi-architecture image for:

```text
linux/amd64
linux/arm64
```

These map to the first Home Assistant architectures:

```text
amd64
aarch64
```

## Version rule

The add-on `version` in `pico_core/config.yaml` must match the release image tag. The `image` value in `config.yaml` intentionally names the image without a literal tag; the versioned release artifact is the matching semver GHCR tag.

Example:

```yaml
version: "0.1.0"
image: ghcr.io/riederch/pico/core
```

Release tag:

```text
v0.1.0
```

Container tag:

```text
ghcr.io/riederch/pico/core:0.1.0
```

## Update flow

```text
update version in pico_core/config.yaml
update changelog
create git tag vX.Y.Z
CI verifies tests and builds
CI builds multi-arch container
CI pushes image to GHCR
Home Assistant detects the new add-on version
User updates through normal HA add-on flow
```

## Current add-on behavior

- exposes Pico Core on port 3100
- provides a web UI link to port 3100
- configures watchdog against `/health`
- stores data under `/data/pico.sqlite`

## Missing before production

- validate add-on installation in a real Home Assistant instance
- add `/api/system/version`
- add database migration table
- add backup-before-migration strategy
- add rollback documentation
- add optional ingress panel
- add authentication and HA API integration later

## Design rule

The HA add-on must update through Home Assistant's normal update mechanism. Pico must not bypass Home Assistant with an uncontrolled self-updater inside the add-on.
