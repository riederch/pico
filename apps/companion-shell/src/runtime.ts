import type { PicoRulesDecisionValue } from '@pico/protocol/pico-rules';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  startPicoCompanionAlarmCarrier,
  type PicoCompanionAlarmCheck,
  type PicoCompanionAlarmCarrierStatus,
} from '@pico/companion/alarm-carrier';
import { createPicoCompanionLifecycleReader } from '@pico/companion/lifecycle-reader';
import {
  grantPicoCompanionDomainRead,
  readPicoCompanionHomeId,
} from '@pico/companion/domain-read-grant';
// The narrow subpath, not the barrel: ADR 0136's boundary check caught the
// barrel pulling the vault CLI and the PDF generator into the tray's reachable
// closure - the same finding ADR 0138 already records against recovery.
import { createPicoVaultDaemonCeremonySigner } from '@pico/vault-daemon/ceremony-signer';
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
import type { PicoCompanionPlatformSecretPort } from '@pico/companion/platform-secrets';
import {
  askPicoCompanionDepotFetch,
  attachPicoCompanionDepot,
  attachPicoCompanionSupplier,
  decidePicoCompanionDepotReach,
  detachPicoCompanionDepot,
  detachPicoCompanionSupplier,
  decidePicoCompanionSupplierReach,
  decidePicoCompanionRule,
  forgetPicoCompanionRule,
  readPicoCompanionDepots,
  readPicoCompanionModuleConsent,
  readPicoCompanionPendingApprovals,
  readPicoCompanionSuppliers,
  recordPicoCompanionModuleConsent,
  resolvePicoCompanionApproval,
} from '@pico/companion/suppliers';
import {
  announcePicoCompanionPresence,
  picoCompanionPresenceId,
  forgetPicoCompanionDevice,
  readPicoCompanionDevices,
  switchPicoCompanionDevice,
  type PicoCompanionDeviceView,
  type PicoCompanionPresenceProbe,
} from '@pico/companion/presence';
import {
  readPicoCompanionDeviceAuthority,
  revokePicoCompanionDeviceAuthority,
  type PicoCompanionDeviceAuthorityView,
  type PicoCompanionDeviceRevocationReason,
} from '@pico/companion/device-lifecycle';
import type {
  PicoCompanionHomeMember,
  PicoCompanionHostRotation,
  PicoCompanionHostRotationReason,
  PicoCompanionMembershipEnding,
  PicoCompanionDomainReadership,
} from '@pico/companion/home-authority';
import type { PicoReaderCustodyReaderGrantRevocationReasonCategory } from '@pico/protocol';
import { picoPresenceLeaseMs } from '@pico/protocol/presence';
import type { PicoRelayAccountStatus } from '@pico/protocol/link-relay-operator';
import {
  claimPicoCompanionRelay,
  createPicoCompanionRelayAccount,
  defaultPicoCompanionRelayOperatorsPath,
  forgetPicoCompanionRelay,
  readPicoCompanionRelayAccounts,
  readPicoCompanionRelayOperators,
  revokePicoCompanionRelayAccount,
} from '@pico/companion/relay-operator';
import {
  askPicoCompanionModelProviderMeasurement,
  decidePicoCompanionModelProvider,
  forgetPicoCompanionModelProvider,
  askPicoCompanionRecall,
  readPicoCompanionMeasurements,
  forgetPicoCompanionMemory,
  keepPicoCompanionRecall,
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
import {
  picoCompanionFoundingDelegationValidUntil,
  picoCompanionModelProviderCredentialRef,
} from './contract.js';

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
  /**
   * ADR 0142 PE1/PE2. Points the Home at a host and asks what it can do.
   *
   * Returns when the work starts, not when it ends: measuring is minutes of
   * generation against somebody's card.
   */
  askModelProviderMeasurement(input: {
    reach: string;
    model: string;
    /**
     * ADR 0151 PV1. The credential a host behind an authenticating proxy
     * refuses every probe without, on a first measurement.
     *
     * The reference it is filed under is this file's to choose, the way a
     * widening's is: one credential per entry per person, and the Home seals
     * it once the entry it belongs to exists.
     */
    credential?: string;
  }): Promise<{
    entryId: string;
    state: string;
  }>;
  readModelProviderMeasurements(): Promise<readonly unknown[]>;
  /** ADR 0116 W1. Asks about a privacy domain this person may read. */
  askRecall(input: { privacyDomain: string; question: string }): Promise<{
    jobId: string;
    included: number;
    omitted: number;
    carries: string;
  }>;
  readRecalls(): Promise<readonly PicoCompanionRecallView[]>;
  /** ADR 0116 W5. The person's own write: this answer becomes a memory. */
  keepRecall(jobId: string): Promise<string>;
  /**
   * ADR 0049 mit ADR 0071. Nimmt den Austausch zurück, nicht die Notiz daraus.
   */
  forgetRecall(jobId: string): Promise<void>;
  /** ADR 0071. The person's own unwrite: that memory stops being one. */
  forgetMemory(memoryItemId: string): Promise<void>;
  /**
   * ADR 0082 with ADR 0100. Issues the grant that lets this device read one
   * part of its person's memory - signed here, recorded there.
   */
  grantDomainRead(input: { privacyDomain: string }): Promise<{
    grantId: string;
    privacyDomain: string;
    status: string;
  }>;
  /**
   * ADR 0138 CO3/CO4 with ADR 0143 DP3. What is attached, what a fetched depot
   * declares and nobody has accepted, and whether either may reach.
   */
  readSuppliers(): Promise<{ suppliers: readonly unknown[]; declared: readonly unknown[] }>;
  /** ADR 0137 IN5. The person names where a declared supplier's material goes. */
  attachSupplier(input: { identifier: string; privacyDomain: string }): Promise<{
    identifier: string;
    privacyDomain: string;
  }>;
  /** ADR 0136. Stops a supplier, and leaves what was derived from it. */
  detachSupplier(identifier: string): Promise<void>;
  /** ADR 0143 DP8. Takes back an attachment, and the working copy with it. */
  detachDepot(remote: string): Promise<void>;
  /** ADR 0143 DP1. Nimmt ein Angebot an, indem sie seinen Commit nennt. */
  acceptDepotOffer(remote: string, acceptedCommit: string): Promise<void>;
  /** ADR 0142 PE1. Forgets a measured machine, decisions and all. */
  forgetModelProvider(entryId: string): Promise<void>;
  decideSupplierReach(input: {
    identifier: string;
    mayReachOutside: boolean;
    mayReachUnasked: boolean;
  }): Promise<void>;
  /**
   * ADR 0143 DP1. What is pinned, a new pin, and whether Pico may fetch it -
   * und seit dem 2026-08-25 daneben, ob ein planmäßiger Lauf ohne Anwesende
   * handeln darf (ADR 0140 RL4).
   */
  readDepots(): Promise<unknown>;
  /**
   * ADR 0086 mit ADR 0130 E5. Ein Raum, den nur diese Person und die Leute
   * lesen können, die sie wählt - und ein Satz darin.
   */
  createReaderCustodySpace(): Promise<void>;
  writeReaderCustodyNote(text: string): Promise<{ memoryItemId: string }>;
  /** ADR 0094. Was in dem Raum steht - für dieses Gerät, wenn es lesen darf. */
  readReaderCustodyNotes(): Promise<readonly { memoryItemId: string; text: string }[]>;
  /** ADR 0085 mit ADR 0088. Das zweite Gerät derselben Person hereinlassen. */
  letOtherDeviceReadReaderCustody(): Promise<{ readerDelegationId: string }>;
  /**
   * ADR 0101 mit ADR 0130 E5. Das Schloss wechseln, nachdem jemand hinaus ist.
   *
   * Zwei Dinge in einer Handlung, weil eines nicht reicht: die offene
   * Rotationsschuld begleichen *und* dieses Gerät wieder schreibfähig machen.
   */
  rotateReaderCustodyDomain(): Promise<{
    rotated: boolean;
    writerGrantRenewed: boolean;
    chainCaughtUp: boolean;
    kekVersion: number;
    remainingReaders: number;
  }>;
  /** ADR 0140 RL4. Was Pico ohne Anwesende tun darf, gesetzt und zurückgenommen. */
  decideRule(input: {
    effectName: string;
    privacyDomain: string;
    decision: PicoRulesDecisionValue;
  }): Promise<void>;
  forgetRule(input: { effectName: string; privacyDomain: string }): Promise<void>;
  attachDepot(pin: Record<string, unknown>): Promise<{ remote: string; commit: string }>;
  decideDepotReach(input: {
    remote: string;
    mayFetch: boolean;
    mayFetchUnasked: boolean;
  }): Promise<void>;
  /**
   * ADR 0143 DP8 with ADR 0141 RN4. A person asking for a fetch now, what came
   * back to be answered, and the answer.
   *
   * The session travels from the shell rather than being made here: it names
   * the span a window is open, and this runtime does not own a window.
   */
  askDepotFetch(presenceSessionId: string): Promise<{
    requested: number;
    blocked?: string;
    waiting: readonly unknown[];
  }>;
  readPendingActions(presenceSessionId: string): Promise<readonly unknown[]>;
  resolvePendingAction(input: {
    requestedEventId: string;
    presenceSessionId: string;
    approved: boolean;
  }): Promise<{ outcome: string; ran: boolean; succeeded?: boolean }>;
  /** ADR 0139 AC4. What the parts of Pico declare they will do, and consent. */
  readModuleConsent(): Promise<readonly unknown[]>;
  recordModuleConsent(identifier: string): Promise<void>;
  /** ADR 0126 P2/P6. The person's own devices, as their Home knows them. */
  /**
   * The core's own rows. This said `unknown` until 2026-08-20, which was
   * true of nothing: the main process has to reach `lastSeenAt` to render
   * the day a person reads, and a boundary that hides the shape it hands on
   * makes the window the first place anybody finds out what is in it.
   */
  readDevices(): Promise<readonly PicoCompanionDeviceView[]>;
  switchDevice(input: {
    presenceId: string;
    affordance?: string;
    enabled: boolean;
  }): Promise<void>;
  forgetDevice(presenceId: string): Promise<void>;
  /**
   * ADR 0130 E3. The other half of the same devices: which of them your Home
   * still answers to, and ending one that it should not.
   *
   * Two calls rather than one merged row, because they fail differently. Not
   * knowing which devices are here is an absence (ADR 0118 O4) and reads as
   * an empty presence list; not knowing which devices may act as you is not,
   * and this one throws rather than answering "none".
   */
  readDeviceAuthority(): Promise<PicoCompanionDeviceAuthorityView>;
  /**
   * ADR 0130 E3. Adds a device the person is holding up to this one.
   *
   * `exchange` is where the person is: it is handed the code to show and
   * resolves with the code the other device shows back. It stays a function
   * rather than two calls because the ceremony is one call - a four-minute
   * activation that is built, signed elsewhere and submitted here.
   */
  enrolDevice(input: {
    offerCode: string;
    validUntil: string;
    exchange: (grantCode: string) => Promise<string>;
  }): Promise<{
    delegationId: string;
    targetSigningKeyFingerprintHex: string;
  }>;
  /**
   * ADR 0104. Another year for this device, and the profile that follows it.
   *
   * No arguments: which delegation is replaced is this device's own, and a
   * window naming one would be the surface choosing which authority to
   * retire.
   */
  renewDeviceAuthority(): Promise<{
    delegationId: string;
    replacedDelegationId: string;
    validUntil: string;
  }>;
  /**
   * ADR 0130 E3 renewal across two devices, from whichever side this one is
   * on. The sponsor reads the other device's code and renews; the device
   * being renewed shows its code, takes the grant and waits for its Home.
   */
  renewDeviceOverCodes(input: {
    offerCode: string;
    validUntil: string;
    exchange: (grantCode: string) => Promise<string>;
  }): Promise<{
    delegationId: string;
    replacedDelegationId: string;
    targetSigningKeyFingerprintHex: string;
  }>;
  offerOwnRenewal(): Promise<{ offerCode: string }>;
  acceptOwnRenewal(grantCode: string): Promise<{
    acceptanceCode: string;
    confirm: () => Promise<{ delegationId: string }>;
  }>;
  revokeDeviceAuthority(input: {
    targetDelegationId: string;
    reason: PicoCompanionDeviceRevocationReason;
  }): Promise<{
    delegationId: string;
    endedThisDevice: boolean;
    /** `null` when this device could not ask afterwards, which is what ending
     * its own authority does to it. */
    activeDevicesLeft: number | null;
  }>;
  /**
   * ADR 0130 E4. The Home itself: who else lives in it, admitting one more,
   * and the keys it is known by.
   *
   * All three throw. Not knowing who lives in your Home is not an absence a
   * window may render as "nobody" - that is a sentence about a place, and the
   * person acting on it would be acting on a wrong one.
   */
  readHomeMembers(): Promise<readonly PicoCompanionHomeMember[]>;
  admitHomeMember(input: { picoIdentityFingerprintHex: string }): Promise<{
    credentialId: string;
    picoIdentityFingerprintHex: string;
    validUntil: string;
  }>;
  endHomeMembership(input: {
    credentialId: string;
    picoIdentityFingerprintHex: string;
    ending: PicoCompanionMembershipEnding;
  }): Promise<{ credentialId: string; status: string }>;
  /**
   * ADR 0082 mit ADR 0130 E5. Wer welche Domäne lesen darf, und das Beenden
   * eines vergebenen Zugangs - von dem Gerät aus, das ihn vergeben hat.
   *
   * `endDomainRead` bekommt zwei Bezeichner und liest Domäne und Leser aus
   * derselben Liste zurück, die das Fenster angeboten hat. Das Fenster
   * beschreibt nicht, was widerrufen wird; es zeigt auf eine Zeile.
   */
  readDomainReadership(): Promise<readonly PicoCompanionDomainReadership[]>;
  endDomainRead(input: {
    domainId: string;
    readerGrantId: string;
    reasonCategory: PicoReaderCustodyReaderGrantRevocationReasonCategory;
  }): Promise<{ readerGrantId: string; status: 'revoked' }>;
  rotateHostKeys(input: {
    reason: PicoCompanionHostRotationReason;
  }): Promise<PicoCompanionHostRotation>;
  /**
   * ADR 0154. Relays this person operates - a different hat from having a
   * Pico, and one this device holds the only credential for.
   */
  readRelays(): Promise<readonly {
    baseUrl: string;
    operator: string;
    claimedAt: string;
    accounts?: readonly {
      accountRef: string;
      status: PicoRelayAccountStatus;
      mailboxQuota: number;
      maxCapacity: number;
      openMailboxes: number;
    }[];
  }[]>;
  claimRelay(input: { baseUrl: string; claimCode: string }): Promise<{ operator: string }>;
  /** ADR 0154 RO3. Returns the access key once. Nothing keeps a copy. */
  createRelayAccount(input: {
    baseUrl: string;
    mailboxQuota: number;
    maxCapacity: number;
  }): Promise<{ credential: string; accountRef: string }>;
  /** ADR 0154 RO5. Says what ended, because nothing else can observe it. */
  revokeRelayAccount(input: { baseUrl: string; accountRef: string }): Promise<{
    mailboxesEnded: number;
    packetsDropped: number;
  }>;
  forgetRelay(baseUrl: string): Promise<void>;
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
  /**
   * ADR 0154. Where a relay operator credential is kept.
   *
   * Optional, and its absence is a refusal rather than a fallback: without a
   * real OS keystore there is nowhere to put a bearer credential that is not
   * a file with a lock painted on it (ADR 0081 P3).
   */
  platformSecrets?: PicoCompanionPlatformSecretPort;
  /**
   * ADR 0126 P2. What this machine can actually do, observed.
   *
   * Absent means a runtime that declares only what the shell always offers -
   * a window, a notification and a secure field. Assuming a camera would put
   * a false fact in the field ADR 0126 says is a fact.
   */
  presenceProbe?: PicoCompanionPresenceProbe;
  presenceRefreshMs?: number;
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
    /**
     * ADR 0131 A3. The one place that forgot, and it is the first one.
     *
     * **Every operation below asks the automatic unlock before it runs, and
     * the start did not.** The lifecycle reader builds a Link client, a Link
     * client signs with the device key, and a device key in a locked vault
     * refuses - so on a device that has been off, `startServiceCore` caught
     * `link_device_signing_key_not_unlocked` and presented "the local
     * companion service could not start" to somebody whose automatic unlock
     * was configured, working, and never asked.
     *
     * Found by standing a window up against a Home founded minutes earlier:
     * the keystore held the passphrase, `ensureUnlocked()` opened the vault
     * when called by hand, and the shell never called it. A cold start is the
     * normal state of a laptop in the morning, which is why this was invisible
     * in every run that followed an unlocked one.
     *
     * Not swallowed: a keystore that cannot open is a Home this device cannot
     * reach, and the caller's own catch says so in words. Silently carrying on
     * would only move the same failure one line down.
     */
    await input.automaticVaultUnlock?.ensureUnlocked();
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
    /**
     * ADR 0126 P2/P5. This device saying it is here, and what it can do.
     *
     * **Refreshed well inside the lease**, at a third of it: a refresh that
     * lands exactly at the boundary makes a device that is running look absent
     * every time a round trip is slow, and a person watching their own device
     * flicker would be right to distrust the list.
     *
     * Failures are quiet. Not being able to announce is an absence, and ADR
     * 0118 O4's rule is that no absence renders a working thing as broken -
     * the window keeps working, the Home shows the presence as quiet, and the
     * next refresh says otherwise.
     */
    const announcePresence = async (): Promise<void> => {
      try {
        await serialized(async () => {
          await input.automaticVaultUnlock?.ensureUnlocked();
          await announcePicoCompanionPresence({
            livingDeviceLinkClient: await createPicoCompanionLinkClient({
              profile: readPicoCompanionProfile(profilePath),
              daemonClient,
              sodium: input.sodium,
              ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
            }),
            profile: readPicoCompanionProfile(profilePath),
            probe: input.presenceProbe ?? { canScanWithCamera: () => false, canPrint: () => false },
          });
        });
      } catch {
        // Quiet on purpose; see above.
      }
    };
    void announcePresence();
    const presenceRefresh = setInterval(
      () => void announcePresence(),
      input.presenceRefreshMs ?? Math.floor(picoPresenceLeaseMs / 3),
    );
    // Unref'd: a tray that could not exit because a heartbeat was pending
    // would be a heartbeat holding a product open.
    presenceRefresh.unref();

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
      askModelProviderMeasurement: async (ask) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        return await askPicoCompanionModelProviderMeasurement({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          reach: ask.reach,
          model: ask.model,
          // Named here rather than in the window, like the widening's is. The
          // Home seals it after the entry lands, so a measurement that failed
          // leaves nobody's secret behind.
          ...(ask.credential === undefined ? {} : {
            credentialRef: picoCompanionModelProviderCredentialRef,
            credential: ask.credential,
          }),
        });
      }),
      readModelProviderMeasurements: async () => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        return await readPicoCompanionMeasurements({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
        });
      }),
      forgetMemory: async (memoryItemId) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        await forgetPicoCompanionMemory({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          memoryItemId,
        });
      }),
      readSuppliers: async () => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        return await readPicoCompanionSuppliers({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
        });
      }),
      decideSupplierReach: async (decision) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        await decidePicoCompanionSupplierReach({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          ...decision,
        });
      }),
      attachSupplier: async (attachment) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        return await attachPicoCompanionSupplier({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          ...attachment,
        });
      }),
      detachSupplier: async (identifier) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        await detachPicoCompanionSupplier({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          identifier,
        });
      }),
      detachDepot: async (remote) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        await detachPicoCompanionDepot({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          remote,
        });
      }),
      acceptDepotOffer: async (remote, acceptedCommit) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const { acceptPicoCompanionDepotOffer } = await import('@pico/companion/suppliers');
        await acceptPicoCompanionDepotOffer({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          remote,
          acceptedCommit,
        });
      }),
      forgetModelProvider: async (entryId) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        await forgetPicoCompanionModelProvider({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          entryId,
        });
      }),
      createReaderCustodySpace: async () => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const profile = readPicoCompanionProfile(profilePath);
        const { createPicoCompanionReaderCustodySpace } =
          await import('@pico/companion/reader-custody-space');
        await createPicoCompanionReaderCustodySpace({
          daemonClient,
          profile,
          profilePath,
          sodium: input.sodium,
          ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
        });
      }),
      rotateReaderCustodyDomain: async () => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const profile = readPicoCompanionProfile(profilePath);
        const { rotatePicoCompanionReaderCustodyDomain } =
          await import('@pico/companion/reader-custody-space');
        return await rotatePicoCompanionReaderCustodyDomain({
          daemonClient,
          profile,
          profilePath,
          sodium: input.sodium,
          ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
        });
      }),
      writeReaderCustodyNote: async (text) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const profile = readPicoCompanionProfile(profilePath);
        const { writePicoCompanionReaderCustodyNote } =
          await import('@pico/companion/reader-custody-space');
        return await writePicoCompanionReaderCustodyNote({
          daemonClient,
          profile,
          profilePath,
          sodium: input.sodium,
          text,
          ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
        });
      }),
      readReaderCustodyNotes: async () => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const profile = readPicoCompanionProfile(profilePath);
        const { readPicoCompanionReaderCustodySpace } =
          await import('@pico/companion/reader-custody-space');
        const space = readPicoCompanionReaderCustodySpace(profilePath);
        if (space === undefined) {
          throw new Error('no_reader_custody_space');
        }
        const { readPicoCompanionReaderCustodyNotes } =
          await import('./reader-custody-read.js');
        return await readPicoCompanionReaderCustodyNotes({
          linkClient: await createPicoCompanionLinkClient({
            profile,
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          socketPath: input.vaultSocketPath ?? defaultPicoVaultDaemonSocketPath(),
          readerKeyFingerprintHex: profile.device.keyAgreementKeyFingerprintHex,
          domainAuthorityId: space.domainAuthorityId,
        });
      }),
      letOtherDeviceReadReaderCustody: async () => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const profile = readPicoCompanionProfile(profilePath);
        const { letPicoCompanionOtherDeviceRead } =
          await import('@pico/companion/reader-custody-space');
        return await letPicoCompanionOtherDeviceRead({
          daemonClient,
          profile,
          profilePath,
          sodium: input.sodium,
          ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
        });
      }),
      decideRule: async (decision) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        await decidePicoCompanionRule({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          ...decision,
        });
      }),
      forgetRule: async (rule) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        await forgetPicoCompanionRule({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          ...rule,
        });
      }),
      readDepots: async () => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        return await readPicoCompanionDepots({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
        });
      }),
      attachDepot: async (pin) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        return await attachPicoCompanionDepot({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          pin,
        });
      }),
      decideDepotReach: async (decision) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        await decidePicoCompanionDepotReach({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          ...decision,
        });
      }),
      askDepotFetch: async (presenceSessionId) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        return await askPicoCompanionDepotFetch({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          presenceSessionId,
        });
      }),
      readPendingActions: async (presenceSessionId) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        return await readPicoCompanionPendingApprovals({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          presenceSessionId,
        });
      }),
      resolvePendingAction: async (decision) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        return await resolvePicoCompanionApproval({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          ...decision,
        });
      }),
      readModuleConsent: async () => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        return await readPicoCompanionModuleConsent({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
        });
      }),
      recordModuleConsent: async (identifier) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        await recordPicoCompanionModuleConsent({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          identifier,
        });
      }),
      readDevices: async () => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        return await readPicoCompanionDevices({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
        });
      }),
      switchDevice: async ({ presenceId, affordance, enabled }) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        await switchPicoCompanionDevice({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          presenceId,
          ...(affordance === undefined ? {} : { affordance }),
          enabled,
        });
      }),
      forgetDevice: async (presenceId) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        await forgetPicoCompanionDevice({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          presenceId,
        });
      }),
      readDeviceAuthority: async () => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const profile = readPicoCompanionProfile(profilePath);
        return await readPicoCompanionDeviceAuthority({
          profile,
          daemonClient,
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile,
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
        });
      }),
      enrolDevice: async ({ offerCode, validUntil, exchange }) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const { enrolPicoCompanionDevice } = await import('@pico/companion/enrolment');
        const profile = readPicoCompanionProfile(profilePath);
        return await enrolPicoCompanionDevice({
          profile,
          daemonClient,
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile,
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          sodium: input.sodium,
          offerCode,
          validUntil,
          exchange,
        });
      }),
      renewDeviceAuthority: async () => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const { renewPicoCompanionDeviceAuthority } =
          await import('@pico/companion/device-lifecycle');
        const profile = readPicoCompanionProfile(profilePath);
        return await renewPicoCompanionDeviceAuthority({
          profile,
          profilePath,
          daemonClient,
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile,
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          sodium: input.sodium,
          validUntil: picoCompanionFoundingDelegationValidUntil(new Date()),
        });
      }),
      renewDeviceOverCodes: async ({ offerCode, validUntil, exchange }) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const { renewPicoCompanionDeviceOverCodes } = await import('@pico/companion/enrolment');
        const profile = readPicoCompanionProfile(profilePath);
        return await renewPicoCompanionDeviceOverCodes({
          profile,
          daemonClient,
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile,
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          sodium: input.sodium,
          offerCode,
          validUntil,
          exchange,
        });
      }),
      offerOwnRenewal: async () => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const { offerPicoCompanionRenewal } = await import('@pico/companion/enrolment');
        return await offerPicoCompanionRenewal({
          profile: readPicoCompanionProfile(profilePath),
          daemonClient,
        });
      }),
      acceptOwnRenewal: async (grantCode) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const { acceptPicoCompanionEnrolment, offerPicoCompanionRenewal } =
          await import('@pico/companion/enrolment');
        const profile = readPicoCompanionProfile(profilePath);
        const offer = await offerPicoCompanionRenewal({ profile, daemonClient });
        const accepted = await acceptPicoCompanionEnrolment({
          // Unused on this path: the session is this runtime's, already open
          // and already holding the keys the signature needs.
          socketPath: '',
          passphrase: '',
          openSession: {
            consumerClient: daemonClient,
            close: async () => undefined,
          },
          grantCode,
          profilePath,
          sodium: input.sodium,
          device: offer.device,
          ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
        });
        return {
          acceptanceCode: accepted.acceptanceCode,
          confirm: async () => ({
            delegationId: (await accepted.confirm()).device.delegationId,
          }),
        };
      }),
      revokeDeviceAuthority: async ({ targetDelegationId, reason }) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const profile = readPicoCompanionProfile(profilePath);
        return await revokePicoCompanionDeviceAuthority({
          profile,
          daemonClient,
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile,
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          sodium: input.sodium,
          targetDelegationId,
          reason,
        });
      }),
      readHomeMembers: async () => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const { readPicoCompanionHomeMembers } = await import('@pico/companion/home-authority');
        const profile = readPicoCompanionProfile(profilePath);
        return await readPicoCompanionHomeMembers({
          profile,
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile,
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
        });
      }),
      admitHomeMember: async ({ picoIdentityFingerprintHex }) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const { issuePicoCompanionMembership } = await import('@pico/companion/home-authority');
        const profile = readPicoCompanionProfile(profilePath);
        const issued = await issuePicoCompanionMembership({
          profile,
          daemonClient,
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile,
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          sodium: input.sodium,
          subjectPicoIdentityFingerprintHex: picoIdentityFingerprintHex,
          // ADR 0104's year, the same one a device's authority gets: a person
          // admitting somebody is not in a position to have an opinion about
          // how long, and two different answers would be two rules.
          validUntil: picoCompanionFoundingDelegationValidUntil(new Date()),
        });
        return {
          credentialId: issued.credentialId,
          picoIdentityFingerprintHex: issued.subjectPicoIdentityFingerprintHex,
          validUntil: issued.validUntil,
        };
      }),
      endHomeMembership: async (ending) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const { endPicoCompanionMembership } = await import('@pico/companion/home-authority');
        const profile = readPicoCompanionProfile(profilePath);
        return await endPicoCompanionMembership({
          profile,
          daemonClient,
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile,
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          sodium: input.sodium,
          credentialId: ending.credentialId,
          subjectPicoIdentityFingerprintHex: ending.picoIdentityFingerprintHex,
          ending: ending.ending,
        });
      }),
      readDomainReadership: async () => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const { readPicoCompanionDomainReadership } =
          await import('@pico/companion/home-authority');
        const profile = readPicoCompanionProfile(profilePath);
        return await readPicoCompanionDomainReadership({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile,
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
        });
      }),
      endDomainRead: async ({ domainId, readerGrantId, reasonCategory }) =>
        await serialized(async () => {
          await input.automaticVaultUnlock?.ensureUnlocked();
          const { readPicoCompanionDomainReadership, revokePicoCompanionDomainReader } =
            await import('@pico/companion/home-authority');
          const profile = readPicoCompanionProfile(profilePath);
          const livingDeviceLinkClient = await createPicoCompanionLinkClient({
            profile,
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          });
          /**
           * Aus derselben Liste gelesen, die das Fenster angeboten hat, statt
           * aus dem, was es zurückschickt: eine Domäne trägt den Host-Schlüssel,
           * unter dem sie autorisiert wurde, und den kennt das Fenster nicht -
           * es soll ihn auch nicht behaupten können.
           */
          const domains = await readPicoCompanionDomainReadership({ livingDeviceLinkClient });
          const domain = domains.find((entry) => entry.domainId === domainId);
          const reader = domain?.readers
            .find((entry) => entry.readerGrantId === readerGrantId);
          if (domain === undefined || reader === undefined) {
            throw new Error('unknown_domain_read_grant');
          }
          return await revokePicoCompanionDomainReader({
            profile,
            daemonClient,
            livingDeviceLinkClient,
            sodium: input.sodium,
            domain,
            reader,
            reasonCategory,
          });
        }),
      rotateHostKeys: async ({ reason }) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const { rotatePicoCompanionHostKeys } = await import('@pico/companion/home-authority');
        const profile = readPicoCompanionProfile(profilePath);
        return await rotatePicoCompanionHostKeys({
          profile,
          profilePath,
          daemonClient,
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile,
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          sodium: input.sodium,
          reason,
          ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
        });
      }),
      readRelays: async () => await serialized(async () => {
        const relaysPath = defaultPicoCompanionRelayOperatorsPath(profilePath);
        const relays = readPicoCompanionRelayOperators(relaysPath);
        const secrets = input.platformSecrets;
        if (secrets === undefined) {
          // Listed without their accounts rather than hidden: the person can
          // still see which relays this device claimed, and reaching one needs
          // a credential this session cannot open.
          return relays;
        }
        return await Promise.all(relays.map(async (relay) => {
          const listed = await readPicoCompanionRelayAccounts({
            path: relaysPath,
            baseUrl: relay.baseUrl,
            secrets,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          });
          // A relay that cannot be reached is still a relay this device
          // operates. Dropping it from the list would make an unreachable
          // machine look like one nobody claimed.
          return listed.ok ? { ...relay, accounts: listed.accounts } : relay;
        }));
      }),
      claimRelay: async ({ baseUrl, claimCode }) => await serialized(async () => {
        const secrets = requireSecrets(input.platformSecrets);
        const claimed = await claimPicoCompanionRelay({
          path: defaultPicoCompanionRelayOperatorsPath(profilePath),
          baseUrl,
          claimCode,
          secrets,
          at: new Date().toISOString(),
          ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
        });
        if (!claimed.ok) {
          // Somebody pressed a button and is standing there. Each refusal is
          // a different thing to do next, so it travels as itself.
          throw new Error(claimed.refusal);
        }
        return { operator: claimed.operator };
      }),
      createRelayAccount: async ({ baseUrl, mailboxQuota, maxCapacity }) =>
        await serialized(async () => {
          const secrets = requireSecrets(input.platformSecrets);
          const created = await createPicoCompanionRelayAccount({
            path: defaultPicoCompanionRelayOperatorsPath(profilePath),
            baseUrl,
            mailboxQuota,
            maxCapacity,
            secrets,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          });
          if (!created.ok) {
            throw new Error(created.refusal);
          }
          return {
            credential: created.issued.credential,
            accountRef: created.issued.account.accountRef,
          };
        }),
      revokeRelayAccount: async ({ baseUrl, accountRef }) => await serialized(async () => {
        const secrets = requireSecrets(input.platformSecrets);
        const revoked = await revokePicoCompanionRelayAccount({
          path: defaultPicoCompanionRelayOperatorsPath(profilePath),
          baseUrl,
          accountRef,
          secrets,
          ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
        });
        if (!revoked.ok) {
          throw new Error(revoked.refusal);
        }
        return {
          mailboxesEnded: revoked.revocation.mailboxesEnded,
          packetsDropped: revoked.revocation.packetsDropped,
        };
      }),
      forgetRelay: async (baseUrl) => await serialized(async () => {
        forgetPicoCompanionRelay({
          path: defaultPicoCompanionRelayOperatorsPath(profilePath),
          baseUrl,
        });
      }),
      forgetRecall: async (jobId) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const { forgetPicoCompanionRecall } = await import('@pico/companion/model-providers');
        await forgetPicoCompanionRecall({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          jobId,
        });
      }),
      keepRecall: async (jobId) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        return await keepPicoCompanionRecall({
          livingDeviceLinkClient: await createPicoCompanionLinkClient({
            profile: readPicoCompanionProfile(profilePath),
            daemonClient,
            sodium: input.sodium,
            ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          }),
          jobId,
          // ADR 0126 P3. This device announced itself as a presence; saying so
          // is what lets the crossing record name where the answer came from.
          presenceId: picoCompanionPresenceId(readPicoCompanionProfile(profilePath)),
        });
      }),
      grantDomainRead: async ({ privacyDomain }) => await serialized(async () => {
        await input.automaticVaultUnlock?.ensureUnlocked();
        const profile = readPicoCompanionProfile(profilePath);
        const linkClient = await createPicoCompanionLinkClient({
          profile,
          daemonClient,
          sodium: input.sodium,
          ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
        });
        /**
         * ADR 0080. The Home this device belongs to, asked rather than kept:
         * the profile pins who the Home Host Pico is and which host keys to
         * accept, and the identifier of the Home itself is something the Home
         * answers on the read this device already performs.
         */
        const homeId = await readPicoCompanionHomeId({ livingDeviceLinkClient: linkClient });
        const signer = createPicoVaultDaemonCeremonySigner({
          socketPath: input.vaultSocketPath ?? defaultPicoVaultDaemonSocketPath(),
          keyRole: 'pico_identity',
          keyFingerprintHex: profile.identity.keyFingerprintHex,
        });
        try {
          const nowMs = Date.now();
          return await grantPicoCompanionDomainRead({
            livingDeviceLinkClient: linkClient,
            signer,
            homeId,
            hostSigningKeyFingerprintHex: profile.host.signingKeyFingerprintHex,
            homeHostPicoIdentityFingerprintHex:
              profile.home.homeHostPicoIdentityFingerprintHex,
            identityPublicKeyHex: profile.identity.publicKeyHex,
            privacyDomain,
            validFrom: new Date(nowMs).toISOString(),
            // A year, and it ends. A grant without an end is one nobody ever
            // revisits, and ADR 0082 makes the window part of what was signed
            // precisely so it cannot quietly become permanent.
            validUntil: new Date(nowMs + 365 * 24 * 60 * 60 * 1_000).toISOString(),
            nowMs,
          });
        } finally {
          signer.close();
        }
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
        clearInterval(presenceRefresh);
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

/**
 * ADR 0154 with ADR 0081 P3. No keystore, no relay administration.
 *
 * A refusal rather than a fallback: the alternative to the OS keystore is a
 * file, and a bearer credential in a file is the thing the keystore exists to
 * not be.
 */
function requireSecrets(
  secrets: PicoCompanionPlatformSecretPort | undefined,
): PicoCompanionPlatformSecretPort {
  if (secrets === undefined) {
    throw new Error('platform_keystore_unavailable');
  }
  return secrets;
}
