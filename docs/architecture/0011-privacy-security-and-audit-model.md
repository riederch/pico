# 0011 - Privacy, Security and Audit Model

## Status

Accepted for the foundation phase as a concept note.

## Context

Pico is intended to hold sensitive personal context and eventually operate across devices, shared family infrastructure, Home Assistant, local files, and external services.

The project must therefore treat privacy and security as architectural requirements, not later UI features.

## Privacy domains

Pico should separate data into explicit domains:

- personal
- device-local
- shared-pair
- shared-family
- work-scope
- server-public
- system-operational

Domains define who can read, write, sync, export, or delete data.

## User sovereignty

A user must retain control over their Pico identity and personal data.

Loss of a shared server may reduce convenience, but must not destroy the user's identity or make private data readable by the server owner.

## Data minimization

Pico should not sync or expose data just because it exists.

Data movement should be explicit, scoped, and auditable.

## Security model

The system should assume:

- devices can be lost
- servers can become unavailable
- relationships can change
- permissions can be revoked
- automation can behave incorrectly
- LLM output can be wrong

Security-sensitive actions need explicit policy checks and audit records.

## Audit log

Pico should maintain an append-only audit trail for important events:

- tool requests
- policy decisions
- user confirmations
- permission changes
- trust relationship changes
- update events
- migration events
- failed or blocked actions
- data export/import events

Audit entries should be structured and queryable.

## Abuse resistance

The architecture should avoid creating surveillance tools disguised as assistance.

Particularly sensitive areas include:

- partner relationships
- parent-child relationships
- shared household devices
- location data
- message content
- calendars and routines
- camera, microphone, and presence sensors

## Design rule

Privacy is not a setting layered on top of Pico. Privacy domains, policy decisions, and auditability are part of the core architecture.
