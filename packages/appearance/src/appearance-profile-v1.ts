/**
 * Parametric Appearance Profile V1 (ADR 0125, PAS brief).
 *
 * The profile is the full appearance identity: a small, versioned, purely
 * integer parameter set. It contains no status colour, no context equipment,
 * no image, texture or mesh data, and no free emission values. The head
 * identity is a closed union: standard antenna or exactly one procedural
 * neon head module, never both.
 */
export type PicoHeadIdentityV1 =
  | Readonly<{
      kind: 'standard_antenna';
    }>
  | Readonly<{
      kind: 'procedural_neon_hair';
      recipe: ProceduralHeadRecipeV2;
    }>;

export interface ProceduralHeadRecipeV2 {
  readonly generatorVersion: 2;

  readonly geometry: Readonly<{
    anchor: number;
    side: number;
    length: number;
    lift: number;
    sweep: number;
    curl: number;
    width: number;
    taper: number;
    twist: number;
    segments: number;

    partOffset: number;
    partDepth: number;
    crownBias: number;
    rootSpread: number;
  }>;

  readonly material: Readonly<{
    hue: number;
    chroma: number;
    translucency: number;
  }>;
}

export interface PicoSurfaceAppearanceV1 {
  readonly surfaceVersion: 1;

  readonly shell: Readonly<{
    hue: number;
    chroma: number;
    lightness: number;
    gloss: number;
  }>;

  readonly face: Readonly<{
    hue: number;
    tint: number;
    blackLevel: number;
    reflectivity: number;
  }>;

  readonly trim: Readonly<{
    hue: number;
    chroma: number;
    metalness: number;
  }>;
}

export interface PicoAppearanceProfileV1 {
  readonly profileVersion: 1;
  readonly headIdentity: PicoHeadIdentityV1;
  readonly surface: PicoSurfaceAppearanceV1;
}

/**
 * Inclusive integer range of every Profile V1 field, as data.
 *
 * The validator reads this table rather than repeating the numbers, so an
 * input surface that builds its fields from it cannot drift away from what
 * validation accepts. Widening or narrowing a range changes what an existing
 * profile means and is therefore a profile version change, not an edit.
 */
export const appearanceProfileV1FieldRanges = Object.freeze({
  recipeGeometry: Object.freeze({
    anchor: Object.freeze({ minimum: 0, maximum: 255 }),
    side: Object.freeze({ minimum: -96, maximum: 96 }),
    length: Object.freeze({ minimum: 0, maximum: 255 }),
    lift: Object.freeze({ minimum: 0, maximum: 255 }),
    sweep: Object.freeze({ minimum: -64, maximum: 127 }),
    curl: Object.freeze({ minimum: -127, maximum: 127 }),
    width: Object.freeze({ minimum: 0, maximum: 255 }),
    taper: Object.freeze({ minimum: 0, maximum: 255 }),
    twist: Object.freeze({ minimum: -127, maximum: 127 }),
    segments: Object.freeze({ minimum: 3, maximum: 9 }),
    partOffset: Object.freeze({ minimum: -96, maximum: 96 }),
    partDepth: Object.freeze({ minimum: 0, maximum: 192 }),
    crownBias: Object.freeze({ minimum: -96, maximum: 96 }),
    rootSpread: Object.freeze({ minimum: 48, maximum: 192 }),
  }),
  recipeMaterial: Object.freeze({
    hue: Object.freeze({ minimum: 0, maximum: 359 }),
    chroma: Object.freeze({ minimum: 0, maximum: 255 }),
    translucency: Object.freeze({ minimum: 0, maximum: 255 }),
  }),
  surfaceShell: Object.freeze({
    hue: Object.freeze({ minimum: 0, maximum: 359 }),
    chroma: Object.freeze({ minimum: 0, maximum: 255 }),
    lightness: Object.freeze({ minimum: 0, maximum: 255 }),
    gloss: Object.freeze({ minimum: 0, maximum: 255 }),
  }),
  surfaceFace: Object.freeze({
    hue: Object.freeze({ minimum: 0, maximum: 359 }),
    tint: Object.freeze({ minimum: 0, maximum: 255 }),
    blackLevel: Object.freeze({ minimum: 0, maximum: 255 }),
    reflectivity: Object.freeze({ minimum: 0, maximum: 255 }),
  }),
  surfaceTrim: Object.freeze({
    hue: Object.freeze({ minimum: 0, maximum: 359 }),
    chroma: Object.freeze({ minimum: 0, maximum: 255 }),
    metalness: Object.freeze({ minimum: 0, maximum: 255 }),
  }),
});

export type PicoAppearanceFieldRange = Readonly<{ minimum: number; maximum: number }>;

/** Byte lengths of the canonical profile payload (PAS brief section 12). */
export const appearanceProfileV1AntennaByteLength = 18;
export const appearanceProfileV1HeadModuleByteLength = 38;

/** Text representation prefix for the isolated profile payload. */
export const appearanceProfileV1TextPrefix = 'pa1_';
