# 0013 - Visual Design Language

## Status

Accepted as the visual design basis for the companion phase.

## Context

Pico should have a recognizable visual identity. The chosen design basis is a small floating companion robot with a glossy white shell, black face display, expressive glowing eyes, a glowing chest core, and a small antenna/identity light.

The visual language should communicate state, context, and risk without implying that the avatar itself has authority to bypass policy.

## Image assets

The checked-in image assets are expected at:

```text
docs/assets/pico-design-concept.png
docs/assets/pico-ha-icon.png
docs/assets/pico-readme-hero.png
pico_core/icon.png
```

Large or binary visual assets should be provided as a ZIP archive with the correct repository folder structure and then committed locally.

## Primary avatar shape

The default Pico avatar uses:

- rounded floating body
- oversized rounded head
- black face/display area
- expressive glowing eyes
- subtle smile
- glowing chest core
- antenna identity light
- soft blue hover glow
- modular side/arm elements

This shape is the default silhouette for icons, avatar states, UI headers, and companion surfaces.

## Design basis image

The original concept board from the design discussion is the reference for:

- default avatar proportions
- status color system
- neutral/technical/soft style variants
- context modes
- small-state miniatures
- modular elements
- multi-surface presentation

The concept board should be treated as direction, not as a strict fixed asset. Product assets should simplify it for small UI surfaces.

## Style variants

The variants should be treated as style presets, not as hard gender categories.

Recommended presets:

- Standard
- Technical
- Soft
- Focus
- Night
- Work
- Home
- Firefighter
- Water / WWG

A user's Pico can adapt visual details and voice style, but the core silhouette should remain recognizable.

## Status color language

Pico uses color as system state, not decoration.

| Color | Meaning |
|---|---|
| Blue / cyan | normal, active, available |
| Violet | thinking, analysing, AI reasoning |
| Yellow / amber | warning, uncertainty, confirmation needed |
| Red | blocked, critical, policy stop |
| Green | success, safe completion, positive result |

Status color appears in:

- eyes
- chest core
- antenna light
- hover glow
- UI badges
- action confirmation surfaces

## Avatar states

The visual language should support at least:

- idle
- listening
- thinking
- working
- warning
- blocked
- success
- offline/degraded

## Context modes

Context mode changes details, not the identity.

Examples:

- Technology mode: panel, tool arm, blue/cyan accents
- Water / WWG mode: water droplet or pipe/flow motif
- Firefighter mode: red helmet/accent and safety context
- Office / organisation mode: document/dashboard motif
- Smart home mode: home glyph and device surfaces
- Night / focus mode: darker shell, violet/low-light glow

## Icon rules

Small icons must simplify the full avatar.

For Home Assistant and app icons:

- keep the head, eyes, antenna, and chest core
- avoid tiny UI panels and small text
- use strong contrast against a dark rounded square
- preserve the cyan core glow for default state
- avoid overly detailed status miniatures

The Home Assistant add-on icon is expected at:

```text
pico_core/icon.png
```

The SVG source version is kept at:

```text
pico_core/icon.svg
```

## README and presentation assets

Large README or landing-page assets may use the richer companion scene with panels and feature cards.

Small repo, add-on, and app icons should use the simplified neutral avatar.

## Authority boundary

The avatar communicates state and makes Pico approachable.

The avatar does not decide permissions.

The avatar does not execute tools.

The avatar does not hide risky actions behind friendly visuals.

## Design rule

Pico should look friendly and alive at the UX layer, while the underlying system remains explicit, policy-gated, auditable, and user-controlled.
