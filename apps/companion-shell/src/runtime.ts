import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  startPicoCompanionAlarmCarrier,
  type PicoCompanionAlarmCheck,
  type PicoCompanionAlarmCarrierStatus,
} from '@pico/companion/alarm-carrier';
import { createPicoCompanionLifecycleReader } from '@pico/companion/lifecycle-reader';
import {
  createPicoCompanionDueEntriesReader,
  createPicoCompanionDueEntryAcknowledger,
  createPicoCompanionStorageReader,
} from '@pico/companion/storage-reader';
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
import type { PicoCompanionAutomaticVaultUnlock } from '@pico/companion/platform-unlock';
import {
  decidePicoCompanionModelProvider,
  askPicoCompanionRecall,
  readPicoCompanionModelProviders,
  readPicoCompanionModelReachability,
  readPicoCompanionRecalls,
  type PicoCompanionRecallView,
  supplyPicoCompanionModelProviderCredential,
  revokePicoCompanionModelProvider,
  readPicoCompanionAnsweredReads,
  keepPicoCompanionAnsweredRead,
  type PicoCompanionAnsweredReadView,
  type PicoCompanionModelProviderView,
} from '@pico/companion/model-providers';
import { picoCompanionModelProviderCredentialRef } from './contract.js';

export interface PicoCompanionShellRuntime {
  checkNow(): Promise<PicoCompanionAlarmCheck>;
  vetoPendingRecovery(): Promise<void>;
  /** ADR 0152. What computes for this person, and their answer to it. */
  readModelProviders(): Promise<readonly PicoCompanionModelProviderView[]>;
  decideModelProvider(input: {
    entryId: string;
    providerClass: string;
    carries: string;
    credentialRef?: string;
  }): Promise<void>;
  /**
   * ADR 0151 PV1. Hands over the secret and then widens, as one act.
   *
   * Two calls in one direction rather than two the renderer makes: PV4 lets a
   * decision name only a credential this Home holds, so the order is not a
   * detail a window may get wrong.
   */
  widenModelProvider(input: {
    entryId: string;
    providerClass: string;
    secret: string;
  }): Promise<void>;
  revokeModelProvider(entryId: string): Promise<void>;
  /** ADR 0116 W1. Asks about a privacy domain this person may read. */
  askRecall(input: { privacyDomain: string; question: string }): Promise<{
    jobId: string;
    included: number;
    omitted: number;
    carries: string;
  }>;
  readRecalls(): Promise<readonly PicoCompanionRecallView[]>;
  /** ADR 0116 W5. What a read produced and nobody has kept. */
  readAnsweredReads(): Promise<readonly PicoCompanionAnsweredReadView[]>;
  keepAnsweredRead(jobId: string): Promise<string>;
  lockVault(): Promise<void>;
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
  automaticVaultUnlock?: PicoCompanionAutomaticVaultUnlock;
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
      await input.automaticVaultUnlock?.ensureUnlocked();
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
    /**
     * ADR 0119 Q5. Serialized like the lifecycle read, for the same reason -
     * one daemon, one caller at a time - and reading the profile fresh, so a
     * re-pin that happened since the last check is already in force.
     *
     * It builds its own Link client rather than sharing one. At a six-hour
     * cadence that cost is nothing, and the alternative would tie the storage
     * read's lifetime to the lifecycle read's error handling, where a strand
     * recovery is already doing delicate work.
     */
    const readStorageCondition = async () => await serialized(async () => {
      await input.automaticVaultUnlock?.ensureUnlocked();
      const currentProfile = readPicoCompanionProfile(profilePath);
      const linkClient = await createPicoCompanionLinkClient({
        profile: currentProfile,
        daemonClient,
        sodium: input.sodium,
        ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
      });
      return await createPicoCompanionStorageReader({ linkClient })();
    });

    /** ADR 0118 O1. Same shape and the same reasons as the storage read. */
    const readDueEntries = async () => await serialized(async () => {
      await input.automaticVaultUnlock?.ensureUnlocked();
      const currentProfile = readPicoCompanionProfile(profilePath);
      const linkClient = await createPicoCompanionLinkClient({
        profile: currentProfile,
        daemonClient,
        sodium: input.sodium,
        ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
      });
      return await createPicoCompanionDueEntriesReader({ linkClient })();
    });

    /**
     * ADR 0118 O1. Says an entry reached the person, over the same channel the
     * read came from.
     *
     * Serialized with the reads for the same reason they are with each other:
     * one Link client at a time, built from the profile as it is now.
     */
    const acknowledgeDueEntry = async (memoryItemId: string) => await serialized(async () => {
      await input.automaticVaultUnlock?.ensureUnlocked();
      const currentProfile = readPicoCompanionProfile(profilePath);
      const linkClient = await createPicoCompanionLinkClient({
        profile: currentProfile,
        daemonClient,
        sodium: input.sodium,
        ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
      });
      await createPicoCompanionDueEntryAcknowledger({ linkClient })(memoryItemId);
    });

    /**
     * ADR 0118 O4. Whether the decided provider is answering, on the cadence
     * the carrier already keeps - a condition is ambient, so it may not depend
     * on somebody having a window open.
     */
    const readModelReachability = async () => await serialized(async () => {
      await input.automaticVaultUnlock?.ensureUnlocked();
      const currentProfile = readPicoCompanionProfile(profilePath);
      const linkClient = await createPicoCompanionLinkClient({
        profile: currentProfile,
        daemonClient,
        sodium: input.sodium,
        ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
      });
      return await readPicoCompanionModelReachability({ livingDeviceLinkClient: linkClient });
    });

    const carrier = await startPicoCompanionAlarmCarrier({
      readLifecycle,
      readStorageCondition,
      readDueEntries,
      acknowledgeDueEntry,
      readModelReachability,
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
          await input.automaticVaultUnlock?.ensureUnlocked();
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
      /**
       * ADR 0152 with ADR 0107. Each call builds its own Link client from the
       * profile as it stands, exactly like the veto above: a client cached
       * across a host-key rotation would be a device signing to an audience
       * its Home no longer answers as.
       */
      readModelProviders: async () => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        return await readPicoCompanionModelProviders({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
        });
      }),
      decideModelProvider: async (decision) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        await decidePicoCompanionModelProvider({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          ...decision,
        });
      }),
      widenModelProvider: async (widening) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const linkClient = await createPicoCompanionLinkClient({
          profile: readPicoCompanionProfile(profilePath),
          daemonClient,
          sodium: input.sodium,
          ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
        });
        // The Home seals it on arrival; nothing here keeps a copy, and the
        // reference it answers with is what the decision then names.
        const credentialRef = await supplyPicoCompanionModelProviderCredential({
          livingDeviceLinkClient: linkClient,
          entryId: widening.entryId,
          credentialRef: picoCompanionModelProviderCredentialRef,
          secret: widening.secret,
        });
        await decidePicoCompanionModelProvider({
          livingDeviceLinkClient: linkClient,
          entryId: widening.entryId,
          providerClass: widening.providerClass,
          carries: 'live_turn_and_retrieved_memory',
          credentialRef,
        });
      }),
      askRecall: async (ask) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        return await askPicoCompanionRecall({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          ...ask,
        });
      }),
      readRecalls: async () => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        return await readPicoCompanionRecalls({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
        });
      }),
      revokeModelProvider: async (entryId) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        await revokePicoCompanionModelProvider({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          entryId,
        });
      }),
      readAnsweredReads: async () => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        return await readPicoCompanionAnsweredReads({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
        });
      }),
      keepAnsweredRead: async (jobId) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        return await keepPicoCompanionAnsweredRead({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          jobId,
        });
      }),
      lockVault: async () => {
        await input.automaticVaultUnlock?.lock();
      },
      status: () => carrier.status(),
      stop: async () => {
        if (stopped) {
          return;
        }
        stopped = true;
        carrier.stop();
        await Promise.allSettled([
          daemonClient.close(),
          input.automaticVaultUnlock?.close(),
        ]);
      },
    };
  } catch (error) {
    await Promise.allSettled([
      daemonClient.close(),
      input.automaticVaultUnlock?.close(),
    ]);
    throw error;
  }
}
