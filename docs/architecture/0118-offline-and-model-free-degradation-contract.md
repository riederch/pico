# 0118 - Offline and Model-Free Degradation Contract

## Status

Accepted as a pre-implementation availability contract; the initiative
and its scope were chosen by the user on 2026-08-01. O1 is enforced for
four of the five floor families - `time_bound_entry` does not exist in
the tree at all, so the floor is not yet complete and the gate says so
in its own output. O2 and O4 have their vocabulary and their invariants
implemented and tested; both still bind a surface that does not exist -
the first model integration for O2, and anything that computes network
or model health for O4. O3 and O5 are untouched, because neither an
enrichment path nor an Action Runner exists to hold them. The contract is a
floor, not a feature set: it states what may never depend on a model or
a network, and what everything else must do when one of them is
missing.

## Context

ADR 0003 already decided that degradation is intentional rather than
accidental. Its serverless mode names what survives the loss of a
family server - identity stays active, local memory stays readable and
searchable, device-to-device sync runs when devices see each other,
outbound peer messages queue, reminders and local tasks keep running,
encrypted export and later migration stay possible - and names what is
lost. That list is right, and it is the wrong axis. It answers "what if
the server is gone", which was the only dependency Pico had when it was
written, and `docs/architecture/implementation-status.md` still carries
it as concept-only.

Two dependencies have been decided since. ADR 0048/0049 introduced a
model capability provider, and ADR 0028/0107 introduced a Home reached
over a transport. Both ADRs are careful about what a provider or a
relay must never *become* - memory owner, policy authority, action
executor, identity authority. Neither says what Pico does when one
simply does not answer. `model_provider_health` and `last_health_check`
exist as registry vocabulary with no decided behavior behind them.

ADR 0009 offers exactly one avatar state for this whole area: "offline
or degraded". One state for two different facts the person needs to
tell apart.

The instinct is already in the codebase. ADR 0105 decided that the
interaction channel is whatever the device has and that Pico "degrades
to what is present rather than requiring any single one". ADR 0112's
alarm carrier is an offline-tolerant loop in production shape: it
checks on start, on a pinned six-hour cadence and on a wake or
network-regain hook, counts read and notify failures, and treats
neither as fatal. This ADR applies ADR 0105's rule to Pico's own
dependencies and reuses ADR 0112's hook rather than inventing a
scheduler.

What forces the decision now is the person's side of it. Taking a photo
to deal with later, entering an appointment, writing a note, setting a
reminder, finding something already stored, deciding an approval that
is waiting - none of these needs a sentence generated, and none needs a
packet to leave the device. If any of them breaks because a model is
unreachable, Pico has failed at the thing a companion is for, in the
exact moment the person had no alternative.

## Scope

Covers: which person-facing operations are guaranteed while no model
and no network are reachable; how every other path behaves when a
dependency is missing; how deferred work is caught up on reconnection;
what the person is shown; and what becomes of an already-approved
proactive delegation.

Does not cover:

- custody state - locking is a separate axis and this contract
  deliberately does not cross it (see the decision below);
- model-delegation runtime surfaces - ADRs 0048-0061 keep registry,
  job, context-reference and result-envelope semantics unchanged;
- ADR 0003's open serverless questions about multi-device merge,
  conflict resolution and replica manifests;
- which platform ships which channel (ADR 0105 B3, ADR 0113);
- the ADR 0083/0085 freshness rule, which stays exactly as decided and
  appears here only as the one named exception.

## Decision

### The floor is capture, recall and decide

Five operation families are guaranteed with no reachable model and no
reachable network:

1. **Capture** - recording a memory item and its reference-only event
   under ADR 0069: a note, a photo, an audio clip, a scan.
2. **Time-bound entry** - an appointment or reminder recorded with a
   due instant, and the local scheduling that raises it.
3. **Local recall** - finding and reading what is already on the
   device.
4. **Decide** - answering a pending approval on the ADR 0099 hold
   channel, which is local IPC and never needed a network.
5. **Recovery access** - the ADR 0110/0112 recovery surfaces, which
   a person needs precisely when other things are broken.

These five are not a sample of what happens to work offline. They are
the operations whose value is destroyed by deferral - a photo not taken
now cannot be taken later, an appointment not entered now is forgotten
by evening - plus the two that matter most exactly when the network is
gone.

The floor is a guarantee, not a best effort. **An enrichment that
cannot run must never fail the operation it would have enriched.** A
capture that would have been auto-tagged is captured untagged; it is
not refused, not held in a staging state, and not silently downgraded
to something the person did not ask for.

### Locking is a separate axis, and this contract does not cross it

Today's item encryption recovers the domain KEK "only inside an
unlocked key-agreement Vault session" (ADR 0086). Capture therefore
requires an unlocked session, exactly as every other domain write does.
This contract promises independence from the model and from the
network, not from custody, and it says so rather than implying a
capture path that does not exist.

The alternative was considered and declined: sealing a captured item's
DEK directly to the domain's owner reader public key would need no
secret at all and would make capture work while locked. It would also
place those items outside ADR 0088's KEK-version rotation, where
removing a reader is what forces new content onto a new KEK - a
write path deliberately uncovered by revocation-coupled rotation is a
worse problem than an unlock prompt. A person present enough to take a
photo is present enough to unlock. If this is ever revisited, it is its
own ADR with ADR 0088's rotation story as the thing to solve first.

### Absence is stated, never routed around

When a dependency is missing, Pico reports it and stops that path. It
does not substitute a different one.

Concretely: **no failover across provider classes.** A job whose
declared provider is a local on-device model fails as unavailable when
that model is unreachable; it is not re-planned onto a remote or cloud
provider because that one happens to answer. ADR 0049 already rules
that a registry entry is not a trust grant. Availability must not
become one either - otherwise an attacker who can degrade the local
provider chooses the privacy posture, and the person never sees the
substitution happen.

**Delivery may queue; approval may not.** ADR 0003's queued outbound
peer messages stay correct: a message the person already approved may
wait for a route. What must not happen is the reverse - a path that
could not be approved offline being treated as approved once the
network returns, or an action being composed and sent unattended
because a queue drained. This is ADR 0116 W5's no-auto-forward rule
under a different pressure, and it holds the same way.

A timeout is an absence. A provider that answers too slowly is
unavailable, reported as unavailable, and never silently traded for a
weaker path.

### Catch-up is enrichment, never a second truth

Work deferred by absence - tagging, summarizing, proposing an
appointment from a photograph, indexing for better recall - runs on
reconnection as *additive* enrichment. It rides the hook ADR 0112
already has (start, cadence, wake, network-regain); no second
scheduler is introduced.

Three rules bind it:

- **Additive, in the ADR 0069 idiom.** An enrichment is a new record
  referring to the captured item. It never edits what the person
  captured, so the person's own bytes stay the thing they wrote.
- **Idempotent.** A doubled run after a flapping connection costs
  nothing and produces nothing new, in the same posture ADR 0092
  already requires of projection acknowledgement.
- **Origin-labeled.** The person's capture is `person_present` under
  ADR 0116 W2. A value a model produced later is not, carries its
  derived origin, and reaches the planner only as an ADR 0117 typed
  value. Deferred enrichment is a data flow like any other and inherits
  the whole ADR 0116/0117 discipline; the delay grants it nothing.

### Two absences, two states

ADR 0009's single "offline or degraded" splits into `no_network` and
`no_model`, independently displayable and independently true. The
person must be able to tell "I cannot send this" from "I cannot have
this summarized", because different decisions follow from each.

Neither state may render a floor operation as blocked. An avatar that
reports itself broken while capture works teaches the person that Pico
is unreliable offline, which is the opposite of what this contract
buys.

### An approved delegation does not act on stale judgment

For an ADR 0037 delegation the person already approved, absence splits
by what the approval actually covered.

The deterministic part continues: a rule of ADR 0037's level 4 shape -
"order automatically if below ten percent and the price is below the
configured limit" - is arithmetic over local state and runs without a
model, subject to its existing scope and amount limits.

The model-dependent part does not. A delegation that needs judgment -
selecting a supplier, weighing options, deciding what "best" means -
does not proceed on degraded judgment, and it does not fire unattended
once the provider returns. It becomes a pending item the person sees.
An approval is given for a decision of a certain quality, made in a
certain world; substituting worse judgment, or executing hours later
into a changed world, is not the thing that was approved.

## Gates

- **O1 - The floor is named and mechanically enforced (four of five
  families):** `offline-floor.json` declares each family's modules and
  `scripts/check-offline-floor.mjs` resolves their transitive import
  closure, failing on a forbidden reachable import or a forbidden global
  call. It runs in `release:verify` beside the companion boundary check.
  Type-only imports are not walked: they are erased before anything runs,
  and flagging one would be a false positive whose natural fix is an
  exemption.

  **The floor is not complete, and the check refuses to imply that it
  is.** `time_bound_entry` - an appointment or reminder with a due
  instant - does not exist anywhere in the tree: no field, no scheduling
  path, no event type. Every family named in the protocol must appear in
  the manifest, one that is unimplemented must carry a written reason,
  and that reason is printed on success rather than swallowed. So the
  gate reports "4 of 5 families enforced" and names the gap, instead of
  passing quietly over an empty set.

  The scanner is probed on every run, because a checker that cannot
  catch a violation is worse than no checker: it converts an unexamined
  risk into a false assurance. Four negative probes (a direct forbidden
  import, one three modules deep, a global `fetch(`, and one reached
  through a workspace specifier) must each be caught, and a clean probe
  - including prose that merely mentions `fetch(` and a forbidden
  package inside a comment - must not be flagged.

  It found something on its first run. `recovery-controller.ts` and
  `recovery-card.ts` imported the `@pico/vault-daemon` barrel, which
  re-exports the vault CLI, which talks HTTP to the Foundation. Nothing
  in recovery used the CLI - the wide import was incidental - but it put
  a networked module inside the reachable closure of a floor family that
  must work with no network at all. Both now import narrow subpaths.
  That is the gate doing its job before the floor was ever exercised
  offline.

  Original gate text: the five operation families are implemented with
  no model and no network dependency on their code paths, checked the
  way `scripts/check-companion-boundary.mjs` already checks the shell
  boundary - a sibling check in `release:verify` that fails on a
  forbidden reachable import, proven by negative probes.
- **O2 - Absence is typed and never routed around (vocabulary and
  rules implemented; enforcement still binds the first model
  integration):** `PicoCapabilityOutcome` makes unavailability a typed
  outcome rather than an empty result, which is the distinction that
  matters - an empty result is indistinguishable from "nothing matched",
  which is how a missing dependency becomes a silent wrong answer.
  `timeout` is one of the named reasons, so a provider that answers too
  slowly is unavailable rather than slow.

  `mayPicoFailOverBetweenProviders` is false across classes and true
  only within one, proven over every ordered pair. `mayPicoQueueUntilReachable`
  queues an already-approved delivery and refuses an approval whatever
  its flag says, because a path that could not be approved offline must
  not be treated as approved once the network returns.

  What is not done: nothing consumes these yet. There is no model
  provider in the tree, so no code path can be shown to honour the
  no-failover rule under real pressure. The rules are stated and tested
  where they will be read; the enforcement lands with the provider.

  Original gate text: unavailability is a typed outcome, not an empty
  result; no failover across provider classes; timeout equals absence;
  delivery may queue, approval may not.
- **O3 - Enrichment on reconnection (binds the companion milestone):**
  additive records in the ADR 0069 idiom, idempotent, origin-labeled
  under ADR 0116 W2 and typed under ADR 0117 X2, over the existing ADR
  0112 hook; never an edit of the captured record.
- **O4 - Two states (implemented, except the producer):** `picoAbsenceStates` splits ADR 0009's
  single "offline or degraded" into `no_network` and `no_model`, and
  `PicoDegradationState` carries them as a list so both, either or
  neither can hold - a shape that cannot collapse them back into one.

  `isPicoFloorFamilyAvailableUnderAbsence` holds the load-bearing half:
  no absence renders a floor operation blocked, proven over every family
  against every combination of absences. It is a total function over the
  family list rather than a lookup with a default, so a family added
  later gets the safe answer without anyone remembering to return here.

  The companion now displays them. `PicoCompanionPresentation` carries
  `conditions` beside `kind` rather than folded into it, because the two
  answer different questions: `kind` is what Pico is doing, a condition
  is what is currently absent, and several conditions can hold while
  `kind` is perfectly ordinary. ADR 0119 Q5's storage condition joins
  `no_network` and `no_model` there as the third and fourth kinds, which
  is where that debt is paid.

  The list refuses two rows of the same kind, and refuses `reserved`
  together with `exhausted` - Q5's storage states are a ladder, not a
  set, and showing both would leave the person to work out which is
  true. It is always present on a parsed presentation, never absent, so
  a consumer never has to tell "no conditions" from "conditions not
  stated".

  The floor assurance is rendered from the floor family list rather than
  written by hand, so it cannot drift from what `offline-floor.json`
  enforces. Because the renderer loads plain ES modules with no bundler,
  the contract cannot import the protocol and declares the list itself -
  and a test binds the two, which is what stops the copy from becoming a
  second source of truth.

  **What is not done: no producer is wired.** The surface exists and is
  proven; nothing fills it yet. The sources differ in how far away they
  are, and saying so matters more than a single "open": network has one
  (`net.isOnline()`, already polled by the regain monitor), storage has
  one that the companion cannot yet reach (the core states it on
  `/api/system/status`, and the companion has no read path to it), and
  `no_model` has none at all because there is no model provider. So O4's
  display is done and O4's *observation* is not.

  Original gate text: `no_network` and `no_model` distinct and
  independently displayed; floor operations never rendered as blocked.
- **O5 - Delegation under absence (binds the first Action Runner, with
  ADR 0037):** deterministic rules continue within their existing
  limits; judgment-dependent delegations become pending items and never
  auto-fire late.

## Failure ledger

| Condition | Posture |
|---|---|
| No network | The floor is unaffected. Sends queue as already-approved deliveries; nothing is approved by absence. State `no_network` is shown. |
| No model provider | The floor is unaffected. Enrichment defers to the reconnection hook (O3). State `no_model` is shown. |
| Provider reachable but slow | Treated as absent (O2). The forbidden outcome is a silent trade to a weaker path while the person believes the normal one ran. |
| Attacker degrades the local provider to force a cloud path | This is why O2 forbids failover across provider classes. Availability pressure cannot select a privacy posture; the job fails as unavailable and the person decides. |
| Vault locked | Capture requires unlock, stated openly rather than designed around. Not an offline failure; a custody one. |
| Freshness source unreachable | ADR 0083/0085 stay fail-closed: share-envelope issuance refuses rather than degrades. The one place where absence denies instead of degrading, named here as the deliberate exception. |
| Disk full during capture | Undecided, and the floor makes it urgent: a guarantee that silently drops a photo is not a guarantee. Belongs to the DoS and resource-posture ADR still open in `TODO.md`. |
| Host clock wrong while offline | A due instant and a reminder depend on it. Bounded by the time-authority ADR still open in `TODO.md`; this contract adds a consumer rather than an answer. |

## Consequences

Positive:

- the person keeps the operations whose value deferral destroys, in the
  situations where they have no alternative;
- "no provider answers" gains decided behavior without touching ADR
  0048/0049 registry or envelope semantics;
- the failover ban closes an availability-pressure channel into the
  privacy posture before any model integration exists to inherit it;
- deferred enrichment inherits the ADR 0116/0117 data-flow rules
  instead of quietly becoming an exception to them;
- ADR 0003's serverless intent gains the two axes it never had, and
  ADR 0112's existing carrier hook gains a second use rather than a
  competitor.

Negative and residual:

- the floor names a shape the runtime cannot yet fill: appointments and
  reminders have no data model, and the memory store holds string
  content with no blob path, so photos and audio need their own
  decision before O1 can pass;
- capture still requires an unlocked session, so "offline" and
  "always" are not the same promise;
- the person sees an unenriched item first and a changed one later,
  which is a UX cost paid deliberately for never blocking the capture;
- two states cost surface in an avatar that has none yet;
- Pico is visibly less proactive offline, because O5 refuses to
  substitute judgment - the honest version of a companion that cannot
  currently think;
- nothing here is implemented, and a contract that is only prose is not
  enforceable, which is exactly what O1's mechanical check exists to
  fix.

## Relationship to other ADRs

- Extends ADR `0003`'s serverless mode from one axis to three - server,
  network and model - and leaves its sync, merge and migration
  questions open.
- Gives ADR `0048`/`0049` decided behavior for an unanswered provider
  and turns `model_provider_health` from vocabulary into a consumer,
  without changing registry entries, job envelopes or result envelopes.
- Splits ADR `0009`'s single "offline or degraded" avatar state into
  two independently true states.
- Applies ADR `0105`'s "degrades to what is present" from interaction
  channels to Pico's own dependencies.
- Reuses ADR `0112`'s start/cadence/wake/network-regain hook for
  catch-up and adds no scheduler.
- Keeps ADR `0069`'s reference-not-content idiom for enrichment
  records, and inherits ADR `0116` W2's origin classes and W5's
  no-auto-forward rule plus ADR `0117` X2's typed-value boundary for
  anything a model produces after the fact.
- Bounds ADR `0037`: deterministic delegation rules survive absence,
  judgment-dependent ones do not.
- Leaves ADR `0083`/`0085` untouched and names their fail-closed
  freshness rule as the one exception to degradation.
- Declines the sealed-capture construction that would touch ADR `0086`
  item encryption and stand outside ADR `0088`'s rotation coverage.

## References

- [ADR 0003](0003-family-server-and-user-sovereignty.md)
- [ADR 0009](0009-avatar-and-interaction-model.md)
- [ADR 0037](0037-proactive-companion-delegation-and-procurement.md)
- [ADR 0048](0048-model-capability-delegation-and-remote-inference-boundary.md)
- [ADR 0049](0049-model-provider-registry-and-job-envelope.md)
- [ADR 0069](0069-recording-memory-items-and-reference-only-event-writes.md)
- [ADR 0086](0086-reader-custody-authority-and-opaque-storage.md)
- [ADR 0088](0088-reader-custody-multi-reader-and-kek-rotation.md)
- [ADR 0105](0105-pico-runs-as-a-background-companion-not-a-cli.md)
- [ADR 0112](0112-recovery-product-surfaces-in-the-background-companion.md)
- [ADR 0116](0116-untrusted-content-and-self-replicating-prompt-threat-model-and-hardening-gates.md)
- [ADR 0117](0117-planner-reader-split-and-origin-aware-data-flow-policy.md)
