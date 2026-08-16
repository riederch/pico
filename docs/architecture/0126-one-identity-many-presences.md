# 0126 - One Identity, Many Presences

## Status

Accepted as an architecture boundary; P1 and P5 implemented, P2/P3/P6 open
and P4 blocked. The number was
reserved on 2026-08-02 with the work order in
`docs/development/briefs/multi-presence.md`. The two terminology
collisions that order left open were decided by the user on 2026-08-09:
presence is a second axis beside ADR 0015's node roles rather than a
replacement for them, and what a presence declares gets its own name
instead of a second meaning for ADR 0036's capability.

## Context

The work order was written for a future in which one Pico is present on a
phone, a desktop, a stationary installation, an embedded system, a vehicle
and an embodied robot at once. That framing made it look like distant
work. It is not: three decisions already taken depend on a seam this tree
does not have.

**ADR 0124 already uses the word.** Its tier selection rule reads "a tier
is selected from a capability the presence declares, never from a device".
Neither *presence* nor that sense of *capability* is defined anywhere, so
the rule is currently held by prose alone.

**ADR 0131 creates the second one.** Android becomes a full client of the
same identity that runs the desktop companion. Two clients of one identity
is multi-presence whether or not anything names it, and the naming decides
whether their state boundaries are designed or discovered.

**ADR 0129 shows the cost of not having it.** The observation buffer is a
Core table, so capture writes to the Home - and a phone in an underground
car park has no Home. "Where did I park" therefore fails precisely
offline, which is where issue #3 asked for it. The work order already
places *local position* under short-lived presence-local state; the Core
store was built the way it was because presences did not exist yet.

So this ADR is not speculative robotics groundwork. It is the missing seam
under work already done, and writing it down is what stops the next three
decisions from each inventing their own version of it.

## Scope

Covers: the separation of identity from presence, the state boundary
between them, what a presence declares and what that does not grant, the
adapter boundary, where safety-critical control lives, and what
simultaneous presences owe each other.

Does not cover: any device, platform, vendor or robot; the Action Runner;
the transport between presences; the mobile runtime; and any change to
custody, approval or the authority model.

## The binding statement

> Pico is modelled as one device-independent identity with several
> simultaneous presences. Presences provide local input and output and
> declared affordances. Device, platform and real-time details stay behind
> adapters and local safety control. The physical or technical form of a
> presence changes neither identity nor authority.

## Terms

**Identity** - the long-lived, device-independent entity: personality,
relationships and permissions, long-term memory, policy and authority
boundaries, audit and event history, known preferences, and the continuity
of conversations and tasks.

**Presence** - one active or registered execution of that identity on a
concrete device or runtime. It carries a presence id, a device or runtime
id, a presence type, a connection state, locally available affordances,
local input and output channels, local security and device state, and a
bounded short-lived runtime context.

**Embodiment** - a presence with physical sensors or actuators. It is a
specialisation of a presence and never a separate identity or authority
type.

**Affordance** - a typed, declared fact about what a presence's runtime
can do: a microphone exists, a display exists, this surface can print,
this runtime can present the composite tier.

## Decision

### Presence is a second axis, not a refinement of the node roles

ADR 0015 classifies what a node may own and do - Full Client, Light
Client, Relay Server, Core Host. That is a custody and authority
statement. A presence states that this is one of several simultaneous
runtimes of one identity. The two answer different questions, so neither
replaces the other: **a presence runs on a node, and that node's role is a
property of the presence.**

ADR 0015 is therefore unchanged, and nothing it says is reinterpreted -
including ADR 0081's use of the Full Client custody role for the Vault.

### A device installation is not an identity

Several presences may be active at once. A presence may be offline without
the identity being diminished. Removing or replacing a device creates no
new personality, and changing devices requires no artificial break in
identity. A presence synchronises only the state it is authorised to hold.

### What a presence declares is a fact, not a permission

A presence declares **affordances**. ADR 0036's *capability* keeps its
meaning: something Pico does through a connector or tool, evaluated
against policy. The two are not the same thing and must not share a name.

A microphone has no risk class. *Recording with it* has one. So the
`riskClass` and `requiresConfirmation` the work order attached to a
presence capability belong to the action - ADR 0010's tool policy, ADR
0036's capability evaluation, ADR 0048's model delegation - and never to
the affordance.

An affordance is an input to the question *can this action be performed
here*, and never an answer to *may it be performed*. ADR 0124's "capability
the presence declares" is an affordance in this sense, and that reading is
now written rather than assumed.

The Core plans against declared affordances, never against device classes.
A branch on a device type is the shape this decision exists to prevent.

### Durable state belongs to the identity; local state belongs to the presence

Durable and device-independent: identity, relationships, long-term
memories, policy, the authority model, confirmed preferences, and the
task and event history that matters.

Local and mostly short-lived: battery and device state, an active
microphone or camera session, **local position**, posture, current screen
state, short-term cache, available sensors and actuators, local security
states, and any running real-time control.

Only information that is both relevant and explicitly released crosses
from the second into the first, and **the crossing is where ADR 0129's
five-place admission test applies** - shred cascade, backup exclusion,
boot reconciliation, ADR 0119 Q5 ceilings and the Q3 byte-identity proof.
That test was written for a store; it belongs to the boundary.

This relocates the ADR 0129 SR2 buffer. Raw samples become presence-local
rather than a Core table, and what reaches the Home is the derived Memory
Item. Two things follow, and both are improvements: the Home never sees
raw location samples at all, and "where did I park" is answerable on a
device with no network, which is what the issue asked for.

Presence-local state that has not yet crossed owes four things: a bounded
lifetime, a deletion that reaches it when the domain is shredded, exclusion
from Home backups, and an honest statement that it is lost with the device.

### Authority never follows hardware form

A presence gains no rights by being stationary, mobile, sensor-bearing,
actuator-bearing, embodied, or built into a vehicle. Permissions come from
the existing authority, policy and confirmation model and from nowhere
else.

### The adapter boundary

```text
Pico Core
  -> semantic action
  -> affordance and policy check
  -> Action Runner
  -> presence adapter
  -> local platform or device control
```

The Core emits no hardware commands, bus messages, joint values, motor
parameters or real-time set-points. Vendor, platform and protocol detail
lives behind the adapter, in the same idiom as the existing host adapter
and sensor port.

### Safety-critical control stays local, and stays out of the model path

Real-time control, collision avoidance, stabilisation, and force, speed and
workspace limits are local. Emergency stop and safe states remain effective
independently of Pico Core. Loss of network, Core or model leads to a
locally safe state rather than an undefined one.

A presence accepts only semantic, typed and validated actions. Generative
output never drives safety-critical control directly - the ADR 0117
planner/reader split applied where the consequence is physical. And a
safety-critical function is never authorised by the mere existence of an
affordance; it needs its own release.

### Simultaneous presences need ownership, not just a registry

A registry of presences and their affordances is the easy half. The half
that decides correctness is that **an action must not run twice because two
presences received the same context.** So: presence registry and affordance
registry, a heartbeat or lease, selection and priority rules, conversation
and task handover, conflict handling, idempotency, event correlation,
ownership of running actions, and controlled takeover on connection loss.

### Presence data is minimised by default

Sensor streams are processed locally wherever possible. Raw data is not
retained by default. Location, audio, video and environment data are
treated as especially sensitive. Presence-related data carries origin,
purpose and lifetime. Synchronisation and retention are documented rather
than implied. And individual sensors, actuators and whole presences can be
switched off by the person - the ADR 0129 SR6 rule, which already
separates activation from capture, generalised to every presence.

## Rejected alternatives

### Presence replaces the node roles

The cleanest vocabulary and the wrong trade. The custody classification is
anchored in ADR 0081, 0097 and 0131; replacing it would either reinterpret
those silently - which the work order forbids - or force a rewrite of
decisions whose reasoning was about custody rather than runtime.

### One capability concept with two classes

Fewer words, but every evaluation site would have to know which class it is
holding, and ADR 0010, 0036 and 0048 would each need to carry the
distinction. A separate name costs one term and keeps three ADRs untouched.

### `PresenceCapability` with `riskClass` as the work order proposed

Closest to the brief and the one thing in it this ADR declines. It gives
the same name two meanings, which is exactly the collision `TODO.md`
flagged - and it attaches risk to hardware, where a microphone would carry
a risk class that belongs to recording.

### Leave the seam implicit until a second runtime exists

ADR 0131 already created the second runtime, and ADR 0124 already writes
rules in terms of it. Waiting means each of them keeps its own private
version of a concept, and the versions drift where nobody is looking.

## Gates

- **P1 - Terms and boundary recorded (done with this ADR):** identity,
  presence, embodiment and affordance are defined, the two collisions are
  resolved, and the state boundary is written.
- **P2 - Presence and affordance registry (implemented 2026-08-16):** a
  durable registry in the Home, a lease, a computed connection state, a closed
  affordance vocabulary in `@pico/protocol`, and `presence:check` in the gate.

  **The registry stores no connection state**, which is the one shape decision
  here. A presence that lost power cannot write `disconnected`, so a stored
  status is a claim that outlives its subject - the Home would go on reporting
  a dead device as present until something noticed. What is stored is when a
  presence last announced itself; connectedness is computed against the lease,
  and silence needs nobody to report it (ADR 0118 O2, one layer down). A
  `lastSeenAt` in the future earns no credit either: ADR 0120's posture is that
  a wrong clock costs a presence that looks absent, never one that looks
  present after it stopped.

  **One operation registers and refreshes**, because they are the same
  statement - *this presence exists and is running now*. Two would make a
  runtime decide which it was after a restart, and one that guessed wrong
  would either fail to register or reset its own history. `registeredAt` is
  written on insert only, so "since when has this device been mine" survives
  every restart it makes; affordances are replaced rather than merged, because
  a presence that lost its camera is making a true statement about now.

  **The affordance vocabulary is a list of bare strings, and that is the
  gate.** A per-affordance object is where a `riskClass` eventually goes, and
  it goes there without anybody deciding to - so `check-presence-affordances.mjs`
  refuses the shape rather than the field, refuses policy vocabulary anywhere
  in the module, and refuses an announcement that carries an unknown field
  instead of dropping it. Unknown *capability* names may be ignored (ADR 0036);
  an unknown *affordance* is a fact the Core would have to plan against without
  knowing what it means, so it is refused.

  **Nothing plans on a presence type.** The label exists so a person can
  recognise their own device, and the same check refuses any file outside a
  visible exemption list that reads it - the branch-on-device-class this ADR
  exists to prevent. `offering()` takes affordances and returns presences;
  there is nothing in its signature to branch on.

  What P2 does not do is the half ADR 0126 already calls the hard one:
  ownership, selection and takeover are P4, and P4 stays blocked on an Action
  Runner that does not exist.
- **P3 - The state crossing (half implemented 2026-08-16, half deferred by
  the user):** the crossing exists as a door; the SR2 buffer stays where it
  is until a runtime with a sensor exists.

  **The crossing had already happened once before it had a name.** Keeping a
  recall answer is exactly this gate's subject - a derived sentence a device
  is holding becomes a memory item because the person said so (ADR 0116 W5) -
  and it wrote the item with no record of the promotion. The one act this ADR
  calls *explicit, audited* was explicit and unaudited.

  `crossPicoStateBoundary` is now the only way that happens: it writes the
  memory item **and** the content-free `home.state_crossed` record, so an
  audit is not something a caller is trusted to append beside its write. A
  rule a surface enforces is a rule anything else walks past; here promoting
  *is* recording. The record carries which crossing, from which presence when
  one is known, into which domain, and how many sources - never what crossed,
  because an audit trail repeating the content would be a second copy of it in
  a place with different deletion rules.

  The five places are asked at the boundary rather than re-implemented there:
  material with no domain is refused, because a shred reaches memory items by
  domain and material landing without one is material a deletion somebody
  relied on would miss; the Q5 ceiling is named at the door instead of
  arriving as a store error, because "your Home is full" and "that crossing
  was malformed" are different things to be told.

  **The buffer relocation is deliberately not done**, decided by the user on
  2026-08-16 after the measurement below. `appendPicoObservations` has no
  caller outside tests - no route, no module and no device writes an
  observation - so "the Core stops holding raw samples" would today be an
  improvement on paper: it holds none. And the only presence that exists is a
  desktop with no location sensor, so a presence-local buffer would be code
  nobody could run against a real device, which is the reason SR5 gives for
  leaving its own capture port unfilled. The kind is declared
  (`derived_observation`) and unused, so the door the phone will use is the
  door that exists.
- **P4 - Ownership and idempotency (open, blocked):** selection, handover,
  running-action ownership and controlled takeover. Blocked on the Action
  Runner, which does not exist; without it there is nothing to own.
- **P5 - Retroactive naming (implemented):** ADR 0113 keeps its text and
  gains a status note naming its companion the first presence of the
  identity - the ADR 0128 record rule. Nothing about its shell, boundary,
  renderer discipline or C-gates changes. The note points at the seams
  that were already there: the shell-free core is what a second presence
  reuses, the device-local profile is presence-local rather than identity
  state, and further platforms are further presences rather than further
  products.
- **P6 - Per-presence switch-off (implemented 2026-08-16):** a person can
  disable one affordance of one presence, or a whole presence, over
  `home.presence.switch`, recorded as a content-free
  `home.presence_switch_changed` in the shape ADR 0129 SR6 already uses.

  **A second table, not a flag on the affordance**, and that is this gate's
  one shape decision. An affordance is a fact about a runtime; a switch is the
  person's word about it. Merging them would make "you have no camera" and
  "you told me not to use your camera" the same row, and no surface could then
  say the second sentence. So the view carries `affordances` unchanged and
  `withheld` beside it, and only `offering()` - the planning question, *can
  this be done here* - combines them.

  **On until the person says no, which is the opposite of SR6's default and
  for SR6's own reason.** Capture defaults off because recording is an act
  nobody expects from installing a feature. An affordance is not an act - it
  is a fact a runtime declared about itself - and defaulting it off would make
  every newly paired device useless until somebody worked through a list.

  Switching a *whole* presence off is a different statement from switching
  each of its affordances, and stays different: it keeps meaning "not this
  device" after the device gains a microphone. Switches are deleted with the
  presence, so a person who removes a phone and later pairs another under the
  same id does not silently inherit last year's answers.

## Consequences

Positive:

- ADR 0124's tier rule and ADR 0131's second client stop resting on an
  undefined word;
- the ADR 0129 offline gap gets an answer that is also a privacy
  improvement, because raw samples stop travelling to the Home at all;
- affordances make device-class branching visibly wrong rather than merely
  discouraged;
- a robot, a vehicle and a watch need no new authority model, because form
  grants nothing.

Negative and residual:

- the state crossing is the hardest part and is where privacy mistakes
  will land; P3 moves a store that currently works, and moving a store is
  never free;
- P4 is blocked, so simultaneous presences are described here and cannot
  be proven until an Action Runner exists;
- one more vocabulary term, and terms are only free when they are used
  consistently;
- ADR 0129 SR2's Core buffer keeps its five answered places but stops
  being the only home for observations, which is a change to a shape that
  was recently proven.

## Non-goals

No robot or vehicle platform is chosen, no operating system assumed, no
vendor adapter implemented. No autonomous safety-critical control is
enabled, and no low-level motion or real-time regulation enters Pico Core.
Full distributed consistency is not promised. No existing client is
migrated immediately, no existing security or confirmation rule is
bypassed, and no per-device identity is created.

## Migration notes

ADR 0015 stays as written; its roles become a property of a presence.
ADR 0113 gains a status note under P5 and keeps its text. ADR 0129 keeps
its five-place test and its condensation logic; what changes is where the
buffer lives, which is P3's work and not a silent redefinition. Nothing in
this ADR alters custody, approval binding, canonical bytes or the
authority model.

## Open implementation points

There is no Action Runner, so P4 cannot be proven. There is no mobile
runtime, so the first presence that would exercise the state crossing does
not exist. And there is no relay, so cross-presence reachability is
bounded by ADR 0107's direct path to the own Home - which ADR 0131 A7
already states as a product limit for Android.

## Relationship to other ADRs

- Adds a second axis beside ADR `0015` and changes none of it.
- Gives ADR `0124` the defined term its tier-selection rule already uses.
- Gives ADR `0131` the model under which a second full client is a
  presence rather than a second identity.
- Relocates ADR `0129`'s observation buffer and keeps its admission test,
  applying it at the crossing instead of at the store.
- Keeps ADR `0036`'s capability, ADR `0010`'s tool policy and ADR `0048`'s
  model delegation untouched by giving the new concept its own name.
- Applies ADR `0117`'s planner/reader split where the consequence is
  physical.
- Follows ADR `0128`'s record rule for the retroactive naming in P5.

## References

- [ADR 0010](0010-tool-policy-and-executor-model.md)
- [ADR 0015](0015-full-clients-light-clients-and-relay.md)
- [ADR 0036](0036-capabilities-connectors-and-mcp-boundary.md)
- [ADR 0107](0107-pico-link-direct-envelopes-to-the-own-home.md)
- [ADR 0113](0113-electron-shell-over-a-shell-free-companion-service-core.md)
- [ADR 0117](0117-planner-reader-split-and-origin-aware-data-flow-policy.md)
- [ADR 0124](0124-authored-character-core-and-tiered-presentation.md)
- [ADR 0129](0129-spatial-recall-observations-are-not-memories-and-uncertainty-is-not-origin.md)
- [ADR 0131](0131-android-is-a-full-client-not-a-surface.md)
- [Arbeitsauftrag](../development/briefs/multi-presence.md)
