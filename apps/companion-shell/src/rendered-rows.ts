import { picoCompanionDisplayFingerprint } from '@pico/companion/fingerprint';
import {
  picoCompanionCalendarDaysUntil,
  picoCompanionDisplayDate,
} from '@pico/companion/when';
import type { PicoCompanionDeviceView } from '@pico/companion/presence';
import type { PicoCompanionDeviceAuthorityView } from '@pico/companion/device-lifecycle';
import type { PicoCompanionHomeMember as PicoCompanionCoreHomeMember }
  from '@pico/companion/home-authority';
import type {
  PicoCompanionDevice,
  PicoCompanionDeviceAuthority,
  PicoCompanionHomeMember,
  PicoCompanionModelProvider,
} from './contract.js';

/**
 * The seam ADR 0113 C2 describes, given a name (2026-08-20).
 *
 * The window receives rendered presentation state. A fingerprint cut to
 * sixteen characters and an instant cut to a calendar day are both
 * *renderings*, and both used to happen in the renderer - which cannot reach
 * the rules that decide them, because renderer-reachable files resolve
 * relative paths only. So the rows are rendered here, in the main process,
 * on their way across.
 *
 * It is a module rather than four expressions inside the IPC handlers
 * because the real-process tests drive the same core reads and would
 * otherwise re-implement this mapping to check what a window shows - and a
 * test that re-implements the thing it tests is measuring its own copy.
 */

export function picoCompanionRenderedDevices(
  devices: readonly PicoCompanionDeviceView[],
): readonly PicoCompanionDevice[] {
  return devices.map((device) => ({
    ...device,
    lastSeenDisplay: picoCompanionDisplayDate(device.lastSeenAt),
  }));
}

export function picoCompanionRenderedDeviceAuthority(
  view: PicoCompanionDeviceAuthorityView,
): { mayEndAuthority: boolean; devices: readonly PicoCompanionDeviceAuthority[] } {
  return {
    ...view,
    devices: view.devices.map((device) => ({
      ...device,
      validUntilDisplay: picoCompanionDisplayDate(device.validUntil),
      /**
       * Counted here rather than in the window, for the reason the day is
       * rendered here: the window cannot reach the rule, and counting
       * twenty-four hour blocks instead put "That is today" under "until
       * 2027-01-02". It is as fresh as the read that carried it, which is
       * also true of the date beside it and of every other word in the row.
       */
      daysRemaining: picoCompanionCalendarDaysUntil(device.validUntil),
    })),
  };
}

export function picoCompanionRenderedHomeMembers(
  members: readonly PicoCompanionCoreHomeMember[],
): readonly PicoCompanionHomeMember[] {
  return members.map((member) => ({
    ...member,
    picoIdentityDisplay: picoCompanionDisplayFingerprint(member.picoIdentityFingerprintHex),
    // `null` stays `null`: a place that does not end has no day to show, and
    // an empty string here would render as a sentence with a hole in it.
    validUntilDisplay: member.validUntil === null
      ? null
      : picoCompanionDisplayDate(member.validUntil),
  }));
}

export function picoCompanionRenderedProviders(
  providers: readonly Omit<PicoCompanionModelProvider, 'measuredDisplay'>[],
): readonly PicoCompanionModelProvider[] {
  return providers.map((provider) => ({
    ...provider,
    measuredDisplay: picoCompanionDisplayDate(provider.measuredAt),
  }));
}
