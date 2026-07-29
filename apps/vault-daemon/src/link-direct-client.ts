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
  type PicoLinkDirectOperation,
  type PicoLinkDirectRequestSignatureInput,
  type PicoLinkDirectSealedRequest,
  type PicoLinkDirectSealedResponse,
} from '@pico/protocol';
import type { VaultSodium } from '@pico/vault';
import type { PicoVaultDaemonClient } from './client.js';

export const PICO_LINK_DIRECT_CLIENT_REQUEST_LIFETIME_MS = 30_000;
export const MAX_PICO_LINK_DIRECT_CLIENT_RESPONSE_CHARS = 512 * 1024;

export interface PicoLinkDirectHostPin {
  signingPublicKeyHex: string;
  signingKeyFingerprintHex: string;
  keyAgreementPublicKeyHex: string;
  keyAgreementKeyFingerprintHex: string;
}

export interface PicoLinkDirectSender {
  identityKeyFingerprintHex: string;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  delegationId: string;
}

export interface CreatePicoLinkDirectClientInput {
  sodium: VaultSodium;
  daemonClient: PicoVaultDaemonClient;
  coreUrl: string;
  host: PicoLinkDirectHostPin;
  sender: PicoLinkDirectSender;
  fetch?: typeof fetch;
  now?: () => Date;
}

export interface PicoLinkDirectClient {
  request(
    operation: PicoLinkDirectOperation,
    args: Record<string, unknown>,
  ): Promise<{ outcome: string; result: Record<string, unknown> }>;
}

/**
 * ADR 0107 D3 client boundary.
 *
 * The URL supplies reachability only. Both host public keys are checked
 * against out-of-band fingerprints before the first request, every request is
 * signed by the unlocked delegated device key, and every response is opened
 * with a fresh per-request X25519 key before its host signature is accepted.
 */
export async function createPicoLinkDirectClient(
  input: CreatePicoLinkDirectClientInput,
): Promise<PicoLinkDirectClient> {
  assertHostPin(input.sodium, input.host);

  const status = await input.daemonClient.status();
  const identity = status.sessions.find(
    (session) => session.keyFingerprintHex === input.sender.identityKeyFingerprintHex,
  );
  const signing = status.sessions.find(
    (session) => session.keyFingerprintHex === input.sender.deviceSigningKeyFingerprintHex,
  );
  if (identity?.keyRole !== 'pico_identity') {
    throw new Error('link_identity_key_not_unlocked');
  }
  if (signing?.keyRole !== 'device_signing') {
    throw new Error('link_device_signing_key_not_unlocked');
  }
  if (input.sender.delegationId.trim() === '') {
    throw new Error('invalid_link_delegation_id');
  }

  const senderIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'pico_identity',
    publicKeyHex: identity.publicKeyHex,
  };
  const senderDeviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'device_signing',
    publicKeyHex: signing.publicKeyHex,
  };
  assertKeyRecordFingerprint(
    input.sodium,
    senderIdentityKeyRecord,
    input.sender.identityKeyFingerprintHex,
    'link_identity_key_fingerprint_mismatch',
  );
  assertKeyRecordFingerprint(
    input.sodium,
    senderDeviceSigningKeyRecord,
    input.sender.deviceSigningKeyFingerprintHex,
    'link_device_signing_key_fingerprint_mismatch',
  );

  const requestFetch = input.fetch ?? fetch;
  const now = input.now ?? (() => new Date());
  const linkUrl = new URL(
    '/api/home/link',
    input.coreUrl.endsWith('/') ? input.coreUrl : `${input.coreUrl}/`,
  );

  return {
    request: async (operation, args) => {
      const replyKeypair = input.sodium.crypto_box_keypair();
      try {
        const createdAtDate = now();
        const createdAt = createdAtDate.toISOString();
        const expiresAt = new Date(
          createdAtDate.getTime() + PICO_LINK_DIRECT_CLIENT_REQUEST_LIFETIME_MS,
        ).toISOString();
        const request: PicoLinkDirectRequestSignatureInput = {
          suite: picoIdentitySuite,
          requestId: `linkreq_${toHex(input.sodium.randombytes_buf(16))}`,
          operation,
          hostSigningKeyFingerprintHex: input.host.signingKeyFingerprintHex,
          senderIdentityKeyFingerprintHex: input.sender.identityKeyFingerprintHex,
          senderDeviceSigningKeyFingerprintHex: input.sender.deviceSigningKeyFingerprintHex,
          senderDeviceKeyAgreementKeyFingerprintHex:
            input.sender.deviceKeyAgreementKeyFingerprintHex,
          senderDelegationId: input.sender.delegationId,
          replyPublicKeyHex: toHex(replyKeypair.publicKey),
          argumentsDigestHex: picoLinkDirectPayloadDigestHex(input.sodium, args),
          createdAt,
          expiresAt,
        };
        // Build locally as well as in the daemon. This rejects malformed fields
        // before any IPC request and pins the exact bytes the response belongs
        // to; the daemon independently rebuilds the same bytes before signing.
        buildPicoLinkDirectRequestSignatureInput(request);
        const signed = await input.daemonClient.sign({
          keyFingerprintHex: input.sender.deviceSigningKeyFingerprintHex,
          label: picoLinkDirectRequestSignatureInputLabel,
          fields: request as unknown as Record<string, unknown>,
        });
        if (signed.keyRole !== 'device_signing'
          || signed.keyFingerprintHex !== input.sender.deviceSigningKeyFingerprintHex) {
          throw new Error('link_request_signer_mismatch');
        }

        const sealedRequest: PicoLinkDirectSealedRequest = {
          schema: picoLinkDirectRequestEnvelopeSchema,
          request,
          senderIdentityKeyRecord,
          senderDeviceSigningKeyRecord,
          arguments: args,
          senderSignatureHex: signed.signatureHex,
        };
        const envelope = {
          schema: picoLinkDirectRequestEnvelopeSchema,
          sealedRequestHex: toHex(input.sodium.crypto_box_seal(
            new TextEncoder().encode(JSON.stringify(sealedRequest)),
            fromHex(input.host.keyAgreementPublicKeyHex, 32, 'invalid_host_agreement_public_key'),
          )),
        };

        const response = await requestFetch(linkUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(envelope),
        });
        const responseText = await readBoundedResponseText(response);
        let parsed: unknown;
        try {
          parsed = responseText === '' ? {} : JSON.parse(responseText);
        } catch {
          throw new Error(`link_invalid_response:${response.status}`);
        }
        if (!response.ok) {
          const reason = isRecord(parsed) && typeof parsed.error === 'string'
            ? parsed.error
            : 'intake_rejected';
          throw new Error(`link_rejected:${response.status}:${reason}`);
        }
        if (!isRecord(parsed)
          || parsed.schema !== picoLinkDirectResponseEnvelopeSchema
          || typeof parsed.sealedResponseHex !== 'string') {
          throw new Error('link_invalid_response_envelope');
        }

        let opened: unknown;
        try {
          opened = JSON.parse(new TextDecoder().decode(
            input.sodium.crypto_box_seal_open(
              fromHex(parsed.sealedResponseHex, undefined, 'link_response_unreadable'),
              replyKeypair.publicKey,
              replyKeypair.privateKey,
            ),
          ));
        } catch {
          throw new Error('link_response_unreadable');
        }
        if (!isRecord(opened)
          || opened.schema !== picoLinkDirectResponseEnvelopeSchema
          || !isRecord(opened.response)
          || !isRecord(opened.result)
          || typeof opened.hostSignatureHex !== 'string'
          || !hasExactKeys(opened, ['schema', 'response', 'result', 'hostSignatureHex'])) {
          throw new Error('link_invalid_response_payload');
        }

        const sealedResponse = opened as unknown as PicoLinkDirectSealedResponse;
        let signatureInput: Uint8Array;
        try {
          signatureInput = buildPicoLinkDirectResponseSignatureInput(sealedResponse.response);
        } catch {
          throw new Error('link_invalid_response_payload');
        }
        if (sealedResponse.response.requestId !== request.requestId
          || sealedResponse.response.operation !== request.operation
          || sealedResponse.response.hostSigningKeyFingerprintHex
            !== input.host.signingKeyFingerprintHex
          || sealedResponse.response.resultDigestHex
            !== picoLinkDirectPayloadDigestHex(input.sodium, sealedResponse.result)) {
          throw new Error('link_response_binding_mismatch');
        }
        let signatureValid = false;
        try {
          signatureValid = input.sodium.crypto_sign_verify_detached(
            fromHex(sealedResponse.hostSignatureHex, 64, 'link_invalid_host_signature'),
            signatureInput,
            fromHex(input.host.signingPublicKeyHex, 32, 'invalid_host_signing_public_key'),
          );
        } catch {
          signatureValid = false;
        }
        if (!signatureValid) {
          throw new Error('link_invalid_host_signature');
        }

        return {
          outcome: sealedResponse.response.outcome,
          result: sealedResponse.result,
        };
      } finally {
        input.sodium.memzero(replyKeypair.privateKey);
      }
    },
  };
}

function assertHostPin(sodium: VaultSodium, host: PicoLinkDirectHostPin): void {
  const signingRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'home_host_signing',
    publicKeyHex: host.signingPublicKeyHex,
  };
  const agreementRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'home_host_key_agreement',
    publicKeyHex: host.keyAgreementPublicKeyHex,
  };
  assertKeyRecordFingerprint(
    sodium,
    signingRecord,
    host.signingKeyFingerprintHex,
    'host_key_fingerprint_mismatch',
  );
  assertKeyRecordFingerprint(
    sodium,
    agreementRecord,
    host.keyAgreementKeyFingerprintHex,
    'host_key_fingerprint_mismatch',
  );
}

function assertKeyRecordFingerprint(
  sodium: VaultSodium,
  record: PicoIdentityKeyRecordSignatureInput,
  expected: string,
  reason: string,
): void {
  const actual = toHex(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(record),
    null,
  ));
  if (actual !== expected) {
    throw new Error(reason);
  }
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function fromHex(value: string, bytes: number | undefined, reason: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/.test(value) || (bytes !== undefined && value.length !== bytes * 2)) {
    throw new Error(reason);
  }
  return Uint8Array.from(Buffer.from(value, 'hex'));
}

async function readBoundedResponseText(response: Response): Promise<string> {
  const statedLength = response.headers.get('content-length');
  if (statedLength !== null
    && Number.isSafeInteger(Number(statedLength))
    && Number(statedLength) > MAX_PICO_LINK_DIRECT_CLIENT_RESPONSE_CHARS) {
    await response.body?.cancel();
    throw new Error('link_response_too_large');
  }
  if (response.body === null) {
    return '';
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      length += next.value.byteLength;
      if (length > MAX_PICO_LINK_DIRECT_CLIENT_RESPONSE_CHARS) {
        await reader.cancel();
        throw new Error('link_response_too_large');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}
