# 0132 - The Recovery Card Renders from Data, and Its Two Halves Cannot Disagree

## Status

Accepted; not implemented. Decided by the user on 2026-08-09 after reading
the generator: its input should be the essential facts, split into Pico
content and design, so the card's appearance can be worked on without
touching anything else.

## Context

`generatePicoRecoveryCardPdfs` takes a validated `PicoVaultRecoveryCard`
and returns both print forms as bytes. Several things about it are already
right and are not in question here: printing is a separate port that
spools bytes to `lp` without a file ever existing, all seven colours come
from generated design tokens rather than hex literals, the page geometry
is exported, output is deterministic, no PIN parameter exists at this
layer, and the A4 sheet embeds the rendered ID-1 pages rather than
redrawing them, so the two print forms cannot drift apart.

What is not separable is the appearance. Every position, every type size
and every string sits inline across three drawing functions, so changing
how the card looks means editing the same file that carries the QR
encoding and the canonical payload. The tests do not stand in the way -
they pin canonical bytes, page sizes, page count and determinism, and
deliberately no layout - but the file does.

Only six facts are printed: the Pico's name, the identity key
fingerprint, the Home name or id and the issue date on the front; the
24-word recovery phrase, the QR and the endpoint hint on the back.
Everything else on the card is a label.

The card's relationship to the versioned design system is narrower than
it looks. It consumes exactly one token group - `color`, all seven
constants - and that link is mechanically held: `design-system:check`
runs in `release:verify` and fails when the generated token module and
the token source disagree, so the card cannot drift on colour. It does
not consume `space`, `radius` or `motion`, and it cannot consume type
tokens because the design system has none. Its content contract is
versioned (`pico.recovery.card.v1` and `v2`); its appearance is not, so
two cards printed either side of a token change differ and neither says
which design generation it belongs to. For an artifact whose appearance
carries no authority that is acceptable, but it should be known rather
than assumed.

The obvious split - loose fields instead of the Vault object - breaks
something. The QR carries the **exact canonical bytes**, deliberately not
a re-serialization. Loose fields force one of two failures: the generator
rebuilds those bytes from the fields, which is the second serialization
path the code refuses and an ADR 0034 concern, or the caller hands over
both the printed fields and the bytes and can hand over a mismatched
pair. The second is the worse one. A card whose printed fingerprint says
one thing and whose QR says another is not a degraded card; it is a
misleading one, and the person holding it has no way to notice.

ADR 0106 already answered this shape for approvals: the canonical
signature input and the human statement are built from the same validated
fields, so what a person reads and what gets signed cannot come apart.
This is that principle applied to the card.

## Scope

Covers: the generator's input shape, the one guarded mapping from a
validated card, the design input, the label strings and the avatar slot.

Does not cover: what the card contains (ADR 0110 and 0112 unchanged), the
canonical payload or its transports, the print port, PIN separation, and
the character assets themselves (ADR 0124).

## Decision

### The generator takes content and design, and nothing else

```text
generateRecoveryCardPdfs(content, design) -> { cardPrinterPdf, paperPrintablePdf }
```

`content` carries the six printed facts plus the QR payload as **opaque
bytes**. It carries no Vault type, no card object and no PIN.

`design` carries two different things, and keeping them apart is the
point:

- **The card's own styling** - colours from the design tokens, labels,
  geometry, the specimen flag. This is design *of the card*, not of Pico,
  and it stays here.
- **Appearance parameters plus a declared tier** - what Pico looks like
  and what this surface can present. The card does not resolve these. It
  hands the parameters to the design module and declares its capability
  (composite, print, fixed size, no motion), and the module answers with
  the depiction for that tier.

Every field defaults to what the card looks like today.

The generator becomes what it should have been: data in, bytes out. It
neither validates custody, nor knows what a Vault is, nor decides what
Pico looks like. A surface that could draw its own Pico would be a second
authority over the character, which is exactly what ADR 0124 separates
once instead of per surface.

### Exactly one mapping turns a validated card into content, and it round-trips

One function maps `PicoVaultRecoveryCard` to `content`. It keeps the
existing `assertRecoveryCard`, and it adds the check that makes the split
safe: parse the canonical bytes back with the strict inverse parser that
ADR 0112 S3 already built, and compare the result against the fields
about to be printed. A mismatch refuses.

This is the only supported way to produce a production card. Constructing
`content` by hand stays possible and is exactly what makes a design
playground work - with a fabricated name, a fabricated phrase and
fabricated bytes, no Vault, no daemon and no ceremony - but such a card
never comes from the production path.

### The invariant is the property, not the function

What this ADR protects is one sentence: **a card's printed side and its
scanned side say the same thing, or it is not produced.** The mapping is
how that is enforced today; the sentence is what must survive any later
change to it.

### Design is data, including the words

Labels move out of the drawing code into `design`. Two things follow. The
card becomes localisable without touching a single drawing call, and the
current mixed-language instruction on the A4 sheet - "At 100% / actual
size printen. Nicht an Seite anpassen." - stops being a code edit and
becomes a value.

### The avatar slot is the ADR 0124 composite consumer, not a slot of its own

ADR 0124 lists three presentation tiers over one authored source, and
names **PDF** among the composite-tier surfaces: a transparent bake plus
a zone map, with background, status colour, expression and personal tint
as the runtime freedom. The card is therefore not a special case that
needs an avatar mechanism of its own - it is an already-named consumer
that currently bypasses the pipeline by hand-drawing a cyan circle and
the `PICO` wordmark.

So `design` does not get a generic image field. It gets the composite
consumer shape: bake plus zone map plus the composition inputs ADR 0124
defines, and nothing that would let a surface invent its own depiction.
That keeps the rule that ADR 0124 exists for - authored and parametric
are separated once, not per surface - true for the card as well.

It stays empty for now, and that is enforced rather than intended:
`approved-character-assets.json` lists five assets, all
`character_reference` with an empty `productionUses`, so a production
depiction needs a registered production use of an approved asset - ADR
0112 S4, blocked on ADR 0124's model and bakes. Until then the wordmark
stays and nothing claims otherwise.

The slot exists now so the bake lands in a place designed for it, rather
than being pressed into a drawing function later.

## Rejected alternatives

### Keep the Vault card as the generator's input

Every design change stays coupled to the custody type, and any experiment
with the card's appearance needs a real Vault card to render at all. That
is the cost this ADR exists to remove.

### Loose fields, with the generator rebuilding the canonical bytes

A second serialization of something that already has exactly one
canonical form. The QR would stop being the bytes and start being a copy
of them, and the two would be free to diverge under any future change.

### Loose fields and bytes, without the round-trip check

The cheap version of this ADR, and the dangerous one: it hands callers a
way to print a card whose halves disagree, with nothing to catch it.

### A golden-hash test over the rendered layout

Would make appearance changes break the suite, which is the opposite of
the goal. The existing tests already draw the right line: bytes, sizes,
count and determinism are pinned; layout is free.

## Gates

- **G1 - Types and the guarded mapping (open):** `content` and `design`
  types, the single card-to-content mapping with `assertRecoveryCard` plus
  the canonical round-trip comparison, and refusal on mismatch.
- **G2 - Drawing takes design, and its defaults come from the design
  system where the medium allows (open):** the three drawing functions
  read colours, fonts and geometry from `design` instead of module
  constants, with defaults that reproduce today's card byte-for-byte.
  Where a token group is deliberately not consumed, the reason is written
  next to the default rather than left as a bare number - `space` and
  `radius` are screen quantities, and a laminated 85.6 mm card carrying
  4.2 pt type does not scale out of them. Typography is not a choice this
  gate can make: the design system has no type tokens at all, so the
  card's fonts are an absence upstream, not an omission here.
- **G3 - Labels are data (open):** every string on both faces and the A4
  sheet moves into `design`; the mixed-language instruction is fixed as a
  value, not as code.
- **G4 - The depiction comes from the design module (open):** the card
  passes appearance parameters and declares its tier; the design module
  answers with the ADR 0124 composite artifact - bake plus zone map plus
  the written composition formula - and the card composes and places it.
  No free image field, no drawing callback into the PDF context: a
  callback would make the design module learn pdf-lib, Canvas and SVG one
  by one and invert the dependency this gate exists to create. The
  parameter side already exists as ADR 0125's versioned appearance
  profile with `projectAppearanceProfileV1`; the depiction side does not
  and is ADR 0124's unbuilt core. The slot therefore stays empty, refused
  by the same asset governance until a production use is registered
  against an approved asset.

  Three constraints decide whether this interface is usable, and each is
  a present fact rather than a worry: the answer must be
  **deterministic**, since the card's byte-identical output is tested and
  `Math.sin`/`cos`/`pow` are not bit-identical across engines - so
  quantized output, hashed after quantization; it must be **lazily
  loaded**, since `@pico/companion/recovery-card` reaches the writer
  through a narrow subpath precisely to keep bakes out of the tray import
  graph and its ADR 0113 C3 budget; and it must carry **print
  resolution**, which today's assets do not - every depiction in the tree
  is a crop of one 303x347 rendering, and a laminated 85.6 mm card is not
  a screen.
- **G5 - Counter-proof (open):** a test that hands the generator a
  `content` whose printed fingerprint disagrees with its QR bytes and
  proves the mapping refuses it. Without this the invariant is a comment.

## Consequences

Positive:

- the card's appearance can be worked on without a Vault, a daemon or a
  ceremony, and without touching the QR or canonical path;
- the divergence hazard that a naive split would have introduced is
  closed by construction and counter-proven, rather than avoided by not
  splitting;
- the card becomes localisable, and a language mix currently printed on a
  sheet a person holds becomes a value someone can fix;
- the avatar gets a designed place before there is an asset for it, which
  is the order that avoids a retrofit.

Negative and residual:

- one more indirection between the card object and the page, and the
  round-trip check costs a parse per card - irrelevant at this rate,
  but it is not free;
- hand-built `content` is deliberately possible, so nothing prevents
  someone from rendering a nonsense card; that is the point of the
  playground, and the production path is the only one that is guarded;
- the avatar slot stays empty for as long as ADR 0124 has no registered
  production assets, so G4 delivers a shape and no visible change.

## Relationship to other ADRs

- Applies ADR `0106`'s principle - one validated source behind both the
  human-readable and the machine-readable form - to the Recovery Card.
- Leaves ADR `0110` and ADR `0112` unchanged in what the card contains,
  what it is for and how it is printed; only the generator's input shape
  changes.
- Reuses the strict inverse parser ADR `0112` S3 built for the v2 scan
  transport as the round-trip check.
- Respects ADR `0124` and ADR `0112` S4: the avatar slot carries no asset
  until a production use is registered.
- Keeps ADR `0113` C3's subpath discipline: new modules are reached
  through narrow published subpaths, never a barrel, so the tray import
  graph and its budget stay untouched.

## References

- [ADR 0034](0034-canonicalization-signature-inputs-and-test-vectors.md)
- [ADR 0106](0106-approval-rendering-from-the-signed-bytes.md)
- [ADR 0110](0110-recovery-card-and-time-locked-zero-device-recovery.md)
- [ADR 0112](0112-recovery-product-surfaces-in-the-background-companion.md)
- [ADR 0113](0113-electron-shell-over-a-shell-free-companion-service-core.md)
- [ADR 0124](0124-authored-character-core-and-tiered-presentation.md)
