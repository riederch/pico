# 0090 - Durable Reader-Sync Floor and Crash-Safe Apply

## Status

Accepted and implemented as the local Reader client persistence slice following
ADR 0089. It defines a Node filesystem reference store and an apply boundary,
not a deployable client, public Relay or platform monotonic-storage claim.

## Context

ADR 0089 verifies a complete, reader-addressed sync payload and rejects replay,
rollback, gaps and forks while a projector retains its last signed-manifest
floor. Supplying a restored floor to a new projector is possible, but the
caller previously had to make that floor durable and order key use around the
write correctly.

A crash after exposing newly verified envelopes but before persisting their
floor would lose anti-rollback progress. Conversely, treating a Relay cursor as
the durable floor would grant an untrusted transport authority it does not
have. A malformed or partially written local state must not silently reset a
Reader to genesis.

## Decision

### Explicit client state

`pico.sync.reader-custody-client-state.v1` stores exactly:

- a positive local revision used for stale-writer detection;
- the complete out-of-band Reader pins from ADR 0089;
- the last fully verified signed-manifest floor;
- a nullable opaque transport cursor.

The signed-manifest floor is the only sync-progress authority. It binds route,
batch, positive sequence, manifest digest, KEK/lifecycle maxima and creation
time. A cursor is an operational pagination hint: it can move independently,
be lost or be replaced without lowering, advancing or authenticating the
floor. The state contains no private key, raw KEK, DEK or plaintext.

The first durable floor must be sequence 1. Later writes retain the exact floor
or advance by exactly one sequence with nondecreasing KEK, lifecycle and
creation floors. Those storage checks are defense in depth; only a successful
ADR 0089 projection proves the signature, predecessor digest and complete
evidence.

### Verify, persist, then expose

`PicoReaderCustodySyncClient.apply` performs one ordered operation:

1. load and strictly validate the current state and configured pins;
2. ask the injected Vault boundary to open the addressed sealed batch;
3. construct a fresh projector from the durable floor and verify/project the
   complete payload;
4. commit the resulting floor and optional cursor;
5. only after the commit succeeds return the payload, envelope/item references
   and projection view to the caller.

Projection rejection performs no write. A write error throws and exposes no
result. A fresh projector is used for every call so a failed state commit
cannot leave an in-memory projector ahead of disk. Exact replay against an
unchanged floor and cursor is verified but causes no new revision.

This boundary opens the sealed evidence before the commit but does not unwrap a
KEK or decrypt an item. Vault key use remains downstream of a successful
return.

### Reference filesystem store

`PicoReaderCustodySyncFileStateStore` is the Node reference implementation:

- its resolved state path is deployment-configured;
- the immediate parent directory must be a real `0700` directory;
- an existing state must be a regular, no-follow `0600` file;
- input is strict JSON with exact schema keys and at most 64 KiB;
- malformed, empty, oversized, permission-broad or symlink state fails closed;
- commits use a `0600`, no-follow, exclusive sibling temporary file;
- the temporary file is completely written and `fsync`ed, atomically renamed
  over the target, then the parent directory is `fsync`ed;
- expected revision and pins reject sequential stale or cross-scope writes.

The reference store assumes one active writer for a Reader state path. Revision
checks detect stale sequential use but are not a cross-process lock. A
deployment must ensure single-writer ownership or add a platform-specific
locking layer without weakening the commit order.

### Crash, restore and rollback boundary

If execution stops before rename, the previous state remains authoritative and
the caller received no new projection. A harmless orphan temporary sibling may
remain after process termination and is never read as state.

If execution stops after rename but before or during the directory `fsync` or
before returning, the outcome may be uncertain to that invocation. On restart,
loading the resulting exact floor and replaying the same signed batch is safe
and idempotent: either it advances the old state or verifies as an exact replay
of the new state.

A truncated or structurally altered current state does not become “no state”;
startup/apply fails. A cursor copied from another snapshot cannot authorize an
older manifest. A floor copied across different pins fails scope checks.

The file is protected by local filesystem ownership and permissions, not by a
hardware monotonic counter or independent state signature. Restoring a
complete, internally matching old Reader state together with its then-valid
signed batches is indistinguishable from that historical state. Preventing
such full-backup rollback requires a future platform keystore, monotonic anchor
or trusted continuity service. This ADR makes no stronger claim.

## Gates

- **S10.1 — explicit authority state: Done.** Versioned strict state separates
  pins, signed floor, local revision and untrusted cursor.
- **S10.2 — durable reference store: Done.** Private bounded file handling,
  atomic replace and file/directory durability boundaries are implemented.
- **S10.3 — ordered apply: Done.** Batch open and full projection precede the
  floor commit; projections are exposed only after successful persistence.
- **S10.4 — restart and crash safety: Done.** Exact replay, cursor swap,
  rollback/gap/fork, truncated/oversized/permission/symlink state and crashes
  immediately before or after commit are test-bound.
- **S10.5 — honest scope: Done.** Single-writer and matching-backup rollback
  limitations are explicit; no public transport or platform anchor is claimed.

## Consequences

Positive:

- a Reader restart retains the cryptographic rollback floor independently of a
  Relay cursor;
- a persistence failure cannot expose newly projected key/item references;
- uncertain post-rename crashes converge through exact signed replay;
- the implementation requires no Foundation endpoint, database table or
  migration.

Negative and residual:

- the reference implementation is Node/filesystem-specific;
- deployments must choose and exclusively own a private state directory;
- same-account state tampering is a denial-of-service risk, and matching old
  backup rollback remains possible without an external anchor;
- the client is an explicit apply primitive, not an automatic sync scheduler.

## Non-goals

- public Relay, Registry or Foundation Reader download endpoints;
- final Pico Link or Pico Home Link wire compatibility;
- multi-process scheduling or distributed state locking;
- Vault daemon/IPC, automatic KEK unwrap or item decryption;
- platform keystore, TPM, Secure Enclave, recovery or backup UX;
- automatic reader/key rotation execution.

## References

- [ADR 0033](0033-key-lifecycle-rotation-revocation-and-recovery.md)
- [ADR 0078](0078-memory-domain-reader-membership-and-key-distribution-threat-model-and-direction.md)
- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0088](0088-reader-custody-multi-reader-and-kek-rotation.md)
- [ADR 0089](0089-authenticated-checkpoint-and-reader-custody-sync.md)
