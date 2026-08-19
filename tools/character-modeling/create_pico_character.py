import bpy
import math
import os
from mathutils import Matrix, Vector


# material() writes 4.x Principled sockets ("Transmission Weight", "Coat
# Weight") and surface_render_method (4.2+); on an older Blender those fail
# as a KeyError deep inside the build, so the floor is stated once here.
if bpy.app.version < (4, 2, 0):
    raise RuntimeError(
        "create_pico_character.py needs Blender 4.2 or newer, found "
        + ".".join(str(part) for part in bpy.app.version)
        + "; see tools/character-modeling/README.md"
    )


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


def material(
    name, base, metallic=0.0, roughness=0.35, emission=None, strength=0.0,
    transmission=0.0, alpha=1.0, ior=1.45, coat=0.0,
):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = (*base, alpha)
    node = result.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*base, 1.0)
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    node.inputs["IOR"].default_value = ior
    node.inputs["Alpha"].default_value = alpha
    node.inputs["Transmission Weight"].default_value = transmission
    node.inputs["Coat Weight"].default_value = coat
    node.inputs["Coat Roughness"].default_value = min(0.18, roughness * 0.55)
    if emission is not None:
        node.inputs["Emission Color"].default_value = (*emission, 1.0)
        node.inputs["Emission Strength"].default_value = strength
    if transmission > 0.0:
        # A light guide has to refract. EEVEE ignores Transmission Weight
        # unless the material opts in, which is what made the first proposal
        # render as solid plastic instead of glass.
        if hasattr(result, "use_raytrace_refraction"):
            result.use_raytrace_refraction = True
        if hasattr(result, "use_screen_refraction"):
            result.use_screen_refraction = True
        if hasattr(result, "thickness_mode"):
            result.thickness_mode = "SLAB"
    if alpha < 1.0:
        result.surface_render_method = "BLENDED"
        if hasattr(result, "use_transparency_overlap"):
            result.use_transparency_overlap = False
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


# The head is shortened at the back so it ends level with the body. The
# revolved profile cannot express that on its own -- its depth is one radius
# shared by front and back -- so the rear is compressed afterwards. Everything
# that sits on the head reads the same compression, or it would be placed
# against a surface that is no longer there.
HEAD_MAX_DEPTH = 0.432
HEAD_REAR_REDUCTION = 0.0


def head_rear_scale(z):
    """How far the rear of the head is drawn in at this depth.

    Smooth at both ends: the compression starts with zero slope at the head's
    equator, so pulling the back in leaves no crease where it begins.
    """
    if z >= 0.0 or HEAD_REAR_REDUCTION <= 0.0:
        return 1.0
    amount = min(1.0, -z / HEAD_MAX_DEPTH)
    return 1.0 - HEAD_REAR_REDUCTION * amount * amount * (3.0 - 2.0 * amount)


def head_rear_unscale(z):
    """The profile depth a shortened rear point came from."""
    if z >= 0.0 or HEAD_REAR_REDUCTION <= 0.0:
        return z
    original = z
    for _ in range(40):
        original = z / head_rear_scale(original)
    return original


def shorten_head_back(obj, reduction):
    """Draw the back of the head in, leaving the front and the sides alone."""
    global HEAD_REAR_REDUCTION
    HEAD_REAR_REDUCTION = reduction
    moved = 0
    for vertex in obj.data.vertices:
        scale = head_rear_scale(vertex.co.z)
        if scale < 1.0:
            vertex.co.z *= scale
            moved += 1
    obj.data.update()
    print(f"PICO_HEAD_BACK_SHORTENED_VERTICES={moved}")
    return obj


def head_surface_y(support_profile, x, z, ceiling=0.395, floor=-0.120):
    """Height of the revolved head shell above (x, z).

    A crown fitting has to lie on the authored shell instead of floating over
    it on a stalk, so its height is sampled from the same profile that builds
    the head rather than guessed from the mount.
    """
    target = abs(head_rear_unscale(z))
    if support_surface_z(support_profile, x, floor) < target:
        return floor
    low, high = floor, ceiling
    for _ in range(52):
        middle = 0.5 * (low + high)
        if support_surface_z(support_profile, x, middle) >= target:
            low = middle
        else:
            high = middle
    return low


def head_surface_normal(support_profile, x, z, step=0.005):
    """Outward normal of the head shell at (x, z), from the sampled surface."""
    slope_x = (
        head_surface_y(support_profile, x + step, z)
        - head_surface_y(support_profile, x - step, z)
    ) / (2.0 * step)
    slope_z = (
        head_surface_y(support_profile, x, z + step)
        - head_surface_y(support_profile, x, z - step)
    ) / (2.0 * step)
    return Vector((-slope_x, 1.0, -slope_z)).normalized()


def superellipse_distance(x, y, centre_y, radius_x, radius_y, exponent=2.4):
    normalized_x = abs(x) / max(radius_x, 0.0001)
    normalized_y = abs(y - centre_y) / max(radius_y, 0.0001)
    return min((normalized_x ** exponent + normalized_y ** exponent) ** (1.0 / exponent), 1.0)


def visor_surface_z(
    x, y, centre_y, radius_x, radius_y, support_profile,
    offset, bulge, flattening, rim=0.0,
    dome_radius_x=None, dome_radius_y=None,
):
    # A blend toward the centre plane gives the display its own shallow
    # curvature instead of copying the much rounder helmet one-to-one.
    #
    # The dome is measured on its own radii, separately from the outline. The
    # display and its frame then share one dome and differ only in where they
    # are cut off, so the display cannot rise through its own frame the way it
    # would if each domed over its own, differently sized outline.
    supported = support_surface_z(support_profile, x, y)
    centre_depth = support_surface_z(support_profile, 0.0, centre_y)
    base = supported * (1.0 - flattening) + centre_depth * flattening
    distance = superellipse_distance(x, y, centre_y, radius_x, radius_y)
    dome = superellipse_distance(
        x, y, centre_y,
        dome_radius_x if dome_radius_x is not None else radius_x,
        dome_radius_y if dome_radius_y is not None else radius_y,
    )
    surface = base + offset + bulge * (1.0 - dome ** 2.2)
    if rim > 0.0:
        # Across the outer rim the patch returns to the plain shell, so the
        # face meets the head tangentially instead of standing on a hard edge.
        blend = min(1.0, max(0.0, (distance - (1.0 - rim)) / rim))
        blend = blend * blend * (3.0 - 2.0 * blend)
        surface = surface * (1.0 - blend) + supported * blend
    return surface


def superellipse_patch(
    name, centre_y, radius_x, radius_y, support_profile,
    offset, bulge, flattening, mat, zone, rim=0.0,
    dome_radius_x=None, dome_radius_y=None,
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
            offset, bulge, flattening, rim, dome_radius_x, dome_radius_y,
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
                offset, bulge, flattening, rim, dome_radius_x, dome_radius_y,
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
            dome_radius_x=FACE_DOME_RADIUS_X, dome_radius_y=FACE_DOME_RADIUS_Y,
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


def frustum(
    name, location, radius_inner, radius_outer, depth, rotation, mat, zone,
    target=None,
):
    """A truncated cone: same placement as `cylinder`, but able to flare."""
    bpy.ops.mesh.primitive_cone_add(
        vertices=96,
        radius1=radius_inner,
        radius2=radius_outer,
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
    bevel.width = min(min(radius_inner, radius_outer) * 0.12, depth * 0.18)
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


def tangent_plate(
    name, centre, normal, along, half_width, half_length, half_thickness,
    mat, zone, target, parent,
):
    """A low oval plate lying flat on a surface, thin axis along its normal.

    Placing a plate between two surface points tilts it: the chord cuts across
    the curvature, so the plate stands at an angle to the shell it is meant to
    lie on. Orienting it by the surface normal at its own centre is what makes
    it sit flat.
    """
    up = Vector(normal).normalized()
    forward = Vector(along)
    forward = forward - up * forward.dot(up)
    if forward.length < 0.0001:
        forward = Vector((0.0, 0.0, 1.0))
        forward = forward - up * forward.dot(up)
    forward.normalize()
    side = forward.cross(up).normalized()
    obj = uv_sphere(
        name, tuple(centre), (half_width, half_thickness, half_length),
        mat, zone, target=target, segments=64, rings=40,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Matrix((side, up, forward)).transposed().to_quaternion()
    parent_preserve_world(obj, parent)
    return obj


def leaf_blade(
    name, base, control, tip, width, thickness, mat, zone, target, parent,
    width_reference=(1.0, 0.0, 0.0),
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
        width_axis = Vector(width_reference)
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


def continuous_tube_path(name, points, radius, mat, zone, target, parent, closed=False):
    """Create one connected mechanical spine through an arbitrary path."""
    curve = bpy.data.curves.new(f"{name}.Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 5
    curve.bevel_depth = radius
    curve.bevel_resolution = 5
    curve.resolution_v = 2
    curve.fill_mode = "FULL"
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    spline.use_cyclic_u = closed
    for point, value in zip(spline.bezier_points, points):
        point.co = Vector(value)
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    target.objects.link(obj)
    parent_preserve_world(obj, parent)
    curve.materials.append(mat)
    obj["pico_material_zone"] = zone
    return obj


def ribbon_transport_frames(curve_point, steps, twist_degrees, lateral_reference):
    """Ribbon frames anchored on the head's lateral axis, plus the authored roll.

    Parallel transport drifts once the guide curve turns through a full arc,
    which left the top arc standing on its edge. Anchoring the flat face on the
    lateral axis keeps the band broad wherever the concept shows it broad. The
    roll profile then turns the band over on the way down, so it shows its lit
    outer face on the arc and its darker inner face on the fall.

    The shell, its dark carrier and its status edge all read the same frames,
    so the narrow status edge stays exactly on the band border instead of
    drifting off it as the band turns.
    """
    frames = []
    reference = Vector(lateral_reference).normalized()
    for index in range(steps + 1):
        amount = index / steps
        before = curve_point(max(0.0, amount - 0.002))
        after = curve_point(min(1.0, amount + 0.002))
        tangent = (after - before).normalized()
        face = reference - tangent * reference.dot(tangent)
        if face.length < 0.001:
            face = Vector((0.0, 1.0, 0.0))
            face = face - tangent * face.dot(tangent)
        face.normalize()
        width_axis = tangent.cross(face).normalized()
        progress = min(1.0, max(0.0, (amount - 0.28) / 0.72))
        eased = progress * progress * (3.0 - 2.0 * progress)
        width_axis = (
            Matrix.Rotation(math.radians(twist_degrees * eased), 4, tangent)
            @ width_axis
        )
        frames.append((
            tangent, width_axis, tangent.cross(width_axis).normalized(),
        ))
    return frames


def dish_amount(point, centre, radius, depth):
    """How deep a shallow round depression cuts in at one point.

    The dish is described once and read twice: the torso mesh is displaced by
    it and the chest rings are placed on it, so the recess and the parts
    sitting in it can never drift apart.
    """
    distance = (Vector(point) - Vector(centre)).length
    if distance >= radius:
        return 0.0
    return depth * 0.5 * (1.0 + math.cos(math.pi * distance / radius))


def apply_dish(obj, centre, radius, depth):
    """Press a round depression into a body revolved around the Y axis."""
    mesh = obj.data
    for vertex in mesh.vertices:
        amount = dish_amount(vertex.co, centre, radius, depth)
        if amount <= 0.0:
            continue
        outward = Vector((vertex.co.x, 0.0, vertex.co.z))
        if outward.length < 1e-6:
            continue
        vertex.co -= outward.normalized() * amount
    mesh.update()
    return obj


def truncate_head_front(obj, cut_z):
    """Cut the front off the head with a plane, the way a face is milled flat.

    A feathered flattening leaves the shell curved and merely pushed back, so
    the display still sits on a dome. A plane cut gives a genuinely flat face
    area, and its boundary needs no feather at all: outside the cut the shell
    is already behind the plane, so those vertices are simply left alone and
    the rim falls out as the natural intersection curve.
    """
    mesh = obj.data
    moved = 0
    for vertex in mesh.vertices:
        if vertex.co.z > cut_z:
            vertex.co.z = cut_z
            moved += 1
    mesh.update()
    print(f"PICO_HEAD_FRONT_CUT_VERTICES={moved}")
    return obj


def conforming_ring(
    name, centre_y, radius, tube_radius, inset, support_profile, mat, zone,
    target, parent, segments=96, dish=None,
):
    """A ring set into a curved surface, following it all the way round.

    A torus lies in one plane. On a body that curves in both directions such a
    ring surfaces on one side and disappears on the other, which reads as a
    crescent rather than as a recess. Sampling the surface per angle keeps the
    inset constant instead.
    """
    points = []
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        x = radius * math.cos(angle)
        y = centre_y + radius * math.sin(angle)
        z = support_surface_z(support_profile, x, y)
        if dish is not None:
            z -= dish_amount((x, y, z), *dish)
        points.append((x, y, z - inset))
    return continuous_tube_path(
        name, points, tube_radius, mat, zone, target, parent, closed=True,
    )


def light_guide_ribbon_mesh(
    name, curve_point, frames, segment_count, base_width, thickness,
    width_envelope, mat, inner_mat, zone, target, parent,
):
    """Create one connected, subtly segmented translucent light-guide shell.

    The shell stays a single closed band. Its outer and inner halves carry two
    material slots so a gentle twist alternately shows the lit outer surface
    and the darker inner one, which is what the concept ribbon does without
    ever splitting into a second strand.
    """
    along = len(frames) - 1
    around = 24
    vertices = []
    normals = []
    faces = []
    face_slots = []
    for ring in range(along + 1):
        amount = ring / along
        centre = curve_point(amount)
        _, width_axis, thickness_axis = frames[ring]

        width = base_width * width_envelope(amount)
        # The PAS segments are shallow light-guide joints in one shell, not
        # separate beads. A narrow groove at each boundary preserves the
        # segment count without breaking the silhouette or topology.
        segment_phase = amount * segment_count
        distance_to_joint = abs(segment_phase - round(segment_phase))
        joint = math.exp(-((distance_to_joint / 0.075) ** 2))
        # The end is a rounded closure, not a cut-off stump: over the last
        # stretch both half axes follow a quarter ellipse down to a small
        # residual disc, so the cap fan reads as a dome.
        closure = 1.0
        if amount > 0.925:
            local = (amount - 0.925) / 0.075
            closure = max(0.085, math.sqrt(max(0.0, 1.0 - local * local)))
        half_width = width * (1.0 - 0.055 * joint) * closure
        half_thickness = thickness * (1.0 - 0.12 * joint) * closure
        for segment in range(around):
            angle = 2.0 * math.pi * segment / around
            offset = (
                width_axis * (half_width * math.cos(angle))
                + thickness_axis * (half_thickness * math.sin(angle))
            )
            vertices.append(tuple(centre + offset))
            # A 12:1 flat cross section shades as a woven quilt if Blender has
            # to average normals over strongly non-planar quads. The elliptic
            # cross section has an exact normal, so the shell uses it directly.
            normals.append(tuple((
                width_axis * (math.cos(angle) / max(half_width, 1e-6))
                + thickness_axis * (math.sin(angle) / max(half_thickness, 1e-6))
            ).normalized()))

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
            # Slot 0 is the outer face, slot 1 the shaded inner face. The
            # split follows the thickness axis, so the twist decides which one
            # the camera sees at any point along the band.
            middle_angle = 2.0 * math.pi * (segment + 0.5) / around
            face_slots.append(0 if math.sin(middle_angle) >= 0.0 else 1)
    first_centre = len(vertices)
    vertices.append(tuple(curve_point(0.0)))
    normals.append(tuple(-frames[0][0]))
    last_centre = len(vertices)
    vertices.append(tuple(curve_point(1.0)))
    normals.append(tuple(frames[-1][0]))
    last = along * around
    for segment in range(around):
        nxt = (segment + 1) % around
        faces.append((first_centre, nxt, segment))
        face_slots.append(0)
        faces.append((last_centre, last + segment, last + nxt))
        face_slots.append(0)

    mesh = bpy.data.meshes.new(f"{name}.Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    parent_preserve_world(obj, parent)
    apply_material(obj, mat, zone)
    obj.data.materials.append(inner_mat)
    for polygon, slot in zip(mesh.polygons, face_slots):
        polygon.material_index = slot
    smooth(obj)
    if hasattr(mesh, "normals_split_custom_set_from_vertices"):
        mesh.normals_split_custom_set_from_vertices(normals)
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


def _loft(vertices, faces, rings, around, cap_start=True, cap_end=True):
    """Stitch a list of vertex rings into a closed tube inside a shared mesh."""
    base = len(vertices)
    for ring in rings:
        vertices.extend(ring)
    for index in range(len(rings) - 1):
        current = base + index * around
        following = current + around
        for segment in range(around):
            nxt = (segment + 1) % around
            faces.append((
                current + segment, current + nxt,
                following + nxt, following + segment,
            ))
    if cap_start:
        centre = len(vertices)
        vertices.append(tuple(
            sum((Vector(point) for point in rings[0]), Vector()) / around
        ))
        for segment in range(around):
            faces.append((centre, base + (segment + 1) % around, base + segment))
    if cap_end:
        centre = len(vertices)
        last = base + (len(rings) - 1) * around
        vertices.append(tuple(
            sum((Vector(point) for point in rings[-1]), Vector()) / around
        ))
        for segment in range(around):
            faces.append((centre, last + segment, last + (segment + 1) % around))


def _digit_rings(base, control, tip, radius_base, radius_tip, around, along=13):
    """Rings along one rounded, tapering finger following a quadratic curve."""
    base, control, tip = Vector(base), Vector(control), Vector(tip)
    rings = []
    for index in range(along + 1):
        amount = index / along
        inverse = 1.0 - amount
        centre = (
            inverse * inverse * base
            + 2.0 * inverse * amount * control
            + amount * amount * tip
        )
        tangent = (
            2.0 * inverse * (control - base) + 2.0 * amount * (tip - control)
        ).normalized()
        side = tangent.cross(Vector((0.0, 0.0, 1.0)))
        if side.length < 0.001:
            side = tangent.cross(Vector((0.0, 1.0, 0.0)))
        side.normalize()
        up = tangent.cross(side).normalized()
        radius = radius_base + (radius_tip - radius_base) * amount
        # a rounded fingertip rather than a cut-off stub
        if amount > 0.80:
            closing = (amount - 0.80) / 0.20
            radius *= max(0.06, math.sqrt(max(0.0, 1.0 - closing * closing)))
        rings.append([
            tuple(
                centre
                + side * (radius * math.cos(2.0 * math.pi * s / around))
                + up * (radius * math.sin(2.0 * math.pi * s / around))
            )
            for s in range(around)
        ])
    return rings


def joint_collar(name, start, end, radius, mat, zone, around=40, along=12):
    """A dark cuff wrapping the arm where it meets the body or bends.

    The concept board closes the arm against the torso with a collar rather
    than letting the shell run into the body, and marks the elbow the same
    way. The cuff is slightly wider than the arm underneath and barrels a
    little, so it reads as a fitted band and not as a sleeve.
    """
    start, end = Vector(start), Vector(end)
    axis = (end - start).normalized()
    side = axis.cross(Vector((0.0, 0.0, 1.0)))
    if side.length < 0.001:
        side = axis.cross(Vector((0.0, 1.0, 0.0)))
    side.normalize()
    up = axis.cross(side).normalized()
    rings = []
    for index in range(along + 1):
        amount = index / along
        centre = start + (end - start) * amount
        local = radius * (0.90 + 0.10 * math.sin(math.pi * amount))
        rings.append([
            tuple(
                centre
                + side * (local * math.cos(2.0 * math.pi * s / around))
                + up * (local * math.sin(2.0 * math.pi * s / around))
            )
            for s in range(around)
        ])
    vertices = []
    faces = []
    _loft(vertices, faces, rings, around)
    mesh = bpy.data.meshes.new(f"{name}.Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    MODEL.objects.link(obj)
    obj.parent = ROOT
    apply_material(obj, mat, zone)
    smooth(obj)
    return obj


def arm_shell(
    name, shoulder, elbow, wrist, radius_shoulder, radius_elbow, radius_wrist,
    mat, zone, around=40, along=30,
):
    """One continuous arm from the shoulder to the wrist.

    The concept board draws the arm as a single tapering piece, not as shells
    threaded onto a string of joint spheres. It bends through the elbow rather
    than being hinged at it, and its shoulder end is a rounded cap that closes
    against the torso.
    """
    shoulder = Vector(shoulder)
    elbow = Vector(elbow)
    wrist = Vector(wrist)
    # a quadratic whose control is placed so the curve passes through the elbow
    control = elbow * 2.0 - (shoulder + wrist) * 0.5

    rings = []
    for index in range(along + 1):
        amount = index / along
        inverse = 1.0 - amount
        centre = (
            inverse * inverse * shoulder
            + 2.0 * inverse * amount * control
            + amount * amount * wrist
        )
        tangent = (
            2.0 * inverse * (control - shoulder) + 2.0 * amount * (wrist - control)
        ).normalized()
        side = tangent.cross(Vector((0.0, 0.0, 1.0)))
        if side.length < 0.001:
            side = tangent.cross(Vector((0.0, 1.0, 0.0)))
        side.normalize()
        up = tangent.cross(side).normalized()
        if amount <= 0.5:
            local = amount / 0.5
            radius = radius_shoulder + (radius_elbow - radius_shoulder) * local
        else:
            local = (amount - 0.5) / 0.5
            radius = radius_elbow + (radius_wrist - radius_elbow) * local
        # both ends close as domes rather than as cut tubes
        if amount < 0.06:
            radius *= math.sqrt(max(0.0, 1.0 - ((0.06 - amount) / 0.06) ** 2)) * 0.6 + 0.4
        if amount > 0.94:
            radius *= math.sqrt(max(0.0, 1.0 - ((amount - 0.94) / 0.06) ** 2)) * 0.5 + 0.5
        rings.append([
            tuple(
                centre
                + side * (radius * math.cos(2.0 * math.pi * s / around))
                + up * (radius * math.sin(2.0 * math.pi * s / around))
            )
            for s in range(around)
        ])

    vertices = []
    faces = []
    _loft(vertices, faces, rings, around)
    mesh = bpy.data.meshes.new(f"{name}.Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    MODEL.objects.link(obj)
    obj.parent = ROOT
    apply_material(obj, mat, zone)
    smooth(obj)
    return obj


def hand_shell(
    name, wrist, knuckles, palm_normal, half_width, half_thickness, mat, zone,
    thumb_toward=(1.0, 0.0, 0.0), finger_length=0.100, palm_hollow=0.55,
    around=26, along=16,
):
    """One hand: a cupped palm carrying three fingers and a thumb.

    The concept hand is a single piece with four clearly separated, rounded
    digits, not a mitten and not a ball with sticks on it. Palm and digits are
    therefore built into one mesh and one object: they overlap where a hand's
    knuckles are, so the result reads as one form while each digit still tells
    itself apart.

    The palm is cupped rather than solid. A sphere reads as a knob; a real
    hand is a shell with a hollow in it.
    """
    wrist = Vector(wrist)
    knuckles = Vector(knuckles)
    forward = (knuckles - wrist)
    palm_length = forward.length
    forward.normalize()
    axis_palm = Vector(palm_normal)
    axis_palm = (axis_palm - forward * axis_palm.dot(forward)).normalized()
    axis_side = forward.cross(axis_palm).normalized()
    if axis_side.dot(Vector(thumb_toward)) < 0.0:
        # Which way the thumb falls follows from the frame, and the frame
        # differs between the hands because their palms face different ways.
        axis_side = -axis_side

    vertices = []
    faces = []

    # --- the palm -------------------------------------------------------
    rings = []
    for index in range(along + 1):
        u = index / along
        centre = wrist + forward * (palm_length * u)
        width = half_width * (0.74 + 0.26 * math.sin(math.pi * min(1.0, 0.34 + u * 0.58)))
        thick = half_thickness * (0.88 + 0.12 * math.sin(math.pi * min(1.0, 0.24 + u * 0.72)))
        ring = []
        for segment in range(around):
            angle = 2.0 * math.pi * segment / around
            across = math.copysign(abs(math.cos(angle)) ** (2.0 / 2.6), math.cos(angle))
            depth = math.copysign(abs(math.sin(angle)) ** (2.0 / 2.6), math.sin(angle))
            point = centre + axis_side * (width * across) + axis_palm * (thick * depth)
            hollow = (
                palm_hollow * half_thickness
                * math.exp(-(((u - 0.50) / 0.26) ** 2))
                * math.exp(-((across / 0.90) ** 2))
                * max(0.0, depth)
            )
            ring.append(tuple(point - axis_palm * hollow))
        rings.append(ring)
    _loft(vertices, faces, rings, around)

    # --- three fingers off the knuckle line ------------------------------
    digit_radius = half_width * 0.31
    for offset in (-0.54, 0.0, 0.54):
        length = finger_length * (1.0 if offset == 0.0 else 0.88)
        start = (
            knuckles
            + axis_side * (half_width * offset)
            - forward * (palm_length * 0.34)
            - axis_palm * (half_thickness * 0.20)
        )
        control = start + forward * (length * 0.66) - axis_palm * (length * 0.04)
        end = (
            start
            + forward * (length * 0.84)
            - axis_palm * (length * 0.52)
            + axis_side * (half_width * offset * 0.26)
        )
        _loft(
            vertices, faces,
            _digit_rings(start, control, end, digit_radius, digit_radius * 0.86, around),
            around,
        )

    # --- one thumb off the side of the palm ------------------------------
    thumb_length = finger_length * 0.74
    thumb_base = (
        wrist
        + forward * (palm_length * 0.46)
        + axis_side * (half_width * 0.42)
    )
    thumb_control = (
        thumb_base
        + axis_side * (thumb_length * 0.46)
        + forward * (thumb_length * 0.30)
    )
    thumb_end = (
        thumb_base
        + axis_side * (thumb_length * 0.52)
        + forward * (thumb_length * 0.86)
        - axis_palm * (thumb_length * 0.20)
    )
    _loft(
        vertices, faces,
        _digit_rings(
            thumb_base, thumb_control, thumb_end,
            digit_radius * 1.04, digit_radius * 0.88, around,
        ),
        around,
    )

    mesh = bpy.data.meshes.new(f"{name}.Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    MODEL.objects.link(obj)
    obj.parent = ROOT
    apply_material(obj, mat, zone)
    smooth(obj)
    return obj


def make_arm(side):
    sign = -1.0 if side == "L" else 1.0
    # Measured off docs/assets/pico-design-concept.png rather than estimated.
    # Calibrating on the torso width and the head-top-to-chest-core height, the
    # board's arm leaves the shoulder at 34.7 degrees below horizontal for
    # 0.314, then the forearm at 48.0 degrees for 0.170. The previous arm hung
    # at 46.5 and 66.8 degrees over 0.421 in total: too steep, too short, and
    # rooted too low, which is why it read wrong however its parts were built.
    #
    # The shoulder sits on the torso surface at that height, not inside it.
    if side == "L":
        shoulder = Vector((-0.352, -0.450, 0.000))
        elbow = Vector((-0.610, -0.629, 0.028))
        wrist = Vector((-0.724, -0.755, 0.072))
        palm = Vector((-0.724, -0.820, 0.088))
    else:
        shoulder = Vector((0.352, -0.450, 0.000))
        elbow = Vector((0.610, -0.629, 0.036))
        wrist = Vector((0.724, -0.755, 0.072))
        palm = Vector((0.724, -0.820, 0.088))
    # One continuous arm, as on the concept board: no shoulder, elbow or
    # wrist spheres threaded onto shell segments. The shoulder end is pushed
    # slightly into the torso so it closes against the body instead of
    # floating beside it.
    upper_direction = (elbow - shoulder).normalized()
    lower_direction = (wrist - elbow).normalized()
    # One continuous arm, as the concept board draws it: it bends *through*
    # the elbow instead of being hinged at it, so there is no string of shell
    # segments threaded onto joint spheres.
    #
    # The shoulder keeps its ball. It is what the arm turns on, and without it
    # the arm just grows out of the torso. It is seated deep enough that only
    # its outer cap shows past the shell, the way the board draws it: exposed,
    # it reads as a knob rather than as a joint.
    torso_seat = shoulder + (shoulder - elbow).normalized() * 0.030
    arm_shell(
        f"Shell.Arm.{side}",
        torso_seat, elbow, wrist,
        0.086, 0.066, 0.050,
        SHELL, "shell",
    )
    uv_sphere(
        f"Trim.Shoulder.{side}", shoulder - upper_direction * 0.034,
        (0.094, 0.098, 0.094),
        TRIM, "trim", segments=64, rings=40,
    )
    # The collar has to clear the arm all the way round. The arm bends through
    # the elbow, so on the inside of the bend it sits closer to the collar's
    # wall than the nominal radius suggests and pokes through a band sized to
    # that radius alone.
    joint_collar(
        f"Trim.Elbow.{side}",
        elbow - upper_direction * 0.020,
        elbow + lower_direction * 0.022,
        0.080, TRIM, "trim",
    )

    # The back of the hand faces outward, so the palm turns toward the body and
    # the hand reads narrow from the front. Facing the palm forward turns the
    # same hand into a raised, open gesture; the thumb then points forward.
    palm_normal = (-sign, 0.0, 0.0)
    hand_direction = (palm - wrist).normalized()
    hand_shell(
        f"Trim.Hand.{side}",
        wrist - hand_direction * 0.020,
        wrist + hand_direction * 0.082,
        palm_normal,
        0.080, 0.036, TRIM, "trim",
        thumb_toward=(0.0, 0.0, 1.0),
        finger_length=0.116,
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
            dome_radius_x=FACE_DOME_RADIUS_X, dome_radius_y=FACE_DOME_RADIUS_Y,
        ) + 0.0035
        point.co = (x, y, z, 1.0)
    mouth = bpy.data.objects.new("PREVIEW.Status.Mouth", curve)
    PREVIEW.objects.link(mouth)
    mouth.visible_shadow = False
    curve.materials.append(STATUS)
    mouth["pico_material_zone"] = "status_emitters"


def head_module_material(name, hue, chroma, translucency, face="outer"):
    # The personal colour remains a material property. It is deliberately not
    # emission: the PAS neon impression comes from a translucent light guide,
    # reflections and the separate status core.
    #
    # The band is one closed light guide, but a twisted ribbon alternately
    # shows its outer surface and its shaded inner surface. Both faces are the
    # same personal colour; only the inner one is darker, so the twist reads
    # without inventing a second hair branch or a second identity.
    inner = face == "inner"
    chroma_amount = chroma / 255.0
    translucency_amount = translucency / 255.0
    # Hue 286 is blue-violet in the PAS concept. HSV would turn it pink, so the
    # diagnostic renderer uses a bounded OKLCH-like material corridor and hands
    # Blender linear RGB values. This mapping remains diagnostic, not frozen.
    lightness = 0.500 + 0.140 * translucency_amount
    corridor_chroma = 0.040 + 0.180 * chroma_amount
    if inner:
        lightness *= 0.86
        corridor_chroma *= 0.94
    hue_radians = math.radians(hue % 360)
    axis_a = corridor_chroma * math.cos(hue_radians)
    axis_b = corridor_chroma * math.sin(hue_radians)
    cone_l = lightness + 0.3963377774 * axis_a + 0.2158037573 * axis_b
    cone_m = lightness - 0.1055613458 * axis_a - 0.0638541728 * axis_b
    cone_s = lightness - 0.0894841775 * axis_a - 1.2914855480 * axis_b
    cone_l, cone_m, cone_s = cone_l ** 3, cone_m ** 3, cone_s ** 3
    rgb = tuple(max(0.0, min(1.0, channel)) for channel in (
        4.0767416621 * cone_l - 3.3077115913 * cone_m + 0.2309699292 * cone_s,
        -1.2684380046 * cone_l + 2.6097574011 * cone_m - 0.3413193965 * cone_s,
        -0.0041960863 * cone_l - 0.7034186147 * cone_m + 1.7076147010 * cone_s,
    ))
    result = material(
        f"PICO_ZONE_head_module.{name}" + ("Inner" if inner else ""), rgb,
        metallic=0.02,
        roughness=(0.19 - 0.06 * translucency_amount) * (1.35 if inner else 1.0),
        transmission=(0.16 + 0.44 * translucency_amount) * (0.62 if inner else 1.0),
        alpha=1.0,
        ior=1.46,
        coat=0.32 if not inner else 0.10,
    )
    result["pico_material_role"] = "personal_translucent_shell"
    result["pico_material_face"] = face
    result["pico_personal_hue"] = hue
    result["pico_personal_chroma"] = chroma
    result["pico_personal_translucency"] = translucency
    result["pico_free_emission"] = False
    return result


def cubic_point(start, control_a, control_b, end, amount):
    inverse = 1.0 - amount
    return (
        inverse ** 3 * start
        + 3.0 * inverse ** 2 * amount * control_a
        + 3.0 * inverse * amount ** 2 * control_b
        + amount ** 3 * end
    )


def head_recipe_amounts(geometry):
    """Normalise one PAS recipe into the amounts every builder works with."""
    return {
        "anchor": geometry["anchor"] / 255.0,
        "side": geometry["side"] / 96.0,
        "length": geometry["length"] / 255.0,
        "lift": geometry["lift"] / 255.0,
        "sweep": geometry["sweep"] / 127.0,
        "curl": geometry["curl"] / 127.0,
        "width": geometry["width"] / 255.0,
        "taper": geometry["taper"] / 255.0,
        "twist": geometry["twist"] / 127.0,
        "partOffset": geometry["partOffset"] / 96.0,
        "partDepth": geometry["partDepth"] / 192.0,
        "crownBias": geometry["crownBias"] / 96.0,
        "rootSpread": 0.060 + 0.075 * (geometry["rootSpread"] - 48) / 144.0,
        "segments": geometry["segments"],
    }


# Where the hair leaves the plate it is held together, as a ponytail is by its
# tie: it starts at this fraction of the full band width and opens out over
# this fraction of its length. It stays one closed light guide throughout --
# ADR 0125 rules out a group of separate strands.
GATHER_WIDTH = 0.46
GATHER_LENGTH = 0.20


def rear_ribbon_guide(support_profile, amounts):
    """The single source of the rear-ribbon fitting, guide curve and frames.

    The module builder and the corridor clearance check both read this, so a
    clearance result always describes the geometry that would actually be
    built, never a second approximation of it.
    """
    anchor_amount = amounts["anchor"]
    side_amount = amounts["side"]
    length_amount = amounts["length"]
    lift_amount = amounts["lift"]
    sweep_amount = amounts["sweep"]
    curl_amount = amounts["curl"]
    width_amount = amounts["width"]
    taper_amount = amounts["taper"]
    twist_amount = amounts["twist"]
    root_spread = amounts["rootSpread"]
    segments = amounts["segments"]
    side_direction = 1.0 if side_amount >= 0.0 else -1.0

    # The fitting lies on the sampled crown surface and is sunk into it.
    # `anchor` slides it along the crown. It never sits on a stalk, and the
    # personal colour only starts at its rear edge.
    # The plate sits on the centre line of the crown; `side` still shifts it,
    # but no longer off a constant lateral offset the concept does not have.
    fitting_x = side_amount * 0.055
    # The plate is a circle. One radius drives both of its in-plane axes, so
    # `rootSpread` can never stretch it back into an oval.
    fitting_radius = 0.080 + root_spread * 0.43
    fitting_half_length = fitting_radius
    fitting_half_width = fitting_radius
    fitting_half_thickness = 0.028 + root_spread * 0.115
    # A rear-flowing ribbon roots on the rear half of the crown. `anchor`
    # still slides the plate, but within that half: rooted further forward the
    # broad band has to turn over the dome itself, and its lower edge cuts
    # into the shell while it does — which the corridor check catches.
    #
    # The position is a fraction of how deep the head actually is, not a fixed
    # depth. Shortening the head's back moved a fixed depth from the middle of
    # the crown to its rim, and the plate slid off the crown with it.
    rear_depth = HEAD_MAX_DEPTH * (1.0 - HEAD_REAR_REDUCTION)
    fitting_z = -rear_depth * (0.34 + anchor_amount * 0.20)
    front_z = fitting_z + fitting_half_length
    rear_z = fitting_z - fitting_half_length

    def crown_point(x, z):
        return Vector((x, head_surface_y(support_profile, x, z), z))

    def root_curve_point(amount):
        z = front_z + (rear_z - front_z) * amount
        return crown_point(fitting_x, z)

    fitting_front = root_curve_point(0.0)
    fitting_rear = root_curve_point(1.0)
    fitting_normal = head_surface_normal(support_profile, fitting_x, fitting_z)
    embed = fitting_normal * fitting_half_thickness * 0.40
    # The hair leaves the plate at its centre, so the plate sits around the
    # root rather than in front of it.
    root = root_curve_point(0.52) - fitting_normal * fitting_half_thickness * 0.30

    lateral_reach = (
        0.190 + length_amount * 0.170 + abs(side_amount) * 0.100
    )
    crown_bias = amounts["crownBias"]
    rear_reach = (
        0.150 + length_amount * 0.170
        + max(0.0, sweep_amount) * 0.050
        + max(0.0, crown_bias) * 0.035
    )
    # Measured against the concept: the band's upper edge clears the local
    # crown by about one sixth of the head height, not by a third. The apex is
    # the centre line, so half the band width sits above it.
    base_width = 0.098 + width_amount * 0.062
    # The silhouette is the band's upper edge, not its centre line, and it is
    # read against the crown rather than against the root. `anchor` slides the
    # plate along the crown, so a fixed rise above the root either grazed the
    # head at the front or turned into a spike at the back.
    head_top = support_profile[0][0]
    apex_top_y = (
        head_top + 0.110 + lift_amount * 0.075 + max(0.0, crown_bias) * 0.025
    )
    # At the apex the band stands on edge, so its lower edge has to clear the
    # crown as well. The apex position in x and z is already known here, so
    # the head height underneath it can be sampled directly.
    apex_x = root.x + side_direction * lateral_reach * 0.34
    apex_z = root.z - rear_reach * 0.42
    clearance_apex_y = (
        head_surface_y(support_profile, apex_x, apex_z) + base_width + 0.030
    )
    apex_y = max(clearance_apex_y, apex_top_y - base_width)
    arch_height = max(0.050, apex_y - root.y)
    drop = (
        0.215 + length_amount * 0.225
        + max(0.0, sweep_amount) * 0.030
    )
    thickness = 0.008 + width_amount * 0.005
    curl_lift = 0.055 + abs(curl_amount) * 0.160

    # A short, full, strongly rounded top arc. The apex sits early along the
    # reach, so the band loops over the crown instead of drawing the long
    # inverted J the first proposal had.
    arch = root + Vector((
        side_direction * lateral_reach * 0.34,
        arch_height,
        -rear_reach * 0.42,
    ))
    # The band falls behind the head, so the fall is placed against the head's
    # rear rather than against the root. Measured from the root alone, a plate
    # sitting far forward sent the fall straight down through the skull.
    head_half_depth = max(row[2] for row in support_profile)
    rear_limit = -(head_half_depth + thickness + 0.022)
    hanging = Vector((
        root.x + side_direction * lateral_reach,
        root.y - drop,
        min(root.z - rear_reach, rear_limit),
    ))
    tip = hanging + Vector((
        side_direction * (0.160 + abs(curl_amount) * 0.220),
        curl_lift if curl_amount >= 0.0 else -curl_lift,
        rear_reach * (0.06 + abs(curl_amount) * 0.075),
    ))

    rise_controls = (
        # Hair leaves its root along the root's own normal, far enough that the
        # broad band has turned clear of the crown before it curves back. The
        # band is wide, so half its width is the distance that matters: with a
        # shorter lead-in its lower edge dipped into the shell early in the
        # rise, which the corridor check caught at `anchor = 0`.
        root
        + fitting_normal * max(arch_height * 0.92, base_width * 0.85)
        + Vector((side_direction * lateral_reach * 0.02, 0.0, 0.0)),
        arch + Vector((
            -side_direction * lateral_reach * 0.30,
            arch_height * 0.05,
            rear_reach * 0.26,
        )),
    )
    # The three cubic sections have to leave each join along the direction they
    # arrived on. Without that the band turned a corner at the hanging point
    # and folded over itself at the hook.
    fall_controls = (
        arch + (arch - rise_controls[1]) * 0.95,
        hanging + Vector((
            -side_direction * lateral_reach * 0.05,
            drop * 0.48,
            -rear_reach * 0.02,
        )),
    )
    curl_controls = (
        hanging + (hanging - fall_controls[1]) * 0.55,
        tip + Vector((
            -side_direction * 0.170,
            -curl_lift * 0.52,
            -rear_reach * 0.02,
        )),
    )
    rise_end, fall_end = 0.30, 0.78

    def curve_point(amount):
        if amount <= rise_end:
            return cubic_point(
                root, rise_controls[0], rise_controls[1], arch,
                amount / rise_end,
            )
        if amount <= fall_end:
            return cubic_point(
                arch, fall_controls[0], fall_controls[1], hanging,
                (amount - rise_end) / (fall_end - rise_end),
            )
        return cubic_point(
            hanging, curl_controls[0], curl_controls[1], tip,
            (amount - fall_end) / (1.0 - fall_end),
        )

    # The concept band always turns; `twist` modulates that turn rather than
    # switching it on. Roughly half a turn over the whole length shows the
    # outer face on the arc and the darker inner face on the fall. It stays
    # one guide curve and never becomes a second branch.
    twist_degrees = 150.0 + 44.0 * twist_amount

    def width_envelope(amount):
        # A ponytail is gathered where it leaves its fitting and only opens
        # out afterwards. Full width from the top arc on, then a controlled
        # taper towards the rounded tip.
        gather = GATHER_WIDTH + (1.0 - GATHER_WIDTH) * min(
            1.0, (amount / GATHER_LENGTH) ** 0.75
        )
        late = max(0.0, (amount - 0.42) / 0.58)
        return gather * (1.0 - 0.58 * taper_amount * late ** 1.20)

    steps = max(96, segments * 20)
    frames = ribbon_transport_frames(
        curve_point, steps, twist_degrees,
        lateral_reference=(side_direction, 0.0, 0.0),
    )
    return {
        "side_direction": side_direction,
        "root_curve_point": root_curve_point,
        "fitting_front": fitting_front,
        "fitting_rear": fitting_rear,
        # The chord midpoint sits a sagitta below the shell. Taking the sampled
        # surface point instead is what keeps the plate low but visible.
        "fitting_centre": crown_point(fitting_x, fitting_z),
        "fitting_normal": fitting_normal,
        "fitting_radius": fitting_radius,
        "fitting_half_width": fitting_half_width,
        "fitting_half_thickness": fitting_half_thickness,
        "embed": embed,
        "root": root,
        "arch": arch,
        "hanging": hanging,
        "tip": tip,
        "curve_point": curve_point,
        "width_envelope": width_envelope,
        "base_width": base_width,
        "thickness": thickness,
        "twist_degrees": twist_degrees,
        "frames": frames,
        "steps": steps,
    }


def head_shell_penetration(support_profile, point):
    """How deep a point sits inside the revolved head shell. 0.0 means clear."""
    x, y, z = point
    top = support_profile[0][0]
    bottom = support_profile[-1][0]
    if y > top or y < bottom:
        return 0.0
    return max(0.0, support_surface_z(support_profile, x, y) - abs(head_rear_unscale(z)))


def side_module_penetration(point, half=(0.055, 0.140, 0.145), centre=(0.484, -0.075, 0.0)):
    """How deep a point sits inside either head side module. 0.0 means clear."""
    x, y, z = point
    inside = (
        half[0] - abs(abs(x) - centre[0]),
        half[1] - abs(y - centre[1]),
        half[2] - abs(z - centre[2]),
    )
    return max(0.0, min(inside)) if min(inside) > 0.0 else 0.0


def rear_ribbon_clearance(support_profile, geometry, root_zone=0.12):
    """Deepest collision of one recipe's band with head or side module.

    The root zone is skipped on purpose: the fitting is meant to be embedded
    in the crown. Everything after it has to stay clear of head, visor and
    side module at every valid corridor value.
    """
    amounts = head_recipe_amounts(geometry)
    guide = rear_ribbon_guide(support_profile, amounts)
    worst_head = 0.0
    worst_module = 0.0
    steps = guide["steps"]
    for index in range(steps + 1):
        amount = index / steps
        if amount < root_zone:
            continue
        centre = guide["curve_point"](amount)
        _, edge_axis, face_axis = guide["frames"][index]
        half_width = guide["base_width"] * guide["width_envelope"](amount)
        for width_sign in (-1.0, 0.0, 1.0):
            for face_sign in (-1.0, 0.0, 1.0):
                point = (
                    centre
                    + edge_axis * (half_width * width_sign)
                    + face_axis * (guide["thickness"] * face_sign)
                )
                worst_head = max(
                    worst_head, head_shell_penetration(support_profile, point)
                )
                worst_module = max(worst_module, side_module_penetration(point))
    return worst_head, worst_module


def rear_ribbon_corridor_extremes(base_geometry):
    """Valid corridor endpoints for every PAS geometry field, one at a time."""
    corridor = {
        "anchor": (0, 255), "side": (-96, 96), "length": (0, 255),
        "lift": (0, 255), "sweep": (-127, 127), "curl": (-127, 127),
        "width": (0, 255), "taper": (0, 255), "twist": (-127, 127),
        "segments": (3, 9), "partOffset": (-96, 96), "partDepth": (0, 192),
        "crownBias": (-96, 96), "rootSpread": (48, 192),
    }
    cases = [("authored", dict(base_geometry))]
    for field, bounds in corridor.items():
        for bound in bounds:
            geometry = dict(base_geometry)
            geometry[field] = bound
            cases.append((f"{field}={bound}", geometry))
    return cases


def check_rear_ribbon_corridor(support_profile, base_geometry, tolerance=0.0015):
    """Fail the build if any valid corridor value drives the band into the head."""
    checked = 0
    worst = ("", 0.0, 0.0)
    for label, geometry in rear_ribbon_corridor_extremes(base_geometry):
        amounts = head_recipe_amounts(geometry)
        rear_flow = min(1.0, max(0.0, (
            amounts["length"] * 0.52
            + max(0.0, amounts["sweep"]) * 0.32
            + max(0.0, amounts["crownBias"]) * 0.16
        )))
        if rear_flow < 0.58:
            continue
        head, module = rear_ribbon_clearance(support_profile, geometry)
        checked += 1
        if max(head, module) > max(worst[1], worst[2]):
            worst = (label, head, module)
        if head > tolerance or module > tolerance:
            raise ValueError(
                f"rear ribbon collides at {label}: "
                f"head={head:.4f} side_module={module:.4f}"
            )
    print(
        f"PICO_HEAD_CORRIDOR_CHECKED={checked} "
        f"worst_case={worst[0] or 'none'} "
        f"head_penetration={worst[1]:.5f} side_module_penetration={worst[2]:.5f}"
    )
    return checked


def report_personal_colour_corridor(name, hues, chromas, translucencies):
    """Print the personal shell colour for corridor samples, and prove it moves."""
    seen = []
    for hue in hues:
        for chroma in chromas:
            for translucency in translucencies:
                mat = head_module_material(
                    f"{name}.Probe", hue, chroma, translucency,
                )
                shader = mat.node_tree.nodes["Principled BSDF"]
                rgb = tuple(
                    round(value, 4)
                    for value in shader.inputs["Base Color"].default_value[:3]
                )
                transmission = round(
                    shader.inputs["Transmission Weight"].default_value, 4
                )
                print(
                    f"PICO_HEAD_PERSONAL_COLOUR=hue{hue} chroma{chroma} "
                    f"translucency{translucency} rgb={rgb} "
                    f"transmission={transmission}"
                )
                seen.append((rgb, transmission))
                bpy.data.materials.remove(mat)
    if len({item[0] for item in seen}) != len(seen):
        raise ValueError("personal colour corridor is not injective")
    return len(seen)


def make_procedural_head_variant(
    name, vector_name, recipe, target, mount, support_profile,
):
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
    for field, value in geometry.items():
        target[f"pico_geometry_{field}"] = value
    for field, value in appearance.items():
        target[f"pico_material_{field}"] = value

    module_mat = head_module_material(
        name,
        appearance["hue"],
        appearance["chroma"],
        appearance["translucency"],
    )
    module_inner_mat = head_module_material(
        name,
        appearance["hue"],
        appearance["chroma"],
        appearance["translucency"],
        face="inner",
    )

    amounts = head_recipe_amounts(geometry)
    anchor_amount = amounts["anchor"]
    side_amount = amounts["side"]
    length_amount = amounts["length"]
    lift_amount = amounts["lift"]
    sweep_amount = amounts["sweep"]
    curl_amount = amounts["curl"]
    width_amount = amounts["width"]
    taper_amount = amounts["taper"]
    twist_amount = amounts["twist"]
    part_offset = amounts["partOffset"]
    part_depth = amounts["partDepth"]
    crown_bias = amounts["crownBias"]
    root_spread = amounts["rootSpread"]
    segments = amounts["segments"]

    # Recipes move continuously from a compact crown toward a rear-flowing
    # ribbon. The threshold chooses a safe topology; there is no stored style
    # enum and every shape and material value still comes from the PAS recipe.
    rear_flow = min(1.0, max(0.0, (
        length_amount * 0.52
        + max(0.0, sweep_amount) * 0.32
        + max(0.0, crown_bias) * 0.16
    )))
    long_rear_ribbon = rear_flow >= 0.58
    if long_rear_ribbon:
        guide = rear_ribbon_guide(support_profile, amounts)
        side_direction = guide["side_direction"]
        root_curve_point = guide["root_curve_point"]
        curve_point = guide["curve_point"]
        width_envelope = guide["width_envelope"]
        ribbon_base_width = guide["base_width"]
        ribbon_thickness = guide["thickness"]
        ribbon_frames = guide["frames"]
        ribbon_steps = guide["steps"]
        embed = guide["embed"]

        def ribbon_frame(amount):
            index = min(ribbon_steps, max(0, int(round(amount * ribbon_steps))))
            _, edge_axis, face_axis = ribbon_frames[index]
            return edge_axis, face_axis, ribbon_base_width * width_envelope(amount)

        # One connected mechanical spine remains visible through the personal
        # shell. It is deliberately non-emissive, begins in one root collar and
        # runs on into the band as a single structure.
        spine_points = []
        for index in range(9):
            spine_points.append(root_curve_point(index / 8.0) - embed * 0.55)
        for index in range(1, 41):
            amount = index / 40.0 * 0.86
            edge_axis, _, local_width = ribbon_frame(amount)
            edge_offset = min(1.0, amount / 0.14) * local_width * -0.38
            spine_points.append(curve_point(amount) + edge_axis * edge_offset)
        carrier = continuous_tube_path(
            f"HeadModule.{name}.InnerCarrier",
            spine_points,
            min(0.010 + width_amount * 0.006, ribbon_thickness * 0.68),
            TRIM,
            "trim",
            target,
            mount,
        )
        carrier["pico_head_module_section"] = "carrier"
        carrier["pico_spans_root_and_hair"] = True

        fitting_centre = guide["fitting_centre"] - embed
        fitting_along = guide["fitting_rear"] - guide["fitting_front"]

        # Exactly one dark mechanical collar under the fitting, with exactly
        # one mounting point where the carrier leaves it. It shares the
        # fitting's tangential orientation and sits deeper, so it reads as a
        # dark seam beneath the bright plate instead of riding on top of it.
        collar = tangent_plate(
            f"HeadModule.{name}.RootCollar",
            fitting_centre
            - guide["fitting_normal"] * guide["fitting_half_thickness"] * 0.42,
            guide["fitting_normal"],
            fitting_along,
            guide["fitting_radius"] * 0.92,
            guide["fitting_radius"] * 0.92,
            guide["fitting_half_thickness"] * 0.72,
            TRIM,
            "trim",
            target,
            mount,
        )
        collar["pico_head_module_section"] = "root_collar"
        collar["pico_mount_points"] = 1

        root_shell = tangent_plate(
            f"HeadModule.{name}.HairRoot",
            fitting_centre,
            guide["fitting_normal"],
            fitting_along,
            guide["fitting_radius"],
            guide["fitting_radius"],
            guide["fitting_half_thickness"],
            SHELL,
            "trim",
            target,
            mount,
        )
        root_shell["pico_head_module_section"] = "hair_root"
        root_shell["pico_surface_embedded"] = True

        translucent_hair = light_guide_ribbon_mesh(
            f"HeadModule.{name}.TranslucentHair",
            curve_point,
            ribbon_frames,
            segments,
            ribbon_base_width,
            ribbon_thickness,
            width_envelope,
            module_mat,
            module_inner_mat,
            "head_module",
            target,
            mount,
        )
        translucent_hair["pico_head_module_section"] = "hair_length"
        translucent_hair["pico_follows_section"] = "hair_root"
        translucent_hair["pico_twist_degrees"] = guide["twist_degrees"]

        if part_depth > 0.0:
            # The parting seam stays inside the shared root zone and stops
            # before the band starts.
            seam_offset = Vector((
                side_direction * part_offset * root_spread * 0.25,
                0.004 + part_depth * 0.003,
                0.0,
            ))
            # The hair now leaves the plate at its centre, so the seam has to
            # stop short of that instead of running the whole plate length.
            seam_points = [
                root_curve_point(index / 10.0 * 0.42)
                + seam_offset * (1.0 - index / 10.0)
                for index in range(11)
            ]
            seam = continuous_tube_path(
                f"HeadModule.{name}.PartSeam",
                seam_points,
                0.0015 + part_depth * 0.0025,
                TRIM,
                "trim",
                target,
                mount,
            )
            seam["pico_seam_ends_before_band"] = True

        status_points = []
        for index in range(41):
            amount = 0.10 + index * 0.86 / 40.0
            centre = curve_point(amount)
            edge_axis, face_axis, local_width = ribbon_frame(amount)
            status_points.append(
                centre
                + edge_axis * local_width * 0.80
                + face_axis * ribbon_thickness * 0.80
            )
        continuous_tube_path(
            f"Status.HeadAccent.{name}",
            status_points,
            0.0055,
            STATUS,
            "status_emitters",
            target,
            mount,
        )

        # The silhouette landmarks are stored so the validator can check the
        # authored arc, drop and tip instead of only a bounding box.
        target["pico_module_root"] = list(guide["root"])
        target["pico_module_apex"] = list(guide["arch"])
        target["pico_module_hanging"] = list(guide["hanging"])
        target["pico_module_tip"] = list(guide["tip"])
        target["pico_module_twist_degrees"] = guide["twist_degrees"]
        target["pico_module_band_width"] = ribbon_base_width * 2.0
        target["pico_module_root_width"] = (
            ribbon_base_width * width_envelope(0.0) * 2.0
        )
        target["pico_module_fitting_is_circular"] = True
        target["pico_module_arc_width"] = (
            ribbon_base_width * width_envelope(0.30) * 2.0
        )
        target["pico_module_tip_width"] = (
            ribbon_base_width * width_envelope(1.0) * 2.0
        )
        target["pico_module_fitting_width"] = guide["fitting_half_width"] * 2.0
        target["pico_module_fitting_thickness"] = (
            guide["fitting_half_thickness"] * 2.0
        )
    else:
        # Compact recipes become the three-to-four broad crown blades visible
        # in the expression concept. Their roots follow the front/rear crown
        # arc; they do not fan sideways like leaves or read as horns.
        start = Vector((
            side_amount * 0.030,
            mount.location.y + 0.004,
            0.070 - anchor_amount * 0.090,
        ))
        total_lift = (
            0.145 + lift_amount * 0.185
            + max(0.0, -crown_bias) * 0.035
        )
        rear_lean = (
            0.060
            + max(sweep_amount, -0.25) * 0.100
            + length_amount * 0.120
            + lift_amount * 0.100
            + max(0.0, crown_bias) * 0.050
        )
        root_points = []
        blade_records = []
        twist_radians = math.radians(twist_amount * 32.0)
        blade_width_reference = (
            math.cos(twist_radians),
            0.0,
            math.sin(twist_radians),
        )
        for index in range(segments):
            amount = 0.5 if segments == 1 else index / (segments - 1)
            centred = amount - 0.5
            root_x = (
                start.x + part_offset * root_spread * 0.18
                + centred * root_spread * 0.72
            )
            root_z = start.z - centred * root_spread * 1.85
            crown_radius = math.sqrt(root_x * root_x + root_z * root_z)
            root_y = 0.420 - crown_radius * 0.24
            base = Vector((root_x, root_y, root_z))
            root_points.append(base)
            peak = max(0.0, 1.0 - abs(centred - 0.12) * 1.55)
            blade_height = total_lift * (0.54 + 0.46 * peak)
            lean = rear_lean * (0.58 + 0.42 * peak)
            tip = base + Vector((
                side_amount * 0.018 + centred * 0.135,
                blade_height + max(0.0, curl_amount) * 0.018 * peak,
                -lean * (0.25 + 0.75 * peak)
                + centred * 0.045
                + curl_amount * 0.018,
            ))
            blade_control = base + Vector((
                side_amount * 0.010 + centred * 0.025,
                blade_height * 0.53,
                -lean * 0.12 + centred * 0.018,
            ))
            blade_width = (
                0.052 + width_amount * 0.040
            ) * (0.82 + 0.18 * peak) * (1.0 - taper_amount * 0.10)
            blade_thickness = max(0.012, blade_width * 0.17)
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
                width_reference=blade_width_reference,
            )
            blade_records.append((
                blade_height, base, blade_control, tip, blade_thickness,
            ))

        root_front = root_points[0]
        root_back = root_points[-1]
        root_middle = (root_front + root_back) * 0.5 + Vector((0.0, 0.012, 0.0))
        carrier_radius = 0.012 + width_amount * 0.007
        curved_tapered_digit(
            f"HeadModule.{name}.InnerCarrier",
            root_front,
            root_middle,
            root_back,
            carrier_radius,
            carrier_radius * 0.92,
            TRIM,
            "trim",
            target=target,
            parent=mount,
        )
        oriented_ellipsoid_between(
            f"HeadModule.{name}.RootCollar",
            root_front,
            root_back,
            0.026 + root_spread * 0.10,
            0.010,
            TRIM,
            "trim",
            target,
            mount,
        )
        if part_depth > 0.0:
            seam_points = [
                root_front * (1.0 - amount) + root_back * amount
                + Vector((part_offset * root_spread * 0.18, 0.006, 0.0))
                for amount in (0.18, 0.34, 0.50, 0.66, 0.82)
            ]
            continuous_tube_path(
                f"HeadModule.{name}.PartSeam",
                seam_points,
                0.0015 + part_depth * 0.0025,
                TRIM,
                "trim",
                target,
                mount,
            )

        _, accent_base, accent_control, accent_tip, accent_offset = max(
            blade_records,
            key=lambda record: record[0],
        )
        status_points = []
        for index in range(13):
            amount = 0.16 + index * 0.68 / 12.0
            inverse = 1.0 - amount
            point = (
                inverse * inverse * accent_base
                + 2.0 * inverse * amount * accent_control
                + amount * amount * accent_tip
            )
            status_points.append(
                point + Vector((accent_offset * 0.90, 0.0, 0.0))
            )
        continuous_tube_path(
            f"Status.HeadAccent.{name}",
            status_points,
            0.0048,
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


def make_head_identity_carrier(
    selector_name, identity_kind, recipe_name, target, mount, visible_index,
    objects,
):
    carrier = bpy.data.objects.new(f"PICO_HEAD_SELECTOR_{selector_name}", None)
    target.objects.link(carrier)
    carrier.parent = mount
    carrier.matrix_parent_inverse = Matrix.Identity(4)
    carrier.matrix_basis = Matrix.Identity(4)
    carrier.empty_display_type = "CIRCLE"
    carrier.empty_display_size = 0.045
    carrier["pico_head_identity"] = identity_kind
    carrier["pico_recipe_name"] = recipe_name
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
            "1 concept crown crest, 2 concept rear ribbon"
        ),
    )
    selector_sources = (
        (
            "standard_antenna", "standard_antenna", "none",
            MODEL, STANDARD_ANTENNA_OBJECTS,
        ),
        (
            "head_raised_crown", "procedural_neon_hair", "head-raised-crown",
            HEAD_RECIPE_COLLECTIONS["head-raised-crown"],
            tuple(HEAD_RECIPE_COLLECTIONS["head-raised-crown"].all_objects),
        ),
        (
            "head_long_neon_tail", "procedural_neon_hair", "head-long-neon-tail",
            HEAD_RECIPE_COLLECTIONS["head-long-neon-tail"],
            tuple(HEAD_RECIPE_COLLECTIONS["head-long-neon-tail"].all_objects),
        ),
    )
    for visible_index, (
        selector_name, identity_kind, recipe_name, target, objects,
    ) in enumerate(selector_sources):
        HEAD_IDENTITY_CARRIERS[selector_name] = make_head_identity_carrier(
            selector_name,
            identity_kind,
            recipe_name,
            target,
            mount,
            visible_index,
            objects,
        )
    bpy.context.view_layer.update()


def select_head_identity(name):
    indices = {
        "standard_antenna": 0,
        "head_raised_crown": 1,
        "head_long_neon_tail": 2,
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
        "head_raised_crown": 1,
        "head_long_neon_tail": 2,
    }
    selected = indices[name]
    for index, carrier_name in enumerate((
        "standard_antenna",
        "head_raised_crown",
        "head_long_neon_tail",
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
HEAD_CROWN = collection("HEAD_RECIPE_head_raised_crown", HEAD_VARIANTS)
HEAD_TAIL = collection("HEAD_RECIPE_head_long_neon_tail", HEAD_VARIANTS)
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
# The two segments meet at the head's widest, deepest section. Their control
# points are collinear across that join, so the profile has a continuous
# tangent there: with the depth slope flipping sign the back of the head
# carried a visible crease.
head_profile = sample_bezier_segments([
    (
        (0.395, 0.005, 0.020),
        (0.395, 0.240, 0.180),
        (0.170, 0.480, 0.432),
        (-0.062, 0.500, 0.432),
    ),
    (
        (-0.062, 0.500, 0.432),
        (-0.1404, 0.5068, 0.432),
        (-0.300, 0.380, 0.320),
        (-0.395, 0.200, 0.180),
    ),
], steps=48)
HEAD_SHELL = revolved_mesh("Shell.Head", head_profile, SHELL, "shell", interpolate=False)

# The larger trim patch forms the visible visor frame. The dark face keeps a
# shallower curvature than the helmet so expressions read as lying on a
# display instead of floating in front of a sphere.
FACE_CENTRE_Y = -0.035
FACE_RADIUS_X = 0.347
FACE_RADIUS_Y = 0.253
FACE_FRAME_RADIUS_X = 0.360
FACE_FRAME_RADIUS_Y = 0.263
# The display keeps the curvature it had before the head was cut. That
# curvature used to come from the patch partly following the round shell;
# with the shell cut away it has to be an explicit dome instead. Its sag from
# centre to the display's rim matches the earlier surface.
FACE_DOME_RADIUS_X = 0.360
FACE_DOME_RADIUS_Y = 0.263
FACE_FRAME_BULGE = 0.080
# The head is cut off at the front with a plane, and the display assembly sits
# in that cut. The cut reaches a little past the frame, so the face is a flat
# area with the display set into it rather than a dome with a panel on top.
# Both patches are therefore built flat (`flattening = 1.0`) and measured off
# the cut, not off the round shell they no longer follow.
HEAD_CENTRE_DEPTH = support_surface_z(head_profile, 0.0, FACE_CENTRE_Y)
HEAD_CUT_MARGIN = 1.05
HEAD_CUT_Z = support_surface_z(
    head_profile, FACE_FRAME_RADIUS_X * HEAD_CUT_MARGIN, FACE_CENTRE_Y,
)
FACE_FRAME_FLATTENING = 1.0
FACE_FRAME_OFFSET = HEAD_CUT_Z - HEAD_CENTRE_DEPTH + 0.004
FACE_OFFSET = FACE_FRAME_OFFSET + 0.005
FACE_BULGE = FACE_FRAME_BULGE
FACE_FLATTENING = 1.0
superellipse_patch(
    "Trim.VisorFrame", FACE_CENTRE_Y, FACE_FRAME_RADIUS_X, FACE_FRAME_RADIUS_Y,
    head_profile, FACE_FRAME_OFFSET, FACE_FRAME_BULGE, FACE_FRAME_FLATTENING,
    TRIM, "trim",
    dome_radius_x=FACE_DOME_RADIUS_X, dome_radius_y=FACE_DOME_RADIUS_Y,
)
superellipse_patch(
    "FaceDisplay.Visor", FACE_CENTRE_Y, FACE_RADIUS_X, FACE_RADIUS_Y, head_profile,
    FACE_OFFSET, FACE_BULGE, FACE_FLATTENING,
    FACE, "face_display",
    dome_radius_x=FACE_DOME_RADIUS_X, dome_radius_y=FACE_DOME_RADIUS_Y,
)
truncate_head_front(HEAD_SHELL, HEAD_CUT_Z)

# A real neck remains visible between head and torso. It is trim, not a status
# emitter, so state colour cannot silently recolour the character structure.
cylinder(
    "Trim.Neck", (0.0, -0.398, 0.0), 0.196, 0.124,
    (math.pi / 2.0, 0.0, 0.0), TRIM, "trim",
)
torus(
    "Status.NeckUnderside", (0.0, -0.402, 0.0), 0.148, 0.008,
    STATUS, "status_emitters",
)

torso_profile = sample_bezier_segments([
    (
        (-0.412, 0.2480, 0.148),
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
TORSO = revolved_mesh("Shell.Torso", torso_profile, SHELL, "shell", interpolate=False)

# The head ended a good way behind the body. It is drawn in until it reaches
# exactly as far back as the torso. The head modules built further down read
# the compressed surface through `head_surface_y`, so the hair fitting still
# lies on the head rather than floating where the old surface used to be.
HEAD_MAX_DEPTH = max(row[2] for row in head_profile)
HEAD_REAR_OVERHANG = 1.0
shorten_head_back(
    HEAD_SHELL,
    1.0
    - max(row[2] for row in torso_profile) * HEAD_REAR_OVERHANG / HEAD_MAX_DEPTH,
)
surface_seam("Trim.TorsoSeam.Upper", torso_profile, -0.405, -0.505, TRIM, "trim")
surface_seam("Trim.TorsoSeam.Lower", torso_profile, -0.833, -1.055, TRIM, "trim")

# Head side modules are components, not a widened head silhouette.
for side, sign in (("L", -1.0), ("R", 1.0)):
    # The modules taper towards their outer cap. Rotating by `sign * 90`
    # around Y puts the cone's second radius on the outward side for both
    # ears, so one description serves left and right.
    frustum(
        f"Trim.HeadSideModule.{side}", (sign * 0.465, -0.075, 0.0),
        0.132, 0.112, 0.070, (0.0, sign * math.pi / 2.0, 0.0), TRIM, "trim",
    )
    cylinder(
        f"Status.HeadSideCap.{side}", (sign * 0.503, -0.075, 0.0),
        0.092, 0.025, (0.0, math.pi / 2.0, 0.0), STATUS, "status_emitters",
    )

# Chest core: dark housing plus one member of the unified status group.
#
# The emitter is set into the body rather than stuck onto it. Its front face is
# flush with the torso surface on the centre line; because the torso curves
# away, the ring around it then sits slightly inside the body on its own,
# which is exactly the recess the concept shows.
CHEST_Y = -0.669
CHEST_CORE_RADIUS = 0.112
CHEST_CORE_DEPTH = 0.022
CHEST_BEZEL_RADIUS = 0.130
CHEST_BEZEL_MINOR = 0.012
CHEST_HOUSING_RADIUS = 0.151
chest_surface = support_surface_z(torso_profile, 0.0, CHEST_Y)
# The chest core sits in a shallow round depression rather than on a plain
# belly. The dish is pressed into the torso itself, so it is a recess in the
# body and not a ring laid over it.
CHEST_DISH = (
    (0.0, CHEST_Y, chest_surface),
    0.208,
    0.020,
)
apply_dish(TORSO, *CHEST_DISH)
conforming_ring(
    "Trim.ChestCoreHousing", CHEST_Y, CHEST_HOUSING_RADIUS, 0.014,
    0.004, torso_profile, TRIM, "trim", MODEL, ROOT, dish=CHEST_DISH,
)
conforming_ring(
    "Status.ChestCoreBezel", CHEST_Y, CHEST_BEZEL_RADIUS, CHEST_BEZEL_MINOR,
    CHEST_BEZEL_MINOR * 0.55, torso_profile,
    STATUS, "status_emitters", MODEL, ROOT, dish=CHEST_DISH,
)
# The core is tilted to lie almost parallel with its own bezel. The belly
# falls away towards the waist, so the ring around the core is not in a plane
# facing straight forward; a disc that does face straight forward reads as
# tipped up against it. The angle is measured off the same dished surface the
# ring is placed on, so the two cannot disagree.
def _chest_ring_surface(offset_y):
    y = CHEST_Y + offset_y
    z = support_surface_z(torso_profile, 0.0, y)
    return z - dish_amount((0.0, y, z), *CHEST_DISH)


CHEST_TILT = math.atan2(
    _chest_ring_surface(CHEST_BEZEL_RADIUS) - _chest_ring_surface(-CHEST_BEZEL_RADIUS),
    2.0 * CHEST_BEZEL_RADIUS,
)
cylinder(
    "Status.ChestCore",
    (0.0, CHEST_Y, chest_surface - CHEST_CORE_DEPTH * 0.5),
    CHEST_CORE_RADIUS, CHEST_CORE_DEPTH, (CHEST_TILT, 0.0, 0.0),
    STATUS, "status_emitters",
)
print(f"PICO_CHEST_CORE_TILT_DEGREES={math.degrees(CHEST_TILT):.2f}")

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

HEAD_RECIPE_COLLECTIONS = {
    "head-raised-crown": HEAD_CROWN,
    "head-long-neon-tail": HEAD_TAIL,
}
HEAD_IDENTITY_CARRIERS = {}
make_procedural_head_variant(
    "Crown",
    "head-raised-crown",
    {
        "geometry": {
            "anchor": 82, "side": 0, "length": 70, "lift": 200,
            "sweep": 12, "curl": 6, "width": 118, "taper": 204,
            "twist": 4, "segments": 4, "partOffset": 0,
            "partDepth": 0, "crownBias": 0, "rootSpread": 126,
        },
        "material": {"hue": 198, "chroma": 138, "translucency": 168},
    },
    HEAD_CROWN,
    mount,
    head_profile,
)
TAIL_RECIPE = {
    "geometry": {
        "anchor": 208, "side": 18, "length": 230, "lift": 188,
        "sweep": 110, "curl": 72, "width": 112, "taper": 216,
        "twist": -20, "segments": 8, "partOffset": -34,
        "partDepth": 82, "crownBias": 62, "rootSpread": 146,
    },
    "material": {"hue": 286, "chroma": 156, "translucency": 184},
}
make_procedural_head_variant(
    "Tail",
    "head-long-neon-tail",
    TAIL_RECIPE,
    HEAD_TAIL,
    mount,
    head_profile,
)
# The rear ribbon has to stay clear of head, visor and side module at every
# value the PAS corridor allows, not only at the authored one.
check_rear_ribbon_corridor(head_profile, TAIL_RECIPE["geometry"])
report_personal_colour_corridor("Tail", (198, 242, 286), (60, 156, 240), (60, 184, 250))
install_head_identity_selector(mount)

# Underside emitter and hover form. The broader luminous falloff belongs to
# rendering; these meshes are the authored emitting surfaces only.
# The two glows lie on the floor plane, so their two floor axes are equal: an
# ellipse there reads as a light pointing sideways rather than downward.
uv_sphere("Status.Underside", (0.0, -1.095, 0.0), (0.100, 0.030, 0.100), STATUS, "status_emitters", segments=64, rings=40)
torus("Status.HoverRing", (0.0, -1.245, 0.0), 0.345, 0.016, STATUS, "status_emitters")
uv_sphere("Status.HoverCore", (0.0, -1.245, 0.0), (0.155, 0.010, 0.155), STATUS, "status_emitters", segments=64, rings=40)

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
# The personal shell is a transmissive light guide. Without ray tracing EEVEE
# ignores Transmission Weight entirely and the band renders as solid plastic,
# which is what made the first proposal look painted rather than glassy.
if hasattr(scene.eevee, "use_raytracing"):
    scene.eevee.use_raytracing = True
    if hasattr(scene.eevee, "ray_tracing_options"):
        options = scene.eevee.ray_tracing_options
        options.use_denoise = True
        # Half resolution ray tracing speckles a refracting light guide.
        if hasattr(options, "resolution_scale"):
            options.resolution_scale = "1"
if hasattr(scene.eevee, "use_shadows"):
    scene.eevee.use_shadows = True
scene.eevee.taa_render_samples = 256

headwear_only = os.environ.get("PICO_CHARACTER_HEADWEAR_ONLY") == "1"
if headwear_only:
    scene.render.resolution_percentage = 67
if not headwear_only:
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
    os.path.join(OUTPUT_DIR, "pico-preview-head-raised-crown.png"),
    (2.35, 0.32, 6.45),
    show_preview=True,
    head_identity="head_raised_crown",
)
render(
    os.path.join(OUTPUT_DIR, "pico-preview-head-long-neon-tail.png"),
    (2.35, 0.32, 6.45),
    show_preview=True,
    head_identity="head_long_neon_tail",
)
select_head_identity("standard_antenna")
force_head_identity_for_offline_render("standard_antenna")
restore_head_identity_drivers()

# Save the editable authoring source. It is a prototype and must not enter the
# character registry until owner approval and the ADR 0124 gates are closed.
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)

# Export only the authored model. Cameras, lights and preview face remain in
# the .blend for inspection but cannot leak into the normative candidate.
if not headwear_only:
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
