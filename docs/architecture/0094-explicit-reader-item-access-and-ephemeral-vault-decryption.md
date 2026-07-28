# 0094 - Explicit Reader Item Access and Ephemeral Vault Decryption

## Status

Accepted and implemented as the explicit local plaintext boundary above the
ADR 0093 protected projection archive. It selects exactly one current item,
assembles its already verified evidence and invokes the existing Vault
decryption through an injected synchronous boundary. It is not a plaintext
store, index, search API, display surface, network endpoint or Vault daemon.

## Context

ADR 0093 can reopen the complete Reader-sealed archive, verify every signed
projection from genesis and bind the restored head to the current durable
Reader state. The resulting payloads exist only in memory, but callers still
lacked a safe way to choose and decrypt one item.

Passing an arbitrary item record directly to Vault would leave several
authority decisions to the caller:

- whether the record came from the current restored head or only from stale
  history;
- whether the same `packageId` named different signed records over time;
- whether Domain, Reader, Writer, lifecycle, rotation and KEK-version evidence
  belonged to the same verified projection;
- whether the durable sync state changed between restore and plaintext
  delivery;
- whether plaintext was accidentally returned into a cache, event, archive or
  asynchronous background flow.

The existing `decryptPicoReaderCustodyItem` function already owns the
cryptographic operation. Sync must not duplicate its signature validation,
envelope opening, DEK unwrap or content decryption, and Vault must not depend
on Sync. The missing layer is therefore a narrow evidence-selection and
plaintext-delivery boundary with an injected Vault decryptor.

## Decision

### Current-head selection

`PicoReaderCustodySyncItemAccess` receives:

- a projection restore source, normally
  `PicoReaderCustodySyncProtectedProjectionFileStore`;
- the exact Reader pins;
- a current durable state source;
- the Reader batch opener;
- an injected synchronous item decryptor backed by Vault.

Each access loads and validates the current durable state, restores the complete
ADR 0093 chain against that state and selects one explicit `packageId`.

An item is accessible only if exactly one matching item record is present in
the current restored head and the head projection view names that package
exactly once. A record found only in an earlier projection is stale and is not
silently revived.

Identical repetition of the same full item record across contiguous
projections is expected and accepted. If any historical occurrence of the
same `packageId` differs from the current record, access fails as an evidence
fork. Multiple occurrences within one projection fail as ambiguous even if
their JSON happens to be identical.

This is intentionally stricter than accepting the latest matching historical
record. The signed current head remains the selection authority.

### Exact evidence assembly

After selection, the access layer resolves exactly one Writer Grant through
the selected item's `writerGrantId` and checks the direct scope links among:

- pinned Domain Authority, Home, Host signing key, Domain and owner identity;
- pinned Reader Grant, Reader identity and Reader key;
- the selected Writer Grant and its signing identity/device key;
- the selected item, Writer Grant and KEK version;
- the current projection's Reader envelope versions.

The decryptor receives cloned in-memory evidence:

- current projection receipt;
- Domain record;
- Reader Grant and its lifecycle records;
- selected Writer Grant and only its lifecycle records;
- complete current rotation chain;
- selected item record.

ADR 0093 restore and the projector remain responsible for cryptographic
signature, manifest, lifecycle, rotation-cause and full-chain verification.
The access checks are a final coupling guard, not a second crypto
implementation.

The Sync package exposes only the decryptor interface. The Vault package stays
independent of Sync; a composition root adapts the evidence to the existing
`decryptPicoReaderCustodyItem` input. Raw KEKs and DEKs never cross that
boundary.

### State stability

The durable Reader state is read before restore, after evidence selection and
again after Vault decryption. Revision, pins, signed floor, verification time
and transport cursor must remain exactly unchanged.

If Sync advances or otherwise changes state during access, plaintext is not
delivered. The explicit caller may retry from the new current head. This is a
process-local consistency guard, not a cross-process file lock or platform
monotonic anchor.

### Synchronous plaintext handoff

`access` returns `void`. Plaintext is passed only to an explicit synchronous
consumer callback and is never placed in an access-object field, archive,
cache, event, log or dashboard payload.

Only one call may be active on an access instance. Reentrant access fails.
Abort is checked before restore, after restore, after decryption and after the
consumer. If Abort occurs during decryption, the plaintext is not handed to
the consumer.

A promise-like consumer result is rejected because it violates the synchronous
contract. JavaScript strings cannot be reliably zeroized: Vault zeroizes the
decrypted byte buffer and KEK/DEK material, while the access layer drops its
string reference at the end of the call. The explicit consumer is trusted to
decide what to display or retain; the API cannot claw back a string the
consumer deliberately captures.

### History and revocation semantics

Later Reader or Writer revocation does not rewrite history. An old item remains
decryptable only when:

- the exact item remains present in the current verified head;
- its Writer Grant was valid when the item was created;
- the Reader legitimately received the item's KEK version under the grant's
  `from_version` or `forward_only` semantics;
- Vault can open the exact historical version envelope with the pinned Reader
  key.

A revoked Reader receives no envelope for later rotations. A later item whose
KEK version is absent from the Reader projection fails during projection
verification and never reaches item access. Wrong Reader keys and unavailable
historical envelopes also fail in Vault.

## Gates

- **S14.1 — explicit current selection: Done.** One caller-supplied
  `packageId` must occur exactly once in the current restored head; missing,
  historical-only and duplicate evidence fails closed.
- **S14.2 — cross-history fork detection: Done.** Exact repeated records are
  accepted, while any different record with the same package id is rejected.
- **S14.3 — authority coupling: Done.** Domain, Reader, Writer, lifecycle,
  rotation, item and KEK-version links are assembled from one verified current
  projection and checked before Vault invocation.
- **S14.4 — ephemeral delivery: Done.** The access API returns no plaintext,
  persists nothing and hands the string only to an explicit synchronous
  callback.
- **S14.5 — lock, Abort and state stability: Done.** Reentrant access, Abort
  and any durable state change before delivery fail closed.
- **S14.6 — real-crypto and negative coverage: Done.** Tests bind current-head
  restore, repeated packages, old KEK access after later Reader and Writer
  revocation, missing later Reader envelopes, wrong keys, stale/forked/
  ambiguous evidence, cross-Domain/Writer swaps, state mismatch and async
  consumers.

## Consequences

Positive:

- the protected Reader archive now has a concrete, narrow use boundary;
- item choice cannot silently fall back to stale history or a conflicting
  package record;
- Vault remains the only component that sees raw key material and performs
  content decryption;
- no plaintext persistence or product-facing transport surface is introduced.

Negative and residual:

- each access reopens and reprojects the complete bounded ADR 0093 archive;
- the API requires an explicit package id and supplies no searchable catalog;
- JavaScript string plaintext cannot be zeroized after decoding;
- synchronous process-local locking does not coordinate multiple processes;
- a fully matching old state/archive backup still needs an external monotonic
  anchor to be distinguishable.

## Non-goals

- plaintext archive, cache, search index, event or diagnostic payload;
- automatic item selection, bulk decryption or Companion Memory import;
- Protected Display, mobile/desktop UI or Home Assistant UI integration;
- network adapter, public Relay or Foundation download endpoint;
- background scheduler, archive retention/compaction or multi-process lock;
- final Pico Link/Pico Home Link wire compatibility;
- Vault daemon/IPC, platform keystore, approval UX or recovery.

## References

- [ADR 0033](0033-key-lifecycle-rotation-revocation-and-recovery.md)
- [ADR 0078](0078-memory-domain-reader-membership-and-key-distribution-threat-model-and-direction.md)
- [ADR 0088](0088-reader-custody-multi-reader-and-kek-rotation.md)
- [ADR 0089](0089-authenticated-checkpoint-and-reader-custody-sync.md)
- [ADR 0090](0090-durable-reader-sync-floor-and-crash-safe-apply.md)
- [ADR 0093](0093-private-durable-reader-projection-archive-and-idempotent-receipts.md)
