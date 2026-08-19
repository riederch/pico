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

  It also drives the **PAS surface attributes** live: all fourteen fields of
  the four surface zones — shell `hue/chroma/lightness/gloss`, face
  `hue/tint/blackLevel/reflectivity`, trim `hue/chroma/metalness` and the
  personal head module `hue/chroma/translucency`, from
  `parametric-appearance-system.md` sections 10.1 to 10.3 and 9.

  The corridor bounds are defined once, in `SURFACE_CORRIDORS` in the
  exporter, and shipped to the page as data. The page needs the mapping as a
  *function*, since it recomputes while a slider moves, so it carries the same
  OKLCH conversion — and checks itself on load against reference colours
  computed in the exporter. A drift between the two is reported on the page
  instead of quietly changing what a value means; the current port agrees to
  5e-7.

  It carries the **avatar states** as a second exclusive selector beside the
  head identity. A state was only ever a drawing in front of an unchanged
  visor, so `preview_face` draws **eight eye shapes and eight mouth shapes**
  and a state is a *pairing* of one of each. A new state then needs one line
  in `AVATAR_STATE_FACES`, not new geometry.

  The state names come from `avatarStates` in `@pico/protocol` — a closed,
  shipped `as const` tuple carried by `avatar.state_changed`. An earlier pass
  built eleven faces from the prose in ADR 0009 and 0013 instead, and only six
  of eleven names matched the type that actually ships. `validate_head_variants.py`
  now reads that tuple out of the protocol source and asserts the mapping
  covers exactly it, in order, with every pairing distinct; three deliberate
  mutations (wrong name, missing state, duplicated pairing) each fail it.

  Each state differs in **shape**, not only in colour — a state read off
  colour alone is unreadable to anyone who cannot separate the hues.

  Every group on the page is a native `<details>` disclosure, so it collapses
  with the keyboard as well as the mouse and needs no script. A collapsed
  surface zone still shows its colour chip: the state of a group is readable
  without opening it.

  The **fourteen geometry fields** of the head module are deliberately not
  driven. They change geometry rather than colour, and reproducing them in the
  page would stand a second generator next to the Blender one. The page says
  so, and names them.
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

### Joint set: shoulder and arm, no elbow

The authored joint set is two joints per side. The arm turns at the shoulder,
the hand turns at the arm joint, and the shell between them bends without
being hinged. Each joint is an empty that owns what hangs off it —
`PICO_MOUNT_shoulder.<side>` carries the arm shell and the shoulder ball,
`PICO_MOUNT_arm.<side>` carries the hand — so a later runtime pose rotates a
mount instead of reaching into geometry.

The concept board draws a dark elbow band. It is deliberately not reproduced:
a band where no joint is would promise a joint the character does not have.

This is a change to the authored joint set, which `coreModelVersion` covers
and which is part of identity. That field currently reads 0, and the
appearance document defines 0 as *not pinned to a released authored character
core* because ADR 0124 has released none — so the change is free today and has
to be frozen with the first released core.

`validate_head_variants.py` holds the set to exactly those thirteen mounts,
asserts no object named `Elbow` survives, checks what each mount owns, and
then **turns them**: the shoulder must move the arm and the hand, the arm
joint must move the hand and leave the arm where it is. A mount that does not
drive its children is decoration.

### One joint per digit, and a head that turns (eighth review)

The hand was one closed shell, so a finger could not move without the palm.
`hand_shell` now returns the palm and a description of each digit, and
`digit_shell` builds every finger and the thumb as its own object under its
own mount:

| mount | carries |
|---|---|
| `PICO_MOUNT_finger.<side>.1..3` | `Trim.Finger.<side>.1..3` |
| `PICO_MOUNT_thumb.<side>` | `Trim.Thumb.<side>` |

Both hang off `PICO_MOUNT_arm.<side>`, so the wrist still carries the whole
hand and each digit moves alone inside it. The contract checks that too: it
turns one digit and requires its three neighbours to stay put to within
`1e-6`, and that each digit joint owns exactly one digit — one joint per
finger means one finger per joint.

The head had no pivot at all. Shell, visor, frame, side modules, status caps,
the face drawings and the head-module mount all hung directly off the root, so
nothing could nod, turn or tilt without dragging the body along.
`PICO_MOUNT_head` now sits between them and the root and carries all of it,
tagged `pico_joint_degrees_of_freedom = "pitch|yaw|roll"`.

Its height is **read off the neck**, not typed in: the pivot sits at the top
vertex of `Trim.Neck` (currently `y = -0.336`). The head turns against the
neck, so if the neck is reshaped again the pivot follows it instead of
drifting into the shell. The neck itself deliberately stays with the body.

The contract turns the head about each of the three axes and requires the
shell, the visor and a face drawing to move while the torso and the neck stay
still to within `1e-6`. Measuring the **vertex cloud** rather than the centroid
is what makes the yaw check work at all: the head is nearly symmetric about
its own vertical axis, so its centre of mass barely moves when it turns — a
centroid probe passed a head that was in fact standing still.

Five mutations were run against the checkpoint and each is caught: a dropped
finger joint, two digits sharing one joint, a pivot moved off the neck edge,
the neck parented into the head, and a face drawing left behind by the head.

A digit rotated far enough sweeps into the palm — at −70° the base visibly
intersects it. That is a **pose limit** and belongs to the gesture corridor
still being designed, not to the model: the joint has to be able to reach
further than the corridor will allow.

### Arm pose, measured (seventh review)

Three passes changed how the arm was *built* while its **pose** stayed wrong,
so the seventh pass measured the board instead of estimating from it.
Calibrating on the torso width and the head-top-to-chest-core height:

| | board | before | |
|---|---:|---:|---|
| upper arm angle | 34.7° | 46.5° | 12° too steep |
| forearm angle | 48.0° | 66.8° | 19° too steep |
| total length | 0.484 | 0.421 | 15% too short |
| wrist reach | 0.722 | 0.640 | 0.082 too far in |
| shoulder height | −0.406 | −0.490 | 0.084 too low |

The arm hung too steeply, was too short and was rooted too low, which is why it
read wrong however its parts were built. The joints now follow those angles and
lengths, with the shoulder placed on the torso surface at that height rather
than inside it, and the wrist lands at 0.724 against the board's 0.722.

That reach is wider than the old envelope, so `validate_glb_world_bounds.py`
moves from −0.712/+0.672 to a symmetric ±0.792 and additionally asserts that
the two arms are mirrored.

### Arm build and hand roll after the sixth review

Read against `docs/assets/pico-design-concept.png` at high magnification.

- Each arm is **one continuous tapering piece** from the shoulder to the
  wrist. `arm_shell` lofts it along a single curve whose control point is
  placed so the curve passes through the elbow: the arm bends *through* the
  elbow rather than being hinged at it, so there is no string of shell
  segments threaded onto joint spheres.
- The **shoulder keeps its ball**. It is what the arm turns on, and without it
  the arm merely grows out of the torso. It is seated deep enough that only
  its outer cap shows past the shell; left exposed it reads as a knob rather
  than as a joint.
- `joint_collar` marks the elbow with a dark band. The band has to clear the
  arm all the way round: the arm bends through the elbow, so on the inside of
  the bend it sits closer to the collar's wall than the nominal radius
  suggests and pokes through a band sized to that radius alone.
- Both hands are rolled so the **back of the hand faces outward** and the palm
  turns toward the body, which is what makes a hanging hand read narrow from
  the front. The thumbs point forward.
- The head reaches exactly as far back as the torso.

### Head depth, arm pose and floor light after the fifth review

- The head is shortened at the back until it ends level with the torso. The
  revolved profile cannot express that on its own — its depth is one radius
  shared by front and back — so the rear is compressed afterwards, smoothly
  from the head's equator so the compression leaves no crease where it begins.
  Everything that sits on the head reads the same compression through
  `head_rear_unscale`, or it would be placed against a surface that is no
  longer there.
- The tail fitting is placed at a fraction of how deep the head actually is,
  not at a fixed depth. Shortening the back moved a fixed depth from the
  middle of the crown to its rim, and the plate slid off the crown with it.
- Both hands hang with their palms turned inward, as on the concept board, so
  a hand reads narrow from the front and its fingers point straight down.
  Facing the palm forward turned the same hand into a raised, open gesture.
- The two glows under the character are round in the floor plane. An ellipse
  there reads as a light pointing sideways rather than downward.

### Curvature, ears, hands, head and neck after the fourth review

- The display keeps the curvature it had before the head was cut. That
  curvature used to come from the patch partly following the round shell;
  with the shell cut away it is an explicit dome instead. The dome is measured
  on its own radii, separately from the outline, so the display and its frame
  share one dome and differ only in where they are cut off — otherwise the
  display rises through its own frame, because each would dome over its own,
  differently sized outline.
- The head side modules taper towards their outer cap rather than flaring.
- The hands are rebuilt from the concept board: a cupped palm carrying three
  fingers and a thumb, all in one mesh and one object. The board shows four
  clearly separated rounded digits, not a mitten; palm and digits therefore
  overlap where a hand's knuckles are, so the result reads as one form while
  each digit still tells itself apart. The digit roots sit deep enough inside
  the palm that their end caps never surface through the cupped palm face.
- The back of the head runs round. The two profile segments meet at the head's
  widest, deepest section, and their control points are now collinear across
  that join: with the depth slope flipping sign there the back carried a
  visible crease.
- The neck is longer and slimmer, and the torso starts lower and narrower so
  the added length is actually seen rather than hidden inside the body.

### Face cut, ponytail and hands after the third review

- The head is **cut off** at the front with a plane rather than softly
  flattened, so the face is a genuinely flat area with the display set into
  it. A plane cut needs no feather at all: outside the cut the shell is
  already behind the plane, so those vertices are left alone and the rim falls
  out as the natural intersection curve. Both face patches are therefore built
  flat and measured off the cut, not off the round shell they no longer
  follow.
- The tail fitting is a circle. One radius drives both of its in-plane axes,
  so `rootSpread` cannot stretch it back into an oval.
- The hair leaves that plate **gathered**, the way a ponytail leaves its tie,
  and opens out to full width over the first fifth of its length. It stays one
  closed light guide throughout: ADR 0125 rules out a group of separate
  strands, so the ponytail reading comes from the width profile, not from
  splitting the band.
- The hands are one piece, as on the concept board. `hand_shell` builds a
  single closed mitten whose fingers are grooves and whose thumb is a lobe of
  the same shell; its palm is cupped rather than a sphere, because a sphere
  reads as a knob and a real hand is a shell with a hollow in it. Which way
  the thumb lobe falls is derived from the frame against a world direction:
  the two hands' palms face different ways, and a hand-picked sign got the
  left thumb pointing outward.

### Head, chest and ears after the second review

- The display is set into the helmet by one inset shared by the dark face and
  its trim frame, so the two stay a single assembly. A straight offset alone
  tops out near `0.02`: past that the round shell breaks through the middle of
  the face. `flatten_head_face_area` therefore flattens the shell across the
  frame's footprint, and the display sits at `0.030`.
- That recess deliberately reaches past the frame's own rim. Stopped exactly
  at the rim, shell and frame meet tangentially, and because neither mesh's
  edges follow the other's outline that contact renders as a visible
  staircase. Held behind the frame all the way out and released only
  afterwards, the two never touch.
- The chest core is tilted to lie almost parallel with its own bezel. The
  angle is measured off the same dished surface the ring is placed on, so the
  two cannot disagree; for the authored body that is 5.5 degrees.
- The head side modules widen towards their outer cap. `frustum` places a
  truncated cone the way `cylinder` places a cylinder, and rotating by
  `sign * 90` degrees around Y puts the second radius outward for both ears,
  so one description serves left and right.

### After the owner's first review

The head and body were corrected as follows. A first attempt at the display
ended its rim *inside* the shell so the helmet closed over the face; the owner
rejected it, and the section above describes what replaced it.

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
