import { describe, expect, it } from 'vitest';
import { picoCompanionDisplayFingerprint } from './fingerprint.js';
import { renderPicoCompanionHostRotationNotice } from './notify.js';

describe('ADR 0079 I5 - how this client shows a key to a person', () => {
  it('shows both ends, because the attack is a ground prefix', () => {
    const fingerprint = `${'a1b2c3d4'}${'0'.repeat(48)}${'7f8e9d0c'}`;
    expect(fingerprint).toHaveLength(64);
    const shown = picoCompanionDisplayFingerprint(fingerprint);

    expect(shown).toBe('a1b2c3d4…7f8e9d0c');
    /**
     * ADR 0079's threat table names it: grinding a key whose truncated
     * fingerprint matches a target's *display prefix*. Twelve hex characters
     * of head is forty-eight bits to match. Eight from each end is sixty-four
     * and costs a person nothing, so the tail is the part this pins.
     */
    expect(shown.endsWith('7f8e9d0c')).toBe(true);
    expect(shown.startsWith(fingerprint.slice(0, 12))).toBe(false);
  });

  it('shows a short value whole rather than eliding nothing', () => {
    // An ellipsis between two halves of a seventeen-character string hides
    // nothing and reads as though something is missing.
    expect(picoCompanionDisplayFingerprint('a'.repeat(17))).toBe('a'.repeat(17));
    expect(picoCompanionDisplayFingerprint('')).toBe('');
    expect(picoCompanionDisplayFingerprint('a'.repeat(18))).toContain('…');
  });

  it('is the rule the alarms already speak, not a second one beside them', () => {
    /**
     * The point of the module. Until 2026-08-20 this exact rule existed twice
     * - once here, once as a private helper in the Electron main process -
     * and a third spelling, a bare twelve-character prefix, sat in the
     * renderer contract. One host-key rotation could reach one person as
     * `a1b2c3d4…7f8e9d0c` in the notification and `a1b2c3d4e5f6` in the
     * window. ADR 0131 A5 makes Android the second client to show these
     * strings, so the rule is core-owned and this test is what says both
     * halves of the desktop still read it from the same place.
     */
    const previous = `${'11223344'}${'5'.repeat(48)}${'66778899'}`;
    const current = `${'aabbccdd'}${'e'.repeat(48)}${'ff001122'}`;
    const notice = renderPicoCompanionHostRotationNotice({
      previousHostSigningKeyFingerprintHex: previous,
      hostSigningKeyFingerprintHex: current,
    } as never);

    expect(notice.body).toContain(picoCompanionDisplayFingerprint(previous));
    expect(notice.body).toContain(picoCompanionDisplayFingerprint(current));
    expect(notice.body).not.toContain(current.slice(0, 12));
  });
});
