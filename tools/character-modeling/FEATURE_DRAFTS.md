# PICO low-quality feature drafts

These boards make every currently identifiable visual Character requirement
cheap to inspect before any detail work begins. They are deliberately rough,
carry no production approval and are not a replacement for the authored core,
the concept board or Character Design.

## Sources and scope

All 154 numbered ADR files present on 2026-08-18 were searched for Character,
avatar, appearance, geometry, material, status, context, motion and presentation
terms. The feature-bearing decisions reduce to the following decisions and
their directly referenced Character documents:

- ADR 0009: visible avatar states and the authority boundary;
- ADR 0013: core silhouette, status group, context equipment, state set and
  optional origin glint;
- ADR 0124: authored core parts, five material zones, three poses and three
  presentation tiers from one source;
- ADR 0125: one exclusive head identity, the procedural hair corridor,
  personal materials and a custom-clothing fallback;
- ADR 0133: every lower-quality representation remains derived from the same
  source instead of becoming a second authority;
- ADR 0135: `neutral` / `technical` / `soft` is not an implemented style axis
  and therefore creates no draft family;
- `Character_Standard_v3.2.1.md`, `Character_Core_Modeling_Brief.md`, the
  status-light hotfix, `Context_Modules.md` and the PAS brief provide the
  concrete visual details referenced by those ADRs.

ADR 0025 contains only an example extension name, ADR 0026 only the public
name `Origin Light`, ADR 0113 only the visible-window/reduced-motion runtime
constraint, ADR 0126 only the presence that selects a presentation tier, and
ADR 0133 the derivation rule. They add no further Character geometry. Other
search hits use words such as `shell`, `pose`, `purpose` or `expose` in their
software meaning and likewise add no visual feature.

Runtime behaviour, codec fields, synchronization, persistence and approval
work are not geometry and do not become fake model features here. Hair physics
and natural strands remain explicit non-goals. Context equipment is shown only
as a primitive placeholder beside Pico; it never recolours the status group.

## Ordered inventory

The order is intentional: the concept-tail finding comes first, the second
hair style comes second, and every remaining requirement follows afterwards.

| # | Draft collection | What the rough draft proves |
|---:|---|---|
| 1 | `hair_style_3_concept_tail` | Flat crown plate followed by one short, broad, twisted translucent ribbon with an upward hook |
| 2 | `hair_style_2_raised_crown` | Shared flat root and three broad crown blades instead of horns or natural strands |
| 3 | `standard_antenna` | The mutually exclusive neutral head identity |
| 4 | `hair_compact_unparted` | Seamless compact common root |
| 5 | `hair_centre_part` | Centre seam contained inside one root zone |
| 6 | `hair_side_part` | Offset seam contained inside one root zone |
| 7 | `hair_flat_side_sweep` | Low lateral flow along the crown |
| 8 | `hair_short_rear_flow` | Short rearward ribbon before the long-tail family |
| 9 | `hair_segment_corridor` | The three- and nine-segment limits as broad lamellae |
| 10 | `hair_width_taper_corridor` | Narrow/wide roots and taper towards the end |
| 11 | `hair_twist_curl_asymmetry` | Twist, curl and lateral displacement remain one guide family |
| 12 | `character_core` | Head, visor, neck, torso, arms, hands, chest and hover form |
| 13 | `material_zones` | Shell, face, trim, status and head-module zones stay distinct; the three personal surface parameter groups remain named on the collection |
| 14 | `status_light_group` | Eyes, mouth, chest, head accent, underside and hover ring use one status material |
| 15 | `face_and_avatar_states` | Runtime face drawings cover the combined ADR vocabulary: idle, listening, thinking, speaking, waiting, executing/working, warning, blocked, error, success and offline/degraded |
| 16 | `pose_set` | Neutral, interacting and open authored poses |
| 17 | `origin_light` | One tiny decorative and hideable chest glint |
| 18 | `presentation_tiers` | Static, composite and realtime are fidelity views of one Character |
| 19 | `motion_and_reduced_motion` | Gentle hover/pulse plus a fully static reduced-motion fallback |
| 20 | `context_technology` | Technical panel placeholder outside the Character core |
| 21 | `context_water_infrastructure` | Water/flow placeholder outside the Character core |
| 22 | `context_fire_department` | Helmet placeholder whose red is context, not status |
| 23 | `context_organization` | Document/dashboard placeholder |
| 24 | `context_smart_home` | Home/device placeholder |
| 25 | `context_communication` | Radio/audio/message placeholder |
| 26 | `context_energy` | Battery/power placeholder whose amber is context, not status |
| 27 | `context_night_focus` | Low-light placeholder without changing identity |
| 28 | `custom_clothing_fallback` | Visible workwear fallback that cannot replace core, visor, status or rig |

## Artifacts

- `create_pico_feature_drafts.py` rebuilds all 28 draft collections and three
  overview renders under `/tmp/pico-character-feature-drafts`.
- `prototype/pico-character-feature-drafts-v0.blend` is the editable draft
  checkpoint.
- `validate_feature_drafts.py` checks inventory order, diagnostic labels, the
  flat first root plate, status/context separation and clothing boundaries.
- `TODO.md` is the refinement checklist. A low-quality draft does not close
  any item there.

The separate checkpoint is deliberate. Nothing on these boards may silently
enter `pico-character-core-v0.blend`, the normative-candidate GLB or a product
surface merely because a primitive exists.
