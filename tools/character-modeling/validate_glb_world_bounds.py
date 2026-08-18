import os
import sys

import bpy
from mathutils import Vector


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="/tmp/pico-character-core-v0/pico-character-core-v0.glb")
bpy.context.view_layer.update()

objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
minimum = tuple(min(point[axis] for point in points) for axis in range(3))
maximum = tuple(max(point[axis] for point in points) for axis in range(3))
names = {obj.name for obj in bpy.context.scene.objects}

print(
    f"PICO_GLB_WORLD_BOUNDS=observed objects={len(objects)} "
    f"bounds_min={minimum} bounds_max={maximum}"
)

assert "PICO_MOUNT_head_module" in names
assert "PICO_HEAD_SELECTOR_standard_antenna" in names
assert "Trim.AntennaStem" in names
assert "Status.AntennaSphere" in names
assert "PICO_HEAD_SELECTOR_head_raised_crown" not in names
assert "PICO_HEAD_SELECTOR_head_long_neon_tail" not in names
assert not any(name.startswith("HeadModule.") for name in names)
assert not any(name.startswith("Status.HeadAccent.") for name in names)
# Blender converts the glTF Y-up contract back into its native Z-up view on
# import, so Character +Y is observed as Blender +Z here. Exported bevels add
# less than one per cent to the authored hand envelope.
assert abs(minimum[0] + 0.712) < 0.01
assert abs(maximum[0] - 0.672) < 0.01
assert abs(maximum[2] - 0.562) < 0.001

print("PICO_GLB_WORLD_BOUNDS=valid")
sys.stdout.flush()
sys.stderr.flush()
os._exit(0)
