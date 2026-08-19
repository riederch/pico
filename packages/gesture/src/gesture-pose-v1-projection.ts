import type { PicoGesturePoseV1, PicoGestureRotationV1 } from './gesture-pose-v1.js';
import { validateGesturePoseV1 } from './gesture-pose-v1-validation.js';

/**
 * Where a pose lands on the authored rig.
 *
 * The character core carries named mounts and nothing else can be turned: a
 * renderer that reached into geometry instead would be posing a copy of PICO.
 * This projection is the whole list of what a pose may move, in degrees, and
 * it is deterministic — the same pose always yields the same rotations, with
 * no device, locale, time or random dependency.
 *
 * The face is deliberately absent. Which eye and mouth shape a state pairs
 * with is written into the authored checkpoint, so the expression travels
 * through as it is and whatever draws the face resolves it there. Naming a
 * pairing here would create a second face vocabulary next to the drawn one.
 */
export interface PicoGestureMountRotationV1 {
  readonly mount: string;
  readonly pitch: number;
  readonly yaw: number;
  readonly roll: number;
}

export interface PicoGestureProjectionV1 {
  readonly projectionVersion: 1;
  readonly expression: PicoGesturePoseV1['expression'];
  readonly rotations: readonly PicoGestureMountRotationV1[];
}

/** The digit mounts, in the order the character generator names them. */
export const gestureDigitMountsV1 = Object.freeze([
  Object.freeze({ key: 'fingers', index: 0, mount: 'PICO_MOUNT_finger.{side}.1' }),
  Object.freeze({ key: 'fingers', index: 1, mount: 'PICO_MOUNT_finger.{side}.2' }),
  Object.freeze({ key: 'fingers', index: 2, mount: 'PICO_MOUNT_finger.{side}.3' }),
  Object.freeze({ key: 'thumb', index: -1, mount: 'PICO_MOUNT_thumb.{side}' }),
]);

export function projectGesturePoseV1(pose: PicoGesturePoseV1): PicoGestureProjectionV1 {
  const validated = validateGesturePoseV1(pose);
  const rotations: PicoGestureMountRotationV1[] = [
    turned('PICO_MOUNT_body', validated.body),
    turned('PICO_MOUNT_head', validated.head),
  ];
  for (const side of ['L', 'R'] as const) {
    const arm = side === 'L' ? validated.arms.left : validated.arms.right;
    rotations.push(turned(`PICO_MOUNT_shoulder.${side}`, arm.shoulder));
    rotations.push(turned(`PICO_MOUNT_arm.${side}`, arm.arm));
    for (const digit of gestureDigitMountsV1) {
      // A digit has one joint, so its single curl is the only axis that moves.
      const curl = digit.key === 'thumb' ? arm.thumb : arm.fingers[digit.index];
      rotations.push({
        mount: digit.mount.replace('{side}', side),
        pitch: 0,
        yaw: 0,
        roll: curl,
      });
    }
  }
  return Object.freeze({
    projectionVersion: 1,
    expression: validated.expression,
    rotations: Object.freeze(rotations.map((rotation) => Object.freeze(rotation))),
  });
}

function turned(mount: string, rotation: PicoGestureRotationV1): PicoGestureMountRotationV1 {
  return { mount, pitch: rotation.pitch, yaw: rotation.yaw, roll: rotation.roll };
}

/** Every mount a Gesture Pose V1 can move, in projection order. */
export function gesturePoseV1MountNames(): readonly string[] {
  return projectGesturePoseV1({
    poseVersion: 1,
    expression: { state: 'idle', intensity: 'normal' },
    head: { pitch: 0, yaw: 0, roll: 0 },
    body: { pitch: 0, yaw: 0, roll: 0 },
    arms: {
      left: {
        shoulder: { pitch: 0, yaw: 0, roll: 0 },
        arm: { pitch: 0, yaw: 0, roll: 0 },
        thumb: 0,
        fingers: [0, 0, 0],
      },
      right: {
        shoulder: { pitch: 0, yaw: 0, roll: 0 },
        arm: { pitch: 0, yaw: 0, roll: 0 },
        thumb: 0,
        fingers: [0, 0, 0],
      },
    },
  }).rotations.map((rotation) => rotation.mount);
}
