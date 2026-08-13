# 0144 - MCP Is a Bridge's Transport, and a Tool List Is Not a Catalog

## Status

Accepted as the placement and narrowing decision for Model Context Protocol
clients. **MC1 and MC5 are implemented 2026-08-13**; MC2, MC3 and MC4 stay
open, because the first two are obligations on a bridge that does not exist
yet and the third is a ceremony nobody has built. There is still no MCP code
in the tree, and `.ai/mcp/mcp.json` contains `{}` - which is the point: the
two gates that landed are the two that hold *before* anybody writes a client,
one by predicting the refusal an author will meet and one by checking a claim
the author makes about themselves.

Decided in conversation on 2026-08-11, from a question about where an MCP
client belongs - core function, mandatory bridge or optional bridge. The
question turned out to be answered already: ADR 0136 says "an MCP client is
a bridge's implementation" and ADR 0143 refuses mandatory bridges. What was
*not* written anywhere is everything below the placement, and this ADR is
that remainder rather than a new direction.

It carries a second obligation. ADR 0036 is the tree's MCP boundary and was
written before the process boundary, the request contract, the closed rule
input and the planner/reader split existed. Its core rule survives all
four; several of its illustrations do not, and a status note under
ADR 0128's record rule now says which.

## Context

**ADR 0036 decided the authority question and left the placement open.**
Its core rule - "MCP is a tool connection method. It is not Pico authority"
- has held for every ADR since and holds here. What it never said is where
an MCP client *runs*, which is the same omission ADR 0136 found in it for
connectors generally: "What it never says is where the connector runs, and
that omission is the whole risk."

**ADR 0136 closed the placement in one paragraph and stopped there.** MCP
is "a transport here, not a second boundary"; an MCP client is a bridge's
implementation; a server that is already a separate process makes BR2's
boundary free. That paragraph decides the question this ADR was asked, and
five consequences of it were never followed through.

**MCP arrived in this tree as a real case, not a hypothetical.** `rchkb` is
a self-hosted Gitea repository with an MCP server in front of it, and
ADR 0136 used it to state that the kind follows the access path: cloned to
disk the corpus is a library, reached through its MCP server the same
material is a bridge. The user decided git rather than MCP for that corpus
on operational grounds - a 612 MB `.git` and single documents of 57, 41 and
29 MB, which a tool protocol is the wrong shape for moving. The next
supplier will not have that escape.

**The deep incompatibility is not about transports.** MCP is designed
around a model that reads what a server says: tool descriptions are prose
written to be interpreted, `tools/list` is expected to change at runtime,
and `notifications/tools/list_changed` exists to tell a client that it did.
ADR 0117 splits the planner from a quarantined reader precisely so the
acting model never receives content Pico did not author, and ADR 0116 W2
labels that content at the threshold. ADR 0140 states the same refusal one
layer down: Pico Rules read a closed typed input and never prose.

So the protocol's central mechanism - the server describes, the model
decides - is the mechanism this tree spent four ADRs removing. That does
not make MCP unusable. It makes MCP usable **only as a transport whose
descriptive half is discarded**, and saying so is most of this ADR.

**MCP's own specification agrees about the annotations.** Tool annotations
- `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` -
carry the note that clients must consider them untrusted unless they come
from a trusted server. A server-declared risk hint is therefore not a risk
class in anybody's model, including MCP's.

## Scope

Covers: where an MCP client sits in the supplier stack; which MCP
transports are reachable at all; what a server's tool list may and may not
change; what happens to server-initiated messages; how a credential
reaches an MCP bridge; and how a declared supplier kind stops being an
unchecked claim.

Does not cover:

- what a supplier is, where its code runs, and what arrives with foreign
  content (ADR 0136);
- plurality, coverage and instance identity (ADR 0137). Two MCP servers
  over the same material are an IN2 question like any other pair;
- credential custody, disclosure and the three reach decisions (ADR 0138),
  which apply to an MCP bridge unchanged;
- how supplier code arrives and what pins it (ADR 0143);
- **Pico exposing MCP-compatible tools**, which ADR 0036 sketches for Pico
  Home. That is a surface rather than a supplier, it is governed by
  ADR 0030's local trust boundary, and nothing here decides it;
- the capability registry ADR 0036 describes and nothing implements;
- MCP prompts and completions, which have no slot to arrive through and
  therefore no question to answer here.

## Decision

### An MCP client is a stack layer, and never the attached supplier

An MCP client fills no ADR 0136 BR1 slot. `tools/call` is not an
observation, `resources/read` is not a memory item, and neither is an
effect until somebody maps it. The manifest parser says the same thing in
code: a declaration with an empty slot list is refused, because something
filling no slot supplies nothing.

So an MCP client is **the lower half of an ADR 0143 DP5 stack**, exactly
where the git supplier sits under the knowledge-base supplier. Above it
sits a supplier for one outside system - a Home Assistant, a Gitea, a
maritime API - which declares the slots, owns the mapping into Pico's
shapes, and is the thing a person attaches. The core sees one supplier;
the composition beneath it is the author's business.

**The mapping must not live in the transport, and that is the reason the
split is a rule rather than a style.** ADR 0136 closed the slot list
because "without a fixed target, 'present the data uniformly' means every
supplier defines its own uniformity, and four DTO families become forty".
A generic MCP layer that mapped tool results into slots would be defining
that uniformity once for every server it ever speaks to, which is the same
failure with better packaging.

`dependsOn` resolves inside one manifest, so the MCP client a bridge sits
on is vendored in the same depot and pinned by the same commit. An MCP
client shared across depots is unsayable, which is DP5 doing its job.

### The transport is a network transport, and stdio is already refused

MCP has two transports in current use. **Streamable HTTP** speaks to a
server that is already running and reachable at a URL. **stdio** requires
the client to launch the server as a child process and speak over its
standard streams.

The second one cannot exist in a Pico supplier, and it is refused today
without anybody having decided it: ADR 0143 DP4 keeps `node:child_process`,
`node:worker_threads`, `node:vm`, `node:module`, `node:inspector`, `eval`
and `new Function` out of supplier code, because all of them end with code
running that Pico did not start. A stdio MCP client is that in its purest
form - it launches a program the depot names.

**This is a narrowing with a real cost and it is stated rather than
discovered.** Most of the MCP ecosystem ships stdio servers. A person who
wants one of those must run it themselves, as a service or a container, and
attach the bridge to its address. Pico will not launch it.

The alternative - letting Pico spawn the server - is ADR 0143's rejected
command line in the manifest wearing a protocol name. A field holding
`npx some-mcp-server` holds anything, and every guard after it guards a
decision already made. Question 1 was decided on 2026-08-11 and this does
not reopen it.

**A local server is still a network dependency.** ADR 0136 settled that for
`rchkb`: "a self-hosted host on a LAN is still a network - the camper van
in ADR 0137 is exactly the case where it is not there." A server on
`localhost` is the same statement with a shorter route.

### Discovery displays; the manifest decides

An MCP bridge may call `tools/list`. What comes back **never widens what
the bridge may do.**

The effects a bridge can cause are the ones its depot declaration names, in
ADR 0139 AC1's shape: a request naming an effect no manifest declared is
refused at the request contract, before any decision is asked for. A
server that adds a tool between two commits has added nothing to this Pico.
A new effect is a new depot commit, which is an ADR 0143 DP1 decision a
person makes.

**A live tool list is therefore a comparison, not an input.** A bridge that
finds the server offering less than the manifest declares reports an
ADR 0138 CO2 condition, because its declared ADR 0137 IN2 coverage has
stopped being true and a partial answer owes an account of itself. A bridge
that finds the server offering more reports nothing, because more is not a
change to anything Pico can ask for.

`notifications/tools/list_changed` has the same fate for a structural
reason rather than a policy one: the supplier transport has no inbound
family, so there is nowhere for the notification to arrive. It is dropped
at the bridge.

**Annotations are not a risk class.** `destructiveHint` and its siblings
are a server's description of itself, and MCP's own specification says a
client must treat them as untrusted. ADR 0140 RL3 decides risk from a
closed input the core owns; a hint from the far side of a network is prose
with a boolean's shape.

**What this does not prevent is stated plainly.** A bridge that declares
`home.set_state` and routes it to a different tool than the one it
declared has changed what a person consented to without changing a commit.
Nothing here catches that, and nothing can: the declared effect is the unit
of consent, and the bridge is the least trusted code in the system. This is
ADR 0143's containment posture unchanged - process boundary, no core reach,
no authority, and a commit somebody accepted - and it is named rather than
mitigated.

### Nothing a server initiates has anywhere to go

MCP is bidirectional. A server may ask the client for model inference
(`sampling/createMessage`), may ask the client to put a question to the
person (`elicitation/create`), may ask for the client's filesystem roots
(`roots/list`), and may send notifications at any time.

An MCP bridge **declines all four at `initialize`**, by not advertising the
capabilities, and drops anything that arrives regardless.

The reason is one sentence from ADR 0136 and it covers every case: a
supplier carries; it never decides. The transport already makes it true
structurally - "no family points inward - there is no notify, push or
subscribe, so a supplier has no way to start anything" - so a bridge that
answered a server-initiated request would be answering on its own
authority, with no route by which the answer could have come from Pico.

Two of the four are worth naming individually because they look helpful.

**Sampling would hand Pico's model to a supplier.** ADR 0117 quarantines
the reader for content Pico did not author; a server that can request
inference has obtained the model directly, from outside, with its own
prompt. There is no version of this that is safe enough to design.

**Elicitation would make a supplier the one asking.** ADR 0138 CO3/CO4 and
ADR 0141 RN4 decide when a person is asked and what the question says, and
RN3 builds the statement from the executing fields rather than from
anybody's description. A server composing the question is the leak test
from ADR 0136 firing: the moment a document reads "the bridge asks the
person", the boundary has moved.

**Downstream version negotiation is the bridge's business and not the
core's.** MCP negotiates its protocol version at `initialize`; ADR 0143 DP7
refuses to negotiate. The two do not collide, because DP7 governs the
supplier protocol between core and bridge, and MCP's negotiation happens on
the far side of the bridge. What a bridge may not do is let a downgraded
server quietly shrink what it answers: a bridge whose declared coverage
stopped being true reports a condition rather than answering less.

### A bridge is handed a credential; it never obtains one

MCP's authorization for HTTP transports is OAuth 2.1, with a browser
redirect and, in the common case, dynamic client registration.

A supplier has **no surface** - that is ADR 0136's definition, not a
limitation of the current implementation - so a bridge cannot run that
flow, and a bridge that opened a browser would be a supplier acting on its
own initiative in the most visible way available.

The flow therefore belongs to the core and the Companion, on the ADR 0141
RN4 shape that already exists for presence-bound approval, and the
resulting token reaches the bridge over ADR 0138 CO1's single custody path.
Not through the environment: ADR 0143 DP3 removed `env` from the manifest
for exactly this reason, and ADR 0104 refuses to let a per-Pico decision
live in host configuration.

A bearer token for a self-hosted server takes the same route and is the
easier case. The residual is real and is named under Consequences: nobody
has built that ceremony, so the first MCP bridge will be one against a
server whose credential is static.

### A declared kind is a claim, and this is where it stops being unchecked

ADR 0136 separates a bridge from a library categorically, and ADR 0136 BR6
enforces the consequence at the floor: `picoSupplierMayBeOnOfflineFloor`
answers from the kind alone, and `offline:check` refuses a floor family
naming anything under `bridges/`.

The kind itself, though, is a field in a depot manifest written by the
depot's author. **A supplier that reaches an MCP server and declares itself
a library would claim floor eligibility it does not have**, and nothing in
the tree would notice. That is not an MCP-specific hole, but MCP is where
it becomes likely: the same corpus is a library one way and a bridge the
other, and the wrong word is one edit away.

So the reach check gains an inverse statement **per declared kind**. A
bridge may open sockets, which is its job. A supplier declaring itself a
library may not, because a library that answers from the network is not one
- ADR 0136's floor test asks about answering, and an operation needing a
network on the query after next does not become a floor operation by
having succeeded once.

A library never fetches, so this costs nothing real: under ADR 0143 the
fetch is `git`, an external program the core runs, and a supplier cannot
spawn anyway.

### The names

**This ADR adds no term to ADR 0026's map.** MCP is a third-party protocol
name and stays one; a bridge that speaks it is a Pico Bridge like every
other, named by its author after the system it connects rather than after
the protocol it uses. `mcp-bridge` as a supplier identifier would name the
transport where ADR 0136 names the outside system, and would suggest one
supplier can reach any server - which the next section refuses.

The leak test from ADR 0136 applies with its own wording here. The moment a
document reads "the MCP bridge decides", "the server allows" or "the tool
list permits", the word has moved into the architecture.

## Rejected alternatives

### An MCP client in the core

The question as it was asked, and the shape most codebases take. It fails
ADR 0136 BR2 directly: the rule is about processing, and an MCP client
parses JSON-RPC responses from a server Pico did not write. It also makes
true the exact dependency ADR 0036 was written to prevent - "Pico must not
become architecturally dependent on MCP" - by putting an MCP SDK in the
core's static import hull, complete with a network edge where
`offline:check` currently walks none.

### A mandatory MCP bridge shipped with the core

The second reading of the question, and already refused by ADR 0143's
"ship the essential bridges in the core": one core dependency per outside
system, third-party protocol handling inside the process ADR 0136 keeps
foreign code out of, and the closed module list ended in substance while
kept in form. The 2026-08-11 decision stands: as few mandatory bridges as
possible, and today none.

### One generic MCP bridge, configured with a server address

The tempting shape, and the one somebody will propose first. It moves the
tool set from a commit into configuration, which dissolves ADR 0143 DP1 -
there is no longer a commit that says what runs, because what runs depends
on which server was typed in. It makes an ADR 0137 IN2 coverage
declaration meaningless, since one supplier would claim coverage of
whatever it happens to be pointed at. And it puts the mapping into the
transport, which is the forty-DTO-families failure ADR 0136 closed the slot
list to prevent.

One bridge per outside system, vendored and pinned, is more work for the
author and is the only shape in which a person's decision is about
something specific.

### Adopt `tools/list` as the effect catalog

The obvious implementation, and the one MCP is designed for. It makes the
set of things Pico may do a property of a remote server, changeable between
two calls, with ADR 0139 AC1's manifest list reduced to documentation.
Every protection downstream - the decision, the approval, the history -
would then be operating on a request whose vocabulary a third party wrote
after the person consented.

### Let Pico spawn the MCP server

The rescue for stdio, and ADR 0143's rejected command line under another
name. Pico shipping its own runner for its own supplier module is not this;
a field naming a third party's program is, whether it is called `command`,
`serverCommand` or `mcpServer`.

### Trust the tool annotations for the risk class

Convenient, and refused by MCP's own specification, which tells clients to
treat annotations as untrusted unless the server is trusted. ADR 0140 RL3
decides risk from a closed input the core owns, and a supplier that could
set its own risk class would be arguing about its own permission - the same
reason ADR 0140 RL4 keeps `@pico/protocol/pico-rules` out of modules.

### Give MCP its own supplier kind beside bridge and library

Considered, and it repeats an error this tree has now corrected three
times: ADR 0128 made effect-bearing a declared property rather than a
fourth module kind, ADR 0136 refused a third supplier kind for tracked
libraries, and ADR 0136 refused it again for how a library is pinned. MCP
is how a bridge talks. A supplier kind describes whether answering needs
the network, and MCP answers that question the same way every other network
transport does.

## Gates

- **MC1 - Network transport only, and the refusal is predicted (implemented
  2026-08-13):**
  supplier code cannot spawn, so a stdio MCP client is already unbuildable
  under ADR 0143 DP4. What is missing is that an author meets that wall as
  `second_runtime: node:child_process spawns a process`, which names the
  right rule and the wrong problem. DP4's violation reason gains the MCP
  case by name, in ADR 0143 DP1's posture for a ref: it is not a typo, it
  is exactly the request the gate exists to refuse, and the person's remedy
  is to run the server themselves and attach to its address.

  `bridges/README.md` states the same thing where a depot author reads it
  before writing code rather than after, together with the four other
  obligations an MCP bridge carries.

  The note hangs on the specifier rather than on the reason, because the
  other four second-runtime imports have nothing to do with MCP, and a check
  asserts the note survives: a scanner that refuses `node:child_process`
  without naming the MCP case fails `supplier:check`. Removing the note is
  the mutation that proves it - the refusal still happens, and the gate is
  about *which* refusal arrives.
- **MC2 - The manifest is the tool set (open):** the core enforcement
  already exists and is ADR 0139 AC1 - a request naming an undeclared
  effect is refused at the request contract - so no core change is needed
  and none should be made. What is open is the bridge-side obligation and
  its condition: a bridge compares `tools/list` against what it declared,
  reports an ADR 0138 CO2 condition when the server offers less, and never
  treats a surplus as a capability.

  A `notifications/tools/list_changed` arriving at a bridge is dropped
  rather than forwarded, which needs no mechanism: the supplier transport
  has no inbound family to forward it through.
- **MC3 - Server-initiated messages are declined at `initialize` (open):**
  an MCP bridge advertises neither `sampling` nor `elicitation` nor
  `roots`, and drops anything a server sends regardless of what it
  advertised. Sampling is the one that must never be built, because a
  server obtaining model inference is ADR 0117's quarantine bypassed from
  the outside; elicitation is the one that looks helpful and makes a
  supplier the party asking a person, against ADR 0141 RN3/RN4.

  The structural half is already true and is what makes the gate cheap:
  there is no inbound family, so a bridge that answered would be answering
  on an authority nothing granted it.
- **MC4 - The credential arrives; it is not obtained (open):** an MCP
  bridge never runs an OAuth flow, because a supplier has no surface to run
  one on. The flow belongs to the core and the Companion on ADR 0141 RN4's
  presence-bound shape, and the token reaches the bridge over ADR 0138
  CO1's single custody path - not through the environment, which ADR 0143
  DP3 removed from the manifest for this reason.

  Open in full, including the ceremony, which nobody has built. The first
  MCP bridge will therefore be one against a server holding a static
  credential.
- **MC5 - A declared kind is checked, not believed (implemented
  2026-08-13):**
  `supplier:check` gains an inverse statement per declared kind, read from
  the depot manifest it already parses. A supplier declared `bridge` keeps
  today's permission to open sockets and call `fetch`. A supplier declared
  `library` is refused for reaching the network at all, because ADR 0136's
  floor test asks whether answering needs a network and a library that
  reaches one is not a library.

  This is the gate that reaches back into ADR 0136 rather than adding to
  it: BR6 enforces the floor consequence of the kind and nothing has ever
  checked the kind itself. The shipped `git-library` supplier passes
  unchanged - it imports `node:fs` and `node:path` and nothing else - and a
  positive probe must assert that, in ADR 0143 DP4's posture that the
  permitted half is proved as carefully as the refused half, since the way
  this check fails is by drifting into `module:check` under another name.

  The evasion is named rather than claimed away: a computed dynamic import
  defeats a static scan, here as everywhere else in this tree. The check
  catches the honest mislabel, which is the case ADR 0136's own
  library-or-bridge paragraph shows is one edit away.

  Built as a narrowing of the existing closure walk: seven `node:` network
  modules and three globals become violations **only** under a declared
  `library`, and the declared kind is read from the depot manifest the check
  already parses. Where one directory holds both kinds the library rule wins,
  which is a finding rather than caution - two entry points sharing a closure
  share its files, so the library's own code path really does contain what
  the bridge reached for.

  Proved in both directions, because the way this fails is by drifting into
  `module:check` under another name: the same `node:net` import fails as a
  library and passes as a bridge, `git-library` passes unchanged reading
  `node:fs` and `node:path`, and a comment saying "never calls fetch()" trips
  nothing.

## Failure ledger

| Situation | Posture |
|---|---|
| A depot vendors a stdio MCP client | The depot check fails on `node:child_process`, in the release rather than at runtime, and now says why in MCP's terms (MC1, ADR 0143 DP4). |
| A server adds a tool | Nothing happens. The effect list is the manifest's, and an undeclared effect is refused at the request contract (MC2, ADR 0139 AC1). |
| A server removes a tool the bridge declared | Reported as an ADR 0138 CO2 condition, because declared ADR 0137 IN2 coverage has stopped being true (MC2). |
| A server sends `notifications/tools/list_changed` | Dropped at the bridge. There is no inbound family to forward it through (MC2, ADR 0136 BR2). |
| A server requests `sampling/createMessage` | Declined at `initialize` and dropped if sent anyway. A supplier obtaining model inference is ADR 0117's quarantine bypassed from outside (MC3). |
| A server requests `elicitation/create` | Declined. Who asks a person, and with which words, is ADR 0141 RN3/RN4's and never a supplier's (MC3). |
| A tool is annotated `readOnlyHint: true` and is not | Irrelevant to the decision. Risk comes from ADR 0140 RL3's closed input, and MCP's own specification calls annotations untrusted (MC2). |
| A bridge wants to run an OAuth flow | It has no surface. The flow is the core's and the token arrives over ADR 0138 CO1 (MC4). |
| A supplier reaching an MCP server declares itself a library | Refused by the depot check for reaching the network under a library declaration, before it can claim ADR 0118 floor eligibility (MC5). |
| A tool result carries instructions for the model | Labeled `external_content` at the threshold and never handed to the planner. Containment, not verification (ADR 0136 BR3, ADR 0116 W2, ADR 0117). |
| A tool result is larger than 128 KiB | Refused by the supplier frame ceiling. A supplier hands over one answer per request; a corpus is read where it lies (ADR 0136 BR2, ADR 0133). |
| An MCP bridge is malicious | Contained, not prevented. Process boundary, no core reach, no authority, declared effects only, and a commit somebody accepted (ADR 0143). |

## Consequences

Positive:

- the question "where does an MCP client go" has one answer, and it is the
  answer four existing ADRs already implied without anybody being able to
  cite it;
- MCP becomes usable without the core acquiring a dependency on it, which
  is the property ADR 0036 asked for in its first paragraph and had no
  mechanism for;
- the descriptive half of MCP - the half this tree cannot safely consume -
  is discarded at a named place rather than at whichever place the first
  implementation happened to stop;
- MC5 turns ADR 0136's categorical bridge-or-library split into something a
  check can fail on, which it has never been;
- an MCP server that is already a separate process makes ADR 0136 BR2's
  boundary free, which is the one place where this protocol fits this tree
  better than the alternatives.

Negative and residual:

- **most of the MCP ecosystem is stdio and is therefore out of reach.** A
  person who wants one of those servers runs it themselves. This is the
  largest practical cost of the ADR and it follows from a decision - the
  entry point rather than the command line - that is not reopened here;
- the OAuth ceremony does not exist, so the first MCP bridge will be one
  against a server with a static credential, and the flow is an unbuilt
  surface with a presence requirement;
- one bridge per outside system means an author writes and vendors a
  supplier for each, and vendoring under ADR 0143 DP2 makes each depot
  larger;
- **a bridge that misroutes a declared effect is not caught by anything
  here.** The declared effect is the unit of consent and the bridge is the
  least trusted code in the system; this ADR narrows what a bridge may
  declare, not what it does with what it declared;
- MCP versions its protocol on a date and expects negotiation. A bridge
  that pins one and a server that moves will produce a condition rather
  than an outage, which is correct and is also a maintenance burden landing
  on depot authors;
- nothing here reduces content risk. A tool result is a correctly labeled
  answer from a system Pico cannot verify, and ADR 0117 X4's quarantined
  read job - which is what would let a model see it at all - does not
  exist. An MCP bridge is placeable today and answerable later, in exactly
  the sense ADR 0136 said a library is.

## Relationship to other ADRs

- Extends ADR `0036` and gives its status note. The core rule stands; the
  direct-connection illustration, the connector-held capability list and
  the model-reads-descriptions framing do not.
- Completes the paragraph ADR `0136` wrote about MCP and hands one result
  back to it: MC5 checks the declared kind that BR6 enforces the
  consequences of.
- Applies ADR `0143` rather than extending it. DP4 already refuses stdio,
  DP5 already places the client in a stack, DP1 already makes a new tool a
  new decision, and DP7's refusal is about a different protocol than MCP's
  negotiation.
- Bounded by ADR `0139` AC1, which is the whole of MC2's core enforcement,
  and by ADR `0140` RL3, which is why an annotation is not a risk class.
- Bounded by ADR `0141` RN3/RN4 for who asks a person and with which words,
  which is what elicitation would take over.
- Depends on ADR `0117` for the reason sampling can never be built, and on
  ADR `0116` W2 with ADR `0136` BR3 for what a tool result is on arrival.
- Routes the credential through ADR `0138` CO1 and keeps it out of host
  configuration under ADR `0104`.
- Keeps ADR `0118`'s floor honest for a supplier that could have claimed it
  by declaration.
- Adds no row to ADR `0026`'s map, and says why.

## References

- [ADR 0026](0026-product-terminology-and-naming.md)
- [ADR 0030](0030-foundation-api-exposure-and-local-trust-boundary.md)
- [ADR 0036](0036-capabilities-connectors-and-mcp-boundary.md)
- [ADR 0104](0104-settings-belong-to-pico-not-to-host-configuration.md)
- [ADR 0116](0116-untrusted-content-and-self-replicating-prompt-threat-model-and-hardening-gates.md)
- [ADR 0117](0117-planner-reader-split-and-origin-aware-data-flow-policy.md)
- [ADR 0118](0118-offline-and-model-free-degradation-contract.md)
- [ADR 0127](0127-pico-modules-mandatory-delivery-independent-code-declared-dependencies.md)
- [ADR 0128](0128-home-assistant-is-a-host-not-a-frame-and-the-effect-bearing-module.md)
- [ADR 0133](0133-derive-from-the-source-until-the-medium-is-known.md)
- [ADR 0136](0136-pico-bridges-and-libraries-the-slot-is-the-contract.md)
- [ADR 0137](0137-suppliers-are-instances-coverage-decides-whether-they-add-up.md)
- [ADR 0138](0138-reaching-outside-costs-something-and-is-off-until-someone-says-so.md)
- [ADR 0139](0139-every-action-is-requested-by-someone-pico-does-not-trust.md)
- [ADR 0140](0140-pico-rules-decide-from-a-closed-input-and-are-not-themselves-an-action.md)
- [ADR 0141](0141-the-runner-executes-what-was-decided-and-history-is-a-view.md)
- [ADR 0143](0143-a-depot-ships-what-it-runs-and-a-new-commit-is-a-new-decision.md)
