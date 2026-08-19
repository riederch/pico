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

  Since the generator pass it does not carry loose slider values at all. The
  page assembles one **Profile V1 appearance object** and hands it to the
  shipped `@pico/appearance`, bundled into the page at export time with
  esbuild. The package validates it, encodes it to its canonical `pa1_` code,
  reads that code back and projects the profile onto the compatibility core —
  all of it the code the product runs, not a second implementation beside it.
  The page shows the verdict: the typed error code when a value is refused,
  the payload length, whether the code round-trips, and the derived semantic
  head family.

  **The generator, not the page, decides which head module appears.** Both
  authored recipes are read out of the checkpoint, where the character
  generator wrote them as integers, and put through the real family
  derivation; the family that comes back is what selects the geometry. So the
  page never states that the raised crown is `top_structured` — it asks.

  Four of the six reachable families have no authored geometry. They resolve
  to a **visible placeholder** built in the exporter and never in the
  checkpoint, because showing nothing would say "this profile has no head
  module", which is a different sentence from "nobody has modelled this one
  yet".

  A panel measures **what each recipe field actually changes**, by sweeping
  every field through its published range against the current recipe and
  watching the projection: from the raised crown `side`, `length` and `lift`
  select the geometry; from the concept tail `side`, `length` and `sweep` do.
  The rest move only values inside the compatibility core, or nothing here at
  all. That is measured on load, not written down.

  Field bounds are published by the package as
  `appearanceProfileV1FieldRanges`, and the validator reads that same table
  rather than repeating the numbers — an input built from it cannot offer a
  value validation would refuse. A test drives every field to both endpoints
  and one step past each.

  `validate_pose_corridor.py` reads the corridor and the mount list out of
  `@pico/gesture` and applies them to the checkpoint: every named mount exists,
  is a joint and drives children; the rig carries no joint the projection
  cannot reach; the whole corridor — one axis at a time and every axis at once
  — stays inside a stated world envelope; and returning to rest restores the
  rest bounds exactly. `render_pose_corners.py` draws thirteen corners of that
  corridor from the package's own limits, because what a machine cannot decide
  here is whether a pose *reads* right. Both are described in
  [`gesture-pose-v1.md`](../../docs/development/briefs/gesture-pose-v1.md),
  including the three geometric criteria that were tried for deriving the
  corridor and why each measured the wrong thing.

  `validate_demo_viewer.mjs` checks the exported page from Node, where the
  Blender validators cannot see: it evaluates the inlined bundle, reads the
  model data beside it and holds the two against each other — same field
  names per zone, no restated bounds, both authored recipes valid, projecting
  to *distinct* families and surviving their own codes, and a placeholder that
  is not dead weight. Four mutations were run against it and each is caught: a
  renamed field, a removed placeholder, two recipes collapsed onto one family,
  and a bound restated in the page. It covers the rig the same way — the page
  and the projection must name the same joints, every part must hang off a real
  mount, and the reference poses must be poses the corridor allows. Four more
  mutations are caught there: a sample outside the corridor, a part on an
  invented mount, a missing joint, and a digit turned off its one axis.

  Since the gesture pass it also **poses what it draws**. The page assembles a
  Gesture Pose V1 from its own inputs, hands it to the shipped `@pico/gesture`
  — bundled in beside the appearance — and turns only the mounts the projection
  names. A refused pose moves nothing at all.

  The exported geometry is baked in rest world space, so the page composes the
  joint chain itself: undo a mount's rest place, apply the pose down the chain,
  put it back. That arithmetic is checked on load against matrices Blender
  computed for the same poses and shipped beside the geometry; it currently
  agrees to 7.7e-7. A page composing the chain differently would pose a
  character nobody authored — and the check earned its keep immediately, by
  catching a first version that compared a model matrix against a world matrix.

  It also drives the **PAS surface attributes** live: all fourteen fields of
  the four surface zones — shell `hue/chroma/lightness/gloss`, face
  `hue/tint/blackLevel/reflectivity`, trim `hue/chroma/metalness` and the
  personal head module `hue/chroma/translucency`, from
  `parametric-appearance-system.md` sections 10.1 to 10.3 and 9.

  The corridor bounds — the OKLCH box each zone stays inside — are defined
  once, in `SURFACE_CORRIDORS` in the exporter, and shipped to the page as
  data. They are a *rendering* statement and stay here; the *field* bounds are
  a contract statement and belong to the package. The page needs the mapping as a
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

`validate_head_variants.py` holds the set to exactly those fourteen mounts,
asserts no object named `Elbow` survives, checks what each mount owns, and
then **turns them**: the shoulder must move the arm and the hand, the arm
joint must move the hand and leave the arm where it is. A mount that does not
drive its children is decoration.

### The board's arms, read again and measured (tenth review)

Before changing anything further the concept board was read once more, with the
shadows lifted so the arm's dark side becomes visible. What the **Basis-Avatar**
shows:

- **One piece, no elbow.** A single continuous shell from shoulder to wrist.
  There are exactly two breaks: a dark collar at the shoulder and a cuff at the
  wrist. What an earlier pass took for an elbow band is that cuff.
- **A ring at the shoulder, not a ball.** A dark collar — a torus seen at an
  angle — sits between torso and arm, and the arm's rounded top plugs into it.
  No free-standing sphere appears anywhere on the board. The sphere in this
  model is the owner's decision and stays; it is recorded here as a deliberate
  departure, not an oversight.
- **A comma, not a tube.** Broadest just under the collar, narrowing all the
  way to the wrist, about two to one. The outer contour is a long convex arc
  and the inner one concave: the arm goes out, then turns down.
- **An open cuff** at the wrist — a visible rim with a darker interior, like a
  sleeve the hand leaves.
- **Not a circular section**: a lengthwise seam and a flattened facet on top.
- A **separate, darker hand** with three fingers and a thumb.

**The board contradicts itself, and that is worth writing down.** Only the
Basis-Avatar has a one-piece arm. The middle figure (*Ausdruck & Interaktion*)
clearly shows two shells with a dark band between them — an elbow — and the
right figure shows a weaker version of the same. The Basis-Avatar remains the
reference by the owner's decision; the other two figures are why the elbow
question keeps returning.

#### What the measurement said

Calibrated on the torso width, with the board's three-quarter perspective
treated as a source of error rather than ignored:

| | board | before | after |
|---|---|---|---|
| shoulder → wrist | 0.39–0.43 × torso width | 0.55 | **0.44** |
| hand from the wrist | 0.31 × | 0.23 | **0.29** |
| shoulder → fingertip | 0.71–0.74 × | 0.78 | **0.73** |

The reach was roughly right and **distributed wrong**: the board puts a third
of the limb into the hand, this model put under a quarter. So the arm came in
again by a fifth along the same measured line, and the hand grew by about a
quarter in every direction at once — palm, thickness and digits together, or it
would read as a mitten. The taper went from 1.64 to 2 to one with it.

The GLB envelope follows: ±0.740 → ±0.693.

The **shoulder ball then dropped 0.026** below the shoulder point, on the
owner's call. The offset runs along the body's own down axis rather than along
the arm: sliding it down the limb would carry it outward as well, and the ball
belongs on the torso's shoulder. From the side it now reads closer to the
board's dark collar — the arm passes through it rather than perching on it.

**Deliberately not built.** The wrist cuff sits exactly where the hand covers
it; it is worth building only if the hand is later set off from the wrist. The
lengthwise seam is a surface detail on a shell whose section is not final. Both
are named here rather than quietly skipped.

### The arm, shortened and rounded into its joint (ninth review)

Two changes, both to `Shell.Arm.<side>`:

**Shorter.** The measured path from the concept board ran 0.491 over its two
segments, which read long against the torso once the arm was one continuous
piece. Both joints are pulled in along the same line from the shoulder, by a
seventh, so the arm keeps the board's measured angles and only loses length.
The hand keeps its own size and follows the wrist in. The GLB envelope moves
with it, from ±0.792 back to ±0.740.

**Round at the top.** The upper end was a tube cut off against the torso, with
a visible rim where it met the shoulder ball. Over the first fifth of the
curve the radius now follows a circle instead of a taper, so the arm closes as
a dome that turns over into the joint. The widest point of the upper arm
therefore sits *below* the shoulder, where an arm is widest, rather than at
its very top; the shoulder radius dropped from 0.086 to 0.082 with it.

The dome closes the arm itself, so its start no longer has to be buried deep
in the torso to hide a rim — but it still has to be seated far enough that the
dome's foot is clearly inside rather than lying on the torso surface. At 0.014
the two shells were coplanar along the upper edge and the renderer speckled the
seam; 0.026 seats it.

**A seam artefact that stayed.** Where the arm emerges from the torso the two
shells meet at a shallow angle, and at close zoom that intersection curve
renders speckled. It is not new — a render of the previous arm from the same
camera shows the same band — and it is invisible at figure scale. Two smooth
shells crossing tangentially do this; removing it means changing how the arm
joins the body, not how the arm ends.

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

### The body leans and turns on what it hovers on

`PICO_MOUNT_body` sits between the root and everything else and carries the
whole figure — head pivot, both shoulders, torso, neck, chest group and the
underside emitter. Its height is again read off the geometry: the lowest point
of `Shell.Torso`, straight above the floor glow. A hovering figure that leans
swings from there like a top on its tip, and a turn about the same axis is a
turn in place.

Two objects deliberately stay at the root: `Status.HoverRing` and
`Status.HoverCore`. The floor glow lies flat on the ground plane and its two
floor axes were made equal on purpose; tilting it would read as a lamp
pointing sideways rather than as a character leaning. So the root carries the
body **and** the glow, and only the body mount turns.

Three more mutations are caught: the glow parented into the body, the head
mount taken out of it, and the pivot moved off the torso base.

The last one needed a **second attempt at the mutation, not at the rule**. The
first version moved the pivot together with everything hanging off it, so the
torso moved too and the pivot was still at its base — the file was not broken,
just floating higher, and the contract was right to pass it. The honest
mutation moves the pivot *against* the body, and then the rule bites.

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
