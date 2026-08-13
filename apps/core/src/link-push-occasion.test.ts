import { describe, expect, it } from 'vitest';
import type { PicoHomeDeviceRecoveryPendingView } from '@pico/protocol';
import {
  picoLinkPushCandidates,
  picoLinkPushWindowNoticeMs,
} from './link-push-occasion.js';
import type { PicoLinkPushLedgerEntry } from './link-push-floor.js';
import type { PicoLinkMailboxRecord } from './event-store.js';

/**
 * ADR 0150 PU5. The two judgements: who gets pushed, and about what.
 *
 * The one that carries most is the exclusion. A recovery is about one device
 * and that device is not the one to tell - ADR 0110's objection comes from a
 * device the person still holds, and the target is the one being enrolled.
 */
const identity = 'i'.repeat(64);
const living = 'a'.repeat(64);
const second = 'b'.repeat(64);
const target = 't'.repeat(64);
const operator = 'relay.example.invalid';
const nowMs = Date.parse('2026-08-13T10:00:00.000Z');

function mailbox(device: string, seed: string): PicoLinkMailboxRecord {
  return {
    deviceSigningKeyFingerprintHex: device,
    picoIdentityFingerprintHex: identity,
    deviceKeyAgreementKeyFingerprintHex: 'c'.repeat(64),
    delegationId: `delegation-${seed}`,
    homeInbound: `${seed.repeat(32)}@${operator}`,
    deviceInbound: `${seed.repeat(32).replace(/./g, '9')}@${operator}`,
    exchangedAt: '2026-08-13T09:00:00.000Z',
  };
}

const pending = (over: Partial<PicoHomeDeviceRecoveryPendingView> = {}): PicoHomeDeviceRecoveryPendingView => ({
  recoveryId: 'recovery-1',
  claimDigestHex: 'd'.repeat(64),
  targetDelegationId: 'delegation-target',
  targetDeviceSigningKeyFingerprintHex: target,
  targetDeviceKeyAgreementKeyFingerprintHex: 'e'.repeat(64),
  acceptedAt: '2026-08-13T09:00:00.000Z',
  effectiveAt: '2026-08-14T10:00:00.000Z',
  completionExpiresAt: '2026-08-16T10:00:00.000Z',
  ...over,
});

const candidates = (input: {
  mailboxes: readonly PicoLinkMailboxRecord[];
  recovery?: PicoHomeDeviceRecoveryPendingView | null;
  ledger?: readonly PicoLinkPushLedgerEntry[];
  nowMs?: number;
}) => picoLinkPushCandidates({
  mailboxes: input.mailboxes,
  pendingRecoveryFor: () => (input.recovery === undefined ? pending() : input.recovery),
  ledger: input.ledger ?? [],
  nowMs: input.nowMs ?? nowMs,
});

describe('ADR 0150 PU5 - who gets pushed', () => {
  it('pushes the devices that could object', () => {
    const result = candidates({ mailboxes: [mailbox(living, '1'), mailbox(second, '2')] });
    expect(result.map((entry) => entry.mailbox.deviceSigningKeyFingerprintHex))
      .toEqual([living, second]);
    expect(result.every((entry) => entry.eventId === 'recovery-1')).toBe(true);
  });

  it('never pushes the device being recovered onto', () => {
    // **The judgement that carries most.** Telling the target about its own
    // arrival would leave the side that could object hearing nothing.
    const result = candidates({ mailboxes: [mailbox(target, '3'), mailbox(living, '1')] });
    expect(result.map((entry) => entry.mailbox.deviceSigningKeyFingerprintHex)).toEqual([living]);
  });

  it('excludes the target by name, not by it happening to have no mailbox', () => {
    // A device being recovered onto has usually exchanged nothing, and
    // "usually" is not a rule.
    expect(candidates({ mailboxes: [mailbox(target, '3')] })).toEqual([]);
  });

  it('pushes nothing when no recovery is pending', () => {
    expect(candidates({ mailboxes: [mailbox(living, '1')], recovery: null })).toEqual([]);
  });
});

describe('ADR 0150 PU5 - which occasion', () => {
  it('says pending while the window is far off', () => {
    expect(candidates({ mailboxes: [mailbox(living, '1')] })[0]?.occasion)
      .toBe('device_recovery_pending');
  });

  it('says closing once the window is nearer than the next look would be', () => {
    // Two hours against a six-hour poll: a person whose next scheduled look
    // is further away than the window has left would find out afterwards.
    const closing = Date.parse('2026-08-14T10:00:00.000Z') - picoLinkPushWindowNoticeMs;
    expect(candidates({ mailboxes: [mailbox(living, '1')], nowMs: closing })[0]?.occasion)
      .toBe('objection_window_closing');
    expect(candidates({ mailboxes: [mailbox(living, '1')], nowMs: closing - 1 })[0]?.occasion)
      .toBe('device_recovery_pending');
  });

  it('pushes nothing once the window has closed', () => {
    // Waking a device to tell it about something it can no longer act on is
    // noise wearing the shape of an alarm.
    expect(candidates({
      mailboxes: [mailbox(living, '1')],
      nowMs: Date.parse('2026-08-14T10:00:00.000Z'),
    })).toEqual([]);
  });

  it('lets the closing window override a pending push already sent', () => {
    // The two are different occasions, so the no-retry rule does not bind
    // across them - and the closing one is the lateness nobody recovers from.
    const ledger: PicoLinkPushLedgerEntry[] = [{
      deviceSigningKeyFingerprintHex: living,
      occasion: 'device_recovery_pending',
      eventId: 'recovery-1',
      atMs: nowMs - 60 * 60 * 1_000,
    }];
    const closing = Date.parse('2026-08-14T10:00:00.000Z') - picoLinkPushWindowNoticeMs;
    expect(candidates({ mailboxes: [mailbox(living, '1')], ledger, nowMs: closing })[0]?.occasion)
      .toBe('objection_window_closing');
  });

  it('honours the ledger it is given', () => {
    const ledger: PicoLinkPushLedgerEntry[] = [{
      deviceSigningKeyFingerprintHex: living,
      occasion: 'device_recovery_pending',
      eventId: 'recovery-1',
      atMs: nowMs - 60 * 60 * 1_000,
    }];
    expect(candidates({ mailboxes: [mailbox(living, '1')], ledger })).toEqual([]);
  });

  it('gives one device at most one candidate', () => {
    const result = candidates({ mailboxes: [mailbox(living, '1')] });
    expect(result).toHaveLength(1);
  });
});
