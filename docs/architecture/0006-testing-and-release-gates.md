# Testing and release gates

## Status

Accepted for the foundation phase.

Pico must treat automated tests as release blockers. A broken release must be stopped before it reaches Home Assistant servers, clients, or update channels.

## Release rule

No green pipeline, no release.

A release build must pass:

- TypeScript type checking
- unit tests
- integration tests
- package build
- container build
- container smoke test

## Current CI gates

The CI workflow currently runs:

```text
pnpm release:verify
  -> pnpm check
  -> pnpm test
  -> pnpm build
```

After that, the pipeline builds the Pico Core container and starts it locally. The release image is only pushed after the container health endpoint responds successfully.

## Current test coverage areas

| Area | Tests |
| --- | --- |
| sync primitives | LamportClock and VersionVector behavior |
| protocol | event, avatar and tool payload type smoke tests |
| core HTTP API | health endpoint, invalid event rejection, event creation/listing |
| persistence | Lamport continuation after core restart |
| container | boot and `/health` smoke test |

## Required future gates

Before automatic updates are enabled, add gates for:

- database migrations
- backup and restore flow
- update rollback
- protocol compatibility checks
- policy engine decisions
- permission escalation attempts
- encrypted export/import
- serverless mode
- Home Assistant add-on startup
- client/core version negotiation

## Test categories

### Unit tests

Small deterministic tests for pure logic.

Examples:

- Lamport clocks
- version vectors
- policy decisions
- relationship permission calculation
- privacy filter decisions

### Integration tests

Tests that run a real Pico Core app with a temporary database.

Examples:

- event creation
- event listing
- device registration
- migration behavior
- update metadata

### Security and policy tests

Tests that must block release if privacy or consent rules regress.

Examples:

- stranger Pico cannot access private data
- partner Pico cannot cross private zones
- parent Pico cannot read protected child domains without policy reason
- server owner cannot decrypt another person's personal domain
- user export works without family server

### End-to-end smoke tests

Minimal boot tests for deployable artifacts.

Examples:

- container starts
- `/health` responds
- future `/api/system/version` responds
- Home Assistant add-on starts

## Design rule

Tests are part of the safety model. A release that changes privacy, identity, update, or policy behavior must include tests proving the intended behavior.
