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
import { openPicoCompanionVaultProductSession } from './vault-product-session.js';

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
    sponsor: {
      identityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
      identityPublicKeyHex: input.profile.identity.publicKeyHex,
      deviceSigningKeyFingerprintHex: input.profile.device.signingKeyFingerprintHex,
      deviceKeyAgreementKeyFingerprintHex: input.profile.device.keyAgreementKeyFingerprintHex,
      delegationId: input.profile.device.delegationId,
    },
    target: {
      signing: {
        keyRole: 'device_signing',
        keyFingerprintHex: offer.device.signingKeyFingerprintHex,
        publicKeyHex: offer.device.signingPublicKeyHex,
      },
      keyAgreement: {
        keyRole: 'device_key_agreement',
        keyFingerprintHex: offer.device.keyAgreementKeyFingerprintHex,
        publicKeyHex: offer.device.keyAgreementPublicKeyHex,
      },
      signActivation: async (activation) => {
        const grantCode = buildPicoDeviceEnrolmentGrant({
          activation,
          home: {
            coreUrl: input.profile.coreUrl,
            homeHostPicoIdentityFingerprintHex:
              input.profile.home.homeHostPicoIdentityFingerprintHex,
            host: { ...input.profile.host },
            identity: { ...input.profile.identity },
          },
        });
        const acceptance = parsePicoDeviceEnrolmentAcceptance(
          await input.exchange(grantCode),
        );
        if (acceptance.activationId !== activation.activationId) {
          /**
           * An answer to a different question. It happens when somebody shows
           * a code from an earlier attempt, and accepting it would submit a
           * signature over bytes this ceremony never built.
           */
          throw new Error('pico_companion_enrolment_acceptance_is_for_another_activation');
        }
        return acceptance.targetSignatureHex;
      },
    },
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
  profilePath: string;
  sodium: VaultSodium;
  decisions: PicoCompanionApprovalDecisionPort;
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

  const session = await openPicoCompanionVaultProductSession({
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
    decisions: input.decisions,
    ...(input.connect === undefined ? {} : { connect: input.connect }),
  });

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
        for (;;) {
          const accepted = await readPicoHomeDeviceLifecycle(linkClient, {
            identityKeyFingerprintHex: profile.identity.keyFingerprintHex,
            sponsor: linkClient.sender,
          }).then((view) => view.devices.some(
            (candidate) => candidate.delegationId === profile.device.delegationId
              && candidate.status === 'active',
          // A read refused is the ordinary state before the sponsor has
          // submitted: this device is nobody to the Home yet.
          )).catch(() => false);
          if (accepted) {
            break;
          }
          if (now().getTime() >= deadline) {
            throw new Error('pico_companion_enrolment_was_not_accepted');
          }
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }

        // Last, for founding's reason: the profile is what makes this device
        // real to everything else here, and it must not exist before the Home
        // has agreed.
        writePicoCompanionProfile(input.profilePath, profile);
        if (input.platformSecrets !== undefined) {
          writePicoCompanionPlatformUnlock({
            path: input.platformUnlockPath
              ?? defaultPicoCompanionPlatformUnlockPath(input.profilePath),
            profile,
            passphrase: input.passphrase,
            secrets: input.platformSecrets,
          });
        }
        await session.close();
        return profile;
      },
      close: async () => {
        await session.close();
      },
    });
  } catch (error) {
    await session.close();
    throw error;
  }
}
