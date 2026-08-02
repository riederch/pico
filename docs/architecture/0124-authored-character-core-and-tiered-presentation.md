# 0124 - Authored Character Core and the Tiered Presentation Pipeline

## Status

Proposed. The architecture was decided with the user on 2026-08-02 after a
throwaway prototype established what a single reference rendering can and
cannot support. Gates PR1-PR6 are open.

This ADR fixes how a character model enters the repository and how it is
presented. It does not approve a model, and it does not say what Pico looks
like. That remains a Character decision under ADR 0013.

## Context

Every depiction of Pico in this repository is a crop of the same rendering,
303 by 347 pixels. The add-on icon and logo approved on 2026-08-02 are crops
of it, and the design system references are the rendering itself.

Two consequences follow, and neither is an oversight:

- There is a resolution ceiling. A crop cannot carry more pixels than the
  source has, so no honest 1024-pixel app icon exists.
- The eight avatar states in ADR 0013 have no assets at all. The status light
  rule forbids recoloring the figure in product code, so a state variant is a
  separately approved asset rather than a tint. With one rendering available,
  every state after `neutral` is blocked on character work.

A parametric generator would dissolve both. A prototype was built to answer
whether a procedural core could reproduce the character, and it answered a
sharper question instead: a single rendering under-determines a
three-dimensional model. Silhouette coverage against the reference was driven
from 82 to 96.7 per cent while the model itself got worse, because the
measurement cannot see depth, cannot see the seam where two blended solids
meet, and rewards shrinking a side module that exists as a component.

The user therefore decided to author the model externally, in a modeling tool,
and to fix the architecture around it.

## Scope

In scope: how an authored core enters the repository, what a bake is, what
runs at runtime, how presentation tiers relate to each other, and how all of
it is governed.

Out of scope: what the model looks like; the state set a commission covers,
which is a parameter of the modeling order rather than of the architecture;
the personal appearance parameter space, which is ADR 0125; and presence
semantics, which are ADR 0126.

## Decision

### The character core is one authored, hash-pinned artifact

glTF 2.0 binary is the normative artifact and is pinned by hash. The authoring
source, typically a `.blend` file, is not normative and is not pinned; it may
change without a character decision as long as the exported artifact does not.

The mesh is a character asset of its own class. It is not an image, so the
shipped-asset sweep that guards every rendered depiction does not currently
see it; PR1 closes that.

### Authored and parametric are separated once, not per surface

Authored, and therefore character:

- silhouette, proportions, topology and the material zones
- head, visor surface, torso, arms, side modules, chest core, hover form
- the mounting point the head module attaches to

Parametric, and therefore product:

- the colour of each material zone, from the personal appearance profile
- the face display drawing, meaning eyes and mouth line
- status light colour and intensity across the whole status light group
- pose within the authored range
- the procedural head module

The split is not arbitrary. Pico's face is a dark display, so expression is a
drawing on a surface rather than a deformation of geometry. That single fact
is why expression can be parametric and cheap while gesture cannot.

### Three presentation tiers, one source

| Tier | Artifact | Runtime freedom | Typical presence |
|---|---|---|---|
| static | one finished image per state | display only | watch, smallest icons, e-ink |
| composite | transparent bake plus zone map | background, status colour, expression, personal tint | phone, dashboard, companion window, PDF |
| realtime | the glTF itself | free camera, motion, turning | desktop with a GPU and an open window |

A tier is selected from a capability the presence declares, never from a device
class, matching the capability model in ADR 0126.

One rule holds the tiers together:

> All tiers derive from the same mesh. The lower tiers are precomputed
> projections of what the higher tier computes live.

Without it, a watch would show a different Pico than a desktop, which is a
character contradiction rather than a fidelity difference.

### The bake carries transparency, zones and a display projection

A bake is not a picture. It is:

- **colour with alpha.** The figure is cut out. A background is never baked in,
  because backgrounds are free at runtime and baking one throws that away.
- **an indexed zone map** over five zones: shell, face display, trim, status
  emitters, head module.
- **a display projection**: where the visor sits in image space and how its
  local coordinate frame is oriented. Without it the runtime cannot place the
  face consistently across states and cameras, and the whole parametric
  expression path collapses.
- **optional part layers** where cheap gesture is wanted, each with its own
  alpha and pivot.
- **metadata**: source mesh hash, state, camera, size.

### Composition is arithmetic with a written formula

Per-zone tinting, status colour application and face drawing are specified as
formulas with defined rounding, not left to each consumer. The same appearance
must produce the same bytes in a PDF, in a browser canvas and in Node.

The canonical path avoids floating-point trigonometry, because `Math.sin`,
`Math.cos` and `Math.pow` are not bit-identical across JavaScript engines and
would make any golden hash brittle.

### Realtime is designed for, not shipped first

The contract must not preclude tier three, and the first delivery does not
contain it. When it arrives:

- it runs only while a window is open, on a presence that declared the
  capability. The tray baseline stays on tier one or two, so no GPU context
  exists in the state ADR 0113 measures its memory budget against.
- approval is generator-shaped. A live render produces a new image every
  frame, so per-image registration is impossible. What is approved is the mesh
  plus the renderer plus the parameter domain, the `procedural_generator` class
  proposed for the appearance system, generalised to the core.

### Pose is the bake axis, not state

Seven of the eight avatar states in ADR 0013 change only the status colour and
the face drawing, both of which the runtime already owns. They need no bake of
their own. What forces a new bake is a change the runtime cannot fake: a
different arm position, because a rotated part layer keeps the light it was
baked with and its joint breaks.

The bake set is therefore sized by pose, and stays small while status stays
what the design system says it is - colour, symbol and text rather than
posture.

### A bake is replaced, not versioned

A new bake of an existing pose and camera overwrites the old one. The registry
pins its hash, so any shipped state stays provable through the registry entry
and the commit that carried it; keeping superseded bakes beside the current one
would grow the repository by the full set on every re-bake and buy nothing the
history does not already give.

### Baking happens outside the release gate

Bakes are produced by the modeling pipeline, not by the build. A 3D toolchain
in the release gate would drag renderer version determinism into CI, and
Blender output is not reproducible across versions.

The price is explicit: no `pnpm` command regenerates a bake. They enter the
repository the way every character asset does, through the approval process,
with their derivation recorded.

## Gates

- **PR1 - The mesh enters as a registered character asset (binds the design
  system gate):** glTF 2.0 binary, pinned by hash, in its own asset class. The
  shipped-asset sweep is extended past image files so a mesh cannot arrive
  unregistered.
- **PR2 - The bake contract is executable (binds every bake):** alpha, the
  indexed five-zone map, the display projection, the source mesh hash, and
  state, camera and size in metadata. A bake missing any of them is rejected
  by the gate rather than by review.
- **PR3 - Composition is specified, not implied (binds every consumer):** the
  per-zone tint formula, the status application and the face drawing are
  written down and frozen by vectors, so the same profile yields the same
  bytes everywhere.
- **PR4 - Tier equality (binds every tier):** a lower tier is produced from the
  same mesh as the higher one. A tier drawn by hand or derived from a different
  source is not a tier of this character.
- **PR5 - Realtime stays behind a declared capability (binds ADR 0113 and
  0126):** no GPU context exists in the tray baseline, and the memory budget is
  measured in that state.
- **PR6 - Acceptance is measured (binds character approval):** a delivered
  model is checked against the recorded reference geometry before approval,
  under the recorded measurement protocol, rather than judged by eye.

## Honest limits

- **Depth is not verifiable.** The existing references are one viewpoint. The
  modeler sets depth, and by setting it, defines character. No measurement
  against current material can confirm it.
- **Part-layer gesture keeps its baked lighting.** A rotated arm carries the
  shading it was baked with. Invisible at small angles and small sizes, wrong
  at large ones. That is the boundary where tier three earns its cost.
- **The head module cannot be baked into a finite set.** It is continuously
  parametric, so it is baked per profile and composited, which approximates
  occlusion and light exchange with the head. Acceptable small, questionable
  large.
- **The acceptance measurement covers silhouette from one camera.** It catches
  inverted proportions, a missing waist and a wrong scale. It cannot approve a
  model, and it must never be treated as if it could.

## Consequences

Positive:

- The resolution ceiling and the eight missing state assets are dissolved by
  the same decision.
- Personal appearance no longer needs a bake per person. Zone tinting keeps the
  bake set finite and the personalisation to integer arithmetic.
- Backgrounds become free everywhere, because the figure is cut out.
- No GPU, no WebGL and no 3D runtime enter the product by default, so the
  offline posture in ADR 0118, the resource posture in ADR 0119 and the memory
  budget in ADR 0113 are untouched.

Negative:

- A binary artifact enters the repository and must be governed like one.
- Three tiers are three code paths to keep consistent. Tier one and two share
  the bake pipeline; tier three is additive and optional, which limits but does
  not remove the cost.
- Bakes cannot be regenerated from a checkout. Reproducing them requires the
  modeling pipeline.
- The state set becomes a commissioning decision with real external cost, and
  extending it later is a new commission.

## Relationship to other ADRs

- **ADR 0013** stays the design authority and the Character Standard stays
  above it. This ADR extends the production asset model with a generator-shaped
  approval, effective only when the Character version that accepts it is
  adopted.
- **ADR 0009** gets its avatar states an achievable path; they remain absent
  until a state set is commissioned.
- **ADR 0104** keeps appearance as a Pico setting rather than host
  configuration.
- **ADR 0113** keeps its tray memory budget, and PR5 protects the state it is
  measured in.
- **ADR 0118 and 0119** are the reason generation is offline and the product
  ships no GPU dependency.
- **ADR 0125** parameterises appearance on the core this ADR establishes; its
  collision tests presuppose exactly the volumes an authored core provides.
- **ADR 0126** supplies the capability model that selects a tier.

## References

- `docs/design-system/07_Governance/Character_Standard_v3.2.1.md`
- `docs/design-system/07_Governance/approved-character-assets.json`
- `docs/design-system/08_Starter_Kit/assets/PICO_Basis_Avatar.png`
