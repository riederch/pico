import { picoIdentitySuite } from '@pico/protocol';
import type { PicoVaultDetachedSigner, PicoVaultSessionMetadata } from '@pico/vault';
import {
  picoVaultDaemonRequestFamilies,
  PICO_VAULT_DAEMON_APPROVAL_WINDOW_MS,
} from './protocol.js';
import {
  connectPicoVaultDaemonSyncTransport,
  type PicoVaultDaemonSyncTransport,
} from './reader-access.js';

const DEFAULT_CEREMONY_SIGN_TIMEOUT_MS = 90_000;

const ceremonySignerKeyRoles = ['pico_identity', 'device_signing'] as const;
type PicoVaultDaemonCeremonySignerKeyRole = typeof ceremonySignerKeyRoles[number];

export interface CreatePicoVaultDaemonCeremonySignerInput {
  socketPath: string;
  keyRole: PicoVaultDaemonCeremonySignerKeyRole;
  keyFingerprintHex: string;
  /**
   * Per-signature timeout. Gated signatures park until the person decides, so
   * this is floored above the ADR 0099 approval window - a misconfigured
   * consumer must not be able to convert "the person is deciding" into a
   * transport error.
   */
  requestTimeoutMs?: number;
}

/**
 * ADR 0100: the `PicoVaultDetachedSigner` a ceremony consumer holds instead of
 * a `PicoVaultSession`. Every `sign` is one blocking daemon roundtrip through
 * the ADR 0099 approval gate; the private key never enters this process.
 */
export interface PicoVaultDaemonCeremonySigner extends PicoVaultDetachedSigner {
  close(): void;
}

export function createPicoVaultDaemonCeremonySigner(
  input: CreatePicoVaultDaemonCeremonySignerInput,
): PicoVaultDaemonCeremonySigner {
  if (!(ceremonySignerKeyRoles as readonly string[]).includes(input.keyRole)) {
    throw new Error('ceremony_signer_key_role_not_signable');
  }
  const requestTimeoutMs = input.requestTimeoutMs ?? DEFAULT_CEREMONY_SIGN_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(requestTimeoutMs)
    || requestTimeoutMs <= PICO_VAULT_DAEMON_APPROVAL_WINDOW_MS
  ) {
    throw new Error('invalid_ceremony_signer_timeout_ms');
  }

  const transport: PicoVaultDaemonSyncTransport = connectPicoVaultDaemonSyncTransport({
    socketPath: input.socketPath,
    requestTimeoutMs,
  });

  let metadata: PicoVaultSessionMetadata;
  try {
    const status = transport.request({ family: picoVaultDaemonRequestFamilies.status });
    const sessions = status.sessions;
    if (!Array.isArray(sessions) || sessions.length === 0) {
      throw new Error('vault_locked');
    }
    // ADR 0102: select by fingerprint rather than accepting whichever session
    // happens to be open, so a signer never silently binds to another key.
    const descriptor = (sessions as Record<string, unknown>[]).find(
      (candidate) => candidate.keyFingerprintHex === input.keyFingerprintHex,
    );
    if (descriptor === undefined || descriptor.keyRole !== input.keyRole) {
      throw new Error('ceremony_signer_key_mismatch');
    }
    const publicKeyHex = descriptor.publicKeyHex;
    if (typeof publicKeyHex !== 'string' || publicKeyHex.length === 0) {
      throw new Error('invalid_response');
    }
    metadata = {
      suite: picoIdentitySuite,
      keyRole: input.keyRole,
      publicKeyHex,
      keyFingerprintHex: input.keyFingerprintHex,
    };
  } catch (error) {
    transport.close();
    throw error;
  }

  return {
    metadata: () => ({ ...metadata }),
    sign: (signatureInput) => {
      const result = transport.request({
        family: picoVaultDaemonRequestFamilies.sign,
        keyFingerprintHex: metadata.keyFingerprintHex,
        signatureInputHex: Buffer.from(signatureInput).toString('hex'),
      });
      // The echoed identity is rechecked per response: a signer created for
      // one key must never silently continue against another session.
      if (
        result.keyRole !== metadata.keyRole
        || result.keyFingerprintHex !== metadata.keyFingerprintHex
        || typeof result.signatureHex !== 'string'
      ) {
        throw new Error('ceremony_signer_key_mismatch');
      }
      return Uint8Array.from(Buffer.from(result.signatureHex, 'hex'));
    },
    close: () => {
      transport.close();
    },
  };
}
