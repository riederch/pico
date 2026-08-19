import { describe, expect, it } from 'vitest';
import {
  picoDeviceEnrolmentAcceptancePrefix,
  picoDeviceEnrolmentGrantPrefix,
  picoDeviceEnrolmentOfferPrefix,
} from '@pico/protocol/device-enrolment';
import {
  picoCompanionEnrolmentCodeSteps,
  picoCompanionSponsorExchange,
  runPicoCompanionAskingDeviceExchange,
} from './enrolment-steps.js';

/** Records what a surface was asked to do, in the order it was asked. */
function recordingSurface(grantCode = 'pico-device-grant-v1:GRANT') {
  const calls: string[] = [];
  return {
    calls,
    surface: {
      showCode: async (step: string, code: string) => {
        calls.push(`show:${step}:${code}`);
      },
      readCode: async (step: string, showing?: string) => {
        calls.push(`read:${step}:${showing ?? 'nothing shown'}`);
        return grantCode;
      },
      announce: async (step: string) => {
        calls.push(`announce:${step}`);
      },
    },
  };
}

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

describe('ADR 0131 A5 - the asking device walks one sequence', () => {
  it('shows what it has, reads the answer, and shows its acceptance before waiting', async () => {
    /**
     * The order is the contract between two devices, not a preference. In
     * particular the acceptance is shown *before* `confirm` is awaited: the
     * other device cannot finish without reading it, so a sequence that
     * waited first would leave both devices waiting for each other with no
     * error anywhere - the failure this test exists to make impossible.
     */
    const { calls, surface } = recordingSurface();
    let confirmed = false;

    await runPicoCompanionAskingDeviceExchange({
      surface,
      offer: async () => ({ offerCode: 'pico-device-offer-v1:OFFER' }),
      accept: async (grantCode, offered) => {
        // The walk hands back what the offer produced, so a joining device
        // can accept with the keys its own offer just made.
        calls.push(`accept:${grantCode}:${offered.offerCode}`);
        return {
          acceptanceCode: 'pico-device-acceptance-v1:ACCEPT',
          confirm: async () => {
            confirmed = true;
            calls.push('confirm');
            return { delegationId: 'delegation_x' };
          },
        };
      },
      outcome: 'joined',
    });

    expect(calls).toEqual([
      'show:show_offer:pico-device-offer-v1:OFFER',
      'read:read_grant:pico-device-offer-v1:OFFER',
      'accept:pico-device-grant-v1:GRANT:pico-device-offer-v1:OFFER',
      'show:show_acceptance:pico-device-acceptance-v1:ACCEPT',
      'announce:waiting',
      'confirm',
      'announce:joined',
    ]);
    expect(confirmed).toBe(true);
  });

  it('says which of the two things happened at the end', async () => {
    // ADR 0130 E3: joining and keeping are different sentences to the person,
    // and the sequence that produces them is the same one.
    const { calls, surface } = recordingSurface();

    await runPicoCompanionAskingDeviceExchange({
      surface,
      offer: async () => ({ offerCode: 'pico-device-offer-v1:OFFER' }),
      accept: async () => ({
        acceptanceCode: 'pico-device-acceptance-v1:ACCEPT',
        confirm: async () => ({ delegationId: 'delegation_x' }),
      }),
      outcome: 'kept',
    });

    expect(calls.at(-1)).toBe('announce:kept');
  });

  it('keeps the grant on screen while the sponsor reads the answer', async () => {
    // The sponsor's half. The grant stays shown while the acceptance is read,
    // because on the camera path the other device is reading it at that
    // moment and on the typed path the person still needs it in front of them.
    const { calls, surface } = recordingSurface('pico-device-acceptance-v1:ACCEPT');

    const exchange = picoCompanionSponsorExchange(surface);
    const acceptance = await exchange('pico-device-grant-v1:GRANT');

    expect(acceptance).toBe('pico-device-acceptance-v1:ACCEPT');
    expect(calls).toEqual([
      'show:show_grant:pico-device-grant-v1:GRANT',
      'read:read_acceptance:pico-device-grant-v1:GRANT',
    ]);
  });
});
