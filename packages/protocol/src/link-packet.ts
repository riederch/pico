/**
 * ADR 0147 RY1 - the envelope a relay reads, and the fields that are not on
 * it.
 *
 * **Nothing signs this.** ADR 0107 seals and signs end to end, and those bytes
 * travel here unchanged as an opaque payload; the envelope is what a carrier
 * that must not read the payload is allowed to see. So there is no signature
 * input to build, no canonical byte layout to agree on and no suite - a
 * carrier compares nothing, it delivers. Building signing machinery here would
 * be machinery that carries nothing.
 *
 * What there is instead is a **refusal**. The core rule of ADR 0147 is that a
 * relay is given what it needs to deliver and nothing that explains why, and
 * the enforcement is ADR 0117 X1's construction rather than a policy document:
 * there is no field for a sender, a priority, a content type or a hop count,
 * and `parsePicoLinkPacket` refuses an unknown key outright. An operator
 * cannot ask for priority, because a packet carrying one is not a packet.
 *
 * The four that survive, each because a carrier cannot deliver without it:
 *
 * - `to` - where. A per-relationship mailbox at a named operator (ADR 0147
 *   RY2/RY3), never a Pico identity.
 * - `tag` - which. Fresh per packet, so a retry can be recognised as one and
 *   two packets cannot be linked to one sender by their tags.
 * - `expiresAt` - until when to keep it, on a coarse grid rather than as an
 *   instant, because a precise expiry leaks the sender's clock and how long
 *   the sender believes the thing matters.
 * - `payload` - what, sealed.
 */

import { hexOfBytesPattern } from './canonical-bytes.js';
import { assertPicoInstant } from './instant.js';

export const picoLinkPacketSchema = 'pico.link.packet.v1' as const;

/**
 * A mailbox is issued by the recipient to exactly one peer, so it has to be
 * unguessable: 128 bits, because an addressable mailbox somebody can guess is
 * an open relay to that relationship.
 *
 * Lowercase hex rather than something denser on purpose. This value is read
 * aloud, copied between devices and pasted into a credential ceremony, and the
 * character set that survives that is the boring one.
 */
export const picoLinkMailboxPattern = hexOfBytesPattern(16);

/**
 * The operator half of an address. A hostname, because the sender resolves it
 * to reach the operator the recipient chose - and deliberately nothing richer:
 * no scheme, no port, no path. Those are reachability details a deployment
 * owns, and putting them in an address a person hands over would make the
 * address stop working when the operator moves a port.
 */
export const picoLinkOperatorPattern =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u;

/** Fresh per packet, and reused only to retry that same packet. */
export const picoLinkPacketTagPattern = hexOfBytesPattern(16);

/**
 * ADR 0147 RY6. The grid an expiry snaps to.
 *
 * Fifteen minutes is coarse enough that the value says nothing about the
 * sender's clock beyond the quarter hour, and fine enough that a queue clears
 * predictably. A relay never sees a timestamp that was not rounded, because a
 * packet carrying one is refused rather than rounded on arrival - rounding it
 * for the sender would hide the leak instead of preventing it.
 */
export const picoLinkExpiryBucketMs = 15 * 60 * 1_000;

/**
 * How far ahead an expiry may sit. A relay holds until expiry, so an unbounded
 * expiry is an unbounded queue, and a mailbox nobody collects would fill with
 * packets nobody can dislodge.
 */
export const maxPicoLinkPacketLifetimeMs = 7 * 24 * 60 * 60 * 1_000;

/**
 * Bounded so a queue can be bounded. A relay is a carrier, not a transfer
 * service: what does not fit belongs to sync, which moves it where the two
 * ends can talk directly (ADR 0028's packet classes say the same in prose).
 */
export const MAX_PICO_LINK_PACKET_PAYLOAD_BYTES = 64 * 1024;

/**
 * Was die Versiegelung selbst kostet, unabhaengig davon, was darin steht.
 *
 * ADR 0107 versiegelt mit `crypto_box_seal`: ein fluechtiger oeffentlicher
 * Schluessel (32 Byte) und ein Authentifizierungsmerkmal (16 Byte) liegen vor
 * dem Chiffrat. `crypto_box_SEALBYTES` nennt dieselbe Zahl, und
 * `link-packet-floor.test.ts` bindet diese Konstante daran - dieses Paket
 * haengt nicht an libsodium, also ist sie hier genannt und dort geprueft,
 * dieselbe Anordnung wie bei jeder anderen Abschrift in diesem Baum.
 */
export const PICO_LINK_SEALED_ENVELOPE_OVERHEAD_BYTES = 48;

/**
 * Befund B244. Die Untergrenze eines Nutzinhalts, **abgeleitet statt
 * geschaetzt**.
 *
 * Das Paket war nach oben begrenzt und nach unten gar nicht: Base64, nicht
 * leer, Laenge durch vier. Das prueft die *Kodierung*. Das Relay schreibt
 * ueber dieselbe Spalte "the payload is ciphertext this relay has no key
 * for" - eine Aussage ueber den *Inhalt*, die an der Tuer niemand haelt. Vier
 * Zeichen Base64 sind drei Byte, und drei Byte koennen keine versiegelte
 * Huelle sein.
 *
 * Genau so weit geht diese Regel und keinen Schritt weiter: ueber den Inhalt
 * der Huelle weiss diese Schicht nichts und soll nichts wissen. Aber die
 * *Konstruktion* hat einen Boden, und der ist nachrechenbar - Aufschlag plus
 * mindestens ein Byte Klartext. Alles darunter ist beweisbar keine Huelle,
 * und was beweisbar falsch ist, gehoert an der Tuer abgewiesen statt im Fach
 * eines Menschen abgelegt.
 */
export const MIN_PICO_LINK_PACKET_PAYLOAD_BYTES =
  PICO_LINK_SEALED_ENVELOPE_OVERHEAD_BYTES + 1;

/**
 * ADR 0147 RY6. How many live packets one mailbox holds before it refuses.
 *
 * Thirty-two, and the figure follows from what a mailbox is *for*: one
 * relationship's traffic between two collections. A Home that has been
 * unreachable for a day and a peer that writes hourly is well inside it, and a
 * peer that has written thirty-two times without the other side ever
 * collecting is one whose next packet is not the problem.
 *
 * Visible here rather than chosen by a relay, because a full mailbox refuses
 * (never evicts) and a person deserves the same ceiling wherever they hold
 * one.
 */
export const defaultPicoLinkMailboxCapacity = 32;

/**
 * ADR 0149. How often each end reads its own mailboxes.
 *
 * Two minutes, and the figure is chosen against the *opposite* consideration
 * from ADR 0143's six-hour depot sweep. A depot sweep is a repair and being
 * late costs nothing; a mailbox holds a person's traffic, and being late is
 * the person waiting. Two minutes is the longest wait that still reads as a
 * message arriving rather than as one that did not.
 *
 * It is a floor on latency and not a promise: a relay is what a person falls
 * back to when the direct path is gone, so the honest claim is that a reply
 * arrives, not that it arrives quickly.
 */
export const defaultPicoLinkRelaySweepIntervalMs = 2 * 60 * 1_000;

/**
 * ADR 0148 EX1. The operator a Home issues its own mailboxes at when a
 * deployment has not chosen one.
 *
 * `.invalid` is reserved by RFC 2606 and resolves nowhere, deliberately: a
 * default that pointed at a real operator would enrol people with a stranger
 * by omission. Issuing an address here produces a mailbox nobody can deliver
 * to, which is the honest state for a Home whose owner has not chosen a
 * relay - visible, and not quietly working through somebody else's machine.
 */
export const defaultPicoLinkRelayOperator = 'unconfigured.relay.invalid';

export interface PicoLinkPacketAddress {
  mailbox: string;
  operator: string;
}

export interface PicoLinkPacket {
  schema: typeof picoLinkPacketSchema;
  /** `<mailbox>@<operator>`. */
  to: string;
  tag: string;
  expiresAt: string;
  /** Base64 of the ADR 0107 sealed envelope. Opaque here, and only here. */
  payload: string;
}

const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/u;

/**
 * ADR 0147 RY3. Splits an address into the mailbox and the operator that holds
 * it.
 *
 * A sender derives the operator from the address rather than being configured
 * with one, which is what makes several operators a deployment fact instead of
 * a feature: nothing in the wire changes between a person using one operator
 * and five, because every address says where it lives.
 *
 * Split on the last `@` and refuse a second one rather than accepting the
 * first: a mailbox that could contain `@` would be a mailbox that can name a
 * different operator, which is the same class of mistake as a supplier
 * identifier that could contain a slash (ADR 0143 DP8).
 */
export function parsePicoLinkPacketAddress(value: unknown): PicoLinkPacketAddress {
  if (typeof value !== 'string') {
    throw new Error('invalid_pico_link_address');
  }
  const parts = value.split('@');
  if (parts.length !== 2) {
    throw new Error('invalid_pico_link_address');
  }
  const [mailbox, operator] = parts as [string, string];
  if (!picoLinkMailboxPattern.test(mailbox)) {
    throw new Error('invalid_pico_link_mailbox');
  }
  if (!picoLinkOperatorPattern.test(operator)) {
    throw new Error('invalid_pico_link_operator');
  }
  return Object.freeze({ mailbox, operator });
}

export function formatPicoLinkPacketAddress(address: PicoLinkPacketAddress): string {
  const formatted = `${address.mailbox}@${address.operator}`;
  // Formatted through the parser rather than beside it, so the two cannot
  // drift into accepting and producing different things.
  parsePicoLinkPacketAddress(formatted);
  return formatted;
}

/** ADR 0147 RY6. Whether an instant sits on the bucket grid. */
export function isPicoLinkExpiryOnBucket(expiresAt: string): boolean {
  return Date.parse(expiresAt) % picoLinkExpiryBucketMs === 0;
}

/**
 * ADR 0147 RY6. Rounds an intended expiry **up** to the next bucket.
 *
 * Up rather than to-nearest: rounding down would silently shorten the window a
 * caller asked for, and a packet that expired earlier than the sender believed
 * is the quiet failure. A caller that wants a shorter window asks for one.
 */
export function picoLinkExpiryBucketFor(intendedExpiryMs: number): string {
  if (!Number.isSafeInteger(intendedExpiryMs) || intendedExpiryMs <= 0) {
    throw new Error('invalid_pico_link_expiry');
  }
  const bucketed = Math.ceil(intendedExpiryMs / picoLinkExpiryBucketMs) * picoLinkExpiryBucketMs;
  return new Date(bucketed).toISOString();
}

/**
 * ADR 0147 RY1. The parser, and the whole enforcement of the core rule.
 *
 * `nowMs` is a parameter rather than a clock read here, because whether a
 * packet is already expired is a question about the reader's clock and this
 * module holds none. Absent, the lifetime ceiling is not checked at all -
 * which is right for a sender building a packet and wrong for a relay
 * accepting one, and the caller is the one that knows which it is.
 */
export function parsePicoLinkPacket(value: unknown, nowMs?: number): PicoLinkPacket {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_pico_link_packet');
  }
  const record = value as Record<string, unknown>;

  const expected = ['schema', 'to', 'tag', 'expiresAt', 'payload'];
  const unexpected = Object.keys(record).find((key) => !expected.includes(key));
  if (unexpected !== undefined) {
    // Named rather than reported as a shape failure. A caller sending
    // `priority` has not made a typo - it is asking for the thing ADR 0147
    // removed, and it should be told that rather than left to guess.
    throw new Error(`pico_link_packet_carries_no:${unexpected}`);
  }
  const missing = expected.find((key) => !(key in record));
  if (missing !== undefined) {
    throw new Error(`missing_pico_link_packet_field:${missing}`);
  }

  if (record.schema !== picoLinkPacketSchema) {
    throw new Error('unknown_pico_link_packet_schema');
  }
  if (typeof record.to !== 'string') {
    throw new Error('invalid_pico_link_address');
  }
  parsePicoLinkPacketAddress(record.to);

  if (typeof record.tag !== 'string' || !picoLinkPacketTagPattern.test(record.tag)) {
    throw new Error('invalid_pico_link_packet_tag');
  }

  /**
   * Befund B112: die eine Antwort statt einer zweiten Fassung.
   *
   * Hier stand Breitenmuster plus `Date.parse`, und das ist genau die Paarung,
   * die `instant.ts` in ihrem eigenen Kopf als unzureichend benennt: `Date.parse`
   * rollt `2026-02-30` auf den 2. Maerz, statt zu scheitern. Gegangen und nicht
   * vermutet - ein Paket mit `expiresAt: '2026-02-30T00:00:00.000Z'` wurde
   * angenommen und mit dieser Zeichenkette gespeichert, waehrend sein
   * wirklicher Zeitpunkt zwei Tage spaeter lag, und die Ablaufvergleiche des
   * Relays sind Zeichenkettenvergleiche.
   */
  assertPicoInstant(record.expiresAt, 'invalid_pico_link_expiry');
  if (!isPicoLinkExpiryOnBucket(record.expiresAt)) {
    // Refused rather than rounded here. Rounding an off-grid instant would
    // accept the leak and then hide it: the sender would keep producing
    // precise expiries and keep believing they were private.
    throw new Error('pico_link_expiry_not_on_bucket');
  }

  if (typeof record.payload !== 'string'
    || record.payload.length === 0
    || !base64Pattern.test(record.payload)
    || record.payload.length % 4 !== 0) {
    throw new Error('invalid_pico_link_payload');
  }
  if (picoLinkPacketPayloadBytes(record.payload) > MAX_PICO_LINK_PACKET_PAYLOAD_BYTES) {
    throw new Error('pico_link_payload_too_large');
  }
  if (picoLinkPacketPayloadBytes(record.payload) < MIN_PICO_LINK_PACKET_PAYLOAD_BYTES) {
    throw new Error('pico_link_payload_too_small');
  }

  if (nowMs !== undefined) {
    const expiresAtMs = Date.parse(record.expiresAt);
    if (expiresAtMs <= nowMs) {
      throw new Error('pico_link_packet_expired');
    }
    if (expiresAtMs - nowMs > maxPicoLinkPacketLifetimeMs) {
      throw new Error('pico_link_lifetime_too_long');
    }
  }

  return Object.freeze({
    schema: picoLinkPacketSchema,
    to: record.to,
    tag: record.tag,
    expiresAt: record.expiresAt,
    payload: record.payload,
  });
}

/** Decoded length of a base64 payload, without decoding it. */
export function picoLinkPacketPayloadBytes(payload: string): number {
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return (payload.length / 4) * 3 - padding;
}

/**
 * ADR 0147 RY1. The fields ADR 0028's conceptual envelope carried and this one
 * does not, named so a check can assert their absence rather than a reader
 * having to notice it.
 *
 * Kept as data because the reason each is gone is a decision somebody made,
 * and a list somebody has to maintain is where that decision stays visible.
 */
export const picoLinkPacketRemovedFields = Object.freeze({
  /** ADR 0031 grades it high, and a mailbox is the sender's identity already. */
  from: 'a mailbox belongs to one relationship, so the sender is already named by where it arrived',
  /** ADR 0031: avoid leaking emergency or relationship meaning. */
  priority: 'a carrier that schedules by urgency learns which relationship is in trouble',
  /** For the recipient, never for the carrier. */
  contentType: 'what kind of traffic this is belongs inside the seal',
  /** ADR 0028 makes multi-hop routing a non-goal. */
  ttl: 'there is one hop, so a hop count would be a field that means nothing and can be lied about',
} as const);
