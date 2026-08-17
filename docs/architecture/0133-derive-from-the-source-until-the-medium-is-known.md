# 0133 - Derive from the Source Until the Medium Is Known

## Status

Accepted as a general architectural principle. Stated on 2026-08-09 at the
user's request while ADR 0132 was being planned, because the rule that came
up there is not specific to the Recovery Card and had already been decided
five times in this tree under five different justifications.

## Context

Planning the card generator raised a question that looked local: should a
surface receive a finished image of Pico, or the parameters and a
composition formula to build one? The answer was the second, and the
reasoning turned out not to be about cards at all.

The same rule is already load-bearing in five places, none of which
reference each other:

- **ADR 0124** derives every presentation tier from one authored source -
  "the lower tiers are precomputed projections of what the higher tier
  computes live" - and refuses to treat a bake as an authority: "a bake is
  replaced, not versioned".
- **ADR 0106** builds the human approval statement and the canonical
  signature bytes from the same validated fields, so what a person reads
  and what gets signed cannot come apart.
- **ADR 0132** makes both halves of the Recovery Card derive from one
  canonical payload, because a printed fingerprint and a QR that disagree
  are worse than either alone.
- **`apps/web/src/render.ts`** computes `overdue` against the clock on
  every read instead of storing it, because whether something is late
  changes without anything being written.
- **`@pico/protocol/bounded-projection`** carries the true count beside a
  shortened list, so a truncated view cannot report its own truncated
  length as a fact about the world.

Five instances, one rule, no name. An unnamed rule gets re-argued at the
sixth site and lost at the seventh. Naming it makes the next case
decidable in a sentence.

## Scope

Covers: when a representation may be flattened, what a flattened artifact
may claim, and what a deliberate early materialization has to state.

Does not cover: any particular pipeline (ADR 0124), the card (ADR 0132),
caching as a technique, or performance work in general.

## Decision

### Derive from the source until the medium is known

Carry the richer representation as far as it goes. Flatten it at the
boundary that knows what it is flattening *for* - the resolution, the
format, the constraints of the actual target - and not one step earlier.

A surface that knows its medium is the right place for the last step. A
producer that does not is the wrong one.

### A flattened artifact is a cache, never an authority

Three consequences follow, and they are the useful part:

- it may be replaced without a version, because nothing may depend on its
  identity - ADR 0124 already states this for bakes;
- it may not become the input to a further derivation that the source
  could have served, because each such step loses what the next one
  needed;
- two consumers of the same source must not be able to disagree because
  one of them received a flattened copy. Where they could, the flattening
  happened too early.

### An early materialization is allowed, and must state four things

The principle is not free, and sometimes paying it is wrong. Deriving on
demand can cost more than the operation it guards, and then materializing
early is the correct engineering. What is not correct is doing it
silently.

An early materialization states:

1. **why late derivation is not affordable** - with a measurement, not an
   impression;
2. **which direction its drift runs**, and that this direction is the
   fail-safe one;
3. **where the drift is corrected**, and why that point is the one that
   matters;
4. **what a consumer may still assume** in its presence.

`apps/core/src/store-row-counter.ts` is the worked example and the
template. Counting on demand costs about 8 ms at a million rows and 50 ms
at five million, so a ceiling check per append would cost more than the
append. The count is therefore maintained rather than measured. Inserts
are counted and deletions are not, so the cached count can only run
*high* - refusing a creating write that could have been allowed, never
allowing one that should have been refused. And `resync()` runs whenever a
ceiling looks reached, which is exactly the moment the drift would change
an answer, so someone who shreds a domain to make room is unblocked by
their next attempt rather than at some later sweep.

That statement is what makes the exception reviewable. Without it, an
early materialization and a mistake look identical.

### What this principle is not

It is not lazy evaluation, which is about when computation happens rather
than which representation is carried. It is not deferred rendering, which
is a specific real-time graphics technique and means something else
entirely. And it is not an argument against caching - the third decision
above exists precisely to make caching legitimate and legible.

## Rejected alternatives

### Leave it implicit

It is already implicit five times, each with its own local justification.
The cost of that is invisible until a sixth site argues it from scratch
and a seventh gets it wrong - and the wrong version of this rule produces
artifacts that quietly disagree, which is the failure mode that is
hardest to notice from the outside.

### State it inside ADR 0132

A card-specific ADR is the wrong home for a rule whose whole value is that
it governs the next case, which will not be a card.

### Make it a mechanical check

There is no property a script can read that distinguishes a legitimate
cache from a premature flattening; both are a value assigned early. The
honest enforcement is the four-point statement at the exception site,
which a reviewer can check and a reader can find.

## Gates

- **L1 - Stated (done with this ADR):** the principle, the cache rule and
  the four-point exception form are written down with their existing
  instances named.
- **L2 - Carried into the run rules (done with this ADR):** the invariant
  stands in `AGENTS.md` among the standing product invariants, so it is
  read at the start of a run rather than found by chance in an ADR.
- **L3 - Existing exceptions audited (done 2026-08-17):** it found one
  place where nobody had made the statement, and the search is worth
  recording because most of what looks like a cache is not one.

  **The generated design tokens.** Three byte-identical copies live in the
  tree - `docs/design-system/01_Foundations/tokens/pico.tokens.ts` and one
  beside each of the two apps that render PICO - and their header said only
  "do not edit by hand". It now states the four things, written into the
  generator so every copy carries them: late derivation is unaffordable
  because an Electron renderer under a CSP that forbids fetching and a PDF
  generator with no reachable filesystem root cannot open the source when
  they need a colour; the drift runs towards *stale*, which is fail-safe
  because a copy can lag the source and never lead it; it is corrected by
  `design-system:generate` and caught by `design-system:check` inside
  `release:verify`; and a consumer may assume byte-identity at release time
  and nothing else - the file has no identity, may be regenerated without a
  version, and may not feed a further derivation the source could serve.

  **What is deliberately not in scope, so a reviewer can disagree with the
  judgement rather than guess at it.** The protocol fixtures under
  `docs/protocol/fixtures/` are not caches: ADR 0034 makes them the
  authority a runtime is checked against, which is the opposite of a
  flattened copy. `docs/design-system/manifest.json` is a hash index whose
  purpose is verification rather than rendering, so it is not a richer
  representation flattened for a medium. The relay's `openMailboxes` reads
  as a maintained counter and is not one - it is a subquery, counted on
  demand. Nothing else in the tree maintains a value it could derive.

## Consequences

Positive:

- the next case is decided by a sentence instead of a discussion, and the
  discussion that produced it is not lost;
- a legitimate cache becomes legible as a cache, which is what lets a
  reviewer tell it apart from a mistake;
- the failure mode this prevents - two derived artifacts that disagree
  because one was flattened too early - is the kind nothing tests for,
  because each one is individually correct.

Negative and residual:

- it is a principle, so it is enforced by reading rather than by a gate,
  and L3 will find places that predate it;
- carrying a richer representation costs memory and indirection, and on a
  tray with a measured budget (ADR 0113 C3) that is not nothing - the
  four-point form exists so those cases can be taken deliberately;
- "until the medium is known" is a judgement, and two people can place
  that boundary differently. The cache rule is the tiebreak: if two
  consumers could disagree, the boundary was too early.

## Relationship to other ADRs

- Generalizes what ADR `0124` decides for the character pipeline and what
  ADR `0106` decides for approval rendering; neither changes.
- Governs ADR `0132` G4, which is the first case decided by it rather than
  by its own reasoning.
- Names `apps/core/src/store-row-counter.ts`, written under ADR `0119` Q5,
  as the template for a stated exception.
- Applies to ADR `0113` C3 in both directions: the tray budget is a real
  reason to materialize early, and this ADR says how to do so legibly.

## References

- [ADR 0106](0106-approval-rendering-from-the-signed-bytes.md)
- [ADR 0113](0113-electron-shell-over-a-shell-free-companion-service-core.md)
- [ADR 0119](0119-resource-exhaustion-and-denial-of-service-posture.md)
- [ADR 0124](0124-authored-character-core-and-tiered-presentation.md)
- [ADR 0132](0132-recovery-card-renders-from-data-and-its-halves-cannot-disagree.md)
