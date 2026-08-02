import { PicoAppearanceError } from './appearance-errors.js';
import {
  appearanceProfileV1AntennaByteLength,
  appearanceProfileV1HeadModuleByteLength,
  appearanceProfileV1TextPrefix,
  type PicoAppearanceProfileV1,
} from './appearance-profile-v1.js';
import { validateAppearanceProfileV1 } from './appearance-profile-v1-validation.js';
import { decodeBase64Url, encodeBase64Url } from './base64url.js';

/**
 * Canonical binary codec for the isolated profile payload (PAS brief
 * section 12): exactly 18 bytes with the standard antenna, exactly 38 bytes
 * with the procedural head module. `uint16` fields in this payload are
 * little endian (low byte first) as originally specified; the surrounding
 * appearance document envelope uses big endian and does not change these
 * bytes. Published byte positions are immutable under version 1.
 */
export function encodeAppearanceProfileV1(profile: PicoAppearanceProfileV1): Uint8Array {
  const validated = validateAppearanceProfileV1(profile);
  const hasHeadModule = validated.headIdentity.kind === 'procedural_neon_hair';
  const bytes = new Uint8Array(
    hasHeadModule ? appearanceProfileV1HeadModuleByteLength : appearanceProfileV1AntennaByteLength,
  );
  bytes[0] = 1;
  bytes[1] = hasHeadModule ? 1 : 0;
  bytes[2] = 1;
  bytes[3] = 0;
  const { shell, face, trim } = validated.surface;
  writeUint16LittleEndian(bytes, 4, shell.hue);
  bytes[6] = shell.chroma;
  bytes[7] = shell.lightness;
  bytes[8] = shell.gloss;
  writeUint16LittleEndian(bytes, 9, face.hue);
  bytes[11] = face.tint;
  bytes[12] = face.blackLevel;
  bytes[13] = face.reflectivity;
  writeUint16LittleEndian(bytes, 14, trim.hue);
  bytes[16] = trim.chroma;
  bytes[17] = trim.metalness;
  if (validated.headIdentity.kind === 'procedural_neon_hair') {
    const { geometry, material } = validated.headIdentity.recipe;
    bytes[18] = 2;
    bytes[19] = 0;
    bytes[20] = geometry.anchor;
    bytes[21] = encodeInt8(geometry.side);
    bytes[22] = geometry.length;
    bytes[23] = geometry.lift;
    bytes[24] = encodeInt8(geometry.sweep);
    bytes[25] = encodeInt8(geometry.curl);
    bytes[26] = geometry.width;
    bytes[27] = geometry.taper;
    bytes[28] = encodeInt8(geometry.twist);
    bytes[29] = geometry.segments;
    writeUint16LittleEndian(bytes, 30, material.hue);
    bytes[32] = material.chroma;
    bytes[33] = material.translucency;
    bytes[34] = encodeInt8(geometry.partOffset);
    bytes[35] = geometry.partDepth;
    bytes[36] = encodeInt8(geometry.crownBias);
    bytes[37] = geometry.rootSpread;
  }
  return bytes;
}

export function decodeAppearanceProfileV1(bytes: Uint8Array): PicoAppearanceProfileV1 {
  if (
    bytes.length !== appearanceProfileV1AntennaByteLength
    && bytes.length !== appearanceProfileV1HeadModuleByteLength
  ) {
    throw new PicoAppearanceError('invalid_length', `profile payload must be 18 or 38 bytes, got ${bytes.length}`);
  }
  if (bytes[0] !== 1) {
    throw new PicoAppearanceError('unsupported_profile_version', 'profile byte 0 must be version 1');
  }
  const headKind = bytes[1];
  if (headKind !== 0 && headKind !== 1) {
    throw new PicoAppearanceError('invalid_shape', 'profile byte 1 must be head kind 0 or 1');
  }
  if (bytes[2] !== 1) {
    throw new PicoAppearanceError('unsupported_profile_version', 'profile byte 2 must be surface version 1');
  }
  if (bytes[3] !== 0) {
    throw new PicoAppearanceError('unknown_flags', 'profile byte 3 must be zero in version 1');
  }
  const expectedLength = headKind === 1
    ? appearanceProfileV1HeadModuleByteLength
    : appearanceProfileV1AntennaByteLength;
  if (bytes.length !== expectedLength) {
    throw new PicoAppearanceError('head_length_mismatch', `head kind ${headKind} requires ${expectedLength} bytes, got ${bytes.length}`);
  }
  const surface = {
    surfaceVersion: 1 as const,
    shell: {
      hue: readUint16LittleEndian(bytes, 4),
      chroma: bytes[6],
      lightness: bytes[7],
      gloss: bytes[8],
    },
    face: {
      hue: readUint16LittleEndian(bytes, 9),
      tint: bytes[11],
      blackLevel: bytes[12],
      reflectivity: bytes[13],
    },
    trim: {
      hue: readUint16LittleEndian(bytes, 14),
      chroma: bytes[16],
      metalness: bytes[17],
    },
  };
  if (headKind === 0) {
    return validateAppearanceProfileV1({
      profileVersion: 1,
      headIdentity: { kind: 'standard_antenna' },
      surface,
    });
  }
  if (bytes[18] !== 2) {
    throw new PicoAppearanceError('unsupported_profile_version', 'head block byte 0 must be generator version 2');
  }
  if (bytes[19] !== 0) {
    throw new PicoAppearanceError('unknown_flags', 'head block byte 1 must be zero in generator version 2');
  }
  return validateAppearanceProfileV1({
    profileVersion: 1,
    headIdentity: {
      kind: 'procedural_neon_hair',
      recipe: {
        generatorVersion: 2,
        geometry: {
          anchor: bytes[20],
          side: decodeInt8(bytes[21]),
          length: bytes[22],
          lift: bytes[23],
          sweep: decodeInt8(bytes[24]),
          curl: decodeInt8(bytes[25]),
          width: bytes[26],
          taper: bytes[27],
          twist: decodeInt8(bytes[28]),
          segments: bytes[29],
          partOffset: decodeInt8(bytes[34]),
          partDepth: bytes[35],
          crownBias: decodeInt8(bytes[36]),
          rootSpread: bytes[37],
        },
        material: {
          hue: readUint16LittleEndian(bytes, 30),
          chroma: bytes[32],
          translucency: bytes[33],
        },
      },
    },
    surface,
  });
}

export function formatAppearanceProfileV1(profile: PicoAppearanceProfileV1): string {
  return `${appearanceProfileV1TextPrefix}${encodeBase64Url(encodeAppearanceProfileV1(profile))}`;
}

export function parseAppearanceProfileV1(value: string): PicoAppearanceProfileV1 {
  if (typeof value !== 'string' || !value.startsWith(appearanceProfileV1TextPrefix)) {
    throw new PicoAppearanceError('invalid_text_format', 'profile text must start with the exact prefix pa1_');
  }
  return decodeAppearanceProfileV1(decodeBase64Url(
    value.slice(appearanceProfileV1TextPrefix.length),
    appearanceProfileV1HeadModuleByteLength,
  ));
}

function writeUint16LittleEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = value >> 8;
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function encodeInt8(value: number): number {
  return value < 0 ? value + 256 : value;
}

function decodeInt8(byte: number): number {
  return byte > 127 ? byte - 256 : byte;
}
