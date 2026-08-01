import type { VaultSodium } from '@pico/vault';
import { refreshPicoHomeHostPins } from '@pico/vault-daemon';
import { writePicoCompanionProfile, type PicoCompanionProfile } from './profile.js';

/**
 * ADR 0115 U4, decided by the user on 2026-08-01: after a fully verified
 * continuity chain the companion re-pins automatically and tells the person
 * loudly, instead of gating the re-pin behind an approval. The verification
 * is cryptographically complete - every link from this device's own pin to
 * the head, every acceptance bound to the pinned Home Host Pico - and a
 * member cannot meaningfully refuse their Home's rotation anyway; a prompt
 * here would check nothing the mathematics has not already checked. What the
 * person must hear instead is that it happened (ADR 0080 M3), and, in the
 * failure case, that this device could NOT verify its Home and stays on the
 * old pin deliberately.
 *
 * No vault unlock is needed anywhere on this path: chain read is unsealed,
 * verification is public-key work, and the profile holds no secrets. A
 * stranded companion heals itself, or alarms.
 */

export interface PicoCompanionHostRotationNotice {
  previousHostSigningKeyFingerprintHex: string;
  hostSigningKeyFingerprintHex: string;
  followedLinks: number;
}

export interface PicoCompanionHostContinuityAlarm {
  coreUrl: string;
  reason: string;
}

/** The ADR 0115 M3 half of the companion's notification surface. */
export interface PicoCompanionHostContinuityNotifications {
  notifyHostKeysRotated(
    notice: PicoCompanionHostRotationNotice,
  ): void | Promise<void>;
  notifyHostContinuityUnverified(
    alarm: PicoCompanionHostContinuityAlarm,
  ): void | Promise<void>;
}

export type PicoCompanionHostRepinOutcome =
  | { status: 'repinned'; profile: PicoCompanionProfile; followedLinks: number }
  | { status: 'current' }
  | { status: 'unverified'; reason: string };

/**
 * Verifies the Home's continuity chain from the profile's pins and, only on
 * a proven rotation, rewrites the profile atomically. `current` and
 * `unverified` both leave the profile untouched; what they mean is the
 * caller's to judge - `current` after a refused sealed read is exactly as
 * alarming as `unverified`, because something answers on this URL that the
 * proven chain cannot explain.
 */
export async function repinPicoCompanionHostKeys(input: {
  sodium: VaultSodium;
  profilePath: string;
  profile: PicoCompanionProfile;
  fetch?: typeof fetch;
}): Promise<PicoCompanionHostRepinOutcome> {
  const refreshed = await refreshPicoHomeHostPins(input.sodium, {
    coreUrl: input.profile.coreUrl,
    pinnedHostSigningKeyFingerprintHex:
      input.profile.host.signingKeyFingerprintHex,
    pinnedHostKeyAgreementKeyFingerprintHex:
      input.profile.host.keyAgreementKeyFingerprintHex,
    pinnedHomeHostPicoIdentityFingerprintHex:
      input.profile.home.homeHostPicoIdentityFingerprintHex,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });

  if (refreshed.status === 'unverified') {
    return {
      status: 'unverified',
      reason: refreshed.halt === undefined
        ? refreshed.reason
        : `${refreshed.reason}:${refreshed.halt.reason}`,
    };
  }
  if (refreshed.status === 'current') {
    return { status: 'current' };
  }

  const repinned: PicoCompanionProfile = {
    ...input.profile,
    host: {
      signingPublicKeyHex: refreshed.head.signingPublicKeyHex,
      signingKeyFingerprintHex: refreshed.head.signingKeyFingerprintHex,
      keyAgreementPublicKeyHex: refreshed.head.keyAgreementPublicKeyHex,
      keyAgreementKeyFingerprintHex:
        refreshed.head.keyAgreementKeyFingerprintHex,
    },
  };
  // The write is atomic (temp file, fsync, rename): a crash mid-re-pin
  // leaves the old profile, and the next check simply follows the chain
  // again.
  writePicoCompanionProfile(input.profilePath, repinned);
  return {
    status: 'repinned',
    profile: repinned,
    followedLinks: refreshed.followedLinks,
  };
}
