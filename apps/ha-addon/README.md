# Pico Core Home Assistant add-on draft

This directory is a historical/internal Home Assistant add-on draft.

The active Home Assistant add-on metadata lives in:

```text
pico_core/
```

Use `pico_core/config.yaml`, `pico_core/DOCS.md`, and the assets in `pico_core/` as the source of truth for the current Home Assistant add-on.

## Current purpose

Pico Core is the local-first personal AI companion core for Home Assistant.

The foundation add-on provides:

- HTTP API on port `3100`
- WebSocket endpoint at `/ws`
- SQLite-backed append-only event storage
- health endpoint at `/health`
- Home Assistant add-on packaging and update flow validation

## Release model

The active add-on points to the container image built by the repository workflow:

```text
ghcr.io/riederch/pico/core
```

The add-on version in the active `pico_core/config.yaml` must match the published container image tag.

Version bump locations and release steps are documented in:

```text
docs/release/versioning.md
```

## Production status

Pico is still in the foundation phase and is not production-ready yet.

Before production use, the project still needs:

- authentication and authorization
- migration tests
- backup-before-migration
- rollback documentation
- policy engine implementation
- encrypted personal data domains
