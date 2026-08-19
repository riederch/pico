import { PicoAppearanceError } from './appearance-errors.js';
import {
  appearanceProfileV1FieldRanges,
  type PicoAppearanceFieldRange,
} from './appearance-profile-v1.js';
import type {
  PicoAppearanceProfileV1,
  PicoHeadIdentityV1,
  PicoSurfaceAppearanceV1,
  ProceduralHeadRecipeV2,
} from './appearance-profile-v1.js';
import { requireInteger, requirePlainObject } from './validation-primitives.js';

/**
 * Strict validation of an external profile (PAS brief section 13): closed
 * shapes, plain prototypes, integers only, exact versions, exact union, no
 * silent clamps. The returned profile is a frozen deep copy, so later
 * mutation of the input cannot change an already validated value.
 */
const ranges = appearanceProfileV1FieldRanges;

/** Range checks read the published table, so the two cannot drift apart. */
function requireIntegerInRange(value: unknown, label: string, range: PicoAppearanceFieldRange): number {
  return requireInteger(value, label, range.minimum, range.maximum);
}

export function validateAppearanceProfileV1(input: unknown): PicoAppearanceProfileV1 {
  const root = requirePlainObject(input, 'profile', ['profileVersion', 'headIdentity', 'surface']);
  if (typeof root.profileVersion !== 'number' || !Number.isInteger(root.profileVersion)) {
    throw new PicoAppearanceError('invalid_integer', 'profile.profileVersion must be an integer');
  }
  if (root.profileVersion !== 1) {
    throw new PicoAppearanceError('unsupported_profile_version', 'profile.profileVersion must be exactly 1');
  }
  const headIdentity = validateHeadIdentity(root.headIdentity);
  const surface = validateSurface(root.surface);
  return freezeProfile({ profileVersion: 1, headIdentity, surface });
}

function validateHeadIdentity(input: unknown): PicoHeadIdentityV1 {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new PicoAppearanceError('invalid_type', 'profile.headIdentity must be an object');
  }
  const kind = (input as Record<string, unknown>).kind;
  if (kind === 'standard_antenna') {
    requirePlainObject(input, 'profile.headIdentity', ['kind']);
    return { kind: 'standard_antenna' };
  }
  if (kind === 'procedural_neon_hair') {
    const record = requirePlainObject(input, 'profile.headIdentity', ['kind', 'recipe']);
    return { kind: 'procedural_neon_hair', recipe: validateRecipe(record.recipe) };
  }
  throw new PicoAppearanceError('invalid_shape', 'profile.headIdentity.kind must be standard_antenna or procedural_neon_hair');
}

function validateRecipe(input: unknown): ProceduralHeadRecipeV2 {
  const record = requirePlainObject(input, 'headIdentity.recipe', ['generatorVersion', 'geometry', 'material']);
  if (typeof record.generatorVersion !== 'number' || !Number.isInteger(record.generatorVersion)) {
    throw new PicoAppearanceError('invalid_integer', 'recipe.generatorVersion must be an integer');
  }
  if (record.generatorVersion !== 2) {
    throw new PicoAppearanceError('unsupported_profile_version', 'recipe.generatorVersion must be exactly 2');
  }
  const geometry = requirePlainObject(record.geometry, 'recipe.geometry', [
    'anchor', 'side', 'length', 'lift', 'sweep', 'curl', 'width', 'taper', 'twist', 'segments',
    'partOffset', 'partDepth', 'crownBias', 'rootSpread',
  ]);
  const material = requirePlainObject(record.material, 'recipe.material', ['hue', 'chroma', 'translucency']);
  return {
    generatorVersion: 2,
    geometry: {
      anchor: requireIntegerInRange(geometry.anchor, 'geometry.anchor', ranges.recipeGeometry.anchor),
      side: requireIntegerInRange(geometry.side, 'geometry.side', ranges.recipeGeometry.side),
      length: requireIntegerInRange(geometry.length, 'geometry.length', ranges.recipeGeometry.length),
      lift: requireIntegerInRange(geometry.lift, 'geometry.lift', ranges.recipeGeometry.lift),
      sweep: requireIntegerInRange(geometry.sweep, 'geometry.sweep', ranges.recipeGeometry.sweep),
      curl: requireIntegerInRange(geometry.curl, 'geometry.curl', ranges.recipeGeometry.curl),
      width: requireIntegerInRange(geometry.width, 'geometry.width', ranges.recipeGeometry.width),
      taper: requireIntegerInRange(geometry.taper, 'geometry.taper', ranges.recipeGeometry.taper),
      twist: requireIntegerInRange(geometry.twist, 'geometry.twist', ranges.recipeGeometry.twist),
      segments: requireIntegerInRange(geometry.segments, 'geometry.segments', ranges.recipeGeometry.segments),
      partOffset: requireIntegerInRange(geometry.partOffset, 'geometry.partOffset', ranges.recipeGeometry.partOffset),
      partDepth: requireIntegerInRange(geometry.partDepth, 'geometry.partDepth', ranges.recipeGeometry.partDepth),
      crownBias: requireIntegerInRange(geometry.crownBias, 'geometry.crownBias', ranges.recipeGeometry.crownBias),
      rootSpread: requireIntegerInRange(geometry.rootSpread, 'geometry.rootSpread', ranges.recipeGeometry.rootSpread),
    },
    material: {
      hue: requireIntegerInRange(material.hue, 'material.hue', ranges.recipeMaterial.hue),
      chroma: requireIntegerInRange(material.chroma, 'material.chroma', ranges.recipeMaterial.chroma),
      translucency: requireIntegerInRange(material.translucency, 'material.translucency', ranges.recipeMaterial.translucency),
    },
  };
}

function validateSurface(input: unknown): PicoSurfaceAppearanceV1 {
  const record = requirePlainObject(input, 'profile.surface', ['surfaceVersion', 'shell', 'face', 'trim']);
  if (typeof record.surfaceVersion !== 'number' || !Number.isInteger(record.surfaceVersion)) {
    throw new PicoAppearanceError('invalid_integer', 'surface.surfaceVersion must be an integer');
  }
  if (record.surfaceVersion !== 1) {
    throw new PicoAppearanceError('unsupported_profile_version', 'surface.surfaceVersion must be exactly 1');
  }
  const shell = requirePlainObject(record.shell, 'surface.shell', ['hue', 'chroma', 'lightness', 'gloss']);
  const face = requirePlainObject(record.face, 'surface.face', ['hue', 'tint', 'blackLevel', 'reflectivity']);
  const trim = requirePlainObject(record.trim, 'surface.trim', ['hue', 'chroma', 'metalness']);
  return {
    surfaceVersion: 1,
    shell: {
      hue: requireIntegerInRange(shell.hue, 'shell.hue', ranges.surfaceShell.hue),
      chroma: requireIntegerInRange(shell.chroma, 'shell.chroma', ranges.surfaceShell.chroma),
      lightness: requireIntegerInRange(shell.lightness, 'shell.lightness', ranges.surfaceShell.lightness),
      gloss: requireIntegerInRange(shell.gloss, 'shell.gloss', ranges.surfaceShell.gloss),
    },
    face: {
      hue: requireIntegerInRange(face.hue, 'face.hue', ranges.surfaceFace.hue),
      tint: requireIntegerInRange(face.tint, 'face.tint', ranges.surfaceFace.tint),
      blackLevel: requireIntegerInRange(face.blackLevel, 'face.blackLevel', ranges.surfaceFace.blackLevel),
      reflectivity: requireIntegerInRange(face.reflectivity, 'face.reflectivity', ranges.surfaceFace.reflectivity),
    },
    trim: {
      hue: requireIntegerInRange(trim.hue, 'trim.hue', ranges.surfaceTrim.hue),
      chroma: requireIntegerInRange(trim.chroma, 'trim.chroma', ranges.surfaceTrim.chroma),
      metalness: requireIntegerInRange(trim.metalness, 'trim.metalness', ranges.surfaceTrim.metalness),
    },
  };
}

function freezeProfile(profile: PicoAppearanceProfileV1): PicoAppearanceProfileV1 {
  if (profile.headIdentity.kind === 'procedural_neon_hair') {
    Object.freeze(profile.headIdentity.recipe.geometry);
    Object.freeze(profile.headIdentity.recipe.material);
    Object.freeze(profile.headIdentity.recipe);
  }
  Object.freeze(profile.headIdentity);
  Object.freeze(profile.surface.shell);
  Object.freeze(profile.surface.face);
  Object.freeze(profile.surface.trim);
  Object.freeze(profile.surface);
  return Object.freeze(profile);
}
