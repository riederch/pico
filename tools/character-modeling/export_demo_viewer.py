"""Export the Character core as a small, self-contained WebGL demo viewer.

The viewer shows the authored core and lets a reader switch the parts on and
off. It exists to make the material zones, the exclusive head identity and the
status group inspectable without opening Blender.

It is a diagnostic view of an unapproved prototype. It is not a product
surface, not a runtime and not a Character approval, and the exported geometry
is deliberately decimated: it is a picture of the checkpoint, never a second
source for it.

    "$PICO_BLENDER" tools/character-modeling/prototype/pico-character-core-v0.blend \
      --background -noaudio --disable-autoexec --python-exit-code 1 \
      --python tools/character-modeling/export_demo_viewer.py
"""

import base64
import json
import math
import os
import struct
import sys

import bpy
from mathutils import Vector


try:
    HERE = os.path.dirname(os.path.abspath(__file__))
except NameError:  # pragma: no cover
    HERE = os.path.join(os.getcwd(), "tools", "character-modeling")

TEMPLATE = os.path.join(HERE, "demo-viewer", "viewer-template.html")
OUTPUT_DIR = "/tmp/pico-demo-viewer"
OUTPUT_HTML = os.path.join(OUTPUT_DIR, "pico-demo-viewer.html")

# The whole model has to travel inside one HTML file, so it gets a triangle
# budget. Large shells give up the most detail; small emitters keep theirs.
TRIANGLE_BUDGET = 46000
MIN_TRIANGLES = 120

# The visible avatar states, in the order the standard lists them. They are
# drawings in front of an unchanged visor, so they are switched like the head
# identity: exactly one at a time.
FACE_STATES = (
    ("idle", "Ruhend"),
    ("listening", "Zuhoerend"),
    ("thinking", "Denkend"),
    ("speaking", "Sprechend"),
    ("waiting", "Wartend"),
    ("executing", "Arbeitend"),
    ("warning", "Achtung"),
    ("blocked", "Blockiert"),
    ("error", "Fehler"),
    ("success", "Erfolg"),
    ("offline", "Offline"),
)

COMPONENTS = (
    ("shell", "Schale", "Kopf, Torso, Arme und Handruecken"),
    ("visor", "Visier", "Displayflaeche und ihre Fassung"),
    ("trim", "Trim / Mechanik", "Hals, Schultern, Gelenke, Finger, Seitenmodule"),
    ("status", "Statusgruppe", "Brustkern, Unterseite, Schwebering, Kopfkappen"),
    ("head_antenna", "Kopf: Standardantenne", "Die neutrale Kopfidentitaet"),
    ("head_crown", "Kopf: erhoehte Krone", "Haarstil 2, noch im Rohzustand"),
    ("head_tail", "Kopf: Konzept-Schweif", "Haarstil 3, im Detail nachgezogen"),
) + tuple(
    (f"face_{state}", label, "Augen- und Mundzeichnung vor dem Visier")
    for state, label in FACE_STATES
)
HEAD_COMPONENTS = ("head_antenna", "head_crown", "head_tail")
FACE_COMPONENTS = tuple(f"face_{state}" for state, _ in FACE_STATES)


def component_of(name):
    if name.startswith("PREVIEW.Face."):
        return "face_" + name.split(".")[2]
    if name in ("Trim.AntennaStem", "Status.AntennaSphere"):
        return "head_antenna"
    if name.startswith("HeadModule.Crown.") or name == "Status.HeadAccent.Crown":
        return "head_crown"
    if name.startswith("HeadModule.Tail.") or name == "Status.HeadAccent.Tail":
        return "head_tail"
    if name in ("FaceDisplay.Visor", "Trim.VisorFrame"):
        return "visor"
    if name.startswith("Shell."):
        return "shell"
    if name.startswith("Trim."):
        return "trim"
    if name.startswith("Status."):
        return "status"
    return None


# The PAS surface corridors, from docs/development/briefs/
# parametric-appearance-system.md sections 10.1 to 10.3 and 9. Each zone maps
# its byte fields into a bounded OKLCH box, so no value a person can pick
# leaves the corridor.
#
# The viewer needs the mapping as a function, not as baked colours, because it
# recomputes while a slider moves. Defining the corridor here and shipping it
# as data keeps one source for the numbers; the page carries the same OKLCH
# conversion and checks itself against reference samples computed right here,
# so the two cannot drift apart unnoticed.
SURFACE_CORRIDORS = {
    "shell": {
        "label": "Schale",
        "zones": ["shell"],
        "lightness": [0.78, 0.96],
        "chroma": [0.0, 0.070],
        "fields": [
            {"id": "hue", "label": "hue", "max": 359, "value": 232},
            {"id": "chroma", "label": "chroma", "max": 255, "value": 40},
            {"id": "lightness", "label": "lightness", "max": 255, "value": 150},
            {"id": "gloss", "label": "gloss", "max": 255, "value": 190},
        ],
    },
    "face_display": {
        "label": "Display",
        "zones": ["face_display"],
        "lightness": [0.025, 0.110],
        "chroma": [0.0, 0.040],
        "fields": [
            {"id": "hue", "label": "hue", "max": 359, "value": 226},
            {"id": "tint", "label": "tint", "max": 255, "value": 60},
            {"id": "blackLevel", "label": "blackLevel", "max": 255, "value": 40},
            {"id": "reflectivity", "label": "reflectivity", "max": 255, "value": 90},
        ],
    },
    "trim": {
        "label": "Trim",
        "zones": ["trim"],
        # Trim has no lightness field in the standard; it stays dark by design.
        "lightness": [0.30, 0.30],
        "chroma": [0.0, 0.140],
        "fields": [
            {"id": "hue", "label": "hue", "max": 359, "value": 230},
            {"id": "chroma", "label": "chroma", "max": 255, "value": 46},
            {"id": "metalness", "label": "metalness", "max": 255, "value": 110},
        ],
    },
    "head_module": {
        "label": "Kopfmodul (persoenlich)",
        "zones": ["head_module"],
        "lightness": [0.500, 0.640],
        "chroma": [0.040, 0.220],
        "fields": [
            {"id": "hue", "label": "hue", "max": 359, "value": 286},
            {"id": "chroma", "label": "chroma", "max": 255, "value": 156},
            {"id": "translucency", "label": "translucency", "max": 255, "value": 184},
        ],
    },
}


def oklch_to_linear_rgb(lightness, chroma, hue_degrees):
    """One OKLCH-to-linear-RGB conversion, shared with the head module material."""
    radians = math.radians(hue_degrees % 360.0)
    axis_a = chroma * math.cos(radians)
    axis_b = chroma * math.sin(radians)
    cone_l = (lightness + 0.3963377774 * axis_a + 0.2158037573 * axis_b) ** 3
    cone_m = (lightness - 0.1055613458 * axis_a - 0.0638541728 * axis_b) ** 3
    cone_s = (lightness - 0.0894841775 * axis_a - 1.2914855480 * axis_b) ** 3
    return tuple(
        max(0.0, min(1.0, channel))
        for channel in (
            4.0767416621 * cone_l - 3.3077115913 * cone_m + 0.2309699292 * cone_s,
            -1.2684380046 * cone_l + 2.6097574011 * cone_m - 0.3413193965 * cone_s,
            -0.0041960863 * cone_l - 0.7034186147 * cone_m + 1.7076147010 * cone_s,
        )
    )


def corridor_reference_samples():
    """Colours the page must reproduce, so a drifting port announces itself."""
    samples = []
    for key, corridor in SURFACE_CORRIDORS.items():
        low, high = corridor["lightness"]
        chroma_low, chroma_high = corridor["chroma"]
        for hue, amount in ((0, 0.0), (120, 0.5), (286, 1.0)):
            lightness = low + (high - low) * amount
            chroma = chroma_low + (chroma_high - chroma_low) * amount
            samples.append({
                "zone": key,
                "hue": hue,
                "amount": round(amount, 3),
                "rgb": [round(v, 6) for v in oklch_to_linear_rgb(lightness, chroma, hue)],
            })
    return samples


def surface_of(material):
    if material is None:
        return {
            "zone": "unknown", "colour": [0.5, 0.5, 0.5],
            "emissive": False, "alpha": 1.0, "metallic": 0.0, "roughness": 0.4,
        }
    shader = material.node_tree.nodes.get("Principled BSDF")
    colour = [round(value, 4) for value in shader.inputs["Base Color"].default_value[:3]]
    strength = shader.inputs["Emission Strength"].default_value
    emission = [round(value, 4) for value in shader.inputs["Emission Color"].default_value[:3]]
    transmission = shader.inputs["Transmission Weight"].default_value
    return {
        "zone": material.get("pico_material_zone_name", material.name),
        "colour": emission if strength > 0.0 else colour,
        "emissive": strength > 0.0,
        "alpha": round(1.0 - 0.55 * transmission, 3),
        "metallic": round(shader.inputs["Metallic"].default_value, 3),
        "roughness": round(shader.inputs["Roughness"].default_value, 3),
    }


def decimate_ratio(triangles, budget_share):
    if triangles <= MIN_TRIANGLES:
        return 1.0
    return max(0.03, min(1.0, budget_share / float(triangles)))


def collect(objects, budget_share):
    """Evaluate, decimate and weld one object list into indexed world geometry."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    parts = []
    for obj in objects:
        component = component_of(obj.name)
        if component is None:
            continue
        added = None
        if obj.type == "MESH":
            evaluated = obj.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            mesh.calc_loop_triangles()
            ratio = decimate_ratio(len(mesh.loop_triangles), budget_share)
            evaluated.to_mesh_clear()
            if ratio < 1.0:
                added = obj.modifiers.new("PicoDemoDecimate", "DECIMATE")
                added.ratio = ratio
                depsgraph = bpy.context.evaluated_depsgraph_get()
        elif obj.type == "CURVE":
            obj.data.resolution_u = 2
            obj.data.bevel_resolution = 1
            depsgraph = bpy.context.evaluated_depsgraph_get()
        else:
            continue

        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        matrix = evaluated.matrix_world
        rotation = matrix.to_3x3().inverted().transposed()
        # Blender hands corner normals out as MeshNormalValue, not as a
        # sequence, so the vector has to be read off each entry.
        normals = None
        if len(mesh.corner_normals):
            normals = [Vector(entry.vector) for entry in mesh.corner_normals]

        lookup = {}
        positions = []
        packed_normals = []
        indices = []
        for triangle in mesh.loop_triangles:
            for corner in range(3):
                vertex_index = triangle.vertices[corner]
                loop_index = triangle.loops[corner]
                position = matrix @ mesh.vertices[vertex_index].co
                normal = (
                    normals[loop_index] if normals is not None
                    else Vector(triangle.normal)
                )
                normal = (rotation @ normal).normalized()
                key = (
                    round(position.x, 4), round(position.y, 4), round(position.z, 4),
                    round(normal.x, 2), round(normal.y, 2), round(normal.z, 2),
                )
                slot = lookup.get(key)
                if slot is None:
                    slot = len(positions) // 3
                    lookup[key] = slot
                    positions.extend((position.x, position.y, position.z))
                    packed_normals.extend((
                        max(-127, min(127, int(round(normal.x * 127.0)))),
                        max(-127, min(127, int(round(normal.y * 127.0)))),
                        max(-127, min(127, int(round(normal.z * 127.0)))),
                        0,
                    ))
                indices.append(slot)
        evaluated.to_mesh_clear()
        if added is not None:
            obj.modifiers.remove(added)
        if not indices or len(positions) // 3 > 65535:
            continue

        material = obj.data.materials[0] if obj.data.materials else None
        surface = surface_of(material)
        surface["zone"] = obj.get("pico_material_zone", surface["zone"])
        surface["material"] = material.name if material else "none"
        parts.append({
            "name": obj.name,
            "component": component,
            "surface": surface,
            "positions": positions,
            "normals": packed_normals,
            "indices": indices,
        })
    return parts


def head_objects(collection_name):
    return list(bpy.data.collections[collection_name].all_objects)


mount = bpy.data.objects["PICO_MOUNT_head_module"]


def select_identity(index):
    mount["pico_head_identity_index"] = index
    mount.update_tag(refresh={"OBJECT"})
    frame = bpy.context.scene.frame_current
    bpy.context.scene.frame_set(frame + 1)
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()


core = list(bpy.data.collections["PICO_CHARACTER_CORE"].all_objects)
preview = list(bpy.data.collections["PICO_PREVIEW_ONLY"].all_objects)
crown = head_objects("HEAD_RECIPE_head_raised_crown")
tail = head_objects("HEAD_RECIPE_head_long_neon_tail")

counted = [obj for obj in core + preview + crown + tail if component_of(obj.name)]
share = TRIANGLE_BUDGET / max(1, len(counted))

select_identity(0)
parts = collect(core + preview, share)
select_identity(1)
parts += collect(crown, share)
select_identity(2)
parts += collect(tail, share)
select_identity(0)

blob = bytearray()
records = []


def align(buffer, boundary=4):
    """Typed array views refuse an unaligned start offset, so pad to one."""
    while len(buffer) % boundary:
        buffer.append(0)
    return len(buffer)


for part in parts:
    position_offset = align(blob)
    blob.extend(struct.pack(f"<{len(part['positions'])}f", *part["positions"]))
    normal_offset = align(blob)
    blob.extend(struct.pack(f"<{len(part['normals'])}b", *part["normals"]))
    index_offset = align(blob)
    blob.extend(struct.pack(f"<{len(part['indices'])}H", *part["indices"]))
    records.append({
        "name": part["name"],
        "component": part["component"],
        "surface": part["surface"],
        "vertexCount": len(part["positions"]) // 3,
        "indexCount": len(part["indices"]),
        "positionOffset": position_offset,
        "normalOffset": normal_offset,
        "indexOffset": index_offset,
    })

lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for part in parts:
    for index in range(0, len(part["positions"]), 3):
        point = part["positions"][index:index + 3]
        for axis in range(3):
            lo[axis] = min(lo[axis], point[axis])
            hi[axis] = max(hi[axis], point[axis])

model = {
    "schema": "pico.character.demo-viewer.v0",
    "status": "diagnostic_prototype_not_character_approved",
    "source": "tools/character-modeling/prototype/pico-character-core-v0.blend",
    "note": (
        "Decimated diagnostic view of an unapproved authoring checkpoint. "
        "Not a product asset, not a runtime, no Character approval."
    ),
    "components": [
        {"id": key, "label": label, "hint": hint} for key, label, hint in COMPONENTS
    ],
    "surfaceCorridors": SURFACE_CORRIDORS,
    "corridorSamples": corridor_reference_samples(),
    "geometryFields": [
        # Listed so the page can name what it deliberately does not drive.
        "anchor", "side", "length", "lift", "sweep", "curl", "width", "taper",
        "twist", "segments", "partOffset", "partDepth", "crownBias",
        "rootSpread",
    ],
    "headComponents": list(HEAD_COMPONENTS),
    "faceComponents": list(FACE_COMPONENTS),
    "bounds": {
        "min": [round(value, 4) for value in lo],
        "max": [round(value, 4) for value in hi],
    },
    "parts": records,
    "buffer": base64.b64encode(bytes(blob)).decode("ascii"),
}

os.makedirs(OUTPUT_DIR, exist_ok=True)
with open(TEMPLATE, "r", encoding="utf-8") as handle:
    page = handle.read()
page = page.replace("__PICO_MODEL_DATA__", json.dumps(model, separators=(",", ":")))
with open(OUTPUT_HTML, "w", encoding="utf-8") as handle:
    handle.write(page)

triangles = sum(record["indexCount"] // 3 for record in records)
print(f"PICO_DEMO_VIEWER_HTML={OUTPUT_HTML}")
print(f"PICO_DEMO_VIEWER_PARTS={len(records)}")
print(f"PICO_DEMO_VIEWER_TRIANGLES={triangles}")
print(f"PICO_DEMO_VIEWER_BUFFER_BYTES={len(blob)}")
print(f"PICO_DEMO_VIEWER_PAGE_BYTES={os.path.getsize(OUTPUT_HTML)}")
print("PICO_DEMO_VIEWER_STATUS=diagnostic_prototype_not_character_approved")
sys.stdout.flush()
sys.stderr.flush()
os._exit(0)
