import { describe, expect, it } from 'vitest';
import {
  picoDeviceEnrolmentAcceptancePrefix,
  picoDeviceEnrolmentGrantPrefix,
  picoDeviceEnrolmentOfferPrefix,
} from '@pico/protocol/device-enrolment';
import { picoCompanionEnrolmentCodeSteps } from './enrolment-steps.js';

describe('ADR 0131 A5 - the code exchange states its own steps', () => {
  it('pairs every read with the prefix the protocol defines for that code', () => {
    /**
     * The pairing, not the prefixes. A surface that reads an acceptance while
     * validating an offer refuses a code both people are holding correctly,
     * and says "wrong code" to two people who did everything right - a
     * failure that looks like the other device's fault.
     *
     * It was six string literals in `apps/companion-shell/src/main.ts` until
     * 2026-08-19, which made every future client a seventh copy.
     */
    expect(picoCompanionEnrolmentCodeSteps.read_offer.prefix)
      .toBe(picoDeviceEnrolmentOfferPrefix);
    expect(picoCompanionEnrolmentCodeSteps.read_grant.prefix)
      .toBe(picoDeviceEnrolmentGrantPrefix);
    expect(picoCompanionEnrolmentCodeSteps.read_acceptance.prefix)
      .toBe(picoDeviceEnrolmentAcceptancePrefix);
  });

  it('gives each device its own four steps, and no step both directions', () => {
    // ADR 0130 E3: a sponsor never shows an offer and a joining device never
    // reads one. The split is by device, so a client that implemented the
    // union would offer a person a control the ceremony has no place for.
    const reads = Object.entries(picoCompanionEnrolmentCodeSteps)
      .filter(([, step]) => step.direction === 'read')
      .map(([name]) => name);
    const shows = Object.entries(picoCompanionEnrolmentCodeSteps)
      .filter(([, step]) => step.direction === 'show')
      .map(([name]) => name);

    expect(reads).toEqual(['read_offer', 'read_grant', 'read_acceptance']);
    expect(shows).toEqual(['show_offer', 'show_grant', 'show_acceptance']);
    expect(reads.filter((name) => shows.includes(name))).toEqual([]);
  });

  it('covers all three codes in both directions and invents no fourth', () => {
    const kinds = new Set(
      Object.values(picoCompanionEnrolmentCodeSteps).map((step) => step.kind),
    );
    expect([...kinds].sort()).toEqual(['acceptance', 'grant', 'offer']);
  });
});
