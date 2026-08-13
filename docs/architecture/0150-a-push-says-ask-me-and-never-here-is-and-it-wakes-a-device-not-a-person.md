# 0150 - A push says "ask me" and never "here is", and it wakes a device rather than a person

## Status

Accepted; **PU1 and PU2 implemented 2026-08-13**, PU3-PU5 open. Decided
2026-08-13.
ADR 0149 built a relay that carries a device's questions when the direct
path is gone. This adds the one thing that relay cannot carry: a Home
reaching a device that did not ask.

## Context

The relay works and its most valuable case does not.

ADR 0147 through ADR 0149 leave a device able to reach its own Home from
behind anything, and a Home able to answer. Every envelope in that path is
an ADR 0107 response, and an ADR 0107 response is **sealed to
`replyPublicKeyHex`** - a key that exists only because the device asked
first. There is no shape in the tree for a Home speaking unprompted, so
there is no way for one to arrive.

That leaves ADR 0112's alarm where it has always been: the companion
*polls*. Its carrier reads the lifecycle on start and at least every six
hours, and again on wake and network return. The relay makes that polling
survive an unreachable Home, which is worth having and is not the thing.
A person whose device is asleep is not polling, and a Home that has a
pending recovery to raise has no way to say so.

**The gap is small and specific**, which is why it deserves its own
decision rather than being solved sideways by the wiring that noticed it.
Nothing about keys is missing: the Home already holds the device's
key-agreement public key, registered with the reader key that ADR 0083
requires; the device already holds the Home's host signing key, pinned in
its profile since first run. Both primitives are the two this tree uses
everywhere. What is missing is an envelope, and the decisions about what
may travel in it.

## Scope

Covers: what a push may say, what it is sealed to and signed by, how it is
bound against replay, what it is allowed to cause, and when a Home may send
one.

Does not cover: the relay itself (ADR 0149), device-initiated requests (ADR
0107), any transport other than the ADR 0147 packet a push travels in, and
pushes between different people's Picos - ADR 0002 remains concept-only.

## Decision

### A push says "ask me". It never says "here is"

This is the rule the other four follow from.

A push carries no operation, no arguments, no result and no reason. What it
tells a device is that there is something worth asking about, and the
device then does what it already does: an authenticated read over the
direct path or the relay, decided and authorised by the machinery that
already exists.

**The alternative inverts something load-bearing.** A push carrying an
operation would make the Home a *requester* to the device, and ADR 0139 is
built one-directionally on the premise that a requester is never trusted -
with the whole consent, rule and history apparatus on the receiving side.
Pointing that backwards would mean either building a second apparatus on
the device or trusting the Home, and the second is the one nobody would
notice having chosen.

A push carrying *content* is worse in a quieter way: content has a privacy
domain and a readership decision (ADR 0077), and a message that arrived
outside the read path would be content that routed around custody. Saying
"ask me" cannot do that, because the asking goes through custody like every
other read.

**Not even a reason.** A closed vocabulary of push *kinds* - lifecycle,
entries, and so on - looked useful and is the trap this repository has
sprung on itself three times in one week: a second closed list beside the
operations, over the same subject, free to drift. A device that skipped
reads based on a kind would be a device whose correctness depended on those
two lists agreeing. The cost of not having it is one authenticated read,
which is the thing the device does anyway.

### Sealed to the device, signed by the Home, and pinned both ways

Sealed to the device's key-agreement public key, which the Home holds
because ADR 0083 registered it with the reader key. Signed by the host
signing key, which the device holds pinned in its profile from first run.
No new key material, no new trust, and the same two primitives ADR 0107
uses - which is the whole of what ADR 0016 permits.

The inner payload names the **device it is for**, and the device checks
that against the key it holds. That is the same refusal ADR 0149's
collector makes from the other side: a push that named a different device
would be one that reached this mailbox by leak or by misroute, and acting
on it would quietly accept either.

### Replay is bounded because a push costs a read, not because it grants anything

A replayed push is not an authority problem. It cannot be forged - it is
signed - and what it causes is a read the device is entitled to make
anyway. What replay costs is a **read, a radio and a battery**, and that is
enough to bound it.

So: a fresh push id, a short expiry, and a bounded seen-set on the device,
in the shape ADR 0107 already uses for request ids. Coarse is fine here,
and saying so is part of the decision - a bound sized for authority would
be a bound sized for the wrong risk.

### A push wakes a device. Whether a person is disturbed is decided elsewhere

This is what makes the third question smaller than it looked.

A push does not notify anybody. It causes a device to look, and what the
device *finds* is what decides whether a person is interrupted - through
ADR 0112's alarm rules, which already weigh that and already hold the
"loud alarm, re-raises, stays armed" posture. A Home that pushes has not
decided to disturb a person; it has decided that looking now is better than
looking in six hours.

That keeps the person-facing decision in the one place that already makes
it, and it means a push needs no consent of its own beyond the one already
given: a person who configured a relay operator decided that their Home and
their device may reach each other through it.

### A Home pushes when looking now is better than looking later, and not more often than that

Unbounded pushing is a battery attack a Home can perform on its own person.
A floor between pushes to one device, and a push only where the six-hour
poll would be too late - a pending recovery, an objection window closing.
Ordinary changes wait for the poll.

**A push is never retried into silence.** ADR 0149 RS5 already says a relay
cannot report delivery, so a Home that resent until something happened
would be resending against no signal at all. One push per event, and the
poll is the floor that catches what a push missed - which is exactly the
relationship ADR 0118 O1 draws between announcing and acknowledging.

## Gates

- **PU1 - "Ask me", never "here is" (implemented 2026-08-13):**
  `pico.link.push.v1` carries six signed fields, and the four that are
  missing are the contract. `operation`, `arguments`, `result` and `kind`
  have nowhere to be written, and each is refused **by name** rather than
  ignored - a Home sending `operation` has not made a typo, it is asking
  for the thing this ADR removed. `picoLinkPushSaysNothingAbout` keeps the
  four reasons as data, because an absent field cannot document itself.

- **PU2 - Sealed to the device, signed by the Home (implemented
  2026-08-13):** canonical signature input and vectors in the ADR 0107 D1
  discipline. **`expiresAt` is inside the signature**, not beside it, so a
  carrier cannot widen the window a replay is worth anything in, and
  `parsePicoLinkSealedPush` runs the same builder that produces the signed
  bytes rather than shape-checking separately - a payload it accepts is one
  a verifier can actually check.

  Pinned both ways: the payload names the device it is for and a device
  refuses one naming another, which is the refusal ADR 0149's collector
  makes from the other side; and it refuses one whose host fingerprint is
  not the pinned Home, because a URL is reachability and a relay is a
  carrier, and only the pin says whose Home this is.

  Worth keeping beside ADR 0147 RY1: **that** envelope has no canonical
  bytes because nothing signs it, and this one does because something
  does.

- **PU3 - Bounded replay (open):** a fresh push id, a short expiry and a
  bounded seen-set on the device. Proved by replaying a valid push and
  finding it accepted once.

- **PU4 - It wakes a device, never a person (open):** receiving a push
  causes a read and nothing else. No notification surface is reachable from
  the push path, and a check proves the absence rather than a comment
  claiming it - the same idiom `check-link-seal.mjs` uses.

- **PU5 - A floor between pushes (open):** one push per event, a minimum
  interval per device, and no retry. Proved by a Home with two events
  inside the floor sending one push, and by a push that is never resent
  when nothing is heard back.

## Non-goals

- pushes between different people's Picos (ADR 0002 is concept-only);
- any push that carries content, an operation or a result;
- a delivery signal of any kind - ADR 0149 RS5 stands, and a relay does not
  report delivery;
- replacing the poll: the poll is the floor a push sits above, and a device
  that only heard pushes would be a device that goes quiet whenever an
  operator does;
- waking a *person* - that decision stays with ADR 0112.

## Consequences

Positive:

- the case a relay is most worth running for becomes possible rather than
  merely survivable;
- no new key material, no new primitive and no new trust: both halves were
  already held for other reasons;
- the person-facing decision stays in ADR 0112, where it is already made
  carefully;
- "ask me" keeps custody, consent and rules on the read path they already
  govern, so a push cannot become a side door for content.

Negative and residual:

- a push tells an operator that *something* happened for that mailbox at
  that moment - the timing signal ADR 0147 RY7 already records, now with a
  Home-side cause;
- a device that is off hears nothing, and the poll remains the only floor;
- a Home that is compromised can spend a person's battery within the floor;
- one more envelope family to keep vectors for, and ADR 0046's compatibility
  claim stays unmade.

## Relationship to other ADRs

- **ADR 0107** is the shape this borrows and the reason it is needed: its
  response is sealed to a per-request key, so nothing unprompted fits.
- **ADR 0112** owns whether a person is disturbed; PU4 keeps it there.
- **ADR 0118 O1** draws the announce/acknowledge line this reuses: a push
  announces, the read is what raises.
- **ADR 0139** is why a push carries no operation - its requester model is
  one-directional on purpose.
- **ADR 0147/0149** carry the push as an ordinary packet; the relay learns
  nothing new from it.
- **ADR 0083** registered the key this is sealed to, for a different reason.
- **ADR 0016** permits the two primitives used and forbids inventing any.

## References

- ADR 0016 - cryptography boundaries and non-goals
- ADR 0077 - Foundation memory content read API and domain readership seam
- ADR 0083 - reader-key registration and freshness contract
- ADR 0107 - Pico Link Direct: sealed envelopes to the own Home
- ADR 0112 - recovery product surfaces in the background companion
- ADR 0118 - offline and model-free degradation contract
- ADR 0139 - every action is requested by someone Pico does not trust
- ADR 0147 - a mailbox is a relationship, and a relay is told where, not why
- ADR 0149 - a relay holds mailboxes for accounts, and a collected packet is not a delivered one
