import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPicoHomeClaimSignatureInput,
  buildPicoHomeContinuitySignatureInput,
  buildPicoHomeFoundingSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoIdentityPossessionSignatureInput,
  buildPicoIdentityReaderKeyFreshnessSignatureInput,
  buildPicoShareEnvelopeSignatureInput,
  picoIdentitySuite,
  picoVaultKeyfileFormat,
} from '@pico/protocol';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  assertPicoVaultKeyfileMode,
  assertVaultCustodyPathSeparation,
  createPicoReaderCustodyDomain,
  createPicoReaderCustodyWriterGrant,
  createPicoVaultKeyfile,
  decryptPicoReaderCustodyItem,
  encryptPicoReaderCustodyItem,
  openPicoVaultKeyfile,
  parsePicoVaultKeyfile,
  readPicoVaultKeyfile,
  revokePicoReaderCustodyWriterGrant,
  serializePicoVaultKeyfile,
  writePicoVaultKeyfile,
} from './index.js';

const tempDirs: string[] = [];

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-vault-'));
  tempDirs.push(dir);
  return dir;
}

describe('Pico Vault keyfile runtime (ADR 0081 P2 slice)', () => {
  it('creates an encrypted keyfile, opens it and signs only recognized canonical inputs', () => {
    const created = createPicoVaultKeyfile(sodium, {
      keyRole: 'pico_identity',
      passphrase: 'correct horse battery staple',
    });
    expect(created.keyfile.format).toBe(picoVaultKeyfileFormat);
    expect(created.keyfile.header.keyRole).toBe('pico_identity');
    expect(created.keyfile.header.keyFingerprintHex).toBe(created.keyFingerprintHex);
    expect(JSON.stringify(created.keyfile)).not.toContain(created.publicKeyHex);
    expect(JSON.stringify(created.keyfile)).not.toContain('privateKey');

    const session = openPicoVaultKeyfile(sodium, {
      keyfile: created.keyfile,
      passphrase: 'correct horse battery staple',
    });
    expect(session.metadata()).toEqual({
      suite: picoIdentitySuite,
      keyRole: 'pico_identity',
      publicKeyHex: created.publicKeyHex,
      keyFingerprintHex: created.keyFingerprintHex,
    });

    const signatureInput = buildPicoIdentityKeyRecordSignatureInput({
      suite: picoIdentitySuite,
      keyRole: 'pico_identity',
      publicKeyHex: created.publicKeyHex,
    });
    const signature = session.sign(signatureInput);
    expect(sodium.crypto_sign_verify_detached(
      signature,
      signatureInput,
      Buffer.from(created.publicKeyHex, 'hex'),
    )).toBe(true);
    expect(() => session.sign(new Uint8Array([0, 0, 0, 4, 116, 101, 115, 116]))).toThrow('unknown_signature_input_label');
  });

  it('signs the Move-In ceremony with an identity key and refuses host families', () => {
    // The point of the Vault boundary: the claimant's identity key never leaves
    // it, so the ADR 0080 ceremony has to be signable from inside (ADR 0081 V1).
    const created = createPicoVaultKeyfile(sodium, {
      keyRole: 'pico_identity',
      passphrase: 'correct horse battery staple',
    });
    const session = openPicoVaultKeyfile(sodium, {
      keyfile: created.keyfile,
      passphrase: 'correct horse battery staple',
    });

    const claim = buildPicoHomeClaimSignatureInput({
      suite: picoIdentitySuite,
      claimId: 'claim_20260718_0001',
      hostSigningKeyFingerprintHex: '11'.repeat(32),
      hostKeyAgreementKeyFingerprintHex: '22'.repeat(32),
      moveInCode: 'MOVEIN-20260718-A',
      claimantIdentityKeyFingerprintHex: created.keyFingerprintHex,
      claimantNonceHex: '33'.repeat(32),
      hostSetupNonceHex: '44'.repeat(32),
    });
    const founding = buildPicoHomeFoundingSignatureInput({
      suite: picoIdentitySuite,
      foundingId: 'founding_20260718_0001',
      homeId: 'home_20260718_0001',
      hostSigningKeyFingerprintHex: '11'.repeat(32),
      hostKeyAgreementKeyFingerprintHex: '22'.repeat(32),
      homeHostPicoIdentityFingerprintHex: created.keyFingerprintHex,
      claimantNonceHex: '33'.repeat(32),
      hostNonceHex: '55'.repeat(32),
      foundedAt: '2026-07-18T09:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000001',
    });

    for (const signatureInput of [claim, founding]) {
      expect(sodium.crypto_sign_verify_detached(
        session.sign(signatureInput),
        signatureInput,
        Buffer.from(created.publicKeyHex, 'hex'),
      )).toBe(true);
    }

    // Continuity is a host statement; a person-role key never signs one.
    expect(() => session.sign(buildPicoHomeContinuitySignatureInput({
      suite: picoIdentitySuite,
      continuityId: 'continuity_20260718_0001',
      homeId: 'home_20260718_0001',
      outgoingHostSigningKeyFingerprintHex: '11'.repeat(32),
      outgoingHostKeyAgreementKeyFingerprintHex: '22'.repeat(32),
      incomingHostSigningKeyFingerprintHex: '55'.repeat(32),
      incomingHostKeyAgreementKeyFingerprintHex: '66'.repeat(32),
      homeHostPicoIdentityFingerprintHex: created.keyFingerprintHex,
      reasonCategory: 'host_key_rotated',
      changedAt: '2026-07-18T09:10:00.000Z',
      lifecycleOrder: 'seq:0000000000000002',
    }))).toThrow('unknown_signature_input_label');

    // And a delegated device key stays inside the identity families.
    const device = createPicoVaultKeyfile(sodium, {
      keyRole: 'device_signing',
      passphrase: 'correct horse battery staple',
    });
    expect(() => openPicoVaultKeyfile(sodium, {
      keyfile: device.keyfile,
      passphrase: 'correct horse battery staple',
    }).sign(claim)).toThrow('unknown_signature_input_label');
  });

  it('lets only the Pico identity key authorize a share envelope', () => {
    const identity = createPicoVaultKeyfile(sodium, {
      keyRole: 'pico_identity',
      passphrase: 'correct horse battery staple',
    });
    const envelope = buildPicoShareEnvelopeSignatureInput({
      suite: 'pico.suite.share.v1',
      grantId: 'grant_vault_0001',
      domainId: 'family',
      kekVersion: 1,
      hostSigningKeyFingerprintHex: '11'.repeat(32),
      issuerIdentityKeyFingerprintHex: identity.keyFingerprintHex,
      readerKeyFingerprintHex: '22'.repeat(32),
      wrapDigestHex: '33'.repeat(32),
      grantedAt: '2026-07-27T10:00:00.000Z',
    });
    const identitySession = openPicoVaultKeyfile(sodium, {
      keyfile: identity.keyfile,
      passphrase: 'correct horse battery staple',
    });
    expect(sodium.crypto_sign_verify_detached(
      identitySession.sign(envelope),
      envelope,
      Buffer.from(identity.publicKeyHex, 'hex'),
    )).toBe(true);

    const device = createPicoVaultKeyfile(sodium, {
      keyRole: 'device_signing',
      passphrase: 'correct horse battery staple',
    });
    expect(() => openPicoVaultKeyfile(sodium, {
      keyfile: device.keyfile,
      passphrase: 'correct horse battery staple',
    }).sign(envelope)).toThrow('unknown_signature_input_label');
  });

  it('lets only the Pico identity root sign reader-key freshness', () => {
    const identity = createPicoVaultKeyfile(sodium, {
      keyRole: 'pico_identity',
      passphrase: 'correct horse battery staple',
    });
    const checkpoint = buildPicoIdentityReaderKeyFreshnessSignatureInput({
      suite: picoIdentitySuite,
      checkpointId: 'freshness_vault_0001',
      homeId: 'home_vault_0001',
      issuerIdentityKeyFingerprintHex: identity.keyFingerprintHex,
      deviceSigningKeyFingerprintHex: '22'.repeat(32),
      deviceKeyAgreementKeyFingerprintHex: '33'.repeat(32),
      delegationId: 'delegation_vault_0001',
      status: 'current',
      observedThroughLifecycleOrder: 'seq:0000000000000001',
      checkedAt: '2026-07-27T10:00:00.000Z',
      freshUntil: '2026-07-27T10:05:00.000Z',
    });
    const identitySession = openPicoVaultKeyfile(sodium, {
      keyfile: identity.keyfile,
      passphrase: 'correct horse battery staple',
    });
    expect(sodium.crypto_sign_verify_detached(
      identitySession.sign(checkpoint),
      checkpoint,
      Buffer.from(identity.publicKeyHex, 'hex'),
    )).toBe(true);

    const device = createPicoVaultKeyfile(sodium, {
      keyRole: 'device_signing',
      passphrase: 'correct horse battery staple',
    });
    expect(() => openPicoVaultKeyfile(sodium, {
      keyfile: device.keyfile,
      passphrase: 'correct horse battery staple',
    }).sign(checkpoint)).toThrow('unknown_signature_input_label');
  });

  it('keeps a reader-custody KEK sealed while encrypting and decrypting an owner-authorized item', () => {
    const identity = createPicoVaultKeyfile(sodium, {
      keyRole: 'pico_identity',
      passphrase: 'correct horse battery staple',
    });
    const agreement = createPicoVaultKeyfile(sodium, {
      keyRole: 'device_key_agreement',
      passphrase: 'correct horse battery staple',
    });
    const signing = createPicoVaultKeyfile(sodium, {
      keyRole: 'device_signing',
      passphrase: 'correct horse battery staple',
    });
    const identitySession = openPicoVaultKeyfile(sodium, {
      keyfile: identity.keyfile,
      passphrase: 'correct horse battery staple',
    });
    const agreementSession = openPicoVaultKeyfile(sodium, {
      keyfile: agreement.keyfile,
      passphrase: 'correct horse battery staple',
    });
    const signingSession = openPicoVaultKeyfile(sodium, {
      keyfile: signing.keyfile,
      passphrase: 'correct horse battery staple',
    });
    const domainRecord = createPicoReaderCustodyDomain(sodium, {
      ownerIdentitySession: identitySession,
      ownerReaderKeyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'device_key_agreement',
        publicKeyHex: agreement.publicKeyHex,
      },
      domainAuthorityId: 'reader_domain_auth_0001',
      homeId: 'home_vault_0001',
      hostSigningKeyFingerprintHex: '11'.repeat(32),
      domainId: 'domain_reader_private',
      authorizedAt: '2026-07-27T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000001',
    });
    const writerGrantRecord = createPicoReaderCustodyWriterGrant(sodium, {
      ownerIdentitySession: identitySession,
      domainRecord,
      writerDeviceSigningKeyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'device_signing',
        publicKeyHex: signing.publicKeyHex,
      },
      writerGrantId: 'reader_writer_grant_0001',
      writerIdentityKeyFingerprintHex: identity.keyFingerprintHex,
      validFrom: '2026-07-27T10:00:00.000Z',
      validUntil: '2026-08-27T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000002',
    });
    const itemRecord = encryptPicoReaderCustodyItem(sodium, {
      readerKeyAgreementSession: agreementSession,
      writerSigningSession: signingSession,
      domainRecord,
      writerGrantRecord,
      packageId: 'reader_item_package_0001',
      memoryItemId: 'memory_reader_0001',
      contentType: 'text/plain',
      plaintext: 'reader-custody secret',
      createdAt: '2026-07-27T10:01:00.000Z',
    });

    expect(domainRecord.domain.custodyClass).toBe('reader_custody');
    expect(JSON.stringify(domainRecord)).not.toContain('kekHex');
    expect(JSON.stringify(itemRecord)).not.toContain('reader-custody secret');
    expect(decryptPicoReaderCustodyItem(sodium, {
      readerKeyAgreementSession: agreementSession,
      domainRecord,
      writerGrantRecord,
      itemRecord,
    })).toBe('reader-custody secret');

    expect(() => encryptPicoReaderCustodyItem(sodium, {
      readerKeyAgreementSession: agreementSession,
      writerSigningSession: identitySession,
      domainRecord,
      writerGrantRecord,
      packageId: 'reader_item_package_0002',
      memoryItemId: 'memory_reader_0002',
      contentType: 'text/plain',
      plaintext: 'must fail',
      createdAt: '2026-07-27T10:02:00.000Z',
    })).toThrow('writer_signing_key_mismatch');

    const tampered = structuredClone(itemRecord);
    tampered.item.contentType = 'text/markdown';
    expect(() => decryptPicoReaderCustodyItem(sodium, {
      readerKeyAgreementSession: agreementSession,
      domainRecord,
      writerGrantRecord,
      itemRecord: tampered,
    })).toThrow('invalid_reader_custody_item');

    expect(revokePicoReaderCustodyWriterGrant(sodium, {
      ownerIdentitySession: identitySession,
      domainRecord,
      writerGrantRecord,
      lifecycleId: 'reader_writer_lifecycle_0001',
      reasonCategory: 'writer_removed',
      changedAt: '2026-07-27T10:03:00.000Z',
      lifecycleOrder: 'seq:0000000000000003',
    }).lifecycle.status).toBe('revoked');
  });

  it('rejects wrong passphrases, tampered headers and truncated ciphertext', () => {
    const created = createPicoVaultKeyfile(sodium, {
      keyRole: 'device_signing',
      passphrase: 'correct horse battery staple',
    });

    expect(() => openPicoVaultKeyfile(sodium, {
      keyfile: created.keyfile,
      passphrase: 'wrong horse battery staple',
    })).toThrow();

    const tamperedHeader = parsePicoVaultKeyfile(serializePicoVaultKeyfile(created.keyfile));
    tamperedHeader.header.keyRole = 'pico_identity';
    expect(() => openPicoVaultKeyfile(sodium, {
      keyfile: tamperedHeader,
      passphrase: 'correct horse battery staple',
    })).toThrow();

    const truncated = parsePicoVaultKeyfile(serializePicoVaultKeyfile(created.keyfile));
    truncated.ciphertextHex = truncated.ciphertextHex.slice(0, 16);
    expect(() => openPicoVaultKeyfile(sodium, {
      keyfile: truncated,
      passphrase: 'correct horse battery staple',
    })).toThrow();
  });

  it('refuses a keyfile whose KDF cost is above the sensitive ceiling', () => {
    const created = createPicoVaultKeyfile(sodium, {
      keyRole: 'pico_identity',
      passphrase: 'correct horse battery staple',
    });
    const damaged = parsePicoVaultKeyfile(serializePicoVaultKeyfile(created.keyfile));

    // These parameters are read before the AEAD authenticates the header, so a
    // single damaged byte here cannot be caught by the AAD. Argon2id is a
    // synchronous, non-interruptible call: unbounded, this is a hang rather
    // than an error - roughly 215 ms per pass at the moderate memory cost.
    damaged.header.kdfOpsLimit = 2_147_483_647;
    expect(() => openPicoVaultKeyfile(sodium, {
      keyfile: damaged,
      passphrase: 'correct horse battery staple',
    })).toThrow('kdf_parameter_unsupported');

    const overMemory = parsePicoVaultKeyfile(serializePicoVaultKeyfile(created.keyfile));
    overMemory.header.kdfMemLimitBytes = 2 ** 42;
    expect(() => openPicoVaultKeyfile(sodium, {
      keyfile: overMemory,
      passphrase: 'correct horse battery staple',
    })).toThrow('kdf_parameter_unsupported');

    // The declared upgrade path stays open: moderate through sensitive.
    const sensitive = parsePicoVaultKeyfile(serializePicoVaultKeyfile(created.keyfile));
    sensitive.header.kdfOpsLimit = 4;
    sensitive.header.kdfMemLimitBytes = 1_073_741_824;
    expect(() => parsePicoVaultKeyfile(JSON.stringify(sensitive))).not.toThrow();
  });

  it('locks explicitly and auto-locks after the configured idle window', () => {
    const created = createPicoVaultKeyfile(sodium, {
      keyRole: 'device_signing',
      passphrase: 'correct horse battery staple',
    });
    const session = openPicoVaultKeyfile(sodium, {
      keyfile: created.keyfile,
      passphrase: 'correct horse battery staple',
      autoLockAfterMs: 5,
      nowMs: 100,
    });
    const signatureInput = buildPicoIdentityPossessionSignatureInput({
      suite: picoIdentitySuite,
      subjectKeyFingerprintHex: created.keyFingerprintHex,
      verifierNonceHex: '11'.repeat(32),
      verifierContext: 'pico.test.vault',
    });

    expect(session.sign(signatureInput, { nowMs: 103 })).toHaveLength(sodium.crypto_sign_BYTES);
    expect(session.isLocked({ nowMs: 109 })).toBe(true);
    expect(() => session.sign(signatureInput, { nowMs: 109 })).toThrow('vault_locked');
    expect(() => session.isLocked({ nowMs: Number.NaN })).toThrow('invalid_now_ms');

    const second = openPicoVaultKeyfile(sodium, {
      keyfile: created.keyfile,
      passphrase: 'correct horse battery staple',
    });
    second.lock();
    expect(second.isLocked()).toBe(true);
    expect(() => second.sign(signatureInput)).toThrow('vault_locked');
    expect(() => openPicoVaultKeyfile(sodium, {
      keyfile: created.keyfile,
      passphrase: 'correct horse battery staple',
      autoLockAfterMs: Number.NaN,
    })).toThrow('invalid_auto_lock_after_ms');
  });

  it('unwraps sealed boxes only with a key-agreement keyfile', () => {
    const agreement = createPicoVaultKeyfile(sodium, {
      keyRole: 'device_key_agreement',
      passphrase: 'correct horse battery staple',
    });
    const agreementSession = openPicoVaultKeyfile(sodium, {
      keyfile: agreement.keyfile,
      passphrase: 'correct horse battery staple',
    });
    const ciphertext = sodium.crypto_box_seal(
      Buffer.from('domain key material'),
      Buffer.from(agreement.publicKeyHex, 'hex'),
    );
    expect(Buffer.from(agreementSession.unwrapSealedBox(ciphertext)).toString('utf8')).toBe('domain key material');
    expect(() => agreementSession.sign(new Uint8Array([0, 0, 0, 4, 116, 101, 115, 116]))).toThrow('key_role_cannot_sign');

    const signing = createPicoVaultKeyfile(sodium, {
      keyRole: 'device_signing',
      passphrase: 'correct horse battery staple',
    });
    const signingSession = openPicoVaultKeyfile(sodium, {
      keyfile: signing.keyfile,
      passphrase: 'correct horse battery staple',
    });
    expect(() => signingSession.unwrapSealedBox(ciphertext)).toThrow('key_role_cannot_unwrap');
  });

  it('exports only the encrypted keyfile and writes it with private file mode', () => {
    const created = createPicoVaultKeyfile(sodium, {
      keyRole: 'pico_identity',
      passphrase: 'correct horse battery staple',
    });
    const session = openPicoVaultKeyfile(sodium, {
      keyfile: created.keyfile,
      passphrase: 'correct horse battery staple',
    });
    const exported = session.exportEncryptedKeyfile();
    expect(exported).toEqual(created.keyfile);
    expect(JSON.stringify(session)).not.toContain('privateKey');
    expect(JSON.stringify(exported)).not.toContain('privateKey');

    const keyfilePath = join(tempDir(), 'vault', 'identity.keyfile');
    writePicoVaultKeyfile(keyfilePath, exported);
    assertPicoVaultKeyfileMode(keyfilePath);
    expect(statSync(keyfilePath).mode & 0o777).toBe(0o600);
    expect(readPicoVaultKeyfile(keyfilePath)).toEqual(exported);
    expect(() => writePicoVaultKeyfile(keyfilePath, exported)).toThrow();
  });

  it('keeps Vault custody paths outside Foundation data and backup scopes', () => {
    const root = tempDir();
    expect(() => assertVaultCustodyPathSeparation({
      vaultKeyfilePath: join(root, 'foundation', 'data', 'vault.keyfile'),
      foundationDataPath: join(root, 'foundation', 'data'),
      foundationBackupPath: join(root, 'foundation', 'backup'),
    })).toThrow('vault_path_inside_foundation_scope');

    expect(() => assertVaultCustodyPathSeparation({
      vaultKeyfilePath: join(root, 'vault', 'identity.keyfile'),
      foundationDataPath: join(root, 'foundation', 'data'),
      foundationBackupPath: join(root, 'foundation', 'backup'),
    })).not.toThrow();
  });
});
