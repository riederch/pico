# 0099 - Hold-Channel Approval for Authority-Creating Signatures

## Status

Accepted and implemented as the approval layer ADR 0081 deliberately left
above the custody floor and ADR 0097 named as its largest residual. A
signature that creates new signed authority now requires an explicit
per-request decision by the person, delivered over the connection that holds
the unlock, and bound to the exact bytes being signed. Operational
high-frequency families stay ungated by an explicit, closed exemption list;
everything else — including any family added later — requires approval by
default. It is not a rendering layer, a policy engine, a platform-keystore
integration or a per-client authority model.

## Context

ADR 0097 recorded the honest limit of a terminal-held unlock: during an
unlock window, any same-uid process can request signatures within the
recognized families. It bounded that with labels, throttles and short
windows and named per-request approval as the tightening that belongs above
the floor. ADR 0098 then proved the contract with its first consumer, which
makes the gap concrete rather than theoretical: the daemon now has a real
client population, and the next migration on the list is the identity
ceremonies — founding records, delegations, revocations, grants and
rotations.

That ordering matters and is the reason this ADR comes before that
migration. Moving the highest-consequence signatures onto the daemon while
approval is still "the person unlocked something a few minutes ago" would
land the constitutional families on an ungated surface and require a
retrofit afterwards. Approval is cheaper to design before those consumers
exist than to insert underneath them later.

The obstacle is a contract question rather than a policy one. The ADR 0097
wire contract is strict request/response: exactly one request in flight per
connection, and every frame the daemon writes is a response to a frame the
client sent. Approval inverts that direction — the daemon needs to reach the
person while a third party's request is outstanding.

## Scope

Covers: the direction-of-flow decision for approval; the approval families
and their binding to one exact request; which signing families are gated and
which are exempt; timeout, denial and fail-closed behaviour; the
per-connection in-flight discipline that parked responses require; and the
CLI loop that turns the hold connection into the approval channel.

Does not cover: rendering canonical signature inputs into human-meaningful
statements; policy rules, allow-lists or delegation of approval; approval
for reader access (see the decision below); `SO_PEERCRED` or per-client
authority (ADR 0097 Gate D7); platform-keystore unlock (ADR 0081 Gate P3);
biometric or secure-display confirmation; recovery; migrating the remaining
ceremonies onto the daemon, which is the next block and depends on this one;
and any network surface.

## Decision

### Approval travels as a long-poll, not as a server push

The hold connection asks to be told. It issues `approval.wait`, whose
response the daemon parks until either an approval is needed or the wait
window elapses; the person then answers with `approval.decide`, and the loop
repeats. Every frame the daemon writes remains a response to a frame the
client sent, so the ADR 0097 contract keeps its shape exactly.

The rejected alternative was an unsolicited push frame on the hold
connection. It is the obvious design and it is wrong here for a specific
reason: it would force every client parser to distinguish "a response to my
request" from "something the daemon decided to tell me", permanently, on
every family. That ambiguity is a poor thing to introduce into the one
surface whose entire job is to be unambiguous about what was asked and what
was answered. A long-poll buys the same behaviour with no new frame class,
at the cost of one parked request — which the contract already models,
because a request in flight is exactly what a parked response is.

The second rejected alternative, short-polling from a separate connection,
was discarded for adding latency and wasted round-trips while giving up the
property that the approving channel is provably the same connection that
holds the unlock.

### Approval binds to one request, never to a window

A pending approval carries a random approval id, the signing family label,
the key role and fingerprint, and the **BLAKE2b-256 digest of the exact
signature input bytes**. The decision must echo both the approval id and
that digest. A decision whose digest does not match the pending request is
refused, so an approval can never be steered onto bytes other than the ones
it was raised for, and a captured decision cannot be replayed against a
later request.

There is deliberately no "approve for the next five minutes", no "remember
this family" and no batch approval. One approval authorizes exactly one
signature. That is the whole point of the layer: the unlock window already
is the time-based grant, and a second time-based grant on top of it would
add ceremony without adding a decision.

At most one approval is pending daemon-wide. A second gated request while
one is outstanding is refused rather than queued — a queue would invite the
person to approve a backlog they cannot individually attribute.

### Fail-closed in every direction

- **No watcher, no signature.** If no `approval.wait` is parked when a gated
  request arrives, the request is refused immediately. A consumer cannot
  obtain a founding-record signature while nobody is watching the channel.
- **Timeout denies.** An undecided approval is denied when its window
  elapses; silence is never consent.
- **Only the holder decides.** `approval.decide` is accepted only from the
  connection that holds the unlock. Any other connection is refused, so a
  compromised consumer cannot approve its own request.
- **Losing the person loses the approval.** Hold-connection close, session
  lock for any ADR 0097 reason, and daemon shutdown all deny a pending
  approval before they take effect.
- **Losing the consumer drops the approval.** If the requesting connection
  disappears, the pending approval is discarded rather than left for the
  person to answer into nothing.
- **Unknown families are gated.** The exemption list is closed and explicit;
  anything not on it requires approval, so a family added later fails
  towards asking rather than towards signing.

### What is gated, and the line it follows

Approval gates the **creation of new signed authority**, not the use of an
existing capability the person already unlocked. Signing a delegation, a
grant, a revocation, a rotation or a founding record changes what is true
about who may do what, permanently and verifiably, for anyone who later
reads the record. Opening a sealed batch or decrypting an item exercises a
key the person deliberately unlocked to read with, and produces nothing that
outlives the call. Gating the second class would prompt on every catalog
listing and teach exactly the reflex this layer exists to avoid.

Exempt, as a closed list of operational high-frequency families:

| Label | Why exempt |
|---|---|
| `pico.id.possession.v1` | per-session possession challenge; a proof of holding a key, creating nothing |
| `pico.id.reader-key-freshness.v1` | periodic ADR 0085 checkpoints |
| `pico.mem.reader-sync-manifest.v1` | one per ADR 0089 batch |
| `pico.mem.reader-item.v1` | one per memory item written |
| `pico.link.direct.request.v1` | authenticates one short-lived ADR 0107 operation; the semantic record keeps its own approval |

ADR 0108 adds one role-aware operational use without widening that global
label list: `device_signing` may co-sign `pico.home.claim.v2` as fresh
possession proof. The identity root's signature over the same label creates
the authority and remains gated. Everything else the Vault can sign is gated:
key records, delegations, revocations, root-signed claim and founding records,
reader-custody domains, reader and writer grants and their lifecycle
statements, KEK rotations and share envelopes.

ADR 0109 implements a second role-aware possession use without widening the
global label list: `device_signing` may co-sign the exact short-lived
`pico.home.device-activation.v1` target activation. The identity root cannot
sign that label at the Vault role gate. The delegation and revocation root
signatures remain gated one at a time; renewal therefore raises two distinct
approvals.

ADR 0110 decides a third role-aware possession use for its future
`pico.home.device-recovery-claim.v1` target co-signature. That exception does
not exist in runtime until ADR 0110 R3 is implemented: today the unknown
label still fails closed. The global exemption-label list remains unchanged,
and the recovery claim, delegation and revocation root signatures stay gated
one at a time - a recovery therefore raises 2+N distinct root approvals.

Reader access (ADR 0098) stays ungated by the same principle, and this is a
scope decision rather than an oversight: the person's unlock of a
key-agreement key is itself the act of consenting to read with it.

### What the person actually sees, stated honestly

ADR 0106 now adds a mandatory human-readable statement for every gated
signature. The daemon builds both canonical bytes and statement from the same
closed fields; a gated label without a renderer is unsignable. The approval
also retains family label, key role/fingerprint and exact digest. ADR 0109's
delegation statement shows target keys, scopes and both validity bounds, while
revocation states the target/action and warns that the last remote device path
may close.

### Parked responses require in-flight discipline

Parking a response makes the previously theoretical "one request in flight"
rule load-bearing, so it is now enforced per connection rather than only
within a single read. A frame that arrives while that connection's response
is outstanding is a protocol violation and closes the connection. This
closes a gap that predates approval — until now, two requests split across
two reads were both processed — and it is what makes a parked `approval.wait`
safe to leave open.

## Gates

- **P1 — Direction decision: Done.** Long-poll chosen over server push and
  separate-connection polling, with reasons and rejected alternatives
  recorded above; the ADR 0097 request/response shape is unchanged.
- **P2 — Request-bound approval: Done.** Random approval id plus
  BLAKE2b-256 signature-input digest, echoed in the decision and verified;
  one approval authorizes exactly one signature; at most one pending
  approval daemon-wide; no window, batch or remembered approval exists.
- **P3 — Gating policy: Done.** Closed global exempt list of five operational
  families, plus ADR 0108's claim-possession and ADR 0109's
  device-activation exact role-aware co-sign rules; every identity-root use
  and every unknown or newly added family defaults to gated.
- **P4 — Fail-closed behaviour: Done.** No-watcher refusal, timeout denial,
  holder-only decisions, denial on hold loss, session lock and shutdown,
  and discard on consumer loss.
- **P5 — In-flight discipline: Done.** Per-connection in-flight tracking
  rejects a second request before its predecessor is answered, across
  reads.
- **P6 — CLI and tests: Done.** The `unlock` command runs the approval loop
  and prompts on the person's TTY; real-crypto tests cover exempt signing,
  approved signing, denial, timeout, digest mismatch, foreign-connection
  decisions, no-watcher refusal, second-approval refusal, hold loss during
  a pending approval, the in-flight violation and ADR 0109's exact
  role-aware activation boundary.
- **P7 — Done for the implemented families:** ADR 0106 derives statements
  from the signed fields, and claim, checkpoint, envelope, rotation and
  device-lifecycle consumers now use the daemon boundary. Any additional
  surface still defaults to gated and requires its own builder/renderer and
  reviewed role rule.

## Non-goals

- free-form or requester-supplied rendering of signature inputs;
- policy engines, allow-lists, remembered decisions or delegated approval;
- approval for reader access, unlock or lock;
- secure display, biometric confirmation or anti-spoofing of the terminal;
- `SO_PEERCRED`, per-client authority or platform-keystore unlock;
- any network, remote or Pico Link surface, and any compatibility claim for
  these families, which remain part of the local ADR 0097 contract.

## Consequences

Positive:

- the largest named residual of ADR 0097 is closed for the families that
  matter most: a compromised consumer inside an unlock window can no longer
  obtain a founding record, delegation, revocation, grant or rotation
  without the person deciding, per signature;
- the decision is bound to bytes rather than to time, so it cannot be
  widened, replayed or reused;
- the identity-ceremony migration can now proceed onto a gated surface
  instead of needing approval retrofitted underneath it;
- the request/response contract survived a feature that usually breaks it,
  so existing clients need no parser changes;
- in-flight enforcement fixes a real pre-existing gap.

Negative and residual:

- the rendered statement is ordinary terminal output, not a protected
  display; endpoint malware may still spoof it even though the digest and
  signed bytes cannot diverge inside the daemon;
- a terminal prompt can be spoofed by malware that already owns the
  session — endpoint compromise remains outside what this defends against,
  the ADR 0081 honesty restated;
- approval-gated families are unusable without a live hold connection, so
  automated ceremonies must either be exempt or wait for a person;
- a consumer using the ADR 0098 blocking bridge for a gated family must
  raise its request timeout above the approval window, or the bridge will
  give up before the person answers;
- one pending approval at a time means concurrent gated consumers serialize.

## Relationship to other ADRs

- Discharges the ADR `0097` Gate D7 approval item and keeps every other
  part of that contract unchanged, including framing, families, audit and
  the lifecycle rules; it adds the in-flight enforcement that contract
  always implied.
- Implements the per-family approval layer ADR `0081` V4 explicitly placed
  above the custody floor and never below it, and leaves V8 intact.
- Leaves ADR `0098` reader access ungated by an argued principle rather
  than by omission, and inherits its lease and bridge unchanged.
- Gates the ADR `0079`/`0080` identity and Home ceremony families before
  they migrate onto the daemon, which keeps the ADR `0033` posture that
  authority changes are deliberate, signed acts.
- Leaves ADR `0016` primitives untouched; the only new cryptographic use is
  a BLAKE2b-256 digest over bytes the Vault already handles.

## References

- [ADR 0079](0079-pico-identity-and-device-key-threat-model-and-primitive-direction.md)
- [ADR 0080](0080-pico-home-host-key-and-move-in-claim-threat-model-and-ceremony-direction.md)
- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0097](0097-deployable-vault-process-and-local-ipc-authority-boundary.md)
- [ADR 0098](0098-reader-access-lease-over-the-vault-daemon.md)
