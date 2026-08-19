import { describe, expect, it } from 'vitest';
import {
  decodeCanonicalText,
  encodeCanonicalElements,
  decodeCanonicalElements,
} from './canonical-transport.js';

describe('ADR 0131 A1 - canonical text decodes without ICU', () => {
  it('reads text the same way a full runtime would', () => {
    const bytes = new TextEncoder().encode('a Home, and a Pico — ünïcode');
    expect(decodeCanonicalText(bytes, 'refused')).toBe('a Home, and a Pico — ünïcode');
  });

  it('refuses bytes that are not valid UTF-8', () => {
    /**
     * The strictness is the point, not a nicety: a decoder that turned a
     * broken sequence into U+FFFD would accept a second spelling of a code -
     * the thing this transport refuses everywhere else, for the reason the
     * base64url round-trip check gives.
     */
    expect(() => decodeCanonicalText(new Uint8Array([0xff, 0xfe, 0x41]), 'refused'))
      .toThrow('refused');
    // A truncated multi-byte sequence, which is what a cut code looks like.
    expect(() => decodeCanonicalText(new Uint8Array([0xe2, 0x80]), 'refused'))
      .toThrow('refused');
    // An overlong encoding of '/', the classic way to smuggle a second
    // spelling past a tolerant reader.
    expect(() => decodeCanonicalText(new Uint8Array([0xc0, 0xaf]), 'refused'))
      .toThrow('refused');
  });

  it('does not need a TextDecoder that takes options', () => {
    /**
     * The measurement behind this test: nodejs-mobile v18.20.4 - the runtime
     * ADR 0131 A2 chose - is built without ICU, and there
     * `new TextDecoder('utf-8', { fatal: true })` throws `ERR_NO_ICU`. Every
     * enrolment code and every Recovery Card was refused on the phone
     * because of it, with a message that named the body rather than the
     * cause.
     */
    const full = globalThis.TextDecoder;
    class WithoutIcu {
      constructor(label?: string, options?: unknown) {
        if (options !== undefined) {
          const error = new Error('ERR_NO_ICU') as Error & { code?: string };
          error.code = 'ERR_NO_ICU';
          throw error;
        }
      }

      decode(input: Uint8Array): string {
        return new full().decode(input);
      }
    }
    globalThis.TextDecoder = WithoutIcu as unknown as typeof TextDecoder;
    try {
      const bytes = new TextEncoder().encode('still readable');
      expect(decodeCanonicalText(bytes, 'refused')).toBe('still readable');
      expect(() => decodeCanonicalText(new Uint8Array([0xff]), 'refused')).toThrow('refused');
    } finally {
      globalThis.TextDecoder = full;
    }
  });

  it('keeps working through the element list it is used from', () => {
    const encoded = encodeCanonicalElements([
      new TextEncoder().encode('one'),
      new TextEncoder().encode('two'),
    ]);
    const elements = decodeCanonicalElements(encoded, 2, 'refused');
    expect(elements.map((element) => decodeCanonicalText(element, 'refused')))
      .toEqual(['one', 'two']);
  });
});
