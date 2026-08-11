# 0145 - A Reading Is Not a Thing, and a Watch Must Fire on Silence

## Status

Accepted as the contract for measured quantities arriving from a supplier
and for the standing conditions that turn one into an action request.
**MQ1-MQ7 are open and nothing here is built.**

Decided in conversation on 2026-08-11, from the user's proposal: a tool
reports the fill level of a vessel, the value is stored without model
contact, and something watches it - to display it, to raise an alarm, or to
switch on a pump. The proposal is sound and this ADR is mostly its
consequences. Two things in it are corrected rather than adopted, and both
corrections are the content: the proposed **entity** is two facts this tree
keeps apart on purpose, and the watching half does not exist anywhere,
which the wording made sound like a detail.

Designed against a real payload rather than a sketch. The user's
`WWG_WaVe.metric.get_latest` returns, for station query `HB2`, two readings
- `wwg.pog.hb2.lvl.left` and `wwg.pog.hb2.lvl.right`, both labelled *HB2
Kammer Links/Rechts*, both `291`, unit `cm`, timestamp
`2026-08-11 14:30:25`. Three of this ADR's refusals come from fields in
that response, and are noted where they land.

## Context

**This is the first supplier case in the tree that needs no model, and
that is why it arrives before the ones that came first.** ADR 0136 placed a
Pico Library and then said plainly that it is not readable: a corpus is
prose, and prose reaches a model only through ADR 0117 X4's quarantined
read job, which does not exist. A fill level is a number with a unit, and
its consumer is a comparison. The quarantine question does not arise
because no model is involved at any point.

That asymmetry is worth stating as a rule rather than as an observation,
because it decides sequencing for every future supplier: **what a supplier
delivers as a typed quantity is usable today; what it delivers as text is
usable when X4 exists.** The same MCP server can do both, and the two
halves are not equally blocked.

**The slots for the data half already exist and were designed against this
exact shape.** ADR 0136 BR1 closed the list at observation, memory item and
effect, and ADR 0136 already worked the split through on a ship: "An AIS
position is a measurement and belongs in the buffer, where the 48-hour
window and the row ceiling apply. A ship's build year is not a measurement;
once resolved it becomes an ordinary memory item." A level reading is the
position; a chamber's overflow height is the build year.

**What does not exist is the trigger.** ADR 0143 DP8 gives a task the shape
*identifier, interval, and an effect it requests*, and the load-bearing
part is already written into the code: "A task does not do something; it
asks." ADR 0139 makes every requester untrusted, ADR 0140 decides,
ADR 0141 executes and records. The whole chain behind a firing is built.
Nothing in the tree turns a measurement into the request that enters it.
A search for a threshold, trigger or watchdog concept finds only Home
Assistant add-on health checks.

**The entity framing is Home Assistant's and importing it would undo an
ADR.** HA models a sensor as an entity carrying a current state, so the
thing and its latest value are one record. ADR 0129 is titled
"observations are not memories" and exists because that merge is wrong
here: a measurement is capped, short-lived and never individually
regulated, while a memory item carries retention, readership, origin and a
deletion state. ADR 0128 spent an entire ADR separating Home Assistant as a
host from Pico as a frame; taking its central noun back would be the same
error at the data layer.

**The dangerous half is not the pump; it is the silence.** A compromised
server reporting "empty" runs a pump dry and a server reporting "full"
overflows a chamber, and both are contained by the path every request goes
through. A server that stops answering produces no request at all, and a
watch that only knows how to fire on a value is indistinguishable from a
watch on a system that is fine. ADR 0119 Q5's posture, quoted in ADR 0143
DP8, is the one that applies: the case that cannot be measured must not be
the one case that is unprotected.

## Scope

Covers: what a measured quantity is when it crosses a slot; where its unit
lives and what may be done with it; what the measured instant must carry;
what a standing condition is, who may declare one and who sets its numbers;
when it fires and when it must fire without a value; and which attachment
acts.

Does not cover:

- what a supplier is and where its code runs (ADR 0136), or how one
  arrives (ADR 0143);
- MCP specifically (ADR 0144). A quantity may equally arrive from a Home
  Assistant connector, a Meshtastic adapter or a local sensor; nothing here
  mentions a transport;
- the decision, the approval and the record that follow a request
  (ADR 0139, ADR 0140, ADR 0141), which this feeds and does not change;
- which module owns levels, vessels or any other subject matter. That is
  ADR 0127's question and a module is where the surface, the vocabulary and
  the thresholds live;
- retention or aggregation of long series, which is ADR 0133's: a history
  is derived from the source that holds it, and anything Pico flattens is a
  cache with a named correction point;
- emergency escalation and alarm surfaces (ADR 0112, ADR 0020), which a
  watch may request into and does not define.

## Decision

### A reading is not a thing, and there is no record that is both

Two facts arrive from one response and they land in two places:

- **the thing** - that HB2 has two chambers, what each holds, where its
  overflow sits, which Private Space it belongs to - is a **memory item**
  under ordinary custody, with retention, readership and a deletion state;
- **the reading** - 291 cm at 14:30:25, with its confidence - is an
  **observation** in ADR 0129 SR2's buffer: a domain, a kind, an instant
  and a payload, and nothing else.

There is no third record joining them, and none may be added. The buffer
holds no reference to a memory item, because a measurement that pointed at
a durable record would have to answer what happens when the record is
shredded and the measurement is not - and ADR 0129 SR2 answered its five
store questions on the premise that a row carries only a domain.

The link is the **source token** inside the reading. A watch and a surface
resolve it against whatever the module knows; the buffer does not.

**A station is not an instance.** `wwg.pog.hb2.lvl.left` and
`wwg.pog.hb2.lvl.right` come from one supplier attachment, and ADR 0137
IN1's instance identity is that attachment rather than either station.
Attaching one supplier per station would answer IN2's coverage question
wrongly - two stations of one system are not two systems with overlapping
coverage - and would multiply credentials, spaces and reach decisions by
the number of sensors somebody owns.

### The quantity is typed in the protocol, not in the schema

A comparison must not parse. The moment a threshold is evaluated by pulling
a number out of a free-form string, the parse is where a unit error lives
and the parse is in the caller.

So a metric reading's payload is a **canonical form the protocol writes and
reads**, refused for that kind if it is anything else, carrying:

- the magnitude;
- the unit, as an opaque token;
- the source token the reading is about;
- the confidence, in ADR 0129's three levels.

**The typing is deliberately in the protocol rather than in columns.**
ADR 0129 SR2 says the buffer carries "a domain, a kind, an instant and a
payload, and nothing else - no retention-policy reference, no origin class,
no readership decision, no deletion state - because it is a measurement
rather than a memory". That sentence is a decision, and a metric is not a
reason to reopen it. A caller gets a typed value; the store keeps its
shape.

**A value cannot be built without its confidence**, in ADR 0136 BR4's
idiom, and no supplier output may present itself as certain. The WWG
response carries no confidence field, which is normal - almost none do -
and the supplier therefore states one rather than the core inventing a
default. `confirmedByPerson` remains a field only a person moves.

### Units do not convert; they must match

A comparison between a reading in one unit and a threshold in another
**throws**. It does not convert, and there is no conversion table anywhere
in the core.

This is ADR 0136 BR6's construction applied one layer out: a cross-kind pin
comparison throws rather than answering `differs`, because `differs` would
suggest re-pinning could fix it. Here, a converted comparison would suggest
the two were talking about the same thing when nobody checked that they
were.

The alternative is the failure everyone knows by name. A conversion table
is a place where a threshold quietly changes meaning - by a factor of a
hundred, in the direction that reads as *not yet urgent* - and it is
reached by code that looks correct. Refusing costs one edit when somebody
genuinely changes units, and that edit is somebody deciding.

The token is opaque on purpose. The core does not know what `cm` means and
must not: a closed unit vocabulary in the protocol would be a list somebody
extends under pressure, and the property that matters is equality rather
than meaning.

### The measured instant is content, and it is not one without a zone

ADR 0136 BR4 already separates when the bridge asked from when the outside
system measured, as two functions with two names. This adds what the second
one must carry.

`2026-08-11 14:30:25` is not an instant. Read on this machine it means
12:30:25 UTC; read on a server in UTC it means 14:30:25 UTC, and the two
differ by exactly the amount that decides whether a reading is fresh. The
core's parser already refuses it - `isCanonicalInstant` requires
`new Date(v).toISOString() === v` - and that refusal is correct rather than
inconvenient.

**Resolving the zone is the supplier's, and failing to resolve it is an
answer.** The supplier knows which system it is talking to; the core does
not, and ADR 0120's conservative-window posture means a guess here would
propagate into every freshness decision downstream. A supplier that cannot
determine the zone reports an ADR 0138 CO2 condition rather than shipping a
plausible number.

### A watch is a task with a condition, and it asks

A **watch** is ADR 0143 DP8's task with one field added: what it watches.

- an identifier;
- an interval, with DP8's floor;
- the observation kind and source token it reads;
- the condition;
- the effect it requests.

The last field is DP8's load-bearing one and keeps its meaning exactly: a
watch does not act. It makes an ADR 0139 request, ADR 0140 decides it,
ADR 0141 executes and records it, and ADR 0141 RN4's presence-bound
expiring approval applies where the decision says so. A watch that acted
directly would be the second privileged path DP8 exists to prevent.

Nothing about a watch is trusted, and it does not need to be. ADR 0139's
first sentence is that every requester is untrusted and the first one is a
person; a watch is one more requester with no standing the person does not
have.

**A module declares the shape; a person sets the numbers.** The watch and
the effect it requests belong to a module under ADR 0127 - vocabulary,
composition and surface - and under ADR 0128 H3 a module may only declare
effects under its own identifier. The threshold, the interval and the
staleness bound are **settings** under ADR 0104: they differ between two
people in one home, so they live in Pico.

**A depot cannot ship a watch**, and that is the whole of "a supplier
carries; it never decides" at this layer. A supplier that could declare a
standing condition over its own readings would be choosing when Pico acts
on what it reports, which is both halves of the loop in one untrusted
place.

### A watch fires on an edge, and silence is an edge

**Edge-triggered, never level-triggered.** A watch fires when its condition
becomes true, not while it is true.

The reason is a store rather than a preference. Every firing is an ADR 0139
request, which becomes an ADR 0140 decision and an ADR 0141 history entry
over the append-only event log, and that log's ADR 0119 Q5 ceiling is five
million rows. A sensor sitting on 291 against a threshold at 290 flaps, and
a level-triggered watch would turn ordinary noise into a self-inflicted
exhaustion of the one store that is append-only by design. A re-arm
distance and a minimum re-request interval belong to the condition for the
same reason.

**And a watch that cannot express silence does not parse.** A condition
declares the age beyond which a reading is stale, and a stale or absent
reading is a fact the condition sees rather than a state in which it says
nothing. This is ADR 0117 X1's absence construction inverted: there the
parameter is missing so a claim cannot be made, here the parameter is
mandatory so a claim cannot be avoided.

The same treatment covers confidence. A condition declares the lowest
confidence it will act on, and a reading below it **counts as absent**
rather than as a value - so an uncertain reading falls into the staleness
rule instead of quietly satisfying or quietly failing a comparison.

### A watch requests; it never suppresses

Every transition is its own request. There is no condition that cancels a
request, withdraws an approval or stands a watch down.

A watch that could suppress would have a failure mode that looks exactly
like normal operation: a wrong reading, a compromised server or a
mis-scoped condition producing *nothing*, which is what a healthy system
also produces. Turning a pump off when a chamber is full is
`<module>.stop`, requested at the upper edge, and it goes through the same
decision as turning it on. Two requests, symmetric, both visible in
history.

This is DP8's escalation direction generalised. There, a requester may say
*ask about this one* and never *do not bother asking*; here, a watch may
ask for something to happen and never for something not to.

### Measuring and acting are two attachments

The thing that reports the level and the thing that runs the pump are
different suppliers, in the ordinary case attached separately, credentialed
separately and living in their own Private Space. ADR 0137 already requires
an effect to name its own instance, and this is the case that makes it
concrete: a watch reads from one attachment and requests against another,
and neither knows about the other.

Nothing here creates a path between them. The watch reads a store the core
owns and makes a request into the action path; the acting supplier receives
a `cause` only after ADR 0140 decided, exactly as it would for a request a
person made.

### The names

**This ADR adds no row to ADR 0026's map, and refuses one word explicitly.**

`Entity` is Home Assistant's, it means the merge this ADR is written to
prevent, and ADR 0026's design rule - never let a nicer name hide a weaker
boundary - applies precisely: one word for a durable record and its latest
value would make the two look like one custody question when they are two.

`Sensor` is refused for a smaller reason and a real one: it names the
hardware, and a quantity may arrive from a calculation, a register or
another Pico. `Metric` is kept as the technical word for the kind because
it describes the shape rather than the origin.

**Watch** is used here as a technical term and not proposed as a product
term. If a surface ever needs one, ADR 0026 decides it then, against a
surface that exists.

## Rejected alternatives

### An entity carrying its current state

The proposal as it was made, and the shape every home-automation system
uses. It puts a measurement and a durable record in one row, which forces
one answer to two custody questions: a shred must either take the readings
with the thing or leave a record pointing at nothing, retention has to
apply to a buffer sized for two days and to a record meant to outlive it,
and ADR 0119 Q5's ceilings stop separating a working buffer from a store.
ADR 0129 refused this merge for location fixes and the refusal is not
weaker for water.

### Store the reading as a memory item

The path of least resistance, since memory items already exist and the
buffer would need extending. It puts a value that is superseded every five
minutes under ceilings sized for things a person meant to keep, gives every
reading a retention policy reference and a readership decision it has no
use for, and makes ADR 0119 Q5's memory ceiling a function of how many
sensors somebody owns. ADR 0129 made this decision once already.

### Let the watch be a Pico Rule

Superficially tidy: rules are already the place where conditions live. It
collapses the trigger and the permission into one object, and then changing
a rule can cause an action - which ADR 0140 refuses in as many words, since
a rule to change is not itself an action. It also puts a condition over
external content into the decision layer, where ADR 0140 admits a closed
typed input precisely so that nothing from outside chooses an outcome.

### Convert units in the core

The helpful option. A conversion table is one table, and it is also the one
place where a threshold in metres and a reading in centimetres agree with
each other while meaning different things. The failure is silent, off by
two orders of magnitude, and in the direction that reads as safe.

### Level-triggered watches

The simpler implementation, and a denial of service against the append-only
event log. A sensor resting on its threshold produces one request per
interval forever, each with a decision and a history entry, in the one
store ADR 0014 makes append-only and ADR 0119 Q5 caps. Edge triggering with
a re-arm distance costs a field.

### A free-form payload the condition parses

What the existing buffer invites, since `payload` is a string "as the
producing module wrote it". For a location fix that is right - the shape is
the producing module's business and nothing else reads it. A quantity that
a threshold reads is not that: the parse moves into every caller, and the
first caller that reads `291` without reading `cm` is the failure this ADR
exists to make unwritable.

### Let the supplier declare the threshold

Convenient for a depot author who knows the system, and the leak test
firing. A supplier that decides when Pico acts on what it reports owns both
halves of the loop, and ADR 0136's sentence is unchanged: a supplier may
ask; it may not decide.

### Have a model read the readings and decide

The shape that would make this a modelling problem. It is unnecessary - a
comparison answers the question exactly - and it would be blocked anyway,
because a reading crosses a slot as `external_content` under ADR 0136 BR3
and ADR 0117 keeps that away from the acting model. Choosing the mechanical
path is what puts this whole strand on ADR 0118's floor side of the line
rather than behind an unbuilt runtime.

## Gates

- **MQ1 - A measured quantity is a third observation kind (open):** a
  `metric_reading` kind beside `location_fix` and `mobility_sample`, with a
  canonical payload the protocol writes and reads - magnitude, unit token,
  source token, confidence - refused for that kind in any other form. A
  value without a unit or without a confidence does not parse, in ADR 0136
  BR4's idiom, and no parameter anywhere lets a supplier claim a person's
  confirmation.

  This is an ADR 0127 M5 lift and it needs a **migration**, which the
  buffer's shape makes cheap and the schema makes unavoidable:
  `pico_observation.kind` carries
  `CHECK (kind IN ('location_fix', 'mobility_sample'))`, so a third value
  is a table rebuild rather than a list edit. It is also the one table in
  the tree where a rebuild costs nothing, because its contents expire in
  forty-eight hours and a snapshot older than the window already comes back
  empty.

  Whoever writes it searches `migrations.test.ts` for the **previous
  migration's identifier** rather than for a number: the product list is
  pinned in five files and eight places in that test alone, and the
  `0007` run found one missing only because the test did.
- **MQ2 - Units do not convert (open):** a comparison between two unit
  tokens that are not equal throws under its own error rather than
  converting, and the core holds no conversion table. Same construction as
  ADR 0136 BR6's cross-kind pin comparison, for the same reason: an answer
  that looks correct and was computed across a boundary nobody checked is
  worse than a refusal.

  A negative probe belongs beside it, in the shape ADR 0136 BR3 needed:
  plant the conversion, and check that the comparison fails rather than
  quietly agreeing.
- **MQ3 - The measured instant carries a zone (open):** the core's parser
  already refuses `2026-08-11 14:30:25`, so this gate is a supplier
  obligation and a condition rather than a core change. A supplier resolves
  the zone of the system it speaks to; one that cannot reports an ADR 0138
  CO2 condition instead of shipping an instant it guessed.

  The measurement instant stays ADR 0136 BR4's middle value - content, not
  bookkeeping - and stays a separate function from the cache age.
- **MQ4 - A watch is declared by a module and numbered by a person (open):**
  the shape is ADR 0143 DP8's task with the watched kind and source added,
  and the effect field keeps its meaning - the watch asks and never acts.
  A module declares it, under ADR 0128 H3's namespacing so it can only
  request its own effects. The threshold, interval, re-arm distance,
  staleness bound and minimum confidence are ADR 0104 settings.

  **A depot manifest has no field for a watch**, in ADR 0143 DP1's and
  DP3's posture that the enforcement is an absent field: a supplier that
  could declare a standing condition over its own readings would own both
  halves of the loop.
- **MQ5 - A condition that cannot express silence does not parse (open):**
  a staleness bound and a minimum confidence are mandatory fields, and a
  reading that is stale, missing, or below the declared confidence is a
  fact the condition evaluates rather than a case in which it says nothing.

  This is the gate the ADR exists for. A watch that fires only on values is
  silent exactly when the system it watches has stopped answering, and
  silence is what a healthy system also produces. ADR 0119 Q5's posture
  applies: the case that cannot be measured must not be the one case that
  is unprotected.
- **MQ6 - Edge-triggered, and a watch never suppresses (open):** a watch
  fires on the transition into its condition, re-arms at a declared
  distance, and observes a minimum re-request interval. There is no
  condition that cancels a request, withdraws an approval or stands a watch
  down; the opposite transition is its own request against its own effect.

  Both halves have the same justification and it is a store: a
  level-triggered watch on a flapping sensor writes one decision and one
  history entry per interval into the append-only event log, whose ADR 0119
  Q5 ceiling is five million rows. And a suppressing watch fails by
  producing nothing, which is indistinguishable from working.
- **MQ7 - Measuring and acting are two attachments (open):** a watch reads
  a store the core owns and requests an effect against a supplier instance
  it names, under ADR 0137's rule that an effect names its own instance.
  No path exists from the reading supplier to the acting one, and the
  acting supplier receives a `cause` only after ADR 0140 decided - the same
  route a request from a person takes.

## Failure ledger

| Situation | Posture |
|---|---|
| A server reports a level that is wrong | The request is made and decided like any other. The requester was never trusted (ADR 0139), and a physical effect carries the risk its module declared (ADR 0128 H3, ADR 0140 RL3). |
| A server stops answering | The condition sees a stale reading and fires on it. A watch without a staleness bound does not parse (MQ5). |
| A reading arrives with low confidence | It counts as absent, so it falls to the staleness rule rather than satisfying or failing a comparison by accident (MQ5). |
| A threshold is set in metres against readings in centimetres | The comparison throws. There is no conversion, so the two never agree while meaning different things (MQ2). |
| A sensor rests on its threshold and flaps | One firing, then re-arm. Level triggering would write a decision and a history entry per interval into the append-only log (MQ6). |
| A timestamp arrives without a zone | Refused by the existing instant parser; the supplier resolves it or reports a condition rather than guessing (MQ3). |
| A depot wants to ship its own alarm condition | There is no field for it. A supplier that decides when Pico acts on its own readings owns both halves of the loop (MQ4). |
| A person shreds the domain holding a chamber | Every reading in that domain goes with it, because a domain is the only custody an observation carries (ADR 0129 SR2). |
| A year of readings is wanted for a chart | Not from the buffer, which holds forty-eight hours. The series is derived from the system that holds it, and anything Pico flattens is an ADR 0133 cache with a named correction point. |
| A reading's label is used as a name Pico reasons over | It is `external_content` like any other foreign text (ADR 0136 BR3); it may be displayed under ADR 0117 X5 and is not an identifier. |
| Two chambers of one system are attached as two suppliers | Wrong shape, and ADR 0137 IN2's coverage question answers it: one system is one instance, and the station is a token in the reading (MQ1). |

## Consequences

Positive:

- the first supplier strand that reaches a working product without a model,
  a quarantined read job or an inference runtime - all three of which are
  unbuilt and none of which this needs;
- the trigger the tree has been missing gets the shape the action path was
  already built for, so a scheduled firing inherits ADR 0140's decision,
  ADR 0141 RN4's approval and the history rather than running beside them;
- ADR 0129's observation buffer gets its first consumer outside spatial
  recall, which is where a design meant to be general first has to prove it
  is;
- the unit refusal removes a class of silent error from a path that ends at
  a physical actuator, at the cost of one field;
- silence becomes a case a condition must answer for, which is the failure
  mode most monitoring systems discover in production.

Negative and residual:

- **a wrong reading still produces a correct request.** Containment is the
  decision path, not verification; nothing here can tell a true 291 from a
  false one, and a supplier that lies produces a correctly labeled lie
  exactly as ADR 0136 said it would;
- the third observation kind is a migration and a table rebuild, and the
  migration list is pinned in eight places in one test - cheap, and cheap
  in a way that is easy to get wrong;
- edge triggering with a re-arm distance is more fields than a threshold,
  and a person setting them can set them badly. A re-arm distance wider
  than the signal is a watch that fires once and never again, and nothing
  here detects that;
- the forty-eight-hour buffer means Pico is not the historian. For a
  display beyond two days the source is queried, which makes the chart a
  dependency on a system that may be unreachable;
- **a watch is a standing instruction a person set once and may not
  remember.** ADR 0141's history records every firing, but nothing here
  surfaces the set of watches that exist, and a condition nobody remembers
  is a decision nobody is making any more;
- this ADR does not decide the module. Which subject matter owns levels,
  what the surface looks like and how a person names a chamber are
  ADR 0127's questions, and until one exists the gates here have shapes and
  no caller.

## Relationship to other ADRs

- Extends ADR `0129` with a third observation kind and keeps SR2's store
  shape untouched: the typing is in the protocol, because "a domain, a
  kind, an instant and a payload, and nothing else" is a decision rather
  than an accident.
- Fills the consumer ADR `0136` BR1 named and BR4 typed. The slot list is
  unchanged; this is the first thing to arrive through the observation slot
  from outside.
- Builds the watch on ADR `0143` DP8's task and keeps its load-bearing
  property: a task asks and never acts.
- Feeds ADR `0139`, is decided by ADR `0140` and executed and recorded by
  ADR `0141`, changing none of them. A watch is one more untrusted
  requester.
- Bounded by ADR `0140`: a watch is not a rule, and a rule is not a
  trigger. Collapsing them would make changing a rule able to cause an
  action.
- Keeps ADR `0119` Q5 honest at the store that is append-only, which is
  what edge triggering is for.
- Applies ADR `0133` to history: the series belongs to the system that
  holds it, and any local flattening is a cache with a correction point.
- Puts thresholds and intervals in Pico under ADR `0104`, and the effect's
  declaration under ADR `0128` H3.
- Refuses a term under ADR `0026` and says which: `Entity` is the merge
  ADR `0129` exists to prevent.
- Independent of ADR `0144`. A quantity may arrive over MCP, over a Home
  Assistant connector or from a local sensor, and nothing here names a
  transport.

## References

- [ADR 0014](0014-deletability-and-append-only-events.md)
- [ADR 0026](0026-product-terminology-and-naming.md)
- [ADR 0104](0104-settings-belong-to-pico-not-to-host-configuration.md)
- [ADR 0112](0112-recovery-product-surfaces-in-the-background-companion.md)
- [ADR 0117](0117-planner-reader-split-and-origin-aware-data-flow-policy.md)
- [ADR 0118](0118-offline-and-model-free-degradation-contract.md)
- [ADR 0119](0119-resource-exhaustion-and-denial-of-service-posture.md)
- [ADR 0120](0120-time-authority-and-conservative-window-evaluation.md)
- [ADR 0127](0127-pico-modules-mandatory-delivery-independent-code-declared-dependencies.md)
- [ADR 0128](0128-home-assistant-is-a-host-not-a-frame-and-the-effect-bearing-module.md)
- [ADR 0129](0129-spatial-recall-observations-are-not-memories-and-uncertainty-is-not-origin.md)
- [ADR 0133](0133-derive-from-the-source-until-the-medium-is-known.md)
- [ADR 0136](0136-pico-bridges-and-libraries-the-slot-is-the-contract.md)
- [ADR 0137](0137-suppliers-are-instances-coverage-decides-whether-they-add-up.md)
- [ADR 0138](0138-reaching-outside-costs-something-and-is-off-until-someone-says-so.md)
- [ADR 0139](0139-every-action-is-requested-by-someone-pico-does-not-trust.md)
- [ADR 0140](0140-pico-rules-decide-from-a-closed-input-and-are-not-themselves-an-action.md)
- [ADR 0141](0141-the-runner-executes-what-was-decided-and-history-is-a-view.md)
- [ADR 0143](0143-a-depot-ships-what-it-runs-and-a-new-commit-is-a-new-decision.md)
- [ADR 0144](0144-mcp-is-a-bridges-transport-and-a-tool-list-is-not-a-catalog.md)
