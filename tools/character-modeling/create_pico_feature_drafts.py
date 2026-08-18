"""Build deliberately rough visual drafts for the open Character features.

The boards are an inventory aid, not a second Character source. Their order
matches the refinement list in TODO.md: concept tail first, raised crown
second, then the remaining ADR-governed visual features.
"""

import math
import os
import sys

import bpy
from mathutils import Vector


OUTPUT_DIR = "/tmp/pico-character-feature-drafts"
BLEND_PATH = os.path.join(OUTPUT_DIR, "pico-character-feature-drafts-v0.blend")

HEAD_FEATURES = (
    (1, "hair_style_3_concept_tail", "01  CONCEPT TAIL"),
    (2, "hair_style_2_raised_crown", "02  RAISED CROWN"),
    (3, "standard_antenna", "03  ANTENNA"),
    (4, "hair_compact_unparted", "04  COMPACT ROOT"),
    (5, "hair_centre_part", "05  CENTRE PART"),
    (6, "hair_side_part", "06  SIDE PART"),
    (7, "hair_flat_side_sweep", "07  FLAT SWEEP"),
    (8, "hair_short_rear_flow", "08  SHORT REAR"),
    (9, "hair_segment_corridor", "09  3 / 9 SEGMENTS"),
    (10, "hair_width_taper_corridor", "10  WIDTH / TAPER"),
    (11, "hair_twist_curl_asymmetry", "11  TWIST / CURL / SIDE"),
)

RUNTIME_FEATURES = (
    (12, "character_core", "12  CHARACTER CORE"),
    (13, "material_zones", "13  FIVE ZONES"),
    (14, "status_light_group", "14  STATUS GROUP"),
    (15, "face_and_avatar_states", "15  FACE / STATES"),
    (16, "pose_set", "16  THREE POSES"),
    (17, "origin_light", "17  ORIGIN GLINT"),
    (18, "presentation_tiers", "18  THREE TIERS"),
    (19, "motion_and_reduced_motion", "19  MOTION / REDUCE"),
)

CONTEXT_FEATURES = (
    (20, "context_technology", "20  TECHNOLOGY"),
    (21, "context_water_infrastructure", "21  WATER"),
    (22, "context_fire_department", "22  FIRE"),
    (23, "context_organization", "23  ORGANISATION"),
    (24, "context_smart_home", "24  SMART HOME"),
    (25, "context_communication", "25  COMMUNICATION"),
    (26, "context_energy", "26  ENERGY"),
    (27, "context_night_focus", "27  NIGHT / FOCUS"),
    (28, "custom_clothing_fallback", "28  CLOTHING FALLBACK"),
)

ALL_FEATURES = HEAD_FEATURES + RUNTIME_FEATURES + CONTEXT_FEATURES


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)


def collection(name, parent=None):
    result = bpy.data.collections.new(name)
    (parent.children if parent else bpy.context.scene.collection.children).link(
        result
    )
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


def apply_material(obj, mat, role=None):
    obj.data.materials.append(mat)
    if role:
        obj["pico_draft_role"] = role
    if hasattr(obj.data, "polygons"):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def sphere(name, location, scale, mat, target, role=None, segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    move_to_collection(obj, target)
    return apply_material(obj, mat, role)


def cube(name, location, scale, mat, target, role=None, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    move_to_collection(obj, target)
    apply_material(obj, mat, role)
    if bevel > 0.0:
        modifier = obj.modifiers.new("DraftBevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    return obj


def cylinder(
    name,
    location,
    radius,
    depth,
    mat,
    target,
    role=None,
    axis="Z",
    vertices=32,
):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    if axis == "Y":
        obj.rotation_euler.x = math.radians(90.0)
    elif axis == "X":
        obj.rotation_euler.y = math.radians(90.0)
    move_to_collection(obj, target)
    return apply_material(obj, mat, role)


def torus(name, location, major_radius, minor_radius, mat, target, role=None):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=40,
        minor_segments=10,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, target)
    return apply_material(obj, mat, role)


def tube(name, points, radius, mat, target, role=None):
    curve = bpy.data.curves.new(f"{name}.Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, value in zip(spline.points, points):
        point.co = (*value, 1.0)
    obj = bpy.data.objects.new(name, curve)
    target.objects.link(obj)
    curve.materials.append(mat)
    if role:
        obj["pico_draft_role"] = role
    return obj


def ribbon(name, points, widths, thickness, mat, target, role=None):
    """Make a broad closed ribbon facing the diagnostic camera."""
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
    faces.extend(((0, 1, 3, 2),))
    last = (len(points) - 1) * 4
    faces.extend(((last, last + 2, last + 3, last + 1),))
    mesh = bpy.data.meshes.new(f"{name}.Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    return apply_material(obj, mat, role)


def cubic(start, control_a, control_b, end, count=25):
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


def joined_curves(*curves):
    points = []
    for index, values in enumerate(curves):
        points.extend(values if index == 0 else values[1:])
    return points


def label(target, value, location, size=0.105, mat=None):
    curve = bpy.data.curves.new(f"Label.{value}", "FONT")
    curve.body = value
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.extrude = 0.004
    obj = bpy.data.objects.new(f"Label.{value}", curve)
    obj.location = location
    target.objects.link(obj)
    curve.materials.append(mat or TEXT)
    return obj


def draft_collection(page, order, slug, title, centre):
    target = collection(f"DRAFT_{order:02d}_{slug}", page)
    target["pico_status"] = "low_quality_draft"
    target["pico_draft_order"] = order
    target["pico_draft_slug"] = slug
    target["pico_refinement_source"] = "TODO.md#character-feinschliff-nach-low-quality-drafts"
    cube(
        f"DraftCard.{slug}",
        (centre[0], centre[1], -0.72),
        (1.22, 1.00, 0.025),
        CARD,
        target,
        "draft_card",
        bevel=0.08,
    )
    label(target, title, (centre[0], centre[1] - 0.84, 0.74), mat=TEXT)
    return target


def head_base(target, centre, scale=1.0, with_status=True):
    cx, cy = centre
    sphere(
        "Draft.HeadShell", (cx, cy, 0.0),
        (0.55 * scale, 0.46 * scale, 0.39 * scale),
        SHELL, target, "shell",
    )
    sphere(
        "Draft.FaceDisplay", (cx, cy - 0.025 * scale, 0.355 * scale),
        (0.405 * scale, 0.285 * scale, 0.055 * scale),
        FACE, target, "face_display",
    )
    if with_status:
        for offset in (-0.155, 0.155):
            sphere(
                "Draft.Status.Eye", (cx + offset * scale, cy + 0.015 * scale, 0.415 * scale),
                (0.045 * scale, 0.075 * scale, 0.018 * scale),
                STATUS, target, "status_emitter", segments=16, rings=12,
            )
        mouth = [(cx - 0.06 * scale, cy - 0.13 * scale, 0.42 * scale),
                 (cx, cy - 0.155 * scale, 0.43 * scale),
                 (cx + 0.06 * scale, cy - 0.13 * scale, 0.42 * scale)]
        tube("Draft.Status.Mouth", mouth, 0.008 * scale, STATUS, target, "status_emitter")
    return cy + 0.46 * scale


def flat_hair_root(target, centre, top, radius=0.13):
    cx, _ = centre
    obj = cylinder(
        "Draft.HairRoot.FlatDisc",
        (cx, top + 0.018, 0.0),
        radius,
        0.045,
        SHELL,
        target,
        "mechanical_root_cover",
        axis="Y",
    )
    obj.scale.z = 0.62
    return obj


def build_concept_tail(target, centre):
    cx, cy = centre
    top = head_base(target, centre)
    flat_hair_root(target, centre, top, 0.15)
    start = (cx + 0.075, top + 0.04, 0.04)
    crest = (cx + 0.39, top + 0.39, 0.015)
    low = (cx + 0.55, cy + 0.02, -0.015)
    tip = (cx + 0.76, cy + 0.20, 0.03)
    points = joined_curves(
        cubic(start, (cx + 0.14, top + 0.30, 0.03), (cx + 0.29, top + 0.43, 0.02), crest, 18),
        cubic(crest, (cx + 0.56, top + 0.30, 0.0), (cx + 0.48, cy + 0.13, -0.01), low, 22),
        cubic(low, (cx + 0.59, cy - 0.03, 0.0), (cx + 0.70, cy + 0.04, 0.02), tip, 12),
    )
    widths = []
    for index in range(len(points)):
        amount = index / (len(points) - 1)
        widths.append(0.13 * (1.0 - 0.64 * amount ** 1.5))
    ribbon(
        "Draft.HairStyle3.PersonalRibbon", points, widths, 0.022,
        HAIR, target, "personal_translucent_shell",
    )
    carrier = [(x, y, z - 0.035) for x, y, z in points]
    tube("Draft.HairStyle3.InnerCarrier", carrier, 0.014, TRIM, target, "mechanical_spine")
    edge = []
    for index, point in enumerate(points[3:-3]):
        amount = (index + 3) / (len(points) - 1)
        before = Vector(points[max(0, index + 2)])
        after = Vector(points[min(len(points) - 1, index + 4)])
        tangent = (after - before).normalized()
        normal = Vector((-tangent.y, tangent.x, 0.0)).normalized()
        edge.append(tuple(Vector(point) + normal * widths[index + 3] * 0.72 + Vector((0, 0, 0.03))))
    tube("Draft.HairStyle3.StatusEdge", edge, 0.008, STATUS, target, "status_emitter")


def leaf(target, name, base, control, tip, width, mat=None):
    mat = mat or HAIR
    points = []
    widths = []
    for index in range(18):
        amount = index / 17.0
        inverse = 1.0 - amount
        points.append(tuple(
            inverse * inverse * Vector(base)
            + 2.0 * inverse * amount * Vector(control)
            + amount * amount * Vector(tip)
        ))
        widths.append(width * math.sin(math.pi * amount) ** 0.65 + 0.012)
    return ribbon(name, points, widths, 0.018, mat, target, "personal_translucent_shell")


def build_raised_crown(target, centre):
    cx, _ = centre
    top = head_base(target, centre)
    flat_hair_root(target, centre, top, 0.16)
    leaf(target, "Draft.HairStyle2.Centre", (cx, top, 0.02), (cx - 0.03, top + 0.30, 0.02), (cx + 0.11, top + 0.49, 0.02), 0.105)
    leaf(target, "Draft.HairStyle2.Left", (cx - 0.08, top - 0.01, 0.01), (cx - 0.20, top + 0.20, 0.01), (cx - 0.14, top + 0.36, 0.01), 0.085)
    leaf(target, "Draft.HairStyle2.Rear", (cx + 0.08, top - 0.01, 0.0), (cx + 0.22, top + 0.16, 0.0), (cx + 0.27, top + 0.31, 0.0), 0.075)


def build_antenna(target, centre):
    cx, _ = centre
    top = head_base(target, centre)
    cylinder("Draft.Antenna.Stem", (cx, top + 0.13, 0.0), 0.018, 0.22, TRIM, target, "trim", axis="Y", vertices=20)
    sphere("Draft.Antenna.Status", (cx, top + 0.26, 0.0), (0.075, 0.075, 0.06), STATUS, target, "status_emitter", segments=20, rings=14)


def compact_root(target, centre, seam_offset=None):
    cx, _ = centre
    top = head_base(target, centre)
    flat_hair_root(target, centre, top, 0.17)
    sphere("Draft.Hair.CompactRoot", (cx, top + 0.12, -0.01), (0.23, 0.16, 0.10), HAIR, target, "personal_translucent_shell")
    if seam_offset is not None:
        seam_x = cx + seam_offset
        tube(
            "Draft.Hair.PartSeam",
            [(seam_x, top + 0.03, 0.12), (seam_x, top + 0.13, 0.13), (seam_x + 0.02, top + 0.23, 0.10)],
            0.009, TRIM, target, "part_seam",
        )


def simple_swept_hair(target, centre, long=False):
    cx, cy = centre
    top = head_base(target, centre)
    flat_hair_root(target, centre, top, 0.14)
    end_x = cx + (0.62 if long else 0.43)
    end_y = cy + (0.10 if long else 0.32)
    points = cubic(
        (cx, top + 0.02, 0.02),
        (cx + 0.14, top + (0.10 if long else 0.03), 0.01),
        (end_x - 0.10, end_y + 0.12, 0.0),
        (end_x, end_y, 0.0),
        28,
    )
    widths = [0.105 * (1.0 - 0.58 * index / 27.0) for index in range(28)]
    ribbon("Draft.Hair.SweptRibbon", points, widths, 0.02, HAIR, target, "personal_translucent_shell")


def mini_ribbon(target, name, start, end, width_start, width_end, bends=0.0):
    points = cubic(
        start,
        (start[0] + (end[0] - start[0]) * 0.30, start[1] + bends, start[2]),
        (start[0] + (end[0] - start[0]) * 0.70, end[1] - bends, end[2]),
        end,
        18,
    )
    widths = [width_start + (width_end - width_start) * i / 17.0 for i in range(18)]
    return ribbon(name, points, widths, 0.014, HAIR, target, "personal_translucent_shell")


def build_segment_corridor(target, centre):
    cx, cy = centre
    for row, segments in enumerate((3, 9)):
        y = cy + 0.34 - row * 0.55
        points = [(cx - 0.66 + i * 1.32 / (segments - 1), y + 0.05 * math.sin(i), 0.05) for i in range(segments)]
        tube(f"Draft.Hair.Segments{segments}.Carrier", points, 0.025, TRIM, target, "mechanical_spine")
        for index, point in enumerate(points):
            sphere(f"Draft.Hair.Segments{segments}.{index + 1}", point, (0.075, 0.115, 0.04), HAIR, target, "segment_lamella", segments=16, rings=10)
        label(target, f"{segments} broad segments", (cx, y - 0.22, 0.72), 0.085, TEXT_MUTED)


def build_width_taper(target, centre):
    cx, cy = centre
    mini_ribbon(target, "Draft.Hair.MinimumWidth", (cx - 0.72, cy + 0.28, 0.05), (cx + 0.72, cy + 0.28, 0.05), 0.045, 0.025, 0.06)
    mini_ribbon(target, "Draft.Hair.MaximumWidth", (cx - 0.72, cy - 0.22, 0.05), (cx + 0.72, cy - 0.22, 0.05), 0.16, 0.035, -0.08)
    label(target, "narrow", (cx - 0.73, cy + 0.52, 0.72), 0.08, TEXT_MUTED)
    label(target, "wide + taper", (cx - 0.60, cy + 0.02, 0.72), 0.08, TEXT_MUTED)


def build_twist_curl(target, centre):
    cx, cy = centre
    mini_ribbon(target, "Draft.Hair.Asymmetric", (cx - 0.78, cy + 0.35, 0.05), (cx - 0.05, cy + 0.12, 0.05), 0.10, 0.06, 0.20)
    mini_ribbon(target, "Draft.Hair.Twist", (cx - 0.15, cy + 0.20, 0.05), (cx + 0.48, cy - 0.05, 0.05), 0.13, 0.045, -0.22)
    curl_points = joined_curves(
        cubic((cx + 0.36, cy + 0.40, 0.05), (cx + 0.78, cy + 0.25, 0.05), (cx + 0.72, cy - 0.35, 0.05), (cx + 0.38, cy - 0.25, 0.05), 20),
        cubic((cx + 0.38, cy - 0.25, 0.05), (cx + 0.20, cy - 0.18, 0.05), (cx + 0.38, cy, 0.05), (cx + 0.50, cy + 0.02, 0.05), 10),
    )
    widths = [0.065 * (1.0 - 0.55 * i / (len(curl_points) - 1)) for i in range(len(curl_points))]
    ribbon("Draft.Hair.Curl", curl_points, widths, 0.014, HAIR, target, "personal_translucent_shell")


def mini_pico(target, centre, scale=1.0, arm_pose="neutral", status_mat=None):
    status_mat = status_mat or STATUS
    cx, cy = centre
    sphere("Draft.Core.Head", (cx, cy + 0.32 * scale, 0), (0.34 * scale, 0.27 * scale, 0.24 * scale), SHELL, target, "shell", segments=20, rings=14)
    sphere("Draft.Core.Face", (cx, cy + 0.31 * scale, 0.22 * scale), (0.245 * scale, 0.16 * scale, 0.035 * scale), FACE, target, "face_display", segments=20, rings=12)
    for offset in (-0.09, 0.09):
        sphere("Draft.Core.Eye", (cx + offset * scale, cy + 0.34 * scale, 0.25 * scale), (0.025 * scale, 0.045 * scale, 0.01 * scale), status_mat, target, "status_emitter", segments=12, rings=8)
    tube(
        "Draft.Core.Mouth",
        [
            (cx - 0.045 * scale, cy + 0.245 * scale, 0.255 * scale),
            (cx, cy + 0.225 * scale, 0.260 * scale),
            (cx + 0.045 * scale, cy + 0.245 * scale, 0.255 * scale),
        ],
        0.006 * scale,
        status_mat,
        target,
        "status_emitter",
    )
    tube(
        "Draft.Core.AntennaStem",
        [
            (cx, cy + 0.56 * scale, 0.02 * scale),
            (cx + 0.035 * scale, cy + 0.73 * scale, 0.02 * scale),
        ],
        0.018 * scale,
        TRIM,
        target,
        "trim",
    )
    sphere(
        "Draft.Core.HeadAccent",
        (cx + 0.040 * scale, cy + 0.76 * scale, 0.02 * scale),
        (0.035 * scale, 0.035 * scale, 0.025 * scale),
        status_mat,
        target,
        "status_emitter",
        segments=12,
        rings=8,
    )
    sphere("Draft.Core.Neck", (cx, cy + 0.02 * scale, 0), (0.14 * scale, 0.06 * scale, 0.12 * scale), TRIM, target, "trim", segments=16, rings=10)
    sphere("Draft.Core.Torso", (cx, cy - 0.26 * scale, 0), (0.27 * scale, 0.35 * scale, 0.22 * scale), SHELL, target, "shell", segments=20, rings=14)
    for offset in (-0.29, 0.29):
        sphere(
            "Draft.Core.SideModule",
            (cx + offset * scale, cy - 0.08 * scale, 0.0),
            (0.055 * scale, 0.12 * scale, 0.06 * scale),
            TRIM,
            target,
            "side_module",
            segments=14,
            rings=8,
        )
    sphere("Draft.Core.Chest", (cx, cy - 0.18 * scale, 0.22 * scale), (0.07 * scale, 0.07 * scale, 0.025 * scale), status_mat, target, "status_emitter", segments=16, rings=10)
    sphere(
        "Draft.Core.UndersideGlow",
        (cx, cy - 0.59 * scale, 0.10 * scale),
        (0.12 * scale, 0.035 * scale, 0.025 * scale),
        status_mat,
        target,
        "status_emitter",
        segments=14,
        rings=8,
    )
    arm_angles = {
        "neutral": ((-0.37, -0.20), (0.37, -0.20)),
        "interacting": ((-0.38, -0.18), (0.40, 0.00)),
        "open": ((-0.45, -0.06), (0.45, -0.06)),
    }
    left, right = arm_angles[arm_pose]
    for side, position in (("L", left), ("R", right)):
        sphere(f"Draft.Core.Arm.{side}", (cx + position[0] * scale, cy + position[1] * scale, 0), (0.09 * scale, 0.19 * scale, 0.08 * scale), SHELL, target, "shell", segments=16, rings=10)
        sphere(f"Draft.Core.Hand.{side}", (cx + position[0] * scale, cy + (position[1] - 0.18) * scale, 0), (0.08 * scale, 0.08 * scale, 0.07 * scale), TRIM, target, "trim", segments=14, rings=8)
    torus("Draft.Core.HoverRing", (cx, cy - 0.70 * scale, 0), 0.23 * scale, 0.018 * scale, status_mat, target, "status_emitter")


def build_character_core(target, centre):
    mini_pico(target, centre, 0.92)


def build_material_zones(target, centre):
    cx, cy = centre
    mats = ((SHELL, "shell"), (FACE, "face"), (TRIM, "trim"), (STATUS, "status"), (HAIR, "head"))
    for index, (mat, name) in enumerate(mats):
        angle = math.radians(90 - index * 45)
        x = cx + math.cos(angle) * 0.55
        y = cy + math.sin(angle) * 0.42
        sphere(f"Draft.Zone.{name}", (x, y, 0.1), (0.16, 0.16, 0.07), mat, target, name, segments=20, rings=12)
        label(target, name, (x, y - 0.24, 0.72), 0.07, TEXT_MUTED)
    target["pico_surface_controls"] = (
        "shell:hue|chroma|lightness|gloss;"
        "face:hue|tint|blackLevel|reflectivity;"
        "trim:hue|chroma|metalness"
    )


def build_status_group(target, centre):
    mini_pico(target, centre, 0.92, status_mat=STATUS)
    target["pico_status_group_rule"] = "eyes|mouth|chest|head_accent|underside|hover_ring_same_colour"


def visor_face(target, centre, eye_kind, mouth_kind, scale=0.36):
    cx, cy = centre
    unit = scale / 0.36
    sphere("Draft.FaceState.Visor", (cx, cy, 0.1), (0.28 * unit, 0.18 * unit, 0.04), FACE, target, "face_display", segments=16, rings=10)
    eye_height = {"open": 0.055, "narrow": 0.025, "closed": 0.008, "wide": 0.070}[eye_kind] * unit
    for offset in (-0.09, 0.09):
        sphere("Draft.FaceState.Eye", (cx + offset * unit, cy + 0.025 * unit, 0.16), (0.022 * unit, eye_height, 0.009), STATUS, target, "status_emitter", segments=10, rings=6)
    mouths = {
        "smile": [(cx - 0.045 * unit, cy - 0.07 * unit, 0.17), (cx, cy - 0.09 * unit, 0.17), (cx + 0.045 * unit, cy - 0.07 * unit, 0.17)],
        "flat": [(cx - 0.045 * unit, cy - 0.08 * unit, 0.17), (cx + 0.045 * unit, cy - 0.08 * unit, 0.17)],
        "open": [(cx - 0.035 * unit, cy - 0.06 * unit, 0.17), (cx, cy - 0.10 * unit, 0.17), (cx + 0.035 * unit, cy - 0.06 * unit, 0.17)],
        "down": [(cx - 0.045 * unit, cy - 0.10 * unit, 0.17), (cx, cy - 0.07 * unit, 0.17), (cx + 0.045 * unit, cy - 0.10 * unit, 0.17)],
    }
    tube("Draft.FaceState.Mouth", mouths[mouth_kind], 0.006 * unit, STATUS, target, "status_emitter")


def build_face_states(target, centre):
    cx, cy = centre
    states = (
        ("idle", "open", "smile"),
        ("listening", "wide", "smile"),
        ("thinking", "narrow", "flat"),
        ("speaking", "open", "open"),
        ("waiting", "open", "flat"),
        ("executing", "narrow", "smile"),
        ("warning", "wide", "flat"),
        ("blocked", "narrow", "down"),
        ("error", "wide", "down"),
        ("success", "closed", "smile"),
        ("offline", "closed", "flat"),
    )
    for index, (name, eyes, mouth) in enumerate(states):
        x = cx - 0.78 + (index % 4) * 0.52
        y = cy + 0.47 - (index // 4) * 0.47
        visor_face(target, (x, y), eyes, mouth, 0.27)
        label(target, name, (x, y - 0.19, 0.72), 0.047, TEXT_MUTED)
    target["pico_avatar_states"] = "|".join(name for name, _, _ in states)


def build_poses(target, centre):
    cx, cy = centre
    for index, pose in enumerate(("neutral", "interacting", "open")):
        x = cx - 0.62 + index * 0.62
        mini_pico(target, (x, cy + 0.12), 0.52, arm_pose=pose)
        label(target, pose, (x, cy - 0.66, 0.72), 0.065, TEXT_MUTED)


def build_origin_light(target, centre):
    mini_pico(target, centre, 0.92)
    cx, cy = centre
    sphere("Draft.OriginLight.Glint", (cx + 0.025, cy - 0.15, 0.31), (0.018, 0.018, 0.009), ORIGIN, target, "decorative_origin_light", segments=12, rings=8)
    tube("Draft.OriginLight.Spark", [(cx + 0.025, cy - 0.10, 0.31), (cx + 0.025, cy - 0.04, 0.31)], 0.004, ORIGIN, target, "decorative_origin_light")


def build_presentation_tiers(target, centre):
    cx, cy = centre
    for index, (name, scale) in enumerate((("static", 0.42), ("composite", 0.52), ("realtime", 0.62))):
        x = cx - 0.65 + index * 0.65
        mini_pico(target, (x, cy + 0.10), scale)
        if name == "static":
            cube("Draft.Tier.StaticCrop", (x, cy + 0.05, 0.32), (0.25, 0.28, 0.01), WIREFRAME, target, "crop_boundary")
        elif name == "composite":
            torus("Draft.Tier.ZoneMap", (x, cy + 0.10, 0.32), 0.28, 0.007, ORIGIN, target, "zone_map_hint")
        else:
            tube("Draft.Tier.MotionArc", [(x - 0.25, cy + 0.55, 0.31), (x, cy + 0.70, 0.31), (x + 0.25, cy + 0.55, 0.31)], 0.007, ORIGIN, target, "realtime_hint")
        label(target, name, (x, cy - 0.68, 0.72), 0.065, TEXT_MUTED)


def build_motion(target, centre):
    cx, cy = centre
    for index, y_offset in enumerate((-0.08, 0.0, 0.08)):
        sphere(f"Draft.Motion.Hover.{index}", (cx - 0.42, cy + y_offset, 0.05 + index * 0.01), (0.22, 0.30, 0.12), GHOST, target, "secondary_motion")
    tube("Draft.Motion.Pulse", [(cx - 0.72, cy - 0.44, 0.25), (cx - 0.42, cy - 0.55, 0.25), (cx - 0.12, cy - 0.44, 0.25)], 0.012, STATUS, target, "status_transition")
    cube("Draft.Motion.Reduced", (cx + 0.46, cy, 0.02), (0.32, 0.42, 0.08), SHELL, target, "reduced_motion_static", bevel=0.08)
    label(target, "hover / pulse", (cx - 0.43, cy - 0.66, 0.72), 0.065, TEXT_MUTED)
    label(target, "reduced: static", (cx + 0.46, cy - 0.66, 0.72), 0.065, TEXT_MUTED)


def context_base(target, centre, accent):
    cx, cy = centre
    mini_pico(target, (cx - 0.36, cy + 0.08), 0.60, status_mat=STATUS)
    target["pico_context_status_separation"] = "status_stays_global; accessory_uses_context"
    return cx + 0.48, cy + 0.10, accent


def build_context(target, centre, kind, accent):
    x, y, mat = context_base(target, centre, accent)
    if kind == "technology":
        cube("Draft.Context.Technology.Panel", (x, y, 0.1), (0.30, 0.38, 0.035), mat, target, "context_accessory", bevel=0.05)
        for row in (-0.16, 0.0, 0.16):
            sphere("Draft.Context.Technology.Node", (x, y + row, 0.16), (0.035, 0.035, 0.012), STATUS, target, "panel_symbol", segments=12, rings=8)
    elif kind == "water":
        sphere("Draft.Context.Water.Drop", (x, y - 0.02, 0.1), (0.22, 0.30, 0.06), mat, target, "context_accessory")
        cylinder("Draft.Context.Water.Pipe", (x, y - 0.36, 0.0), 0.075, 0.48, TRIM, target, "context_accessory", axis="X")
    elif kind == "fire":
        sphere("Draft.Context.Fire.Helmet", (x, y + 0.05, 0.05), (0.33, 0.25, 0.10), mat, target, "context_accessory")
        cube("Draft.Context.Fire.Brim", (x, y - 0.10, 0.12), (0.40, 0.055, 0.04), mat, target, "context_accessory", bevel=0.03)
    elif kind == "organization":
        cube("Draft.Context.Organization.Document", (x, y, 0.08), (0.27, 0.38, 0.035), mat, target, "context_accessory", bevel=0.03)
        for offset in (-0.16, 0.0, 0.16):
            tube("Draft.Context.Organization.Line", [(x - 0.16, y + offset, 0.14), (x + 0.16, y + offset, 0.14)], 0.009, STATUS, target, "panel_symbol")
    elif kind == "smart_home":
        tube("Draft.Context.Home.Roof", [(x - 0.30, y + 0.03, 0.13), (x, y + 0.32, 0.13), (x + 0.30, y + 0.03, 0.13)], 0.04, mat, target, "context_accessory")
        cube("Draft.Context.Home.Body", (x, y - 0.17, 0.08), (0.25, 0.22, 0.035), mat, target, "context_accessory", bevel=0.03)
    elif kind == "communication":
        cylinder("Draft.Context.Communication.Mast", (x, y - 0.06, 0.05), 0.025, 0.55, mat, target, "context_accessory", axis="Y")
        sphere("Draft.Context.Communication.Node", (x, y + 0.24, 0.08), (0.06, 0.06, 0.035), STATUS, target, "panel_symbol", segments=12, rings=8)
        for radius in (0.18, 0.30):
            tube("Draft.Context.Communication.Wave", [(x - radius, y + 0.10, 0.10), (x, y + 0.24 + radius * 0.35, 0.10), (x + radius, y + 0.10, 0.10)], 0.012, mat, target, "context_accessory")
    elif kind == "energy":
        cube("Draft.Context.Energy.Battery", (x, y, 0.08), (0.30, 0.22, 0.035), mat, target, "context_accessory", bevel=0.04)
        cube("Draft.Context.Energy.Terminal", (x + 0.36, y, 0.08), (0.05, 0.09, 0.035), mat, target, "context_accessory")
        tube("Draft.Context.Energy.Bolt", [(x - 0.06, y + 0.12, 0.15), (x + 0.04, y + 0.02, 0.15), (x - 0.02, y - 0.02, 0.15), (x + 0.08, y - 0.14, 0.15)], 0.018, STATUS, target, "panel_symbol")
    elif kind == "night":
        sphere("Draft.Context.Night.Moon", (x, y, 0.08), (0.28, 0.28, 0.05), mat, target, "context_accessory")
        sphere("Draft.Context.Night.Cutout", (x + 0.12, y + 0.08, 0.13), (0.25, 0.25, 0.05), CARD, target, "context_accessory")
        target["pico_context_brightness"] = "reduced"


def build_clothing(target, centre):
    cx, cy = centre
    mini_pico(target, centre, 0.88)
    vest = cube("Draft.CustomClothing.WorkwearFallback", (cx, cy - 0.25, 0.24), (0.25, 0.25, 0.035), CONTEXT_TECH, target, "custom_clothing_fallback", bevel=0.08)
    vest.scale.x = 1.12
    tube("Draft.CustomClothing.Trim", [(cx - 0.20, cy - 0.12, 0.30), (cx, cy - 0.34, 0.30), (cx + 0.20, cy - 0.12, 0.30)], 0.015, CONTEXT_ENERGY, target, "custom_clothing_fallback")
    target["pico_fallback_rule"] = "never_replace_core|visor|status_group|rig"


def page_positions(count, columns=4):
    rows = math.ceil(count / columns)
    x_step = 2.65
    y_step = 2.25
    result = []
    for index in range(count):
        column = index % columns
        row = index // columns
        result.append((
            (column - (columns - 1) / 2.0) * x_step,
            ((rows - 1) / 2.0 - row) * y_step,
        ))
    return result, rows


def build_head_page(page):
    builders = (
        build_concept_tail,
        build_raised_crown,
        build_antenna,
        lambda target, centre: compact_root(target, centre),
        lambda target, centre: compact_root(target, centre, 0.0),
        lambda target, centre: compact_root(target, centre, -0.075),
        lambda target, centre: simple_swept_hair(target, centre, False),
        lambda target, centre: simple_swept_hair(target, centre, True),
        build_segment_corridor,
        build_width_taper,
        build_twist_curl,
    )
    positions, rows = page_positions(len(HEAD_FEATURES))
    for spec, builder, centre in zip(HEAD_FEATURES, builders, positions):
        order, slug, title = spec
        target = draft_collection(page, order, slug, title, centre)
        builder(target, centre)
    return rows


def build_runtime_page(page):
    builders = (
        build_character_core,
        build_material_zones,
        build_status_group,
        build_face_states,
        build_poses,
        build_origin_light,
        build_presentation_tiers,
        build_motion,
    )
    positions, rows = page_positions(len(RUNTIME_FEATURES))
    for spec, builder, centre in zip(RUNTIME_FEATURES, builders, positions):
        order, slug, title = spec
        target = draft_collection(page, order, slug, title, centre)
        builder(target, centre)
    return rows


def build_context_page(page):
    context_builders = (
        lambda target, centre: build_context(target, centre, "technology", CONTEXT_TECH),
        lambda target, centre: build_context(target, centre, "water", CONTEXT_WATER),
        lambda target, centre: build_context(target, centre, "fire", CONTEXT_FIRE),
        lambda target, centre: build_context(target, centre, "organization", CONTEXT_ORG),
        lambda target, centre: build_context(target, centre, "smart_home", CONTEXT_HOME),
        lambda target, centre: build_context(target, centre, "communication", CONTEXT_COMMS),
        lambda target, centre: build_context(target, centre, "energy", CONTEXT_ENERGY),
        lambda target, centre: build_context(target, centre, "night", CONTEXT_NIGHT),
        build_clothing,
    )
    positions, rows = page_positions(len(CONTEXT_FEATURES))
    for spec, builder, centre in zip(CONTEXT_FEATURES, context_builders, positions):
        order, slug, title = spec
        target = draft_collection(page, order, slug, title, centre)
        builder(target, centre)
    return rows


def camera_for_page(name, rows):
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    # Blender's orthographic scale is the horizontal span here. Keep all four
    # card columns visible; the row count only needs to enlarge portrait pages.
    data.ortho_scale = max(11.2, rows * 3.6)
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = (0.0, 0.0, 20.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    return obj


def area_light(name, location, energy, colour, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = colour
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (0.0, 0.0, 0.0)
    return obj


reset_scene()

SHELL = material("DRAFT_shell", (0.68, 0.72, 0.80), metallic=0.20, roughness=0.22)
FACE = material("DRAFT_face", (0.006, 0.015, 0.030), metallic=0.08, roughness=0.18)
TRIM = material("DRAFT_trim", (0.04, 0.07, 0.10), metallic=0.55, roughness=0.24)
STATUS = material("DRAFT_status", (0.08, 0.60, 1.0), roughness=0.16, emission=(0.08, 0.60, 1.0), strength=4.0)
HAIR = material("DRAFT_personal_hair", (0.30, 0.18, 0.82), roughness=0.16, transmission=0.45, alpha=0.92)
ORIGIN = material("DRAFT_origin_glint", (0.85, 0.92, 1.0), roughness=0.10, emission=(0.65, 0.85, 1.0), strength=6.0)
CARD = material("DRAFT_card", (0.010, 0.028, 0.060), metallic=0.05, roughness=0.45)
TEXT = material("DRAFT_text", (0.72, 0.90, 1.0), roughness=0.30, emission=(0.20, 0.55, 0.85), strength=1.2)
TEXT_MUTED = material("DRAFT_text_muted", (0.40, 0.58, 0.72), roughness=0.40)
WIREFRAME = material("DRAFT_wireframe", (0.05, 0.28, 0.42), roughness=0.40, alpha=0.28)
GHOST = material("DRAFT_motion_ghost", (0.10, 0.36, 0.64), roughness=0.35, alpha=0.20)
CONTEXT_TECH = material("DRAFT_context_technology", (0.05, 0.45, 0.85), metallic=0.20, roughness=0.28)
CONTEXT_WATER = material("DRAFT_context_water", (0.02, 0.62, 0.80), metallic=0.10, roughness=0.25)
CONTEXT_FIRE = material("DRAFT_context_fire", (0.82, 0.08, 0.04), metallic=0.12, roughness=0.28)
CONTEXT_ORG = material("DRAFT_context_organization", (0.78, 0.42, 0.06), metallic=0.18, roughness=0.28)
CONTEXT_HOME = material("DRAFT_context_smart_home", (0.05, 0.65, 0.42), metallic=0.12, roughness=0.28)
CONTEXT_COMMS = material("DRAFT_context_communication", (0.08, 0.74, 0.72), metallic=0.12, roughness=0.26)
CONTEXT_ENERGY = material("DRAFT_context_energy", (0.94, 0.57, 0.04), metallic=0.15, roughness=0.28)
CONTEXT_NIGHT = material("DRAFT_context_night", (0.24, 0.12, 0.48), metallic=0.10, roughness=0.24)

ROOT = collection("PICO_LOW_QUALITY_FEATURE_DRAFTS")
ROOT["pico_status"] = "diagnostic_low_quality"
ROOT["pico_character_approved"] = False
ROOT["pico_draft_count"] = len(ALL_FEATURES)
ROOT["pico_source_adrs"] = "0009|0013|0124|0125|0133|0135"

HEAD_PAGE = collection("DRAFT_PAGE_01_HEAD_IDENTITY", ROOT)
RUNTIME_PAGE = collection("DRAFT_PAGE_02_CHARACTER_RUNTIME", ROOT)
CONTEXT_PAGE = collection("DRAFT_PAGE_03_CONTEXT_PRESENTATION", ROOT)

head_rows = build_head_page(HEAD_PAGE)
runtime_rows = build_runtime_page(RUNTIME_PAGE)
context_rows = build_context_page(CONTEXT_PAGE)

area_light("Draft.Key", (0.0, 3.0, 10.0), 1500.0, (0.78, 0.88, 1.0), 8.0)
area_light("Draft.Fill", (-5.0, -3.0, 8.0), 900.0, (0.30, 0.48, 1.0), 7.0)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1400
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new("Draft.World")
scene.world.use_nodes = True
background = scene.world.node_tree.nodes["Background"]
background.inputs["Color"].default_value = (0.002, 0.008, 0.020, 1.0)
background.inputs["Strength"].default_value = 0.32
scene.view_settings.look = "AgX - Medium High Contrast"

pages = (
    (HEAD_PAGE, camera_for_page("Camera.HeadDrafts", head_rows), "pico-feature-drafts-01-head.png"),
    (RUNTIME_PAGE, camera_for_page("Camera.RuntimeDrafts", runtime_rows), "pico-feature-drafts-02-runtime.png"),
    (CONTEXT_PAGE, camera_for_page("Camera.ContextDrafts", context_rows), "pico-feature-drafts-03-context.png"),
)

for page, camera_obj, filename in pages:
    for candidate, _, _ in pages:
        candidate.hide_render = candidate != page
    scene.camera = camera_obj
    scene.render.filepath = os.path.join(OUTPUT_DIR, filename)
    bpy.ops.render.render(write_still=True)

for page, _, _ in pages:
    page.hide_render = False
scene.camera = pages[0][1]
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)

print(f"PICO_FEATURE_DRAFT_BLEND={BLEND_PATH}")
print(f"PICO_FEATURE_DRAFT_COUNT={len(ALL_FEATURES)}")
print("PICO_FEATURE_DRAFT_STATUS=diagnostic_low_quality_not_character_approved")
sys.stdout.flush()
sys.stderr.flush()
os._exit(0)
