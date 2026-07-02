# Pico Core Home Assistant add-on

This add-on runs Pico Core inside Home Assistant.

## Release model

The add-on points to the container image built by the repository workflow:

```text
ghcr.io/riederch/pico/core
```

For the first foundation phase the add-on should be updated through Home Assistant's normal add-on update flow. Fully unattended updates should stay opt-in and should be protected by health checks and rollback support.

## Runtime

Pico Core exposes:

- HTTP API on port `3100`
- WebSocket endpoint on `/ws`

## Persistent data

The core stores its SQLite database under `/data/pico.sqlite` inside the container image runtime model. In the Home Assistant add-on this must be mapped to add-on persistent storage before production use.
