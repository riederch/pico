import { describe, expect, it } from 'vitest';
import {
  appearanceProfileV1FieldRanges,
  type PicoAppearanceProfileV1,
} from './index.js';
import { validateAppearanceProfileV1 } from './index.js';
import { expectAppearanceError, hairProfile } from './test-fixtures.js';

/**
 * The published range table is the same authority the validator uses.
 *
 * A table nobody reads is decoration, and an input surface built from it would
 * then offer values validation rejects. So every field is driven to both of its
 * declared endpoints, which must be accepted, and one step past each, which
 * must be refused with the range error.
 */
type Group = 'recipeGeometry' | 'recipeMaterial' | 'surfaceShell' | 'surfaceFace' | 'surfaceTrim';

function withField(group: Group, field: string, value: number): PicoAppearanceProfileV1 {
  const recipe = (hairProfile.headIdentity as { recipe: NonNullable<unknown> }).recipe as {
    generatorVersion: 2;
    geometry: Record<string, number>;
    material: Record<string, number>;
  };
  const surface = hairProfile.surface as unknown as Record<string, Record<string, number> | number>;
  const geometry = { ...recipe.geometry };
  const material = { ...recipe.material };
  const shell = { ...(surface.shell as Record<string, number>) };
  const face = { ...(surface.face as Record<string, number>) };
  const trim = { ...(surface.trim as Record<string, number>) };
  const target = { recipeGeometry: geometry, recipeMaterial: material, surfaceShell: shell, surfaceFace: face, surfaceTrim: trim }[group];
  target[field] = value;
  return {
    profileVersion: 1,
    headIdentity: {
      kind: 'procedural_neon_hair',
      recipe: { generatorVersion: 2, geometry, material },
    },
    surface: { surfaceVersion: 1, shell, face, trim },
  } as PicoAppearanceProfileV1;
}

describe('published Profile V1 field ranges', () => {
  const groups = Object.entries(appearanceProfileV1FieldRanges) as Array<
    [Group, Record<string, { minimum: number; maximum: number }>]
  >;

  it('covers every field the validator accepts, and no other', () => {
    const listed = groups.flatMap(([group, fields]) => Object.keys(fields).map((field) => `${group}.${field}`));
    expect(listed).toHaveLength(14 + 3 + 4 + 4 + 3);
    expect(new Set(listed).size).toBe(listed.length);
  });

  for (const [group, fields] of groups) {
    for (const [field, range] of Object.entries(fields)) {
      it(`${group}.${field} accepts ${range.minimum} and ${range.maximum} and refuses one step past each`, () => {
        expect(() => validateAppearanceProfileV1(withField(group, field, range.minimum))).not.toThrow();
        expect(() => validateAppearanceProfileV1(withField(group, field, range.maximum))).not.toThrow();
        expectAppearanceError(
          () => validateAppearanceProfileV1(withField(group, field, range.minimum - 1)),
          'value_out_of_range',
        );
        expectAppearanceError(
          () => validateAppearanceProfileV1(withField(group, field, range.maximum + 1)),
          'value_out_of_range',
        );
      });
    }
  }
});
