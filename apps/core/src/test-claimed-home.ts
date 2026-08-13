import {
  buildPicoHomeClaimSignatureInput,
  buildPicoHomeFoundingSignatureInput,
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoIdentityPossessionSignatureInput,
  buildPicoLinkDirectRequestSignatureInput,
  picoLinkDirectPayloadDigestHex,
  picoLinkDirectRequestEnvelopeSchema,
  picoHomeClaimEnvelopeSchema,
  picoHomeFoundingAcceptanceSchema,
  picoHomeSealedClaimPayloadSchema,
  picoHomeSealedClaimPayloadV2Schema,
  picoIdentitySuite,
  type PicoHomeClaimResponse,
  type PicoHomeClaimSignatureInput,
  type PicoHomeFoundingAcceptance,
  type PicoHomeFoundingSignatureInput,
  type PicoHomePendingClaimResponse,
  type PicoHomeSetupResponse,
  type PicoIdentityDelegationScope,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoLinkDirectOperation,
  type PicoLinkDirectResponseSignatureInput,
} from '@pico/protocol';
import { randomBytes } from 'node:crypto';
import sodium from 'libsodium-wrappers-sumo';

/**
 * Test support for ADR 0113/0134. Claiming a Home is the only way a booted app
 * ends up holding host keys: the founding record is signed by keys that only
 * setup mode mints, and a Home whose custody does not match its founding stays
 * closed on the next boot. So a suite that needs a *running* claimed Home -
 * not just claimed rows - has to go through the sealed claim.
 *
 * This lived inside `app.test.ts` until a second suite needed it. Copying it
 * would have been two constructions of the same twelve signatures, drifting
 * apart at the first schema change, which is the reason
 * `test-first-device-evidence.ts` exists as well.
 *
 * It is deliberately not a production helper: it mints keys and knows a
 * move-in code, neither of which any production path outside setup mode may
 * do. It also refuses by throwing rather than asserting, so it stays usable
 * from a fixture that is not itself the thing under test.
 */

/** As much of a booted app as claiming needs. */
export interface PicoClaimableApp {
  inject(request: {
    method: string;
    url: string;
    payload?: unknown;
  }): Promise<{ statusCode: number; json(): unknown }>;
}

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

export async function claimPicoHomeThroughSealedFlow(
  app: PicoClaimableApp,
  moveInCode: string,
  overrides?: PicoSealedClaimOverrides,
): Promise<{
  setup: PicoHomeSetupResponse;
  sealedClaim: PicoTestSealedHomeClaim;
  claimResponse: PicoHomeClaimResponse;
}> {
  const setup = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as PicoHomeSetupResponse;
  const sealedClaim = createSealedPicoHomeClaim(setup, moveInCode, overrides);
  const pending = await app.inject({
    method: 'POST',
    url: '/api/home/claim',
    payload: { claimEnvelope: sealedClaim.claimEnvelope },
  });
  if (pending.statusCode !== 202) {
    throw new Error(`pico_home_claim_not_pending:${pending.statusCode}`);
  }

  const acceptance = createPicoHomeFoundingAcceptance(
    sealedClaim,
    (pending.json() as PicoHomePendingClaimResponse).pendingClaim.founding,
  );
  const claimed = await app.inject({
    method: 'POST',
    url: '/api/home/claim',
    payload: { foundingAcceptance: acceptance },
  });
  if (claimed.statusCode !== 201) {
    throw new Error(`pico_home_claim_not_accepted:${claimed.statusCode}`);
  }

  return {
    setup,
    sealedClaim,
    claimResponse: claimed.json() as PicoHomeClaimResponse,
  };
}

export interface PicoSealedClaimOverrides {
  claimantSignatureHex?: string;
  hostSetupNonceHex?: string;
  firstDeviceSignatureHex?: string;
  omitFirstDeviceSignature?: boolean;
  delegationScopes?: PicoIdentityDelegationScope[];
  delegationValidFrom?: string;
  delegationValidUntil?: string;
  delegationSubjectSigningKeyFingerprintHex?: string;
  claimFirstDeviceSigningKeyFingerprintHex?: string;
  legacyV1?: boolean;
}

export interface PicoTestSealedHomeClaim {
  claimEnvelope: { schema: typeof picoHomeClaimEnvelopeSchema; sealedClaimPayloadHex: string };
  expectedHomeHostPicoId: string;
  moveInCode: string;
  claim: PicoHomeClaimSignatureInput;
  claimantIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  firstDeviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
  firstDeviceKeyAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput;
  firstDeviceDelegation: {
    record: PicoIdentityDelegationSignatureInput;
    signatureHex: string;
  };
  firstDeviceSigningPrivateKey: Uint8Array;
  /**
   * The half a push is sealed to. Held here because a test that wants to prove
   * the device can *open* what the Home sent has no other way to reach it -
   * ADR 0150's whole point is that nobody else can.
   */
  firstDeviceKeyAgreementPrivateKey: Uint8Array;
  claimantPrivateKey: Uint8Array;
  claimantSignatureHex: string;
}

export function createSealedPicoHomeClaim(
  setup: PicoHomeSetupResponse,
  moveInCode: string,
  overrides: PicoSealedClaimOverrides = {},
): PicoTestSealedHomeClaim {
  const claimant = sodium.crypto_sign_keypair();
  const claimantIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'pico_identity',
    publicKeyHex: bytesToHex(claimant.publicKey),
  };
  const claimantIdentityKeyFingerprintHex = bytesToHex(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(claimantIdentityKeyRecord),
    null,
  ));
  const firstDeviceSigning = sodium.crypto_sign_keypair();
  const firstDeviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'device_signing',
    publicKeyHex: bytesToHex(firstDeviceSigning.publicKey),
  };
  const firstDeviceSigningKeyFingerprintHex = bytesToHex(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(firstDeviceSigningKeyRecord),
    null,
  ));
  const firstDeviceAgreement = sodium.crypto_box_keypair();
  const firstDeviceKeyAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'device_key_agreement',
    publicKeyHex: bytesToHex(firstDeviceAgreement.publicKey),
  };
  const firstDeviceKeyAgreementKeyFingerprintHex = bytesToHex(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(firstDeviceKeyAgreementKeyRecord),
    null,
  ));
  const firstDeviceDelegation: PicoIdentityDelegationSignatureInput = {
    suite: picoIdentitySuite,
    delegationId: `delegation_${randomHex(16)}`,
    issuerIdentityKeyFingerprintHex: claimantIdentityKeyFingerprintHex,
    subjectSigningKeyFingerprintHex:
      overrides.delegationSubjectSigningKeyFingerprintHex
      ?? firstDeviceSigningKeyFingerprintHex,
    subjectKeyAgreementKeyFingerprintHex: firstDeviceKeyAgreementKeyFingerprintHex,
    scopes: overrides.delegationScopes ?? ['surface_session'],
    validFrom: overrides.delegationValidFrom ?? '2026-01-01T00:00:00.000Z',
    validUntil: overrides.delegationValidUntil ?? '2030-01-01T00:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000001',
  };
  const signedFirstDeviceDelegation = {
    record: firstDeviceDelegation,
    signatureHex: bytesToHex(sodium.crypto_sign_detached(
      buildPicoIdentityDelegationSignatureInput(firstDeviceDelegation),
      claimant.privateKey,
    )),
  };
  const claim: PicoHomeClaimSignatureInput = {
    suite: picoIdentitySuite,
    claimId: `claim_${randomHex(16)}`,
    hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex: setup.host.keyAgreementKeyFingerprintHex,
    moveInCode,
    claimantIdentityKeyFingerprintHex,
    claimantNonceHex: randomHex(32),
    hostSetupNonceHex: overrides.hostSetupNonceHex ?? setup.setupMode.hostSetupNonceHex,
    firstDeviceDelegationId: firstDeviceDelegation.delegationId,
    firstDeviceSigningKeyFingerprintHex:
      overrides.claimFirstDeviceSigningKeyFingerprintHex
      ?? firstDeviceSigningKeyFingerprintHex,
    firstDeviceKeyAgreementKeyFingerprintHex,
  };
  const signatureHex = overrides.claimantSignatureHex ?? bytesToHex(sodium.crypto_sign_detached(
    buildPicoHomeClaimSignatureInput(claim),
    claimant.privateKey,
  ));
  const sealedPayload: Record<string, unknown> = {
    schema: picoHomeSealedClaimPayloadV2Schema,
    claim,
    claimantIdentityKeyRecord,
    firstDeviceSigningKeyRecord,
    firstDeviceKeyAgreementKeyRecord,
    firstDeviceDelegation: signedFirstDeviceDelegation,
    firstDeviceRevocations: [],
    claimantSignatureHex: signatureHex,
    firstDeviceSignatureHex: overrides.firstDeviceSignatureHex
      ?? bytesToHex(sodium.crypto_sign_detached(
        buildPicoHomeClaimSignatureInput(claim),
        firstDeviceSigning.privateKey,
      )),
  };
  if (overrides.omitFirstDeviceSignature) {
    delete sealedPayload.firstDeviceSignatureHex;
  }
  if (overrides.legacyV1) {
    const {
      firstDeviceDelegationId: _firstDeviceDelegationId,
      firstDeviceSigningKeyFingerprintHex: _firstDeviceSigningKeyFingerprintHex,
      firstDeviceKeyAgreementKeyFingerprintHex: _firstDeviceKeyAgreementKeyFingerprintHex,
      ...v1Claim
    } = claim;
    sealedPayload.schema = picoHomeSealedClaimPayloadSchema;
    sealedPayload.claim = v1Claim;
    sealedPayload.claimantSignatureHex = bytesToHex(sodium.crypto_sign_detached(
      buildPicoHomeClaimSignatureInput(v1Claim),
      claimant.privateKey,
    ));
    delete sealedPayload.firstDeviceSigningKeyRecord;
    delete sealedPayload.firstDeviceKeyAgreementKeyRecord;
    delete sealedPayload.firstDeviceDelegation;
    delete sealedPayload.firstDeviceRevocations;
    delete sealedPayload.firstDeviceSignatureHex;
  }
  const sealed = sodium.crypto_box_seal(
    Buffer.from(JSON.stringify(sealedPayload), 'utf8'),
    hexToBytes(setup.host.keyAgreementPublicKeyHex),
  );

  return {
    claimEnvelope: {
      schema: picoHomeClaimEnvelopeSchema,
      sealedClaimPayloadHex: bytesToHex(sealed),
    },
    expectedHomeHostPicoId: `pico:identity:${claimantIdentityKeyFingerprintHex}`,
    moveInCode,
    claim,
    claimantIdentityKeyRecord,
    firstDeviceSigningKeyRecord,
    firstDeviceKeyAgreementKeyRecord,
    firstDeviceDelegation: signedFirstDeviceDelegation,
    firstDeviceSigningPrivateKey: firstDeviceSigning.privateKey,
    firstDeviceKeyAgreementPrivateKey: firstDeviceAgreement.privateKey,
    claimantPrivateKey: claimant.privateKey,
    claimantSignatureHex: signatureHex,
  };
}

export function createPicoHomeFoundingAcceptance(
  sealedClaim: PicoTestSealedHomeClaim,
  founding: PicoHomeFoundingSignatureInput,
): PicoHomeFoundingAcceptance {
  return {
    schema: picoHomeFoundingAcceptanceSchema,
    claimId: sealedClaim.claim.claimId,
    foundingId: founding.foundingId,
    claimantFoundingSignatureHex: bytesToHex(sodium.crypto_sign_detached(
      buildPicoHomeFoundingSignatureInput(founding),
      sealedClaim.claimantPrivateKey,
    )),
  };
}

export interface PicoTestSessionDevice {
  session: string;
  delegationId: string;
  deviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
  deviceKeyAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  deviceSigningPrivateKey: Uint8Array;
  /** What a push is sealed to. */
  deviceKeyAgreementPrivateKey: Uint8Array;
  picoIdentityFingerprintHex: string;
}

function keyRecordFingerprintHex(keyRecord: PicoIdentityKeyRecordSignatureInput): string {
  return bytesToHex(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(keyRecord),
    null,
  ));
}

/**
 * The device half, through the front door: an identity session is what
 * registers a reader key (ADR 0116), so a device that has never held one is a
 * device no Home can seal anything to. Tests that want a *sealable* device get
 * it here rather than by writing the key row themselves, because writing the
 * row would prove the sweep works against state no production path produces.
 */
export async function createPicoIdentitySessionDevice(
  app: PicoClaimableApp,
  input: {
    identityKeyRecord: PicoIdentityKeyRecordSignatureInput;
    identityPrivateKey: Uint8Array;
    idSuffix: string;
    /** Defaults to what a surface needs; a push needs the envelope scopes. */
    scopes?: PicoIdentityDelegationScope[];
    /** Later than any delegation this identity already has. */
    lifecycleOrder?: string;
  },
): Promise<PicoTestSessionDevice> {
  const { identityKeyRecord, identityPrivateKey, idSuffix } = input;
  const identityFingerprintHex = keyRecordFingerprintHex(identityKeyRecord);
  const deviceSigning = sodium.crypto_sign_keypair();
  const deviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'device_signing',
    publicKeyHex: bytesToHex(deviceSigning.publicKey),
  };
  const deviceAgreement = sodium.crypto_box_keypair();
  const deviceAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'device_key_agreement',
    publicKeyHex: bytesToHex(deviceAgreement.publicKey),
  };
  const delegation: PicoIdentityDelegationSignatureInput = {
    suite: picoIdentitySuite,
    delegationId: `delegation_${idSuffix}`,
    issuerIdentityKeyFingerprintHex: identityFingerprintHex,
    subjectSigningKeyFingerprintHex: keyRecordFingerprintHex(deviceSigningKeyRecord),
    subjectKeyAgreementKeyFingerprintHex: keyRecordFingerprintHex(deviceAgreementKeyRecord),
    scopes: input.scopes ?? ['surface_session'],
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
    lifecycleOrder: input.lifecycleOrder ?? 'seq:0000000000000001',
  };
  const challenge = (await app.inject({
    method: 'POST',
    url: '/api/auth/identity-challenges',
  })).json() as {
    challengeId: string;
    verifierNonceHex: string;
    verifierContext: string;
  };
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/identity-session',
    payload: {
      challengeId: challenge.challengeId,
      identityKeyRecord,
      deviceSigningKeyRecord,
      deviceKeyAgreementKeyRecord: deviceAgreementKeyRecord,
      delegation: {
        record: delegation,
        signatureHex: bytesToHex(sodium.crypto_sign_detached(
          buildPicoIdentityDelegationSignatureInput(delegation),
          identityPrivateKey,
        )),
      },
      revocations: [],
      possessionSignatureHex: bytesToHex(sodium.crypto_sign_detached(
        buildPicoIdentityPossessionSignatureInput({
          suite: picoIdentitySuite,
          subjectKeyFingerprintHex: keyRecordFingerprintHex(deviceSigningKeyRecord),
          verifierNonceHex: challenge.verifierNonceHex,
          verifierContext: challenge.verifierContext,
        }),
        deviceSigning.privateKey,
      )),
    },
  });

  if (response.statusCode !== 201) {
    throw new Error(`pico_identity_session_refused:${response.statusCode}`);
  }

  return {
    session: (response.json() as { session: string }).session,
    delegationId: delegation.delegationId,
    deviceSigningKeyRecord,
    deviceKeyAgreementKeyRecord: deviceAgreementKeyRecord,
    deviceSigningKeyFingerprintHex: keyRecordFingerprintHex(deviceSigningKeyRecord),
    deviceKeyAgreementKeyFingerprintHex: keyRecordFingerprintHex(deviceAgreementKeyRecord),
    deviceSigningPrivateKey: deviceSigning.privateKey,
    deviceKeyAgreementPrivateKey: deviceAgreement.privateKey,
    picoIdentityFingerprintHex: identityFingerprintHex,
  };
}

/**
 * The whole way in, once: Home, then a device that can be sealed to.
 *
 * **There is no membership step, and that is the part worth writing down.**
 * Claiming admits the claimant: the host records its own membership as part of
 * founding and refuses to reissue it, so a fixture that tries to add one is
 * told `home_host_membership_is_not_reissued`. Everyone *else* needs the
 * credential route (ADR 0114); the person who moved in does not.
 *
 * The move-in code is passed in rather than scraped, because how a suite gets
 * at its host log is its own business.
 */
export async function openPicoHomeWithDevice(
  app: PicoClaimableApp,
  input: {
    moveInCode: string;
    idSuffix: string;
    /** Delegation scopes for the device. */
    scopes?: PicoIdentityDelegationScope[];
  },
): Promise<{
  sealedClaim: PicoTestSealedHomeClaim;
  device: PicoTestSessionDevice;
  homeId: string;
}> {
  const { sealedClaim, claimResponse } = await claimPicoHomeThroughSealedFlow(
    app,
    input.moveInCode,
  );
  const homeId = claimResponse.claimState.homeId;
  if (typeof homeId !== 'string') {
    throw new Error('pico_home_claim_returned_no_home_id');
  }

  const device = await createPicoIdentitySessionDevice(app, {
    identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
    identityPrivateKey: sealedClaim.claimantPrivateKey,
    idSuffix: input.idSuffix,
    // The claim already recorded the first device at seq 1 under this same
    // identity. A second delegation reusing that order is not a second device,
    // it is a contradicting statement about the first.
    lifecycleOrder: 'seq:0000000000000002',
    ...(input.scopes === undefined ? {} : { scopes: input.scopes }),
  });

  return { sealedClaim, device, homeId };
}

/**
 * ADR 0107 D1. One sealed, signed Link request, built the way a device builds
 * one.
 *
 * **This was a named gap three times before it was written.** Every suite that
 * wanted to prove a Link operation had to construct a sealed envelope, a
 * detached signature over canonical bytes, an argument digest and a reply
 * keypair - about forty lines - so the operations that were easy to reach kept
 * getting proved and the rest did not. The envelope is the fixture, and having
 * one is the difference between testing a dispatch and testing a route.
 */
export async function sendPicoLinkDirectRequest(
  app: PicoClaimableApp,
  input: {
    operation: PicoLinkDirectOperation;
    args: Record<string, unknown>;
    sender: PicoTestSessionDevice;
    identityKeyRecord: PicoIdentityKeyRecordSignatureInput;
    hostSigningKeyFingerprintHex: string;
    hostKeyAgreementPublicKeyHex: string;
  },
): Promise<{
  response: PicoLinkDirectResponseSignatureInput;
  result: Record<string, unknown>;
}> {
  const replyKey = sodium.crypto_box_keypair();
  const createdAtMs = Date.now();
  const request = {
    suite: picoIdentitySuite,
    requestId: `linkreq_${randomHex(16)}`,
    operation: input.operation,
    hostSigningKeyFingerprintHex: input.hostSigningKeyFingerprintHex,
    senderIdentityKeyFingerprintHex: keyRecordFingerprintHex(input.identityKeyRecord),
    senderDeviceSigningKeyFingerprintHex: input.sender.deviceSigningKeyFingerprintHex,
    senderDeviceKeyAgreementKeyFingerprintHex: input.sender.deviceKeyAgreementKeyFingerprintHex,
    senderDelegationId: input.sender.delegationId,
    replyPublicKeyHex: bytesToHex(replyKey.publicKey),
    argumentsDigestHex: picoLinkDirectPayloadDigestHex(sodium, input.args),
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(createdAtMs + 30_000).toISOString(),
  };
  const linked = await app.inject({
    method: 'POST',
    url: '/api/home/link',
    payload: {
      schema: picoLinkDirectRequestEnvelopeSchema,
      sealedRequestHex: bytesToHex(sodium.crypto_box_seal(
        Buffer.from(JSON.stringify({
          schema: picoLinkDirectRequestEnvelopeSchema,
          request,
          senderIdentityKeyRecord: input.identityKeyRecord,
          senderDeviceSigningKeyRecord: input.sender.deviceSigningKeyRecord,
          arguments: input.args,
          senderSignatureHex: bytesToHex(sodium.crypto_sign_detached(
            buildPicoLinkDirectRequestSignatureInput(request),
            input.sender.deviceSigningPrivateKey,
          )),
        }), 'utf8'),
        hexToBytes(input.hostKeyAgreementPublicKeyHex),
      )),
    },
  });
  if (linked.statusCode !== 200) {
    throw new Error(`pico_link_direct_refused:${linked.statusCode}:${JSON.stringify(linked.json())}`);
  }
  return JSON.parse(new TextDecoder().decode(sodium.crypto_box_seal_open(
    hexToBytes((linked.json() as { sealedResponseHex: string }).sealedResponseHex),
    replyKey.publicKey,
    replyKey.privateKey,
  ))) as { response: PicoLinkDirectResponseSignatureInput; result: Record<string, unknown> };
}
