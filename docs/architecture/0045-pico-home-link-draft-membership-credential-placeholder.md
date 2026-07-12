# 0045 - Pico Home Link Draft Membership Credential Placeholder

## Status

Accepted as a draft-only Home Membership Credential placeholder boundary before Pico Home Link implementation.

## Context

ADR 0024 defines the Empty Pico Home and claim direction.

ADR 0029 separates Home Membership Credentials from Pico identity, device keys, Home host keys, domain keys, transport keys and Move-In Codes.

ADR 0031 requires Home Membership Credentials to define issuer and verifier roles, scopes, states, expiry, replay limits, Home Host Key relationship, Domain Content Key relationship, audit records, reset and recovery behaviour before implementation.

ADR 0032 defines the conceptual Home Membership Credential schema family.

ADR 0033 defines Home Membership Credential lifecycle states such as invited, active, revoked, expired, evicted and transferred or reissued.

ADR 0034 defines canonicalization and signature-input boundaries before signed credentials can be security-relevant.

ADR 0042 allows Pico Home Link draft fixture work only after placeholder authority boundaries are explicit.

ADR 0056 defines the parallel Home Host Key placeholder boundary for host infrastructure continuity and host-key references.

ADR 0057 defines the parallel residency and eviction placeholder boundary for membership lifecycle status records.

The project needs a safe draft credential placeholder that can support future fixture planning without becoming a real Membership API, Move-In Code, authorization token or domain-decryption right.

## Decision

Future draft Pico Home Link fixtures may use a Home Membership Credential placeholder shape.

This placeholder shape is not a credential implementation. It does not verify issuer authority, subject authority, Home continuity, revocation, signatures, canonicalization or replay protection.

ADR `0056-pico-home-link-draft-home-host-key-placeholder.md` narrows the fixture-level meaning of Home Host Key references, but it does not satisfy the future Home continuity or membership issuer verification requirements.

ADR `0057-pico-home-link-draft-residency-eviction-placeholder.md` narrows the fixture-level meaning of residency and eviction status, but it does not satisfy future runtime membership enforcement or deletion semantics.

## Draft membership credential placeholder shape

Draft fixtures may model a Home Membership Credential placeholder with only these top-level fields:

```json
{
  "schema": "pico.home.membership.credential.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "credentialId": "homecred_placeholder_...",
  "issuer": {
    "homeIdHint": "home_placeholder_...",
    "homeHostKeyRef": "homehostkey_placeholder_...",
    "issuerPicoIdHint": "pico_placeholder_...",
    "proofStatus": "unverified-placeholder"
  },
  "subject": {
    "subjectKind": "pico",
    "picoIdHint": "pico_placeholder_...",
    "deviceIdHint": null
  },
  "audience": {
    "homeIdHint": "home_placeholder_...",
    "homeHostKeyRef": "homehostkey_placeholder_..."
  },
  "membership": {
    "role": "home_member",
    "scopes": ["host.use", "packet.receive"],
    "status": "invited"
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

`schemaVersion` is a draft fixture version, not a Pico Home Link compatibility level.

`fixtureStage` must remain `draft`.

`credentialId` is a synthetic placeholder identifier. It is not a hash, signature input, recovery handle, Move-In Code or bearer token.

`issuer` names the placeholder Home and host authority context. `proofStatus: "unverified-placeholder"` means the issuer is not verified.

`subject` names the placeholder Pico or device that may later receive scoped host use. It is not a Pico identity proof or device delegation proof.

`audience` names the placeholder Home target. It does not prove Home continuity or bind to a verified Home Host Key.

`membership.role`, `membership.scopes` and `membership.status` describe draft host-use intent only. They do not grant domain plaintext access, action authority, recovery authority, deletion authority or global relationship authority.

`validity` bounds the placeholder. Draft fixtures should prefer finite `expiresAt` values.

`revocation` records placeholder revocation shape only. It does not verify revocation state.

`signatureStatus: "absent"` means no verifiable signature exists.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Allowed draft values

Draft preflight fixtures may use these `subjectKind` values:

```text
pico
device
```

Draft preflight fixtures may use these `membership.role` values:

```text
home_host
home_member
trusted_device
service_placeholder
```

Draft preflight fixtures may use these `membership.status` values:

```text
invited
active
revoked
expired
evicted
transferred_or_reissued
```

Draft preflight fixtures may use these `membership.scopes` values:

```text
host.use
packet.receive
storage.queue
sync.exchange
```

These values are draft vocabulary only. They are not final authorization scopes.

## Required rejection cases

Draft membership-credential fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- real signatures, hashes, canonical bytes, MACs or attestations
- `signatureStatus` values that claim verification
- Move-In Codes, Foundation tokens, relay account tokens, passwords or recovery secrets
- real private keys, seed phrases, production credentials or wrapped domain keys
- credential IDs derived from private material
- issuer fields that claim verified Home Host authority
- subject fields that claim verified Pico identity or device delegation
- audience fields that claim verified Home continuity
- absent `validity` bounds
- status values that conflict with `revocation`, such as `revoked` without a placeholder `revocationRef`
- scopes that imply private-domain reading, domain-key access, action authorization, deletion, recovery, billing, emergency authority or global relationship control
- extensions that alter identity, authority, decryption, membership, deletion, recovery or lifecycle semantics

## Membership is not domain access

Home Membership Credential placeholders may describe use of host infrastructure.

They must not grant:

- Private Space plaintext access
- Shared Space plaintext access
- Domain Content Key access
- recovery authority
- Pico identity control
- Device Key delegation
- Action Runner authority
- Pico Rules override authority
- remote administration of the Foundation API

Domain access must remain an explicit protected-domain decision with separate keys, membership and audit semantics.

## Move-In Code boundary

A Move-In Code may later help claim an Empty Pico Home.

It must not become:

- a Home Membership Credential
- a credential identifier
- a signing key
- a recovery secret
- a bearer token for ongoing host use
- a domain decryption secret
- a proof of Pico identity

Any fixture that mixes Move-In Code semantics into Home Membership Credential placeholders must be rejected.

## Relationship to future verification

Before Home Membership Credentials carry security meaning, later ADRs must define:

- issuer verification
- Home Host Key continuity
- subject Pico identity proof
- device delegation proof
- canonical credential bytes
- signature inputs
- replay protection
- expiry enforcement
- revocation lookup
- audit records
- Home reset and recovery behaviour
- relationship to Domain Content Keys
- verifier behaviour

Until then, membership-credential fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton tech demo may use this placeholder only if:

- fixture or demo metadata says `draft-only`
- no Home membership is actually accepted by runtime code
- no domain access is granted
- no Move-In Code is reused as a credential
- no production signature or Home Host Key claim is made
- no compatibility level above draft is advertised
- no user data is used

## Non-goals

This ADR does not define:

- Home claim API
- Move-In Code implementation
- Home Membership Credential verification
- issuer policy
- role-based authorization
- signature algorithms
- canonicalization
- revocation registry
- domain-key membership
- Home reset workflow
- runtime parser
- conformance runner
- production compatibility certification

## Consequences

Positive:

- gives future Pico Home Link draft fixtures a safe membership placeholder
- keeps host use separate from domain plaintext access
- prevents Move-In Codes and Foundation tokens from becoming membership credentials
- makes expiry, revocation and authority placeholders explicit before implementation

Negative:

- draft membership fixtures may require migration when verification semantics are selected
- the placeholder shape cannot exercise real Home membership interoperability
- implementers must keep placeholder membership separate from runtime authorization

## Relationship to other ADRs

This ADR refines:

- `0024-server-bootstrap-tenancy-and-eviction.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`
- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0033-key-lifecycle-rotation-revocation-and-recovery.md`
- `0034-canonicalization-signature-inputs-and-test-vectors.md`
- `0042-pico-link-draft-schema-and-fixture-gate.md`

It remains below future normative Pico Home Link membership, Home claim, issuer-verification, canonicalization, signature, revocation, domain-key and conformance specifications.
