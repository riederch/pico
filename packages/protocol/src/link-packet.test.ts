import { describe, expect, it } from 'vitest';
import {
  MAX_PICO_LINK_PACKET_PAYLOAD_BYTES,
  MIN_PICO_LINK_PACKET_PAYLOAD_BYTES,
  PICO_LINK_SEALED_ENVELOPE_OVERHEAD_BYTES,
  formatPicoLinkPacketAddress,
  isPicoLinkExpiryOnBucket,
  maxPicoLinkPacketLifetimeMs,
  parsePicoLinkPacket,
  parsePicoLinkPacketAddress,
  picoLinkExpiryBucketFor,
  picoLinkExpiryBucketMs,
  picoLinkPacketPayloadBytes,
  picoLinkPacketRemovedFields,
  picoLinkPacketSchema,
} from './link-packet.js';

/**
 * ADR 0147 RY1. What a relay is told, and what it cannot be told.
 *
 * The negative vectors are the point of this file. A parser that merely
 * ignored `priority` would let an operator ask for it and let a sender send
 * it, and the field would be back inside a release without anybody deciding
 * to put it there.
 */
const mailbox = 'a'.repeat(32);
const operator = 'relay.example.invalid';
const to = `${mailbox}@${operator}`;
const tag = 'b'.repeat(32);

/**
 * Der kleinste Nutzinhalt, den es ueberhaupt geben kann - aus der Konstante
 * gerechnet statt getippt. Hier stand `'AAAA'`, drei Byte, und drei Byte sind
 * keine versiegelte Huelle (Befund B244): vierzehn Faelle sprachen ueber ein
 * Paket, das das Produkt nie bauen kann.
 */
const payloadOfBytes = (bytes: number): string =>
  Buffer.from(new Uint8Array(bytes)).toString('base64');
const smallestPayload = payloadOfBytes(MIN_PICO_LINK_PACKET_PAYLOAD_BYTES);

/** 2026-08-12T12:00:00.000Z sits exactly on the quarter-hour grid. */
const expiresAt = '2026-08-12T12:00:00.000Z';
const nowMs = Date.parse('2026-08-12T11:00:00.000Z');

function packet(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: picoLinkPacketSchema,
    to,
    tag,
    expiresAt,
    payload: smallestPayload,
    ...over,
  };
}

describe('ADR 0107 - a payload too small to be a sealed envelope', () => {
  /**
   * Befund B244. Das Paket war nach oben begrenzt und nach unten gar nicht.
   * Base64, nicht leer, Laenge durch vier - das prueft die Kodierung, und das
   * Relay schreibt ueber dieselbe Spalte, was dort liege, sei Chiffrat. Diese
   * Grenze ist die eine Aussage ueber den Inhalt, die diese Schicht wirklich
   * treffen kann: die Konstruktion hat einen Boden.
   */
  it('refuses anything shorter than the sealing costs, and accepts one byte more', () => {
    expect(MIN_PICO_LINK_PACKET_PAYLOAD_BYTES)
      .toBe(PICO_LINK_SEALED_ENVELOPE_OVERHEAD_BYTES + 1);
    for (const bytes of [3, 12, PICO_LINK_SEALED_ENVELOPE_OVERHEAD_BYTES - 1,
      PICO_LINK_SEALED_ENVELOPE_OVERHEAD_BYTES]) {
      const tooSmall = payloadOfBytes(bytes);
      expect(picoLinkPacketPayloadBytes(tooSmall), `${bytes} bytes`).toBe(bytes);
      expect(() => parsePicoLinkPacket(packet({ payload: tooSmall }), nowMs), `${bytes} bytes`)
        .toThrow('pico_link_payload_too_small');
    }
    expect(parsePicoLinkPacket(packet({ payload: smallestPayload }), nowMs).payload)
      .toBe(smallestPayload);
  });

  it('keeps the encoding rules it already had, which say nothing about size', () => {
    // Eine leere Zeichenkette faellt weiterhin als ungueltige Kodierung durch,
    // nicht als zu klein: die alte Regel bleibt die naehere.
    expect(() => parsePicoLinkPacket(packet({ payload: '' }), nowMs))
      .toThrow('invalid_pico_link_payload');
  });
});

describe('ADR 0147 RY1 - the envelope a relay reads', () => {
  it('accepts the four fields that survive the test', () => {
    expect(parsePicoLinkPacket(packet(), nowMs)).toEqual({
      schema: 'pico.link.packet.v1',
      to,
      tag,
      expiresAt,
      payload: smallestPayload,
    });
  });

  it('is frozen, so a caller cannot add a field after parsing', () => {
    const parsed = parsePicoLinkPacket(packet(), nowMs) as unknown as Record<string, unknown>;
    expect(() => {
      parsed.priority = 'urgent';
    }).toThrow();
  });

  describe('the removed fields, one vector each', () => {
    // ADR 0147's core rule: a relay is given what it needs to deliver and
    // nothing that explains why. Each of these was on ADR 0028's conceptual
    // envelope and fails the test "can the carrier deliver without it".
    it('refuses a sender, naming it', () => {
      // The one that makes the rest work. ADR 0031 grades a sender routing
      // identity high, and a per-relationship mailbox already tells the
      // recipient who wrote.
      expect(() => parsePicoLinkPacket(packet({ from: to }), nowMs))
        .toThrow('pico_link_packet_carries_no:from');
    });

    it('refuses a priority, naming it', () => {
      // A carrier that schedules by urgency learns which relationship is in
      // trouble - exactly what ADR 0031 says not to leak.
      expect(() => parsePicoLinkPacket(packet({ priority: 'emergency' }), nowMs))
        .toThrow('pico_link_packet_carries_no:priority');
    });

    it('refuses a content type, naming it', () => {
      expect(() => parsePicoLinkPacket(packet({ contentType: 'pico-link/encrypted' }), nowMs))
        .toThrow('pico_link_packet_carries_no:contentType');
    });

    it('refuses a hop count, naming it', () => {
      // ADR 0028 makes multi-hop routing a non-goal, so a TTL would be a
      // field that means nothing and can be lied about.
      expect(() => parsePicoLinkPacket(packet({ ttl: 3 }), nowMs))
        .toThrow('pico_link_packet_carries_no:ttl');
    });

    it('keeps the four reasons where they can be read', () => {
      expect(Object.keys(picoLinkPacketRemovedFields).sort())
        .toEqual(['contentType', 'from', 'priority', 'ttl']);
    });
  });

  it('refuses any other unknown key rather than ignoring it', () => {
    expect(() => parsePicoLinkPacket(packet({ senderHint: 'x' }), nowMs))
      .toThrow('pico_link_packet_carries_no:senderHint');
  });

  it('names a missing field rather than failing as a shape', () => {
    const { tag: _dropped, ...without } = packet();
    expect(() => parsePicoLinkPacket(without, nowMs))
      .toThrow('missing_pico_link_packet_field:tag');
  });

  it('refuses a packet that is not an object', () => {
    for (const value of [null, undefined, 'packet', 42, [packet()]]) {
      expect(() => parsePicoLinkPacket(value, nowMs)).toThrow('invalid_pico_link_packet');
    }
  });

  it('refuses an unknown schema', () => {
    expect(() => parsePicoLinkPacket(packet({ schema: 'pico.link.packet.v2' }), nowMs))
      .toThrow('unknown_pico_link_packet_schema');
  });
});

describe('ADR 0147 RY3 - the address names its operator', () => {
  it('splits a mailbox from the operator that holds it', () => {
    expect(parsePicoLinkPacketAddress(to)).toEqual({ mailbox, operator });
  });

  it('round-trips through the parser it formats with', () => {
    expect(formatPicoLinkPacketAddress({ mailbox, operator })).toBe(to);
  });

  it('refuses a second operator rather than taking the first', () => {
    // A mailbox that could contain `@` would be a mailbox that can name a
    // different operator - the same class of mistake as a supplier identifier
    // that could contain a slash (ADR 0143 DP8).
    expect(() => parsePicoLinkPacketAddress(`${mailbox}@evil.invalid@${operator}`))
      .toThrow('invalid_pico_link_address');
  });

  it('refuses an address with no operator', () => {
    expect(() => parsePicoLinkPacketAddress(mailbox)).toThrow('invalid_pico_link_address');
    expect(() => parsePicoLinkPacketAddress(`${mailbox}@`)).toThrow('invalid_pico_link_operator');
  });

  it('refuses a guessable mailbox', () => {
    // 128 bits, because an addressable mailbox somebody can guess is an open
    // relay to that one relationship.
    for (const bad of ['alice', 'a'.repeat(31), 'a'.repeat(33), 'A'.repeat(32), `${'a'.repeat(31)}z`]) {
      expect(() => parsePicoLinkPacketAddress(`${bad}@${operator}`))
        .toThrow('invalid_pico_link_mailbox');
    }
  });

  it('refuses an operator carrying reachability detail', () => {
    // No scheme, no port, no path: those are deployment properties, and an
    // address a person hands over must not stop working when a port moves.
    for (const bad of ['https://relay.example.invalid', 'relay.example.invalid:8443', 'relay.example.invalid/inbox', 'relay', '-relay.example.invalid']) {
      expect(() => parsePicoLinkPacketAddress(`${mailbox}@${bad}`))
        .toThrow('invalid_pico_link_operator');
    }
  });

  it('refuses an address that is not a string', () => {
    for (const value of [null, undefined, 42, {}]) {
      expect(() => parsePicoLinkPacketAddress(value)).toThrow('invalid_pico_link_address');
    }
  });
});

describe('ADR 0147 RY6 - a tag without a correlator, an expiry without a clock', () => {
  it('requires a fresh 128-bit tag', () => {
    for (const bad of ['', 'retry-1', 'b'.repeat(31), 'B'.repeat(32)]) {
      expect(() => parsePicoLinkPacket(packet({ tag: bad }), nowMs))
        .toThrow('invalid_pico_link_packet_tag');
    }
  });

  it('refuses an expiry that is not on the bucket grid', () => {
    // Refused rather than rounded on arrival. Rounding would accept the leak
    // and then hide it: the sender would keep producing precise expiries and
    // keep believing they were private.
    expect(() => parsePicoLinkPacket(packet({ expiresAt: '2026-08-12T12:07:31.000Z' }), nowMs))
      .toThrow('pico_link_expiry_not_on_bucket');
  });

  it('rounds up rather than to the nearest bucket', () => {
    // Rounding down would silently shorten the window a caller asked for, and
    // a packet that expired earlier than the sender believed is the quiet
    // failure.
    const justPast = Date.parse('2026-08-12T12:00:01.000Z');
    expect(picoLinkExpiryBucketFor(justPast)).toBe('2026-08-12T12:15:00.000Z');
    expect(picoLinkExpiryBucketFor(Date.parse(expiresAt))).toBe(expiresAt);
    expect(isPicoLinkExpiryOnBucket(picoLinkExpiryBucketFor(justPast))).toBe(true);
  });

  /**
   * Befund B112. Der Ablauf wurde hier mit Breitenmuster plus `Date.parse`
   * geprueft, und `Date.parse` rollt einen unmoeglichen Tag weiter, statt zu
   * scheitern: `2026-02-30T00:00:00.000Z` wurde angenommen und mit *dieser*
   * Zeichenkette gespeichert, waehrend sein wirklicher Zeitpunkt der 2. Maerz
   * ist. Die Ablaufvergleiche des Relays sind Zeichenkettenvergleiche, also
   * sagt der Speicher etwas anderes als die Uhr.
   */
  it('refuses a day that does not exist, however well it is shaped', () => {
    const nearby = Date.parse('2026-02-28T00:00:00.000Z');
    for (const bad of ['2026-02-30T00:00:00.000Z', '2026-02-29T00:00:00.000Z']) {
      expect(() => parsePicoLinkPacket(packet({ expiresAt: bad }), nearby))
        .toThrow('invalid_pico_link_expiry');
    }
  });

  it('refuses an expiry that is not an instant at all', () => {
    for (const bad of ['tomorrow', '2026-08-12', '2026-08-12T12:00:00Z', 42]) {
      expect(() => parsePicoLinkPacket(packet({ expiresAt: bad }), nowMs))
        .toThrow('invalid_pico_link_expiry');
    }
  });

  it('refuses a packet that is already expired, against the reader clock', () => {
    expect(() => parsePicoLinkPacket(packet(), Date.parse('2026-08-12T13:00:00.000Z')))
      .toThrow('pico_link_packet_expired');
  });

  it('refuses a lifetime past the ceiling, because a relay holds until expiry', () => {
    const tooFar = picoLinkExpiryBucketFor(nowMs + maxPicoLinkPacketLifetimeMs + picoLinkExpiryBucketMs);
    expect(() => parsePicoLinkPacket(packet({ expiresAt: tooFar }), nowMs))
      .toThrow('pico_link_lifetime_too_long');
  });

  it('checks neither expiry nor lifetime without a clock', () => {
    // A sender building a packet holds no reader's clock, and the caller is
    // the one that knows which side it is on.
    expect(parsePicoLinkPacket(packet()).expiresAt).toBe(expiresAt);
    expect(parsePicoLinkPacket(packet({ expiresAt: '2019-01-01T00:00:00.000Z' })).expiresAt)
      .toBe('2019-01-01T00:00:00.000Z');
  });
});

describe('ADR 0147 RY6 - a payload a queue can be bounded against', () => {
  it('measures a base64 payload without decoding it', () => {
    expect(picoLinkPacketPayloadBytes('AAAA')).toBe(3);
    expect(picoLinkPacketPayloadBytes('AAA=')).toBe(2);
    expect(picoLinkPacketPayloadBytes('AA==')).toBe(1);
  });

  it('accepts a payload at the ceiling and refuses one past it', () => {
    // Two padding characters land the decoded length exactly on the ceiling;
    // 64 KiB is not divisible by three, so an unpadded payload cannot.
    const groups = (MAX_PICO_LINK_PACKET_PAYLOAD_BYTES + 2) / 3;
    const atCeiling = `${'A'.repeat(groups * 4 - 2)}==`;
    expect(picoLinkPacketPayloadBytes(atCeiling)).toBe(MAX_PICO_LINK_PACKET_PAYLOAD_BYTES);
    expect(parsePicoLinkPacket(packet({ payload: atCeiling }), nowMs).payload).toBe(atCeiling);

    const overCeiling = `${'A'.repeat(groups * 4 + 2)}==`;
    expect(picoLinkPacketPayloadBytes(overCeiling)).toBeGreaterThan(MAX_PICO_LINK_PACKET_PAYLOAD_BYTES);
    expect(() => parsePicoLinkPacket(packet({ payload: overCeiling }), nowMs))
      .toThrow('pico_link_payload_too_large');
  });

  it('refuses a payload that is not base64, or empty', () => {
    for (const bad of ['', 'not base64!', 'AAA', 'AA=A']) {
      expect(() => parsePicoLinkPacket(packet({ payload: bad }), nowMs))
        .toThrow('invalid_pico_link_payload');
    }
  });
});
