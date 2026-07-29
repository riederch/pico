import { createConnection, type Socket } from 'node:net';
import type { PicoVaultPersonKeyRole } from '@pico/protocol';
import {
  encodePicoVaultDaemonFrame,
  parsePicoVaultDaemonResponse,
  picoVaultDaemonProtocolVersion,
  picoVaultDaemonRequestFamilies,
  PicoVaultDaemonFrameDecoder,
  type PicoVaultDaemonApprovalDecideResult,
  type PicoVaultDaemonApprovalWaitResult,
  type PicoVaultDaemonCeremonyCreateDomainRequest,
  type PicoVaultDaemonCeremonyCreateDomainResult,
  type PicoVaultDaemonCeremonyCreateReaderGrantRequest,
  type PicoVaultDaemonCeremonyCreateReaderGrantResult,
  type PicoVaultDaemonCeremonyRotateDomainRequest,
  type PicoVaultDaemonCeremonyRotateDomainResult,
  type PicoVaultDaemonHelloResult,
  type PicoVaultDaemonLockResult,
  type PicoVaultDaemonSignResult,
  type PicoVaultDaemonStatusResult,
  type PicoVaultDaemonUnlockResult,
} from './protocol.js';

export interface PicoVaultDaemonClient {
  hello(): Promise<PicoVaultDaemonHelloResult>;
  status(): Promise<PicoVaultDaemonStatusResult>;
  unlock(input: {
    keyRole: PicoVaultPersonKeyRole;
    keyFingerprintHex: string;
    passphrase: string;
  }): Promise<PicoVaultDaemonUnlockResult>;
  lock(): Promise<PicoVaultDaemonLockResult>;
  sign(input: {
    keyFingerprintHex: string;
    label: string;
    fields: Record<string, unknown>;
  }): Promise<PicoVaultDaemonSignResult>;
  approvalWait(): Promise<PicoVaultDaemonApprovalWaitResult>;
  approvalDecide(input: {
    approvalId: string;
    signatureInputDigestHex: string;
    approved: boolean;
  }): Promise<PicoVaultDaemonApprovalDecideResult>;
  ceremonyCreateDomain(
    input: Omit<PicoVaultDaemonCeremonyCreateDomainRequest, 'family' | 'requestId'>,
  ): Promise<PicoVaultDaemonCeremonyCreateDomainResult>;
  ceremonyRotateDomain(
    input: Omit<PicoVaultDaemonCeremonyRotateDomainRequest, 'family' | 'requestId'>,
  ): Promise<PicoVaultDaemonCeremonyRotateDomainResult>;
  ceremonyCreateReaderGrant(
    input: Omit<PicoVaultDaemonCeremonyCreateReaderGrantRequest, 'family' | 'requestId'>,
  ): Promise<PicoVaultDaemonCeremonyCreateReaderGrantResult>;
  close(): Promise<void>;
}

interface PendingRequest {
  requestId: string;
  resolve: (result: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

export async function connectPicoVaultDaemonClient(
  input: { socketPath: string },
): Promise<PicoVaultDaemonClient> {
  const socket = await new Promise<Socket>((resolvePromise, rejectPromise) => {
    const connection = createConnection(input.socketPath);
    connection.once('connect', () => {
      connection.off('error', rejectPromise);
      resolvePromise(connection);
    });
    connection.once('error', rejectPromise);
  });

  const decoder = new PicoVaultDaemonFrameDecoder();
  let pending: PendingRequest | null = null;
  let requestCounter = 0;
  let closed = false;

  const failPending = (reason: string): void => {
    const current = pending;
    pending = null;
    current?.reject(new Error(reason));
  };

  socket.on('data', (chunk) => {
    let frames: Buffer[];
    try {
      frames = decoder.feed(chunk);
    } catch {
      failPending('invalid_response');
      socket.destroy();
      return;
    }
    for (const frame of frames) {
      const current = pending;
      if (current === null) {
        socket.destroy();
        return;
      }
      try {
        const response = parsePicoVaultDaemonResponse(frame);
        if (response.requestId !== current.requestId && response.requestId !== '') {
          throw new Error('invalid_response');
        }
        pending = null;
        if (response.ok) {
          current.resolve(response.result);
        } else {
          current.reject(new Error(response.reason));
        }
      } catch (error) {
        pending = null;
        current.reject(error instanceof Error ? error : new Error('invalid_response'));
        socket.destroy();
      }
    }
  });
  socket.on('error', () => {
    failPending('daemon_connection_closed');
  });
  socket.on('close', () => {
    closed = true;
    failPending('daemon_connection_closed');
  });

  const request = (payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    if (closed) {
      return Promise.reject(new Error('daemon_connection_closed'));
    }
    if (pending !== null) {
      return Promise.reject(new Error('client_request_in_flight'));
    }
    requestCounter += 1;
    const requestId = `r${requestCounter}`;
    return new Promise<Record<string, unknown>>((resolvePromise, rejectPromise) => {
      pending = { requestId, resolve: resolvePromise, reject: rejectPromise };
      socket.write(encodePicoVaultDaemonFrame({ requestId, ...payload }));
    });
  };

  return {
    hello: async () => await request({
      family: picoVaultDaemonRequestFamilies.hello,
      protocolVersion: picoVaultDaemonProtocolVersion,
    }) as unknown as PicoVaultDaemonHelloResult,
    status: async () => await request({
      family: picoVaultDaemonRequestFamilies.status,
    }) as unknown as PicoVaultDaemonStatusResult,
    unlock: async (unlockInput) => await request({
      family: picoVaultDaemonRequestFamilies.unlock,
      keyRole: unlockInput.keyRole,
      keyFingerprintHex: unlockInput.keyFingerprintHex,
      passphrase: unlockInput.passphrase,
    }) as unknown as PicoVaultDaemonUnlockResult,
    lock: async () => await request({
      family: picoVaultDaemonRequestFamilies.lock,
    }) as unknown as PicoVaultDaemonLockResult,
    sign: async (signInput) => await request({
      family: picoVaultDaemonRequestFamilies.sign,
      keyFingerprintHex: signInput.keyFingerprintHex,
      label: signInput.label,
      fields: signInput.fields,
    }) as unknown as PicoVaultDaemonSignResult,
    approvalWait: async () => await request({
      family: picoVaultDaemonRequestFamilies.approvalWait,
    }) as unknown as PicoVaultDaemonApprovalWaitResult,
    approvalDecide: async (decideInput) => await request({
      family: picoVaultDaemonRequestFamilies.approvalDecide,
      approvalId: decideInput.approvalId,
      signatureInputDigestHex: decideInput.signatureInputDigestHex,
      approved: decideInput.approved,
    }) as unknown as PicoVaultDaemonApprovalDecideResult,
    ceremonyCreateDomain: async (ceremonyInput) => await request({
      family: picoVaultDaemonRequestFamilies.ceremonyCreateDomain,
      ...ceremonyInput,
    }) as unknown as PicoVaultDaemonCeremonyCreateDomainResult,
    ceremonyRotateDomain: async (ceremonyInput) => await request({
      family: picoVaultDaemonRequestFamilies.ceremonyRotateDomain,
      ...ceremonyInput,
    }) as unknown as PicoVaultDaemonCeremonyRotateDomainResult,
    ceremonyCreateReaderGrant: async (ceremonyInput) => await request({
      family: picoVaultDaemonRequestFamilies.ceremonyCreateReaderGrant,
      ...ceremonyInput,
    }) as unknown as PicoVaultDaemonCeremonyCreateReaderGrantResult,
    close: async () => {
      if (closed) {
        return;
      }
      await new Promise<void>((resolvePromise) => {
        socket.once('close', () => {
          resolvePromise();
        });
        socket.end();
        socket.destroySoon();
      });
    },
  };
}
