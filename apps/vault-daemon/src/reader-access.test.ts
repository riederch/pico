import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { picoIdentitySuite } from '@pico/protocol';
import {
  createPicoReaderCustodyDomain,
  createPicoReaderCustodyReaderGrant,
  createPicoReaderCustodySyncBatch,
  createPicoReaderCustodyWriterGrant,
  createPicoVaultKeyfile,
  encryptPicoReaderCustodyItem,
  openPicoReaderCustodySyncBatch,
  openPicoVaultKeyfile,
  writePicoVaultKeyfile,
} from '@pico/vault';
import {
  PicoReaderCustodySyncAccessSession,
  PicoReaderCustodySyncClient,
  PicoReaderCustodySyncFileStateStore,
  PicoReaderCustodySyncProtectedProjectionFileStore,
  type PicoReaderCustodySyncPresentedItem,
} from '@pico/sync';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  connectPicoVaultDaemonClient,
  connectPicoVaultDaemonSyncTransport,
  createPicoVaultDaemonReaderAccessUnlockPort,
  openPicoVaultDaemonReaderAccessSession,
  picoVaultDaemonRequestFamilies,
  type PicoVaultDaemonClient,
  type PicoVaultDaemonSyncTransport,
} from './index.js';

const READER_PASSPHRASE = 'reader agreement passphrase';
const PLAINTEXT = 'transport must never receive this plaintext';
const DAEMON_CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');

const temporaryDirectories: string[] = [];
const daemonProcesses: ChildProcess[] = [];
const transports: PicoVaultDaemonSyncTransport[] = [];
const clients: PicoVaultDaemonClient[] = [];

interface ReaderFixture {
  readerKeyfile: ReturnType<typeof createPicoVaultKeyfile>;
  pins: {
    routeRef: string;
    domainAuthorityId: string;
    homeId: string;
    hostSigningKeyFingerprintHex: string;
    domainId: string;
    ownerIdentityKeyFingerprintHex: string;
    readerGrantId: string;
    readerIdentityKeyFingerprintHex: string;
    readerKeyFingerprintHex: string;
  };
  archiveStore: PicoReaderCustodySyncProtectedProjectionFileStore;
  stateStore: PicoReaderCustodySyncFileStateStore;
}

let fixture: ReaderFixture;

beforeAll(async () => {
  await sodium.ready;
  fixture = buildReaderFixture();
}, 60_000);

afterEach(async () => {
  for (const client of clients.splice(0)) {
    await client.close();
  }
  for (const transport of transports.splice(0)) {
    transport.close();
  }
  for (const daemon of daemonProcesses.splice(0)) {
    daemon.kill('SIGKILL');
  }
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const directory = mkdtempSync(join('/tmp', prefix));
  temporaryDirectories.push(directory);
  return directory;
}

/**
 * Builds one real reader-custody projection: keyfiles, domain, grants, an
 * encrypted item, a sealed ADR 0089 batch, and the durable ADR 0090/0093 state
 * plus archive a Reader would legitimately hold. Only fixture construction uses
 * in-process Vault sessions; the access path under test never does.
 */
function buildReaderFixture(): ReaderFixture {
  const ownerIdentity = createPicoVaultKeyfile(sodium, {
    keyRole: 'pico_identity',
    passphrase: 'owner identity passphrase',
  });
  const ownerAgreement = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_key_agreement',
    passphrase: 'owner agreement passphrase',
  });
  const readerAgreement = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_key_agreement',
    passphrase: READER_PASSPHRASE,
  });
  const writerSigning = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_signing',
    passphrase: 'writer signing passphrase',
  });

  const ownerIdentitySession = openPicoVaultKeyfile(sodium, {
    keyfile: ownerIdentity.keyfile,
    passphrase: 'owner identity passphrase',
  });
  const ownerAgreementSession = openPicoVaultKeyfile(sodium, {
    keyfile: ownerAgreement.keyfile,
    passphrase: 'owner agreement passphrase',
  });
  const readerAgreementSession = openPicoVaultKeyfile(sodium, {
    keyfile: readerAgreement.keyfile,
    passphrase: READER_PASSPHRASE,
  });
  const writerSigningSession = openPicoVaultKeyfile(sodium, {
    keyfile: writerSigning.keyfile,
    passphrase: 'writer signing passphrase',
  });

  const domainRecord = createPicoReaderCustodyDomain(sodium, {
    ownerIdentitySession,
    ownerReaderKeyRecord: {
      suite: picoIdentitySuite,
      keyRole: 'device_key_agreement',
      publicKeyHex: ownerAgreement.publicKeyHex,
    },
    domainAuthorityId: 'reader_daemon_domain_authority_0001',
    homeId: 'home_reader_daemon_0001',
    hostSigningKeyFingerprintHex: '11'.repeat(32),
    domainId: 'reader_daemon_domain_0001',
    authorizedAt: '2026-07-27T10:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000001',
  });
  const writerGrantRecord = createPicoReaderCustodyWriterGrant(sodium, {
    ownerIdentitySession,
    domainRecord,
    writerDeviceSigningKeyRecord: {
      suite: picoIdentitySuite,
      keyRole: 'device_signing',
      publicKeyHex: writerSigning.publicKeyHex,
    },
    writerGrantId: 'reader_daemon_writer_grant_0001',
    writerIdentityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
    validFrom: '2026-07-27T10:00:00.000Z',
    validUntil: '2027-07-27T10:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000002',
  });
  const readerGrantRecord = createPicoReaderCustodyReaderGrant(sodium, {
    ownerIdentitySession,
    ownerReaderKeyAgreementSession: ownerAgreementSession,
    domainRecord,
    readerKeyRecord: {
      suite: picoIdentitySuite,
      keyRole: 'device_key_agreement',
      publicKeyHex: readerAgreement.publicKeyHex,
    },
    readerGrantId: 'reader_daemon_reader_grant_0001',
    readerIdentityKeyFingerprintHex: '44'.repeat(32),
    readerDeviceSigningKeyFingerprintHex: '55'.repeat(32),
    readerDelegationId: 'reader_daemon_delegation_0001',
    accessMode: 'from_version',
    firstKekVersion: 1,
    validFrom: '2026-07-27T10:00:00.000Z',
    validUntil: '2027-07-27T10:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000003',
  });
  const itemRecord = encryptPicoReaderCustodyItem(sodium, {
    readerKeyAgreementSession: ownerAgreementSession,
    writerSigningSession,
    domainRecord,
    writerGrantRecord,
    packageId: 'reader_daemon_package_0001',
    memoryItemId: 'reader_daemon_memory_0001',
    contentType: 'text/plain',
    plaintext: PLAINTEXT,
    createdAt: '2026-07-27T10:03:00.000Z',
  });

  const routeRef = `route_${'A'.repeat(48)}`;
  const batch = createPicoReaderCustodySyncBatch(sodium, {
    ownerIdentitySession,
    domainRecord,
    readerGrantRecord,
    writerGrantRecords: [writerGrantRecord],
    itemRecords: [itemRecord],
    syncBatchId: 'reader_daemon_batch_0001',
    routeRef,
    sequence: 1,
    previousManifestDigestHex: '00'.repeat(32),
    createdAt: '2026-07-27T10:10:00.000Z',
    expiresAt: '2026-07-27T11:00:00.000Z',
  });

  const pins = {
    routeRef,
    domainAuthorityId: domainRecord.domain.domainAuthorityId,
    homeId: domainRecord.domain.homeId,
    hostSigningKeyFingerprintHex: domainRecord.domain.hostSigningKeyFingerprintHex,
    domainId: domainRecord.domain.domainId,
    ownerIdentityKeyFingerprintHex: domainRecord.domain.ownerIdentityKeyFingerprintHex,
    readerGrantId: readerGrantRecord.grant.readerGrantId,
    readerIdentityKeyFingerprintHex: readerGrantRecord.grant.readerIdentityKeyFingerprintHex,
    readerKeyFingerprintHex: readerGrantRecord.grant.readerKeyFingerprintHex,
  };

  const stateDirectory = mkdtempSync(join('/tmp', 'pico-rd-state-'));
  temporaryDirectories.push(stateDirectory);
  const stateStore = new PicoReaderCustodySyncFileStateStore(
    join(stateDirectory, 'state.json'),
  );
  const archiveStore = new PicoReaderCustodySyncProtectedProjectionFileStore(
    sodium,
    join(stateDirectory, 'projections.json'),
    routeRef,
  );
  const client = new PicoReaderCustodySyncClient(
    sodium,
    pins,
    stateStore,
    ({ batchRecord, evaluatedAt }) => openPicoReaderCustodySyncBatch(sodium, {
      readerKeyAgreementSession: readerAgreementSession,
      batchRecord,
      evaluatedAt,
    }),
  );
  const applied = client.apply({
    batchRecord: batch.batchRecord,
    evaluatedAt: '2026-07-27T10:11:00.000Z',
  });
  if (!applied.ok) {
    throw new Error(`fixture_projection_failed:${applied.reason}`);
  }
  archiveStore.materialize(applied);

  for (const session of [
    ownerIdentitySession,
    ownerAgreementSession,
    readerAgreementSession,
    writerSigningSession,
  ]) {
    session.lock();
  }

  return { readerKeyfile: readerAgreement, pins, archiveStore, stateStore };
}

interface RunningDaemon {
  socketPath: string;
  stderr: () => string;
}

async function startDaemonProcess(): Promise<RunningDaemon> {
  const home = tempDir('pico-rd-home-');
  writePicoVaultKeyfile(
    join(
      home,
      'keyfiles',
      `device_key_agreement-${fixture.readerKeyfile.keyFingerprintHex}.json`,
    ),
    fixture.readerKeyfile.keyfile,
  );

  const child = spawn(process.execPath, [
    DAEMON_CLI,
    'daemon',
    '--vault-home', home,
    '--foundation-data', tempDir('pico-rd-data-'),
    '--foundation-backup', tempDir('pico-rd-backup-'),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  daemonProcesses.push(child);

  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  const socketPath = await new Promise<string>((resolvePromise, rejectPromise) => {
    let stdout = '';
    const timer = setTimeout(() => {
      rejectPromise(new Error(`daemon_start_timeout:${stderr}`));
    }, 20_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      const newlineIndex = stdout.indexOf('\n');
      if (newlineIndex < 0) {
        return;
      }
      clearTimeout(timer);
      const parsed: unknown = JSON.parse(stdout.slice(0, newlineIndex));
      resolvePromise((parsed as { socketPath: string }).socketPath);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      rejectPromise(new Error(`daemon_exited:${String(code)}:${stderr}`));
    });
  });

  return { socketPath, stderr: () => stderr };
}

/**
 * Holds the person's unlock the way `pico-vault unlock` does: an ordinary
 * asynchronous connection that stays open. Blocking the test thread later does
 * not close it, so the hold survives the synchronous access run.
 */
async function holdReaderUnlock(socketPath: string): Promise<PicoVaultDaemonClient> {
  const client = await connectPicoVaultDaemonClient({ socketPath });
  clients.push(client);
  await client.hello();
  await client.unlock({
    keyRole: 'device_key_agreement',
    keyFingerprintHex: fixture.readerKeyfile.keyFingerprintHex,
    passphrase: READER_PASSPHRASE,
  });
  return client;
}

/**
 * The blocking bridge parks this thread for the whole run, so the child's
 * stderr chunks are still queued when it returns. Poll rather than sleep.
 */
async function waitForAudit(daemon: RunningDaemon, needle: string): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const audit = daemon.stderr();
    if (audit.includes(needle)) {
      return audit;
    }
    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 20);
    });
  }
  throw new Error(`audit_missing:${needle}`);
}

function openTransport(socketPath: string): PicoVaultDaemonSyncTransport {
  const transport = connectPicoVaultDaemonSyncTransport({ socketPath });
  transports.push(transport);
  return transport;
}

function runAccessSession(
  transport: PicoVaultDaemonSyncTransport,
  options: { maxDurationMs?: number } = {},
): PicoReaderCustodySyncPresentedItem | undefined {
  const accessSession = new PicoReaderCustodySyncAccessSession(
    fixture.archiveStore,
    fixture.pins,
    fixture.stateStore,
    { nowMs: () => 1_000 },
    createPicoVaultDaemonReaderAccessUnlockPort(transport),
    { maxDurationMs: options.maxDurationMs ?? 60_000 },
  );
  let presented: PicoReaderCustodySyncPresentedItem | undefined;
  accessSession.run({
    selectItem: (items) => items[0]?.selection,
    presentItem: (item) => {
      presented = { ...item };
    },
  }, { signal: new AbortController().signal });
  return presented;
}

describe('Reader access over the Vault daemon (ADR 0098 S17.5/S17.6)', () => {
  it('presents the item end to end and leaves the lease closed but the session unlocked', async () => {
    const daemon = await startDaemonProcess();
    await holdReaderUnlock(daemon.socketPath);
    const transport = openTransport(daemon.socketPath);

    expect(runAccessSession(transport)).toEqual({
      memoryItemId: 'reader_daemon_memory_0001',
      contentType: 'text/plain',
      createdAt: '2026-07-27T10:03:00.000Z',
      plaintext: PLAINTEXT,
    });

    // Closing a lease ends the run's capability, not the person's unlock
    // window, so an independent second run succeeds within the same window.
    expect(runAccessSession(transport)).toEqual({
      memoryItemId: 'reader_daemon_memory_0001',
      contentType: 'text/plain',
      createdAt: '2026-07-27T10:03:00.000Z',
      plaintext: PLAINTEXT,
    });

    const audit = await waitForAudit(daemon, 'reader_access_lease_closed');
    expect(audit).toContain('"event":"reader_access_open","outcome":"ok"');
    expect(audit).toContain('"event":"reader_access_decrypt_item","outcome":"ok"');
    expect(audit).not.toContain(PLAINTEXT);
    expect(audit).not.toContain(READER_PASSPHRASE);
    expect(audit).not.toContain('reader_daemon_memory_0001');
  }, 60_000);

  it('reports a closed lease as locked and refuses further use of it', async () => {
    const daemon = await startDaemonProcess();
    await holdReaderUnlock(daemon.socketPath);
    const transport = openTransport(daemon.socketPath);

    const session = openPicoVaultDaemonReaderAccessSession(transport, {
      readerKeyFingerprintHex: fixture.pins.readerKeyFingerprintHex,
      maxDurationMs: 60_000,
    });
    expect(session?.metadata()).toEqual({
      keyRole: 'device_key_agreement',
      keyFingerprintHex: fixture.pins.readerKeyFingerprintHex,
    });
    expect(session!.isLocked({ nowMs: 1_000 })).toBe(false);

    session!.lock();
    expect(session!.isLocked({ nowMs: 1_000 })).toBe(true);
    session!.lock();
    expect(() => session!.openPayload({
      batchRecord: {
        schema: 'pico.sync.reader-custody-batch.v1',
        routeRef: fixture.pins.routeRef,
        syncBatchId: 'reader_daemon_batch_0001',
        sealedPayloadHex: 'ab'.repeat(32),
        sealedPayloadDigestHex: 'cd'.repeat(32),
        expiresAt: '2026-07-27T11:00:00.000Z',
      } as never,
      evaluatedAt: '2026-07-27T10:11:00.000Z',
    })).toThrow('reader_access_lease_required');
  }, 60_000);

  it('refuses a wrong reader fingerprint, a second lease and a foreign lease id', async () => {
    const daemon = await startDaemonProcess();
    await holdReaderUnlock(daemon.socketPath);
    const transport = openTransport(daemon.socketPath);

    expect(() => openPicoVaultDaemonReaderAccessSession(transport, {
      readerKeyFingerprintHex: 'ab'.repeat(32),
      maxDurationMs: 60_000,
    })).toThrow('reader_access_key_fingerprint_mismatch');

    const session = openPicoVaultDaemonReaderAccessSession(transport, {
      readerKeyFingerprintHex: fixture.pins.readerKeyFingerprintHex,
      maxDurationMs: 60_000,
    });
    expect(session).toBeDefined();
    expect(() => openPicoVaultDaemonReaderAccessSession(transport, {
      readerKeyFingerprintHex: fixture.pins.readerKeyFingerprintHex,
      maxDurationMs: 60_000,
    })).toThrow('reader_access_lease_active');

    const foreign = openTransport(daemon.socketPath);
    expect(() => foreign.request({
      family: picoVaultDaemonRequestFamilies.readerAccessIsLocked,
      leaseId: '99'.repeat(16),
    })).not.toThrow();
    expect(foreign.request({
      family: picoVaultDaemonRequestFamilies.readerAccessIsLocked,
      leaseId: '99'.repeat(16),
    }).locked).toBe(true);
  }, 60_000);

  it('fails closed when the vault is locked and when the hold connection disappears', async () => {
    const daemon = await startDaemonProcess();
    const lockedTransport = openTransport(daemon.socketPath);
    expect(openPicoVaultDaemonReaderAccessSession(lockedTransport, {
      readerKeyFingerprintHex: fixture.pins.readerKeyFingerprintHex,
      maxDurationMs: 60_000,
    })).toBeUndefined();
    expect(() => runAccessSession(lockedTransport))
      .toThrow('reader_sync_access_session_unavailable');

    const hold = await holdReaderUnlock(daemon.socketPath);
    const transport = openTransport(daemon.socketPath);
    const session = openPicoVaultDaemonReaderAccessSession(transport, {
      readerKeyFingerprintHex: fixture.pins.readerKeyFingerprintHex,
      maxDurationMs: 60_000,
    });
    expect(session!.isLocked({ nowMs: 1_000 })).toBe(false);

    await hold.close();
    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 200);
    });
    expect(session!.isLocked({ nowMs: 1_000 })).toBe(true);
  }, 60_000);

  it('expires a lease on its own deadline while the session stays unlocked', async () => {
    const daemon = await startDaemonProcess();
    await holdReaderUnlock(daemon.socketPath);
    const transport = openTransport(daemon.socketPath);

    const session = openPicoVaultDaemonReaderAccessSession(transport, {
      readerKeyFingerprintHex: fixture.pins.readerKeyFingerprintHex,
      maxDurationMs: 1,
    });
    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 50);
    });
    expect(session!.isLocked({ nowMs: 1_000 })).toBe(true);
    await waitForAudit(daemon, 'lease_expired');

    // The person's unlock window outlives the expired lease, so a fresh lease
    // is available without a second unlock.
    expect(openPicoVaultDaemonReaderAccessSession(transport, {
      readerKeyFingerprintHex: fixture.pins.readerKeyFingerprintHex,
      maxDurationMs: 60_000,
    })).toBeDefined();
  }, 60_000);

  it('keeps the control frame cap for connections without a lease', async () => {
    const daemon = await startDaemonProcess();
    const reason = await new Promise<string>((resolvePromise, rejectPromise) => {
      const socket = createConnection(daemon.socketPath);
      let buffered = Buffer.alloc(0);
      socket.on('error', rejectPromise);
      socket.on('connect', () => {
        const header = Buffer.alloc(4);
        header.writeUInt32BE(1024 * 1024, 0);
        socket.write(header);
      });
      socket.on('data', (chunk) => {
        buffered = Buffer.concat([buffered, chunk]);
        if (buffered.byteLength < 4) {
          return;
        }
        const bodyLength = buffered.readUInt32BE(0);
        if (buffered.byteLength < 4 + bodyLength) {
          return;
        }
        const parsed: unknown = JSON.parse(
          buffered.subarray(4, 4 + bodyLength).toString('utf8'),
        );
        socket.destroy();
        resolvePromise((parsed as { reason: string }).reason);
      });
    });
    expect(reason).toBe('frame_too_large');
  }, 60_000);
});
