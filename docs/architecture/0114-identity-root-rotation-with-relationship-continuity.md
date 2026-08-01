# 0114 - Identity Root Rotation with Relationship Continuity

## Status

Accepted; partially implemented. Gate T1 - the canonical
`pico.identity.rotation.v1` form, its verification and authoritative
vectors - landed with this ADR, and gate T2 - the Foundation projection,
the device co-signature, the veto window and boot re-verification - and
gate T3 - the successor's first device and the re-issue debt - and gate
T5 - what a second Home may assume - have since followed; T4 is open on
ADR 0105 B2/B3. This ADR closes the
sharpest residual ADR 0110 named: today the only answer to a stolen
Recovery Card is explicit identity replacement, which throws away every
relationship the person had. Both decisions taken here were made
explicitly by the user on 2026-08-01: rotation grants eligibility and
issuers re-issue, and this block implements the canonical form.

## Context

ADR 0033 required that identity replacement "preserve relationship
continuity only through signed, verifiable transition records or another
reviewed continuity mechanism", and forbade resting it on Relay account
control, Home host control, Home Host Pico authority, Move-In Code
possession or transport identifiers. It never said what the record is.
ADR 0079 deferred the mechanism on the grounds that it "needs the
relationship layer to mean anything" - and that layer now exists:
memberships, membership credentials, reader-custody domains, reader
grants and device delegations all bind an identity fingerprint.

ADR 0110 made the gap concrete. A Recovery Card is the identity root on
paper behind a short PIN; a stolen card is root compromise, and the
stated remedy - root rotation with continuity - "does not exist yet",
so a stolen card forces explicit replacement.

The hard part is not the record. It is that rotation exists *because*
the old root may be compromised, while the only credential that can
authorize "this new root continues that identity" is the old root
itself. After a card theft two parties hold it, both can sign a
rotation to a root they control, and a signature check cannot tell them
apart.

## Scope

Covers: the rotation record and what it proves; what breaks the tie
between two holders of the same root; what a verified rotation does to
existing relationships and to the old root's authority; which identities
may rotate this way; and the residuals.

Does not cover:

- rotating the founder's root, which changes the Home's own governance
  root and is Home handover - ADR 0080's named non-goal, with the
  membership status `transferred_or_reissued` already reserved for it,
  and refused by the projection rather than merely left unbuilt;
- device key rotation, which is delegation work and already possible;
- domain content-key rotation (ADR 0078), which rotation may trigger but
  does not replace;
- cross-Home propagation, which needs a transport that does not exist
  (ADR 0031 Relay stays future) - what a second Home may assume in the
  meantime is decided below, and it is not propagation; and
- any change to canonical bytes, approvals or custody outside the new
  family.

## Decision

### One record, signed by both roots

`pico.identity.rotation.v1` binds: suite, a fresh rotation id, the old
identity-key fingerprint, the new one, the ordering context, and the
rotation instant. The old root signs it - that is the authorization,
and it is the only thing that can be. The new root signs the same bytes
- that is possession, and without it the old root could name a key
nobody holds. Both are full-length fingerprints over key records that
bind suite and role (ADR 0079 I5), so a device key can never be named
as the successor of a root.

The record is a labeled, length-prefixed layout in the ADR 0073/0079
style, verified with no parser in the trust path, and its bytes are
published here before they carry any weight. The authoritative vector,
for

```json
{
  "suite": "pico.suite.id.v1",
  "rotationId": "rot_01hzx8m9q4rt5v",
  "predecessorIdentityKeyFingerprintHex":
    "66e6e80bcd9fc83d805ac5f7d9021aa10fb1166671c05ca9148bc92ac6e73616",
  "successorIdentityKeyFingerprintHex":
    "9d1f2b7c4a05e83641bd2f90c7ae5138aa04f6b2c9d3e7f108526b4ac0d19e75",
  "reasonCategory": "suspected_compromise",
  "rotatedAt": "2026-08-18T08:00:00.000Z",
  "lifecycleOrder": "seq:0000000000000009"
}
```

is 219 bytes:

```text
000000197069636f2e6964656e746974792e726f746174696f6e2e7631000000107069
636f2e73756974652e69642e763100000012726f745f3031687a78386d39713472743576
0000002066e6e80bcd9fc83d805ac5f7d9021aa10fb1166671c05ca9148bc92ac6e73616
000000209d1f2b7c4a05e83641bd2f90c7ae5138aa04f6b2c9d3e7f108526b4ac0d19e75
000000147375737065637465645f636f6d70726f6d69736500000018323032362d30382d
31385430383a30303a30302e3030305a000000147365713a30303030303030303030303
030303039
```

The test suite recomputes these bytes and fails if they ever move, the
same discipline ADR 0079 G1 applies to its own families.

### A living device breaks the tie, and a veto window makes the attempt loud

A rotation additionally requires a co-signature from a device the
identity currently has delegated and active, and it becomes effective
only after a veto window during which any other active device of that
identity may refuse it.

This is deliberately the same shape as ADR 0110, because it is the same
threat with the same asymmetry: a card thief holds the root but not the
person's living devices. The consequence is a sequence rather than a
shortcut - a thief who wants to rotate must first complete a recovery,
which costs 48 hours, is alarmed to every living device, can be vetoed,
and loudly revokes the legitimate device set on success. Rotation adds
no quieter path to the same power.

It also means an identity with zero active devices cannot rotate. That
is correct rather than unfortunate: such a person recovers first (ADR
0110 gives them exactly one device), and rotates afterwards.

### Rotation grants eligibility; issuers re-issue

A verified, effective rotation does two things and no more.

It **ends the old root's authority** from the rotation instant. Every
delegation the old root issued stops being honored; the old root can
create no new authority. That is not the Home overriding anybody - the
old root signed exactly this, so it is a mass revocation with the only
authorization that could exist for it.

It **makes the new root eligible** as the same person, so every issuer
can re-issue its own records: the Home Host Pico re-issues membership
through the existing ceremony, a domain owner re-issues reader grants,
and the new root issues fresh device delegations. Nothing is silently
rebound. A membership row keeps naming the subject its credential names,
a reader grant keeps naming the reader its signature names, and no
projection diverges from its evidence - the discipline the rest of this
codebase holds.

The cost is stated rather than hidden: a rotating member depends on the
Home Host Pico acting, and where that is another person, the member
waits for them. Rebinding the Home's own records automatically would
remove that wait, and was rejected because it would put Home
administration into identity continuity and make a projection disagree
with the credential behind it.

### A second Home decides for itself, and says so

The rotation record names no Home. That absence is deliberate and is the
whole of what can be done without a transport: the record is
self-authenticating, so a person can carry it to their other Homes by
any means at all - a file, a scan, a re-run of the ceremony - and each
Home can verify it with no channel to the first.

What does not travel is the *decision*. A rotation presented to a second
Home runs that Home's own test: a device that Home currently knows as
delegated and active must co-sign, and that Home's own veto window must
pass, during which that Home's other devices may refuse. A rotation
accepted elsewhere confers nothing here, and a row that arrived as data
rather than as a ceremony - a database restored from another Home, two
databases merged - decides nothing in either direction. It is ignored,
counted and named at boot, because a merged database must not read as an
empty one.

The tempting shortcut is to honor the retirement half alone: the old
root signed "I am no longer authoritative", so a second Home could act
on that without any local device. It is refused. A card thief would
otherwise hold a cheap global lockout - present the rotation everywhere,
and the owner loses every Home at once, exactly where they have the
least ability to object. The same asymmetry that decides this at the
first Home decides it at every other one.

The consequence is stated rather than smoothed: a person can be rotated
at one Home and not at another, and no code can hide that. A Home that
never saw the rotation keeps honoring the old root - which is the
residual, unchanged, and the reason the rotation should be carried to
every Home the person uses. Absence of a rotation is a Home saying "not
here", never "not anywhere".

### What rotation does not repair

A Recovery Card pins the identity root. Every card printed before a
rotation restores a root that is no longer the identity, so rotation
obsoletes them and issuing a new card is part of finishing it. Between
the two there is a window with no valid card, and the product must say
so rather than let a person discover it in an emergency.

## Gates

- **T1 - Canonical form and vectors (implemented with this ADR):**
  `pico.identity.rotation.v1` layout, dual-signature verification, and
  authoritative accept/reject vectors covering role swap, suite
  downgrade, a foreign root as predecessor or successor, self-rotation,
  fingerprint/key-record mismatch and ordering violations.
- **T2 - Foundation projection (implemented):** durable rotation
  records, the old root's authority ending at the rotation instant, the
  device co-signature and veto window, and boot reconciliation that
  re-verifies a stored rotation before honoring it. Authority ends at
  the single choke point every device authorization already passes
  through, so no surface can be granted separately; the lifecycle view
  reports the affected devices as revoked rather than hiding them. The
  co-signing device may not veto its own rotation, a pending rotation is
  refused rather than superseded, and the founder's root is refused
  outright as ADR 0080 handover. A stored record that no longer verifies
  against its own columns and signatures withdraws that identity's
  device authority instead of being honored or silently dropped.
- **T3 - Re-issue path (implemented):** the successor's first device and
  the re-issue debt. Because the rotation revokes every device the old
  root delegated, the record must name the device the successor root will
  hold, delegated by that root itself - otherwise the ceremony meant to
  save the person locks them out, and no path back exists: enrollment
  needs an active sponsor device of the same identity, and a fresh root
  has none. Naming it at submission rather than afterwards also means the
  devices that may veto see the whole consequence - which root, and which
  device it leaves - while they can still object. It is projected when
  the window passes, re-verified on boot with the same suspicion as the
  rotation itself, and its reader key follows the moment membership is
  re-issued rather than at the next restart. What each issuer still owes
  - membership, reader grants, the pending reader key - is a view, so
  "you wait for your issuers" is a statement the product can make rather
  than a silence. Re-issue itself needs no new mechanism: the unchanged
  membership and read-grant ceremonies name the successor as their
  subject, and a grant the controller has not re-issued stays unreadable.
- **T4 - Ceremonies and product surface (open):** the person-side
  rotation ceremony with ADR 0106 rendering and ADR 0099 approvals, the
  veto surface, and forced Recovery Card re-issue - as ADR 0112
  surfaces, not as a terminal.
- **T5 - Cross-Home honesty (implemented):** a rotation record names no
  Home, so it travels; the decision does not. Every read and write of a
  rotation is scoped to the Home that accepted it, the row identity is
  the pair, and a rotation carried in as data is ignored, counted and
  named at boot rather than honored or hidden. Presenting the same
  signed record to a second Home is a fresh local ceremony with its own
  window and its own vetoing devices - proven with two independent Homes
  where the same record takes effect at one and is vetoed at the other.
  The bare retirement half is deliberately not honored without the local
  test, because a card thief would otherwise hold a global lockout.

## Threat ledger

| Attacker | Posture |
|---|---|
| Card thief with the root but no device | Cannot rotate: the co-signature requires a currently delegated, active device. Getting one means completing an ADR 0110 recovery first - 48 hours, alarmed, vetoable, and loud on success. Rotation adds no quieter path. |
| Card thief who already completed a recovery | Holds root and the one device that recovery left. Rotation is then possible, and the owner has already lost the identity at the recovery step; rotation changes nothing about that. The defence remains the recovery veto window, not this ADR. |
| Owner and thief racing to rotate | Both hold the old root, so both can sign. The veto window plus the device requirement decide it: the owner's living devices see the attempt and can refuse it. Neither silently wins. |
| Malicious Home host | Cannot mint, authorize or veto a rotation, and cannot rebind a relationship - re-issue is the issuer's act. It can withhold service, as always. |
| Anybody with write access to the database | Editing a rotation row is the way to end an identity's whole device authority without ever holding its root. Boot re-verifies every stored record against its own columns and both signatures; one that fails withdraws that identity's device authority until a human re-establishes it, so the forgery decides nothing either way. Write access to the Foundation database remains a compromise of the Home, not a defended position. |
| Relying party that never saw the rotation | Still honors the old root, and says "not here" rather than "not anywhere". Cross-Home propagation has no transport; the record can be carried by hand and re-decided locally, which is all that is claimed. |
| Thief presenting a stolen rotation at every Home | Gains nothing without a living device at each: the retirement half is not honored on its own, precisely so that one stolen card cannot lock a person out of every Home at once. |
| Holder of an old Recovery Card after rotation | Restores a root that is no longer the identity - the card is dead, not dangerous. |
| Somebody naming the successor's first device | Cannot: the delegation must verify under the successor root's own key record, which the rotation binds to the successor fingerprint, so a predecessor-signed device is refused. The agreement key must be the one that delegation names, so the device that becomes readable is the device that was authorized. |

## Consequences

Positive:

- ADR 0110's sharpest residual gets an answer that keeps relationships,
  instead of explicit replacement discarding them;
- the answer reuses ADR 0110's proven asymmetry rather than inventing a
  second trust mechanism;
- ending the old root's authority is self-authorized, so no Home-side
  power is created to do it;
- projections keep matching their evidence, because nothing is rebound.

Negative and residual:

- a rotating member waits for its issuers, and where the Home Host Pico
  is another person, on them - the wait is named by a debt view rather
  than left for the person to discover;
- a rotation cannot be submitted without naming the successor's first
  device: one more thing to have ready at the ceremony, and the price of
  never stranding the person it was meant to protect;
- rotation is per-Home until a transport exists; a second Home keeps
  honoring the old root until the record is carried there and decided
  locally, which is an identity split this ADR names, enforces honestly
  and cannot close;
- every Recovery Card is obsoleted, with a window before the new one is
  printed;
- the founder's root still cannot rotate - that stays Home handover;
- a thief who has already completed a recovery is not stopped here, and
  should not be: that battle is fought in ADR 0110's veto window.

## Relationship to other ADRs

- Realizes the continuity mechanism ADR `0033` required and left
  unspecified, honoring its list of what continuity may not rest on.
- Closes the rotation gap ADR `0079` deferred until a relationship layer
  existed, and keeps its I5 full-length role-bound fingerprint rule.
- Answers ADR `0110`'s stolen-card residual, and inherits its device
  asymmetry, veto delay and loudness rather than duplicating them.
- Leaves ADR `0080`'s handover non-goal intact: the founder's root is out
  of scope, and `transferred_or_reissued` stays reserved for it.
- Triggers ADR `0078` rotation debt where a rotated reader loses grants;
  it does not replace domain-key rotation.
- Surfaces through ADR `0112`, never through a terminal or the
  Foundation HTTP surface.

## References

- [ADR 0033](0033-key-lifecycle-rotation-revocation-and-recovery.md)
- [ADR 0078](0078-memory-domain-reader-membership-and-key-distribution-threat-model-and-direction.md)
- [ADR 0079](0079-pico-identity-and-device-key-threat-model-and-primitive-direction.md)
- [ADR 0080](0080-pico-home-host-key-and-move-in-claim-threat-model-and-ceremony-direction.md)
- [ADR 0110](0110-recovery-card-and-time-locked-zero-device-recovery.md)
- [ADR 0112](0112-recovery-product-surfaces-in-the-background-companion.md)
