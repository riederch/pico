"""Build the complete Character feature stub set from one shared core source.

Each of the 28 inventoried visual feature groups becomes an individually
selectable, deliberately simple and machine checkable stub. A stub proves
existence, assignment and one hard boundary. It proves no quality, closes no
refinement item and carries no Character or production approval.

The contract is docs/development/briefs/character-feature-stub-set.md. The
inventory order comes from feature-stub-manifest-v0.json and from nowhere else:
this generator keeps no second list of slugs.

The character core is linked once as a Blender library. Groups 12 to 28 place
instances of it. Groups 1 to 11 do not: the linked core owns a fixed standard
antenna, and nine of those eleven head identities must show no antenna at all,
so they mount on one shared, deliberately translucent head mount proxy instead.
"""

import hashlib
import json
import math
import os
import shutil
import sys

import bpy
from mathutils import Vector


try:
    HERE = os.path.dirname(os.path.abspath(__file__))
except NameError:  # pragma: no cover - only when pasted into the text editor
    HERE = os.path.join(os.getcwd(), "tools", "character-modeling")

REPO_ROOT = os.path.abspath(
    os.environ.get("PICO_REPO_ROOT", os.path.join(HERE, os.pardir, os.pardir))
)
TOOL_DIR = os.path.join(REPO_ROOT, "tools", "character-modeling")
MANIFEST_PATH = os.path.join(TOOL_DIR, "feature-stub-manifest-v0.json")
CORE_BLEND = os.path.join(TOOL_DIR, "prototype", "pico-character-core-v0.blend")

OUTPUT_DIR = "/tmp/pico-character-feature-stubs"
INDIVIDUAL_DIR = os.path.join(OUTPUT_DIR, "individual")
STAGING_CORE = os.path.join(OUTPUT_DIR, "pico-character-core-v0.blend")
STAGING_BLEND = os.path.join(OUTPUT_DIR, "pico-character-feature-stubs-v0.blend")
TIER_STATIC_PNG = os.path.join(OUTPUT_DIR, "tier-static-source.png")

CELL = 3.10
COLUMNS = 4
ISO_SPAN = 3.00
ISO_PIXELS = 512
SHEET_WIDTH = 1600

CORE_COLLECTION = "PICO_CHARACTER_CORE"
STATUS_MATERIAL = "PICO_ZONE_status_emitters"
SHELL_MATERIAL = "PICO_ZONE_shell"
FACE_MATERIAL = "PICO_ZONE_face_display"
TRIM_MATERIAL = "PICO_ZONE_trim"

# Core geometry landmarks, measured from pico-character-core-v0.blend. The core
# is authored with +Y up and +Z forward.
CORE_TOP = 0.562
CORE_BOTTOM = -1.261
CORE_CENTRE_Y = (CORE_TOP + CORE_BOTTOM) / 2.0
CORE_HEAD_HALF = (0.501, 0.395, 0.432)
CORE_VISOR_FRONT = 0.461
CORE_EYE = (0.170, 0.015, 0.470)
CORE_MOUTH_Y = -0.163
CORE_CHEST = (0.0, -0.669, 0.380)
CORE_ANTENNA_SPHERE = (0.0, 0.497, 0.0)
CORE_ANTENNA_STEM_Y = 0.455
CORE_UNDERSIDE = (0.0, -1.095, 0.0)
CORE_HOVER_RING = (0.0, -1.245, 0.0)
CORE_SHOULDER = (0.395, -0.490, 0.0)


def read_manifest():
    with open(MANIFEST_PATH, "r", encoding="utf-8") as handle:
        return json.load(handle)


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


# --------------------------------------------------------------------------
# scene primitives
# --------------------------------------------------------------------------


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(INDIVIDUAL_DIR, exist_ok=True)


def scene_collection(name, parent=None):
    result = bpy.data.collections.new(name)
    (parent.children if parent else bpy.context.scene.collection.children).link(result)
    return result


def move_to_collection(obj, target):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    target.objects.link(obj)
    return obj


def material(
    name,
    colour,
    metallic=0.0,
    roughness=0.35,
    emission=None,
    strength=0.0,
    transmission=0.0,
    alpha=1.0,
):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = (*colour, alpha)
    shader = result.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*colour, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Transmission Weight"].default_value = transmission
    shader.inputs["Alpha"].default_value = alpha
    if emission is not None:
        shader.inputs["Emission Color"].default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = strength
    if alpha < 1.0:
        result.surface_render_method = "DITHERED"
    return result


def tag(obj, roles, subvariant=None):
    roles = [roles] if isinstance(roles, str) else list(roles)
    obj["pico_stub_role"] = roles[0]
    obj["pico_stub_roles"] = "|".join(roles)
    obj["pico_status"] = "diagnostic_stub"
    if subvariant:
        obj["pico_stub_subvariant"] = subvariant
    return obj


def finish(obj, mat, target, roles, subvariant=None):
    if mat is not None:
        obj.data.materials.append(mat)
    if hasattr(obj.data, "polygons"):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    move_to_collection(obj, target)
    return tag(obj, roles, subvariant)


def sphere(name, location, scale, mat, target, roles, subvariant=None, segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    return finish(obj, mat, target, roles, subvariant)


def cube(name, location, scale, mat, target, roles, subvariant=None, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    finish(obj, mat, target, roles, subvariant)
    if bevel > 0.0:
        modifier = obj.modifiers.new("StubBevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    return obj


def cylinder(name, location, radius, depth, mat, target, roles, subvariant=None, axis="Z", vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    if axis == "Y":
        obj.rotation_euler = (math.pi / 2.0, 0.0, 0.0)
    elif axis == "X":
        obj.rotation_euler = (0.0, math.pi / 2.0, 0.0)
    return finish(obj, mat, target, roles, subvariant)


def cone(name, location, radius, depth, mat, target, roles, subvariant=None, axis="Y", vertices=24):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    if axis == "Y":
        obj.rotation_euler = (-math.pi / 2.0, 0.0, 0.0)
    return finish(obj, mat, target, roles, subvariant)


def torus(name, location, major, minor, mat, target, roles, subvariant=None, axis="Z"):
    bpy.ops.mesh.primitive_torus_add(
        location=location, major_radius=major, minor_radius=minor,
        major_segments=32, minor_segments=10,
    )
    obj = bpy.context.object
    obj.name = name
    if axis == "Y":
        obj.rotation_euler = (math.pi / 2.0, 0.0, 0.0)
    return finish(obj, mat, target, roles, subvariant)


def curve_object(name, splines, radius, mat, target, roles, subvariant=None):
    """One object, one bevelled curve, optionally several separate splines."""
    curve = bpy.data.curves.new(f"{name}.Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 3
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    for points in splines:
        spline = curve.splines.new("POLY")
        spline.points.add(len(points) - 1)
        for point, value in zip(spline.points, points):
            point.co = (*value, 1.0)
    obj = bpy.data.objects.new(name, curve)
    target.objects.link(obj)
    curve.materials.append(mat)
    return tag(obj, roles, subvariant)


def tube(name, points, radius, mat, target, roles, subvariant=None):
    return curve_object(name, [points], radius, mat, target, roles, subvariant)


def ribbon(name, points, widths, thickness, mat, target, roles, subvariant=None):
    """A broad closed band whose width lies in the board plane."""
    vertices = []
    faces = []
    for index, point in enumerate(points):
        before = Vector(points[max(0, index - 1)])
        after = Vector(points[min(len(points) - 1, index + 1)])
        tangent = (after - before).normalized()
        width_axis = Vector((-tangent.y, tangent.x, 0.0)).normalized()
        centre = Vector(point)
        half_width = widths[index]
        for z_offset in (-thickness, thickness):
            vertices.append(tuple(centre - width_axis * half_width + Vector((0, 0, z_offset))))
            vertices.append(tuple(centre + width_axis * half_width + Vector((0, 0, z_offset))))
    for index in range(len(points) - 1):
        base = index * 4
        following = base + 4
        faces.extend((
            (base, following, following + 1, base + 1),
            (base + 2, base + 3, following + 3, following + 2),
            (base, base + 2, following + 2, following),
            (base + 1, following + 1, following + 3, base + 3),
        ))
    faces.append((0, 1, 3, 2))
    last = (len(points) - 1) * 4
    faces.append((last, last + 2, last + 3, last + 1))
    mesh = bpy.data.meshes.new(f"{name}.Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    return finish(obj, mat, target, roles, subvariant)


def cubic(start, control_a, control_b, end, count=20):
    result = []
    for index in range(count):
        amount = index / (count - 1)
        inverse = 1.0 - amount
        result.append(tuple(
            inverse ** 3 * Vector(start)
            + 3.0 * inverse ** 2 * amount * Vector(control_a)
            + 3.0 * inverse * amount ** 2 * Vector(control_b)
            + amount ** 3 * Vector(end)
        ))
    return result


def joined(*curves):
    points = []
    for index, values in enumerate(curves):
        points.extend(values if index == 0 else values[1:])
    return points


def label(target, value, location, size=0.085, mat=None, align="CENTER", subvariant=None):
    curve = bpy.data.curves.new(f"Label.{value}", "FONT")
    curve.body = value
    curve.align_x = align
    curve.align_y = "CENTER"
    curve.size = size
    curve.extrude = 0.003
    obj = bpy.data.objects.new(f"Label.{value}", curve)
    obj.location = location
    target.objects.link(obj)
    curve.materials.append(mat or TEXT)
    return tag(obj, "stub_label", subvariant)


# --------------------------------------------------------------------------
# shared sources
# --------------------------------------------------------------------------


def link_character_core():
    shutil.copyfile(CORE_BLEND, STAGING_CORE)
    with bpy.data.libraries.load(STAGING_CORE, link=True) as (source, target):
        if CORE_COLLECTION not in source.collections:
            raise SystemExit(f"{CORE_BLEND} has no collection {CORE_COLLECTION}")
        target.collections = [CORE_COLLECTION]
    linked = [item for item in bpy.data.collections if item.library is not None]
    if len(linked) != 1 or linked[0].name != CORE_COLLECTION:
        raise SystemExit("expected exactly one linked core collection")
    return linked[0]


def linked_material(name):
    found = [item for item in bpy.data.materials if item.name == name and item.library]
    if len(found) != 1:
        raise SystemExit(f"expected exactly one linked material {name}")
    return found[0]


def core_instance(target, name, location, scale, roles=("character_core_instance",), subvariant=None):
    obj = bpy.data.objects.new(name, None)
    obj.instance_type = "COLLECTION"
    obj.instance_collection = LINKED_CORE
    obj.empty_display_size = 0.12
    obj.location = (location[0], location[1] - CORE_CENTRE_Y * scale, location[2] if len(location) > 2 else 0.0)
    obj.scale = (scale, scale, scale)
    target.objects.link(obj)
    tag(obj, list(roles), subvariant)
    obj["pico_core_source_id"] = CORE_SOURCE_ID
    obj["pico_core_source_collection"] = CORE_COLLECTION
    obj["pico_core_scale"] = scale
    return obj


def core_point(instance, point):
    """World position of a core-local point under a placed core instance."""
    scale = instance["pico_core_scale"]
    base = Vector(instance.location)
    return tuple(base + Vector(point) * scale)


def build_head_mount_proxy():
    proxy = bpy.data.collections.new("STUB_SHARED_HEAD_MOUNT_PROXY")
    proxy["pico_status"] = "diagnostic_stub"
    proxy["pico_character_approved"] = False
    proxy["pico_is_character_core"] = False
    proxy["pico_proxy_rule"] = "mount_reference_only; not_core_geometry; not_a_second_head_authority"
    sphere(
        "StubProxy.HeadDome", (0.0, 0.0, 0.0), CORE_HEAD_HALF,
        PROXY_SHELL, proxy, ["head_mount_proxy", "proxy_head_dome"], segments=28, rings=18,
    )
    sphere(
        "StubProxy.VisorHint", (0.0, -0.035, 0.360), (0.347, 0.253, 0.090),
        PROXY_FACE, proxy, ["head_mount_proxy", "proxy_visor_hint"], segments=24, rings=14,
    )
    return proxy


def proxy_instance(target, location, scale=1.0, view="front", subvariant=None):
    obj = bpy.data.objects.new("StubMount.HeadProxy", None)
    obj.instance_type = "COLLECTION"
    obj.instance_collection = HEAD_PROXY
    obj.empty_display_size = 0.1
    obj.location = (location[0], location[1], 0.0)
    obj.scale = (scale, scale, scale)
    if view == "profile":
        obj.rotation_euler = (0.0, math.pi / 2.0, 0.0)
    target.objects.link(obj)
    tag(obj, ["head_mount_proxy"], subvariant)
    obj["pico_proxy_view"] = view
    return obj


def crown_top(location, scale=1.0):
    return location[1] + CORE_HEAD_HALF[1] * scale


# --------------------------------------------------------------------------
# head identity stubs (1 to 11)
# --------------------------------------------------------------------------


def root_plate(target, centre, radius, subvariant=None):
    obj = cylinder(
        "StubHair.RootPlate", (centre[0], centre[1], 0.0), radius, 0.052,
        SHELL, target, ["hair_root_plate"], subvariant, axis="Y", vertices=28,
    )
    obj.scale.z = 0.62
    return obj


def status_edge(target, name, points, target_roles=("status_emitter",), subvariant=None, radius=0.011):
    return tube(name, points, radius, STATUS, target, list(target_roles), subvariant)


def build_01_concept_tail(target, record, centre):
    cx, cy = centre
    head = (cx + 0.42, cy - 0.30)
    proxy_instance(target, head, 1.0, "profile")
    top = crown_top(head)
    root_plate(target, (head[0] - 0.06, top - 0.005), 0.215)
    start = (head[0] - 0.10, top + 0.055, 0.02)
    crest = (cx - 0.06, cy + 0.30, 0.0)
    low = (cx - 0.54, cy - 0.24, -0.01)
    tip = (cx - 0.90, cy + 0.02, 0.02)
    points = joined(
        cubic(start, (head[0] - 0.14, cy + 0.22, 0.02), (cx + 0.10, cy + 0.32, 0.01), crest, 16),
        cubic(crest, (cx - 0.24, cy + 0.28, 0.0), (cx - 0.42, cy + 0.02, -0.01), low, 18),
        cubic(low, (cx - 0.68, cy - 0.36, 0.0), (cx - 0.88, cy - 0.24, 0.02), tip, 12),
    )
    widths = [0.180 * (1.0 - 0.70 * (index / (len(points) - 1)) ** 1.4) for index in range(len(points))]
    ribbon("StubHair.Style3.PersonalBand", points, widths, 0.024, PERSONAL, target, ["personal_translucent_shell"])
    carrier = joined(
        [(head[0] + 0.02, top - 0.02, -0.03)],
        [(x, y, z - 0.036) for x, y, z in points],
    )
    tube("StubHair.Style3.Carrier", carrier, 0.016, TRIM, target, ["mechanical_root_or_spine"])
    edge = []
    for index in range(3, len(points) - 3):
        before = Vector(points[index - 1])
        after = Vector(points[index + 1])
        tangent = (after - before).normalized()
        normal = Vector((-tangent.y, tangent.x, 0.0)).normalized()
        edge.append(tuple(Vector(points[index]) + normal * widths[index] * 0.74 + Vector((0, 0, 0.030))))
    status_edge(target, "StubHair.Style3.StatusEdge", edge)
    label(target, "arc, drop, outward tip", (cx, cy - 0.98, 0.0), 0.072, TEXT_MUTED)


def build_02_raised_crown(target, record, centre):
    cx, cy = centre
    head = (cx + 0.28, cy - 0.30)
    proxy_instance(target, head, 1.0, "profile")
    top = crown_top(head)
    root_plate(target, (head[0] - 0.06, top - 0.01), 0.20)
    bases = ((head[0] - 0.26, top + 0.005), (head[0] - 0.05, top + 0.03), (head[0] + 0.17, top + 0.0))
    tube(
        "StubHair.Style2.Carrier",
        [(bases[0][0], bases[0][1] - 0.02, -0.02), (bases[1][0], bases[1][1] + 0.01, -0.02), (bases[2][0], bases[2][1] - 0.02, -0.02)],
        0.022, TRIM, target, ["mechanical_root_or_spine"],
    )
    blades = (
        ("Rear", bases[0], (bases[0][0] - 0.16, bases[0][1] + 0.26), (bases[0][0] - 0.24, bases[0][1] + 0.44), 0.150),
        ("Centre", bases[1], (bases[1][0] - 0.13, bases[1][1] + 0.38), (bases[1][0] - 0.20, bases[1][1] + 0.66), 0.180),
        ("Front", bases[2], (bases[2][0] - 0.05, bases[2][1] + 0.24), (bases[2][0] - 0.10, bases[2][1] + 0.40), 0.140),
    )
    for name, base, control, tip, width in blades:
        points = []
        widths = []
        for index in range(18):
            amount = index / 17.0
            inverse = 1.0 - amount
            points.append(tuple(
                inverse * inverse * Vector((base[0], base[1], 0.0))
                + 2.0 * inverse * amount * Vector((control[0], control[1], 0.0))
                + amount * amount * Vector((tip[0], tip[1], 0.0))
            ))
            widths.append(width * (1.0 - 0.52 * amount ** 1.7))
        ribbon(
            f"StubHair.Style2.Blade{name}", points, widths, 0.030,
            PERSONAL, target, ["personal_translucent_shell", "crown_blade"],
        )
    status_edge(
        target, "StubHair.Style2.StatusEdge",
        [(bases[0][0] - 0.02, bases[0][1] + 0.02, 0.05), (bases[1][0], bases[1][1] + 0.05, 0.05), (bases[2][0] + 0.02, bases[2][1] + 0.02, 0.05)],
    )
    label(target, "middle blade highest", (cx, cy - 0.98, 0.0), 0.072, TEXT_MUTED)


def build_03_standard_antenna(target, record, centre):
    cx, cy = centre
    head = (cx, cy - 0.24)
    proxy_instance(target, head, 1.05, "front")
    top = crown_top(head, 1.05)
    stem_offset = (CORE_ANTENNA_STEM_Y - CORE_HEAD_HALF[1]) * 1.05
    ball_offset = (CORE_ANTENNA_SPHERE[1] - CORE_HEAD_HALF[1]) * 1.05
    cylinder(
        "StubAntenna.Stem", (head[0], top + stem_offset, 0.0), 0.013, 0.131,
        TRIM, target, ["antenna_stem"], axis="Y", vertices=20,
    )
    sphere(
        "StubAntenna.StatusSphere", (head[0], top + ball_offset, 0.0), (0.068, 0.068, 0.068),
        STATUS, target, ["antenna_status_sphere", "status_emitter"], segments=22, rings=14,
    )
    label(target, "unchanged standard antenna", (cx, cy - 0.98, 0.0), 0.072, TEXT_MUTED)
    label(target, "no hair module", (cx, cy - 1.10, 0.0), 0.065, TEXT_MUTED)


def compact_tuft(target, centre, scale=1.0, seam_offset=None, subvariant=None):
    top = crown_top(centre, scale)
    root_plate(target, (centre[0], top - 0.01 * scale), 0.205 * scale, subvariant)
    tube(
        "StubHair.Compact.Carrier",
        [(centre[0] - 0.20 * scale, top + 0.02 * scale, -0.02), (centre[0], top + 0.05 * scale, -0.02), (centre[0] + 0.20 * scale, top + 0.02 * scale, -0.02)],
        0.020 * scale, TRIM, target, ["mechanical_root_or_spine"], subvariant,
    )
    sphere(
        "StubHair.Compact.Tuft", (centre[0], top + 0.10 * scale, -0.01),
        (0.285 * scale, 0.155 * scale, 0.255 * scale),
        PERSONAL, target, ["personal_translucent_shell"], subvariant, segments=24, rings=14,
    )
    status_edge(
        target, "StubHair.Compact.StatusEdge",
        [(centre[0] - 0.19 * scale, top + 0.01 * scale, 0.14 * scale),
         (centre[0], top + 0.035 * scale, 0.17 * scale),
         (centre[0] + 0.19 * scale, top + 0.01 * scale, 0.14 * scale)],
        subvariant=subvariant, radius=0.010 * scale,
    )
    if seam_offset is not None:
        seam_x = centre[0] + seam_offset * scale
        tube(
            "StubHair.Compact.PartSeam",
            [(seam_x, top + 0.015 * scale, 0.250 * scale),
             (seam_x, top + 0.110 * scale, 0.262 * scale),
             (seam_x, top + 0.205 * scale, 0.175 * scale),
             (seam_x + 0.008 * scale, top + 0.262 * scale, 0.020 * scale)],
            0.026 * scale, TRIM, target, ["part_seam"], subvariant,
        )
    return top


def build_04_compact_unparted(target, record, centre):
    cx, cy = centre
    head = (cx, cy - 0.24)
    proxy_instance(target, head, 1.05, "front")
    compact_tuft(target, head, 1.05)
    label(target, "one shared root, no seam", (cx, cy - 0.98, 0.0), 0.072, TEXT_MUTED)


def build_05_centre_part(target, record, centre):
    cx, cy = centre
    head = (cx, cy - 0.24)
    proxy_instance(target, head, 1.05, "front")
    compact_tuft(target, head, 1.05, seam_offset=0.0)
    label(target, "centre seam inside the root zone", (cx, cy - 0.98, 0.0), 0.068, TEXT_MUTED)


def build_06_side_part(target, record, centre):
    cx, cy = centre
    for name, sign, offset_x in (("left", -1.0, -0.62), ("right", 1.0, 0.62)):
        sub = subvariant_collection(target, record, name)
        head = (cx + offset_x, cy - 0.18)
        proxy_instance(sub, head, 0.74, "front", subvariant=name)
        compact_tuft(sub, head, 0.74, seam_offset=sign * 0.115, subvariant=name)
        label(sub, name, (head[0], cy - 0.80, 0.0), 0.085, TEXT, subvariant=name)
    label(target, "mirrored seam, one module each", (cx, cy - 1.06, 0.0), 0.068, TEXT_MUTED)


def build_07_flat_side_sweep(target, record, centre):
    cx, cy = centre
    head = (cx + 0.14, cy - 0.20)
    proxy_instance(target, head, 1.02, "front")
    top = crown_top(head, 1.02)
    root_plate(target, (head[0], top - 0.01), 0.19)
    # the band has to hug the crown; a floating arc would read as a horn
    points = cubic(
        (head[0] + 0.06, top + 0.010, 0.17),
        (head[0] - 0.16, top + 0.005, 0.18),
        (head[0] - 0.38, top - 0.155, 0.14),
        (head[0] - 0.50, top - 0.355, 0.07),
        24,
    )
    widths = [0.135 * (1.0 - 0.44 * index / 23.0) for index in range(24)]
    ribbon("StubHair.SideSweep.Band", points, widths, 0.020, PERSONAL, target, ["personal_translucent_shell"])
    tube(
        "StubHair.SideSweep.Carrier",
        [(x, y, z - 0.030) for x, y, z in points], 0.014, TRIM, target, ["mechanical_root_or_spine"],
    )
    status_edge(
        target, "StubHair.SideSweep.StatusEdge",
        [(x, y - widths[index] * 0.70, z + 0.026) for index, (x, y, z) in enumerate(points[2:-2], start=2)],
    )
    label(target, "low lateral flow, no horn", (cx, cy - 0.98, 0.0), 0.072, TEXT_MUTED)


def build_08_short_rear_flow(target, record, centre):
    cx, cy = centre
    head = (cx + 0.44, cy - 0.24)
    proxy_instance(target, head, 1.0, "profile")
    top = crown_top(head)
    root_plate(target, (head[0] - 0.10, top - 0.01), 0.18)
    points = cubic(
        (head[0] - 0.12, top + 0.04, 0.02),
        (head[0] - 0.36, top + 0.06, 0.01),
        (head[0] - 0.62, top - 0.20, 0.0),
        (head[0] - 0.86, top - 0.40, 0.0),
        22,
    )
    widths = [0.120 * (1.0 - 0.50 * index / 21.0) for index in range(22)]
    ribbon("StubHair.ShortRear.Band", points, widths, 0.020, PERSONAL, target, ["personal_translucent_shell"])
    tube(
        "StubHair.ShortRear.Carrier",
        [(x, y, z - 0.030) for x, y, z in points], 0.014, TRIM, target, ["mechanical_root_or_spine"],
    )
    status_edge(
        target, "StubHair.ShortRear.StatusEdge",
        [(x, y + widths[index] * 0.72, z + 0.026) for index, (x, y, z) in enumerate(points[2:-2], start=2)],
    )
    label(target, "longer than crown, shorter than tail", (cx, cy - 0.98, 0.0), 0.064, TEXT_MUTED)


def build_09_segment_corridor(target, record, centre):
    cx, cy = centre
    proxy_instance(target, (cx - 1.12, cy + 0.02), 0.42, "profile")
    for row, count in enumerate((3, 9)):
        name = f"segments_{count}"
        sub = subvariant_collection(target, record, name)
        y = cy + 0.42 - row * 0.78
        left, right = cx - 0.58, cx + 1.02
        carrier = [
            (left + (right - left) * index / 24.0, y + 0.05 * math.sin(math.pi * index / 24.0), 0.0)
            for index in range(25)
        ]
        tube(f"StubHair.Segments{count}.Carrier", carrier, 0.026, TRIM, sub, ["mechanical_root_or_spine"], name)
        for index in range(count):
            amount = index / (count - 1)
            x = left + (right - left) * amount
            cube(
                f"StubHair.Segments{count}.Mark{index + 1:02d}",
                (x, y + 0.05 * math.sin(math.pi * amount), 0.03),
                (0.90 * (right - left) / max(count, 3) * 0.5, 0.088, 0.030),
                PERSONAL, sub, ["personal_translucent_shell", "segment_mark"], name, bevel=0.012,
            )
        status_edge(
            sub, f"StubHair.Segments{count}.StatusEdge",
            [(x, y_value - 0.10, 0.05) for x, y_value, _ in carrier[1:-1]],
            subvariant=name, radius=0.009,
        )
        label(sub, f"{count} broad segments", (cx + 0.22, y - 0.27, 0.0), 0.075, TEXT_MUTED, subvariant=name)
    label(target, "one continuous carrier, never a bead chain", (cx, cy - 1.06, 0.0), 0.064, TEXT_MUTED)


def build_10_width_taper(target, record, centre):
    cx, cy = centre
    proxy_instance(target, (cx - 1.12, cy + 0.02), 0.42, "profile")
    for row, (name, start_width) in enumerate((("narrow", 0.052), ("wide", 0.165))):
        sub = subvariant_collection(target, record, name)
        y = cy + 0.42 - row * 0.78
        left, right = cx - 0.56, cx + 1.00
        points = cubic(
            (left, y, 0.0), (left + 0.40, y + 0.16, 0.0), (right - 0.40, y - 0.10, 0.0), (right, y + 0.02, 0.0), 24,
        )
        widths = [start_width * (1.0 - 0.72 * (index / 23.0) ** 1.2) for index in range(24)]
        ribbon(f"StubHair.{name.title()}.Band", points, widths, 0.018, PERSONAL, sub, ["personal_translucent_shell"], name)
        tube(f"StubHair.{name.title()}.Carrier", [(x, y_value, z - 0.026) for x, y_value, z in points], 0.013, TRIM, sub, ["mechanical_root_or_spine"], name)
        sphere(
            f"StubHair.{name.title()}.RoundedTip", points[-1], (widths[-1] * 1.05, widths[-1] * 1.05, 0.020),
            PERSONAL, sub, ["rounded_tip"], name, segments=18, rings=12,
        )
        status_edge(
            sub, f"StubHair.{name.title()}.StatusEdge",
            [(x, y_value + widths[index] * 0.80, z + 0.024) for index, (x, y_value, z) in enumerate(points[1:-1], start=1)],
            subvariant=name, radius=0.008,
        )
        label(sub, f"{name} root, visible taper, closed tip", (cx + 0.20, y - 0.30, 0.0), 0.068, TEXT_MUTED, subvariant=name)
    label(target, "both corridor ends taper", (cx, cy - 1.06, 0.0), 0.064, TEXT_MUTED)


def build_11_twist_curl(target, record, centre):
    cx, cy = centre
    proxy_instance(target, (cx - 1.14, cy + 0.02), 0.40, "profile")
    rows = (
        ("twist", cy + 0.56, [
            cubic((cx - 0.52, cy + 0.56, 0.0), (cx - 0.10, cy + 0.72, 0.0), (cx + 0.34, cy + 0.40, 0.0), (cx + 0.96, cy + 0.60, 0.0), 24)
        ], "one guide, alternating faces"),
        ("curl", cy - 0.06, [
            joined(
                cubic((cx - 0.52, cy + 0.04, 0.0), (cx - 0.02, cy + 0.16, 0.0), (cx + 0.52, cy + 0.10, 0.0), (cx + 0.86, cy - 0.10, 0.0), 18),
                cubic((cx + 0.86, cy - 0.10, 0.0), (cx + 1.06, cy - 0.30, 0.0), (cx + 0.76, cy - 0.44, 0.0), (cx + 0.58, cy - 0.26, 0.0), 12),
            )
        ], "end curl, still one guide"),
        ("side_offset", cy - 0.72, [
            cubic((cx - 0.52, cy - 0.60, 0.0), (cx - 0.14, cy - 0.94, 0.0), (cx + 0.42, cy - 0.52, 0.0), (cx + 0.94, cy - 0.72, 0.0), 24)
        ], "lateral displacement only"),
    )
    for name, _, curves, note in rows:
        sub = subvariant_collection(target, record, name)
        points = curves[0]
        widths = [0.098 * (1.0 - 0.52 * index / (len(points) - 1)) for index in range(len(points))]
        ribbon(f"StubHair.{name}.Band", points, widths, 0.016, PERSONAL, sub, ["personal_translucent_shell"], name)
        tube(f"StubHair.{name}.Carrier", [(x, y, z - 0.024) for x, y, z in points], 0.012, TRIM, sub, ["mechanical_root_or_spine"], name)
        status_edge(
            sub, f"StubHair.{name}.StatusEdge",
            [(x, y + widths[index] * 0.78, z + 0.022) for index, (x, y, z) in enumerate(points[1:-1], start=1)],
            subvariant=name, radius=0.007,
        )
        label(sub, f"{name}: {note}", (cx + 0.20, points[0][1] - 0.24, 0.0), 0.062, TEXT_MUTED, subvariant=name)


# --------------------------------------------------------------------------
# character, state and presentation stubs (12 to 19)
# --------------------------------------------------------------------------


def region(obj, name):
    """Name one of the six status regions on the object that shows it."""
    obj["pico_status_region"] = name
    return obj


def swatch(target, name, centre, size, mat, roles, text, subvariant=None):
    cube(name, (centre[0], centre[1], 0.0), (size[0], size[1], 0.022), mat, target, list(roles), subvariant, bevel=0.02)
    label(target, text, (centre[0] + size[0] + 0.08, centre[1], 0.02), 0.070, TEXT_MUTED, align="LEFT", subvariant=subvariant)


def build_12_character_core(target, record, centre):
    cx, cy = centre
    core_instance(target, "StubCore.Reference", (cx, cy), 1.08)
    label(target, "one linked source: PICO_CHARACTER_CORE", (cx, cy - 1.14, 0.0), 0.066, TEXT_MUTED)


def build_13_material_zones(target, record, centre):
    cx, cy = centre
    core_instance(target, "StubZones.CoreInstance", (cx - 0.78, cy), 0.76)
    target["pico_surface_controls"] = record["surface_controls"]
    zones = (
        ("Shell", SHELL, "shell"),
        ("FaceDisplay", FACE, "face display"),
        ("Trim", TRIM, "trim"),
        ("Status", STATUS, "status"),
        ("HeadModule", PERSONAL, "head module"),
    )
    for index, (name, mat, text) in enumerate(zones):
        swatch(target, f"StubZone.{name}", (cx + 0.18, cy + 0.78 - index * 0.235), (0.13, 0.075), mat, ["zone_swatch"], text)
    endpoints = (
        ("ShellBright", SHELL, "shell stays bright"),
        ("FaceDark", FACE, "face stays dark"),
        ("TrimMatt", TRIM, "trim never emits"),
    )
    for index, (name, mat, text) in enumerate(endpoints):
        swatch(target, f"StubZoneEndpoint.{name}", (cx + 0.18, cy - 0.42 - index * 0.205), (0.09, 0.052), mat, ["zone_endpoint_swatch"], text)
    label(target, "five zones, three endpoint statements", (cx, cy - 1.16, 0.0), 0.064, TEXT_MUTED)


def build_14_status_light_group(target, record, centre):
    cx, cy = centre
    instance = core_instance(target, "StubStatus.CoreInstance", (cx - 0.36, cy), 1.02)
    target["pico_status_group_rule"] = record["status_group_rule"]
    target["pico_status_regions"] = "|".join(record["status_regions"])
    scale = instance["pico_core_scale"]
    eye_left = core_point(instance, (-CORE_EYE[0], CORE_EYE[1], CORE_EYE[2] + 0.02))
    eye_right = core_point(instance, (CORE_EYE[0], CORE_EYE[1], CORE_EYE[2] + 0.02))
    region(curve_object(
        "StubStatus.Eyes",
        [
            [(eye_left[0] - 0.045 * scale, eye_left[1], eye_left[2]), (eye_left[0] + 0.045 * scale, eye_left[1], eye_left[2])],
            [(eye_right[0] - 0.045 * scale, eye_right[1], eye_right[2]), (eye_right[0] + 0.045 * scale, eye_right[1], eye_right[2])],
        ],
        0.026 * scale, STATUS, target, ["status_region", "status_emitter"],
    ), "eyes")
    mouth = core_point(instance, (0.0, CORE_MOUTH_Y, CORE_VISOR_FRONT + 0.03))
    region(curve_object(
        "StubStatus.MouthLine",
        [[(mouth[0] - 0.070 * scale, mouth[1], mouth[2]), (mouth[0], mouth[1] - 0.014 * scale, mouth[2]), (mouth[0] + 0.070 * scale, mouth[1], mouth[2])]],
        0.016 * scale, STATUS, target, ["status_region", "status_emitter"],
    ), "mouth")
    chest = core_point(instance, (CORE_CHEST[0], CORE_CHEST[1], CORE_CHEST[2] + 0.03))
    region(cylinder("StubStatus.ChestCore", chest, 0.108 * scale, 0.020, STATUS, target, ["status_region", "status_emitter"], vertices=28), "chest_core")
    accent = core_point(instance, CORE_ANTENNA_SPHERE)
    region(torus("StubStatus.HeadAccent", accent, 0.088 * scale, 0.018 * scale, STATUS, target, ["status_region", "status_emitter"], axis="Y"), "head_accent")
    underside = core_point(instance, (CORE_UNDERSIDE[0], CORE_UNDERSIDE[1] - 0.02, CORE_UNDERSIDE[2]))
    region(sphere("StubStatus.UndersideGlow", underside, (0.115 * scale, 0.040 * scale, 0.090 * scale), STATUS, target, ["status_region", "status_emitter"], segments=22, rings=12), "underside_glow")
    hover = core_point(instance, CORE_HOVER_RING)
    region(torus("StubStatus.HoverRing", hover, 0.400 * scale, 0.026 * scale, STATUS, target, ["status_region", "status_emitter"], axis="Y"), "hover_ring")
    for index, text in enumerate(record["status_regions"]):
        label(target, text.replace("_", " "), (cx + 0.66, cy + 0.66 - index * 0.195, 0.0), 0.068, TEXT_MUTED, align="LEFT")
    label(target, "six regions, exactly one status material", (cx, cy - 1.16, 0.0), 0.064, TEXT_MUTED)


EYE_KINDS = {
    "level": ("bar", 0.038, 0.013, 0.0),
    "wide": ("disc", 0.030, 0.030, 0.0),
    "narrow": ("bar", 0.038, 0.007, 0.0),
    "up": ("bar", 0.036, 0.011, 0.30),
    "half": ("bar", 0.032, 0.009, 0.0),
    "angle": ("bar", 0.038, 0.012, -0.42),
    "square": ("square", 0.024, 0.024, 0.0),
    "dim": ("bar", 0.020, 0.006, 0.0),
}


def state_eye(sub, name, centre, kind, sign, subvariant):
    style, width, height, tilt = EYE_KINDS.get(kind, EYE_KINDS["level"])
    location = (centre[0] + sign * 0.082, centre[1] + 0.052, 0.030)
    if kind == "cross":
        return curve_object(
            f"{name}.Eye", [
                [(location[0] - 0.026, location[1] - 0.026, location[2]), (location[0] + 0.026, location[1] + 0.026, location[2])],
                [(location[0] - 0.026, location[1] + 0.026, location[2]), (location[0] + 0.026, location[1] - 0.026, location[2])],
            ], 0.008, STATUS, sub, ["state_eye"], subvariant,
        )
    if kind == "arc_up":
        return curve_object(
            f"{name}.Eye", [[
                (location[0] - 0.034, location[1] - 0.012, location[2]),
                (location[0], location[1] + 0.020, location[2]),
                (location[0] + 0.034, location[1] - 0.012, location[2]),
            ]], 0.008, STATUS, sub, ["state_eye"], subvariant,
        )
    if style == "disc":
        return sphere(f"{name}.Eye", location, (width, height, 0.012), STATUS, sub, ["state_eye"], subvariant, segments=16, rings=10)
    obj = cube(f"{name}.Eye", location, (width, height, 0.010), STATUS, sub, ["state_eye"], subvariant, bevel=0.004)
    if tilt:
        obj.rotation_euler = (0.0, 0.0, tilt * sign)
    return obj


def state_mouth(sub, name, centre, kind, subvariant):
    base = (centre[0], centre[1] - 0.070, 0.030)
    if kind == "dots3":
        for index, offset in enumerate((-0.040, 0.0, 0.040)):
            sphere(f"{name}.Mouth{index + 1}", (base[0] + offset, base[1], base[2]), (0.011, 0.011, 0.010), STATUS, sub, ["state_mouth"], subvariant, segments=12, rings=8)
        return
    if kind == "open":
        sphere(f"{name}.Mouth", base, (0.036, 0.030, 0.012), STATUS, sub, ["state_mouth"], subvariant, segments=18, rings=12)
        return
    if kind == "arc_up":
        curve_object(f"{name}.Mouth", [[(base[0] - 0.048, base[1] + 0.012, base[2]), (base[0], base[1] - 0.020, base[2]), (base[0] + 0.048, base[1] + 0.012, base[2])]], 0.009, STATUS, sub, ["state_mouth"], subvariant)
        return
    if kind == "arc_down":
        curve_object(f"{name}.Mouth", [[(base[0] - 0.048, base[1] - 0.016, base[2]), (base[0], base[1] + 0.018, base[2]), (base[0] + 0.048, base[1] - 0.016, base[2])]], 0.009, STATUS, sub, ["state_mouth"], subvariant)
        return
    if kind == "slash":
        obj = cube(f"{name}.Mouth", base, (0.058, 0.009, 0.010), STATUS, sub, ["state_mouth"], subvariant, bevel=0.003)
        obj.rotation_euler = (0.0, 0.0, -0.55)
        return
    widths = {"flat": 0.036, "small": 0.018, "dash": 0.056, "line": 0.062, "tiny": 0.012}
    cube(f"{name}.Mouth", base, (widths.get(kind, 0.036), 0.009, 0.010), STATUS, sub, ["state_mouth"], subvariant, bevel=0.003)


STATE_FACES = {
    "idle": ("level", "flat"),
    "listening": ("wide", "small"),
    "thinking": ("up", "dots3"),
    "speaking": ("level", "open"),
    "waiting": ("half", "small"),
    "executing": ("narrow", "dash"),
    "warning": ("angle", "flat"),
    "blocked": ("square", "slash"),
    "error": ("cross", "arc_down"),
    "success": ("arc_up", "arc_up"),
    "offline": ("dim", "tiny"),
}


def build_15_face_and_avatar_states(target, record, centre):
    cx, cy = centre
    core_instance(target, "StubStates.CoreInstance", (cx - 1.08, cy - 0.10), 0.44)
    target["pico_avatar_states"] = "|".join(record["avatar_states"])
    target["pico_state_colour_rule"] = "shape_and_label_carry_the_state; runtime_status_colour_not_asserted"
    columns = (-0.36, 0.12, 0.60, 1.08)
    rows = (0.80, 0.16, -0.48)
    for index, state in enumerate(record["avatar_states"]):
        sub = subvariant_collection(target, record, state)
        position = (columns[index % 4], rows[index // 4])
        card_centre = (cx + position[0], cy + position[1])
        cube(
            f"StubState.{state}.Card", (card_centre[0], card_centre[1], 0.0), (0.205, 0.180, 0.016),
            CARD_FACE, sub, ["state_card"], state, bevel=0.028,
        )
        eye_kind, mouth_kind = STATE_FACES[state]
        sub["pico_state_face"] = f"{eye_kind}/{mouth_kind}"
        for sign in (-1.0, 1.0):
            state_eye(sub, f"StubState.{state}", card_centre, eye_kind, sign, state)
        state_mouth(sub, f"StubState.{state}", card_centre, mouth_kind, state)
        label(sub, state, (card_centre[0], card_centre[1] - 0.225, 0.02), 0.058, TEXT_MUTED, subvariant=state)
    label(target, "runtime drawing in front of one unchanged core mesh", (cx, cy - 1.20, 0.0), 0.062, TEXT_MUTED)


def build_16_pose_set(target, record, centre):
    cx, cy = centre
    layout = ((-0.92, "neutral"), (0.0, "interacting"), (0.92, "open"))
    arms = {item["name"]: item["arms"] for item in record["subvariants"]}
    for offset, name in layout:
        sub = subvariant_collection(target, record, name)
        sub["pico_pose_arms"] = arms[name]
        sub["pico_pose_source"] = CORE_SOURCE_ID
        instance = core_instance(sub, f"StubPose.{name}.CoreInstance", (cx + offset, cy + 0.12), 0.56, subvariant=name)
        scale = instance["pico_core_scale"]
        for sign in (-1.0, 1.0):
            shoulder = core_point(instance, (sign * CORE_SHOULDER[0], CORE_SHOULDER[1], 0.34))
            if name == "neutral":
                path = [shoulder, (shoulder[0] + sign * 0.03, shoulder[1] - 0.20 * scale, shoulder[2]), (shoulder[0] + sign * 0.05, shoulder[1] - 0.40 * scale, shoulder[2])]
            elif name == "interacting" and sign > 0:
                path = [shoulder, (shoulder[0] + 0.14 * scale, shoulder[1] - 0.26 * scale, shoulder[2]), (shoulder[0] - 0.16 * scale, shoulder[1] - 0.28 * scale, shoulder[2] + 0.10)]
            elif name == "interacting":
                path = [shoulder, (shoulder[0] - 0.03, shoulder[1] - 0.20 * scale, shoulder[2]), (shoulder[0] - 0.05, shoulder[1] - 0.40 * scale, shoulder[2])]
            else:
                path = [shoulder, (shoulder[0] + sign * 0.30 * scale, shoulder[1] - 0.18 * scale, shoulder[2]), (shoulder[0] + sign * 0.52 * scale, shoulder[1] + 0.06 * scale, shoulder[2])]
            tube(f"StubPose.{name}.ArmIndicator.{'R' if sign > 0 else 'L'}", path, 0.030 * scale, POSE, sub, ["pose_indicator"], name)
        label(sub, name, (cx + offset, cy - 0.86, 0.0), 0.078, TEXT, subvariant=name)
        label(sub, arms[name].replace("_", " "), (cx + offset, cy - 0.99, 0.0), 0.052, TEXT_MUTED, subvariant=name)
    label(target, f"source: {CORE_COLLECTION}", (cx, cy - 1.18, 0.0), 0.062, TEXT_MUTED)


def build_17_origin_light(target, record, centre):
    cx, cy = centre
    for offset, name in ((-0.62, "off"), (0.62, "on")):
        sub = subvariant_collection(target, record, name)
        instance = core_instance(sub, f"StubOrigin.{name}.CoreInstance", (cx + offset, cy + 0.10), 0.70, subvariant=name)
        if name == "on":
            glint = core_point(instance, (0.0, CORE_CHEST[1] + 0.235, CORE_CHEST[2] + 0.010))
            sphere("StubOrigin.Glint", glint, (0.034, 0.034, 0.026), ORIGIN, sub, ["origin_glint"], name, segments=18, rings=12)
        label(sub, name, (cx + offset, cy - 0.86, 0.0), 0.082, TEXT, subvariant=name)
    label(target, "one tiny hideable glint, never a badge or a crown", (cx, cy - 1.14, 0.0), 0.060, TEXT_MUTED)


def build_18_presentation_tiers(target, record, centre):
    cx, cy = centre
    target["pico_core_source_id"] = CORE_SOURCE_ID
    static = subvariant_collection(target, record, "static")
    static["pico_core_source_id"] = CORE_SOURCE_ID
    bpy.ops.mesh.primitive_plane_add(location=(cx - 0.92, cy + 0.14, 0.0))
    plane = bpy.context.object
    plane.name = "StubTier.Static.Render"
    plane.scale = (0.36, 0.46, 1.0)
    finish(plane, TIER_STATIC, static, ["tier_static_render"], "static")
    label(static, "static", (cx - 0.92, cy - 0.62, 0.0), 0.078, TEXT, subvariant="static")
    label(static, "one render of the core", (cx - 0.92, cy - 0.75, 0.0), 0.052, TEXT_MUTED, subvariant="static")

    composite = subvariant_collection(target, record, "composite")
    composite["pico_core_source_id"] = CORE_SOURCE_ID
    cube("StubTier.Composite.ShellLayer", (cx - 0.10, cy + 0.06, -0.18), (0.30, 0.40, 0.012), COMPOSITE_SHELL, composite, ["tier_composite_layer"], "composite", bevel=0.05)
    cube("StubTier.Composite.FaceLayer", (cx + 0.02, cy + 0.18, 0.02), (0.22, 0.15, 0.012), COMPOSITE_FACE, composite, ["tier_composite_layer"], "composite", bevel=0.03)
    cube("StubTier.Composite.StatusLayer", (cx + 0.14, cy + 0.30, 0.22), (0.15, 0.10, 0.012), COMPOSITE_STATUS, composite, ["tier_composite_layer"], "composite", bevel=0.02)
    label(composite, "composite", (cx, cy - 0.62, 0.0), 0.078, TEXT, subvariant="composite")
    label(composite, "rough layer decomposition", (cx, cy - 0.75, 0.0), 0.052, TEXT_MUTED, subvariant="composite")

    realtime = subvariant_collection(target, record, "realtime")
    realtime["pico_core_source_id"] = CORE_SOURCE_ID
    core_instance(realtime, "StubTier.Realtime.CoreInstance", (cx + 0.94, cy + 0.14), 0.50, roles=("tier_realtime_instance", "character_core_instance"), subvariant="realtime")
    label(realtime, "realtime", (cx + 0.94, cy - 0.62, 0.0), 0.078, TEXT, subvariant="realtime")
    label(realtime, "the core instance itself", (cx + 0.94, cy - 0.75, 0.0), 0.052, TEXT_MUTED, subvariant="realtime")
    label(target, f"same source id: {CORE_SOURCE_ID}", (cx, cy - 1.18, 0.0), 0.055, TEXT_MUTED)


def build_19_motion(target, record, centre):
    cx, cy = centre
    target["pico_motion_channels"] = "|".join(record["motion_channels"])
    normal = subvariant_collection(target, record, "motion_normal")
    normal["pico_motion_channels"] = "|".join(record["motion_channels"])
    instance = core_instance(normal, "StubMotion.Normal.CoreInstance", (cx - 0.74, cy + 0.10), 0.62, subvariant="motion_normal")
    tag(instance, ["character_core_instance", "motion_actor"], "motion_normal")
    base_y = instance.location.y
    for frame, offset in ((1, 0.0), (16, 0.055), (32, -0.030), (48, 0.0)):
        instance.location.y = base_y + offset
        instance.keyframe_insert(data_path="location", index=1, frame=frame)
    instance.location.y = base_y
    scale = instance["pico_core_scale"]
    for sign in (-1.0, 1.0):
        eye = core_point(instance, (sign * CORE_EYE[0], CORE_EYE[1], CORE_EYE[2] + 0.02))
        blink = cube(
            f"StubMotion.Blink.{'R' if sign > 0 else 'L'}", eye, (0.030 * scale, 0.014 * scale, 0.008),
            STATUS, normal, ["motion_actor", "status_emitter"], "motion_normal", bevel=0.004,
        )
        for frame, value in ((1, 1.0), (18, 1.0), (21, 0.10), (24, 1.0), (48, 1.0)):
            blink.scale.y = 0.014 * scale * value
            blink.keyframe_insert(data_path="scale", index=1, frame=frame)
        blink.scale.y = 0.014 * scale
    crossfade = cylinder(
        "StubMotion.StatusCrossfade", (cx - 0.74, cy - 0.72, 0.10), 0.075, 0.020,
        MOTION_CROSSFADE, normal, ["motion_actor"], "motion_normal", vertices=24,
    )
    emission = MOTION_CROSSFADE.node_tree.nodes["Principled BSDF"].inputs["Emission Color"]
    for frame, colour in ((1, (0.0, 0.30, 0.60)), (24, (0.02, 0.52, 0.30)), (48, (0.0, 0.30, 0.60))):
        emission.default_value = (*colour, 1.0)
        emission.keyframe_insert("default_value", frame=frame)
    emission.default_value = (0.0, 0.30, 0.60, 1.0)
    for index, radius in enumerate((0.30, 0.42, 0.54)):
        curve_object(
            f"StubMotion.HoverTrail{index + 1}",
            [[(cx - 0.74 + radius * math.cos(angle), cy - 0.44 + radius * 0.34 * math.sin(angle), 0.0)
              for angle in [math.pi + 0.09 * step for step in range(36)]]],
            0.014, GHOST, normal, ["motion_actor"], "motion_normal",
        )
    label(normal, "motion", (cx - 0.74, cy - 0.94, 0.0), 0.078, TEXT, subvariant="motion_normal")
    label(normal, "hover, blink, status crossfade", (cx - 0.74, cy - 1.07, 0.0), 0.052, TEXT_MUTED, subvariant="motion_normal")

    reduced = subvariant_collection(target, record, "reduced_motion")
    reduced["pico_reduced_motion"] = True
    core_instance(reduced, "StubMotion.Reduced.CoreInstance", (cx + 0.74, cy + 0.10), 0.62, subvariant="reduced_motion")
    cylinder(
        "StubMotion.ReducedNote", (cx + 0.74, cy - 0.72, 0.10), 0.075, 0.020,
        MOTION_STATIC, reduced, ["motion_static_note"], "reduced_motion", vertices=24,
    )
    cube(
        "StubMotion.ReducedBaseline", (cx + 0.74, cy - 0.44, 0.0), (0.54, 0.012, 0.012),
        MOTION_STATIC, reduced, ["motion_static_note"], "reduced_motion", bevel=0.004,
    )
    label(reduced, "reduced motion", (cx + 0.74, cy - 0.94, 0.0), 0.078, TEXT, subvariant="reduced_motion")
    label(reduced, "no keyframe, no parallax", (cx + 0.74, cy - 1.07, 0.0), 0.052, TEXT_MUTED, subvariant="reduced_motion")


# --------------------------------------------------------------------------
# context and clothing stubs (20 to 28)
# --------------------------------------------------------------------------


def context_core(target, record, centre, scale=0.70):
    """Every context stub shows the same unchanged core beside its accessory."""
    return core_instance(
        target, f"StubContext.{record['slug']}.CoreInstance",
        (centre[0] - 0.74, centre[1] + 0.06), scale,
    )


def build_20_context_technology(target, record, centre, mat):
    cx, cy = centre
    anchor = (cx + 0.62, cy + 0.14)
    cube("StubContext.Technology.Panel", (anchor[0], anchor[1], 0.0), (0.30, 0.38, 0.035), mat, target, ["context_object"], bevel=0.04)
    for index, offset in enumerate((0.16, 0.0, -0.16)):
        sphere(f"StubContext.Technology.Point{index + 1}", (anchor[0] - 0.14, anchor[1] + offset, 0.06), (0.035, 0.035, 0.020), mat, target, ["context_object"], segments=14, rings=10)
    cube("StubContext.Technology.ToolArm", (anchor[0] + 0.26, anchor[1] - 0.30, 0.0), (0.05, 0.20, 0.035), mat, target, ["context_object"], bevel=0.02)


def build_21_context_water(target, record, centre, mat):
    cx, cy = centre
    anchor = (cx + 0.60, cy + 0.30)
    sphere("StubContext.Water.Droplet", (anchor[0], anchor[1], 0.0), (0.17, 0.17, 0.13), mat, target, ["context_object"], segments=22, rings=14)
    cone("StubContext.Water.DropletTip", (anchor[0], anchor[1] + 0.20, 0.0), 0.13, 0.24, mat, target, ["context_object"], axis="Y", vertices=22)
    cylinder("StubContext.Water.Pipe", (anchor[0], anchor[1] - 0.66, 0.0), 0.10, 0.72, mat, target, ["context_object"], axis="X", vertices=24)
    torus("StubContext.Water.PipeFlange", (anchor[0] + 0.34, anchor[1] - 0.66, 0.0), 0.11, 0.028, mat, target, ["context_object"], axis="Y")


def build_22_context_fire(target, record, centre, mat):
    cx, cy = centre
    anchor = (cx + 0.60, cy + 0.06)
    dome = sphere("StubContext.Fire.HelmetDome", (anchor[0], anchor[1], 0.0), (0.30, 0.26, 0.26), mat, target, ["context_object"], segments=26, rings=16)
    dome.scale.y = 0.26
    cylinder("StubContext.Fire.HelmetBrim", (anchor[0], anchor[1] - 0.09, 0.0), 0.44, 0.05, mat, target, ["context_object"], axis="Y", vertices=28)
    cube("StubContext.Fire.HelmetCrest", (anchor[0], anchor[1] + 0.14, 0.0), (0.26, 0.055, 0.040), mat, target, ["context_object"], bevel=0.02)
    label(target, "context red, status stays cyan-blue", (cx, cy - 1.05, 0.0), 0.062, TEXT_MUTED)


def build_23_context_organization(target, record, centre, mat):
    cx, cy = centre
    anchor = (cx + 0.60, cy + 0.12)
    cube("StubContext.Organization.Board", (anchor[0], anchor[1], 0.0), (0.28, 0.38, 0.030), mat, target, ["context_object"], bevel=0.03)
    for index in range(4):
        cube(f"StubContext.Organization.Line{index + 1}", (anchor[0] - 0.04, anchor[1] + 0.20 - index * 0.13, 0.05), (0.18, 0.020, 0.012), mat, target, ["context_object"], bevel=0.006)


def build_24_context_smart_home(target, record, centre, mat):
    cx, cy = centre
    anchor = (cx + 0.60, cy - 0.02)
    cube("StubContext.SmartHome.House", (anchor[0], anchor[1], 0.0), (0.28, 0.24, 0.035), mat, target, ["context_object"], bevel=0.03)
    cone("StubContext.SmartHome.Roof", (anchor[0], anchor[1] + 0.40, 0.0), 0.38, 0.34, mat, target, ["context_object"], axis="Y", vertices=4)
    sphere("StubContext.SmartHome.Sensor", (anchor[0] + 0.42, anchor[1] + 0.28, 0.0), (0.075, 0.075, 0.045), mat, target, ["context_object"], segments=16, rings=10)


def build_25_context_communication(target, record, centre, mat):
    cx, cy = centre
    anchor = (cx + 0.58, cy - 0.30)
    cylinder("StubContext.Communication.Mast", (anchor[0], anchor[1] + 0.34, 0.0), 0.035, 0.86, mat, target, ["context_object"], axis="Y", vertices=18)
    for index, (width, height) in enumerate(((0.24, 0.52), (0.16, 0.70))):
        cube(f"StubContext.Communication.Cross{index + 1}", (anchor[0], anchor[1] + height, 0.0), (width, 0.022, 0.022), mat, target, ["context_object"], bevel=0.008)
    for index, radius in enumerate((0.26, 0.40)):
        curve_object(
            f"StubContext.Communication.Wave{index + 1}",
            [[(anchor[0] + radius * math.cos(angle), anchor[1] + 0.80 + radius * math.sin(angle), 0.0)
              for angle in [0.35 + 0.10 * step for step in range(25)]]],
            0.018, mat, target, ["context_object"],
        )


def build_26_context_energy(target, record, centre, mat):
    cx, cy = centre
    anchor = (cx + 0.60, cy + 0.06)
    cube("StubContext.Energy.Battery", (anchor[0], anchor[1], 0.0), (0.22, 0.34, 0.035), mat, target, ["context_object"], bevel=0.04)
    cube("StubContext.Energy.Terminal", (anchor[0], anchor[1] + 0.40, 0.0), (0.09, 0.06, 0.030), mat, target, ["context_object"], bevel=0.015)
    curve_object(
        "StubContext.Energy.Bolt",
        [[(anchor[0] + 0.06, anchor[1] + 0.20, 0.06), (anchor[0] - 0.06, anchor[1] + 0.02, 0.06), (anchor[0] + 0.05, anchor[1] - 0.02, 0.06), (anchor[0] - 0.05, anchor[1] - 0.22, 0.06)]],
        0.022, mat, target, ["context_object"],
    )
    label(target, "context amber, status stays cyan-blue", (cx, cy - 1.05, 0.0), 0.062, TEXT_MUTED)


def build_27_context_night_focus(target, record, centre, mat):
    cx, cy = centre
    cube("StubContext.Night.Backdrop", (cx, cy + 0.02, -0.62), (1.38, 1.24, 0.020), NIGHT_BACKDROP, target, ["night_backdrop"], bevel=0.05)
    anchor = (cx + 0.62, cy + 0.10)
    cube("StubContext.Night.ReducedPanel", (anchor[0], anchor[1], 0.0), (0.24, 0.30, 0.030), mat, target, ["context_object"], bevel=0.03)
    for index, offset in enumerate((0.10, -0.10)):
        cube(f"StubContext.Night.ReducedLine{index + 1}", (anchor[0], anchor[1] + offset, 0.05), (0.14, 0.016, 0.012), mat, target, ["context_object"], bevel=0.005)
    target["pico_presentation_rule"] = record["presentation_rule"]
    label(target, "presentation only: same core, same identity, same status meaning", (cx, cy - 1.05, 0.0), 0.052, TEXT_MUTED)


def build_28_custom_clothing(target, record, centre):
    cx, cy = centre
    instance = core_instance(target, "StubClothing.CoreInstance", (cx - 0.06, cy + 0.06), 0.86)
    scale = instance["pico_core_scale"]
    target["pico_fallback_rule"] = record["fallback_rule"]
    body = core_point(instance, (0.0, -0.760, 0.0))
    cube(
        "StubClothing.WorkwearBody", (body[0], body[1], 0.0),
        (0.362 * scale, 0.290 * scale, 0.300 * scale),
        CLOTH_PRIMARY, target, ["clothing_overlay"], bevel=0.05,
    )
    yoke = core_point(instance, (0.0, -0.470, 0.0))
    cube(
        "StubClothing.WorkwearYoke", (yoke[0], yoke[1], 0.0),
        (0.375 * scale, 0.075 * scale, 0.312 * scale),
        CLOTH_SECONDARY, target, ["clothing_overlay"], bevel=0.03,
    )
    label(target, "overlay only: core, visor, status group and rig remain", (cx, cy - 1.10, 0.0), 0.058, TEXT_MUTED)
    label(target, "two non-emissive colour zones", (cx, cy - 1.22, 0.0), 0.058, TEXT_MUTED)


# --------------------------------------------------------------------------
# assembly
# --------------------------------------------------------------------------


def subvariant_collection(target, record, name):
    result = bpy.data.collections.new(f"SUB_{record['order']:02d}_{name}")
    target.children.link(result)
    result["pico_stub_subvariant"] = name
    result["pico_stub_order"] = record["order"]
    result["pico_stub_slug"] = record["slug"]
    result["pico_status"] = "diagnostic_stub"
    result["pico_character_approved"] = False
    return result


def stub_collection(page, record, cell):
    result = bpy.data.collections.new(f"STUB_{record['order']:02d}_{record['slug']}")
    page.children.link(result)
    result["pico_stub_order"] = record["order"]
    result["pico_stub_slug"] = record["slug"]
    result["pico_stub_kind"] = record["kind"]
    result["pico_status"] = "diagnostic_stub"
    result["pico_character_approved"] = False
    result["pico_stub_complete"] = True
    result["pico_refinement_source"] = "TODO.md#character-feinschliff-nach-low-quality-drafts"
    result["pico_refinement_detail"] = record["todo_section"]
    result["pico_stub_page"] = record["page"]
    result["pico_stub_purpose"] = record["purpose"]
    result["pico_stub_visible_claim"] = record["visible_claim"]
    result["pico_stub_sources"] = "|".join(record["sources"])
    result["pico_stub_cell_x"] = cell[0]
    result["pico_stub_cell_y"] = cell[1]
    if "head_identity" in record:
        result["pico_head_identity"] = record["head_identity"]
    if "context_status_separation" in record:
        result["pico_context_status_separation"] = record["context_status_separation"]
    cube(
        f"StubCard.{record['slug']}", (cell[0], cell[1] - 0.02, -0.78), (1.44, 1.42, 0.020),
        CARD, result, ["stub_card"], bevel=0.09,
    )
    label(result, record["title"], (cell[0], cell[1] - 1.30, -0.74), 0.098, TEXT)
    return result


def page_cells(count):
    rows = math.ceil(count / COLUMNS)
    cells = []
    for index in range(count):
        column = index % COLUMNS
        row = index // COLUMNS
        cells.append((
            (column - (COLUMNS - 1) / 2.0) * CELL,
            ((rows - 1) / 2.0 - row) * CELL,
        ))
    return cells, rows


def area_light(name, location, energy, colour, size, target):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = colour
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    target.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (0.0, 0.0, 0.0)
    return obj


def ortho_camera(name, target):
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    obj = bpy.data.objects.new(name, data)
    target.objects.link(obj)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    return obj


reset_scene()

MANIFEST = read_manifest()
MANIFEST_SHA256 = sha256_of(MANIFEST_PATH)
CORE_SHA256 = sha256_of(CORE_BLEND)
CORE_SOURCE_ID = f"{CORE_COLLECTION}@{CORE_SHA256[:16]}"

LINKED_CORE = link_character_core()

SHELL = linked_material(SHELL_MATERIAL)
FACE = linked_material(FACE_MATERIAL)
TRIM = linked_material(TRIM_MATERIAL)
STATUS = linked_material(STATUS_MATERIAL)

PERSONAL = material("STUB_personal_translucent_shell", (0.30, 0.18, 0.82), roughness=0.16, transmission=0.45, alpha=0.90)
PROXY_SHELL = material("STUB_head_mount_proxy", (0.30, 0.34, 0.42), metallic=0.05, roughness=0.42, alpha=0.34)
PROXY_FACE = material("STUB_head_mount_proxy_visor", (0.02, 0.04, 0.07), metallic=0.05, roughness=0.30, alpha=0.55)
CARD = material("STUB_card", (0.010, 0.028, 0.060), metallic=0.05, roughness=0.45)
CARD_FACE = material("STUB_state_card", (0.006, 0.018, 0.038), metallic=0.05, roughness=0.35)
TEXT = material("STUB_text", (0.72, 0.90, 1.0), roughness=0.30, emission=(0.20, 0.55, 0.85), strength=1.2)
TEXT_MUTED = material("STUB_text_muted", (0.42, 0.60, 0.74), roughness=0.40)
POSE = material("STUB_pose_indicator", (0.62, 0.60, 0.56), metallic=0.10, roughness=0.48)
ORIGIN = material("STUB_origin_glint", (0.85, 0.92, 1.0), roughness=0.10, emission=(0.65, 0.85, 1.0), strength=6.0)
COMPOSITE_SHELL = material("STUB_tier_composite_shell", (0.30, 0.40, 0.52), roughness=0.35, alpha=0.62)
COMPOSITE_FACE = material("STUB_tier_composite_face", (0.04, 0.09, 0.16), roughness=0.30, alpha=0.72)
COMPOSITE_STATUS = material("STUB_tier_composite_status", (0.04, 0.30, 0.52), roughness=0.25, emission=(0.0, 0.30, 0.60), strength=1.4, alpha=0.80)
MOTION_CROSSFADE = material("STUB_motion_status_crossfade", (0.02, 0.10, 0.16), roughness=0.20, emission=(0.0, 0.30, 0.60), strength=3.0)
MOTION_STATIC = material("STUB_motion_static_note", (0.02, 0.10, 0.16), roughness=0.20, emission=(0.0, 0.30, 0.60), strength=3.0)
GHOST = material("STUB_motion_trail", (0.20, 0.52, 0.86), roughness=0.35, emission=(0.10, 0.40, 0.72), strength=1.6, alpha=0.30)
NIGHT_BACKDROP = material("STUB_night_backdrop", (0.004, 0.008, 0.020), roughness=0.65)
CLOTH_PRIMARY = material("STUB_clothing_zone_primary", (0.16, 0.22, 0.30), metallic=0.05, roughness=0.62)
CLOTH_SECONDARY = material("STUB_clothing_zone_secondary", (0.52, 0.34, 0.10), metallic=0.05, roughness=0.58)

TIER_STATIC = material("STUB_tier_static_render", (0.5, 0.5, 0.5), roughness=0.5)
TIER_STATIC_TEX = TIER_STATIC.node_tree.nodes.new("ShaderNodeTexImage")
TIER_STATIC_TEX.location = (-360.0, 0.0)
_static_bsdf = TIER_STATIC.node_tree.nodes["Principled BSDF"]
TIER_STATIC.node_tree.links.new(TIER_STATIC_TEX.outputs["Color"], _static_bsdf.inputs["Base Color"])
TIER_STATIC.node_tree.links.new(TIER_STATIC_TEX.outputs["Color"], _static_bsdf.inputs["Emission Color"])
_static_bsdf.inputs["Emission Strength"].default_value = 1.0

CONTEXT_MATERIALS = {
    record["slug"]: material(
        record["context_material"], tuple(record["context_accent_rgb"]), metallic=0.14, roughness=0.28,
    )
    for record in MANIFEST["stubs"]
    if "context_material" in record
}

HEAD_PROXY = build_head_mount_proxy()

ROOT = scene_collection(MANIFEST["root_collection"])
ROOT["pico_status"] = MANIFEST["status"]
ROOT["pico_character_approved"] = False
ROOT["pico_stub_schema"] = MANIFEST["schema"]
ROOT["pico_stub_count"] = MANIFEST["stub_count"]
ROOT["pico_source_core_collection"] = CORE_COLLECTION
ROOT["pico_source_core_sha256"] = CORE_SHA256
ROOT["pico_source_manifest_sha256"] = MANIFEST_SHA256
ROOT["pico_core_source_id"] = CORE_SOURCE_ID
ROOT["pico_stub_contract"] = MANIFEST["contract"]
ROOT["pico_refinement_source"] = MANIFEST["refinement_source"]

BUILDERS = {
    "hair_style_3_concept_tail": build_01_concept_tail,
    "hair_style_2_raised_crown": build_02_raised_crown,
    "standard_antenna": build_03_standard_antenna,
    "hair_compact_unparted": build_04_compact_unparted,
    "hair_centre_part": build_05_centre_part,
    "hair_side_part": build_06_side_part,
    "hair_flat_side_sweep": build_07_flat_side_sweep,
    "hair_short_rear_flow": build_08_short_rear_flow,
    "hair_segment_corridor": build_09_segment_corridor,
    "hair_width_taper_corridor": build_10_width_taper,
    "hair_twist_curl_asymmetry": build_11_twist_curl,
    "character_core": build_12_character_core,
    "material_zones": build_13_material_zones,
    "status_light_group": build_14_status_light_group,
    "face_and_avatar_states": build_15_face_and_avatar_states,
    "pose_set": build_16_pose_set,
    "origin_light": build_17_origin_light,
    "presentation_tiers": build_18_presentation_tiers,
    "motion_and_reduced_motion": build_19_motion,
    "context_technology": build_20_context_technology,
    "context_water_infrastructure": build_21_context_water,
    "context_fire_department": build_22_context_fire,
    "context_organization": build_23_context_organization,
    "context_smart_home": build_24_context_smart_home,
    "context_communication": build_25_context_communication,
    "context_energy": build_26_context_energy,
    "context_night_focus": build_27_context_night_focus,
    "custom_clothing_fallback": build_28_custom_clothing,
}

PAGES = {}
STUBS = {}
CELLS = {}
PAGE_ROWS = {}
RECORDS = {record["order"]: record for record in MANIFEST["stubs"]}

for page_spec in MANIFEST["pages"]:
    page = scene_collection(page_spec["name"], ROOT)
    page["pico_status"] = MANIFEST["status"]
    page["pico_character_approved"] = False
    page["pico_stub_page_title"] = page_spec["title"]
    PAGES[page_spec["name"]] = page
    cells, rows = page_cells(len(page_spec["orders"]))
    PAGE_ROWS[page_spec["name"]] = rows
    for order, cell in zip(page_spec["orders"], cells):
        record = RECORDS[order]
        if record["page"] != page_spec["name"]:
            raise SystemExit(f"manifest page mismatch for stub {order}")
        target = stub_collection(page, record, cell)
        STUBS[order] = target
        CELLS[order] = cell
        builder = BUILDERS[record["slug"]]
        if record["slug"] in CONTEXT_MATERIALS:
            context_core(target, record, cell)
            builder(target, record, cell, CONTEXT_MATERIALS[record["slug"]])
        else:
            builder(target, record, cell)

if len(STUBS) != MANIFEST["stub_count"]:
    raise SystemExit(f"built {len(STUBS)} stubs, expected {MANIFEST['stub_count']}")

# --------------------------------------------------------------------------
# render rig
# --------------------------------------------------------------------------

RIG = scene_collection("STUB_RENDER_RIG")
ISO_CAMERA = ortho_camera("Camera.StubIsolated", RIG)
BOARD_CAMERA = ortho_camera("Camera.StubBoard", RIG)
BOARD_CAMERA.location = (0.0, 0.0, 22.0)
ISO_LIGHTS = (
    area_light("Stub.Iso.Key", (0.0, 0.0, 0.0), 760.0, (0.82, 0.90, 1.0), 3.0, RIG),
    area_light("Stub.Iso.Fill", (0.0, 0.0, 0.0), 420.0, (0.34, 0.52, 1.0), 3.6, RIG),
    area_light("Stub.Iso.Top", (0.0, 0.0, 0.0), 300.0, (0.90, 0.94, 1.0), 2.4, RIG),
)
ISO_OFFSETS = ((1.20, 1.50, 5.60), (-1.50, -0.95, 4.80), (0.00, 2.05, 3.20))
ISO_ENERGY = tuple(light.data.energy for light in ISO_LIGHTS)
BOARD_LIGHTS = (
    area_light("Stub.Board.Key", (0.0, 4.20, 13.0), 5200.0, (0.82, 0.90, 1.0), 15.0, RIG),
    area_light("Stub.Board.Fill", (-6.50, -3.60, 11.0), 3000.0, (0.34, 0.52, 1.0), 13.0, RIG),
)

scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 48
scene.frame_set(1)
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new("Stub.World")
scene.world.use_nodes = True
BACKGROUND = scene.world.node_tree.nodes["Background"]
BACKGROUND.inputs["Color"].default_value = (0.002, 0.008, 0.020, 1.0)
BACKGROUND.inputs["Strength"].default_value = 0.32
WORLD_STRENGTH = 0.32
scene.view_settings.look = "AgX - Medium High Contrast"


def render_to(path, camera, ortho, res_x, res_y):
    scene.camera = camera
    camera.data.ortho_scale = ortho
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    if not (os.path.exists(path) and os.path.getsize(path) > 0):
        raise SystemExit(f"render produced no file: {path}")


def show_only(order):
    for key, target in STUBS.items():
        target.hide_render = key != order
    for page in PAGES.values():
        page.hide_render = False


def place_iso_lights(cell, factor=1.0):
    for light, offset, energy in zip(ISO_LIGHTS, ISO_OFFSETS, ISO_ENERGY):
        light.location = (cell[0] + offset[0], cell[1] + offset[1], offset[2])
        light.data.energy = energy * factor
        light.hide_render = False


def hide_lights(lights, hidden):
    for light in lights:
        light.hide_render = hidden


# The static presentation tier is a render of the very same core instance, so
# the image has to exist before the stub previews are produced.
hide_lights(BOARD_LIGHTS, True)
for target in STUBS.values():
    target.hide_render = True
TIER_SOURCE = scene_collection("STUB_TIER_STATIC_SOURCE")
TIER_SOURCE_INSTANCE = core_instance(TIER_SOURCE, "StubTier.StaticSource", (0.0, 0.0), 1.0)
ISO_CAMERA.location = (0.0, 0.0, 12.0)
place_iso_lights((0.0, 0.0))
render_to(TIER_STATIC_PNG, ISO_CAMERA, 2.30, 384, 384)
bpy.data.objects.remove(TIER_SOURCE_INSTANCE, do_unlink=True)
bpy.context.scene.collection.children.unlink(TIER_SOURCE)
bpy.data.collections.remove(TIER_SOURCE)

STATIC_IMAGE = bpy.data.images.load(TIER_STATIC_PNG)
STATIC_IMAGE.name = "STUB_tier_static_source"
TIER_STATIC_TEX.image = STATIC_IMAGE
STATIC_IMAGE.pack()

# --------------------------------------------------------------------------
# previews
# --------------------------------------------------------------------------

RENDERED = []
for order in sorted(STUBS):
    record = RECORDS[order]
    cell = CELLS[order]
    show_only(order)
    ISO_CAMERA.location = (cell[0], cell[1], 12.0)
    dim = record["slug"] == "context_night_focus"
    place_iso_lights(cell, 0.30 if dim else 1.0)
    BACKGROUND.inputs["Strength"].default_value = WORLD_STRENGTH * (0.35 if dim else 1.0)
    filename = f"{order:02d}-{record['slug'].replace('_', '-')}.png"
    render_to(os.path.join(INDIVIDUAL_DIR, filename), ISO_CAMERA, ISO_SPAN, ISO_PIXELS, ISO_PIXELS)
    RENDERED.append(filename)
BACKGROUND.inputs["Strength"].default_value = WORLD_STRENGTH

for target in STUBS.values():
    target.hide_render = False
hide_lights(ISO_LIGHTS, True)
hide_lights(BOARD_LIGHTS, False)

SHEETS = []
BOARD_SPAN = COLUMNS * CELL + 0.30
for page_spec in MANIFEST["pages"]:
    for name, page in PAGES.items():
        page.hide_render = name != page_spec["name"]
    rows = PAGE_ROWS[page_spec["name"]]
    height = rows * CELL + 0.20
    render_to(
        os.path.join(OUTPUT_DIR, page_spec["contact_sheet"]), BOARD_CAMERA, BOARD_SPAN,
        SHEET_WIDTH, int(round(SHEET_WIDTH * height / BOARD_SPAN)),
    )
    SHEETS.append(page_spec["contact_sheet"])

for page in PAGES.values():
    page.hide_render = False
hide_lights(ISO_LIGHTS, False)
scene.camera = BOARD_CAMERA

# --------------------------------------------------------------------------
# checkpoint
# --------------------------------------------------------------------------

bpy.ops.wm.save_as_mainfile(filepath=STAGING_BLEND)
bpy.ops.file.make_paths_relative()
LIBRARY = bpy.data.libraries[0]
if not LIBRARY.filepath.startswith("//"):
    LIBRARY.filepath = "//" + os.path.basename(STAGING_CORE)
bpy.ops.wm.save_mainfile()

print(f"PICO_FEATURE_STUB_BLEND={STAGING_BLEND}")
print(f"PICO_FEATURE_STUB_COUNT={len(STUBS)}")
print(f"PICO_FEATURE_STUB_PREVIEWS={len(RENDERED)}")
print(f"PICO_FEATURE_STUB_SHEETS={len(SHEETS)}")
print(f"PICO_FEATURE_STUB_CORE_LIBRARY={LIBRARY.filepath}")
print(f"PICO_FEATURE_STUB_CORE_SHA256={CORE_SHA256}")
print(f"PICO_FEATURE_STUB_MANIFEST_SHA256={MANIFEST_SHA256}")
print("PICO_FEATURE_STUB_STATUS=diagnostic_stub_not_character_approved")
sys.stdout.flush()
sys.stderr.flush()
os._exit(0)
