import {
  buildPicoLinkDirectRequestSignatureInput,
  buildPicoLinkDirectResponseSignatureInput,
  picoIdentitySuite,
  picoLinkDirectPayloadDigestHex,
  picoLinkDirectRequestEnvelopeSchema,
  picoLinkDirectResponseEnvelopeSchema,
  type PicoLinkDirectOperation,
  type PicoLinkDirectRequestSignatureInput,
  type PicoLinkDirectResponseSignatureInput,
} from '@pico/protocol';
import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_PICO_LINK_DIRECT_ENVELOPE_HEX_CHARS,
  PicoLinkDirectIntake,
  picoLinkDirectKeyRecordFingerprintHex,
  type PicoLinkDirectAuthority,
  type PicoLinkDirectExecution,
  type PicoLinkDirectPrincipal,
} from './link-direct.js';

/**
 * ADR 0107 D2. One test per step of the verification order, because that order
 * is the security content: each step has to refuse on its own rather than
 * relying on a later one to catch what it let through.
 */

const NOW = new Date('2026-07-29T12:00:00.000Z');

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const unhex = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, 'hex'));

interface Keypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

let hostSigning: Keypair;
let hostAgreement: Keypair;
let senderIdentity: Keypair;
let senderDevice: Keypair;
let senderDeviceAgreement: Keypair;
let reply: Keypair;

beforeAll(async () => {
  await sodium.ready;
  hostSigning = sodium.crypto_sign_keypair();
  hostAgreement = sodium.crypto_box_keypair();
  senderIdentity = sodium.crypto_sign_keypair();
  senderDevice = sodium.crypto_sign_keypair();
  senderDeviceAgreement = sodium.crypto_box_keypair();
  reply = sodium.crypto_box_keypair();
});

interface KeyRecord {
  suite: string;
  keyRole: string;
  publicKeyHex: string;
}

function keyRecord(keyRole: string, publicKey: Uint8Array): KeyRecord {
  return { suite: picoIdentitySuite, keyRole, publicKeyHex: hex(publicKey) };
}

function fingerprintOf(record: KeyRecord): string {
  return picoLinkDirectKeyRecordFingerprintHex(sodium, record);
}

interface Recorded {
  operation: PicoLinkDirectOperation;
  args: Record<string, unknown>;
  principal: PicoLinkDirectPrincipal;
}

type Execute = (
  operation: PicoLinkDirectOperation,
  args: Record<string, unknown>,
  principal: PicoLinkDirectPrincipal,
) => Promise<PicoLinkDirectExecution>;

function hostAuthority(overrides: Partial<PicoLinkDirectAuthority> = {}): PicoLinkDirectAuthority {
  return {
    hostSigningKeyFingerprintHex: () => fingerprintOf(keyRecord('pico_identity', hostSigning.publicKey)),
    openSealedToHostKeyAgreement: (sealedHex) => new TextDecoder().decode(sodium.crypto_box_seal_open(
      unhex(sealedHex),
      hostAgreement.publicKey,
      hostAgreement.privateKey,
    )),
    signWithHostSigningKey: (input) => hex(sodium.crypto_sign_detached(input, hostSigning.privateKey)),
    sealToReplyKey: (replyPublicKeyHex, plaintext) => hex(sodium.crypto_box_seal(
      new TextEncoder().encode(plaintext),
      unhex(replyPublicKeyHex),
    )),
    isAuthorizedSender: () => true,
    ...overrides,
  };
}

function makeIntake(overrides: Partial<PicoLinkDirectAuthority> = {}, maxSeenRequests?: number): {
  intake: PicoLinkDirectIntake;
  calls: Recorded[];
  execute: Execute;
} {
  const calls: Recorded[] = [];

  return {
    intake: maxSeenRequests === undefined
      ? new PicoLinkDirectIntake(sodium, hostAuthority(overrides))
      : new PicoLinkDirectIntake(sodium, hostAuthority(overrides), maxSeenRequests),
    calls,
    execute: async (operation, args, principal) => {
      calls.push({ operation, args, principal });
      return { outcome: 'ok', result: { echoed: true } };
    },
  };
}

function sealTo(publicKey: Uint8Array, payload: unknown): string {
  return hex(sodium.crypto_box_seal(
    new TextEncoder().encode(JSON.stringify(payload)),
    publicKey,
  ));
}

interface RequestEnvelope {
  schema: typeof picoLinkDirectRequestEnvelopeSchema;
  sealedRequestHex: string;
}

function sealedRequest(options: {
  requestOverrides?: Partial<PicoLinkDirectRequestSignatureInput>;
  args?: Record<string, unknown>;
  signWith?: Uint8Array;
  signOverDifferentBytes?: boolean;
} = {}): RequestEnvelope {
  const identityRecord = keyRecord('pico_identity', senderIdentity.publicKey);
  const deviceRecord = keyRecord('device_signing', senderDevice.publicKey);
  const args = options.args ?? { domainId: 'shared' };

  const request: PicoLinkDirectRequestSignatureInput = {
    suite: picoIdentitySuite,
    requestId: `linkreq_${hex(sodium.randombytes_buf(8))}`,
    operation: 'home.authority.list',
    hostSigningKeyFingerprintHex: fingerprintOf(keyRecord('pico_identity', hostSigning.publicKey)),
    senderIdentityKeyFingerprintHex: fingerprintOf(identityRecord),
    senderDeviceSigningKeyFingerprintHex: fingerprintOf(deviceRecord),
    senderDeviceKeyAgreementKeyFingerprintHex: fingerprintOf(
      keyRecord('device_key_agreement', senderDeviceAgreement.publicKey),
    ),
    senderDelegationId: 'delegation_0001',
    replyPublicKeyHex: hex(reply.publicKey),
    argumentsDigestHex: picoLinkDirectPayloadDigestHex(sodium, args),
    createdAt: '2026-07-29T11:59:50.000Z',
    expiresAt: '2026-07-29T12:00:20.000Z',
    ...options.requestOverrides,
  };

  const signedBytes = buildPicoLinkDirectRequestSignatureInput(
    options.signOverDifferentBytes === true
      ? { ...request, requestId: 'linkreq_something.else' }
      : request,
  );

  return {
    schema: picoLinkDirectRequestEnvelopeSchema,
    sealedRequestHex: sealTo(hostAgreement.publicKey, {
      schema: picoLinkDirectRequestEnvelopeSchema,
      request,
      senderIdentityKeyRecord: identityRecord,
      senderDeviceSigningKeyRecord: deviceRecord,
      arguments: args,
      senderSignatureHex: hex(sodium.crypto_sign_detached(
        signedBytes,
        options.signWith ?? senderDevice.privateKey,
      )),
    }),
  };
}

function openToHost(sealedRequestHex: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(sodium.crypto_box_seal_open(
    unhex(sealedRequestHex),
    hostAgreement.publicKey,
    hostAgreement.privateKey,
  )));
}

function openResponse(sealedResponseHex: string): {
  schema: string;
  response: PicoLinkDirectResponseSignatureInput;
  result: Record<string, unknown>;
  hostSignatureHex: string;
} {
  return JSON.parse(new TextDecoder().decode(sodium.crypto_box_seal_open(
    unhex(sealedResponseHex),
    reply.publicKey,
    reply.privateKey,
  )));
}

/** Re-seals a request after mutating its opened payload. */
function tamperInside(
  envelope: RequestEnvelope,
  mutate: (payload: Record<string, unknown>) => void,
): RequestEnvelope {
  const payload = openToHost(envelope.sealedRequestHex);
  mutate(payload);
  return {
    schema: picoLinkDirectRequestEnvelopeSchema,
    sealedRequestHex: sealTo(hostAgreement.publicKey, payload),
  };
}

describe('Pico Link direct intake (ADR 0107 D2)', () => {
  it('accepts an authentic request and returns a signed, sealed response', async () => {
    const { intake, calls, execute } = makeIntake();

    const handled = await intake.handle(sealedRequest(), execute, NOW);
    expect(handled.ok).toBe(true);
    if (!handled.ok) {
      return;
    }
    expect(handled.envelope.schema).toBe(picoLinkDirectResponseEnvelopeSchema);

    // Only the holder of the ephemeral reply key can read it.
    const opened = openResponse(handled.envelope.sealedResponseHex);
    expect(opened.response.outcome).toBe('ok');
    expect(opened.result).toEqual({ echoed: true });

    // The host signature covers the response bytes, and the result is bound to
    // them by digest rather than merely travelling alongside.
    expect(sodium.crypto_sign_verify_detached(
      unhex(opened.hostSignatureHex),
      buildPicoLinkDirectResponseSignatureInput(opened.response),
      hostSigning.publicKey,
    )).toBe(true);
    expect(opened.response.resultDigestHex)
      .toBe(picoLinkDirectPayloadDigestHex(sodium, opened.result));

    // The operation saw the verified principal, not the sender's claim about it.
    expect(calls).toHaveLength(1);
    expect(calls[0].operation).toBe('home.authority.list');
    expect(calls[0].args).toEqual({ domainId: 'shared' });
    expect(calls[0].principal?.picoIdentityFingerprintHex)
      .toBe(fingerprintOf(keyRecord('pico_identity', senderIdentity.publicKey)));
  });

  it('refuses an oversized envelope before spending a private key on it', async () => {
    const { intake, execute } = makeIntake({
      openSealedToHostKeyAgreement: () => {
        throw new Error('seal_open must not be reached');
      },
    });

    expect(await intake.handle({
      schema: picoLinkDirectRequestEnvelopeSchema,
      sealedRequestHex: 'ab'.repeat(MAX_PICO_LINK_DIRECT_ENVELOPE_HEX_CHARS),
    }, execute, NOW)).toEqual({ ok: false, reason: 'envelope_too_large' });
  });

  it('refuses a malformed envelope, an unreadable seal and a malformed inner payload', async () => {
    const { intake, execute } = makeIntake();

    expect(await intake.handle({ schema: 'pico.link.evil.v1' }, execute, NOW))
      .toEqual({ ok: false, reason: 'invalid_envelope' });
    expect(await intake.handle({
      schema: picoLinkDirectRequestEnvelopeSchema,
      sealedRequestHex: 'ab'.repeat(64),
    }, execute, NOW)).toEqual({ ok: false, reason: 'sealed_request_unreadable' });

    // Opens, parses, and is still not a request.
    expect(await intake.handle({
      schema: picoLinkDirectRequestEnvelopeSchema,
      sealedRequestHex: sealTo(hostAgreement.publicKey, {
        schema: picoLinkDirectRequestEnvelopeSchema,
      }),
    }, execute, NOW)).toEqual({ ok: false, reason: 'malformed_request' });
  });

  it('refuses a request whose signed fields the canonical builder rejects', async () => {
    const { intake, execute } = makeIntake();

    // The builder is the field validator: a smuggled field means the bytes the
    // sender signed are not the bytes this request describes.
    expect(await intake.handle(
      tamperInside(sealedRequest(), (payload) => {
        (payload.request as Record<string, unknown>).smuggled = 'value';
      }),
      execute,
      NOW,
    )).toEqual({ ok: false, reason: 'malformed_request' });
  });

  it('refuses an operation outside the closed set, by name', async () => {
    const { intake, calls, execute } = makeIntake();

    // Not a tunnel: remote capability is opt-in per operation, so an existing
    // local route that was never listed here is refused - and refused as
    // "unknown operation" rather than as a parse failure, because the two mean
    // different things to whoever is holding the reply key.
    for (const operation of ['home.events.append', 'home.setup.read.v2', '']) {
      expect(await intake.handle(
        tamperInside(sealedRequest(), (payload) => {
          (payload.request as Record<string, unknown>).operation = operation;
        }),
        execute,
        NOW,
      )).toEqual({ ok: false, reason: 'unknown_operation' });
    }
    expect(calls).toHaveLength(0);
  });

  it('refuses a request addressed to a different Home before authenticating it', async () => {
    const { intake, calls, execute } = makeIntake();

    // A real signature from a real sender - addressed elsewhere. A URL is
    // reachability, never identity, so this Home must not answer it.
    expect(await intake.handle(
      sealedRequest({ requestOverrides: { hostSigningKeyFingerprintHex: 'ab'.repeat(32) } }),
      execute,
      NOW,
    )).toEqual({ ok: false, reason: 'wrong_home' });
    expect(calls).toHaveLength(0);
  });

  it('refuses everything while the Home has no host key identity yet', async () => {
    const { intake, execute } = makeIntake({ hostSigningKeyFingerprintHex: () => undefined });

    expect(await intake.handle(sealedRequest(), execute, NOW))
      .toEqual({ ok: false, reason: 'wrong_home' });
  });

  it('refuses an expired request and one whose lifetime exceeds the ceiling', async () => {
    const { intake, execute } = makeIntake();

    expect(await intake.handle(sealedRequest({
      requestOverrides: {
        createdAt: '2026-07-29T11:00:00.000Z',
        expiresAt: '2026-07-29T11:00:30.000Z',
      },
    }), execute, NOW)).toEqual({ ok: false, reason: 'request_expired' });

    // A request from the future is equally unusable: freshness is decided on
    // this Home's clock, not on what the sender wrote down.
    expect(await intake.handle(sealedRequest({
      requestOverrides: {
        createdAt: '2026-07-29T14:00:00.000Z',
        expiresAt: '2026-07-29T14:00:30.000Z',
      },
    }), execute, NOW)).toEqual({ ok: false, reason: 'request_expired' });

    // The ceiling matters as much as the expiry: without it a sender could mint
    // a request valid for a year and outlast the idempotency window.
    expect(await intake.handle(sealedRequest({
      requestOverrides: {
        createdAt: '2026-07-29T11:59:50.000Z',
        expiresAt: '2026-07-30T11:59:50.000Z',
      },
    }), execute, NOW)).toEqual({ ok: false, reason: 'request_lifetime_too_long' });
  });

  it('refuses a replayed request id inside the window', async () => {
    const { intake, calls, execute } = makeIntake();
    const envelope = sealedRequest();

    expect((await intake.handle(envelope, execute, NOW)).ok).toBe(true);
    expect(await intake.handle(envelope, execute, NOW))
      .toEqual({ ok: false, reason: 'request_replayed' });
    // The operation ran once, which is the whole point of the check.
    expect(calls).toHaveLength(1);
  });

  it('forgets a request id once its window has passed, so the set stays bounded', async () => {
    const { intake, execute } = makeIntake();
    const envelope = sealedRequest();

    expect((await intake.handle(envelope, execute, NOW)).ok).toBe(true);
    // Past its own expiry the id is no longer remembered - and the request it
    // belonged to is refused on freshness, not on replay.
    expect(await intake.handle(envelope, execute, new Date('2026-07-29T12:00:25.000Z')))
      .toEqual({ ok: false, reason: 'request_expired' });
  });

  it('does not remember a request id it never authenticated', async () => {
    const { intake, execute } = makeIntake();
    const envelope = sealedRequest({ signWith: senderIdentity.privateKey });

    // An unauthenticated caller must not be able to burn a request id, or it
    // could deny the real sender its own next request.
    expect(await intake.handle(envelope, execute, NOW))
      .toEqual({ ok: false, reason: 'invalid_sender_signature' });

    const legitimate = tamperInside(envelope, (payload) => {
      const request = payload.request as PicoLinkDirectRequestSignatureInput;
      payload.senderSignatureHex = hex(sodium.crypto_sign_detached(
        buildPicoLinkDirectRequestSignatureInput(request),
        senderDevice.privateKey,
      ));
    });
    expect((await intake.handle(legitimate, execute, NOW)).ok).toBe(true);
  });

  it('refuses a key record that does not match the fingerprint the bytes name', async () => {
    const { intake, calls, execute } = makeIntake();

    // The signature would verify against the attached record; what fails is the
    // binding between that record and the signed fingerprint. Verified in the
    // other order, a signature would prove only that someone holds *some* key.
    expect(await intake.handle(
      sealedRequest({ requestOverrides: { senderDeviceSigningKeyFingerprintHex: 'cd'.repeat(32) } }),
      execute,
      NOW,
    )).toEqual({ ok: false, reason: 'invalid_sender_key' });

    expect(await intake.handle(
      sealedRequest({ requestOverrides: { senderIdentityKeyFingerprintHex: 'cd'.repeat(32) } }),
      execute,
      NOW,
    )).toEqual({ ok: false, reason: 'invalid_sender_key' });

    // A record in the right slot with the wrong role is not a key of that kind.
    expect(await intake.handle(
      tamperInside(sealedRequest(), (payload) => {
        (payload.senderDeviceSigningKeyRecord as KeyRecord).keyRole = 'pico_identity';
      }),
      execute,
      NOW,
    )).toEqual({ ok: false, reason: 'invalid_sender_key' });

    expect(calls).toHaveLength(0);
  });

  it('refuses a signature from a key other than the named device key', async () => {
    const { intake, execute } = makeIntake();

    // Signed by the sender's own identity key, which is not the key this
    // request names. Holding a valid key is not the same as holding that one.
    expect(await intake.handle(
      sealedRequest({ signWith: senderIdentity.privateKey }),
      execute,
      NOW,
    )).toEqual({ ok: false, reason: 'invalid_sender_signature' });
  });

  it('refuses a signature made over different bytes than the request carries', async () => {
    const { intake, execute } = makeIntake();

    expect(await intake.handle(
      sealedRequest({ signOverDifferentBytes: true }),
      execute,
      NOW,
    )).toEqual({ ok: false, reason: 'invalid_sender_signature' });
  });

  it('refuses arguments that do not match the digest the signature covers', async () => {
    const { intake, calls, execute } = makeIntake();

    // The arguments travel beside the signature; the digest is what makes them
    // signed rather than merely adjacent.
    expect(await intake.handle(
      tamperInside(sealedRequest(), (payload) => {
        payload.arguments = { domainId: 'someone.elses' };
      }),
      execute,
      NOW,
    )).toEqual({ ok: false, reason: 'invalid_arguments_digest' });
    expect(calls).toHaveLength(0);
  });

  it('accepts arguments whose key order differs from the sender\'s', async () => {
    const { intake, calls, execute } = makeIntake();

    // The digest is over canonical JSON, so re-serialization along the way
    // must not turn a valid request into a refusal.
    const handled = await intake.handle(
      tamperInside(sealedRequest({ args: { alpha: 1, omega: 2 } }), (payload) => {
        payload.arguments = { omega: 2, alpha: 1 };
      }),
      execute,
      NOW,
    );
    expect(handled.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('refuses an authentic sender who is not authorized, without running the operation', async () => {
    const { intake, calls, execute } = makeIntake({ isAuthorizedSender: () => false });

    expect(await intake.handle(sealedRequest(), execute, NOW))
      .toEqual({ ok: false, reason: 'sender_is_not_authorized' });
    expect(calls).toHaveLength(0);
  });

  it('asks the authorization question about the verified principal at the Home\'s clock', async () => {
    const asked: { principal: PicoLinkDirectPrincipal; at: string }[] = [];
    const { intake, execute } = makeIntake({
      isAuthorizedSender: (principal, at) => {
        asked.push({ principal, at });
        return true;
      },
    });

    expect((await intake.handle(sealedRequest(), execute, NOW)).ok).toBe(true);
    expect(asked).toHaveLength(1);
    expect(asked[0].at).toBe(NOW.toISOString());
    expect(asked[0].principal.delegationId).toBe('delegation_0001');
    expect(asked[0].principal.deviceSigningKeyFingerprintHex)
      .toBe(fingerprintOf(keyRecord('device_signing', senderDevice.publicKey)));
    // The delegation this is checked against names all three keys together, so
    // the agreement fingerprint has to reach the check from inside the
    // signature. Sourced from anywhere else, authority would rest on bytes
    // nobody signed - and the store's lookup keys on it exactly.
    expect(asked[0].principal.deviceKeyAgreementKeyFingerprintHex)
      .toBe(fingerprintOf(keyRecord('device_key_agreement', senderDeviceAgreement.publicKey)));
  });

  it('takes the agreement fingerprint from the signature, not from beside it', async () => {
    const asked: PicoLinkDirectPrincipal[] = [];
    const { intake, execute } = makeIntake({
      isAuthorizedSender: (principal) => {
        asked.push(principal);
        return true;
      },
    });

    // An unsigned copy of the field alongside the request must not be able to
    // steer which delegation the Home looks up.
    const signed = fingerprintOf(keyRecord('device_key_agreement', senderDeviceAgreement.publicKey));
    expect((await intake.handle(
      tamperInside(sealedRequest(), (payload) => {
        payload.senderDeviceKeyAgreementKeyFingerprintHex = 'cd'.repeat(32);
      }),
      execute,
      NOW,
    )).ok).toBe(true);
    expect(asked[0].deviceKeyAgreementKeyFingerprintHex).toBe(signed);

    // Inside the signed request the field is covered, so changing it there
    // invalidates the signature rather than redirecting the lookup.
    expect(await intake.handle(
      tamperInside(sealedRequest(), (payload) => {
        (payload.request as Record<string, unknown>)
          .senderDeviceKeyAgreementKeyFingerprintHex = 'cd'.repeat(32);
      }),
      execute,
      NOW,
    )).toEqual({ ok: false, reason: 'invalid_sender_signature' });
  });

  it('lets the two setup operations through without membership, by design', async () => {
    // A claim cannot carry a membership: no Home exists yet. Authorization is
    // skipped for exactly these two operations and for nothing else.
    const { intake, calls, execute } = makeIntake({ isAuthorizedSender: () => false });

    for (const operation of ['home.setup.read', 'home.claim.submit'] as const) {
      const handled = await intake.handle(
        sealedRequest({ requestOverrides: { operation } }),
        execute,
        NOW,
      );
      expect(handled.ok).toBe(true);
    }
    expect(calls.map((call) => call.operation))
      .toEqual(['home.setup.read', 'home.claim.submit']);
    // Pre-authority skips membership/delegation authorization, not sender
    // authentication. ADR 0108 needs the verified principal so claim handling
    // can require it to equal the first-device binding inside the payload.
    expect(calls.every((call) => call.principal.delegationId === 'delegation_0001'))
      .toBe(true);

    for (const operation of [
      'home.device.lifecycle.read',
      'home.device.lifecycle.submit',
    ] as const) {
      expect(await intake.handle(
        sealedRequest({ requestOverrides: { operation } }),
        execute,
        NOW,
      )).toEqual({ ok: false, reason: 'sender_is_not_authorized' });
    }
  });

  it('signs a refusal from a failing operation instead of leaking the failure', async () => {
    const { intake } = makeIntake();

    const handled = await intake.handle(sealedRequest(), async () => {
      throw new Error('database exploded, revealing internals');
    }, NOW);
    expect(handled.ok).toBe(true);
    if (!handled.ok) {
      return;
    }

    // A refusal is signed exactly like a result, so a carrier cannot turn one
    // into the other by dropping bytes - and it says nothing about why.
    const opened = openResponse(handled.envelope.sealedResponseHex);
    expect(opened.response.outcome).toBe('operation_failed');
    expect(sodium.crypto_sign_verify_detached(
      unhex(opened.hostSignatureHex),
      buildPicoLinkDirectResponseSignatureInput(opened.response),
      hostSigning.publicKey,
    )).toBe(true);
    expect(JSON.stringify(opened)).not.toContain('revealing');
  });

  it('binds the response to the request it answers', async () => {
    const { intake, execute } = makeIntake();
    const envelope = sealedRequest();
    const request = openToHost(envelope.sealedRequestHex)
      .request as PicoLinkDirectRequestSignatureInput;

    const handled = await intake.handle(envelope, execute, NOW);
    expect(handled.ok).toBe(true);
    if (!handled.ok) {
      return;
    }

    // Request id, operation and audience are all inside the signed bytes, so a
    // reply cannot be moved to another request or attributed to another Home.
    const opened = openResponse(handled.envelope.sealedResponseHex);
    expect(opened.response.requestId).toBe(request.requestId);
    expect(opened.response.operation).toBe(request.operation);
    expect(opened.response.hostSigningKeyFingerprintHex)
      .toBe(request.hostSigningKeyFingerprintHex);
  });

  it('seals the response to the request\'s reply key and to nothing else', async () => {
    const { intake, execute } = makeIntake();
    const eavesdropper = sodium.crypto_box_keypair();

    const handled = await intake.handle(sealedRequest(), execute, NOW);
    expect(handled.ok).toBe(true);
    if (!handled.ok) {
      return;
    }

    expect(() => sodium.crypto_box_seal_open(
      unhex(handled.envelope.sealedResponseHex),
      eavesdropper.publicKey,
      eavesdropper.privateKey,
    )).toThrow();
  });

  it('evicts the oldest remembered id rather than growing without bound', async () => {
    const { intake: bounded, execute } = makeIntake({}, 2);
    const first = sealedRequest();

    expect((await bounded.handle(first, execute, NOW)).ok).toBe(true);
    expect((await bounded.handle(sealedRequest(), execute, NOW)).ok).toBe(true);
    expect(await bounded.handle(first, execute, NOW))
      .toEqual({ ok: false, reason: 'request_replayed' });

    // The third insertion drops the oldest live entry, which makes that entry
    // replayable within its own remaining window. The bound is deliberate;
    // this pins its cost rather than leaving it unstated.
    expect((await bounded.handle(sealedRequest(), execute, NOW)).ok).toBe(true);
    expect((await bounded.handle(first, execute, NOW)).ok).toBe(true);
  });
});
