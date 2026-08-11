# 0143 - A Depot Ships What It Runs, and a New Commit Is a New Decision

## Status

Accepted as the distribution contract for suppliers: where a Pico Bridge or
a Pico Library comes from, how it arrives, what pins it and what runtime it
is given. **DP1-DP7 are implemented and DP8 in its consent half**
(2026-08-11); DP4 landed together with ADR 0136 BR2, because the two are one
boundary stated from opposite sides. What is left is what a real depot would
bring: the `git` fetch, the per-attachment scratch area and the scheduler
generalisation. Nothing here has yet met a depot that exists.

Decided in conversation on 2026-08-11, from an ask that was a product
decision rather than an engineering one: **as few mandatory bridges as
possible, and today none.** Two sub-questions were put to the user
separately and are marked in the text where they land - the manifest names
an entry point rather than a command (DP3), and what runs is vendored
(DP2). Everything else here follows from those two plus ADR 0136's boundary.

This was drafted as 0142 and renumbered. ADR 0142 was cut the same day for
the model provider entry, and reusing the number would have pointed two
different contracts at one identifier.

## Context

ADR 0136 says what a supplier is, ADR 0137 what happens when there are
several, and ADR 0138 what one costs. **None of them says where a
supplier's code comes from.** All three describe a supplier that is already
present, and the sentence that makes that gap load-bearing is ADR 0136's
own: a supplier is "the least trusted code in the system". Code that is
least trusted and has no stated arrival path arrives however the first
implementation happens to feel like.

**ADR 0127 decided the opposite rule for modules, and it must not be
extended here.** Modules ship with the product, are a closed list, and are
verified by `module:check` over the release. That is right for a calendar
and wrong for a VesselFinder client: the core would grow by one dependency
for every outside system anybody ever wants, and the closed list would stop
being closed in practice while still claiming to be.

**The reference model is HACS, with one correction.** Home Assistant's
community store attaches *repositories*, and a repository provides one or
several integrations - not one repository per integration. The correction
is the part HACS itself names: its integrations run in the core process, so
attaching a repository is attaching code with full access. ADR 0136 already
refused that shape ("In-process suppliers, as Home Assistant does it"), so
the distribution model can be borrowed while the trust model cannot.

**ADR 0122 governs one update path and this is a second one.** That ADR
pins actions to commit SHAs, pins the base image to a digest, pins the
package manager to an integrity hash, and refuses a build that reads
anything mutable. All of it is about *Pico's* release. A depot is a channel
into a running installation that ADR 0122 has no sentence about, and a
depot that auto-followed its default branch would be a remote party pushing
code into a Pico between releases.

**The motivating case already arrives by `git`.** `rchkb` is a self-hosted
Gitea repository, cloned to every Vault under ADR 0136 because it is
essential knowledge rather than an optional corpus. Whatever fetches a
depot and whatever fetches a library are therefore the same mechanism, and
that observation is what decided DP2.

## Scope

Covers: what a depot is; how supplier code arrives and what pins it; what
runtime a supplier is given and what it may not be given; how supplier code
is checked; how several suppliers stack behind one attachment; where a
depot lives in the custody model; how a protocol version mismatch ends; and
what runs during preparation.

Does not cover:

- what a supplier is, what it may produce and where its code runs
  (ADR 0136);
- plurality, coverage and instance identity (ADR 0137);
- credentials, cost, disclosure and the three reach decisions (ADR 0138);
- Pico's own release and update integrity (ADR 0122), which this borrows
  from and does not change;
- discovery, browsing or a store surface. A depot is attached by someone
  who already knows its address;
- signing or reputation for third-party depots, named under Consequences
  as the residual risk it is.

## Decision

### A depot is a repository, and it carries several suppliers

A **Pico Depot** is an attached git repository that provides one or more
suppliers. It is not one repository per bridge, for the reason HACS found
first: a person who wants three related bridges should make one decision,
and an author who fixes one bug should cut one release.

A depot is a delivery vehicle and nothing else. It has no slot, produces no
content, holds no credential and answers no question. The things inside it
do all of that, and they do it under ADR 0136's rules unchanged.

**Today there are no mandatory depots and no mandatory bridges.** The tree
ships a `bridges/` depot so that development has somewhere to happen, and
that depot is a depot like any other rather than a privileged one (DP6).

### What runs is in the repository

*The user's decision, 2026-08-11.* A depot vendors its dependencies. There
is no package manager step, no registry, and no network access at
attachment time beyond the `git` fetch itself.

The argument is the one the knowledge base already makes. `rchkb` arrives
by `git`; if a depot arrived by `git` **plus** npm, an installation would
have two fetch paths, two integrity stories and two ways to be offline. One
fetch path means the commit means what it appears to mean: everything that
will execute is inside it, and a reviewer who reads the commit has read the
code.

It also removes the failure that has no good handling. A depot whose
lockfile resolves at attachment time can resolve differently tomorrow, on a
machine that may be offline, for a person who cannot be asked. Vendoring
turns that from a runtime condition into a property of the commit.

The price is real and is stated rather than waved through: depot
repositories are larger, and their authors carry dependency updates by
hand.

### A depot names an entry point, not a command

*The user's decision, 2026-08-11.* A depot's manifest names a **file to
enter**, and Pico calls it with a runtime Pico already ships. It does not
name a command line, an interpreter, an argument vector or a shell string.

The difference is where the authority sits. A command line makes the
manifest a place where "run anything on this machine" can be written, and
every guard after that is a guard on a decision already made. An entry
point makes the manifest a place where "here is my code" can be written,
and Pico decides what runs it.

**A consequence is decided with it: a bridge is written in the runtime Pico
brings.** There is no Python bridge, no Go bridge and no compiled bridge,
because there is no field in which a second runtime could be requested.
That is a narrowing, and the narrowing is the point - it is also what keeps
ADR 0136's process boundary describable, since the process on the far side
of the socket is one Pico started with an executable it chose.

### A new commit is a new decision

A depot runs at a **commit a person accepted**. A newer commit on the same
branch is an offer, not an update: nothing is fetched into use, and no
supplier changes behaviour, until someone decides again.

This is ADR 0122's posture carried into the second update path. That ADR
refuses a build that reads anything mutable; a depot that followed a branch
would be an installation that executes whatever a remote party pushed. The
same argument that pins an action to a SHA pins a depot to a commit.

It also gives ADR 0136 BR6's pin a matching shape at the code level. A
library is pinned to the commit its content was read at; a depot is pinned
to the commit its code runs at. Content and code are pinned by the same
kind of fact, which is what lets a person answer "what changed" with one
question instead of two.

### Supplier code has its own check, and it states the opposite of `module:check`

`module:check` asserts that a module reaches nothing it should not:
seventeen probes, an eighteenth since ADR 0140 RL4, and an import hull that
holds the tray budget. A bridge fails almost all of it by design, because
reaching an outside system is its whole job.

So supplier code gets **its own check with the inverse statement**: a
supplier may reach outward, and may not reach

- into core internals - it speaks the slot contract from ADR 0136 BR1 and
  nothing else;
- into a second runtime, which DP3 already made unwritable and this makes
  unreachable;
- into another supplier's material, its scratch area or its credential.

Putting bridges under `modules/` was the alternative, and it has exactly
two outcomes: either `module:check` is weakened until it passes for
bridges, in which case it stops holding for modules, or every bridge fails
it forever and the failure becomes noise. A separate root and a separate
check keep both statements true at once.

### Suppliers stack, and the core sees one

A supplier may sit on another. The `rchkb` case is the shape: a git
supplier underneath doing transport, pin verification and the large-pull
consent, and a knowledge-base supplier above it doing extraction and
indexing.

**Only the top one is attached.** The lower one is not separately
configured, does not appear as an instance under ADR 0137, and inherits the
Private Space, the credential and the ADR 0138 CO3/CO4 reach decisions of
the attachment above it. This is ADR 0127's activation shell applied one
level down: the person made one decision about one thing, and the
composition beneath it is the author's business.

The rule that makes this safe is a boundary, not a habit. **Stacking inside
one depot is composition; stacking across depots is an unmediated trust
edge and is refused.** Within a depot, one author is responsible for both
halves and one commit pins both. Across depots, attaching A would silently
attach B - a second party, a second commit and a second update path that
the person never saw. That is the supply-chain move this ADR exists to
prevent, so it is written down rather than left to be discovered.

**The process boundary lies between the stack and the core, not between
the layers.** ADR 0136 requires supplier code to run out of process; it
does not require each composed layer to be its own process, and charging a
process per layer would make composition expensive enough that authors
would flatten it back into one unreviewable blob.

### A depot lives in no space; its suppliers do

ADR 0137 IN5 puts every supplier instance in exactly one ADR 0075 Private
Space, because what it produces is memory that has to be shreddable. A
depot produces nothing, so it has nothing to place.

Two instances from one depot may therefore sit in two different spaces, and
detaching one does not touch the other. Shredding a space reaches every
supplier instance in it and every item those instances produced; the depot
survives as what it is, which is a checkout of somebody else's code.

The depot Pico ships in `bridges/` is not an exception to this or to
anything else here. It is pinned to the release like an external depot is
pinned to a commit, it is checked by the same check, and a supplier inside
it is attached the same way. A shipped depot that skipped the rules would
be the mandatory-bridge outcome arriving through a side door.

### An unknown protocol version is refused, not negotiated

A supplier declares the slot-contract version it speaks. A core that does
not know that version **refuses the supplier** and says so as an ADR 0138
CO2 condition. It does not fall back, does not adapt and does not accept a
subset.

Negotiation is the alternative and it fails in a specific way: the code
that decides what an old supplier still supports lives in the core, grows
one branch per version, and every branch is a path through which a supplier
can select the core's behaviour. Refusing keeps the compatibility question
in one place - the depot's commit, which a person is already deciding about
under DP4.

This is also what keeps ADR 0134 true after suppliers exist. That ADR lets
internal formats be revised in place until the first kept identity, and
ADR 0136 already named the supplier protocol as the one identity that
becomes kept. Refusal is how a kept identity behaves; negotiation would
make it a range.

### A depot's work is a scheduled task, and its workspace is not a store

Fetching and preparing run as **tasks on Pico's scheduler**, not as
resident processes. There is nothing to supervise, no restart behaviour to
define, and the Companion tray budget from ADR 0113 is untouched.

`startPicoTimeBoundScheduler` does one thing today and generalising it is a
rebuild, so it should stay small: a task is an identifier, an interval and
a request it makes. The request part matters, because it means a scheduled
fetch is an ADR 0139 action request like any other and gets ADR 0140's
decision, ADR 0141's runner and the same history - rather than a second
privileged path that runs while nobody is looking.

**A large pull is not a bridge feature.** A size threshold turns the
scheduler's `allow` into `require_approval`, and ADR 0141 RN4's
presence-bound expiring approval and RN3's statement built from the
executing fields do the rest. One consent mechanism, not two. ADR 0138
CO3/CO4 stand in front of it as a standing precondition.

Each attachment gets a **scratch area** for the work: explicitly transient,
not backed up, not shredded because it holds nothing anyone decided to
keep, and removed when the attachment is removed. It is a workspace, not a
store, which is what keeps ADR 0127's "a supplier owns no storage" true
while still letting an extractor unpack a 1.4 GB corpus.

### Preparation is mechanical

Pulling text out of documents, chunking it, indexing paths and titles: all
of it runs **without a model**. Summarising and embeddings are a layer
beside that path and never inside it.

This is not a preference. ADR 0136 put a library's read path in ADR 0118's
`local_recall` family, and `offline:check` walks that path's import hull
and fails on a model or a network reachable from it. "As much as possible
without model interaction" is therefore a gate outcome rather than a rule
someone remembers, and a depot whose extractor imported a model provider
would fail the release rather than degrade quietly at runtime.

### The names

One new row in ADR 0026's terminology map:

| Product term | Technical / legacy term | Meaning |
|---|---|---|
| Pico Depot | Custom repository / add-on source | Attached repository that provides one or more suppliers, pinned to a commit and holding no authority of its own. |

Wire names follow ADR 0026's rule: `pico_depot.*`.

`Source` was the working word through the whole design conversation and
must not become the term. This tree already uses "the source" for the thing
a supplier draws from - ADR 0133 is titled "derive from the source until
the medium is known", and ADR 0136 uses it for the remote a library is
read from and for the outside system a bridge reaches. A depot and a
library's source would then be one word for two boundaries, which is the
failure ADR 0128 spent an ADR undoing and ADR 0136 refused a second time
for the preload bridge.

`Depot` was chosen because it implies delivery without authority, which is
ADR 0026's core rule: a depot holds goods and hands them over, and nothing
about the word suggests it decides anything. `Repository` is git's own word
and would blur the depot with every other repo in the tree. `Store` implies
commerce and collides with the storage sense used everywhere in this
codebase. `Shelf` reads well beside Pico Library and fails on bridges,
which are not shelved. `Catalog` collides with Action Catalog, `Add-on`
with the Home Assistant host ADR 0128 separated, and `Channel` with
transport.

## Rejected alternatives

### One repository per bridge

The first shape considered, and the user corrected it in the same sentence
that raised it: "eigenes Repository ist vielleicht übertrieben". It makes a
person decide three times about three related bridges, makes an author cut
three releases for one fix, and multiplies the number of pinned commits an
installation has to track by the number of bridges rather than by the
number of parties trusted.

### Install dependencies from a package manager

The conventional answer, and the one vendoring replaces. It gives an
installation a second fetch path with its own integrity story, makes
attachment fail offline for reasons unrelated to the depot, and lets the
same commit produce different code on two machines or on two days. ADR 0122
pins the package manager itself with an integrity hash for the build; a
depot that resolved at runtime would have less protection than the build
does, at the point where the code is least trusted.

### A command line in the manifest

The obvious implementation and the one that ends this ADR's usefulness. A
field that can hold `python3 ./run.py` can hold anything, so every
protection after it is a protection applied to a decision that was already
made elsewhere. Refused as question 1 on 2026-08-11.

### Follow the depot's default branch

Convenient, and the thing HACS users expect. It also means a remote party
can change what runs inside a Pico without anyone deciding, which is
precisely what ADR 0122 refuses for Pico's own build. An offer that has to
be accepted costs a click and buys the property that the code running today
is code someone chose.

### Bridges under `modules/`

Cheaper by one root folder and one check. It forces `module:check` either
to weaken until bridges pass - which removes the guarantee for the modules
that need it - or to fail for every bridge forever, which turns a check
into noise. Two statements that are opposites need two checks.

### A process per stack layer

Superficially more rigorous. It charges a process boundary for
composition, which makes an author who wants a clean two-layer design pay
for it and rewards flattening both layers into one file. The boundary that
matters is between foreign code and the core, and it is already there.

### A resident sync daemon

The shape a sync feature usually takes. It adds a supervised process, a
restart policy, a crash surface and a share of the ADR 0113 tray budget, in
exchange for work that happens on an interval anyway. A scheduler task has
none of that and inherits the action path's decision and history for free.

### Ship the essential bridges in the core

Tempting for `rchkb`, which every Vault holds anyway. It would make the
core grow one dependency per outside system, put third-party protocol
handling inside the process ADR 0136 keeps foreign code out of, and end the
closed module list in substance while keeping it in form. The knowledge
base is essential *content*; that is ADR 0136's question and it is answered
without making the code that fetches it mandatory.

### Negotiate protocol versions

The compatible-sounding option. Every negotiated version is a branch in the
core through which a supplier chooses core behaviour, and the branches
never get removed because removing one breaks somebody. Refusal keeps
compatibility a property of a commit a person accepted.

## Gates

- **DP1 - A depot is attached at a commit (implemented 2026-08-11):**
  `@pico/protocol/depot` carries the pin and the offer; migration
  `0007_pico_depot_attachment` carries them at rest.

  **The enforcement is the absence of a field.** There is nowhere in a
  depot record - in the type or in the table - to write a branch, a ref, a
  tag or a channel, so "track main" is not a configuration this system can
  express. That is stronger than a rule against auto-updating, because a
  rule needs something to keep obeying it and an absent field needs
  nothing. A caller reaching for one of those names is refused under
  `pico_depot_cannot_follow_a_ref` rather than as a shape failure, because
  it is not a typo - it is a request for the thing this gate exists to
  prevent, and it should be told so. The schema has no branch column and
  the parser has no branch field: two places saying the same thing rather
  than one saying it and one hoping.

  **A newer commit is an offer, and reading one changes nothing.**
  `picoDepotOffer` compares what is running against what a fetch saw and
  answers `null` when they match, because an up-to-date depot has no
  decision to put in front of anyone. There is no `apply`. The one route
  across names the commit, so accepting is a decision about a specific
  revision rather than about "the update", and an offer that moved between
  the question and the answer is refused - the difference between a person
  having agreed to run *this code* and having agreed to run whatever was
  newest when they clicked. The store adds a second refusal the protocol
  cannot make: an offer computed against a row that has since moved is
  stale, because an acceptance built on an old reading would move the
  depot from somewhere the person was not looking at.

  **A depot is identified by its remote, which is the opposite of an
  instance and deliberately so.** ADR 0137 IN1 makes a supplier instance a
  person-chosen token *because* a working copy moves and a camper van's
  Home Assistant changes address at every campsite - the identity has to
  survive the address. A depot is not a thing in a person's life; it is
  the place code comes from, and if the place changes it is a different
  place. Pretending otherwise would let a rename silently redirect what
  executes.

  Two things fall out of the schema. It holds **no privacy domain**, which
  is DP6 as a property rather than a promise: a column there would have
  made two instances from one depot in two different spaces impossible to
  express, and would have put a delivery vehicle inside a person's privacy
  boundary. And the new store answers ADR 0119 Q5 like any other, at 100
  rows - tighter than supplier attachments because one depot provides
  several suppliers, and because attaching one is the heavier of the two
  decisions: it is a decision about code that will execute rather than
  about material to read.
- **DP2 - What runs is vendored (implemented 2026-08-11):**
  `supplier:check` refuses three shapes over the depot root, and each is a
  different way of expecting to resolve something. A **lockfile**, because
  vendoring means there is nothing to resolve, so one is either dead weight
  or a plan. An **unvendored dependency**, where `package.json` names a
  package not in the tree - that depot runs on whatever a registry hands it
  on the day it is attached, on a machine that may be offline. And an
  **install script**, which is arbitrary code executing before the process
  boundary, before consent, and before the person has seen what they
  attached. `git` stays the one fetch path, the same one ADR 0136 BR6
  already uses for a tracked library.

  Open here: nothing in the rule. What is missing is the fetch itself,
  which needs a real depot to fetch.
- **DP3 - An entry point, not a command (implemented 2026-08-11):**
  `@pico/protocol/depot-manifest` carries a path to a file and no field in
  which an interpreter, an argument vector or a shell string could be
  written - the absence-of-a-parameter construction ADR 0117 X1 uses for
  `picoReaderCapabilities` and ADR 0136 BR3 uses for an origin class. Pico
  supplies the runtime.

  **Thirteen command-shaped names are refused under one named error**, not
  ignored, which is this gate's own rule applied to itself: a field that is
  quietly dropped is a field an author believes in, and an author who
  believes `interpreter` works ships a bridge that only runs by accident.

  A process launch has three parts - the program, its arguments and its
  environment - and all three are absent, because removing only the program
  would leave two thirds of a spawn configurable by a third party. `env` is
  the one that looks harmless and is not: it is how configuration, and
  eventually a secret, would reach supplier code outside the single custody
  path ADR 0138 CO1 allows and outside ADR 0104's refusal to put a per-Pico
  decision in host configuration.

  **The sharp case is an entry point that *is* a command line.** `node
  ./run.js` has to fail as a path rather than succeed as an instruction, so
  the pattern refuses whitespace, refuses traversal and an absolute root,
  and accepts `.js` or `.mjs` only - DP2 vendors what runs, so a depot ships
  built code, and compiling a third party's source would be a second runtime
  under another name.

  **A depot declares what it provides; a person decides where it lands.**
  There is no `privacyDomain` in a declaration, and a manifest carrying one
  is refused by name rather than as a shape failure, because ADR 0137 IN5
  says plainly that there is no safe default for that mapping - it is a
  person's judgement about their own life, and a depot choosing it would be
  a third party setting a privacy boundary at attachment time for material
  it has not seen. `picoDepotSupplierNeedsFromPerson` makes the gap a value
  rather than a comment, and a test walks a declaration through
  `parsePicoSupplierManifest` to show it is unattachable until the person's
  decision is added and attachable the moment it is.

  A depot that provides nothing is refused, as are two suppliers under one
  name and two suppliers entering one file - the second because one
  supplier wearing two names makes ADR 0137 IN2's coverage question
  meaningless when the same code answers both.

  `supplier:check` reads `bridges/pico-depot.json` when it exists, through
  the product's own parser rather than a second one, and refuses an entry
  point that points at no file. That is DP6 in practice: the shipped depot
  meets the same contract an external one does.

  **Building this exposed a hole DP4 had.** Requiring `.js` entry points
  meant the reach scanner, which walked `.ts` only, would have passed every
  real vendored depot without looking at it - and its relative-import
  resolution would have stopped at a bridge's first `./helper.js`. Both are
  fixed, and a two-file vendored probe now fails on a `node:child_process`
  import two levels deep.
- **DP4 - Supplier code has its own check (implemented 2026-08-11):**
  `pnpm supplier:check` walks `bridges/` with the inverse statement to
  `module:check` - outward reach permitted, three things refused - using
  the import-hull method that exists twice already, in ADR 0129 SR5's
  sensor hull and the companion tray hull. It carries ADR 0136 BR2 in the
  same script, because a boundary checked from one side only is a boundary
  half checked, and the two statements are opposites.

  **Core internals are refused, and the protocol barrel with them.** A
  supplier speaks ADR 0136 BR1's slot contract and the transport that
  carries it - five subpaths - and nothing else. `@pico/protocol` itself is
  refused *because* it is the polite-looking way to depend on the protocol:
  it re-exports the whole surface, so allowing it would have made every
  other rule here decorative. The runtime list is read from the tree rather
  than enumerated, so a package added later is covered without anyone
  remembering.

  **The second-runtime ban is where DP3 gets teeth.** DP3 removes the
  manifest field in which a command could be written; without this,
  a bridge would take one anyway in four lines. `node:child_process`,
  `node:worker_threads`, `node:vm`, `node:module`, `node:inspector`,
  `eval` and `new Function` all end with code running that Pico did not
  start, so all of them are refused.

  **The permitted half is proved as carefully as the refused half.** A
  positive probe asserts that `node:https`, `node:net`, `node:fs` and
  `fetch` pass, because the way this check fails is not by being too weak
  but by drifting into being `module:check` under another name - at which
  point every bridge in the tree fails for being a bridge. A second probe
  asserts that prose is not code, which is not hypothetical: the check's own
  comments name every specifier it refuses.

  Eight negative probes run the real scanner over a virtual tree on every
  gate run, in `check-offline-floor.mjs`'s shape. They are what makes this
  worth anything today: `bridges/` is empty, an assertion over nothing
  proves nothing, and a scanner nobody has seen fail is a scanner nobody
  knows works. The check says so on success rather than letting exit zero
  imply more than it means.
- **DP5 - Stacking is composition inside a depot and refused across depots
  (implemented 2026-08-11):** a declaration may carry `dependsOn`, and
  `picoDepotTopLevelSuppliers` answers which suppliers a person actually
  attaches - the lower layer is not one, so ADR 0137 sees a single
  instance and the stack beneath it inherits space, credential and the
  ADR 0138 CO3/CO4 decisions of the attachment above. That is ADR 0127's
  activation shell one level down: the person made one decision about one
  thing, and the composition beneath it is the author's business.

  **Cross-depot stacking is not refused; it is unsayable.** `dependsOn` is
  a bare identifier resolved inside this manifest, so there is no field in
  which a second depot could be named - attaching one party cannot silently
  attach a second, which is the supply-chain move this ADR exists to
  prevent. A dependency naming something the depot does not contain is
  refused, as is a cycle and a self-dependency; `picoDepotSupplierStack`
  refuses a cycle again at its own boundary, because it is exported and a
  hand-built manifest is a caller's mistake rather than a reason to loop
  forever.
- **DP6 - A depot lives in no space, and the shipped one is not special
  (implemented 2026-08-11):** `pico_depot_attachment` has three columns and
  no privacy domain, asserted against the live schema rather than promised
  in prose. Tests place two suppliers from one depot in two different
  spaces, detach one and leave the other and the depot standing, and detach
  the depot while every supplier decision stays exactly where it was - a
  depot is a delivery vehicle, so removing it removes the record of where
  code came from and nothing about what a person decided.

  The in-tree `bridges/` depot holds no privilege an external one lacks:
  `supplier:check` walks it with no exemption, and reads
  `bridges/pico-depot.json` through the product's own parser rather than a
  second one written for the occasion.
- **DP7 - An unknown protocol version is refused (implemented
  2026-08-11):** a declaration carries `protocolVersion` and
  `assertPicoSupplierProtocolVersion` refuses anything outside
  `picoSupportedSupplierProtocolVersions` under its own error, so a surface
  can say *this supplier speaks a version this Pico does not know* - the
  person's remedy is a different depot commit, not a bug report. No code
  path translates between versions.

  The supported set is **enumerated rather than expressed as a range**,
  because a `>=` would let every future version through on the day it is
  written; widening it is an edit somebody makes on purpose. This is the
  point at which ADR 0134's "first kept identity" becomes real for the
  supplier protocol: refusal is how a kept identity behaves, and
  negotiation would have made it a range.
- **DP8 - Fetching is a task and the workspace is not a store (part
  implemented 2026-08-11):** the consent half is built and the runtime half
  is not.

  **A task is an identifier, an interval and a request it makes**, and the
  third field is the load-bearing one: a task does not *do* something, it
  asks, which routes scheduled work through ADR 0139's request, ADR 0140's
  decision and ADR 0141's history rather than beside them. A task that
  acted directly would be a second privileged path running while nobody is
  looking - what ADR 0138 CO4 separates from answering a question. The
  interval has a floor, because at a one-second cadence that distinction
  stops meaning anything.

  **A large transfer becomes a question through the mechanism that already
  exists.** `picoActionEscalations` is a closed, named list and
  `escalatePicoRulesDecision` **only ever tightens**: an `allow` becomes
  `require_approval`, a `deny` stays a `deny`, and no escalation cancels the
  ADR 0140 RL3 floor or the ADR 0138 CO3 precondition. That direction is
  the whole safety of letting a requester influence a decision - this is a
  caller saying *ask about this one*, never *do not bother asking*. Named
  rather than a boolean for ADR 0140 RL3's reason: a reason has to reach a
  surface that can act on it, and "the scheduler said so" is not something
  a person can answer. An unestimatable transfer escalates, in ADR 0119
  Q5's posture that the one case which cannot be measured must not be the
  one case that is unprotected.

  Building it turned up a gap in the recorded decision. The `reason` field
  carried the ADR 0140 RL3 codes, which cover *refusals*, and nothing
  covered a request being **tightened** - so a person asked about a
  two-gigabyte clone would have been asked with no reason attached. An
  escalated decision now names what escalated it, on the fact and on the
  record.

  **The scratch area landed on 2026-08-11** and is defined by what it is
  not. It is absent from `picoDurableStores`, which means no ADR 0119 Q5
  ceiling, no place in the shred cascade, no backup exclusion and no Q3
  byte-identity obligation - ADR 0129 SR2's five questions are not answered
  because there is nothing to answer them about, and a test asserts the
  absence rather than trusting the reading. It is not the supplier's to
  choose either: a path is handed over in a request the way `git-library`
  is handed a working copy, and the identifier is validated against
  ADR 0137 IN1's pattern, because a supplier whose identifier could contain
  a slash would be a supplier picking a place on the disk.

  **Removal is reconciled rather than trusted.** `detach` deletes the
  directory and `removeOrphans` deletes every directory no attachment
  stands behind - ADR 0070's tombstone posture applied to files, and for
  the same reason: a detach interrupted between the row and the files would
  leave a person's material on disk after they detached the thing that put
  it there, and they would believe it was gone. It deletes rather than
  shreds, deliberately, because claiming unrecoverable erasure for a
  temporary directory on an ordinary filesystem would be claiming a
  guarantee it cannot make.

  **The fetch landed on 2026-08-11, and it is where the pin stops being
  bookkeeping.** DP1 said a depot runs at a commit a person accepted; until
  `fetchPicoDepot` existed that was a statement about a database row, and
  nothing checked that the code on disk was the code in the record.

  `git` is invoked as an external program, which is DP2's one fetch path
  rather than a reimplementation. **No ref name appears anywhere in it** -
  `git fetch <remote> <commit>` and a detached checkout - so DP1's missing
  branch field is a missing *argument*, and a remote whose default branch
  moved produces the same tree. Proved end to end: with the remote's branch
  at a second commit, pinning the first produces the first.

  **What arrived is verified against what was accepted.** A fetch that
  succeeded is not evidence that the right thing arrived, because a remote
  can serve whatever it likes, so `HEAD` is read back and a mismatch
  removes the tree and throws. That one is not a condition: an unreachable
  remote is the world failing, and a remote serving a different commit is
  the remote disagreeing with a decision a person made - leaving the tree
  would leave code nobody accepted on disk.

  Everything else is an ADR 0138 CO2 condition rather than an exception, so
  a person's remedy is a network rather than a bug report. The fetch is
  idempotent: a working copy already at the pin costs one `rev-parse`,
  because a scheduled fetch that always clones is a schedule people
  lengthen.

  `file://` joined the remote pattern with it. A local depot is a real case
  - development, and an installation that never reaches a network - and it
  is still an address, which a bare path is not: `../depots/bridges` is a
  position relative to whoever is asking.

  Open: the `startPicoTimeBoundScheduler` generalisation, and the
  `offline:check` line over a preparation path, which needs a preparation
  path to walk.

**One state is deliberately unnamed.** A library that is attached, whose
credential is present, and whose clone has not finished is neither
`not_configured` nor `unreachable`, and ADR 0136 already says why it needs
its own name: without one it presents as a defect. It is not invented here,
because this design session invented vocabulary three times and withdrew it
three times, and because the honest place to name it is the commit that
first has a supplier in that state.

## Failure ledger

| Situation | Posture |
|---|---|
| A depot author pushes a new commit | Nothing happens. It is an offer; the attachment keeps running the accepted commit (DP1). |
| A depot's dependency is yanked from a registry | Irrelevant. Nothing resolves at attachment time; the code is in the commit (DP2). |
| A depot manifest asks to run `python3 ./run.py` | Refused under its own error. There is no field for it, and a command-shaped field is a refusal rather than an omission (DP3). |
| A bridge imports a core internal | The depot check fails, in the release rather than at runtime (DP4). |
| A depot declares a dependency on a supplier in another depot | There is no field for it. `dependsOn` resolves inside one manifest, so attaching one party cannot attach a second (DP5). |
| A person shreds a Private Space holding one of two instances from a depot | The other instance is untouched, and the depot itself is untouched. It holds nothing of theirs (DP6). |
| A supplier speaks a slot-contract version the core does not know | Refused, reported as a condition. No fallback, no partial acceptance (DP7). |
| A knowledge base needs a 2 GB initial clone | An action request that crosses the size threshold and becomes an approval, with ADR 0141 RN3's statement built from the executing fields (DP8). |
| Pico is offline when a scheduled fetch runs | The task reports `unreachable` under ADR 0138 CO2 and the library still answers from what it has, because reading is on the ADR 0118 floor (ADR 0136). |
| An extractor wants to summarise while indexing | `offline:check` fails on the model reachable from the preparation hull (DP8). |
| A third-party depot is malicious | Contained, not prevented. Process boundary, no core reach, no credential beyond its own attachment, and no authority - and the person chose the commit. Signing is not solved here; see Consequences. |

## Consequences

Positive:

- suppliers can arrive without the core growing, which is what keeps
  ADR 0127's closed module list honest instead of nominal;
- one fetch mechanism for depot code and library content means one
  integrity story, one offline behaviour and one thing to review;
- an accepted commit is a real answer to "what is running", which ADR 0122
  guarantees for the release and nothing guaranteed for this path before;
- the entry-point rule removes the single field through which everything
  downstream could have been bypassed;
- stacking lets an author compose without the core seeing more instances,
  and the cross-depot refusal keeps that from becoming transitive trust;
- sync as a scheduled task inherits the action path's decision, approval
  and history rather than running beside them.

Negative and residual:

- **third-party depots are unsigned and this ADR does not fix it.** The
  protections are the commit a person accepted, the process boundary and
  the depot check. There is no author identity, no signature and no
  reputation, and ADR 0122's attestation covers Pico's release rather than
  a depot. This is the largest open surface the ADR creates and it is named
  rather than mitigated;
- vendoring makes depot repositories large and puts dependency maintenance
  on their authors, including security updates;
- **there is no Python bridge, and no bridge in any runtime Pico does not
  ship.** For a maritime API that is nothing; for a library whose good
  extractor exists only in another ecosystem it is a real limit, and the
  answer will be to call an external binary through the process boundary or
  to do without;
- refusing a protocol version means an old depot stops working on a new
  Pico with no grace period, and the person's only move is to update the
  depot or detach it;
- a person attaching a depot is deciding about code they did not read, in a
  system whose other decisions are all about content. The interface has to
  say which kind of decision it is asking for, and this ADR does not design
  that surface;
- generalising `startPicoTimeBoundScheduler` is a rebuild of something that
  currently works, and rebuilds of working schedulers have a way of
  growing;
- the attached-and-still-cloning state stays unnamed, so until it is named
  a Vault mid-clone will report something less precise than the truth.

## Relationship to other ADRs

- Completes the supplier set: ADR `0136` says what a supplier is,
  ADR `0137` what several are, ADR `0138` what one costs, and this says
  where its code comes from. None is usable alone.
- Deliberately does **not** extend ADR `0127`. Modules ship with the
  product and suppliers do not, and keeping those separate is what lets
  `module:check` keep its meaning.
- Borrows ADR `0122`'s posture for a second update path it does not cover:
  the commit determines what runs, and nothing mutable is followed.
- Gives ADR `0136` BR6's content pin a matching code pin, and keeps
  ADR `0133`'s derive-rather-than-ingest rule intact by putting preparation
  in a scratch area rather than in a store.
- Makes ADR `0134`'s "first kept identity" concrete for the supplier
  protocol through refusal rather than negotiation.
- Routes depot work through ADR `0139`/`0140`/`0141` rather than beside
  them, so a large pull uses RN4's approval and RN3's statement.
- Keeps ADR `0118`'s floor enforceable over the preparation path, which is
  what makes "without a model" a check rather than an intention.
- Adds one row to ADR `0026`'s terminology map and states why `Source`,
  the working word, cannot be it.

## References

- [ADR 0026](0026-product-terminology-and-naming.md)
- [ADR 0075](0075-foundation-local-authentication-session-and-membership-threat-model-and-scoping.md)
- [ADR 0113](0113-electron-shell-over-a-shell-free-companion-service-core.md)
- [ADR 0117](0117-planner-reader-split-and-origin-aware-data-flow-policy.md)
- [ADR 0118](0118-offline-and-model-free-degradation-contract.md)
- [ADR 0122](0122-update-and-release-integrity-threat-model-and-hardening-gates.md)
- [ADR 0127](0127-pico-modules-mandatory-delivery-independent-code-declared-dependencies.md)
- [ADR 0128](0128-home-assistant-is-a-host-not-a-frame-and-the-effect-bearing-module.md)
- [ADR 0129](0129-spatial-recall-observations-are-not-memories-and-uncertainty-is-not-origin.md)
- [ADR 0133](0133-derive-from-the-source-until-the-medium-is-known.md)
- [ADR 0134](0134-formats-revise-in-place-until-the-first-kept-identity.md)
- [ADR 0136](0136-pico-bridges-and-libraries-the-slot-is-the-contract.md)
- [ADR 0137](0137-suppliers-are-instances-coverage-decides-whether-they-add-up.md)
- [ADR 0138](0138-reaching-outside-costs-something-and-is-off-until-someone-says-so.md)
- [ADR 0139](0139-every-action-is-requested-by-someone-pico-does-not-trust.md)
- [ADR 0140](0140-pico-rules-decide-from-a-closed-input-and-are-not-themselves-an-action.md)
- [ADR 0141](0141-the-runner-executes-what-was-decided-and-history-is-a-view.md)
