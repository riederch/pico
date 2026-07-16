# 0070 - Memory Store Encryption-at-Rest and Crypto-Shredding Boundary

## Status

Accepted as the concept-level protection boundary for memory-store content at rest. It defines what must eventually be encrypted, how deletion is upgraded by crypto-shredding, and in which order content may become exposed or protected. It chooses no algorithms and implements no cryptography.

## Context

ADR 0016 keeps cryptography a non-goal until a documented threat model, key lifecycle, reviewed primitives, canonicalization and test vectors exist.

ADR 0029 defines Domain Content Keys as the key role that protects Private Spaces, Shared Spaces and other protected spaces: hosting ciphertext is not read permission.

ADR 0031 requires protected-domain content to stay unreadable to hosts, relays and other non-members.

ADR 0032 defines the key envelope schema family conceptually; ADR 0033 defines key lifecycle, rotation and the limits of what rotation can claim; ADR 0034 gates canonicalization and test vectors.

ADR 0068 and ADR 0069 built the deleteable memory store and the `memory.recorded`/`memory.tombstone` flow. The store works end to end for foundation data.

The honest current state, which this ADR exists to bound:

- `memory_item.content` is **plaintext at rest** in SQLite.
- `MemoryStore.deleteInDomain` removes content from the live database. That is storage deletion, **not crypto-shredding**: SQLite backups created by the backup flow can still contain plaintext copies of deleted content, and restoring an old backup can resurrect items that were deleted later.
- The HTTP API deliberately exposes only reference **state** (`resolutionState`), never content.
- `privacyDomain` scopes store access programmatically, but there is no encryption, no access model and no membership behind it.

Without a stated boundary, two failure modes are likely: a content-exposing HTTP surface ships before any protection exists, or encryption work starts by picking algorithms before the ADR 0016 prerequisites are met.

## Decision

Pico defines the memory-store protection boundary in three rules:

1. **Target state: per-domain encryption at rest.** Memory-item content shall eventually be encrypted at rest per privacy domain, under a Domain Content Key (ADR 0029 role), with the item carrying ciphertext plus a key-envelope reference (ADR 0032 family). The store, host and backups then hold ciphertext only.

2. **Deletion upgrade: crypto-shredding.** Once content is domain-encrypted, deletion is upgraded: removing content from the live store stays, and destroying or rotating away the relevant key material makes residual copies (including old backups) unreadable. Consistent with ADR 0033, a crypto-shred claim is only as strong as the key-material handling: keys that were themselves backed up or exported are not destroyed by rotation, and rotation never proves historical deletion by itself.

3. **Ordering rule: no content exposure before protection.** No HTTP surface may expose memory-item **content** before an access model protects it. Until then the API exposes state only. A development-only content read surface, if ever added earlier, must be explicitly dev-scoped, disabled by default and gated at least by the Foundation token boundary - and it still does not make the store production memory.

Until encryption and an access model exist, memory-store content remains development/foundation data only.

## Core rule

```text
Memory content is plaintext at rest today, so it stays foundation data and is never exposed over HTTP.
The target is per-domain encryption with crypto-shredding deletion; until then, deletion is storage-removal only and backups may retain plaintext.
```

## Content posture direction

A memory item shall later state how its content is protected. Reserved direction (vocabulary reservation is a later additive step):

```text
plaintext_foundation
domain_encrypted
```

- `plaintext_foundation` - the current state: content stored as plaintext, foundation/development data only.
- `domain_encrypted` - the target state: content encrypted under a privacy-domain content key, with a key-envelope reference.

An item's posture is storage metadata, not an access decision: `domain_encrypted` does not grant or deny reads by itself; membership and key access stay separate (ADR 0029, ADR 0031).

## Backup and stale-restore implications

The backup flow copies the SQLite database. Today that means:

- backups of a database with plaintext memory content contain plaintext.
- deleting an item after a backup does not remove it from that backup.
- restoring an old backup can resurrect deleted items as `active`.

Mitigations, in order of availability:

- **Now:** the store holds foundation data only; deletion is documented as live-store removal, not total erasure.
- **Recoverable now (implemented):** because `memory.tombstone` events live in the append-only log, the store re-applies them on open (`EventStore.reconcileMemoryTombstones`, run by `EventStore.open`). A restore that resurrected a deleted item as `active` is re-tombstoned (content removed, state `tombstoned`) on the next boot. This is idempotent and enforces recorded deletions; it does not recover content in stale backups (that needs crypto-shredding).
- **Target:** with domain encryption, backups hold ciphertext, and crypto-shredding makes residual ciphertext unreadable - subject to the ADR 0033 key-handling limits above.

## What this ADR deliberately does not choose

Consistent with ADR 0016, this ADR selects no cryptography:

- no encryption algorithms, AEAD modes or KDFs
- no key formats, serialization or storage location
- no key-envelope wire format (ADR 0032 family stays conceptual)
- no rotation, recovery or multi-device key distribution mechanics (ADR 0033)
- no canonicalization or test vectors (ADR 0034)

Selecting the concrete primitives is a separate decision that requires the ADR 0016 prerequisites and deserves the most careful review available; it must not be an incidental byproduct of an implementation step. That dedicated step has since been taken: ADR `0071-memory-content-encryption-threat-model-and-primitive-direction.md` documents the threat model and decides the suite, with implementation still gated.

## Relationship to a future memory read API

The open product question "should memory content be readable over HTTP?" is answered by ordering, not by refusal:

- reference **state** is already readable (ADR 0069 `resolutionState`) and stays the only exposure for now.
- a content read/list API is acceptable only after (a) an access boundary stronger than the temporary Foundation token exists, or (b) domain encryption plus an explicit membership/access model exist - whichever design lands first, with (b) required for anything called production memory.
- a dev-only exception must satisfy decision rule 3.

## Non-goals

This ADR does not define or implement:

- encryption, decryption or key management runtime
- a content read/list HTTP API
- retention policy enforcement (a retention engine)
- content recovery from stale backups (crypto-shredding, not implemented)
- access control, authentication or membership
- search over encrypted content
- production-memory or compliance claims

## Implementation implications

Additive steps, in order (all deferred):

1. Reserve the content-posture vocabulary (`plaintext_foundation`, `domain_encrypted`) in `@pico/protocol`, doc-bound like `payloadPostures`. (Done: `memoryContentPostures` is exported and doc-bound; no encryption behavior.)
2. Add `content_posture` (default `plaintext_foundation`) and nullable `key_envelope_ref` columns to `memory_item` as an additive migration. (Done: migration `0007_memory_item_content_posture`; `MemoryStore` maps `contentPosture`/`keyEnvelopeRef`. All items are `plaintext_foundation` at rest; the column is metadata, not enforcement.)
3. Define the concrete threat model, primitives, key storage, canonicalization and test vectors behind ADR 0016/0029/0032/0033/0034; select primitives in a dedicated, maximally reviewed step. (Threat model and primitive suite decided: ADR `0071-memory-content-encryption-threat-model-and-primitive-direction.md` answers the ADR 0016 questions for this surface and fixes `pico.suite.mem.v1`; key storage, canonical AD vectors and everything runtime stay pending behind its security-relevance gate.)
4. Implement domain encryption at rest and the crypto-shredding deletion upgrade.
5. Only then design a protected content read API and retention enforcement.

## Relationship to other ADRs

This ADR refines:

- `0068-reference-targets-and-deleteable-memory-store.md`
- `0069-recording-memory-items-and-reference-only-event-writes.md`

It depends on and stays below:

- `0016-cryptography-boundaries-and-non-goals.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`
- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0033-key-lifecycle-rotation-revocation-and-recovery.md`
- `0034-canonicalization-signature-inputs-and-test-vectors.md`

## Consequences

Positive:

- states honestly that deletion today is live-store removal and that backups may retain plaintext
- fixes the order: protection before content exposure, prerequisites before primitives
- gives deletion a real target semantics (crypto-shredding) with its ADR 0033 limits attached
- answers the open read-API question architecturally instead of ad hoc

Negative:

- memory content stays foundation-only for longer
- the reserved posture vocabulary adds planning surface before the runtime exists
- crypto-shredding guarantees will always be qualified by key-handling reality, which must be communicated honestly
