# 0138 - Reaching Outside Costs Something and Is Off Until Someone Says So

## Status

Status note, 2026-08-17: **the two decisions were unreachable, in the ADR
whose title is that they exist.**

CO3 and CO4 have read "implemented 2026-08-11" since the day the columns, the
CHECK and the content-free event landed. `setPicoSupplierReach` had no caller
outside its own tests and `home.supplier_attachment_changed` was never
appended by anything, so both defaults were the only state a Home could ever
be in. *Off until someone says so* had nowhere for anybody to say so.

Found by asking whether a depot attachment surface would be worth building:
attaching creates no reach by CO3, so the head of that path would have led to
a middle nobody could pass. The middle is the part that was missing.

`home.suppliers.read` and `home.supplier.reach.decide` close it, from the
person's own device rather than through host administration - this is about
spending their money and telling somebody they asked, which ADR 0087 keeps out
of administration's hands. One operation for both decisions, because CO4
depends on CO3 and two operations would let a client grant the second and then
fail the first. The dependency is refused **by name** rather than left to the
database CHECK: without the refusal the person gets `operation_failed`, and
"unasked traffic is visible to nobody, so it cannot be the only thing you
allowed" is a reason they are owed.

The list carries the identifier, the kind and the two answers - not the slots,
the coverage or the privacy domain. Somebody deciding whether a thing may
spend their money needs to know what it is, not how it is wired.

Accepted as a constraint on suppliers that reach a system Pico does not
run. **CO1-CO5 are implemented**
(2026-08-10 to 2026-08-11), and this ADR is complete apart from the
budget mechanism it deliberately does not decide.

This was the third part of ADR 0136 until 2026-08-10, when the user asked
for a second cut. ADR 0136 keeps what a supplier is and where its code
runs, ADR 0137 keeps what happens when there are several, and this keeps
what it costs to use one. The reason for cutting rather than appending is
ADR 0135's, applied to an ADR: a document a reader cannot hold is not a
specification.

## Context

Issue #4 asks for a VesselFinder AIS bridge. VesselFinder bills by
credits, so a repeated question is a repeated charge, and the issue says
so plainly - "wiederholte Pico-Anfragen dürfen nicht unkontrolliert
identische externe Requests erzeugen."

**Nothing in this tree covers a dependency that costs money.** ADR 0118 O2
has the vocabulary for typed unavailability and the rule against failover
across provider classes. ADR 0119 has ceilings for storage and quotas for
relationships. Neither has anything about a supplier that charges, a
credential that unlocks the charging, or a person who has not yet agreed
to either.

**ADR 0036 reserved the field and left it empty.** Its connector registry
lists "secrets location" among the things a connector must declare, and it
states the rule that matters once a model exists: connectors must not hand
raw secrets to the language model, which may see a tool name, a schema and
returned results. Where the secret actually lives was never decided.

**The issue proposes the answer this tree has twice refused.** A
`VESSELFINDER_API_KEY` environment variable would be a third entry on
ADR 0104's debt list beside `memory_encryption` and
`pico_foundation_token` - the outcome ADR 0127 explicitly refused for
module activation, on the grounds that a decision a person makes about
their own Pico does not belong in host configuration.

And there is a second cost that is easy to miss because no invoice
arrives for it. **Asking VesselFinder where a ship is tells VesselFinder
that someone cares about that ship.** A free API discloses exactly as much
as a paid one. Whatever rule this ADR builds for money has to hold for a
supplier that charges nothing, or it is protecting the wrong thing.

## Scope

Covers: where a supplier's credential lives; what reaching outside spends;
how cost and availability are expressed; how many separate decisions stand
between an installed supplier and an unprompted outbound request; and which
suppliers are exempt.

Does not cover:

- what a supplier is, what it may produce, or where its code runs
  (ADR 0136);
- plurality, coverage and instance identity (ADR 0137);
- billing, accounting or spend reporting as a product surface, which
  would need a decision about money this ADR does not make;
- model providers, whose retention modes, trust states and job envelope
  ADR 0049 already governs;
- ADR 0119's storage ceilings and relationship quotas, which protect the
  Home against load rather than the person against a bill.

## Decision

### The credential belongs to Pico

A supplier credential is a decision a person makes about their own Pico.
It is held under core custody, handed to the supplier process for use, and
**never stored by the supplier**. It is not a host configuration value, not
an environment variable, and not a file beside the supplier's code.

Two properties follow that are worth stating rather than inferring.

A credential that only needs to read is issued as one. For a git library
over a private remote that means a read-only deploy credential, and **Pico
never pushes** - a supplier that could write to the source could edit the
material it is quoting.

And ADR 0036's rule holds unchanged at the other end: raw secrets never
reach a language model. A model may see that a supplier exists, what it
answers, and that it is unavailable. It may not see what unlocks it.

### Reaching outside spends two things, and only one of them is money

Every outbound request spends **money** where the supplier is metered, and
**disclosure** always. The second is the one without an invoice: the
outside system learns that someone asked, what they asked about, and when.

This decides the shape of everything below. A rule built only on cost
would exempt free APIs, and a free API discloses exactly as much as a paid
one. The controls here are therefore keyed to *reaching outside*, not to
*being billed*, and metering only changes how loudly the state has to be
reported.

### Cost and availability are content, not error strings

A supplier declares its condition as a value a surface can render and a
person can act on, extending ADR 0118 O2's vocabulary rather than throwing:

- **not configured** - no credential, nothing was attempted, nothing was
  disclosed;
- **unreachable** - the attempt failed below the application;
- **rate limited** - refused for now, will work later;
- **budget exhausted** - refused until a person decides something;
- **stale but present** - an answer exists and is older than it looks
  live, which ADR 0136's three clocks already require to be visible;
- **partial** - some of what was asked came back, and the answer says
  which part.

`out of scope` belongs beside these and is ADR 0137's, because it depends
on declared coverage rather than on condition.

The distinction that matters is between **refused for now** and **refused
until you decide**: the first is waiting, the second is a question
addressed to a person. A single `error` collapses them, and collapsing
them is how a spend limit turns into an outage nobody can explain.

### Three decisions stand between installed and reaching out unasked

They are separate because they answer different questions, and ADR 0129
SR6 already established the pattern by separating module activation from
capture.

1. **Does this feature exist?** Module activation under ADR 0127. Default
   on, because a shipped feature that is absent by default is a shipped
   feature nobody finds.
2. **May Pico reach this system at all?** Default **off**. This is where
   money and disclosure enter, and it is recorded the way this codebase
   records durable decisions - a content-free event plus a projection over
   an authenticated surface.
3. **May Pico reach it without being asked?** Background polling,
   scheduled refresh, prefetch. Default **off**, and never implied by the
   second. A person who agreed that Pico may look something up when asked
   has not agreed that Pico may look continuously.

The third is the one an implementation will want to fold into the second,
and the reason it must not is that they fail differently: an answered
question that cost money is visible to the person who asked it, and a
background sweep that cost money is not visible to anyone.

### An absent supplier is configured, not broken

ADR 0127 already has the sentence: "a capability that is missing on
purpose must not present as a capability that is broken." A supplier that
was never configured, or was deliberately switched off, is a state of the
system and not a fault in it.

This is why `not configured` is first in the vocabulary above and why it
is distinct from `unreachable`. One of them means nobody has decided yet;
the other means a decision was made and the world did not cooperate.

### A library is exempt, except at the moment it fetches

A Pico Library costs nothing and tells nobody. Reading a corpus on local
disk spends neither of the two things above, so none of the decisions
above gate it: a library that is attached is readable, and ADR 0136 keeps
it out of the floor's way precisely because it never leaves the machine.

There is exactly one moment where that stops being true. **A git fetch
reaches outside**, discloses that this Pico is pulling, and may need a
credential. Fetching is therefore a bridge-shaped decision under this ADR
even though reading is not - which is also why a library that has never
fetched is still answerable, and why losing the network degrades its
freshness and not its availability.

## Rejected alternatives

### The credential is an environment variable

Issue #4's proposal, and the reason ADR 0104 has a debt list. It puts a
per-Pico decision in host configuration, where a second Pico on the same
host inherits it, a container rebuild loses it, and nothing records who
decided. ADR 0127 refused this for module activation on identical grounds;
refusing it again is consistency, not caution.

### One decision covering activation and reaching out

Simpler by one switch, and it makes "I want the maritime vocabulary" mean
"and you may spend my money and tell a company what I asked". Those are not
the same sentence, and ADR 0129 SR6 already split the equivalent pair for
a reason that reads the same here: a person may want a feature to exist
without wanting it to act on their behalf continuously.

### Gate on cost only, and let free suppliers through

The reading this ADR started from, and it protects the wrong thing. A free
API learns exactly what a paid one learns. Keying the control to metering
would have let the cheapest supplier be the least governed.

### Cost as an error

The obvious implementation: throw, log, show a message. It collapses
`rate limited` into `budget exhausted` into `unreachable`, which are three
different things a person would do three different things about, and it
puts the explanation in a string that no surface can act on.

### A hard spend cap, enforced silently

Attractive because it cannot be overspent. It also turns the moment a
budget is reached into an unexplained outage, which is the failure mode
ADR 0119 Q5 already rejected for storage: the ceiling is told while there
is still room to act, not discovered afterwards.

### Let the supplier hold its own credential

It is where the credential is used, so it looks like where it belongs.
But a supplier is the component ADR 0136 puts behind a process boundary
precisely because it is the least trusted code in the system, and giving
the least trusted component durable custody of a secret inverts that. It
receives the credential; it does not keep it.

## Gates

- **CO1 - The credential is Pico's (part implemented 2026-08-11):** the
  half that is a decision rather than a cipher.

  **Scope is recorded and a library takes `read`, refused otherwise.** A
  supplier that could write to its source could edit the material it is
  quoting, and that failure is quieter than losing the credential: the
  quotes would stay accurate about a source changed to agree with them.
  Pico never pushes. A bridge may hold a wider scope, because it is not
  quoting anything.

  **Presence is recorded, the secret is not.** A surface can answer
  ADR 0138 CO2's `not configured` without anything holding a secret to
  check, and a test asserts nothing secret-shaped comes back from the
  attachment read. Nothing is read from the environment, and a test sets
  `PICO_SUPPLIER_*` to prove it (ADR 0104).

  **The cipher landed on 2026-08-11, with its own associated data.** The
  custody is ADR 0072's and unchanged - a credential lives in the domain
  its supplier attached into (ADR 0137 IN5), wrapped by that domain's KEK,
  so a domain shred takes it with everything else that domain held, and
  the shredded case is *reported* rather than thrown. Reusing the key
  store was right; reusing the memory suite was not, because its AD binds
  a `memoryItemId` a credential does not have, and a fabricated one would
  make the associated data a lie.

  **The payoff for its own AD is that the scope is sealed into it.** A
  credential sealed for `read` cannot be opened as `read_write` - no
  column update changes that, because widening takes re-encrypting, which
  takes re-supplying the credential, which takes asking the person again.
  "Read scope where reading is all that is needed" is carried by the
  cipher rather than by a value somebody could edit. The identifier and
  the domain are bound too, so a seal cannot be moved between instances or
  between Private Spaces; three tests state the three refusals.
  **The cipher has no caller, found on 2026-08-14.** `SupplierCredentialCrypto`
  is exported, tested against its three refusals, and reached from nowhere in
  the tree: nothing seals a credential and nothing opens one. So "presence is
  recorded, the secret is not" is true in the strongest possible sense - there
  is no secret anywhere, because no path puts one there.

  It surfaced at a second site rather than here: an ADR 0152 model provider
  entry may declare a `credentialRef`, ADR 0151 PV1 makes that reference what
  buys the wider allowance, and the runtime resolves it through a port **no
  Home wires**. An entry can therefore say it proves who it is while nothing
  proves anything. The dispatch says so in the log rather than refusing, and a
  provider that answers `401` is now reported as `credential_refused` instead
  of as an unreachable machine - but neither is the missing half.

  **The path was built the same day, and the decision it needed is recorded
  here.** A provider credential is not a supplier attachment: it belongs to one
  person's decision about one entry (ADR 0152), so that is what its associated
  data binds - entry, resident, reference - and a seal cannot be moved to
  another entry, opened by another resident, or re-pointed at another name.
  Three tests state the three refusals, as they do for the supplier seal.

  **Its key is not a privacy domain's, and that is the difference that
  mattered.** A supplier credential lives in the domain its supplier attached
  into so a domain shred takes it. A provider credential belongs to nobody's
  content; what makes it meaningless is the person withdrawing their decision,
  so that is what deletes it. It is wrapped under a key domain of its own,
  which keeps it out of every backup for the same ADR 0072 R6 reason - a
  restored database holds the seal and no key, and the open reports that
  instead of pretending.

  **The key store is built whatever the memory-encryption decision says.** That
  decision is about memory *content*: a Home that keeps its notes in plaintext
  has not thereby decided to keep a credential in plaintext, and under the old
  arrangement there would have been nowhere to put one.

  The secret arrives over the ADR 0107 channel from the person's own device -
  the only operation in that closed list carrying a secret at all - is sealed
  in the same breath, and the reply carries the reference and nothing else.
  **There is no read-back operation**, which is what makes "the credential is
  Pico's" a property of the shape rather than a promise about behaviour.

  **`SupplierCredentialCrypto` still has no caller, and that is now a decision
  rather than an oversight.** Wiring it needs two things the provider half did
  not: a slot in ADR 0136 BR2's closed supplier transport for handing a
  credential over for one use, and a surface for supplying one. Neither has a
  consumer - the only supplier that exists is a local git working copy, whose
  own header says it needs no credential, and building the hand-over now would
  add a second unused mechanism beside the one this entry already reports.

  What is missing is not the cipher. It is a supplier that needs one, and the
  wire shape should be decided by the first supplier that does rather than
  guessed at by the one that does not.

- **CO2 - Condition is a typed value (implemented):**
  `picoSupplierConditions` is the closed list, with `out_of_scope` from
  ADR 0137 IN3 beside it, and `assertPicoSupplierCondition` refuses
  anything else - including `error`, which is the name this vocabulary
  exists to avoid.

  It sits *beside* ADR 0118 O2 rather than inside it, and the distinction
  is worth stating: O2 types why a **capability** is unavailable on this
  device, and a condition says what happened with **one supplier**. A
  device with a network can still hold a bridge whose credits ran out.

  The load-bearing pair is distinguishable without prose:
  `picoSupplierConditionResolvesItself` is true for `rate_limited` and
  false for `budget_exhausted`, while
  `picoSupplierConditionNeedsPerson` is the other way round.
  `picoSupplierConditionCarriesContent` keeps `stale_but_present` and
  `partial` as answers rather than failures, and
  `picoSupplierConditionSpentNothing` names the only two conditions
  decided before reaching out - no credential to try with, or a subject
  the instance never claimed to cover. An unreachable attempt spent
  disclosure: the request left, and the answer not coming back does not
  unsay it.
- **CO3 - Reaching outside is a decision of its own (implemented
  2026-08-11):** `may_reach_outside` defaults to off on
  `pico_supplier_attachment`, separate from ADR 0127 module activation,
  with `home.supplier_attachment_changed` as the content-free event beside
  it. Attaching a supplier says it exists; it does not say Pico may spend
  a person's money or tell anyone they asked.
- **CO4 - Unprompted traffic is a third decision (implemented
  2026-08-11):** `may_reach_unasked` is a second column rather than a
  wider first one, defaults to off, and **cannot be granted without CO3** -
  carried as a database CHECK rather than left to whoever writes next,
  because the implementation that folds them is the one that grants the
  second with the first. They fail differently, which is the reason to
  keep them apart: an answered question that cost money is visible to the
  person who asked, and a background sweep is visible to nobody.

  Still open here: a library's git fetch counting as reaching, which needs
  a library that fetches.
- **CO5 - A limit is announced, not discovered (implemented
  2026-08-11):** `evaluatePicoSupplierLimit` answers `normal`,
  `approaching` or `reached` in the shape
  `evaluatePicoStoragePressure` already has, including the property that
  matters most: an unreadable usage reading answers `reached` rather than
  `normal`, because the one case that cannot be measured must not be the
  one case that is unprotected.

  `picoSupplierLimitCondition` names which limit was hit, and returns
  `null` while there is room - a limit that has not been reached has no
  condition to report. The two conditions are answered differently, which
  is why they are two: `rate_limited` resolves itself and needs nobody,
  `budget_exhausted` resolves itself never and needs a person, and a
  caller that could not tell them apart would say "try later" about a
  question that will never work again.

## Failure ledger

| Situation | Posture |
|---|---|
| No credential is configured | `not configured`. Nothing was attempted, so nothing was disclosed, and this is a state rather than a fault (CO2). |
| The supplier is billing by credits and they run out | `budget exhausted` - refused until a person decides, distinct from `rate limited`, which is refused for now (CO2, CO5). |
| A person enables the maritime feature | The feature exists. Pico still may not call VesselFinder until that is decided separately (CO3). |
| A person allows Pico to answer ship questions | Pico may look up when asked. It may not poll in the background; that is a further decision (CO4). |
| A supplier process is compromised | It holds no durable secret. It received a credential for use; custody stayed in the core (CO1). |
| A model asks what the API key is | It cannot see it. A model sees that a supplier exists, what it answered, and that it is unavailable (CO1, ADR 0036). |
| A free API is added and costs nothing | Governed identically. The control is on reaching outside, not on being billed, because disclosure is spent either way. |
| An attached library is read with no network | Ungated and unaffected. Reading spends nothing; only the fetch that refreshes it does (CO4). |
| A spend limit is reached mid-answer | Announced before it is hit and named when it refuses, rather than surfacing as an unexplained outage (CO5). |

## Consequences

Positive:

- the first dependency that charges money arrives with a rule instead of
  producing one under pressure;
- keying the control to disclosure rather than to cost means a free
  supplier is governed as carefully as a paid one, which is the case that
  would otherwise have slipped through;
- separating the three decisions keeps "this feature exists" from silently
  meaning "and it talks to a company on your behalf while you sleep";
- a library stays cheap: nothing here gates reading, which is what keeps
  ADR 0136's floor eligibility real rather than nominal.

Negative and residual:

- three switches where one would do is real friction, and the value of the
  third only shows in traffic nobody watched;
- this ADR names no budget mechanism, no accounting and no spend surface.
  It says a limit must be announced and refused by name, and leaves who
  sets it and how it is displayed to whoever builds it;
- `stale but present` puts a judgement in front of a person that a system
  could have made for them, every time;
- nothing here verifies a supplier's own claim about its cost or its rate
  limit. The states are reported by the component being governed.

## Relationship to other ADRs

- Splits from ADR `0136`, which keeps the slot contract, the two supplier
  kinds and the process boundary, and from ADR `0137`, which keeps
  plurality. All three describe one boundary.
- Fills the field ADR `0036` reserved as "secrets location", and keeps its
  rule that raw secrets never reach the language model.
- Refuses a third entry on ADR `0104`'s debt list.
- Extends ADR `0118` O2's vocabulary with condition states and keeps its
  no-failover-across-classes rule.
- Borrows ADR `0119` Q5's posture: a limit is told while there is room to
  act.
- Follows ADR `0129` SR6's split between a feature existing and a feature
  acting, and ADR `0127`'s rule that a deliberately absent capability must
  not present as a broken one.

## References

- [ADR 0036](0036-capabilities-connectors-and-mcp-boundary.md)
- [ADR 0049](0049-model-provider-registry-and-job-envelope.md)
- [ADR 0104](0104-settings-belong-to-pico-not-to-host-configuration.md)
- [ADR 0118](0118-offline-and-model-free-degradation-contract.md)
- [ADR 0119](0119-resource-exhaustion-and-denial-of-service-posture.md)
- [ADR 0127](0127-pico-modules-mandatory-delivery-independent-code-declared-dependencies.md)
- [ADR 0129](0129-spatial-recall-observations-are-not-memories-and-uncertainty-is-not-origin.md)
- [ADR 0135](0135-a-specification-a-consumer-cannot-read-is-not-a-specification.md)
- [ADR 0136](0136-pico-bridges-and-libraries-the-slot-is-the-contract.md)
- [ADR 0137](0137-suppliers-are-instances-coverage-decides-whether-they-add-up.md)
</content>
