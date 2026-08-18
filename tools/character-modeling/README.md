# PICO character modeling prototype

This directory preserves the current, unapproved Character Core authoring
prototype and the scripts used to inspect it. It follows the authored versus
parametric split in ADR 0124 and keeps the alternative head identities from
ADR 0125 diagnostic.

Nothing here is a production Character asset:

- `prototype/pico-character-core-v0.blend` is an editable authoring checkpoint.
- `prototype/pico-character-feature-drafts-v0.blend` is a separate board of
  deliberately rough, diagnostic feature placeholders. Its complete inventory
  and source mapping live in `FEATURE_DRAFTS.md`; none of its primitives are
  part of the core checkpoint.
- `prototype/pico-character-feature-stubs-v0.blend` is the feature stub set:
  the same 28 groups as individually addressable stubs that link
  `PICO_CHARACTER_CORE` once instead of redrawing it. It is `diagnostic_stub`,
  it closes no refinement item, and it supersedes neither the draft board nor
  the core checkpoint.
- `feature-stub-manifest-v0.json` is the single inventory source for the stub
  set. Generator and validator read the order, kinds, roles and subvariants
  from it; neither keeps a second list of slugs.
- `create_pico_character.py` rebuilds the checkpoint, previews and a diagnostic
  GLB under `/tmp/pico-character-core-v0`.
- `create_pico_feature_drafts.py` rebuilds the 28 rough feature collections and
  three overview renders under `/tmp/pico-character-feature-drafts`.
- `create_pico_feature_stubs.py` rebuilds the 28 stubs, 28 isolated 512 px
  previews and three contact sheets under `/tmp/pico-character-feature-stubs`.
- `validate_feature_stubs.py` reopens the saved stub checkpoint and proves the
  manifest contract: one linked core library, 28 stubs in manifest order,
  antenna/hair exclusivity, one status material across the whole status group,
  context colour outside the status group and clothing as an overlay.
- `export_demo_viewer.py` writes a self-contained WebGL demo viewer to
  `/tmp/pico-demo-viewer`, using `demo-viewer/viewer-template.html` as its
  page. The viewer shows the authored core, switches each part group on and
  off, keeps the three head identities mutually exclusive and recolours the
  whole `status_emitters` zone at once. Its geometry is decimated to a
  triangle budget and travels inside the page, so it is a picture of the
  checkpoint and never a second source for it.
- `render_inspection.py` produces the reference, front, side, rear, top and
  bottom inspection views from an opened checkpoint.
- `validate_head_variants.py` checks the authored head mount, geometry bounds
  and exclusive selector after reopening the `.blend`.
- `validate_glb_world_bounds.py` reimports the generated standard-antenna GLB
  and verifies its world envelope and that diagnostic head modules did not
  leak into it.
- `validate_feature_drafts.py` reopens the draft board and checks its order,
  diagnostic labels, first two hair foundations and the status/context
  separation rules.

## Feature stub set

`prototype/pico-character-feature-stubs-v0.blend` links the collection
`PICO_CHARACTER_CORE` from `prototype/pico-character-core-v0.blend` exactly
once, over the relative path `//pico-character-core-v0.blend`. Groups 12 to 28
place 21 instances of that one collection; not one of them re-models a core
part locally.

Groups 1 to 11 carry no core instance on purpose. The linked core owns a fixed
standard antenna, and nine of those eleven head identities must show no antenna
at all, so a plain instance could not satisfy the exclusivity rule. They mount
on `STUB_SHARED_HEAD_MOUNT_PROXY` instead: one deliberately translucent, coarse
dome, instanced eleven times, marked `pico_is_character_core = False`. It is a
mount reference, never a second head authority.

Every status accent in every stub - hair status edges, the six status regions,
the eleven avatar drawings - references the linked `PICO_ZONE_status_emitters`
material, so the status colour has exactly one source in the file. Personal
hair colour is the separate local material `STUB_personal_translucent_shell`.

The generator writes its checkpoint to `/tmp/pico-character-feature-stubs`
beside a copy of the core, so the relative library path resolves before the
file enters the repository. The repository checkpoint is that validated file,
copied unchanged; the same relative path then resolves against the real core.

The generated GLB and PNG previews deliberately stay outside the repository.
ADR 0124 PR1 requires a normative mesh to enter as a separately registered,
hash-pinned Character asset, and the owner has not made that approval decision
for this prototype.

## Head identity selector

Select `PICO_MOUNT_head_module` in Blender and edit the custom property
`pico_head_identity_index`:

- `0`: standard antenna
- `1`: concept crown crest (`head-raised-crown`)
- `2`: concept rear ribbon (`head-long-neon-tail`)

Exactly one carrier is visible. Crest and rear ribbon are recipes of the same
proposed procedural generator, not separate fixed accessory standards. Each
replaces the antenna and carries one status accent. Their diagnostic geometry
is visually compared with `docs/assets/pico-design-concept.png`, but remains
unapproved.

The personal shell colour is generated from the recipe's `hue`, `chroma` and
`translucency` values. It is a transmissive, non-emissive light guide over one
dark connected carrier. The narrow emitter is a separate material and always
uses the same runtime status material as eyes, mouth, chest and hover light.
The rear-ribbon recipe first passes through a low, chassis-finished hair-root
cover on the crown; only the following translucent hair uses the personal
colour. Root and hair share the same continuous carrier and remain one module.
The two selectors therefore choose diagnostic recipes; they do not add
`procedural_comb` or another public head-identity kind.

## Hair style 3: the refined concept tail

`head-long-neon-tail` was pulled through the detail pass in `TODO.md` section 1
and now follows the concept board rather than the first rough proposal:

- The fitting is placed on the **sampled crown surface**. `head_surface_y`
  solves the authored head profile for the height at a point, so the plate lies
  tangentially on the shell and is sunk into it. The earlier version put it at a
  fixed mount height, which left it floating above the crown on a stalk.
- The guide curve is one short, full, strongly rounded arc: it rises from the
  fitting's rear edge, loops over the crown, falls behind the head without
  reaching below it, and ends in a tip that swings outward and upward and
  closes as a dome instead of a cut-off stump.
- The band is one closed light guide with two material slots. Outer and inner
  face are the same personal colour, the inner one shaded, so the authored roll
  of roughly half a turn alternately shows both without ever splitting into a
  second strand.
- `ribbon_transport_frames` anchors the flat face on the head's lateral axis.
  Parallel transport drifted once the curve turned through a full arc and left
  the top arc standing on its edge. The shell, the dark carrier and the narrow
  status edge all read those same frames, so the edge stays on the band border.
- The shell is shaded from the **analytic** ellipse normal. Averaging normals
  over a 12:1 flat cross section made the band look like woven leather.
- Personal colour and status colour are separate materials by construction: the
  status edge uses `PICO_ZONE_status_emitters`, the same material as eyes,
  mouth, chest core, underside and hover ring.

Two checks run inside the generator, because both are claims about the whole
PAS corridor rather than about one authored recipe:

- `check_rear_ribbon_corridor` walks every corridor endpoint of every geometry
  field, rebuilds the guide through the same code path the module is built
  from, and fails the build if the band penetrates head, visor or side module
  anywhere outside the intended root embedding.
- `report_personal_colour_corridor` prints the personal shell colour and
  transmission for hue, chroma and translucency samples and fails if two
  different recipes ever produce the same colour.

`validate_head_variants.py` then re-opens the checkpoint and checks the
silhouette contract itself: a flat fitting that is measurably embedded in the
head shell, exactly one dark collar with one mounting point, no antenna while
the tail is active, one connected shell, the arc/fall/tip landmarks, the width
profile, the roll, the shared status material and a parting seam that ends
before the band.

After the owner's first review the head and body were corrected further:

- The display sits back in the helmet. `visor_surface_z` takes a `sink`, so
  across its outer rim the patch runs past the shell and ends inside it. The
  helmet closes over the face and there is no cut edge, as on the concept
  board.
- The tail fitting lies on the crown's centre line, further back, and the hair
  leaves it at its **centre** rather than at its rear edge, so the plate sits
  around the root instead of in front of it.
- The chest core sits in a shallow round depression pressed into the torso
  itself. `dish_amount` describes that recess once; the torso mesh is
  displaced by it and the chest rings are placed on it, so the recess and the
  parts sitting in it cannot drift apart.

Two of those corrections moved the band's root, and the corridor check caught
what that broke each time. The lessons are now in the geometry rather than in
tuned constants: the arc aims its **upper edge** at a height above the crown
instead of a fixed rise above the root, the apex additionally clears the head
sampled underneath it, the fall is placed behind the **head** rather than
behind the root, and a rear-flowing ribbon roots on the rear half of the crown,
because rooted further forward the broad band has to turn over the dome itself
and cuts into the shell while it does.

None of this is a Character approval. The recipe stays `diagnostic` and the
refinement items in `TODO.md` stay open until the owner accepts them.

## Rebuild and validate

Set `PICO_BLENDER` to the Blender executable, then run:

```bash
"$PICO_BLENDER" --background -noaudio --factory-startup --disable-autoexec \
  --python-exit-code 1 --python tools/character-modeling/create_pico_character.py

"$PICO_BLENDER" /tmp/pico-character-core-v0/pico-character-core-v0.blend \
  --background -noaudio --disable-autoexec --python-exit-code 1 \
  --python tools/character-modeling/validate_head_variants.py

"$PICO_BLENDER" --background -noaudio --factory-startup --disable-autoexec \
  --python-exit-code 1 \
  --python tools/character-modeling/validate_glb_world_bounds.py

"$PICO_BLENDER" --background -noaudio --factory-startup --disable-autoexec \
  --python-exit-code 1 \
  --python tools/character-modeling/create_pico_feature_drafts.py

"$PICO_BLENDER" \
  /tmp/pico-character-feature-drafts/pico-character-feature-drafts-v0.blend \
  --background -noaudio --disable-autoexec --python-exit-code 1 \
  --python tools/character-modeling/validate_feature_drafts.py

"$PICO_BLENDER" --background -noaudio --factory-startup --disable-autoexec \
  --python-exit-code 1 \
  --python tools/character-modeling/create_pico_feature_stubs.py

"$PICO_BLENDER" \
  tools/character-modeling/prototype/pico-character-feature-stubs-v0.blend \
  --background -noaudio --disable-autoexec --python-exit-code 1 \
  --python tools/character-modeling/validate_feature_stubs.py
```

The stub validator also checks the 28 previews and three contact sheets under
`/tmp/pico-character-feature-stubs`, so run the generator before it.

During visual iteration, `PICO_CHARACTER_HEADWEAR_ONLY=1` skips the three core
reference renders and the unchanged GLB export, and renders the two head recipes
at reduced resolution. A final checkpoint must be rebuilt once without it.

Blender 5.2 may finish all work and then wait in PulseAudio teardown on this
development machine. The generated artifacts and validation status are already
complete when Blender prints its final PICO status line.
