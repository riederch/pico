# 0060 - Model Delegation Draft Context Reference Scoping Placeholder

## Status

Status note, 2026-08-13: **superseded by `pico.model.context.ref.v1`**, built in `@pico/protocol`. The draft's placeholder shape is not carried over, and the reason is one shape it used repeatedly: seven fields that could hold only one value - `sourceAccessMode` fixed at `materialized_excerpt`, `providerExpansionAllowed` false, `expansionScope` none, `reusableAcrossJobs` false, `redactionApplied` true, `allowedForProvider` true. None of them exists. The two that mattered became structure instead: the reference carries the bytes and no address, so reading through to a source is unsayable; and it names its job, so reuse across jobs is unsayable. The two claims about the writer's own completed homework are dropped rather than moved, because a claim about one's own homework verifies nothing.

The core rules stand unchanged and are now enforced by a parser rather than by a fixture convention.

Accepted as a draft-only Model Delegation context-reference scoping placeholder boundary before context reference resolution, privacy-domain grant enforcement, redaction verification or job-queue runtime are implemented.

## Context

ADR 0048 defines delegated model capability: a model provider may supply reasoning capability without becoming memory owner, policy authority or action executor.

ADR 0049 introduces planning vocabulary for provider registry entries, job envelopes, context references and result envelopes. It states that a context reference is not a provider read capability: it should resolve to a bounded context packet prepared by the requester or by a trusted runtime acting under the requester's policy, and providers must not be able to expand a reference into broader memory access.

ADR 0050 defines the draft-only Model Delegation fixture gate. Its required context-reference rejection cases are references that can be expanded by the provider and references without expiry or scope.

ADR 0058 narrows the job-envelope surface and ADR 0059 narrows the result-envelope surface.

The context reference is the surface that connects private memory to a delegated job. So far it has only one seeded fixture (a provider-expansion rejection) and no positive shape. The still-open concerns - a reference used as a live provider read capability, a reference without scope or expiry, and a reference that carries forbidden secret material - all belong to this surface.

The next useful step is a safe placeholder that narrows what a draft context reference may mean at fixture level, without accidentally making it a provider read capability, a durable grant, an unscoped reference or a secret carrier.

## Decision

Future draft Model Delegation fixtures may use a Context Reference scoping placeholder shape.

This placeholder is not a context-reference implementation. It does not resolve a reference, verify redaction, enforce privacy-domain grants, verify freshness or bound provider behaviour.

A draft context reference describes a bounded, redacted, expiring, materialized context packet prepared for exactly one job. It is a value passed to one job, not a capability handed to a provider.

## Core rule

```text
A context reference is a bounded, redacted, expiring, materialized packet for one job.
It is never a provider read capability, never durable, never unscoped and never a secret carrier.
```

## Draft context reference scoping placeholder shape

Draft fixtures may model a context reference placeholder with these top-level fields:

```json
{
  "schema": "pico.model.context.ref.draft",
  "schemaVersion": 1,
  "fixtureStage": "draft",
  "contextRefId": "context_ref_placeholder_...",
  "sourceDomain": "private_domain_placeholder",
  "sourceKind": "private_memory_excerpt",
  "inputClass": "private_memory_excerpt",
  "summary": "Synthetic bounded private note excerpt for one job.",
  "freshness": "2026-07-12T12:00:00.000Z",
  "maxBytes": 512,
  "redactionApplied": true,
  "allowedForProvider": true,
  "expiresAt": "2026-07-12T12:05:00.000Z",
  "sourceAccessMode": "materialized_excerpt",
  "providerExpansionAllowed": false,
  "expansionScope": "none",
  "reusableAcrossJobs": false,
  "extensions": {}
}
```

The example is deliberately non-normative. Field names and values may change before implementation.

## Field semantics

`schema` identifies the draft fixture family only.

`schemaVersion` is a draft fixture version, not a Model Delegation compatibility level.

`fixtureStage` must remain `draft`.

`contextRefId` is a synthetic placeholder identifier. It is not a capability token, signature or durable handle.

`sourceDomain` and `sourceKind` name where the excerpt came from. Naming a source does not grant the provider access to that source.

`inputClass` classifies the excerpt so policy can evaluate it before context is sent.

`summary`, `freshness` and `maxBytes` describe a bounded, dated excerpt. `maxBytes` keeps the packet small.

`redactionApplied` states that non-public content was redacted before dispatch. A reference marked redacted must not still carry secret material.

`allowedForProvider` states that policy allowed this specific excerpt for this specific job.

`expiresAt` bounds validity to one job window. A reference without an expiry is rejected as unscoped.

`sourceAccessMode` must be `materialized_excerpt`: the reference resolves to a static packet. A `live_read_through` mode - the provider reading the source directly - is a provider read capability and is rejected.

`providerExpansionAllowed` must be `false` and `expansionScope` must stay bounded. A reference the provider can expand into broader memory access is rejected.

`reusableAcrossJobs` must be `false`. A reference reused across jobs is a durable grant and is rejected together with the unscoped case.

`extensions` is optional draft-only metadata. Unknown top-level fields are rejected by default.

## Allowed draft values

Draft context-reference fixtures keep `inputClass` at `private_memory_excerpt`, `redactionApplied` at `true` and `allowedForProvider` at `true`.

Draft context-reference fixtures may use these `sourceAccessMode` values:

```text
materialized_excerpt
live_read_through
```

`materialized_excerpt` is the only accepted mode. `live_read_through` is draft vocabulary for a rejected provider read capability.

These values are draft vocabulary only. They are not final context-reference schema, source access modes or scope grammars.

## Draft rejection reasons

Draft context-reference fixtures may use these rejection reasons:

```text
context_ref_expansion
context_ref_live_source_read
context_ref_unscoped
secret_material
```

`context_ref_expansion` and `context_ref_unscoped` come from ADR 0050. `context_ref_live_source_read` is draft vocabulary for a reference used as a live provider read capability. `secret_material` is the ADR 0050 reason for forbidden secret content.

These values are draft vocabulary only. They are not final conformance error codes.

## Required rejection cases

Draft context-reference fixture checks should reject:

- unknown top-level fields
- missing `fixtureStage: "draft"`
- references the provider can expand into broader memory access
- references whose access mode is a live read-through of the source rather than a materialized excerpt
- references without an expiry
- references with an unbounded scope
- references reusable across multiple jobs
- references that carry key, credential, recovery, payment, domain-key or raw-Vault secret material
- fixtures that omit required draft disclaimers
- fixtures that claim compatibility above draft-only
- fixtures that imply production security or commercial permission

## A context reference is not a provider read capability

A draft context reference resolves to a materialized excerpt prepared under the requester's policy.

It must not:

- let the provider read the source domain directly
- act as a live pointer or query handle into memory
- expand into broader scope than the excerpt
- authorize follow-up reads

The provider receives a value, not a key to memory.

## A context reference is not durable

A draft context reference is valid for one job window.

It must not:

- omit its expiry
- carry an unbounded scope
- be reusable across jobs
- become a standing context grant

Durable or reusable context is a separate, explicit decision, not a property of a single reference.

## A context reference is not a secret carrier

A draft context reference may carry a redacted excerpt.

It must not carry:

- private keys
- domain content keys
- recovery material
- credentials
- payment secrets
- raw Vault exports

A reference that marks redaction applied but still carries a secret marker is rejected.

## Relationship to job envelopes, provider registry and result envelopes

ADR 0049, ADR 0050, ADR 0058 and ADR 0059 keep provider registry entries, job envelopes, context references and result envelopes as separate surfaces.

ADR 0060 narrows only the context-reference surface:

- a job envelope authorizes one scoped job and may reference context; the reference is a value, not a provider capability
- a provider registry entry advertises capability; the reference does not grant it Vault access
- a result envelope reports output; the reference does not survive into follow-up reads

Cross-surface verification behaviour remains future work.

## Relationship to future runtime and verification

Before context references carry security meaning, later ADRs must define:

- context reference resolution to a bounded packet
- redaction verification
- privacy-domain grant semantics
- freshness and expiry enforcement
- scope grammar and enforcement
- forbidden-content scanning
- audit persistence and visibility
- verifier behaviour for expandable, unscoped, live or secret-bearing references
- conformance fixture families for positive and negative context-reference verification

Until then, context-reference fixtures may only prove placeholder boundaries and rejection of unsafe claims.

## Demo boundary

A walking-skeleton demo may reference context-reference placeholders only as visibly unverified fixture data.

The demo must not:

- resolve a real private memory excerpt
- grant a provider live source access
- reuse a reference across jobs
- send unredacted or secret-bearing context
- publish compatibility or security claims

If a demo needs real context resolution, this ADR is insufficient and reviewed privacy-domain, redaction, audit and resolution designs must come first.

## Implementation status

This ADR is documentation and fixture-gate direction only.

The repository does not implement:

- model context references
- context reference resolution
- redaction verification
- privacy-domain grant enforcement
- freshness or scope enforcement
- forbidden-content scanning
- a conformance runner for context-reference verification

## Non-goals

This ADR does not define:

- final context reference schema
- cryptographic algorithms
- redaction algorithms
- privacy-domain grant protocol
- scope grammar
- resolution protocol
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
- `0058-model-delegation-draft-job-envelope-scoping-placeholder.md`
- `0059-model-delegation-draft-result-envelope-provenance-placeholder.md`

It remains below future model-delegation runtime, provider-authentication, privacy-domain, redaction, audit and conformance specifications.

## Consequences

Positive:

- gives the context reference a dedicated draft scoping placeholder boundary
- seeds the missing positive context-reference shape and the still-open reference rejection cases
- makes provider-read-capability, durable-reference, unscoped and secret-carrier interpretations rejectable early

Negative:

- adds more draft fixtures before a runtime exists
- draft fixture fields may need migration when final schemas are selected
- implementers must remember that these fixtures prove no redaction, no privacy-domain enforcement and no resolution
