# 0050 - Model Delegation Draft Fixture Gate

## Status

Accepted as a draft-only fixture gate before model-provider registry, model job envelope or result envelope fixture data.

## Context

ADR 0048 defines delegated model capability and the remote inference authority boundary.

ADR 0049 defines planning vocabulary for model provider registry entries, model job envelopes, context references, policy/consent references and result envelopes.

The next useful step is to allow future machine-readable examples without accidentally making runtime, privacy, model-quality, tool-execution or compatibility claims.

This ADR defines the fixture staging gate for that future work.

## Decision

Pico may add draft-only model-delegation fixture data later, but only under a separate draft suite and only for structural and rejection-boundary checks.

Draft model-delegation fixtures may describe:

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

Draft model-delegation fixtures must not claim:

- model quality
- model safety
- model correctness
- prompt-injection resistance
- provider authentication
- Home membership verification
- privacy-domain grant enforcement
- retention enforcement
- runtime job execution
- tool execution
- remote inference interoperability
- production security
- L4 compatibility
- commercial permission

## Core rule

```text
Draft model-delegation fixtures may prove shape and unsafe-claim rejection.
They must not prove model behaviour, provider trust, privacy enforcement or compatibility.
```

## Separate suite

Draft model-delegation fixtures must not be added to the current Foundation fixture suite:

```text
docs/protocol/fixtures/suite.json
```

They must also stay separate from the current Pico Link draft suite:

```text
docs/protocol/fixtures/pico-link/draft/suite.json
```

If machine-readable fixture data is added later, it should use a separate suite manifest, conceptually:

```text
docs/protocol/fixtures/model-delegation/draft/suite.json
```

This prevents a Foundation or Pico Link fixture set from becoming an implied model-delegation compatibility suite.

## Allowed draft fixture surfaces

Future draft model-delegation fixtures may use these surfaces:

```text
model-provider-registry
model-job-envelope
model-result-envelope
model-context-ref
model-delegation-policy
model-delegation-privacy
```

These surfaces are draft vocabulary only. They are not public protocol surfaces yet.

## Allowed fixture families

Future draft model-delegation fixtures may use these families:

```text
parse-positive
parse-negative
policy-negative
privacy-negative
authority-negative
retention-negative
tool-negative
provenance-negative
```

`parse-positive` may prove only that a synthetic placeholder shape is structurally inspectable.

Negative families may prove only that unsafe draft inputs are rejected by a future placeholder checker.

## Draft fixture placeholder shape

Future draft fixture metadata may use a placeholder shape like:

```json
{
  "schema": "pico.model-delegation.fixture.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "fixtureId": "model-delegation.draft.model-job-envelope.parse-negative.forbidden-input-class",
  "surface": "model-job-envelope",
  "family": "parse-negative",
  "case": "job envelope rejects forbidden input class",
  "source": {
    "encoding": "json",
    "file": "input.json"
  },
  "expect": {
    "status": "reject",
    "reason": "forbidden_input_class"
  },
  "claims": {
    "runtimeExecution": false,
    "modelQuality": false,
    "providerAuthentication": false,
    "privacyGrantEnforcement": false,
    "retentionEnforcement": false,
    "toolExecution": false,
    "compatibility": "draft-only"
  },
  "disclaimers": [
    "draft-only",
    "not production security",
    "not model quality",
    "not runtime execution",
    "not L4 conformance",
    "not commercial permission"
  ],
  "extensions": {}
}
```

The example is deliberately non-normative. Field names and values may change before implementation.

## Required draft labels

Every future model-delegation draft fixture or suite must state:

- fixture stage is draft-only or fixture data only
- compatibility level is draft-only
- no official runner is required
- no production security guarantee exists
- no model-quality guarantee exists
- no runtime execution is implemented
- no provider authentication is proven
- no privacy-domain grant enforcement is proven
- no retention enforcement is proven
- no tool execution is allowed
- no L4 compatibility basis exists
- no commercial permission is granted

## Required rejection cases

Future draft fixture checks should reject:

- provider registry entries that claim trust grants by mere discovery
- provider registry entries that imply Vault-reading rights
- job envelopes that imply durable access
- job envelopes that include forbidden input classes
- job envelopes that include raw Vault dumps
- job envelopes that include key, credential, recovery, payment or domain-key material
- context references that can be expanded by the provider
- context references without expiry or scope
- jobs that request provider-side tool execution by default
- jobs that omit policy decision references when sensitive input classes are present
- jobs that omit consent references when confirmation is required
- jobs that use `provider_default` retention for private context without explicit policy
- results that claim action execution
- results that reference a different job or provider
- results that claim model correctness or safety certification
- fixtures that omit required draft disclaimers
- fixtures that claim compatibility above draft-only
- fixtures that imply production security or commercial permission

## Allowed rejection reasons

Future draft fixtures may use rejection reasons such as:

```text
registry_trust_grant_claim
provider_vault_read_claim
durable_access_claim
forbidden_input_class
raw_vault_dump
secret_material
context_ref_expansion
context_ref_unscoped
provider_tool_execution
missing_policy_decision
missing_consent
unsafe_retention_mode
action_execution_claim
result_job_mismatch
result_provider_mismatch
model_quality_claim
production_security_claim
compatibility_claim
commercial_permission_claim
missing_draft_disclaimer
unknown_top_level_field
unnamespaced_extension
```

These values are draft vocabulary only. They are not final conformance error codes.

## Synthetic data boundary

Future model-delegation fixtures must be synthetic.

They must not include:

- real user prompts
- real memory excerpts
- real Home state
- real health, legal, child or financial data
- private keys
- domain content keys
- recovery material
- credentials
- payment secrets
- production provider identifiers
- cloud account identifiers
- real model output from user data

Fixtures may use small fake strings that are clearly synthetic, such as `example private note` or `synthetic provider`.

## Positive fixture boundary

Positive fixtures may prove only draft shape acceptance.

They must not prove:

- that a provider is trusted
- that a policy decision is correct
- that a user consent is valid
- that privacy-domain grants are enforced
- that retention actually happens
- that a model output is correct
- that prompt injection is handled
- that a tool cannot be abused
- that remote inference is interoperable

Positive fixtures are useful for keeping future placeholder examples coherent, but they are not conformance.

## Negative fixture boundary

Negative fixtures are the main useful surface for this stage.

They should make unsafe interpretations fail early, especially:

- registry-as-access
- context-ref-as-browse-right
- job-envelope-as-durable-grant
- model-plan-as-action-approval
- provider-default-retention-for-private-context
- provider-tool-use-without-separate-policy
- result-envelope-as-execution-proof

## Relationship to future runtime

A future runtime may later consume model provider registry entries and model job envelopes, but it must not treat draft fixture shape as a runtime API.

Before runtime use, later ADRs must define:

- provider identity verification
- provider health and revocation handling
- policy decision storage
- consent storage
- privacy-domain grant semantics
- context reference resolution
- retention enforcement
- job queue lifecycle
- result validation
- audit storage
- provider-side error handling
- prompt-injection and context-leak defenses

## Non-goals

This ADR does not define:

- final JSON Schema
- canonical representation
- signed fixtures
- provider authentication
- Home membership verification
- privacy-domain grants
- prompt format
- model runtime execution
- model output scoring
- conformance runner
- compatibility certification
- cloud provider contract requirements

It also does not add fixture files.

## Implementation implications

Future machine-readable fixture work should start with a small draft suite:

```text
docs/protocol/fixtures/model-delegation/draft/suite.json
docs/protocol/fixtures/model-delegation/draft/provider-registry/
docs/protocol/fixtures/model-delegation/draft/job-envelope/
docs/protocol/fixtures/model-delegation/draft/result-envelope/
```

The first useful examples should be rejection-focused:

- forbidden input class in a job envelope
- provider registry entry claiming Vault-read authority
- context reference that can expand beyond its scope
- result envelope claiming action execution
- missing draft disclaimers

## Relationship to other ADRs

This ADR refines:

- `0048-model-capability-delegation-and-remote-inference-boundary.md`
- `0049-model-provider-registry-and-job-envelope.md`

It is similar in staging intent to:

- `0042-pico-link-draft-schema-and-fixture-gate.md`
- `0043-pico-link-draft-packet-envelope-preflight.md`
- `0044-pico-link-draft-protected-payload-placeholder.md`
- `0045-pico-home-link-draft-membership-credential-placeholder.md`
- `0046-draft-compatibility-claim-placeholder.md`
- `0047-draft-canonicalization-rejection-placeholder.md`

It remains below future model-delegation runtime, policy, privacy-domain, audit, provider-authentication and conformance specifications.

## Consequences

Positive:

- allows future model-delegation fixture data without runtime claims
- keeps model-delegation fixtures separate from Foundation and Pico Link fixtures
- makes unsafe remote-inference interpretations rejectable
- creates a narrow path for fixture-first design

Negative:

- adds another draft suite before runtime exists
- draft fixture fields may need migration when final schemas are selected
- implementers must remember that these fixtures prove no model behaviour or provider trust
