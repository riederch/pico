import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  startPicoCompanionAlarmCarrier,
  type PicoCompanionAlarmCheck,
  type PicoCompanionAlarmCarrierStatus,
} from '@pico/companion/alarm-carrier';
import { createPicoCompanionLifecycleReader } from '@pico/companion/lifecycle-reader';
import {
  defaultPicoCompanionProfilePath,
  readPicoCompanionProfile,
} from '@pico/companion/profile';
import {
  checkPicoCompanionRecoveryCompletion,
  createPicoCompanionLinkClient,
  vetoPicoCompanionPendingRecovery,
} from '@pico/companion/recovery-controller';
import {
  defaultPicoCompanionRecoveryStatePath,
  readPicoCompanionRecoveryState,
} from '@pico/companion/recovery-state';
import type { VaultSodium } from '@pico/vault';
import { connectPicoVaultDaemonClient } from '@pico/vault-daemon/client';
import type { PicoCompanionShellNotifications } from './presentation-adapter.js';

export interface PicoCompanionShellRuntime {
  checkNow(): Promise<PicoCompanionAlarmCheck>;
  vetoPendingRecovery(): Promise<void>;
  status(): PicoCompanionAlarmCarrierStatus;
  stop(): Promise<void>;
}

export function defaultPicoVaultDaemonSocketPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(env.PICO_VAULT_HOME ?? join(homedir(), '.pico', 'vault'), 'run', 'daemon.sock');
}

/**
 * Hosts the shell-free ADR 0113 C1 service core inside the Electron main
 * process. The profile and daemon socket never cross into preload/renderer.
 */
export async function startPicoCompanionShellRuntime(input: {
  notifications: PicoCompanionShellNotifications;
  sodium: VaultSodium;
  profilePath?: string;
  vaultSocketPath?: string;
  recoveryStatePath?: string;
  fetch?: typeof fetch;
  checkIntervalMs?: number;
}): Promise<PicoCompanionShellRuntime> {
  const profilePath = input.profilePath ?? defaultPicoCompanionProfilePath();
  const profile = readPicoCompanionProfile(profilePath);
  const recoveryStatePath = input.recoveryStatePath
    ?? defaultPicoCompanionRecoveryStatePath(profilePath);
  const daemonClient = await connectPicoVaultDaemonClient({
    socketPath: input.vaultSocketPath ?? defaultPicoVaultDaemonSocketPath(),
  });

  try {
    await daemonClient.hello();
    const baseReadLifecycle = await createPicoCompanionLifecycleReader({
      profile,
      profilePath,
      notifications: input.notifications,
      daemonClient,
      sodium: input.sodium,
      ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
    });
    const recoveredState = readPicoCompanionRecoveryState(recoveryStatePath);
    if (recoveredState?.status === 'completed') {
      await input.notifications.notifyRecoveryCompleted({
        picoIdentityFingerprintHex: profile.identity.keyFingerprintHex,
        receipt: recoveredState.receipt,
      });
    }
    let serialTail: Promise<void> = Promise.resolve();
    const serialized = async <Result>(operation: () => Promise<Result>): Promise<Result> => {
      const result = serialTail.then(operation, operation);
      serialTail = result.then(() => undefined, () => undefined);
      return await result;
    };
    const readLifecycle = async () => await serialized(async () => {
      const currentProfile = readPicoCompanionProfile(profilePath);
      const targetLinkClient = await createPicoCompanionLinkClient({
        profile: currentProfile,
        daemonClient,
        sodium: input.sodium,
        ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
      });
      await checkPicoCompanionRecoveryCompletion({
        statePath: recoveryStatePath,
        profile: currentProfile,
        targetLinkClient,
        notifications: input.notifications,
      });
      return await baseReadLifecycle();
    });
    const carrier = await startPicoCompanionAlarmCarrier({
      readLifecycle,
      notifications: input.notifications,
      ...(input.checkIntervalMs === undefined
        ? {}
        : { checkIntervalMs: input.checkIntervalMs }),
    });
    let stopped = false;
    return {
      checkNow: async () => await carrier.checkNow(),
      vetoPendingRecovery: async () => {
        const pending = carrier.status().lastCheck?.pendingRecovery;
        if (pending === null || pending === undefined) {
          throw new Error('no_pending_recovery_alarm');
        }
        await serialized(async () => {
          const currentProfile = readPicoCompanionProfile(profilePath);
          const livingDeviceLinkClient = await createPicoCompanionLinkClient({
            profile: currentProfile,
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          });
          await vetoPicoCompanionPendingRecovery({
            livingDeviceLinkClient,
            pending,
          });
        });
        await carrier.checkNow();
      },
      status: () => carrier.status(),
      stop: async () => {
        if (stopped) {
          return;
        }
        stopped = true;
        carrier.stop();
        await daemonClient.close();
      },
    };
  } catch (error) {
    await daemonClient.close();
    throw error;
  }
}
