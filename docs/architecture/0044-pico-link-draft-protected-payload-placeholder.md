# 0044 - Pico Link Draft Protected Payload Placeholder

## Status

Accepted as a draft-only protected-payload placeholder boundary before Pico Link cryptography.

## Context

ADR 0029 separates Pico identity, device, Home, transport and protected-domain key roles.

ADR 0031 defines the Pico Link threat model and requires relays to see only routing metadata and opaque payloads.

ADR 0032 defines the conceptual protected-payload envelope family, but intentionally does not choose algorithms, key envelopes, signatures or canonical bytes.

ADR 0033 defines lifecycle, rotation, revocation and recovery requirements for future key and credential roles.

ADR 0034 defines canonicalization and test-vector boundaries before hashes or signatures become security-relevant.

ADR 0042 allows draft-only Pico Link fixture work under a strict staging gate.

ADR 0043 defines the draft packet-envelope preflight shape and keeps the payload layer opaque from relay-visible metadata.

The next safe draft step is to define what a protected-payload placeholder may look like without pretending to encrypt, sign, verify or authorise anything.

## Decision

Future draft protected-payload fixtures may use a placeholder shape below the packet envelope.

This placeholder shape is not a cryptographic envelope. It exists only to keep draft fixtures consistent until reviewed encryption, key wrapping, signature inputs, canonicalization and verification semantics exist.

## Draft protected-payload placeholder shape

Draft fixtures may model a protected-payload placeholder with only these top-level fields:

```json
{
  "schema": "pico.payload.protected.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "protection": {
    "mode": "placeholder",
    "algorithmSuite": "placeholder-only",
    "keyEnvelopeRefs": []
  },
  "claimedSender": {
    "picoIdHint": "pico_placeholder_...",
    "deviceIdHint": "device_placeholder_...",
    "proofStatus": "unverified-placeholder"
  },
  "claimedAudience": {
    "domainRef": "domain_placeholder_...",
    "readerSet": "placeholder"
  },
  "body": {
    "kind": "opaque-placeholder",
    "placeholder": true,
    "protectedContentRef": "content_placeholder_..."
  },
  "extensions": {}
}
```

The example is deliberately non-normative. Field names and values may change before implementation.

## Field semantics

`schema` identifies the draft fixture family only.

`schemaVersion` is a draft fixture version, not a Pico Link compatibility level.

`fixtureStage` must remain `draft`.

`protection.mode: "placeholder"` means no production encryption is claimed.

`protection.algorithmSuite: "placeholder-only"` is a label, not an algorithm choice.

`protection.keyEnvelopeRefs` may be empty or point only to placeholder references. It must not contain real wrapped keys, private keys, recovery material or production credentials.

`claimedSender` is an unverified placeholder. It does not prove Pico identity, device delegation, authorship, integrity or replay protection.

`claimedAudience` is a placeholder reader/domain hint. It does not grant domain access, Home membership, decryption authority or policy authority.

`body` is opaque placeholder content. It is not plaintext, ciphertext, canonical bytes, a hash input or a signed object.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Required rejection cases

Draft protected-payload fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- `protection.mode` values that claim real encryption
- real algorithm-suite names
- non-placeholder `keyEnvelope`, `keyEnvelopeRefs`, `recipientKeys` or wrapped-key material
- any private key, seed phrase, recovery secret or production credential
- `signature`, `hash`, `canonicalBytes`, `mac`, `proof` or `attestation` fields presented as verifiable
- plaintext message, memory, action input, tool output, health detail, location detail or user private context in `body`
- sender fields that claim verified identity or delegated authority
- audience fields that claim Home membership, domain membership, decryption authority or policy authority
- extension values that alter identity, authority, decryption, membership, deletion, recovery or lifecycle semantics

## Placeholder identifiers

Placeholder identifiers must be synthetic and visibly non-production.

They may use prefixes such as:

```text
pico_placeholder_
device_placeholder_
domain_placeholder_
content_placeholder_
payload_placeholder_
keyenv_placeholder_
```

They must not be derived from real keys, public keys, private keys, user identifiers, contact identifiers, account identifiers, relationship names, message content or hashes of private material.

## Relationship to packet envelopes

ADR 0043 packet envelopes may reference this placeholder layer through an opaque payload reference.

Packet-envelope fixtures must still treat the protected payload as opaque. A fixture that inspects this protected-payload placeholder is testing the protected-payload draft surface, not relay-visible packet routing.

## Relationship to future cryptography

Future cryptographic work must replace or migrate this placeholder shape before any production claim.

Before protected payloads carry security meaning, later ADRs must define:

- reviewed encryption mode
- algorithm-suite selection
- key envelope format
- sender identity proof
- device delegation binding
- audience and domain binding
- canonicalization
- signature or MAC inputs, if used
- replay protection
- revocation and rotation handling
- test vectors
- verifier behaviour

Until then, protected-payload fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton tech demo may use this placeholder only if:

- fixture or demo metadata says `draft-only`
- payload content is synthetic and opaque
- no production encryption claim is made
- no sender identity, device delegation or audience authority is verified
- no Home membership or domain access is granted
- no compatibility level above draft is advertised
- no user data is used

## Non-goals

This ADR does not define:

- encryption algorithms
- key derivation
- key wrapping
- signature algorithms
- MAC algorithms
- canonicalization
- ciphertext format
- key envelope format
- Home membership verification
- domain membership verification
- runtime parser
- conformance runner
- production compatibility certification

## Consequences

Positive:

- gives future draft fixtures a safe protected-payload placeholder
- prevents placeholder data from being mistaken for encryption or signatures
- keeps sender and audience semantics below verification until key and canonicalization work exists
- supports demo planning without user data or crypto claims

Negative:

- draft protected-payload fixtures may require migration when real cryptography is selected
- the placeholder shape cannot exercise real interoperability
- implementers must keep placeholder checks separate from production security behaviour

## Relationship to other ADRs

This ADR refines:

- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`
- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0033-key-lifecycle-rotation-revocation-and-recovery.md`
- `0034-canonicalization-signature-inputs-and-test-vectors.md`
- `0042-pico-link-draft-schema-and-fixture-gate.md`
- `0043-pico-link-draft-packet-envelope-preflight.md`

It remains below future normative Pico Link cryptography, canonicalization, key-envelope, device-delegation, domain-membership, relay and conformance specifications.
