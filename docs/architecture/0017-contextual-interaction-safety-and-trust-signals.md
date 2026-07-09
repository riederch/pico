# 0017 - Contextual Interaction Safety and Trust Signals

## Status

Accepted as a concept and safety constraint.

## Context

Pico may eventually know its user extremely well. This creates a useful possibility: Pico could help its user assess whether a person-to-person interaction appears safe, risky, manipulative, dishonest, exploitative, or inappropriate.

This is especially relevant when two or more people each have a Pico instance and those Picos can exchange limited signals.

Examples:

- an adult asks another adult for help, money, access, transport, or cooperation
- a child asks an adult for directions
- a child interacts with another child
- a person wants to lend tools, keys, devices, or money
- someone asks for secrecy, urgency, isolation, private data, or access
- a user wants to know whether a concrete next step is sensible

However, this area is dangerous.

A Pico must not become a reputation system, a social ranking system, or a tool for creating false impressions about people.

The main risks are:

- unintentional false assessment by a user's own Pico
- intentional manipulation of a Pico by its owner
- reputation laundering through positive self-presentation
- Rufmord or false negative trust signals
- over-trusting a remote Pico
- global person scoring
- hidden profiling
- safety boundaries being overridden by reputation

## Decision

Pico may help users reason about the safety of concrete person-to-person interactions.

Pico must evaluate actions in context rather than assigning global human scores.

Trust signals may inform a decision, but they must never override hard safety boundaries, especially in interactions involving minors, dependency, isolation, money, physical access, digital access, transport, private spaces, secrecy, or urgency.

## Core design rule

> Pico must never transform self-presentation into trust.

A remote Pico cannot prove that its owner is trustworthy. It can only provide limited claims, commitments, attestations, or evidence references. The receiving Pico must decide locally, conservatively, and in context.

## No global human score

Pico must not store or exchange a global score such as:

```text
Person A = +120
Person B = -80
```

Pico may store contextual signals such as:

```text
Person A has a positive directly observed signal for returning borrowed tools.
Person B has an unresolved warning signal for repeated boundary violations in shared work contexts.
```

The output should be action-oriented:

```text
This specific interaction is acceptable under these limits.
This specific interaction needs caution.
This specific interaction should be blocked or escalated.
```

Not person-essentialist:

```text
This person is safe.
This person is bad.
This person is trustworthy.
```

## Local decision authority

The receiving Pico is always the decision maker for its user.

```text
Remote Pico = source
Local Pico = evaluator and decision assistant
```

A remote Pico may provide:

- identity claims
- interaction commitments
- voluntary trust signals
- evidence references
- context declarations
- signed statements

The local Pico must evaluate:

- source class
- evidence class
- relevance to the current action
- age of the signal
- confidence
- dispute status
- possible manipulation
- applicable hard safety boundaries
- safer alternatives

## Evidence classes

Trust signals must carry evidence class and uncertainty.

| Evidence class | Example | Default trust posture |
|---|---|---|
| `self_claimed` | user or user's Pico says something about the user | weak |
| `remote_pico_self_claim` | another Pico presents a claim about its owner | weak |
| `local_observation` | local Pico observed behavior directly | medium, local only |
| `peer_attested` | another person or Pico attests behavior | medium, source-dependent |
| `multi_peer_attested` | several independent sources attest similar behavior | stronger, still contextual |
| `institution_verified` | organisation confirms role or membership | stronger for that role only |
| `document_verified` | document or record supports a claim | stronger, but may be forged or outdated |
| `guardian_context` | guardian or care context defines boundaries | strong for child/care interactions |
| `formal_record` | formal decision, adjudication, or record | strong, but not globally decisive |
| `disputed` | contested or unresolved claim | must be shown as disputed |

A positive signal can reduce uncertainty only within its context. It must not grant broad trust.

A severe negative signal may trigger stronger protective behavior, but must still preserve dispute handling and avoid unsupported defamation.

## Current protocol naming caveat

The current TypeScript protocol package contains a reserved planning type named `ContextSignalLevel` and a deprecated alias named `TrustedLevel`.

That type currently includes the legacy value `admin`. This value must not be treated as a role, permission, capability, host-administration grant, Home membership credential, Pico Rules decision or Action Runner authorization.

Context signals are evidence hints for local evaluation only. Roles, capabilities, membership and authorization must be modeled separately before this area becomes writable or security-relevant.

## Interaction classes

Pico should reason about concrete interaction classes, for example:

| Interaction class | Examples |
|---|---|
| `wayfinding_help` | asking for directions |
| `public_information_exchange` | brief factual question |
| `shared_task` | working together on a task |
| `money_or_trade` | lending, buying, selling, sending money |
| `physical_access` | keys, home access, private property |
| `digital_access` | passwords, admin rights, tokens, smart-home access |
| `transport` | entering a vehicle, being picked up, driving together |
| `private_space` | home, workshop, isolated place |
| `child_interaction` | at least one minor involved |
| `care_or_guardianship` | care, supervision, vulnerable person |
| `authority_or_dependency` | boss, teacher, leader, helper, emergency role |
| `romantic_or_intimate` | dating, intimacy, relationship context |
| `conflict_or_dispute` | argument, separation, claim, accusation |
| `emergency_context` | accident, rescue, medical or fire context |

The same person can be low risk in one interaction class and high risk in another.

## Role combinations

The model must support more than adult-child interactions.

Examples:

| Role combination | Special risks |
|---|---|
| Adult - Adult | fraud, pressure, money, access, dependency, private spaces |
| Adult - Child | authority, secrecy, isolation, transport, grooming-like patterns |
| Child - Child | bullying, peer pressure, dares, privacy, group dynamics |
| Youth - Adult | authority gradient, dependency, consent ambiguity |
| Leader - subordinate | pressure, non-free consent, retaliation |
| Helper - vulnerable person | dependency, urgency, trust misuse |
| Emergency role - citizen | stress, authority, situational pressure |
| Admin - user | digital control and access misuse |

## Hard safety boundaries

Some actions remain high-risk regardless of reputation.

Positive trust signals must not automatically permit:

- asking a child to keep secrets from guardians
- asking a child to follow an unknown adult
- entering a vehicle with an unknown or untrusted person
- moving to an isolated or private place
- sharing passwords, tokens, passkeys, recovery codes, or admin access
- giving physical keys or long-term access without safeguards
- sending money under urgency or pressure
- sharing private, intimate, or identifying information
- bypassing guardianship or care boundaries
- acting under threats, coercion, or severe time pressure

For these cases Pico should block, escalate, require confirmation, suggest safer alternatives, or contact an appropriate trusted person depending on the user's age, role, and autonomy.

## Interaction commitments

A remote Pico should not claim that its owner is safe.

It may make narrow, context-specific commitments such as:

```json
{
  "claimType": "interaction_commitment",
  "context": "wayfinding_help",
  "claims": [
    "will_not_request_private_data",
    "will_not_request_following",
    "will_stay_in_public_interaction"
  ],
  "evidenceClass": "remote_pico_self_claim",
  "confidence": "low"
}
```

The local Pico may use this as a weak signal. If behavior contradicts the commitment, the local Pico should escalate.

## Example: child asks unknown adult for directions

The adult's Pico may present a commitment to provide only public wayfinding assistance.

The child's Pico must not conclude:

```text
This adult is safe.
```

It may conclude:

```text
A short public wayfinding question is acceptable under safety rules. Do not follow the person. Do not enter a vehicle. Do not share private data. Verify the answer with the map or contact a trusted adult if unsure.
```

## Example: adult lends a tool to another adult

Positive relevant signals may include:

- returned borrowed items before
- direct local observation
- trusted peer attestation
- clear agreed return time

Pico may recommend:

```text
The loan is acceptable with documentation: take a photo, note the return time, and avoid lending irreplaceable tools without stronger history.
```

## Example: adult bypasses a guardian boundary with a child

If an adult takes a child for ice cream despite a guardian rule and asks the child to keep it secret, Pico should treat the ice cream as low harm but the secrecy and boundary bypass as the relevant concern.

Classification:

```text
low material harm
minor guardian-boundary violation
secrecy-against-guardian warning signal
adult-child power imbalance
repair possible through transparency
```

This should not label the adult globally as unsafe. It should record or explain a contextual warning pattern if repeated.

## Example: provocative trolling followed by clarification

A user may provoke others for reaction and later clarify that it was not meant seriously.

Pico should not reduce this to:

```text
manipulative = true
```

It should classify the pattern contextually:

```text
provocative humor or trolling
usually later discloses intent
low to medium caution
higher risk in conflict, hierarchy, child, care, or sensitive emotional contexts
```

## Abuse resistance

Pico must resist two opposite misuse modes:

1. reputation laundering through false positive self-presentation
2. false negative reputation attacks against others

Therefore:

- self-claims are weak evidence
- remote Pico claims are weak unless independently supported
- negative claims must carry evidence class and dispute status
- high-impact negative signals should not be widely shared by default
- trust exchanges should be limited, contextual, and private by default
- local Picos should avoid publishing global reputation assertions
- the subject of a trust signal should have correction or dispute mechanisms where feasible

## No hidden profiling

Pico must not create exportable hidden human rankings.

Private local notes that help the owner make safe decisions are different from public reputation claims.

The default should be:

```text
private, local, contextual, minimal, evidence-labelled
```

not:

```text
global, public, permanent, score-based, reputation-like
```

## Output language

Pico should avoid statements such as:

- this person is safe
- this person has no bad intentions
- this person is trustworthy
- this person is bad

Pico should prefer:

- no relevant warning signals are known for this narrow interaction
- the evidence is weak, local, or disputed
- this action is acceptable only under these boundaries
- this action remains high risk regardless of reputation
- choose a safer alternative
- ask a trusted person or guardian

## Open questions

Open questions before implementation:

- Which trust signals may be exchanged between Picos at all?
- How can false negative claims and Rufmord be prevented or mitigated?
- How long do contextual trust signals remain relevant?
- How are disputed signals represented, hidden, or shown?
- Which hard safety boundaries are universal and which are policy-configurable?
- How does the model handle cultural differences, family norms, and local customs without weakening safety?
- Can there be independently verifiable positive attestations without creating a reputation economy?
- How can a subject inspect, correct, or contest signals without exposing private local notes of another user?

## Consequences

Positive:

- supports harm prevention without creating a global score
- keeps decision authority local
- prevents remote Picos from acting as trust oracles
- handles adult-adult, adult-child, and child-child contexts
- preserves a path toward safety assistance while resisting manipulation

Negative:

- more complex than a score
- harder to explain in short UI
- requires careful evidence modelling
- can still be wrong or incomplete
- cannot guarantee intent or safety
- must be very conservative in high-risk contexts

## Design rule

Evaluate the action, not the human as a whole. Evaluate the context, not the reputation. Use trust signals as evidence-labelled hints, never as a free pass.
