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
    "PICO_HEAD_SELECTOR_standard_antenna"
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
        "HEAD_RECIPE_head_raised_crown",
        "head-raised-crown",
        {"hue": 198, "chroma": 138, "translucency": 168},
        lambda minimum, maximum: (
            minimum[1] > 0.30
            and maximum[1] > 0.60
            and minimum[2] < -0.06
            and max(abs(minimum[0]), abs(maximum[0])) < 0.40
        ),
    ),
    (
        "HEAD_RECIPE_head_long_neon_tail",
        "head-long-neon-tail",
        {"hue": 286, "chroma": 156, "translucency": 184},
        lambda minimum, maximum: (
            minimum[1] > -0.25
            and minimum[1] < 0.05
            and minimum[2] < -0.65
            and maximum[0] > 0.32
            and maximum[1] > 0.60
            and max(abs(minimum[0]), abs(maximum[0])) < 0.70
        ),
    ),
)
for identity_index, (
    collection_name,
    expected_vector,
    expected_material,
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
    assert collection["pico_material_hue"] == expected_material["hue"]
    assert collection["pico_material_chroma"] == expected_material["chroma"]
    assert (
        collection["pico_material_translucency"]
        == expected_material["translucency"]
    )
    for field in (
        "anchor", "side", "length", "lift", "sweep", "curl", "width",
        "taper", "twist", "segments", "partOffset", "partDepth",
        "crownBias", "rootSpread",
    ):
        assert f"pico_geometry_{field}" in collection
    assert sum("InnerCarrier" in name for name in names) == 1
    assert sum("RootCollar" in name for name in names) == 1
    assert sum("Status.HeadAccent" in name for name in names) == 1
    if expected_vector == "head-long-neon-tail":
        root_shell = bpy.data.objects[
            "HeadModule.Tail.HairRoot"
        ]
        hair_length = bpy.data.objects[
            "HeadModule.Tail.TranslucentHair"
        ]
        assert root_shell["pico_head_module_section"] == "hair_root"
        assert hair_length["pico_head_module_section"] == "hair_length"
        assert hair_length["pico_follows_section"] == "hair_root"
        assert root_shell["pico_material_zone"] == "trim"
        assert root_shell.data.materials[0].name == "PICO_ZONE_shell"
        assert hair_length["pico_material_zone"] == "head_module"
        assert sum("HairRoot" in name for name in names) == 1
        assert sum("TranslucentHair" in name for name in names) == 1
    assert not any("Antenna" in name for name in names)
    assert set(zones) == {"head_module", "trim", "status_emitters"}
    shell_objects = [
        obj for obj in objects
        if obj.get("pico_material_zone") == "head_module"
        and obj.data is not None
        and hasattr(obj.data, "materials")
    ]
    shell_materials = {
        material
        for obj in shell_objects
        for material in obj.data.materials
    }
    assert len(shell_materials) == 1
    shell_material = shell_materials.pop()
    assert shell_material["pico_material_role"] == "personal_translucent_shell"
    assert shell_material["pico_free_emission"] is False
    shader = shell_material.node_tree.nodes["Principled BSDF"]
    assert shader.inputs["Transmission Weight"].default_value > 0.20
    assert shader.inputs["Alpha"].default_value == 1.0
    assert shader.inputs["Emission Strength"].default_value == 0.0
    minimum, maximum = world_bounds(objects)
    print(
        f"PICO_HEAD_VARIANT={collection_name} "
        f"objects={len(objects)} bounds_min={minimum} bounds_max={maximum}"
    )
    assert concept_envelope(minimum, maximum)

carriers = {
    0: antenna_carrier,
    1: bpy.data.objects["PICO_HEAD_SELECTOR_head_raised_crown"],
    2: bpy.data.objects["PICO_HEAD_SELECTOR_head_long_neon_tail"],
}
selector_semantics = {
    0: ("standard_antenna", "none"),
    1: ("procedural_neon_hair", "head-raised-crown"),
    2: ("procedural_neon_hair", "head-long-neon-tail"),
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
            visible.append((
                carrier["pico_head_identity"],
                carrier["pico_recipe_name"],
            ))
    assert len(visible) == 1
    assert visible[0] == selector_semantics[identity_index]
    print(
        f"PICO_HEAD_SELECTOR=index_{identity_index} "
        f"identity={visible[0][0]} recipe={visible[0][1]}"
    )

mount["pico_head_identity_index"] = 0
bpy.context.view_layer.update()
print("PICO_HEAD_VARIANTS_STATUS=valid_diagnostic_structure_and_selector")
sys.stdout.flush()
sys.stderr.flush()
os._exit(0)
