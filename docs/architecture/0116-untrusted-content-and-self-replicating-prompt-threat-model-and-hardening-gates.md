# 0116 - Untrusted Content and Self-Replicating Prompt Threat Model and Hardening Gates

## Status

Accepted as a security constraint, partially implemented. Opened by the
user on 2026-08-01 as the security initiative against prompt-injection
worms of the Morris II class. W1 and W2 are implemented: content that can
reach a model context now carries a server-assigned class from intake
through storage, derivation and every read. W3's assembly contract is
implemented and counter-proven, but nothing calls it yet - there is still
no model runtime, so W3 is the precondition of the milestone that builds
the first consumer rather than a defense already standing. W4-W6 are open
and bind the milestones that would otherwise close the replication cycle.
This ADR claims containment, never model immunity: it decides where
injected content is stopped, not that injection will not happen.

## Context

In 2024, researchers demonstrated "Morris II": a self-replicating
adversarial prompt against GenAI-powered assistants. The worm is plain
content. It arrives through a normal channel - a message, a mail, a
document - reaches a model context directly or through
retrieval-augmented memory, and persuades the model to do two things:
perform a payload (exfiltrate, spam, mislead) and reproduce the
triggering content into the assistant's own output, from where it is
stored, forwarded and processed by the next assistant. No code executes.
The model is the interpreter, and every assistant that reads content and
can write content is a potential host.

The replication cycle has four segments: untrusted content enters;
content reaches a model context; model output is written to memory or
sent outward; that write reaches the next context. Break any segment and
the worm dies. Rely on the model's obedience and it does not.

Pico today cannot host this worm - not because of a defense, but because
of the build state: no model call, no prompt assembly, no retrieval and
no tool executor exist anywhere in the repository, so the cycle's middle
segments are missing. Every roadmap step toward the companion closes one
segment - the companion model and memory retrieval (ADR 0012), free-text
inter-Pico operations (ADR 0002, ADR 0025), connectors (ADR 0036), Home
Assistant tools (ADR 0019). This ADR exists so each of those steps meets
a decided boundary instead of an afterthought: prompt injection appears
in exactly three prior ADRs (0049, 0050, 0058), each time as an
explicitly deferred non-goal, and no ADR owns the worm threat.

Three current facts sharpen it:

- `message.created` accepts a client-asserted `system` or `tool` role
  through `POST /api/events` under the static-token diagnostic ceiling
  (`messageCreatedRoles` in `packages/protocol/src/index.ts`). Nothing
  distinguishes such a row from a real system statement. Today nothing
  reads the log into a model, so nothing is exploitable - but a
  companion that replays the log as chat history would inherit a
  ready-made system-prompt injection primitive.
- The memory write-read loop physically exists (`memory.recorded` in,
  `GET /api/memory/domains/:privacyDomain/items` out) and the store is
  content-agnostic: no field records where content came from.
  Reader-custody sync (ADRs 0089-0096) projects remote-authored items
  with thorough cryptographic authenticity - and no semantic trust label
  at all. Authenticity says who wrote it, never whether it may instruct.
- The reserved-vocabulary gate already refuses client-written
  `action.*`, `approval.*` and `pico_rules.*` events, and the Vault hold
  channel (ADR 0099, ADR 0106) already enforces one-approval-one-
  signature over statements rendered from the canonical bytes. The
  strongest machinery this threat needs partially exists - for
  signatures.

## Scope

Covers: the threat model for content reaching a future model context;
server-assigned origin labeling of such content; the data/instruction
separation rule for context assembly; the two replication-breaking write
boundaries (persistence and egress); the approval semantics injected
tool calls must face; and the blockers bound to the first free-text
inter-Pico operation.

Does not cover:

- model-delegation runtime surfaces - ADRs 0048-0061 own registry, job,
  context-reference and result-envelope semantics; this ADR only binds
  what may enter a context and what its output may cause;
- Relay abuse handling, metadata privacy and routing identities, which
  ADR 0031 keeps blocked before production;
- Home Assistant entity and service allow-lists (ADR 0019);
- any claim that a model, filter or classifier resists injection -
  filters may run as defense-in-depth here, never as the boundary.

## Decision

### The model is an interpreter of untrusted input, and its output inherits that

Any model output produced from a context that contained untrusted
content is itself untrusted content. A model that was persuaded is
indistinguishable from a model that reasoned, so defenses sit at the
boundaries the model cannot cross - what enters a context as
instruction, what persists as memory, what leaves as an outbound action
- and never in the model's expected obedience. No Pico surface may treat
"the model will refuse" as a control.

### Origin is assigned by the server and sticks to the content

Every unit of content that can later reach a model context carries an
origin class, assigned at intake by the code that authenticated the
writer and never assertable by the writer. The classes are a closed
vocabulary:

- `person_present` - the authenticated person, through their own session
  or an approved ceremony surface;
- `own_pico` - server-synthesized records and this Pico's own model
  output;
- `home_member` - an authenticated member of this Home who is not the
  subject person;
- `remote_pico` - a verified remote Pico, carrying its ADR 0002
  relationship tier;
- `external_content` - anything a connector fetched: web, mail,
  calendar, documents, third-party transcripts;
- `unattributed` - everything else, including the static-token
  diagnostic path.

Derivation never upgrades origin: a summary, extraction, embedding or
model restatement inherits the lowest class among its sources. This one
rule kills memory laundering - the Morris II step where hostile content
becomes "my own memory" by being stored and re-read. The reserved
`ContextSignalLevel` planning type stays what ADR 0017 says it is,
non-authoritative evidence vocabulary; the origin classes here are
authorization-relevant provenance, which is exactly what that type must
not be.

### Only the person and Pico's own policy may instruct

Context assembly, when it exists, is structural: instructions and data
are separate layers. Everything below the instruction threshold -
every class except `person_present` and Pico's own policy and system
material - enters a context only as delimited, origin-labeled quoted
data, never concatenated into the instruction stream. A remote Pico's
message, a fetched mail, a synced memory item are things Pico reads,
not voices Pico obeys. Filters that hunt injected phrasing may run
above this as defense-in-depth; the layer separation is the boundary,
because filters are heuristic and structure is not.

### Roles are earned at the write path, not asserted in the payload

`system` and `tool` leave the client-writable `message.created` roles
and become reserved exactly like the action vocabulary: refused on
`POST /api/events` until a dedicated write path exists whose authority
actually is the system or a completed tool run. `user` and `assistant`
stay writable for foundation diagnostics, but a row written under the
static token is durably `unattributed` - the role says where a row would
sit in a conversation; the origin says whether it may be believed, and
a companion needs both to check out before replaying anything as
history.

### The cycle is broken at both writes

Persistence: model output derived from below-threshold content never
persists as memory automatically. It persists only through an explicit
write that carries the derived origin, and no memory write may upgrade
origin. Egress: no outbound message, connector call or Link operation
whose content derives from a below-threshold context leaves without a
Pico Rules decision - sending content to another person or Pico is
`external_write` at minimum (ADR 0010), and nothing auto-forwards.
Above both sits the tripwire: proposed output that reproduces a span of
recent below-threshold input is the worm's own signature and is stopped
and surfaced. The tripwire is heuristic and will miss rephrasings; it
rides on the two write boundaries, it never replaces them. Egress
itself stays fail-closed the way the codebase already is by
construction: outbound traffic exists only through declared connector
seams with audit, never as an ambient capability.

### An injected tool call faces the same wall as a forged signature

ADR 0010's `require_confirmation` is realized with the hold-channel
machinery of ADR 0099 and ADR 0106: one approval authorizes exactly one
action, bound to the digest of the canonical action-request bytes, with
the statement rendered from those bytes - never from model output and
never from a caller-supplied description. Unknown tool families are
gated by default. The model may compose the request; it cannot compose
what the person reads.

### Free-text operations wait for their controls

The Pico Link operation set stays ceremony-only until the first
free-form content operation lands in the same milestone as:
relationship-tier gating (stranger delivers basic messages only,
blocked delivers
nothing - ADR 0002), per-sender quotas and rate limits (ADR 0031's
blocked-before-production items), origin labeling at intake, and the
assembly rule above enforced wherever such content can reach a context.
A free-text operation without these is refused as a milestone, not
patched afterwards.

## Gates

- **W1 - Role reservation at the Foundation write path (open;
  implementable now):** `system` and `tool` are refused on the client
  write path like the reserved action vocabulary, and content written
  under the static token is durably `unattributed`. W1 blocks any
  companion from reading the event log as conversation history before it
  lands.
- **W2 - Origin labels in the memory store (implemented):** migration
  `0010_memory_item_origin` puts the same closed vocabulary and CHECK
  constraint on `memory_item` that W1 put on the event log, because
  retrieval reads the store and a label that stopped at the reference
  event would leave the retrieved copy unlabeled. The class is assigned
  by the code that authenticated the writer; the payload allow-list and
  the top-level refusal already make it unassertable from either level.

  W2 also settles the two authorities W1 left open, both at the lower of
  the available readings. An authenticated Pico identity is
  `home_member`, not `person_present`: the higher class would require
  proving the writer is the subject person of what they are writing, and
  the write path carries `owner` only as a free string, so a later
  milestone that can prove more may raise it deliberately. A Foundation
  operator is `unattributed`, the vocabulary's own "everything else" -
  there is no host-administration class, inventing one is an ADR change
  rather than an implementation detail, and ADR 0087 keeps host
  infrastructure separate from Home governance, so administration is
  emphatically not a voice that may instruct.

  Derivation is a real path rather than a stated rule: `createDerived`
  resolves its sources from the store and takes the lowest class among
  them, so a summary of the person's note and a fetched mail is not the
  person speaking. Sources are resolved rather than supplied, because a
  caller that could state its sources' classes could state a higher one,
  and an unlabeled source is fatal - deriving a definite class from
  unknown provenance would be the same upgrade by another route.

  The label leaves with the content on every read, including
  `PicoMemoryContentItem` over HTTP: a reader that receives text without
  its class cannot apply W3. Reader-custody item views carry
  `remote_pico` beside the writer identity, applied uniformly rather
  than raised when the writer happens to be the domain owner - these are
  signed writes, never a person typing in a live session, and a wrong
  guess in the trusting direction is the only one that costs anything.
  Aligns with ADR 0060's `inputClass` direction.
- **W3 - Structural context assembly (contract implemented; enforcement
  binds the first consumer):** `packages/protocol/src/model-context.ts`
  assembles the two layers. The descending trust order is declared
  separately from the origin vocabulary, because the vocabulary is a set
  and this is a lattice; a test asserts the two stay the same set, so a
  later edit cannot silently re-rank trust. Derivation takes the lowest
  class among its sources and refuses an empty source list rather than
  answering the floor. Only `person_present` and Pico's own policy reach
  the instruction layer - `own_pico` deliberately does not, because
  output from a context that held untrusted content is untrusted, which
  is the laundering step this gate breaks. Nothing unlabeled can be
  assembled: an absent or unknown class is a refusal, not a default, and
  the source label is a canonical ASCII token because it is rendered into
  the block header it would otherwise be able to forge.

  Escape resistance comes from prefixing, not from a marker content is
  assumed not to contain: every line of quoted data carries `> `, so no
  content can emit an unprefixed line and a forged header renders as
  quoted text. The split covers LF, CRLF, a lone CR and U+2028/U+2029 -
  JavaScript does not treat the last two as line terminators inside
  strings but several renderers do, so a break the renderer did not see
  is exactly the one that would escape downstream. Content is otherwise
  unchanged: nothing is filtered, refused or rewritten, which is what
  keeps this structural. Both guards are counter-proven - removing the
  quote prefix or the two separators fails the escape test, whose own
  splitting is deliberately more permissive than JavaScript's.

  What is not claimed: there is no model runtime, so nothing yet calls
  this. The rule that a consumer may not assemble a context any other way
  is enforced in the milestone that builds the first consumer, and W3
  stays that milestone's precondition rather than a finished defense.
  ADR 0002's relationship tiers are deliberately absent; that vocabulary
  is W6's.
- **W4 - Action approvals over the hold channel (open; binds the first
  tool executor):** ADR 0010 decisions realized with ADR 0099/0106
  semantics for tool families; unknown families gated by default.
- **W5 - Replication break (open; binds companion and connectors):** no
  auto-persist of derived output, no auto-forward, egress only through
  declared connector seams with audit, and the self-replication
  tripwire.
- **W6 - Free-text operation blockers (open; binds the first free-text
  Link operation):** relationship tiers, per-sender quotas, origin
  labeling at intake and W3 land in the same milestone as the operation.

## Threat ledger

| Attacker | Posture |
|---|---|
| Self-replicating prompt in a future inbound message | Enters labeled `remote_pico` or `external_content`, sits below the instruction threshold and is quoted data in any context (W3). Its payload needs an outbound write - gated by Pico Rules and the hold channel (W4, W5). Its replication needs persistence or forwarding - both are explicit writes that keep the derived origin (W2, W5). Residual: the person can be talked into approving; the ADR 0106 rendering is the mitigation, not a cure. |
| Malicious or compromised remote Pico, fully authenticated | Authentication is not instruction authority. Its content carries its relationship tier and stays data in every context; a partner-tier Pico may say more, never command more. Quotas and tiers (W6) bound volume before content is even read. |
| Poisoned web, mail or document content through a connector | `external_content`; the connector returns materialized excerpts under ADR 0060's posture, cannot expand its scope, and its content cannot instruct. |
| Client under the static diagnostic token writing a `system` row today | Refused once W1 lands. Until then the honest statement is: nothing reads the log into a model, and W1 must ship before anything does. |
| Compromised-but-authorized reader-custody Writer | Items project with verified authorship and a `remote_pico` origin; cryptographic validity never promotes content above the instruction threshold (W2). |
| Pico's own model under injected influence | Its persistence and egress run through boundaries outside the model (W5), and its output inherits the lowest source class (W2), so it cannot launder content upward or act without a decision. |

## Consequences

Positive:

- the worm threat has an owner before any of its surfaces exist, and
  each roadmap step that would close a replication segment has a named
  blocker instead of an afterthought;
- provenance, assembly and approval reuse decided machinery - ADR
  0099/0106 approvals, ADR 0060 scoping, ADR 0002 tiers, ADR 0031 abuse
  controls - rather than inventing parallel systems;
- honesty is preserved: containment is claimed, model immunity is not,
  and no reserved surface gains a security claim it has not earned.

Negative and residual:

- friction by design: an outbound write derived from untrusted content
  always costs a decision, and a person who approves everything reopens
  the payload path - though not the silent replication path;
- schema weight before a companion exists: the origin column and its
  migration land ahead of the feature that needs them, deliberately;
- the tripwire is heuristic and will miss adversarial rephrasing; it is
  defense-in-depth over W2/W5, never the boundary;
- W1 narrows a currently writable diagnostic surface, and foundation
  tests exercising the full role vocabulary move behind the reserved
  gate the way the action-vocabulary tests already do;
- labels, tiers and quotas bound content handling, not content truth: a
  labeled lie is still a lie, and ADR 0017's evidence posture stays the
  answer to that.

## Relationship to other ADRs

- Takes ownership of the prompt-injection concerns ADR `0049`, ADR
  `0050` and ADR `0058` explicitly deferred.
- Realizes ADR `0017`'s evidence posture for model contexts: origin
  classes are server-assigned provenance, while `ContextSignalLevel`
  stays reserved planning vocabulary.
- Binds ADR `0002`'s relationship tiers and ADR `0031`'s
  blocked-before-production abuse controls to the first free-text Link
  operation (W6).
- Realizes ADR `0010`'s confirmation outcome with ADR `0099`/`0106`
  machinery (W4); keeps ADR `0036`'s "MCP is a tool connection method,
  not Pico authority" and ADR `0019`'s allow-list direction unchanged.
- Extends ADR `0068`/`0069`'s memory write model with origin labels
  (W2) and aligns with ADR `0060`'s context-reference scoping.
- Distinguishes the reader-custody sync family's (ADR `0089`-`0096`)
  cryptographic authenticity from semantic trust: the former never
  implies the latter.
- Leaves ADR `0048`'s delegation boundary intact: a provider gains no
  instruction authority from carrying a context, and its
  `tool_access_allowed` keeps defaulting to false.

## References

- [ADR 0002](0002-peer-trust-and-relationships.md)
- [ADR 0010](0010-tool-policy-and-executor-model.md)
- [ADR 0017](0017-contextual-interaction-safety-and-trust-signals.md)
- [ADR 0019](0019-home-assistant-threat-model.md)
- [ADR 0031](0031-pico-link-identity-relay-and-domain-threat-model.md)
- [ADR 0036](0036-capabilities-connectors-and-mcp-boundary.md)
- [ADR 0048](0048-model-capability-delegation-and-remote-inference-boundary.md)
- [ADR 0049](0049-model-provider-registry-and-job-envelope.md)
- [ADR 0050](0050-model-delegation-draft-fixture-gate.md)
- [ADR 0058](0058-model-delegation-draft-job-envelope-scoping-placeholder.md)
- [ADR 0060](0060-model-delegation-draft-context-reference-scoping-placeholder.md)
- [ADR 0069](0069-recording-memory-items-and-reference-only-event-writes.md)
- [ADR 0099](0099-hold-channel-approval-for-authority-creating-signatures.md)
- [ADR 0106](0106-approval-rendering-from-the-signed-bytes.md)
