# 0061 - Model Delegation Draft Provider Registry Advertisement Placeholder

## Status

Accepted as a draft-only Model Delegation provider-registry advertisement placeholder boundary before provider discovery, provider authentication, trust-state management, revocation handling or job-queue runtime are implemented.

## Context

ADR 0048 defines delegated model capability: a model provider may supply reasoning capability without becoming memory owner, policy authority or action executor.

ADR 0049 introduces planning vocabulary for provider registry entries, job envelopes, context references and result envelopes. Its core rule is that a model provider registry entry is not a trust grant. Registry entries describe provider identity, node kind, locality, model family, supported job types, input classes, retention modes, tool-use modes, trust state and revocation state, but advertising a capability grants no authority.

ADR 0050 defines the draft-only Model Delegation fixture gate and seeds the first separate draft suite, including one positive provider-registry placeholder and one negative that rejects a Vault-read authority claim. Its required provider-registry rejection cases also include entries that claim trust grants by mere discovery. ADR 0049 additionally states that `separate_policy_required` tool use must not be silently enabled by provider configuration and that revocation state must be modeled.

ADR 0058, ADR 0059 and ADR 0060 narrow the job-envelope, result-envelope and context-reference surfaces.

The provider registry entry is the discovery surface of the delegation flow. It has a positive placeholder and one authority rejection, but the still-open concerns - trust-by-discovery, a revoked provider that still advertises itself and default-enabled tool execution - are not yet seeded.

The next useful step is a safe placeholder that narrows what a draft provider registry entry may mean at fixture level, without accidentally making advertisement into trust, keeping a revoked provider usable or silently enabling tool execution.

## Decision

Future draft Model Delegation fixtures may use a Provider Registry advertisement placeholder shape.

This placeholder is not a provider registry implementation. It does not discover, authenticate, trust or revoke a provider, and it does not enable tool execution.

A draft provider registry entry advertises a possible model capability. Trust, Vault access, usability after revocation and tool execution are all separate decisions, not properties of an advertisement.

## Core rule

```text
A provider registry entry advertises a possible model capability.
It is never a trust grant, never Vault access, never usable after revocation and never default tool execution.
```

## Draft provider registry advertisement placeholder shape

Draft fixtures may model a provider registry entry placeholder with these top-level fields:

```json
{
  "schema": "pico.model.provider.registry.entry.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "providerId": "model_provider_placeholder_...",
  "providerDisplayName": "Synthetic Provider Placeholder",
  "providerNodeKind": "same-device",
  "providerOwnerSubject": "subject_placeholder_owner",
  "homeId": null,
  "deviceId": "device_placeholder_local",
  "relationshipId": null,
  "executionLocation": "local",
  "locality": "same-device",
  "transportRequirements": [],
  "model": {
    "family": "placeholder-local",
    "nameOrClass": "synthetic-summarizer",
    "runtime": "development-stub",
    "capabilityVersion": "draft-0"
  },
  "supportedJobTypes": ["model.summarize", "model.extract", "model.draft"],
  "supportedInputClasses": ["public_reference", "user_supplied_prompt"],
  "supportedOutputSchemas": ["plain_text", "summary_markdown"],
  "limits": { "maxContextBytes": 2048, "maxContextItems": 4 },
  "retentionModes": ["no_store", "ephemeral_until_response", "audit_metadata_only"],
  "auditModes": ["audit_metadata_only"],
  "toolUseModes": ["none", "propose_only"],
  "toolExecutionEnabledByDefault": false,
  "trustState": "trusted-for-non-sensitive",
  "availabilityState": "available",
  "advertisedAvailable": true,
  "latencyClass": "local",
  "costClass": "none",
  "revocationState": "active",
  "claims": {
    "trustGrantByDiscovery": false,
    "vaultReadAccess": false,
    "privacyGrantEnforcement": false,
    "runtimeExecution": false
  },
  "extensions": {}
}
```

The example is deliberately non-normative. Field names and values may change before implementation.

## Field semantics

`schema` identifies the draft fixture family only.

`schemaVersion` is a draft fixture version, not a Model Delegation compatibility level.

`fixtureStage` must remain `draft`.

`providerId`, `providerDisplayName`, `providerNodeKind`, `locality` and `model` are advertisement metadata. They describe a possible provider; they do not authenticate it.

`supportedJobTypes`, `supportedInputClasses`, `supportedOutputSchemas` and `limits` describe advertised capability, not granted authority.

`retentionModes`, `auditModes` and `toolUseModes` are advertised modes a later policy may or may not accept. `toolExecutionEnabledByDefault` must be `false`; `separate_policy_required` tool use must never be silently enabled by advertisement.

`trustState` is an advertised or locally recorded state. A `discovered` provider has no trust; trust is a separate configuration decision. A registry entry must not claim trust by discovery.

`availabilityState`, `advertisedAvailable` and `revocationState` describe availability and revocation. A `revoked` provider must not remain usable, even if it still advertises availability.

`claims` records the entry's own non-authority assertions. `trustGrantByDiscovery` and `vaultReadAccess` must be `false` in an accepted entry.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Allowed draft values

Draft provider-registry fixtures may use these `providerNodeKind` values:

```text
same-device
pico-home
pico-vault
pico-surface
peer-pico
cloud-connector
development-stub
```

Draft provider-registry fixtures may use these `trustState` values:

```text
discovered
configured
trusted-for-non-sensitive
trusted-for-scoped-private
trusted-for-shared-space
disabled
revoked
quarantined
```

Draft provider-registry fixtures may use these `toolUseModes` values:

```text
none
propose_only
separate_policy_required
not_supported
```

An accepted entry keeps `trustState` at `trusted-for-non-sensitive`, `trustGrantByDiscovery` and `vaultReadAccess` at `false` and `toolExecutionEnabledByDefault` at `false`.

These values are draft vocabulary only. They are not final registry schema, trust-state machines or tool-use grammars.

## Draft rejection reasons

Draft provider-registry fixtures may use these rejection reasons:

```text
registry_trust_grant_claim
provider_vault_read_claim
revoked_provider_usable
provider_tool_execution
```

`registry_trust_grant_claim`, `provider_vault_read_claim` and `provider_tool_execution` come from ADR 0050. `revoked_provider_usable` is draft vocabulary for a revoked provider that still advertises usability.

These values are draft vocabulary only. They are not final conformance error codes.

## Required rejection cases

Draft provider-registry fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- entries that claim trust by mere discovery
- entries that imply Vault-reading rights
- entries whose revocation state is revoked but which still advertise usability
- entries that enable tool execution by default or silently enable `separate_policy_required`
- entries that advertise support for forbidden input classes
- fixtures that omit required draft disclaimers
- fixtures that claim compatibility above draft-only
- fixtures that imply production security or commercial permission

## A registry entry is not a trust grant

A draft provider registry entry advertises a capability.

It must not claim:

- trust by discovery
- automatic promotion from `discovered` to a trusted state
- a standing authorization to run jobs
- that advertisement alone satisfies policy

Trust is a separate, explicit configuration decision, recorded independently of the advertisement.

## A registry entry is not Vault access

A draft provider registry entry describes a provider.

It must not claim:

- Vault-reading rights
- private-domain read access
- memory browse capability
- context beyond what a job envelope scopes

Vault and domain access remain explicit protected-domain decisions, never granted by a registry entry.

## A revoked provider is not usable

A draft provider registry entry may record a revocation state.

A `revoked` entry must not:

- advertise itself as available for new jobs
- retain trust from before revocation
- be selectable by a job envelope
- silently return to an active state

Revocation must be able to remove a provider from use, even if the provider still advertises availability.

## A registry entry is not default tool execution

A draft provider registry entry may advertise tool-use modes.

It must not:

- enable tool execution by default
- silently enable `separate_policy_required`
- treat advertised tool support as authorization
- bypass the separate policy, confirmation and Action History that provider tool use requires

Provider-side tool use is a second capability delegation with its own gates.

## Relationship to job envelopes, context references and result envelopes

ADR 0049, ADR 0050, ADR 0058, ADR 0059 and ADR 0060 keep provider registry entries, job envelopes, context references and result envelopes as separate surfaces.

ADR 0061 narrows only the provider-registry surface:

- a job envelope authorizes one scoped job; it does not inherit trust from a registry entry
- a context reference resolves to bounded context; a registry entry does not grant the provider access to it
- a result envelope reports output; a registry entry does not certify it

Cross-surface verification behaviour remains future work.

## Relationship to future runtime and verification

Before provider registry entries carry security meaning, later ADRs must define:

- provider discovery
- provider identity verification and authentication
- trust-state transitions and storage
- revocation lookup and enforcement
- capability and health monitoring
- policy binding for job selection
- tool-use delegation gating
- audit persistence and visibility
- verifier behaviour for trust-by-discovery, revoked, or tool-enabling entries
- conformance fixture families for positive and negative registry verification

Until then, provider-registry fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton demo may reference provider-registry placeholders only as visibly unverified fixture data.

The demo must not:

- discover or authenticate a real provider
- treat advertisement as trust
- run jobs on a revoked provider
- enable provider-side tool execution
- publish compatibility or security claims

If a demo needs real provider selection, this ADR is insufficient and reviewed discovery, authentication, trust-state, revocation and audit designs must come first.

## Implementation status

This ADR is documentation and fixture-gate direction only.

The repository does not implement:

- model provider registry
- provider discovery or authentication
- trust-state management
- revocation lookup or enforcement
- tool-use delegation gating
- a conformance runner for provider-registry verification

## Non-goals

This ADR does not define:

- final provider registry schema
- cryptographic algorithms
- provider authentication protocol
- trust-state machine
- revocation protocol
- tool-use delegation protocol
- runtime parser
- production verifier
- compatibility level
- commercial permission

## Relationship to other ADRs

This ADR refines:

- `0048-model-capability-delegation-and-remote-inference-boundary.md`
- `0049-model-provider-registry-and-job-envelope.md`
- `0050-model-delegation-draft-fixture-gate.md`

It is similar in staging intent to:

- `0043-pico-link-draft-packet-envelope-preflight.md`
- `0058-model-delegation-draft-job-envelope-scoping-placeholder.md`
- `0059-model-delegation-draft-result-envelope-provenance-placeholder.md`
- `0060-model-delegation-draft-context-reference-scoping-placeholder.md`

It rounds out draft placeholder coverage for all four Model Delegation surfaces. It remains below future model-delegation runtime, provider-authentication, trust-state, revocation, audit and conformance specifications.

## Consequences

Positive:

- gives the provider registry entry a dedicated draft advertisement placeholder boundary
- seeds the still-open trust-by-discovery, revoked-usable and default-tool-execution rejection cases
- completes draft placeholder coverage across provider registry, job envelope, context reference and result envelope
- makes advertisement-as-trust interpretations rejectable early

Negative:

- adds more draft fixtures before a runtime exists
- draft fixture fields may need migration when final schemas are selected
- implementers must remember that these fixtures prove no provider trust, no authentication and no revocation enforcement
