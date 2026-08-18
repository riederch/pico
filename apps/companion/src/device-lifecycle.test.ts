import { describe, expect, it } from 'vitest';
import type { PicoVaultDaemonClient } from '@pico/vault-daemon/client';
import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';
import {
  picoCompanionDeviceRevocationReasons,
  readPicoCompanionDeviceAuthority,
  revokePicoCompanionDeviceAuthority,
} from './device-lifecycle.js';
import type { PicoCompanionProfile } from './profile.js';

/**
 * ADR 0130 E3's two refusals, which the real-process test cannot reach yet.
 *
 * `device-lifecycle-real-process.test.ts` drives this against a real Home and
 * a real daemon, and there the founding device always holds the identity key -
 * the branch where it does not belongs to an enrolled second device, which
 * arrives with enrolment. Held here rather than left until then, because
 * "this device cannot do that" is the answer a person on their phone will get
 * first, and a surface that offered the control anyway would fail at the
 * vault with a word nobody outside this repository can read.
 */
const identityKeyFingerprintHex = 'a1'.repeat(32);
const deviceSigningKeyFingerprintHex = 'b2'.repeat(32);
const deviceKeyAgreementKeyFingerprintHex = 'c3'.repeat(32);
const delegationId = `delegation_${'d4'.repeat(16)}`;

const profile: PicoCompanionProfile = {
  schema: 'pico.companion.profile.v1',
  coreUrl: 'http://127.0.0.1:3000',
  home: { homeHostPicoIdentityFingerprintHex: identityKeyFingerprintHex },
  host: {
    signingPublicKeyHex: 'e5'.repeat(32),
    signingKeyFingerprintHex: 'e6'.repeat(32),
    keyAgreementPublicKeyHex: 'e7'.repeat(32),
    keyAgreementKeyFingerprintHex: 'e8'.repeat(32),
  },
  identity: { keyFingerprintHex: identityKeyFingerprintHex, publicKeyHex: 'a2'.repeat(32) },
  device: {
    signingKeyFingerprintHex: deviceSigningKeyFingerprintHex,
    keyAgreementKeyFingerprintHex: deviceKeyAgreementKeyFingerprintHex,
    delegationId,
  },
} as PicoCompanionProfile;

function linkClient(asked: string[]): PicoLinkDirectClient {
  return {
    hostSigningKeyFingerprintHex: profile.host.signingKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex: profile.host.keyAgreementKeyFingerprintHex,
    sender: {
      identityKeyFingerprintHex,
      identityPublicKeyHex: profile.identity.publicKeyHex,
      deviceSigningKeyFingerprintHex,
      deviceKeyAgreementKeyFingerprintHex,
      delegationId,
    },
    request: async (operation) => {
      asked.push(operation);
      return {
        outcome: 'ok',
        result: {
          homeId: `home_${'f'.repeat(32)}`,
          picoIdentityFingerprintHex: identityKeyFingerprintHex,
          observedLifecycleOrder: 'seq:0000000000000001',
          devices: [{
            delegationId,
            deviceSigningKeyFingerprintHex,
            deviceKeyAgreementKeyFingerprintHex,
            lifecycleOrder: 'seq:0000000000000001',
            validUntil: '2027-01-01T00:00:00.000Z',
            status: 'active',
          }],
          pendingRecovery: null,
        },
      };
    },
  };
}

/** A vault holding device keys and no identity key: a delegated device. */
function delegatedDeviceDaemon(statusCalls: string[]): PicoVaultDaemonClient {
  return {
    status: async () => {
      statusCalls.push('status');
      return {
        sessions: [
          {
            keyRole: 'device_signing',
            keyFingerprintHex: deviceSigningKeyFingerprintHex,
            publicKeyHex: 'b3'.repeat(32),
          },
          {
            keyRole: 'device_key_agreement',
            keyFingerprintHex: deviceKeyAgreementKeyFingerprintHex,
            publicKeyHex: 'c4'.repeat(32),
          },
        ],
      };
    },
  } as unknown as PicoVaultDaemonClient;
}

describe('ADR 0130 E3 - a device that cannot end an authority', () => {
  it('still shows the list, and says it cannot end anything', async () => {
    /**
     * Both halves matter. Hiding the list from a device without the identity
     * key would hide from a person, on the machine they have with them, which
     * of their devices can act as them - which is the question somebody with
     * a stolen laptop opens this to answer.
     */
    const asked: string[] = [];
    const view = await readPicoCompanionDeviceAuthority({
      profile,
      daemonClient: delegatedDeviceDaemon([]),
      livingDeviceLinkClient: linkClient(asked),
    });
    expect(view.devices).toHaveLength(1);
    expect(view.devices[0]?.isThisDevice).toBe(true);
    expect(view.mayEndAuthority).toBe(false);
    expect(asked).toEqual(['home.device.lifecycle.read']);
  });

  it('refuses before it asks the Home for anything', async () => {
    const asked: string[] = [];
    await expect(revokePicoCompanionDeviceAuthority({
      profile,
      daemonClient: delegatedDeviceDaemon([]),
      livingDeviceLinkClient: linkClient(asked),
      sodium: {} as never,
      targetDelegationId: delegationId,
      reason: 'device_retired',
    })).rejects.toThrow('pico_companion_device_holds_no_identity_key');
    // Nothing was submitted and nothing was even read: a refusal this device
    // can decide by itself does not cost the Home a request.
    expect(asked).toEqual([]);
  });

  it('refuses a reason that is the machinery’s, before touching the vault', async () => {
    /**
     * `key_rotated` is a real protocol category and belongs to renewal, which
     * writes it as part of its own transition. Reaching this surface with it
     * would mean a window offering a person a reason that is not theirs.
     */
    const statusCalls: string[] = [];
    const asked: string[] = [];
    await expect(revokePicoCompanionDeviceAuthority({
      profile,
      daemonClient: delegatedDeviceDaemon(statusCalls),
      livingDeviceLinkClient: linkClient(asked),
      sodium: {} as never,
      targetDelegationId: delegationId,
      reason: 'key_rotated' as never,
    })).rejects.toThrow('invalid_pico_companion_revocation_reason');
    expect(statusCalls).toEqual([]);
    expect(asked).toEqual([]);
    expect(picoCompanionDeviceRevocationReasons).not.toContain('key_rotated');
  });
});
