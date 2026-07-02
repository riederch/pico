# 0012 - Roadmap from Foundation to Companion

## Status

Accepted for planning.

## Context

Pico needs a controlled path from a minimal technical foundation to a usable personal companion.

The roadmap should avoid building a visually impressive assistant on top of unsafe or untestable foundations.

## Phase 1 - Foundation

Goal: establish the release point, event model, sync primitives, tests, and Home Assistant package path.

Includes:

- monorepo
- shared protocol package
- sync package
- core service
- SQLite event store
- Lamport timestamps
- WebSocket event stream
- CI release gates
- container build
- Home Assistant add-on metadata
- GHCR image publishing

Exit criteria:

- CI green
- container smoke test green
- add-on installable through Home Assistant
- `/health` reachable
- event creation and listing works

## Phase 2 - Versioning, migrations and update safety

Goal: make updates safe before real user data matters.

Includes:

- `/api/system/version`
- protocol version metadata
- migration table
- migration tests
- backup-before-migration
- restore test
- update audit event
- documented rollback path

Exit criteria:

- an update can be applied safely
- failed update can be diagnosed
- data migrations are tested

## Phase 3 - First real client

Goal: create a usable basic interface.

Includes:

- web client connected to `/ws`
- message creation
- event rendering
- avatar state rendering
- visible connection state
- local configuration screen

Exit criteria:

- user can chat with Pico through a client
- client reflects core state

## Phase 4 - Policy and tool execution

Goal: allow Pico to act without giving the LLM uncontrolled authority.

Includes:

- tool registry
- risk classes
- policy engine
- confirmation flow
- executor interface
- audit trail
- first read-only tools
- first controlled write tools

Exit criteria:

- tool calls are policy-gated
- risky actions require confirmation
- audit entries are created

## Phase 5 - Memory and personal context

Goal: allow Pico to remember and retrieve user-specific knowledge safely.

Includes:

- personal memory store
- RAG integration
- privacy domains
- retention rules
- export/import
- deletion workflow

Exit criteria:

- memory is useful
- memory is inspectable
- memory is deleteable
- memory obeys privacy domains

## Phase 6 - Companion UX

Goal: make Pico feel present without compromising control.

Includes:

- avatar states
- voice channel
- mobile surface
- desktop surface
- Home Assistant surface
- notification behavior
- routine support

Exit criteria:

- Pico feels like a companion
- policy and audit remain visible
- avatar does not bypass authority boundaries

## Design rule

Pico should become more capable only after the safety, update, and audit foundations are strong enough to support that capability.
