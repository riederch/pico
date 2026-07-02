# Pico Core add-on documentation

## Installation

1. Add this repository as a Home Assistant add-on repository.
2. Install the `Pico Core` add-on.
3. Start the add-on.
4. Open the web UI or call the health endpoint.

## Ports

| Port | Purpose |
| --- | --- |
| `3100/tcp` | Pico Core HTTP API and WebSocket endpoint |

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `/health` | Add-on health check |
| `/api/events` | Event list and event creation |
| `/ws` | Realtime event stream |

## Persistent data

Pico Core stores its SQLite database in the add-on persistent data directory:

```text
/data/pico.sqlite
```

This directory is managed by Home Assistant add-on storage.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `pico_port` | `3100` | Planned runtime port option. The first foundation image currently uses port `3100`. |

## Update behavior

Updates are delivered through the normal Home Assistant add-on update flow.

The add-on version in `config.yaml` must match the published container image tag.

Before production use, Pico needs migration tests, backup-before-migration, and rollback documentation.

## Current limitations

- No Home Assistant entity integration yet.
- No ingress panel yet.
- No authentication model yet.
- No policy engine yet.
- No encrypted personal data domains yet.
