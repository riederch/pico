# 0107 - Pico Link Direct: Sealed Envelopes to the Own Home

## Status

Status note, 2026-09-10: **der Wiederholungsschutz überlebt jetzt einen
Neustart.** Die Zeile in der Bedrohungstabelle unten sagte seit dem ersten Tag,
was fehlte - *„the seen set is in-memory; a restart inside a request's
remaining validity window can admit the same otherwise-valid request again"* -,
und ein externes Review hat am 2026-09-09 danach gefragt. Der Rest war klein
und benannt: es brauchte eine Anfrage, die mit gültigem Geräteschlüssel
signiert war, und einen Neustart innerhalb ihrer eigenen Restgültigkeit von
höchstens sechzig Sekunden. Klein ist aber nicht keiner, und ein
Fernprotokoll, dessen Wiederholungsschutz eine Prozesseigenschaft ist, hat
keinen.

Die Merkmenge ist jetzt `pico_link_direct_seen_request` (Wanderung
`0026_pico_link_direct_seen_request`), und der Eingang bekommt sie als
Pflichtargument statt als Vorgabe: wer einen Eingang verdrahtet, muss sagen,
wo das Gedächtnis liegt. Beide Grenzen bleiben, wo sie waren — jede Zeile
läuft ab und wird bei der nächsten Anfrage gelöscht, und der Deckel von 1.024
Zeilen verdrängt beim Einfügen. **Wer verdrängt wird, hat sich geändert**: bis
hierher der zuerst eingefügte Eintrag, jetzt der, der ohnehin zuerst
verfällt, bei Gleichstand weiterhin der älteste. Verdrängt wird damit immer
die kürzeste verbleibende Wiederholbarkeit, die es zu vergeben gibt.

Gegangen statt behauptet: eine Datenbank auf der Platte, ein Eingang, eine
angenommene Anfrage, ein geschlossenes und neu geöffnetes Handle als echter
Neustart, ein zweiter Eingang — dieselbe Anfrage wird abgelehnt und die
Operation läuft kein zweites Mal. Die Pflanzung, die den Prozessspeicher
zurückholt, lässt genau diesen einen Test fallen.

Status note, 2026-08-25: **ein abgelehntes Home meldet sich, ein stummes
nicht.** `link_home_did_not_answer` deckt den Fall ab, in dem die Verbindung
scheitert - `fetch` wirft, der Grund wird benannt, der Aufrufer weiß es
sofort. Für ein Home, das *annimmt und schweigt*, gibt es nichts: weder
`link-direct-client.ts` noch die Companion setzen eine Zeitgrenze, also wartet
jeder Aufrufer unbegrenzt.

Am Gerät gefunden, beim Schließen von ADR 0131 A7: ein per `SIGSTOP`
angehaltenes Home ließ die Erreichbarkeitsprüfung eines Telefons zweieinhalb
Minuten hängen und hätte es weiter getan. Erst als das Home zurückkam,
antwortete es der wartenden Anfrage mit `link_rejected:400:request_expired` -
richtig, und Minuten zu spät.

Die Folge trägt weiter als Android. ADR 0112s Alarm-Carrier meldet
`reportHomeReachable(false)` aus einem geworfenen Lesevorgang; ein stummes
Home wirft nicht, also fällt diese Meldung nie. **Ein hängender Lauf ist die
dritte Möglichkeit neben "es wartet nichts" und "niemand hat nachgesehen", und
von außen sieht sie aus wie die erste** - was ADR 0118 O4 genau zu verhindern
versucht.

Die Sonde in `tools/android-runtime-probe` setzt sich ihre Grenze deshalb
selbst (20 Sekunden, `read_timed_out`). Das ist die Stelle, an der es heute
gebraucht wurde, und nicht die, an der es hingehört: eine Grenze im
Direct-Client würde für jeden Aufrufer gelten, und wie lang sie sein soll -
eine Zahl für ein Heimnetz, eine andere über einen Relay - ist die
Entscheidung, die dieses ADR noch nicht getroffen hat.

**Entschieden und gebaut, noch am 2026-08-25.** Die Grenze sitzt im
Direct-Client, gilt damit für jeden Aufrufer, und die Voreinstellung ist keine
neue Zahl: sie *ist* `PICO_LINK_DIRECT_CLIENT_REQUEST_LIFETIME_MS`, die
Lebensdauer des Umschlags. Länger zu warten hieße, auf die Antwort zu einer
Anfrage zu warten, die dieses Home als abgelaufen zurückwiese, wenn es sie erst
jetzt in die Hand nähme - genau die Antwort, die das angehaltene Home nach zwei
Minuten gab. Eine Wahrheit, die zweimal geschrieben wird, driftet; deshalb steht
sie einmal.

Eine benannte Ausnahme, mit ihrem Grund daneben:
`home.action.approval.resolve` führt bei einer Depot-Freigabe `fetchPicoDepot`
**im Request** aus, und das ruft `git` mit 120 s Budget je Aufruf. Die Liste ist
über `PicoLinkDirectOperation` typisiert, also scheitert ein Name, der die
geschlossene Liste verlässt, an der Typprüfung, statt als Ausnahme für etwas
stehen zu bleiben, das es nicht mehr gibt. Wächst diese Liste, ist das ein
Hinweis, dass eine Operation lange Arbeit in eine Antwort legt, statt sie
anzustoßen und abfragbar zu machen.

Die Unterscheidung, die dabei entsteht, ist der Punkt: `timed_out` heißt „es hat
zu lange geschwiegen" und ist etwas anderes als eine Ablehnung und etwas anderes
als „niemand hat nachgesehen". Eine zu große Antwort heißt weiterhin
`link_response_too_large` - ein Home, das zu viel sagt, ist nicht eines, das
nichts sagt.

Über den Relay ist damit nichts anderes entschieden: der Umschlag hat dieselbe
Lebensdauer, gleich welchen Weg er nimmt, und ein Weg, der länger braucht als
der Umschlag gilt, liefert eine Anfrage aus, die das Home ohnehin zurückweist.


Status note, 2026-08-17: **"remote capability is opt-in per operation" now
has something enforcing it.**

That sentence is this ADR's argument for a closed operation set instead of a
proxied Foundation API - adding one is a decision, not a consequence of adding
a route. Nothing checked it. `check-surface-classes.mjs` read the Foundation's
HTTP routes against `public-surfaces.md` in both directions and left the
operation set alone, which is the wrong way round: those routes are the local
diagnostic surface ADR 0030 keeps local, and the operation set is the one that
travels - through this ADR's D4 intake and, since ADR 0149, over somebody
else's relay.

On the day the check was extended the set held thirty operations and the
document named seven. Twenty-three had been opted into remote capability with
nothing recording the decision, and four of those were added the same week by
an author who had read this sentence and still did not write them down. That
is the argument for a check rather than a habit.

The twenty-three are now recorded, grouped by family, each with the reason it
is remote-capable at all - which for several of them is the whole point: a
device asking to be recovered is a person whose other device is gone, and a
presence that had to be on the Home's network to announce would be a presence
that could not be elsewhere.

Accepted; implemented for the bounded direct slice (D1-D5 done). This is the
first runtime slice of Pico Link (ADR 0028) and the direct answer to ADR 0105
B5: an authenticated channel between a person's device and their own Pico Home
that is not the deliberately local Foundation listener. Relay-backed product
reachability remains outside this ADR.

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

**The list is closed at both ends since 2026-08-14.** The intake refuses an
operation that is not on it, which is what keeps the set closed against a
caller; the dispatcher's fall-through is now typed `never`, which keeps it
closed against us. An operation added to the list with no case written for it
used to compile, and a device would have been told `unknown_operation` for
something the protocol advertises - a hole that reads as a client bug and is
ours. It is a build failure now, at the line that names the operation.

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

  `home.setup.read` reads through the same helper the local route uses.
  D3 subsequently split the claim, membership, freshness, reader-custody
  domain, reader-grant and KEK-rotation handlers so their local routes and
  Link operations call one implementation rather than growing parallel write
  paths.
- **D3 - Client side: Done.** `pico-vault ceremony` has an explicit
  `--transport link` mode for the claim and Home-authority ceremonies. The
  local session path stays the default for local diagnostics, while Link mode
  rejects a supplied Foundation session rather than silently carrying or
  ignoring it.

  `apps/vault-daemon/src/link-direct-client.ts` validates the host signing and
  key-agreement public keys against the out-of-band fingerprints before IPC or
  network access. The setup log now carries the public bundle beside those
  fingerprints because a sealed request needs the agreement public key; the
  fingerprints remain the identity pins, and the URL remains reachability
  only. Each request gets a fresh X25519 reply key, a 30-second lifetime and a
  random request id. Its arguments digest and canonical request fields are
  rebuilt by the Vault daemon and signed by the unlocked delegated
  `device_signing` key. ADR 0109 permits the already verified public identity
  key to be supplied separately, so a later-device Vault needs no unlocked
  identity-root session merely to form its public Link envelope. The response
  is size-bounded while streaming, opened
  only with that ephemeral private key, and accepted only after request,
  operation, host, result-digest and host-signature binding all hold.

  The outer `pico.link.direct.request.v1` signature is the fifth closed ADR
  0099 exemption: it authenticates one short-lived operation and creates no
  authority that outlives the call. The semantic record inside an authority
  submission remains approval-gated exactly as before. The Vault therefore
  permits this label only for `device_signing`; an identity root cannot sign
  it.

  `home.claim.submit` now runs the same two-stage claim implementation as the
  local route. `home.authority.submit` exposes a closed resource set for the
  ADR 0103 ceremonies (membership, reader-key freshness, reader-custody
  domain, reader grant and KEK rotation), and `home.authority.list` exposes
  only the narrow Home claim state and reader-custody domain view. It does not
  tunnel `/api/system/status` or any other diagnostic response. Both authority
  operations require the verified Link principal to be the current Home Host
  Pico on top of the intake's membership and delegation check.

  This slice originally preserved one bootstrap dependency honestly:
  `open-identity-session` was the only path that recorded the delegation and
  agreement-key evidence against which an authority Link principal is
  verified. ADR 0108 has now discharged that dependency for new Homes without
  adding an authorization bypass or a third pre-authority operation: v2 claim
  and founding carry the root-signed delegation, exact device key records and
  device possession proof, and founding acceptance projects them atomically.
  Existing v1-founded Homes continue to use the local session path.

  Real-process tests now found a Home through three Link requests without a
  bearer session and immediately create a reader-custody domain through the
  authenticated list and submit operations. The path never calls
  `open-identity-session`.
  Unit coverage pins host-key mismatch, per-request reply keys, response
  binding, carrier refusal and response-size limits. Those D3 assertions alone
  did not establish listener isolation; D4 below adds that deployment proof.
- **D4 - End-to-end test: Done.** Core can optionally bind a second listener
  through the paired deployment parameters `PICO_LINK_INTAKE_HOST` and
  `PICO_LINK_INTAKE_PORT`. The Foundation listener stays in `loopback-dev` or
  its HA-internal packaging boundary; configuration rejects combining the
  restricted listener with `direct-token`, and the two listeners cannot share
  a port.

  The second listener owns no authority and no parallel handler. It forwards
  only explicitly named exact request targets into the same Fastify
  instance - originally only `POST /api/home/link`; ADR 0115 U4 later added
  `GET /api/home/link/continuity`, the unsealed continuity read that serves
  self-authenticating public-key material to clients a host-key rotation
  stranded. Every other path, query variant and method is refused before
  Fastify routing. Consequently a future Foundation route cannot become
  remotely reachable by accident: publishing a target here stays an explicit
  decision. Header-count, header-time, request-time,
  keep-alive, requests-per-socket and Link-specific body limits bound the
  carrier edge before the intake's shape check and first seal-open.

  `link-intake-listener.test.ts` probes the real listener against dashboard,
  health, setup, status, events, query/trailing-slash variants, wrong methods
  and an oversized body. The spawned `claim-ceremony.test.ts` path then starts
  a real Core with separate Foundation and Link ports, a real Vault daemon and
  the ceremony CLI. The CLI receives only the Link URL, the test first proves
  that Foundation routes are absent on it, then founds the Home and completes
  an authenticated domain ceremony without a Foundation bearer session.
- **D5 - Honest threat ledger: Done.** The table below records the bounded
  direct slice against ADR 0031. It is intentionally a list of both achieved
  and missing properties; completing this gate does not complete the relay,
  metadata privacy, abuse handling or public compatibility work.

## ADR 0031 threat ledger for the direct slice

| Threat/property | Implemented direct posture | Residual/open boundary |
|---|---|---|
| Carrier reads payload | Requests are sealed to the Home agreement key; responses are sealed to the request's one-use reply key. The dedicated listener sees envelope JSON and ciphertext only. | A compromised Home agreement key reveals recorded requests; requests have no forward secrecy. The Home endpoint necessarily sees the operation after opening it. |
| Carrier forges a Pico or Home result | The delegated device key signs request, audience and arguments; the pinned Home signing key signs response, request id, operation, outcome and result digest. URL, source address and HTTP identity grant no authority. | A carrier can still drop traffic or forge a bare pre-authentication HTTP refusal. It cannot forge a client-accepted success or authenticated refusal. |
| Replay, duplication and reordering | Requests expire after 30 seconds client-side with a 60-second server ceiling. A bounded 1,024-row table rejects an authenticated request id already seen, and it is this Home's database rather than the process, so a restart changes nothing (2026-09-10). Response binding prevents moving a response to another request. | Losing the database loses the memory with it, which is the same event as losing the Home. There is no ordering or exactly-once availability guarantee. |
| Foundation surface exposure | The optional listener admits exactly `POST /api/home/link`; diagnostics, dashboard, health, WebSocket and all other Foundation routes are absent. `direct-token` cannot be enabled beside it. | HA/container packaging must still publish only the intended listener. Port forwarding or a public reverse proxy remains outside the product model. |
| Parsing and resource exhaustion | Exact target/method gate, 32-header cap, five-second header/keep-alive bounds, ten-second request timeout, 100 requests per socket, route body limit, sealed-field limit, cheap shape checks and closed operations precede private-key verification. | One seal-open is unavoidable before sender authentication. There is no IP/account rate limit, adaptive abuse control or distributed DoS protection; public exposure is not supported. |
| Metadata privacy | Payload fields are hidden from the carrier and only one HTTP target exists, so the target itself reveals no operation name. | Direct transport still reveals source/destination addresses, TCP/HTTP timing, direction, ciphertext size, retries and availability. Core request logs include source address/port, and log retention is deployment-controlled. No padding, batching, routing-identity indirection or retention protocol exists. |
| Malicious carrier delivery | Authenticated results and post-auth refusals are signed and sealed; duplicate delivery is bounded as above. | Delay, drop, selective forwarding and traffic analysis remain fully possible. Direct Link has no receipts, queue, alternate relay or liveness claim. |
| Host/member/domain authority separation | Link authentication reuses exact delegation and active membership evidence; authority operations additionally require the current Home Host Pico. For v2 founding, the exact first-device delegation and reader key are projected only after the root/device/host bindings verify, and a Link-carried claim must have the same outer sender. ADR 0109 adds same-identity later-device enrollment, replacement renewal and revocation through two normally authorized operations. ADR 0110 adds one root-authenticated, target-bound standing recovery operation and an authenticated living-device veto; root authority, target possession, sponsor delivery and host receipt remain separate signatures. Shared handlers retain record signature, reader-key and domain-custody checks. | Home hosting still exposes host operational metadata. Link does not make Home administration into domain readership. A last-device self-revocation closes normal Link authority; the implemented Recovery-Card path can restore exactly one device only after its fixed delay. R6 still blocks restore-proof one-use claims across matching pre-consumption database rollback. |
| Audit | Accepted inner operations use the same durable state changes and audit paths as local delivery; no carrier can substitute a different operation. | Pre-authentication failures are operational request logs, not signed audit records. No privacy-bounded abuse ledger exists. |
| Compatibility and relay identity | The direct wire is local and unpublished; no HTTP identity, account or address becomes Pico identity. | There is no public conformance claim, relay routing identity, packet queue, metadata-retention policy or transport-session-key protocol. Those remain relay work under ADR 0028/0029. |

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
  diagnostic surface when the dedicated listener is the only published
  binding; D4 proves that boundary in the real process path and retires the
  non-product shared-port validation path;
- a v2-founded Home can authorize that first device immediately from its
  atomic founding evidence; no local Foundation session is needed to turn
  founding into usable Link authority;
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
- ADR `0108` discharges the D3 bootstrap dependency for newly founded Homes
  by carrying the first delegated device's evidence in claim/founding.
- ADR `0109` implements authenticated later-device lifecycle through two
  closed operations without widening the two-operation pre-authority set.
  ADR `0110` decides zero-device recovery: one standing closed operation
  keyed solely by the identity root over durable one-use pending state,
  plus an authenticated veto operation, with the pinned verification order
  unchanged. ADR 0110 R1-R4 implement that narrow surface; product UX and
  restore-proof consumption across matching backup rollback remain open.

## References

- [ADR 0016](0016-cryptography-boundaries-and-non-goals.md)
- [ADR 0028](0028-pico-link-transport-facade-and-relay-network.md)
- [ADR 0029](0029-identity-device-home-keys-and-e2e-boundaries.md)
- [ADR 0030](0030-foundation-api-exposure-and-local-trust-boundary.md)
- [ADR 0031](0031-pico-link-identity-relay-and-domain-threat-model.md)
- [ADR 0032](0032-pico-link-envelope-and-credential-schema-direction.md)
- [ADR 0080](0080-pico-home-host-key-and-move-in-claim-threat-model-and-ceremony-direction.md)
- [ADR 0105](0105-pico-runs-as-a-background-companion-not-a-cli.md)
- [ADR 0110](0110-recovery-card-and-time-locked-zero-device-recovery.md)
