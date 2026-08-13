# 0117 - Planner-Reader Split and Origin-Aware Data-Flow Policy

## Status

Accepted as a pre-implementation security constraint refining ADR 0116
W3; the split and its scope were chosen explicitly by the user on
2026-08-01 within the ADR 0116 security initiative. X1, X2 and **X4 as a
contract (2026-08-13)** are implemented in the protocol. X3 and X5 stay
open and bind the same future milestones W3-W5 already bind - a tool
executor and a companion surface, neither of which exists yet. X4's job
shape exists; the runtime that would send one does not.

**X4 closed the question ADR 0151 left open, by asking a different one.**
That ADR recorded that a quarantined read "is neither the live turn nor
retrieved memory", which left the nearest delegable job unable to say
which allowance it needs. The allowance is not a property of the job
type. It is a property of whose words the job carries, and ADR 0116 W2
already labels every unit with exactly that: a read over the person's own
words needs the live turn, a read over anybody else's needs the wider
allowance, because those are words their author never offered to a
provider. Computed from the units and then compared against the declared
field, so a job cannot understate what it holds.

The conservative reading is taken, in one function, visibly. The
alternative - that freshly arrived foreign content is not "retrieved
memory" - is arguable from ADR 0048's wording and not from its reasoning,
which is about second parties learning what people wrote.
Where they overlap, this ADR is the stronger rule.
The claim strengthens from ADR 0116's "injected content is contained"
to "injected content never reaches the acting model" - and stays as
honest: data poisoning survives every split, and this ADR says so.

## Context

ADR 0116 W3 decided structural context assembly: below-threshold
content enters a model context only as delimited, origin-labeled data.
That is a strong rule with a known ceiling - the acting model still
reads the hostile bytes, and a delimiter asks the model to treat them
as data. A sufficiently persuasive "data" block is a bet on model
obedience, which is exactly the bet ADR 0116 refuses to make. The
stronger property is available: a model cannot obey what it never
received.

The pattern is established: Simon Willison's Dual LLM proposal (2023) -
a privileged model that can act but never sees untrusted content, a
quarantined model that sees everything but can do nothing, and a
deterministic controller passing symbolic variables between them -
formalized by Google DeepMind's CaMeL (2025), which added typed values
and capability labels tracked through the data flow, so that policy can
see where an action's arguments came from.

Pico has already decided the pieces this pattern is built from:

- ADR 0116 W2's origin classes with lowest-class inheritance are
  CaMeL's capability labels under another name;
- ADR 0069 already splits reference from content - the log carries a
  reference, the store carries the bytes - which is the same move as
  the controller handing the planner a handle instead of text;
- ADR 0060 already insists a context reference is "a value, not a
  capability": materialized, expiring, never expandable;
- ADR 0048 already defines a model role with no authority - a delegated
  provider "must not become memory owner, policy authority or action
  executor", `tool_access_allowed` defaulting to false - which is the
  quarantined reader's job description, written before the job existed;
- ADR 0059 already rules that a result envelope is never an action
  approval;
- ADR 0010 already splits proposing from deciding from acting.

What is missing is the decision that connects them: that the acting
context and the exposed context are never the same context.

## Scope

Covers: the two model roles and their context admission rules; the
controller value boundary between them; origin-aware data-flow labels
on action arguments and their evaluation by Pico Rules; the quarantined
read as a delegation workload; and what the person is shown versus what
the person approves.

Does not cover:

- model-delegation runtime surfaces - ADRs 0048-0061 keep registry,
  job, context-reference and result-envelope semantics; this ADR only
  gives one job shape its meaning;
- any claim that the quarantined reader resists injection - it is
  assumed compromised the moment it reads hostile content, and the
  design must hold anyway;
- companion UX surfaces (ADR 0105, ADR 0112, ADR 0113) beyond the
  display-versus-approval separation decided here;
- content truth - a labeled lie is still a lie, and ADR 0017's
  evidence posture remains the answer.

## Decision

### The planner acts and never reads; the reader reads and never acts

A Pico that can execute tools runs its model capability in two roles.
The privileged planner's context admits exactly: the authenticated
person's instructions (`person_present`), Pico's own policy and system
material, and what the controller hands over - opaque references and
typed values. It may propose actions under ADR 0010. The quarantined
reader receives below-threshold content - `remote_pico`,
`external_content`, `home_member` material, `unattributed` rows - and
has zero tool access, zero key access and no path to the instruction
stream. Everything it emits is data. The reader is assumed compromised
whenever it has read hostile content; nothing about the design leans on
its good behavior. The asymmetry does the work: authority and exposure
never meet in one context.

ADR 0116 W3's single-context delimited mode remains lawful only for a
companion that cannot execute tools. The moment an executor exists, the
split is required - dual-context is the target architecture for every
acting Pico, not an optional hardening tier.

### Only values cross, and the controller is code

Between reader and planner sits deterministic Pico code - never a
model. What crosses: opaque references in the ADR 0069/0060 idiom, and
values parsed against a schema the requesting flow declared in advance.
Free prose is not a type: reader output that fails its schema parse is
refused, not passed along "as text". A string-typed field remains a
narrow prose channel by nature - the admission rule keeps it data
inside the planner, but the honest statement is that typed schemas
narrow the channel rather than close it, which is why the planner's
side of the ADR 0116 W3 discipline still applies to every value it
receives.

The person is not a laundering path to close: a person may always read
untrusted content (displayed as labeled content, X5) and may always
type or paste whatever they choose as their own instruction - their
authority is the point of the product. The boundary binds machine
paths. The residual - a person socially engineered into instructing
against themselves - is named, not solved; labeling at display time is
the mitigation.

### Origin rides the arguments

Every value the reader produces carries derived origin under ADR 0116
W2's lowest-class rule. When the planner proposes an action, the
canonical action request names, for each argument, the origin classes
its value derives from - computed by the controller from the actual
data flow, never asserted by the planner, which sees handles rather
than provenance. Pico Rules evaluates the ADR 0010 risk class and the
argument origins together: an `external_write` whose arguments derive
from `external_content` or `remote_pico` is `require_confirmation` at
minimum, and deny stays available to policy. The ADR 0106 statement
renders the arguments from the canonical bytes and names their origin,
so the person deciding reads "send to X; body derived from a message
from stranger Y" - provenance at the moment it matters.

### The quarantined read is the delegable workload

The quarantined read maps onto ADR 0048/0049 delegation as its
purpose-built job: the job carries a materialized excerpt under ADR
0060's posture, `tool_access_allowed` stays false, and the result
envelope returns typed values carrying origin - never instructions and
never approval (ADR 0059). Delegating the reader is safe by
construction because the reader holds nothing: worst case, a hostile
provider returns hostile values, which is the same case as a
compromised reader and is handled the same way. The planner is the
opposite: it holds instruction authority, so the planner role runs
only inside the Pico trust boundary - locally, or on a node the person
has explicitly trusted at Vault grade. The dangerous content goes to
the model with no authority; the authority stays with the model that
reads only trusted input.

### What the person reads is content; what the person approves is canonical

Readings and summaries for the person come from the reader side and
are displayed as labeled content - origin visible, rendered as content
in the dashboard's existing textContent discipline, never as Pico's own
voice. Approval statements never contain reader prose: they render from
the canonical action bytes plus the controller-computed origins (ADR
0106, extended by X3). A lying summary can still mislead the person's
judgment - that is the data-poisoning residual - but it cannot alter
what the approval cryptographically binds.

## Gates

- **X1 - Role admission rules (implemented in the protocol):**
  `assemblePicoPlannerContext` takes policy, the present person, typed
  values and opaque references - and nothing else.

  **The gate is the absence of a parameter**, not a filter that could be
  misconfigured and not a delimiter that has to hold. A caller holding a
  stranger's mail has nowhere to put it, and the refusal happens at the
  call site rather than at review time. That is what moves the claim
  from W3's "injected content is contained" to "injected content never
  reaches the acting model": W3's delimiter bet stops being load-bearing
  for a Pico that can act, because the bytes are not there to be obeyed.

  `picoReaderCapabilities` gives the reader `toolAccess: false` and
  `keyAccess: false` as a type whose fields can only be `false`. A
  boolean that *could* be true invites a call site to set it; a type
  that cannot express the permission cannot leak it by configuration.

  `mayPicoUseSingleContextAssembly` returns false as soon as an executor
  exists, which is the rule stated as code rather than as prose.

  Values are re-parsed at the planner boundary rather than trusted from
  the call site - a value that only type-checked somewhere earlier has
  not crossed a boundary. Removing either that re-parse or the strict
  key check fails exactly the test that names it.

  Original gate text: the planner context admits only `person_present`
  material, Pico's own policy material, typed values and opaque
  references; the reader runs with zero tool and key access;
  single-context assembly stays lawful only where no executor exists.
- **X2 - Controller value boundary (implemented in the protocol):**
  `parsePicoReaderOutput` declares six value shapes and refuses
  anything else - a wrong type, an undeclared extra field, a name that
  is not a canonical token, a duplicate name. It refuses rather than
  dropping the field it could not parse, because continuing with the
  parts that happened to fit is how an undeclared shape becomes an
  accepted one; "last one wins" on a duplicate is a decision no declared
  schema made.

  A reader value can never carry `person_present`, and that refusal has
  its own error so it is never confused with a shape failure. It is the
  laundering step the whole split exists to break: a read of a
  stranger's mail must not re-enter as the person's own instruction.

  References carry a handle and an expiry and nothing else. A reference
  that never expires is a standing grant, and this one is handed to a
  model; expansion stays a separate authorized act under ADR 0060 and
  never happens during assembly.

  **On "no free-text crossing", the reading matters and is written down
  here rather than left to inference.** A `text` shape exists, because a
  summary has to be able to come back. Read literally the gate would
  forbid it; this ADR's own threat ledger answers the question by
  listing "prose smuggled through a string-typed value" as a *residual*
  with stated width, not as a violation. So the rule is implemented as
  "no *undeclared* free text crosses": every string arrives named,
  typed and origin-carrying, and lands in the planner as data under W3's
  quoting discipline, never as instruction. What X2 buys is not that
  strings became safe - it is that there is no path on which raw content
  arrives undeclared. The residual is that the planner still reads the
  sentence; it is simply never told to obey it.

  Original gate text: declared schemas for every reader output shape,
  refusal on parse failure, no free-text crossing; references resolve
  under ADR 0060's rules - materialized, expiring, never expandable.
- **X3 - Data-flow origin on action arguments (binds the first tool
  executor, with W4):** controller-computed derivation labels on every
  argument in the canonical action request; Pico Rules consumes them;
  ADR 0106 statements name them.
- **X4 - Quarantined read job type (contract implemented 2026-08-13):**
  the ADR 0048/0049 job variant with typed, origin-carrying result values
  and planner delegation confined to the Pico trust boundary.

  **There is no `tool_access_allowed` field.** This gate asked for one set
  to false; a field that is always false is not a field, it is a promise
  stored where a future edit can find it. `toolAccessAllowed`, `tools`,
  `systemPrompt` and `providerHint` are each refused **by name**, in ADR
  0150's construction, because writing one is not a typo - it is asking
  for the thing the split removed.

  Two rules that look like one and are not, so a caller can say which
  refused: **a planner runs only on the four ADR 0048 classes that are
  Picos**, since a stranger's machine is no place to decide this person's
  next step, and no credential changes that; and **the words a job carries
  decide which entries may see them**, which is ADR 0151 PV3 and is about
  disclosure rather than authority. A reader may leave the boundary; what
  limits it is the second rule.

  A planner job holding anything below ADR 0116's instruction threshold is
  refused outright - that is X1's admission rule at the job boundary,
  where the split would otherwise be undone by delimiters.

  The result shape is X2's `pico.reader.output.v1`, unchanged and already
  built. What does not exist is anything that sends a job: no queue, no
  runtime, no result path.
- **X5 - Display separation (binds companion UX):** person-facing
  renderings of untrusted content stay labeled content; approval
  statements never include reader prose.

## Threat ledger

| Attacker | Posture |
|---|---|
| Injected instructions in a mail, message or document | The reader may obey them - into its own output values, which are data with derived origin. The planner never receives the text, so there is nothing for it to obey. A payload now requires an action whose arguments betray their origin at approval time (X3). |
| Morris II-class self-replicating prompt | The planner cannot reproduce text it never saw. The reader's reproduction is a value that cannot auto-persist or auto-forward (ADR 0116 W5) and carries its origin. Replication now requires a person approving a canonically rendered forward of stranger-derived content - loud, labeled and refusable. |
| Poisoned data - values that are well-formed lies | The split does not help, and this ADR does not pretend it does. A false amount flows as a correctly labeled false value. Origin display at approval (X3, X5) and ADR 0017's evidence posture are the mitigations; the person's judgment is the residual. |
| Compromised quarantined reader | The design assumption, not a failure case. It holds no tools, no keys and no instruction path; its worst case - arbitrary hostile values - is the previous row. |
| Hostile delegation provider running the reader | The same posture plus ADR 0048/0049/0060 boundaries: it cannot expand a context reference, and its result is never an approval (ADR 0059). |
| Prose smuggled through a string-typed value | X2's schemas narrow the channel; they do not make strings safe. The value lands in the planner as data under X1's admission rule and the W3 discipline - and the residual width of this channel is stated rather than hidden. |
| Person socially engineered into pasting hostile text as their own instruction | The person may always instruct; that authority is the product. Display labeling (X5) is the mitigation; this residual is accepted and named. |

## Consequences

Positive:

- containment stops depending on any model's obedience: the acting
  context structurally lacks the hostile bytes, so the delimiter bet of
  W3 is no longer load-bearing for acting Picos;
- every piece reuses a decided mechanism - W2 origins, the ADR
  0069/0060 reference idiom, ADR 0048's authority-free role, ADR 0106
  rendering - rather than inventing a parallel system;
- the workload that must touch dangerous content becomes the one that
  is safe to delegate, and the authority-bearing workload stays home;
- Pico Rules gains provenance it can actually evaluate: argument
  origins computed from data flow, not asserted by a model.

Negative and residual:

- two model calls where one would do - latency and cost by design;
- data poisoning survives the split entirely; ADR 0017 stays the
  answer to content truth;
- schema work is security work: every reader use case needs a declared
  output shape, and a sloppy schema (one big string) quietly widens the
  prose channel;
- string-typed values remain a narrow prose channel into the planner,
  kept as data by admission rules but present;
- the person-bridge is deliberately open - a person may always paste
  and instruct - so social engineering of the person remains the
  unclosed residual;
- a deployment that cannot run two model roles loses tool execution
  until it can, deliberately.

## Relationship to other ADRs

- Strengthens ADR `0116` W3 from delimitation to absence for every
  acting Pico; inherits the origin classes (W2), the write boundaries
  (W5), the free-text-operation blockers (W6) and the
  containment-not-immunity stance.
- Realizes ADR `0010`'s reasoning layer as two roles and gives the
  policy engine argument-origin input; the executor and audit layers
  are unchanged.
- Gives ADR `0048`'s `tool_access_allowed: false` its purpose-built
  workload, confines planner delegation to the trust boundary, and
  keeps ADR `0049`/`0059` envelope semantics: a result is never an
  approval.
- Extends ADR `0069`'s reference-not-content idiom and ADR `0060`'s
  value-not-capability rule across the model boundary.
- Extends ADR `0106`: approval statements render from canonical bytes
  and now name controller-computed argument origins; ADR `0099`'s
  one-approval-one-action semantics are unchanged.
- Leaves ADR `0017` as the answer to whether labeled content is true,
  which no split decides.

## References

- [ADR 0010](0010-tool-policy-and-executor-model.md)
- [ADR 0017](0017-contextual-interaction-safety-and-trust-signals.md)
- [ADR 0048](0048-model-capability-delegation-and-remote-inference-boundary.md)
- [ADR 0049](0049-model-provider-registry-and-job-envelope.md)
- [ADR 0059](0059-model-delegation-draft-result-envelope-provenance-placeholder.md)
- [ADR 0060](0060-model-delegation-draft-context-reference-scoping-placeholder.md)
- [ADR 0069](0069-recording-memory-items-and-reference-only-event-writes.md)
- [ADR 0099](0099-hold-channel-approval-for-authority-creating-signatures.md)
- [ADR 0106](0106-approval-rendering-from-the-signed-bytes.md)
- [ADR 0116](0116-untrusted-content-and-self-replicating-prompt-threat-model-and-hardening-gates.md)
