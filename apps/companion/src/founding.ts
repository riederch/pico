import { assertPicoHomeCoreUrl } from '@pico/protocol/home-address';
import type { VaultSodium } from '@pico/vault';
import { connectPicoVaultDaemonClient } from '@pico/vault-daemon/client';
import {
  runPicoClaimHomeCeremony,
  type PicoClaimHomeCeremonyStep,
} from '@pico/vault-daemon/claim-home-ceremony';
import {
  picoCompanionProfileSchema,
  writePicoCompanionProfile,
  type PicoCompanionProfile,
} from './profile.js';
import {
  defaultPicoCompanionPlatformUnlockPath,
  writePicoCompanionPlatformUnlock,
} from './platform-unlock.js';
import type { PicoCompanionPlatformSecretPort } from './platform-secrets.js';
import { openPicoCompanionVaultProductSession } from './vault-product-session.js';
import type { PicoCompanionApprovalDecisionPort } from './approval-carrier.js';

/**
 * ADR 0130 E2 - founding a Home from the Pico Client.
 *
 * **The last piece of configuration that needed a command line.** The ceremony
 * itself lives in the vault daemon and always did; what was missing was a
 * caller that is not `pico-vault`. This is that caller, and it does the three
 * things the CLI subcommand did around the ceremony: make the keys, unlock
 * them, and write the profile once the Home says it is founded.
 *
 * **No private key passes through this process.** The keys are made by the
 * daemon's founding bootstrap and stay there; what comes back is fingerprints
 * and public halves. That is the property the ceremony's own test asserts by
 * name, and it is why founding could not simply call `createPicoVaultKeyfile`
 * the way the CLI does.
 */

/**
 * What a person copies out of their Home's first log line.
 *
 * **The pins come from the person, never from the endpoint**, and that is the
 * one thing this flow must not make convenient in the wrong direction. The
 * ceremony refuses when `/api/home/setup` describes a host different from the
 * one named here - so reading the fingerprints from that endpoint would be
 * asking the machine whether it is itself. A Home prints all of it on one
 * line at boot, which is what makes an out-of-band check something a person
 * can actually do rather than four hex strings they will paste from the same
 * screen anyway.
 */
export interface PicoHomeSetupAnnouncement {
  moveInCode: string;
  hostSigningKeyFingerprintHex: string;
  hostSigningPublicKeyHex: string;
  hostKeyAgreementKeyFingerprintHex: string;
  hostKeyAgreementPublicKeyHex: string;
}

const fingerprintPattern = /^[0-9a-f]{64}$/u;
const publicKeyPattern = /^[0-9a-f]{64}$/u;

/**
 * Reads the Home's boot line, which is a log format rather than a protocol
 * one - so it is parsed here rather than in `@pico/protocol`, and every field
 * is checked rather than trusted for being JSON.
 */
export function parsePicoHomeSetupAnnouncement(line: string): PicoHomeSetupAnnouncement {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line.trim());
  } catch {
    throw new Error('invalid_pico_home_setup_announcement');
  }
  const record = parsed as Record<string, unknown> | null;
  if (record === null || typeof record !== 'object') {
    throw new Error('invalid_pico_home_setup_announcement');
  }
  const moveInCode = record.picoHomeMoveInCode;
  if (typeof moveInCode !== 'string' || moveInCode.trim() === '') {
    // The line without a code is the Home's *second* boot, after somebody
    // claimed it. Named apart, because "already claimed" and "not a Home log"
    // send a person to different places.
    throw new Error('pico_home_setup_announcement_has_no_move_in_code');
  }
  const read = (name: string, pattern: RegExp): string => {
    const value = record[name];
    if (typeof value !== 'string' || !pattern.test(value)) {
      throw new Error(`invalid_pico_home_setup_announcement_field:${name}`);
    }
    return value;
  };
  return {
    moveInCode,
    hostSigningKeyFingerprintHex: read('hostSigningKeyFingerprintHex', fingerprintPattern),
    hostSigningPublicKeyHex: read('hostSigningPublicKeyHex', publicKeyPattern),
    hostKeyAgreementKeyFingerprintHex: read('hostKeyAgreementKeyFingerprintHex', fingerprintPattern),
    hostKeyAgreementPublicKeyHex: read('hostKeyAgreementPublicKeyHex', publicKeyPattern),
  };
}

export interface PicoCompanionFoundingInput {
  socketPath: string;
  profilePath: string;
  coreUrl: string;
  announcement: PicoHomeSetupAnnouncement;
  passphrase: string;
  sodium: VaultSodium;
  /** ADR 0130 E2. The ceremony's approval moments, in this surface's words. */
  announce?: (step: PicoClaimHomeCeremonyStep) => void;
  /**
   * ADR 0099. Who answers the three approvals the ceremony raises.
   *
   * The session that holds the unlocks is also the one that answers, which is
   * the arrangement the recovery first run already uses: a key opened by one
   * party and approved by another would be two people holding one ceremony.
   */
  decisions: PicoCompanionApprovalDecisionPort;
  /** How long this device's first delegation is good for. */
  delegationValidUntil: string;
  /**
   * Where this device's passphrase is sealed so it does not have to be typed
   * at every start.
   *
   * **Optional in the same way and for the same reason as the recovery first
   * run's**: the profile is what makes the device real and the seal is an
   * optimisation on top of it, so a keystore that cannot seal costs a person
   * one typed passphrase per start rather than the founding they just did.
   *
   * It is here at all because leaving it out would have made founding the one
   * way onto a device that asks for its passphrase forever - the same person,
   * two behaviours, decided by which door they came through.
   */
  platformSecrets?: PicoCompanionPlatformSecretPort;
  platformUnlockPath?: string;
  connect?: typeof connectPicoVaultDaemonClient;
}

export interface PicoCompanionFoundingOutcome {
  homeId: string;
  identityKeyFingerprintHex: string;
  /** Whether the passphrase was sealed; recorded rather than assumed. */
  platformUnlockBound: boolean;
}

/**
 * Makes the keys, unlocks them, runs the ceremony, writes the profile.
 *
 * **The profile is written last, and only on a founded Home.** It is what
 * makes this device real to everything else in the companion, so writing it
 * before the Home agreed would leave a device that believes it belongs
 * somewhere that never heard of it. The keys survive a failure on purpose:
 * they are this identity, and the daemon refuses to make a second set into
 * the same vault, so a retry re-uses them rather than starting a new person.
 */
export async function foundPicoCompanionHome(
  input: PicoCompanionFoundingInput,
): Promise<PicoCompanionFoundingOutcome> {
  const connect = input.connect ?? connectPicoVaultDaemonClient;
  /**
   * Before anything is created, because this is where a Home address is first
   * written down and the shell's own prompt check is a courtesy rather than
   * the rule. Until 2026-08-20 nothing here looked at it at all: an address
   * the profile accepted and a grant could never carry produced a founded
   * Home that could not add a second device, and said so about the code.
   */
  assertPicoHomeCoreUrl(input.coreUrl, 'invalid_companion_core_url');
  const delegationId = `delegation_${Buffer.from(
    input.sodium.randombytes_buf(16),
  ).toString('hex')}`;

  /**
   * The keys first, on a plain connection, because their fingerprints are what
   * the session below has to be told to unlock. The recovery first run does
   * the same in the same order for the same reason.
   */
  const bootstrapClient = await connect({ socketPath: input.socketPath });
  let bootstrapped;
  try {
    await bootstrapClient.hello();
    bootstrapped = await bootstrapClient.foundingBootstrap({
      passphrase: input.passphrase,
      targetDelegationId: delegationId,
    });
  } finally {
    await bootstrapClient.close();
  }

  const session = await openPicoCompanionVaultProductSession({
    socketPath: input.socketPath,
    unlock: [
      {
        keyRole: 'pico_identity',
        keyFingerprintHex: bootstrapped.identity.keyFingerprintHex,
        passphrase: input.passphrase,
      },
      {
        keyRole: 'device_signing',
        keyFingerprintHex: bootstrapped.device.signingKeyFingerprintHex,
        passphrase: input.passphrase,
      },
      {
        keyRole: 'device_key_agreement',
        keyFingerprintHex: bootstrapped.device.keyAgreementKeyFingerprintHex,
        passphrase: input.passphrase,
      },
    ],
    decisions: input.decisions,
    ...(input.connect === undefined ? {} : { connect: input.connect }),
  });

  try {
    const founded = await runPicoClaimHomeCeremony({
      client: session.consumerClient,
      vaultSodium: input.sodium,
      coreUrl: input.coreUrl,
      moveInCode: input.announcement.moveInCode,
      signerKeyFingerprintHex: bootstrapped.identity.keyFingerprintHex,
      firstDeviceSigningKeyFingerprintHex: bootstrapped.device.signingKeyFingerprintHex,
      firstDeviceKeyAgreementKeyFingerprintHex:
        bootstrapped.device.keyAgreementKeyFingerprintHex,
      firstDeviceDelegationId: delegationId,
      firstDeviceDelegationValidUntil: input.delegationValidUntil,
      // The person's line, not the endpoint's self-description.
      expectedHostSigningKeyFingerprintHex: input.announcement.hostSigningKeyFingerprintHex,
      expectedHostKeyAgreementKeyFingerprintHex:
        input.announcement.hostKeyAgreementKeyFingerprintHex,
      ...(input.announce === undefined ? {} : { announce: input.announce }),
    }) as { claimState?: { state?: unknown; homeId?: unknown } };

    const claimState = founded.claimState;
    if (claimState?.state !== 'claimed' || typeof claimState.homeId !== 'string') {
      throw new Error('pico_home_did_not_report_a_founding');
    }

    const profile: PicoCompanionProfile = {
      schema: picoCompanionProfileSchema,
      coreUrl: input.coreUrl,
      /**
       * ADR 0115 U4. The founder *is* the Home Host Pico: founding is the one
       * moment where the acceptor pin and this device's own identity are the
       * same fingerprint, and writing it from anywhere else would be copying a
       * value this process already holds.
       */
      home: {
        homeHostPicoIdentityFingerprintHex: bootstrapped.identity.keyFingerprintHex,
      },
      host: {
        signingPublicKeyHex: input.announcement.hostSigningPublicKeyHex,
        signingKeyFingerprintHex: input.announcement.hostSigningKeyFingerprintHex,
        keyAgreementPublicKeyHex: input.announcement.hostKeyAgreementPublicKeyHex,
        keyAgreementKeyFingerprintHex: input.announcement.hostKeyAgreementKeyFingerprintHex,
      },
      identity: {
        keyFingerprintHex: bootstrapped.identity.keyFingerprintHex,
        publicKeyHex: bootstrapped.identity.publicKeyHex,
      },
      device: {
        signingKeyFingerprintHex: bootstrapped.device.signingKeyFingerprintHex,
        keyAgreementKeyFingerprintHex: bootstrapped.device.keyAgreementKeyFingerprintHex,
        delegationId,
      },
    };
    writePicoCompanionProfile(input.profilePath, profile);

    let platformUnlockBound = false;
    if (input.platformSecrets !== undefined) {
      writePicoCompanionPlatformUnlock({
        path: input.platformUnlockPath
          ?? defaultPicoCompanionPlatformUnlockPath(input.profilePath),
        profile,
        passphrase: input.passphrase,
        secrets: input.platformSecrets,
      });
      platformUnlockBound = true;
    }

    return {
      homeId: claimState.homeId,
      identityKeyFingerprintHex: bootstrapped.identity.keyFingerprintHex,
      platformUnlockBound,
    };
  } finally {
    await session.close();
  }
}
