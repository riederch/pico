import {
  assertPicoSupplierCondition,
  picoSupplierConditionCarriesContent,
  type PicoSupplierCondition,
} from './supplier-condition.js';

/**
 * ADR 0137 IN4 - what a union over several instances owes.
 *
 * Two obligations, and both exist because merging is what a union looks like
 * from the inside.
 *
 * **A union names who was silent.** The camper is off-grid in a garage; the
 * holiday house is reachable and empty. "No motion anywhere" over two of three
 * houses is a true sentence about the wrong subject, and it reads as safety.
 * Absence of evidence and evidence of absence are different answers, and a
 * supplier layer is exactly where they get quietly merged.
 *
 * **Disagreement is reported, never resolved.** Where two instances answer the
 * same subject differently, both come back with their identifiers and pins.
 * Under ADR 0129 neither was `known` to begin with, so a conflict lowers
 * certainty rather than being settled by an order nobody chose. There is no
 * precedence to configure - not "none by default", but none at all, because a
 * silent winner is a decision taken by a supplier.
 */
export interface PicoSupplierValue {
  /** What this value is about. Two instances answering the same subject can disagree. */
  subject: string;
  value: string | number | boolean;
}

export interface PicoSupplierInstanceAnswer {
  identifier: string;
  condition: PicoSupplierCondition;
  /**
   * ADR 0137 IN1. What the answer was read at - a commit for a library,
   * `null` for a bridge, which has no pin and says so rather than inventing
   * one.
   */
  pin: string | null;
  values: readonly PicoSupplierValue[];
}

export interface PicoSupplierAgreement {
  subject: string;
  value: string | number | boolean;
  /** Every instance that gave this value, so agreement is attributable too. */
  from: readonly { identifier: string; pin: string | null }[];
}

export interface PicoSupplierDisagreement {
  subject: string;
  /** Both answers, in the order the instances were asked. No winner. */
  answers: readonly {
    identifier: string;
    pin: string | null;
    value: string | number | boolean;
  }[];
}

export interface PicoSupplierUnion {
  agreed: readonly PicoSupplierAgreement[];
  disagreed: readonly PicoSupplierDisagreement[];
  /** Instances that carried no content, with the condition that says why. */
  silent: readonly { identifier: string; condition: PicoSupplierCondition }[];
  /** True when any instance was silent. A caller cannot miss this by omission. */
  incomplete: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * ADR 0137 IN4. Assembles a union that cannot hide its own gaps.
 *
 * `incomplete` is derived here rather than left to a surface to notice,
 * because the failure this gate exists for is a caller that renders the values
 * and forgets the silence.
 */
export function unionPicoSupplierAnswers(
  answers: readonly PicoSupplierInstanceAnswer[],
): PicoSupplierUnion {
  if (!Array.isArray(answers)) {
    throw new Error('invalid_pico_supplier_answers');
  }

  const seenIdentifiers = new Set<string>();
  const silent: Array<{ identifier: string; condition: PicoSupplierCondition }> = [];
  const bySubject = new Map<string, Array<{
    identifier: string;
    pin: string | null;
    value: string | number | boolean;
  }>>();

  for (const entry of answers) {
    const answer = isRecord(entry) ? entry : undefined;
    if (answer === undefined || typeof answer.identifier !== 'string') {
      throw new Error('invalid_pico_supplier_answer');
    }
    if (seenIdentifiers.has(answer.identifier)) {
      // Two answers from one instance is a caller bug, and unioning them would
      // turn it into a disagreement the instance never had.
      throw new Error('duplicate_pico_supplier_answer');
    }
    seenIdentifiers.add(answer.identifier);

    const condition = assertPicoSupplierCondition(answer.condition);
    if (answer.pin !== null && typeof answer.pin !== 'string') {
      throw new Error('invalid_pico_supplier_pin');
    }
    const pin = answer.pin as string | null;

    if (!picoSupplierConditionCarriesContent(condition)) {
      silent.push({ identifier: answer.identifier, condition });
      continue;
    }
    if (!Array.isArray(answer.values)) {
      throw new Error('invalid_pico_supplier_answer');
    }
    for (const value of answer.values as unknown[]) {
      const held = isRecord(value) ? value : undefined;
      if (held === undefined
        || typeof held.subject !== 'string'
        || (typeof held.value !== 'string'
          && typeof held.value !== 'number'
          && typeof held.value !== 'boolean')) {
        throw new Error('invalid_pico_supplier_value');
      }
      const bucket = bySubject.get(held.subject) ?? [];
      bucket.push({
        identifier: answer.identifier,
        pin,
        value: held.value,
      });
      bySubject.set(held.subject, bucket);
    }
  }

  const agreed: PicoSupplierAgreement[] = [];
  const disagreed: PicoSupplierDisagreement[] = [];
  for (const [subject, bucket] of bySubject) {
    const distinct = new Set(bucket.map((entry) => JSON.stringify(entry.value)));
    if (distinct.size === 1) {
      agreed.push(Object.freeze({
        subject,
        value: bucket[0]!.value,
        from: Object.freeze(bucket.map((entry) => Object.freeze({
          identifier: entry.identifier,
          pin: entry.pin,
        }))),
      }));
      continue;
    }
    disagreed.push(Object.freeze({
      subject,
      answers: Object.freeze(bucket.map((entry) => Object.freeze({ ...entry }))),
    }));
  }

  return Object.freeze({
    agreed: Object.freeze(agreed),
    disagreed: Object.freeze(disagreed),
    silent: Object.freeze(silent.map((entry) => Object.freeze(entry))),
    incomplete: silent.length > 0,
  });
}
