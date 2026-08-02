import { PicoAppearanceError } from './appearance-errors.js';
import {
  picoSemanticClothingFamiliesV1,
  picoSemanticClothingFamilyIdsV1,
  type PicoCompatibilityCoreClothingKindV1,
  type PicoSemanticClothingFamilyV1,
} from './compatibility-core-v1.js';
import {
  compareBytes,
  requireInteger,
  requirePlainObject,
  requireString,
  requireUint8Array,
} from './validation-primitives.js';

/**
 * Reference to an optional non-parametric custom asset (ADR 0125). The
 * canonical identity record carries no URL and no embedded image data: the
 * asset is addressed by SHA-256 only, and every reference carries a
 * parametric fallback so a missing, refused or invalid asset never yields an
 * invisible or broken PICO. Download and storage are outside this milestone.
 */
export interface PicoCustomAppearanceAssetReferenceV1 {
  readonly customAssetSchemaVersion: 1;
  readonly kind: 'custom_clothing';
  readonly sha256: Uint8Array;
  readonly mediaType: 'image/png' | 'image/webp';
  readonly fallback: Readonly<{
    readonly clothingFamily: PicoSemanticClothingFamilyV1;
    readonly primaryHue: number;
    readonly secondaryHue: number;
  }>;
}

export const customAssetKindsV1 = ['custom_clothing'] as const;

/** Wire IDs for custom asset kinds. Never reused. */
export const customAssetKindIdsV1: Readonly<Record<'custom_clothing', number>> = Object.freeze({
  custom_clothing: 0,
});

export const customAssetMediaTypesV1 = ['image/png', 'image/webp'] as const;

/** Wire IDs for custom asset media types. Never reused. */
export const customAssetMediaTypeIdsV1: Readonly<Record<'image/png' | 'image/webp', number>> = Object.freeze({
  'image/png': 0,
  'image/webp': 1,
});

/** Fixed payload length of a custom asset reference record. */
export const customAssetReferenceV1PayloadByteLength = 39;

/**
 * Clothing families a custom asset may fall back to. `none` would make the
 * fallback invisible clothing-wise and `custom_fallback` would be circular,
 * so both are refused.
 */
export const customAssetFallbackClothingFamiliesV1 = picoSemanticClothingFamiliesV1.filter(
  (family): family is Exclude<PicoSemanticClothingFamilyV1, 'none' | 'custom_fallback'> =>
    family !== 'none' && family !== 'custom_fallback',
);

export function validateCustomAssetReferenceV1(input: unknown): PicoCustomAppearanceAssetReferenceV1 {
  const record = requirePlainObject(input, 'customAsset', [
    'customAssetSchemaVersion', 'kind', 'sha256', 'mediaType', 'fallback',
  ]);
  if (typeof record.customAssetSchemaVersion !== 'number' || !Number.isInteger(record.customAssetSchemaVersion)) {
    throw new PicoAppearanceError('invalid_integer', 'customAsset.customAssetSchemaVersion must be an integer');
  }
  if (record.customAssetSchemaVersion !== 1) {
    throw new PicoAppearanceError('invalid_custom_asset_reference', 'customAsset.customAssetSchemaVersion must be exactly 1');
  }
  const kind = requireString(record.kind, 'customAsset.kind', customAssetKindsV1);
  const sha256 = requireUint8Array(record.sha256, 'customAsset.sha256');
  if (sha256.length !== 32) {
    throw new PicoAppearanceError('invalid_custom_asset_reference', `customAsset.sha256 must be exactly 32 bytes, got ${sha256.length}`);
  }
  const mediaType = requireString(record.mediaType, 'customAsset.mediaType', customAssetMediaTypesV1);
  const fallback = requirePlainObject(record.fallback, 'customAsset.fallback', [
    'clothingFamily', 'primaryHue', 'secondaryHue',
  ]);
  const clothingFamily = requireString(fallback.clothingFamily, 'fallback.clothingFamily', picoSemanticClothingFamiliesV1);
  if (clothingFamily === 'none' || clothingFamily === 'custom_fallback') {
    throw new PicoAppearanceError(
      'invalid_custom_asset_reference',
      `fallback.clothingFamily must be a renderable standard family, got ${clothingFamily}`,
    );
  }
  return Object.freeze({
    customAssetSchemaVersion: 1,
    kind,
    sha256: Uint8Array.from(sha256),
    mediaType,
    fallback: Object.freeze({
      clothingFamily,
      primaryHue: requireInteger(fallback.primaryHue, 'fallback.primaryHue', 0, 359),
      secondaryHue: requireInteger(fallback.secondaryHue, 'fallback.secondaryHue', 0, 359),
    }),
  });
}

/**
 * Fixed 39-byte payload: kind id, media type id, 32 SHA-256 bytes, fallback
 * clothing family id and both fallback hues as `uint16` big endian.
 */
export function encodeCustomAssetReferenceV1(reference: PicoCustomAppearanceAssetReferenceV1): Uint8Array {
  const validated = validateCustomAssetReferenceV1(reference);
  const bytes = new Uint8Array(customAssetReferenceV1PayloadByteLength);
  bytes[0] = customAssetKindIdsV1[validated.kind];
  bytes[1] = customAssetMediaTypeIdsV1[validated.mediaType];
  bytes.set(validated.sha256, 2);
  bytes[34] = picoSemanticClothingFamilyIdsV1[validated.fallback.clothingFamily];
  bytes[35] = validated.fallback.primaryHue >> 8;
  bytes[36] = validated.fallback.primaryHue & 0xff;
  bytes[37] = validated.fallback.secondaryHue >> 8;
  bytes[38] = validated.fallback.secondaryHue & 0xff;
  return bytes;
}

export function decodeCustomAssetReferenceV1(bytes: Uint8Array): PicoCustomAppearanceAssetReferenceV1 {
  if (bytes.length !== customAssetReferenceV1PayloadByteLength) {
    throw new PicoAppearanceError('invalid_custom_asset_reference', `custom asset payload must be 39 bytes, got ${bytes.length}`);
  }
  const kind = customAssetKindsV1.find((name) => customAssetKindIdsV1[name] === bytes[0]);
  if (kind === undefined) {
    throw new PicoAppearanceError('invalid_custom_asset_reference', `unknown custom asset kind id ${bytes[0]}`);
  }
  const mediaType = customAssetMediaTypesV1.find((name) => customAssetMediaTypeIdsV1[name] === bytes[1]);
  if (mediaType === undefined) {
    throw new PicoAppearanceError('invalid_custom_asset_reference', `unknown custom asset media type id ${bytes[1]}`);
  }
  const familyEntry = picoSemanticClothingFamiliesV1.find(
    (name) => picoSemanticClothingFamilyIdsV1[name] === bytes[34],
  );
  if (familyEntry === undefined) {
    throw new PicoAppearanceError('invalid_custom_asset_reference', `unknown fallback clothing family id ${bytes[34]}`);
  }
  return validateCustomAssetReferenceV1({
    customAssetSchemaVersion: 1,
    kind,
    sha256: bytes.slice(2, 34),
    mediaType,
    fallback: {
      clothingFamily: familyEntry,
      primaryHue: (bytes[35] << 8) | bytes[36],
      secondaryHue: (bytes[37] << 8) | bytes[38],
    },
  });
}

/**
 * Normative clothing derivation for the compatibility core (ADR 0125): no
 * custom clothing reference projects to `none`; exactly one projects to
 * `custom_fallback` with that reference's fallback family and hues, so an
 * older client renders the intended clothing fallback instead of a naked
 * PICO. V1 allows at most one `custom_clothing` reference — a second one
 * would make the derivation ambiguous and is refused, which also refuses
 * duplicates.
 */
export function deriveCompatibilityClothingV1(
  customAssets: readonly PicoCustomAppearanceAssetReferenceV1[],
): Readonly<{
  kind: PicoCompatibilityCoreClothingKindV1;
  family: PicoSemanticClothingFamilyV1;
  primaryHue: number;
  secondaryHue: number;
}> {
  const clothingReferences = customAssets.filter((reference) => reference.kind === 'custom_clothing');
  if (clothingReferences.length > 1) {
    throw new PicoAppearanceError(
      'invalid_custom_asset_reference',
      `V1 allows at most one custom_clothing reference, got ${clothingReferences.length}`,
    );
  }
  if (clothingReferences.length === 0) {
    return { kind: 'none', family: 'none', primaryHue: 0, secondaryHue: 0 };
  }
  const { fallback } = clothingReferences[0];
  return {
    kind: 'custom_fallback',
    family: fallback.clothingFamily,
    primaryHue: fallback.primaryHue,
    secondaryHue: fallback.secondaryHue,
  };
}

/**
 * Canonical ordering of custom asset references: lexicographic over the
 * encoded payload bytes, which starts with the kind id and the SHA-256.
 */
export function compareCustomAssetReferencesV1(
  left: PicoCustomAppearanceAssetReferenceV1,
  right: PicoCustomAppearanceAssetReferenceV1,
): number {
  return compareBytes(encodeCustomAssetReferenceV1(left), encodeCustomAssetReferenceV1(right));
}
