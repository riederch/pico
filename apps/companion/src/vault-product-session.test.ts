import type { PicoVaultDaemonClient } from '@pico/vault-daemon';
import { describe, expect, it, vi } from 'vitest';
import { openPicoCompanionVaultProductSession } from './vault-product-session.js';

describe('Companion bounded Vault product session', () => {
  it('keeps the hold/approval channel separate from the ceremony consumer', async () => {
    let closeWait: ((error: Error) => void) | undefined;
    const hold = {
      hello: vi.fn(async () => ({ protocolVersion: 1, daemonVersion: 'test', locked: true })),
      unlock: vi.fn(async (input) => ({
        ...input,
        publicKeyHex: 'aa'.repeat(32),
        idleLockMs: 1,
        maxUnlockDurationMs: 1,
      })),
      approvalWatch: vi.fn(async () => ({ watching: true as const })),
      approvalWait: vi.fn(async () => await new Promise((_resolve, reject) => {
        closeWait = reject;
      })),
      close: vi.fn(async () => { closeWait?.(new Error('daemon_connection_closed')); }),
    } as unknown as PicoVaultDaemonClient;
    const consumer = {
      hello: vi.fn(async () => ({ protocolVersion: 1, daemonVersion: 'test', locked: false })),
      close: vi.fn(async () => undefined),
    } as unknown as PicoVaultDaemonClient;
    const connect = vi.fn()
      .mockResolvedValueOnce(hold)
      .mockResolvedValueOnce(consumer);

    const session = await openPicoCompanionVaultProductSession({
      socketPath: '/private/vault.sock',
      unlock: [{
        keyRole: 'pico_identity',
        keyFingerprintHex: '11'.repeat(32),
        passphrase: 'local Vault passphrase',
      }],
      decisions: { decideApproval: async () => true },
      connect,
    });
    expect(session.consumerClient).toBe(consumer);
    expect(hold.unlock).toHaveBeenCalledOnce();
    expect(hold.approvalWatch).toHaveBeenCalledOnce();
    expect(consumer.hello).toHaveBeenCalledOnce();

    await session.close();
    await session.close();
    expect(hold.close).toHaveBeenCalledOnce();
    expect(consumer.close).toHaveBeenCalledOnce();
  });

  it('refuses empty and duplicate unlock selections before connecting', async () => {
    const connect = vi.fn();
    await expect(openPicoCompanionVaultProductSession({
      socketPath: '/private/vault.sock',
      unlock: [],
      decisions: { decideApproval: async () => false },
      connect,
    })).rejects.toThrow('companion_vault_session_requires_unlock');
    await expect(openPicoCompanionVaultProductSession({
      socketPath: '/private/vault.sock',
      unlock: [
        {
          keyRole: 'pico_identity',
          keyFingerprintHex: '11'.repeat(32),
          passphrase: 'one',
        },
        {
          keyRole: 'device_signing',
          keyFingerprintHex: '11'.repeat(32),
          passphrase: 'two',
        },
      ],
      decisions: { decideApproval: async () => false },
      connect,
    })).rejects.toThrow('duplicate_companion_vault_unlock');
    expect(connect).not.toHaveBeenCalled();
  });
});
