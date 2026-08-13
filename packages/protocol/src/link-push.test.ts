import { describe, expect, it } from 'vitest';
import {
  assertPicoLinkPushAddressedHere,
  buildPicoLinkPushSignatureInput,
  parsePicoLinkSealedPush,
  picoLinkPushEnvelopeSchema,
  picoLinkPushSaysNothingAbout,
  picoLinkPushSignatureInputLabel,
  type PicoLinkPushSignatureInput,
} from './index.js';

/**
 * ADR 0150 PU1/PU2. A push says "ask me" and never "here is".
 *
 * The negative vectors are the contract. A parser that ignored `operation`
 * would let a Home send one and let a device act on it, and ADR 0139 would be
 * pointing backwards without anybody having decided that.
 */
const host = 'a'.repeat(64);
const device = 'b'.repeat(64);
const otherDevice = 'c'.repeat(64);
const otherHost = 'd'.repeat(64);
const signature = 'e'.repeat(128);

const push: PicoLinkPushSignatureInput = {
  suite: 'pico.suite.id.v1',
  pushId: 'push_0001',
  hostSigningKeyFingerprintHex: host,
  deviceSigningKeyFingerprintHex: device,
  createdAt: '2026-08-13T10:00:00.000Z',
  expiresAt: '2026-08-13T10:15:00.000Z',
};

const sealed = (over: Record<string, unknown> = {}) => ({
  schema: picoLinkPushEnvelopeSchema,
  push,
  hostSignatureHex: signature,
  ...over,
});

describe('ADR 0150 PU1 - a push says "ask me"', () => {
  it('signs six fields, and the label names what they are', () => {
    const bytes = buildPicoLinkPushSignatureInput(push);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes)).toContain(picoLinkPushSignatureInputLabel);
    // Deterministic, or two implementations could not agree on what was signed.
    expect(buildPicoLinkPushSignatureInput({ ...push })).toEqual(bytes);
  });

  describe('the four it has nowhere to say', () => {
    // Each of these is a field somebody would reach for, and each is refused
    // by name rather than ignored.
    it('refuses an operation', () => {
      expect(() => parsePicoLinkSealedPush(sealed({
        push: { ...push, operation: 'home.device.lifecycle.read' },
      }))).toThrow('pico_link_push_carries_no:operation');
    });

    it('refuses arguments', () => {
      expect(() => parsePicoLinkSealedPush(sealed({
        push: { ...push, arguments: { memoryItemId: 'x' } },
      }))).toThrow('pico_link_push_carries_no:arguments');
    });

    it('refuses a result', () => {
      expect(() => parsePicoLinkSealedPush(sealed({
        push: { ...push, result: { pendingRecovery: true } },
      }))).toThrow('pico_link_push_carries_no:result');
    });

    it('refuses a kind', () => {
      // The one that looked useful. A device skipping reads on a kind would
      // be one whose correctness depended on two closed lists agreeing.
      expect(() => parsePicoLinkSealedPush(sealed({
        push: { ...push, kind: 'lifecycle' },
      }))).toThrow('pico_link_push_carries_no:kind');
    });

    it('keeps the four reasons where they can be read', () => {
      expect(Object.keys(picoLinkPushSaysNothingAbout).sort())
        .toEqual(['arguments', 'kind', 'operation', 'result']);
    });
  });

  it('refuses an unknown key on the envelope, and names a missing one', () => {
    expect(() => parsePicoLinkSealedPush(sealed({ sealedPushHex: 'ab' })))
      .toThrow('pico_link_push_carries_no:sealedPushHex');
    const { hostSignatureHex: _dropped, ...without } = sealed();
    expect(() => parsePicoLinkSealedPush(without))
      .toThrow('missing_pico_link_push_field:hostSignatureHex');
  });

  it('refuses an unknown schema and a non-object', () => {
    expect(() => parsePicoLinkSealedPush(sealed({ schema: 'pico.link.push-envelope.v2' })))
      .toThrow('unknown_pico_link_push_schema');
    for (const value of [null, 'push', 42, [sealed()]]) {
      expect(() => parsePicoLinkSealedPush(value)).toThrow('invalid_pico_link_push');
    }
  });

  it('accepts a push that says only what it may', () => {
    expect(parsePicoLinkSealedPush(sealed())).toEqual({
      schema: picoLinkPushEnvelopeSchema,
      push,
      hostSignatureHex: signature,
    });
  });
});

describe('ADR 0150 PU2 - pinned both ways', () => {
  it('refuses a push addressed to another device', () => {
    // It reached this mailbox by leak or by misroute, and acting on it would
    // quietly accept either - the same refusal ADR 0149's collector makes.
    expect(() => assertPicoLinkPushAddressedHere({
      push,
      deviceSigningKeyFingerprintHex: otherDevice,
      hostSigningKeyFingerprintHex: host,
    })).toThrow('pico_link_push_addressed_another_device');
  });

  it('refuses a push from another Home, against the pin', () => {
    // A URL is reachability and a relay is a carrier; only the pinned
    // fingerprint says this is the Home this device belongs to.
    expect(() => assertPicoLinkPushAddressedHere({
      push,
      deviceSigningKeyFingerprintHex: device,
      hostSigningKeyFingerprintHex: otherHost,
    })).toThrow('pico_link_push_from_another_home');
  });

  it('accepts one addressed here by a Home this device pins', () => {
    expect(() => assertPicoLinkPushAddressedHere({
      push,
      deviceSigningKeyFingerprintHex: device,
      hostSigningKeyFingerprintHex: host,
    })).not.toThrow();
  });
});

describe('ADR 0150 PU2 - what the signed bytes refuse', () => {
  it('refuses a fingerprint that is not one', () => {
    for (const field of ['hostSigningKeyFingerprintHex', 'deviceSigningKeyFingerprintHex'] as const) {
      expect(() => buildPicoLinkPushSignatureInput({ ...push, [field]: 'ab' }))
        .toThrow('invalid_fingerprint_length');
    }
  });

  it('refuses an instant that is not one, and a window that runs backwards', () => {
    expect(() => buildPicoLinkPushSignatureInput({ ...push, createdAt: 'today' }))
      .toThrow('invalid_instant');
    expect(() => buildPicoLinkPushSignatureInput({
      ...push,
      createdAt: '2026-08-13T10:15:00.000Z',
      expiresAt: '2026-08-13T10:00:00.000Z',
    })).toThrow('invalid_validity_bounds');
  });

  it('signs the expiry, so a carrier cannot widen the replay window', () => {
    // Carried beside the signature it would be a value a relay could change;
    // inside it, changing it invalidates the push.
    const later = buildPicoLinkPushSignatureInput({ ...push, expiresAt: '2026-08-13T11:00:00.000Z' });
    expect(later).not.toEqual(buildPicoLinkPushSignatureInput(push));
  });

  it('refuses a signature of the wrong length', () => {
    expect(() => parsePicoLinkSealedPush(sealed({ hostSignatureHex: 'ab' })))
      .toThrow('invalid_pico_link_push_signature');
  });
});
