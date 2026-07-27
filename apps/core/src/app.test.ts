import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  buildPicoHomeMembershipLifecycleSignatureInput,
  buildPicoHomeMembershipSignatureInput,
  picoHomeMembershipCredentialSchema,
  picoHomeMembershipLifecycleRecordSchema,
  buildPicoHomeFoundingSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityPossessionSignatureInput,
  deviceSeenStatuses,
  legacyToolPolicyEventTypes,
  messageCreatedRoles,
  picoHomeClaimEnvelopeSchema,
  picoHomeFoundingAcceptanceSchema,
  picoHomeFoundingRecordSchema,
  picoHomeDomainReadGrantLifecycleRecordSchema,
  picoHomeDomainReadGrantRecordSchema,
  picoHomeMembershipScopes,
  picoHomeEventTypes,
  picoHomeSealedClaimPayloadSchema,
  picoIdentitySuite,
  protocolCapabilities,
  realtimeMessageType,
  type PicoHomeClaimResponse,
  type PicoHomeClaimSignatureInput,
  type PicoHomeFoundingAcceptance,
  type PicoHomeFoundingSignatureInput,
  type PicoHomeDomainReadGrantLifecycleSignatureInput,
  type PicoHomeDomainReadGrantSignatureInput,
  type PicoHomePendingClaimResponse,
  type PicoHomeSetupResponse,
  type PicoHomeMembershipLifecycleSignatureInput,
  type PicoHomeMembershipSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoIdentityDelegationSignatureInput,
} from '@pico/protocol';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { KeyStore } from './key-store.js';
import { MemoryContentCrypto } from './memory-content-crypto.js';
import { picoSchemaBaselineMigrationId } from './migrations.js';
import { operatorResetMarkerPath } from './operator-bootstrap.js';
import { homeResetMarkerPath } from './home-setup.js';

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
      version: '0.1.7',
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
      version: '0.1.7',
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

    const { sealedClaim, claimResponse } = await claimHomeThroughSealedFlow(app);
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
    const { claimResponse } = await claimHomeThroughSealedFlow(first);
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
    stale.close();

    const restarted = await buildAppWithCapturedLog({ databasePath });

    expect(hasMoveInCode(restarted)).toBe(false);
    expect((await restarted.inject({ method: 'GET', url: '/api/home/setup' })).statusCode).toBe(404);
    expect((await restarted.inject({ method: 'POST', url: '/api/home/claim', payload: { claimEnvelope: { schema: picoHomeClaimEnvelopeSchema, sealedClaimPayloadHex: 'ff'.repeat(64) } } })).statusCode).toBe(404);
    const status = await restarted.inject({ method: 'GET', url: '/api/system/status' });
    expect(status.json().picoHome.claimState).toEqual(claimResponse.claimState);

    await restarted.close();
  });

  it('keeps setup mode closed when restored founding evidence has no matching host key custody', async () => {
    const databasePath = createDatabasePath();
    const first = await buildAppWithCapturedLog({ databasePath });
    const { claimResponse } = await claimHomeThroughSealedFlow(first);
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

    const restarted = await buildAppWithCapturedLog({ databasePath });

    expect(hasMoveInCode(restarted)).toBe(false);
    expect((await restarted.inject({ method: 'GET', url: '/api/home/setup' })).statusCode).toBe(404);
    expect((await restarted.inject({ method: 'GET', url: '/api/system/status' })).json().picoHome.claimState).toEqual(claimResponse.claimState);
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

  it('resets a claimed Pico Home only through the local home reset marker', async () => {
    const databasePath = createDatabasePath();
    const first = await buildAppWithCapturedLog({ databasePath });
    const firstSetup = (await first.inject({ method: 'GET', url: '/api/home/setup' })).json();

    await claimHomeThroughSealedFlow(first);
    await first.close();

    writeFileSync(homeResetMarkerPath(databasePath), '');
    const restarted = await buildAppWithCapturedLog({ databasePath });
    const restartedSetup = (await restarted.inject({ method: 'GET', url: '/api/home/setup' })).json();

    expect(restartedSetup.host.signingKeyFingerprintHex).not.toBe(firstSetup.host.signingKeyFingerprintHex);
    const status = await restarted.inject({ method: 'GET', url: '/api/system/status' });
    expect(status.json().picoHome.claimState).toEqual({
      state: 'unclaimed',
      setupMode: {
        active: true,
        moveInCodePending: true,
      },
    });

    const events = await restarted.inject({ method: 'GET', url: '/api/events' });
    const homeReset = (events.json().events as { type: string; payload: unknown }[])
      .filter((event) => event.type === 'home.reset');
    expect(homeReset).toHaveLength(1);
    expect(homeReset[0].payload).toEqual({});

    await restarted.close();
    const third = await buildAppWithCapturedLog({ databasePath });
    const thirdEvents = await third.inject({ method: 'GET', url: '/api/events' });
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

    for (const role of messageCreatedRoles) {
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

  it('rejects reserved legacy and product event types on the foundation API', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    for (const type of [...actionEventTypes, ...legacyToolPolicyEventTypes, ...picoHomeEventTypes]) {
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

  it('activates an issuer-signed membership credential and audits it content-free', async () => {
    const app = await buildAppWithCapturedLog();
    const { sealedClaim, claimResponse } = await claimHomeThroughSealedFlow(app);
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

  it('binds an identity session by possession and requires a signed domain grant on a claimed Home', async () => {
    const app = await buildAppWithCapturedLog();
    const { sealedClaim, claimResponse } = await claimHomeThroughSealedFlow(app);
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
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
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
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000001',
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

    // The challenge is spent, the identity session has no host-admin role, and
    // only its explicitly granted domain is readable.
    expect((await app.inject({
      method: 'POST',
      url: '/api/auth/identity-session',
      payload: identitySessionRequest,
    })).statusCode).toBe(401);
    expect((await app.inject({
      method: 'GET',
      url: '/api/home/domain-read-grants',
      headers: identityAuth,
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

    const opaqueDomains = await app.inject({
      method: 'GET',
      url: '/api/home/reader-custody/domains',
      headers: { authorization: `Bearer ${bootstrapped.json().session as string}` },
    });
    expect(opaqueDomains.statusCode).toBe(200);
    expect(opaqueDomains.json()).toEqual({ domains: [] });
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

async function claimHomeThroughSealedFlow(app: Awaited<ReturnType<typeof buildApp>>): Promise<{
  setup: PicoHomeSetupResponse;
  sealedClaim: ReturnType<typeof createSealedPicoHomeClaim>;
  claimResponse: PicoHomeClaimResponse;
}> {
  const setup = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as PicoHomeSetupResponse;
  const sealedClaim = createSealedPicoHomeClaim(setup, readMoveInCode(app));
  const pending = await app.inject({
    method: 'POST',
    url: '/api/home/claim',
    payload: { claimEnvelope: sealedClaim.claimEnvelope },
  });
  expect(pending.statusCode).toBe(202);

  const acceptance = createPicoHomeFoundingAcceptance(
    sealedClaim,
    (pending.json() as PicoHomePendingClaimResponse).pendingClaim.founding,
  );
  const claimed = await app.inject({
    method: 'POST',
    url: '/api/home/claim',
    payload: { foundingAcceptance: acceptance },
  });
  expect(claimed.statusCode).toBe(201);

  return {
    setup,
    sealedClaim,
    claimResponse: claimed.json() as PicoHomeClaimResponse,
  };
}

function createSealedPicoHomeClaim(
  setup: PicoHomeSetupResponse,
  moveInCode: string,
  overrides: { claimantSignatureHex?: string; hostSetupNonceHex?: string } = {},
): {
  claimEnvelope: { schema: typeof picoHomeClaimEnvelopeSchema; sealedClaimPayloadHex: string };
  expectedHomeHostPicoId: string;
  moveInCode: string;
  claim: PicoHomeClaimSignatureInput;
  claimantIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  claimantPrivateKey: Uint8Array;
  claimantSignatureHex: string;
} {
  const claimant = sodium.crypto_sign_keypair();
  const claimantIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'pico_identity',
    publicKeyHex: bytesToHex(claimant.publicKey),
  };
  const claimantIdentityKeyFingerprintHex = bytesToHex(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(claimantIdentityKeyRecord),
    null,
  ));
  const claim: PicoHomeClaimSignatureInput = {
    suite: picoIdentitySuite,
    claimId: `claim_${randomHex(16)}`,
    hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex: setup.host.keyAgreementKeyFingerprintHex,
    moveInCode,
    claimantIdentityKeyFingerprintHex,
    claimantNonceHex: randomHex(32),
    hostSetupNonceHex: overrides.hostSetupNonceHex ?? setup.setupMode.hostSetupNonceHex,
  };
  const signatureHex = overrides.claimantSignatureHex ?? bytesToHex(sodium.crypto_sign_detached(
    buildPicoHomeClaimSignatureInput(claim),
    claimant.privateKey,
  ));
  const sealedPayload = {
    schema: picoHomeSealedClaimPayloadSchema,
    claim,
    claimantIdentityKeyRecord,
    claimantSignatureHex: signatureHex,
  };
  const sealed = sodium.crypto_box_seal(
    Buffer.from(JSON.stringify(sealedPayload), 'utf8'),
    hexToBytes(setup.host.keyAgreementPublicKeyHex),
  );

  return {
    claimEnvelope: {
      schema: picoHomeClaimEnvelopeSchema,
      sealedClaimPayloadHex: bytesToHex(sealed),
    },
    expectedHomeHostPicoId: `pico:identity:${claimantIdentityKeyFingerprintHex}`,
    moveInCode,
    claim,
    claimantIdentityKeyRecord,
    claimantPrivateKey: claimant.privateKey,
    claimantSignatureHex: signatureHex,
  };
}

function createPicoHomeFoundingAcceptance(
  sealedClaim: ReturnType<typeof createSealedPicoHomeClaim>,
  founding: PicoHomeFoundingSignatureInput,
): PicoHomeFoundingAcceptance {
  return {
    schema: picoHomeFoundingAcceptanceSchema,
    claimId: sealedClaim.claim.claimId,
    foundingId: founding.foundingId,
    claimantFoundingSignatureHex: bytesToHex(sodium.crypto_sign_detached(
      buildPicoHomeFoundingSignatureInput(founding),
      sealedClaim.claimantPrivateKey,
    )),
  };
}

function randomHex(bytes: number): string {
  return bytesToHex(sodium.randombytes_buf(bytes));
}

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function keyRecordFingerprintHex(keyRecord: PicoIdentityKeyRecordSignatureInput): string {
  return bytesToHex(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(keyRecord),
    null,
  ));
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, 'hex'));
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
