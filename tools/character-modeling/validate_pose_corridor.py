"""The authored rig can carry every pose Gesture Pose V1 allows.

Two contracts meet here and neither can see the other on its own. `@pico/gesture`
publishes the pose corridor and the list of mounts a pose may turn; the Blender
checkpoint carries the mounts and the geometry hanging off them. This script
reads the first and applies it to the second.

What it proves is what can be proved without judgement:

- every mount the projection names exists, is a joint, and drives children;
- the projection names no mount the rig does not have, and the rig carries no
  joint the projection cannot reach;
- the whole corridor stays inside a stated world envelope, so no pose sends a
  hand through the floor light or outside the frame a renderer reserves;
- returning to rest restores the rest bounds exactly, so a pose leaves nothing
  behind.

What it deliberately does not prove is that every pose *looks* right. Three
geometric criteria for that were tried and each measured the wrong thing (see
`gesturePoseV1Limits`), because whether an overlap reads as wrong depends on
what a third part hides. The corners are rendered instead, for a person.

    "$PICO_BLENDER" tools/character-modeling/prototype/pico-character-core-v0.blend \
      --background -noaudio --disable-autoexec --python-exit-code 1 \
      --python tools/character-modeling/validate_pose_corridor.py
"""

import json
import math
import os
import subprocess
import sys

import bpy
from mathutils import Vector

try:
    HERE = os.path.dirname(os.path.abspath(__file__))
except NameError:  # pragma: no cover
    HERE = os.path.join(os.getcwd(), "tools", "character-modeling")
ROOT_DIR = os.path.dirname(os.path.dirname(HERE))

# The pose corridor a person may reach, in world units, once every joint is at
# a limit. It is stated here rather than derived, for the same reason the GLB
# envelope is: a renderer reserves a frame in advance, and a pose that grows
# past it crops silently.
# Measured corridor plus about a tenth: the frame is reserved in advance, so it
# is re-cut when a measurement leaves it or when the headroom grows past a
# quarter, not on every edit.
POSED_ENVELOPE = {
    "x": (-1.07, 1.11),
    "y": (-1.34, 0.64),
    "z": (-0.78, 0.82),
}


def gesture_contract():
    """Read the corridor and the mount list out of the shipped package."""
    esbuild = os.path.join(ROOT_DIR, "node_modules", ".bin", "esbuild")
    entry = os.path.join(ROOT_DIR, "packages", "gesture", "src", "index.ts")
    if not os.path.isfile(esbuild):
        raise SystemExit(f"{esbuild} is missing; install the workspace first")
    bundled = subprocess.run(
        [
            esbuild, entry, "--bundle", "--format=iife",
            "--global-name=PicoGesture", "--target=es2020", "--platform=neutral",
            "--legal-comments=none",
        ],
        capture_output=True, text=True, cwd=ROOT_DIR, check=False,
    )
    if bundled.returncode != 0:
        raise SystemExit(f"esbuild failed: {bundled.stderr.strip()}")
    script = (
        "const source = process.argv[1];\n"
        "const api = new Function(source + '; return PicoGesture;')();\n"
        "console.log(JSON.stringify({\n"
        "  limits: api.gesturePoseV1Limits,\n"
        "  mounts: api.gesturePoseV1MountNames(),\n"
        "  rest: api.gesturePoseV1Rest,\n"
        "}));\n"
    )
    read = subprocess.run(
        ["node", "-e", script, bundled.stdout],
        capture_output=True, text=True, cwd=ROOT_DIR, check=False,
    )
    if read.returncode != 0:
        raise SystemExit(f"reading the gesture contract failed: {read.stderr.strip()}")
    return json.loads(read.stdout)


CONTRACT = gesture_contract()
LIMITS = CONTRACT["limits"]
MOUNT_NAMES = CONTRACT["mounts"]

# ---------------------------------------------------------------------------
# 1  the rig carries exactly the joints the projection can reach
# ---------------------------------------------------------------------------

joints = {obj.name: obj for obj in bpy.data.objects if obj.get("pico_joint")}
assert sorted(joints) == sorted(MOUNT_NAMES), (
    sorted(set(joints) ^ set(MOUNT_NAMES))
)
for name in MOUNT_NAMES:
    mount = joints[name]
    assert mount.children, f"{name} drives nothing"
# No elbow *joint*. The dark collar at the bend is a marker the owner asked
# for; `validate_head_variants.py` holds it to owning nothing and standing
# clear of the arm.
assert not any(obj.get("pico_joint") == "elbow" for obj in bpy.data.objects)

# ---------------------------------------------------------------------------
# 2  every axis of the corridor, applied to the rig
# ---------------------------------------------------------------------------

AXIS_INDEX = {"pitch": 0, "yaw": 1, "roll": 2}


def axes_of_corridor():
    """(mount, axis index, degrees) for every limit the corridor publishes."""
    for axis, span in LIMITS["head"].items():
        for value in (span["minimum"], span["maximum"]):
            yield "PICO_MOUNT_head", AXIS_INDEX[axis], value
    for axis, span in LIMITS["body"].items():
        for value in (span["minimum"], span["maximum"]):
            yield "PICO_MOUNT_body", AXIS_INDEX[axis], value
    for side in ("L", "R"):
        for joint, mount in (("shoulder", f"PICO_MOUNT_shoulder.{side}"),
                             ("arm", f"PICO_MOUNT_arm.{side}")):
            for axis, span in LIMITS[joint].items():
                for value in (span["minimum"], span["maximum"]):
                    yield mount, AXIS_INDEX[axis], value
        for index in (1, 2, 3):
            for value in (LIMITS["finger"]["minimum"], LIMITS["finger"]["maximum"]):
                yield f"PICO_MOUNT_finger.{side}.{index}", AXIS_INDEX["roll"], value
        for value in (LIMITS["thumb"]["minimum"], LIMITS["thumb"]["maximum"]):
            yield f"PICO_MOUNT_thumb.{side}", AXIS_INDEX["roll"], value


def rest_the_rig():
    for mount in joints.values():
        mount.rotation_euler = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()


def world_bounds():
    depsgraph = bpy.context.evaluated_depsgraph_get()
    low = Vector((1e9, 1e9, 1e9))
    high = Vector((-1e9, -1e9, -1e9))
    for obj in bpy.data.collections["PICO_CHARACTER_CORE"].all_objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        matrix = evaluated.matrix_world
        for vertex in evaluated.data.vertices:
            point = matrix @ vertex.co
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    return low, high


rest_the_rig()
rest_low, rest_high = world_bounds()

corridor_low = Vector(rest_low)
corridor_high = Vector(rest_high)
checked = 0
for mount_name, axis, degrees in axes_of_corridor():
    rest_the_rig()
    rotation = [0.0, 0.0, 0.0]
    rotation[axis] = math.radians(degrees)
    joints[mount_name].rotation_euler = rotation
    bpy.context.view_layer.update()
    low, high = world_bounds()
    for index in range(3):
        corridor_low[index] = min(corridor_low[index], low[index])
        corridor_high[index] = max(corridor_high[index], high[index])
    checked += 1

# Every joint at a limit at once, in both directions: the envelope has to hold
# for a pose that uses the whole corridor, not only for one axis at a time.
for extreme in ("minimum", "maximum"):
    rest_the_rig()
    for mount_name, axis, _degrees in axes_of_corridor():
        joint = joints[mount_name]
        span = None
        if mount_name == "PICO_MOUNT_head":
            span = LIMITS["head"]
        elif mount_name == "PICO_MOUNT_body":
            span = LIMITS["body"]
        elif "shoulder" in mount_name:
            span = LIMITS["shoulder"]
        elif "arm" in mount_name:
            span = LIMITS["arm"]
        rotation = list(joint.rotation_euler)
        if span is None:
            key = "thumb" if "thumb" in mount_name else "finger"
            rotation[2] = math.radians(LIMITS[key][extreme])
        else:
            name = [axis_name for axis_name, index in AXIS_INDEX.items() if index == axis][0]
            rotation[axis] = math.radians(span[name][extreme])
        joint.rotation_euler = rotation
    bpy.context.view_layer.update()
    low, high = world_bounds()
    for index in range(3):
        corridor_low[index] = min(corridor_low[index], low[index])
        corridor_high[index] = max(corridor_high[index], high[index])
    checked += 1

rest_the_rig()
back_low, back_high = world_bounds()
assert (back_low - rest_low).length < 1e-6, "the rig does not return to rest"
assert (back_high - rest_high).length < 1e-6, "the rig does not return to rest"

for index, axis in enumerate("xyz"):
    low_limit, high_limit = POSED_ENVELOPE[axis]
    assert corridor_low[index] >= low_limit, (axis, corridor_low[index], low_limit)
    assert corridor_high[index] <= high_limit, (axis, corridor_high[index], high_limit)

print(
    f"PICO_POSE_CORRIDOR=mounts={len(MOUNT_NAMES)} poses={checked} "
    f"bounds_min=({corridor_low[0]:.4f}, {corridor_low[1]:.4f}, {corridor_low[2]:.4f}) "
    f"bounds_max=({corridor_high[0]:.4f}, {corridor_high[1]:.4f}, {corridor_high[2]:.4f})"
)
print("PICO_POSE_CORRIDOR_STATUS=valid_diagnostic_rig_not_character_approved")
sys.stdout.flush()
sys.stderr.flush()
os._exit(0)
