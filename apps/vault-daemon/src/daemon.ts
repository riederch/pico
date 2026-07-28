import { chmodSync, lstatSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  assertPicoVaultKeyfileMode,
  assertVaultCustodyPathSeparation,
  createPicoReaderCustodyDomain,
  createPicoReaderCustodyReaderGrant,
  createPicoVaultReaderCustodySyncAccessSession,
  openPicoVaultKeyfile,
  picoVaultCanSignLabel,
  readPicoVaultKeyfile,
  rotatePicoReaderCustodyDomain,
  type PicoVaultEncryptedKeyfileV1,
  type PicoVaultReaderCustodySyncAccessSession,
  type PicoVaultReaderCustodySyncItemEvidence,
  type PicoVaultSession,
  type VaultSodium,
} from '@pico/vault';
import type {
  PicoReaderCustodySyncBatchRecord,
  PicoVaultPersonKeyRole,
} from '@pico/protocol';
import {
  encodePicoVaultDaemonFrame,
  parsePicoVaultDaemonRequest,
  picoVaultDaemonProtocolVersion,
  picoVaultDaemonRequestFamilies,
  picoVaultDaemonResponseFamily,
  picoVaultDaemonSignatureNeedsApproval,
  MAX_PICO_VAULT_DAEMON_FRAME_BYTES,
  MAX_PICO_VAULT_DAEMON_READER_ACCESS_FRAME_BYTES,
  PICO_VAULT_DAEMON_APPROVAL_ID_HEX_CHARS,
  PICO_VAULT_DAEMON_APPROVAL_WAIT_MS,
  PICO_VAULT_DAEMON_APPROVAL_WINDOW_MS,
  PICO_VAULT_DAEMON_LEASE_ID_HEX_CHARS,
  PICO_VAULT_DAEMON_READER_ACCESS_LEASE_CEILING_MS,
  PicoVaultDaemonFrameDecoder,
  type PicoVaultDaemonApprovalDecideRequest,
  type PicoVaultDaemonApprovalRequestDescriptor,
  type PicoVaultDaemonApprovalWaitRequest,
  type PicoVaultDaemonKeyfileDescriptor,
  type PicoVaultDaemonSignRequest,
  type PicoVaultDaemonReaderAccessDecryptItemRequest,
  type PicoVaultDaemonReaderAccessOpenPayloadRequest,
  type PicoVaultDaemonReaderAccessOpenRequest,
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
const MAX_UNLOCKED_SESSIONS = 4;
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
  approvalWindowMs?: number;
  approvalWaitMs?: number;
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
  /**
   * ADR 0099 makes the one-request-in-flight rule load-bearing: a parked
   * `approval.wait` or a parked gated `sign` leaves a response outstanding
   * across reads, so a second request arriving meanwhile must be refused
   * rather than processed alongside it.
   */
  inFlight: boolean;
  approvalWaitRequestId: string | null;
  approvalWaitTimer: NodeJS.Timeout | null;
  /**
   * Whether this connection has already been audited as an approval channel.
   * The long poll repeats for as long as the terminal is open, so the audit
   * records the transition once rather than every poll.
   */
  approvalWatchAudited: boolean;
}

/**
 * One approval authorizes exactly one action - a single signature (ADR 0099)
 * or a single ceremony execution (ADR 0101). It is bound to the requesting
 * connection, that connection's request id and the digest of the exact bytes -
 * never to a time window. `run` performs the approved action and writes the
 * consumer's response; the deny paths never call it.
 */
interface PendingApproval {
  approvalId: string;
  label: string;
  keyRole: PicoVaultPersonKeyRole;
  keyFingerprintHex: string;
  signatureInputDigestHex: string;
  summary?: Record<string, string | number>;
  consumerSocket: Socket;
  consumerRequestId: string;
  signerKeyFingerprintHex: string;
  signerHoldSocket: Socket;
  timer: NodeJS.Timeout;
  run: () => void;
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

/**
 * ADR 0098 per-run capability over the person's already unlocked session.
 * Closing a lease ends the run's capability; it deliberately does not lock the
 * session, because the unlock window belongs to the person's hold connection
 * and not to whichever consumer happened to lease from it.
 */
interface ReaderAccessLease {
  leaseId: string;
  connection: Socket;
  accessSession: PicoVaultReaderCustodySyncAccessSession;
  keyRole: PicoVaultPersonKeyRole;
  keyFingerprintHex: string;
  openedAtMonoMs: number;
  maxDurationMs: number;
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

  readonly #approvalWindowMs: number;

  readonly #approvalWaitMs: number;

  readonly #wallNowMs: () => number;

  readonly #monotonicNowMs: () => number;

  readonly #auditSink: (line: string) => void;

  readonly #connections = new Map<Socket, ConnectionState>();

  readonly #unlockFailuresMonoMs: number[] = [];

  #server: Server | null = null;

  #sweepTimer: NodeJS.Timeout | null = null;

  /**
   * ADR 0102: sessions keyed by fingerprint rather than role, because one
   * person is frequently both domain owner and reader on the same machine and
   * therefore needs two distinct `device_key_agreement` keys at once.
   */
  readonly #unlockedSessions = new Map<string, UnlockedState>();

  #lease: ReaderAccessLease | null = null;

  /**
   * At most one connection at a time carries the raised ADR 0098 frame budget.
   * It keeps the budget after its lease ends, so a consumer whose lease died
   * between deciding to send and sending still gets a named error instead of an
   * oversized-frame disconnect.
   */
  #readerAccessConnection: Socket | null = null;

  #pendingApproval: PendingApproval | null = null;

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
    this.#approvalWindowMs = boundedDurationMs(
      options.approvalWindowMs,
      PICO_VAULT_DAEMON_APPROVAL_WINDOW_MS,
      'invalid_approval_window_ms',
    );
    this.#approvalWaitMs = boundedDurationMs(
      options.approvalWaitMs,
      PICO_VAULT_DAEMON_APPROVAL_WAIT_MS,
      'invalid_approval_wait_ms',
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
    this.#denyApproval('daemon_shutdown');
    this.#closeLease('daemon_shutdown');
    this.#lockAllSessions('daemon_shutdown');
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
      inFlight: false,
      approvalWaitRequestId: null,
      approvalWaitTimer: null,
      approvalWatchAudited: false,
    };
    state.helloTimer.unref();
    this.#connections.set(socket, state);

    socket.on('error', () => {
      socket.destroy();
    });
    socket.once('close', () => {
      clearTimeout(state.helloTimer);
      this.#clearApprovalWait(state);
      this.#connections.delete(socket);
      if (this.#pendingApproval !== null && this.#pendingApproval.consumerSocket === socket) {
        this.#discardApproval('approval_consumer_closed');
      }
      if (this.#lease !== null && this.#lease.connection === socket) {
        this.#closeLease('lease_connection_closed');
      }
      if (this.#readerAccessConnection === socket) {
        this.#readerAccessConnection = null;
      }
      for (const [keyFingerprintHex, unlocked] of [...this.#unlockedSessions]) {
        if (unlocked.holdSocket === socket) {
          this.#lockSession(keyFingerprintHex, 'hold_connection_closed');
        }
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
        if (state.inFlight) {
          this.#protocolViolation(socket, '', 'request_in_flight');
          return;
        }
        state.inFlight = true;
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
          locked: this.#unlockedSessions.size === 0,
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
        const sessions = [...this.#unlockedSessions.values()].map((unlocked) => ({
          keyRole: unlocked.keyRole,
          keyFingerprintHex: unlocked.keyFingerprintHex,
          publicKeyHex: unlocked.publicKeyHex,
        }));
        this.#respondOk(socket, request.requestId, {
          locked: sessions.length === 0,
          sessions,
          keyfiles,
        });
        return;
      }
      case picoVaultDaemonRequestFamilies.unlock: {
        this.#handleUnlock(socket, request);
        return;
      }
      case picoVaultDaemonRequestFamilies.lock: {
        // Locking is never privileged and stays coarse on purpose: any
        // connection may end every session at once as a safety valve.
        this.#lockAllSessions('explicit_lock');
        this.#respondOk(socket, request.requestId, { locked: true });
        return;
      }
      case picoVaultDaemonRequestFamilies.sign: {
        this.#handleSign(socket, request);
        return;
      }
      case picoVaultDaemonRequestFamilies.approvalWait: {
        this.#handleApprovalWait(socket, state, request);
        return;
      }
      case picoVaultDaemonRequestFamilies.approvalDecide: {
        this.#handleApprovalDecide(socket, request);
        return;
      }
      case picoVaultDaemonRequestFamilies.ceremonyCreateDomain: {
        this.#handleCeremony(socket, frame, request, {
          summary: { domainId: request.domainId, homeId: request.homeId },
          execute: (session) => ({
            domainRecord: createPicoReaderCustodyDomain(this.#sodium, {
              ownerIdentitySession: session,
              ownerReaderKeyRecord: request.ownerReaderKeyRecord as never,
              domainAuthorityId: request.domainAuthorityId,
              homeId: request.homeId,
              hostSigningKeyFingerprintHex: request.hostSigningKeyFingerprintHex,
              domainId: request.domainId,
              ...(request.kekVersion === undefined ? {} : { kekVersion: request.kekVersion }),
              authorizedAt: request.authorizedAt,
              lifecycleOrder: request.lifecycleOrder,
              ...(request.receivedAt === undefined ? {} : { receivedAt: request.receivedAt }),
            }) as unknown as Record<string, unknown>,
          }),
        });
        return;
      }
      case picoVaultDaemonRequestFamilies.ceremonyRotateDomain: {
        this.#handleCeremony(socket, frame, request, {
          summary: {
            domainId: String((request.domainRecord as { domain?: { domainId?: unknown } })
              .domain?.domainId ?? ''),
            remainingReaders: request.remainingReaderGrantRecords.length,
            rotationId: request.rotationId,
          },
          execute: (session) => ({
            rotationRecord: rotatePicoReaderCustodyDomain(this.#sodium, {
              ownerIdentitySession: session,
              domainRecord: request.domainRecord as never,
              rotationRecords: request.rotationRecords as never,
              readerGrantLifecycleRecords: request.readerGrantLifecycleRecords as never,
              writerGrantLifecycleRecords: request.writerGrantLifecycleRecords as never,
              remainingReaderGrantRecords: request.remainingReaderGrantRecords as never,
              rotationId: request.rotationId,
              rotatedAt: request.rotatedAt,
              lifecycleOrder: request.lifecycleOrder,
              ...(request.receivedAt === undefined ? {} : { receivedAt: request.receivedAt }),
            }) as unknown as Record<string, unknown>,
          }),
        });
        return;
      }
      case picoVaultDaemonRequestFamilies.ceremonyCreateReaderGrant: {
        this.#handleCeremony(socket, frame, request, {
          summary: {
            domainId: String((request.domainRecord as { domain?: { domainId?: unknown } })
              .domain?.domainId ?? ''),
            readerGrantId: request.readerGrantId,
            accessMode: request.accessMode,
            historicalVersions: request.rotationRecords.length,
          },
          requires: [{
            keyFingerprintHex: request.agreementKeyFingerprintHex,
            keyRole: 'device_key_agreement',
          }],
          execute: (session, required) => ({
            readerGrantRecord: createPicoReaderCustodyReaderGrant(this.#sodium, {
              ownerIdentitySession: session,
              ownerReaderKeyAgreementSession: required[0] as PicoVaultSession,
              domainRecord: request.domainRecord as never,
              rotationRecords: request.rotationRecords as never,
              readerKeyRecord: request.readerKeyRecord as never,
              readerGrantId: request.readerGrantId,
              readerIdentityKeyFingerprintHex: request.readerIdentityKeyFingerprintHex,
              readerDeviceSigningKeyFingerprintHex: request.readerDeviceSigningKeyFingerprintHex,
              readerDelegationId: request.readerDelegationId,
              accessMode: request.accessMode as never,
              firstKekVersion: request.firstKekVersion,
              validFrom: request.validFrom,
              validUntil: request.validUntil,
              lifecycleOrder: request.lifecycleOrder,
              ...(request.receivedAt === undefined ? {} : { receivedAt: request.receivedAt }),
            }) as unknown as Record<string, unknown>,
          }),
        });
        return;
      }
      case picoVaultDaemonRequestFamilies.readerAccessOpen: {
        this.#handleReaderAccessOpen(socket, state, request);
        return;
      }
      case picoVaultDaemonRequestFamilies.readerAccessIsLocked: {
        // An unknown, foreign, closed or dead lease reports locked rather than
        // failing: ADR 0096 verifies closure through this call, and an error
        // here would masquerade as a lock failure for a lease that did close.
        const lease = this.#resolveLease(socket, request.leaseId);
        this.#respondOk(socket, request.requestId, {
          locked: lease === null || this.#leaseFailure(lease) !== null,
        });
        return;
      }
      case picoVaultDaemonRequestFamilies.readerAccessClose: {
        if (this.#resolveLease(socket, request.leaseId) !== null) {
          this.#closeLease('explicit_close');
        }
        this.#respondOk(socket, request.requestId, { closed: true });
        return;
      }
      case picoVaultDaemonRequestFamilies.readerAccessOpenPayload: {
        this.#handleReaderAccessOpenPayload(socket, request);
        return;
      }
      case picoVaultDaemonRequestFamilies.readerAccessDecryptItem: {
        this.#handleReaderAccessDecryptItem(socket, request);
        return;
      }
    }
  }

  #handleSign(socket: Socket, request: PicoVaultDaemonSignRequest): void {
    const unlocked = this.#requireUnlocked(
      socket,
      request.requestId,
      request.keyFingerprintHex,
    );
    if (unlocked === null) {
      return;
    }
    if (unlocked.keyRole === 'device_key_agreement') {
      this.#respondError(socket, request.requestId, 'key_role_cannot_sign');
      return;
    }
    const signatureInput = Uint8Array.from(Buffer.from(request.signatureInputHex, 'hex'));

    // Classification only. The Vault still enforces its own role-scoped label
    // set when it signs, so a disagreement here can refuse but never widen.
    // Refusing an unsignable label here matters for approval: the person must
    // never be asked to decide on bytes that would be rejected anyway.
    let label: string;
    try {
      label = firstCanonicalElementAscii(signatureInput);
    } catch {
      this.#audit('sign', { outcome: 'error', reason: 'unknown_signature_input_label' });
      this.#respondError(socket, request.requestId, 'unknown_signature_input_label');
      return;
    }
    if (!picoVaultCanSignLabel(unlocked.keyRole, label)) {
      this.#audit('sign', { outcome: 'error', reason: 'unknown_signature_input_label' });
      this.#respondError(socket, request.requestId, 'unknown_signature_input_label');
      return;
    }

    if (!picoVaultDaemonSignatureNeedsApproval(label)) {
      this.#completeSign(socket, request.requestId, unlocked.keyFingerprintHex, signatureInput);
      return;
    }
    if (this.#pendingApproval !== null) {
      this.#respondError(socket, request.requestId, 'approval_pending');
      return;
    }
    const waiter = this.#approvalWaiter(unlocked);
    if (waiter === null) {
      this.#audit('approval_requested', {
        outcome: 'error',
        reason: 'approval_unavailable',
        label,
      });
      this.#respondError(socket, request.requestId, 'approval_unavailable');
      return;
    }

    this.#parkApproval({
      label,
      digestHex: Buffer.from(
        this.#sodium.crypto_generichash(32, signatureInput, null),
      ).toString('hex'),
      consumerSocket: socket,
      consumerRequestId: request.requestId,
      signer: unlocked,
      waiter,
      run: () => {
        this.#completeSign(socket, request.requestId, unlocked.keyFingerprintHex, signatureInput);
      },
    });
  }

  /**
   * ADR 0101: one ceremony, one approval, bound to the digest of the exact
   * frame bytes (request id included). On approval the ceremony executes
   * against the daemon's own unlocked identity session - every internal
   * signature and the fresh KEK stay inside the boundary.
   */
  #handleCeremony(
    socket: Socket,
    frame: Buffer,
    request: { family: string; requestId: string; signerKeyFingerprintHex: string },
    ceremony: {
      summary: Record<string, string | number>;
      /** Extra sessions this ceremony needs; resolved and role-checked before
       * the person is asked, so an approval is never raised for a ceremony
       * that cannot run. */
      requires?: { keyFingerprintHex: string; keyRole: PicoVaultPersonKeyRole }[];
      execute: (
        signer: PicoVaultSession,
        required: PicoVaultSession[],
      ) => Record<string, unknown>;
    },
  ): void {
    const unlocked = this.#requireUnlocked(
      socket,
      request.requestId,
      request.signerKeyFingerprintHex,
    );
    if (unlocked === null) {
      return;
    }
    if (unlocked.keyRole !== 'pico_identity') {
      this.#audit('ceremony_requested', {
        outcome: 'error',
        reason: 'ceremony_key_role_mismatch',
        label: request.family,
      });
      this.#respondError(socket, request.requestId, 'ceremony_key_role_mismatch');
      return;
    }
    const requiredFingerprints = (ceremony.requires ?? []).map((required) => {
      const session = this.#unlockedSessions.get(required.keyFingerprintHex);
      if (session === undefined || session.keyRole !== required.keyRole) {
        return null;
      }
      return required.keyFingerprintHex;
    });
    if (requiredFingerprints.some((fingerprint) => fingerprint === null)) {
      this.#audit('ceremony_requested', {
        outcome: 'error',
        reason: 'unknown_unlocked_key',
        label: request.family,
      });
      this.#respondError(socket, request.requestId, 'unknown_unlocked_key');
      return;
    }
    if (this.#pendingApproval !== null) {
      this.#respondError(socket, request.requestId, 'approval_pending');
      return;
    }
    const waiter = this.#approvalWaiter(unlocked);
    if (waiter === null) {
      this.#audit('ceremony_requested', {
        outcome: 'error',
        reason: 'approval_unavailable',
        label: request.family,
      });
      this.#respondError(socket, request.requestId, 'approval_unavailable');
      return;
    }

    this.#audit('ceremony_requested', { outcome: 'ok', label: request.family });
    this.#parkApproval({
      label: request.family,
      digestHex: Buffer.from(
        this.#sodium.crypto_generichash(32, Uint8Array.from(frame), null),
      ).toString('hex'),
      summary: ceremony.summary,
      consumerSocket: socket,
      consumerRequestId: request.requestId,
      signer: unlocked,
      waiter,
      run: () => {
        const current = this.#unlockedSessions.get(request.signerKeyFingerprintHex);
        const required = requiredFingerprints.map(
          (fingerprint) => this.#unlockedSessions.get(fingerprint as string),
        );
        if (current === undefined || required.some((session) => session === undefined)) {
          this.#respondError(socket, request.requestId, 'vault_locked');
          return;
        }
        try {
          const result = ceremony.execute(
            current.session,
            required.map((session) => (session as UnlockedState).session),
          );
          this.#audit('ceremony_completed', { outcome: 'ok', label: request.family });
          this.#respondOk(socket, request.requestId, result);
        } catch (error) {
          const reason = reasonOf(error, 'ceremony_failed');
          this.#audit('ceremony_completed', {
            outcome: 'error',
            reason,
            label: request.family,
          });
          this.#respondError(socket, request.requestId, reason);
        }
      },
    });
  }

  #parkApproval(input: {
    label: string;
    digestHex: string;
    summary?: Record<string, string | number>;
    consumerSocket: Socket;
    consumerRequestId: string;
    signer: UnlockedState;
    waiter: { socket: Socket; state: ConnectionState; requestId: string };
    run: () => void;
  }): void {
    const unlocked = input.signer;
    const timer = setTimeout(() => {
      this.#denyApproval('approval_timeout');
    }, this.#approvalWindowMs);
    timer.unref();
    this.#pendingApproval = {
      approvalId: Buffer.from(
        this.#sodium.randombytes_buf(PICO_VAULT_DAEMON_APPROVAL_ID_HEX_CHARS / 2),
      ).toString('hex'),
      label: input.label,
      keyRole: unlocked.keyRole,
      keyFingerprintHex: unlocked.keyFingerprintHex,
      signatureInputDigestHex: input.digestHex,
      ...(input.summary === undefined ? {} : { summary: input.summary }),
      consumerSocket: input.consumerSocket,
      consumerRequestId: input.consumerRequestId,
      signerKeyFingerprintHex: unlocked.keyFingerprintHex,
      signerHoldSocket: unlocked.holdSocket,
      timer,
      run: input.run,
    };
    this.#audit('approval_requested', {
      outcome: 'ok',
      label: input.label,
      keyRole: unlocked.keyRole,
      keyFingerprintHex: unlocked.keyFingerprintHex,
    });
    this.#clearApprovalWait(input.waiter.state);
    this.#respondOk(input.waiter.socket, input.waiter.requestId, {
      pending: this.#approvalDescriptor(this.#pendingApproval),
    });
  }

  #completeSign(
    socket: Socket,
    requestId: string,
    keyFingerprintHex: string,
    signatureInput: Uint8Array,
  ): void {
    this.#sweep();
    const unlocked = this.#unlockedSessions.get(keyFingerprintHex);
    if (unlocked === undefined) {
      this.#audit('sign', { outcome: 'error', reason: 'vault_locked' });
      this.#respondError(socket, requestId, 'vault_locked');
      return;
    }
    try {
      const signature = unlocked.session.sign(signatureInput, { nowMs: this.#wallNowMs() });
      this.#audit('sign', {
        outcome: 'ok',
        keyRole: unlocked.keyRole,
        keyFingerprintHex: unlocked.keyFingerprintHex,
      });
      this.#respondOk(socket, requestId, {
        signatureHex: Buffer.from(signature).toString('hex'),
        keyRole: unlocked.keyRole,
        keyFingerprintHex: unlocked.keyFingerprintHex,
      });
    } catch (error) {
      const reason = reasonOf(error, 'invalid_signature_input');
      if (reason === 'vault_locked') {
        this.#lockSession(unlocked.keyFingerprintHex, 'idle_locked');
      }
      this.#audit('sign', { outcome: 'error', reason });
      this.#respondError(socket, requestId, reason);
    }
  }

  #handleApprovalWait(
    socket: Socket,
    state: ConnectionState,
    request: PicoVaultDaemonApprovalWaitRequest,
  ): void {
    // Any hold connection may wait; an approval is routed to the hold
    // connection of the session whose key would create the authority.
    const held = this.#sessionHeldBy(socket);
    if (held === null) {
      this.#respondError(socket, request.requestId, 'approval_wait_forbidden');
      return;
    }
    // A terminal becomes an approval channel when its first wait arrives, and
    // a gated signature fails closed as `approval_unavailable` while none is
    // watching. Auditing that transition is what makes an unavailable
    // approval diagnosable after the fact; the flag keeps the repeating long
    // poll from turning one standing terminal into a stream of records.
    if (!state.approvalWatchAudited) {
      state.approvalWatchAudited = true;
      this.#audit('approval_watch_started', {
        keyFingerprintHex: held.keyFingerprintHex,
        keyRole: held.keyRole,
      });
    }
    const pending = this.#pendingApproval;
    if (pending !== null && pending.signerHoldSocket === socket) {
      this.#respondOk(socket, request.requestId, {
        pending: this.#approvalDescriptor(pending),
      });
      return;
    }

    state.approvalWaitRequestId = request.requestId;
    state.approvalWaitTimer = setTimeout(() => {
      const parkedRequestId = state.approvalWaitRequestId;
      this.#clearApprovalWait(state);
      if (parkedRequestId !== null) {
        this.#respondOk(socket, parkedRequestId, { pending: null });
      }
    }, this.#approvalWaitMs);
    state.approvalWaitTimer.unref();
  }

  #handleApprovalDecide(
    socket: Socket,
    request: PicoVaultDaemonApprovalDecideRequest,
  ): void {
    const pending = this.#pendingApproval;
    // Only the holder of the signing key decides what that key creates, so
    // neither a consumer nor another key's holder can approve this.
    if (pending !== null && pending.signerHoldSocket !== socket) {
      this.#respondError(socket, request.requestId, 'approval_decision_forbidden');
      return;
    }
    if (pending === null || pending.approvalId !== request.approvalId) {
      this.#respondError(socket, request.requestId, 'unknown_approval');
      return;
    }
    if (pending.signatureInputDigestHex !== request.signatureInputDigestHex) {
      this.#audit('approval_decided', {
        outcome: 'error',
        reason: 'approval_digest_mismatch',
        label: pending.label,
      });
      this.#respondError(socket, request.requestId, 'approval_digest_mismatch');
      return;
    }

    clearTimeout(pending.timer);
    this.#pendingApproval = null;
    this.#audit('approval_decided', {
      outcome: 'ok',
      approved: request.approved,
      label: pending.label,
    });
    if (request.approved) {
      pending.run();
    } else {
      this.#respondError(pending.consumerSocket, pending.consumerRequestId, 'approval_denied');
    }
    this.#respondOk(socket, request.requestId, { recorded: true });
  }

  #approvalWaiter(
    signer: UnlockedState,
  ): { socket: Socket; state: ConnectionState; requestId: string } | null {
    const state = this.#connections.get(signer.holdSocket);
    if (state === undefined || state.approvalWaitRequestId === null) {
      return null;
    }
    return { socket: signer.holdSocket, state, requestId: state.approvalWaitRequestId };
  }

  #sessionHeldBy(socket: Socket): UnlockedState | null {
    for (const unlocked of this.#unlockedSessions.values()) {
      if (unlocked.holdSocket === socket) {
        return unlocked;
      }
    }
    return null;
  }

  /**
   * Explicit key selection (ADR 0102 M2): an unknown or locked fingerprint
   * fails rather than falling back to whatever happens to be unlocked.
   */
  #requireUnlocked(
    socket: Socket,
    requestId: string,
    keyFingerprintHex: string,
  ): UnlockedState | null {
    const unlocked = this.#unlockedSessions.get(keyFingerprintHex);
    if (unlocked === undefined) {
      // "Nothing is unlocked" and "that key is not among the unlocked ones"
      // are different facts, and consumers act differently on them.
      this.#respondError(
        socket,
        requestId,
        this.#unlockedSessions.size === 0 ? 'vault_locked' : 'unknown_unlocked_key',
      );
      return null;
    }
    return unlocked;
  }

  #approvalDescriptor(pending: PendingApproval): PicoVaultDaemonApprovalRequestDescriptor {
    return {
      approvalId: pending.approvalId,
      label: pending.label,
      keyRole: pending.keyRole,
      keyFingerprintHex: pending.keyFingerprintHex,
      signatureInputDigestHex: pending.signatureInputDigestHex,
      expiresInMs: this.#approvalWindowMs,
      ...(pending.summary === undefined ? {} : { summary: pending.summary }),
    };
  }

  #clearApprovalWait(state: ConnectionState): void {
    if (state.approvalWaitTimer !== null) {
      clearTimeout(state.approvalWaitTimer);
      state.approvalWaitTimer = null;
    }
    state.approvalWaitRequestId = null;
  }

  #denyApproval(cause: string): void {
    const pending = this.#pendingApproval;
    if (pending === null) {
      return;
    }
    clearTimeout(pending.timer);
    this.#pendingApproval = null;
    this.#audit('approval_denied', { cause, label: pending.label });
    this.#respondError(pending.consumerSocket, pending.consumerRequestId, 'approval_denied');
  }

  #discardApproval(cause: string): void {
    const pending = this.#pendingApproval;
    if (pending === null) {
      return;
    }
    clearTimeout(pending.timer);
    this.#pendingApproval = null;
    this.#audit('approval_discarded', { cause, label: pending.label });
  }

  #handleReaderAccessOpen(
    socket: Socket,
    state: ConnectionState,
    request: PicoVaultDaemonReaderAccessOpenRequest,
  ): void {
    if (this.#lease !== null) {
      this.#respondError(socket, request.requestId, 'reader_access_lease_active');
      return;
    }
    const unlocked = this.#unlockedSessions.get(request.readerKeyFingerprintHex);
    if (unlocked === undefined) {
      // Nothing unlocked is the ADR 0096 "unavailable" path the adapter turns
      // into `undefined`; a key that is simply not the pinned one stays a
      // security signal and throws.
      if (this.#unlockedSessions.size === 0) {
        this.#respondError(socket, request.requestId, 'vault_locked');
        return;
      }
      this.#audit('reader_access_open', {
        outcome: 'error',
        reason: 'reader_access_key_fingerprint_mismatch',
      });
      this.#respondError(socket, request.requestId, 'reader_access_key_fingerprint_mismatch');
      return;
    }
    if (unlocked.keyRole !== 'device_key_agreement') {
      this.#audit('reader_access_open', {
        outcome: 'error',
        reason: 'reader_access_key_role_mismatch',
        keyRole: unlocked.keyRole,
      });
      this.#respondError(socket, request.requestId, 'reader_access_key_role_mismatch');
      return;
    }
    if (unlocked.session.isLocked({ nowMs: this.#wallNowMs() })) {
      this.#lockSession(unlocked.keyFingerprintHex, 'idle_locked');
      this.#respondError(socket, request.requestId, 'vault_locked');
      return;
    }

    const maxDurationMs = Math.min(
      request.maxDurationMs,
      PICO_VAULT_DAEMON_READER_ACCESS_LEASE_CEILING_MS,
    );
    this.#lease = {
      leaseId: Buffer.from(
        this.#sodium.randombytes_buf(PICO_VAULT_DAEMON_LEASE_ID_HEX_CHARS / 2),
      ).toString('hex'),
      connection: socket,
      accessSession: createPicoVaultReaderCustodySyncAccessSession(
        this.#sodium,
        unlocked.session,
      ),
      keyRole: unlocked.keyRole,
      keyFingerprintHex: unlocked.keyFingerprintHex,
      openedAtMonoMs: this.#monotonicNowMs(),
      maxDurationMs,
    };
    this.#grantReaderAccessFrameBudget(socket, state);
    this.#audit('reader_access_open', {
      outcome: 'ok',
      keyRole: unlocked.keyRole,
      keyFingerprintHex: unlocked.keyFingerprintHex,
      maxDurationMs,
    });
    this.#respondOk(socket, request.requestId, {
      leaseId: this.#lease.leaseId,
      keyRole: unlocked.keyRole,
      keyFingerprintHex: unlocked.keyFingerprintHex,
      maxDurationMs,
    });
  }

  #handleReaderAccessOpenPayload(
    socket: Socket,
    request: PicoVaultDaemonReaderAccessOpenPayloadRequest,
  ): void {
    const lease = this.#useLease(socket, request);
    if (lease === null) {
      return;
    }
    try {
      // The wire cannot know these bytes are a valid batch; the Vault library is
      // the authority that verifies the manifest, scope and evidence.
      const payload = lease.accessSession.openPayload({
        batchRecord: request.batchRecord as unknown as PicoReaderCustodySyncBatchRecord,
        evaluatedAt: request.evaluatedAt,
      });
      this.#audit('reader_access_open_payload', { outcome: 'ok' });
      this.#respondOk(
        socket,
        request.requestId,
        { payload: payload as unknown as Record<string, unknown> },
        MAX_PICO_VAULT_DAEMON_READER_ACCESS_FRAME_BYTES,
      );
    } catch (error) {
      const reason = reasonOf(error, 'reader_access_open_payload_failed');
      this.#audit('reader_access_open_payload', { outcome: 'error', reason });
      this.#respondError(socket, request.requestId, reason);
    }
  }

  #handleReaderAccessDecryptItem(
    socket: Socket,
    request: PicoVaultDaemonReaderAccessDecryptItemRequest,
  ): void {
    const lease = this.#useLease(socket, request);
    if (lease === null) {
      return;
    }
    try {
      const plaintext = lease.accessSession.decryptItem({
        domainRecord: request.domainRecord,
        readerGrantRecord: request.readerGrantRecord,
        writerGrantRecord: request.writerGrantRecord,
        rotationRecords: request.rotationRecords,
        itemRecord: request.itemRecord,
      } as unknown as PicoVaultReaderCustodySyncItemEvidence);
      // Plaintext is a crypto result on its way out; it is never audited,
      // logged or retained here (ADR 0098).
      this.#audit('reader_access_decrypt_item', { outcome: 'ok' });
      this.#respondOk(
        socket,
        request.requestId,
        { plaintext },
        MAX_PICO_VAULT_DAEMON_READER_ACCESS_FRAME_BYTES,
      );
    } catch (error) {
      const reason = reasonOf(error, 'reader_access_decrypt_item_failed');
      this.#audit('reader_access_decrypt_item', { outcome: 'error', reason });
      this.#respondError(socket, request.requestId, reason);
    }
  }

  #useLease(
    socket: Socket,
    request: { requestId: string; leaseId: string },
  ): ReaderAccessLease | null {
    const lease = this.#resolveLease(socket, request.leaseId);
    if (lease === null) {
      this.#respondError(socket, request.requestId, 'reader_access_lease_required');
      return null;
    }
    const failure = this.#leaseFailure(lease);
    if (failure !== null) {
      this.#respondError(socket, request.requestId, failure);
      return null;
    }
    return lease;
  }

  #resolveLease(socket: Socket, leaseId: string): ReaderAccessLease | null {
    const lease = this.#lease;
    if (lease === null || lease.leaseId !== leaseId || lease.connection !== socket) {
      return null;
    }
    return lease;
  }

  /**
   * Returns the reason this lease can no longer be used, or null when it is
   * usable. The successful path also pins the Vault key-use instant to the
   * daemon's own clock, so a client-supplied instant can never extend a
   * capability - which is why no instant crosses the wire at all.
   */
  #leaseFailure(lease: ReaderAccessLease): string | null {
    if (this.#monotonicNowMs() - lease.openedAtMonoMs > lease.maxDurationMs) {
      this.#closeLease('lease_expired');
      return 'reader_access_lease_expired';
    }
    if (!this.#unlockedSessions.has(lease.keyFingerprintHex)) {
      this.#closeLease('vault_locked');
      return 'vault_locked';
    }
    if (lease.accessSession.isLocked({ nowMs: this.#wallNowMs() })) {
      this.#lockSession(lease.keyFingerprintHex, 'idle_locked');
      this.#closeLease('vault_locked');
      return 'vault_locked';
    }
    return null;
  }

  #grantReaderAccessFrameBudget(socket: Socket, state: ConnectionState): void {
    const previous = this.#readerAccessConnection;
    if (previous !== null && previous !== socket) {
      this.#connections.get(previous)?.decoder.setMaxFrameBytes(
        MAX_PICO_VAULT_DAEMON_FRAME_BYTES,
      );
    }
    this.#readerAccessConnection = socket;
    state.decoder.setMaxFrameBytes(MAX_PICO_VAULT_DAEMON_READER_ACCESS_FRAME_BYTES);
  }

  #closeLease(cause: string): void {
    const lease = this.#lease;
    if (lease === null) {
      return;
    }
    this.#lease = null;
    this.#audit('reader_access_lease_closed', {
      cause,
      keyFingerprintHex: lease.keyFingerprintHex,
    });
  }

  #handleUnlock(socket: Socket, request: PicoVaultDaemonUnlockRequest): void {
    if (this.#unlockedSessions.has(request.keyFingerprintHex)) {
      this.#respondError(socket, request.requestId, 'already_unlocked');
      return;
    }
    if (this.#unlockedSessions.size >= MAX_UNLOCKED_SESSIONS) {
      this.#respondError(socket, request.requestId, 'too_many_unlocked_sessions');
      return;
    }
    if (this.#isUnlockThrottled()) {
      this.#audit('unlock', { outcome: 'error', reason: 'unlock_throttled', keyRole: request.keyRole });
      this.#respondError(socket, request.requestId, 'unlock_throttled');
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
    this.#unlockedSessions.set(metadata.keyFingerprintHex, {
      session,
      holdSocket: socket,
      keyRole: metadata.keyRole,
      keyFingerprintHex: metadata.keyFingerprintHex,
      publicKeyHex: metadata.publicKeyHex,
      openedAtWallMs: wallMs,
      openedAtMonoMs: this.#monotonicNowMs(),
    });
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

    const lease = this.#lease;
    if (lease !== null && monoMs - lease.openedAtMonoMs > lease.maxDurationMs) {
      this.#closeLease('lease_expired');
    }

    if (rolledBack) {
      this.#lockAllSessions('clock_rollback');
      return;
    }
    if (suspended) {
      this.#lockAllSessions('suspend_detected');
      return;
    }
    // Idle and duration are per session: each was opened at its own instant
    // by its own act, so each expires on its own schedule.
    for (const [keyFingerprintHex, unlocked] of [...this.#unlockedSessions]) {
      if (
        monoMs - unlocked.openedAtMonoMs > this.#maxUnlockDurationMs
        || wallMs - unlocked.openedAtWallMs > this.#maxUnlockDurationMs
      ) {
        this.#lockSession(keyFingerprintHex, 'unlock_expired');
        continue;
      }
      if (unlocked.session.isLocked({ nowMs: wallMs })) {
        this.#lockSession(keyFingerprintHex, 'idle_locked');
      }
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

  /** Locks every session at once, for causes that are properties of the
   * machine rather than of one key: suspend, clock rollback, shutdown. */
  #lockAllSessions(cause: string): void {
    for (const keyFingerprintHex of [...this.#unlockedSessions.keys()]) {
      this.#lockSession(keyFingerprintHex, cause);
    }
  }

  #lockSession(keyFingerprintHex: string, cause: string): void {
    const unlocked = this.#unlockedSessions.get(keyFingerprintHex);
    if (unlocked === undefined) {
      return;
    }
    this.#unlockedSessions.delete(keyFingerprintHex);
    if (this.#pendingApproval?.signerKeyFingerprintHex === keyFingerprintHex) {
      this.#denyApproval(cause);
    }
    if (this.#lease?.keyFingerprintHex === keyFingerprintHex) {
      this.#closeLease(cause);
    }
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

  #respondOk(
    socket: Socket,
    requestId: string,
    result: Record<string, unknown>,
    maxFrameBytes: number = MAX_PICO_VAULT_DAEMON_FRAME_BYTES,
  ): void {
    this.#clearInFlight(socket);
    let frame: Buffer;
    try {
      frame = encodePicoVaultDaemonFrame({
        family: picoVaultDaemonResponseFamily,
        requestId,
        ok: true,
        result,
      }, maxFrameBytes);
    } catch (error) {
      this.#respondError(socket, requestId, reasonOf(error, 'frame_too_large'));
      return;
    }
    socket.write(frame);
  }

  #respondError(socket: Socket, requestId: string, reason: string): void {
    this.#clearInFlight(socket);
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

  #clearInFlight(socket: Socket): void {
    const state = this.#connections.get(socket);
    if (state !== undefined) {
      state.inFlight = false;
    }
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

/**
 * Reads the versioned family label an ADR 0079 I3 signature input starts with:
 * `U32BE(len) || bytes`. Used to classify a request for ADR 0099 gating before
 * the Vault is asked to sign anything.
 */
function firstCanonicalElementAscii(input: Uint8Array): string {
  if (input.byteLength < 4) {
    throw new Error('unknown_signature_input_label');
  }
  const length = new DataView(input.buffer, input.byteOffset, input.byteLength).getUint32(0, false);
  if (length === 0 || length > 128 || input.byteLength < 4 + length) {
    throw new Error('unknown_signature_input_label');
  }
  const label = Buffer.from(input.subarray(4, 4 + length)).toString('latin1');
  if (!/^[\x21-\x7e]+$/.test(label)) {
    throw new Error('unknown_signature_input_label');
  }
  return label;
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
