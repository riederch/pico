# Pico

Local-first assistant prototype.

## Structure

- `apps/core` - Fastify backend service with SQLite event storage
- `apps/web` - web client placeholder
- `packages/protocol` - shared event, device, avatar and tool types
- `packages/sync` - Lamport clock and version-vector helpers
- `docs/architecture` - architecture notes

## First milestone

Store events with Lamport timestamps and broadcast them to connected clients.

## Local development

```bash
pnpm install
pnpm build
pnpm dev:core
```

The core listens on port `3100` by default.

```bash
curl http://localhost:3100/health
```

Create a test event:

```bash
curl -X POST http://localhost:3100/api/events \
  -H 'content-type: application/json' \
  -d '{"deviceId":"desktop-dev","type":"message.created","payload":{"role":"user","text":"Hallo Pico"}}'
```

List events:

```bash
curl http://localhost:3100/api/events
```

## Next step

Build the first real web client: connect to `/ws`, post `message.created` events, and render `avatar.state_changed` events.
