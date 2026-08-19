/**
 * Typed refusals for gesture data (mirrors `@pico/appearance`'s errors).
 *
 * A pose arrives from another device as much as an appearance does, so it is
 * validated the same way: closed shapes, integers only, nothing silently
 * clamped. A clamped pose is the dangerous case — it would keep working while
 * quietly meaning something other than what was sent.
 */
export const picoGestureErrorCodes = [
  'invalid_type',
  'invalid_shape',
  'invalid_integer',
  'value_out_of_range',
  'unsupported_pose_version',
] as const;

export type PicoGestureErrorCode = typeof picoGestureErrorCodes[number];

export class PicoGestureError extends Error {
  readonly code: PicoGestureErrorCode;

  constructor(code: PicoGestureErrorCode, message: string) {
    super(message);
    this.name = 'PicoGestureError';
    this.code = code;
  }
}
