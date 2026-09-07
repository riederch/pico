# 0110 - Recovery Card and Time-Locked Zero-Device Recovery

## Status

Accepted; partially implemented. R1-R4 and R6 are implemented, and R2 now
holds across a restore rather than within one snapshot. R5's documentation
half is done and its product half is decided by ADR 0112, whose companion
surfaces remain open. The additive `pico.recovery.card.v2` canonical form and
fresh-Vault daemon bootstrap are implemented as prerequisites for that
surface; v1 remains valid but lacks ADR 0115's Home acceptor pin. **Status note (ADR 0134 F2, 2026-08-10):** the body below describes two card
formats, an additive `pico.recovery.card.v2` beside a frozen `v1`. There is
now one. The v2 layout is the only Recovery Card format and it keeps the name
`pico.recovery.card.v1`; the scan transport prefix follows that name, the
authoritative vector moved from `card-v2.json` into the card node of
`docs/protocol/fixtures/home-device-recovery/suite.json`, and the daemon's
second issuance family and the Vault's second issuance method are gone. The
schema check that refused a card without the acceptor pin went with them,
because the pin is now part of every card and parsing is the check. **The
development cards printed on 2026-07-31 are unreadable.** The text is kept
rather than rewritten (ADR 0128): it records what was decided and why the
acceptor pin belongs in the card at all, and that reasoning did not change.

This ADR
decides the path ADR 0109 deliberately left
missing: how an identity whose Home projects no active delegated device
regains exactly one. The person's instrument is the
Recovery Card - a printed, card-sized artifact carrying the PIN-encrypted
identity-root seed as a recovery phrase and QR code - and the contract is
a remote, root-authorized, time-locked, one-use recovery that always
replaces the identity's whole device set. A Home-local Recovery Mode was
considered and is rejected by product decision: recovery must not require
standing at the host. It also fixes the boundary recovery cannot cross:
with the root and the card both lost, the honest answer remains explicit,
visible identity replacement - never hidden continuity.

## Context

ADR 0109 completed the authenticated device lifecycle and proved its own
closure: after a last self-revocation, or after losing the only active
device, no sender passes `isAuthorizedSender`, and every stand-in was
individually forbidden - the identity root may not sign the outer envelope,
`home.claim.submit` may not be reused, Setup Mode may not be reopened, and
the Move-In Code, Home Host role and Relay account may not substitute for
the missing device. The D4 test drives a real Home into exactly this state
and shows it survives a Foundation restart.

ADR 0109 sketched the missing piece as a locally activated Recovery Mode at
the Home host. That premise is now superseded by a product decision: Pico
Homes are routinely headless (a Home Assistant add-on in a cupboard has no
protected display to speak of - the ADR 0080 typed-code question is still
open for the same reason), and the person who lost their last device may be
far from the Home. A recovery that requires physical presence strands
exactly the people it exists for. The locally activated premise is
therefore replaced, not refined.

What replaces it starts from an observation about roles. Any credential
that can enroll a device *is* the identity root: delegations exist only
under a root signature (ADR 0079 I8), so a "recovery key" below the root is
a fiction - it would be a second root. The honest artifact is therefore the
root itself, in a second custody location: a printed seed. Ed25519 keypairs
derive deterministically from a 32-byte seed with the already-present
libsodium (`crypto_sign_seed_keypair`); a mnemonic encoding of that seed on
paper is custody, not cryptography. This simultaneously covers the case
ADR 0109 had to declare terminal: a lost root stops being unrecoverable
while the card survives.

The remaining problem is the carrier. With zero devices, the only channel
is the Link intake, and a recovery operation there must be standing -
reachable for the Home's lifetime - which is the shape ADR 0108 rejected.
This ADR revises that rejection consciously and narrowly, with mitigations
that did not exist then: durable one-use pending state instead of the
restart-lossy replay map, a veto delay instead of physical confirmation,
and ADR 0110's total-replacement rule making a successful capture loud.

## Scope

Covers:

- the Recovery Card: content, phrase and QR encoding, format direction,
  the mandatory PIN protection of the printed seed, issuance and
  re-issuance ceremonies, and the custody honesty around a printed root;
- the narrow, named exception to the Vault no-export boundary that card
  issuance requires;
- the remote recovery contract: the standing Link operation, root
  authorization, target possession, the time lock, the veto, and durable
  pending/consumed state;
- total replacement of the recovering identity's device authority, atomic
  projection, receipt, boot reconciliation and audit; and
- the identity-replacement boundary when root and card are both lost.

Does not cover:

- any Home-local recovery surface (rejected below);
- relay transport, availability claims or public exposure (a recovery
  reaches the Home over the same deliberately bounded direct Link);
- social recovery, escrow, platform keystores or any third-party root
  custody (ADR 0081 P3 stays future);
- member onboarding transport (the replacement path for a new identity
  rides that strand);
- Home handover or `transferred_or_reissued` governance (ADR 0080
  non-goal unchanged);
- identity-root rotation with relationship continuity - named below as the
  consequence of a stolen card, still its own future ADR (ADR 0033/0079);
- visual design of the card and avatar UX beyond the pinned content
  contract (ADR 0105 product work); and
- publishing any contract or claiming compatibility.

## Decision

### The Recovery Card is the identity root on paper

The recovery phrase encodes 32 bytes of card seed material - the Ed25519
identity-root seed under the mandatory PIN protection below - as a 24-word
mnemonic (BIP39 English wordlist with its standard SHA-256 checksum,
computed via libsodium - an encoding of an existing key, not a new
primitive; exact pinning is Gate R1 work). Restoring the phrase and the
PIN into a fresh Vault deterministically recreates the identity root. The
card is therefore the full identity behind one short offline secret, and
the ADR says so rather than softening it: a card in the wrong hands is a
race the owner can lose. Physical custody - print it, laminate it, put it
in a safe - stays the deliberate trade, and it is the same trade every
serious key-custody product makes.

The phrase is never called a passphrase. The Vault unlock passphrase
(ADR 0081), the Recovery Phrase and the Card PIN are three different
objects with three different custodies, and none may ever be described as
another - the ADR 0076 two-codes rule, now applied to three.

### The card contract

The card is a generated two-sided print artifact in Pico's visual style,
sized to ID-1 credit-card format (85.60 x 53.98 mm). Its content is
pinned here; its design is product work:

The implemented PDF palette is derived from the generated ADR 0013 Product
Design tokens. The card renders no PICO Character, so it neither needs nor
claims a Character production asset. Any future card revision that adds PICO
must first use an asset registered for that exact printed purpose under
Character Design v3.2.1; product code may not draw or recolor one.

- **Front (public):** the Pico's name, the identity-key fingerprint in
  display form, the Home's name or id, and the issuance date. Nothing on
  the front is secret; a photographed front leaks no authority.
- **Back (secret):** the 24-word Recovery Phrase, a QR code carrying the
  complete canonical card payload for scan comfort, and one unlabeled
  writing line with clear space above it. Words and QR encode the same
  secret; the QR adds convenience, not a second factor. The line is
  deliberately unlabeled - a found card must not advertise what belongs
  on it - and what a person writes there is their custody decision, with
  the consequence named below.
- **The QR payload** is a versioned canonical encoding. The original
  `pico.recovery.card.v1` remains frozen (labeled, length-prefixed elements in the ADR
  0073/0079 style, with authoritative vectors at Gate R1): suite, the
  PIN-protected seed material and its protection flag, identity
  fingerprint, Home id, both host key fingerprints, the host key-agreement
  public key and an endpoint hint, plus the issuance instant. The pins and
  endpoint made it sufficient for the original host-pin model: a sealed
  recovery claim needs the Home's agreement key and audience pin, and
  trust-on-first-use remains forbidden, so the card carries what the claim
  bundle once displayed. ADR 0115 later made the non-rotating Home Host Pico
  identity fingerprint mandatory for verifying the host continuity chain.
  The additive `pico.recovery.card.v2` inserts exactly that fingerprint after
  Home id and otherwise preserves the v1 fields and semantics. Its
  authoritative vector is the card node of
  `docs/protocol/fixtures/home-device-recovery/suite.json`. It stood here as a
  separate `card-v2.json` until 2026-09-07, which contradicted the sentence
  fifteen lines above that says the vector moved - one decision, two answers,
  and the later one pointed at a file that is gone.
  New companion issuance uses v2. A v1 card may still restore the root, but a
  product may create a trusted profile from it only when the person supplies
  the acceptor pin through a separately verified path; the fresh-Vault daemon
  bootstrap refuses v1 rather than falling back to TOFU.

  V1 QR transport remains the raw canonical bytes. V2 uses the fixed ASCII
  wrapper `pico-recovery-card-v2:` plus unpadded base64url of those same
  canonical bytes, so a commodity scanner can deliver it directly to the
  companion Main process without the secret result entering the browser
  renderer. The wrapper is transport only, not a second canonical form.

Issuance renders that content in exactly two print forms, because the two
ways people actually own a card differ in what the paper has to survive:

- **Card printer:** both faces at true ID-1, one per side, for people who
  print onto card stock.
- **Paper, folded:** one sheet carrying both faces on a shared fold edge
  with no gap between them, the lower face turned 180 degrees so it reads
  upright once the sheet is folded back to back. This form prints
  slightly under ID-1 - the whole card scaled, not re-laid-out - so the
  folded double-layer card fits a standard credit-card laminating pouch
  with a sealing margin. Folding also keeps the secret side inward until
  lamination.

Both forms are the same card: same pinned content, same canonical
payload, same identity. The size difference is a lamination
accommodation, never a second card format, and nothing in the protocol
reads a card's physical dimensions.

Display-form fingerprints on the front are UX; every security-relevant
comparison uses the full digests inside the QR payload (ADR 0079 I5).
Host-key rotation makes a card's pins stale: until continuity verification
exists (ADR 0080 M3 open work), a card printed before a rotation may fail
pin validation, and re-printing after rotation is the product answer - a
stated residual, not a silent one.

### A short PIN always protects the printed seed

Every card is PIN-protected; issuance without a PIN does not exist. At
issuance the person chooses a short PIN (digits and lowercase letters; the
product recommends six characters and allows longer). The scheme reuses
the Vault keyfile primitives and adds none: the material on the card is
`seed XOR XChaCha20(Argon2id(PIN, salt))`, with salt and stream nonce
derived from the identity fingerprint - which is public and already
printed on the front - so the ciphertext stays exactly 32 bytes, the
phrase stays 24 words, and the QR payload only carries a protection flag.
Restore decrypts, derives the root keypair and compares its fingerprint
against the card's full identity fingerprint: a wrong PIN is detected
reliably without an authentication tag. The PIN is never printed by the
tooling, never stored anywhere, and never the Vault passphrase. The flag
stays in both versioned layouts for format stability; issuance always sets
it, and restore refuses a card that claims no
protection.

The honesty that makes this acceptable: the card is offline, so no
attempt counter can exist and a thief brute-forces the PIN at whatever
rate the Argon2id parameters allow. A six-character `[0-9a-z]` PIN is
roughly 31 bits - with deliberately expensive parameters that costs a
determined attacker weeks to months of dedicated compute, and it stops an
opportunistic thief or a leaked photo cold. The PIN therefore buys
deterrence and reaction time - exactly what the 48-hour veto window can
use - not absolute protection, and the ADR says so.

The trade in the other direction is a lockout, and making the PIN
mandatory accepts it as a real failure mode: a forgotten PIN makes the
card worthless precisely when everything else is already lost, and no
Home-side, host-side or operator-side path may ever soften that (the
replacement boundary below is the only exit). The decision goes this way
because the opposite default is worse in practice. A plain card is a
bearer root: found in a drawer, photographed once, or lifted during a
burglary, it is instant, silent identity capture, and the people most
likely to skip an optional protection are exactly the people least able
to survive that. A mandatory PIN turns every one of those events into a
race with a cost, which is what the veto window is built to use.

PIN custody is therefore its own custody, and the product must say so at
issuance: the PIN belongs somewhere the card is not. The card's unlabeled
writing line exists for people who split custody differently - a hint, a
location note, or the PIN itself. Writing the PIN on the card voids the
protection entirely and returns the card to bearer-root behaviour; that
is the person's decision to make, and the ADR names the consequence
rather than preventing it.

### Issuance is the one named export exception, person-side only

The Vault daemon's boundary says no key export, ever (ADR 0097-0102). Card
issuance amends that boundary in exactly one place: the Vault may
materialize the identity-root seed solely to render a Recovery Card, on an
explicit, approval-gated request, person-side, never across the Foundation
and never into Vault or Core state. Each issuance - the first during
onboarding ("print and laminate this now") and any re-issue after card
loss or host-key rotation - is a separate approval with its own audit
event. The rendered artifact (PDF or direct print stream) is exactly as
sensitive as the card itself; the product must say so, offer
direct-to-printer where possible, and urge deletion of any file copy. Pico
cannot enforce what a person does with a printed root - including the
classic failure of photographing it into a cloud library - and the ADR
names that instead of pretending custody ends at the printer.

All cards of an identity encode the same seed: re-issuing never revokes an
old card. A stolen card can only be answered by rotating the identity root
- which today means the explicit replacement path, because rotation with
continuity is still the open ADR 0033/0079 work. That is this design's
sharpest residual and it is stated as such.

### One standing recovery operation, revising ADR 0108 narrowly

The Link operation set gains `home.device.recovery.submit`, and the
pre-authority set changes from exactly two operations to exactly three.
Unlike the claim, this operation is reachable for the Home's lifetime -
the shape ADR 0108 rejected. The revision is deliberate and its grounds
are answered one by one: the operation executes nothing without a verified
identity-root signature over the semantic prepare request or claim (an unauthenticated caller
gets a cheap refusal at the same cost class as any sealed garbage); its
one-use semantics rest on durable pending/consumed state, not on the
restart-lossy replay map; the root signs the semantic record while the
outer envelope stays `device_signing`-only, so the root is still never a
carrier credential; and silent capture is answered by the time lock, the
veto and total replacement below. The rejection of an *unauthorized*
standing enrollment stands; what exists now is a standing operation whose
only key is the identity root itself.

There is no recovery read operation. The operation's `prepare` phase is a
root-authenticated, target-bound discovery request, not an open status
surface: `pico.home.device-recovery-prepare.v1` binds a fresh preparation
id, Home and host pins, identity, the proposed delegation and both proposed
device keys, plus a validity interval of at most five minutes. The outer
Link envelope proves possession of the proposed target signing key; the
identity root signs the prepare bytes under a separate approval. Only then
does the signed, sealed response reveal the current lifecycle head and
active device bindings needed to construct total replacement. It exposes
no pending-recovery status. Completion returns state-specific results only
after `recoveryId`, claim digest and every target binding match; unknown,
wrong-digest and wrong-target requests all return the same
`recovery_unavailable`.

### Root authorization and target possession sign the same recovery claim

`pico.home.device-recovery-claim.v1` is a new canonical family binding at
least: suite, a fresh `recoveryId`, Home id, both host key fingerprints,
the recovering identity fingerprint, the target delegation id and both
target device key fingerprints, the digest of the complete root-signed
evidence set the transition carries (the new delegation and every
revocation), the identity-local lifecycle head as the recovering Vault
knows it, and creation/expiry instants of at most five minutes checked on
the Home clock.

The identity root - restored from the card into a fresh Vault - first signs
the target-bound prepare bytes and then signs these exact claim bytes,
approval-gated in both cases. The target device signing key co-signs
the same bytes as a possession proof, the third role-aware possession use
after ADR 0108's claim co-signature and ADR 0109's activation
co-signature. The intake requires the outer Link sender's device
fingerprints and delegation id to equal the claim's target binding
exactly, so a sealed recovery claim cannot be carried by a different
device (the ADR 0108 lesson, kept).

### The time lock: pending, veto, completion

A verified recovery claim does not commit. It creates one durable pending
recovery per identity - `recoveryId`, exact target binding, digest of all
carried evidence, `effectiveAt` = acceptance + 48 hours on the Home clock,
and a completion window of 7 days after `effectiveAt`. A second verified
claim for the same identity supersedes the pending one and restarts the
clock, audibly. The 48-hour default is fixed here; making it a
per-identity Pico setting is legitimate later work under ADR 0104 and must
never become host configuration.

During pendency:

- every still-active device of the same identity sees the pending
  recovery in its authenticated lifecycle read, and the product must alarm
  loudly (ADR 0105);
- any still-active device of the same identity may veto through an
  authenticated `home.device.recovery.veto` operation - veto power rests
  deliberately on the thing a card thief lacks: a living device. The Home
  Host and other members have no veto and no approval role, because
  cross-identity device authority does not exist (ADR 0109);
- any accepted lifecycle transition of that identity implicitly cancels
  the pending recovery: a living identity always outranks a pending
  recovery; and
- Link stays closed for the recovering identity exactly as before -
  pendency grants nothing.

Completion is a pull, not a Home-side timer: after `effectiveAt` and
within the window, the same target device returns with a completion
request bound to the pending `recoveryId` and claim digest. No second root
approval is needed - the root already authorized this exact transition;
completion only proves the clock passed and the same target still asks.
An expired window lapses the pending record, and everything starts over.

For a true zero-device recovery the lock costs only time. For a living
identity attacked with a stolen card, it converts a silent capture into an
announced one with a 48-hour reaction window. Together with the host
receipt below, this is what replaces ADR 0109's "Home confirmation"
ingredient; its other ingredients map as: one-use to the durable
pending/consumed state, root authorization and device possession to the
two claim signatures, durable freshness to Home-clock instants over
durable state, visible audit to the append-only events and the pendency
read.

### Recovery replaces the identity's whole device set, never extends it

The transition carries exactly one new root-signed delegation for the
target device, and root-signed revocations for every delegation of the
recovering identity that this Home currently projects as active - the
recovering Vault learns the current bindings and head from the
root-authenticated prepare response before it builds or signs the claim.
If any active delegation is
not covered by a verified revocation, the claim is refused. Recovery ends
with the identity holding exactly one active device.

This rule is kept from the superseded local design because it is what
makes remote recovery survivable at all: a card thief cannot coexist with
the legitimate device set, so a successful theft is loud even after the
veto window is missed; recovery serves stuck-but-formally-active states
(a broken device whose delegation has not expired); and recovery can
never become a convenience enrollment beside ADR 0109 - adding a device
to a healthy set remains sponsor work, because using recovery for it
costs the rest of the set. Surviving healthy devices re-enroll through
the normal ADR 0109 path with the recovered device as sponsor.
Delegations this Home never observed cannot be revoked this way - a
stated residual, bounded by ADR 0109's head-bound authority creation.
Authority creation in the recovery transition is head-bound and
strictly-newer exactly as in ADR 0109; authentic older revocations still
merge non-stale.

### Acceptance, receipt, projection and consumption are one transaction

At completion the Home signs `pico.home.device-recovery-receipt.v1`,
binding: the `recoveryId`, Home and host, the identity, the exact target
delegation and key fingerprints, a digest of every accepted evidence
record, the accepted lifecycle head, the pendency interval it enforced,
the completion instant, and the statement that the commit leaves exactly
one active device for this identity. Core then performs one database
transaction, in order:

1. store the transition and signed host receipt;
2. record the new delegation evidence;
3. register the exact target reader key;
4. record every revocation; and
5. mark the pending recovery `consumed`.

Any failure rolls back the whole transition and leaves the pending record
intact within its window. The host receipt creates no identity authority -
only the root-signed records do; it proves this Home enforced the pendency
contract before accepting them.

Restart reconciliation re-verifies the receipt, every root signature and
the target co-signature before re-projecting; manipulated recovery
evidence quarantines that issuer's device authority (the ADR 0109 rule).
Pending records survive restarts - the time lock must not be resettable by
crashing the Home. Reconciliation verifies the recovery state present in
the supplied database snapshot and lapses a pending row older than its
window. On its own it cannot distinguish a fully matching old snapshot
captured before consumption from the legitimate state at that earlier
time, which is why one-use does not rest on the snapshot at all: the R6
anchor below lives outside it and decides whether a recovery may still be
completed. `home.device_recovered`, `home.device_recovery_vetoed` and
`home.recovery_anchor_reseeded` are reserved as server-synthesized,
content-free append-only event types; initiations, supersessions and
lapses stay in bounded operational logging plus the durable pending row,
and the anchor prunes its own entries once their window passes, so a root
holder cannot grow either undeletable store by cycling initiations (A9).

### Approval and rendering boundaries

- The root signatures on the recovery claim, the new delegation and every
  revocation remain gated one at a time under ADR 0099: claim construction
  after prepare costs 2+N root approvals, and the end-to-end path costs 3+N.
  This stays honest until the separately reviewed composite root record ADR
  0109 already names exists. Completion needs no further root approval.
- The root signature on
  `pico.home.device-recovery-prepare.v1` is separately gated and its
  rendering names the Home and exact target while stating that it only
  reads the current replacement head and does not start the veto delay.
- `device_signing` may co-sign exactly
  `pico.home.device-recovery-claim.v1` without an additional approval, as
  the third role-aware possession use. The global ADR 0099 exemption-label
  list remains unchanged.
- Card issuance is its own approval-gated Vault request with its own
  rendering ("this prints your identity root") and audit; it never rides
  another approval.
- Approval rendering for the recovery claim must state, from the signed
  bytes: which identity is recovered, at which Home, onto which target
  device, that every other device of that identity is revoked, and that
  the recovery becomes effective only after the veto delay.
- The Home host signs its receipt from host custody and cannot mint the
  root records it acknowledges.

### Passkeys authenticate people to clients; they are not Pico root keys

The standard direction for a future passwordless client or Vault-unlock
experience is a passkey through WebAuthn/FIDO2. That is a human-to-client
authentication layer with an RP/origin, authenticator and platform custody
model; it is not silently interchangeable with Pico's Ed25519 identity root,
delegated device-signing key or X25519 agreement key. A future client may use
a passkey to unlock local Vault custody or approve an operation, but the
canonical Pico records remain signed by their named Pico key roles.

No passkey runtime exists in this milestone. Choosing RP ids/origins,
attestation posture, multi-device credential policy, local fallback and
recovery requires its own reviewed ADR. If a passkey-class public key ever
appears directly in Pico protocol records, ADR 0079 I2 requires a new suite
and vectors rather than changing `pico.suite.id.v1` in place. The Recovery
Card PIN remains an offline seed-wrapping deterrent and is neither a passkey
nor a WebAuthn fallback.

### No card, no root, no recovery: replacement stays explicit and visible

Recovery authenticates the identity root, however restored. Without root
and card the mode must refuse - not degrade into weaker evidence. The
replacement boundary is unchanged from the superseded design and restated
briefly: a member's lost identity is replaced by a new identity - the Home
Host Pico evicts the old membership (signed, visible, coupling to ADR
0078 K5 rotation debt) and admits the new identity through member
onboarding; membership eviction is the Home-side kill switch, because
nobody can root-revoke a lost identity's delegations. A lost founder root
without a card leaves the Home governance-dead, and the honest exit is
the explicit local home reset and a new founding under a new `homeId`
(ADR 0080 H7). No record may ever assert that a new identity is the old
one. What cannot be recovered is stated: a seed that no longer exists
anywhere, plaintext whose keys existed only in lost custody, and identity
continuity across root loss - the card narrows the last case to "root
and card both gone", it does not abolish it.

## Rejected alternatives

### A locally activated Recovery Mode at the Home host

The previously drafted design: a one-use window opened by demonstrated
local control, replacing the missing sponsor with display possession.
Rejected by product decision: Pico Homes are routinely headless, the
protected-display story is exactly the still-open ADR 0080 typed-code
problem, and the person who lost their last device may be far from the
Home - physical presence strands exactly the people recovery exists for.
Its security benefit (an attacker needs burglary at recovery time) is
partially recovered by the time lock and veto instead.

### A separate recovery secret beside the root

A one-use backup-code-style secret whose digest the Home stores at
founding. It is a real second factor only if stored apart from the root -
printed on the same card it adds nothing - and it cannot cover root loss,
which is the catastrophic case the card exists to cover. Extra machinery,
no coverage of the worst case.

### A delegated "recovery key" below the root

Any key that can mint delegations is the root (ADR 0079 I8); a scoped
sub-root is a fiction that would put a second root into the role model.
The honest artifact is the root itself in a second custody location.

### Immediate commit without a time lock

Faster for the honest case, but a stolen card would capture a living
identity with no reaction window; loudness would begin only after the
devices die. The 48-hour veto window is the replacement for the physical
second authority this design gives up.

### A mandatory memorized passphrase on the phrase

Encrypting the printed seed under a mandatory full-strength passphrase
shifts the failure mode from theft to lockout without bound: the person
who needs the card has, by definition, lost everything else, and a
forgotten long passphrase would make the card worthless exactly then. The
decided middle ground is the mandatory short PIN above - rememberable,
honestly bounded in what it resists, and paired with an unlabeled writing
line for people who split custody differently.

### Leaving the PIN optional

The originally decided position: the person chooses at issuance, and a
plain card stays a valid, honestly-framed option. Rejected on second
review. An optional protection is declined exactly by the people who most
need it, and it makes the plain card - a bearer root that a single
photograph or drawer search converts into silent identity capture - the
path of least resistance at the one moment the product has the person's
attention. The lockout cost is real and is accepted knowingly above,
because a forgotten PIN fails loudly at recovery time while a stolen
plain card fails silently and irreversibly.

### Home-side or operator-assisted recovery

Hosting and administration are not identity authority (ADR 0024/0033/
0080/0087): no host key, operator credential or member role may
authorize, approve or veto another identity's recovery.

## Threat ledger

| Attacker | Posture |
|---|---|
| Card thief (physical theft or photographed back) | Must brute-force the PIN offline at Argon2id cost - weeks to months for ~31 bits of dedicated compute, prohibitive for an opportunistic thief - buying the owner reaction time; a card whose owner wrote the PIN on the writing line is a bearer root instead, which is why issuance says so. Either way, every still-active device is alarmed for 48 hours and can veto, and success revokes the whole legitimate device set, loudly and durably audited. The lasting answer to a stolen card is root rotation, which today is explicit replacement - stated residual. |
| Remote attacker without the card | The standing operation yields nothing without a root signature; refusals are cheap and status is unreadable from outside. |
| Attacker with the old Vault keyfile but no card and no passphrase | Unchanged ADR 0081 posture: the keyfile alone is inert. |
| Malicious Home host | Never sees the seed (issuance is person-side); cannot mint, veto, or shorten the pendency it must enforce; can at most withhold service, as always. |
| Crash/restart and stale-backup attacker | Pending records are durable with Home-clock instants: a restart neither resets nor skips the lock, a snapshot containing consumption keeps it consumed, and an overdue restored pending row lapses. R6 closes the matching-snapshot case for the supported restore path: completion requires the out-of-snapshot anchor to have accepted that exact claim and not resolved it, so a pre-consumption backup restores a row that can no longer be completed. A crash between anchor write and database commit fails closed and costs a re-initiation. The ADR 0107 request bounds are unchanged beneath. |
| Whole-filesystem rollback or write access to the anchor | Unresolved, and named rather than implied: a VM image, disk copy or rsync host migration moves the anchor together with the database, and an attacker who can write the excluded anchor directory can rewind it. This is what a platform monotonic counter (TPM NV, secure element) would close; until one exists the anchor raises the bar from "restore through the supported path" to "reach the excluded storage". |
| Two root holders racing (owner vs. thief) | Superseding claims restart the clock and are audited; neither silently wins; a living device can veto the thief. The stalemate's exit is root rotation - named, not hidden. |
| Evil-twin Home endpoint | Fails against the card's printed pins; the endpoint hint is reachability, never identity (ADR 0031); no trust-on-first-use. |
| Cloud-photo leak of the card | Identical to card theft; the product must warn at issuance. Not enforceable by protocol, stated honestly. |

## Gates

- **R1 - Protocol forms and vectors (implemented for the local suite):** canonical
  `pico.recovery.card.v1`, `pico.home.device-recovery-prepare.v1`,
  `pico.home.device-recovery-claim.v1` and
  `pico.home.device-recovery-receipt.v1` layouts with authoritative
  accept/reject vectors: wrong Home pins, cross-identity and cross-Home
  transplants, head mismatch, outer-sender/target mismatch, an active
  delegation left uncovered, early or post-window completion, superseded
  and consumed `recoveryId` reuse, role swaps. Pin the mnemonic encoding
  (wordlist, checksum), the seed-to-root derivation and the mandatory PIN
  scheme (Argon2id parameters, salt and nonce derivation, wrong-PIN
  detection via fingerprint mismatch) with vectors, including a card
  payload whose protection flag is unset as a reject vector.
- **R2 - Foundation pending state and intake (implemented):** the standing
  operation with root-signature verification, the durable per-identity
  pending state machine (`pending`/`superseded`/`vetoed`/`lapsed`/
  `consumed`), 48-hour/7-day Home-clock enforcement, the authenticated
  veto operation, implicit cancel on any accepted lifecycle transition,
  the ordered atomic completion commit with injected-failure rollback
  proof, restart/snapshot reconciliation, issuer quarantine and bounded
  operational logging with the reserved append-only events. One-use no
  longer stops at the snapshot boundary: R6's anchor carries it across a
  restore, within the substrate limits stated there.
- **R3 - Vault ceremonies and the export exception (implemented):** the
  approval-gated seed materialization with its own rendering and audit;
  card generation as person-side tooling (both print forms - ID-1 and the
  folded paper sheet - over one front/back content contract, words plus QR
  plus the unlabeled writing line, the mandatory PIN chosen and entered
  only at issuance and restore, never printed or stored, issuance refused
  without one); restore-from-phrase
  and restore-from-QR into a fresh Vault with wrong-PIN detection. Root
  preparation/claim signing is supported with role-aware rendering;
  the composite prepare/initiate/complete recovery ceremony with 3+N gated
  root approvals end to end (prepare, delegation, N revocations and claim),
  rendering total replacement and the veto delay;
  the veto ceremony on a surviving device; the exact role-aware
  `device_signing` co-signature exception with the global list unchanged.
- **R4 - Real-process proof (implemented):** from the ADR 0109 D4 zero-device
  closure: issue a card during onboarding, destroy the original Vault,
  restore the root from the card payload into a fresh Vault, initiate
  recovery through the isolated Link listener, prove pendency grants
  nothing and survives a Foundation restart, complete after the simulated
  delay, and end with exactly one active device and every old sender
  dead. A second path proves a living identity sees the authenticated pending
  alarm and vetoes a thief's recovery, and that a lifecycle transition
  implicitly cancels. A third restart path proves post-window lapse.
- **R5 - Documentation honesty and product surface (documentation
  implemented; product surface delegated):** this ADR, the implementation
  matrix and the handoff state the snapshot-rollback and passkey
  boundaries honestly. ADR 0107's threat ledger, ADR 0099's exception
  note, ADR 0097-0102's export boundary, the implementation matrix and
  the handoff state the implemented boundary, including the stolen-card
  residual and the replacement boundary. The product half - where a
  person issues, restores, sees the pending alarm, vetoes and completes -
  is decided by ADR 0112: its S1 transitional CLI wrappers exist, its
  companion surfaces S2-S4 remain open there.
- **R6 - Restore-proof consumption anchor (implemented for the supported
  restore path):** `pico.home.recovery-anchor.v1` lives outside every
  restorable Foundation snapshot - by default in the add-on's
  `backup_exclude`d `recovery-anchor/` directory, overridable to storage
  outside the data directory - and is authoritative for a recovery id's whole
  life, not only its end. Acceptance, supersession, veto and consumption are
  written to the anchor with fsync *before* the matching database
  transaction, and completion requires that this anchor accepted that exact
  claim digest and has not resolved it. Boot reconciliation re-applies
  resolutions the rows no longer carry and quarantines the identities whose
  consumed evidence the rollback erased - a rewound veto or supersession has
  its resolution restored without costing an identity its projection, because
  neither ever changed a device set. A fresh Home seeds silently; a Home with
  recovery history but no anchor fails closed until an operator re-seeds
  explicitly. That re-seed takes the shape the other drastic host actions
  already have - a marker file beside the database, consumed once at startup,
  logged and appended as `home.recovery_anchor_reseeded` - which keeps it off
  the Foundation HTTP surface and asks for exactly the authority it implies:
  local access to the Home host. The refusal names the marker path, because a
  fail-closed state without a way out is a dead end. The re-seed rebuilds
  terminal knowledge only - it never blesses a restored pending row. A recovery the anchor never accepted may
  still be vetoed or superseded, so a re-seed does not strand the person
  behind a pending row it deliberately left unknown. Entries are pruned once
  their completion window has passed, which is what keeps A9 true here: past
  that window a restored row lapses on the Home clock anyway, so the anchor
  cannot be grown without bound by cycling initiations. The
  anchor can only refuse: it creates no device authority and replaces no root
  signature or possession proof, so Home administration stays outside
  identity authority. Honest boundary, also in the ledger: a whole-filesystem
  rollback (VM image, disk copy, rsync host migration) or write access to the
  excluded directory still moves anchor and database together. A platform
  monotonic counter - TPM NV or a secure element - would close that too and
  stays future work; the interface is shaped so the substrate can be swapped
  without touching a caller.

## Consequences

Positive:

- zero-device recovery works from anywhere, on headless Homes, without a
  terminal, matching ADR 0105's product form - and the previously
  terminal case, root loss, is covered for as long as the card survives;
- the card is self-sufficient: seed, pins and endpoint travel together,
  so recovery needs no trust-on-first-use and no Home-side
  pre-provisioning at founding;
- silent identity capture stays structurally hard: a thief needs the
  physical card, then an offline brute force against every card's PIN,
  faces a 48-hour announced veto window against any living device, and a
  success loudly kills the legitimate device set;
- the pre-authority surface grows by one operation whose only key is the
  identity root, with durable consumption inside the current snapshot; R6
  names the remaining restore-proof requirement instead of overstating
  one-use - the other 0108 objections are answered rather than ignored;
- everything reuses proven machinery: seed-derived Ed25519 via libsodium,
  I3-style canonical layouts, ADR 0107 intake order, ADR 0109
  transitions, receipts and reconciliation - no new cryptography.

Negative and residual:

- the card is the identity: theft or a leaked photo of the back is root
  compromise - delayed but not prevented by the mandatory PIN, whose ~31
  bits are offline-brute-forceable at KDF cost - and the lasting remedy,
  root rotation with continuity, does not exist yet; until that ADR, a
  stolen card forces explicit identity replacement;
- the mandatory PIN makes lockout an accepted failure mode: a forgotten
  PIN makes the card worthless exactly when everything else is lost, with
  no softer exit than identity replacement, and it adds a third secret
  with its own custody beside the Vault passphrase and the phrase;
- the unlabeled writing line is protection the person can silently
  disable: a PIN written on the card is a bearer root again, visible to
  nobody but whoever finds it;
- the Vault's clean "no export, ever" boundary gains one named exception,
  and holding it to exactly card issuance is now a discipline to keep;
- recovery takes at least 48 hours plus 3+N root approvals end to end, and total
  replacement forces surviving devices to re-enroll - the price of
  loudness;
- printed pins go stale on host-key rotation until continuity
  verification exists; re-printing is the interim answer;
- a standing pre-authority operation now exists on the intake, and its
  inertness without a root signature must be actively preserved by every
  future change;
- a fully matching Foundation backup from before consumption can resurrect
  the then-pending row until R6 supplies a monotonic platform anchor; local
  database reconciliation alone cannot honestly prove otherwise;
- nothing here restores lost plaintext, and root-and-card loss keeps its
  full replacement cost;
- R6's anchor adds a failure mode recovery did not have: a lost or unreadable
  anchor blocks completion until an operator re-seeds, and the person who
  needs recovery is often not the person who can do that. Re-seeding
  automatically would hand the documented attack back, so the block is the
  deliberate choice;
- every recovery transition now costs one durable fsynced write before its
  database commit, and a crash in between costs a re-initiation of 3+N root
  approvals.

## Relationship to other ADRs

- Realizes ADR `0033`'s recovery boundary: scoped restoration with
  explicit revocation of old authority, audited, distinguishable from
  impersonation, no single Home-side secret, and visible replacement when
  recovery cannot serve.
- Constrained by ADR `0016`: seed derivation, SHA-256 checksum and QR/
  mnemonic encodings are encodings of existing primitives via libsodium,
  not new cryptography.
- Extends ADR `0081`: the card is a second person-side custody location
  for the root; the Vault keyfile, passphrase and platform-keystore
  future are unchanged, and neither the Recovery Phrase nor the Card PIN
  is ever the Vault passphrase.
- Amends ADR `0097`-`0102` narrowly: one named, approval-gated,
  person-side export exists - card issuance - and nothing else crosses
  the no-export boundary.
- Keeps ADR `0099`'s global exemption-label list closed and adds one
  exact role-aware possession use for the recovery claim co-signature.
- Keeps passkeys at the WebAuthn/FIDO2 client-authentication and custody
  layer unless a future ADR introduces a new protocol suite; neither the
  Card PIN nor the current Pico root/device keys are relabeled as passkeys.
- Applies ADR `0104`: the veto delay is a pinned default today and may
  become a per-identity Pico setting later, never host configuration.
- Executes ADR `0105`: recovery requires no terminal, no display at the
  Home and no physical presence; the card and avatar alarms are the
  product surfaces.
- Extends ADR `0107` by one closed standing operation and one
  authenticated veto operation without touching the pinned verification
  order.
- Revises ADR `0108`'s rejection consciously: a standing pre-authority
  operation now exists, keyed solely by the identity root over durable
  one-use state; the rejection of unauthorized standing enrollment
  stands.
- Supersedes ADR `0109`'s locally-activated recovery sketch while
  keeping its closure rules, lifecycle machinery and every one of its
  required recovery ingredients in mapped form.
- Delegates its product surface to ADR `0112`: the companion carries the
  alarm and the ceremonies; the transitional CLI wrappers are tooling,
  not a product form.

## References

- [ADR 0016](0016-cryptography-boundaries-and-non-goals.md)
- [ADR 0033](0033-key-lifecycle-rotation-revocation-and-recovery.md)
- [ADR 0076](0076-foundation-operator-credential-session-and-bootstrap-mechanics.md)
- [ADR 0079](0079-pico-identity-and-device-key-threat-model-and-primitive-direction.md)
- [ADR 0080](0080-pico-home-host-key-and-move-in-claim-threat-model-and-ceremony-direction.md)
- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0087](0087-foundation-operator-home-host-authority-consolidation.md)
- [W3C Web Authentication](https://www.w3.org/TR/webauthn/)
- [FIDO Alliance: Passkeys](https://fidoalliance.org/passkeys/)
- [ADR 0099](0099-hold-channel-approval-for-authority-creating-signatures.md)
- [ADR 0104](0104-settings-belong-to-pico-not-to-host-configuration.md)
- [ADR 0105](0105-pico-runs-as-a-background-companion-not-a-cli.md)
- [ADR 0107](0107-pico-link-direct-envelopes-to-the-own-home.md)
- [ADR 0108](0108-the-first-delegated-device-is-founded-with-the-home.md)
- [ADR 0109](0109-authenticated-device-lifecycle-over-pico-link.md)
- [ADR 0112](0112-recovery-product-surfaces-in-the-background-companion.md)
