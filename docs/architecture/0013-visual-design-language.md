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

## Decorative origin marker

Pico may support a subtle decorative origin marker for Pico #1.

The preferred visual form is an `origin_light`: a tiny, optional glint inside the chest core or antenna light, optionally paired with a very short first-spark micro-pulse in idle animation. The marker should read as a small design detail, not as a badge, crown, rank, admin state or trust signal.

The origin marker is:

- decorative
- subtle
- hideable by the owner
- non-authoritative
- not a policy signal
- not a trust signal
- not a host-administration credential
- not a priority or reputation indicator

The marker may be useful to identify the original Pico instance when the owner chooses to show it, but it must not grant capabilities.

## Source-available copy-safety

Pico is source-available for private and non-commercial use. Therefore the origin marker must not be implemented as DRM, copy prevention, obfuscated enforcement, online activation or hidden anti-fork logic.

The correct copy-safe model is provenance, not prevention:

- the visual feature may exist in the visible codebase
- private and non-commercial forks may render their own decorative markers within the license boundaries
- official clients may verify whether a presented Pico #1 marker carries a valid signed origin proof
- unverified markers may still be rendered as decorative, but must not be treated as official origin provenance
- removing or modifying verification in a fork must not compromise official clients

The private signing material for an official Pico #1 origin proof must never be committed to the repository. The repository may contain only public verification material, format documentation or test fixtures that cannot be used to forge the official marker.

A future signed origin proof should contain only minimal, non-sensitive metadata, for example:

```json
{
  "markerType": "pico_origin_marker",
  "markerId": "pico-origin-0001",
  "subject": "pico:<pico-id>",
  "visual": "origin_light",
  "claims": [
    "decorative_only",
    "hideable",
    "no_authority",
    "no_trust_signal"
  ],
  "signature": "..."
}
```

The proof must not include personal information such as legal name, address, email address, Home Assistant URL, device serial number, IP address, location or biographical details.

If the owner hides the origin marker, Pico should not render it, announce it, expose it through casual UI, or send it to other Picos as social context.

## Origin marker and authority separation

Pico #1 is not automatically a Gastgeber Pico, host administrator, trusted peer, policy authority, root device or privileged actor.

Those capabilities must come from their own mechanisms:

| Capability | Source |
|---|---|
| Decorative origin marker | visual identity configuration and optional signed provenance |
| Host administration | host claim, host membership and policy |
| Trust evaluation | local contextual policy and evidence |
| Data access | privacy domain membership and key possession |
| Tool execution | policy decision, confirmation and executor boundary |

The origin marker must remain separate from all of them.

## README and presentation assets

Large README or landing-page assets may use the richer companion scene with panels and feature cards.

Small repo, add-on, and app icons should use the simplified neutral avatar.

## Authority boundary

The avatar communicates state and makes Pico approachable.

The avatar does not decide permissions.

The avatar does not execute tools.

The avatar does not hide risky actions behind friendly visuals.

The origin marker does not grant authority, trust, priority, reputation, host rights, policy rights, data access or execution rights.

## Design rule

Pico should look friendly and alive at the UX layer, while the underlying system remains explicit, policy-gated, auditable, and user-controlled. Decorative identity markers may express origin or style, but they must stay hideable, non-authoritative and separate from trust, policy and access control.
