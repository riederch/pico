# 0052 - Pico Link Draft Lost Device Revocation Placeholder

## Status

Accepted as a draft-only lost-device and device-revocation placeholder boundary before Pico Link device-key, revocation-registry, signature or runtime enforcement implementation.

## Context

ADR 0029 separates Pico Identity Keys, Device Keys, Pico Home Host Keys, Home Membership Credentials, Domain Content Keys, Transport Session Keys and Relay Routing Identities.

ADR 0031 requires device delegation, revocation and lost-device handling before real Pico Link identity semantics.

ADR 0032 defines future signed event segments, replica manifests, key envelopes and credential families.

ADR 0033 defines Device Key lifecycle and explicitly requires lost-device handling, stale-backup protection and visible revocation.

ADR 0034 requires canonicalization and signature-input decisions before signed lifecycle records carry security meaning.

ADR 0042 permits draft Pico Link fixture work only below runtime, cryptography, relay and compatibility claims.

ADR 0051 defines a draft Device Credential placeholder shape, but does not define a lost-device revocation placeholder.

ADR 0053 defines the parallel revocation registry record placeholder boundary that may later make `revocationRef` discoverable in fixture data.

The next Pico Link identity gap is a safe placeholder for lost-device fixture work: a way to describe that a device should lose future authority without accidentally claiming real revocation enforcement, identity replacement, completed domain-key rotation, historical rewrite or recovery authority.

## Decision

Future draft Pico Link fixtures may use a Lost Device Revocation placeholder shape.

This placeholder is not a revocation implementation. It does not verify issuer authority, device-key possession, signature validity, revocation freshness, stale-backup state, domain-key rotation, key-envelope removal, runtime enforcement or audit persistence.

## Core rule

```text
Lost-device revocation stops future device authority.
It must not replace identity, rotate domain keys, rewrite history or silently restore stale authority.
```

## Draft lost-device revocation placeholder shape

Draft fixtures may model a Lost Device Revocation placeholder with only these top-level fields:

```json
{
  "schema": "pico.identity.lost-device-revocation.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "revocationId": "devrevoke_placeholder_...",
  "actor": {
    "picoIdHint": "pico_placeholder_...",
    "identityKeyRef": "picoidkey_placeholder_...",
    "actorDeviceIdHint": "device_placeholder_...",
    "proofStatus": "unverified-placeholder"
  },
  "subject": {
    "deviceKind": "trusted-device",
    "deviceIdHint": "device_placeholder_...",
    "deviceKeyRef": "devicekey_placeholder_...",
    "credentialIdRef": "devcred_placeholder_...",
    "stateBefore": "active",
    "stateAfter": "lost",
    "lastSeenAt": "2026-07-12T10:00:00.000Z"
  },
  "reason": {
    "category": "lost_device",
    "userVisible": true,
    "descriptionHint": "Synthetic lost phone"
  },
  "revocation": {
    "status": "revoked",
    "revocationRef": "revocation_placeholder_...",
    "effectiveAt": "2026-07-12T12:00:00.000Z",
    "appliesToScopes": ["packet.sign", "packet.receive"],
    "futureAuthorityBlocked": true,
    "historicalRecordsRetained": true
  },
  "domainImpact": {
    "domainRefs": [],
    "domainKeyRotationRequired": "evaluate",
    "domainKeyRotationStatus": "not_claimed"
  },
  "backupPolicy": {
    "staleBackupReactivation": "reject",
    "freshnessRequired": true
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

`revocationId` is a synthetic placeholder identifier. It is not a revocation registry entry, hash, signature input, Device Key, Pico Identity Key, bearer token, Move-In Code or recovery handle.

`actor` names the placeholder Pico identity context that may later request revocation. `proofStatus: "unverified-placeholder"` means the actor is not verified.

`subject` names the placeholder device, Device Key reference and related Device Credential reference. It is not proof of device-key possession, key compromise, user approval or hardware state.

`reason` describes draft user-visible intent only. It must not hide revocation behind restore, migration or recovery language.

`revocation` describes intended future-authority blocking. It does not prove propagation, enforcement, freshness, key-envelope removal or signature validity.

`domainImpact` may say that affected domains need evaluation or rotation. It must not claim completed Domain Content Key rotation or expose raw or wrapped Domain Content Keys.

`backupPolicy` records the placeholder stale-backup boundary. It does not inspect backups or enforce freshness.

`audit` records placeholder audit intent only. It must stay metadata-only and must not contain sensitive plaintext, private keys, recovery secrets or unwrapped domain keys.

`signatureStatus: "absent"` means no verifiable signature exists.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Allowed draft values

Draft lost-device fixtures may use these `subject.deviceKind` values:

```text
pico-vault
trusted-device
pico-surface
browser-session
service-placeholder
```

Draft lost-device fixtures may use these `subject.stateBefore` values:

```text
active
pending_activation
retiring
unknown
```

Draft lost-device fixtures may use these `subject.stateAfter` values:

```text
lost
revoked
compromised
superseded
```

Draft lost-device fixtures may use these `reason.category` values:

```text
lost_device
suspected_compromise
user_reported_missing
device_retired_by_owner
```

Draft lost-device fixtures may use these `revocation.appliesToScopes` values:

```text
packet.sign
packet.receive
history.sign
manifest.sign
sync.exchange
key_envelope.receive
surface.session
```

Draft lost-device fixtures may use these `domainImpact.domainKeyRotationStatus` values:

```text
not_claimed
evaluate
required_placeholder
not_required_placeholder
```

These values are draft vocabulary only. They are not final lifecycle enum values.

## Required rejection cases

Draft lost-device fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- real signatures, hashes, canonical bytes, MACs, attestations, revocation proofs or verifier results
- `signatureStatus` values that claim verification
- private identity keys, private device keys, seed phrases, recovery secrets or production credentials
- bearer tokens, Foundation tokens, relay account tokens, passwords or Move-In Codes
- actor fields that claim verified Pico Identity Key authority
- subject fields that claim verified Device Key possession or hardware attestation
- revocation fields that claim runtime propagation, registry freshness, key-envelope removal or production enforcement
- stale-backup restore fields that reactivate a lost or revoked device
- fields that replace, rotate or recover the Pico Identity Key as a side effect of lost-device handling
- fields that grant recovery authority, Action Runner authority, Pico Rules override authority or Home administration
- fields that rewrite, delete or invalidate historical signed records instead of marking future trust as revoked
- domain-impact fields that claim completed Domain Content Key rotation without a future domain-key lifecycle record
- raw Domain Content Keys, wrapped Domain Content Keys or key-encryption material
- audit fields that include sensitive plaintext or private payloads
- extensions that alter identity, recovery, domain access, history, deletion, membership, lifecycle or authorization semantics

## Lost-device revocation is not identity replacement

Lost-device revocation may describe that one device should lose future operational authority.

It must not:

- replace the Pico Identity Key
- create a new Pico identity
- destroy the old Pico identity
- grant recovery authority
- rewrite relationship continuity
- revoke all relationships
- transfer ownership to a Home, Relay, cloud account or Move-In Code

If the Pico Identity Key itself is compromised, that is a separate identity replacement or recovery design.

## Lost-device revocation is not domain-key rotation

A lost device may have had access to protected domains.

Lost-device revocation may mark that domain impact must be evaluated, but it does not itself:

- rotate Domain Content Keys
- remove old key envelopes
- prove that future key wrapping stopped
- prove historical plaintext was forgotten
- grant or revoke domain membership
- crypto-shred content

Domain key rotation must remain a separate protected-domain lifecycle action with its own records, audit and future conformance tests.

## Stale-backup boundary

Backups may contain old Device Credentials, key envelopes, manifests or local state.

A restore from a stale backup must not silently reactivate a lost, revoked or compromised device.

Draft fixtures may represent stale-backup rejection, but they must not claim:

- actual backup scanning
- revocation freshness enforcement
- distributed state convergence
- domain-key rotation enforcement
- production restore safety

## Historical trust boundary

Lost-device revocation stops future authority.

It should not make historical records disappear or silently rewrite old signatures. Future signed history must distinguish:

- historical record existed before revocation
- future trust is revoked
- later replay or new signature from that device is rejected

Until signed history and canonicalization exist, draft fixtures may only state this boundary.

## Relationship to future verification

Before lost-device revocation carries security meaning, later ADRs must define:

- Pico Identity Key public format
- Device Key public format
- Device Credential verification
- lifecycle record schema
- canonical revocation bytes
- signature inputs
- revocation registry or propagation model
- freshness and replay rules
- stale-backup restore checks
- domain-key rotation records
- key-envelope removal semantics
- audit persistence
- user-visible recovery and lost-device UX
- verifier behaviour

Until then, lost-device fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton tech demo may use this placeholder only if:

- fixture or demo metadata says `draft-only`
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
- Device Credential verifier
- revocation registry
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

- gives future Pico Link identity draft fixtures a safe lost-device placeholder
- keeps revocation separate from identity replacement, recovery and domain-key rotation
- makes stale-backup reactivation an explicit rejection case
- preserves the distinction between future-authority blocking and historical record rewriting

Negative:

- draft lost-device fixtures may require migration when lifecycle records are selected
- the placeholder cannot exercise real distributed revocation or restore safety
- implementers must keep lost-device placeholders separate from runtime authorization

## Relationship to other ADRs

This ADR refines:

- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`
- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0033-key-lifecycle-rotation-revocation-and-recovery.md`
- `0042-pico-link-draft-schema-and-fixture-gate.md`
- `0051-pico-link-draft-device-credential-placeholder.md`

It is parallel to, but separate from:

- `0053-pico-link-draft-revocation-registry-placeholder.md`

It remains below future identity-key, device-key, credential-verification, canonicalization, signature, revocation-registry, backup-restore, domain-key-rotation, runtime-enforcement and conformance specifications.
