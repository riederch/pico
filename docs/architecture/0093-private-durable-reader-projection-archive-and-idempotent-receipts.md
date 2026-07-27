# 0093 - Private Durable Reader Projection Archive and Idempotent Receipts

## Status

Accepted and implemented as the concrete durable consumer for ADR 0092. It
atomically archives the still Reader-sealed batch with a minimal verified
receipt and can restore the full projection chain through Vault. It is a
bounded Node filesystem reference, not a plaintext store, scalable database,
network adapter or exactly-once side-effect claim.

## Context

ADR 0092 retains one sealed batch until an injected projection consumer reports
durable acceptance. The ordering is crash-safe, but the repository had no
consumer that fulfilled that contract. A process could acknowledge Pending
after an in-memory callback and then depend on the Relay to retrieve the same
evidence again.

Persisting the opened ADR 0089 payload would expose Home, Identity, Domain,
grant, writer and item metadata at rest and would duplicate an encryption
decision. Persisting only a receipt would prove local acknowledgement but
would not retain the evidence needed for later Reader use. The original batch
already provides the desired confidentiality: it is sealed to the exact
Reader's X25519 key and its wrapper is digest-bound.

The durable consumer therefore archives that exact protected object, not the
opened projection.

## Decision

### Protected record and minimal receipt

`pico.sync.reader-custody-protected-projection.v1` stores:

- the unchanged sealed ADR 0089 batch wrapper;
- a `pico.sync.reader-custody-projection-receipt.v1` containing only opaque
  route, batch id, positive sequence, signed manifest digest, predecessor
  digest and the successful verification instant.

The record does not persist Reader pins, Home, Identity, Domain, grant, writer,
item or content metadata from the opened payload. It contains no private key,
raw KEK, DEK or content plaintext. No new at-rest primitive is introduced: the
Reader-addressed sealed box remains the confidentiality boundary and Vault is
still required to open it.

`PicoReaderCustodySyncClientApplySuccess` carries the exact sealed batch that
produced the verified projection. The materializer checks:

- batch route, id and expiry against the opened signed manifest;
- the BLAKE2b-256 sealed-payload digest;
- the manifest digest against the projected signed floor;
- exact state-floor/projection-floor equality;
- sequence, KEK/lifecycle floors, creation and verification instants.

Only a successful ADR 0090 Apply result is a valid materialization input.

### Contiguous archive and stable idempotency

`pico.sync.reader-custody-protected-projection-archive.v1` is bound to one
opaque route and begins at sequence 1 with the genesis predecessor. Every later
record advances by one and names the previous receipt's manifest digest.

The stable receipt identity is route, sequence, batch id, manifest digest and
predecessor digest together with the exact sealed wrapper. Redelivery of that
identity is a no-op. A later successful re-verification instant is accepted
without rewriting the original receipt; an earlier instant is a rollback.
Different bytes or identity at the same sequence are a fork. A missing
sequence is a gap.

Only the current archive head can be delivered idempotently. An attempted
delivery below the head means the archive is ahead of the supplied sync floor
and fails closed. This catches inconsistent state/archive restores instead of
silently acknowledging an older floor.

### Atomic reference store and quota

`PicoReaderCustodySyncProtectedProjectionFileStore` stores the complete
archive as one strict JSON file:

- the deployment supplies a resolved file path and expected opaque route;
- the immediate parent is a real `0700` directory;
- an existing archive is a regular no-follow `0600` file;
- every load checks exact keys, contiguous receipt chain and sealed-payload
  digests;
- configurable limits can only narrow the hard ceilings of 1,000 records and
  256 MiB;
- every append rewrites a `0600` exclusive no-follow sibling, fsyncs it,
  atomically renames it and fsyncs the parent directory;
- malformed, empty, truncated, oversized, permission-broad, symlinked,
  cross-route or over-quota state fails closed.

The full-file rewrite is deliberately simple and atomic for the reference
slice. It is O(total archive size), can require space for old and temporary
copies simultaneously and is not the final large-history storage engine.
A deployment may implement the same append/receipt contract with a database or
platform store without weakening its ordering.

As with ADRs 0090–0092, one active writer is assumed. This file is not a
cross-process lock and revision protocol.

### Runner consumer and crash ordering

`createPicoReaderCustodySyncProjectionMaterializationConsumer` adapts the store
to the ADR 0092 consumer interface and checks Abort before and after the
durable append.

The complete local order is:

1. stage the sealed Pending record;
2. verify it and commit signed floor plus `verifiedAt`;
3. atomically append sealed record plus receipt to the projection archive;
4. delete Pending durably;
5. process another floor or commit the completed page cursor.

If quota, disk or validation fails before archive replacement, Pending remains
and the floor can be replayed. If the process stops after archive replacement
but before Pending acknowledgement, restart redelivers the same projection;
the archive returns an idempotent no-op and Pending can then be acknowledged.

### Cryptographic restore

An archive is not trusted merely because its JSON and sealed-payload digests
parse. `restore`:

1. requires configured pins to equal the current strict ADR 0090 state;
2. opens every archived sealed batch through the injected Vault boundary at
   its stored successful verification instant;
3. reprojects the entire signed chain from genesis;
4. compares every projected floor and predecessor with its receipt;
5. requires the restored head to equal the current durable client floor and
   requires the client verification time not to precede the archived receipt.

Opened evidence and projection views exist only in memory. Historical
verification instants are usable because the archive is a contiguous local
record of already accepted signed floors and is bound to the current head.
This does not let an arbitrary newly encountered expired batch enter the
archive: normal Apply and ADR 0092 staging remain mandatory.

A complete matching old client-state/archive backup is still indistinguishable
without an external monotonic anchor. Same-account tampering can deny service,
but changed ciphertext, receipt chains or state heads cannot silently become a
different current projection.

## Gates

- **S13.1 — protected materialization: Done.** Only the unchanged
  Reader-sealed batch and minimal opaque receipt are persisted; opened evidence
  and key/plaintext material are absent.
- **S13.2 — stable idempotency: Done.** Exact head replay is a no-op; time
  rollback, fork, gap and archive-ahead conditions fail closed.
- **S13.3 — private bounded store: Done.** Strict `0700`/`0600`, no-follow,
  file/directory fsync, atomic replace and configurable record/byte quotas are
  implemented.
- **S13.4 — acknowledged ordering: Done.** The concrete consumer commits the
  archive before ADR 0092 removes Pending; uncertain post-commit restart is
  idempotent.
- **S13.5 — verified restore: Done.** Vault reopen, full genesis projection,
  per-receipt checks and exact current-state head binding are implemented.
- **S13.6 — negative coverage and honest scope: Done.** Tamper, truncate,
  oversize, permissions, symlink, quota, crash, state mismatch and real-crypto
  restore are test-bound without network, plaintext-store or exactly-once
  claims.

## Consequences

Positive:

- ADR 0092 now has a concrete consumer that actually makes acknowledgement
  durable;
- Relay expiry no longer removes already materialized Reader evidence;
- local storage retains the original Reader confidentiality boundary instead
  of inventing another key hierarchy;
- restore validates both the complete signed chain and the current durable
  head before exposing opened evidence in memory.

Negative and residual:

- archive append cost grows with the complete bounded file;
- deployments must size quota and temporary free space explicitly;
- the sealed archive still requires the Reader's Vault key for use;
- one writer, matching-backup rollback and same-account denial-of-service
  limits remain;
- item selection, KEK unwrap, content decryption and plaintext exposure policy
  are not supplied by this archive.

## Non-goals

- plaintext, opened Evidence, raw KEK or DEK persistence;
- automatic item decryption, indexing, search or companion memory import;
- exactly-once arbitrary side effects;
- archive compaction, deletion, retention or multi-process locking;
- network transport, public Relay or Foundation Reader-download endpoints;
- final Pico Link/Pico Home Link compatibility;
- Vault daemon/IPC, platform keystore, recovery or companion UX.

## References

- [ADR 0033](0033-key-lifecycle-rotation-revocation-and-recovery.md)
- [ADR 0078](0078-memory-domain-reader-membership-and-key-distribution-threat-model-and-direction.md)
- [ADR 0089](0089-authenticated-checkpoint-and-reader-custody-sync.md)
- [ADR 0090](0090-durable-reader-sync-floor-and-crash-safe-apply.md)
- [ADR 0091](0091-bounded-reader-sync-run-and-cursor-reconciliation.md)
- [ADR 0092](0092-durable-reader-sync-pending-inbox-and-projection-acknowledgement.md)
