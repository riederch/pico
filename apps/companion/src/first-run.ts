import { existsSync } from 'node:fs';
import {
  parsePicoRecoveryCardScanTransport,
  type PicoHomeDeviceRecoveryPendingView,
} from '@pico/protocol';
import { isPicoVaultPassphrase, type VaultSodium } from '@pico/vault';
// Narrow subpaths for the same reason `recovery-controller.ts` uses them: the
// barrel carries the CLI and the daemon server, and a first run needs neither.
import {
  connectPicoVaultDaemonClient,
  type PicoVaultDaemonClient,
} from '@pico/vault-daemon/client';
import { initiatePicoHomeDeviceRecovery } from '@pico/vault-daemon/device-recovery-ceremony';
import { refreshPicoHomeHostPins } from '@pico/vault-daemon/host-pin-refresh';
import type {
  PicoCompanionApprovalDecisionPort,
} from './approval-carrier.js';
import {
  advancePicoCompanionFirstRunJournal,
  clearPicoCompanionFirstRunJournal,
  defaultPicoCompanionFirstRunJournalPath,
  picoCompanionFirstRunJournalSchema,
  picoCompanionFirstRunProfile,
  readPicoCompanionFirstRunJournal,
  type PicoCompanionFirstRunBinding,
  type PicoCompanionFirstRunJournal,
} from './first-run-journal.js';
import {
  defaultPicoCompanionPlatformUnlockPath,
  writePicoCompanionPlatformUnlock,
  type PicoCompanionPlatformSecretPort,
} from './platform-unlock.js';
import {
  readPicoCompanionProfile,
  writePicoCompanionProfile,
  type PicoCompanionProfile,
} from './profile.js';
import {
  createPicoCompanionLinkClient,
  checkPicoCompanionRecoveryCompletion,
  type PicoCompanionRecoveryNotifications,
} from './recovery-controller.js';
import {
  defaultPicoCompanionRecoveryStatePath,
  picoCompanionRecoveryStateSchema,
  readPicoCompanionRecoveryState,
  writePicoCompanionRecoveryState,
  type PicoCompanionRecoveryReceiptSummary,
} from './recovery-state.js';
import {
  openPicoCompanionVaultProductSession,
} from './vault-product-session.js';

/**
 * ADR 0112 S3 first run. A device that holds a Recovery Card and nothing else
 * has to become a real member of its Home: restore the identity root into a
 * provably fresh vault, create this device's own keys, ask the Home for a
 * time-locked total replacement, wait out the objection window, complete it,
 * and only then own a profile.
 *
 * Every irreversible or partially-visible step is journaled, so a restart
 * resumes forward instead of starting over - the daemon bootstrap in
 * particular can happen exactly once per vault, by design.
 *
 * The delegation lifetime is a pinned product default in the sense of
 * ADR 0104: a Pico setting later, never host configuration, and never a value
 * a caller has to know to get first run right.
 */
export const picoCompanionFirstRunDelegationValidityMs =
  365 * 24 * 60 * 60 * 1_000;

export interface PicoCompanionFirstRunSecrets {
  /**
   * The exact string the scanner produced, prefix included. Only needed for
   * the very first attempt; once the vault is bootstrapped the card has done
   * its job and must not be asked for again.
   */
  cardTransport?: string;
  /** Card PIN. Needed alongside `cardTransport` and never afterwards. */
  pin?: string;
  /** The device passphrase this vault is being created with. */
  passphrase: string;
}

export type PicoCompanionFirstRunNeed =
  | { need: 'card_and_secrets' }
  | {
    need: 'passphrase';
    step: 'bootstrapped' | 'submitted' | 'completed';
    binding: PicoCompanionFirstRunBinding;
    pending?: PicoHomeDeviceRecoveryPendingView;
  }
  | { need: 'nothing'; profile: PicoCompanionProfile };

export type PicoCompanionFirstRunOutcome =
  | {
    status: 'awaiting_window';
    pending: PicoHomeDeviceRecoveryPendingView;
  }
  | {
    status: 'blocked';
    pending: PicoHomeDeviceRecoveryPendingView;
    reason: 'vault_locked' | 'completion_failed' | 'completion_window_lapsed';
  }
  | {
    status: 'complete';
    profile: PicoCompanionProfile;
    receipt: PicoCompanionRecoveryReceiptSummary;
    platformUnlockBound: boolean;
  };

export interface PicoCompanionFirstRunPaths {
  profilePath: string;
  journalPath?: string;
  recoveryStatePath?: string;
}

export interface RunPicoCompanionFirstRunInput extends PicoCompanionFirstRunPaths {
  sodium: VaultSodium;
  socketPath: string;
  secrets: PicoCompanionFirstRunSecrets;
  notifications: PicoCompanionRecoveryNotifications;
  /**
   * Every signature the ceremony needs is authority-creating, so it travels
   * the ADR 0099 hold channel like any other. First run owns no exemption.
   */
  decisions: PicoCompanionApprovalDecisionPort;
  connect?: typeof connectPicoVaultDaemonClient;
  /**
   * Absent means the Platform Keystore stays unused, which is a supported
   * outcome rather than a failure: the person simply unlocks manually.
   */
  platformSecrets?: PicoCompanionPlatformSecretPort;
  platformUnlockPath?: string;
  delegationValidityMs?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

/**
 * What the surface must ask for before it can call `runPicoCompanionFirstRun`.
 * A readable profile ends first run for good; anything else is answered from
 * the journal, never from the card, because the card is only ever needed once.
 */
export function readPicoCompanionFirstRunNeed(
  paths: PicoCompanionFirstRunPaths,
): PicoCompanionFirstRunNeed {
  const profile = readProfileIfPresent(paths.profilePath);
  if (profile !== null) {
    return { need: 'nothing', profile };
  }
  const journal = readPicoCompanionFirstRunJournal(journalPathOf(paths));
  if (journal === null) {
    return { need: 'card_and_secrets' };
  }
  if (journal.step === 'committed') {
    // The profile is gone but the run says it was written: the person is
    // looking at a damaged install, not at a first run.
    throw new Error('first_run_committed_without_profile');
  }
  return {
    need: 'passphrase',
    step: journal.step,
    binding: journal.binding,
    ...(journal.step === 'submitted' ? { pending: journal.pending } : {}),
  };
}

/**
 * Drives the run as far as the supplied secrets and the Home's own timing
 * allow, then returns what actually happened. Calling it again after a crash,
 * a restart or an `awaiting_window` result is the normal way to continue.
 */
export async function runPicoCompanionFirstRun(
  input: RunPicoCompanionFirstRunInput,
): Promise<PicoCompanionFirstRunOutcome> {
  const journalPath = journalPathOf(input);
  const statePath = input.recoveryStatePath
    ?? defaultPicoCompanionRecoveryStatePath(input.profilePath);
  const now = input.now ?? (() => new Date());
  assertPassphrase(input.secrets.passphrase);

  let journal = readPicoCompanionFirstRunJournal(journalPath)
    ?? await bootstrapFreshVault({ ...input, journalPath });

  if (journal.step === 'bootstrapped' || journal.step === 'submitted') {
    // The three keys the ceremony needs: the restored root authorizes, the two
    // device keys prove possession of the target. The platform unlock owner
    // deliberately never touches the root, so this is the one place a first run
    // unlocks it, with a passphrase a person just typed - and the session that
    // holds those unlocks is also the one that answers the approvals.
    const session = await openPicoCompanionVaultProductSession({
      socketPath: input.socketPath,
      unlock: firstRunUnlocks(journal.binding, input.secrets.passphrase),
      decisions: input.decisions,
      ...(input.connect === undefined ? {} : { connect: input.connect }),
    });
    try {
      if (journal.step === 'bootstrapped') {
        journal = await submitRecovery({
          ...input,
          daemonClient: session.consumerClient,
          journalPath,
          statePath,
          journal,
          now,
        });
      }
      if (journal.step === 'submitted') {
        const advanced = await completeRecovery({
          ...input,
          daemonClient: session.consumerClient,
          journalPath,
          statePath,
          journal,
        });
        if (advanced.status !== 'completed') {
          return advanced.outcome;
        }
        journal = advanced.journal;
      }
    } finally {
      await session.close();
    }
  }

  if (journal.step === 'completed') {
    journal = await commitFirstRun({ ...input, journalPath, journal });
  }

  if (journal.step !== 'committed') {
    throw new Error('first_run_unfinished');
  }
  // Only now is the journal expendable: the profile it produced reads back.
  const profile = readPicoCompanionProfile(input.profilePath);
  clearPicoCompanionFirstRunJournal(journalPath);
  return {
    status: 'complete',
    profile,
    receipt: journal.receipt,
    platformUnlockBound: journal.platformUnlockBound,
  };
}

/**
 * The one irreversible step. The Home's key bundle is verified from the card's
 * own pins and its non-rotating acceptor pin *before* the vault is touched, so
 * a card pointing at an endpoint that cannot prove itself costs nothing.
 */
async function bootstrapFreshVault(input: RunPicoCompanionFirstRunInput & {
  journalPath: string;
}): Promise<PicoCompanionFirstRunJournal> {
  const { cardTransport, pin } = input.secrets;
  if (cardTransport === undefined || pin === undefined) {
    throw new Error('first_run_requires_card_and_pin');
  }
  const scan = parsePicoRecoveryCardScanTransport(cardTransport);
  const card = scan.payload;

  const refreshed = await refreshPicoHomeHostPins(input.sodium, {
    coreUrl: card.endpointHint,
    pinnedHostSigningKeyFingerprintHex: card.hostSigningKeyFingerprintHex,
    pinnedHostKeyAgreementKeyFingerprintHex:
      card.hostKeyAgreementKeyFingerprintHex,
    pinnedHomeHostPicoIdentityFingerprintHex:
      card.homeHostPicoIdentityFingerprintHex,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });
  if (refreshed.status === 'unverified') {
    throw new Error(`first_run_home_unverified:${refreshed.reason}`);
  }
  const head = refreshed.head;

  // A plain connection with no unlock: the daemon refuses to bootstrap a vault
  // that already has an open session, and rightly so.
  const connect = input.connect ?? connectPicoVaultDaemonClient;
  const daemonClient = await connect({ socketPath: input.socketPath });
  let bootstrapped: Awaited<ReturnType<PicoVaultDaemonClient['recoveryBootstrap']>>;
  try {
    await daemonClient.hello();
    bootstrapped = await daemonClient.recoveryBootstrap({
      canonicalCardPayloadHex: hex(scan.canonicalPayload),
      pin,
      passphrase: input.secrets.passphrase,
      targetDelegationId: firstRunDelegationId(input.sodium),
    });
  } finally {
    await daemonClient.close();
  }
  // The daemon parsed the same bytes; disagreeing about which Home this is
  // would mean one of the two is not reading the card in front of the person.
  if (bootstrapped.card.homeId !== card.homeId
    || bootstrapped.card.homeHostPicoIdentityFingerprintHex
      !== card.homeHostPicoIdentityFingerprintHex
    || bootstrapped.identity.keyFingerprintHex
      !== card.identityKeyFingerprintHex) {
    throw new Error('first_run_bootstrap_card_mismatch');
  }

  return advancePicoCompanionFirstRunJournal(input.journalPath, {
    schema: picoCompanionFirstRunJournalSchema,
    step: 'bootstrapped',
    binding: {
      coreUrl: card.endpointHint,
      homeId: card.homeId,
      home: {
        homeHostPicoIdentityFingerprintHex:
          card.homeHostPicoIdentityFingerprintHex,
      },
      host: {
        signingPublicKeyHex: head.signingPublicKeyHex,
        signingKeyFingerprintHex: head.signingKeyFingerprintHex,
        keyAgreementPublicKeyHex: head.keyAgreementPublicKeyHex,
        keyAgreementKeyFingerprintHex: head.keyAgreementKeyFingerprintHex,
      },
      identity: {
        keyFingerprintHex: bootstrapped.identity.keyFingerprintHex,
        publicKeyHex: bootstrapped.identity.publicKeyHex,
      },
      device: {
        signingKeyFingerprintHex: bootstrapped.device.signingKeyFingerprintHex,
        keyAgreementKeyFingerprintHex:
          bootstrapped.device.keyAgreementKeyFingerprintHex,
        delegationId: bootstrapped.device.delegationId,
      },
    },
  });
}

async function submitRecovery(input: RunPicoCompanionFirstRunInput & {
  daemonClient: PicoVaultDaemonClient;
  journalPath: string;
  statePath: string;
  journal: PicoCompanionFirstRunJournal;
  now: () => Date;
}): Promise<PicoCompanionFirstRunJournal> {
  const binding = input.journal.binding;
  const profile = picoCompanionFirstRunProfile(binding);
  const targetLinkClient = await createPicoCompanionLinkClient({
    profile,
    daemonClient: input.daemonClient,
    sodium: input.sodium,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });
  const validityMs = input.delegationValidityMs
    ?? picoCompanionFirstRunDelegationValidityMs;
  const startedAt = input.now();
  // The ceremony was written for a stranded person holding two vaults: it asks
  // the root and the target for their status concurrently. First run has one
  // vault playing both parts, and one connection carries one request at a
  // time, so the target role gets its own connection rather than a serialized
  // variant of a ceremony that is proven as it stands.
  const connect = input.connect ?? connectPicoVaultDaemonClient;
  const targetClient = await connect({ socketPath: input.socketPath });
  let ceremony: Awaited<ReturnType<typeof initiatePicoHomeDeviceRecovery>>;
  try {
    await targetClient.hello();
    ceremony = await initiatePicoHomeDeviceRecovery({
      rootClient: input.daemonClient,
      targetClient,
      targetLinkClient,
      sodium: input.sodium,
      homeId: binding.homeId,
      hostSigningKeyFingerprintHex: binding.host.signingKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex:
        binding.host.keyAgreementKeyFingerprintHex,
      identityKeyFingerprintHex: binding.identity.keyFingerprintHex,
      targetDelegationId: binding.device.delegationId,
      targetDeviceSigningKeyFingerprintHex:
        binding.device.signingKeyFingerprintHex,
      targetDeviceKeyAgreementKeyFingerprintHex:
        binding.device.keyAgreementKeyFingerprintHex,
      validUntil: new Date(startedAt.getTime() + validityMs).toISOString(),
      now: input.now,
    });
  } finally {
    await targetClient.close();
  }

  const advanced = advancePicoCompanionFirstRunJournal(input.journalPath, {
    schema: picoCompanionFirstRunJournalSchema,
    step: 'submitted',
    binding,
    pending: ceremony.pending,
  });
  writePendingState(input.statePath, ceremony.pending);
  return advanced;
}

/**
 * Completion runs through the same controller the ordinary cadence uses, so
 * there is one completion path rather than a first-run copy of it. The state
 * file is reconciled with the journal first, because a crash can leave either
 * one ahead of the other.
 */
async function completeRecovery(input: RunPicoCompanionFirstRunInput & {
  daemonClient: PicoVaultDaemonClient;
  journalPath: string;
  statePath: string;
  journal: PicoCompanionFirstRunJournal & { step: 'submitted' };
}): Promise<
  | { status: 'completed'; journal: PicoCompanionFirstRunJournal }
  | { status: 'unfinished'; outcome: PicoCompanionFirstRunOutcome }
> {
  const binding = input.journal.binding;
  const pending = input.journal.pending;
  const profile = picoCompanionFirstRunProfile(binding);

  const existing = readPicoCompanionRecoveryState(input.statePath);
  if (existing?.status === 'completed') {
    // The check completed but the journal advance did not survive; the receipt
    // is durable public state, so the run continues from it.
    return {
      status: 'completed',
      journal: advancePicoCompanionFirstRunJournal(input.journalPath, {
        schema: picoCompanionFirstRunJournalSchema,
        step: 'completed',
        binding,
        receipt: existing.receipt,
      }),
    };
  }
  if (existing === null
    || existing.pending.recoveryId !== pending.recoveryId) {
    writePendingState(input.statePath, pending);
  }

  const targetLinkClient = await createPicoCompanionLinkClient({
    profile,
    daemonClient: input.daemonClient,
    sodium: input.sodium,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });
  const check = await checkPicoCompanionRecoveryCompletion({
    statePath: input.statePath,
    profile,
    targetLinkClient,
    notifications: input.notifications,
    ...(input.now === undefined ? {} : { now: input.now }),
  });

  if (check.status === 'waiting') {
    return {
      status: 'unfinished',
      outcome: { status: 'awaiting_window', pending: check.pending },
    };
  }
  if (check.status === 'blocked') {
    return {
      status: 'unfinished',
      outcome: {
        status: 'blocked',
        pending: check.pending,
        reason: check.reason,
      },
    };
  }
  if (check.status !== 'completed') {
    throw new Error(`first_run_completion_unexpected:${check.status}`);
  }
  return {
    status: 'completed',
    journal: advancePicoCompanionFirstRunJournal(input.journalPath, {
      schema: picoCompanionFirstRunJournalSchema,
      step: 'completed',
      binding,
      receipt: check.receipt,
    }),
  };
}

/**
 * The commit. The profile is written first because it is what makes this
 * device real; the keystore binding is an optimisation on top of it and its
 * absence is recorded rather than hidden, since a crash takes the passphrase
 * with it and automatic unlock must then stay off.
 */
async function commitFirstRun(input: RunPicoCompanionFirstRunInput & {
  journalPath: string;
  journal: PicoCompanionFirstRunJournal & { step: 'completed' };
}): Promise<PicoCompanionFirstRunJournal> {
  const profile = picoCompanionFirstRunProfile(input.journal.binding);
  writePicoCompanionProfile(input.profilePath, profile);

  let platformUnlockBound = false;
  if (input.platformSecrets !== undefined) {
    // Awaited, seit der Android-Port existiert: dort liegt der Keystore
    // hinter einer Prozessgrenze. Ohne `await` wäre der Fehlschlag eine
    // unbehandelte Rejection und `platformUnlockBound` trotzdem `true` -
    // also genau die Behauptung, die der Journaleintrag nicht machen darf.
    await writePicoCompanionPlatformUnlock({
      path: input.platformUnlockPath
        ?? defaultPicoCompanionPlatformUnlockPath(input.profilePath),
      profile,
      passphrase: input.secrets.passphrase,
      secrets: input.platformSecrets,
    });
    platformUnlockBound = true;
  }

  return advancePicoCompanionFirstRunJournal(input.journalPath, {
    schema: picoCompanionFirstRunJournalSchema,
    step: 'committed',
    binding: input.journal.binding,
    receipt: input.journal.receipt,
    platformUnlockBound,
  });
}

function firstRunUnlocks(
  binding: PicoCompanionFirstRunBinding,
  passphrase: string,
): Array<{
  keyRole: 'pico_identity' | 'device_signing' | 'device_key_agreement';
  keyFingerprintHex: string;
  passphrase: string;
}> {
  return [
    {
      keyRole: 'pico_identity',
      keyFingerprintHex: binding.identity.keyFingerprintHex,
      passphrase,
    },
    {
      keyRole: 'device_signing',
      keyFingerprintHex: binding.device.signingKeyFingerprintHex,
      passphrase,
    },
    {
      keyRole: 'device_key_agreement',
      keyFingerprintHex: binding.device.keyAgreementKeyFingerprintHex,
      passphrase,
    },
  ];
}

function writePendingState(
  statePath: string,
  pending: PicoHomeDeviceRecoveryPendingView,
): void {
  writePicoCompanionRecoveryState(statePath, {
    schema: picoCompanionRecoveryStateSchema,
    status: 'pending',
    pending,
  });
}

/**
 * A profile that exists but does not parse is a damaged install, not a first
 * run, and must surface as an error rather than silently starting over on a
 * vault that already belongs to a Home.
 */
function readProfileIfPresent(path: string): PicoCompanionProfile | null {
  return existsSync(path) ? readPicoCompanionProfile(path) : null;
}

function journalPathOf(paths: PicoCompanionFirstRunPaths): string {
  return paths.journalPath
    ?? defaultPicoCompanionFirstRunJournalPath(paths.profilePath);
}

/**
 * The delegation id is this device's own name for its membership, so it is
 * generated locally and randomly rather than derived from the card - two
 * devices recovering from the same card must not collide.
 */
function firstRunDelegationId(sodium: VaultSodium): string {
  return `pico-companion-first-run-${hex(sodium.randombytes_buf(16))}`;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// The bound is `@pico/vault`'s, where a passphrase becomes a keyfile; the
// refusal stays this surface's own, because a person who is told no should
// hear it in the vocabulary of what they were doing.
function assertPassphrase(value: unknown): asserts value is string {
  if (!isPicoVaultPassphrase(value)) {
    throw new Error('invalid_first_run_passphrase');
  }
}
