# 0125 - Parametric Appearance and Version Compatibility

## Status

Proposed. The contract, the `@pico/appearance` package, the protocol
specification and the fixtures exist. A development-only Blender diagnostic
for two governance recipes exists under `tools/character-modeling`; no product
renderer, Pico Link sync, persistence or character approval exists. This ADR
approves no graphics.

Clarified on 2026-08-09, after `TODO.md` asked whether Appearance replaces
the style presets from ADR 0013 or forms a fourth axis beside them. Neither:
the question assumed a shared axis that does not exist. Four axes do, and
they do not compete.

**Status** is what a Pico is doing right now and lives in `color.status` at
runtime. **Context** is the accent palette of `color.context` - seven
domain-shaped names plus `nightFocus`. **Appearance** is this ADR: the
individual Pico's identity as a closed integer parameter set, which
`appearance-profile-v1.ts` already states carries "no status colour, no
context equipment, no image, texture or mesh data, and no free emission
values". **Style variant** is ADR 0013's neutral/technical/soft rendering
register. Appearance cannot express the other three; the type forbids it.
Where they do conflict, ADR 0013's precedence already decides: the
character standard wins over UI composition and context design.

Two things follow that this ADR does not own but records so they are not
lost. The context axis is a **per-Pico setting** under ADR 0104 - two Picos
in one Home can serve different subjects, which is that ADR's own test - so
it belongs in Pico rather than in host configuration.

Two claims made here on 2026-08-09 were corrected the same day. The context
tokens do **not** lack written semantics: `Color_System.md` defines the
axis, `Context_Modules.md` states what a context changes and tabulates all
eight, `Context_Icon_System.md` enumerates them and
`PICO_Product_Design_System_v1.0.md` carries their values. Nothing linked
the tokens to any of it, which is what ADR 0135 D2 fixes. And `nightFocus`
is not unexplained - `Context_Modules.md` lists it with "reduzierte
Helligkeit, minimale Ablenkung", and by the axis's working definition,
what a context *changes*, it qualifies.

The style variant remains the one true absence: prose in ADR 0013, in no
token, type or manifest, and never decided.

## Context

A PICO's appearance must survive time and heterogeneity: newer official
runtimes, older devices that never update, and permitted forks. Transferring
sprites, textures or meshes would tie the identity to one renderer
generation and one device class, and every update would strand old designs.

The canonical PICO identity is therefore a small, deterministic, versioned
set of integers. Shell colours, visor material, trim, hair/head modules and
later standard clothing are reconstructed on the target device from these
parameters. Image, texture or mesh data is reserved for explicitly
non-parametric special cases (custom clothing), and even those always carry
a parametric fallback.

The central compatibility contract:

> A newer official PICO runtime must render every older official PICO
> profile faithfully.

> An older PICO runtime must render a newer PICO profile at least as a
> semantically correct, simplified PICO.

This guarantee is not a parallel compatibility system. It is a new public
compatibility surface under ADR [0025](0025-inter-pico-communication-compatibility.md);
the general claim levels L0–L5 and the extension, capability and conformance
rules of that ADR continue to apply.

## Scope and non-goals

In scope: the appearance document envelope, the compatibility core, the
profile/projection contracts, version axes, fork claims, the official
generator registry, custom asset references with fallbacks, capability and
claim types, parser security limits, and conformance fixtures.

Not in scope, explicitly: 3D modeling; graphical calibration of concrete
hair or clothing; any WebGL/Three.js/Babylon.js renderer; companion or web
UI; runtime synchronization between real Picos; persistence migrations;
download or storage of custom asset bytes; hair physics; production release
of a character generator; any change to or release of Character Design
v3.2.1; and any claim that full appearance compatibility is already
productively implemented.

## Relationship to ADR 0025 and ADR 0124

ADR 0025 stays the superior compatibility authority: semantic versioning,
capability negotiation, namespaced extensions, safe ignoring of unknown
optional extensions, conformance testing and the ban on silently
reinterpreting published semantics. Appearance adds a compatibility surface
beneath it, not a competing level system.

ADR [0124](0124-authored-character-core-and-tiered-presentation.md) stays
the character-core authority: the authored, hash-pinned glTF core, the
authored/parametric split, the three presentation tiers and the rule that
every tier derives from the same core. This ADR versions the parametric
appearance on top of that core; it does not redefine it. `coreModelVersion`
refers to a released authored core; the value `0` states honestly that no
core has been released yet.

Character Design v3.2.1 stays unchanged and stays the highest design
authority. This ADR creates the technical and governance version basis; the
release of concrete procedural hair, clothing or material generators remains
a separate character decision (the head-module exclusivity rule proposed by
the PAS brief still requires Character Design v3.3.0). Until then every
appearance rendering remains `diagnostic`, and the generator registry entry
stays `proposed`.

Two clauses ADR 0013 requires explicitly:

1. The rule that every production rendering of PICO uses an individually
   registered `production_asset` is extended, for procedurally generated
   depictions, by a generator approval class (`procedural_generator`):
   approved are the generator, its version, its parameter domain and its
   golden vectors — not each produced image. This extension becomes
   effective only with the character version that adopts it; until then it
   changes nothing.
2. The value corridors of the appearance parameters are constants of the
   appearance specification, frozen by golden vectors. Appearance values are
   payload inside those corridors, not design tokens. The DTCG token
   authority of ADR 0013 for product UI colours is untouched, and no
   renderer may introduce colour literals into the token-checked web files.

## Decision

### Four things that are never the same thing

1. **Authored core** — the character; hash-pinned artifact under ADR 0124.
2. **Appearance identity** — the validated parameter document defined here;
   durable and personal.
3. **Runtime state** — status colour, emotion, gaze, mouth, pose, gesture;
   never part of appearance identity.
4. **Presentation quality** — tier, LOD, FPS, shadows, secondary motion;
   local decisions that must never change identity.

### Separate version axes

No single number ("PICO V6") may mix technical meanings. The axes —
envelope, compatibility core, profile family/version, core model, generator
id/version, animation schema, custom asset schema, renderer version,
presentation tier, protocol version — are enumerated normatively in
[`docs/protocol/appearance-document-v1.md`](../protocol/appearance-document-v1.md),
including which of them are identity and which are transport or local
state. A new version is required whenever bytes, meanings, ranges, defaults,
rounding, colour mapping, generated geometry, zone mapping, mount points,
visible output, canonical buffer order, projection or fallback semantics
change for an already valid input.

### Appearance Document Envelope V1

The wire and storage form is a small, length-prefixed record container
(`pad1_`), specified byte-exactly in the protocol document: an 8-byte
header, then records with type, flags (bit 0 critical), version and length.
Unknown optional records are skipped without losing the document; unknown
critical records reject it. Hard limits (4096 bytes total, 64 records, 1024
bytes per extension payload) are checked before any allocation. Encoders
emit canonical record order; decoders accept any order. The existing
18/38-byte profile codec is carried as the payload of the canonical profile
record, byte-for-byte unchanged, and keeps its isolated `pa1_` text form.

### Compatibility Core V1

Every document carries, besides the full profile, a small permanently stable
semantic projection: shell/face/trim base colours, a coarse semantic head
family with hue/length/volume/parting, and a clothing block. The clothing
block derives from the custom-asset references, because Profile V1 defines
no clothing: without a custom clothing reference it is `none`, with exactly
one it carries `custom_fallback` plus that reference's fallback family and
hues — so the fallback actually reaches old clients instead of merely being
declared. More than one custom clothing reference is invalid in V1. Family
IDs are published, never reused, never reordered. The projection over
profile and custom assets is deterministic, integer-only, has published
thresholds and is frozen by golden vectors — the thresholds live in the
protocol specification and the governance vector file, not only in code.

Core V1 is the permanent, mandatory legacy fallback and is frozen as such:
its fields and family lists are closed forever, new generators project into
an existing family or `custom_fallback`, richer compatibility data arrives
as additional optional records or extensions, a future core revision never
replaces the V1 record, and every future official appearance document keeps
carrying Core V1. A first-generation client must always be able to render a
recognizable PICO from it.

### Backward compatibility is cumulative

Every new official runtime decodes all earlier published official profiles,
executes or verifiably reimplements all earlier published official
generators against their pinned golden vectors, and preserves their identity
semantics. Replacing an old generator implementation is allowed only when
the normative vectors prove equivalence. Rendering a V4 profile
"approximately" with a V6 generator is forbidden, as is a lossy chain
migration (V2→V3→…→V6): an old profile is rendered from its own
specification. Explicit user migrations must preserve the original profile,
record source, target and algorithm versions, and never happen silently
through a software update.

### Forward compatibility through semantic fallbacks

An older runtime that does not know a newer profile version renders the
compatibility core: correct base colours, a similar head-module family, a
usable clothing fallback. The codec carries the unknown profile payload
opaquely and re-encodes it byte-identically, so forwarding and storage lose
nothing. When the document content *is* understood, the embedded core must
equal the normative projection over profile and custom assets; a mismatch
rejects the document (`compatibility_core_mismatch`) rather than silently
preferring either value. A decoder that skipped custom-asset records of an
unknown version cannot recompute the clothing derivation: it accepts the
embedded clothing fallback as-is — that block exists for exactly this case —
and such a partially understood document is forwarded as its original bytes,
never re-encoded as canonical.

### Fork claims and namespaces

A fork may use different renderers, languages, data structures and
additional generators. It may claim appearance compatibility only for the
envelope, core, profile and generator versions it fully and faithfully
implements, passing the published conformance vectors, ignoring unknown
optional extensions, rejecting unknown critical ones, reusing no IDs and
keeping its own extensions in its own namespace. "Fully PICO-compatible" is
inadmissible without exact surface, version and test statements. Claims are
typed (`PicoAppearanceCompatibilityClaimV1` in `@pico/protocol`); there is
deliberately no `isPicoCompatible()` boolean, and no certification logic is
pretended.

### Official generator registry and immutability

`docs/design-system/07_Governance/official-appearance-generators.json` is
the machine-readable registry of official generators: id, version, profile
and core-model requirements, status (`proposed`/`approved`/`deprecated`/
`withdrawn`), spec and vector paths, the SHA-256 pin of the normative vector
file, release and support status, parameter domain and fallback projection
version. A published approved generator is never edited; a fix that changes
visible or canonical output is a new generator version. The registry is not
a character approval: in this milestone the head generator stays `proposed`.

### Custom assets are additions with mandatory fallbacks

Custom assets (initially custom clothing) are referenced by SHA-256 with a
media type and a parametric fallback (renderable clothing family plus hues).
No URLs, no embedded image bytes, no download in this milestone. V1 allows
at most one custom clothing reference per document, so the clothing
derivation of the compatibility core stays unambiguous, and that fallback is
projected into the core rather than merely declared. A missing, refused or
invalid asset renders the fallback; it never yields an invisible or broken
PICO, never overwrites the profile, and never replaces core, visor, status
light group or rig. Custom assets carry no authority, policy or trust
meaning.

### Presentation quality and animation stay separate

A device may reduce shadows, post-processing, secondary motion, simulation
frequency, LOD, resolution, frame rate, or drop from realtime to composite
or static tiers — but it may not, for a supported profile version, change
family, base colours, proportions, mount points, clothing family or identity
modules. The pipeline is documented for later renderers as
`identity → semantic runtime state → presentation budget → tier → LOD/FPS/effects`.
Durable appearance never contains gaze, blink, mouth, emotion, rotation,
gesture or status colour; later animation uses semantic intents with
fallbacks (`PicoAnimationIntentV1` direction) so an old client can reduce an
unknown concrete animation to a known intent. That runtime surface is
documented only, not implemented, and the existing `avatar.state_changed`
foundation event is deliberately not extended here.

### Capability negotiation is an optimization

Capability names exist (`pico.appearance.document.v1`, …) and forks
advertise their own; but a stored or forwarded document must remain
meaningfully readable without any prior handshake. No appearance value,
compatibility level or visual similarity is an identity, trust, policy or
authorization statement.

### Parser security and robustness

All external appearance data is untrusted: hard limits before allocation, no
recursion, no URL fetching, no scripts/shaders/executable payloads, no file
paths from foreign profiles, closed JSON shapes with plain prototypes and no
prototype inheritance, integers only (no floats in the canonical profile),
no silent clamps on identity parameters, no device randomness, no
time/device/platform data in the identity, no GPU-generated topology as a
canonical source. Errors are typed and never echo foreign payload bytes.

## Consequences

Positive: appearance survives version and device boundaries by
construction; old designs are protected by pinned vectors instead of
goodwill; forks get an honest, testable claim surface; the codec work is
runtime-free and cheap to keep deterministic.

Negative: every published byte and threshold is now frozen — improving the
projection or the family heuristics means a new version with its own
support burden; official runtimes accumulate generator implementations
forever; the registry and vector files add governance maintenance; and the
compatibility-core duplication costs 30 bytes per document to keep old
clients alive.

## Open questions

- When Character Design v3.3.0 decides the head-module exclusivity and the
  first generator approval, does the family threshold table survive visual
  calibration, or does calibration need projection V2 before any release?
- How are historical generator implementations packaged once there are
  several (single runtime with all versions, or versioned modules)?
- Whether `coreModelVersion` pinning should become mandatory (non-zero) once
  ADR 0124 releases the first authored core.

## Gates for later work

- **AP1 — Renderer:** any renderer consumes validated documents only, reads
  colours through the specified corridor mapping, and its output for
  approved generators is frozen by golden geometry hashes before any
  production claim.
- **AP2 — Sync:** carrying appearance over Pico Link requires its own
  milestone under ADR 0025 (capability advertisement, size budgets, replay
  and origin rules); the envelope version axis stays independent of the
  protocol version.
- **AP3 — Persistence:** appearance is a person's Pico setting (ADR 0104):
  stored in the Pico profile, never in host configuration, add-on options or
  environment variables.
- **AP4 — Character:** no generator leaves `proposed` and no appearance
  rendering leaves `diagnostic` without an explicit character decision
  (Character Design v3.3.0 or later).

## References

- [`docs/protocol/appearance-document-v1.md`](../protocol/appearance-document-v1.md)
- [`docs/protocol/fixtures/appearance-document/v1/suite.json`](../protocol/fixtures/appearance-document/v1/suite.json)
- `docs/design-system/07_Governance/parametric-appearance-v1-vectors.json`
- `docs/design-system/07_Governance/official-appearance-generators.json`
- `docs/development/briefs/parametric-appearance-system.md`
- `packages/appearance/src/index.ts`
