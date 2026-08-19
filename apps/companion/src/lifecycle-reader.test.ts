import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  buildPicoHomeContinuitySignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoLinkDirectRequestSignatureInput,
  buildPicoLinkDirectResponseSignatureInput,
  picoHomeContinuityChainSchema,
  picoHomeContinuityRecordSchema,
  picoIdentitySuite,
  picoLinkDirectPayloadDigestHex,
  picoLinkDirectRequestEnvelopeSchema,
  picoLinkDirectResponseEnvelopeSchema,
  type PicoHomeContinuityRecord,
  type PicoHomeContinuitySignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoLinkDirectRequestSignatureInput,
} from '@pico/protocol';
import type { VaultSodium } from '@pico/vault';
import type { PicoVaultDaemonClient } from '@pico/vault-daemon';
import { createPicoCompanionLifecycleReader } from './lifecycle-reader.js';
import type {
  PicoCompanionHostContinuityAlarm,
  PicoCompanionHostRotationNotice,
} from './host-repin.js';
import {
  readPicoCompanionProfile,
  writePicoCompanionProfile,
  type PicoCompanionProfile,
} from './profile.js';

let vaultSodium: VaultSodium;
const temporaryDirectories: string[] = [];

beforeAll(async () => {
  await sodium.ready;
  vaultSodium = sodium as unknown as VaultSodium;
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function tempProfilePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pico-companion-reader-'));
  temporaryDirectories.push(directory);
  return join(directory, 'profile.json');
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function unhex(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'hex'));
}

interface TestKeypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

function keyRecord(
  keyRole: PicoIdentityKeyRecordSignatureInput['keyRole'],
  publicKey: Uint8Array,
): PicoIdentityKeyRecordSignatureInput {
  return { suite: picoIdentitySuite, keyRole, publicKeyHex: hex(publicKey) };
}

function fingerprint(record: PicoIdentityKeyRecordSignatureInput): string {
  return hex(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(record),
    null,
  ));
}

interface HostEra {
  signing: TestKeypair;
  agreement: TestKeypair;
  signingRecord: PicoIdentityKeyRecordSignatureInput;
  signingFingerprintHex: string;
  agreementFingerprintHex: string;
}

function hostEra(): HostEra {
  const signing: TestKeypair = sodium.crypto_sign_keypair();
  const agreement: TestKeypair = sodium.crypto_box_keypair();
  const signingRecord = keyRecord('home_host_signing', signing.publicKey);
  return {
    signing,
    agreement,
    signingRecord,
    signingFingerprintHex: fingerprint(signingRecord),
    agreementFingerprintHex: fingerprint(
      keyRecord('home_host_key_agreement', agreement.publicKey),
    ),
  };
}

function acceptorFixture() {
  const keypair: TestKeypair = sodium.crypto_sign_keypair();
  const record = keyRecord('pico_identity', keypair.publicKey);
  return { keypair, record, fingerprintHex: fingerprint(record) };
}

function continuityLink(
  outgoing: HostEra,
  incoming: HostEra,
  acceptor: ReturnType<typeof acceptorFixture>,
  lifecycleOrder: string,
): PicoHomeContinuityRecord {
  const continuity: PicoHomeContinuitySignatureInput = {
    suite: picoIdentitySuite,
    continuityId: `continuity_${lifecycleOrder.slice(-4)}`,
    homeId: 'home_reader_test',
    outgoingHostSigningKeyFingerprintHex: outgoing.signingFingerprintHex,
    outgoingHostKeyAgreementKeyFingerprintHex: outgoing.agreementFingerprintHex,
    incomingHostSigningKeyFingerprintHex: incoming.signingFingerprintHex,
    incomingHostKeyAgreementKeyFingerprintHex: incoming.agreementFingerprintHex,
    homeHostPicoIdentityFingerprintHex: acceptor.fingerprintHex,
    reasonCategory: 'host_key_rotated',
    changedAt: '2026-08-02T10:00:00.000Z',
    lifecycleOrder,
  };
  const input = buildPicoHomeContinuitySignatureInput(continuity);
  return {
    schema: picoHomeContinuityRecordSchema,
    continuity,
    outgoingHostSigningKeyRecord: outgoing.signingRecord,
    incomingHostSigningKeyRecord: incoming.signingRecord,
    homeHostPicoIdentityKeyRecord: acceptor.record,
    outgoingHostSignatureHex: hex(sodium.crypto_sign_detached(input, outgoing.signing.privateKey)),
    incomingHostSignatureHex: hex(sodium.crypto_sign_detached(input, incoming.signing.privateKey)),
    homeHostPicoSignatureHex: hex(sodium.crypto_sign_detached(input, acceptor.keypair.privateKey)),
    createdAt: '2026-08-02T10:00:00.000Z',
  };
}

interface DeviceFixture {
  identity: TestKeypair;
  identityFingerprintHex: string;
  signing: TestKeypair;
  signingFingerprintHex: string;
  agreementFingerprintHex: string;
  delegationId: string;
}

function deviceFixture(): DeviceFixture {
  const identity: TestKeypair = sodium.crypto_sign_keypair();
  const signing: TestKeypair = sodium.crypto_sign_keypair();
  const agreement: TestKeypair = sodium.crypto_box_keypair();
  return {
    identity,
    identityFingerprintHex: fingerprint(keyRecord('pico_identity', identity.publicKey)),
    signing,
    signingFingerprintHex: fingerprint(keyRecord('device_signing', signing.publicKey)),
    agreementFingerprintHex: fingerprint(
      keyRecord('device_key_agreement', agreement.publicKey),
    ),
    delegationId: 'delegation_reader_test',
  };
}

/** The daemon's two calls the Link client makes, backed by real test keys. */
function fakeDaemonClient(device: DeviceFixture): PicoVaultDaemonClient {
  return {
    status: async () => ({
      sessions: [{
        keyRole: 'device_signing',
        keyFingerprintHex: device.signingFingerprintHex,
        publicKeyHex: hex(device.signing.publicKey),
      }],
      keyfiles: [],
    }),
    sign: async (request: { fields: Record<string, unknown> }) => ({
      keyRole: 'device_signing',
      keyFingerprintHex: device.signingFingerprintHex,
      signatureHex: hex(sodium.crypto_sign_detached(
        buildPicoLinkDirectRequestSignatureInput(
          request.fields as unknown as PicoLinkDirectRequestSignatureInput,
        ),
        device.signing.privateKey,
      )),
    }),
  } as unknown as PicoVaultDaemonClient;
}

/**
 * A Home over fetch: sealed lifecycle reads answered under the CURRENT era's
 * keys - an envelope sealed to a retired era is refused exactly like the
 * real intake refuses it - and the unsealed continuity read beside it.
 */
function fakeHome(input: {
  era: HostEra;
  records: PicoHomeContinuityRecord[];
  servedHead?: HostEra;
  device: DeviceFixture;
}): typeof fetch {
  const servedHead = input.servedHead ?? input.era;
  return (async (target: string | URL | Request, requestInit?: RequestInit) => {
    const url = new URL(String(target));
    if (url.pathname === '/api/home/link/continuity') {
      return new Response(JSON.stringify({
        schema: picoHomeContinuityChainSchema,
        records: input.records,
        head: {
          suite: picoIdentitySuite,
          signingPublicKeyHex: hex(servedHead.signing.publicKey),
          signingKeyFingerprintHex: servedHead.signingFingerprintHex,
          keyAgreementPublicKeyHex: hex(servedHead.agreement.publicKey),
          keyAgreementKeyFingerprintHex: servedHead.agreementFingerprintHex,
        },
      }), { status: 200 });
    }
    if (url.pathname !== '/api/home/link') {
      return new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 });
    }

    const envelope = JSON.parse(String(requestInit?.body)) as {
      sealedRequestHex: string;
    };
    let plaintext: Uint8Array;
    try {
      plaintext = sodium.crypto_box_seal_open(
        unhex(envelope.sealedRequestHex),
        input.era.agreement.publicKey,
        input.era.agreement.privateKey,
      );
    } catch {
      // The strand shape: sealed to an era whose private key is gone.
      return new Response(
        JSON.stringify({ error: 'sealed_request_unreadable' }),
        { status: 400 },
      );
    }
    const sealed = JSON.parse(new TextDecoder().decode(plaintext)) as {
      request: PicoLinkDirectRequestSignatureInput;
      arguments: Record<string, unknown>;
    };
    const result = {
      homeId: 'home_reader_test',
      picoIdentityFingerprintHex: input.device.identityFingerprintHex,
      observedLifecycleOrder: 'seq:0000000000000001',
      devices: [{
        delegationId: input.device.delegationId,
        deviceSigningKeyFingerprintHex: input.device.signingFingerprintHex,
        deviceKeyAgreementKeyFingerprintHex: input.device.agreementFingerprintHex,
        lifecycleOrder: 'seq:0000000000000001',
        validUntil: '2027-01-01T00:00:00.000Z',
        status: 'active',
      }],
      pendingRecovery: null,
    };
    const response = {
      suite: picoIdentitySuite,
      requestId: sealed.request.requestId,
      operation: sealed.request.operation,
      hostSigningKeyFingerprintHex: sealed.request.hostSigningKeyFingerprintHex,
      outcome: 'ok',
      resultDigestHex: picoLinkDirectPayloadDigestHex(
        sodium as never,
        result as unknown as Record<string, unknown>,
      ),
      createdAt: '2026-08-02T10:00:00.000Z',
    };
    return new Response(JSON.stringify({
      schema: picoLinkDirectResponseEnvelopeSchema,
      sealedResponseHex: hex(sodium.crypto_box_seal(
        new TextEncoder().encode(JSON.stringify({
          schema: picoLinkDirectResponseEnvelopeSchema,
          response,
          result,
          hostSignatureHex: hex(sodium.crypto_sign_detached(
            buildPicoLinkDirectResponseSignatureInput(response),
            input.era.signing.privateKey,
          )),
        })),
        unhex(sealed.request.replyPublicKeyHex),
      )),
    }), { status: 200 });
  }) as typeof fetch;
}

function profileFor(
  era: HostEra,
  acceptor: ReturnType<typeof acceptorFixture>,
  device: DeviceFixture,
): PicoCompanionProfile {
  return {
    schema: 'pico.companion.profile.v1',
    coreUrl: 'http://127.0.0.1:1',
    home: { homeHostPicoIdentityFingerprintHex: acceptor.fingerprintHex },
    host: {
      signingPublicKeyHex: hex(era.signing.publicKey),
      signingKeyFingerprintHex: era.signingFingerprintHex,
      keyAgreementPublicKeyHex: hex(era.agreement.publicKey),
      keyAgreementKeyFingerprintHex: era.agreementFingerprintHex,
    },
    identity: {
      keyFingerprintHex: device.identityFingerprintHex,
      publicKeyHex: hex(device.identity.publicKey),
    },
    device: {
      signingKeyFingerprintHex: device.signingFingerprintHex,
      keyAgreementKeyFingerprintHex: device.agreementFingerprintHex,
      delegationId: device.delegationId,
    },
  };
}

function noticeRecorder(): {
  rotated: PicoCompanionHostRotationNotice[];
  unverified: PicoCompanionHostContinuityAlarm[];
  notifications: {
    notifyHostKeysRotated(notice: PicoCompanionHostRotationNotice): void;
    notifyHostContinuityUnverified(alarm: PicoCompanionHostContinuityAlarm): void;
  };
} {
  const rotated: PicoCompanionHostRotationNotice[] = [];
  const unverified: PicoCompanionHostContinuityAlarm[] = [];
  return {
    rotated,
    unverified,
    notifications: {
      notifyHostKeysRotated: (notice) => {
        rotated.push(notice);
      },
      notifyHostContinuityUnverified: (alarm) => {
        unverified.push(alarm);
      },
    },
  };
}

describe('Companion lifecycle reader self-heal (ADR 0115 U4)', () => {
  it('re-pins on the strand shape, retries once and tells the person loudly', async () => {
    const eraA = hostEra();
    const eraB = hostEra();
    const acceptor = acceptorFixture();
    const device = deviceFixture();
    const profilePath = tempProfilePath();
    const profile = profileFor(eraA, acceptor, device);
    writePicoCompanionProfile(profilePath, profile);
    const recorder = noticeRecorder();

    // The Home rotated to era B while this companion still pins era A.
    const reader = await createPicoCompanionLifecycleReader({
      profile,
      profilePath,
      notifications: recorder.notifications,
      daemonClient: fakeDaemonClient(device),
      sodium: vaultSodium,
      fetch: fakeHome({
        era: eraB,
        records: [continuityLink(eraA, eraB, acceptor, 'seq:0000000000000002')],
        device,
      }),
    });

    const snapshot = await reader();
    expect(snapshot).toEqual({
      picoIdentityFingerprintHex: device.identityFingerprintHex,
      pendingRecovery: null,
    });
    expect(recorder.rotated).toEqual([{
      previousHostSigningKeyFingerprintHex: eraA.signingFingerprintHex,
      hostSigningKeyFingerprintHex: eraB.signingFingerprintHex,
      followedLinks: 1,
    }]);
    expect(recorder.unverified).toEqual([]);
    expect(readPicoCompanionProfile(profilePath).host.signingKeyFingerprintHex)
      .toBe(eraB.signingFingerprintHex);

    // The healed reader stays healed: no second notice on the next check.
    await reader();
    expect(recorder.rotated).toHaveLength(1);
  });

  it('keeps the pin and raises the continuity alarm when the chain cannot be verified', async () => {
    const eraA = hostEra();
    const eraB = hostEra();
    const acceptor = acceptorFixture();
    const thiefRoot = acceptorFixture();
    const device = deviceFixture();
    const profilePath = tempProfilePath();
    const profile = profileFor(eraA, acceptor, device);
    writePicoCompanionProfile(profilePath, profile);
    const recorder = noticeRecorder();

    // The Home answers under era B, but the only continuation on offer is
    // accepted by a stranger - the stolen-disk forgery.
    const reader = await createPicoCompanionLifecycleReader({
      profile,
      profilePath,
      notifications: recorder.notifications,
      daemonClient: fakeDaemonClient(device),
      sodium: vaultSodium,
      fetch: fakeHome({
        era: eraB,
        records: [continuityLink(eraA, eraB, thiefRoot, 'seq:0000000000000002')],
        device,
      }),
    });

    await expect(reader()).rejects.toThrow(
      'link_rejected:400:sealed_request_unreadable',
    );
    expect(recorder.unverified).toEqual([{
      coreUrl: profile.coreUrl,
      reason: 'head_bundle_mismatch:foreign_acceptor',
    }]);
    expect(recorder.rotated).toEqual([]);
    expect(readPicoCompanionProfile(profilePath)).toEqual(profile);
  });

  it('raises the alarm when the Home refuses the very pin the chain calls current', async () => {
    const eraA = hostEra();
    const eraB = hostEra();
    const acceptor = acceptorFixture();
    const device = deviceFixture();
    const profilePath = tempProfilePath();
    const profile = profileFor(eraA, acceptor, device);
    writePicoCompanionProfile(profilePath, profile);
    const recorder = noticeRecorder();

    // Sealed reads fail under era B, yet the served chain still claims era A
    // is the head: a half-completed rotation, or an impersonator that cannot
    // mint a continuation. Never a silent re-pin.
    const reader = await createPicoCompanionLifecycleReader({
      profile,
      profilePath,
      notifications: recorder.notifications,
      daemonClient: fakeDaemonClient(device),
      sodium: vaultSodium,
      fetch: fakeHome({ era: eraB, records: [], servedHead: eraA, device }),
    });

    await expect(reader()).rejects.toThrow(
      'link_rejected:400:sealed_request_unreadable',
    );
    expect(recorder.unverified).toEqual([{
      coreUrl: profile.coreUrl,
      reason: 'home_refuses_pinned_head',
    }]);
    expect(readPicoCompanionProfile(profilePath)).toEqual(profile);
  });

  it('treats a network failure as a plain read failure, not a rotation verdict', async () => {
    const eraA = hostEra();
    const acceptor = acceptorFixture();
    const device = deviceFixture();
    const profilePath = tempProfilePath();
    const profile = profileFor(eraA, acceptor, device);
    writePicoCompanionProfile(profilePath, profile);
    const recorder = noticeRecorder();

    const reader = await createPicoCompanionLifecycleReader({
      profile,
      profilePath,
      notifications: recorder.notifications,
      daemonClient: fakeDaemonClient(device),
      sodium: vaultSodium,
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });

    await expect(reader()).rejects.toThrow('fetch failed');
    expect(recorder.rotated).toEqual([]);
    expect(recorder.unverified).toEqual([]);
    expect(readPicoCompanionProfile(profilePath)).toEqual(profile);
  });
});
