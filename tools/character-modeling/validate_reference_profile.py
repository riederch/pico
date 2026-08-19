"""Hold the authored head to the registered reference's measured profile.

`docs/design-system/07_Governance/Character_Geometry_Measurements.md` states
what is measurable on `PICO_Basis_Avatar.png` and calls itself the target for
an authored model under ADR 0124, gate PR6. Until now nothing read it: the
numbers lived in a document and the model drifted beside them. The lower head
profile had drifted the furthest -- 0.388 head widths where the reference has
0.559 -- and it took an external review to notice.

This measures the same quantities off the model and holds the head profile to
them. It measures in the reference's own unit, the head width, and cuts the
outline with planes through the triangles rather than sampling vertices in a
slab: a slab misses the widest ring wherever the mesh has no ring, and then
reports a sliver as the body's width.

The torso rows are printed and not asserted. Their deviation is a known open
character question -- the head is about four per cent large against the body --
and asserting a number nobody has decided would freeze a guess as a contract.

Coverage and profile are necessary, never sufficient. One view fixes no depth.

    "$PICO_BLENDER" tools/character-modeling/prototype/pico-character-core-v0.blend \
      --background -noaudio --disable-autoexec --python-exit-code 1 \
      --python tools/character-modeling/validate_reference_profile.py
"""

import os
import sys

import bpy

# Head profile of the registered reference, in head widths, head centre at 0.
REFERENCE_HEAD = (
    (+0.315, 0.489), (+0.261, 0.645), (+0.207, 0.742), (+0.153, 0.812),
    (+0.099, 0.860), (+0.046, 0.946), (-0.008, 0.978), (-0.062, 1.000),
    (-0.116, 0.968), (-0.169, 0.914), (-0.223, 0.823), (-0.277, 0.742),
    (-0.331, 0.613), (-0.384, 0.559),
)
# The reference's own top row, +0.368, is left out of the assertion. There the
# shell is nearly a point and the head-module mount begins, so a small absolute
# error reads as a large one and the row says more about where a measurer drew
# the line than about the shape.
REFERENCE_CROWN = (+0.368, 0.151)
REFERENCE_BODY = (
    (-0.444, 0.683), (-0.745, 0.731), (-0.788, 0.704), (-0.831, 0.672),
    (-0.874, 0.624), (-0.917, 0.570), (-0.960, 0.511), (-1.003, 0.435),
    (-1.046, 0.333),
)
TOLERANCE = 0.06

HEAD_GROUP = (
    "Shell.Head", "FaceDisplay.Visor", "Trim.VisorFrame",
    "Trim.HeadSideModule.L", "Trim.HeadSideModule.R",
    "Status.HeadSideCap.L", "Status.HeadSideCap.R",
)
ARMS = ("Shell.Arm", "Trim.Hand", "Trim.Finger", "Trim.Thumb", "Trim.Shoulder")
EMISSIVE = ("Status.Underside", "Status.HoverRing", "Status.HoverCore")

CORE = [obj for obj in bpy.data.collections["PICO_CHARACTER_CORE"].all_objects
        if obj.type == "MESH"]


def triangles(objects):
    out = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        matrix = evaluated.matrix_world
        out.extend(
            tuple(matrix @ mesh.vertices[index].co for index in triangle.vertices)
            for triangle in mesh.loop_triangles
        )
        evaluated.to_mesh_clear()
    return out


def cut_width(tris, y):
    """The outline's x range where the plane y = const crosses the body."""
    low = high = None
    for first, second, third in tris:
        for start, end in ((first, second), (second, third), (third, first)):
            if (start.y - y) * (end.y - y) > 0.0:
                continue
            if start.y == end.y:
                crossings = (start.x, end.x)
            else:
                amount = (y - start.y) / (end.y - start.y)
                if amount < 0.0 or amount > 1.0:
                    continue
                crossings = (start.x + (end.x - start.x) * amount,)
            for x in crossings:
                low = x if low is None else min(low, x)
                high = x if high is None else max(high, x)
    return None if low is None else high - low


head_tris = triangles([obj for obj in CORE if obj.name in HEAD_GROUP])
shell = [obj for obj in CORE if obj.name == "Shell.Head"][0]
shell_points = [shell.matrix_world @ vertex.co for vertex in shell.data.vertices]
centre = (min(p.y for p in shell_points) + max(p.y for p in shell_points)) / 2.0

# The reference's head width is measured on the picture and so includes the
# side modules. Calibrating on the bare shell makes every value three per cent
# large and hides itself as a uniform offset.
UNIT = max(
    cut_width(head_tris, centre + step * 0.004) or 0.0
    for step in range(-100, 101)
)
core_tris = triangles([
    obj for obj in CORE
    if not obj.name.startswith(ARMS) and obj.name not in EMISSIVE
])

print(f"PICO_REFERENCE_UNIT=head_width={UNIT:.4f} centre_y={centre:+.4f}")

worst = (0.0, None)
for y_reference, width_reference in REFERENCE_HEAD:
    width = cut_width(core_tris, centre + y_reference * UNIT)
    assert width is not None, f"no shell at y {y_reference}"
    measured = width / UNIT
    delta = measured - width_reference
    if abs(delta) > abs(worst[0]):
        worst = (delta, y_reference)
    print(
        f"PICO_REFERENCE_HEAD y={y_reference:+.3f} reference={width_reference:.3f} "
        f"model={measured:.3f} delta={delta:+.3f}"
    )
    assert abs(delta) <= TOLERANCE, (y_reference, width_reference, measured)

crown = cut_width(core_tris, centre + REFERENCE_CROWN[0] * UNIT)
print(
    f"PICO_REFERENCE_CROWN reference={REFERENCE_CROWN[1]:.3f} "
    f"model={(crown or 0.0) / UNIT:.3f} not_asserted=nearly_a_point"
)
for y_reference, width_reference in REFERENCE_BODY:
    width = cut_width(core_tris, centre + y_reference * UNIT)
    measured = (width or 0.0) / UNIT
    print(
        f"PICO_REFERENCE_BODY y={y_reference:+.3f} reference={width_reference:.3f} "
        f"model={measured:.3f} delta={measured - width_reference:+.3f} not_asserted=open"
    )

print(f"PICO_REFERENCE_HEAD_WORST={worst[0]:+.3f} at_y={worst[1]:+.3f} tolerance={TOLERANCE}")
print("PICO_REFERENCE_PROFILE_STATUS=within_tolerance_diagnostic_not_approved")
sys.stdout.flush()
sys.stderr.flush()
os._exit(0)
