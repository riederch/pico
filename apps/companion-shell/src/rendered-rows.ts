import { picoDisplayFingerprint } from '@pico/protocol/fingerprint-display';
import {
  picoCalendarDaysUntil,
  picoDisplayDate,
} from '@pico/protocol/when-display';
import type { PicoCompanionDeviceView } from '@pico/companion/presence';
import type { PicoCompanionDeviceAuthorityView } from '@pico/companion/device-lifecycle';
import type { PicoCompanionModuleConsentView } from '@pico/companion/suppliers';
import type {
  PicoCompanionHomeMember as PicoCompanionCoreHomeMember,
  PicoCompanionDomainReadership as PicoCompanionCoreDomainReadership,
} from '@pico/companion/home-authority';
import type {
  PicoCompanionDevice,
  PicoCompanionDeviceAuthority,
  PicoCompanionDomainReadershipRow,
  PicoCompanionHomeMember,
  PicoCompanionModelProvider,
  PicoCompanionModuleConsentRow,
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
    lastSeenDisplay: picoDisplayDate(device.lastSeenAt),
  }));
}

export function picoCompanionRenderedDeviceAuthority(
  view: PicoCompanionDeviceAuthorityView,
): { mayEndAuthority: boolean; devices: readonly PicoCompanionDeviceAuthority[] } {
  return {
    ...view,
    devices: view.devices.map((device) => ({
      ...device,
      validUntilDisplay: picoDisplayDate(device.validUntil),
      /**
       * Counted here rather than in the window, for the reason the day is
       * rendered here: the window cannot reach the rule, and counting
       * twenty-four hour blocks instead put "That is today" under "until
       * 2027-01-02". It is as fresh as the read that carried it, which is
       * also true of the date beside it and of every other word in the row.
       */
      daysRemaining: picoCalendarDaysUntil(device.validUntil),
    })),
  };
}

export function picoCompanionRenderedHomeMembers(
  members: readonly PicoCompanionCoreHomeMember[],
): readonly PicoCompanionHomeMember[] {
  return members.map((member) => ({
    ...member,
    picoIdentityDisplay: picoDisplayFingerprint(member.picoIdentityFingerprintHex),
    // `null` stays `null`: a place that does not end has no day to show, and
    // an empty string here would render as a sentence with a hole in it.
    validUntilDisplay: member.validUntil === null
      ? null
      : picoDisplayDate(member.validUntil),
  }));
}

export function picoCompanionRenderedProviders(
  providers: readonly Omit<PicoCompanionModelProvider, 'measuredDisplay'>[],
): readonly PicoCompanionModelProvider[] {
  return providers.map((provider) => ({
    ...provider,
    measuredDisplay: picoDisplayDate(provider.measuredAt),
  }));
}

/**
 * ADR 0082 mit ADR 0130 E5. Wer welche Domäne lesen darf, auf dem Weg ins
 * Fenster: zwei Fingerabdrücke gekürzt, ein Zeitpunkt auf einen Kalendertag.
 * Die `domainAuthorityId` reist ungekürzt mit, weil ein Widerruf sie nennt und
 * sie kein Schlüssel ist, den jemand vergleicht.
 */
export function picoCompanionRenderedDomainReadership(
  domains: readonly PicoCompanionCoreDomainReadership[],
): readonly PicoCompanionDomainReadershipRow[] {
  return domains.map((domain) => ({
    domainId: domain.domainId,
    domainAuthorityId: domain.domainAuthorityId,
    ownerDisplay: picoDisplayFingerprint(domain.ownerIdentityKeyFingerprintHex),
    readers: domain.readers.map((reader) => ({
      readerGrantId: reader.readerGrantId,
      readerDisplay: picoDisplayFingerprint(reader.readerIdentityKeyFingerprintHex),
      accessMode: reader.accessMode,
      status: reader.status,
      validUntilDisplay: picoDisplayDate(reader.validUntil),
    })),
  }));
}

/**
 * Wann diese Person diesem Modul zugestimmt hat - als Kalendertag, nicht als
 * Instant (Nutzerentscheidung 9 vom 2026-09-22).
 *
 * Steht hier aus demselben Grund wie die fuenf Zeichnungen darueber: die
 * Umrechnung ist eine Darstellung, und der Zeichner kann `picoDisplayDate`
 * nicht erreichen, weil renderer-erreichbare Dateien keine blossen Spezifizierer
 * aufloesen (`browser:check` hat genau diesen Versuch gefangen). Der rohe
 * Instant geht nicht mit hinueber: was das Fenster nicht bekommt, kann es auch
 * nicht versehentlich zeigen.
 */
export function picoCompanionRenderedModuleConsent(
  modules: readonly PicoCompanionModuleConsentView[],
): readonly PicoCompanionModuleConsentRow[] {
  return modules.map(({ consentedAt, ...rest }) => (consentedAt === undefined
    ? rest
    : { ...rest, agreedOnDisplay: picoDisplayDate(consentedAt) }));
}
