# Pico Core

![Pico Core icon](icon.png)

Pico Core is a local-first assistant core for Home Assistant.

This add-on currently provides the foundation service only:

- HTTP API on port `3100`
- WebSocket endpoint at `/ws`
- SQLite-backed append-only event log
- health endpoint at `/health`

## Visual identity

The add-on uses the simplified Pico companion icon:

```text
icon.png
icon.svg
```

The PNG is the Home Assistant-facing asset. The SVG is the editable source variant.

## Status

Foundation phase. Not production-ready yet.

The current release is intended to validate packaging, update flow, storage, and the first event protocol.
