import type {
  PicoClockDivergence,
  PicoHomeDeviceRecoveryPendingView,
  PicoHomeStorageConditionView,
} from '@pico/protocol';
import type { PicoHomeDueEntriesView } from '@pico/protocol/time-bound-entry';
import type {
  PicoCompanionDueEntriesReader,
  PicoCompanionDueEntryAcknowledger,
  PicoCompanionStorageReader,
} from './storage-reader.js';

/**
 * ADR 0113 C1: the ADR 0112 S2 alarm carrier as shell-free service core.
 *
 * The contract it implements: check the authenticated lifecycle read on
 * start and at least every six hours while running, re-check immediately on
 * wake/network-regain (the shell calls {@link PicoCompanionAlarmCarrier.checkNow}),
 * and while a pending recovery exists raise the loud alarm on every check -
 * the alarm stays armed, a dismissed notification re-raises. Read failures
 * never stop the carrier; they are counted and visible.
 */

export interface PicoCompanionLifecycleSnapshot {
  /**
   * The identity the read was performed as. ADR 0112 requires the alarm to
   * state *which* identity is being recovered, and carrying it on the
   * snapshot keeps that answer tied to the read it came from instead of to a
   * separate setting that could drift.
   */
  picoIdentityFingerprintHex: string;
  /** ADR 0086. Welches Home geantwortet hat - eine Domäne wird darauf signiert. */
  homeId: string;
  pendingRecovery: PicoHomeDeviceRecoveryPendingView | null;
  /** ADR 0120 N5. Clock movement the Home detected, when it reports any. */
  clockDivergence?: PicoClockDivergence | null;
}

export interface PicoCompanionClockDivergenceAlarm {
  picoIdentityFingerprintHex: string;
  divergence: PicoClockDivergence;
  /** The objection window the movement touches. */
  pending: PicoHomeDeviceRecoveryPendingView;
}

export interface PicoCompanionPendingRecoveryAlarm {
  picoIdentityFingerprintHex: string;
  pending: PicoHomeDeviceRecoveryPendingView;
}

export type PicoCompanionLifecycleReader =
  () => Promise<PicoCompanionLifecycleSnapshot>;

export interface PicoCompanionNotificationAdapter {
  notifyPendingRecovery(
    alarm: PicoCompanionPendingRecoveryAlarm,
  ): void | Promise<void>;
  /**
   * Optional shell presentation hook. It is deliberately narrower than a
   * generic state channel: a successful lifecycle read may disarm only the
   * pending-recovery presentation it previously raised.
   */
  clearPendingRecovery?(): void | Promise<void>;
  /**
   * ADR 0120 N5. Raised only where movement touches an objection window: a
   * clock that moved while nothing was waiting on it is a log line, not an
   * interruption. Pico never re-bases the window onto the new time, so what
   * the person hears is that it happened - the attempt is more interesting
   * than the correction.
   */
  notifyClockDivergence?(
    alarm: PicoCompanionClockDivergenceAlarm,
  ): void | Promise<void>;
  /**
   * ADR 0119 Q5 with ADR 0118 O4. The Home's storage condition, reported on
   * the same cadence rather than on a second schedule - ADR 0118 reuses this
   * hook precisely so absence does not grow its own scheduler.
   *
   * Called only after a *successful* read. A failed read never arrives here,
   * because it is not evidence the problem went away: silence would clear a
   * standing condition on nothing more than a broken channel.
   */
  reportStorageCondition?(
    view: PicoHomeStorageConditionView,
  ): void | Promise<void>;
  /**
   * ADR 0118 O1. Which entries are due, on the same cadence for the same
   * reason: absence and waiting work both ride the hook that already exists.
   *
   * Reported only after a successful read - an empty list from a broken
   * channel would say nothing is waiting when nobody looked.
   */
  reportDueEntries?(
    view: PicoHomeDueEntriesView,
  ): Promise<PicoCompanionDueEntriesTold | void> | void;
  /**
   * ADR 0118 O4. Whether the model this person decided on is answering.
   *
   * Reported only after a successful read, like the others, and `undefined`
   * travels rather than being turned into `true`: not knowable and fine are
   * different, and only one of them should clear a standing condition.
   */
  reportModelReachability?(reachable: boolean | undefined): void | Promise<void>;
  /**
   * ADR 0131 A7. Whether the authenticated lifecycle read reached the Home.
   *
   * Reported on every check, in both directions, because this is a state and
   * not an edge - and because it was previously reported nowhere at all: a
   * failed read incremented a counter in {@link PicoCompanionAlarmCarrierStatus}
   * that nothing outside this file ever read, so a Home nobody could reach
   * presented exactly like a Home with nothing to say.
   *
   * `undefined` is in the signature to match the other reports, not because
   * this carrier produces it: it either completed a read or it did not.
   */
  reportHomeReachable?(reachable: boolean | undefined): void | Promise<void>;
}

/**
 * ADR 0118 O1. Which entries the person was actually shown.
 *
 * **The surface says this, and nothing else can.** It is the only party that
 * knows what it put in front of somebody: the list carries fifty entries and a
 * notification names one, so acknowledging the list would mark forty-nine
 * entries told whose existence was summarised and whose identity was never
 * shown. Those would never be offered again - the silent failure this family
 * calls worse than never recording anything.
 */
export interface PicoCompanionDueEntriesTold {
  /** Memory item ids the person was actually shown, empty when nothing was. */
  told: readonly string[];
}

export interface StartPicoCompanionAlarmCarrierInput {
  readLifecycle: PicoCompanionLifecycleReader;
  /**
   * ADR 0119 Q5. Optional: a Home that does not answer the storage operation,
   * or a companion built before it existed, keeps working and simply says
   * nothing about storage.
   */
  readStorageCondition?: PicoCompanionStorageReader;
  /** ADR 0118 O1. Optional, like the storage read. */
  readDueEntries?: PicoCompanionDueEntriesReader;
  /**
   * ADR 0118 O4. Optional for the same reason: a Home that does not answer the
   * provider read leaves `no_model` unstated rather than false.
   */
  readModelReachability?: () => Promise<boolean | undefined>;
  /**
   * ADR 0118 O1. Tells the Home that an entry reached the person.
   *
   * Optional for the same reason the reads are: a Home built before the
   * operation existed refuses it, and a companion that could not acknowledge
   * still shows what is due. The cost of not having it is repetition.
   */
  acknowledgeDueEntry?: PicoCompanionDueEntryAcknowledger;
  notifications: PicoCompanionNotificationAdapter;
  /** Defaults to the pinned six hours; anything longer violates ADR 0112. */
  checkIntervalMs?: number;
  now?: () => Date;
}

export interface PicoCompanionAlarmCheck {
  status: 'pending_recovery' | 'clear' | 'read_failed' | 'notify_failed';
  pendingRecovery: PicoHomeDeviceRecoveryPendingView | null;
  checkedAt: string;
}

export interface PicoCompanionAlarmCarrierStatus {
  alarmActive: boolean;
  lastCheck: PicoCompanionAlarmCheck | null;
  checks: number;
  readFailures: number;
  consecutiveReadFailures: number;
  notifyFailures: number;
  /** ADR 0119 Q5. Counted separately: storage is secondary to the alarm. */
  storageReadFailures: number;
  /** ADR 0118 O1. Counted separately for the same reason. */
  dueEntriesReadFailures: number;
  /**
   * ADR 0118 O1. Acknowledgements the Home refused or that never arrived.
   *
   * Counted rather than retried here: the entry stays outstanding and comes
   * back on the next check, which is a retry that costs nothing and cannot
   * lose the entry if this device never runs again.
   */
  dueEntryAcknowledgeFailures: number;
  /** ADR 0118 O4. Counted separately: the model is secondary to the alarm. */
  modelReadFailures: number;
}

export interface PicoCompanionAlarmCarrier {
  /** The wake/network-regain hook; joins an in-flight check instead of stacking. */
  checkNow(): Promise<PicoCompanionAlarmCheck>;
  status(): PicoCompanionAlarmCarrierStatus;
  stop(): void;
}

export const picoCompanionAlarmCheckIntervalMs = 6 * 60 * 60 * 1_000;

export async function startPicoCompanionAlarmCarrier(
  input: StartPicoCompanionAlarmCarrierInput,
): Promise<PicoCompanionAlarmCarrier> {
  const intervalMs = input.checkIntervalMs ?? picoCompanionAlarmCheckIntervalMs;
  if (
    !Number.isSafeInteger(intervalMs)
    || intervalMs <= 0
    || intervalMs > picoCompanionAlarmCheckIntervalMs
  ) {
    throw new Error('invalid_alarm_check_interval');
  }
  const now = input.now ?? (() => new Date());

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let inFlight: Promise<PicoCompanionAlarmCheck> | null = null;
  const status: PicoCompanionAlarmCarrierStatus = {
    alarmActive: false,
    lastCheck: null,
    checks: 0,
    readFailures: 0,
    consecutiveReadFailures: 0,
    notifyFailures: 0,
    storageReadFailures: 0,
    dueEntriesReadFailures: 0,
    dueEntryAcknowledgeFailures: 0,
    modelReadFailures: 0,
  };

  /**
   * ADR 0119 Q5. Runs beside the lifecycle read and can never fail it: the
   * alarm is the reason this carrier exists, and a storage read that cannot
   * complete must not suppress a pending-recovery notification.
   */
  const readStorage = async (): Promise<void> => {
    if (input.readStorageCondition === undefined) {
      return;
    }
    let view: PicoHomeStorageConditionView;
    try {
      view = await input.readStorageCondition();
    } catch {
      // Counted, and deliberately not reported. A failed read is not evidence
      // that a standing condition cleared, so nothing is said and whatever the
      // person was last told still stands.
      status.storageReadFailures += 1;
      return;
    }
    try {
      await input.notifications.reportStorageCondition?.(view);
    } catch {
      status.notifyFailures += 1;
    }
  };

  /** ADR 0118 O1. Same posture as the storage read: never fails the alarm. */
  const readDue = async (): Promise<void> => {
    if (input.readDueEntries === undefined) {
      return;
    }
    let view: PicoHomeDueEntriesView;
    try {
      view = await input.readDueEntries();
    } catch {
      status.dueEntriesReadFailures += 1;
      return;
    }
    let told: PicoCompanionDueEntriesTold | void;
    try {
      told = await input.notifications.reportDueEntries?.(view);
    } catch {
      status.notifyFailures += 1;
      // **Nothing is acknowledged here, and that is the point.** A report that
      // threw is a person who was not told, and the earlier version of this
      // family marked an entry raised before the surface had taken it.
      return;
    }
    if (told === undefined || told === null || input.acknowledgeDueEntry === undefined) {
      return;
    }
    for (const memoryItemId of told.told) {
      try {
        await input.acknowledgeDueEntry(memoryItemId);
      } catch {
        status.dueEntryAcknowledgeFailures += 1;
      }
    }
  };

  /**
   * ADR 0118 O4. Same posture as the other two: never fails the alarm, and a
   * failed read says nothing rather than clearing what stands.
   */
  const readModel = async (): Promise<void> => {
    if (input.readModelReachability === undefined) {
      return;
    }
    let reachable: boolean | undefined;
    try {
      reachable = await input.readModelReachability();
    } catch {
      status.modelReadFailures += 1;
      return;
    }
    try {
      await input.notifications.reportModelReachability?.(reachable);
    } catch {
      status.notifyFailures += 1;
    }
  };

  /**
   * ADR 0131 A7. The same posture as the reports above - a broken notifier is
   * counted, never fatal - for the one fact this carrier already knew and
   * told nobody.
   */
  const tellHomeReachable = async (reachable: boolean): Promise<void> => {
    try {
      await input.notifications.reportHomeReachable?.(reachable);
    } catch {
      status.notifyFailures += 1;
    }
  };

  const performCheck = async (): Promise<PicoCompanionAlarmCheck> => {
    const checkedAt = now().toISOString();
    await readStorage();
    await readDue();
    await readModel();
    let snapshot: PicoCompanionLifecycleSnapshot;
    try {
      snapshot = await input.readLifecycle();
    } catch {
      status.readFailures += 1;
      status.consecutiveReadFailures += 1;
      await tellHomeReachable(false);
      const check: PicoCompanionAlarmCheck = {
        status: 'read_failed',
        pendingRecovery: null,
        checkedAt,
      };
      status.lastCheck = check;
      return check;
    }
    status.consecutiveReadFailures = 0;
    await tellHomeReachable(true);

    const pending = snapshot.pendingRecovery;
    if (pending === null) {
      status.alarmActive = false;
      try {
        await input.notifications.clearPendingRecovery?.();
      } catch {
        // Clearing presentation state is notification work too. A failed
        // shell adapter is visible and retried on the next successful read;
        // it must not turn a clear signed lifecycle view into an active alarm.
        status.notifyFailures += 1;
      }
      const check: PicoCompanionAlarmCheck = {
        status: 'clear',
        pendingRecovery: null,
        checkedAt,
      };
      status.lastCheck = check;
      return check;
    }

    status.alarmActive = true;
    let notified = true;
    try {
      await input.notifications.notifyPendingRecovery({
        picoIdentityFingerprintHex: snapshot.picoIdentityFingerprintHex,
        pending,
      });
      // ADR 0120 N5. Only here, inside the pending branch: this is the point
      // where movement touches an objection window.
      if (snapshot.clockDivergence !== undefined
        && snapshot.clockDivergence !== null) {
        await input.notifications.notifyClockDivergence?.({
          picoIdentityFingerprintHex: snapshot.picoIdentityFingerprintHex,
          divergence: snapshot.clockDivergence,
          pending,
        });
      }
    } catch {
      // A broken notifier must not stop the carrier; the failure stays
      // visible and the next check tries again.
      status.notifyFailures += 1;
      notified = false;
    }
    const check: PicoCompanionAlarmCheck = {
      status: notified ? 'pending_recovery' : 'notify_failed',
      pendingRecovery: pending,
      checkedAt,
    };
    status.lastCheck = check;
    return check;
  };

  const runCheck = async (): Promise<PicoCompanionAlarmCheck> => {
    if (inFlight !== null) {
      return await inFlight;
    }
    inFlight = performCheck().finally(() => {
      inFlight = null;
    });
    status.checks += 1;
    return await inFlight;
  };

  const schedule = (): void => {
    if (stopped) {
      return;
    }
    timer = setTimeout(() => {
      void runCheck().finally(schedule);
    }, intervalMs);
    // The companion must never keep a process alive on its own account.
    timer.unref();
  };

  await runCheck();
  schedule();

  return {
    checkNow: async () => await runCheck(),
    status: () => ({ ...status, lastCheck: status.lastCheck }),
    stop: () => {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
