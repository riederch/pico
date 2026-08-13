import type { PicoHomeDeviceRecoveryPendingView } from '@pico/protocol';
import {
  decidePicoLinkPush,
  type PicoLinkPushLedgerEntry,
  type PicoLinkPushOccasion,
} from './link-push-floor.js';
import type { PicoLinkMailboxRecord } from './event-store.js';

/**
 * ADR 0150 PU5 - when a Home notices that looking now beats looking in six
 * hours.
 *
 * **The decision this file actually makes is *who*.** A recovery is about one
 * device, and that device is not the one to tell: ADR 0110's objection is
 * raised by a device the person still holds, and the target is the one being
 * enrolled - usually because the person no longer has the old one. Pushing to
 * the target would be telling the wrong side about its own arrival, and the
 * side that could object would hear nothing.
 *
 * So the occasion is read per *other* device, and the recovery's own target is
 * excluded by name rather than by happening not to have a mailbox yet. It
 * usually will not have one - a device being recovered onto has exchanged
 * nothing - and "usually" is not a rule.
 */

/**
 * How close a window has to be to closing before that becomes the occasion.
 *
 * Two hours, against the six-hour poll: a person whose next scheduled look is
 * further away than the window has left would find out afterwards, which is
 * the failure ADR 0112 exists to prevent. Sooner than that and the first push
 * has already said what there is to say.
 */
export const picoLinkPushWindowNoticeMs = 2 * 60 * 60 * 1_000;

export interface PicoLinkPushCandidate {
  mailbox: PicoLinkMailboxRecord;
  occasion: PicoLinkPushOccasion;
  /** The recovery this is about. Never leaves the Home. */
  eventId: string;
}

/**
 * ADR 0150 PU5. Which devices should be pushed now, and about what.
 *
 * Pure over what it is handed, so the two judgements it makes - who, and which
 * occasion - are provable without a relay, a clock or a Home.
 *
 * A device gets at most one candidate. When a window is closing *and* the
 * recovery is pending, the closing window wins: it is the one whose lateness
 * cannot be recovered from, and both would be one push anyway under the floor.
 */
export function picoLinkPushCandidates(input: {
  mailboxes: readonly PicoLinkMailboxRecord[];
  /** The pending recovery for one identity, or null. Read per identity. */
  pendingRecoveryFor: (picoIdentityFingerprintHex: string) => PicoHomeDeviceRecoveryPendingView | null;
  ledger: readonly PicoLinkPushLedgerEntry[];
  nowMs: number;
}): readonly PicoLinkPushCandidate[] {
  const candidates: PicoLinkPushCandidate[] = [];

  for (const mailbox of input.mailboxes) {
    const pending = input.pendingRecoveryFor(mailbox.picoIdentityFingerprintHex);
    if (pending === null) {
      continue;
    }
    if (pending.targetDeviceSigningKeyFingerprintHex === mailbox.deviceSigningKeyFingerprintHex) {
      // The device being recovered onto. Telling it about its own arrival
      // would leave the side that could object hearing nothing.
      continue;
    }

    const effectiveAtMs = Date.parse(pending.effectiveAt);
    if (effectiveAtMs <= input.nowMs) {
      // The window has closed. There is nothing left to object to, so a push
      // would wake a device to tell it about something it can no longer act
      // on - which is noise wearing the shape of an alarm.
      continue;
    }

    const occasion: PicoLinkPushOccasion =
      effectiveAtMs - input.nowMs <= picoLinkPushWindowNoticeMs
        ? 'objection_window_closing'
        : 'device_recovery_pending';

    const decision = decidePicoLinkPush({
      ledger: input.ledger,
      deviceSigningKeyFingerprintHex: mailbox.deviceSigningKeyFingerprintHex,
      occasion,
      eventId: pending.recoveryId,
      nowMs: input.nowMs,
    });
    if (decision.push) {
      candidates.push(Object.freeze({ mailbox, occasion, eventId: pending.recoveryId }));
    }
  }

  return Object.freeze(candidates);
}
