# 0053 - Pico Link Draft Revocation Registry Placeholder

## Status

Accepted as a draft-only revocation registry and lifecycle-record placeholder boundary before Pico Link revocation propagation, signature verification, freshness enforcement or runtime authorization implementation.

## Context

ADR 0029 separates Pico Identity Keys, Device Keys, Pico Home Host Keys, Home Membership Credentials, Domain Content Keys, Transport Session Keys and Relay Routing Identities.

ADR 0031 requires revoked devices and evicted Home members to stop gaining new access through old credentials.

ADR 0032 defines future signed event segments, replica manifests, key envelopes and credential families.

ADR 0033 requires explicit lifecycle records, revocation propagation rules, stale-backup handling and audit records before lifecycle-sensitive keys or credentials carry security meaning.

ADR 0034 requires canonicalization and signature-input decisions before signed lifecycle records carry security meaning.

ADR 0042 permits draft Pico Link fixture work only below runtime, cryptography, relay and compatibility claims.

ADR 0051 defines a draft Device Credential placeholder shape.

ADR 0052 defines a draft lost-device revocation placeholder shape and refers to a `revocationRef`, but does not define a revocation registry or lifecycle-record placeholder.

ADR 0054 defines the parallel key-envelope rotation placeholder boundary that may later consume revocation records when evaluating domain-reader changes.

The next Pico Link identity gap is a safe placeholder for revocation records: a way to describe that a device, credential or lifecycle subject has a newer visible state without accidentally claiming global consensus, verified freshness, runtime enforcement, identity authority, recovery authority or domain-key rotation.

## Decision

Future draft Pico Link fixtures may use a Revocation Registry Record placeholder shape.

This placeholder is not a revocation registry implementation. It does not verify issuer authority, signatures, canonical bytes, freshness, propagation, stale-backup state, runtime enforcement, key-envelope removal, domain-key rotation or audit persistence.

## Core rule

```text
A revocation registry makes lifecycle status discoverable.
It must not become identity authority, recovery authority, domain-key authority or runtime enforcement.
```

## Draft revocation record placeholder shape

Draft fixtures may model a revocation registry record placeholder with only these top-level fields:

```json
{
  "schema": "pico.lifecycle.revocation-record.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "recordId": "revrecord_placeholder_...",
  "registry": {
    "registryId": "revreg_placeholder_...",
    "scope": "pico-local-placeholder",
    "authorityStatus": "unverified-placeholder"
  },
  "issuer": {
    "picoIdHint": "pico_placeholder_...",
    "identityKeyRef": "picoidkey_placeholder_...",
    "issuerDeviceIdHint": "device_placeholder_...",
    "proofStatus": "unverified-placeholder"
  },
  "subject": {
    "subjectKind": "device",
    "deviceIdHint": "device_placeholder_...",
    "deviceKeyRef": "devicekey_placeholder_...",
    "credentialIdRef": "devcred_placeholder_..."
  },
  "lifecycle": {
    "recordKind": "device_revocation",
    "previousStatus": "active",
    "newStatus": "revoked",
    "reasonCategory": "lost_device",
    "effectiveAt": "2026-07-12T12:00:00.000Z",
    "sequenceHint": 3
  },
  "affectedScopes": ["packet.sign", "packet.receive"],
  "freshness": {
    "observedAt": "2026-07-12T12:01:00.000Z",
    "notBefore": "2026-07-12T12:00:00.000Z",
    "expiresAt": "2026-07-12T12:15:00.000Z",
    "status": "bounded-placeholder",
    "currentClaim": false
  },
  "propagation": {
    "status": "not_propagated",
    "runtimeEnforced": false,
    "keyEnvelopeRemoval": "not_claimed",
    "staleBackupHandling": "not_claimed"
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

`recordId` is a synthetic placeholder identifier. It is not a hash, signature input, registry proof, Device Key, Pico Identity Key, bearer token, Move-In Code or recovery handle.

`registry` names the placeholder registry context. `authorityStatus: "unverified-placeholder"` means the registry is not verified and is not authoritative beyond fixture shape.

`issuer` names the placeholder Pico identity context that may later issue lifecycle records. `proofStatus: "unverified-placeholder"` means the issuer is not verified.

`subject` names the placeholder lifecycle subject. It may refer to a device, credential, membership or other future lifecycle object, but it does not prove key possession or authority.

`lifecycle` records the intended transition. It does not verify ordering, causality, signature validity, issuer authority or state convergence.

`affectedScopes` describes draft operational scope. It does not grant or revoke domain plaintext access by itself.

`freshness` bounds how the placeholder may be interpreted. It must not claim global currentness, consensus or anti-replay guarantees.

`propagation` describes placeholder delivery and enforcement posture only. It must not claim runtime enforcement, registry synchronization, key-envelope removal or stale-backup safety.

`audit` records placeholder audit intent only. It must stay metadata-only and must not contain sensitive plaintext, private keys, recovery secrets or unwrapped domain keys.

`signatureStatus: "absent"` means no verifiable signature exists.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Allowed draft values

Draft revocation-record fixtures may use these `registry.scope` values:

```text
pico-local-placeholder
home-local-placeholder
relay-cache-placeholder
test-suite-placeholder
```

Draft revocation-record fixtures may use these `subject.subjectKind` values:

```text
device
device_credential
home_membership
domain_reader
relay_routing_identity
```

Draft revocation-record fixtures may use these `lifecycle.recordKind` values:

```text
device_revocation
device_lost
credential_revocation
membership_revocation
reader_removed
routing_identity_retired
```

Draft revocation-record fixtures may use these lifecycle status values:

```text
pending_activation
active
retiring
retired
revoked
lost
compromised
superseded
expired
unknown
```

Draft revocation-record fixtures may use these `affectedScopes` values:

```text
packet.sign
packet.receive
history.sign
manifest.sign
sync.exchange
key_envelope.receive
surface.session
host.use
storage.queue
```

Draft revocation-record fixtures may use these `freshness.status` values:

```text
bounded-placeholder
stale-placeholder
unknown-placeholder
not-evaluated
```

Draft revocation-record fixtures may use these `propagation.status` values:

```text
not_propagated
queued_placeholder
observed_placeholder
not_claimed
```

These values are draft vocabulary only. They are not final lifecycle enum values.

## Required rejection cases

Draft revocation-record fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- real signatures, hashes, canonical bytes, MACs, attestations, revocation proofs, registry proofs or verifier results
- `signatureStatus` values that claim verification
- private identity keys, private device keys, seed phrases, recovery secrets or production credentials
- bearer tokens, Foundation tokens, relay account tokens, passwords or Move-In Codes
- registry fields that claim global authority, consensus, trust root status or runtime enforcement
- issuer fields that claim verified Pico Identity Key authority
- subject fields that claim verified Device Key possession or hardware attestation
- lifecycle fields that replace, recover or rotate a Pico Identity Key
- freshness fields that claim `current`, global latest state, anti-replay protection or production freshness without a future signed freshness design
- propagation fields that claim runtime enforcement, registry synchronization, key-envelope removal, stale-backup enforcement or restore safety
- fields that grant recovery authority, Action Runner authority, Pico Rules override authority or Home administration
- fields that rewrite, delete or invalidate historical signed records instead of marking future trust as revoked
- domain-impact fields that claim completed Domain Content Key rotation without a future domain-key lifecycle record
- raw Domain Content Keys, wrapped Domain Content Keys or key-encryption material
- audit fields that include sensitive plaintext or private payloads
- extensions that alter identity, recovery, domain access, history, deletion, membership, lifecycle or authorization semantics

## Registry is not identity authority

A revocation registry may later help find lifecycle status.

It must not:

- own Pico Identity Keys
- decide identity replacement
- become a recovery oracle
- replace issuer signatures
- grant Home administration
- grant Action Runner or Pico Rules authority
- revoke all relationships globally
- transfer ownership to a Home, Relay, cloud account or Move-In Code

If a registry is missing, stale or unavailable, future verifiers must have explicit behaviour. This ADR does not choose that behaviour.

## Registry is not freshness proof

Revocation data is only useful if consumers know whether it is fresh enough for the action being evaluated.

Draft fixtures may describe bounded placeholder freshness, but they must not claim:

- global latest state
- consensus
- durable anti-replay protection
- clock synchronization correctness
- offline convergence
- production restore safety

Future work must define freshness windows, replay handling, stale backup behaviour and offline conflict resolution before compatibility claims.

## Registry is not domain-key rotation

A registry record may say that a domain reader, device or credential changed state.

It does not itself:

- rotate Domain Content Keys
- remove old key envelopes
- prove future key wrapping stopped
- prove historical plaintext was forgotten
- grant or revoke domain membership
- crypto-shred content

Domain key rotation must remain a separate protected-domain lifecycle action with its own records, audit and future conformance tests.

## Relationship to future verification

Before revocation registry records carry security meaning, later ADRs must define:

- Pico Identity Key public format
- Device Key public format
- credential verification
- lifecycle record schema
- canonical lifecycle bytes
- signature inputs
- issuer and verifier roles
- registry storage and propagation model
- freshness and replay rules
- stale-backup restore checks
- conflict resolution
- key-envelope removal semantics
- domain-key rotation records
- audit persistence
- user-visible recovery and lost-device UX
- verifier behaviour when registry data is missing, stale or contradictory

Until then, revocation-record fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton tech demo may use this placeholder only if:

- fixture or demo metadata says `draft-only`
- no registry record is accepted as runtime authorization
- no registry record replaces issuer verification
- no registry record claims global currentness
- no revoked device is actually enforced by runtime code
- no identity is replaced
- no domain key is rotated or exposed
- no stale backup restore is accepted as safe
- no production signature, key possession, revocation freshness or registry claim is made
- no compatibility level above draft is advertised
- no user data is used

## Non-goals

This ADR does not define:

- Device Key format
- credential verifier
- real revocation registry
- registry consensus
- runtime revocation enforcement
- backup restore implementation
- domain-key rotation
- key-envelope removal
- signed history semantics
- identity replacement
- recovery UX
- conformance runner
- production compatibility certification

## Consequences

Positive:

- gives future Pico Link identity draft fixtures a safe revocation-record placeholder
- gives `revocationRef` from ADR 0052 a non-authoritative placeholder target
- makes freshness and stale-registry claims explicit rejection cases
- keeps registry lookup separate from identity, recovery, runtime enforcement and domain-key rotation

Negative:

- draft revocation-record fixtures may require migration when lifecycle record schemas are selected
- the placeholder cannot exercise real distributed revocation or restore safety
- implementers must keep registry placeholders separate from runtime authorization

## Relationship to other ADRs

This ADR refines:

- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`
- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0033-key-lifecycle-rotation-revocation-and-recovery.md`
- `0042-pico-link-draft-schema-and-fixture-gate.md`
- `0051-pico-link-draft-device-credential-placeholder.md`
- `0052-pico-link-draft-lost-device-revocation-placeholder.md`

It is parallel to, but separate from:

- `0054-pico-link-draft-key-envelope-rotation-placeholder.md`

It remains below future identity-key, device-key, credential-verification, canonicalization, signature, revocation-registry, backup-restore, domain-key-rotation, runtime-enforcement and conformance specifications.
