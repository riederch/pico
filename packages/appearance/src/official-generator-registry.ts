import { PicoAppearanceError } from './appearance-errors.js';
import {
  requireArray,
  requireInteger,
  requirePlainObject,
  requireString,
} from './validation-primitives.js';

/**
 * Typed contract for the official appearance generator registry
 * (`docs/design-system/07_Governance/official-appearance-generators.json`,
 * ADR 0125 section on historical generators).
 *
 * The registry is machine-readable governance, not a character approval: a
 * generator stays `proposed` until an explicit character decision approves
 * it. A published, approved generator is immutable — a fix that changes
 * visible or canonical geometric output is a new generator version.
 */
export const picoAppearanceGeneratorStatuses = ['proposed', 'approved', 'deprecated', 'withdrawn'] as const;
export type PicoAppearanceGeneratorStatus = typeof picoAppearanceGeneratorStatuses[number];

export const picoAppearanceGeneratorSupportStatuses = ['pre_release', 'supported', 'legacy_supported'] as const;
export type PicoAppearanceGeneratorSupportStatus = typeof picoAppearanceGeneratorSupportStatuses[number];

export interface PicoOfficialAppearanceGeneratorEntryV1 {
  readonly generatorId: string;
  readonly generatorVersion: number;
  readonly appearanceProfileVersion: number;
  readonly requiredCoreModelVersion: number;
  readonly status: PicoAppearanceGeneratorStatus;
  readonly specPath: string;
  readonly testVectorPath: string;
  readonly normativeSha256Hex: string;
  readonly firstReleaseVersion: string | null;
  readonly supportStatus: PicoAppearanceGeneratorSupportStatus;
  readonly parameterDomain: string;
  readonly fallbackProjectionVersion: number;
}

export interface PicoOfficialAppearanceGeneratorRegistryV1 {
  readonly schemaVersion: 1;
  readonly generators: readonly PicoOfficialAppearanceGeneratorEntryV1[];
}

const generatorIdPattern = /^[a-z0-9][a-z0-9.-]{0,62}$/;
const sha256HexPattern = /^[0-9a-f]{64}$/;
const releaseVersionPattern = /^[0-9]+\.[0-9]+\.[0-9]+$/;

export function validateOfficialAppearanceGeneratorRegistryV1(
  input: unknown,
): PicoOfficialAppearanceGeneratorRegistryV1 {
  const root = requirePlainObject(input, 'registry', ['schemaVersion', 'generators']);
  if (root.schemaVersion !== 1) {
    throw new PicoAppearanceError('invalid_shape', 'registry.schemaVersion must be exactly 1');
  }
  const generators = requireArray(root.generators, 'registry.generators').map((entry, index) => {
    const record = requirePlainObject(entry, `registry.generators[${index}]`, [
      'generatorId', 'generatorVersion', 'appearanceProfileVersion', 'requiredCoreModelVersion',
      'status', 'specPath', 'testVectorPath', 'normativeSha256Hex', 'firstReleaseVersion',
      'supportStatus', 'parameterDomain', 'fallbackProjectionVersion',
    ]);
    if (typeof record.generatorId !== 'string' || !generatorIdPattern.test(record.generatorId)) {
      throw new PicoAppearanceError('invalid_namespace', `generators[${index}].generatorId must match [a-z0-9][a-z0-9.-]{0,62}`);
    }
    if (typeof record.normativeSha256Hex !== 'string' || !sha256HexPattern.test(record.normativeSha256Hex)) {
      throw new PicoAppearanceError('invalid_shape', `generators[${index}].normativeSha256Hex must be 64 lowercase hex characters`);
    }
    if (record.firstReleaseVersion !== null
      && (typeof record.firstReleaseVersion !== 'string' || !releaseVersionPattern.test(record.firstReleaseVersion))) {
      throw new PicoAppearanceError('invalid_shape', `generators[${index}].firstReleaseVersion must be null or a semantic version`);
    }
    if (typeof record.specPath !== 'string' || record.specPath.length === 0) {
      throw new PicoAppearanceError('invalid_shape', `generators[${index}].specPath must be a non-empty string`);
    }
    if (typeof record.testVectorPath !== 'string' || record.testVectorPath.length === 0) {
      throw new PicoAppearanceError('invalid_shape', `generators[${index}].testVectorPath must be a non-empty string`);
    }
    if (typeof record.parameterDomain !== 'string' || record.parameterDomain.length === 0) {
      throw new PicoAppearanceError('invalid_shape', `generators[${index}].parameterDomain must be a non-empty string`);
    }
    const validated: PicoOfficialAppearanceGeneratorEntryV1 = {
      generatorId: record.generatorId,
      generatorVersion: requireInteger(record.generatorVersion, `generators[${index}].generatorVersion`, 1, 0xffff),
      appearanceProfileVersion: requireInteger(record.appearanceProfileVersion, `generators[${index}].appearanceProfileVersion`, 1, 0xffff),
      requiredCoreModelVersion: requireInteger(record.requiredCoreModelVersion, `generators[${index}].requiredCoreModelVersion`, 0, 0xffff),
      status: requireString(record.status, `generators[${index}].status`, picoAppearanceGeneratorStatuses),
      specPath: record.specPath,
      testVectorPath: record.testVectorPath,
      normativeSha256Hex: record.normativeSha256Hex,
      firstReleaseVersion: record.firstReleaseVersion,
      supportStatus: requireString(record.supportStatus, `generators[${index}].supportStatus`, picoAppearanceGeneratorSupportStatuses),
      parameterDomain: record.parameterDomain,
      fallbackProjectionVersion: requireInteger(record.fallbackProjectionVersion, `generators[${index}].fallbackProjectionVersion`, 1, 0xffff),
    };
    return Object.freeze(validated);
  });
  const seen = new Set<string>();
  for (const generator of generators) {
    const key = `${generator.generatorId}@${generator.generatorVersion}`;
    if (seen.has(key)) {
      throw new PicoAppearanceError('invalid_shape', `registry lists ${key} twice; generator versions are immutable and unique`);
    }
    seen.add(key);
  }
  return Object.freeze({ schemaVersion: 1, generators: Object.freeze(generators) });
}
