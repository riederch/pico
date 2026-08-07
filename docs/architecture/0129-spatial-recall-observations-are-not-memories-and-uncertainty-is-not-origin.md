# 0129 - Spatial Recall: Observations Are Not Memories, and Uncertainty Is Not Origin

## Status

Accepted as a storage-shape, degradation and answer-honesty constraint;
the use case arrived as issue #3 from the user on 2026-08-07. SR1 and SR4
are implemented. SR2, SR3, SR5 and SR6 are open.

## Context

The issue asks for one thing a person can check: *"Where did I park my
car?"*, answered on the device with no network and no model. It is a
small question, and it reaches four decisions this tree has not made.

**Sensor samples are not memory items, and ADR 0127 currently says they
must be.** A module owns no storage; its data is memory items and events
under core custody. That is right about *custody* and wrong about
*shape*. A location fix once a second is 86,400 rows a day, each carrying
a retention-policy reference, a domain key and an origin class - and a
GPS fix is not a memory. It is a measurement that may *become* one.

The tree has 31 tables, and the ADR 0119 Q5 ceilings cover four of them:
event log, memory item, audit record, share envelope. The other 27 are
authority and lifecycle records that stay small by nature. A sample
stream would be the first table that **grows like a log without being
one**, and nothing in the current rules describes it.

**The floor has five families and this is a sixth.** ADR 0118 O1 puts an
operation on the floor when its value is destroyed by deferral. "Where
did I park" fails exactly where it is asked - an underground car park,
a foreign city, a dead battery on the router at home. An answer that
waits for a network is not a late answer; it is no answer.

**Origin says where a value came from; nothing says how well it is
known.** The ADR 0116 W2 lattice is about trust in a source. A derived
parking position is authored by Pico itself - the most trusted origin
available - and may still be a guess. The issue is explicit that a
low-confidence answer must not sound certain, and there is no mechanism
for that today.

**The capture path does not exist.** Location and motion come from a
phone. The companion is Linux Electron and the core is a server; there is
no mobile runtime. The issue names the way out itself: the domain logic
must not depend on a particular operating-system API.

## Scope

Covers: what shape sensor-rate data has and who owns it; whether a place
is a core capability; spatial recall as a floor family; how an uncertain
answer is kept from sounding certain; and the port that keeps the
derivation buildable without a phone.

Does not cover:

- the mobile capture runtime itself, which is a product decision with no
  code here to constrain;
- reverse geocoding, map tiles and place names, which are **foreign
  content** and therefore a connector's business under ADR 0127, not this
  module's;
- synchronising location history between a person's own devices, which
  the issue explicitly separates and which would be its own release;
- a general semantic chronicle. This builds the ground a later "where was
  I yesterday afternoon" stands on, and claims nothing more.

## Decision

### The core may hold more than one kind of store; a module still holds none

ADR 0127's exclusion is about **custody**, not about a single table
shape, and this is the first request where the difference matters.
Sharpened:

**A module owns no store. The core may own more than one kind.**

A new kind is allowed when it can answer the five places a module-private
table would have had to be added to. Enumerating them is the durable part
of this decision, because "remember to add it everywhere" is exactly what
gets forgotten:

1. the ADR 0071 domain shred cascade;
2. the backup exclusion list;
3. boot reconciliation;
4. the ADR 0119 Q5 ceilings and the pressure view;
5. the ADR 0119 Q3 byte-identity proof.

Anything that cannot answer all five is not a store the core may hold -
whoever proposes it. The list is the price of a second shape, and it is
deliberately not cheap.

**Observations are the second kind.** High-rate, short-lived, bounded,
and **never individually governed**: no per-sample retention policy, no
per-sample origin class, no per-sample readership decision. They exist to
be condensed and then to stop existing, and the domain they belong to
governs them wholesale.

What comes *out* of them is an ordinary memory item. A parking event has
a place, a time and a meaning to a person; it is a memory, and it is
governed like every other one.

This is also the honest reading of the issue's own energy section, which
asks for adaptive sampling and for old raw data to be condensed into
semantic events. **Both shapes are already in the request** - this ADR
names them rather than inventing them.

### A place is a core capability, in the shape a due instant already has

Position and accuracy belong on a memory item, generically named, exactly
as `due_at` and `raised_at` are: no parking column, no calendar column.
"Where was I yesterday afternoon" composes the same capability, and a
later module that needs a place does not invent its own.

**Accuracy travels with the position and is not optional.** A coordinate
without it is a false precision the surface cannot recover, and every
honest thing that can be said about a remembered place depends on how
well it was known. A position that arrives without its accuracy is not a
less precise position; it is an unusable one.

### Spatial recall is the sixth floor family

`spatial_recall` joins the five: recording a place, deriving what happened
from a sequence of samples, and answering from what is already on the
device. No model decides where a car is, and no packet leaves to find out.

It earns the floor by the ADR 0118 test rather than by being desirable.
The value is destroyed by deferral in the strongest way any family here
has: the question is asked in exactly the place the network is not.

### Confidence is a second axis, and an answer carries it or is not built

Origin says where a value came from. Confidence says how well it is
known. They are **independent**, and collapsing them would be the same
mistake ADR 0118 O4 refused when it split "no network" from "no model": a
derived parking position carries Pico's own origin, the most trusted
there is, and may still be a guess.

So: **a derived spatial answer is a structured value that carries its own
certainty, and there is no way to construct one without it.** This is not
a formatting convention a surface may forget. The surface renders what it
is handed; it cannot be handed a bare position.

**Three levels, not a number.** `high`, `medium`, `low`. A float invites
a precision the derivation does not have - nothing here computes a
calibrated probability, and `0.73` would claim one. Three levels are what
can be said honestly and what a person can act on differently.

**A person's confirmation outranks a later derivation of the same
event.** Someone who has told Pico where the car is has ended the
question, and a subsequent re-reading of the same samples must not quietly
disagree with them. Rejection is equally durable: a candidate a person
threw away does not come back because the derivation still likes it.

### The derivation takes samples, not sensors

The classification, the transitions and the parking candidate are pure
functions over sequences of readings. What supplies the readings is a
port, and the mobile runtime that will one day fill it is out of scope.

Two things follow, and both are why this ADR can be more than a plan:

- the derivation is testable today, against synthetic sample sequences,
  with no phone, no sensor and no permission prompt;
- an operating-system API can be replaced without touching a rule about
  what parking means, which is the requirement the issue itself states.

## Gates

- **SR1 - Model-free, network-free derivation (implemented):**
  `@pico/protocol/spatial-recall` holds the vocabulary - mobility kinds,
  location fixes, transitions, candidates, confidence - and
  `@pico/module-spatial-recall` composes it into transition detection and
  parking-candidate derivation. Pure functions over supplied samples, on
  the ADR 0118 floor as `spatial_recall`, verified by `offline:check`.
- **SR2 - The observation store (open):** the second store kind, with
  answers to all five places above, a ceiling, and condensation that
  turns samples into memory items and then removes them. Until it exists,
  nothing is stored and the derivation runs on what a caller holds.
- **SR3 - A place is a core capability (open):** position and accuracy as
  generically named columns on `memory_item`, migrated by the core, with
  the partial index the query needs - the shape `due_at` already has.
- **SR4 - Uncertainty cannot be dropped (implemented for the derived
  answer):** a spatial answer cannot be constructed without its certainty,
  a low-confidence answer cannot be phrased as a known fact, and a
  person's confirmation or rejection outranks a later derivation of the
  same event.
- **SR5 - Capture through a port (open, binds the first mobile
  runtime):** no operating-system location API is reachable from the
  derivation; samples arrive through the declared port. Proven the way
  ADR 0118 O1 proves its families - by the import closure, not by review.
- **SR6 - Switching off and erasing (open, binds ADR 0127 M3):** capture
  can be switched off as a durable Pico-side decision, and the local
  history can be erased through the paths that already exist. A module
  being off must not mean nobody is responsible for what it recorded.

## Failure ledger

| Situation | Posture |
|---|---|
| A module proposes a table of its own for sample data | Refused. The core may own a second kind of store; a module owns none. The five places are the price. |
| A new store kind cannot answer one of the five places | It is not a store the core may hold, whoever proposes it. |
| A position arrives without accuracy | Refused at the parser (SR3/SR1). A coordinate without accuracy is unusable, not merely imprecise. |
| The derivation is uncertain | The answer says so, structurally. There is no code path from a low-confidence candidate to a sentence that sounds certain (SR4). |
| A person confirmed a parking place and the samples later suggest another | The confirmation stands. Someone who answered the question has ended it (SR4). |
| A person rejected a candidate and the derivation still likes it | It stays rejected. Rejection is as durable as confirmation. |
| Raw samples would be uploaded for classification | Refused by the floor family: `spatial_recall` reaches no network and no model (SR1, `offline:check`). |
| Place names or map tiles are wanted | Foreign content, so a connector module under ADR 0127 - not this one, and labelled at the threshold. |

## Consequences

Positive:

- the storage question is answered once, generally, rather than per
  feature: any future module with sensor-rate data has a shape and a
  five-item price list instead of an argument;
- the derivation is buildable and testable now, years before a mobile
  runtime, because the port keeps the rules independent of the API;
- uncertainty gets a mechanism instead of a convention, and it arrives
  before the first surface that could have quietly dropped it.

Negative and accepted:

- a second store kind is a second thing to remember in five places, and
  the checklist is a mitigation rather than a guarantee;
- three confidence levels are a judgement with no calibration behind
  them, and the boundaries between them will be argued about by whoever
  tunes the derivation;
- the useful half of this use case needs a mobile runtime that does not
  exist, so SR1 and SR4 deliver rules and evidence rather than a feature
  a person can use;
- an accuracy-bearing position on every memory item costs storage on rows
  that will never have one, which is the price of a generic column rather
  than a module-specific table.
