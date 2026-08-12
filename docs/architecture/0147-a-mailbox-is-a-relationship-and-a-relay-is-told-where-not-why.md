# 0147 - A mailbox is a relationship, and a relay is told where, not why

## Status

Accepted direction; RY1, RY2, RY3 and RY7 implemented 2026-08-12, RY4-RY6
open. Decided 2026-08-12.
This is the second runtime slice of ADR 0028 after ADR 0107's direct
envelopes, and it decides exactly one thing: **what a carrier that must not
read a payload is allowed to see on the outside of it.** The relay server,
its federation, multi-hop routing and the Meshtastic adapter stay outside.

## Context

ADR 0107 built an authenticated channel to a person's own Home and stopped
where the product needs to keep going. It works when the device can reach
the Home directly. When it cannot - the Home behind a router, the device on
mobile data, the two never awake at the same time - there is no path at
all, and ADR 0028 named the answer as a relay four ADRs before anything
could use one.

What has blocked that answer is not the transport. It is that a relay is
the first component in this system that **holds a person's traffic without
being trusted with it.** Every carrier so far was either the person's own
Home or a direct socket to it. A relay is somebody else's machine, run by
somebody else's operator, and ADR 0031 lists what it may and may not do in
two careful columns without saying what it is *told*.

That gap is the whole problem, because payload encryption settles very
little here. ADR 0031's own metadata table grades a destination hint high,
a sender routing identity high, presence high and location very high - and
then leaves the classification as a requirement rather than a decision. A
relay that receives ADR 0028's conceptual envelope verbatim would learn who
talks to whom, how often, when, how urgently and what kind of traffic it
is. None of that is the payload. All of it is the relationship.

**The premise that makes this tractable is that Pico has no strangers.**
IP-style open addressability exists because the internet must let unknown
parties reach each other. Pico must not. Every legitimate packet comes from
a party the recipient already holds a credential with - a Home membership,
a device delegation, an ADR 0002 peer relationship. The set of permitted
senders is small and known before the first packet. A design that keeps
paying the costs of open addressability is paying for a property this
system does not want.

## Scope

Covers: the packet envelope a relay sees, what each field is for and why
the absent ones are absent; what a delivery address is and what it belongs
to; what a relay may answer; how duplication and expiry are handled without
a correlator; and an honest ledger of what a relay operator can still
infer.

Does not cover: the relay server itself, queue implementation, operator
federation or inter-operator routing, multi-hop, discovery, the Meshtastic
adapter, capability negotiation, a published compatibility claim (ADR 0046
stands), and the ceremony that hands a delivery address to a peer - that
belongs with the credential work in ADR 0031 and ADR 0045, and this ADR
deliberately fixes only that such an address is relationship-bound.

The draft `pico.link.*` fixtures in ADR 0042-0066 describe this layer and
several of them have waited since 2025 for exactly the decision below. This
ADR does not redeem them; it makes redeeming them possible, and RY7 says
which ones now have something to be measured against.

## Decision

### The core rule

**A relay is given what it needs to deliver and nothing that explains
why.**

Every field on the envelope answers one question - *can this carrier
deliver the packet without it?* - and a field that fails is not made
optional or "should be avoided". It is absent from the contract, so no
operator can request it and no sender can supply it. This is ADR 0117 X1's
construction, the same one ADR 0143 DP1 uses to make "track main"
inexpressible rather than forbidden: a rule needs something to keep obeying
it, and an absent field needs nothing.

### Four fields, and the three that are gone

The envelope carries a destination mailbox, a per-packet tag, a coarse
expiry and the sealed payload. What ADR 0028 sketched and this removes:

| Field | Does the relay need it to deliver? | Outcome |
|---|---|---|
| sealed payload | Yes, opaque | Kept |
| destination mailbox | Yes - without it there is no delivery | Kept, as a replaceable address (RY2, RY3) |
| per-packet tag | Yes, for duplicate detection | Kept, but fresh per packet (RY6) |
| expiry | Yes, to clear the queue | Kept as a bucket, not an instant (RY6) |
| **sender routing identity** | **No** | **Absent (RY1)** |
| **priority** | **No** | **Absent (RY1)** |
| **content type** | **No** | **Absent (RY1)** |
| **hop TTL** | **No** | **Absent (RY1)** |

The sender field is the one worth arguing, because losing it is what makes
the rest work. A relay does not need to know who sent something in order to
put it somewhere. It needs a sender only to rate-limit per sender and to
tell the recipient who wrote - and the second of those belongs inside the
sealed payload, where the recipient can authenticate it against a
credential and a carrier cannot read it at all. The first dissolves once
mailboxes are per relationship, which is the next decision.

### A mailbox belongs to a relationship, not to a Pico

A Pico does not have *an* address. It issues one to each party it holds a
credential with, and only that party is ever given it.

Four things follow, and they are the reason to prefer this over an
address-per-Pico:

- **The envelope needs no sender.** The mailbox *is* the sender's identity,
  seen from the recipient's side, because exactly one peer was ever told
  it. What the relay sees is that something arrived at a mailbox, and a
  mailbox is not a person.
- **The social graph does not form.** An address-per-Pico relay accumulates
  "A sent to B" pairs whether it wants to or not, and a log somebody seizes
  later is a map of a person's relationships. Per-relationship mailboxes
  accumulate per-mailbox traffic patterns instead, which is one
  relationship's shape and not the graph.
- **Abuse answers itself.** A flooded mailbox damages exactly one
  relationship. The recipient revokes it and issues that peer a new one.
  There is no blocklist to maintain, no sender reputation, no delivery
  token to mint - and above all, **no new cryptography**. ADR 0016 permits
  reviewed primitives and forbids invented ones, and ADR 0080 has already
  turned down a password-authenticated key exchange on that rule. A mailbox
  is a label; revoking one is a delete.
- **Revocation is proportionate.** Losing one peer does not force every
  other peer to be re-addressed.

This ADR fixes that an address is relationship-bound and that a Pico must
be able to hold many. **How** an address is handed to a peer is a credential
ceremony, and putting it here would grow this slice until it could no
longer be proved.

### The address names its operator

An address names where it lives, in the shape everyone already reads:
`<mailbox>@<operator>`.

That single choice is what keeps ADR 0031's "must not require one central
provider" true **by construction rather than by policy**. A person can
issue Bob a mailbox at one operator and Carol a mailbox at another; Bob
knows only the first, Carol only the second, and neither operator sees the
whole. Nothing in the protocol changes between using one operator and using
five - a sender goes to the operator the address names, and no
inter-operator routing exists or is needed.

Using several is therefore **possible and not required**. The cost is real
and is the person's to weigh: an account per operator. The mechanism should
not decide that for them.

### Stable and revoked on decision, never rotated on a schedule

Addresses do not roll.

A rotating address requires both ends to agree on when it rotates, and the
case a store-and-forward relay exists to serve is precisely the one where
the two ends **cannot reach each other**. An address that rolled while the
peer was offline is an address that has quietly disconnected a
relationship, and the failure would surface as silence.

Rotation still exists; it is triggered rather than timed. A burned or
flooded mailbox is revoked and a new one issued over the credential channel
that established the relationship - ADR 0143's posture that a change
happens when somebody decides it, not when a timer fires.

The privacy cost of stability is a long-lived label at one operator.
Because the label is per relationship, what accumulates under it is the
traffic pattern of one relationship rather than a graph, which is the trade
this decision accepts and RY7 records.

### Acceptance is answered; delivery is not

A relay answers that it **has** a packet. It never answers that a packet
was **delivered**.

This is not a new judgement. ADR 0118 O1's scheduler made it already and
for the same reason: an earlier version marked an entry raised and called a
surface, so a surface that could not take it left the entry marked and
nobody told. The Home cannot observe that a notification reached a person,
so it stopped saying it had. A relay cannot observe that either, and a
delivery receipt would be both a claim it does not have and a timing
correlator that tells the sender when the recipient was awake.

End-to-end acknowledgement is an ordinary sealed message, authenticated
like any other, and it is the recipient's to send.

### The transport session key stays reserved

ADR 0107 handed ADR 0029's transport-session-key role to "the relay ADR,
where a carrier that must not read payloads actually exists". It exists
now, and the role stays reserved anyway.

The envelope needs confidentiality on the hop to the operator - otherwise a
network observer, as opposed to the operator, reads the destination
mailbox. On an IP transport that is ordinary TLS to the operator: a
deployment property, not a protocol Pico composes, and ADR 0016 is
explicit about not inventing cryptography where a standard one is in place.
The reserved role is for transports that have no such layer - the ADR 0028
Meshtastic adapter is the named case - and it should be spent there, by
that adapter, and not before there is one.

## Gates

- **RY1 - The envelope carries four fields and the refusal is the absence
  of the rest (implemented 2026-08-12):** `pico.link.packet.v1` as a
  `@pico/protocol` subpath - `to`, `tag`, `expiresAt`, `payload` - with a
  negative vector per removed field.

  **This gate asked for the wrong half of ADR 0107 D1's discipline and the
  correction is worth keeping.** It said "canonical bytes and vectors", and
  there are no canonical bytes here: nothing signs an envelope. ADR 0107
  seals and signs end to end and those bytes pass through as an opaque
  payload, so a carrier compares nothing - it delivers. Building signature
  input for it would have been machinery carrying nothing. What D1 has that
  this needed is the *refusal* discipline, and that is what was built.

  An unknown key is refused **by name** -
  `pico_link_packet_carries_no:from` - because a caller sending `priority`
  has not made a typo. It is asking for the thing this ADR removed, and
  being told which field rather than "unexpected_field" is the difference
  between a message that explains a decision and one that reports a shape.
  `picoLinkPacketRemovedFields` keeps the four reasons as data beside the
  absence, since an absent field cannot document itself.

  An off-grid expiry is refused rather than rounded on arrival: rounding
  would accept the leak and then hide it, leaving a sender producing
  precise expiries and believing they were private.
  `picoLinkExpiryBucketFor` rounds **up**, because a packet that expired
  earlier than its sender believed is the quiet failure. `nowMs` is a
  parameter rather than a clock read, so a sender building a packet and a
  relay accepting one each get the checks they can actually make.

  Four planted defects were made to fail: ignoring unknown keys, rounding
  an off-grid expiry, taking the first `@` of two, and dropping the payload
  ceiling.

- **RY2 - A mailbox belongs to a relationship (implemented 2026-08-12):**
  `@pico/protocol/link-mailbox` holds one entry per party a credential
  exists with, and every lookup takes a peer. There is no
  `picoLinkAddressOf(pico)`.

  A relationship holds **two** addresses issued by opposite sides, which
  the ADR text above had left implicit. `inbound` is ours to revoke;
  `outbound` is the peer's and is absent until they hand it over - an
  ordinary state, answered with `undefined` rather than a throw, because a
  relationship can exist before the exchange finishes.

  **Two refusals carry the security of this design, and the second was not
  in this ADR before it was built.** No two peers may share an *inbound*
  mailbox: if they did, the mailbox would stop identifying the sender and
  the envelope's absent sender field would turn from a removed fact into an
  unknown one. And no two peers may share an *outbound* mailbox - that one
  is an attack rather than an accident, because a peer that hands us the
  address another peer gave us would silently redirect everything we write
  to the first into the second's mailbox. We cannot stop a peer naming any
  address it likes; we can refuse to hold two peers behind one, and the
  moment to notice is when it is written down rather than after the first
  message.

  Revocation removes the whole entry rather than clearing a field: an entry
  with the inbound gone and the outbound left is a relationship this Pico
  can still write to and can no longer be answered on, which reads as
  working and is not.

  The handover is still not built, as this gate said. This is the shape one
  has to produce.

- **RY3 - The address names its operator (implemented 2026-08-12):** the
  parser and formatter landed with RY1, including the negative vectors for
  an address with no operator and one naming two. What RY2's book adds is
  the part that matters: **there is no operator field on a relationship
  entry**, so an operator cannot be held beside an address and disagree
  with it - a disagreement would send a packet to a relay that never heard
  of the mailbox. `picoLinkInboundOperators` shows one book naming several
  operators, which is ADR 0031's "no central provider" holding by
  construction rather than by policy, and `picoLinkInboundMailboxesAt` says
  how many mailboxes one operator can group into one device. That last one
  exists because RY7 names collection correlation as a residual, and a
  mitigation nobody can measure is not one.

- **RY4 - No scheduled rotation (open):** there is no expiry, no rotation
  interval and no "valid until" on an address - again the absence, not a
  rule. Revocation is an explicit act with a reason, and a revoked address
  is refused by name rather than reported as unknown, so a peer that hits
  one learns it was revoked rather than that it mistyped.

- **RY5 - Acceptance only (open):** the relay client's answer type has one
  success shape, "accepted", and no delivery shape to return. A caller
  wanting confirmation of receipt has to wait for a sealed message from the
  peer, because there is no other way to get one.

- **RY6 - Dedup without a correlator, expiry without a clock (open):** the
  per-packet tag is fresh for every packet, so an operator cannot link two
  packets to one sender by their tags; a sender-stable identifier here
  would hand back the correlator the missing sender field just removed.
  Expiry is a coarse bucket rather than an instant, because an absolute
  timestamp leaks the sender's clock and how long the sender believes the
  thing matters. A full mailbox **refuses** rather than evicting, in ADR
  0119 Q5's posture that a ceiling refuses and never trims - silently
  dropping a queued packet is the quiet failure, and a refusal the sender
  can see is the loud one.

- **RY7 - An honest ledger, and the drafts it lets us measure (implemented
  2026-08-12):** the table below, kept in the shape of ADR 0107 D5 -
  achieved and missing properties in one list. Completing RY1-RY6 does not
  complete relay privacy, and the ledger is where that stays visible.

  The four drafts are read and **all four are retired**, none as fixtures.
  `0043` and `0065` are superseded by RY1: they constrain what may be
  written into `senderRouteId`, `priority`, `ttl`, `contentType` and
  `extensions`, and RY1 removes all five, so a rejection rule for a field
  that does not exist has nothing left to reject. Their instincts survive
  in the successor and their shape does not.

  `0044` and `0063` turned out to be superseded by **ADR 0107**, not by
  this ADR, and to have been since 2026-08-08 with nobody writing it down.
  The placeholder in `0044` existed explicitly "until reviewed encryption,
  key wrapping, signature inputs, canonicalization and verification
  semantics exist" - and ADR 0107 built all of them. `0063` is worse than
  stale: its core rule requires a draft protected payload to **reject**
  real-crypto claims and verified sender or audience claims, so a fixture
  built to it would reject the envelope the product actually sends. That is
  not a boundary that aged; it is one that points the wrong way.

  Each carries a status note under ADR 0128's record rule rather than being
  edited, and the status matrix uses its `superseded` category - which had
  been defined in the legend since the matrix existed and used **zero
  times** in 145 rows.

  **Named for later, deliberately not done here:** the same reading applies
  to more of the ADR 0042-0066 family. `0045` (membership credential),
  `0051` (device credential), `0053` (revocation registry), `0054` (key
  envelope rotation), `0055` (identity key) and `0056` (Home host key) all
  have real implementations in the tree today, so their placeholders
  describe a state the product left. They are superseded by ADR 0079, 0080,
  0087, 0088, 0103 and 0109 rather than by this ADR, and retiring one
  properly means reading it and stating what survives - which is the work
  done above for four of them and is not RY7's to do for six more.

## ADR 0031 threat ledger for the relay envelope

| Threat/property | Posture this ADR decides | Residual/open boundary |
|---|---|---|
| Operator reads payload | Sealed end to end as in ADR 0107; the operator holds ciphertext and four fields. | The operator sees ciphertext length. No padding or bucketing is decided here; a size-classing scheme is later work. |
| Operator learns the social graph | The envelope has no sender field, and a mailbox belongs to one relationship, so no "A sent to B" pair exists to accumulate. | An operator sees traffic per mailbox: rate, size and time of one relationship. That is not the graph, and it is not nothing. |
| Operator correlates one person's relationships | Several operators are possible by construction, which splits what any one of them holds. | **Named weakness: collection.** A Pico that empties all its mailboxes over one connection lets that operator group them as one device. It does not learn who the senders are; it learns that these N mailboxes are one person. Staggered collection and several operators mitigate and do not remove it. |
| Operator learns urgency or traffic kind | No priority and no content type exist on the envelope. | Timing and size still carry signal. An emergency message is short and immediate, and nothing here hides that. |
| Operator learns the sender's clock or intent | Expiry is a coarse bucket rather than an instant. | Arrival time at the operator is still observed directly. |
| Abuse and flooding | A flood damages one relationship, and the remedy is revoking one mailbox; a full mailbox refuses rather than evicting, so nothing queued is lost silently. | An unrevoked flooded mailbox stays unusable until the person acts. There is no automatic detection, no sender reputation and no cross-operator abuse signal. |
| Operator forges or substitutes | It cannot: payload authenticity is the ADR 0107 signature chain, which no envelope field feeds. | Drop, delay, selective forwarding and traffic analysis remain fully available to a carrier, as they were for direct Link. |
| False delivery claims | The relay can only answer "accepted", so there is no delivery claim for it to make falsely. | A sender that needs certainty must wait for a sealed peer acknowledgement, which requires the peer to be reachable at some point. |
| Relay account is not Pico identity | An operator account authorises use of that operator and appears nowhere in the envelope; a mailbox is a label the recipient issued, not a key. | The binding between a person and their operator account is outside this ADR and is exactly the record an operator can be compelled to produce. |
| Central provider dependence | The address names its operator, so no operator is structurally privileged and no inter-operator protocol is needed. | Availability of one relationship still depends on one named operator. Multi-operator per relationship is not decided here. |
| Network observer below the operator | Confidentiality on the hop is the transport's, TLS on IP transports. | Transports without such a layer - Meshtastic - are unaddressed, and ADR 0029's transport session key stays reserved for them. |

## Non-goals

- the relay server: queue storage, operator API, accounts, billing, abuse
  operations;
- federation or routing between operators, and multi-hop of any kind - ADR
  0028 already lists the routing algorithm as a non-goal;
- discovery: an address is handed over in a relationship, never looked up;
- the ceremony that issues an address to a peer (ADR 0031, ADR 0045);
- the Meshtastic adapter and the transport session key it will need;
- padding, batching, cover traffic or any claim of anonymity;
- capability negotiation and any published compatibility claim (ADR 0046
  stands).

## Consequences

Positive:

- the field that leaks the most is not protected, it is **gone**, and a
  future operator cannot ask for it back without changing a parser that
  refuses unknown keys;
- abuse control needs no new cryptography, no token minting and no sender
  reputation, because a per-relationship mailbox makes the blast radius one
  relationship;
- ADR 0031's multi-operator requirement holds by construction rather than
  by a promise nobody can check;
- ADR 0042-0066's oldest drafts finally have a decision to be measured
  against;
- the delivery-receipt question is settled by a precedent this tree already
  set rather than by taste.

Negative and residual:

- **this is not anonymity and must never be described as it.** A person
  with four peers, an operator with logs and ordinary traffic analysis is a
  solved problem for the observer. What this buys is that the operator is
  not *told*, which is worth having and is a smaller claim;
- collection correlates one person's mailboxes at one operator, and the
  mitigations are partial;
- per-relationship addressing pushes work into the credential ceremonies,
  which now have to issue and revoke an address as part of establishing and
  ending a relationship;
- a stable address is a stable label; the trade is deliberate and recorded;
- a person who uses several operators carries several accounts.

## Relationship to other ADRs

- **ADR 0028** named the relay and sketched an envelope; this decides the
  envelope and removes three of its fields.
- **ADR 0031** classified relay-visible metadata as a requirement; this
  turns the classification into a contract and keeps the ledger it asked
  for.
- **ADR 0029** reserved the transport session key; it stays reserved, for
  the transport that has no layer beneath it.
- **ADR 0107** built the direct slice and handed this role forward; its
  sealing and signing are reused unchanged, and its D5 ledger is the model
  for RY7.
- **ADR 0118 O1** decided that a component does not claim an outcome it
  cannot observe; RY5 is that decision applied to a carrier.
- **ADR 0119 Q5** decided that a ceiling refuses and never trims; RY6
  applies it to a mailbox queue.
- **ADR 0143** decided that a change happens when somebody decides it
  rather than when a timer fires; RY4 applies it to an address.
- **ADR 0016** says it in one line - "Pico may use reviewed security
  primitives. Pico must not invent them." - and ADR 0080 already spent that
  rule by rejecting a password-authenticated key exchange because libsodium
  offers none. The mailbox design is chosen partly because it needs no
  primitive at all: an address is a label, and revoking one is a delete.
- **ADR 0042-0066** are drafts of this layer; RY7 re-reads them.

## References

- ADR 0015 - full clients, light clients and relay
- ADR 0016 - cryptography boundaries and non-goals
- ADR 0028 - Pico Link transport facade and relay network
- ADR 0029 - identity, device, Home keys and end-to-end boundaries
- ADR 0031 - Pico Link identity, relay and domain threat model
- ADR 0032 - Pico Link envelope and credential schema direction
- ADR 0107 - Pico Link Direct: sealed envelopes to the own Home
- ADR 0118 - offline and model-free degradation contract
- ADR 0119 - resource exhaustion and denial-of-service posture
