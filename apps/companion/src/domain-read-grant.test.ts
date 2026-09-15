import { describe, expect, it, vi } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import {
  buildPicoHomeDomainReadGrantSignatureInput,
} from '@pico/protocol';
import {
  grantPicoCompanionDomainRead,
  picoCompanionGrantLifecycleOrder,
  readPicoCompanionHomeId,
} from './domain-read-grant.js';

/**
 * ADR 0082 with ADR 0100 on the device side. What crosses the wire is a
 * statement, and the only part of it this module could not fake is the one
 * that matters.
 */
function linkClient(response: unknown) {
  return { request: vi.fn(async () => response) };
}

const identity = 'a'.repeat(64);

describe('ADR 0082 - the device issues, the Home records', () => {
  it('signs the canonical bytes of the grant it sends, and nothing else', async () => {
    // The signature has to be over what the Home will verify. Signing anything
    // else - a summary, a digest of a different shape - would produce a
    // statement that looks issued and is refused, which is the failure mode a
    // person cannot debug.
    await sodium.ready;
    const keypair = sodium.crypto_sign_keypair();
    const signed: Uint8Array[] = [];
    const client = linkClient({
      outcome: 'ok',
      result: { grantId: 'grant_domain-private_aaaa', privacyDomain: 'domain-private', status: 'active' },
    });

    await grantPicoCompanionDomainRead({
      livingDeviceLinkClient: client as never,
      signer: {
        metadata: () => ({}) as never,
        sign: (input) => {
          signed.push(input);
          return sodium.crypto_sign_detached(input, keypair.privateKey);
        },
      },
      homeId: 'home_1',
      hostSigningKeyFingerprintHex: 'b'.repeat(64),
      homeHostPicoIdentityFingerprintHex: identity,
      identityPublicKeyHex: Buffer.from(keypair.publicKey).toString('hex'),
      privacyDomain: 'domain-private',
      validFrom: '2026-08-16T00:00:00.000Z',
      validUntil: '2027-08-16T00:00:00.000Z',
      nowMs: 1_755_300_000_000,
    });

    const sent = (client.request.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(Buffer.from(signed[0]!).toString('hex')).toBe(
      Buffer.from(buildPicoHomeDomainReadGrantSignatureInput(
        sent.grant as never,
      )).toString('hex'),
    );
  });

  it('tells the person which of the three refusals they met', async () => {
    // Somebody else's Home, an identity that is not in this one, and a domain
    // that does not exist yet are three different things to do next.
    for (const refusal of [
      'issuer_is_not_home_host_pico',
      'reader_is_not_active_member',
      'domain_is_not_host_custody',
    ]) {
      await expect(grantPicoCompanionDomainRead({
        livingDeviceLinkClient: linkClient({
          outcome: 'invalid_arguments',
          result: { refusal },
        }) as never,
        signer: { metadata: () => ({}) as never, sign: () => new Uint8Array(64) },
        homeId: 'home_1',
        hostSigningKeyFingerprintHex: 'b'.repeat(64),
        homeHostPicoIdentityFingerprintHex: identity,
        identityPublicKeyHex: 'c'.repeat(64),
        privacyDomain: 'domain-private',
        validFrom: '2026-08-16T00:00:00.000Z',
        validUntil: '2027-08-16T00:00:00.000Z',
        nowMs: 1_755_300_000_000,
      })).rejects.toThrow(new RegExp(refusal, 'u'));
    }
  });

  it('names the grant after the pair it is about, so re-issuing replaces', async () => {
    // One grant per reader per domain is what a person means by "this device
    // may read this"; a fresh id each time would leave a pile of statements
    // nobody revokes.
    const client = linkClient({
      outcome: 'ok',
      result: { grantId: 'x', privacyDomain: 'domain-private', status: 'active' },
    });
    const issue = async (nowMs: number) => {
      await grantPicoCompanionDomainRead({
        livingDeviceLinkClient: client as never,
        signer: { metadata: () => ({}) as never, sign: () => new Uint8Array(64) },
        homeId: 'home_1',
        hostSigningKeyFingerprintHex: 'b'.repeat(64),
        homeHostPicoIdentityFingerprintHex: identity,
        identityPublicKeyHex: 'c'.repeat(64),
        privacyDomain: 'domain-private',
        validFrom: '2026-08-16T00:00:00.000Z',
        validUntil: '2027-08-16T00:00:00.000Z',
        nowMs,
      });
      return (client.request.mock.calls.at(-1) as unknown as [string, {
        grant: { grantId: string; lifecycleOrder: string };
      }])[1].grant;
    };

    const first = await issue(1_755_300_000_000);
    const second = await issue(1_755_300_001_000);
    expect(second.grantId).toBe(first.grantId);
    // And the later statement is later, so the Home can tell them apart.
    expect(second.lifecycleOrder > first.lifecycleOrder).toBe(true);
  });

  it('orders lifecycle statements by the clock, padded to the vocabulary', () => {
    expect(picoCompanionGrantLifecycleOrder(1_755_300_000_000))
      .toBe('seq:0001755300000000');
    expect(picoCompanionGrantLifecycleOrder(1))
      .toBe('seq:0000000000000001');
  });
});

describe('ADR 0080 - which Home this is, asked rather than kept', () => {
  it('takes the identifier from the read this device already performs', async () => {
    const client = linkClient({ outcome: 'ok', result: { homeId: 'home_1' } });
    expect(await readPicoCompanionHomeId({ livingDeviceLinkClient: client as never }))
      .toBe('home_1');
    expect(client.request).toHaveBeenCalledWith('home.device.lifecycle.read', {});
  });

  it('refuses an answer with no identifier rather than signing a grant for nothing', async () => {
    await expect(readPicoCompanionHomeId({
      livingDeviceLinkClient: linkClient({ outcome: 'ok', result: {} }) as never,
    })).rejects.toThrow('invalid_pico_home_id_result');
  });
});
