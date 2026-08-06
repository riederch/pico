# 0127 - Pico Modules: Mandatory Delivery, Independent Code, Declared Dependencies

## Status

Accepted as a structural constraint on where product features live; the
initiative and its scope were chosen by the user on 2026-08-06. Nothing
is implemented. Gates M1-M5 are open and bind the first module and every
product feature after it.

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

- **M1 - The module contract (binds the first module):** a module
  manifest declares identifier, kind, dependencies and surfaces; the core
  holds the closed enumerated list; a module owns no table and no guard.
  Proven by a module whose data is shredded, retained and restored by the
  core's existing paths with no module-specific handling.
- **M2 - Mechanical boundaries (binds M1):** a `module:check` gate in
  `release:verify` resolves each module's transitive import closure and
  fails on an undeclared dependency, a cycle, or a reach into another
  module's internals rather than its published subpath. Proven by
  negative probes, in the idiom the offline-floor and tray checks already
  use.
- **M3 - Activation (binds the first two modules):** enabling a module
  enables its dependency closure; disabling one another depends on is
  refused and names the dependents; activation state is readable in the
  system status. Deactivation stops surfaces, producers and schedulers
  and touches no stored data.
- **M4 - Deactivation is loud where promises stand (binds M3, with ADR
  0118 O1):** disabling a module holding unfinished commitments states
  what will not happen, and the statement names the commitments rather
  than the module.
- **M5 - Capability lift (binds the second module):** a mechanic needed
  by two modules is a core capability, not a module dependency, and the
  check reports a module that holds storage mechanics as a boundary
  error rather than a style preference.

## Failure ledger

| Situation | Posture |
|---|---|
| A module is disabled while its items exist | Items stay under core custody: retention, shredding and ceilings run. Only behavior stops (M3). |
| A module is disabled with unfinished commitments | Stated, naming the commitments, before the change takes effect (M4). |
| A module wants a guard of its own | The guard goes to the core. One guard, one place, one failing counter-proof - the property every existing guard has. |
| Two modules need the same mechanic | The mechanic is lifted to a core capability (M5); it does not become an edge in the module graph. |
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
