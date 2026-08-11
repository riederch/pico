# 0146 - An Outside Agent Is a Requester, and Answering It Is Disclosure

## Status

**Draft sketch, 2026-08-11. Nothing here is accepted and nothing is built.**
AG1-AG6 are proposed gate shapes rather than decided ones, and the sketch
exists to be argued with. No status matrix row, no `.agent-context.md` entry,
no ADR 0128 status note on anything it touches - those follow acceptance, not
drafting.

Written from a user question: given paid Claude and ChatGPT subscriptions, can
Pico sit between them so that the memory stays with Pico. The proxy half of
that question is answered under "Rejected alternatives" and is not what this
ADR is about. What survives the question is a shape nothing in the tree
decides: **a planner that runs outside Pico's process, holds its own context,
and reaches into Pico when it judges that it should.**

ADR 0144 named this and put it out of scope in one line - "Pico exposing
MCP-compatible tools, which ADR 0036 sketches for Pico Home. That is a
surface rather than a supplier, it is governed by ADR 0030's local trust
boundary, and nothing here decides it." This is that remainder.

**This surface is optional in the strongest sense.** ADR 0142 gives Pico its
own model provider, and a Pico with a planner does not need a foreign one.
This ADR describes what is true *if* somebody attaches an outside agent
anyway, which people will, because the agent they already pay for is better at
agentic work than anything this tree will ship for years.

## Context

**Every supplier ADR points outward, and this one points inward.** ADR 0136
BR2 puts foreign code in its own process and has it answer when the core asks.
ADR 0144 MC3 declines `sampling`, `elicitation` and `roots` at `initialize`
with a structural reason rather than a policy one: "no family points inward -
there is no notify, push or subscribe, so a supplier has no way to start
anything."

An outside agent is that missing inbound direction, arriving through a
different door. It is not a supplier - it fills no ADR 0136 BR1 slot, it
carries nothing, and it is not attached. It is a party that initiates.

**ADR 0139 already decided how to treat it, and did so before it existed.**
"The action path has requesters, not callers. A person at a surface, a
schedule, a module, and later a planner are all requesters, and none of them
is trusted." The ADR states outright that a planner arriving later changes
nothing about the contract. That is the load-bearing prior, and most of this
sketch is applying it rather than extending it.

**What ADR 0139 could not anticipate is that the planner would be somebody
else's.** Its "later a planner" is Pico's planner under ADR 0117 - a role with
a context Pico assembles, a schema Pico wrote, and a quarantine boundary Pico
enforces. An outside agent has none of those. It is a planner in behaviour and
a stranger in standing.

**The subscription framing is worth recording because it is where the question
came from and because it is wrong in an instructive way.** The line between
what a consumer subscription permits and what it does not is not automation -
Claude Code runs agentic loops against a subscription, which is Anthropic's
own product doing exactly that. The line is the official client. That matters
here because it means the legitimate route is not a proxy underneath the
subscription but a tool surface the official client calls, which is this ADR,
and Pico is on the far side of it rather than in the middle.

## Scope

Covers: what an outside agent is in the action path; what Pico may hand it;
what it may hand back; where the surface may listen; and what the arrangement
cannot deliver.

Does not cover:

- Pico's own model provider and its registry entry (ADR 0142), which is the
  other answer to the same wish and the one that keeps Pico the planner;
- what a supplier is and where its code runs (ADR 0136), which an outside
  agent is not;
- MCP as a bridge's transport (ADR 0144). This surface may well speak MCP,
  but MCP is not what it is;
- the decision layer (ADR 0140) and the runner (ADR 0141), which this ADR
  consumes unchanged;
- the memory content read seam (ADR 0077), which AG2 must be built **on**
  rather than beside. Whether the seam as it stands already carries the
  per-domain readership this needs is unverified in this draft and is the
  first thing to check before acceptance;
- remote reachability mechanics (ADR 0038/0039/0041), which AG4 defers rather
  than decides.

## Decision

### An outside agent is a requester with no presence

It enters the action path through ADR 0139's contract, unchanged. It names a
declared effect or it is refused at the request contract (AC1). Its arguments
carry controller-computed origin classes and it has no field in which to claim
one (AC2). Being clever, expensive or well-known buys it nothing, for the same
reason Pico's own scheduler gets no exemption.

**What is new is the absence.** A person at the Companion is present under
ADR 0126; an outside agent is not, and cannot become so by asserting it. So a
request that decides to `require_approval` under ADR 0140 parks, exactly as
AC6 already parks one today, and it stays parked until a person is actually
at a surface. An outside agent therefore cannot cause an approved effect on
its own - not because a rule forbids it, but because the thing that would
answer the question is a human being who is not there.

This is the property worth protecting when someone later proposes a "trusted
agent" flag. That flag is a presence claim from a party with no presence.

### Reading Pico's memory is disclosure, and it is decided per domain in advance

A memory item handed to an outside agent leaves the machine and lands in a
third party's context. That it left because somebody outside asked, rather
than because a supplier was called, changes nothing about where it went.

So it is an ADR 0138 CO3/CO4 decision in substance: a separate, prior,
person-level decision about reaching outside, made per privacy domain, off
until somebody says so. The direction is inverted from CO3's usual reading -
there the core reaches out to a supplier, here the core answers a party that
reached in - and the sketch's claim is that the inversion does not matter,
because the disclosure is identical.

**ADR 0048's rule is the one that bites hardest.** Its boundary is that only
the live turn leaves. An outside agent's whole value is that it decides what
to pull and when, which means retrieved memory leaves on the agent's judgement
rather than on Pico's. Either ADR 0048's boundary is extended by a deliberate
user decision, or this surface hands over nothing but what the current turn
already named - and the second option is a much smaller product than the
question imagined.

### Writing into Pico is quarantine, so today it is nothing

Anything an outside agent produces is model-authored content from beyond a
threshold Pico owns. ADR 0116 W2 labels it `external_content` on arrival and
ADR 0117 keeps it from the planner. Turning it into a memory item is precisely
ADR 0117 X4's quarantined read job.

**X4 does not exist.** So the first version of this surface is read-only, and
that is a structural statement rather than a cautious one: there is no
mechanism by which a write could be admitted, and building one here would be
building X4 in the wrong place, for the least trustworthy caller available.

### The surface is local, and remote is a different ADR

Two shapes, and they are not the same shape at two addresses.

**Local.** A loopback or stdio surface reached by a client on the same
machine - Claude Code, Claude Desktop - is ADR 0030's local trust boundary,
where a surface already exists and the threat model is written.

**Remote.** A surface reachable by a hosted product is ingress: ADR 0038's
boundary, ADR 0039's ticket, ADR 0041's access modes, ADR 0075/0076's session
and membership. It is a second door onto the core for a party that is not a
Pico, and it is out of scope here rather than permitted by omission.

The practical consequence is that the subscription that pays for a local
agent is the cheap case and the one that pays for a hosted agent is the
expensive one, which is the opposite of how the question was asked.

### What is exposed is declared, and the list is closed

The surface exposes named, versioned operations that Pico's own code declares
- not a query interface over the memory store, and not a search that spans
domains. ADR 0144 MC2 refuses the mirror image of this for a bridge (the
manifest is the tool set, a server's list widens nothing), and the same
reasoning holds pointing the other way: a surface whose reach is configuration
rather than declaration has moved the decision out of the place a person can
see it.

### An outside agent is not a model provider

It cannot hold an ADR 0142 registry entry. There is no measured capacity to
state (PE2), no digest to pin (PE6), and - decisively - a provider executes a
job it was handed, while an outside agent decides for itself what to do. ADR
0049's registry describes things Pico delegates *to*. This is a thing that
delegates *to Pico*.

Naming this matters because the two will be confused: both are "an external
model that Pico talks to", and only one of them leaves Pico in charge.

### The names

No new term for ADR 0026, provisionally. "Outside agent" is descriptive prose
in this draft and should stay that way unless the surface is built, on the
same reasoning ADR 0144 used for `mcp-bridge`. The leak test: the moment a
document reads "the agent decides what Pico remembers", the word has moved
into the architecture.

## Rejected alternatives

### Proxy the subscriptions

The question as asked. It fails three times over, and the order matters
because only the third is about Pico.

Consumer subscriptions carry no API access, so there is no interface to sit
in front of - the official clients speak an undocumented internal protocol to
their own hosts. Intercepting it means terminating TLS with an injected root
certificate and maintaining a parser against a moving wire format, which is a
workaround in the precise sense: the symptom routed around, the cause
untouched.

And even granting all of that, the result is wrong. A proxy yields an
observed chat stream. ADR 0049 needs a job envelope - a structured request, a
structured result, provenance. A transcript is not one, and no amount of
parsing makes it into one.

### Anthropic or Mistral Cloud as a provider entry, instead of this surface

**Not an alternative to this ADR, and the better answer to the user's actual
wish.** It is a different question with an existing home: ADR 0048 already
lists a mediated cloud connector as its fifth provider class, and ADR 0142
PE1-PE6 is the entry contract. It needs no new ADR, and this sketch should not
absorb it.

It is listed here because it *reduces* the case for this surface almost to
nothing. A Pico with its own provider is the planner, assembles its own
context under ADR 0116 W3, keeps the ADR 0117 split intact, and reaches a
model that never decides anything. Everything this ADR spends gates
containing, that arrangement simply does not have.

What remains for this surface afterwards is narrow and real: an outside agent
is better at long agentic work than a single delegated job, and a person who
already runs one will point it at Pico whether or not this ADR exists. The
choice is a decided surface or an undecided one.

### Let the outside agent be Pico's planner

The shape that would make the subscription feel like it replaced ADR 0142. It
dissolves ADR 0117: a planner is defined by receiving a context Pico
assembled and never receiving foreign content, and an outside agent's context
is its own, assembled from its own history, with prose from anywhere in it.
It would also make ADR 0116 W3's assembly rule unobservable, since the
assembly happens somewhere Pico cannot see.

### Answer server-initiated requests, so the agent can ask Pico's model or ask the person

ADR 0144 MC3 refused this for a supplier and the refusal transfers whole. An
outside agent obtaining inference through Pico is ADR 0117's quarantine
bypassed from the outside; an outside agent composing a question for a person
takes over what ADR 0141 RN3/RN4 owns. That the party is a well-known product
rather than a vendored depot changes nothing - MC3's reason was that there is
no authority by which the answer could have come from Pico, and there still
is not.

### One generic memory surface, pointed at whatever the agent wants

ADR 0144's generic-MCP-bridge refusal, mirrored. It turns the disclosure set
into configuration, which means no commit and no consent moment states what
may leave. AG2's per-domain decision would be a decision about a surface
rather than about data.

## Gates

- **AG1 - An outside agent is a requester with no presence (open):** it
  enters through ADR 0139's contract with no new path and no exemption;
  presence is never claimable by a requester, so a `require_approval`
  decision parks under AC6's existing posture and no flag, header or
  configuration value can stand in for a person at a surface.
- **AG2 - Disclosure is decided per domain, in advance, and defaults to
  none (open):** handing a memory item to an outside agent is an ADR 0138
  CO3/CO4 decision, off until a person makes it, recorded per privacy domain,
  and built on ADR 0077's read seam rather than beside it. Whether ADR 0048's
  "only the live turn leaves" is extended for this case is a user decision,
  named below.
- **AG3 - The surface is read-only until ADR 0117 X4 exists (open):**
  content an outside agent produces is `external_content` at the threshold
  (ADR 0116 W2) and has no admission path. The gate is the absence of a write
  operation, in ADR 0117 X1's construction where the guard is a missing
  field.
- **AG4 - Local only; remote is undecided rather than permitted (open):**
  loopback and stdio under ADR 0030. A network-reachable surface is ADR
  0038/0039/0041 plus ADR 0075/0076 and is refused here by not existing.
- **AG5 - What is exposed is declared and closed (open):** named versioned
  operations declared in Pico's own code, never a query interface over the
  store and never a cross-domain search; ADR 0144 MC2's reasoning pointed the
  other way.
- **AG6 - An outside agent cannot hold a provider entry (open):**
  `ADR 0142`'s registry refuses it - no measured capacity, no pinned digest -
  and the refusal names the direction rather than the missing fields, because
  the fields could be faked and the direction cannot.

## Failure ledger

| Situation | Posture |
|---|---|
| An outside agent requests an undeclared effect | Refused at the request contract, before any decision (AG1, ADR 0139 AC1). |
| An outside agent requests a `require_approval` effect | Parked. There is no person present to answer, and nothing it can send makes one appear (AG1, ADR 0126). |
| An outside agent asks for a memory item in a domain nobody opened | Nothing is returned. Disclosure is off until decided, per domain (AG2). |
| An outside agent asks Pico to remember something | There is no operation for it. X4 does not exist (AG3). |
| A hosted product wants to reach the surface | Out of scope. That is ingress, and this ADR decides no door (AG4). |
| An outside agent asks Pico's model to generate something | Declined, on ADR 0144 MC3's reasoning transferred: quarantine bypassed from outside. |
| An outside agent asks Pico to put a question to the person | Declined. Who asks and with which words is ADR 0141 RN3/RN4's. |
| An outside agent claims a trust level or a presence | No field carries it; a claimed one is refused rather than ignored (AG1, ADR 0139 AC2's posture). |
| An outside agent silently stops calling Pico | Nothing detects it and nothing should. It is not attached, so there is no coverage claim to fail (contrast ADR 0137 IN2). |
| Someone points the surface at a second agent | Both are requesters. Neither is attached and neither accumulates standing. |

## Consequences

Positive:

- the inbound direction that four ADRs refuse structurally gets one named
  door instead of being absent until somebody improvises it;
- ADR 0139's "later a planner" claim is tested against a planner it did not
  imagine, and holds - which is evidence for the contract rather than a
  change to it;
- a person who already pays for an agent gets Pico as its memory without
  Pico's boundaries moving;
- ADR 0144's out-of-scope line stops pointing at nothing.

Negative and residual:

- **the arrangement does not deliver what the question wanted.** Storage stays
  with Pico; the retrieval decision does not. An agent that does not ask has
  no memory, and it will not ask on most turns. Pico becomes a memory a
  stranger consults occasionally, not a memory that is present;
- read-only makes it half a loop. What the agent learns in a session dies
  there, and the fix is ADR 0117 X4, which is unbuilt and is not this ADR's
  to build;
- AG2 pushes ADR 0048's boundary into the open. Either retrieved memory may
  leave on a foreign party's judgement or it may not, and both answers are
  expensive;
- the surface competes for design attention with ADR 0142, which is the path
  that keeps Pico the planner. If only one gets built, this should not be it;
- nothing here constrains what the third party does with what it received.
  Retention, training use and subprocessors are their terms, not Pico's, and
  a disclosure decision under AG2 is a decision to accept them.

## Questions this sketch does not decide

**Does retrieved memory leave, or only the live turn?** ADR 0048's boundary
was written for jobs Pico dispatches. An outside agent inverts who chooses,
and the answer decides whether this surface is useful or ceremonial. **A
boundary decision, and the user's.**

**Is this a Pico Home surface or a Companion surface?** ADR 0036 sketched the
tool-hosting role for Pico Home. The local case argues for the Companion,
where presence already lives. Undecided, and it changes AG4's shape.

## Relationship to other ADRs

- Takes up the surface ADR `0144` scoped out and ADR `0036` sketched, and
  claims none of ADR 0036's connector-registry machinery.
- Applies ADR `0139` unchanged and is an argument that its requester contract
  was right, rather than an extension of it.
- Applies ADR `0138` CO3/CO4 in the inbound direction and claims the
  inversion is immaterial.
- Bounded by ADR `0116` W2 and ADR `0117` for what arrives, and blocked by
  X4's absence for what could be kept.
- Bounded by ADR `0126` for presence, which is the whole of AG1's second half.
- Stands beside ADR `0142` rather than against it, and says which one should
  be built first.
- Defers to ADR `0030` for the local boundary and to ADR `0038`/`0039`/`0041`
  for the remote one it does not open.
- Must be built on ADR `0077`'s read seam; whether that seam already carries
  what AG2 needs is unverified here.
- Adds no term to ADR `0026`, provisionally.

## References

- [ADR 0026](0026-product-terminology-and-naming.md)
- [ADR 0030](0030-foundation-api-exposure-and-local-trust-boundary.md)
- [ADR 0036](0036-capabilities-connectors-and-mcp-boundary.md)
- [ADR 0038](0038-foundation-local-access-hardening-and-ingress-boundary.md)
- [ADR 0039](0039-foundation-websocket-ticket-boundary.md)
- [ADR 0041](0041-foundation-access-modes-and-direct-port-gate.md)
- [ADR 0048](0048-model-capability-delegation-and-remote-inference-boundary.md)
- [ADR 0049](0049-model-provider-registry-and-job-envelope.md)
- [ADR 0077](0077-foundation-memory-content-read-api-and-domain-readership-seam.md)
- [ADR 0116](0116-untrusted-content-and-self-replicating-prompt-threat-model-and-hardening-gates.md)
- [ADR 0117](0117-planner-reader-split-and-origin-aware-data-flow-policy.md)
- [ADR 0126](0126-one-identity-many-presences.md)
- [ADR 0136](0136-pico-bridges-and-libraries-the-slot-is-the-contract.md)
- [ADR 0137](0137-suppliers-are-instances-coverage-decides-whether-they-add-up.md)
- [ADR 0138](0138-reaching-outside-costs-something-and-is-off-until-someone-says-so.md)
- [ADR 0139](0139-every-action-is-requested-by-someone-pico-does-not-trust.md)
- [ADR 0140](0140-pico-rules-decide-from-a-closed-input-and-are-not-themselves-an-action.md)
- [ADR 0141](0141-the-runner-executes-what-was-decided-and-history-is-a-view.md)
- [ADR 0142](0142-a-provider-entry-states-what-one-host-was-measured-to-do.md)
- [ADR 0144](0144-mcp-is-a-bridges-transport-and-a-tool-list-is-not-a-catalog.md)
