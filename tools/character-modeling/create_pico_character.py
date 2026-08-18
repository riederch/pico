import bpy
import colorsys
import math
import os
from mathutils import Matrix, Vector


OUTPUT_DIR = "/tmp/pico-character-core-v0"
BLEND_PATH = os.path.join(OUTPUT_DIR, "pico-character-core-v0.blend")
GLB_PATH = os.path.join(OUTPUT_DIR, "pico-character-core-v0.glb")


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def collection(name, parent=None):
    result = bpy.data.collections.new(name)
    if parent is None:
        bpy.context.scene.collection.children.link(result)
    else:
        parent.children.link(result)
    return result


def move_to_collection(obj, target):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    target.objects.link(obj)


def parent_preserve_world(obj, parent):
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = parent.matrix_world.inverted() @ world
    return obj


def material(name, base, metallic=0.0, roughness=0.35, emission=None, strength=0.0):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = (*base, 1.0)
    node = result.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*base, 1.0)
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    if emission is not None:
        node.inputs["Emission Color"].default_value = (*emission, 1.0)
        node.inputs["Emission Strength"].default_value = strength
    return result


def apply_material(obj, value, zone):
    obj.data.materials.append(value)
    obj["pico_material_zone"] = zone


def smooth(obj):
    if hasattr(obj.data, "polygons"):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def parent_model(obj):
    move_to_collection(obj, MODEL)
    obj.parent = ROOT
    return obj


def densify_profile(profile, steps=5):
    # Catmull-Rom interpolation passes through every measured section while
    # avoiding the faceted outline produced by straight joins between them.
    def interpolate(a, b, c, d, t):
        t2 = t * t
        t3 = t2 * t
        return 0.5 * (
            2.0 * b
            + (-a + c) * t
            + (2.0 * a - 5.0 * b + 4.0 * c - d) * t2
            + (-a + 3.0 * b - 3.0 * c + d) * t3
        )

    dense = []
    for index in range(len(profile) - 1):
        before = profile[max(0, index - 1)]
        start = profile[index]
        end = profile[index + 1]
        after = profile[min(len(profile) - 1, index + 2)]
        for step in range(steps):
            t = step / steps
            dense.append(tuple(
                interpolate(before[axis], start[axis], end[axis], after[axis], t)
                for axis in range(3)
            ))
    dense.append(profile[-1])
    return dense


def revolved_mesh(name, profile, mat, zone, segments=128, interpolate=True):
    # Each profile row is (Y, half-width X, half-depth Z).
    if interpolate:
        profile = densify_profile(profile)
    vertices = []
    faces = []
    for y, radius_x, radius_z in profile:
        for segment in range(segments):
            angle = 2.0 * math.pi * segment / segments
            vertices.append((radius_x * math.cos(angle), y, radius_z * math.sin(angle)))
    rings = len(profile)
    for ring in range(rings - 1):
        current = ring * segments
        following = (ring + 1) * segments
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((
                current + segment,
                current + nxt,
                following + nxt,
                following + segment,
            ))
    top_center = len(vertices)
    vertices.append((0.0, profile[0][0], 0.0))
    bottom_center = len(vertices)
    vertices.append((0.0, profile[-1][0], 0.0))
    for segment in range(segments):
        nxt = (segment + 1) % segments
        faces.append((top_center, nxt, segment))
        base = (rings - 1) * segments
        faces.append((bottom_center, base + segment, base + nxt))
    mesh = bpy.data.meshes.new(f"{name}.Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    MODEL.objects.link(obj)
    obj.parent = ROOT
    apply_material(obj, mat, zone)
    smooth(obj)
    return obj


def sample_bezier_segments(segments, steps=24):
    def point(a, b, c, d, t):
        inverse = 1.0 - t
        return tuple(
            inverse ** 3 * a[axis]
            + 3.0 * inverse ** 2 * t * b[axis]
            + 3.0 * inverse * t ** 2 * c[axis]
            + t ** 3 * d[axis]
            for axis in range(3)
        )

    result = []
    for start, control_a, control_b, end in segments:
        for step in range(steps):
            result.append(point(start, control_a, control_b, end, step / steps))
    result.append(segments[-1][-1])
    return result


def support_surface_z(support_profile, x, y):
    """Return the front depth of a revolved profile at an X/Y position."""
    for index in range(len(support_profile) - 1):
        first = support_profile[index]
        second = support_profile[index + 1]
        if first[0] >= y >= second[0]:
            span = first[0] - second[0]
            amount = 0.0 if span == 0.0 else (first[0] - y) / span
            radius_at_x = first[1] * (1.0 - amount) + second[1] * amount
            radius_at_z = first[2] * (1.0 - amount) + second[2] * amount
            normalized_x = min(abs(x) / max(radius_at_x, 0.0001), 1.0)
            return radius_at_z * math.sqrt(max(0.0, 1.0 - normalized_x ** 2))
    nearest = min(support_profile, key=lambda point: abs(point[0] - y))
    normalized_x = min(abs(x) / max(nearest[1], 0.0001), 1.0)
    return nearest[2] * math.sqrt(max(0.0, 1.0 - normalized_x ** 2))


def superellipse_distance(x, y, centre_y, radius_x, radius_y, exponent=2.4):
    normalized_x = abs(x) / max(radius_x, 0.0001)
    normalized_y = abs(y - centre_y) / max(radius_y, 0.0001)
    return min((normalized_x ** exponent + normalized_y ** exponent) ** (1.0 / exponent), 1.0)


def visor_surface_z(
    x, y, centre_y, radius_x, radius_y, support_profile,
    offset, bulge, flattening,
):
    # A modest blend toward the centre plane gives the display its own shallow
    # curvature instead of copying the much rounder helmet one-to-one.
    supported = support_surface_z(support_profile, x, y)
    centre_depth = support_surface_z(support_profile, 0.0, centre_y)
    base = supported * (1.0 - flattening) + centre_depth * flattening
    distance = superellipse_distance(x, y, centre_y, radius_x, radius_y)
    return base + offset + bulge * (1.0 - distance ** 2.2)


def superellipse_patch(
    name, centre_y, radius_x, radius_y, support_profile,
    offset, bulge, flattening, mat, zone,
):
    # A smooth, deliberately authored visor surface. Concentric superellipse
    # rings produce the rounded-rectangle outline of the concept without
    # intersecting another solid and exposing accidental seams.
    around = 128
    radial = 24
    exponent = 2.4
    vertices = [(
        0.0,
        centre_y,
        visor_surface_z(
            0.0, centre_y, centre_y, radius_x, radius_y, support_profile,
            offset, bulge, flattening,
        ),
    )]
    faces = []
    for ring in range(1, radial + 1):
        distance = ring / radial
        for segment in range(around):
            angle = 2.0 * math.pi * segment / around
            cosine = math.cos(angle)
            sine = math.sin(angle)
            x = radius_x * distance * math.copysign(abs(cosine) ** (2.0 / exponent), cosine)
            y = centre_y + radius_y * distance * math.copysign(
                abs(sine) ** (2.0 / exponent), sine,
            )
            z = visor_surface_z(
                x, y, centre_y, radius_x, radius_y, support_profile,
                offset, bulge, flattening,
            )
            vertices.append((x, y, z))
    for segment in range(around):
        faces.append((0, 1 + segment, 1 + (segment + 1) % around))
    for ring in range(radial - 1):
        current = 1 + ring * around
        following = current + around
        for segment in range(around):
            nxt = (segment + 1) % around
            faces.append((
                current + segment,
                following + segment,
                following + nxt,
                current + nxt,
            ))
    mesh = bpy.data.meshes.new(f"{name}.Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    MODEL.objects.link(obj)
    obj.parent = ROOT
    obj.visible_shadow = False
    apply_material(obj, mat, zone)
    smooth(obj)
    return obj


def conforming_marker_patch(
    name, marker_x, marker_y, radius_x, radius_y, support_profile,
    mat, zone, target,
):
    """Build a paper-thin marker that follows the authored face surface."""
    around = 64
    radial = 12

    def depth(x, y):
        return visor_surface_z(
            x, y,
            FACE_CENTRE_Y, FACE_RADIUS_X, FACE_RADIUS_Y, support_profile,
            FACE_OFFSET, FACE_BULGE, FACE_FLATTENING,
        ) + 0.0025

    vertices = [(marker_x, marker_y, depth(marker_x, marker_y))]
    faces = []
    for ring in range(1, radial + 1):
        distance = ring / radial
        for segment in range(around):
            angle = 2.0 * math.pi * segment / around
            x = marker_x + radius_x * distance * math.cos(angle)
            y = marker_y + radius_y * distance * math.sin(angle)
            vertices.append((x, y, depth(x, y)))
    for segment in range(around):
        faces.append((0, 1 + segment, 1 + (segment + 1) % around))
    for ring in range(radial - 1):
        current = 1 + ring * around
        following = current + around
        for segment in range(around):
            nxt = (segment + 1) % around
            faces.append((
                current + segment,
                following + segment,
                following + nxt,
                current + nxt,
            ))
    mesh = bpy.data.meshes.new(f"{name}.Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    obj.visible_shadow = False
    apply_material(obj, mat, zone)
    smooth(obj)
    return obj


def profile_depth_at_y(profile, y):
    for index in range(len(profile) - 1):
        first = profile[index]
        second = profile[index + 1]
        if first[0] >= y >= second[0]:
            span = first[0] - second[0]
            amount = 0.0 if span == 0.0 else (first[0] - y) / span
            return first[2] * (1.0 - amount) + second[2] * amount
    return min(profile, key=lambda point: abs(point[0] - y))[2]


def surface_seam(name, profile, y_start, y_end, mat, zone):
    curve = bpy.data.curves.new(f"{name}.Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 8
    curve.bevel_depth = 0.0015
    curve.bevel_resolution = 3
    spline = curve.splines.new("POLY")
    point_count = 32
    spline.points.add(point_count - 1)
    for index, point in enumerate(spline.points):
        amount = index / (point_count - 1)
        y = y_start * (1.0 - amount) + y_end * amount
        point.co = (0.0, y, profile_depth_at_y(profile, y) + 0.004, 1.0)
    obj = bpy.data.objects.new(name, curve)
    MODEL.objects.link(obj)
    obj.parent = ROOT
    curve.materials.append(mat)
    obj["pico_material_zone"] = zone
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    smooth(obj)
    return obj


def uv_sphere(name, location, scale, mat, zone, target=None, segments=96, rings=64):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    move_to_collection(obj, target or MODEL)
    if target is None or target == MODEL:
        obj.parent = ROOT
    apply_material(obj, mat, zone)
    smooth(obj)
    return obj


def cylinder(name, location, radius, depth, rotation, mat, zone, target=None):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=96,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, target or MODEL)
    if target is None or target == MODEL:
        obj.parent = ROOT
    apply_material(obj, mat, zone)
    smooth(obj)
    bevel = obj.modifiers.new("EdgeSoftening", "BEVEL")
    bevel.width = min(radius * 0.12, depth * 0.18)
    bevel.segments = 3
    return obj


def capsule_between(name, start, end, radius_start, radius_end, mat, zone):
    start = Vector(start)
    end = Vector(end)
    direction = end - start
    midpoint = (start + end) * 0.5
    bpy.ops.mesh.primitive_cone_add(
        vertices=64,
        radius1=radius_start,
        radius2=radius_end,
        depth=direction.length,
        location=midpoint,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    parent_model(obj)
    apply_material(obj, mat, zone)
    smooth(obj)
    bevel = obj.modifiers.new("CapsuleSoftening", "BEVEL")
    bevel.width = min(radius_start, radius_end) * 0.45
    bevel.segments = 5
    return obj


def curved_tapered_digit(
    name, start, control, end, radius_start, radius_end, mat, zone,
    target=None, parent=None,
):
    """Create one continuous, softly curved finger without knuckle seams."""
    start = Vector(start)
    control = Vector(control)
    end = Vector(end)
    along = 24
    around = 32
    vertices = []
    faces = []

    for ring in range(along):
        progress = ring / along
        inverse = 1.0 - progress
        centre = inverse * inverse * start + 2.0 * inverse * progress * control + progress * progress * end
        tangent = (
            2.0 * inverse * (control - start)
            + 2.0 * progress * (end - control)
        ).normalized()
        reference = Vector((0.0, 0.0, 1.0))
        if abs(tangent.dot(reference)) > 0.92:
            reference = Vector((1.0, 0.0, 0.0))
        normal_a = tangent.cross(reference).normalized()
        normal_b = tangent.cross(normal_a).normalized()
        radius = radius_start * inverse + radius_end * progress
        if progress > 0.72:
            tip_progress = (progress - 0.72) / 0.28
            radius *= math.sqrt(max(0.0, 1.0 - tip_progress * tip_progress))
        for segment in range(around):
            angle = 2.0 * math.pi * segment / around
            offset = normal_a * (radius * math.cos(angle)) + normal_b * (radius * math.sin(angle))
            vertices.append(tuple(centre + offset))

    for ring in range(along - 1):
        current = ring * around
        following = current + around
        for segment in range(around):
            nxt = (segment + 1) % around
            faces.append((
                current + segment,
                current + nxt,
                following + nxt,
                following + segment,
            ))

    start_centre = len(vertices)
    vertices.append(tuple(start))
    end_centre = len(vertices)
    vertices.append(tuple(end))
    last = (along - 1) * around
    for segment in range(around):
        nxt = (segment + 1) % around
        faces.append((start_centre, nxt, segment))
        faces.append((end_centre, last + segment, last + nxt))

    mesh = bpy.data.meshes.new(f"{name}.Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    (target or MODEL).objects.link(obj)
    if parent is None:
        obj.parent = ROOT
    else:
        parent_preserve_world(obj, parent)
    apply_material(obj, mat, zone)
    smooth(obj)
    return obj


def ellipsoid_between(name, start, end, radius, mat, zone):
    start = Vector(start)
    end = Vector(end)
    direction = end - start
    obj = uv_sphere(
        name,
        (start + end) * 0.5,
        (radius, radius, direction.length * 0.56),
        mat,
        zone,
        segments=80,
        rings=48,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return obj


def oriented_ellipsoid_between(
    name, start, end, width, thickness, mat, zone, target, parent,
):
    start = Vector(start)
    end = Vector(end)
    direction = end - start
    obj = uv_sphere(
        name,
        (start + end) * 0.5,
        (width, thickness, direction.length * 0.56),
        mat,
        zone,
        target=target,
        segments=64,
        rings=40,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    parent_preserve_world(obj, parent)
    return obj


def leaf_blade(
    name, base, control, tip, width, thickness, mat, zone, target, parent,
):
    """Create one broad pointed lamella, closed and smooth on both sides."""
    base = Vector(base)
    control = Vector(control)
    tip = Vector(tip)
    along = 24
    around = 24
    vertices = [tuple(base)]
    faces = []

    for ring in range(1, along):
        progress = ring / along
        inverse = 1.0 - progress
        centre = inverse * inverse * base + 2.0 * inverse * progress * control + progress * progress * tip
        tangent = (
            2.0 * inverse * (control - base)
            + 2.0 * progress * (tip - control)
        ).normalized()
        width_axis = Vector((1.0, 0.0, 0.0))
        width_axis = width_axis - tangent * width_axis.dot(tangent)
        if width_axis.length < 0.001:
            width_axis = Vector((0.0, 0.0, 1.0))
            width_axis = width_axis - tangent * width_axis.dot(tangent)
        width_axis.normalize()
        thickness_axis = tangent.cross(width_axis).normalized()
        envelope = math.sin(math.pi * progress) ** 1.05
        half_width = width * envelope
        half_thickness = thickness * envelope
        for segment in range(around):
            angle = 2.0 * math.pi * segment / around
            offset = (
                width_axis * (half_width * math.cos(angle))
                + thickness_axis * (half_thickness * math.sin(angle))
            )
            vertices.append(tuple(centre + offset))

    tip_index = len(vertices)
    vertices.append(tuple(tip))
    for segment in range(around):
        nxt = (segment + 1) % around
        faces.append((0, 1 + segment, 1 + nxt))
    for ring in range(along - 2):
        current = 1 + ring * around
        following = current + around
        for segment in range(around):
            nxt = (segment + 1) % around
            faces.append((
                current + segment,
                current + nxt,
                following + nxt,
                following + segment,
            ))
    last = 1 + (along - 2) * around
    for segment in range(around):
        nxt = (segment + 1) % around
        faces.append((tip_index, last + segment, last + nxt))

    mesh = bpy.data.meshes.new(f"{name}.Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    parent_preserve_world(obj, parent)
    apply_material(obj, mat, zone)
    smooth(obj)
    return obj


def tapered_shell_between(
    name, start, end, radius_start, radius_end, mat, zone,
    around=80, along=40, cap_fraction=0.18,
):
    """Create the concept's open-looking, softly bevelled armour sleeve."""
    start = Vector(start)
    end = Vector(end)
    direction = end - start
    half_length = direction.length * 0.5
    vertices = []
    faces = []

    def smoothstep(value):
        return value * value * (3.0 - 2.0 * value)

    # Both ends retain an opening-sized cross-section. Only their lips round
    # inward, while the long middle remains an organic taper.
    for ring in range(along + 1):
        progress = ring / along
        longitudinal = -half_length + direction.length * progress
        nominal_radius = (
            radius_start * (1.0 - progress) + radius_end * progress
        )
        nominal_radius *= 1.0 + 0.10 * math.sin(math.pi * progress)
        if progress < cap_fraction:
            lip = 0.72 + 0.28 * smoothstep(progress / cap_fraction)
        elif progress > 1.0 - cap_fraction:
            lip = 0.72 + 0.28 * smoothstep((1.0 - progress) / cap_fraction)
        else:
            lip = 1.0
        radius = nominal_radius * lip
        for segment in range(around):
            angle = 2.0 * math.pi * segment / around
            vertices.append((
                radius * math.cos(angle),
                radius * math.sin(angle),
                longitudinal,
            ))

    for ring in range(along):
        current = ring * around
        following = current + around
        for segment in range(around):
            nxt = (segment + 1) % around
            faces.append((
                current + segment,
                current + nxt,
                following + nxt,
                following + segment,
            ))

    start_center = len(vertices)
    vertices.append((0.0, 0.0, -half_length))
    end_center = len(vertices)
    vertices.append((0.0, 0.0, half_length))
    for segment in range(around):
        nxt = (segment + 1) % around
        faces.append((start_center, nxt, segment))
        last = along * around
        faces.append((end_center, last + segment, last + nxt))

    mesh = bpy.data.meshes.new(f"{name}.Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    MODEL.objects.link(obj)
    obj.parent = ROOT
    obj.location = (start + end) * 0.5
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    apply_material(obj, mat, zone)
    smooth(obj)
    return obj


def torus(
    name, location, major_radius, minor_radius, mat, zone, target=None,
    rotation=(math.pi / 2.0, 0.0, 0.0),
):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=128,
        minor_segments=24,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, target or MODEL)
    if target is None or target == MODEL:
        obj.parent = ROOT
    apply_material(obj, mat, zone)
    smooth(obj)
    return obj


def empty(name, location):
    obj = bpy.data.objects.new(name, None)
    MODEL.objects.link(obj)
    obj.location = location
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = 0.055
    obj.parent = ROOT
    return obj


def make_arm(side):
    sign = -1.0 if side == "L" else 1.0
    if side == "L":
        # The reference pose is deliberately not mirrored: its left arm hangs
        # farther out and exposes more of the articulated hand.
        shoulder = Vector((-0.395, -0.490, 0.000))
        elbow = Vector((-0.580, -0.685, 0.025))
        wrist = Vector((-0.640, -0.825, 0.075))
        palm = Vector((-0.640, -0.890, 0.090))
    else:
        shoulder = Vector((0.395, -0.490, 0.000))
        elbow = Vector((0.570, -0.690, 0.035))
        wrist = Vector((0.600, -0.835, 0.075))
        palm = Vector((0.600, -0.900, 0.090))
    upper_direction = (elbow - shoulder).normalized()
    lower_direction = (wrist - elbow).normalized()
    uv_sphere(
        f"Trim.Shoulder.{side}", shoulder, (0.060, 0.065, 0.062),
        TRIM, "trim", segments=64, rings=40,
    )
    tapered_shell_between(
        f"Shell.UpperArm.{side}",
        shoulder + upper_direction * 0.014,
        elbow - upper_direction * 0.016,
        0.096, 0.064, SHELL, "shell", cap_fraction=0.18,
    )
    uv_sphere(
        f"Trim.Elbow.{side}", elbow, (0.050, 0.053, 0.050),
        TRIM, "trim", segments=64, rings=40,
    )
    tapered_shell_between(
        f"Shell.Forearm.{side}",
        elbow + lower_direction * 0.012,
        wrist - lower_direction * 0.012,
        0.080, 0.054, SHELL, "shell", cap_fraction=0.18,
    )
    uv_sphere(
        f"Trim.Wrist.{side}", wrist, (0.036, 0.039, 0.036),
        TRIM, "trim", segments=64, rings=40,
    )
    uv_sphere(
        f"Trim.Hand.{side}", palm, (0.072, 0.092, 0.067),
        TRIM, "trim", segments=64, rings=40,
    )
    # The concept deliberately shows two different readings: the left hand
    # exposes its dark palm, while the right hand turns its light shell back
    # toward the viewer.
    if side == "R":
        uv_sphere(
            f"Shell.HandBack.{side}",
            (palm.x, palm.y + 0.012, palm.z + 0.057),
            (0.060, 0.068, 0.017),
            SHELL, "shell", segments=64, rings=40,
        )
    finger_offsets = (-0.038, 0.0, 0.038)
    for index, offset in enumerate(finger_offsets, start=1):
        length_adjustment = 0.010 if offset == 0.0 else 0.0
        finger_start = (
            sign * (abs(palm.x) + offset),
            palm.y - 0.044,
            palm.z + 0.052,
        )
        finger_joint = (
            sign * (abs(palm.x) + offset * 1.10),
            palm.y - 0.078 - length_adjustment * 0.45,
            palm.z + 0.064,
        )
        finger_end = (
            sign * (abs(palm.x) + offset * 1.22),
            palm.y - 0.116 - length_adjustment,
            palm.z + 0.050,
        )
        curved_tapered_digit(
            f"Trim.Finger{index}.{side}", finger_start, finger_joint, finger_end,
            0.021, 0.015, TRIM, "trim",
        )
    thumb_start = (sign * (abs(palm.x) - 0.054), palm.y - 0.004, palm.z + 0.048)
    thumb_joint = (sign * (abs(palm.x) - 0.080), palm.y - 0.030, palm.z + 0.066)
    thumb_end = (sign * (abs(palm.x) - 0.094), palm.y - 0.064, palm.z + 0.052)
    curved_tapered_digit(
        f"Trim.Thumb.{side}", thumb_start, thumb_joint, thumb_end,
        0.021, 0.014, TRIM, "trim",
    )


def preview_face(support_profile):
    # Preview-only geometry: the normative GLB deliberately excludes it.
    for name, x in (("Left", -0.170), ("Right", 0.170)):
        conforming_marker_patch(
            f"PREVIEW.Status.Eye.{name}", x, 0.015,
            0.058, 0.090, support_profile,
            STATUS, "status_emitters", PREVIEW,
        )
    curve = bpy.data.curves.new("PREVIEW.Status.Mouth.Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 4
    curve.bevel_depth = 0.0045
    curve.bevel_resolution = 4
    spline = curve.splines.new("POLY")
    point_count = 25
    spline.points.add(point_count - 1)
    for index, point in enumerate(spline.points):
        amount = index / (point_count - 1)
        x = -0.040 + 0.080 * amount
        normalized = x / 0.040
        y = -0.156 - 0.014 * (1.0 - normalized * normalized)
        z = visor_surface_z(
            x, y,
            FACE_CENTRE_Y, FACE_RADIUS_X, FACE_RADIUS_Y, support_profile,
            FACE_OFFSET, FACE_BULGE, FACE_FLATTENING,
        ) + 0.0035
        point.co = (x, y, z, 1.0)
    mouth = bpy.data.objects.new("PREVIEW.Status.Mouth", curve)
    PREVIEW.objects.link(mouth)
    mouth.visible_shadow = False
    curve.materials.append(STATUS)
    mouth["pico_material_zone"] = "status_emitters"


def head_module_material(name, hue, chroma, translucency):
    saturation = 0.45 + 0.45 * (chroma / 255.0)
    value = 0.18 + 0.24 * (1.0 - translucency / 255.0)
    rgb = colorsys.hsv_to_rgb((hue % 360) / 360.0, saturation, value)
    return material(
        f"PICO_ZONE_head_module.{name}", rgb,
        metallic=0.04,
        roughness=0.38 + 0.12 * (translucency / 255.0),
    )


def make_procedural_head_variant(name, vector_name, recipe, target, mount):
    """Diagnostic geometry proposal for one PAS V2 recipe.

    This deliberately creates one root collar, one continuous carrier and a
    set of broad lamellae along one curve. It is not an approved generator and
    must not be mistaken for a finite hairstyle catalogue.
    """
    geometry = recipe["geometry"]
    appearance = recipe["material"]
    if not 3 <= geometry["segments"] <= 9:
        raise ValueError("head recipe segments must stay inside the PAS corridor")
    if not 48 <= geometry["rootSpread"] <= 192:
        raise ValueError("head recipe rootSpread must stay inside the PAS corridor")

    target["pico_status"] = "diagnostic"
    target["pico_generator_id"] = "pico.appearance.head-generator"
    target["pico_generator_version"] = 2
    target["pico_vector_name"] = vector_name
    target["pico_head_identity"] = "procedural_neon_hair"

    module_mat = head_module_material(
        name,
        appearance["hue"],
        appearance["chroma"],
        appearance["translucency"],
    )

    anchor_amount = geometry["anchor"] / 255.0
    side_amount = geometry["side"] / 96.0
    length_amount = geometry["length"] / 255.0
    lift_amount = geometry["lift"] / 255.0
    sweep_amount = geometry["sweep"] / 127.0
    curl_amount = geometry["curl"] / 127.0
    width_amount = geometry["width"] / 255.0
    taper_amount = geometry["taper"] / 255.0
    crown_amount = geometry["crownBias"] / 96.0
    root_spread = 0.060 + 0.075 * (geometry["rootSpread"] - 48) / 144.0

    # Character coordinates are authoritative here: +Y up and +Z toward the
    # viewer. Positive PAS sweep therefore travels toward -Z (the rear).
    start = Vector((
        side_amount * 0.030,
        mount.location.y + 0.004,
        0.070 - anchor_amount * 0.090,
    ))
    total_lift = 0.120 + lift_amount * 0.180 + max(crown_amount, 0.0) * 0.025
    rear_sweep = 0.035 + max(sweep_amount, -0.25) * 0.210 + length_amount * 0.075
    lateral = side_amount * (0.070 + length_amount * 0.090)
    control = Vector((
        start.x + lateral * 0.42,
        start.y + total_lift * (0.58 + 0.10 * max(crown_amount, 0.0)),
        start.z - rear_sweep * 0.30,
    ))
    end = Vector((
        start.x + lateral + curl_amount * 0.035,
        start.y + total_lift - abs(curl_amount) * 0.020,
        start.z - rear_sweep - curl_amount * 0.025,
    ))

    def curve_point(amount):
        inverse = 1.0 - amount
        return inverse * inverse * start + 2.0 * inverse * amount * control + amount * amount * end

    segments = geometry["segments"]
    root_points = []
    for index in range(segments):
        amount = 0.5 if segments == 1 else index / (segments - 1)
        centred = amount - 0.5
        root_z = start.z - centred * root_spread * 0.34
        root_x = start.x + centred * root_spread * 1.08 + lateral * amount * 0.24
        crown_radius = math.sqrt(root_x * root_x + root_z * root_z)
        root_y = 0.402 - crown_radius * 0.43
        base = Vector((root_x, root_y, root_z))
        root_points.append(base)
        tip_amount = 0.42 + 0.58 * amount
        tip = curve_point(tip_amount)
        fan_width = root_spread * (0.78 + 0.38 * lift_amount)
        tip += Vector((
            centred * fan_width + lateral * 0.16,
            -abs(centred) * total_lift * (0.12 + 0.14 * lift_amount),
            centred * rear_sweep * 0.18,
        ))
        blade_control = (base + tip) * 0.5 + Vector((
            centred * fan_width * 0.18 + lateral * 0.10,
            0.025 + total_lift * 0.08,
            -rear_sweep * 0.08,
        ))
        blade_width = (0.046 + width_amount * 0.052) * (1.0 - taper_amount * amount * 0.46)
        blade_thickness = max(0.012, blade_width * 0.19)
        leaf_blade(
            f"HeadModule.{name}.Lamella.{index + 1:02d}",
            base,
            blade_control,
            tip,
            blade_width,
            blade_thickness,
            module_mat,
            "head_module",
            target,
            mount,
        )

    root_front = root_points[0]
    root_back = root_points[-1]
    root_middle = (root_front + root_back) * 0.5 + Vector((0.0, 0.018, 0.0))
    carrier_radius = 0.016 + width_amount * 0.012
    curved_tapered_digit(
        f"HeadModule.{name}.InnerCarrier",
        root_front,
        root_middle,
        root_back,
        carrier_radius,
        carrier_radius * 0.92,
        module_mat,
        "head_module",
        target=target,
        parent=mount,
    )

    accent_start = curve_point(0.66)
    accent_end = curve_point(0.82)
    accent = oriented_ellipsoid_between(
        f"Status.HeadAccent.{name}",
        accent_start,
        accent_end,
        0.014,
        0.007,
        STATUS,
        "status_emitters",
        target,
        mount,
    )
    return target


def add_head_identity_scale_driver(obj, mount, visible_index):
    # Driving hide_viewport creates a Blender dependency cycle: a hidden object
    # leaves the dependency graph and can no longer evaluate the driver needed
    # to reveal itself. A permanently evaluated carrier with scale 0/1 keeps
    # the selector restart-safe while still presenting exactly one identity.
    for axis in range(3):
        fcurve = obj.driver_add("scale", axis)
        driver = fcurve.driver
        driver.type = "SCRIPTED"
        variable = driver.variables.new()
        variable.name = "head_identity"
        variable.type = "SINGLE_PROP"
        variable.targets[0].id = mount
        variable.targets[0].data_path = '["pico_head_identity_index"]'
        driver.expression = f"head_identity == {visible_index}"


def make_head_identity_carrier(name, target, mount, visible_index, objects):
    carrier = bpy.data.objects.new(f"PICO_HEAD_IDENTITY_{name}", None)
    target.objects.link(carrier)
    carrier.parent = mount
    carrier.matrix_parent_inverse = Matrix.Identity(4)
    carrier.matrix_basis = Matrix.Identity(4)
    carrier.empty_display_type = "CIRCLE"
    carrier.empty_display_size = 0.045
    carrier["pico_head_identity"] = name
    carrier["pico_material_zone"] = "head_module"
    carrier["pico_exclusive_visible_index"] = visible_index
    for obj in objects:
        parent_preserve_world(obj, carrier)
    add_head_identity_scale_driver(carrier, mount, visible_index)
    return carrier


def install_head_identity_selector(mount):
    mount["pico_head_identity_index"] = 0
    mount.id_properties_ui("pico_head_identity_index").update(
        min=0,
        max=2,
        description=(
            "Exclusive head identity: 0 standard antenna, "
            "1 procedural hair, 2 procedural comb"
        ),
    )
    identity_sources = (
        ("standard_antenna", MODEL, STANDARD_ANTENNA_OBJECTS),
        (
            "procedural_hair",
            HEAD_VARIANT_COLLECTIONS["procedural_hair"],
            tuple(HEAD_VARIANT_COLLECTIONS["procedural_hair"].all_objects),
        ),
        (
            "procedural_comb",
            HEAD_VARIANT_COLLECTIONS["procedural_comb"],
            tuple(HEAD_VARIANT_COLLECTIONS["procedural_comb"].all_objects),
        ),
    )
    for visible_index, (name, target, objects) in enumerate(identity_sources):
        HEAD_IDENTITY_CARRIERS[name] = make_head_identity_carrier(
            name,
            target,
            mount,
            visible_index,
            objects,
        )
    bpy.context.view_layer.update()


def select_head_identity(name):
    indices = {
        "standard_antenna": 0,
        "procedural_hair": 1,
        "procedural_comb": 2,
    }
    mount["pico_head_identity_index"] = indices[name]
    mount.update_tag(refresh={"OBJECT"})
    # The offline script renders several identities in one Blender session.
    # Advancing and restoring the frame invalidates the render dependency
    # graph, which otherwise keeps the carrier transforms from the first view.
    frame = bpy.context.scene.frame_current
    bpy.context.scene.frame_set(frame + 1)
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()


def force_head_identity_for_offline_render(name):
    indices = {
        "standard_antenna": 0,
        "procedural_hair": 1,
        "procedural_comb": 2,
    }
    selected = indices[name]
    for index, carrier_name in enumerate((
        "standard_antenna",
        "procedural_hair",
        "procedural_comb",
    )):
        carrier = HEAD_IDENTITY_CARRIERS[carrier_name]
        for fcurve in carrier.animation_data.drivers:
            fcurve.mute = True
        scale = 1.0 if index == selected else 0.0
        carrier.scale = (scale, scale, scale)
        carrier.update_tag(refresh={"OBJECT"})
    bpy.context.view_layer.update()


def restore_head_identity_drivers():
    for carrier in HEAD_IDENTITY_CARRIERS.values():
        for fcurve in carrier.animation_data.drivers:
            fcurve.mute = False
        carrier.update_tag(refresh={"OBJECT"})
    bpy.context.view_layer.update()


def look_at(obj, target):
    # Blender normally assumes Z-up when resolving camera roll. The Character
    # contract is Y-up, so build the camera basis explicitly.
    forward = (Vector(target) - obj.location).normalized()
    desired_up = Vector((0.0, 1.0, 0.0))
    right = forward.cross(desired_up).normalized()
    actual_up = right.cross(forward).normalized()
    basis = Matrix((right, actual_up, -forward)).transposed()
    obj.rotation_euler = basis.to_quaternion().to_euler()


def camera(name):
    data = bpy.data.cameras.new(f"{name}.Data")
    data.type = "ORTHO"
    data.ortho_scale = 2.16
    obj = bpy.data.objects.new(name, data)
    SCENE_COLLECTION.objects.link(obj)
    bpy.context.scene.camera = obj
    return obj


def area_light(name, location, energy, color, size):
    data = bpy.data.lights.new(f"{name}.Data", "AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    SCENE_COLLECTION.objects.link(obj)
    obj.location = location
    look_at(obj, (0.0, -0.35, 0.0))
    return obj


def render(
    path, camera_position, show_preview, transparent=False,
    head_identity="standard_antenna",
):
    select_head_identity(head_identity)
    force_head_identity_for_offline_render(head_identity)
    PREVIEW.hide_render = not show_preview
    bpy.context.scene.render.film_transparent = transparent
    excluded_from_silhouette = (
        bpy.data.objects.get("Status.HoverRing"),
        bpy.data.objects.get("Status.HoverCore"),
        bpy.data.objects.get("Status.Underside"),
    )
    for obj in excluded_from_silhouette:
        if obj is not None:
            obj.hide_render = transparent
    CAMERA.location = camera_position
    look_at(CAMERA, (0.0, -0.37, 0.0))
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    restore_head_identity_drivers()
    for obj in excluded_from_silhouette:
        if obj is not None:
            obj.hide_render = False


reset_scene()
os.makedirs(OUTPUT_DIR, exist_ok=True)

MODEL = collection("PICO_CHARACTER_CORE")
PREVIEW = collection("PICO_PREVIEW_ONLY")
HEAD_VARIANTS = collection("PICO_HEAD_VARIANTS_DIAGNOSTIC")
HEAD_HAIR = collection("HEAD_VARIANT_procedural_hair", HEAD_VARIANTS)
HEAD_COMB = collection("HEAD_VARIANT_procedural_comb", HEAD_VARIANTS)
SCENE_COLLECTION = collection("PICO_RENDER_SCENE")

ROOT = bpy.data.objects.new("PICO.CharacterCore.Root", None)
MODEL.objects.link(ROOT)
ROOT["pico_character_standard"] = "3.2.1"
ROOT["pico_status"] = "unapproved_prototype"
ROOT["pico_units"] = "widest_head_width_equals_1"
ROOT["pico_head_identity_contract"] = "standard_antenna|procedural_neon_hair"

SHELL = material("PICO_ZONE_shell", (0.46, 0.50, 0.57), metallic=0.22, roughness=0.18)
FACE = material("PICO_ZONE_face_display", (0.003, 0.009, 0.017), metallic=0.05, roughness=0.18)
TRIM = material("PICO_ZONE_trim", (0.055, 0.075, 0.095), metallic=0.42, roughness=0.24)
STATUS = material(
    "PICO_ZONE_status_emitters", (0.001, 0.025, 0.060), metallic=0.0,
    roughness=0.18, emission=(0.0, 0.30, 0.60), strength=2.5,
)
face_shader = FACE.node_tree.nodes.get("Principled BSDF")
if face_shader is not None and "Specular IOR Level" in face_shader.inputs:
    face_shader.inputs["Specular IOR Level"].default_value = 0.02

# Tangent-led curves form the single continuous dome and rounded lower helmet
# visible in the concept. The measured widest section remains exactly 1.0.
head_profile = sample_bezier_segments([
    (
        (0.395, 0.005, 0.020),
        (0.395, 0.240, 0.180),
        (0.170, 0.480, 0.400),
        (-0.062, 0.500, 0.432),
    ),
    (
        (-0.062, 0.500, 0.432),
        (-0.140, 0.510, 0.430),
        (-0.300, 0.380, 0.320),
        (-0.395, 0.200, 0.180),
    ),
], steps=48)
revolved_mesh("Shell.Head", head_profile, SHELL, "shell", interpolate=False)

# The larger trim patch forms the visible visor frame. The dark face keeps a
# shallower curvature than the helmet so expressions read as lying on a
# display instead of floating in front of a sphere.
FACE_CENTRE_Y = -0.035
FACE_RADIUS_X = 0.347
FACE_RADIUS_Y = 0.253
FACE_OFFSET = 0.012
FACE_BULGE = 0.018
FACE_FLATTENING = 0.22
superellipse_patch(
    "Trim.VisorFrame", -0.035, 0.360, 0.263, head_profile,
    0.005, 0.012, 0.14,
    TRIM, "trim",
)
superellipse_patch(
    "FaceDisplay.Visor", FACE_CENTRE_Y, FACE_RADIUS_X, FACE_RADIUS_Y, head_profile,
    FACE_OFFSET, FACE_BULGE, FACE_FLATTENING,
    FACE, "face_display",
)

# A real neck remains visible between head and torso. It is trim, not a status
# emitter, so state colour cannot silently recolour the character structure.
cylinder(
    "Trim.Neck", (0.0, -0.390, 0.0), 0.225, 0.090,
    (math.pi / 2.0, 0.0, 0.0), TRIM, "trim",
)
torus(
    "Status.NeckUnderside", (0.0, -0.392, 0.0), 0.170, 0.008,
    STATUS, "status_emitters",
)

torso_profile = sample_bezier_segments([
    (
        (-0.390, 0.2700, 0.160),
        (-0.400, 0.3400, 0.250),
        (-0.500, 0.3800, 0.300),
        (-0.610, 0.3800, 0.310),
    ),
    (
        (-0.610, 0.3800, 0.310),
        (-0.770, 0.3800, 0.305),
        (-1.060, 0.2700, 0.190),
        (-1.105, 0.1000, 0.055),
    ),
], steps=48)
revolved_mesh("Shell.Torso", torso_profile, SHELL, "shell", interpolate=False)
surface_seam("Trim.TorsoSeam.Upper", torso_profile, -0.405, -0.505, TRIM, "trim")
surface_seam("Trim.TorsoSeam.Lower", torso_profile, -0.833, -1.055, TRIM, "trim")

# Head side modules are components, not a widened head silhouette.
for side, sign in (("L", -1.0), ("R", 1.0)):
    cylinder(
        f"Trim.HeadSideModule.{side}", (sign * 0.465, -0.075, 0.0),
        0.125, 0.070, (0.0, math.pi / 2.0, 0.0), TRIM, "trim",
    )
    cylinder(
        f"Status.HeadSideCap.{side}", (sign * 0.503, -0.075, 0.0),
        0.088, 0.025, (0.0, math.pi / 2.0, 0.0), STATUS, "status_emitters",
    )

# Chest core: dark housing plus one member of the unified status group.
cylinder("Trim.ChestCoreHousing", (0.0, -0.669, 0.310), 0.151, 0.060, (0.0, 0.0, 0.0), TRIM, "trim")
torus(
    "Status.ChestCoreBezel", (0.0, -0.669, 0.352), 0.130, 0.012,
    STATUS, "status_emitters", rotation=(0.0, 0.0, 0.0),
)
cylinder("Status.ChestCore", (0.0, -0.669, 0.356), 0.112, 0.035, (0.0, 0.0, 0.0), STATUS, "status_emitters")

make_arm("L")
make_arm("R")

# One authored mount carries either the standard antenna or exactly one
# procedural head module. Character coordinates win over the contradictory
# PAS-brief sentence: +Z points toward the viewer, -Z toward the rear.
mount = empty("PICO_MOUNT_head_module", (0.0, 0.395, 0.0))
mount["pico_material_zone"] = "head_module"
mount["pico_mount_axis"] = "+Y"
mount["pico_forward_axis"] = "+Z"
mount["pico_back_axis"] = "-Z"
mount["pico_head_identity_exclusive"] = True

# The standard antenna reaches the measured +0.562 bound and is the default
# Character v3.2.1 head identity.
antenna_stem = cylinder(
    "Trim.AntennaStem", (0.0, 0.455, 0.0), 0.012, 0.125,
    (math.pi / 2.0, 0.0, 0.0), TRIM, "trim",
)
antenna_sphere = uv_sphere(
    "Status.AntennaSphere", (0.0, 0.497, 0.0), (0.065, 0.065, 0.065),
    STATUS, "status_emitters", segments=64, rings=40,
)
for antenna_part in (antenna_stem, antenna_sphere):
    parent_preserve_world(antenna_part, mount)
    antenna_part["pico_head_identity"] = "standard_antenna"
STANDARD_ANTENNA_OBJECTS = (antenna_stem, antenna_sphere)

HEAD_VARIANT_COLLECTIONS = {
    "procedural_hair": HEAD_HAIR,
    "procedural_comb": HEAD_COMB,
}
HEAD_IDENTITY_CARRIERS = {}
make_procedural_head_variant(
    "Hair",
    "head-short-rear-flow",
    {
        "geometry": {
            "anchor": 82, "side": 0, "length": 120, "lift": 80,
            "sweep": 70, "curl": 6, "width": 118, "taper": 204,
            "twist": 4, "segments": 5, "partOffset": 0,
            "partDepth": 0, "crownBias": 62, "rootSpread": 126,
        },
        "material": {"hue": 210, "chroma": 220, "translucency": 40},
    },
    HEAD_HAIR,
    mount,
)
make_procedural_head_variant(
    "Comb",
    "head-raised-crown",
    {
        "geometry": {
            "anchor": 82, "side": 0, "length": 70, "lift": 200,
            "sweep": 12, "curl": 6, "width": 118, "taper": 204,
            "twist": 4, "segments": 4, "partOffset": 0,
            "partDepth": 0, "crownBias": 0, "rootSpread": 126,
        },
        "material": {"hue": 278, "chroma": 220, "translucency": 45},
    },
    HEAD_COMB,
    mount,
)
install_head_identity_selector(mount)

# Underside emitter and hover form. The broader luminous falloff belongs to
# rendering; these meshes are the authored emitting surfaces only.
uv_sphere("Status.Underside", (0.0, -1.095, 0.0), (0.100, 0.030, 0.075), STATUS, "status_emitters", segments=64, rings=40)
torus("Status.HoverRing", (0.0, -1.245, 0.0), 0.345, 0.016, STATUS, "status_emitters")
uv_sphere("Status.HoverCore", (0.0, -1.245, 0.0), (0.155, 0.010, 0.070), STATUS, "status_emitters", segments=64, rings=40)

preview_face(head_profile)

CAMERA = camera("Camera.Reference")
area_light("Key", (3.3, 2.7, 4.8), 950.0, (1.0, 0.82, 0.68), 4.0)
area_light("Fill", (-3.8, 0.6, 3.0), 650.0, (0.28, 0.56, 1.0), 3.2)
area_light("Rim", (2.0, 1.4, -3.8), 850.0, (0.10, 0.42, 1.0), 3.0)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 768
scene.render.resolution_y = 768
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = False
scene.render.image_settings.color_depth = "8"
scene.render.filepath = os.path.join(OUTPUT_DIR, "pico-preview-reference.png")
scene.world = bpy.data.worlds.new("PICO.RenderWorld")
scene.world.color = (0.001, 0.004, 0.010)
scene.world.use_nodes = True
background = scene.world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.006, 0.025, 0.060, 1.0)
background.inputs["Strength"].default_value = 0.50
scene.view_settings.look = "AgX - Medium High Contrast"

render(
    os.path.join(OUTPUT_DIR, "pico-mesh-reference.png"),
    (2.35, 0.32, 6.45),
    show_preview=False,
    transparent=True,
)
render(
    os.path.join(OUTPUT_DIR, "pico-preview-reference.png"),
    (2.35, 0.32, 6.45),
    show_preview=True,
)
render(
    os.path.join(OUTPUT_DIR, "pico-preview-front.png"),
    (0.0, 0.12, 6.8),
    show_preview=True,
)
render(
    os.path.join(OUTPUT_DIR, "pico-preview-head-hair.png"),
    (2.35, 0.32, 6.45),
    show_preview=True,
    head_identity="procedural_hair",
)
render(
    os.path.join(OUTPUT_DIR, "pico-preview-head-comb.png"),
    (2.35, 0.32, 6.45),
    show_preview=True,
    head_identity="procedural_comb",
)
select_head_identity("standard_antenna")
force_head_identity_for_offline_render("standard_antenna")
restore_head_identity_drivers()

# Save the editable authoring source. It is a prototype and must not enter the
# character registry until owner approval and the ADR 0124 gates are closed.
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)

# Export only the authored model. Cameras, lights and preview face remain in
# the .blend for inspection but cannot leak into the normative candidate.
for obj in scene.objects:
    obj.select_set(False)
for obj in MODEL.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = ROOT
bpy.ops.export_scene.gltf(
    filepath=GLB_PATH,
    export_format="GLB",
    use_selection=True,
    # The authoring coordinates already follow the Character contract's Y-up
    # convention. Blender's normal Z-up to Y-up conversion would rotate them a
    # second time and make the exported character Z-up again.
    export_yup=False,
    export_apply=True,
)

print(f"PICO_BLEND={BLEND_PATH}")
print(f"PICO_GLB={GLB_PATH}")
print("PICO_STATUS=unapproved_prototype")
bpy.ops.wm.quit_blender()
