import { describe, expect, it } from 'vitest';
import { foundPicoCompanionHome } from './founding.js';

describe('ADR 0130 E2 - the address a Home is founded at', () => {
  it('is refused before anything is created', async () => {
    /**
     * The order is the point. This runs before the daemon is even connected
     * to - the socket path below is nonsense and never reached - because a
     * Home founded at an address a grant cannot carry is a Home that can
     * never be given a second device, and the person finds that out much
     * later, from a message about a *code*.
     *
     * The three shapes are the ones the four old rules disagreed about: a
     * scheme `new URL` would have normalised, an address longer than a grant,
     * and a space no prefix check can see.
     */
    for (const coreUrl of [
      'HTTP://192.168.1.20:3000',
      `http://${'a'.repeat(600)}:3000`,
      'http://exa mple:3000',
    ]) {
      await expect(foundPicoCompanionHome({
        socketPath: '/nonexistent/pico-founding-must-not-reach-this.sock',
        profilePath: '/nonexistent/profile.json',
        coreUrl,
        announcement: {} as never,
        passphrase: 'a passphrase',
        sodium: {} as never,
        // Present because the type asks for them, and never consulted: the
        // refusal happens before a key is made or anybody is asked anything.
        decisions: {} as never,
        delegationValidUntil: '2027-01-01T00:00:00.000Z',
      })).rejects.toThrow('invalid_companion_core_url');
    }
  });
});
