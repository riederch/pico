import {
  assertPicoDeviceEnrolmentGrantIsFor,
  buildPicoDeviceEnrolmentAcceptance,
  buildPicoDeviceEnrolmentGrant,
  buildPicoDeviceEnrolmentOffer,
  parsePicoDeviceEnrolmentAcceptance,
  parsePicoDeviceEnrolmentGrant,
  parsePicoDeviceEnrolmentOffer,
  type PicoDeviceEnrolmentGrant,
} from '@pico/protocol/device-enrolment';
import {
  picoHomeDeviceLifecycleCanonicalLabels,
  type PicoIdentityDelegationScope,
} from '@pico/protocol';
import type { VaultSodium } from '@pico/vault';
import {
  connectPicoVaultDaemonClient,
  type PicoVaultDaemonClient,
} from '@pico/vault-daemon/client';
import {
  enrollPicoHomeDevice,
  readPicoHomeDeviceLifecycle,
  renewPicoHomeDevice,
} from '@pico/vault-daemon/device-lifecycle-ceremony';
import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';
import type { PicoCompanionApprovalDecisionPort } from './approval-carrier.js';
import {
  defaultPicoCompanionPlatformUnlockPath,
  writePicoCompanionPlatformUnlock,
  type PicoCompanionPlatformSecretPort,
} from './platform-unlock.js';
import {
  picoCompanionProfileSchema,
  writePicoCompanionProfile,
  type PicoCompanionProfile,
} from './profile.js';
import { createPicoCompanionLinkClient } from './recovery-controller.js';
import {
  openPicoCompanionVaultProductSession,
  type PicoCompanionVaultProductSession,
} from './vault-product-session.js';

/**
 * ADR 0130 E3 - a second device, from the Client, over camera and code.
 *
 * **Three codes, because the ceremony has three signatures in an order.** The
 * identity root signs the delegation, the target co-signs a Home activation
 * that binds the digest of that whole evidence, and the sponsor submits. The
 * target therefore cannot sign before the sponsor has built, and the sponsor
 * cannot submit before the target has signed - so offer, grant, acceptance is
 * the shortest exchange, not a chosen one.
 *
 * **What crosses is public.** Two public keys, one activation to sign, one
 * signature. No private key moves, and the activation names the exact target
 * keys and dies in four minutes, so a code somebody photographs over a
 * shoulder enrols nothing.
 *
 * The scopes are the first device's three (ADR 0104): another of your devices
 * should be able to do what your device does, and asking a person which
 * capabilities their laptop may have would be asking a question they have no
 * way to have an opinion about.
 */

export const picoCompanionEnrolmentScopes: readonly PicoIdentityDelegationScope[] =
  Object.freeze(['surface_session', 'decrypt_domain', 'receive_key_envelope']);

/**
 * How long the person has to carry the grant to the other device and the
 * acceptance back. The ceremony's own activation lifetime is four minutes and
 * it is not ours to change; this is the wait for a person, and it ends with a
 * sentence rather than with a hung window.
 */
export const picoCompanionEnrolmentConfirmationMs = 120_000;

export interface PicoCompanionEnrolmentOffer {
  offerCode: string;
  device: {
    signingKeyFingerprintHex: string;
    signingPublicKeyHex: string;
    keyAgreementKeyFingerprintHex: string;
    keyAgreementPublicKeyHex: string;
  };
}

/**
 * **Sponsor side.** Reads the other device's offer, builds and signs the
 * authority under ADR 0099 approval, hands out the grant, and submits once
 * the acceptance comes back.
 *
 * `exchange` is the person: it is handed the grant to show, and resolves with
 * whatever the other device showed back. Everything about cameras, typed
 * strings and windows lives on the other side of that function.
 */
export async function enrolPicoCompanionDevice(input: {
  profile: PicoCompanionProfile;
  daemonClient: PicoVaultDaemonClient;
  livingDeviceLinkClient: PicoLinkDirectClient;
  sodium: VaultSodium;
  offerCode: string;
  validUntil: string;
  exchange: (grantCode: string) => Promise<string>;
}): Promise<{
  delegationId: string;
  targetSigningKeyFingerprintHex: string;
}> {
  const offer = parsePicoDeviceEnrolmentOffer(input.offerCode);
  if (offer.device.signingKeyFingerprintHex
    === input.profile.device.signingKeyFingerprintHex) {
    // The person scanned this device's own code. Said as itself, because the
    // ceremony's refusal would be about a delegation that already exists.
    throw new Error('pico_companion_enrolment_offer_is_this_device');
  }

  const result = await enrollPicoHomeDevice({
    rootClient: input.daemonClient,
    sponsorLinkClient: input.livingDeviceLinkClient,
    sodium: input.sodium,
    identityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    sponsor: sponsorOf(input.profile),
    target: targetSignerOverCodes(input.profile, offer.device, input.exchange),
    scopes: [...picoCompanionEnrolmentScopes],
    validUntil: input.validUntil,
  });

  return Object.freeze({
    delegationId: result.submission.evidence.targetDelegationId,
    targetSigningKeyFingerprintHex:
      result.submission.evidence.targetDeviceSigningKeyFingerprintHex,
  });
}

/**
 * ADR 0109 renewal for a device that is not this one - the only path that does
 * not end in a reset.
 *
 * **Measured against a running Home before this was built:** a device whose
 * year ran out cannot be enrolled again *ever* - the `enroll` transition
 * refuses a target whose device keys the Home has known under this identity,
 * before or after a revocation - and it cannot make new keys without its
 * vault being wiped. The Recovery Card is not the escape either: it needs a
 * fresh vault too and replaces the whole device set behind a 48-hour
 * objection window. So this is the one way to keep a second device working,
 * and it has to happen while its authority is still active.
 *
 * The exchange is the enrolment's, code for code. What differs is what the
 * Home is asked for: the activation carries `action: 'renew'`, the delegation
 * it replaces is the one the target already holds, and the same transition
 * revokes it.
 */
export async function renewPicoCompanionDeviceOverCodes(input: {
  profile: PicoCompanionProfile;
  daemonClient: PicoVaultDaemonClient;
  livingDeviceLinkClient: PicoLinkDirectClient;
  sodium: VaultSodium;
  offerCode: string;
  validUntil: string;
  exchange: (grantCode: string) => Promise<string>;
}): Promise<{
  delegationId: string;
  replacedDelegationId: string;
  targetSigningKeyFingerprintHex: string;
}> {
  const offer = parsePicoDeviceEnrolmentOffer(input.offerCode);
  if (offer.device.signingKeyFingerprintHex
    === input.profile.device.signingKeyFingerprintHex) {
    // This device renews itself without any of this (ADR 0104): root and
    // target are one vault, and holding a screen up to itself is not a step.
    throw new Error('pico_companion_enrolment_offer_is_this_device');
  }

  /**
   * Which delegation is being replaced is read from the Home, not asked of
   * the person: they are holding a device, not an id. It is matched on the
   * keys the offer carries, which is the same thing the ceremony will check
   * again before it signs anything.
   */
  const view = await readPicoHomeDeviceLifecycle(input.livingDeviceLinkClient, {
    identityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    sponsor: sponsorOf(input.profile),
  });
  const replaced = view.devices.find(
    (device) => device.deviceSigningKeyFingerprintHex
      === offer.device.signingKeyFingerprintHex
      && device.status === 'active',
  );
  if (replaced === undefined) {
    /**
     * Either the Home never knew this device, or its year already ran out.
     * Both end here rather than at the ceremony, because the answer for the
     * person is the same and it is not "try again": that device has to be
     * reset and added as a new one.
     */
    throw new Error('pico_companion_renewal_target_has_no_active_authority');
  }

  const result = await renewPicoHomeDevice({
    rootClient: input.daemonClient,
    sponsorLinkClient: input.livingDeviceLinkClient,
    sodium: input.sodium,
    identityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    sponsor: sponsorOf(input.profile),
    target: targetSignerOverCodes(input.profile, offer.device, input.exchange),
    replacedDelegationId: replaced.delegationId,
    scopes: [...picoCompanionEnrolmentScopes],
    validUntil: input.validUntil,
  });

  return Object.freeze({
    delegationId: result.submission.evidence.targetDelegationId,
    replacedDelegationId: replaced.delegationId,
    targetSigningKeyFingerprintHex:
      result.submission.evidence.targetDeviceSigningKeyFingerprintHex,
  });
}

function sponsorOf(profile: PicoCompanionProfile): {
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

/**
 * The target of a ceremony, across the person carrying two screens.
 *
 * One builder for enrolment and renewal, because the grant they hand over and
 * the acceptance they take back are the same bytes in the same order - the
 * only difference is inside the activation the ceremony built. Two copies
 * would be two places for the binding between question and answer to drift.
 */
function targetSignerOverCodes(
  profile: PicoCompanionProfile,
  device: PicoCompanionEnrolmentOffer['device'],
  exchange: (grantCode: string) => Promise<string>,
): Parameters<typeof enrollPicoHomeDevice>[0]['target'] {
  return {
    signing: {
      keyRole: 'device_signing',
      keyFingerprintHex: device.signingKeyFingerprintHex,
      publicKeyHex: device.signingPublicKeyHex,
    },
    keyAgreement: {
      keyRole: 'device_key_agreement',
      keyFingerprintHex: device.keyAgreementKeyFingerprintHex,
      publicKeyHex: device.keyAgreementPublicKeyHex,
    },
    signActivation: async (activation) => {
      const grantCode = buildPicoDeviceEnrolmentGrant({
        activation,
        home: {
          coreUrl: profile.coreUrl,
          homeHostPicoIdentityFingerprintHex:
            profile.home.homeHostPicoIdentityFingerprintHex,
          host: { ...profile.host },
          identity: { ...profile.identity },
        },
      });
      const acceptance = parsePicoDeviceEnrolmentAcceptance(await exchange(grantCode));
      if (acceptance.activationId !== activation.activationId) {
        /**
         * An answer to a different question. It happens when somebody shows a
         * code from an earlier attempt, and accepting it would submit a
         * signature over bytes this ceremony never built.
         */
        throw new Error('pico_companion_enrolment_acceptance_is_for_another_activation');
      }
      return acceptance.targetSignatureHex;
    },
  };
}

/**
 * **Target side, first step.** The two keys this device will be known by,
 * made in its own vault, and the code that shows them.
 *
 * A vault that already holds exactly these two keys and nothing else is
 * offered again rather than refused: an enrolment interrupted between the
 * offer and the grant would otherwise leave a vault that is no longer fresh
 * and a person who cannot start over. A vault holding an identity key belongs
 * to somebody already, and that is a different sentence.
 */
export async function offerPicoCompanionEnrolment(input: {
  socketPath: string;
  passphrase: string;
  connect?: typeof connectPicoVaultDaemonClient;
}): Promise<PicoCompanionEnrolmentOffer> {
  const connect = input.connect ?? connectPicoVaultDaemonClient;
  const client = await connect({ socketPath: input.socketPath });
  try {
    await client.hello();
    const status = await client.status();
    const roles = status.keyfiles.map((keyfile) => keyfile.keyRole).sort();

    if (roles.length === 0) {
      const bootstrapped = await client.deviceBootstrap({ passphrase: input.passphrase });
      return Object.freeze({
        offerCode: buildPicoDeviceEnrolmentOffer(bootstrapped.device),
        device: bootstrapped.device,
      });
    }
    if (roles.length !== 2
      || roles[0] !== 'device_key_agreement'
      || roles[1] !== 'device_signing') {
      throw new Error('pico_companion_enrolment_vault_is_not_new');
    }

    // Resuming. The public keys live inside the encrypted keyfiles, so they
    // arrive by unlocking rather than by reading a file.
    const signingKeyfile = status.keyfiles.find(
      (keyfile) => keyfile.keyRole === 'device_signing',
    )!;
    const agreementKeyfile = status.keyfiles.find(
      (keyfile) => keyfile.keyRole === 'device_key_agreement',
    )!;
    const signing = await client.unlock({
      keyRole: 'device_signing',
      keyFingerprintHex: signingKeyfile.keyFingerprintHex,
      passphrase: input.passphrase,
    });
    const agreement = await client.unlock({
      keyRole: 'device_key_agreement',
      keyFingerprintHex: agreementKeyfile.keyFingerprintHex,
      passphrase: input.passphrase,
    });
    const device = {
      signingKeyFingerprintHex: signing.keyFingerprintHex,
      signingPublicKeyHex: signing.publicKeyHex,
      keyAgreementKeyFingerprintHex: agreement.keyFingerprintHex,
      keyAgreementPublicKeyHex: agreement.publicKeyHex,
    };
    return Object.freeze({
      offerCode: buildPicoDeviceEnrolmentOffer(device),
      device,
    });
  } finally {
    await client.close();
  }
}

/**
 * ADR 0130 E3 renewal, from the device being renewed.
 *
 * It already has keys, a profile and an unlocked vault, so nothing is
 * bootstrapped: the offer is built from what the daemon publishes for the
 * exact keys the profile names. A device that made new keys here would be
 * asking to join as a stranger, which is the thing the Home refuses for ever.
 */
export async function offerPicoCompanionRenewal(input: {
  profile: PicoCompanionProfile;
  daemonClient: PicoVaultDaemonClient;
}): Promise<PicoCompanionEnrolmentOffer> {
  const status = await input.daemonClient.status();
  const signing = status.sessions.find(
    (session) => session.keyRole === 'device_signing'
      && session.keyFingerprintHex === input.profile.device.signingKeyFingerprintHex,
  );
  const agreement = status.sessions.find(
    (session) => session.keyRole === 'device_key_agreement'
      && session.keyFingerprintHex === input.profile.device.keyAgreementKeyFingerprintHex,
  );
  if (signing === undefined || agreement === undefined) {
    // The public keys live inside the encrypted keyfiles, so this needs the
    // vault open - which on a running device it is.
    throw new Error('pico_companion_renewal_keys_are_locked');
  }
  const device = {
    signingKeyFingerprintHex: signing.keyFingerprintHex,
    signingPublicKeyHex: signing.publicKeyHex,
    keyAgreementKeyFingerprintHex: agreement.keyFingerprintHex,
    keyAgreementPublicKeyHex: agreement.publicKeyHex,
  };
  return Object.freeze({
    offerCode: buildPicoDeviceEnrolmentOffer(device),
    device,
  });
}

export interface PicoCompanionEnrolmentAcceptance {
  acceptanceCode: string;
  grant: PicoDeviceEnrolmentGrant;
  /**
   * Waits until the Home answers this device as one of its own, then writes
   * the profile that makes it real here.
   *
   * The wait is the proof and not a courtesy: a profile written on the
   * strength of having signed something would describe a device the Home may
   * never have accepted, and the first thing that device did would be to fail
   * at every read with a word about authorisation.
   */
  confirm(): Promise<PicoCompanionProfile>;
  /** Ends the vault session this held open, on the paths that do not confirm. */
  close(): Promise<void>;
}

/**
 * **Target side, second step.** Checks the grant is for this device, signs
 * the activation under ADR 0099 approval, and answers with the code the
 * sponsor needs.
 */
export async function acceptPicoCompanionEnrolment(input: {
  socketPath: string;
  passphrase: string;
  grantCode: string;
  /**
   * ADR 0130 E3 renewal. A device that is already running has its keys
   * unlocked and its own daemon connection; asking for the passphrase again
   * would be asking a person for something their keystore has been holding
   * for them since they signed in. When this is given, the session is the
   * caller's and is not closed here.
   */
  openSession?: PicoCompanionVaultProductSession;
  profilePath: string;
  sodium: VaultSodium;
  /**
   * Who answers the approval this signature raises. Required when this opens
   * the session; meaningless when `openSession` is given, because whoever
   * opened that one is already answering for it.
   */
  decisions?: PicoCompanionApprovalDecisionPort;
  device: PicoCompanionEnrolmentOffer['device'];
  platformSecrets?: PicoCompanionPlatformSecretPort;
  platformUnlockPath?: string;
  now?: () => Date;
  fetch?: typeof fetch;
  connect?: typeof connectPicoVaultDaemonClient;
}): Promise<PicoCompanionEnrolmentAcceptance> {
  const now = input.now ?? (() => new Date());
  const grant = parsePicoDeviceEnrolmentGrant(input.grantCode);
  assertPicoDeviceEnrolmentGrantIsFor(grant, input.device, now());

  const ownSession = input.openSession === undefined;
  if (ownSession && input.decisions === undefined) {
    throw new Error('pico_companion_enrolment_needs_an_approver');
  }
  const session = input.openSession ?? await openPicoCompanionVaultProductSession({
    socketPath: input.socketPath,
    unlock: [
      {
        keyRole: 'device_signing',
        keyFingerprintHex: input.device.signingKeyFingerprintHex,
        passphrase: input.passphrase,
      },
      {
        keyRole: 'device_key_agreement',
        keyFingerprintHex: input.device.keyAgreementKeyFingerprintHex,
        passphrase: input.passphrase,
      },
    ],
    decisions: input.decisions!,
    ...(input.connect === undefined ? {} : { connect: input.connect }),
  });
  const closeIfOurs = async (): Promise<void> => {
    if (ownSession) {
      await session.close();
    }
  };

  try {
    const signed = await session.consumerClient.sign({
      keyFingerprintHex: input.device.signingKeyFingerprintHex,
      // The constant, not the string. Writing it out here produced
      // `pico.home.device.activation.v1` against the real
      // `pico.home.device-activation.v1`, which is a signature over the wrong
      // label and a Home that refuses bytes nobody can explain.
      label: picoHomeDeviceLifecycleCanonicalLabels.activation,
      fields: grant.activation as unknown as Record<string, unknown>,
    });
    if (signed.keyRole !== 'device_signing'
      || signed.keyFingerprintHex !== input.device.signingKeyFingerprintHex
      || !/^[0-9a-f]{128}$/u.test(signed.signatureHex)) {
      throw new Error('pico_companion_enrolment_signer_mismatch');
    }

    const profile: PicoCompanionProfile = {
      schema: picoCompanionProfileSchema,
      coreUrl: grant.home.coreUrl,
      home: {
        homeHostPicoIdentityFingerprintHex: grant.home.homeHostPicoIdentityFingerprintHex,
      },
      host: { ...grant.home.host },
      identity: { ...grant.home.identity },
      device: {
        signingKeyFingerprintHex: input.device.signingKeyFingerprintHex,
        keyAgreementKeyFingerprintHex: input.device.keyAgreementKeyFingerprintHex,
        delegationId: grant.activation.targetDelegationId,
      },
    };

    return Object.freeze({
      acceptanceCode: buildPicoDeviceEnrolmentAcceptance({
        activationId: grant.activation.activationId,
        targetSignatureHex: signed.signatureHex,
      }),
      grant,
      confirm: async () => {
        const linkClient = await createPicoCompanionLinkClient({
          profile,
          daemonClient: session.consumerClient,
          sodium: input.sodium,
          ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
        });
        const deadline = now().getTime() + picoCompanionEnrolmentConfirmationMs;
        /**
         * The last thing the Home said, kept for the refusal at the end.
         *
         * A read refused is the ordinary state before the sponsor has
         * submitted - this device is nobody to the Home yet - so the loop
         * swallows it. But swallowing it *forever* leaves a device that
         * waited two minutes saying only that it was not accepted, which
         * tells the person nothing and whoever has to diagnose it less. The
         * one thing worth carrying out of a timeout is what kept happening.
         */
        let lastRefusal = 'no answer from your Home';
        for (;;) {
          const accepted = await readPicoHomeDeviceLifecycle(linkClient, {
            identityKeyFingerprintHex: profile.identity.keyFingerprintHex,
            sponsor: linkClient.sender,
          }).then((view) => view.devices.some(
            (candidate) => candidate.delegationId === profile.device.delegationId
              && candidate.status === 'active',
          )).catch((refused: unknown) => {
            lastRefusal = refused instanceof Error ? refused.message : String(refused);
            return false;
          });
          if (accepted) {
            break;
          }
          if (now().getTime() >= deadline) {
            throw new Error(`pico_companion_enrolment_was_not_accepted:${lastRefusal}`);
          }
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }

        // Last, for founding's reason: the profile is what makes this device
        // real to everything else here, and it must not exist before the Home
        // has agreed.
        writePicoCompanionProfile(input.profilePath, profile);
        if (input.platformSecrets !== undefined && ownSession) {
          await writePicoCompanionPlatformUnlock({
            path: input.platformUnlockPath
              ?? defaultPicoCompanionPlatformUnlockPath(input.profilePath),
            profile,
            passphrase: input.passphrase,
            secrets: input.platformSecrets,
          });
        }
        await closeIfOurs();
        return profile;
      },
      close: async () => {
        await closeIfOurs();
      },
    });
  } catch (error) {
    await closeIfOurs();
    throw error;
  }
}
