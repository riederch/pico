# 0079 - Pico Identity and Device Key Threat Model and Primitive Direction

## Status

Accepted as the threat model and primitive direction for Pico Identity Keys and Device Keys, and as the selection of the **signature-input canonicalization method** for Pico-signed records: the suite direction `pico.suite.id.v1` (Ed25519 signing, X25519 key agreement, BLAKE2b fingerprints, all libsodium), the two-keypair device rule, labeled length-prefixed binary signature inputs (the ADR 0073 method generalized), fingerprint and possession-proof direction, and per-role custody boundaries — behind three gates. **It implements nothing**: no key is generated, no signature verified, no draft fence (ADR 0051/0052/0053/0055) loosened at fixture level. It is the reviewed key-format direction those fences said must exist before anything chooses algorithms or serialization.

## Context

Two accepted directions now block on the same missing layer. ADR 0078 gates reader-custody key distribution on **R1** (real reader keys with a delegation and possession story) and **R2** (canonical envelope bytes); the future claim flow (ADR 0024/0027, ADR 0056 placeholder) needs a Home Host Key that can sign membership credentials (ADR 0045); signed event segments and manifests (ADR 0032) need author keys. Every one of these consumes the same three things: **key material of decided primitives, canonical bytes to sign, and a delegation/lifecycle story** (ADR 0029/0033).

What exists on that path is concept and fence, plus one proof. ADR 0029 fixes the key roles; ADR 0031 the threat model; ADR 0033 the lifecycle vocabulary; ADR 0034 the canonicalization discipline — deliberately not choosing between canonical JSON, deterministic CBOR or a layered model. ADRs 0051/0052/0053/0055 fence draft fixtures and explicitly reject any fixture that picks final algorithms, serialization or fingerprints "before a reviewed key-format ADR exists". The proof is ADR 0073: for the one surface where canonical bytes already carry security meaning (the memory-content AD), the tree chose a labeled, length-prefixed binary layout with authoritative vectors — and it has held up in implementation and negative-vector coverage.

This ADR is that reviewed key-format step, taken as direction with gates, in the ADR 0071/0078 pattern: decide the primitives and the method once, maximally reviewed, before any strand builds its own by accretion.

## Scope

Covers: primitive and format **direction** for Pico Identity Keys and Device Keys (signing and key agreement), the signature-input canonicalization method for all future Pico-signed record families, key-record and fingerprint shape, possession-proof direction, delegation/revocation record direction, and custody boundaries for private material per key role.

Does not cover: the claim/Move-In flow and Home Host Key creation (next ADR in this strand), membership credential semantics (ADR 0045 family), relationship/introduction trust between Picos, recovery flows (ADR 0033 boundary unchanged), key registries, transport, group messaging, or any runtime. The Foundation auth layer (ADR 0075/0076) is explicitly out of scope as a consumer: operator sessions gain no identity semantics from this ADR.

## Threat model

### Protected assets

- private identity key material — its compromise is identity compromise (ADR 0031 lists it first)
- private device key material — operational signing and domain decryption until revoked
- the integrity of delegation: which device keys act for which identity, in which scopes
- the unambiguity of signature inputs — the property that a signature means one thing, for one family, under one suite
- fingerprint integrity: that a short identifier cannot be steered to two keys
- lifecycle truth: that revocation, once stated, cannot be silently rewound

### Attacker model

Extending ADR 0031 with the attacks this layer itself creates:

| Attacker | Capability | Posture direction |
|---|---|---|
| Signature-confusion attacker | Replays a signature over one record family, suite or role as another (delegation as revocation, device key as identity key, v1 bytes under v2 rules). | Killed structurally: every signature and hash input begins with a versioned family label, and suite and role are protected fields (I3/I4). Cross-anything replay fails at byte level, not at reviewer discipline. |
| Fingerprint substitution / truncation abuse | Grinds a key whose truncated fingerprint matches a target's display prefix. | Fingerprints are full-length labeled digests binding `{suite, role, key}`; security-relevant comparison of truncated forms is forbidden (I5). Display shortening is UX and never an input. |
| Stolen device | Holds delegated private material; signs within scope until revoked. | Delegation is scoped and expiring (I8); revocation is a signed lifecycle statement with ordering context (I9); domain impact runs through ADR 0078 rotation. Identity survives device loss (ADR 0033). |
| Malicious host serving key records | Withholds or serves stale delegation/revocation records; tries to forge them. | Records are signed by the identity key, so a host can withhold but not fabricate (I8); freshness is monotonic over signed lifecycle statements, and restores reconcile toward the freshest (I9). Withholding stays detectable-not-preventable — stated, and bounded later by manifests (ADR 0032). |
| Stale-backup attacker | Restores a pre-revocation state to resurrect a revoked device. | The ADR 0033 rule made mechanical: lifecycle statements carry ordering context; reconciliation resolves toward the newest statement, never toward the restored one (I9) — tombstone-family, third instance after ADR 0070 and 0078 K8. |
| Cross-primitive key reuse | Exploits one key used for both signing and key agreement (Ed25519→X25519 conversion). | Forbidden by construction: devices carry two independent keypairs; conversion APIs are not used (I1). The sharp edge is removed rather than argued about. |
| Custody thief (host disk, backup artifact) | Reads private key files. | Private material never enters SQLite, the event log, env vars, logs or data-backup artifacts (I7, the ADR 0072 R6 family generalized); per-role custody is a gate (G2), and the stolen-disk residual is stated per custody story, as in ADR 0072 — never papered over. |
| Ambient-authority laundering | Elevates a transport ID, relay account, ingress header, operator session or Move-In Code into identity. | I10 restates ADR 0029/0031 and ADR 0075 A11 as a property of this layer: nothing but possession of private key material under a verified delegation is identity. |

### The ADR 0016 questions, answered for this surface

1. **Who controls keys?** The identity owner. Devices hold delegated operational material; the host holds host-role material only; there is no registry, no CA, no issuer above the identity key. Trust paths between *different* identities (how two Picos come to trust each other's roots) are deliberately out of scope — a later relationship ADR.
2. **Which devices can read which domain?** Through ADR 0078: this ADR supplies the device X25519 key and the signed delegation that binds it; the reader set stays a domain decision, never a key-existence side effect.
3. **What can a server see?** Public keys, key records, fingerprints, delegation and revocation records — public by design. Never private material, under any role (I7).
4. **What can a relay see?** Nothing new; routing identities stay below identity (ADR 0029/0031). Public records traverse as payloads when transport exists.
5. **What happens after device loss?** The identity signs a revocation statement for the device's delegation; ADR 0078 rotation handles domain impact; ADR 0033's preserved-history rule applies — old signatures stay historically verifiable, future trust ends.
6. **What happens after relationship revocation?** Not this layer: identity keys are not relationship state, and nothing here encodes relationships.
7. **How does backup restore work?** Public records restore trivially. Private material follows its custody story (G2) with R6-family separation. Stale lifecycle state reconciles toward the freshest signed statement (I9); a restore can lose recent delegations (re-delegate) but must not resurrect revoked ones.
8. **How does deletion interact with protected payloads?** Key records and lifecycle statements are metadata, not content; revocation is never erasure (ADR 0033), and content deletion stays the ADR 0070/0074 machinery. Signed history remains verifiable after the signer's revocation — by design, with the lifecycle state carrying the trust cut-off.

## Required properties

- **I1 — Role separation without key reuse.** The identity key signs delegations and lifecycle statements; device signing keys sign operations within delegated scope; device key-agreement keys decrypt and nothing else. Signing and key agreement are **independent keypairs**; Ed25519↔X25519 conversion is not used. One keypair, one primitive, one purpose.
- **I2 — One suite, versioned.** `pico.suite.id.v1` = Ed25519 (libsodium `crypto_sign`, detached), X25519 (the ADR 0078 reader-key primitive), BLAKE2b-256 (`crypto_generichash`) for fingerprints and digests. Deviations — hardware-backed P-256/passkey-class keys, post-quantum hybrids — are new suites with their own vectors, never silent changes (the ADR 0071/0078 rule).
- **I3 — Signature inputs are labeled length-prefixed binary layouts.** The ADR 0073 method, generalized: element = `U32BE(length) || bytes`, the versioned family label is element 0, field order is fixed per family, and every family publishes authoritative accept/reject vectors before security relevance. Display or transport JSON is never the signature input; no JSON canonicalization and no deterministic-CBOR encoder enters the trust path. The verifier reassembles canonical bytes from already-validated semantic fields — there is no parser between the attacker and the signature check.
- **I4 — Universal domain separation.** Every signature input and every security-relevant digest starts with its family label, and covers the suite identifier and the key role wherever a key is referenced. A signature over one family, suite or role can never verify as another; downgrade attempts fail authentication rather than policy review.
- **I5 — Fingerprints bind suite, role and key, full-length.** A key fingerprint is the labeled BLAKE2b-256 digest of the canonical key-record bytes `{label, suite, keyRole, publicKey}`. Security-relevant comparisons use the full digest; truncated or prettified display forms are never comparison inputs. Fingerprint equality is never a possession proof (ADR 0055's rule kept).
- **I6 — Possession before records.** A signing key enters any accepted record only with a challenge-response possession proof (a detached signature over a labeled challenge with verifier-chosen nonce and context). Key-agreement keys prove nothing by challenge; they are bound by the signed delegation, and an envelope sealed to them is self-enforcing — unusable without the private key.
- **I7 — Custody is explicit and separated.** Private key material never enters SQLite, the append-only event log, environment variables, process logs or any artifact that data backups capture — the ADR 0072 R6 rule generalized from domain KEKs to all private key material. Host-role and person-role material never share a key or a custody location. Each role's concrete custody story is gated (G2), and its residual risks are stated in the ADR that decides it.
- **I8 — Delegation is explicit, scoped, signed — or inert.** Devices never self-delegate. A delegation names issuer, subject keys (both of them), scope (ADR 0033 vocabulary), and validity in the protected input. An unsigned or unverified delegation record has no effect — the ADR 0078 K4 rule, applied to identity.
- **I9 — Lifecycle is monotonic and restore-safe.** Delegation and revocation are signed lifecycle statements carrying explicit ordering context (sequence or predecessor reference in the protected input). Verification consumes lifecycle state, not signature validity alone (ADR 0034's lifecycle-negative family). After a restore, reconciliation resolves toward the freshest statement; a revoked device stays revoked even when the restored disk predates its revocation.
- **I10 — No ambient identity.** Transport identifiers, relay accounts, ingress headers, Foundation operator sessions, static tokens and Move-In Codes neither are, unlock, nor recover identity keys. ADR 0075 A11 stays intact from this side: the operator principal does not become an identity, and identity keys do not become logins.

## Decision

### The suite: `pico.suite.id.v1`

Ed25519 for every signature, X25519 for every key agreement, BLAKE2b-256 for every fingerprint and security-relevant digest — all through the already-present libsodium, no new dependency, no new primitive family (ADR 0016). This is the same consolidation argument ADR 0071 made for content encryption: one reviewed toolkit, smallest possible zoo, and the deviation path is a *new suite*, never an in-place change. Signatures are detached (`crypto_sign_detached`) over canonical bytes, so records carry their signature alongside, not embedded in, the protected input.

### Devices carry two independent keypairs

A device holds an Ed25519 signing keypair and an X25519 key-agreement keypair, generated independently. The identity's delegation binds both to the device in one signed record. Ed25519→X25519 conversion (`crypto_sign_ed25519_sk_to_curve25519`) is deliberately not used: cross-primitive key reuse is a known sharp edge with subtle failure modes, and two keypairs cost nothing while keeping lifecycles independent — a device can rotate its key-agreement key (with re-wrapping under ADR 0078) without touching its signing continuity, and vice versa.

### The canonicalization method: ADR 0073, generalized

This is the decision ADR 0034 left open, and it is made narrowly: **for Pico-signed record families, the signature input is an explicit per-family binary layout** — versioned family label first, `U32BE(length) || bytes` elements, fixed field order, field-level validation before assembly — exactly the construction ADR 0073 proved for the memory AD, now promoted from one internal surface to the method for identity-strand records.

Why not canonical JSON or deterministic CBOR: both put an encoder — Unicode normalization, number formatting, map ordering, parser variance — into the trust path, which is precisely the ambiguity ADR 0034 demands be rejected *before* it reaches cryptography. The explicit layout has no parser between attacker input and signature check: fields are validated semantically, then assembled into bytes by construction. It is trivially deterministic cross-language, handles binary fields natively (public keys are bytes, not base64 detours), and its fixture story is already proven in-tree with authoritative accept/reject vectors. The accepted cost is real and stated: every signed family needs an explicit layout specification and its own vectors — there is no generic "canonicalize any object" function. At Pico's scale of record families, that cost is schema discipline, not overhead.

JSON remains what it is today: transport and display. A record travels as JSON, is validated into semantic fields, and only those fields — through the family's layout — become signature input. The JSON never is.

### Key records and fingerprints

A key record's canonical bytes are `{label: pico.id.keyrecord.v1, suite, keyRole, publicKey}`; its fingerprint is the labeled BLAKE2b-256 digest of exactly those bytes. Binding role and suite into the fingerprint means a device key cannot be presented as an identity key and a v1 key cannot collide into a future suite's namespace — substitution fails at the digest, not at review. Creation metadata (timestamps, names) lives outside the fingerprint: a fingerprint identifies the key, not its paperwork. Full-length comparison only (I5); display encoding of fingerprints is UX and decided with the surfaces that show them.

### Delegation, possession and revocation direction

The record families this ADR sets direction for — final layouts and vectors are Gate G1 work:

- **Device delegation** (`pico.id.delegation.v1` direction): issuer identity fingerprint, subject device signing-key and key-agreement-key fingerprints, scope set (ADR 0033 vocabulary: `sign_history`, `decrypt_domain`, …), validity bounds, ordering context; signed by the identity key. Realizes the ADR 0051 placeholder toward an implementable shape.
- **Possession challenge** (`pico.id.possession.v1` direction): verifier nonce, context binding (who is verifying, for what), subject key fingerprint; answered by a detached signature. Never reusable across contexts — the label and context are protected input.
- **Revocation statement** (`pico.id.revocation.v1` direction): subject key or delegation reference, reason category, ordering context; signed by the identity key. Realizes the ADR 0052/0053 placeholders' direction. Revocation is never erasure: historical signatures stay verifiable with lifecycle state carrying the trust cut-off (ADR 0033).

All three stay inert (I8, K4-family) until Gate G1 vectors exist and Gate G3 defines how lifecycle state is looked up and reconciled.

### Custody boundaries

Private material custody is decided per role, each in its own step, under the I7 floor (never in SQLite, the event log, env vars, logs or data-backed-up artifacts):

- **Host-role keys** (the future Pico Home Host Key, ADR 0056 realization): file-based custody with ADR 0072 semantics — a separated key directory, backup-exclusion as a release-blocking packaging rule, stated stolen-disk residual — is an acceptable starting point, because host keys are host state. Their creation belongs to the claim-flow ADR (now ADR 0080; its Gate M2 discharges this role).
- **Person-role keys** (Pico Identity, device keys of the owner): **no person-identity private key is created on the Foundation host until a dedicated custody ADR exists** (G2) — vault, platform keystore, passphrase protection (age-style, ADR 0016 allowed direction) or hardware-backed, with the honest analysis each implies. Convenience file storage of a person's identity root is exactly the accretion this ADR exists to forbid. That ADR now exists: ADR 0081 fixes the Vault-exclusive boundary, the encrypted keyfile format and the agent-pattern process boundary.

## Ordering gates

Nothing runtime ships before its gates; nothing at all is security-relevant before **G1**.

1. **Gate G1 — Canonical layouts and authoritative vectors.** Per-family byte layouts (key record, possession challenge, delegation, revocation) with ADR 0073-style accept/reject vectors, including negative vectors for cross-family label confusion, suite swap, role swap, field reordering, truncated-fingerprint comparison and validity/ordering violations. This gate also discharges ADR 0078's Gate R2 method question: envelope bytes use the same construction.
2. **Gate G2 — Custody story per key role.** Host-role: ADR 0072-pattern file custody, decided alongside the claim flow (now ADR 0080, Gate M2). Person-role: a dedicated custody ADR before any person-identity key exists anywhere (now ADR 0081 — Vault-exclusive custody, `pico.vault.keyfile.v1` direction; the runtime discharge is its Gate P2).
3. **Gate G3 — Lifecycle lookup and reconciliation.** How delegation and revocation statements are stored, ordered, looked up at verification time, and reconciled after restore (I9) — the ADR 0033 realization for these two record families, with its own lifecycle-negative vectors.

After all three: runtime in additive steps (key generation under custody, possession verification, delegation verification), at which point ADR 0078 R1 is dischargeable and the claim-flow ADR has its signing machinery.

## Non-goals

This ADR does not define or implement:

- the claim/Move-In flow, Setup Mode, or Home Host Key creation (now ADR 0080; ADR 0024/0027/0056 boundaries unchanged here)
- membership credential semantics or issuance (ADR 0045 family — a consumer of this direction, not part of it)
- relationship or introduction trust between identities (no CA, no registry, no web-of-trust decision here)
- recovery, social recovery, or identity replacement continuity records (ADR 0033 boundary; explicitly future)
- key generation, storage, serialization code, or any runtime verification
- signed event segments or manifests (ADR 0032 families — future consumers of the I3 method)
- passkey/hardware-backed identity (a future suite, per I2)
- post-quantum selection (see open questions)
- any change to the Foundation auth layer (ADR 0075/0076) or to draft fixture fences (ADR 0051/0052/0053/0055 stay exactly as strict)

## Open questions

- ~~**Person-identity custody** (G2): vault process, platform keystore, passphrase-protected file, hardware — and what the first real deployment (Home Assistant add-on) can honestly offer. Its own ADR.~~ Decided in ADR 0081: Vault-exclusive custody with one canonical encrypted keyfile (`pico.vault.keyfile.v1`, Argon2id + XChaCha20-Poly1305), platform keystores as unlock paths only — and the honest add-on answer is that nothing deployable today can hold person keys.
- **Ordering context format** for lifecycle monotonicity (I9): plain sequence numbers vs predecessor references (hash chaining) — decided at G3 with its reconciliation semantics.
- **Fingerprint display encoding** for humans (grouping, prefix, checksum) — UX work; the comparison rule (full digest only) is fixed here regardless.
- **Post-quantum.** Ed25519/X25519 are chosen for review maturity and toolkit consolidation. Harvest-now-decrypt-later pressure applies to key agreement (ADR 0078 envelopes), not signatures; a PQ or hybrid suite would arrive as `pico.suite.id.v2`/`pico.suite.share.v2` through the normal deviation path. Revisit when reviewed implementations stabilize, not before.
- **Whether signed event segments adopt I3 verbatim** — presumably yes, but their ADR decides, with their own families and vectors.
- **Identity rotation continuity** (replacing a compromised identity root while preserving relationships) — ADR 0033 names it; it needs the relationship layer to mean anything, so it waits for that strand.

## Consequences

Positive:

- one suite and one canonicalization method for the whole identity strand, decided once in a reviewed step — ADR 0078's R1/R2 and the claim flow now consume a direction instead of each inventing one
- the trust path contains no parser and no encoder: signature inputs are assembled bytes with published vectors, extending a construction already proven in-tree (ADR 0073)
- signature confusion, suite downgrade, role substitution and fingerprint truncation are closed structurally (labels, protected suite/role fields, full-length digests) rather than by review vigilance
- the two-keypair rule removes the Ed25519↔X25519 conversion sharp edge at zero cost, and keeps signing and decryption lifecycles independent
- custody floors (I7) generalize R6 before any private key exists, so no key ever lands in a data backup by default-path accident
- every draft fence stays intact: fixtures remain placeholder-only until G1 vectors exist

Negative:

- three gates and at least two follow-up ADRs (custody, claim flow) stand between this direction and any running identity code — accepted, as in ADR 0078: the alternative is accretion on the identity root
- per-family byte layouts mean every new signed record type costs a layout spec and vectors before it can ship — deliberate friction on the most dangerous kind of surface growth
- rejecting canonical JSON/CBOR means Pico records are not verifiable by generic canonicalization tooling; verifiers must implement the (simple) element rule per family
- the host-withholding residual (a host can serve stale-but-signed lifecycle state by omission) is only detectable, not preventable, until manifests (ADR 0032) exist — stated now, owned there

## Relationship to other ADRs

- Realizes the reviewed key-format direction that **ADR 0055** (and the ADR 0051/0052/0053 fences) required before any fixture or implementation may choose algorithms, serialization or fingerprints; the fences themselves stay unchanged until Gate G1 vectors exist.
- Makes the **ADR 0034** canonicalization decision for Pico-signed record families — labeled length-prefixed binary layouts, per-family vectors — by generalizing the **ADR 0073** construction from the memory-AD surface; ADR 0034's fixture families and error-category discipline apply to Gate G1 verbatim.
- Supplies what **ADR 0078** gates on: R1's reader keys are this ADR's device X25519 keys under an I8 delegation, and R2's canonical envelope bytes use the I3 method. The custody floor I7 generalizes **ADR 0072** R6 from domain KEKs to all private key material.
- Constrained by **ADR 0016**: Ed25519/X25519/BLAKE2b via libsodium, detached signatures, no invented constructions — the element rule is byte assembly, not a primitive; passkeys/hardware and PQ arrive as new suites.
- Realizes direction within **ADR 0029**'s role table (identity delegates, devices operate) and **ADR 0031**'s required properties (device scope detection, no transport-identity elevation — I10); **ADR 0033**'s lifecycle vocabulary and honesty rules (revocation ≠ erasure, stale backups must not resurrect) become I8/I9 with G3 owning the mechanics.
- Leaves **ADR 0024/0027/0045/0056** exactly where they are: the claim flow and membership credentials are the next consumers of this direction, in their own maximally reviewed step — that step is now taken by **ADR 0080**; **ADR 0075 A11 / 0076** stay untouched — operator auth and identity remain separate layers with no ambient bridge (I10), with ADR 0080 H9 defining the consolidation contract.
