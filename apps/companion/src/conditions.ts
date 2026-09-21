import type { PicoStoragePressureState } from '@pico/protocol';
/**
 * What is true between notifications, said in words a person can act on.
 *
 * ADR 0118 O4 calls these conditions: they are ambient rather than events, and
 * the rule that makes them worth having is that **"nothing is waiting" and
 * "nobody looked" are different claims**. A surface that shows a quiet screen
 * when the Home never answered is telling the second while looking like the
 * first.
 *
 * **This lived in the Electron shell until 2026-08-21**, and ADR 0131 A7 said
 * the opposite - that the condition and its wording sit in the shell-free core,
 * so a second client inherits them rather than reinventing them. They did not.
 * `picoCompanionConditionsFor` and its remedy sentences were in
 * `apps/companion-shell/src/contract.ts`, and the short labels were in
 * `renderer.ts` - in the *window*, which under ADR 0113 C2 decides no
 * rendering at all. An Android surface would have written both again, and two
 * clients telling one person two different things about the same silence is
 * the defect this family keeps restating.
 *
 * So the words are here, where both a desktop and a phone can read them, and
 * they cross to the window already rendered.
 */

export const picoCompanionConditionKinds = [
  'no_network',
  'home_unreachable',
  'no_model',
  'storage_reserved',
  'storage_exhausted',
] as const;

export type PicoCompanionConditionKind = typeof picoCompanionConditionKinds[number];

export interface PicoCompanionCondition {
  kind: PicoCompanionConditionKind;
  /** The name of the state, short enough to sit beside its remedy. */
  label: string;
  /** What the person can do about it. Short, and never a mystery refusal. */
  remedy: string;
}

/**
 * One entry per kind, so a kind cannot exist without something to say about
 * it. The label names the state; the remedy says what still works, because a
 * refusal must not be an inventory (ADR 0077 C4) and a person reading a
 * condition wants to know what they have left rather than what they have lost.
 */
const conditionWording: Record<PicoCompanionConditionKind, { label: string; remedy: string }> = {
  no_network: {
    label: 'No network',
    remedy: 'Already approved sends wait for a route. Nothing else is affected.',
  },
  home_unreachable: {
    label: 'Home not reached',
    remedy: 'Your Home is not answering, so this is not a report that nothing is waiting. '
      + 'Recall, entry and capture continue here.',
  },
  no_model: {
    label: 'No model',
    remedy: 'Summaries and suggestions wait. Capture, entry, recall and decide do not.',
  },
  storage_reserved: {
    label: 'Storage is running low',
    remedy: 'Export, migrate or shred a domain to make room, or provision more space.',
  },
  storage_exhausted: {
    label: 'Storage is full',
    remedy: 'Free space now. Removing data still works; adding it does not.',
  },
};

/**
 * Paare, die nicht nebeneinander stehen duerfen, weil das zweite das erste
 * nur noch einmal sagt.
 *
 * ADR 0077 C4: eine Absage darf keine Inventur sein. Zwei Zeilen, die
 * dieselbe Tatsache melden, lassen die Person herausfinden, welche davon
 * gilt - und genau das soll eine Bedingung ihr abnehmen.
 *
 * Die Regel stand bisher nur **hier**, in den `if`-Bedingungen von
 * `picoCompanionConditionsFor` (Befund B240). Die Worte sind 2026-08-21 in
 * den shell-freien Kern gezogen, damit ein zweiter Client sie erbt statt sie
 * neu zu erfinden (ADR 0131 A7) - die Regel darueber, welche Kombinationen
 * ueberhaupt zusammen wahr sein koennen, ist mitgegangen? Nein, sie blieb im
 * Erzeuger. Ein Client, der seine Bedingungen selbst zusammenstellt, erbte
 * die Woerter und nicht den Verstand. Jetzt steht sie neben ihnen, und der
 * Vertrag an der Fenstergrenze weist beide Paare ab statt nur eines.
 *
 * Wortgleich in `apps/companion-shell/src/contract.ts` restated und dort
 * begruendet; `check-constant-copies.mjs` haelt beide Fassungen Zeichen fuer
 * Zeichen aneinander, `condition-vocabulary.test.ts` Eintrag fuer Eintrag.
 */
export const picoCompanionExclusiveConditions = [
  // ADR 0119 Q5: reserved and exhausted are two rungs of one ladder.
  ['storage_reserved', 'storage_exhausted'],
  // ADR 0131 A7: with no network the unreachable Home is the link itself.
  ['no_network', 'home_unreachable'],
] as const satisfies readonly (readonly [PicoCompanionConditionKind, PicoCompanionConditionKind])[];

export function picoCompanionCondition(kind: PicoCompanionConditionKind): PicoCompanionCondition {
  return { kind, ...conditionWording[kind] };
}

export function picoCompanionConditionsFor(input: {
  online?: boolean;
  homeReachable?: boolean;
  modelReachable?: boolean;
  storage?: PicoStoragePressureState;
}): readonly PicoCompanionCondition[] {
  const conditions: PicoCompanionCondition[] = [];
  if (input.online === false) {
    conditions.push(picoCompanionCondition('no_network'));
  }
  /**
   * ADR 0131 A7. Only when the link itself is not the explanation: with no
   * network this is the same fact told twice, and a refusal must not be an
   * inventory (ADR 0077 C4).
   *
   * This is the condition a phone lives in. ADR 0107 carries envelopes to the
   * person's own Home directly, so away from the home network there is no Home
   * to reach - and the rule this ADR family keeps restating is that an
   * unreachable Home must never look like a quiet one.
   */
  if (input.homeReachable === false && input.online !== false) {
    conditions.push(picoCompanionCondition('home_unreachable'));
  }
  if (input.modelReachable === false) {
    conditions.push(picoCompanionCondition('no_model'));
  }
  if (input.storage === 'reserved') {
    conditions.push(picoCompanionCondition('storage_reserved'));
  } else if (input.storage === 'exhausted') {
    conditions.push(picoCompanionCondition('storage_exhausted'));
  }
  return Object.freeze(conditions);
}
