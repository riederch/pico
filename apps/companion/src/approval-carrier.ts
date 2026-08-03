import type {
  PicoVaultDaemonApprovalRequestDescriptor,
  PicoVaultDaemonClient,
} from '@pico/vault-daemon';

/** Shell adapter: the daemon owns the statement; the avatar returns one bit. */
export interface PicoCompanionApprovalDecisionPort {
  decideApproval(
    approval: PicoVaultDaemonApprovalRequestDescriptor,
  ): Promise<boolean>;
  notifyApprovalChannelFailure?(reason: string): void | Promise<void>;
}

export interface PicoCompanionApprovalCarrier {
  done: Promise<void>;
  stop(): void;
}

/**
 * ADR 0099/0106 hosted by ADR 0112 S3. The acknowledged watch closes the
 * first-request race for a product client; every actual approval still comes
 * from the daemon's long poll and is bound to its exact id and digest.
 */
export async function startPicoCompanionApprovalCarrier(input: {
  holdClient: PicoVaultDaemonClient;
  decisions: PicoCompanionApprovalDecisionPort;
}): Promise<PicoCompanionApprovalCarrier> {
  await input.holdClient.approvalWatch();
  let stopped = false;

  const run = async (): Promise<void> => {
    while (!stopped) {
      let pending: PicoVaultDaemonApprovalRequestDescriptor | null;
      try {
        pending = (await input.holdClient.approvalWait()).pending;
      } catch (error) {
        if (!stopped && !isClosedConnection(error)) {
          await input.decisions.notifyApprovalChannelFailure?.(
            publicApprovalFailure(error),
          );
        }
        return;
      }
      if (pending === null || stopped) {
        continue;
      }

      let approved = false;
      try {
        approved = await input.decisions.decideApproval(pending);
      } catch {
        // A shell decision adapter that disappears is silence, never consent.
        approved = false;
      }
      try {
        await input.holdClient.approvalDecide({
          approvalId: pending.approvalId,
          signatureInputDigestHex: pending.signatureInputDigestHex,
          approved,
        });
      } catch (error) {
        if (!stopped && !isClosedConnection(error)) {
          await input.decisions.notifyApprovalChannelFailure?.(
            publicApprovalFailure(error),
          );
        }
        return;
      }
    }
  };

  return {
    done: run(),
    stop: () => {
      stopped = true;
    },
  };
}

function publicApprovalFailure(error: unknown): string {
  if (error instanceof Error && error.message === 'approval_denied') {
    return 'approval_denied';
  }
  return 'approval_channel_failed';
}

function isClosedConnection(error: unknown): boolean {
  return error instanceof Error && error.message === 'daemon_connection_closed';
}
