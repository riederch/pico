# 0148 - A mailbox is issued to a device, and it lives as long as that device's delegation

## Status

Accepted direction, not implemented (EX1-EX5 open). Decided 2026-08-12.
ADR 0147 built the shape a delivery address has and said the ceremony that
hands one to a peer belongs elsewhere. This is elsewhere.

## Context

ADR 0147 leaves a Pico holding a book of mailboxes and no way to have got
one. Its RY2 fixes the shape - one entry per party a credential exists
with, two addresses issued by opposite sides - and stops there on purpose,
because how an address travels is a credential question and answering it
inside an envelope ADR would have grown that slice past proving.

The question has a smaller answer than it looks, because **the channel
already exists**. ADR 0107 built a sealed, signed, mutually pinned
request/response path between a person's device and their own Home. It
works exactly when the two can reach each other directly - which is the
condition a relay exists to survive the absence of. So the exchange rides
the direct channel while it works, and pays off later when it does not.
Nothing new is carried, nothing new is trusted, and there is no bootstrap
problem: a device that has never once reached its Home has nothing to relay
either.

What is genuinely open is smaller and sharper than "a ceremony": **who the
peer is, and how long the address lives.**

## Scope

Covers: which relationship an address is issued into, what the exchange
carries, when it happens, what re-running it means, and the rule that ends
an address without anyone acting.

Does not cover: mailboxes between *different people's* Picos - ADR 0002's
peer relationships are concept-only, and there is no credential to hang one
on yet; the relay server; registering a mailbox at an operator, which is
the caller's precondition and belongs with the relay client; and any
address for a Pico Home that is not a person's own.

## Decision

### The peer is a device, not a person

ADR 0147 RY2 says a mailbox belongs to a relationship and its book is keyed
by peer fingerprint. For the case that exists today the peer is the
**device signing key**, not the person's identity key, and the reason is
RY2's own invariant: a Home with two of a person's devices would have to
put both behind one mailbox if the identity keyed it, and RY2 refuses that
because a shared mailbox stops identifying the sender. Two devices, two
mailboxes.

That is not a widening of RY2 so much as a reading of it. The peer of a
mailbox is **whatever authenticates the sender end to end**, and on ADR
0107's channel that is the delegated device key - the identity authorises
it, the device signs with it, and the Home checks both.

### The exchange is one operation, and it is symmetric

`home.link.mailbox.exchange`, added to ADR 0107's closed operation list -
which is a decision, in that ADR's words, and not a consequence of adding a
route.

One round trip carries both directions, because there are two addresses and
they are issued by opposite sides: the device sends the address it issues
to the Home, and the Home answers with the address it issues to the device.
Two operations would leave a window in which one side can reach the other
and not be reached, which reads as a working relay and is half of one.

### The address travels inside the seal, never beside it

An address is a capability. Anybody who learns a mailbox can fill it, and
ADR 0147 RY6 makes a full mailbox refuse rather than evict - so a leaked
address is a denial of that one relationship until it is reissued.

It therefore travels only in ADR 0107's sealed payload, never in an
envelope field, a header, a URL or a log line. This is worth stating as a
rule rather than leaving to care, because the thing that carries it is a
transport and transports are where values get logged.

### A mailbox lives exactly as long as its delegation, and nobody has to end it

This is the decision that shapes the rest.

The obvious design revokes a mailbox when a device is revoked, by hooking
the lifecycle transition. That is a hook somebody can miss, and what it
protects is real: a lost device whose delegation was revoked would keep a
mailbox that still accepts. Its packets would fail authentication when
opened - the ADR 0107 signature chain does not care about mailboxes - so
this is not an authority bypass. It is a resource: a revoked device can
fill a mailbox the Home keeps holding, and ADR 0147 RY6 will correctly
refuse everything else that arrives there.

So a mailbox is not revoked. **It is honoured only while the delegation it
was issued to is active**, derived at use with
`hasActivePicoIdentityDelegation`, exactly the check ADR 0107's own
authorisation already runs on every request. There is no second record to
keep in step, no revocation event to miss, and no window between the
lifecycle transition and the mailbox catching up.

ADR 0147 RY4's explicit revocation stays, for the case it was written for -
a burned or flooded address that the relationship should survive. The two
are different acts: one ends an address, the other ends a device.

### Re-running the exchange is rotation

There is no separate rotate operation. A device that runs the exchange
again is issued a new mailbox and hands over a new one, and ADR 0147 RY2's
`issuePicoLinkInboundMailbox` replaces rather than adds. That keeps ADR
0143's posture - a change happens when somebody decides it, not when a
timer fires - and it means the flooded-mailbox remedy and the first-run
path are one code path rather than two.

## Gates

- **EX1 - One operation, on the channel that already exists (open):**
  `home.link.mailbox.exchange` in ADR 0107's closed list, with its request
  and response payload contracts and canonical arguments. No new transport,
  no new cryptography, no handshake.

- **EX2 - The peer is the device (open):** the Home keys its book by the
  requesting device's signing key fingerprint, taken from the authenticated
  principal and never from an argument. A device naming its own peer key
  would be a device choosing which mailbox it is, which is the same class
  of mistake as a supplier naming its own directory (ADR 0143 DP8).

- **EX3 - Life is the delegation's life (open):** a mailbox is honoured
  only while `hasActivePicoIdentityDelegation` says its delegation is
  active. Derived at use rather than mirrored into a status column, so
  there is no second record and no revocation hook to forget. Proved by
  revoking a delegation and finding the mailbox no longer honoured, with
  nothing having run in between.

- **EX4 - Sealed, never beside (open):** an address appears only inside the
  ADR 0107 sealed payload. A check walks the Link surface for an address
  reaching a log line, an envelope field or a route, in the idiom
  `check-companion-boundary.mjs` already uses for the tray import hull.

- **EX5 - Re-exchange is rotation (open):** running the exchange twice
  leaves one entry per device, with the newest addresses and the peer
  unchanged. The durable half - where a Home keeps its book - lands here,
  and it answers ADR 0119 Q5's ceiling like every other store the core
  owns.

## Non-goals

- mailboxes between different people's Picos (ADR 0002 is concept-only);
- the relay server, its accounts and its registration API;
- registering a mailbox at an operator - the caller's precondition, and
  handing over an address that was never registered is a caller bug this
  ADR does not try to detect;
- discovery of any kind: an address is handed over, never looked up;
- any address for a Home that is not the person's own.

## Consequences

Positive:

- no new channel, no new cryptography and no bootstrap problem - a device
  that has never reached its Home has nothing to relay either;
- the security property that mattered most needs no code to maintain it,
  because it is derived from a check ADR 0107 already runs;
- rotation, first run and the flooded-mailbox remedy are one path;
- ADR 0147's book gets its first real producer, and its
  `pico_link_inbound_shared_between_peers` invariant gets a real subject:
  two devices of one person.

Negative and residual:

- the exchange requires the two ends to reach each other **once**, which is
  the condition the relay exists to survive - a device that has never been
  in contact cannot be reached by relay, and that is a real limitation
  rather than a bug;
- a mailbox whose delegation went inactive stays registered at the operator
  until something deregisters it, so the operator holds a name for longer
  than the Home honours it;
- nothing here stops a person's own device from flooding its own mailbox;
- ADR 0002 peer relationships remain the larger open question, and the
  device case does not settle it.

## Relationship to other ADRs

- **ADR 0147** built the mailbox book and named this ceremony as elsewhere;
  this is it. RY2's peer key is read as "whatever authenticates the sender
  end to end", which for today's case is a device.
- **ADR 0107** is the channel, unchanged, plus one operation opted in.
- **ADR 0109** owns device lifecycle; EX3 consumes its outcome rather than
  subscribing to it.
- **ADR 0143** decided that a change happens when somebody decides it
  rather than when a timer fires; re-exchange is that applied to an
  address.
- **ADR 0119 Q5** governs the durable book EX5 lands.
- **ADR 0002** would extend this to peers who are not the person; it is
  concept-only and out of scope.

## References

- ADR 0002 - peer trust and relationship model
- ADR 0107 - Pico Link Direct: sealed envelopes to the own Home
- ADR 0109 - authenticated device lifecycle over Pico Link
- ADR 0119 - resource exhaustion and denial-of-service posture
- ADR 0143 - a depot ships what it runs and a new commit is a new decision
- ADR 0147 - a mailbox is a relationship, and a relay is told where, not why
