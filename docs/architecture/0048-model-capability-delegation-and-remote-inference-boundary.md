# 0048 - Model Capability Delegation and Remote Inference Boundary

## Status

Accepted as a model-capability delegation concept before runtime, transport, policy or provider implementation.

Three questions this ADR left open were decided by the user on 2026-08-04 and are recorded under "What may leave the device": local inference first with remote only by consent, only the live turn leaving the device, and one standing revocable provider consent rather than a per-job approval. Registry, job-envelope schema, transport, provider authentication and runtime remain unbuilt.

## Context

Pico may run on devices with very different compute capacity. A phone, browser surface or small appliance may not be able to run a strong local model, while a Pico Home, desktop Pico Vault or another trusted node may have access to a larger local model or a model connector.

This should be possible without turning the stronger node into the owner of the requesting Pico's memory, identity, policies or tools.

Existing architecture already separates the relevant layers:

- ADR 0028 defines Pico Link and relays as transport, not authority.
- ADR 0029 separates Pico identity, device, Home, transport and domain keys.
- ADR 0035 separates Pico, Pico Home, Pico Model, Pico Relay and connectors.
- ADR 0036 defines capabilities above connector protocols.
- ADR 0037 allows model-assisted planning, but keeps policy and execution outside the model.

This ADR defines how a stronger Pico Home or Pico Vault can be treated as a delegated model capability provider.

## Decision

Pico may delegate model inference or planning jobs to a trusted model capability provider when policy, consent and privacy-domain rules allow it.

A model capability provider may be:

- the same local device
- a Pico Home in the same Home
- a stronger Pico Vault on a desktop or server
- another trusted Pico endpoint
- a cloud model connector mediated by a trusted Pico runtime

The provider is a capability provider. It is not the requesting Pico's memory owner, policy authority, identity authority or action executor.

## Core rule

> A stronger Pico node may provide model capability. It must not become memory owner, policy authority or action executor.

## Conceptual flow

```text
requesting Pico / Vault / Surface
-> model job envelope
-> local transport or Pico Link
-> model capability provider
-> result envelope
-> requesting Pico policy and action flow
```

The requesting Pico remains responsible for:

- deciding whether the job may be delegated
- selecting and minimizing context
- evaluating privacy-domain access
- interpreting the result
- applying Pico Rules
- asking for confirmation where required
- executing any approved tool action through its Action Runner
- recording audit and Action History entries

## What may leave the device

Decided by the user on 2026-08-04. These three answers close the part of
this ADR that blocked every consumer of ADR 0116 W1/W2/W3, and they are
recorded here rather than in a new ADR because they refine this ADR's own
boundary rather than replacing it.

### Local first; remote only with consent

Inference runs on hardware the person owns by default. A remote provider
is possible, never automatic, and never selected by availability pressure
- ADR 0118 already forbids failover across provider classes for exactly
that reason, and the same rule holds here: a job that cannot run locally
waits or fails, it does not quietly go elsewhere.

### Only the live turn leaves

A remote job carries what the person is saying now, plus Pico's own
policy. **Retrieved memory does not leave.** If an answer needs
remembered material, the job runs locally or it does not run.

The reasoning is the blast radius, not the sensitivity ranking. Person
content is what the person chose to send this second and knows they sent;
retrieved memory is everything they ever told Pico, selected by a
retrieval step they did not watch. A provider breach that sees one turn
sees a turn. A provider breach that sees assembled context sees the
memory. ADR 0088's reader-custody content sharpens it further: some of it
was written by other people who were never asked.

A consequence worth naming: this decouples the remote-provider question
from ADR 0116's worm question. W5 gates egress whose content derives from
below-threshold context; a job carrying only the person's own words is
not that path. The two boundaries stop being one problem.

### One standing provider consent, revocable, not one per job

The person decides once that a given provider may be used, sees that it
is active, and can withdraw it at any time. There is no per-job prompt.

Two alternatives were considered and refused. Per-job approval over the
ADR 0099 hold channel would misuse a mechanism ADR 0099 binds to
authority-creating signatures - a model job creates no authority - and
would undo ADR 0101's work to reduce approval counts; in a conversational
surface it would also be unusable. Routing every job through Pico Rules
is architecturally the cleanest and stays the destination, but Pico Rules
does not exist, and making the model path wait for it would block this
one behind another large block.

What standing consent must therefore carry: which provider, granted when,
visible while active, and withdrawable without a ceremony. It is a
setting in the ADR 0104 sense - it belongs to Pico, not to host
configuration.

### What is still open

The registry, the job-envelope schema, the transport, provider
authentication and the runtime remain unbuilt. These three decisions
bound them; they do not replace them.

## Model job types

Initial job categories should be explicit and typed. Examples:

```text
model.plan
model.reason
model.summarize
model.extract
model.compare
model.draft
```

Those names are illustrative. Final wire names must follow compatibility and schema rules.

The job type must not imply tool execution. For example, `model.plan` may return a plan or proposal, but it must not place an order, write a file or call Home Assistant by itself.

## Provider capability advertisement

A future model capability provider should advertise metadata such as:

```text
provider_id
provider_node_kind
model_family
model_name_or_class
execution_location
local_or_cloud
context_window
supported_job_types
supported_input_classes
supported_output_schemas
privacy_domain_access
retention_policy
tool_access_allowed
availability
latency_class
cost_class
audit_support
capability_version
```

`tool_access_allowed` should default to false.

The same model capability may have different providers. Policy should evaluate the provider, job type, privacy domain, data class and requested purpose before delegation.

## Model job request envelope

A future request envelope should include at least:

```text
job_id
requester_id
subject_pico_id
job_type
purpose
input_refs
inline_context
redaction_summary
privacy_domain
allowed_data_classes
retention_requirement
tool_policy
output_schema
confirmation_requirement
audit_requirement
expires_at
replay_nonce
```

The exact schema is intentionally not defined here.

`input_refs` may point to scoped context selected by the requester. They must not imply that the provider can browse the whole Vault.

`inline_context` should contain only the minimum data needed for the job.

`tool_policy` should be `none` by default. Any provider-side tool use is a separate delegation and must pass its own policy boundary.

## Result envelope and provenance

A future result envelope should preserve provenance such as:

```text
job_id
provider_id
provider_node_kind
model_family
model_name_or_class
capability_version
input_summary
input_digest_placeholder
result
result_schema
limitations
evidence
created_at
retention_applied
audit_ref
```

`input_digest_placeholder` is only a conceptual placeholder until canonicalization, hashing and signature inputs are defined. It must not be treated as a security or compatibility vector.

Where appropriate, the result should include limitations, uncertainty and evidence references. A result from a strong model is still advice or a draft unless policy promotes it into an approved action flow.

## Privacy boundary

Transport encryption protects packets in transit. It does not hide plaintext from the model execution site.

If a remote or delegated provider runs inference over plaintext, that provider sees the context needed for the job. Therefore:

- delegation requires trust, consent and policy
- context must be minimized and redacted
- privacy-domain grants must be explicit and scoped
- raw Vault dumps must not be sent as model context
- private keys, domain content keys, recovery material and production credentials must not be sent to the model
- provider retention must follow the requester's policy
- prompts and results must not be persisted beyond policy without an explicit audit trail

Future confidential-compute or encrypted-inference designs may reduce provider visibility, but they are outside this ADR.

## Authority boundary

A delegated model may return analysis, extracted data, comparisons, drafts, plans or proposed actions.

It must not directly:

- override Pico Rules
- bypass confirmation
- execute Home Assistant services
- call connectors as the requesting Pico
- write memory
- mutate identity, membership or domain-key state
- authorize another provider
- claim compatibility or security certification

If a model provider also has local tools, those tools remain separate capabilities. Using them requires a separate policy decision, confirmation where needed and Action History entry.

## Trust relationships

Same-device model execution is the simplest trust shape.

Same-Home model execution may later use Home membership, device identity and privacy-domain grants. A Pico Home may host the model runtime, but hosting does not give it automatic access to resident private domains.

Cross-Home or peer Vault execution requires an explicit relationship, provider identity, device credential, purpose and revocable domain grant before sensitive context is sent.

Relay delivery remains transport. A Pico Relay must not see plaintext or become a model provider merely because it forwards a job.

## Policy and consent

Delegation policy should evaluate at least:

- who requested the job
- which Pico subject the job concerns
- which provider will run it
- whether execution is local, same-Home, peer or cloud-mediated
- which privacy domains and data classes are included
- whether the job can affect external actions
- retention and audit requirements
- whether user confirmation is required before sending context

High-risk, sensitive, financial, contractual, safety-sensitive or external-write planning should default to explicit confirmation before both context delegation and any later action execution.

## Non-goals

This ADR does not implement:

- a model runner
- a provider registry
- model discovery
- final model job schemas
- prompt format
- encrypted inference
- confidential computing
- Home membership grants
- domain decryption
- Pico Link transport
- provider authentication
- MCP or connector execution
- cloud model contracts
- conformance fixtures

It also does not choose a specific LLM, local runtime or cloud provider.

## Implementation implications

Future implementation may add structures such as:

```text
model_capability
model_provider
model_provider_health
model_job
model_job_context_ref
model_job_result
model_job_policy_decision
model_delegation_grant
model_delegation_audit_entry
```

The first implementation should prefer conservative jobs such as `model.summarize`, `model.extract` or `model.draft` over autonomous planning for external actions.

Planning jobs that prepare actions should feed into the existing delegation pattern:

```text
delegate model planning
-> receive proposal
-> evaluate Pico Rules
-> ask where required
-> execute through Action Runner
-> record Action History
```

## Relationship to other ADRs

This ADR extends and constrains:

- `0010-tool-policy-and-executor-model.md`
- `0011-privacy-security-and-audit-model.md`
- `0015-full-clients-light-clients-and-relay.md`
- `0028-pico-link-transport-facade-and-relay-network.md`
- `0029-identity-device-home-keys-and-e2e-boundaries.md`
- `0035-pico-as-digital-companion-and-twin-model.md`
- `0036-capabilities-connectors-and-mcp-boundary.md`
- `0037-proactive-companion-delegation-and-procurement.md`

It remains below future policy, provider registry, Pico Link, privacy-domain, audit, canonicalization and conformance specifications.

## Consequences

Positive:

- allows weak Pico clients to use stronger local or trusted model runtimes
- keeps model compute separate from memory ownership and action authority
- supports local-first deployments with a strong desktop or Home node
- gives future planning requests a clear privacy and audit boundary
- allows cloud models only as mediated capabilities rather than implicit authorities

Negative:

- delegated inference increases privacy risk because the provider sees job context
- provider discovery, trust, consent, retention and audit add implementation complexity
- cross-Home model delegation needs identity and domain-grant work first
- results need provenance and uncertainty handling before users can rely on them
- tool use by a model provider requires a second policy boundary
