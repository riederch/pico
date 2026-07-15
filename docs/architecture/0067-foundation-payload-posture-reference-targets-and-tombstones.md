# 0067 - Foundation Payload Posture, Reference Targets and Tombstones

## Status

Accepted as the concrete realization direction for ADR 0014. It operationalizes payload posture, reference targets and tombstones into an additive Foundation contract. The payload-posture vocabulary is already reserved in `@pico/protocol` (`payloadPostures`); this ADR defines the concrete boundary and the additive runtime path. Storage and API enforcement follow as additive runtime steps.

## Context

ADR 0014 makes deletability and append-only events a concept and safety constraint: append-only events record history, sensitive memory lives behind references, privacy domains, retention policy and encryption boundaries. It lists payload posture value names, sketches a deleteable memory direction, and requires tombstones for replicated deletion.

ADR 0011 keeps privacy, security and audit a blocked-before-production concern.

ADR 0037 requires action history and audit to record decisions without becoming a second copy of private memory.

The current Foundation stores `message.created` and other event payloads inline as plaintext. `PicoEvent` has no `payloadPosture` field, no reference target, no tombstone and no deleteable memory store. `docs/protocol/public-surfaces.md` already reserves the five payload posture value names as documentation-only direction.

ADR 0014 is a high-level constraint but does not define the concrete Foundation contract: where the posture field lives, what an absent field means, which postures are writable today, what a reference target looks like, or what a Foundation tombstone is. Without that, the runtime cannot add payload posture as a safe additive step.

The next useful step is to operationalize ADR 0014 into a concrete, additive Foundation contract that the runtime can implement without breaking existing events or turning the event log into personal memory.

## Decision

Pico defines an additive Foundation payload-posture contract:

- `PicoEvent` may carry an optional `payloadPosture` field on the event envelope.
- The posture value set is the one reserved by ADR 0014.
- An absent `payloadPosture` is treated as `inline_operational`, so existing events stay valid without change.
- Only small operational postures are writable through the current Foundation API; reference, summary and redacted postures are reserved for future memory-referencing events.
- Reference, summary and redacted postures point at data stored elsewhere; they must not carry the full sensitive payload inline.
- A Foundation tombstone is a future append-only deletion-marker event that references a removed item and carries no sensitive payload.

The payload-posture vocabulary is already reserved in `@pico/protocol`; this ADR defines the boundary now. Storage and API enforcement are additive runtime steps that follow.

## Core rule

```text
payloadPosture is an additive envelope field that says how much data an event carries.
An absent posture means inline_operational. Reference, summary and redacted postures point elsewhere and never carry the full sensitive payload.
```

## Payload posture field

`payloadPosture` is an optional string field on the `PicoEvent` envelope, alongside existing envelope metadata.

Value set (reserved by ADR 0014, exported as `payloadPostures` in `@pico/protocol`):

```text
inline_operational
inline_test
reference_only
summary_only
redacted
```

Semantics:

- `inline_operational` - small non-sensitive operational data carried inline. The default when the field is absent.
- `inline_test` - development-only sample payload carried inline.
- `reference_only` - the event carries a reference target, not the item itself.
- `summary_only` - the event carries a bounded non-sensitive summary, not the full payload.
- `redacted` - the payload is intentionally omitted.

The field is additive: an event without `payloadPosture` remains valid and is treated as `inline_operational`. Adding the field does not change any existing JSON shape and does not create a compatibility break.

## Writable Foundation posture policy

The current `POST /api/events` surface writes small Foundation events only.

- Writable now: `inline_operational` (default) and `inline_test`.
- Reserved, not yet writable: `reference_only`, `summary_only`, `redacted`. These belong to future memory-referencing events and require a reference target, a memory store and deletion semantics that do not exist yet.

When reference, summary and redacted postures become writable, the Foundation must reject a full sensitive payload smuggled under a non-inline posture: a `reference_only` event must carry a reference, not the item; a `redacted` event must omit the payload; a `summary_only` event must stay bounded and non-sensitive.

## Reference targets

A `reference_only` event points at data stored elsewhere rather than carrying it.

A reference target should later describe at least:

- a reference id
- the store or domain the item lives in
- optionally a bounded non-sensitive summary or content type

A reference target is not the item, not a decryption grant and not a memory store. It only names where the deleteable item lives so that append-only events do not become the primary store for sensitive memory.

## Tombstones

Replicated deletion needs deletion markers so old replicas do not recreate removed items.

A Foundation tombstone is a future append-only deletion-marker event that:

- references the removed item by reference id
- carries no sensitive payload (posture `redacted` or `reference_only`)
- may remain append-only while the target payload is removed from the deleteable store

A tombstone marks that an item was deleted. It is not itself a deletion mechanism for the item's storage, not a privacy-domain key-shred and not an audit-erasure. Adding a tombstone event type is a separate additive runtime step, gated on the deleteable memory store.

## Audit boundary

Consistent with ADR 0014 and ADR 0037, audit records document decisions and actions and must not become a second copy of private memory. For sensitive actions, audit prefers action type, actor, policy decision, data domain, redaction level, reference id and short summary over full payloads. Audit records should therefore use `reference_only`, `summary_only` or `redacted` postures, never `inline_operational` for sensitive content.

## Additive compatibility

- `payloadPosture` is optional and additive; absent means `inline_operational`.
- No existing event JSON shape changes.
- The protocol package reserves the value list; documentation and runtime stay in sync via a fixture/test cross-check.
- Later storage of the field, reference targets and tombstone events are additive steps, each safe to add without a breaking change.

## Non-goals

This ADR does not define or implement:

- a deleteable memory store
- encryption, privacy-domain key envelopes or crypto-shredding
- a retention policy engine
- runtime deletion enforcement
- a new writable reference or tombstone event type
- reference target resolution
- audit persistence guarantees

These remain future work behind their own ADRs and milestones.

## Implementation implications

Additive runtime steps, in order:

1. Reserve `payloadPostures` and `PayloadPosture` in `@pico/protocol` and bind them to `docs/protocol/public-surfaces.md` with a test. (Done.)
2. Accept an optional `payloadPosture` on the `PicoEvent` envelope and default it to `inline_operational`, without changing stored JSON for existing events. (Done: `payloadPosture` is an optional `PicoEvent` field, persisted in a nullable `pico_event.payload_posture` column via migration `0005_event_payload_posture`; an absent value round-trips as absent and is treated as `inline_operational`.)
3. Restrict `POST /api/events` to writable postures (`inline_operational`, `inline_test`) and reject reserved postures until reference targets exist. (Done: `writablePayloadPostures` in `@pico/protocol`; `POST /api/events` returns 400 for unknown or reserved postures.)
4. Define a reference-target shape and a deleteable memory store behind their own ADR. (Pending.)
5. Add a Foundation tombstone event type once the deleteable store and reference targets exist. (Pending.)

Each step is additive and independently reversible before it ships.

## Relationship to other ADRs

This ADR realizes:

- `0014-deletability-and-append-only-events.md`

It is extended by:

- `0068-reference-targets-and-deleteable-memory-store.md`, which defines the reference target the `reference_only` posture points at, the deleteable memory store and deletion/tombstone semantics

It stays consistent with and below:

- `0011-privacy-security-and-audit-model.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0037-proactive-companion-delegation-and-procurement.md`

It remains below future memory-store, retention, privacy-domain, encryption and deletion-enforcement specifications.

## Consequences

Positive:

- turns ADR 0014's constraint into a concrete, additive Foundation contract
- reserves and binds the payload-posture vocabulary so documentation and runtime cannot drift
- defines an additive path to reference targets and tombstones without breaking existing events
- keeps the append-only event log from becoming the primary store for sensitive memory

Negative:

- adds vocabulary before the storage and API enforcement exist
- the reserved postures are not yet writable, so the contract is partial until later steps
- implementers must remember that a posture field alone does not implement memory, deletion or privacy domains
