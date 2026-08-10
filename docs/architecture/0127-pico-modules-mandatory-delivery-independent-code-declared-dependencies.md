# 0127 - Pico Modules: Mandatory Delivery, Independent Code, Declared Dependencies

## Status

Accepted as a structural constraint on where product features live; the
initiative and its scope were chosen by the user on 2026-08-06. M1-M5 are implemented; the calendar was the first module and spatial
recall (ADR 0129) is the second.

Status note, 2026-08-10: ADR 0136 fills this ADR's stated exclusion
without changing it. Content Pico did not author now has a place - a Pico
Bridge or a Pico Library filling a core-owned slot - while third-party
*modules* stay excluded and every module still ships with the product. A
module is still vocabulary, composition and surface; a supplier has none
of the three, which makes it smaller than a module rather than a variant
of one. "Three module kinds, three trust postures" keeps its text, and
ADR 0136 consolidates its `provider` against ADR 0036's `provider_id`.

Status note, 2026-08-10: M2's probe count is now eighteen. ADR 0140 RL4
added one - a module may not value-import the decision contract
`@pico/protocol/pico-rules`, because a module that can construct a
decision input is arguing about its own permission. The manifest side of
that rule needed no probe: H3's namespacing already means a module can
only declare effects under its own identifier, so there is no name it
could use to declare an effect over rules.

The claim is deliberately narrow: this decides **organisation**, not
protection. A module boundary makes features easier to find and harder
to confuse. It does not make them safer, and the safeguards below exist
so that it is never read as if it did.

## Context

The repository has five capability packages - `protocol`, `identity`,
`vault`, `sync`, `appearance` - and five runtimes under `apps/`. Every
package is a *capability*: something other code composes. Not one of
them is a product feature.

Product features have therefore had nowhere to go but `apps/core`, and
the last one showed what that costs. ADR 0118 O1's fifth floor family -
an appointment or reminder with a due instant - landed as columns on
`memory_item`, a scheduler in `apps/core/src`, a vocabulary subpath in
`@pico/protocol`, a form in the Foundation UI and a presentation kind in
the companion. That is five places, and nothing names them as one thing.

**The tree has already half-built this boundary without saying so.** The
`due_at` and `raised_at` columns carry no calendar-specific name; the
scheduler does not either; the vocabulary already sits behind
`@pico/protocol/time-bound-entry` rather than in the barrel; and the only
place the feature identifies itself is a content type. That accidental
shape is the right one, and this ADR names it rather than inventing a
different one.

What forces the decision now is the first feature that is unambiguously a
product: a shared shopping list, arriving as photographs, becoming a
checkable list. It composes existing capabilities - memory items, origin
labels, the reader-planner split, approval-before-durable-write - and adds
no authority of its own. There is no honest place to put it today.

**What already holds, and must keep holding.** Every guard this codebase
relies on is a single place that a counter-proof can knock out: removing
the readership check leaks a title to a member without a grant; removing
the ceiling check admits a write that should refuse; removing the anchor
guard turns a lost anchor into a fresh empty one. One guard, one place,
one failing test. Distributing custody across modules turns each of those
into several places, and every additional place is one that can be
forgotten.

## Scope

Covers: what a Pico module is and is not; where a module's data lives;
whether modules may depend on each other; how activation works and what
deactivation may and may not stop; and the trust posture of the module
kinds that differ from ordinary product code.

Does not cover:

- third-party or externally authored modules, which would need a plugin
  contract, capability negotiation and a per-module trust decision - all
  of which this ADR avoids by shipping every module with the product;
- re-homing the existing capability packages, which are capabilities and
  stay where they are;
- moving anything out of `apps/core` that *is* a guard;
- the model-delegation runtime (ADR 0048/0049), which a provider module
  would consume rather than replace.

## Decision

### A module is vocabulary, composition and surface

A Pico module owns three things: a **vocabulary** (types, parsers, the
rules that make its values well-formed), a **composition** of capabilities
the core already provides, and a **surface** (routes, forms, presentation
states).

Ownership and location are separate, and conflating them would leave the
M2 check with nothing precise to enforce. A module **defines** its
vocabulary - the shapes and rules are its decision - but that vocabulary
**ships from `@pico/protocol` as a subpath**, never from the module
package. The reason is in the deactivation rules below: an append-only
log written while a module was active must stay parseable while it is
off, and a parser that shipped with the module would not be there.
`@pico/protocol/time-bound-entry` is already exactly this shape.

What ships *in* a module package is therefore its composition and its
surface. A module publishes the part of that another module is allowed to
build on, as a subpath export; everything else is internal. The split is
the module's own decision, but it has to be made explicitly, because
"published" and "internal" are exactly what M2 can check and a package
with no such split offers the check nothing to hold on to.

It owns neither of two things, and both exclusions are the point.

**Never its own storage.** A module's data is memory items and events,
under the core's custody. A module-private table would have to be added
to the shred cascade, the backup exclusions, the boot reconciliation, the
ADR 0119 Q5 ceilings and the Q3 byte-identity proof - five places where
it can be forgotten, against zero for a column on an item that is already
covered. The ADR 0118 O1 entries demonstrate the alternative working:
they are shredded, retained and restored correctly because they never
asked to be special.

**Never its own authority.** If a module needs a guard - readership, a
quota, custody, an anchor - that guard belongs to the core. A module may
*ask*; it may not *decide*.

Both exclusions have the same practical consequence, and it is worth
stating rather than leaving to inference: **migrations are core-only.** A
module never adds a column, a table or an index. Where a module needs a
mechanic the schema does not yet have, that mechanic is lifted as a core
capability under M5 and migrated by the core - which is how `due_at` and
`raised_at` arrived, and why they carry no calendar-specific name. A
module shipping its own migration would be owning storage under a
different word.

### The runtime imports the module; the module never imports the runtime

A module owns a surface but registers nothing by itself, and the edge has
to point one way or the two packages form a cycle.

**A runtime imports a module. A module never imports a runtime.** What a
module needs from the core arrives as a **declared port**, supplied at
registration: a narrow interface naming the operations it uses, not the
`EventStore` and not the app. 

A module package therefore depends on `@pico/protocol`, on the published
subpath of any module it declares a dependency on, and on no runtime.

This is not a new pattern here. `PicoTimeBoundEntryStore` in the ADR 0118
O1 scheduler is already exactly that shape - two methods, no store, no
app - which is why that scheduler could move behind a module boundary
without being rewritten. The camera-scan spawn port is the same idea in
the companion.

Two consequences worth stating, because both are load-bearing:

- **Module independence is what ports buy.** A module that only sees the
  protocol and its own ports cannot observe another module even by
  accident, which is what keeps the configurations worth testing finite.
  Where a module genuinely depends on another it imports that module's
  published subpath - a contract, at compile time - while the runtime
  wiring stays with the runtime that hosts them.
- **Only a runtime that can resolve packages imports a module.** The
  core is a Node process and imports modules directly. The Foundation
  dashboard and the companion renderer are not: both load plain ES
  modules with no bundler, where a bare specifier does not resolve at
  all. Their module-facing surfaces therefore receive data through the
  contracts those runtimes already have - the Foundation API and the ADR
  0113 C2 presentation contract - and a module never becomes a package
  dependency of a browser-loaded surface. Where such a surface needs a
  module's vocabulary as a value, it declares it locally and a test binds
  it to the protocol, which is the arrangement `contract.ts` already uses
  for the ADR 0118 floor families.

  This also keeps the ADR 0113 C3 tray budget out of the module layer:
  the companion shell gains no package edges from modules existing, so
  the measured budget and its import check are unaffected.

Modules live in their own workspace directory, `modules/*`, beside
`apps/*` and `packages/*`. They are neither runtimes nor capabilities,
and giving them a third place is also what lets the M2 check enumerate
them without guessing.

### Capabilities live at the store; modules compose them

When two modules need the same mechanic, that mechanic is a core
capability, not a dependency between them.

"Schedulable" is already one: `due_at`, `raised_at`, the partial index
and the scheduler are generic, and a calendar module would compose them
rather than contain them. "Checkable" - a nullable `checked_at` - is the
same shape and would be lifted the same way the moment a second module
needs it.

This is what keeps the module layer thin. A module that turned out to
hold mechanics rather than meaning has drawn its boundary in the wrong
place.

### Always shipped, individually activatable

Every module ships with the product. Activation is a configuration
question, not a packaging one, and the core holds a **closed, enumerated
list** of module identifiers - listed, not derived, in the same idiom as
the ADR 0119 Q2 protective event types. There is no dynamic discovery:
adding a module is a decision spoken in one place.

Shipping everything is what lets this ADR skip a plugin contract
entirely. Nothing here negotiates capabilities, spans version
boundaries, or decides whether to trust foreign code, because there is no
foreign code.

**Where the switch lives is decided, not left to the first
implementation.** Activation is a decision a person makes about their own
Pico, so ADR 0104 rules out a host configuration option: it must not
become a third entry on that ADR's debt list. It is a durable decision
recorded the way this codebase records durable decisions - an event and a
projection - so it survives a restart, is visible in the system status,
and carries the statement M4 requires when something is switched off with
promises standing.

That makes activation the first real Pico-side setting. It does not
resolve ADR 0104's two named violations; `memory_encryption` and
`pico_foundation_token` stay debt, and this ADR does not claim otherwise.
Being a core capability under M5, the mechanism belongs to the core - a
module never stores its own activation state.

### Modules may depend on each other, declared and acyclic

A module may depend on another. Three conditions, and the third is the
one that matters:

- the dependency is **declared** in the module manifest;
- it targets a **published contract** - a subpath export - never another
  module's internals;
- the dependency graph is **acyclic**.

Cycles are what break comprehension and testing, not edges. An acyclic
graph keeps the activation story sound and keeps the configurations worth
testing finite: the core alone, each module with its dependency closure,
and everything on - rather than every subset. A cycle would make that
enumeration meaningless, which is why it is the prohibition and mutual
dependence is not.

Activation follows the graph. Enabling a module enables its closure.
Disabling a module that another depends on is **refused, naming what
depends on it**, rather than cascading silently: a person who turned off
one thing should not discover that a second thing went with it.

### Deactivation stops behavior, never custody

"Not active" is precise, and the precision is where the risk sits.

- **Data outlives activation.** Items belonging to a disabled module stay
  memory items under core custody. Retention, shredding and ceilings keep
  running. A module being off must never mean nobody is responsible.
- **Vocabulary always parses.** The event log is append-only, and records
  a module wrote while active must stay readable while it is off. That is
  a second reason its vocabulary lives in the always-present protocol
  package rather than in the module.
- **What stops is behavior:** surfaces, producers, schedulers.

**Deactivation with standing promises is loud.** Turning off a module
that holds unfinished commitments - a reminder that will now never raise
- states what it is dropping, in the posture ADR 0119 Q5 already uses for
storage pressure: told while there is still room to act. The activation
state is visible in the system status, because a capability that is
missing on purpose must not present as a capability that is broken.

This is also why ADR 0118's floor survives the change. Its guarantee is
against *dependencies* - no model, no network - not against the person's
own decision. A deliberately disabled module is not degradation. The
floor check stays static and keeps verifying the code's reachable
imports whether or not it is running, because the purity of a code path
does not depend on whether it currently executes.

### Three module kinds, three trust postures

Product, connector and provider modules differ in where their input
comes from, and that difference is not cosmetic.

- **Product modules** are Pico's own code composing Pico's own
  capabilities. A calendar, a list. Ordinary trust.
- **Connector modules** bring foreign content in - a share intent, later
  a messaging transport. They label origin at the threshold under ADR
  0116 W2, never behind it, and they are the only module kind whose
  input is untrusted by construction.
- **Provider modules** wrap a model or an external capability under ADR
  0048/0049 and the ADR 0117 X4 quarantine: no tools, no keys, typed
  origin-carrying results.

A module is exactly one kind. A product module that starts accepting
foreign input has become a connector and takes the connector's rules
with it.

## Gates

- **M1 - The module contract (implemented at the calendar):**
  `@pico/module-calendar` declares itself through
  `@pico/protocol/module` - identifier, kind, package name,
  dependencies, published subpaths, surfaces and, since ADR 0128 H3, the
  effects it can cause outside Pico's custody - and the closed
  enumerated list lives in the protocol beside
  `picoProtectiveEventTypes`, listed rather than discovered by directory
  scan. The package publishes `./manifest` and `./calendar` and exports
  no barrel; the manifest parser refuses a bare `.` outright, because a
  barrel is how this tree twice dragged unrelated code into the measured
  tray budget.

  What moved is the reading, not the mechanics. The store, `due_at`,
  `raised_at`, the scheduler and readership all stay in the core; the
  module receives three ports - entries, one title, a clock - and asks
  rather than decides. The Link's `home.time_bound_entries.read` now
  delegates to `picoCalendarDueEntriesView`, and every existing test
  passed unchanged, which is the evidence that the boundary was cut where
  the code already divided.

  **The proof is a negative one and is written as a comparison.** "No
  module-specific handling" cannot be asserted in a comment, so
  `module-custody.test.ts` runs a calendar entry and an ordinary memory
  item through the same core path - crypto-shred, retention sweep, backup
  and restore - and requires the two outcomes to be *identical*. Two
  separate assertions could both pass while the core quietly treated the
  kinds differently; an equality cannot. Each test also carries a case
  that must survive, so the comparison can fail.
- **M2 - Mechanical boundaries (implemented):**
  `scripts/check-modules.mjs` runs in `release:verify` after `build`,
  because it reads each module's declaration by importing the file the
  product loads rather than by re-parsing its source - and it parses that
  declaration with the protocol's own parser. A check with a second
  parser would enforce a different contract than the one that ships.

  It fails on an undeclared dependency, a cycle, a reach into a subpath
  another module does not publish, an import of a runtime from a module,
  a relative import that leaves the module, an export the manifest does
  not publish or a published subpath the package does not export, a
  listed module that ships no package, and - reporting M5 early - a
  module containing storage mechanics: a database driver, a table, a
  migration or an index. ADR 0128 H3 added one more: a module reaching the
  world directly - a process spawner, a socket, the filesystem, `fetch`,
  `process.env` - because a module declares what it can cause and the core
  decides whether to cause it.

  Seventeen probes, and two matter most: **a declared, published, acyclic
  edge between two modules passes**, and **a well-formed declared effect
  passes.** Without it the
  check could be "fails on any module-to-module import", which would
  forbid exactly what ADR 0127 permits. An escaping relative import is
  reported and *not followed*, or the one real finding would arrive
  buried under every consequence of it.
- **M3 - Activation (implemented):** the decision itself is a pure
  function in `@pico/protocol/module`, so the rule is one expression
  rather than whatever the first route happened to do - and a caller can
  show a person what a change would do before it is made.

  **Two asymmetries, both deliberate.** Enabling cascades to the
  dependency closure, because a module whose dependency is off is not a
  disabled feature but a broken one, and nobody asked for that. Disabling
  never cascades: it is refused when another *active* module depends on
  it, and the refusal names the dependents, because a person who switched
  off one thing should not discover that a second went with it - nor be
  left guessing which of several is holding it on. Active rather than
  merely shipped, or a module would be impossible to turn off for the
  sake of something nobody is running.

  **Durable and Pico-side.** A `home.module_activation_changed` event and
  a projection, which is how this codebase records durable decisions; the
  `home.` prefix puts it in the audit family without a second decision.
  ADR 0104 rules out a host configuration option, so the surface is an
  authenticated `host-admin` route and an unauthenticated change is
  refused - asserted rather than assumed. The payload is content-free:
  identifiers and a direction. A request that changes nothing appends
  nothing, because a log full of no-ops would bury the changes that
  mattered.

  **The default is every module on**, and a Home that has decided nothing
  is deliberately distinguishable from one that switched everything off:
  only changed modules get a row, so a future default can still reach a
  Home that never expressed a preference. The default is not a manifest
  field - both shipped modules are ordinary product features a person
  expects to work, and the one privacy question nearby, whether spatial
  recall may begin *capturing*, belongs to ADR 0129 SR5/SR6 where consent
  can actually be enforced. **Activating a module is not consent to
  record.**

  **Deactivation touches no stored data**, proven rather than asserted:
  an entry recorded while the calendar was on is still there, still
  carrying its instant, after the module is switched off and on again.
  Retention, shredding and the ADR 0119 Q5 ceilings keep running over it.
  A module being off must never mean nobody is responsible.

  The projection table is bounded by the closed identifier list - at most
  one row per shipped module, forever - which puts it in the same class
  as the authority and lifecycle tables beside it and explicitly not in
  the second kind of store ADR 0129 gates behind five places.
- **M4 - Deactivation is loud where promises stand (implemented):**
  disabling a module returns what will no longer happen, gathered before
  the change so it describes what was there rather than what is left. The
  statement names the **commitments** - each with its kind, its instant
  and an opaque handle, oldest first - rather than saying the module had
  some. For the calendar those are the entries that still wait, and an
  overdue one counts: it is not stale, it is the promise already broken
  by the longest. A raised entry does not, because it happened, and
  listing it would tell someone they are losing something they have.

  **The statement is content-free, and that is a rule rather than an
  omission.** ADR 0075 A7 keeps administration separate from readership:
  whoever may switch a module off is not thereby entitled to read what it
  holds. So a commitment says that something is outstanding and when,
  never what it says - the same split the ADR 0118 O1 Link read already
  makes. A test asserts the field set and that a title cannot be found in
  the response, rather than trusting a reviewer to notice one being added
  later.

  **It does not gate the stop.** ADR 0128 is explicit that deactivating
  an effect-bearing module must stay immediate, because stopping the
  world changing is sometimes the point. So this is told in the posture
  ADR 0119 Q5 uses for storage pressure - said while there is still room
  to act, never as a confirmation standing in the way - and the module is
  already off on the call that reports what it dropped. Re-enabling
  restores everything, because M3 dropped no data.

  The full count travels with the shown few. A truncated list that
  reports its own truncated length is worse than no list: "and 9,987
  more" is information, a quiet cut is a lie.

  Where a module's promises come from is a map in the runtime wiring, not
  a method every module must implement - a module with nothing
  outstanding simply has no entry, so the core grows no per-module
  branch.
- **M5 - Capability lift (implemented):** the check half has held since
  M2 - `module:check` reports a database driver, a table, a migration or
  an index in a module as a boundary error, and ADR 0128 H3 added every
  direct route out of the process to the same list.

  The lift half was answered by looking rather than by assuming. With two
  modules shipped, **they share no mechanic**: the calendar reads entries
  and orders them, spatial recall classifies samples, and the only thing
  in common is comparing two instants - a comparator, not a capability.
  Saying so is the honest outcome; inventing a shared need to satisfy a
  gate would have drawn a boundary to fit a taxonomy.

  What the look *did* find is a mechanic this tree had twice and got
  right once. The M4 deactivation statement reports a total beside the
  few it shows; the ADR 0118 O1 due-entries view cut its list at fifty
  and said nothing. So a Home with 137 due entries answered with fifty,
  and the companion announced **"50 entries are due"** - a number that
  was a fact about the cap rather than about the person's day. On the
  family whose whole argument is that an unkept promise is worse than one
  never made, that is the wrong direction to be wrong in, and it is the
  direction nobody checks.

  `@pico/protocol/bounded-projection` is that mechanic as a core
  capability: a list plus the true count, with the count refused if it
  would be lower than the list. Both consumers compose it. The cap sat in
  the *store*, not in the view, so the lift also needed a real count -
  `picoDueTimeBoundEntryCount` over the partial index the scheduler
  already uses - reaching the module as a second port operation. Two
  reads can skew by one under a concurrent write, which turns "and 12
  more" into "and 13 more": a different order of wrong from the silent
  undercount, and stated rather than hidden.

## Failure ledger

| Situation | Posture |
|---|---|
| A module is disabled while its items exist | Items stay under core custody: retention, shredding and ceilings run. Only behavior stops (M3). |
| A module is disabled with unfinished commitments | Stated, naming the commitments, before the change takes effect (M4). |
| A module wants a guard of its own | The guard goes to the core. One guard, one place, one failing counter-proof - the property every existing guard has. |
| Two modules need the same mechanic | The mechanic is lifted to a core capability (M5); it does not become an edge in the module graph. |
| A module caps a list it hands to a person | It composes `bounded-projection` and reports the true total. A list that reports its own truncated length is not a smaller answer, it is a wrong one (M5). |
| A module reaches into another's internals | Boundary error at `module:check` (M2), not a review comment. |
| A dependency cycle is introduced | Refused (M2). Cycles are what make the activation and test story meaningless. |
| A product module starts accepting foreign input | It is a connector and takes ADR 0116 W2 threshold labeling with it. |
| Someone reads a module boundary as a security boundary | The stated non-goal of this ADR. Custody and authority are in the core precisely so this reading is never load-bearing. |

## Consequences

Positive:

- product features get a place that is not `apps/core`, so the core stops
  accumulating them and stays the part where "one store, one set of
  gates" is load-bearing;
- the boundary is enforced by the same kind of mechanical check already
  proven twice this tree - the offline floor and the tray import graph -
  rather than by convention;
- activation becomes configuration, without a plugin contract, capability
  negotiation or a per-module trust decision, because every module ships
  with the product;
- the first module is nearly free: the ADR 0118 O1 work is already cut
  along this boundary, so the calendar demonstrates the contract without
  a rewrite.

Negative and accepted:

- more packages means more barrel-import traps, which this tree has hit
  twice at the tray memory budget; the answer is subpath exports from the
  first day and the import boundary in the check, not vigilance;
- more packages means more places where migration and pinned-list edits
  have to follow, which is visible work at every schema change;
- module granularity is a judgement with no mechanical answer, and the
  wrong split is cheap to make and expensive to undo;
- organisation improves; safety does not. Nothing here reduces the number
  of guards or their coverage, and reading a module boundary as
  protection would be a regression this ADR explicitly refuses.
