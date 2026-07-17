# 0074 - Memory Retention Policy and Expiry-Deletion Boundary

## Status

Accepted as the retention model and expiry-deletion boundary for the memory store, now implemented for the single-host foundation. Retention is the fourth of ADR 0014's named boundaries ("references, privacy domains, retention policy and encryption boundaries") and the last without its own design. This ADR defines what a retention policy is, how expiry deletes, what retention may claim and what it must never become. Implementation steps 1–3 have shipped (mode vocabulary, policy storage, the deletion-only sweep), and the policy CRUD/HTTP surface now exists behind ADR 0075 Gate A (`host-admin`, operator session required). Domain-default binding and the encryption-era claims upgrade remain deferred (see below).

## Context

ADR 0014 places deleteable and sensitive content behind references, privacy domains, retention policy and encryption boundaries, and lists retention policy among the fields a future memory store should track.

ADR 0068 reserves `retentionPolicyRef` on the memory item ("names a retention policy; this ADR does not implement a retention engine") and lists "Add retention-policy and deletion enforcement" as its implementation step 4 — before its encryption step 5. The `memory_item.retention_policy_ref` column exists (migration `0006`) and is unused.

ADR 0070 orders protection before content exposure and lists "a protected content read API and retention enforcement" in its post-encryption step 5. That leaves an ordering tension with ADR 0068 step 4 that this ADR resolves explicitly (see "Ordering").

ADR 0069's `memory.recorded`/`memory.tombstone` flow and the implemented deletion machinery are the substrate: `MemoryStore.deleteInDomain` removes content from the live store, `memory.tombstone` records deletion in the append-only log, and `EventStore.open` re-applies tombstones so a stale restore cannot silently resurrect deleted items.

ADR 0037 requires that durable preferences are inspectable, editable and revocable, and that audit records decisions and references, never a second copy of private content.

ADR 0011 makes privacy domains the governance unit for read/write/sync/export/delete. ADR 0021 sets "retention-limited where appropriate" as a default posture for private-behaviour observations and leaves "which behaviours require retention limits by default" an open product question — this ADR supplies the mechanism, not those product defaults.

ADR 0033 bounds deletion honesty: nothing erases copies that were exported or backed up elsewhere; rotation and shredding claims are only as strong as key handling. ADR 0058 uses `retentionRequirement` for a *different* surface (what a model provider may retain); the two vocabularies stay separate.

## Scope

This ADR covers retention of **memory-item content in the memory store on a single Foundation host**: when content may be deleted automatically because a policy's time bound has been reached.

It does not cover: the append-only event log (history is not content and is not retention-pruned), audit records, SQLite backup file rotation (an ops concern), sync replicas or exported copies (unreachable by any local mechanism, ADR 0033), or provider-side retention in model delegation (ADR 0058).

## Decision

Pico models retention as **named policy objects** that memory items reference, with **expiry deleting through the existing tombstoned deletion path** and a **fail-safe default of keeping**.

1. **Named policies, not inline deadlines.** A retention policy is a durable, named object; items bind to it via the existing `retentionPolicyRef`. Policies are durable preferences in the ADR 0037 sense: inspectable, editable and revocable. Editing a policy changes the effective expiry of every item that references it, because expiry is computed at evaluation time, never frozen into the item.
2. **Minimal mode vocabulary.** A policy has one of two modes:
   - `keep_until_deleted` — no automatic expiry; content lives until a user or controller deletes it. This is the system default.
   - `delete_after_max_age` — content expires when the item's age exceeds the policy's `maxAge`; expiry deletes automatically.
3. **Resolution order.** The effective policy of an item is: the item's `retentionPolicyRef` if set and resolvable → the privacy domain's default policy, once a domain registry exists (future; no such registry exists today) → the system default `keep_until_deleted`.
4. **Fail-safe rule.** A missing, unresolvable, malformed or unknown-mode policy never deletes: the item is kept and the dangling reference is surfaced as a diagnostic. Deletion is destructive automation; it may only ever fire on an explicit, resolvable policy.
5. **Expiry deletes through the existing path.** Retention-driven deletion is exactly a deletion: content is removed from the live store (the `deleteInDomain` semantics) and a server-synthesized `memory.tombstone` event records it, with a `reason` referencing the policy (a decision plus a reference, no content — ADR 0037 audit style). Because tombstones are reconciled on open, retention deletions are re-enforced after a stale restore with no new machinery.

## Core rule

```text
Retention is policy-driven deletion, nothing more.
No policy means keep; ambiguity must never delete.
Expiry deletes through the same tombstoned path as a user deletion,
and its claims never exceed what that deletion can honestly promise.
```

## Retention policy shape

Concept shape (non-normative, ADR 0068 style):

```json
{
  "retentionPolicyId": "retention_...",
  "displayName": "short non-sensitive name",
  "mode": "keep_until_deleted | delete_after_max_age",
  "maxAge": "P90D",
  "createdAt": "2026-07-16T12:00:00.000Z",
  "updatedAt": "2026-07-16T12:00:00.000Z"
}
```

Rules:

- `maxAge` is required for `delete_after_max_age` and forbidden for `keep_until_deleted`. It is a duration; day granularity is the intended minimum — retention is not a real-time mechanism and must not pretend precision.
- `retentionPolicyId` and `displayName` are **cleartext storage metadata**, like privacy-domain IDs and content types (ADR 0071 honesty): they survive at rest unencrypted and must not themselves be sensitive.
- Deleting a policy that items still reference produces dangling references, which fall under the fail-safe rule: keep and surface.

## Expiry semantics

- The expiry anchor is the item's `createdAt`. An item is expired when `now > createdAt + maxAge` under its effective policy. There is no touch-to-extend semantics: the store has no content-update path today, and any future update semantics must decide its anchor explicitly rather than inheriting one silently.
- Expiry is **eventual, not instantaneous**: it takes effect when a retention sweep next evaluates the item. The bound is "no earlier than `maxAge`", not "exactly at `maxAge`".
- Evaluation trusts the **local host clock**. There is no distributed time proof; a grossly wrong clock can delete early or late. Every retention deletion is tombstoned and therefore visible and auditable, but not reversible — one reason the sweep must be deliberately boring: deletion-only, idempotent, batch-bounded, fail-safe.

## Enforcement machinery (deferred)

The retention sweep is the future enforcement engine. Its concept-level contract:

- **Deletion-only.** The sweep deletes expired items and writes tombstones. It never exposes content, never reads content, never rewrites events and never touches the event log beyond appending tombstones.
- **Idempotent and restore-proof.** Re-running the sweep is harmless; after a stale restore, the existing tombstone reconciliation re-enforces past retention deletions, and the sweep re-evaluates what the restore resurrected.
- **Fail-safe.** Any evaluation ambiguity keeps the item (rule 4 above).
- **Bounded.** Work happens in bounded batches (on open and periodically; scheduling details are implementation work).

For a `domain_encrypted` item (once encryption exists), retention deletion removes ciphertext and the item's key envelope like any deletion. Old backup copies remain ciphertext-plus-wrapped-DEK and stay unreadable to a backup-artifact attacker for lack of the separately stored KEK (ADR 0072 R6); their durable unreadability against an attacker who later gains the KEK still comes only from domain crypto-shredding, with the ADR 0033 limits.

## Ordering

This ADR resolves the ADR 0068 / ADR 0070 staging tension explicitly:

- ADR 0070's rule 3 ("no content exposure before protection") is an invariant about **reads**. Retention enforcement is deletion-only and exposes nothing, so the sweep may ship as an additive foundation step **independent of encryption** — consistent with ADR 0068 step 4.
- What stays behind the ADR 0070 post-encryption ordering is unchanged where it matters: the protected content read API, and the **claims upgrade** — "expired content becomes unreadable in old backups" exists only with domain encryption plus crypto-shredding (ADR 0033 limits attached). Before that, a retention deletion promises exactly what a user deletion promises today: live-store removal plus a tombstone, while backups may retain plaintext.

## Honesty limits

Wherever retention is surfaced, its limits travel with it:

- Pre-encryption, expiry removes live content only; backups may retain plaintext of expired items until crypto-shredding exists.
- The bounded non-sensitive `summary` carried by a `memory.recorded` event persists after expiry — append-only by design (ADR 0069), same as after user deletion.
- Exported copies and future sync replicas are outside retention's reach, permanently (ADR 0033).
- Retention is **not a compliance engine**: no GDPR, legal-hold, jurisdiction or regulatory claims. ADR 0021's product questions (which content classes get retention limits by default) stay open product work.
- Policy metadata is readable at rest; sensitivity does not belong in policy IDs or names.

## What retention is not

- not access control, consent, membership or a read API
- not automatic classification: no ML or heuristic decides what is worth keeping (ADR 0021 hidden-profiling boundary)
- not count-based quotas, LRU/usage eviction, importance scoring, archival or storage tiering
- not event-log compaction or audit pruning
- not backup-file rotation
- not the model-delegation `retentionRequirement` (ADR 0058) — provider-side retention is a different surface and keeps its own vocabulary
- not a review/ask flow: an "expire to review" action (ADR 0037's notice → ask ladder applied to expiry) is a plausible future product step but needs a notification surface that does not exist; the only expiry action this ADR defines is tombstoned deletion

## Non-goals

This ADR does not define or implement:

- the retention sweep engine, its scheduling or its diagnostics surface
- policy storage, a policy CRUD API or policy validation runtime
- a privacy-domain registry or domain-default policy binding
- protocol vocabulary exports (a later additive step, `payloadPostures`-style)
- product default policies per content class
- notification, review or approval flows on expiry
- retention semantics for sync, sharing or multi-host replicas

## Implementation implications

Additive steps, in order:

1. Reserve the retention-mode vocabulary (`keep_until_deleted`, `delete_after_max_age`) in `@pico/protocol`, doc-bound like `payloadPostures` and `memoryContentPostures`. **Done: `memoryRetentionModes`.**
2. Add retention-policy storage with validation and wire `retentionPolicyRef` at item creation; resolution = item ref → system default (domain defaults wait for a domain registry). Policies are inspectable, editable and revocable from the start (ADR 0037). **Done: `memory_retention_policy` table (migration `0009`), `RetentionPolicyStore` CRUD + validation (day-granular `maxAgeDays`); `MemoryStore.create` accepts `retentionPolicyRef`.**
3. Implement the retention sweep under the enforcement contract above: deletion-only, idempotent, batch-bounded, fail-safe, tombstones with policy references; runs on open and periodically. May land before encryption (see "Ordering"). **Done: `RetentionSweeper` expires aged `delete_after_max_age` items by appending a `memory.tombstone` event (reason `retention:<id>`) and enforcing the tombstone; runs on boot and hourly in `buildApp`. It reads no content and decrypts nothing.**
4. Add domain-default policy binding once a privacy-domain registry exists. **Deferred.**
5. After encryption and crypto-shredding ship: revisit retention claims (backup unreadability of expired content) and consider domain-wide expiry as a KEK-shred trigger — a domain whose items are all expired and deleted becomes a shred candidate, never an automatic shred. **Deferred.**

The policy CRUD and write-time-`retentionPolicyRef` HTTP surface now exists behind ADR 0075 Gate A: `/api/memory/retention-policies` (list, create, read, edit, revoke) carries the `host-admin` class, so it requires an operator session and the principal-less static token can never reach it. `POST /api/events` accepts `retentionPolicyRef` on a `memory.recorded` write and rejects an unknown reference, because the fail-safe rule would otherwise keep the item forever while the writer believed expiry was configured. Revoking a policy still deletes no memory: items referencing it fall back to fail-safe keep.

Not yet built (deliberate ADR 0074 non-goals): any notification or review flow on expiry, and domain-default policy binding.

## Relationship to other ADRs

Realizes:

- `0014-deletability-and-append-only-events.md` — the retention-policy element of its boundary rule
- `0068-reference-targets-and-deleteable-memory-store.md` — designs its step 4 and gives `retentionPolicyRef` semantics

Refines:

- `0070-memory-store-encryption-at-rest-and-crypto-shredding-boundary.md` — its step 5 ordering for retention enforcement (deletion-only enforcement unblocked; read API and claims upgrade stay post-encryption)

Stays within and below:

- `0011-privacy-security-and-audit-model.md` (domains govern deletion; audit is structural)
- `0021-private-behaviour-legal-risk-and-harm.md` (mechanism here, product defaults there)
- `0033-key-lifecycle-rotation-revocation-and-recovery.md` (deletion honesty limits)
- `0037-proactive-companion-delegation-and-procurement.md` (durable preferences; audit = decisions + references)
- `0069-recording-memory-items-and-reference-only-event-writes.md`, `0071`/`0072`/`0073` (deletion flow, encryption suite, key storage, AD binding — untouched)

## Consequences

Positive:

- the last unnamed ADR 0014 boundary (retention) has a concrete, bounded model
- reusing the tombstoned deletion path makes retention deletions restore-proof with zero new enforcement machinery
- the fail-safe rule makes the destructive automation conservative by construction: no policy, no deletion
- the 0068/0070 ordering tension is resolved explicitly instead of by whichever implementation lands first

Negative:

- policies are designed before the engine, the policy store or a domain registry exist
- pre-shred retention claims stay deliberately modest, which must be communicated wherever expiry is surfaced
- day-granular, sweep-eventual expiry will disappoint expectations of exact-time deletion — by design
- one more reserved-vocabulary planning surface before runtime
