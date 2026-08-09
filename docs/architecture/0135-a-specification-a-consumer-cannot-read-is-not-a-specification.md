# 0135 - A Specification a Consumer Cannot Read Is Not a Specification

## Status

Accepted. D1 and D2 are implemented; D3 and D4 are open. The user made the
design system the next block on 2026-08-09 after three separate questions
in one session each ended at the same place: the design system says
something in prose, the consumer cannot read it, and the consumer invents
its own answer.

Doing D1 and D2 corrected this ADR twice. Both gates were written on the
assumption that the design system was silent where it is in fact
unreachable, and both turned out smaller and different than planned. The
context of this ADR now records what was found rather than what was
assumed.

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

**The context axis is documented four times and reachable from none of
them.** Eight colour tokens exist - `technology`, `waterInfrastructure`,
`fireDepartment`, `organization`, `smartHome`, `communication`, `energy`,
`nightFocus`. An earlier draft of this ADR said they carried "not one line
saying what a context is", which was wrong, and wrong in the way this ADR
is about: `Color_System.md` defines a context colour as the *fachlicher
Anwendungsbereich* and gives five binding rules, `Context_Modules.md`
opens with "Ein Kontext verändert Fachsprache, Symbole und Akzentfarbe,
nicht die Grundstruktur der App" and tabulates all eight with their
typical content, `Context_Icon_System.md` enumerates them, and
`PICO_Product_Design_System_v1.0.md` carries their values.

Four documents, and the token file points at none of them. A consumer -
human or machine - that arrives at `pico.tokens.json` finds eight colours
and no way to learn what they mean. That is how a `TODO.md` entry came to
ask whether Appearance replaces "the style presets" using a list
assembled from two axes, and how the first draft of this very ADR
declared a documented axis undocumented.

**A concept-board intent read as an axis.** `neutral/technical/soft`
appears in ADR 0013 under "Design basis image", in a list of what the
original board "shows the intent for" - beside context modes, modular
elements and multi-surface presentation. It was never decided. Its
neighbour on that list *was* realised, as the eight context tokens, which
is what makes the difference visible: realisation looks like tokens, and
this item never got any.

The shape is the same each time, and it is narrower than "the design
system is silent". Only the third finding is a true absence. The first two
are specifications that exist and cannot be reached from the surface that
carries their values - so they get contradicted, or reinvented, or
declared missing by someone who searched the tokens and the ADRs and
stopped there. This ADR's author did exactly that three times in one
session, which is the strongest evidence available that the problem is
reachability rather than diligence.

What binds is not what is written; it is what a consumer can read - and a
consumer includes the next person who goes looking.

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

`Inter` moves from prose into the token set with its fallback stack. The
Recovery Card stops drawing Helvetica: ADR 0132 G2 embeds an `Inter`
subset, which the SIL Open Font License permits and which keeps the
deterministic output that card's tests require. The package's "no font
files" line stays true of the *design system package* and stops being true
of the repository - the file arrives where it is consumed, with its licence
recorded.

The sizes do **not** move. They are stated as a minimum and a range - "at
least 15 px, preferably 16", "1.45-1.6" - and a range written as one token
value is a decision nobody took. They stay guidance, and `Typography.md`
now marks which of its statements are tokens and which are for people.

Print has no values at all, and that absence is named rather than filled.
A 4.2 pt fingerprint on a laminated 85.6 mm card is not a violation of a
15 px minimum written for screens, but neither is it licence to rescale
screen numbers into a print scale nobody designed.

### The context axis gets a pointer, not a definition

The definition exists and is not rewritten. What the token group gains is
a `$description` naming the documents that hold its meaning, so arriving
at the values leads to them instead of dead-ending.

Two things are genuinely missing and are added. **Who chooses a context**
is written nowhere: it is a per-Pico setting under ADR 0104, because two
Picos in one Home can serve different subjects, and that belongs beside
the definition rather than only in an ADR. And **nothing consumes the
tokens** - the only occurrence outside the generated outputs is the
generated variable block itself. That is recorded as a present fact, not
repaired: an axis waiting for its first surface is fine, an axis nobody
knows is waiting is not.

`nightFocus` stays where it is. An earlier draft planned to move it out
on the grounds that seven names are subjects and this one is a mode. That
reasoning took `Color_System.md`'s "fachlicher Anwendungsbereich" in
isolation and missed `Context_Modules.md`, which says a context changes
*Fachsprache, Symbole und Akzentfarbe* and lists Nacht/Fokus among the
eight with "reduzierte Helligkeit, minimale Ablenkung". By the axis's own
working definition it qualifies. The mild tension between the two
sentences is noted where both live, and nothing is moved on the strength
of half of it.

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

- **D1 - Typography is readable (implemented, narrower than written):**
  `typography.fontFamily.sans` carries the stack from `Typography.md`
  exactly, and the generator learned the DTCG `fontFamily` type to hold
  it. CSS and SCSS receive it flattened, because that is what a
  declaration needs; the TypeScript output keeps the list, because a
  surface without CSS has to pick the first available family and cannot
  use a joined string (ADR 0133).

  The gate as first written also asked for the sizes. It should not have:
  `Typography.md` states a minimum and a range - "at least 15 px,
  preferably 16", "1.45-1.6" - and writing a range as one token value
  would decide something nobody decided. Sizes therefore stay guidance,
  and `Typography.md` now marks which of its statements are tokens and
  which are for people. Print has no values at all, and that absence is
  named there rather than filled by rescaling screen numbers.

  The `Inter` file does not land here either. Nothing consumes it until
  ADR 0132 G2 embeds it, and shipping a font ahead of its consumer is the
  thing ADR 0133 exists to refuse. G2 brings it in with its licence.

  One finding came out of the work rather than the plan: `renderScss`
  groups tokens by a hand-written list, so a new group is emitted by five
  outputs and silently dropped by the sixth. The list is now declared
  once and checked where the CSS-name check runs, so an ungrouped token
  fails by name instead of vanishing. Counter-proven.
- **D2 - Context is reachable (implemented, and it was the gate that was
  wrong):** the semantics existed all along, in four documents. The
  `color.context` group now carries a `$description` naming them, so
  arriving at the values leads to their meaning. `Context_Modules.md`
  gains what was genuinely missing: that the context is a per-Pico setting
  under ADR 0104, and that no surface reads these tokens yet.
  `nightFocus` stays where it is - the plan to move it read
  `Color_System.md`'s "fachlicher Anwendungsbereich" in isolation and
  missed that the same axis defines itself by what it *changes*, which
  Nacht/Fokus does. The tension between those two sentences is noted where
  both live.
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
