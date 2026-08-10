# 0137 - Suppliers Are Instances: Coverage Decides Whether They Add Up

## Status

Accepted as a structural constraint on how several suppliers of the same
kind coexist. **IN1 and IN2 are implemented** in
`@pico/protocol/supplier` on 2026-08-10; IN3, IN4 and IN5 are open, and
IN5's domain half landed with IN1.

This was the second half of ADR 0136 until 2026-08-10, when the user asked
for the split. The reason is ADR 0135's rule applied to an ADR rather than
to a design system: a specification a consumer cannot read is not a
specification, and one document carrying both the slot contract and the
instance rules had grown past what a reader holds at once. ADR 0136 keeps
what a supplier *is* and where its code runs. This keeps what happens once
there is more than one.

## Context

ADR 0136 decides that content Pico did not author enters through a
core-owned slot, filled either by a Pico Bridge or a Pico Library. It
describes them in the singular, and every real case is plural.

The user keeps a personal knowledge base, `rchkb`, and it has siblings
belonging to an association or a company. Home Assistant runs at home, in
a camper van and in a holiday house. Issue #4 asks for a provider
interface precisely so VesselFinder can be swapped or joined by another
AIS source.

**Plurality is not a scaling question here, it is a correctness one.** A
design that assumed one supplier and then grew a second would have to
decide, retroactively and under pressure, what an answer means when two
sources disagree, which building a light belongs to, and whether silence
from one of three sites is an answer. Those are not defaults that can be
chosen later without being wrong once.

One of them was in fact chosen wrongly first. An earlier draft of ADR 0136
stated that libraries add up while bridges are alternatives, reasoning
from metering: reading a corpus is free, an API call is not. Three Home
Assistants disprove it - they are bridges, and nobody wants two of the
three switched off. The rule was reading the wrong axis.

## Scope

Covers: what identifies an instance; how coverage is declared and what it
decides; what an empty answer has to distinguish; what a union over
instances owes; how disagreement is reported; how an effect names its
target; and which Private Space an instance belongs to.

Does not cover:

- what a supplier is, what it may produce, or where its code runs, all of
  which are ADR 0136;
- retrieval quality or ranking, which are a consumer's problem;
- discovery, distribution or a marketplace, which stay ADR 0036 non-goals;
- model providers, which ADR 0049 gives their own registry and whose
  plurality that ADR already governs.

## Decision

### The slot list is closed; the instance list is not

Module identifiers are enumerated in one place under ADR 0127 because
adding a module is Pico's decision, spoken once. Adding a supplier is a
person's decision about their own material, their own house or their own
subscription, so no enumeration can exist ahead of it.

This is the tree's first deliberately open identifier list, and the
asymmetry has to stay legible: **what a supplier may produce is fixed;
how many suppliers exist is not.** Every guard that would have leaned on
enumeration leans on the attachment record instead, and an open list gets
a ceiling in the ADR 0119 Q5 idiom - an open list with no ceiling is how a
resource limit gets discovered rather than enforced.

### An instance is named, and the name is never an address

Working copies move, are re-cloned and change host. A camper van's Home
Assistant changes IP at every campsite. An identifier that was a path or a
URL would lose its meaning to a `mv` or a DHCP lease, and with it the
provenance of everything derived from it.

An instance therefore carries a **stable identifier the person chooses**.
A derived item keeps that identifier and the pin it was read at - a commit
for a library, nothing for a bridge - and both belong to the item rather
than to the attachment, so provenance survives detaching the supplier
entirely.

### Coverage is declared, and it decides whether instances add up

An instance declares **what it covers**. Pico unions or chooses according
to that, never according to what kind of supplier it is.

Two AIS providers cover the same ships. They are alternatives, and
metering makes keeping both a matter of paying twice for one answer. Three
Home Assistants cover three buildings and are additive, exactly as two
knowledge bases covering different material are. The kind is the wrong
axis; the subject is the right one.

ADR 0118 O2's rule is unchanged underneath: neither joins across slots.
Two providers of ship positions may substitute for one another. A ship
position never substitutes for a calendar.

### An empty answer says which kind of empty it is

Once coverage is declared, "not there" splits in two, and conflating them
is how a person is misled by a true statement.

The vocabulary of ADR 0118 O2 gains **out of scope** beside not-found: the
ship is not in this provider's waters, the light is not in this building.
Asking an instance that does not cover the subject is a different fact
from an answer that does not exist, and only one of the two is worth
asking someone else about.

### A union over instances names who was silent

The camper is off-grid in a garage. The holiday house is reachable and
empty. A union over three instances where one did not respond must say so.

"No motion anywhere" over two of three houses is a true sentence about the
wrong subject, and it reads as safety. Absence of evidence and evidence of
absence are different answers, and a supplier layer is exactly where they
get quietly merged, because merging is what a union looks like from the
inside.

### Disagreement is reported, never resolved

Where two instances answer the same question differently, Pico gives both
with their identifiers and pins rather than picking.

Under ADR 0129 neither answer was `known` to begin with, so a conflict
lowers certainty instead of being settled by an order nobody chose. A
silent winner would be the worst available outcome: a decision, taken by a
supplier, which is the thing ADR 0136 exists to prevent.

### An effect names its instance, and the instance is never inferred

This is where plurality stops being a modelling question.

Under ADR 0128 H3 a module declares `<module>.<verb>`. With three houses
attached, an effect that did not carry its target could switch on a light
in a building the person is not standing in. The instance is therefore
part of the effect, and the ADR 0106 approval statement renders it from
the same validated fields the signature covers, so what a person approves
says *Ferienhaus* rather than *light on*.

Pico may **suggest** an instance from a derived location, and it will
usually be right. But a derived location never reaches `known` under
ADR 0129, and an unconfirmed guess is not permitted to select the building
that gets acted on. Suggesting and selecting are different acts, and the
difference is only visible in the failure.

### An instance lands in a Private Space, not in a Pico

`rchkb` holds `Finanz`, `Privat` and `Feuerwehr` in one working copy. An
attachment bound to a Pico rather than to a domain would cross every
ADR 0075 privacy boundary in a single act, silently, at attach time.

Bridges are no different, and the holiday house makes it obvious: that
Home Assistant may be shared with family while the camper van's is not, so
the two belong in different spaces although they are the same kind of
supplier speaking the same protocol. **Where an instance lands is a
property of the instance, never of the kind.**

An instance therefore attaches into exactly one Private Space over one
stated subtree or site. A corpus or an estate spanning several is attached
as several instances, which is usually no work at all: a person has
generally already separated their material into different repositories and
different houses, and attaching separately respects that rather than
asking them to re-derive it inside one attachment.

There is no safe default for the mapping, and this ADR does not invent
one. It is a person's judgement about their own life.

## Rejected alternatives

### Metering decides whether suppliers add up

The rule this ADR replaces, and the reason it exists as a separate
decision. It reasoned that free reading unions while paid calls force a
choice, which is true about *cost* and wrong about *meaning*. Three houses
are three subjects at any price.

### Resolve disagreement by a configured precedence

Tempting, and it produces one clean answer. It also makes a supplier's
position in a list into a truth claim, hides that two sources disagreed -
which is itself information a person wants - and turns an unresolved
question into a resolved-looking one. Certainty exists to carry exactly
this, and lowering it is the honest move.

### Infer the instance from where the person is

Correct almost always, and the failure is switching on a light in a
building nobody is in. ADR 0129 already refused to let a derivation reach
`known`; letting one select an effect target would be that refusal undone
at the only place where it costs something physical.

### Make each instance its own module

It would give every instance a manifest, a surface and a place in the
module graph - and multiply by three the thing ADR 0127 exists to keep
singular. Three Home Assistants are one integration configured three
times, not three integrations.

### Let coverage be inferred from what an instance has answered so far

Cheap and self-maintaining, and it makes an empty answer permanently
ambiguous: a subject never asked about looks identical to a subject not
covered. Declared coverage is what makes `out of scope` a fact rather than
a guess.

## Gates

- **IN1 - An instance is named, and never by address (half
  implemented):** `parsePicoSupplierManifest` refuses a path and an
  address under their own errors rather than as a shape failure, because
  the reason is not "wrong characters" but "that is not an identity".
  Address is checked before path, since a URL contains a slash and
  reporting it as a path would name the wrong reason for a correct
  refusal - a test found that ordering. The manifest also carries exactly
  one ADR 0075 domain, which is IN5's first half.

  Open: derived items carrying the identifier and pin, and the ADR 0119
  Q5 ceiling on attachments. Both need a store.
- **IN2 - Coverage is declared (implemented):** a manifest without
  coverage is refused, because undeclared coverage makes an empty answer
  permanently ambiguous. `picoSupplierRelation` answers `alternatives`,
  `additive` or `unrelated` from the declaration rather than from the
  kind - two AIS providers over the same ships are alternatives, three
  Home Assistants over three buildings are additive although all three
  are bridges, and different slots are unrelated because nothing
  substitutes across them (ADR 0118 O2).

  Partial overlap answers `additive` deliberately: where one provider
  knows strictly more, calling them interchangeable would licence
  dropping the one that knows more. `picoSupplierCovers` answers before
  anything is spent, so `out of scope` costs neither money nor
  disclosure (ADR 0138).
- **IN3 - Empty is typed (open):** `out of scope` exists beside not-found
  in the ADR 0118 O2 vocabulary, and a consumer can tell them apart
  without reading prose.
- **IN4 - A union is honest about its parts (open):** an answer assembled
  from several instances names those that did not respond, and two
  instances that disagree yield both answers with their identifiers and
  pins rather than one. No precedence order exists to be configured.
- **IN5 - An effect names its instance (open):** the instance is part of
  the effect and part of what the ADR 0106 approval statement renders from
  validated fields; a derived location may propose an instance and may
  never select it. Attachment names exactly one ADR 0075 domain and one
  subtree or site, refusing an attach that would span several.

## Failure ledger

| Situation | Posture |
|---|---|
| A working copy is moved, or a site's address changes | Provenance survives: a derived item holds the identifier and the pin, never a path or a URL (IN1). |
| A person attaches a corpus at its root, spanning domains | Refused. One instance names one domain and one subtree; the split is already there in separate repositories (IN5). |
| Two instances answer the same question differently | Both answers, with identifiers and pins, and certainty drops. Picking would be a decision taken by a supplier (IN4). |
| One of three sites does not answer | The union names it. "No motion anywhere" over two of three houses is a true sentence about the wrong subject (IN4). |
| A question is asked of an instance that does not cover it | `out of scope`, which is not `not found`, and only one of the two is worth re-asking elsewhere (IN3). |
| An effect is requested with three sites attached | The effect carries its instance and the approval statement shows which building (IN5). |
| The person is demonstrably in the camper van | Pico proposes that instance. It still does not select it, because a derived location never reaches `known` (IN5). |
| Someone adds a precedence order to settle conflicts | There is none to add. IN4 has no configured winner, by construction rather than by default. |
| Attachments accumulate without bound | Refused at the ceiling. The list is open, so the limit is enforced rather than discovered (IN1). |

## Consequences

Positive:

- the plural case is decided before it is built, so the defaults that are
  expensive to change later - conflict, silence, effect targeting - are
  chosen while nothing depends on them;
- separate instances make ADR 0136's Private Space rule workable instead
  of onerous, because a person has usually already split their material;
- an effect that names its building is auditable in the ADR 0106 statement
  a person actually reads, rather than in a log they do not.

Negative and residual:

- declared coverage is a person's or an author's claim, and nothing
  verifies it. An instance that claims to cover the Adriatic and does not
  produces `out of scope` where it should produce an answer;
- reporting disagreement rather than resolving it pushes the judgement to
  the person every time, which is right and is also friction they did not
  have before;
- an open identifier list means guards cannot be proved by enumeration,
  and the attachment record becomes a place that has to be got right
  rather than a list that can be read;
- refusing inference for effect targeting will feel wrong in the common
  case, where the guess would have been correct, and the value only shows
  in the rare one.

## Relationship to other ADRs

- Splits from ADR `0136`, which keeps the slot contract, the two supplier
  kinds and the process boundary. Neither is complete without the other,
  and ADR 0136 carries the pointer.
- Applies ADR `0135`'s rule to itself: this exists because one document
  had stopped being readable.
- Extends ADR `0118` O2's vocabulary with `out of scope` and keeps its
  no-join-across-classes rule.
- Depends on ADR `0129` for certainty: conflicts lower it, and no
  derivation reaches `known`, which is what forbids inferred effect
  targeting.
- Binds ADR `0106`: the instance is rendered in the approval statement
  from the same validated fields the signature covers.
- Binds ADR `0128` H3: a declared effect carries its instance.
- Attaches into ADR `0075` privacy domains.
- Contrasts deliberately with ADR `0127`'s closed module list.

## References

- [ADR 0075](0075-foundation-local-authentication-session-and-membership-threat-model-and-scoping.md)
- [ADR 0106](0106-approval-rendering-from-the-signed-bytes.md)
- [ADR 0118](0118-offline-and-model-free-degradation-contract.md)
- [ADR 0119](0119-resource-exhaustion-and-denial-of-service-posture.md)
- [ADR 0127](0127-pico-modules-mandatory-delivery-independent-code-declared-dependencies.md)
- [ADR 0128](0128-home-assistant-is-a-host-not-a-frame-and-the-effect-bearing-module.md)
- [ADR 0129](0129-spatial-recall-observations-are-not-memories-and-uncertainty-is-not-origin.md)
- [ADR 0135](0135-a-specification-a-consumer-cannot-read-is-not-a-specification.md)
- [ADR 0136](0136-pico-bridges-and-libraries-the-slot-is-the-contract.md)
</content>
