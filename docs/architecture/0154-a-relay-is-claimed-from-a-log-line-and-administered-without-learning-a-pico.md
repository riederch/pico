# 0154 - A relay is claimed from a log line, and administered without learning a Pico

## Status

Accepted 2026-08-16, decided by the user: **no CLI path anywhere, every
configuration through the Pico Client.** ADR 0153 left relay account
provisioning open and named three shapes; this closes it with a fourth that
none of them was, and it is the one the tree already had.

Status note, 2026-08-17: **the relay was walked as a process, and `main.ts`
had no test until it was.**

Every other file here was exercised against a real listener on a real port,
which covers the routes and not the assembly: reading the configuration,
refusing without an operator hostname, opening three listeners, minting the
claim code at boot, printing it where an operator will find it, and shutting
down on a signal. That is the deliverable, and it was the one part nothing
ran.

The walk found no defect. Claiming works and the code is single-use; an
account credential is handed back once and the list does not carry it;
delivery is accepted with no credential at all while collection needs one;
acknowledging removes what collecting left; revocation reports
`mailboxesEnded` and `packetsDropped`, which is the observation RO5 exists for
because nothing else can see it; the unauthenticated bucket refuses the
eleventh attempt in a minute; SIGTERM shuts the process down cleanly.

Two things the attempt to falsify it taught, both worth keeping. A relay that
starts without `PICO_RELAY_OPERATOR` **does** say so - on stdout, as a
`relay_startup_failed` line, because one JSON stream is this file's design and
a failure on a second stream would be the one line missing from the record an
operator reads. And the account list cannot leak a credential even when a
route tries to: the store keys accounts by digest and never holds one, so the
guarantee is structural rather than tested.

## Context

ADR 0153 shipped a relay that runs, holds, forwards and expires packets, and
cannot accept its first registration. `PicoRelayStore.upsertAccount` was
documented as "operator business, out of band", which held while the only
caller was a test. A container has no out of band.

The obvious answer was a CLI inside the image. It was rejected as a product
path: ADR 0105 keeps a person's route to their own Pico out of a terminal, and
while a relay operator is a different role from a person with a Pico, the
person here is the same human on the same evening. A product that is a window
for one thing and a shell for the other is two products.

**The Move-In Code cannot be copied.** It is the obvious parallel and it is
the wrong one: claiming a Home ends in a mutually signed founding record -
identity keys, signatures, key pins. ADR 0149 RS2 says nothing in a relay
parses, verifies or stores an identity, a delegation, a membership or a
signature, and `check-relay-boundary.mjs` proves that absence against code
with comments stripped, so that the paragraph explaining the rule cannot
satisfy the check enforcing it. A claim ceremony would break exactly the
property that lets a stranger operate a relay.

**The Home's other code can be copied, and it is identity-free by
construction.** `pico_home/DOCS.md` describes the Foundation operator
bootstrap code as "a local administration login, not a Pico identity, not Home
membership, not a Move-In Code". It is minted per process while no operator
exists, written to the log, single-use, and replaced on restart. For a
container the log *is* the protected display channel ADR 0027 asks for: whoever
can read it can already stop the process.

## Decision

**A relay is claimed the way a Home's operator is bootstrapped, and
administered over a surface that is not the mailbox surface.**

```text
first start        relay holds no operator credential
                   -> mints a claim code, writes it to the log
Pico Client        POST /operator/claim { claimCode }
                   -> receives the operator credential, once
                   -> code spent; the log stops offering one
afterwards         create an account   (the relay generates the credential)
                   revoke an account
                   list what it holds
```

A fifth route, `describe`, was written and removed on 2026-08-17 before
anything called it. `claim` already returns the operator name and
`accounts/list` already fails when a relay is unreachable, so it answered
nothing a caller could not already learn - and a route with no consumer is a
surface somebody has to keep working forever for nobody.

Nothing above learns a Pico. Two bearer credentials and a quota, which is what
a relay was already allowed to know.

**The client reaches the relay directly.** Decided by the user against routing
administration through the person's Home: a relay operator does not
necessarily have a Home, and a transport that can only be administered when
some household's Home is running has the availability shape ADR 0153 rejected
for the relay itself. The consequence is stated rather than hidden - the
administration port has to be reachable from the operator's device, over TLS
or through a tunnel, and it is bound to loopback until somebody decides
otherwise.

## Gates

- **RO1 - The administration surface is not the mailbox surface.** Its own
  listener on its own port, loopback by default. ADR 0153 PK3 keeps the public
  port at five routes that answer an unknown route exactly as they answer a
  wrong method; an administrative route there would be a map with one very
  informative entry. Two listeners is also what makes "expose administration"
  a separate deliberate act from "expose the relay".

- **RO2 - Claiming is a log line, spent once.** The code is minted in memory
  while no operator credential exists, never written to the database, cleared
  on use, and re-minted on restart. A relay that kept its claim code in
  `/data` would hand it to whoever restores a backup.

- **RO3 - The relay issues credentials; nobody presents one.** Both the
  operator credential and every account credential are generated by the relay
  and returned exactly once. A surface that accepted a caller's chosen value
  would accept `deadbeef…`, and the credential *is* the identifier
  (ADR 0149 RS2), so a weak one is a weak account name.

- **RO4 - What is stored is a digest, not a credential.** `relay_account`
  keyed the account by the credential in plaintext, so a stolen relay database
  was the collection of every customer's key - and `acknowledge` deletes
  packets, so that collection buys silently dropping everybody's mail. Lookup
  is by digest of the presented value. The relay can still answer every
  question it could answer before, and can no longer answer "what is customer
  seven's credential".

- **RO5 - An account can be taken back, and its mailboxes end with it.**
  `upsertAccount` only ever began an account. A credential that cannot be
  revoked is one a leak makes permanent, and a client with a button to issue
  and none to withdraw is a surface that tells half the truth. Revoked is a
  state on the row rather than a deleted row, for ADR 0147 RY4's reason: the
  difference between "never existed" and "ended" is answerable only if the
  ending is kept.

  **The first version revoked the account and forgot its mailboxes**, which
  was worse than the gap it was recorded as. Those mailboxes stayed `open`, so
  the relay went on answering `accepted` to senders posting into an address
  nobody could ever collect from - the old credential is refused and no new one
  inherits a mailbox. ADR 0149 names that exact failure in its own words, about
  registration ordering: a sender writing into nothing while both sides believe
  the exchange succeeded is the thing a relay exists to prevent. It arrived
  through the mechanism meant to end a relationship.

  So revocation ends the account's open mailboxes, which makes `deliver` answer
  `mailbox_revoked` on its own - RY4's existing vocabulary, no new outcome -
  and drops their queues, for the reason `deregister` already states: those
  packets were addressed to a relationship that has ended.

  **What ended is counted and returned**, because otherwise nothing could
  observe it: the only reader of a dropped queue is the account that just
  stopped existing. The operator is told how many addresses ended and how much
  waiting mail went with them, in the client, in words.

- **RO6 - The quota bounds both axes.** Mailboxes per account was the
  operator's; packets per mailbox came from the caller's register request and
  was stored unchecked, so an account with a quota of one could ask for a
  mailbox holding a million packets. The account carries a capacity ceiling
  and registration is refused above it, by name, in ADR 0119 Q5's posture.

- **RO7 - Administration is reachable exactly as far as it was configured.**
  Bound to `127.0.0.1` unless set, refused if it collides with either other
  port, and the boot log says where it is listening. An operator who wants it
  reachable says so; nobody gets a remote administration port by installing.

- **RO8 - A lost operator credential is recoverable without a shell.**
  `/data/operator-reset`, then restart - the same file-based escape the Home
  uses, and the same honest posture: anybody with file access to the host can
  do this, because operator administration protects a network surface and not
  the host.

- **RO9 - The administration port is bounded, and the bound does not lock the
  operator out.** Two token buckets: ten requests a minute for an
  unauthenticated caller, sixty for the operator, refused with `429` and a
  `Retry-After` that is never zero.

  **It is not what protects the credentials.** The claim code is 256 bits and
  the operator credential 128; grinding them was never the threat, and a
  bucket sold as making brute force harder would be decoration over a number
  that already ends the argument. What it bounds is the work an
  unauthenticated caller can make an exposed port do.

  **The order is the design, and the obvious order is wrong.** Charging one
  bucket first and refunding it once a credential proved valid reads well and
  does the opposite of what it promises: a stranger who empties that bucket
  then refuses the operator's next request before it can prove anything -
  trading a resource bound for a denial of service against the one person who
  needs the door. So the credential is checked first, at the cost of one
  digest and one indexed query per request, and the caller is charged to their
  own budget. That cost is the floor of what an unauthenticated caller can
  force here; it is bounded by the connection ceiling and the timeouts rather
  than by the bucket. **The first version had it the wrong way round and a
  test found it**, which is the only reason it is not in the tree.

  Global rather than per-source, deliberately: a relay behind a reverse proxy
  sees one address for everybody, and the header that would say otherwise is
  one nobody signed. Counting per source would be counting one source or
  trusting a forgeable string.

## What this does not do

**It does not make the relay know its customers.** An account is still a
number with a quota. The operator knows who they issued it to; the relay does
not, and no route added here asks.

**It does not authenticate the operator as a person.** The operator credential
is a bearer token in the device's Vault. Losing the device means losing the
credential, which is why RO8 exists; stealing the device means holding it,
which is the same posture as every other credential the Vault keeps.

**It does not give the administration port a transport.** TLS is the
operator's, exactly as it is for the mailbox port, which has never had one
either. What the relay owes is that the port is closed until asked.

## Alternatives rejected

**A CLI in the image.** ADR 0153's own recommendation, overruled by the user
and correctly: two interfaces for one system is one interface too many, and
the tool would have been the only place some things could be done.

**Administration through the operator's Pico Home.** Would keep the device's
outbound path to one already-sealed channel and cost more than it buys: a
relay operator need not have a Home, and administering a transport would then
depend on a household's Supervisor being up.

**A signed operator statement, the way a domain read grant is signed.** The
strongest-looking option and it is the one RS2 forbids: verifying it would put
signature verification in the relay, and the relay's whole safety argument is
that no code path there could learn who anybody is.

**Keeping the plaintext account id and adding revocation only.** Cheaper, and
it leaves the database as a credential store. Since nothing is founded, the
migration costs nothing today and cannot be had at this price again.

## Residuals

- **The claim code is in the container log**, which is the honest channel and
  a real one: log aggregation ships it somewhere else. It is single-use and
  expires with the process, so the window is a restart wide, and the reset
  path exists for the case where it was seen by the wrong person.
- ~~**A revoked account's mailboxes stay revocable but their packets stay.**~~
  Closed on 2026-08-16, and it was a defect rather than a gap - see RO5. The
  question it was standing in for is still open in a smaller form: a relay owes
  a departing customer nothing here, and whether it should owe them a window to
  collect before the queues go is a product decision nobody has needed yet.
- ~~**The mailbox port has no request-rate bound.**~~ Closed the same day as
  ADR 0149 RS7. The shape turned out to be different rather than absent: a
  delivery carries no sender to charge, but it names a *target*, and that is
  the attribution that matters - one recipient's flood should not refuse
  everybody else's mail.
