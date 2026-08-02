import { PicoAppearanceError } from './appearance-errors.js';
import { requireInteger, requirePlainObject, requireString } from './validation-primitives.js';

/**
 * Compatibility Core V1 (ADR 0125). Not a second full appearance: a small,
 * permanently stable semantic projection that an older runtime can render
 * without knowing newer profile versions or generators. IDs and value
 * meanings published here are immutable; removed IDs stay reserved and are
 * never reused.
 *
 * Core V1 is the permanent, mandatory legacy fallback of the appearance
 * document: the family lists below are closed forever, new generators map
 * into an existing family or `custom_fallback`, and richer compatibility
 * data arrives as additional optional records or extensions — never as a
 * replacement of this record. Every future official appearance document
 * keeps carrying Core V1, so a first-generation client can always render a
 * recognizable PICO.
 */
export const picoSemanticHeadFamiliesV1 = [
  'standard_antenna',
  'short_cap',
  'short_segmented',
  'side_swept',
  'top_structured',
  'long_segmented',
  'rear_ribbon',
  'asymmetric',
  'custom_fallback',
] as const;

export type PicoSemanticHeadFamilyV1 = typeof picoSemanticHeadFamiliesV1[number];

/** Wire IDs for the semantic head families. Never reused, never reordered. */
export const picoSemanticHeadFamilyIdsV1: Readonly<Record<PicoSemanticHeadFamilyV1, number>> = Object.freeze({
  standard_antenna: 0,
  short_cap: 1,
  short_segmented: 2,
  side_swept: 3,
  top_structured: 4,
  long_segmented: 5,
  rear_ribbon: 6,
  asymmetric: 7,
  custom_fallback: 8,
});

export const picoSemanticClothingFamiliesV1 = [
  'none',
  'basic_shell',
  'standard_jacket',
  'workwear',
  'formal',
  'protective',
  'ceremonial',
  'custom_fallback',
] as const;

export type PicoSemanticClothingFamilyV1 = typeof picoSemanticClothingFamiliesV1[number];

/** Wire IDs for the semantic clothing families. Never reused, never reordered. */
export const picoSemanticClothingFamilyIdsV1: Readonly<Record<PicoSemanticClothingFamilyV1, number>> = Object.freeze({
  none: 0,
  basic_shell: 1,
  standard_jacket: 2,
  workwear: 3,
  formal: 4,
  protective: 5,
  ceremonial: 6,
  custom_fallback: 7,
});

export const picoCompatibilityCoreHeadKindsV1 = ['standard_antenna', 'semantic_head_module'] as const;
export type PicoCompatibilityCoreHeadKindV1 = typeof picoCompatibilityCoreHeadKindsV1[number];

/** Wire IDs for the head kind byte. */
export const picoCompatibilityCoreHeadKindIdsV1: Readonly<Record<PicoCompatibilityCoreHeadKindV1, number>> = Object.freeze({
  standard_antenna: 0,
  semantic_head_module: 1,
});

export const picoCompatibilityCoreClothingKindsV1 = ['none', 'standard', 'custom_fallback'] as const;
export type PicoCompatibilityCoreClothingKindV1 = typeof picoCompatibilityCoreClothingKindsV1[number];

/** Wire IDs for the clothing kind byte. */
export const picoCompatibilityCoreClothingKindIdsV1: Readonly<Record<PicoCompatibilityCoreClothingKindV1, number>> = Object.freeze({
  none: 0,
  standard: 1,
  custom_fallback: 2,
});

export interface PicoAppearanceCompatibilityCoreV1 {
  readonly compatibilityCoreVersion: 1;

  readonly shell: Readonly<{
    readonly hue: number;
    readonly chroma: number;
    readonly lightness: number;
  }>;

  readonly face: Readonly<{
    readonly hue: number;
    readonly blackLevel: number;
  }>;

  readonly trim: Readonly<{
    readonly hue: number;
    readonly chroma: number;
  }>;

  readonly head: Readonly<{
    readonly kind: PicoCompatibilityCoreHeadKindV1;
    readonly family: PicoSemanticHeadFamilyV1;
    readonly primaryHue: number;
    readonly length: number;
    readonly volume: number;
    readonly parting: number;
  }>;

  readonly clothing: Readonly<{
    readonly kind: PicoCompatibilityCoreClothingKindV1;
    readonly family: PicoSemanticClothingFamilyV1;
    readonly primaryHue: number;
    readonly secondaryHue: number;
  }>;
}

/**
 * Strict validation of a compatibility core value. Beyond field ranges it
 * enforces the published kind/family consistency rules: the antenna kind
 * carries the antenna family and nothing else, a semantic head module never
 * carries the antenna family, and the clothing kind `none` carries the
 * clothing family `none`.
 */
export function validateCompatibilityCoreV1(input: unknown): PicoAppearanceCompatibilityCoreV1 {
  const root = requirePlainObject(input, 'compatibilityCore', [
    'compatibilityCoreVersion', 'shell', 'face', 'trim', 'head', 'clothing',
  ]);
  if (typeof root.compatibilityCoreVersion !== 'number' || !Number.isInteger(root.compatibilityCoreVersion)) {
    throw new PicoAppearanceError('invalid_integer', 'compatibilityCore.compatibilityCoreVersion must be an integer');
  }
  if (root.compatibilityCoreVersion !== 1) {
    throw new PicoAppearanceError(
      'unsupported_compatibility_core_version',
      'compatibilityCore.compatibilityCoreVersion must be exactly 1',
    );
  }
  const shell = requirePlainObject(root.shell, 'compatibilityCore.shell', ['hue', 'chroma', 'lightness']);
  const face = requirePlainObject(root.face, 'compatibilityCore.face', ['hue', 'blackLevel']);
  const trim = requirePlainObject(root.trim, 'compatibilityCore.trim', ['hue', 'chroma']);
  const head = requirePlainObject(root.head, 'compatibilityCore.head', [
    'kind', 'family', 'primaryHue', 'length', 'volume', 'parting',
  ]);
  const clothing = requirePlainObject(root.clothing, 'compatibilityCore.clothing', [
    'kind', 'family', 'primaryHue', 'secondaryHue',
  ]);
  const headKind = requireString(head.kind, 'head.kind', picoCompatibilityCoreHeadKindsV1);
  const headFamily = requireString(head.family, 'head.family', picoSemanticHeadFamiliesV1);
  if (headKind === 'standard_antenna' && headFamily !== 'standard_antenna') {
    throw new PicoAppearanceError('invalid_shape', 'head.kind standard_antenna requires head.family standard_antenna');
  }
  if (headKind === 'semantic_head_module' && headFamily === 'standard_antenna') {
    throw new PicoAppearanceError('invalid_shape', 'head.kind semantic_head_module cannot carry head.family standard_antenna');
  }
  const clothingKind = requireString(clothing.kind, 'clothing.kind', picoCompatibilityCoreClothingKindsV1);
  const clothingFamily = requireString(clothing.family, 'clothing.family', picoSemanticClothingFamiliesV1);
  if (clothingKind === 'none' && clothingFamily !== 'none') {
    throw new PicoAppearanceError('invalid_shape', 'clothing.kind none requires clothing.family none');
  }
  if (clothingKind !== 'none' && clothingFamily === 'none') {
    throw new PicoAppearanceError('invalid_shape', `clothing.kind ${clothingKind} cannot carry clothing.family none`);
  }
  const core: PicoAppearanceCompatibilityCoreV1 = {
    compatibilityCoreVersion: 1,
    shell: Object.freeze({
      hue: requireInteger(shell.hue, 'shell.hue', 0, 359),
      chroma: requireInteger(shell.chroma, 'shell.chroma', 0, 255),
      lightness: requireInteger(shell.lightness, 'shell.lightness', 0, 255),
    }),
    face: Object.freeze({
      hue: requireInteger(face.hue, 'face.hue', 0, 359),
      blackLevel: requireInteger(face.blackLevel, 'face.blackLevel', 0, 255),
    }),
    trim: Object.freeze({
      hue: requireInteger(trim.hue, 'trim.hue', 0, 359),
      chroma: requireInteger(trim.chroma, 'trim.chroma', 0, 255),
    }),
    head: Object.freeze({
      kind: headKind,
      family: headFamily,
      primaryHue: requireInteger(head.primaryHue, 'head.primaryHue', 0, 359),
      length: requireInteger(head.length, 'head.length', 0, 255),
      volume: requireInteger(head.volume, 'head.volume', 0, 255),
      parting: requireInteger(head.parting, 'head.parting', -127, 127),
    }),
    clothing: Object.freeze({
      kind: clothingKind,
      family: clothingFamily,
      primaryHue: requireInteger(clothing.primaryHue, 'clothing.primaryHue', 0, 359),
      secondaryHue: requireInteger(clothing.secondaryHue, 'clothing.secondaryHue', 0, 359),
    }),
  };
  return Object.freeze(core);
}
