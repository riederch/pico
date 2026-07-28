# 0095 - Ephemeral Reader Item Catalog and Local Presentation Handoff

## Status

Accepted and implemented as the process-local discovery and presentation layer
above ADR 0094. It derives a bounded current-head catalog, issues ephemeral
selection objects bound to the exact durable Reader state and presents one
decrypted item through a synchronous local port. It is not a database, search
index, REST/WebSocket surface, dashboard integration or user-interface claim.

## Context

ADR 0094 accepts one explicit `packageId`, restores the protected archive,
assembles exact evidence and hands plaintext to a synchronous callback. That
is a safe decryption primitive, but the caller still has to know a current
package id out of band.

Returning all opened item records would expose ciphertext, signatures, Domain,
Reader, Writer and KEK metadata that a presentation caller does not need.
Persisting a convenient index would create a new sensitive at-rest surface and
would need its own encryption, lifecycle and backup decisions. Returning a
serializable package-id token would also encourage stale handles to survive
process restarts or cross a network boundary.

The missing layer is deliberately smaller:

- enumerate only minimal descriptors from the current verified projection;
- retain the real package id and state binding only in process memory;
- reject a selection if any bound state field changed;
- route presentation back through ADR 0094 rather than decrypting directly;
- expose no Foundation or Companion transport surface yet.

## Decision

### Current-head catalog

`PicoReaderCustodySyncItemCatalog.list` loads the current strict ADR 0090
state, restores the complete ADR 0093 chain and derives entries only from the
restored head.

Each descriptor contains:

- a process-local `PicoReaderCustodySyncItemSelection`;
- `memoryItemId`;
- `contentType`;
- `createdAt`.

It deliberately omits package id, Home, Domain, Reader, Writer, grant,
lifecycle, rotation, KEK version, ciphertext, signatures and archive receipt.
The three visible metadata fields can still be sensitive. They are delivered
only to the explicit local callback and are not persisted or published by the
catalog.

Catalog order is deterministic: creation instant, then memory item id, then
package id as an internal tie-breaker. Empty current heads produce an empty
catalog.

The hard ceiling is 1,000 entries. Deployments may configure a lower positive
limit, never a higher one. An oversized current head fails instead of silently
truncating, because a partial list must not be mistaken for a complete current
catalog.

### Catalog evidence checks

Before descriptor delivery, the catalog checks:

- restored head and receipt exactly match the current signed floor;
- current package ids are unique and exactly match the projection view;
- current memory item ids are unique;
- package id, memory item id, content type and creation instant are canonical;
- every current item resolves to exactly one current Writer Grant;
- Domain, Reader, Writer, item and Reader-envelope-version scope links match;
- every occurrence of a current package id in older restored projections is
  the exact same full item record.

An older item absent from the current head is not listed. A different older
record with the same current package id is a fork and rejects the complete
catalog. ADR 0093 restore remains the cryptographic verifier; these checks
prevent a catalog or custom restore-source composition from weakening ADR
0094 selection semantics.

### Ephemeral selections

`PicoReaderCustodySyncItemSelection` is a frozen object with no enumerable
state. Its object identity is registered in a catalog-owned `WeakMap`.
Construction, copying a prototype or deserializing `{}` does not register a
selection and grants no access.

The private binding contains:

- exact package id;
- complete cloned client state, including pins, revision, signed manifest
  floor, verification instant and transport cursor;
- the minimal descriptor metadata.

The binding is available only while both the catalog instance and selection
object remain alive. It is not serializable, stable across process restart or
valid in another catalog instance. It is an in-process stale-selection guard,
not a bearer credential, authorization token or replacement for Reader/Vault
authority.

Any state change invalidates the selection, including a cursor-only revision.
This strictness is intentional: callers list again rather than guessing
whether a change was security-relevant.

### State binding through ADR 0094

Presentation first checks the selection binding against the current state.
It then constructs ADR 0094 item access with a state source that repeats the
same binding check for every internal state load.

This closes the gap where state could change after the first handle check but
before archive restore or Vault decryption. The item is still selected and
decrypted only by ADR 0094. A changed state, archive mismatch, item fork,
wrong Reader or missing KEK envelope fails before the presentation port.

The reference remains process-local and inherits the single-writer limitation
of ADRs 0090–0094. It does not create a cross-process filesystem lock or solve
matching-backup rollback.

### Synchronous local presentation port

`present` accepts one registered selection and one explicit synchronous
`PicoReaderCustodySyncItemPresentationPort`. The port receives a frozen object
containing only:

- `memoryItemId`;
- `contentType`;
- `createdAt`;
- plaintext.

The method returns `void`. The catalog stores no plaintext and emits no event,
log, cache, file, HTTP response, WebSocket payload or dashboard message.
Catalog listing and presentation share one reentrancy lock. Abort is checked
by both the catalog and ADR 0094.

Promise-like catalog consumers and presentation ports are rejected. As in ADR
0094, JavaScript cannot revoke a string already passed to an explicit caller;
the caller remains responsible for anything it deliberately retains. This API
defines a narrow trusted composition seam, not a sandbox for hostile UI code.

## Gates

- **S15.1 — bounded current catalog: Done.** Only the current restored head is
  listed, deterministically, with an empty-list result and a non-truncating
  hard ceiling of 1,000 entries.
- **S15.2 — minimal descriptors: Done.** Catalog output contains only a
  selection object, memory item id, content type and creation instant; package
  and authority/key evidence remain internal.
- **S15.3 — ephemeral state-bound selection: Done.** Selection identity is
  catalog-local, non-serializable and bound to exact pins, revision, floor,
  verification time and cursor.
- **S15.4 — ADR 0094 presentation: Done.** One selection re-enters the complete
  current-head evidence and Vault-decryption boundary before a frozen local
  presentation is delivered.
- **S15.5 — lock, Abort and race closure: Done.** List/present reentrancy,
  Abort, async callbacks, pre-access staleness and state changes between handle
  check and item access fail closed.
- **S15.6 — real-crypto and structural negatives: Done.** Tests bind
  old-version presentation after later Reader/Writer revocation, forward-only
  history, empty/oversized catalogs, duplicate/fork, wrong Writer/Domain,
  foreign selections and state races.

## Consequences

Positive:

- local callers can discover current Reader items without knowing package ids;
- no durable plaintext or metadata index is introduced;
- serialized or cross-catalog handles cannot select an item;
- presentation cannot bypass archive restore, evidence selection or Vault.

Negative and residual:

- listing and each presentation re-open and re-project the bounded archive;
- catalog metadata is visible to the trusted callback and can be retained by
  that caller;
- every state revision invalidates all prior selections;
- the API supplies no pagination, search, labels, previews or UI;
- process-local identity and checks do not coordinate multiple processes.

ADR 0096 supplies the one-shot Vault-session lifecycle around this primitive:
it binds the Reader key before listing, permits at most one presentation and
locks the session after every outcome.

## Non-goals

- durable catalog, metadata database, cache, search index or pagination;
- package-id export, stable deep link or cross-process selection token;
- REST, WebSocket, dashboard, mobile, desktop or Home Assistant surface;
- Companion Memory import, bulk decryption or automatic presentation;
- network adapter, public Relay or background synchronization;
- archive retention/compaction or multi-process locking;
- final Pico Link/Pico Home Link compatibility;
- Vault daemon/IPC, platform keystore, approval or recovery UX.

## References

- [ADR 0078](0078-memory-domain-reader-membership-and-key-distribution-threat-model-and-direction.md)
- [ADR 0088](0088-reader-custody-multi-reader-and-kek-rotation.md)
- [ADR 0089](0089-authenticated-checkpoint-and-reader-custody-sync.md)
- [ADR 0090](0090-durable-reader-sync-floor-and-crash-safe-apply.md)
- [ADR 0093](0093-private-durable-reader-projection-archive-and-idempotent-receipts.md)
- [ADR 0094](0094-explicit-reader-item-access-and-ephemeral-vault-decryption.md)
- [ADR 0096](0096-reader-access-session-and-vault-lock-lifecycle.md)
