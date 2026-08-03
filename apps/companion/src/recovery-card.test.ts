import type { PicoVaultDaemonClient } from '@pico/vault-daemon';
import { describe, expect, it, vi } from 'vitest';
import type { PicoCompanionProfile } from './profile.js';
import { issuePicoCompanionRecoveryCard } from './recovery-card.js';

describe('Companion Recovery Card product issuance', () => {
  it('prints only the selected in-memory PDF and returns public front metadata', async () => {
    const cardPrinterPdf = Uint8Array.from([1, 2, 3]);
    const paperPrintablePdf = Uint8Array.from([4, 5, 6]);
    const printedBytes: number[][] = [];
    const ceremonyIssueRecoveryCard = vi.fn(async () => card());
    const result = await issuePicoCompanionRecoveryCard({
      daemonClient: { ceremonyIssueRecoveryCard } as unknown as PicoVaultDaemonClient,
      profile: profile(),
      picoName: 'Mira',
      homeNameOrId: 'home_product_1',
      homeId: 'home_product_1',
      pin: 's3card',
      form: 'paper',
      printer: {
        printRecoveryCard: async ({ pdf }) => {
          printedBytes.push([...pdf]);
          return { destination: 'Office printer' };
        },
      },
      now: () => new Date('2026-08-03T12:00:00.000Z'),
      generatePdfs: async () => ({ cardPrinterPdf, paperPrintablePdf }),
    });

    expect(ceremonyIssueRecoveryCard).toHaveBeenCalledWith({
      signerKeyFingerprintHex: '55'.repeat(32),
      picoName: 'Mira',
      homeNameOrId: 'home_product_1',
      homeId: 'home_product_1',
      hostSigningKeyFingerprintHex: '22'.repeat(32),
      hostKeyAgreementKeyFingerprintHex: '44'.repeat(32),
      hostKeyAgreementPublicKeyHex: '33'.repeat(32),
      endpointHint: 'http://127.0.0.1:8321',
      issuedAt: '2026-08-03T12:00:00.000Z',
      pin: 's3card',
    });
    expect(printedBytes).toEqual([[4, 5, 6]]);
    expect(result).toEqual({
      metadata: {
        identityKeyFingerprintHex: '55'.repeat(32),
        picoName: 'Mira',
        homeNameOrId: 'home_product_1',
        homeId: 'home_product_1',
        issuedAt: '2026-08-03T12:00:00.000Z',
        pinProtected: true,
      },
      destination: 'Office printer',
    });
    expect([...cardPrinterPdf]).toEqual([0, 0, 0]);
    expect([...paperPrintablePdf]).toEqual([0, 0, 0]);
  });

  it('zeroes both generated PDFs when printing fails', async () => {
    const cardPrinterPdf = Uint8Array.from([1]);
    const paperPrintablePdf = Uint8Array.from([2]);
    await expect(issuePicoCompanionRecoveryCard({
      daemonClient: {
        ceremonyIssueRecoveryCard: async () => card(),
      } as unknown as PicoVaultDaemonClient,
      profile: profile(),
      picoName: 'Mira',
      homeNameOrId: 'home_product_1',
      homeId: 'home_product_1',
      pin: 's3card',
      form: 'card_printer',
      printer: {
        printRecoveryCard: async () => {
          throw new Error('printer_unavailable');
        },
      },
      generatePdfs: async () => ({ cardPrinterPdf, paperPrintablePdf }),
    })).rejects.toThrow('printer_unavailable');
    expect([...cardPrinterPdf, ...paperPrintablePdf]).toEqual([0, 0]);
  });
});

function card(): Record<string, unknown> {
  return {
    payload: {
      schema: 'pico.recovery.card.v1',
      suite: 'pico.suite.id.v1',
      picoName: 'Mira',
      homeNameOrId: 'home_product_1',
      seedMaterialHex: 'aa'.repeat(32),
      pinProtected: true,
      identityKeyFingerprintHex: '55'.repeat(32),
      homeId: 'home_product_1',
      hostSigningKeyFingerprintHex: '22'.repeat(32),
      hostKeyAgreementKeyFingerprintHex: '44'.repeat(32),
      hostKeyAgreementPublicKeyHex: '33'.repeat(32),
      endpointHint: 'http://127.0.0.1:8321',
      issuedAt: '2026-08-03T12:00:00.000Z',
    },
    recoveryPhrase: 'word '.repeat(24).trim(),
    canonicalPayloadHex: '00',
  };
}

function profile(): PicoCompanionProfile {
  return {
    schema: 'pico.companion.profile.v1',
    coreUrl: 'http://127.0.0.1:8321',
    home: { homeHostPicoIdentityFingerprintHex: '99'.repeat(32) },
    host: {
      signingPublicKeyHex: '11'.repeat(32),
      signingKeyFingerprintHex: '22'.repeat(32),
      keyAgreementPublicKeyHex: '33'.repeat(32),
      keyAgreementKeyFingerprintHex: '44'.repeat(32),
    },
    identity: {
      keyFingerprintHex: '55'.repeat(32),
      publicKeyHex: '66'.repeat(32),
    },
    device: {
      signingKeyFingerprintHex: '77'.repeat(32),
      keyAgreementKeyFingerprintHex: '88'.repeat(32),
      delegationId: 'delegation_product_1',
    },
  };
}
