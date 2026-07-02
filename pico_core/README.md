# Pico Core

Pico Core is a local-first assistant core for Home Assistant.

This add-on currently provides the foundation service only:

- HTTP API on port `3100`
- WebSocket endpoint at `/ws`
- SQLite-backed append-only event log
- health endpoint at `/health`

## Status

Foundation phase. Not production-ready yet.

The current release is intended to validate packaging, update flow, storage, and the first event protocol.
