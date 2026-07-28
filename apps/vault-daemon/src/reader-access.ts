import { MessageChannel, Worker, receiveMessageOnPort, type MessagePort } from 'node:worker_threads';
import type {
  PicoReaderCustodySyncBatchRecord,
  PicoReaderCustodySyncPayload,
  PicoVaultPersonKeyRole,
} from '@pico/protocol';
import type { PicoVaultReaderCustodySyncItemEvidence } from '@pico/vault';
import {
  encodePicoVaultDaemonFrame,
  parsePicoVaultDaemonResponse,
  picoVaultDaemonProtocolVersion,
  picoVaultDaemonRequestFamilies,
  MAX_PICO_VAULT_DAEMON_FRAME_BYTES,
  MAX_PICO_VAULT_DAEMON_READER_ACCESS_FRAME_BYTES,
} from './protocol.js';

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * The worker owns the socket so the calling thread can block on the result.
 * It is deliberately dumb: it never parses, validates or interprets a payload.
 * Framing is the only thing it understands, so the wire contract stays defined
 * in exactly one place (`protocol.ts`) and cannot drift into a second decoder.
 */
const workerSource = `
'use strict';
const { createConnection } = require('node:net');
const { workerData } = require('node:worker_threads');
const port = workerData.port;
const signal = new Int32Array(workerData.signalBuffer);
let buffered = Buffer.alloc(0);
let awaiting = false;
let maxResponseBytes = ${MAX_PICO_VAULT_DAEMON_FRAME_BYTES};
let failure = null;

function reply(message) {
  if (!awaiting) {
    return;
  }
  awaiting = false;
  port.postMessage(message);
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
}

function fail(reason) {
  failure = failure ?? reason;
  reply({ error: failure });
}

const socket = createConnection(workerData.socketPath);
socket.on('error', () => {
  fail('daemon_connection_failed');
});
socket.on('close', () => {
  fail('daemon_connection_closed');
});
socket.on('data', (chunk) => {
  buffered = buffered.byteLength === 0 ? chunk : Buffer.concat([buffered, chunk]);
  if (buffered.byteLength < 4) {
    return;
  }
  const bodyLength = buffered.readUInt32BE(0);
  if (bodyLength === 0 || bodyLength > maxResponseBytes) {
    fail('frame_too_large');
    socket.destroy();
    return;
  }
  if (buffered.byteLength < 4 + bodyLength) {
    return;
  }
  const frame = Uint8Array.prototype.slice.call(buffered, 4, 4 + bodyLength);
  buffered = Buffer.from(buffered.subarray(4 + bodyLength));
  reply({ frame });
});

port.on('message', (message) => {
  if (message.close === true) {
    socket.destroy();
    port.close();
    return;
  }
  awaiting = true;
  maxResponseBytes = message.maxResponseBytes;
  if (failure !== null) {
    reply({ error: failure });
    return;
  }
  socket.write(Buffer.from(message.frame));
});
`;

export interface PicoVaultDaemonSyncTransportOptions {
  socketPath: string;
  requestTimeoutMs?: number;
}

/**
 * Blocking request/response over the ADR 0097 socket. Every call returns before
 * the calling thread runs another turn of its event loop, which is what lets an
 * ADR 0096 access run keep its synchronous, non-interleaved contract.
 */
export interface PicoVaultDaemonSyncTransport {
  request(
    payload: Record<string, unknown>,
    options?: { maxFrameBytes?: number },
  ): Record<string, unknown>;
  close(): void;
}

export function connectPicoVaultDaemonSyncTransport(
  options: PicoVaultDaemonSyncTransportOptions,
): PicoVaultDaemonSyncTransport {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1) {
    throw new Error('invalid_request_timeout_ms');
  }

  const signalBuffer = new SharedArrayBuffer(4);
  const signal = new Int32Array(signalBuffer);
  const channel = new MessageChannel();
  const worker = new Worker(workerSource, {
    eval: true,
    workerData: { port: channel.port2, signalBuffer, socketPath: options.socketPath },
    transferList: [channel.port2],
  });
  worker.unref();

  let closed = false;
  let requestCounter = 0;
  const port: MessagePort = channel.port1;

  const transport: PicoVaultDaemonSyncTransport = {
    request: (payload, requestOptions = {}) => {
      if (closed) {
        throw new Error('daemon_connection_closed');
      }
      const maxFrameBytes = requestOptions.maxFrameBytes ?? MAX_PICO_VAULT_DAEMON_FRAME_BYTES;
      requestCounter += 1;
      const requestId = `r${requestCounter}`;
      const frame = encodePicoVaultDaemonFrame({ requestId, ...payload }, maxFrameBytes);

      Atomics.store(signal, 0, 0);
      port.postMessage({
        frame: new Uint8Array(frame),
        maxResponseBytes: maxFrameBytes,
      });
      if (Atomics.wait(signal, 0, 0, requestTimeoutMs) === 'timed-out') {
        throw new Error('daemon_request_timeout');
      }

      const received = receiveMessageOnPort(port);
      if (received === undefined) {
        throw new Error('daemon_response_missing');
      }
      const message = received.message as { frame?: Uint8Array; error?: string };
      if (typeof message.error === 'string') {
        throw new Error(message.error);
      }
      if (!(message.frame instanceof Uint8Array)) {
        throw new Error('invalid_response');
      }
      const response = parsePicoVaultDaemonResponse(Buffer.from(message.frame));
      if (response.requestId !== requestId) {
        throw new Error('invalid_response');
      }
      if (!response.ok) {
        throw new Error(response.reason);
      }
      return response.result;
    },
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      port.postMessage({ close: true });
      port.close();
      void worker.terminate();
    },
  };

  transport.request({
    family: picoVaultDaemonRequestFamilies.hello,
    protocolVersion: picoVaultDaemonProtocolVersion,
  });
  return transport;
}

/**
 * Structurally implements the narrow @pico/sync access-session capability
 * without making the daemon package depend on Sync, exactly as `@pico/vault`
 * does for the in-process composition.
 */
export interface PicoVaultDaemonReaderAccessSession {
  metadata(): { keyRole: PicoVaultPersonKeyRole; keyFingerprintHex: string };
  isLocked(options: { nowMs: number }): boolean;
  lock(): void;
  openPayload(input: {
    batchRecord: PicoReaderCustodySyncBatchRecord;
    evaluatedAt: string;
  }): PicoReaderCustodySyncPayload;
  decryptItem(evidence: PicoVaultReaderCustodySyncItemEvidence): string;
}

export interface OpenPicoVaultDaemonReaderAccessInput {
  readerKeyFingerprintHex: string;
  maxDurationMs: number;
}

/**
 * Opens one ADR 0098 lease. Returns undefined when no matching unlocked
 * session exists, which is the ADR 0096 sanctioned "unavailable" path; every
 * other refusal throws, because a wrong role or fingerprint is a security
 * signal that must not be flattened into "not available right now".
 */
export function openPicoVaultDaemonReaderAccessSession(
  transport: PicoVaultDaemonSyncTransport,
  input: OpenPicoVaultDaemonReaderAccessInput,
): PicoVaultDaemonReaderAccessSession | undefined {
  let opened: Record<string, unknown>;
  try {
    opened = transport.request({
      family: picoVaultDaemonRequestFamilies.readerAccessOpen,
      readerKeyFingerprintHex: input.readerKeyFingerprintHex,
      maxDurationMs: input.maxDurationMs,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'vault_locked') {
      return undefined;
    }
    throw error;
  }

  const leaseId = opened.leaseId;
  const keyRole = opened.keyRole;
  const keyFingerprintHex = opened.keyFingerprintHex;
  if (
    typeof leaseId !== 'string'
    || typeof keyRole !== 'string'
    || typeof keyFingerprintHex !== 'string'
  ) {
    throw new Error('invalid_response');
  }

  const leased = (
    payload: Record<string, unknown>,
    maxFrameBytes: number,
  ): Record<string, unknown> => transport.request(
    { ...payload, leaseId },
    { maxFrameBytes },
  );

  return {
    metadata: () => ({
      keyRole: keyRole as PicoVaultPersonKeyRole,
      keyFingerprintHex,
    }),
    isLocked: () => {
      // The daemon answers from its own clock on purpose: a client-supplied
      // instant must never be able to extend a capability, so none is sent.
      const result = leased(
        { family: picoVaultDaemonRequestFamilies.readerAccessIsLocked },
        MAX_PICO_VAULT_DAEMON_FRAME_BYTES,
      );
      if (typeof result.locked !== 'boolean') {
        throw new Error('invalid_response');
      }
      return result.locked;
    },
    lock: () => {
      // A transport failure here propagates rather than claiming closure. The
      // lease is in fact already gone daemon-side when the connection dropped,
      // but ADR 0096 requires verified closure, not inferred closure.
      leased(
        { family: picoVaultDaemonRequestFamilies.readerAccessClose },
        MAX_PICO_VAULT_DAEMON_FRAME_BYTES,
      );
    },
    openPayload: (openInput) => {
      const result = leased({
        family: picoVaultDaemonRequestFamilies.readerAccessOpenPayload,
        batchRecord: openInput.batchRecord as unknown as Record<string, unknown>,
        evaluatedAt: openInput.evaluatedAt,
      }, MAX_PICO_VAULT_DAEMON_READER_ACCESS_FRAME_BYTES);
      const payload = result.payload;
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        throw new Error('invalid_response');
      }
      return payload as unknown as PicoReaderCustodySyncPayload;
    },
    decryptItem: (evidence) => {
      // Only the five records the Vault decryptor consumes cross the boundary;
      // the ADR 0093 receipt and lifecycle sets stay on the consumer side.
      const result = leased({
        family: picoVaultDaemonRequestFamilies.readerAccessDecryptItem,
        domainRecord: evidence.domainRecord as unknown as Record<string, unknown>,
        readerGrantRecord: evidence.readerGrantRecord as unknown as Record<string, unknown>,
        writerGrantRecord: evidence.writerGrantRecord as unknown as Record<string, unknown>,
        rotationRecords: evidence.rotationRecords as unknown as Record<string, unknown>[],
        itemRecord: evidence.itemRecord as unknown as Record<string, unknown>,
      }, MAX_PICO_VAULT_DAEMON_READER_ACCESS_FRAME_BYTES);
      if (typeof result.plaintext !== 'string') {
        throw new Error('invalid_response');
      }
      return result.plaintext;
    },
  };
}

export interface PicoVaultDaemonReaderAccessUnlockInput {
  readerKeyFingerprintHex: string;
  openedAtMs: number;
  maxDurationMs: number;
}

/**
 * Matches the ADR 0096 unlock-port shape so a consumer composition can hand it
 * straight to `PicoReaderCustodySyncAccessSession`.
 */
export function createPicoVaultDaemonReaderAccessUnlockPort(
  transport: PicoVaultDaemonSyncTransport,
): (
  input: Readonly<PicoVaultDaemonReaderAccessUnlockInput>,
) => PicoVaultDaemonReaderAccessSession | undefined {
  return (input) => openPicoVaultDaemonReaderAccessSession(transport, {
    readerKeyFingerprintHex: input.readerKeyFingerprintHex,
    maxDurationMs: input.maxDurationMs,
  });
}
