import type { AvatarIntensity, AvatarStateName } from '@pico/protocol';

/**
 * Gesture Pose V1 — what PICO is doing right now, beside what PICO looks like.
 *
 * Appearance is identity and is kept; a pose is momentary and is not. They are
 * deliberately separate objects: a pose may travel many times a second while
 * the appearance behind it never changes, and no pose may alter identity.
 *
 * Everything here is a whole number of degrees. Degrees rather than a
 * normalised fraction because the corridor is a statement about a body, and
 * `-25..20` degrees of nod says what `0..255` cannot.
 *
 * Every angle is **relative to the joint above it**, the way the rig is built:
 * the head turns against the body, the digits against the wrist. In the world
 * they compose, so a head at its own limit of 45 degrees on a body already
 * turned 35 faces 80 degrees away from the front. A consumer that needs a
 * world-space bound has to add the chain up; this corridor does not do it for
 * them, because clamping a joint by what its parent happens to be doing would
 * make the same pose mean two different things.
 *
 * The face is carried, not computed. Which eye and mouth shape a state pairs
 * with lives in the authored checkpoint, and inventing a second pairing here
 * would put a face on PICO that the model does not draw.
 */
export interface PicoGestureRotationV1 {
  /** Nodding. Negative dips the front down. */
  readonly pitch: number;
  /** Turning left and right. */
  readonly yaw: number;
  /** Tilting sideways. */
  readonly roll: number;
}

export interface PicoGestureArmV1 {
  readonly shoulder: PicoGestureRotationV1;
  /** The wrist joint. There is no elbow: the shell between them bends. */
  readonly arm: PicoGestureRotationV1;
  /** One curl per digit, because each digit has exactly one joint. */
  readonly thumb: number;
  readonly fingers: readonly [number, number, number];
}

export interface PicoGestureExpressionV1 {
  readonly state: AvatarStateName;
  readonly intensity: AvatarIntensity;
}

export interface PicoGesturePoseV1 {
  readonly poseVersion: 1;
  readonly expression: PicoGestureExpressionV1;
  readonly head: PicoGestureRotationV1;
  readonly body: PicoGestureRotationV1;
  readonly arms: Readonly<{
    left: PicoGestureArmV1;
    right: PicoGestureArmV1;
  }>;
}

export type PicoGestureAngleRange = Readonly<{ minimum: number; maximum: number }>;

/**
 * The published pose corridor, in degrees, as data.
 *
 * The validator reads this table rather than repeating the numbers, so an
 * input surface built from it cannot offer a pose validation refuses.
 *
 * **How these numbers were arrived at, honestly.** They are a stated design
 * corridor, checked by eye against renders of every corner, and informed by --
 * not derived from -- a geometric sweep of the authored core. Three automatic
 * criteria were tried and each measured the wrong thing: touching triangle
 * pairs count contact, and parts built to sit inside each other touch at rest;
 * penetration depth punishes a digit for sliding further into a palm it is
 * already hidden inside; and "a visible vertex enters its neighbour" flags the
 * head's lower rim dipping into the torso, which the neck trim covers. What
 * reads as wrong depends on what a third part hides, so it is not a property
 * of two meshes. `validate_pose_corridor.py` therefore proves what it can
 * without judgement -- every named mount exists and drives its children, and
 * the whole corridor stays inside the world envelope -- and the corners are
 * rendered for a person to look at.
 */
export const gesturePoseV1Limits = Object.freeze({
  head: Object.freeze({
    pitch: Object.freeze({ minimum: -25, maximum: 20 }),
    yaw: Object.freeze({ minimum: -45, maximum: 45 }),
    roll: Object.freeze({ minimum: -18, maximum: 18 }),
  }),
  body: Object.freeze({
    pitch: Object.freeze({ minimum: -15, maximum: 12 }),
    yaw: Object.freeze({ minimum: -35, maximum: 35 }),
    roll: Object.freeze({ minimum: -10, maximum: 10 }),
  }),
  shoulder: Object.freeze({
    pitch: Object.freeze({ minimum: -70, maximum: 70 }),
    yaw: Object.freeze({ minimum: -30, maximum: 30 }),
    roll: Object.freeze({ minimum: -70, maximum: 15 }),
  }),
  arm: Object.freeze({
    pitch: Object.freeze({ minimum: -45, maximum: 45 }),
    yaw: Object.freeze({ minimum: -30, maximum: 30 }),
    roll: Object.freeze({ minimum: -60, maximum: 60 }),
  }),
  thumb: Object.freeze({ minimum: -20, maximum: 45 }),
  finger: Object.freeze({ minimum: -60, maximum: 15 }),
});

/** The pose every field falls back to: PICO standing still, facing forward. */
export const gesturePoseV1Rest: PicoGesturePoseV1 = Object.freeze({
  poseVersion: 1,
  expression: Object.freeze({ state: 'idle', intensity: 'normal' }),
  head: Object.freeze({ pitch: 0, yaw: 0, roll: 0 }),
  body: Object.freeze({ pitch: 0, yaw: 0, roll: 0 }),
  arms: Object.freeze({
    left: Object.freeze({
      shoulder: Object.freeze({ pitch: 0, yaw: 0, roll: 0 }),
      arm: Object.freeze({ pitch: 0, yaw: 0, roll: 0 }),
      thumb: 0,
      fingers: Object.freeze([0, 0, 0]) as unknown as readonly [number, number, number],
    }),
    right: Object.freeze({
      shoulder: Object.freeze({ pitch: 0, yaw: 0, roll: 0 }),
      arm: Object.freeze({ pitch: 0, yaw: 0, roll: 0 }),
      thumb: 0,
      fingers: Object.freeze([0, 0, 0]) as unknown as readonly [number, number, number],
    }),
  }),
});
