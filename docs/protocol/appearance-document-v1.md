# PICO Appearance Document V1

This document is the executable specification of the PICO Appearance Document
Envelope V1 (`pad1_`), its records and its consistency rules. It is the
normative byte-level companion to ADR
[0125](../architecture/0125-parametric-appearance-and-version-compatibility.md)
under the compatibility authority of ADR
[0025](../architecture/0025-inter-pico-communication-compatibility.md).

Honest status: after the current milestone this surface exists as a
package/codec contract in `@pico/appearance` with authoritative fixtures. It
is not synchronized over Pico Link, not rendered by any product surface and
not part of the advertised runtime capabilities. Published semantics are
immutable from the first release that carries them; anything that changes a
byte, a meaning, a range, a rounding rule or the projection needs a new
version number.

## Version axes

No single number may mix these meanings. Identity-relevant axes travel inside
the document; transport and presentation axes never do.

| Axis | Carried in | Part of identity |
|---|---|---|
| `appearanceEnvelopeVersion` | envelope header byte 2 | no, transport contract |
| `compatibilityCoreVersion` | record `0x01` header version | yes |
| `appearanceProfileVersion` | record `0x02` payload | yes |
| `profileFamilyId` | record `0x02` payload | yes |
| `coreModelVersion` | record `0x02` payload | yes (0 = not pinned to a released authored core) |
| `generatorId` / `generatorVersion` | profile payload (head block) | yes |
| `animationSchemaVersion` | not in this document; runtime state | no |
| `customAssetSchemaVersion` | record `0x03` header version | partially |
| `rendererVersion`, `presentationTier`, `lod` | never on the wire | no |
| Pico Link / protocol version | outer transport, separate contract | no |

The appearance envelope version is deliberately independent of
`picoProtocolVersion` in `@pico/protocol`.

In Parametric Profile V1 only `generatorVersion` travels in the payload: the
generator id (`pico.appearance.head-generator`) is fixed by the profile
family, the head kind and the official generator registry. A future profile
version may introduce an explicit generator id field; V1 deliberately does
not.

## Text representation

```text
pad1_<base64url-without-padding>
```

- `pad1` stands for PICO Appearance Document Envelope V1. The prefix is
  exact: no padding characters, no alternative casing, no whitespace.
- Encode → decode → encode is byte-identical.
- Decoders bound the binary size from the text length **before** decoding:
  a text that would decode to more than the applicable byte limit (4096 for
  `pad1_`, 38 for `pa1_`) is refused as `size_limit_exceeded` without
  allocating a decode buffer.
- The isolated profile payload keeps its own `pa1_<base64url-without-padding>`
  form. `pa1_` carries only the 18/38-byte profile; `pad1_` carries the full
  document including the compatibility core. The two are not interchangeable.

## Envelope header (8 bytes)

| Byte | Content |
|---:|---|
| 0 | magic `0x50` (`P`) |
| 1 | magic `0x41` (`A`) |
| 2 | `appearanceEnvelopeVersion`, exactly `1` |
| 3 | envelope flags, exactly `0` in V1 |
| 4–5 | total length as `uint16` big endian, including this header |
| 6–7 | record count as `uint16` big endian |

## Record header (6 bytes)

| Byte (relative) | Content |
|---:|---|
| 0 | record type |
| 1 | record flags |
| 2–3 | record version as `uint16` big endian |
| 4–5 | payload length as `uint16` big endian |

Exactly `payload length` bytes follow.

Record flags:

```text
Bit 0: critical
Bits 1..7: reserved in envelope V1, exactly 0
```

An unknown record with `critical = 0` is skipped safely. An unknown record
with `critical = 1` rejects the whole document as unsupported
(`unsupported_critical_record`). Set reserved bits reject the document
(`invalid_record_flags`).

## Record types V1

| Type | Name | Cardinality | Critical |
|---:|---|---:|---:|
| `0x01` | Compatibility Core | exactly 1 | yes |
| `0x02` | Canonical Profile | exactly 1 | yes |
| `0x03` | Custom Asset Reference | 0..n | no |
| `0x7f` | Namespaced Extension | 0..n | per extension flag |

All other types are reserved. Known critical records with an unknown record
version are rejected (`unsupported_compatibility_core_version` for `0x01`,
`unsupported_critical_record` for `0x02`); a `0x03` record with an unknown
version is skipped like any unknown optional record, and a `0x03` record with
the critical bit set is invalid (`invalid_record_flags`).

## Canonical ordering

Encoders always emit:

1. Compatibility Core;
2. Canonical Profile;
3. Custom Asset References, sorted lexicographically over their encoded
   payload bytes (which start with the kind id and the SHA-256);
4. Extensions, sorted by namespace, then name, then version (plain ASCII and
   numeric order), with the payload bytes as final tie break.

Decoders accept records in any order and re-encode canonically. Duplicate
required records are rejected (`duplicate_required_record`).

## Size limits

Checked before any allocation derived from untrusted lengths:

- maximum total length in V1: `4096` bytes;
- maximum record count: `64`;
- maximum single extension opaque payload: `1024` bytes;
- no recursive record nesting;
- no file or network access while parsing;
- every length addition is bounds-checked against the already verified total.

## Compatibility Core record (`0x01`)

Fixed 24-byte payload. Integers only, `uint16` big endian, `int8` two's
complement. The record version (`1`) lives in the record header only.

| Byte | Content |
|---:|---|
| 0–1 | `shell.hue` (0..359) |
| 2 | `shell.chroma` (0..255) |
| 3 | `shell.lightness` (0..255) |
| 4–5 | `face.hue` (0..359) |
| 6 | `face.blackLevel` (0..255) |
| 7–8 | `trim.hue` (0..359) |
| 9 | `trim.chroma` (0..255) |
| 10 | head kind id |
| 11 | semantic head family id |
| 12–13 | `head.primaryHue` (0..359) |
| 14 | `head.length` (0..255) |
| 15 | `head.volume` (0..255) |
| 16 | `head.parting` as `int8` (−127..127; `0x80` is invalid) |
| 17 | clothing kind id |
| 18 | semantic clothing family id |
| 19–20 | `clothing.primaryHue` (0..359) |
| 21–22 | `clothing.secondaryHue` (0..359) |
| 23 | reserved, exactly `0` |

### Stable IDs

IDs are never reused and never reordered; removed IDs stay reserved.

Head kinds: `standard_antenna = 0`, `semantic_head_module = 1`.

Semantic head families:

| ID | Family |
|---:|---|
| 0 | `standard_antenna` |
| 1 | `short_cap` |
| 2 | `short_segmented` |
| 3 | `side_swept` |
| 4 | `top_structured` |
| 5 | `long_segmented` |
| 6 | `rear_ribbon` |
| 7 | `asymmetric` |
| 8 | `custom_fallback` |

Clothing kinds: `none = 0`, `standard = 1`, `custom_fallback = 2`.

Semantic clothing families:

| ID | Family |
|---:|---|
| 0 | `none` |
| 1 | `basic_shell` |
| 2 | `standard_jacket` |
| 3 | `workwear` |
| 4 | `formal` |
| 5 | `protective` |
| 6 | `ceremonial` |
| 7 | `custom_fallback` |

Consistency rules: head kind `standard_antenna` requires head family
`standard_antenna`; a `semantic_head_module` never carries the antenna
family; clothing kind `none` requires clothing family `none` and vice versa.
An unknown ID is never interpreted as a known family
(`value_out_of_range`). New concrete generators map into an existing family
wherever semantically possible; a new family is added only when none fits.
The family is a fallback description, never a full generator description.

### Core V1 is the permanent legacy fallback

Compatibility Core V1 is frozen and mandatory forever:

1. The Core V1 fields, IDs and family lists above are closed. New semantic
   families are **not** added to Core V1; a future module that fits no
   existing family projects to `custom_fallback`.
2. Record `0x01` keeps record version `1` permanently. Richer compatibility
   data arrives as an additional optional record type or a namespaced
   extension, never as a revision of this record.
3. Every future official appearance document, of any envelope or profile
   version, keeps carrying Core V1, so a first-generation client always
   renders a recognizable PICO.

Target model:

```text
Compatibility Core V1       permanently mandatory
Compatibility Detail V2+    optional additional records
Canonical Profile Vn        full current representation
```

Not admissible: a `Compatibility Core V2` replacing V1.

## Canonical Profile record (`0x02`)

| Field | Type |
|---|---|
| `profileFamilyId` | `uint16` big endian |
| `appearanceProfileVersion` | `uint16` big endian |
| `coreModelVersion` | `uint16` big endian |
| `payloadLength` | `uint16` big endian |
| `payload` | exactly `payloadLength` bytes |

A `payloadLength` that contradicts the record length is rejected
(`invalid_length`). `coreModelVersion = 0` means the document is not pinned
to a released authored character core (ADR 0124 has not released one).

For the parametric appearance profile:

```text
profileFamilyId = 1            // pico.parametric_appearance
appearanceProfileVersion = 1
payload = canonical 18/38-byte profile codec (pa1_ payload, unchanged)
```

The 18/38-byte profile payload keeps its originally published little-endian
`uint16` layout and all published byte positions; the surrounding envelope
does not reinterpret a single profile byte. Its field layout, value ranges
and validation rules are specified in
`../development/briefs/parametric-appearance-system.md` and frozen by the
governance vectors.

A decoder that understands the family and version decodes the profile fully.
A decoder that does not keeps the payload as opaque bytes, renders from the
compatibility core and must be able to re-encode the exact original payload
(forward compatibility without loss).

## Compatibility core consistency

When a document is created, the compatibility core is always computed from
the full document content — profile plus custom-asset references — via the
normative projection, never supplied by hand.

When a document is decoded and its content is locally understood, the
embedded core must equal the normative projection. On any difference the
document is rejected as inconsistent (`compatibility_core_mismatch`);
neither value is silently preferred and no profile byte is modified. When
the profile version is unknown, the core is used as-is — an old client
cannot recompute a projection it does not know.

Partial understanding of custom assets: a decoder that skipped custom-asset
records of an **unknown version** cannot recompute the clothing derivation.
It accepts the clothing block of the embedded core as-is (that block exists
for exactly this situation) while still enforcing every other consistency
rule. Such a partially understood document is not canonically
re-emittable — the strict validation used by encoders refuses a clothing
claim its visible content cannot support — so it is forwarded as its
original bytes, never re-encoded.

## Projection V1: Profile V1 + custom assets → Compatibility Core V1

Deterministic, integer-only, no renderer/device/locale/time dependency.
These rules and constants are normative for projection version 1 and are
frozen by `docs/design-system/07_Governance/parametric-appearance-v1-vectors.json`.

- `shell = { hue, chroma, lightness }` from the profile shell (drop `gloss`);
- `face = { hue, blackLevel }` (drop `tint`, `reflectivity`);
- `trim = { hue, chroma }` (drop `metalness`);
- clothing derives from the custom-asset references, because Profile V1
  itself defines no clothing:
  - no `custom_clothing` reference →
    `{ kind: none, family: none, primaryHue: 0, secondaryHue: 0 }`;
  - exactly one `custom_clothing` reference →
    `{ kind: custom_fallback, family: fallback.clothingFamily, primaryHue: fallback.primaryHue, secondaryHue: fallback.secondaryHue }`,
    so an older client renders the intended clothing fallback instead of a
    naked PICO;
  - more than one `custom_clothing` reference is invalid in V1
    (`invalid_custom_asset_reference`), which also refuses duplicates;
- standard antenna: `{ kind: standard_antenna, family: standard_antenna, primaryHue: 0, length: 0, volume: 0, parting: 0 }`;
- procedural head module:
  - `primaryHue = material.hue`;
  - `length = geometry.length`;
  - `volume = floor((geometry.width + geometry.rootSpread) / 2)`;
  - `parting = geometry.partDepth == 0 ? 0 : geometry.partOffset`;
  - the family is derived by the first matching rule:

| # | Rule (first match wins) | Family |
|---:|---|---|
| 1 | `abs(side) >= 56` | `asymmetric` |
| 2 | `length >= 176` and `sweep >= 64` | `rear_ribbon` |
| 3 | `length >= 176` | `long_segmented` |
| 4 | `abs(side) >= 24` | `side_swept` |
| 5 | `lift >= 144` | `top_structured` |
| 6 | `length >= 96` | `short_segmented` |
| 7 | `segments >= 6` | `short_segmented` |
| 8 | otherwise | `short_cap` |

`custom_fallback` is deliberately unreachable in projection V1; it exists for
forks and future custom modules. Status, context, pose and presentation
quality are never projected.

## Custom Asset Reference record (`0x03`)

Fixed 39-byte payload, `customAssetSchemaVersion = 1` in the record header:

| Byte | Content |
|---:|---|
| 0 | asset kind id (`custom_clothing = 0`) |
| 1 | media type id (`image/png = 0`, `image/webp = 1`) |
| 2–33 | SHA-256 of the asset, exactly 32 bytes |
| 34 | fallback semantic clothing family id |
| 35–36 | fallback `primaryHue` (0..359, big endian) |
| 37–38 | fallback `secondaryHue` (0..359, big endian) |

Rules:

- no URL field and no embedded image bytes in the canonical identity record;
- the asset is addressed by SHA-256 only;
- V1 allows at most one `custom_clothing` reference per document; a second
  one — including a duplicate — is refused
  (`invalid_custom_asset_reference`), because the clothing derivation of the
  compatibility core must stay unambiguous;
- the reference's fallback drives the clothing block of the compatibility
  core (see the projection section), so the fallback is not merely present
  but actually reaches old clients;
- the fallback family must be a renderable standard family — `none` and
  `custom_fallback` are refused (`invalid_custom_asset_reference`), so a
  missing, refused or invalid asset never yields an invisible or broken PICO;
- a device may refuse the download for resource, privacy or policy reasons
  and renders the fallback;
- an invalid asset never overwrites the profile;
- a custom asset never replaces the character core, visor, status light
  group or rig, and never carries authority, policy or trust meaning.

Download, transfer and storage of asset bytes are outside this
specification.

## Namespaced Extension record (`0x7f`)

Payload layout (structural, owned by envelope V1):

| Field | Type |
|---|---|
| namespace length | `uint8` |
| namespace | ASCII, pattern `[a-z0-9][a-z0-9.-]{0,62}` |
| name length | `uint8` |
| name | ASCII, same pattern |
| opaque payload | remaining bytes, at most 1024 |

The record header version is the extension version; the critical record flag
is the extension's critical flag.

Rules:

- official namespaces start with `pico.`; forks use their own controlled
  domain or unique project namespace (for example `example.fork.`);
- extensions never reinterpret core fields and never replace the mandatory
  compatibility core;
- unknown optional extensions are ignorable and survive a decode/encode
  roundtrip byte-identically;
- a critical extension must be understood before a full rendering may be
  claimed; decoding alone does not execute anything;
- extension payloads are canonically opaque bytes whose own semantics need
  their own version.

The transport decoder cannot know what an application understands, so the
critical-extension contract is enforced by a separate renderability check:
`assertAppearanceDocumentRenderableV1(document, { supportedExtensions })`
in `@pico/appearance` accepts unknown optional extensions, refuses unknown
critical extensions and refuses known critical extensions in unsupported
versions (`unsupported_critical_record`). Rendering the compatibility core
alone stays allowed either way, because a critical extension must never
bypass the mandatory core.

## Error classes

Stable typed error codes (`PicoAppearanceError.code` in `@pico/appearance`):

```text
invalid_type            invalid_shape             invalid_integer
value_out_of_range      unsupported_profile_version
unsupported_envelope_version                      unsupported_compatibility_core_version
unsupported_critical_record                       invalid_magic
invalid_length          size_limit_exceeded       duplicate_required_record
missing_required_record invalid_record_flags      invalid_record_ordering
invalid_namespace       invalid_custom_asset_reference
compatibility_core_mismatch                       unknown_flags
head_length_mismatch    invalid_text_format
```

Error messages stay structural (offsets, expected values, field names) and
never carry foreign payload bytes or custom asset content.

## Capability names

Defined in `@pico/protocol` (`picoAppearanceCapabilities`); none of them is
advertised by the current runtime:

```text
pico.appearance.document.v1
pico.appearance.compatibility-core.v1
pico.appearance.profile.parametric.v1
pico.appearance.head-generator.v2
pico.appearance.custom-asset-reference.v1
```

Fork extension capabilities live in the fork's own namespace, for example
`example.fork.crystal-head-module.v1`. Capability negotiation is an
optimization, never a requirement: a stored or forwarded document must stay
meaningfully readable without a prior handshake.

## Claim rules

A claim names concrete surfaces and versions
(`PicoAppearanceCompatibilityClaimV1` in `@pico/protocol`): envelope
versions, compatibility core versions, exact `(familyId, version)` profile
pairs and exact `(generatorId, version)` pairs. Blanket claims ("fully
PICO-compatible appearance") are invalid without that precision plus the
conformance basis required by
[`compatibility-levels.md`](compatibility-levels.md). The general L0–L5
levels grade the trust of a claim; appearance adds a surface qualifier, not
a new level scale. Appearance, compatibility level or visual similarity is
never an identity, trust, policy or authorization statement.

## Versioning rules

A new version of the affected axis is required when any of the following
changes for an already valid input: binary bytes, field meaning, value
range, default, rounding rule, colour mapping, generated geometry, material
zone mapping, mount point, visible generator output, canonical vertex/index
order, compatibility core projection or fallback semantics.

Within the same version the following stay allowed: additional tests,
documentation clarifications without meaning change, refactorings with
identical canonical output, better error texts within the same error class,
faster implementations with unchanged output, and earlier rejection of data
that was already invalid.

Official runtimes are cumulative: a newer official runtime renders every
earlier published official profile with that profile's own generator and
core semantics, proven by the pinned historical vectors — never by a lossy
chain migration and never by approximating an old profile with a newer
generator. Explicit user migrations must preserve the original profile,
record source/target versions and the migration algorithm version, and never
happen silently through a software update. The V1/V2 vectors pinned by this
milestone are the first permanent historical basis; fixtures of released
versions are never deleted or edited.

## Cache keys

Rendered artifacts are fully derived state and may be deleted at any time.
Two key shapes exist in `@pico/appearance`, both without status, context or
presentation-quality identity:

```text
pico-appearance:pa1:<base64url(profile bytes)>:<rendererVersion>:<lod>
pico-appearance:pad1:<base64url(canonical document bytes)>:<rendererVersion>:<lod>
```

The `pa1` key covers the profile alone: documents sharing a profile but
differing in custom assets, extensions or the core model pin share it. Any
artifact derived from the full document uses the `pad1` key, which covers
the complete canonical bytes. `rendererVersion` is restricted to
`[a-z0-9.-]+` so the colon-separated segments stay unambiguous.

## Golden vectors and fixtures

- `docs/design-system/07_Governance/parametric-appearance-v1-vectors.json` —
  profile codec, `pa1_` text form, projection vectors per semantic family and
  invalid-profile vectors, pinned by SHA-256 in
  `docs/design-system/07_Governance/official-appearance-generators.json`.
- `docs/protocol/fixtures/appearance-document/v1/suite.json` — canonical
  envelope vectors, unknown-record handling, size limits, custom asset
  fallback enforcement and compatibility-core consistency negatives.

## Examples

Minimal canonical document (standard antenna, neutral surface, no assets, no
extensions), 70 bytes:

```text
5041010000460002                                  envelope header
010100010018                                      compatibility core record header
00d212e000dc3400d7240000000000000000000000000000  24-byte core payload
02010001001a                                      canonical profile record header
0001000100000012                                  family 1, version 1, core model 0, 18 bytes
01000100d20012e0d6dc00143480d70024c6              18-byte antenna profile payload
```

Text form:

```text
pad1_UEEBAABGAAIBAQABABgA0hLgANw0ANckAAAAAAAAAAAAAAAAAAACAQABABoAAQABAAAAEgEAAQDSABLg1twAFDSA1wAkxg
```
