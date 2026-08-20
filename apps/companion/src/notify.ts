import { execFile } from 'node:child_process';
import type {
  PicoCompanionClockDivergenceAlarm,
  PicoCompanionNotificationAdapter,
  PicoCompanionPendingRecoveryAlarm,
} from './alarm-carrier.js';
import { picoCompanionDisplayFingerprint } from './fingerprint.js';
import type {
  PicoCompanionHostContinuityAlarm,
  PicoCompanionHostContinuityNotifications,
  PicoCompanionHostRotationNotice,
} from './host-repin.js';

/**
 * ADR 0112: the alarm is loud - color, symbol and text, interrupting, never
 * a badge. On Linux that is a critical-urgency desktop notification; the
 * Electron shell supplies its own adapter at C2. Fingerprints are shortened
 * for display only (ADR 0079 I5) by the one rule this client has for that,
 * `fingerprint.ts`; no security comparison happens here.
 *
 * ADR 0115 U4 rides the same adapter: the M3 rotation notice after a
 * verified re-pin, and the continuity alarm when this device could not
 * verify its Home and stayed on the old pin. Both are loud by the user's
 * decision - the rotation notice because it retires every printed Recovery
 * Card, the continuity alarm because it may mean an impersonating host.
 */

export interface LinuxNotifySendAdapterOptions {
  /** Overridable for tests; defaults to `notify-send` on PATH. */
  command?: string;
}

export function renderPicoCompanionPendingRecoveryAlarm(
  alarm: PicoCompanionPendingRecoveryAlarm,
): { title: string; body: string } {
  const { pending } = alarm;
  return {
    title: 'Pico: device recovery pending',
    // ADR 0112 pins what this must state from the signed pending view: which
    // identity, which target device, and when it becomes effective. A person
    // with more than one Pico cannot act on an alarm that does not say whose
    // it is.
    body: `Identity ${picoCompanionDisplayFingerprint(alarm.picoIdentityFingerprintHex)} `
      + 'is being recovered onto another device. '
      + `Target device ${picoCompanionDisplayFingerprint(pending.targetDeviceSigningKeyFingerprintHex)} `
      + `becomes that identity's only device at ${pending.effectiveAt} `
      + 'and every other device is revoked then. '
      + 'If this is not you, veto now from any active device '
      + `(recovery ${pending.recoveryId}).`,
  };
}

export function renderPicoCompanionHostRotationNotice(
  notice: PicoCompanionHostRotationNotice,
): { title: string; body: string } {
  return {
    title: 'Pico: Home host keys rotated',
    // The M3 notice states what was verified and what the rotation retires:
    // the chain was proven from this device's own pin, and every Recovery
    // Card printed for the old keys is stale (ADR 0110/0115).
    body: 'Your Pico Home rotated its host keys from '
      + `${picoCompanionDisplayFingerprint(notice.previousHostSigningKeyFingerprintHex)} to `
      + `${picoCompanionDisplayFingerprint(notice.hostSigningKeyFingerprintHex)}. `
      + 'This device verified the signed continuity chain against its own '
      + 'pins and follows the new keys. '
      + 'Recovery Cards printed before this rotation are stale - re-issue '
      + 'them.',
  };
}

export function renderPicoCompanionHostContinuityAlarm(
  alarm: PicoCompanionHostContinuityAlarm,
): { title: string; body: string } {
  return {
    title: 'Pico: cannot verify your Home',
    body: `The Pico Home at ${alarm.coreUrl} no longer accepts this `
      + 'device\'s pinned keys, and no verifiable continuity chain explains '
      + `why (${alarm.reason}). `
      + 'This device deliberately keeps its old pins. This can be a '
      + 'half-completed rotation - or something impersonating your Home. '
      + 'Verify your Home before trusting anything it shows you.',
  };
}

/**
 * ADR 0120 N5. What the person is told is that it happened, not what Pico did
 * about it - because Pico did not re-base the window, and the attempt is the
 * interesting part. The wait may therefore be longer than the calendar
 * suggests, which is the honest consequence of measuring observed time.
 */
export function renderPicoCompanionClockDivergenceAlarm(
  alarm: PicoCompanionClockDivergenceAlarm,
): { title: string; body: string } {
  const hours = Math.round(alarm.divergence.differenceMs / (60 * 60 * 1_000));
  const movement = alarm.divergence.kind === 'wall_behind_monotonic'
    || alarm.divergence.kind === 'wall_behind_anchor_floor'
    ? 'backwards'
    : 'forwards';
  return {
    title: 'Pico: this device\'s clock moved',
    body: `While you have a recovery waiting, this device's clock jumped `
      + `${movement} by about ${hours} hour${hours === 1 ? '' : 's'}. `
      + 'Pico did not shorten or extend your objection window because of it - '
      + `you can still stop recovery ${alarm.pending.recoveryId} until it has `
      + 'genuinely run its course. If you did not change the time yourself, '
      + 'treat this as someone trying to rush that window past you.',
  };
}

export function createLinuxNotifySendAdapter(
  options: LinuxNotifySendAdapterOptions = {},
): PicoCompanionNotificationAdapter & PicoCompanionHostContinuityNotifications {
  const command = options.command ?? 'notify-send';
  const send = async (title: string, body: string): Promise<void> => {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      execFile(command, [
        '--urgency=critical',
        '--app-name=Pico',
        '--icon=dialog-warning',
        title,
        body,
      ], (error) => {
        if (error === null) {
          resolvePromise();
        } else {
          rejectPromise(new Error(`notify_send_failed:${error.message}`));
        }
      });
    });
  };
  return {
    notifyPendingRecovery: async (alarm) => {
      const { title, body } = renderPicoCompanionPendingRecoveryAlarm(alarm);
      await send(title, body);
    },
    notifyHostKeysRotated: async (notice) => {
      const { title, body } = renderPicoCompanionHostRotationNotice(notice);
      await send(title, body);
    },
    notifyHostContinuityUnverified: async (alarm) => {
      const { title, body } = renderPicoCompanionHostContinuityAlarm(alarm);
      await send(title, body);
    },
    notifyClockDivergence: async (alarm) => {
      const { title, body } = renderPicoCompanionClockDivergenceAlarm(alarm);
      await send(title, body);
    },
  };
}

