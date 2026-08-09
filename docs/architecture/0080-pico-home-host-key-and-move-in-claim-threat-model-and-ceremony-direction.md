# 0080 - Pico Home Host Key and Move-In Claim Threat Model and Ceremony Direction

## Status

Accepted as the threat model and ceremony direction for claiming an Empty Pico
Home. Gate M1 canonical bytes are implemented. Gate M2 is partially
implemented through Setup Mode, separated host-key custody, sealed two-step
claim/founding acceptance, durable mutually signed founding evidence, boot
reconciliation, claim audit and reset. Gate M3 is partially implemented through
the founding membership root, signed member credentials, host activation,
lifecycle/eviction, validity and restore reconciliation. ADR 0082 connects
verified membership to identity-bound sessions and explicit signed domain
grants without making membership itself readership. ADR 0087 implements the
local operator/Home-Host authority consolidation. Protected display/claim UX,
broader member onboarding, continuity enforcement and Pico Home Link
compatibility remain open.

## Context

This is the last root ceremony of the tenancy strand without a reviewed design. ADR 0024 defines the empty-house model (unclaimed host → one-time claim → Home Host Pico → invited members) and ADR 0027 its first-boot shape (Setup Mode, Move-In Code, protected display channels) — both deliberately conceptual. ADR 0029/0031/0033 fix the key roles, the threat model and the lifecycle honesty rules; ADR 0032/0045 the membership credential family; ADR 0056/0057/0066 fence the draft fixtures until "a reviewed cryptographic and membership design" exists. ADR 0075/0076 built the Foundation operator explicitly as a phase-scoped principal that the claim flow must later subsume (A11), and reserved the `setup-bootstrap` access class for the future claim endpoint.

ADR 0079 removed the shared bottleneck: the suite (`pico.suite.id.v1`), the signature-input method (I3, labeled length-prefixed binary layouts), possession proofs (I6), delegation/lifecycle statements (I8/I9) and per-role custody floors (I7, G2) now exist as direction. ADR 0078 defined how Domain Content Keys reach readers and gated its membership runtime (R3) on exactly the verified membership records this ADR designs. What remains open is the ceremony itself: how an Empty Pico Home and a first Pico establish mutual trust over an untrusted local network, what record makes the result durable, and how the transitional operator principal dissolves into it.

The runtime today has durable claim/founding state, a current membership
projection, separated Home host-key custody, setup-bundle and claim APIs. The
sealed two-step path persists mutually signed founding evidence and projects the
Home Host Pico's active `home_host` membership root. Signed member credentials
and ordered lifecycle statements are verified, host-activated, persisted and
reconciled on boot. ADR 0082 adds locally persisted identity lifecycle evidence
and signed domain grants consumed by the claimed-home read path. Invitation
transport, broader onboarding and external lifecycle freshness still do not
exist.

## Scope

Covers: the Pico Home Host Key (creation trigger, roles, custody direction), Setup Mode as a security state, the Move-In Code's mechanics, the claim ceremony (authentication in both directions, message posture, freshness), the founding record and Home identity, the membership credential realization direction including eviction, Home continuity across rotation/migration/reset, operator consolidation (A11), and claim audit.

Does not cover: invitation transport and UX for later members, remote or
Pico-Link claim (the local surface only; ADR 0030 remote boundary unchanged),
relationship trust between Picos, recovery (ADR 0033 boundary unchanged),
person-identity custody, residency storage policy, Home-to-Home federation or
multi-host Homes.

## Threat model

### Protected assets

- the claim itself — whoever completes it owns this host's future (ADR 0024: the house, never the residents)
- the Move-In Code while Setup Mode lives — the only bridge between local display control and the first trust
- the host's private keys — Home continuity and the activation-countersignature authority
- the founding record's integrity — everything later (membership, continuity, consolidation) chains from it
- the bidirectional authenticity of the ceremony: the claimant must reach the host that displayed the code, the host must admit only someone who saw the display
- the honesty of "same Home" claims after rotation, migration and reset

### Attacker model

Extending ADR 0031 with what the ceremony itself creates:

| Attacker | Capability | Posture direction |
|---|---|---|
| LAN man-in-the-middle / evil-twin host | Sits between claimant and host during Setup Mode; presents a fake Empty Pico Home or relays traffic. | Killed by the display bundle (H2): the claimant seals to host keys pinned out-of-band, so the twin cannot open the claim; the twin's own bundle would need control of the protected display channel, which is the ADR 0027 local-control boundary, not a network capability. No step trusts first use. |
| Move-In Code thief (display capture, shoulder surf) | Learns the code; can claim the empty house. | The local-control boundary stated honestly (ADR 0075 A10 family): display access *is* claim authority. Bounded: single use, Setup-Mode window, attempt cap, and the prize is an **empty** house — no existing resident data exists at claim time. |
| Replay attacker (ADR 0031) | Replays claim messages, old founding records, stale membership credentials. | Ceremony messages are context-bound and fresh (H3); the code is consumed atomically with the founding transition; membership and continuity consume I9-ordered lifecycle state, not signature validity alone. |
| Stale-backup attacker | Restores pre-claim state to reopen Setup Mode on a claimed Home. | H8: claim state and host-key custody are reconciled at boot, conflicts fail closed toward `claimed`; the tombstone-family rule (ADR 0070, 0078 K8, 0079 I9), fourth instance. |
| Post-claim hostile operator (local reset + re-bootstrap) | Uses filesystem control to become Foundation operator on a claimed Home. | H9: gains host-infrastructure power only — the ADR 0076 honest limit inherited. Cannot sign as the Home Host Pico (its keys are not on the host, H5), cannot mint membership (H6), cannot read reader-custody domains (ADR 0078 K1/K6). |
| Host-key thief (host disk) | Copies host-role private keys; impersonates host continuity to members. | The ADR 0072-family stolen-disk residual, stated: possible until rotation/continuity acceptance exists; never resident authority (ADR 0056 — host keys sign infrastructure, not people). Member re-acceptance and revocation bound it later (Gate M3, ADR 0033). |
| Stale-serving host | Withholds membership revocations or continuity statements; serves old-but-signed state. | Cannot fabricate (statements are Home-Host-Pico-signed), can withhold: detectable-not-preventable, same residual as ADR 0079's, bounded later by manifests (ADR 0032). |
| Compromised host at first boot (image, supply chain) | Displays attacker-controlled pins; owns the Home from birth. | Out of scope for this layer and named: no ceremony outruns a compromised endpoint that controls the display. Image/packaging trust is release-platform work (ADR 0005/0019 families). |

### The ADR 0016 questions, answered for the claim surface

1. **Who controls keys?** The host controls host-role keys (file custody, Gate M2); the claimant's Pico Vault controls person-role keys, which never touch the host (ADR 0079 G2/I7). The Move-In Code is nobody's key — it authorizes once and dies. There is no registry and no CA; the founding record is this Home's root.
2. **Which devices can read which domain?** Unchanged by claiming: membership grants host use, never readership (ADR 0045 rule kept). Readership stays a per-domain grant through the ADR 0077 seam and ADR 0078 custody/envelopes; the Home Host Pico administers without reading (A7 carried into tenancy).
3. **What can a server see?** The ceremony hands the host: the claimant's public key records, possession proofs, the founding record, membership records — public by design. It never sees person-role private material, and after claim it holds no reusable claim secret.
4. **What can a relay see?** Nothing; the first claim is a local-surface ceremony (ADR 0027 channels). Remote claim would be a new decision, not an extension of this one.
5. **What happens after device loss?** A claimant device loss is ADR 0079 lifecycle work (revocation, I9) plus ADR 0078 rotation for affected domains. Loss of the Home Host Pico's identity is a recovery question — explicitly future (ADR 0033), and the Home never becomes the recovery path (ADR 0033: recovery must not be granted by Home Host role alone).
6. **What happens after relationship revocation?** Eviction is a signed membership lifecycle statement plus host enforcement plus ADR 0078 K5 rotation where future secrecy is required — never identity destruction, never key seizure (ADR 0024).
7. **How does backup restore work?** Founding, membership and continuity records restore as signed public state and reconcile I9-style toward the freshest statement. Claim state restores against host-key custody with H8 fail-closed reconciliation: no stale backup reopens Setup Mode.
8. **How does deletion interact with protected payloads?** Home reset destroys host-role identity and claim state, and must say exactly that: it never claims to delete resident identities, resident keys or resident backups (ADR 0033), and it must be structurally unable to touch Domain Content Keys — resetting the house never shreds the furniture (crypto-shred stays the separate, confirmed, Gate B operation).

## Required properties

- **H1 — The Move-In Code authorizes one claim and nothing else.** High-entropy CSPRNG, per-process, held host-side as digest only, single-use, attempt-bounded, valid only while Setup Mode lives; consumed atomically by the successful claim. It is never an identity, a key, a key-derivation input, a recovery handle or a durable credential (ADR 0027/0029 as an enforced property, not prose).
- **H2 — Both directions authenticate through the protected display channel, never through the network.** Host→claimant: the displayed bundle pins the host's public keys (full material or full-length fingerprints, I5). Claimant→host: possession of the code. No trust-on-first-use step exists; an evil twin fails for lack of the pinned private key, a remote attacker for lack of the code.
- **H3 — Ceremony messages are sealed, context-bound and fresh.** Claim payloads travel sealed to the pinned host key-agreement key; the canonical binding (I3 layout) inside the sealed payload covers at least suite, the pinned host key fingerprints, the code and ceremony nonces; host responses are signed by the pinned host signing key over the ceremony context. Cross-host, cross-ceremony and replayed presentations fail closed.
- **H4 — The founding record is mutually signed and is the only root of Home authority.** It mints the `homeId`, names the host key and the Home Host Pico identity by fingerprint, binds the ceremony context, and carries two signatures: the claimant's identity key and the host's signing key. A half-signed founding record is inert (I8/K4 family), and nothing chains from it.
- **H5 — Custody per role, no escrow.** Host-role keys live in host file custody with ADR 0072 semantics (Gate M2; backup exclusion release-blocking, blast radius separated from domain KEK files). Person-role private keys are never created, stored or escrowed on the host (ADR 0079 G2/I7); the ceremony proves possession (I6), it never transfers private material.
- **H6 — Membership authority is the Home Host Pico's signature; the host countersigns activation only.** A credential without the issuer signature is inert; the host alone can deny service but mint nothing. Membership grants scoped host use and never domain plaintext (ADR 0045 rule; readership arrives separately via ADR 0078 R3).
- **H7 — Home continuity is signed or absent.** Host-key rotation or host migration preserves the `homeId` only through a continuity statement signed by the outgoing host key and accepted by the Home Host Pico. Reset followed by re-claim mints a new `homeId` by construction. "Same Home" can never be asserted — only proven.
- **H8 — Restore never reopens the house.** Claim state (database) and host-key custody (files) are reconciled at boot; conflict fails closed toward `claimed`, and neither Setup Mode nor a usable Move-In Code exists while founding evidence is present. Re-entering Setup Mode requires the explicit local home reset, never a restore side effect.
- **H9 — The operator consolidates under the Home Host Pico and never competes with it** (ADR 0075 A11 realized). After claim, host-administration authority belongs to the Home Host Pico; the operator credential survives only as a local access mechanism bounded by host infrastructure. It never signs as anyone, never issues membership, never gains readership of reader-custody domains, and a post-claim operator reset re-establishes host access, never Home authority.
- **H10 — Claim lifecycle is audited without amplification.** The claim and the home reset are server-synthesized, content-free append-only events (`home.claimed`, `home.reset` reserved; ADR 0076 mechanism reused). Codes, keys and attempt details never enter the append-only log; Setup Mode entry and failed attempts stay in bounded operational logging (A9).

## Decision

### The host identity: `pico.suite.id.v1`, key roles `home_host_signing` and `home_host_key_agreement`

The Pico Home Host Key is two independent keypairs under the ADR 0079 suite — Ed25519 signing, X25519 key agreement, no cross-primitive reuse — described by the same key-record family (`pico.id.keyrecord.v1`) with `keyRole: home_host_signing` and `keyRole: home_host_key_agreement`. No new suite, no new record family, no host-specific format. The host generates its own keys at first entry into Setup Mode, before any claim exists; they are host state under host file custody (the ADR 0079 G2 host-role direction, discharged concretely at Gate M2 with ADR 0072 semantics). The Move-In Code is never an input to their generation.

Host keys sign host-infrastructure statements only: ceremony responses, the host half of the founding record, activation countersignatures, continuity statements, future host audit bindings. The ADR 0056 core rule becomes structural: nothing a host key signs can express resident authority, because no record family gives it a place to.

### Setup Mode and the two codes

Setup Mode is the host state in which, and only in which, the claim surface exists: active while the host is unclaimed, ended atomically by the successful claim, re-entered only by the explicit local home reset. The claim endpoint sits in the `setup-bootstrap` access class exactly as ADR 0075 reserved, with the class condition generalized: available only while the respective principal does not exist — the operator bootstrap while no operator exists, the claim while no Home exists. The two surfaces are independent; neither is a prerequisite of the other, and each of the four states (operatorless/unclaimed in any combination) fails closed on its own axis.

| | Operator Bootstrap Code (ADR 0076) | Move-In Code (this ADR) |
|---|---|---|
| Establishes | Foundation Operator | Home Host Pico |
| Authority granted | local API administration (transitional, H9) | Home founding |
| Displayed via | host log / console | ADR 0027 protected display channel, as part of the claim bundle |
| Lifetime | per process, until first bootstrap | per process, while Setup Mode lives |
| After success | operator exists; consolidates at claim | founding record exists; Setup Mode ends |

Both codes share the ADR 0076 mechanics: high-entropy CSPRNG, digest-only in memory, never SQLite, never env vars, single-use, bounded verification. Neither may ever be described as the other (ADR 0076's rule, kept verbatim).

### The claim bundle: pairing trust comes from the display, not the network

Setup Mode presents, through an ADR 0027 protected channel (local setup page, HDMI/serial console, attached display — QR where possible), the **claim bundle**: an endpoint hint, the host's public keys pinned by full material or full-length fingerprints (I5 — truncated comparison is forbidden here exactly where substitution would be most valuable), and the Move-In Code.

This dissolves the pairing problem without new cryptography. The alternatives are rejected by name:

- **Trust-on-first-use** would place the claimant's first and most valuable trust decision on the untrusted network — the precise moment an evil twin exists for. The tree's rule is already "no interim trust-on-first-use" (ADR 0078 K4); it holds here.
- **A PAKE** (password-authenticated key exchange) would let a bare typed code authenticate both directions, but libsodium provides none, so adopting one means a new primitive family and a new dependency under ADR 0016 review — for a property the display channel already provides. The display must exist anyway (ADR 0027 requires a protected channel to show the code); letting it carry the pins costs nothing and removes the need.

The consequence is stated rather than hidden: the ceremony's trust root is the display channel, and whoever controls that channel controls the claim (A10 family). A code-only typed path — where pins cannot be displayed — is not normative in this ADR; the open questions name the two candidate shapes and the constraint that neither may silently degrade to trust-on-first-use.

### The ceremony

Direction, over the local Foundation surface (message count and exact layouts are Gate M1 work):

```text
Setup Mode display -> claim bundle: {endpoint hint, host key pins, Move-In Code}
claimant -> host:     sealed to pinned host kex key:
                      {label, suite, host key fingerprints, Move-In Code,
                       claimant key records, claimant nonce}
host -> claimant:     signed by pinned host signing key:
                      {label, ceremony context, founding proposal}
claimant -> host:     identity-signed founding acceptance (possession, I6)
host:                 founding record complete, code consumed,
                      claim state = claimed, Setup Mode ends — atomically
```

The sealed request is `crypto_box_seal` to the pinned key with binding-by-inclusion (the ADR 0078 K3 pattern: sealed boxes take no associated data, so context lives inside the sealed payload as an I3 layout) — no new construction. The host verifies the code against its in-memory digest (timing-safe, attempt-bounded, serialized in the ADR 0076 bounded-verification pattern), and only then processes the claimant's key records. The claimant accepts nothing the pinned signing key did not sign. Claimant identity possession is proven by detached signature over ceremony context (I6); whether the bundle itself carries a host challenge that folds possession into the first sealed message, or an explicit round trip provides it, is a Gate M1 layout choice — both satisfy I6.

The transition is atomic on the host: founding record complete, code consumed, `claimed` recorded, Setup Mode ended — or none of it. An abandoned half-ceremony leaves an unclaimed host and (at most) a restart-refreshed code; nothing chains from a half-signed founding record (H4).

The founding record is signed by the claimant's **identity key**, not a device key: founding is a constitutional act, rare and maximally consequential — precisely what ADR 0029 keeps the identity key for. ADR 0087 lets the founding Home Host Pico reach local signed-evidence relay through its active identity session. A future delegated-device administration path requires an explicit signed request/delegation family; it is not inferred from `surface_session` or route reachability.

### The founding record and `homeId`

The founding record (`pico.home.founding.v1` direction) mints the Home: a fresh random `homeId`, the host key fingerprints, the Home Host Pico identity fingerprint, the ceremony context, and both signatures. The `homeId` is minted **at founding, not at host-key creation** — a deliberate structural choice: an Empty Pico Home is a place, not yet an identity, and a Home exists only as (host infrastructure × founding authority). Reset followed by re-claim therefore produces a *different* Home under a new `homeId` even on identical hardware with surviving host keys — the safe default. Handing a Home to a different person under the same `homeId` (ADR 0045's `transferred_or_reissued`) would be an explicit signed governance flow, deliberately not designed here.

Members later verify against the founding record: membership credentials name the `homeId` and host key, and chains that do not reach a well-formed founding record verify as nothing.

### Membership credentials: authority and activation

The Home Membership Credential (`pico.home.membership.v1` direction, realizing ADR 0032/0045 with the 0045 vocabulary for roles, scopes and states) carries **two signatures with different meanings**:

- the **issuer signature** — the Home Host Pico (identity key, or a device key delegated with `home_membership` scope): this is the authority. Without it a credential is inert, whatever the host says (H6).
- the **activation countersignature** — the host key: operational acknowledgment that this credential is active at this Home. It lets the host runtime enforce residency offline from the Home Host Pico, and it creates no authority: a host countersignature over an issuer-less credential is a signature over garbage.

The asymmetry is the ADR 0024 rule in cryptographic form: the host can always deny service (it physically could anyway) but can never mint membership; the Home Host Pico owns membership but exercises it through records the host can verify and enforce. Membership status changes (eviction, expiry, reissue) are Home-Host-Pico-signed lifecycle statements with I9 ordering context — the host enforces the freshest statement, restore reconciles toward it, and eviction triggers ADR 0078 K5 rotation where future secrecy is required. The founding record itself doubles as the Home Host Pico's own membership root; it is not re-issued as a credential by its own subject.

These records are what ADR 0078 Gate R3 consumes: verified membership rows drive both envelope issuance and the ADR 0077 `mayReadDomain` seam. Membership never implies readership — a member reads a domain only through an explicit domain grant (custody class rules unchanged, ADR 0078 K1).

### Continuity, rotation and home reset

Host-key rotation or migration to new hardware preserves the Home only through a **continuity statement** (`pico.home.continuity.v1`, realized by ADR `0115` as a verified chain with era-aware verification; member notification stays Gate M3): signed by the outgoing host key, naming the `homeId` and the incoming host key, and accepted by the Home Host Pico (ADR 0056's `memberAcceptanceRequired` posture made concrete: acceptance is the Home Host Pico's signature; how members are notified is Gate M3 / UX work). Without such a statement there is no continuity path — a host that cannot produce one is a new Home (H7), which is exactly the honest answer ADR 0033 required ("same Home with a rotated host key, or a new Home").

The **home reset** is an explicit local startup-time action in the ADR 0076 reset pattern (marker distinct from the operator reset): it destroys host-role identity keys and claim state, is audited (`home.reset`), and returns the host to Setup Mode as a *new* Empty Pico Home. Two hard rules: it must be structurally unable to touch Domain Content Key files (resetting the house never shreds the furniture — key custody namespaces are separated at Gate M2 so the reset path cannot reach KEKs), and it never claims effects on resident identities, resident keys or resident backups (ADR 0024/0033 honesty verbatim).

The stated residual: a copied host disk yields the host keys, and with them continuity impersonation until rotation and member re-acceptance exist — the ADR 0072-family residual, bounded at Gate M3, never denied.

### Operator consolidation under the Home Host Pico

The A11 contract, concretely: **after the founding record exists, host-administration authority *is* the Home Host Pico's**, and the Foundation operator principal becomes one local mechanism for exercising it — the console fallback for a person standing at their own host — never a second root.

- The operator credential never signs anything, is never referenced by any record family, and never appears in any trust chain. It authorizes local API calls; authority semantics come from the Home.
- Post-claim, the operator cannot: issue or countersign membership (no key), read reader-custody domains (ADR 0078 K1/K6 — the keys do not exist on the host), or alter founding/continuity/membership records (signed by keys it does not hold).
- A post-claim operator reset + re-bootstrap (filesystem control) yields exactly what ADR 0076 honestly granted: host-infrastructure power — destructive locally (within Gate B confirmation semantics), never Home authority and never resident readership. Host control stays host control; it does not become identity.
- ADR 0087 implements the local Gate M3 mechanics: credentials/sessions bind to
  the exact founding; credential/session/retention/shred remain local
  infrastructure; Home/domain routes are signed-evidence relay reachable by
  the exact-bound fallback or active founding Home Host Pico. Ordinary members
  and stale/unbound operators are denied. The operator can transport or
  withhold evidence but cannot mint it.

### Audit and diagnostics

`home.claimed` and `home.reset` are reserved as server-synthesized, content-free append-only event types (the ADR 0076 `serverSynthesizedFoundationEventTypes` mechanism reused; references and fingerprints only, never codes or key material). Setup Mode entry, bundle display and failed claim attempts stay in bounded operational logging — reboots and attackers must not grow the undeletable log (A9). The existing `claimState` diagnostic keeps its shape until Gate M2; whether a claimed Home exposes its `homeId` or host fingerprint through `foundation-diagnostic` is a metadata-exposure decision listed in the open questions, not a default.

## Gate M1 canonical layouts and vectors

Gate M1 implements only canonical signature-input construction. The element rule is the ADR 0073/0079 generalized rule: each element is `U32BE(byte_length) || bytes`, element 0 is the domain-separation label, field order is fixed per family, ASCII-token fields use the ADR 0079 token charset, fingerprints are full 32-byte lowercase hex values and nonces are full 32-byte lowercase hex values. Builders do not sign, verify, seal, persist, authorize, generate Move-In Codes, prove freshness or run a claim ceremony.

The on-disk suite is `docs/protocol/fixtures/home-signature-input/` with suite id `pico.home-signature-input.pico_suite_id_v1`. It is separate from the draft Pico Home Link placeholders and from runtime claims.

### M1 labels and field order

| Family | Label | Fixed field order after `label` |
|---|---|---|
| `claim` | `pico.home.claim.v1` | `suite`, `claimId`, `hostSigningKeyFingerprintHex`, `hostKeyAgreementKeyFingerprintHex`, `moveInCode`, `claimantIdentityKeyFingerprintHex`, `claimantNonceHex`, `hostSetupNonceHex` |
| `claimResponse` | `pico.home.claim-response.v1` | `suite`, `claimId`, `homeId`, `hostSigningKeyFingerprintHex`, `hostKeyAgreementKeyFingerprintHex`, `claimantIdentityKeyFingerprintHex`, `claimantNonceHex`, `hostNonceHex`, `foundingRecordId` |
| `founding` | `pico.home.founding.v1` | `suite`, `foundingId`, `homeId`, `hostSigningKeyFingerprintHex`, `hostKeyAgreementKeyFingerprintHex`, `homeHostPicoIdentityFingerprintHex`, `claimantNonceHex`, `hostNonceHex`, `foundedAt`, `lifecycleOrder` |
| `membership` | `pico.home.membership.v1` | `suite`, `credentialId`, `homeId`, `issuerPicoIdentityFingerprintHex`, `subjectPicoIdentityFingerprintHex`, `hostSigningKeyFingerprintHex`, `role`, canonical sorted `scopes`, `validFrom`, `validUntil`, `lifecycleOrder` |
| `membershipLifecycle` | `pico.home.membership-lifecycle.v1` | `suite`, `lifecycleId`, `homeId`, `credentialId`, `issuerPicoIdentityFingerprintHex`, `subjectPicoIdentityFingerprintHex`, `status`, `reasonCategory`, `changedAt`, `lifecycleOrder` |
| `continuity` | `pico.home.continuity.v1` | `suite`, `continuityId`, `homeId`, `outgoingHostSigningKeyFingerprintHex`, `outgoingHostKeyAgreementKeyFingerprintHex`, `incomingHostSigningKeyFingerprintHex`, `incomingHostKeyAgreementKeyFingerprintHex`, `homeHostPicoIdentityFingerprintHex`, `reasonCategory`, `changedAt`, `lifecycleOrder` |

Membership roles are `home_host` and `home_member`. Membership scopes are the ADR 0045 host-use set: `host.use`, `packet.receive`, `storage.queue`, `sync.exchange`. Lifecycle statuses are `invited`, `active`, `revoked`, `expired`, `evicted` and `transferred_or_reissued`.

### Accepted vector hex

- `claim-display-bundle` (`claim`, positive, 266 bytes)

```text
000000127069636f2e686f6d652e636c61696d2e7631000000107069636f2e73756974652e69642e763100000013636c61696d5f32303236303731385f30303031000000201111111111111111111111111111111111111111111111111111111111111111000000202222222222222222222222222222222222222222222222222222222222222222000000114d4f5645494e2d32303236303731382d41000000203333333333333333333333333333333333333333333333333333333333333333000000204444444444444444444444444444444444444444444444444444444444444444000000205555555555555555555555555555555555555555555555555555555555555555
```

- `claim-response-founding-proposal` (`claimResponse`, positive, 302 bytes)

```text
0000001b7069636f2e686f6d652e636c61696d2d726573706f6e73652e7631000000107069636f2e73756974652e69642e763100000013636c61696d5f32303236303731385f3030303100000012686f6d655f32303236303731385f3030303100000020111111111111111111111111111111111111111111111111111111111111111100000020222222222222222222222222222222222222222222222222222222222222222200000020333333333333333333333333333333333333333333333333333333333333333300000020444444444444444444444444444444444444444444444444444444444444444400000020666666666666666666666666666666666666666666666666666666666666666600000016666f756e64696e675f32303236303731385f30303031
```

- `founding-record` (`founding`, positive, 325 bytes)

```text
000000157069636f2e686f6d652e666f756e64696e672e7632000000107069636f2e73756974652e69642e763100000016666f756e64696e675f32303236303731385f3030303100000012686f6d655f32303236303731385f303030310000002011111111111111111111111111111111111111111111111111111111111111110000002022222222222222222222222222222222222222222222222222222222222222220000002077777777777777777777777777777777777777777777777777777777777777770000002055555555555555555555555555555555555555555555555555555555555555550000002099999999999999999999999999999999999999999999999999999999999999990000001164656c5f32303236303731385f3030303100000020444444444444444444444444444444444444444444444444444444444444444400000020666666666666666666666666666666666666666666666666666666666666666600000018323032362d30372d31385430393a30303a30302e3030305a000000147365713a30303030303030303030303030303031
```

- `membership-home-member` (`membership`, positive, 365 bytes)

```text
000000177069636f2e686f6d652e6d656d626572736869702e7631000000107069636f2e73756974652e69642e7631000000146d656d6265725f32303236303731385f3030303100000012686f6d655f32303236303731385f303030310000002088888888888888888888888888888888888888888888888888888888888888880000002099999999999999999999999999999999999999999999999999999999999999990000002011111111111111111111111111111111111111111111111111111111111111110000000b686f6d655f6d656d626572000000013400000008686f73742e7573650000000e7061636b65742e726563656976650000000d73746f726167652e71756575650000000d73796e632e65786368616e676500000018323032362d30372d31385430393a30303a30302e3030305a00000018323032362d31302d31385430393a30303a30302e3030305a000000147365713a30303030303030303030303030303031
```

- `membership-scope-order-canonical` (`membership`, positive, 365 bytes; matches `membership-home-member`)

```text
000000177069636f2e686f6d652e6d656d626572736869702e7631000000107069636f2e73756974652e69642e7631000000146d656d6265725f32303236303731385f3030303100000012686f6d655f32303236303731385f303030310000002088888888888888888888888888888888888888888888888888888888888888880000002099999999999999999999999999999999999999999999999999999999999999990000002011111111111111111111111111111111111111111111111111111111111111110000000b686f6d655f6d656d626572000000013400000008686f73742e7573650000000e7061636b65742e726563656976650000000d73746f726167652e71756575650000000d73796e632e65786368616e676500000018323032362d30372d31385430393a30303a30302e3030305a00000018323032362d31302d31385430393a30303a30302e3030305a000000147365713a30303030303030303030303030303031
```

- `membership-lifecycle-evicted` (`membershipLifecycle`, positive, 290 bytes)

```text
000000217069636f2e686f6d652e6d656d626572736869702d6c6966656379636c652e7631000000107069636f2e73756974652e69642e76310000001e6d656d6265725f6c6966656379636c655f32303236303731385f3030303200000012686f6d655f32303236303731385f30303031000000146d656d6265725f32303236303731385f3030303100000020888888888888888888888888888888888888888888888888888888888888888800000020999999999999999999999999999999999999999999999999999999999999999900000007657669637465640000000e6d656d6265725f72656d6f76656400000018323032362d30372d31385430393a31303a30302e3030305a000000147365713a30303030303030303030303030303032
```

- `continuity-host-rotation` (`continuity`, positive, 349 bytes)

```text
000000177069636f2e686f6d652e636f6e74696e756974792e7631000000107069636f2e73756974652e69642e763100000018636f6e74696e756974795f32303236303731385f3030303200000012686f6d655f32303236303731385f3030303100000020111111111111111111111111111111111111111111111111111111111111111100000020222222222222222222222222222222222222222222222222222222222222222200000020aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00000020bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb00000020777777777777777777777777777777777777777777777777777777777777777700000010686f73745f6b65795f726f746174656400000018323032362d30372d31385430393a31303a30302e3030305a000000147365713a30303030303030303030303030303032
```

- `claim-suite-swap` (`claim`, negative bind-difference, 266 bytes)

```text
000000127069636f2e686f6d652e636c61696d2e7631000000107069636f2e73756974652e69642e763200000013636c61696d5f32303236303731385f30303031000000201111111111111111111111111111111111111111111111111111111111111111000000202222222222222222222222222222222222222222222222222222222222222222000000114d4f5645494e2d32303236303731382d41000000203333333333333333333333333333333333333333333333333333333333333333000000204444444444444444444444444444444444444444444444444444444444444444000000205555555555555555555555555555555555555555555555555555555555555555
```

- `claim-wrong-host-pin` (`claim`, negative bind-difference, 266 bytes)

```text
000000127069636f2e686f6d652e636c61696d2e7631000000107069636f2e73756974652e69642e763100000013636c61696d5f32303236303731385f30303031000000201212121212121212121212121212121212121212121212121212121212121212000000202222222222222222222222222222222222222222222222222222222222222222000000114d4f5645494e2d32303236303731382d41000000203333333333333333333333333333333333333333333333333333333333333333000000204444444444444444444444444444444444444444444444444444444444444444000000205555555555555555555555555555555555555555555555555555555555555555
```

- `claim-stale-move-in-code` (`claim`, negative bind-difference, 268 bytes)

```text
000000127069636f2e686f6d652e636c61696d2e7631000000107069636f2e73756974652e69642e763100000013636c61696d5f32303236303731385f30303031000000201111111111111111111111111111111111111111111111111111111111111111000000202222222222222222222222222222222222222222222222222222222222222222000000134d4f5645494e2d32303236303731382d4f4c44000000203333333333333333333333333333333333333333333333333333333333333333000000204444444444444444444444444444444444444444444444444444444444444444000000205555555555555555555555555555555555555555555555555555555555555555
```

- `claim-foreign-move-in-code` (`claim`, negative bind-difference, 267 bytes)

```text
000000127069636f2e686f6d652e636c61696d2e7631000000107069636f2e73756974652e69642e763100000013636c61696d5f32303236303731385f3030303100000020111111111111111111111111111111111111111111111111111111111111111100000020222222222222222222222222222222222222222222222222222222222222222200000012464f524549474e2d32303236303731382d41000000203333333333333333333333333333333333333333333333333333333333333333000000204444444444444444444444444444444444444444444444444444444444444444000000205555555555555555555555555555555555555555555555555555555555555555
```

- `claim-cross-ceremony-nonce` (`claim`, negative bind-difference, 266 bytes)

```text
000000127069636f2e686f6d652e636c61696d2e7631000000107069636f2e73756974652e69642e763100000013636c61696d5f32303236303731385f30303031000000201111111111111111111111111111111111111111111111111111111111111111000000202222222222222222222222222222222222222222222222222222222222222222000000114d4f5645494e2d32303236303731382d41000000203333333333333333333333333333333333333333333333333333333333333333000000204545454545454545454545454545454545454545454545454545454545454545000000205555555555555555555555555555555555555555555555555555555555555555
```

- `founding-cross-ceremony-nonce` (`founding`, negative bind-difference, 325 bytes)

```text
000000157069636f2e686f6d652e666f756e64696e672e7632000000107069636f2e73756974652e69642e763100000016666f756e64696e675f32303236303731385f3030303100000012686f6d655f32303236303731385f303030310000002011111111111111111111111111111111111111111111111111111111111111110000002022222222222222222222222222222222222222222222222222222222222222220000002077777777777777777777777777777777777777777777777777777777777777770000002055555555555555555555555555555555555555555555555555555555555555550000002099999999999999999999999999999999999999999999999999999999999999990000001164656c5f32303236303731385f3030303100000020454545454545454545454545454545454545454545454545454545454545454500000020666666666666666666666666666666666666666666666666666666666666666600000018323032362d30372d31385430393a30303a30302e3030305a000000147365713a30303030303030303030303030303031
```

- `membership-role-swap` (`membership`, negative bind-difference, 363 bytes)

```text
000000177069636f2e686f6d652e6d656d626572736869702e7631000000107069636f2e73756974652e69642e7631000000146d656d6265725f32303236303731385f3030303100000012686f6d655f32303236303731385f3030303100000020888888888888888888888888888888888888888888888888888888888888888800000020999999999999999999999999999999999999999999999999999999999999999900000020111111111111111111111111111111111111111111111111111111111111111100000009686f6d655f686f7374000000013400000008686f73742e7573650000000e7061636b65742e726563656976650000000d73746f726167652e71756575650000000d73796e632e65786368616e676500000018323032362d30372d31385430393a30303a30302e3030305a00000018323032362d31302d31385430393a30303a30302e3030305a000000147365713a30303030303030303030303030303031
```

### Reject-only M1 vectors

The canonicalization-negative suite also includes reject-only cases with no canonical bytes:

- `claim-cross-family-label` -> `cross_family_label_confusion`
- `founding-missing-host-key-agreement` -> `missing_field`; this is the structural M1 analogue of an inert half-bound founding input before signature verification exists
- `membership-issuerless-countersignature-only` -> `missing_field`
- `membership-unknown-scope` -> `invalid_membership_scope`
- `membership-duplicate-scope` -> `duplicate_scope`
- `membership-validity-inverted` -> `invalid_validity_bounds`
- `membership-validity-offset-form` -> `invalid_instant`
- `continuity-without-outgoing-key` -> `missing_field`
- `continuity-invalid-lifecycle-order` -> `invalid_lifecycle_order`

Protected timestamps (`foundedAt`, `validFrom`, `validUntil`, `changedAt`) carry the ADR 0079 rule: exactly `YYYY-MM-DDTHH:MM:SS.sssZ`, rejected as `invalid_instant` otherwise, because membership validity is decided by comparing these fields as strings and a UTC offset sorts before `Z` at the same instant.

## Ordering gates

**Precondition — a Pico Vault custody story.** The claimant signs the founding record with a person-role identity key, and ADR 0079 G2 forbids creating person-role private keys on the Foundation host. Therefore the claim runtime cannot exist before a dedicated person-identity custody ADR and a Vault-side holder of those keys exist. *The custody ADR exists, and ADR 0081 P2 now supplies the minimal `@pico/vault` holder.* The tempting shortcut — generating the claimant identity on the host "just for the demo" — is exactly the accretion ADR 0079 G2 forbids, and it would invert the entire tenancy model at its root: the house would own its first resident. The claim path still waits for M1/M2/M3; the Empty Pico Home cannot be claimed by moving person keys onto the host.

1. **Gate M1 — Ceremony and record layouts with authoritative vectors. Done for canonical bytes.** I3 layouts and ADR 0073-style accept/reject vectors now exist for claim messages (`pico.home.claim.v1`, `pico.home.claim-response.v1`), founding record (`pico.home.founding.v1`), membership credential (`pico.home.membership.v1`), continuity statement (`pico.home.continuity.v1`) and membership lifecycle statements (`pico.home.membership-lifecycle.v1`) — consuming ADR 0079 G1 (key records, possession, delegation). The vector suite includes wrong-host pins, stale or foreign codes, cross-ceremony transplants, structurally incomplete founding inputs, issuer-less or countersignature-only credentials, continuity without the outgoing key, and role/suite swaps. The ADR 0045/0056/0057/0066 fixture fences loosen only for these authoritative bytes; placeholder fixtures remain draft-only and no runtime or security claim follows from M1 alone.
2. **Gate M2 — Host-side runtime: Setup Mode, host-key custody, reconciliation. Partially implemented.** Host keypair generation at Setup Mode entry, separated file custody, the per-process Move-In Code, setup bundle, sealed claim/founding path, H8 boot reconciliation, distinct reset and content-free audit exist. Protected-display integration and production claim UX remain.
3. **Gate M3 — Membership runtime and consolidation. Partially implemented.** Credential and lifecycle-statement verification, host activation, membership projection, validity/eviction and restore reconciliation drive the ADR 0077/0078 read seam through ADR 0082. ADR 0087 implements operator/Home-Host consolidation for the local API. K5 key-rotation coupling and continuity acceptance/member notification remain.

The M1 byte layouts are security-relevant only as reviewed signature inputs.
Setup/founding is partial M2 runtime and signed membership/lifecycle is partial
M3 runtime. Protected display UX, external freshness, continuity and
key-rotation coupling remain behind M2/M3.

## Non-goals

This ADR does not define or implement:

- member invitation transport/UX and onboarding beyond relaying an already signed credential
- invitation transport, invitation UX or member onboarding beyond the credential direction
- remote claim, Pico Link claim, relay registration or any transport (ADR 0028/0030 boundaries unchanged)
- person-identity custody (the dedicated ADR that the precondition demands)
- recovery of identities, Homes or credentials (ADR 0033 boundary; a dead host without a continuity statement is a lost Home, stated plainly)
- Home handover between people (`transferred_or_reissued` governance), Home-to-Home relationships, or multi-host Homes
- eviction cleanup policy for host-local ciphertext (ADR 0024's optional-policy stance unchanged)
- Setup Mode UX, first-boot imaging or packaging (ADR 0027's product path)
- TLS, mDNS/discovery hardening or browser trust for appliances
- any loosening of the ADR 0045/0056/0057/0066 fixture fences beyond the Gate M1 authoritative byte-vector scope

## Open questions

- **The typed-code path.** Where no display can carry pins, two shapes exist: user-verified fingerprint comparison (UX-heavy, honest), or serving the host's key records MACed with the code (keyed BLAKE2b — reviewed primitive, no new dependency, but it exposes the code to offline grinding from a captured bundle and softens H1's "never key material" purity). Neither is normative here; whichever is chosen must be its own reviewed decision, and silent trust-on-first-use is not a fallback.
- **Possession folding** — display-carried host challenge versus explicit round trip (Gate M1 layout work; both satisfy I6).
- **Member notification and acceptance UX for continuity statements** (Gate M3): what a member device shows when the host key rotates, and what refusal does.
- **Whether a claimed Home raises the diagnostic bar** the way an existing operator does (ADR 0076's decided behaviour), and whether `homeId`/host fingerprint belong in `foundation-diagnostic` responses at all.
- **Per-platform bundle channels**: what the Home Assistant add-on can display (QR in the add-on UI?), what a headless container gets, and how the appliance image shows the bundle (ADR 0027 channels, concretized per platform at Gate M2).
- **Eviction-to-rotation coupling policy**: K5 says rotate "where future secrecy is required" — who states that requirement per domain, and what the default is for household domains.
- **Eventual operator retirement:** ADR 0087 chooses the exact-bound console
  fallback for the current local surface. Whether deployable Vault transport
  later permits removing it is a future operational decision and may not widen
  its authority meanwhile.

## Consequences

Positive:

- the last root ceremony of the tenancy strand is designed from the same small toolkit — sealed box, detached signatures, digests under `pico.suite.id.v1`/I3 layouts — with zero new primitives and both rejected alternatives (trust-on-first-use, PAKE) named
- the pairing MITM is closed structurally by the display bundle: the channel ADR 0027 already requires now carries the trust root, and the network is never trusted in either direction
- the empty-house model becomes cryptographic: `homeId` minted at founding makes "reset = new Home" structural, mutual signatures make "hosting is not owning" a record-format fact, and custody separation (H5) keeps the host from ever holding its residents
- the operator principal gets its promised current end-state (A11/ADR 0087):
  an exact-bound console fallback and signed-evidence relay, instead of an
  indefinite second root
- ADR 0078 R3 now has verified membership and, through ADR 0082, a signed
  host-custody domain-grant/readership runtime; reader-custody key distribution
  remains future
- every fixture fence stays intact, and the precondition makes the worst shortcut (host-generated claimant identity) impossible to take quietly

Negative:

- the remaining claim work is product and platform hardening rather than a
  missing cryptographic root, but protected-display validation is still
  release-blocking for production claims
- the display-bundle requirement constrains minimal setups; the typed-code path stays unresolved rather than quietly weakened
- per-process codes mean a mid-setup restart re-pairs from the display — the ADR 0076 trade accepted again for the same reason (restart proves local control)
- an unplanned host death without a continuity statement is a lost Home under H7; honest, and recovery work is explicitly deferred rather than promised
- the stolen-host-disk continuity residual stands until Gate M3 rotation/acceptance exists
- two more mutually signed record families mean more layouts and vectors before anything ships — the deliberate ADR 0079 friction, applied to the most consequential records in the system

## Relationship to other ADRs

- Realizes the ADR `0024`/`0027` claim concept as a reviewed ceremony direction: the empty-house model, Setup Mode, Move-In Code semantics and protected display channels become properties H1–H10 with gates; the bootstrap-flow open questions of ADR 0024 (display, expiry, replay, audit) are answered at direction level.
- Consumes ADR `0079` end to end: the suite and key-record family (host keys are `home_host_signing` and `home_host_key_agreement` role records), I3 layouts for every ceremony and record family, I6 possession, I8 delegation (`home_membership` scope for membership administration), I9 lifecycle ordering for membership and continuity statements, and the G2 custody split — host-role discharged at Gate M2, person-role as the precondition.
- Constrained by ADR `0016`: sealed box, detached signatures and keyed/labeled digests only; a PAKE is rejected as a new primitive family; binding-by-inclusion (the ADR `0078` K3 pattern) is message format, not construction.
- Realizes the ADR `0032`/`0045` membership credential family direction (issuer + activation split, 0045 vocabulary) and answers the ADR `0031` Home-membership requirements (issuer/verifier roles, states, expiry/replay, host-key relationship, domain-key relationship via ADR 0078, audit, reset behaviour).
- Keeps ADR `0033` verbatim: reset is not identity destruction, recovery is never granted by Home role or Move-In Code, rotation must answer "same Home or new Home" — H7 makes the answer signed-or-new.
- Realizes the ADR `0075` A10/A11 seam: the claim endpoint takes the reserved `setup-bootstrap` class, and H9 is the consolidation contract A11 demanded; ADR `0076` mechanics (per-process codes, bounded verification, reset markers, server-synthesized audit) are reused, with its bootstrap code and the Move-In Code kept strictly distinct.
- Supplies ADR `0078` Gate R3's membership records; readership stays separate from membership (K1 custody classes unchanged), and eviction couples to K5 rotation.
- The ADR `0056`/`0057`/`0066` (and `0045`) draft fences now loosen only for Gate M1's authoritative byte-vector scope; all draft placeholders outside those bytes stay draft-only. ADR `0026` product terminology binds throughout (Empty Pico Home, Move-In Code, Home Host Pico, Pico Vault).
