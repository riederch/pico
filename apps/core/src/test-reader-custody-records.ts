import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import {
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoReaderCustodyDomainSignatureInput,
  buildPicoReaderCustodyItemSignatureInput,
  buildPicoReaderCustodyKekRotationSignatureInput,
  buildPicoReaderCustodyReaderGrantLifecycleSignatureInput,
  buildPicoReaderCustodyReaderGrantSignatureInput,
  buildPicoReaderCustodyWriterGrantLifecycleSignatureInput,
  buildPicoReaderCustodyWriterGrantSignatureInput,
  buildPicoShareEnvelopeSignatureInput,
  buildPicoShareWrapPayload,
  picoIdentitySuite,
  picoMemoryContentSuite,
  picoReaderCustodyDomainRecordSchema,
  picoReaderCustodyItemRecordSchema,
  picoReaderCustodyKekRotationRecordSchema,
  picoReaderCustodyReaderGrantLifecycleRecordSchema,
  picoReaderCustodyReaderGrantRecordSchema,
  picoReaderCustodyWriterGrantLifecycleRecordSchema,
  picoReaderCustodyWriterGrantRecordSchema,
  picoShareEnvelopeRecordSchema,
  picoShareSuite,
} from '@pico/protocol';
import type {
  PicoHomeFoundingRecord,
  PicoIdentityKeyRecordSignatureInput,
  PicoReaderCustodyDomainRecord,
  PicoReaderCustodyItemRecord,
  PicoReaderCustodyKekRotationRecord,
  PicoReaderCustodyReaderGrantLifecycleRecord,
  PicoReaderCustodyReaderGrantRecord,
  PicoReaderCustodyWriterGrantLifecycleRecord,
  PicoReaderCustodyWriterGrantRecord,
  PicoShareEnvelopeRecord,
} from '@pico/protocol';
import sodium from 'libsodium-wrappers-sumo';

/**
 * ADR 0086. Eine Domäne, ein Schreibrecht und ein Item - echt unterschrieben.
 *
 * **Herausgehoben am 2026-08-26**, weil ein zweiter Test sie brauchte: die
 * Link-Operation, über die ein Gerät ein Item bei seinem Home abgibt, muss
 * gegen ein *echtes* Home laufen, und dessen `homeId` und Host-Fingerabdruck
 * stehen erst zur Laufzeit fest. Eine zweite Fabrik daneben wäre eine zweite
 * Auffassung davon, wie ein gültiger Satz Aufzeichnungen aussieht - und
 * genau die driftet.
 *
 * Nur Protokoll und sodium, kein `@pico/vault`: der Kern hängt nicht davon ab
 * und soll es nicht. Er prüft Aufzeichnungen und hält nie Schlüssel.
 */
export interface ReaderCustodyRecords {
  domain: PicoReaderCustodyDomainRecord;
  writerGrant: PicoReaderCustodyWriterGrantRecord;
  item: PicoReaderCustodyItemRecord;
  identityKeypair: { publicKey: Uint8Array; privateKey: Uint8Array };
  ownerReaderKeypair: { publicKey: Uint8Array; privateKey: Uint8Array };
  writerKeypair: { publicKey: Uint8Array; privateKey: Uint8Array };
  writerIdentityFingerprint: string;
}

export function makeReaderCustodyRecords(binding: {
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  domainId?: string;
  authorizedAt?: string;
  /**
   * Wessen Domäne es ist. Ohne Angabe ein frisches Paar - das reicht, wo der
   * Speicher allein geprüft wird. Gegen ein **echtes** Home muss es das
   * Schlüsselpaar eines aktiven Mitglieds sein: eine Domäne gehört jemandem,
   * den dieses Home kennt, und `owner_is_not_active_member` ist die Ablehnung
   * für alles andere.
   */
  ownerKeypair?: { publicKey: Uint8Array; privateKey: Uint8Array };
  /**
   * Wer schreibt. `'owner'` heißt: dieselbe Person schreibt in ihre eigene
   * Domäne - der Fall, den ein echtes Home annimmt, weil auch der Schreiber
   * ein aktives Mitglied sein muss (`writer_is_not_active_member`). Ohne
   * Angabe ein Fremder, was für die Speicher-Tests der schärfere Fall ist.
   */
  writerIdentity?: 'owner';
}): ReaderCustodyRecords {
  const HOME_ID = binding.homeId;
  const HOST_FINGERPRINT = binding.hostSigningKeyFingerprintHex;
  const DOMAIN_ID = binding.domainId ?? 'domain_reader_private';
  const AUTHORIZED_AT = binding.authorizedAt ?? '2026-07-27T10:00:00.000Z';
  const identityKeypair = binding.ownerKeypair ?? sodium.crypto_sign_keypair();
  const readerKeypair = sodium.crypto_box_keypair();
  const writerKeypair = sodium.crypto_sign_keypair();
  const identityKeyRecord = keyRecord('pico_identity', identityKeypair.publicKey);
  const readerKeyRecord = keyRecord(
    'device_key_agreement',
    readerKeypair.publicKey,
  );
  const writerKeyRecord = keyRecord('device_signing', writerKeypair.publicKey);
  const identityFingerprint = fingerprint(identityKeyRecord);
  const writerIdentityFingerprint = binding.writerIdentity === 'owner'
    ? identityFingerprint
    : 'aa'.repeat(32);
  const readerFingerprint = fingerprint(readerKeyRecord);
  const writerFingerprint = fingerprint(writerKeyRecord);
  const domain = {
    suite: picoMemoryContentSuite,
    domainAuthorityId: 'reader_domain_auth_0001',
    homeId: HOME_ID,
    hostSigningKeyFingerprintHex: HOST_FINGERPRINT,
    domainId: DOMAIN_ID,
    custodyClass: 'reader_custody' as const,
    ownerIdentityKeyFingerprintHex: identityFingerprint,
    ownerReaderKeyFingerprintHex: readerFingerprint,
    kekVersion: 1,
    authorizedAt: AUTHORIZED_AT,
    lifecycleOrder: 'seq:0000000000000001',
  };
  const kek = sodium.randombytes_buf(32);
  const wrap = buildPicoShareWrapPayload({
    suite: picoShareSuite,
    domainId: DOMAIN_ID,
    kekVersion: 1,
    readerKeyFingerprintHex: readerFingerprint,
    kekHex: Buffer.from(kek).toString('hex'),
  });
  const sealedWrap = sodium.crypto_box_seal(wrap, readerKeypair.publicKey);
  const envelope = {
    suite: picoShareSuite,
    grantId: domain.domainAuthorityId,
    domainId: DOMAIN_ID,
    kekVersion: 1,
    hostSigningKeyFingerprintHex: HOST_FINGERPRINT,
    issuerIdentityKeyFingerprintHex: identityFingerprint,
    readerKeyFingerprintHex: readerFingerprint,
    wrapDigestHex: hashHex(sealedWrap),
    grantedAt: AUTHORIZED_AT,
  };
  const domainRecord: PicoReaderCustodyDomainRecord = {
    schema: picoReaderCustodyDomainRecordSchema,
    domain,
    ownerIdentityKeyRecord: identityKeyRecord,
    ownerReaderKeyRecord: readerKeyRecord,
    ownerEnvelope: {
      schema: picoShareEnvelopeRecordSchema,
      envelope,
      sealedWrapHex: Buffer.from(sealedWrap).toString('hex'),
      issuerIdentityKeyRecord: identityKeyRecord,
      issuerSignatureHex: signHex(
        buildPicoShareEnvelopeSignatureInput(envelope),
        identityKeypair.privateKey,
      ),
      createdAt: AUTHORIZED_AT,
    },
    ownerSignatureHex: signHex(
      buildPicoReaderCustodyDomainSignatureInput(domain),
      identityKeypair.privateKey,
    ),
    receivedAt: AUTHORIZED_AT,
  };
  const grant = {
    suite: picoMemoryContentSuite,
    writerGrantId: 'reader_writer_grant_0001',
    domainAuthorityId: domain.domainAuthorityId,
    homeId: HOME_ID,
    hostSigningKeyFingerprintHex: HOST_FINGERPRINT,
    domainId: DOMAIN_ID,
    kekVersion: 1,
    ownerIdentityKeyFingerprintHex: identityFingerprint,
    writerIdentityKeyFingerprintHex: writerIdentityFingerprint,
    writerDeviceSigningKeyFingerprintHex: writerFingerprint,
    validFrom: AUTHORIZED_AT,
    validUntil: '2026-08-27T10:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000002',
  };
  const writerGrant: PicoReaderCustodyWriterGrantRecord = {
    schema: picoReaderCustodyWriterGrantRecordSchema,
    grant,
    ownerIdentityKeyRecord: identityKeyRecord,
    writerDeviceSigningKeyRecord: writerKeyRecord,
    ownerSignatureHex: signHex(
      buildPicoReaderCustodyWriterGrantSignatureInput(grant),
      identityKeypair.privateKey,
    ),
    receivedAt: AUTHORIZED_AT,
  };
  const contentCiphertext = sodium.randombytes_buf(64);
  const wrappedDek = sodium.randombytes_buf(48);
  const item = {
    suite: picoMemoryContentSuite,
    packageId: 'reader_item_package_0001',
    domainAuthorityId: domain.domainAuthorityId,
    writerGrantId: grant.writerGrantId,
    homeId: HOME_ID,
    hostSigningKeyFingerprintHex: HOST_FINGERPRINT,
    domainId: DOMAIN_ID,
    memoryItemId: 'memory_reader_0001',
    contentType: 'text/plain',
    kekVersion: 1,
    writerIdentityKeyFingerprintHex: writerIdentityFingerprint,
    writerDeviceSigningKeyFingerprintHex: writerFingerprint,
    contentNonceHex: '22'.repeat(24),
    contentCiphertextDigestHex: hashHex(contentCiphertext),
    dekWrapNonceHex: '33'.repeat(24),
    wrappedDekDigestHex: hashHex(wrappedDek),
    createdAt: '2026-07-27T10:01:00.000Z',
  };
  const itemRecord: PicoReaderCustodyItemRecord = {
    schema: picoReaderCustodyItemRecordSchema,
    item,
    contentCiphertextHex: Buffer.from(contentCiphertext).toString('hex'),
    wrappedDekHex: Buffer.from(wrappedDek).toString('hex'),
    writerDeviceSigningKeyRecord: writerKeyRecord,
    writerSignatureHex: signHex(
      buildPicoReaderCustodyItemSignatureInput(item),
      writerKeypair.privateKey,
    ),
    receivedAt: item.createdAt,
  };
  sodium.memzero(kek);
  sodium.memzero(wrap);
  return {
    domain: domainRecord,
    writerGrant,
    item: itemRecord,
    identityKeypair,
    ownerReaderKeypair: readerKeypair,
    writerKeypair,
    writerIdentityFingerprint,
  };
}

function keyRecord(
  keyRole: PicoIdentityKeyRecordSignatureInput['keyRole'],
  publicKey: Uint8Array,
): PicoIdentityKeyRecordSignatureInput {
  return {
    suite: picoIdentitySuite,
    keyRole,
    publicKeyHex: Buffer.from(publicKey).toString('hex'),
  };
}

function fingerprint(record: PicoIdentityKeyRecordSignatureInput): string {
  return hashHex(buildPicoIdentityKeyRecordSignatureInput(record));
}

function hashHex(bytes: Uint8Array): string {
  return Buffer.from(sodium.crypto_generichash(32, bytes, null)).toString('hex');
}


function signHex(input: Uint8Array, privateKey: Uint8Array): string {
  return Buffer.from(sodium.crypto_sign_detached(input, privateKey)).toString(
    'hex',
  );
}
