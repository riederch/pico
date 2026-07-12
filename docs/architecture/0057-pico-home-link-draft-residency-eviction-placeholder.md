# 0057 - Pico Home Link Draft Residency Eviction Placeholder

## Status

Accepted as a draft-only Pico Home Link residency and eviction placeholder boundary before Home Membership Credential verification, host residency enforcement, shared-domain rotation or runtime host authorization are implemented.

## Context

ADR 0024 defines host tenancy and eviction: eviction means future exclusion from one host, not Pico identity destruction, private key seizure, resident history rewrite or global relationship revocation.

ADR 0027 defines the future Empty Pico Home and Move-In Code setup path, but does not implement residency transitions.

ADR 0029 separates Home Membership Credentials, Pico Identity Keys, Device Keys, Home Host Keys and Domain Content Keys.

ADR 0031 requires Home membership and domain access to remain separate, with host membership granting host use only.

ADR 0032 defines Home Membership Credentials conceptually.

ADR 0033 defines Home Membership Credential lifecycle states such as invited, active, revoked, expired, evicted and transferred or reissued.

ADR 0034 requires canonicalization and signature-input decisions before signed lifecycle records carry security meaning.

ADR 0042 permits draft Pico Link and Pico Home Link fixture work only below runtime, cryptography, relay and compatibility claims.

ADR 0045 defines a draft Home Membership Credential placeholder.

ADR 0056 defines a draft Home Host Key placeholder and explicitly forbids host keys from becoming resident signing or domain decryption authority.

The next Pico Home Link lifecycle gap is a safe placeholder for residency and eviction records: a way to describe future Home residency state transitions without accidentally making eviction global identity destruction, resident-domain decryption, resident backup deletion, history rewrite or runtime enforcement.

## Decision

Future draft Pico Home Link fixtures may use a Residency Eviction placeholder shape.

This placeholder is not a residency implementation. It does not verify Home Host Key authority, Home Membership Credentials, resident identity, currentness, revocation, signatures, shared-domain rotation, host-local cleanup, runtime access denial or conformance.

## Core rule

```text
Eviction changes future use of one Home.
It must not destroy Pico identity, seize private keys or delete resident-owned history.
```

## Draft residency eviction placeholder shape

Draft fixtures may model a Residency Eviction placeholder with only these top-level fields:

```json
{
  "schema": "pico.home.residency-record.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "residencyRecordId": "residency_placeholder_...",
  "home": {
    "homeIdHint": "home_placeholder_...",
    "homeHostKeyRef": "homehostkey_placeholder_...",
    "proofStatus": "unverified-placeholder"
  },
  "actor": {
    "hostPicoIdHint": "pico_placeholder_home_host",
    "hostDeviceIdHint": "device_placeholder_home_host",
    "proofStatus": "unverified-placeholder"
  },
  "resident": {
    "residentPicoIdHint": "pico_placeholder_member",
    "residentDeviceRefs": ["device_placeholder_member"],
    "membershipCredentialRef": "homecred_placeholder_member",
    "proofStatus": "unverified-placeholder"
  },
  "transition": {
    "previousStatus": "active",
    "newStatus": "evicted",
    "reason": "host_policy_placeholder",
    "globalIdentityDestroyed": false,
    "relationshipRevokedGlobally": false,
    "historyRewritten": false
  },
  "access": {
    "futureHostAccess": false,
    "futureSyncToHome": false,
    "residentDomainAccessGranted": false,
    "residentDevicesDisabledGlobally": false
  },
  "domainImpact": {
    "sharedDomainKeyRotation": "evaluate-placeholder",
    "domainKeyMaterialStatus": "absent"
  },
  "cleanup": {
    "hostLocalCiphertextCleanup": "not-requested",
    "residentBackupsDeleted": false,
    "auditErased": false
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

`residencyRecordId` is a synthetic placeholder identifier. It is not a hash, signature input, membership credential, Home Host Key, Move-In Code, recovery handle or deletion proof.

`home` names the placeholder Pico Home context. The Home Host Key reference is not verified.

`actor` names the placeholder Home Host Pico or device context. It does not prove authority to evict.

`resident` names the placeholder resident Pico and membership credential. It does not verify resident identity, device possession or current membership.

`transition` describes intended lifecycle state movement only. It must not claim global identity destruction, global relationship revocation or history rewrite.

`access` describes future use of one Home only. It must not disable resident-owned devices globally or grant resident private-domain access to the host.

`domainImpact` may indicate that shared or household domain key rotation should be evaluated. It must not contain Domain Content Keys or prove completed rotation.

`cleanup` describes host-local storage cleanup posture only. It must not claim deletion of resident-owned devices, backups, exports, private keys or identities.

`audit` records placeholder audit intent only. It must stay metadata-only and must not contain resident plaintext, private keys, recovery secrets, Move-In Codes or Domain Content Keys.

`signatureStatus: "absent"` means no verifiable signature exists.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Allowed draft values

Draft residency fixtures may use these membership status values:

```text
invited
active
revoked
expired
evicted
transferred_or_reissued
unknown
```

Draft residency fixtures may use these `transition.reason` values:

```text
host_policy_placeholder
member_left_placeholder
invite_expired_placeholder
host_reset_placeholder
membership_reissued_placeholder
security_review_placeholder
unknown_placeholder
```

Draft residency fixtures may use these `domainImpact.sharedDomainKeyRotation` values:

```text
not-required-placeholder
evaluate-placeholder
required-placeholder
not-claimed
```

Draft residency fixtures may use these `cleanup.hostLocalCiphertextCleanup` values:

```text
not-requested
planned-placeholder
completed-placeholder-unverified
not-claimed
```

These values are draft vocabulary only. They are not final lifecycle enum values, host authority scopes, deletion semantics or verifier rules.

## Required rejection cases

Draft residency fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- real signatures, hashes, canonical bytes, MACs, attestations, deletion proofs, trust-path proofs or verifier results
- `signatureStatus` values that claim verification
- private identity keys, private device keys, Home Host private keys, Domain Content Keys, seed phrases, recovery shares or production credentials
- bearer tokens, Foundation tokens, host admin passwords, relay account tokens or Move-In Codes
- final algorithms, final serialization, final fingerprints or compatibility levels before reviewed formats exist
- eviction records that claim global Pico identity destruction
- eviction records that claim resident-owned devices, backups or exports were deleted
- eviction records that claim resident private keys were seized or invalidated globally
- eviction records that grant host access to resident Private Space, Shared Space or Domain Content Keys
- eviction records that rewrite or delete signed resident history instead of recording future host access status
- cleanup fields that claim cryptographic erasure of data outside host-local storage
- domain-impact fields that expose raw or wrapped Domain Content Keys or prove completed rotation
- freshness fields that claim verified currentness, consensus, anti-replay protection or runtime enforcement
- audit fields that include resident plaintext, private keys, recovery secrets, Move-In Codes or Domain Content Keys
- extensions that alter identity, membership, decryption, lifecycle, recovery, deletion, authorization, relay or compatibility semantics

## Eviction is not identity destruction

Eviction may deny future use of one Pico Home.

It must not claim:

- the resident Pico identity was deleted
- resident devices were globally disabled
- resident private keys were seized
- resident backups were deleted
- relationships outside the Home were revoked
- signed resident history was rewritten
- local full-client replicas were invalidated

The resident Pico may continue through its own trusted devices, exports, backups or other Homes where configured.

## Host cleanup is not global deletion

A host may later delete host-local ciphertext under a reviewed retention policy.

That must be represented as host-local cleanup only.

It must not claim:

- resident-owned backups were deleted
- resident-owned exports were deleted
- resident devices were wiped
- other Homes deleted their replicas
- private keys were destroyed
- a person-level deletion request was completed
- audit records may be silently erased

Deletion and retention remain governed by ADR 0014 and future protected-domain storage design.

## Eviction is not domain access

Eviction may cause future shared or household domain key rotation to be evaluated.

It must not give the host:

- resident Private Space plaintext
- resident Shared Space plaintext
- raw Domain Content Keys
- wrapped Domain Content Keys
- key-envelope unwrap authority
- backup decryption authority
- recovery authority

Domain access must remain an explicit protected-domain decision with separate key envelopes, membership, rotation and audit semantics.

## Relationship to Home Membership Credentials

ADR 0045 Home Membership Credential placeholders may describe invited, active, revoked, expired and evicted membership states.

ADR 0057 narrows what residency and eviction records may mean at fixture level:

- they may describe future host access state
- they do not verify credential authority
- they do not enforce runtime access
- they do not delete Pico identity
- they do not grant domain access
- they do not prove shared-domain key rotation

Membership Credential verifier behaviour remains future work.

## Relationship to Home Host Keys

ADR 0056 Home Host Key placeholders may describe host infrastructure continuity.

ADR 0057 does not make the Home Host Key authoritative. Residency fixtures may refer to `homeHostKeyRef`, but those references remain unverified placeholders until later ADRs define issuer roles, signatures, freshness and verifier behaviour.

## Relationship to future verification

Before residency and eviction records carry security meaning, later ADRs must define:

- Home Host Key format and verification
- Home Membership Credential verification
- residency record schema
- canonical residency bytes
- signature inputs
- issuer and verifier roles
- status transition rules
- freshness and replay semantics
- revocation lookup
- host-local cleanup semantics
- shared-domain rotation linkage
- resident notification and appeal/acknowledgement behaviour
- audit persistence and visibility
- verifier behaviour for stale, missing or contradictory residency records
- conformance fixture families for positive and negative lifecycle verification

Until then, residency fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton demo may reference residency placeholders only as visibly unverified fixture data.

The demo must not:

- enforce real evictions
- delete resident data
- claim Home Membership Credential verification
- claim Home Host Key authority
- rotate real Domain Content Keys
- grant host access to resident domains
- publish compatibility or security claims

If a demo needs real residency enforcement, this ADR is insufficient and reviewed membership, storage, audit and cryptographic designs must come first.

## Implementation status

This ADR is documentation and fixture-gate direction only.

The repository does not implement:

- Home residency records
- Home eviction enforcement
- Home Membership Credential verification
- Home Host Key verification
- residency canonicalization
- residency signatures
- host-local cleanup policy
- shared-domain rotation linkage
- runtime access denial from residency records
- conformance runner for residency lifecycle verification

## Non-goals

This ADR does not define:

- final residency schema
- cryptographic algorithms
- key serialization formats
- signature formats
- canonicalization output
- deletion protocol
- host cleanup protocol
- Home reset protocol
- Home migration protocol
- shared-domain rotation protocol
- recovery protocol
- runtime parser
- production verifier
- compatibility level
- commercial permission
