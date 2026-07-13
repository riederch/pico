# 0058 - Model Delegation Draft Job Envelope Scoping Placeholder

## Status

Accepted as a draft-only Model Delegation job-envelope placeholder boundary before model provider authentication, policy-decision storage, consent storage, privacy-domain grant enforcement, retention enforcement, job-queue runtime or result validation are implemented.

## Context

ADR 0048 defines delegated model capability and the remote inference authority boundary: a model provider may supply reasoning capability without becoming memory owner, policy authority or action executor.

ADR 0049 introduces planning vocabulary for model provider registry entries and model job envelopes. Its core rule is that a provider registry entry is not a trust grant and a model job envelope is not durable access. The job envelope may carry or reference scoped context for one purpose only, and must not let the provider browse a Vault, reuse context for other jobs, execute tools, mutate memory or retain data beyond policy.

ADR 0050 defines the draft-only Model Delegation fixture gate and seeds the first separate draft suite. That seed proves one provider-registry positive shape, one provider-registry authority rejection, one job-envelope forbidden-input-class rejection, one context-reference expansion rejection and one result-envelope action-execution rejection.

The job envelope is the authorization-carrying surface of the delegation flow. ADR 0050 lists several still-unseeded required rejection cases that all belong to the job envelope: envelopes that imply durable access, envelopes that omit policy decision references when sensitive input classes are present, envelopes that omit consent references when confirmation is required, and envelopes that use `provider_default` retention for private context without explicit policy. The job-envelope surface also has no positive shape fixture yet.

The next useful step is a safe placeholder that narrows what a draft job envelope may mean at fixture level, without accidentally making the envelope a durable grant, a policy substitute, a consent substitute or a provider retention license.

## Decision

Future draft Model Delegation fixtures may use a Job Envelope scoping placeholder shape.

This placeholder is not a job envelope implementation. It does not authenticate a provider, verify a policy decision, verify consent, enforce privacy-domain grants, enforce retention, execute a job, execute tools, validate a result or prove compatibility.

A draft job envelope describes at most the intent to authorize a single scoped inference task. It authorizes exactly one job, bound to one purpose, one provider, one policy decision, one consent reference and one context boundary.

## Core rule

```text
A model job envelope authorizes exactly one scoped, policy- and consent-bound job.
It is never durable access, never a policy or consent substitute and never a provider retention license.
```

## Draft job envelope scoping placeholder shape

Draft fixtures may model a job envelope placeholder with these top-level fields:

```json
{
  "schema": "pico.model.job.envelope.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "jobId": "model_job_placeholder_...",
  "jobVersion": 1,
  "createdAt": "2026-07-12T12:00:00.000Z",
  "expiresAt": "2026-07-12T12:05:00.000Z",
  "requesterSubject": "subject_placeholder_requester",
  "requesterDevice": "device_placeholder_requester",
  "subjectPico": "pico_placeholder_subject",
  "providerId": "model_provider_local_summarizer_placeholder",
  "jobType": "model.summarize",
  "purpose": "Summarize a synthetic note for fixture testing.",
  "purposeCategory": "assistive_summary",
  "policyDecisionRef": "policy_decision_placeholder_allow_non_secret_summary",
  "consentRef": "consent_placeholder_scoped_summary",
  "requiredConfirmation": false,
  "privacyDomainRefs": ["private_domain_placeholder"],
  "inputClasses": ["user_supplied_prompt", "conversation_summary"],
  "contextRefs": [],
  "inlineContext": { "prompt": "Summarize this synthetic note." },
  "redactionSummary": "Synthetic fixture context only.",
  "retentionRequirement": "no_store",
  "toolUseMode": "none",
  "outputSchemaRef": "summary_markdown",
  "resultHandling": "return_to_requester_only",
  "auditRequirement": "audit_metadata_only",
  "replayNonce": "nonce_model_job_placeholder",
  "singleJob": true,
  "durableAccessClaim": false,
  "accessScope": "single_job",
  "extensions": {}
}
```

The example is deliberately non-normative. Field names and values may change before implementation.

## Field semantics

`schema` identifies the draft fixture family only.

`schemaVersion` is a draft fixture version, not a Model Delegation compatibility level.

`fixtureStage` must remain `draft`.

`jobId` and `replayNonce` are synthetic placeholder identifiers. They are not signatures, capability tokens, bearer credentials or replay-proof nonces.

`expiresAt` marks intended single-job validity. The envelope should be immutable after dispatch; corrections should create a new job, not extend an existing one.

`providerId` names a placeholder provider. Naming a provider does not authenticate it, trust it or grant it Vault access.

`policyDecisionRef` and `consentRef` reference a policy decision and a user confirmation prepared elsewhere. The envelope refers to them; it does not embed policy logic and does not stand in for a missing decision or missing consent.

`inputClasses` names the data classes the job may carry. Forbidden input classes must be rejected. Sensitive input classes require a matching policy decision and, where confirmation is required, a consent reference.

`contextRefs` and `inlineContext` are bounded, requester-prepared context for one purpose. They must not let the provider expand scope into broader memory access.

`retentionRequirement` states how the provider may retain context and results. It must use bounded retention vocabulary. `provider_default` is unsafe for private context unless an explicit policy decision allows it.

`toolUseMode` stays `none` in draft job envelopes. Provider-side tool use is a separate capability delegation with its own policy, confirmation and Action History.

`singleJob`, `durableAccessClaim` and `accessScope` make the single-job boundary explicit. A draft job envelope must describe one job only; a durable or standing access claim is rejected.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Allowed draft values

Draft job-envelope fixtures may use these `jobType` values:

```text
model.summarize
model.extract
model.draft
model.compare
model.reason
model.plan
```

Draft job-envelope fixtures may use these `purposeCategory` values:

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

Draft job-envelope fixtures may use these safe `retentionRequirement` values:

```text
no_store
ephemeral_until_response
audit_metadata_only
bounded_result_retention
```

`provider_default` is draft vocabulary for an unsafe retention request. It may appear only in a retention rejection fixture, never in an accepted placeholder.

Draft job-envelope fixtures keep `toolUseMode` at `none`.

These values are draft vocabulary only. They are not final job-type enums, policy categories, retention modes or tool-use modes.

## Required rejection cases

Draft job-envelope fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- job envelopes that imply durable or standing access beyond the single job
- job envelopes that reuse one authorization for multiple jobs
- job envelopes that include forbidden input classes
- job envelopes that include raw Vault dumps, key, credential, recovery, payment or domain-key material
- job envelopes that omit a policy decision reference when sensitive input classes are present
- job envelopes that omit a consent reference when confirmation is required
- job envelopes that request `provider_default` or otherwise unbounded retention for private context without explicit policy
- job envelopes that enable provider-side tool execution by default
- job envelopes that treat inline context or context references as a provider browse capability
- fixtures that omit required draft disclaimers
- fixtures that claim compatibility above draft-only
- fixtures that imply production security or commercial permission

## A job envelope is not durable access

A draft job envelope may authorize one scoped job.

It must not claim:

- a standing or durable grant to a provider
- reuse of one authorization for later jobs
- ongoing Vault or memory read access
- provider-initiated follow-up jobs
- a capability token the provider may store and replay

The single-job boundary must stay explicit. A durable or standing access claim is a rejection case, not an accepted shape.

## A job envelope is not a policy or consent substitute

A draft job envelope references a policy decision and, where confirmation is required, a consent reference.

It must not:

- stand in for a missing policy decision
- stand in for a missing consent when confirmation is required
- embed arbitrary policy logic that bypasses the policy decision
- assert that sensitive or safety-sensitive context is allowed without a matching decision

Policy decision storage, consent storage and confirmation semantics remain future work. A draft envelope only references them.

## A job envelope is not a provider retention license

A draft job envelope states a bounded retention requirement.

It must not:

- grant the provider permanent retention of private context
- allow provider-side training on delegated context
- use `provider_default` retention for private context without an explicit policy decision
- imply that retention is actually enforced

Retention enforcement remains future work. A draft envelope only states the requested bound.

## Relationship to provider registry, context references and result envelopes

ADR 0049 and ADR 0050 keep provider registry entries, context references and result envelopes as separate surfaces.

ADR 0058 narrows only the job-envelope surface:

- a registry entry advertises capability; the job envelope does not inherit trust from it
- a context reference resolves to a bounded, requester-prepared context; the job envelope does not turn it into a browse right
- a result envelope reports provenance and output; the job envelope does not pre-authorize action execution

Cross-surface verification behaviour remains future work.

## Relationship to future runtime and verification

Before job envelopes carry security meaning, later ADRs must define:

- provider identity verification
- policy decision storage and evaluation
- consent storage and confirmation flow
- privacy-domain grant semantics
- context reference resolution
- retention enforcement
- job-queue lifecycle and cancellation records
- result validation and provenance checking
- audit persistence and visibility
- prompt-injection and context-leak defenses
- verifier behaviour for expired, replayed or contradictory job envelopes
- conformance fixture families for positive and negative job-envelope verification

Until then, job-envelope fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton demo may reference job-envelope placeholders only as visibly unverified fixture data.

The demo must not:

- execute a real inference job
- authenticate a real provider
- treat a draft envelope as a runtime API
- retain delegated context beyond the stated bound
- execute provider-side tools
- publish compatibility or security claims

If a demo needs real job execution, this ADR is insufficient and reviewed provider, policy, consent, privacy-domain, retention and audit designs must come first.

## Implementation status

This ADR is documentation and fixture-gate direction only.

The repository does not implement:

- model job envelopes
- provider authentication
- policy decision or consent storage
- privacy-domain grant enforcement
- retention enforcement
- job-queue runtime execution
- result validation
- a conformance runner for job-envelope verification

## Non-goals

This ADR does not define:

- final job envelope schema
- cryptographic algorithms
- signature formats
- canonicalization output
- policy decision format
- consent format
- retention enforcement protocol
- job-queue protocol
- result validation protocol
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
- `0044-pico-link-draft-protected-payload-placeholder.md`
- `0045-pico-home-link-draft-membership-credential-placeholder.md`
- `0051-pico-link-draft-device-credential-placeholder.md`
- `0057-pico-home-link-draft-residency-eviction-placeholder.md`

It remains below future model-delegation runtime, provider-authentication, policy, consent, privacy-domain, retention, audit and conformance specifications.

## Consequences

Positive:

- gives the job envelope a dedicated draft placeholder boundary
- seeds the missing positive job-envelope shape and the still-open ADR 0050 job-envelope rejection cases
- makes durable-access, missing-policy/consent and unsafe-retention interpretations rejectable early
- keeps job-envelope fixtures separate from Foundation and Pico Link fixtures

Negative:

- adds more draft fixtures before a runtime exists
- draft fixture fields may need migration when final schemas are selected
- implementers must remember that these fixtures prove no provider trust, no policy enforcement and no retention enforcement
