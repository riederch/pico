# 0140 - Pico Rules Decide From a Closed Input and Are Not Themselves an Action

## Status

Status note, 2026-08-25: **RL4s dauerhafte Hälfte war seit dem 2026-08-11 da,
und niemand konnte sie erreichen.** Gefunden als Roadmap-Befund B22, nachdem
ein berichtigter Prüfer 82 statt 47 Schreibmethoden sah: `setPicoRuleDecision`
hatte außerhalb seiner Tests keinen Aufrufer, `picoRuleDecisions` trug den
Kommentar „for a surface that shows them" neben einer Fläche, die es nicht
gab, und `home.rule_decision_changed` stand in beiden geschlossenen
Ereignislisten, ohne dass irgendetwas es anhängte. Der eine Leser einer Regel
im ganzen Produkt ist der Depot-Sweep, und ohne stehende Regel findet er nie
einen Menschen - also tat der planmäßige Lauf seit seinem Bau nichts.

`home.rule.decide` und `home.rule.forget` schließen das. Zurücknehmen ist ein
eigener Vorgang und nicht „auf `require_approval` zurückstellen": abwesend ist
nicht `deny`, und für einen `local_write` Effekt wäre diese Einstellung
*strenger* als vorher - eine Rücknahme, die verschärft. Eine Regel gilt nur
über einen Effekt, dem jemand zugestimmt hat; eine über einen Namen, den kein
Modul erklärt, spräche über nichts und stünde da, bis irgendwann ein Modul ihn
benutzt.

**Kein `home.rules.read` daneben**, und das ist die Lehre desselben Tages: ADR
0138 CO1 hält fest, dass ein zweiter ungenutzter Mechanismus schlechter ist als
eine benannte Lücke. Was steht, zeigt der Lesevorgang, an dem es hängt -
`home.depots.read` trägt die Regel für `depot.fetch` samt der Domäne, in der
dieser Home sie entscheidet, und das Fenster macht daraus einen Schalter. Eine
allgemeine Regelliste bekommt ihren Vorgang, wenn ein zweiter Effekt eine Regel
tragen kann.

**Und eine Aussage in diesem ADR war stärker als das, was gilt.** Der Satz „a
recorded rule refines and never grants" stand über einer Testgruppe, die zwei
Dinge bewies - eine Regel überstimmt den RL3-Boden nicht und schafft keine
Reichweite, die ADR 0138 CO3 nie erlaubt hat - und den Fall dazwischen nie
prüfte. Dort *gewährt* eine Regel sehr wohl: sie macht aus der Frage, die
`external_write` hergibt, eine Erlaubnis, und genau das ist der Mechanismus,
mit dem ADR 0143 DP8 einen unbeaufsichtigten Lauf handeln lässt. Der Nutzer hat
das am 2026-08-25 bestätigt, nachdem beide Möglichkeiten nebeneinander lagen.
Was eine Regel *nicht* kann, ist unverändert und wird vor der Regel entschieden:
Boden und Reichweitenbedingung werden zu `deny`, und keine Regel kommt daran
vorbei. Die Regel selbst heißt jetzt `applyPicoRulesRecordedDecision` statt
eines blanken `??`, und der ungeprüfte Fall hat einen Test.

Accepted as the decision contract for the action path. **RL1-RL6 are implemented**
(2026-08-10, RL4 completed 2026-08-11), and this ADR is complete.

Second of three replacing ADR 0010's concept note. ADR 0139 says what an
action is and who may request one; this says who decides and on what;
ADR 0141 says who acts and what is remembered.

## Context

ADR 0010 already separated two things that are easy to conflate, and the
separation holds: a tool's **risk class** is static and describes what it
does, while a **policy decision** is contextual and describes what may
happen this time. `forbidden` is not a risk class, and that is stated in
0010 for the right reason.

What 0010 left open is the input. It lists nine things a policy decision
"may depend on" - user identity, device identity, location of execution,
tool risk class, relationship context, privacy zone, data domain, recent
confirmations, current safety mode - as prose, in a document written
before any of them existed.

**"May depend on" is not a contract.** A rule engine whose input is open
cannot be tested against a counter-proof, because there is no statement
of what it was allowed to see. Worse, an open input is how the model's
own words end up as a policy input: a rationale is text, text is
available, and nothing written down says it must not be read.

Meanwhile the tree has grown the inputs that actually exist. ADR 0075
has privacy domains. ADR 0139 gives every argument an origin class from
that closed vocabulary and pins a risk class per effect. ADR 0137 gives
an effect its instance.
ADR 0138 puts a person-level decision in front of anything that reaches
outside. ADR 0129 gives certainty a place. These are typed values, and
they are enough.

**And there is a question 0010 never asks.** If Pico can act, the
highest-value action in the system is "make everything allowed". Rules
have to be something the action path cannot reach, or the whole path is
one successful request away from having no rules.

## Scope

Covers: the outcomes of a decision; the closed input a decision may read;
what happens to an unknown; where rules live and who may change them; why
a rule change is not an action; and how a decision relates to the
separate permission to reach outside.

Does not cover:

- the request contract and argument origin classes (ADR 0139);
- execution, approval rendering and the record (ADR 0141);
- the rule *language*, editor or authoring surface, which is product
  work this ADR constrains rather than designs;
- relationship tiers and the social model behind them, which stay
  concept notes (ADR 0002, ADR 0017) and are named here only as an input
  slot that does not yet exist;
- ADR 0119's quotas and ceilings, which protect the Home against load
  rather than the person against an action.

## Decision

### Three outcomes, and none of them is an exception

`allow`, `require_approval`, `deny` - the vocabulary already reserved as
`PicoRulesDecision`, unchanged.

A denial is **content**: it carries a reason, it reaches the surface that
asked, and a person can read it. It is not a thrown error and not a
silent no-op. This is the same posture ADR 0138 takes for condition
states and ADR 0119 Q5 takes for storage pressure, and for the same
reason: a refusal a person cannot see is indistinguishable from a bug.

The reason is Pico's own text, composed from the decision's inputs. It
never quotes a requester and never quotes a reader.

### The input is closed, typed, and free of prose

A decision reads exactly this and nothing else:

- the **effect name**, and the **risk class pinned** with it at consent
  (ADR 0139);
- the **`PicoEventOriginClass` of every argument** (ADR 0139), per
  argument rather than per request;
- the **privacy domain** the action would act in (ADR 0075);
- the **person present**, if any, and the **device** the request came
  from;
- the **instance** the effect targets (ADR 0137);
- whether the effect **reaches outside** and whether that permission
  exists (ADR 0138);
- **recent decisions** on the same effect, as facts rather than as
  precedent;
- the **clock facts** ADR 0120 already distinguishes, where a rule is
  time-bounded.

Closed for two reasons. A rule that can be tested is a rule whose input
can be enumerated, and every guard in this tree is proved by a
counter-proof that removes it. And an open input is a path: **Pico Rules
never reads prose.** Not the planner's rationale, not a reader's summary,
not an argument's text content, not a description supplied by a
requester. A rule reads the label on a value, never the value's words.

That is the sharpest line here, and it follows from ADR 0117 rather than
from caution. The entire planner-reader split exists so that untrusted
text never reaches something that acts. A policy engine that read the
text would be exactly that thing, one layer lower and with more
authority.

### Unknown is deny

An effect with no rule, an argument with no origin class, a risk class
the core does not recognise, an instance that is not attached, a domain
that cannot be resolved: each is `deny`, with a reason naming which of
them it was.

ADR 0116 W4 states this for tool families - "unknown families gated by
default" - and it generalises. Fail-closed is the tree's existing
posture, and the alternative is a system whose safety depends on a rule
author having anticipated every effect that will ever be declared.

Note what this makes cheap: **a module that ships a new effect is inert
until someone decides about it.** That is the correct default for a
system where modules are always shipped and activation is a
configuration question (ADR 0127).

### Rules are not an action, and they are not host configuration

**No effect may change a rule.** There is no `rules.allow`, no
`rules.disable`, no effect whose declared behaviour is to widen what is
permitted. Editing rules is a durable decision a person makes over an
authenticated surface, recorded the way this codebase records durable
decisions - a content-free event plus a projection - exactly like module
activation (ADR 0127) and capture consent (ADR 0129 SR6).

The reason is short. If a rule change were an action, it would be an
action governed by rules, and the first thing worth requesting would be
the one that removes the governor. Recursion here is not an elegance
problem, it is the whole attack.

And rules live under Pico custody, not in host configuration. ADR 0104
already refuses a fourth entry on its debt list, and rules are the most
consequential setting Pico has: a rule set that a container rebuild could
replace is not a rule set.

### A decision is made once, before anything runs, and it is what the runner reads

The decision is recorded as a fact of the action (ADR 0139) before any
execution begins, and the runner executes against that record. **The
runner never re-decides**, and no component consults the rules a second
time with a different question.

One decision in one place is the property every guard in this tree has.
Two evaluations of the same request are two chances to disagree, and the
disagreement would be resolved by whichever ran last.

If anything about the request changes after the decision, it is a new
request with a new decision. There is no amendment.

### Reaching outside is a different question, asked earlier

An `allow` from Pico Rules does not create reach. ADR 0138 CO3 is a
prior, person-level decision about whether Pico may contact a system at
all, and it is not a policy input that a rule can outvote - it is a
precondition that has either been met or has not.

The two are separate because they answer different questions to
different audiences. CO3 asks a person, once, whether Pico may talk to
this service at all. Pico Rules asks, every time, whether *this* request
is allowed. A design that merged them would let a rule grant reach, which
is the person's decision, or would ask a person about reach on every
request, which is how consent becomes noise.

### Rules are scoped, and the decision says where it applied

A rule may be scoped to a privacy domain (ADR 0075), and the recorded
decision names the domain it was made in. A rule set with no scope would
mean a permission granted for the household calendar silently covering
the financial documents, which is the failure ADR 0137 IN5 already
refuses at attachment time.

This ADR does not decide the scoping *language* - whether rules nest,
inherit or compose is product work - only that a decision is never
domain-blind and that its record says which domain it spoke for.

## Rejected alternatives

### Keep "may depend on" as the input

ADR 0010's prose list, carried forward. It cannot be tested, because
there is no statement of what the engine was allowed to see, and it
cannot be defended, because nothing in it says prose is excluded. The
nine items are good items; what they lacked was a boundary around them.

### Let a rule read the planner's rationale

Attractive because a rationale is exactly the context a human would want.
It is also model-authored text arriving at the component with the most
authority in the system, which is the thing ADR 0117 was written to
prevent. A rule reads labels; a person reads reasons.

### Default allow for effects nobody has ruled on

It would make new modules useful immediately, and it makes the system's
safety a function of whether a rule author kept up with every module
ever shipped. Fail-closed is the tree's posture everywhere else, and
ADR 0116 W4 already decided it for tool families.

### Make the risk class the decision

Simple: destructive always asks, read-only never does. ADR 0010 already
refused this and the refusal is right - `forbidden` is not a risk class.
A read of a stranger's document and a read of the person's own calendar
are the same risk class and not the same decision, and the difference is
in the labels, not in the verb.

### Rules as host configuration

A file the deployment provides. It puts the most consequential setting
Pico has outside Pico, where a second Pico on the same host inherits it
and a rebuild replaces it, and it would be a fourth entry on ADR 0104's
debt list.

### Let rules be changed by an action, with a high risk class

The tempting compromise: make it `security_sensitive` and require
approval. It still makes the governor reachable from the path it
governs, and it means a single successful approval - the thing an
attacker is trying to obtain anyway - can remove every other approval
that would ever be required.

### One decision per action, re-evaluated at execution

Meant to catch a world that changed between decision and execution. It
creates two evaluations that can disagree and gives the later one
authority nobody granted it. A changed world produces a new request, not
a revised verdict.

## Gates

- **RL1 - Three outcomes, and a denial is content (implemented):**
  `picoRulesDecisions` is the runtime list and the barrel's
  `PicoRulesDecision` is derived from it rather than restated.
  `picoRulesFloorOutcome` answers `deny` with reasons instead of throwing
  or going quiet. The reasons are **codes**, not sentences: a surface has
  to be able to act on them, and a reason composed as free text is one a
  requester could eventually influence.
- **RL2 - The input is a closed record (implemented):** `PicoRulesInput`
  names nine fields and `parsePicoRulesInput` refuses any other key, so a
  rationale, a summary, a description or an argument *value* has nowhere
  to arrive - four tests, one per shape. The classes are present and the
  words are not: origins arrive per argument name, never with the value
  they classify. Origin is validated through `picoOriginTrustRank` rather
  than a local copy of the ordering, so an unknown class cannot enter by
  a side door.
- **RL3 - Unknown is deny, by name (implemented):**
  `picoRulesMissingInput` returns every unknown rather than the first,
  from the closed `picoRulesMissingInputCodes`. It takes the request's
  own argument names, because an unclassified argument and an absent one
  look identical from inside the classification map. A module shipping a
  new effect is therefore inert until someone rules on it.
- **RL4 - No effect changes a rule (half implemented):** the manifest
  half turned out to be structural already. ADR 0128 H3 namespaces an
  effect by its declaring module's identifier, so `calendar` can declare
  `calendar.*` and nothing else - there is no name a module could use to
  declare an effect over rules, and no check is needed for what cannot be
  written down.

  What was missing is the link, and `module:check` now refuses it: a
  module that value-imports `@pico/protocol/pico-rules` could construct a
  decision input, and a module that can construct one is arguing about
  its own permission. Type-only imports pass, because a type vanishes at
  emit and decides nothing - proved both ways by adding each import to a
  real module and running the check. The eighteenth probe.

  **The durable half landed on 2026-08-11.** Migration
  `0003_pico_rule_decision` holds one recorded outcome per effect and
  domain, `home.rule_decision_changed` is the content-free event beside
  it - the third decision recorded in the shape ADR 0127 activation and
  ADR 0129 SR6 capture already use, and the one that decides *about* the
  other two. Nothing reads a rule from the environment, and a test sets
  `PICO_RULES_*` to prove it changes nothing (ADR 0104).

  **A recorded rule chooses among the answers the floor leaves.**
  *Corrected 2026-09-10.* This bullet said "refines and never grants" until
  then - the sentence the status note at the top of this ADR quotes and
  retracts, still standing here in the decision text three hundred lines
  below the retraction. What holds is both directions: a rule can tighten an
  `allow` into an approval or a denial, **and** it can turn the approval that
  `external_write` derives into an allow. The second is not a gap, it is the
  purpose - a standing rule is what lets an unattended run act at all (ADR
  0143 DP8), and without one every path has to find a person. What a rule
  cannot do is overrule the RL3 floor or ADR 0138 CO3's reach precondition,
  which become `deny` before it is consulted - tests state all three. Absence is not `deny`, because the
  ADR 0139 AC4 consent record already carries a person's decision that
  this effect may exist; a Home where nobody wrote an explicit rule is not
  a Home that forbade everything, which is the asymmetry ADR 0127 M3 draws
  between never-decided and decided-to-leave-off.

  **This is the base case, not the rule language.** Whether rules nest,
  inherit or compose stays product work; what is built is one outcome per
  effect and domain, which is the thing those would be built on.
- **RL5 - One decision, before execution (implemented):** deciding and
  executing are two functions. `decidePicoAction` records the decision and
  hands back a record; `executePicoAction` takes that record and **has
  nothing to re-decide with** - no inputs, no rules, no requester. Two
  evaluations of the same request would be two chances to disagree,
  resolved by whichever ran last.

  The record carries the request itself rather than pointing at it, which
  makes ADR 0141 RN1's "a changed request is a new request" structural
  instead of a promise: there is no second copy that could differ. And
  anything other than `allow` refuses to execute, `require_approval`
  included - that decision means a question is standing, and running it
  would answer the question by doing the thing.
- **RL6 - A decision names its domain (implemented):** the recorded
  decision fact carries `dataSpace`, and the record the runner reads
  carries `privacyDomain`, so a permission granted in one domain being
  used in another is visible rather than implicit. Rule *scoping* is
  product work this ADR constrains rather than designs; what is built is
  that no decision is domain-blind.

## Failure ledger

| Situation | Posture |
|---|---|
| A module ships an effect nobody has ruled on | `deny`, naming the missing rule. The module is inert rather than permitted (RL3). |
| A planner supplies a persuasive rationale | There is no parameter for it. The decision reads labels, never prose (RL2). |
| An argument arrives without an origin class | `deny`. An unclassified value is not a safe value, it is an unmeasured one (RL3). |
| A request asks to widen the rules | No such effect can be declared; the check refuses the manifest (RL4). |
| A person approves a `security_sensitive` action | It is that action. It does not become standing permission for the next one (RL5). |
| The world changes between decision and execution | The runner executes what was decided or nothing. A changed request is a new one (RL5). |
| A rule allows an effect that reaches an unconfigured service | Still refused, by ADR 0138 CO3. An allow does not create reach. |
| A permission granted in one domain is used in another | The decision names its domain, so the reuse is visible rather than implicit (RL6). |
| Host configuration supplies a rules file | Ignored and refused. Rules are Pico's (RL4, ADR 0104). |

## Consequences

Positive:

- the decision becomes testable, because its input is enumerable and a
  counter-proof can remove one input at a time;
- the prose channel is closed at the layer with the most authority,
  which is where ADR 0117's split would otherwise have leaked;
- new modules are safe by default rather than useful by default, and the
  difference is visible as a named denial rather than as silence;
- the governor is unreachable from the path it governs, which removes
  the single most valuable request an attacker could make.

Negative and residual:

- a closed input will be wrong at least once, and widening it means an
  ADR rather than a configuration change - deliberately, so it is not
  widened by reflex;
- every new effect needs a decision before it does anything, which is
  real setup friction and will read as the system being broken until a
  person has ruled on it;
- rules that read no prose cannot express intent that only prose
  captures; a person who wants "not while the children are home" has
  nowhere to put it until ADR 0002 and ADR 0017 stop being concept
  notes;
- nothing here decides the rule language, so the first implementation
  will make choices this ADR does not constrain, and some of them will
  be hard to undo.

## Relationship to other ADRs

- Second of three replacing ADR `0010`'s layering; keeps its
  risk-versus-decision separation and its three outcomes verbatim.
- Consumes ADR `0139`'s request contract, argument labels and pinned
  risk, and is consumed by ADR `0141`.
- Applies ADR `0117` X1's construction - the gate is the absence of a
  parameter - to the decision input, and honours ADR `0116` W4's
  unknown-is-gated rule.
- Follows ADR `0127` and ADR `0129` SR6 for how a durable person
  decision is recorded, and ADR `0104` for where it may not live.
- Defers to ADR `0138` CO3, which is a precondition rather than an
  input.
- Scoped by ADR `0075` privacy domains.
- Names ADR `0002` and ADR `0017` as the missing relationship inputs
  rather than inventing them.

## References

- [ADR 0002](0002-peer-trust-and-relationships.md)
- [ADR 0010](0010-tool-policy-and-executor-model.md)
- [ADR 0017](0017-contextual-interaction-safety-and-trust-signals.md)
- [ADR 0075](0075-foundation-local-authentication-session-and-membership-threat-model-and-scoping.md)
- [ADR 0104](0104-settings-belong-to-pico-not-to-host-configuration.md)
- [ADR 0116](0116-untrusted-content-and-self-replicating-prompt-threat-model-and-hardening-gates.md)
- [ADR 0117](0117-planner-reader-split-and-origin-aware-data-flow-policy.md)
- [ADR 0127](0127-pico-modules-mandatory-delivery-independent-code-declared-dependencies.md)
- [ADR 0129](0129-spatial-recall-observations-are-not-memories-and-uncertainty-is-not-origin.md)
- [ADR 0138](0138-reaching-outside-costs-something-and-is-off-until-someone-says-so.md)
- [ADR 0139](0139-every-action-is-requested-by-someone-pico-does-not-trust.md)
- [ADR 0141](0141-the-runner-executes-what-was-decided-and-history-is-a-view.md)
</content>
