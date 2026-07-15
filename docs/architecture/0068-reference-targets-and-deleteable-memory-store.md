# 0068 - Reference Targets and Deleteable Memory Store

## Status

Accepted as the concept-level design direction for reference targets and a deleteable memory store. It gives the `reference_only` payload posture substance and defines the store, deletion and tombstone semantics. This ADR is concept and contract only; the memory-store runtime, schema and enforcement follow as additive steps.

## Context

ADR 0014 makes deletability and append-only events a safety constraint: append-only events record history, deleteable or sensitive content lives behind references, and a future memory store should track a memory item id, privacy domain, owner or controller, retention policy, deletion state and a source reference. Replicated deletion needs tombstones so old replicas do not recreate removed items.

ADR 0011 treats privacy, security and audit as architectural requirements and defines privacy domains.

ADR 0029, ADR 0032 and ADR 0033 define identity, device and domain keys, protected payload and key-envelope schema direction, and key lifecycle. Domain content encryption and key envelopes are their future work, not this ADR's.

ADR 0037 requires audit to record decisions and references rather than a second copy of private memory.

ADR 0067 realizes ADR 0014's payload-posture constraint: `PicoEvent` now carries an optional `payloadPosture` field. `inline_operational` and `inline_test` are writable; `reference_only`, `summary_only` and `redacted` are reserved and rejected because there is no reference target, memory store or deletion mechanism yet. ADR 0067 explicitly defers "a reference-target shape and a deleteable memory store" to their own ADR.

The next useful step is to define what a `reference_only` event points at, where deleteable content lives, and how deletion works, so that the reserved postures can later become writable without turning the append-only event log into personal memory.

## Decision

Pico defines three concept-level shapes and their rules:

- a **memory item**: the deleteable unit of content, living in a memory store, not in the event log.
- a **reference target**: the bounded, non-sensitive pointer a `reference_only` event carries instead of the content.
- a **deleteable memory store**: a store, separate from the append-only event log, that holds memory items, tracks deletion state and supports actual content deletion.

Deletion removes the content of a memory item from the store. The append-only event that referenced it stays, but its reference target resolves to a deleted state, and a tombstone event records the deletion so replicas converge.

This ADR defines the shapes and rules. It does not implement the store, schema, encryption, retention engine or sync protocol.

## Core rule

```text
Append-only events carry a reference target, not the content.
Deleteable content lives in a memory store. Deleting an item removes its content; the event stays and its reference resolves to deleted; a tombstone records the deletion.
```

## Memory item

A memory item is the deleteable unit of content. Concept shape (non-normative):

```json
{
  "memoryItemId": "mem_...",
  "privacyDomain": "domain_...",
  "owner": "pico_...",
  "controller": "pico_...",
  "contentType": "text/markdown",
  "contentPosture": "stored | encrypted-later",
  "retentionPolicyRef": "retention_...",
  "deletionState": "active | deleted | tombstoned",
  "sourceRef": "event_... | null",
  "createdAt": "2026-07-15T12:00:00.000Z",
  "updatedAt": "2026-07-15T12:00:00.000Z"
}
```

Rules:

- the content of a memory item lives in the memory store, never inline in an append-only event.
- `privacyDomain` scopes who may read and how the item is later encrypted; membership and decryption stay separate decisions (ADR 0029, ADR 0032).
- `owner` and `controller` are the identities that may edit or delete the item.
- `retentionPolicyRef` names a retention policy; this ADR does not implement a retention engine.
- `deletionState` moves `active` to `deleted` to `tombstoned`; deletion removes the content, not the item's existence in history.
- `sourceRef` may point back to the append-only event that produced the item, but is not required.

## Reference target

A reference target is what a `reference_only` event carries instead of the content. Concept shape (non-normative):

```json
{
  "referenceId": "ref_...",
  "memoryItemId": "mem_...",
  "store": "memory-store",
  "privacyDomain": "domain_...",
  "contentType": "text/markdown",
  "summary": "short non-sensitive summary or null",
  "resolutionState": "resolvable | deleted | unknown"
}
```

Rules:

- a reference target names where a memory item lives; it is not the content and not a decryption grant.
- it may carry a bounded, non-sensitive `summary` or `contentType`, consistent with the `summary_only` posture, but never the sensitive body.
- when the memory item is deleted, `resolutionState` becomes `deleted`; a stale reference in an old event must resolve to deleted, not recreate the item.
- a reference target must not let a reader expand from the reference into broader store access.

## Deleteable memory store

The memory store is a store, separate from the append-only event log, that holds memory items and their content.

Rules:

- append-only events reference memory items; they do not store the sensitive content.
- the store supports create, read (scoped by privacy domain), update and delete.
- deleting a memory item removes its content from the store and sets `deletionState` to `deleted`.
- the store tracks deletion state so a deleted item is not silently recreated.
- the store is governed by privacy domains and retention policy; enforcement is future work.

The append-only event log keeps recording that something happened. The memory store keeps the deleteable content. These are separate layers, consistent with ADR 0014's design rule.

## Deletion and tombstones

Deletion works across the two layers:

- deleting a memory item removes its content from the memory store and marks it `deleted`.
- a Foundation tombstone event (append-only) records the deletion by `memoryItemId` or `referenceId`, carries no sensitive payload (posture `redacted` or `reference_only`), and lets replicas converge on the deletion.
- old append-only events that referenced the item stay; their reference targets resolve to `deleted`; they must not recreate the removed content.
- a tombstone marks that content was deleted. It is not itself the storage-deletion mechanism, not a privacy-domain key-shred and not an audit-erasure.

The append-only history of "an item existed and was deleted" is preserved; the sensitive content is gone.

## Privacy domain and encryption boundary

Memory items live in privacy domains. This ADR reserves the `privacyDomain` field and the read-scoping rule, but it does not implement:

- domain content encryption or key envelopes (ADR 0029, ADR 0032)
- key lifecycle, rotation or crypto-shredding (ADR 0033)
- membership-based decryption authority (ADR 0031, ADR 0045)

Until those exist, memory-store content is not encrypted at rest and must remain development/foundation data, not productive personal memory.

## Audit boundary

Consistent with ADR 0014 and ADR 0037, audit records reference memory items and record decisions; they must not become a second copy of memory content. Audit for a deletion records the actor, decision, item reference and time, not the deleted content.

## Relationship to payload posture

ADR 0067 postures map onto this design:

- `inline_operational` and `inline_test` carry small non-sensitive content inline and do not use the memory store.
- `reference_only` carries a reference target that points at a memory item in the store.
- `summary_only` carries a bounded non-sensitive summary of a referenced item.
- `redacted` omits the payload; a tombstone uses `redacted` or `reference_only`.

The reserved postures become writable only once reference targets, the memory store and deletion exist.

## Additive compatibility

- reference targets, memory items and the store are additive; they do not change existing event JSON or the current writable postures.
- reserving a reference-target shape in `@pico/protocol` is an additive planning step, like `payloadPostures`.
- a memory-store table, its API, a tombstone event type and retention/deletion enforcement are each additive steps, safe to add without a breaking change.

## Non-goals

This ADR does not define or implement:

- a memory-store schema, table or runtime
- a write, read or delete API for memory items
- content encryption, key envelopes or crypto-shredding
- a retention policy engine
- a tombstone event type in the protocol runtime
- deletion enforcement or replication/sync
- product memory features, search or ranking
- making the reserved postures writable

These remain future work behind their own ADRs and milestones.

## Implementation implications

Additive steps, in order:

1. Reserve a reference-target shape and memory-item vocabulary in `@pico/protocol` as additive planning types, bound to documentation with a test. (Done: `memoryItemDeletionStates`, `referenceTargetResolutionStates` and the reserved `MemoryItemReference` type are exported and doc-bound; no writable behavior.)
2. Add a memory-store table and a scoped create/read/update/delete path behind an access boundary. (Done as a storage skeleton: migration `0006_memory_item_store` adds the `memory_item` table; `MemoryStore` provides domain-scoped create, read, list and delete, where delete removes the content and sets `deletionState` to `deleted`. It is not wired to any HTTP write path and stores development/foundation data only until deletion and encryption are complete.)
3. Add a Foundation tombstone event type and make `reference_only` writable with a valid reference target. (Tombstone done: `memory.tombstone` is a writable Foundation event with payload `{ memoryItemId, privacyDomain, reason? }`; writing one transitions a matching `deleted` memory item to `tombstoned` best-effort. Making `reference_only` writable is decided by ADR 0069: a dedicated `memory.recorded` event type whose payload is a reference target, with a content-splitting write flow; the runtime is pending.)
4. Add retention-policy and deletion enforcement.
5. Add privacy-domain encryption and key envelopes behind the ADR 0029/0032/0033 crypto work.

Each step is additive and independently reviewable before it ships.

## Relationship to other ADRs

This ADR realizes and extends:

- `0014-deletability-and-append-only-events.md`
- `0067-foundation-payload-posture-reference-targets-and-tombstones.md`

It is refined by:

- `0069-recording-memory-items-and-reference-only-event-writes.md`, which decides how `reference_only` becomes writable via a dedicated `memory.recorded` event and a content-splitting write flow

It stays consistent with and below:

- `0011-privacy-security-and-audit-model.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0033-key-lifecycle-rotation-revocation-and-recovery.md`
- `0037-proactive-companion-delegation-and-procurement.md`

It remains below future memory-store runtime, retention, encryption, privacy-domain and sync specifications.

## Consequences

Positive:

- gives the `reference_only` posture a concrete target and the payload-posture direction its next layer
- separates deleteable content from the append-only event log, satisfying ADR 0014
- defines deletion and tombstone semantics so content can be removed while history is preserved
- keeps encryption, retention and the store runtime as clearly deferred, reviewable steps

Negative:

- defines shapes before the store, encryption and retention exist
- the reserved postures stay non-writable until later steps ship
- implementers must remember that a memory store without encryption is not yet productive personal memory
