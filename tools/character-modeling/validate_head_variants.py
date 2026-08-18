import os
import sys

import bpy
from mathutils import Vector


def authored_world_matrix(obj):
    if obj.parent is None:
        return obj.matrix_basis.copy()
    return (
        authored_world_matrix(obj.parent)
        @ obj.matrix_parent_inverse
        @ obj.matrix_basis
    )


def world_bounds(objects):
    points = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        # Blender may leave bound_box at its [-1, 1] sentinel after loading a
        # file when a driver currently hides the object. Its evaluated world
        # matrix can be stale for the same reason, so reconstruct it from the
        # authored parent chain and transform the authoritative mesh vertices.
        matrix = authored_world_matrix(obj)
        points.extend(matrix @ vertex.co for vertex in obj.data.vertices)
    return (
        tuple(min(point[axis] for point in points) for axis in range(3)),
        tuple(max(point[axis] for point in points) for axis in range(3)),
    )


mount = bpy.data.objects["PICO_MOUNT_head_module"]
assert mount["pico_mount_axis"] == "+Y"
assert mount["pico_forward_axis"] == "+Z"
assert mount["pico_back_axis"] == "-Z"
assert mount["pico_head_identity_exclusive"] is True
assert mount["pico_head_identity_index"] == 0

antenna = [
    bpy.data.objects["Trim.AntennaStem"],
    bpy.data.objects["Status.AntennaSphere"],
]
antenna_carrier = bpy.data.objects[
    "PICO_HEAD_IDENTITY_standard_antenna"
]
assert antenna_carrier.parent == mount
assert all(obj.parent == antenna_carrier for obj in antenna)
assert all(obj["pico_head_identity"] == "standard_antenna" for obj in antenna)
bpy.context.view_layer.update()
antenna_minimum, antenna_maximum = world_bounds(antenna)
assert abs(antenna_maximum[1] - 0.562) < 0.001
assert abs(antenna_minimum[0] + 0.065) < 0.001
assert abs(antenna_maximum[0] - 0.065) < 0.001
print(
    f"PICO_HEAD_VARIANT=standard_antenna objects={len(antenna)} "
    f"bounds_min={antenna_minimum} bounds_max={antenna_maximum}"
)

variant_expectations = (
    (
        "HEAD_VARIANT_procedural_hair",
        "head-raised-crown",
        lambda minimum, maximum: (
            minimum[1] > 0.30
            and maximum[1] > 0.60
            and minimum[2] < -0.06
            and max(abs(minimum[0]), abs(maximum[0])) < 0.40
        ),
    ),
    (
        "HEAD_VARIANT_procedural_comb",
        "head-long-neon-tail",
        lambda minimum, maximum: (
            minimum[1] > 0.00
            and minimum[2] < -0.65
            and maximum[0] > 0.32
            and maximum[1] > 0.60
            and max(abs(minimum[0]), abs(maximum[0])) < 0.50
        ),
    ),
)
for identity_index, (
    collection_name,
    expected_vector,
    concept_envelope,
) in enumerate(variant_expectations, start=1):
    mount["pico_head_identity_index"] = identity_index
    mount.update_tag(refresh={"OBJECT"})
    bpy.context.view_layer.update()
    collection = bpy.data.collections[collection_name]
    objects = list(collection.all_objects)
    names = [obj.name for obj in objects]
    zones = [obj.get("pico_material_zone") for obj in objects]
    assert collection["pico_status"] == "diagnostic"
    assert collection["pico_generator_id"] == "pico.appearance.head-generator"
    assert collection["pico_generator_version"] == 2
    assert collection["pico_vector_name"] == expected_vector
    assert collection["pico_head_identity"] == "procedural_neon_hair"
    assert sum("InnerCarrier" in name for name in names) == 1
    assert sum("RootCollar" in name for name in names) == 1
    assert sum("Status.HeadAccent" in name for name in names) == 1
    assert not any("Antenna" in name for name in names)
    assert set(zones) == {"head_module", "trim", "status_emitters"}
    minimum, maximum = world_bounds(objects)
    print(
        f"PICO_HEAD_VARIANT={collection_name} "
        f"objects={len(objects)} bounds_min={minimum} bounds_max={maximum}"
    )
    assert concept_envelope(minimum, maximum)

carriers = {
    0: antenna_carrier,
    1: bpy.data.objects["PICO_HEAD_IDENTITY_procedural_hair"],
    2: bpy.data.objects["PICO_HEAD_IDENTITY_procedural_comb"],
}
for identity_index in range(3):
    mount["pico_head_identity_index"] = identity_index
    mount.update_tag(refresh={"OBJECT"})
    bpy.context.view_layer.update()
    visible = []
    for candidate_index, carrier in carriers.items():
        expected_scale = 1.0 if candidate_index == identity_index else 0.0
        assert all(
            abs(value - expected_scale) < 0.000001
            for value in carrier.scale
        )
        if expected_scale == 1.0:
            visible.append(carrier["pico_head_identity"])
    assert len(visible) == 1
    print(
        f"PICO_HEAD_SELECTOR=index_{identity_index} "
        f"visible={visible[0]}"
    )

mount["pico_head_identity_index"] = 0
bpy.context.view_layer.update()
print("PICO_HEAD_VARIANTS_STATUS=valid_diagnostic_structure_and_selector")
sys.stdout.flush()
sys.stderr.flush()
os._exit(0)
