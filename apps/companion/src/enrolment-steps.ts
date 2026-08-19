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

/**
 * What a surface has to be able to do for the exchange to happen at all.
 *
 * Three verbs, because the ceremony needs exactly three things from a
 * platform: put a code in front of a person, take one back, and say where in
 * the walk they are. How each is done - a canvas and a camera on the desktop,
 * whatever Android does - is the platform's business and none of the
 * ceremony's.
 *
 * `showing` on a read is not decoration. On the camera path the other device
 * is reading that code at that moment, and on the typed path the person still
 * needs it in front of them; a surface that cleared the screen to ask for the
 * answer would break a working ceremony in a way no test of either half would
 * catch.
 */
export interface PicoCompanionEnrolmentSurface {
  showCode(
    step: 'show_offer' | 'show_grant' | 'show_acceptance',
    code: string,
  ): Promise<void>;
  readCode(
    step: 'read_offer' | 'read_grant' | 'read_acceptance',
    showing?: string,
  ): Promise<string>;
  announce(step: 'waiting' | 'joined' | 'kept'): Promise<void>;
}

/**
 * The sponsor's half of the exchange, as the callback the ceremony asks for.
 *
 * The ceremony already owns when this runs - it hands over a grant the
 * moment one exists and waits for the answer - so all that is stated here is
 * the pairing: the grant is shown, and the acceptance is read while it stays
 * shown.
 */
export function picoCompanionSponsorExchange(
  surface: PicoCompanionEnrolmentSurface,
): (grantCode: string) => Promise<string> {
  return async (grantCode: string) => {
    await surface.showCode('show_grant', grantCode);
    return await surface.readCode('read_acceptance', grantCode);
  };
}

/**
 * The asking device's half, which is a sequence rather than a callback.
 *
 * Both devices that ask walk it: one that has nothing and wants in, and one
 * whose year ran out and wants to keep working. What differs is what `offer`
 * and `accept` do - make new keys or show the ones already held - and the
 * sentence at the end, which is why those are arguments and the walk is not.
 *
 * **The acceptance is shown before `confirm` is awaited**, and that ordering
 * is the whole reason this is one function instead of two copies. The other
 * device cannot finish without reading the acceptance; a client that waited
 * first would leave two devices waiting for each other, each convinced it is
 * the one being kept waiting, with no error raised anywhere.
 *
 * The waiting line is started but not awaited before `confirm`, so a slow
 * surface delays nothing - and it is awaited afterwards, so a failing one is
 * still heard.
 */
export async function runPicoCompanionAskingDeviceExchange<
  Offered extends { offerCode: string },
  Accepted extends { acceptanceCode: string; confirm: () => Promise<unknown> },
>(input: {
  surface: PicoCompanionEnrolmentSurface;
  offer: () => Promise<Offered>;
  /**
   * Handed what the offer produced, because a joining device's acceptance
   * needs the keys its own offer just made. Passing them through the walk
   * keeps the caller from holding a mutable variable across three awaits to
   * say something the walk already knew.
   */
  accept: (grantCode: string, offered: Offered) => Promise<Accepted>;
  outcome: 'joined' | 'kept';
}): Promise<Accepted> {
  const offered = await input.offer();
  await input.surface.showCode('show_offer', offered.offerCode);
  const grantCode = await input.surface.readCode('read_grant', offered.offerCode);

  const accepted = await input.accept(grantCode, offered);
  await input.surface.showCode('show_acceptance', accepted.acceptanceCode);

  const waiting = input.surface.announce('waiting');
  try {
    await accepted.confirm();
  } finally {
    await waiting;
  }
  await input.surface.announce(input.outcome);
  return accepted;
}
