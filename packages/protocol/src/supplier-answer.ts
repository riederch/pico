import { isPicoConfidenceLevel, type PicoConfidenceLevel } from './confidence.js';

/**
 * ADR 0136 BR4 - asked, measured and certain are three facts, not one.
 *
 * Issue #4 states two of them in its own words - "Cache-Alter und
 * AIS-Datenalter nicht verwechseln" - and it is right that this is where the
 * mistake happens. A six-hour-old position presented as a live one is not a
 * stale answer, it is a false one.
 *
 * So the two ages are two functions with two names, and confusing them takes
 * an edit rather than an oversight. `askedAt` is Pico's own bookkeeping; the
 * measurement belongs to the content and survives caching.
 *
 * **A library carries a pin where a bridge carries an instant**, which is why
 * `measured` is a tagged union rather than a nullable timestamp: a commit is
 * not a time and pretending otherwise would invite a comparison that means
 * nothing.
 *
 * **Certainty is the third fact and cannot be omitted.** A value carries
 * Pico's own origin once derived and may still be a guess (ADR 0129), so it is
 * constructed with its confidence or not at all.
 *
 * **And a supplier cannot claim confirmation.** `confirmedByPerson` is typed
 * as a field that can only be `false` - the construction ADR 0117 X1 uses for
 * `picoReaderCapabilities`, where a boolean that *could* be true invites a
 * call site to set it and a type that cannot express the permission cannot
 * leak it by configuration. Confirmation is a person's act on a different
 * axis; nothing arriving from outside gets to perform it.
 */
export const picoSupplierAnswerSchema = 'pico.supplier.answer.v1' as const;

export type PicoSupplierMeasurement =
  /** A bridge: when the outside system measured. */
  | { kind: 'instant'; at: string }
  /** A library: the commit or version the answer was read at (ADR 0137 IN1). */
  | { kind: 'pin'; value: string };

export interface PicoSupplierAnswer {
  schema: typeof picoSupplierAnswerSchema;
  /** Pico's own bookkeeping: when it asked. */
  askedAt: string;
  /** The content's own fact, which survives caching. */
  measured: PicoSupplierMeasurement;
  confidence: PicoConfidenceLevel;
  /** Only ever `false`. See the note above. */
  confirmedByPerson: false;
  value: string | number | boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(record: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    throw new Error('invalid_pico_supplier_answer_shape');
  }
}

function assertInstant(value: unknown, error: string): string {
  if (typeof value !== 'string'
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value) {
    throw new Error(error);
  }
  return value;
}

function parseMeasurement(value: unknown): PicoSupplierMeasurement {
  const record = isRecord(value) ? value : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_supplier_measurement');
  }
  if (record.kind === 'instant') {
    assertExactKeys(record, ['kind', 'at']);
    return Object.freeze({
      kind: 'instant' as const,
      at: assertInstant(record.at, 'invalid_pico_supplier_measurement'),
    });
  }
  if (record.kind === 'pin') {
    assertExactKeys(record, ['kind', 'value']);
    if (typeof record.value !== 'string' || record.value.trim() === '') {
      throw new Error('invalid_pico_supplier_measurement');
    }
    return Object.freeze({ kind: 'pin' as const, value: record.value });
  }
  throw new Error('invalid_pico_supplier_measurement');
}

/**
 * ADR 0136 BR4. There is no parameter for `confirmedByPerson`: a supplier has
 * no way to say it, which is stronger than refusing it when it says so.
 */
export function buildPicoSupplierAnswer(input: {
  askedAt: string;
  measured: PicoSupplierMeasurement;
  confidence: PicoConfidenceLevel;
  value: string | number | boolean;
}): PicoSupplierAnswer {
  const record = isRecord(input) ? input : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_supplier_answer_shape');
  }
  assertExactKeys(record, ['askedAt', 'measured', 'confidence', 'value']);
  if (!isPicoConfidenceLevel(record.confidence)) {
    // Its own error: a value without certainty is not a value with a default,
    // it is one nobody measured.
    throw new Error('pico_supplier_answer_requires_confidence');
  }
  if (typeof record.value !== 'string'
    && typeof record.value !== 'number'
    && typeof record.value !== 'boolean') {
    throw new Error('invalid_pico_supplier_answer_value');
  }
  return Object.freeze({
    schema: picoSupplierAnswerSchema,
    askedAt: assertInstant(record.askedAt, 'invalid_pico_supplier_asked_at'),
    measured: parseMeasurement(record.measured),
    confidence: record.confidence,
    confirmedByPerson: false as const,
    value: record.value,
  });
}

export function parsePicoSupplierAnswer(value: unknown): PicoSupplierAnswer {
  const record = isRecord(value) ? value : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_supplier_answer_shape');
  }
  assertExactKeys(
    record,
    ['schema', 'askedAt', 'measured', 'confidence', 'confirmedByPerson', 'value'],
  );
  if (record.schema !== picoSupplierAnswerSchema) {
    throw new Error('invalid_pico_supplier_answer_schema');
  }
  if (record.confirmedByPerson !== false) {
    // Its own error, because a supplier claiming a person's confirmation is
    // the attack rather than a shape failure.
    throw new Error('pico_supplier_answer_cannot_claim_confirmation');
  }
  if (!isPicoConfidenceLevel(record.confidence)) {
    throw new Error('pico_supplier_answer_requires_confidence');
  }
  return buildPicoSupplierAnswer({
    askedAt: record.askedAt as string,
    measured: parseMeasurement(record.measured),
    confidence: record.confidence,
    value: record.value as string | number | boolean,
  });
}

/**
 * ADR 0136 BR4. How long ago Pico asked. Pico's own bookkeeping, and never an
 * answer to "how old is this information".
 */
export function picoSupplierCacheAgeMs(
  answer: PicoSupplierAnswer,
  now: string,
): number {
  return Date.parse(assertInstant(now, 'invalid_pico_supplier_now'))
    - Date.parse(answer.askedAt);
}

/**
 * ADR 0136 BR4. How old the information is. `null` for a library, because a
 * commit is not a time - and answering `0` there would be the confusion this
 * whole file exists to prevent, dressed as a convenience.
 */
export function picoSupplierContentAgeMs(
  answer: PicoSupplierAnswer,
  now: string,
): number | null {
  if (answer.measured.kind !== 'instant') {
    return null;
  }
  return Date.parse(assertInstant(now, 'invalid_pico_supplier_now'))
    - Date.parse(answer.measured.at);
}
