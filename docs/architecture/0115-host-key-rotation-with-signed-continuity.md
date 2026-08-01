# 0115 - Host-Key Rotation with Signed Continuity

## Status

Accepted; implemented (U1-U4). The era rule and the block scopes were
decided explicitly by the user on 2026-08-01: the accepted chain vouches
for records of earlier eras, and clients re-pin in the U4 block. The
three U4 forks were likewise decided by the user on 2026-08-01: the
unsealed chain read lives on the Foundation route table and is published
beside the sealed intake by the restricted Link listener; it serves the
full chain, strictly parameterless; and after a fully verified chain a
client re-pins automatically and notifies the person loudly, instead of
gating the re-pin behind an approval.

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

- a product ceremony surface - the transitional CLI is the interim
  person surface, as with every ADR 0112 S1 wrapper; the companion
  ceremony and the forced card re-issue prompt stay ADR 0112 S3 work;
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

### The stranded client reads the chain unsealed, from its own pin

A client that missed the rotation cannot use the sealed channel at all:
it seals to an agreement key whose private half was deleted at the
custody swap, and it pins an audience the intake refuses before any
dispatch. So the one read that can un-strand it is unsealed - `GET` on
the Foundation route table, published beside the sealed intake as the
restricted listener's second explicitly named target, full chain plus
the current head bundle, strictly parameterless (a query string is a
different target and is refused). Serving it plain is sound because
nothing in the response asks to be trusted: the records carry their own
signatures, and the head bundle counts only if both public keys hash to
the fingerprints the client's own verification proved.

That verification starts at the client's *own pin*, never at the
founding, and needs a pin clients did not previously hold: the Home
Host Pico fingerprint. Without it a thief of a copied host disk forges
the entire continuation - the outgoing signature is genuine (they hold
the retired key), the incoming is genuine (they minted it), and the
acceptor is simply invented, because the served bytes name whatever
fingerprint the thief chose to sign with. Server-side the founding
comparison catches this; client-side only a pinned acceptor does. The
companion profile therefore carries the Home Host Pico fingerprint as a
required field, and the transitional CLI takes it as a flag. The walk
itself refuses forks (two successors of one pair), skipped links, links
accepted by any other root, non-advancing lifecycle order, a change of
Home, and revisited pairs - a genuine revisit would need a possession
signature from a private key deleted at its own retirement.

After a fully verified chain the client re-pins automatically and tells
the person loudly, rather than gating the re-pin behind an approval:
the verification is cryptographically complete, a member cannot
meaningfully refuse their Home's rotation anyway, and a prompt that
checks nothing the mathematics has not already checked only trains
blind confirmation. Anything the chain cannot prove - including a Home
that refuses the very pin the served chain calls its head - leaves the
pin untouched and raises the continuity alarm instead: staying stranded
is the safe state, and the person must hear it. None of this needs an
unlocked vault: chain read, verification and profile rewrite are all
public-key work.

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
  The ceremony client is implemented as `pico-vault ceremony
  rotate-host-key` in the S1 idiom: link transport only, the acceptance
  approval-gated over the ADR 0106 statement that names everything it
  retires - including every printed Recovery Card going stale - and two
  client-side trust checks a lying Core would otherwise slip past: the
  acceptance must be the signer's own to give, and the proposal must
  retire exactly the keys this client is pinned to. The reply to the
  submit is deliberately the old era's last message: custody swaps only
  after it is sealed and signed, so the client verifies it under the pin
  it still holds - proven over real processes, because the daemon's Link
  client refuses unverifiable replies. The printed `newHostPublicKeys`
  re-pin the accepting client; the forced card re-issue *prompt* as a
  product surface stays ADR 0112 S3 work, and the CLI warns instead.
- **U4 - Client re-pin (implemented):** the unsealed continuity read
  (`GET /api/home/link/continuity`, access class honestly `public`,
  parameterless, no-store) serves the stored records verbatim with the
  custody head bundle, and the restricted listener forwards it as its
  second explicitly named `(method, target)` pair - publication stays an
  explicit decision, and the refusal matrix (foreign targets, wrong
  methods, query strings) is proven at the edge.
  `followPicoHomeContinuityChain` in `@pico/identity` walks from the
  client's own pin with hostile vectors for the forged acceptor (proven
  to verify record-internally and be refused only by the pin), fork,
  withheld link, tampered link, stale order, foreign Home and revisited
  pair - every guard counter-proven, removing it fails exactly one
  test. `pico-vault refresh-host-pins` (S1 idiom: pins ride flags, the
  new `--home-host-pico-fingerprint` is the acceptor pin) fetches,
  follows, binds the served bundle by fingerprint hash and prints the
  proven head, exiting loudly on anything unproven - proven over real
  processes against a really rotated Home: the stranded old pins yield
  `repinned` with exactly the ceremony's printed head, the head works,
  current pins yield `current`, and a wrong acceptor turns the same
  served chain into a loud `unverified`. The companion profile carries
  the required `home.homeHostPicoIdentityFingerprintHex`, and the
  lifecycle reader self-heals on the strand shape (pre-authentication
  seal/audience refusals, never network failures): verify, re-pin the
  profile atomically, rebuild the Link client, retry once, and notify
  the person loudly (ADR 0080 M3) through the same adapter that carries
  the ADR 0112 alarm; `current`-but-refused and unverifiable chains
  keep the pin and raise the continuity alarm instead. The audience pin
  following custody was U3's half and stays proven there.

## Threat ledger

| Attacker | Posture |
|---|---|
| Thief of a copied host disk | Holds the outgoing keys and can sign a continuity statement to keys they control - but not the Home Host Pico's acceptance, which lives in the person's Vault. Without it no link is accepted anywhere, and client-side the pinned acceptor fingerprint refuses the forged continuation even though every other signature on it is genuine. Residual after U4: the thief's copy still impersonates the *old* head to a client that only ever reaches the thief - such a client sees no provable continuation, stays on its pin and, from the first refused sealed read, raises the continuity alarm rather than healing silently. Reaching the real Home once resolves it. |
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

- the unsealed chain read widens the published surface by one
  unauthenticated read-only endpoint: anyone who can reach the intake
  port learns the Home's rotation history - public-key material,
  fingerprints, the coarse reason category and timestamps. Accepted
  deliberately (user decision 2026-08-01): the material is
  self-authenticating, the reason categories are coarse by design, and
  the endpoint does no private-key work per request;
- a stolen host disk keeps impersonating the old head to a client that
  never reaches the real Home's endpoint - narrowed by U4 from "until
  someone re-pins" to "while the client is partitioned from the real
  Home", and made loud instead of silent;
- the loud rotation notice and continuity alarm ride the transitional
  notify-send adapter; the product notification surface stays ADR 0113
  C2+ shell work, like the ADR 0112 alarm it shares the adapter with;
- the Recovery Card's printed pins go stale on rotation (ADR 0110);
  U3 must force the re-issue prompt;
- a pending recovery delays rotation, deliberately;
- the Home Host Pico's acceptance makes the founder a single point of
  rotation authority - consistent with ADR 0080's governance model, and
  inherited from it rather than newly created.

## Relationship to other ADRs

- Realizes ADR `0080` H7's continuity statement and its "signed or
  absent" rule; U4 carries the M3 member-notification residual: member
  devices verify the chain from their own pin, re-pin, and the person
  is told loudly.
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
