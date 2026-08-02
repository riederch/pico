import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createPicoAppearanceCacheKeyV1,
  decodeAppearanceDocumentV1,
  decodeAppearanceProfileV1,
  encodeAppearanceDocumentV1,
  encodeAppearanceProfileV1,
  encodeCompatibilityCoreV1,
  formatAppearanceDocumentV1,
  formatAppearanceProfileV1,
  parseAppearanceDocumentV1,
  parseAppearanceProfileV1,
  projectAppearanceProfileV1ToCompatibilityCoreV1,
  compatibilityProjectionV1Thresholds,
  picoSemanticHeadFamiliesV1,
  validateAppearanceDocumentV1,
  validateAppearanceProfileV1,
  validateOfficialAppearanceGeneratorRegistryV1,
  picoAppearanceErrorCodes,
} from './index.js';
import { bytesToHex, expectAppearanceError, hexToBytes } from './test-fixtures.js';

const repoRootPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const governancePath = 'docs/design-system/07_Governance/parametric-appearance-v1-vectors.json';
const registryPath = 'docs/design-system/07_Governance/official-appearance-generators.json';
const fixtureSuitePath = 'docs/protocol/fixtures/appearance-document/v1/suite.json';

function readRepoJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(repoRootPath, path), 'utf8')) as Record<string, unknown>;
}

interface ProfileVector {
  name: string;
  profile: unknown;
  byteLength: number;
  bytesHex: string;
  text: string;
  cacheKeyFragment: string;
  compatibilityCore: unknown;
  compatibilityCoreHex: string;
}

interface InvalidProfileVector {
  name: string;
  kind: 'bytes' | 'json';
  bytesHex?: string;
  profile?: unknown;
  expectedErrorCode: string;
}

interface DocumentPositive {
  name: string;
  inputHex?: string;
  canonicalHex?: string;
  text?: string;
  partialUnderstanding?: boolean;
}

interface CustomAssetFallbackVector {
  name: string;
  profile: unknown;
  customAssets: {
    customAssetSchemaVersion: number;
    kind: string;
    sha256Hex: string;
    mediaType: string;
    fallback: { clothingFamily: string; primaryHue: number; secondaryHue: number };
  }[];
  compatibilityCore: unknown;
  compatibilityCoreHex: string;
}

interface DocumentNegative {
  name: string;
  kind?: 'json';
  bytesHex?: string;
  text?: string;
  construction?: { type: string; length: number };
  expectedErrorCode: string;
}

describe('governance golden vectors', () => {
  const suite = readRepoJson(governancePath);
  const profileVectors = suite.profileVectors as ProfileVector[];
  const invalidProfileVectors = suite.invalidProfileVectors as InvalidProfileVector[];

  it('pins the projection thresholds', () => {
    expect(suite.projectionThresholds).toEqual(compatibilityProjectionV1Thresholds);
  });

  it('freezes every profile vector: bytes, text, cache key and projection', () => {
    expect(profileVectors.length).toBeGreaterThanOrEqual(19);
    for (const vector of profileVectors) {
      const profile = validateAppearanceProfileV1(vector.profile);
      const bytes = encodeAppearanceProfileV1(profile);
      expect(bytes.length, vector.name).toBe(vector.byteLength);
      expect(bytesToHex(bytes), vector.name).toBe(vector.bytesHex);
      expect(formatAppearanceProfileV1(profile), vector.name).toBe(vector.text);
      expect(vector.text, vector.name).toBe(`pa1_${vector.cacheKeyFragment}`);
      expect(
        createPicoAppearanceCacheKeyV1(profile, 'renderer-0.0.0', 'lod0'),
        vector.name,
      ).toBe(`pico-appearance:pa1:${vector.cacheKeyFragment}:renderer-0.0.0:lod0`);
      const decoded = decodeAppearanceProfileV1(hexToBytes(vector.bytesHex));
      expect(bytesToHex(encodeAppearanceProfileV1(decoded)), vector.name).toBe(vector.bytesHex);
      expect(parseAppearanceProfileV1(vector.text), vector.name).toEqual(profile);
      const core = projectAppearanceProfileV1ToCompatibilityCoreV1(profile);
      expect(core, vector.name).toEqual(vector.compatibilityCore);
      expect(bytesToHex(encodeCompatibilityCoreV1(core)), vector.name).toBe(vector.compatibilityCoreHex);
    }
  });

  it('covers every reachable semantic head family', () => {
    const covered = new Set(
      profileVectors.map((vector) => (vector.compatibilityCore as { head: { family: string } }).head.family),
    );
    for (const family of picoSemanticHeadFamiliesV1) {
      if (family === 'custom_fallback') {
        expect(covered.has(family)).toBe(false);
        continue;
      }
      expect(covered.has(family), family).toBe(true);
    }
  });

  it('freezes the custom-asset clothing fallback derivation', () => {
    const vectors = suite.customAssetFallbackVectors as CustomAssetFallbackVector[];
    expect(vectors.length).toBeGreaterThanOrEqual(1);
    for (const vector of vectors) {
      const assets = vector.customAssets.map((asset) => ({
        customAssetSchemaVersion: asset.customAssetSchemaVersion,
        kind: asset.kind,
        sha256: hexToBytes(asset.sha256Hex),
        mediaType: asset.mediaType,
        fallback: asset.fallback,
      }));
      const core = projectAppearanceProfileV1ToCompatibilityCoreV1(
        validateAppearanceProfileV1(vector.profile),
        assets as never,
      );
      expect(core, vector.name).toEqual(vector.compatibilityCore);
      expect(bytesToHex(encodeCompatibilityCoreV1(core)), vector.name).toBe(vector.compatibilityCoreHex);
      expect(core.clothing.kind, vector.name).toBe('custom_fallback');
    }
  });

  it('rejects every invalid vector with its pinned error code', () => {
    expect(invalidProfileVectors.length).toBeGreaterThanOrEqual(20);
    for (const vector of invalidProfileVectors) {
      if (vector.kind === 'bytes') {
        expectAppearanceError(
          () => decodeAppearanceProfileV1(hexToBytes(vector.bytesHex as string)),
          vector.expectedErrorCode,
        );
      } else {
        expectAppearanceError(
          () => validateAppearanceProfileV1(vector.profile),
          vector.expectedErrorCode,
        );
      }
    }
  });
});

describe('official appearance generator registry', () => {
  const registry = validateOfficialAppearanceGeneratorRegistryV1(readRepoJson(registryPath));

  it('lists the proposed head generator without claiming a character approval', () => {
    expect(registry.generators).toHaveLength(1);
    const generator = registry.generators[0];
    expect(generator.generatorId).toBe('pico.appearance.head-generator');
    expect(generator.generatorVersion).toBe(2);
    expect(generator.status).toBe('proposed');
    expect(generator.firstReleaseVersion).toBeNull();
    expect(generator.supportStatus).toBe('pre_release');
    expect(generator.fallbackProjectionVersion).toBe(1);
  });

  it('pins the normative vector file by SHA-256', () => {
    const generator = registry.generators[0];
    expect(generator.testVectorPath).toBe(governancePath);
    const actual = createHash('sha256')
      .update(readFileSync(resolve(repoRootPath, generator.testVectorPath)))
      .digest('hex');
    expect(generator.normativeSha256Hex).toBe(actual);
  });

  it('points at existing spec and parameter-domain documents', () => {
    const generator = registry.generators[0];
    expect(readFileSync(resolve(repoRootPath, generator.specPath), 'utf8').length).toBeGreaterThan(0);
    expect(readFileSync(resolve(repoRootPath, generator.parameterDomain), 'utf8').length).toBeGreaterThan(0);
  });
});

describe('appearance document fixture suite', () => {
  const suite = readRepoJson(fixtureSuitePath);
  const positives = suite.positive as DocumentPositive[];
  const negatives = suite.negative as DocumentNegative[];

  it('is referenced by the fixtures README and conformance layout', () => {
    expect(readFileSync(resolve(repoRootPath, 'docs/protocol/fixtures/README.md'), 'utf8'))
      .toContain('appearance-document/v1/suite.json');
    expect(readFileSync(resolve(repoRootPath, 'docs/protocol/conformance-fixtures.md'), 'utf8'))
      .toContain('appearance-document/v1/suite.json');
  });

  it('decodes every positive fixture to its canonical bytes and text', () => {
    expect(positives.length).toBeGreaterThanOrEqual(9);
    for (const fixture of positives) {
      if (fixture.partialUnderstanding) {
        // A partially understood document decodes and renders from the core,
        // but must not be canonically re-emittable.
        const document = decodeAppearanceDocumentV1(hexToBytes(fixture.inputHex as string));
        expect(document.compatibilityCore.clothing.kind, fixture.name).toBe('custom_fallback');
        expect(document.customAssets, fixture.name).toHaveLength(0);
        expectAppearanceError(() => encodeAppearanceDocumentV1(document), 'compatibility_core_mismatch');
        continue;
      }
      const canonicalHex = fixture.canonicalHex as string;
      const input = hexToBytes(fixture.inputHex ?? canonicalHex);
      const document = decodeAppearanceDocumentV1(input);
      expect(bytesToHex(encodeAppearanceDocumentV1(document)), fixture.name).toBe(canonicalHex);
      if (fixture.text !== undefined) {
        expect(formatAppearanceDocumentV1(document), fixture.name).toBe(fixture.text);
        expect(
          bytesToHex(encodeAppearanceDocumentV1(parseAppearanceDocumentV1(fixture.text))),
          fixture.name,
        ).toBe(canonicalHex);
      }
    }
  });

  it('rejects every negative fixture with its pinned error code', () => {
    expect(negatives.length).toBeGreaterThanOrEqual(22);
    const canonical = positives[0].canonicalHex as string;
    for (const fixture of negatives) {
      if (fixture.kind === 'json') {
        const document = decodeAppearanceDocumentV1(hexToBytes(canonical));
        const tampered = fixture.name === 'float-core-model-version'
          ? { ...document, coreModelVersion: 1.5 }
          : { ...document, coreModelVersion: '1' };
        expectAppearanceError(() => validateAppearanceDocumentV1(tampered), fixture.expectedErrorCode);
        continue;
      }
      if (fixture.text !== undefined) {
        expectAppearanceError(() => parseAppearanceDocumentV1(fixture.text as string), fixture.expectedErrorCode);
        continue;
      }
      const bytes = fixture.construction?.type === 'zero_filled'
        ? new Uint8Array(fixture.construction.length)
        : hexToBytes(fixture.bytesHex as string);
      expectAppearanceError(() => decodeAppearanceDocumentV1(bytes), fixture.expectedErrorCode);
    }
  });

  it('keeps every fixture inside the published error vocabulary', () => {
    const negativeCodes = new Set(negatives.map((fixture) => fixture.expectedErrorCode));
    for (const code of negativeCodes) {
      expect(picoAppearanceErrorCodes, code).toContain(code);
    }
  });
});
