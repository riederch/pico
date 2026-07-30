# 0110 - Zero-Device Recovery Mode and the Identity-Replacement Boundary

## Status

Accepted; not implemented (gates R1-R5 open). This ADR decides the path ADR
0109 deliberately left missing: how an identity whose Home projects no active
delegated device regains exactly one, through an explicitly and locally
activated, one-use Recovery Mode. It also fixes the boundary recovery must
never cross: a lost identity root is not recoverable, and the honest answer
there is explicit, visible identity replacement - never hidden continuity.

## Context

ADR 0109 completed the authenticated device lifecycle and proved its own
closure: after a last self-revocation, or after losing the only active
device, no sender passes `isAuthorizedSender`, and every stand-in was
individually forbidden - the identity root may not sign the outer envelope,
`home.claim.submit` may not be reused, Setup Mode may not be reopened, and
the Move-In Code, Home Host role and Relay account may not substitute for
the missing device. The D4 test drives a real Home into exactly this state
and shows it survives a Foundation restart. That closure is correct, and
this ADR does not weaken any part of it.

What remains is the person's honest position in that state. They typically
still hold their identity root - a Vault keyfile plus passphrase, restorable
into a fresh Vault on a new machine, because root custody was never device
custody (ADR 0081). They hold a new device. And they can stand in front of
their own Home. No contract combines those three facts into one new
delegated device: the normal lifecycle needs an active delegated sponsor
(ADR 0109's second authority), and the sponsor is gone by definition.

The tree has already solved a problem of this shape once. At founding, a
device unknown to the Home became its first authorized device because
control of the Home's protected display channel plus a one-use code stood
where no membership could yet exist (ADR 0080). Recovery is the same
substitution one level up: local display control plus a one-use code
standing exactly where the missing sponsor device would stand - with the
identity root still required on top, because unlike founding, the identity
already exists and must prove it is itself.

ADR 0109 named the required ingredients: explicitly and locally activated,
one-use, identity-root authorization, new device possession, Home
confirmation, durable freshness, visible audit, and an honest answer for
the rootless case. This ADR decides how they combine.

## Scope

Covers:

- Recovery Mode as a host security state: activation, pinning, lifetime,
  attempt bounds, one-use consumption and restart behaviour;
- the recovery bundle, the recovery claim, root authorization, target
  possession and the Home's signed acceptance;
- total replacement of the recovering identity's device authority;
- atomic projection, durable receipt/session state, boot reconciliation
  and audit;
- approval and rendering boundaries for the ceremony; and
- the identity-replacement boundary when no identity root exists.

Does not cover:

- any recovery without local presence at the Home host - remote or
  relay-carried recovery does not exist and is not reserved here;
- recovery, backup, escrow or social recovery of the identity root itself
  (root custody remains ADR 0081, platform keystores remain its P3);
- member onboarding transport - the replacement path for a member's new
  identity rides that strand, not this mode;
- Home handover or `transferred_or_reissued` governance (ADR 0080 non-goal
  unchanged);
- restoration of domain plaintext beyond what surviving vault custody
  already allows;
- product UI for activation and display (ADR 0027/0105 work); and
- publishing any contract or claiming compatibility.

## Decision

### Recovery Mode is a host security state, entered only by local control

Recovery Mode exists only on a claimed Home; on an unclaimed host Setup
Mode owns the pre-authority surface and the two states are mutually
exclusive by construction. Entering Recovery Mode is an explicit local
action in the ADR 0076/0087 class: it requires demonstrated local control
of the host - the local filesystem or the exact-bound local operator
surface - and is never reachable over Link, Relay or any remote carrier.
The concrete mechanism is Gate R2 work; the property is fixed here.

Activation is an action, not a setting (ADR 0104). No add-on option, no
config file entry and no environment variable may open Recovery Mode or
hold it open; a `PICO_RECOVERY_*` deployment flag must never exist. The
window is something a person does once, not a state a host is configured
into.

Activation pins exactly one recovering identity, which must be an active
member of this Home. Recovery restores device authority for an identity
the Home already knows; it never creates, revives or transfers membership.
At most one window is open per Home; opening a new one supersedes the old,
audibly. A window carries a fresh `recoverySessionId`, the pinned identity,
creation and expiry instants - at most fifteen minutes on the Home clock -
and a Recovery Code with the full ADR 0076 code mechanics: high-entropy
CSPRNG, held host-side as a digest in process memory only, single-use,
attempt-bounded, timing-safe, serialized verification. The Recovery Code is
not the Move-In Code and not the Operator Bootstrap Code, and none of the
three may ever be described as another; it is never key material, never a
key-derivation input and never a durable credential.

Freshness is durable where it must be and volatile where that is safer.
Activation writes a durable session row - id, identity, creation, expiry,
state `open`/`superseded`/`lapsed`/`consumed` - that never contains the
code. The code digest lives only in process memory, so a Foundation restart
lapses every open window and re-activation re-proves local control - the
ADR 0076/0080 restart trade accepted a third time. Boot reconciliation and
backup restore fail closed toward `lapsed`/`consumed`: a restored `open`
row never reopens a window, and a consumed session stays consumed.

### The missing sponsor is replaced by the Home's own display, nothing else

ADR 0109's normal lifecycle combines three authorities: the identity root
creates authority, an active sponsor device authorizes delivery, the
target proves possession. Recovery keeps the first and third signatures
and replaces exactly the second: possession of a one-use Recovery Code
read from the Home's protected local channel, inside an open window,
stands where the sponsor's outer authorization stood. Recovery is
therefore not a weaker enrollment - it demands root authority, target
possession *and* local control of the Home, where normal enrollment needs
no physical presence.

The recovery bundle is displayed through the same protected channel class
that shows the claim bundle (ADR 0027; the current floor is the host
log/console that serves the setup bundle, the product form is ADR 0105
display work). It carries: an endpoint hint, the host signing and
key-agreement pins with the agreement public key, the `recoverySessionId`,
the Recovery Code, the pinned identity fingerprint, the identity's
currently projected device bindings with its local lifecycle head, and the
window expiry. As at claim, the display is the trust root in both
directions: an evil twin fails for lack of the pinned host private keys, a
remote attacker for lack of the code, and no step trusts first use. The
bundle never travels over Link.

### One closed operation, pre-authority only while a window is open

The Link operation set gains `home.device.recovery.submit`, and the
pre-authority set changes from exactly two operations to exactly three.
This amends ADR 0108's consequence wording knowingly, and narrowly: what
0108 rejected - and what stays rejected - is a *standing* pre-authority
enrollment reachable for the Home's entire lifetime. This operation is
inert outside an open window. Whether the mode is closed, the session
unknown or superseded, the window expired, the code wrong or the attempt
budget exhausted, the answer is one indistinguishable refusal
(`recovery_refused`); the distinctions live in bounded local operational
logging and on the local display, never in the remote answer. There is no
recovery read operation: closed-mode probing must look exactly like a
failed attempt.

The intake itself is unchanged: the pinned ADR 0107 verification order,
size and freshness bounds all hold, and the outer
`pico.link.direct.request.v1` envelope is signed by the target device's
signing key - the label stays `device_signing`-only, and the identity root
still signs no outer envelope.

### Root authorization and target possession sign the same recovery claim

`pico.home.device-recovery-claim.v1` is a new canonical family binding at
least: suite, `recoverySessionId`, Home id, both host key fingerprints,
the Recovery Code, the recovering identity fingerprint, the target
delegation id and both target device key fingerprints, the digest of the
complete root-signed evidence set the transition carries (the new
delegation and every revocation), the identity-local lifecycle head the
bundle displayed, and creation/expiry instants of at most five minutes
checked on the Home clock.

The identity root signs these exact bytes, approval-gated. The target
device signing key co-signs the same bytes as a possession proof - the
third role-aware possession use, parallel to ADR 0108's claim co-signature
and ADR 0109's activation co-signature. The intake requires the outer Link
sender's device fingerprints and delegation id to equal the claim's target
binding exactly, so a sealed recovery claim cannot be carried by a
different device (the ADR 0108 lesson, kept). The claim bytes contain the
code and are deliberately not durable; the durable roots are the evidence
records, the host receipt and the session row.

### Recovery replaces the identity's whole device set, never extends it

A recovery transition carries exactly one new root-signed delegation for
the target device, and root-signed revocations for every delegation of the
recovering identity that this Home currently projects as active. If any
active delegation is not covered by a verified revocation, the transition
is refused. Recovery ends with the identity holding exactly one active
device: the recovered one.

This is the central fork of this ADR, and it is decided for loudness:

- a root thief who also reaches the house cannot recover *silently* -
  every legitimate device of that identity stops working at commit, so the
  person notices in minutes, with durable audit of what happened;
- recovery serves the stuck-but-formally-active states ADR 0109 names
  (a broken or inaccessible device whose delegation has not expired), not
  only the strictly zero-active state;
- recovery can never become a convenience enrollment beside ADR 0109:
  adding a device to a healthy set remains sponsor work, because using
  recovery for it costs the rest of the set.

Surviving healthy devices are not special-cased: they re-enroll through
the normal ADR 0109 path with the recovered device as sponsor. Delegations
this Home never observed cannot be revoked by this rule - a stated
residual, bounded by ADR 0109's head-bound authority creation, and the
non-stale revocation merge remains available for tombstones that arrive
later. Authority creation in the recovery transition is head-bound and
strictly-newer exactly as in ADR 0109; the head the root signed over is
the one the bundle displayed.

### Acceptance, receipt, projection and consumption are one transaction

After full verification the Home signs
`pico.home.device-recovery-receipt.v1`, binding: the `recoverySessionId`,
Home and host, the identity, the exact target delegation and key
fingerprints, a digest of every accepted evidence record, the accepted
lifecycle head, the acceptance instant, and the statement that the commit
leaves exactly one active device for this identity. Core then performs one
database transaction, in order:

1. store the transition and signed host receipt;
2. record the new delegation evidence;
3. register the exact target reader key;
4. record every revocation; and
5. mark the session row `consumed`.

Any failure rolls back the whole transition and does not consume the
window; verification refusals never consume the code (the ADR 0108 rule),
though each failed code presentation spends attempt budget. The host
receipt creates no identity authority - only the root-signed records do;
it proves this Home accepted them through an open window it had itself
displayed, which is the "Home confirmation" ADR 0109 required, made
structural rather than interactive.

Restart reconciliation re-verifies the receipt, every root signature and
the target co-signature before re-projecting; manipulated recovery
evidence quarantines that issuer's device authority rather than resurrect
or drop records selectively (the ADR 0109 rule). `home.device_recovered`
is reserved as a server-synthesized, content-free append-only event type
(fingerprint references only). Window activation, supersession, lapse and
failed attempts stay in bounded operational logging: a local attacker
toggling the mode must not grow the undeletable log (A9), and the one
append-only entry per identity capture is exactly the visibility the
person needs.

### Approval and rendering boundaries

- The root signatures on the recovery claim, the new delegation and every
  revocation remain gated one at a time under ADR 0099. A recovery
  normally costs 2+N root approvals for N revoked delegations - honest,
  and unchanged until the separately reviewed composite root record ADR
  0109 already names exists.
- `device_signing` may co-sign exactly
  `pico.home.device-recovery-claim.v1` without an additional approval, as
  the third role-aware possession use. The global ADR 0099 exemption-label
  list remains unchanged.
- Approval rendering must state, from the signed bytes: which identity is
  recovered, at which Home, for which target device, and that every other
  device of that identity is revoked by this ceremony - the loudest
  warning in the tree, because it is the most consequential signature a
  root routinely makes.
- The Home host signs its receipt from host custody and cannot mint the
  root records it acknowledges.

### No root, no recovery: replacement is explicit and visible

Recovery Mode authenticates the identity root. Without the root it must
refuse - not degrade into a weaker check, not accept a quorum of other
evidence, not let the window itself become authority. When the root is
lost, the honest outcomes are:

- **A member identity.** The person creates a new identity in a new Vault.
  The Home Host Pico evicts the old identity's membership - a signed,
  visible membership lifecycle statement, coupling to ADR 0078 K5 rotation
  debt wherever the old identity held readership - and admits the new
  identity through member onboarding. Nobody can root-revoke the lost
  identity's delegations; membership eviction is the Home-side kill
  switch, and it is sufficient because `isAuthorizedSender` requires
  active membership. The new identity is a new identity: no record may
  assert it is the old one, and continuity of name or relationships is a
  visible product fact, never a cryptographic claim.
- **The Home Host Pico.** With the founder root lost, the Home is
  governance-dead: no membership issuance, no eviction, no authority
  ceremonies. The honest exit is the explicit local home reset and a new
  founding - a new `homeId` and visible discontinuity (ADR 0080 H7).
  Members keep the plaintext and custody their vaults already hold;
  ciphertext whose key custody died with the founder's Vault is lost, and
  recovery must not overstate otherwise. A future signed governance or
  transfer flow (ADR 0080's `transferred_or_reissued` non-goal) may later
  soften this; silently substituting a new root under the old identity or
  the old `homeId` is forbidden regardless.

The Home role, the exact-bound operator, the Move-In Code, a Relay account
and possession of host storage grant no recovery authority, singly or
combined (ADR 0033 verbatim). What cannot be recovered is stated rather
than implied: the identity root itself; the Recovery Code after its
display; domain plaintext whose keys existed only in lost custody; and
identity continuity across root loss.

## Rejected alternatives

### Root-authorized Link recovery without local activation

Reaffirms ADR 0108/0109: the sender is unknown, so this needs a standing
pre-authority operation or root-signed outer envelopes, both already
rejected - and it would let a stolen root keyfile capture a Home from
anywhere on earth, silently. Local presence is the deliberate second
authority, and its cost (travel to the Home) is accepted, not accidental.

### Reusing `home.claim.submit` or reopening Setup Mode

The claim is founding: it mints membership from empty-house trust that no
longer exists once the Home is claimed and inhabited. The Move-In Code's
single meaning is a claim right (ADR 0027), and ADR 0076's rule that no
code may be described as another extends to not letting one become
another operationally. Recovery gets its own family, code and mode.

### A durable or standing recovery window

A window that survives restarts or stays open indefinitely is a setting in
disguise (ADR 0104) and a silent standing attack surface. The window is
process-local, short, one-use and audited; only its consumption and audit
are durable.

### Additive recovery that keeps other devices active

Rejected for silence: a root thief with house access could add a device
while every legitimate device keeps working, and the sponsor requirement
of ADR 0109 would become advisory for anyone who can reach the display.
Total replacement makes the same attack loud and self-announcing.

### A zero-active-device precondition instead of total replacement

Refusing recovery while any delegation is formally active strands exactly
the states ADR 0109 lists as operationally severe - a device that is
active on paper and unusable in hand - and buys no security that total
replacement does not already provide.

### Host- or operator-authorized recovery

Hosting and administration are not identity authority (ADR 0024/0033/
0080/0087). The local activator opens a carrier window; only the identity
root fills it. An operator or host key that could mint device authority
would be the universal recovery secret ADR 0033 forbids.

### Recovery secrets, social recovery or root escrow at the Home

Out of scope and rejected as Home features: any secret stored at the Home
that can recreate identity authority collapses the role separation. Root
backup and custody remain person-side Vault work (ADR 0081), with platform
keystores as its named future.

## Threat ledger

| Attacker | Posture |
|---|---|
| Remote attacker holding a stolen root keyfile and passphrase | Cannot open, probe or distinguish a window over Link; the code exists only on the local display. Recovery requires root x local control x device possession. |
| Local person at the display without the root | The window is inert: nothing can sign the recovery claim. Attempts are bounded and logged. Local control remains destruction-capable (reset) and never identity-capable. |
| Root thief with house access | Can capture the identity's device authority - and every legitimate device dies at commit, with a durable append-only record. The response to root compromise remains identity replacement (ADR 0033); recovery is deliberately not quiet enough to hide it. |
| Evil-twin recovery endpoint | Fails for lack of the pinned host private keys; pins come from the protected display, no trust-on-first-use (ADR 0080 H2 family). |
| Replay and restart attacker | The claim binds session, code, head and expiry; session ids and consumption are durable; open windows lapse at boot; the ADR 0107 request bounds are unchanged beneath it. |
| Stale-backup attacker | A restored `open` session row reconciles to `lapsed`; a restored pre-recovery lifecycle reconciles toward the freshest statements (ADR 0079 I9); revocations merge non-stale (ADR 0109). |
| Malicious co-resident or local DoS | Can open and burn windows: bounded operational logging, no append-only growth, no authority gained; supersession is visible on the display and in the logs. |

## Gates

- **R1 - Protocol forms and vectors (open):** canonical
  `pico.home.device-recovery-claim.v1` and
  `pico.home.device-recovery-receipt.v1` layouts with authoritative
  accept/reject vectors: wrong or stale code, cross-session and cross-Home
  transplants, head mismatch, outer-sender/target mismatch, an active
  delegation left uncovered by revocations, root/device role swaps, and
  refusal of claim-family reuse. The durable transition record pins action
  and evidence digests as in ADR 0109 D1.
- **R2 - Foundation window and intake (open):** the durable session state
  machine (`open`/`superseded`/`lapsed`/`consumed`), memory-only code
  digest with ADR 0076 verification bounds, local activation via
  demonstrated host control, the mode-gated pre-authority operation with
  the single `recovery_refused` remote reason, the ordered atomic commit
  with injected-failure rollback proof, lapse-on-boot, restore
  reconciliation and issuer quarantine on manipulated evidence.
- **R3 - Vault ceremony and approvals (open):** a recovery ceremony
  coordinating the root Vault (restored keyfile) and target device Vault,
  which may be one process; bundle/code entry; per-record root approvals
  with the total-replacement warning rendered from the signed bytes; the
  exact role-aware `device_signing` co-signature exception with the global
  exemption list unchanged.
- **R4 - Real-process proof (open):** starting from the ADR 0109 D4
  zero-device closure, remote recovery attempts fail indistinguishably;
  local activation, display-bundle transfer and recovery through the
  isolated Link listener leave exactly one active device; every previous
  sender stays dead; the state survives a Foundation restart; an injected
  commit failure proves rollback with an unconsumed window; a second
  submission against a consumed session fails.
- **R5 - Documentation honesty (open):** ADR 0107's threat ledger, ADR
  0099's exception note, the implementation matrix and the handoff state
  the implemented boundary, including what recovery still cannot do and
  the identity-replacement boundary.

## Consequences

Positive:

- ADR 0109's closure gets its counterpart without being weakened: Link
  stays closed to every stand-in, and the recovery path demands strictly
  more than normal enrollment ever did - root authority, new-device
  possession and physical control of the Home;
- silent identity capture through recovery is structurally impossible:
  total replacement makes every successful recovery loud, visible on the
  display, in the lifecycle and in the append-only audit;
- the pre-authority surface grows by exactly one operation that is inert
  outside a locally opened, short-lived, one-use window - the founding
  pattern, not the standing-enrollment pattern ADR 0108 rejected;
- the rootless case stops being an implied gap: replacement semantics are
  decided, visible and honest, including the governance-dead-Home answer;
- every mechanism reuses proven machinery - ADR 0076 code mechanics, ADR
  0080 display trust, ADR 0107 intake order, ADR 0109 transitions,
  receipts and reconciliation - with no new cryptography.

Negative and residual:

- recovery requires standing at the Home: a person traveling with zero
  devices stays stranded until they reach it, and the future relay
  deliberately changes nothing about that;
- a recovery costs 2+N root approvals and forces surviving healthy devices
  to re-enroll - the price of loudness, stated rather than optimized away
  prematurely;
- a root thief who also reaches the house can capture the identity's
  device authority; recovery makes this loud, not impossible - root
  custody remains the real boundary (ADR 0081);
- root loss keeps its full cost: a member's replacement waits on member
  onboarding transport, a founder's loss means a new Home, and lost key
  custody means lost plaintext;
- the mode adds durable session state, a third pre-authority operation and
  a second one-use code whose distinctness from the Move-In Code must be
  actively maintained in code, display and language;
- until R1-R5 exist, none of this runs: the zero-device state remains
  operationally terminal in the current runtime.

## Relationship to other ADRs

- Realizes ADR `0033`'s recovery boundary: scoped restoration of device
  access with explicit revocation of old authority, audited, distinct from
  impersonation, and preferring visible identity replacement over hidden
  continuity when the root is gone.
- Reuses ADR `0076`'s code and reset mechanics and ADR `0080`'s display
  trust, code separation and reset semantics; the founder-loss exit is
  H7's reset-means-new-Home made explicit for the rootless case.
- Consumes ADR `0079` families unchanged: recovery carries ordinary
  root-signed delegations and revocations; I9 reconciliation and the ADR
  `0109` head/merge rules govern them.
- Leaves ADR `0087` intact: local activation is host-infrastructure
  action; the operator can open a window and never fill one.
- Keeps ADR `0099`'s global exemption-label list closed and adds one exact
  role-aware possession use for the recovery claim co-signature.
- Applies ADR `0104`: Recovery Mode is an action with a window, never a
  host configuration entry, and its activation surface is local by
  construction.
- Extends ADR `0107` by one closed operation without touching the pinned
  verification order; the bundle, code and window stay off the wire.
- Amends ADR `0108`'s "no third pre-authority operation, now or later"
  consequence narrowly: the rejection of a *standing* pre-authority
  enrollment stands; the set gains one mode-gated, one-use member.
- Discharges ADR `0109`'s recovery deferral exactly as scoped there:
  locally activated, one-use, root-authorized, possession-proven,
  Home-confirmed, durably fresh, visibly audited - and defines the
  rootless replacement boundary it demanded.

## References

- [ADR 0027](0027-dedicated-pico-home-image-and-first-boot-setup.md)
- [ADR 0033](0033-key-lifecycle-rotation-revocation-and-recovery.md)
- [ADR 0076](0076-foundation-operator-credential-session-and-bootstrap-mechanics.md)
- [ADR 0079](0079-pico-identity-and-device-key-threat-model-and-primitive-direction.md)
- [ADR 0080](0080-pico-home-host-key-and-move-in-claim-threat-model-and-ceremony-direction.md)
- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0087](0087-foundation-operator-home-host-authority-consolidation.md)
- [ADR 0099](0099-hold-channel-approval-for-authority-creating-signatures.md)
- [ADR 0104](0104-settings-belong-to-pico-not-to-host-configuration.md)
- [ADR 0107](0107-pico-link-direct-envelopes-to-the-own-home.md)
- [ADR 0108](0108-the-first-delegated-device-is-founded-with-the-home.md)
- [ADR 0109](0109-authenticated-device-lifecycle-over-pico-link.md)
