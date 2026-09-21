import sodium from 'libsodium-wrappers-sumo';
import {
  MIN_PICO_LINK_PACKET_PAYLOAD_BYTES,
  PICO_LINK_SEALED_ENVELOPE_OVERHEAD_BYTES,
} from '@pico/protocol/link-packet';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Befund B244. `@pico/protocol` haengt nicht an libsodium, also nennt es den
 * Aufschlag der Versiegelung als Konstante - und eine Zahl, die an zwei Orten
 * gilt und nur an einem steht, driftet. Gebunden wird sie hier, wo libsodium
 * wirklich liegt.
 *
 * Gefragt wird nicht nur die Konstante, sondern die Versiegelung selbst: was
 * `crypto_box_seal` aus null Byte Klartext macht, *ist* der Aufschlag.
 */
describe('ADR 0107 - what the sealing costs, asked of the sealing', () => {
  beforeAll(async () => {
    await sodium.ready;
  });

  it('is the number the protocol restates', () => {
    expect(PICO_LINK_SEALED_ENVELOPE_OVERHEAD_BYTES).toBe(sodium.crypto_box_SEALBYTES);
    expect(MIN_PICO_LINK_PACKET_PAYLOAD_BYTES)
      .toBe(sodium.crypto_box_SEALBYTES + 1);
  });

  it('is what a sealed envelope actually measures, empty and then not', () => {
    const recipient = sodium.crypto_box_keypair();
    const sealed = (bytes: number) => sodium
      .crypto_box_seal(new Uint8Array(bytes), recipient.publicKey).length;
    expect(sealed(0)).toBe(PICO_LINK_SEALED_ENVELOPE_OVERHEAD_BYTES);
    expect(sealed(1)).toBe(MIN_PICO_LINK_PACKET_PAYLOAD_BYTES);
    for (const plaintext of [10, 100, 1_000]) {
      expect(sealed(plaintext), `${plaintext} bytes`)
        .toBe(PICO_LINK_SEALED_ENVELOPE_OVERHEAD_BYTES + plaintext);
    }
  });

  it('means the smallest real envelope this Home sends clears the floor', () => {
    /**
     * Die Untergrenze ist ein Boden, keine Beschreibung: ein echtes Paket
     * traegt eine JSON-Huelle mit Schema, Signatur und zwei Fingerabdruecken
     * und liegt weit darueber. Wenn diese Behauptung je faellt, ist entweder
     * die Huelle geschrumpft oder der Boden zu hoch.
     */
    const recipient = sodium.crypto_box_keypair();
    const envelope = JSON.stringify({
      schema: 'pico.link.push.envelope.v1',
      push: {
        suite: 'x', pushId: 'y', hostSigningKeyFingerprintHex: 'a'.repeat(64),
        deviceSigningKeyFingerprintHex: 'b'.repeat(64),
        createdAt: '2026-09-21T00:00:00.000Z', expiresAt: '2026-09-22T00:00:00.000Z',
      },
      hostSignatureHex: 'c'.repeat(128),
    });
    const sealed = sodium.crypto_box_seal(
      new TextEncoder().encode(envelope),
      recipient.publicKey,
    );
    expect(sealed.length).toBeGreaterThan(MIN_PICO_LINK_PACKET_PAYLOAD_BYTES);
  });
});
