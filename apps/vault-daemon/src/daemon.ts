import { chmodSync, lstatSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  assertPicoVaultKeyfileMode,
  assertVaultCustodyPathSeparation,
  openPicoVaultKeyfile,
  readPicoVaultKeyfile,
  type PicoVaultEncryptedKeyfileV1,
  type PicoVaultSession,
  type VaultSodium,
} from '@pico/vault';
import type { PicoVaultPersonKeyRole } from '@pico/protocol';
import {
  encodePicoVaultDaemonFrame,
  parsePicoVaultDaemonRequest,
  picoVaultDaemonProtocolVersion,
  picoVaultDaemonRequestFamilies,
  picoVaultDaemonResponseFamily,
  PicoVaultDaemonFrameDecoder,
  type PicoVaultDaemonKeyfileDescriptor,
  type PicoVaultDaemonRequest,
  type PicoVaultDaemonUnlockRequest,
} from './protocol.js';

const DAEMON_VERSION = '0.1.7';

export const PICO_VAULT_DAEMON_IDLE_LOCK_CEILING_MS = 5 * 60 * 1_000;
export const PICO_VAULT_DAEMON_MAX_UNLOCK_DURATION_CEILING_MS = 15 * 60 * 1_000;

const SUSPEND_GAP_MS = 45_000;
const SWEEP_INTERVAL_MS = 15_000;
const HELLO_TIMEOUT_MS = 5_000;
const MAX_CONNECTIONS = 16;
const UNLOCK_FAILURE_LIMIT = 5;
const UNLOCK_FAILURE_WINDOW_MS = 60_000;
const SOCKET_PROBE_TIMEOUT_MS = 250;
const MAX_SOCKET_PATH_BYTES = 100;
const snakeCaseReasonPattern = /^[a-z0-9_]+$/;

export interface PicoVaultDaemonOptions {
  sodium: VaultSodium;
  vaultHomePath: string;
  foundationDataPath: string;
  foundationBackupPath: string;
  idleLockMs?: number;
  maxUnlockDurationMs?: number;
  wallNowMs?: () => number;
  monotonicNowMs?: () => number;
  auditSink?: (line: string) => void;
}

export interface PicoVaultDaemon {
  vaultHomePath: string;
  keyfilesPath: string;
  socketPath: string;
  close(): Promise<void>;
}

interface ConnectionState {
  decoder: PicoVaultDaemonFrameDecoder;
  helloDone: boolean;
  helloTimer: NodeJS.Timeout;
}

interface UnlockedState {
  session: PicoVaultSession;
  holdSocket: Socket;
  keyRole: PicoVaultPersonKeyRole;
  keyFingerprintHex: string;
  publicKeyHex: string;
  openedAtWallMs: number;
  openedAtMonoMs: number;
}

export function defaultMonotonicNowMs(): number {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

export async function startPicoVaultDaemon(options: PicoVaultDaemonOptions): Promise<PicoVaultDaemon> {
  const daemon = new PicoVaultDaemonRuntime(options);
  await daemon.listen();
  return daemon;
}

class PicoVaultDaemonRuntime implements PicoVaultDaemon {
  readonly vaultHomePath: string;

  readonly keyfilesPath: string;

  readonly socketPath: string;

  readonly #sodium: VaultSodium;

  readonly #idleLockMs: number;

  readonly #maxUnlockDurationMs: number;

  readonly #wallNowMs: () => number;

  readonly #monotonicNowMs: () => number;

  readonly #auditSink: (line: string) => void;

  readonly #connections = new Map<Socket, ConnectionState>();

  readonly #unlockFailuresMonoMs: number[] = [];

  #server: Server | null = null;

  #sweepTimer: NodeJS.Timeout | null = null;

  #unlocked: UnlockedState | null = null;

  #lastSweepWallMs: number;

  #lastSweepMonoMs: number;

  #closed = false;

  public constructor(options: PicoVaultDaemonOptions) {
    this.#sodium = options.sodium;
    this.vaultHomePath = resolve(options.vaultHomePath);
    this.keyfilesPath = join(this.vaultHomePath, 'keyfiles');
    this.socketPath = join(this.vaultHomePath, 'run', 'daemon.sock');
    this.#idleLockMs = boundedDurationMs(
      options.idleLockMs,
      PICO_VAULT_DAEMON_IDLE_LOCK_CEILING_MS,
      'invalid_idle_lock_ms',
    );
    this.#maxUnlockDurationMs = boundedDurationMs(
      options.maxUnlockDurationMs,
      PICO_VAULT_DAEMON_MAX_UNLOCK_DURATION_CEILING_MS,
      'invalid_max_unlock_duration_ms',
    );
    this.#wallNowMs = options.wallNowMs ?? Date.now;
    this.#monotonicNowMs = options.monotonicNowMs ?? defaultMonotonicNowMs;
    this.#auditSink = options.auditSink ?? ((line) => {
      process.stderr.write(line);
    });
    this.#lastSweepWallMs = this.#wallNowMs();
    this.#lastSweepMonoMs = this.#monotonicNowMs();

    this.#assertCustodyLayout(options.foundationDataPath, options.foundationBackupPath);
  }

  public async listen(): Promise<void> {
    await this.#takeOverStaleSocket();

    const server = createServer((socket) => {
      this.#acceptConnection(socket);
    });
    server.maxConnections = MAX_CONNECTIONS;
    this.#server = server;

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const onError = (error: NodeJS.ErrnoException): void => {
        rejectPromise(error.code === 'EADDRINUSE' ? new Error('daemon_already_running') : error);
      };
      server.once('error', onError);
      server.listen(this.socketPath, () => {
        server.off('error', onError);
        resolvePromise();
      });
    });

    chmodSync(this.socketPath, 0o600);
    this.#sweepTimer = setInterval(() => {
      this.#sweep();
    }, SWEEP_INTERVAL_MS);
    this.#sweepTimer.unref();
    this.#audit('daemon_started', {});
  }

  public async close(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;

    if (this.#sweepTimer !== null) {
      clearInterval(this.#sweepTimer);
      this.#sweepTimer = null;
    }
    this.#lockNow('daemon_shutdown');
    for (const socket of this.#connections.keys()) {
      socket.destroy();
    }
    const server = this.#server;
    if (server !== null) {
      await new Promise<void>((resolvePromise) => {
        server.close(() => {
          resolvePromise();
        });
      });
    }
    rmSync(this.socketPath, { force: true });
    this.#audit('daemon_stopped', {});
  }

  #assertCustodyLayout(foundationDataPath: string, foundationBackupPath: string): void {
    const runPath = join(this.vaultHomePath, 'run');
    if (Buffer.byteLength(this.socketPath, 'utf8') > MAX_SOCKET_PATH_BYTES) {
      throw new Error('socket_path_too_long');
    }

    assertVaultCustodyPathSeparation({
      vaultKeyfilePath: this.vaultHomePath,
      foundationDataPath,
      foundationBackupPath,
    });
    for (const foundationPath of [foundationDataPath, foundationBackupPath]) {
      if (isWithinOrEqual(resolve(foundationPath), this.vaultHomePath)) {
        throw new Error('vault_path_inside_foundation_scope');
      }
    }

    for (const directory of [this.vaultHomePath, this.keyfilesPath, runPath]) {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      assertPrivateDirectory(directory);
    }
    this.#listKeyfiles();
  }

  async #takeOverStaleSocket(): Promise<void> {
    let existing;
    try {
      existing = lstatSync(this.socketPath);
    } catch {
      return;
    }
    if (!existing.isSocket()) {
      throw new Error('socket_path_occupied');
    }
    const alive = await new Promise<boolean>((resolvePromise) => {
      const probe = createConnection(this.socketPath);
      const timer = setTimeout(() => {
        probe.destroy();
        resolvePromise(true);
      }, SOCKET_PROBE_TIMEOUT_MS);
      timer.unref();
      probe.once('connect', () => {
        clearTimeout(timer);
        probe.destroy();
        resolvePromise(true);
      });
      probe.once('error', () => {
        clearTimeout(timer);
        resolvePromise(false);
      });
    });
    if (alive) {
      throw new Error('daemon_already_running');
    }
    rmSync(this.socketPath, { force: true });
    this.#audit('stale_socket_removed', {});
  }

  #acceptConnection(socket: Socket): void {
    const state: ConnectionState = {
      decoder: new PicoVaultDaemonFrameDecoder(),
      helloDone: false,
      helloTimer: setTimeout(() => {
        socket.destroy();
      }, HELLO_TIMEOUT_MS),
    };
    state.helloTimer.unref();
    this.#connections.set(socket, state);

    socket.on('error', () => {
      socket.destroy();
    });
    socket.once('close', () => {
      clearTimeout(state.helloTimer);
      this.#connections.delete(socket);
      if (this.#unlocked !== null && this.#unlocked.holdSocket === socket) {
        this.#lockNow('hold_connection_closed');
      }
    });
    socket.on('data', (chunk) => {
      let frames: Buffer[];
      try {
        frames = state.decoder.feed(chunk);
      } catch (error) {
        this.#protocolViolation(socket, '', reasonOf(error, 'malformed_frame'));
        return;
      }
      if (frames.length > 1) {
        this.#protocolViolation(socket, '', 'request_in_flight');
        return;
      }
      for (const frame of frames) {
        this.#handleFrame(socket, state, frame);
      }
    });
  }

  #handleFrame(socket: Socket, state: ConnectionState, frame: Buffer): void {
    let request: PicoVaultDaemonRequest;
    try {
      request = parsePicoVaultDaemonRequest(frame);
    } catch (error) {
      this.#protocolViolation(socket, bestEffortRequestId(frame), reasonOf(error, 'invalid_request'));
      return;
    }

    if (!state.helloDone && request.family !== picoVaultDaemonRequestFamilies.hello) {
      this.#protocolViolation(socket, request.requestId, 'hello_required');
      return;
    }

    this.#sweep();

    switch (request.family) {
      case picoVaultDaemonRequestFamilies.hello: {
        if (state.helloDone) {
          this.#protocolViolation(socket, request.requestId, 'invalid_request');
          return;
        }
        if (request.protocolVersion !== picoVaultDaemonProtocolVersion) {
          this.#protocolViolation(socket, request.requestId, 'unsupported_protocol_version');
          return;
        }
        state.helloDone = true;
        clearTimeout(state.helloTimer);
        this.#respondOk(socket, request.requestId, {
          protocolVersion: picoVaultDaemonProtocolVersion,
          daemonVersion: DAEMON_VERSION,
          locked: this.#unlocked === null,
        });
        return;
      }
      case picoVaultDaemonRequestFamilies.status: {
        let keyfiles: PicoVaultDaemonKeyfileDescriptor[];
        try {
          keyfiles = this.#listKeyfiles().map((entry) => entry.descriptor);
        } catch (error) {
          this.#respondError(socket, request.requestId, reasonOf(error, 'invalid_keyfile_envelope'));
          return;
        }
        const unlocked = this.#unlocked;
        this.#respondOk(socket, request.requestId, {
          locked: unlocked === null,
          session: unlocked === null
            ? null
            : { keyRole: unlocked.keyRole, keyFingerprintHex: unlocked.keyFingerprintHex },
          keyfiles,
        });
        return;
      }
      case picoVaultDaemonRequestFamilies.unlock: {
        this.#handleUnlock(socket, request);
        return;
      }
      case picoVaultDaemonRequestFamilies.lock: {
        this.#lockNow('explicit_lock');
        this.#respondOk(socket, request.requestId, { locked: true });
        return;
      }
      case picoVaultDaemonRequestFamilies.sign: {
        const unlocked = this.#unlocked;
        if (unlocked === null) {
          this.#respondError(socket, request.requestId, 'vault_locked');
          return;
        }
        try {
          const signature = unlocked.session.sign(
            Uint8Array.from(Buffer.from(request.signatureInputHex, 'hex')),
            { nowMs: this.#wallNowMs() },
          );
          this.#audit('sign', {
            outcome: 'ok',
            keyRole: unlocked.keyRole,
            keyFingerprintHex: unlocked.keyFingerprintHex,
          });
          this.#respondOk(socket, request.requestId, {
            signatureHex: Buffer.from(signature).toString('hex'),
            keyRole: unlocked.keyRole,
            keyFingerprintHex: unlocked.keyFingerprintHex,
          });
        } catch (error) {
          const reason = reasonOf(error, 'invalid_signature_input');
          if (reason === 'vault_locked') {
            this.#lockNow('idle_locked');
          }
          this.#audit('sign', { outcome: 'error', reason });
          this.#respondError(socket, request.requestId, reason);
        }
        return;
      }
    }
  }

  #handleUnlock(socket: Socket, request: PicoVaultDaemonUnlockRequest): void {
    if (this.#unlocked !== null) {
      this.#respondError(socket, request.requestId, 'already_unlocked');
      return;
    }
    if (this.#isUnlockThrottled()) {
      this.#audit('unlock', { outcome: 'error', reason: 'unlock_throttled', keyRole: request.keyRole });
      this.#respondError(socket, request.requestId, 'unlock_throttled');
      return;
    }
    if (request.keyRole === 'device_key_agreement') {
      this.#respondError(socket, request.requestId, 'key_role_not_served');
      return;
    }

    let keyfile: PicoVaultEncryptedKeyfileV1 | undefined;
    try {
      keyfile = this.#listKeyfiles().find(
        (entry) => entry.descriptor.keyRole === request.keyRole
          && entry.descriptor.keyFingerprintHex === request.keyFingerprintHex,
      )?.keyfile;
    } catch (error) {
      this.#respondError(socket, request.requestId, reasonOf(error, 'invalid_keyfile_envelope'));
      return;
    }
    if (keyfile === undefined) {
      this.#respondError(socket, request.requestId, 'unknown_keyfile');
      return;
    }

    const wallMs = this.#wallNowMs();
    let session: PicoVaultSession;
    try {
      session = openPicoVaultKeyfile(this.#sodium, {
        keyfile,
        passphrase: request.passphrase,
        autoLockAfterMs: this.#idleLockMs,
        nowMs: wallMs,
      });
    } catch (error) {
      const reason = snakeCaseReasonPattern.test(messageOf(error)) ? messageOf(error) : 'wrong_passphrase';
      this.#unlockFailuresMonoMs.push(this.#monotonicNowMs());
      this.#audit('unlock', {
        outcome: 'error',
        reason,
        keyRole: request.keyRole,
        keyFingerprintHex: request.keyFingerprintHex,
      });
      this.#respondError(socket, request.requestId, reason);
      return;
    }

    const metadata = session.metadata();
    this.#unlocked = {
      session,
      holdSocket: socket,
      keyRole: metadata.keyRole,
      keyFingerprintHex: metadata.keyFingerprintHex,
      publicKeyHex: metadata.publicKeyHex,
      openedAtWallMs: wallMs,
      openedAtMonoMs: this.#monotonicNowMs(),
    };
    this.#audit('unlock', {
      outcome: 'ok',
      keyRole: metadata.keyRole,
      keyFingerprintHex: metadata.keyFingerprintHex,
    });
    this.#respondOk(socket, request.requestId, {
      keyRole: metadata.keyRole,
      keyFingerprintHex: metadata.keyFingerprintHex,
      publicKeyHex: metadata.publicKeyHex,
      idleLockMs: this.#idleLockMs,
      maxUnlockDurationMs: this.#maxUnlockDurationMs,
    });
  }

  #listKeyfiles(): { descriptor: PicoVaultDaemonKeyfileDescriptor; keyfile: PicoVaultEncryptedKeyfileV1 }[] {
    const entries: { descriptor: PicoVaultDaemonKeyfileDescriptor; keyfile: PicoVaultEncryptedKeyfileV1 }[] = [];
    for (const name of readdirSync(this.keyfilesPath).sort()) {
      if (!name.endsWith('.json')) {
        continue;
      }
      const path = join(this.keyfilesPath, name);
      assertPicoVaultKeyfileMode(path);
      const keyfile = readPicoVaultKeyfile(path);
      entries.push({
        descriptor: {
          keyRole: keyfile.header.keyRole,
          keyFingerprintHex: keyfile.header.keyFingerprintHex,
        },
        keyfile,
      });
    }
    return entries;
  }

  /**
   * Lifecycle admission: rollback, suspend, duration and idle checks run on
   * every request and on the sweep tick, so a quiet daemon still locks on
   * time. Tracker updates happen even while locked, so a suspend that spans a
   * locked period cannot poison the next unlocked window.
   */
  #sweep(): void {
    const wallMs = this.#wallNowMs();
    const monoMs = this.#monotonicNowMs();
    const wallDelta = wallMs - this.#lastSweepWallMs;
    const monoDelta = monoMs - this.#lastSweepMonoMs;
    const rolledBack = wallMs < this.#lastSweepWallMs;
    const suspended = wallDelta - monoDelta > SUSPEND_GAP_MS;
    this.#lastSweepWallMs = Math.max(this.#lastSweepWallMs, wallMs);
    this.#lastSweepMonoMs = monoMs;

    const unlocked = this.#unlocked;
    if (unlocked === null) {
      return;
    }
    if (rolledBack) {
      this.#lockNow('clock_rollback');
      return;
    }
    if (suspended) {
      this.#lockNow('suspend_detected');
      return;
    }
    if (
      monoMs - unlocked.openedAtMonoMs > this.#maxUnlockDurationMs
      || wallMs - unlocked.openedAtWallMs > this.#maxUnlockDurationMs
    ) {
      this.#lockNow('unlock_expired');
      return;
    }
    if (unlocked.session.isLocked({ nowMs: wallMs })) {
      this.#lockNow('idle_locked');
    }
  }

  #isUnlockThrottled(): boolean {
    const monoMs = this.#monotonicNowMs();
    while (
      this.#unlockFailuresMonoMs.length > 0
      && monoMs - (this.#unlockFailuresMonoMs[0] as number) > UNLOCK_FAILURE_WINDOW_MS
    ) {
      this.#unlockFailuresMonoMs.shift();
    }
    return this.#unlockFailuresMonoMs.length >= UNLOCK_FAILURE_LIMIT;
  }

  #lockNow(cause: string): void {
    const unlocked = this.#unlocked;
    if (unlocked === null) {
      return;
    }
    this.#unlocked = null;
    try {
      unlocked.session.lock();
    } catch {
      // A throwing lock is its own security event (the ADR 0096 posture):
      // closure must not be claimed when it did not verifiably happen.
      this.#audit('lock_failed', {
        cause,
        keyRole: unlocked.keyRole,
        keyFingerprintHex: unlocked.keyFingerprintHex,
      });
      return;
    }
    this.#audit('locked', {
      cause,
      keyRole: unlocked.keyRole,
      keyFingerprintHex: unlocked.keyFingerprintHex,
    });
  }

  #respondOk(socket: Socket, requestId: string, result: Record<string, unknown>): void {
    socket.write(encodePicoVaultDaemonFrame({
      family: picoVaultDaemonResponseFamily,
      requestId,
      ok: true,
      result,
    }));
  }

  #respondError(socket: Socket, requestId: string, reason: string): void {
    socket.write(encodePicoVaultDaemonFrame({
      family: picoVaultDaemonResponseFamily,
      requestId,
      ok: false,
      reason,
    }));
  }

  #protocolViolation(socket: Socket, requestId: string, reason: string): void {
    this.#audit('protocol_error', { reason });
    this.#respondError(socket, requestId, reason);
    socket.end();
    socket.destroySoon();
  }

  #audit(event: string, fields: Record<string, string | number | boolean>): void {
    this.#auditSink(`${JSON.stringify({
      at: new Date(this.#wallNowMs()).toISOString(),
      event,
      ...fields,
    })}\n`);
  }
}

function boundedDurationMs(value: number | undefined, ceilingMs: number, errorReason: string): number {
  if (value === undefined) {
    return ceilingMs;
  }
  if (!Number.isSafeInteger(value) || value <= 0 || value > ceilingMs) {
    throw new Error(errorReason);
  }
  return value;
}

function assertPrivateDirectory(path: string): void {
  const stat = statSync(path);
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  if (!stat.isDirectory() || (stat.mode & 0o777) !== 0o700 || (uid !== null && stat.uid !== uid)) {
    throw new Error('vault_home_permissions');
  }
}

function isWithinOrEqual(candidate: string, scope: string): boolean {
  if (candidate === scope) {
    return true;
  }
  const relativePath = relative(scope, candidate);
  return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reasonOf(error: unknown, fallback: string): string {
  const message = messageOf(error);
  return snakeCaseReasonPattern.test(message) ? message : fallback;
}

function bestEffortRequestId(frame: Buffer): string {
  try {
    const parsed: unknown = JSON.parse(frame.toString('utf8'));
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const requestId = (parsed as Record<string, unknown>).requestId;
      if (typeof requestId === 'string' && requestId.length <= 64) {
        return requestId;
      }
    }
  } catch {
    // fall through to the anonymous id
  }
  return '';
}
