import { PicoAppearanceError } from './appearance-errors.js';

/**
 * Shared strict-validation helpers. External appearance data is untrusted:
 * shapes are closed, prototypes must be plain, every number is an integer and
 * nothing is silently clamped, defaulted or coerced.
 */
export function requirePlainObject(
  value: unknown,
  label: string,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PicoAppearanceError('invalid_type', `${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new PicoAppearanceError('invalid_shape', `${label} must be a plain object`);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      throw new PicoAppearanceError('invalid_shape', `${label} has unknown key ${JSON.stringify(key)}`);
    }
  }
  for (const key of allowedKeys) {
    if (!(key in record)) {
      throw new PicoAppearanceError('invalid_shape', `${label} is missing key ${JSON.stringify(key)}`);
    }
  }
  return record;
}

export function requireInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new PicoAppearanceError('invalid_integer', `${label} must be an integer`);
  }
  if (value < minimum || value > maximum) {
    throw new PicoAppearanceError('value_out_of_range', `${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

/**
 * Befund B146 (2026-09-11). Diese Funktion stand hier geschrieben, nannte in
 * ihrem eigenen Typ die drei Codes, fuer die es sie gibt - und **nichts im
 * ganzen Baum rief sie auf**, waehrend dieselbe Pruefung fuenfmal von Hand
 * danebenstand, in zwei Dateien, die beide schon aus dieser importieren.
 *
 * Vier der fuenf waren Zeile fuer Zeile das hier. Die fuenfte liess die
 * Ganzzahlpruefung weg, also bekam `1.5` dort `unsupported_profile_version`
 * statt `invalid_integer` - dieselbe Annahme, ein anderer Name, was der
 * Unterschied zwischen "falsche Version" und "gar keine Zahl" ist.
 *
 * Und keine der fuenf hielt ein Test: die Pflanzung „jede Versionsnummer gilt"
 * liess alle 122 Pruefungen des Pakets gruen. Gehalten war der Byteweg im
 * Kodierer, wo eine Zahl aus einem `Uint8Array` kommt und gar keine andere
 * sein kann - nicht der Feldweg, fuer den der Absatz oben den strengen Stil
 * begruendet.
 */
export function requireExactInteger<T extends number>(
  value: unknown,
  label: string,
  expected: T,
  code: 'unsupported_profile_version' | 'unsupported_envelope_version' | 'unsupported_compatibility_core_version',
): T {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new PicoAppearanceError('invalid_integer', `${label} must be an integer`);
  }
  if (value !== expected) {
    throw new PicoAppearanceError(code, `${label} must be exactly ${expected}`);
  }
  return expected;
}

export function requireString<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
): T {
  if (typeof value !== 'string') {
    throw new PicoAppearanceError('invalid_type', `${label} must be a string`);
  }
  if (!(allowed as readonly string[]).includes(value)) {
    throw new PicoAppearanceError('invalid_shape', `${label} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

export function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new PicoAppearanceError('invalid_type', `${label} must be an array`);
  }
  return value;
}

export function requireUint8Array(value: unknown, label: string): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new PicoAppearanceError('invalid_type', `${label} must be a Uint8Array`);
  }
  return value;
}

/** Lexicographic byte comparison for canonical, locale-free ordering. */
export function compareBytes(left: Uint8Array, right: Uint8Array): number {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return left.length - right.length;
}

/** Code-point comparison for canonical ASCII ordering, independent of locale. */
export function compareAscii(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
