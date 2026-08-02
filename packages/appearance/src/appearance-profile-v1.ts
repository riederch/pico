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

/** Byte lengths of the canonical profile payload (PAS brief section 12). */
export const appearanceProfileV1AntennaByteLength = 18;
export const appearanceProfileV1HeadModuleByteLength = 38;

/** Text representation prefix for the isolated profile payload. */
export const appearanceProfileV1TextPrefix = 'pa1_';
