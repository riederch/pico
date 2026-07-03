# 0012 - Roadmap from Foundation to Companion

## Status

Accepted for planning.

## Context

Pico needs a controlled path from a minimal technical foundation to a usable personal companion.

The roadmap should avoid building a visually impressive assistant on top of unsafe or untestable foundations.

The highest project risks are scope expansion, premature cryptography, ambiguous deletion semantics, and companion UX outrunning policy and audit foundations.

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

## Phase 3 - First real client and sync semantics

Goal: create a usable basic interface and define enough merge behavior before deeper offline editing.

Includes:

- web client connected to `/ws`
- message creation
- event rendering
- avatar state rendering
- visible connection state
- local configuration screen
- initial conflict policy for client-owned state
- explicit distinction between Lamport ordering and domain merge semantics
- Full Client versus Light Client role assumptions

Exit criteria:

- user can chat with Pico through a client
- client reflects core state
- basic settings have documented conflict behavior
- Light Clients are not treated as full knowledge owners

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

## Phase 5 - Memory, deletion and personal context

Goal: allow Pico to remember and retrieve user-specific knowledge safely.

This phase must not start with arbitrary sensitive payloads embedded directly in immutable replicated events.

Includes:

- personal memory store
- RAG integration
- privacy domains
- retention rules
- export/import
- deletion workflow
- payload references instead of embedded sensitive memory where practical
- tombstone semantics
- deletion-versus-update conflict behavior
- crypto-shredding evaluation for encrypted payloads

Exit criteria:

- memory is useful
- memory is inspectable
- memory is deleteable at the product semantics level
- memory obeys privacy domains
- audit records avoid leaking full sensitive payloads

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

## Later phase - encrypted multi-party sovereignty

Goal: implement stronger cryptographic privacy domains only after the product model, payload references, deletion semantics, and threat model are stable.

Includes, if still required:

- per-person identity material
- device keys
- encrypted payload domains
- group or relationship domains
- key rotation after revocation
- backup encryption
- recovery material
- relay-safe transport

Constraints:

- no custom cryptographic protocols
- use reviewed standards or primitives
- document threat model before implementation
- test hostile lockout and revocation scenarios

## Design rule

Pico should become more capable only after the safety, update, deletion, audit, and sovereignty foundations are strong enough to support that capability.
