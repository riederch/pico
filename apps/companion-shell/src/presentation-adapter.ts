import {
  type PicoCompanionClockDivergenceAlarm,
  type PicoCompanionNotificationAdapter,
  type PicoCompanionPendingRecoveryAlarm,
} from '@pico/companion/alarm-carrier';
import {
  type PicoCompanionHostContinuityAlarm,
  type PicoCompanionHostContinuityNotifications,
  type PicoCompanionHostRotationNotice,
} from '@pico/companion/host-repin';
import {
  renderPicoCompanionClockDivergenceAlarm,
  renderPicoCompanionHostContinuityAlarm,
  renderPicoCompanionHostRotationNotice,
  renderPicoCompanionPendingRecoveryAlarm,
} from '@pico/companion/notify';
import {
  type PicoCompanionRecoveryNotifications,
} from '@pico/companion/recovery-controller';
import type { PicoHomeDueEntriesView } from '@pico/protocol/time-bound-entry';
import {
  parsePicoCompanionPresentation,
  picoCompanionConditionsFor,
  picoCompanionIdlePresentation,
  type PicoCompanionCondition,
  type PicoCompanionPresentation,
  type PicoCompanionPresentationInput,
} from './contract.js';

export interface PicoCompanionPresentationPort {
  present(state: PicoCompanionPresentation): void | Promise<void>;
  notify(state: PicoCompanionPresentation): void | Promise<void>;
}

export type PicoCompanionShellNotifications = PicoCompanionNotificationAdapter
  & PicoCompanionHostContinuityNotifications
  & PicoCompanionRecoveryNotifications
  & {
    /** ADR 0118 O1. Something is due; see the adapter for what it can say. */
    reportDueEntries(view: PicoHomeDueEntriesView): Promise<void>;
    /**
     * ADR 0118 O4. Network reachability is a local device fact the shell
     * observes, not something the carrier reads from the Home - so it enters
     * here rather than through the carrier's notification contract.
     */
    reportNetworkState(online: boolean): Promise<void>;
  };

export function createPicoCompanionPresentationAdapter(
  port: PicoCompanionPresentationPort,
  now: () => Date = () => new Date(),
): PicoCompanionShellNotifications {
  let currentKind: PicoCompanionPresentation['kind'] = 'starting';

  /**
   * ADR 0118 O4. Conditions are ambient, not events: they are true between
   * notifications rather than at one. So they are held here and stamped onto
   * every presentation that goes out, instead of each builder having to
   * remember them.
   */
  let conditions: readonly PicoCompanionCondition[] = [];
  let lastPublished: PicoCompanionPresentationInput | null = null;

  /**
   * The facts observed so far, kept rather than the conditions derived from
   * them. Each reporter knows one fact, and conditions have to *compose*: a
   * storage report that replaced the whole list would silently drop a standing
   * `no_network`, and the person would watch one absence erase another.
   *
   * An unset field states nothing, which is not the same as stating that all
   * is well - nobody looked yet.
   */
  const observed: Parameters<typeof picoCompanionConditionsFor>[0] = {};

  const observe = async (
    fact: Parameters<typeof picoCompanionConditionsFor>[0],
  ): Promise<void> => {
    Object.assign(observed, fact);
    const next = picoCompanionConditionsFor(observed);
    if (sameConditions(conditions, next)) {
      return;
    }
    conditions = next;
    await publish(lastPublished ?? picoCompanionIdlePresentation(now()), false);
  };

  const publish = async (
    // The input shape, because this parses before it publishes: requiring the
    // parsed shape here would make every builder restate an empty condition
    // list it has nothing to say about.
    state: PicoCompanionPresentationInput,
    notify: boolean,
  ): Promise<void> => {
    lastPublished = state;
    const parsed = parsePicoCompanionPresentation({ ...state, conditions });
    currentKind = parsed.kind;
    await port.present(parsed);
    if (notify) {
      await port.notify(parsed);
    }
  };

  return {
    /**
     * ADR 0119 Q5. A change re-publishes what the person is already looking
     * at, because a condition that only appeared at the next unrelated
     * notification would be told to them late - or, on a quiet Home, never.
     */
    reportStorageCondition: async (view) => {
      await observe({ storage: view.state });
    },
    /** ADR 0118 O4. The shell's own observation, composed with the rest. */
    reportNetworkState: async (online) => {
      await observe({ online });
    },
    /**
     * ADR 0118 O1. States that something is due, and since when.
     *
     * It cannot say *what*: the title is domain content behind custody rules
     * and the Link read does not carry it. So this points the person at their
     * Home rather than pretending to be the reminder itself - a weaker surface
     * than knowing, and the honest one.
     *
     * An empty list clears the presentation only if this is what is currently
     * shown. Overwriting an approval or a pending recovery because nothing is
     * due would replace something that needs a decision with something that
     * does not.
     */
    reportDueEntries: async (view) => {
      if (view.entries.length === 0) {
        if (currentKind === 'time_bound_entry_due') {
          await publish(picoCompanionIdlePresentation(now()), false);
        }
        return;
      }
      const oldest = view.entries.reduce((left, right) =>
        (Date.parse(left.dueAt) <= Date.parse(right.dueAt) ? left : right));
      const count = view.entries.length;
      await publish({
        kind: 'time_bound_entry_due',
        severity: 'warning',
        symbol: '!',
        decision: 'none',
        title: count === 1 ? 'Something you asked for is due' : `${count} entries are due`,
        body: `The oldest was due at ${oldest.dueAt}. `
          + 'Open your Pico Home to see what it is - this device is told that '
          + 'an entry is waiting, not what it says.',
        observedAt: now().toISOString(),
      }, true);
    },
    notifyPendingRecovery: async (alarm: PicoCompanionPendingRecoveryAlarm) => {
      const rendered = renderPicoCompanionPendingRecoveryAlarm(alarm);
      await publish({
        kind: 'pending_recovery',
        severity: 'blocked',
        symbol: '×',
        decision: 'veto_recovery',
        ...rendered,
        observedAt: now().toISOString(),
      }, true);
    },
    clearPendingRecovery: async () => {
      if (currentKind === 'pending_recovery' || currentKind === 'starting') {
        await publish(picoCompanionIdlePresentation(now()), false);
      }
    },
    notifyHostKeysRotated: async (notice: PicoCompanionHostRotationNotice) => {
      const rendered = renderPicoCompanionHostRotationNotice(notice);
      await publish({
        kind: 'host_keys_rotated',
        severity: 'warning',
        symbol: '!',
        decision: 'none',
        ...rendered,
        observedAt: now().toISOString(),
      }, true);
    },
    notifyHostContinuityUnverified: async (
      alarm: PicoCompanionHostContinuityAlarm,
    ) => {
      const rendered = renderPicoCompanionHostContinuityAlarm(alarm);
      await publish({
        kind: 'host_continuity_unverified',
        severity: 'blocked',
        symbol: '×',
        decision: 'none',
        ...rendered,
        observedAt: now().toISOString(),
      }, true);
    },
    // ADR 0120 N5. Loud, because it means someone may be trying to rush an
    // objection window past the person - but not blocking, because the
    // window itself is intact and the veto decision beneath it still stands.
    notifyClockDivergence: async (alarm: PicoCompanionClockDivergenceAlarm) => {
      const rendered = renderPicoCompanionClockDivergenceAlarm(alarm);
      await publish({
        kind: 'clock_divergence',
        severity: 'warning',
        symbol: '!',
        decision: 'none',
        ...rendered,
        observedAt: now().toISOString(),
      }, true);
    },
    presentRecoveryWaiting: async ({ picoIdentityFingerprintHex, pending }) => {
      await publish({
        kind: 'recovery_waiting',
        severity: 'warning',
        symbol: '!',
        decision: 'none',
        title: 'Pico recovery is waiting for the time lock',
        body: `Recovery ${pending.recoveryId} for identity ${shortFingerprint(picoIdentityFingerprintHex)} becomes effective at ${pending.effectiveAt}. Nothing can hurry this wait. Completion will revoke every other device of this identity.`,
        observedAt: now().toISOString(),
      }, false);
    },
    notifyRecoveryCompleted: async ({ picoIdentityFingerprintHex, receipt }) => {
      await publish({
        kind: 'recovery_completed',
        severity: 'active',
        symbol: '●',
        decision: 'none',
        title: 'Pico recovery completed',
        body: `Recovery ${receipt.recoveryId} for identity ${shortFingerprint(picoIdentityFingerprintHex)} completed at ${receipt.completedAt}. Exactly one active device remains: ${shortFingerprint(receipt.targetDeviceSigningKeyFingerprintHex)}. Every other device was revoked and surviving hardware must re-enroll.`,
        observedAt: now().toISOString(),
      }, true);
    },
    notifyRecoveryCompletionBlocked: async ({ pending, reason }) => {
      const explanation = reason === 'vault_locked'
        ? 'Unlock this device\'s Pico Vault; Pico will retry automatically on the next check.'
        : reason === 'completion_window_lapsed'
          ? 'The completion window has lapsed. Recovery must be started again from the Recovery Card.'
          : 'Completion failed safely. The pending recovery remains unchanged and Pico will retry on the next check.';
      await publish({
        kind: 'recovery_completion_blocked',
        severity: 'blocked',
        symbol: '×',
        decision: 'none',
        title: 'Pico recovery needs attention',
        body: `Recovery ${pending.recoveryId} could not complete. ${explanation}`,
        observedAt: now().toISOString(),
      }, true);
    },
  };
}

function sameConditions(
  a: readonly PicoCompanionCondition[],
  b: readonly PicoCompanionCondition[],
): boolean {
  return a.length === b.length
    && a.every((condition, index) => condition.kind === b[index]?.kind
      && condition.remedy === b[index]?.remedy);
}

function shortFingerprint(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}
