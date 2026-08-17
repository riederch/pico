# 0139 - Every Action Is Requested by Someone Pico Does Not Trust

## Status

Accepted as the request contract for the action path. **AC1-AC6 are implemented** on
2026-08-10. AC6 became possible when the user decided that reaching a
person is an effect.

First of three that replace ADR 0010's concept note with decisions:
this one says what an action is and who may request one, ADR 0140 says
who decides, ADR 0141 says who acts and what is remembered. The scope
was chosen by the user on 2026-08-10, and the three-way cut was agreed
before drafting rather than discovered afterwards.

ADR 0010 keeps its text under ADR 0128's record rule and gains a status
note. Its risk classes and its design rule survive intact; what changes
is the layering around them.

**AC4 had no author but the tests until 2026-08-17.** Effect consent was
written in one place, `setPicoModuleActivation`, and only for a module
crossing from off to on - while ADR 0127 M3 ships every module on. A
module that was never switched off never made that crossing, so every
Home's steady state was *active, and agreed to nothing*. `depot`
declares `depot.fetch`, the one effect in the tree that installs code,
which made every depot fetch unreachable by anybody.

Reading the code never showed it, because every test of a fetch called
`setPicoModuleActivation` in its own fixture with a comment saying the
effects were "what a person would have read". No person could read
them. A live walk - attach a real repository, permit reaching, press
*fetch now* - answered `requested: 0` with no reason, and that is what
found it.

Two things were added rather than one. `home.modules.consent.read` and
`home.modules.consent.record` give the person the half of AC4 that had
nowhere to happen; the sweep now names `effects_not_consented` instead
of returning a silent zero, because ADR 0118 O4's absence must not
render a working thing broken when the person is the one who can fix
it. What gets recorded is read from the shipped manifest and never from
the caller, so the record of what was agreed is not writable by the side
that benefits from it.

Consent is deliberately **not** granted at boot for a default-on module.
That would be Pico agreeing on the person's behalf, which is the thing
AC4 exists to prevent. Active and consented stay two statements.

## Context

ADR 0010 is from the foundation phase and opens with "Pico will
eventually call tools". Its four layers are the LLM reasoning layer, the
policy engine, the executor and the audit log, and its first sentence
about behaviour is "The LLM may propose an action."

**Three things decided since have moved underneath it.**

ADR 0117 split the model in two. There is no single reasoning layer any
more: a planner that never receives foreign content and a quarantined
reader that does. `assemblePicoPlannerContext` has no parameter through
which a stranger's mail could enter, and `picoReaderCapabilities` gives
the reader `toolAccess` and `keyAccess` as a type whose fields can only
be `false`.

ADR 0128 H3 made an effect a **module declaration**: `<module>.<verb>`
with a description a person could consent to, refused at wiring time if
the manifest never declared it. Effect-bearing became a property rather
than a kind, and the decision to trigger was explicitly left to the
action path - which is this.

ADR 0136 made an effect one of three core slots, ADR 0137 made an effect
carry the instance it acts on, and ADR 0138 put a separate person-level
decision in front of anything that reaches outside. All three point at a
component that does not exist.

**The protocol has been holding a place for it.**
`packages/protocol/src/index.ts` reserves eight event names -
`action.requested`, `action.completed`, `pico_rules.decision_created`,
`approval.requested`, `approval.resolved`,
`action_runner.action_started`, `action_runner.action_completed`,
`action_history.event_created` - with seven payload interfaces,
`ActionRisk` in six classes and `PicoRulesDecision` as
`allow | require_approval | deny`. None is writable; the comment says
they exist "for product planning only".

**And the framing is what blocks it, not the missing model.** A person
pressing a button in the Companion is an action request. It needs a
decision, possibly an approval, an execution and a record - the same
five facts, with no model anywhere. The path was never waiting for
inference; it was waiting for someone to say that the requester is not
the point.

## Scope

Covers: what an action is; who may request one; what an action may name;
what its arguments must carry; where an effect's risk class comes from
and what pins it; and which facts an action produces.

Does not cover:

- the decision itself - inputs, outcomes, where rules live, and why
  rules are not actionable, all of which are ADR 0140;
- execution, approval rendering and what is remembered, which are
  ADR 0141;
- the model delegation runtime (ADR 0048/0049) and the planner's own
  behaviour (ADR 0117), which this ADR consumes rather than defines;
- what a module is (ADR 0127) or what a supplier is (ADR 0136);
- any specific effect, which belongs to the module declaring it.

## Decision

### The requester is never trusted, and that is the whole design

The action path has **requesters**, not callers. A person at a surface, a
schedule, a module, and later a planner are all requesters, and none of
them is trusted. What differs between them is not their standing but
what their arguments carry.

This is stated first because it is what makes the rest cheap. A path
that trusted the person and grew distrust when the model arrived would
have to retrofit a guard into the one place a guard is hardest to add -
and every existing call site would be a site that had never needed one.
There is no trusted path here to be removed later, so the model arrives
as an ordinary requester and nothing about the contract changes.

It also settles a question ADR 0010 could not ask, because in 0010 the
LLM *was* the requester. **Pico itself is a requester**: a schedule that
fires, a module that reacts. Being Pico's own code buys no exemption.

### An action names a declared effect and nothing else

An action request names an effect from a module manifest -
`<module>.<verb>` under ADR 0128 H3 - and there is no other way to
express one. No dynamic name, no free-form command string, no shell, no
"call this URL".

The list is open because ADR 0128 already decided that Pico holds no
closed list of effects: it would have to be guessed before any module
needed one. What is closed is the *source*. An effect exists because a
manifest declared it and `bindPicoModuleEffects` wired it; an action
request is checked against exactly that list, and a name that is not on
it is refused rather than attempted.

ADR 0116 W4's rule is the same rule seen from the other side: unknown
families are gated by default. Here an unknown effect is not a question
for a person, it is a refusal.

### Every argument carries where it came from, and the label is never raised

ADR 0117 X3 in full, and with the vocabulary that already exists rather
than a new one. Each argument in the canonical action request carries a
**`PicoEventOriginClass`** - the closed six of ADR 0116 W1/W2, already
enumerated in `packages/protocol/src/index.ts`, already ordered by
`picoOriginTrustDescending`, and already carried by every event and
memory item under a CHECK constraint - computed by the controller and
never claimed by the requester.

There is deliberately no seventh class for "Pico worked this out". A
value Pico computed is not a class, it is the *result* of a derivation,
and `lowestPicoOriginClass` already answers what class that result
carries: the lowest among its sources. An earlier draft of this ADR
invented a three-name vocabulary with `derived` in it, which would have
been a second, weaker origin model beside the one the store already
enforces.

Two properties make this worth carrying, and only the first is new.

**A label belongs to an argument, not to a request.** "Send my arrival
time to this address" is one value Pico computed and one address that may be
either the person's own or a line from a stranger's mail. A
request-level label would have to pick one and would pick the wrong one.

**A label is never upgraded** - and this half is not new. ADR 0116's
derivation rule already says a summary, extraction, embedding or model
restatement inherits the lowest class among its sources, and
`lowestPicoOriginClass` implements it, refusing an empty source list
rather than silently answering the floor. What this ADR adds is only
that an action argument is one of the things that rule governs.

The property is worth naming even though it is inherited, because it is
the confused-deputy defence: the dangerous action is not "send a
message", it is "send a message to an address that came from the thing
asking you to send it".

### Risk is declared by the module and pinned by the person's consent

ADR 0010's six classes are kept unchanged - `read_only`, `local_write`,
`external_write`, `destructive`, `security_sensitive`,
`privileged_system_action` - and `PicoModuleEffect` gains one, beside
the name and the description it already carries.

The module declares it because the core cannot know what
`home_assistant.turn_on_light` does; only the module that wired it does.
That sits uncomfortably beside ADR 0127's "a module may ask; it may not
decide", and the resolution is not to pretend the core can classify:

**the declaration is pinned at the moment a person consents to it.** The
effect's name, its description and its risk class are recorded together
when the module is activated, and an update that changes any of the three
requires a new decision rather than inheriting the old one. A module may
therefore say what it does; it may not quietly become something else.

This is deliberately weaker than ADR 0136 BR3, where a supplier cannot
express its origin class at all. The difference is that origin is a fact
about a boundary the core owns, and risk is a fact about behaviour only
the module knows. Where the core cannot verify, it pins and re-asks.

### An action produces five facts

1. **requested** - by whom, naming which effect, with which arguments
   and their labels;
2. **decided** - allow, require approval, or deny, with a reason
   (ADR 0140);
3. **answered** - only where the decision required a person, and
   recorded as asked and answered;
4. **started** - the runner began the decided request;
5. **finished** - with an outcome (ADR 0141).

Nothing else is a fact of the action. In particular there is no sixth
fact that says the action was recorded: ADR 0141 shows why Action
History is a view over these five and the existing audit chain rather
than a store beside them.

The eight reserved names carry two duplications against this list, and
ADR 0141 collapses them. Under ADR 0134 that is free: they are reserved,
never writable, and nothing holds an artifact produced under them.

### The first requester is a person, and that is a milestone rather than the design

Nothing here needs a model, and the first slice should have none. A
person triggering a declared effect from the Companion exercises all
five facts, every argument label, the risk pin, the decision, the
approval and the record - and it is testable today, in the way ADR 0129
proved spatial recall against synthetic samples with no sensor.

**One consequence has to be stated because it is easy to trip over.**
`mayPicoUseSingleContextAssembly({ hasExecutor })` returns
`!hasExecutor`. Building a runner flips it to `false`, which makes
ADR 0116 W3's single-context assembly unlawful from that moment on.
Today nothing walks through that door - there is no model context being
assembled at all - so the runner closes a door onto an empty room. The
obligation is that it stays closed when the model arrives, and the
function already says so in code rather than in prose.

## Rejected alternatives

### Keep ADR 0010's four layers as written

They are stale on three counts, not one: the reasoning layer is now two
roles with different trust (ADR 0117), effects are module declarations
rather than a tool registry the core owns (ADR 0128 H3), and the audit
log is a chain over the event log rather than a fourth component
(ADR 0121). Keeping the diagram would mean building to a picture that
three later ADRs have already redrawn.

### Trust the person-initiated path, add distrust when the model arrives

The cheapest first slice and the most expensive second one. Every call
site built under the trusted assumption becomes a site that has to grow
a guard, and the guard would arrive exactly when the requester that
needs it does. ADR 0127's property - one guard, one place - is only
achievable if the place exists before the threat does.

### Let the requester declare the origin of its own arguments

It would make labels cheap and worthless. A requester that can say
`person_present` about a value it read from a stranger's mail has
performed the laundering step ADR 0117 X2 exists to break, and it would
do so through the field designed to prevent it.

### Give the core a closed list of effect names

ADR 0128 refused this and the refusal holds: the list would have to be
guessed before any module needed an entry. What this ADR closes instead
is the *source* of the list, which is checkable without being guessed.

### Let the module's declared risk stand unpinned

Simplest to implement and it hands every module a privilege escalation:
declare `local_write` today, ship `destructive` in an update, inherit
the consent. Pinning at consent costs one recorded value and turns a
silent change into a question.

### Have the core classify risk itself

Honest-sounding, and impossible. The core would have to know what every
effect of every module does, which is the knowledge the module boundary
exists to keep out of the core. The pin is the achievable half of this.

### Keep all eight reserved event names

They were reserved before the audit chain existed. Two of them now
describe the same fact, and one describes a fact the chain already
records. ADR 0134 makes correcting them free now and expensive later.

## Gates

- **AC1 - The effect list is the manifest list (implemented):**
  `buildPicoActionRequest` takes `declaredEffectNames` and refuses a name
  that is not on it, and `picoDeclaredEffectNames` collects that list from
  manifests rather than from anything the core keeps - ADR 0128's refusal
  to hold a closed list of effects, honoured. The refusal has its own
  error, `pico_action_effect_not_declared`, separate from a malformed
  name: a well-formed effect that does not exist is a refusal, not a
  question (ADR 0116 W4).
- **AC2 - Arguments carry controller-computed origin (implemented):**
  `PicoActionRequestArgumentInput` has exactly `name` and `value`, so a
  requester holding a claimed origin has nowhere to put it - ADR 0117
  X1's construction, where the gate is the absence of a field. The
  runtime refuses one anyway, under its own error
  `pico_action_argument_cannot_declare_origin`, because a requester
  asserting provenance is the attack rather than a typo. The class is
  per argument: a request may carry one `own_pico` value beside one
  `external_content` value, and a test pins exactly that.
- **AC3 - Derivation reuses the existing rule (implemented):** the
  controller supplies each argument's *sources* and the class is
  `lowestPicoOriginClass` of them - called, never reimplemented, so an
  empty source list throws `pico_origin_derivation_requires_sources` and
  an unknown class throws `invalid_pico_origin_class` from the shared
  rank check rather than from a local copy. The same call sits on the
  re-parse path over a single source, which is why an unknown class
  cannot survive a round trip either.
- **AC4 - Risk is declared and pinned (half implemented):** the contract
  half is done. `PicoModuleEffect` carries a `risk` from
  `picoActionRiskClasses` - ADR 0010's six, moved beside the effect that
  declares one, with `ActionRisk` in the barrel derived from it rather
  than restated. Absent is refused rather than defaulted: a module that
  never said what it does has not said the safest thing, it has said
  nothing. `picoModuleConsentDrift` compares what a person consented to
  against what a module now declares and returns *what* moved - added,
  removed, changed - in the posture ADR 0127 M4 uses for deactivation,
  because a person being asked again should be told what changed. A
  changed description counts as much as a changed risk: it is the
  sentence they read when they agreed.

  **The durable half landed the same day.** Migration
  `0002_pico_module_effect_consent` gives the triples their own table, and
  `setPicoModuleActivation` records them in the same transaction as the
  activation - the `effects` field is **required** rather than optional,
  which is the mechanism rather than a detail: an optional field is one a
  caller forgets, and what would be forgotten is the record of what was
  agreed. `picoModulesAwaitingConsent` compares declared against consented
  through `picoModuleConsentDrift` and returns what moved.

  Two asymmetries are deliberate and tested. Switching a module **off**
  leaves its consent standing, because ADR 0127 M3 says deactivation stops
  behaviour and re-enabling restores everything - dropping it would make
  off-and-on-again an interrogation. And a module nobody ever activated
  reads as *current* rather than drifted: nothing was lost, nothing has
  been asked yet.

  ADR 0127's five admission questions are answered at the migration rather
  than skipped. The crypto shred deliberately does not reach this table -
  consent is a decision about a module, not data about a life, and a
  domain shred that erased it would silently re-grant what nobody
  re-granted. It needs no ADR 0119 Q5 ceiling for the reason
  `pico_module_activation` needs none: bounded by the closed module list
  times what those shipped modules declare, neither of which a writer can
  grow at runtime.
- **AC5 - Five facts, six names (implemented):** `actionEventTypes` holds
  six names for the five facts. `action.completed` left as a duplicate of
  `action_runner.action_completed`, and `action_history.event_created`
  left because ADR 0141 makes Action History a view over the event log
  and the ADR 0121 chain. `ActionCompletedPayload` and
  `ActionHistoryEventPayload` went with them; ADR 0010's redaction
  requirement did not, and survives as
  `picoActionRecordRedactionModes` for ADR 0141 RN6.

  The vector for a reserved name is the text fence in
  `public-surfaces.md` that `index.test.ts` pins, and it followed. One
  edit went further than ADR 0134 obligation 2 normally allows: ADR 0026's
  wire-naming example named `action_history.event_created`, and a test
  asserts every name in that fence is a live event type - so an
  illustration of a naming rule would have failed a check rather than
  read as history. The example moved to a surviving name and ADR 0026
  gained a status note saying so; its prose naming
  `ActionHistoryEventPayload` was deliberately left alone, which is the
  ordinary handling.
- **AC6 - The first requester (implemented, and not the one this gate
  expected):** the user decided on 2026-08-10 that **reaching a person is
  an effect**, which gave the action path its first subject. The calendar
  declares `calendar.raise-entry` - the first effect-bearing module in this
  tree - and the ADR 0118 O1 scheduler stopped writing the due event
  itself and became a *requester*.

  That is a better first caller than the Companion would have been, and
  the reason is this ADR's own first rule: the requester is never trusted,
  and being Pico's own code buys no exemption. A path whose first caller
  was a person pressing a button would have been built against the easy
  case. This one was built against Pico itself.

  All five facts are recorded - requested, decided, started, finished, and
  the approval question where one is required - with each argument
  carrying the origin class the controller computed. `require_approval`
  parks rather than proceeding, because ADR 0141 RN4 does not exist:
  recording the question and stopping is honest, running it because nobody
  could answer would not be.

  What stands in for Pico Rules is the floor only (ADR 0140 RL3), with
  `hasRuleForEffect` answered from the AC4 consent record - a person read
  that effect's description and risk class when they switched the module
  on. A rule engine adds contextual decisions above this; nothing here is
  one, and the ADR says so at the call site.

  Two things this turned up. `bindPicoModuleEffects` had never run at
  runtime, because no module had ever declared an effect; the declaration
  is what forced the wiring to exist. And ADR 0010's six risk classes have
  no name for *interrupting a person* - `local_write` is the honest
  nearest, and the gap is stated rather than filled with a seventh class
  invented on the spot.

## Failure ledger

| Situation | Posture |
|---|---|
| A request names an effect no manifest declared | Refused at the request contract, before any decision is asked for (AC1). |
| A requester supplies its own origin class | There is no field for it. The class is controller-computed (AC2). |
| A stranger's address is summarised and re-used as a destination | Still `external_content`, by ADR 0116's derivation rule rather than by a new one (AC3). |
| A module updates and raises its own risk class | The pinned triple no longer matches, so consent is asked again rather than inherited (AC4). |
| Pico's own scheduler requests an effect | It is a requester like any other. Being Pico's code is not a standing (this ADR's first rule). |
| A planner arrives later and requests an effect | Nothing in the contract changes. It is a requester whose arguments carry what they carry. |
| The runner is built while a model context is still assembled in one piece | `mayPicoUseSingleContextAssembly` answers false, and the assembly is unlawful from that point (AC6, ADR 0116 W3). |
| An effect is requested that reaches outside | The contract holds, and a second, prior person-level decision under ADR 0138 CO3 still has to have been made. |

## Consequences

Positive:

- the action path stops waiting for a model it does not need, and
  becomes the first thing in this tree that a person can *do* rather
  than configure;
- ADR 0117 X3 gets the executor it has been binding since it was
  written, and ADR 0128 H3's "the action path decides" stops pointing at
  nothing;
- the model arrives as one more requester rather than as a rewrite,
  because the distrust was never conditional on it;
- effects gain a risk class where the knowledge is - in the module - and
  a pin where the authority is, with the person.

Negative and residual:

- three ADRs where ADR 0010 had one page, and a reader now has to hold
  the request contract, the decision and the execution separately;
- pinning name, description and risk means a module cannot improve its
  own wording without asking again, which will feel like friction for
  changes that are genuinely cosmetic;
- labels are only as good as the boundaries that compute them; an
  argument that entered through a path with no threshold has no honest
  label to carry, which is a reason to add thresholds rather than a
  defence;
- nothing here reduces what a person may do wrong. A person-present
  argument is trusted because the person supplied it, and a person can
  be deceived outside Pico entirely.

## Relationship to other ADRs

- Replaces the layering of ADR `0010` and keeps its risk classes, its
  outcome vocabulary and its design rule. ADR 0010 keeps its text and
  gains a status note under ADR `0128`'s record rule.
- Implements ADR `0117` X3 and is the executor that X3, X4 and
  ADR `0116` W4 all bind.
- Consumes ADR `0128` H3's declared effects and extends
  `PicoModuleEffect` with the risk class.
- Sits under ADR `0127`: a module may ask, the core decides, and the
  pin is what makes that true where the core cannot verify.
- Feeds ADR `0140`, which decides, and ADR `0141`, which executes and
  remembers.
- Bound by ADR `0136` (an effect is a slot), ADR `0137` (an effect
  carries its instance), ADR `0138` (reaching outside is a separate,
  prior decision).
- Revises reserved protocol names in place under ADR `0134`.

## References

- [ADR 0010](0010-tool-policy-and-executor-model.md)
- [ADR 0116](0116-untrusted-content-and-self-replicating-prompt-threat-model-and-hardening-gates.md)
- [ADR 0117](0117-planner-reader-split-and-origin-aware-data-flow-policy.md)
- [ADR 0127](0127-pico-modules-mandatory-delivery-independent-code-declared-dependencies.md)
- [ADR 0128](0128-home-assistant-is-a-host-not-a-frame-and-the-effect-bearing-module.md)
- [ADR 0134](0134-formats-revise-in-place-until-the-first-kept-identity.md)
- [ADR 0136](0136-pico-bridges-and-libraries-the-slot-is-the-contract.md)
- [ADR 0137](0137-suppliers-are-instances-coverage-decides-whether-they-add-up.md)
- [ADR 0138](0138-reaching-outside-costs-something-and-is-off-until-someone-says-so.md)
- [ADR 0140](0140-pico-rules-decide-from-a-closed-input-and-are-not-themselves-an-action.md)
- [ADR 0141](0141-the-runner-executes-what-was-decided-and-history-is-a-view.md)
</content>
