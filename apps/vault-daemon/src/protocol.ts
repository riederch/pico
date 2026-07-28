import { picoVaultPersonKeyRoles, type PicoVaultPersonKeyRole } from '@pico/protocol';

/**
 * ADR 0097 local wire contract. This is a private contract between the Vault
 * daemon and same-person local clients: no docs/protocol surface, no fixtures,
 * no compatibility claim. Frames are U32BE(length) || UTF-8 JSON; every request
 * carries a versioned family label and every response echoes the request id.
 */
export const picoVaultDaemonProtocolVersion = 1 as const;

export const picoVaultDaemonRequestFamilies = {
  hello: 'pico.vault.daemon.hello.v1',
  status: 'pico.vault.daemon.status.v1',
  unlock: 'pico.vault.daemon.unlock.v1',
  lock: 'pico.vault.daemon.lock.v1',
  sign: 'pico.vault.daemon.sign.v1',
} as const;

export const picoVaultDaemonResponseFamily = 'pico.vault.daemon.response.v1' as const;

export const MAX_PICO_VAULT_DAEMON_FRAME_BYTES = 128 * 1024;
export const MAX_PICO_VAULT_DAEMON_SIGNATURE_INPUT_HEX_CHARS = 64 * 1024;
export const MAX_PICO_VAULT_DAEMON_PASSPHRASE_CHARS = 1024;
export const MAX_PICO_VAULT_DAEMON_REQUEST_ID_CHARS = 64;

const FRAME_LENGTH_PREFIX_BYTES = 4;
const requestIdPattern = /^[A-Za-z0-9_-]+$/;
const lowercaseHexPattern = /^(?:[0-9a-f]{2})+$/;
const KEY_FINGERPRINT_HEX_CHARS = 64;

export interface PicoVaultDaemonHelloRequest {
  family: typeof picoVaultDaemonRequestFamilies.hello;
  requestId: string;
  protocolVersion: number;
}

export interface PicoVaultDaemonStatusRequest {
  family: typeof picoVaultDaemonRequestFamilies.status;
  requestId: string;
}

export interface PicoVaultDaemonUnlockRequest {
  family: typeof picoVaultDaemonRequestFamilies.unlock;
  requestId: string;
  keyRole: PicoVaultPersonKeyRole;
  keyFingerprintHex: string;
  passphrase: string;
}

export interface PicoVaultDaemonLockRequest {
  family: typeof picoVaultDaemonRequestFamilies.lock;
  requestId: string;
}

export interface PicoVaultDaemonSignRequest {
  family: typeof picoVaultDaemonRequestFamilies.sign;
  requestId: string;
  signatureInputHex: string;
}

export type PicoVaultDaemonRequest =
  | PicoVaultDaemonHelloRequest
  | PicoVaultDaemonStatusRequest
  | PicoVaultDaemonUnlockRequest
  | PicoVaultDaemonLockRequest
  | PicoVaultDaemonSignRequest;

export interface PicoVaultDaemonKeyfileDescriptor {
  keyRole: PicoVaultPersonKeyRole;
  keyFingerprintHex: string;
}

export interface PicoVaultDaemonHelloResult {
  protocolVersion: typeof picoVaultDaemonProtocolVersion;
  daemonVersion: string;
  locked: boolean;
}

export interface PicoVaultDaemonStatusResult {
  locked: boolean;
  session: PicoVaultDaemonKeyfileDescriptor | null;
  keyfiles: PicoVaultDaemonKeyfileDescriptor[];
}

export interface PicoVaultDaemonUnlockResult {
  keyRole: PicoVaultPersonKeyRole;
  keyFingerprintHex: string;
  publicKeyHex: string;
  idleLockMs: number;
  maxUnlockDurationMs: number;
}

export interface PicoVaultDaemonLockResult {
  locked: true;
}

export interface PicoVaultDaemonSignResult {
  signatureHex: string;
  keyRole: PicoVaultPersonKeyRole;
  keyFingerprintHex: string;
}

export interface PicoVaultDaemonOkResponse {
  family: typeof picoVaultDaemonResponseFamily;
  requestId: string;
  ok: true;
  result: Record<string, unknown>;
}

export interface PicoVaultDaemonErrorResponse {
  family: typeof picoVaultDaemonResponseFamily;
  requestId: string;
  ok: false;
  reason: string;
}

export type PicoVaultDaemonResponse = PicoVaultDaemonOkResponse | PicoVaultDaemonErrorResponse;

export function encodePicoVaultDaemonFrame(payload: Record<string, unknown>): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  if (body.byteLength > MAX_PICO_VAULT_DAEMON_FRAME_BYTES) {
    throw new Error('frame_too_large');
  }
  const frame = Buffer.allocUnsafe(FRAME_LENGTH_PREFIX_BYTES + body.byteLength);
  frame.writeUInt32BE(body.byteLength, 0);
  body.copy(frame, FRAME_LENGTH_PREFIX_BYTES);
  return frame;
}

/**
 * Incremental frame decoder. The declared length is checked against the frame
 * cap before any body bytes are buffered, so an oversized declaration fails
 * immediately instead of allocating.
 */
export class PicoVaultDaemonFrameDecoder {
  #buffered: Buffer = Buffer.alloc(0);

  public feed(chunk: Buffer): Buffer[] {
    this.#buffered = this.#buffered.byteLength === 0 ? chunk : Buffer.concat([this.#buffered, chunk]);
    const frames: Buffer[] = [];

    for (;;) {
      if (this.#buffered.byteLength < FRAME_LENGTH_PREFIX_BYTES) {
        return frames;
      }
      const bodyLength = this.#buffered.readUInt32BE(0);
      if (bodyLength === 0 || bodyLength > MAX_PICO_VAULT_DAEMON_FRAME_BYTES) {
        throw new Error('frame_too_large');
      }
      if (this.#buffered.byteLength < FRAME_LENGTH_PREFIX_BYTES + bodyLength) {
        return frames;
      }
      frames.push(this.#buffered.subarray(FRAME_LENGTH_PREFIX_BYTES, FRAME_LENGTH_PREFIX_BYTES + bodyLength));
      this.#buffered = Buffer.from(this.#buffered.subarray(FRAME_LENGTH_PREFIX_BYTES + bodyLength));
    }
  }
}

export function parsePicoVaultDaemonRequest(frame: Buffer): PicoVaultDaemonRequest {
  const parsed = parseJsonRecord(frame);
  const requestId = parseRequestId(parsed);
  const family = parsed.family;
  if (typeof family !== 'string') {
    throw new Error('invalid_request');
  }

  switch (family) {
    case picoVaultDaemonRequestFamilies.hello: {
      assertExactKeys(parsed, ['family', 'requestId', 'protocolVersion']);
      const protocolVersion = parsed.protocolVersion;
      if (!Number.isSafeInteger(protocolVersion) || (protocolVersion as number) < 1) {
        throw new Error('invalid_request');
      }
      return {
        family: picoVaultDaemonRequestFamilies.hello,
        requestId,
        protocolVersion: protocolVersion as number,
      };
    }
    case picoVaultDaemonRequestFamilies.status: {
      assertExactKeys(parsed, ['family', 'requestId']);
      return { family: picoVaultDaemonRequestFamilies.status, requestId };
    }
    case picoVaultDaemonRequestFamilies.lock: {
      assertExactKeys(parsed, ['family', 'requestId']);
      return { family: picoVaultDaemonRequestFamilies.lock, requestId };
    }
    case picoVaultDaemonRequestFamilies.unlock: {
      assertExactKeys(parsed, ['family', 'requestId', 'keyRole', 'keyFingerprintHex', 'passphrase']);
      const keyRole = parsed.keyRole;
      if (typeof keyRole !== 'string' || !(picoVaultPersonKeyRoles as readonly string[]).includes(keyRole)) {
        throw new Error('invalid_request');
      }
      const keyFingerprintHex = parsed.keyFingerprintHex;
      if (
        typeof keyFingerprintHex !== 'string'
        || keyFingerprintHex.length !== KEY_FINGERPRINT_HEX_CHARS
        || !lowercaseHexPattern.test(keyFingerprintHex)
      ) {
        throw new Error('invalid_request');
      }
      const passphrase = parsed.passphrase;
      if (
        typeof passphrase !== 'string'
        || passphrase.length === 0
        || passphrase.length > MAX_PICO_VAULT_DAEMON_PASSPHRASE_CHARS
      ) {
        throw new Error('invalid_request');
      }
      return {
        family: picoVaultDaemonRequestFamilies.unlock,
        requestId,
        keyRole: keyRole as PicoVaultPersonKeyRole,
        keyFingerprintHex,
        passphrase,
      };
    }
    case picoVaultDaemonRequestFamilies.sign: {
      assertExactKeys(parsed, ['family', 'requestId', 'signatureInputHex']);
      const signatureInputHex = parsed.signatureInputHex;
      if (
        typeof signatureInputHex !== 'string'
        || signatureInputHex.length === 0
        || signatureInputHex.length > MAX_PICO_VAULT_DAEMON_SIGNATURE_INPUT_HEX_CHARS
        || !lowercaseHexPattern.test(signatureInputHex)
      ) {
        throw new Error('invalid_request');
      }
      return { family: picoVaultDaemonRequestFamilies.sign, requestId, signatureInputHex };
    }
    default:
      throw new Error('unknown_request_family');
  }
}

export function parsePicoVaultDaemonResponse(frame: Buffer): PicoVaultDaemonResponse {
  const parsed = parseJsonRecord(frame);
  if (parsed.family !== picoVaultDaemonResponseFamily) {
    throw new Error('invalid_response');
  }
  const requestId = parsed.requestId;
  if (typeof requestId !== 'string') {
    throw new Error('invalid_response');
  }
  if (parsed.ok === true) {
    assertExactKeys(parsed, ['family', 'requestId', 'ok', 'result']);
    const result = parsed.result;
    if (!isRecord(result)) {
      throw new Error('invalid_response');
    }
    return { family: picoVaultDaemonResponseFamily, requestId, ok: true, result };
  }
  if (parsed.ok === false) {
    assertExactKeys(parsed, ['family', 'requestId', 'ok', 'reason']);
    const reason = parsed.reason;
    if (typeof reason !== 'string' || reason.length === 0) {
      throw new Error('invalid_response');
    }
    return { family: picoVaultDaemonResponseFamily, requestId, ok: false, reason };
  }
  throw new Error('invalid_response');
}

function parseJsonRecord(frame: Buffer): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(frame.toString('utf8'));
  } catch {
    throw new Error('malformed_frame');
  }
  if (!isRecord(parsed)) {
    throw new Error('malformed_frame');
  }
  return parsed;
}

function parseRequestId(parsed: Record<string, unknown>): string {
  const requestId = parsed.requestId;
  if (
    typeof requestId !== 'string'
    || requestId.length === 0
    || requestId.length > MAX_PICO_VAULT_DAEMON_REQUEST_ID_CHARS
    || !requestIdPattern.test(requestId)
  ) {
    throw new Error('invalid_request');
  }
  return requestId;
}

function assertExactKeys(record: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || !keys.every((key) => Object.hasOwn(record, key))) {
    throw new Error('invalid_request');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
