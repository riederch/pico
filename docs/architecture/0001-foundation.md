# Pico foundation

## Status

Accepted for the foundation phase.

## Current scope

The first implementation step creates a small monorepo with a shared protocol package, sync primitives, and a minimal core service.

## Core ideas

- Events are append-only records.
- Each event has a Lamport timestamp.
- Clients and the core communicate through a shared TypeScript protocol.
- The core stores events and broadcasts newly created events over WebSocket.
- Policy, tools, avatar rendering, Home Assistant packaging, mobile media access, and voice are later layers.

## Repository layout

```text
apps/core          Fastify service with SQLite event store
apps/web           placeholder for the future PWA/client
packages/protocol  shared event, device, avatar and tool types
packages/sync      Lamport clock and version-vector helpers
```

## Next technical step

Add a small client that connects to `/ws`, posts `message.created` events to `/api/events`, and renders `avatar.state_changed` events.
