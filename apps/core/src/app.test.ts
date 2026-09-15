import { bytesToHex, hexToBytes } from '@pico/protocol/canonical-bytes';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import Database from 'better-sqlite3';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  actionEventTypes,
  avatarIntensities,
  avatarModes,
  avatarStates,
  avatarStatusColors,
  buildPicoHomeClaimResponseSignatureInput,
  buildPicoHomeClaimSignatureInput,
  buildPicoHomeDomainReadGrantLifecycleSignatureInput,
  buildPicoHomeDomainReadGrantSignatureInput,
  buildPicoHomeDeviceActivationSignatureInput,
  buildPicoHomeDeviceRecoveryClaimSignatureInput,
  buildPicoHomeMembershipLifecycleSignatureInput,
  buildPicoHomeMembershipSignatureInput,
  picoHomeMembershipCredentialSchema,
  picoHomeMembershipLifecycleRecordSchema,
  buildPicoHomeFoundingSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityPossessionSignatureInput,
  buildPicoIdentityReaderKeyFreshnessSignatureInput,
  buildPicoShareEnvelopeSignatureInput,
  buildPicoIdentityRevocationSignatureInput,
  buildPicoHomeContinuitySignatureInput,
  buildPicoIdentityRotationSignatureInput,
  picoHomeContinuityRecordSchema,
  buildPicoLinkDirectRequestSignatureInput,
  buildPicoLinkDirectResponseSignatureInput,
  deviceSeenStatuses,
  clientWritableMessageCreatedRoles,
  messageCreatedRoles,
  picoHomeClaimEnvelopeSchema,
  picoHomeFoundingAcceptanceSchema,
  picoHomeFoundingRecordSchema,
  picoHomeDomainReadGrantLifecycleRecordSchema,
  picoHomeDomainReadGrantRecordSchema,
  picoHomeDeviceLifecycleEvidenceDigestHex,
  picoHomeDeviceLifecycleSubmissionSchema,
  picoHomeDeviceRecoveryEvidenceDigestHex,
  picoHomeDeviceRecoverySubmissionSchema,
  picoHomeMembershipScopes,
  picoHomeEventTypes,
  picoHomeSealedClaimPayloadSchema,
  picoHomeSealedClaimPayloadV2Schema,
  picoIdentitySuite,
  picoIdentityReaderKeyFreshnessCheckpointSchema,
  picoShareSuite,
  picoLinkDirectPayloadDigestHex,
  picoLinkDirectRequestEnvelopeSchema,
  picoLinkDirectResponseEnvelopeSchema,
  protocolCapabilities,
  realtimeMessageType,
  type PicoHomeClaimResponse,
  type PicoHomeClaimSignatureInput,
  type PicoHomeFoundingAcceptance,
  type PicoHomeFoundingRecord,
  type PicoHomeFoundingSignatureInput,
  type PicoHomeDomainReadGrantLifecycleSignatureInput,
  type PicoHomeDomainReadGrantSignatureInput,
  type PicoHomePendingClaimResponse,
  type PicoHomeSetupResponse,
  type PicoHomeMembershipLifecycleSignatureInput,
  type PicoHomeMembershipSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityDelegationScope,
  type PicoIdentityReaderKeyFreshnessSignatureInput,
  type PicoIdentityRevocationSignatureInput,
  type PicoIdentityRotationSignatureInput,
  type PicoHomeContinuityRecord,
  type PicoHomeContinuitySignatureInput,
  type PicoLinkDirectOperation,
  type PicoLinkDirectResponseSignatureInput,
  picoTestValidityWindow,
} from '@pico/protocol';
import { buildPicoLibraryDerivation } from '@pico/protocol/library-pin';
import { parsePicoModelJob } from '@pico/protocol/model-job';
import { PicoModelJobQueue } from './model-job-queue.js';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { KeyStore } from './key-store.js';
import { MemoryContentCrypto } from './memory-content-crypto.js';
import {
  picoModuleEffectConsentMigrationId,
  picoRuleDecisionMigrationId,
  picoSchemaBaselineMigrationId,
  picoSupplierAttachmentMigrationId,
  picoDepotAttachmentMigrationId,
  picoDepotFetchOutcomeMigrationId,
  picoLinkMailboxMigrationId,
  picoLinkPushLedgerMigrationId,
  picoDepotAcceptedByMigrationId,
  picoLinkRelayIdentityMigrationId,
  picoModelJobKindMigrationId,
  picoModelJobRecallContextMigrationId,
  picoPresenceRegistryMigrationId,
  picoPresenceSwitchMigrationId,
  picoModelJobKeptMemoryMigrationId,
  picoLinkDirectSeenRequestMigrationId,
  picoModelJobForgottenMigrationId,
  picoModelProviderCredentialMigrationId,
  picoMemoryEncryptionDecisionMigrationId,
  picoModelJobProvenanceMigrationId,
  picoModelJobQueueMigrationId,
  picoModelProviderConsentMigrationId,
  picoModelProviderEntryMigrationId,
  picoDepotReachMigrationId,
  picoLibraryDerivationMigrationId,
  picoSupplierCredentialScopeMigrationId,
} from './migrations.js';
import { operatorResetMarkerPath } from './operator-bootstrap.js';
import {
  claimPicoHomeThroughSealedFlow,
  createPicoHomeFoundingAcceptance,
  createPicoIdentitySessionDevice,
  createSealedPicoHomeClaim,
  type PicoTestSealedHomeClaim,
} from './test-claimed-home.js';
import {
  HomeHostKeyStore,
  homeResetMarkerPath,
  recoveryAnchorReseedMarkerPath,
} from './home-setup.js';

const tempDirs: string[] = [];
const RESERVED_EVENT_ERROR = 'This event type is reserved for a later Pico Rules, Action Runner or Pico Home API.';
const OPERATOR_PASSPHRASE = 'correct horse battery staple';
const capturedLogLines = new WeakMap<object, string[]>();

function createDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-core-test-'));
  tempDirs.push(dir);
  return join(dir, 'pico.sqlite');
}

function createWebRootPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-web-test-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><html><head><title>Pico Home Foundation Dashboard</title></head><body><script type="module" src="./dist/main.js"></script></body></html>',
  );
  writeFileSync(join(dir, 'dist', 'main.js'), 'console.log("pico dashboard");');
  return dir;
}

afterEach(() => {
  vi.useRealTimers();

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * The version this package declares, not a fourth copy of it.
 *
 * `SERVICE_VERSION` is a literal in `app.ts`, `check-version.mjs` binds it to
 * `package.json`, and these payload assertions used to pin the number a third
 * time - so a release bump passed every version gate and turned the suite red
 * afterwards. It did, on 2026-08-19. Reading the declared version keeps this
 * an end-to-end assertion that the served payload is right, without adding a
 * copy that can drift.
 */
const packagedVersion: string = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
).version;

describe('ADR 0110 R6 recovery anchor re-seed marker', () => {
  it('blocks until an operator places the marker, then restores service without reviving anything', async () => {
    const databasePath = createDatabasePath();
    const anchorPath = join(dirname(databasePath), 'recovery-anchor', 'anchor.json');

    // A real founded Home: the anchor cross-check only runs for one, and a
    // fabricated claim state would prove nothing about the startup path.
    const founding = await buildAppWithCapturedLog({ databasePath });
    await claimPicoHomeThroughSealedFlow(founding, readMoveInCode(founding));
    await founding.close();
    // The anchor is seeded by the first boot that finds a claimed Home; the
    // boot that founded it started out unclaimed.
    const seeding = await buildAppWithCapturedLog({ databasePath });
    await seeding.close();
    expect(existsSync(anchorPath)).toBe(true);

    // What a Supervisor restore leaves behind: rows with recovery history,
    // no anchor - because the anchor is deliberately backup-excluded.
    rmSync(dirname(anchorPath), { recursive: true, force: true });
    const database = new Database(databasePath);
    const identityFingerprintHex = (database
      .prepare('SELECT host_admin_pico_id AS id FROM pico_home_claim_state')
      .get() as { id: string }).id.replace('pico:identity:', '');
    database.prepare(`
      INSERT INTO pico_home_device_recovery (
        recovery_id, home_id, pico_identity_fingerprint_hex, status,
        target_delegation_id, target_device_signing_key_fingerprint_hex,
        target_device_key_agreement_key_fingerprint_hex, observed_lifecycle_order,
        evidence_digest_hex, claim_digest_hex, submission_json,
        accepted_at, effective_at, completion_expires_at, resolved_at
      ) VALUES (
        'recovery_reseed_marker', 'home_reseed', ?, 'vetoed',
        'delegation_reseed', ?, ?, 'seq:0000000000000001',
        ?, ?, '{}',
        '2026-07-31T10:00:00.000Z', '2026-08-02T10:00:00.000Z',
        '2099-08-09T10:00:00.000Z', '2026-07-31T12:00:00.000Z'
      )
    `).run(
      identityFingerprintHex,
      '22'.repeat(32),
      '33'.repeat(32),
      '44'.repeat(32),
      '55'.repeat(32),
    );
    database.close();

    const blocked = await buildAppWithCapturedLog({ databasePath });
    const blockedLog = readCapturedLog(blocked);
    expect(blockedLog).toContain('stays closed until it is re-seeded explicitly');
    // Fail-closed is only usable if it says how to get out again.
    expect(blockedLog).toContain(recoveryAnchorReseedMarkerPath(databasePath));
    expect(existsSync(anchorPath)).toBe(false);
    await blocked.close();

    writeFileSync(recoveryAnchorReseedMarkerPath(databasePath), '');
    const reseeded = await buildAppWithCapturedLog({ databasePath });
    const reseededLog = readCapturedLog(reseeded);
    expect(reseededLog).toContain('was re-seeded from the local reset marker');
    expect(reseededLog).toContain('must be initiated again');
    // Consumed once: a restart must not silently re-seed a second time.
    expect(existsSync(recoveryAnchorReseedMarkerPath(databasePath))).toBe(false);

    // Terminal knowledge carried over, so the vetoed recovery stays refused:
    // the re-seed restored service, not the recovery.
    const anchorDocument = JSON.parse(readFileSync(anchorPath, 'utf8')) as {
      entries: { recoveryId: string; state: string }[];
    };
    expect(anchorDocument.entries).toEqual([
      expect.objectContaining({ recoveryId: 'recovery_reseed_marker', state: 'vetoed' }),
    ]);
    await reseeded.close();
  });
});

describe('Pico Home Core app', () => {
  it('serves the dashboard shell from the default web root', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
    });

    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Pico Home Foundation Dashboard');

    await app.close();
  });

  /**
   * Die groesste Flaeche des Produkts begrenzt das Empfangen einer Anfrage
   * (Befund B78).
   *
   * Dieselbe Frage ist in diesem Baum zweimal entschieden - der Link-Eingang
   * und das Relay setzen genau diese drei Werte, mit derselben Begruendung.
   * Die einundsechzig Routen der Foundation hatten sie nicht, und der Grund
   * ist eine Vorgabe: Node begrenzt das Empfangen von sich aus auf fuenf
   * Minuten, Fastify setzt `requestTimeout` auf 0. Wer den Rahmen nimmt,
   * verliert den Schutz der Laufzeit, ohne dass etwas fehlt.
   *
   * **Was dieser Test ist und was nicht.** Er liest die Werte am *laufenden*
   * Server, nicht im Quelltext - er faellt also, wenn die Option verschwindet
   * oder Fastify sie nicht mehr durchreicht. Er schickt keine halbe Anfrage:
   * ein echter Gang muesste zehn Sekunden warten, in jedem CI-Lauf, und was
   * er zusaetzlich bewiese, ist Nodes Vertrag und nicht unserer. Das steht
   * hier, damit niemand mehr hineinliest, als dasteht.
   */
  it('bounds how long it will spend receiving a request', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
    });

    expect(app.server.requestTimeout).toBe(10_000);
    expect(app.server.headersTimeout).toBe(5_000);
    expect(app.server.keepAliveTimeout).toBe(5_000);

    // Der andere Wert bleibt aus: `connectionTimeout` misst Stille auf dem
    // Socket, und Stille ist genau das, was ein Behandler erzeugt, waehrend er
    // arbeitet.
    expect(app.server.timeout).toBe(0);

    await app.close();
  });

  /**
   * Die Vorgabe hebt nichts auf, was eine Route selbst gesagt hat
   * (Befund B94).
   *
   * Die bedingungslose Fassung liess alle 1.107 Tests gruen - die
   * Schutzbedingung war also da und unbewiesen. Hier bekommt sie einen
   * Gegenstand: eine Route, die einen eigenen Wert setzt, behaelt ihn, und
   * eine daneben ohne Meinung bekommt `no-store`.
   */
  it('leaves a cache-control a route chose alone', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
    });
    app.get('/test-cacheable', async (_request, reply) => await reply.header('cache-control', 'max-age=60').send({ ok: true }));
    app.get('/test-silent', async (_request, reply) => await reply.send({ ok: true }));

    expect((await app.inject({ method: 'GET', url: '/test-cacheable' }))
      .headers['cache-control']).toBe('max-age=60');
    expect((await app.inject({ method: 'GET', url: '/test-silent' }))
      .headers['cache-control']).toBe('no-store');
    await app.close();
  });

  it('sends baseline security headers on every response and serves the stylesheet', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
    });

    const dashboard = await app.inject({ method: 'GET', url: '/' });
    expect(dashboard.statusCode).toBe(200);
    // The strict CSP is only honest because the dashboard carries no inline
    // style or script; its styles are a real asset.
    expect(dashboard.body).not.toContain('<style>');
    expect(dashboard.body).toContain('href="./styles.css"');

    /**
     * `no-store` als Vorgabe, und die sechzehn Antworten, die ihn nie selbst
     * setzten (Befund B94).
     *
     * Dass keine Erinnerung in einem Zwischenspeicher landet, hing an 126
     * Aufrufen von `sendNoStore` - also an Aufmerksamkeit an jeder einzelnen
     * Stelle. Sechzehn Antworten setzten ihn nicht; alle sechzehn waren Fehler
     * oder ein 204, also kein Leck, aber die siebzehnte waere die mit Daten
     * gewesen.
     */
    expect(dashboard.headers['cache-control']).toBe('no-store');
    const notClassified = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(notClassified.headers['cache-control']).toBe('no-store');

    const styles = await app.inject({ method: 'GET', url: '/styles.css' });
    expect(styles.statusCode).toBe(200);
    expect(styles.headers['content-type']).toContain('text/css');
    expect(styles.body).toContain('pico-design-tokens:start');

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);

    const missing = await app.inject({ method: 'GET', url: '/no-such-route' });
    expect(missing.statusCode).toBe(404);

    for (const response of [dashboard, styles, health, missing]) {
      expect(response.headers['content-security-policy'])
        .toBe("default-src 'self'; frame-ancestors 'self'");
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    }

    await app.close();
  });

  it('serves the foundation dashboard shell and built assets', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      webRootPath: createWebRootPath(),
    });

    const index = await app.inject({ method: 'GET', url: '/' });
    expect(index.statusCode).toBe(200);
    expect(index.headers['content-type']).toContain('text/html');
    expect(index.body).toContain('Pico Home Foundation Dashboard');

    const script = await app.inject({ method: 'GET', url: '/dist/main.js' });
    expect(script.statusCode).toBe(200);
    expect(script.headers['content-type']).toContain('application/javascript');
    expect(script.headers['x-content-type-options']).toBe('nosniff');
    expect(script.body).toContain('pico dashboard');

    await app.close();
  });

  it('returns 404 for missing dashboard assets and directories', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      webRootPath: createWebRootPath(),
    });

    const missingAsset = await app.inject({ method: 'GET', url: '/dist/missing.js' });
    expect(missingAsset.statusCode).toBe(404);
    expect(missingAsset.json()).toEqual({ error: 'Not found.' });

    const directory = await app.inject({ method: 'GET', url: '/dist/.' });
    expect(directory.statusCode).toBe(404);
    expect(directory.json()).toEqual({ error: 'Not found.' });

    const traversal = await app.inject({ method: 'GET', url: '/dist/%2e%2e%2findex.html' });
    expect(traversal.statusCode).toBe(404);
    expect(traversal.body).not.toContain('Pico Home Foundation Dashboard');

    await app.close();
  });

  it('returns health information', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
    });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      service: 'pico-home-core',
      deviceId: 'test-core',
    });

    await app.close();
  });

  it('returns system version information', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
    });

    const response = await app.inject({ method: 'GET', url: '/api/system/version' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({
      service: 'pico-home-core',
      version: packagedVersion,
      protocolVersion: '0.1.7',
    });

    await app.close();
  });

  it('returns system status information', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
    });

    const response = await app.inject({ method: 'GET', url: '/api/system/status' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({
      service: 'pico-home-core',
      version: packagedVersion,
      protocolVersion: '0.1.7',
      deviceId: 'test-core',
      capabilities: protocolCapabilities,
      picoHome: {
        claimState: {
          state: 'unclaimed',
          setupMode: {
            active: true,
            moveInCodePending: true,
          },
        },
      },
      database: {
        maxLamport: 0,
        migrations: [
          { id: picoSchemaBaselineMigrationId, appliedAt: expect.any(String) },
          { id: picoModuleEffectConsentMigrationId, appliedAt: expect.any(String) },
          { id: picoRuleDecisionMigrationId, appliedAt: expect.any(String) },
          { id: picoSupplierAttachmentMigrationId, appliedAt: expect.any(String) },
          { id: picoSupplierCredentialScopeMigrationId, appliedAt: expect.any(String) },
          { id: picoLibraryDerivationMigrationId, appliedAt: expect.any(String) },
          { id: picoDepotAttachmentMigrationId, appliedAt: expect.any(String) },
          { id: picoDepotReachMigrationId, appliedAt: expect.any(String) },
          { id: picoDepotFetchOutcomeMigrationId, appliedAt: expect.any(String) },
          { id: picoLinkMailboxMigrationId, appliedAt: expect.any(String) },
          { id: picoLinkPushLedgerMigrationId, appliedAt: expect.any(String) },
          { id: picoModelProviderEntryMigrationId, appliedAt: expect.any(String) },
          { id: picoModelProviderConsentMigrationId, appliedAt: expect.any(String) },
          { id: picoModelJobQueueMigrationId, appliedAt: expect.any(String) },
          { id: picoDepotAcceptedByMigrationId, appliedAt: expect.any(String) },
          { id: picoModelJobProvenanceMigrationId, appliedAt: expect.any(String) },
          { id: picoMemoryEncryptionDecisionMigrationId, appliedAt: expect.any(String) },
          { id: picoLinkRelayIdentityMigrationId, appliedAt: expect.any(String) },
          { id: picoModelProviderCredentialMigrationId, appliedAt: expect.any(String) },
          { id: picoModelJobKindMigrationId, appliedAt: expect.any(String) },
          { id: picoModelJobRecallContextMigrationId, appliedAt: expect.any(String) },
          { id: picoPresenceRegistryMigrationId, appliedAt: expect.any(String) },
          { id: picoPresenceSwitchMigrationId, appliedAt: expect.any(String) },
          { id: picoModelJobKeptMemoryMigrationId, appliedAt: expect.any(String) },
          { id: picoModelJobForgottenMigrationId, appliedAt: expect.any(String) },
          { id: picoLinkDirectSeenRequestMigrationId, appliedAt: expect.any(String) },
        ],
      },
      // ADR 0119 Q5. A development host has no free-space source and
      // an empty store, so nothing applies and the reasons list is empty -
      // not absent. An absent condition would read as "unknown".
      storage: { state: 'normal', reasons: [] },
      // ADR 0127 M3. A capability missing on purpose must not present as one
      // that is broken, so every shipped module is named with its state - all
      // on, because a Home that has decided nothing has not switched anything
      // off.
      // ADR 0129 SR6. Capture is a second decision and starts off: a Home
      // that began writing down its person's movements because they
      // installed it would not be broken, it would be wrong.
      modules: {
        modules: [
          {
            identifier: 'calendar',
            kind: 'product',
            active: true,
            capturing: false,
            // ADR 0139 AC6: reaching a person is an effect, so the calendar is
            // the first module here that can cause anything.
            effectBearing: true,
            dependencies: [],
          },
          {
            identifier: 'depot',
            kind: 'product',
            // ADR 0138 CO3's first decision: the feature exists, default on.
            // The second and third - may Pico fetch, and may it fetch unasked -
            // live on the depot attachment and are off, so an active module
            // still reaches nothing.
            active: true,
            capturing: false,
            effectBearing: true,
            dependencies: [],
          },
          {
            identifier: 'home-assistant',
            kind: 'connector',
            active: true,
            capturing: false,
            effectBearing: false,
            dependencies: [],
          },
          {
            identifier: 'spatial-recall',
            kind: 'product',
            active: true,
            capturing: false,
            effectBearing: false,
            dependencies: [],
          },
        ],
      },
    });

    await app.close();
  });

  it('surfaces a setup bundle without exposing the Move-In Code over HTTP', async () => {
    const app = await buildAppWithCapturedLog();
    const moveInCode = readMoveInCode(app);

    const response = await app.inject({ method: 'GET', url: '/api/home/setup' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.json();
    expect(body).toEqual({
      setupMode: {
        active: true,
        moveInCodePending: true,
        claimEndpoint: '/api/home/claim',
        hostSetupNonceHex: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      host: {
        suite: 'pico.suite.id.v1',
        signingPublicKeyHex: expect.stringMatching(/^[0-9a-f]{64}$/),
        signingKeyFingerprintHex: expect.stringMatching(/^[0-9a-f]{64}$/),
        keyAgreementPublicKeyHex: expect.stringMatching(/^[0-9a-f]{64}$/),
        keyAgreementKeyFingerprintHex: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
    expect(JSON.stringify(body)).not.toContain(moveInCode);

    await app.close();
  });

  it('claims an empty Pico Home through the Move-In Code and audits the transition', async () => {
    const app = await buildAppWithCapturedLog();
    const setupBody = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as PicoHomeSetupResponse;

    // A claim is only ever a sealed, signed envelope: there is no shape that
    // claims a Home under an unauthenticated identity string.
    const unsealed = await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { moveInCode: readMoveInCode(app), homeHostPicoId: 'pico:home-host' },
    });
    expect(unsealed.statusCode).toBe(400);
    expect(unsealed.json()).toEqual({ error: 'Pico Home claim requires a sealed claimEnvelope.' });

    const wrongCode = createSealedPicoHomeClaim(setupBody, 'MOVEIN-00000000-WRONG');
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { claimEnvelope: wrongCode.claimEnvelope },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ error: 'Move-In Code is invalid.' });

    const { sealedClaim, claimResponse } = await claimPicoHomeThroughSealedFlow(app, readMoveInCode(app));
    expect(claimResponse.claimState).toEqual({
      state: 'claimed',
      setupMode: {
        active: false,
        moveInCodePending: false,
      },
      homeId: expect.stringMatching(/^home_[0-9a-f]{32}$/),
      homeHostPicoId: sealedClaim.expectedHomeHostPicoId,
      hostSigningKeyFingerprintHex: setupBody.host.signingKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: setupBody.host.keyAgreementKeyFingerprintHex,
      claimedAt: expect.any(String),
    });

    const setupAfterClaim = await app.inject({ method: 'GET', url: '/api/home/setup' });
    expect(setupAfterClaim.statusCode).toBe(404);

    const status = await app.inject({ method: 'GET', url: '/api/system/status' });
    expect(status.json().picoHome.claimState.state).toBe('claimed');
    expect(status.json().picoHome.claimState.homeHostPicoId).toBe(sealedClaim.expectedHomeHostPicoId);

    const events = await app.inject({ method: 'GET', url: '/api/events' });
    const homeClaimed = (events.json().events as { type: string; payload: unknown }[])
      .filter((event) => event.type === 'home.claimed');
    expect(homeClaimed).toHaveLength(1);
    expect(homeClaimed[0].payload).toEqual({});

    await app.close();
  });

  it('claims an empty Pico Home through a sealed signed claim envelope', async () => {
    const databasePath = createDatabasePath();
    const app = await buildAppWithCapturedLog({ databasePath });
    const setup = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as PicoHomeSetupResponse;
    const sealedClaim = createSealedPicoHomeClaim(setup, readMoveInCode(app));

    const pendingResponse = await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { claimEnvelope: sealedClaim.claimEnvelope },
    });

    expect(pendingResponse.statusCode).toBe(202);
    expect(pendingResponse.headers['cache-control']).toBe('no-store');
    const pending = pendingResponse.json() as PicoHomePendingClaimResponse;
    expect(pending.pendingClaim.claimResponse.schema).toBe('pico.home.claim-response-record.v1');
    expect(pending.pendingClaim.claimResponse.claimResponse).toEqual({
      suite: picoIdentitySuite,
      claimId: sealedClaim.claim.claimId,
      homeId: expect.stringMatching(/^home_[0-9a-f]{32}$/),
      hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: setup.host.keyAgreementKeyFingerprintHex,
      claimantIdentityKeyFingerprintHex: sealedClaim.claim.claimantIdentityKeyFingerprintHex,
      claimantNonceHex: sealedClaim.claim.claimantNonceHex,
      hostNonceHex: expect.stringMatching(/^[0-9a-f]{64}$/),
      foundingRecordId: expect.stringMatching(/^founding_[0-9a-f]{32}$/),
    });
    expect(sodium.crypto_sign_verify_detached(
      hexToBytes(pending.pendingClaim.claimResponse.hostSignatureHex),
      buildPicoHomeClaimResponseSignatureInput(pending.pendingClaim.claimResponse.claimResponse),
      hexToBytes(setup.host.signingPublicKeyHex),
    )).toBe(true);
    expect(pending.pendingClaim.founding).toEqual({
      suite: picoIdentitySuite,
      foundingId: pending.pendingClaim.claimResponse.claimResponse.foundingRecordId,
      homeId: pending.pendingClaim.claimResponse.claimResponse.homeId,
      hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: setup.host.keyAgreementKeyFingerprintHex,
      homeHostPicoIdentityFingerprintHex: sealedClaim.claim.claimantIdentityKeyFingerprintHex,
      claimantNonceHex: sealedClaim.claim.claimantNonceHex,
      hostNonceHex: pending.pendingClaim.claimResponse.claimResponse.hostNonceHex,
      foundedAt: expect.any(String),
      lifecycleOrder: 'seq:0000000000000001',
      firstDeviceDelegationId: sealedClaim.claim.firstDeviceDelegationId,
      firstDeviceSigningKeyFingerprintHex:
        sealedClaim.claim.firstDeviceSigningKeyFingerprintHex,
      firstDeviceKeyAgreementKeyFingerprintHex:
        sealedClaim.claim.firstDeviceKeyAgreementKeyFingerprintHex,
    });

    const foundingAcceptance = createPicoHomeFoundingAcceptance(sealedClaim, pending.pendingClaim.founding);
    const claimed = await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { foundingAcceptance },
    });

    expect(claimed.statusCode).toBe(201);
    const finalBody = claimed.json() as PicoHomeClaimResponse;
    expect(finalBody).toEqual({
      claimState: {
        state: 'claimed',
        setupMode: {
          active: false,
          moveInCodePending: false,
        },
        homeId: pending.pendingClaim.founding.homeId,
        homeHostPicoId: sealedClaim.expectedHomeHostPicoId,
        hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
        hostKeyAgreementKeyFingerprintHex: setup.host.keyAgreementKeyFingerprintHex,
        claimedAt: expect.any(String),
      },
      claimResponse: pending.pendingClaim.claimResponse,
      foundingRecord: {
        schema: picoHomeFoundingRecordSchema,
        founding: pending.pendingClaim.founding,
        claimantIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
        firstDeviceSigningKeyRecord: sealedClaim.firstDeviceSigningKeyRecord,
        firstDeviceKeyAgreementKeyRecord: sealedClaim.firstDeviceKeyAgreementKeyRecord,
        firstDeviceDelegation: sealedClaim.firstDeviceDelegation,
        firstDeviceRevocations: [],
        claimantFoundingSignatureHex: foundingAcceptance.claimantFoundingSignatureHex,
        hostClaimResponse: pending.pendingClaim.claimResponse,
        hostFoundingSignatureHex: expect.stringMatching(/^[0-9a-f]{128}$/),
        createdAt: pending.pendingClaim.founding.foundedAt,
      },
    });
    expect(JSON.stringify(claimed.json())).not.toContain(sealedClaim.moveInCode);
    expect(sodium.crypto_sign_verify_detached(
      hexToBytes(finalBody.foundingRecord?.hostFoundingSignatureHex ?? ''),
      buildPicoHomeFoundingSignatureInput(pending.pendingClaim.founding),
      hexToBytes(setup.host.signingPublicKeyHex),
    )).toBe(true);

    await app.close();
    const store = new EventStore(databasePath);
    expect(store.picoHomeFoundingRecord()).toEqual(finalBody.foundingRecord);
    expect(store.picoHomeMemberships()).toEqual([
      {
        membershipId: `founding:${pending.pendingClaim.founding.foundingId}:home_host`,
        homeId: pending.pendingClaim.founding.homeId,
        picoIdentityFingerprintHex: sealedClaim.claim.claimantIdentityKeyFingerprintHex,
        role: 'home_host',
        status: 'active',
        scopes: [...picoHomeMembershipScopes],
        source: 'founding_record',
        sourceRef: pending.pendingClaim.founding.foundingId,
        validFrom: pending.pendingClaim.founding.foundedAt,
        validUntil: null,
        createdAt: pending.pendingClaim.founding.foundedAt,
        updatedAt: pending.pendingClaim.founding.foundedAt,
      },
    ]);
    store.close();
  });

  it('binds the operator at claim and revokes every pre-claim session', async () => {
    const databasePath = createDatabasePath();
    const app = await buildAppWithCapturedLog({ databasePath });
    const bootstrapped = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode: readBootstrapCode(app), passphrase: OPERATOR_PASSPHRASE },
    });
    const preClaimSession = bootstrapped.json().session as string;

    const { claimResponse } = await claimPicoHomeThroughSealedFlow(app, readMoveInCode(app));

    expect((await probeSession(app, preClaimSession)).statusCode).toBe(401);
    const postClaimSession = await login(app);
    expect((await app.inject({
      method: 'GET',
      url: '/api/home/memberships',
      headers: { authorization: `Bearer ${postClaimSession}` },
    })).statusCode).toBe(200);

    await app.close();
    const db = new Database(databasePath);
    const binding = JSON.parse((db
      .prepare('SELECT home_binding_json AS homeBindingJson FROM foundation_operator')
      .get() as { homeBindingJson: string }).homeBindingJson) as Record<string, string>;
    const founding = claimResponse.foundingRecord?.founding;
    expect(binding).toEqual({
      homeId: founding?.homeId,
      foundingId: founding?.foundingId,
      hostSigningKeyFingerprintHex: founding?.hostSigningKeyFingerprintHex,
    });
    db.close();
  });

  it('fails closed when a restored operator credential is bound to another founding', async () => {
    const databasePath = createDatabasePath();
    const first = await buildAppWithCapturedLog({ databasePath });
    await claimPicoHomeThroughSealedFlow(first, readMoveInCode(first));
    await bootstrap(first);
    await first.close();

    const stale = new Database(databasePath);
    const binding = JSON.parse((stale
      .prepare('SELECT home_binding_json AS homeBindingJson FROM foundation_operator')
      .get() as { homeBindingJson: string }).homeBindingJson) as Record<string, string>;
    stale
      .prepare('UPDATE foundation_operator SET home_binding_json = ?')
      .run(JSON.stringify({ ...binding, foundingId: 'founding_from_another_restore' }));
    stale.close();

    const restarted = await buildAppWithCapturedLog({ databasePath });
    expect(logLines(restarted).some((line) => line.includes('operator binding does not match'))).toBe(true);
    expect((await restarted.inject({
      method: 'POST',
      url: '/api/auth/session',
      payload: { passphrase: OPERATOR_PASSPHRASE },
    })).statusCode).toBe(401);
    expect((await restarted.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode: 'not-surfaced', passphrase: 'replacement operator passphrase' },
    })).statusCode).toBe(404);
    await restarted.close();

    writeFileSync(operatorResetMarkerPath(databasePath), '');
    const recovered = await buildAppWithCapturedLog({ databasePath });
    const rebootstrapped = await recovered.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        bootstrapCode: readBootstrapCode(recovered),
        passphrase: 'replacement operator passphrase',
      },
    });
    expect(rebootstrapped.statusCode).toBe(201);
    expect((await recovered.inject({
      method: 'GET',
      url: '/api/home/memberships',
      headers: { authorization: `Bearer ${rebootstrapped.json().session as string}` },
    })).statusCode).toBe(200);

    await recovered.close();
  });

  it('expires an abandoned pending claim and reopens setup mode with a fresh Move-In Code', async () => {
    const app = await buildAppWithCapturedLog({ databasePath: createDatabasePath() });
    const setup = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as PicoHomeSetupResponse;
    const abandonedCode = readMoveInCode(app);
    const abandonedClaim = createSealedPicoHomeClaim(setup, abandonedCode);

    const pendingResponse = await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { claimEnvelope: abandonedClaim.claimEnvelope },
    });
    expect(pendingResponse.statusCode).toBe(202);
    const pending = pendingResponse.json() as PicoHomePendingClaimResponse;

    // The claimant walks away after the Move-In Code was consumed. Only the
    // clock is faked: the request path must stay real.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + (10 * 60 * 1000) + 1_000);

      const reopened = await app.inject({ method: 'GET', url: '/api/home/setup' });
      expect(reopened.statusCode).toBe(200);
      const freshSetup = reopened.json() as PicoHomeSetupResponse;
      const freshCode = readMoveInCode(app);
      expect(freshCode).not.toBe(abandonedCode);
      expect(freshSetup.setupMode.hostSetupNonceHex).not.toBe(setup.setupMode.hostSetupNonceHex);

      const staleAcceptance = await app.inject({
        method: 'POST',
        url: '/api/home/claim',
        payload: { foundingAcceptance: createPicoHomeFoundingAcceptance(abandonedClaim, pending.pendingClaim.founding) },
      });
      expect(staleAcceptance.statusCode).toBe(409);

      const freshClaim = createSealedPicoHomeClaim(freshSetup, freshCode);
      const accepted = await app.inject({
        method: 'POST',
        url: '/api/home/claim',
        payload: { claimEnvelope: freshClaim.claimEnvelope },
      });
      expect(accepted.statusCode).toBe(202);
    } finally {
      vi.useRealTimers();
    }

    await app.close();
  });

  it('discards a pending claim after too many rejected founding acceptances', async () => {
    const app = await buildAppWithCapturedLog({ databasePath: createDatabasePath() });
    const setup = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as PicoHomeSetupResponse;
    const consumedCode = readMoveInCode(app);
    const sealedClaim = createSealedPicoHomeClaim(setup, consumedCode);

    const pendingResponse = await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { claimEnvelope: sealedClaim.claimEnvelope },
    });
    expect(pendingResponse.statusCode).toBe(202);
    const pending = pendingResponse.json() as PicoHomePendingClaimResponse;

    const forgedAcceptance = {
      ...createPicoHomeFoundingAcceptance(sealedClaim, pending.pendingClaim.founding),
      claimantFoundingSignatureHex: 'a'.repeat(128),
    };

    for (let attempt = 1; attempt < 10; attempt += 1) {
      const rejected = await app.inject({
        method: 'POST',
        url: '/api/home/claim',
        payload: { foundingAcceptance: forgedAcceptance },
      });
      expect(rejected.statusCode).toBe(401);
    }

    const exhausted = await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { foundingAcceptance: forgedAcceptance },
    });
    expect(exhausted.statusCode).toBe(429);
    expect(readMoveInCode(app)).not.toBe(consumedCode);

    // The real claimant cannot finish the discarded ceremony either; the whole
    // claim has to start over with the fresh Move-In Code.
    const valid = await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { foundingAcceptance: createPicoHomeFoundingAcceptance(sealedClaim, pending.pendingClaim.founding) },
    });
    expect(valid.statusCode).toBe(409);

    await app.close();
  });

  it('does not reopen setup mode when a stale restore resurrects an unclaimed claim state', async () => {
    const databasePath = createDatabasePath();
    const first = await buildAppWithCapturedLog({ databasePath });
    const { claimResponse } = await claimPicoHomeThroughSealedFlow(first, readMoveInCode(first));
    await first.close();

    const stale = new Database(databasePath);
    stale.prepare(`
      UPDATE pico_home_claim_state
      SET state = 'unclaimed',
          host_admin_pico_id = NULL,
          home_id = NULL,
          host_signing_key_fingerprint_hex = NULL,
          host_key_agreement_key_fingerprint_hex = NULL,
          claimed_at = NULL
      WHERE id = 1
    `).run();
    stale.prepare('DELETE FROM pico_identity_reader_key').run();
    stale.prepare('DELETE FROM pico_identity_delegation').run();
    stale.close();

    const restarted = await buildAppWithCapturedLog({ databasePath });

    expect(hasMoveInCode(restarted)).toBe(false);
    expect((await restarted.inject({ method: 'GET', url: '/api/home/setup' })).statusCode).toBe(404);
    expect((await restarted.inject({ method: 'POST', url: '/api/home/claim', payload: { claimEnvelope: { schema: picoHomeClaimEnvelopeSchema, sealedClaimPayloadHex: 'ff'.repeat(64) } } })).statusCode).toBe(404);
    const status = await restarted.inject({ method: 'GET', url: '/api/system/status' });
    expect(status.json().picoHome.claimState).toEqual(claimResponse.claimState);

    await restarted.close();
    const reconciled = new Database(databasePath, { readonly: true });
    expect(reconciled.prepare('SELECT COUNT(*) AS count FROM pico_identity_delegation').get())
      .toEqual({ count: 1 });
    expect(reconciled.prepare('SELECT COUNT(*) AS count FROM pico_identity_reader_key').get())
      .toEqual({ count: 1 });
    reconciled.close();
  });

  it('keeps setup mode closed when restored founding evidence has no matching host key custody', async () => {
    const databasePath = createDatabasePath();
    const first = await buildAppWithCapturedLog({ databasePath, foundationToken: 'dev-token' });
    const { claimResponse } = await claimPicoHomeThroughSealedFlow(first, readMoveInCode(first));
    await bootstrap(first);
    await first.close();

    rmSync(join(dirname(databasePath), 'home-host-keys'), { recursive: true, force: true });
    const stale = new Database(databasePath);
    stale.prepare(`
      UPDATE pico_home_claim_state
      SET state = 'unclaimed',
          host_admin_pico_id = NULL,
          home_id = NULL,
          host_signing_key_fingerprint_hex = NULL,
          host_key_agreement_key_fingerprint_hex = NULL,
          claimed_at = NULL
      WHERE id = 1
    `).run();
    stale.close();

    const restarted = await buildAppWithCapturedLog({ databasePath, foundationToken: 'dev-token' });

    expect(hasMoveInCode(restarted)).toBe(false);
    expect((await restarted.inject({ method: 'GET', url: '/api/home/setup' })).statusCode).toBe(404);
    expect((await restarted.inject({
      method: 'GET',
      url: '/api/system/status',
      headers: { authorization: 'Bearer dev-token' },
    })).json().picoHome.claimState).toEqual(claimResponse.claimState);
    expect((await restarted.inject({
      method: 'POST',
      url: '/api/auth/session',
      payload: { passphrase: OPERATOR_PASSPHRASE },
    })).statusCode).toBe(401);
    expect((await restarted.inject({
      method: 'POST',
      url: '/api/auth/identity-challenges',
    })).statusCode).toBe(404);
    expect(logLines(restarted).some((line) => line.includes('host key custody is missing'))).toBe(true);

    await restarted.close();
  });

  it('rejects tampered sealed claim signatures without consuming the Move-In Code', async () => {
    const app = await buildAppWithCapturedLog();
    const setup = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as PicoHomeSetupResponse;
    const moveInCode = readMoveInCode(app);
    const tampered = createSealedPicoHomeClaim(setup, moveInCode, {
      claimantSignatureHex: '00'.repeat(64),
    });

    const rejected = await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { claimEnvelope: tampered.claimEnvelope },
    });
    expect(rejected.statusCode).toBe(401);
    expect(rejected.json()).toEqual({ error: 'Pico Home claim signature is invalid.' });

    const valid = createSealedPicoHomeClaim(setup, moveInCode);
    const pending = await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { claimEnvelope: valid.claimEnvelope },
    });
    expect(pending.statusCode).toBe(202);
    const acceptance = createPicoHomeFoundingAcceptance(valid, (pending.json() as PicoHomePendingClaimResponse).pendingClaim.founding);
    const claimed = await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { foundingAcceptance: acceptance },
    });
    expect(claimed.statusCode).toBe(201);
    expect(claimed.json().claimState.homeHostPicoId).toBe(valid.expectedHomeHostPicoId);

    await app.close();
  });

  it.each([
    {
      caseName: 'a missing first-device co-signature',
      overrides: { omitFirstDeviceSignature: true },
      statusCode: 400,
      error: 'Pico Home claim payload is invalid.',
    },
    {
      caseName: 'an invalid first-device co-signature',
      overrides: { firstDeviceSignatureHex: '00'.repeat(64) },
      statusCode: 401,
      error: 'Pico Home first-device co-signature is invalid.',
    },
    {
      caseName: 'a delegation subject that differs from the carried signing key',
      overrides: { delegationSubjectSigningKeyFingerprintHex: 'aa'.repeat(32) },
      statusCode: 400,
      error: 'Pico Home first-device delegation does not match the signed claim.',
    },
    {
      caseName: 'a delegation without surface_session',
      overrides: { delegationScopes: ['sign_history'] as PicoIdentityDelegationScope[] },
      statusCode: 400,
      error: 'Pico Home first-device delegation is not active for surface_session at founding.',
    },
    {
      caseName: 'a delegation expired at founding',
      overrides: { delegationValidUntil: '2026-02-01T00:00:00.000Z' },
      statusCode: 400,
      error: 'Pico Home first-device delegation is not active for surface_session at founding.',
    },
    {
      caseName: 'a signed fingerprint that differs from the carried key record',
      overrides: { claimFirstDeviceSigningKeyFingerprintHex: 'bb'.repeat(32) },
      statusCode: 400,
      error: 'Pico Home first-device signing fingerprint does not match the key record.',
    },
    {
      caseName: 'a legacy v1 claim payload',
      overrides: { legacyV1: true },
      statusCode: 400,
      error: 'Pico Home v1 claim payload is no longer accepted.',
    },
  ])('refuses $caseName before consuming the Move-In Code', async ({
    overrides,
    statusCode,
    error,
  }) => {
    const app = await buildAppWithCapturedLog();
    const setup = (await app.inject({
      method: 'GET',
      url: '/api/home/setup',
    })).json() as PicoHomeSetupResponse;
    const moveInCode = readMoveInCode(app);
    const invalid = createSealedPicoHomeClaim(setup, moveInCode, overrides);
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { claimEnvelope: invalid.claimEnvelope },
    });

    expect(rejected.statusCode).toBe(statusCode);
    expect(rejected.json()).toEqual({ error });

    const valid = createSealedPicoHomeClaim(setup, moveInCode);
    expect((await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { claimEnvelope: valid.claimEnvelope },
    })).statusCode).toBe(202);
    await app.close();
  });

  it('binds a Link-carried claim to the exact authenticated first-device sender', async () => {
    const app = await buildAppWithCapturedLog();
    const setup = (await app.inject({
      method: 'GET',
      url: '/api/home/setup',
    })).json() as PicoHomeSetupResponse;
    const sealedClaim = createSealedPicoHomeClaim(setup, readMoveInCode(app));

    const submit = async (delegationId: string) => {
      const replyKey = sodium.crypto_box_keypair();
      const createdAtMs = Date.now();
      const args = { claimEnvelope: sealedClaim.claimEnvelope };
      const request = {
        suite: picoIdentitySuite,
        requestId: `linkreq_${randomHex(16)}`,
        operation: 'home.claim.submit' as const,
        hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
        senderIdentityKeyFingerprintHex:
          sealedClaim.claim.claimantIdentityKeyFingerprintHex,
        senderDeviceSigningKeyFingerprintHex:
          sealedClaim.claim.firstDeviceSigningKeyFingerprintHex,
        senderDeviceKeyAgreementKeyFingerprintHex:
          sealedClaim.claim.firstDeviceKeyAgreementKeyFingerprintHex,
        senderDelegationId: delegationId,
        replyPublicKeyHex: bytesToHex(replyKey.publicKey),
        argumentsDigestHex: picoLinkDirectPayloadDigestHex(sodium, args),
        createdAt: new Date(createdAtMs).toISOString(),
        expiresAt: new Date(createdAtMs + 30_000).toISOString(),
      };
      const linked = await app.inject({
        method: 'POST',
        url: '/api/home/link',
        payload: {
          schema: picoLinkDirectRequestEnvelopeSchema,
          sealedRequestHex: bytesToHex(sodium.crypto_box_seal(
            Buffer.from(JSON.stringify({
              schema: picoLinkDirectRequestEnvelopeSchema,
              request,
              senderIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
              senderDeviceSigningKeyRecord:
                sealedClaim.firstDeviceSigningKeyRecord,
              arguments: args,
              senderSignatureHex: bytesToHex(sodium.crypto_sign_detached(
                buildPicoLinkDirectRequestSignatureInput(request),
                sealedClaim.firstDeviceSigningPrivateKey,
              )),
            }), 'utf8'),
            hexToBytes(setup.host.keyAgreementPublicKeyHex),
          )),
        },
      });
      expect(linked.statusCode).toBe(200);
      return JSON.parse(new TextDecoder().decode(sodium.crypto_box_seal_open(
        hexToBytes(linked.json().sealedResponseHex as string),
        replyKey.publicKey,
        replyKey.privateKey,
      ))) as {
        response: PicoLinkDirectResponseSignatureInput;
        result: Record<string, unknown>;
      };
    };

    const mismatched = await submit('delegation_other_device');
    expect(mismatched.response.outcome).toBe('foundation_rejected');
    expect(mismatched.result).toEqual({
      statusCode: 401,
      error: 'Pico Link sender is not the first device bound to this Home claim.',
    });

    const accepted = await submit(sealedClaim.claim.firstDeviceDelegationId);
    expect(accepted.response.outcome).toBe('ok');
    expect(accepted.result.statusCode).toBe(202);
    await app.close();
  });

  it('rejects tampered founding acceptance without completing the pending claim', async () => {
    const app = await buildAppWithCapturedLog();
    const setup = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as PicoHomeSetupResponse;
    const sealedClaim = createSealedPicoHomeClaim(setup, readMoveInCode(app));

    const pending = await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { claimEnvelope: sealedClaim.claimEnvelope },
    });
    expect(pending.statusCode).toBe(202);
    const founding = (pending.json() as PicoHomePendingClaimResponse).pendingClaim.founding;
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: {
        foundingAcceptance: {
          schema: picoHomeFoundingAcceptanceSchema,
          claimId: sealedClaim.claim.claimId,
          foundingId: founding.foundingId,
          claimantFoundingSignatureHex: '00'.repeat(64),
        },
      },
    });
    expect(rejected.statusCode).toBe(401);
    expect(rejected.json()).toEqual({ error: 'Pico Home founding signature is invalid.' });

    const status = await app.inject({ method: 'GET', url: '/api/system/status' });
    expect(status.json().picoHome.claimState).toEqual({
      state: 'unclaimed',
      setupMode: {
        active: false,
        moveInCodePending: false,
      },
    });

    const acceptance = createPicoHomeFoundingAcceptance(sealedClaim, founding);
    const claimed = await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { foundingAcceptance: acceptance },
    });
    expect(claimed.statusCode).toBe(201);

    await app.close();
  });

  it('rolls back every founding projection when first-device reader registration fails', async () => {
    const databasePath = createDatabasePath();
    const app = await buildAppWithCapturedLog({ databasePath });
    const setup = (await app.inject({
      method: 'GET',
      url: '/api/home/setup',
    })).json() as PicoHomeSetupResponse;
    const sealedClaim = createSealedPicoHomeClaim(setup, readMoveInCode(app));
    const pendingResponse = await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { claimEnvelope: sealedClaim.claimEnvelope },
    });
    expect(pendingResponse.statusCode).toBe(202);
    const pending = pendingResponse.json() as PicoHomePendingClaimResponse;
    const acceptance = createPicoHomeFoundingAcceptance(
      sealedClaim,
      pending.pendingClaim.founding,
    );

    const blocker = new Database(databasePath);
    blocker.exec(`
      CREATE TRIGGER reject_founding_reader_key
      BEFORE INSERT ON pico_identity_reader_key
      BEGIN
        SELECT RAISE(ABORT, 'blocked_reader_key_projection');
      END;
    `);
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { foundingAcceptance: acceptance },
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json()).toEqual({ error: 'blocked_reader_key_projection' });
    expect(blocker.prepare('SELECT state FROM pico_home_claim_state WHERE id = 1').get())
      .toEqual({ state: 'unclaimed' });
    for (const table of [
      'pico_home_founding_record',
      'pico_home_membership',
      'pico_identity_delegation',
      'pico_identity_reader_key',
    ]) {
      expect((blocker.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
        count: number;
      }).count, table).toBe(0);
    }

    blocker.exec('DROP TRIGGER reject_founding_reader_key');
    blocker.close();
    expect((await app.inject({
      method: 'POST',
      url: '/api/home/claim',
      payload: { foundingAcceptance: acceptance },
    })).statusCode).toBe(201);
    await app.close();
  });

  it('resets a claimed Pico Home only through the local home reset marker', async () => {
    const databasePath = createDatabasePath();
    const first = await buildAppWithCapturedLog({ databasePath });
    const firstSetup = (await first.inject({ method: 'GET', url: '/api/home/setup' })).json();

    await claimPicoHomeThroughSealedFlow(first, readMoveInCode(first));
    await bootstrap(first);
    await first.close();

    writeFileSync(homeResetMarkerPath(databasePath), '');
    const restarted = await buildAppWithCapturedLog({ databasePath });
    const restartedSetup = (await restarted.inject({ method: 'GET', url: '/api/home/setup' })).json();
    const localSession = await login(restarted);
    const localAuth = { authorization: `Bearer ${localSession}` };

    expect(restartedSetup.host.signingKeyFingerprintHex).not.toBe(firstSetup.host.signingKeyFingerprintHex);
    const status = await restarted.inject({ method: 'GET', url: '/api/system/status', headers: localAuth });
    expect(status.json().picoHome.claimState).toEqual({
      state: 'unclaimed',
      setupMode: {
        active: true,
        moveInCodePending: true,
      },
    });

    expect((await restarted.inject({
      method: 'GET',
      url: '/api/home/memberships',
      headers: localAuth,
    })).statusCode).toBe(401);

    const events = await restarted.inject({ method: 'GET', url: '/api/events', headers: localAuth });
    const homeReset = (events.json().events as { type: string; payload: unknown }[])
      .filter((event) => event.type === 'home.reset');
    expect(homeReset).toHaveLength(1);
    expect(homeReset[0].payload).toEqual({});

    await restarted.close();
    const third = await buildAppWithCapturedLog({ databasePath });
    const thirdSession = await login(third);
    const thirdEvents = await third.inject({
      method: 'GET',
      url: '/api/events',
      headers: { authorization: `Bearer ${thirdSession}` },
    });
    expect((thirdEvents.json().events as { type: string }[]).filter((event) => event.type === 'home.reset')).toHaveLength(1);

    await third.close();
  });

  it('keeps the dashboard shell and health endpoint open when a foundation token is configured', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });

    const dashboard = await app.inject({ method: 'GET', url: '/' });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.body).toContain('Pico Home Foundation Dashboard');

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({
      ok: true,
      service: 'pico-home-core',
      deviceId: 'test-core',
    });

    await app.close();
  });

  it('requires the configured foundation token for direct Foundation API access', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });

    for (const request of [
      { method: 'GET', url: '/api/system/version' },
      { method: 'GET', url: '/api/system/status' },
      { method: 'GET', url: '/api/events' },
      { method: 'GET', url: '/api/events/tail' },
      { method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } } },
    ] as const) {
      const response = await app.inject(request);
      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer realm="Pico Foundation"');
      expect(response.json()).toEqual({ error: 'Foundation credential is required.' });
    }

    const oversizedPost = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        deviceId: 'desktop-dev',
        type: 'message.created',
        payload: { role: 'user', text: 'Hallo Pico', padding: 'x'.repeat(50_000) },
      }),
    });

    expect(oversizedPost.statusCode).toBe(401);
    expect(oversizedPost.json()).toEqual({ error: 'Foundation credential is required.' });

    await app.close();
  });

  it('accepts a bearer foundation token for protected Foundation API access', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });

    const headers = { authorization: 'Bearer dev-token' };

    const version = await app.inject({ method: 'GET', url: '/api/system/version', headers });
    expect(version.statusCode).toBe(200);

    const created = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers,
      payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } },
    });
    expect(created.statusCode).toBe(201);

    const listed = await app.inject({ method: 'GET', url: '/api/events', headers });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().events).toHaveLength(1);

    await app.close();
  });

  it('mints realtime tickets only through protected Foundation API access', async () => {
    const unprotectedApp = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
    });

    const disabled = await unprotectedApp.inject({ method: 'POST', url: '/api/realtime/tickets' });
    expect(disabled.statusCode).toBe(404);
    expect(disabled.json()).toEqual({ error: 'Realtime tickets are not enabled.' });
    await unprotectedApp.close();

    const protectedApp = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });

    const missingToken = await protectedApp.inject({ method: 'POST', url: '/api/realtime/tickets' });
    expect(missingToken.statusCode).toBe(401);
    expect(missingToken.headers['www-authenticate']).toBe('Bearer realm="Pico Foundation"');
    expect(missingToken.json()).toEqual({ error: 'Foundation credential is required.' });

    const ticketResponse = await protectedApp.inject({
      method: 'POST',
      url: '/api/realtime/tickets',
      headers: { authorization: 'Bearer dev-token' },
    });
    expect(ticketResponse.statusCode).toBe(201);
    expect(ticketResponse.headers['cache-control']).toBe('no-store');
    expect(ticketResponse.json()).toEqual({
      ticket: expect.any(String),
      expiresAt: expect.any(String),
    });

    await protectedApp.close();
  });

  it('rejects invalid event creation requests', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });
    const response = await app.inject({ method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', type: 'message.created' } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'deviceId, type and payload are required.' });
    await app.close();
  });

  it('rejects blank event identifiers and text fields', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const blankDeviceId = await app.inject({ method: 'POST', url: '/api/events', payload: { deviceId: '   ', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } } });
    expect(blankDeviceId.statusCode).toBe(400);
    expect(blankDeviceId.json()).toEqual({ error: 'deviceId, type and payload are required.' });

    const blankSessionId = await app.inject({ method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', sessionId: '   ', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } } });
    expect(blankSessionId.statusCode).toBe(400);
    expect(blankSessionId.json()).toEqual({ error: 'sessionId must be a non-empty string when provided.' });

    const blankStream = await app.inject({ method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', stream: '   ', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } } });
    expect(blankStream.statusCode).toBe(400);
    expect(blankStream.json()).toEqual({ error: 'stream must be a non-empty string when provided.' });

    const blankMessageText = await app.inject({ method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: '   ' } } });
    expect(blankMessageText.statusCode).toBe(400);
    expect(blankMessageText.json()).toEqual({ error: 'message.created payload requires role and text.' });

    await app.close();
  });

  it('accepts writable payload postures and rejects reserved or unknown ones', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' }, payloadPosture: 'inline_operational' },
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json().event.payloadPosture).toBe('inline_operational');

    const reserved = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' }, payloadPosture: 'reference_only' },
    });
    expect(reserved.statusCode).toBe(400);
    expect(reserved.json()).toEqual({ error: 'This payloadPosture is reserved for future memory-referencing events and is not writable yet.' });

    const unknown = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' }, payloadPosture: 'not_a_posture' },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toEqual({ error: 'payloadPosture must be a known posture.' });

    const withoutPosture = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } },
    });
    expect(withoutPosture.statusCode).toBe(201);
    expect('payloadPosture' in withoutPosture.json().event).toBe(false);

    const listed = await app.inject({ method: 'GET', url: '/api/events' });
    const postures = listed.json().events.map((event: { payloadPosture?: string }) => event.payloadPosture);
    expect(postures).toContain('inline_operational');
    expect(postures).toContain(undefined);

    await app.close();
  });

  it('splits memory.recorded content into the store and records a reference-only event', async () => {
    const databasePath = createDatabasePath();
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath, deviceId: 'test-core' });

    const recorded = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'memory.recorded',
        payload: { privacyDomain: 'domain-private', contentType: 'text/markdown', content: 'A private note.', summary: 'a note' },
      },
    });
    expect(recorded.statusCode).toBe(201);

    const event = recorded.json().event;
    expect(event.type).toBe('memory.recorded');
    expect(event.payloadPosture).toBe('reference_only');
    expect(event.payload).toEqual({
      memoryItemId: expect.stringMatching(/^mem_/),
      privacyDomain: 'domain-private',
      contentType: 'text/markdown',
      summary: 'a note',
    });
    expect('content' in event.payload).toBe(false);

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'memory.recorded', payload: { privacyDomain: 'domain-private', contentType: 'text/markdown' } },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: 'memory.recorded payload requires privacyDomain, contentType and content.' });

    await app.close();

    const verify = new EventStore(databasePath);
    const stored = verify.memory().getInDomain(event.payload.memoryItemId, 'domain-private');
    expect(stored?.content).toBe('A private note.');
    expect(stored?.deletionState).toBe('active');
    verify.close();
  });

  it('encrypts recorded memory content at rest when memory encryption is enabled', async () => {
    await sodium.ready;
    const databasePath = createDatabasePath();
    const keyStorePath = join(dirname(databasePath), 'keys');
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath, deviceId: 'test-core', memoryEncryption: true });

    const recorded = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'memory.recorded',
        payload: { privacyDomain: 'domain-private', contentType: 'text/plain', content: 'A private secret.', summary: 'a note' },
      },
    });
    expect(recorded.statusCode).toBe(201);
    const memoryItemId = recorded.json().event.payload.memoryItemId;
    // The reference-only event still never carries the content.
    expect('content' in recorded.json().event.payload).toBe(false);

    // A privacy domain that is not a valid key-store domain id is rejected at write time.
    const badDomain = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'memory.recorded', payload: { privacyDomain: 'domain.private', contentType: 'text/plain', content: 'x' } },
    });
    expect(badDomain.statusCode).toBe(400);
    expect(badDomain.json()).toEqual({ error: 'privacyDomain must match [a-zA-Z0-9_-]{1,128} when memory encryption is enabled.' });

    await app.close();

    // At rest the content is ciphertext, not the plaintext.
    const raw = new Database(databasePath, { readonly: true });
    const row = raw.prepare('SELECT content, content_posture FROM memory_item WHERE memory_item_id = ?').get(memoryItemId) as { content: string; content_posture: string };
    raw.close();
    expect(row.content_posture).toBe('domain_encrypted');
    expect(row.content).not.toContain('A private secret.');

    // A crypto-enabled store reading the same key store recovers the plaintext.
    const crypto = new MemoryContentCrypto(sodium, new KeyStore(keyStorePath));
    const verify = new EventStore(databasePath, { memoryCrypto: crypto });
    expect(verify.memory().getInDomain(memoryItemId, 'domain-private')?.content).toBe('A private secret.');
    verify.close();
  });

  it('runs the retention sweep on boot and expires an aged item through a tombstone', async () => {
    const databasePath = createDatabasePath();

    // Pre-seed a policy and an aged item that references it.
    const seed = new EventStore(databasePath);
    seed.retentionPolicies().create({ retentionPolicyId: 'ret-1', displayName: '1 day', mode: 'delete_after_max_age', maxAgeDays: 1 });
    seed.memory().create({
      memoryItemId: 'mem-old',
      privacyDomain: 'domain-private',
      owner: 'pico-owner',
      controller: 'pico-owner',
      contentType: 'text/plain',
      content: 'stale note',
      retentionPolicyRef: 'ret-1',
    });
    seed.close();
    const aged = new Database(databasePath);
    aged.prepare("UPDATE memory_item SET created_at = ? WHERE memory_item_id = 'mem-old'")
      .run(new Date(Date.now() - 10 * 86_400_000).toISOString());
    aged.close();

    // Booting the app runs the retention sweep.
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath, deviceId: 'test-core' });
    await app.close();

    const verify = new EventStore(databasePath);
    const item = verify.memory().getInDomain('mem-old', 'domain-private');
    expect(item?.deletionState).toBe('tombstoned');
    expect(item?.content).toBeUndefined();
    const tombstones = verify.list().filter((event) => event.type === 'memory.tombstone');
    expect(tombstones).toHaveLength(1);
    expect((tombstones[0].payload as { reason?: string }).reason).toBe('retention:ret-1');
    verify.close();
  });

  it('adds read-time resolution state to listed memory.recorded events', async () => {
    const databasePath = createDatabasePath();
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath, deviceId: 'test-core' });

    const recorded = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'memory.recorded', payload: { privacyDomain: 'domain-private', contentType: 'text/plain', content: 'a note' } },
    });
    const memoryItemId = recorded.json().event.payload.memoryItemId;

    const listed = await app.inject({ method: 'GET', url: '/api/events' });
    const active = listed.json().events.find((event: { type: string }) => event.type === 'memory.recorded');
    expect(active.payload.resolutionState).toBe('resolvable');
    expect('content' in active.payload).toBe(false);

    const mutate = new EventStore(databasePath);
    mutate.memory().deleteInDomain(memoryItemId, 'domain-private');
    mutate.close();

    const relisted = await app.inject({ method: 'GET', url: '/api/events' });
    const resolved = relisted.json().events.find((event: { type: string }) => event.type === 'memory.recorded');
    expect(resolved.payload.resolutionState).toBe('deleted');

    await app.close();
  });

  it('accepts a memory.tombstone event and rejects an invalid tombstone payload', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'memory.tombstone', payload: { memoryItemId: 'mem-1', privacyDomain: 'domain-private', reason: 'user request' } },
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json().event.type).toBe('memory.tombstone');

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'memory.tombstone', payload: { memoryItemId: 'mem-1' } },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: 'memory.tombstone payload requires memoryItemId and privacyDomain.' });

    await app.close();
  });

  it('projects a memory.tombstone event onto the deleted memory item', async () => {
    const databasePath = createDatabasePath();

    const seed = new EventStore(databasePath);
    seed.memory().create({ memoryItemId: 'mem-1', privacyDomain: 'domain-private', owner: 'pico-owner', controller: 'pico-owner', contentType: 'text/plain', content: 'a note' });
    seed.memory().deleteInDomain('mem-1', 'domain-private');
    seed.close();

    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath, deviceId: 'test-core' });
    const posted = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'memory.tombstone', payload: { memoryItemId: 'mem-1', privacyDomain: 'domain-private' } },
    });
    expect(posted.statusCode).toBe(201);
    await app.close();

    const verify = new EventStore(databasePath);
    expect(verify.memory().getInDomain('mem-1', 'domain-private')?.deletionState).toBe('tombstoned');
    verify.close();
  });

  it('accepts legitimate event bodies below the request body limit', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'message.created',
        payload: { role: 'user', text: 'x'.repeat(7_900) },
      },
    });

    expect(response.statusCode).toBe(201);

    await app.close();
  });

  it('rejects unexpected Foundation payload fields', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const message = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'message.created',
        payload: { role: 'user', text: 'Hallo Pico', memory: 'secret' },
      },
    });
    expect(message.statusCode).toBe(400);
    expect(message.headers['cache-control']).toBe('no-store');
    expect(message.json()).toEqual({ error: 'message.created payload has unexpected field: memory.' });

    const avatar = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'avatar.state_changed',
        payload: { mode: 'everyday', state: 'thinking', intensity: 'normal', statusColor: 'violet', privateNote: 'hidden' },
      },
    });
    expect(avatar.statusCode).toBe(400);
    expect(avatar.json()).toEqual({ error: 'avatar.state_changed payload has unexpected field: privateNote.' });

    const registered = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'device.registered',
        payload: { label: 'dev laptop' },
      },
    });
    expect(registered.statusCode).toBe(400);
    expect(registered.json()).toEqual({ error: 'device.registered payload has unexpected field: label.' });

    await app.close();
  });

  it('keeps the semantic payload size check separate from the request body limit', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'message.created',
        payload: { role: 'user', text: 'Hallo Pico', padding: 'x'.repeat(33_000) },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'payload is too large.' });

    await app.close();
  });

  it('rejects oversized request bodies before event validation', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        deviceId: 'desktop-dev',
        type: 'message.created',
        payload: { role: 'user', text: 'Hallo Pico', padding: 'x'.repeat(50_000) },
      }),
    });

    expect(response.statusCode).toBe(413);

    await app.close();
  });

  it('accepts foundation payload values exported by the protocol package', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const registered = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'device.registered',
        payload: {},
      },
    });
    expect(registered.statusCode).toBe(201);

    const session = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'session.created',
        payload: {},
      },
    });
    expect(session.statusCode).toBe(201);

    for (const status of deviceSeenStatuses) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'device.seen',
          payload: { status },
        },
      });

      expect(response.statusCode).toBe(201);
    }

    for (const role of clientWritableMessageCreatedRoles) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'message.created',
          payload: { role, text: `Message role ${role}` },
        },
      });

      expect(response.statusCode).toBe(201);
    }

    // ADR 0116 W1: the remaining roles of the full vocabulary are reserved at
    // the client write path, exactly like the action vocabulary.
    for (const role of messageCreatedRoles.filter((candidate) => !(clientWritableMessageCreatedRoles as readonly string[]).includes(candidate))) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'message.created',
          payload: { role, text: `Message role ${role}` },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'This message.created role is reserved for a later system or tool write path.' });
    }

    for (const mode of avatarModes) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'avatar.state_changed',
          payload: { mode, state: 'idle', intensity: 'normal', statusColor: 'neutral' },
        },
      });

      expect(response.statusCode).toBe(201);
    }

    for (const state of avatarStates) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'avatar.state_changed',
          payload: { mode: 'everyday', state, intensity: 'normal', statusColor: 'neutral' },
        },
      });

      expect(response.statusCode).toBe(201);
    }

    for (const intensity of avatarIntensities) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'avatar.state_changed',
          payload: { mode: 'everyday', state: 'idle', intensity, statusColor: 'neutral' },
        },
      });

      expect(response.statusCode).toBe(201);
    }

    for (const statusColor of avatarStatusColors) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'avatar.state_changed',
          payload: { mode: 'everyday', state: 'idle', intensity: 'normal', statusColor },
        },
      });

      expect(response.statusCode).toBe(201);
    }

    await app.close();
  });

  it('labels unauthenticated writes durably unattributed and refuses a client-asserted origin (ADR 0116 W1)', async () => {
    // Trusted-local pre-claim path: no token, no operator - `unattributed`.
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const created = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'unattributed row' } },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().event.origin).toBe('unattributed');

    // Durable, not response cosmetics: the label survives into the read path.
    const listed = await app.inject({ method: 'GET', url: '/api/events?limit=100' });
    const storedEvent = (listed.json().events as Array<{ eventId: string; origin?: string }>)
      .find((candidate) => candidate.eventId === created.json().event.eventId);
    expect(storedEvent?.origin).toBe('unattributed');

    // Origin is server-assigned, never client-assertable - refused loudly.
    const asserted = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'sneaky' }, origin: 'person_present' },
    });
    expect(asserted.statusCode).toBe(400);
    expect(asserted.json()).toEqual({ error: 'origin is assigned by the server and cannot be written.' });

    await app.close();

    // The static diagnostic token: `unattributed`, per the gate's own words.
    const tokenApp = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });
    const tokenWrite = await tokenApp.inject({
      method: 'POST',
      url: '/api/events',
      headers: { authorization: 'Bearer dev-token' },
      payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'token row' } },
    });
    expect(tokenWrite.statusCode).toBe(201);
    expect(tokenWrite.json().event.origin).toBe('unattributed');
    await tokenApp.close();

    // ADR 0116 W2 assigns the class W1 left open. Host administration is not a
    // voice that may instruct, and the vocabulary has no class for it, so the
    // operator takes the floor rather than an invented seventh class.
    const operatorApp = await bootstrappedApp();
    const login = await operatorApp.inject({ method: 'POST', url: '/api/auth/session', payload: { passphrase: OPERATOR_PASSPHRASE } });
    expect(login.statusCode).toBe(201);
    const operatorWrite = await operatorApp.inject({
      method: 'POST',
      url: '/api/events',
      headers: { authorization: `Bearer ${login.json().session as string}` },
      payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'operator row' } },
    });
    expect(operatorWrite.statusCode).toBe(201);
    expect(operatorWrite.json().event.origin).toBe('unattributed');
    await operatorApp.close();
  });

  it('labels the stored memory item, not only its reference event (ADR 0116 W2)', async () => {
    const databasePath = createDatabasePath();
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath, deviceId: 'test-core' });

    const recorded = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'memory.recorded',
        payload: {
          privacyDomain: 'domain-private',
          contentType: 'text/markdown',
          content: 'A note that will later be retrieved.',
        },
      },
    });
    expect(recorded.statusCode).toBe(201);
    expect(recorded.json().event.origin).toBe('unattributed');

    // Retrieval reads the store, not the event log, so a label that stopped at
    // the reference event would leave the retrieved copy unlabeled - which is
    // exactly the content a context assembler must refuse. Asserted against the
    // database rather than a read route, because reading a domain needs an
    // identity session with readership and none of that is what this proves.
    const memoryItemId = recorded.json().event.payload.memoryItemId as string;
    await app.close();
    const store = new EventStore(databasePath);
    try {
      expect(store.memory().getInDomain(memoryItemId, 'domain-private')?.origin)
        .toBe('unattributed');
    } finally {
      store.close();
    }

    const reopened = await buildApp({ host: '127.0.0.1', port: 0, databasePath, deviceId: 'test-core' });
    // The payload allow-list already refuses an asserted class; prove it on
    // this path too, so the store cannot be labeled by the writer.
    const asserted = await reopened.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'memory.recorded',
        payload: {
          privacyDomain: 'domain-private',
          contentType: 'text/markdown',
          content: 'sneaky',
          origin: 'person_present',
        },
      },
    });
    expect(asserted.statusCode).toBe(400);
    expect(asserted.json().error).toContain('unexpected field: origin');

    await reopened.close();
  });

  it('rejects reserved product event types on the foundation API', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    for (const type of [...actionEventTypes, ...picoHomeEventTypes]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type,
          payload: { actionName: 'homeassistant.get_entity_state', risk: 'read_only', input: { entityId: 'sensor.pico_status' } },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: RESERVED_EVENT_ERROR });
    }

    const removedAlias = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'tool.call_requested',
        payload: { toolName: 'homeassistant.get_entity_state' },
      },
    });
    expect(removedAlias.statusCode).toBe(400);
    expect(removedAlias.json()).toEqual({ error: 'deviceId, type and payload are required.' });

    // The server-synthesized crypto-shred audit event cannot be forged by a client.
    const shredForge = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'memory.domain_shredded', payload: { privacyDomain: 'domain-private', removedKeyVersions: 1 } },
    });
    expect(shredForge.statusCode).toBe(400);
    expect(shredForge.json()).toEqual({ error: RESERVED_EVENT_ERROR });

    await app.close();
  });

  it('rejects invalid list limits', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });
    for (const limit of ['-1', '1abc', '1.5']) {
      const response = await app.inject({ method: 'GET', url: `/api/events?limit=${limit}` });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'limit must be a positive integer.' });
    }
    await app.close();
  });

  it('sends a websocket connection message', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });
    await app.ready();
    let initialMessage: Promise<unknown> | null = null;
    const socket = await app.injectWS('/ws', {}, { onInit(ws) { initialMessage = readSocketJson(ws as unknown as TestWebSocket); } });
    try {
      const message = await requireMessagePromise(initialMessage);
      expect(message).toEqual({ type: realtimeMessageType.coreConnected, deviceId: 'test-core' });
    } finally {
      socket.terminate();
      await app.close();
    }
  });

  it('allows same-origin websocket browser connections', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });
    await app.ready();
    let initialMessage: Promise<unknown> | null = null;
    const socket = await app.injectWS('/ws', {
      headers: {
        host: 'localhost:3100',
        origin: 'http://localhost:3100',
      },
    }, { onInit(ws) { initialMessage = readSocketJson(ws as unknown as TestWebSocket); } });
    try {
      const message = await requireMessagePromise(initialMessage);
      expect(message).toEqual({ type: realtimeMessageType.coreConnected, deviceId: 'test-core' });
    } finally {
      socket.terminate();
      await app.close();
    }
  });

  it('rejects cross-origin websocket browser connections', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });
    await app.ready();
    await expect(app.injectWS('/ws', {
      headers: {
        host: 'localhost:3100',
        origin: 'http://evil.example.test',
      },
    })).rejects.toThrow('Unexpected server response: 403');
    await app.close();
  });

  it('allows explicitly configured websocket browser origins', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      wsAllowedOrigins: ['https://dev.example.test'],
    });
    await app.ready();
    let initialMessage: Promise<unknown> | null = null;
    const socket = await app.injectWS('/ws', {
      headers: {
        host: 'localhost:3100',
        origin: 'https://dev.example.test',
      },
    }, { onInit(ws) { initialMessage = readSocketJson(ws as unknown as TestWebSocket); } });
    try {
      const message = await requireMessagePromise(initialMessage);
      expect(message).toEqual({ type: realtimeMessageType.coreConnected, deviceId: 'test-core' });
    } finally {
      socket.terminate();
      await app.close();
    }
  });

  it('requires a realtime credential for websocket connections when a foundation token is configured', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });
    await app.ready();

    await expect(app.injectWS('/ws')).rejects.toThrow('Unexpected server response: 401');
    await expect(app.injectWS('/ws?ticket=dev-token')).rejects.toThrow('Unexpected server response: 401');

    await app.close();
  });

  it('accepts non-browser bearer websocket upgrades when a foundation token is configured', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });
    await app.ready();
    let initialMessage: Promise<unknown> | null = null;
    const socket = await app.injectWS('/ws', {
      headers: {
        authorization: 'Bearer dev-token',
      },
    }, { onInit(ws) { initialMessage = readSocketJson(ws as unknown as TestWebSocket); } });

    try {
      const message = await requireMessagePromise(initialMessage);
      expect(message).toEqual({ type: realtimeMessageType.coreConnected, deviceId: 'test-core' });
    } finally {
      socket.terminate();
      await app.close();
    }
  });

  it('rotates the host keys over Pico Link and answers to the new head at once', async () => {
    const databasePath = createDatabasePath();
    const app = await buildAppWithCapturedLog({ databasePath });
    const { setup, sealedClaim } = await claimPicoHomeThroughSealedFlow(app, readMoveInCode(app));
    const operatorAuth = {
      authorization: `Bearer ${(await app.inject({
        method: 'POST',
        url: '/api/auth/bootstrap',
        payload: {
          bootstrapCode: readBootstrapCode(app),
          passphrase: OPERATOR_PASSPHRASE,
        },
      })).json().session as string}`,
    };
    const founderFingerprint = sealedClaim.claim.claimantIdentityKeyFingerprintHex;

    // Enroll the founder's own device: the founding record is the founder's
    // membership root, so the identity session stands without a credential.
    const deviceSigning = sodium.crypto_sign_keypair();
    const deviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput = {
      suite: picoIdentitySuite,
      keyRole: 'device_signing',
      publicKeyHex: bytesToHex(deviceSigning.publicKey),
    };
    const deviceAgreement = sodium.crypto_box_keypair();
    const deviceAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput = {
      suite: picoIdentitySuite,
      keyRole: 'device_key_agreement',
      publicKeyHex: bytesToHex(deviceAgreement.publicKey),
    };
    const delegation: PicoIdentityDelegationSignatureInput = {
      suite: picoIdentitySuite,
      delegationId: 'delegation_host_rotation_founder',
      issuerIdentityKeyFingerprintHex: founderFingerprint,
      subjectSigningKeyFingerprintHex:
        keyRecordFingerprintHex(deviceSigningKeyRecord),
      subjectKeyAgreementKeyFingerprintHex:
        keyRecordFingerprintHex(deviceAgreementKeyRecord),
      scopes: ['surface_session'],
      ...picoTestValidityWindow(),
      lifecycleOrder: 'seq:0000000000000002',
    };
    const challenge = (await app.inject({
      method: 'POST',
      url: '/api/auth/identity-challenges',
    })).json() as { challengeId: string; verifierNonceHex: string; verifierContext: string };
    expect((await app.inject({
      method: 'POST',
      url: '/api/auth/identity-session',
      payload: {
        challengeId: challenge.challengeId,
        identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
        deviceSigningKeyRecord,
        deviceKeyAgreementKeyRecord: deviceAgreementKeyRecord,
        delegation: {
          record: delegation,
          signatureHex: bytesToHex(sodium.crypto_sign_detached(
            buildPicoIdentityDelegationSignatureInput(delegation),
            sealedClaim.claimantPrivateKey,
          )),
        },
        revocations: [],
        possessionSignatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoIdentityPossessionSignatureInput({
            suite: picoIdentitySuite,
            subjectKeyFingerprintHex:
              keyRecordFingerprintHex(deviceSigningKeyRecord),
            verifierNonceHex: challenge.verifierNonceHex,
            verifierContext: challenge.verifierContext,
          }),
          deviceSigning.privateKey,
        )),
      },
    })).statusCode).toBe(201);

    const linkRequest = async (
      operation: PicoLinkDirectOperation,
      args: Record<string, unknown>,
      hostPins: {
        signingKeyFingerprintHex: string;
        signingPublicKeyHex: string;
        keyAgreementPublicKeyHex: string;
      } = {
        signingKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
        signingPublicKeyHex: setup.host.signingPublicKeyHex,
        keyAgreementPublicKeyHex: setup.host.keyAgreementPublicKeyHex,
      },
    ): Promise<{
      statusCode: number;
      response?: PicoLinkDirectResponseSignatureInput;
      result?: Record<string, unknown>;
    }> => {
      const replyKey = sodium.crypto_box_keypair();
      const createdAtMs = Date.now();
      const request = {
        suite: picoIdentitySuite,
        requestId: `linkreq_${randomHex(16)}`,
        operation,
        hostSigningKeyFingerprintHex: hostPins.signingKeyFingerprintHex,
        senderIdentityKeyFingerprintHex: founderFingerprint,
        senderDeviceSigningKeyFingerprintHex:
          keyRecordFingerprintHex(deviceSigningKeyRecord),
        senderDeviceKeyAgreementKeyFingerprintHex:
          keyRecordFingerprintHex(deviceAgreementKeyRecord),
        senderDelegationId: delegation.delegationId,
        replyPublicKeyHex: bytesToHex(replyKey.publicKey),
        argumentsDigestHex: picoLinkDirectPayloadDigestHex(sodium, args),
        createdAt: new Date(createdAtMs).toISOString(),
        expiresAt: new Date(createdAtMs + 30_000).toISOString(),
      };
      const linked = await app.inject({
        method: 'POST',
        url: '/api/home/link',
        payload: {
          schema: picoLinkDirectRequestEnvelopeSchema,
          sealedRequestHex: bytesToHex(sodium.crypto_box_seal(
            Buffer.from(JSON.stringify({
              schema: picoLinkDirectRequestEnvelopeSchema,
              request,
              senderIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
              senderDeviceSigningKeyRecord: deviceSigningKeyRecord,
              arguments: args,
              senderSignatureHex: bytesToHex(sodium.crypto_sign_detached(
                buildPicoLinkDirectRequestSignatureInput(request),
                deviceSigning.privateKey,
              )),
            }), 'utf8'),
            hexToBytes(hostPins.keyAgreementPublicKeyHex),
          )),
        },
      });
      if (linked.statusCode !== 200) {
        return { statusCode: linked.statusCode };
      }
      const opened = JSON.parse(new TextDecoder().decode(sodium.crypto_box_seal_open(
        hexToBytes((linked.json() as { sealedResponseHex: string }).sealedResponseHex),
        replyKey.publicKey,
        replyKey.privateKey,
      ))) as {
        response: PicoLinkDirectResponseSignatureInput;
        result: Record<string, unknown>;
        hostSignatureHex: string;
      };
      // The client can only trust a response it can verify under the pin it
      // holds - the rotation submit's reply is the old era's last message and
      // must verify under the retiring key.
      expect(sodium.crypto_sign_verify_detached(
        hexToBytes(opened.hostSignatureHex),
        buildPicoLinkDirectResponseSignatureInput(opened.response),
        hexToBytes(hostPins.signingPublicKeyHex),
      )).toBe(true);
      return { statusCode: 200, ...opened };
    };

    const prepared = await linkRequest('home.host.rotation.prepare', {
      reasonCategory: 'host_key_rotated',
    });
    expect(prepared.response?.outcome).toBe('ok');
    const proposal = prepared.result as unknown as {
      continuity: PicoHomeContinuitySignatureInput;
      outgoingHostSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
      incomingHostSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
      outgoingHostSignatureHex: string;
      incomingHostSignatureHex: string;
    };
    expect(proposal.continuity.outgoingHostSigningKeyFingerprintHex)
      .toBe(setup.host.signingKeyFingerprintHex);

    // The acceptance is the founder root's signature over the same bytes -
    // the one signature custody could not put on the proposal itself.
    const record: PicoHomeContinuityRecord = {
      schema: picoHomeContinuityRecordSchema,
      continuity: proposal.continuity,
      outgoingHostSigningKeyRecord: proposal.outgoingHostSigningKeyRecord,
      incomingHostSigningKeyRecord: proposal.incomingHostSigningKeyRecord,
      homeHostPicoIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
      outgoingHostSignatureHex: proposal.outgoingHostSignatureHex,
      incomingHostSignatureHex: proposal.incomingHostSignatureHex,
      homeHostPicoSignatureHex: bytesToHex(sodium.crypto_sign_detached(
        buildPicoHomeContinuitySignatureInput(proposal.continuity),
        sealedClaim.claimantPrivateKey,
      )),
      createdAt: new Date().toISOString(),
    };
    // An operator wiping the staged keys mid-ceremony must refuse the
    // record, not record it: the store would accept any validly signed link,
    // and a link custody cannot serve stands between the person and their
    // own Home. This check is what keeps that invariant when staging and
    // submission are separated by time, restarts or surfaces.
    const sideStore = new HomeHostKeyStore(
      join(dirname(databasePath), 'home-host-keys'),
    );
    sideStore.discardStagedRotation();
    expect((await linkRequest('home.host.continuity.submit', {
      record: record as unknown as Record<string, unknown>,
    })).response?.outcome).toBe('incoming_keys_not_staged');
    // Re-staging mints fresh keys, so the old proposal is dead; prepare
    // again and re-accept.
    const reprepared = await linkRequest('home.host.rotation.prepare', {
      reasonCategory: 'host_key_rotated',
    });
    const reproposal = reprepared.result as unknown as typeof proposal;
    const rerecord: PicoHomeContinuityRecord = {
      schema: picoHomeContinuityRecordSchema,
      continuity: reproposal.continuity,
      outgoingHostSigningKeyRecord: reproposal.outgoingHostSigningKeyRecord,
      incomingHostSigningKeyRecord: reproposal.incomingHostSigningKeyRecord,
      homeHostPicoIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
      outgoingHostSignatureHex: reproposal.outgoingHostSignatureHex,
      incomingHostSignatureHex: reproposal.incomingHostSignatureHex,
      homeHostPicoSignatureHex: bytesToHex(sodium.crypto_sign_detached(
        buildPicoHomeContinuitySignatureInput(reproposal.continuity),
        sealedClaim.claimantPrivateKey,
      )),
      createdAt: new Date().toISOString(),
    };
    const submitted = await linkRequest('home.host.continuity.submit', {
      record: rerecord as unknown as Record<string, unknown>,
    });
    expect(submitted.response?.outcome).toBe('ok');
    const rotation = submitted.result as unknown as {
      link: { chainPosition: number };
      newHostPublicKeys: {
        signingKeyFingerprintHex: string;
        signingPublicKeyHex: string;
        keyAgreementPublicKeyHex: string;
      };
      recoveryCardsStale: boolean;
    };
    expect(rotation.link.chainPosition).toBe(0);
    expect(rotation.recoveryCardsStale).toBe(true);
    expect(rotation.newHostPublicKeys.signingKeyFingerprintHex)
      .toBe(rerecord.continuity.incomingHostSigningKeyFingerprintHex);

    // The Home answers to the new head at once - same channel, new pins -
    // and the retired audience is refused without a restart.
    const reRead = await linkRequest('home.device.lifecycle.read', {}, {
      signingKeyFingerprintHex:
        rotation.newHostPublicKeys.signingKeyFingerprintHex,
      signingPublicKeyHex:
        rotation.newHostPublicKeys.signingPublicKeyHex,
      keyAgreementPublicKeyHex:
        rotation.newHostPublicKeys.keyAgreementPublicKeyHex,
    });
    expect(reRead.response?.outcome).toBe('ok');
    expect((await linkRequest('home.device.lifecycle.read', {})).statusCode)
      .toBe(400);

    // A replay of the accepted link is idempotent: same answer, no second
    // promotion, no second audit entry.
    expect((await linkRequest('home.host.continuity.submit', {
      record: rerecord as unknown as Record<string, unknown>,
    }, {
      signingKeyFingerprintHex:
        rotation.newHostPublicKeys.signingKeyFingerprintHex,
      signingPublicKeyHex:
        rotation.newHostPublicKeys.signingPublicKeyHex,
      keyAgreementPublicKeyHex:
        rotation.newHostPublicKeys.keyAgreementPublicKeyHex,
    })).response?.outcome).toBe('ok');

    // Audited content-free: that the keys rotated is operational history;
    // which keys is the chain's business, not the audit stream's.
    const events = (await app.inject({
      method: 'GET',
      url: '/api/events',
      headers: operatorAuth,
    })).json().events as { type: string; payload: unknown }[];
    const rotated = events.filter((event) => event.type === 'home.host_key_rotated');
    expect(rotated).toHaveLength(1);
    expect(rotated[0].payload).toEqual({});

    await app.close();
  });

  it('carries a Pico identity root rotation and its veto over Pico Link Direct', async () => {
    const app = await buildAppWithCapturedLog();
    const { setup, sealedClaim, claimResponse } = await claimPicoHomeThroughSealedFlow(app, readMoveInCode(app));
    const homeId = (claimResponse.claimState as { homeId: string }).homeId;
    const operatorAuth = {
      authorization: `Bearer ${(await app.inject({
        method: 'POST',
        url: '/api/auth/bootstrap',
        payload: {
          bootstrapCode: readBootstrapCode(app),
          passphrase: OPERATOR_PASSPHRASE,
        },
      })).json().session as string}`,
    };

    const identityKey = (pair: { publicKey: Uint8Array }): PicoIdentityKeyRecordSignatureInput => ({
      suite: picoIdentitySuite,
      keyRole: 'pico_identity',
      publicKeyHex: bytesToHex(pair.publicKey),
    });
    // The rotating identity is a member: the founder's root is Home handover
    // and ADR 0114 refuses it.
    const member = sodium.crypto_sign_keypair();
    const memberKeyRecord = identityKey(member);
    const memberFingerprint = keyRecordFingerprintHex(memberKeyRecord);
    const successor = sodium.crypto_sign_keypair();
    const successorKeyRecord = identityKey(successor);

    const membership: PicoHomeMembershipSignatureInput = {
      suite: picoIdentitySuite,
      credentialId: 'member_rotation_link_0001',
      homeId,
      issuerPicoIdentityFingerprintHex:
        sealedClaim.claim.claimantIdentityKeyFingerprintHex,
      subjectPicoIdentityFingerprintHex: memberFingerprint,
      hostSigningKeyFingerprintHex: sealedClaim.claim.hostSigningKeyFingerprintHex,
      role: 'home_member',
      scopes: ['host.use', 'packet.receive'],
      ...picoTestValidityWindow(),
      lifecycleOrder: 'seq:0000000000000001',
    };
    expect((await app.inject({
      method: 'POST',
      url: '/api/home/memberships',
      headers: operatorAuth,
      payload: {
        schema: picoHomeMembershipCredentialSchema,
        membership,
        issuerIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
        issuerSignatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoHomeMembershipSignatureInput(membership),
          sealedClaim.claimantPrivateKey,
        )),
      },
    })).statusCode).toBe(201);

    const enrollDevice = async (
      index: number,
      identity: {
        keyRecord: PicoIdentityKeyRecordSignatureInput;
        privateKey: Uint8Array;
      } = { keyRecord: memberKeyRecord, privateKey: member.privateKey },
    ) => {
      const signing = sodium.crypto_sign_keypair();
      const signingKeyRecord: PicoIdentityKeyRecordSignatureInput = {
        suite: picoIdentitySuite,
        keyRole: 'device_signing',
        publicKeyHex: bytesToHex(signing.publicKey),
      };
      const agreement = sodium.crypto_box_keypair();
      const agreementKeyRecord: PicoIdentityKeyRecordSignatureInput = {
        suite: picoIdentitySuite,
        keyRole: 'device_key_agreement',
        publicKeyHex: bytesToHex(agreement.publicKey),
      };
      const record: PicoIdentityDelegationSignatureInput = {
        suite: picoIdentitySuite,
        delegationId: `delegation_rotation_link_${index}`,
        issuerIdentityKeyFingerprintHex: keyRecordFingerprintHex(identity.keyRecord),
        subjectSigningKeyFingerprintHex: keyRecordFingerprintHex(signingKeyRecord),
        subjectKeyAgreementKeyFingerprintHex:
          keyRecordFingerprintHex(agreementKeyRecord),
        scopes: ['surface_session'],
        ...picoTestValidityWindow(),
        lifecycleOrder: `seq:000000000000000${index + 2}`,
      };
      const signedDelegation = {
        record,
        signatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoIdentityDelegationSignatureInput(record),
          identity.privateKey,
        )),
      };
      const challenge = (await app.inject({
        method: 'POST',
        url: '/api/auth/identity-challenges',
      })).json() as { challengeId: string; verifierNonceHex: string; verifierContext: string };
      expect((await app.inject({
        method: 'POST',
        url: '/api/auth/identity-session',
        payload: {
          challengeId: challenge.challengeId,
          identityKeyRecord: identity.keyRecord,
          deviceSigningKeyRecord: signingKeyRecord,
          deviceKeyAgreementKeyRecord: agreementKeyRecord,
          delegation: signedDelegation,
          revocations: [],
          possessionSignatureHex: bytesToHex(sodium.crypto_sign_detached(
            buildPicoIdentityPossessionSignatureInput({
              suite: picoIdentitySuite,
              subjectKeyFingerprintHex: keyRecordFingerprintHex(signingKeyRecord),
              verifierNonceHex: challenge.verifierNonceHex,
              verifierContext: challenge.verifierContext,
            }),
            signing.privateKey,
          )),
        },
      })).statusCode).toBe(201);
      return {
        identityKeyRecord: identity.keyRecord,
        signingKeyRecord,
        signingPrivateKey: signing.privateKey,
        agreementKeyRecord,
        delegationId: record.delegationId,
      };
    };
    const devices = [await enrollDevice(0), await enrollDevice(1)];

    const linkRequest = async (
      operation: PicoLinkDirectOperation,
      args: Record<string, unknown>,
      sender: (typeof devices)[number],
    ): Promise<{
      response: PicoLinkDirectResponseSignatureInput;
      result: Record<string, unknown>;
    }> => {
      const replyKey = sodium.crypto_box_keypair();
      const createdAtMs = Date.now();
      const request = {
        suite: picoIdentitySuite,
        requestId: `linkreq_${randomHex(16)}`,
        operation,
        hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
        senderIdentityKeyFingerprintHex:
          keyRecordFingerprintHex(sender.identityKeyRecord),
        senderDeviceSigningKeyFingerprintHex:
          keyRecordFingerprintHex(sender.signingKeyRecord),
        senderDeviceKeyAgreementKeyFingerprintHex:
          keyRecordFingerprintHex(sender.agreementKeyRecord),
        senderDelegationId: sender.delegationId,
        replyPublicKeyHex: bytesToHex(replyKey.publicKey),
        argumentsDigestHex: picoLinkDirectPayloadDigestHex(sodium, args),
        createdAt: new Date(createdAtMs).toISOString(),
        expiresAt: new Date(createdAtMs + 30_000).toISOString(),
      };
      const linked = await app.inject({
        method: 'POST',
        url: '/api/home/link',
        payload: {
          schema: picoLinkDirectRequestEnvelopeSchema,
          sealedRequestHex: bytesToHex(sodium.crypto_box_seal(
            Buffer.from(JSON.stringify({
              schema: picoLinkDirectRequestEnvelopeSchema,
              request,
              senderIdentityKeyRecord: sender.identityKeyRecord,
              senderDeviceSigningKeyRecord: sender.signingKeyRecord,
              arguments: args,
              senderSignatureHex: bytesToHex(sodium.crypto_sign_detached(
                buildPicoLinkDirectRequestSignatureInput(request),
                sender.signingPrivateKey,
              )),
            }), 'utf8'),
            hexToBytes(setup.host.keyAgreementPublicKeyHex),
          )),
        },
      });
      expect(linked.statusCode).toBe(200);
      return JSON.parse(new TextDecoder().decode(sodium.crypto_box_seal_open(
        hexToBytes((linked.json() as { sealedResponseHex: string }).sealedResponseHex),
        replyKey.publicKey,
        replyKey.privateKey,
      ))) as {
        response: PicoLinkDirectResponseSignatureInput;
        result: Record<string, unknown>;
      };
    };

    const firstDeviceDelegation: PicoIdentityDelegationSignatureInput = {
      suite: picoIdentitySuite,
      delegationId: 'delegation_rotation_link_successor',
      issuerIdentityKeyFingerprintHex: keyRecordFingerprintHex(successorKeyRecord),
      subjectSigningKeyFingerprintHex:
        keyRecordFingerprintHex(devices[0].signingKeyRecord),
      subjectKeyAgreementKeyFingerprintHex:
        keyRecordFingerprintHex(devices[0].agreementKeyRecord),
      scopes: ['surface_session'],
      ...picoTestValidityWindow(),
      lifecycleOrder: 'seq:0000000000000009',
    };
    const rotation: PicoIdentityRotationSignatureInput = {
      suite: picoIdentitySuite,
      rotationId: 'rotation_link_0001',
      predecessorIdentityKeyFingerprintHex: memberFingerprint,
      successorIdentityKeyFingerprintHex:
        keyRecordFingerprintHex(successorKeyRecord),
      reasonCategory: 'suspected_compromise',
      rotatedAt: new Date().toISOString(),
      lifecycleOrder: 'seq:0000000000000009',
    };
    const rotationBytes = buildPicoIdentityRotationSignatureInput(rotation);
    const rotationArguments = {
      rotation,
      predecessorIdentityKeyRecord: memberKeyRecord,
      successorIdentityKeyRecord: successorKeyRecord,
      predecessorSignatureHex: bytesToHex(
        sodium.crypto_sign_detached(rotationBytes, member.privateKey),
      ),
      successorSignatureHex: bytesToHex(
        sodium.crypto_sign_detached(rotationBytes, successor.privateKey),
      ),
      successorFirstDevice: {
        delegation: {
          record: firstDeviceDelegation,
          signatureHex: bytesToHex(sodium.crypto_sign_detached(
            buildPicoIdentityDelegationSignatureInput(firstDeviceDelegation),
            successor.privateKey,
          )),
        },
        deviceKeyAgreementKeyRecord: devices[0].agreementKeyRecord,
      },
    };

    const submitted = await linkRequest(
      'home.identity.rotation.submit',
      rotationArguments as unknown as Record<string, unknown>,
      devices[0],
    );
    expect(submitted.response.outcome).toBe('rotation_pending');
    expect(submitted.result).toMatchObject({
      rotationId: 'rotation_link_0001',
      status: 'pending',
      successorFirstDeviceDelegationId: 'delegation_rotation_link_successor',
    });

    // The alarm rides the read the ADR 0112 carrier already performs, so a
    // living device learns of the rotation without a second surface.
    expect((await linkRequest('home.device.lifecycle.read', {}, devices[1])).result)
      .toMatchObject({
        homeId,
        pendingRootRotation: { rotationId: 'rotation_link_0001', status: 'pending' },
      });

    // ADR 0119 Q5 with ADR 0118 O4. The person's own device can ask the Home
    // for its storage condition, because the Foundation UI is not where the
    // person is and a refusal met with no warning is what Q5 exists to
    // prevent. Authorized senders only, and the reply carries the state and
    // the reason classes and nothing else - row counts and free bytes would
    // let a peer infer how much this Home holds without changing a decision.
    const storage = await linkRequest('home.storage.condition.read', {}, devices[1]);
    expect(storage.response.outcome).toBe('ok');
    expect(storage.result).toEqual({ state: 'normal', causes: [] });
    expect(Object.keys(storage.result as Record<string, unknown>).sort())
      .toEqual(['causes', 'state']);

    // Arguments are a shape this operation does not have.
    expect((await linkRequest(
      'home.storage.condition.read',
      { store: 'event_log' },
      devices[1],
    )).response.outcome).toBe('invalid_arguments');

    // ADR 0118 O1. The device can ask which entries are due, and the reply
    // carries no title: that is domain content behind custody rules, so the
    // person is told something is waiting and opens their Home to see what.
    const dueEntries = await linkRequest('home.time_bound_entries.read', {}, devices[1]);
    expect(dueEntries.response.outcome).toBe('ok');
    expect(dueEntries.result).toEqual({ entries: [], total: 0 });
    expect((await linkRequest(
      'home.time_bound_entries.read',
      { limit: 5 },
      devices[1],
    )).response.outcome).toBe('invalid_arguments');

    // ADR 0118 O1 with ADR 0077. Record one that is already due, then ask as a
    // member. The entry comes back; the words do not.
    //
    // This is the property worth proving: membership is what the Link
    // authorized, and readership is a separate question this Home answers no
    // to. A device that got the title here would have been given content on
    // the strength of "may use this Home", which is exactly the conflation
    // ADR 0077 exists to prevent.
    expect((await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: operatorAuth,
      payload: {
        deviceId: 'desktop-dev',
        type: 'memory.recorded',
        payload: {
          privacyDomain: 'domain-private',
          contentType: 'application/vnd.pico.reminder',
          content: 'Call the dentist',
          dueAt: new Date(Date.now() - 60_000).toISOString(),
        },
      },
    })).statusCode).toBe(201);

    const withEntry = await linkRequest('home.time_bound_entries.read', {}, devices[1]);
    const listed = (withEntry.result as { entries: Array<Record<string, unknown>> }).entries;
    expect(listed).toHaveLength(1);
    expect(listed[0]?.kind).toBe('reminder');
    expect(listed[0]?.title).toBeUndefined();
    // And the domain is not named either, so the silence cannot be turned into
    // a map of what this Home holds.
    expect(Object.keys(listed[0] ?? {}).sort()).toEqual(['dueAt', 'kind', 'memoryItemId']);

    // The device that authorized the rotation is not an independent objection
    // to it, and the Link surface adds no exception to that.
    expect((await linkRequest(
      'home.identity.rotation.veto',
      { rotationId: 'rotation_link_0001' },
      devices[0],
    )).response.outcome).toBe('veto_requires_another_device');

    const vetoed = await linkRequest(
      'home.identity.rotation.veto',
      { rotationId: 'rotation_link_0001' },
      devices[1],
    );
    expect(vetoed.response.outcome).toBe('ok');
    expect(vetoed.result).toEqual({ status: 'vetoed' });
    expect((await linkRequest('home.device.lifecycle.read', {}, devices[1])).result)
      .toMatchObject({ pendingRootRotation: null });

    // Host keys are the Home's infrastructure: a member's device cannot even
    // stage a rotation of them (ADR 0080 governance, enforced at the link).
    expect((await linkRequest(
      'home.host.rotation.prepare',
      { reasonCategory: 'host_key_rotated' },
      devices[1],
    )).response.outcome).toBe('sender_is_not_home_host_pico');

    const events = (await app.inject({
      method: 'GET',
      url: '/api/events',
      headers: operatorAuth,
    })).json().events as { type: string; payload: unknown }[];
    const vetoEvents = events.filter(
      (event) => event.type === 'home.identity_root_rotation_vetoed',
    );
    expect(vetoEvents).toHaveLength(1);
    // Audited, but content-free: that a rotation was refused is operational
    // history; who and which root are not the audit stream's business.
    expect(vetoEvents[0].payload).toEqual({});

    // A vetoed rotation blocks nothing later: the person tries again.
    const secondRotation: PicoIdentityRotationSignatureInput = {
      ...rotation,
      rotationId: 'rotation_link_0002',
      rotatedAt: new Date().toISOString(),
    };
    const secondBytes = buildPicoIdentityRotationSignatureInput(secondRotation);
    expect((await linkRequest(
      'home.identity.rotation.submit',
      {
        ...rotationArguments,
        rotation: secondRotation,
        predecessorSignatureHex: bytesToHex(
          sodium.crypto_sign_detached(secondBytes, member.privateKey),
        ),
        successorSignatureHex: bytesToHex(
          sodium.crypto_sign_detached(secondBytes, successor.privateKey),
        ),
      } as unknown as Record<string, unknown>,
      devices[0],
    )).response.outcome).toBe('rotation_pending');

    // Until the Home Host Pico re-admits the successor, its device is refused
    // like any non-member - deliberately. The only step that exists in that
    // window belongs to the issuer, and the device's waiting surface runs on
    // its own signed submission receipt, not on Home state the Home would
    // have to reveal to a key its issuer has not re-admitted.
    const successorMembership: PicoHomeMembershipSignatureInput = {
      ...membership,
      credentialId: 'member_rotation_link_0002',
      subjectPicoIdentityFingerprintHex:
        keyRecordFingerprintHex(successorKeyRecord),
      lifecycleOrder: 'seq:0000000000000002',
    };
    expect((await app.inject({
      method: 'POST',
      url: '/api/home/memberships',
      headers: operatorAuth,
      payload: {
        schema: picoHomeMembershipCredentialSchema,
        membership: successorMembership,
        issuerIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
        issuerSignatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoHomeMembershipSignatureInput(successorMembership),
          sealedClaim.claimantPrivateKey,
        )),
      },
    })).statusCode).toBe(201);

    // Re-admitted - even mid-window - the successor reads its own debt on the
    // same lifecycle read everything else rides. No new surface, no restart.
    const successorDevice = await enrollDevice(7, {
      keyRecord: successorKeyRecord,
      privateKey: successor.privateKey,
    });
    const successorRead = await linkRequest(
      'home.device.lifecycle.read',
      {},
      successorDevice,
    );
    expect(successorRead.response.outcome).toBe('ok');
    expect(successorRead.result).toMatchObject({
      // The successor is nobody's predecessor: the alarm field stays clean.
      pendingRootRotation: null,
      rotationDebt: {
        rotationId: 'rotation_link_0002',
        status: 'pending',
        successorFirstDevice: {
          delegationId: 'delegation_rotation_link_successor',
          delegated: false,
          readerKeyRegistered: false,
        },
        // The one debt the issuer could settle early, it already has.
        membershipsToReissue: [],
        readGrantsToReissue: [],
      },
    });

    // The debt is the principal's own, never somebody else's to read: the
    // predecessor's device sees the pending alarm, not the successor's debt.
    const memberRead = await linkRequest(
      'home.device.lifecycle.read',
      {},
      devices[1],
    );
    expect(memberRead.result).toMatchObject({
      pendingRootRotation: { rotationId: 'rotation_link_0002' },
      rotationDebt: null,
    });

    await app.close();
  });

  it('activates an issuer-signed membership credential and audits it content-free', async () => {
    const app = await buildAppWithCapturedLog();
    const { sealedClaim, claimResponse } = await claimPicoHomeThroughSealedFlow(app, readMoveInCode(app));
    const homeId = (claimResponse.claimState as { homeId: string }).homeId;
    const bootstrapCode = readBootstrapCode(app);
    const session = (await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode, passphrase: OPERATOR_PASSPHRASE },
    })).json().session as string;
    const auth = { authorization: `Bearer ${session}` };

    const memberFingerprint = 'b'.repeat(64);
    const membership: PicoHomeMembershipSignatureInput = {
      suite: picoIdentitySuite,
      credentialId: 'member_20260719_0001',
      homeId,
      issuerPicoIdentityFingerprintHex: sealedClaim.claim.claimantIdentityKeyFingerprintHex,
      subjectPicoIdentityFingerprintHex: memberFingerprint,
      hostSigningKeyFingerprintHex: sealedClaim.claim.hostSigningKeyFingerprintHex,
      role: 'home_member',
      scopes: ['host.use', 'packet.receive'],
      validFrom: '2026-07-19T11:00:00.000Z',
      validUntil: '2027-07-19T11:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000001',
    };
    const membershipBytes = buildPicoHomeMembershipSignatureInput(membership);
    const issuerStatement = (privateKey: Uint8Array) => ({
      schema: picoHomeMembershipCredentialSchema,
      membership,
      issuerIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
      issuerSignatureHex: bytesToHex(sodium.crypto_sign_detached(membershipBytes, privateKey)),
    });

    // The operator relays what the Home Host Pico signed; it cannot mint one.
    // A statement signed by anyone else is refused, and the host never
    // countersigns it (ADR 0080 H6/H9).
    const stranger = sodium.crypto_sign_keypair();
    const forged = await app.inject({
      method: 'POST',
      url: '/api/home/memberships',
      headers: auth,
      payload: issuerStatement(stranger.privateKey),
    });
    expect(forged.statusCode).toBe(401);
    expect(forged.json()).toEqual({ error: 'invalid_issuer_signature' });

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/home/memberships',
      headers: auth,
      payload: issuerStatement(sealedClaim.claimantPrivateKey),
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json().membership).toMatchObject({
      homeId,
      picoIdentityFingerprintHex: memberFingerprint,
      role: 'home_member',
      status: 'active',
      source: 'membership_credential',
      sourceRef: 'member_20260719_0001',
    });

    const listed = await app.inject({ method: 'GET', url: '/api/home/memberships', headers: auth });
    expect((listed.json().memberships as { role: string }[]).map((row) => row.role).sort())
      .toEqual(['home_host', 'home_member']);

    // The Home Host Pico evicts the member; the freshest statement wins.
    const lifecycle: PicoHomeMembershipLifecycleSignatureInput = {
      suite: picoIdentitySuite,
      lifecycleId: 'memberlc_20260719_0001',
      homeId,
      credentialId: 'member_20260719_0001',
      issuerPicoIdentityFingerprintHex: sealedClaim.claim.claimantIdentityKeyFingerprintHex,
      subjectPicoIdentityFingerprintHex: memberFingerprint,
      status: 'evicted',
      reasonCategory: 'member_removed',
      changedAt: '2026-08-01T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000005',
    };
    const evicted = await app.inject({
      method: 'POST',
      url: '/api/home/membership-lifecycle',
      headers: auth,
      payload: {
        schema: picoHomeMembershipLifecycleRecordSchema,
        lifecycle,
        issuerIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
        issuerSignatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoHomeMembershipLifecycleSignatureInput(lifecycle),
          sealedClaim.claimantPrivateKey,
        )),
        createdAt: '2026-08-01T10:00:00.000Z',
      },
    });
    expect(evicted.statusCode).toBe(200);
    expect(evicted.json().membership).toMatchObject({ status: 'evicted' });

    // ADR 0078 K7: references and a status, never key material and never content.
    const events = await app.inject({ method: 'GET', url: '/api/events', headers: auth });
    const membershipEvents = (events.json().events as { type: string; payload: Record<string, unknown> }[])
      .filter((event) => event.type.startsWith('home.membership'));
    expect(membershipEvents.map((event) => event.type))
      .toEqual(['home.membership_recorded', 'home.membership_changed']);
    expect(membershipEvents[0].payload).toEqual({
      credentialId: 'member_20260719_0001',
      subjectPicoIdentityFingerprintHex: memberFingerprint,
      status: 'active',
    });
    expect(membershipEvents[1].payload).toEqual({
      credentialId: 'member_20260719_0001',
      lifecycleId: 'memberlc_20260719_0001',
      subjectPicoIdentityFingerprintHex: memberFingerprint,
      status: 'evicted',
    });
    expect(JSON.stringify(membershipEvents)).not.toContain(sealedClaim.claimantIdentityKeyRecord.publicKeyHex);

    await app.close();
  });

  it('issues a share envelope to a resident and shows it without the delegation that carried it', async () => {
    /*
     * Befund B177, der vierte und teuerste Fall. `publicPicoShareEnvelope`
     * entscheidet, **was einen Umschlag verlaesst** - und kein Test betrat sie,
     * weil die Ausstellung ueber die Flaeche nirgends gefahren wurde.
     *
     * **Warum es einen zweiten Bewohner braucht**, und das war die Ausbeute
     * zweier verworfener Anlaeufe: die Kandidatensuche fuer Leserschluessel
     * verlangt eine *Mitgliedschaft* des Lesers, und das Home Host Pico kann
     * keine haben - die Gruendungsaufzeichnung ist bereits seine
     * Mitgliedschaftswurzel (ADR 0080, `home_host_membership_is_not_reissued`).
     * Ein Umschlag an das Home selbst ist also strukturell unmoeglich, und das
     * ist richtig so: ein Umschlag traegt einen Schluessel *zu jemandem*.
     */
    const app = await buildAppWithCapturedLog({ memoryEncryption: true });
    const { sealedClaim, claimResponse } = await claimPicoHomeThroughSealedFlow(app, readMoveInCode(app));
    const homeId = (claimResponse.claimState as { homeId: string }).homeId;
    const operatorSession = (await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode: readBootstrapCode(app), passphrase: OPERATOR_PASSPHRASE },
    })).json().session as string;
    const operatorAuth = { authorization: `Bearer ${operatorSession}` };
    const homeHostIdentityFingerprint = sealedClaim.claim.claimantIdentityKeyFingerprintHex;

    // Der zweite Bewohner: eigene Identitaet, und eine Mitgliedschaft, die das
    // Home Host Pico ihm ausstellt.
    const resident = sodium.crypto_sign_keypair();
    const residentKeyRecord: PicoIdentityKeyRecordSignatureInput = {
      suite: picoIdentitySuite,
      keyRole: 'pico_identity',
      publicKeyHex: bytesToHex(resident.publicKey),
    };
    const residentFingerprint = keyRecordFingerprintHex(residentKeyRecord);
    const membership: PicoHomeMembershipSignatureInput = {
      suite: picoIdentitySuite,
      credentialId: 'member_share_envelope_0001',
      homeId,
      issuerPicoIdentityFingerprintHex: homeHostIdentityFingerprint,
      subjectPicoIdentityFingerprintHex: residentFingerprint,
      hostSigningKeyFingerprintHex: sealedClaim.claim.hostSigningKeyFingerprintHex,
      role: 'home_member',
      scopes: ['host.use'],
      ...picoTestValidityWindow(),
      lifecycleOrder: 'seq:0000000000000001',
    };
    expect((await app.inject({
      method: 'POST',
      url: '/api/home/memberships',
      headers: operatorAuth,
      payload: {
        schema: picoHomeMembershipCredentialSchema,
        membership,
        issuerIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
        issuerSignatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoHomeMembershipSignatureInput(membership),
          sealedClaim.claimantPrivateKey,
        )),
      },
    })).statusCode).toBe(201);

    // Sein Geraet, und die Delegation, die *er* dafuer unterschreibt.
    const deviceSigning = sodium.crypto_sign_keypair();
    const deviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput = {
      suite: picoIdentitySuite,
      keyRole: 'device_signing',
      publicKeyHex: bytesToHex(deviceSigning.publicKey),
    };
    const deviceSigningFingerprint = keyRecordFingerprintHex(deviceSigningKeyRecord);
    const deviceAgreement = sodium.crypto_box_keypair();
    const deviceAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput = {
      suite: picoIdentitySuite,
      keyRole: 'device_key_agreement',
      publicKeyHex: bytesToHex(deviceAgreement.publicKey),
    };
    const readerKeyFingerprintHex = keyRecordFingerprintHex(deviceAgreementKeyRecord);
    const delegation: PicoIdentityDelegationSignatureInput = {
      suite: picoIdentitySuite,
      delegationId: 'delegation_share_envelope_0001',
      issuerIdentityKeyFingerprintHex: residentFingerprint,
      subjectSigningKeyFingerprintHex: deviceSigningFingerprint,
      subjectKeyAgreementKeyFingerprintHex: readerKeyFingerprintHex,
      // Ein Leserschluessel verlangt eine Delegation, die das Entschluesseln
      // ueberhaupt erlaubt - `surface_session` allein macht noch keinen Leser.
      scopes: ['surface_session', 'decrypt_domain', 'receive_key_envelope'],
      ...picoTestValidityWindow(),
      lifecycleOrder: 'seq:0000000000000002',
    };

    // Die Identitaetssitzung ist es, die seinen Leserschluessel eintraegt.
    const challenge = (await app.inject({
      method: 'POST',
      url: '/api/auth/identity-challenges',
    })).json() as { challengeId: string; verifierNonceHex: string; verifierContext: string };
    const session = await app.inject({
      method: 'POST',
      url: '/api/auth/identity-session',
      payload: {
        challengeId: challenge.challengeId,
        identityKeyRecord: residentKeyRecord,
        deviceSigningKeyRecord,
        deviceKeyAgreementKeyRecord: deviceAgreementKeyRecord,
        delegation: {
          record: delegation,
          signatureHex: bytesToHex(sodium.crypto_sign_detached(
            buildPicoIdentityDelegationSignatureInput(delegation),
            resident.privateKey,
          )),
        },
        revocations: [],
        possessionSignatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoIdentityPossessionSignatureInput({
            suite: picoIdentitySuite,
            subjectKeyFingerprintHex: deviceSigningFingerprint,
            verifierNonceHex: challenge.verifierNonceHex,
            verifierContext: challenge.verifierContext,
          }),
          deviceSigning.privateKey,
        )),
      },
    });
    expect(session.statusCode).toBe(201);

    // Etwas zu teilen, und damit eine Schluesselversion fuer die Domaene.
    await recordMemoryItem(app, operatorSession, {
      privacyDomain: 'domain-journal',
      content: 'Ein Eintrag, den jemand lesen darf.',
    });

    // Die Zuteilung: das Home Host Pico erteilt, der Bewohner liest.
    const grant: PicoHomeDomainReadGrantSignatureInput = {
      suite: picoIdentitySuite,
      grantId: 'grant_share_envelope_0001',
      homeId,
      hostSigningKeyFingerprintHex: sealedClaim.claim.hostSigningKeyFingerprintHex,
      privacyDomain: 'domain-journal',
      controllerPicoIdentityFingerprintHex: homeHostIdentityFingerprint,
      readerPicoIdentityFingerprintHex: residentFingerprint,
      ...picoTestValidityWindow(),
      lifecycleOrder: 'seq:0000000000000001',
    };
    expect((await app.inject({
      method: 'POST',
      url: '/api/home/domain-read-grants',
      headers: operatorAuth,
      payload: {
        schema: picoHomeDomainReadGrantRecordSchema,
        grant,
        issuerIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
        issuerSignatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoHomeDomainReadGrantSignatureInput(grant),
          sealedClaim.claimantPrivateKey,
        )),
      },
    })).statusCode).toBe(201);

    // Und der Nachweis, dass sein Schluessel noch der aktuelle ist - den
    // unterschreibt er selbst, weil er die Delegation ausgestellt hat.
    const checkedAtMs = Date.now();
    const checkpoint: PicoIdentityReaderKeyFreshnessSignatureInput = {
      suite: picoIdentitySuite,
      checkpointId: 'checkpoint_share_envelope_0001',
      homeId,
      issuerIdentityKeyFingerprintHex: residentFingerprint,
      deviceSigningKeyFingerprintHex: deviceSigningFingerprint,
      deviceKeyAgreementKeyFingerprintHex: readerKeyFingerprintHex,
      delegationId: delegation.delegationId,
      status: 'current',
      observedThroughLifecycleOrder: delegation.lifecycleOrder,
      checkedAt: new Date(checkedAtMs).toISOString(),
      freshUntil: new Date(checkedAtMs + 4 * 60_000).toISOString(),
    };
    expect((await app.inject({
      method: 'POST',
      url: '/api/home/reader-key-freshness-checkpoints',
      headers: operatorAuth,
      payload: {
        schema: picoIdentityReaderKeyFreshnessCheckpointSchema,
        checkpoint,
        issuerIdentityKeyRecord: residentKeyRecord,
        issuerSignatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoIdentityReaderKeyFreshnessSignatureInput(checkpoint),
          resident.privateKey,
        )),
      },
    })).statusCode).toBe(202);

    const prepared = await app.inject({
      method: 'POST',
      url: '/api/home/share-envelope-issuance',
      headers: operatorAuth,
      payload: {
        grantId: grant.grantId,
        delegationId: delegation.delegationId,
        readerKeyFingerprintHex,
        kekVersion: 1,
      },
    });
    expect(prepared.statusCode).toBe(201);
    const issuance = (prepared.json() as {
      issuance: {
        issuanceId: string;
        envelope: Parameters<typeof buildPicoShareEnvelopeSignatureInput>[0];
        sealedWrapHex: string;
      };
    }).issuance;

    // Der versiegelte Umschlag geht an ihn und an niemanden sonst: er laesst
    // sich nur mit seinem Vereinbarungsschluessel oeffnen.
    expect(sodium.crypto_box_seal_open(
      Buffer.from(issuance.sealedWrapHex, 'hex'),
      deviceAgreement.publicKey,
      deviceAgreement.privateKey,
    ).length).toBeGreaterThan(0);

    expect((await app.inject({
      method: 'POST',
      url: '/api/home/share-envelopes',
      headers: operatorAuth,
      payload: {
        issuanceId: issuance.issuanceId,
        issuerSignatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoShareEnvelopeSignatureInput(issuance.envelope),
          sealedClaim.claimantPrivateKey,
        )),
      },
    })).statusCode).toBe(201);

    const listed = await app.inject({
      method: 'GET',
      url: '/api/home/share-envelopes',
      headers: operatorAuth,
    });
    expect(listed.statusCode).toBe(200);
    const envelopes = (listed.json() as { envelopes: Record<string, unknown>[] }).envelopes;
    expect(envelopes).toHaveLength(1);

    /*
     * **Und die Delegation bleibt drinnen.** Der versiegelte Umschlag ist fuer
     * den Leser bestimmt und geht hinaus; *welche Delegation* ihn getragen hat,
     * ist eine Angabe ueber das Geraet einer Person und geht niemanden an, der
     * diese Liste liest. Genau das ist der ganze Inhalt von
     * `publicPicoShareEnvelope` - und genau das stand in keinem Test.
     */
    expect(Object.keys(envelopes[0]!).sort()).toEqual(['issuanceId', 'record']);
    expect(envelopes[0]).toMatchObject({
      issuanceId: issuance.issuanceId,
      record: { envelope: { grantId: grant.grantId, suite: picoShareSuite } },
    });

    await app.close();
  });

  it('binds an identity session by possession and requires a signed domain grant on a claimed Home', async () => {
    const app = await buildAppWithCapturedLog();
    const { setup, sealedClaim, claimResponse } = await claimPicoHomeThroughSealedFlow(app, readMoveInCode(app));
    const homeId = (claimResponse.claimState as { homeId: string }).homeId;
    const bootstrapResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        bootstrapCode: readBootstrapCode(app),
        passphrase: OPERATOR_PASSPHRASE,
      },
    });
    const operatorSession = bootstrapResponse.json().session as string;
    const operatorAuth = { authorization: `Bearer ${operatorSession}` };
    const memoryItemId = await recordMemoryItem(app, operatorSession, {
      privacyDomain: 'domain-journal',
      content: 'Identity-bound journal entry.',
    });

    // Claiming removes the sole-resident shortcut: operator is administration,
    // not a reader, even before another Home member exists.
    expect((await app.inject({
      method: 'GET',
      url: '/api/memory/domains/domain-journal/items',
      headers: operatorAuth,
    })).statusCode).toBe(404);

    const homeHostIdentityFingerprint = sealedClaim.claim.claimantIdentityKeyFingerprintHex;
    const grant: PicoHomeDomainReadGrantSignatureInput = {
      suite: picoIdentitySuite,
      grantId: 'grant_20260727_app_0001',
      homeId,
      hostSigningKeyFingerprintHex: sealedClaim.claim.hostSigningKeyFingerprintHex,
      privacyDomain: 'domain-journal',
      controllerPicoIdentityFingerprintHex: homeHostIdentityFingerprint,
      readerPicoIdentityFingerprintHex: homeHostIdentityFingerprint,
      ...picoTestValidityWindow(),
      lifecycleOrder: 'seq:0000000000000001',
    };
    const grantResponse = await app.inject({
      method: 'POST',
      url: '/api/home/domain-read-grants',
      headers: operatorAuth,
      payload: {
        schema: picoHomeDomainReadGrantRecordSchema,
        grant,
        issuerIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
        issuerSignatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoHomeDomainReadGrantSignatureInput(grant),
          sealedClaim.claimantPrivateKey,
        )),
      },
    });
    expect(grantResponse.statusCode).toBe(201);
    expect(grantResponse.json().grant).toMatchObject({
      grantId: grant.grantId,
      privacyDomain: grant.privacyDomain,
      status: 'active',
    });

    const deviceSigning = sodium.crypto_sign_keypair();
    const deviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput = {
      suite: picoIdentitySuite,
      keyRole: 'device_signing',
      publicKeyHex: bytesToHex(deviceSigning.publicKey),
    };
    const deviceSigningFingerprint = keyRecordFingerprintHex(deviceSigningKeyRecord);
    const deviceAgreement = sodium.crypto_box_keypair();
    const deviceAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput = {
      suite: picoIdentitySuite,
      keyRole: 'device_key_agreement',
      publicKeyHex: bytesToHex(deviceAgreement.publicKey),
    };
    const delegation: PicoIdentityDelegationSignatureInput = {
      suite: picoIdentitySuite,
      delegationId: 'delegation_20260727_app_0001',
      issuerIdentityKeyFingerprintHex: homeHostIdentityFingerprint,
      subjectSigningKeyFingerprintHex: deviceSigningFingerprint,
      subjectKeyAgreementKeyFingerprintHex: keyRecordFingerprintHex(deviceAgreementKeyRecord),
      scopes: ['surface_session'],
      ...picoTestValidityWindow(),
      lifecycleOrder: 'seq:0000000000000002',
    };
    const signedDelegation = {
      record: delegation,
      signatureHex: bytesToHex(sodium.crypto_sign_detached(
        buildPicoIdentityDelegationSignatureInput(delegation),
        sealedClaim.claimantPrivateKey,
      )),
    };

    const challengeResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/identity-challenges',
    });
    expect(challengeResponse.statusCode).toBe(201);
    const challenge = challengeResponse.json() as {
      challengeId: string;
      verifierNonceHex: string;
      verifierContext: string;
    };
    expect(challenge.verifierContext).toBe(
      `pico.home.surface-session.v1:${sealedClaim.claim.hostSigningKeyFingerprintHex}`,
    );

    /*
     * Befund B177. `parseSignedPicoIdentityRevocation` war von keinem Test
     * betreten: die Aufrufe hier schicken eine **leere** Widerrufsliste, und
     * `.map` laeuft dann nullmal.
     *
     * Ein missgebildeter Widerruf muss vor jeder Kryptografie abgewiesen
     * werden - der Auffangzweig dieser Route beantwortet ihn mit 400 und einem
     * Satz, statt ihn als Datensatz weiterzureichen. Die Herausforderung ist
     * dabei absichtlich noch nicht verbraucht: das Abweisen einer kaputten
     * Anfrage darf keinen Versuch kosten.
     */
    const withBrokenRevocation = await app.inject({
      method: 'POST',
      url: '/api/auth/identity-session',
      payload: {
        challengeId: challenge.challengeId,
        identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
        deviceSigningKeyRecord,
        deviceKeyAgreementKeyRecord: deviceAgreementKeyRecord,
        delegation: signedDelegation,
        revocations: [{ record: {}, signatureHex: 'nicht hex' }],
        possessionSignatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoIdentityPossessionSignatureInput({
            suite: picoIdentitySuite,
            subjectKeyFingerprintHex: deviceSigningFingerprint,
            verifierNonceHex: challenge.verifierNonceHex,
            verifierContext: challenge.verifierContext,
          }),
          deviceSigning.privateKey,
        )),
      },
    });
    expect(withBrokenRevocation.statusCode).toBe(400);
    expect(withBrokenRevocation.json().error).toBe('Pico identity revocation is invalid.');

    const identitySessionRequest = {
      challengeId: challenge.challengeId,
      identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
      deviceSigningKeyRecord,
      deviceKeyAgreementKeyRecord: deviceAgreementKeyRecord,
      delegation: signedDelegation,
      revocations: [],
      possessionSignatureHex: bytesToHex(sodium.crypto_sign_detached(
        buildPicoIdentityPossessionSignatureInput({
          suite: picoIdentitySuite,
          subjectKeyFingerprintHex: deviceSigningFingerprint,
          verifierNonceHex: challenge.verifierNonceHex,
          verifierContext: challenge.verifierContext,
        }),
        deviceSigning.privateKey,
      )),
    };
    const identitySessionResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/identity-session',
      payload: identitySessionRequest,
    });
    expect(identitySessionResponse.statusCode).toBe(201);
    const identitySession = identitySessionResponse.json().session as string;
    const identityAuth = { authorization: `Bearer ${identitySession}` };

    const linkRequest = async (
      operation: PicoLinkDirectOperation,
      args: Record<string, unknown>,
      sender: {
        signingKeyRecord: PicoIdentityKeyRecordSignatureInput;
        signingPrivateKey: Uint8Array;
        agreementKeyRecord: PicoIdentityKeyRecordSignatureInput;
        delegationId: string;
      } = {
        signingKeyRecord: deviceSigningKeyRecord,
        signingPrivateKey: deviceSigning.privateKey,
        agreementKeyRecord: deviceAgreementKeyRecord,
        delegationId: delegation.delegationId,
      },
    ): Promise<{
      response: PicoLinkDirectResponseSignatureInput;
      result: Record<string, unknown>;
    }> => {
      const replyKey = sodium.crypto_box_keypair();
      const createdAtMs = Date.now();
      const request = {
        suite: picoIdentitySuite,
        requestId: `linkreq_${randomHex(16)}`,
        operation,
        hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
        senderIdentityKeyFingerprintHex: homeHostIdentityFingerprint,
        senderDeviceSigningKeyFingerprintHex:
          keyRecordFingerprintHex(sender.signingKeyRecord),
        senderDeviceKeyAgreementKeyFingerprintHex: keyRecordFingerprintHex(
          sender.agreementKeyRecord,
        ),
        senderDelegationId: sender.delegationId,
        replyPublicKeyHex: bytesToHex(replyKey.publicKey),
        argumentsDigestHex: picoLinkDirectPayloadDigestHex(sodium, args),
        createdAt: new Date(createdAtMs).toISOString(),
        expiresAt: new Date(createdAtMs + 30_000).toISOString(),
      };
      const envelope = {
        schema: picoLinkDirectRequestEnvelopeSchema,
        sealedRequestHex: bytesToHex(sodium.crypto_box_seal(
          Buffer.from(JSON.stringify({
            schema: picoLinkDirectRequestEnvelopeSchema,
            request,
            senderIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
            senderDeviceSigningKeyRecord: sender.signingKeyRecord,
            arguments: args,
            senderSignatureHex: bytesToHex(sodium.crypto_sign_detached(
              buildPicoLinkDirectRequestSignatureInput(request),
              sender.signingPrivateKey,
            )),
          }), 'utf8'),
          hexToBytes(setup.host.keyAgreementPublicKeyHex),
        )),
      };
      const linked = await app.inject({
        method: 'POST',
        url: '/api/home/link',
        payload: envelope,
      });
      expect(linked.statusCode).toBe(200);
      const responseEnvelope = linked.json() as {
        schema: string;
        sealedResponseHex: string;
      };
      expect(responseEnvelope.schema).toBe(picoLinkDirectResponseEnvelopeSchema);
      const opened = JSON.parse(new TextDecoder().decode(sodium.crypto_box_seal_open(
        hexToBytes(responseEnvelope.sealedResponseHex),
        replyKey.publicKey,
        replyKey.privateKey,
      ))) as {
        response: PicoLinkDirectResponseSignatureInput;
        result: Record<string, unknown>;
        hostSignatureHex: string;
      };
      expect(opened.response.requestId).toBe(request.requestId);
      expect(opened.response.resultDigestHex)
        .toBe(picoLinkDirectPayloadDigestHex(sodium, opened.result));
      expect(sodium.crypto_sign_verify_detached(
        hexToBytes(opened.hostSignatureHex),
        buildPicoLinkDirectResponseSignatureInput(opened.response),
        hexToBytes(setup.host.signingPublicKeyHex),
      )).toBe(true);
      return opened;
    };

    const linkedStatus = await linkRequest('home.authority.list', {
      resource: 'home_state',
    });
    expect(linkedStatus.response.outcome).toBe('ok');
    expect(linkedStatus.result).toMatchObject({
      statusCode: 200,
      claimState: { state: 'claimed', homeId },
    });

    /**
     * ADR 0082 mit ADR 0130 E4. Die Leseseite der Reader-Custody-Grants, über
     * denselben Kanal wie ihre Schreibseite.
     *
     * **Leere Listen sind hier der Beweis, nicht seine Schwäche.** Geprüft
     * wird, dass das Home diese Ressourcen *ausliefert* statt sie mit
     * `unknown_authority_resource` abzulehnen - der Unterschied zwischen "es
     * gibt nichts zu sehen" und "hier kann man nicht nachsehen", und das ist
     * genau die Auskunft, die vorher fehlte.
     */
    /**
     * ADR 0130 E5, dieselbe Asymmetrie eine Ressource weiter: das Vergeben
     * ging über Link, das Beenden nicht. Geprüft wird hier nur, dass das Home
     * die Ressource **kennt** - ein leerer Datensatz wird von der Speicherung
     * abgelehnt, und genau diese Ablehnung ist der Beweis, dass sie ihn
     * angenommen und geprüft hat statt ihn nicht zu kennen.
     */
    const linkedRevocation = await linkRequest('home.authority.submit', {
      resource: 'reader_custody_reader_grant_lifecycle',
      record: {},
    });
    expect(linkedRevocation.result).not.toMatchObject({ error: 'unknown_authority_resource' });

    for (const [resource, field] of [
      ['reader_custody_domains', 'domains'],
      ['reader_custody_reader_grants', 'readerGrants'],
    ] as const) {
      const linkedReadership = await linkRequest('home.authority.list', { resource });
      expect(linkedReadership.response.outcome, resource).toBe('ok');
      expect(linkedReadership.result, resource)
        .toMatchObject({ statusCode: 200, [field]: [] });
    }

    const linkedDeviceLifecycle = await linkRequest('home.device.lifecycle.read', {});
    expect(linkedDeviceLifecycle.response.outcome).toBe('ok');
    expect(linkedDeviceLifecycle.result).toMatchObject({
      homeId,
      picoIdentityFingerprintHex: homeHostIdentityFingerprint,
      observedLifecycleOrder: delegation.lifecycleOrder,
      devices: expect.arrayContaining([
        expect.objectContaining({
          delegationId: delegation.delegationId,
          deviceSigningKeyFingerprintHex: deviceSigningFingerprint,
          status: 'active',
        }),
      ]),
    });

    const targetSigning = sodium.crypto_sign_keypair();
    const targetSigningKeyRecord: PicoIdentityKeyRecordSignatureInput = {
      suite: picoIdentitySuite,
      keyRole: 'device_signing',
      publicKeyHex: bytesToHex(targetSigning.publicKey),
    };
    const targetAgreement = sodium.crypto_box_keypair();
    const targetAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput = {
      suite: picoIdentitySuite,
      keyRole: 'device_key_agreement',
      publicKeyHex: bytesToHex(targetAgreement.publicKey),
    };
    const targetDelegation: PicoIdentityDelegationSignatureInput = {
      suite: picoIdentitySuite,
      delegationId: 'delegation_20260730_link_lifecycle_target',
      issuerIdentityKeyFingerprintHex: homeHostIdentityFingerprint,
      subjectSigningKeyFingerprintHex: keyRecordFingerprintHex(targetSigningKeyRecord),
      subjectKeyAgreementKeyFingerprintHex: keyRecordFingerprintHex(targetAgreementKeyRecord),
      scopes: ['surface_session'],
      ...picoTestValidityWindow(),
      lifecycleOrder: 'seq:0000000000000003',
    };
    const transitionCreatedAt = Date.now();
    const lifecycleEvidence = {
      transitionId: 'transition_20260730_link_lifecycle_target',
      action: 'enroll' as const,
      picoIdentityFingerprintHex: homeHostIdentityFingerprint,
      targetDelegationId: targetDelegation.delegationId,
      targetDeviceSigningKeyFingerprintHex:
        keyRecordFingerprintHex(targetSigningKeyRecord),
      targetDeviceKeyAgreementKeyFingerprintHex:
        keyRecordFingerprintHex(targetAgreementKeyRecord),
      replacedDelegationId: null,
      observedLifecycleOrder: delegation.lifecycleOrder,
      identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
      targetDeviceSigningKeyRecord: targetSigningKeyRecord,
      targetDeviceKeyAgreementKeyRecord: targetAgreementKeyRecord,
      delegation: {
        record: targetDelegation,
        signatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoIdentityDelegationSignatureInput(targetDelegation),
          sealedClaim.claimantPrivateKey,
        )),
      },
      revocations: [],
    };
    const targetActivation = {
      suite: picoIdentitySuite,
      activationId: lifecycleEvidence.transitionId,
      action: 'enroll' as const,
      homeId,
      hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
      picoIdentityFingerprintHex: homeHostIdentityFingerprint,
      sponsorDelegationId: delegation.delegationId,
      sponsorDeviceSigningKeyFingerprintHex: deviceSigningFingerprint,
      sponsorDeviceKeyAgreementKeyFingerprintHex:
        keyRecordFingerprintHex(deviceAgreementKeyRecord),
      targetDelegationId: targetDelegation.delegationId,
      targetDeviceSigningKeyFingerprintHex:
        keyRecordFingerprintHex(targetSigningKeyRecord),
      targetDeviceKeyAgreementKeyFingerprintHex:
        keyRecordFingerprintHex(targetAgreementKeyRecord),
      lifecycleEvidenceDigestHex:
        picoHomeDeviceLifecycleEvidenceDigestHex(sodium, lifecycleEvidence),
      observedLifecycleOrder: delegation.lifecycleOrder,
      createdAt: new Date(transitionCreatedAt).toISOString(),
      expiresAt: new Date(transitionCreatedAt + 5 * 60_000).toISOString(),
    };
    const linkedLifecycleSubmit = await linkRequest(
      'home.device.lifecycle.submit',
      {
        submission: {
          schema: picoHomeDeviceLifecycleSubmissionSchema,
          evidence: lifecycleEvidence,
          activation: {
            input: targetActivation,
            targetSignatureHex: bytesToHex(sodium.crypto_sign_detached(
              buildPicoHomeDeviceActivationSignatureInput(targetActivation),
              targetSigning.privateKey,
            )),
          },
        },
      },
    );
    expect(linkedLifecycleSubmit.response.outcome).toBe('ok');
    expect(linkedLifecycleSubmit.result).toMatchObject({
      inserted: true,
      record: {
        receipt: {
          transitionId: lifecycleEvidence.transitionId,
          acceptedLifecycleOrder: delegation.lifecycleOrder,
          resultingLifecycleOrder: targetDelegation.lifecycleOrder,
          leavesNoActiveDevice: false,
        },
      },
    });

    const invalidLifecycleSubmit = await linkRequest(
      'home.device.lifecycle.submit',
      {},
    );
    expect(invalidLifecycleSubmit.response.outcome).toBe('invalid_arguments');
    expect(invalidLifecycleSubmit.result).toEqual({});

    const recoverySigning = sodium.crypto_sign_keypair();
    const recoverySigningKeyRecord: PicoIdentityKeyRecordSignatureInput = {
      suite: picoIdentitySuite,
      keyRole: 'device_signing',
      publicKeyHex: bytesToHex(recoverySigning.publicKey),
    };
    const recoveryAgreement = sodium.crypto_box_keypair();
    const recoveryAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput = {
      suite: picoIdentitySuite,
      keyRole: 'device_key_agreement',
      publicKeyHex: bytesToHex(recoveryAgreement.publicKey),
    };
    const recoveryDelegation: PicoIdentityDelegationSignatureInput = {
      suite: picoIdentitySuite,
      delegationId: 'delegation_20260731_link_recovery_target',
      issuerIdentityKeyFingerprintHex: homeHostIdentityFingerprint,
      subjectSigningKeyFingerprintHex:
        keyRecordFingerprintHex(recoverySigningKeyRecord),
      subjectKeyAgreementKeyFingerprintHex:
        keyRecordFingerprintHex(recoveryAgreementKeyRecord),
      scopes: ['surface_session'],
      validFrom: new Date(Date.now() - 1_000).toISOString(),
      validUntil: new Date(
        Date.now() + 365 * 24 * 60 * 60_000,
      ).toISOString(),
      lifecycleOrder: 'seq:0000000000000004',
    };
    const recoveryRevokedAt = new Date().toISOString();
    const recoveryRevocations: {
      record: PicoIdentityRevocationSignatureInput;
      signatureHex: string;
    }[] = [
      {
        record: {
          suite: picoIdentitySuite,
          revocationId:
            'revocation_20260731_link_recovery_first_device',
          issuerIdentityKeyFingerprintHex: homeHostIdentityFingerprint,
          subjectKind: 'delegation',
          subjectRef: sealedClaim.claim.firstDeviceDelegationId,
          reasonCategory: 'lost_device',
          revokedAt: recoveryRevokedAt,
          lifecycleOrder: 'seq:0000000000000005',
        },
        signatureHex: '',
      },
      {
        record: {
          suite: picoIdentitySuite,
          revocationId:
            'revocation_20260731_link_recovery_sponsor',
          issuerIdentityKeyFingerprintHex: homeHostIdentityFingerprint,
          subjectKind: 'delegation',
          subjectRef: delegation.delegationId,
          reasonCategory: 'lost_device',
          revokedAt: recoveryRevokedAt,
          lifecycleOrder: 'seq:0000000000000006',
        },
        signatureHex: '',
      },
      {
        record: {
          suite: picoIdentitySuite,
          revocationId:
            'revocation_20260731_link_recovery_enrolled',
          issuerIdentityKeyFingerprintHex: homeHostIdentityFingerprint,
          subjectKind: 'delegation',
          subjectRef: targetDelegation.delegationId,
          reasonCategory: 'lost_device',
          revokedAt: recoveryRevokedAt,
          lifecycleOrder: 'seq:0000000000000007',
        },
        signatureHex: '',
      },
    ];
    for (const revocation of recoveryRevocations) {
      revocation.signatureHex = bytesToHex(sodium.crypto_sign_detached(
        buildPicoIdentityRevocationSignatureInput(revocation.record),
        sealedClaim.claimantPrivateKey,
      ));
    }
    const recoveryEvidence = {
      identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
      targetDeviceSigningKeyRecord: recoverySigningKeyRecord,
      targetDeviceKeyAgreementKeyRecord: recoveryAgreementKeyRecord,
      delegation: {
        record: recoveryDelegation,
        signatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoIdentityDelegationSignatureInput(recoveryDelegation),
          sealedClaim.claimantPrivateKey,
        )),
      },
      revocations: recoveryRevocations,
    };
    const recoveryCreatedAtMs = Date.now();
    const recoveryClaim = {
      suite: picoIdentitySuite,
      recoveryId: 'recovery_20260731_link_veto',
      homeId,
      hostSigningKeyFingerprintHex:
        setup.host.signingKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex:
        setup.host.keyAgreementKeyFingerprintHex,
      picoIdentityFingerprintHex: homeHostIdentityFingerprint,
      targetDelegationId: recoveryDelegation.delegationId,
      targetDeviceSigningKeyFingerprintHex:
        recoveryDelegation.subjectSigningKeyFingerprintHex,
      targetDeviceKeyAgreementKeyFingerprintHex:
        recoveryDelegation.subjectKeyAgreementKeyFingerprintHex,
      evidenceDigestHex:
        picoHomeDeviceRecoveryEvidenceDigestHex(
          sodium,
          recoveryEvidence,
        ),
      observedLifecycleOrder: targetDelegation.lifecycleOrder,
      createdAt: new Date(recoveryCreatedAtMs).toISOString(),
      expiresAt: new Date(
        recoveryCreatedAtMs + 5 * 60_000,
      ).toISOString(),
    };
    const recoveryClaimInput =
      buildPicoHomeDeviceRecoveryClaimSignatureInput(recoveryClaim);
    const recoverySubmission = {
      schema: picoHomeDeviceRecoverySubmissionSchema,
      claim: recoveryClaim,
      evidence: recoveryEvidence,
      rootSignatureHex: bytesToHex(sodium.crypto_sign_detached(
        recoveryClaimInput,
        sealedClaim.claimantPrivateKey,
      )),
      targetSignatureHex: bytesToHex(sodium.crypto_sign_detached(
        recoveryClaimInput,
        recoverySigning.privateKey,
      )),
    };
    const linkedRecovery = await linkRequest(
      'home.device.recovery.submit',
      {
        phase: 'initiate',
        submission: recoverySubmission,
      },
      {
        signingKeyRecord: recoverySigningKeyRecord,
        signingPrivateKey: recoverySigning.privateKey,
        agreementKeyRecord: recoveryAgreementKeyRecord,
        delegationId: recoveryDelegation.delegationId,
      },
    );
    expect(linkedRecovery.response.outcome).toBe('recovery_pending');
    expect(linkedRecovery.result).toMatchObject({
      status: 'pending',
      recoveryId: recoveryClaim.recoveryId,
      targetDelegationId: recoveryDelegation.delegationId,
    });
    const linkedPendingRead = await linkRequest(
      'home.device.lifecycle.read',
      {},
    );
    expect(linkedPendingRead.result).toMatchObject({
      pendingRecovery: {
        recoveryId: recoveryClaim.recoveryId,
        targetDelegationId: recoveryDelegation.delegationId,
      },
    });
    const linkedVeto = await linkRequest(
      'home.device.recovery.veto',
      { recoveryId: recoveryClaim.recoveryId },
    );
    expect(linkedVeto.response.outcome).toBe('ok');
    expect(linkedVeto.result).toEqual({ status: 'vetoed' });
    expect((await linkRequest(
      'home.device.lifecycle.read',
      {},
    )).result).toMatchObject({ pendingRecovery: null });

    const checkedAtMs = Date.now();
    const checkpoint: PicoIdentityReaderKeyFreshnessSignatureInput = {
      suite: picoIdentitySuite,
      checkpointId: 'checkpoint_link_app_0001',
      homeId,
      issuerIdentityKeyFingerprintHex: homeHostIdentityFingerprint,
      deviceSigningKeyFingerprintHex: deviceSigningFingerprint,
      deviceKeyAgreementKeyFingerprintHex: keyRecordFingerprintHex(deviceAgreementKeyRecord),
      delegationId: delegation.delegationId,
      status: 'current',
      observedThroughLifecycleOrder: delegation.lifecycleOrder,
      checkedAt: new Date(checkedAtMs).toISOString(),
      freshUntil: new Date(checkedAtMs + 4 * 60_000).toISOString(),
    };
    const linkedCheckpoint = await linkRequest('home.authority.submit', {
      resource: 'reader_key_freshness_checkpoint',
      record: {
        schema: picoIdentityReaderKeyFreshnessCheckpointSchema,
        checkpoint,
        issuerIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
        issuerSignatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoIdentityReaderKeyFreshnessSignatureInput(checkpoint),
          sealedClaim.claimantPrivateKey,
        )),
      },
    });
    expect(linkedCheckpoint.response.outcome).toBe('ok');
    expect(linkedCheckpoint.result).toEqual({ statusCode: 202, accepted: true });

    // The challenge is spent. The founding Home Host Pico can relay signed
    // Home-authority evidence, but still gains content only through its
    // explicitly granted domain.
    expect((await app.inject({
      method: 'POST',
      url: '/api/auth/identity-session',
      payload: identitySessionRequest,
    })).statusCode).toBe(401);
    expect((await app.inject({
      method: 'GET',
      url: '/api/home/domain-read-grants',
      headers: identityAuth,
    })).statusCode).toBe(200);
    expect((await app.inject({
      method: 'GET',
      url: '/api/home/reader-custody/reader-grants',
      headers: identityAuth,
    })).statusCode).toBe(200);
    expect((await app.inject({
      method: 'GET',
      url: '/api/home/reader-custody/kek-rotations',
      headers: identityAuth,
    })).statusCode).toBe(200);

    // An ordinary active Home member has a valid identity session and may read
    // only granted domains; it must not become a confused deputy for Home
    // administration merely because its evidence is accepted by this host.
    const memberIdentity = sodium.crypto_sign_keypair();
    const memberIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput = {
      suite: picoIdentitySuite,
      keyRole: 'pico_identity',
      publicKeyHex: bytesToHex(memberIdentity.publicKey),
    };
    const memberIdentityFingerprintHex = keyRecordFingerprintHex(memberIdentityKeyRecord);
    const memberMembership: PicoHomeMembershipSignatureInput = {
      suite: picoIdentitySuite,
      credentialId: 'member_confused_deputy_20260727',
      homeId,
      issuerPicoIdentityFingerprintHex: homeHostIdentityFingerprint,
      subjectPicoIdentityFingerprintHex: memberIdentityFingerprintHex,
      hostSigningKeyFingerprintHex: sealedClaim.claim.hostSigningKeyFingerprintHex,
      role: 'home_member',
      scopes: ['host.use'],
      ...picoTestValidityWindow(),
      lifecycleOrder: 'seq:0000000000000001',
    };
    const memberAccepted = await app.inject({
      method: 'POST',
      url: '/api/home/memberships',
      headers: operatorAuth,
      payload: {
        schema: picoHomeMembershipCredentialSchema,
        membership: memberMembership,
        issuerIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
        issuerSignatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoHomeMembershipSignatureInput(memberMembership),
          sealedClaim.claimantPrivateKey,
        )),
      },
    });
    expect(memberAccepted.statusCode).toBe(201);
    const memberSession = (await createPicoIdentitySessionDevice(app, {
      identityKeyRecord: memberIdentityKeyRecord,
      identityPrivateKey: memberIdentity.privateKey,
      idSuffix: 'confused_deputy_20260727',
    })).session;
    expect((await app.inject({
      method: 'GET',
      url: '/api/home/domain-read-grants',
      headers: { authorization: `Bearer ${memberSession}` },
    })).statusCode).toBe(401);
    expect((await app.inject({
      method: 'GET',
      url: '/api/home/reader-custody/reader-grants',
      headers: { authorization: `Bearer ${memberSession}` },
    })).statusCode).toBe(401);
    expect((await app.inject({
      method: 'GET',
      url: '/api/home/reader-custody/kek-rotations',
      headers: { authorization: `Bearer ${memberSession}` },
    })).statusCode).toBe(401);

    expect((await app.inject({
      method: 'GET',
      url: '/api/memory/domains/domain-other/items',
      headers: identityAuth,
    })).statusCode).toBe(404);

    const readable = await app.inject({
      method: 'GET',
      url: `/api/memory/domains/domain-journal/items/${memoryItemId}`,
      headers: identityAuth,
    });
    expect(readable.statusCode).toBe(200);
    expect(readable.json().content).toBe('Identity-bound journal entry.');
    // ADR 0116 W2: the class travels with the content over HTTP, or a reader
    // holds text it cannot classify. This item was written under an operator
    // session, which W2 puts at the floor.
    expect(readable.json().origin).toBe('unattributed');

    const lifecycle: PicoHomeDomainReadGrantLifecycleSignatureInput = {
      suite: picoIdentitySuite,
      lifecycleId: 'grant_lifecycle_20260727_app_0001',
      grantId: grant.grantId,
      homeId,
      hostSigningKeyFingerprintHex: grant.hostSigningKeyFingerprintHex,
      privacyDomain: grant.privacyDomain,
      controllerPicoIdentityFingerprintHex: grant.controllerPicoIdentityFingerprintHex,
      readerPicoIdentityFingerprintHex: grant.readerPicoIdentityFingerprintHex,
      status: 'revoked',
      reasonCategory: 'reader_removed',
      changedAt: '2026-08-01T00:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000002',
    };
    const revoked = await app.inject({
      method: 'POST',
      url: '/api/home/domain-read-grant-lifecycle',
      headers: operatorAuth,
      payload: {
        schema: picoHomeDomainReadGrantLifecycleRecordSchema,
        lifecycle,
        issuerIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
        issuerSignatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoHomeDomainReadGrantLifecycleSignatureInput(lifecycle),
          sealedClaim.claimantPrivateKey,
        )),
      },
    });
    expect(revoked.statusCode).toBe(201);
    expect(revoked.json().grant.status).toBe('revoked');

    /*
     * Befund B177. `domainReadGrantFailureStatus` bildet eine Ablehnung auf
     * einen Status ab, und **kein Test betrat diese Funktion** - gemessen,
     * indem sie zu einer Ausnahme gemacht wurde und der ganze Kernlauf
     * trotzdem gruen blieb. Beide Zweige gehen hier:
     *
     * Ein Datensatz mit falscher Unterschrift ist **401** und nicht 400: der
     * Client hat sich nicht vertan, er hat keine Vollmacht. Und ein Lebenslauf
     * fuer eine Zuteilung, die dieses Home nie aufgezeichnet hat, ist **409** -
     * ein Widerspruch zum Bestand, keine kaputte Anfrage.
     */
    const forged = await app.inject({
      method: 'POST',
      url: '/api/home/domain-read-grants',
      headers: operatorAuth,
      payload: {
        schema: picoHomeDomainReadGrantRecordSchema,
        grant,
        issuerIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
        issuerSignatureHex: 'a'.repeat(128),
      },
    });
    expect(forged.statusCode).toBe(401);
    expect(forged.json().error).toBe('invalid_issuer_signature');

    const orphanLifecycle = {
      ...lifecycle,
      lifecycleId: 'grant_lifecycle_app_orphan',
      grantId: 'grant_never_recorded',
    };
    const orphan = await app.inject({
      method: 'POST',
      url: '/api/home/domain-read-grant-lifecycle',
      headers: operatorAuth,
      payload: {
        schema: picoHomeDomainReadGrantLifecycleRecordSchema,
        lifecycle: orphanLifecycle,
        issuerIdentityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
        issuerSignatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoHomeDomainReadGrantLifecycleSignatureInput(orphanLifecycle),
          sealedClaim.claimantPrivateKey,
        )),
      },
    });
    expect(orphan.statusCode).toBe(409);
    expect(orphan.json().error).toBe('unknown_grant');

    /*
     * Befund B177, zweite Haelfte. Die **Umschlagrouten fuhr kein Test** -
     * `share-envelope.test.ts` prueft die Klasse, nicht die Flaeche, und
     * `shareEnvelopeFailureStatus` war damit nie betreten.
     *
     * Zwei Zweige, zwei verschiedene Saetze an den Client: eine Anfrage ohne
     * brauchbare Felder ist **400** - der Client hat sich vertan. Eine
     * Ausstellung, die es nicht (mehr) gibt, ist **404** - er fragt nach etwas,
     * das dieses Home nicht kennt. Beides als 409 zu beantworten waere
     * bequemer und saegte dem Client die Auskunft ab.
     */
    const malformedIssuance = await app.inject({
      method: 'POST',
      url: '/api/home/share-envelopes',
      headers: operatorAuth,
      payload: {},
    });
    expect(malformedIssuance.statusCode).toBe(400);
    expect(malformedIssuance.json().error).toBe('invalid_request');

    const unknownIssuance = await app.inject({
      method: 'POST',
      url: '/api/home/share-envelopes',
      headers: operatorAuth,
      payload: {
        issuanceId: 'issuance_never_prepared',
        issuerSignatureHex: 'b'.repeat(128),
      },
    });
    expect(unknownIssuance.statusCode).toBe(404);
    expect(unknownIssuance.json().error).toBe('unknown_or_expired_issuance');
    expect((await app.inject({
      method: 'GET',
      url: `/api/memory/domains/domain-journal/items/${memoryItemId}`,
      headers: identityAuth,
    })).statusCode).toBe(404);

    const events = await app.inject({ method: 'GET', url: '/api/events', headers: operatorAuth });
    const grantEvents = (events.json().events as { type: string; payload: unknown }[])
      .filter((event) => event.type.startsWith('home.domain_read_'));
    expect(grantEvents).toEqual([
      {
        type: 'home.domain_read_granted',
        payload: {
          grantId: grant.grantId,
          privacyDomain: grant.privacyDomain,
          readerPicoIdentityFingerprintHex: homeHostIdentityFingerprint,
        },
        eventId: expect.any(String),
        deviceId: 'test-core',
        lamport: expect.any(Number),
        wallTime: expect.any(String),
        stream: 'device:test-core',
      },
      {
        type: 'home.domain_read_revoked',
        payload: {
          grantId: grant.grantId,
          lifecycleId: lifecycle.lifecycleId,
          privacyDomain: grant.privacyDomain,
          readerPicoIdentityFingerprintHex: homeHostIdentityFingerprint,
        },
        eventId: expect.any(String),
        deviceId: 'test-core',
        lamport: expect.any(Number),
        wallTime: expect.any(String),
        stream: 'device:test-core',
      },
    ]);

    await app.close();
  });

  it('throttles repeated failed logins without locking the operator out', async () => {
    const app = await buildAppWithCapturedLog();
    const bootstrapCode = readBootstrapCode(app);
    expect((await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode, passphrase: OPERATOR_PASSPHRASE },
    })).statusCode).toBe(201);

    // The bounded verification queue caps memory, not attempts; without a
    // throttle the passphrase can be ground at the rate of one KDF run.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const failed = await app.inject({
        method: 'POST',
        url: '/api/auth/session',
        payload: { passphrase: 'definitely not the passphrase' },
      });
      expect(failed.statusCode).toBe(401);
    }

    const throttled = await app.inject({
      method: 'POST',
      url: '/api/auth/session',
      payload: { passphrase: 'definitely not the passphrase' },
    });
    expect(throttled.statusCode).toBe(429);
    expect(throttled.headers['retry-after']).toBe('1');

    // The correct passphrase is throttled too - the endpoint cannot tell them
    // apart before the KDF, which is the point.
    expect((await app.inject({
      method: 'POST',
      url: '/api/auth/session',
      payload: { passphrase: OPERATOR_PASSPHRASE },
    })).statusCode).toBe(429);

    // Failed logins never reach the append-only log (ADR 0075 A9).
    const session = (await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode, passphrase: OPERATOR_PASSPHRASE },
    })).statusCode;
    expect(session).toBe(404);

    await app.close();
  });

  it('cuts live realtime connections when their session is revoked', async () => {
    const app = await buildAppWithCapturedLog();
    const bootstrapCode = readBootstrapCode(app);
    const bootstrapped = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode, passphrase: OPERATOR_PASSPHRASE },
    });
    expect(bootstrapped.statusCode).toBe(201);
    const stolenSession = bootstrapped.json().session as string;

    let initial: Promise<unknown> | null = null;
    const socket = await app.injectWS('/ws', {
      headers: { authorization: `Bearer ${stolenSession}` },
    }, { onInit(ws) { initial = readSocketJson(ws as unknown as TestWebSocket); } });

    try {
      expect(await requireMessagePromise(initial)).toMatchObject({ type: realtimeMessageType.coreConnected });

      const closed = new Promise<void>((resolve) => {
        (socket as unknown as { once(event: 'close', listener: () => void): void }).once('close', resolve);
      });

      // Revoking every session must reach the live stream too, or the stolen
      // credential keeps reading the Foundation until the process restarts.
      expect((await app.inject({
        method: 'DELETE',
        url: '/api/auth/sessions',
        headers: { authorization: `Bearer ${stolenSession}` },
      })).statusCode).toBe(200);

      await closed;

      // The Foundation carries on for a legitimate operator; the cut connection
      // sees none of it.
      const relogin = await app.inject({
        method: 'POST',
        url: '/api/auth/session',
        payload: { passphrase: OPERATOR_PASSPHRASE },
      });
      expect(relogin.statusCode).toBe(201);
      const appended = await app.inject({
        method: 'POST',
        url: '/api/events',
        headers: { authorization: `Bearer ${relogin.json().session as string}` },
        payload: { deviceId: 'probe-device', type: 'message.created', payload: { role: 'user', text: 'after revocation' } },
      });
      expect(appended.statusCode).toBe(201);
      await expect(readSocketJson(socket as unknown as TestWebSocket)).rejects.toThrow(/Timed out|closed/i);
    } finally {
      socket.terminate();
      await app.close();
    }
  });

  it('cuts a ticket-opened connection when the session behind the ticket is revoked', async () => {
    const app = await buildAppWithCapturedLog();
    const bootstrapCode = readBootstrapCode(app);
    const session = (await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode, passphrase: OPERATOR_PASSPHRASE },
    })).json().session as string;

    // A browser cannot set handshake headers, so it presents a ticket. The
    // ticket is single-use and spent at the handshake; the connection must
    // still inherit the session it was minted under.
    const ticketResponse = await app.inject({
      method: 'POST',
      url: '/api/realtime/tickets',
      headers: { authorization: `Bearer ${session}` },
    });
    expect(ticketResponse.statusCode).toBe(201);
    const ticket = ticketResponse.json().ticket as string;

    let initial: Promise<unknown> | null = null;
    const socket = await app.injectWS(`/ws?ticket=${encodeURIComponent(ticket)}`, {}, {
      onInit(ws) { initial = readSocketJson(ws as unknown as TestWebSocket); },
    });

    try {
      expect(await requireMessagePromise(initial)).toMatchObject({ type: realtimeMessageType.coreConnected });

      const closed = new Promise<void>((resolve) => {
        (socket as unknown as { once(event: 'close', listener: () => void): void }).once('close', resolve);
      });

      expect((await app.inject({
        method: 'DELETE',
        url: '/api/auth/session',
        headers: { authorization: `Bearer ${session}` },
      })).statusCode).toBe(204);

      await closed;
    } finally {
      socket.terminate();
      await app.close();
    }
  });

  it('accepts a minted realtime ticket for one websocket upgrade only', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });
    await app.ready();

    const ticket = await mintRealtimeTicket(app);
    let initialMessage: Promise<unknown> | null = null;
    const socket = await app.injectWS(`/ws?ticket=${encodeURIComponent(ticket)}`, {}, { onInit(ws) { initialMessage = readSocketJson(ws as unknown as TestWebSocket); } });

    try {
      const message = await requireMessagePromise(initialMessage);
      expect(message).toEqual({ type: realtimeMessageType.coreConnected, deviceId: 'test-core' });
    } finally {
      socket.terminate();
    }

    await expect(app.injectWS(`/ws?ticket=${encodeURIComponent(ticket)}`)).rejects.toThrow('Unexpected server response: 401');
    await app.close();
  });

  it('rejects expired realtime tickets before websocket upgrade', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-09T12:00:00.000Z'));

    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });
    await app.ready();

    const ticket = await mintRealtimeTicket(app);
    vi.setSystemTime(new Date('2026-07-09T12:00:31.000Z'));

    await expect(app.injectWS(`/ws?ticket=${encodeURIComponent(ticket)}`)).rejects.toThrow('Unexpected server response: 401');
    await app.close();
  });

  it('keeps the websocket Origin check ahead of realtime ticket validation', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });
    await app.ready();

    const ticket = await mintRealtimeTicket(app);
    await expect(app.injectWS(`/ws?ticket=${encodeURIComponent(ticket)}`, {
      headers: {
        host: 'localhost:3100',
        origin: 'http://evil.example.test',
      },
    })).rejects.toThrow('Unexpected server response: 403');

    let initialMessage: Promise<unknown> | null = null;
    const socket = await app.injectWS(`/ws?ticket=${encodeURIComponent(ticket)}`, {
      headers: {
        host: 'localhost:3100',
        origin: 'http://localhost:3100',
      },
    }, { onInit(ws) { initialMessage = readSocketJson(ws as unknown as TestWebSocket); } });

    try {
      const message = await requireMessagePromise(initialMessage);
      expect(message).toEqual({ type: realtimeMessageType.coreConnected, deviceId: 'test-core' });
    } finally {
      socket.terminate();
      await app.close();
    }
  });

  it('broadcasts inserted events to websocket clients', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });
    await app.ready();
    let initialMessage: Promise<unknown> | null = null;
    const socket = await app.injectWS('/ws', {}, { onInit(ws) { initialMessage = readSocketJson(ws as unknown as TestWebSocket); } });
    try {
      await requireMessagePromise(initialMessage);
      const broadcastPromise = readSocketJson(socket as unknown as TestWebSocket);
      const created = await app.inject({ method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', sessionId: 'session-1', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } } });
      expect(created.statusCode).toBe(201);
      const broadcast = await broadcastPromise;
      const createdBody = created.json();
      expect(broadcast).toEqual({ type: realtimeMessageType.eventCreated, event: createdBody.event });
    } finally {
      socket.terminate();
      await app.close();
    }
  });

  it('creates and lists events', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });
    const created = await app.inject({ method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', sessionId: 'session-1', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } } });
    expect(created.statusCode).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    const createdBody = created.json();
    expect(createdBody.appendResult).toBe('inserted');
    expect(createdBody.event.deviceId).toBe('desktop-dev');
    expect(createdBody.event.type).toBe('message.created');
    expect(createdBody.event.lamport).toBe(1);
    expect(createdBody.event.stream).toBe('session:session-1');

    const listed = await app.inject({ method: 'GET', url: '/api/events' });
    expect(listed.statusCode).toBe(200);
    expect(listed.headers['cache-control']).toBe('no-store');
    const listedBody = listed.json();
    expect(listedBody.events).toHaveLength(1);
    expect(listedBody.events[0].payload.text).toBe('Hallo Pico');
    await app.close();
  });

  it('continues Lamport order from persisted events', async () => {
    const databasePath = createDatabasePath();
    const firstApp = await buildApp({ host: '127.0.0.1', port: 0, databasePath, deviceId: 'test-core' });
    await firstApp.inject({ method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'First' } } });
    await firstApp.close();

    const secondApp = await buildApp({ host: '127.0.0.1', port: 0, databasePath, deviceId: 'test-core' });
    const response = await secondApp.inject({ method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'Second' } } });
    expect(response.statusCode).toBe(201);
    expect(response.json().event.lamport).toBe(2);
    await secondApp.close();
  });

  it('bootstraps an operator once through the per-process code and audits it', async () => {
    const app = await buildAppWithCapturedLog();
    const bootstrapCode = readBootstrapCode(app);

    // A wrong code never reaches the KDF.
    const wrongCode = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode: 'not-the-code', passphrase: OPERATOR_PASSPHRASE },
    });
    expect(wrongCode.statusCode).toBe(401);

    const bootstrapped = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode, passphrase: OPERATOR_PASSPHRASE },
    });
    expect(bootstrapped.statusCode).toBe(201);
    expect(bootstrapped.json().session).toEqual(expect.any(String));

    // Single use, and the route disappears once an operator exists.
    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode, passphrase: 'a completely different one' },
    });
    expect(replay.statusCode).toBe(404);

    const session = bootstrapped.json().session as string;
    const events = await app.inject({
      method: 'GET',
      url: '/api/events',
      headers: { authorization: `Bearer ${session}` },
    });
    const audit = (events.json().events as { type: string; payload: unknown }[])
      .filter((event) => event.type === 'auth.operator_bootstrapped');
    expect(audit).toHaveLength(1);
    // The audit record carries no credential material at all.
    expect(audit[0].payload).toEqual({});

    await app.close();
  });

  it('logs in with the operator passphrase and rejects a wrong one the same way as an absent operator', async () => {
    const app = await bootstrappedApp();

    const wrong = await app.inject({ method: 'POST', url: '/api/auth/session', payload: { passphrase: 'wrong passphrase!!' } });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ error: 'Foundation operator credentials are invalid.' });

    const login = await app.inject({ method: 'POST', url: '/api/auth/session', payload: { passphrase: OPERATOR_PASSPHRASE } });
    expect(login.statusCode).toBe(201);

    const session = login.json().session as string;
    const probe = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { authorization: `Bearer ${session}` } });
    expect(probe.statusCode).toBe(200);
    expect(probe.json().expiresAt).toEqual(expect.any(String));

    // An unbootstrapped host answers a login exactly like a wrong passphrase.
    const fresh = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });
    const noOperator = await fresh.inject({ method: 'POST', url: '/api/auth/session', payload: { passphrase: OPERATOR_PASSPHRASE } });
    expect(noOperator.statusCode).toBe(401);
    expect(noOperator.json()).toEqual(wrong.json());

    await fresh.close();
    await app.close();
  });

  it('revokes sessions individually and globally', async () => {
    const app = await bootstrappedApp();
    const first = await login(app);
    const second = await login(app);

    const loggedOut = await app.inject({ method: 'DELETE', url: '/api/auth/session', headers: { authorization: `Bearer ${first}` } });
    expect(loggedOut.statusCode).toBe(204);
    expect((await probeSession(app, first)).statusCode).toBe(401);
    expect((await probeSession(app, second)).statusCode).toBe(200);

    // Two remain: the session bootstrap issued, and `second`.
    const revokedAll = await app.inject({ method: 'DELETE', url: '/api/auth/sessions', headers: { authorization: `Bearer ${second}` } });
    expect(revokedAll.statusCode).toBe(200);
    expect(revokedAll.json()).toEqual({ revokedSessions: 2 });
    expect((await probeSession(app, second)).statusCode).toBe(401);

    await app.close();
  });

  it('requires the current passphrase to change it and ends every session afterwards', async () => {
    const app = await bootstrappedApp();
    const session = await login(app);

    const wrongCurrent = await app.inject({
      method: 'PUT',
      url: '/api/auth/credential',
      headers: { authorization: `Bearer ${session}` },
      payload: { currentPassphrase: 'not the current one', passphrase: 'a replacement passphrase' },
    });
    expect(wrongCurrent.statusCode).toBe(401);
    expect((await probeSession(app, session)).statusCode).toBe(200);

    const changed = await app.inject({
      method: 'PUT',
      url: '/api/auth/credential',
      headers: { authorization: `Bearer ${session}` },
      payload: { currentPassphrase: OPERATOR_PASSPHRASE, passphrase: 'a replacement passphrase' },
    });
    expect(changed.statusCode).toBe(200);

    // Replacing the credential ends every session, including the caller's.
    expect((await probeSession(app, session)).statusCode).toBe(401);

    const relogin = await app.inject({ method: 'POST', url: '/api/auth/session', payload: { passphrase: 'a replacement passphrase' } });
    expect(relogin.statusCode).toBe(201);

    const events = await app.inject({
      method: 'GET',
      url: '/api/events',
      headers: { authorization: `Bearer ${relogin.json().session as string}` },
    });
    const types = (events.json().events as { type: string }[]).map((event) => event.type);
    expect(types).toContain('auth.credential_changed');
    expect(types).toContain('auth.sessions_revoked');

    await app.close();
  });

  it('keeps the static token below administration: it may read diagnostics but never reach host-admin', async () => {
    const app = await buildAppWithCapturedLog({ foundationToken: 'dev-token' });

    const bootstrapCode = readBootstrapCode(app);
    // The bootstrap and login surfaces must be reachable without the static
    // token, or the token would gate the principal that outranks it.
    const bootstrapped = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode, passphrase: OPERATOR_PASSPHRASE },
    });
    expect(bootstrapped.statusCode).toBe(201);

    // The token still reaches diagnostics.
    const diagnostics = await app.inject({
      method: 'GET',
      url: '/api/system/status',
      headers: { authorization: 'Bearer dev-token' },
    });
    expect(diagnostics.statusCode).toBe(200);

    // It never reaches administration: that is the ADR 0075 ceiling.
    const adminWithToken = await app.inject({
      method: 'DELETE',
      url: '/api/auth/sessions',
      headers: { authorization: 'Bearer dev-token' },
    });
    expect(adminWithToken.statusCode).toBe(401);
    expect(adminWithToken.json()).toEqual({ error: 'Foundation operator session is required.' });
    expect((await app.inject({
      method: 'GET',
      url: '/api/home/reader-custody/domains',
      headers: { authorization: 'Bearer dev-token' },
    })).statusCode).toBe(401);

    // Before a Home exists, even the local operator has no Home authority to
    // relay. This distinguishes local host infrastructure from Home control.
    const opaqueDomains = await app.inject({
      method: 'GET',
      url: '/api/home/reader-custody/domains',
      headers: { authorization: `Bearer ${bootstrapped.json().session as string}` },
    });
    expect(opaqueDomains.statusCode).toBe(401);
    const adminWithSession = await app.inject({
      method: 'DELETE',
      url: '/api/auth/sessions',
      headers: { authorization: `Bearer ${bootstrapped.json().session as string}` },
    });
    expect(adminWithSession.statusCode).toBe(200);

    await app.close();
  });

  it('requires a credential for diagnostics once an operator exists, even without a token', async () => {
    const open = await buildAppWithCapturedLog();

    // Nothing claims this host yet: trusted-local behaviour is unchanged.
    expect((await open.inject({ method: 'GET', url: '/api/system/version' })).statusCode).toBe(200);

    const bootstrapped = await open.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode: readBootstrapCode(open), passphrase: OPERATOR_PASSPHRASE },
    });
    expect(bootstrapped.statusCode).toBe(201);

    // Establishing an operator is an explicit act: the API now needs one.
    const anonymous = await open.inject({ method: 'GET', url: '/api/system/version' });
    expect(anonymous.statusCode).toBe(401);

    const authenticated = await open.inject({
      method: 'GET',
      url: '/api/system/version',
      headers: { authorization: `Bearer ${bootstrapped.json().session as string}` },
    });
    expect(authenticated.statusCode).toBe(200);

    // /health stays open for supervisors and watchdogs.
    expect((await open.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);

    await open.close();
  });

  it('clears the operator through the local reset marker and audits it', async () => {
    const databasePath = createDatabasePath();
    const first = await buildAppWithCapturedLog({ databasePath });
    await first.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode: readBootstrapCode(first), passphrase: OPERATOR_PASSPHRASE },
    });
    await first.close();

    // Creating the marker requires filesystem control of the host.
    writeFileSync(operatorResetMarkerPath(databasePath), '');

    const restarted = await buildAppWithCapturedLog({ databasePath });

    // The host is back in bootstrap and the old passphrase is gone.
    expect((await restarted.inject({ method: 'POST', url: '/api/auth/session', payload: { passphrase: OPERATOR_PASSPHRASE } })).statusCode).toBe(401);

    const rebootstrapped = await restarted.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode: readBootstrapCode(restarted), passphrase: 'a fresh operator passphrase' },
    });
    expect(rebootstrapped.statusCode).toBe(201);

    const events = await restarted.inject({
      method: 'GET',
      url: '/api/events',
      headers: { authorization: `Bearer ${rebootstrapped.json().session as string}` },
    });
    const types = (events.json().events as { type: string }[]).map((event) => event.type);
    expect(types).toContain('auth.operator_reset');

    // The marker is consumed: a further restart must not reset again.
    await restarted.close();
    const third = await buildAppWithCapturedLog({ databasePath });
    expect((await third.inject({ method: 'POST', url: '/api/auth/session', payload: { passphrase: 'a fresh operator passphrase' } })).statusCode).toBe(201);

    await third.close();
  });

  it('never accepts a forged auth audit event from a client', async () => {
    const app = await bootstrappedApp();
    const session = await login(app);

    for (const type of ['auth.operator_bootstrapped', 'auth.credential_changed', 'auth.operator_reset', 'auth.sessions_revoked', 'home.claimed', 'home.reset']) {
      const forged = await app.inject({
        method: 'POST',
        url: '/api/events',
        headers: { authorization: `Bearer ${session}` },
        payload: { deviceId: 'attacker', type, payload: type === 'auth.sessions_revoked' ? { revokedSessions: 0 } : {} },
      });

      expect(forged.statusCode).toBe(400);
      expect(forged.json()).toEqual({ error: RESERVED_EVENT_ERROR });
    }

    await app.close();
  });

  it('mints realtime tickets under an operator session and drops them when the session ends', async () => {
    const app = await bootstrappedApp();
    const session = await login(app);

    const ticket = await app.inject({
      method: 'POST',
      url: '/api/realtime/tickets',
      headers: { authorization: `Bearer ${session}` },
    });
    expect(ticket.statusCode).toBe(201);
    expect(ticket.json().ticket).toEqual(expect.any(String));

    // An anonymous caller cannot mint one once an operator exists.
    const anonymous = await app.inject({ method: 'POST', url: '/api/realtime/tickets' });
    expect(anonymous.statusCode).toBe(401);

    // B169. Die zweite Haelfte des Namens - *and drops them when the session
    // ends* - stand bis zum 2026-09-14 nur im Namen. Gefunden beim Pflanzen:
    // `purgeSessionRealtimeTickets` zu einer leeren Anweisung gemacht, und kein
    // Test bemerkte es, obwohl ADR 0076 direkt daneben steht ("A ticket minted
    // under a session dies with it").
    //
    // Eine Karte ist ein zweiter Schluessel zu derselben Sitzung. Wer sich
    // abmeldet, weil er ein fremdes Geraet verlaesst, muss auch den zweiten
    // los sein - sonst hat das Abmelden nur den Teil beendet, den die Person
    // sehen konnte.
    await app.inject({
      method: 'DELETE',
      url: '/api/auth/session',
      headers: { authorization: `Bearer ${session}` },
    });

    await expect(app.injectWS(`/ws?ticket=${encodeURIComponent(ticket.json().ticket as string)}`))
      .rejects.toThrow('Unexpected server response: 401');

    await app.close();
  });
});

describe('retention policy administration', () => {
  it('is closed without an operator session, including for the static token', async () => {
    const app = await buildAppWithCapturedLog({ foundationToken: 'dev-token' });
    await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode: readBootstrapCode(app), passphrase: OPERATOR_PASSPHRASE },
    });

    // Retention policies decide when memory is deleted, so the principal-less
    // token must not reach them (ADR 0075 ceiling).
    for (const [method, url] of [
      ['GET', '/api/memory/retention-policies'],
      ['POST', '/api/memory/retention-policies'],
      ['GET', '/api/memory/retention-policies/keep'],
      ['PUT', '/api/memory/retention-policies/keep'],
      ['DELETE', '/api/memory/retention-policies/keep'],
    ] as const) {
      const withToken = await app.inject({ method, url, headers: { authorization: 'Bearer dev-token' }, payload: {} });
      expect(withToken.statusCode).toBe(401);

      const anonymous = await app.inject({ method, url, payload: {} });
      expect(anonymous.statusCode).toBe(401);
    }

    await app.close();
  });

  it('creates, reads, edits and revokes policies through an operator session', async () => {
    const app = await bootstrappedApp();
    const session = await login(app);
    const auth = { authorization: `Bearer ${session}` };

    const created = await app.inject({
      method: 'POST',
      url: '/api/memory/retention-policies',
      headers: auth,
      payload: { retentionPolicyId: 'short-lived', displayName: 'Short lived notes', mode: 'delete_after_max_age', maxAgeDays: 30 },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({
      retentionPolicyId: 'short-lived',
      displayName: 'Short lived notes',
      mode: 'delete_after_max_age',
      maxAgeDays: 30,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const listed = await app.inject({ method: 'GET', url: '/api/memory/retention-policies', headers: auth });
    expect(listed.statusCode).toBe(200);
    expect((listed.json() as { retentionPolicies: { retentionPolicyId: string }[] }).retentionPolicies).toHaveLength(1);

    const read = await app.inject({ method: 'GET', url: '/api/memory/retention-policies/short-lived', headers: auth });
    expect(read.statusCode).toBe(200);
    expect(read.json().maxAgeDays).toBe(30);

    // Editing a policy is how retention changes: it applies to every item that
    // references it at the next sweep (ADR 0074).
    const edited = await app.inject({
      method: 'PUT',
      url: '/api/memory/retention-policies/short-lived',
      headers: auth,
      payload: { maxAgeDays: 7 },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().maxAgeDays).toBe(7);
    expect(edited.json().displayName).toBe('Short lived notes');

    const revoked = await app.inject({ method: 'DELETE', url: '/api/memory/retention-policies/short-lived', headers: auth });
    expect(revoked.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/memory/retention-policies/short-lived', headers: auth })).statusCode).toBe(404);

    await app.close();
  });

  it('refuses policy shapes that would make retention ambiguous', async () => {
    const app = await bootstrappedApp();
    const session = await login(app);
    const auth = { authorization: `Bearer ${session}` };

    const missingAge = await app.inject({
      method: 'POST',
      url: '/api/memory/retention-policies',
      headers: auth,
      payload: { retentionPolicyId: 'broken', displayName: 'Broken', mode: 'delete_after_max_age' },
    });
    expect(missingAge.statusCode).toBe(400);

    const keepWithAge = await app.inject({
      method: 'POST',
      url: '/api/memory/retention-policies',
      headers: auth,
      payload: { retentionPolicyId: 'broken', displayName: 'Broken', mode: 'keep_until_deleted', maxAgeDays: 5 },
    });
    expect(keepWithAge.statusCode).toBe(400);

    const zeroDays = await app.inject({
      method: 'POST',
      url: '/api/memory/retention-policies',
      headers: auth,
      payload: { retentionPolicyId: 'broken', displayName: 'Broken', mode: 'delete_after_max_age', maxAgeDays: 0 },
    });
    expect(zeroDays.statusCode).toBe(400);

    const unknownMode = await app.inject({
      method: 'POST',
      url: '/api/memory/retention-policies',
      headers: auth,
      payload: { retentionPolicyId: 'broken', displayName: 'Broken', mode: 'delete_when_bored' },
    });
    expect(unknownMode.statusCode).toBe(400);

    expect((await app.inject({ method: 'GET', url: '/api/memory/retention-policies', headers: auth })).json().retentionPolicies).toHaveLength(0);

    await app.close();
  });

  it('records a memory item against a policy and rejects an unknown reference', async () => {
    const app = await bootstrappedApp();
    const session = await login(app);
    const auth = { authorization: `Bearer ${session}` };

    await app.inject({
      method: 'POST',
      url: '/api/memory/retention-policies',
      headers: auth,
      payload: { retentionPolicyId: 'thirty-days', displayName: 'Thirty days', mode: 'delete_after_max_age', maxAgeDays: 30 },
    });

    const recorded = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: auth,
      payload: {
        deviceId: 'desktop-dev',
        type: 'memory.recorded',
        payload: { privacyDomain: 'domain-private', contentType: 'text/plain', content: 'Remember this for a month.', retentionPolicyRef: 'thirty-days' },
      },
    });
    expect(recorded.statusCode).toBe(201);
    // The policy reference stays out of the append-only event: the event still
    // carries only the reference to the item (ADR 0069).
    expect(recorded.json().event.payload.retentionPolicyRef).toBeUndefined();

    // A typo would otherwise be kept forever by the fail-safe rule, silently.
    const unknownRef = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: auth,
      payload: {
        deviceId: 'desktop-dev',
        type: 'memory.recorded',
        payload: { privacyDomain: 'domain-private', contentType: 'text/plain', content: 'Typo.', retentionPolicyRef: 'thirdy-days' },
      },
    });
    expect(unknownRef.statusCode).toBe(400);
    expect(unknownRef.json()).toEqual({ error: 'retentionPolicyRef does not match a known retention policy.' });

    await app.close();
  });
});

describe('domain crypto-shred trigger', () => {
  it('is closed without an operator session, including for the static token', async () => {
    const app = await buildAppWithCapturedLog({ foundationToken: 'dev-token', memoryEncryption: true });
    await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode: readBootstrapCode(app), passphrase: OPERATOR_PASSPHRASE },
    });

    const withToken = await app.inject({
      method: 'POST',
      url: '/api/memory/domains/domain-private/shred',
      headers: { authorization: 'Bearer dev-token' },
      payload: { confirm: 'domain-private' },
    });
    expect(withToken.statusCode).toBe(401);

    const anonymous = await app.inject({
      method: 'POST',
      url: '/api/memory/domains/domain-private/shred',
      payload: { confirm: 'domain-private' },
    });
    expect(anonymous.statusCode).toBe(401);

    await app.close();
  });

  it('refuses to shred without a confirmation that names the exact domain', async () => {
    const databasePath = createDatabasePath();
    const app = await buildAppWithCapturedLog({ databasePath, memoryEncryption: true });
    await bootstrap(app);
    const session = await login(app);
    const auth = { authorization: `Bearer ${session}` };
    const memoryItemId = await recordMemoryItem(app, session);

    const noConfirm = await app.inject({
      method: 'POST',
      url: '/api/memory/domains/domain-private/shred',
      headers: auth,
      payload: {},
    });
    expect(noConfirm.statusCode).toBe(400);
    expect(noConfirm.json().error).toContain('irreversible');

    // A confirmation naming a different domain must not shred this one: a
    // mis-addressed request is exactly what confirmation exists to catch.
    const wrongDomain = await app.inject({
      method: 'POST',
      url: '/api/memory/domains/domain-private/shred',
      headers: auth,
      payload: { confirm: 'domain-work' },
    });
    expect(wrongDomain.statusCode).toBe(400);
    expect(wrongDomain.json()).toEqual({ error: 'confirm must repeat the exact privacy domain being shredded.' });

    await app.close();

    // Neither attempt destroyed anything: the content is still readable.
    expect(readStoredContent(databasePath, memoryItemId).content).toBe('A private secret.');
  });

  it('shreds a confirmed domain, makes its content unreadable and audits it', async () => {
    const databasePath = createDatabasePath();
    const app = await buildAppWithCapturedLog({ databasePath, memoryEncryption: true });
    await bootstrap(app);
    const session = await login(app);
    const auth = { authorization: `Bearer ${session}` };
    const memoryItemId = await recordMemoryItem(app, session);

    const shredded = await app.inject({
      method: 'POST',
      url: '/api/memory/domains/domain-private/shred',
      headers: auth,
      payload: { confirm: 'domain-private', reason: 'device loss' },
    });
    expect(shredded.statusCode).toBe(200);
    expect(shredded.json()).toEqual({ privacyDomain: 'domain-private', removedKeyVersions: 1 });

    const events = await app.inject({ method: 'GET', url: '/api/events', headers: auth });
    const audit = (events.json().events as { type: string; payload: Record<string, unknown> }[])
      .filter((event) => event.type === 'memory.domain_shredded');
    expect(audit).toHaveLength(1);
    // The audit records the decision and its references, never content or keys.
    expect(audit[0].payload).toEqual({ privacyDomain: 'domain-private', removedKeyVersions: 1, reason: 'device loss' });

    await app.close();

    // The item survives as a record, but its content is gone for good: even a
    // reader holding the key store cannot recover it.
    const item = readStoredContent(databasePath, memoryItemId);
    expect(item.content).toBeUndefined();
    expect(item.contentUnavailable).toBe('key_shredded');
  });

  it('reaches the recall history, so no plaintext copy of the words survives it', async () => {
    /**
     * ADR 0049 mit ADR 0071 (2026-09-10, Paket P11 des externen Reviews). Der
     * Nachbar-Test oben prüft, dass der Inhalt des Items unlesbar wird. Die
     * Modelljob-Warteschlange hielt dieselben Worte im Klartext daneben, und
     * `domain-shred.ts` nannte die Tabelle nicht - ADR 0049 sagte das seit dem
     * 2026-08-24.
     *
     * Geprüft wird hier die **Verdrahtung**: dass der Kern den Port übergibt.
     * Was der Port tut, halten die Tests der Warteschlange; dass ein Shred ihn
     * ruft, hält `domain-shred.test.ts`. Ohne diesen dritten wäre beides wahr
     * und der Weg dazwischen trotzdem offen.
     */
    const databasePath = createDatabasePath();
    const app = await buildAppWithCapturedLog({ databasePath, memoryEncryption: true });
    await bootstrap(app);
    const session = await login(app);
    const auth = { authorization: `Bearer ${session}` };
    await recordMemoryItem(app, session);

    const writer = new Database(databasePath);
    new PicoModelJobQueue(writer).enqueue({
      job: parsePicoModelJob({
        schema: 'pico.model.job.v1',
        jobId: 'job_shred_wiring',
        role: 'reader',
        units: [{ originClass: 'person_present', text: 'where did I park?' }],
        references: [{
          schema: 'pico.model.context.ref.v1',
          contextRefId: 'ref_shred_wiring',
          jobId: 'job_shred_wiring',
          originClass: 'own_pico',
          privacyDomain: 'domain-private',
          excerpt: 'the blue space behind the bakery',
          materializedAt: '2026-08-14T11:59:00.000Z',
          expiresAt: '2026-08-14T12:05:00.000Z',
        }],
        expects: [{ name: 'sentence', type: 'token' }],
        carries: 'live_turn_and_retrieved_memory',
      }, Date.parse('2026-08-14T12:00:00.000Z')),
      picoIdentityFingerprintHex: 'aa'.repeat(32),
      entryId: 'entry_shred_wiring',
      at: '2026-08-14T12:00:00.000Z',
      kind: 'recall',
      recallContext: { privacyDomain: 'domain-private', memoryItemIds: ['mem_shred_wiring'] },
    });
    writer.close();

    expect((await app.inject({
      method: 'POST',
      url: '/api/memory/domains/domain-private/shred',
      headers: auth,
      payload: { confirm: 'domain-private' },
    })).statusCode).toBe(200);
    await app.close();

    const reader = new Database(databasePath, { readonly: true });
    const row = reader.prepare(`
      SELECT job_json AS jobJson, recall_context_json AS recallContextJson,
             forgotten_at AS forgottenAt
      FROM pico_model_job_queue WHERE job_id = ?
    `).get('job_shred_wiring') as
      { jobJson: string; recallContextJson: string | null; forgottenAt: string | null };
    reader.close();

    expect(row.jobJson).not.toContain('where did I park?');
    expect(row.recallContextJson).toBeNull();
    expect(row.forgottenAt).not.toBeNull();
  });

  it('refuses to shred when encryption is off instead of pretending it protected something', async () => {
    const app = await bootstrappedApp();
    const session = await login(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/memory/domains/domain-private/shred',
      headers: { authorization: `Bearer ${session}` },
      payload: { confirm: 'domain-private' },
    });

    // Without encryption there are no keys to destroy: content is plaintext at
    // rest, so a "shred" would sound final and change nothing.
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain('requires memory encryption');

    await app.close();
  });
});

describe('memory content read API (Gate C)', () => {
  it("returns a domain's items with their content to an authenticated reader", async () => {
    const app = await bootstrappedApp();
    const session = await login(app);
    const auth = { authorization: `Bearer ${session}` };
    const id = await recordMemoryItem(app, session, { content: 'A private secret.' });

    const list = await app.inject({ method: 'GET', url: '/api/memory/domains/domain-private/items', headers: auth });
    expect(list.statusCode).toBe(200);
    const body = list.json() as { items: { memoryItemId: string; content?: string }[]; hasMore: boolean; nextCursor: string | null };
    expect(body.items.map((item) => item.memoryItemId)).toEqual([id]);
    expect(body.items[0].content).toBe('A private secret.');
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).not.toBeNull();

    const single = await app.inject({ method: 'GET', url: `/api/memory/domains/domain-private/items/${id}`, headers: auth });
    expect(single.statusCode).toBe(200);
    expect(single.json().content).toBe('A private secret.');
    // ADR 0136 BR6. An item Pico wrote itself carries no derivation, and the
    // field is absent rather than empty: "not derived from a library" and
    // "derived from one nobody recorded" are different facts.
    expect(single.json().derivedFrom).toBeUndefined();

    await app.close();
  });

  it('says on the read surface that an item came from a library', async () => {
    // ADR 0136 BR6 with ADR 0117 X5. Provenance travels with the content, for
    // the reason the origin class does: content that arrives without it is
    // content presented as Pico's own, and ADR 0133's correction point - which
    // revision an answer was wrong about - is only a column until somebody can
    // read it.
    const databasePath = createDatabasePath();
    const seeded = new EventStore(databasePath);
    seeded.memory().create({
      memoryItemId: 'memory_derived_read_surface',
      privacyDomain: 'domain-private',
      owner: 'pico:identity:test',
      controller: 'pico:identity:test',
      contentType: 'text/plain',
      content: 'From a library.',
      derivedFrom: buildPicoLibraryDerivation({
        supplierIdentifier: 'a-library',
        pin: { kind: 'commit', value: 'd'.repeat(40) },
        // False is not a defect to hide: it says the commit does not pin what
        // the bytes were.
        pinCoversContent: false,
      }),
    });
    seeded.close();

    const app = await buildAppWithCapturedLog({ databasePath });
    await bootstrap(app);
    const session = await login(app);
    const read = await app.inject({
      method: 'GET',
      url: '/api/memory/domains/domain-private/items/memory_derived_read_surface',
      headers: { authorization: `Bearer ${session}` },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().derivedFrom).toEqual({
      supplierIdentifier: 'a-library',
      pin: { kind: 'commit', value: 'd'.repeat(40) },
      pinCoversContent: false,
    });

    await app.close();
  });

  it('never exposes the unverified owner/controller on the read surface', async () => {
    // owner/controller are attacker-controllable writer input (ADR 0077 C2), so
    // they are never authorization inputs and are not presented as if they were.
    const app = await bootstrappedApp();
    const session = await login(app);
    const id = await recordMemoryItem(app, session);

    const single = await app.inject({
      method: 'GET',
      url: `/api/memory/domains/domain-private/items/${id}`,
      headers: { authorization: `Bearer ${session}` },
    });
    const body = single.json() as Record<string, unknown>;
    expect(body.owner).toBeUndefined();
    expect(body.controller).toBeUndefined();
    expect(body.keyEnvelopeRef).toBeUndefined();

    await app.close();
  });

  it('pages the domain with a bounded limit and an opaque cursor', async () => {
    const app = await bootstrappedApp();
    const session = await login(app);
    const auth = { authorization: `Bearer ${session}` };
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      ids.push(await recordMemoryItem(app, session, { content: `secret ${index}` }));
    }

    const first = await app.inject({ method: 'GET', url: '/api/memory/domains/domain-private/items?limit=2', headers: auth });
    const firstBody = first.json() as { items: { memoryItemId: string }[]; hasMore: boolean; nextCursor: string };
    expect(firstBody.items).toHaveLength(2);
    expect(firstBody.hasMore).toBe(true);

    const second = await app.inject({
      method: 'GET',
      url: `/api/memory/domains/domain-private/items?limit=2&after=${encodeURIComponent(firstBody.nextCursor)}`,
      headers: auth,
    });
    const secondBody = second.json() as { items: { memoryItemId: string }[]; hasMore: boolean };
    expect(secondBody.items).toHaveLength(1);
    expect(secondBody.hasMore).toBe(false);

    // Every recorded item appears exactly once across the two pages.
    const seen = [...firstBody.items, ...secondBody.items].map((item) => item.memoryItemId);
    expect(new Set(seen).size).toBe(3);
    expect([...seen].sort()).toEqual([...ids].sort());

    await app.close();
  });

  it('rejects a malformed pagination cursor', async () => {
    const app = await bootstrappedApp();
    const session = await login(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/memory/domains/domain-private/items?after=not-a-cursor',
      headers: { authorization: `Bearer ${session}` },
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it('gates reads on domain readership, not the operator role', async () => {
    // Readership is a distinct authority from the operator role (ADR 0077 C1):
    // a policy that denies a domain must deny it here even for the operator
    // session, without the operator branch overriding it. This is exactly what
    // stops a second principal inheriting read-all by role.
    const app = await buildAppWithCapturedLog({
      readership: { mayRead: (_principal, privacyDomain) => privacyDomain === 'domain-readable' },
    });
    await bootstrap(app);
    const session = await login(app);
    const auth = { authorization: `Bearer ${session}` };
    await recordMemoryItem(app, session, { privacyDomain: 'domain-readable', content: 'readable' });
    await recordMemoryItem(app, session, { privacyDomain: 'domain-forbidden', content: 'forbidden' });

    const readable = await app.inject({ method: 'GET', url: '/api/memory/domains/domain-readable/items', headers: auth });
    expect(readable.statusCode).toBe(200);
    expect((readable.json() as { items: unknown[] }).items).toHaveLength(1);

    // The operator holds host-admin yet cannot read a domain it is not a reader
    // of. The denial is non-enumerating (404), not a content response.
    const forbiddenList = await app.inject({ method: 'GET', url: '/api/memory/domains/domain-forbidden/items', headers: auth });
    expect(forbiddenList.statusCode).toBe(404);

    const forbiddenItem = await app.inject({ method: 'GET', url: '/api/memory/domains/domain-forbidden/items/whatever', headers: auth });
    expect(forbiddenItem.statusCode).toBe(404);

    await app.close();
  });

  it('is closed to the principal-less static token and to anonymous callers', async () => {
    const app = await buildAppWithCapturedLog({ foundationToken: 'dev-token' });
    await bootstrap(app);

    // The static token's ceiling is foundation-diagnostic (ADR 0075 A1): it can
    // read a memory.recorded summary, never full content.
    const withToken = await app.inject({
      method: 'GET',
      url: '/api/memory/domains/domain-private/items',
      headers: { authorization: 'Bearer dev-token' },
    });
    expect(withToken.statusCode).toBe(401);

    const anonymous = await app.inject({ method: 'GET', url: '/api/memory/domains/domain-private/items' });
    expect(anonymous.statusCode).toBe(401);

    await app.close();
  });

  it('returns 404 for an item that is not present in the domain', async () => {
    const app = await bootstrappedApp();
    const session = await login(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/memory/domains/domain-private/items/mem_missing',
      headers: { authorization: `Bearer ${session}` },
    });
    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it('reports a crypto-shredded item as unavailable instead of fabricating content', async () => {
    const app = await buildAppWithCapturedLog({ memoryEncryption: true });
    await bootstrap(app);
    const session = await login(app);
    const auth = { authorization: `Bearer ${session}` };
    const id = await recordMemoryItem(app, session, { content: 'A private secret.' });

    await app.inject({
      method: 'POST',
      url: '/api/memory/domains/domain-private/shred',
      headers: auth,
      payload: { confirm: 'domain-private' },
    });

    const single = await app.inject({ method: 'GET', url: `/api/memory/domains/domain-private/items/${id}`, headers: auth });
    expect(single.statusCode).toBe(200);
    const body = single.json() as { content?: string; contentUnavailable?: string };
    expect(body.content).toBeUndefined();
    expect(body.contentUnavailable).toBe('key_shredded');

    await app.close();
  });
});

describe('Foundation API access classes', () => {
  it('refuses to serve an unclassified Foundation API route', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
    });

    // Adding a Foundation API route without an access class must fail at
    // registration, not ship open (ADR 0075 A2/A3).
    expect(() => {
      app.get('/api/unclassified/example', async () => ({ ok: true }));
    }).toThrow(/has no access class/);

    // A non-API route is unaffected: classes bound the Foundation API surface.
    expect(() => {
      app.get('/unclassified-example', async () => ({ ok: true }));
    }).not.toThrow();

    await app.close();
  });
});

interface TestWebSocket {
  terminate(): void;
  once(event: 'message', listener: (data: unknown) => void): void;
}

async function readSocketJson(socket: TestWebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { reject(new Error('Timed out waiting for websocket message.')); }, 1_000);
    socket.once('message', (data) => {
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(socketMessageToString(data)) as unknown);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function requireMessagePromise(messagePromise: Promise<unknown> | null): Promise<unknown> {
  if (messagePromise === null) {
    throw new Error('WebSocket message listener was not initialized.');
  }
  return messagePromise;
}

async function mintRealtimeTicket(app: Awaited<ReturnType<typeof buildApp>>): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/realtime/tickets',
    headers: { authorization: 'Bearer dev-token' },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json() as { ticket?: unknown };
  if (typeof body.ticket !== 'string') {
    throw new Error('Realtime ticket response did not include a string ticket.');
  }
  return body.ticket;
}

/**
 * Builds an app whose log is captured, so a test can read the operator
 * bootstrap code the same way an operator does: from the host's local channel.
 * Reading it any other way would not prove it is actually surfaced there.
 */
async function buildAppWithCapturedLog(
  overrides: Partial<Parameters<typeof buildApp>[0]> = {},
): Promise<Awaited<ReturnType<typeof buildApp>>> {
  const lines: string[] = [];
  const logDestination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });

  const app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath: createDatabasePath(),
    deviceId: 'test-core',
    logDestination,
    ...overrides,
  });

  capturedLogLines.set(app, lines);

  return app;
}

function readCapturedLog(app: Awaited<ReturnType<typeof buildApp>>): string {
  return (capturedLogLines.get(app) ?? []).join('');
}

function readBootstrapCode(app: Awaited<ReturnType<typeof buildApp>>): string {
  const lines = capturedLogLines.get(app) ?? [];

  for (const line of lines) {
    const parsed = JSON.parse(line) as { operatorBootstrapCode?: unknown };

    if (typeof parsed.operatorBootstrapCode === 'string') {
      return parsed.operatorBootstrapCode;
    }
  }

  throw new Error('No operator bootstrap code was surfaced on the host log.');
}

/** Returns the most recent code, so a reopened setup mode is picked up. */
function readMoveInCode(app: Awaited<ReturnType<typeof buildApp>>): string {
  const lines = capturedLogLines.get(app) ?? [];
  let latest: string | undefined;

  for (const line of lines) {
    const parsed = JSON.parse(line) as { picoHomeMoveInCode?: unknown };

    if (typeof parsed.picoHomeMoveInCode === 'string') {
      latest = parsed.picoHomeMoveInCode;
    }
  }

  if (latest === undefined) {
    throw new Error('No Move-In Code was surfaced on the host log.');
  }

  return latest;
}

function hasMoveInCode(app: Awaited<ReturnType<typeof buildApp>>): boolean {
  return logLines(app).some((line) => {
    const parsed = JSON.parse(line) as { picoHomeMoveInCode?: unknown };
    return typeof parsed.picoHomeMoveInCode === 'string';
  });
}

function logLines(app: Awaited<ReturnType<typeof buildApp>>): string[] {
  return capturedLogLines.get(app) ?? [];
}

function randomHex(bytes: number): string {
  return bytesToHex(sodium.randombytes_buf(bytes));
}


function keyRecordFingerprintHex(keyRecord: PicoIdentityKeyRecordSignatureInput): string {
  return bytesToHex(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(keyRecord),
    null,
  ));
}

/** Reads an item the way a key-holding reader would, after the app let go of the database. */
function readStoredContent(databasePath: string, memoryItemId: string): { content?: string; contentUnavailable?: string } {
  const crypto = new MemoryContentCrypto(sodium, new KeyStore(join(dirname(databasePath), 'keys')));
  const store = new EventStore(databasePath, { memoryCrypto: crypto });

  try {
    const item = store.memory().getInDomain(memoryItemId, 'domain-private');

    return {
      ...(item?.content === undefined ? {} : { content: item.content }),
      ...(item?.contentUnavailable === undefined ? {} : { contentUnavailable: item.contentUnavailable }),
    };
  } finally {
    store.close();
  }
}

async function recordMemoryItem(
  app: Awaited<ReturnType<typeof buildApp>>,
  session: string,
  overrides: { privacyDomain?: string; content?: string; contentType?: string } = {},
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/events',
    headers: { authorization: `Bearer ${session}` },
    payload: {
      deviceId: 'desktop-dev',
      type: 'memory.recorded',
      payload: {
        privacyDomain: overrides.privacyDomain ?? 'domain-private',
        contentType: overrides.contentType ?? 'text/plain',
        content: overrides.content ?? 'A private secret.',
      },
    },
  });

  if (response.statusCode !== 201) {
    throw new Error(`Recording a memory item failed: ${response.body}`);
  }

  return response.json().event.payload.memoryItemId as string;
}

async function bootstrap(app: Awaited<ReturnType<typeof buildApp>>): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/bootstrap',
    payload: { bootstrapCode: readBootstrapCode(app), passphrase: OPERATOR_PASSPHRASE },
  });

  if (response.statusCode !== 201) {
    throw new Error(`Operator bootstrap failed: ${response.body}`);
  }
}

async function bootstrappedApp(): Promise<Awaited<ReturnType<typeof buildApp>>> {
  const app = await buildAppWithCapturedLog();

  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/bootstrap',
    payload: { bootstrapCode: readBootstrapCode(app), passphrase: OPERATOR_PASSPHRASE },
  });

  if (response.statusCode !== 201) {
    throw new Error(`Operator bootstrap failed: ${response.body}`);
  }

  return app;
}

async function login(app: Awaited<ReturnType<typeof buildApp>>): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/session',
    payload: { passphrase: OPERATOR_PASSPHRASE },
  });

  if (response.statusCode !== 201) {
    throw new Error(`Operator login failed: ${response.body}`);
  }

  return response.json().session as string;
}

async function probeSession(app: Awaited<ReturnType<typeof buildApp>>, session: string) {
  return app.inject({ method: 'GET', url: '/api/auth/session', headers: { authorization: `Bearer ${session}` } });
}

function socketMessageToString(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof Buffer) {
    return data.toString('utf8');
  }
  return String(data);
}
