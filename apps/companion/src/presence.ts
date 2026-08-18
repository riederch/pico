import {
  picoPresenceSchema,
  type PicoPresenceAffordance,
  type PicoPresenceAnnouncement,
} from '@pico/protocol/presence';
import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';
import type { PicoCompanionProfile } from './profile.js';

/**
 * ADR 0126 P2/P5 - the desktop companion saying it is here, and what it can
 * actually do.
 *
 * **An affordance is a fact, so it is observed rather than assumed.** That is
 * the whole reason this file has a port instead of a constant list. A shell
 * that declared `camera` on a machine with no camera would be putting a false
 * statement in the one field ADR 0126 insists is a statement of fact - and the
 * Core plans against those, so the lie would come back as a plan that cannot
 * run. Two of the five things this runtime might offer depend on the machine
 * it is on, and both are checked.
 *
 * ADR 0113's companion was named the first presence of an identity
 * retroactively (P5). This is the first time it says so itself.
 */

export interface PicoCompanionPresenceProbe {
  /** ADR 0112 S3's scan path: a decoder binary *and* a video device. */
  canScanWithCamera(): boolean;
  /** ADR 0132: a spooler this runtime can put a Recovery Card through. */
  canPrint(): boolean;
}

/**
 * What this runtime offers regardless of the machine.
 *
 * A window, a notification and a field the renderer never sees are properties
 * of the shell rather than of the hardware, so they are not probed - probing
 * them would be asking a question whose answer is in this repository.
 */
const alwaysOffered: readonly PicoPresenceAffordance[] = ['display', 'notification', 'secure_input'];

/**
 * ADR 0126. A stable name for this device, derived rather than stored.
 *
 * The device's own signing key fingerprint, which the Home already knows from
 * the delegation - so this adds no fact about the device to anything. Derived
 * rather than generated and written to the profile, because a generated id is
 * a second identity for the device to lose, and losing it would make one
 * machine look like two.
 */
export function picoCompanionPresenceId(profile: PicoCompanionProfile): string {
  return picoPresenceIdForDeviceSigningKey(profile.device.signingKeyFingerprintHex);
}

/**
 * The same id, for a device that is not this one.
 *
 * ADR 0130 E3 joins the Home's delegations to these rows, and a delegation
 * carries the signing key fingerprint without carrying a profile. One
 * derivation with two callers rather than a second `slice` somewhere else -
 * a join that drifted from the id it joins on would show one machine as two.
 */
export function picoPresenceIdForDeviceSigningKey(
  signingKeyFingerprintHex: string,
): string {
  return `device-${signingKeyFingerprintHex.slice(0, 24)}`;
}

export function picoCompanionAnnouncement(input: {
  profile: PicoCompanionProfile;
  probe: PicoCompanionPresenceProbe;
}): PicoPresenceAnnouncement {
  const affordances: PicoPresenceAffordance[] = [...alwaysOffered];
  if (input.probe.canScanWithCamera()) {
    affordances.push('camera');
  }
  if (input.probe.canPrint()) {
    affordances.push('printer');
  }
  /**
   * Deliberately never declared here: `location`, `microphone` and
   * `composite_tier`. The first two because this runtime has no sensor path
   * for them at all, and the third because ADR 0124's composite tier has no
   * assets - declaring a tier nothing can render would be the same false fact
   * one layer up.
   */
  return Object.freeze({
    schema: picoPresenceSchema,
    presenceId: picoCompanionPresenceId(input.profile),
    presenceType: 'desktop_companion',
    affordances: Object.freeze([...affordances].sort()),
  });
}

/**
 * ADR 0126 P2. Announces this presence, and refreshes it inside the lease.
 *
 * **The affordances are rebuilt on every announcement**, not captured once at
 * start. A printer that was unplugged an hour ago is a fact that changed, and
 * a presence repeating its first answer would keep the Home planning against
 * a machine that has moved on. The probe is two filesystem lookups; running it
 * per refresh is cheaper than being wrong between restarts.
 */
export async function announcePicoCompanionPresence(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  profile: PicoCompanionProfile;
  probe: PicoCompanionPresenceProbe;
}): Promise<{ ok: true } | { ok: false; refusal: string }> {
  const announcement = picoCompanionAnnouncement({
    profile: input.profile,
    probe: input.probe,
  });
  const answer = await input.livingDeviceLinkClient.request(
    'home.presence.announce',
    announcement as unknown as Record<string, unknown>,
  );
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    return {
      ok: false,
      refusal: typeof refusal === 'string' ? refusal : `presence_announce_${answer.outcome}`,
    };
  }
  return { ok: true };
}

/**
 * ADR 0126 P2/P6. The person's own devices, as their Home knows them.
 *
 * Read from the Home rather than assembled here, because the answer includes
 * devices this one has never met - which is the whole point of a registry
 * that belongs to the identity rather than to a machine.
 */
export interface PicoCompanionDeviceView {
  presenceId: string;
  presenceType: string;
  affordances: readonly string[];
  withheld: readonly string[];
  enabled: boolean;
  connected: boolean;
  registeredAt: string;
  lastSeenAt: string;
}

export async function readPicoCompanionDevices(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
}): Promise<readonly PicoCompanionDeviceView[]> {
  const read = await input.livingDeviceLinkClient.request('home.presence.read', {});
  if (read.outcome !== 'ok') {
    throw new Error(`presence_read_rejected:${read.outcome}`);
  }
  const presences = (read.result as { presences?: unknown }).presences;
  if (!Array.isArray(presences)) {
    throw new Error('invalid_pico_presence_read');
  }
  return Object.freeze(presences as PicoCompanionDeviceView[]);
}

/**
 * ADR 0126 P6. The person's word about one of their devices.
 *
 * `affordance` absent means the whole device, which is a different statement
 * from switching each of its affordances - and stays different after the
 * device gains a new one.
 */
export async function switchPicoCompanionDevice(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  presenceId: string;
  affordance?: string;
  enabled: boolean;
}): Promise<void> {
  const answer = await input.livingDeviceLinkClient.request('home.presence.switch', {
    presenceId: input.presenceId,
    ...(input.affordance === undefined ? {} : { affordance: input.affordance }),
    enabled: input.enabled,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `presence_switch_${answer.outcome}`);
  }
}

/** Removes a device from the list. The device itself is untouched. */
export async function forgetPicoCompanionDevice(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  presenceId: string;
}): Promise<void> {
  const answer = await input.livingDeviceLinkClient.request('home.presence.forget', {
    presenceId: input.presenceId,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `presence_forget_${answer.outcome}`);
  }
}
