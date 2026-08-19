import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPicoIdentityPossessionSignatureInput,
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
  parsePicoVaultCliArguments,
  parsePicoVaultDaemonResponse,
  picoVaultDaemonRequestFamilies,
  startPicoVaultDaemon,
  PicoVaultDaemonFrameDecoder,
  type PicoVaultDaemon,
  type PicoVaultDaemonClient,
  type PicoVaultDaemonOptions,
  type PicoVaultDaemonResponse,
} from './index.js';

const PASSPHRASE = 'correct horse battery staple';

function chooseBaseDir(): string {
  const candidate = tmpdir();
  const probe = join(candidate, 'pico-vd-abcdef', 'run', 'daemon.sock');
  return Buffer.byteLength(probe, 'utf8') > 90 ? '/tmp' : candidate;
}

const baseDir = chooseBaseDir();
const tempDirs: string[] = [];
const daemons: PicoVaultDaemon[] = [];
const clients: PicoVaultDaemonClient[] = [];

let identityFixture: CreatePicoVaultKeyfileResult;
let readerFixture: CreatePicoVaultKeyfileResult;

beforeAll(async () => {
  await sodium.ready;
  identityFixture = createPicoVaultKeyfile(sodium, {
    keyRole: 'pico_identity',
    passphrase: PASSPHRASE,
  });
  readerFixture = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_key_agreement',
    passphrase: PASSPHRASE,
  });
});

afterEach(async () => {
  for (const client of clients.splice(0)) {
    await client.close();
  }
  for (const daemon of daemons.splice(0)) {
    await daemon.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(baseDir, prefix));
  tempDirs.push(dir);
  return dir;
}

interface TestClock {
  wall: number;
  mono: number;
}

interface TestHome {
  home: string;
  foundationDataPath: string;
  foundationBackupPath: string;
}

function makeHome(seedIdentityKeyfile = true): TestHome {
  const home = tempDir('pico-vd-');
  if (seedIdentityKeyfile) {
    writePicoVaultKeyfile(
      join(home, 'keyfiles', `pico_identity-${identityFixture.keyFingerprintHex}.json`),
      identityFixture.keyfile,
    );
  }
  return {
    home,
    foundationDataPath: tempDir('pico-fd-'),
    foundationBackupPath: tempDir('pico-fb-'),
  };
}

function seedReaderKeyfile(paths: TestHome): void {
  writePicoVaultKeyfile(
    join(paths.home, 'keyfiles', `device_key_agreement-${readerFixture.keyFingerprintHex}.json`),
    readerFixture.keyfile,
  );
}

async function startAt(
  paths: TestHome,
  extra: Partial<PicoVaultDaemonOptions> & { clock?: TestClock } = {},
): Promise<{ daemon: PicoVaultDaemon; audit: string[] }> {
  const { clock, ...overrides } = extra;
  const audit: string[] = [];
  const daemon = await startPicoVaultDaemon({
    sodium,
    vaultHomePath: paths.home,
    foundationDataPath: paths.foundationDataPath,
    foundationBackupPath: paths.foundationBackupPath,
    auditSink: (line) => {
      audit.push(line);
    },
    ...(clock === undefined ? {} : {
      wallNowMs: () => clock.wall,
      monotonicNowMs: () => clock.mono,
    }),
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

async function waitFor(condition: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await condition()) {
      return;
    }
    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 10);
    });
  }
  throw new Error('wait_for_timeout');
}

interface RawConnection {
  send(payload: Record<string, unknown>): void;
  sendRaw(bytes: Buffer): void;
  nextResponse(): Promise<PicoVaultDaemonResponse>;
  waitClose(): Promise<void>;
}

async function rawConnect(socketPath: string): Promise<RawConnection> {
  const socket = createConnection(socketPath);
  await new Promise<void>((resolvePromise, rejectPromise) => {
    socket.once('connect', resolvePromise);
    socket.once('error', rejectPromise);
  });
  const decoder = new PicoVaultDaemonFrameDecoder();
  const responses: PicoVaultDaemonResponse[] = [];
  const responseWaiters: ((response: PicoVaultDaemonResponse) => void)[] = [];
  let closed = false;
  const closeWaiters: (() => void)[] = [];
  socket.on('error', () => {
    socket.destroy();
  });
  socket.on('data', (chunk) => {
    for (const frame of decoder.feed(chunk)) {
      const response = parsePicoVaultDaemonResponse(frame);
      const waiter = responseWaiters.shift();
      if (waiter === undefined) {
        responses.push(response);
      } else {
        waiter(response);
      }
    }
  });
  socket.on('close', () => {
    closed = true;
    for (const waiter of closeWaiters.splice(0)) {
      waiter();
    }
  });
  return {
    send: (payload) => {
      socket.write(encodePicoVaultDaemonFrame(payload));
    },
    sendRaw: (bytes) => {
      socket.write(bytes);
    },
    nextResponse: async () => {
      const buffered = responses.shift();
      if (buffered !== undefined) {
        return buffered;
      }
      return await new Promise<PicoVaultDaemonResponse>((resolvePromise) => {
        responseWaiters.push(resolvePromise);
      });
    },
    waitClose: async () => {
      if (closed) {
        return;
      }
      await new Promise<void>((resolvePromise) => {
        closeWaiters.push(resolvePromise);
      });
    },
  };
}

function possessionFields(): Record<string, unknown> {
  return {
    suite: picoIdentitySuite,
    subjectKeyFingerprintHex: identityFixture.keyFingerprintHex,
    verifierNonceHex: '11'.repeat(32),
    verifierContext: 'pico.test.vault-daemon',
  };
}

function possessionSign(): { label: string; fields: Record<string, unknown> } {
  return { label: 'pico.id.possession.v1', fields: possessionFields() };
}

function possessionInput(): Uint8Array {
  return buildPicoIdentityPossessionSignatureInput(possessionFields() as never);
}

function canonicalElement(label: string): Buffer {
  const ascii = Buffer.from(label, 'ascii');
  const element = Buffer.alloc(4 + ascii.byteLength);
  element.writeUInt32BE(ascii.byteLength, 0);
  ascii.copy(element, 4);
  return element;
}

function expectReason(response: PicoVaultDaemonResponse, reason: string): void {
  expect(response.ok).toBe(false);
  if (!response.ok) {
    expect(response.reason).toBe(reason);
  }
}

describe('Pico Vault daemon custody boundary (ADR 0097 D2)', () => {
  it('starts private, refuses a second live daemon and restarts locked after close', async () => {
    const paths = makeHome();
    const { daemon } = await startAt(paths);

    expect(statSync(join(paths.home, 'run')).mode & 0o777).toBe(0o700);
    expect(statSync(daemon.socketPath).mode & 0o777).toBe(0o600);
    await expect(startAt(paths)).rejects.toThrow('daemon_already_running');

    const client = await openClient(daemon);
    const hello = await client.status();
    expect(hello.locked).toBe(true);
    expect(hello.keyfiles).toEqual([{
      keyRole: 'pico_identity',
      keyFingerprintHex: identityFixture.keyFingerprintHex,
    }]);
    await client.close();
    await daemon.close();
    expect(() => statSync(daemon.socketPath)).toThrow();

    const restarted = await startAt(paths);
    const restartedClient = await openClient(restarted.daemon);
    expect((await restartedClient.status()).locked).toBe(true);
  });

  it('refuses custody paths that overlap Foundation scopes in either direction', async () => {
    const outer = tempDir('pico-fd-');
    await expect(startAt({
      home: join(outer, 'vault'),
      foundationDataPath: outer,
      foundationBackupPath: tempDir('pico-fb-'),
    })).rejects.toThrow('vault_path_inside_foundation_scope');

    const home = tempDir('pico-vd-');
    await expect(startAt({
      home,
      foundationDataPath: join(home, 'data'),
      foundationBackupPath: tempDir('pico-fb-'),
    })).rejects.toThrow('vault_path_inside_foundation_scope');
  });

  it('refuses open home permissions and oversized socket paths', async () => {
    const paths = makeHome(false);
    chmodSync(paths.home, 0o755);
    await expect(startAt(paths)).rejects.toThrow('vault_home_permissions');

    await expect(startAt({
      home: join(tempDir('pico-vd-'), 'a'.repeat(120)),
      foundationDataPath: tempDir('pico-fd-'),
      foundationBackupPath: tempDir('pico-fb-'),
    })).rejects.toThrow('socket_path_too_long');
  });

  it('refuses an occupied non-socket path and takes over a dead socket', async () => {
    const occupied = makeHome(false);
    mkdirSync(join(occupied.home, 'run'), { mode: 0o700 });
    writeFileSync(join(occupied.home, 'run', 'daemon.sock'), '', { mode: 0o600 });
    await expect(startAt(occupied)).rejects.toThrow('socket_path_occupied');

    const stale = makeHome(false);
    mkdirSync(join(stale.home, 'run'), { recursive: true, mode: 0o700 });
    const socketPath = join(stale.home, 'run', 'daemon.sock');
    const deadServer = createServer();
    await new Promise<void>((resolvePromise) => {
      deadServer.listen(socketPath, resolvePromise);
    });
    await new Promise<void>((resolvePromise) => {
      deadServer.close(() => {
        resolvePromise();
      });
    });
    const { daemon } = await startAt(stale);
    const client = await openClient(daemon);
    expect((await client.status()).locked).toBe(true);
  });

  it('fails closed on keyfiles with open modes at startup and while serving', async () => {
    const paths = makeHome();
    const keyfilePath = join(
      paths.home,
      'keyfiles',
      `pico_identity-${identityFixture.keyFingerprintHex}.json`,
    );
    chmodSync(keyfilePath, 0o644);
    await expect(startAt(paths)).rejects.toThrow('vault_keyfile_permissions');

    chmodSync(keyfilePath, 0o600);
    const { daemon } = await startAt(paths);
    const client = await openClient(daemon);
    chmodSync(keyfilePath, 0o644);
    await expect(client.status()).rejects.toThrow('vault_keyfile_permissions');
    chmodSync(keyfilePath, 0o600);
    expect((await client.status()).locked).toBe(true);
  });
});

describe('Pico Vault daemon wire contract (ADR 0097 D3)', () => {
  it('requires hello first, exactly once, with the exact protocol version', async () => {
    const { daemon } = await startAt(makeHome(false));

    const early = await rawConnect(daemon.socketPath);
    early.send({ family: picoVaultDaemonRequestFamilies.status, requestId: 'r1' });
    expectReason(await early.nextResponse(), 'hello_required');
    await early.waitClose();

    const wrongVersion = await rawConnect(daemon.socketPath);
    wrongVersion.send({ family: picoVaultDaemonRequestFamilies.hello, requestId: 'r1', protocolVersion: 2 });
    expectReason(await wrongVersion.nextResponse(), 'unsupported_protocol_version');
    await wrongVersion.waitClose();

    const twice = await rawConnect(daemon.socketPath);
    twice.send({ family: picoVaultDaemonRequestFamilies.hello, requestId: 'r1', protocolVersion: 1 });
    const helloResponse = await twice.nextResponse();
    expect(helloResponse.ok).toBe(true);
    if (helloResponse.ok) {
      expect(helloResponse.result).toEqual({
        protocolVersion: 1,
        daemonVersion: '0.2.0',
        locked: true,
      });
    }
    twice.send({ family: picoVaultDaemonRequestFamilies.hello, requestId: 'r2', protocolVersion: 1 });
    expectReason(await twice.nextResponse(), 'invalid_request');
    await twice.waitClose();
  });

  it('rejects unknown families, malformed frames, oversized frames and extra fields', async () => {
    const { daemon } = await startAt(makeHome(false));

    const unknown = await rawConnect(daemon.socketPath);
    unknown.send({ family: picoVaultDaemonRequestFamilies.hello, requestId: 'r1', protocolVersion: 1 });
    await unknown.nextResponse();
    unknown.send({ family: 'pico.vault.daemon.export.v1', requestId: 'r2' });
    expectReason(await unknown.nextResponse(), 'unknown_request_family');
    await unknown.waitClose();

    const malformed = await rawConnect(daemon.socketPath);
    const garbage = Buffer.from('this is not json', 'utf8');
    const malformedFrame = Buffer.alloc(4 + garbage.byteLength);
    malformedFrame.writeUInt32BE(garbage.byteLength, 0);
    garbage.copy(malformedFrame, 4);
    malformed.sendRaw(malformedFrame);
    expectReason(await malformed.nextResponse(), 'malformed_frame');
    await malformed.waitClose();

    const oversized = await rawConnect(daemon.socketPath);
    const oversizedHeader = Buffer.alloc(4);
    oversizedHeader.writeUInt32BE(1024 * 1024, 0);
    oversized.sendRaw(oversizedHeader);
    expectReason(await oversized.nextResponse(), 'frame_too_large');
    await oversized.waitClose();

    const extraField = await rawConnect(daemon.socketPath);
    extraField.send({ family: picoVaultDaemonRequestFamilies.hello, requestId: 'r1', protocolVersion: 1 });
    await extraField.nextResponse();
    extraField.send({ family: picoVaultDaemonRequestFamilies.status, requestId: 'r2', extra: true });
    expectReason(await extraField.nextResponse(), 'invalid_request');
    await extraField.waitClose();
  });

  it('rejects pipelined requests written before the previous response', async () => {
    const { daemon } = await startAt(makeHome(false));
    const pipelined = await rawConnect(daemon.socketPath);
    pipelined.send({ family: picoVaultDaemonRequestFamilies.hello, requestId: 'r1', protocolVersion: 1 });
    await pipelined.nextResponse();
    pipelined.sendRaw(Buffer.concat([
      encodePicoVaultDaemonFrame({ family: picoVaultDaemonRequestFamilies.status, requestId: 'r2' }),
      encodePicoVaultDaemonFrame({ family: picoVaultDaemonRequestFamilies.status, requestId: 'r3' }),
    ]));
    expectReason(await pipelined.nextResponse(), 'request_in_flight');
    await pipelined.waitClose();
  });
});

describe('Pico Vault daemon unlock lifecycle (ADR 0097 D4)', () => {
  it('unlocks hold-bound, serves label-checked signatures to other connections and locks on hold disconnect', async () => {
    const paths = makeHome();
    const { daemon, audit } = await startAt(paths);

    const holder = await openClient(daemon);
    const unlocked = await holder.unlock({
      keyRole: 'pico_identity',
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      passphrase: PASSPHRASE,
    });
    expect(unlocked).toEqual({
      keyRole: 'pico_identity',
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      publicKeyHex: identityFixture.publicKeyHex,
      idleLockMs: 5 * 60 * 1_000,
      maxUnlockDurationMs: 15 * 60 * 1_000,
    });

    const consumer = await openClient(daemon);
    const status = await consumer.status();
    expect(status.locked).toBe(false);
    expect(status.sessions).toEqual([{
      keyRole: 'pico_identity',
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      publicKeyHex: identityFixture.publicKeyHex,
    }]);

    const input = possessionInput();
    const signed = await consumer.sign({ keyFingerprintHex: identityFixture.keyFingerprintHex, ...possessionSign() });
    expect(sodium.crypto_sign_verify_detached(
      Uint8Array.from(Buffer.from(signed.signatureHex, 'hex')),
      input,
      Uint8Array.from(Buffer.from(identityFixture.publicKeyHex, 'hex')),
    )).toBe(true);

    await expect(consumer.sign({
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      label: 'pico.evil.v1',
      fields: {},
    })).rejects.toThrow('unknown_signature_input_label');

    await holder.close();
    await waitFor(async () => (await consumer.status()).locked);
    await expect(consumer.sign({
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      ...possessionSign(),
    })).rejects.toThrow('vault_locked');
    expect(audit.join('')).toContain('hold_connection_closed');
  }, 30_000);

  it('refuses a second unlock while unlocked and serves lock from any connection', async () => {
    const { daemon, audit } = await startAt(makeHome());
    const holder = await openClient(daemon);
    await holder.unlock({
      keyRole: 'pico_identity',
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      passphrase: PASSPHRASE,
    });

    const other = await openClient(daemon);
    await expect(other.unlock({
      keyRole: 'pico_identity',
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      passphrase: 'irrelevant',
    })).rejects.toThrow('already_unlocked');

    expect(await other.lock()).toEqual({ locked: true });
    expect((await other.status()).locked).toBe(true);
    expect((await holder.status()).locked).toBe(true);
    expect(audit.join('')).toContain('explicit_lock');
  });

  it('throttles unlock failures, keeps passphrases out of audit and recovers after the window', async () => {
    const clock: TestClock = { wall: 1_753_600_000_000, mono: 1_000_000 };
    const { daemon, audit } = await startAt(makeHome(), { clock });
    const client = await openClient(daemon);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(client.unlock({
        keyRole: 'pico_identity',
        keyFingerprintHex: identityFixture.keyFingerprintHex,
        passphrase: `wrong-guess-${attempt}`,
      })).rejects.toThrow('wrong_passphrase');
    }
    await expect(client.unlock({
      keyRole: 'pico_identity',
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      passphrase: PASSPHRASE,
    })).rejects.toThrow('unlock_throttled');

    clock.wall += 61_000;
    clock.mono += 61_000;
    const unlocked = await client.unlock({
      keyRole: 'pico_identity',
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      passphrase: PASSPHRASE,
    });
    expect(unlocked.keyFingerprintHex).toBe(identityFixture.keyFingerprintHex);

    const auditText = audit.join('');
    expect(auditText).toContain('unlock_throttled');
    expect(auditText).not.toContain('wrong-guess');
    expect(auditText).not.toContain(PASSPHRASE);
  }, 30_000);

  it('serves key-agreement unlock for reader access but never for signing', async () => {
    const paths = makeHome();
    seedReaderKeyfile(paths);
    const { daemon } = await startAt(paths);
    const client = await openClient(daemon);

    const unlocked = await client.unlock({
      keyRole: 'device_key_agreement',
      keyFingerprintHex: readerFixture.keyFingerprintHex,
      passphrase: PASSPHRASE,
    });
    expect(unlocked.keyRole).toBe('device_key_agreement');
    await expect(client.sign({
      keyFingerprintHex: readerFixture.keyFingerprintHex,
      ...possessionSign(),
    })).rejects.toThrow('key_role_cannot_sign');
    // The identity keyfile exists but is not unlocked, and naming it must not
    // fall back to the agreement session that is.
    await expect(client.sign({
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      ...possessionSign(),
    })).rejects.toThrow('unknown_unlocked_key');
  });

  it('refuses unknown keyfiles without touching the throttle', async () => {
    const { daemon } = await startAt(makeHome());
    const client = await openClient(daemon);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(client.unlock({
        keyRole: 'pico_identity',
        keyFingerprintHex: 'ab'.repeat(32),
        passphrase: PASSPHRASE,
      })).rejects.toThrow('unknown_keyfile');
    }

    const unlocked = await client.unlock({
      keyRole: 'pico_identity',
      keyFingerprintHex: identityFixture.keyFingerprintHex,
      passphrase: PASSPHRASE,
    });
    expect(unlocked.keyRole).toBe('pico_identity');
  });

  it('locks on duration expiry, suspend gaps, clock rollback and idle', async () => {
    const unlock = async (
      daemon: PicoVaultDaemon,
    ): Promise<PicoVaultDaemonClient> => {
      const client = await openClient(daemon);
      await client.unlock({
        keyRole: 'pico_identity',
        keyFingerprintHex: identityFixture.keyFingerprintHex,
        passphrase: PASSPHRASE,
      });
      return client;
    };

    const expiryClock: TestClock = { wall: 1_753_600_000_000, mono: 1_000_000 };
    const expiry = await startAt(makeHome(), { clock: expiryClock });
    const expiryClient = await unlock(expiry.daemon);
    expiryClock.wall += 15 * 60 * 1_000 + 1;
    expiryClock.mono += 15 * 60 * 1_000 + 1;
    expect((await expiryClient.status()).locked).toBe(true);
    expect(expiry.audit.join('')).toContain('unlock_expired');

    const suspendClock: TestClock = { wall: 1_753_600_000_000, mono: 1_000_000 };
    const suspend = await startAt(makeHome(), { clock: suspendClock });
    const suspendClient = await unlock(suspend.daemon);
    suspendClock.wall += 60_000;
    suspendClock.mono += 1_000;
    expect((await suspendClient.status()).locked).toBe(true);
    expect(suspend.audit.join('')).toContain('suspend_detected');

    const rollbackClock: TestClock = { wall: 1_753_600_000_000, mono: 1_000_000 };
    const rollback = await startAt(makeHome(), { clock: rollbackClock });
    const rollbackClient = await unlock(rollback.daemon);
    rollbackClock.wall -= 1;
    expect((await rollbackClient.status()).locked).toBe(true);
    expect(rollback.audit.join('')).toContain('clock_rollback');

    const idleClock: TestClock = { wall: 1_753_600_000_000, mono: 1_000_000 };
    const idle = await startAt(makeHome(), { clock: idleClock, idleLockMs: 1_000 });
    const idleClient = await unlock(idle.daemon);
    idleClock.wall += 1_500;
    idleClock.mono += 1_500;
    expect((await idleClient.status()).locked).toBe(true);
    expect(idle.audit.join('')).toContain('idle_locked');
  }, 30_000);

  it('bounds lifecycle configuration to the lower-only ceilings', async () => {
    await expect(startAt(makeHome(false), { idleLockMs: 5 * 60 * 1_000 + 1 }))
      .rejects.toThrow('invalid_idle_lock_ms');
    await expect(startAt(makeHome(false), { idleLockMs: 0 }))
      .rejects.toThrow('invalid_idle_lock_ms');
    await expect(startAt(makeHome(false), { maxUnlockDurationMs: 15 * 60 * 1_000 + 1 }))
      .rejects.toThrow('invalid_max_unlock_duration_ms');
    await expect(startAt(makeHome(false), { maxUnlockDurationMs: -1 }))
      .rejects.toThrow('invalid_max_unlock_duration_ms');
  });
});

describe('pico-vault CLI argument contract (ADR 0097 D5)', () => {
  it('parses known commands with their allowed flags and rejects everything else', () => {
    const parsed = parsePicoVaultCliArguments([
      'unlock', '--role', 'pico_identity', '--fingerprint', identityFixture.keyFingerprintHex,
    ]);
    expect(parsed.command).toBe('unlock');
    expect(parsed.flags.get('role')).toBe('pico_identity');
    expect(parsed.flags.get('fingerprint')).toBe(identityFixture.keyFingerprintHex);

    expect(() => parsePicoVaultCliArguments([])).toThrow('unknown_cli_command');
    expect(() => parsePicoVaultCliArguments(['export'])).toThrow('unknown_cli_command');
    expect(() => parsePicoVaultCliArguments(['status', '--role', 'pico_identity']))
      .toThrow('invalid_cli_flag');
    expect(() => parsePicoVaultCliArguments(['unlock', '--role'])).toThrow('invalid_cli_flag');
    expect(() => parsePicoVaultCliArguments([
      'unlock', '--role', 'a', '--role', 'b',
    ])).toThrow('invalid_cli_flag');
  });

  it('parses the transitional recovery subcommands and refuses every secret as a flag (ADR 0112 S1)', () => {
    const issue = parsePicoVaultCliArguments([
      'ceremony', 'issue-recovery-card',
      '--fingerprint', identityFixture.keyFingerprintHex,
      '--pico-name', 'Mira',
      '--home-id', 'home_cli_contract_0001',
      '--home-host-identity-fingerprint', '44'.repeat(32),
      '--host-signing-fingerprint', '11'.repeat(32),
      '--host-agreement-fingerprint', '22'.repeat(32),
      '--host-agreement-public-key', '33'.repeat(32),
      '--endpoint-hint', 'pico-link://cli-contract',
      '--output-dir', join(tmpdir(), 'pico-cli-contract'),
    ]);
    expect(issue.ceremony).toBe('issue-recovery-card');

    for (const subcommand of [
      'restore-identity',
      'initiate-recovery',
      'complete-recovery',
      'veto-recovery',
    ]) {
      expect(parsePicoVaultCliArguments([
        'ceremony', subcommand,
        '--fingerprint', identityFixture.keyFingerprintHex,
      ]).ceremony).toBe(subcommand);
    }

    // The PIN, the Recovery Phrase and every passphrase arrive over prompts
    // only; as flags they would land in shell history and process lists.
    for (const [subcommand, secretFlag] of [
      ['issue-recovery-card', '--pin'],
      ['restore-identity', '--pin'],
      ['restore-identity', '--recovery-phrase'],
      ['restore-identity', '--passphrase'],
    ] as const) {
      expect(() => parsePicoVaultCliArguments([
        'ceremony', subcommand, secretFlag, 'leaked',
      ])).toThrow('invalid_cli_flag');
    }
  });
});
