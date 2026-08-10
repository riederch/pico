# 0142 - A Provider Entry States What One Host Was Measured to Do

## Status

Accepted as the provider entry contract for delegated model execution, filling
what ADR 0049 named and ADR 0061 reserved a placeholder shape for. **PE1-PE6
are open** and nothing is implemented.

Accepted on 2026-08-10, the day the first reachable local inference host was
measured; the numbers this ADR is built on are in "Context" together with the
hardware they were taken on. Two questions stay open under "Questions this ADR
does not decide" and are deliberately left to the user, because both are
boundary decisions rather than engineering ones.

## Context

ADR 0048 decided what may leave the device and ADR 0049 decided that a
registry entry is not a trust grant. ADR 0061 reserved a draft entry shape.
None of them could say what a real entry contains, because there was nothing
to describe: ADR 0118's own status text records that O2 "is not enforced
against anything real, because no model provider exists."

**One now does.** A single-GPU Linux host on the home LAN runs Ollama 0.32.7
serving one model, `mistral-small:latest` (23.6B, Q4_K_M, Apache-2.0), on an
NVIDIA RTX 4060 Ti with 15.3 GiB usable, `q8_0` KV cache and flash attention
enabled. It was measured rather than asked, and the measurements are what this
ADR is built on:

| Measured | Value |
|---|---|
| Weights resident | 13.35 GiB, leaving 1.95 GiB for KV cache and buffers |
| Generation at 4k / 8k context | 18.4 / 17.8 tok/s |
| Generation at 16k / 24k / 27k context | 13.4 / 8.0 / 5.1 tok/s |
| Prompt evaluation | 1152 tok/s at 4k, falling to 707 tok/s at 27k |
| Concurrency | one lane; a second job waits its full turn at unchanged speed |
| Cold load / reload after idle | 31 s first load, 8 s reload, `keep_alive` 5m |
| Nominal context | 32768, served at 8192 |
| Capabilities | `completion`, `tools`; tool calls and JSON-schema-constrained output both verified |
| Reachability | `0.0.0.0:11434`, no authentication of any kind |

Three of these rows contradict what the host advertises about itself, and that
contradiction is the whole reason this ADR exists.

**The nominal context is not the usable one.** The model declares 32768 and
the runtime will load it. At 27k of actual context generation collapses to
5.1 tok/s - a quarter of its short-context speed - because the weights already
occupy all but 1.95 GiB of the card. There is no cliff to detect at runtime,
only a slope. An entry that copied 32768 out of the model metadata would be
accurate about the model and wrong about the deployment.

**The advertised access control is not access control.** `OLLAMA_ORIGINS` is
configured to a localhost-only list and looks like an allowlist. It is CORS:
a request carrying `Origin: http://evil.example` is refused with 403, and a
request carrying no `Origin` header at all is answered with 200. Every
measurement above was taken across the LAN without one. It stops a browser
drive-by and stops nothing else. Meanwhile `/api/pull` and `/api/create`
answer unauthenticated POSTs, so anyone who can reach the port can replace
the model underneath Pico.

**Availability is not binary here.** ADR 0118 O2 already rules that a provider
which answers slowly is unavailable rather than slow. On this host the same
provider is genuinely fast (18 tok/s), genuinely slow (5 tok/s) or genuinely
absent (8-31 s of load) depending on nothing the caller can see.

One thing the host gets right is worth recording: `OLLAMA_NO_CLOUD` is true,
which makes the cloud passthrough structurally absent rather than merely
unused. That is the posture ADR 0118 O2 asks for, arriving as a property
instead of a promise.

## Scope

Covers: what a model provider registry entry must contain before Pico may
select it; where its capacity numbers come from; how concurrency, residency
and model identity are expressed; and what makes an endpoint ineligible to
be an entry at all.

Does not cover:

- the job envelope, the result envelope and context references, which
  ADR 0049 with ADR 0058, ADR 0059 and ADR 0060 already narrow;
- standing provider consent, which ADR 0048 decided on 2026-08-04;
- the planner and reader roles themselves, which are ADR 0117's;
- the job-queue runtime, which nothing here implements;
- model quality, safety or prompt-injection resistance, which ADR 0050
  forbids a fixture to claim and which this ADR does not claim either.

## Decision

### An entry describes a host, not a model

A registry entry is the description of one deployment: this model, at this
version, on this hardware, behind this reach. The same model file on a
different card is a different entry, because every number that matters to a
caller changed. ADR 0061's `model.family` and `model.nameOrClass` stay what
they are - a way to say what is running - and stop being the identity of the
thing.

This is why the entry cannot be derived from model metadata, and why it
cannot be written once and copied between installations.

### Every capacity number in an entry is measured

`limits.maxContextBytes` and the latency fields carry values that were
observed on the host they describe, not values the model reports about
itself. For the measured host that means the entry states **8192**, and the
32768 the model would accept is recorded, if at all, as a ceiling that was
deliberately not taken.

**A number nobody measured does not go in.** The alternative is an entry
that reads as a specification and behaves as a guess, which is the failure
ADR 0135 names for documents and which is worse here, because a policy layer
above will make decisions from it.

This binds ADR 0116 W3 harder than it may look. Origin-labeled, line-quoted
blocks are verbose by construction, and the protocol's own
`maxPicoModelContextTotalChars` of 4 MiB is three orders of magnitude beyond
what this host can hold. That constant is an abuse ceiling. The entry is the
real budget, and the assembly step is the consumer that has to respect it.

### A provider has one lane until it proves otherwise

Concurrency is a declared property of the entry and its default is one. The
measured host runs `OLLAMA_NUM_PARALLEL=1`: two jobs submitted together both
run at full speed, and the second one simply starts after the first ends.

The consequence lands on ADR 0117 and should be stated where it will be read.
The planner and the quarantined reader are two roles, and on a one-lane
provider they are **two sequential jobs, not two conversations**. Nothing
about the split requires otherwise - the separation is context and schema,
never process - but a runtime that assumes it can hold both open at once will
be wrong on the first provider Pico ever has. A second model cannot be
resident beside the first either: 13.35 of 15.3 GiB are gone.

### Residency is part of availability

The entry declares a warm-up cost, and ADR 0118 O2's absence threshold for
that provider must exceed it. Otherwise the first job after any idle period
reads as unavailable, and the person is told there is no model when there is
one loading.

Two rules follow that are easy to get backwards. A provider that is loading
is **not** a reason to reach for a different one - O2's ban on failover
across provider classes holds exactly here, where the pressure is highest and
the excuse is best. And a host that pays to keep the model resident is making
a legitimate choice that the entry should be able to express, rather than one
Pico works around by lowering a timeout.

### An endpoint that cannot be authenticated is not an entry

Provider authentication is listed as missing in ADR 0049. This ADR makes
its absence disqualifying rather than pending: **an endpoint Pico reaches
without proving who it is does not become a registry entry.**

The reach and its credential belong to Pico under core custody, on
ADR 0138 CO1's reasoning and ADR 0104's rule. A provider endpoint is a
decision a person makes about their own Pico; it is not a host configuration
value and not an environment variable, and it must not become a fourth entry
on ADR 0104's debt list beside `memory_encryption` and
`pico_foundation_token`.

For the measured host this is satisfiable without changing Pico: bind the
runtime to loopback and put an authenticating reverse proxy in front of it.
What it is not satisfiable by is the CORS allowlist that currently looks like
it would do.

### The entry pins the model, and a mismatch refuses

The entry records the model digest - the measured host exposes
`sha256:8039dd90…` over its tags endpoint - and a job whose provider answers
with a different one is refused rather than served.

The reason is not tamper-detection in the abstract. It is that the same
endpoint that serves inference also accepts unauthenticated `pull` and
`create`, so the model behind a stable name is mutable by anyone who can
reach the port. Pinning turns a silent substitution into a refusal, which is
what ADR 0122 does for artifacts Pico installs and what an entry should do
for a model Pico consults. It also makes the capacity numbers honest: they
were measured against one digest, and they do not survive its replacement.

## Rejected alternatives

**Declare the nominal context because the model supports it.** Refused. It is
true and useless. A caller that fills 32k gets a fifth of the throughput and
no signal that it did anything wrong.

**Treat the CORS allowlist as the access boundary.** Refused on measurement:
requests without an `Origin` header pass. An allowlist that a curl bypasses
is not a boundary, and one that looks like a boundary is worse than none,
because it stops the question from being asked.

**Let availability select the provider.** Refused, and this is ADR 0118 O2
rather than a new decision. A loading provider is absent, and absence is
stated rather than routed around.

**Put the endpoint and its token in host configuration.** Refused on
ADR 0104's rule and ADR 0138 CO1's application of it. Convenient, and it
would make the person's decision about their own Pico into a deployment
detail they cannot see or withdraw.

**Wait for the runtime before writing the entry.** Refused. The entry is what
the runtime is built against, and the measurements exist now. ADR 0118 O2 has
been unenforceable against anything real since it was accepted; this is the
first chance to change that, and it does not require the queue to exist.

## Gates

- **PE1 - An entry describes one deployment (open):** provider identity is
  the pair of a model at a version and the host serving it; no entry is
  derived from model metadata alone, and none is portable between
  installations without re-measurement.
- **PE2 - Capacity is measured, not advertised (open):** context limit and
  latency fields carry observed values with the date and hardware they were
  observed on; an entry with an unmeasured capacity number is refused by the
  check that reads it, and ADR 0116 W3's assembly respects the entry's budget
  rather than the protocol's abuse ceiling.
- **PE3 - Concurrency is declared and defaults to one (open):** an entry
  states its lanes; a runtime scheduling more concurrent jobs than the entry
  declares is a defect, and the ADR 0117 planner and reader are sequenced on
  a one-lane provider rather than assumed simultaneous.
- **PE4 - Warm-up is part of the availability contract (open):** the entry
  declares a residency cost, O2's absence threshold for that provider exceeds
  it, a loading provider reports as absent rather than slow, and no absence
  selects a different provider class.
- **PE5 - Unauthenticated reach is not a provider (open):** Pico proves who
  it is before a job is sent; the credential is held under core custody and
  is never a host configuration value, an environment variable or a file
  beside the endpoint; an endpoint that offers no authentication cannot hold
  a registry entry, whatever else it advertises.
- **PE6 - The model is pinned (open):** the entry records the model digest, a
  provider answering under a different one is refused rather than used, and
  the refusal names substitution rather than presenting as an outage.

## Failure ledger

| Situation | Posture |
|---|---|
| A caller fills 27k of a 32k-capable model | Cannot happen: the entry states 8192 and assembly respects it (PE2). |
| The entry was copied from another machine | Refused. Capacity numbers name the hardware they were measured on (PE1, PE2). |
| Planner and reader are both due in one turn | Two sequential jobs on a one-lane provider. Latency adds; neither role is weakened (PE3). |
| The model unloaded after 5 minutes idle | The next job waits out the declared warm-up. Below that threshold it is absent, not slow (PE4). |
| A provider is loading and a second one is reachable | The job fails as unavailable. Availability pressure does not select a privacy posture (PE4, ADR 0118 O2). |
| Someone on the LAN pushes a different model under the same tag | The digest mismatches and the job is refused, named as substitution (PE6). |
| The endpoint has no authentication | It is not a provider. There is no entry to select, so no job is sent (PE5). |
| The endpoint is behind an authenticating proxy | Eligible. The credential lives under core custody, not in the environment (PE5, ADR 0104). |
| A browser-origin allowlist is present | Irrelevant to this gate. It governs browsers; PE5 governs Pico. |
| The provider can reach a cloud model | Out of scope for the entry and governed by ADR 0048's consent decision. The measured host disables it structurally, which is a property worth recording. |
| The model answers with prose where a schema was demanded | ADR 0117 X2's parse refuses it. The entry claims capability, never obedience (ADR 0050). |

## Questions this ADR does not decide

**What provider class is a bare inference host on the home LAN?** ADR 0048
lists five: the same device, a Pico Home in the same Home, a stronger Pico
Vault, another trusted Pico endpoint, and a mediated cloud connector. The
measured host is none of them - it runs no Pico. The answer decides two
things at once: whether ADR 0118 O2's no-failover rule can be evaluated for
it at all, and whether ADR 0048's "only the live turn leaves" applies, which
is the difference between a job that may carry retrieved memory and one that
may not. **This is a boundary decision and belongs to the user.**

**Is 23.6B the right trade on 16 GiB?** The weights leave 1.95 GiB, which is
what caps context at a usable 8k. A smaller model would invert the trade -
more context, possibly two lanes, less capability per token. The near-term
delegable job is ADR 0117's quarantined read, which is extraction under a
schema rather than reasoning. Nothing here answers it, and nothing should
until a second model has been measured on the same host.

## Consequences

Positive:

- ADR 0118 O2 becomes enforceable against something real for the first time
  since it was accepted;
- ADR 0061's reserved placeholder gains the fields a real entry needs, so the
  first implementation extends a shape rather than inventing one;
- the gap between what a model advertises and what a host delivers is closed
  in the entry, where one reader can see both, instead of inside a runtime
  where it would surface as unexplained slowness;
- PE5 keeps the first provider from arriving the way the first credential
  almost did, as an environment variable nobody decided;
- ADR 0117's split gets a scheduling fact before a runtime assumes the
  opposite one.

Negative and residual:

- measurement is now a step in adding a provider, which is friction, and a
  wrong measurement produces a confident wrong entry - the check can see that
  a number is missing, never that it is stale;
- pinning a digest means a routine model update requires a deliberate
  re-entry, and the temptation will be to loosen exactly this gate;
- PE5 disqualifies the endpoint as it stands today, so the first provider
  needs infrastructure work before any of this can be exercised;
- one lane makes latency additive across the planner and reader roles, and
  no amount of contract work makes that faster;
- the entry still says nothing about what the model is good at. Capability
  fields describe interfaces - tools, schemas, context - and ADR 0050 is
  right that a fixture must not claim quality. Selecting the right provider
  for a job on anything but interface remains undecided.

## Relationship to other ADRs

- Fills what ADR `0049` named and ADR `0061` reserved: the registry entry
  gains required fields, and advertisement still grants nothing.
- Keeps ADR `0048`'s boundary intact and leaves its provider-class list
  untouched; the open question above asks the user to extend it, not this
  ADR to assume it.
- Makes ADR `0118` O2 evaluable: warm-up is declared, absence has a
  threshold, and the no-failover rule finally has a provider to hold against.
- Constrains ADR `0116` W3's assembly by a measured budget rather than by the
  protocol's abuse ceiling.
- Gives ADR `0117`'s planner-reader split its first scheduling fact: on a
  one-lane provider the roles sequence.
- Applies ADR `0104`'s rule and ADR `0138` CO1's custody posture to a
  provider endpoint and its credential.
- Borrows ADR `0122`'s refusal-on-mismatch posture for a model Pico consults
  rather than an artifact Pico installs.
- Claims no model property, per ADR `0050`.

## References

- [ADR 0048](0048-model-capability-delegation-and-remote-inference-boundary.md)
- [ADR 0049](0049-model-provider-registry-and-job-envelope.md)
- [ADR 0050](0050-model-delegation-draft-fixture-gate.md)
- [ADR 0061](0061-model-delegation-draft-provider-registry-advertisement-placeholder.md)
- [ADR 0104](0104-settings-belong-to-pico-not-to-host-configuration.md)
- [ADR 0116](0116-untrusted-content-and-self-replicating-prompt-threat-model-and-hardening-gates.md)
- [ADR 0117](0117-planner-reader-split-and-origin-aware-data-flow-policy.md)
- [ADR 0118](0118-offline-and-model-free-degradation-contract.md)
- [ADR 0122](0122-update-and-release-integrity-threat-model-and-hardening-gates.md)
- [ADR 0135](0135-a-specification-a-consumer-cannot-read-is-not-a-specification.md)
- [ADR 0138](0138-reaching-outside-costs-something-and-is-off-until-someone-says-so.md)
</content>
</invoke>
