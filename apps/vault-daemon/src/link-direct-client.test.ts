import {
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoLinkDirectRequestSignatureInput,
  buildPicoLinkDirectResponseSignatureInput,
  picoIdentitySuite,
  picoLinkDirectPayloadDigestHex,
  picoLinkDirectRequestEnvelopeSchema,
  picoLinkDirectRequestSignatureInputLabel,
  picoLinkDirectResponseEnvelopeSchema,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoLinkDirectRequestSignatureInput,
  type PicoLinkDirectSealedRequest,
  type PicoLinkDirectResponseSignatureInput,
} from '@pico/protocol';
import type { VaultSodium } from '@pico/vault';
import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PicoVaultDaemonClient } from './client.js';
import {
  createPicoLinkDirectClient,
  MAX_PICO_LINK_DIRECT_CLIENT_RESPONSE_CHARS,
  type PicoLinkDirectHostPin,
  type PicoLinkDirectSender,
} from './link-direct-client.js';

let vaultSodium: VaultSodium;

beforeAll(async () => {
  await sodium.ready;
  vaultSodium = sodium as unknown as VaultSodium;
});

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function unhex(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'hex'));
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

function fixture() {
  const hostSigning = sodium.crypto_sign_keypair();
  const hostAgreement = sodium.crypto_box_keypair();
  const identity = sodium.crypto_sign_keypair();
  const deviceSigning = sodium.crypto_sign_keypair();
  const deviceAgreement = sodium.crypto_box_keypair();

  const host: PicoLinkDirectHostPin = {
    signingPublicKeyHex: hex(hostSigning.publicKey),
    signingKeyFingerprintHex: fingerprint(keyRecord('home_host_signing', hostSigning.publicKey)),
    keyAgreementPublicKeyHex: hex(hostAgreement.publicKey),
    keyAgreementKeyFingerprintHex: fingerprint(
      keyRecord('home_host_key_agreement', hostAgreement.publicKey),
    ),
  };
  const sender: PicoLinkDirectSender = {
    identityKeyFingerprintHex: fingerprint(keyRecord('pico_identity', identity.publicKey)),
    deviceSigningKeyFingerprintHex: fingerprint(
      keyRecord('device_signing', deviceSigning.publicKey),
    ),
    deviceKeyAgreementKeyFingerprintHex: fingerprint(
      keyRecord('device_key_agreement', deviceAgreement.publicKey),
    ),
    delegationId: 'delegation_link_client_0001',
  };
  const sign = vi.fn(async (input: {
    keyFingerprintHex: string;
    label: string;
    fields: Record<string, unknown>;
  }) => {
    expect(input.label).toBe(picoLinkDirectRequestSignatureInputLabel);
    expect(input.keyFingerprintHex).toBe(sender.deviceSigningKeyFingerprintHex);
    return {
      keyRole: 'device_signing' as const,
      keyFingerprintHex: sender.deviceSigningKeyFingerprintHex,
      signatureHex: hex(sodium.crypto_sign_detached(
        buildPicoLinkDirectRequestSignatureInput(
          input.fields as unknown as PicoLinkDirectRequestSignatureInput,
        ),
        deviceSigning.privateKey,
      )),
    };
  });
  const daemonClient = {
    status: async () => ({
      locked: false,
      keyfiles: [],
      sessions: [
        {
          keyRole: 'pico_identity' as const,
          keyFingerprintHex: sender.identityKeyFingerprintHex,
          publicKeyHex: hex(identity.publicKey),
        },
        {
          keyRole: 'device_signing' as const,
          keyFingerprintHex: sender.deviceSigningKeyFingerprintHex,
          publicKeyHex: hex(deviceSigning.publicKey),
        },
      ],
    }),
    sign,
  } as unknown as PicoVaultDaemonClient;

  return {
    host,
    sender,
    hostSigning,
    hostAgreement,
    deviceSigning,
    daemonClient,
    sign,
  };
}

function answeringFetch(input: {
  host: PicoLinkDirectHostPin;
  hostSigning: { publicKey: Uint8Array; privateKey: Uint8Array };
  hostAgreement: { publicKey: Uint8Array; privateKey: Uint8Array };
  deviceSigning: { publicKey: Uint8Array; privateKey: Uint8Array };
  mutateResponse?: (response: PicoLinkDirectResponseSignatureInput) => void;
  replyKeys?: string[];
}): typeof fetch {
  return (async (_url: URL | RequestInfo, init?: RequestInit) => {
    const envelope = JSON.parse(String(init?.body)) as {
      schema: string;
      sealedRequestHex: string;
    };
    expect(envelope.schema).toBe(picoLinkDirectRequestEnvelopeSchema);
    const opened = JSON.parse(new TextDecoder().decode(sodium.crypto_box_seal_open(
      unhex(envelope.sealedRequestHex),
      input.hostAgreement.publicKey,
      input.hostAgreement.privateKey,
    ))) as PicoLinkDirectSealedRequest;
    expect(opened.schema).toBe(picoLinkDirectRequestEnvelopeSchema);
    expect(sodium.crypto_sign_verify_detached(
      unhex(opened.senderSignatureHex),
      buildPicoLinkDirectRequestSignatureInput(opened.request),
      input.deviceSigning.publicKey,
    )).toBe(true);
    input.replyKeys?.push(opened.request.replyPublicKeyHex);

    const result = { accepted: true, echo: opened.arguments };
    const response: PicoLinkDirectResponseSignatureInput = {
      suite: picoIdentitySuite,
      requestId: opened.request.requestId,
      operation: opened.request.operation,
      hostSigningKeyFingerprintHex: input.host.signingKeyFingerprintHex,
      outcome: 'ok',
      resultDigestHex: picoLinkDirectPayloadDigestHex(sodium, result),
      createdAt: '2026-07-29T12:00:01.000Z',
    };
    input.mutateResponse?.(response);
    const hostSignatureHex = hex(sodium.crypto_sign_detached(
      buildPicoLinkDirectResponseSignatureInput(response),
      input.hostSigning.privateKey,
    ));
    const sealedResponseHex = hex(sodium.crypto_box_seal(
      new TextEncoder().encode(JSON.stringify({
        schema: picoLinkDirectResponseEnvelopeSchema,
        response,
        result,
        hostSignatureHex,
      })),
      unhex(opened.request.replyPublicKeyHex),
    ));

    return new Response(JSON.stringify({
      schema: picoLinkDirectResponseEnvelopeSchema,
      sealedResponseHex,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

describe('Pico Link direct client (ADR 0107 D3)', () => {
  it('pins both host keys and verifies a signed response bound to the request', async () => {
    const f = fixture();
    const replyKeys: string[] = [];
    const client = await createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid/reachable',
      host: f.host,
      sender: f.sender,
      fetch: answeringFetch({ ...f, replyKeys }),
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    });

    await expect(client.request('home.authority.submit', {
      resource: 'reader_custody_domain',
      record: { domainId: 'family' },
    })).resolves.toEqual({
      outcome: 'ok',
      result: {
        accepted: true,
        echo: {
          resource: 'reader_custody_domain',
          record: { domainId: 'family' },
        },
      },
    });
    await client.request('home.authority.list', { resource: 'home_state' });

    expect(f.sign).toHaveBeenCalledTimes(2);
    expect(replyKeys).toHaveLength(2);
    expect(replyKeys[0]).not.toBe(replyKeys[1]);
  });

  it('rejects a public key that does not match the pinned host fingerprint before IPC or network', async () => {
    const f = fixture();
    const other = sodium.crypto_sign_keypair();
    const requestFetch = vi.fn();

    await expect(createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid',
      host: { ...f.host, signingPublicKeyHex: hex(other.publicKey) },
      sender: f.sender,
      fetch: requestFetch,
    })).rejects.toThrow('host_key_fingerprint_mismatch');
    expect(f.sign).not.toHaveBeenCalled();
    expect(requestFetch).not.toHaveBeenCalled();
  });

  it('rejects a response moved to another request even when the host signature is valid', async () => {
    const f = fixture();
    const client = await createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid',
      host: f.host,
      sender: f.sender,
      fetch: answeringFetch({
        ...f,
        mutateResponse: (response) => {
          response.requestId = 'linkreq_from_another_request';
        },
      }),
      now: () => new Date('2026-07-29T12:00:00.000Z'),
    });

    await expect(client.request('home.setup.read', {}))
      .rejects.toThrow('link_response_binding_mismatch');
  });

  it('surfaces a bare pre-authentication intake refusal without retrying', async () => {
    const f = fixture();
    const requestFetch = vi.fn(async () => new Response(
      JSON.stringify({ error: 'wrong_home' }),
      { status: 400 },
    )) as unknown as typeof fetch;
    const client = await createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid',
      host: f.host,
      sender: f.sender,
      fetch: requestFetch,
    });

    await expect(client.request('home.setup.read', {}))
      .rejects.toThrow('link_rejected:400:wrong_home');
    expect(requestFetch).toHaveBeenCalledTimes(1);
  });

  it('refuses an oversized carrier response before parsing it', async () => {
    const f = fixture();
    const client = await createPicoLinkDirectClient({
      sodium: vaultSodium,
      daemonClient: f.daemonClient,
      coreUrl: 'http://carrier.invalid',
      host: f.host,
      sender: f.sender,
      fetch: (async () => new Response('x', {
        status: 200,
        headers: {
          'content-length': String(MAX_PICO_LINK_DIRECT_CLIENT_RESPONSE_CHARS + 1),
        },
      })) as typeof fetch,
    });

    await expect(client.request('home.setup.read', {}))
      .rejects.toThrow('link_response_too_large');
  });
});
