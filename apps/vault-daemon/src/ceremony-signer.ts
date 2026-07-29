import { picoIdentitySuite } from '@pico/protocol';
import sodium from 'libsodium-wrappers-sumo';
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
    sign: (signatureInput, context) => {
      // ADR 0106: the wire carries the label and the fields, never bytes. The
      // daemon rebuilds the canonical bytes and renders the person's statement
      // from the same fields, so nothing this process claims can diverge from
      // what the key signs.
      if (context === undefined || typeof context.label !== 'string') {
        throw new Error('signature_context_required');
      }
      const result = transport.request({
        family: picoVaultDaemonRequestFamilies.sign,
        keyFingerprintHex: metadata.keyFingerprintHex,
        label: context.label,
        fields: context.fields as Record<string, unknown>,
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
      const signature = Uint8Array.from(Buffer.from(result.signatureHex, 'hex'));
      // The daemon signed what it rebuilt from the fields. Verifying against
      // the caller's own bytes closes the loop from the consumer side: if the
      // fields did not describe these bytes, the signature does not match them
      // and the ceremony fails here instead of producing a record whose
      // signature quietly covers something else (ADR 0106 R5).
      if (!sodium.crypto_sign_verify_detached(
        signature,
        signatureInput,
        Uint8Array.from(Buffer.from(metadata.publicKeyHex, 'hex')),
      )) {
        throw new Error('signature_context_mismatch');
      }
      return signature;
    },
    close: () => {
      transport.close();
    },
  };
}
