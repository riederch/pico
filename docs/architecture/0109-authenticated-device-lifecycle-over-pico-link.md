# 0109 - Authenticated Device Lifecycle Over Pico Link

## Status

Accepted and implemented through gates D1-D5. This ADR decides how an
already admitted Pico identity enrolls, renews and revokes its own delegated
devices over Pico Link. It deliberately does not create a zero-device remote
recovery path: once no active device remains, Link authentication is closed
until a separate, locally activated recovery design exists. ADR 0110 has
since superseded the locally-activated premise and decided recovery as a
Recovery-Card-based, time-locked remote contract; until its gates are
implemented, the closure decided here remains the runtime behaviour.

## Context

ADR 0108 makes the first delegated device part of v2 Home founding. A new
Home therefore starts with one active membership, one root-signed device
delegation, both exact device key records and possession evidence. ADR 0107
can authenticate that device on every Link request without a Foundation
session.

The lifecycle stops there. A second device can currently become known to the
Home only through `POST /api/auth/identity-session`, the deliberately local
Foundation surface. Delegation renewal has no Link delivery path. A
root-signed revocation can be verified and stored by the identity machinery,
but no closed Link operation accepts it. A remote-only Home can therefore be
stranded by the founding delegation's expiry, and a person with another
healthy device cannot remotely revoke a lost one.

ADR 0108 explicitly rejected a permanent pre-authority enrollment operation.
That remains correct. After founding there is already a narrower authority:
an active Home member using an active delegation whose exact signing and
agreement keys are registered. Later-device lifecycle must ride that
authenticated path, not recreate bootstrap.

The remaining fork is recovery. A root-only Link operation would let an
unknown sender reach a lifelong pre-authority surface and would either put the
identity root on the outer Link envelope or treat a root-signed object as a
carrier credential. A Move-In Code, host administration or Relay account
cannot fill that gap under ADRs 0027, 0029 and 0033. The chosen boundary is
therefore explicit: normal lifecycle requires an active delegated sponsor;
zero-device recovery is a different, locally activated ceremony and remains a
later ADR.

## Scope

Covers:

- enrollment of a second or later device for an identity that is already an
  active member of this Home;
- replacement-style renewal of an active device delegation before it expires;
- revocation or retirement of a delegation or device, including a
  self-revocation that leaves no active Link device;
- the signed possession, Home-acceptance, freshness, replay and lifecycle
  ordering evidence for those transitions;
- atomic lifecycle and reader-key projection plus fail-closed restart
  reconciliation; and
- the Link and Vault approval boundaries for the ceremonies.

Does not cover:

- recovery when no active delegated device can authenticate to the Home;
- identity-root loss, compromise, rotation or relationship continuity;
- automatic Domain Content Key rotation, historical erasure or recovery of
  plaintext already available to a revoked device;
- membership issuance or Home administration for another identity;
- Relay transport, public exposure or any compatibility claim; or
- product UI for pairing and local recovery.

## Decision

### Normal lifecycle has three distinct authorities

A successful enrollment or renewal combines:

1. **the identity root**, which signs the existing
   `pico.id.delegation.v1` record and thereby creates device authority;
2. **one active delegated sponsor device**, which authenticates the outer
   `pico.link.direct.request.v1` envelope and authorizes delivery to this
   Home; and
3. **the target device signing key**, which co-signs a short-lived,
   Home-bound activation input and proves possession of the new signing key.

The root-signed delegation binds the target signing and key-agreement
fingerprints. As in ADR 0079, the agreement key has no challenge signature:
it is bound by the delegation and later proves usefulness when a key envelope
can be opened. The target co-signature proves only signing-key possession; it
does not create the delegation.

Revocation deliberately has no target co-signature. A lost or compromised
device cannot be required to consent to its own removal. It combines a
root-signed `pico.id.revocation.v1` statement with an outer Link request from
another active device of the same identity. Self-revocation is also allowed:
the sender is authorized before the transaction and may revoke the
delegation or key that authenticated that request.

In every action the Link principal, membership identity, delegation issuer,
target identity and stored lifecycle issuer must be the same Pico identity.
An active Home Host Pico may not enroll or revoke a different member's
device, and ordinary Home membership does not grant cross-identity lifecycle
authority.

### Two closed authenticated operations, no third pre-authority operation

The Link operation set gains:

- `home.device.lifecycle.read`, returning only the authenticated identity's
  local lifecycle head and its own registered device bindings; and
- `home.device.lifecycle.submit`, accepting one enrollment, renewal or
  revocation transition.

Both pass the unchanged `isAuthorizedSender` gate before dispatch. Neither is
added to the pre-authority set, which remains exactly
`home.setup.read` and `home.claim.submit`. The read result is identity-local
relationship metadata; it is never a registry-currentness or global
completeness claim.

The operation is separate from `home.authority.submit`. That operation is
restricted to the current Home Host Pico and carries Home/domain authority
records. Device lifecycle belongs to the identity whose root signed it, not
to Home administration.

### Target activation and durable Home acceptance are separate signatures

Enrollment and renewal use a new canonical target signature input,
`pico.home.device-activation.v1`. It binds at least:

- activation id and action (`enroll` or `renew`);
- Home id and host signing-key fingerprint;
- Pico identity fingerprint;
- sponsor delegation and both sponsor device fingerprints;
- target delegation and both target device fingerprints;
- the digest of the complete root-signed lifecycle evidence;
- the Home lifecycle head the ceremony observed;
- creation and expiry instants.

The target device signing key signs these exact bytes. The activation lifetime
is at most five minutes and is checked on the Home clock. The outer Link
request retains its existing 30-second ceiling and binds the full transition
arguments by digest. Thus target possession, sponsor delivery and Home
audience are separate bindings rather than adjacent unsigned fields.

After all checks pass, the Home signs
`pico.home.device-lifecycle-receipt.v1`. The receipt binds the transition id
and action, Home/host, identity, exact sponsor and subject, a digest of every
accepted evidence record, the accepted lifecycle head, acceptance instant and
whether the commit leaves no active device. The complete transition,
signatures and receipt are stored as the durable projection root.

The host receipt does not create identity authority; only the root-signed
delegation or revocation does. It proves that this Home accepted those records
while the outer sponsor was active, so a later restart does not need to
reinterpret a subsequently revoked sponsor as if it had never been valid
historically.

### Enrollment, renewal and revocation are precise transitions

**Enrollment** accepts a previously unknown target key pair, one new
root-signed delegation and one matching target activation co-signature. The
delegation must contain `surface_session`; reader-key usefulness still needs
the existing scopes checked by its consumer. Enrollment registers the exact
agreement-key record but grants no domain readership or key envelope.

**Renewal is replacement, not mutation.** It creates a new delegation id and
root-signed delegation, carries a target activation co-signature and
root-revokes the replaced delegation in the same transition. The new reader
binding exists before the old delegation becomes inactive inside the ordered
transaction, while external readers observe only the final commit. An expired
device cannot renew over Link: the sponsor must still be active when the
request arrives. Another active device of the same identity may sponsor the
renewal, but the target must still co-sign.

**Revocation** carries one or more root-signed revocation statements and no
new delegation. Revoking a device signing key makes every delegation naming
that key inactive, including its paired agreement-key use. Stable record ids
are idempotent; the same id with different bytes is a conflict. Historical
signatures remain verifiable and reader-key metadata is not mistaken for
current authorization.

A root signature creates or removes durable authority and remains
approval-gated under ADR 0099. Renewal therefore normally costs two root
approvals: one new delegation and one revocation of the old delegation. That
cost is honest until a separately reviewed composite root record exists.

### Authority creation is head-bound; authentic revocation is never made stale

For enrollment and renewal the transition names the exact locally observed
lifecycle head. The Home accepts it only if that head is still current and
every authority-creating lifecycle order is strictly newer. This is an
optimistic concurrency precondition: two ceremonies based on one head cannot
both add authority.

For one issuer, one `lifecycleOrder` may identify only one distinct statement.
Reusing an order for different delegation or revocation bytes fails closed
during intake, reconciliation and merge. Gaps remain valid because a Home may
not yet have observed every identity statement; the read result is local, not
a global sequence allocator.

Revocations are different. A correctly root-signed revocation remains
security-relevant even when its order is older than the Home's current head.
The Home accepts and merges an authentic non-conflicting tombstone rather than
rejecting it as stale. It may remove authority; it may never recreate it.
External registry freshness remains the ADR 0083/0085 boundary and is not
claimed by this local transition contract.

The semantic defenses survive process restart: bounded Link request replay is
not relied upon. Stable transition ids, immutable evidence ids, the head
precondition for new authority, target expiry and the durable host receipt
make an identical replay idempotent and a changed or stale authority replay
fail closed.

### Acceptance and projection are one transaction

After cryptographic and policy verification, Core precomputes the host receipt
and performs one database transaction.

For enrollment:

1. store the transition and signed host receipt;
2. record the verified delegation evidence; and
3. register the exact target reader key.

For renewal:

1. store the transition and signed host receipt;
2. record the replacement delegation;
3. register its exact reader key; and
4. record the revocation of the replaced delegation.

For revocation:

1. store the transition and signed host receipt; and
2. record every verified revocation.

Any failure rolls back the whole transition. Reader-key rows remain public
registrations, not authority on their own; every Link and envelope-selection
use continues to resolve the current lifecycle index. A revocation therefore
becomes effective in the same commit even if historical key metadata remains.

Boot reconciliation verifies the host receipt, every root signature, exact
key-record fingerprint binding and the target activation signature where
required before rebuilding missing lifecycle or reader-key projections.
Invalid transition evidence quarantines that issuer's device authority rather
than dropping a tombstone and accidentally resurrecting a device.

### Losing Link availability is allowed when revocation demands it

The Home must not refuse revocation merely to preserve availability. If an
available last device self-revokes, the accepting request completes with its
signed response and every later Link request from that device fails. The host
receipt and audit state that no active Link device remains.

If the only active device is already lost, no sender can pass
`isAuthorizedSender`; normal Link lifecycle is intentionally unavailable.
The identity root may not sign the outer envelope, `home.claim.submit` may not
be reused, Setup Mode may not be reopened, and the Move-In Code, Home Host role
or Relay account may not stand in for the missing device.

A later recovery ADR must define an explicitly and locally activated,
one-use Recovery Mode inside Pico, combining identity-root authorization, new
device possession, Home confirmation, durable freshness and visible audit.
It must also define the case where the identity root is unavailable; hidden
continuity is forbidden, so explicit identity replacement may be the only
honest result. No part of that future surface is reserved or implemented here.
ADR 0110 has since decided that contract - keeping every ingredient except
the locally-activated premise, which it supersedes by product decision in
favour of a printed Recovery Card and a time-locked veto window. Its gates
R1-R5 remain unimplemented, so nothing in this runtime changes yet.

### Revocation stops future authority; domain recovery stays separate

Once accepted, a device revocation immediately stops Link authentication and
future reader-key selection through the existing lifecycle checks. It does
not erase already delivered plaintext, retract historical signatures, remove
old envelopes or silently rotate Domain Content Keys.

Core may report affected local domain references and append content-free
lifecycle audit, but rotation remains an explicit domain-controller action
with the existing reader-grant and KEK-rotation records. Device lifecycle must
not become hidden cross-domain automation or overstate retroactive secrecy.

### Approval boundaries stay role-specific

- Existing `pico.id.delegation.v1` and `pico.id.revocation.v1` root signatures
  remain gated one signature at a time.
- `device_signing` may co-sign
  `pico.home.device-activation.v1` without a second approval, as an exact
  role-aware possession exception parallel to ADR 0108's claim co-signature.
  The global ADR 0099 exemption-label list remains unchanged.
- The sponsor's short-lived outer `pico.link.direct.request.v1` signature
  remains operationally exempt.
- The Home host signs its acceptance receipt from host custody; it cannot mint
  the root records the receipt acknowledges.

Approval rendering must show the exact target, scopes, validity and action.
A revocation warning states that the operation may close the last remote
device path. No approval window, remembered decision or default allow-list is
introduced.

## Rejected alternatives

### Identity-root-authorized Link enrollment or recovery

Rejected because the sender is unknown to the Home. It would require a
lifelong third pre-authority operation or identity-root-signed outer Link
envelopes, both already rejected by ADR 0108. A root signature over semantic
lifecycle evidence is necessary but is not a carrier credential.

### Home Host Pico or operator enrolls a member's device

Rejected because hosting and administration are not identity authority. The
Home may verify and acknowledge a root decision for the same authenticated
identity; it may not create that decision for another identity.

### Blocking last-device revocation

Rejected because availability cannot keep a lost or compromised key
authorized. Recovery is a separate action. A user-visible loss of Link access
is preferable to a hidden policy that makes the last key irrevocable.

### Silent renewal or in-place delegation mutation

Rejected because a signed delegation is immutable evidence. Renewal creates a
new id and revokes the old record; overwriting stable signed bytes would make
restore, audit and conflict handling ambiguous.

### Automatic domain-key rotation

Rejected because device authority, domain readership and domain key lifecycle
are separate roles. Rotation can be required by policy, but it remains an
explicit signed domain action and cannot promise historical erasure.

## Gates

- **D1 - Protocol forms and lifecycle conflicts (implemented):** Add canonical target
  activation and host receipt inputs, the durable transition record, exact
  action/evidence digests and authoritative positive/negative vectors. Make
  issuer-plus-lifecycle-order reuse with different statement bytes fail
  closed.
- **D2 - Foundation intake and atomic state (implemented):** Add the two authenticated
  closed Link operations, same-identity/sponsor/target verification,
  head-bound authority creation, non-stale revocation merge, migration and
  ordered atomic projection with rollback and restart-quarantine tests.
- **D3 - Vault ceremonies and approvals (implemented):** Enrollment, renewal
  and revocation clients coordinate distinct root, sponsor and target Vault
  connections. Every delegation/revocation root signature remains separately
  approval-gated; only `device_signing` may sign the exact short-lived
  `pico.home.device-activation.v1` possession input without approval. The
  closed global exemption-label set is unchanged. Rendering pins target,
  scopes, both validity bounds and action, and every identity revocation warns
  that it may close the last remote device path.
- **D4 - Real-process lifecycle proof (implemented):** A spawned Foundation,
  restricted Link listener, root/sponsor Vault and a second Vault containing
  no identity-root keyfile enroll the second device without
  `open-identity-session`. That device delivers a real domain-authority
  ceremony, replacement-renews itself, revokes the first device and then
  self-revokes as the last device. Each superseded sender fails immediately;
  the last accepted response reports `leavesNoActiveDevice`, and all later
  requests remain closed after a real Foundation restart. D2's injected
  reader-projection collision test continues to prove complete transaction
  rollback.
- **D5 - Documentation honesty (implemented):** ADR 0107's threat ledger,
  ADR 0099's role-aware exception, the implementation matrix and handoff state
  the implemented boundary. Zero-device recovery, external lifecycle
  freshness, domain rotation and Relay/public compatibility remain explicitly
  open.

## Consequences

Positive:

- normal device lifecycle uses the authenticated channel the Home already has
  and never widens the pre-authority surface;
- root authority, sponsor delivery, target possession and Home acceptance are
  individually signed and cannot substitute for one another;
- renewal is atomic and revocation cannot be suppressed merely because it
  would remove the last remote path;
- durable transition evidence can rebuild projections without pretending a
  later sponsor revocation invalidated historical acceptance; and
- any active member identity manages only its own devices, preserving the
  Home-admin and domain-readership boundaries.

Negative and residual:

- loss of the only active device remains operationally severe: even a healthy
  identity root has no remote Link carrier until the local Recovery Mode ADR
  exists;
- enrollment needs coordination between sponsor, root and target Vaults, and
  renewal normally needs two explicit root approvals;
- local lifecycle head binding prevents races on this Home but is not a global
  registry or consensus result;
- a stolen still-active sponsor can attempt lifecycle delivery, though it
  cannot create delegation or revocation authority without a separately
  approved identity-root signature;
- device revocation does not retract old plaintext or automatically rotate
  domains; and
- the new contracts remain local and unpublished.

## Relationship to other ADRs

- Extends ADR `0079` without replacing its delegation/revocation families and
  strengthens lifecycle-order collision handling.
- Reuses ADR `0082`/`0083` lifecycle and exact reader-key projection; external
  freshness remains ADR `0085`.
- Keeps ADR `0099`'s global exemption list closed and adds one exact
  role-aware target possession use.
- Generalizes ADR `0108`'s root/device/host separation from first founding to
  later authenticated lifecycle without adding a pre-authority path.
- Adds two explicitly closed operations to ADR `0107`; the carrier, listener
  isolation and unpublished status remain unchanged.
- Applies ADR `0033`: revocation stops future authority, recovery is scoped,
  and lost-device handling neither rewrites history nor rotates domain keys by
  implication.
- Hands zero-device recovery and the identity-replacement boundary to ADR
  `0110`, which keeps this ADR's closure rules and replaces the missing
  sponsor authority with the identity root restored from a printed Recovery
  Card, behind a time-locked veto window.

## References

- [ADR 0033](0033-key-lifecycle-rotation-revocation-and-recovery.md)
- [ADR 0079](0079-pico-identity-and-device-key-threat-model-and-primitive-direction.md)
- [ADR 0082](0082-identity-bound-foundation-sessions-and-domain-read-grants.md)
- [ADR 0083](0083-reader-key-registration-and-freshness-contract.md)
- [ADR 0085](0085-authenticated-reader-key-freshness-checkpoints.md)
- [ADR 0099](0099-hold-channel-approval-for-authority-creating-signatures.md)
- [ADR 0107](0107-pico-link-direct-envelopes-to-the-own-home.md)
- [ADR 0108](0108-the-first-delegated-device-is-founded-with-the-home.md)
- [ADR 0110](0110-recovery-card-and-time-locked-zero-device-recovery.md)
