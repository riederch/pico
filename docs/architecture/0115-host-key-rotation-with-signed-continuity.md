# 0115 - Host-Key Rotation with Signed Continuity

## Status

Accepted; partially implemented. Gate U1 - the continuity record over the
published `pico.home.continuity.v1` bytes with triple-signature
verification and vectors - and gate U2 - the Foundation projection with
era-aware verification and boot re-proving - land with this ADR; U3's
Foundation half - key staging, the two Link operations, the crash-safe
custody swap and the audit - has since followed. U3's ceremony-client
half (ADR 0106 rendering, ADR 0099 approval, the CLI wrapper) and U4
(client re-pin) are open. The
era rule and this block's scope were decided explicitly by the user on
2026-08-01: the accepted chain vouches for records of earlier eras, and
clients re-pin in a later block.

## Context

ADR 0080 H7 decided the shape and left it unbuilt: "Host-key rotation or
host migration preserves the `homeId` only through a continuity
statement signed by the outgoing host key and accepted by the Home Host
Pico." The canonical `pico.home.continuity.v1` bytes exist with an
authoritative fixture; nothing consumed them. ADR 0033 requires host-key
rotation to be defined; ADR 0110 names the consequence of not having it:
a Recovery Card pins the host keys, and "printed pins go stale on
host-key rotation until continuity verification" - with no continuity
verification to speak of.

Meanwhile the host signing key is pinned everywhere: the founding
record, every membership activation, every domain read grant, the
reader-custody family, device lifecycle and recovery receipts, every
Pico Link audience, the operator's home binding, and the Recovery Card.
The stated ADR 0072-family residual is the reason this must exist: a
copied host disk yields the host keys, and with them continuity
impersonation until rotation and member re-acceptance exist.

The structural fact the design rests on, from ADR 0080's asymmetry: the
host key activates and enforces, but it never mints authority. Every
authority signature - membership issuance, grant issuance, founding
acceptance - is the Home Host Pico's. A thief of the host disk could
therefore never create valid memberships alone, which is what makes both
the tie-break and the era rule below sound.

## Scope

Covers: the continuity record and its verification; the Foundation
projection of the host-key chain; what existing records mean after a
rotation; what refuses a rotation; and boot re-proving.

Does not cover:

- the ceremony client - the Home Host Pico's ADR 0099 approval over ADR
  0106 rendered statements and the transitional CLI wrapper (U3's open
  half; staging, the Link operations and the custody swap are in);
- client re-pin - how a vault daemon, companion or member device learns
  and verifies the new head (gate U4), including member notification,
  which stays the ADR 0080 M3 residual until then;
- Recovery Card re-issue after rotation - the obligation is ADR 0110's
  and its product surface is ADR 0112's; U3 must trigger it;
- rotating the Home Host Pico's root (ADR 0114's founder exclusion:
  that is Home handover, ADR 0080's non-goal).

## Decision

### One link, three signatures

A continuity record carries the published `pico.home.continuity.v1`
bytes and three detached signatures over exactly those bytes: the
outgoing host key retiring itself - only the key being retired can
authorize its own retirement; the incoming host key proving it exists -
a statement naming a key nobody holds would brick the Home at the
rotation instant (the ADR 0114 possession lesson applied to the Home's
own keys); and the Home Host Pico accepting the succession. The
acceptance is the tie-break: a thief of the host disk holds the outgoing
key and can sign a continuity statement to a key they control, but the
acceptance signature lives in the person's Vault, not on the host disk.
Key records bind fingerprints to suite and role (ADR 0079 I5), so a
person root cannot stand where a host key belongs, nor a host key where
the person's acceptance belongs. Rotation to the same key is refused as
meaningless. The key-agreement fingerprints are named under all three
signatures but not possession-proven - X25519 keys do not sign; the same
posture the founding record takes.

### The chain is the Home's key history, and it forks for nobody

The Foundation stores accepted links as a chain from the founding
record's host keys. A link must retire exactly the current head - both
fingerprints - or it is refused as a gap: two presents, both "proven",
is precisely what H7 exists to prevent. Its lifecycle order must advance
past the previous link's. The claim state's host pins move to the new
head in the same transaction that stores the link, so there is no
instant at which the Home claims two heads. A pending device recovery
refuses rotation: the recovery has embedded the current pins in its
claim, is time-critical, and cannot be re-signed; the rotation can wait.

### The chain vouches for the era; only the head stamps anything new

Existing records whose host fingerprint belongs to the accepted chain
stay valid - memberships, grants and receipts of an earlier era are
re-verified against the whole chain at boot, not against the founding
key alone and not against the head alone. This is safe even when the
rotation's reason is a compromised host key, because of the asymmetry:
activation never minted authority, so there is no era in which the thief
could have created a valid record alone - the Home Host Pico's signature
was always required, and it is checked first. Re-activating every record
under the new key was rejected as mass busywork with no security gain:
the new key's holder accepted the chain themselves.

New records bind to the head only. A credential or grant naming a
retired key is refused - a retired key stamps nothing new, however
honestly it once served.

### Boot re-proves the chain or drops what it cannot prove

Every boot re-verifies the chain from the founding record: linkage,
ordering, column-evidence consistency, the acceptor being the founding's
Home Host Pico, and all three signatures of every link. A link that
fails - and everything chained on it - is dropped, because a chain is
only as proven as its weakest prefix, and the claim state's pins are
repaired to the last proven head: a tampered row cannot leave the Home
answering to a key nobody accepted. Custody must then match that proven
head - after a rotation the founding keys are honestly retired, and
custody still holding them is a half-completed rotation; custody holding
keys no link accepted is a swapped disk. Both stay closed.

The founding record itself stays re-verifiable forever: its era's host
public key survives in the first link's outgoing key record, bound to
the founding fingerprint by the link's own verification, so retiring a
key never orphans the evidence it once signed.

## Gates

- **U1 - Continuity record and verification (implemented):** the record
  over the published canonical bytes, triple-signature verification, and
  vectors covering missing/duplicated signatures, a cooperating stranger
  on each of the three sides signing the real bytes with their own key,
  role swaps, self-succession and schema mismatch. Every check is
  counter-proven: removing it fails exactly one test.
- **U2 - Foundation projection (implemented):** the durable chain with
  head-only linkage, order advancement, one-statement-per-name
  idempotency, claim-state re-pin in the accepting transaction, the
  recovery-pending refusal, era-aware verification for memberships and
  read grants (head for intake, chain for history - proven with a
  middle-era membership surviving a second rotation), head-bound
  reader-custody intake, boot re-proving with weakest-prefix drop and
  pin repair, and the founding-era public key surviving in the chain.
- **U3 - Rotation ceremony (Foundation half implemented; ceremony
  client open):** staging is durable and idempotent - re-staging would
  silently invalidate a possession signature already made - and two
  founder-only Link operations carry the ceremony:
  `home.host.rotation.prepare` stages keys and returns the proposal with
  both host signatures already on it, so what comes back must carry the
  one signature custody cannot make; `home.host.continuity.submit`
  accepts only a link custody can serve (`incoming_keys_not_staged`
  otherwise - the store would accept any validly signed link, and a link
  custody cannot serve stands between the person and their own Home),
  records it, promotes the staged pair by atomic per-file renames,
  refreshes the live audience pin without a restart, audits
  content-free, and flags every printed Recovery Card stale. A crash
  between recording and promotion is completed at the next boot against
  the proven head - and only toward it. The retired private keys go with
  the replaced files: nothing new is ever signed with them, and
  historical verification needs only the public keys the chain carries.
  Open: the ceremony client - the Home Host Pico's acceptance as an ADR
  0099 approval over ADR 0106 rendered statements, the transitional CLI
  wrapper, and the forced Recovery Card re-issue prompt as an ADR 0112
  surface rather than a result flag.
- **U4 - Client re-pin (open):** vault-daemon and companion profiles
  verify a presented chain against their existing pin and follow it;
  member devices learn of the rotation and re-accept; the Pico Link
  audience pin follows custody. Until U4, a rotation strands existing
  clients on the old pin - which is why U3 and U4 should land together
  or nearly so.

## Threat ledger

| Attacker | Posture |
|---|---|
| Thief of a copied host disk | Holds the outgoing keys and can sign a continuity statement to keys they control - but not the Home Host Pico's acceptance, which lives in the person's Vault. Without it no link is accepted anywhere. The thief's copy keeps impersonating the *old* head to clients that never learn of a rotation - the stated ADR 0072-family residual, bounded by U4's re-pin and member notification, not closed here. |
| Malicious or compromised Home Host Pico | Can accept any rotation - they govern the Home, and host keys sign infrastructure, not people (ADR 0056). No new power: they could already deny service or re-found. |
| Database writer forging a link | Boot re-proves every link; a forged or edited link is dropped with everything after it and the pins return to the last proven head. A forged chain cannot make custody match it, so the Home stays closed rather than answering to an unproven key. |
| Old host key signing new records after retirement | A retired key stamps nothing new: intake binds to the head. Its era's existing records stay valid - they always carried the Home Host Pico's authority signature, which the thief never had. |
| Rotation racing a device recovery | Refused: a pending recovery blocks rotation until it resolves, because its claim embeds the pins it was accepted under and its receipt must re-verify forever. |

## Consequences

Positive:

- ADR 0080 H7 stops being a direction and becomes a verified chain;
  "same Home" after a host-key rotation is proven, never asserted;
- the ADR 0033 host-rotation requirement has its record, its authority
  rule and its era semantics;
- no mass re-issue after rotation: history keeps verifying under the
  chain, and the asymmetry is why that is safe;
- founding evidence stays re-verifiable after any number of rotations.

Negative and residual:

- until U4, a rotation strands clients on the old pin: the submit
  result carries the new public bundle over the same sealed channel the
  acceptance traveled, which re-pins the accepting client, but every
  other device learns nothing until U4;
- the acceptance signature is produced without ADR 0099/0106 ceremony
  until U3's client half lands - the Link operations are the machine,
  not the consent surface;
- a stolen host disk keeps impersonating the old head to clients that
  never see the chain - the ADR 0072 residual, bounded only by U4;
- the Recovery Card's printed pins go stale on rotation (ADR 0110);
  U3 must force the re-issue prompt;
- a pending recovery delays rotation, deliberately;
- the Home Host Pico's acceptance makes the founder a single point of
  rotation authority - consistent with ADR 0080's governance model, and
  inherited from it rather than newly created.

## Relationship to other ADRs

- Realizes ADR `0080` H7's continuity statement and its "signed or
  absent" rule; the M3 member re-acceptance residual stays open until
  U4.
- Supplies the host-key half ADR `0033` required; the person-root half
  is ADR `0114`.
- Applies ADR `0114`'s possession lesson to the incoming host key and
  mirrors its counter-proof discipline.
- Keeps ADR `0079` I5 full-length role-bound fingerprints for all three
  parties.
- Interacts with ADR `0110`: pending recoveries block rotation, and
  rotation obsoletes printed cards - re-issue is U3's obligation through
  ADR `0112` surfaces.
- Leaves ADR `0107`'s audience pin custody-driven: the link intake
  answers to the keys the host actually holds, which U3's swap moves.

## References

- [ADR 0033](0033-key-lifecycle-rotation-revocation-and-recovery.md)
- [ADR 0079](0079-pico-identity-and-device-key-threat-model-and-primitive-direction.md)
- [ADR 0080](0080-pico-home-host-key-and-move-in-claim-threat-model-and-ceremony-direction.md)
- [ADR 0107](0107-pico-link-direct-envelopes-to-the-own-home.md)
- [ADR 0110](0110-recovery-card-and-time-locked-zero-device-recovery.md)
- [ADR 0112](0112-recovery-product-surfaces-in-the-background-companion.md)
- [ADR 0114](0114-identity-root-rotation-with-relationship-continuity.md)
