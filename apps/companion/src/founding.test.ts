import { picoTestValidityWindow } from '@pico/protocol';
import { describe, expect, it } from 'vitest';
import { foundPicoCompanionHome } from './founding.js';

/**
 * Ein Jahr ab jetzt, nicht der Neujahrstag 2027.
 *
 * Diese Tests fahren ein echtes Home hoch, das an seiner eigenen Uhr misst.
 * Ein festes Ende hätte sie am 2027-01-01 gemeinsam umgeworfen - dieselbe
 * Sorte Fehlschlag, die am 2026-08-27 drei Tests im Kern erwischt hat, nur
 * vier Monate später und mit neunzehn auf einmal. `pnpm clock:check` stellt
 * die Uhr ein Jahr vor und sucht danach.
 */
const VALID_UNTIL = picoTestValidityWindow().validUntil;

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
        delegationValidUntil: VALID_UNTIL,
      })).rejects.toThrow('invalid_companion_core_url');
    }
  });
});
