# 0108 - The First Delegated Device Is Founded With the Home

## Status

Accepted; implemented (gates D1-D5 complete). This ADR decides and implements
how the first delegated device's evidence reaches a Pico Home. It discharges
the bootstrap dependency ADR 0107 D3 recorded: a v2-founded Home can run
post-claim authority operations over Pico Link from its first device without
the local `open-identity-session` route.

## Context

ADR 0107 built the authenticated direct channel and held its authority
operations to the same test a session is held to: an active Home membership
plus a registered delegation covering exactly the sender's device keys
(`isAuthorizedSender` in `apps/core/src/app.ts`). Half of that evidence
already flows from founding - ADR 0080 M3 projects the founder's membership
from the founding record itself (`source: 'founding_record'`), so a freshly
founded Home knows its founder is a member without any further ceremony.

The other half does not. The delegation and agreement-key evidence the link
principal is verified against has exactly one write path:
`POST /api/auth/identity-session`, a local Foundation route, which verifies a
self-contained proof (identity key record, device key records, root-signed
delegation, possession signature over a fresh challenge) and then records the
lifecycle evidence and registers the reader key. ADR 0107 D3 preserved this
honestly as a bootstrap boundary: a Home founded entirely over the restricted
Link listener still cannot run a single authority operation until its person
reaches a local Foundation route once. The real-process D4 test shows the
seam exactly - it founds the Home over Link, then calls
`open-identity-session` against the local listener before the authenticated
domain ceremony can run.

ADR 0105 names why this cannot remain: the product form is a background
companion on the person's device, and "walk to a local diagnostic route once"
is a terminal-shaped step in a flow that must not require one. The gap is
narrow and it is a bootstrap gap, not a channel gap - the channel exists; the
evidence it authenticates against has no remote-capable birth.

Two ways to close it were on the table:

1. the first delegated device's evidence becomes an atomic part of
   claim/founding itself;
2. a separate Link operation, authorized by the identity root or by founding
   evidence, records the first device after founding.

Both change signed security contracts. This ADR decides for the first.

## Scope

Covers: what the claim payload and founding record additionally carry, who
signs what, how possession of the first device's keys is proven, what the
Foundation records at founding acceptance and in which order, how existing
founded Homes are treated, and why the alternative is rejected.

Does not cover: enrolling second and later devices, delegation renewal or
rotation over Link, device revocation over Link, removing
`open-identity-session`, or any relay work. Those remain separate decisions.

## Decision

### The first delegated device is founded with the Home

The claim ceremony already carries a root-signed payload sealed to the Home's
key-agreement key, gated by a one-use Move-In Code and the host setup nonce,
and completed by a two-signature founding contract. That is the one
pre-authority channel this Foundation has, and it is the right - and only -
place for pre-authority device evidence to enter. The claim payload therefore
grows to carry, beside the claimant identity key record it carries today:

- the first device's signing and key-agreement key records;
- the root-signed delegation whose subject fingerprints name exactly those
  two keys, with the `surface_session` scope the evidence store requires,
  plus any revocations needed to judge its lifecycle honestly - the same
  evidence shape `open-identity-session` verifies today;
- a first-device co-signature: the device signing key signs the same
  canonical claim bytes the identity root signs.

The root-signed claim bytes themselves gain the delegation id and all three
subject key fingerprints. This is the ADR 0107 D2 lesson applied in advance:
the authority-creating signature must name the device evidence, so nothing
rests on bytes that merely travel beside a signature.

The founding contract gains the same binding. `PicoHomeFoundingSignatureInput`
names the first device's delegation id and key fingerprints, both founding
signatures - claimant root and host key - cover it, and the founding record
stores the delegation and key records in full. The founding record is the
durable, re-verifiable artifact (the claim bytes are deliberately not kept -
they contain the Move-In Code), and it is already the projection root for the
founder's membership. It now also carries the first device's evidence root,
which is the same discipline extended by one step.

### Possession is proven by the claim, not by a new challenge

`open-identity-session` proves device-key possession with a signature over a
fresh verifier nonce. The claim needs no new nonce protocol for the same
proof: its signed bytes already bind the host setup nonce, the claimant
nonce and the one-use Move-In Code, so the first-device co-signature over
those bytes is exactly as fresh as the claim itself. Over Link there is a
second, independent possession proof for free: the outer
`pico.link.direct.request.v1` envelope of `home.claim.submit` is already
signed by a device signing key, and the intake now additionally requires the
outer sender's device fingerprints and delegation id to equal the claim's
first-device binding. A sealed claim payload cannot be carried to the Home by
a different device, and the local route - which has no outer signature -
still verifies the same co-signature inside the payload, so there is no
security branch between transports.

### Founding acceptance records the evidence atomically

On a verified founding acceptance the Foundation records, inside one
transaction and in this order: the founding record, the membership projection
(ADR 0080 M3, unchanged), the identity lifecycle evidence (identity key
record, delegation, revocations), and the reader-key registration. The order
is load-bearing - reader-key registration checks active membership at
registration time, so each step must read the state the previous step wrote.
Any failure refuses the founding as a whole. There is no partially founded
Home: either the Home exists with a member whose first device can
authenticate on the link, or it does not exist.

Restart reconciliation extends the existing founding-evidence pattern: as
memberships are re-projected from the founding record today, the first
device's lifecycle evidence and reader key are re-projected from a founding
record that carries them, fail-closed on any verification failure.

### New founding form, old founding records stay honest

The claim payload and founding record move to v2 schema forms with pinned
canonical bytes and authoritative vectors, like every implemented surface.
v1 founding records remain verifiable exactly as stored - they are durable
state, and existing Homes must keep re-verifying fail-closed across restarts.
v1 claim submissions are no longer accepted: a Home newly founded without a
first delegated device would recreate the gap this ADR closes, so the first
device is required, not optional. The Vault already mints device keys and
delegations before a claim (the D4 test does exactly this), so requiring it
removes a branch without removing a capability. The contracts remain local
and unpublished in the ADR 0097 sense; no compatibility claim is made or
implied (ADR 0046).

### Rejected: a separate identity-root- or founding-authorized Link operation

The alternative was a named Link operation - enrollment of a device key,
authorized by an identity-root signature or by founding evidence. It is
rejected on four grounds:

- **It widens the pre-authority surface permanently.** The device to be
  enrolled is by definition unknown to the Home, so the operation must skip
  `isAuthorizedSender` - a third pre-authority operation beside the two setup
  operations. Unlike the claim, which dies with Setup Mode, an enrollment
  operation stays reachable for the Home's entire lifetime: a standing
  channel on the intake where an unauthenticated principal gets an operation
  executed.
- **It needs freshness machinery that does not exist.** The intake's replay
  set is in-memory and restart-lossy (ADR 0107 D5 ledger); the claim is
  protected by state the intake does not provide - a one-use code, a setup
  nonce, a pending-claim state machine. A root-signed enrollment record would
  need its own one-use semantics against durable state or a challenge round
  trip over Link. That is a new protocol, which ADR 0016's spirit forbids
  composing when an existing bounded contract already carries the pattern.
- **It puts the identity root on the wire path.** Either the root signs
  outer link envelopes - the Vault deliberately permits the
  `pico.link.direct.request.v1` label only for `device_signing`, a closed
  ADR 0099 exemption this ADR leaves closed - or root-signed enrollment
  records become routinely minted online artifacts. Founding confines root
  usage to the ceremony where it already signs twice, approval-gated.
- **Its flexibility solves the wrong problem.** What the alternative buys is
  enrolling *later* devices remotely. Later devices are not a bootstrap
  problem: by then an authenticated path exists, and enrollment should ride
  it - an existing delegated device plus approval, in a separate ADR. A
  pre-authority channel would be the wrong tool for that even then.

## Gates

- **D1 - Protocol forms and vectors: Done.** `@pico/protocol` carries the v2
  claim payload, founding record, canonical claim/founding inputs and the
  durable v1/v2 founding union. The authoritative local vectors live in
  `docs/protocol/fixtures/home-first-device-founding/suite.json`. Foundation
  tests execute all seven negatives: missing/invalid device co-signature,
  delegation subject mismatch, missing `surface_session`, expired delegation,
  signed-fingerprint/key-record mismatch and v1 claim refusal. Every refusal
  is proven not to consume the Move-In Code.
- **D2 - Foundation acceptance: Done.** `executeHomeClaim` verifies all
  carried key records, root delegation/lifecycle, root and device signatures,
  plus exact Link outer-sender equality. Migration
  `0004_pico_home_founding_first_device_evidence` stores the v2 evidence.
  One SQLite transaction records founding, founding membership, lifecycle
  evidence and reader key in the decided order; an injected failure on the
  fourth step proves complete rollback. Restart reconciliation re-verifies
  the founding contract before re-projecting missing v2 device evidence. v1
  founding records remain readable, verifiable and reconcilable unchanged.
- **D3 - Ceremony client: Done.** `claim-home` creates the delegation first,
  root-signs the v2 claim, obtains the operational device co-signature over
  the same bytes, and root-signs founding acceptance. Delegation, claim and
  founding each remain person-approved. Only `device_signing` on the v2 claim
  label skips an additional approval; the identity root stays gated and ADR
  0099's global closed exemption-label list is unchanged.
- **D4 - End-to-end proof: Done.** The spawned Foundation/Vault/CLI test founds
  through the restricted Link listener and immediately creates a
  reader-custody domain over authenticated Link. It never calls
  `open-identity-session` and asserts the Foundation log contains no such
  route.
- **D5 - Documentation honesty: Done.** ADR 0107's bootstrap boundary and
  threat ledger, the implementation-status matrix and the agent handoff
  reflect the implemented v2 boundary and retain the later-device,
  renewal/revocation and direct-transport residuals below.

## Non-goals

- enrolling a second or later device (needs an authenticated enrollment
  ceremony; separate ADR);
- delegation renewal, rotation or revocation over Link - a remote-only Home
  whose founding delegation expires or whose first device is lost still
  needs a local route or that future slice;
- removing `open-identity-session` - it remains for existing v1 Homes, local
  diagnostics and as the local session path;
- publishing any of the involved contracts or claiming compatibility.

## Consequences

Positive:

- remote-only founding becomes complete: claim, founding, membership and
  first-device evidence arrive in one atomic, approval-gated,
  possession-proven contract, and every ADR 0107 authority operation works
  from the first second of the Home's existence;
- no second pre-authority channel exists, now or later: the closed
  pre-authority set stays `home.setup.read` and `home.claim.submit`;
- identity-root usage stays confined to the founding ceremony; the ADR 0099
  exemption list is untouched;
- the founding record becomes the single projection root for "who may act
  here from where", which is what it already claimed to be for membership.

Negative and residual:

- only the first device is solved; the enrollment story for later devices is
  still missing and must not be improvised through the claim path;
- a delegation carried at founding has a validity window; its expiry without
  a renewal path over Link can strand a remote-only Home back to a local
  route (named above as an explicit non-goal, not an accident);
- the claim payload grows by three key records, a delegation and a
  signature - bounded by the existing envelope size limits, but real bytes
  in the most security-sensitive exchange the Foundation has;
- two verifiable founding forms exist until no v1 Home remains, and the
  reconciliation paths for both must stay honest for as long as that holds;
- founding gains one more required ceremony step (the delegation), which
  raises the approval count of first contact - the ADR 0105 cost finding
  applies and remains a product problem, not a security lever.

## Relationship to other ADRs

- Extends ADR `0080` M3: the founding record was already the membership
  projection root; it now also carries the first device's evidence.
- Reuses ADR `0082`/`0083` evidence semantics unchanged; adds a second write
  path with identical verification, not a second kind of evidence.
- Leaves ADR `0099`'s closed exemption list closed; the identity root signs
  no link envelope.
- Keeps ADR `0103`'s ceremonies intact; `open-identity-session` stops being
  load-bearing for Link authority on newly founded Homes.
- Executes ADR `0105`'s constraint that no product path may require a
  terminal or a local diagnostic route.
- Discharges ADR `0107` D3's bootstrap dependency for v2-founded Homes; the
  intake's closed operation set and verification order are unchanged except
  for the first-device binding check inside `home.claim.submit`.

## References

- [ADR 0080](0080-pico-home-host-key-and-move-in-claim-threat-model-and-ceremony-direction.md)
- [ADR 0082](0082-identity-bound-foundation-sessions-and-domain-read-grants.md)
- [ADR 0083](0083-reader-key-registration-and-freshness-contract.md)
- [ADR 0099](0099-hold-channel-approval-for-authority-creating-signatures.md)
- [ADR 0103](0103-person-side-ceremony-client-and-first-installation-validation.md)
- [ADR 0105](0105-pico-runs-as-a-background-companion-not-a-cli.md)
- [ADR 0107](0107-pico-link-direct-envelopes-to-the-own-home.md)
