import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  buildPicoHomeContinuitySignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  picoHomeContinuityChainSchema,
  picoHomeContinuityRecordSchema,
  picoIdentitySuite,
  type PicoHomeContinuityRecord,
  type PicoHomeContinuitySignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
} from '@pico/protocol';
import type { VaultSodium } from '@pico/vault';
import { repinPicoCompanionHostKeys } from './host-repin.js';
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
  const directory = mkdtempSync(join(tmpdir(), 'pico-companion-repin-'));
  temporaryDirectories.push(directory);
  return join(directory, 'profile.json');
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
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
    homeId: 'home_companion_repin',
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

function servingChain(
  records: PicoHomeContinuityRecord[],
  head: HostEra,
): typeof fetch {
  return (async () => new Response(JSON.stringify({
    schema: picoHomeContinuityChainSchema,
    records,
    head: {
      suite: picoIdentitySuite,
      signingPublicKeyHex: hex(head.signing.publicKey),
      signingKeyFingerprintHex: head.signingFingerprintHex,
      keyAgreementPublicKeyHex: hex(head.agreement.publicKey),
      keyAgreementKeyFingerprintHex: head.agreementFingerprintHex,
    },
  }), { status: 200 })) as typeof fetch;
}

function profileFor(
  era: HostEra,
  acceptor: ReturnType<typeof acceptorFixture>,
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
      keyFingerprintHex: '55'.repeat(32),
      publicKeyHex: '66'.repeat(32),
    },
    device: {
      signingKeyFingerprintHex: '77'.repeat(32),
      keyAgreementKeyFingerprintHex: '88'.repeat(32),
      delegationId: 'delegation_companion_0001',
    },
  };
}

describe('Companion host re-pin (ADR 0115 U4)', () => {
  it('re-pins the profile durably after a proven rotation and changes nothing else', async () => {
    const eraA = hostEra();
    const eraB = hostEra();
    const acceptor = acceptorFixture();
    const profilePath = tempProfilePath();
    const profile = profileFor(eraA, acceptor);
    writePicoCompanionProfile(profilePath, profile);

    const outcome = await repinPicoCompanionHostKeys({
      sodium: vaultSodium,
      profilePath,
      profile,
      fetch: servingChain(
        [continuityLink(eraA, eraB, acceptor, 'seq:0000000000000002')],
        eraB,
      ),
    });

    expect(outcome.status).toBe('repinned');
    // Durable, atomic, and only the host block moved: identity, device,
    // coreUrl and the acceptor pin are not the rotation's to touch.
    expect(readPicoCompanionProfile(profilePath)).toEqual({
      ...profile,
      host: {
        signingPublicKeyHex: hex(eraB.signing.publicKey),
        signingKeyFingerprintHex: eraB.signingFingerprintHex,
        keyAgreementPublicKeyHex: hex(eraB.agreement.publicKey),
        keyAgreementKeyFingerprintHex: eraB.agreementFingerprintHex,
      },
    });
  });

  it('leaves the profile untouched when the pin is already the head', async () => {
    const eraA = hostEra();
    const acceptor = acceptorFixture();
    const profilePath = tempProfilePath();
    const profile = profileFor(eraA, acceptor);
    writePicoCompanionProfile(profilePath, profile);

    await expect(repinPicoCompanionHostKeys({
      sodium: vaultSodium,
      profilePath,
      profile,
      fetch: servingChain([], eraA),
    })).resolves.toEqual({ status: 'current' });
    expect(readPicoCompanionProfile(profilePath)).toEqual(profile);
  });

  it('keeps the pin against the stolen-disk forgery, naming the halt', async () => {
    const eraA = hostEra();
    const thiefEra = hostEra();
    const acceptor = acceptorFixture();
    const thiefRoot = acceptorFixture();
    const profilePath = tempProfilePath();
    const profile = profileFor(eraA, acceptor);
    writePicoCompanionProfile(profilePath, profile);

    // Internally valid, accepted by a root that is not this device's pinned
    // Home Host Pico: exactly what a thief of a copied host disk can mint.
    await expect(repinPicoCompanionHostKeys({
      sodium: vaultSodium,
      profilePath,
      profile,
      fetch: servingChain(
        [continuityLink(eraA, thiefEra, thiefRoot, 'seq:0000000000000002')],
        thiefEra,
      ),
    })).resolves.toEqual({
      status: 'unverified',
      reason: 'head_bundle_mismatch:foreign_acceptor',
    });
    expect(readPicoCompanionProfile(profilePath)).toEqual(profile);
  });
});
