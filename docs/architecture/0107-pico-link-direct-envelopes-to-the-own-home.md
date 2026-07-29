# 0107 - Pico Link Direct: Sealed Envelopes to the Own Home

## Status

Accepted; partially implemented (D1 and D2 done). This is the first runtime slice
of Pico Link (ADR 0028) and the answer to ADR 0105 B5: an authenticated
channel between a person's device and their own Pico Home that is not the
deliberately closed direct port.

## Context

Every ceremony built under ADR 0103 talks to the Foundation over plain
HTTP with a bearer session, which works in exactly one deployment: the
direct host port open and the caller on the same network. That combination
is a non-product path twice over - ADR 0030 keeps the Foundation HTTP
surface local diagnostics, and ADR 0041's own rule forbids tokenless
ingress mode with the port mapped. The validation run had to use it anyway,
because nothing else existed. ADR 0105 then made the gap structural: a
background app on the person's device has no legitimate way to reach the
Home at all.

Meanwhile the work since ADR 0080 has quietly built everything such a
channel needs except the channel. The claim ceremony already seals a signed
payload to the Home's key-agreement key and pins the Home's fingerprints
read from the add-on log - a complete, working envelope exchange in one
direction. Authority already lives in signed records and never in the
carrier; the `home-authority-relay` access class says so in its name. And
since ADR 0103, a person can hold a membership, a delegation and registered
device keys - everything needed to authenticate a request without a session.

What is missing is narrow: a way to carry that pattern both directions,
over a surface that exposes nothing else.

## Scope

Covers: the envelope pair, its canonical bytes, who seals and who signs,
replay bounds, the single Foundation intake, how an inner operation is
authorized, and the client side of the ADR 0103 ceremonies.

Does not cover: the relay (packet layer, queueing, transport session keys -
ADR 0029's reserved role stays reserved), discovery, streaming or sync
retrieval, channel-level TLS, inter-Home communication, capability
negotiation, and any compatibility claim (ADR 0046 stands). The draft
`pico.link.*` fixtures from ADR 0042-0066 describe the relay packet layer
and remain untouched drafts; this ADR deliberately does not redeem them.

## Decision

### One envelope pair, generalizing the claim pattern

`pico.link.direct.request.v1` and `pico.link.direct.response.v1`.

A request is a signed inner payload sealed to the Home's key-agreement key
(`crypto_box_seal`), exactly as the claim envelope already works. The
signed payload names: the operation, its arguments, a fresh `requestId`,
`createdAt` and a short `expiresAt`, the Home's host signing fingerprint as
the audience pin, the sender's identity and device key records, and an
ephemeral X25519 public key for the reply. The sender's device signing key
signs the canonical bytes; the identity's delegation authorizes that device
key, verified with the machinery `identity-session` already uses.

The response is sealed to the request's ephemeral key and signed by the
Home's host signing key over canonical bytes that include the `requestId`.
The client verifies that signature against the same pinned fingerprints the
claim ceremony reads from the add-on log - without the pin, whatever
answers on a URL could impersonate the Home; with it, a URL is reachability
and nothing more (ADR 0031: transport identifiers are not identities).

### No handshake, no sessions, no new cryptography

The rejected alternative was a channel: a key-exchange handshake producing
transport session keys, Noise-style. It is rejected for this slice on three
grounds. It would compose a new cryptographic protocol, which ADR 0016
forbids in spirit even when every primitive is libsodium's; it would add
connection state to both ends where request/response needs none; and it
would spend ADR 0029's transport-session-key role on a direct path that
does not need it - that role belongs to the relay ADR, where a carrier that
must not read payloads actually exists.

Sealed box plus detached signature are the two primitives this repository
uses everywhere, with verifiers and test-vector discipline already in
place. Forward secrecy for responses comes from the ephemeral reply key;
requests accept the same exposure the claim envelope accepts today - a
compromised host agreement key reveals request contents, and rotating host
keys is already named continuity work (ADR 0087).

Replay is bounded, not impossible (ADR 0031 asks for exactly that): the
expiry window is short, and the Foundation keeps a bounded idempotency set
of seen `requestId`s inside it, the same pattern the share-envelope pending
store uses.

### Named operations, not a tunnel

The envelope carries one of a closed set of named operations, mirroring the
ADR 0097 wire discipline: `home.setup.read`, `home.claim.submit`, and the
record delivery and listing operations of the existing Home authority
surfaces. Each maps onto the same authorization the local route enforces
today, with the verified link principal - identity, device key, delegation,
membership - standing where the session principal stands.

The rejected alternative was proxying the Foundation HTTP API through the
envelope. That would make the link surface exactly as wide as the diagnostic
surface ADR 0030 keeps local, would inherit every future route by default,
and would turn "what can be done remotely" into an accident of routing
instead of a decision. A closed operation set keeps remote capability
opt-in per operation - the lesson ADR 0097 already paid for.

The two setup operations are pre-authority by nature: a claim cannot carry
a membership because no Home exists yet. They are bounded the way the open
setup route is bounded today - and unlike today, they sit behind an intake
that exposes nothing else.

### One intake on the Foundation, exposing only envelopes

A single route accepts direct envelopes. Everything before a successful
seal-open and signature verification is parsing against size limits;
everything after is the inner operation's own authorization. The diagnostic
HTTP surface, the dashboard and the WebSocket stay local exactly as ADR
0030 demands - mapping the host port for the link intake no longer means
exposing them, which is the difference between this and the deployment the
validation run had to use.

This does not soften the ADR 0041 posture: port mapping remains an interim
deployment, not the product path. The product path for remote reach is the
relay (ADR 0028), which will carry these same envelopes unchanged - that is
what "the carrier has no authority" buys. What this slice removes is the
reason the *diagnostic* surface was ever exposed.

### Local, unpublished, no compatibility claim

The envelope families ship with canonical bytes and authoritative vectors
from day one, like every other implemented surface - but the contract is
local and unpublished in the ADR 0097 sense, and no Pico Link compatibility
claim is made or implied (ADR 0046). Promotion to a published protocol
surface, with a conformance runner and a `picoProtocolVersion` change, is a
separate later decision. The ADR 0042-0066 drafts stay drafts.

## Gates

- **D1 - Canonical bytes and vectors: Done.** Both families are in
  `@pico/protocol` with the full byte form pinned, so a layout change is
  visible as the wire change it is. Negative vectors cover an operation
  outside the closed set, an expiry not following its creation, malformed
  fingerprints, reply keys and digests, smuggled and missing fields,
  non-canonical instants (including a date that rolls forward), and
  outcomes that are not snake_case reasons. Every field is shown to be
  bound, and the two families are shown to be separable by label alone.
  The vectors live in the package rather than under
  `docs/protocol/fixtures`: that directory is the conformance surface, and
  this contract is deliberately unpublished until a separate decision.
- **D2 - Foundation intake: Done.** One route, `POST /api/home/link`, in its
  own `link-intake` access class: no session, no token, authentication one
  layer in. The class is neither `public` (it is not open) nor session-bound,
  so the pre-authority hook branches before the session checks rather than
  falling through them.

  The verification order is the security content, and it is pinned test by
  test in `apps/core/src/link-direct.test.ts`: shape and size before any
  cryptography, then one seal-open, then the closed operation set, then the
  canonical builder as field validator, then the audience pin *before*
  authentication, then freshness on the Home's clock with a lifetime ceiling,
  then replay - checked before the signature so a replay costs no
  verification, recorded only after it so an unauthenticated caller cannot
  burn a request id the real sender still needs - then key records bound to
  the signed fingerprints before the signature is verified with the key that
  binding produced, then the arguments digest, then delegation and
  membership, then the operation. Everything past authentication answers with
  a signed, sealed response, refusals included.

  Two defects surfaced while writing those tests and were fixed at the cause
  rather than papered over in the assertions:

  - the request now signs `senderDeviceKeyAgreementKeyFingerprintHex`. The
    delegation that authorizes a sender names all three keys together and the
    store's lookup matches on it exactly, so taking it from beside the
    signature made authority rest on bytes nobody signed - and, because the
    field was in practice absent, refused every authorized sender. Adding it
    changed the D1 byte form; the vector moved with it, which is what a
    pinned wire contract is for.
  - the closed operation set is now checked before the canonical builder.
    Behind it the builder's own rejection reached the caller as
    `malformed_request`, which made `unknown_operation` unreachable and told
    a client the wrong thing: "this Home does not offer that remotely" and
    "these bytes do not parse" are different answers to whoever holds the
    reply key.

  Deliberately not served yet: `home.claim.submit` and `home.authority.submit`
  are declared and refused with `operation_not_available_over_link`. Serving
  them needs the existing local route handlers split so link and route share
  one implementation; growing a second write path would be the faster way and
  the wrong one. A signed refusal is honest, a duplicate write path would not
  be. `home.setup.read` reads through the same helper the local route uses,
  so the two cannot drift.
- **D3 - Client side: Open.** The ADR 0103 ceremonies gain a link mode:
  host-fingerprint pinning replaces trust in the URL, the signed request
  replaces the bearer session. The local session path stays for local
  diagnostics.
- **D4 - End-to-end test: Open.** Two real processes, the
  `claim-ceremony.test.ts` pattern: found a Home and run a ceremony through
  the link intake with the direct port closed to everything else.
- **D5 - Honest threat ledger: Open.** The implementation records which ADR
  0031 properties this slice satisfies and which remain open - carrier
  metadata (size, timing, source address) above all, until the relay ADR.

## Non-goals

- the relay: packet layer, queueing, delivery receipts, transport session
  keys, relay routing identities;
- discovery of any kind - the client is given a URL and trusts only the pin;
- streaming, subscriptions, or reader-sync retrieval over the link;
- channel encryption beneath the envelopes;
- publishing the wire contract or claiming compatibility;
- changing the ADR 0041 access modes or the closed-port default.

## Consequences

Positive:

- a person's device can reach their own Home without exposing the
  diagnostic surface, which closes the gap ADR 0105 B5 named and retires
  the non-product deployment the validation run used;
- the carrier-without-authority rule is now load-bearing runtime, not
  concept: the relay, when it comes, transports these envelopes unchanged;
- authorization becomes per-request and stateless on the wire, which is
  the shape a background app needs and sessions never were.

Negative and residual:

- the intake is a real attack surface wherever the port is mapped: parsing
  and one seal-open happen before any authentication can fail, so limits
  and cheap rejection are load-bearing, and public exposure remains a
  non-product deployment;
- the carrier sees size, timing and source address - ADR 0031's metadata
  requirements are not satisfied by this slice and wait for the relay;
- request confidentiality rests on the host agreement key alone, without
  forward secrecy, until host-key rotation exists (ADR 0087 continuity);
- a second wire contract now exists beside the daemon's, both local and
  unpublished, and keeping them unpublished until conformance exists is a
  discipline the project has to hold.

## Relationship to other ADRs

- First runtime slice of ADR `0028`; the relay and its network stay there.
- Discharges ADR `0105` B5 for the direct case.
- Applies ADR `0029` by *not* spending the transport-session-key role here.
- Bounded-replay and pinning requirements trace to ADR `0031`; its metadata
  requirements are explicitly not met by this slice.
- Follows ADR `0032`'s schema rules; leaves the ADR `0042`-`0066` drafts
  untouched.
- Generalizes the ADR `0080` claim envelope; reuses the ADR `0082`/`0083`
  identity-session verification for the link principal.
- Keeps ADR `0030` and `0041` intact: the diagnostic surface stays local,
  the port default stays closed.

## References

- [ADR 0016](0016-cryptography-boundaries-and-non-goals.md)
- [ADR 0028](0028-pico-link-transport-facade-and-relay-network.md)
- [ADR 0029](0029-identity-device-home-keys-and-e2e-boundaries.md)
- [ADR 0030](0030-foundation-api-exposure-and-local-trust-boundary.md)
- [ADR 0031](0031-pico-link-identity-relay-and-domain-threat-model.md)
- [ADR 0032](0032-pico-link-envelope-and-credential-schema-direction.md)
- [ADR 0080](0080-pico-home-host-key-and-move-in-claim-threat-model-and-ceremony-direction.md)
- [ADR 0105](0105-pico-runs-as-a-background-companion-not-a-cli.md)
