# 0098 - Reader Access Lease over the Vault Daemon

## Status

Accepted and implemented as the first real consumer migration onto the ADR
0097 daemon contract. It lifts the ADR 0096 Reader access chain off the
in-process `@pico/vault` library and onto the local socket: a bounded
per-run **reader-access lease** carries payload opening and item decryption
across the process boundary, and a consumer-side synchronous bridge
preserves the ADR 0096 synchronous port contract byte for byte. It is not a
network surface, approval UX, platform-keystore integration, per-client
authority model or background worker.

## Context

ADR 0096 fixed the Reader access lifecycle around one already opened Vault
session: one unlock port call, exact role and fingerprint binding before
restore, one catalog listing, at most one presentation, and a verified lock
in `finally`. ADR 0097 then made the Vault a real process and refused
`device_key_agreement` unlock with `key_role_not_served`, because no wire
family existed that such a session could serve — an unlocked but unusable
key would have been pure exposure.

That leaves the strand exactly one step short of its point. Reader access
still runs `@pico/vault` inside the consumer process, so the reader's
private key still materializes in the memory of whatever program lists a
catalog. The daemon exists but has no consumer; the ADR 0096 unlock port
still has no deployable provider.

The blocker recorded when ADR 0097 landed was a contract question, not an
implementation detail: **ADR 0096 is synchronous on purpose, and sockets are
not.** Every port in that chain — `metadata`, `isLocked`, `lock`,
`openPayload`, `decryptItem`, the selector and the presentation port — must
return synchronously; promise-like results are rejected by name. That rule
is not incidental. It is what makes the state-binding checks of ADRs
0094–0096 race-free: between `assertUsable()` and the use it guards, no
other turn of the event loop can move the pins, the floor, the revision or
the lock state. Making the chain asynchronous to fit a socket would reopen
precisely the races those three ADRs closed.

## Scope

Covers: the reader-access lease families over the ADR 0097 contract; lease
binding, lifetime and closure semantics; the lease-scoped frame budget; the
`device_key_agreement` unlock lift; the plaintext boundary across the
socket; the consumer-side synchronous bridge and the structural capability
adapter it produces; and the threat model deltas this introduces.

Does not cover: any network or remote surface; `SO_PEERCRED` or per-client
authority (ADR 0097 Gate D7); per-request or per-family approval UX;
platform-keystore unlock (ADR 0081 Gate P3); recovery; migration of the
claim, checkpoint, envelope or rotation ceremonies onto the daemon;
background or scheduled synchronization; multi-lease or multi-consumer
concurrency; and any change to ADR 0093–0096 semantics, storage formats or
the `@pico/sync` public behaviour.

## Decision

### The lease resolves the synchronicity conflict

The chain stays synchronous. Three things make that honest across a socket:

1. **A per-run lease on the daemon.** One `reader-access.open` request
   binds a bounded capability over the already unlocked Vault session to
   exactly one connection. Subsequent requests carry the lease id and are
   individually cheap. The lease *is* the ADR 0096 capability, expressed as
   daemon state instead of a JavaScript object.
2. **A consumer-side synchronous bridge.** A worker thread owns the socket
   and performs the roundtrip; the calling thread blocks on
   `Atomics.wait` and collects the reply with `receiveMessageOnPort`. The
   caller therefore observes an ordinary synchronous call, and — this is
   the part that matters — the calling thread genuinely does not turn its
   event loop while the request is outstanding. The ADR 0096 no-interleaving
   property is preserved rather than approximated.
3. **`lock()` is lease close.** The mandatory ADR 0096 close path maps onto
   one idempotent request, and a closed or unknown lease reports
   `locked: true` rather than an error, so `lockReaderSyncAccessSession`
   verifies closure exactly as it does against the in-process adapter.

Rejected alternatives, recorded because they will be proposed again:

- **Make ADR 0096 asynchronous.** Rejected: the synchronous contract is the
  race-freedom argument of ADRs 0094–0096, not a stylistic choice. An async
  chain would need a fresh state-stability analysis at every await point.
- **Move archive, catalog and presentation into the daemon.** Rejected: the
  ADR 0093 archive is the consumer's own durable state and the presentation
  port is a consumer surface. Absorbing them would turn the Vault into a
  projection store and a UI boundary, which is the opposite of the ADR 0081
  exclusive-custody direction.
- **Synchronous socket I/O without a worker.** No supported Node core API
  exists; the alternatives are native bindings (a supply-chain decision of
  its own) or subprocess round-trips (worse in every dimension).

### Lease families

Five families extend the ADR 0097 contract, all versioned and label-checked
exactly like the existing ones:

| Family | Purpose | Result crosses the boundary |
|---|---|---|
| `pico.vault.daemon.reader-access.open.v1` | open one lease over the unlocked session; requires role `device_key_agreement` and the exact pinned Reader fingerprint | lease id, public role and fingerprint, effective duration |
| `pico.vault.daemon.reader-access.is-locked.v1` | lease liveness | `locked` boolean |
| `pico.vault.daemon.reader-access.open-payload.v1` | ADR 0089 sealed-batch open | the opened payload record |
| `pico.vault.daemon.reader-access.decrypt-item.v1` | ADR 0094 item decryption | the item plaintext |
| `pico.vault.daemon.reader-access.close.v1` | close the lease | confirmation |

At most one lease exists daemon-wide, bound to the connection that opened
it. A second `open` — on the same or another connection — fails with
`reader_access_lease_active`. The lease id is a random 16-byte token,
carried in every lease-bearing request: a retained adapter therefore cannot
address a later lease, it can only observe that its own is gone.

`decrypt-item` receives exactly the five evidence records the Vault
decryptor consumes (domain, reader grant, writer grant, rotations, item).
The ADR 0093 receipt and the lifecycle record sets that `@pico/sync` carries
alongside them stay on the consumer side: the daemon is given what it must
verify to decrypt, and nothing else.

### Lease lifetime is a sub-interval of the person's unlock window

The lease never extends custody. It ends at the first of: explicit close;
its own duration ceiling (five minutes, matching
`MAX_PICO_READER_CUSTODY_SYNC_ACCESS_SESSION_MS`, configurable lower by the
requesting consumer, never higher); the connection that opened it closing;
and — decisively — the underlying session ceasing to be usable for any ADR
0097 reason: explicit lock, hold-connection close, idle auto-lock, the
fifteen-minute unlock ceiling, suspend detection, clock rollback or daemon
shutdown. Reader-access work counts as session use, so it holds off the idle
timer while it runs and remains capped by the unlock ceiling that the person
established.

Lease lifetime is evaluated on the daemon's own injected wall and monotonic
clocks. The consumer's ADR 0096 clock governs the consumer's own duration
accounting and is deliberately not transmitted: a client-supplied instant
must never be able to extend a capability, so the wire carries no instant
that could be mistaken for authority.

### The `device_key_agreement` unlock lift

ADR 0097 refused to unlock key-agreement keyfiles because nothing could use
them. These families are that use, so the refusal is lifted. The refusal it
replaces stays structural in the other direction: such a session still
cannot sign (`key_role_cannot_sign` from the library), and identity or
device-signing sessions cannot open a lease
(`reader_access_key_role_mismatch`). Each role can do exactly what its role
is for, and nothing else.

### Frame budget

Control families keep the 128 KiB cap. A connection holding an open lease is
raised to a reader-access budget derived from the library ceiling it must
carry — three times the 16 MiB sealed-payload limit, covering hex doubling
of the request plus envelope headroom — and drops back to 128 KiB the moment
the lease ends. A connection that has not proven it can open a lease, which
requires an unlocked session matching the pinned Reader key, can therefore
never make the daemon buffer more than 128 KiB. With a single lease
daemon-wide, the worst-case buffered frame is bounded by construction.

Restore cost is stated rather than hidden: ADR 0093 replays the whole
archive chain, so one access run performs one `open-payload` roundtrip per
archived record — up to the 1,000-record archive ceiling — plus one
`decrypt-item` per presentation. This is the price of keeping the archive on
the consumer side, and it is bounded, not open-ended.

### Plaintext crosses the socket, once, as a crypto result

Item plaintext now leaves the Vault process. This is a real boundary change
and is stated plainly rather than buried: the plaintext crosses the same
`0600` socket in the same `0700` directory that already protects the
keyfiles, to the same uid, and only as the direct result of a
`decrypt-item` request whose evidence verified. The daemon never persists
it, never logs it, never audits it and retains no copy after the response is
written. On the consumer side it lands in the ADR 0094/0095 synchronous
presentation path unchanged, with the inherited honesty that JavaScript
strings are not zeroizable.

What this does and does not buy is worth being exact about. Against a
compromised consumer that legitimately owns the archive, the daemon narrows
*key* exposure, not *content* exposure: such a consumer can already ask for
the decryption of ciphertext it holds, and the lease bounds when and for how
long, not whether. What it removes is the reader's private key from that
consumer's address space, permanently — so a consumer compromise stops being
a key compromise, and the blast radius shrinks from "every item ever
readable by this key, forever" to "items whose evidence this consumer holds,
during an open lease".

## Gates

- **S17.1 — lease families: Done.** Five versioned families with lease-id
  binding, single daemon-wide lease, connection binding, exact role and
  fingerprint checks before any capability is issued, and unknown-family and
  malformed rejection inherited from ADR 0097.
- **S17.2 — lease lifetime: Done.** Five-minute ceiling with lower-only
  configuration, daemon-clock evaluation, no transmitted client instant, and
  closure on explicit close, connection loss, expiry, and every ADR 0097
  session-lock cause.
- **S17.3 — fail-closed closure: Done.** Close is idempotent; unknown or
  closed leases report `locked: true` and accept close, so the ADR 0096
  `finally` verifies real closure and never reports a lock failure for a
  lease the daemon already ended.
- **S17.4 — bounded transport: Done.** Lease-scoped frame budget derived
  from the sealed-payload ceiling, raised only while a lease is open and
  dropped on every exit path; control families stay at 128 KiB.
  Status note, 2026-08-21: `evaluatedAt` was bounded by a length here rather
  than checked, and that field is what the Vault compares — as a string —
  against a batch's `expiresAt`. Sixty-four characters is a number that
  resembles the rule without being it, so a value that is not an instant
  travelled two processes before anything looked at it and the refusal, when
  it came, was about the lease rather than the value. It asks
  `isPicoInstant` where it arrives now, which also closes the extended-year
  form the string comparison must not admit.

- **S17.5 — synchronous bridge and adapter: Done.** A worker-backed bridge
  provides genuinely blocking roundtrips, and a structural adapter satisfies
  the ADR 0096 capability shape without `@pico/vault-daemon` importing
  `@pico/sync` or `@pico/sync` learning anything about the daemon.
- **S17.6 — end-to-end and negatives: Done.** The real
  `PicoReaderCustodySyncAccessSession` runs against a live daemon over the
  bridge with real crypto through archive restore, catalog listing and
  presentation; negatives cover locked vault, wrong role, wrong fingerprint,
  second lease, foreign lease id, use after close, expiry, hold-connection
  loss mid-lease, oversized frames without a lease and verified final
  closure.
- **S17.7 — Future:** migration of the remaining ceremonies (claim,
  checkpoint publication, envelope issuance, rotation) onto the contract;
  everything ADR 0097 Gate D7 already lists.

## Non-goals

- any network, remote, Relay or Pico Link surface;
- `SO_PEERCRED`, per-client authority or approval UX;
- platform-keystore unlock, recovery or lost-device handling;
- background synchronization, scheduling or multi-lease concurrency;
- moving archive, catalog, projection or presentation into the Vault;
- protocol fixtures, conformance or compatibility claims for the wire
  contract, which remains local and private per ADR 0097.

## Consequences

Positive:

- the reader's private key no longer exists in consumer memory: the ADR 0081
  agent boundary is real for the first end-to-end product path;
- ADR 0097's contract is validated by a demanding first consumer instead of
  by assertion, and the families it grew are the ones a second consumer will
  need;
- ADR 0096 semantics are preserved exactly — same checks, same order, same
  failure names — so the daemon path inherits its whole negative suite;
- lease closure is verified rather than assumed on every exit path,
  including consumer crash, where connection loss ends the lease.

Negative and residual:

- the synchronous bridge costs a worker thread per consumer and blocks the
  calling thread for the duration of each roundtrip; a consumer with a UI
  loop must run access off its interactive thread;
- archive restore is O(archived records) roundtrips, so a full archive makes
  one access run measurably slower than the in-process path;
- item plaintext now crosses a socket, and same-uid endpoint compromise
  remains outside what any of this defends against;
- a large lease-scoped frame budget means a legitimately leased connection
  can make the daemon buffer tens of megabytes;
- the remaining Vault ceremonies still run in-process, so this closes the
  library-custody gap for the Reader path only.

## Relationship to other ADRs

- Extends the ADR `0097` contract with its first consumer families, keeps
  its lifecycle, audit and framing rules unchanged, and lifts exactly one of
  its deliberate refusals (`key_role_not_served`) now that the capability it
  was waiting for exists.
- Implements the ADR `0096` unlock port as a deployable provider without
  altering its lifecycle: role and fingerprint still bind before restore,
  one presentation still bounds a run, and the verified `finally` lock still
  decides whether closure may be claimed.
- Preserves the ADR `0093`/`0094`/`0095` boundaries: the archive, the
  current-head selection binding, the catalog ceiling and the synchronous
  presentation handoff stay consumer-side and unchanged.
- Advances ADR `0081` V1/V4 from a tested library floor to an enforced
  process boundary for the Reader role, and leaves V8 intact — no export
  family exists on this contract either.
- Leaves ADR `0033` recovery and ADR `0016` primitive boundaries untouched;
  no new cryptography exists at this layer.

## References

- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0089](0089-authenticated-checkpoint-and-reader-custody-sync.md)
- [ADR 0093](0093-private-durable-reader-projection-archive-and-idempotent-receipts.md)
- [ADR 0094](0094-explicit-reader-item-access-and-ephemeral-vault-decryption.md)
- [ADR 0095](0095-ephemeral-reader-item-catalog-and-local-presentation-handoff.md)
- [ADR 0096](0096-reader-access-session-and-vault-lock-lifecycle.md)
- [ADR 0097](0097-deployable-vault-process-and-local-ipc-authority-boundary.md)
