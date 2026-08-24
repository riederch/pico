# Testing and release gates

## Status

Accepted for the foundation phase.

**Status note 2026-08-24: green can also mean "did not look", and four checks
said it.** The rule below is "no green pipeline, no release", which puts the
whole weight on what a green line means. Every check in `scripts/` was run
against a mirror of this repository's directory shape holding no files at all.
Four reported success: `check-link-seal.mjs` ("0 files; no mailbox address
reaches a log, an error or a URL"), `check-fingerprint-display.mjs` ("0 source
files ... one rule for showing a key to a person"), `check-instant-rules.mjs`
("0 source files ... no instant reaching a person raw") and
`check-runtime-floor.mjs`, whose passing line counted the length of its own
hand-written root list rather than anything it had read - "6 packages carry no
ICU dependency", six packages it had never opened. Each is a sentence about
the whole product, said truthfully about nothing.

All four now count **per root** and refuse a zero, because a single total
still hides the case that actually happens: one root moves, the others stay
full. The class is held by `scripts/check-vacuous-gates.mjs`, which runs every
other check against that empty mirror and refuses one that calls nothing
clean. It found the fourth on its first run. The mirror is derived from the
tree rather than written down, a skip is read off the word a check prints
rather than kept as a list of names, and what it cannot tell apart is stated
in it: a check that crashes on a missing file fails closed, which is the right
direction, and this cannot distinguish that from a guard.

The body below is kept rather than rewritten (ADR 0128). Its "Current CI
gates" section describes a three-step `release:verify`; that chain is
thirty-three steps now, and the count belongs in `progress.md` rather than
here.

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
