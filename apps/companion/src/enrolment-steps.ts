import {
  picoDeviceEnrolmentAcceptancePrefix,
  picoDeviceEnrolmentGrantPrefix,
  picoDeviceEnrolmentOfferPrefix,
} from '@pico/protocol/device-enrolment';

/**
 * ADR 0130 E3 / ADR 0131 A5. The three-code exchange, stated once.
 *
 * The codes and their prefixes are the protocol's (ADR 0130 E3); what lives
 * here is the part a *client* has to get right: at which moment each code is
 * read rather than shown, and which prefix a read must accept. That pairing
 * was six string literals in the desktop shell's `main.ts`, which made every
 * further client - the Android one A5 asks for above all - a seventh copy of
 * a fact nothing checked.
 *
 * Getting it wrong does not fail loudly. A surface that reads an acceptance
 * while validating against the offer prefix refuses a code that is correct,
 * in front of two people who both did exactly what they were asked, and the
 * refusal reads as the *other* device's fault.
 *
 * The steps are split by device rather than by order, matching the words the
 * companion shell already shows: a sponsor never shows an offer and a joining
 * device never reads one, so no client should offer both halves.
 */
export type PicoCompanionEnrolmentCodeKind = 'offer' | 'grant' | 'acceptance';

export interface PicoCompanionEnrolmentCodeStep {
  kind: PicoCompanionEnrolmentCodeKind;
  direction: 'read' | 'show';
  /**
   * Present on a read and absent on a show, because the asymmetry is real:
   * what is shown is whatever the ceremony produced, and what is read has to
   * be checked before it is believed.
   */
  prefix?: string;
}

export const picoCompanionEnrolmentCodeSteps = {
  read_offer: { kind: 'offer', direction: 'read', prefix: picoDeviceEnrolmentOfferPrefix },
  read_grant: { kind: 'grant', direction: 'read', prefix: picoDeviceEnrolmentGrantPrefix },
  read_acceptance: {
    kind: 'acceptance',
    direction: 'read',
    prefix: picoDeviceEnrolmentAcceptancePrefix,
  },
  show_offer: { kind: 'offer', direction: 'show' },
  show_grant: { kind: 'grant', direction: 'show' },
  show_acceptance: { kind: 'acceptance', direction: 'show' },
} as const satisfies Record<string, PicoCompanionEnrolmentCodeStep>;

export type PicoCompanionEnrolmentCodeStepName =
  keyof typeof picoCompanionEnrolmentCodeSteps;

/** The prefix a read must accept, by the name the surface already uses. */
export function picoCompanionEnrolmentReadPrefix(
  step: 'read_offer' | 'read_grant' | 'read_acceptance',
): string {
  return picoCompanionEnrolmentCodeSteps[step].prefix;
}
