import { PicoAppearanceError } from './appearance-errors.js';
import {
  appearanceDocumentV1Limits,
  appearanceDocumentV1TextPrefix,
  picoParametricAppearanceProfileFamilyId,
  type PicoAppearanceDocumentV1,
  type PicoCanonicalAppearanceProfile,
} from './appearance-document-v1.js';
import { validateAppearanceDocumentV1 } from './appearance-document-v1-validation.js';
import { decodeAppearanceProfileV1, encodeAppearanceProfileV1 } from './appearance-profile-v1-codec.js';
import {
  compatibilityCoreV1PayloadByteLength,
  decodeCompatibilityCoreV1,
  encodeCompatibilityCoreV1,
} from './compatibility-core-v1-codec.js';
import {
  appearanceExtensionNamePattern,
  compareAppearanceExtensionsV1,
  type PicoAppearanceExtensionV1,
} from './appearance-extension-v1.js';
import {
  compareCustomAssetReferencesV1,
  decodeCustomAssetReferenceV1,
  encodeCustomAssetReferenceV1,
  type PicoCustomAppearanceAssetReferenceV1,
} from './custom-asset-reference-v1.js';
import { decodeBase64Url, encodeBase64Url } from './base64url.js';
import type { PicoAppearanceCompatibilityCoreV1 } from './compatibility-core-v1.js';

/** Record type bytes of envelope V1. All other types are reserved. */
export const appearanceDocumentV1RecordTypes = Object.freeze({
  compatibilityCore: 0x01,
  canonicalProfile: 0x02,
  customAssetReference: 0x03,
  namespacedExtension: 0x7f,
});

const criticalFlag = 0x01;
const reservedFlagMask = 0xfe;
const envelopeHeaderByteLength = 8;
const recordHeaderByteLength = 6;

/**
 * Canonical encoder for the appearance document envelope (ADR 0125):
 * 8-byte header (`P`, `A`, version, flags, total length and record count as
 * `uint16` big endian) followed by length-prefixed records in canonical
 * order — compatibility core, canonical profile, custom asset references,
 * extensions. Encoding always validates first, so equal documents produce
 * equal bytes.
 */
export function encodeAppearanceDocumentV1(document: PicoAppearanceDocumentV1): Uint8Array {
  const validated = validateAppearanceDocumentV1(document);
  const records: { type: number; flags: number; version: number; payload: Uint8Array }[] = [
    {
      type: appearanceDocumentV1RecordTypes.compatibilityCore,
      flags: criticalFlag,
      version: 1,
      payload: encodeCompatibilityCoreV1(validated.compatibilityCore),
    },
    {
      type: appearanceDocumentV1RecordTypes.canonicalProfile,
      flags: criticalFlag,
      version: 1,
      payload: encodeCanonicalProfilePayload(validated.canonicalProfile, validated.coreModelVersion),
    },
  ];
  for (const reference of validated.customAssets) {
    records.push({
      type: appearanceDocumentV1RecordTypes.customAssetReference,
      flags: 0,
      version: 1,
      payload: encodeCustomAssetReferenceV1(reference),
    });
  }
  for (const extension of validated.extensions) {
    records.push({
      type: appearanceDocumentV1RecordTypes.namespacedExtension,
      flags: extension.critical ? criticalFlag : 0,
      version: extension.version,
      payload: encodeExtensionPayload(extension),
    });
  }
  let totalLength = envelopeHeaderByteLength;
  for (const record of records) {
    if (record.payload.length > 0xffff) {
      throw new PicoAppearanceError('size_limit_exceeded', 'record payload does not fit uint16 length');
    }
    totalLength += recordHeaderByteLength + record.payload.length;
  }
  if (totalLength > appearanceDocumentV1Limits.maximumTotalByteLength) {
    throw new PicoAppearanceError(
      'size_limit_exceeded',
      `document would be ${totalLength} bytes, limit is ${appearanceDocumentV1Limits.maximumTotalByteLength}`,
    );
  }
  const bytes = new Uint8Array(totalLength);
  bytes[0] = 0x50;
  bytes[1] = 0x41;
  bytes[2] = 1;
  bytes[3] = 0;
  bytes[4] = totalLength >> 8;
  bytes[5] = totalLength & 0xff;
  bytes[6] = records.length >> 8;
  bytes[7] = records.length & 0xff;
  let offset = envelopeHeaderByteLength;
  for (const record of records) {
    bytes[offset] = record.type;
    bytes[offset + 1] = record.flags;
    bytes[offset + 2] = record.version >> 8;
    bytes[offset + 3] = record.version & 0xff;
    bytes[offset + 4] = record.payload.length >> 8;
    bytes[offset + 5] = record.payload.length & 0xff;
    bytes.set(record.payload, offset + recordHeaderByteLength);
    offset += recordHeaderByteLength + record.payload.length;
  }
  return bytes;
}

/**
 * Strict decoder for untrusted envelope bytes. Hard limits are checked
 * before any length-derived work, the input array is never mutated, there is
 * no recursion, and every length addition stays within the already verified
 * total. Records may arrive in any order; the returned document is in
 * canonical order. Unknown optional records are skipped, unknown critical
 * records reject the document.
 */
export function decodeAppearanceDocumentV1(bytes: Uint8Array): PicoAppearanceDocumentV1 {
  if (bytes.length > appearanceDocumentV1Limits.maximumTotalByteLength) {
    throw new PicoAppearanceError(
      'size_limit_exceeded',
      `envelope must not exceed ${appearanceDocumentV1Limits.maximumTotalByteLength} bytes, got ${bytes.length}`,
    );
  }
  if (bytes.length < envelopeHeaderByteLength) {
    throw new PicoAppearanceError('invalid_length', `envelope header needs 8 bytes, got ${bytes.length}`);
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x41) {
    throw new PicoAppearanceError('invalid_magic', 'envelope magic must be 0x50 0x41');
  }
  if (bytes[2] !== 1) {
    throw new PicoAppearanceError('unsupported_envelope_version', `unsupported envelope version ${bytes[2]}`);
  }
  if (bytes[3] !== 0) {
    throw new PicoAppearanceError('unknown_flags', 'envelope flags must be zero in version 1');
  }
  const totalLength = (bytes[4] << 8) | bytes[5];
  if (totalLength !== bytes.length) {
    throw new PicoAppearanceError('invalid_length', `envelope declares ${totalLength} bytes but carries ${bytes.length}`);
  }
  const recordCount = (bytes[6] << 8) | bytes[7];
  if (recordCount > appearanceDocumentV1Limits.maximumRecordCount) {
    throw new PicoAppearanceError(
      'size_limit_exceeded',
      `envelope declares ${recordCount} records, limit is ${appearanceDocumentV1Limits.maximumRecordCount}`,
    );
  }
  let compatibilityCore: PicoAppearanceCompatibilityCoreV1 | undefined;
  let canonicalProfile: PicoCanonicalAppearanceProfile | undefined;
  let coreModelVersion = 0;
  const customAssets: PicoCustomAppearanceAssetReferenceV1[] = [];
  const extensions: PicoAppearanceExtensionV1[] = [];
  let offset = envelopeHeaderByteLength;
  for (let index = 0; index < recordCount; index += 1) {
    if (offset + recordHeaderByteLength > totalLength) {
      throw new PicoAppearanceError('invalid_length', `record ${index} header exceeds the envelope`);
    }
    const type = bytes[offset];
    const flags = bytes[offset + 1];
    const version = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const payloadLength = (bytes[offset + 4] << 8) | bytes[offset + 5];
    if ((flags & reservedFlagMask) !== 0) {
      throw new PicoAppearanceError('invalid_record_flags', `record ${index} sets reserved flag bits`);
    }
    if (offset + recordHeaderByteLength + payloadLength > totalLength) {
      throw new PicoAppearanceError('invalid_length', `record ${index} payload exceeds the envelope`);
    }
    const payload = bytes.subarray(
      offset + recordHeaderByteLength,
      offset + recordHeaderByteLength + payloadLength,
    );
    offset += recordHeaderByteLength + payloadLength;
    const critical = (flags & criticalFlag) !== 0;
    if (type === appearanceDocumentV1RecordTypes.compatibilityCore) {
      if (!critical) {
        throw new PicoAppearanceError('invalid_record_flags', 'compatibility core record must be critical');
      }
      if (version !== 1) {
        throw new PicoAppearanceError('unsupported_compatibility_core_version', `unsupported compatibility core record version ${version}`);
      }
      if (compatibilityCore !== undefined) {
        throw new PicoAppearanceError('duplicate_required_record', 'duplicate compatibility core record');
      }
      if (payload.length !== compatibilityCoreV1PayloadByteLength) {
        throw new PicoAppearanceError('invalid_length', `compatibility core payload must be 24 bytes, got ${payload.length}`);
      }
      compatibilityCore = decodeCompatibilityCoreV1(Uint8Array.from(payload));
      continue;
    }
    if (type === appearanceDocumentV1RecordTypes.canonicalProfile) {
      if (!critical) {
        throw new PicoAppearanceError('invalid_record_flags', 'canonical profile record must be critical');
      }
      if (version !== 1) {
        throw new PicoAppearanceError('unsupported_critical_record', `unsupported canonical profile record version ${version}`);
      }
      if (canonicalProfile !== undefined) {
        throw new PicoAppearanceError('duplicate_required_record', 'duplicate canonical profile record');
      }
      const decoded = decodeCanonicalProfilePayload(payload);
      canonicalProfile = decoded.profile;
      coreModelVersion = decoded.coreModelVersion;
      continue;
    }
    if (type === appearanceDocumentV1RecordTypes.customAssetReference) {
      if (critical) {
        throw new PicoAppearanceError('invalid_record_flags', 'custom asset reference records are never critical');
      }
      if (version !== 1) {
        continue;
      }
      customAssets.push(decodeCustomAssetReferenceV1(Uint8Array.from(payload)));
      continue;
    }
    if (type === appearanceDocumentV1RecordTypes.namespacedExtension) {
      extensions.push(decodeExtensionPayload(payload, version, critical));
      continue;
    }
    if (critical) {
      throw new PicoAppearanceError('unsupported_critical_record', `unknown critical record type ${type}`);
    }
  }
  if (offset !== totalLength) {
    throw new PicoAppearanceError('invalid_length', 'envelope carries bytes beyond the declared records');
  }
  if (compatibilityCore === undefined) {
    throw new PicoAppearanceError('missing_required_record', 'compatibility core record is missing');
  }
  if (canonicalProfile === undefined) {
    throw new PicoAppearanceError('missing_required_record', 'canonical profile record is missing');
  }
  customAssets.sort(compareCustomAssetReferencesV1);
  extensions.sort(compareAppearanceExtensionsV1);
  return validateAppearanceDocumentV1({
    appearanceEnvelopeVersion: 1,
    coreModelVersion,
    compatibilityCore,
    canonicalProfile,
    customAssets,
    extensions,
  });
}

export function formatAppearanceDocumentV1(document: PicoAppearanceDocumentV1): string {
  return `${appearanceDocumentV1TextPrefix}${encodeBase64Url(encodeAppearanceDocumentV1(document))}`;
}

export function parseAppearanceDocumentV1(value: string): PicoAppearanceDocumentV1 {
  if (typeof value !== 'string' || !value.startsWith(appearanceDocumentV1TextPrefix)) {
    throw new PicoAppearanceError('invalid_text_format', 'document text must start with the exact prefix pad1_');
  }
  return decodeAppearanceDocumentV1(decodeBase64Url(value.slice(appearanceDocumentV1TextPrefix.length)));
}

function encodeCanonicalProfilePayload(
  canonicalProfile: PicoCanonicalAppearanceProfile,
  coreModelVersion: number,
): Uint8Array {
  const inner = canonicalProfile.kind === 'parametric_v1'
    ? encodeAppearanceProfileV1(canonicalProfile.profile)
    : canonicalProfile.payload;
  if (inner.length > 0xffff) {
    throw new PicoAppearanceError('size_limit_exceeded', 'profile payload does not fit uint16 length');
  }
  const bytes = new Uint8Array(8 + inner.length);
  bytes[0] = canonicalProfile.profileFamilyId >> 8;
  bytes[1] = canonicalProfile.profileFamilyId & 0xff;
  bytes[2] = canonicalProfile.appearanceProfileVersion >> 8;
  bytes[3] = canonicalProfile.appearanceProfileVersion & 0xff;
  bytes[4] = coreModelVersion >> 8;
  bytes[5] = coreModelVersion & 0xff;
  bytes[6] = inner.length >> 8;
  bytes[7] = inner.length & 0xff;
  bytes.set(inner, 8);
  return bytes;
}

function decodeCanonicalProfilePayload(payload: Uint8Array): {
  profile: PicoCanonicalAppearanceProfile;
  coreModelVersion: number;
} {
  if (payload.length < 8) {
    throw new PicoAppearanceError('invalid_length', `canonical profile record needs at least 8 bytes, got ${payload.length}`);
  }
  const profileFamilyId = (payload[0] << 8) | payload[1];
  const appearanceProfileVersion = (payload[2] << 8) | payload[3];
  const coreModelVersion = (payload[4] << 8) | payload[5];
  const innerLength = (payload[6] << 8) | payload[7];
  if (payload.length !== 8 + innerLength) {
    throw new PicoAppearanceError(
      'invalid_length',
      `canonical profile record declares ${innerLength} payload bytes but carries ${payload.length - 8}`,
    );
  }
  const inner = Uint8Array.from(payload.subarray(8));
  if (profileFamilyId === picoParametricAppearanceProfileFamilyId && appearanceProfileVersion === 1) {
    return {
      profile: {
        kind: 'parametric_v1',
        profileFamilyId: picoParametricAppearanceProfileFamilyId,
        appearanceProfileVersion: 1,
        profile: decodeAppearanceProfileV1(inner),
      },
      coreModelVersion,
    };
  }
  return {
    profile: {
      kind: 'unknown',
      profileFamilyId,
      appearanceProfileVersion,
      payload: inner,
    },
    coreModelVersion,
  };
}

function encodeExtensionPayload(extension: PicoAppearanceExtensionV1): Uint8Array {
  const namespaceBytes = asciiBytes(extension.namespace);
  const nameBytes = asciiBytes(extension.name);
  const bytes = new Uint8Array(2 + namespaceBytes.length + nameBytes.length + extension.payload.length);
  bytes[0] = namespaceBytes.length;
  bytes.set(namespaceBytes, 1);
  bytes[1 + namespaceBytes.length] = nameBytes.length;
  bytes.set(nameBytes, 2 + namespaceBytes.length);
  bytes.set(extension.payload, 2 + namespaceBytes.length + nameBytes.length);
  return bytes;
}

function decodeExtensionPayload(payload: Uint8Array, version: number, critical: boolean): PicoAppearanceExtensionV1 {
  if (payload.length < 2) {
    throw new PicoAppearanceError('invalid_length', 'extension record is too short for its name fields');
  }
  const namespaceLength = payload[0];
  if (1 + namespaceLength + 1 > payload.length) {
    throw new PicoAppearanceError('invalid_length', 'extension namespace exceeds the record');
  }
  const namespace = asciiString(payload.subarray(1, 1 + namespaceLength));
  const nameLength = payload[1 + namespaceLength];
  const nameStart = 2 + namespaceLength;
  if (nameStart + nameLength > payload.length) {
    throw new PicoAppearanceError('invalid_length', 'extension name exceeds the record');
  }
  const name = asciiString(payload.subarray(nameStart, nameStart + nameLength));
  if (!appearanceExtensionNamePattern.test(namespace)) {
    throw new PicoAppearanceError('invalid_namespace', 'extension namespace must match [a-z0-9][a-z0-9.-]{0,62}');
  }
  if (!appearanceExtensionNamePattern.test(name)) {
    throw new PicoAppearanceError('invalid_namespace', 'extension name must match [a-z0-9][a-z0-9.-]{0,62}');
  }
  const opaque = Uint8Array.from(payload.subarray(nameStart + nameLength));
  if (opaque.length > appearanceDocumentV1Limits.maximumExtensionPayloadByteLength) {
    throw new PicoAppearanceError(
      'size_limit_exceeded',
      `extension payload must not exceed ${appearanceDocumentV1Limits.maximumExtensionPayloadByteLength} bytes`,
    );
  }
  return Object.freeze({ namespace, name, version, critical, payload: opaque });
}

function asciiBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index);
  }
  return bytes;
}

function asciiString(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) {
    value += String.fromCharCode(byte);
  }
  return value;
}
