# 0143 - A Depot Ships What It Runs, and a New Commit Is a New Decision

## Status

Accepted as the distribution contract for suppliers: where a Pico Bridge or
a Pico Library comes from, how it arrives, what pins it and what runtime it
is given. **DP1-DP8 are open** and nothing is implemented.

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

- **DP1 - A depot is attached at a commit (open):** a depot is identified
  by its remote and pinned to a commit, an attachment records which commit
  it runs at, and a newer commit is presented as an offer that changes
  nothing until it is accepted. Nothing auto-follows a branch, and a test
  states that a moved branch head leaves a running attachment untouched.
- **DP2 - What runs is vendored (open):** the depot check refuses a depot
  that would need a package-manager step to run - no unvendored dependency
  manifest, no install script, no registry access at attachment. `git` is
  the one fetch path, which is the same one ADR 0136 BR6 already uses for a
  tracked library.
- **DP3 - An entry point, not a command (open):** the manifest carries a
  path to a file and no field in which an interpreter, an argument vector
  or a shell string could be written - the absence-of-a-parameter
  construction ADR 0117 X1 uses for `picoReaderCapabilities` and ADR 0136
  BR3 uses for an origin class. Pico supplies the runtime. A manifest
  carrying a command-shaped field is refused under its own error rather
  than ignored, because a field that is ignored is a field an author
  believes in.
- **DP4 - Supplier code has its own check (open):** a check over the depot
  root with the inverse statement to `module:check` - outward reach
  permitted, core internals and second runtimes refused, and no path from
  one supplier into another supplier's scratch area, material or
  credential. It uses the import-hull method that exists twice already, in
  ADR 0129 SR5's sensor hull and the companion tray hull.
- **DP5 - Stacking is composition inside a depot and refused across depots
  (open):** a supplier may declare a dependency on another supplier in the
  **same** depot, inheriting space, credential and the ADR 0138 CO3/CO4
  decisions of the attachment above it; a cross-depot dependency is
  refused, because attaching one party would otherwise silently attach a
  second. ADR 0137 sees one instance, and a test asserts the lower layer
  never appears as one.
- **DP6 - A depot lives in no space, and the shipped one is not special
  (open):** a depot has no Private Space, its instances have one each under
  ADR 0137 IN5, and two instances from one depot may sit in two spaces
  independently. The in-tree `bridges/` depot is pinned to the release,
  passes DP4 like any other, and its suppliers are attached the same way -
  a test asserts it holds no privilege an external depot lacks.
- **DP7 - An unknown protocol version is refused (open):** a supplier
  declares its slot-contract version, an unknown one is refused as an
  ADR 0138 CO2 condition rather than adapted to, and no code path
  translates between versions. This is the point at which ADR 0134's "first
  kept identity" becomes real for the supplier protocol.
- **DP8 - Fetching is a task and the workspace is not a store (open):**
  depot fetch and library preparation run as scheduler tasks that make
  ADR 0139 action requests, so they carry ADR 0140's decision and
  ADR 0141's history; a size threshold turns `allow` into
  `require_approval` under RN4's expiring, presence-bound approval rather
  than inventing a second consent mechanism. Each attachment holds a
  transient scratch area that is not backed up and is removed with the
  attachment. `offline:check` sees the preparation path's import hull and
  refuses a model reachable from it.

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
| A depot declares a dependency on a supplier in another depot | Refused. Attaching one party must not attach a second (DP5). |
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
