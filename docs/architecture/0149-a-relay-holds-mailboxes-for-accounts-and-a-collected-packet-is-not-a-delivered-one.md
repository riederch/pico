# 0149 - A relay holds mailboxes for accounts, and a collected packet is not a delivered one

## Status

Accepted direction, not implemented (RS1-RS6 open). Decided 2026-08-12.
ADR 0147 decided what a relay is told and named the server a non-goal; ADR
0148 gave both ends addresses to hand each other. This builds the machine
those addresses point at.

## Context

ADR 0147 and ADR 0148 leave the system in a state that is coherent and
inert: a Home and a device exchange mailbox addresses over the direct
channel, file them, and have nowhere to send anything. Every contract for
the packet, the queue decision and the answer vocabulary exists and nothing
runs them.

What has to be decided before it can is the half ADR 0147 pushed away on
purpose - **the machine is somebody else's.** A relay is the first
component in this system that is not the person's own device, not their
Home, and not something they are asked to trust. ADR 0031 says what it may
and may not do; it does not say who is allowed to ask it for a mailbox, how
it knows, or what happens to a packet after somebody picks it up.

Those three questions turn out to have answers the earlier ADRs already
force, and the forcing is the interesting part.

## Scope

Covers: what a relay is as a deployable, who may register a mailbox and how
that is authorised, why delivery is not authorised at all, who may collect,
what collection does to a packet, and what the relay keeps.

Does not cover: multi-hop, routing between operators, discovery, the
Meshtastic adapter, operator billing, and a Pico Home offering relay mode
to third parties - ADR 0028 requires that to be opt-in and separately
designed, and this ADR does not design it.

## Decision

### A relay is a separate deployable, and holds nothing of a person's

`apps/relay`, its own process, its own store, runnable by somebody who is
not the person and has no Pico. It runs no ceremony, holds no key of
anyone's, and every byte it stores is either a label it issued or
ciphertext it cannot read.

That is not modesty, it is ADR 0031's list read as a specification: a
component that must not decrypt payloads, own identity keys, issue
credentials, authorise actions or decide rules has almost nothing left to
be except a queue with a door on it.

### Registration is authorised by an account, and an account is not a Pico

Somebody has to be allowed to ask for a mailbox, or the relay is an open
one. ADR 0031 forbids exactly one shape of answer: **relay account identity
must not be equivalent to Pico identity.**

So the relay issues *accounts* out of band - the operator's business, a
bearer credential, no ceremony - and knows nothing about who holds one. An
account carries a quota and nothing else. The relay never learns which Pico
registered a mailbox, and two mailboxes on one account tell it only that
one account holds both, which is a fact about a customer rather than about
a person's relationships.

**A Pico signature would have been the wrong instinct here** and it is
worth saying why, because it is the reflex this tree usually rewards. The
relay does not need to know *who*; it needs to know *whether this is within
somebody's quota*. Authenticating with a Pico key would answer a question
nobody asked and hand the operator the identity ADR 0031 spends its
metadata table keeping away from it.

### Delivery is not authorised, and that is a consequence rather than a gap

Anyone holding a mailbox address may deliver to it. There is nothing to
authenticate: ADR 0147 RY1 removed the sender field, so a packet carries no
claim about who sent it and the relay has no way to check one.

This looks like a hole and is the design working. What stands in its place
was decided already: the address is 128 bits and unguessable (ADR 0147
RY2), it is handed to exactly one peer and travels only inside the ADR 0107
seal (ADR 0148 EX4), a full mailbox refuses rather than evicting (ADR 0147
RY6), and the payload is sealed end to end so a stranger who guessed an
address could add noise and read nothing.

The remaining exposure is stated rather than closed: whoever learns an
address can fill that one mailbox until it is reissued. That is one
relationship, and reissuing is one act.

### Collection is authorised by the account that registered

The mailbox owner needs a way to read that a stranger with the address does
not have. **The account is already that**, so the relay needs no per-mailbox
secret and ADR 0147's book needs no new field: the account that registered
a mailbox is the only one that may collect from it or deregister it.

The alternative - a collection secret issued per mailbox - was rejected for
being a second credential to distribute, store and rotate, in a design
whose whole point is that an address is a label. An operator account is a
deployment property the device already needs to reach the operator at all.

### A collected packet is not a delivered one

**Collection does not remove. Acknowledgement removes.**

ADR 0118 O1 settled this shape for the Home and the reasoning transfers
exactly: being told twice is a cost a person can absorb, being told never
is the failure that matters. A relay that dropped a packet as it handed it
over would lose it whenever a collector crashed between the socket and the
disk, and the loss would be invisible on both sides - the sender was told
`accepted`, the recipient never saw it, and nobody is wrong.

So collecting returns packets and leaves them; the collector acknowledges
by tag once it has them durably, and only then are they gone. Delivery is
at-least-once and duplicates are the recipient's to absorb, which is what
ADR 0147 RY6's per-packet tag already lets them do.

This also keeps ADR 0147 RY5 true from the other side: the relay still
never says a packet was *delivered*. It says it was acknowledged by
whoever holds the account, which is a fact it can actually observe.

### What it keeps, and what it forgets

Registrations, with their status, and packets until the expiry the sender
set. A deregistered mailbox leaves a tombstone, because ADR 0147 RY4 needs
`mailbox_revoked` to be answerable and forgetting would turn a deliberate
ending into a typo.

Everything is bounded. A quota per account bounds mailboxes; ADR 0147 RY6's
capacity bounds packets per mailbox; expiry bounds how long any of it
lives. A tombstone's retention is the one number this ADR leaves to the
operator, and it says so rather than picking one.

## Gates

- **RS1 - The machine is separate (open):** `apps/relay` as its own
  process, its own store and its own package, depending on
  `@pico/protocol` and on nothing of the core's. A check asserts it reaches
  no Pico store, vault or identity module, in the idiom
  `check-companion-boundary.mjs` uses.

- **RS2 - An account, never a Pico (open):** registration and collection
  authenticate a bearer account credential. Nothing in the relay parses,
  verifies or stores a Pico identity, delegation or signature, and a check
  proves the absence rather than a comment claiming it.

- **RS3 - Delivery takes no credential (open):** the deliver path accepts a
  packet parsed by `parsePicoLinkPacket` and answers a
  `picoLinkDeliveryOutcomes` member, using `resolvePicoLinkDelivery`
  unchanged - the decision was made in ADR 0147 RY4/RY5/RY6 and this gate
  wires it rather than reimplementing it.

- **RS4 - Collection needs the account that registered (open):** collecting
  from or deregistering a mailbox requires the account it was registered
  under. A different valid account is refused as though the mailbox were
  not there, because telling one customer that another holds a given
  mailbox is a fact the relay has no reason to disclose.

- **RS5 - Collect then acknowledge (open):** collection returns packets and
  removes nothing; acknowledgement by tag removes. Proved by collecting,
  not acknowledging, and collecting again to find the same packets.

- **RS6 - Bounded, and its own ceilings (open):** mailboxes per account,
  packets per mailbox, packet lifetime, and a refusal by name for each.
  Nothing here trims to make room, in ADR 0119 Q5's posture.

## Non-goals

- multi-hop, inter-operator routing and discovery (ADR 0028 non-goals);
- a Pico Home offering relay mode to third parties - ADR 0028 requires it
  opt-in and separately designed;
- operator accounts as a product: issuing, billing, revoking and quotas
  beyond a number on a row;
- transport below the relay's own surface: TLS is the deployment's;
- the Meshtastic adapter and ADR 0029's reserved transport session key.

## Consequences

Positive:

- ADR 0147's contracts get their first runtime, and `resolvePicoLinkDelivery`
  is wired rather than reimplemented, so the queue decision has one home;
- ADR 0031's "relay account identity is not Pico identity" holds by
  construction: there is no code path that could learn a Pico identity,
  because none parses one;
- the at-least-once shape reuses a decision the tree already made rather
  than inventing a delivery-semantics position;
- an operator can run this without trusting or being trusted by anybody.

Negative and residual:

- anyone who learns an address can fill that mailbox until it is reissued,
  which is one relationship and one act, and is the price of an envelope
  with no sender;
- an account groups the mailboxes registered under it, so an operator sees
  that these N mailboxes belong to one customer - ADR 0147 RY7's collection
  correlation, arriving through the account rather than the connection, and
  mitigated the same way: several operators;
- tombstone retention is the operator's, and an operator that keeps them
  forever holds a list of endings;
- there is no abuse control beyond quotas and capacity: a flooder with an
  address costs its target one reissue and costs the operator a queue.

## Relationship to other ADRs

- **ADR 0028** named the relay network and left the server undesigned; this
  designs the smallest one that can carry ADR 0147's envelope.
- **ADR 0031** is the specification this reads as one, and its account rule
  is RS2.
- **ADR 0147** decided the envelope, the outcomes and the queue rule; RS3
  and RS5 wire them.
- **ADR 0148** produced the addresses this holds, and its precondition -
  registering one at an operator - is RS1's reason to exist.
- **ADR 0118 O1** decided that a component does not claim what it cannot
  observe; RS5 is that applied to collection.
- **ADR 0119 Q5** governs RS6's ceilings.

## References

- ADR 0028 - Pico Link transport facade and relay network
- ADR 0031 - Pico Link identity, relay and domain threat model
- ADR 0107 - Pico Link Direct: sealed envelopes to the own Home
- ADR 0118 - offline and model-free degradation contract
- ADR 0119 - resource exhaustion and denial-of-service posture
- ADR 0147 - a mailbox is a relationship, and a relay is told where, not why
- ADR 0148 - a mailbox is issued to a device, and it lives as long as that device's delegation
