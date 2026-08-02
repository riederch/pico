/**
 * @pico/appearance — versioned parametric appearance contracts (ADR 0125).
 *
 * PICO appearance is a small, deterministic, versioned set of integers, not
 * a sprite, texture or transferred mesh. This package implements the profile
 * V1 codec (`pa1_`), the compatibility core V1, the deterministic projection
 * between them, and the appearance document envelope (`pad1_`) with
 * namespaced extensions and custom asset references. It has no runtime
 * dependencies, performs no file or network access, and treats every
 * external byte and JSON value as untrusted.
 *
 * Honest boundary: this is a package/codec contract. Nothing here renders a
 * PICO, synchronizes profiles over Pico Link, stores custom assets or grants
 * any character approval.
 */
export {
  picoAppearanceErrorCodes,
  PicoAppearanceError,
  type PicoAppearanceErrorCode,
} from './appearance-errors.js';

export {
  appearanceProfileV1AntennaByteLength,
  appearanceProfileV1HeadModuleByteLength,
  appearanceProfileV1TextPrefix,
  type PicoAppearanceProfileV1,
  type PicoHeadIdentityV1,
  type PicoSurfaceAppearanceV1,
  type ProceduralHeadRecipeV2,
} from './appearance-profile-v1.js';

export { validateAppearanceProfileV1 } from './appearance-profile-v1-validation.js';

export {
  decodeAppearanceProfileV1,
  encodeAppearanceProfileV1,
  formatAppearanceProfileV1,
  parseAppearanceProfileV1,
} from './appearance-profile-v1-codec.js';

export {
  picoCompatibilityCoreClothingKindIdsV1,
  picoCompatibilityCoreClothingKindsV1,
  picoCompatibilityCoreHeadKindIdsV1,
  picoCompatibilityCoreHeadKindsV1,
  picoSemanticClothingFamiliesV1,
  picoSemanticClothingFamilyIdsV1,
  picoSemanticHeadFamiliesV1,
  picoSemanticHeadFamilyIdsV1,
  validateCompatibilityCoreV1,
  type PicoAppearanceCompatibilityCoreV1,
  type PicoCompatibilityCoreClothingKindV1,
  type PicoCompatibilityCoreHeadKindV1,
  type PicoSemanticClothingFamilyV1,
  type PicoSemanticHeadFamilyV1,
} from './compatibility-core-v1.js';

export {
  compatibilityCoreV1PayloadByteLength,
  decodeCompatibilityCoreV1,
  encodeCompatibilityCoreV1,
} from './compatibility-core-v1-codec.js';

export {
  compatibilityProjectionV1Thresholds,
  deriveSemanticHeadFamilyV1,
  projectAppearanceProfileV1ToCompatibilityCoreV1,
} from './compatibility-projection-v1.js';

export {
  appearanceExtensionNamePattern,
  appearanceExtensionV1MaximumPayloadByteLength,
  compareAppearanceExtensionsV1,
  validateAppearanceExtensionV1,
  type PicoAppearanceExtensionV1,
} from './appearance-extension-v1.js';

export {
  compareCustomAssetReferencesV1,
  customAssetFallbackClothingFamiliesV1,
  customAssetKindIdsV1,
  customAssetKindsV1,
  customAssetMediaTypeIdsV1,
  customAssetMediaTypesV1,
  customAssetReferenceV1PayloadByteLength,
  decodeCustomAssetReferenceV1,
  encodeCustomAssetReferenceV1,
  validateCustomAssetReferenceV1,
  type PicoCustomAppearanceAssetReferenceV1,
} from './custom-asset-reference-v1.js';

export {
  appearanceDocumentV1Limits,
  appearanceDocumentV1TextPrefix,
  picoParametricAppearanceProfileFamilyId,
  type PicoAppearanceDocumentV1,
  type PicoCanonicalAppearanceProfile,
} from './appearance-document-v1.js';

export {
  createAppearanceDocumentV1,
  validateAppearanceDocumentV1,
} from './appearance-document-v1-validation.js';

export {
  appearanceDocumentV1RecordTypes,
  decodeAppearanceDocumentV1,
  encodeAppearanceDocumentV1,
  formatAppearanceDocumentV1,
  parseAppearanceDocumentV1,
} from './appearance-document-v1-codec.js';

export {
  appearanceCacheKeyRendererVersionPattern,
  createPicoAppearanceCacheKeyV1,
  type PicoAppearanceLevelOfDetail,
} from './appearance-cache-key-v1.js';

export {
  picoAppearanceGeneratorStatuses,
  picoAppearanceGeneratorSupportStatuses,
  validateOfficialAppearanceGeneratorRegistryV1,
  type PicoAppearanceGeneratorStatus,
  type PicoAppearanceGeneratorSupportStatus,
  type PicoOfficialAppearanceGeneratorEntryV1,
  type PicoOfficialAppearanceGeneratorRegistryV1,
} from './official-generator-registry.js';
