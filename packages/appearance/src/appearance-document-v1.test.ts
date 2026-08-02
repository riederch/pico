import { describe, expect, it } from 'vitest';
import {
  createAppearanceDocumentV1,
  validateAppearanceDocumentV1,
} from './appearance-document-v1-validation.js';
import {
  decodeAppearanceDocumentV1,
  encodeAppearanceDocumentV1,
  formatAppearanceDocumentV1,
  parseAppearanceDocumentV1,
} from './appearance-document-v1-codec.js';
import type { PicoAppearanceExtensionV1 } from './appearance-extension-v1.js';
import type { PicoCustomAppearanceAssetReferenceV1 } from './custom-asset-reference-v1.js';
import {
  antennaProfile,
  antennaProfileHex,
  bytesToHex,
  expectAppearanceError,
  hairProfile,
  hexToBytes,
} from './test-fixtures.js';

/**
 * Pinned by hand from the published envelope layout; not derived from the
 * codec: 8-byte header, then the critical compatibility core record
 * (24-byte payload) and the critical canonical profile record wrapping the
 * pinned 18-byte antenna profile.
 */
const antennaDocumentHex = [
  '5041010000460002',
  '010100010018',
  '00d212e000dc3400d7240000000000000000000000000000',
  '02010001001a',
  `0001000100000012${antennaProfileHex}`,
].join('');

const forkExtension: PicoAppearanceExtensionV1 = {
  namespace: 'example.fork',
  name: 'crystal-head-module',
  version: 1,
  critical: false,
  payload: Uint8Array.from([1, 2, 3, 4]),
};

const customAsset: PicoCustomAppearanceAssetReferenceV1 = {
  customAssetSchemaVersion: 1,
  kind: 'custom_clothing',
  sha256: Uint8Array.from({ length: 32 }, (_, index) => index),
  mediaType: 'image/png',
  fallback: { clothingFamily: 'workwear', primaryHue: 30, secondaryHue: 200 },
};

describe('appearance document v1 codec', () => {
  it('encodes the minimal antenna document to the pinned envelope bytes', () => {
    const document = createAppearanceDocumentV1(antennaProfile);
    expect(bytesToHex(encodeAppearanceDocumentV1(document))).toBe(antennaDocumentHex);
  });

  it('round-trips byte-identically, including custom assets and extensions', () => {
    const document = createAppearanceDocumentV1(hairProfile, {
      coreModelVersion: 3,
      customAssets: [customAsset],
      extensions: [forkExtension],
    });
    const bytes = encodeAppearanceDocumentV1(document);
    const decoded = decodeAppearanceDocumentV1(bytes);
    expect(bytesToHex(encodeAppearanceDocumentV1(decoded))).toBe(bytesToHex(bytes));
    expect(decoded.coreModelVersion).toBe(3);
    expect(decoded.customAssets).toHaveLength(1);
    expect(decoded.customAssets[0].fallback.clothingFamily).toBe('workwear');
    expect(decoded.extensions).toHaveLength(1);
    expect(decoded.extensions[0].namespace).toBe('example.fork');
    expect(decoded.extensions[0].critical).toBe(false);
  });

  it('does not mutate the input bytes', () => {
    const bytes = hexToBytes(antennaDocumentHex);
    const copy = Uint8Array.from(bytes);
    decodeAppearanceDocumentV1(bytes);
    expect(bytes).toEqual(copy);
  });

  it('accepts records in any order and re-encodes canonically', () => {
    const canonical = hexToBytes(antennaDocumentHex);
    const coreRecord = canonical.subarray(8, 8 + 30);
    const profileRecord = canonical.subarray(8 + 30);
    const reordered = new Uint8Array(canonical.length);
    reordered.set(canonical.subarray(0, 8), 0);
    reordered.set(profileRecord, 8);
    reordered.set(coreRecord, 8 + profileRecord.length);
    const decoded = decodeAppearanceDocumentV1(reordered);
    expect(bytesToHex(encodeAppearanceDocumentV1(decoded))).toBe(antennaDocumentHex);
  });

  it('formats and parses the canonical pad1_ text form only', () => {
    const document = createAppearanceDocumentV1(antennaProfile);
    const text = formatAppearanceDocumentV1(document);
    expect(text.startsWith('pad1_')).toBe(true);
    expect(bytesToHex(encodeAppearanceDocumentV1(parseAppearanceDocumentV1(text)))).toBe(antennaDocumentHex);
    expectAppearanceError(() => parseAppearanceDocumentV1(`PAD1_${text.slice(5)}`), 'invalid_text_format');
    expectAppearanceError(() => parseAppearanceDocumentV1(`${text}==`), 'invalid_text_format');
  });

  it('preserves an unknown optional fork extension byte-identically through the roundtrip', () => {
    const document = createAppearanceDocumentV1(antennaProfile, { extensions: [forkExtension] });
    const bytes = encodeAppearanceDocumentV1(document);
    expect(bytesToHex(encodeAppearanceDocumentV1(decodeAppearanceDocumentV1(bytes)))).toBe(bytesToHex(bytes));
  });

  it('decodes a critical extension as critical without executing anything', () => {
    const document = createAppearanceDocumentV1(antennaProfile, {
      extensions: [{ ...forkExtension, critical: true }],
    });
    const decoded = decodeAppearanceDocumentV1(encodeAppearanceDocumentV1(document));
    expect(decoded.extensions[0].critical).toBe(true);
  });

  it('skips an unknown optional record and keeps the document readable', () => {
    const canonical = hexToBytes(antennaDocumentHex);
    const unknownRecord = Uint8Array.from([0x10, 0x00, 0x00, 0x01, 0x00, 0x02, 0xaa, 0xbb]);
    const extended = appendRecord(canonical, unknownRecord);
    const decoded = decodeAppearanceDocumentV1(extended);
    expect(bytesToHex(encodeAppearanceDocumentV1(decoded))).toBe(antennaDocumentHex);
  });

  it('rejects an unknown critical record', () => {
    const canonical = hexToBytes(antennaDocumentHex);
    const unknownRecord = Uint8Array.from([0x10, 0x01, 0x00, 0x01, 0x00, 0x02, 0xaa, 0xbb]);
    expectAppearanceError(
      () => decodeAppearanceDocumentV1(appendRecord(canonical, unknownRecord)),
      'unsupported_critical_record',
    );
  });

  it('rejects reserved record flag bits', () => {
    const bytes = hexToBytes(antennaDocumentHex);
    bytes[9] = 0x03;
    expectAppearanceError(() => decodeAppearanceDocumentV1(bytes), 'invalid_record_flags');
  });

  it('rejects wrong magic, unknown envelope version and set envelope flags', () => {
    const magic = hexToBytes(antennaDocumentHex);
    magic[0] = 0x51;
    expectAppearanceError(() => decodeAppearanceDocumentV1(magic), 'invalid_magic');
    const version = hexToBytes(antennaDocumentHex);
    version[2] = 2;
    expectAppearanceError(() => decodeAppearanceDocumentV1(version), 'unsupported_envelope_version');
    const flags = hexToBytes(antennaDocumentHex);
    flags[3] = 1;
    expectAppearanceError(() => decodeAppearanceDocumentV1(flags), 'unknown_flags');
  });

  it('rejects total length mismatches and truncated records', () => {
    const shorter = hexToBytes(antennaDocumentHex);
    shorter[5] = 0x45;
    expectAppearanceError(() => decodeAppearanceDocumentV1(shorter), 'invalid_length');
    const truncated = hexToBytes(antennaDocumentHex).subarray(0, 40);
    expectAppearanceError(() => decodeAppearanceDocumentV1(truncated), 'invalid_length');
    const recordBeyondEnd = hexToBytes(antennaDocumentHex);
    recordBeyondEnd[13] = 0xff;
    expectAppearanceError(() => decodeAppearanceDocumentV1(recordBeyondEnd), 'invalid_length');
  });

  it('rejects envelopes beyond the hard limits before parsing records', () => {
    expectAppearanceError(() => decodeAppearanceDocumentV1(new Uint8Array(4097)), 'size_limit_exceeded');
    const tooManyRecords = hexToBytes(antennaDocumentHex);
    tooManyRecords[6] = 0x00;
    tooManyRecords[7] = 0x41;
    expectAppearanceError(() => decodeAppearanceDocumentV1(tooManyRecords), 'size_limit_exceeded');
  });

  it('rejects duplicate and missing required records', () => {
    const canonical = hexToBytes(antennaDocumentHex);
    const coreRecord = Uint8Array.from(canonical.subarray(8, 8 + 30));
    const profileRecord = Uint8Array.from(canonical.subarray(8 + 30));
    expectAppearanceError(
      () => decodeAppearanceDocumentV1(appendRecord(canonical, coreRecord)),
      'duplicate_required_record',
    );
    expectAppearanceError(
      () => decodeAppearanceDocumentV1(appendRecord(canonical, profileRecord)),
      'duplicate_required_record',
    );
    expectAppearanceError(
      () => decodeAppearanceDocumentV1(buildEnvelope([coreRecord])),
      'missing_required_record',
    );
    expectAppearanceError(
      () => decodeAppearanceDocumentV1(buildEnvelope([profileRecord])),
      'missing_required_record',
    );
  });

  it('rejects a compatibility core that differs from the normative projection', () => {
    const tampered = hexToBytes(antennaDocumentHex);
    // Core payload byte 2 (shell.chroma) sits at offset 8 + 6 + 2.
    tampered[8 + 6 + 2] = 0x2a;
    expectAppearanceError(() => decodeAppearanceDocumentV1(tampered), 'compatibility_core_mismatch');
  });

  it('carries an unknown newer profile version opaquely and re-encodes it byte-identically', () => {
    const canonical = hexToBytes(antennaDocumentHex);
    const futurePayload = Uint8Array.from([9, 9, 9, 9]);
    const futureProfileRecord = Uint8Array.from([
      0x02, 0x01, 0x00, 0x01, 0x00, 0x0c,
      0x00, 0x01, 0x00, 0x02, 0x00, 0x05, 0x00, 0x04,
      ...futurePayload,
    ]);
    const coreRecord = Uint8Array.from(canonical.subarray(8, 8 + 30));
    const bytes = buildEnvelope([coreRecord, futureProfileRecord]);
    const decoded = decodeAppearanceDocumentV1(bytes);
    expect(decoded.canonicalProfile.kind).toBe('unknown');
    if (decoded.canonicalProfile.kind === 'unknown') {
      expect(decoded.canonicalProfile.appearanceProfileVersion).toBe(2);
      expect(Array.from(decoded.canonicalProfile.payload)).toEqual([9, 9, 9, 9]);
    }
    expect(decoded.coreModelVersion).toBe(5);
    expect(bytesToHex(encodeAppearanceDocumentV1(decoded))).toBe(bytesToHex(bytes));
  });

  it('rejects a profile record whose declared payload length contradicts the record', () => {
    const canonical = hexToBytes(antennaDocumentHex);
    // The inner length field claims 17 bytes while the record carries 18.
    canonical[8 + 30 + 6 + 7] = 0x11;
    expectAppearanceError(() => decodeAppearanceDocumentV1(canonical), 'invalid_length');
  });

  it('rejects invalid extension namespaces on the wire', () => {
    const canonical = hexToBytes(antennaDocumentHex);
    const badNamespace = Uint8Array.from([
      0x7f, 0x00, 0x00, 0x01, 0x00, 0x06,
      0x02, 0x41, 0x42,
      0x02, 0x61, 0x62,
    ]);
    expectAppearanceError(
      () => decodeAppearanceDocumentV1(appendRecord(canonical, badNamespace)),
      'invalid_namespace',
    );
  });
});

describe('appearance document v1 validation', () => {
  it('always computes the compatibility core from the profile', () => {
    const document = createAppearanceDocumentV1(hairProfile);
    expect(document.compatibilityCore.head.family).toBe('top_structured');
  });

  it('rejects a caller-supplied core that does not match the projection', () => {
    const document = createAppearanceDocumentV1(antennaProfile);
    expectAppearanceError(
      () => validateAppearanceDocumentV1({
        ...document,
        compatibilityCore: {
          ...document.compatibilityCore,
          shell: { ...document.compatibilityCore.shell, hue: 1 },
        },
      }),
      'compatibility_core_mismatch',
    );
  });

  it('rejects non-canonical extension and asset ordering instead of sorting silently', () => {
    const first: PicoAppearanceExtensionV1 = { ...forkExtension, name: 'aaa' };
    const second: PicoAppearanceExtensionV1 = { ...forkExtension, name: 'bbb' };
    const document = createAppearanceDocumentV1(antennaProfile, { extensions: [second, first] });
    expect(document.extensions[0].name).toBe('aaa');
    expectAppearanceError(
      () => validateAppearanceDocumentV1({ ...document, extensions: [second, first] }),
      'invalid_record_ordering',
    );
  });

  it('rejects a custom asset with a wrong hash length or a non-renderable fallback', () => {
    expectAppearanceError(
      () => createAppearanceDocumentV1(antennaProfile, {
        customAssets: [{ ...customAsset, sha256: new Uint8Array(31) }],
      }),
      'invalid_custom_asset_reference',
    );
    expectAppearanceError(
      () => createAppearanceDocumentV1(antennaProfile, {
        customAssets: [{
          ...customAsset,
          fallback: { clothingFamily: 'none', primaryHue: 0, secondaryHue: 0 },
        }],
      }),
      'invalid_custom_asset_reference',
    );
    expectAppearanceError(
      () => createAppearanceDocumentV1(antennaProfile, {
        customAssets: [{
          ...customAsset,
          fallback: { clothingFamily: 'custom_fallback', primaryHue: 0, secondaryHue: 0 },
        }],
      }),
      'invalid_custom_asset_reference',
    );
  });

  it('rejects an oversized extension payload', () => {
    expectAppearanceError(
      () => createAppearanceDocumentV1(antennaProfile, {
        extensions: [{ ...forkExtension, payload: new Uint8Array(1025) }],
      }),
      'size_limit_exceeded',
    );
  });

  it('rejects documents that would exceed the record count limit', () => {
    const extensions = Array.from({ length: 63 }, (_, index): PicoAppearanceExtensionV1 => ({
      namespace: 'example.fork',
      name: `extension-${String(index).padStart(3, '0')}`,
      version: 1,
      critical: false,
      payload: new Uint8Array(0),
    }));
    expectAppearanceError(
      () => createAppearanceDocumentV1(antennaProfile, { extensions }),
      'size_limit_exceeded',
    );
  });

  it('rejects floats and numeric strings in document fields', () => {
    const document = createAppearanceDocumentV1(antennaProfile);
    expectAppearanceError(
      () => validateAppearanceDocumentV1({ ...document, coreModelVersion: 1.5 }),
      'invalid_integer',
    );
    expectAppearanceError(
      () => validateAppearanceDocumentV1({ ...document, coreModelVersion: '1' }),
      'invalid_integer',
    );
  });
});

function appendRecord(envelope: Uint8Array, record: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(envelope.length + record.length);
  bytes.set(envelope, 0);
  bytes.set(record, envelope.length);
  const totalLength = bytes.length;
  bytes[4] = totalLength >> 8;
  bytes[5] = totalLength & 0xff;
  const recordCount = ((envelope[6] << 8) | envelope[7]) + 1;
  bytes[6] = recordCount >> 8;
  bytes[7] = recordCount & 0xff;
  return bytes;
}

function buildEnvelope(records: readonly Uint8Array[]): Uint8Array {
  const totalLength = 8 + records.reduce((sum, record) => sum + record.length, 0);
  const bytes = new Uint8Array(totalLength);
  bytes[0] = 0x50;
  bytes[1] = 0x41;
  bytes[2] = 1;
  bytes[3] = 0;
  bytes[4] = totalLength >> 8;
  bytes[5] = totalLength & 0xff;
  bytes[6] = records.length >> 8;
  bytes[7] = records.length & 0xff;
  let offset = 8;
  for (const record of records) {
    bytes.set(record, offset);
    offset += record.length;
  }
  return bytes;
}
