# 0136 - Pico Bridges and Libraries: The Slot Is the Contract

## Status

Accepted as a structural constraint on where content Pico did not author
enters it. The initiative and its scope were
chosen by the user on 2026-08-10, prompted by issue #4 and shaped by three
of the user's own corrections during drafting - the Framework laptop
expansion bay, which decided more of this ADR than the issue did; the
observation that a static lexicon and an attached knowledge base reach
outside at no point at all; and three Home Assistants at three addresses,
which showed that the axis along which suppliers add up is coverage rather
than kind. **BR1 and BR4 are implemented**
(2026-08-10) and **BR3 in its core half** (2026-08-11); BR2 and BR6 are
open, and BR5 moved with the cost decision.

Split on 2026-08-10 at the user's request: everything about **several**
suppliers - identity, coverage, unions, effect targeting and the privacy
domain an instance lands in - is ADR 0137, and everything a supplier costs
to use - credential, disclosure, condition states, consent to reach out -
is ADR 0138. The two are one decision in two
readable halves, applying ADR 0135's rule to an ADR rather than to a
design system.

The claim is deliberately narrow. This decides **where outside content
comes from and what it may say on arrival**. It does not decide what Pico
does with it: Pico Rules, the Action Runner and the Action Catalog stay
above everything here, and none of them exists yet.

## Context

Issue #4 asks for a VesselTracking module reaching the VesselFinder AIS
API, with a provider interface so the provider can be swapped. Issue #2
asks for a shopping list arriving through a messenger. ADR 0128 H4
declared a Home Assistant connector whose transport is a port with no
implementation. ADR 0129 SR5 declared a location sensor port with no
implementation, for the same stated reason: neither is testable without
the real system behind it. And the user keeps a personal knowledge base -
`rchkb`, attached over git - that Pico should be able to read.

Five requests, one shape. Each wants Pico to hold a domain and something
else to supply the content.

**None of them arrives once.** The knowledge base has siblings belonging
to an association or a company; Home Assistant runs at home, in a camper
van and in a holiday house. Multiplicity is the normal case rather than a
later extension, and it changes what the supplier record has to carry -
which is why ADR 0137 decides it rather than a footnote here.

**ADR 0127 does not have a place for that, and said so on purpose.** Its
scope excludes "third-party or externally authored modules, which would
need a plugin contract, capability negotiation and a per-module trust
decision - all of which this ADR avoids by shipping every module with the
product", and the decision text is blunter still: "Shipping everything is
what lets this ADR skip a plugin contract entirely. Nothing here
negotiates capabilities, spans version boundaries, or decides whether to
trust foreign code, because there is no foreign code."

That reasoning is intact. What these five introduce is not foreign *code* -
the maritime module would be Pico's own - but foreign *content*, and in
one case a foreign *dependency*: networked, credentialed and metered. No
ADR covers either.

**ADR 0036 sketched the frame years earlier and left out the boundary.**
It already decides capability first, connector second - "A capability
describes what Pico may do or ask to do. The connector or protocol
describes how that capability is implemented" - already states that the
same capability may have different providers, and already lists a
connector registry carrying identity, trust level, local-versus-cloud
execution, secrets location and available capabilities. What it never
says is where the connector *runs*, and that omission is the whole risk.

**The shape came from hardware.** A Framework laptop has four identical
USB-C bays; HDMI, Ethernet and MicroSD exist only on the outside of the
cards. The laptop does not know what HDMI is. That inverts the question
usefully: the design problem is not "what is a plugin" but **what are the
slots**, and the answer has to be a small closed set the core already
owns, or "present the data uniformly" has no target. Issue #4 shows the
failure mode by proposing four DTO families of its own.

The analogy carries its own warning. A Framework bay has no trust
boundary: USB-C carries Thunderbolt, Thunderbolt carries DMA, and a
hostile card reads memory. Framework's answer is ownership - you chose the
card. Home Assistant's answer for integrations is the same one with review
standing in for ownership, and HACS explicitly outside the safety story.
Neither transfers, because ADR 0127 states the property that makes this
codebase work: "One guard, one place, one failing test."

The analogy also carries the fix. A modern laptop does not trust the card;
it puts an IOMMU in front of it - a boundary the card cannot argue with,
independent of who made it.

**And the analogy has an edge the first draft walked over.** A lexicon, a
port-code table and a knowledge base are suppliers that reach outside at
no point. `rchkb` is concrete about the scale: 1.4 GB, 2,657 files, 534
Markdown documents beside 466 PDFs, 449 JSON files, 300 text files and 261
spreadsheets, organised into personal domains including `Finanz`, `Privat`
and `Feuerwehr`. Cloned to disk it answers without a network - and it is
also a self-hosted Gitea repository with an MCP server, which is what the
access-path rule below exists to sort out. It is not shipped with
Pico, and it is not frozen - it moves with commits. And it is the person's
own content rather than a third party's, which makes it the sharpest of
the five: Pico must be able to read it without ever pretending it owns it.

## Scope

Covers: what a slot is and what fills one; where a supplier's code runs;
what arrives with foreign content; how freshness, certainty and cache age
stay separate facts; whether a corpus is read or ingested; what detaching
means; and the product terminology for all of it.

Does not cover:

- any specific bridge or library - VesselFinder, Home Assistant, a
  messenger, `rchkb` - which are separate work under their own modules;
- model providers, which ADR 0049 already gives a registry, provider
  identity and locality, trust states, job envelope, retention modes and
  tool-use modes; a model transforms rather than supplies, and two
  registries is the correct number;
- the action path that decides whether to trigger a declared effect
  (ADR 0010, ADR 0117 X3), which does not exist;
- retrieval quality, indexing strategy or embeddings, which are a
  consumer's problem and, under ADR 0133, a cache either way;
- distribution, signing, discovery or a marketplace, which are ADR 0036
  non-goals and stay non-goals here;
- ADR 0127's module boundary, which is unchanged. A module is still
  vocabulary, composition and surface;
- everything that follows from there being several suppliers, which is
  ADR 0137: what names an instance, how coverage decides unions against
  alternatives, what a partial or empty answer owes, and which Private
  Space an instance attaches into;
- what using a supplier costs, which is ADR 0138: the credential, the
  disclosure every outbound request spends whether or not it is billed,
  the condition vocabulary, and the decisions that stand between an
  installed supplier and one reaching out unasked.

## Decision

### The core owns the slots, and there are three

A slot is a shape the core already has. The list is **closed and
enumerated** - listed, not derived, in the idiom ADR 0127 uses for module
identifiers and ADR 0119 Q2 for protective event types:

- **an observation** - ADR 0129 SR2's second store kind: capped,
  short-lived, never individually regulated. An AIS position report, a
  Home Assistant sensor state, a location fix.
- **a memory item** - ordinary core custody, optionally carrying a place
  with mandatory accuracy (ADR 0129 SR3) and a due instant
  (ADR 0118 O1). A ship's master data, a shopping list, a port call, a
  passage derived from a document.
- **an effect** - ADR 0128 H3's declared `<module>.<verb>`, outbound.

Events are deliberately not a slot. Origin is server-assigned at intake
under ADR 0116 W1; the core writes the log, and a supplier that could
write an event directly could claim its own origin.

A supplier that needs a shape the list does not have does not invent one.
The shape is lifted as a core capability under ADR 0127 M5 and migrated by
the core - which is how `due_at` and the place columns arrived - or the
supplier waits. That is the point of closing the list: without a fixed
target, "present the data uniformly" means every supplier defines its own
uniformity, and four DTO families become forty.

### Two kinds fill a slot, and the offline floor tells them apart

Both supply content Pico did not author. They agree on little else, and
the split is categorical rather than a matter of degree:

|  | Pico Bridge | Pico Library |
|---|---|---|
| Answering needs the network | yes, per query | never |
| Freshness | a measurement instant | a version or a commit |
| Cost | metered, possibly per call | none |
| Availability | typed states, may fail | attached or not |
| ADR 0118 floor | **never eligible** | **eligible** |
| Custody | produces items Pico holds | Pico holds nothing of it |

The floor is the test, and it decides cleanly. A UN/LOCODE table answers
without a network. `rchkb` answers from a working copy on disk. An AIS
query cannot, ever. ADR 0118's guarantee is against dependencies, so a
supplier that *is* a dependency cannot be inside it - while a corpus on
local disk is exactly what the floor was written to protect.

**How a library is pinned is a declared property, not a third kind.** A
shipped lexicon is frozen and verified against a pinned hash, the
mechanism ADR 0013 already runs for immutable reference assets. An
attached knowledge base tracks a git ref, and its commit id is a better
pin than a hash because it carries history. Both answer offline, neither
is metered, and both sit outside Pico's custody. Making "it updates" into
a separate kind would repeat the error ADR 0128 corrected when it made
effect-bearing a declared property rather than a fourth module kind.

**The kind follows the access path, not the material** - added 2026-08-11,
when the user pointed out that `rchkb` is not a static corpus but a
self-hosted Gitea repository with an MCP server in front of it. Both are
true at once, and the design holds because the floor test asks about
*answering*, not about what is being answered from:

- cloned to disk, it is a **library**. The working copy answers with the
  network gone, pinned by a commit. Only the fetch reaches out, which is
  why ADR 0138 gates fetching and not reading.
- reached through its MCP server, the same material is a **bridge**. Every
  question crosses a network, and a self-hosted host on a LAN is still a
  network - the camper van in ADR 0137 is exactly the case where it is
  not there.

So one corpus can be attached twice, and under ADR 0137 IN2 those two
instances are **alternatives**: same coverage, so keeping both is a choice
rather than a union. The choice is not symmetric, though. The library
survives the network going away and the bridge does not, and an index the
MCP server offers is a cache over the same source under ADR 0133 rather
than a second authority. Attaching the bridge *instead of* the library
would put a personal knowledge base behind a network dependency for a
convenience.

**MCP is a transport here, not a second boundary.** ADR 0036 settled that
already - "MCP is a tool connection method. It is not Pico authority" -
and it holds unchanged: an MCP client is a bridge's implementation, and
its output still crosses a slot where BR3 assigns the class. What MCP
does make cheap is BR2: a server that is already a separate process is a
process boundary nobody has to build.

**Not every shipped table is a library.** The test is whether it is
*chosen*. A small vocabulary every Pico carries identically is module
data and needs no concept; naming it would add a boundary without adding a
decision. A library is what a person or a deployment may select, omit or
replace.

### A supplier carries; it never decides

A supplier has **no surface, no vocabulary and no storage**, which makes
it strictly smaller than an ADR 0127 module rather than a variant of one.
A module owns vocabulary, composition and surface; a supplier owns a
mapping.

The expansion card says it: an HDMI card does not give you a video player.
The map, the AR view, the sentence a person reads and the answer to "where
is the MSC GÜLSÜN" are the core's and the module's. The bridge supplied a
place with a timestamp.

It owns no authority either, for ADR 0127's reason unchanged: if a
supplier needs a guard - readership, a quota, custody, an anchor - that
guard belongs to the core. A supplier may ask; it may not decide.

**The leak test is a sentence.** The moment any document or comment reads
"the bridge decides", "the library allows" or "the skill knows", the word
has moved into the architecture and the boundary has moved with it.

### The boundary follows the processing, not the network

A supplier's code runs **outside the core process**, reached over a
private local socket with named request families - the shape ADR 0097
already built for the Vault daemon and ADR 0100 already proved against
real ceremonies.

The first draft of this ADR tied that boundary to reaching the network,
and `rchkb` shows why that is wrong. A JSON table Pico ships and reads
with its own strict parser executes nothing and needs no boundary. A
corpus of 466 PDFs and 148 office documents is a parser being fed bytes
nobody reviewed, which is exactly where memory-safety failures live - and
it never touches a network. **The rule is therefore about processing:
extraction runs out of process wherever Pico did not author both the
parser and the bytes.**

The underlying reason is the property ADR 0127 names: every guard here is
a single place a counter-proof can knock out. That does not survive
foreign code sharing an address space, and no amount of review restores
it. This is the IOMMU, not the card vendor's promise.

Three further things follow, and they are the practical argument:

- **The offline floor stays statically checkable.** `offline:check` walks
  reachable imports. Code that arrives at runtime has no import hull to
  walk - and a bridge needs none, because it can never be in the floor. A
  library can be, and a library's *extractor* is code like any other, so
  the floor sees it where it matters.
- **`module:check` keeps its meaning** for the core and Pico's own
  modules, including the seventeen probes and the companion import hull
  that holds the tray budget.
- **ADR 0134 survives almost intact.** Only the supplier protocol becomes
  an identity someone keeps. Internal canonical byte forms stay revisable
  in place, which is what made the 2026-08-10 collapse possible and what a
  library-linked plugin contract would have ended for every format at
  once.

### A library is derived from, never ingested

ADR 0133 already decides this: derive from the source until the medium is
known, and a flattened representation is a cache, never an authority.

Ingesting 2,657 files as memory items would put a person's whole filing
cabinet under ceilings sized for memories, and ADR 0129 refused the same
move at smaller scale for a location fix. A library is **read where it
lies**. What Pico derives from it - a passage, an answer, a summary - is an
ordinary memory item under ordinary custody, carrying its origin, and the
provenance it carries includes the commit it was read at. Any index or
embedding is a cache under ADR 0133's terms, which means it names its
measured cost, its drift direction and its correction point; for a git
library the correction point is a commit id, which is unusually honest for
a cache.

**A library is attached, not held.** Pico cannot shred what it does not
own, and must never report that it did. Detaching a library stops
derivation and deletes nothing - ADR 0129 SR6's distinction unchanged:
stopping and forgetting are different acts. Derived items are Pico's and
are shredded normally, which means a domain shred reaches everything Pico
ever concluded and nothing it merely read.

### Where a supplier lands, and what happens when there are several

Both are ADR 0137. A supplier attaches into exactly one ADR 0075 Private
Space rather than into a Pico, and every real case is plural - one
knowledge base beside another, one Home Assistant per building. That ADR
decides what identifies an instance, how declared coverage rather than
supplier kind decides whether instances add up, what an empty or partial
answer owes, and why an effect must name its own instance. It is not
optional reading: this ADR describes suppliers in the singular, and
nothing here is deployable at the singular.

### Foreign content is labeled at the threshold, and the core assigns the label

Everything crossing a slot inward carries `external_content` under
ADR 0116 W2, at the threshold and never behind it. The supplier **cannot
express an origin class at all** - the core assigns it without asking,
exactly as ADR 0128 H4 settled for the Home Assistant connector.

The proof is H4's comparison, and it is the same proof because it is the
same claim: an item that arrived through a slot and an ordinary memory
item run through crypto-shred, the retention sweep and backup/restore, and
must produce identical results.

**This holds for a person's own knowledge base too, and the reason is
worth stating because it looks harsh.** The core cannot distinguish a
sentence the person wrote from one they pasted, and `rchkb` has a `raw`
and a `_manual_import` directory that say so plainly. Labeling is not a
judgement about the author; it is an admission about what the core can
verify. The consequence is real: under ADR 0117 the acting model never
receives that text, so a library is usable only through a quarantined read
job (X4) - which does not exist yet. A library is therefore placeable
today and answerable later, and this ADR states that rather than implying
otherwise.

### Asked, measured and certain are three facts, not one

A bridge answer carries at least three values that must never collapse:

- **when the bridge asked** - cache age, Pico's own bookkeeping;
- **when the outside system measured** - the AIS report instant, which
  belongs to the content and survives caching;
- **how certain the value is** - ADR 0129's second axis.

Issue #4 states the first two in its own words - "Cache-Alter und
AIS-Datenalter nicht verwechseln" - and it is right that this is where the
mistake happens. A six-hour-old position presented as a live one is not a
stale answer, it is a false one.

Certainty is the third because origin does not imply it: a value carries
Pico's own origin once derived and can still be a guess. Following
ADR 0129, a slot value is a tagged value that cannot be constructed
without its certainty, and **no supplier output may present itself as
certain** - ADR 0129's certainty is one of three levels, and confirmation
is a separate axis that only a person moves.

For a library the middle value is a commit or a version, and the same rule
applies: it is content, not bookkeeping.

### A cache is the observation buffer, and what is worth keeping becomes a memory item

Issue #4 asks for a provider-side cache with per-type TTL. Under ADR 0127
that is module-private storage, and under ADR 0129 it is unnecessary,
because the second store kind already is a capped, short-lived,
shred-cascaded buffer whose five admission questions are answered.

The split falls out of the data rather than being imposed on it. An AIS
position is a measurement and belongs in the buffer, where the 48-hour
window and the row ceiling apply. A ship's build year is not a
measurement; once resolved it becomes an ordinary memory item, exactly as
ADR 0129 compacts an observation window into one. Cost control is then a
consequence of storing observations rather than a mechanism of its own -
the same reasoning by which ADR 0129 refused to encrypt the buffer per
row.

### What it costs to use a supplier

ADR 0138. Where the credential lives, that reaching outside spends money
*and* disclosure so a free supplier is governed like a paid one, the
closed vocabulary of condition states, and the three separate decisions
between an installed supplier and one that reaches out unasked. A library
is exempt from all of it except at the moment it fetches.

### The names

Two new rows in ADR 0026's terminology map:

| Product term | Technical / legacy term | Meaning |
|---|---|---|
| Pico Bridge | Connector / provider adapter | Runs beside Pico, connects exactly one outside system, and speaks only Pico's shapes inward. |
| Pico Library | Attached or pinned corpus | A body of documents Pico may read but does not own, answering without a network. |

Wire names follow ADR 0026's rule - lowercase and namespaced:
`pico_bridge.*`, `pico_library.*`.

`Library` is chosen over `Dataset` because the same word has to cover a
port-code table and a person's filing cabinet, and because it carries the
custody rule in ordinary language: you borrow from a library, and it stays
someone else's.

**Skill was considered and fails ADR 0026's core rule**, which is why it
is recorded here rather than in a comment. Product names "must not imply
authority, ownership, trust, rank or control that the component does not
have", and a skill is an ability - the one thing a supplier does not have.
The design rule seals it: "Never let a nicer name hide a weaker boundary."
A third-party bridge is the weakest boundary in the system and `Skill` is
the friendliest available name for it. The Alexa reading makes it worse:
that skill owns its intents, its dialogue and its voice, which is
ADR 0127's module, not this.

`Card` collides with the Recovery Card, `Add-on` with the Home Assistant
host that ADR 0128 spent an ADR separating, `Connector` and `Provider`
with ADR 0127's module kinds, `Capability` with ADR 0036 and ADR 0127 M5,
and `Link` with Pico Link.

**`Bridge` is not free either, and the residual is stated rather than
waved through.** The word is this tree's most reused generic noun -
renderer bridge, option bridge, typed bridge, worker bridge. Most of that
is harmless: the `Pico ` prefix is how ADR 0026's map already separates
Pico Link from a link and Pico Home from a home. One case is not harmless.
The Companion's Electron preload bridge is itself a security boundary with
nine named methods, and two boundaries under one word is the failure
ADR 0128 had to spend an ADR undoing. It is therefore always **the preload
bridge** - Electron's own term, qualified - and never "the bridge" in
companion documentation.

## Rejected alternatives

### Turn ADR 0127's modules into plugins

The proposal this ADR started from. It blurs two questions that are
currently clean: ADR 0127 decides where a product feature lives in the
tree, ADR 0036 decides where a capability's implementation comes from. A
supplier is not a kind of module; it is the slot beneath one, and issue #4
draws that line itself - "VesselFinder ist damit Provider, nicht
fachlicher Modulname." Converting also costs the closed module list and
the static offline check, and buys nothing a slot does not.

### One concept covering bridges and libraries

The shape this ADR had until the user asked what happens to a static
lexicon, and the objection was correct. It bundled two independent
properties - *authored elsewhere* and *reached at runtime* - into one word,
the same error ADR 0128 corrected when it made effect-bearing a declared
property rather than a fourth module kind. The offline floor separates
them categorically, so one word would have had to lie about one of them.

### A third kind for attached knowledge bases

Considered when `rchkb` arrived, and refused for the reason that produced
the second kind in the first place. Frozen and tracked libraries differ in
how they are pinned and in nothing else that matters: both answer offline,
neither is metered, neither is Pico's to delete. Pinning is a declared
property.

### In-process suppliers, as Home Assistant does it

The honest description of HA's model is that there is no boundary: an
integration runs in the core process with full access, safety comes from
reviewing the ones in core, and HACS sits outside that story by design. It
works for HA because HA does not have this threat model. Here, one
in-process supplier turns every single-place guard into several places.

### Ingest the knowledge base into memory items

The obvious implementation and the one ADR 0133 exists to prevent. It
turns 1.4 GB of someone's life into rows under ceilings sized for
memories, makes every ADR 0119 Q5 limit a function of how much a person
happens to have written, and creates a second copy that drifts from the
first the moment a commit lands. Derivation keeps one authority.

### Let each bridge define its own DTOs

Issue #4's structure, and the reason the slot list is closed. Normalizing
inside the supplier puts the judgement in the one place that cannot be
checked, and leaves the core with as many shapes as it has suppliers.

### Treat model providers as suppliers

ADR 0049 already has a provider registry, provider identity and locality,
trust states, supported job types, input classes, retention modes,
tool-use modes and a result envelope. A model transforms rather than
supplies, and it is quarantined under ADR 0117 X4 for reasons that do not
apply to a port-code table.

### Wait for the Action Runner

Tempting, because effects need it and it does not exist. But reads do not,
and issue #4's MVP is three reads. Deferring the whole shape until the
action path exists would leave the next five supplier requests with
nowhere to go, which is the state ADR 0127 was written to end.

## Gates

- **BR1 - The slot list (implemented):** `picoSupplierSlots` holds
  observation, memory item and effect, and nothing else;
  `parsePicoSupplierManifest` refuses an unlisted shape under
  `pico_supplier_slot_not_listed` - a boundary error rather than a review
  comment - and refuses a supplier that fills no slot at all, because
  something filling none supplies nothing. Extending the list stays an
  ADR 0127 M5 lift.

  Events stayed off the list and a test says why: origin is
  server-assigned at intake under ADR 0116 W1, so a supplier that could
  write an event directly could claim its own origin.
- **BR2 - The processing boundary (open):** supplier code - a bridge's
  client, a library's extractor - runs outside the core process behind a
  private socket with named request families, and no supplier package is
  reachable from the core's static import hull. The method already exists
  twice, in ADR 0129 SR5's sensor hull and the companion tray hull, which
  is what makes this checkable rather than reviewed.
- **BR3 - Threshold labeling and the identity proof (core half
  implemented 2026-08-11):** `intakePicoSupplierContent` assigns
  `external_content` and has no parameter through which a supplier could
  claim one - the fourth appearance of the construction ADR 0117 X1 uses
  for `picoReaderCapabilities`, ADR 0136 BR4 for `confirmedByPerson` and
  ADR 0139 AC2 for an argument's origin, because it is the only guard that
  does not depend on the guarded thing behaving. An offering that carries
  an `originClass` is refused under its own error, since a supplier
  asserting provenance is the attack rather than a typo.

  A test states the harsh case on purpose: a person's **own** knowledge
  base is labelled `external_content` too. That is not a judgement about
  the author, it is an admission about what the core can verify - it
  cannot tell a sentence the person wrote from one they pasted.

  The identity proof runs in the shape ADR 0127 M1 and ADR 0128 H4 already
  use: a supplied item and an ordinary item go through the same crypto
  shred, and the outcomes are asserted *identical to each other* rather
  than each on its own, because two separate assertions could both pass
  while the core treated the two kinds differently in a way neither
  happened to look at. An item in another domain survives, which shows the
  comparison can fail.

  Open: the retention-sweep and backup/restore halves of the same
  comparison, and everything that needs a supplier actually offering
  content.
- **BR4 - Three clocks and a certainty (implemented):**
  `picoSupplierCacheAgeMs` and `picoSupplierContentAgeMs` are two functions
  with two names, so confusing them takes an edit rather than an oversight -
  which is what issue #4 asked for in its own words. The library case
  answers `null` rather than `0`, because a commit is not a time and zero
  would be this exact confusion dressed as a convenience; `measured` is a
  tagged union for the same reason.

  A value cannot be built without its confidence, under its own error: not
  a value with a default, one nobody measured. And a supplier cannot claim
  a person's confirmation - `confirmedByPerson` is typed as a field that
  can only be `false`, the construction ADR 0117 X1 uses for
  `picoReaderCapabilities`, with no parameter to set it and its own
  refusal on the parse path.

  Building it corrected this ADR twice over. The certainty vocabulary was
  named `known` here and in ADR 0137, a tag that exists nowhere - ADR 0129
  has three levels and a separate confirmation status, and the only
  `'known'` in the tree is an unrelated `ContextSignalLevel`. And the three
  levels themselves were sitting in `spatial-recall.ts` under a spatial
  name while their own comment said they are independent of where a value
  came from; they are now `@pico/protocol/confidence`, lifted in the
  ADR 0127 M5 move, with `picoSpatialConfidences` derived from them so
  spatial recall keeps its word without keeping its list.
- **BR6 - Libraries are pinned, read in place, and never held (open):** a
  frozen library verifies against a pinned hash and a tracked one against
  a commit id, failing loudly rather than substituting; nothing is
  ingested, derived items carry the pin they were read at, and detaching
  deletes nothing while a domain shred reaches every derived item. A
  library may appear in an ADR 0118 floor family and a bridge may not, and
  the floor check enforces the asymmetry.
**BR5 is deliberately absent.** It was credential, cost and consent, and
it left with ADR 0138, where it is CO1-CO5. The number is not reused,
because gate identifiers are cited in commits and in the status matrix and
a reused one would silently point at the wrong obligation - the same
posture ADR 0121 takes with its closed J3. ADR 0137 carries IN1-IN5 for
the plural case, and the terminology rows for Pico Bridge and Pico Library
land in ADR 0026 with BR6.

## Failure ledger

| Situation | Posture |
|---|---|
| Cached data is served as current | Refused by construction: asked-at and measured-at are separate fields and a value cannot be built without its certainty (BR4). |
| A supplier claims its content is Pico's own | It cannot express a class at all; the core assigns `external_content` at the threshold (BR3). |
| A malformed PDF crashes the extractor | It crashes outside the core process, and the library reports a per-document failure rather than an outage (BR2). |
| A bridge wants its own cache table | It gets the ADR 0129 observation buffer; what is worth keeping compacts into a memory item. A private table is storage under another word. |
| A supplier wants a shape the core lacks | The shape is lifted to a core capability and migrated by the core (ADR 0127 M5), or the supplier waits (BR1). |
| A library's commit moves under a derived item | The item keeps the commit it was read at, so drift is visible rather than silent (BR6). |
| A person shreds a domain holding a library | Every derived item goes. The library does not, because it was never Pico's - and Pico says so instead of reporting a deletion it did not perform (BR6). |
| Someone reads the slot boundary as a security boundary | It is one only where BR2 puts a process between. Containment of content is BR3, and the two are different claims. |
| A supplier is removed while its derived items exist | Items stay under core custody. ADR 0127 M3's rule is unchanged: data outlives the thing that produced it. |

## Consequences

Positive:

- five outstanding supplier requests - AIS, Home Assistant, a messenger, a
  location sensor, a git knowledge base - stop being five designs and
  become five instances, and two of them already have their ports
  declared;
- the boundary is a process rather than a convention, so ADR 0127's
  one-guard-one-place property survives contact with code Pico did not
  write;
- ADR 0134 keeps almost all of its reach, because only the supplier
  protocol becomes an identity someone holds;
- a library can be part of the offline floor, which is a capability this
  tree wanted and had no word for - and it is the case where the floor
  matters most, since a personal archive is exactly what a person needs
  when the network is gone.

Negative and residual:

- this is a new protocol surface, and its version is the first thing here
  a third party could hold - the freeze in ADR 0134 F1 will have to speak
  to it explicitly;
- an out-of-process supplier costs a process, a socket and a serialization
  boundary each, and the tray memory budget is already the tightest number
  in the tree - a cost that multiplies with attachments, since libraries
  are meant to be held several at a time;
- the closed slot list will be wrong at least once, and the recovery is an
  M5 lift with a migration - deliberately expensive, so it is not extended
  by reflex;
- a library is readable only through a quarantined read job, so the most
  requested case is blocked behind ADR 0117 X4 and a model runtime that do
  not exist. This ADR places it; it does not deliver it;
- nothing here reduces content risk. A bridge that lies produces a
  correctly labeled lie, and a library with a hostile document is pinned to
  that document. Labeling is containment, never verification;
- `Bridge` overlaps a heavily used generic noun and one real security
  boundary in the Companion, managed by discipline rather than by a check
  until BR6 lands.

## Relationship to other ADRs

- Split with ADR `0137`, which decides everything that follows from there
  being several suppliers, and ADR `0138`, which decides what using one
  costs. No part is deployable alone.
- Completes ADR `0036`: capability first, connector second, with the
  boundary that ADR left unstated, and consolidates its `provider_id`
  against ADR `0127`'s provider module kind.
- Leaves ADR `0127` intact and fills its stated exclusion. A module is
  still vocabulary, composition and surface; a supplier is none of the
  three. ADR 0127 gains a status note under ADR `0128`'s record rule.
- Reuses ADR `0128` H4 wholesale for the threshold, and follows its
  correction method twice: a property that varies independently is
  declared, not made into a new kind.
- Depends on ADR `0129` for the observation buffer, the place capability,
  the certainty axis and the stopping-is-not-forgetting rule; SR5's sensor
  port becomes the first supplier port in shape if not yet in fact.
- Applies ADR `0133` to libraries: derive from the source, and treat every
  index over it as a cache with a named correction point.
- Bounded by ADR `0118` O1/O2 - the floor decides bridge from library -
  and extends O2's vocabulary with cost.
- Bounded by ADR `0116` W2 and ADR `0117` X4, which together decide that a
  library is placeable now and answerable later.
- Attaches into ADR `0075` privacy domains, which is BR7 and the least
  settled part of this decision.
- Governed by ADR `0026` for both new terms and ADR `0104` for where the
  credential lives.
- Pins integrity the way ADR `0013` pins reference assets.

## References

- [ADR 0013](0013-visual-design-language.md)
- [ADR 0026](0026-product-terminology-and-naming.md)
- [ADR 0036](0036-capabilities-connectors-and-mcp-boundary.md)
- [ADR 0049](0049-model-provider-registry-and-job-envelope.md)
- [ADR 0075](0075-foundation-local-authentication-session-and-membership-threat-model-and-scoping.md)
- [ADR 0097](0097-deployable-vault-process-and-local-ipc-authority-boundary.md)
- [ADR 0104](0104-settings-belong-to-pico-not-to-host-configuration.md)
- [ADR 0116](0116-untrusted-content-and-self-replicating-prompt-threat-model-and-hardening-gates.md)
- [ADR 0117](0117-planner-reader-split-and-origin-aware-data-flow-policy.md)
- [ADR 0118](0118-offline-and-model-free-degradation-contract.md)
- [ADR 0127](0127-pico-modules-mandatory-delivery-independent-code-declared-dependencies.md)
- [ADR 0128](0128-home-assistant-is-a-host-not-a-frame-and-the-effect-bearing-module.md)
- [ADR 0129](0129-spatial-recall-observations-are-not-memories-and-uncertainty-is-not-origin.md)
- [ADR 0133](0133-derive-from-the-source-until-the-medium-is-known.md)
- [ADR 0134](0134-formats-revise-in-place-until-the-first-kept-identity.md)
- [ADR 0137](0137-suppliers-are-instances-coverage-decides-whether-they-add-up.md)
- [ADR 0138](0138-reaching-outside-costs-something-and-is-off-until-someone-says-so.md)
</content>
