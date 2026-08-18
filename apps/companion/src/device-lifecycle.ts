import type {
  PicoIdentityDelegationScope,
  PicoIdentityRevocationReasonCategory,
} from '@pico/protocol';
import type { VaultSodium } from '@pico/vault';
import type { PicoVaultDaemonClient } from '@pico/vault-daemon/client';
import {
  picoHomeDeviceTargetSignerFromVault,
  readPicoHomeDeviceLifecycle,
  renewPicoHomeDevice,
  revokePicoHomeDevice,
} from '@pico/vault-daemon/device-lifecycle-ceremony';
import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';
import { picoPresenceIdForDeviceSigningKey } from './presence.js';
import {
  writePicoCompanionProfile,
  type PicoCompanionProfile,
} from './profile.js';

/**
 * ADR 0130 E3. Which devices your Home answers to, and ending one.
 *
 * **The read already happened; the answer was thrown away.** ADR 0112's alarm
 * carrier polls exactly this endpoint and keeps three fields from it - the
 * identity, a pending recovery and clock movement - because that is all an
 * alarm needs. The device list came back on every one of those reads and had
 * nowhere to go, so "which devices can act as me" was a question only
 * `pico-vault inspect-device-lifecycle` could answer.
 *
 * **This is not a second list of devices.** ADR 0126's presences are the same
 * machines seen from the other side - what each one offers and whether it is
 * here - and `picoPresenceIdForDeviceSigningKey`, which is the derivation a
 * presence announces itself under, works on the signing key fingerprint a
 * delegation already carries. So a row here joins a presence row exactly, and
 * the window shows one device with two facts rather than two lists that
 * drift. The join is proved against a presence a real Home holds, not against
 * that function called on both sides.
 *
 * Deliberately not here: revoking a *key* rather than a delegation. The
 * ceremony takes three subjects and the CLI exposes all three; a person ends
 * a device's authority, and which record carries that is not their decision
 * (ADR 0130's own rule that argument parsing does not survive the move).
 */

export interface PicoCompanionDeviceAuthority {
  delegationId: string;
  /** ADR 0126's key for the same machine, derived the way a presence is. */
  presenceId: string;
  deviceSigningKeyFingerprintHex: string;
  status: 'active' | 'not_yet_valid' | 'expired' | 'revoked';
  validUntil: string;
  /** The row a person must not mistake for somebody else's. */
  isThisDevice: boolean;
}

export interface PicoCompanionDeviceAuthorityView {
  devices: readonly PicoCompanionDeviceAuthority[];
  /**
   * Whether this device can end an authority at all.
   *
   * A delegated device holds no identity key, and the ceremony is signed by
   * the identity root - so on a second device this is false, and the window
   * says so instead of offering a control that fails at the vault. It is read
   * from the daemon's own session list rather than assumed from the profile:
   * the profile says which identity this device belongs to, not which keys it
   * holds.
   */
  mayEndAuthority: boolean;
}

/**
 * The reasons a person picks from, and the two the protocol keeps for
 * machinery.
 *
 * `key_rotated` belongs to renewal, which writes its own revocation as part
 * of the same transition, and `membership_removed` is a membership decision
 * (ADR 0130 E4). Naming them here rather than filtering silently is what
 * keeps this list from drifting away from `@pico/protocol` unnoticed - the
 * contract test reads both lists and fails on a category that appears in
 * neither.
 */
export const picoCompanionDeviceRevocationReasons = [
  'lost_device',
  'suspected_compromise',
  'device_retired',
] as const satisfies readonly PicoIdentityRevocationReasonCategory[];

export const picoCompanionMachineOnlyRevocationReasons = Object.freeze({
  key_rotated: 'renewal writes it as part of the same transition',
  membership_removed: 'a membership decision rather than a device one',
});

export type PicoCompanionDeviceRevocationReason =
  typeof picoCompanionDeviceRevocationReasons[number];

export async function readPicoCompanionDeviceAuthority(input: {
  profile: PicoCompanionProfile;
  daemonClient: PicoVaultDaemonClient;
  livingDeviceLinkClient: PicoLinkDirectClient;
}): Promise<PicoCompanionDeviceAuthorityView> {
  const view = await readPicoHomeDeviceLifecycle(input.livingDeviceLinkClient, {
    identityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    sponsor: sender(input.profile),
  });
  const own = input.profile.device.signingKeyFingerprintHex;
  return Object.freeze({
    devices: Object.freeze(view.devices.map((device) => Object.freeze({
      delegationId: device.delegationId,
      presenceId: picoPresenceIdForDeviceSigningKey(device.deviceSigningKeyFingerprintHex),
      deviceSigningKeyFingerprintHex: device.deviceSigningKeyFingerprintHex,
      status: device.status,
      validUntil: device.validUntil,
      isThisDevice: device.deviceSigningKeyFingerprintHex === own,
    }))),
    mayEndAuthority: await holdsIdentityKey(
      input.daemonClient,
      input.profile.identity.keyFingerprintHex,
    ),
  });
}

/**
 * ADR 0109 revocation through the product path.
 *
 * The identity root signs it under ADR 0099 approval - the window shows the
 * ADR 0106 sentence the daemon renders from the exact bytes, including its
 * last-path warning - and this device submits it as the sponsor. The target
 * never co-signs its own removal, which is why a lost device can be ended at
 * all.
 *
 * **Ending this device's own authority ends the ability to ask what happened.**
 * That is not an error to be handled away: a person who just cut the last line
 * their Home answers to is told that, and told it as the reason the count is
 * missing rather than shown a number this process worked out by itself.
 */
export async function revokePicoCompanionDeviceAuthority(input: {
  profile: PicoCompanionProfile;
  daemonClient: PicoVaultDaemonClient;
  livingDeviceLinkClient: PicoLinkDirectClient;
  sodium: VaultSodium;
  targetDelegationId: string;
  reason: PicoCompanionDeviceRevocationReason;
}): Promise<{
  delegationId: string;
  endedThisDevice: boolean;
  /**
   * How many devices the Home answers to now, or `null` when this device
   * could not ask afterwards. ADR 0118 O4: an unanswered question is not a
   * zero, and the difference is the whole point on the row that ends this
   * device's own line.
   */
  activeDevicesLeft: number | null;
}> {
  if (!(picoCompanionDeviceRevocationReasons as readonly string[]).includes(input.reason)) {
    throw new Error('invalid_pico_companion_revocation_reason');
  }
  if (!await holdsIdentityKey(input.daemonClient, input.profile.identity.keyFingerprintHex)) {
    // Said as the fact rather than as a permission: the key is elsewhere, and
    // the device that holds it is where this can be done.
    throw new Error('pico_companion_device_holds_no_identity_key');
  }

  /**
   * Which device this is, read from the Home rather than taken from the
   * caller. A window passing "and by the way that row is you" would be the
   * surface vouching for the fact that decides what the person is told next.
   */
  const before = await readPicoHomeDeviceLifecycle(input.livingDeviceLinkClient, {
    identityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    sponsor: sender(input.profile),
  });
  const target = before.devices.find(
    (device) => device.delegationId === input.targetDelegationId,
  );
  if (target === undefined) {
    throw new Error('pico_companion_device_authority_is_unknown');
  }
  const endedThisDevice = target.deviceSigningKeyFingerprintHex
    === input.profile.device.signingKeyFingerprintHex;

  await revokePicoHomeDevice({
    rootClient: input.daemonClient,
    sponsorLinkClient: input.livingDeviceLinkClient,
    sodium: input.sodium,
    identityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    sponsor: sender(input.profile),
    targetDelegationId: input.targetDelegationId,
    subject: 'delegation',
    reasonCategory: input.reason,
  });

  /**
   * Read back rather than counted forward. The Home decides what the
   * submission did, and a count this process worked out from what it sent
   * would be this device agreeing with itself - the read failing is itself an
   * answer, and the one that arrives after a device ends its own authority.
   */
  const after = await readPicoHomeDeviceLifecycle(input.livingDeviceLinkClient, {
    identityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    sponsor: sender(input.profile),
  }).catch(() => null);

  return Object.freeze({
    delegationId: input.targetDelegationId,
    endedThisDevice,
    activeDevicesLeft: after === null
      ? null
      : after.devices.filter((device) => device.status === 'active').length,
  });
}

function sender(profile: PicoCompanionProfile): {
  identityKeyFingerprintHex: string;
  identityPublicKeyHex: string;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  delegationId: string;
} {
  return {
    identityKeyFingerprintHex: profile.identity.keyFingerprintHex,
    identityPublicKeyHex: profile.identity.publicKeyHex,
    deviceSigningKeyFingerprintHex: profile.device.signingKeyFingerprintHex,
    deviceKeyAgreementKeyFingerprintHex: profile.device.keyAgreementKeyFingerprintHex,
    delegationId: profile.device.delegationId,
  };
}

async function holdsIdentityKey(
  client: PicoVaultDaemonClient,
  identityKeyFingerprintHex: string,
): Promise<boolean> {
  const status = await client.status();
  return status.sessions.some(
    (session) => session.keyRole === 'pico_identity'
      && session.keyFingerprintHex === identityKeyFingerprintHex,
  );
}

/**
 * How long before an authority runs out this device starts saying so.
 *
 * ADR 0104 pins a year, and the last month of it is when a person can still
 * act cheaply: renewal needs the delegation to be *active*, and the Link
 * request that carries the renewal needs it too. A device that let its
 * authority lapse cannot renew itself at all - it has to be enrolled again,
 * or recovered. So the warning is not decoration; it is the difference
 * between a minute and a ceremony.
 */
export const picoCompanionDeviceAuthorityWarningDays = 30;

/**
 * ADR 0109 renewal, for the device holding the identity root.
 *
 * **Renewal is replacement.** The identity root signs a new delegation and a
 * revocation of the old one - two signatures, two approvals - and the target
 * co-signs the activation with the same device key it already has. For this
 * device those are one vault, which is why this one needs no exchange: the
 * founding device is both the root and the target.
 *
 * A delegated second device is the same ceremony with the target across a
 * camera, and it is the enrolment exchange with `action: 'renew'` in the
 * activation. That surface is not here yet.
 *
 * **The profile is rewritten, and it has to be.** The new delegation replaces
 * the old, the old is revoked in the same transition, and every Link request
 * this device makes names its delegation id. A device that renewed and kept
 * the old id in its profile would have signed itself out of its own Home at
 * the moment it renewed.
 */
export async function renewPicoCompanionDeviceAuthority(input: {
  profile: PicoCompanionProfile;
  profilePath: string;
  daemonClient: PicoVaultDaemonClient;
  livingDeviceLinkClient: PicoLinkDirectClient;
  sodium: VaultSodium;
  validUntil: string;
  scopes?: readonly PicoIdentityDelegationScope[];
}): Promise<{
  delegationId: string;
  replacedDelegationId: string;
  validUntil: string;
}> {
  if (!await holdsIdentityKey(input.daemonClient, input.profile.identity.keyFingerprintHex)) {
    // The same fact the read reports: without the identity key there is
    // nothing here that can sign a delegation, and the device that holds it
    // is where this can be done.
    throw new Error('pico_companion_device_holds_no_identity_key');
  }

  const result = await renewPicoHomeDevice({
    rootClient: input.daemonClient,
    sponsorLinkClient: input.livingDeviceLinkClient,
    sodium: input.sodium,
    identityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    sponsor: sender(input.profile),
    target: await picoHomeDeviceTargetSignerFromVault(input.daemonClient, {
      signingKeyFingerprintHex: input.profile.device.signingKeyFingerprintHex,
      keyAgreementKeyFingerprintHex: input.profile.device.keyAgreementKeyFingerprintHex,
    }),
    replacedDelegationId: input.profile.device.delegationId,
    scopes: [...(input.scopes ?? picoCompanionDeviceRenewalScopes)],
    validUntil: input.validUntil,
  });

  const delegationId = result.submission.evidence.targetDelegationId;
  writePicoCompanionProfile(input.profilePath, {
    ...input.profile,
    device: { ...input.profile.device, delegationId },
  });

  return Object.freeze({
    delegationId,
    replacedDelegationId: input.profile.device.delegationId,
    validUntil: input.validUntil,
  });
}

/**
 * The first device's three, unchanged by a renewal.
 *
 * A renewal extends what a device may do; changing it while extending it
 * would be two decisions wearing one control, and the person pressed a
 * control that says "keep working".
 */
export const picoCompanionDeviceRenewalScopes: readonly PicoIdentityDelegationScope[] =
  Object.freeze(['surface_session', 'decrypt_domain', 'receive_key_envelope']);
