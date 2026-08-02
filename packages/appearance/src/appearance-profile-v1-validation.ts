import { PicoAppearanceError } from './appearance-errors.js';
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
      anchor: requireInteger(geometry.anchor, 'geometry.anchor', 0, 255),
      side: requireInteger(geometry.side, 'geometry.side', -96, 96),
      length: requireInteger(geometry.length, 'geometry.length', 0, 255),
      lift: requireInteger(geometry.lift, 'geometry.lift', 0, 255),
      sweep: requireInteger(geometry.sweep, 'geometry.sweep', -64, 127),
      curl: requireInteger(geometry.curl, 'geometry.curl', -127, 127),
      width: requireInteger(geometry.width, 'geometry.width', 0, 255),
      taper: requireInteger(geometry.taper, 'geometry.taper', 0, 255),
      twist: requireInteger(geometry.twist, 'geometry.twist', -127, 127),
      segments: requireInteger(geometry.segments, 'geometry.segments', 3, 9),
      partOffset: requireInteger(geometry.partOffset, 'geometry.partOffset', -96, 96),
      partDepth: requireInteger(geometry.partDepth, 'geometry.partDepth', 0, 192),
      crownBias: requireInteger(geometry.crownBias, 'geometry.crownBias', -96, 96),
      rootSpread: requireInteger(geometry.rootSpread, 'geometry.rootSpread', 48, 192),
    },
    material: {
      hue: requireInteger(material.hue, 'material.hue', 0, 359),
      chroma: requireInteger(material.chroma, 'material.chroma', 0, 255),
      translucency: requireInteger(material.translucency, 'material.translucency', 0, 255),
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
      hue: requireInteger(shell.hue, 'shell.hue', 0, 359),
      chroma: requireInteger(shell.chroma, 'shell.chroma', 0, 255),
      lightness: requireInteger(shell.lightness, 'shell.lightness', 0, 255),
      gloss: requireInteger(shell.gloss, 'shell.gloss', 0, 255),
    },
    face: {
      hue: requireInteger(face.hue, 'face.hue', 0, 359),
      tint: requireInteger(face.tint, 'face.tint', 0, 255),
      blackLevel: requireInteger(face.blackLevel, 'face.blackLevel', 0, 255),
      reflectivity: requireInteger(face.reflectivity, 'face.reflectivity', 0, 255),
    },
    trim: {
      hue: requireInteger(trim.hue, 'trim.hue', 0, 359),
      chroma: requireInteger(trim.chroma, 'trim.chroma', 0, 255),
      metalness: requireInteger(trim.metalness, 'trim.metalness', 0, 255),
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
