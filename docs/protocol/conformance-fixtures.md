# Pico Conformance Fixture Layout

This document defines the planned layout for future Pico conformance fixtures, the current experimental Foundation event and realtime fixture seed, and the current draft-only protocol fixture seeds.

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
- `../architecture/0045-pico-home-link-draft-membership-credential-placeholder.md`
- `../architecture/0046-draft-compatibility-claim-placeholder.md`
- `../architecture/0047-draft-canonicalization-rejection-placeholder.md`
- `../architecture/0048-model-capability-delegation-and-remote-inference-boundary.md`
- `../architecture/0049-model-provider-registry-and-job-envelope.md`
- `../architecture/0050-model-delegation-draft-fixture-gate.md`
- `../architecture/0058-model-delegation-draft-job-envelope-scoping-placeholder.md`
- `../architecture/0059-model-delegation-draft-result-envelope-provenance-placeholder.md`
- `../architecture/0060-model-delegation-draft-context-reference-scoping-placeholder.md`
- `../architecture/0061-model-delegation-draft-provider-registry-advertisement-placeholder.md`
- `../architecture/0051-pico-link-draft-device-credential-placeholder.md`
- `../architecture/0052-pico-link-draft-lost-device-revocation-placeholder.md`
- `../architecture/0053-pico-link-draft-revocation-registry-placeholder.md`
- `../architecture/0054-pico-link-draft-key-envelope-rotation-placeholder.md`
- `../architecture/0055-pico-link-draft-identity-key-placeholder.md`
- `../architecture/0056-pico-home-link-draft-home-host-key-placeholder.md`
- `../architecture/0057-pico-home-link-draft-residency-eviction-placeholder.md`
- `../architecture/0062-pico-link-draft-signed-event-segment-placeholder.md`
- `../architecture/0063-pico-link-draft-protected-payload-rejection-placeholder.md`
- `../architecture/0064-pico-link-draft-replica-manifest-placeholder.md`

ADR 0034 defines the canonicalization and test-vector boundary. ADR 0042 defines the staging gate for draft-only Pico Link and Pico Home Link schema fixtures before real implementation or compatibility claims. ADR 0043 defines the first constrained draft packet-envelope preflight shape. ADR 0044 defines the first constrained protected-payload placeholder boundary. ADR 0045 defines the first constrained Home Membership Credential placeholder boundary. ADR 0046 defines the first constrained compatibility-claim placeholder boundary. ADR 0047 defines the first constrained canonicalization rejection placeholder boundary. ADR 0048 and ADR 0049 define delegated model capability and model job envelope boundaries. ADR 0050 defines the model-delegation draft fixture gate. ADR 0051 defines the first constrained Pico Link Device Credential placeholder boundary. ADR 0052 defines the first constrained Pico Link lost-device revocation placeholder boundary. ADR 0053 defines the first constrained Pico Link revocation registry placeholder boundary. ADR 0054 defines the first constrained Pico Link key-envelope rotation placeholder boundary. ADR 0055 defines the first constrained Pico Link identity-key placeholder boundary. ADR 0056 defines the first constrained Pico Home Link Home Host Key placeholder boundary. ADR 0057 defines the first constrained Pico Home Link residency and eviction placeholder boundary. ADR 0058 defines the first constrained Model Delegation job-envelope scoping placeholder boundary. ADR 0059 defines the first constrained Model Delegation result-envelope provenance placeholder boundary. ADR 0060 defines the first constrained Model Delegation context-reference scoping placeholder boundary. ADR 0061 defines the first constrained Model Delegation provider-registry advertisement placeholder boundary. ADR 0062 defines the first constrained Pico Link signed event segment placeholder boundary. ADR 0063 deepens the Pico Link protected-payload placeholder with its first rejection boundaries. ADR 0064 defines the first constrained Pico Link replica manifest placeholder boundary. This document turns those boundaries into a planned repository layout.

## Current boundary

The current repository contains a small experimental Foundation event and realtime fixture seed under `docs/protocol/fixtures/`.

It also contains separate draft-only Pico Link and Model Delegation fixture seeds. Those draft suites are fixture data only and are not runtime validation, security evidence or compatibility certification.

The current repository does not contain a Pico Link, Pico Home Link or Model Delegation conformance runner.

The current repository does not contain:

- signed fixture vectors
- cryptographic test keys
- canonical byte fixtures
- lifecycle-aware verification fixtures
- published Pico Link conformance packet fixtures
- published Pico Home Link conformance membership fixtures
- production model-delegation conformance fixtures
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
      home-host-key/
      identity-key/
      device-credential/
      home-residency/
      lost-device/
      revocation-record/
      key-envelope-rotation/
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
  model-delegation/
    draft/
      provider-registry/
      job-envelope/
      result-envelope/
      privacy-negative/
```

This layout is implemented for the current Foundation event and realtime seed, the current draft Pico Link seed and the current draft Model Delegation seed. Other directories remain conceptual until fixture files are added.

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
model-delegation
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

Pico Link and Pico Home Link fixtures remain draft-only until protocol schemas exist. ADR 0042 allows draft-only, non-normative machine-readable fixtures for packet-envelope shape, relay-visible privacy checks and placeholder protected-payload structure, but those fixtures must remain separate from the current Foundation seed suite and must not imply runtime support, cryptographic verification, relay interoperability, Home membership authority or L4 compatibility. ADR 0043 narrows the first allowed packet-envelope preflight shape for such draft fixtures. ADR 0044 narrows the first allowed protected-payload placeholder shape. ADR 0045 narrows the first allowed Home Membership Credential placeholder shape. ADR 0046 narrows the first allowed compatibility-claim placeholder shape. ADR 0047 narrows the first allowed canonicalization rejection placeholder shape. ADR 0051 narrows the first allowed Device Credential placeholder shape. ADR 0052 narrows the first allowed lost-device revocation placeholder shape. ADR 0053 narrows the first allowed revocation registry record placeholder shape. ADR 0054 narrows the first allowed key-envelope rotation placeholder shape. ADR 0055 narrows the first allowed identity-key placeholder shape. ADR 0056 narrows the first allowed Home Host Key placeholder shape. ADR 0057 narrows the first allowed residency and eviction placeholder shape. ADR 0062 narrows the first allowed signed event segment placeholder shape. ADR 0063 adds the first protected-payload rejection boundaries, deepening the ADR 0044 placeholder with plaintext-leak, real-crypto claim, embedded-key-material and verified-sender-authority rejections. ADR 0064 narrows the first allowed replica manifest placeholder shape and, with ADR 0062, gives all seven ADR 0032 schema families a draft placeholder.

The current draft Pico Link suite lives separately from the Foundation seed:

```text
docs/protocol/fixtures/pico-link/draft/suite.json
```

It currently contains one positive and one negative packet-envelope preflight fixture, one positive and four negative protected-payload placeholder fixtures, one positive and three negative Home Host Key placeholder fixtures, one positive and one negative Home Membership Credential placeholder fixture, one positive and three negative Home Residency placeholder fixtures, one positive and three negative Identity Key placeholder fixtures, one positive and two negative Device Credential placeholder fixtures, one positive and three negative lost-device revocation placeholder fixtures, one positive and three negative revocation-record placeholder fixtures, one positive and three negative key-envelope rotation placeholder fixtures, one positive and three negative signed-event-segment placeholder fixtures, one positive and three negative replica-manifest placeholder fixtures, one negative canonicalization placeholder fixture and one negative compatibility-claim fixture. These are fixture data only, not a runner, not runtime validation and not a compatibility basis.

Future Pico Link fixtures may cover:

- packet envelope routing metadata
- relay-visible metadata boundaries
- opaque protected payload handling
- draft protected-payload rejection scope
- protected-body plaintext-leak rejection
- protected-payload real-crypto claim rejection
- protected-payload embedded-key-material rejection
- protected-payload verified-sender-authority rejection
- draft Home Host Key placeholder scope
- resident-signing-by-host-key rejection
- resident-domain-decryption-by-host-key rejection
- move-in-code-as-host-key rejection
- draft Home Residency placeholder scope
- eviction-as-identity-destruction rejection
- host-cleanup-as-global-deletion rejection
- eviction-grants-domain-key-access rejection
- draft identity-key placeholder scope
- private-key-material-in-key-record rejection
- verified-root-authority-by-key-record rejection
- relay-routing-identity-as-pico-identity rejection
- draft Device Credential placeholder scope
- bearer-token-as-device-credential rejection
- device-credential domain-access claim rejection
- draft lost-device revocation placeholder scope
- stale-backup reactivation rejection
- identity-replacement-by-lost-device rejection
- domain-rotation-proof-by-lost-device rejection
- draft revocation-record placeholder scope
- stale-registry-currentness rejection
- registry-as-authority rejection
- domain-key-material-in-revocation-record rejection
- draft key-envelope rotation placeholder scope
- plaintext-domain-key-in-rotation rejection
- rotation-completion-without-records rejection
- historical-erasure-by-rotation rejection
- draft signed-event-segment placeholder scope
- verified-segment-signature rejection
- host-resident-authorship-forgery rejection
- history-rewrite-by-segment rejection
- draft replica-manifest placeholder scope
- manifest plaintext-leak rejection
- manifest verified-completeness rejection
- manifest verified-signature rejection
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

## Model Delegation fixture scope

Model Delegation fixtures remain draft-only until model provider registry, job envelope, policy, consent, privacy-domain and audit semantics exist. ADR 0050 allows draft-only, non-normative machine-readable fixtures for provider registry entries, job envelopes, context references and result envelopes, but those fixtures must remain separate from the Foundation seed and Pico Link draft suite. They must not imply runtime execution, model quality, provider authentication, provider trust, privacy enforcement, retention enforcement, tool execution or compatibility.

The current draft Model Delegation suite lives separately from the Foundation and Pico Link seeds:

```text
docs/protocol/fixtures/model-delegation/draft/suite.json
```

It currently contains one positive provider-registry placeholder fixture, four negative provider-registry authority fixtures (Vault read, trust by discovery, revoked-provider usability and tool execution by advertisement), one positive job-envelope scoping fixture, three negative job-envelope fixtures (forbidden input class, durable access claim and unsafe provider retention plus missing policy/consent), one positive context-reference scoping fixture, three negative context-reference fixtures (provider expansion, live provider read-through and unscoped plus secret material), one positive result-envelope provenance fixture and three negative result-envelope fixtures (action execution, model correctness and job/provider provenance mismatch). These are fixture data only, not a runner, not a model runtime, not provider trust proof and not a compatibility basis.

ADR 0058 narrows the job-envelope surface: a draft job envelope authorizes exactly one scoped, policy- and consent-bound job and is never durable access, never a policy or consent substitute and never a provider retention license.

ADR 0059 narrows the result-envelope surface: a draft result envelope reports a provider's output for exactly the requested job and provider and is never execution proof, never action approval and never a model-correctness certificate.

ADR 0060 narrows the context-reference surface: a draft context reference is a bounded, redacted, expiring, materialized single-job packet and is never a provider read capability, never durable, never unscoped and never a secret carrier.

ADR 0061 narrows the provider-registry surface: a draft provider registry entry advertises a possible model capability and is never a trust grant, never Vault access, never usable after revocation and never default tool execution. This rounds out draft placeholder coverage for all four Model Delegation surfaces.

Future Model Delegation fixtures may cover:

- provider registry entry shape
- provider trust-state rejection boundaries
- supported job type and input class checks
- retention-mode checks
- tool-use-mode checks
- model job envelope shape
- context reference scoping
- forbidden input class rejection
- consent and policy reference presence
- result envelope shape
- provenance mismatch rejection
- action-execution claim rejection

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

The current repository has this planning document, a small Foundation event and realtime fixture seed, a small draft Pico Link seed and a small draft Model Delegation seed.

It includes:

- `docs/protocol/fixtures/README.md`
- `docs/protocol/fixtures/suite.json`
- five positive Foundation event append fixtures for strict writable payload schemas
- eleven negative Foundation event append fixtures for a reserved event type, invalid payload values and unexpected fields
- six positive current Foundation WebSocket message fixtures
- five negative Foundation WebSocket message fixtures for missing required fields, non-Foundation event envelopes, invalid event payloads and a Pico Link-like non-message
- forty-six draft Pico Link fixtures in a separate draft suite
- twenty draft Model Delegation fixtures in a separate draft suite
- protocol tests that validate seed fixture metadata, source files, capability names, current Foundation event/realtime semantics and draft-suite non-claim boundaries

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

1. Keep each fixture strand in its own suite.
2. Add only tiny positive and negative fixture sets.
3. Add or update tests that validate fixture metadata shape and non-claim boundaries.
4. Decide when a runner is worth the maintenance cost.
5. Keep all claims experimental or draft-only until a runner and conformance policy exist.

## Design rule

Fixtures are evidence for a compatibility claim. They are not the claim itself.
