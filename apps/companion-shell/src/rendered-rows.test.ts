import { afterEach, describe, expect, it } from 'vitest';
import { picoDisplayDate } from '@pico/protocol/when-display';
import {
  picoCompanionRenderedDeviceAuthority,
  picoCompanionRenderedHomeMembers,
  picoCompanionRenderedModuleConsent,
} from './rendered-rows.js';

const original = process.env.TZ;
afterEach(() => {
  process.env.TZ = original;
});

describe('ADR 0113 C2 - what the window is handed', () => {
  it('renders the day in the main process, where the rule can be reached', () => {
    process.env.TZ = 'Pacific/Kiritimati';
    const [row] = picoCompanionRenderedDeviceAuthority({
      mayEndAuthority: true,
      devices: [{
        delegationId: 'delegation_a',
        presenceId: 'device-a',
        deviceSigningKeyFingerprintHex: 'ab'.repeat(32),
        status: 'active',
        validUntil: '2027-01-01T23:30:00.000Z',
        isThisDevice: true,
      }],
    } as never).devices;

    // The reader is already on the second when that instant falls; the cut
    // this replaces said the first to everybody.
    expect(row?.validUntilDisplay).toBe('2027-01-02');
    expect(row?.validUntil).toBe('2027-01-01T23:30:00.000Z');
  });

  it('leaves a place that does not end without a day', () => {
    /**
     * `validUntil` is `null` on the founder's own row. Rendering that as an
     * empty string would put a sentence with a hole in it on the screen -
     * "Lives here until ." - so the absence crosses as an absence, and the
     * line that reads it says something else entirely.
     */
    const [founder, member] = picoCompanionRenderedHomeMembers([
      { picoIdentityFingerprintHex: 'cd'.repeat(32), validUntil: null },
      { picoIdentityFingerprintHex: 'cd'.repeat(32), validUntil: '2027-06-01T12:00:00.000Z' },
    ] as never);

    expect(founder?.validUntilDisplay).toBeNull();
    expect(member?.validUntilDisplay).toBe(picoDisplayDate('2027-06-01T12:00:00.000Z'));
    // And the name a person reads is not the name the ending call needs.
    expect(member?.picoIdentityDisplay).toBe('cdcdcdcd…cdcdcdcd');
    expect(member?.picoIdentityFingerprintHex).toBe('cd'.repeat(32));
  });
});

describe('Nutzerentscheidung 9 - der Tag der frueheren Zustimmung', () => {
  it('zeichnet ihn hier und laesst den Instant auf dieser Seite der Naht', () => {
    process.env.TZ = 'Pacific/Kiritimati';
    const [row] = picoCompanionRenderedModuleConsent([{
      identifier: 'calendar',
      drift: { added: [], removed: [], changed: ['read your appointments'] },
      declares: [{ name: 'read', description: 'read your appointments', risk: 'low' }],
      consentedAt: '2026-08-13T17:43:04.923Z',
    }]);

    expect(row?.agreedOnDisplay).toBe(picoDisplayDate('2026-08-13T17:43:04.923Z'));
    // Was nicht hinueberreicht, kann drueben nicht gezeigt werden. Der
    // Zeichner bekam bis zum 2026-09-23 den rohen Instant und haette ihn
    // durch `picoDisplayDate` schicken muessen - eine Regel, die er nicht
    // erreichen kann, weil `@pico/protocol` im Browser kein Modul ist.
    expect(Object.keys(row ?? {})).not.toContain('consentedAt');
    expect(JSON.stringify(row)).not.toContain('2026-08-13T17:43:04.923Z');
  });

  it('haengt nichts an ein Modul, das zum ersten Mal fragt', () => {
    const [row] = picoCompanionRenderedModuleConsent([{
      identifier: 'calendar',
      drift: { added: ['read your appointments'], removed: [], changed: [] },
      declares: [{ name: 'read', description: 'read your appointments', risk: 'low' }],
    }]);

    // Ein erfundener Tag waere eine Behauptung ueber eine Zustimmung, die es
    // nie gab.
    expect(row?.agreedOnDisplay).toBeUndefined();
    expect(Object.keys(row ?? {})).not.toContain('agreedOnDisplay');
  });
});
