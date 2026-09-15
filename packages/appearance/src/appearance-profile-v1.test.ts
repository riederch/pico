import { describe, expect, it } from 'vitest';
import {
  decodeAppearanceProfileV1,
  encodeAppearanceProfileV1,
  formatAppearanceProfileV1,
  parseAppearanceProfileV1,
} from './appearance-profile-v1-codec.js';
import { validateAppearanceProfileV1 } from './appearance-profile-v1-validation.js';
import {
  antennaProfile,
  antennaProfileHex,
  bytesToHex,
  expectAppearanceError,
  hairProfile,
  hairProfileHex,
  hexToBytes,
} from './test-fixtures.js';

describe('appearance profile v1 codec', () => {
  it('encodes the standard antenna profile to the pinned 18 bytes', () => {
    expect(bytesToHex(encodeAppearanceProfileV1(antennaProfile))).toBe(antennaProfileHex);
  });

  it('encodes the head module profile to the pinned 38 bytes', () => {
    expect(bytesToHex(encodeAppearanceProfileV1(hairProfile))).toBe(hairProfileHex);
  });

  it('round-trips byte-identically', () => {
    for (const hex of [antennaProfileHex, hairProfileHex]) {
      const bytes = hexToBytes(hex);
      expect(bytesToHex(encodeAppearanceProfileV1(decodeAppearanceProfileV1(bytes)))).toBe(hex);
    }
  });

  it('writes uint16 fields little endian', () => {
    const profile = {
      ...antennaProfile,
      surface: { ...antennaProfile.surface, shell: { ...antennaProfile.surface.shell, hue: 359 } },
    };
    const bytes = encodeAppearanceProfileV1(profile);
    expect(bytes[4]).toBe(0x67);
    expect(bytes[5]).toBe(0x01);
  });

  it('encodes negative int8 values as two-s complement', () => {
    const bytes = encodeAppearanceProfileV1(hairProfile);
    expect(bytes[36]).toBe(0xd0);
    const negative = decodeAppearanceProfileV1(bytes);
    expect(negative.headIdentity.kind === 'procedural_neon_hair'
      && negative.headIdentity.recipe.geometry.crownBias).toBe(-48);
  });

  it('does not mutate the input bytes', () => {
    const bytes = hexToBytes(hairProfileHex);
    const copy = Uint8Array.from(bytes);
    decodeAppearanceProfileV1(bytes);
    expect(bytes).toEqual(copy);
  });

  it('rejects 17, 19, 37 and 39 bytes', () => {
    for (const length of [17, 19, 37, 39]) {
      expectAppearanceError(() => decodeAppearanceProfileV1(new Uint8Array(length)), 'invalid_length');
    }
  });

  it('rejects an antenna profile with an appended head block', () => {
    const bytes = new Uint8Array(38);
    bytes.set(hexToBytes(antennaProfileHex), 0);
    expectAppearanceError(() => decodeAppearanceProfileV1(bytes), 'head_length_mismatch');
  });

  it('rejects a head module profile without its head block', () => {
    const bytes = hexToBytes(antennaProfileHex);
    bytes[1] = 1;
    expectAppearanceError(() => decodeAppearanceProfileV1(bytes), 'head_length_mismatch');
  });

  it('rejects unknown versions, head kinds and flags', () => {
    const versions = hexToBytes(antennaProfileHex);
    versions[0] = 2;
    expectAppearanceError(() => decodeAppearanceProfileV1(versions), 'unsupported_profile_version');
    const headKind = hexToBytes(antennaProfileHex);
    headKind[1] = 3;
    expectAppearanceError(() => decodeAppearanceProfileV1(headKind), 'invalid_shape');
    const surfaceVersion = hexToBytes(antennaProfileHex);
    surfaceVersion[2] = 2;
    expectAppearanceError(() => decodeAppearanceProfileV1(surfaceVersion), 'unsupported_profile_version');
    const flags = hexToBytes(antennaProfileHex);
    flags[3] = 1;
    expectAppearanceError(() => decodeAppearanceProfileV1(flags), 'unknown_flags');
    const generatorVersion = hexToBytes(hairProfileHex);
    generatorVersion[18] = 1;
    expectAppearanceError(() => decodeAppearanceProfileV1(generatorVersion), 'unsupported_profile_version');
    const headFlags = hexToBytes(hairProfileHex);
    headFlags[19] = 4;
    expectAppearanceError(() => decodeAppearanceProfileV1(headFlags), 'unknown_flags');
  });

  it('rejects out-of-range decoded values instead of clamping', () => {
    const hue = hexToBytes(antennaProfileHex);
    hue[4] = 0x68;
    hue[5] = 0x01;
    expectAppearanceError(() => decodeAppearanceProfileV1(hue), 'value_out_of_range');
    const segments = hexToBytes(hairProfileHex);
    segments[29] = 2;
    expectAppearanceError(() => decodeAppearanceProfileV1(segments), 'value_out_of_range');
    segments[29] = 10;
    expectAppearanceError(() => decodeAppearanceProfileV1(segments), 'value_out_of_range');
    const partDepth = hexToBytes(hairProfileHex);
    partDepth[35] = 193;
    expectAppearanceError(() => decodeAppearanceProfileV1(partDepth), 'value_out_of_range');
    const rootSpread = hexToBytes(hairProfileHex);
    rootSpread[37] = 47;
    expectAppearanceError(() => decodeAppearanceProfileV1(rootSpread), 'value_out_of_range');
    rootSpread[37] = 193;
    expectAppearanceError(() => decodeAppearanceProfileV1(rootSpread), 'value_out_of_range');
  });

  it('formats and parses the canonical pa1_ text form only', () => {
    const text = formatAppearanceProfileV1(antennaProfile);
    expect(text.startsWith('pa1_')).toBe(true);
    expect(text).not.toContain('=');
    expect(bytesToHex(encodeAppearanceProfileV1(parseAppearanceProfileV1(text)))).toBe(antennaProfileHex);
    expectAppearanceError(() => parseAppearanceProfileV1(`PA1_${text.slice(4)}`), 'invalid_text_format');
    expectAppearanceError(() => parseAppearanceProfileV1(`${text}=`), 'invalid_text_format');
    expectAppearanceError(() => parseAppearanceProfileV1(`pa1_${text.slice(4)}!`), 'invalid_text_format');
  });

  it('rejects non-canonical base64url trailing bits', () => {
    // 38 bytes leave two zero trailing bits in the final base64url character;
    // 'B' (value 1) sets one of them, so it is never a canonical final character.
    const text = formatAppearanceProfileV1(hairProfile);
    expectAppearanceError(() => parseAppearanceProfileV1(`${text.slice(0, -1)}B`), 'invalid_text_format');
  });
});

describe('appearance profile v1 validation', () => {
  it('accepts and freezes a valid profile', () => {
    const validated = validateAppearanceProfileV1(structuredClone(antennaProfile));
    expect(Object.isFrozen(validated)).toBe(true);
    expect(Object.isFrozen(validated.surface.shell)).toBe(true);
  });

  it('rejects unknown keys, including status and context fields', () => {
    expectAppearanceError(
      () => validateAppearanceProfileV1({ ...structuredClone(antennaProfile), statusColor: 'green' }),
      'invalid_shape',
    );
    expectAppearanceError(
      () => validateAppearanceProfileV1({ ...structuredClone(antennaProfile), context: 'firefighter' }),
      'invalid_shape',
    );
  });

  it('rejects a missing recipe and a recipe beside the antenna', () => {
    expectAppearanceError(
      () => validateAppearanceProfileV1({
        ...structuredClone(antennaProfile),
        headIdentity: { kind: 'procedural_neon_hair' },
      }),
      'invalid_shape',
    );
    expectAppearanceError(
      () => validateAppearanceProfileV1({
        ...structuredClone(antennaProfile),
        headIdentity: {
          kind: 'standard_antenna',
          recipe: (hairProfile.headIdentity as { recipe: unknown }).recipe,
        },
      }),
      'invalid_shape',
    );
  });

  it('rejects floats, numeric strings and non-integers', () => {
    const float = structuredClone(antennaProfile) as { surface: { shell: { hue: number } } };
    float.surface.shell.hue = 210.5;
    expectAppearanceError(() => validateAppearanceProfileV1(float), 'invalid_integer');
    const text = structuredClone(antennaProfile) as { surface: { shell: { hue: unknown } } };
    text.surface.shell.hue = '210';
    expectAppearanceError(() => validateAppearanceProfileV1(text), 'invalid_integer');
  });

  it('rejects values outside the published ranges without clamping', () => {
    const hue = structuredClone(antennaProfile) as { surface: { shell: { hue: number } } };
    hue.surface.shell.hue = 360;
    expectAppearanceError(() => validateAppearanceProfileV1(hue), 'value_out_of_range');
    const side = structuredClone(hairProfile) as {
      headIdentity: { recipe: { geometry: { side: number } } };
    };
    side.headIdentity.recipe.geometry.side = 97;
    expectAppearanceError(() => validateAppearanceProfileV1(side), 'value_out_of_range');
  });

  it('rejects objects with a non-plain prototype', () => {
    class Impostor {
      profileVersion = 1;
      headIdentity = { kind: 'standard_antenna' };
      surface = structuredClone(antennaProfile.surface);
    }
    expectAppearanceError(() => validateAppearanceProfileV1(new Impostor()), 'invalid_shape');
  });
});

/**
 * Befund B146. `requireExactInteger` stand in `validation-primitives.ts`
 * geschrieben, nannte in seinem eigenen Typ die drei Versionscodes, fuer die
 * es da ist - und **nichts im ganzen Baum rief es auf**. Daneben stand
 * dieselbe Pruefung fuenfmal von Hand.
 *
 * Und keine der fuenf hielt ein Test: die Pflanzung „jede Versionsnummer
 * gilt" liess alle 122 Pruefungen des Pakets gruen. Gehalten war nur der
 * Byteweg im Kodierer, nicht der Feldweg, auf dem fremdes JSON hereinkommt -
 * also genau der untrusted Weg, fuer den der Kommentar der Datei den
 * strengen Stil begruendet.
 */
describe('appearance profile v1 field validation - Befund B146', () => {
  it('refuses every version field that is not exactly the one it must be', () => {
    for (const wrong of [0, 2, -1, 1.5, '1', null, true]) {
      expectAppearanceError(
        () => validateAppearanceProfileV1({ ...antennaProfile, profileVersion: wrong }),
        typeof wrong === 'number' && Number.isInteger(wrong)
          ? 'unsupported_profile_version'
          : 'invalid_integer',
      );
      expectAppearanceError(
        () => validateAppearanceProfileV1({
          ...antennaProfile,
          surface: { ...antennaProfile.surface, surfaceVersion: wrong },
        }),
        typeof wrong === 'number' && Number.isInteger(wrong)
          ? 'unsupported_profile_version'
          : 'invalid_integer',
      );
    }
  });

  it('refuses a recipe whose generator is not the generator this build speaks', () => {
    const recipe = (hairProfile.headIdentity as unknown as { recipe: Record<string, unknown> }).recipe;
    for (const wrong of [1, 3, 0]) {
      expectAppearanceError(
        () => validateAppearanceProfileV1({
          ...hairProfile,
          headIdentity: { kind: 'procedural_neon_hair', recipe: { ...recipe, generatorVersion: wrong } },
        }),
        'unsupported_profile_version',
      );
    }
    // Die Form behaelt ihren eigenen Grund, statt in den Versionsgrund zu fallen.
    expectAppearanceError(
      () => validateAppearanceProfileV1({
        ...hairProfile,
        headIdentity: { kind: 'procedural_neon_hair', recipe: { ...recipe, generatorVersion: 2.5 } },
      }),
      'invalid_integer',
    );
  });
});
