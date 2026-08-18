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
