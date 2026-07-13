# 0049 - Model Provider Registry and Job Envelope

## Status

Accepted as a model-provider registry and job-envelope direction before runtime schema, provider discovery or transport implementation.

## Context

ADR 0048 allows Pico to delegate model inference or planning to a trusted model capability provider, such as a stronger Pico Home, desktop Pico Vault, peer endpoint or mediated cloud connector.

That decision needs a narrower next layer:

- how a provider is described
- how a requester selects an eligible provider
- what a single delegated model job may include
- how policy and consent decisions bind to that job
- how result provenance is returned
- which fields must not become implicit memory, tool or identity authority

This ADR defines conceptual registry and envelope boundaries. It is intentionally below a final public wire schema and above any implementation.

## Decision

Pico should represent delegated model execution through two separate concepts:

```text
model provider registry entry
model job envelope
```

A provider registry entry describes a possible model capability provider.

A model job envelope authorizes one scoped inference task after policy and consent checks.

## Core rule

> A model provider registry entry is not a trust grant. A model job envelope is not durable access.

The registry may say that a provider exists and advertises capabilities. It must not by itself allow private context to be sent.

The job envelope may carry or reference scoped context for one purpose. It must not allow the provider to browse a Vault, reuse context for other jobs, execute tools, mutate memory or retain data beyond policy.

## Provider registry entry

A future provider registry entry should describe provider capability and risk, not user data access.

Conceptual fields:

```text
provider_id
provider_display_name
provider_node_kind
provider_owner_subject
home_id
device_id
relationship_id
execution_location
locality
transport_requirements
model_family
model_name_or_class
model_runtime
capability_version
supported_job_types
supported_input_classes
supported_output_schemas
max_context_bytes
max_context_items
retention_modes
audit_modes
tool_use_modes
availability_state
latency_class
cost_class
trust_state
last_health_check
revocation_state
extensions
```

Those names are illustrative. Final names must be selected by a later schema ADR.

## Provider identity and locality

`provider_node_kind` should distinguish at least:

```text
same-device
pico-home
pico-vault
pico-surface
peer-pico
cloud-connector
development-stub
```

`locality` should distinguish at least:

```text
same-process
same-device
same-home
local-network
peer-home
cloud-mediated
unknown
```

Locality is policy input. It is not proof of safety.

## Provider trust state

The registry should distinguish discovery from trust.

Conceptual trust states:

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

`trusted-for-scoped-private` must still require a matching job policy decision and privacy-domain grant. It is not a blanket Vault-reading right.

Providers should fail closed when trust state is missing, stale, revoked or ambiguous.

## Supported job types

Provider entries may advertise supported job types such as:

```text
model.summarize
model.extract
model.draft
model.compare
model.reason
model.plan
```

Job type ordering should be conservative:

- `model.summarize`, `model.extract` and `model.draft` are the safest first candidates.
- `model.reason` may handle broader context but still returns analysis only.
- `model.plan` may prepare proposed actions, but it must not execute them.

The provider registry must not advertise tool execution as part of these model job types.

## Input classes

Model delegation policy needs data classes that can be evaluated before context is sent.

Conceptual input classes:

```text
public_reference
user_supplied_prompt
conversation_summary
conversation_excerpt
foundation_diagnostic
home_state_snapshot
shared_space_excerpt
private_memory_summary
private_memory_excerpt
sensitive_personal_excerpt
financial_excerpt
health_excerpt
child_or_guardian_excerpt
legal_excerpt
credential_material
key_material
recovery_material
domain_content_key
payment_secret
raw_vault_dump
```

Some classes should be categorically forbidden for model context:

```text
credential_material
key_material
recovery_material
domain_content_key
payment_secret
raw_vault_dump
```

Other sensitive classes may require explicit user confirmation, purpose limitation, provider trust, redaction and audit.

## Retention modes

Provider entries and job envelopes should use explicit retention vocabulary.

Conceptual retention modes:

```text
no_store
ephemeral_until_response
audit_metadata_only
bounded_result_retention
provider_default
not_supported
```

`provider_default` should be treated as unsafe for private context unless policy explicitly allows it.

For private or sensitive input classes, the requester should prefer `no_store`, `ephemeral_until_response` or `audit_metadata_only`.

## Tool-use modes

Model jobs must default to no provider-side tool use.

Conceptual tool-use modes:

```text
none
propose_only
separate_policy_required
not_supported
```

For ADR 0049, the only safe default is:

```text
tool_use_mode: none
```

`propose_only` means the model may propose an action in text or structured output. It still does not execute anything.

`separate_policy_required` is reserved for future nested delegation. It must not be silently enabled by model provider configuration.

## Model job envelope

A model job envelope should bind a single request to one purpose, provider, policy decision and context boundary.

Conceptual fields:

```text
job_id
job_version
created_at
expires_at
requester_subject
requester_device
subject_pico
provider_id
job_type
purpose
purpose_category
policy_decision_ref
consent_ref
privacy_domain_refs
input_classes
context_refs
inline_context
redaction_summary
retention_requirement
tool_use_mode
output_schema_ref
result_handling
audit_requirement
replay_nonce
extensions
```

The envelope should be immutable after dispatch. Corrections should create a new job or a cancellation record.

## Purpose boundary

`purpose` should be human-readable enough for audit and confirmation surfaces.

`purpose_category` should be structured enough for policy.

Conceptual categories:

```text
assistive_summary
information_extraction
drafting
comparison
reasoning
planning
external_action_preparation
safety_sensitive_assistance
development_test
```

External-write, financial, contractual, legal, medical, child-related or safety-sensitive planning should require stricter policy and confirmation.

## Context references

`context_refs` should point to requester-selected scoped context.

A context reference is not a provider read capability. It should resolve to a bounded context packet prepared by the requester or by a trusted runtime acting under the requester's policy.

Conceptual context reference fields:

```text
context_ref_id
source_domain
source_kind
input_class
summary
freshness
max_bytes
redaction_applied
allowed_for_provider
expires_at
```

Providers must not be able to expand a reference into broader memory access.

## Inline context

`inline_context` may be used for small prompts, short excerpts or synthetic examples.

It must not contain:

- private keys
- domain content keys
- recovery material
- credentials
- payment secrets
- raw Vault exports
- unrelated private memory
- hidden tool credentials

Inline context should have an attached `redaction_summary` for any non-public data.

## Policy decision reference

The job envelope should refer to a policy decision rather than embedding arbitrary policy logic.

Conceptual policy decision contents:

```text
policy_decision_ref
decision
decided_at
decider
matched_rules
risk_class
required_confirmation
allowed_input_classes
allowed_provider
retention_limit
audit_level
reason
```

The model provider receives only the policy facts required to execute and audit the job. Full user policy internals do not need to be disclosed to the provider.

## Consent reference

When a job requires user confirmation before context is sent, the envelope should reference that confirmation.

Conceptual consent fields:

```text
consent_ref
confirmed_by
confirmed_at
confirmation_surface
confirmed_provider
confirmed_input_classes
confirmed_purpose
expires_at
revocable
```

Consent for one provider, purpose and context set must not be reused for another job.

## Result envelope

A model provider should return a result envelope rather than an unlabelled string.

Conceptual fields:

```text
job_id
provider_id
provider_node_kind
model_family
model_name_or_class
capability_version
started_at
completed_at
status
result_schema_ref
result
limitations
evidence_refs
input_summary
input_class_summary
retention_applied
provider_audit_ref
errors
extensions
```

Allowed statuses should be explicit:

```text
completed
failed
rejected_by_provider_policy
expired
canceled
partial
```

A result envelope is not an action approval. It returns information to the requesting Pico, which still applies Pico Rules and Action Runner boundaries.

## Output schemas

`output_schema_ref` may eventually request structured output, such as:

```text
plain_text
summary_markdown
extracted_fields
comparison_table
draft_message
action_proposal
risk_notes
```

`action_proposal` is a proposal only. It must not become an executable action without a separate policy and confirmation path.

## Audit requirements

At minimum, audit should be able to answer:

- who requested the model job
- which provider ran it
- which job type and purpose were used
- which input classes were included
- whether confirmation was required and obtained
- which retention mode was requested
- which retention mode was applied
- whether the provider used tools
- which result was returned or why the job failed

Audit entries should avoid storing full sensitive prompts unless a privacy-domain policy explicitly allows it.

## Failure handling

Delegated model jobs should fail closed.

The requester should reject or cancel a job when:

- the provider is revoked, stale or disabled
- advertised capability no longer matches the job
- retention requirements cannot be satisfied
- tool use is unexpectedly requested
- input class policy changes before dispatch
- consent expires before dispatch
- the result references a different job or provider
- the result contains action-execution claims

## Compatibility and fixture boundary

This ADR does not define a normative JSON schema, canonical form or conformance fixture.

Future draft fixtures may model provider registry entries, job envelopes and result envelopes only after a separate draft-fixture ADR defines the placeholder shape and rejection cases.

Until then, the field lists in this ADR are planning vocabulary, not compatibility requirements.

## Non-goals

This ADR does not implement:

- provider discovery
- provider authentication
- device or Home membership verification
- privacy-domain grants
- model runtime integration
- cloud model integration
- prompt construction
- prompt-injection defenses
- final JSON schema
- canonicalization
- signatures
- conformance fixtures
- job queue runtime
- Action Runner integration

It also does not grant any provider access to Pico memory, tools, credentials or private domains.

## Implementation implications

Future implementation may add structures such as:

```text
model_provider_registry_entry
model_provider_trust_state
model_provider_health_check
model_job_envelope
model_context_ref
model_policy_decision_ref
model_consent_ref
model_result_envelope
model_job_audit_entry
```

The first implementation should be local and conservative:

```text
same-device or same-home provider
-> non-sensitive input classes
-> summarize/extract/draft job
-> no provider-side tools
-> audit metadata only
```

Only after policy, consent, domain grants, provider identity and audit exist should cross-Home or cloud-mediated providers be considered.

## Relationship to other ADRs

This ADR refines:

- `0048-model-capability-delegation-and-remote-inference-boundary.md`

It is staged and refined by:

- `0050-model-delegation-draft-fixture-gate.md`, which gates draft-only fixture data for these surfaces
- `0058-model-delegation-draft-job-envelope-scoping-placeholder.md`, which narrows the job-envelope surface to a single scoped, policy- and consent-bound job placeholder

It extends and constrains:

- `0010-tool-policy-and-executor-model.md`
- `0011-privacy-security-and-audit-model.md`
- `0015-full-clients-light-clients-and-relay.md`
- `0028-pico-link-transport-facade-and-relay-network.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0035-pico-as-digital-companion-and-twin-model.md`
- `0036-capabilities-connectors-and-mcp-boundary.md`
- `0037-proactive-companion-delegation-and-procurement.md`

It remains below future protocol schemas, provider authentication, Home membership, privacy-domain, canonicalization, signature and conformance decisions.

## Consequences

Positive:

- separates provider inventory from job authorization
- makes context delegation explicit, scoped and auditable
- gives future local-provider work a conservative starting point
- keeps tool execution outside model inference by default
- provides vocabulary for rejecting unsafe remote-inference requests

Negative:

- adds policy and audit complexity before model delegation can run
- requires provider health, trust and retention state to be modeled
- makes cross-Home and cloud-mediated model use dependent on several unfinished layers
- draft field names may migrate when final schemas are selected
