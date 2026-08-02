import { PicoAppearanceError } from './appearance-errors.js';
import {
  compareAscii,
  compareBytes,
  requirePlainObject,
  requireUint8Array,
} from './validation-primitives.js';

/**
 * Namespaced extension of an appearance document (ADR 0125). The payload is
 * canonically opaque bytes; its own semantics need their own version. An
 * unknown optional extension is ignorable, an unknown critical extension
 * must be understood before a full rendering may be claimed, and no
 * extension may reinterpret core fields or replace the mandatory
 * compatibility core.
 */
export interface PicoAppearanceExtensionV1 {
  readonly namespace: string;
  readonly name: string;
  readonly version: number;
  readonly critical: boolean;
  readonly payload: Uint8Array;
}

/** Allowed pattern for extension namespaces and names: lowercase ASCII. */
export const appearanceExtensionNamePattern = /^[a-z0-9][a-z0-9.-]{0,62}$/;

/** Maximum opaque payload bytes of a single extension in envelope V1. */
export const appearanceExtensionV1MaximumPayloadByteLength = 1024;

export function validateAppearanceExtensionV1(input: unknown): PicoAppearanceExtensionV1 {
  const record = requirePlainObject(input, 'extension', ['namespace', 'name', 'version', 'critical', 'payload']);
  if (typeof record.namespace !== 'string' || !appearanceExtensionNamePattern.test(record.namespace)) {
    throw new PicoAppearanceError('invalid_namespace', 'extension.namespace must match [a-z0-9][a-z0-9.-]{0,62}');
  }
  if (typeof record.name !== 'string' || !appearanceExtensionNamePattern.test(record.name)) {
    throw new PicoAppearanceError('invalid_namespace', 'extension.name must match [a-z0-9][a-z0-9.-]{0,62}');
  }
  if (typeof record.version !== 'number' || !Number.isInteger(record.version)) {
    throw new PicoAppearanceError('invalid_integer', 'extension.version must be an integer');
  }
  if (record.version < 0 || record.version > 0xffff) {
    throw new PicoAppearanceError('value_out_of_range', 'extension.version must fit uint16');
  }
  if (typeof record.critical !== 'boolean') {
    throw new PicoAppearanceError('invalid_type', 'extension.critical must be a boolean');
  }
  const payload = requireUint8Array(record.payload, 'extension.payload');
  if (payload.length > appearanceExtensionV1MaximumPayloadByteLength) {
    throw new PicoAppearanceError('size_limit_exceeded', `extension.payload must not exceed ${appearanceExtensionV1MaximumPayloadByteLength} bytes`);
  }
  return Object.freeze({
    namespace: record.namespace,
    name: record.name,
    version: record.version,
    critical: record.critical,
    payload: Uint8Array.from(payload),
  });
}

/**
 * Canonical extension ordering: namespace, then name, then version, each in
 * plain ASCII/numeric order, with the payload bytes as final tie break so a
 * canonical encoder is deterministic even for duplicate names.
 */
export function compareAppearanceExtensionsV1(
  left: PicoAppearanceExtensionV1,
  right: PicoAppearanceExtensionV1,
): number {
  const byNamespace = compareAscii(left.namespace, right.namespace);
  if (byNamespace !== 0) {
    return byNamespace;
  }
  const byName = compareAscii(left.name, right.name);
  if (byName !== 0) {
    return byName;
  }
  if (left.version !== right.version) {
    return left.version - right.version;
  }
  return compareBytes(left.payload, right.payload);
}
