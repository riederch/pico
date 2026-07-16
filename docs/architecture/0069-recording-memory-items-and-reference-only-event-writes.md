# 0069 - Recording Memory Items and Reference-Only Event Writes

## Status

Accepted as the design decision for how memory-referencing events carry their reference and how `reference_only` becomes writable. It refines ADR 0068 step 3. This ADR decides the model and contract; the runtime follows as an additive step.

## Context

ADR 0014 requires that append-only events refer to memory items rather than carry the full sensitive item, and that sensitive content live in a deleteable store.

ADR 0067 defines the `payloadPosture` envelope field. `reference_only` is reserved and not yet writable because there is no reference target, store or write flow.

ADR 0068 defines the reference target, the deleteable memory store and deletion/tombstone semantics. Its step 3 is "make `reference_only` writable with a valid reference target." ADR 0068 step 2 built the store skeleton (`memory_item` table, `MemoryStore` with domain-scoped create/read/list/delete). ADR 0068 step 3a added the `memory.tombstone` event and its store projection.

What remains is a decision ADR 0068 left open: **how does an event carry its reference target**, and how does content reach the deleteable store without ever entering the append-only log?

## Options considered

**Option A - a general `referenceTarget` envelope field on `PicoEvent`.** A `reference_only` event of any type would carry a `referenceTarget` alongside its payload, parallel to `payloadPosture`.

This breaks typed payload contracts. A `reference_only` `message.created` still requires its `text`, but the text is the content that now lives in the store. The event either violates its required-field contract or duplicates the content. Generalizing `reference_only` across existing typed events creates payload ambiguity for every type.

**Option B - a dedicated `memory.recorded` event type whose payload is the reference target.** Memory-referencing is its own Foundation event type. Its payload is the reference, not the content, so there is no payload ambiguity, and it mirrors the existing `memory.tombstone` event.

## Decision

Pico records referenced memory with a dedicated Foundation event type and a content-splitting write flow.

1. **`memory.recorded` Foundation event type.** Memory-referencing is a dedicated event type, not a general envelope field. Its stored payload is a reference target: `{ memoryItemId, privacyDomain, contentType, summary? }` - non-sensitive, no content.

2. **`reference_only` posture for `memory.recorded`.** The recorded event uses `reference_only`: its content lives in the deleteable store, referenced, not inline. Making `reference_only` writable means allowing it for reference-carrying events (`memory.recorded`), not for arbitrary typed events.

3. **Content-splitting write flow.** `POST /api/events` for a `memory.recorded` accepts the content and metadata (`{ privacyDomain, contentType, content, summary? }`, and identity fields). The server:
   - stores the content as a memory item in the deleteable store (`MemoryStore.create`), producing a `memoryItemId`;
   - records a `memory.recorded` append-only event whose payload is only the reference (`{ memoryItemId, privacyDomain, contentType, summary? }`), with the content stripped.

   The content reaches the deleteable store; the append-only event never holds it. This directly realizes ADR 0014's design rule, in a single request, by construction.

4. **The recorded event is server-derived.** Unlike inline event types, the stored `memory.recorded` event is not an echo of the request body: the server creates the memory item and derives the reference. The request's content is transient input that goes to the deleteable store, not the log.

5. **Write-time validation is shape and privacy only; resolution is read-time.** The write validates the content and reference shape and the writable posture. It does not require the referenced item to already exist elsewhere (it just created it). A reference target's `resolutionState` (`resolvable`, `deleted`, `unknown`) is a read-time projection, keeping the log append-only-friendly and decoupled from cross-replica sync state, consistent with the `memory.tombstone` projection model.

## Core rule

```text
memory.recorded records a reference to a memory item, never the content.
POST content is stored in the deleteable store; the server derives a reference_only event carrying only the reference. Reference resolution is read-time.
```

## Why not the envelope field

The `payloadPosture` field is orthogonal to type because it describes how much data is carried, not what the payload means. `reference_only`, taken literally, removes the payload's content entirely - but typed events define required payload fields (`message.created` requires `text`). A posture that empties the payload conflicts with a type that requires it. A dedicated `memory.recorded` type avoids the conflict: its payload is defined as a reference, so there is nothing to empty. `summary_only` and `redacted` may later apply to typed events because they keep or omit a bounded payload without contradicting required fields; `reference_only` is best expressed as a reference-carrying type.

## memory.recorded event

Request payload accepted by `POST /api/events` (conceptual, non-normative):

```json
{
  "privacyDomain": "domain_...",
  "contentType": "text/markdown",
  "content": "the sensitive item to store",
  "summary": "short non-sensitive summary or null",
  "owner": "pico_...",
  "controller": "pico_..."
}
```

Stored event payload (content stripped, reference derived):

```json
{
  "memoryItemId": "mem_...",
  "privacyDomain": "domain_...",
  "contentType": "text/markdown",
  "summary": "short non-sensitive summary or null"
}
```

Rules:

- the request `content` is stored in the deleteable memory store and never persisted in the event.
- the stored payload is a reference target with no content.
- the event posture is `reference_only`.
- `summary` stays bounded and non-sensitive.
- a later `memory.tombstone` for the same `memoryItemId` deletes the content and tombstones the item.

## Relationship to the memory store and tombstones

- `memory.recorded` creates a memory item and records a reference; `memory.tombstone` deletes the content and records the deletion. Together they are the create and delete halves of the deleteable-memory lifecycle over the append-only log.
- reads later resolve a reference target against the store: `resolvable` while the item is active, `deleted`/`unknown` after tombstoning.

## Non-goals

This ADR does not define or implement:

- a general `referenceTarget` envelope field on arbitrary event types
- an HTTP read/list API for memory items
- content encryption, key envelopes or crypto-shredding
- a retention policy engine
- update/edit of a recorded memory item
- making `reference_only` writable for non-`memory.recorded` events
- cross-replica reference resolution or sync

Memory-store content stays development/foundation data until encryption and retention exist.

## Implementation implications

Additive runtime steps (each independently reviewable):

1. Add the `memory.recorded` Foundation event type and a request/stored payload split in the protocol and `POST /api/events`. (Done: `memory.recorded` with a stored reference payload `{ memoryItemId, privacyDomain, contentType, summary? }`; the request payload carries content and is validated separately.)
2. On write, create the memory item via `MemoryStore.create`, then record the derived reference-only event. (Done: the server generates a `memoryItemId`, stores the content, and appends a `reference_only` `memory.recorded` event carrying only the reference; the response returns the derived event.)
3. Add `reference_only` to the writable postures, gated to `memory.recorded`. (Done: the server sets `reference_only` on the derived event; the generic event path still rejects a client-supplied `reference_only`.)
4. Add read-time reference resolution against the store. (Done: `GET /api/events` and `/api/events/tail` enrich `memory.recorded` events with a `resolutionState` (`resolvable` while active, `deleted` after delete/tombstone, `unknown` otherwise) computed from the store; the stored event is unchanged.)
5. Add memory read/list, retention and privacy-domain encryption behind their own ADRs. (Pending.)

## Relationship to other ADRs

This ADR refines:

- `0068-reference-targets-and-deleteable-memory-store.md`
- `0067-foundation-payload-posture-reference-targets-and-tombstones.md`

It is refined by:

- `0070-memory-store-encryption-at-rest-and-crypto-shredding-boundary.md`, which bounds how recorded content is protected at rest and orders protection before any content-exposing read API

It stays consistent with and below:

- `0011-privacy-security-and-audit-model.md`
- `0014-deletability-and-append-only-events.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`

It remains below future memory read, retention, encryption and sync specifications.

## Consequences

Positive:

- resolves how a `reference_only` event carries its reference without breaking typed payload contracts
- realizes ADR 0014's rule in a single write: content goes to the deleteable store, the event carries only a reference
- pairs `memory.recorded` with `memory.tombstone` as the create/delete halves of deleteable memory
- keeps reference resolution read-time, so the write path stays append-only-friendly

Negative:

- the recorded event is server-derived, unlike echo-style inline events
- request bodies transiently carry content, which must be handled as store-bound input, not logged
- until encryption and retention exist, the memory store is not productive personal memory
