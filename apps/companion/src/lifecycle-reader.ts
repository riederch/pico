import type { VaultSodium } from '@pico/vault';
import {
  createPicoLinkDirectClient,
  type PicoLinkDirectClient,
} from '@pico/vault-daemon/link-direct-client';
import type { PicoVaultDaemonClient } from '@pico/vault-daemon/client';
import { readPicoHomeDeviceLifecycle } from '@pico/vault-daemon/device-lifecycle-ceremony';
import type {
  PicoCompanionLifecycleReader,
  PicoCompanionLifecycleSnapshot,
} from './alarm-carrier.js';
import {
  repinPicoCompanionHostKeys,
  type PicoCompanionHostContinuityNotifications,
} from './host-repin.js';
import type { PicoCompanionProfile } from './profile.js';

/**
 * Wires the profile to the proven daemon and Link clients: an authenticated
 * lifecycle read as this device, exactly what the ADR 0112 alarm carrier
 * consumes. Pure composition of process-proven parts - its own end-to-end
 * proof against a real founded Home is the ADR 0113 C2 gate.
 *
 * ADR 0115 U4: a read refused before authentication in the strand shape - a
 * sealed envelope the Home cannot open, or one pinned to an audience it no
 * longer answers as - triggers one continuity-chain verification. A proven
 * rotation re-pins the profile, rebuilds the Link client and retries the
 * read once, telling the person loudly; anything the chain cannot prove
 * leaves the pin untouched and raises the continuity alarm instead. Network
 * failures stay read failures: the carrier counts them, no verdict is
 * invented.
 */
export async function createPicoCompanionLifecycleReader(input: {
  profile: PicoCompanionProfile;
  /**
   * Where the profile lives, so a verified rotation can be re-pinned
   * durably. Without it the reader still works - it just stays stranded
   * across restarts, so callers should pass it whenever the profile came
   * from disk.
   */
  profilePath?: string;
  notifications?: PicoCompanionHostContinuityNotifications;
  daemonClient: PicoVaultDaemonClient;
  sodium: VaultSodium;
  fetch?: typeof fetch;
}): Promise<PicoCompanionLifecycleReader> {
  let profile = input.profile;

  const buildLinkClient = async (): Promise<PicoLinkDirectClient> =>
    await createPicoLinkDirectClient({
      sodium: input.sodium,
      daemonClient: input.daemonClient,
      coreUrl: profile.coreUrl,
      host: {
        signingPublicKeyHex: profile.host.signingPublicKeyHex,
        signingKeyFingerprintHex: profile.host.signingKeyFingerprintHex,
        keyAgreementPublicKeyHex: profile.host.keyAgreementPublicKeyHex,
        keyAgreementKeyFingerprintHex: profile.host.keyAgreementKeyFingerprintHex,
      },
      sender: {
        identityKeyFingerprintHex: profile.identity.keyFingerprintHex,
        identityPublicKeyHex: profile.identity.publicKeyHex,
        deviceSigningKeyFingerprintHex: profile.device.signingKeyFingerprintHex,
        deviceKeyAgreementKeyFingerprintHex:
          profile.device.keyAgreementKeyFingerprintHex,
        delegationId: profile.device.delegationId,
      },
      ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
    });

  let linkClient = await buildLinkClient();

  const readOnce = async (): Promise<PicoCompanionLifecycleSnapshot> => {
    const view = await readPicoHomeDeviceLifecycle(linkClient, {
      identityKeyFingerprintHex: profile.identity.keyFingerprintHex,
      sponsor: linkClient.sender,
    });
    // The snapshot carries the identity it was read as, so the alarm can name
    // it without a second source of truth (ADR 0112).
    return {
      picoIdentityFingerprintHex: profile.identity.keyFingerprintHex,
      /**
       * ADR 0086, seit dem 2026-08-26. Das Home schickt sie mit, und dieser
       * Leser hat sie bisher fallen lassen; wer eine Reader-Custody-Domäne
       * anlegt, braucht sie in der Unterschrift. Sie ins Profil zu schreiben
       * wäre eine zweite Stelle, an der sie steht - und ein Gerät, das vor
       * dieser Zeile beigetreten ist, hätte sie dort nicht.
       */
      homeId: view.homeId,
      pendingRecovery: view.pendingRecovery,
      ...(view.clockDivergence === undefined
        ? {}
        : { clockDivergence: view.clockDivergence }),
    };
  };

  return async () => {
    try {
      return await readOnce();
    } catch (error) {
      if (!isStrandedLinkFailure(error) || input.profilePath === undefined) {
        throw error;
      }

      const previousHostSigningKeyFingerprintHex =
        profile.host.signingKeyFingerprintHex;
      let outcome: Awaited<ReturnType<typeof repinPicoCompanionHostKeys>>;
      try {
        outcome = await repinPicoCompanionHostKeys({
          sodium: input.sodium,
          profilePath: input.profilePath,
          profile,
          ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
        });
      } catch {
        // The chain read itself failed - a connectivity problem explains the
        // refused read better than any verdict would. Report the original
        // failure and let the carrier count it.
        throw error;
      }

      if (outcome.status !== 'repinned') {
        // Something answers on this URL that the proven chain cannot
        // explain: `unverified` is a chain that fails verification,
        // `current` is a Home refusing the very pin the chain calls its
        // head - a half-completed rotation or an impersonating host. Either
        // way this device stays on its pin, and the person must hear it.
        await input.notifications?.notifyHostContinuityUnverified({
          coreUrl: profile.coreUrl,
          reason: outcome.status === 'unverified'
            ? outcome.reason
            : 'home_refuses_pinned_head',
        });
        throw error;
      }

      profile = outcome.profile;
      linkClient = await buildLinkClient();
      await input.notifications?.notifyHostKeysRotated({
        previousHostSigningKeyFingerprintHex,
        hostSigningKeyFingerprintHex: profile.host.signingKeyFingerprintHex,
        followedLinks: outcome.followedLinks,
      });
      return await readOnce();
    }
  };
}

/**
 * The strand shape and only the strand shape: pre-authentication intake
 * refusals that mean "this envelope is sealed or addressed to keys this Home
 * does not hold". Anything else - network failures, authorization refusals,
 * verification failures on the response - is not evidence of a rotation.
 */
function isStrandedLinkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message === 'link_rejected:400:sealed_request_unreadable'
    || error.message === 'link_rejected:400:wrong_home';
}
