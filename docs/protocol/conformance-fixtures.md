# Pico Conformance Fixture Layout

This document defines the planned layout for future Pico conformance fixtures and the current experimental Foundation event and realtime fixture seed.

It is a planning document for the foundation phase. It does not publish an executable conformance suite, certify compatibility, define final cryptographic vectors or make current Foundation APIs production-ready.

## Purpose

Pico compatibility needs repeatable evidence before implementations can make strong claims.

The fixture layout should let future implementations test:

- parsing and validation
- semantic preservation
- unknown extension handling
- downgrade rejection
- privacy leak rejection
- canonicalization once defined
- signature verification once keys and algorithms are selected
- lifecycle-aware rejection once key lifecycle state exists
- compatibility-claim honesty

The immediate goal is to define where and how such fixtures should be organized and to keep the first Foundation examples small enough to review.

## Relationship to architecture decisions

This document follows:

- `../architecture/0016-cryptography-boundaries-and-non-goals.md`
- `../architecture/0025-inter-pico-communication-compatibility.md`
- `../architecture/0029-identity-device-home-keys-and-e2e-boundaries.md`
- `../architecture/0031-pico-link-identity-relay-and-domain-threat-model.md`
- `../architecture/0032-pico-link-envelope-and-credential-schema-direction.md`
- `../architecture/0033-key-lifecycle-rotation-revocation-and-recovery.md`
- `../architecture/0034-canonicalization-signature-inputs-and-test-vectors.md`
- `../architecture/0042-pico-link-draft-schema-and-fixture-gate.md`
- `../architecture/0043-pico-link-draft-packet-envelope-preflight.md`
- `../architecture/0044-pico-link-draft-protected-payload-placeholder.md`

ADR 0034 defines the canonicalization and test-vector boundary. ADR 0042 defines the staging gate for draft-only Pico Link and Pico Home Link schema fixtures before real implementation or compatibility claims. ADR 0043 defines the first constrained draft packet-envelope preflight shape. ADR 0044 defines the first constrained protected-payload placeholder boundary. This document turns those boundaries into a planned repository layout.

## Current boundary

The current repository contains a small experimental Foundation event and realtime fixture seed under `docs/protocol/fixtures/`.

The current repository does not contain a Pico Link or Pico Home Link conformance runner.

The current repository does not contain:

- signed fixture vectors
- cryptographic test keys
- canonical byte fixtures
- lifecycle-aware verification fixtures
- Pico Link packet fixtures
- Pico Home Link membership fixtures
- L4 compatibility certification

Current Foundation HTTP and WebSocket behaviour remains experimental foundation plumbing. The seed fixtures do not change that.

## Design rules

Future fixtures should follow these rules:

- Fixture data is a protocol contract, not a product feature.
- Positive and negative fixtures are both first-class.
- A fixture must state the surface, version, family and expected result.
- A fixture must be synthetic and must not contain real user data.
- A fixture must not contain real private keys, recovery secrets or production credentials.
- A fixture must separate technical compatibility from commercial permission.
- A fixture must not imply production security before the relevant key, canonicalization, lifecycle and verification designs exist.
- A runner must report stable categories before stable human-readable text.

## Planned directory layout

Future fixture files should live under:

```text
docs/protocol/fixtures/
```

Planned structure:

```text
docs/protocol/fixtures/
  README.md
  suite.json
  foundation-events/
    v0.1.7/
      parse-positive/
      parse-negative/
      roundtrip/
  foundation-realtime/
    v0.1.7/
      parse-positive/
      parse-negative/
  canonicalization/
    draft/
      positive/
      negative/
  pico-link/
    draft/
      packet-envelope/
      protected-payload/
      privacy-negative/
  pico-home-link/
    draft/
      membership/
      claim/
      residency/
      eviction/
  compatibility-claims/
    draft/
      positive/
      negative/
```

This layout is implemented only for the current Foundation event and realtime seed. Other directories remain conceptual until fixture files are added.

## Fixture stages

Each fixture or suite should declare a stage:

| Stage | Meaning |
|---|---|
| draft_doc_only | The fixture is described in prose only. |
| fixture_data | Machine-readable fixture data exists but no official runner is required. |
| runner_experimental | An experimental runner can evaluate the fixture. |
| conformance_candidate | The fixture may be part of a future conformance suite. |
| published_conformance | The fixture is part of a published suite for compatibility claims. |

Current Foundation seed fixtures are at `fixture_data`. There is still no official runner.

## Fixture families

Future fixtures should use stable family names:

| Family | Purpose |
|---|---|
| parse-positive | Input must parse and validate. |
| parse-negative | Input must be rejected before semantic use. |
| roundtrip | Input must preserve documented semantics after parse and emit. |
| compatibility-positive | Behaviour preserves the advertised protocol semantics. |
| compatibility-negative | Behaviour must reject or refuse an unsafe compatibility claim. |
| canonicalization-positive | Different accepted source encodings produce the same canonical input. |
| canonicalization-negative | Ambiguous or invalid input is rejected before canonicalization. |
| privacy-negative | Relay-visible or host-visible data must not contain protected plaintext. |
| downgrade-negative | Version or capability downgrade attempts must fail. |
| lifecycle-negative | Valid syntax or signatures still fail because authority is revoked, expired or out of scope. |
| signature-positive | Future known-good signature vector. |
| signature-negative | Future altered-object, wrong-key or wrong-scope signature failure. |

Signature families remain future-only until algorithms, keys, key serialization and verification semantics are defined.

## Surface names

Future fixtures should use these surface names unless a later protocol spec replaces them:

```text
foundation-events
foundation-realtime
pico-link
pico-home-link
canonicalization
compatibility-claims
privacy
lifecycle
```

Foundation surfaces describe current experimental APIs. They do not imply Pico Link or Pico Home Link compatibility.

## Fixture identifier shape

Fixture IDs should be stable, lowercase and descriptive.

Conceptual shape:

```text
<surface>.<protocol-version>.<family>.<case>
```

Example:

```text
foundation-events.v0_1_7.parse-positive.message-created-minimal
```

This is an identifier convention, not a final API.

## Fixture manifest shape

A future fixture manifest should include at least:

```json
{
  "schema": "pico.conformance.fixture",
  "schemaVersion": 1,
  "fixtureId": "foundation-events.v0_1_7.parse-positive.message-created-minimal",
  "stage": "fixture_data",
  "surface": "foundation-events",
  "protocolVersion": "0.1.7",
  "family": "parse-positive",
  "case": "message.created minimal valid event",
  "source": {
    "encoding": "json",
    "file": "input.json"
  },
  "expect": {
    "parse": "accept",
    "preserveSemantics": true,
    "errors": []
  },
  "capabilitiesRequired": [
    "pico.core.events.v1"
  ],
  "notes": "Example shape only; not a published fixture."
}
```

This example is non-normative.

## Expected result model

Runners should eventually report machine-readable results:

```text
pass
fail
skip
unsupported
not_applicable
runner_error
```

`skip` should mean the fixture does not apply to the implementation's claimed surface or capability.

`unsupported` should mean the implementation lacks a capability required by the fixture.

`fail` should mean the implementation claimed applicability but did not meet the fixture expectation.

## Error categories

Negative fixtures should prefer stable categories over stable text.

Conceptual categories:

```text
parse_error
schema_error
unknown_required_extension
duplicate_field
invalid_timestamp
integer_out_of_range
unsupported_version
downgrade_detected
privacy_leak
signature_mismatch
wrong_key
unauthorized_scope
revoked_authority
expired_credential
runner_error
```

These categories align with ADR 0034 but are not final API error codes.

## Suite manifest

A future `suite.json` should describe:

- suite ID
- suite version
- protocol version or version range
- fixture schema version
- included surfaces
- included fixture families
- required runner features
- expected result reporting format
- license and commercial-permission disclaimer
- relationship to compatibility levels

The suite manifest must not turn commercial permission into a technical compatibility field.

## Foundation fixture scope

Foundation fixtures may be useful before Pico Link exists.

They may cover:

- implemented Foundation event types
- implemented Foundation payload value sets
- current Foundation realtime message types
- current status capability names
- reserved event type write rejection
- opaque cursor handling
- opaque `PicoEvent.signature` treatment

Foundation fixtures must state that they are experimental and do not imply L2 Pico Link or L3 Pico Home Link compatibility.

## Pico Link and Pico Home Link fixture scope

Pico Link and Pico Home Link fixtures remain draft-only until protocol schemas exist. ADR 0042 allows future draft-only, non-normative machine-readable fixtures for packet-envelope shape, relay-visible privacy checks and placeholder protected-payload structure, but those fixtures must remain separate from the current Foundation seed suite and must not imply runtime support, cryptographic verification, relay interoperability, Home membership authority or L4 compatibility. ADR 0043 narrows the first allowed packet-envelope preflight shape for such future draft fixtures. ADR 0044 narrows the first allowed protected-payload placeholder shape.

Future Pico Link fixtures may cover:

- packet envelope routing metadata
- relay-visible metadata boundaries
- opaque protected payload handling
- duplicate packet handling
- downgrade and extension behaviour
- privacy-negative plaintext checks

Future Pico Home Link fixtures may cover:

- Empty Pico Home state
- Move-In Code claim semantics
- Home Host Pico membership
- Home Member Pico membership
- residency
- eviction
- sync and manifest expectations
- host reset and continuity semantics

No current implementation may claim these surfaces as conformance-tested.

## Canonicalization and signature fixture scope

Canonicalization fixtures must wait for a selected canonicalization spec.

Signature fixtures must wait for:

- reviewed cryptographic primitive choices
- key serialization formats
- test keys that cannot be used as production keys
- signature input definitions
- lifecycle-aware verification semantics

Until then, fixture documents may describe cases but must not provide authoritative verification vectors.

## Privacy fixtures

Privacy-negative fixtures should assert that relay-visible or host-visible fields do not include:

- private plaintext payloads
- unwrapped Domain Content Keys
- private key material
- recovery secrets
- unnecessary location or presence data
- resident private-domain content

These fixtures should become part of Pico Link and Pico Home Link conformance before any remote communication claim.

## Walking-skeleton demo boundary

A walking-skeleton tech demo may use demo fixtures before a conformance suite exists.

Demo fixtures must be labelled:

```text
demo_only
```

Demo fixtures must not be reused as compatibility certification unless they are promoted through the fixture stages and reviewed against the relevant ADRs.

## Versioning

Fixture versioning should keep separate:

- repository package version
- protocol version
- fixture schema version
- suite version
- fixture case version where needed

Changing expected semantics for an existing fixture should create a new fixture version or a new fixture ID.

## Current implementation status

The current repository has this planning document and a small Foundation event and realtime fixture seed.

It includes:

- `docs/protocol/fixtures/README.md`
- `docs/protocol/fixtures/suite.json`
- five positive Foundation event append fixtures for strict writable payload schemas
- eleven negative Foundation event append fixtures for a reserved event type, invalid payload values and unexpected fields
- six positive current Foundation WebSocket message fixtures
- five negative Foundation WebSocket message fixtures for missing required fields, non-Foundation event envelopes, invalid event payloads and a Pico Link-like non-message
- protocol tests that validate seed fixture metadata, source files, capability names and current Foundation event/realtime semantics

It does not include:

- test keys
- canonical byte outputs
- signature vectors
- a conformance runner
- L4 compatibility certification

## Non-goals

This document does not implement or define:

- final protocol schemas
- final canonicalization
- cryptographic algorithms
- signature formats
- key serialization
- production keys
- a runner CLI
- CI conformance gates
- official certification
- commercial permission

## Next steps

Before expanding machine-readable fixtures:

1. Keep the first fixture scope limited to current Foundation event and realtime compatibility.
2. Add only tiny positive and negative fixture sets.
3. Add or update tests that validate fixture metadata shape.
4. Decide when a runner is worth the maintenance cost.
5. Keep all claims experimental until a runner and conformance policy exist.

## Design rule

Fixtures are evidence for a compatibility claim. They are not the claim itself.
