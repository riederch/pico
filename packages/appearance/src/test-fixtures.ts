import { expect } from 'vitest';
import { PicoAppearanceError } from './appearance-errors.js';
import type { PicoAppearanceProfileV1 } from './appearance-profile-v1.js';
import type { PicoAppearanceCompatibilityCoreV1 } from './compatibility-core-v1.js';

/**
 * Shared test fixtures. The hex strings are pinned by hand from the
 * published byte layouts, deliberately not derived from the codec, so a
 * codec regression cannot silently confirm itself.
 */
export const antennaProfile: PicoAppearanceProfileV1 = {
  profileVersion: 1,
  headIdentity: { kind: 'standard_antenna' },
  surface: {
    surfaceVersion: 1,
    shell: { hue: 210, chroma: 18, lightness: 224, gloss: 214 },
    face: { hue: 220, tint: 20, blackLevel: 52, reflectivity: 128 },
    trim: { hue: 215, chroma: 36, metalness: 198 },
  },
};

export const antennaProfileHex = '01000100d20012e0d6dc00143480d70024c6';

export const hairProfile: PicoAppearanceProfileV1 = {
  profileVersion: 1,
  headIdentity: {
    kind: 'procedural_neon_hair',
    recipe: {
      generatorVersion: 2,
      geometry: {
        anchor: 82, side: 0, length: 54, lift: 174, sweep: 12, curl: 6,
        width: 118, taper: 204, twist: 4, segments: 4,
        partOffset: 0, partDepth: 108, crownBias: -48, rootSpread: 126,
      },
      material: { hue: 198, chroma: 138, translucency: 168 },
    },
  },
  surface: {
    surfaceVersion: 1,
    shell: { hue: 205, chroma: 24, lightness: 226, gloss: 220 },
    face: { hue: 225, tint: 26, blackLevel: 46, reflectivity: 142 },
    trim: { hue: 210, chroma: 42, metalness: 206 },
  },
};

export const hairProfileHex =
  '01010100cd0018e2dce1001a2e8ed2002ace0200520036ae0c0676cc0404c6008aa8006cd07e';

export const topStructuredCore: PicoAppearanceCompatibilityCoreV1 = {
  compatibilityCoreVersion: 1,
  shell: { hue: 205, chroma: 24, lightness: 226 },
  face: { hue: 225, blackLevel: 46 },
  trim: { hue: 210, chroma: 42 },
  head: {
    kind: 'semantic_head_module',
    family: 'top_structured',
    primaryHue: 198,
    length: 54,
    volume: 122,
    parting: 0,
  },
  clothing: { kind: 'none', family: 'none', primaryHue: 0, secondaryHue: 0 },
};

export const topStructuredCoreHex = '00cd18e200e12e00d22a010400c6367a0000000000000000';

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function expectAppearanceError(run: () => unknown, code: string): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(PicoAppearanceError);
  expect((caught as PicoAppearanceError).code).toBe(code);
}
