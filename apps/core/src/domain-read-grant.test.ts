import { bytesToHex } from '@pico/protocol/canonical-bytes';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPicoHomeDomainReadGrantLifecycleSignatureInput,
  buildPicoHomeDomainReadGrantSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  picoHomeClaimResponseRecordSchema,
  picoHomeDomainReadGrantLifecycleRecordSchema,
  picoHomeDomainReadGrantRecordSchema,
  picoHomeFoundingRecordSchema,
  picoIdentitySuite,
  type PicoHomeDomainReadGrantLifecycleRecord,
  type PicoHomeDomainReadGrantRecord,
  type PicoHomeFoundingRecord,
  type PicoIdentityKeyRecordSignatureInput,
  picoTestValidityWindow,
} from '@pico/protocol';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';
import {
  verifyPicoHomeDomainReadGrant,
  verifyPicoHomeDomainReadGrantLifecycle,
} from './domain-read-grant.js';
import { createPicoTestFirstDeviceEvidence } from './test-first-device-evidence.js';

const stores: EventStore[] = [];
const tempDirs: string[] = [];
const HOME_ID = 'home_domain_grant_test';
const DOMAIN = 'domain-journal';

let controller: { publicKey: Uint8Array; privateKey: Uint8Array };
let controllerKeyRecord: PicoIdentityKeyRecordSignatureInput;
let controllerFingerprint: string;

beforeAll(async () => {
  await sodium.ready;
  controller = sodium.crypto_sign_keypair();
  controllerKeyRecord = {
    suite: picoIdentitySuite,
    keyRole: 'pico_identity',
    publicKeyHex: bytesToHex(controller.publicKey),
  };
  controllerFingerprint = fingerprint(controllerKeyRecord);
});

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('Home domain read grants (ADR 0082)', () => {
  it('accepts only the founding Home Host Pico as controller', () => {
    const founding = foundingRecord();
    expect(verifyPicoHomeDomainReadGrant(sodium, {
      record: issueGrant(),
      foundingRecord: founding,
    })).toEqual({ ok: true });

    expect(verifyPicoHomeDomainReadGrant(sodium, {
      record: issueGrant({ controllerPicoIdentityFingerprintHex: 'a'.repeat(64) }),
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'issuer_is_not_home_host_pico' });
    expect(verifyPicoHomeDomainReadGrant(sodium, {
      record: issueGrant({ hostSigningKeyFingerprintHex: 'b'.repeat(64) }),
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'foreign_host_key' });
    expect(verifyPicoHomeDomainReadGrant(sodium, {
      record: issueGrant({ homeId: 'home_foreign' }),
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'foreign_home' });
  });

  it('refuses a grant edited after it was signed', () => {
    // Every other check here reads a field the verifier compares itself. These
    // two are protected by the signature alone: the domain a grant is *for*
    // and the reader it is *to*. An edit that slipped through would hand
    // somebody a domain nobody granted them.
    const founding = foundingRecord();
    const signed = issueGrant();

    const domainSwapped = {
      ...signed,
      grant: { ...signed.grant, privacyDomain: 'domain-somebody-elses' },
    };
    expect(verifyPicoHomeDomainReadGrant(sodium, {
      record: domainSwapped,
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'invalid_issuer_signature' });

    const readerSwapped = {
      ...signed,
      grant: { ...signed.grant, readerPicoIdentityFingerprintHex: 'e'.repeat(64) },
    };
    expect(verifyPicoHomeDomainReadGrant(sodium, {
      record: readerSwapped,
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'invalid_issuer_signature' });

    const windowSwapped = {
      ...signed,
      grant: { ...signed.grant, validUntil: '2099-01-01T00:00:00.000Z' },
    };
    expect(verifyPicoHomeDomainReadGrant(sodium, {
      record: windowSwapped,
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'invalid_issuer_signature' });
  });

  it('refuses a record that is not this schema, and a suite that is not ours', () => {
    // ADR 0025. A record from a different suite is not a weaker claim, it is a
    // claim in a language this Home does not read.
    const founding = foundingRecord();
    expect(verifyPicoHomeDomainReadGrant(sodium, {
      record: { ...issueGrant(), schema: 'pico.home.domain-read-grant.v0' as never },
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'invalid_grant_schema' });
    expect(verifyPicoHomeDomainReadGrant(sodium, {
      record: issueGrant({ suite: 'somebody.elses.suite.v1' as never }),
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'foreign_suite' });
  });

  it('accepts a grant from a previous era only when that key is still accepted', () => {
    // ADR 0115. The chain vouches for history, only the head stamps anything
    // new - so a grant signed under the retired host key stays verifiable, and
    // only because this Home says which keys it still accepts.
    const founding = foundingRecord();
    const earlier = issueGrant({ hostSigningKeyFingerprintHex: '9'.repeat(64) });

    expect(verifyPicoHomeDomainReadGrant(sodium, {
      record: earlier,
      foundingRecord: founding,
      acceptedHostSigningKeyFingerprintHexes: ['1'.repeat(64), '9'.repeat(64)],
    })).toEqual({ ok: true });

    expect(verifyPicoHomeDomainReadGrant(sodium, {
      record: earlier,
      foundingRecord: founding,
      acceptedHostSigningKeyFingerprintHexes: ['1'.repeat(64)],
    })).toEqual({ ok: false, reason: 'foreign_host_key' });
  });

  it('refuses an issuer key that is the wrong role or the wrong key', () => {
    // The controller is named by fingerprint; the record carrying the public
    // key has to be *that* key, in the role that may sign for an identity.
    const founding = foundingRecord();
    const signed = issueGrant();

    expect(verifyPicoHomeDomainReadGrant(sodium, {
      record: {
        ...signed,
        issuerIdentityKeyRecord: { ...controllerKeyRecord, keyRole: 'device_signing' as never },
      },
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'invalid_issuer_key_role' });

    expect(verifyPicoHomeDomainReadGrant(sodium, {
      record: {
        ...signed,
        issuerIdentityKeyRecord: { ...controllerKeyRecord, publicKeyHex: 'a'.repeat(64) },
      },
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'issuer_key_fingerprint_mismatch' });
  });

  it('requires lifecycle statements to bind the exact grant and advance its order', () => {
    const grant = issueGrant();
    expect(verifyPicoHomeDomainReadGrantLifecycle(sodium, {
      record: issueLifecycle(grant),
      grantRecord: grant,
      foundingRecord: foundingRecord(),
    })).toEqual({ ok: true });

    expect(verifyPicoHomeDomainReadGrantLifecycle(sodium, {
      record: issueLifecycle(grant, { privacyDomain: 'domain-other' }),
      grantRecord: grant,
      foundingRecord: foundingRecord(),
    })).toEqual({ ok: false, reason: 'grant_binding_mismatch' });
    expect(verifyPicoHomeDomainReadGrantLifecycle(sodium, {
      record: issueLifecycle(grant, { lifecycleOrder: grant.grant.lifecycleOrder }),
      grantRecord: grant,
      foundingRecord: foundingRecord(),
    })).toEqual({ ok: false, reason: 'grant_binding_mismatch' });
  });

  /**
   * Befund B151. Drei Ablehnungen dieser Urkunde hatte nie jemand ausgeloest.
   *
   * Das Schema und die Zuteilungsnummer stehen *vor* der Unterschrift, sind
   * also das, was ein Aufrufer als erstes falsch machen kann - und
   * `malformed_domain_read_grant` faengt, was beim Bauen der Signatureingabe
   * oder beim Pruefen des Schluessels ueberhaupt wirft, damit nichts daraus
   * ungefangen nach aussen dringt.
   */
  it('refuses a lifecycle with a foreign schema or a grant it does not name', () => {
    const grant = issueGrant();
    const founding = foundingRecord();

    expect(verifyPicoHomeDomainReadGrantLifecycle(sodium, {
      record: { ...issueLifecycle(grant), schema: 'pico.home.something-else.v1' as never },
      grantRecord: grant,
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'invalid_lifecycle_schema' });

    expect(verifyPicoHomeDomainReadGrantLifecycle(sodium, {
      record: issueLifecycle(grant, { grantId: 'grant_somebody_elses_0001' }),
      grantRecord: grant,
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'unknown_grant' });
  });

  it('answers a malformed record with one bounded refusal instead of throwing', () => {
    const founding = foundingRecord();
    const signed = issueGrant();

    // Keine Unterschrift, sondern etwas, das gar keine sein kann: die Pruefung
    // wirft, und der Aufrufer soll davon nichts merken ausser der Ablehnung.
    expect(verifyPicoHomeDomainReadGrant(sodium, {
      record: { ...signed, issuerSignatureHex: 'nicht-hex' },
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'malformed_domain_read_grant' });

    // Und derselbe Satz eine Ebene tiefer, beim Schluesseldatensatz.
    expect(verifyPicoHomeDomainReadGrant(sodium, {
      record: {
        ...signed,
        issuerIdentityKeyRecord: { ...controllerKeyRecord, publicKeyHex: 'nicht-hex' },
      },
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'malformed_domain_read_grant' });

    // Auch auf dem Lebenszyklusweg, der seine eigene Signatureingabe baut.
    expect(verifyPicoHomeDomainReadGrantLifecycle(sodium, {
      record: { ...issueLifecycle(signed), issuerSignatureHex: 'nicht-hex' },
      grantRecord: signed,
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'malformed_domain_read_grant' });
  });

  it('authorizes only an active member, existing host-custody domain and unrevoked grant', () => {
    const store = openClaimedStore();
    store.memory().create({
      memoryItemId: 'memory_domain_grant_test',
      privacyDomain: DOMAIN,
      owner: 'test',
      controller: 'test',
      contentType: 'text/plain',
      content: 'secret',
    });
    const grant = issueGrant();

    expect(store.recordPicoHomeDomainReadGrant({ sodium, record: grant })).toMatchObject({
      ok: true,
      inserted: true,
      grant: { status: 'active' },
    });
    /**
     * Zwei Zeitpunkte aus dem Fenster gerechnet, nicht daneben geschrieben:
     * einer darin und einer dahinter. Als feste Daten sagten sie „drinnen"
     * und „draußen" nur so lange, wie das Fenster selbst festlag.
     */
    const insideWindow = new Date().toISOString();
    const afterWindow = new Date(
      new Date(picoTestValidityWindow().validUntil).getTime() + 1_000,
    ).toISOString();
    expect(store.mayReadDomain(
      controllerFingerprint,
      DOMAIN,
      HOME_ID,
      insideWindow,
    )).toBe(true);
    expect(store.mayReadDomain(
      controllerFingerprint,
      'domain-other',
      HOME_ID,
      insideWindow,
    )).toBe(false);
    expect(store.mayReadDomain(
      controllerFingerprint,
      DOMAIN,
      HOME_ID,
      afterWindow,
    )).toBe(false);

    expect(store.recordPicoHomeDomainReadGrantLifecycle({
      sodium,
      record: issueLifecycle(grant),
    })).toMatchObject({ ok: true, inserted: true, grant: { status: 'revoked' } });
    expect(store.mayReadDomain(
      controllerFingerprint,
      DOMAIN,
      HOME_ID,
      insideWindow,
    )).toBe(false);
  });

  it('refuses a grant to somebody who is not a member of this Home', () => {
    // ADR 0082. A grant names a reader, and a reader who is not in the Home is
    // a stranger this statement would let read a domain. The verification says
    // the signature is genuine; only this says the subject belongs here.
    const store = openClaimedStore();
    store.memory().create({
      memoryItemId: 'memory_domain_grant_stranger',
      privacyDomain: DOMAIN,
      owner: 'test',
      controller: 'test',
      contentType: 'text/plain',
      content: 'secret',
    });

    expect(store.recordPicoHomeDomainReadGrant({
      sodium,
      record: issueGrant({ readerPicoIdentityFingerprintHex: 'f'.repeat(64) }),
    })).toEqual({ ok: false, reason: 'reader_is_not_active_member' });
  });

  it('refuses a grant over a domain this Home does not hold in host custody', () => {
    // A domain that does not exist yet is not a domain to grant reading of:
    // the grant would sit there authorizing a name nobody has written to.
    const store = openClaimedStore();

    expect(store.recordPicoHomeDomainReadGrant({
      sodium,
      record: issueGrant(),
    })).toEqual({ ok: false, reason: 'domain_is_not_host_custody' });
  });

  it('drops malformed lifecycle and grant authority during boot-style reconciliation', () => {
    const store = openClaimedStore();
    store.memory().create({
      memoryItemId: 'memory_domain_grant_tamper',
      privacyDomain: DOMAIN,
      owner: 'test',
      controller: 'test',
      contentType: 'text/plain',
      content: 'secret',
    });
    const grant = issueGrant();
    expect(store.recordPicoHomeDomainReadGrant({ sodium, record: grant }).ok).toBe(true);
    expect(store.recordPicoHomeDomainReadGrantLifecycle({
      sodium,
      record: issueLifecycle(grant),
    }).ok).toBe(true);

    const db = (store as unknown as {
      db: { prepare(sql: string): { run(...args: unknown[]): void } };
    }).db;
    db.prepare('UPDATE pico_home_domain_read_grant_lifecycle SET lifecycle_json = ?')
      .run('null');
    expect(store.reconcilePicoHomeDomainReadGrants(sodium)).toEqual({
      droppedGrants: 0,
      droppedLifecycleRecords: 1,
    });
    // Aus dem Fenster gefragt statt an einem festen Tag: „aktiv" ist eine
    // Aussage über einen Zeitpunkt, und der muss im Fenster liegen.
    expect(store.picoHomeDomainReadGrants(
      new Date().toISOString(),
    )).toMatchObject([{ status: 'active' }]);

    db.prepare('UPDATE pico_home_domain_read_grant SET grant_json = ?')
      .run('null');

    expect(store.reconcilePicoHomeDomainReadGrants(sodium)).toEqual({
      droppedGrants: 1,
      droppedLifecycleRecords: 0,
    });
    expect(store.picoHomeDomainReadGrants()).toEqual([]);
  });
});

function openClaimedStore(): EventStore {
  const dir = mkdtempSync(join(tmpdir(), 'pico-domain-grant-test-'));
  tempDirs.push(dir);
  const store = new EventStore(join(dir, 'pico.sqlite'));
  stores.push(store);
  const founding = foundingRecord();
  store.claimPicoHome({
    homeId: founding.founding.homeId,
    hostAdminPicoId: `pico:identity:${controllerFingerprint}`,
    hostSigningKeyFingerprintHex: founding.founding.hostSigningKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex: founding.founding.hostKeyAgreementKeyFingerprintHex,
    foundingRecord: founding,
    sodium,
  });
  return store;
}

function issueGrant(
  overrides: Partial<PicoHomeDomainReadGrantRecord['grant']> = {},
): PicoHomeDomainReadGrantRecord {
  const grant: PicoHomeDomainReadGrantRecord['grant'] = {
    suite: picoIdentitySuite,
    grantId: 'grant_domain_test_0001',
    homeId: HOME_ID,
    hostSigningKeyFingerprintHex: '1'.repeat(64),
    privacyDomain: DOMAIN,
    controllerPicoIdentityFingerprintHex: controllerFingerprint,
    readerPicoIdentityFingerprintHex: controllerFingerprint,
    /**
     * Um die Uhr herum: diese Datei gibt nirgends ein `at` an, also misst der
     * Speicher überall an der Wanduhr. Ein festes Fenster hätte hier bis zum
     * Neujahrstag 2027 gehalten und wäre danach von selbst zugefallen.
     * Wer *über* das Fenster etwas sagt, gibt es unter `overrides` an - und
     * zwei Tests in dieser Datei tun das.
     */
    ...picoTestValidityWindow(),
    lifecycleOrder: 'seq:0000000000000001',
    ...overrides,
  };
  return {
    schema: picoHomeDomainReadGrantRecordSchema,
    grant,
    issuerIdentityKeyRecord: controllerKeyRecord,
    issuerSignatureHex: sign(buildPicoHomeDomainReadGrantSignatureInput(grant)),
    createdAt: '2026-07-27T10:00:00.000Z',
  };
}

function issueLifecycle(
  grant: PicoHomeDomainReadGrantRecord,
  overrides: Partial<PicoHomeDomainReadGrantLifecycleRecord['lifecycle']> = {},
): PicoHomeDomainReadGrantLifecycleRecord {
  const lifecycle: PicoHomeDomainReadGrantLifecycleRecord['lifecycle'] = {
    suite: picoIdentitySuite,
    lifecycleId: 'grant_lifecycle_domain_test_0001',
    grantId: grant.grant.grantId,
    homeId: grant.grant.homeId,
    hostSigningKeyFingerprintHex: grant.grant.hostSigningKeyFingerprintHex,
    privacyDomain: grant.grant.privacyDomain,
    controllerPicoIdentityFingerprintHex: grant.grant.controllerPicoIdentityFingerprintHex,
    readerPicoIdentityFingerprintHex: grant.grant.readerPicoIdentityFingerprintHex,
    status: 'revoked',
    reasonCategory: 'reader_removed',
    changedAt: '2026-08-01T00:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000002',
    ...overrides,
  };
  return {
    schema: picoHomeDomainReadGrantLifecycleRecordSchema,
    lifecycle,
    issuerIdentityKeyRecord: controllerKeyRecord,
    issuerSignatureHex: sign(buildPicoHomeDomainReadGrantLifecycleSignatureInput(lifecycle)),
    createdAt: '2026-08-01T00:00:00.000Z',
  };
}

function foundingRecord(): PicoHomeFoundingRecord {
  const evidence = createPicoTestFirstDeviceEvidence({
    sodium,
    claimantIdentityPrivateKey: controller.privateKey,
    claimantIdentityKeyFingerprintHex: controllerFingerprint,
  });
  return {
    schema: picoHomeFoundingRecordSchema,
    founding: {
      suite: picoIdentitySuite,
      foundingId: 'founding_domain_grant_test',
      homeId: HOME_ID,
      hostSigningKeyFingerprintHex: '1'.repeat(64),
      hostKeyAgreementKeyFingerprintHex: '2'.repeat(64),
      homeHostPicoIdentityFingerprintHex: controllerFingerprint,
      claimantNonceHex: '3'.repeat(64),
      hostNonceHex: '4'.repeat(64),
      foundedAt: '2026-01-01T00:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000001',
      ...evidence.foundingFields,
    },
    firstDeviceSigningKeyRecord: evidence.firstDeviceSigningKeyRecord,
    firstDeviceKeyAgreementKeyRecord: evidence.firstDeviceKeyAgreementKeyRecord,
    firstDeviceDelegation: evidence.firstDeviceDelegation,
    firstDeviceRevocations: evidence.firstDeviceRevocations,
    claimantIdentityKeyRecord: controllerKeyRecord,
    claimantFoundingSignatureHex: '5'.repeat(128),
    hostClaimResponse: {
      schema: picoHomeClaimResponseRecordSchema,
      claimResponse: {
        suite: picoIdentitySuite,
        claimId: 'claim_domain_grant_test',
        homeId: HOME_ID,
        hostSigningKeyFingerprintHex: '1'.repeat(64),
        hostKeyAgreementKeyFingerprintHex: '2'.repeat(64),
        claimantIdentityKeyFingerprintHex: controllerFingerprint,
        claimantNonceHex: '3'.repeat(64),
        hostNonceHex: '4'.repeat(64),
        foundingRecordId: 'founding_domain_grant_test',
      },
      hostSignatureHex: '6'.repeat(128),
    },
    hostFoundingSignatureHex: '7'.repeat(128),
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function fingerprint(record: PicoIdentityKeyRecordSignatureInput): string {
  return bytesToHex(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(record),
    null,
  ));
}

function sign(input: Uint8Array): string {
  return bytesToHex(sodium.crypto_sign_detached(input, controller.privateKey));
}

