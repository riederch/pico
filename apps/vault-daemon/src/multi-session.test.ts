import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { picoIdentitySuite } from '@pico/protocol';
import type {
  PicoReaderCustodyDomainRecord,
  PicoReaderCustodyReaderGrantRecord,
} from '@pico/protocol';
import {
  createPicoReaderCustodyDomain,
  createPicoReaderCustodyWriterGrant,
  createPicoVaultKeyfile,
  decryptPicoReaderCustodyItem,
  encryptPicoReaderCustodyItem,
  openPicoVaultKeyfile,
  writePicoVaultKeyfile,
  type CreatePicoVaultKeyfileResult,
  type PicoVaultSession,
} from '@pico/vault';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  connectPicoVaultDaemonClient,
  picoVaultDaemonRequestFamilies,
  startPicoVaultDaemon,
  type PicoVaultDaemon,
  type PicoVaultDaemonApprovalRequestDescriptor,
  type PicoVaultDaemonClient,
} from './index.js';

const PLAINTEXT = 'two-role ceremony plaintext';

const temporaryDirectories: string[] = [];
const daemons: PicoVaultDaemon[] = [];
const clients: PicoVaultDaemonClient[] = [];
const localSessions: PicoVaultSession[] = [];

interface Fixture {
  result: CreatePicoVaultKeyfileResult;
  role: 'pico_identity' | 'device_key_agreement' | 'device_signing';
  passphrase: string;
}

let ownerIdentity: Fixture;
let ownerAgreement: Fixture;
let readerAgreement: Fixture;
let writerSigning: Fixture;

function makeFixture(
  role: Fixture['role'],
  passphrase: string,
): Fixture {
  return { result: createPicoVaultKeyfile(sodium, { keyRole: role, passphrase }), role, passphrase };
}

beforeAll(async () => {
  await sodium.ready;
  ownerIdentity = makeFixture('pico_identity', 'owner identity passphrase');
  ownerAgreement = makeFixture('device_key_agreement', 'owner agreement passphrase');
  readerAgreement = makeFixture('device_key_agreement', 'reader agreement passphrase');
  writerSigning = makeFixture('device_signing', 'writer signing passphrase');
}, 60_000);

afterEach(async () => {
  for (const session of localSessions.splice(0)) {
    session.lock();
  }
  for (const client of clients.splice(0)) {
    await client.close();
  }
  for (const daemon of daemons.splice(0)) {
    await daemon.close();
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function startDaemon(
  seeds: Fixture[] = [ownerIdentity, ownerAgreement],
  approvalWaitMs?: number,
): Promise<{ daemon: PicoVaultDaemon; audit: string[] }> {
  const home = tempDir('pico-ms-');
  for (const seed of seeds) {
    writePicoVaultKeyfile(
      join(home, 'keyfiles', `${seed.role}-${seed.result.keyFingerprintHex}.json`),
      seed.result.keyfile,
    );
  }
  const audit: string[] = [];
  const daemon = await startPicoVaultDaemon({
    sodium,
    vaultHomePath: home,
    foundationDataPath: tempDir('pico-ms-data-'),
    foundationBackupPath: tempDir('pico-ms-backup-'),
    auditSink: (line) => {
      audit.push(line);
    },
    ...(approvalWaitMs === undefined ? {} : { approvalWaitMs }),
  });
  daemons.push(daemon);
  return { daemon, audit };
}

async function openClient(daemon: PicoVaultDaemon): Promise<PicoVaultDaemonClient> {
  const client = await connectPicoVaultDaemonClient({ socketPath: daemon.socketPath });
  clients.push(client);
  await client.hello();
  return client;
}

/** Each unlock gets its own connection, exactly as a second terminal would. */
async function holdUnlock(
  daemon: PicoVaultDaemon,
  fixture: Fixture,
): Promise<PicoVaultDaemonClient> {
  const client = await openClient(daemon);
  await client.unlock({
    keyRole: fixture.role,
    keyFingerprintHex: fixture.result.keyFingerprintHex,
    passphrase: fixture.passphrase,
  });
  return client;
}

function startApprovalWait(
  client: PicoVaultDaemonClient,
): Promise<PicoVaultDaemonApprovalRequestDescriptor | null> {
  return client.approvalWait().then((result) => result.pending);
}

function openLocal(fixture: Fixture): PicoVaultSession {
  const session = openPicoVaultKeyfile(sodium, {
    keyfile: fixture.result.keyfile,
    passphrase: fixture.passphrase,
  });
  localSessions.push(session);
  return session;
}

function localDomain(): PicoReaderCustodyDomainRecord {
  return createPicoReaderCustodyDomain(sodium, {
    ownerIdentitySession: openLocal(ownerIdentity),
    ownerReaderKeyRecord: {
      suite: picoIdentitySuite,
      keyRole: 'device_key_agreement',
      publicKeyHex: ownerAgreement.result.publicKeyHex,
    },
    domainAuthorityId: 'ms_domain_authority_0001',
    homeId: 'home_multi_session_0001',
    hostSigningKeyFingerprintHex: '11'.repeat(32),
    domainId: 'ms_domain_0001',
    authorizedAt: '2026-07-27T10:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000001',
  });
}

function readerGrantInput(
  domainRecord: PicoReaderCustodyDomainRecord,
): Record<string, unknown> {
  return {
    signerKeyFingerprintHex: ownerIdentity.result.keyFingerprintHex,
    agreementKeyFingerprintHex: ownerAgreement.result.keyFingerprintHex,
    domainRecord: domainRecord as unknown as Record<string, unknown>,
    rotationRecords: [],
    readerKeyRecord: {
      suite: picoIdentitySuite,
      keyRole: 'device_key_agreement',
      publicKeyHex: readerAgreement.result.publicKeyHex,
    },
    readerGrantId: 'ms_reader_grant_0001',
    readerIdentityKeyFingerprintHex: '44'.repeat(32),
    readerDeviceSigningKeyFingerprintHex: '55'.repeat(32),
    readerDelegationId: 'ms_delegation_0001',
    accessMode: 'from_version',
    firstKekVersion: 1,
    validFrom: '2026-07-27T10:00:00.000Z',
    validUntil: '2027-07-27T10:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000002',
  };
}

describe('Multi-session unlock (ADR 0102 M1/M2/M3)', () => {
  it('holds two sessions at once, each locked by its own connection', async () => {
    const { daemon, audit } = await startDaemon();
    const identityHold = await holdUnlock(daemon, ownerIdentity);
    await holdUnlock(daemon, ownerAgreement);
    const observer = await openClient(daemon);

    const status = await observer.status();
    expect(status.locked).toBe(false);
    expect(status.sessions.map((session) => session.keyFingerprintHex).sort()).toEqual(
      [ownerIdentity.result.keyFingerprintHex, ownerAgreement.result.keyFingerprintHex].sort(),
    );

    // Closing one terminal locks that key and leaves the other untouched.
    await identityHold.close();
    await sleep(120);
    const afterClose = await observer.status();
    expect(afterClose.locked).toBe(false);
    expect(afterClose.sessions.map((session) => session.keyFingerprintHex)).toEqual([
      ownerAgreement.result.keyFingerprintHex,
    ]);
    expect(audit.join('')).toContain('"cause":"hold_connection_closed"');
  }, 60_000);

  it('names the key it signs with and never substitutes another', async () => {
    const { daemon } = await startDaemon();
    await holdUnlock(daemon, ownerAgreement);
    const consumer = await openClient(daemon);

    // The identity keyfile exists on disk but only the agreement key is
    // unlocked; naming the identity key must fail rather than fall back.
    await expect(consumer.sign({
      keyFingerprintHex: ownerIdentity.result.keyFingerprintHex,
      signatureInputHex: '00'.repeat(8),
    })).rejects.toThrow('unknown_unlocked_key');
  }, 60_000);

  it('refuses more concurrent sessions than the cap allows', async () => {
    const extra = makeFixture('device_key_agreement', 'extra passphrase');
    const fifth = makeFixture('device_signing', 'fifth passphrase');
    const { daemon } = await startDaemon([
      ownerIdentity, ownerAgreement, readerAgreement, extra, fifth,
    ]);
    for (const fixture of [ownerIdentity, ownerAgreement, readerAgreement, extra]) {
      await holdUnlock(daemon, fixture);
    }
    const overflow = await openClient(daemon);
    await expect(overflow.unlock({
      keyRole: fifth.role,
      keyFingerprintHex: fifth.result.keyFingerprintHex,
      passphrase: fifth.passphrase,
    })).rejects.toThrow('too_many_unlocked_sessions');
  }, 60_000);
});

describe('Two-role reader-grant ceremony (ADR 0102 M4/M5)', () => {
  it('creates a reader grant under one approval whose envelope the reader opens', async () => {
    const { daemon, audit } = await startDaemon();
    const identityHold = await holdUnlock(daemon, ownerIdentity);
    await holdUnlock(daemon, ownerAgreement);
    const consumer = await openClient(daemon);
    const domainRecord = localDomain();

    const waiting = startApprovalWait(identityHold);
    await sleep(50);
    const granting = consumer.ceremonyCreateReaderGrant(readerGrantInput(domainRecord) as never);
    const pending = await waiting;
    expect(pending!.label).toBe(picoVaultDaemonRequestFamilies.ceremonyCreateReaderGrant);
    expect(pending!.summary).toEqual({
      domainId: 'ms_domain_0001',
      readerGrantId: 'ms_reader_grant_0001',
      accessMode: 'from_version',
      historicalVersions: 0,
    });
    await identityHold.approvalDecide({
      approvalId: pending!.approvalId,
      signatureInputDigestHex: pending!.signatureInputDigestHex,
      approved: true,
    });

    const granted = await granting;
    const readerGrantRecord =
      granted.readerGrantRecord as unknown as PicoReaderCustodyReaderGrantRecord;

    // The envelope the daemon re-sealed must open with the reader's own key:
    // an item written under the domain KEK decrypts through this grant.
    const writerGrantRecord = createPicoReaderCustodyWriterGrant(sodium, {
      ownerIdentitySession: openLocal(ownerIdentity),
      domainRecord,
      writerDeviceSigningKeyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'device_signing',
        publicKeyHex: writerSigning.result.publicKeyHex,
      },
      writerGrantId: 'ms_writer_grant_0001',
      writerIdentityKeyFingerprintHex: ownerIdentity.result.keyFingerprintHex,
      validFrom: '2026-07-27T10:00:00.000Z',
      validUntil: '2027-07-27T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000003',
    });
    const itemRecord = encryptPicoReaderCustodyItem(sodium, {
      readerKeyAgreementSession: openLocal(ownerAgreement),
      writerSigningSession: openLocal(writerSigning),
      domainRecord,
      writerGrantRecord,
      packageId: 'ms_package_0001',
      memoryItemId: 'ms_memory_0001',
      contentType: 'text/plain',
      plaintext: PLAINTEXT,
      createdAt: '2026-07-27T10:03:00.000Z',
    });
    expect(decryptPicoReaderCustodyItem(sodium, {
      readerKeyAgreementSession: openLocal(readerAgreement),
      domainRecord,
      readerGrantRecord,
      writerGrantRecord,
      itemRecord,
    })).toBe(PLAINTEXT);

    const auditText = audit.join('');
    expect(auditText.split('"event":"approval_decided"').length - 1).toBe(1);
    expect(auditText).toContain('"event":"ceremony_completed","outcome":"ok"');
    expect(auditText).not.toContain(PLAINTEXT);
  }, 60_000);

  it('routes the approval to the signing key holder, not another holder', async () => {
    const { daemon } = await startDaemon(undefined, 400);
    const identityHold = await holdUnlock(daemon, ownerIdentity);
    const agreementHold = await holdUnlock(daemon, ownerAgreement);
    const consumer = await openClient(daemon);
    const domainRecord = localDomain();

    // The agreement key's holder is watching, but the ceremony is signed by
    // the identity root - whose holder is not - so it fails closed.
    const agreementWaiting = startApprovalWait(agreementHold);
    await sleep(50);
    await expect(consumer.ceremonyCreateReaderGrant(readerGrantInput(domainRecord) as never))
      .rejects.toThrow('approval_unavailable');
    expect(await agreementWaiting).toBeNull();

    const identityWaiting = startApprovalWait(identityHold);
    await sleep(50);
    const granting = consumer.ceremonyCreateReaderGrant(readerGrantInput(domainRecord) as never)
      .then(() => ({ ok: true as const }), (error: unknown) => ({
        ok: false as const,
        reason: error instanceof Error ? error.message : String(error),
      }));
    const pending = await identityWaiting;
    expect(pending).not.toBeNull();

    // The other holder may not decide it either.
    await expect(agreementHold.approvalDecide({
      approvalId: pending!.approvalId,
      signatureInputDigestHex: pending!.signatureInputDigestHex,
      approved: true,
    })).rejects.toThrow('approval_decision_forbidden');

    await identityHold.approvalDecide({
      approvalId: pending!.approvalId,
      signatureInputDigestHex: pending!.signatureInputDigestHex,
      approved: false,
    });
    expect(await granting).toEqual({ ok: false, reason: 'approval_denied' });
  }, 60_000);

  it('refuses the ceremony when the agreement key is not unlocked', async () => {
    const { daemon } = await startDaemon();
    const identityHold = await holdUnlock(daemon, ownerIdentity);
    const consumer = await openClient(daemon);
    const domainRecord = localDomain();

    const waiting = startApprovalWait(identityHold);
    await sleep(50);
    await expect(consumer.ceremonyCreateReaderGrant(readerGrantInput(domainRecord) as never))
      .rejects.toThrow('unknown_unlocked_key');
    // The person was never asked about a ceremony that could not run.
    expect(await waiting).toBeNull();
  }, 60_000);
});
