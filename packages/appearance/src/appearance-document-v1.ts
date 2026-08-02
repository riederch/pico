import type { PicoAppearanceProfileV1 } from './appearance-profile-v1.js';
import type { PicoAppearanceCompatibilityCoreV1 } from './compatibility-core-v1.js';
import type { PicoAppearanceExtensionV1 } from './appearance-extension-v1.js';
import type { PicoCustomAppearanceAssetReferenceV1 } from './custom-asset-reference-v1.js';

/**
 * Canonical profile carried by an appearance document. The parametric case
 * is the fully understood local profile; the unknown case preserves a newer
 * or foreign profile family verbatim so an older runtime can keep the exact
 * identity bytes, render from the compatibility core and re-encode without
 * loss ("Alt stellt Neu sinnvoll dar").
 */
export type PicoCanonicalAppearanceProfile =
  | Readonly<{
      kind: 'parametric_v1';
      profileFamilyId: 1;
      appearanceProfileVersion: 1;
      profile: PicoAppearanceProfileV1;
    }>
  | Readonly<{
      kind: 'unknown';
      profileFamilyId: number;
      appearanceProfileVersion: number;
      payload: Uint8Array;
    }>;

/**
 * Logical appearance document model (ADR 0125). Carried on the wire as the
 * `pad1_` envelope. `coreModelVersion` mirrors the canonical profile record
 * field: 0 means the document is not pinned to a released authored character
 * core (ADR 0124 has not released one yet); a released core version is a
 * positive uint16.
 */
export interface PicoAppearanceDocumentV1 {
  readonly appearanceEnvelopeVersion: 1;
  readonly coreModelVersion: number;
  readonly compatibilityCore: PicoAppearanceCompatibilityCoreV1;
  readonly canonicalProfile: PicoCanonicalAppearanceProfile;
  readonly customAssets: readonly PicoCustomAppearanceAssetReferenceV1[];
  readonly extensions: readonly PicoAppearanceExtensionV1[];
}

/** Profile family id of the parametric appearance profile (registry entry 1). */
export const picoParametricAppearanceProfileFamilyId = 1;

/** Text representation prefix of the appearance document envelope. */
export const appearanceDocumentV1TextPrefix = 'pad1_';

/** Envelope V1 hard limits (checked before any allocation from lengths). */
export const appearanceDocumentV1Limits = Object.freeze({
  maximumTotalByteLength: 4096,
  maximumRecordCount: 64,
  maximumExtensionPayloadByteLength: 1024,
});
