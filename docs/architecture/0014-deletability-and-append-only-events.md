# 0014 - Deletability and Append-only Events

## Status

Accepted as a concept and safety constraint.

## Context

Pico uses an append-only event log for ordering, sync, auditability, replay and debugging.

Append-only storage conflicts with deleteable personal memory when full sensitive payloads are stored directly inside immutable events.

## Decision

Append-only events may record that something happened. Deleteable or sensitive content should live behind references, privacy domains, retention policy and encryption boundaries.

## Core design rule

> Append-only events record history. Sensitive memory lives behind references, privacy domains, retention policy and encryption boundaries.

## Payload postures

Events should distinguish how much data they carry:

| Payload posture | Meaning |
|---|---|
| `inline_operational` | small non-sensitive operational data |
| `inline_test` | development-only sample payload |
| `reference_only` | event points to data stored elsewhere |
| `summary_only` | non-sensitive summary without full payload |
| `redacted` | payload intentionally omitted |

## Deleteable memory direction

A future memory store should track:

- memory item id
- privacy domain
- owner or controller
- retention policy
- deletion state
- source reference if needed

Events may refer to memory items but should not carry the full sensitive item by default.

## Tombstones

Replicated deletion needs deletion markers so that old replicas do not recreate removed items.

A deletion marker may remain append-only while the target payload is removed from the deleteable store.

## Audit boundary

Audit records should document important decisions and actions, but audit must not become a second copy of private memory.

For sensitive actions, audit should prefer action type, actor, policy decision, data domain, redaction level, reference id and short summary instead of full payloads.

## Current foundation implication

The current foundation event API may still store small development payloads, for example test messages. Writable Foundation event payloads are exact runtime schemas; unknown fields are rejected to avoid hiding sensitive product data inside append-only events.

That does not make the event log suitable for real personal memory. Before memory, presence history, location context or tool execution become real features, Pico must add payload references, privacy domains and deletion semantics.

The current implementation does not yet expose a `payloadPosture` field, reference target, tombstone mechanism, privacy-domain key envelope or deleteable memory store. The protocol package may reserve payload-posture value names for documentation and additive compatibility planning, but current `PicoEvent` records do not carry that field. `message.created` payloads are stored inline as plaintext foundation events and must remain development/foundation data, not productive personal memory.

A future payload-posture schema field can be added as an additive protocol and storage preparation step, but it must not be confused with the full memory, deletion, tombstone or privacy-domain implementation.

## Design rule

Never make immutable replicated events the primary storage location for sensitive deleteable personal memory.
