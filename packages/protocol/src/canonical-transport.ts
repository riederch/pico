/**
 * The two things a code a person carries between devices is made of:
 * canonical JSON, and the alphabet a scanner can read back.
 *
 * **Extracted rather than copied a third time.** `canonicalJson` already
 * exists twice in this package - once for the signature inputs in `index.ts`
 * and once for recovery evidence - and ADR 0130 E3's enrolment codes needed a
 * third. Two implementations of a canonical encoding are two spellings of the
 * same bytes waiting to disagree, and the one place that shows up is a
 * signature that verifies on one device and not on the other.
 *
 * `recovery.ts` now reads its own from here, unchanged, with its error names
 * passed in: a scan refusal says which artifact was being scanned, and a
 * shared decoder must not flatten that into one word.
 */

export function canonicalJson(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error('invalid_json_number');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  throw new Error('invalid_json_value');
}

const base64UrlAlphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export const picoBase64UrlPattern = /^[A-Za-z0-9_-]+$/;

export function encodeBase64Url(bytes: Uint8Array): string {
  let output = '';
  for (let offset = 0; offset < bytes.byteLength; offset += 3) {
    const remaining = bytes.byteLength - offset;
    const chunk = (bytes[offset]! << 16)
      | ((remaining > 1 ? bytes[offset + 1]! : 0) << 8)
      | (remaining > 2 ? bytes[offset + 2]! : 0);
    output += base64UrlAlphabet[(chunk >>> 18) & 0x3f];
    output += base64UrlAlphabet[(chunk >>> 12) & 0x3f];
    if (remaining > 1) {
      output += base64UrlAlphabet[(chunk >>> 6) & 0x3f];
    }
    if (remaining > 2) {
      output += base64UrlAlphabet[chunk & 0x3f];
    }
  }
  return output;
}

/**
 * `charsetReason` names the artifact rather than the alphabet: whoever reads
 * the refusal is holding a card or a phone, not a decoder.
 */
export function decodeBase64Url(body: string, charsetReason: string): Uint8Array {
  const bytes = new Uint8Array(Math.floor((body.length * 3) / 4));
  let written = 0;
  let accumulator = 0;
  let bits = 0;
  for (const character of body) {
    const value = base64UrlAlphabet.indexOf(character);
    if (value < 0) {
      throw new Error(charsetReason);
    }
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[written++] = (accumulator >>> bits) & 0xff;
    }
  }
  return bytes.subarray(0, written);
}

/**
 * A length-prefixed element list, which is how this tree already carries a
 * payload a camera has to read (the Recovery Card does the same).
 *
 * **JSON was the first version and it did not fit.** A grant is fifteen
 * 32-byte values and a handful of short strings; spelled as hex inside JSON
 * that is about 1,900 bytes, which is a version-37 QR at error correction L -
 * and it does not fit at level M at all, which is the level the Recovery Card
 * is printed at. The same content as bytes is about half that, and half is
 * the difference between a code a camera reads and one it argues with.
 */
const MAX_ELEMENT_BYTES = 4_096;

export function encodeCanonicalElements(elements: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const element of elements) {
    if (element.byteLength > MAX_ELEMENT_BYTES) {
      throw new Error('canonical_element_too_large');
    }
    total += 4 + element.byteLength;
  }
  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  let offset = 0;
  for (const element of elements) {
    view.setUint32(offset, element.byteLength, false);
    output.set(element, offset + 4);
    offset += 4 + element.byteLength;
  }
  return output;
}

export function decodeCanonicalElements(
  input: Uint8Array,
  expectedElements: number,
  reason: string,
): Uint8Array[] {
  const elements: Uint8Array[] = [];
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  let offset = 0;
  while (offset < input.byteLength) {
    if (elements.length >= expectedElements || offset + 4 > input.byteLength) {
      throw new Error(reason);
    }
    const length = view.getUint32(offset, false);
    if (length > MAX_ELEMENT_BYTES || offset + 4 + length > input.byteLength) {
      throw new Error(reason);
    }
    elements.push(input.subarray(offset + 4, offset + 4 + length));
    offset += 4 + length;
  }
  if (elements.length !== expectedElements) {
    throw new Error(reason);
  }
  return elements;
}

export function picoHexToBytes(value: string, reason: string): Uint8Array {
  if (typeof value !== 'string' || value.length % 2 !== 0 || !/^[0-9a-f]*$/u.test(value)) {
    throw new Error(reason);
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function picoBytesToHex(bytes: Uint8Array): string {
  let output = '';
  for (const byte of bytes) {
    output += byte.toString(16).padStart(2, '0');
  }
  return output;
}
