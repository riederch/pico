import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PicoVaultRecoveryCard } from '@pico/vault';
import { picoRecoveryCardSchema } from '@pico/protocol';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  createPicoRecoveryCardQrMatrix,
  generatePicoRecoveryCardPdfs,
  picoRecoveryCardQrPayload,
  PICO_RECOVERY_CARD_PDF_LAYOUT,
  PICO_RECOVERY_CARD_QR_PREFIX,
} from './recovery-card-pdf.js';

describe('ADR 0110 reproducible Recovery Card PDFs', () => {
  it('carries the canonical payload bytes through the fixed ASCII transport', () => {
    const card = fixtureCard();
    const transport = Buffer.from(picoRecoveryCardQrPayload(card))
      .toString('ascii');
    expect(transport.startsWith(PICO_RECOVERY_CARD_QR_PREFIX)).toBe(true);
    expect(Buffer.from(
      transport.slice(PICO_RECOVERY_CARD_QR_PREFIX.length),
      'base64url',
    ).toString('hex')).toBe(card.canonicalPayloadHex);

    const matrix = createPicoRecoveryCardQrMatrix(card);
    expect(matrix.size).toBeGreaterThan(20);
    expect(matrix.data).toHaveLength(matrix.size * matrix.size);
    expect([...matrix.data].some((value) => value === 0)).toBe(true);
    expect([...matrix.data].some((value) => value === 1)).toBe(true);
    expect(Buffer.from(matrix.payload).toString('ascii')).toBe(transport);
  });

  it('generates exact ID-1 duplex pages and one actual-size A4 fold sheet', async () => {
    const generated = await generatePicoRecoveryCardPdfs(fixtureCard(), {
      specimen: true,
    });
    expect(Buffer.from(generated.cardPrinterPdf.subarray(0, 5)).toString())
      .toBe('%PDF-');
    expect(Buffer.from(generated.paperPrintablePdf.subarray(0, 5)).toString())
      .toBe('%PDF-');

    const cardDocument = await PDFDocument.load(generated.cardPrinterPdf);
    expect(cardDocument.getPageCount()).toBe(2);
    for (const page of cardDocument.getPages()) {
      expect(page.getWidth()).toBeCloseTo(
        PICO_RECOVERY_CARD_PDF_LAYOUT.cardWidthPt,
        6,
      );
      expect(page.getHeight()).toBeCloseTo(
        PICO_RECOVERY_CARD_PDF_LAYOUT.cardHeightPt,
        6,
      );
    }

    const paperDocument = await PDFDocument.load(
      generated.paperPrintablePdf,
    );
    expect(paperDocument.getPageCount()).toBe(1);
    const paper = paperDocument.getPage(0);
    expect(paper.getWidth()).toBeCloseTo(
      PICO_RECOVERY_CARD_PDF_LAYOUT.paperWidthPt,
      6,
    );
    expect(paper.getHeight()).toBeCloseTo(
      PICO_RECOVERY_CARD_PDF_LAYOUT.paperHeightPt,
      6,
    );
    expect(PICO_RECOVERY_CARD_PDF_LAYOUT.paperCardScale).toBe(0.98);

    const repeated = await generatePicoRecoveryCardPdfs(fixtureCard(), {
      specimen: true,
    });
    expect(repeated.cardPrinterPdf).toEqual(generated.cardPrinterPdf);
    expect(repeated.paperPrintablePdf)
      .toEqual(generated.paperPrintablePdf);
  });

  it('rejects plain, altered and PIN-bearing card objects', async () => {
    const card = fixtureCard();
    await expect(generatePicoRecoveryCardPdfs({
      ...card,
      payload: { ...card.payload, pinProtected: false },
    } as PicoVaultRecoveryCard)).rejects.toThrow('invalid_recovery_card');
    await expect(generatePicoRecoveryCardPdfs({
      ...card,
      canonicalPayloadHex: `ff${card.canonicalPayloadHex.slice(2)}`,
    })).rejects.toThrow('recovery_card_payload_mismatch');
    await expect(generatePicoRecoveryCardPdfs({
      ...card,
      pin: 'pico42',
    } as PicoVaultRecoveryCard)).rejects.toThrow('invalid_recovery_card');
  });
});

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
      issuance: {
        picoName: string;
        homeNameOrId: string;
        homeId: string;
        homeHostPicoIdentityFingerprintHex: string;
        hostSigningKeyFingerprintHex: string;
        hostKeyAgreementKeyFingerprintHex: string;
        hostKeyAgreementPublicKeyHex: string;
        endpointHint: string;
        issuedAt: string;
      };
    };
  };
  const vector = fixture.mnemonicPin;
  return {
    payload: {
      schema: picoRecoveryCardSchema,
      suite: 'pico.suite.id.v1',
      picoName: vector.issuance.picoName,
      homeNameOrId: vector.issuance.homeNameOrId,
      seedMaterialHex: vector.protectedSeedMaterialHex,
      pinProtected: true,
      identityKeyFingerprintHex:
        vector.identityKeyFingerprintHex,
      homeId: vector.issuance.homeId,
      homeHostPicoIdentityFingerprintHex:
        vector.issuance.homeHostPicoIdentityFingerprintHex,
      hostSigningKeyFingerprintHex:
        vector.issuance.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex:
        vector.issuance.hostKeyAgreementKeyFingerprintHex,
      hostKeyAgreementPublicKeyHex:
        vector.issuance.hostKeyAgreementPublicKeyHex,
      endpointHint: vector.issuance.endpointHint,
      issuedAt: vector.issuance.issuedAt,
    },
    recoveryPhrase: vector.protectedRecoveryPhrase,
    canonicalPayloadHex: vector.issuedCanonicalPayloadHex,
  };
}
