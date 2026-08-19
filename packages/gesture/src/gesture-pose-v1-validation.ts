import { avatarIntensities, avatarStates } from '@pico/protocol';
import { PicoGestureError } from './gesture-errors.js';
import {
  gesturePoseV1Limits,
  type PicoGestureAngleRange,
  type PicoGestureArmV1,
  type PicoGestureExpressionV1,
  type PicoGesturePoseV1,
  type PicoGestureRotationV1,
} from './gesture-pose-v1.js';

/**
 * Strict validation of an external pose: closed shapes, plain prototypes,
 * whole degrees only, exact version, no silent clamps. The returned pose is a
 * frozen deep copy, so mutating the input afterwards cannot change a pose that
 * has already been accepted.
 */
export function validateGesturePoseV1(input: unknown): PicoGesturePoseV1 {
  const root = plainObject(input, 'pose', ['poseVersion', 'expression', 'head', 'body', 'arms']);
  exactVersion(root.poseVersion, 'pose.poseVersion');
  const arms = plainObject(root.arms, 'pose.arms', ['left', 'right']);
  const pose: PicoGesturePoseV1 = {
    poseVersion: 1,
    expression: expression(root.expression),
    head: rotation(root.head, 'pose.head', gesturePoseV1Limits.head),
    body: rotation(root.body, 'pose.body', gesturePoseV1Limits.body),
    arms: {
      left: arm(arms.left, 'pose.arms.left'),
      right: arm(arms.right, 'pose.arms.right'),
    },
  };
  return freeze(pose);
}

function expression(input: unknown): PicoGestureExpressionV1 {
  const record = plainObject(input, 'pose.expression', ['state', 'intensity']);
  // The vocabulary is the protocol's, not a copy of it: a state this package
  // accepted but `avatar.state_changed` could not carry would be a state that
  // never arrives.
  return {
    state: member(record.state, 'pose.expression.state', avatarStates),
    intensity: member(record.intensity, 'pose.expression.intensity', avatarIntensities),
  };
}

function arm(input: unknown, label: string): PicoGestureArmV1 {
  const record = plainObject(input, label, ['shoulder', 'arm', 'thumb', 'fingers']);
  if (!Array.isArray(record.fingers)) {
    throw new PicoGestureError('invalid_type', `${label}.fingers must be an array`);
  }
  if (record.fingers.length !== 3) {
    throw new PicoGestureError('invalid_shape', `${label}.fingers must hold exactly three curls`);
  }
  return {
    shoulder: rotation(record.shoulder, `${label}.shoulder`, gesturePoseV1Limits.shoulder),
    arm: rotation(record.arm, `${label}.arm`, gesturePoseV1Limits.arm),
    thumb: degrees(record.thumb, `${label}.thumb`, gesturePoseV1Limits.thumb),
    fingers: record.fingers.map((curl, index) =>
      degrees(curl, `${label}.fingers[${index}]`, gesturePoseV1Limits.finger),
    ) as unknown as readonly [number, number, number],
  };
}

function rotation(
  input: unknown,
  label: string,
  limits: Readonly<Record<'pitch' | 'yaw' | 'roll', PicoGestureAngleRange>>,
): PicoGestureRotationV1 {
  const record = plainObject(input, label, ['pitch', 'yaw', 'roll']);
  return {
    pitch: degrees(record.pitch, `${label}.pitch`, limits.pitch),
    yaw: degrees(record.yaw, `${label}.yaw`, limits.yaw),
    roll: degrees(record.roll, `${label}.roll`, limits.roll),
  };
}

function degrees(value: unknown, label: string, range: PicoGestureAngleRange): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new PicoGestureError('invalid_integer', `${label} must be a whole number of degrees`);
  }
  if (value < range.minimum || value > range.maximum) {
    throw new PicoGestureError(
      'value_out_of_range',
      `${label} must be between ${range.minimum} and ${range.maximum} degrees`,
    );
  }
  return value;
}

function member<T extends string>(value: unknown, label: string, allowed: readonly T[]): T {
  if (typeof value !== 'string') {
    throw new PicoGestureError('invalid_type', `${label} must be a string`);
  }
  if (!(allowed as readonly string[]).includes(value)) {
    throw new PicoGestureError('invalid_shape', `${label} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

function exactVersion(value: unknown, label: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new PicoGestureError('invalid_integer', `${label} must be an integer`);
  }
  if (value !== 1) {
    throw new PicoGestureError('unsupported_pose_version', `${label} must be exactly 1`);
  }
}

function plainObject(
  value: unknown,
  label: string,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PicoGestureError('invalid_type', `${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new PicoGestureError('invalid_shape', `${label} must be a plain object`);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      throw new PicoGestureError('invalid_shape', `${label} has unknown key ${JSON.stringify(key)}`);
    }
  }
  for (const key of allowedKeys) {
    if (!(key in record)) {
      throw new PicoGestureError('invalid_shape', `${label} is missing key ${JSON.stringify(key)}`);
    }
  }
  return record;
}

function freeze(pose: PicoGesturePoseV1): PicoGesturePoseV1 {
  Object.freeze(pose.expression);
  Object.freeze(pose.head);
  Object.freeze(pose.body);
  for (const side of [pose.arms.left, pose.arms.right]) {
    Object.freeze(side.shoulder);
    Object.freeze(side.arm);
    Object.freeze(side.fingers);
    Object.freeze(side);
  }
  Object.freeze(pose.arms);
  return Object.freeze(pose);
}
