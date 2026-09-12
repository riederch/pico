import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPicoHomeDomainReadGrantLifecycleSignatureInput,
  buildPicoHomeDomainReadGrantSignatureInput,
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoShareEnvelopeSignatureInput,
  buildPicoShareWrapPayload,
  picoHomeClaimResponseRecordSchema,
  picoHomeDomainReadGrantLifecycleRecordSchema,
  picoHomeDomainReadGrantRecordSchema,
  picoHomeFoundingRecordSchema,
  picoIdentitySuite,
  picoShareSuite,
  picoTestValidityWindow,
  type PicoHomeDomainReadGrantLifecycleRecord,
  type PicoHomeDomainReadGrantRecord,
  type PicoHomeFoundingRecord,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
} from '@pico/protocol';
import Database from 'better-sqlite3';
import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';
import { KeyStore } from './key-store.js';
import { MemoryContentCrypto } from './memory-content-crypto.js';
import {
  PicoIdentityReaderKeySelector,
  type PicoIdentityReaderKeyFreshnessQuery,
  type PicoIdentityReaderKeyFreshnessResult,
} from './reader-key.js';
import { PicoShareEnvelopeIssuer } from './share-envelope.js';
import { createPicoTestFirstDeviceEvidence } from './test-first-device-evidence.js';

/**
 * **Die Uhr dieser Datei geht mit** - und das ist hier keine Nachlässigkeit,
 * sondern die einzige stimmige Wahl.
 *
 * `recordPicoHomeDomainReadGrant` nimmt kein `at` entgegen: ADR 0115 lässt das
 * Home einen neuen Zuschuss mit seinem eigenen Jetzt stempeln. Ein Test, der
 * daneben auf einen festen Zeitpunkt in der Vergangenheit misst, prüft dann
 * zwei Uhren gegeneinander - und fällt um, sobald der Abstand zwischen ihnen
 * groß genug wird. Genau das zeigte `pnpm clock:check` am 2026-08-27.
 *
 * Also geht alles in dieser Datei mit derselben Uhr: dieser Zeitpunkt und die
 * Fenster aus `picoTestValidityWindow()` darum herum.
 */
const AT = new Date().toISOString();
const HOME_ID = 'home_share_envelope_test';
const DOMAIN = 'domain_share_envelope';
const GRANT_ID = 'grant_share_envelope_test_0001';
const DELEGATION_ID = 'delegation_share_envelope_test_0001';

let controller: { publicKey: Uint8Array; privateKey: Uint8Array };
let readerIdentity: { publicKey: Uint8Array; privateKey: Uint8Array };
let deviceSigning: { publicKey: Uint8Array; privateKey: Uint8Array };
let readerAgreement: { publicKey: Uint8Array; privateKey: Uint8Array };
let wrongIssuer: { publicKey: Uint8Array; privateKey: Uint8Array };
let controllerKeyRecord: PicoIdentityKeyRecordSignatureInput;
let readerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
let deviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
let readerKeyRecord: PicoIdentityKeyRecordSignatureInput;
let controllerFingerprint: string;
let readerIdentityFingerprint: string;
let deviceSigningFingerprint: string;
let readerFingerprint: string;

beforeAll(async () => {
  await sodium.ready;
  controller = sodium.crypto_sign_keypair();
  readerIdentity = sodium.crypto_sign_keypair();
  deviceSigning = sodium.crypto_sign_keypair();
  readerAgreement = sodium.crypto_box_keypair();
  wrongIssuer = sodium.crypto_sign_keypair();
  controllerKeyRecord = keyRecord('pico_identity', controller.publicKey);
  readerIdentityKeyRecord = keyRecord('pico_identity', readerIdentity.publicKey);
  deviceSigningKeyRecord = keyRecord('device_signing', deviceSigning.publicKey);
  readerKeyRecord = keyRecord('device_key_agreement', readerAgreement.publicKey);
  controllerFingerprint = fingerprint(controllerKeyRecord);
  readerIdentityFingerprint = fingerprint(readerIdentityKeyRecord);
  deviceSigningFingerprint = fingerprint(deviceSigningKeyRecord);
  readerFingerprint = fingerprint(readerKeyRecord);
});

describe('controller-signed share-envelope issuance (ADR 0084)', () => {
  it('seals the exact KEK payload, persists only after controller signature and retries idempotently', async () => {
    const fixture = createFixture();
    try {
      const prepared = await fixture.issuer.prepare(prepareInput(), new Date(AT));
      expect(prepared).toMatchObject({
        ok: true,
        pending: {
          envelope: {
            suite: picoShareSuite,
            grantId: GRANT_ID,
            domainId: DOMAIN,
            kekVersion: 1,
            issuerIdentityKeyFingerprintHex: controllerFingerprint,
            readerKeyFingerprintHex: readerFingerprint,
          },
        },
      });
      if (!prepared.ok) {
        throw new Error(prepared.reason);
      }

      const opened = sodium.crypto_box_seal_open(
        Buffer.from(prepared.pending.sealedWrapHex, 'hex'),
        readerAgreement.publicKey,
        readerAgreement.privateKey,
      );
      const kek = fixture.keyStore.loadKeyVersion(DOMAIN, 1);
      expect(Buffer.from(opened)).toEqual(Buffer.from(buildPicoShareWrapPayload({
        suite: picoShareSuite,
        domainId: DOMAIN,
        kekVersion: 1,
        readerKeyFingerprintHex: readerFingerprint,
        kekHex: kek.toString('hex'),
      })));
      sodium.memzero(kek);
      sodium.memzero(opened);

      const signatureHex = sign(
        buildPicoShareEnvelopeSignatureInput(prepared.pending.envelope),
        controller.privateKey,
      );
      const finalized = await fixture.issuer.finalize(
        prepared.pending.issuanceId,
        signatureHex,
        new Date(AT),
      );
      expect(finalized).toMatchObject({ ok: true, inserted: true });
      expect(fixture.store.picoShareEnvelopes()).toHaveLength(1);
      const persistedKekProbe = fixture.keyStore.loadKeyVersion(DOMAIN, 1);
      expect(JSON.stringify(fixture.store.picoShareEnvelopes())).not.toContain(
        persistedKekProbe.toString('hex'),
      );
      sodium.memzero(persistedKekProbe);
      await expect(fixture.issuer.finalize(
        prepared.pending.issuanceId,
        signatureHex,
        new Date(AT),
      )).resolves.toMatchObject({ ok: true, inserted: false });
    } finally {
      fixture.close();
    }
  });

  /**
   * Befund B151/B153. Zwei Ablehnungen dieser Tuer hatte nie jemand ausgeloest.
   *
   * `authority_changed` ist die schaerfere: `prepare` liest die Zuteilung ein
   * **zweites Mal**, nachdem die Leserschluessel-Auswahl `await`-et hat, weil
   * sie in dieser Luecke enden kann. Dieser Test zieht sie genau dort zurueck -
   * im Frischeruf, der innerhalb der Auswahl laeuft. Ohne die zweite Lesung
   * bekaeme jemand einen Umschlag auf eine Vollmacht, die es beim Ausstellen
   * nicht mehr gab.
   */
  it('refuses when the grant ends inside the reader-key selection', async () => {
    let revoked = false;
    const fixture = createFixture({
      freshness(query) {
        if (!revoked) {
          revoked = true;
          fixture.store.recordPicoHomeDomainReadGrantLifecycle({
            sodium,
            record: revokeGrant(),
          });
        }
        return currentCheckpoint(query);
      },
    });
    try {
      await expect(fixture.issuer.prepare(prepareInput(), new Date(AT)))
        .resolves.toEqual({ ok: false, reason: 'authority_changed' });
    } finally {
      fixture.close();
    }
  });

  /** Befund B151. Ohne Schluesselspeicher stellt dieses Home nichts aus. */
  it('refuses to issue at all when there is no key store', async () => {
    const fixture = createFixture();
    try {
      const withoutKeyStore = new PicoShareEnvelopeIssuer(
        fixture.store,
        sodium,
        new PicoIdentityReaderKeySelector(fixture.store, sodium, {
          check: async (query) => currentCheckpoint(query),
        }),
        undefined,
        2 * 60 * 1_000,
        128,
        () => 0,
      );
      await expect(withoutKeyStore.prepare(prepareInput(), new Date(AT)))
        .resolves.toEqual({ ok: false, reason: 'envelope_issuance_unavailable' });
    } finally {
      fixture.close();
    }
  });

  /**
   * Befund B153. Die Bindung „dieser Leser ist der der Zuteilung" wird
   * gehalten - aber unter einem anderen Namen, als `share-envelope.ts` dafuer
   * fuehrt. Wer eine Delegation nennt, die dem Leser der Zuteilung nicht
   * gehoert, findet keine Zeile und heisst `reader_key_is_not_locally_eligible`.
   *
   * `reader_does_not_match_grant` daneben kann nicht fallen: `prepare` ruft die
   * Auswahl **mit** dem Fingerabdruck der Zuteilung, die Abfrage filtert danach
   * und gibt genau ihn zurueck. Dieser Test haelt fest, was wirklich geschieht.
   */
  it('refuses a delegation the granted reader does not hold', async () => {
    const fixture = createFixture();
    try {
      await expect(fixture.issuer.prepare({
        ...prepareInput(),
        delegationId: 'delegation_someone_else_0001',
      }, new Date(AT))).resolves.toEqual({
        ok: false,
        reason: 'reader_key_is_not_locally_eligible',
      });
    } finally {
      fixture.close();
    }
  });

  it('fails closed without authenticated freshness and rechecks it before finalization', async () => {
    const unavailable = createFixture({ freshness: 'unavailable' });
    try {
      await expect(unavailable.issuer.prepare(
        prepareInput(),
        new Date(AT),
      )).resolves.toEqual({ ok: false, reason: 'freshness_unavailable' });
    } finally {
      unavailable.close();
    }

    let current = true;
    const changing = createFixture({
      freshness(query) {
        return current ? currentCheckpoint(query) : { status: 'stale' };
      },
    });
    try {
      const prepared = await changing.issuer.prepare(prepareInput(), new Date(AT));
      if (!prepared.ok) {
        throw new Error(prepared.reason);
      }
      current = false;
      await expect(changing.issuer.finalize(
        prepared.pending.issuanceId,
        sign(
          buildPicoShareEnvelopeSignatureInput(prepared.pending.envelope),
          controller.privateKey,
        ),
        new Date(AT),
      )).resolves.toEqual({ ok: false, reason: 'freshness_stale' });
      expect(changing.store.picoShareEnvelopes()).toEqual([]);
    } finally {
      changing.close();
    }
  });

  it('rejects wrong reader, missing KEK version and non-controller signatures', async () => {
    const fixture = createFixture();
    try {
      await expect(fixture.issuer.prepare({
        ...prepareInput(),
        readerKeyFingerprintHex: 'a'.repeat(64),
      }, new Date(AT))).resolves.toEqual({
        ok: false,
        reason: 'reader_key_is_not_locally_eligible',
      });
      await expect(fixture.issuer.prepare({
        ...prepareInput(),
        kekVersion: 2,
      }, new Date(AT))).resolves.toEqual({
        ok: false,
        reason: 'key_version_unavailable',
      });

      const prepared = await fixture.issuer.prepare(prepareInput(), new Date(AT));
      if (!prepared.ok) {
        throw new Error(prepared.reason);
      }
      await expect(fixture.issuer.finalize(
        prepared.pending.issuanceId,
        sign(
          buildPicoShareEnvelopeSignatureInput(prepared.pending.envelope),
          wrongIssuer.privateKey,
        ),
        new Date(AT),
      )).resolves.toEqual({ ok: false, reason: 'invalid_issuer_signature' });
      await expect(fixture.issuer.finalize(
        prepared.pending.issuanceId,
        sign(
          buildPicoShareEnvelopeSignatureInput(prepared.pending.envelope),
          controller.privateKey,
        ),
        new Date(AT),
      )).resolves.toEqual({ ok: false, reason: 'unknown_or_expired_issuance' });
      expect(fixture.store.picoShareEnvelopes()).toEqual([]);
    } finally {
      fixture.close();
    }
  });

  it('expires unsigned pending issuance without persisting it', async () => {
    const fixture = createFixture();
    try {
      const prepared = await fixture.issuer.prepare(prepareInput(), new Date(AT));
      if (!prepared.ok) {
        throw new Error(prepared.reason);
      }
      await expect(fixture.issuer.finalize(
        prepared.pending.issuanceId,
        sign(
          buildPicoShareEnvelopeSignatureInput(prepared.pending.envelope),
          controller.privateKey,
        ),
        // Zwei Minuten nach `AT`, aus `AT` gerechnet: als festes Datum
        // daneben geschrieben ging es mit, sobald die Uhr der Datei mitging.
        new Date(new Date(AT).getTime() + 2 * 60 * 1_000),
      )).resolves.toEqual({ ok: false, reason: 'unknown_or_expired_issuance' });
      expect(fixture.store.picoShareEnvelopes()).toEqual([]);
    } finally {
      fixture.close();
    }
  });

  it('ends the window on the monotonic clock even when the wall clock goes back', async () => {
    // ADR 0120 N1's whole reason. A pending issuance holds a sealed wrap, so
    // it is an exposure window - and a wall clock wound backward must not be
    // able to keep that wrap alive longer than it was meant to live.
    let monotonic = 0;
    const fixture = createFixture({ monotonicNow: () => monotonic });
    try {
      const prepared = await fixture.issuer.prepare(prepareInput(), new Date(AT));
      if (!prepared.ok) {
        throw new Error(prepared.reason);
      }
      // The wall clock says the ceremony started a minute from now; the
      // monotonic one says the window is spent.
      monotonic = 3 * 60 * 1_000;
      await expect(fixture.issuer.finalize(
        prepared.pending.issuanceId,
        sign(
          buildPicoShareEnvelopeSignatureInput(prepared.pending.envelope),
          controller.privateKey,
        ),
        // Eine Minute *vor* `AT` - die zurückgestellte Wanduhr, um die es
        // hier geht -, ebenfalls aus `AT` gerechnet.
        new Date(new Date(AT).getTime() - 60 * 1_000),
      )).resolves.toEqual({ ok: false, reason: 'unknown_or_expired_issuance' });
      expect(fixture.store.picoShareEnvelopes()).toEqual([]);
    } finally {
      fixture.close();
    }
  });

  it('bounds what it holds unsigned, dropping the oldest rather than growing', async () => {
    // Every pending issuance holds a sealed wrap in memory. An unbounded map
    // would make "prepare" a way to fill this process with other people's
    // key material, and the ceremony that is actually happening is the newest.
    const fixture = createFixture({ maxPending: 2 });
    try {
      const first = await fixture.issuer.prepare(prepareInput(), new Date(AT));
      const second = await fixture.issuer.prepare(prepareInput(), new Date(AT));
      const third = await fixture.issuer.prepare(prepareInput(), new Date(AT));
      if (!first.ok || !second.ok || !third.ok) {
        throw new Error('prepare refused');
      }

      // The oldest is gone; the newest two are still finalizable.
      await expect(fixture.issuer.finalize(
        first.pending.issuanceId,
        sign(
          buildPicoShareEnvelopeSignatureInput(first.pending.envelope),
          controller.privateKey,
        ),
        new Date(AT),
      )).resolves.toEqual({ ok: false, reason: 'unknown_or_expired_issuance' });

      await expect(fixture.issuer.finalize(
        third.pending.issuanceId,
        sign(
          buildPicoShareEnvelopeSignatureInput(third.pending.envelope),
          controller.privateKey,
        ),
        new Date(AT),
      )).resolves.toMatchObject({ ok: true, inserted: true });
    } finally {
      fixture.close();
    }
  });

  it('refuses a second signature over an envelope it already stored', async () => {
    // Idempotent retry is one signature arriving twice. A *different* one over
    // the same issuance is somebody else's claim to have controlled this, and
    // answering it with the stored record would launder it.
    const fixture = createFixture();
    try {
      const stored = await issue(fixture);
      await expect(fixture.issuer.finalize(
        stored.issuanceId,
        'f'.repeat(128),
        new Date(AT),
      )).resolves.toEqual({ ok: false, reason: 'conflicting_record' });
    } finally {
      fixture.close();
    }
  });

  it('refuses stored host, domain, reader and issuer binding swaps', async () => {
    const fixture = createFixture();
    try {
      await issue(fixture);
      const stored = fixture.store.picoShareEnvelopes()[0]!;
      const variants = [
        {
          ...stored.record.envelope,
          hostSigningKeyFingerprintHex: 'a'.repeat(64),
        },
        {
          ...stored.record.envelope,
          domainId: 'domain_other',
        },
        {
          ...stored.record.envelope,
          readerKeyFingerprintHex: 'b'.repeat(64),
        },
        {
          ...stored.record.envelope,
          issuerIdentityKeyFingerprintHex: 'c'.repeat(64),
        },
      ];
      for (const [index, envelope] of variants.entries()) {
        expect(fixture.store.recordPicoShareEnvelope({
          sodium,
          issuanceId: `issuance_tampered_${index}`,
          delegationId: stored.delegationId,
          record: {
            ...stored.record,
            envelope,
          },
          at: AT,
        })).toEqual({ ok: false, reason: 'invalid_envelope' });
      }
      /**
       * The fifth swap is answered differently, and that is the point: an
       * envelope whose grant is not active is refused as `inactive_grant`
       * rather than as a forgery. Nothing had ever been through that branch
       * (Befund B71), and the two say very different things to a caller -
       * "your authority ended" is not "your bytes are wrong".
       */
      expect(fixture.store.recordPicoShareEnvelope({
        sodium,
        issuanceId: 'issuance_grant_gone',
        delegationId: stored.delegationId,
        record: {
          ...stored.record,
          envelope: {
            ...stored.record.envelope,
            grantId: 'grant_that_no_longer_stands',
          },
        },
        at: AT,
      })).toEqual({ ok: false, reason: 'inactive_grant' });
      expect(fixture.store.picoShareEnvelopes()).toHaveLength(1);
    } finally {
      fixture.close();
    }
  });

  it('drops wrap swaps on restore and removes envelopes after grant revocation', async () => {
    const tampered = createFixture();
    try {
      await issue(tampered);
      tampered.store.close();
      const db = new Database(tampered.databasePath);
      const row = db.prepare(
        'SELECT sealed_wrap_hex AS sealedWrapHex FROM pico_share_envelope',
      ).get() as { sealedWrapHex: string };
      const lastByte = Number.parseInt(row.sealedWrapHex.slice(-2), 16);
      db.prepare('UPDATE pico_share_envelope SET sealed_wrap_hex = ?')
        .run(`${row.sealedWrapHex.slice(0, -2)}${(lastByte ^ 1).toString(16).padStart(2, '0')}`);
      db.close();

      const restored = new EventStore(tampered.databasePath, {
        memoryCrypto: new MemoryContentCrypto(sodium, tampered.keyStore),
      });
      expect(restored.reconcilePicoShareEnvelopes(
        sodium,
        (domain, version) => tampered.keyStore.listVersions(domain).includes(version),
        AT,
      )).toMatchObject({
        removedForAuthority: [{
          grantId: GRANT_ID,
          privacyDomain: DOMAIN,
          readerKeyFingerprintHex: readerFingerprint,
          kekVersion: 1,
        }],
        removedForMissingKey: [],
      });
      restored.close();
    } finally {
      tampered.remove();
    }

    const revoked = createFixture();
    try {
      await issue(revoked);
      expect(revoked.store.recordPicoHomeDomainReadGrantLifecycle({
        sodium,
        record: revokeGrant(),
      })).toMatchObject({ ok: true, inserted: true });
      expect(revoked.store.reconcilePicoShareEnvelopes(
        sodium,
        (domain, version) => revoked.keyStore.listVersions(domain).includes(version),
        AT,
      )).toMatchObject({
        removedForAuthority: [expect.objectContaining({ grantId: GRANT_ID })],
      });
      expect(revoked.store.picoShareEnvelopes()).toEqual([]);
    } finally {
      revoked.close();
    }
  });

  it('removes a stored envelope when its reader membership is revoked', async () => {
    const fixture = createFixture();
    try {
      await issue(fixture);
      const db = (fixture.store as unknown as {
        db: { prepare(sql: string): { run(...args: unknown[]): void } };
      }).db;
      db.prepare(`
        UPDATE pico_home_membership
        SET status = 'revoked'
        WHERE home_id = ?
          AND pico_identity_fingerprint_hex = ?
      `).run(HOME_ID, readerIdentityFingerprint);

      expect(fixture.store.reconcilePicoShareEnvelopes(
        sodium,
        (domain, version) => fixture.keyStore.listVersions(domain).includes(version),
        AT,
      )).toMatchObject({
        removedForAuthority: [expect.objectContaining({ grantId: GRANT_ID })],
      });
      expect(fixture.store.picoShareEnvelopes()).toEqual([]);
    } finally {
      fixture.close();
    }
  });

  it('removes stored envelopes whose host-custody KEK was shredded', async () => {
    const fixture = createFixture();
    try {
      await issue(fixture);
      expect(fixture.keyStore.shredDomain(DOMAIN)).toEqual({ removed: 1 });
      expect(fixture.store.reconcilePicoShareEnvelopes(
        sodium,
        (domain, version) => fixture.keyStore.listVersions(domain).includes(version),
        AT,
      )).toMatchObject({
        removedForAuthority: [],
        removedForMissingKey: [expect.objectContaining({
          grantId: GRANT_ID,
          kekVersion: 1,
        })],
      });
      expect(fixture.store.picoShareEnvelopes()).toEqual([]);
    } finally {
      fixture.close();
    }
  });
});

type FreshnessOption =
  | 'unavailable'
  | ((query: PicoIdentityReaderKeyFreshnessQuery) => PicoIdentityReaderKeyFreshnessResult);

function createFixture(options: {
  freshness?: FreshnessOption;
  /** ADR 0120 N1's second clock, so a test can wind one and not the other. */
  monotonicNow?: () => number;
  pendingTtlMs?: number;
  maxPending?: number;
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pico-share-envelope-test-'));
  const databasePath = join(dir, 'pico.sqlite');
  const keyStore = new KeyStore(join(dir, 'keys'));
  const store = new EventStore(databasePath, {
    memoryCrypto: new MemoryContentCrypto(sodium, keyStore),
  });
  store.claimPicoHome({
    homeId: HOME_ID,
    hostAdminPicoId: `pico:identity:${controllerFingerprint}`,
    hostSigningKeyFingerprintHex: '1'.repeat(64),
    hostKeyAgreementKeyFingerprintHex: '2'.repeat(64),
    foundingRecord: foundingRecord(),
    sodium,
  });
  const db = (store as unknown as {
    db: { prepare(sql: string): { run(...args: unknown[]): void } };
  }).db;
  db.prepare(`
    INSERT INTO pico_home_membership (
      membership_id,
      home_id,
      pico_identity_fingerprint_hex,
      role,
      status,
      scopes_json,
      source,
      source_ref,
      valid_from,
      valid_until,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, 'home_member', 'active', ?, 'membership_credential', ?, ?, ?, ?, ?)
  `).run(
    'membership_share_envelope_test',
    HOME_ID,
    readerIdentityFingerprint,
    '["memory_read"]',
    'credential_share_envelope_test',
    picoTestValidityWindow().validFrom,
    picoTestValidityWindow().validUntil,
    AT,
    AT,
  );
  store.memory().create({
    memoryItemId: 'memory_share_envelope_test',
    privacyDomain: DOMAIN,
    owner: 'test',
    controller: 'test',
    contentType: 'text/plain',
    content: 'secret',
    contentPosture: 'domain_encrypted',
  });
  const delegation = readerDelegation();
  expect(store.recordPicoIdentityLifecycleEvidence({
    sodium,
    identityKeyRecord: readerIdentityKeyRecord,
    delegation: {
      record: delegation,
      signatureHex: sign(
        buildPicoIdentityDelegationSignatureInput(delegation),
        readerIdentity.privateKey,
      ),
    },
    revocations: [],
  })).toEqual({ ok: true });
  expect(store.registerPicoIdentityReaderKey({
    sodium,
    picoIdentityFingerprintHex: readerIdentityFingerprint,
    deviceSigningKeyFingerprintHex: deviceSigningFingerprint,
    delegationId: DELEGATION_ID,
    deviceKeyAgreementKeyRecord: readerKeyRecord,
    at: AT,
  })).toEqual({ ok: true, inserted: true });
  expect(store.recordPicoHomeDomainReadGrant({
    sodium,
    record: domainGrant(),
  })).toMatchObject({ ok: true, inserted: true });

  const freshness = options.freshness ?? ((query: PicoIdentityReaderKeyFreshnessQuery) => (
    currentCheckpoint(query)
  ));
  const selector = new PicoIdentityReaderKeySelector(
    store,
    sodium,
    freshness === 'unavailable'
      ? undefined
      : { check: async (query) => freshness(query) },
  );
  const issuer = new PicoShareEnvelopeIssuer(
    store,
    sodium,
    selector,
    keyStore,
    options.pendingTtlMs ?? 2 * 60 * 1_000,
    options.maxPending ?? 128,
    options.monotonicNow ?? (() => 0),
  );
  let closed = false;
  return {
    dir,
    databasePath,
    keyStore,
    store,
    issuer,
    close() {
      if (!closed) {
        store.close();
        closed = true;
      }
      rmSync(dir, { recursive: true, force: true });
    },
    remove() {
      if (!closed) {
        try {
          store.close();
        } catch {
          // A restore test deliberately closes it before this fixture cleanup.
        }
        closed = true;
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function issue(
  fixture: ReturnType<typeof createFixture>,
): Promise<{ issuanceId: string }> {
  const prepared = await fixture.issuer.prepare(prepareInput(), new Date(AT));
  if (!prepared.ok) {
    throw new Error(prepared.reason);
  }
  const finalized = await fixture.issuer.finalize(
    prepared.pending.issuanceId,
    sign(
      buildPicoShareEnvelopeSignatureInput(prepared.pending.envelope),
      controller.privateKey,
    ),
    new Date(AT),
  );
  expect(finalized).toMatchObject({ ok: true, inserted: true });
  return { issuanceId: prepared.pending.issuanceId };
}

function prepareInput() {
  return {
    grantId: GRANT_ID,
    delegationId: DELEGATION_ID,
    readerKeyFingerprintHex: readerFingerprint,
    kekVersion: 1,
  };
}

function readerDelegation(): PicoIdentityDelegationSignatureInput {
  return {
    suite: picoIdentitySuite,
    delegationId: DELEGATION_ID,
    issuerIdentityKeyFingerprintHex: readerIdentityFingerprint,
    subjectSigningKeyFingerprintHex: deviceSigningFingerprint,
    subjectKeyAgreementKeyFingerprintHex: readerFingerprint,
    scopes: ['surface_session', 'decrypt_domain', 'receive_key_envelope'],
    ...picoTestValidityWindow(),
    lifecycleOrder: 'seq:0000000000000002',
  };
}

function domainGrant(): PicoHomeDomainReadGrantRecord {
  const grant: PicoHomeDomainReadGrantRecord['grant'] = {
    suite: picoIdentitySuite,
    grantId: GRANT_ID,
    homeId: HOME_ID,
    hostSigningKeyFingerprintHex: '1'.repeat(64),
    privacyDomain: DOMAIN,
    controllerPicoIdentityFingerprintHex: controllerFingerprint,
    readerPicoIdentityFingerprintHex: readerIdentityFingerprint,
    ...picoTestValidityWindow(),
    lifecycleOrder: 'seq:0000000000000003',
  };
  return {
    schema: picoHomeDomainReadGrantRecordSchema,
    grant,
    issuerIdentityKeyRecord: controllerKeyRecord,
    issuerSignatureHex: sign(
      buildPicoHomeDomainReadGrantSignatureInput(grant),
      controller.privateKey,
    ),
    createdAt: AT,
  };
}

function revokeGrant(): PicoHomeDomainReadGrantLifecycleRecord {
  const lifecycle: PicoHomeDomainReadGrantLifecycleRecord['lifecycle'] = {
    suite: picoIdentitySuite,
    lifecycleId: 'grant_share_envelope_lifecycle_0001',
    grantId: GRANT_ID,
    homeId: HOME_ID,
    hostSigningKeyFingerprintHex: '1'.repeat(64),
    privacyDomain: DOMAIN,
    controllerPicoIdentityFingerprintHex: controllerFingerprint,
    readerPicoIdentityFingerprintHex: readerIdentityFingerprint,
    status: 'revoked',
    reasonCategory: 'reader_removed',
    changedAt: new Date(new Date(AT).getTime() + 60 * 1_000).toISOString(),
    lifecycleOrder: 'seq:0000000000000004',
  };
  return {
    schema: picoHomeDomainReadGrantLifecycleRecordSchema,
    lifecycle,
    issuerIdentityKeyRecord: controllerKeyRecord,
    issuerSignatureHex: sign(
      buildPicoHomeDomainReadGrantLifecycleSignatureInput(lifecycle),
      controller.privateKey,
    ),
    createdAt: new Date(new Date(AT).getTime() + 60 * 1_000).toISOString(),
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
      foundingId: 'founding_share_envelope_test',
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
        claimId: 'claim_share_envelope_test',
        homeId: HOME_ID,
        hostSigningKeyFingerprintHex: '1'.repeat(64),
        hostKeyAgreementKeyFingerprintHex: '2'.repeat(64),
        claimantIdentityKeyFingerprintHex: controllerFingerprint,
        claimantNonceHex: '3'.repeat(64),
        hostNonceHex: '4'.repeat(64),
        foundingRecordId: 'founding_share_envelope_test',
      },
      hostSignatureHex: '6'.repeat(128),
    },
    hostFoundingSignatureHex: '7'.repeat(128),
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function currentCheckpoint(
  query: PicoIdentityReaderKeyFreshnessQuery,
): Extract<PicoIdentityReaderKeyFreshnessResult, { status: 'current' }> {
  return {
    status: 'current',
    sourceRef: 'registry:test',
    homeId: query.homeId,
    picoIdentityFingerprintHex: query.picoIdentityFingerprintHex,
    deviceSigningKeyFingerprintHex: query.deviceSigningKeyFingerprintHex,
    deviceKeyAgreementKeyFingerprintHex: query.deviceKeyAgreementKeyFingerprintHex,
    delegationId: query.delegationId,
    observedThroughLifecycleOrder: query.locallyObservedThroughLifecycleOrder,
    checkedAt: query.evaluatedAt,
    /**
     * Aus `checkedAt`, nicht daneben geschrieben: eine Frische gilt ab dem
     * Augenblick, in dem nachgesehen wurde, und ADR 0085 gibt ihr dafür
     * fünf Minuten. Als festes Datum galt sie stattdessen bis zu einem
     * Vormittag im Juli 2026 - für jeden Aufrufer, der die Wanduhr benutzt,
     * also seither gar nicht mehr.
     */
    freshUntil: new Date(
      new Date(query.evaluatedAt).getTime() + 4 * 60 * 1_000,
    ).toISOString(),
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
  return Buffer.from(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(record),
    null,
  )).toString('hex');
}

function sign(input: Uint8Array, privateKey: Uint8Array): string {
  return Buffer.from(sodium.crypto_sign_detached(input, privateKey)).toString('hex');
}
