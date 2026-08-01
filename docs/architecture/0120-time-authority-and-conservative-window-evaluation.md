# 0120 - Time Authority and Conservative Window Evaluation

## Status

Accepted as a pre-implementation correctness constraint; the
initiative and its scope were chosen by the user on 2026-08-01.
Gates N1-N5 are open. It changes no window's length and no ceremony's
shape - only how a window is judged to have passed, and what Pico
refuses to conclude from a clock it cannot trust.

## Context

Pico is full of windows, and every one of them currently resolves
against the host wall clock.

| Window | Length | What it is for |
|---|---|---|
| Device-recovery veto delay | 48 h | the person's chance to object |
| Identity-root rotation veto | 48 h | the person's chance to object |
| Recovery completion window | 7 d | the time lock itself |
| Session idle / absolute | 1 h / 12 h | bounding exposure |
| Identity-session challenge | 2 min | bounding replay |
| Signed recovery request lifetime | 5 min | bounding replay |
| Reader-key freshness ceiling | 5 min | bounding staleness |
| Pending Home claim | 10 min | bounding a ceremony |
| Pending share envelope | 2 min | bounding a ceremony |
| Daemon approval window | 60 s | bounding a decision |
| Realtime ticket | 30 s | bounding a handoff |
| Retention `delete_after_max_age` | configured | deleting on schedule |

These are not the same kind of thing, and treating them the same is
the defect. For a session timeout the person is protected by the
window *ending*; for a veto delay the person is protected by the
window *lasting*. An attacker who can move the clock attacks each from
the opposite direction, and today both directions succeed: winding
forward retires a 48-hour objection period into the past, winding
backward keeps a session alive.

Two pieces of the answer already exist and were built for narrower
reasons.

The Vault daemon does not trust one clock. ADR 0096 reads an injected
monotonic clock for session lifetime, ADR 0097 detects a suspend as
the wall clock advancing more than 45 seconds beyond the monotonic one
and locks, and ADR 0098 evaluates lease lifetime against both. That
discipline is right, it is local to the daemon, and Core has nothing
like it.

ADR 0110 R6 built an anchor. The recovery consumption anchor lives
outside every restorable Foundation snapshot, moves only forward,
carries a never-reused sequence, and its module says exactly what it
is not: "a platform monotonic counter", with a filesystem substrate
chosen because a TPM NV counter is unreachable from the add-on
container and an external service would break local-first - and an
interface designed so a real platform anchor can replace it without
touching a caller. Its own comment names the gap this ADR closes:
lapsing "follows from the completion window carried in the record
itself, so a restored row re-lapses against the Home clock without any
anchor help".

The sync ADRs have been circling the same hole for a long time. ADRs
0090, 0092, 0093 and 0094 each state that a fully matching backup
stays indistinguishable "without an external monotonic anchor", and
ADR 0087 names a missing "monotonic credential epoch". The residual
has been recorded five times and decided zero.

## Scope

Covers: how a window is judged elapsed; which windows need protection
in which direction; what durable lower bound on time exists and where
it comes from; and what Pico does when it detects that the clock
moved.

Does not cover:

- the length of any window, all of which stay as decided;
- ADR 0085's authenticated freshness checkpoints, which are an
  authority mechanism that happens to carry validity instants and stay
  exactly as they are;
- the sync-side rollback residual for pending inboxes and projection
  archives, which needs storage guarantees this ADR does not supply;
- clock synchronization, drift correction or any time source's
  accuracy;
- the TPM platform anchor, which remains open in `TODO.md` and is the
  substrate this ADR is written to accept later.

## Decision

### Windows are classified by who benefits from the end

Every window carries one of three classes, declared where it is
defined rather than inferred at the call site.

**Objection windows** exist so the person can intervene: the recovery
veto delay, the rotation veto, the recovery time lock. The person is
protected by their duration. They must never end early.

**Exposure windows** exist to limit how long something remains usable:
sessions, unlock lifetime, challenges, tickets, pending ceremonies,
signed-request lifetimes, the freshness ceiling. The person is
protected by their end. They must never last longer.

**Housekeeping windows** confer no authority: retention age, throttle
delays. They are governed by the irreversibility of what they trigger,
not by authority.

### The conservative clock wins, per class

Every window resolves against both the wall clock and a monotonic
clock, and the class picks which answer is taken.

- An **exposure window** expires at the earliest instant either clock
  allows. A wall clock wound backward cannot extend a session, because
  the monotonic clock kept counting.
- An **objection window** elapses only when both clocks agree it has.
  A wall clock wound forward cannot retire a veto period, because the
  monotonic clock did not move.
- A **housekeeping window** may use the wall clock, bounded by N5.

This generalizes the daemon's existing two-clock discipline (ADR
0096/0097/0098) from one process to every window in the system, which
is the whole of the change for windows that do not outlive a process.

### Objection windows outlive processes, so they need an anchor

A monotonic clock dies with its process and resets with the host. Every
objection window is 48 hours or longer, so it will certainly cross a
restart, and across that restart there is nothing monotonic left to
consult.

The durable lower bound is an anchor, and one already exists. ADR 0110
R6's recovery anchor gains a **high-water instant**: the greatest
instant it has ever observed, advanced whenever it is written, never
rewound. An objection window is elapsed only when that floor has moved
past its end.

Three properties are kept deliberately intact. The anchor still lives
outside restorable Foundation snapshots, so a database restore cannot
rewind it. It still **only ever refuses**: it can decline to consider a
window elapsed, and it can never make one elapse, so no authority is
created by a file. And its interface stays substrate-agnostic, so the
TPM anchor still open in `TODO.md` replaces the filesystem without
touching a caller.

Short windows do not get an anchor and do not need one. A 30-second
ticket has no restart-surviving meaning; if the process it belonged to
is gone, so is it. Anchoring is for windows whose whole purpose is to
span time the attacker would like to skip.

### Time authority never comes from the network

No window's correctness may depend on reaching a time server. ADR 0118
guarantees the floor works with no network at all, and a Pico that
cannot decide whether a veto period passed because NTP is unreachable
would be exactly the availability dependency an attacker wants.

Network time may inform: displayed, compared, used to notice that the
host clock disagrees with the world. It may never authorize. ADR
0085's freshness checkpoints stay the only externally anchored notion
in the system, and they are anchored by a signature, not by a
timestamp service.

### A clock that moved is an event, never a silent correction

Divergence beyond a threshold - between wall and monotonic, or between
the wall clock and the anchor floor - is recorded as a fact. Where it
touches an objection window, it is raised through the ADR 0112 alarm
carrier the person already has.

Pico does not quietly re-base its windows onto the new time. A person
whose veto period was interfered with should learn that, and the
attempt is more interesting than the correction.

### Irreversible housekeeping refuses implausible time

The retention sweeper deletes, and deletion under ADR 0070's
crypto-shredding is not recoverable. A wall clock jumped forward would
expire items that had years left.

The sweeper therefore refuses to act when the wall clock has moved
implausibly against the anchor floor, and says so rather than skipping
silently. It remains a protective path under ADR 0119 Q2 - it must
still be able to run under resource pressure - but being able to run
is not permission to act on nonsense.

## Gates

- **N1 - Declared window classes and two-clock evaluation (binds the
  first production deployment):** every window declares objection,
  exposure or housekeeping at its definition; exposure takes the
  earliest of both clocks, objection the latest, proven by tests that
  wind each clock in each direction.
- **N2 - Anchored objection windows (binds ADR 0110 and ADR 0114
  ceremonies):** veto delays and the recovery time lock elapse only
  when the anchor's high-water instant has passed their end; proven by
  a restored-snapshot test in which the wall clock claims the window is
  over and the ceremony still refuses.
- **N3 - Anchor invariants preserved (binds N2):** the high-water
  instant is forward-only, lives outside restorable snapshots, and can
  only refuse - counter-proven by a test that shows no anchor state
  can cause a window to elapse.
- **N4 - No network time authority (binds every window):** no
  correctness path consults a time service; a mechanical check keeps
  network-time imports off those paths, in the same shape as
  `scripts/check-companion-boundary.mjs`.
- **N5 - Detected movement is raised, and irreversible work refuses
  (binds ADR 0074's sweeper and companion UX):** divergence beyond a
  threshold is recorded and alarmed through the ADR 0112 carrier;
  the retention sweep refuses to delete against an implausible clock.

## Threat ledger

| Attacker | Posture |
|---|---|
| Winds the host clock forward 48 h to skip a veto period | The monotonic clock did not move and the anchor floor did not advance, so the window has not elapsed (N1, N2). The jump itself is alarmed (N5). |
| Winds the clock backward to keep a session alive | Exposure windows take the earliest of both clocks, so the monotonic clock expires it regardless (N1). |
| Restores a Foundation snapshot to reopen a resolved recovery | Unchanged and already closed by ADR 0110 R6's consumption anchor; the high-water instant extends the same substrate rather than replacing it. |
| Restores a snapshot to rewind the time floor | The anchor is outside the restorable path. A whole-filesystem rollback still moves anchor and database together - stated in ADR 0110 R6, not fixed here, and the reason the TPM item stays open. |
| Blocks NTP so Pico cannot learn the time | Nothing depends on it (N4). The floor keeps working, which is ADR 0118's promise. |
| Suspends the machine to freeze monotonic time | The daemon already locks on a wall-versus-monotonic gap (ADR 0097). For objection windows a frozen monotonic clock delays elapsing, which is the safe direction. |
| Ordinary NTP correction of a few seconds | Short exposure windows fail closed, which costs a re-issued ticket. Objection windows need both clocks to agree, so a correction cannot fast-forward one. |
| Jumps the clock to force premature shredding | The sweeper refuses to act against an implausible clock and says so (N5). |
| Holds host root | Out of scope, as everywhere else: an attacker who owns the host owns its clock, its anchor file and its database. The boundary this ADR defends is restore and misconfiguration, not root. |

## Consequences

Positive:

- the asymmetry that made a single clock policy wrong is stated: the
  person is protected by an objection window lasting and by an
  exposure window ending, and each is now defended in its own
  direction;
- the daemon's proven two-clock discipline stops being a local habit
  and becomes a system rule;
- the residual named five times across ADRs 0087, 0090, 0092, 0093 and
  0094 gets a partial, honest answer for the windows where it decides
  authority, without pretending it is solved for sync;
- ADR 0110 R6's anchor is extended rather than duplicated, and keeps
  its can-only-refuse property, so no new authority-bearing artifact
  enters the system;
- refusing network time authority keeps ADR 0118's offline floor
  intact instead of quietly reintroducing a dependency.

Negative and residual:

- every window definition gains a class, and a window that declares the
  wrong one is defended in the wrong direction - a new way to be
  subtly wrong;
- objection windows can now be made to last *longer* than intended by
  interfering with time, which is the direction this ADR deliberately
  prefers, but it is still a denial of service against a legitimate
  rotation or recovery;
- the anchor floor is filesystem-backed, so whole-filesystem rollback
  remains open until the TPM item is decided;
- two-clock evaluation makes every window harder to test and reason
  about, and clock injection has to reach code that currently calls
  the wall clock directly;
- nothing here is implemented, and the windows keep their current
  single-clock behavior until N1 lands.

## Relationship to other ADRs

- Extends ADR `0110` R6's consumption anchor with a high-water instant
  and preserves its outside-the-snapshot, forward-only, refuse-only
  properties; closes the lapse gap its own module comment names.
- Protects ADR `0114`'s rotation veto window and ADR `0110`'s recovery
  veto and time lock against a clock wound forward; neither window's
  length changes.
- Generalizes the two-clock discipline of ADR `0096`, `0097` and `0098`
  from the Vault daemon to every window, leaving the daemon's suspend
  detection and lock behavior unchanged.
- Leaves ADR `0083`/`0085` freshness untouched: it is anchored by an
  identity-root signature rather than by a clock, and stays the only
  externally anchored notion.
- Constrains ADR `0074`'s sweeper to refuse implausible time, while ADR
  `0119` Q2 keeps it running under resource pressure - able to run is
  not permission to act.
- Keeps ADR `0118`'s offline floor honest by refusing any network time
  authority.
- Gives ADRs `0087`, `0090`, `0092`, `0093` and `0094` a partial answer
  where a window decides authority, and leaves their sync-state
  rollback residual open.

## References

- [ADR 0074](0074-memory-retention-policy-and-expiry-deletion-boundary.md)
- [ADR 0085](0085-authenticated-reader-key-freshness-checkpoints.md)
- [ADR 0090](0090-durable-reader-sync-floor-and-crash-safe-apply.md)
- [ADR 0096](0096-reader-access-session-and-vault-lock-lifecycle.md)
- [ADR 0097](0097-deployable-vault-process-and-local-ipc-authority-boundary.md)
- [ADR 0098](0098-reader-access-lease-over-the-vault-daemon.md)
- [ADR 0110](0110-recovery-card-and-time-locked-zero-device-recovery.md)
- [ADR 0112](0112-recovery-product-surfaces-in-the-background-companion.md)
- [ADR 0114](0114-identity-root-rotation-with-relationship-continuity.md)
- [ADR 0118](0118-offline-and-model-free-degradation-contract.md)
- [ADR 0119](0119-resource-exhaustion-and-denial-of-service-posture.md)
