import { execFile } from 'node:child_process';
import type {
  PicoCompanionNotificationAdapter,
  PicoCompanionPendingRecoveryAlarm,
} from './alarm-carrier.js';

/**
 * ADR 0112: the alarm is loud - color, symbol and text, interrupting, never
 * a badge. On Linux that is a critical-urgency desktop notification; the
 * Electron shell supplies its own adapter at C2. Fingerprints are shortened
 * for display only (ADR 0079 I5); no security comparison happens here.
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
    body: `Identity ${displayFingerprint(alarm.picoIdentityFingerprintHex)} `
      + 'is being recovered onto another device. '
      + `Target device ${displayFingerprint(pending.targetDeviceSigningKeyFingerprintHex)} `
      + `becomes that identity's only device at ${pending.effectiveAt} `
      + 'and every other device is revoked then. '
      + 'If this is not you, veto now from any active device '
      + `(recovery ${pending.recoveryId}).`,
  };
}

export function createLinuxNotifySendAdapter(
  options: LinuxNotifySendAdapterOptions = {},
): PicoCompanionNotificationAdapter {
  const command = options.command ?? 'notify-send';
  return {
    notifyPendingRecovery: async (alarm) => {
      const { title, body } = renderPicoCompanionPendingRecoveryAlarm(alarm);
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
    },
  };
}

function displayFingerprint(fingerprintHex: string): string {
  return `${fingerprintHex.slice(0, 8)}…${fingerprintHex.slice(-8)}`;
}
