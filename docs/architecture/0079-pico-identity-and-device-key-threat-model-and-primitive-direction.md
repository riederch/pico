# 0079 - Pico Identity and Device Key Threat Model and Primitive Direction

## Status

Accepted as the threat model and primitive direction for Pico Identity Keys and
Device Keys, and as the signature-input canonicalization method for Pico-signed
records. G1 canonical builders/vectors, minimal person-role Vault custody,
host-role Home custody and G3 verification/lifecycle projection are
implemented. ADR 0082 adds a narrow Foundation consumer: Core persists verified
signing-key delegation/revocation evidence, reconciles it on boot and
re-evaluates identity sessions against locally observed lifecycle state.
ADR 0083 adds exact device key-agreement registration and an authenticated
external freshness-source contract. A concrete registry/sync adapter and
reader-custody envelope authority remain open.

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

All three stayed inert (I8, K4-family) until custody/runtime gates existed and
Gate G3 defined how lifecycle state is looked up and reconciled. The current
`@pico/identity` runtime verifies detached Ed25519 signatures for possession,
delegation and revocation records over the Gate G1 canonical bytes, then
projects accepted statements into lifecycle state. ADR 0082 persists that
evidence for identity sessions in Core; it still does not fetch external
registry freshness. ADR 0083 subsequently makes exact key-agreement records
selectable only through a bounded authenticated freshness adapter, whose
default remains unavailable.

### Gate G1 canonical layouts and vectors

Gate G1 now fixes the first four Pico identity signature-input families. Every family uses the ADR 0073 element rule:

```text
element(b) = U32BE(len(b)) || b
signatureInput = element(label) || element(field1) || ...
```

ASCII token fields must be non-empty, at most 1024 bytes and match `[A-Za-z0-9._:/+-]+`. Public keys, nonces and fingerprints are raw bytes carried in fixtures as lowercase hex; Ed25519/X25519 public keys are 32 bytes, nonces are 32 bytes and fingerprints are 32-byte BLAKE2b digests. Scope sets are encoded as `element(decimalScopeCount)` followed by one element per scope in lexicographic order; duplicate or unknown scopes are rejected. `lifecycleOrder` is syntactically pinned to `seq:[0-9]{16}` here so a signed statement always carries protected ordering context; Gate G3 now uses that field for lookup, monotonicity and restore reconciliation semantics.

Layouts:

| Family | Label | Field order after label |
|---|---|---|
| keyrecord | `pico.id.keyrecord.v1` | `suite`, `keyRole`, `publicKey` |
| possession | `pico.id.possession.v1` | `suite`, `subjectKeyFingerprint`, `verifierNonce`, `verifierContext` |
| delegation | `pico.id.delegation.v1` | `suite`, `delegationId`, `issuerIdentityKeyFingerprint`, `subjectSigningKeyFingerprint`, `subjectKeyAgreementKeyFingerprint`, sorted scope set, `validFrom`, `validUntil`, `lifecycleOrder` |
| revocation | `pico.id.revocation.v1` | `suite`, `revocationId`, `issuerIdentityKeyFingerprint`, `subjectKind`, `subjectRef`, `reasonCategory`, `revokedAt`, `lifecycleOrder` |

Current vocabulary:

- key roles: `pico_identity`, `device_signing`, `device_key_agreement`, `home_host_signing`, `home_host_key_agreement`
- delegation scopes: `sign_history`, `verify_history`, `sync_exchange`, `decrypt_domain`, `receive_key_envelope`, `surface_session`, `home_membership`
- revocation reasons: `lost_device`, `suspected_compromise`, `device_retired`, `key_rotated`, `membership_removed`
- timestamps (`validFrom`, `validUntil`, `revokedAt`): exactly `YYYY-MM-DDTHH:MM:SS.sssZ`, one fixed-width UTC form, rejected as `invalid_instant` otherwise. Consumers decide validity windows by comparing these fields as strings, and a UTC offset sorts before `Z` at the same instant — a second form would leave an expired delegation looking active. The same rule governs the lookup time `@pico/identity` is asked about.

The on-disk signature-input fixtures live under `docs/protocol/fixtures/identity-signature-input/pico.suite.id.v1/` in their own suite. They are authoritative byte vectors only: no private keys, no signatures and no runtime authority. The separate `docs/protocol/fixtures/identity-signature-verification/pico.suite.id.v1/` suite publishes deterministic public-key detached signature verification vectors for possession, delegation and revocation.

#### canonicalization-positive

**`keyrecord-pico-identity`** — Pico identity key record; fingerprint = BLAKE2b-256 over the canonical key-record bytes.

```text
len 97
signatureInputHex
000000147069636f2e69642e6b65797265636f72642e763100000010
7069636f2e73756974652e69642e76310000000d7069636f5f696465
6e746974790000002011111111111111111111111111111111111111
11111111111111111111111111
fingerprintDigestHex
66e6e80bcd9fc83d805ac5f7d9021aa10fb1166671c05ca9148bc92ac6e73616
```

**`keyrecord-device-signing`** — device signing key record.

```text
len 98
signatureInputHex
000000147069636f2e69642e6b65797265636f72642e763100000010
7069636f2e73756974652e69642e76310000000e6465766963655f
7369676e696e67000000202222222222222222222222222222222222
22222222222222222222222222222222
fingerprintDigestHex
5dba9b41e6f3f034b84d142eeac499f404237f4dd9ff4add17b5f4843e2240b5
```

**`keyrecord-device-key-agreement`** — device X25519 key-agreement key record, the later ADR 0078 reader-key primitive.

```text
len 104
signatureInputHex
000000147069636f2e69642e6b65797265636f72642e763100000010
7069636f2e73756974652e69642e7631000000146465766963655f
6b65795f61677265656d656e74000000203333333333333333333333
333333333333333333333333333333333333333333
fingerprintDigestHex
2263a4d54b123d8227780014ec313e7afe88a0f8f880a07026a3f931b098e06a
```

**`possession-device-signing`** — possession challenge input for the device signing key. It protects the subject fingerprint, verifier nonce and context.

```text
len 144
signatureInputHex
000000157069636f2e69642e706f7373657373696f6e2e763100000010
7069636f2e73756974652e69642e7631000000205dba9b41e6f3f034
b84d142eeac499f404237f4dd9ff4add17b5f4843e2240b500000020
4444444444444444444444444444444444444444444444444444444444444444
000000177069636f2d7661756c743a6465766963652d636c61696d
```

**`delegation-device-reader`** — identity-issued device delegation with reader-envelope scope.

```text
len 318
signatureInputHex
000000157069636f2e69642e64656c65676174696f6e2e763100000010
7069636f2e73756974652e69642e76310000001264656c5f3031687a
78386d397134727435760000002066e6e80bcd9fc83d805ac5f7d902
1aa10fb1166671c05ca9148bc92ac6e73616000000205dba9b41e6f3
f034b84d142eeac499f404237f4dd9ff4add17b5f4843e2240b50000
00202263a4d54b123d8227780014ec313e7afe88a0f8f880a07026a3
f931b098e06a00000001330000000e646563727970745f646f6d6169
6e00000014726563656976655f6b65795f656e76656c6f70650000000c
7369676e5f686973746f727900000018323032362d30372d3138543038
3a30303a30302e3030305a00000018323032362d31302d3138543038
3a30303a30302e3030305a000000147365713a30303030303030303030
303030303031
```

**`delegation-scope-order-canonical`** — same semantic delegation with reversed input scope order; canonical bytes match `delegation-device-reader`.

```text
len 318
signatureInputHex
000000157069636f2e69642e64656c65676174696f6e2e763100000010
7069636f2e73756974652e69642e76310000001264656c5f3031687a
78386d397134727435760000002066e6e80bcd9fc83d805ac5f7d902
1aa10fb1166671c05ca9148bc92ac6e73616000000205dba9b41e6f3
f034b84d142eeac499f404237f4dd9ff4add17b5f4843e2240b50000
00202263a4d54b123d8227780014ec313e7afe88a0f8f880a07026a3
f931b098e06a00000001330000000e646563727970745f646f6d6169
6e00000014726563656976655f6b65795f656e76656c6f70650000000c
7369676e5f686973746f727900000018323032362d30372d3138543038
3a30303a30302e3030305a00000018323032362d31302d3138543038
3a30303a30302e3030305a000000147365713a30303030303030303030
303030303031
mustMatch delegation-device-reader
```

**`revocation-delegation-reader`** — identity-issued delegation revocation statement input.

```text
len 209
signatureInputHex
000000157069636f2e69642e7265766f636174696f6e2e763100000010
7069636f2e73756974652e69642e7631000000127265765f3031687a
78386d397134727435760000002066e6e80bcd9fc83d805ac5f7d902
1aa10fb1166671c05ca9148bc92ac6e736160000000a64656c656761
74696f6e0000001264656c5f3031687a78386d397134727435760000
000e6465766963655f7265746972656400000018323032362d30382d
31385430383a30303a30302e3030305a000000147365713a30303030
303030303030303030303032
```

#### canonicalization-negative

Bind-difference negatives canonicalize successfully but must authenticate/hash differently:

| Fixture | Expectation |
|---|---|
| `keyrecord-suite-v2` | Different bytes and fingerprint from `keyrecord-pico-identity`: `147888887d25260151ad883c8cd937736ea722dc8b063323bba33aa86cce4e89` |
| `keyrecord-role-swap` | Different bytes and fingerprint from `keyrecord-pico-identity`: `27af8bcdb51ac4e283fae18b9e33cfa077f84d5b15fc4aad44af9a20661b0698` |
| `possession-context-swap` | Different challenge bytes from `possession-device-signing` |

The bind-difference canonical bytes are:

```text
keyrecord-suite-v2 len 97
000000147069636f2e69642e6b65797265636f72642e763100000010
7069636f2e73756974652e69642e76320000000d7069636f5f696465
6e746974790000002011111111111111111111111111111111111111
11111111111111111111111111

keyrecord-role-swap len 98
000000147069636f2e69642e6b65797265636f72642e763100000010
7069636f2e73756974652e69642e76310000000e6465766963655f
7369676e696e67000000201111111111111111111111111111111111
11111111111111111111111111111111

possession-context-swap len 144
000000157069636f2e69642e706f7373657373696f6e2e763100000010
7069636f2e73756974652e69642e7631000000205dba9b41e6f3f034
b84d142eeac499f404237f4dd9ff4add17b5f4843e2240b500000020
4444444444444444444444444444444444444444444444444444444444444444
000000177069636f2d686f6d653a6d6f76652d696e2d636c61696d
```

Reject negatives produce no signature input:

| Fixture | Reason |
|---|---|
| `possession-cross-family-label` | `cross_family_label_confusion` |
| `delegation-field-order-override` | `field_reordering` |
| `delegation-truncated-issuer-fingerprint` | `invalid_fingerprint_length` |
| `delegation-unknown-scope` | `invalid_scope` |
| `delegation-validity-inverted` | `invalid_validity_bounds` |
| `delegation-validity-offset-form` | `invalid_instant` |
| `revocation-invalid-lifecycle-order` | `invalid_lifecycle_order` |
| `keyrecord-invalid-public-key-length` | `invalid_public_key_length` |

### Custody boundaries

Private material custody is decided per role, each in its own step, under the I7 floor (never in SQLite, the event log, env vars, logs or data-backed-up artifacts):

- **Host-role keys** (the future Pico Home Host Key, ADR 0056 realization): file-based custody with ADR 0072 semantics — a separated key directory, backup-exclusion as a release-blocking packaging rule, stated stolen-disk residual — is an acceptable starting point, because host keys are host state. Their creation belongs to the claim-flow ADR (now ADR 0080; its Gate M2 discharges this role).
- **Person-role keys** (Pico Identity, device keys of the owner): **no person-identity private key is created on the Foundation host until a dedicated custody ADR exists** (G2) — vault, platform keystore, passphrase protection (age-style, ADR 0016 allowed direction) or hardware-backed, with the honest analysis each implies. Convenience file storage of a person's identity root is exactly the accretion this ADR exists to forbid. ADR 0081 now fixes the Vault-exclusive boundary, the encrypted keyfile format and the agent-pattern process boundary, and its Gate P2 supplies a minimal `@pico/vault` runtime holder for person-role keys.

## Ordering gates

Nothing runtime ships before its gates; nothing at all is security-relevant before **G1**.

1. **Done — Gate G1 canonical layouts and authoritative vectors.** Per-family byte layouts (key record, possession challenge, delegation, revocation) with ADR 0073-style accept/reject vectors, including negative vectors for cross-family label confusion, suite swap, role swap, field reordering, truncated-fingerprint comparison and validity/ordering violations. This gate also discharges ADR 0078's Gate R2 method question: envelope bytes use the same construction.
2. **Gate G2 — Custody story per key role. Implemented at the current runtime floor.** ADR 0080 M2 supplies separated ADR 0072-pattern file custody for Home host-role keys. ADR 0081 P2 supplies Vault-exclusive person-role custody, `pico.vault.keyfile.v1` encrypted keyfiles, label-checked signing and key-agreement unwrap.
3. **Done — Gate G3 signature verification, lifecycle lookup and reconciliation.** `@pico/identity` implements the local verifier for ADR 0079 G1 key-record fingerprints, possession proofs, delegations and revocations: it rebuilds the canonical bytes, checks full BLAKE2b-256 key-record fingerprint binding and verifies detached Ed25519 signatures with role fail-closed checks. It also implements the deterministic projector for verified or already accepted delegation and revocation fields: fixed-width `seq:[0-9]{16}` ordering is compared numerically, identical replica statements dedupe, conflicting statement-id reuse fails closed, lookup resolves `active`, `not_yet_valid`, `expired`, `missing_scope`, `revoked` or `unknown`, direct delegation revocation, subject device-key revocation and revocation of the issuing identity key itself stop future authority - the last one regardless of ordering, because whoever holds a stolen root can mint delegations the owner never learns about, so enumerating known delegations is not a substitute, and reconciliation across restored stale state plus fresher lifecycle records resolves toward the freshest statement. The on-disk `identity-signature-verification/pico.suite.id.v1/` and `identity-lifecycle/pico.suite.id.v1/` suites publish verification and lifecycle vectors for these cases. ADR 0082 adds the local signed-evidence consumer; ADR 0083 adds exact reader-key registration and the external freshness-source boundary.

After all three, runtime continues in additive consumers. Host-role custody now
exists in ADR 0080, ADR 0082 supplies local signed-lifecycle persistence, and
ADR 0083 completes ADR 0078 R1's reader-key/freshness contract. Person-role key
generation and custody remain exclusively behind `@pico/vault`; ADR 0084
consumes that Vault boundary for external controller signing without copying
the identity key into Foundation.

## Non-goals

This ADR does not define or implement:

- the claim/Move-In flow, Setup Mode, or Home Host Key creation (now ADR 0080; ADR 0024/0027/0056 boundaries unchanged here)
- membership credential semantics or issuance (ADR 0045 family — a consumer of this direction, not part of it)
- relationship or introduction trust between identities (no CA, no registry, no web-of-trust decision here)
- recovery, social recovery, or identity replacement continuity records (ADR 0033 boundary; explicitly future)
- host-role key generation/storage, registry freshness, storage adapters or any runtime authority outside the `@pico/vault` person-role custody floor and the local `@pico/identity` signature-verification/lifecycle projector
- signed event segments or manifests (ADR 0032 families — future consumers of the I3 method)
- passkey/hardware-backed identity (a future suite, per I2)
- post-quantum selection (see open questions)
- any change to the Foundation auth layer (ADR 0075/0076) or to draft fixture fences (ADR 0051/0052/0053/0055 stay exactly as strict)

## Open questions

- ~~**Person-identity custody** (G2): vault process, platform keystore, passphrase-protected file, hardware — and what the first real deployment (Home Assistant add-on) can honestly offer. Its own ADR.~~ Decided and minimally implemented in ADR 0081: Vault-exclusive custody with one canonical encrypted keyfile (`pico.vault.keyfile.v1`, Argon2id + XChaCha20-Poly1305), label-checked signing/unwrap behind `@pico/vault`, platform keystores as future unlock paths only — and the honest add-on answer remains that the Home Assistant add-on/browser surfaces are not Vault-capable custody locations.
- ~~**Ordering context format** for lifecycle monotonicity (I9): plain sequence numbers vs predecessor references (hash chaining) — decided at G3 with its reconciliation semantics.~~ Gate G3 uses the existing Gate G1 `seq:[0-9]{16}` protected field as the minimal monotonic ordering context. Hash-chained or manifest-backed freshness can be added as a later storage/freshness layer without changing the current statement projection.
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
