# 0141 - The Runner Executes What Was Decided and History Is a View

## Status

Accepted as the execution and record contract for the action path. **RN3 and RN4 are
implemented** on 2026-08-10; RN1, RN2, RN5 and RN6 are open.

Third of three replacing ADR 0010's concept note. ADR 0139 says what an
action is, ADR 0140 says who decides, this says who acts, what a person
is asked, and what is left behind.

## Context

ADR 0010's executor constraints are still right and are kept: validate
arguments, enforce allowlists and scopes, execute only declared
behaviour, return structured results, record failures, avoid hidden side
effects, and never offer a raw shell as a general tool.

What has changed underneath them is the last layer. ADR 0010 lists an
audit log as the fourth component, and by the time it was written there
was nothing to audit. There is now.

**The audit chain exists and is not a second log.** `pico_audit_record`
has `event_id` as its primary key with `REFERENCES pico_event`, a
per-writer `chain_position`, a `previous_digest_hex` and a `digest_hex`,
with uniqueness on both `(writer_id, chain_position)` and
`(writer_id, digest_hex)` so no writer can fork its own sequence and keep
both branches. The chain sits *over* the event log; the heads live in the
recovery anchor, outside restorable snapshots (ADR 0121).

That settles a question the reserved protocol names still get wrong. Of
the eight, `action.completed` and `action_runner.action_completed`
describe one fact, and `action_history.event_created` describes a fact
the chain already makes tamper-evident. Writing an event that says an
event happened adds a row, not an assurance.

ADR 0026 already says what Action History is, in one line: it is the
product name for the audit log. Not a component beside it.

**And the approval half is already directed.** ADR 0116 W4 says action
approvals are "ADR 0010 decisions realized with ADR 0099/0106 semantics
for tool families", and ADR 0106 is implemented: an approval statement is
rendered from the same validated fields the daemon builds the signed
bytes from, rather than from a description supplied alongside them.

## Scope

Covers: what the runner may execute and what it may not infer; how an
approval is asked and what the sentence may contain; what an action
leaves behind and where it lives; and what a record may hold.

Does not cover:

- the request contract (ADR 0139) or the decision (ADR 0140);
- the audit chain itself, which ADR 0121 built and this consumes;
- the Companion surface that shows history, which is product work;
- how a supplier executes an outbound effect once permitted, which is
  ADR 0136 and ADR 0138.

## Decision

### The runner executes the decided request and infers nothing

The runner takes the recorded decision and the request it decided on, and
executes exactly that. It supplies no default, resolves no ambiguity,
retries nothing that changes an argument, and never consults the rules
itself.

ADR 0140 puts one decision in one place; this is the other half of that
property. A runner that filled in a missing value would be deciding what
the rule engine never saw, and the value it filled in would be the one
nobody reviewed. A request that cannot be executed as decided fails and
is recorded as failed.

If the request changes, it is a new request with a new decision. There is
no amendment path, because an amendment is a decision made by whoever
wrote the amendment code.

### Read-only never becomes a write

ADR 0010's rule, kept and sharpened: an effect declared `read_only`
(ADR 0139's pinned class) that attempts a write is a **runner failure**,
not a policy question. The runner does not ask whether the escalation is
permitted; it refuses to have performed it and records that.

The distinction matters because asking would put the escalation in front
of a person as a normal-looking approval, at exactly the moment the
system has evidence that a declaration is false.

### The approval statement is built from the fields that will execute

ADR 0106 generalised beyond the Vault: **the sentence a person reads is
composed from the same validated fields the runner will use.** Never from
a description the requester supplied, never from a summary, never from a
second rendering path that could drift.

Three things follow, and each closes a specific hole:

**The instance appears.** ADR 0137 IN5 - the statement says *Ferienhaus*,
not *light on*, because with three houses attached the building is the
part a person needs to see.

**No reader prose enters.** ADR 0117 X5 in its sharpest form: an approval
statement may contain no text that came from outside Pico. The whole
attack on a confirmation dialogue is to make it say something
reassuring, and the only structural defence is that untrusted text has no
route into the sentence at all.

**The labels are visible.** An argument that carries `external_content`
is shown as having come from outside. "Send to the address from this
message" and "send to the address you typed" are different sentences, and
a person can only be the guard ADR 0010 hoped for if the difference
reaches them.

### An approval is bound to presence and expires

Following ADR 0116 W4's direction and ADR 0099's semantics: an approval
is answered within a session where a person's presence was established,
and it expires. A pending approval that outlives the moment is a standing
grant nobody intended, and ADR 0117 X2 already refused the equivalent for
references.

An expired approval is not a denial and not an allow. It is an unanswered
question, recorded as such, and the action did not happen.

### History is a view over the log and the chain

**Action History is not a store and not an event type.** It is a
projection over the event log, filtered to ADR 0139's five facts, read
together with the `pico_audit_record` chain that already covers those
events.

The consequence is the reason to do it this way. A separate history store
would have to be added to the shred cascade, the backup exclusions, the
boot reconciliation, the ADR 0119 Q5 ceilings and the ADR 0121 chain -
the five places ADR 0127 counts, against zero for a view over rows that
are already governed. An action's record is shredded, retained, restored
and chained because it is an event, not because someone remembered to
make it so.

The reserved `action_history.event_created` therefore goes, together
with the duplicate completion name. Under ADR 0134 this is an in-place
revision of a reserved surface: nothing holds an artifact produced under
those names, and the vectors are regenerated with the change.

### A record holds a reference where it could hold a payload

ADR 0010 asked for this and the reserved `ActionHistoryEventPayload`
already carried `redaction: 'none' | 'summary' | 'reference_only'`. The
vocabulary is kept, with one rule made explicit that 0010 could not have
known to write:

**an argument that carried `external_content` is never recorded
verbatim.** It is stored as a reference or a Pico-composed summary.

Written on 2026-08-10 while `ActionHistoryEventPayload` still existed;
ADR 0139 AC5 removed it that same day together with its event type, and
the vocabulary survives as `picoActionRecordRedactionModes`. The rule is
unchanged - only the place the three words live.

The reason is not storage cost. History is read by a person today and is
exactly the kind of durable, trusted-looking store a model would later be
given access to. Verbatim untrusted text sitting in it would undo
ADR 0117's containment through the back door, a year after the containment
was built and by someone who had no reason to suspect the history.

### What the runner reports is structured, and failure is one of the outcomes

Results are typed values, not prose, for the same reason ADR 0117 X2
types reader outputs: something downstream will read them. A failure is
recorded with the same weight as a success, because an action that was
attempted and failed is a fact about the world and about Pico, and a
system that only records what worked cannot be audited.

## Rejected alternatives

### A separate Action History store

The obvious reading of ADR 0010's fourth layer. It creates a second
record of what already happened, in a table that must be separately
shredded, excluded from backups, reconciled at boot, capped and chained -
five places to forget, for no assurance the chain does not already
provide. ADR 0026 also names Action History as the audit log's product
term, so a separate store would make one name mean two things, which is
the failure ADR 0128 spent an ADR undoing.

### Keep both completion event names

`action.completed` and `action_runner.action_completed` were reserved
before there was a runner. Keeping both means every consumer has to know
which one is authoritative, and the answer would be discovered from code
rather than read from a contract.

### Let the requester supply the approval text

It is the component that knows what it wants and can phrase it best. It
is also the component that would phrase it best if it were lying. ADR
0106 already decided this for ceremonies, and the reason transfers
without modification.

### Show a summary of the arguments instead of the arguments

Friendlier, and it puts a rendering step between the person and what will
execute. Every drift between the two is invisible by construction, and
the drift is what an attacker needs.

### Let the runner retry with adjusted arguments

Robust-looking, and it makes the runner a decider. The adjusted argument
is one the rule engine never saw, and the adjustment code becomes an
unreviewed policy.

### Record only successful actions

Smaller history, and it removes the evidence that matters most. A refused
or failed action is what an audit is for.

### Let approvals persist until answered

Convenient on a device that was asleep. It turns a question into a
standing grant whose age nobody sees, and it means an approval can be
answered long after the situation that justified it has gone.

## Gates

- **RN1 - Executed as decided (open):** the runner executes the recorded
  request against the recorded decision, supplies no default, resolves
  no ambiguity, never consults the rules, and fails rather than adapting;
  a changed request is a new request.
- **RN2 - No escalation (open):** an effect pinned `read_only` that
  attempts a write is a runner failure recorded as such, never an
  approval prompt.
- **RN3 - The statement is the fields (implemented):**
  `buildPicoApprovalStatement` composes `sentence` from the request and
  the **consented** effect - not the currently declared one, so an update
  cannot rewrite what a person agreed to - and refuses a consented effect
  whose name differs from the request's, which is the drift ADR 0106
  exists to make impossible. It names the ADR 0137 instance, and each
  argument appears with the ADR 0139 origin class it arrived with.

  The shape turned out to be ADR 0116 W3's, and the ADR now says so: a
  person reading an approval is in the same position as a model reading a
  context, so the statement splits into Pico's own sentence and labeled
  data. There is no parameter for a prompt, a summary or a rationale -
  ADR 0117 X1's construction - and the counter-proof exists twice: a test
  feeds an injection string through an argument value and asserts the
  sentence does not contain it, and
  `picoApprovalSentenceForeignFields` returns the sentence fields whose
  text is neither Pico's nor the person's, which is empty by construction
  and non-empty the moment a description was never consented to.

  The asymmetry with RN6 is deliberate and stated at the site: a
  statement *shows* external content, because nobody can approve sending
  to an address they cannot see, while history never records it verbatim.
- **RN4 - Presence-bound and expiring (implemented):**
  `resolvePicoApproval` binds the answer to the session the question was
  asked into - another session answering is refused under its own error
  rather than folded into a refusal, because it is not an answer at all
  but someone agreeing on the person's behalf.

  Expiry reuses `hasPicoExposureWindowElapsed` rather than a fresh
  comparison, so an approval is an ADR 0120 exposure window like every
  other: it ends at the earliest instant any available clock allows, and a
  wall clock wound backward cannot extend it. Tests prove all three
  directions - wall clock, monotonic, durable floor. Expiry is checked
  **before** the answer is read, so a late click is not consent.

  The action path refuses to ask without a window rather than defaulting
  to one: a window nobody chose is a standing grant with a number
  attached.

  **The reserved payload could not express this, and was revised in
  place.** `ApprovalResolvedPayload` carried `approved: boolean`, which has
  room for two answers where there are three. A person who was asleep did
  not refuse - the question expired, and recording that as a refusal would
  put a decision in their mouth. It now carries a
  `PicoApprovalOutcome` of `approved | refused | unanswered`, under
  ADR 0134: reserved, never writable, nothing holds an artifact produced
  under it.
- **RN5 - History is a view (open):** no history store and no history
  event type exist; Action History is a projection over the event log
  and the ADR 0121 chain, and the reserved names are revised in place
  under ADR 0134 with their vectors regenerated.
- **RN6 - External content is never recorded verbatim (open):** an
  argument labelled `external_content` is stored as a reference or a
  Pico-composed summary; results are typed values; failures are recorded
  with the same weight as successes.

## Failure ledger

| Situation | Posture |
|---|---|
| An argument is missing at execution time | The action fails and is recorded as failed. The runner does not supply it (RN1). |
| A `read_only` effect attempts a write | Runner failure, recorded. Not an approval prompt, because the declaration has just been shown to be false (RN2). |
| A requester supplies friendly approval text | There is no field for it. The statement is composed from the executing fields (RN3). |
| A reader summary would explain the action nicely | It does not enter the statement. No text from outside Pico reaches the sentence that authorises the act (RN3). |
| A person approves an action about a light | The statement said which building, so approving the wrong one required reading past the answer (RN3, ADR 0137). |
| A device was asleep when the approval was asked | The approval expired and is recorded unanswered. The action did not run (RN4). |
| A domain is shredded | The action's record goes with it, because it is events under ordinary custody rather than a store that had to remember to participate (RN5). |
| A model is later given access to history | It finds references and Pico-composed summaries where untrusted text would have been (RN6). |
| An action fails | Recorded with the same weight as a success. An audit that only holds successes is not one (RN6). |

## Consequences

Positive:

- the fourth layer of ADR 0010 turns out to be already built, so the
  action path costs one projection rather than one store with five
  obligations;
- the approval statement becomes the one surface in the system where
  untrusted text is structurally absent, which is what makes a person a
  usable guard rather than a rubber stamp;
- shredding, retention, ceilings and tamper evidence apply to action
  records for free, because they are events;
- a failed action is as visible as a successful one, which is the
  property that makes the history worth reading.

Negative and residual:

- a view over events is harder to query than a purpose-built table, and
  the first history surface will feel that;
- never recording external content verbatim means a person cannot always
  see exactly what a value was, only what Pico made of it - a real loss
  of fidelity accepted for a real gain in containment;
- presence-bound expiring approvals will drop actions a person meant to
  approve, on a laptop that slept, and the correct answer is to ask
  again rather than to extend the window;
- the runner refusing to adapt will produce failures that a more
  forgiving implementation would have absorbed, and every one of them
  will look like a bug until the reason is read.

## Relationship to other ADRs

- Third of three replacing ADR `0010`'s layering; keeps its executor
  constraints and its redaction requirement verbatim.
- Executes what ADR `0139` requested and ADR `0140` decided.
- Consumes ADR `0121`'s chain rather than building a second log, and
  ADR `0026`'s statement that Action History is the audit log's product
  name.
- Generalises ADR `0106` beyond the Vault and follows ADR `0116` W4's
  direction to ADR `0099` semantics for presence and expiry.
- Implements ADR `0117` X5 for the approval surface.
- Names the ADR `0137` instance in the statement.
- Revises reserved protocol names in place under ADR `0134`.
- Avoids the five obligations ADR `0127` counts for a new store.

## References

- [ADR 0010](0010-tool-policy-and-executor-model.md)
- [ADR 0026](0026-product-terminology-and-naming.md)
- [ADR 0106](0106-approval-rendering-from-the-signed-bytes.md)
- [ADR 0116](0116-untrusted-content-and-self-replicating-prompt-threat-model-and-hardening-gates.md)
- [ADR 0117](0117-planner-reader-split-and-origin-aware-data-flow-policy.md)
- [ADR 0121](0121-tamper-evident-audit-records-and-anchored-checkpoints.md)
- [ADR 0127](0127-pico-modules-mandatory-delivery-independent-code-declared-dependencies.md)
- [ADR 0134](0134-formats-revise-in-place-until-the-first-kept-identity.md)
- [ADR 0137](0137-suppliers-are-instances-coverage-decides-whether-they-add-up.md)
- [ADR 0139](0139-every-action-is-requested-by-someone-pico-does-not-trust.md)
- [ADR 0140](0140-pico-rules-decide-from-a-closed-input-and-are-not-themselves-an-action.md)
</content>
