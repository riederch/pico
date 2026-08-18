import bpy
import os
from mathutils import Matrix, Vector


OUTPUT_DIR = "/tmp/pico-character-core-v0"


def look_at_y_up(obj, target, desired_up):
    forward = (Vector(target) - obj.location).normalized()
    desired_up = Vector(desired_up).normalized()
    right = forward.cross(desired_up).normalized()
    actual_up = right.cross(forward).normalized()
    obj.rotation_euler = Matrix((right, actual_up, -forward)).transposed().to_quaternion().to_euler()


scene = bpy.context.scene
camera = bpy.data.objects["Camera.Reference"]
scene.camera = camera
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = False
camera.data.type = "ORTHO"
camera.data.ortho_scale = 2.16

views = {
    "front": ((0.0, -0.37, 6.8), (0.0, 1.0, 0.0)),
    "reference": ((3.15, 0.32, 6.15), (0.0, 1.0, 0.0)),
    "left": ((6.8, -0.37, 0.0), (0.0, 1.0, 0.0)),
    "right": ((-6.8, -0.37, 0.0), (0.0, 1.0, 0.0)),
    "rear": ((0.0, -0.37, -6.8), (0.0, 1.0, 0.0)),
    "top": ((0.0, 6.5, 0.0), (0.0, 0.0, 1.0)),
    "bottom": ((0.0, -7.0, 0.0), (0.0, 0.0, 1.0)),
}

for name, (position, up) in views.items():
    camera.location = position
    look_at_y_up(camera, (0.0, -0.37, 0.0), up)
    scene.render.filepath = os.path.join(OUTPUT_DIR, f"pico-inspection-{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"PICO_INSPECTION_{name.upper()}={scene.render.filepath}")

print("PICO_INSPECTION_STATUS=unapproved_depth_proposal")
