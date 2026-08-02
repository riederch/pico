import type { PicoAppearanceProfileV1 } from './appearance-profile-v1.js';
import { validateAppearanceProfileV1 } from './appearance-profile-v1-validation.js';
import {
  validateCompatibilityCoreV1,
  type PicoAppearanceCompatibilityCoreV1,
  type PicoSemanticHeadFamilyV1,
} from './compatibility-core-v1.js';
import {
  deriveCompatibilityClothingV1,
  validateCustomAssetReferenceV1,
  type PicoCustomAppearanceAssetReferenceV1,
} from './custom-asset-reference-v1.js';

/**
 * Normative thresholds of the Profile V1 -> Compatibility Core V1 projection.
 *
 * These constants are part of the published projection version 1 and are
 * frozen by the governance golden vectors and the protocol specification
 * (`docs/protocol/appearance-document-v1.md`). Changing any of them, the rule
 * order, or the derived value arithmetic changes the projection for an
 * existing valid profile and therefore requires a new projection version.
 */
export const compatibilityProjectionV1Thresholds = Object.freeze({
  asymmetricMinimumAbsoluteSide: 56,
  longMinimumLength: 176,
  rearRibbonMinimumSweep: 64,
  sideSweptMinimumAbsoluteSide: 24,
  topStructuredMinimumLift: 144,
  midMinimumLength: 96,
  shortSegmentedMinimumSegments: 6,
});

/**
 * Deterministic, integer-only projection of the document content — the full
 * profile plus its custom-asset references — onto the stable compatibility
 * core (ADR 0125). No renderer, device, locale, time or random dependency:
 * the same content always yields the same core, and a document's embedded
 * core must equal this projection whenever its content is locally
 * understood.
 *
 * Version 1 rules:
 * - shell/face/trim copy their stable colour components and drop the purely
 *   material ones (gloss, tint, reflectivity, metalness);
 * - the standard antenna projects to the antenna family with zeroed module
 *   values;
 * - a procedural head module derives its semantic family from fixed integer
 *   thresholds (first matching rule wins, see `deriveSemanticHeadFamilyV1`),
 *   `volume` is the integer mean of `width` and `rootSpread`, and `parting`
 *   is `partOffset` when a part seam exists (`partDepth > 0`), otherwise 0;
 * - clothing derives from the custom-asset references, because Profile V1
 *   itself defines no clothing: no `custom_clothing` reference projects to
 *   `none`, exactly one projects to `custom_fallback` with that reference's
 *   fallback family and hues, and more than one is invalid in V1 — this is
 *   what keeps an old client from showing a naked PICO although a clothing
 *   fallback exists;
 * - status, context and presentation values are never projected.
 */
export function projectAppearanceProfileV1ToCompatibilityCoreV1(
  profile: PicoAppearanceProfileV1,
  customAssets: readonly PicoCustomAppearanceAssetReferenceV1[] = [],
): PicoAppearanceCompatibilityCoreV1 {
  const validated = validateAppearanceProfileV1(profile);
  const validatedAssets = customAssets.map((reference) => validateCustomAssetReferenceV1(reference));
  const { shell, face, trim } = validated.surface;
  const head = validated.headIdentity.kind === 'standard_antenna'
    ? {
        kind: 'standard_antenna' as const,
        family: 'standard_antenna' as const,
        primaryHue: 0,
        length: 0,
        volume: 0,
        parting: 0,
      }
    : projectHeadModule(validated.headIdentity.recipe.geometry, validated.headIdentity.recipe.material);
  return validateCompatibilityCoreV1({
    compatibilityCoreVersion: 1,
    shell: { hue: shell.hue, chroma: shell.chroma, lightness: shell.lightness },
    face: { hue: face.hue, blackLevel: face.blackLevel },
    trim: { hue: trim.hue, chroma: trim.chroma },
    head,
    clothing: deriveCompatibilityClothingV1(validatedAssets),
  });
}

function projectHeadModule(
  geometry: Readonly<{
    side: number;
    length: number;
    lift: number;
    sweep: number;
    segments: number;
    width: number;
    rootSpread: number;
    partOffset: number;
    partDepth: number;
  }>,
  material: Readonly<{ hue: number }>,
): {
  kind: 'semantic_head_module';
  family: PicoSemanticHeadFamilyV1;
  primaryHue: number;
  length: number;
  volume: number;
  parting: number;
} {
  return {
    kind: 'semantic_head_module',
    family: deriveSemanticHeadFamilyV1(geometry),
    primaryHue: material.hue,
    length: geometry.length,
    volume: Math.floor((geometry.width + geometry.rootSpread) / 2),
    parting: geometry.partDepth === 0 ? 0 : geometry.partOffset,
  };
}

/**
 * Fixed family derivation for procedural head modules. The first matching
 * rule wins; the rules are total, so every valid recipe maps to exactly one
 * family. `custom_fallback` is deliberately unreachable in projection
 * version 1: it exists for forks and later custom modules, not for the
 * official generator space.
 */
export function deriveSemanticHeadFamilyV1(
  geometry: Readonly<{
    side: number;
    length: number;
    lift: number;
    sweep: number;
    segments: number;
  }>,
): PicoSemanticHeadFamilyV1 {
  const thresholds = compatibilityProjectionV1Thresholds;
  const absoluteSide = Math.abs(geometry.side);
  if (absoluteSide >= thresholds.asymmetricMinimumAbsoluteSide) {
    return 'asymmetric';
  }
  if (geometry.length >= thresholds.longMinimumLength) {
    return geometry.sweep >= thresholds.rearRibbonMinimumSweep ? 'rear_ribbon' : 'long_segmented';
  }
  if (absoluteSide >= thresholds.sideSweptMinimumAbsoluteSide) {
    return 'side_swept';
  }
  if (geometry.lift >= thresholds.topStructuredMinimumLift) {
    return 'top_structured';
  }
  if (geometry.length >= thresholds.midMinimumLength) {
    return 'short_segmented';
  }
  if (geometry.segments >= thresholds.shortSegmentedMinimumSegments) {
    return 'short_segmented';
  }
  return 'short_cap';
}
