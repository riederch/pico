"""Validate the saved Character feature stub checkpoint against its manifest.

Run against the checkpoint that was just written, not against a rebuilt scene:

    "$PICO_BLENDER" tools/character-modeling/prototype/pico-character-feature-stubs-v0.blend \
      --background -noaudio --disable-autoexec --python-exit-code 1 \
      --python tools/character-modeling/validate_feature_stubs.py

Every check is a hard boundary from
docs/development/briefs/character-feature-stub-set.md section 9. A passing run
says the 28 stubs exist, are assigned and stay inside those boundaries. It says
nothing about visual quality and grants no Character or production approval.
"""

import hashlib
import json
import os
import re
import sys

import bpy


MANIFEST_NAME = "feature-stub-manifest-v0.json"
INVENTORY_NAME = "FEATURE_DRAFTS.md"
PREVIEW_DIR = "/tmp/pico-character-feature-stubs"
INDIVIDUAL_DIR = os.path.join(PREVIEW_DIR, "individual")
ALLOWED_KINDS = {
    "geometry", "core_reference", "material_state",
    "display_state", "pose", "presentation", "motion",
}
PROTECTED_CORE_OBJECTS = (
    "Shell.Head", "FaceDisplay.Visor", "Shell.Torso",
    "Status.ChestCore", "Status.HoverRing", "PICO_MOUNT_head_module",
)


def repo_root():
    override = os.environ.get("PICO_REPO_ROOT")
    candidates = [override] if override else []
    if bpy.data.filepath:
        here = os.path.dirname(bpy.data.filepath)
        candidates.append(os.path.abspath(os.path.join(here, os.pardir, os.pardir, os.pardir)))
    candidates.append(os.getcwd())
    for candidate in candidates:
        if candidate and os.path.isfile(
            os.path.join(candidate, "tools", "character-modeling", MANIFEST_NAME)
        ):
            return os.path.abspath(candidate)
    raise SystemExit("cannot locate the repository root; set PICO_REPO_ROOT")


REPO_ROOT = repo_root()
TOOL_DIR = os.path.join(REPO_ROOT, "tools", "character-modeling")
MANIFEST_PATH = os.path.join(TOOL_DIR, MANIFEST_NAME)
INVENTORY_PATH = os.path.join(TOOL_DIR, INVENTORY_NAME)

with open(MANIFEST_PATH, "r", encoding="utf-8") as handle:
    MANIFEST = json.load(handle)


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def objects_of(target):
    result = list(target.objects)
    for child in target.children:
        result.extend(objects_of(child))
    return result


def roles_of(obj):
    value = obj.get("pico_stub_roles")
    return set(value.split("|")) if value else set()


def count_roles(objects):
    counts = {}
    for obj in objects:
        for role in roles_of(obj):
            counts[role] = counts.get(role, 0) + 1
    return counts


def materials_of(objects):
    result = set()
    for obj in objects:
        data = getattr(obj, "data", None)
        for mat in getattr(data, "materials", []) or []:
            if mat is not None:
                result.add(mat)
    return result


def emission_strength(mat):
    node = mat.node_tree.nodes.get("Principled BSDF")
    return node.inputs["Emission Strength"].default_value if node else 0.0


def action_fcurves(action):
    """Blender 5.x keeps f-curves inside slotted action layers."""
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in getattr(action, "layers", []):
        for strip in getattr(layer, "strips", []):
            for bag in getattr(strip, "channelbags", []):
                curves.extend(bag.fcurves)
    return curves


def animated_paths(holder):
    animation = getattr(holder, "animation_data", None)
    if not (animation and animation.action):
        return set()
    return {curve.data_path for curve in action_fcurves(animation.action)}


def has_action(obj):
    return bool(animated_paths(obj))


# 1  root schema, diagnostic status and the refused approval ------------------

ROOT = bpy.data.collections[MANIFEST["root_collection"]]
assert ROOT["pico_status"] == "diagnostic_stub", ROOT["pico_status"]
assert ROOT["pico_character_approved"] is False
assert ROOT["pico_stub_schema"] == MANIFEST["schema"]
assert ROOT["pico_stub_count"] == MANIFEST["stub_count"] == 28
assert ROOT["pico_source_core_collection"] == MANIFEST["source_core_collection"]
assert ROOT["pico_refinement_source"].startswith("TODO.md#")

# 2  manifest hash, core hash and a relative library source -------------------

assert len(bpy.data.libraries) == 1, [lib.filepath for lib in bpy.data.libraries]
LIBRARY = bpy.data.libraries[0]
assert LIBRARY.filepath.startswith("//"), LIBRARY.filepath
assert os.path.basename(LIBRARY.filepath) == "pico-character-core-v0.blend"
CORE_FILE = bpy.path.abspath(LIBRARY.filepath)
assert os.path.isfile(CORE_FILE), CORE_FILE
assert sha256_of(CORE_FILE) == ROOT["pico_source_core_sha256"]
assert sha256_of(MANIFEST_PATH) == ROOT["pico_source_manifest_sha256"]

# 3  exactly 28 stubs in manifest order, split 11 / 8 / 9 ---------------------

RECORDS = {record["order"]: record for record in MANIFEST["stubs"]}
assert sorted(RECORDS) == list(range(1, 29))
assert [page["name"] for page in MANIFEST["pages"]] == [
    child.name for child in ROOT.children
]
assert [len(page["orders"]) for page in MANIFEST["pages"]] == [11, 8, 9]

STUBS = {}
for page_spec in MANIFEST["pages"]:
    page = bpy.data.collections[page_spec["name"]]
    assert page.name in [child.name for child in ROOT.children]
    names = [child.name for child in page.children]
    assert len(names) == len(page_spec["orders"]), (page.name, names)
    for order, name in zip(page_spec["orders"], names):
        record = RECORDS[order]
        expected = f"STUB_{order:02d}_{record['slug']}"
        assert name == expected, (name, expected)
        STUBS[order] = bpy.data.collections[expected]
assert len(STUBS) == 28

# 4  mandatory properties on every stub collection ---------------------------

for order, record in sorted(RECORDS.items()):
    stub = STUBS[order]
    assert stub["pico_stub_order"] == order
    assert stub["pico_stub_slug"] == record["slug"]
    assert stub["pico_stub_kind"] == record["kind"]
    assert stub["pico_stub_kind"] in ALLOWED_KINDS
    assert stub["pico_status"] == "diagnostic_stub"
    assert stub["pico_character_approved"] is False
    assert stub["pico_stub_complete"] is True
    assert stub["pico_refinement_source"] == "TODO.md#character-feinschliff-nach-low-quality-drafts"
    assert stub["pico_refinement_detail"] == record["todo_section"]
    assert stub["pico_stub_page"] == record["page"]

# 5  one shared core library, no local core copies ---------------------------

LINKED_COLLECTIONS = [item for item in bpy.data.collections if item.library is not None]
assert len(LINKED_COLLECTIONS) == 1
LINKED_CORE = LINKED_COLLECTIONS[0]
assert LINKED_CORE.name == MANIFEST["source_core_collection"]
CORE_OBJECT_NAMES = {obj.name for obj in LINKED_CORE.objects}
for name in PROTECTED_CORE_OBJECTS:
    assert name in CORE_OBJECT_NAMES, name
for obj in bpy.data.objects:
    if obj.library is None and obj.name in CORE_OBJECT_NAMES:
        raise AssertionError(f"local copy of core object {obj.name}")

INSTANCES = [
    obj for obj in bpy.data.objects
    if obj.instance_type == "COLLECTION" and obj.instance_collection is LINKED_CORE
]
EXPECTED_INSTANCES = sum(record["core_instances"] for record in MANIFEST["stubs"])
assert len(INSTANCES) == EXPECTED_INSTANCES, (len(INSTANCES), EXPECTED_INSTANCES)
CORE_SOURCE_ID = ROOT["pico_core_source_id"]
for obj in INSTANCES:
    assert obj["pico_core_source_id"] == CORE_SOURCE_ID

PROXY = bpy.data.collections["STUB_SHARED_HEAD_MOUNT_PROXY"]
assert PROXY["pico_is_character_core"] is False
assert PROXY.library is None
assert len(PROXY.objects) <= 3
STATUS_MATERIAL = bpy.data.materials[MANIFEST["status_material"]]
assert STATUS_MATERIAL.library is not None, "status colour must come from the core library"

# 6  kind, required roles and subvariants from every manifest record ---------

for order, record in sorted(RECORDS.items()):
    stub = STUBS[order]
    objects = objects_of(stub)
    counts = count_roles(objects)
    for role in record["required_roles"]:
        assert counts.get(role, 0) > 0, (record["slug"], "missing role", role)
    for role, expected in record.get("role_counts", {}).items():
        assert counts.get(role, 0) == expected, (record["slug"], role, counts.get(role, 0), expected)
    for role in record.get("forbidden_roles", []):
        assert counts.get(role, 0) == 0, (record["slug"], "forbidden role", role)
    instances = [obj for obj in objects if obj.instance_collection is LINKED_CORE]
    assert len(instances) == record["core_instances"], (record["slug"], len(instances))
    children = {child["pico_stub_subvariant"]: child for child in stub.children}
    expected_names = [item["name"] for item in record["subvariants"]]
    assert sorted(children) == sorted(expected_names), (record["slug"], sorted(children))
    for item in record["subvariants"]:
        sub = children[item["name"]]
        sub_objects = objects_of(sub)
        sub_counts = count_roles(sub_objects)
        for role in item.get("required_roles", []):
            assert sub_counts.get(role, 0) > 0, (record["slug"], item["name"], role)
        for role, expected in item.get("role_counts", {}).items():
            assert sub_counts.get(role, 0) == expected, (record["slug"], item["name"], role, sub_counts.get(role, 0), expected)
        for role in item.get("forbidden_roles", []):
            assert sub_counts.get(role, 0) == 0, (record["slug"], item["name"], role)

# 7  the two refinement heads: flat plate, one carrier, shell, separate status

for order in (1, 2):
    stub = STUBS[order]
    objects = objects_of(stub)
    plates = [obj for obj in objects if "hair_root_plate" in roles_of(obj)]
    assert len(plates) == 1
    plate = plates[0]
    thin, wide = plate.dimensions.z, max(plate.dimensions.x, plate.dimensions.y)
    assert thin < wide * 0.25, (order, thin, wide)
    carriers = [obj for obj in objects if "mechanical_root_or_spine" in roles_of(obj)]
    assert len(carriers) == 1
    shells = [obj for obj in objects if "personal_translucent_shell" in roles_of(obj)]
    assert shells
    emitters = [obj for obj in objects if "status_emitter" in roles_of(obj)]
    assert emitters
    shell_materials = materials_of(shells)
    emitter_materials = materials_of(emitters)
    assert emitter_materials == {STATUS_MATERIAL}, (order, emitter_materials)
    assert not (shell_materials & emitter_materials), order
    assert materials_of(carriers).isdisjoint(emitter_materials)

# 8  antenna and hair stay mutually exclusive across groups 1 to 11 ----------

HAIR_ROLES = {"personal_translucent_shell", "hair_root_plate", "crown_blade", "segment_mark", "part_seam"}
ANTENNA_ROLES = {"antenna_stem", "antenna_status_sphere"}
for order in range(1, 12):
    stub = STUBS[order]
    record = RECORDS[order]
    objects = objects_of(stub)
    present = set()
    for obj in objects:
        present |= roles_of(obj)
    has_hair = bool(present & HAIR_ROLES)
    has_antenna = bool(present & ANTENNA_ROLES)
    assert has_hair != has_antenna, (record["slug"], has_hair, has_antenna)
    assert stub["pico_head_identity"] == record["head_identity"]
    if record["head_identity"] == "procedural_neon_hair":
        assert has_hair and not has_antenna
        for obj in objects:
            assert "Antenna" not in obj.name, (record["slug"], obj.name)
    else:
        assert has_antenna and not has_hair

# 9  the demanded corridor endpoints in 6, 9, 10 and 11 ---------------------

SEGMENTS = STUBS[9]
for count in (3, 9):
    sub = next(child for child in SEGMENTS.children if child["pico_stub_subvariant"] == f"segments_{count}")
    marks = [obj for obj in objects_of(sub) if "segment_mark" in roles_of(obj)]
    assert len(marks) == count, (count, len(marks))
    carriers = [obj for obj in objects_of(sub) if "mechanical_root_or_spine" in roles_of(obj)]
    assert len(carriers) == 1, count
for order, names in ((6, {"left", "right"}), (10, {"narrow", "wide"}), (11, {"twist", "curl", "side_offset"})):
    present = {child["pico_stub_subvariant"] for child in STUBS[order].children}
    assert present == names, (order, present)
for name in ("narrow", "wide"):
    sub = next(child for child in STUBS[10].children if child["pico_stub_subvariant"] == name)
    tips = [obj for obj in objects_of(sub) if "rounded_tip" in roles_of(obj)]
    assert len(tips) == 1, name

# 10  the whole status group on exactly one status material -----------------

GROUP = STUBS[14]
regions = [obj for obj in objects_of(GROUP) if "status_region" in roles_of(obj)]
assert len(regions) == 6, len(regions)
assert {obj["pico_status_region"] for obj in regions} == set(RECORDS[14]["status_regions"])
region_materials = materials_of(regions)
assert region_materials == {STATUS_MATERIAL}, region_materials
assert GROUP["pico_status_group_rule"] == RECORDS[14]["status_group_rule"]

# 11  eleven avatar states, drawn rather than modelled ----------------------

STATES = STUBS[15]
expected_states = RECORDS[15]["avatar_states"]
assert len(expected_states) == 11
assert STATES["pico_avatar_states"] == "|".join(expected_states)
state_children = {child["pico_stub_subvariant"]: child for child in STATES.children}
assert sorted(state_children) == sorted(expected_states)
faces = {child["pico_state_face"] for child in state_children.values()}
assert len(faces) == 11, faces
state_drawings = [
    obj for obj in objects_of(STATES)
    if roles_of(obj) & {"state_eye", "state_mouth"}
]
assert materials_of(state_drawings) == {STATUS_MATERIAL}
assert len([obj for obj in objects_of(STATES) if obj.instance_collection is LINKED_CORE]) == 1

# 12  three poses, three tiers and two motion modes -------------------------

assert len(STUBS[16].children) == 3
assert len(STUBS[18].children) == 3
assert len(STUBS[19].children) == 2
POSE_ARMS = {item["name"]: item["arms"] for item in RECORDS[16]["subvariants"]}
for child in STUBS[16].children:
    name = child["pico_stub_subvariant"]
    assert child["pico_pose_arms"] == POSE_ARMS[name]
    assert child["pico_pose_source"] == CORE_SOURCE_ID

NORMAL = next(child for child in STUBS[19].children if child["pico_stub_subvariant"] == "motion_normal")
REDUCED = next(child for child in STUBS[19].children if child["pico_stub_subvariant"] == "reduced_motion")
assert any(has_action(obj) for obj in objects_of(NORMAL)), "motion stub carries no action"
NORMAL_PATHS = set()
for obj in objects_of(NORMAL):
    NORMAL_PATHS |= animated_paths(obj)
for mat in materials_of(objects_of(NORMAL)):
    NORMAL_PATHS |= animated_paths(getattr(mat, "node_tree", None))
assert "location" in NORMAL_PATHS, NORMAL_PATHS
assert "scale" in NORMAL_PATHS, NORMAL_PATHS
assert any("Principled BSDF" in path for path in NORMAL_PATHS), NORMAL_PATHS
assert NORMAL["pico_motion_channels"] == "|".join(RECORDS[19]["motion_channels"])
assert REDUCED["pico_reduced_motion"] is True
for obj in objects_of(REDUCED):
    assert not has_action(obj), obj.name
for mat in materials_of(objects_of(REDUCED)):
    tree = getattr(mat, "node_tree", None)
    animation = getattr(tree, "animation_data", None) if tree else None
    assert not (animation and animation.action), mat.name

# 13  one core source id across static, composite and realtime --------------

TIERS = STUBS[18]
assert TIERS["pico_core_source_id"] == CORE_SOURCE_ID
tier_children = {child["pico_stub_subvariant"]: child for child in TIERS.children}
assert sorted(tier_children) == ["composite", "realtime", "static"]
for name, child in tier_children.items():
    assert child["pico_core_source_id"] == CORE_SOURCE_ID, name
STATIC_IMAGES = [
    node.image
    for mat in materials_of(objects_of(tier_children["static"]))
    for node in mat.node_tree.nodes if node.type == "TEX_IMAGE" and node.image
]
assert STATIC_IMAGES, "the static tier carries no render"
assert all(image.packed_file is not None for image in STATIC_IMAGES)

# 14  context colour never touches the status group -------------------------

for order in range(20, 28):
    record = RECORDS[order]
    stub = STUBS[order]
    context_material = bpy.data.materials[record["context_material"]]
    assert context_material is not STATUS_MATERIAL
    assert context_material.library is None
    accessories = [obj for obj in objects_of(stub) if "context_object" in roles_of(obj)]
    assert accessories, record["slug"]
    assert STATUS_MATERIAL not in materials_of(accessories), record["slug"]
    assert materials_of(accessories) == {context_material}, record["slug"]
    assert stub["pico_context_status_separation"] == record["context_status_separation"]
    assert len([obj for obj in objects_of(stub) if obj.instance_collection is LINKED_CORE]) == 1
    if record.get("context_accent_is_exclusive_to_accessory"):
        for obj in bpy.data.objects:
            if context_material in materials_of([obj]):
                assert "context_object" in roles_of(obj), (record["slug"], obj.name)

NIGHT = STUBS[27]
assert NIGHT["pico_presentation_rule"] == RECORDS[27]["presentation_rule"]
assert [obj for obj in objects_of(NIGHT) if "night_backdrop" in roles_of(obj)]

# 15  clothing stays an overlay --------------------------------------------

CLOTHING = STUBS[28]
assert CLOTHING["pico_fallback_rule"] == RECORDS[28]["fallback_rule"]
overlays = [obj for obj in objects_of(CLOTHING) if "clothing_overlay" in roles_of(obj)]
assert len(overlays) == 2
overlay_materials = materials_of(overlays)
assert len(overlay_materials) == 2, overlay_materials
for mat in overlay_materials:
    assert mat is not STATUS_MATERIAL
    assert emission_strength(mat) == 0.0, mat.name
for obj in objects_of(CLOTHING):
    assert obj.library is None or obj.name not in PROTECTED_CORE_OBJECTS
assert len([obj for obj in objects_of(CLOTHING) if obj.instance_collection is LINKED_CORE]) == 1

# 16  28 individual previews and three contact sheets ----------------------

previews = []
for order, record in sorted(RECORDS.items()):
    filename = f"{order:02d}-{record['slug'].replace('_', '-')}.png"
    path = os.path.join(INDIVIDUAL_DIR, filename)
    assert os.path.isfile(path), path
    assert os.path.getsize(path) > 0, path
    previews.append(filename)
assert len(previews) == 28
sheets = []
for page_spec in MANIFEST["pages"]:
    path = os.path.join(PREVIEW_DIR, page_spec["contact_sheet"])
    assert os.path.isfile(path), path
    assert os.path.getsize(path) > 0, path
    sheets.append(page_spec["contact_sheet"])
assert len(sheets) == 3

# 17  the inventory document keeps the same slugs in the same order --------

with open(INVENTORY_PATH, "r", encoding="utf-8") as handle:
    inventory = handle.read()
rows = re.findall(r"^\|\s*(\d+)\s*\|\s*`([a-z0-9_]+)`\s*\|", inventory, re.MULTILINE)
documented = [(int(order), slug) for order, slug in rows]
expected = [(record["order"], record["slug"]) for record in MANIFEST["stubs"]]
assert documented == expected, documented[:5]

print(f"PICO_FEATURE_STUB_COUNT={len(STUBS)}")
print(f"PICO_FEATURE_STUB_CORE_INSTANCES={len(INSTANCES)}")
print(f"PICO_FEATURE_STUB_LIBRARIES={len(bpy.data.libraries)}")
print(f"PICO_FEATURE_STUB_PREVIEWS={len(previews)}")
print(f"PICO_FEATURE_STUB_SHEETS={len(sheets)}")
print("PICO_FEATURE_STUB_STATUS=valid_diagnostic_stub_set_not_character_approved")
sys.stdout.flush()
sys.stderr.flush()
os._exit(0)
