# 0056 - Pico Home Link Draft Home Host Key Placeholder

## Status

Accepted as a draft-only Pico Home Host Key placeholder boundary before host-key serialization, Home continuity verification, membership credential verification or runtime Home authorization are implemented.

## Context

ADR 0024 defines Pico Home as infrastructure that may host resident Picos without owning their identities, private keys or personal domains.

ADR 0027 defines the future Pico Home Image and Move-In Code flow for claiming an Empty Pico Home.

ADR 0029 separates Pico Identity Keys, Device Keys, Pico Home Host Keys, Home Membership Credentials, Domain Content Keys, Transport Session Keys and Relay Routing Identities.

ADR 0031 requires Pico Homes, Home Host Picos, relays, devices and protected domains to remain separate trust zones.

ADR 0032 defines Home Membership Credentials conceptually, but does not define a host-key placeholder.

ADR 0033 defines Pico Home Host Key lifecycle and states that Home reset, host-key rotation and host replacement must not become resident identity destruction or resident key seizure.

ADR 0034 requires canonicalization and signature-input decisions before signatures, hashes or key fingerprints carry security meaning.

ADR 0042 permits draft Pico Link and Pico Home Link fixture work only below runtime, cryptography, relay and compatibility claims.

ADR 0045 defines a draft Home Membership Credential placeholder, but that placeholder still references host identity only by synthetic context.

ADR 0055 defines a draft Identity Key placeholder for public Pico Identity Key and Device Key references. It does not define Home Host Key continuity or Home membership authority.

The next Pico Home Link gap is a safe placeholder for Home Host Key records: a way to describe future host infrastructure continuity without accidentally making the host key a resident Pico Identity Key, resident Device Key, Domain Content Key, Home Membership Credential verifier, Move-In Code or relay authority.

## Decision

Future draft Pico Home Link fixtures may use a Home Host Key placeholder shape.

This placeholder is not a host-key implementation. It does not define key algorithms, serialization, fingerprints, host attestation, Home continuity verification, membership credential verification, Setup Mode, Move-In Code validation, runtime authorization, relay registration or conformance.

## Core rule

```text
A Home Host Key may identify host infrastructure continuity.
It must not sign as resident Picos, decrypt resident domains or replace Move-In Codes.
```

## Draft Home Host Key placeholder shape

Draft fixtures may model a Home Host Key placeholder with only these top-level fields:

```json
{
  "schema": "pico.home.host-key.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "hostKeyRecordId": "homehostkey_placeholder_...",
  "home": {
    "homeIdHint": "home_placeholder_...",
    "hostKeyRef": "homehostkey_placeholder_...",
    "setupState": "claimed-placeholder",
    "proofStatus": "unverified-placeholder"
  },
  "host": {
    "hostPicoIdHint": "pico_placeholder_home_host",
    "hostDeviceIdHint": "device_placeholder_home_host",
    "hostRole": "home_host_pico",
    "proofStatus": "unverified-placeholder"
  },
  "publicKey": {
    "keyRef": "homehostkey_placeholder_...",
    "materialStatus": "placeholder-ref-only",
    "format": "unspecified-placeholder",
    "algorithm": "unspecified-placeholder",
    "fingerprintStatus": "absent"
  },
  "lifecycle": {
    "status": "introduced-placeholder",
    "createdAt": "2026-07-12T12:00:00.000Z",
    "rotatedFromRef": null,
    "rotationRef": null,
    "revocationRef": null,
    "resetContinuity": "not-claimed"
  },
  "continuity": {
    "sameHomeClaim": false,
    "memberAcceptanceRequired": true,
    "membershipCredentialBinding": "not-verified",
    "currentClaim": false
  },
  "authority": {
    "hostInfrastructure": true,
    "residentSigningAuthority": false,
    "residentDomainDecryption": false,
    "membershipIssuanceVerified": false,
    "moveInCodeUsed": false
  },
  "relay": {
    "relayEndpointRef": "relay_endpoint_placeholder_...",
    "routingIdentityRef": "route_placeholder_...",
    "relayAuthority": false
  },
  "audit": {
    "auditRef": "audit_placeholder_...",
    "payloadPosture": "metadata-only",
    "userVisible": true
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

`hostKeyRecordId` is a synthetic placeholder identifier. It is not a hash, key fingerprint, signature input, Move-In Code, recovery handle, bearer token or Home registry ID.

`home` names the placeholder Pico Home context. `proofStatus: "unverified-placeholder"` means the Home identity is not verified.

`host` names the placeholder Home Host Pico or device context. It does not prove host administration authority, device possession, user approval or membership issuance authority.

`publicKey` names public material posture only. It must not include private host-key material, seed phrases, recovery shares, passphrases or production credentials.

`publicKey.format` and `publicKey.algorithm` may say `unspecified-placeholder` only until a later ADR chooses final formats and reviewed algorithms.

`lifecycle` records intended host-key status only. It does not verify creation, rotation, revocation, reset continuity, compromise state or Home replacement.

`continuity` records placeholder continuity posture only. It must not claim that a rotated host key is current, accepted by members or bound to existing membership credentials.

`authority.hostInfrastructure` means only that the record belongs to host infrastructure vocabulary. It does not authorize resident actions.

`authority.residentSigningAuthority` must remain `false` in accepted placeholder fixtures.

`authority.residentDomainDecryption` must remain `false` in accepted placeholder fixtures.

`authority.membershipIssuanceVerified` must remain `false` until Home Membership Credential issuer verification exists.

`authority.moveInCodeUsed` must remain `false` in accepted placeholder fixtures.

`relay` may reference relay endpoint or routing placeholders. It must not turn relay account control or routing identity into Home Host Key authority.

`audit` records placeholder audit intent only. It must stay metadata-only and must not contain resident private payloads, private keys, recovery secrets or Move-In Codes.

`signatureStatus: "absent"` means no verifiable signature exists.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Allowed draft values

Draft Home Host Key fixtures may use these `home.setupState` values:

```text
empty-placeholder
setup-mode-placeholder
claimed-placeholder
migrating-placeholder
reset-placeholder
retired-placeholder
unknown-placeholder
```

Draft Home Host Key fixtures may use these `host.hostRole` values:

```text
home_host_pico
host_admin_device
service_placeholder
migration_placeholder
```

Draft Home Host Key fixtures may use these `publicKey.materialStatus` values:

```text
absent
placeholder-ref-only
public-placeholder
```

Draft Home Host Key fixtures may use these `lifecycle.status` values:

```text
introduced-placeholder
active-placeholder
rotating-placeholder
retired-placeholder
revoked-placeholder
compromised-placeholder
unknown-placeholder
```

Draft Home Host Key fixtures may use these `lifecycle.resetContinuity` values:

```text
not-claimed
same-home-not-verified
new-home-placeholder
manual-review-required
```

These values are draft vocabulary only. They are not final lifecycle enum values, host authority scopes or verifier rules.

## Required rejection cases

Draft Home Host Key fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- real signatures, hashes, canonical bytes, MACs, attestations, host proofs, trust-path proofs or verifier results
- `signatureStatus` values that claim verification
- private host keys, private Pico Identity Keys, private Device Keys, seed phrases, recovery shares, passphrases or production credentials
- bearer tokens, Foundation tokens, relay account tokens, host admin passwords or Move-In Codes
- final algorithms, final serialization, final fingerprints or compatibility levels before a reviewed key-format ADR exists
- Home Host Key records that claim resident Pico Identity Key authority
- Home Host Key records that claim resident Device Key possession
- Home Host Key records that sign or rewrite resident event history
- Home Host Key records that grant resident Private Space, Shared Space or Domain Content Key access
- Home Host Key records that claim verified Home Membership Credential issuance or revocation authority by syntax alone
- Move-In Codes used as host keys, host-key IDs, recovery handles or long-lived administrator credentials
- relay routing identities, transport session keys or relay account keys elevated into Home Host Key authority
- continuity fields that claim accepted same-Home continuity, member acceptance, freshness or runtime currentness without future signed records
- reset fields that claim resident identities, resident private keys or resident backups were deleted
- audit fields that include resident plaintext, private keys, recovery secrets or Move-In Codes
- extensions that alter identity, membership, decryption, lifecycle, recovery, authorization, relay or compatibility semantics

## Home Host Key is not resident identity

A Home Host Key may later identify host infrastructure.

It must not:

- sign as a resident Pico
- sign as a resident device
- forge resident event history
- replace a resident Pico Identity Key
- replace a resident Device Key
- become relationship authority
- become recovery authority
- become Pico Rules authority
- authorize personal actions

Resident identity remains under the resident Pico's Identity Key and delegated Device Keys.

## Home Host Key is not domain access

Hosting ciphertext is not permission to read it.

A Home Host Key must not grant:

- Private Space plaintext access
- Shared Space plaintext access
- Domain Content Key access
- key-envelope unwrap authority
- resident backup decryption
- resident recovery secret access

Protected-domain access remains an explicit domain membership and key-envelope decision.

## Home Host Key is not Move-In Code

The Move-In Code is a temporary setup capability for claiming an Empty Pico Home.

It must not become:

- a Home Host Key
- a host-key record identifier
- a public key reference
- a recovery handle
- a long-lived administrator credential
- a Home Membership Credential
- a resident Pico credential
- a relay account credential

After claim, the Move-In Code must be invalidated under the future setup design.

## Home Host Key is not relay authority

A Home Host Key may later help bind a Home endpoint to host infrastructure continuity.

Relay endpoint and routing placeholders may help delivery.

They must not prove:

- Home ownership
- Home Host Pico authority
- Home Membership Credential issuance
- resident identity
- resident domain access
- compatibility
- recovery

Relay Routing Identities remain transport-specific and replaceable.

## Relationship to Home Membership Credentials

ADR 0045 Home Membership Credential placeholders may refer to a Home or host context.

ADR 0056 narrows what the host-key side may mean at fixture level:

- host keys identify host infrastructure only
- host keys do not prove membership issuance by themselves
- host keys do not grant resident domain access
- host keys do not replace Move-In Codes or Setup Mode
- host key continuity must be accepted or verified by future signed records

Membership Credential verifier behaviour remains future work.

## Relationship to residency and eviction

ADR 0057 residency and eviction placeholders may refer to `homeHostKeyRef` values.

Those references remain unverified placeholders. A Home Host Key placeholder does not prove eviction authority, runtime access denial, host-local cleanup, shared-domain rotation or global deletion.

## Relationship to future verification

Before Home Host Key records carry security meaning, later ADRs must define:

- reviewed key algorithms or protocols under ADR 0016
- public key serialization
- host-key ID and fingerprint format
- canonical host-key-record bytes
- signature inputs
- Home Host Pico issuer and verifier roles
- Setup Mode and Move-In Code binding
- Home continuity rules after rotation, migration and reset
- Home Membership Credential binding
- relay endpoint registration semantics
- freshness and replay rules
- host-key revocation lookup
- resident notification and acceptance semantics
- verifier behaviour for unknown, stale, rotated, reset or conflicting host-key records
- conformance fixture families for positive and negative host-key verification

Until then, Home Host Key fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton demo may reference Home Host Key placeholders only as visibly unverified fixture data.

The demo must not:

- generate production Home Host Keys
- claim Home continuity verification
- claim Home Membership Credential issuer verification
- let host keys sign as resident Picos
- let host keys decrypt resident domains
- use Move-In Codes as host keys
- use relay account identity as host authority
- publish compatibility or security claims

If a demo needs real host-key verification, this ADR is insufficient and a reviewed cryptographic and membership design must come first.

## Implementation status

This ADR is documentation and fixture-gate direction only.

The repository does not implement:

- Pico Home Host Keys
- host-key generation
- host-key storage
- host-key serialization
- host-key fingerprints
- Home continuity verification
- Setup Mode or Move-In Code validation
- Home Membership Credential verification
- host-key revocation lookup
- relay endpoint registration
- runtime Home authorization from host-key records
- conformance runner for host-key verification

## Non-goals

This ADR does not define:

- cryptographic algorithms
- key serialization formats
- key IDs or fingerprints
- signature formats
- canonicalization output
- host attestation
- Setup Mode
- Move-In Code implementation
- Home claim API
- Home Membership Credential verification
- Home reset protocol
- Home migration protocol
- relay protocol
- resident domain access
- runtime parser
- production verifier
- compatibility level
- commercial permission
