import { describe, expect, it } from 'vitest';
import { picoCompanionPublicServiceErrorReason } from './public-error.js';

describe('companion public service errors', () => {
  it('maps operational failures without exposing local paths', () => {
    expect(picoCompanionPublicServiceErrorReason(
      new Error('unreadable_companion_profile:ENOENT:/home/alice/.pico/profile.json'),
    )).toBe('companion_profile_unavailable');
    expect(picoCompanionPublicServiceErrorReason(
      new Error('connect ENOENT /home/alice/.pico/vault/run/daemon.sock'),
    )).toBe('pico_vault_unavailable');
    expect(picoCompanionPublicServiceErrorReason(new Error('key bytes leaked here')))
      .toBe('companion_service_unavailable');
  });
});
