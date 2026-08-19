import os
import re
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
            # falls behind the head without reaching below it
            minimum[1] > -0.395
            and minimum[1] < 0.00
            # the band's upper edge clears the crown as a short full arc,
            # never as a tall spike
            and 0.48 < maximum[1] < 0.62
            # sits behind the head, close to it rather than trailing far off
            and -0.70 < minimum[2] < -0.44
            and maximum[0] > 0.45
            and max(abs(minimum[0]), abs(maximum[0])) < 0.80
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
    # The rear ribbon carries an outer and a shaded inner face so its gentle
    # roll reads; the compact crown blades stay on the single outer material.
    expected_faces = (
        {"outer", "inner"} if expected_vector == "head-long-neon-tail"
        else {"outer"}
    )
    assert {
        material["pico_material_face"] for material in shell_materials
    } == expected_faces, expected_vector
    assert len(shell_materials) == len(expected_faces)
    for shell_material in shell_materials:
        assert shell_material["pico_material_role"] == "personal_translucent_shell"
        assert shell_material["pico_free_emission"] is False
        assert shell_material["pico_personal_hue"] == expected_material["hue"]
        assert shell_material["pico_personal_chroma"] == expected_material["chroma"]
        assert (
            shell_material["pico_personal_translucency"]
            == expected_material["translucency"]
        )
        shader = shell_material.node_tree.nodes["Principled BSDF"]
        assert shader.inputs["Transmission Weight"].default_value > 0.10
        assert shader.inputs["Alpha"].default_value == 1.0
        assert shader.inputs["Emission Strength"].default_value == 0.0
        if hasattr(shell_material, "use_raytrace_refraction"):
            assert shell_material.use_raytrace_refraction is True
    if len(shell_materials) == 2:
        outer, inner = sorted(
            shell_materials, key=lambda item: item["pico_material_face"],
        )[::-1]
        assert outer["pico_material_face"] == "outer"
        assert inner["pico_material_face"] == "inner"
        outer_rgb = outer.node_tree.nodes["Principled BSDF"].inputs["Base Color"]
        inner_rgb = inner.node_tree.nodes["Principled BSDF"].inputs["Base Color"]
        assert sum(outer_rgb.default_value[:3]) > sum(inner_rgb.default_value[:3])
    minimum, maximum = world_bounds(objects)
    print(
        f"PICO_HEAD_VARIANT={collection_name} "
        f"objects={len(objects)} bounds_min={minimum} bounds_max={maximum}"
    )
    assert concept_envelope(minimum, maximum)

# ---------------------------------------------------------------------------
# Hair style 3: the refined concept tail contract (TODO.md section 1).
# ---------------------------------------------------------------------------

mount["pico_head_identity_index"] = 2
mount.update_tag(refresh={"OBJECT"})
bpy.context.view_layer.update()

TAIL = bpy.data.collections["HEAD_RECIPE_head_long_neon_tail"]
HEAD = bpy.data.objects["Shell.Head"]
HEAD_MATRIX = authored_world_matrix(HEAD)
HEAD_INVERSE = HEAD_MATRIX.inverted()
HEAD_TOP = 0.395
HEAD_BOTTOM = -0.395
HEAD_HALF_WIDTH = 0.5005


def head_signed_distance(world_point):
    """Negative inside the head shell, positive outside it."""
    local = HEAD_INVERSE @ Vector(world_point)
    found, surface, normal, _ = HEAD.closest_point_on_mesh(local)
    assert found
    offset = local - surface
    return offset.length * (-1.0 if offset.dot(normal) < 0.0 else 1.0)


def world_vertices(obj):
    matrix = authored_world_matrix(obj)
    return [matrix @ vertex.co for vertex in obj.data.vertices]


def connected_components(mesh):
    parent = list(range(len(mesh.vertices)))

    def find(node):
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    for edge in mesh.edges:
        a, b = find(edge.vertices[0]), find(edge.vertices[1])
        if a != b:
            parent[a] = b
    return len({find(index) for index in range(len(mesh.vertices))})


root_point = Vector(TAIL["pico_module_root"])
apex_point = Vector(TAIL["pico_module_apex"])
hanging_point = Vector(TAIL["pico_module_hanging"])
tip_point = Vector(TAIL["pico_module_tip"])

# 1-3  the fitting lies flat and tangential on the crown, embedded in the shell
fitting = bpy.data.objects["HeadModule.Tail.HairRoot"]
fitting_width = TAIL["pico_module_fitting_width"]
fitting_thickness = TAIL["pico_module_fitting_thickness"]
assert fitting_thickness < fitting_width * 0.42, (fitting_thickness, fitting_width)
assert 0.20 < fitting_width < 0.34, fitting_width
# the plate is a circle: both of its in-plane axes are equal
assert TAIL["pico_module_fitting_is_circular"] is True
assert abs(fitting.scale.x - fitting.scale.z) < 0.0005, tuple(fitting.scale)
assert fitting.data.materials[0].name == "PICO_ZONE_shell"
fitting_points = world_vertices(fitting)
fitting_distances = [head_signed_distance(point) for point in fitting_points]
assert min(fitting_distances) < 0.0, "fitting floats above the crown"
assert max(fitting_distances) < 0.09, "fitting stands off the crown"
assert sum(1 for value in fitting_distances if value < 0.0) > len(fitting_points) * 0.25

# 4  exactly one dark mechanical collar with exactly one mounting point
collar = bpy.data.objects["HeadModule.Tail.RootCollar"]
assert collar["pico_head_module_section"] == "root_collar"
assert collar["pico_mount_points"] == 1
assert collar.data.materials[0].name == "PICO_ZONE_trim"

# 5  no antenna while the tail is the visible head identity
assert not any("Antenna" in obj.name for obj in TAIL.all_objects)

# 6  one closed light-guide band, not a group of strands
hair = bpy.data.objects["HeadModule.Tail.TranslucentHair"]
# the selector empty also carries the head_module zone, so count real shells
assert sum(
    1 for obj in TAIL.all_objects
    if obj.type == "MESH" and obj.get("pico_material_zone") == "head_module"
) == 1
assert connected_components(hair.data) == 1, "the band is not one closed shell"

# 7-9  rise, a short full arc, then a fall that stays above the head
assert apex_point.y > HEAD_TOP + 0.02, apex_point.y
assert apex_point.y < HEAD_TOP + 0.14, apex_point.y
assert apex_point.z < root_point.z, "the band does not rise backwards"
assert hanging_point.y < root_point.y, "the band does not fall after the arc"
assert hanging_point.y > HEAD_BOTTOM, "the band reaches below the head"
hair_points = world_vertices(hair)
assert min(point.y for point in hair_points) > HEAD_BOTTOM, "band below the head"

# 10  the tip swings outward and up, and closes round instead of cut off
assert abs(tip_point.x) > abs(hanging_point.x), "the tip does not swing outward"
assert tip_point.y > hanging_point.y, "the tip does not swing up"
tip_cloud = [point for point in hair_points if (point - tip_point).length < 0.045]
assert tip_cloud, "no geometry at the authored tip"
tip_spread = max(
    (a - b).length for a in tip_cloud for b in tip_cloud
)
assert 0.0 < tip_spread < 0.09, tip_spread

# 11  gathered at the fitting, broad through the arc, tapering to the tip
band_width = TAIL["pico_module_band_width"]
assert 0.19 < band_width < 0.30, band_width
root_width = TAIL["pico_module_root_width"]
arc_width = TAIL["pico_module_arc_width"]
tip_width = TAIL["pico_module_tip_width"]
# A ponytail is held together where it leaves its tie and opens out after it.
assert root_width < arc_width * 0.72, (root_width, arc_width)
assert root_width > arc_width * 0.25, (root_width, arc_width)
assert abs(arc_width - band_width) < 0.001, (arc_width, band_width)
assert tip_width < arc_width * 0.75, (arc_width, tip_width)
assert tip_width > arc_width * 0.30, (arc_width, tip_width)
# and the shell really closes down to that width instead of ending full width
assert tip_spread < arc_width * 0.80, (tip_spread, arc_width)

# 12  a gentle but visible roll, one guide curve only
twist_degrees = TAIL["pico_module_twist_degrees"]
assert 100.0 < abs(twist_degrees) < 200.0, twist_degrees
assert hair["pico_twist_degrees"] == twist_degrees

# 15  one dark carrier running through fitting and band as one structure
carrier = bpy.data.objects["HeadModule.Tail.InnerCarrier"]
assert carrier["pico_spans_root_and_hair"] is True
assert carrier.data.materials[0].name == "PICO_ZONE_trim"

# 16-17  the status edge is separate geometry on the shared status material
accent = bpy.data.objects["Status.HeadAccent.Tail"]
status_material = accent.data.materials[0]
assert status_material.name == "PICO_ZONE_status_emitters"
assert accent["pico_material_zone"] == "status_emitters"
shell_material_names = {
    material.name
    for obj in TAIL.all_objects
    if obj.type == "MESH" and obj.get("pico_material_zone") == "head_module"
    for material in obj.data.materials
}
assert status_material.name not in shell_material_names
for name in (
    "PREVIEW.Eye.open.L", "PREVIEW.Mouth.smile", "Status.ChestCore",
    "Status.Underside", "Status.HoverRing",
):
    assert bpy.data.objects[name].data.materials[0] is status_material, name

# 18  eight PAS segments as flat light-guide joints, never a bead chain
assert TAIL["pico_geometry_segments"] == 8
assert connected_components(hair.data) == 1

# 19  the parting seam stays in the root zone and ends before the band
seam = bpy.data.objects["HeadModule.Tail.PartSeam"]
assert seam["pico_seam_ends_before_band"] is True
seam_points = [
    authored_world_matrix(seam) @ Vector(point.co[:3])
    for spline in seam.data.splines
    for point in spline.bezier_points
]
assert min(point.z for point in seam_points) > root_point.z, "seam reaches the band"

print(
    "PICO_HEAD_TAIL_SILHOUETTE="
    f"apex_y={apex_point.y:.4f} hanging_y={hanging_point.y:.4f} "
    f"tip_x={tip_point.x:.4f} tip_y={tip_point.y:.4f} "
    f"band_width={band_width:.4f} fitting_width={fitting_width:.4f} "
    f"fitting_thickness={fitting_thickness:.4f} twist={twist_degrees:.1f}"
)
print(
    "PICO_HEAD_TAIL_FITTING="
    f"min_signed_distance={min(fitting_distances):.4f} "
    f"max_signed_distance={max(fitting_distances):.4f}"
)

# ---------------------------------------------------------------------------
# The authored joint set: head, shoulder, arm and one joint per digit -- and
# no elbow.
# ---------------------------------------------------------------------------

joints = {
    obj.name: obj for obj in bpy.data.objects if obj.get("pico_joint")
}
expected_joints = ["PICO_MOUNT_head"]
for side in ("L", "R"):
    expected_joints += [
        f"PICO_MOUNT_arm.{side}",
        f"PICO_MOUNT_shoulder.{side}",
        f"PICO_MOUNT_thumb.{side}",
    ] + [f"PICO_MOUNT_finger.{side}.{index}" for index in (1, 2, 3)]
assert sorted(joints) == sorted(expected_joints), sorted(joints)
assert not any("Elbow" in name for name in bpy.data.objects.keys()), "an elbow survives"

for side in ("L", "R"):
    shoulder_mount = joints[f"PICO_MOUNT_shoulder.{side}"]
    arm_mount = joints[f"PICO_MOUNT_arm.{side}"]
    assert arm_mount.parent is shoulder_mount, side
    # what each joint owns: the shoulder carries the arm, the arm the palm,
    # and every digit hangs off the palm on a joint of its own.
    assert bpy.data.objects[f"Shell.Arm.{side}"].parent is shoulder_mount, side
    assert bpy.data.objects[f"Trim.Shoulder.{side}"].parent is shoulder_mount, side
    assert bpy.data.objects[f"Trim.Hand.{side}"].parent is arm_mount, side
    for label in [f"finger.{side}.{index}" for index in (1, 2, 3)] + [f"thumb.{side}"]:
        digit_mount = joints[f"PICO_MOUNT_{label}"]
        piece = "Trim." + label.replace("finger", "Finger").replace("thumb", "Thumb")
        assert digit_mount.parent is arm_mount, label
        assert bpy.data.objects[piece].parent is digit_mount, label
        # one joint per digit means exactly one digit per joint.
        assert [child.name for child in digit_mount.children] == [piece], label

# The head is one piece turning on the neck: the pivot height is the top of
# the neck column, not a number that could drift away from it.
head_mount = joints["PICO_MOUNT_head"]
assert head_mount.parent is bpy.data.objects["PICO.CharacterCore.Root"]
assert head_mount["pico_joint_degrees_of_freedom"] == "pitch|yaw|roll"
neck = bpy.data.objects["Trim.Neck"]
neck_top = max((neck.matrix_world @ vertex.co).y for vertex in neck.data.vertices)
assert abs(head_mount.matrix_world.translation.y - neck_top) < 1e-6, (
    head_mount.matrix_world.translation.y, neck_top
)
head_children = {child.name for child in head_mount.children}
for carried in (
    "Shell.Head", "FaceDisplay.Visor", "Trim.VisorFrame",
    "Trim.HeadSideModule.L", "Trim.HeadSideModule.R",
    "Status.HeadSideCap.L", "Status.HeadSideCap.R",
    "PICO_MOUNT_head_module",
):
    assert carried in head_children, carried
# every drawn face shape turns with the head, or the face would stay behind.
faces = [
    obj.name for obj in bpy.data.objects
    if obj.name.startswith(("PREVIEW.Eye.", "PREVIEW.Mouth."))
]
assert faces, "no face shapes to check"
assert set(faces) <= head_children, sorted(set(faces) - head_children)
# what the head turns against stays with the body.
for standing in ("Trim.Neck", "Shell.Torso", "Status.ChestCore",
                 "PICO_MOUNT_shoulder.L", "PICO_MOUNT_shoulder.R"):
    assert standing not in head_children, standing

# A mount only means something if turning it turns what hangs off it.
def evaluated_centre(name):
    evaluated = bpy.data.objects[name].evaluated_get(
        bpy.context.evaluated_depsgraph_get()
    )
    matrix = evaluated.matrix_world
    points = [matrix @ vertex.co for vertex in evaluated.data.vertices]
    return sum(points, Vector()) / len(points)


rest_arm = evaluated_centre("Shell.Arm.L")
rest_hand = evaluated_centre("Trim.Hand.L")
joints["PICO_MOUNT_shoulder.L"].rotation_euler = (0.0, 0.0, 0.35)
bpy.context.view_layer.update()
assert (evaluated_centre("Shell.Arm.L") - rest_arm).length > 0.01
assert (evaluated_centre("Trim.Hand.L") - rest_hand).length > 0.01
joints["PICO_MOUNT_shoulder.L"].rotation_euler = (0.0, 0.0, 0.0)
bpy.context.view_layer.update()
joints["PICO_MOUNT_arm.L"].rotation_euler = (0.0, 0.0, 0.45)
bpy.context.view_layer.update()
assert (evaluated_centre("Shell.Arm.L") - rest_arm).length < 0.001, "arm follows its own joint"
assert (evaluated_centre("Trim.Hand.L") - rest_hand).length > 0.01
joints["PICO_MOUNT_arm.L"].rotation_euler = (0.0, 0.0, 0.0)
bpy.context.view_layer.update()

# A digit joint moves its own digit and leaves its neighbours standing.
# A centroid is blind to turning a part about its own axis of symmetry -- the
# head yaws a long way while its centre of mass stays put. Compare the vertex
# clouds instead and take the largest displacement any point suffers.
def evaluated_points(name):
    evaluated = bpy.data.objects[name].evaluated_get(
        bpy.context.evaluated_depsgraph_get()
    )
    matrix = evaluated.matrix_world
    return [matrix @ vertex.co for vertex in evaluated.data.vertices]


def max_shift(name, rest):
    return max(
        (point - reference).length
        for point, reference in zip(evaluated_points(name), rest[name])
    )


left_digits = [
    ("PICO_MOUNT_finger.L.1", "Trim.Finger.L.1"),
    ("PICO_MOUNT_finger.L.2", "Trim.Finger.L.2"),
    ("PICO_MOUNT_finger.L.3", "Trim.Finger.L.3"),
    ("PICO_MOUNT_thumb.L", "Trim.Thumb.L"),
]
rest_digits = {piece: evaluated_points(piece) for _, piece in left_digits}
for mount_name, turned in left_digits:
    # not `mount`: that name already holds the head-module mount the identity
    # selector is checked against further down.
    digit_joint = joints[mount_name]
    digit_joint.rotation_euler = (0.0, 0.0, 0.5)
    bpy.context.view_layer.update()
    for name in rest_digits:
        moved = max_shift(name, rest_digits)
        if name == turned:
            assert moved > 0.005, f"{turned} does not follow its own joint ({moved:.5f})"
        else:
            assert moved < 1e-6, f"{turned} drags {name} ({moved:.5f})"
    digit_joint.rotation_euler = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()

# Nod, turn and side tilt: each axis moves the whole head and leaves the body.
carried_by_head = ("Shell.Head", "FaceDisplay.Visor", "PREVIEW.Eye.open.L")
standing_still = ("Shell.Torso", "Trim.Neck")
rest_head = {
    name: evaluated_points(name) for name in carried_by_head + standing_still
}
for axis, name_of_axis in enumerate(("pitch", "yaw", "roll")):
    head_mount.rotation_euler = tuple(
        0.30 if index == axis else 0.0 for index in range(3)
    )
    bpy.context.view_layer.update()
    for name in carried_by_head:
        moved = max_shift(name, rest_head)
        assert moved > 0.005, f"{name_of_axis}: {name} stays behind ({moved:.5f})"
    for name in standing_still:
        moved = max_shift(name, rest_head)
        assert moved < 1e-6, f"{name_of_axis}: the head drags {name} ({moved:.5f})"
head_mount.rotation_euler = (0.0, 0.0, 0.0)
bpy.context.view_layer.update()

print(
    f"PICO_JOINT_SET={len(joints)} head+shoulder+arm+digits, no elbow, "
    "chain verified"
)

# ---------------------------------------------------------------------------
# The avatar state faces cover exactly the vocabulary the protocol ships.
# ---------------------------------------------------------------------------

PREVIEW = bpy.data.collections["PICO_PREVIEW_ONLY"]
state_faces = [
    record.split(":") for record in PREVIEW["pico_avatar_state_faces"].split("|")
]

# Read the shipped tuple rather than restating it. An earlier pass built faces
# from ADR prose while a closed `as const` list was already exported, and only
# six of eleven names matched; comparing against the source makes that drift
# impossible to repeat rather than merely unlikely.
def repo_root():
    override = os.environ.get("PICO_REPO_ROOT")
    candidates = [override] if override else []
    if bpy.data.filepath:
        here = os.path.dirname(bpy.data.filepath)
        candidates.append(os.path.abspath(os.path.join(here, os.pardir, os.pardir, os.pardir)))
        candidates.append(os.path.abspath(os.path.join(here, os.pardir)))
    candidates.append(os.getcwd())
    for candidate in candidates:
        if candidate and os.path.isfile(
            os.path.join(candidate, "packages", "protocol", "src", "index.ts")
        ):
            return os.path.abspath(candidate)
    raise SystemExit("cannot locate the repository root; set PICO_REPO_ROOT")


PROTOCOL_SOURCE = os.path.join(
    repo_root(), "packages", "protocol", "src", "index.ts"
)
with open(PROTOCOL_SOURCE, "r", encoding="utf-8") as handle:
    protocol_text = handle.read()
declaration = re.search(
    r"export const avatarStates = \[(.*?)\] as const;", protocol_text, re.S
)
assert declaration, "avatarStates not found in @pico/protocol"
shipped_states = re.findall(r"'([a-z_]+)'", declaration.group(1))
assert len(shipped_states) >= 8, shipped_states

assert [state for state, _, _ in state_faces] == shipped_states, (
    [state for state, _, _ in state_faces], shipped_states,
)
for state, eye, mouth in state_faces:
    for side in ("L", "R"):
        assert f"PREVIEW.Eye.{eye}.{side}" in bpy.data.objects, (state, eye, side)
    assert any(
        name.startswith(f"PREVIEW.Mouth.{mouth}") for name in bpy.data.objects.keys()
    ), (state, mouth)
# every pairing is distinct, or two states would draw the same face
pairs = [(eye, mouth) for _, eye, mouth in state_faces]
assert len(set(pairs)) == len(pairs), pairs
print(
    f"PICO_AVATAR_STATE_FACES={len(state_faces)} "
    f"eyes={len({eye for _, eye, _ in state_faces})} "
    f"mouths={len({mouth for _, _, mouth in state_faces})}"
)

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
        ), (identity_index, carrier.name, tuple(carrier.scale), expected_scale)
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
