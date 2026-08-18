"""Validate the inventory and safety labels of the low-quality draft boards."""

import math
import os
import sys

import bpy


EXPECTED = (
    "hair_style_3_concept_tail",
    "hair_style_2_raised_crown",
    "standard_antenna",
    "hair_compact_unparted",
    "hair_centre_part",
    "hair_side_part",
    "hair_flat_side_sweep",
    "hair_short_rear_flow",
    "hair_segment_corridor",
    "hair_width_taper_corridor",
    "hair_twist_curl_asymmetry",
    "character_core",
    "material_zones",
    "status_light_group",
    "face_and_avatar_states",
    "pose_set",
    "origin_light",
    "presentation_tiers",
    "motion_and_reduced_motion",
    "context_technology",
    "context_water_infrastructure",
    "context_fire_department",
    "context_organization",
    "context_smart_home",
    "context_communication",
    "context_energy",
    "context_night_focus",
    "custom_clothing_fallback",
)

root = bpy.data.collections["PICO_LOW_QUALITY_FEATURE_DRAFTS"]
assert root["pico_status"] == "diagnostic_low_quality"
assert root["pico_character_approved"] is False
assert root["pico_draft_count"] == len(EXPECTED)
assert root["pico_source_adrs"] == "0009|0013|0124|0125|0133|0135"

pages = {
    "DRAFT_PAGE_01_HEAD_IDENTITY": 11,
    "DRAFT_PAGE_02_CHARACTER_RUNTIME": 8,
    "DRAFT_PAGE_03_CONTEXT_PRESENTATION": 9,
}
for name, expected_children in pages.items():
    page = bpy.data.collections[name]
    assert page.name in [child.name for child in root.children]
    assert len(page.children) == expected_children

drafts = []
for page_name in pages:
    drafts.extend(bpy.data.collections[page_name].children)
assert len(drafts) == len(EXPECTED)
assert sorted(draft["pico_draft_order"] for draft in drafts) == list(
    range(1, len(EXPECTED) + 1)
)
for order, slug in enumerate(EXPECTED, start=1):
    draft = bpy.data.collections[f"DRAFT_{order:02d}_{slug}"]
    assert draft["pico_status"] == "low_quality_draft"
    assert draft["pico_draft_order"] == order
    assert draft["pico_draft_slug"] == slug
    assert draft["pico_refinement_source"].startswith("TODO.md#")
    assert any(
        obj.get("pico_draft_role") == "draft_card"
        for obj in draft.objects
    )

tail = bpy.data.collections["DRAFT_01_hair_style_3_concept_tail"]
tail_names = [obj.name for obj in tail.objects]
for required in (
    "HairRoot.FlatDisc",
    "HairStyle3.PersonalRibbon",
    "HairStyle3.InnerCarrier",
    "HairStyle3.StatusEdge",
):
    assert sum(required in name for name in tail_names) == 1
assert not any("Antenna" in name for name in tail_names)

root_disc = next(obj for obj in tail.objects if "HairRoot.FlatDisc" in obj.name)
assert abs(root_disc.rotation_euler.x - math.pi / 2.0) < 0.0001
# Object dimensions remain in the cylinder's local bounding-box axes even
# after its object rotation: local Z is the thin axis, rotated onto world Y.
assert root_disc.dimensions.z < root_disc.dimensions.x * 0.20
assert root_disc.dimensions.z < root_disc.dimensions.y * 0.20

crown = bpy.data.collections["DRAFT_02_hair_style_2_raised_crown"]
assert sum("HairStyle2." in obj.name for obj in crown.objects) == 3
assert sum("HairRoot.FlatDisc" in obj.name for obj in crown.objects) == 1

core = bpy.data.collections["DRAFT_12_character_core"]
assert sum("Draft.Core.SideModule" in obj.name for obj in core.objects) == 2
assert sum("Draft.Core.AntennaStem" in obj.name for obj in core.objects) == 1
assert sum("Draft.Core.HeadAccent" in obj.name for obj in core.objects) == 1

zones = bpy.data.collections["DRAFT_13_material_zones"]
assert zones["pico_surface_controls"] == (
    "shell:hue|chroma|lightness|gloss;"
    "face:hue|tint|blackLevel|reflectivity;"
    "trim:hue|chroma|metalness"
)

status = bpy.data.collections["DRAFT_14_status_light_group"]
status_materials = {
    material.name
    for obj in status.objects
    if obj.get("pico_draft_role") == "status_emitter"
    for material in obj.data.materials
}
assert status["pico_status_group_rule"].endswith("same_colour")
assert status_materials == {"DRAFT_status"}
for required in (
    "Draft.Core.Eye",
    "Draft.Core.Mouth",
    "Draft.Core.Chest",
    "Draft.Core.HeadAccent",
    "Draft.Core.UndersideGlow",
    "Draft.Core.HoverRing",
):
    assert any(required in obj.name for obj in status.objects)

states = bpy.data.collections["DRAFT_15_face_and_avatar_states"]
assert states["pico_avatar_states"] == (
    "idle|listening|thinking|speaking|waiting|executing|warning|blocked|"
    "error|success|offline"
)

for order in range(20, 28):
    context = next(
        draft for draft in drafts if draft["pico_draft_order"] == order
    )
    assert context["pico_context_status_separation"] == (
        "status_stays_global; accessory_uses_context"
    )

clothing = bpy.data.collections["DRAFT_28_custom_clothing_fallback"]
assert clothing["pico_fallback_rule"] == (
    "never_replace_core|visor|status_group|rig"
)

print(f"PICO_FEATURE_DRAFT_COUNT={len(drafts)}")
print("PICO_FEATURE_DRAFT_STATUS=valid_diagnostic_low_quality_inventory")
sys.stdout.flush()
sys.stderr.flush()
os._exit(0)
