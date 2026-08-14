# 0142 - A Provider Entry States What One Host Was Measured to Do

## Status

Status note, 2026-08-13, decided by the user: **the entry this ADR describes
is now `qwen3:14b`, not `mistral-small`.** The measurement tables under
"Context" keep their wording under ADR 0128's record rule - they are what was
observed on 2026-08-10 and stay observed - but the deployment this ADR is
written against has changed, and PE1 means that is a different entry rather
than an edited one.

| | mistral-small 23.6B | qwen3:14b |
|---|---|---|
| Weights | 13.35 GiB | 8.64 GiB |
| Window that costs nothing | 12288 | **40960**, its whole declared window |
| Generation at 8192 | 17.6 tok/s | **26.3** |
| Prompt evaluation at 8192 | 1121 tok/s | **1576** |
| Load after eviction | 6.1 s | 4.9 s |
| Lanes | one | one |

Three and a third times the usable context at one and a half times the speed,
because the smaller weights leave room the larger ones took. **ADR 0116 W3's
assembly budget moves with it**: what an assembly may spend here is 40960
tokens rather than 8192, and it is the first time that number has come from a
walk rather than from a guess.

Unchanged by the switch: the reach is still unauthenticated, so ADR 0151 PV1
still gives this entry `live_turn` and nothing wider. PE6's digest is
re-pinned to the new model, and the old pin does not carry over - a digest
identifies weights, not a slot in a registry.

**Claims nothing about quality.** ADR 0050 forbids it and nothing here
measured it. This is a decision about capacity and speed on one card, taken
knowing that; whether the smaller model is good enough at ADR 0117 X4's
schema-constrained read is answerable only once that job exists.

**One thing this ADR did not have to say before, and now does.** Both models
stay installed on the host, which makes them two deployments and therefore two
entries - and 15.3 GiB does not hold 13.35 plus 8.64, so **selecting the
second evicts the first**. Two entries on one accelerator are not two
providers: they are one provider with a five-second cost to change its mind.
ADR 0118 O2 permits failover between them, since they share a class; what O2
does not know is that using one makes the other absent for as long as it takes
to load. Whatever schedules jobs will have to.

**Open, and not decided here.** `qwen3:14b` declares `thinking` among its
capabilities and emits reasoning tokens before answering. For throughput that
is neutral - a token is a token - and for a schema-constrained read it is
window and latency spent before the answer starts. Ollama can turn it off per
request. Whether Pico should is a question for the job, not for the entry.

Status note, 2026-08-13, second run, **superseding the paragraph it
replaces**: the declared window costs throughput **only once the weights plus
its preallocated KV cache stop fitting on the accelerator**, and costs
nothing at all below that. An earlier version of this note said it was "a
price every job pays", which was drawn from one model on a card it barely
fits on. Two more models on the same host pay nothing for five times the
window.

With the prompt held constant and each model alone on the card:

| Declared window | KV preallocated | Weights + KV | Generation |
|---|---|---|---|
| 4096 | 0.31 GiB | 13.66 GiB | 18.2 tok/s |
| 8192 | 0.62 GiB | 13.97 GiB | 18.2 tok/s |
| 12288 | 0.94 GiB | 14.29 GiB | 18.2 tok/s |
| 16384 | 1.25 GiB | 14.60 GiB | 15.5 tok/s |
| 24576 | 1.88 GiB | 15.22 GiB | 12.1 tok/s |
| 32768 | 2.50 GiB | 15.85 GiB | 9.9 tok/s |

**So this ADR's 8192 leaves half a window unused.** 12288 costs exactly the
same and was found by walking rather than reasoning. The usable budget is
about 14.3 GiB where the card is 15.3: roughly a gigabyte goes to compute
buffers and the driver's own context, which is in no spec sheet and is why
the figure has to be walked. The measurer walks it now, and an entry states
the widest window that costs nothing rather than the widest step somebody
thought to try.

The rule predicts the other two deployments measured the same day. A 14.8B
model at 8.64 GiB has room for 74,000 tokens of KV and pays nothing for its
declared 40960; an 8.2B model at 4.87 GiB has room for 137,000 and pays
nothing either. Both measured at 0%.

**A cliff was predicted from arithmetic and is not where it was predicted.**
One token of `q8_0` KV costs 80 KiB here, so the 1.95 GiB nominally left
beside the weights would run out near 25,500 tokens - close enough to the 27k
in the table above to look like a confirmation. It is not: the fall starts at
16384. The arithmetic is right about the shape and wrong about the budget,
which is exactly the difference between a number reasoned and a number
measured, and is this ADR's own PE2 turned on the ADR.

`size_vram` on `/api/ps` does not move either: it tracks the weights and not
the cache, so a probe reading it detects nothing. This ADR's
"no runtime-detectable cliff" holds for anything a caller can query. A
stopwatch finds it.

**One more finding, about method rather than about this host.** Measuring
three models in a row with a five-minute keep-alive left the first resident
while the second loaded, and 15.3 GiB does not hold 13.35 plus 8.64. The
second model reported 3.4 tok/s at a narrow window and 28.2 at a wide one -
faster with more work, which is impossible and was the tell. **A deployment
sharing its accelerator is a different deployment**, which is PE1 said in
hardware; the measurer now takes the card before it measures and says so when
a foreign model appears mid-run.

Status note, 2026-08-13: **the host was measured again, by code this time, and
the numbers hold.** Generation came in at 18.2 and 17.7 tok/s against the 18.4
and 17.8 recorded here, prompt evaluation at 1145 tok/s against 1152, one
lane with two jobs taking 1.97x one job, 13.35 GiB resident, `completion` and
`tools`, and a model still declaring 32768 while serving 8192. Three days
and a different method, and the table stands.

**The residency row does not, and the reason is worth more than the row.** The
run observed 5.97 s where this ADR records 31 s. A model is in one of three
states, not two: resident, evicted with its weights in the host page cache, or
evicted with a cold disk. Only the first two are reachable from the network
side - dropping a page cache needs root on the host - so a measurer states
the *floor* of a load and never its worst case. The 31 s here was a disk-cold
read; 5.97 s is the same operation with the file cached, and the 8 s "reload"
recorded here is that same case measured on a slower day. A request while the
model is still resident reports 0.3 s, which is not a load at all and was
briefly recorded as one before the third state was noticed.

This matters beyond bookkeeping: **ADR 0118 O2's absence threshold has to
clear the worst case, and that is the one nobody can measure remotely.**
Whether PE4's field means the floor a measurer can prove or the ceiling a
person states is not decided here.

Two more findings from writing the measurer, both about method rather than
about this host. Changing `num_ctx` makes the host reload, so an unwarmed
baseline carries a load the run after it does not - which read as two lanes on
a host that has one. And `num_predict` is a ceiling rather than a target: a
prompt ending "answer with the single word: ok" produced two tokens and a
32 tok/s figure that was startup cost wearing the shape of a throughput. Both
are now refused by the code that found them.

Status note, 2026-08-13: **PE5 is amended by ADR 0151.** Unauthenticated
reach no longer disqualifies an entry outright; it disqualifies the entry
from carrying retrieved memory, and a credential its transport does not
protect disqualifies the entry entirely. PE6 is unchanged and now binds
both allowances. The rest of this ADR stands as written, including the
measurements PE5 was drawn from - they are the reason the narrower
allowance is narrow.

Accepted as the provider entry contract for delegated model execution, filling
what ADR 0049 named and ADR 0061 reserved a placeholder shape for. **PE1-PE6
are open** and nothing is implemented.

Accepted on 2026-08-10, the day the first reachable local inference host was
measured; the numbers this ADR is built on are in "Context" together with the
hardware they were taken on. Two questions stay open under "Questions this ADR
does not decide" and are deliberately left to the user, because both are
boundary decisions rather than engineering ones.

Status note, 2026-08-11: **a hosted model API - Anthropic, Mistral Cloud - as
a provider needs no new ADR, and this text keeps its wording under ADR 0128's
record rule.** ADR 0048's fifth class already covers it as "a cloud model
connector mediated by a trusted Pico runtime", where Pico's core is that
runtime, and PE1-PE6 is the entry contract it would have to satisfy. What
follows is what this ADR does *not* say about that class, recorded because
every number above was taken on one machine on a home LAN and four gates
assume a machine.

**ADR 0048's egress rule has no answer for the nearest delegable job, and this
is the sharpest of the five.** This ADR names ADR 0117's quarantined read as
the near-term job. ADR 0048 splits what may leave into two: the live turn,
which may, and retrieved memory, which may not. A quarantined excerpt from a
library or a bridge is **neither** - it is not what the person is saying now,
and it is not assembled from what they told Pico. On the measured host the
question never arises, because nothing leaves the device. On a hosted API it
is the first question, and the answer decides whether this class has a job at
all. **A boundary decision, and the user's**, alongside the two already
recorded below.

**PE2 has no satisfiable form for this class.** The gate exists because a
nominal 32768 became a usable 8192 on a card whose weights left 1.95 GiB, and
the fix was to measure the deployment. A hosted API has no deployment to
measure: what an observation records is one tenant at one hour, and PE1's
"no entry is portable between installations without re-measurement" has
nothing to refer to. The note states the gap rather than loosening the gate or
inventing a second one.

**PE6's digest does not exist there, and it fails with PE2 rather than beside
it.** A hosted API offers a model name, and a name is an alias a vendor may
move - substitution behind a stable label is normal operation there, where on
the measured host it was the attack PE6 was written against. The gate's second
reason goes with it: the capacity numbers were honest because they were
measured against one digest, and this class has neither.

**PE4 describes warm-up, and a hosted API is throttled rather than loading.**
It has no residency cost and no reload; it has rate limits and overload
responses. ADR 0118 O2 knows slow-is-absent, and throttled is a third state
this ADR did not have to name. What transfers unchanged is the harder half: a
throttled provider is no more a reason to reach for another one than a loading
one is.

**PE5 is the one place this class is the easy case.** The measured host does
not satisfy it today - its CORS list is not access control - while a hosted
API authenticates by construction. The credential still belongs under core
custody on ADR 0138 CO1 and ADR 0104, and is still not an environment
variable. PE3 is merely conservative there rather than wrong: a hosted API has
many lanes, and declaring one costs latency, not correctness.

One thing this note does not touch: ADR 0048's "local first, remote only by
consent, never selected by availability pressure" holds without
qualification. A hosted API can never be the default and can never stand in
while the local host loads.

Second status note, 2026-08-11, later the same day: **the first of the two
questions below is answered and the section keeps its wording** under
ADR 0128's record rule. The user decided that a bare inference host on the
home LAN is a sixth provider class - "an inference host the same person
controls, running no Pico" - and that retrieved memory may reach it. It is
recorded in ADR 0048 under "A host the person controls is not a remote
provider", beside the three 2026-08-04 answers, because it refines that ADR's
own boundary. The second question, whether 23.6B is the right trade on 16 GiB,
stays open and stays the user's.

Two consequences land on this ADR rather than on ADR 0048. **PE6 stops being
prudence and becomes the condition of that class**: the unauthenticated
`pull` and `create` measured in "Context" turn from a quality problem into an
exfiltration path once a job carries retrieved memory, and the digest pin is
what closes it. **PE5 is not relaxed by control**: a host the person owns
still proves who it is before a job is sent, because controlling a machine
states who may reach it and not that Pico checked.

It also narrows the egress gap named above rather than closing it. For the
sixth class the question is moot - if retrieved memory may go, a quarantined
excerpt may. For the fifth it stands exactly as written: a hosted API and
ADR 0117's X4 read job still have no rule that covers them.

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

**Status of PE1-PE6, audited against the code on 2026-08-14.** They were
written before the provider existed and never revisited after it shipped on
2026-08-13; five of the six were built with the entry contract and the
runtime, and one is narrower in practice than its text. A gate that says
"open" about something that is built hides what is actually left, which is the
same harm as one that claims something that is not.

- **PE1 - An entry describes one deployment (implemented 2026-08-13):**
  `parsePicoModelProviderEntry` takes the model identity and the reach as one
  record and refuses an entry whose measurement does not name the deployment it
  was taken on. Nothing derives an entry from model metadata.
- **PE2 - Capacity is measured, not advertised (implemented 2026-08-13):** the
  measurement carries `measuredAt` and the observed figures, `scripts/measure-
  model-provider.ts` is the only thing that writes one, and ADR 0116 W3's
  assembly is bounded by the entry rather than by the protocol ceiling. The
  surfaces show the date beside the numbers (ADR 0152 SE7), because a figure
  without one is an advertisement again.
- **PE3 - Concurrency is declared and defaults to one (implemented 2026-08-14;
  the audit found it half-built):** the entry stated `concurrentJobs` and
  nothing read it. `PicoModelProviderLanes` serialised one job per entry
  whatever the entry said, and the sweep took one job per tick - so a two-lane
  provider drained exactly like a one-lane one, and the measured number was
  stored, shown and used by nothing.

  Both halves now use it. The lanes are counted permits with the entry's number
  as the ceiling, releasing waiters in arrival order and freeing a lane
  whichever way its job went; the sweep fills that entry's lanes from that
  entry's queue. Another provider's waiting job cannot join, or the lane count
  would depend on what else happens to be queued.
- **PE4 - Warm-up is part of the availability contract (implemented
  2026-08-13):** `picoModelJobDeadlineMs` is built from the entry's declared
  residency plus its measured throughput, so a first job after an idle spell is
  not reported as absent for taking as long as the entry says it takes. Nothing
  fails over between classes, because nothing fails over at all - the queue
  refuses to choose among several decided entries rather than picking one.
- **PE5 - Unauthenticated reach is not a provider (implemented as ADR 0151
  amended it):** the reach is `http:` or `https:` and carries no credential;
  a credential over an unprotected transport does not parse; an entry without
  one is valid and carries the live turn only. See ADR 0151 PV1-PV5.
- **PE6 - The model is pinned (implemented 2026-08-13):** the entry records the
  digest, `assertMeasuredModel` asks the host what it is serving before any
  words leave, and a mismatch refuses as `model_is_not_the_measured_one`. Since
  2026-08-14 it also reaches the person as its own state - a sentence about
  re-pinning rather than an outage (ADR 0152 SE5).

  Original gate text follows.

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
- [ADR 0128](0128-home-assistant-is-a-host-not-a-frame-and-the-effect-bearing-module.md)
- [ADR 0135](0135-a-specification-a-consumer-cannot-read-is-not-a-specification.md)
- [ADR 0138](0138-reaching-outside-costs-something-and-is-off-until-someone-says-so.md)
</content>
</invoke>
