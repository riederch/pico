"""Render the corners of the Gesture Pose V1 corridor, for a person to judge.

`validate_pose_corridor.py` proves what can be proved without judgement. What
it cannot decide is whether a pose *reads* right, because that depends on what
a third part hides. So the corridor's corners are drawn here and looked at.

The poses come from the package, not from this file: it asks `@pico/gesture`
for the published limits and drives each named mount to them, so a corridor
change shows up in the pictures without anybody editing the list.

    "$PICO_BLENDER" tools/character-modeling/prototype/pico-character-core-v0.blend \
      --background -noaudio --disable-autoexec --python-exit-code 1 \
      --python tools/character-modeling/render_pose_corners.py
"""

import json
import math
import os
import subprocess
import sys

import bpy

try:
    HERE = os.path.dirname(os.path.abspath(__file__))
except NameError:  # pragma: no cover
    HERE = os.path.join(os.getcwd(), "tools", "character-modeling")
ROOT_DIR = os.path.dirname(os.path.dirname(HERE))
OUTPUT_DIR = "/tmp/pico-pose-corners"


def gesture_limits():
    esbuild = os.path.join(ROOT_DIR, "node_modules", ".bin", "esbuild")
    entry = os.path.join(ROOT_DIR, "packages", "gesture", "src", "index.ts")
    bundled = subprocess.run(
        [esbuild, entry, "--bundle", "--format=iife", "--global-name=PicoGesture",
         "--target=es2020", "--platform=neutral", "--legal-comments=none"],
        capture_output=True, text=True, cwd=ROOT_DIR, check=False,
    )
    if bundled.returncode != 0:
        raise SystemExit(f"esbuild failed: {bundled.stderr.strip()}")
    read = subprocess.run(
        ["node", "-e",
         "const api = new Function(process.argv[1] + '; return PicoGesture;')();"
         "console.log(JSON.stringify(api.gesturePoseV1Limits));",
         bundled.stdout],
        capture_output=True, text=True, cwd=ROOT_DIR, check=False,
    )
    if read.returncode != 0:
        raise SystemExit(f"reading the corridor failed: {read.stderr.strip()}")
    return json.loads(read.stdout)


LIMITS = gesture_limits()
AXIS = {"pitch": 0, "yaw": 1, "roll": 2}
JOINTS = {obj.name: obj for obj in bpy.data.objects if obj.get("pico_joint")}


def rest():
    for mount in JOINTS.values():
        mount.rotation_euler = (0.0, 0.0, 0.0)


def turn(mount_name, axis, degrees):
    rotation = list(JOINTS[mount_name].rotation_euler)
    rotation[AXIS[axis]] = math.radians(degrees)
    JOINTS[mount_name].rotation_euler = rotation


def both_arms(joint, axis, degrees):
    for side in ("L", "R"):
        turn(f"PICO_MOUNT_{joint}.{side}", axis, degrees if side == "L" else -degrees)


def all_digits(degrees, thumbs):
    for side in ("L", "R"):
        for index in (1, 2, 3):
            turn(f"PICO_MOUNT_finger.{side}.{index}", "roll", degrees)
        turn(f"PICO_MOUNT_thumb.{side}", "roll", thumbs if side == "L" else -thumbs)


def everything(extreme):
    for part, mount in (("head", "PICO_MOUNT_head"), ("body", "PICO_MOUNT_body")):
        for axis in AXIS:
            turn(mount, axis, LIMITS[part][axis][extreme])
    for joint in ("shoulder", "arm"):
        for axis in AXIS:
            both_arms(joint, axis, LIMITS[joint][axis][extreme])
    all_digits(LIMITS["finger"][extreme], LIMITS["thumb"][extreme])


CORNERS = (
    ("01_ruhe", lambda: None),
    ("02_kopf_nicken_min", lambda: turn("PICO_MOUNT_head", "pitch", LIMITS["head"]["pitch"]["minimum"])),
    ("03_kopf_nicken_max", lambda: turn("PICO_MOUNT_head", "pitch", LIMITS["head"]["pitch"]["maximum"])),
    ("04_kopf_drehen_max", lambda: turn("PICO_MOUNT_head", "yaw", LIMITS["head"]["yaw"]["maximum"])),
    ("05_kopf_neigen_max", lambda: turn("PICO_MOUNT_head", "roll", LIMITS["head"]["roll"]["maximum"])),
    ("06_koerper_neigen_min", lambda: turn("PICO_MOUNT_body", "pitch", LIMITS["body"]["pitch"]["minimum"])),
    ("07_koerper_drehen_max", lambda: turn("PICO_MOUNT_body", "yaw", LIMITS["body"]["yaw"]["maximum"])),
    ("08_schulter_heben_max", lambda: both_arms("shoulder", "pitch", LIMITS["shoulder"]["pitch"]["maximum"])),
    ("09_schulter_rollen_min", lambda: both_arms("shoulder", "roll", LIMITS["shoulder"]["roll"]["minimum"])),
    ("10_handgelenk_rollen_max", lambda: both_arms("arm", "roll", LIMITS["arm"]["roll"]["maximum"])),
    ("11_faust", lambda: all_digits(LIMITS["finger"]["minimum"], LIMITS["thumb"]["maximum"])),
    ("12_alles_minimum", lambda: everything("minimum")),
    ("13_alles_maximum", lambda: everything("maximum")),
)


scene = bpy.context.scene
scene.render.resolution_x = 520
scene.render.resolution_y = 650
scene.render.resolution_percentage = 100
try:
    scene.eevee.taa_render_samples = 24
except Exception:  # pragma: no cover - render engine differences
    pass
scene.camera = bpy.data.objects["Camera.Reference"]
os.makedirs(OUTPUT_DIR, exist_ok=True)

for name, apply in CORNERS:
    rest()
    apply()
    bpy.context.view_layer.update()
    scene.render.filepath = os.path.join(OUTPUT_DIR, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"PICO_POSE_CORNER={name}")

rest()
print(f"PICO_POSE_CORNERS={len(CORNERS)} directory={OUTPUT_DIR}")
print("PICO_POSE_CORNERS_STATUS=diagnostic_not_character_approved")
sys.stdout.flush()
sys.stderr.flush()
os._exit(0)
