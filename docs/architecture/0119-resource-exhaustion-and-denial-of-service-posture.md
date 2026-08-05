# 0119 - Resource Exhaustion and Denial-of-Service Posture

## Status

Accepted as a pre-implementation availability and safety posture; the
initiative and its scope were chosen by the user on 2026-08-01.
Q1 through Q4 are implemented; Q5 is open. The
existing bounds this builds on are named rather than claimed as
sufficient. It is due before the Link intake port is published and
before any deployment that is not a trusted-local development host.

## Context

Pico's bounds today are per-request, not per-actor and not per-lifetime.
That is a real difference, and the current ones are worth stating
exactly, because this ADR only adds what they cannot reach.

The Foundation surface caps one payload at 32 KiB, one text field at
8000 characters and one event page at 500 rows. The Link intake
listener caps a request at ten seconds, headers at five, keep-alive at
five, allows a hundred requests per socket and destroys any upgrade
attempt. The Vault daemon caps a frame at 128 KiB and a reader-access
frame at three times the 16 MiB sync payload ceiling. The operator
login is throttled after three free attempts with a delay growing to
thirty seconds, and `OperatorStore` holds a bounded verification queue
so exactly one Argon2id allocation exists at a time. ADR 0074's
retention sweeper deletes expired items hourly, batch-bounded and
fail-safe.

Every one of those bounds answers "how large is this one thing". None
of them answers "how much of this may exist", "how much may one peer
send" or "what happens when the disk is full".

Three gaps follow from that, and they compound.

**Storage has no ceiling.** ADR 0014 makes the event log append-only by
design, and nothing expires it. ADR 0074's retention is real but
age-based and opt-in: the default mode is `keep_until_deleted`, so an
ordinary deployment grows without bound and no configured policy
changes that unless someone sets one.

**Disk-full behavior is undecided.** There is no `SQLITE_FULL` or
`ENOSPC` handling anywhere in the tree. What Pico does when the
filesystem fills is currently whatever `better-sqlite3` happens to
throw at the call site that got there first, which is not a posture.

**Aggregate load is unbounded.** ADR 0031 lists rate limits and abuse
controls as a Pico Home responsibility and sender quotas as future
work; the intake listener bounds a single request's shape and duration
but nothing bounds how many a peer may make. There is no global
in-flight or connection cap on either surface.

ADR 0118 raised the stakes on the first two. It promises capture works
with no model and no network, and its own failure ledger names the
disk-full case as the one that would make that promise dishonest: a
guarantee that silently drops a photo is not a guarantee.

One existing decision already points at the general rule. ADR 0076
keeps failed logins out of the event log because they are the
attacker-triggerable class; `LoginThrottle` counts them in memory only
and says so. That instinct is correct and has never been generalized.

## Scope

Covers: behavior under storage exhaustion; which operations fail closed
and which must keep running; ceilings on durable growth; aggregate
quotas and concurrency bounds on the reachable surfaces; and which
attacker-triggerable effects may become durable.

Does not cover:

- ADR 0031's relationship tiers themselves, which remain that ADR's
  work and this one's input;
- the update and release channel, whose integrity is its own open ADR;
- backup sizing, off-host retention or storage provisioning;
- ADR 0083/0085 freshness, which fails closed for authority reasons
  rather than resource ones;
- any performance target, throughput claim or capacity guarantee.

## Decision

### Refuse to write; never refuse to protect

Under resource pressure, operations split by direction, not by
importance.

Operations that **create or extend** state - appending events,
recording memory, issuing envelopes, registering keys, accepting
memberships, staging rotations - fail closed. A refusal is a safe
outcome for all of them, and a partially written authority record is
not.

Operations that **remove authority or reclaim space** - revocation,
eviction, tombstoning, crypto-shredding, the retention sweep, a veto -
must keep working when ordinary writes are already refused. This is the
load-bearing half. A full disk that blocks a revocation has converted a
resource problem into a security problem, and an attacker who can fill
a disk would then be able to freeze the person's ability to take
authority away.

### Protection needs a reserve, because deleting is also writing

Keeping the protective paths alive is not automatic. The store runs
`better-sqlite3` in WAL mode, where a delete is a write: it needs WAL
space to commit and a checkpoint to actually return space to the
filesystem. On a genuinely full disk, the tombstone that would free
gigabytes cannot commit.

Therefore Pico reserves headroom rather than discovering the wall.
Ordinary creating writes are refused while free space is still above
the floor, so the protective paths retain room to commit and
checkpoint. The floor is a deployment property with a conservative
default, sized from the WAL and checkpoint requirement rather than
guessed.

This makes the state machine three-valued instead of two: `normal`,
`reserved` - creating writes refused, protective writes and reads
still working - and `exhausted`, which the reserve exists to prevent
and which stays fail-closed for everything that writes.

### Pressure is visible before it is fatal

The transition into `reserved` is a person-facing event, not a log
line. ADR 0118 O4 already requires that the person can tell which
capability is unavailable and why; storage pressure joins `no_network`
and `no_model` as a stated condition rather than a mystery refusal.

This is what makes ADR 0118's capture floor honest under exhaustion.
Capture is a creating write, so it is refused in `reserved` - but the
person is told while there is still room to act, and the refusal is
loud. A silently dropped photo is the outcome this ADR exists to
prevent; a refused photo with a clear reason is a bad day, not a
broken promise.

### No unauthorized request may cause a durable write

ADR 0076's rule generalizes: a request that has not been authorized
must not be able to make Pico write anything that survives a restart.
No event, no row, no counter, no audit record, no rate-limit ledger on
disk.

This closes log-flooding as a denial-of-service path by construction
rather than by tuning, and it keeps the append-only log free of
attacker-authored volume. Refusal counters live in memory, exactly
where `LoginThrottle` already keeps them. The cost is accepted and
named: an attacker's failed attempts are not forensically
reconstructable after a restart, which ADR 0076 already chose.

Authorized volume is a different problem and is bounded by quota, not
by this rule.

### Quotas key on relationship, never on network position

Aggregate bounds on the intake surface key on the sender's
relationship - membership, device, routing identity - because a relay
is transport and an IP address is a relay artifact that carries no
authority (ADR 0028, ADR 0031). Keying a quota on a network property
would let a relay's behavior decide a peer's budget.

Three consequences. Unauthenticated intake gets the tightest bound,
because it has no relationship to spend. A known member gets a larger
one under ADR 0031's tiers when those exist. And a quota refusal is
content-free: it says no without revealing whether the sender is known,
which would otherwise turn the quota into a membership oracle.

Both listeners additionally carry a global in-flight and connection
cap, so aggregate concurrency is bounded even when every individual
request is well-formed and every quota is respected. The counters are
separate per listener rather than shared, so an intake flood cannot
consume the budget the person's own device is using.

**The residual, named rather than designed away.** A relationship can
only be known after the seal is opened, and the open is the expensive
step the stranger budget exists to bound. So the stranger budget is
charged before Pico can tell a member from anyone else, and a sustained
flood therefore degrades intake for members too. This is the same shape
as the login-throttle residual below and is accepted for the same
reason: the alternatives are worse. Keying the pre-open bound on a
network property is what this section has just refused; skipping it
would leave the private-key work unbounded, which is the attack.

What the design does buy is stated exactly. The flood is bounded rather
than unbounded; a member who does get through is metered separately, so
one runaway peer cannot spend anyone else's budget; the Foundation
surface is untouched, so the person's own device keeps working
throughout; and nothing durable is written by any of it (Q3). What it
does not buy is guaranteed intake availability for members while a
flood is in progress, and no wording here should be read as promising
that.

### Durable growth has a ceiling and a stated policy

Storage growth becomes a decided quantity rather than an emergent one.
Each durable store - event log, memory items, audit records, pending
inboxes and projection archives - carries a configured ceiling, and
reaching it is the same `reserved` condition as low disk: creating
writes refused, protective paths alive, person informed.

The append-only log is deliberately not given an expiry here. ADR 0014
made it append-only for reasons that resource pressure does not
overturn, and an expiry that quietly forgets signed evidence is a worse
failure than a refusal. What the ceiling forces is the conversation the
person should have - export, migrate, shred a domain, or provision more
space - rather than a silent trim.

### The throttle stays global, and the residual stays named

`LoginThrottle` counts consecutive failures instance-wide, so an
attacker can impose the capped thirty-second delay on the owner. Keying
it per caller is not available: before the credential is verified there
is no principal, and the only alternative key is a network property
this ADR has just refused to trust.

It stays global. The delay-not-lockout choice already bounds the harm
to one capped wait, the surface is local by ADR 0030/0038, and the
bounded Argon2id queue holds the memory cost to one allocation. The
residual - an attacker on the local surface can make the owner wait -
is accepted and written down rather than designed away with a worse
mechanism.

## Gates

- **Q1 - Reserve floor and three-valued write posture (implemented in
  the store):** `evaluatePicoStoragePressure` turns free space and a
  configured floor into `normal`/`reserved`/`exhausted`, and
  `EventStore.append` refuses a creating write in `reserved` with
  `refused_storage_pressure` - a refusal, never a partial write. Free
  space is read per call from the filesystem the database lives on,
  because pressure is a condition rather than a startup fact: a cached
  reading would keep refusing long after the person freed space, or keep
  admitting long after they stopped having room. An unreadable reading
  evaluates to `exhausted`, so the one case that cannot be measured is
  not the one case left unprotected. A store with no free-space source
  stays `normal`, which is the development posture this ADR scopes
  itself against. Counter-proven exactly as the gate asks: filled to the
  floor, an event append is refused while a tombstone commits. Original
  gate text: a configured free-space floor,
  `normal`/`reserved`/`exhausted` states, creating writes refused in
  `reserved`, proven by a test that fills to the floor and shows an
  event append refused while a tombstone still commits.
- **Q2 - Protective paths survive pressure (implemented for the event
  path):** the protective set is listed rather than derived, because
  this is a security classification and a prefix rule would quietly
  enrol whatever a future type happens to be called.
  `home.membership_changed` is deliberately absent: it carries both
  grants and revocations, so it cannot be classified by type, and the
  safe reading of an ambiguous type is "creating".

  `exhausted` refuses protective writes too. That reads like a
  contradiction of this gate and is not: it is the state the reserve
  exists to prevent, and letting a write through with no room produces a
  torn write rather than a rescue. The reserve is what keeps the
  protective paths alive, so the answer to losing it is to have refused
  earlier, not to try harder afterwards.

  Original gate text: revocation,
  eviction, tombstone, shred, retention sweep and veto complete in
  `reserved`, each counter-proven so that removing its reservation
  fails exactly one test.
- **Q3 - No durable write without authorization (proven on both
  listeners):** proven where the gate points. The Foundation surface is
  bursted with a wrong bearer token across events, memory, home, auth
  and realtime writes; the published Link intake port is bursted on its
  own listener, which carries no credential at all because
  authorization there is the sealed envelope and nothing else. Both
  assert the store and log are byte-identical afterwards, over
  `pico.sqlite` and `-wal` - `-shm` is excluded as shared-memory
  coordination a reader touches, and this gate is about what survives a
  restart.

  Two things keep the proof honest. First, each burst ends by making
  one *authorized* write and asserting the digest moves: byte-identity
  otherwise proves only that the database is never written at all.
  Second, the Link burst pins its own depth. Refusals there happen at
  four ranges - the listener edge before Fastify routing, the body
  limit, the envelope shape check, and the seal-open - and only the
  last spends a private key. So the deep payload is asserted to come
  back `sealed_request_unreadable` rather than `invalid_envelope`,
  because a payload that quietly regressed to a shape refusal would
  leave the expensive path unproven while the test still passed.

  Refusal counters live in memory, where `LoginThrottle` already keeps
  them. The accepted cost is that failed attempts are not forensically
  reconstructable, which ADR 0076 already chose; the gain is that log
  flooding is closed by construction rather than by tuning. Original
  gate text: an unauthorized request produces no row, event, audit
  record or on-disk counter; proven by asserting store and log are
  byte-identical across a refused-request burst.
- **Q4 - Relationship-keyed quotas and concurrency caps
  (implemented):** `PicoRequestQuota` holds two token buckets and
  `PicoConcurrencyCap` holds one counter per listener.

  The budgets are charged at two different depths, because they answer
  two different questions. The **stranger** budget is charged at intake
  before the seal is opened - the seal-open is the first place the Home
  spends a private key, so a bound behind it would not bound the
  expensive step at all. It is one shared bucket rather than one per
  caller: the envelope hides the sender by design, so before the open
  there is genuinely nothing to key on, and the only other candidate is
  the network property this ADR has just refused to trust. The
  **relationship** budget is charged once a signature has proven the
  sender, and bounds authorized volume so one runaway peer is contained
  without touching anyone else's. A self-minted identity reaching a
  pre-authority operation gets no bucket of its own: generating a
  keypair must not buy a larger budget than raw garbage.

  Refill runs on the monotonic clock (ADR 0120 N1). A budget that
  refilled on the wall clock would be refilled by moving the wall
  clock, which would make the whole bound a formality for anyone able
  to nudge the system time.

  Refusals are content-free and share one `quota_exceeded` reason across
  both buckets, returned as 429 rather than folded into the generic 400
  - a well-behaved peer is early, not malformed. There is deliberately
  no `Retry-After`: it would have to be computed from whichever bucket
  refused, and the two refill at different rates, so a truthful hint
  would name the sender's tier and reintroduce the membership oracle
  the shared reason exists to prevent.

  The in-flight counters are **per listener, not shared**. Both
  listeners serve the same Fastify application, so one counter would
  let a stranger on the published intake exhaust the budget the
  person's own device depends on - publishing the intake would silently
  degrade the local UI. Intake-forwarded requests are marked with a
  symbol, not a header, because a header would be forgeable and the
  caller must not get to choose which budget they spend. Connection
  caps sit beside them via `maxConnections` on both servers, because a
  socket that never sends a request is bounded by nothing above.

  Original gate text: per-relationship send budgets with the tightest
  tier unauthenticated, content-free refusals, plus global in-flight
  and connection caps on both listeners.
- **Q5 - Durable ceilings and visible pressure (binds companion UX,
  with ADR 0118 O4):** per-store ceilings, the `reserved` condition
  surfaced to the person as a named state with the action that clears
  it, and no silent trimming of the append-only log.

## Threat ledger

| Attacker | Posture |
|---|---|
| Fills the disk through authorized writes | Reserve floor trips first (Q1). Creating writes refuse, revocation and shredding still commit (Q2), and the person is told while action is still possible (Q5). |
| Floods the intake port to fill the log | Cannot: an unauthorized request writes nothing durable (Q3). Authorized volume is bounded by the sender's relationship budget (Q4). |
| Opens many slow connections | Bounded by the existing ten-second request and five-second header timeouts plus the new global in-flight and connection caps (Q4). |
| Guesses the operator passphrase to burn CPU | Bounded queue holds memory to one Argon2id allocation; the throttle collapses the rate. Unchanged, and the CPU cost of a burst before the delay applies is the accepted residual. |
| Triggers the throttle to lock the owner out | Named residual: the throttle is global and delay-based, so the owner's worst case is one capped wait on a local-only surface. Refused alternatives would trust a network property. |
| Blocks a revocation by exhausting storage | The case Q2 exists for. Protection outranks creation under pressure, and the reserve is what makes that more than a preference. |
| Probes quota refusals for membership | Refusals are content-free (Q4), so a quota does not become a membership oracle. |
| Fills storage to force a silent log trim | Refused by design: the ceiling refuses writes rather than deleting signed evidence, because ADR 0014's append-only rule is not a resource decision. |
| Wall-clock manipulation to defeat throttling or sweeps | Out of scope here and named: the retention sweep and the throttle both read the host clock, which is the open time-authority decision in `TODO.md`. |

## Consequences

Positive:

- the disk-full question ADR 0118 flagged gets an answer that keeps its
  capture promise honest: refused loudly and early, never dropped
  silently;
- protection outranking creation means an attacker who can exhaust a
  resource still cannot freeze the person's ability to revoke;
- ADR 0076's keep-it-out-of-the-log instinct becomes a general
  invariant, closing log-flooding by construction instead of by tuning;
- quotas keyed on relationship keep ADR 0028's "transport is not
  authority" intact where it would be easiest to violate;
- the bounds that already exist are written down in one place, so the
  next surface inherits them rather than reinventing a subset.

Negative and residual:

- three-valued write state touches every creating path, and a path that
  forgets to consult it fails in the worst state;
- the reserve floor is a guess until measured, and a floor set too low
  is a promise that breaks exactly when it matters;
- ceilings turn an invisible slow problem into a visible sudden one:
  a person who ignores the `reserved` warning meets a hard refusal;
- refusing to expire the append-only log means growth stays a real
  operational burden and export or migration stays the answer;
- the global login throttle keeps its owner-delay residual;
- attacker-triggered refusals stay unreconstructable after a restart,
  by choice;
- none of this is implemented, and every bound named here as existing
  is a per-request bound that this ADR explicitly says is not enough.

## Relationship to other ADRs

- Answers the disk-full row in ADR `0118`'s failure ledger and makes
  its capture floor survivable under exhaustion by refusing early and
  visibly rather than dropping silently.
- Generalizes ADR `0076`'s rule that attacker-triggerable failures stay
  out of the event log into a durable-write invariant for every
  unauthorized request, leaving its bootstrap and credential mechanics
  unchanged.
- Supplies the sender quotas ADR `0031` named as future work and keys
  them on relationship rather than network position, consistent with
  ADR `0028`'s transport-is-not-authority rule.
- Leaves ADR `0014`'s append-only log append-only: pressure refuses
  writes and never trims signed evidence.
- Builds on ADR `0074`'s retention sweeper as a protective path that
  must survive pressure, and notes that its age-based, opt-in default
  is not a size bound.
- Leaves ADR `0083`/`0085` untouched: their fail-closed freshness is an
  authority decision, not a resource one.
- Depends on the still-open time-authority decision in `TODO.md` for
  every window it and ADR `0074` read from the host clock.

## References

- [ADR 0014](0014-deletability-and-append-only-events.md)
- [ADR 0028](0028-pico-link-transport-facade-and-relay-network.md)
- [ADR 0030](0030-foundation-api-exposure-and-local-trust-boundary.md)
- [ADR 0031](0031-pico-link-identity-relay-and-domain-threat-model.md)
- [ADR 0038](0038-foundation-local-access-hardening-and-ingress-boundary.md)
- [ADR 0074](0074-memory-retention-policy-and-expiry-deletion-boundary.md)
- [ADR 0076](0076-foundation-operator-credential-session-and-bootstrap-mechanics.md)
- [ADR 0107](0107-pico-link-direct-envelopes-to-the-own-home.md)
- [ADR 0118](0118-offline-and-model-free-degradation-contract.md)
