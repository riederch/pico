# 0151 - A provider proves who it is, or carries only the live turn

## Status

Status note, 2026-08-16: **PV1's allowance stops at `own_pico`, not above
it.** A derivation from the person's own notes stays on the live turn.

Found by using it. A person asked their Home where they parked, kept the
answer, and asked a follow-up over the same domain - and got
`entry_may_not_carry_these_words`. Nothing foreign had entered. The kept
answer was Pico's own sentence about their own note, and that alone moved the
next question onto a provider that had to prove who it is.

The cause was one constant answering two questions. ADR 0116 W3's instruction
threshold is `person_present`, because output produced from a context that
held untrusted content may never instruct - that is the rule that breaks
memory laundering, and it has not moved. The allowance asks something else:
whose words a second party would learn. A summary of somebody's own notes is
their own words, and the provider that would receive it is, in the ordinary
case, the one that wrote it.

So there are two constants now, `picoInstructionThresholdOriginClass` and
`picoOwnDerivationOriginClass`, and the second is one step lower. Below it
nothing changed: a housemate's note, a synced item and a stranger's mail
carry words their author never offered to a provider, which is what ADR 0048's
split protects.

**One residual, and it is the interesting half.** A memory item with no
recorded origin used to be read as `own_pico` on the reasoning that the
conservative label costs the wider allowance rather than a wrong one. That
reasoning has just been inverted: unlabelled material would now travel to an
unproven provider on the strength of a guess. Such an item is read as
`unattributed` instead - the class that says exactly what is known about it,
and the one that still needs a proof.

Status note, 2026-08-14: **PV5 checks the transport and cannot check the far
side, which a real proxy made visible on the first try.** A TLS endpoint was
put in front of the measured host, with a valid chain, and it answered a
randomly generated bearer token exactly as it answered no token at all. An
entry pointed at it would pass every rule here and still say a provider
proved who it is when nothing was proved.

Nothing in a parser can close that: whether the far side reads a credential
is not a property of the entry. **A measurement can, and it costs one
request** - send a credential that cannot be right and see whether the host
refuses it. The measurer does that now and records
`refusesAWrongCredential`, with a note when the answer is no. PV5 is
unchanged; what changed is that an entry can be wrong in a way PV5 was never
able to see, and the measurement says so out loud instead.

Accepted 2026-08-13. **That day's "concept-only, no registry, job queue or
provider runtime exists" stopped being true within it**, and the sentence is
corrected rather than removed: PV1, PV2, PV4 and PV5 are enforced by the
entry parser, PV3 by the job it travels with, and all five now refuse real
requests against a real host. What is still absent is a scheduler - nothing
decides on its own that a job should run.

Decided because Ollama is a model provider in this project, with
authentication **optional**, and it currently runs on the home LAN. That
sentence is compatible with almost everything already decided and
incompatible with one line: ADR 0142 PE5 says unauthenticated reach is
disqualifying rather than pending. This resolves that line rather than
deleting it, and narrows what ADR 0048's sixth class grants when the proof
is absent.

Amends ADR 0142 PE5 and the conditions of ADR 0048's sixth provider class.
Both carry a status note pointing here.

## Context

ADR 0142 measured the only provider that exists: a LAN host running Ollama,
bound to `0.0.0.0:11434`, with no authentication of any kind. Its
`OLLAMA_ORIGINS` allowlist is CORS and not access control - a request
carrying `Origin: http://evil.example` is refused, a request carrying no
`Origin` header at all is answered - and the same port answers
unauthenticated `pull` and `create`, so anyone who can reach it can replace
the model underneath Pico.

On that evidence PE5 ruled such an endpoint **ineligible to be an entry**,
and ADR 0048 admitted the host as a sixth provider class - the one retrieved
memory may reach - while saying explicitly that PE5 was not relaxed by it.

The result is a rule with no provider under it. Pico has no model access at
all, ADR 0118 O2 has nothing real to be evaluated against, and the honest
description of the situation is not "secure" but "absent".

**The two questions PE5 answers at once are not the same question.** Whether
Pico may send anything to a host, and whether Pico may send it the
remembered words of people who were never asked, differ in what a wrong
answer costs. PE5's own evidence is about the second: the `pull`/`create`
finding is an exfiltration argument, and ADR 0048 says so in as many words -
"with only a live turn at stake that is a quality problem; with retrieved
memory in the job it is an exfiltration path".

So the proof buys the memory, not the provider. That is what this decides.

## Scope

Covers: what an entry without a proven provider identity may carry, which
class such an entry belongs to, what failover between entries may do with
that difference, and what a declared credential obliges in return.

Does not cover:

- what an entry contains and where its numbers come from, which is ADR 0142;
- which classes exist and what may leave the device, which is ADR 0048;
- the registry, job envelope, transport and runtime, which were absent when
  this was written and are not this ADR's to specify;
- model quality, safety or injection resistance, per ADR 0050;
- the credential's own custody, which is ADR 0104's and unchanged.

## Decision

### Authentication is optional. The allowance is not

An entry whose provider cannot prove who it is is a **valid entry**. It may
be selected, it may run jobs, and it carries the live turn - the person's
own words in the turn they are having.

It does not carry retrieved memory. That needs the proof, every time, with
no threshold, grace period or first-use exception.

This is ADR 0048's split used as the hinge it already is. That ADR divided
egress into the live turn and retrieved memory because the two differ in
whose words are at stake. The same line decides what an unproven provider
is worth: the person may spend their own turn on a host they merely believe
in, and may not spend other people's.

### One class, two allowances - not two classes

The tempting shape is wrong, and the reason is worth writing down.

It reads well to say that an unauthenticated LAN host is "the fifth class's
data rule on the sixth class's hardware". It would be a bug. ADR 0118 O2
forbids failover **across** provider classes precisely so that an attacker
who degrades the local provider cannot force a cloud path. Filing the
unauthenticated host under the fifth class - the hosted-API class - would
make a degraded LAN box and a hosted API the same class, and O2 would then
permit exactly the failover it was written to forbid.

So the host stays in the sixth class whether or not it proves itself. What
changes is a property of the **entry**, not of the class.

### Failover respects the allowance, not only the class

Once one class holds entries with different allowances, O2's rule is
necessary and no longer sufficient. A job carrying retrieved memory may
move only to an entry that proves who it is; a job carrying the live turn
may move to either.

Stated as the negative it has to be: a job does not become sendable by the
provider it lands on. The job's allowance was set when it was assembled and
it travels with the job.

### An entry cannot half-say this

The absence of a credential is not an empty field.

An entry declares what it carries. `live_turn` needs nothing further;
`live_turn_and_retrieved_memory` is unparseable without a credential
reference, so there is no way to write down "carries memory, authenticates
somehow, we will sort it out later" - it is not a lax entry, it is not an
entry. This is ADR 0117 X1's construction: the refusal is a missing field
rather than a rule someone has to remember to run.

The consequence is that the narrower allowance is the one you get by
saying nothing, and the wider one has to be stated together with the thing
that earns it.

### A credential that travels in the clear is not a credential

If an entry declares one, the transport has to protect it. A bearer token
sent over plain HTTP across a LAN is capturable and replayable by anyone
who could already reach the port, so it does not distinguish the provider
from whoever is on that network - it only looks as though it does.

An entry that declares a credential over an unprotected transport does not
degrade to the narrower allowance. It is refused, because the credential
is a claim about identity that the transport contradicts, and something
that claims to be a proof and is not should never have been written down.

### The digest pin holds either way

ADR 0142 PE6 is untouched and applies to the unauthenticated entry too.

The pin is easy to read as a companion to authentication - something the
proof was covering for. It is the opposite. On the measured host anyone who
can reach the port can `pull` a different model behind the same tag, and an
entry without authentication is by definition one whose reach nobody
narrowed. The live turn is still the person's own words going to whatever
is answering on that port. A pinned digest is what makes "whatever is
answering" into a statement Pico can check.

### A declaration still does not stand in for a proof

ADR 0048's declaration - *this machine is mine, in my home* - decides the
class. It never stood in for the proof and still does not. What changes is
only the consequence of failing the proof: the entry narrows instead of
disappearing.

RFC 1918 proves nothing against a VPN, a forwarded port or a housemate's
NAS, and none of that has become less true.

## Gates

**Status of PV1-PV5, audited against the code on 2026-08-14: all five are
implemented**, and every one of them is a refusal in the parser or at dispatch
rather than a rule somebody applies.

- `parsePicoModelProviderEntry` refuses `live_turn_and_retrieved_memory`
  without a credential reference (PV4), refuses a credential on an unprotected
  transport (PV5), and refuses the wider allowance on a class that may not
  carry it whatever credential it holds (PV2).
- `picoModelJobRefusal` decides the job's allowance against the entry's before
  a request is built, so a job does not become sendable by the provider it
  lands on (PV1, PV3).
- The refusal reaches the person as words on their own device, where the
  decision is made (ADR 0152 SE1).

**One thing PV1 does not yet have, found by an audit on 2026-08-14.** The
entry declares the reference; nothing resolves it. `SupplierCredentialCrypto`
exists and is called from nowhere, so no Home can produce the secret its entry
names, and every job on such an entry is dispatched unauthenticated. That the
measured deployment accepted it says nothing - it accepts anything, which is
the finding this ADR already records.

The runtime now says so where it happens: a dispatch on an entry whose
credential cannot be produced is logged, and a provider answering `401` or
`403` is `credential_refused` rather than `provider_unreachable` - the machine
answered, it does not know us, and the two send a person to different places.
Refusing to dispatch at all was the other option and was rejected: it would
stop a provider that answers today from being used, on a Home whose owner
decided that question is postponed.

**Closed the same day.** A person supplies the secret from their own device
over `home.model.provider.credential.submit`, the Home seals it against that
entry, that resident and that reference, and the sweep opens it where it knows
whose job it is dispatching.

The rule that makes the reference mean something is at the decision: **a
decision may name only a credential this Home actually holds.** Without it,
PV4's "the wider allowance is stated together with what earns it" was satisfied
by a name pointing at nothing - which is precisely how an entry came to claim a
proof it could not give. Withdrawing the decision deletes the seal, because the
withdrawal is what makes holding it unjustified.

What remains open is the neighbouring finding this ADR already records: a
provider that accepts any bearer makes the proof true and meaningless. That is
about the far side, not about this half.

Original gate text follows.

- **PV1 - The proof buys the memory, not the provider (concept-only):** an
  entry without a proven provider identity is valid and carries the live
  turn. Retrieved memory requires the proof on every job. No threshold, no
  grace period, no first-use exception. *Amended 2026-08-16: "retrieved
  memory" means words somebody other than the person offered, or a packet
  fetched from a store. Pico's own derivation of the person's own notes is
  neither, and stays on the live turn - see the status note.*

- **PV2 - One class, two allowances (concept-only):** the allowance is a
  property of the entry, not of the class. The unauthenticated LAN host
  stays in ADR 0048's sixth class, because filing it under the fifth would
  make a degraded LAN box and a hosted API the same class and let ADR 0118
  O2 permit the one failover it exists to forbid.

- **PV3 - Failover respects the allowance (concept-only):** a job carrying
  retrieved memory may move only to an entry that proves who it is. The
  allowance travels with the job, set where the job was assembled. A job
  does not become sendable by the provider it lands on.

- **PV4 - The wider allowance is unwritable without its condition
  (concept-only):** `live_turn_and_retrieved_memory` without a credential
  reference does not parse. Saying nothing yields the narrower allowance;
  the wider one is stated together with what earns it. ADR 0117 X1.

- **PV5 - A declared credential obliges a transport that protects it
  (concept-only):** a credential over an unprotected transport is refused
  outright rather than narrowed, because it is a claim about identity that
  the transport contradicts. ADR 0142 PE6's digest pin is unchanged and
  binds both allowances.

### What PE5 now says

ADR 0142 PE5 read: unauthenticated reach is disqualifying rather than
pending. It now reads: unauthenticated reach disqualifies an entry **from
carrying retrieved memory**, and a credential that a transport does not
protect disqualifies the entry entirely.

The teeth stay where the evidence was. What the old wording also did -
leave the person with no provider at all, and ADR 0118 O2 with nothing to
be evaluated against - was never something the evidence asked for.

### What this does not settle

ADR 0048's residual is untouched and gets sharper here: inference runtimes
log, so a host in the sixth class is a second place where content exists in
the clear, outside ADR 0070's crypto shredding. A domain shred does not
reach it. With the narrower allowance that content is the person's own live
turn rather than other people's remembered words, which is a smaller
residual and not a closed one.

And ADR 0117 X4's quarantined read is still neither the live turn nor
retrieved memory. For an entry under the narrower allowance that gap is now
load-bearing rather than academic: it decides whether the nearest delegable
job may run on the provider that actually exists.

## Non-goals

- Making an unauthenticated provider sound safe. It is the narrower
  allowance because it is the weaker position.
- Prescribing a mechanism. Bearer token, mTLS, a reverse proxy in front of
  Ollama - PV5 constrains what a credential obliges, not what it is.
- Relaxing anything about hosted APIs. The fifth class is untouched.

## Consequences

Positive:

- the provider that exists becomes eligible for the job it is nearest to,
  so ADR 0118 O2 can be evaluated against something real;
- the exfiltration case PE5 was written about stays closed;
- "optional" is true in the only sense that costs nothing: optional to
  have, never optional to state.

Negative and residual:

- two allowances inside one class is a distinction the runtime has to carry
  correctly at every failover, and PV3 is the gate that will be easiest to
  forget;
- a person who never adds a credential gets a Pico whose model can see this
  turn and never their memory, which is a quieter failure than a refusal
  and needs saying in the product surface;
- PE5's original wording was simpler, and simpler wording that forbids the
  only case anyone has is a rule that gets ignored rather than followed.

## Relationship to other ADRs

- **ADR 0142** is what this amends; PE5's absolute becomes conditional and
  PE6 is unchanged and now load-bearing for both allowances.
- **ADR 0048** owns the classes and the live-turn/retrieved-memory split
  this hinges on; the sixth class's grant becomes conditional on the proof.
- **ADR 0118 O2** is why PV2 exists at all - the no-failover rule needs the
  classes to stay distinguishable.
- **ADR 0117 X1** is the construction PV4 uses, and X4 is the job whose
  classification this leaves open.
- **ADR 0104** holds the credential, unchanged.
- **ADR 0070** does not reach the execution site, which is the residual.
- **ADR 0050** is why nothing here claims anything about model quality.

## References

- ADR 0048 - model capability delegation and remote inference boundary
- ADR 0050 - model behaviour claims are out of scope
- ADR 0070 - crypto shredding and domain deletion
- ADR 0104 - core custody for host credentials
- ADR 0117 - planner and quarantined reader roles
- ADR 0118 - offline and model-free degradation contract
- ADR 0142 - a provider entry states what one host was measured to do
