# 0135 - A Specification a Consumer Cannot Read Is Not a Specification

## Status

Accepted; not implemented. The user made the design system the next block
on 2026-08-09 after three separate questions in one session each ended at
the same place: the design system says something in prose, the consumer
cannot read it, and the consumer invents its own answer.

## Context

Three findings, none of which were about the consumers that surfaced them.

**Typography is specified and contradicted.**
`01_Foundations/Typography.md` names `Inter` with system sans-serif
fallbacks and records that the package ships no font files. The Recovery
Card generator draws Helvetica and Courier. Nobody chose to diverge - the
specification exists only as prose, the generator can only read
`pico.tokens.json`, and `color` is the sole group it finds there. An
earlier draft of ADR 0132 concluded from that gap that the design system
had no typography at all, which was wrong in the direction that lets a
contradiction look like a vacancy.

**The context axis has values and no meaning.** Eight colour tokens exist -
`technology`, `waterInfrastructure`, `fireDepartment`, `organization`,
`smartHome`, `communication`, `energy`, `nightFocus` - carrying colour
values and not one line saying what a context *is* or who selects one.
That is why a `TODO.md` entry could ask whether Appearance replaces "the
style presets" using a list assembled from two different axes: with no
written semantics, an axis can be misremembered without anything
contradicting the memory.

**A concept-board intent read as an axis.** `neutral/technical/soft`
appears in ADR 0013 under "Design basis image", in a list of what the
original board "shows the intent for" - beside context modes, modular
elements and multi-surface presentation. It was never decided. Its
neighbour on that list *was* realised, as the eight context tokens, which
is what makes the difference visible: realisation looks like tokens, and
this item never got any.

The shape is the same each time. What binds is not what is written; it is
what a consumer can read. Prose that a consumer cannot reach either gets
contradicted or gets reinvented, and both look like the consumer's fault.

## Scope

Covers: what the design system must make machine-readable to bind, what
happens to specifications that stay prose, the three findings above, and
the version consistency of the design system itself.

Does not cover: the character core, its model, bakes or the resolution
ceiling (ADR 0124); the appearance parameter contract (ADR 0125); any
renderer; and the visual content of any specification - this ADR decides
where things live, never what they say.

## Decision

### What the design system binds must be readable by what it binds

A specification that a consumer cannot read does not bind it. So each
foundation either becomes machine-readable - a token, a typed value, a
manifest entry - or is marked explicitly non-binding, as guidance for
people rather than a rule for code.

The third state, prose that reads as a rule and reaches no consumer, is
the one this ADR removes. It is the worst of the three because it looks
enforced.

### Typography becomes tokens, and the card follows them

`Inter` moves from prose into the token set with its fallback stack and
the sizes the design system states. The Recovery Card stops drawing
Helvetica: ADR 0132 G2 embeds an `Inter` subset, which the SIL Open Font
License permits and which keeps the deterministic output that card's tests
require.

The package's "no font files" line stays true of the *design system
package* and stops being true of the repository - the file arrives where
it is consumed, with its licence recorded.

Print sizes are not screen sizes, and the token set says so rather than
letting each surface discover it: a 4.2 pt fingerprint on a laminated
85.6 mm card is not a violation of a 15 px minimum written for screens.

### The context axis gets written semantics, and `nightFocus` gets resolved

What a context *is* gets one paragraph: which question it answers, what
changes when it changes, and who chooses. Who chooses is already decided -
a per-Pico setting under ADR 0104, because two Picos in one Home can serve
different subjects.

`nightFocus` is resolved rather than carried: seven of the eight names are
subjects, and this one reads as a mode. Either it is a subject and the
paragraph says which, or it is a mode and it leaves the group for one that
describes modes. It does not stay in a group whose definition it fails.

### The style variant is recorded as not an axis

`neutral/technical/soft` is what a concept board showed, not what anyone
decided. It gets no token, no type and no manifest entry, and ADR 0013's
sentence keeps its text with a note that it describes the source image.

If a surface ever needs the distinction, it is decided then, with that
surface as the reason. Giving it a home now would promote an observation
to an architecture, which is how the preset question came to be asked in
the first place.

### The design system's own version is checked like the product's

`check-version.mjs` enforces the product version across sixteen locations.
The design system version has no equivalent, and it shows: `VERSION.txt`
and `manifest.json` say 1.1.0 while ADR 0013 still says 1.0.1.
`SOURCE.md`'s 1.0.0 is not part of that - it records the provenance of the
original import and is correct as it stands.

Every location that states the design system version joins one check, in
the idiom already used for the product version.

## Rejected alternatives

### Tokenise everything the design system says

Motion, elevation, responsive rules and accessibility guidance are largely
for people making design decisions, and forcing them into tokens would
produce values nothing reads - the same failure in the opposite direction.
The rule is that what *binds* must be readable, not that everything must
be a token.

### Let the card keep Helvetica and record the divergence

Defensible for a printed artifact and cheaper than shipping a font. It was
rejected because the divergence has no reason behind it: nobody chose
Helvetica for print, it is simply what a PDF gives you when nothing tells
you otherwise. A deliberate print typography would be a decision; this
would be a rationalisation.

### Give the style variant a home to be safe

Cheap, and it would make the concept board's intent look like a decision
forever. Nothing consumes it, so nothing would ever prove it wrong.

## Gates

- **D1 - Typography is readable (open):** family, fallback stack and the
  stated sizes become tokens; print sizes are named as their own case;
  the `Inter` subset and its licence land where they are consumed, and
  ADR 0132 G2 stops the card's contradiction.
- **D2 - Context has semantics (open):** one written paragraph for what a
  context is and what changes with it, the ADR 0104 setting recorded, and
  `nightFocus` either defined as a subject or moved out of the group.
- **D3 - The style variant is closed (open):** recorded as a concept-board
  observation and not an axis, with ADR 0013 keeping its text and gaining
  a note.
- **D4 - The design system version is checked (open):** every location
  stating it joins one check; ADR 0013's 1.0.1 is corrected to the actual
  version in the same change.

## Consequences

Positive:

- the one real contradiction in the tree between a consumer and the design
  system ends, and it ends by the consumer following rather than by the
  specification being weakened;
- an axis with written semantics cannot be misremembered into a question,
  which is what happened twice in one session;
- the third state - prose that looks enforced and is not - stops being
  available, so the next foundation is either binding or explicitly not.

Negative and residual:

- a font file enters the repository, with a licence to carry and a subset
  to keep current;
- D2 asks for a definition nobody has written yet, and writing one may
  reveal that the eight contexts were chosen as colours rather than as a
  taxonomy - in which case the honest outcome is fewer of them, not a
  paragraph that ratifies eight;
- this ADR decides where specifications live and never what they say, so a
  reader looking for the visual decisions will still find them only in the
  design system.

## Relationship to other ADRs

- Leaves ADR `0013` as the visual design language and corrects only its
  stale version reference; its Character precedence is untouched.
- Supplies ADR `0132` G2 with the typography decision that gate needs, and
  is the reason G4 carries no depiction field.
- Does not touch ADR `0124`'s character core or ADR `0125`'s appearance
  parameters; both keep their own contracts.
- Shares ADR `0133`'s posture - a thing that is not real should not be
  carried - applied to specifications rather than to representations.

## References

- [ADR 0013](0013-visual-design-language.md)
- [ADR 0104](0104-settings-belong-to-pico-not-to-host-configuration.md)
- [ADR 0124](0124-authored-character-core-and-tiered-presentation.md)
- [ADR 0125](0125-parametric-appearance-and-version-compatibility.md)
- [ADR 0132](0132-recovery-card-renders-from-data-and-its-halves-cannot-disagree.md)
- [ADR 0133](0133-derive-from-the-source-until-the-medium-is-known.md)
