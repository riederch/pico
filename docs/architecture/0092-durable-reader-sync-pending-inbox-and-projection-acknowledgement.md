# 0092 - Durable Reader-Sync Pending Inbox and Projection Acknowledgement

## Status

Accepted and implemented as the local crash-recovery slice following ADR 0091.
It stores one sealed Reader batch until its projection consumer acknowledges
durable acceptance. It is not a background scheduler, network adapter,
decrypted projection store or exactly-once side-effect claim.

## Context

ADR 0091 commits the signed Reader floor before invoking a projection consumer.
That protects anti-rollback progress, but a crash during the consumer leaves
the page cursor behind the floor. Restart can normally retrieve and verify the
same batch again. A long outage can, however, let that exact Relay record
expire before the consumer acknowledges it.

Blindly ignoring expiry would turn local recovery into a general stale-data
bypass. Persisting decrypted payloads, KEKs or DEKs would widen the custody
boundary. Advancing to the next signed floor before the current consumer
acknowledges would permit an unavailable Relay to strand the earlier
projection.

The Reader therefore needs a bounded write-ahead inbox whose relationship to
the signed floor, verification instant and consumer acknowledgement remains
recoverable across every local crash phase.

## Decision

### One sealed write-ahead record

`pico.sync.reader-custody-pending.v1` stores exactly one pending operation:

- the complete out-of-band Reader pins;
- the canonical `stagedAt` instant supplied to the bounded run;
- the durable signed floor before Apply, or `null` at genesis;
- the complete sealed ADR 0089 batch wrapper.

The pending record contains no opened payload, private key, KEK, DEK or item
plaintext. The sealed payload remains bounded by the opaque transport limit.
A second different batch conflicts until the first record is acknowledged.
Staging the exact same record is idempotent.

The ADR 0090 client state now stores `verifiedAt` beside its signed floor.
Successful Apply commits the projected floor and the evaluation instant in the
same atomic state replacement. Exact verification at a later instant refreshes
`verifiedAt`; cursor-only commits preserve it. The store rejects a verification
time before the manifest creation time or behind its previous durable value.
Because no Reader state has been deployed, this field is consolidated into the
existing strict v1 state instead of adding a compatibility migration.

### Stage, apply, consume, acknowledge

The runner processes one batch in this order:

1. durably stage the sealed batch, pins, base floor and run instant;
2. open and fully verify the batch, then atomically commit floor and
   `verifiedAt` through the ADR 0090 client;
3. invoke the projection consumer and wait for its durable acceptance;
4. delete the exact pending record and durably sync its parent directory;
5. only then process another batch or commit the completed page cursor.

A pending record is always resumed before another source read. Rollback below
the durable floor is obsolete and may be acknowledged without consumer
delivery. Gap, fork, invalid payload, store error and consumer error preserve
the pending record. A different acknowledgement value is rejected.

Consumer delivery remains at least once. Completion means the consumer has
made its own downstream effect durable; the runner cannot infer that property.
The consumer must remain idempotent by a stable signed batch or manifest
identifier. ADR 0093 supplies a concrete private sealed-batch archive and
receipt consumer that fulfills this contract for the local reference path.

The state and pending files are not claimed to form one filesystem
transaction. Their ordered state machine is the recovery protocol:

| Durable state after a stop | Restart behavior |
|---|---|
| no pending, old floor | source can deliver the batch again |
| pending, old floor | verify at the current trusted instant, then Apply |
| pending, matching new floor and `verifiedAt` | exact verified replay, then redeliver |
| no pending, new floor | acknowledgement completed or deletion outcome was uncertain; source reconciliation remains safe |

An exception after unlink but before directory durability may leave the caller
uncertain whether acknowledgement survived. Either outcome is safe: a
surviving pending record redelivers at least once; an absent record reconciles
from the older untrusted page cursor. Exactly-once delivery is not claimed.

### Narrow replay after expiry

Normal and not-yet-applied pending batches are always checked against the
current run instant. A staged record alone never bypasses expiry.

The runner may reuse `stagedAt` only when all of these facts agree:

- current configured pins equal the pending pins;
- the pending outer route and batch id match the durable signed floor;
- the pending base floor is either that exact floor or its exact predecessor,
  with the genesis case restricted to sequence 1;
- pending `stagedAt` equals the `verifiedAt` atomically stored with the current
  floor.

Even then, Vault reopens the sealed bytes and the projector repeats signature,
digest, scope, lifecycle, predecessor and exact-floor verification at that
stored instant. The result must be an exact replay with no floor change.
Tampered bytes or a changed time/floor binding fail before consumer delivery.

This is recovery of an operation already cryptographically accepted and
durably recorded before expiry, not permission to accept a newly encountered
expired batch. A crash before Apply leaves no matching floor/`verifiedAt` and
therefore still fails closed after expiry.

### Reference filesystem store

`PicoReaderCustodySyncFilePendingStore` follows the ADR 0090 reference-store
posture:

- deployment supplies a resolved path in a real private `0700` directory;
- an existing record must be a regular no-follow `0600` file;
- strict exact-key JSON is bounded to the opaque payload maximum plus 64 KiB;
- empty, malformed, oversized, permission-broad, symlinked or expired-at-stage
  records fail closed;
- staging writes an exclusive no-follow `0600` sibling, fsyncs it, atomically
  renames it and fsyncs the parent directory;
- acknowledgement compares the complete expected record, unlinks it and
  fsyncs the parent directory.

The store assumes one active writer for a Reader path. It is not a
cross-process mutex. Disk-full or stage failure occurs before Apply and cannot
advance the floor.

## Gates

- **S12.1 — bounded private inbox: Done.** One strict sealed pending record,
  private permissions, size bounds, atomic staging and exact idempotency are
  implemented.
- **S12.2 — ordered acknowledgement: Done.** Stage precedes Apply, durable floor
  precedes consumer, consumer completion precedes pending deletion, and
  deletion precedes the next floor/page cursor.
- **S12.3 — crash recovery: Done.** Failure before Apply, after floor commit,
  during consumer and during acknowledgement converges through the explicit
  state machine.
- **S12.4 — expiry-safe exact replay: Done.** Historical replay requires exact
  pending/floor/`verifiedAt` agreement and full cryptographic re-verification;
  an unverified expired pending batch remains rejected.
- **S12.5 — storage negatives: Done.** Conflict, mismatch, truncate, oversize,
  permissions, symlink, disk-full, tampered time/ciphertext and delete failure
  are test-bound.
- **S12.6 — honest scope: Done.** Delivery is at least once; single-writer,
  matching-backup rollback, transport omission and deployment concerns remain
  explicit.

## Consequences

Positive:

- an acknowledged-floor crash no longer depends on Relay retention for exact
  projection redelivery;
- no decrypted material is added to local sync persistence;
- a stage write failure cannot advance the cryptographic floor;
- expiry remains fail-closed unless durable state proves the exact historical
  verification being recovered.

Negative and residual:

- custom consumers still require durable idempotency; ADR 0093 supplies the
  default private reference materializer;
- every in-flight Reader can retain one potentially large sealed batch;
- separate state and pending files rely on ordered recovery, not atomic
  multi-file replacement;
- same-account file tampering can deny service, and a complete matching old
  state/pending backup remains indistinguishable without an external monotonic
  anchor;
- transport omission and an empty page remain indistinguishable.

## Non-goals

- automatic polling, retry scheduling or background synchronization;
- network transport, public Relay or Foundation Reader-download endpoints;
- final Pico Link/Pico Home Link wire formats or compatibility claims;
- decrypted projection persistence, automatic KEK unwrap or item decryption;
- exactly-once non-idempotent side effects;
- cross-process locking, platform monotonic storage, Vault daemon/IPC,
  recovery or companion UX.

## References

- [ADR 0033](0033-key-lifecycle-rotation-revocation-and-recovery.md)
- [ADR 0078](0078-memory-domain-reader-membership-and-key-distribution-threat-model-and-direction.md)
- [ADR 0089](0089-authenticated-checkpoint-and-reader-custody-sync.md)
- [ADR 0090](0090-durable-reader-sync-floor-and-crash-safe-apply.md)
- [ADR 0091](0091-bounded-reader-sync-run-and-cursor-reconciliation.md)
- [ADR 0093](0093-private-durable-reader-projection-archive-and-idempotent-receipts.md)
