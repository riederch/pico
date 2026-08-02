/**
 * Appearance compatibility surface: capability names and claim contracts
 * (ADR 0025, ADR 0125).
 *
 * These are name and type contracts only. Nothing here is advertised by the
 * current runtime (`protocolCapabilities` stays unchanged), nothing is
 * synchronized over Pico Link, and no certification logic exists. The
 * appearance envelope carries its own version axis inside `@pico/appearance`
 * and is deliberately not coupled to `picoProtocolVersion`.
 *
 * Appearance, compatibility level or visual similarity is never an identity,
 * trust, policy or authorization statement.
 */

/** Claim surface name for appearance compatibility claims. */
export const picoAppearanceCompatibilitySurface = 'pico.appearance' as const;

/**
 * Published appearance capability names. The head generator name exists so
 * capability negotiation has a stable spelling; no head generator is
 * character-approved or implemented today.
 */
export const picoAppearanceCapabilities = {
  documentV1: 'pico.appearance.document.v1',
  compatibilityCoreV1: 'pico.appearance.compatibility-core.v1',
  parametricProfileV1: 'pico.appearance.profile.parametric.v1',
  headGeneratorV2: 'pico.appearance.head-generator.v2',
  customAssetReferenceV1: 'pico.appearance.custom-asset-reference.v1',
} as const;

export type PicoAppearanceCapabilityName =
  typeof picoAppearanceCapabilities[keyof typeof picoAppearanceCapabilities];

/**
 * Namespaced capability name shape: lowercase, dot-namespaced, versioned by
 * convention. Unknown namespaced capabilities must be preserved or safely
 * ignored by compatible implementations — they never reinterpret core
 * semantics and are never an error by themselves.
 */
export const picoNamespacedCapabilityNamePattern = /^[a-z0-9][a-z0-9_.-]{0,126}$/;

export function isPicoNamespacedCapabilityName(value: unknown): value is string {
  return typeof value === 'string'
    && picoNamespacedCapabilityNamePattern.test(value)
    && value.includes('.');
}

export const picoAppearanceConformanceLevels = ['experimental', 'tested', 'official'] as const;
export type PicoAppearanceConformanceLevel = typeof picoAppearanceConformanceLevels[number];

/**
 * An appearance compatibility claim names concrete surfaces and versions.
 * There is deliberately no blanket `isPicoCompatible()` boolean: a claim
 * without exact envelope, core, profile and generator versions is not a
 * claim. `official` remains bound to explicit recognition by the designated
 * Pico rights holder (compatibility levels L0-L5 continue to apply to the
 * trust grade of the claim itself).
 */
export interface PicoAppearanceCompatibilityClaimV1 {
  readonly surface: 'pico.appearance';
  readonly appearanceEnvelopeVersions: readonly number[];
  readonly compatibilityCoreVersions: readonly number[];
  readonly profileVersions: readonly Readonly<{
    readonly familyId: number;
    readonly version: number;
  }>[];
  readonly generatorVersions: readonly Readonly<{
    readonly generatorId: string;
    readonly version: number;
  }>[];
  readonly conformanceLevel: PicoAppearanceConformanceLevel;
}

const generatorIdPattern = /^[a-z0-9][a-z0-9.-]{0,62}$/;

/**
 * Strict structural validation of an appearance compatibility claim. It
 * validates shape and honesty constraints (non-empty exact versions, precise
 * generator ids); it does not certify that the claim is true — that remains
 * conformance testing and, for `official`, rights-holder recognition.
 */
export function validatePicoAppearanceCompatibilityClaimV1(
  input: unknown,
): PicoAppearanceCompatibilityClaimV1 {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('appearance compatibility claim must be an object');
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('appearance compatibility claim must be a plain object');
  }
  const record = input as Record<string, unknown>;
  const allowedKeys = [
    'surface',
    'appearanceEnvelopeVersions',
    'compatibilityCoreVersions',
    'profileVersions',
    'generatorVersions',
    'conformanceLevel',
  ];
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`appearance compatibility claim has unknown key ${JSON.stringify(key)}`);
    }
  }
  for (const key of allowedKeys) {
    if (!(key in record)) {
      throw new Error(`appearance compatibility claim is missing key ${JSON.stringify(key)}`);
    }
  }
  if (record.surface !== picoAppearanceCompatibilitySurface) {
    throw new Error(`appearance compatibility claim surface must be ${picoAppearanceCompatibilitySurface}`);
  }
  if (!picoAppearanceConformanceLevels.includes(record.conformanceLevel as PicoAppearanceConformanceLevel)) {
    throw new Error('appearance compatibility claim conformanceLevel must be experimental, tested or official');
  }
  const appearanceEnvelopeVersions = requireVersionList(record.appearanceEnvelopeVersions, 'appearanceEnvelopeVersions');
  const compatibilityCoreVersions = requireVersionList(record.compatibilityCoreVersions, 'compatibilityCoreVersions');
  if (!Array.isArray(record.profileVersions)) {
    throw new Error('appearance compatibility claim profileVersions must be an array');
  }
  const profileVersions = record.profileVersions.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`profileVersions[${index}] must be an object`);
    }
    const value = entry as Record<string, unknown>;
    return Object.freeze({
      familyId: requireVersion(value.familyId, `profileVersions[${index}].familyId`),
      version: requireVersion(value.version, `profileVersions[${index}].version`),
    });
  });
  if (!Array.isArray(record.generatorVersions)) {
    throw new Error('appearance compatibility claim generatorVersions must be an array');
  }
  const generatorVersions = record.generatorVersions.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`generatorVersions[${index}] must be an object`);
    }
    const value = entry as Record<string, unknown>;
    if (typeof value.generatorId !== 'string' || !generatorIdPattern.test(value.generatorId)) {
      throw new Error(`generatorVersions[${index}].generatorId must match [a-z0-9][a-z0-9.-]{0,62}`);
    }
    return Object.freeze({
      generatorId: value.generatorId,
      version: requireVersion(value.version, `generatorVersions[${index}].version`),
    });
  });
  if (appearanceEnvelopeVersions.length === 0 || compatibilityCoreVersions.length === 0) {
    throw new Error('an appearance compatibility claim must name at least one envelope and one compatibility core version');
  }
  return Object.freeze({
    surface: picoAppearanceCompatibilitySurface,
    appearanceEnvelopeVersions: Object.freeze(appearanceEnvelopeVersions),
    compatibilityCoreVersions: Object.freeze(compatibilityCoreVersions),
    profileVersions: Object.freeze(profileVersions),
    generatorVersions: Object.freeze(generatorVersions),
    conformanceLevel: record.conformanceLevel as PicoAppearanceConformanceLevel,
  });
}

function requireVersionList(value: unknown, label: string): number[] {
  if (!Array.isArray(value)) {
    throw new Error(`appearance compatibility claim ${label} must be an array`);
  }
  return value.map((entry, index) => requireVersion(entry, `${label}[${index}]`));
}

function requireVersion(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 0xffff) {
    throw new Error(`appearance compatibility claim ${label} must be an integer between 1 and 65535`);
  }
  return value;
}
