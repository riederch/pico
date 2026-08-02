# Character silhouette measurement

The executable half of
`docs/design-system/07_Governance/Character_Geometry_Measurements.md`, and the
acceptance check for gate PR6 in ADR 0124.

```bash
node tools/character-silhouette/measure.mjs <candidate.png> --core
node tools/character-silhouette/measure.mjs <candidate.png> --profile
node tools/character-silhouette/measure.mjs <candidate.png> --overlay /tmp/overlay.png
```

`--core` measures head, neck and torso and leaves the arms out, because arms
are pose rather than model. `--profile` prints the width at each height beside
the reference, which is where a wrong shape becomes readable. `--overlay`
writes a comparison image: white is covered, orange is missing, blue is excess.

Write the overlay outside the repository. An unregistered image inside it fails
the design-system gate, and that gate is right to.

## What it does

Both silhouettes are normalised to the same head width and aligned on the head
centre, so the comparison holds whatever camera or resolution produced the
candidate. The reference mask is derived from the registered character
reference on every run: the dark background is filled from the border, which
leaves the visor part of the figure because the bright shell encloses it and
the fill never reaches inside.

Four exclusions are applied, and the numbers are wrong without them:

| Excluded | Why |
|---|---|
| the hologram panel | context accessory, not the figure |
| the caption row | the reference image's own label |
| hover ring and underside glow | emissive, not shell geometry |
| the arms, under `--core` | pose, not model |

The exclusions are calibrated against the exact bytes of
`08_Starter_Kit/assets/PICO_Basis_Avatar.png`. The tool verifies that hash
against the character asset registry and refuses to run if the reference has
changed, rather than reporting confident nonsense.

## What it cannot do

Coverage is necessary and never sufficient.

- **Depth is invisible to it.** One view constrains no z. A flat Pico and a
  deep one measure identically.
- **Seams hide behind the contour.** Where two blended solids meet, the join
  sits inside the outline and the measurement cannot see it.
- **It rewards the wrong thing.** Shrinking a side module improves coverage.
  Side modules are components.

A prototype was once driven from 82 to 96.7 per cent coverage while its
three-dimensional form got worse. Use this to catch inverted proportions, a
missing waist, a wrong scale — the failures that judgement misses. Do not use
it to approve a model.

## No dependencies

`png.mjs` reads and writes PNG over Node's own `zlib`. Non-interlaced
grayscale at 1, 2, 4 and 8 bits, 8-bit RGB, RGBA and grayscale-with-alpha, and
8-bit palette images. A bake carries alpha by contract and takes the alpha
path; anything else is treated as a figure on a dark ground.
