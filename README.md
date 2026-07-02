# Pico

Local-first assistant prototype.

## Structure

- `apps/core` - backend service
- `apps/web` - web client
- `packages/protocol` - shared protocol types
- `packages/sync` - sync primitives

## First milestone

Store signed-style events with Lamport timestamps and broadcast them to connected clients.
