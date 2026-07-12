# 0054 - Pico Link Draft Key Envelope Rotation Placeholder

## Status

Accepted as a draft-only key-envelope and domain-key-rotation placeholder boundary before Pico Link Domain Content Key formats, key-envelope wrapping, rotation verification or runtime decryption enforcement implementation.

## Context

ADR 0029 separates Pico Identity Keys, Device Keys, Pico Home Host Keys, Home Membership Credentials, Domain Content Keys, Transport Session Keys and Relay Routing Identities.

ADR 0031 requires protected domains, domain-key rotation and key-envelope behaviour before real private-domain access or lost-device recovery claims.

ADR 0032 defines key envelopes conceptually: a key envelope grants an authorised reader access to a protected domain key or content key, but revocation and rotation behaviour must be defined before real use.

ADR 0033 defines Domain Content Key lifecycle and says domain key rotation may be needed when a reader is removed, a device with domain access is lost or compromised, a domain changes sensitivity, an envelope format is retired or policy requires rotation.

ADR 0034 requires canonicalization and signature-input decisions before signed lifecycle records carry security meaning.

ADR 0042 permits draft Pico Link fixture work only below runtime, cryptography, relay and compatibility claims.

ADR 0052 defines a draft lost-device revocation placeholder and explicitly does not rotate domain keys.

ADR 0053 defines a draft revocation registry record placeholder and explicitly does not remove key envelopes or prove domain-key rotation.

The next Pico Link identity gap is a safe placeholder for domain-key rotation planning: a way to describe that future readers may need new key envelopes without accidentally publishing Domain Content Keys, claiming completed rotation, erasing historical plaintext or granting domain membership by registry lookup alone.

## Decision

Future draft Pico Link fixtures may use a Key Envelope Rotation placeholder shape.

This placeholder is not a key-envelope implementation. It does not define Domain Content Key format, wrapping algorithms, ciphertext, key derivation, reader verification, domain membership, envelope removal, rotation completion, stale-backup enforcement, runtime decryption or retroactive secrecy.

## Core rule

```text
Domain key rotation changes future access.
It must not expose keys, prove historical erasure or grant domain membership by itself.
```

## Draft key-envelope rotation placeholder shape

Draft fixtures may model a key-envelope rotation placeholder with only these top-level fields:

```json
{
  "schema": "pico.domain.key-envelope-rotation.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "rotationId": "domrot_placeholder_...",
  "issuer": {
    "picoIdHint": "pico_placeholder_...",
    "identityKeyRef": "picoidkey_placeholder_...",
    "issuerDeviceIdHint": "device_placeholder_...",
    "proofStatus": "unverified-placeholder"
  },
  "domain": {
    "domainIdHint": "private_domain_placeholder",
    "domainKind": "private_space",
    "domainKeyRefBefore": "domainkey_placeholder_before",
    "domainKeyRefAfter": "domainkey_placeholder_after",
    "keyMaterialStatus": "absent"
  },
  "trigger": {
    "category": "lost_device",
    "revocationRef": "revocation_placeholder_...",
    "revocationRecordRef": "revrecord_placeholder_..."
  },
  "readerSetChange": {
    "removedReaderRefs": ["device_placeholder_..."],
    "retainedReaderRefs": ["device_placeholder_..."],
    "addedReaderRefs": [],
    "membershipVerified": false
  },
  "rotationPlan": {
    "status": "planned-placeholder",
    "futureSecrecyTarget": true,
    "historicalPlaintextErased": false,
    "retroactiveSecrecyClaim": false
  },
  "keyEnvelopePlan": {
    "removeEnvelopeRefs": ["keyenv_placeholder_old"],
    "createEnvelopeRefs": ["keyenv_placeholder_new"],
    "wrappedKeyMaterialStatus": "absent",
    "runtimeEnforced": false
  },
  "freshness": {
    "revocationRecordVerified": false,
    "rotationRecordVerified": false,
    "currentClaim": false
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

`schemaVersion` is a draft fixture version, not a Pico Link compatibility level.

`fixtureStage` must remain `draft`.

`rotationId` is a synthetic placeholder identifier. It is not a hash, signature input, Domain Content Key, key envelope, Device Key, Pico Identity Key, bearer token, Move-In Code or recovery handle.

`issuer` names the placeholder Pico identity context that may later issue domain lifecycle records. `proofStatus: "unverified-placeholder"` means the issuer is not verified.

`domain` names the protected-domain context and placeholder key references. `keyMaterialStatus: "absent"` means no raw or wrapped Domain Content Key material is present.

`trigger` names the placeholder reason for rotation. It may refer to lost-device or revocation-record placeholders, but those references are not verified.

`readerSetChange` describes intended reader-set changes only. It does not verify domain membership, key possession, user consent or reader authorization.

`rotationPlan` describes future-access intent. It does not prove completed rotation, future secrecy, historical erasure or retroactive secrecy.

`keyEnvelopePlan` describes intended envelope-reference changes. It must not include wrapped Domain Content Keys, raw Domain Content Keys, ciphertext or algorithm claims.

`freshness` records placeholder verification posture only. It must not claim verified current state or production freshness.

`audit` records placeholder audit intent only. It must stay metadata-only and must not contain sensitive plaintext, private keys, recovery secrets or unwrapped domain keys.

`signatureStatus: "absent"` means no verifiable signature exists.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Allowed draft values

Draft key-envelope-rotation fixtures may use these `domain.domainKind` values:

```text
private_space
shared_space
household_space
project_space
service_placeholder
```

Draft key-envelope-rotation fixtures may use these `trigger.category` values:

```text
lost_device
reader_removed
suspected_compromise
policy_rotation
algorithm_retirement
domain_sensitivity_change
```

Draft key-envelope-rotation fixtures may use these `rotationPlan.status` values:

```text
planned-placeholder
required-placeholder
not-required-placeholder
evaluate-placeholder
```

Draft key-envelope-rotation fixtures may use these key-material status values:

```text
absent
placeholder-ref-only
```

These values are draft vocabulary only. They are not final lifecycle enum values.

## Required rejection cases

Draft key-envelope-rotation fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- real signatures, hashes, canonical bytes, MACs, attestations, key-wrap proofs, rotation proofs or verifier results
- `signatureStatus` values that claim verification
- private identity keys, private device keys, seed phrases, recovery secrets or production credentials
- bearer tokens, Foundation tokens, relay account tokens, passwords or Move-In Codes
- raw Domain Content Keys, wrapped Domain Content Keys, key-encryption keys, seed material, ciphertext or algorithm claims
- key-envelope fields that claim runtime decryption, runtime enforcement or successful removal
- rotation fields that claim completed Domain Content Key rotation without future signed lifecycle records
- freshness fields that claim verified current state, consensus, anti-replay protection or production freshness
- reader-set fields that grant domain membership or plaintext access by themselves
- fields that claim historical plaintext was erased or retroactive secrecy was achieved
- fields that grant recovery authority, Action Runner authority, Pico Rules override authority or Home administration
- fields that rewrite, delete or invalidate historical signed records instead of marking future reader status
- audit fields that include sensitive plaintext or private payloads
- extensions that alter identity, recovery, domain access, history, deletion, membership, lifecycle or authorization semantics

## Rotation is not historical erasure

Domain key rotation can stop future wrapping to removed readers.

It must not claim:

- historical plaintext was forgotten
- previous readers lost memories or cached plaintext
- old backups were safely rewritten
- prior key envelopes disappeared everywhere
- append-only history was deleted
- retroactive secrecy was achieved

Deletion and retention remain governed by ADR 0014 and future protected-domain storage design.

## Key envelopes are not domain membership

A key envelope may later carry access to a domain key for an authorised reader.

A key-envelope rotation placeholder does not itself prove:

- reader membership
- device key possession
- issuer authority
- recipient authorization
- domain access
- policy approval
- successful delivery

Those require future domain membership, credential verification, key wrapping and conformance designs.

## Rotation is not revocation registry enforcement

A revocation registry record may inform rotation planning.

It does not itself:

- remove key envelopes
- rotate Domain Content Keys
- prove current reader set
- prove stale-backup safety
- enforce runtime decryption decisions

Key-envelope rotation fixtures may refer to `revocationRef` or `revocationRecordRef`, but those references remain unverified placeholders until later ADRs define verification semantics.

## Relationship to future verification

Before key-envelope rotation carries security meaning, later ADRs must define:

- Domain Content Key format
- key-envelope format
- key wrapping algorithms or reviewed protocols
- domain membership records
- reader authorization checks
- lifecycle record schema
- canonical rotation bytes
- signature inputs
- issuer and verifier roles
- revocation registry lookup
- freshness and replay rules
- stale-backup restore checks
- key-envelope removal semantics
- historical-read policy
- audit persistence
- verifier behaviour when rotation records are missing, stale or contradictory

Until then, key-envelope-rotation fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton tech demo may use this placeholder only if:

- fixture or demo metadata says `draft-only`
- no Domain Content Key or wrapped key material is present
- no key envelope is accepted by runtime code
- no domain access is granted
- no rotation completion is claimed
- no historical erasure or retroactive secrecy is claimed
- no production signature, key wrapping, freshness or registry claim is made
- no compatibility level above draft is advertised
- no user data is used

## Non-goals

This ADR does not define:

- Domain Content Key format
- key-envelope format
- key wrapping algorithms
- domain membership
- runtime decryption
- key-envelope removal
- domain-key rotation implementation
- historical erasure
- stale-backup enforcement
- conformance runner
- production compatibility certification

## Consequences

Positive:

- gives future protected-domain draft fixtures a safe key-envelope rotation placeholder
- keeps rotation planning separate from raw key material, runtime access and historical erasure
- lets lost-device and revocation-record placeholders point toward domain-impact evaluation without proving completion
- makes unsafe domain-key and retroactive-secrecy claims explicit rejection cases

Negative:

- draft key-envelope-rotation fixtures may require migration when envelope and domain-key formats are selected
- the placeholder cannot exercise real decryption, wrapping or reader authorization
- implementers must keep rotation placeholders separate from runtime authorization

## Relationship to other ADRs

This ADR refines:

- `0014-deletability-and-append-only-events.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`
- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0033-key-lifecycle-rotation-revocation-and-recovery.md`
- `0042-pico-link-draft-schema-and-fixture-gate.md`
- `0052-pico-link-draft-lost-device-revocation-placeholder.md`
- `0053-pico-link-draft-revocation-registry-placeholder.md`

It remains below future domain-key, key-envelope, credential-verification, canonicalization, signature, revocation-registry, backup-restore, runtime-enforcement and conformance specifications.
