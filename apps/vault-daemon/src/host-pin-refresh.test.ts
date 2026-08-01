import {
  buildPicoHomeContinuitySignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  picoHomeContinuityChainSchema,
  picoHomeContinuityRecordSchema,
  picoIdentitySuite,
  type PicoHomeContinuityChainResponse,
  type PicoHomeContinuityRecord,
  type PicoHomeContinuitySignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
} from '@pico/protocol';
import type { VaultSodium } from '@pico/vault';
import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  fetchPicoHomeContinuityChain,
  MAX_PICO_HOME_CONTINUITY_CHAIN_RESPONSE_CHARS,
  PICO_HOME_CONTINUITY_READ_PATH,
  refreshPicoHomeHostPins,
} from './host-pin-refresh.js';

let vaultSodium: VaultSodium;

beforeAll(async () => {
  await sodium.ready;
  vaultSodium = sodium as unknown as VaultSodium;
});

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
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

interface TestKeypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
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

function continuityLink(
  outgoing: HostEra,
  incoming: HostEra,
  acceptor: {
    keypair: TestKeypair;
    record: PicoIdentityKeyRecordSignatureInput;
    fingerprintHex: string;
  },
  lifecycleOrder: string,
): PicoHomeContinuityRecord {
  const continuity: PicoHomeContinuitySignatureInput = {
    suite: picoIdentitySuite,
    continuityId: `continuity_${lifecycleOrder.slice(-4)}`,
    homeId: 'home_pin_refresh',
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

function acceptorFixture() {
  const keypair: TestKeypair = sodium.crypto_sign_keypair();
  const record = keyRecord('pico_identity', keypair.publicKey);
  return { keypair, record, fingerprintHex: fingerprint(record) };
}

function chainResponse(
  records: PicoHomeContinuityRecord[],
  head: HostEra,
): PicoHomeContinuityChainResponse {
  return {
    schema: picoHomeContinuityChainSchema,
    records,
    head: {
      suite: picoIdentitySuite,
      signingPublicKeyHex: hex(head.signing.publicKey),
      signingKeyFingerprintHex: head.signingFingerprintHex,
      keyAgreementPublicKeyHex: hex(head.agreement.publicKey),
      keyAgreementKeyFingerprintHex: head.agreementFingerprintHex,
    },
  };
}

function serving(payload: unknown, status = 200): { fetch: typeof fetch; urls: URL[] } {
  const urls: URL[] = [];
  return {
    urls,
    fetch: (async (input: string | URL | Request) => {
      urls.push(new URL(String(input)));
      return new Response(
        typeof payload === 'string' ? payload : JSON.stringify(payload),
        { status, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch,
  };
}

describe('ADR 0115 U4 host pin refresh', () => {
  it('re-pins a stranded client across two rotations and proves the head bundle', async () => {
    const eraA = hostEra();
    const eraB = hostEra();
    const eraC = hostEra();
    const acceptor = acceptorFixture();
    const served = serving(chainResponse([
      continuityLink(eraA, eraB, acceptor, 'seq:0000000000000002'),
      continuityLink(eraB, eraC, acceptor, 'seq:0000000000000003'),
    ], eraC));

    const refreshed = await refreshPicoHomeHostPins(vaultSodium, {
      coreUrl: 'http://127.0.0.1:1',
      pinnedHostSigningKeyFingerprintHex: eraA.signingFingerprintHex,
      pinnedHostKeyAgreementKeyFingerprintHex: eraA.agreementFingerprintHex,
      pinnedHomeHostPicoIdentityFingerprintHex: acceptor.fingerprintHex,
      fetch: served.fetch,
    });

    expect(refreshed).toEqual({
      status: 'repinned',
      followedLinks: 2,
      head: {
        signingPublicKeyHex: hex(eraC.signing.publicKey),
        signingKeyFingerprintHex: eraC.signingFingerprintHex,
        keyAgreementPublicKeyHex: hex(eraC.agreement.publicKey),
        keyAgreementKeyFingerprintHex: eraC.agreementFingerprintHex,
      },
    });
    expect(served.urls[0]?.pathname).toBe(PICO_HOME_CONTINUITY_READ_PATH);
    expect(served.urls[0]?.search).toBe('');
  });

  it('reports a current pin without inventing a rotation', async () => {
    const eraA = hostEra();
    const acceptor = acceptorFixture();
    const served = serving(chainResponse([], eraA));

    await expect(refreshPicoHomeHostPins(vaultSodium, {
      coreUrl: 'http://127.0.0.1:1/',
      pinnedHostSigningKeyFingerprintHex: eraA.signingFingerprintHex,
      pinnedHostKeyAgreementKeyFingerprintHex: eraA.agreementFingerprintHex,
      pinnedHomeHostPicoIdentityFingerprintHex: acceptor.fingerprintHex,
      fetch: served.fetch,
    })).resolves.toEqual({
      status: 'current',
      head: {
        signingPublicKeyHex: hex(eraA.signing.publicKey),
        signingKeyFingerprintHex: eraA.signingFingerprintHex,
        keyAgreementPublicKeyHex: hex(eraA.agreement.publicKey),
        keyAgreementKeyFingerprintHex: eraA.agreementFingerprintHex,
      },
    });
  });

  it('refuses the stolen-disk forgery: a chain accepted by a stranger proves nothing', async () => {
    const eraA = hostEra();
    const thiefEra = hostEra();
    const acceptor = acceptorFixture();
    const thiefRoot = acceptorFixture();
    // The thief holds the retired keys and mints the rest; the record is
    // internally valid. Only the acceptor pin refuses it - and then the
    // served head cannot be bound to anything proven.
    const served = serving(chainResponse([
      continuityLink(eraA, thiefEra, thiefRoot, 'seq:0000000000000002'),
    ], thiefEra));

    await expect(refreshPicoHomeHostPins(vaultSodium, {
      coreUrl: 'http://127.0.0.1:1',
      pinnedHostSigningKeyFingerprintHex: eraA.signingFingerprintHex,
      pinnedHostKeyAgreementKeyFingerprintHex: eraA.agreementFingerprintHex,
      pinnedHomeHostPicoIdentityFingerprintHex: acceptor.fingerprintHex,
      fetch: served.fetch,
    })).resolves.toEqual({
      status: 'unverified',
      reason: 'head_bundle_mismatch',
      halt: { reason: 'foreign_acceptor' },
    });
  });

  it('binds each served public key to the proven fingerprints by hash', async () => {
    const eraA = hostEra();
    const eraB = hostEra();
    const stranger = hostEra();
    const acceptor = acceptorFixture();
    const link = continuityLink(eraA, eraB, acceptor, 'seq:0000000000000002');
    const pins = {
      coreUrl: 'http://127.0.0.1:1',
      pinnedHostSigningKeyFingerprintHex: eraA.signingFingerprintHex,
      pinnedHostKeyAgreementKeyFingerprintHex: eraA.agreementFingerprintHex,
      pinnedHomeHostPicoIdentityFingerprintHex: acceptor.fingerprintHex,
    };

    // The fingerprints name the proven head, but the served public keys are
    // somebody else's: the hash binding is the only thing standing between
    // the client and sealing to an attacker's key.
    const swappedAgreement = chainResponse([link], eraB);
    swappedAgreement.head.keyAgreementPublicKeyHex = hex(stranger.agreement.publicKey);
    await expect(refreshPicoHomeHostPins(vaultSodium, {
      ...pins,
      fetch: serving(swappedAgreement).fetch,
    })).resolves.toEqual({ status: 'unverified', reason: 'head_bundle_mismatch' });

    const swappedSigning = chainResponse([link], eraB);
    swappedSigning.head.signingPublicKeyHex = hex(stranger.signing.publicKey);
    await expect(refreshPicoHomeHostPins(vaultSodium, {
      ...pins,
      fetch: serving(swappedSigning).fetch,
    })).resolves.toEqual({ status: 'unverified', reason: 'head_bundle_mismatch' });

    // A head the walk never proved is refused even with honest key material.
    const unprovenHead = chainResponse([], eraB);
    await expect(refreshPicoHomeHostPins(vaultSodium, {
      ...pins,
      fetch: serving(unprovenHead).fetch,
    })).resolves.toEqual({ status: 'unverified', reason: 'head_bundle_mismatch' });
  });

  it('treats transport and shape failures as errors, not verdicts', async () => {
    const eraA = hostEra();
    await expect(fetchPicoHomeContinuityChain({
      coreUrl: 'http://127.0.0.1:1',
      fetch: serving({ error: 'nope' }, 503).fetch,
    })).rejects.toThrow('continuity_read_rejected:503');
    await expect(fetchPicoHomeContinuityChain({
      coreUrl: 'http://127.0.0.1:1',
      fetch: serving('not json').fetch,
    })).rejects.toThrow('continuity_read_unparseable');
    await expect(fetchPicoHomeContinuityChain({
      coreUrl: 'http://127.0.0.1:1',
      fetch: serving({ schema: 'pico.home.continuity-chain.v0', records: [], head: {} }).fetch,
    })).rejects.toThrow('continuity_read_malformed');
    const oversized = serving(`{"padding":"${'a'.repeat(
      MAX_PICO_HOME_CONTINUITY_CHAIN_RESPONSE_CHARS,
    )}"}`);
    await expect(fetchPicoHomeContinuityChain({
      coreUrl: 'http://127.0.0.1:1',
      fetch: oversized.fetch,
    })).rejects.toThrow('link_response_too_large');
    // A syntactically fine response with a corrupt head is malformed, not a
    // verdict either.
    const corruptHead = chainResponse([], eraA) as unknown as {
      head: Record<string, unknown>;
    };
    corruptHead.head.signingPublicKeyHex = 'not-hex';
    await expect(fetchPicoHomeContinuityChain({
      coreUrl: 'http://127.0.0.1:1',
      fetch: serving(corruptHead).fetch,
    })).rejects.toThrow('continuity_read_malformed');
  });
});
