import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { picoIdentitySuite } from '@pico/protocol';
import {
  createPicoReaderCustodyDomain,
  createPicoReaderCustodySyncBatch,
  createPicoReaderCustodyWriterGrant,
  createPicoVaultKeyfile,
  encryptPicoReaderCustodyItem,
  openPicoReaderCustodySyncBatch,
  openPicoVaultKeyfile,
  writePicoVaultKeyfile,
  type CreatePicoVaultKeyfileResult,
} from '@pico/vault';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPicoVaultDaemonCeremonySigner } from './index.js';

const IDENTITY_PASSPHRASE = 'owner identity passphrase';
const PLAINTEXT = 'ceremony chain plaintext that transport never sees';
const DAEMON_CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');

const temporaryDirectories: string[] = [];
const childProcesses: ChildProcess[] = [];
const signerClosers: (() => void)[] = [];

let ownerIdentity: CreatePicoVaultKeyfileResult;
let ownerAgreement: CreatePicoVaultKeyfileResult;
let readerAgreement: CreatePicoVaultKeyfileResult;
let writerSigning: CreatePicoVaultKeyfileResult;

beforeAll(async () => {
  await sodium.ready;
  ownerIdentity = createPicoVaultKeyfile(sodium, {
    keyRole: 'pico_identity',
    passphrase: IDENTITY_PASSPHRASE,
  });
  ownerAgreement = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_key_agreement',
    passphrase: 'owner agreement passphrase',
  });
  readerAgreement = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_key_agreement',
    passphrase: 'reader agreement passphrase',
  });
  writerSigning = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_signing',
    passphrase: 'writer signing passphrase',
  });
}, 60_000);

afterEach(() => {
  for (const close of signerClosers.splice(0)) {
    close();
  }
  for (const child of childProcesses.splice(0)) {
    child.kill('SIGKILL');
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const directory = mkdtempSync(join('/tmp', prefix));
  temporaryDirectories.push(directory);
  return directory;
}

interface RunningDaemon {
  socketPath: string;
  vaultHomePath: string;
  stderr: () => string;
}

async function startDaemonProcess(): Promise<RunningDaemon> {
  const home = tempDir('pico-cs-home-');
  writePicoVaultKeyfile(
    join(home, 'keyfiles', `pico_identity-${ownerIdentity.keyFingerprintHex}.json`),
    ownerIdentity.keyfile,
  );

  const child = spawn(process.execPath, [
    DAEMON_CLI,
    'daemon',
    '--vault-home', home,
    '--foundation-data', tempDir('pico-cs-data-'),
    '--foundation-backup', tempDir('pico-cs-backup-'),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  childProcesses.push(child);

  let stderr = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => {
    stderr += chunk;
  });

  const socketPath = await new Promise<string>((resolvePromise, rejectPromise) => {
    let stdout = '';
    const timer = setTimeout(() => {
      rejectPromise(new Error(`daemon_start_timeout:${stderr}`));
    }, 20_000);
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => {
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

  return { socketPath, vaultHomePath: home, stderr: () => stderr };
}

/**
 * The person: a real scripted `pico-vault unlock`. Answers are queued ahead of
 * time rather than written in reaction to each prompt, because a ceremony
 * signature blocks this very thread (ADR 0098/0100) - a reactive approver
 * could never observe a prompt raised while the consumer is waiting for it.
 */
async function startApproverProcess(
  daemon: RunningDaemon,
  answer: 'y' | 'n',
): Promise<{ approvals: () => number; stderr: () => string }> {
  const child = spawn(process.execPath, [
    DAEMON_CLI,
    'unlock',
    '--vault-home', daemon.vaultHomePath,
    '--role', 'pico_identity',
    '--fingerprint', ownerIdentity.keyFingerprintHex,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  childProcesses.push(child);

  let stderr = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => {
    stderr += chunk;
  });
  child.stdin!.write(`${IDENTITY_PASSPHRASE}\n`);

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      rejectPromise(new Error(`approver_unlock_timeout:${stderr}`));
    }, 20_000);
    const poll = setInterval(() => {
      if (stderr.includes('Vault unlocked.')) {
        clearTimeout(timer);
        clearInterval(poll);
        resolvePromise();
      }
    }, 25);
    child.once('exit', (code) => {
      clearTimeout(timer);
      clearInterval(poll);
      rejectPromise(new Error(`approver_exited:${String(code)}:${stderr}`));
    });
  });

  // Queue answers only after the passphrase read has completed, so the two
  // sequential reads cannot consume each other's input.
  child.stdin!.write(`${answer}\n`.repeat(8));

  return {
    approvals: () => stderr.split('Approve? [y/N]').length - 1,
    stderr: () => stderr,
  };
}

async function waitFor(condition: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (condition()) {
      return;
    }
    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 20);
    });
  }
  throw new Error(`wait_for_timeout:${label}`);
}

function openSigner(daemon: RunningDaemon): ReturnType<typeof createPicoVaultDaemonCeremonySigner> {
  const signer = createPicoVaultDaemonCeremonySigner({
    socketPath: daemon.socketPath,
    keyRole: 'pico_identity',
    keyFingerprintHex: ownerIdentity.keyFingerprintHex,
  });
  signerClosers.push(signer.close);
  return signer;
}

describe('Identity ceremony signing over the Vault daemon (ADR 0100 C2/C4)', () => {
  it('signs an exempt checkpoint without any approval being raised', async () => {
    const daemon = await startDaemonProcess();
    await startApproverProcess(daemon, 'y');
    const signer = openSigner(daemon);

    expect(signer.metadata()).toEqual({
      suite: picoIdentitySuite,
      keyRole: 'pico_identity',
      publicKeyHex: ownerIdentity.publicKeyHex,
      keyFingerprintHex: ownerIdentity.keyFingerprintHex,
    });

    const { createPicoIdentityReaderKeyFreshnessCheckpoint } = await import('@pico/vault');
    const checkpoint = createPicoIdentityReaderKeyFreshnessCheckpoint({
      identitySession: signer,
      checkpointId: 'ceremony_checkpoint_0001',
      homeId: 'home_ceremony_0001',
      deviceSigningKeyFingerprintHex: '22'.repeat(32),
      deviceKeyAgreementKeyFingerprintHex: '33'.repeat(32),
      delegationId: 'ceremony_delegation_0001',
      status: 'current',
      observedThroughLifecycleOrder: 'seq:0000000000000001',
      checkedAt: '2026-07-27T10:00:00.000Z',
      freshUntil: '2026-07-27T10:04:00.000Z',
    });
    expect(checkpoint.issuerIdentityKeyRecord.publicKeyHex).toBe(ownerIdentity.publicKeyHex);

    await waitFor(() => daemon.stderr().includes('"event":"sign","outcome":"ok"'), 'sign');
    expect(daemon.stderr()).not.toContain('approval_requested');
  }, 60_000);

  it('runs the gated domain, writer grant, item and batch chain with hold-terminal approvals', async () => {
    const daemon = await startDaemonProcess();
    const approver = await startApproverProcess(daemon, 'y');
    const signer = openSigner(daemon);

    // The root signs remotely behind approval; the agreement and writer keys
    // stay local, exactly the hybrid boundary ADR 0100 records.
    const ownerAgreementSession = openPicoVaultKeyfile(sodium, {
      keyfile: ownerAgreement.keyfile,
      passphrase: 'owner agreement passphrase',
    });
    const readerAgreementSession = openPicoVaultKeyfile(sodium, {
      keyfile: readerAgreement.keyfile,
      passphrase: 'reader agreement passphrase',
    });
    const writerSigningSession = openPicoVaultKeyfile(sodium, {
      keyfile: writerSigning.keyfile,
      passphrase: 'writer signing passphrase',
    });

    const domainRecord = createPicoReaderCustodyDomain(sodium, {
      ownerIdentitySession: signer,
      ownerReaderKeyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'device_key_agreement',
        publicKeyHex: ownerAgreement.publicKeyHex,
      },
      domainAuthorityId: 'ceremony_domain_authority_0001',
      homeId: 'home_ceremony_0001',
      hostSigningKeyFingerprintHex: '11'.repeat(32),
      domainId: 'ceremony_domain_0001',
      authorizedAt: '2026-07-27T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000001',
    });
    const writerGrantRecord = createPicoReaderCustodyWriterGrant(sodium, {
      ownerIdentitySession: signer,
      domainRecord,
      writerDeviceSigningKeyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'device_signing',
        publicKeyHex: writerSigning.publicKeyHex,
      },
      writerGrantId: 'ceremony_writer_grant_0001',
      writerIdentityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      validFrom: '2026-07-27T10:00:00.000Z',
      validUntil: '2027-07-27T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000002',
    });
    const itemRecord = encryptPicoReaderCustodyItem(sodium, {
      readerKeyAgreementSession: ownerAgreementSession,
      writerSigningSession,
      domainRecord,
      writerGrantRecord,
      packageId: 'ceremony_package_0001',
      memoryItemId: 'ceremony_memory_0001',
      contentType: 'text/plain',
      plaintext: PLAINTEXT,
      createdAt: '2026-07-27T10:03:00.000Z',
    });

    const { createPicoReaderCustodyReaderGrant } = await import('@pico/vault');
    const readerGrantRecord = createPicoReaderCustodyReaderGrant(sodium, {
      ownerIdentitySession: signer,
      ownerReaderKeyAgreementSession: ownerAgreementSession,
      domainRecord,
      readerKeyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'device_key_agreement',
        publicKeyHex: readerAgreement.publicKeyHex,
      },
      readerGrantId: 'ceremony_reader_grant_0001',
      readerIdentityKeyFingerprintHex: '44'.repeat(32),
      readerDeviceSigningKeyFingerprintHex: '55'.repeat(32),
      readerDelegationId: 'ceremony_delegation_0001',
      accessMode: 'from_version',
      firstKekVersion: 1,
      validFrom: '2026-07-27T10:00:00.000Z',
      validUntil: '2027-07-27T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000003',
    });

    const batch = createPicoReaderCustodySyncBatch(sodium, {
      ownerIdentitySession: signer,
      domainRecord,
      readerGrantRecord,
      writerGrantRecords: [writerGrantRecord],
      itemRecords: [itemRecord],
      syncBatchId: 'ceremony_batch_0001',
      routeRef: `route_${'B'.repeat(48)}`,
      sequence: 1,
      previousManifestDigestHex: '00'.repeat(32),
      createdAt: '2026-07-27T10:10:00.000Z',
      expiresAt: '2026-07-27T11:00:00.000Z',
    });

    // The records signed by the daemon-held root must be indistinguishable
    // from library-signed ones: the reader-side verification chain accepts
    // the sealed batch and decrypts the item.
    const payload = openPicoReaderCustodySyncBatch(sodium, {
      readerKeyAgreementSession: readerAgreementSession,
      batchRecord: batch.batchRecord,
      evaluatedAt: '2026-07-27T10:11:00.000Z',
    });
    expect(payload.itemRecords).toHaveLength(1);

    // Five, because every share envelope is signed on top of the record that
    // carries it: domain record, domain owner self-envelope, writer grant,
    // reader-grant envelope, reader-grant record. The item signature (local
    // writer key) and the sync manifest are exempt. This count is what
    // corrected the ADR 0100 approval-load analysis - a rotation costs one
    // approval per remaining reader on the same rule.
    const approved = '"event":"approval_decided","outcome":"ok","approved":true';
    await waitFor(
      () => daemon.stderr().split(approved).length - 1 >= 5,
      'five approvals',
    );
    expect(daemon.stderr().split(approved).length - 1).toBe(5);
    expect(approver.approvals()).toBe(5);
    expect(daemon.stderr()).not.toContain(PLAINTEXT);

    for (const session of [ownerAgreementSession, readerAgreementSession, writerSigningSession]) {
      session.lock();
    }
  }, 120_000);

  it('fails the ceremony with approval_denied when the person answers no', async () => {
    const daemon = await startDaemonProcess();
    await startApproverProcess(daemon, 'n');
    const signer = openSigner(daemon);

    const localIdentitySession = openPicoVaultKeyfile(sodium, {
      keyfile: ownerIdentity.keyfile,
      passphrase: IDENTITY_PASSPHRASE,
    });
    const domainRecord = createPicoReaderCustodyDomain(sodium, {
      ownerIdentitySession: localIdentitySession,
      ownerReaderKeyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'device_key_agreement',
        publicKeyHex: ownerAgreement.publicKeyHex,
      },
      domainAuthorityId: 'ceremony_domain_authority_0002',
      homeId: 'home_ceremony_0002',
      hostSigningKeyFingerprintHex: '11'.repeat(32),
      domainId: 'ceremony_domain_0002',
      authorizedAt: '2026-07-27T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000001',
    });
    localIdentitySession.lock();

    expect(() => createPicoReaderCustodyWriterGrant(sodium, {
      ownerIdentitySession: signer,
      domainRecord,
      writerDeviceSigningKeyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'device_signing',
        publicKeyHex: writerSigning.publicKeyHex,
      },
      writerGrantId: 'ceremony_writer_grant_0002',
      writerIdentityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      validFrom: '2026-07-27T10:00:00.000Z',
      validUntil: '2027-07-27T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000002',
    })).toThrow('approval_denied');
  }, 60_000);

  it('refuses a signer against a locked daemon and against the wrong key', async () => {
    const daemon = await startDaemonProcess();

    expect(() => createPicoVaultDaemonCeremonySigner({
      socketPath: daemon.socketPath,
      keyRole: 'pico_identity',
      keyFingerprintHex: ownerIdentity.keyFingerprintHex,
    })).toThrow('vault_locked');

    await startApproverProcess(daemon, 'y');
    expect(() => createPicoVaultDaemonCeremonySigner({
      socketPath: daemon.socketPath,
      keyRole: 'pico_identity',
      keyFingerprintHex: 'ab'.repeat(32),
    })).toThrow('ceremony_signer_key_mismatch');
    expect(() => createPicoVaultDaemonCeremonySigner({
      socketPath: daemon.socketPath,
      keyRole: 'pico_identity',
      keyFingerprintHex: ownerIdentity.keyFingerprintHex,
      requestTimeoutMs: 30_000,
    })).toThrow('invalid_ceremony_signer_timeout_ms');
  }, 60_000);
});
