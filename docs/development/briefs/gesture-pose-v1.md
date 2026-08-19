# Gesture Pose V1

A second small object beside the appearance profile: what PICO is *doing*,
next to what PICO *is*.

This is an implementation brief for `@pico/gesture`, not an approval. Nothing
here grants a Character release, and the corridor it fixes is a corridor for a
diagnostic rig.

## Why it is a separate object

`@pico/appearance` carries identity. It is kept, versioned, encoded into a
code a person can paste, and part of who a PICO is. A gesture is the opposite
in every way that matters: momentary, discarded, and never allowed to change
identity. Folding a nod into the appearance profile would make a pose a thing
that has to be stored, migrated and version-frozen, and would let a pose
recolour a shell.

So there are two objects, and the rule between them is one-directional: a pose
may move what the appearance built, and may not alter it.

## What it holds

| Field | Meaning |
|---|---|
| `expression.state` | one of the ten `avatarStates` the protocol ships |
| `expression.intensity` | one of `low` / `normal` / `high` |
| `head` | `pitch` nod, `yaw` turn, `roll` side tilt |
| `body` | the same three, for the whole figure |
| `arms.<side>.shoulder` | the ball joint at the shoulder |
| `arms.<side>.arm` | the wrist joint — there is no elbow |
| `arms.<side>.thumb` | one curl, because a digit has one joint |
| `arms.<side>.fingers` | exactly three curls |

Everything is a whole number of degrees. Degrees rather than a normalised
`0..255` because the corridor is a statement about a body, and `-25..20`
degrees of nod says what a byte cannot.

**The elbow is absent by construction**, not by omission: a pose carrying one
is refused with `invalid_shape`, the same way the concept board's dark elbow
band is deliberately not modelled. A band where no joint is promises a joint
the character does not have.

## Angles are relative, and compose

Every angle is measured against the joint above it, the way the rig is built:
the head turns against the body, the digits against the wrist. In the world
they add up, so a head at its own limit of 45 degrees on a body already turned
35 faces 80 degrees away from the front.

The corridor deliberately does not clamp a joint by what its parent happens to
be doing. If it did, the same pose would mean two different things depending
on its neighbours, and a pose that validated alone would fail in company.

## The face is carried, not computed

Which eye and mouth shape a state pairs with is written into the authored
checkpoint, where `preview_face` draws eight of each and a state is a
*pairing*. The projection therefore passes `expression` through untouched.
Naming a pairing in this package would create a second face vocabulary beside
the drawn one, and the two would agree only until somebody changed one.

## Where a pose lands

`projectGesturePoseV1` is the whole list of what a pose may move: fourteen
named mounts, in a fixed order, in degrees. A renderer that reached into
geometry instead would be posing a copy of PICO.

```
PICO_MOUNT_body
PICO_MOUNT_head
PICO_MOUNT_shoulder.<side>  PICO_MOUNT_arm.<side>
PICO_MOUNT_finger.<side>.1..3  PICO_MOUNT_thumb.<side>
```

`validate_pose_corridor.py` holds the authored core to exactly that list: every
named mount exists, is a joint, and drives children; the rig carries no joint
the projection cannot reach; and no object named like an elbow survives.

## How the corridor was arrived at — honestly

The published limits are a **stated design corridor**, checked by eye against
renders of every corner and *informed by* — not derived from — a geometric
sweep of the authored core.

Three automatic criteria were tried and each measured the wrong thing:

1. **Counting touching triangle pairs** measures contact, and parts built to
   sit inside each other touch at rest. It reported the head as blocked at
   5 degrees of nod.
2. **Deepest penetration** punishes a digit for sliding further into a palm it
   is already hidden inside, which nobody can see. It gave the fingers a
   20-degree curl.
3. **"A vertex that is outside at rest goes inside"** — the right idea, and
   still wrong here: it flags the head's lower rim dipping into the torso,
   which the neck trim covers completely.

What reads as wrong depends on what a *third* part hides, so it is not a
property of two meshes. Rather than tune a metric until it agreed with taste,
the corridor is stated, the corners are rendered by
`render_pose_corners.py` — from the package's own limits, so a corridor change
shows up in the pictures — and a person looks at them.

What the machine still proves, without judgement:

- the rig carries exactly the joints the projection names;
- the whole corridor, one axis at a time and every axis at once, stays inside
  a stated world envelope, so no pose grows past the frame a renderer reserves
  (widening the body lean to 60 degrees breaks it at `x = 1.29` against 1.10);
- returning to rest restores the rest bounds exactly, so a pose leaves nothing
  behind.

## In the test bench

The demo viewer builds a Pose V1 from its inputs, hands it to the shipped
package, and turns only the mounts the projection names — a refused pose moves
nothing at all. The exported geometry is baked in rest world space, so the page
composes the joint chain itself; that arithmetic is checked on load against
matrices Blender computed for the same poses, and currently agrees to 7.7e-7.
A page that composed the chain differently would pose a character nobody
authored.

## Open

- Intensity is carried and resolved by nothing yet. It is in the object
  because the state vocabulary ships with it, not because a renderer reads it.
- Motion is not here at all: this is a pose, not an animation. Tweening,
  hover and reduced motion remain their own question.
- The corridor is fixed against the current authored core. A reshaped arm or
  hand may move it, and that is a corridor change, not an edit.
