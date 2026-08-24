import { describe, expect, it } from 'vitest';
import { avatarIntensities, avatarStates } from '@pico/protocol';
import {
  gestureDigitMountsV1,
  gesturePoseV1Limits,
  gesturePoseV1MountNames,
  gesturePoseV1Rest,
  PicoGestureError,
  projectGesturePoseV1,
  validateGesturePoseV1,
  type PicoGesturePoseV1,
} from './index.js';

function poseWith(change: (draft: Record<string, unknown>) => void): unknown {
  const draft = JSON.parse(JSON.stringify(gesturePoseV1Rest)) as Record<string, unknown>;
  change(draft);
  return draft;
}

function expectGestureError(run: () => unknown, code: string): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(PicoGestureError);
  expect((caught as PicoGestureError).code).toBe(code);
}

describe('Gesture Pose V1 validation', () => {
  it('accepts the rest pose and freezes what it returns', () => {
    const pose = validateGesturePoseV1(gesturePoseV1Rest);
    expect(Object.isFrozen(pose)).toBe(true);
    expect(Object.isFrozen(pose.arms.left.fingers)).toBe(true);
    expect(pose.expression.state).toBe('idle');
  });

  it('cannot be changed after the fact through the object it was given', () => {
    const mutable = JSON.parse(JSON.stringify(gesturePoseV1Rest)) as PicoGesturePoseV1;
    const validated = validateGesturePoseV1(mutable);
    (mutable.head as { pitch: number }).pitch = 19;
    expect(validated.head.pitch).toBe(0);
  });

  it('refuses a pose version it does not implement', () => {
    expectGestureError(
      () => validateGesturePoseV1(poseWith((draft) => { draft.poseVersion = 2; })),
      'unsupported_pose_version',
    );
  });

  it('refuses fractions of a degree rather than rounding them', () => {
    expectGestureError(
      () => validateGesturePoseV1(poseWith((draft) => {
        (draft.head as Record<string, number>).yaw = 12.5;
      })),
      'invalid_integer',
    );
  });

  it('refuses a key it does not know instead of ignoring it', () => {
    expectGestureError(
      () => validateGesturePoseV1(poseWith((draft) => {
        (draft.head as Record<string, number>).twist = 4;
      })),
      'invalid_shape',
    );
  });

  it('refuses an elbow, which the character does not have', () => {
    expectGestureError(
      () => validateGesturePoseV1(poseWith((draft) => {
        const left = (draft.arms as Record<string, Record<string, unknown>>).left;
        left.elbow = { pitch: 0, yaw: 0, roll: 0 };
      })),
      'invalid_shape',
    );
  });

  it('refuses anything but three fingers', () => {
    expectGestureError(
      () => validateGesturePoseV1(poseWith((draft) => {
        const left = (draft.arms as Record<string, Record<string, unknown>>).left;
        left.fingers = [0, 0, 0, 0];
      })),
      'invalid_shape',
    );
  });

  it('takes its expression vocabulary from the protocol', () => {
    for (const state of avatarStates) {
      for (const intensity of avatarIntensities) {
        expect(() => validateGesturePoseV1(poseWith((draft) => {
          draft.expression = { state, intensity };
        }))).not.toThrow();
      }
    }
    expectGestureError(
      () => validateGesturePoseV1(poseWith((draft) => {
        draft.expression = { state: 'celebrating', intensity: 'normal' };
      })),
      'invalid_shape',
    );
  });
});

describe('the published corridor is the one validation enforces', () => {
  const cases: Array<[string, (draft: Record<string, unknown>, value: number) => void, { minimum: number; maximum: number }]> = [];
  for (const part of ['head', 'body'] as const) {
    for (const axis of ['pitch', 'yaw', 'roll'] as const) {
      cases.push([
        `${part}.${axis}`,
        (draft, value) => { (draft[part] as Record<string, number>)[axis] = value; },
        gesturePoseV1Limits[part][axis],
      ]);
    }
  }
  for (const joint of ['shoulder', 'arm'] as const) {
    for (const axis of ['pitch', 'yaw', 'roll'] as const) {
      cases.push([
        `arms.left.${joint}.${axis}`,
        (draft, value) => {
          const left = (draft.arms as Record<string, Record<string, Record<string, number>>>).left;
          left[joint][axis] = value;
        },
        gesturePoseV1Limits[joint][axis],
      ]);
    }
  }
  cases.push([
    'arms.left.thumb',
    (draft, value) => {
      (draft.arms as Record<string, Record<string, number>>).left.thumb = value;
    },
    gesturePoseV1Limits.thumb,
  ]);
  cases.push([
    'arms.left.fingers[1]',
    (draft, value) => {
      const left = (draft.arms as Record<string, Record<string, number[]>>).left;
      left.fingers[1] = value;
    },
    gesturePoseV1Limits.finger,
  ]);

  for (const [label, apply, range] of cases) {
    it(`${label} reaches ${range.minimum} and ${range.maximum} and stops there`, () => {
      expect(() => validateGesturePoseV1(poseWith((draft) => apply(draft, range.minimum)))).not.toThrow();
      expect(() => validateGesturePoseV1(poseWith((draft) => apply(draft, range.maximum)))).not.toThrow();
      expectGestureError(
        () => validateGesturePoseV1(poseWith((draft) => apply(draft, range.minimum - 1))),
        'value_out_of_range',
      );
      expectGestureError(
        () => validateGesturePoseV1(poseWith((draft) => apply(draft, range.maximum + 1))),
        'value_out_of_range',
      );
    });
  }
});

/**
 * Die Rig, im Test ausgeschrieben und nur hier.
 *
 * `gesturePoseV1MountNames()` ist die Projektion der Ruhepose - eine Zeile
 * darunter im selben Modul. Sie als erwartete Liste zu benutzen hieße, die
 * Projektion gegen sich selbst zu halten; ein Projektor, der gar keine
 * Rotation mehr ausgibt, käme durch. Am 2026-08-24 genau so geschrieben und
 * von der Pflanzung widerlegt.
 */
const rigMounts = [
  'PICO_MOUNT_body',
  'PICO_MOUNT_head',
  'PICO_MOUNT_shoulder.L',
  'PICO_MOUNT_arm.L',
  'PICO_MOUNT_finger.L.1',
  'PICO_MOUNT_finger.L.2',
  'PICO_MOUNT_finger.L.3',
  'PICO_MOUNT_thumb.L',
  'PICO_MOUNT_shoulder.R',
  'PICO_MOUNT_arm.R',
  'PICO_MOUNT_finger.R.1',
  'PICO_MOUNT_finger.R.2',
  'PICO_MOUNT_finger.R.3',
  'PICO_MOUNT_thumb.R',
];

describe('projection onto the authored rig', () => {
  it('names every mount the rig carries, once, and no other', () => {
    const mounts = gesturePoseV1MountNames();
    expect(new Set(mounts).size).toBe(mounts.length);
    expect(mounts).toEqual(rigMounts);
    expect(mounts).not.toContain('PICO_MOUNT_elbow.L');
  });

  it('leaves the rig at rest for the rest pose', () => {
    const projection = projectGesturePoseV1(gesturePoseV1Rest);
    // Erst, dass jeder Mount überhaupt da ist. "Ruht" ist über eine Rig ohne
    // Knochen wahr, und eine Schleife über nichts behauptet nichts: mit einem
    // Projektor, der gar keine Rotation mehr ausgibt, blieb dieser Test grün
    // und nur der Nachbar oben fiel um (2026-08-24).
    expect(projection.rotations.map((rotation) => rotation.mount))
      .toEqual(rigMounts);
    for (const rotation of projection.rotations) {
      expect([rotation.pitch, rotation.yaw, rotation.roll], rotation.mount)
        .toEqual([0, 0, 0]);
    }
  });

  it('sends each digit curl to its own mount and nowhere else', () => {
    const pose = JSON.parse(JSON.stringify(gesturePoseV1Rest)) as PicoGesturePoseV1;
    (pose.arms.left.fingers as unknown as number[])[1] = -40;
    (pose.arms.left as { thumb: number }).thumb = 30;
    const rotations = projectGesturePoseV1(pose).rotations;
    const moved = rotations.filter((rotation) => rotation.roll !== 0);
    expect(moved.map((rotation) => [rotation.mount, rotation.roll])).toEqual([
      ['PICO_MOUNT_finger.L.2', -40],
      ['PICO_MOUNT_thumb.L', 30],
    ]);
    // a digit has one joint, so nothing else about it can move
    for (const rotation of rotations) {
      if (gestureDigitMountsV1.some((digit) => rotation.mount.startsWith(digit.mount.split('{')[0]))) {
        expect([rotation.pitch, rotation.yaw]).toEqual([0, 0]);
      }
    }
  });

  it('carries the expression through rather than resolving a face', () => {
    const pose = JSON.parse(JSON.stringify(gesturePoseV1Rest)) as Record<string, unknown>;
    pose.expression = { state: 'thinking', intensity: 'high' };
    const projection = projectGesturePoseV1(pose as unknown as PicoGesturePoseV1);
    expect(projection.expression).toEqual({ state: 'thinking', intensity: 'high' });
    expect(JSON.stringify(projection)).not.toContain('eye');
    expect(JSON.stringify(projection)).not.toContain('mouth');
  });

  it('refuses to project a pose it would not accept', () => {
    expectGestureError(
      () => projectGesturePoseV1(poseWith((draft) => {
        (draft.head as Record<string, number>).yaw = 900;
      }) as PicoGesturePoseV1),
      'value_out_of_range',
    );
  });
});
