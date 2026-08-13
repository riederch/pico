# 0059 - Model Delegation Draft Result Envelope Provenance Placeholder

## Status

Status note, 2026-08-13: **superseded by `pico.model.result.v1`**, built in `@pico/protocol`. The draft's placeholder shape is not carried over, and the reason is one shape it used repeatedly: six fields whose documentation was a list of what they do not mean - `actionExecuted`, `toolExecuted`, `qualityClaims` with two sub-claims, `providerAuditRef` which "is not a signature, attestation or verified audit record", and `retentionApplied` which "is metadata, not enforcement". A field that may only hold one value is a promise stored where an edit can find it, so none of them exists. What replaces them is provenance a caller can check: the result names which job, which entry and which model digest answered, compared against what the caller dispatched rather than against a second copy in the same envelope.

The core rules stand unchanged and are now enforced by a parser rather than by a fixture convention.

Accepted as a draft-only Model Delegation result-envelope provenance placeholder boundary before model provider authentication, result validation, provenance verification, model-quality evaluation or job-queue runtime are implemented.

## Context

ADR 0048 defines delegated model capability: a model provider may supply reasoning capability without becoming memory owner, policy authority or action executor.

ADR 0049 introduces planning vocabulary for provider registry entries, job envelopes and result envelopes. A result envelope reports what a provider produced for one job, with provenance and retention metadata.

ADR 0050 defines the draft-only Model Delegation fixture gate and seeds the first separate draft suite. It lists several required result rejection cases: results that claim action execution, results that reference a different job or provider, and results that claim model correctness or safety certification.

ADR 0058 narrows the job-envelope surface: a job envelope authorizes exactly one scoped, policy- and consent-bound job.

The result envelope is the response and provenance surface of the delegation flow. So far it has only one seeded fixture (an action-execution rejection) and no positive shape. The still-open ADR 0050 result rejection cases - `result_job_mismatch`, `result_provider_mismatch` and `model_quality_claim` - all belong to this surface.

The next useful step is a safe placeholder that narrows what a draft result envelope may mean at fixture level, without accidentally making a result an execution proof, an action approval, a correctness certificate or a report that can be misattributed to a different job or provider.

## Decision

Future draft Model Delegation fixtures may use a Result Envelope provenance placeholder shape.

This placeholder is not a result-envelope implementation. It does not authenticate a provider, verify provenance, validate output, score model quality, prove action or tool execution or enforce retention.

A draft result envelope reports the output a provider produced for exactly one job, bound to the requesting job and provider, as a proposal or other non-executing output with provenance metadata.

## Core rule

```text
A result envelope reports a provider's output for exactly the requested job and provider.
It is never execution proof, never action approval and never a model-correctness certificate.
```

## Draft result envelope provenance placeholder shape

Draft fixtures may model a result envelope placeholder with these top-level fields:

```json
{
  "schema": "pico.model.result.envelope.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "jobId": "model_job_placeholder_...",
  "requestedJobId": "model_job_placeholder_...",
  "providerId": "model_provider_placeholder_...",
  "requestedProviderId": "model_provider_placeholder_...",
  "providerNodeKind": "same-device",
  "modelFamily": "placeholder-local",
  "modelNameOrClass": "synthetic-summarizer",
  "capabilityVersion": "draft-0",
  "startedAt": "2026-07-12T12:00:00.000Z",
  "completedAt": "2026-07-12T12:00:02.000Z",
  "status": "completed",
  "resultSchemaRef": "action_proposal",
  "result": {
    "proposal": "Synthetic proposal placeholder.",
    "actionExecuted": false,
    "toolExecuted": false
  },
  "qualityClaims": {
    "modelCorrectnessVerified": false,
    "safetyCertified": false
  },
  "limitations": ["Synthetic fixture result; not a real model output."],
  "evidenceRefs": [],
  "inputSummary": "Synthetic prompt only.",
  "inputClassSummary": ["user_supplied_prompt"],
  "retentionApplied": "audit_metadata_only",
  "providerAuditRef": "provider_audit_placeholder",
  "errors": [],
  "extensions": {}
}
```

The example is deliberately non-normative. Field names and values may change before implementation.

## Field semantics

`schema` identifies the draft fixture family only.

`schemaVersion` is a draft fixture version, not a Model Delegation compatibility level.

`fixtureStage` must remain `draft`.

`jobId` and `providerId` are the job and provider the result claims to answer. `requestedJobId` and `requestedProviderId` are the job and provider that were actually dispatched. They must match. A result that names a different job or provider is a provenance mismatch and is rejected.

`providerNodeKind`, `modelFamily`, `modelNameOrClass` and `capabilityVersion` are provenance metadata. They describe where the output came from; they do not authenticate the provider or certify the model.

`status` describes the reported completion state. In draft fixtures it stays `completed`.

`resultSchemaRef` names the output schema. In draft fixtures it stays `action_proposal`: the result may propose, not execute.

`result` carries the reported output. `actionExecuted` and `toolExecuted` must be `false`. A draft result that claims action or tool execution is rejected (ADR 0058 and this ADR keep proposal separate from execution).

`qualityClaims` must not assert verified model correctness or safety certification. A draft result that certifies its own correctness or safety is rejected.

`limitations`, `evidenceRefs`, `inputSummary` and `inputClassSummary` describe scope and provenance only. They do not prove correctness or authorize follow-up access.

`retentionApplied` states the retention the provider reports applying. It is metadata, not enforcement.

`providerAuditRef` is a synthetic placeholder reference. It is not a signature, attestation or verified audit record.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Allowed draft values

Draft result-envelope fixtures keep `status` at `completed` and `resultSchemaRef` at `action_proposal`.

Draft result-envelope fixtures may use these `retentionApplied` values:

```text
no_store
ephemeral_until_response
audit_metadata_only
bounded_result_retention
```

These values are draft vocabulary only. They are not final result-envelope status enums, output schema references or retention modes.

## Required rejection cases

Draft result-envelope fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- results that claim action execution or tool execution
- results that treat a proposal as an approved or executed action
- results whose `jobId` does not match the requested job
- results whose `providerId` does not match the requested provider
- results that claim verified model correctness or safety certification
- results that claim to authorize follow-up jobs or broader access
- fixtures that omit required draft disclaimers
- fixtures that claim compatibility above draft-only
- fixtures that imply production security or commercial permission

## A result envelope is not execution proof

A draft result envelope may report a proposal.

It must not claim:

- that an action was executed
- that a tool was executed
- that the proposal was approved
- that a follow-up job was started

Action and tool execution stay outside model inference and require their own policy, confirmation and Action History.

## A result envelope is not action approval

A result envelope reports what a provider produced.

It must not:

- act as an approval decision
- bypass the requester's confirmation flow
- authorize an Action Runner step
- grant the provider further access

Approval remains an explicit requester-side decision, separate from provider output.

## A result envelope is bound to its job and provider

A result envelope answers exactly one dispatched job from exactly one provider.

It must not:

- reference a different `jobId` than the requested job
- reference a different `providerId` than the requested provider
- merge outputs from multiple jobs
- reassign its output to another subject or purpose

Provenance mismatch must be rejectable so that a result cannot be silently reattributed.

## A result envelope is not a correctness certificate

A result envelope may report limitations and provenance.

It must not claim:

- verified model correctness
- safety certification
- prompt-injection resistance
- freedom from hallucination

Model quality and safety evaluation remain future work. A draft result envelope only reports output and provenance metadata.

## Relationship to job envelopes and provider registry

ADR 0049, ADR 0050 and ADR 0058 keep provider registry entries, job envelopes, context references and result envelopes as separate surfaces.

ADR 0059 narrows only the result-envelope surface:

- a job envelope authorizes one scoped job; the result answers exactly that job
- a provider registry entry advertises capability; the result does not inherit trust or correctness from it
- a context reference resolves to bounded context; the result does not expand it into further access

Cross-surface verification behaviour remains future work.

## Relationship to future runtime and verification

Before result envelopes carry security meaning, later ADRs must define:

- provider identity verification
- result provenance verification against the dispatched job
- output schema validation
- retention verification
- model-quality and safety evaluation
- prompt-injection and context-leak defenses
- audit persistence and visibility
- approval flow separation from provider output
- verifier behaviour for mismatched, malformed or contradictory result envelopes
- conformance fixture families for positive and negative result-envelope verification

Until then, result-envelope fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton demo may reference result-envelope placeholders only as visibly unverified fixture data.

The demo must not:

- execute a real inference job
- authenticate a real provider
- treat a draft result as an executed action or an approval
- claim verified model correctness or safety
- publish compatibility or security claims

If a demo needs real result handling, this ADR is insufficient and reviewed provider, provenance, validation, audit and approval designs must come first.

## Implementation status

This ADR is documentation and fixture-gate direction only.

The repository does not implement:

- model result envelopes
- provider authentication
- result provenance verification
- output schema validation
- retention verification
- model-quality or safety evaluation
- approval-flow integration
- a conformance runner for result-envelope verification

## Non-goals

This ADR does not define:

- final result envelope schema
- cryptographic algorithms
- signature formats
- canonicalization output
- provenance verification protocol
- output validation protocol
- model-quality scoring
- approval protocol
- runtime parser
- production verifier
- compatibility level
- commercial permission

## Relationship to other ADRs

This ADR refines:

- `0048-model-capability-delegation-and-remote-inference-boundary.md`
- `0049-model-provider-registry-and-job-envelope.md`
- `0050-model-delegation-draft-fixture-gate.md`
- `0058-model-delegation-draft-job-envelope-scoping-placeholder.md`

It is similar in staging intent to:

- `0043-pico-link-draft-packet-envelope-preflight.md`
- `0044-pico-link-draft-protected-payload-placeholder.md`
- `0045-pico-home-link-draft-membership-credential-placeholder.md`
- `0051-pico-link-draft-device-credential-placeholder.md`
- `0057-pico-home-link-draft-residency-eviction-placeholder.md`

It remains below future model-delegation runtime, provider-authentication, provenance, validation, model-quality, audit and conformance specifications.

## Consequences

Positive:

- gives the result envelope a dedicated draft provenance placeholder boundary
- seeds the missing positive result-envelope shape and the still-open ADR 0050 result rejection cases
- introduces a `provenance-negative` fixture family for job/provider misattribution
- makes execution-proof, approval, misattribution and correctness-certificate interpretations rejectable early

Negative:

- adds more draft fixtures and a new fixture family before a runtime exists
- draft fixture fields may need migration when final schemas are selected
- implementers must remember that these fixtures prove no provider trust, no provenance verification and no model quality
