# 0134 - Formats Revise in Place Until the First Kept Identity

## Status

Accepted; F1, F2 and F3 implemented. The user established on
2026-08-09 that no Pico is in operation and proposed that formats stay at v1 until the first
go-live. This ADR accepts that with one correction to the trigger, and
turns it into the rule that governs both the Recovery Card cleanup and a
sweep for compatibility kept on behalf of nobody.

**Status note 2026-09-10: the trigger has fired.** This ADR's whole rule is
that formats revise in place *until the first kept identity*. Asked directly
during the external review of 2026-09-09, the user confirmed that a real Pico
identity now exists and is being kept.

So the licence this document grants has expired, and the sentence that
replaces it is the one it always named: **identity serialisation and
canonicalisation are a versioned external interface from here on.** A change
to canonical bytes needs a new suite version and a migration that re-signs,
never a quiet revision - because a quiet one invalidates every signature that
identity has already made and moves every fingerprint derived from it, and
nothing can repair that afterwards. The canonical vectors under
`docs/protocol/fixtures` are the record of what the bytes are, and
`packages/protocol/src/canonical-bytes.ts` is where the rule lives.

What this does *not* change: the Recovery Card cleanup and the compatibility
sweep that F1-F3 already carried out. Those were the cost of v1 being free,
and it was paid before the trigger fired.

**Status note 2026-08-24: F2's collapse left the retired name in three
places, and the cause is in this document.** The Context below names three
facts that decide what v1 costs, and the second is "the companion types the
schema as a literal `v2`". F2's removal list names the second schema, the
dual QR transport, the Vault branch, the PDF writer's conditional and first
run's v1-specific rejection - not that literal. It survived fourteen days:
`PicoCompanionRecoveryCardPublicMetadata.schema` went on *requiring*
`pico.recovery.card.v2`, a name no card has ever carried, and
`recovery-card.test.ts` built a stand-in card carrying it, typed
`Record<string, unknown>` so that no compiler compared the two. Code and
test agreed with each other rather than with the protocol, which is why
neither said anything; nothing read the field, which is why nothing broke.
`first-run-real-process.test.ts` stripped the scan prefix by
`'pico-recovery-card-v2:'.length`, correct only because the invented
spelling is exactly as long as the real one - the same invented spelling
that once made the shell refuse every printed card, silently.

The metadata now takes its schema off the card it just issued rather than
spelling it a second time, the fixture is typed as a real card so a wrong
name fails to build, and the prefix is asserted rather than measured.

**A fourth site stays, argued rather than fixed:** the baseline migration's
founding-record CHECK still admits `pico.home.founding-record.v2`. That
baseline is *derived* - read back from `sqlite_master` after the seventeen
steps it folds - and retyping one of its statements by hand gives up the
only property that makes it checkable. Nothing writes the value; the
argument is recorded in `scripts/check-wire-labels.mjs`, beside the
exemption it justifies.

The general lesson is F1's, applied to F1: **a collapse is not done when the
branch is gone.** The name outlives the branch wherever it was written as a
type, a fixture or a length. `check-wire-labels.mjs` gained the rule that
would have caught all three - a label sharing an exported label's stem while
carrying a version the protocol does not export - which is narrower than the
one that check's header measured and rejected at 46 false positives.

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
4. **Apply only where no claim exists.** `public-surfaces.md` decides, and
   since 2026-08-09 it decides by a readable value rather than by prose:
   every status there begins with one of its defined terms, and that first
   word is the class. `Experimental`, `Reserved` and `Internal` license an
   in-place revision - none of them promises anything to a holder.
   `Pico-compatible` and `Pico Home-compatible` do not. Canonical byte
   forms, which are what this obligation actually judges, now have their
   own table there instead of being inferred from the route that stores
   them.

   Published fixtures do not change that answer. A vector suite pins what
   a form is today so a change is visible; it becomes a promise only when
   someone claims compatibility against it (L4), and nobody has. The
   vectors are regenerated with the change, which obligation 1 already
   requires.

   **A surface the document does not mention gets no answer, so since
   2026-08-14 the document is read against what is served.** Nineteen
   routes appeared nowhere in it - the ADR 0107 Link intake among them -
   and each had been added by somebody with no reason to open that file.
   `surface:check` now compares both sides: every route the access-class
   registry serves must be named there with its method, and every route
   named there must still be served. An unmentioned surface would leave
   this obligation to be settled at the call site by whoever was there,
   which is the judgement call the class rule exists to remove.

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
- **F2 - The card and the founding record collapse to one format each
  (implemented 2026-08-10):** two formats, one operation, done together because they are the
  same branch pattern - `'homeHostPicoIdentityFingerprintHex' in input` on
  the card, `'firstDeviceDelegationId' in input` on the founding signature
  input - and separating them would establish the proof method twice.

  For the card: the v2 layout becomes
  the only Recovery Card format and keeps the name `v1`. The second
  schema, the dual QR transport, the Vault's
  `'homeHostPicoIdentityFingerprintHex' in input` branch, the PDF writer's
  schema conditional and first run's v1-specific rejection all go. The
  authoritative vector is regenerated as the card v1 suite, the scan
  prefix follows the surviving name, and the development cards printed on
  2026-07-31 are declared unreadable. ADR 0110 and 0112 gain status notes
  and keep their text.

  For the founding record: `pico.home.founding-record.v2` and
  `PicoHomeFoundingSignatureInput`'s v1 variant disappear into the
  surviving `.v1` name, the three first-device fields become required, the
  dispatching builder and its v1 twin collapse into one, and
  `legacyFounding` leaves `event-store.ts` with them. Its positive vector
  gains new canonical bytes; its two canonicalization negatives and
  `home-first-device-founding/suite.json` are re-read rather than
  regenerated, because a negative asserts a rejection and only reading it
  says whether that rejection still means the same thing. ADR 0108 gains a
  status note and keeps its text.

  What the collapse turned up, and what it says about this rule: removing
  the second schema left three comparisons in the tree that had asked
  which format a record was, and now compared the surviving constant with
  itself. Two of them were load-bearing and silently wrong -
  `reconcilePicoHomeFirstDeviceEvidence` took its legacy exit for *every*
  founding record, so first-device evidence was never re-projected on
  restart, and `mapPicoHomeFoundingRecord` returned every stored record
  without that evidence. Two more comparisons had become unreachable and
  kept a name that no longer described anything:
  `recovery_card_v1_requires_trusted_acceptor_pin`, on a path where
  parsing already *is* the check. A dual-format branch does not fail loudly
  when its second arm is deleted; it keeps running, on one arm, in whatever
  direction the comparison happens to fall. That is the cost this rule is
  about, and it is why a format revision has to remove the branches with
  the format rather than leave them to be discovered.
- **F3 - Compatibility sweep (implemented):** every property the tree keeps "for
  compatibility" either goes or gets its population written down. A sweep
  on 2026-08-09 found four, and each ends with a removal or a named
  population, never with a shrug:

  - **Seventeen migrations**, `0001_initial_schema` through
    `0017_pico_module_capture`, each a step out of a state no database is
    in. Consolidating them also retires the ordering dependency that
    `0017` has on `0013`. The caveat is load-bearing and decides how this
    is done - or it was. **Checked on 2026-08-09 and the caveat is wrong.**
    `runMigrations` already accepts `migrationDefinitions`, and
    `migrations.test.ts` already exercises the runner through that seam
    with a synthetic definition. The real list is pinned in only five
    places: three `toHaveLength(17)` assertions and two `migrationIds`
    lists, all of which assert that the *product schema* applies rather
    than that the runner works. Folding therefore does not retire the
    ordering, idempotence or backup-before-migration proofs, because those
    do not depend on the seventeen.

    The method is also settled, and it removes the risk that made this
    look dangerous: **derive the baseline, do not fold it by hand.** Running
    the seventeen on a fresh database and reading `sqlite_master` yields
    the exact final shape - 68 objects, 33 tables and 35 indexes, about 20
    KB of DDL - including the columns that arrived by `ALTER TABLE`, since
    SQLite stores the rewritten `CREATE`. Equivalence is then a mechanical
    proof rather than a review: apply the single baseline to a fresh
    database and compare `sqlite_master` against the seventeen-step result.

    What remains is the diff itself - roughly 1,200 deleted lines in the
    one file where a mistake is a data-shape mistake - and that is what
    keeps it a block of its own rather than a tail-end task.
  - **`legacyFounding`** in `apps/core/src/event-store.ts` - a type
    variant and a branch that keep a Home founded under the ADR 0080 v1
    schema verifiable while refusing new v1 claims. No Home is founded, so
    the branch describes a state nothing can be in.

    Measured on 2026-08-09 and **larger and less licensed than this entry
    first assumed**. The branch is not the item: behind it sits the
    `pico.home.founding-record.v1`/`v2` pair, 56 sites across 15 files,
    with published fixture suites (`home-first-device-founding`,
    `home-signature-input/.../founding-record`). Removing the branch
    honestly means collapsing that pair - the same shape and roughly the
    same size as F2.

    Whether this ADR licensed it was undecidable when the sweep was
    written, because obligation 4 pointed at a document that recorded
    claims only in prose. That gap was closed on 2026-08-09:
    `public-surfaces.md` now states that the class is the first word of a
    status and gives the canonical byte forms their own table. The founding
    record is **Experimental**, so the collapse is licensed.

    **Measured again on 2026-08-09, and it belongs to F2 rather than
    here.** The two are not similar operations; they are the same one. The
    card is issued as v1 or v2 depending on
    `'homeHostPicoIdentityFingerprintHex' in input`; the founding
    signature input is built as v1 or v2 depending on
    `'firstDeviceDelegationId' in input`. Same branch shape, same
    additive-field-becomes-required change, same obligation to regenerate
    vectors under the surviving name.

    The founding record costs a little more on the vector side: the
    published positive vector
    `home-signature-input/.../canonicalization-positive/founding-record`
    pins the ten-field v1 shape and would need new canonical bytes, and two
    canonicalization negatives plus `home-first-device-founding/suite.json`
    need re-checking rather than blind regeneration - a negative asserts a
    rejection, and only reading it says whether the rejection still means
    what it meant.

    Doing them apart would establish the proof method twice and risk the
    second drifting from the first. **F2 therefore covers both**, and this
    entry is closed by moving rather than by doing.
  - **Recovery Card v1**, handled by F2.
  - **`foundationAccessModeAlias`** - **closed on 2026-08-09 by naming its
    population, and it turns out to have been mis-filed here.** The other
    three items protect artifacts produced by a Pico. This one protects a
    *container environment variable*: anyone who ran the add-on before the
    rename has `PICO_FOUNDATION_ACCESS_MODE=ha-ingress` set right now, and
    a boot that refused it would turn an update into an outage. That
    population is not "someone who founded an identity", so the freeze line
    cannot speak to it - a container with the old spelling fails whether or
    not a Pico was ever founded in it.

    The cost of keeping is one entry in `formerFoundationAccessModeNames`
    and a boot log line that says so once, which is below the cost of being
    wrong about who is out there. `config.ts` already records the same
    conclusion in its own words: dropping it is a release decision, not a
    cleanup. It stays, and it leaves this sweep.

  **Read on 2026-08-10, and neither is a legacy affordance.** Both were
  measured rather than reasoned about, which is what the instruction to
  read before listing was for.

  `payloadPosture` is live: `app.ts` sets `reference_only` where ADR 0069
  splits content from the event, and the client write path accepts one.
  Optional means most events are `inline_operational` and do not say so -
  a default, not a concession.

  `origin` is optional because a client may not assert it, not because old
  rows lack it. It is assigned at intake from the authenticated write
  authority on the ADR 0116 W1 path; the seven server-synthesised events in
  `app.ts` do not go through that path and carry none, which is W2 open
  rather than history.

  What *was* wrong was one clause in each comment. `payloadPosture`
  promised that "existing events stay valid without change", and `origin`
  offered "the row predates origin labeling" - a population that does not
  exist and a row that is nowhere. Both clauses are gone, and both
  comments now say what the optionality is actually for, so the next sweep
  does not re-flag them.

  **With that, F3 is complete.** Its four items ended as two removals
  (migrations, and the founding record by moving to F2), one item F2
  absorbed (Recovery Card v1), and one kept with its population written
  down (`foundationAccessModeAlias`, which protects a container
  environment variable rather than an artifact a Pico produced).

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
  overuse, and three of the four obligations are enforced by reading
  rather than by a check. Obligation 4 is now half-checked, and the halves
  are worth keeping apart: that the document *names* every served surface
  and gives it a class is read by `surface:check`; whether a particular
  change is licensed by that class is still a judgement somebody makes;
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
