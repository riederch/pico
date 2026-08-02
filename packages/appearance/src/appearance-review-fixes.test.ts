import { describe, expect, it } from 'vitest';
import {
  assertAppearanceDocumentRenderableV1,
  createAppearanceDocumentV1,
  validateAppearanceDocumentV1,
} from './appearance-document-v1-validation.js';
import {
  decodeAppearanceDocumentV1,
  encodeAppearanceDocumentV1,
  parseAppearanceDocumentV1,
} from './appearance-document-v1-codec.js';
import { parseAppearanceProfileV1 } from './appearance-profile-v1-codec.js';
import { projectAppearanceProfileV1ToCompatibilityCoreV1 } from './compatibility-projection-v1.js';
import { deriveCompatibilityClothingV1 } from './custom-asset-reference-v1.js';
import {
  createPicoAppearanceCacheKeyV1,
  createPicoAppearanceDocumentCacheKeyV1,
} from './appearance-cache-key-v1.js';
import type { PicoCustomAppearanceAssetReferenceV1 } from './custom-asset-reference-v1.js';
import {
  antennaProfile,
  bytesToHex,
  expectAppearanceError,
  hairProfile,
} from './test-fixtures.js';

const clothingAsset: PicoCustomAppearanceAssetReferenceV1 = {
  customAssetSchemaVersion: 1,
  kind: 'custom_clothing',
  sha256: Uint8Array.from({ length: 32 }, (_, index) => index),
  mediaType: 'image/png',
  fallback: { clothingFamily: 'workwear', primaryHue: 30, secondaryHue: 200 },
};

const secondClothingAsset: PicoCustomAppearanceAssetReferenceV1 = {
  ...clothingAsset,
  sha256: Uint8Array.from({ length: 32 }, (_, index) => 255 - index),
  fallback: { clothingFamily: 'formal', primaryHue: 10, secondaryHue: 20 },
};

function splitRecords(envelope: Uint8Array): Uint8Array[] {
  const records: Uint8Array[] = [];
  let offset = 8;
  while (offset < envelope.length) {
    const payloadLength = (envelope[offset + 4] << 8) | envelope[offset + 5];
    records.push(Uint8Array.from(envelope.subarray(offset, offset + 6 + payloadLength)));
    offset += 6 + payloadLength;
  }
  return records;
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

describe('custom-asset fallback in the compatibility core (review blocker 3.1)', () => {
  it('derives the core clothing block from the custom clothing reference', () => {
    const core = projectAppearanceProfileV1ToCompatibilityCoreV1(antennaProfile, [clothingAsset]);
    expect(core.clothing).toEqual({
      kind: 'custom_fallback',
      family: 'workwear',
      primaryHue: 30,
      secondaryHue: 200,
    });
  });

  it('keeps clothing none without a custom clothing reference', () => {
    expect(deriveCompatibilityClothingV1([])).toEqual({
      kind: 'none', family: 'none', primaryHue: 0, secondaryHue: 0,
    });
  });

  it('creates documents whose core carries the clothing fallback and round-trips them', () => {
    const document = createAppearanceDocumentV1(hairProfile, { customAssets: [clothingAsset] });
    expect(document.compatibilityCore.clothing.kind).toBe('custom_fallback');
    expect(document.compatibilityCore.clothing.family).toBe('workwear');
    const bytes = encodeAppearanceDocumentV1(document);
    const decoded = decodeAppearanceDocumentV1(bytes);
    expect(decoded.compatibilityCore.clothing.family).toBe('workwear');
    expect(bytesToHex(encodeAppearanceDocumentV1(decoded))).toBe(bytesToHex(bytes));
  });

  it('refuses more than one custom clothing reference in V1', () => {
    expectAppearanceError(
      () => createAppearanceDocumentV1(antennaProfile, { customAssets: [clothingAsset, secondClothingAsset] }),
      'invalid_custom_asset_reference',
    );
    expectAppearanceError(
      () => projectAppearanceProfileV1ToCompatibilityCoreV1(antennaProfile, [clothingAsset, secondClothingAsset]),
      'invalid_custom_asset_reference',
    );
  });

  it('rejects a core that claims a clothing fallback without a custom asset', () => {
    const document = createAppearanceDocumentV1(antennaProfile, { customAssets: [clothingAsset] });
    const [coreRecord, profileRecord] = splitRecords(encodeAppearanceDocumentV1(document));
    expectAppearanceError(
      () => decodeAppearanceDocumentV1(buildEnvelope([coreRecord, profileRecord])),
      'compatibility_core_mismatch',
    );
  });

  it('rejects a core without the fallback although a custom asset is present', () => {
    const plain = createAppearanceDocumentV1(antennaProfile);
    const withAsset = createAppearanceDocumentV1(antennaProfile, { customAssets: [clothingAsset] });
    const [plainCore] = splitRecords(encodeAppearanceDocumentV1(plain));
    const [, profileRecord, assetRecord] = splitRecords(encodeAppearanceDocumentV1(withAsset));
    expectAppearanceError(
      () => decodeAppearanceDocumentV1(buildEnvelope([plainCore, profileRecord, assetRecord])),
      'compatibility_core_mismatch',
    );
  });

  it('accepts the embedded clothing fallback when an unknown asset record version was skipped', () => {
    const document = createAppearanceDocumentV1(antennaProfile, { customAssets: [clothingAsset] });
    const [coreRecord, profileRecord, assetRecord] = splitRecords(encodeAppearanceDocumentV1(document));
    const futureAssetRecord = Uint8Array.from(assetRecord);
    futureAssetRecord[2] = 0x00;
    futureAssetRecord[3] = 0x02;
    const decoded = decodeAppearanceDocumentV1(buildEnvelope([coreRecord, profileRecord, futureAssetRecord]));
    expect(decoded.customAssets).toHaveLength(0);
    expect(decoded.compatibilityCore.clothing.kind).toBe('custom_fallback');
    // A partially understood document is not canonically re-emittable:
    // strict validation refuses the clothing claim its visible content
    // cannot support. Forward the original bytes instead.
    expectAppearanceError(() => encodeAppearanceDocumentV1(decoded), 'compatibility_core_mismatch');
    expectAppearanceError(() => validateAppearanceDocumentV1(decoded), 'compatibility_core_mismatch');
  });
});

describe('base64url pre-decode limits (review 4.1)', () => {
  it('rejects oversized document text before decoding', () => {
    expectAppearanceError(() => parseAppearanceDocumentV1(`pad1_${'A'.repeat(8192)}`), 'size_limit_exceeded');
  });

  it('rejects oversized profile text before decoding', () => {
    expectAppearanceError(() => parseAppearanceProfileV1(`pa1_${'A'.repeat(128)}`), 'size_limit_exceeded');
  });
});

describe('critical extension renderability (review 4.2)', () => {
  const criticalExtension = {
    namespace: 'example.fork',
    name: 'crystal-head-module',
    version: 1,
    critical: true,
    payload: Uint8Array.from([1]),
  };

  it('refuses a full rendering with an unsupported critical extension', () => {
    const document = createAppearanceDocumentV1(antennaProfile, { extensions: [criticalExtension] });
    expectAppearanceError(() => assertAppearanceDocumentRenderableV1(document), 'unsupported_critical_record');
    expectAppearanceError(
      () => assertAppearanceDocumentRenderableV1(document, {
        supportedExtensions: [{ namespace: 'example.fork', name: 'crystal-head-module', versions: [2] }],
      }),
      'unsupported_critical_record',
    );
  });

  it('accepts supported critical and any optional extensions', () => {
    const document = createAppearanceDocumentV1(antennaProfile, {
      extensions: [criticalExtension, { ...criticalExtension, name: 'optional-extra', critical: false }],
    });
    expect(() => assertAppearanceDocumentRenderableV1(document, {
      supportedExtensions: [{ namespace: 'example.fork', name: 'crystal-head-module', versions: [1] }],
    })).not.toThrow();
    const optionalOnly = createAppearanceDocumentV1(antennaProfile, {
      extensions: [{ ...criticalExtension, critical: false }],
    });
    expect(() => assertAppearanceDocumentRenderableV1(optionalOnly)).not.toThrow();
  });
});

describe('document cache key (review 4.4)', () => {
  it('separates documents that share a profile but differ in assets or core model pin', () => {
    const plain = createAppearanceDocumentV1(antennaProfile);
    const withAsset = createAppearanceDocumentV1(antennaProfile, { customAssets: [clothingAsset] });
    const pinned = createAppearanceDocumentV1(antennaProfile, { coreModelVersion: 3 });
    const keys = [plain, withAsset, pinned].map((document) =>
      createPicoAppearanceDocumentCacheKeyV1(document, 'renderer-1.0.0', 'lod1'));
    expect(new Set(keys).size).toBe(3);
    const profileKey = createPicoAppearanceCacheKeyV1(antennaProfile, 'renderer-1.0.0', 'lod1');
    expect(profileKey.startsWith('pico-appearance:pa1:')).toBe(true);
    for (const key of keys) {
      expect(key.startsWith('pico-appearance:pad1:')).toBe(true);
      expect(key.split(':')).toHaveLength(5);
    }
  });

  it('validates renderer version and lod for the document key', () => {
    const document = createAppearanceDocumentV1(antennaProfile);
    expectAppearanceError(
      () => createPicoAppearanceDocumentCacheKeyV1(document, 'A:B', 'lod0'),
      'invalid_shape',
    );
  });
});
