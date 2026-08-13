import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import Database from 'better-sqlite3';
import { PicoRelayStore, startPicoRelayServer, type PicoRelayServer } from '@pico/relay';
import {
  buildPicoLinkPushSignatureInput,
  parsePicoLinkSealedPush,
} from '@pico/protocol';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import {
  createPicoIdentitySessionDevice,
  openPicoHomeWithDevice,
  type PicoTestSessionDevice,
} from './test-claimed-home.js';

/**
 * ADR 0150. The push sweep against a booted Home and a real relay.
 *
 * **This exists because the sweep's other tests only proved it does nothing
 * when there is nothing to do.** Planting three defects in the assembly -
 * pushing with no relay, skipping the reader-key check, guessing a home id -
 * left all of them green, because every one of those paths still found zero
 * candidates. The pieces were tested and the assembly was not.
 *
 * So the Home here is claimed through the sealed flow and the device holds a
 * real identity session, which is what registers the reader key a push is
 * sealed to. Writing that row by hand would have proved the sweep works
 * against state no production path produces - the first fixture did exactly
 * that, and the sweep answered zero for four different reasons in a row.
 *
 * Only two rows are still written directly: the exchanged mailbox and a
 * pending recovery. Both are state this test is not about, and both are
 * written while nothing is booted.
 */
const tempDirs: string[] = [];
const servers: PicoRelayServer[] = [];
const stores: PicoRelayStore[] = [];
const apps: Array<{ close(): Promise<void> }> = [];

const operator = 'relay.example.invalid';
const account = 'a'.repeat(32);
const homeInbound = `${'1'.repeat(32)}@${operator}`;
const deviceMailbox = '2'.repeat(32);
const deviceInbound = `${deviceMailbox}@${operator}`;
const strayMailbox = '3'.repeat(32);
// ADR 0148 gives every relationship its own pair of addresses, and the schema
// holds the Home to it.
const strayHomeInbound = `${'4'.repeat(32)}@${operator}`;
/** Somebody else's device: the one being recovered onto, never the one told. */
const targetDevice = 'f'.repeat(64);

beforeAll(async () => {
  await sodium.ready;
});

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close();
  }
  for (const server of servers.splice(0)) {
    await server.close();
  }
  for (const store of stores.splice(0)) {
    store.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface HomeWithPushSweep {
  picoSweepLinkPushes(): Promise<number>;
  close(): Promise<void>;
  inject(request: { method: string; url: string; payload?: unknown }): Promise<{
    statusCode: number;
    json(): unknown;
  }>;
}

async function startRelay(): Promise<{ baseUrl: string; relay: PicoRelayStore }> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-push-sweep-relay-'));
  tempDirs.push(dir);
  const relay = new PicoRelayStore(join(dir, 'relay.sqlite'), operator);
  stores.push(relay);
  relay.upsertAccount({ accountId: account, mailboxQuota: 4 });
  // The device's mailbox exists at the operator, because ADR 0148 registers
  // one before handing the address over.
  for (const mailbox of [deviceMailbox, strayMailbox]) {
    relay.register({
      accountId: account,
      mailbox,
      capacity: 32,
      registeredAt: '2026-08-13T09:00:00.000Z',
    });
  }
  const server = await startPicoRelayServer({ store: relay, host: '127.0.0.1', port: 0 });
  servers.push(server);
  return { baseUrl: `http://${server.host}:${server.port}`, relay };
}

async function boot(
  databasePath: string,
  relay?: { baseUrl: string; accountId: string },
): Promise<{ app: HomeWithPushSweep; logLines: string[] }> {
  const logLines: string[] = [];
  const app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath,
    deviceId: 'pico-core',
    ...(relay === undefined ? {} : {
      linkRelayBaseUrl: relay.baseUrl,
      linkRelayAccountId: relay.accountId,
    }),
    logDestination: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        logLines.push(chunk.toString('utf8'));
        callback();
      },
    }),
  }) as unknown as HomeWithPushSweep;
  apps.push(app);
  return { app, logLines };
}

/**
 * A Home that has been moved into, with one device that could raise an
 * objection and a recovery pending for a second device it does not hold.
 */
async function readyHome(options: {
  pendingRecovery: boolean;
  /** A device of the same person that may hold a session and not an envelope. */
  strayDevice?: boolean;
}): Promise<{
  databasePath: string;
  device: PicoTestSessionDevice;
}> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-push-sweep-home-'));
  tempDirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');

  const { app, logLines } = await boot(databasePath);
  const { device, sealedClaim } = await openPicoHomeWithDevice(app, {
    moveInCode: loggedValue(logLines, 'picoHomeMoveInCode'),
    idSuffix: 'push_sweep_20260813',
    // A push is a sealed envelope, so the delegation has to say the device may
    // receive one. ADR 0116: the reader key is registered against these.
    scopes: ['decrypt_domain', 'receive_key_envelope', 'surface_session'],
  });
  /**
   * A second device of the same person, delegated only far enough to hold a
   * surface session. It has a reader key - it opened a session like any other
   * device - and it has not been given the envelope scopes, so this Home may
   * not seal to it. That is the gap the sweep's own reader-key check covers:
   * the mailbox layer honours this device, and the seal layer refuses it.
   */
  const stray = options.strayDevice !== true ? undefined
    : await createPicoIdentitySessionDevice(app, {
      identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
      identityPrivateKey: sealedClaim.claimantPrivateKey,
      idSuffix: 'push_sweep_surface_only',
      lifecycleOrder: 'seq:0000000000000003',
    });
  await app.close();
  apps.splice(apps.indexOf(app), 1);

  const db = new Database(databasePath);
  const homeId = (db
    .prepare('SELECT home_id AS homeId FROM pico_home_claim_state WHERE id = 1')
    .get() as { homeId: string }).homeId;
  db.prepare(`
    INSERT INTO pico_link_mailbox (
      device_signing_key_fingerprint_hex, pico_identity_fingerprint_hex,
      device_key_agreement_key_fingerprint_hex, delegation_id,
      home_inbound, device_inbound, exchanged_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    device.deviceSigningKeyFingerprintHex,
    device.picoIdentityFingerprintHex,
    device.deviceKeyAgreementKeyFingerprintHex,
    device.delegationId,
    homeInbound,
    deviceInbound,
    '2026-08-13T09:00:00.000Z',
  );
  if (options.pendingRecovery) {
    db.prepare(`
      INSERT INTO pico_home_device_recovery (
        recovery_id, home_id, pico_identity_fingerprint_hex, status,
        target_delegation_id, target_device_signing_key_fingerprint_hex,
        target_device_key_agreement_key_fingerprint_hex, observed_lifecycle_order,
        evidence_digest_hex, claim_digest_hex, submission_json,
        accepted_at, effective_at, completion_expires_at
      ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'recovery-1', homeId, device.picoIdentityFingerprintHex, 'delegation-target',
      targetDevice, 'e'.repeat(64), 'seq:0000000000000002',
      'a'.repeat(64), 'b'.repeat(64), '{}',
      '2026-08-13T09:00:00.000Z',
      new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
      new Date(Date.now() + 48 * 60 * 60 * 1_000).toISOString(),
    );
  }
  if (stray !== undefined) {
    db.prepare(`
      INSERT INTO pico_link_mailbox (
        device_signing_key_fingerprint_hex, pico_identity_fingerprint_hex,
        device_key_agreement_key_fingerprint_hex, delegation_id,
        home_inbound, device_inbound, exchanged_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      stray.deviceSigningKeyFingerprintHex,
      stray.picoIdentityFingerprintHex,
      stray.deviceKeyAgreementKeyFingerprintHex,
      stray.delegationId,
      strayHomeInbound,
      `${strayMailbox}@${operator}`,
      '2026-08-13T09:00:00.000Z',
    );
  }
  db.close();

  return { databasePath, device };
}

/** The move-in code a fresh host surfaces on its own log, and nowhere else. */
function loggedValue(logLines: readonly string[], key: string): string {
  for (const line of logLines) {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    if (typeof parsed[key] === 'string') {
      return parsed[key];
    }
  }
  throw new Error(`pico_host_log_missing:${key}`);
}

describe('ADR 0150 - the push sweep, assembled', () => {
  it('pushes a device that can object, and the device can open it', async () => {
    const { baseUrl, relay } = await startRelay();
    const { databasePath, device } = await readyHome({ pendingRecovery: true });

    const { app } = await boot(databasePath, { baseUrl, accountId: account });
    expect(await app.picoSweepLinkPushes()).toBe(1);

    const held = relay.collect({ accountId: account, mailbox: deviceMailbox, nowMs: Date.now() });
    expect(held.ok && held.packets).toHaveLength(1);

    // The device opens it with its own key-agreement key - the whole point,
    // end to end. Nobody between the two could have done this.
    const opened = sodium.crypto_box_seal_open(
      Buffer.from((held.ok ? held.packets[0]! : { payload: '' }).payload, 'base64'),
      Buffer.from(device.deviceKeyAgreementKeyRecord.publicKeyHex, 'hex'),
      device.deviceKeyAgreementPrivateKey,
    );
    const sealed = parsePicoLinkSealedPush(JSON.parse(new TextDecoder().decode(opened)));
    expect(sealed.push.deviceSigningKeyFingerprintHex)
      .toBe(device.deviceSigningKeyFingerprintHex);
    expect(buildPicoLinkPushSignatureInput(sealed.push)).toBeInstanceOf(Uint8Array);
    // ADR 0150 PU3: it says a push happened, never what about.
    expect(JSON.stringify(sealed)).not.toContain('recovery-1');
    expect(JSON.stringify(sealed)).not.toContain('recovery');
  });

  it('pushes once for one recovery, however often it sweeps', async () => {
    // ADR 0150 PU5's no-retry rule, over the durable ledger rather than a
    // variable a restart would lose.
    const { baseUrl } = await startRelay();
    const { databasePath } = await readyHome({ pendingRecovery: true });

    const { app } = await boot(databasePath, { baseUrl, accountId: account });
    expect(await app.picoSweepLinkPushes()).toBe(1);
    expect(await app.picoSweepLinkPushes()).toBe(0);
    await app.close();
    apps.splice(apps.indexOf(app), 1);

    // And a restart does not push again, which is why migration 0011 exists.
    const restarted = await boot(databasePath, { baseUrl, accountId: account });
    expect(await restarted.app.picoSweepLinkPushes()).toBe(0);
  });

  it('pushes nothing without a relay, however ready the Home is', async () => {
    const { databasePath } = await readyHome({ pendingRecovery: true });
    const { app } = await boot(databasePath);
    expect(await app.picoSweepLinkPushes()).toBe(0);
  });

  it('pushes nothing to a device it may not seal to', async () => {
    // Two devices of one person, one recovery, and only one of them was
    // delegated the scopes an envelope needs. Pushing to the other would be
    // this Home deciding for itself what a delegation said.
    const { baseUrl, relay } = await startRelay();
    const { databasePath } = await readyHome({ pendingRecovery: true, strayDevice: true });
    const { app } = await boot(databasePath, { baseUrl, accountId: account });
    expect(await app.picoSweepLinkPushes()).toBe(1);

    const stray = relay.collect({ accountId: account, mailbox: strayMailbox, nowMs: Date.now() });
    expect(stray.ok && stray.packets).toHaveLength(0);
    const held = relay.collect({ accountId: account, mailbox: deviceMailbox, nowMs: Date.now() });
    expect(held.ok && held.packets).toHaveLength(1);
  });

  it('pushes nothing when no recovery is pending', async () => {
    const { baseUrl, relay } = await startRelay();
    const { databasePath } = await readyHome({ pendingRecovery: false });
    const { app } = await boot(databasePath, { baseUrl, accountId: account });
    expect(await app.picoSweepLinkPushes()).toBe(0);

    const held = relay.collect({ accountId: account, mailbox: deviceMailbox, nowMs: Date.now() });
    expect(held.ok && held.packets).toHaveLength(0);
  });
});
