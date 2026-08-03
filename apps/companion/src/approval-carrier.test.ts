import type {
  PicoVaultDaemonApprovalRequestDescriptor,
  PicoVaultDaemonClient,
} from '@pico/vault-daemon';
import { describe, expect, it, vi } from 'vitest';
import { startPicoCompanionApprovalCarrier } from './approval-carrier.js';

describe('Companion approval carrier (ADR 0112 S3 over ADR 0099/0106)', () => {
  it('acknowledges the watcher and echoes only the exact daemon decision binding', async () => {
    const approval = descriptor();
    let waits = 0;
    const approvalWait = vi.fn(async () => {
      waits += 1;
      if (waits === 1) {
        return { pending: approval };
      }
      throw new Error('daemon_connection_closed');
    });
    const approvalDecide = vi.fn(async () => ({ recorded: true as const }));
    const approvalWatch = vi.fn(async () => ({ watching: true as const }));
    const decisions = vi.fn(async () => true);
    const carrier = await startPicoCompanionApprovalCarrier({
      holdClient: {
        approvalWatch,
        approvalWait,
        approvalDecide,
      } as unknown as PicoVaultDaemonClient,
      decisions: { decideApproval: decisions },
    });
    await carrier.done;

    expect(approvalWatch).toHaveBeenCalledOnce();
    expect(decisions).toHaveBeenCalledWith(approval);
    expect(approvalDecide).toHaveBeenCalledWith({
      approvalId: approval.approvalId,
      signatureInputDigestHex: approval.signatureInputDigestHex,
      approved: true,
    });
  });

  it('turns a lost decision surface into denial and reports only public failures', async () => {
    const approval = descriptor();
    let waits = 0;
    const failures: string[] = [];
    const carrier = await startPicoCompanionApprovalCarrier({
      holdClient: {
        approvalWatch: async () => ({ watching: true }),
        approvalWait: async () => {
          waits += 1;
          return waits === 1
            ? { pending: approval }
            : Promise.reject(new Error('socket_path:/secret/vault.sock'));
        },
        approvalDecide: async (decision: {
          approvalId: string;
          signatureInputDigestHex: string;
          approved: boolean;
        }) => {
          expect(decision.approved).toBe(false);
          return { recorded: true };
        },
      } as unknown as PicoVaultDaemonClient,
      decisions: {
        decideApproval: async () => {
          throw new Error('renderer_gone');
        },
        notifyApprovalChannelFailure: (reason) => { failures.push(reason); },
      },
    });
    await carrier.done;
    expect(failures).toEqual(['approval_channel_failed']);
  });
});

function descriptor(): PicoVaultDaemonApprovalRequestDescriptor {
  return {
    approvalId: 'a'.repeat(32),
    label: 'pico.home.device-recovery-prepare.v1',
    keyRole: 'pico_identity',
    keyFingerprintHex: '11'.repeat(32),
    signatureInputDigestHex: '22'.repeat(32),
    statement: 'Recover this identity onto the exact target device.',
    expiresInMs: 60_000,
  };
}
