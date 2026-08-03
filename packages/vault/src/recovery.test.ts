import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createPicoVaultKeyfile,
  decodePicoRecoveryPhrase,
  encodePicoRecoveryPhrase,
  openPicoVaultKeyfile,
  protectPicoRecoverySeedWithPin,
  restorePicoVaultIdentityFromRecovery,
  type IssuePicoVaultRecoveryCardInput,
} from './index.js';

interface RecoveryCryptoVector {
  seedMaterialHex: string;
  identityPublicKeyHex: string;
  identityKeyFingerprintHex: string;
  recoveryPhrase: string;
  pin: string;
  protectedSeedMaterialHex: string;
  protectedRecoveryPhrase: string;
  issuance: Omit<IssuePicoVaultRecoveryCardInput, 'pin'>;
  issuedCanonicalPayloadHex: string;
}

beforeAll(async () => {
  await sodium.ready;
});

describe('ADR 0110 Recovery Card identity-root material', () => {
  it('pins the 32-byte English mnemonic and deterministic PIN protection', () => {
    const vector = fixtureVector();
    const seed = Buffer.from(vector.seedMaterialHex, 'hex');
    expect(encodePicoRecoveryPhrase(sodium, seed))
      .toBe(vector.recoveryPhrase);

    const decoded = decodePicoRecoveryPhrase(
      sodium,
      vector.recoveryPhrase,
    );
    expect(Buffer.from(decoded).toString('hex'))
      .toBe(vector.seedMaterialHex);
    sodium.memzero(decoded);

    const protectedSeed = protectPicoRecoverySeedWithPin(sodium, {
      seed,
      identityKeyFingerprintHex:
        vector.identityKeyFingerprintHex,
      pin: vector.pin,
    });
    expect(Buffer.from(protectedSeed).toString('hex'))
      .toBe(vector.protectedSeedMaterialHex);
    expect(encodePicoRecoveryPhrase(sodium, protectedSeed))
      .toBe(vector.protectedRecoveryPhrase);
    sodium.memzero(protectedSeed);
  });

  it('issues the one named identity-root export as a canonical PIN card', () => {
    const vector = fixtureVector();
    const restored = restorePicoVaultIdentityFromRecovery(sodium, {
      recoveryPhrase: vector.protectedRecoveryPhrase,
      pinProtected: true,
      pin: vector.pin,
      identityKeyFingerprintHex:
        vector.identityKeyFingerprintHex,
      passphrase: 'fixture identity passphrase',
    });
    expect(restored.publicKeyHex).toBe(vector.identityPublicKeyHex);

    const session = openPicoVaultKeyfile(sodium, {
      keyfile: restored.keyfile,
      passphrase: 'fixture identity passphrase',
    });
    const card = session.issueRecoveryCard({
      ...vector.issuance,
      pin: vector.pin,
    });
    expect(card.recoveryPhrase)
      .toBe(vector.protectedRecoveryPhrase);
    expect(card.canonicalPayloadHex)
      .toBe(vector.issuedCanonicalPayloadHex);
    expect(card.payload).toEqual({
      schema: 'pico.recovery.card.v1',
      suite: 'pico.suite.id.v1',
      picoName: vector.issuance.picoName,
      homeNameOrId: vector.issuance.homeNameOrId,
      seedMaterialHex: vector.protectedSeedMaterialHex,
      pinProtected: true,
      identityKeyFingerprintHex:
        vector.identityKeyFingerprintHex,
      homeId: vector.issuance.homeId,
      hostSigningKeyFingerprintHex:
        vector.issuance.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex:
        vector.issuance.hostKeyAgreementKeyFingerprintHex,
      hostKeyAgreementPublicKeyHex:
        vector.issuance.hostKeyAgreementPublicKeyHex,
      endpointHint: vector.issuance.endpointHint,
      issuedAt: vector.issuance.issuedAt,
    });
  });

  it('issues additive Card v2 with the non-rotating Home acceptor pin', () => {
    const vector = fixtureVector();
    const restored = restorePicoVaultIdentityFromRecovery(sodium, {
      recoveryPhrase: vector.protectedRecoveryPhrase,
      pinProtected: true,
      pin: vector.pin,
      identityKeyFingerprintHex: vector.identityKeyFingerprintHex,
      passphrase: 'fixture identity passphrase',
    });
    const session = openPicoVaultKeyfile(sodium, {
      keyfile: restored.keyfile,
      passphrase: 'fixture identity passphrase',
    });
    const card = session.issueRecoveryCardV2({
      ...vector.issuance,
      homeHostPicoIdentityFingerprintHex: '99'.repeat(32),
      pin: vector.pin,
    });
    expect(card.payload).toMatchObject({
      schema: 'pico.recovery.card.v2',
      homeHostPicoIdentityFingerprintHex: '99'.repeat(32),
    });
    expect(card.canonicalPayloadHex).not.toBe(
      vector.issuedCanonicalPayloadHex,
    );
  });

  it('restores only the matching root and fails closed on a wrong PIN', () => {
    const vector = fixtureVector();
    const restored = restorePicoVaultIdentityFromRecovery(sodium, {
      recoveryPhrase: vector.protectedRecoveryPhrase,
      pinProtected: true,
      pin: vector.pin,
      identityKeyFingerprintHex:
        vector.identityKeyFingerprintHex,
      passphrase: 'new local passphrase',
    });
    expect(restored.publicKeyHex).toBe(vector.identityPublicKeyHex);
    expect(openPicoVaultKeyfile(sodium, {
      keyfile: restored.keyfile,
      passphrase: 'new local passphrase',
    }).metadata().keyFingerprintHex)
      .toBe(vector.identityKeyFingerprintHex);

    expect(() => restorePicoVaultIdentityFromRecovery(sodium, {
      seedMaterialHex: vector.protectedSeedMaterialHex,
      pinProtected: true,
      pin: 'wrong7',
      identityKeyFingerprintHex:
        vector.identityKeyFingerprintHex,
      passphrase: 'new local passphrase',
    })).toThrow('recovery_pin_or_seed_mismatch');
  });

  it('rejects malformed phrases, PINs and non-identity card issuance', () => {
    const vector = fixtureVector();
    const words = vector.recoveryPhrase.split(' ');
    words[23] = 'abandon';
    expect(() => decodePicoRecoveryPhrase(
      sodium,
      words.join(' '),
    )).toThrow('invalid_recovery_phrase_checksum');
    expect(() => protectPicoRecoverySeedWithPin(sodium, {
      seed: Buffer.from(vector.seedMaterialHex, 'hex'),
      identityKeyFingerprintHex:
        vector.identityKeyFingerprintHex,
      pin: 'UPPER7',
    })).toThrow('invalid_recovery_pin');

    const device = createPicoVaultKeyfile(sodium, {
      keyRole: 'device_signing',
      passphrase: 'device passphrase',
    });
    expect(() => openPicoVaultKeyfile(sodium, {
      keyfile: device.keyfile,
      passphrase: 'device passphrase',
    }).issueRecoveryCard({
      ...vector.issuance,
      pin: vector.pin,
    }))
      .toThrow('recovery_card_requires_identity_root');

    expect(() => restorePicoVaultIdentityFromRecovery(sodium, {
      recoveryPhrase: vector.recoveryPhrase,
      pinProtected: false as true,
      pin: vector.pin,
      identityKeyFingerprintHex:
        vector.identityKeyFingerprintHex,
      passphrase: 'new local passphrase',
    })).toThrow('recovery_card_pin_protection_required');
  });
});

function fixtureVector(): RecoveryCryptoVector {
  const suite = JSON.parse(readFileSync(resolve(
    process.cwd(),
    '../../docs/protocol/fixtures/home-device-recovery/suite.json',
  ), 'utf8')) as { mnemonicPin: RecoveryCryptoVector };
  return suite.mnemonicPin;
}
