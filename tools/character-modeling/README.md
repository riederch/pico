# PICO character modeling prototype

This directory preserves the current, unapproved Character Core authoring
prototype and the scripts used to inspect it. It follows the authored versus
parametric split in ADR 0124 and keeps the alternative head identities from
ADR 0125 diagnostic.

Nothing here is a production Character asset:

- `prototype/pico-character-core-v0.blend` is an editable authoring checkpoint.
- `create_pico_character.py` rebuilds the checkpoint, previews and a diagnostic
  GLB under `/tmp/pico-character-core-v0`.
- `render_inspection.py` produces the reference, front, side, rear, top and
  bottom inspection views from an opened checkpoint.
- `validate_head_variants.py` checks the authored head mount, geometry bounds
  and exclusive selector after reopening the `.blend`.
- `validate_glb_world_bounds.py` reimports the generated standard-antenna GLB
  and verifies its world envelope and that diagnostic head modules did not
  leak into it.

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
The two selectors therefore choose diagnostic recipes; they do not add
`procedural_comb` or another public head-identity kind.

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
```

During visual iteration, `PICO_CHARACTER_HEADWEAR_ONLY=1` skips the three core
reference renders and the unchanged GLB export, and renders the two head recipes
at reduced resolution. A final checkpoint must be rebuilt once without it.

Blender 5.2 may finish all work and then wait in PulseAudio teardown on this
development machine. The generated artifacts and validation status are already
complete when Blender prints its final PICO status line.
