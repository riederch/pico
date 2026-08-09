# 0134 - Formats Revise in Place Until the First Kept Identity

## Status

Accepted; F1 implemented, F2 and F3 open. The user established on
2026-08-09 that no Pico is in operation and proposed that formats stay at v1 until the first
go-live. This ADR accepts that with one correction to the trigger, and
turns it into the rule that governs both the Recovery Card cleanup and a
sweep for compatibility kept on behalf of nobody.

## Context

The question surfaced on the Recovery Card, where two formats exist.
`pico.recovery.card.v1` carries no Home acceptor pin; `v2` adds it, plus a
strict inverse parser and an ASCII scan transport. Which one gets issued
is decided by a single line - `const v2 = 'homeHostPicoIdentityFingerprintHex' in input` -
so v1 is not a legacy format but the shape that appears when the acceptor
pin is absent.

Three facts decide what that costs. Every production path already supplies
the pin: the daemon request family is named `ceremonyIssueRecoveryCardV2`
and declares the field as required, the companion types the schema as a
literal `v2`, and the shell's scanner accepts only the v2 prefix. The
published fixtures carry `card-v2.json` and no v1 vector at all. And
`docs/protocol/public-surfaces.md` states plainly that these forms and the
card generator "are local implementation surfaces, not Pico Link
compatibility".

So v1's byte compatibility is a promise to an empty set, and it is paid
for in dual-path complexity inside a security-critical format: two
schemas, two QR forms, a branch in the Vault, a branch in the PDF writer,
and a v1-specific rejection in first run.

The general shape is worth more than the instance. A version number is a
promise to whoever holds an artifact produced under it. With no holders,
incrementing is ceremony that leaves dead branches behind - and the tree
is already positioned for this: `compatibility-levels.md` certifies
nothing and describes itself as a planning document for the foundation
phase, and the protocol version sits on its own axis at `0.1.7`.

What the tree does not have is a stated rule for revising a format in
place, and a named moment when that stops being allowed.

## Scope

Covers: when a format may be revised without a new version, what the
freeze is, what an in-place revision owes, and which surfaces are exempt.

Does not cover: the release version checklist (`versioning.md` keeps its
table), the compatibility levels themselves, or any specific format's
content.

## Decision

### Before the freeze, a format revises in place

A surface that carries no compatibility claim may change its bytes under
its existing version name for as long as nothing holds an artifact
produced under the old one. No v2, no v3, no deprecation branch - the
format is corrected and the old shape ceases to exist.

### The freeze is the first kept identity, and it is declared, not inferred

Not a launch, not a release tag, not an announcement. **The first identity
that someone intends to keep.**

A Recovery Card is printed on paper and outlives every decision around it.
A founded Home holds signed records that outlive the code that wrote them.
The moment that binds is the moment the first such artifact stops being
disposable, and that can be the author's own first real Pico, long before
anything is public.

No code can detect that intent, so it is written rather than derived: one
dated line in `docs/release/versioning.md`, set deliberately. Before it,
this ADR applies. After it, ordinary versioning applies and this ADR is
spent.

### An in-place revision owes four things

1. **Regenerate the authoritative vectors under the same name.** A fixture
   is a record; a stale one is worse than none, because it is trusted.
2. **Amend ADR status notes; never rewrite an ADR body.** ADR 0128 already
   settled this for vocabulary - rewriting a record makes it less true,
   not more current. An ADR that described the old shape keeps its text
   and gains a note saying what replaced it and when.
3. **Declare what becomes unreadable.** Anything printed, exported or
   scanned under the old shape stops working, and that is stated rather
   than discovered. Development artifacts are disposable *by declaration*,
   not by assumption.
4. **Apply only where no claim exists.** Any surface at L1 or above in
   `compatibility-levels.md`, and anything a published fixture suite backs
   as a compatibility promise, is out of scope. `public-surfaces.md` is
   the list that decides, not a judgement at the call site.

### What this does not license

It removes the version bump, not the discipline. Every in-place revision
still needs its own reasoning, its own vectors and its own tests. This ADR
makes a change cheaper to name, never cheaper to make.

## Rejected alternatives

### Retire v1 and keep v2 as the survivor

The recommendation this ADR replaces. It removes the dual path, which is
the real win, but it burns a version number to describe a distinction that
will not exist - and it leaves the next pre-freeze correction to produce a
v3 for the same non-reason.

### Keep both card formats

Pays dual-path complexity in a security-critical format on behalf of an
empty population, and keeps a branch where omitting one field silently
produces the weaker card.

### Tie the freeze to a launch or a release tag

A printed card does not know about launches. Tying the freeze to a public
moment would allow an in-place change after a real Recovery Card is
already in someone's drawer, which is exactly the failure this rule is
shaped to prevent.

### Leave the rule implicit because nothing is live

That is the state this ADR ends. Implicit, it has to be re-argued at every
format, and it has no expiry - so it would still feel true after the
freeze, which is when it becomes dangerous.

## Gates

- **F1 - The freeze marker (implemented):** `docs/release/versioning.md`
  carries a dated line stating that no kept identity exists as of
  2026-08-09, declared by the user, with the rule and its four obligations
  beside it - so it is read where a version decision is made rather than
  in an ADR nobody reopens. When the answer changes, that line changes
  first and everything else follows from it.
- **F2 - The card collapses to one format (open):** the v2 layout becomes
  the only Recovery Card format and keeps the name `v1`. The second
  schema, the dual QR transport, the Vault's
  `'homeHostPicoIdentityFingerprintHex' in input` branch, the PDF writer's
  schema conditional and first run's v1-specific rejection all go. The
  authoritative vector is regenerated as the card v1 suite, the scan
  prefix follows the surviving name, and the development cards printed on
  2026-07-31 are declared unreadable. ADR 0110 and 0112 gain status notes
  and keep their text.
- **F3 - Compatibility sweep (open):** every property the tree keeps "for
  compatibility" either goes or gets its population written down. A sweep
  on 2026-08-09 found four, and each ends with a removal or a named
  population, never with a shrug:

  - **Seventeen migrations**, `0001_initial_schema` through
    `0017_pico_module_capture`, each a step out of a state no database is
    in. Consolidating them also retires the ordering dependency that
    `0017` has on `0013`. The caveat is load-bearing and decides how this
    is done: the migrations are currently the only test material the
    migration runner has, so folding them into one baseline without
    replacing that material would quietly retire the ordering, idempotence
    and backup-before-migration proofs - the checks most needed *after*
    the freeze. Fold the product schema, give the runner synthetic
    migrations.
  - **`legacyFounding`** in `apps/core/src/event-store.ts` - a type
    variant and a branch that keep a Home founded under the ADR 0080 v1
    schema verifiable while refusing new v1 claims. No Home is founded, so
    the branch describes a state nothing can be in.
  - **Recovery Card v1**, handled by F2.
  - **`foundationAccessModeAlias`** - the `ha-ingress` name kept under ADR
    0128 H5 because it "steht in installierten Umgebungen". Whether such
    an environment exists is a fact only the operator holds, and a
    different question from whether a Pico exists; it is also the cheapest
    of the four to keep, so it is the one that most needs a stated
    population rather than a reflex.

  Two sites marked "Additive, optional" in `packages/protocol/src/index.ts`
  are unjudged: one is the ADR 0116 W1 origin, which is server-assigned at
  intake and therefore probably not a legacy affordance at all. Read before
  listing.

## Consequences

Positive:

- the cheapest moment to simplify a security-critical format is now, and
  this rule says so out loud instead of leaving it to whoever notices;
- version numbers stop accumulating against an empty population, so the
  next pre-freeze correction does not leave a third branch behind;
- the freeze has a date and an owner, so "can we still change this" stops
  being a judgement call and becomes a lookup.

Negative and residual:

- the rule is at its most useful exactly when it is most tempting to
  overuse, and the four obligations are enforced by reading rather than by
  a check;
- collapsing the card touches canonical bytes, fixtures, a scan prefix and
  a first-run path - real work in a sensitive area for a property that is
  half correctness and half naming, and the naming half should be
  acknowledged as such;
- after the freeze this ADR is spent, and a spent rule that still reads as
  active is its own hazard - which is why F1 puts the marker where version
  decisions are made rather than in an ADR nobody re-opens.

## Relationship to other ADRs

- Applies ADR `0128`'s record rule: ADR `0110` and `0112` keep their text
  about v1 and v2 and gain status notes.
- Shares ADR `0133`'s posture - do not carry what is not real - and adds
  the expiry that principle does not need.
- Governs the Recovery Card work planned in ADR `0132`; F2 lands before or
  with it, so the generator is cut against one format rather than two.
- Leaves `compatibility-levels.md` and `public-surfaces.md` as the
  authorities on which surfaces are exempt.

## References

- [ADR 0110](0110-recovery-card-and-time-locked-zero-device-recovery.md)
- [ADR 0112](0112-recovery-product-surfaces-in-the-background-companion.md)
- [ADR 0115](0115-host-key-rotation-with-signed-continuity.md)
- [ADR 0128](0128-home-assistant-is-a-host-not-a-frame-and-the-effect-bearing-module.md)
- [ADR 0132](0132-recovery-card-renders-from-data-and-its-halves-cannot-disagree.md)
- [ADR 0133](0133-derive-from-the-source-until-the-medium-is-known.md)
