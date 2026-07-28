# 0096 - Reader Access Session and Vault Lock Lifecycle

## Status

Accepted and implemented as the process-local one-shot lifecycle around ADR
0095 catalog and presentation access. It acquires one narrow capability over
an already opened Vault session, binds the public Reader key identity before
restore, permits one catalog selection and at most one presentation, then
locks the Vault session on every exit path. It is not an unlock user
interface, daemon, IPC protocol, platform-keystore integration or background
worker.

ADR 0098 later supplies the deployable provider this ADR deliberately left
open: the unlock port is implemented by a bounded lease over the ADR 0097
Vault daemon, with this lifecycle unchanged. One difference is named there
rather than hidden here — over the daemon, the mandatory `lock()` closes the
run's lease instead of locking the person's own unlock window.

## Context

ADR 0095 deliberately accepts externally supplied payload-open and
item-decrypt functions. That keeps passphrases and private keys out of Sync,
but leaves session acquisition, key-role matching, duration and final locking
to every caller. A caller could otherwise retain an unlocked session across
multiple catalog or presentation operations, accidentally combine functions
from different sessions, retry an unlock invisibly or omit locking after an
exception.

The missing boundary must preserve the existing package direction:
`@pico/sync` must not depend on `@pico/vault`, and Sync must never receive a
passphrase or private-key bytes. At the same time, Vault needs to supply a
concrete adapter that binds batch opening, item decryption, idle checks and
locking to exactly one `PicoVaultSession`.

## Decision

### One-shot operation

`PicoReaderCustodySyncAccessSession.run` performs one synchronous operation:

1. read the injected monotonic clock;
2. invoke the unlock port exactly once;
3. validate the returned session role and fingerprint;
4. list the current ADR 0095 catalog once;
5. accept either no selection or one catalog selection;
6. if selected, present exactly that one item through ADR 0095;
7. lock and verify the session in `finally`.

The orchestrator object may serve later independent runs, but every `run`
acquires a fresh capability and closes it before returning. A selection and
presentation port must either both be present or both be absent. Retained
selection objects are useless after the run because their catalog instance is
not exposed.

Selection and presentation remain synchronous. Promise-like unlock or
selection results fail. There is no retry, fallback key, implicit unlock,
multi-item loop or continuation after a failed presentation.

### Narrow unlock capability

The injected unlock port receives one frozen object containing only:

- the expected Reader key fingerprint;
- the monotonic opening instant;
- the configured maximum duration.

It receives the caller's `AbortSignal` separately. It does not receive
archive records, Domain evidence or a passphrase field. The port may return
`undefined` when no unlocked session is available; that fails closed.

The returned `PicoReaderCustodySyncUnlockedAccessSession` exposes only:

- public key role and fingerprint metadata;
- `isLocked` and `lock`;
- the ADR 0093 batch opener;
- the ADR 0094 item decryptor.

An unlock implementation is part of the trusted local composition. It must be
synchronous and retain responsibility for locking any Vault session that it
opens but does not return, for example if its own unlock work throws. Once a
valid capability is returned, the orchestrator owns its close path.

### Vault adapter and package direction

`createPicoVaultReaderCustodySyncAccessSession` produces a frozen structural
implementation of the Sync capability without importing Sync into Vault. Its
four operations close over exactly one `PicoVaultSession`.

Every successful `isLocked({ nowMs })` records the orchestrator's current
monotonic instant. Subsequent sealed-batch opening and item decryption pass
that same instant into Vault key use. This keeps Vault idle-autolock and the
orchestrator duration checks on one injected time base rather than silently
falling back to wall-clock time.

The adapter exposes no encrypted keyfile, passphrase, public-key bytes beyond
the existing metadata method or raw private/KEK/DEK bytes. Plaintext still
crosses only the synchronous ADR 0095 presentation port.

### Role, fingerprint and state binding

Before any archive restore, the orchestrator requires:

- key role exactly `device_key_agreement`;
- key fingerprint exactly equal to the pinned
  `readerKeyFingerprintHex`;
- an unlocked session at the current monotonic instant.

ADR 0095 then retains its exact pins, revision, signed floor,
`verifiedAt` and cursor binding. The orchestrator checks session time and lock
state before listing, after selection, before presentation and after
presentation. A state change between list and present therefore fails inside
the existing selection binding and still reaches the session-lock `finally`.

### Duration, Abort and locking

The hard maximum access duration is five minutes. A deployment may configure
a lower positive safe-integer duration, never a higher one. Clock rollback,
invalid clock values, duration expiry, Vault idle lock and Abort all fail.

The orchestrator is non-reentrant. An attempted nested run fails before a
second unlock-port call. Because all callbacks are synchronous, duration and
Abort are admission checks at explicit boundaries; JavaScript cannot preempt
arbitrary synchronous callback code already running.

After the unlock port has returned a valid capability, `lock` runs after:

- successful list-only access;
- successful presentation;
- wrong role or fingerprint;
- initially locked, idle-locked or expired sessions;
- Abort, state race, decrypt failure or presentation failure;
- any other restore, selector or evidence error.

The orchestrator calls `isLocked` after `lock`. A throwing lock or a session
that remains unlocked raises
`reader_sync_access_session_lock_failed`. This security error supersedes the
earlier operation error because successful closure cannot be claimed.

## Gates

- **S16.1 — one-shot orchestration: Done.** Each run unlocks once, lists once
  and performs zero or one matching presentation; reentrancy and async ports
  fail.
- **S16.2 — exact Reader session: Done.** Role and pinned fingerprint are
  checked before restore, and locked, wrong-role and wrong-fingerprint
  sessions fail closed.
- **S16.3 — bounded lifetime: Done.** A monotonic injected clock, five-minute
  hard ceiling, lower deployment limit, clock-rollback checks and Vault idle
  state bound the operation.
- **S16.4 — mandatory lock: Done.** The returned session is locked and its
  state verified in `finally` after success, error or Abort; lock failure is
  explicit.
- **S16.5 — custody-preserving adapter: Done.** Vault binds opener, decryptor,
  time checks and lock to one session while Sync receives no passphrase or
  key bytes.
- **S16.6 — lifecycle negatives: Done.** Real-crypto tests cover successful
  presentation, wrong/locked/expired/idle sessions, no hidden re-unlock,
  reentrancy, Abort, clock rollback, selection-state race, decrypt and
  presentation errors, and verified final locking.

## Consequences

Positive:

- a local Reader access attempt has a single explicit key lifetime;
- the correct Reader key is proven before archive bytes are opened;
- success and exceptional paths share one verified close boundary;
- Sync remains independent of Vault implementation and unlock mechanics.

Negative and residual:

- the unlock port is trusted to return one internally consistent capability
  and to close sessions it opens but never returns;
- synchronous code cannot be forcibly interrupted in the middle of a KDF,
  restore, decryptor or presentation callback;
- a lock failure can be detected and surfaced but cannot be repaired by Sync;
- JavaScript strings retained by an explicit presentation caller remain
  non-zeroizable.

## Non-goals

- passphrase prompt, biometric flow or protected-display UX;
- platform keystore, secure enclave or operating-system credential store;
- deployable Vault daemon, IPC protocol or approval service;
- recovery, lost-device or key-rotation user experience;
- durable session, cached unlock, background or bulk decryption;
- catalog persistence, search, Companion Memory import or preview generation;
- Foundation endpoint, REST, WebSocket, Relay or network adapter;
- cross-process lock, automatic synchronization or final Pico Link
  compatibility.

## References

- [ADR 0078](0078-memory-domain-reader-membership-and-key-distribution-threat-model-and-direction.md)
- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0090](0090-durable-reader-sync-floor-and-crash-safe-apply.md)
- [ADR 0093](0093-private-durable-reader-projection-archive-and-idempotent-receipts.md)
- [ADR 0094](0094-explicit-reader-item-access-and-ephemeral-vault-decryption.md)
- [ADR 0095](0095-ephemeral-reader-item-catalog-and-local-presentation-handoff.md)
- [ADR 0098](0098-reader-access-lease-over-the-vault-daemon.md)
