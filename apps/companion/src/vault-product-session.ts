import type { PicoVaultPersonKeyRole } from '@pico/protocol';
import {
  connectPicoVaultDaemonClient,
  type PicoVaultDaemonClient,
} from '@pico/vault-daemon';
import {
  startPicoCompanionApprovalCarrier,
  type PicoCompanionApprovalCarrier,
  type PicoCompanionApprovalDecisionPort,
} from './approval-carrier.js';

export interface PicoCompanionVaultUnlockInput {
  keyRole: PicoVaultPersonKeyRole;
  keyFingerprintHex: string;
  passphrase: string;
}

export interface PicoCompanionVaultProductSession {
  /** Separate consumer: the hold connection stays exclusively long-polled. */
  consumerClient: PicoVaultDaemonClient;
  close(): Promise<void>;
}

/**
 * Owns the ADR 0099 hold channel for one bounded product interaction. The
 * consumer never receives passphrases and cannot approve itself; closing the
 * hold connection locks every session it opened.
 */
export async function openPicoCompanionVaultProductSession(input: {
  socketPath: string;
  unlock: PicoCompanionVaultUnlockInput[];
  decisions: PicoCompanionApprovalDecisionPort;
  connect?: typeof connectPicoVaultDaemonClient;
}): Promise<PicoCompanionVaultProductSession> {
  if (input.unlock.length === 0) {
    throw new Error('companion_vault_session_requires_unlock');
  }
  const fingerprints = new Set(input.unlock.map((entry) => entry.keyFingerprintHex));
  if (fingerprints.size !== input.unlock.length) {
    throw new Error('duplicate_companion_vault_unlock');
  }
  const connect = input.connect ?? connectPicoVaultDaemonClient;
  const holdClient = await connect({ socketPath: input.socketPath });
  let consumerClient: PicoVaultDaemonClient | null = null;
  let carrier: PicoCompanionApprovalCarrier | null = null;
  try {
    await holdClient.hello();
    for (const unlock of input.unlock) {
      const opened = await holdClient.unlock(unlock);
      if (
        opened.keyRole !== unlock.keyRole
        || opened.keyFingerprintHex !== unlock.keyFingerprintHex
      ) {
        throw new Error('companion_vault_unlock_binding_mismatch');
      }
    }
    carrier = await startPicoCompanionApprovalCarrier({
      holdClient,
      decisions: input.decisions,
    });
    consumerClient = await connect({ socketPath: input.socketPath });
    await consumerClient.hello();

    let closed = false;
    return {
      consumerClient,
      close: async () => {
        if (closed) {
          return;
        }
        closed = true;
        carrier?.stop();
        await Promise.allSettled([
          consumerClient!.close(),
          holdClient.close(),
        ]);
        await carrier?.done;
      },
    };
  } catch (error) {
    carrier?.stop();
    await Promise.allSettled([
      consumerClient?.close(),
      holdClient.close(),
    ]);
    await carrier?.done;
    throw error;
  }
}
