import { describe, expect, it } from 'vitest';
import {
  isPicoNamespacedCapabilityName,
  picoAppearanceCapabilities,
  picoAppearanceCompatibilitySurface,
  picoAppearanceConformanceLevels,
  validatePicoAppearanceCompatibilityClaimV1,
  protocolCapabilities,
} from './index.js';

const validClaim = {
  surface: 'pico.appearance',
  appearanceEnvelopeVersions: [1],
  compatibilityCoreVersions: [1],
  profileVersions: [{ familyId: 1, version: 1 }],
  generatorVersions: [{ generatorId: 'pico.appearance.head-generator', version: 2 }],
  conformanceLevel: 'experimental',
};

describe('appearance capability contract', () => {
  it('publishes the exact capability names', () => {
    expect(picoAppearanceCapabilities).toEqual({
      documentV1: 'pico.appearance.document.v1',
      compatibilityCoreV1: 'pico.appearance.compatibility-core.v1',
      parametricProfileV1: 'pico.appearance.profile.parametric.v1',
      headGeneratorV2: 'pico.appearance.head-generator.v2',
      customAssetReferenceV1: 'pico.appearance.custom-asset-reference.v1',
    });
    for (const name of Object.values(picoAppearanceCapabilities)) {
      expect(isPicoNamespacedCapabilityName(name)).toBe(true);
    }
  });

  it('does not advertise appearance capabilities as implemented runtime capabilities', () => {
    for (const name of Object.values(picoAppearanceCapabilities)) {
      expect(name in protocolCapabilities).toBe(false);
    }
  });

  it('accepts unknown namespaced fork capabilities as names without interpreting them', () => {
    expect(isPicoNamespacedCapabilityName('example.fork.crystal-head-module.v1')).toBe(true);
    expect(isPicoNamespacedCapabilityName('example_fork.custom_visuals.v1')).toBe(true);
    expect(isPicoNamespacedCapabilityName('NotLowercase.v1')).toBe(false);
    expect(isPicoNamespacedCapabilityName('nodotname')).toBe(false);
    expect(isPicoNamespacedCapabilityName(42)).toBe(false);
  });
});

describe('appearance compatibility claim v1', () => {
  it('accepts a precise claim and freezes it', () => {
    const claim = validatePicoAppearanceCompatibilityClaimV1(structuredClone(validClaim));
    expect(claim.surface).toBe(picoAppearanceCompatibilitySurface);
    expect(Object.isFrozen(claim)).toBe(true);
    expect(claim.generatorVersions[0].generatorId).toBe('pico.appearance.head-generator');
  });

  it('rejects a claim without concrete surface versions', () => {
    expect(() => validatePicoAppearanceCompatibilityClaimV1({
      ...structuredClone(validClaim),
      appearanceEnvelopeVersions: [],
    })).toThrow(/at least one envelope/);
  });

  it('rejects blanket or malformed claims', () => {
    expect(() => validatePicoAppearanceCompatibilityClaimV1({
      ...structuredClone(validClaim),
      surface: 'pico',
    })).toThrow(/surface/);
    expect(() => validatePicoAppearanceCompatibilityClaimV1({
      ...structuredClone(validClaim),
      fullyCompatible: true,
    })).toThrow(/unknown key/);
    expect(() => validatePicoAppearanceCompatibilityClaimV1({
      ...structuredClone(validClaim),
      conformanceLevel: 'certified',
    })).toThrow(/conformanceLevel/);
    expect(() => validatePicoAppearanceCompatibilityClaimV1({
      ...structuredClone(validClaim),
      appearanceEnvelopeVersions: [1.5],
    })).toThrow(/integer/);
    expect(() => validatePicoAppearanceCompatibilityClaimV1({
      ...structuredClone(validClaim),
      generatorVersions: [{ generatorId: 'Not-Allowed', version: 1 }],
    })).toThrow(/generatorId/);
  });

  it('keeps the closed conformance level vocabulary', () => {
    expect(picoAppearanceConformanceLevels).toEqual(['experimental', 'tested', 'official']);
  });
});
