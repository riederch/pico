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
  deriveCompatibilityClothingV1,
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
 * - whenever the document content is locally understood, the embedded
 *   compatibility core must equal the normative projection of the profile
 *   plus the custom-asset references — a differing core is refused as
 *   `compatibility_core_mismatch`, never silently preferred in either
 *   direction;
 * - custom assets and extensions must already be in canonical order, so a
 *   validated document encodes deterministically without hidden re-sorting.
 *   `createAppearanceDocumentV1` sorts for you.
 */
export function validateAppearanceDocumentV1(input: unknown): PicoAppearanceDocumentV1 {
  return validateAppearanceDocumentV1WithOptions(input, { clothingConsistencyVerifiable: true });
}

/**
 * Decoder-internal variant, deliberately not exported from the package
 * index. A decoder that skipped custom-asset records of an unknown version
 * cannot recompute the clothing derivation, so it must accept the clothing
 * block of the embedded core as-is — that block exists exactly for this
 * situation. Every other consistency rule stays fully enforced, and such a
 * partially understood document fails the strict validation used by the
 * encoder, so it cannot be re-emitted as canonical; forward the original
 * bytes instead.
 */
export function validateAppearanceDocumentV1WithOptions(
  input: unknown,
  options: Readonly<{ clothingConsistencyVerifiable: boolean }>,
): PicoAppearanceDocumentV1 {
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
    const projected = projectAppearanceProfileV1ToCompatibilityCoreV1(canonicalProfile.profile, customAssets);
    const comparable = options.clothingConsistencyVerifiable
      ? projected
      : { ...projected, clothing: compatibilityCore.clothing };
    if (!compatibilityCoresEqual(comparable, compatibilityCore)) {
      throw new PicoAppearanceError(
        'compatibility_core_mismatch',
        'document.compatibilityCore does not equal the normative projection of the understood document content',
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
    compatibilityCore: projectAppearanceProfileV1ToCompatibilityCoreV1(validatedProfile, customAssets),
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
  // Enforces the V1 cardinality rule (at most one custom_clothing reference)
  // even when the clothing consistency check itself is relaxed.
  deriveCompatibilityClothingV1(entries);
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

/** A critical extension an implementation declares it fully understands. */
export interface PicoSupportedAppearanceExtensionV1 {
  readonly namespace: string;
  readonly name: string;
  readonly versions: readonly number[];
}

/**
 * Enforces the critical-extension contract before a full rendering is
 * claimed (ADR 0125): unknown optional extensions are fine, an unknown
 * critical extension — or a known one in an unsupported version — refuses
 * the full rendering with `unsupported_critical_record`. The transport
 * decoder cannot make this decision because it does not know what the
 * application understands; call this with the application's supported set.
 * Rendering the compatibility core alone stays allowed either way, because
 * a critical extension must never bypass the mandatory core.
 */
export function assertAppearanceDocumentRenderableV1(
  document: PicoAppearanceDocumentV1,
  options?: Readonly<{ supportedExtensions?: readonly PicoSupportedAppearanceExtensionV1[] }>,
): void {
  for (const extension of document.extensions) {
    if (!extension.critical) {
      continue;
    }
    const supported = (options?.supportedExtensions ?? []).some((entry) =>
      entry.namespace === extension.namespace
      && entry.name === extension.name
      && entry.versions.includes(extension.version));
    if (!supported) {
      throw new PicoAppearanceError(
        'unsupported_critical_record',
        `critical extension ${extension.namespace}/${extension.name} version ${extension.version} is not supported`,
      );
    }
  }
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
