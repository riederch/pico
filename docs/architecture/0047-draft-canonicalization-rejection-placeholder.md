# 0047 - Draft Canonicalization Rejection Placeholder

## Status

Accepted as a draft-only canonicalization rejection placeholder before canonical bytes or crypto vectors.

## Context

ADR 0034 defines canonicalization, signature-input and test-vector boundaries. It intentionally does not choose canonical JSON, deterministic CBOR, binary encoding, hash algorithms or signature inputs.

ADR 0042 allows `canonicalization` draft fixtures to describe parse and rejection cases before canonical bytes are selected, but forbids authoritative signature or hash vectors.

ADR 0043, ADR 0044, ADR 0045 and ADR 0046 define draft-only placeholder shapes for packet envelopes, protected payloads, Home Membership Credentials and compatibility claims.

Those draft surfaces need a safe way to describe invalid inputs and parse-only expectations without accidentally publishing canonical bytes, hashes, signatures or compatibility vectors.

## Decision

Future draft canonicalization fixtures may use a rejection placeholder shape.

This placeholder shape is not a canonicalization algorithm. It exists only to express parse-only and reject expectations until a later ADR selects canonical bytes, signing inputs, hash inputs, fixture vector format and verifier behaviour.

## Draft canonicalization rejection placeholder shape

Draft fixtures may model a canonicalization placeholder with only these top-level fields:

```json
{
  "schema": "pico.canonicalization.case.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "caseId": "canon_placeholder_...",
  "targetSurface": "pico-link-packet",
  "input": {
    "format": "json-text",
    "rawRef": "input.json",
    "parsedObjectRef": null
  },
  "expectation": {
    "status": "reject",
    "reason": "unknown_top_level_field"
  },
  "canonicalOutput": {
    "status": "absent"
  },
  "cryptoVector": {
    "hash": "absent",
    "signature": "absent"
  },
  "extensions": {}
}
```

The example is deliberately non-normative. Field names and values may change before implementation.

## Field semantics

`schema` identifies the draft fixture family only.

`schemaVersion` is a draft fixture version, not a compatibility level.

`fixtureStage` must remain `draft`.

`caseId` is a synthetic placeholder identifier. It is not a hash, canonical identifier, signature input or compatibility vector ID.

`targetSurface` identifies the draft surface being checked. It does not certify that surface.

`input.format: "json-text"` permits future raw-input cases such as duplicate members that cannot be represented after normal JSON parsing.

`expectation.status` may be `reject` or `parse-only`. `parse-only` means an input can be structurally inspected without producing canonical bytes.

`canonicalOutput.status: "absent"` means no canonical bytes are published.

`cryptoVector.hash: "absent"` and `signature: "absent"` mean no cryptographic vector exists.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Allowed draft values

Draft canonicalization placeholders may use these `targetSurface` values:

```text
pico-link-packet
pico-link-protected-payload
pico-home-membership-credential
compatibility-claim
foundation-event
foundation-realtime
```

Draft canonicalization placeholders may use these `expectation.status` values:

```text
reject
parse-only
```

Draft canonicalization placeholders may use these `expectation.reason` values:

```text
unknown_top_level_field
duplicate_member
invalid_timestamp
unsafe_integer
invalid_string_encoding
null_vs_absent
unnamespaced_extension
unsupported_value
protected_plaintext_leak
authority_claim
canonical_output_claim
crypto_vector_claim
compatibility_claim
```

These values are draft vocabulary only. They are not final conformance error codes.

## Required rejection cases

Draft canonicalization fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- `canonicalOutput` values that include bytes, text, hashes, encodings or normalized objects
- `cryptoVector` values that include hashes, signatures, MACs, public keys, private keys or verification material
- expectation statuses that imply canonicalization success
- reason values that imply final conformance error codes
- target surfaces that imply L2, L3 or L4 compatibility
- raw inputs that include real user data, private context, private keys, recovery material, production credentials or domain keys
- extensions that alter canonicalization, signature, hash, compatibility, authority, decryption, membership, deletion, recovery or lifecycle semantics

## Parse-only boundary

`parse-only` cases may prove that a draft object is structurally inspectable.

They must not publish:

- canonical bytes
- normalized object output
- hash input
- signature input
- digest
- signature
- verifier result
- compatibility result

`parse-only` is useful for draft fixture staging, but it is not conformance.

## Raw input boundary

Some future rejection cases may require raw text input rather than parsed JSON, especially:

- duplicate member names
- malformed string encoding
- numeric precision edge cases
- timestamp spelling
- whitespace-sensitive examples before a canonical form is chosen

Draft placeholders may reference such input through `rawRef`, but the referenced file must remain synthetic and non-sensitive.

## Relationship to future canonicalization

Before canonicalization fixtures carry security or compatibility meaning, later ADRs must define:

- canonical representation
- semantic object boundary
- protected and unprotected fields
- duplicate member handling
- integer and timestamp normalization
- Unicode policy
- extension ordering
- canonical byte encoding
- hash inputs
- signature inputs
- replay coverage
- fixture vector format
- verifier behaviour

Until then, canonicalization fixtures may only prove rejection boundaries and absence of unsafe canonicalization claims.

## Non-goals

This ADR does not define:

- canonical JSON
- deterministic CBOR
- binary encoding
- semantic object normalization
- hash algorithms
- signature algorithms
- canonical bytes
- hash vectors
- signature vectors
- conformance runner
- production compatibility certification

## Consequences

Positive:

- gives future canonicalization draft fixtures a safe rejection-only shape
- prevents parse fixtures from becoming crypto vectors
- supports duplicate-field and raw-input planning without choosing canonical bytes
- keeps error vocabulary draft-only until a runner exists

Negative:

- draft canonicalization fixtures may require migration when final canonicalization is selected
- parse-only checks cannot prove interoperability
- implementers must avoid treating rejection placeholders as conformance results

## Relationship to other ADRs

This ADR refines:

- `0034-canonicalization-signature-inputs-and-test-vectors.md`
- `0042-pico-link-draft-schema-and-fixture-gate.md`
- `0043-pico-link-draft-packet-envelope-preflight.md`
- `0044-pico-link-draft-protected-payload-placeholder.md`
- `0045-pico-home-link-draft-membership-credential-placeholder.md`
- `0046-draft-compatibility-claim-placeholder.md`

It remains below future normative canonicalization, hash, signature, verifier, conformance-runner and compatibility specifications.
