import { hasExactKeys, hexToBytes } from '@pico/protocol/canonical-bytes';
import {
  buildPicoRecoveryCardPayload,
  buildPicoRecoveryCardScanTransport,
  type PicoRecoveryCardPayload,
} from '@pico/protocol';
import type { PicoVaultRecoveryCard } from '@pico/vault';

/**
 * ADR 0132 G1 - what the card says, separated from how it looks.
 *
 * The user's decision on 2026-08-09, after reading the generator: its input
 * should be the essential facts, split into Pico content and design, so the
 * card's appearance can be worked on without touching anything else.
 *
 * **The split introduces a hazard that did not exist before it, and this file
 * is where it is closed.** Today the printed fingerprint and the QR bytes come
 * from one card, so they cannot disagree. The moment `content` is a value a
 * caller can hold, a caller can hold one whose printed fingerprint says one
 * thing and whose canonical payload says another - and a recovery card whose
 * two halves disagree is worse than no card, because a person reads the
 * fingerprint to check that the scan gave them the right identity. The check
 * they would be making would be against a number that came from the same lie.
 *
 * So there is **one** way to obtain a content, it derives every printed field
 * from the canonical payload rather than accepting them alongside it, and it
 * refuses a card whose halves do not round-trip. The safety is not that a
 * caller is careful; it is that a caller has no parameter through which to be
 * careless - ADR 0117 X1's construction, at the place where the consequence is
 * a person restoring the wrong identity.
 */
export interface PicoRecoveryCardContent {
  /** Printed large on the front. */
  picoName: string;
  /** Printed on the front, and the thing a person checks a scan against. */
  identityKeyFingerprintHex: string;
  homeNameOrId: string;
  endpointHint: string;
  /** ISO instant. Only the date is printed; the generator does the slicing. */
  issuedAt: string;
  /** The twenty-four words, printed on the back. */
  recoveryPhrase: string;
  /** Exactly what the QR carries: the ASCII transport over canonical bytes. */
  qrPayload: Uint8Array;
  /** The canonical bytes themselves, as hex, for the round-trip comparison. */
  canonicalPayloadHex: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * ADR 0110/0134 F2. The card as a whole is well-formed, and its canonical hex
 * is the canonicalization of its own payload rather than a hex string sitting
 * beside it.
 *
 * Exported because the generator asserts the same thing on the same card, and
 * two copies of this would be two places for the round-trip to be wrong about
 * one card.
 */
export function assertPicoRecoveryCard(card: PicoVaultRecoveryCard): void {
  if (
    !isRecord(card)
    || !hasExactKeys(card, ['payload', 'recoveryPhrase', 'canonicalPayloadHex'])
    || !isRecord(card.payload)
    || card.payload.pinProtected !== true
    || typeof card.recoveryPhrase !== 'string'
    || card.recoveryPhrase.trim().split(/\s+/u).length !== 24
    || typeof card.canonicalPayloadHex !== 'string'
    || !/^(?:[0-9a-f]{2})+$/u.test(card.canonicalPayloadHex)
  ) {
    throw new Error('invalid_recovery_card');
  }
  const canonical = buildPicoRecoveryCardPayload(
    card.payload as unknown as PicoRecoveryCardPayload,
  );
  if (Buffer.from(canonical).toString('hex') !== card.canonicalPayloadHex) {
    throw new Error('recovery_card_payload_mismatch');
  }
}

/**
 * ADR 0132 G1. The single card-to-content mapping.
 *
 * Every printed field is read out of `card.payload`, which
 * `assertPicoRecoveryCard` has just proved to be the source of
 * `canonicalPayloadHex`, which is what the QR carries. There is therefore no
 * arrangement of inputs that produces a content whose two halves disagree -
 * not because the mapping checks for it afterwards, but because the printed
 * side and the scanned side are read from the same bytes.
 */
export function picoRecoveryCardContent(
  card: PicoVaultRecoveryCard,
): PicoRecoveryCardContent {
  assertPicoRecoveryCard(card);
  const payload = card.payload as unknown as PicoRecoveryCardPayload;
  return Object.freeze({
    picoName: payload.picoName,
    identityKeyFingerprintHex: payload.identityKeyFingerprintHex,
    homeNameOrId: payload.homeNameOrId,
    endpointHint: payload.endpointHint,
    issuedAt: payload.issuedAt,
    recoveryPhrase: card.recoveryPhrase,
    qrPayload: new TextEncoder().encode(
      buildPicoRecoveryCardScanTransport(hexToBytes(card.canonicalPayloadHex)),
    ),
    canonicalPayloadHex: card.canonicalPayloadHex,
  });
}

/**
 * ADR 0132 G1/G5. Refuses a content whose printed half and scanned half do not
 * agree.
 *
 * `picoRecoveryCardContent` cannot produce one - which is the point - so this
 * exists for the case the split actually creates: a `content` assembled by
 * hand, read back from somewhere, or edited between mapping and drawing. The
 * generator calls it immediately before it prints, so the last thing checked
 * is the thing that gets laid on paper.
 *
 * The comparison is done by re-deriving the canonical payload from the printed
 * fields and requiring it to be the bytes the QR carries. A weaker check -
 * "does the fingerprint appear somewhere in the payload" - would pass for a
 * content where the *name* had been changed, and a person restoring from a
 * card that names someone else's Pico is exactly the failure this gate is
 * about.
 */
export function assertPicoRecoveryCardContent(
  content: PicoRecoveryCardContent,
  card: PicoVaultRecoveryCard,
): void {
  assertPicoRecoveryCard(card);
  const payload = card.payload as unknown as PicoRecoveryCardPayload;

  const printedAgrees = content.picoName === payload.picoName
    && content.identityKeyFingerprintHex === payload.identityKeyFingerprintHex
    && content.homeNameOrId === payload.homeNameOrId
    && content.endpointHint === payload.endpointHint
    && content.issuedAt === payload.issuedAt
    && content.recoveryPhrase === card.recoveryPhrase;
  if (!printedAgrees) {
    throw new Error('recovery_card_content_mismatch');
  }
  if (content.canonicalPayloadHex !== card.canonicalPayloadHex) {
    throw new Error('recovery_card_content_mismatch');
  }
  const expectedQr = new TextEncoder().encode(
    buildPicoRecoveryCardScanTransport(hexToBytes(card.canonicalPayloadHex)),
  );
  if (Buffer.compare(Buffer.from(content.qrPayload), Buffer.from(expectedQr)) !== 0) {
    throw new Error('recovery_card_content_mismatch');
  }
}
