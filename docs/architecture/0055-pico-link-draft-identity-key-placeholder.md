# 0055 - Pico Link Draft Identity Key Placeholder

## Status

Accepted as a draft-only Pico identity and device public-key placeholder boundary before key serialization, algorithms, key possession proofs, trust paths or runtime identity verification are implemented.

The reviewed key-format direction this boundary required now exists: ADR `0079-pico-identity-and-device-key-threat-model-and-primitive-direction.md` fixes the suite direction (`pico.suite.id.v1`: Ed25519/X25519/BLAKE2b via libsodium), the two-keypair device rule, the canonical signature-input method and the fingerprint rule. **This fixture fence stays fully in force**: placeholder fixtures remain draft-only, algorithm- and fingerprint-free until ADR 0079's Gate G1 delivers per-family canonical layouts and authoritative vectors.

## Context

ADR 0029 separates Pico Identity Keys, Device Keys, Pico Home Host Keys, Home Membership Credentials, Domain Content Keys, Transport Session Keys and Relay Routing Identities.

ADR 0031 requires key serialization and public identity formats before real Pico Link identity semantics can exist.

ADR 0032 defines future signed event segments, replica manifests, key envelopes and membership credentials, but does not define public key record shape.

ADR 0033 defines Pico Identity Key and Device Key lifecycle, including creation, rotation, revocation and recovery boundaries.

ADR 0034 requires canonicalization, signature-input and test-vector decisions before signatures, hashes or key fingerprints carry security meaning.

ADR 0042 permits draft Pico Link fixture work only below runtime, cryptography, relay and compatibility claims.

ADR 0051 defines a draft Device Credential placeholder, but that placeholder still references identity and device keys only by synthetic references.

ADR 0052, ADR 0053 and ADR 0054 define draft lifecycle placeholders for lost devices, revocation records and key-envelope rotation. They do not define Identity Key or Device Key formats.

The next Pico Link identity gap is a safe placeholder for public key records: a way to describe that future Pico Identity Keys and Device Keys will have public references without accidentally publishing private material, claiming verified possession, turning a relay identity into a Pico identity or choosing final algorithms too early.

## Decision

Future draft Pico Link fixtures may use an Identity Key placeholder shape.

This placeholder is not a key format, key registry, verifier, trust path, algorithm choice, fingerprint format, signature format, recovery mechanism or runtime authorization mechanism.

## Core rule

```text
Public key records may name future identity and device keys.
They must not contain private key material or prove identity authority by themselves.
```

## Draft identity key placeholder shape

Draft fixtures may model an Identity Key placeholder with only these top-level fields:

```json
{
  "schema": "pico.identity.key-record.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "keyRecordId": "keyrec_placeholder_...",
  "keyRole": "pico_identity",
  "owner": {
    "picoIdHint": "pico_placeholder_...",
    "deviceIdHint": null,
    "homeIdHint": null,
    "proofStatus": "unverified-placeholder"
  },
  "publicKey": {
    "keyRef": "picoidkey_placeholder_...",
    "materialStatus": "placeholder-ref-only",
    "format": "unspecified-placeholder",
    "algorithm": "unspecified-placeholder",
    "fingerprintStatus": "absent"
  },
  "lifecycle": {
    "status": "introduced-placeholder",
    "createdAt": "2026-07-12T12:00:00.000Z",
    "expiresAt": null,
    "rotationRef": null,
    "revocationRef": null
  },
  "usage": {
    "allowedPurposes": ["device.delegation"],
    "privateMaterialExported": false,
    "signingAuthorityGranted": false
  },
  "binding": {
    "deviceCredentialRef": null,
    "homeMembershipRef": null,
    "domainRefs": [],
    "transportBinding": "none"
  },
  "verification": {
    "possessionProofStatus": "absent",
    "issuerVerified": false,
    "canonicalizationStatus": "absent",
    "trustPathStatus": "unverified-placeholder"
  },
  "signatureStatus": "absent",
  "extensions": {}
}
```

The example is deliberately non-normative. Field names and values may change before implementation.

## Field semantics

`schema` identifies the draft fixture family only.

`schemaVersion` is a draft fixture version, not a Pico Link compatibility level.

`fixtureStage` must remain `draft`.

`keyRecordId` is a synthetic placeholder identifier. It is not a hash, fingerprint, key ID, signature input, bearer token, Move-In Code, recovery handle or registry primary key.

`keyRole` names the future role of the public key reference. It does not grant authority.

`owner` names the placeholder Pico, device or Home context. `proofStatus: "unverified-placeholder"` means ownership is not verified.

`publicKey` names public material posture only. It must not include private keys, seed phrases, raw secret key material, passphrases, recovery shares or production credentials.

`publicKey.format` and `publicKey.algorithm` may say `unspecified-placeholder` only until a later ADR chooses final formats and reviewed algorithms.

`publicKey.fingerprintStatus` records placeholder posture only. It is not a hash vector, canonical byte claim or verified key identifier.

`lifecycle` records intended status only. It does not verify creation, rotation, revocation, expiry, recovery or compromise state.

`usage.allowedPurposes` describes future intent. It does not grant runtime signing, decryption, Home membership, domain access, recovery or action authority.

`usage.privateMaterialExported` must remain `false` in accepted placeholder fixtures.

`usage.signingAuthorityGranted` must remain `false` in accepted placeholder fixtures.

`binding` may reference other placeholder credentials. It must not bind a relay account, transport node or Move-In Code as a Pico identity.

`verification` records placeholder verification posture only. It must not claim issuer verification, key-possession proof, canonicalization or trust-path success.

`signatureStatus: "absent"` means no verifiable signature exists.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Allowed draft values

Draft identity-key fixtures may use these `keyRole` values:

```text
pico_identity
device
home_host
relay_routing_placeholder
transport_session_placeholder
```

Only `pico_identity`, `device` and `home_host` may later become identity or host verification records. `relay_routing_placeholder` and `transport_session_placeholder` are included only so fixtures can reject unsafe elevation into Pico identity.

Draft identity-key fixtures may use these `publicKey.materialStatus` values:

```text
absent
placeholder-ref-only
public-placeholder
```

Draft identity-key fixtures may use these `lifecycle.status` values:

```text
introduced-placeholder
active-placeholder
rotating-placeholder
retired-placeholder
revoked-placeholder
unknown-placeholder
```

Draft identity-key fixtures may use these `usage.allowedPurposes` values:

```text
device.delegation
credential.verify
history.verify
manifest.verify
membership.verify
rotation.verify
recovery.verify-placeholder
host.identity-placeholder
```

These values are draft vocabulary only. They are not final capability names, authorization scopes or verifier rules.

## Required rejection cases

Draft identity-key fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- real signatures, hashes, canonical bytes, MACs, attestations, key-possession proofs, trust-path proofs or verifier results
- `signatureStatus` values that claim verification
- private identity keys, private device keys, seed phrases, recovery shares, passphrases, production credentials or hardware-attestation secrets
- bearer tokens, Foundation tokens, relay account tokens, passwords or Move-In Codes
- public-key records that choose final algorithms, final serialization, final fingerprints or compatibility levels before a reviewed key-format ADR exists
- public-key records that claim Pico identity root control by syntax alone
- public-key records that claim verified Device Key possession by syntax alone
- public-key records that claim issuer verification, trust-path verification, canonicalization success or runtime verifier success
- relay routing identities, transport session keys or relay account keys elevated into Pico identity authority
- key records that grant Home membership, domain plaintext access, Domain Content Key access, recovery authority, Action Runner authority or Pico Rules override authority
- lifecycle fields that claim revocation, rotation or recovery was enforced at runtime
- bindings that use a Move-In Code, relay account, host admin password or transport node ID as identity continuity
- extensions that alter identity, membership, decryption, lifecycle, recovery, authorization or compatibility semantics

## Public key is not private key material

Draft fixtures may refer to future public keys by placeholder reference.

They must not include:

- private identity key material
- private device key material
- seed phrases
- recovery shares
- keystore export blobs
- passphrases
- production credentials
- raw key derivation inputs

Any fixture containing such material must be rejected even if the rest of the record is syntactically plausible.

## Key record is not identity authority

A public key record may later be one input to identity verification.

It does not itself prove:

- that the Pico owns the key
- that a device possesses a private key
- that an issuer delegated the key
- that a relationship is trusted
- that a key is current
- that old keys are revoked
- that signatures are valid
- that a compatibility level was met

Those require future canonicalization, signature, lifecycle, revocation and verifier designs.

## Relay and transport key boundary

Relay routing identities and transport session keys remain below Pico identity semantics.

They may help deliver packets or authenticate one transport session.

They must not become:

- Pico Identity Keys
- Device Keys
- Home Membership Credentials
- Domain Content Keys
- durable relationship identifiers
- recovery handles
- compatibility trust anchors

Any fixture that binds a relay account, routing ID, transport node ID or transport session key as Pico identity continuity must be rejected.

## Relationship to Device Credentials

ADR 0051 Device Credential placeholders may refer to `picoidkey_placeholder_*` and `devicekey_placeholder_*` values.

ADR 0055 narrows what those key references mean at fixture level:

- they are synthetic public-key placeholders
- they are not private keys
- they are not verified possession proofs
- they are not identity-root control by themselves
- they are not final algorithm or serialization commitments

Device Credential verifier behaviour remains future work.

## Relationship to lifecycle records

ADR 0052 lost-device revocation, ADR 0053 revocation registry records and ADR 0054 key-envelope rotation may refer to identity or device key placeholders.

Those references remain non-authoritative until later ADRs define:

- public key format
- canonical key-record bytes
- key possession proof
- signed lifecycle record schema
- revocation lookup
- freshness and replay semantics
- trust-path construction
- verifier behaviour for missing, stale or contradictory key records

## Relationship to future verification

Before identity key records carry security meaning, later ADRs must define:

- reviewed key algorithms or protocols under ADR 0016
- public key serialization
- key ID and fingerprint format
- canonical key-record bytes
- signature inputs
- issuer and verifier roles
- device possession proof
- identity-key rotation and replacement continuity
- revocation and freshness lookup
- trust-path rules
- replay protection
- storage policy for private key material
- hardware- or platform-backed storage expectations, if any
- verifier behaviour for unknown algorithms, stale keys and conflicting records
- conformance fixture families for positive and negative key verification

Until then, identity-key fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton demo may reference identity-key placeholders only as visibly unverified fixture data.

The demo must not:

- generate real identity keys for production use
- claim key possession
- use relay account identity as Pico identity
- use transport TLS, WebSocket sessions or Foundation tokens as Pico identity
- use placeholder public keys for runtime authorization
- claim encrypted payload authenticity from placeholder keys
- publish compatibility or security claims

If a demo needs real cryptography, this ADR is insufficient and a reviewed cryptographic design must come first.

## Implementation status

This ADR is documentation and fixture-gate direction only.

The repository does not implement:

- Pico Identity Keys
- Device Keys
- Home Host Keys
- key generation
- key storage
- key serialization
- key fingerprints
- key registries
- key possession proofs
- identity verification
- lifecycle verification
- runtime authorization from key records
- conformance runner for key verification

## Non-goals

This ADR does not define:

- cryptographic algorithms
- key serialization formats
- key IDs or fingerprints
- signature formats
- canonicalization output
- key possession proof
- public key registry
- identity recovery
- key rotation continuity
- Home Membership Credential verification
- Domain Content Key access
- runtime parser
- production verifier
- compatibility level
- commercial permission
