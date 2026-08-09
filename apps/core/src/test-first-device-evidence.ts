import {
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  picoIdentitySuite,
  type PicoHomeFirstDeviceEvidence,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
} from '@pico/protocol';

/**
 * Test support for ADR 0134 F2. Before the collapse, a test could found a Home
 * with a founding record that carried no first-device evidence, and the store
 * classified it as `legacyFounding` and left it unreconciled. That state no
 * longer exists: writing a founding record verifies the lifecycle evidence, so
 * every test that founds a Home needs evidence that actually verifies.
 *
 * Building it by hand in each suite would mean seven near-copies of the same
 * key/delegation/signature construction, and near-copies drift. This produces
 * one valid set from a claimant identity key, with the fingerprints the
 * founding input has to repeat.
 *
 * It is deliberately not a production helper: it mints keys, which no
 * production path outside the Vault may do.
 */
export interface PicoTestFirstDeviceEvidence extends PicoHomeFirstDeviceEvidence {
  /** The three values `founding` must carry for this evidence to reconcile. */
  foundingFields: {
    firstDeviceDelegationId: string;
    firstDeviceSigningKeyFingerprintHex: string;
    firstDeviceKeyAgreementKeyFingerprintHex: string;
  };
  /** Set only when this helper minted the device signing key. */
  firstDeviceSigningPrivateKey?: Uint8Array;
}

export interface SodiumLike {
  crypto_sign_keypair(): { publicKey: Uint8Array; privateKey: Uint8Array };
  crypto_box_keypair(): { publicKey: Uint8Array; privateKey: Uint8Array };
  crypto_generichash(length: number, message: Uint8Array, key: null): Uint8Array;
  crypto_sign_detached(message: Uint8Array, privateKey: Uint8Array): Uint8Array;
}

export function createPicoTestFirstDeviceEvidence(input: {
  sodium: SodiumLike;
  /** The identity key that issues the delegation - the claimant's root. */
  claimantIdentityPrivateKey: Uint8Array;
  claimantIdentityKeyFingerprintHex: string;
  /**
   * The device the founding delegates to. A suite that already has a device -
   * a recovery sponsor, say - passes its key records here, because the first
   * device and that device are the same device: a Home founded on one device
   * has exactly one delegation until it enrolls a second.
   */
  signingKeyRecord?: PicoIdentityKeyRecordSignatureInput;
  keyAgreementKeyRecord?: PicoIdentityKeyRecordSignatureInput;
  delegationId?: string;
  scopes?: readonly string[];
  validFrom?: string;
  validUntil?: string;
  lifecycleOrder?: string;
}): PicoTestFirstDeviceEvidence {
  const { sodium } = input;
  const mintedSigning = input.signingKeyRecord === undefined
    ? sodium.crypto_sign_keypair()
    : undefined;
  const firstDeviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput =
    input.signingKeyRecord ?? {
      suite: picoIdentitySuite,
      keyRole: 'device_signing',
      publicKeyHex: hex(mintedSigning!.publicKey),
    };
  const firstDeviceSigningKeyFingerprintHex = fingerprint(
    sodium,
    firstDeviceSigningKeyRecord,
  );

  const firstDeviceKeyAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput =
    input.keyAgreementKeyRecord ?? {
      suite: picoIdentitySuite,
      keyRole: 'device_key_agreement',
      publicKeyHex: hex(sodium.crypto_box_keypair().publicKey),
    };
  const firstDeviceKeyAgreementKeyFingerprintHex = fingerprint(
    sodium,
    firstDeviceKeyAgreementKeyRecord,
  );

  const record: PicoIdentityDelegationSignatureInput = {
    suite: picoIdentitySuite,
    delegationId: input.delegationId ?? 'delegation_first_device_0001',
    issuerIdentityKeyFingerprintHex: input.claimantIdentityKeyFingerprintHex,
    subjectSigningKeyFingerprintHex: firstDeviceSigningKeyFingerprintHex,
    subjectKeyAgreementKeyFingerprintHex: firstDeviceKeyAgreementKeyFingerprintHex,
    scopes: [...(input.scopes ?? ['surface_session'])],
    validFrom: input.validFrom ?? '2026-01-01T00:00:00.000Z',
    validUntil: input.validUntil ?? '2030-01-01T00:00:00.000Z',
    lifecycleOrder: input.lifecycleOrder ?? 'seq:0000000000000001',
  } as PicoIdentityDelegationSignatureInput;

  return {
    firstDeviceSigningKeyRecord,
    firstDeviceKeyAgreementKeyRecord,
    firstDeviceDelegation: {
      record,
      signatureHex: hex(sodium.crypto_sign_detached(
        buildPicoIdentityDelegationSignatureInput(record),
        input.claimantIdentityPrivateKey,
      )),
    },
    firstDeviceRevocations: [],
    foundingFields: {
      firstDeviceDelegationId: record.delegationId,
      firstDeviceSigningKeyFingerprintHex,
      firstDeviceKeyAgreementKeyFingerprintHex,
    },
    firstDeviceSigningPrivateKey: mintedSigning?.privateKey,
  };
}

function fingerprint(
  sodium: SodiumLike,
  record: PicoIdentityKeyRecordSignatureInput,
): string {
  return hex(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(record),
    null,
  ));
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
