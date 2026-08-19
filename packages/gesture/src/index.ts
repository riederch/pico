/**
 * @pico/gesture — what PICO is doing, beside what PICO looks like.
 *
 * `@pico/appearance` carries identity: kept, versioned, part of who a PICO is.
 * A gesture is the opposite in every way that matters — momentary, discarded,
 * and never allowed to change identity. They are separate objects for that
 * reason, and a pose that could recolour a shell would be an appearance edit
 * wearing a pose's clothes.
 *
 * Honest boundary: this is a contract package. Nothing here animates, tweens,
 * renders, transports or stores a pose, and nothing here grants any Character
 * approval. The corridor it publishes is a stated design corridor checked by
 * eye against the authored core, not a derivation from the geometry — see
 * `gesturePoseV1Limits` for why that distinction is not a formality.
 */
export {
  picoGestureErrorCodes,
  PicoGestureError,
  type PicoGestureErrorCode,
} from './gesture-errors.js';

export {
  gesturePoseV1Limits,
  gesturePoseV1Rest,
  type PicoGestureAngleRange,
  type PicoGestureArmV1,
  type PicoGestureExpressionV1,
  type PicoGesturePoseV1,
  type PicoGestureRotationV1,
} from './gesture-pose-v1.js';

export { validateGesturePoseV1 } from './gesture-pose-v1-validation.js';

export {
  gestureDigitMountsV1,
  gesturePoseV1MountNames,
  projectGesturePoseV1,
  type PicoGestureMountRotationV1,
  type PicoGestureProjectionV1,
} from './gesture-pose-v1-projection.js';
