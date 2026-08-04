# 0121 - Tamper-Evident Audit Records and Anchored Checkpoints

## Status

Accepted as a constraint on ADR 0011's product audit; the initiative and
its scope were chosen by the user on 2026-08-01. J1 and J2 are
implemented, so the seventeen event types that already act as audit
records are chained and their heads anchored. J3 (signed checkpoints),
J4's read surface and J5 remain open.

Timing was the point and it held: this landed before Action History
exists, so the chain vouches for the trail from its own beginning rather
than from the day someone retrofitted it. What it protects today is not
hypothetical - those rows are written now, and before this any process
that could open the database could delete one undetectably.

Detection, not prevention, and this ADR forbids claiming otherwise. A
sustained host root still forges chain, anchor and signature together;
the external witness that would not is deliberately unbuilt.

## Context

Seventeen event types already function as audit records: four
`auth.*` records covering operator bootstrap, credential change,
operator reset and session revocation, and thirteen `home.*` records
covering claim, reset, membership, domain-read grants and revocations,
share envelopes, device recovery and its veto, anchor reseeding,
rotation veto and host-key rotation. They are written content-free by
design, which is right and stays.

They are append-only in exactly one sense: nothing in Pico's code
updates or deletes them. That is a discipline of the writer, not a
property of the record. `pico_event` stores `event_id`, `lamport`,
`wall_time`, `type`, `stream`, `payload_json` and a nullable
`signature` column that no writer populates. Rows are ordered by
`(lamport, wall_time, event_id)` and linked to nothing. Any process
that can open the SQLite file can delete a row, rewrite a payload or
renumber a sequence, and no later read can tell.

ADR 0011 wants considerably more of this trail than exists: tool
requests, policy decisions, confirmations, permission changes, trust
changes, update and migration events, blocked actions, export and
import. None of it is built. Action History is the surface that will
write most of it, and it does not exist yet either.

That timing is the opportunity. An audit trail's integrity property is
retroactive-hostile: a chain begun today says nothing about yesterday's
rows, and a checkpoint signed today attests only to what it can see.
Deciding before Action History means the product audit is born with the
property rather than acquiring a partial one later.

The adversary worth naming is specific. Pico already accepts that a
host-level attacker defeats most confidentiality boundaries - ADR 0087
says the retained console fallback "can relay, withhold and locally
destroy data", and the daemon boundary explicitly does not protect
against malware that already owns the person's session. Audit is one of
the few places where that attacker is the *point*: the reason to keep a
trail is the person who got in and would like the trail to disagree.

Against a host they own, prevention is not available. Detection is.

## Scope

Covers: what integrity property audit records carry; how records are
linked; what witnesses the linkage; which key may sign an attestation
and under what approval; and what the property honestly does not cover.

Does not cover:

- which events are audit-worthy - that is ADR 0011's list and Action
  History's design;
- audit content or schema, which stays content-free by existing
  practice;
- retention or export of audit records;
- cross-replica ordering, which stays ADR 0014's Lamport problem;
- confidentiality of the trail, which is the memory-encryption
  boundary's job, not this one's.

## Decision

### Detection, not prevention, and the ADR says which

Audit integrity makes tampering **non-silent**. It does not make
tampering impossible, and no mechanism available on a host the attacker
controls would. Every gate below is written to that standard, and a
claim that a record "cannot be altered" is one this ADR forbids making.

### Records are chained per writer

Every audit record carries the digest of its predecessor in that
writer's sequence, over canonical bytes built with ADR 0034's
established method - versioned family label, `U32BE(length) || bytes`
elements, fixed field order - so the digest input is unambiguous and
testable with authoritative vectors like every other signed surface.

The chain is **per writer**, not global. ADR 0014's log is designed to
become replicated, and a strict global chain would quietly assert a
single writer. Each instance chains its own sequence and attests only
"this is the sequence I wrote"; ordering across replicas stays Lamport's
job and gains nothing here. Saying so prevents a later multi-writer
milestone from discovering that the integrity story assumed something
the architecture never promised.

On its own the chain catches corruption, partial restores and naive
edits. It does not stop a competent attacker, who can recompute every
digest after editing - which is exactly why the chain is not the whole
decision.

### The head is anchored where a restore cannot reach

The chain head is checkpointed into the anchor ADR 0110 R6 built and
ADR 0120 extended: outside every restorable Foundation snapshot,
forward-only, able only to refuse.

This is what makes the chain load-bearing against the realistic attack.
Rewriting history in the database is cheap; rewriting it so the
excluded anchor still agrees means writing to the one location the
supported restore path does not carry. An attacker who rolls the
database back to before their visit now produces a head the anchor has
never seen, and the disagreement is the detection.

The anchor keeps its invariant exactly: it can refuse to confirm a
head, and it can never make one valid. A checkpoint mismatch is
reported, never repaired.

### Attestation is not authority, so it needs no person

Where a signer exists, the checkpoint is signed - and this ADR states
plainly why that does not drag in an approval per checkpoint.

ADR 0099 binds approval to authority-creating signatures: a signature
that makes someone able to do something. An audit checkpoint creates no
authority. It grants nothing, admits nobody, and its only power is to
disagree with a forged history later. It is therefore signable under
ADR 0100's label-checked signing with its own dedicated label, without
a per-checkpoint approval, and ADR 0101's work to reduce approval
counts is not undone.

Two constraints follow. The label is exclusive: a key that may sign
audit checkpoints may sign nothing else with that label, and no
authority-bearing label may sign a checkpoint. And the Foundation
host's own signing key is not eligible - it lives on the disk the
attacker owns, so signing with it would attest to nothing.

A checkpoint interval with no available signer is not a failure. It is
an unsigned interval, recorded as such, and coverage gaps are visible
rather than assumed away.

### Coverage is a stated property, not a vibe

Every audit read reports what its integrity actually covers: which
range is chained, which range is checkpointed, which is signed, and
where the gaps are. A person or an auditor is told "this range is
covered, this range is not", never shown a green mark that means "no
one checked".

Verification runs on boot in the same posture ADR 0115 U2 already uses
for the continuity chain: re-prove the links, and on a break report it
loudly rather than dropping, repairing or hiding the affected range.

### The trail stays content-free and attacker-quiet

Two existing rules are load-bearing here and are restated so the
product audit inherits them.

Records stay content-free, as `home.host_key_rotated` and
`home.identity_root_rotation_vetoed` already are. ADR 0011's own
abuse-resistance section is the reason: a detailed trail of a person's
life is a surveillance asset, and an audit that must be protected as
strongly as the data it describes has multiplied the problem it was
meant to bound.

And ADR 0119 Q3 keeps the trail from becoming an attack surface: an
unauthorized request writes nothing durable, so no attacker can inflate
the log, and ADR 0076's rule that failed logins stay out of it holds
unchanged.

### The witness outside the host is named, not built

The honest ceiling: chain, anchor and signature all live on the host.
An attacker with sustained root can produce a self-consistent forged
history and a matching anchor, and nothing local will disagree.

The answer is a witness elsewhere - the person's other device, or
another Home they own, holding a head the attacker cannot reach. The
cheap shape is already in the system: ADR 0112's alarm carrier performs
an authenticated lifecycle read on a six-hour cadence, and a chain head
rides that read without a new surface or a new schedule.

It is deliberately not built here. It needs a decision about what a
second Home is allowed to learn from a head it stores, which is ADR
0031's relationship question and not this ADR's. What this decision
does is keep the shape available: heads are small, content-free and
carry no authority, precisely so a future witness costs a field rather
than a redesign.

## Gates

- **J1 - Chained audit records (implemented):** `pico_audit_record`
  links every `auth.*` and `home.*` event to its predecessor in that
  writer's sequence, over ADR 0034-style canonical bytes with a pinned
  vector. The audit set is derived from the vocabulary by prefix, so a
  new `home.*` type joins the chain by existing rather than by someone
  remembering a second list. Genesis commits to *being* genesis instead
  of to an absent element, and positions are fixed-width, so neither a
  replayed first record nor a padding change can collide. The row and
  its link commit in one transaction: a chain written a moment later
  would leave a window in which the record exists unlinked, and an
  attacker who picks that moment gets a free deletion.

  Per writer, and the record says so by carrying `writerId`. The chain
  lives beside the log rather than inside it, because `pico_event` is a
  general log and audit is a subset of it, and because the chain needs
  its own sequence - Lamport orders across replicas and says nothing
  about what this instance wrote.

  Original gate text:
- **J2 - Anchored checkpoints (implemented):** each writer's head is
  checkpointed into the anchor ADR 0110 R6 built and ADR 0120 extended.
  Forward-only: a lower position is refused, and the same position with
  a different head is refused as two histories claiming one place rather
  than resolved in favour of either. The checkpoint is written after the
  row, so the anchor never claims a head the database lacks - the
  reverse would make an honest log look rolled back.

  Counter-proven exactly as the gate asks: a database rolled back past a
  record the anchor saw is reported `rolled_back`, and the chain itself
  is internally consistent in that case - an attacker who rolls back
  wholesale leaves no broken link, so only the anchor disagrees. Deleting
  a middle row instead is caught by the position and predecessor check,
  because the survivors still link to each other. Nothing is repaired:
  the anchor keeps the head it saw.

  Original gate text:
- **J3 - Signed checkpoints without new approvals (binds J2):**
  checkpoints signed under an exclusive ADR 0100 label with no
  per-checkpoint approval, justified by attestation creating no
  authority; the Foundation host key is ineligible; unsigned intervals
  are recorded as gaps.
- **J4 - Coverage is reported (binds the first audit read surface):**
  every read states which ranges are chained, checkpointed and signed;
  boot verification re-proves links and reports breaks loudly in the
  ADR 0115 U2 posture.
- **J5 - Content-free and attacker-quiet (binds Action History, with
  ADR 0011 and ADR 0119 Q3):** audit records carry no content, and no
  unauthorized request produces one.

## Threat ledger

| Attacker | Posture |
|---|---|
| Deletes a row to hide an action | Breaks the chain at that point; boot verification reports it (J1, J4). |
| Rewrites a payload and recomputes every digest | The chain alone cannot tell, which is why J2 exists: the recomputed head is one the anchor never saw. |
| Restores a database snapshot from before their visit | The anchor is outside the restorable path and only moves forward, so the restored head predates what the anchor knows (J2). |
| Rewrites the database *and* the anchor with sustained root | Succeeds locally. Named, not solved; the external witness is the answer and is deliberately left as future work with its shape preserved. |
| Forges a checkpoint signature | Requires a key that is not on the host disk; the host signing key is explicitly ineligible (J3). |
| Suppresses checkpoints so nothing is ever signed | Produces visible gaps rather than false coverage (J3, J4). |
| Floods the log to bury an entry | Cannot: unauthorized requests write nothing durable (ADR 0119 Q3), and failed logins stay out by ADR 0076. |
| Steals the audit trail for what it reveals | Bounded by content-free records (J5); the trail describes that something happened, not what was in it. |
| Backdates entries via the host clock | Ordering comes from the chain, not from `wall_time`; the clock question itself is ADR 0120's. |

## Consequences

Positive:

- the property is decided before the trail that needs it exists, so
  Action History is born covered instead of retrofitted;
- the anchor built for recovery and extended for time serves a third
  purpose without a third mechanism or a new authority-bearing
  artifact;
- separating attestation from authority keeps checkpoints frequent
  without reopening the approval budget ADR 0101 worked to reduce;
- reported coverage removes the worst audit failure mode, which is a
  trail everyone believes and nobody verified;
- the per-writer scope is stated now, so a replicated future does not
  inherit a global-chain assumption the architecture never made.

Negative and residual:

- sustained host root defeats all of it, and the external witness that
  would not is named rather than built;
- every audit write gains a digest computation and a chain read, on a
  path that is currently a plain insert;
- an unsigned interval is honest but unsatisfying: coverage depends on
  a daemon being unlocked often enough, and a rarely-unlocked
  installation is a rarely-signed one;
- the chain gives no cross-replica ordering and must not be read as if
  it did;
- content-free records keep the trail weak as evidence of *what*
  happened, which is the deliberate trade against building a
  surveillance asset;
- nothing here is implemented, and the seventeen existing audit types
  stay unchained until J1 lands - the chain will vouch for what
  follows it, never for what precedes it.

## Relationship to other ADRs

- Constrains ADR `0011`'s audit model before it is built and keeps its
  abuse-resistance concern as the reason records stay content-free.
- Leaves ADR `0014`'s append-only log and its Lamport ordering
  unchanged; the chain is per writer and claims nothing across
  replicas.
- Uses ADR `0034`'s canonical signature-input method for digest inputs
  rather than inventing a second canonicalization.
- Extends the ADR `0110` R6 anchor a third time, after ADR `0120`'s
  high-water instant, and preserves its refuse-only invariant.
- Reads ADR `0099` narrowly and explicitly: approval binds
  authority-creating signatures, and attestation creates none, so ADR
  `0100`'s label-checked signing carries checkpoints without reopening
  ADR `0101`'s approval budget.
- Reuses ADR `0115` U2's boot-verification posture: re-prove, report
  loudly, never silently repair.
- Depends on ADR `0119` Q3 to keep attacker-authored volume out of the
  trail and on ADR `0120` for every instant it records.
- Keeps the future witness shape compatible with ADR `0112`'s existing
  lifecycle read and defers the relationship question to ADR `0031`.

## References

- [ADR 0011](0011-privacy-security-and-audit-model.md)
- [ADR 0014](0014-deletability-and-append-only-events.md)
- [ADR 0031](0031-pico-link-identity-relay-and-domain-threat-model.md)
- [ADR 0034](0034-canonicalization-signature-inputs-and-test-vectors.md)
- [ADR 0076](0076-foundation-operator-credential-session-and-bootstrap-mechanics.md)
- [ADR 0099](0099-hold-channel-approval-for-authority-creating-signatures.md)
- [ADR 0100](0100-identity-ceremony-signing-over-the-vault-daemon.md)
- [ADR 0101](0101-daemon-side-kek-ceremony-families-and-ceremony-approval.md)
- [ADR 0110](0110-recovery-card-and-time-locked-zero-device-recovery.md)
- [ADR 0112](0112-recovery-product-surfaces-in-the-background-companion.md)
- [ADR 0115](0115-host-key-rotation-with-signed-continuity.md)
- [ADR 0119](0119-resource-exhaustion-and-denial-of-service-posture.md)
- [ADR 0120](0120-time-authority-and-conservative-window-evaluation.md)
