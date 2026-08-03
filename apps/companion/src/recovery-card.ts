import type { PicoVaultRecoveryCard } from '@pico/vault';
import type { PicoVaultDaemonClient } from '@pico/vault-daemon';
import { generatePicoRecoveryCardPdfs } from '@pico/vault-daemon';
import type { PicoCompanionProfile } from './profile.js';

export type PicoCompanionRecoveryCardPrintForm = 'paper' | 'card_printer';

export interface PicoCompanionRecoveryCardPublicMetadata {
  schema: 'pico.recovery.card.v2';
  identityKeyFingerprintHex: string;
  picoName: string;
  homeNameOrId: string;
  homeId: string;
  issuedAt: string;
  pinProtected: true;
}

export interface PicoCompanionRecoveryCardPrintPort {
  /** The bytes are valid only for this awaited call and are zeroed afterwards. */
  printRecoveryCard(input: {
    form: PicoCompanionRecoveryCardPrintForm;
    pdf: Uint8Array;
    metadata: PicoCompanionRecoveryCardPublicMetadata;
  }): Promise<{ destination: string }>;
}

/**
 * ADR 0112 S3 issuance over the existing approval-gated daemon ceremony.
 * Phrase and PIN never leave this function's main/service-side call chain;
 * only public front metadata returns after the selected PDF print completes.
 */
export async function issuePicoCompanionRecoveryCard(input: {
  daemonClient: PicoVaultDaemonClient;
  profile: PicoCompanionProfile;
  picoName: string;
  homeNameOrId: string;
  homeId: string;
  pin: string;
  form: PicoCompanionRecoveryCardPrintForm;
  printer: PicoCompanionRecoveryCardPrintPort;
  now?: () => Date;
  generatePdfs?: typeof generatePicoRecoveryCardPdfs;
}): Promise<{
  metadata: PicoCompanionRecoveryCardPublicMetadata;
  destination: string;
}> {
  const now = (input.now ?? (() => new Date()))();
  if (!Number.isFinite(now.getTime())) {
    throw new Error('invalid_recovery_card_issuance_time');
  }
  const card = await input.daemonClient.ceremonyIssueRecoveryCardV2({
    signerKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    picoName: input.picoName,
    homeNameOrId: input.homeNameOrId,
    // The v1 profile predates product issuance and does not carry Home id.
    // The public settings/onboarding form therefore supplies the exact id;
    // it must never be guessed from a display name.
    homeId: input.homeId,
    homeHostPicoIdentityFingerprintHex:
      input.profile.home.homeHostPicoIdentityFingerprintHex,
    hostSigningKeyFingerprintHex:
      input.profile.host.signingKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex:
      input.profile.host.keyAgreementKeyFingerprintHex,
    hostKeyAgreementPublicKeyHex:
      input.profile.host.keyAgreementPublicKeyHex,
    endpointHint: input.profile.coreUrl,
    issuedAt: now.toISOString(),
    pin: input.pin,
  }) as unknown as PicoVaultRecoveryCard;

  const generate = input.generatePdfs ?? generatePicoRecoveryCardPdfs;
  const pdfs = await generate(card);
  const selected = input.form === 'paper'
    ? pdfs.paperPrintablePdf
    : pdfs.cardPrinterPdf;
  const metadata: PicoCompanionRecoveryCardPublicMetadata = {
    schema: 'pico.recovery.card.v2',
    identityKeyFingerprintHex: card.payload.identityKeyFingerprintHex,
    picoName: card.payload.picoName,
    homeNameOrId: card.payload.homeNameOrId,
    homeId: card.payload.homeId,
    issuedAt: card.payload.issuedAt,
    pinProtected: true,
  };
  try {
    const printed = await input.printer.printRecoveryCard({
      form: input.form,
      pdf: selected,
      metadata,
    });
    return { metadata, destination: printed.destination };
  } finally {
    pdfs.cardPrinterPdf.fill(0);
    pdfs.paperPrintablePdf.fill(0);
  }
}
