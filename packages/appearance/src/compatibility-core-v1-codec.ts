import { PicoAppearanceError } from './appearance-errors.js';
import {
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
} from './compatibility-core-v1.js';

/** Fixed payload length of the compatibility core record (ADR 0125). */
export const compatibilityCoreV1PayloadByteLength = 24;

/**
 * Fixed 24-byte payload of the compatibility core record. Integers only:
 * `uint16` big endian, `int8` two's complement. The record version lives in
 * the record header, not in this payload. Byte 23 is reserved and exactly 0.
 */
export function encodeCompatibilityCoreV1(core: PicoAppearanceCompatibilityCoreV1): Uint8Array {
  const validated = validateCompatibilityCoreV1(core);
  const bytes = new Uint8Array(compatibilityCoreV1PayloadByteLength);
  writeUint16BigEndian(bytes, 0, validated.shell.hue);
  bytes[2] = validated.shell.chroma;
  bytes[3] = validated.shell.lightness;
  writeUint16BigEndian(bytes, 4, validated.face.hue);
  bytes[6] = validated.face.blackLevel;
  writeUint16BigEndian(bytes, 7, validated.trim.hue);
  bytes[9] = validated.trim.chroma;
  bytes[10] = picoCompatibilityCoreHeadKindIdsV1[validated.head.kind];
  bytes[11] = picoSemanticHeadFamilyIdsV1[validated.head.family];
  writeUint16BigEndian(bytes, 12, validated.head.primaryHue);
  bytes[14] = validated.head.length;
  bytes[15] = validated.head.volume;
  bytes[16] = validated.head.parting < 0 ? validated.head.parting + 256 : validated.head.parting;
  bytes[17] = picoCompatibilityCoreClothingKindIdsV1[validated.clothing.kind];
  bytes[18] = picoSemanticClothingFamilyIdsV1[validated.clothing.family];
  writeUint16BigEndian(bytes, 19, validated.clothing.primaryHue);
  writeUint16BigEndian(bytes, 21, validated.clothing.secondaryHue);
  bytes[23] = 0;
  return bytes;
}

export function decodeCompatibilityCoreV1(bytes: Uint8Array): PicoAppearanceCompatibilityCoreV1 {
  if (bytes.length !== compatibilityCoreV1PayloadByteLength) {
    throw new PicoAppearanceError('invalid_length', `compatibility core payload must be 24 bytes, got ${bytes.length}`);
  }
  if (bytes[23] !== 0) {
    throw new PicoAppearanceError('unknown_flags', 'compatibility core byte 23 is reserved and must be zero');
  }
  const headKind = lookupById(picoCompatibilityCoreHeadKindsV1, picoCompatibilityCoreHeadKindIdsV1, bytes[10], 'head kind');
  const headFamily = lookupById(picoSemanticHeadFamiliesV1, picoSemanticHeadFamilyIdsV1, bytes[11], 'head family');
  const clothingKind = lookupById(picoCompatibilityCoreClothingKindsV1, picoCompatibilityCoreClothingKindIdsV1, bytes[17], 'clothing kind');
  const clothingFamily = lookupById(picoSemanticClothingFamiliesV1, picoSemanticClothingFamilyIdsV1, bytes[18], 'clothing family');
  const parting = bytes[16] > 127 ? bytes[16] - 256 : bytes[16];
  return validateCompatibilityCoreV1({
    compatibilityCoreVersion: 1,
    shell: {
      hue: readUint16BigEndian(bytes, 0),
      chroma: bytes[2],
      lightness: bytes[3],
    },
    face: {
      hue: readUint16BigEndian(bytes, 4),
      blackLevel: bytes[6],
    },
    trim: {
      hue: readUint16BigEndian(bytes, 7),
      chroma: bytes[9],
    },
    head: {
      kind: headKind,
      family: headFamily,
      primaryHue: readUint16BigEndian(bytes, 12),
      length: bytes[14],
      volume: bytes[15],
      parting,
    },
    clothing: {
      kind: clothingKind,
      family: clothingFamily,
      primaryHue: readUint16BigEndian(bytes, 19),
      secondaryHue: readUint16BigEndian(bytes, 21),
    },
  });
}

function lookupById<T extends string>(
  names: readonly T[],
  ids: Readonly<Record<T, number>>,
  id: number,
  label: string,
): T {
  for (const name of names) {
    if (ids[name] === id) {
      return name;
    }
  }
  throw new PicoAppearanceError('value_out_of_range', `unknown ${label} id ${id}`);
}

function writeUint16BigEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value >> 8;
  bytes[offset + 1] = value & 0xff;
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}
