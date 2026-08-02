import { describe, expect, it } from 'vitest';
import { decodeAppearanceProfileV1, encodeAppearanceProfileV1 } from './appearance-profile-v1-codec.js';
import { decodeAppearanceDocumentV1, encodeAppearanceDocumentV1 } from './appearance-document-v1-codec.js';
import { createAppearanceDocumentV1 } from './appearance-document-v1-validation.js';
import { PicoAppearanceError } from './appearance-errors.js';
import type { PicoAppearanceProfileV1 } from './appearance-profile-v1.js';
import { antennaProfile, bytesToHex } from './test-fixtures.js';

/**
 * Deterministic xorshift32 test PRNG. No Math.random, no time and no
 * platform entropy: the same seed always exercises the same inputs, so a
 * failure is reproducible from the log.
 */
function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
}

function randomBytes(next: () => number, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = next() & 0xff;
  }
  return bytes;
}

function pick(next: () => number, minimum: number, maximum: number): number {
  return minimum + (next() % (maximum - minimum + 1));
}

function randomValidProfile(next: () => number): PicoAppearanceProfileV1 {
  const surface = {
    surfaceVersion: 1 as const,
    shell: {
      hue: pick(next, 0, 359),
      chroma: pick(next, 0, 255),
      lightness: pick(next, 0, 255),
      gloss: pick(next, 0, 255),
    },
    face: {
      hue: pick(next, 0, 359),
      tint: pick(next, 0, 255),
      blackLevel: pick(next, 0, 255),
      reflectivity: pick(next, 0, 255),
    },
    trim: {
      hue: pick(next, 0, 359),
      chroma: pick(next, 0, 255),
      metalness: pick(next, 0, 255),
    },
  };
  if (next() % 2 === 0) {
    return { profileVersion: 1, headIdentity: { kind: 'standard_antenna' }, surface };
  }
  return {
    profileVersion: 1,
    headIdentity: {
      kind: 'procedural_neon_hair',
      recipe: {
        generatorVersion: 2,
        geometry: {
          anchor: pick(next, 0, 255),
          side: pick(next, -96, 96),
          length: pick(next, 0, 255),
          lift: pick(next, 0, 255),
          sweep: pick(next, -64, 127),
          curl: pick(next, -127, 127),
          width: pick(next, 0, 255),
          taper: pick(next, 0, 255),
          twist: pick(next, -127, 127),
          segments: pick(next, 3, 9),
          partOffset: pick(next, -96, 96),
          partDepth: pick(next, 0, 192),
          crownBias: pick(next, -96, 96),
          rootSpread: pick(next, 48, 192),
        },
        material: {
          hue: pick(next, 0, 359),
          chroma: pick(next, 0, 255),
          translucency: pick(next, 0, 255),
        },
      },
    },
    surface,
  };
}

describe('appearance robustness', () => {
  it('terminates on random byte arrays up to 8192 bytes with typed errors only', () => {
    const next = createPrng(0x9e3779b9);
    for (let round = 0; round < 600; round += 1) {
      const length = next() % 8193;
      const bytes = randomBytes(next, length);
      const copy = Uint8Array.from(bytes);
      try {
        decodeAppearanceDocumentV1(bytes);
      } catch (error) {
        expect(error).toBeInstanceOf(PicoAppearanceError);
      }
      expect(bytes).toEqual(copy);
    }
  });

  it('terminates on random profile byte arrays up to 128 bytes with typed errors only', () => {
    const next = createPrng(0x51ed270b);
    for (let round = 0; round < 2000; round += 1) {
      const bytes = randomBytes(next, next() % 129);
      try {
        decodeAppearanceProfileV1(bytes);
      } catch (error) {
        expect(error).toBeInstanceOf(PicoAppearanceError);
      }
    }
  });

  it('survives every single-byte flip of a valid envelope with typed errors only', () => {
    const canonical = encodeAppearanceDocumentV1(createAppearanceDocumentV1(antennaProfile));
    for (let offset = 0; offset < canonical.length; offset += 1) {
      for (const flip of [0x01, 0x80, 0xff]) {
        const bytes = Uint8Array.from(canonical);
        bytes[offset] = bytes[offset] ^ flip;
        try {
          decodeAppearanceDocumentV1(bytes);
        } catch (error) {
          expect(error).toBeInstanceOf(PicoAppearanceError);
        }
      }
    }
  });

  it('keeps encode-decode-encode byte-identical over generated valid profiles', () => {
    const next = createPrng(0x2545f491);
    for (let round = 0; round < 200; round += 1) {
      const profile = randomValidProfile(next);
      const bytes = encodeAppearanceProfileV1(profile);
      expect(bytesToHex(encodeAppearanceProfileV1(decodeAppearanceProfileV1(bytes)))).toBe(bytesToHex(bytes));
      const documentBytes = encodeAppearanceDocumentV1(createAppearanceDocumentV1(profile));
      expect(bytesToHex(encodeAppearanceDocumentV1(decodeAppearanceDocumentV1(documentBytes))))
        .toBe(bytesToHex(documentBytes));
    }
  });

  it('produces identical document bytes for equal profiles', () => {
    const next = createPrng(0x00c0ffee);
    for (let round = 0; round < 50; round += 1) {
      const profile = randomValidProfile(next);
      const first = encodeAppearanceDocumentV1(createAppearanceDocumentV1(profile));
      const second = encodeAppearanceDocumentV1(createAppearanceDocumentV1(structuredClone(profile)));
      expect(bytesToHex(second)).toBe(bytesToHex(first));
    }
  });
});
