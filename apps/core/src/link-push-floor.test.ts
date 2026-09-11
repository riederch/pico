import { describe, expect, it } from 'vitest';
import {
  decidePicoLinkPush,
  minPicoLinkPushIntervalMs,
  picoLinkPushOccasions,
  type PicoLinkPushLedgerEntry,
} from './link-push-floor.js';

/**
 * ADR 0150 PU5. One push per event, a floor per device, and no retry.
 *
 * The two refusals are different on purpose, and the test that matters most
 * is the one showing they answer differently to the passage of time.
 */
const device = 'b'.repeat(64);
const otherDevice = 'c'.repeat(64);
const nowMs = Date.parse('2026-08-13T10:00:00.000Z');

const entry = (over: Partial<PicoLinkPushLedgerEntry> = {}): PicoLinkPushLedgerEntry => ({
  deviceSigningKeyFingerprintHex: device,
  occasion: 'device_recovery_pending',
  eventId: 'recovery-1',
  atMs: nowMs,
  ...over,
});

describe('ADR 0150 PU5 - when a Home may push', () => {
  it('pushes when nothing has been pushed', () => {
    expect(decidePicoLinkPush({
      ledger: [], deviceSigningKeyFingerprintHex: device,
      occasion: 'device_recovery_pending', eventId: 'recovery-1', nowMs,
    })).toEqual({ push: true });
  });

  it('never pushes twice for one event, however long ago the first was', () => {
    // The no-retry rule. ADR 0149 RS5 means a relay reports no delivery, so a
    // Home resending until something happened would resend against silence.
    const ledger = [entry()];
    expect(decidePicoLinkPush({
      ledger, deviceSigningKeyFingerprintHex: device,
      occasion: 'device_recovery_pending', eventId: 'recovery-1',
      nowMs: nowMs + 30 * 24 * 60 * 60 * 1_000,
    })).toEqual({ push: false, reason: 'already_pushed_for_this_event' });
  });

  it('refuses a different event inside the floor, and allows it after', () => {
    // A person's device is what is being spent either way, so a second
    // genuine event inside the floor waits for the poll.
    const ledger = [entry()];
    expect(decidePicoLinkPush({
      ledger, deviceSigningKeyFingerprintHex: device,
      occasion: 'objection_window_closing', eventId: 'window-1',
      nowMs: nowMs + minPicoLinkPushIntervalMs - 1,
    })).toEqual({ push: false, reason: 'too_soon' });

    expect(decidePicoLinkPush({
      ledger, deviceSigningKeyFingerprintHex: device,
      occasion: 'objection_window_closing', eventId: 'window-1',
      nowMs: nowMs + minPicoLinkPushIntervalMs,
    })).toEqual({ push: true });
  });

  it('names the two refusals apart, because they answer time differently', () => {
    // A caller told `too_soon` would reasonably try again later. There is
    // nothing to try again for after `already_pushed_for_this_event`.
    const ledger = [entry()];
    const late = nowMs + 60 * 60 * 1_000;
    expect(decidePicoLinkPush({
      ledger, deviceSigningKeyFingerprintHex: device,
      occasion: 'device_recovery_pending', eventId: 'recovery-1', nowMs: late,
    }).reason).toBe('already_pushed_for_this_event');
    expect(decidePicoLinkPush({
      ledger, deviceSigningKeyFingerprintHex: device,
      occasion: 'device_recovery_pending', eventId: 'recovery-2', nowMs: late,
    })).toEqual({ push: true });
  });

  it('holds the floor per device, not across them', () => {
    const ledger = [entry()];
    expect(decidePicoLinkPush({
      ledger, deviceSigningKeyFingerprintHex: otherDevice,
      occasion: 'device_recovery_pending', eventId: 'recovery-1', nowMs,
    })).toEqual({ push: true });
  });

  it('holds a closed list of occasions', () => {
    // Adding one is a decision that some event is worth a person's device
    // waking, and that should be spoken rather than inherited from a path.
    expect([...picoLinkPushOccasions])
      .toEqual(['device_recovery_pending', 'objection_window_closing']);
    expect(() => decidePicoLinkPush({
      ledger: [], deviceSigningKeyFingerprintHex: device,
      occasion: 'anything_changed' as never, eventId: 'x', nowMs,
    })).toThrow('unknown_pico_link_push_occasion');
  });

  it('refuses an event nobody named', () => {
    expect(() => decidePicoLinkPush({
      ledger: [], deviceSigningKeyFingerprintHex: device,
      occasion: 'device_recovery_pending', eventId: '', nowMs,
    })).toThrow('invalid_pico_link_push_event');
  });
});

/**
 * Befund B150. Hier standen zwei Tests der reinen `recordPicoLinkPush`, und
 * die hatte keinen Produktaufrufer: das Home haengt an SQLite an. Was sie
 * bewiesen - ein Eintrag ueberlebt lange genug, um eine Wiederholung noch
 * abzulehnen -, steht jetzt in `event-store.test.ts` gegen den Weg, den das
 * Produkt geht, samt der Ablehnung, die das Schema selbst ausspricht.
 */

