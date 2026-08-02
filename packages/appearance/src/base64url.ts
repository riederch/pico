import { PicoAppearanceError } from './appearance-errors.js';

/**
 * Canonical base64url without padding. Implemented locally instead of through
 * `Buffer` so the accepted alphabet, the missing padding and the zero trailing
 * bits are enforced identically on every runtime: encode -> decode -> encode
 * must be byte-identical, and no alternative spelling may decode.
 */
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const reverse = new Map<string, number>(
  Array.from(alphabet, (character, index) => [character, index] as const),
);

export function encodeBase64Url(bytes: Uint8Array): string {
  let output = '';
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset];
    const second = offset + 1 < bytes.length ? bytes[offset + 1] : undefined;
    const third = offset + 2 < bytes.length ? bytes[offset + 2] : undefined;
    output += alphabet[first >> 2];
    if (second === undefined) {
      output += alphabet[(first & 0x03) << 4];
    } else if (third === undefined) {
      output += alphabet[((first & 0x03) << 4) | (second >> 4)];
      output += alphabet[(second & 0x0f) << 2];
    } else {
      output += alphabet[((first & 0x03) << 4) | (second >> 4)];
      output += alphabet[((second & 0x0f) << 2) | (third >> 6)];
      output += alphabet[third & 0x3f];
    }
  }
  return output;
}

export function decodeBase64Url(text: string, maximumByteLength?: number): Uint8Array {
  if (text.length % 4 === 1) {
    throw new PicoAppearanceError('invalid_text_format', 'base64url length is not decodable');
  }
  const remainder = text.length % 4;
  const byteLength = Math.floor(text.length / 4) * 3
    + (remainder === 2 ? 1 : remainder === 3 ? 2 : 0);
  // Bound the work before any allocation: an oversized foreign text must not
  // cost a decode buffer it can never legally fill.
  if (maximumByteLength !== undefined && byteLength > maximumByteLength) {
    throw new PicoAppearanceError(
      'size_limit_exceeded',
      `text encodes ${byteLength} bytes, limit is ${maximumByteLength}`,
    );
  }
  const values: number[] = [];
  for (const character of text) {
    const value = reverse.get(character);
    if (value === undefined) {
      throw new PicoAppearanceError('invalid_text_format', 'base64url contains a character outside the canonical alphabet');
    }
    values.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let write = 0;
  for (let offset = 0; offset + 4 <= values.length; offset += 4) {
    const chunk = (values[offset] << 18) | (values[offset + 1] << 12) | (values[offset + 2] << 6) | values[offset + 3];
    bytes[write] = chunk >> 16;
    bytes[write + 1] = (chunk >> 8) & 0xff;
    bytes[write + 2] = chunk & 0xff;
    write += 3;
  }
  const tail = values.length - (values.length % 4);
  if (remainder === 2) {
    const chunk = (values[tail] << 6) | values[tail + 1];
    if ((chunk & 0x0f) !== 0) {
      throw new PicoAppearanceError('invalid_text_format', 'base64url trailing bits are not canonical');
    }
    bytes[write] = chunk >> 4;
  } else if (remainder === 3) {
    const chunk = (values[tail] << 12) | (values[tail + 1] << 6) | values[tail + 2];
    if ((chunk & 0x03) !== 0) {
      throw new PicoAppearanceError('invalid_text_format', 'base64url trailing bits are not canonical');
    }
    bytes[write] = chunk >> 10;
    bytes[write + 1] = (chunk >> 2) & 0xff;
  }
  return bytes;
}
