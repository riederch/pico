# 0013 - Visual Design Language

## Status

Accepted as the visual design basis for the companion phase.

Two notes added on 2026-08-09 under ADR 0135. The text below keeps its
wording; these correct what it points at, not what it decided.

**The style variants are not an axis.** "neutral/technical/soft" appears
under *Design basis image* among the things the original concept board
"shows the intent for" - beside context modes, modular elements and
multi-surface presentation. That is a description of the source image, not
a decision. Nothing consumes it, and it has no token, type or manifest
entry. Its neighbour on that list *was* realised, as the eight context
tokens; that is what realisation looks like here, and this item never got
any. If a surface ever needs the distinction it is decided then, with that
surface as the reason (ADR 0135 D3).

**The product standard is now v1.1.0.** The version named below was current
when this was written. `docs/design-system/VERSION.txt` is the authority,
and `check-design-system.mjs` now enforces agreement across the design
system's own current statements (ADR 0135 D4). The number in the text
stays as the record of what this ADR was written against.

## Context

Pico should have a recognizable visual identity. The chosen design basis is a small floating companion robot with a glossy white shell, black face display, expressive glowing eyes, a glowing chest core, and a small antenna/identity light.

The visual language should communicate state, context, and risk without implying that the avatar itself has authority to bypass policy.

## Two standards, and which one wins

The design work is split into two separate standards, both checked in under `docs/design-system`:

1. **PICO Character Design v3.2.1** — the character standard: silhouette, head, visor, torso, arms, material and rendering style, approved identity modules, state and gesture logic, detail corridor and the status light group.
2. **PICO Product Design System v1.0.1** — the derived product, UI and interaction standard: color, typography, spacing, shape, components, chat, patterns, motion, accessibility and asset naming.

The product system may use Pico but must not replace or reinterpret the character. On conflict the character standard wins over UI composition, marketing needs and context design.

This ADR stays the architectural entry point and the authority boundary; it does not restate the packages. Character Design v3.2.1 is always the highest design authority. The Product Design System is derived from it and can never override it. The package version is recorded in `docs/design-system/VERSION.txt` and `manifest.json`; source archive provenance and the immutable original-asset hashes are pinned in `SOURCE.md` and `07_Governance/approved-character-assets.json`. A newer package release replaces that folder rather than living beside it.

## Image assets

The checked-in image assets are expected at:

```text
docs/assets/pico-design-concept.png
docs/assets/pico-ha-icon.png
docs/assets/pico-readme-hero.png
pico_core/icon.png
```

The design system package adds the normative sources:

```text
docs/design-system/01_Foundations/tokens/          canonical DTCG tokens and generated platform outputs
docs/design-system/02_Brand/icons/                 approved product status and context icons
docs/design-system/08_Starter_Kit/assets/          immutable Character reference and diagnostic assets
docs/design-system/07_Governance/approved-character-assets.json
                                                     role and production-approval registry
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

Every production rendering of Pico must use a purpose-bound `production_asset` from the Character registry. New candidates must be derived from the binding Character references and pass the Character workflow before that registration. Three consequences follow and they are not optional:

- no newly drawn or simplified Pico geometry, in particular not for small surfaces — small sizes may use an approved crop that shows less of the approved figure, but they do not redesign it;
- the app icon and the avatar are not interchangeable, so an icon variant is never the character reference for an avatar; and
- new character assets, including new poses and new state variants, come from the character workflow, not from UI or product work.

This applies to generated artifacts as well as to UI. A generated artifact that renders Pico needs an approved production asset. The current ADR 0110 Recovery Card deliberately renders no Character at all; it reads its palette from the generated tokens and must not be described as printing an avatar.

## Design basis image

The original concept board from the design discussion is where this visual world comes from, and it still shows the intent for:

- neutral/technical/soft style variants
- context modes
- modular elements
- multi-surface presentation

The original concept board is the binding visual origin for Character geometry, proportions, materiality and identity modules, but it is not itself a general production asset. The canonical neutral full-body reference and the precise precedence inside Character Design v3.2.1 are pinned by the Character Standard and asset registry. Exact product color values live in the derived tokens. Small surfaces may show less of a registered production figure — for example an approved head/visor crop — rather than a simplified redrawing of it.

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

The exact values are the status tokens, not literals repeated here; the same file also pins listening as its own blue beside normal/active.

Status color appears in:

- eyes
- chest core
- antenna light
- hover glow
- UI badges
- action confirmation surfaces

On Pico itself these are not separate accents. Eyes, mouth line, chest core, antenna light, underside glow and hover ring form one inseparable status light group, and within a single rendering every element of it carries exactly the same status color (status light rule v3.2.1). Context colors may tint accessories, panels, tools and surroundings, and may never recolor that group. A rendering with a differently colored hover ring or recolored eyes is not releasable.

Because the group is baked into an approved Character production asset, a state variant means a separately approved asset — recoloring an existing rendering in product code is exactly what this rule forbids. The immutable diagnostic board retains several mixed-group negative examples; the v3.2.1 hotfix rejects them rather than inheriting their pixels. Status is also never color alone: color, symbol or shape, and text, as the product system requires.

## Design tokens are the source of truth

Color, spacing, radius and motion values live canonically in the DTCG-2025.10 JSON under `docs/design-system/01_Foundations/tokens/`. CSS, SCSS and TypeScript are deterministic, complete generated outputs. Product code and generated artifacts read or import those outputs instead of copying values, because copies drift silently and a design system that is only prose is not enforceable. Typography is Inter or an equivalent system sans; the package ships no font files, so a deployment either provides Inter under its own license terms or accepts the fallback.

The release gate verifies DTCG value shapes, generated-output equality, manifest completeness, source/asset hashes and the token imports used by the Foundation dashboard and Recovery Card PDF. It also measures the contrast pairs the product system promises, in both themes, so a published ratio cannot outlive the token it describes.

Every image the repository ships is registered. The Home Assistant add-on icon and logo are approved production assets derived from the neutral Character reference by crop, and the registry records the source, its hash, the crop box and the derivation method, so the derivation stays checkable rather than asserted. The remaining pre-standard presentation art stays registered as Legacy with pinned hashes until purpose-bound Character production exports replace it; replacing one of those files is a Character migration with a registry decision, not a file swap.

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

Small icons reduce composition through an approved Character crop; they never simplify or redraw Pico's geometry.

For Home Assistant and app icons:

- use the registered app-icon production asset for that platform and size
- normally keep head, visor, eyes and antenna; include the chest core only when the approved crop contains it
- avoid tiny UI panels and small text
- use strong contrast against a dark rounded square
- preserve the cyan core glow for default state
- avoid overly detailed status miniatures

The Home Assistant add-on icon and logo are expected at:

```text
pico_core/icon.png
pico_core/logo.png
```

They have no vector source, and that is a consequence of the rule rather than an oversight: the binding Character references are renderings, so a vector version could only be produced by redrawing Pico, which is exactly what the character standard forbids. `pico_core/icon.svg` and `pico_core/logo.svg` are the pre-standard redrawn shapes. They no longer feed anything that ships and stay registered as Legacy until they are removed or explicitly kept as non-normative history.

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

Small repo, add-on, and app icons should use their registered neutral Character production crop. The Home Assistant add-on icon and logo are exactly that: a head-and-antenna crop of the registered neutral reference on a token background, approved for that surface and size. A production asset is not a Character reference, so neither of them is a source for new work.

## Authority boundary

The avatar communicates state and makes Pico approachable.

The avatar does not decide permissions.

The avatar does not execute tools.

The avatar does not hide risky actions behind friendly visuals.

The origin marker does not grant authority, trust, priority, reputation, host rights, policy rights, data access or execution rights.

## Design rule

Pico should look friendly and alive at the UX layer, while the underlying system remains explicit, policy-gated, auditable, and user-controlled. Decorative identity markers may express origin or style, but they must stay hideable, non-authoritative and separate from trust, policy and access control.
