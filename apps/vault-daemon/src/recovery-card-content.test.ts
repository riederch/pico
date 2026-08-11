import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { picoRecoveryCardSchema } from '@pico/protocol';
import type { PicoVaultRecoveryCard } from '@pico/vault';
import { describe, expect, it } from 'vitest';
import {
  assertPicoRecoveryCard,
  assertPicoRecoveryCardContent,
  picoRecoveryCardContent,
  type PicoRecoveryCardContent,
} from './recovery-card-content.js';

/**
 * ADR 0132 G1 and G5.
 *
 * The split into content and design introduces a hazard that did not exist
 * before it: two halves that can disagree. Today the printed fingerprint and
 * the QR bytes come from one card and cannot; the moment a `content` is a
 * value somebody can hold, somebody can hold a wrong one.
 *
 * A card whose halves disagree is worse than no card. A person reads the
 * printed fingerprint to check that the scan gave them the right identity, and
 * if both halves came from the same lie the check they are making is empty.
 */
function fixtureCard(): PicoVaultRecoveryCard {
  const fixture = JSON.parse(readFileSync(resolve(
    process.cwd(),
    '../../docs/protocol/fixtures/home-device-recovery/suite.json',
  ), 'utf8')) as {
    mnemonicPin: {
      identityKeyFingerprintHex: string;
      protectedSeedMaterialHex: string;
      protectedRecoveryPhrase: string;
      issuedCanonicalPayloadHex: string;
      issuance: Record<string, string>;
    };
  };
  const vector = fixture.mnemonicPin;
  return {
    payload: {
      schema: picoRecoveryCardSchema,
      suite: 'pico.suite.id.v1',
      picoName: vector.issuance.picoName!,
      homeNameOrId: vector.issuance.homeNameOrId!,
      seedMaterialHex: vector.protectedSeedMaterialHex,
      pinProtected: true,
      identityKeyFingerprintHex: vector.identityKeyFingerprintHex,
      homeId: vector.issuance.homeId!,
      homeHostPicoIdentityFingerprintHex:
        vector.issuance.homeHostPicoIdentityFingerprintHex!,
      hostSigningKeyFingerprintHex: vector.issuance.hostSigningKeyFingerprintHex!,
      hostKeyAgreementKeyFingerprintHex:
        vector.issuance.hostKeyAgreementKeyFingerprintHex!,
      hostKeyAgreementPublicKeyHex: vector.issuance.hostKeyAgreementPublicKeyHex!,
      endpointHint: vector.issuance.endpointHint!,
      issuedAt: vector.issuance.issuedAt!,
    },
    recoveryPhrase: vector.protectedRecoveryPhrase,
    canonicalPayloadHex: vector.issuedCanonicalPayloadHex,
  } as PicoVaultRecoveryCard;
}

describe('ADR 0132 G1 - one mapping, and both halves from the same bytes', () => {
  it('carries every printed fact and the QR payload', () => {
    const card = fixtureCard();
    const content = picoRecoveryCardContent(card);

    expect(content.identityKeyFingerprintHex)
      .toBe((card.payload as { identityKeyFingerprintHex: string }).identityKeyFingerprintHex);
    expect(content.recoveryPhrase).toBe(card.recoveryPhrase);
    expect(content.canonicalPayloadHex).toBe(card.canonicalPayloadHex);
    expect(content.qrPayload.byteLength).toBeGreaterThan(0);
    expect(Object.isFrozen(content)).toBe(true);
  });

  it('reads the printed fields out of the payload the QR carries', () => {
    // Not "checks that they agree afterwards" - they are read from the same
    // bytes, so there is no arrangement of inputs that produces a content
    // whose halves differ.
    const card = fixtureCard();
    expect(() => assertPicoRecoveryCardContent(picoRecoveryCardContent(card), card))
      .not.toThrow();
  });

  it('refuses a card whose canonical hex is not its own payload', () => {
    const card = fixtureCard();
    expect(() => picoRecoveryCardContent({
      ...card,
      canonicalPayloadHex: `${card.canonicalPayloadHex.slice(0, -2)}ff`,
    } as PicoVaultRecoveryCard)).toThrow('recovery_card_payload_mismatch');
  });

  it('refuses a card that is not one', () => {
    expect(() => assertPicoRecoveryCard({} as PicoVaultRecoveryCard))
      .toThrow('invalid_recovery_card');
    expect(() => assertPicoRecoveryCard({
      ...fixtureCard(),
      pin: 'pico42',
    } as PicoVaultRecoveryCard)).toThrow('invalid_recovery_card');
  });

  it('offers no depiction slot', () => {
    // ADR 0132 G4, from the content side. ADR 0013 forbids this card a
    // Character depiction today, so a field for one would pre-empt a product
    // decision nobody has taken. Asserted over the keys rather than left as an
    // unused field, because an unused field is one a later caller fills in.
    expect(Object.keys(picoRecoveryCardContent(fixtureCard())).sort()).toEqual([
      'canonicalPayloadHex',
      'endpointHint',
      'homeNameOrId',
      'identityKeyFingerprintHex',
      'issuedAt',
      'picoName',
      'qrPayload',
      'recoveryPhrase',
    ]);
  });
});

describe('ADR 0132 G5 - a content whose halves disagree is refused', () => {
  const cases: Array<[string, (content: PicoRecoveryCardContent) => PicoRecoveryCardContent]> = [
    ['a printed fingerprint that is not in the QR bytes', (content) => ({
      ...content,
      identityKeyFingerprintHex: `${content.identityKeyFingerprintHex.slice(0, -2)}ff`,
    })],
    // The case a weaker check would miss: the fingerprint still matches, and a
    // person would be restoring an identity labelled with someone else's name.
    ['a name that belongs to a different Pico', (content) => ({
      ...content,
      picoName: 'Somebody Else',
    })],
    ['a phrase that is not the one the payload protects', (content) => ({
      ...content,
      recoveryPhrase: content.recoveryPhrase.split(' ').reverse().join(' '),
    })],
    ['a QR payload swapped for another', (content) => ({
      ...content,
      qrPayload: new TextEncoder().encode('PICO-RC1:not-the-same-bytes'),
    })],
    ['canonical hex that no longer matches the card', (content) => ({
      ...content,
      canonicalPayloadHex: `${content.canonicalPayloadHex.slice(0, -2)}ff`,
    })],
  ];

  for (const [what, corrupt] of cases) {
    it(`refuses ${what}`, () => {
      const card = fixtureCard();
      expect(() => assertPicoRecoveryCardContent(corrupt(picoRecoveryCardContent(card)), card))
        .toThrow('recovery_card_content_mismatch');
    });
  }

  it('accepts the content the mapping produced', () => {
    // So the refusals above are about disagreement and not about the check
    // rejecting everything.
    const card = fixtureCard();
    expect(() => assertPicoRecoveryCardContent(picoRecoveryCardContent(card), card))
      .not.toThrow();
  });
});
