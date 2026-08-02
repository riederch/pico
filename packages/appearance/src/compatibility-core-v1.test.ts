import { describe, expect, it } from 'vitest';
import { validateCompatibilityCoreV1 } from './compatibility-core-v1.js';
import {
  decodeCompatibilityCoreV1,
  encodeCompatibilityCoreV1,
} from './compatibility-core-v1-codec.js';
import {
  bytesToHex,
  expectAppearanceError,
  hexToBytes,
  topStructuredCore,
  topStructuredCoreHex,
} from './test-fixtures.js';

describe('compatibility core v1 codec', () => {
  it('encodes to the pinned 24-byte big-endian payload', () => {
    expect(bytesToHex(encodeCompatibilityCoreV1(topStructuredCore))).toBe(topStructuredCoreHex);
  });

  it('round-trips byte-identically', () => {
    const bytes = hexToBytes(topStructuredCoreHex);
    expect(bytesToHex(encodeCompatibilityCoreV1(decodeCompatibilityCoreV1(bytes)))).toBe(topStructuredCoreHex);
  });

  it('encodes negative parting as two-s complement int8', () => {
    const core = {
      ...topStructuredCore,
      head: { ...topStructuredCore.head, parting: -127 },
    };
    const bytes = encodeCompatibilityCoreV1(core);
    expect(bytes[16]).toBe(0x81);
    expect(decodeCompatibilityCoreV1(bytes).head.parting).toBe(-127);
  });

  it('rejects the int8 value -128 instead of interpreting it', () => {
    const bytes = hexToBytes(topStructuredCoreHex);
    bytes[16] = 0x80;
    expectAppearanceError(() => decodeCompatibilityCoreV1(bytes), 'value_out_of_range');
  });

  it('rejects wrong payload lengths', () => {
    expectAppearanceError(() => decodeCompatibilityCoreV1(new Uint8Array(23)), 'invalid_length');
    expectAppearanceError(() => decodeCompatibilityCoreV1(new Uint8Array(25)), 'invalid_length');
  });

  it('rejects a set reserved byte', () => {
    const bytes = hexToBytes(topStructuredCoreHex);
    bytes[23] = 1;
    expectAppearanceError(() => decodeCompatibilityCoreV1(bytes), 'unknown_flags');
  });

  it('never interprets an unknown family or kind id as a known one', () => {
    const family = hexToBytes(topStructuredCoreHex);
    family[11] = 200;
    expectAppearanceError(() => decodeCompatibilityCoreV1(family), 'value_out_of_range');
    const kind = hexToBytes(topStructuredCoreHex);
    kind[10] = 9;
    expectAppearanceError(() => decodeCompatibilityCoreV1(kind), 'value_out_of_range');
    const clothing = hexToBytes(topStructuredCoreHex);
    clothing[18] = 250;
    expectAppearanceError(() => decodeCompatibilityCoreV1(clothing), 'value_out_of_range');
  });
});

describe('compatibility core v1 validation', () => {
  it('enforces kind and family consistency', () => {
    expectAppearanceError(
      () => validateCompatibilityCoreV1({
        ...topStructuredCore,
        head: { ...topStructuredCore.head, kind: 'standard_antenna' },
      }),
      'invalid_shape',
    );
    expectAppearanceError(
      () => validateCompatibilityCoreV1({
        ...topStructuredCore,
        head: { ...topStructuredCore.head, family: 'standard_antenna' },
      }),
      'invalid_shape',
    );
    expectAppearanceError(
      () => validateCompatibilityCoreV1({
        ...topStructuredCore,
        clothing: { kind: 'none', family: 'workwear', primaryHue: 0, secondaryHue: 0 },
      }),
      'invalid_shape',
    );
    expectAppearanceError(
      () => validateCompatibilityCoreV1({
        ...topStructuredCore,
        clothing: { kind: 'standard', family: 'none', primaryHue: 0, secondaryHue: 0 },
      }),
      'invalid_shape',
    );
  });

  it('rejects unsupported versions and out-of-range values', () => {
    expectAppearanceError(
      () => validateCompatibilityCoreV1({ ...topStructuredCore, compatibilityCoreVersion: 2 }),
      'unsupported_compatibility_core_version',
    );
    expectAppearanceError(
      () => validateCompatibilityCoreV1({
        ...topStructuredCore,
        shell: { hue: 360, chroma: 0, lightness: 0 },
      }),
      'value_out_of_range',
    );
    expectAppearanceError(
      () => validateCompatibilityCoreV1({
        ...topStructuredCore,
        head: { ...topStructuredCore.head, parting: -128 },
      }),
      'value_out_of_range',
    );
  });
});
