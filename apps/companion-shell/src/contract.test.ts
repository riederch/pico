import { describe, expect, it } from 'vitest';
import {
  parsePicoCompanionPresentation,
  picoCompanionIdlePresentation,
} from './contract.js';

describe('companion renderer presentation contract', () => {
  it('accepts and freezes the bounded display-only shape', () => {
    const state = picoCompanionIdlePresentation(new Date('2026-08-02T12:00:00Z'));
    expect(state).toEqual({
      kind: 'idle',
      severity: 'active',
      symbol: '●',
      title: 'Pico is watching your Home',
      body: 'No pending device recovery was found on the last authenticated check.',
      observedAt: '2026-08-02T12:00:00.000Z',
    });
    expect(Object.isFrozen(state)).toBe(true);
  });

  it('rejects generic, extended and unbounded renderer payloads', () => {
    const valid = picoCompanionIdlePresentation();
    expect(() => parsePicoCompanionPresentation({ ...valid, socketPath: '/tmp/vault.sock' }))
      .toThrow('invalid_companion_presentation_shape');
    expect(() => parsePicoCompanionPresentation({ ...valid, body: 'x'.repeat(4_001) }))
      .toThrow('invalid_companion_presentation_text');
    expect(() => parsePicoCompanionPresentation({ ...valid, severity: 'secret' }))
      .toThrow('invalid_companion_presentation_state');
  });
});
