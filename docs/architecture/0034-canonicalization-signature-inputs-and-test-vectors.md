# 0034 - Canonicalization, Signature Inputs and Test Vectors

## Status

Accepted as a canonicalization and conformance-fixture concept.

## Context

ADR 0016 requires reviewed cryptographic building blocks and forbids Pico-specific cryptographic primitives.

ADR 0025 makes compatibility claims dependent on preserving protocol semantics and future conformance tests.

ADR 0029 defines key roles and lists future signed material such as device delegations, Home membership credentials, event segments, replica manifests, key rotation statements and audit records.

ADR 0031 defines the threat model for Pico Link identity, relay metadata and protected domains.

ADR 0032 defines conceptual schema families for packet envelopes, protected payload envelopes, signed event segments, replica manifests, key envelopes, Home membership credentials and compatibility advertisements. It intentionally does not define canonicalization rules.

ADR 0033 defines lifecycle, rotation, revocation, lost-device, reset and recovery boundaries for those key and credential roles.

The next boundary needed before signatures or compatibility claims can matter is deterministic input: what exactly is signed, hashed, compared, rejected, ignored or preserved.

## Decision

Pico will treat canonicalization as a protocol surface, not as an incidental JSON formatting detail.

Future signed or hashed protocol objects must define:

- the semantic object being protected
- the canonical form that becomes the signature or hash input
- the fields excluded from the protected input
- how unknown fields are handled
- how values are normalized or rejected
- how replay-sensitive fields are covered
- the fixture set required before compatibility claims

This ADR does not choose a final serialization format, cryptographic algorithm, key format, signature encoding, hash algorithm, JSON Schema dialect, binary encoding or conformance runner.

## Core rule

```text
Sign semantics, not display JSON.
Hash canonical bytes, not parser accidents.
Ignore only what is explicitly ignorable.
Reject ambiguity before it reaches cryptography.
Publish vectors before claiming compatibility.
```

## Terms

| Term | Meaning |
|---|---|
| Semantic object | The protocol meaning of an object after parsing and validation. |
| Canonical form | The deterministic byte sequence produced from a semantic object for hashing or signing. |
| Signature input | The canonical form plus any explicit domain-separation context that a signature covers. |
| Hash input | The canonical form plus any explicit domain-separation context that a digest covers. |
| Protected field | A field whose value is included in signature or hash input. |
| Unprotected field | A field that is intentionally excluded from signature or hash input. |
| Extension field | Optional namespaced field outside the core schema. |
| Negative vector | Fixture that must be rejected or must fail verification. |
| Round-trip vector | Fixture that must parse, canonicalize and re-emit or preserve semantics as specified. |

These are conceptual terms. They do not define final API names.

## Canonicalization scope

Canonicalization is required before security-relevant signatures, hashes or compatibility claims for:

- signed event segments
- replica manifests
- Home membership credentials
- device delegation statements
- key rotation statements
- revocation statements
- key envelopes where signatures or covered metadata are used
- compatibility advertisements once signed or conformance-bound
- audit records where tamper evidence matters
- protected-payload associated data when selected algorithms require it

Canonicalization is not required for:

- local dashboard display formatting
- current Foundation HTTP response formatting
- current `WS /ws` Foundation realtime formatting
- current opaque `PicoEvent.signature` metadata
- demo-only fixtures with no security or compatibility claim

## Signature input model

Future signature-bearing objects should separate:

- envelope fields that are signed
- envelope fields that are relay-visible but not signed
- payload fields that are encrypted and then signed or otherwise authenticated
- transport metadata that is never part of Pico identity proof
- local storage metadata that must not affect signatures

Each signature family should define a domain-separated input label, for example conceptually:

```text
pico.signed-event-segment.v1
pico.replica-manifest.v1
pico.home-membership-credential.v1
pico.device-delegation.v1
pico.key-rotation-statement.v1
pico.revocation-statement.v1
```

These labels are examples only. Final labels belong to the future protocol specification.

The label must prevent a signature over one object family from being replayed as another object family.

## Field coverage rules

Every future signed object family must classify fields as one of:

| Classification | Meaning |
|---|---|
| required_protected | Required and included in signature/hash input. |
| optional_protected | Optional, but included when present. |
| required_unprotected | Required for transport/storage, but intentionally outside the signature/hash input. |
| optional_unprotected | Optional and intentionally outside the signature/hash input. |
| ignored_extension | Optional extension that older peers may ignore safely. |
| rejected_extension | Extension or unknown field that must be rejected. |

Default rule:

```text
Unknown fields are rejected unless the schema version explicitly defines a safe extension point.
```

Safe extension points must state:

- namespace requirements
- whether extensions are protected or unprotected
- whether older peers may ignore them
- whether they are relay-visible
- whether they can affect authority, decryption, membership, deletion or lifecycle semantics

Extensions must not silently alter security meaning.

## Value normalization and rejection

Future canonicalization specs must decide normalization and rejection rules for at least:

- object field ordering
- duplicate field names
- missing required fields
- null versus absent fields
- integer range and precision
- decimal values, if any are allowed
- string encoding
- Unicode normalization policy
- timestamp format and timezone handling
- binary data encoding
- map and array ordering
- empty objects and empty arrays
- boolean representation
- extension namespace syntax

Until these rules exist, examples remain non-normative and must not be used as compatibility fixtures.

## JSON and binary boundary

Pico may eventually choose JSON canonicalization, CBOR-style deterministic encoding, another reviewed deterministic encoding or a layered model.

This ADR does not choose between them.

The choice must be evaluated against:

- availability of reviewed libraries in TypeScript and likely future client environments
- deterministic cross-language behaviour
- duplicate-key handling
- binary payload handling
- streaming or low-bandwidth transport needs
- human-debuggability during foundation work
- conformance fixture ergonomics
- compatibility with selected cryptographic libraries

If JSON is used for examples, display JSON remains documentation. It is not automatically the signature input.

## Hashing and identifier inputs

Future object identifiers such as segment IDs, manifest checkpoints, packet IDs, credential IDs or key-envelope IDs must state whether they are:

- random identifiers
- hash-derived identifiers
- issuer-assigned identifiers
- local storage identifiers
- transport-only identifiers

Hash-derived identifiers must define:

- input label
- canonical input
- digest format
- truncation policy, if any
- collision-handling policy
- whether protected or unprotected fields are included
- whether encryption ciphertext or plaintext-derived material is included

No current repository identifier has these semantics.

## Replay and downgrade coverage

Signature inputs for replay-sensitive objects should usually cover:

- schema name
- schema version
- object family label
- issuer or author
- subject or recipient where applicable
- audience where applicable
- scope
- validity bounds
- sequence or checkpoint
- previous segment or previous statement reference where applicable
- domain or Home identifier where applicable
- lifecycle state or lifecycle action where applicable
- algorithm-suite identifier once algorithms are selected

Downgrade-sensitive objects should include explicit version and capability context in the protected input.

Compatibility advertisements must not allow a peer to strip support, alter conformance status or downgrade behaviour without detection once signed claims exist.

## Signed event segment requirements

A future signed event segment fixture set should cover:

- minimal valid segment
- segment with optional protected metadata
- segment with ignored optional extension
- segment with rejected unknown field
- segment with duplicate field name
- segment with invalid timestamp
- segment with out-of-range sequence number
- segment whose previous-segment reference is changed
- segment whose event list order is changed
- segment whose display JSON formatting changes but canonical input stays stable
- segment whose protected payload reference is altered and must fail

Segment signatures must bind the author device and delegated scope. Host storage metadata must not let a host become the author.

## Replica manifest requirements

A future replica manifest fixture set should cover:

- empty or initial manifest where allowed
- manifest with one domain checkpoint
- manifest with multiple domain checkpoints in deterministic order
- manifest with missing range declaration
- manifest with stale checkpoint
- manifest whose domain order is changed
- manifest with private plaintext accidentally present and rejected
- manifest with unknown extension under an allowed namespace
- manifest with downgrade attempt against declared compatibility level

Manifest canonicalization must help detect host omission, replay and stale restore without leaking private content.

## Home membership credential requirements

A future Home membership credential fixture set should cover:

- valid Home Host Pico-issued membership
- expired credential
- not-yet-valid credential
- credential with changed subject
- credential with changed scope
- credential with changed Home identifier
- credential replayed across a different Home
- revoked credential reference
- reset or host-key-rotation continuity case
- unknown role or scope rejection

Membership signatures must bind host-use scope. They must not grant domain plaintext access unless a separate domain policy and key envelope grants it.

## Device delegation requirements

A future device delegation fixture set should cover:

- valid delegated device
- delegated device with limited scope
- delegated device with expiry
- revoked device
- lost-device marker
- scope escalation attempt
- delegation signed by a key without delegation authority
- stale backup trying to reintroduce a revoked device
- identity replacement or rotation continuity statement

Delegation verification must respect ADR 0033 lifecycle state, not just signature validity.

## Key envelope and domain membership requirements

A future key-envelope fixture set should cover:

- valid wrapped key metadata for an authorised recipient
- recipient mismatch
- domain mismatch
- issuer without domain authority
- reader removal followed by new key envelope set
- stale key envelope after rotation
- algorithm-suite mismatch once algorithms exist
- ciphertext or wrapped-key field altered
- host-visible metadata alteration

Key envelope verification must distinguish readable historical material from future reading authority.

## Compatibility advertisement requirements

A future compatibility advertisement fixture set should cover:

- implementation with no conformance claim
- implementation with experimental claim only
- implementation with signed conformance result once that exists
- unsupported capability falsely advertised
- unknown optional capability ignored safely
- required capability missing
- downgrade from stable to experimental claim
- license/commercial-permission statement kept separate from technical compatibility

Compatibility claims must remain experimental until published conformance tests exist.

## Test-vector families

Pico should eventually publish fixtures in families:

| Family | Purpose |
|---|---|
| canonicalization-positive | Different source encodings produce the same canonical input. |
| canonicalization-negative | Ambiguous or invalid inputs are rejected before signing. |
| signature-positive | A known object verifies under a known public test key. |
| signature-negative | Altered objects, keys, scopes or versions fail verification. |
| lifecycle-negative | Valid signatures fail because lifecycle state revokes authority. |
| compatibility-positive | Implementations parse and preserve supported protocol semantics. |
| compatibility-negative | Implementations reject unsupported, downgraded or unsafe claims. |
| privacy-negative | Relay-visible or manifest-visible fields must not include protected plaintext. |

Test vectors should include machine-readable fixture files and human-readable fixture notes.

## Fixture structure

A future fixture should state:

- fixture ID
- object family
- schema version
- source encoding
- expected parse result
- expected canonical bytes or digest
- expected verification result
- expected error category for negative vectors
- required capabilities
- lifecycle prerequisites
- privacy expectations
- relationship to ADR or protocol section

Fixtures should avoid real user content, real private keys, real recovery material and real deployment identifiers.

## Error categories

Negative vectors should use stable error categories before stable error strings.

Conceptual categories:

```text
parse_error
schema_error
canonicalization_error
unsupported_version
unknown_required_extension
duplicate_field
invalid_timestamp
integer_out_of_range
signature_mismatch
wrong_key
unauthorized_scope
revoked_authority
expired_credential
downgrade_detected
privacy_leak
```

These are conceptual categories, not final API error codes.

## Implementation staging

Recommended future staging:

1. Define canonicalization requirements in protocol prose.
2. Add non-cryptographic canonicalization fixtures.
3. Add parser rejection fixtures for ambiguous inputs.
4. Choose reviewed cryptographic primitives and key serialization.
5. Add test keys and signature vectors.
6. Add lifecycle-aware verification vectors.
7. Add conformance runner coverage for claimed surfaces.
8. Only then allow stronger compatibility or security claims.

The walking-skeleton tech demo may use fixture-like demo data before this staging is complete, but it must label it as demo-only and avoid security claims.

## Current implementation status

The repository currently does not implement:

- canonicalization
- signature input generation
- signature verification
- cryptographic test vectors
- lifecycle-aware verification
- conformance runner coverage for Pico Link or Pico Home Link

Current `PicoEvent.signature` remains unverified opaque metadata. Current Foundation HTTP responses and `WS /ws` messages remain trusted-local diagnostics and foundation plumbing, not Pico Link or Pico Home Link protocol surfaces.

## Non-goals

This ADR does not implement or choose:

- canonical JSON
- deterministic CBOR
- binary encoding
- cryptographic algorithms
- hash algorithms
- signature algorithms
- key serialization
- JSON Schema dialect
- conformance runner
- production keys
- recovery flows
- group messaging protocols
- stable compatibility levels

It also does not make current example JSON, current Foundation events or current `PicoEvent.signature` fields security-relevant.

## Consequences

Positive:

- prevents accidental signature semantics from display JSON
- gives conformance work a concrete fixture plan
- makes downgrade, extension and ambiguity handling explicit before implementation
- keeps lifecycle state part of verification, not an afterthought
- gives the walking-skeleton demo a clearer boundary for demo-only fixtures

Negative:

- adds another required design step before real signed Pico Link communication
- may force future schema examples to change once final encoding is selected
- requires cross-language fixture discipline before strong compatibility claims
- makes some quick demos less impressive because signatures remain stubbed

## Relationship to other ADRs

This ADR extends and constrains:

- `0016-cryptography-boundaries-and-non-goals.md`
- `0025-inter-pico-communication-compatibility.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0031-pico-link-identity-relay-and-domain-threat-model.md`
- `0032-pico-link-envelope-and-credential-schema-direction.md`
- `0033-key-lifecycle-rotation-revocation-and-recovery.md`

It does not replace those ADRs. It defines the deterministic-input and fixture boundary that future signatures, manifests, credentials, key envelopes, lifecycle checks and compatibility claims must respect.
