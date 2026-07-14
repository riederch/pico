# 0064 - Pico Link Draft Replica Manifest Placeholder

## Status

Accepted as a draft-only Pico Link replica manifest placeholder boundary before manifest canonicalization, signatures, checkpoint verification, device delegation or omission/replay detection are implemented.

## Context

ADR 0014 defines deletability and append-only events: signed history must not be silently rewritten, and payload posture governs what a record may carry.

ADR 0029 separates Pico Identity Keys, Device Keys, Home Host Keys and Domain Content Keys, and keeps hosting ciphertext separate from decryption authority.

ADR 0031 requires that peers be able to detect a host omitting, replaying or stale-restoring state, and that relay and host see only metadata.

ADR 0032 defines a conceptual replica manifest schema family: a manifest lets peers compare state without trusting one host's event listing, summarizes known state per domain with head segment and checkpoint references, must not expose private plaintext, should help detect host omission, replay or stale restore, and needs canonicalization and device delegation rules before its signature is security-relevant.

ADR 0034 requires canonicalization and signature-input decisions before signatures, hashes or compatibility claims carry security meaning.

ADR 0042 stages draft Pico Link fixtures below runtime, cryptography, relay and compatibility claims.

ADR 0062 seeds the signed event segment schema family. The replica manifest is the last ADR 0032 schema family without draft fixtures. It references the segments a signed event segment describes and is the sync/audit surface peers use to detect a dishonest host.

The next useful step is a safe placeholder for replica manifests: a way to describe intended sync/audit state summaries without accidentally exposing plaintext, proving completeness or claiming a verified signature.

## Decision

Future draft Pico Link fixtures may use a Replica Manifest placeholder shape.

This placeholder is not a sync implementation. It does not verify signatures, checkpoints, canonicalization or device delegation, and it does not prove completeness, consistency or freshness.

A draft replica manifest summarizes intended known state for one replica: an owner, a set of domains with head segment and checkpoint references, and a creation time. Signature, checkpoint and completeness all remain unverified placeholders.

## Core rule

```text
A replica manifest summarizes known state for sync and audit.
It never exposes private plaintext, never proves completeness or consistency and never carries a verified signature.
```

## Draft replica manifest placeholder shape

Draft fixtures may model a replica manifest placeholder with these top-level fields:

```json
{
  "schema": "pico.replica.manifest.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "replicaRecordId": "replica_placeholder_...",
  "owner": {
    "picoIdHint": "pico_placeholder_...",
    "deviceIdHint": "device_placeholder_...",
    "proofStatus": "unverified-placeholder"
  },
  "domains": [
    {
      "domainIdHint": "domain_placeholder_...",
      "headSegmentIdHint": "segment_placeholder_...",
      "checkpointRef": "checkpoint_placeholder_...",
      "checkpointStatus": "absent",
      "payloadPosture": "metadata-only"
    }
  ],
  "coverage": {
    "completenessStatus": "unverified-placeholder",
    "omissionDetectionIntent": true,
    "staleRestoreDetectionIntent": true
  },
  "createdAt": "2026-07-13T12:00:00.000Z",
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

`replicaRecordId` is a synthetic placeholder identifier. It is not a signature input or verified replica handle.

`owner` names the placeholder owner Pico and device. `proofStatus` stays unverified: naming an owner does not prove the device is delegated.

`domains` summarizes known state per domain. `headSegmentIdHint` references a signed event segment placeholder, `checkpointRef` is a placeholder reference and `checkpointStatus` stays `absent`. Each domain keeps `payloadPosture` metadata-only and must not carry private plaintext.

`coverage` describes intent to help detect omission and stale restore. `completenessStatus` stays unverified: a draft manifest describes intent to detect problems, not a proof that state is complete or consistent.

`createdAt` is a placeholder timestamp, not a verified freshness proof.

`audit` records placeholder audit intent only and stays metadata-only.

`signatureStatus: "absent"` means no verifiable signature exists.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Draft rejection reasons

Draft replica manifest fixtures may use these rejection reasons:

```text
manifest_plaintext_leak
manifest_verified_completeness_claim
manifest_signature_verified_claim
```

These values are draft vocabulary only. They are not final conformance error codes.

## Required rejection cases

Draft replica manifest fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- manifests that expose private plaintext in any domain or field
- manifests that claim verified completeness, consistency or no-omission
- manifests that claim a verified signature or verified checkpoint
- real signatures, hashes, canonical bytes, MACs or attestations
- private identity keys, private device keys or Domain Content Keys
- payload postures that expose private plaintext
- fixtures that omit required draft disclaimers
- fixtures that claim compatibility above draft-only
- fixtures that imply production security or commercial permission

## A manifest is not plaintext exposure

A draft replica manifest summarizes state as metadata.

It must not:

- carry private plaintext in a domain entry
- expose message bodies or memory content
- present decoded content as a state summary
- leak plaintext in any field

Manifests stay metadata-only; content stays in protected payloads governed by ADR 0044 and ADR 0063.

## A manifest is not a completeness proof

A draft replica manifest describes intent to help detect omission, replay and stale restore.

It must not claim:

- verified completeness of a domain
- verified consistency across replicas
- a proof that a host omitted nothing
- a proof of freshness or currentness

Omission, replay and stale-restore detection need canonicalization, checkpoints and delegation rules before a manifest can prove anything.

## A manifest is not a verified signature

A draft replica manifest may reference checkpoints and an owner.

It must not claim:

- a verified manifest signature
- a verified checkpoint hash
- a verified canonical representation
- verified owner device delegation

Signature, checkpoint and delegation stay unverified placeholders until ADR 0034 canonical bytes and signature inputs exist.

## Relationship to signed event segments

ADR 0062 signed event segment placeholders describe event-authorship binding for a range. ADR 0064 replica manifest placeholders reference the head segments of those ranges to summarize known state:

- a manifest may name `headSegmentIdHint` per domain
- it does not verify the referenced segment
- it does not verify the segment's signature or author delegation
- it does not prove that the head is the true head

Segment and manifest verification remain future work.

## Relationship to future verification

Before replica manifests carry security meaning, later ADRs must define:

- canonical manifest bytes and signature inputs
- checkpoint hash construction
- owner device delegation verification
- head segment verification
- omission, replay and stale-restore detection rules
- multi-replica comparison and reconciliation
- audit persistence and visibility
- verifier behaviour for plaintext-leaking, completeness-claiming or signature-claiming manifests
- conformance fixture families for positive and negative manifest verification

Until then, replica manifest fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton demo may reference replica manifest placeholders only as visibly unverified fixture data.

The demo must not:

- verify a real signature or checkpoint
- prove completeness or consistency
- expose plaintext
- reconcile real replicas
- publish compatibility or security claims

If a demo needs real replica comparison, this ADR is insufficient and reviewed canonicalization, checkpoint, delegation and reconciliation designs must come first.

## Implementation status

This ADR is documentation and fixture-gate direction only.

The repository does not implement:

- replica manifests
- manifest canonicalization or signatures
- checkpoint hash construction
- head segment verification
- omission/replay/stale-restore detection
- multi-replica reconciliation
- a conformance runner for manifest verification

## Non-goals

This ADR does not define:

- final manifest schema
- cryptographic algorithms
- canonicalization output
- signature formats
- checkpoint hash construction
- delegation verification protocol
- reconciliation protocol
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

- `0062-pico-link-draft-signed-event-segment-placeholder.md`
- `0063-pico-link-draft-protected-payload-rejection-placeholder.md`

With ADR 0062 and this ADR, all seven ADR 0032 schema families - packet envelope, protected payload, signed event segment, replica manifest, key envelope, Home membership credential and compatibility advertisement - have at least one draft placeholder. It remains below future Pico Link cryptography, canonicalization, signature, delegation, reconciliation and conformance specifications.

## Consequences

Positive:

- gives the replica manifest schema family a dedicated draft placeholder boundary
- completes draft placeholder coverage across all seven ADR 0032 schema families
- makes plaintext-leak, completeness-proof and verified-signature interpretations rejectable early
- keeps the sync/audit surface metadata-only

Negative:

- adds more draft fixtures before a runtime exists
- draft fixture fields may need migration when final schemas are selected
- implementers must remember that these fixtures prove no signature, no checkpoint and no completeness
