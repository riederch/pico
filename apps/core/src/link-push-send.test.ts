import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { parsePicoLinkSealedPush, buildPicoLinkPushSignatureInput } from '@pico/protocol';
import { parsePicoLinkPacketAddress } from '@pico/protocol/link-packet';
import type { PicoLinkDeliveryOutcome } from '@pico/protocol/link-delivery';
import { sendPicoLinkPush } from './link-push-send.js';
import { maxPicoLinkPushLifetimeMs } from './link-push-lifetime.js';
import type { PicoLinkPushCandidate } from './link-push-occasion.js';
import type { PicoLinkMailboxRecord } from './event-store.js';

/**
 * ADR 0150. Real libsodium, because what is under test is that the device can
 * actually open and verify what the Home built.
 */
const operator = 'relay.example.invalid';
const device = 'a'.repeat(64);
/**
 * Deliberately **off** the quarter-hour grid. On it, the push lifetime and the
 * expiry bucket are both fifteen minutes, so a packet given far too short a
 * life rounds up to exactly the right answer by coincidence - and the test
 * below passed against a planted defect until this moved.
 */
const nowMs = Date.parse('2026-08-13T10:07:00.000Z');

let host: { publicKey: Uint8Array; privateKey: Uint8Array };
let deviceAgreement: { publicKey: Uint8Array; privateKey: Uint8Array };

beforeAll(async () => {
  await sodium.ready;
  host = sodium.crypto_sign_keypair();
  deviceAgreement = sodium.crypto_box_keypair();
});

const mailbox: PicoLinkMailboxRecord = {
  deviceSigningKeyFingerprintHex: device,
  picoIdentityFingerprintHex: 'e'.repeat(64),
  deviceKeyAgreementKeyFingerprintHex: 'd'.repeat(64),
  delegationId: 'delegation-1',
  homeInbound: `${'1'.repeat(32)}@${operator}`,
  deviceInbound: `${'2'.repeat(32)}@${operator}`,
  exchangedAt: '2026-08-13T09:00:00.000Z',
};

const candidate: PicoLinkPushCandidate = {
  mailbox,
  occasion: 'device_recovery_pending',
  eventId: 'recovery-1',
};

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

function send(over: {
  deliver?: (packet: unknown) => Promise<PicoLinkDeliveryOutcome>;
  recorded?: string[];
  delivered?: unknown[];
} = {}) {
  return sendPicoLinkPush({
    candidate,
    deviceKeyAgreementPublicKeyHex: hex(deviceAgreement.publicKey),
    hostSigningKeyFingerprintHex: 'f'.repeat(64),
    suite: 'pico.suite.id.v1',
    pushId: 'push_0001',
    packetTag: 'b'.repeat(32),
    nowMs,
    seal: (plaintext, recipientPublicKeyHex) => sodium.crypto_box_seal(
      plaintext,
      Uint8Array.from(recipientPublicKeyHex.match(/../g)!.map((p) => Number.parseInt(p, 16))),
    ),
    sign: (bytes) => hex(sodium.crypto_sign_detached(bytes, host.privateKey)),
    deliver: async (packet) => {
      over.delivered?.push(packet);
      return await (over.deliver?.(packet) ?? Promise.resolve('accepted' as const));
    },
    recordSent: ({ at }) => {
      over.recorded?.push(at);
    },
  });
}

describe('ADR 0150 - sending a push', () => {
  it('builds something the device can open and verify', async () => {
    const delivered: unknown[] = [];
    expect(await send({ delivered })).toBe('accepted');

    const packet = delivered[0] as { to: string; payload: string };
    expect(parsePicoLinkPacketAddress(packet.to).mailbox).toBe('2'.repeat(32));

    const opened = sodium.crypto_box_seal_open(
      Buffer.from(packet.payload, 'base64'),
      deviceAgreement.publicKey,
      deviceAgreement.privateKey,
    );
    const sealed = parsePicoLinkSealedPush(JSON.parse(new TextDecoder().decode(opened)));
    expect(sealed.push.deviceSigningKeyFingerprintHex).toBe(device);
    expect(sodium.crypto_sign_verify_detached(
      Uint8Array.from(sealed.hostSignatureHex.match(/../g)!.map((p) => Number.parseInt(p, 16))),
      buildPicoLinkPushSignatureInput(sealed.push),
      host.publicKey,
    )).toBe(true);
  });

  it('says nothing but what a push may say', async () => {
    const delivered: unknown[] = [];
    await send({ delivered });
    const packet = delivered[0] as { payload: string };
    const opened = sodium.crypto_box_seal_open(
      Buffer.from(packet.payload, 'base64'),
      deviceAgreement.publicKey,
      deviceAgreement.privateKey,
    );
    const sealed = parsePicoLinkSealedPush(JSON.parse(new TextDecoder().decode(opened)));
    // Not even the occasion or the event travels: those are the Home's own
    // names for why it pushed, and a push says "ask me".
    expect(Object.keys(sealed.push).sort()).toEqual([
      'createdAt', 'deviceSigningKeyFingerprintHex', 'expiresAt',
      'hostSigningKeyFingerprintHex', 'pushId', 'suite',
    ]);
    expect(JSON.stringify(sealed)).not.toContain('recovery-1');
    expect(JSON.stringify(sealed)).not.toContain('device_recovery_pending');
  });

  it('gives the packet at least the life the push has', async () => {
    // The two bound different things, and a packet that died first would drop
    // a push nobody ever saw.
    const delivered: unknown[] = [];
    await send({ delivered });
    const packet = delivered[0] as { expiresAt: string };
    expect(Date.parse(packet.expiresAt)).toBeGreaterThanOrEqual(nowMs + maxPicoLinkPushLifetimeMs);
  });

  it('records only after an accepted delivery', async () => {
    // Recording first and failing to deliver leaves a Home believing it
    // pushed when nothing left, and the person is not woken.
    const recorded: string[] = [];
    expect(await send({ recorded, deliver: async () => 'mailbox_full' })).toBe('mailbox_full');
    expect(recorded).toEqual([]);

    expect(await send({ recorded })).toBe('accepted');
    expect(recorded).toEqual(['2026-08-13T10:07:00.000Z']);
  });

  it('records nothing for a mailbox the operator does not hold', async () => {
    const recorded: string[] = [];
    expect(await send({ recorded, deliver: async () => 'mailbox_revoked' })).toBe('mailbox_revoked');
    expect(recorded).toEqual([]);
  });
});
