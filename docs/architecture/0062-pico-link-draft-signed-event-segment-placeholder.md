# 0062 - Pico Link Draft Signed Event Segment Placeholder

## Status

Accepted as a draft-only Pico Link signed event segment placeholder boundary before canonicalization, signature inputs, device delegation verification or append-only history enforcement are implemented.

## Context

ADR 0014 defines deletability and append-only events: signed history must not be silently rewritten, and payload posture governs what a record may carry.

ADR 0029 separates Pico Identity Keys, Device Keys, Home Host Keys and Domain Content Keys, and reserves signatures for device delegations, membership credentials, event segments, replica manifests and audit records.

ADR 0031 requires event authorship and domain access to remain separate and verifiable before history carries security meaning.

ADR 0032 defines a conceptual signed event segment schema family: a segment binds event or message records to an author, scope and ordering context, signs a canonical representation rather than display JSON, requires the author device to be delegated for the scope, uses `previousSegmentId` chaining to detect missing history, and lets a host store segments but not create valid resident segments without resident signing authority.

ADR 0034 requires canonicalization and signature-input decisions before signatures, hashes or compatibility claims carry security meaning.

ADR 0042 permits draft Pico Link fixture work only below runtime, cryptography, relay and compatibility claims.

ADR 0056 defines a draft Home Host Key placeholder and forbids host keys from signing as resident Picos.

The signed event segment is a schema family from ADR 0032 that has no draft fixtures yet. The current draft suite covers packet envelope, protected payload, identity key, device credential, lost-device revocation, revocation registry, key-envelope rotation, Home Host Key, Home membership and Home residency, but not event authorship. `PicoEvent.signature` remains opaque, unverified metadata.

The next useful step is a safe placeholder for signed event segments: a way to describe intended event-authorship binding without accidentally claiming a verified signature, forging resident authorship on a host or rewriting signed history.

## Decision

Future draft Pico Link fixtures may use a Signed Event Segment placeholder shape.

This placeholder is not a history implementation. It does not verify signatures, canonicalization, event hashes, device delegation, author identity or ordering, and it does not enforce append-only history.

A draft signed event segment describes the intended binding of an event range to an author, scope and chaining context. Signature, canonicalization and delegation all remain unverified placeholders.

## Core rule

```text
A signed event segment binds an event range to an author, scope and chain.
It is never a verified signature, never resident authorship on a host and never a rewrite of prior signed history.
```

## Draft signed event segment placeholder shape

Draft fixtures may model a signed event segment placeholder with these top-level fields:

```json
{
  "schema": "pico.history.segment.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "segmentRecordId": "segment_placeholder_...",
  "author": {
    "picoIdHint": "pico_placeholder_...",
    "deviceIdHint": "device_placeholder_...",
    "delegationStatus": "unverified-placeholder",
    "proofStatus": "unverified-placeholder"
  },
  "scope": {
    "domainIdHint": "domain_placeholder_...",
    "streamHint": "stream_placeholder_...",
    "payloadPosture": "metadata-only"
  },
  "range": {
    "firstSequence": 1,
    "lastSequence": 25,
    "previousSegmentIdHint": "segment_placeholder_prev_...",
    "chainingStatus": "unverified-placeholder",
    "rewritesPreviousHistory": false
  },
  "integrity": {
    "eventsHashRef": "hash_placeholder_...",
    "eventsHashStatus": "absent",
    "canonicalizationStatus": "absent"
  },
  "authorship": {
    "hostStored": true,
    "authorDelegated": false,
    "residentSigningAuthority": false
  },
  "audit": {
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

`segmentRecordId` is a synthetic placeholder identifier. It is not a hash, signature input or verified segment handle.

`author` names the placeholder author Pico and device. `delegationStatus` and `proofStatus` stay unverified: naming an author does not prove the device was delegated for the scope.

`scope` names the placeholder domain and stream and keeps `payloadPosture` metadata-only per ADR 0014.

`range` describes an event sequence range and chaining hint. `previousSegmentIdHint` and `chainingStatus` describe intended chaining, not verified continuity. `rewritesPreviousHistory` must be `false`: a segment records new history and must not rewrite prior signed history.

`integrity` holds placeholder integrity references only. `eventsHashStatus` and `canonicalizationStatus` stay `absent`: there is no verified event hash and no canonical byte representation until ADR 0034 decisions exist.

`authorship` describes storage and authority posture. `hostStored` may be `true` - a host may store segments - but `residentSigningAuthority` must be `false`: a host cannot author or sign as a resident Pico.

`audit` records placeholder audit intent only and stays metadata-only.

`signatureStatus: "absent"` means no verifiable signature exists.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Draft rejection reasons

Draft signed event segment fixtures may use these rejection reasons:

```text
segment_signature_verified_claim
resident_authorship_forgery
segment_history_rewrite_claim
```

These values are draft vocabulary only. They are not final conformance error codes.

## Required rejection cases

Draft signed event segment fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- segments that claim a verified signature, verified event hash or verified canonicalization
- segments where a host claims resident signing authority or forges resident authorship
- segments that claim to rewrite, delete or supersede prior signed history
- real signatures, hashes, canonical bytes, MACs or attestations
- private identity keys, private device keys or Domain Content Keys
- payload postures that expose private plaintext
- fixtures that omit required draft disclaimers
- fixtures that claim compatibility above draft-only
- fixtures that imply production security or commercial permission

## A segment is not a verified signature

A draft signed event segment describes intended authorship binding.

It must not claim:

- a verified signature over the range
- a verified event hash
- a verified canonical representation
- a verified author possession proof

Signature, hash and canonicalization remain unverified placeholders until ADR 0034 defines canonical bytes and signature inputs.

## A host is not a resident author

A draft signed event segment may be stored by a host.

A host must not:

- author a segment as a resident Pico
- sign as a resident Pico
- forge resident history
- claim resident signing authority

Resident authorship stays with resident signing keys, consistent with ADR 0056 Home Host Key boundaries.

## A segment is not a history rewrite

A draft signed event segment records a new event range.

It must not:

- rewrite prior signed history
- delete prior segments
- supersede a previous segment's signed content
- break append-only guarantees

Chaining detects missing history; it does not authorize rewriting it. Deletion and retention remain governed by ADR 0014.

## Relationship to other draft surfaces

ADR 0055 identity-key, ADR 0056 Home Host Key, ADR 0051 device-credential and ADR 0053 revocation-registry placeholders describe keys and lifecycle. ADR 0062 describes what a signed segment of the event log may claim at fixture level:

- it may name an author, scope, range and chain
- it does not verify signatures, hashes or canonicalization
- it does not verify device delegation
- it does not let a host author resident history
- it does not rewrite prior signed history

Author identity, delegation and signature verification remain future work.

## Relationship to future verification

Before signed event segments carry security meaning, later ADRs must define:

- canonical segment bytes and signature inputs
- event hash construction
- device delegation verification for a scope
- author identity verification
- chaining and gap-detection rules
- append-only enforcement and payload posture
- replica manifest linkage
- audit persistence and visibility
- verifier behaviour for forged, mismatched or history-rewriting segments
- conformance fixture families for positive and negative segment verification

Until then, signed event segment fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton demo may reference signed event segment placeholders only as visibly unverified fixture data.

The demo must not:

- verify a real signature or hash
- author resident history on a host
- rewrite prior history
- publish compatibility or security claims

If a demo needs real signed history, this ADR is insufficient and reviewed canonicalization, signature, delegation and append-only designs must come first.

## Implementation status

This ADR is documentation and fixture-gate direction only.

The repository does not implement:

- signed event segments
- segment canonicalization or signatures
- event hash construction
- device delegation verification
- append-only history enforcement
- replica manifest linkage
- a conformance runner for segment verification

## Non-goals

This ADR does not define:

- final segment schema
- cryptographic algorithms
- canonicalization output
- signature formats
- event hash construction
- delegation verification protocol
- replica manifest schema
- runtime parser
- production verifier
- compatibility level
- commercial permission

## Relationship to other ADRs

This ADR refines:

- `0032-pico-link-envelope-and-credential-schema-direction.md`

It depends on and stays below:

- `0014-deletability-and-append-only-events.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`
- `0034-canonicalization-signature-inputs-and-test-vectors.md`

It is staged under:

- `0042-pico-link-draft-schema-and-fixture-gate.md`

It is similar in staging intent to:

- `0055-pico-link-draft-identity-key-placeholder.md`
- `0056-pico-home-link-draft-home-host-key-placeholder.md`
- `0057-pico-home-link-draft-residency-eviction-placeholder.md`

It remains below future Pico Link runtime, cryptography, canonicalization, signature, delegation and conformance specifications.

## Consequences

Positive:

- gives the signed event segment schema family a dedicated draft placeholder boundary
- seeds the first event-authorship rejection cases: verified-signature, host resident forgery and history rewrite
- extends draft coverage from keys and membership into event authorship
- makes forged-authorship and history-rewrite interpretations rejectable early

Negative:

- adds more draft fixtures before a runtime exists
- draft fixture fields may need migration when final schemas are selected
- implementers must remember that these fixtures prove no signature, no delegation and no append-only enforcement
