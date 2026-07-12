# 0051 - Pico Link Draft Device Credential Placeholder

## Status

Accepted as a draft-only device-credential placeholder boundary before Pico Link identity, device delegation or signature implementation.

## Context

ADR 0029 separates Pico Identity Keys, Device Keys, Pico Home Host Keys, Home Membership Credentials, Domain Content Keys, Transport Session Keys and Relay Routing Identities.

ADR 0031 requires explicit device delegation, revocation and lost-device handling before real Pico Link identity semantics.

ADR 0032 defines future signed event segments, replica manifests, key envelopes and Home membership credentials, but does not yet define a device credential placeholder.

ADR 0033 defines Device Key lifecycle and states that devices can operate only within delegated scope.

ADR 0034 requires canonicalization and signature-input decisions before signatures, hashes or test vectors carry security meaning.

ADR 0042 permits draft Pico Link fixture work only below runtime, cryptography, relay and compatibility claims.

The next Pico Link identity gap is a safe placeholder for Device Credential fixture work: a way to describe that one trusted device may later operate for one Pico without accidentally making the placeholder a Pico Identity Key, bearer token, Home Membership Credential, Domain Content Key or verified signature.

## Decision

Future draft Pico Link fixtures may use a Device Credential placeholder shape.

This placeholder is not a credential implementation. It does not verify issuer authority, subject device authority, key possession, signatures, canonicalization, replay protection, domain access or revocation.

## Core rule

```text
A Device Credential may delegate scoped device operation.
It must not become Pico identity ownership, Home membership, domain access or a bearer token.
```

## Draft device credential placeholder shape

Draft fixtures may model a Device Credential placeholder with only these top-level fields:

```json
{
  "schema": "pico.identity.device-credential.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "credentialId": "devcred_placeholder_...",
  "issuer": {
    "picoIdHint": "pico_placeholder_...",
    "identityKeyRef": "picoidkey_placeholder_...",
    "issuerDeviceIdHint": "device_placeholder_...",
    "proofStatus": "unverified-placeholder"
  },
  "subject": {
    "deviceKind": "pico-vault",
    "deviceIdHint": "device_placeholder_...",
    "deviceKeyRef": "devicekey_placeholder_...",
    "labelHint": "Synthetic laptop vault",
    "proofStatus": "unverified-placeholder"
  },
  "audience": {
    "picoIdHint": "pico_placeholder_...",
    "protocol": "pico-link"
  },
  "delegation": {
    "scopes": ["packet.sign", "packet.receive"],
    "status": "pending_activation"
  },
  "constraints": {
    "homeRefs": [],
    "domainRefs": [],
    "streamRefs": []
  },
  "validity": {
    "notBefore": "2026-07-12T12:00:00.000Z",
    "expiresAt": "2026-07-13T12:00:00.000Z"
  },
  "revocation": {
    "status": "not_revoked",
    "revocationRef": null
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

`credentialId` is a synthetic placeholder identifier. It is not a hash, signature input, Device Key, Pico Identity Key, bearer token, Move-In Code or recovery handle.

`issuer` names the placeholder Pico identity context that may later delegate a device. `proofStatus: "unverified-placeholder"` means the issuer is not verified.

`subject` names the placeholder device and Device Key reference. It is not proof of key possession, hardware backing, device trust or user approval.

`audience` names the placeholder Pico/protocol target. It does not bind to a verified Pico Identity Key or transport endpoint.

`delegation.scopes` describes draft operational intent only. It does not grant domain plaintext access, Home membership, action authority, recovery authority or global relationship authority.

`constraints` may describe scoped home, domain or stream references. It must not include Domain Content Keys or grant domain reading by itself.

`validity` bounds the placeholder. Draft fixtures should prefer finite `expiresAt` values.

`revocation` records placeholder revocation shape only. It does not verify revocation state.

`signatureStatus: "absent"` means no verifiable signature exists.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Allowed draft values

Draft device-credential fixtures may use these `subject.deviceKind` values:

```text
pico-vault
trusted-device
pico-surface
browser-session
service-placeholder
```

Draft device-credential fixtures may use these `delegation.status` values:

```text
pending_activation
active
retired
revoked
expired
lost
compromised
superseded
```

Draft device-credential fixtures may use these `delegation.scopes` values:

```text
packet.sign
packet.receive
history.sign
manifest.sign
sync.exchange
key_envelope.receive
surface.session
```

These values are draft vocabulary only. They are not final authorization scopes.

## Required rejection cases

Draft device-credential fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- real signatures, hashes, canonical bytes, MACs, attestations or verifier results
- `signatureStatus` values that claim verification
- private identity keys, private device keys, seed phrases or production credentials
- bearer tokens, Foundation tokens, relay account tokens, passwords, Move-In Codes or recovery secrets
- credential IDs derived from private material or bearer tokens
- issuer fields that claim verified Pico Identity Key authority
- subject fields that claim verified Device Key possession or hardware attestation
- audience fields that claim verified Pico continuity or transport endpoint binding
- absent validity bounds
- delegation without a finite scope list
- scopes that imply Pico identity control, Home membership, Private Space reading, Domain Content Key access, action execution, Pico Rules override, deletion, recovery, billing, emergency authority or global relationship control
- constraints that include raw Domain Content Keys or wrapped key material
- status values that conflict with `revocation`, such as `revoked` without a placeholder `revocationRef`
- extensions that alter identity, authority, decryption, membership, deletion, recovery or lifecycle semantics

## Device credential is not identity ownership

Device Credential placeholders may describe scoped operational delegation.

They must not grant:

- Pico Identity Key control
- identity replacement
- relationship authority
- recovery authority
- global signing authority
- host administration
- Home membership
- domain plaintext access
- Domain Content Key access
- Action Runner authority
- Pico Rules override authority
- remote administration of the Foundation API

The owning Pico identity remains the authority that may later delegate, rotate or revoke devices under a reviewed key lifecycle design.

## Device credential is not Home membership

A Device Credential may later prove that a device belongs to or operates for one Pico.

It does not prove that the Pico or device may use a specific Pico Home.

Home use remains governed by Home Membership Credentials or other host-use credentials. ADR `0045-pico-home-link-draft-membership-credential-placeholder.md` defines that separate placeholder boundary.

## Device credential is not domain access

A Device Credential may later be one input to deciding whether a device can receive a key envelope.

It does not itself grant:

- Private Space plaintext access
- Shared Space plaintext access
- Domain Content Key access
- historical content access
- recovery of protected domains

Domain access must remain an explicit protected-domain decision with separate key envelopes, domain membership, rotation and audit semantics.

## Bearer-token boundary

A bearer token may authenticate one transport, local API or temporary session in a limited context.

It must not become:

- a Device Credential
- a Device Key
- a Pico Identity Key
- a credential identifier
- a recovery secret
- a Home Membership Credential
- a Domain Content Key
- a durable remote access grant

Any fixture that mixes bearer-token semantics into Device Credential placeholders must be rejected.

## Relationship to future verification

Before Device Credentials carry security meaning, later ADRs must define:

- Pico Identity Key public format
- Device Key public format
- issuer verification
- device key possession proof
- canonical credential bytes
- signature inputs
- replay protection
- expiry enforcement
- revocation lookup
- lost-device handling
- backup stale-state handling
- audit records
- relationship to Home Membership Credentials
- relationship to Key Envelopes and Domain Content Keys
- verifier behaviour

Until then, device-credential fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton tech demo may use this placeholder only if:

- fixture or demo metadata says `draft-only`
- no Device Credential is accepted by runtime code
- no identity or domain access is granted
- no bearer token is reused as a credential
- no production signature, key possession or attestation claim is made
- no compatibility level above draft is advertised
- no user data is used

## Non-goals

This ADR does not define:

- Pico Identity Key format
- Device Key format
- Device Credential verification
- device pairing
- hardware-backed attestation
- signature algorithms
- canonicalization
- revocation registry
- domain-key access
- Home membership
- runtime parser
- conformance runner
- production compatibility certification

## Consequences

Positive:

- gives future Pico Link identity draft fixtures a safe Device Credential placeholder
- keeps device operation separate from identity ownership, Home membership and domain access
- prevents bearer tokens and Move-In Codes from becoming device credentials
- makes expiry, revocation and scope placeholders explicit before implementation

Negative:

- draft device-credential fixtures may require migration when verification semantics are selected
- the placeholder shape cannot exercise real device delegation interoperability
- implementers must keep placeholder device credentials separate from runtime authorization

## Relationship to other ADRs

This ADR refines:

- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`
- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0033-key-lifecycle-rotation-revocation-and-recovery.md`
- `0042-pico-link-draft-schema-and-fixture-gate.md`

It is parallel to, but separate from:

- `0045-pico-home-link-draft-membership-credential-placeholder.md`

It remains below future identity-key, device-key, credential-verification, canonicalization, signature, revocation, domain-access and conformance specifications.
