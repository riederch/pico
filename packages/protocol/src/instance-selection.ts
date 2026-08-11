import { isPicoConfidenceLevel, type PicoConfidenceLevel } from './confidence.js';
import { picoSupplierIdentifierPattern } from './supplier.js';

/**
 * ADR 0137 IN5 - Pico may propose an instance and may never select one.
 *
 * With three Home Assistants attached, an effect that did not carry its target
 * could switch on a light in a building the person is not standing in. So an
 * effect names its instance. The question this file answers is the next one:
 * **who is allowed to have named it.**
 *
 * Pico usually knows. A derived location will pick the right house almost
 * every time, and "almost" is exactly the problem: under ADR 0129 a derivation
 * carries a confidence level and never a person's confirmation, and ADR 0137
 * refuses to let an unconfirmed guess choose the building that gets acted on.
 * The failure is not a wrong answer on a screen - it is a light going on in
 * someone else's house.
 *
 * **Suggesting and selecting are therefore two types, not one value with a
 * flag.** A `PicoInstanceProposal` is what a derivation produces and it has no
 * route into an effect: nothing accepts one, and the only function that turns
 * one into a selection needs a person's confirmation naming the same instance.
 * A caller holding a guess has nowhere to put it - the construction ADR 0117
 * X1 uses for `picoReaderCapabilities`, ADR 0136 BR3 for an origin class,
 * ADR 0136 BR4 for `confirmedByPerson`, ADR 0139 AC2 for an argument's origin
 * and ADR 0136 BR6 for a pin's content coverage.
 *
 * **Two things may select, and only two.** A person, explicitly. Or the
 * absence of a choice: where exactly one attached instance covers the subject,
 * there is nothing to infer and nothing to get wrong, which is what keeps a
 * one-house household from being asked the same question forever. A derived
 * location is not on that list and cannot be added to it by configuration,
 * because it is not a value this module reads.
 */
export const picoInstanceSelectors = [
  /** A person named it. */
  'person',
  /**
   * Exactly one attached instance covers the subject, so there was no choice
   * to make. ADR 0137 IN2's declared coverage decides this, not proximity and
   * not a guess.
   */
  'sole_candidate',
] as const;

export type PicoInstanceSelector = typeof picoInstanceSelectors[number];

/**
 * What a derivation produces. Note what is not here: no `selector`, no
 * `confirmedByPerson: true`, and no method. This is a sentence Pico may show
 * a person, not a decision.
 */
export interface PicoInstanceProposal {
  instance: string;
  /** ADR 0129. A derivation is a guess with a stated certainty. */
  confidence: PicoConfidenceLevel;
  /** Only ever `false`, for ADR 0136 BR4's reason. */
  confirmedByPerson: false;
}

/** What an effect may target. Reachable two ways, and neither is a guess. */
export interface PicoInstanceSelection {
  instance: string;
  selectedBy: PicoInstanceSelector;
}

function assertInstanceToken(value: unknown): string {
  if (typeof value !== 'string' || !picoSupplierIdentifierPattern.test(value)) {
    // ADR 0137 IN1: a person-chosen token, never a path and never an address.
    throw new Error('invalid_pico_instance_identifier');
  }
  return value;
}

/**
 * ADR 0137 IN5. What a derived location may produce, and the ceiling on it.
 *
 * There is no parameter for confirmation and no parameter for a selector: the
 * highest thing a derivation can build is a proposal, whatever it believes
 * about itself. Confidence is required rather than defaulted, in ADR 0136
 * BR4's idiom - a guess without a stated certainty is not a cautious guess,
 * it is one nobody measured.
 */
export function proposePicoInstance(input: {
  instance: string;
  confidence: PicoConfidenceLevel;
}): PicoInstanceProposal {
  if (!isPicoConfidenceLevel(input.confidence)) {
    throw new Error('pico_instance_proposal_requires_confidence');
  }
  return Object.freeze({
    instance: assertInstanceToken(input.instance),
    confidence: input.confidence,
    confirmedByPerson: false as const,
  });
}

/**
 * ADR 0137 IN5. A person names the instance.
 *
 * The plain case, and the one a surface uses when it asked and was answered.
 */
export function selectPicoInstanceByPerson(instance: string): PicoInstanceSelection {
  return Object.freeze({
    instance: assertInstanceToken(instance),
    selectedBy: 'person' as const,
  });
}

/**
 * ADR 0137 IN5 with ADR 0137 IN2. The only instance that covers the subject.
 *
 * Takes the candidates rather than a conclusion, so "there was exactly one" is
 * established here instead of being asserted by the caller. Zero candidates is
 * refused under its own error rather than answered `null`: an effect with no
 * instance to target is not an effect with a default one, and ADR 0140 RL3
 * already has `instance_not_attached` for what that means downstream. Two or
 * more is refused because that is precisely the case a person has to decide.
 */
export function selectPicoInstanceAsSoleCandidate(
  candidates: readonly string[],
): PicoInstanceSelection {
  if (candidates.length === 0) {
    throw new Error('pico_instance_has_no_candidate');
  }
  if (candidates.length > 1) {
    // Not an error about the data - a question addressed to a person.
    throw new Error('pico_instance_needs_a_person');
  }
  return Object.freeze({
    instance: assertInstanceToken(candidates[0]!),
    selectedBy: 'sole_candidate' as const,
  });
}

/**
 * ADR 0137 IN5. The one route from a proposal to a selection: a person
 * confirming it.
 *
 * **The confirmation names the instance**, rather than approving "the
 * proposal" as an opaque thing. A person confirms *Ferienhaus*; if what they
 * are confirming is no longer what was proposed - the derivation moved between
 * the question and the answer - the two disagree and this refuses. That is
 * ADR 0141 RN3's rule seen from the other end: what is acted on is what was
 * shown, and the only way to be sure is to compare them rather than to trust
 * the ordering.
 *
 * What comes out carries `selectedBy: 'person'` and no memory of having been a
 * guess, deliberately. Once a person has said *that house*, the confidence
 * that produced the suggestion has no further authority - keeping it would
 * invite a later caller to discount a person's answer because the machine had
 * been unsure.
 */
export function confirmPicoInstanceProposal(input: {
  proposal: PicoInstanceProposal;
  confirmedInstance: string;
}): PicoInstanceSelection {
  const confirmed = assertInstanceToken(input.confirmedInstance);
  if (input.proposal.confirmedByPerson !== false) {
    // A proposal claiming confirmation is the attack, not a shape failure.
    throw new Error('pico_instance_proposal_cannot_claim_confirmation');
  }
  if (input.proposal.instance !== confirmed) {
    throw new Error('pico_instance_confirmation_mismatch');
  }
  return Object.freeze({
    instance: confirmed,
    selectedBy: 'person' as const,
  });
}

/**
 * The token a rule and an approval statement read (ADR 0140 RL1, ADR 0141
 * RN3). `null` for an effect whose slot has no instance at all.
 *
 * This is the only way to get a bare identifier out, which is what makes the
 * types above load-bearing rather than decorative: an instance string that
 * reaches a decision came through a selection, and a proposal is not one.
 *
 * **It checks at runtime as well as in the type**, and that is not belt and
 * braces. A type is erased before anything runs, so a `PicoInstanceSelection`
 * parameter refuses a proposal at review time and refuses nothing at all in
 * the built product - a cast, a JavaScript caller or a value read back from
 * storage would walk straight past it. Both halves are how ADR 0136 BR4's
 * `confirmedByPerson` is built, and for the same reason.
 *
 * A proposal arriving here gets its own error rather than a shape failure,
 * because "a guess reached the decision path" is a different fact from "this
 * object is malformed", and only one of them means a light might go on in the
 * wrong house.
 */
export function picoInstanceToken(
  selection: PicoInstanceSelection | null,
): string | null {
  if (selection === null) {
    return null;
  }
  if (typeof selection !== 'object' || Array.isArray(selection)) {
    throw new Error('invalid_pico_instance_selection');
  }
  const record = selection as unknown as Record<string, unknown>;
  if ('confidence' in record || 'confirmedByPerson' in record) {
    throw new Error('pico_instance_proposal_is_not_a_selection');
  }
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== 'instance' || keys[1] !== 'selectedBy') {
    throw new Error('invalid_pico_instance_selection');
  }
  if (typeof record.selectedBy !== 'string'
    || !(picoInstanceSelectors as readonly string[]).includes(record.selectedBy)) {
    // A selector the list does not have is a route somebody added without
    // deciding it here, which is exactly what the closed list is for.
    throw new Error('pico_instance_selector_not_listed');
  }
  return assertInstanceToken(record.instance);
}
