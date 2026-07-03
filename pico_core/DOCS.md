# Pico Core add-on documentation

## Current status

Pico Core is a foundation add-on, not a production-ready Home Assistant assistant.

The current add-on has no authentication model, no Home Assistant entity integration, no ingress panel, no policy engine and no protected personal data domains. Port `3100` is currently a development interface for a trusted local test environment.

## Installation

1. Add this repository as a Home Assistant add-on repository.
2. Install the `Pico Core` add-on.
3. Start the add-on.
4. Call the health endpoint. A real web UI does not exist yet.

## Ports

| Port | Purpose |
| --- | --- |
| `3100/tcp` | Pico Core HTTP API and WebSocket endpoint |

The foundation add-on currently exposes port `3100` as a fixed port. A configurable runtime port can be added later, but is not active in the current add-on metadata.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `/health` | Add-on health check |
| `/api/system/version` | Service and protocol version information |
| `/api/system/status` | Diagnostic service and database migration status |
| `/api/events` | Development event list and limited event creation |
| `/ws` | Realtime event stream |

The generic event API currently accepts only foundation-safe event types. Policy, confirmation, executor and audit event types are reserved for later dedicated write paths.

## Add-on image assets

Home Assistant add-on presentation expects PNG image assets in the add-on directory:

| Path | Purpose | Required format |
| --- | --- | --- |
| `pico_core/icon.png` | square add-on icon | PNG, 1:1 aspect ratio, recommended 128x128px |
| `pico_core/logo.png` | wide add-on logo | PNG, recommended around 250x100px |

The repository currently also contains SVG source assets:

```text
pico_core/icon.svg
pico_core/logo.svg
```

If Home Assistant still shows the default or an old add-on image, verify that `icon.png` and `logo.png` exist in `pico_core/`, then reload the Home Assistant Supervisor repository cache.

## Persistent data

Pico Core stores its SQLite database in the add-on persistent data directory:

```text
/data/pico.sqlite
```

This directory is managed by Home Assistant add-on storage.

The current foundation event store is not a production memory, location history, private context or Home Assistant control data store.

## Options

The current foundation add-on does not expose user-configurable options yet.

Planned future options may include:

| Option | Purpose |
| --- | --- |
| `pico_port` | Runtime port selection, if the add-on entrypoint is changed to apply it safely. |

## Update behavior

Updates are delivered through the normal Home Assistant add-on update flow.

The add-on version in `config.yaml` must match the published container image tag.

Before production use, Pico needs migration tests, backup-before-migration, and rollback documentation.

## Current limitations

- No Home Assistant entity integration yet.
- No ingress panel yet.
- No authentication model yet.
- No authorization model yet.
- No policy engine yet.
- No tool executor yet.
- No protected personal data domains yet.
- No production memory model yet.
- No backup-before-migration flow yet.
