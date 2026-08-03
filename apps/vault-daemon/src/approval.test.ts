import { mkdtempSync, rmSync } from 'node:fs';
import { createConnection, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoIdentityPossessionSignatureInput,
  picoHomeDeviceLifecycleCanonicalLabels,
  picoIdentitySuite,
} from '@pico/protocol';
import {
  createPicoVaultKeyfile,
  writePicoVaultKeyfile,
  type CreatePicoVaultKeyfileResult,
} from '@pico/vault';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  connectPicoVaultDaemonClient,
  encodePicoVaultDaemonFrame,
  parsePicoVaultDaemonResponse,
  picoVaultDaemonProtocolVersion,
  picoVaultDaemonRequestFamilies,
  picoVaultDaemonSignatureNeedsApproval,
  startPicoVaultDaemon,
  PicoVaultDaemonFrameDecoder,
  type PicoVaultDaemonApprovalRequestDescriptor,
  type PicoVaultDaemonClient,
  type PicoVaultDaemonOptions,
  type PicoVaultDaemon,
  type PicoVaultDaemonResponse,
} from './index.js';

const PASSPHRASE = 'correct horse battery staple';

const temporaryDirectories: string[] = [];
const daemons: PicoVaultDaemon[] = [];
const clients: PicoVaultDaemonClient[] = [];
const rawSockets: Socket[] = [];

let identityFixture: CreatePicoVaultKeyfileResult;

beforeAll(async () => {
  await sodium.ready;
  identityFixture = createPicoVaultKeyfile(sodium, {
    keyRole: 'pico_identity',
    passphrase: PASSPHRASE,
  });
}, 30_000);

afterEach(async () => {
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

async function startDaemon(
  overrides: Partial<PicoVaultDaemonOptions> = {},
): Promise<{ daemon: PicoVaultDaemon; audit: string[] }> {
  const home = tempDir('pico-ap-');
  writePicoVaultKeyfile(
    join(home, 'keyfiles', `pico_identity-${identityFixture.keyFingerprintHex}.json`),
    identityFixture.keyfile,
  );
  const audit: string[] = [];
  const daemon = await startPicoVaultDaemon({
    sodium,
    vaultHomePath: home,
    foundationDataPath: tempDir('pico-ap-data-'),
    foundationBackupPath: tempDir('pico-ap-backup-'),
    auditSink: (line) => {
      audit.push(line);
    },
    ...overrides,
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

async function holdUnlock(daemon: PicoVaultDaemon): Promise<PicoVaultDaemonClient> {
  const client = await openClient(daemon);
  await client.unlock({
    keyRole: 'pico_identity',
    keyFingerprintHex: identityFixture.keyFingerprintHex,
    passphrase: PASSPHRASE,
  });
  return client;
}

/**
 * `pico.id.keyrecord.v1` is signable by an identity key and is not on the
 * exempt list, so it is the smallest genuinely gated record available. ADR
 * 0106: requests carry the fields; the byte form exists here only so tests
 * can check the digest binding against independently built bytes.
 */
function gatedFields(): Record<string, unknown> {
  return {
    suite: picoIdentitySuite,
    keyRole: 'pico_identity',
    publicKeyHex: identityFixture.publicKeyHex,
  };
}

function gatedSign(): { label: string; fields: Record<string, unknown> } {
  return { label: 'pico.id.keyrecord.v1', fields: gatedFields() };
}

function gatedInputHex(): string {
  return Buffer.from(buildPicoIdentityKeyRecordSignatureInput(gatedFields() as never)).toString('hex');
}

function exemptFields(): Record<string, unknown> {
  return {
    suite: picoIdentitySuite,
    subjectKeyFingerprintHex: identityFixture.keyFingerprintHex,
    verifierNonceHex: '11'.repeat(32),
    verifierContext: 'pico.test.approval',
  };
}

function exemptSign(): { label: string; fields: Record<string, unknown> } {
  return { label: 'pico.id.possession.v1', fields: exemptFields() };
}

function exemptInputHex(): string {
  return Buffer.from(buildPicoIdentityPossessionSignatureInput(exemptFields() as never)).toString('hex');
}

function digestOfHex(inputHex: string): string {
  return Buffer.from(
    sodium.crypto_generichash(32, Uint8Array.from(Buffer.from(inputHex, 'hex')), null),
  ).toString('hex');
}

/** Waits for a daemon audit event instead of guessing how long it takes. */
async function waitForAudit(audit: readonly string[], event: string): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (audit.some((line) => line.includes(`"event":"${event}"`))) {
      return;
    }
    await sleep(20);
  }
  throw new Error(`wait_for_timeout:${event}`);
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

type Settled<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * Attaches handlers at creation time. A parked signature rejects while the test
 * is awaiting something else, and a handler attached a statement later would
 * arrive after Node has already flagged the rejection as unhandled.
 */
function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({
      ok: false as const,
      reason: error instanceof Error ? error.message : String(error),
    }),
  );
}

interface RawConnection {
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

function expectReason(response: PicoVaultDaemonResponse, reason: string): void {
  expect(response.ok).toBe(false);
  if (!response.ok) {
    expect(response.reason).toBe(reason);
  }
}

describe('Approval gating policy (ADR 0099 P3)', () => {
  it('exempts exactly the operational families and gates everything else', () => {
    for (const label of [
      'pico.id.possession.v1',
      'pico.id.reader-key-freshness.v1',
      'pico.mem.reader-sync-manifest.v1',
      'pico.mem.reader-item.v1',
      'pico.link.direct.request.v1',
    ]) {
      expect(picoVaultDaemonSignatureNeedsApproval(label)).toBe(false);
    }
    for (const label of [
      'pico.id.keyrecord.v1',
      'pico.id.delegation.v1',
      'pico.id.revocation.v1',
      'pico.home.claim.v1',
      'pico.home.claim.v2',
      'pico.home.founding.v1',
      'pico.home.founding.v2',
      'pico.mem.reader-domain.v1',
      'pico.mem.reader-grant.v1',
      'pico.mem.reader-kek-rotation.v1',
      'pico.share.envelope.v1',
      'pico.some.family.added.later.v1',
    ]) {
      expect(picoVaultDaemonSignatureNeedsApproval(label)).toBe(true);
    }
    expect(picoVaultDaemonSignatureNeedsApproval(
      'pico.home.claim.v2',
      'device_signing',
    )).toBe(false);
    expect(picoVaultDaemonSignatureNeedsApproval(
      'pico.home.claim.v2',
      'pico_identity',
    )).toBe(true);
    expect(picoVaultDaemonSignatureNeedsApproval(
      picoHomeDeviceLifecycleCanonicalLabels.activation,
      'device_signing',
    )).toBe(false);
    expect(picoVaultDaemonSignatureNeedsApproval(
      picoHomeDeviceLifecycleCanonicalLabels.activation,
      'pico_identity',
    )).toBe(true);
  });

  it('signs an exempt family without ever raising an approval', async () => {
    const { daemon, audit } = await startDaemon();
    await holdUnlock(daemon);
    const consumer = await openClient(daemon);

    const signed = await consumer.sign({ keyFingerprintHex: identityFixture.keyFingerprintHex, ...exemptSign() });
    expect(signed.keyRole).toBe('pico_identity');
    expect(audit.join('')).not.toContain('approval_requested');
  }, 30_000);

  it('refuses an unsignable label before asking the person to decide', async () => {
    const { daemon, audit } = await startDaemon({ approvalWaitMs: 300 });
    const hold = await holdUnlock(daemon);
    const consumer = await openClient(daemon);
    const { waiting } = await startApprovalWait(hold, audit);

    await expect(consumer.sign({
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      label: 'pico.evil.v1',
      fields: {},
    })).rejects.toThrow('unknown_signature_input_label');

    expect(audit.join('')).not.toContain('approval_requested');
    expect(await waiting).toBeNull();
  }, 30_000);

  it('refuses fields the builder rejects, before any approval exists (ADR 0106 R5)', async () => {
    const { daemon, audit } = await startDaemon({ approvalWaitMs: 300 });
    const hold = await holdUnlock(daemon);
    const consumer = await openClient(daemon);
    const { waiting } = await startApprovalWait(hold, audit);

    // A known, gated label with fields its builder throws on: no bytes exist,
    // so nothing can be signed and nobody may be asked.
    await expect(consumer.sign({
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      label: 'pico.id.keyrecord.v1',
      fields: { suite: 'pico.suite.id.v1', keyRole: 'pico_identity' },
    })).rejects.toThrow('invalid_signature_input_fields');

    expect(audit.join('')).not.toContain('approval_requested');
    expect(await waiting).toBeNull();
  }, 30_000);

  it('renders the approval statement from the fields the signature covers', async () => {
    const { daemon, audit } = await startDaemon();
    const hold = await holdUnlock(daemon);
    const consumer = await openClient(daemon);
    const { waiting } = await startApprovalWait(hold, audit);

    const signing = settle(consumer.sign({
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      ...gatedSign(),
    }));
    const pending = await waiting;
    expect(pending).not.toBeNull();

    // The statement is the daemon's rendering of the same fields the bytes
    // were built from - and the digest still binds those exact bytes, built
    // here independently.
    expect(pending!.statement).toBe(
      `Certify a pico_identity key record (${identityFixture.publicKeyHex.slice(0, 12)}\u2026).`,
    );
    expect(pending!.signatureInputDigestHex).toBe(digestOfHex(gatedInputHex()));

    await hold.approvalDecide({
      approvalId: pending!.approvalId,
      signatureInputDigestHex: pending!.signatureInputDigestHex,
      approved: false,
    });
    expect(await signing).toEqual({ ok: false, reason: 'approval_denied' });
  }, 30_000);
});

describe('Approval decision binding (ADR 0099 P2/P4)', () => {
  it('parks a gated signature until the holder approves the exact bytes', async () => {
    const { daemon, audit } = await startDaemon();
    const hold = await holdUnlock(daemon);
    const consumer = await openClient(daemon);
    const { waiting } = await startApprovalWait(hold, audit);

    const inputHex = gatedInputHex();
    const signing = settle(consumer.sign({ keyFingerprintHex: identityFixture.keyFingerprintHex, ...gatedSign() }));
    const pending = await waiting;
    expect(pending).not.toBeNull();
    expect(pending!.label).toBe('pico.id.keyrecord.v1');
    expect(pending!.keyRole).toBe('pico_identity');
    expect(pending!.keyFingerprintHex).toBe(identityFixture.keyFingerprintHex);
    expect(pending!.signatureInputDigestHex).toBe(digestOfHex(inputHex));

    expect(await hold.approvalDecide({
      approvalId: pending!.approvalId,
      signatureInputDigestHex: pending!.signatureInputDigestHex,
      approved: true,
    })).toEqual({ recorded: true });

    const settled = await signing;
    expect(settled.ok).toBe(true);
    const signed = (settled as { ok: true; value: { signatureHex: string } }).value;
    expect(sodium.crypto_sign_verify_detached(
      Uint8Array.from(Buffer.from(signed.signatureHex, 'hex')),
      Uint8Array.from(Buffer.from(inputHex, 'hex')),
      Uint8Array.from(Buffer.from(identityFixture.publicKeyHex, 'hex')),
    )).toBe(true);
    expect(audit.join('')).toContain('"event":"approval_decided","outcome":"ok","approved":true');
  }, 30_000);

  it('keeps a live approval channel standing between back-to-back decisions', async () => {
    const { daemon, audit } = await startDaemon();
    const hold = await holdUnlock(daemon);
    const consumer = await openClient(daemon);
    const { waiting } = await startApprovalWait(hold, audit);

    const firstSigning = settle(consumer.sign({
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      ...gatedSign(),
    }));
    const firstPending = await waiting;
    await hold.approvalDecide({
      approvalId: firstPending!.approvalId,
      signatureInputDigestHex: firstPending!.signatureInputDigestHex,
      approved: true,
    });
    expect((await firstSigning).ok).toBe(true);

    // The consumer may issue the next authority request before the terminal's
    // long-poll loop has sent its next wait. A still-live channel that has
    // already registered stays authoritative; the request parks until the
    // next wait instead of racing to approval_unavailable.
    const auditStart = audit.length;
    const secondSigning = settle(consumer.sign({
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      ...gatedSign(),
    }));
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (audit.slice(auditStart).some((line) =>
        line.includes('"event":"approval_requested","outcome":"ok"'))) {
        break;
      }
      await sleep(20);
    }
    expect(audit.slice(auditStart).join('')).toContain(
      '"event":"approval_requested","outcome":"ok"',
    );

    const secondPending = (await hold.approvalWait()).pending;
    expect(secondPending).not.toBeNull();
    await hold.approvalDecide({
      approvalId: secondPending!.approvalId,
      signatureInputDigestHex: secondPending!.signatureInputDigestHex,
      approved: false,
    });
    expect(await secondSigning).toEqual({
      ok: false,
      reason: 'approval_denied',
    });
  }, 30_000);

  it('denies on an explicit no and on a digest that does not match', async () => {
    const { daemon, audit } = await startDaemon();
    const hold = await holdUnlock(daemon);
    const consumer = await openClient(daemon);

    const { waiting } = await startApprovalWait(hold, audit);
    const signing = settle(consumer.sign({ keyFingerprintHex: identityFixture.keyFingerprintHex, ...gatedSign() }));
    const pending = await waiting;

    await expect(hold.approvalDecide({
      approvalId: pending!.approvalId,
      signatureInputDigestHex: 'ab'.repeat(32),
      approved: true,
    })).rejects.toThrow('approval_digest_mismatch');

    expect(await hold.approvalDecide({
      approvalId: pending!.approvalId,
      signatureInputDigestHex: pending!.signatureInputDigestHex,
      approved: false,
    })).toEqual({ recorded: true });
    expect(await signing).toEqual({ ok: false, reason: 'approval_denied' });
  }, 30_000);

  it('denies when the approval window elapses', async () => {
    const { daemon, audit } = await startDaemon({ approvalWindowMs: 120 });
    const hold = await holdUnlock(daemon);
    const consumer = await openClient(daemon);

    const { waiting } = await startApprovalWait(hold, audit);
    const signing = settle(consumer.sign({ keyFingerprintHex: identityFixture.keyFingerprintHex, ...gatedSign() }));
    await waiting;

    expect(await signing).toEqual({ ok: false, reason: 'approval_denied' });
    expect(audit.join('')).toContain('"cause":"approval_timeout"');
  }, 30_000);

  it('refuses a second gated request while one approval is pending', async () => {
    const { daemon, audit } = await startDaemon();
    const hold = await holdUnlock(daemon);
    const first = await openClient(daemon);
    const second = await openClient(daemon);

    const { waiting } = await startApprovalWait(hold, audit);
    const signing = settle(first.sign({ keyFingerprintHex: identityFixture.keyFingerprintHex, ...gatedSign() }));
    const pending = await waiting;

    await expect(second.sign({
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      ...gatedSign(),
    })).rejects.toThrow('approval_pending');

    await hold.approvalDecide({
      approvalId: pending!.approvalId,
      signatureInputDigestHex: pending!.signatureInputDigestHex,
      approved: false,
    });
    expect(await signing).toEqual({ ok: false, reason: 'approval_denied' });
  }, 30_000);
});

describe('Approval channel authority (ADR 0099 P4/P5)', () => {
  it('acknowledges a product watcher before the first long poll without widening approval', async () => {
    const { daemon, audit } = await startDaemon();
    const hold = await holdUnlock(daemon);
    const consumer = await openClient(daemon);

    await expect(hold.approvalWatch()).resolves.toEqual({ watching: true });
    expect(audit.join('')).toContain('approval_watch_started');

    // The acknowledgement authorizes nothing: the gated consumer still
    // parks until this exact hold connection long-polls and decides.
    const signing = settle(consumer.sign({
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      ...gatedSign(),
    }));
    const pending = (await hold.approvalWait()).pending;
    expect(pending?.statement).toBeTruthy();
    await hold.approvalDecide({
      approvalId: pending!.approvalId,
      signatureInputDigestHex: pending!.signatureInputDigestHex,
      approved: false,
    });
    expect(await signing).toEqual({ ok: false, reason: 'approval_denied' });

    await expect(consumer.approvalWatch())
      .rejects.toThrow('approval_wait_forbidden');
  }, 30_000);

  it('refuses a gated signature when nobody is watching the channel', async () => {
    const { daemon, audit } = await startDaemon();
    await holdUnlock(daemon);
    const consumer = await openClient(daemon);

    await expect(consumer.sign({
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      ...gatedSign(),
    })).rejects.toThrow('approval_unavailable');
    expect(audit.join('')).toContain('approval_unavailable');
  }, 30_000);

  it('refuses waiting and deciding from a connection that does not hold the unlock', async () => {
    const { daemon, audit } = await startDaemon();
    const hold = await holdUnlock(daemon);
    const consumer = await openClient(daemon);

    await expect(consumer.approvalWait()).rejects.toThrow('approval_wait_forbidden');

    const { waiting } = await startApprovalWait(hold, audit);
    const signing = settle(consumer.sign({ keyFingerprintHex: identityFixture.keyFingerprintHex, ...gatedSign() }));
    const pending = await waiting;

    // A third connection: the requesting one already has its parked signature
    // in flight, so the refusal has to come from the daemon, not from a local
    // client-side guard.
    const bystander = await openClient(daemon);
    await expect(bystander.approvalDecide({
      approvalId: pending!.approvalId,
      signatureInputDigestHex: pending!.signatureInputDigestHex,
      approved: true,
    })).rejects.toThrow('approval_decision_forbidden');

    await hold.approvalDecide({
      approvalId: pending!.approvalId,
      signatureInputDigestHex: pending!.signatureInputDigestHex,
      approved: false,
    });
    expect(await signing).toEqual({ ok: false, reason: 'approval_denied' });
  }, 30_000);

  it('denies a pending approval when the hold connection disappears', async () => {
    const { daemon, audit } = await startDaemon();
    const hold = await holdUnlock(daemon);
    const consumer = await openClient(daemon);

    const { waiting } = await startApprovalWait(hold, audit);
    const signing = settle(consumer.sign({ keyFingerprintHex: identityFixture.keyFingerprintHex, ...gatedSign() }));
    await waiting;

    await hold.close();
    expect(await signing).toEqual({ ok: false, reason: 'approval_denied' });
    await expect(consumer.status()).resolves.toMatchObject({ locked: true });
  }, 30_000);

  it('rejects a second request sent while a parked response is outstanding', async () => {
    const { daemon, audit } = await startDaemon();
    const hold = await holdUnlock(daemon);
    const { waiting } = await startApprovalWait(hold, audit);

    const raw = await rawConnect(daemon.socketPath);
    raw.send({
      family: picoVaultDaemonRequestFamilies.hello,
      requestId: 'r1',
      protocolVersion: picoVaultDaemonProtocolVersion,
    });
    expect((await raw.nextResponse()).ok).toBe(true);

    raw.send({
      family: picoVaultDaemonRequestFamilies.sign,
      requestId: 'r2',
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      ...gatedSign(),
    });
    expect(await waiting).not.toBeNull();

    raw.send({ family: picoVaultDaemonRequestFamilies.status, requestId: 'r3' });
    expectReason(await raw.nextResponse(), 'request_in_flight');

    // Losing the requesting connection discards its pending approval rather
    // than leaving the person to answer into nothing.
    await waitForAudit(audit, 'approval_discarded');
  }, 30_000);

  it('bounds approval durations to their lower-only ceilings', async () => {
    await expect(startDaemon({ approvalWindowMs: 60 * 1_000 + 1 }))
      .rejects.toThrow('invalid_approval_window_ms');
    await expect(startDaemon({ approvalWaitMs: 30 * 1_000 + 1 }))
      .rejects.toThrow('invalid_approval_wait_ms');
  }, 30_000);
});
