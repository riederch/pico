/**
 * Stable typed error codes for the appearance contracts (ADR 0125).
 *
 * Error messages must stay structural: offsets, expected values, field names.
 * They never carry foreign payload bytes or custom-asset content, because
 * appearance documents are untrusted input and error channels end up in logs.
 */
export const picoAppearanceErrorCodes = [
  'invalid_type',
  'invalid_shape',
  'invalid_integer',
  'value_out_of_range',
  'unsupported_profile_version',
  'unsupported_envelope_version',
  'unsupported_compatibility_core_version',
  'unsupported_critical_record',
  'invalid_magic',
  'invalid_length',
  'size_limit_exceeded',
  'duplicate_required_record',
  'missing_required_record',
  'invalid_record_flags',
  'invalid_record_ordering',
  'invalid_namespace',
  'invalid_custom_asset_reference',
  'compatibility_core_mismatch',
  'unknown_flags',
  'head_length_mismatch',
  'invalid_text_format',
] as const;

export type PicoAppearanceErrorCode = typeof picoAppearanceErrorCodes[number];

export class PicoAppearanceError extends Error {
  readonly code: PicoAppearanceErrorCode;

  constructor(code: PicoAppearanceErrorCode, message: string) {
    super(message);
    this.name = 'PicoAppearanceError';
    this.code = code;
  }
}
