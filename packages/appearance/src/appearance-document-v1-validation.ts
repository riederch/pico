import { PicoAppearanceError } from './appearance-errors.js';
import type { PicoAppearanceProfileV1 } from './appearance-profile-v1.js';
import { validateAppearanceProfileV1 } from './appearance-profile-v1-validation.js';
import { validateCompatibilityCoreV1 } from './compatibility-core-v1.js';
import { projectAppearanceProfileV1ToCompatibilityCoreV1 } from './compatibility-projection-v1.js';
import {
  compareAppearanceExtensionsV1,
  validateAppearanceExtensionV1,
  type PicoAppearanceExtensionV1,
} from './appearance-extension-v1.js';
import {
  compareCustomAssetReferencesV1,
  validateCustomAssetReferenceV1,
  type PicoCustomAppearanceAssetReferenceV1,
} from './custom-asset-reference-v1.js';
import {
  appearanceDocumentV1Limits,
  picoParametricAppearanceProfileFamilyId,
  type PicoAppearanceDocumentV1,
  type PicoCanonicalAppearanceProfile,
} from './appearance-document-v1.js';
import { requireArray, requirePlainObject, requireUint8Array } from './validation-primitives.js';

/**
 * Strict validation of a logical appearance document. Beyond field shapes it
 * enforces the two consistency contracts of ADR 0125:
 *
 * - whenever the profile version is locally understood, the embedded
 *   compatibility core must equal the normative projection of the profile —
 *   a differing core is refused as `compatibility_core_mismatch`, never
 *   silently preferred in either direction;
 * - custom assets and extensions must already be in canonical order, so a
 *   validated document encodes deterministically without hidden re-sorting.
 *   `createAppearanceDocumentV1` sorts for you.
 */
export function validateAppearanceDocumentV1(input: unknown): PicoAppearanceDocumentV1 {
  const root = requirePlainObject(input, 'document', [
    'appearanceEnvelopeVersion', 'coreModelVersion', 'compatibilityCore', 'canonicalProfile', 'customAssets', 'extensions',
  ]);
  if (typeof root.appearanceEnvelopeVersion !== 'number' || !Number.isInteger(root.appearanceEnvelopeVersion)) {
    throw new PicoAppearanceError('invalid_integer', 'document.appearanceEnvelopeVersion must be an integer');
  }
  if (root.appearanceEnvelopeVersion !== 1) {
    throw new PicoAppearanceError('unsupported_envelope_version', 'document.appearanceEnvelopeVersion must be exactly 1');
  }
  if (typeof root.coreModelVersion !== 'number' || !Number.isInteger(root.coreModelVersion)) {
    throw new PicoAppearanceError('invalid_integer', 'document.coreModelVersion must be an integer');
  }
  if (root.coreModelVersion < 0 || root.coreModelVersion > 0xffff) {
    throw new PicoAppearanceError('value_out_of_range', 'document.coreModelVersion must fit uint16');
  }
  const compatibilityCore = validateCompatibilityCoreV1(root.compatibilityCore);
  const canonicalProfile = validateCanonicalProfile(root.canonicalProfile);
  const customAssets = validateCustomAssets(root.customAssets);
  const extensions = validateExtensions(root.extensions);
  const recordCount = 2 + customAssets.length + extensions.length;
  if (recordCount > appearanceDocumentV1Limits.maximumRecordCount) {
    throw new PicoAppearanceError('size_limit_exceeded', `document would need ${recordCount} records, limit is ${appearanceDocumentV1Limits.maximumRecordCount}`);
  }
  if (canonicalProfile.kind === 'parametric_v1') {
    const projected = projectAppearanceProfileV1ToCompatibilityCoreV1(canonicalProfile.profile);
    if (!compatibilityCoresEqual(projected, compatibilityCore)) {
      throw new PicoAppearanceError(
        'compatibility_core_mismatch',
        'document.compatibilityCore does not equal the normative projection of the understood profile',
      );
    }
  }
  return Object.freeze({
    appearanceEnvelopeVersion: 1,
    coreModelVersion: root.coreModelVersion,
    compatibilityCore,
    canonicalProfile,
    customAssets: Object.freeze(customAssets),
    extensions: Object.freeze(extensions),
  });
}

/**
 * Builds a canonical document from a validated profile: the compatibility
 * core is always computed from the full profile, never supplied by the
 * caller, and custom assets and extensions are sorted canonically.
 */
export function createAppearanceDocumentV1(
  profile: PicoAppearanceProfileV1,
  options?: Readonly<{
    coreModelVersion?: number;
    customAssets?: readonly PicoCustomAppearanceAssetReferenceV1[];
    extensions?: readonly PicoAppearanceExtensionV1[];
  }>,
): PicoAppearanceDocumentV1 {
  const validatedProfile = validateAppearanceProfileV1(profile);
  const customAssets = [...(options?.customAssets ?? [])]
    .map((reference) => validateCustomAssetReferenceV1(reference))
    .sort(compareCustomAssetReferencesV1);
  const extensions = [...(options?.extensions ?? [])]
    .map((extension) => validateAppearanceExtensionV1(extension))
    .sort(compareAppearanceExtensionsV1);
  return validateAppearanceDocumentV1({
    appearanceEnvelopeVersion: 1,
    coreModelVersion: options?.coreModelVersion ?? 0,
    compatibilityCore: projectAppearanceProfileV1ToCompatibilityCoreV1(validatedProfile),
    canonicalProfile: {
      kind: 'parametric_v1',
      profileFamilyId: picoParametricAppearanceProfileFamilyId,
      appearanceProfileVersion: 1,
      profile: validatedProfile,
    },
    customAssets,
    extensions,
  });
}

function validateCanonicalProfile(input: unknown): PicoCanonicalAppearanceProfile {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new PicoAppearanceError('invalid_type', 'document.canonicalProfile must be an object');
  }
  const kind = (input as Record<string, unknown>).kind;
  if (kind === 'parametric_v1') {
    const record = requirePlainObject(input, 'document.canonicalProfile', [
      'kind', 'profileFamilyId', 'appearanceProfileVersion', 'profile',
    ]);
    if (record.profileFamilyId !== picoParametricAppearanceProfileFamilyId) {
      throw new PicoAppearanceError('invalid_shape', 'parametric_v1 profile must carry profileFamilyId 1');
    }
    if (record.appearanceProfileVersion !== 1) {
      throw new PicoAppearanceError('unsupported_profile_version', 'parametric_v1 profile must carry appearanceProfileVersion 1');
    }
    return Object.freeze({
      kind: 'parametric_v1' as const,
      profileFamilyId: picoParametricAppearanceProfileFamilyId as 1,
      appearanceProfileVersion: 1 as const,
      profile: validateAppearanceProfileV1(record.profile),
    });
  }
  if (kind === 'unknown') {
    const record = requirePlainObject(input, 'document.canonicalProfile', [
      'kind', 'profileFamilyId', 'appearanceProfileVersion', 'payload',
    ]);
    const profileFamilyId = record.profileFamilyId;
    const appearanceProfileVersion = record.appearanceProfileVersion;
    if (typeof profileFamilyId !== 'number' || !Number.isInteger(profileFamilyId)
      || profileFamilyId < 0 || profileFamilyId > 0xffff) {
      throw new PicoAppearanceError('invalid_integer', 'unknown profile profileFamilyId must fit uint16');
    }
    if (typeof appearanceProfileVersion !== 'number' || !Number.isInteger(appearanceProfileVersion)
      || appearanceProfileVersion < 0 || appearanceProfileVersion > 0xffff) {
      throw new PicoAppearanceError('invalid_integer', 'unknown profile appearanceProfileVersion must fit uint16');
    }
    if (profileFamilyId === picoParametricAppearanceProfileFamilyId && appearanceProfileVersion === 1) {
      throw new PicoAppearanceError('invalid_shape', 'family 1 version 1 is locally understood and must be carried as parametric_v1');
    }
    const payload = requireUint8Array(record.payload, 'canonicalProfile.payload');
    return Object.freeze({
      kind: 'unknown' as const,
      profileFamilyId,
      appearanceProfileVersion,
      payload: Uint8Array.from(payload),
    });
  }
  throw new PicoAppearanceError('invalid_shape', 'document.canonicalProfile.kind must be parametric_v1 or unknown');
}

function validateCustomAssets(input: unknown): PicoCustomAppearanceAssetReferenceV1[] {
  const entries = requireArray(input, 'document.customAssets').map((entry) => validateCustomAssetReferenceV1(entry));
  for (let index = 1; index < entries.length; index += 1) {
    if (compareCustomAssetReferencesV1(entries[index - 1], entries[index]) > 0) {
      throw new PicoAppearanceError('invalid_record_ordering', 'document.customAssets must be in canonical order');
    }
  }
  return entries;
}

function validateExtensions(input: unknown): PicoAppearanceExtensionV1[] {
  const entries = requireArray(input, 'document.extensions').map((entry) => validateAppearanceExtensionV1(entry));
  for (let index = 1; index < entries.length; index += 1) {
    if (compareAppearanceExtensionsV1(entries[index - 1], entries[index]) > 0) {
      throw new PicoAppearanceError('invalid_record_ordering', 'document.extensions must be in canonical order');
    }
  }
  return entries;
}

function compatibilityCoresEqual(
  left: PicoAppearanceDocumentV1['compatibilityCore'],
  right: PicoAppearanceDocumentV1['compatibilityCore'],
): boolean {
  return left.shell.hue === right.shell.hue
    && left.shell.chroma === right.shell.chroma
    && left.shell.lightness === right.shell.lightness
    && left.face.hue === right.face.hue
    && left.face.blackLevel === right.face.blackLevel
    && left.trim.hue === right.trim.hue
    && left.trim.chroma === right.trim.chroma
    && left.head.kind === right.head.kind
    && left.head.family === right.head.family
    && left.head.primaryHue === right.head.primaryHue
    && left.head.length === right.head.length
    && left.head.volume === right.head.volume
    && left.head.parting === right.head.parting
    && left.clothing.kind === right.clothing.kind
    && left.clothing.family === right.clothing.family
    && left.clothing.primaryHue === right.clothing.primaryHue
    && left.clothing.secondaryHue === right.clothing.secondaryHue;
}
