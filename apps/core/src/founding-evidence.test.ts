import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildPicoHomeClaimResponseSignatureInput,
  buildPicoHomeFoundingSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  picoHomeClaimResponseRecordSchema,
  picoHomeFoundingRecordSchema,
  picoIdentitySuite,
  type PicoHomeFoundingRecord,
  type PicoIdentityKeyRecordSignatureInput,
} from '@pico/protocol';
import { verifyPicoHomeFoundingEvidence } from './founding-evidence.js';
import { createPicoTestFirstDeviceEvidence } from './test-first-device-evidence.js';

/**
 * ADR 0115. Die Tuer, durch die ein Home ueberhaupt entsteht.
 *
 * **Elf Ablehnungen, und keine war je gegangen** (Befund B151). Sie lagen
 * hinter einer modulprivaten Funktion in `app.ts`, erreichbar nur ueber die
 * Anspruchsflaeche; seit Befund B155 steht der Pruefer als eigenes Modul neben
 * seinen zwei Geschwistern, und diese Datei geht sie einzeln.
 *
 * Der Aufbau ist eine **echte** Gruendung: jede Unterschrift ist gerechnet,
 * nicht gesetzt. Nur so faellt eine verfaelschte Stelle aus dem Grund heraus,
 * den sie wirklich verletzt - mit erfundenen Unterschriften faellt jeder Fall
 * auf denselben Namen.
 */
const HOME_ID = 'home_founding_evidence_test';
const FOUNDING_ID = 'founding_evidence_test_0001';
const CLAIM_ID = 'claim_evidence_test_0001';
const FOUNDED_AT = '2026-07-19T10:00:00.000Z';

let claimant: { publicKey: Uint8Array; privateKey: Uint8Array };
let host: { publicKey: Uint8Array; privateKey: Uint8Array };
let stranger: { publicKey: Uint8Array; privateKey: Uint8Array };

beforeAll(async () => {
  await sodium.ready;
  claimant = sodium.crypto_sign_keypair();
  host = sodium.crypto_sign_keypair();
  stranger = sodium.crypto_sign_keypair();
});

describe('ADR 0115 - founding evidence (B151, B155)', () => {
  it('accepts a founding every signature of which holds', () => {
    expect(verifyPicoHomeFoundingEvidence(sodium, founding(), hex(host.publicKey)))
      .toEqual({ ok: true });
  });

  it('refuses a record that is not a founding record', () => {
    expect(verifyPicoHomeFoundingEvidence(
      sodium,
      { ...founding(), schema: 'pico.home.something-else.v1' as never },
      hex(host.publicKey),
    )).toEqual({ ok: false, reason: 'invalid_founding_record_schema' });
  });

  it('refuses a claimant key that is not an identity key', () => {
    const record = founding();
    expect(verifyPicoHomeFoundingEvidence(
      sodium,
      {
        ...record,
        claimantIdentityKeyRecord: {
          ...record.claimantIdentityKeyRecord,
          keyRole: 'device_signing',
        },
      },
      hex(host.publicKey),
    )).toEqual({ ok: false, reason: 'invalid_claimant_key_role' });
  });

  it('refuses a claimant key the founding does not name', () => {
    const record = founding();
    expect(verifyPicoHomeFoundingEvidence(
      sodium,
      { ...record, claimantIdentityKeyRecord: keyRecord('pico_identity', stranger.publicKey) },
      hex(host.publicKey),
    )).toEqual({ ok: false, reason: 'claimant_key_fingerprint_mismatch' });
  });

  it('refuses first-device key records the founding does not name', () => {
    const record = founding();
    expect(verifyPicoHomeFoundingEvidence(
      sodium,
      {
        ...record,
        firstDeviceSigningKeyRecord: keyRecord(
          'device_signing',
          sodium.crypto_sign_keypair().publicKey,
        ),
      },
      hex(host.publicKey),
    )).toEqual({ ok: false, reason: 'first_device_signing_key_mismatch' });

    expect(verifyPicoHomeFoundingEvidence(
      sodium,
      {
        ...record,
        firstDeviceKeyAgreementKeyRecord: keyRecord(
          'device_key_agreement',
          sodium.crypto_box_keypair().publicKey,
        ),
      },
      hex(host.publicKey),
    )).toEqual({ ok: false, reason: 'first_device_agreement_key_mismatch' });
  });

  it('refuses a delegation the founding does not name', () => {
    const record = founding();
    expect(verifyPicoHomeFoundingEvidence(
      sodium,
      {
        ...record,
        founding: { ...record.founding, firstDeviceDelegationId: 'delegation_somebody_elses' },
      },
      hex(host.publicKey),
    )).toEqual({ ok: false, reason: 'first_device_delegation_mismatch' });
  });

  it('refuses a delegation that does not carry the surface-session scope', () => {
    expect(verifyPicoHomeFoundingEvidence(
      sodium,
      founding({ scopes: ['decrypt_domain'] }),
      hex(host.publicKey),
    )).toEqual({ ok: false, reason: 'inactive_first_device_delegation' });
  });

  it('refuses a founding edited after the claimant signed it', () => {
    const record = founding();
    expect(verifyPicoHomeFoundingEvidence(
      sodium,
      { ...record, founding: { ...record.founding, homeId: 'home_somebody_elses' } },
      hex(host.publicKey),
    )).toEqual({ ok: false, reason: 'invalid_claimant_founding_signature' });
  });

  it('refuses a claim response edited after the host signed it', () => {
    const record = founding();
    expect(verifyPicoHomeFoundingEvidence(
      sodium,
      {
        ...record,
        hostClaimResponse: {
          ...record.hostClaimResponse,
          claimResponse: { ...record.hostClaimResponse.claimResponse, claimId: 'claim_other' },
        },
      },
      hex(host.publicKey),
    )).toEqual({ ok: false, reason: 'invalid_host_claim_response_signature' });
  });

  it('refuses a founding countersigned by a different host key', () => {
    // Die Ansprechenden-Unterschrift haelt; nur der Host ist ein anderer. Das
    // trennt die letzte Pruefung von der davor.
    const record = founding({ claimResponseSigner: stranger });
    expect(verifyPicoHomeFoundingEvidence(sodium, record, hex(stranger.publicKey)))
      .toEqual({ ok: false, reason: 'invalid_host_founding_signature' });
  });

  it('answers something that is not a signature with one bounded refusal', () => {
    const record = founding();
    expect(verifyPicoHomeFoundingEvidence(
      sodium,
      { ...record, claimantFoundingSignatureHex: 'nicht-hex' },
      hex(host.publicKey),
    )).toEqual({ ok: false, reason: 'malformed_founding_evidence' });
  });
});

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function keyRecord(
  keyRole: PicoIdentityKeyRecordSignatureInput['keyRole'],
  publicKey: Uint8Array,
): PicoIdentityKeyRecordSignatureInput {
  return { suite: picoIdentitySuite, keyRole, publicKeyHex: hex(publicKey) };
}

function founding(options: {
  scopes?: readonly string[];
  /** Unterschreibt nur die Anspruchsantwort, nicht die Gruendung. */
  claimResponseSigner?: { privateKey: Uint8Array };
} = {}): PicoHomeFoundingRecord {
  const claimantIdentityKeyRecord = keyRecord('pico_identity', claimant.publicKey);
  const homeHostPicoIdentityFingerprintHex = hex(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(claimantIdentityKeyRecord),
    null,
  ));
  const evidence = createPicoTestFirstDeviceEvidence({
    sodium,
    claimantIdentityPrivateKey: claimant.privateKey,
    claimantIdentityKeyFingerprintHex: homeHostPicoIdentityFingerprintHex,
    ...(options.scopes === undefined ? {} : { scopes: options.scopes }),
  });

  const hostSigningKeyFingerprintHex = '1'.repeat(64);
  const hostKeyAgreementKeyFingerprintHex = '2'.repeat(64);
  const claimantNonceHex = '4'.repeat(64);
  const hostNonceHex = '5'.repeat(64);

  const foundingFields = {
    suite: picoIdentitySuite,
    foundingId: FOUNDING_ID,
    homeId: HOME_ID,
    hostSigningKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex,
    homeHostPicoIdentityFingerprintHex,
    claimantNonceHex,
    hostNonceHex,
    foundedAt: FOUNDED_AT,
    lifecycleOrder: 'seq:0000000000000001',
    ...evidence.foundingFields,
  } as PicoHomeFoundingRecord['founding'];

  const claimResponse = {
    suite: picoIdentitySuite,
    claimId: CLAIM_ID,
    homeId: HOME_ID,
    hostSigningKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex,
    claimantIdentityKeyFingerprintHex: homeHostPicoIdentityFingerprintHex,
    claimantNonceHex,
    hostNonceHex,
    foundingRecordId: FOUNDING_ID,
  } as PicoHomeFoundingRecord['hostClaimResponse']['claimResponse'];

  const responseSigner = options.claimResponseSigner ?? host;

  return {
    schema: picoHomeFoundingRecordSchema,
    founding: foundingFields,
    firstDeviceSigningKeyRecord: evidence.firstDeviceSigningKeyRecord,
    firstDeviceKeyAgreementKeyRecord: evidence.firstDeviceKeyAgreementKeyRecord,
    firstDeviceDelegation: evidence.firstDeviceDelegation,
    firstDeviceRevocations: evidence.firstDeviceRevocations,
    claimantIdentityKeyRecord,
    claimantFoundingSignatureHex: hex(sodium.crypto_sign_detached(
      buildPicoHomeFoundingSignatureInput(foundingFields),
      claimant.privateKey,
    )),
    hostClaimResponse: {
      schema: picoHomeClaimResponseRecordSchema,
      claimResponse,
      hostSignatureHex: hex(sodium.crypto_sign_detached(
        buildPicoHomeClaimResponseSignatureInput(claimResponse),
        responseSigner.privateKey,
      )),
    },
    hostFoundingSignatureHex: hex(sodium.crypto_sign_detached(
      buildPicoHomeFoundingSignatureInput(foundingFields),
      host.privateKey,
    )),
    createdAt: FOUNDED_AT,
  } as PicoHomeFoundingRecord;
}
