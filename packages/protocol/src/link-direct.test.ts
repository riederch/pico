import { describe, expect, it } from 'vitest';
import {
  buildPicoLinkDirectRequestSignatureInput,
  buildPicoLinkDirectResponseSignatureInput,
  picoIdentitySuite,
  picoLinkDirectOperations,
  picoLinkDirectRequestEnvelopeSchema,
  picoLinkDirectRequestSignatureInputLabel,
  picoLinkDirectResponseEnvelopeSchema,
  picoLinkDirectResponseSignatureInputLabel,
  type PicoLinkDirectRequestSignatureInput,
  type PicoLinkDirectResponseSignatureInput,
} from './index.js';

/**
 * ADR 0107 D1. Authoritative vectors for the link envelope families.
 *
 * These live in the package rather than under `docs/protocol/fixtures`
 * deliberately: that directory is the conformance surface, and ADR 0107
 * keeps this contract local and unpublished with no compatibility claim
 * (ADR 0046). Publishing it is a later, separate decision - and when it is
 * taken, these vectors are what moves.
 */

function request(
  overrides: Partial<PicoLinkDirectRequestSignatureInput> = {},
): PicoLinkDirectRequestSignatureInput {
  return {
    suite: picoIdentitySuite,
    requestId: 'linkreq_0001',
    operation: 'home.authority.submit',
    hostSigningKeyFingerprintHex: '11'.repeat(32),
    senderIdentityKeyFingerprintHex: '22'.repeat(32),
    senderDeviceSigningKeyFingerprintHex: '33'.repeat(32),
    senderDeviceKeyAgreementKeyFingerprintHex: 'ee'.repeat(32),
    senderDelegationId: 'delegation_0001',
    replyPublicKeyHex: '44'.repeat(32),
    argumentsDigestHex: '55'.repeat(32),
    createdAt: '2026-07-29T10:00:00.000Z',
    expiresAt: '2026-07-29T10:00:30.000Z',
    ...overrides,
  };
}

function response(
  overrides: Partial<PicoLinkDirectResponseSignatureInput> = {},
): PicoLinkDirectResponseSignatureInput {
  return {
    suite: picoIdentitySuite,
    requestId: 'linkreq_0001',
    operation: 'home.authority.submit',
    hostSigningKeyFingerprintHex: '11'.repeat(32),
    outcome: 'ok',
    resultDigestHex: '66'.repeat(32),
    createdAt: '2026-07-29T10:00:01.000Z',
    ...overrides,
  };
}

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const ascii = (value: string): string => Buffer.from(value, 'ascii').toString('hex');

describe('Pico Link direct request bytes (ADR 0107 D1)', () => {
  it('is byte-exact and starts with its own label', () => {
    const bytes = buildPicoLinkDirectRequestSignatureInput(request());

    // Length-prefixed label first, exactly as every other canonical family.
    expect(hex(bytes).startsWith(
      `${(picoLinkDirectRequestSignatureInputLabel.length).toString(16).padStart(8, '0')}`
      + Buffer.from(picoLinkDirectRequestSignatureInputLabel, 'ascii').toString('hex'),
    )).toBe(true);

    // The full byte form, pinned one length-prefixed element at a time: any
    // change to layout, order, prefix width or encoding is a wire change and
    // has to be visible as one. Written element-wise rather than as a single
    // opaque blob so it can be read against the builder line by line - the
    // literal prefixes are part of the pin, not a convenience.
    expect(hex(bytes)).toBe([
      `0000001b${ascii('pico.link.direct.request.v1')}`,
      `00000010${ascii('pico.suite.id.v1')}`,
      `0000000c${ascii('linkreq_0001')}`,
      `00000015${ascii('home.authority.submit')}`,
      `00000020${'11'.repeat(32)}`,
      `00000020${'22'.repeat(32)}`,
      `00000020${'33'.repeat(32)}`,
      `00000020${'ee'.repeat(32)}`,
      `0000000f${ascii('delegation_0001')}`,
      `00000020${'44'.repeat(32)}`,
      `00000020${'55'.repeat(32)}`,
      `00000018${ascii('2026-07-29T10:00:00.000Z')}`,
      `00000018${ascii('2026-07-29T10:00:30.000Z')}`,
    ].join(''));
  });

  it('separates the two families: same fields never produce the same bytes', () => {
    // The label is the first element of each, so a response can never be
    // mistaken for a request even where their fields coincide.
    const requestBytes = hex(buildPicoLinkDirectRequestSignatureInput(request()));
    const responseBytes = hex(buildPicoLinkDirectResponseSignatureInput(response()));
    expect(requestBytes).not.toBe(responseBytes);
    expect(responseBytes.startsWith(
      `${(picoLinkDirectResponseSignatureInputLabel.length).toString(16).padStart(8, '0')}`
      + Buffer.from(picoLinkDirectResponseSignatureInputLabel, 'ascii').toString('hex'),
    )).toBe(true);
  });

  it('binds every field: changing any one changes the bytes', () => {
    const baseline = hex(buildPicoLinkDirectRequestSignatureInput(request()));
    const variants: Partial<PicoLinkDirectRequestSignatureInput>[] = [
      { requestId: 'linkreq_0002' },
      { operation: 'home.authority.list' },
      { hostSigningKeyFingerprintHex: 'ab'.repeat(32) },
      { senderIdentityKeyFingerprintHex: 'ab'.repeat(32) },
      { senderDeviceSigningKeyFingerprintHex: 'ab'.repeat(32) },
      { senderDeviceKeyAgreementKeyFingerprintHex: 'ab'.repeat(32) },
      { senderDelegationId: 'delegation_0002' },
      { replyPublicKeyHex: 'ab'.repeat(32) },
      { argumentsDigestHex: 'ab'.repeat(32) },
      { createdAt: '2026-07-29T10:00:00.001Z' },
      { expiresAt: '2026-07-29T10:00:31.000Z' },
    ];
    for (const variant of variants) {
      expect(hex(buildPicoLinkDirectRequestSignatureInput(request(variant)))).not.toBe(baseline);
    }
  });

  it('rejects an operation outside the closed set', () => {
    expect(() => buildPicoLinkDirectRequestSignatureInput(
      request({ operation: 'home.anything.else' as never }),
    )).toThrow('invalid_link_operation');
    // The set itself is what makes remote capability opt-in per operation.
    expect([...picoLinkDirectOperations]).toEqual([
      'home.setup.read',
      'home.claim.submit',
      'home.authority.submit',
      'home.authority.list',
      'home.device.lifecycle.read',
      // ADR 0119 Q5 with ADR 0107: opted in so the person's own device can see
      // the storage condition, not just the operator surface on the host.
      'home.storage.condition.read',
      // ADR 0118 O1: due entries, so the device can say something is waiting.
      'home.time_bound_entries.read',
      'home.time_bound_entry.acknowledge',
      'home.device.lifecycle.submit',
      'home.device.recovery.submit',
      'home.device.recovery.veto',
      'home.identity.rotation.submit',
      'home.identity.rotation.veto',
      'home.host.rotation.prepare',
      'home.host.continuity.submit',
      'home.link.mailbox.exchange',
      // ADR 0152: a person's decision about their own words has to be made
      // where the person is, and ADR 0087 says nobody may answer for them.
      'home.model.providers.read',
      // ADR 0151 PV1: the one operation that carries a secret, from the person
      // who holds it. There is no operation to read one back.
      'home.model.provider.measure.ask',
      'home.model.provider.forget',
      'home.model.provider.credential.submit',
      'home.model.provider.decision.submit',
      'home.model.provider.decision.revoke',
      // ADR 0082: the device issues the grant that lets it read, signed by
      // the key its Vault holds. The Home relays it and never mints one.
      'home.domain.read-grant.submit',
      // ADR 0116 W1: the requesting side - a person asking about what their
      // Home remembers, from the device they are holding.
      'home.recall.ask',
      'home.recall.read',
      'home.recall.keep',
      'home.recall.forget',
      'home.memory.forget',
      // ADR 0116 W5: what is waiting, and the explicit keep that persists it.
      'home.model.reads.read',
      'home.model.read.keep',
      'home.presence.announce',
      'home.presence.read',
      'home.presence.forget',
      'home.presence.switch',
      'home.suppliers.read',
      'home.supplier.reach.decide',
      'home.supplier.attach',
      'home.supplier.detach',
      'home.depots.read',
      'home.depot.attach',
      'home.depot.reach.decide',
      'home.depot.detach',
      'home.depot.fetch.ask',
      'home.depot.offer.accept',
      'home.action.approval.read',
      'home.action.approval.resolve',
      'home.rule.decide',
      'home.rule.forget',
      'home.observations.submit',
      'home.modules.consent.read',
      'home.modules.consent.record',
    ]);
  });

  it('rejects an expiry that does not follow its creation', () => {
    expect(() => buildPicoLinkDirectRequestSignatureInput(
      request({ expiresAt: '2026-07-29T10:00:00.000Z' }),
    )).toThrow('invalid_validity_bounds');
    expect(() => buildPicoLinkDirectRequestSignatureInput(
      request({ expiresAt: '2026-07-29T09:59:00.000Z' }),
    )).toThrow('invalid_validity_bounds');
  });

  it('rejects malformed fingerprints, reply keys and digests', () => {
    expect(() => buildPicoLinkDirectRequestSignatureInput(
      request({ hostSigningKeyFingerprintHex: '11'.repeat(16) }),
    )).toThrow('invalid_fingerprint_length');
    expect(() => buildPicoLinkDirectRequestSignatureInput(
      request({ replyPublicKeyHex: '44'.repeat(16) }),
    )).toThrow('invalid_public_key_length');
    expect(() => buildPicoLinkDirectRequestSignatureInput(
      request({ argumentsDigestHex: '55'.repeat(16) }),
    )).toThrow('invalid_digest_length');
  });

  it('rejects an unexpected or missing field rather than ignoring it', () => {
    expect(() => buildPicoLinkDirectRequestSignatureInput(
      { ...request(), smuggled: 'value' } as never,
    )).toThrow();
    const { expiresAt, ...withoutExpiry } = request();
    expect(expiresAt).toBeDefined();
    expect(() => buildPicoLinkDirectRequestSignatureInput(withoutExpiry as never)).toThrow();
  });

  it('rejects a non-canonical instant', () => {
    expect(() => buildPicoLinkDirectRequestSignatureInput(
      request({ createdAt: '2026-07-29T10:00:00Z' }),
    )).toThrow('invalid_instant');
    // A date that rolls forward is a different date, not a valid one.
    expect(() => buildPicoLinkDirectRequestSignatureInput(
      request({ createdAt: '2026-02-30T10:00:00.000Z' }),
    )).toThrow('invalid_instant');
  });
});

describe('Pico Link direct response bytes (ADR 0107 D1)', () => {
  it('binds outcome and result digest', () => {
    const baseline = hex(buildPicoLinkDirectResponseSignatureInput(response()));
    // A refusal is signed exactly like a result, so a carrier cannot turn
    // one into the other by dropping bytes.
    expect(hex(buildPicoLinkDirectResponseSignatureInput(
      response({ outcome: 'unknown_operation' }),
    ))).not.toBe(baseline);
    expect(hex(buildPicoLinkDirectResponseSignatureInput(
      response({ resultDigestHex: 'ab'.repeat(32) }),
    ))).not.toBe(baseline);
  });

  it('binds the request id, so a reply cannot be moved to another request', () => {
    expect(hex(buildPicoLinkDirectResponseSignatureInput(response({ requestId: 'linkreq_0002' }))))
      .not.toBe(hex(buildPicoLinkDirectResponseSignatureInput(response())));
  });

  it('rejects an outcome that is not a snake_case reason', () => {
    for (const outcome of ['Not Ok', 'ok!', 'UNKNOWN', 'unknown-operation']) {
      expect(() => buildPicoLinkDirectResponseSignatureInput(response({ outcome })))
        .toThrow(/invalid_link_outcome|invalid_field_charset/);
    }
  });

  it('names its envelope schemas distinctly', () => {
    expect(picoLinkDirectRequestEnvelopeSchema).toBe('pico.link.direct.request-envelope.v1');
    expect(picoLinkDirectResponseEnvelopeSchema).toBe('pico.link.direct.response-envelope.v1');
    expect(picoLinkDirectRequestEnvelopeSchema).not.toBe(picoLinkDirectRequestSignatureInputLabel);
  });
});
