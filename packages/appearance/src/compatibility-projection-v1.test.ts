import { describe, expect, it } from 'vitest';
import {
  compatibilityProjectionV1Thresholds,
  deriveSemanticHeadFamilyV1,
  projectAppearanceProfileV1ToCompatibilityCoreV1,
} from './compatibility-projection-v1.js';
import type { PicoAppearanceProfileV1, ProceduralHeadRecipeV2 } from './appearance-profile-v1.js';
import { antennaProfile, hairProfile } from './test-fixtures.js';

function hairProfileWith(geometry: Partial<ProceduralHeadRecipeV2['geometry']>): PicoAppearanceProfileV1 {
  const base = hairProfile.headIdentity as { kind: 'procedural_neon_hair'; recipe: ProceduralHeadRecipeV2 };
  return {
    ...hairProfile,
    headIdentity: {
      kind: 'procedural_neon_hair',
      recipe: {
        ...base.recipe,
        geometry: { ...base.recipe.geometry, ...geometry },
      },
    },
  };
}

describe('compatibility projection v1', () => {
  it('projects the standard antenna to the stable antenna family with zeroed module values', () => {
    const core = projectAppearanceProfileV1ToCompatibilityCoreV1(antennaProfile);
    expect(core.head).toEqual({
      kind: 'standard_antenna',
      family: 'standard_antenna',
      primaryHue: 0,
      length: 0,
      volume: 0,
      parting: 0,
    });
    expect(core.shell).toEqual({ hue: 210, chroma: 18, lightness: 224 });
    expect(core.face).toEqual({ hue: 220, blackLevel: 52 });
    expect(core.trim).toEqual({ hue: 215, chroma: 36 });
    expect(core.clothing).toEqual({ kind: 'none', family: 'none', primaryHue: 0, secondaryHue: 0 });
  });

  it('is deterministic', () => {
    const first = projectAppearanceProfileV1ToCompatibilityCoreV1(hairProfile);
    const second = projectAppearanceProfileV1ToCompatibilityCoreV1(hairProfile);
    expect(first).toEqual(second);
  });

  it('derives module values with integer-only arithmetic', () => {
    const core = projectAppearanceProfileV1ToCompatibilityCoreV1(hairProfile);
    expect(core.head.kind).toBe('semantic_head_module');
    expect(core.head.primaryHue).toBe(198);
    expect(core.head.length).toBe(54);
    expect(core.head.volume).toBe(Math.floor((118 + 126) / 2));
    expect(core.head.parting).toBe(0);
  });

  it('keeps parting at zero while no part seam exists', () => {
    const seamless = projectAppearanceProfileV1ToCompatibilityCoreV1(
      hairProfileWith({ partDepth: 0, partOffset: -34 }),
    );
    expect(seamless.head.parting).toBe(0);
    const seamed = projectAppearanceProfileV1ToCompatibilityCoreV1(
      hairProfileWith({ partDepth: 82, partOffset: -34 }),
    );
    expect(seamed.head.parting).toBe(-34);
  });

  it('reaches every published module family through the fixed thresholds', () => {
    expect(deriveSemanticHeadFamilyV1({ side: 56, length: 54, lift: 174, sweep: 12, segments: 4 })).toBe('asymmetric');
    expect(deriveSemanticHeadFamilyV1({ side: 0, length: 230, lift: 188, sweep: 110, segments: 8 })).toBe('rear_ribbon');
    expect(deriveSemanticHeadFamilyV1({ side: 0, length: 230, lift: 188, sweep: 20, segments: 8 })).toBe('long_segmented');
    expect(deriveSemanticHeadFamilyV1({ side: 24, length: 54, lift: 40, sweep: 12, segments: 4 })).toBe('side_swept');
    expect(deriveSemanticHeadFamilyV1({ side: 0, length: 54, lift: 174, sweep: 12, segments: 4 })).toBe('top_structured');
    expect(deriveSemanticHeadFamilyV1({ side: 0, length: 120, lift: 40, sweep: 12, segments: 4 })).toBe('short_segmented');
    expect(deriveSemanticHeadFamilyV1({ side: 0, length: 54, lift: 40, sweep: 12, segments: 6 })).toBe('short_segmented');
    expect(deriveSemanticHeadFamilyV1({ side: 0, length: 54, lift: 40, sweep: 12, segments: 4 })).toBe('short_cap');
  });

  it('holds the exact published threshold boundaries', () => {
    const thresholds = compatibilityProjectionV1Thresholds;
    expect(deriveSemanticHeadFamilyV1({
      side: thresholds.asymmetricMinimumAbsoluteSide - 1, length: 0, lift: 0, sweep: 0, segments: 3,
    })).not.toBe('asymmetric');
    expect(deriveSemanticHeadFamilyV1({
      side: -thresholds.asymmetricMinimumAbsoluteSide, length: 0, lift: 0, sweep: 0, segments: 3,
    })).toBe('asymmetric');
    expect(deriveSemanticHeadFamilyV1({
      side: 0, length: thresholds.longMinimumLength - 1, lift: 0, sweep: 127, segments: 3,
    })).not.toBe('rear_ribbon');
    expect(deriveSemanticHeadFamilyV1({
      side: 0, length: thresholds.longMinimumLength, lift: 0, sweep: thresholds.rearRibbonMinimumSweep - 1, segments: 3,
    })).toBe('long_segmented');
    expect(deriveSemanticHeadFamilyV1({
      side: 0, length: 0, lift: thresholds.topStructuredMinimumLift, sweep: 0, segments: 3,
    })).toBe('top_structured');
  });

  it('never projects clothing other than none from profile v1', () => {
    for (const profile of [antennaProfile, hairProfile]) {
      const core = projectAppearanceProfileV1ToCompatibilityCoreV1(profile);
      expect(core.clothing.kind).toBe('none');
      expect(core.clothing.family).toBe('none');
    }
  });
});
