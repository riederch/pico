import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  createPicoCompanionLifecycleReader,
  defaultPicoCompanionProfilePath,
  readPicoCompanionProfile,
  startPicoCompanionAlarmCarrier,
  type PicoCompanionAlarmCheck,
  type PicoCompanionAlarmCarrierStatus,
} from '@pico/companion';
import type { VaultSodium } from '@pico/vault';
import { connectPicoVaultDaemonClient } from '@pico/vault-daemon';
import type { PicoCompanionShellNotifications } from './presentation-adapter.js';

export interface PicoCompanionShellRuntime {
  checkNow(): Promise<PicoCompanionAlarmCheck>;
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
  fetch?: typeof fetch;
  checkIntervalMs?: number;
}): Promise<PicoCompanionShellRuntime> {
  const profilePath = input.profilePath ?? defaultPicoCompanionProfilePath();
  const profile = readPicoCompanionProfile(profilePath);
  const daemonClient = await connectPicoVaultDaemonClient({
    socketPath: input.vaultSocketPath ?? defaultPicoVaultDaemonSocketPath(),
  });

  try {
    await daemonClient.hello();
    const readLifecycle = await createPicoCompanionLifecycleReader({
      profile,
      profilePath,
      notifications: input.notifications,
      daemonClient,
      sodium: input.sodium,
      ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
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
