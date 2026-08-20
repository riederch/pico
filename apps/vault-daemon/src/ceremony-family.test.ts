import { mkdtempSync, rmSync } from 'node:fs';
import { createConnection, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { picoIdentitySuite, picoRecoveryCardSchema } from '@pico/protocol';
import {
  createPicoReaderCustodyDomain,
  createPicoReaderCustodyReaderGrant,
  createPicoReaderCustodyWriterGrant,
  createPicoVaultKeyfile,
  encryptPicoReaderCustodyItem,
  openPicoVaultKeyfile,
  restorePicoVaultIdentityFromRecovery,
  writePicoVaultKeyfile,
  type CreatePicoVaultKeyfileResult,
  type PicoVaultSession,
} from '@pico/vault';
import type {
  PicoReaderCustodyDomainRecord,
  PicoReaderCustodyKekRotationRecord,
} from '@pico/protocol';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { picoDisplayFingerprint } from '@pico/protocol/fingerprint-display';
import {
  connectPicoVaultDaemonClient,
  encodePicoVaultDaemonFrame,
  parsePicoVaultDaemonRequest,
  parsePicoVaultDaemonResponse,
  picoVaultDaemonProtocolVersion,
  picoVaultDaemonRequestFamilies,
  startPicoVaultDaemon,
  PicoVaultDaemonFrameDecoder,
  type PicoVaultDaemon,
  type PicoVaultDaemonApprovalRequestDescriptor,
  type PicoVaultDaemonClient,
  type PicoVaultDaemonOptions,
  type PicoVaultDaemonResponse,
} from './index.js';

const IDENTITY_PASSPHRASE = 'owner identity passphrase';

const temporaryDirectories: string[] = [];
const daemons: PicoVaultDaemon[] = [];
const clients: PicoVaultDaemonClient[] = [];
const rawSockets: Socket[] = [];
const localSessions: PicoVaultSession[] = [];

let ownerIdentity: CreatePicoVaultKeyfileResult;
let ownerAgreement: CreatePicoVaultKeyfileResult;
let readerAgreement: CreatePicoVaultKeyfileResult;
let secondReaderAgreement: CreatePicoVaultKeyfileResult;
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
  secondReaderAgreement = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_key_agreement',
    passphrase: 'second reader agreement passphrase',
  });
  writerSigning = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_signing',
    passphrase: 'writer signing passphrase',
  });
}, 60_000);

afterEach(async () => {
  for (const session of localSessions.splice(0)) {
    session.lock();
  }
  for (const socket of rawSockets.splice(0)) {
    socket.destroy();
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

function openLocal(
  fixture: CreatePicoVaultKeyfileResult,
  passphrase: string,
): PicoVaultSession {
  const session = openPicoVaultKeyfile(sodium, { keyfile: fixture.keyfile, passphrase });
  localSessions.push(session);
  return session;
}

async function startDaemon(
  seed: CreatePicoVaultKeyfileResult = ownerIdentity,
  seedRole = 'pico_identity',
  overrides: Partial<PicoVaultDaemonOptions> = {},
): Promise<{ daemon: PicoVaultDaemon; audit: string[] }> {
  const home = tempDir('pico-cf-');
  writePicoVaultKeyfile(
    join(home, 'keyfiles', `${seedRole}-${seed.keyFingerprintHex}.json`),
    seed.keyfile,
  );
  const audit: string[] = [];
  const daemon = await startPicoVaultDaemon({
    sodium,
    vaultHomePath: home,
    foundationDataPath: tempDir('pico-cf-data-'),
    foundationBackupPath: tempDir('pico-cf-backup-'),
    auditSink: (line) => {
      audit.push(line);
    },
    ...overrides,
  });
  daemons.push(daemon);
  return { daemon, audit };
}

async function startFreshDaemon(): Promise<{
  daemon: PicoVaultDaemon;
  audit: string[];
}> {
  const audit: string[] = [];
  const daemon = await startPicoVaultDaemon({
    sodium,
    vaultHomePath: tempDir('pico-cf-fresh-'),
    foundationDataPath: tempDir('pico-cf-fresh-data-'),
    foundationBackupPath: tempDir('pico-cf-fresh-backup-'),
    auditSink: (line) => { audit.push(line); },
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

async function holdUnlock(
  daemon: PicoVaultDaemon,
  fixture: CreatePicoVaultKeyfileResult = ownerIdentity,
  keyRole: 'pico_identity' | 'device_key_agreement' = 'pico_identity',
  passphrase: string = IDENTITY_PASSPHRASE,
): Promise<PicoVaultDaemonClient> {
  const client = await openClient(daemon);
  await client.unlock({ keyRole, keyFingerprintHex: fixture.keyFingerprintHex, passphrase });
  return client;
}

const approvalChannelsSynchronised = new WeakSet<PicoVaultDaemonClient>();

/**
 * Parks an `approval.wait` and returns its promise once the daemon has
 * recorded this connection as an approval channel.
 *
 * A fixed sleep here only makes the race unlikely: a gated request that
 * arrives before the wait lands fails closed with `approval_unavailable` -
 * correct runtime behaviour, and a flaky test. Waiting for the daemon's own
 * record removes the guess.
 *
 * The daemon audits `approval_watch_started` once per connection, so this can
 * only synchronise a connection's first wait. A second use on the same
 * connection throws instead of silently going back to hoping.
 */
async function startApprovalWait(
  client: PicoVaultDaemonClient,
  audit: readonly string[],
): Promise<{ waiting: Promise<PicoVaultDaemonApprovalRequestDescriptor | null> }> {
  if (approvalChannelsSynchronised.has(client)) {
    throw new Error(
      'approval_watch_started is audited once per connection; this helper '
      + 'cannot synchronise a second wait on the same connection.',
    );
  }
  approvalChannelsSynchronised.add(client);

  const countWatchStarts = (): number =>
    audit.filter((line) => line.includes('"event":"approval_watch_started"')).length;
  const before = countWatchStarts();
  const waiting = client.approvalWait().then((result) => result.pending);

  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (countWatchStarts() > before) {
      // Wrapped, because returning the promise bare from an async function
      // would flatten it: the caller would await the approval itself, which
      // only arrives once the caller triggers the gated request below.
      return { waiting };
    }
    await sleep(20);
  }

  throw new Error('wait_for_timeout:approval_watch_started');
}

function ownerReaderKeyRecord(): { suite: string; keyRole: string; publicKeyHex: string } {
  return {
    suite: picoIdentitySuite,
    keyRole: 'device_key_agreement',
    publicKeyHex: ownerAgreement.publicKeyHex,
  };
}

function createDomainInput(domainId: string): Record<string, unknown> {
  return {
    signerKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
    ownerReaderKeyRecord: ownerReaderKeyRecord(),
    domainAuthorityId: `cf_domain_authority_${domainId}`,
    homeId: 'home_ceremony_family_0001',
    hostSigningKeyFingerprintHex: '11'.repeat(32),
    domainId: `cf_domain_${domainId}`,
    authorizedAt: '2026-07-27T10:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000001',
  };
}

/**
 * Proves a domain record's sealed KEK cryptographically: encrypting an item
 * requires unwrapping the owner self-envelope with the real agreement key and
 * a writer grant that chains off the domain's identity signature.
 */
function proveDomainUsable(
  domainRecord: PicoReaderCustodyDomainRecord,
  rotationRecords: PicoReaderCustodyKekRotationRecord[] = [],
): void {
  const identitySession = openLocal(ownerIdentity, IDENTITY_PASSPHRASE);
  const agreementSession = openLocal(ownerAgreement, 'owner agreement passphrase');
  const writerSession = openLocal(writerSigning, 'writer signing passphrase');

  const writerGrantRecord = createPicoReaderCustodyWriterGrant(sodium, {
    ownerIdentitySession: identitySession,
    domainRecord,
    rotationRecords,
    writerDeviceSigningKeyRecord: {
      suite: picoIdentitySuite,
      keyRole: 'device_signing',
      publicKeyHex: writerSigning.publicKeyHex,
    },
    writerGrantId: `cf_writer_grant_${domainRecord.domain.domainId}`,
    writerIdentityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
    validFrom: '2026-07-27T10:30:00.000Z',
    validUntil: '2027-07-27T10:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000009',
  });
  const itemRecord = encryptPicoReaderCustodyItem(sodium, {
    readerKeyAgreementSession: agreementSession,
    writerSigningSession: writerSession,
    domainRecord,
    rotationRecords,
    writerGrantRecord,
    packageId: `cf_package_${domainRecord.domain.domainId}`,
    memoryItemId: `cf_memory_${domainRecord.domain.domainId}`,
    contentType: 'text/plain',
    plaintext: 'kek born inside the daemon still encrypts',
    createdAt: '2026-07-27T10:31:00.000Z',
  });
  expect(itemRecord.item.packageId).toBe(`cf_package_${domainRecord.domain.domainId}`);
}

interface RawConnection {
  sendRaw(bytes: Buffer): void;
  send(payload: Record<string, unknown>): void;
  nextResponse(): Promise<PicoVaultDaemonResponse>;
}

async function rawConnect(socketPath: string): Promise<RawConnection> {
  const socket = createConnection(socketPath);
  rawSockets.push(socket);
  await new Promise<void>((resolvePromise, rejectPromise) => {
    socket.once('connect', resolvePromise);
    socket.once('error', rejectPromise);
  });
  const decoder = new PicoVaultDaemonFrameDecoder();
  const responses: PicoVaultDaemonResponse[] = [];
  const waiters: ((response: PicoVaultDaemonResponse) => void)[] = [];
  socket.on('error', () => {
    socket.destroy();
  });
  socket.on('data', (chunk) => {
    for (const frame of decoder.feed(chunk)) {
      const response = parsePicoVaultDaemonResponse(frame);
      const waiter = waiters.shift();
      if (waiter === undefined) {
        responses.push(response);
      } else {
        waiter(response);
      }
    }
  });
  return {
    sendRaw: (bytes) => {
      socket.write(bytes);
    },
    send: (payload) => {
      socket.write(encodePicoVaultDaemonFrame(payload));
    },
    nextResponse: async () => {
      const buffered = responses.shift();
      if (buffered !== undefined) {
        return buffered;
      }
      return await new Promise<PicoVaultDaemonResponse>((resolvePromise) => {
        waiters.push(resolvePromise);
      });
    },
  };
}

describe('Daemon-side KEK ceremony families (ADR 0101 K2/K3/K4)', () => {
  it('rejects Recovery Card issuance before approval when the PIN is absent', () => {
    expect(() => parsePicoVaultDaemonRequest(Buffer.from(JSON.stringify({
      family:
        picoVaultDaemonRequestFamilies.ceremonyIssueRecoveryCard,
      requestId: 'missing_pin',
      signerKeyFingerprintHex: '11'.repeat(32),
      picoName: 'Mira',
      homeNameOrId: 'Alpengasse 7',
      homeId: 'home_recovery_card_daemon_0001',
      hostSigningKeyFingerprintHex: '22'.repeat(32),
      hostKeyAgreementKeyFingerprintHex: '33'.repeat(32),
      hostKeyAgreementPublicKeyHex: '44'.repeat(32),
      endpointHint: 'pico-link://recovery-card-daemon',
      issuedAt: '2026-07-31T10:00:00.000Z',
    })))).toThrow('invalid_request');
  });

  it('issues the named Recovery Card export under one bound approval', async () => {
    const { daemon, audit } = await startDaemon();
    const hold = await holdUnlock(daemon);
    const consumer = await openClient(daemon);

    const { waiting } = await startApprovalWait(hold, audit);
    const issuing = consumer.ceremonyIssueRecoveryCard({
      signerKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      picoName: 'Mira',
      homeNameOrId: 'Alpengasse 7',
      homeId: 'home_recovery_card_daemon_0001',
      homeHostPicoIdentityFingerprintHex: '44'.repeat(32),
      hostSigningKeyFingerprintHex: '11'.repeat(32),
      hostKeyAgreementKeyFingerprintHex: '22'.repeat(32),
      hostKeyAgreementPublicKeyHex: '33'.repeat(32),
      endpointHint: 'pico-link://recovery-card-daemon',
      issuedAt: '2026-07-31T10:00:00.000Z',
      pin: 'card42',
    });
    const pending = await waiting;
    expect(pending!.label).toBe(
      picoVaultDaemonRequestFamilies.ceremonyIssueRecoveryCard,
    );
    expect(pending!.summary).toEqual({
      picoName: 'Mira',
      homeNameOrId: 'Alpengasse 7',
      identityKeyFingerprint: picoDisplayFingerprint(ownerIdentity.keyFingerprintHex),
      pinProtected: 'yes',
    });
    expect(pending!.statement).toContain(
      'exports the identity-root recovery material once',
    );
    expect(pending!.statement).not.toContain('card42');
    await hold.approvalDecide({
      approvalId: pending!.approvalId,
      signatureInputDigestHex: pending!.signatureInputDigestHex,
      approved: true,
    });

    const card = await issuing;
    expect(card.payload).toMatchObject({
      schema: picoRecoveryCardSchema,
      seedMaterialHex: expect.stringMatching(/^[0-9a-f]{64}$/),
      pinProtected: true,
      identityKeyFingerprintHex:
        ownerIdentity.keyFingerprintHex,
      homeId: 'home_recovery_card_daemon_0001',
      homeHostPicoIdentityFingerprintHex: '44'.repeat(32),
    });
    expect(card.recoveryPhrase.split(' ')).toHaveLength(24);
    expect(card.canonicalPayloadHex)
      .toMatch(/^[0-9a-f]+$/);

    const restored = restorePicoVaultIdentityFromRecovery(sodium, {
      recoveryPhrase: card.recoveryPhrase,
      pinProtected: true,
      pin: 'card42',
      identityKeyFingerprintHex:
        ownerIdentity.keyFingerprintHex,
      passphrase: 'restored identity passphrase',
    });
    expect(restored.publicKeyHex).toBe(ownerIdentity.publicKeyHex);

    const auditText = audit.join('');
    expect(auditText)
      .toContain('"event":"ceremony_completed","outcome":"ok"');
    expect(auditText).not.toContain('card42');
    expect(auditText).not.toContain(card.recoveryPhrase);
    expect(auditText).not.toContain(
      String(card.payload.seedMaterialHex),
    );
  }, 60_000);

  it('bootstraps exactly one fresh Vault from a Recovery Card without logging secrets', async () => {
    const root = openLocal(ownerIdentity, IDENTITY_PASSPHRASE);
    const card = root.issueRecoveryCard({
      picoName: 'Mira',
      homeNameOrId: 'Alpengasse 7',
      homeId: 'home_recovery_bootstrap_0001',
      homeHostPicoIdentityFingerprintHex: '44'.repeat(32),
      hostSigningKeyFingerprintHex: '11'.repeat(32),
      hostKeyAgreementKeyFingerprintHex: '22'.repeat(32),
      hostKeyAgreementPublicKeyHex: '33'.repeat(32),
      endpointHint: 'http://127.0.0.1:8321',
      issuedAt: '2026-08-03T10:00:00.000Z',
      pin: 'card42',
    });
    const { daemon, audit } = await startFreshDaemon();
    let client = await openClient(daemon);
    await expect(client.recoveryBootstrap({
      canonicalCardPayloadHex: card.canonicalPayloadHex,
      pin: 'wrong7',
      passphrase: 'fresh vault passphrase',
      targetDelegationId: 'recovery_target_bootstrap_wrong_pin',
    })).rejects.toThrow('recovery_pin_or_seed_mismatch');
    expect((await client.status()).keyfiles).toHaveLength(0);
    const bootstrapped = await client.recoveryBootstrap({
      canonicalCardPayloadHex: card.canonicalPayloadHex,
      pin: 'card42',
      passphrase: 'fresh vault passphrase',
      targetDelegationId: 'recovery_target_bootstrap_0001',
    });
    expect(bootstrapped).toMatchObject({
      card: {
        homeId: 'home_recovery_bootstrap_0001',
        homeHostPicoIdentityFingerprintHex: '44'.repeat(32),
      },
      identity: {
        keyFingerprintHex: ownerIdentity.keyFingerprintHex,
        publicKeyHex: ownerIdentity.publicKeyHex,
      },
      device: { delegationId: 'recovery_target_bootstrap_0001' },
    });
    expect((await client.status()).keyfiles).toHaveLength(3);
    await expect(client.recoveryBootstrap({
      canonicalCardPayloadHex: card.canonicalPayloadHex,
      pin: 'card42',
      passphrase: 'fresh vault passphrase',
      targetDelegationId: 'recovery_target_bootstrap_0002',
    })).rejects.toThrow('recovery_bootstrap_requires_fresh_vault');
    expect(audit.join('')).not.toContain('card42');
    expect(audit.join('')).not.toContain('fresh vault passphrase');
    expect(audit.join('')).not.toContain(card.payload.seedMaterialHex);
  }, 60_000);

  it('creates a domain under exactly one approval, with the KEK born inside the daemon', async () => {
    const { daemon, audit } = await startDaemon();
    const hold = await holdUnlock(daemon);
    const consumer = await openClient(daemon);

    const { waiting } = await startApprovalWait(hold, audit);
    const creating = consumer.ceremonyCreateDomain(
      createDomainInput('0001') as never,
    );
    const pending = await waiting;
    expect(pending).not.toBeNull();
    expect(pending!.label).toBe(picoVaultDaemonRequestFamilies.ceremonyCreateDomain);
    expect(pending!.summary).toEqual({
      domainId: 'cf_domain_0001',
      homeId: 'home_ceremony_family_0001',
    });
    await hold.approvalDecide({
      approvalId: pending!.approvalId,
      signatureInputDigestHex: pending!.signatureInputDigestHex,
      approved: true,
    });

    const created = await creating;
    const domainRecord = created.domainRecord as unknown as PicoReaderCustodyDomainRecord;
    expect(domainRecord.domain.domainId).toBe('cf_domain_0001');
    proveDomainUsable(domainRecord);

    const auditText = audit.join('');
    expect(auditText.split('"event":"approval_decided"').length - 1).toBe(1);
    expect(auditText).toContain('"event":"ceremony_completed","outcome":"ok"');
  }, 60_000);

  it('rotates a domain under exactly one approval and the new version stays writable', async () => {
    const { daemon, audit } = await startDaemon();
    const hold = await holdUnlock(daemon);
    const consumer = await openClient(daemon);

    const identitySession = openLocal(ownerIdentity, IDENTITY_PASSPHRASE);
    const agreementSession = openLocal(ownerAgreement, 'owner agreement passphrase');
    const domainRecord = createPicoReaderCustodyDomain(sodium, {
      ownerIdentitySession: identitySession,
      ownerReaderKeyRecord: ownerReaderKeyRecord() as never,
      domainAuthorityId: 'cf_domain_authority_rot',
      homeId: 'home_ceremony_family_0001',
      hostSigningKeyFingerprintHex: '11'.repeat(32),
      domainId: 'cf_domain_rot',
      authorizedAt: '2026-07-27T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000001',
    });
    const remainingGrantRecord = createPicoReaderCustodyReaderGrant(sodium, {
      ownerIdentitySession: identitySession,
      ownerReaderKeyAgreementSession: agreementSession,
      domainRecord,
      readerKeyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'device_key_agreement',
        publicKeyHex: readerAgreement.publicKeyHex,
      },
      readerGrantId: 'cf_reader_grant_rot',
      readerIdentityKeyFingerprintHex: '44'.repeat(32),
      readerDeviceSigningKeyFingerprintHex: '55'.repeat(32),
      readerDelegationId: 'cf_delegation_rot',
      accessMode: 'from_version',
      firstKekVersion: 1,
      validFrom: '2026-07-27T10:00:00.000Z',
      validUntil: '2027-07-27T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000002',
    });
    // A rotation must cover an open lifecycle cause (ADR 0088 rotation debt),
    // so a second reader is granted and revoked before the daemon rotates for
    // the remaining one.
    const revokedGrantRecord = createPicoReaderCustodyReaderGrant(sodium, {
      ownerIdentitySession: identitySession,
      ownerReaderKeyAgreementSession: agreementSession,
      domainRecord,
      readerKeyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'device_key_agreement',
        publicKeyHex: secondReaderAgreement.publicKeyHex,
      },
      readerGrantId: 'cf_reader_grant_revoked',
      readerIdentityKeyFingerprintHex: '66'.repeat(32),
      readerDeviceSigningKeyFingerprintHex: '77'.repeat(32),
      readerDelegationId: 'cf_delegation_revoked',
      accessMode: 'forward_only',
      firstKekVersion: 1,
      validFrom: '2026-07-27T10:00:00.000Z',
      validUntil: '2027-07-27T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000003',
    });
    const { revokePicoReaderCustodyReaderGrant } = await import('@pico/vault');
    const revocationRecord = revokePicoReaderCustodyReaderGrant(sodium, {
      ownerIdentitySession: identitySession,
      domainRecord,
      readerGrantRecord: revokedGrantRecord,
      lifecycleId: 'cf_reader_grant_revoked_lifecycle',
      reasonCategory: 'reader_removed',
      changedAt: '2026-07-27T10:10:00.000Z',
      lifecycleOrder: 'seq:0000000000000004',
    });

    const { waiting } = await startApprovalWait(hold, audit);
    const rotating = consumer.ceremonyRotateDomain({
      signerKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      domainRecord: domainRecord as unknown as Record<string, unknown>,
      rotationRecords: [],
      readerGrantLifecycleRecords: [revocationRecord as unknown as Record<string, unknown>],
      writerGrantLifecycleRecords: [],
      remainingReaderGrantRecords: [remainingGrantRecord as unknown as Record<string, unknown>],
      rotationId: 'cf_rotation_0001',
      rotatedAt: '2026-07-27T10:20:00.000Z',
      lifecycleOrder: 'seq:0000000000000005',
    });
    const pending = await waiting;
    expect(pending!.label).toBe(picoVaultDaemonRequestFamilies.ceremonyRotateDomain);
    expect(pending!.summary).toEqual({
      domainId: 'cf_domain_rot',
      remainingReaders: 1,
      rotationId: 'cf_rotation_0001',
    });
    await hold.approvalDecide({
      approvalId: pending!.approvalId,
      signatureInputDigestHex: pending!.signatureInputDigestHex,
      approved: true,
    });

    const rotated = await rotating;
    const rotationRecord =
      rotated.rotationRecord as unknown as PicoReaderCustodyKekRotationRecord;
    proveDomainUsable(domainRecord, [rotationRecord]);

    expect(audit.join('').split('"event":"approval_decided"').length - 1).toBe(1);
  }, 60_000);

  it('fails closed on denial, missing watcher and a non-identity session', async () => {
    const denied = await startDaemon();
    const deniedHold = await holdUnlock(denied.daemon);
    const deniedConsumer = await openClient(denied.daemon);
    const { waiting } = await startApprovalWait(deniedHold, denied.audit);
    const creating = deniedConsumer.ceremonyCreateDomain(createDomainInput('deny') as never)
      .then(
        () => ({ ok: true as const }),
        (error: unknown) => ({
          ok: false as const,
          reason: error instanceof Error ? error.message : String(error),
        }),
      );
    const pending = await waiting;
    await deniedHold.approvalDecide({
      approvalId: pending!.approvalId,
      signatureInputDigestHex: pending!.signatureInputDigestHex,
      approved: false,
    });
    expect(await creating).toEqual({ ok: false, reason: 'approval_denied' });

    const unwatched = await startDaemon();
    await holdUnlock(unwatched.daemon);
    const unwatchedConsumer = await openClient(unwatched.daemon);
    await expect(unwatchedConsumer.ceremonyCreateDomain(createDomainInput('nowatch') as never))
      .rejects.toThrow('approval_unavailable');

    const wrongRole = await startDaemon(ownerAgreement, 'device_key_agreement');
    await holdUnlock(
      wrongRole.daemon,
      ownerAgreement,
      'device_key_agreement',
      'owner agreement passphrase',
    );
    const wrongRoleConsumer = await openClient(wrongRole.daemon);
    await expect(wrongRoleConsumer.ceremonyCreateDomain({
      ...createDomainInput('role'),
      signerKeyFingerprintHex: ownerAgreement.keyFingerprintHex,
    } as never)).rejects.toThrow('ceremony_key_role_mismatch');
  }, 60_000);

  it('binds the ceremony approval to the exact request frame bytes', async () => {
    const { daemon, audit } = await startDaemon();
    const hold = await holdUnlock(daemon);

    const raw = await rawConnect(daemon.socketPath);
    raw.send({
      family: picoVaultDaemonRequestFamilies.hello,
      requestId: 'r1',
      protocolVersion: picoVaultDaemonProtocolVersion,
    });
    expect((await raw.nextResponse()).ok).toBe(true);

    const { waiting } = await startApprovalWait(hold, audit);
    const frame = encodePicoVaultDaemonFrame({
      requestId: 'r2',
      family: picoVaultDaemonRequestFamilies.ceremonyCreateDomain,
      ...createDomainInput('digest'),
    });
    raw.sendRaw(frame);
    const pending = await waiting;

    // The descriptor digest is the digest of exactly the bytes on the wire -
    // frame body, request id included - recomputable by the consumer.
    const expectedDigest = Buffer.from(
      sodium.crypto_generichash(32, Uint8Array.from(frame.subarray(4)), null),
    ).toString('hex');
    expect(pending!.signatureInputDigestHex).toBe(expectedDigest);

    await expect(hold.approvalDecide({
      approvalId: pending!.approvalId,
      signatureInputDigestHex: 'ab'.repeat(32),
      approved: true,
    })).rejects.toThrow('approval_digest_mismatch');
    await hold.approvalDecide({
      approvalId: pending!.approvalId,
      signatureInputDigestHex: expectedDigest,
      approved: true,
    });
    const response = await raw.nextResponse();
    expect(response.ok).toBe(true);
  }, 60_000);
});
