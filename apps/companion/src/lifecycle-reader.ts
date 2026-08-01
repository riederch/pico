import type { VaultSodium } from '@pico/vault';
import {
  createPicoLinkDirectClient,
  readPicoHomeDeviceLifecycle,
  type PicoVaultDaemonClient,
} from '@pico/vault-daemon';
import type { PicoCompanionLifecycleReader } from './alarm-carrier.js';
import type { PicoCompanionProfile } from './profile.js';

/**
 * Wires the profile to the proven daemon and Link clients: an authenticated
 * lifecycle read as this device, exactly what the ADR 0112 alarm carrier
 * consumes. Pure composition of process-proven parts - its own end-to-end
 * proof against a real founded Home is the ADR 0113 C2 gate.
 */
export async function createPicoCompanionLifecycleReader(input: {
  profile: PicoCompanionProfile;
  daemonClient: PicoVaultDaemonClient;
  sodium: VaultSodium;
}): Promise<PicoCompanionLifecycleReader> {
  const { profile } = input;
  const linkClient = await createPicoLinkDirectClient({
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
  });

  const sender = {
    identityKeyFingerprintHex: profile.identity.keyFingerprintHex,
    identityPublicKeyHex: profile.identity.publicKeyHex,
    deviceSigningKeyFingerprintHex: profile.device.signingKeyFingerprintHex,
    deviceKeyAgreementKeyFingerprintHex:
      profile.device.keyAgreementKeyFingerprintHex,
    delegationId: profile.device.delegationId,
  };

  return async () => {
    const view = await readPicoHomeDeviceLifecycle(linkClient, {
      identityKeyFingerprintHex: profile.identity.keyFingerprintHex,
      sponsor: sender,
    });
    // The snapshot carries the identity it was read as, so the alarm can name
    // it without a second source of truth (ADR 0112).
    return {
      picoIdentityFingerprintHex: profile.identity.keyFingerprintHex,
      pendingRecovery: view.pendingRecovery,
    };
  };
}
