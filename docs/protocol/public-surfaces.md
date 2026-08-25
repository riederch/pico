# Pico Public Protocol Surfaces

This document defines which Pico interfaces are intended to become public compatibility surfaces and which interfaces are still internal foundation APIs.

Pico is currently in the foundation phase. Nothing in this document makes the current implementation production-ready.

## License boundary

Pico is source-available for private and non-commercial use, and for business use on a self-operated Pico Home.

Commercial Pico hosting, including paid hosting, managed Pico Home services, Pico Home rental, multi-tenant hosting, SaaS operation, operating a Pico Home on behalf of another party and commercial product integration, requires prior written permission. `LICENSE` and `COMMERCIAL.md` are authoritative.

Protocol compatibility does not grant commercial permission.

Commercial permission does not automatically grant compatibility status.

## Compatibility terms

| Term | Meaning |
|---|---|
| Pico Link | Communication between Pico identities, clients, peers and relayed peers. |
| Pico Home Link | Communication between a Pico and a Pico Home host. |
| Pico-compatible | Preserves the advertised Pico Link semantics for the claimed protocol version. |
| Pico Home-compatible | Preserves the advertised Pico Home Link semantics for the claimed protocol version. |
| Experimental | May change without compatibility guarantees before `1.0.0`. |
| Reserved | Name exists as design direction but is not writable or fully implemented yet. |
| Internal | Implementation detail that must not be relied upon as a stable public surface. |

### The class is the first word, and it is what decides a change

A route's status **begins with one of those terms**. That first word is its
class; everything after it describes what the surface is for.
`experimental setup surface` and `experimental foundation API` are both class
`Experimental` and differ only in description. The canonical forms table names
its class in a column of its own, because a byte form has no equivalent
descriptive status to lead with.

This matters because ADR 0134 asks this document to decide something: whether a
format may be revised in place before the first kept identity is founded.
`Experimental`, `Reserved` and `Internal` say yes - none of them promises
anything to a holder. `Pico-compatible` and `Pico Home-compatible` say no.
Nothing else may be read into a status, and a surface whose class cannot be
read from its first word is a defect in this document rather than a judgement
call at the call site.

**Published fixtures are evidence, not a promise.** A vector suite under
`docs/protocol/fixtures/` pins what a form is today so a change is visible and
a conformance runner has something to run. It becomes a promise when someone
claims compatibility against it (L4 in `compatibility-levels.md`), and nobody
has. So a fixture-backed experimental form may still be revised in place - the
vectors are regenerated with it, which ADR 0134's first obligation already
requires.

## Canonical forms and their class

The tables of routes below do not cover the byte forms, which is what ADR 0134
actually judges. They are listed here for the same reason: so the class is read
rather than inferred.

| Form | Class | Notes |
|---|---|---|
| `pico.recovery.card.v1` and its scan transport | Internal | Stated below already: the card forms and the PDF generator are local implementation surfaces, not Pico Link compatibility. Vectors live under `fixtures/home-device-recovery/`. |
| `pico.home.founding-record.v1` | Experimental | The durable form of the experimental `POST /api/home/claim` setup route, with vectors under `fixtures/home-first-device-founding/` and `fixtures/home-signature-input/`. Classified here on 2026-08-09; the route's class was documented, the record's was not, and ADR 0134 F3 needed it. The `.v2` name existed until 2026-08-10, when ADR 0134 F2 collapsed the pair into this one and made the three first-device fields required. |
| `pico.action.request.v1` | Internal | The ADR 0139 AC1-AC3 action request: a manifest-declared effect name plus arguments that each carry a controller-computed `PicoEventOriginClass`. No fixtures, no runtime writer and no compatibility claim - nothing accepts it yet. Listed so its class is readable when the first consumer arrives, rather than argued then. |
| `pico.suite.supplier-credential.v1` | Internal | The ADR 0138 CO1 credential seal: XChaCha20-Poly1305 over a per-credential DEK wrapped by the ADR 0072 per-domain KEK, with associated data binding suite, supplier identifier, privacy domain and **scope**. Its own suite rather than the memory one, because that AD binds a `memoryItemId` a credential does not have. No fixtures and no compatibility claim; nothing outside this tree reads it. |
| `pico.model.provider.entry.v1` | Internal | The ADR 0142/ADR 0151 provider entry: one measured deployment, its pinned model digest, and what it may carry. Capacity sits inside a measurement that carries its own date, so a figure with no observation behind it has nowhere to be written; the wider allowance does not parse without a credential reference. No fixtures, no registry and no runtime reader - listed so its class is readable when the first consumer arrives rather than argued then, the same reason `pico.action.request.v1` is here. |
| `pico.model.job.v1` | Internal | The ADR 0117 X4 quarantined-read job: origin-labelled units, a declared answer shape, and the allowance computed from what it carries. It has no field for tool access - not `false`, none - because a field that is always false is a promise stored where an edit can find it. No fixtures and no runtime reader; listed so its class is readable when the first consumer arrives. |
| `pico.model.context.ref.v1` | Internal | The ADR 0060 context reference: a bounded, dated, origin-labelled excerpt prepared for **one named job**. It carries the bytes and no address, so a provider reading through to the source is unsayable rather than refused, and it names its job, so reuse across jobs is unsayable rather than forbidden. Seven draft fields that could hold only one value are gone. No fixtures and no runtime reader. |
| `pico.model.result.v1` | Internal | The ADR 0059 result envelope: which job, which entry, which model digest, and an ADR 0117 X2 reader output. It cannot claim execution, tool use, quality, an audit reference or a retention posture - six draft fields whose documentation was a list of what they did not mean. Provenance is compared against what the caller dispatched rather than against a second copy in the same envelope. No fixtures and no runtime reader. |
| ADR 0034 signature-input families | Experimental | Fixture-backed canonical bytes for identity, Home, Vault, Link, recovery and rotation families. Their protocol version is the axis that moves when they change. |
| Draft `pico.link.*` packet, credential and envelope shapes | Reserved | ADR 0042-0066 draft-only fixtures. Not writable, no runtime, and explicitly no compatibility claim (ADR 0046). |

## Current public surfaces

The following surfaces are visible today but should be treated as foundation-stage and experimental:

| Surface | Current status | Notes |
|---|---|---|
| `GET /` | experimental diagnostic surface | Serves the current foundation dashboard. Not a companion UI, policy console or remote-access UI. |
| `GET /health` | experimental diagnostic surface | Health check for the current Pico Home Core process. |
| `GET /api/system/version` | experimental diagnostic surface | Reports service and protocol version information. |
| `GET /api/system/status` | experimental diagnostic surface | Reports diagnostic service, capability, Pico Home claim-state and database migration state. |
| `GET /api/home/setup` | experimental setup surface | Returns the current setup bundle with host public keys, fingerprints and setup nonce while the Home is unclaimed. Does not return the Move-In Code. |
| `POST /api/home/claim` | experimental setup surface | Claims an Empty Pico Home through the two-step sealed claim/founding acceptance flow. This is a partial M2 setup slice with durable founding evidence and membership projection, not full member onboarding. |
| `GET /api/events` | experimental foundation API | Lists stored foundation events with additive cursor metadata. |
| `GET /api/events/tail` | experimental diagnostic surface | Returns the latest foundation events for diagnostics dashboard use. Not a replica sync protocol and no durable sync cursors. |
| `POST /api/realtime/tickets` | experimental foundation realtime guardrail | Mints short-lived single-use tickets for direct `WS /ws` browser upgrades, under the static token or an operator session. |
| `POST /api/events` | experimental foundation API | Accepts only currently writable foundation events. Not a full sync API. |
| `POST /api/auth/bootstrap` | experimental foundation operator bootstrap | Establishes the first operator from the per-process bootstrap code printed on the host log. Available only while no operator exists. Not a Move-In Code or claim API. |
| `POST /api/auth/session` | experimental foundation operator login | Exchanges the operator passphrase for an opaque session. Not a product login or Pico identity. |
| `POST /api/auth/identity-challenges` | experimental Pico identity session challenge | On a claimed Home, issues a short-lived, bounded, one-use possession challenge bound to the current host signing key. It grants no authority by itself. |
| `POST /api/auth/identity-session` | experimental Pico identity session proof | Consumes one challenge and issues an opaque identity-bound session only after device signing-key possession, exact delegated `device_key_agreement` record binding, an active identity-signed `surface_session` delegation and Home membership verify (ADRs 0082/0083). |
| `GET /api/auth/session` | experimental authenticated session surface | Reports whether the calling operator or Pico identity session is still live, its typed principal and expiry. |
| `DELETE /api/auth/session` | experimental authenticated session surface | Logs the calling operator or Pico identity session out. |
| `DELETE /api/auth/sessions` | experimental foundation administration surface | Revokes every session. Requires an operator session. |
| `PUT /api/auth/credential` | experimental foundation administration surface | Replaces the operator passphrase; requires the current one and ends every session. |
| `GET /api/home/memberships` | experimental Home membership administration surface | Lists verified projected membership metadata. Requires an operator session; returns no private keys or content. |
| `POST /api/home/memberships` | experimental Home membership relay surface | Relays a Home-Host-Pico-signed membership credential for verification and host activation. The operator cannot mint membership authority. |
| `POST /api/home/membership-lifecycle` | experimental Home membership relay surface | Relays a signed membership lifecycle statement; freshest verified order determines projected status. |
| `GET /api/home/domain-read-grants` | experimental domain-read administration surface | Lists signed grant metadata and current local state. Requires an operator session because reader graphs are sensitive metadata. |
| `POST /api/home/domain-read-grants` | experimental domain-read relay surface | Relays a Home-Host-Pico-signed grant for an active member and existing `host_custody` domain. Operator authority cannot mint the grant. |
| `POST /api/home/domain-read-grant-lifecycle` | experimental domain-read relay surface | Relays a signed grant revocation; freshest verified lifecycle order determines current state. |
| `POST /api/home/share-envelope-issuance` | experimental host-custody envelope preparation surface | Requires an operator session. Selects one externally fresh registered reader key, seals an existing host-custody KEK version to it and returns the exact canonical envelope bytes for external Pico Identity Vault signing. No raw KEK or unsigned envelope is persisted. |
| `POST /api/home/share-envelopes` | experimental controller-signature relay surface | Requires an operator session. Finalizes a pending issuance only after rechecking grant, membership, reader-key freshness, KEK availability, wrap digest and the Home Host Pico controller signature. |
| `GET /api/home/share-envelopes` | experimental envelope inventory surface | Requires an operator session because the ciphertext inventory exposes reader-graph metadata. Returns only controller-signed, currently locally authorized envelope records; no raw KEK or plaintext content. |
| `POST /api/memory/domains/:privacyDomain/shred` | experimental irreversible administration surface | Destroys a privacy domain's key versions so its content becomes unreadable (ADR 0071). Requires an operator session **and** a `confirm` field repeating the exact domain name; refuses with `409` when memory encryption is off, because there would be no keys to destroy. Appends a `memory.domain_shredded` audit event. |
| `GET /api/model/providers` | experimental foundation administration surface | Lists measured model provider entries with what each one sees, the measurement behind it and any narrowing. Requires an operator session. |
| `POST /api/model/providers/:entryId/narrowing` | experimental foundation administration surface | Narrows a measured capacity. Widening is refused with the measurement it was measured against (ADR 0152 SE4). Requires an operator session. |
| `POST /api/model/jobs/:jobId/keep` | experimental foundation administration surface | Writes what one answered read produced as a memory item, with its ADR 0136 BR6 derivation. Requires an identity session and refuses another person's job as not found. ADR 0116 W5: nothing persists without this call. |
| `POST /api/depot/attachments` | experimental foundation administration surface | Attaches a depot at a pinned commit and records who accepted it. Requires an identity session; an operator session is refused, because whose corpus this is is not administration's to say. Creates no reach: ADR 0138 CO3/CO4 stay off. |
| `pico.link.direct` `home.setup.read` / `home.claim.submit` | Internal | ADR 0107. The two pre-authority operations: a claim cannot carry a membership because no Home exists yet. They are remote-capable so a person can found their Home from the device they are holding, and they are bounded the way the open setup route is - behind an intake that exposes nothing else. |
| `pico.link.direct` `home.authority.submit` / `home.authority.list` | Internal | ADR 0080 with ADR 0087. Signed authority statements about a Home and a read of what it holds. Remote-capable because authority is issued by the device that holds the key, which is not necessarily on the same network as the Home. The Home verifies before recording, so these carry authority and cannot create it. |
| `pico.link.direct` `home.device.lifecycle.read` / `home.device.lifecycle.submit` | Internal | ADR 0115. What this Home believes about its devices, and a signed change to it. The read is the one a device performs to learn its Home's identifier without a second copy in its profile. |
| `pico.link.direct` `home.device.recovery.submit` / `home.device.recovery.veto` | Internal | ADR 0110. A device asks to be recovered, and another device of the same person objects. Remote-capable by necessity: the whole case is a person whose device is gone, using the one they still have. |
| `pico.link.direct` `home.identity.rotation.submit` / `home.identity.rotation.veto` | Internal | ADR 0115 U4. The same shape one level up, for the identity key rather than a device. The veto is what makes a rotation a claim rather than a fact. |
| `pico.link.direct` `home.host.rotation.prepare` / `home.host.continuity.submit` | Internal | ADR 0080 H5 with ADR 0115 U4. Preparing a host key rotation and submitting the continuity statement that binds the new keys to the founding record. Remote-capable because the acceptor is the person's device and not the host. |
| `pico.link.direct` `home.storage.condition.read` | Internal | ADR 0119 Q5 with ADR 0107. Opted in deliberately: a refusal a person meets with no warning is the outcome Q5 exists to prevent, and the Foundation UI is not where they are. Returns the state and the reason classes, never row counts or free bytes. |
| `pico.link.direct` `home.time_bound_entries.read` / `home.time_bound_entry.acknowledge` | Internal | ADR 0118 O1. What is due, and the surface confirming the person was told. Only the acknowledgement sets `raised_at`, because the Home cannot observe that a notification was shown. |
| `pico.link.direct` `home.link.mailbox.exchange` | Internal | ADR 0148 EX5. Two devices hand each other relay addresses. Remote-capable is the point: the exchange is what makes a relay usable at all, and re-exchange is rotation. |
| `pico.link.direct` `home.model.providers.read` / `home.model.provider.decision.submit` / `home.model.provider.decision.revoke` | Internal | ADR 0152. What computes for this person, their declaration and allowance against it, and the withdrawal. Remote-capable because ADR 0113 puts the decision on the person's own device rather than in the Foundation dashboard, which ADR 0112 calls diagnosis. Revoking keeps the row with a date on it. |
| `pico.link.direct` `home.model.provider.measure.ask` | Internal | ADR 0142 PE1/PE2 with ADR 0152. The person points the Home at a host and asks what it can actually do; how it went rides along with `home.model.providers.read`, because a measurement and the entry it produces are one subject and a surface polling a dedicated route for minutes would spend ADR 0119 Q4's shared stranger budget on bookkeeping. **The operation every model path needed and nobody had**: `PicoModelProviderRegistry.put()` had no caller outside its tests, so the registry was empty on every real Home - the provider list hid itself, `pickPicoDepotIntakeEntry` refused with `no_decided_entry`, and the only way to produce an entry was a development script that says of itself that it writes nothing. The ask returns when the work starts, because measuring is minutes of generation, an unload to time a cold load and two jobs at once to count lanes. What it produces is an *undecided* entry carrying `live_turn`: ADR 0151 PV1 keeps the wider allowance something a credential buys, so a measurement grants nothing and ADR 0152's decision surface is what asks. `providerClass` travels because it is a person's judgement and never a measurement (ADR 0048). **A host that reads a credential is measured with one, since 2026-08-21**: every probe is a request, so an unauthenticated measurement of a host behind an authenticating proxy observes a 401 at the first endpoint it touches and nothing else - no window, no throughput, no lanes, and no entry. `credentialRef` names the secret; `credential` carries it, on a first measurement only, because a credential is sealed against an entry and an entry exists only once a measurement wrote one - so the Home seals it **after** the entry lands and a later measurement sends the name alone. A reference nothing was filed under refuses as `pico_model_provider_credential_not_held` rather than quietly measuring the host as an open one, which would answer a different question and file the answer in the same field (ADR 0142 PE2). The credential buys no allowance here either: the entry still carries `live_turn`, and ADR 0151 PV5 still refuses to spend a proof over a reach that does not protect it. |
| `pico.link.direct` `home.presence.announce` / `home.presence.read` / `home.presence.forget` / `home.presence.switch` | Internal | ADR 0126 P2/P6. A presence says it is here and what its runtime can do; the person reads their own devices, switches one affordance or a whole device off, and removes a device from the list. Remote-capable by definition - a presence that had to be on the Home's network to announce would be a presence that could not be elsewhere. The announcement carries affordances, which are facts about a runtime, and never a risk class. |
| `pico.link.direct` `home.suppliers.read` / `home.supplier.reach.decide` | Internal | ADR 0138 CO3/CO4. What is attached, and the two decisions standing between an attached supplier and one reaching out: whether it may reach at all, and whether it may do so unasked. The second cannot be granted without the first, which the database carries as a CHECK rather than leaving to whoever writes next. Remote-capable because attaching says a supplier exists and this says Pico may spend somebody's money on it - a person's answer, from the device they hold, not administration's (ADR 0087). |
| `pico.link.direct` `home.supplier.attach` | Internal | ADR 0143 DP3 with ADR 0137 IN5. The person names the privacy domain a declared supplier's material lands in, which is what attaches it. **The half of ADR 0136 that had no product path**: a depot could be fetched and its `pico-depot.json` read, and nothing could turn a declared supplier into an attached one - `attachPicoSupplier` had no caller outside its tests, so the supplier list was empty on every real Home and the library reads BR1 exists for could never be queued. Found by fetching a real depot that declares one and reading the answer. Everything recorded comes from the depot's declaration except the domain, which is the single field a depot may not supply and exactly the one `picoDepotSupplierNeedsFromPerson` names. Attaching creates no reach; ADR 0138 CO3/CO4 stays the separate decision beside it. |
| `pico.link.direct` `home.supplier.detach` / `home.depot.detach` / `home.model.provider.forget` | Internal | **Everything a person can add, taken back.** All three store methods existed and none had a caller outside a test, which is the shape a new gate (`store:check`) now catches: five defects in one week were a store writer whose only author was its own tests. Detaching a supplier stops derivation and deletes nothing - what Pico read out of a library is an ordinary memory item under ordinary custody (ADR 0136, ADR 0129 SR6). Detaching a depot removes the row and then the working copy, because until the boot-time orphan sweep runs there is executable code on disk no attachment stands behind (ADR 0143 DP8, ADR 0070). Forgetting a measured machine takes every decision about it rather than revoking them: an entry id is derived from the model name, so a later measurement of the same model would inherit an old answer about a different finding (ADR 0142 PE1). |
| `pico.link.direct` `home.depots.read` / `home.depot.attach` / `home.depot.reach.decide` | Internal | ADR 0143 DP1 with ADR 0138 CO3/CO4. What is pinned and at which commit, a person saying this material may be here, and whether Pico may fetch it - asked and unasked. Attaching creates no reach, which is why the third operation exists rather than a flag on the first. There is nowhere in the pin to write a branch, a tag or a channel, so "track main" is not a thing this surface can express, and a caller reaching for one is refused as `pico_depot_cannot_follow_a_ref` rather than as a malformed request. |
| `pico.link.direct` `home.depot.fetch.ask` / `home.action.approval.read` / `home.action.approval.resolve` | Internal | ADR 0143 DP8 with ADR 0141 RN4. A person asking for a fetch now, what is waiting for their answer, and the answer. `depot.fetch` is `external_write` and never resolves to `allow` from its risk class, so the decision is `require_approval` and the question is recorded against the session presence was established in - only that session may answer it, and it expires on two clocks. A scheduled sweep carries no session and therefore does not ask; this is the half where somebody is there. Questions live in the Home's memory rather than a table, because a question parked against a session that ended is one nobody can answer where it was asked. |
| `pico.link.direct` `home.depot.offer.accept` | Internal | ADR 0143 DP1, added 2026-08-25. The one route from an offer to a running commit, and the half that was missing: a fetch that saw a newer commit recorded it, `picoDepotState` could say `offered`, and **no operation could see it or accept it**, so DP1's promise that a newer commit waits for a person was true of a database row and not of a Pico. Found as Roadmap B22 through three unreached pieces pointing at one absent surface. The acceptance **names the commit**: the Home rebuilds the offer from what it stored and refuses a mismatch, so a fetch landing between the question and the answer is caught by comparison rather than trusted by ordering - the difference between agreeing to run this code and agreeing to run whatever was newest at the moment somebody pressed. A depot that does not exist and one with no offer standing get the same `no_offer_standing`, because a refusal is not an inventory (ADR 0077 C4). Accepting moves the pin and clears the offer; it fetches nothing, because whether Pico may go and get it is ADR 0138 CO3/CO4's own decision. |
| `pico.link.direct` `home.rule.decide` / `home.rule.forget` | Internal | ADR 0140 RL4, added 2026-08-25. What a person has told this Pico it may do without being asked, and the two ways to change it. **The table has existed since 2026-08-11 and nothing could reach it**, found as Roadmap B22: `setPicoRuleDecision` had no caller outside its tests, `picoRuleDecisions` carried the comment "for a surface that shows them" beside a surface that did not exist, and `home.rule_decision_changed` stood in both closed event lists with nothing appending it. The one reader of a rule in the whole product is the depot sweep, and without a standing rule every path has to find a person - which a scheduled run never has. A rule change is **not an effect** and so does not travel the action path: if it were reachable from the path rules govern, the most valuable request in the system would be the one that removes the governor. Only over an effect somebody consented to, because a rule about a name no module declares speaks about nothing and would stand until some module used that name. Forgetting is its own operation rather than "set it back to require_approval": absence is not `deny`, and for a `local_write` effect that setting would be *stricter* than before - a withdrawal that tightens. **There is no `home.rules.read`**, and that is the same day's lesson applied: ADR 0138 CO1 records that a second unused mechanism is worse than a named gap. What stands is shown by the read it hangs off - `home.depots.read` carries the rule for `depot.fetch` and the domain this Home decides it in. A general listing gets its operation when a second effect can carry a rule. |
| `pico.link.direct` `home.modules.consent.read` / `home.modules.consent.record` | Internal | ADR 0139 AC4. What a module declares it will do, against what a person agreed to, and their agreement. Effect consent used to be written only as a module was switched *on*, and ADR 0127 M3 ships modules on - so a module that was never off recorded none, and `depot`, whose one effect installs code, could never fetch at all. A live walk found it; every test had written the consent row itself. What is recorded comes from the shipped manifest rather than from the caller, so a device cannot write the record of what it was allowed to do. Reading and recording are separate operations because looking at a question must not be the same act as answering it. |
| `pico.link.direct` `home.domain.read-grant.submit` | Internal | ADR 0082 with ADR 0087. A device submits a domain read grant its person's Vault signed. The Home verifies the signature against its founding record before recording anything, so this carries authority and cannot create it. |
| `pico.link.direct` `home.recall.keep` | Internal | ADR 0116 W5. Persists one recall answer as a memory item derived from what it read. Refused when the answer found nothing, when there were no sources, and when a source has since been deleted - a summary that outlived the note it was about would be a memory nobody wrote. |
| `pico.link.direct` `home.recall.ask` / `home.recall.read` | Internal | ADR 0116 W1. A person asks about a privacy domain they may read, from their own device; the answer arrives with the question rather than being withheld like a library read, because a recall is the delivery of something just asked for. The allowance is not chosen - it falls out of the origins of what was included. |
| `pico.link.direct` `home.memory.forget` | Internal | ADR 0071 with ADR 0116 W5. One memory item, unmade by the person who made it. **The half of deletion that had no surface**: a retention policy deletes by age and a domain shred takes everything, and deleting one thing had no path at all - found by `store:check` as `MemoryStore.deleteInDomain` having no caller. The item is reached through the job that holds it, scoped to the requesting identity, so naming an arbitrary memory item cannot tell a caller whether it exists (ADR 0077 C4), and the domain comes off that row rather than from the caller. Deleting nulls the content and drops the key envelope; the `memory.tombstone` event is what makes it survive a restore, because ADR 0070's reconcile re-applies recorded deletions at boot. The job keeps its answer and offers to keep it again - they have an answer and did not keep it, which is the honest state. |
| `pico.link.direct` `home.recall.forget` | Internal | ADR 0049 with ADR 0071, decided 2026-08-25. One exchange, taken back by the person who had it. `home.memory.forget` unmakes the *memory* kept from an answer; until this operation existed nothing unmade the exchange, so the question and the answer stayed in the recall history in the clear and a forget control beside them removed only the note. **The row survives and its words do not**: a kept item is found through its job, so removing the row would take the handle off the item - the same link that stopped a person making a memory they could never unmake. `job_json` is emptied, `result_json` and the recall context are dropped, `forgotten_at` records that it happened rather than leaving it to be read off an empty field, and the row leaves both lists. What stays is a library read's provenance - supplier and commit are statements about a source, not the person's words. The `memory.recall_forgotten` event carries the job id and nothing else: an entry that kept the question would be the copy that undoes the forgetting. |
| `pico.link.direct` `home.model.provider.credential.submit` | Internal | ADR 0151 PV1. The one operation in the closed set that carries a secret, from the person who holds it to the Home that seals it. The reply is the reference; there is no read-back operation, and that absence is the design. |
| `pico.link.direct` `home.model.reads.read` / `home.model.read.keep` | Internal | ADR 0116 W5 on the device: what a read produced and nobody kept, **without the values**, and the explicit keep that persists one. The list carries a supplier, a short revision and a time; the answer arrives only on the keep. |
| `GET /api/model/providers/mine` | experimental foundation administration surface | Lists the providers this person has decided about. Requires an identity session; an operator session is refused, because the decision is a resident's. |
| `POST /api/model/providers/:entryId/decision` | experimental foundation administration surface | Records one person's declaration, allowance and credential reference against a shared finding. Requires an identity session. |
| `DELETE /api/model/providers/:entryId/decision` | experimental foundation administration surface | Revokes that person's standing consent. The row keeps its date, so withdrawn stays distinguishable from never asked. |
| `GET /api/memory/encryption` | experimental foundation administration surface | Reports whether memory content is encrypted, and whether a person decided that or Pico inherited it from the host option. Requires an operator session. |
| `POST /api/memory/encryption` | experimental foundation administration surface | Records the decision in Pico. Says whether it applies at the next start, because the key store is built before the database opens. Requires an operator session. |
| `POST /api/home/link` | experimental Pico Home Link intake | The ADR 0107 direct channel. One sealed, signed envelope carries one operation from the closed list and is answered under the sender's reply key, so the device is authenticated by the envelope rather than by a route session. Its operations are listed as their own surfaces, not as paths. |
| `POST /api/home/reader-key-freshness-checkpoints` | experimental home-authority-relay surface | Accepts an issuer-signed reader-key freshness checkpoint for later verification (ADRs 0086/0088). A relay under ADR 0087: the host stores what it was handed and cannot mint freshness itself. |
| `POST /api/home/modules` | experimental foundation administration surface | Switches a shipped module on or off (ADR 0127 M3). What cascades and what is refused is a pure function in the protocol; this route authorizes, records and re-reads. Requires an operator session. |
| `POST /api/home/modules/capture` | experimental foundation administration surface | Switches whether a module may record (ADR 0129 SR6), which is a separate decision from activation and off by default. Switching it off stops recording and removes nothing: what was recorded stays under custody. Requires an operator session. |
| `POST /api/memory/time-bound-entries/:memoryItemId/acknowledge` | experimental authenticated surface | Records that a time-bound entry was raised, so it is not raised again. Requires an authenticated session. |
| `GET /api/link/relay-identity` | experimental foundation administration surface | Reports which relay operator and account this Home holds, whether a person decided that or Pico inherited it from the host, and how many mailboxes a change would strand. Requires an operator session. |
| `POST /api/link/relay-identity` | experimental foundation administration surface | Records the account this Home holds at a relay operator (ADR 0104 S5, ADR 0031). Refuses with `409` and the count while mailboxes exist, because ADR 0148 gives every relationship its own address pair under that account. Applies at the next start. |
| `GET /api/memory/retention-policies` | experimental foundation administration surface | Lists named retention policies. Requires an operator session. |
| `POST /api/memory/retention-policies` | experimental foundation administration surface | Creates a retention policy. Requires an operator session. |
| `GET /api/memory/retention-policies/:retentionPolicyId` | experimental foundation administration surface | Reads one retention policy. Requires an operator session. |
| `PUT /api/memory/retention-policies/:retentionPolicyId` | experimental foundation administration surface | Edits a retention policy; the change applies to every item referencing it at the next sweep. Requires an operator session. |
| `DELETE /api/memory/retention-policies/:retentionPolicyId` | experimental foundation administration surface | Revokes a retention policy. Items still referencing it fall back to fail-safe keep, so this deletes no memory. Requires an operator session. |
| `GET /api/memory/domains/:privacyDomain/items` | experimental foundation content surface | Lists a privacy domain's active items with decrypted content, cursor-paged (`limit`, `after`). Authorized by **domain readership**, a distinct authority from the operator role (ADR 0077): an operator session alone does not read content, and the static token never reaches here. |
| `GET /api/memory/domains/:privacyDomain/items/:memoryItemId` | experimental foundation content surface | Reads one active item's content, or `404` when it is absent, deleted or tombstoned. A crypto-shredded item reports `contentUnavailable` rather than fabricating content. Same readership authority. |
| `WS /ws` | experimental event stream | Streams events and connection messages. |

These endpoints are not yet a complete Pico Link or Pico Home Link specification.

They assume a trusted local access path while production authentication, authorization, Home membership, Pico Link transport security and policy/audit models are not implemented. They must not be treated as a public internet API or production remote-access surface. The exposure boundary is documented in `../architecture/0030-foundation-api-exposure-and-local-trust-boundary.md`; the staged local hardening direction is documented in `../architecture/0038-foundation-local-access-hardening-and-ingress-boundary.md`; the direct-access WebSocket ticket boundary is documented in `../architecture/0039-foundation-websocket-ticket-boundary.md`; the Home Assistant ingress packaging direction is documented in `../architecture/0040-foundation-home-assistant-ingress-and-addon-token-options.md`.

ADR 0110 adds internal, unpublished Pico Link Direct recovery handling under
the single closed operation `home.device.recovery.submit`: a
root-authenticated target-bound `prepare` phase returns the current lifecycle
head and active replacement set, `initiate` creates durable pending state only
from a root-signed/target-co-signed total-replacement claim, and `complete`
reveals state only after exact recovery id, claim digest and target binding
match. `home.device.recovery.veto` remains normally authorized to a living
same-identity device.

ADR 0114 adds two further internal, unpublished operations,
`home.identity.rotation.submit` and `home.identity.rotation.veto`. Both are
normally authorized: a rotation must be carried by a currently delegated,
active device of the rotating identity itself, and a veto by another such
device. The submission carries the dual-signed `pico.identity.rotation.v1`
record together with the successor root's own first-device delegation, and
`home.device.lifecycle.read` reports a pending rotation the same way it
reports a pending recovery, so the existing alarm carrier surfaces it without
a new read surface, and reports the principal's own rotation debt from the
first authorized read after the Home Host Pico re-admits the successor.
Before re-admission the successor's device is refused whole - deliberately,
so the Home never discusses the predecessor's relationships with a key its
issuer has not re-admitted. Accepting a rotation is a local act: a record accepted by
another Home decides nothing here.

ADR 0115 adds two further founder-only operations for the Home's own
host keys: `home.host.rotation.prepare` stages successor keys and returns
the dual-host-signed continuity proposal, and `home.host.continuity.submit`
accepts the completed record - carrying the Home Host Pico's acceptance,
the one signature a stolen host disk cannot produce - then atomically
swaps custody and answers to the new audience pin without a restart. The
submit result returns the new host public bundle so the accepting client
can re-pin over the same sealed channel; every other client stays on the
old pin until ADR 0115 U4. These forms, the Recovery Card PDF generator and the
Foundation state machine are local implementation surfaces, not Pico Link
compatibility. A fully matching database backup from before consumption can
still resurrect its in-window pending row until ADR 0110 R6 supplies an
external monotonic anchor.

The current Foundation API is local diagnostics only. Direct Foundation HTTP API access can be protected with the temporary `PICO_FOUNDATION_TOKEN` and with a local Foundation Operator login, but this is not production authentication, authorization, membership, claim, production memory or Home Assistant control boundary. Current `deviceId` values are client-supplied metadata, not verified device identity.

Every Foundation API route carries exactly one access class (`../architecture/0075-foundation-local-authentication-session-and-membership-threat-model-and-scoping.md`), enforced at route registration so an unclassified route cannot be served. Authority comes from typed **operator sessions**, typed **Pico identity sessions**, domain readership and the principal-less static token at its strict diagnostic ceiling. Operator sessions administer but never become Pico identity or readership. Identity sessions may satisfy `authenticated` and, through the readership decision, `domain-content`; they never satisfy diagnostics or host administration. Repeated failed operator logins on `POST /api/auth/session` are throttled with a growing, capped delay and answered `429` with `Retry-After`; the delay is deliberately not a lockout, because a lockout would let anyone deny the owner their own appliance, and failed attempts stay in operational logging only. Both session kinds are opaque bearer values, sent as `Authorization: Bearer <session>`, held in memory only and never persisted; they are not cookies, so the browser attaches no ambient credential. Revoking a session — individually, through a revoke-all, or by replacing the operator credential — also drops its realtime tickets and terminates WebSocket connections opened under it. Connections opened with the static token or in credential-free local mode carry no session and are unaffected.

`GET /api/home/setup` and `POST /api/home/claim` are setup-bootstrap routes for ADR 0080 Gate M2. They are reachable only while the Home is unclaimed. The Move-In Code is printed to the host local channel, not returned by HTTP; `/api/home/setup` returns only public host-key material and the host setup nonce needed for pinning and claim binding. `POST /api/home/claim` accepts nothing but a sealed claim envelope or a founding acceptance: the earlier body (`moveInCode`, `homeHostPicoId`) is gone, because it claimed a Home under an unauthenticated identity string and left it without a founding record and therefore without any membership.

The sealed path is now two-step. First, `POST /api/home/claim` accepts `claimEnvelope: { schema: "pico.home.claim-envelope.v1", sealedClaimPayloadHex }`. The sealed payload is opened with the host key-agreement key and must contain `schema: "pico.home.claim-payload.v1"`, the ADR 0080 `claim` signature input, a `pico_identity` claimant key record and a detached claimant signature. After verification, the server consumes the Move-In Code, returns `202` with a host-signed `pico.home.claim-response-record.v1` and the exact `pico.home.founding.v1` signature input to countersign. Second, the claimant POSTs `foundingAcceptance: { schema: "pico.home.founding-acceptance.v1", claimId, foundingId, claimantFoundingSignatureHex }`. A valid acceptance completes the claim atomically: Core stores claim state plus one current `pico.home.founding-record.v1` (which carries no claimant signature over the claim: those bytes cover the Move-In Code and the host setup nonce, neither of which is kept, so such a field could never be re-verified), projects the Home Host Pico's active `home_host` membership root into `pico_home_membership`, signs the host half of the founding record and appends `home.claimed`. The pending ceremony is per-process and expires after ten minutes; ten rejected founding acceptances discard it as well. Either case reopens Setup Mode with a fresh Move-In Code and a fresh host setup nonce, so an abandoned or attacked ceremony does not hold the Home hostage until a restart. This still does not issue signed member credentials, authorize domain access by membership alone, consolidate the Foundation operator or implement Pico Home Link compatibility.

On boot, a stored founding record is treated as durable evidence that the Home has been claimed: stale `unclaimed` claim-state rows are projected back to `claimed`, and Setup Mode does not mint a new Move-In Code while founding evidence exists. The app also checks that host-key custody matches the founding fingerprints and that the stored claimant/host founding signatures verify; missing, mismatched or invalid host-key custody keeps Setup Mode closed and requires an explicit local home reset to start over. Signed Home Membership Credentials (`pico.home.membership-credential.v1`) and their lifecycle statements (`pico.home.membership-lifecycle-record.v1`) are stored and verified as the first ADR 0080 Gate M3 slice. `POST /api/home/memberships`, `POST /api/home/membership-lifecycle` and `GET /api/home/memberships` are `host-admin`: relaying a credential the Home Host Pico signed is host administration, and refusing to relay one is the only power the host has over membership — it cannot mint one. The intake body carries the issuer half only; this Home adds its activation countersignature itself, and only after the issuer authority verified, because activating an unverified statement would be signing garbage. `createdAt` is host-stamped. Both routes append a content-free audit event (`home.membership_recorded`, `home.membership_changed`) carrying credential and lifecycle references, the subject key reference and the status — never key material (ADR 0078 K7). The two signatures are checked separately because they mean different things: the Home Host Pico's issuer signature is the authority and is re-verified on every boot, while the host's activation countersignature is operational acknowledgment checked once at intake — re-checking it later would break a Home whose host key legitimately rotated. A credential that does not name this Home, this host key and the Home Host Pico as issuer verifies as nothing, the founding record is never re-issued as a credential, and a member's projected status follows the freshest lifecycle statement. Membership is only active inside its validity window. Issuance by a device key delegated with `home_membership` scope is refused by name until delegation chains are verified. The membership projection is reconciled the same way: the current founding record is the only truth for founding-sourced rows, so a restored membership root from a superseded founding is dropped instead of staying active, and active-membership lookups are scoped to the currently claimed Home.

ADR 0082 adds the first identity-bound session path. `POST /api/auth/identity-challenges` issues a two-minute one-use nonce and the instance-bound context `pico.home.surface-session.v1:<hostSigningKeyFingerprintHex>`; the bounded in-memory store consumes a challenge on the first proof attempt. `POST /api/auth/identity-session` verifies identity, device signing and device key-agreement records, an identity-signed delegation with active `surface_session` scope, any supplied signed revocations, and the device's signing-key possession signature over that exact challenge. ADR 0083 requires the agreement record's role and fingerprint to match that same delegation and persists the exact reader-key binding. Accepted delegation/revocation evidence is stored and reconciled on boot. Every later use rechecks current Home membership and locally known lifecycle evidence; expiry, eviction, revocation, missing evidence or reset makes the opaque session inert. Local monotonicity is not a claim that the host can discover an unseen remote revocation; future envelope selection additionally requires ADR 0083's authenticated external freshness source, whose default is unavailable.

The same ADR defines `pico.home.domain-read-grant-record.v1` and `pico.home.domain-read-grant-lifecycle-record.v1`. Their signatures must root in the current founding Home Host Pico and bind Home, host signing key, domain, controller and reader. Intake is limited to active members and existing `host_custody` domains, is idempotent by record id, host-stamps `createdAt`, and reconciles invalid restored evidence before authorization. On a claimed Home, the default content policy now requires all three facts: a verified identity session, active Home membership and an active signed grant for that exact domain. Operator sessions therefore receive the same non-enumerating `404` as an ungranted identity.

ADR 0084 adds the host-custody share-envelope ceremony. Preparation selects the exact ADR 0083 reader key with authenticated external freshness, seals an existing versioned KEK with libsodium's sealed box, and returns canonical `pico.share.envelope.v1` bytes for an external Home Host Pico Vault signature. Pending unsigned state is bounded, memory-only and two-minute-lived. Finalization accepts only the issuance reference plus detached signature and rechecks grant, membership, reader freshness, key presence and wrap digest before persisting `pico.share.envelope-record.v1`. The tuple `(grant, reader key, KEK version)` is conflict-safe, boot/lifecycle/shred reconciliation removes unsupported rows, and only an operator session may prepare, finalize or list this sensitive reader-graph inventory. ADR 0085 supplies the internal authenticated Registry/Sync adapter: Core accepts only a complete identity-root-signed `pico.identity.reader-key-freshness-checkpoint.v1`, verifies exact Home/identity/device/delegation binding, lifecycle order and a maximum five-minute window, and never accepts freshness fields from an HTTP request. The production default remains fail-closed until a deployment injects an owner-side checkpoint transport.

ADR 0086 adds the first reader-custody path. An owner `pico_identity` Vault session creates a fresh domain KEK, immediately seals it to the owner's exact X25519 reader key, signs both the owner envelope and domain authority, and never returns the raw KEK. The owner separately signs a validity-bounded grant for one exact writer identity/device-signing key and may revoke it. That device signs packages binding context plus digests of XChaCha20-Poly1305 ciphertext and the wrapped per-item DEK.

ADR 0088 extends that path with owner-signed grants and revocations for exact additional reader keys, explicit `from_version`/`forward_only` history, and atomic `n+1` KEK rotations. Every uncovered reader or writer revocation creates a domain-wide write barrier until the owner signs a rotation containing the exact cause set, the exact remaining-reader set, and one new owner envelope plus one envelope per remaining reader. Core stores domain, reader/writer authority, rotation and item evidence in seven separate opaque tables, not `memory_item`; it verifies current founding, active membership, exact fresh reader keys, signatures, envelope/digest completeness, rotation debt and historical version evidence, then re-verifies on boot. `POST`/`GET /api/home/reader-custody/*` are local `home-authority-relay` routes under ADR 0087. Their list responses expose metadata and ciphertext summaries only, never reader envelope ciphertext, a raw KEK, a raw DEK or plaintext. Delegated controllers, automatic rotation execution, reader-facing transport and reader-custody shred UX remain unimplemented.

When `PICO_FOUNDATION_TOKEN` is configured, or once an operator exists, `WS /ws` requires either a non-browser bearer upgrade header (token or session) or a short-lived single-use realtime ticket. Neither the long-lived token nor a session may be placed in a WebSocket URL.

### Current `GET /api/events` shape

`GET /api/events` accepts:

| Query parameter | Meaning |
|---|---|
| `limit` | Optional positive integer, clamped to the implementation maximum. |
| `after` | Optional opaque cursor returned by a previous response. |

`GET /api/events/tail` accepts `limit` and returns the latest stored events without changing the cursor contract for `GET /api/events`.

The response keeps `events` as the primary additive field and adds cursor metadata:

```json
{
  "events": [],
  "nextCursor": null,
  "hasMore": false
}
```

`nextCursor` is opaque. Clients must not parse it or rely on its internal format.

For `GET /api/events/tail`, `events` contains the latest page in chronological order, `nextCursor` is currently `null`, and `hasMore` means older stored events were omitted.

The current `PicoEvent.signature` field is stored and returned as opaque metadata only. Pico Home Core does not verify signatures yet. Clients must not treat a populated `signature` field as proof of authorship, integrity or Pico identity until the key lifecycle, canonicalization, signature format, test vectors and verification model exist.

### Current `WS /ws` message types

`WS /ws` currently emits connection and event-broadcast messages for the local Foundation dashboard. These messages are not Pico Link packets and do not define a production remote transport. The current implementation uses an Origin check and, when `PICO_FOUNDATION_TOKEN` is configured, the ADR 0039 ticket/bearer upgrade boundary.

```text
pico.core.connected
pico.event.created
```

Current message shapes:

```json
{
  "type": "pico.core.connected",
  "deviceId": "pico-home-core"
}
```

```json
{
  "type": "pico.event.created",
  "event": {
    "eventId": "example-event",
    "deviceId": "example-device",
    "lamport": 1,
    "wallTime": "2026-07-08T00:00:00.000Z",
    "type": "message.created",
    "stream": "session:example",
    "payload": {
      "role": "user",
      "text": "Hallo Pico"
    }
  }
}
```

## Current event compatibility classes

### Foundation event types

These are the implemented foundation event types. All are writable through `POST /api/events` except the server-synthesized ones listed below, which the client write path rejects:

```text
device.registered
device.seen
session.created
message.created
avatar.state_changed
memory.recorded
memory.time_bound_entry_recorded
memory.time_bound_entry_due
memory.tombstone
memory.recall_forgotten
memory.domain_shredded
auth.operator_bootstrapped
auth.credential_changed
auth.operator_reset
auth.sessions_revoked
home.claimed
home.reset
home.membership_recorded
home.membership_changed
home.domain_read_granted
home.domain_read_revoked
home.share_envelope_issued
home.share_envelope_removed
home.device_recovered
home.device_recovery_vetoed
home.recovery_anchor_reseeded
home.identity_root_rotation_vetoed
home.host_key_rotated
home.clock_divergence_detected
home.module_activation_changed
home.module_capture_changed
home.presence_switch_changed
home.state_crossed
home.rule_decision_changed
home.supplier_attachment_changed
home.model_provider_measurement_changed
home.version_changed
```

Server-synthesized foundation event types (exported as `serverSynthesizedFoundationEventTypes`), appended by the server and never accepted on `POST /api/events`:

```text
memory.domain_shredded
memory.recall_forgotten
memory.time_bound_entry_due
auth.operator_bootstrapped
auth.credential_changed
auth.operator_reset
auth.sessions_revoked
home.claimed
home.reset
home.membership_recorded
home.membership_changed
home.domain_read_granted
home.domain_read_revoked
home.share_envelope_issued
home.share_envelope_removed
home.device_recovered
home.device_recovery_vetoed
home.recovery_anchor_reseeded
home.identity_root_rotation_vetoed
home.host_key_rotated
home.clock_divergence_detected
home.module_activation_changed
home.module_capture_changed
home.presence_switch_changed
home.state_crossed
home.rule_decision_changed
home.supplier_attachment_changed
home.model_provider_measurement_changed
home.version_changed
```

`memory.recorded` records a reference to a deleteable memory item (ADR 0068 / ADR 0069). Its `POST /api/events` request carries the content (`{ privacyDomain, contentType, content, summary?, owner?, controller?, retentionPolicyRef? }`); an unknown `retentionPolicyRef` is rejected at write time, because the sweep's fail-safe rule would otherwise keep the item forever while the writer believed expiry was configured. The reference is stored with the item and does not appear in the event payload; the server stores the content in the deleteable memory store and records a server-derived event whose payload is only the reference `{ memoryItemId, privacyDomain, contentType, summary? }` with posture `reference_only`. The append-only event never holds the content. The stored event and its `memoryItemId` are returned in the response. On read, `GET /api/events` and `/api/events/tail` enrich each `memory.recorded` event with a `resolutionState` (`resolvable`, `deleted` or `unknown`) computed from the store; this is a read-time projection and does not change the stored event.

`memory.tombstone` is the append-only deletion marker for a deleteable memory item (ADR 0014 / ADR 0068). Its payload is `{ memoryItemId, privacyDomain, reason? }` and carries no sensitive content. Writing one transitions a matching `deleted` memory item to `tombstoned` on a best-effort basis; the event log stays the source of truth.

`memory.domain_shredded` is the append-only crypto-shred audit record for a privacy domain (ADR 0071 step 4, ADR 0037 audit style). Its payload is `{ privacyDomain, removedKeyVersions, reason? }` and carries no content or key material; the actor and time are the event's `deviceId` and `wallTime`. It is appended by the server's crypto-shred operation and rejected on the client write path, so a client cannot forge a shred record.

`memory.recall_forgotten` is the append-only record that a person took one exchange back (ADR 0049 with ADR 0071). Its payload is `{ jobId }` and deliberately nothing else: an entry repeating the question would be the copy that undoes the forgetting, which is the same reason `memory.tombstone` carries a reference rather than the content. It is server-synthesized and refused on the client write path - a caller able to claim somebody forgot something could invent a retraction that never happened. The event says that it happened; the row it names no longer says what.

The `auth.*` types are the append-only Foundation Operator audit trail (ADR 0076, ADR 0037 audit style): `auth.operator_bootstrapped` (payload `{}`) when the first operator credential is established, `auth.credential_changed` (payload `{}`) when the passphrase is replaced, `auth.operator_reset` (payload `{ reason? }`) when a local reset clears the operator, and `auth.sessions_revoked` (payload `{ revokedSessions }`) when all sessions are revoked at once. They carry no credential material, no session identifiers and no content; the actor and time are the event's `deviceId` and `wallTime`. All four are server-synthesized and rejected on the client write path. Individual logins, logouts, failed logins and rate-limit hits are deliberately **not** recorded here: they are attacker-triggerable and stay in bounded operational logging so the append-only log cannot be flooded (ADR 0075 A9).

`home.membership_recorded` and `home.membership_changed` are the append-only membership audit records for ADR 0080 Gate M3 / ADR 0078 K7. Their payloads carry `credentialId`, the subject key reference and the resulting `status` (plus `lifecycleId` on a change) and never signatures, key material or content. `home.domain_read_granted` and `home.domain_read_revoked` are the corresponding ADR 0082 read-grant audit records: only grant/lifecycle, domain and reader-key references. ADR 0084 adds `home.share_envelope_issued` and `home.share_envelope_removed`; they carry only the grant/domain/reader-key/KEK-version references and, for removal, a bounded reason category. None carries a signed record, ciphertext, key or content. All six are server-synthesized and rejected on the client write path. `home.claimed` and `home.reset` are the append-only Pico Home setup audit records for ADR 0080 Gate M2. Their payload is `{}`. They never carry Move-In Codes, private keys, public-key material, claimant identifiers, attempt details or membership data; the actor and time are the event envelope. Both are server-synthesized and rejected on the client write path.

### Current foundation payload schemas

The current Foundation API validates exact development payload schemas for implemented writable Foundation event types. Unknown payload fields are rejected so clients cannot hide personal memory, credentials, location, health, relationship or product data inside append-only Foundation events.

These schemas describe the current experimental foundation surface only. They are not a final companion, memory, Pico Link or Pico Home Link schema.

#### `device.registered.payload`

The current payload is an empty diagnostics marker:

```json
{}
```

It does not carry verified identity, device metadata, membership or trust claims.

#### `device.seen.payload.status`

```text
online
offline
```

#### `session.created.payload`

The current payload is an empty diagnostics marker:

```json
{}
```

It does not define product session semantics.

#### `message.created.payload.role`

```text
user
assistant
system
tool
```

ADR 0116 W1: `system` and `tool` are reserved at the client write path,
exactly like the action vocabulary — `POST /api/events` refuses them until a
dedicated write path exists whose authority actually is the system or a
completed tool run. The client-writable subset is exported as
`clientWritableMessageCreatedRoles` (`user`, `assistant`).

#### Event `origin` (ADR 0116 W1)

Stored events carry an additive, optional `origin` field from the closed
vocabulary `picoEventOriginClasses` (`person_present`, `own_pico`,
`home_member`, `remote_pico`, `external_content`, `unattributed`). It is
assigned by the server from the authenticated write authority and is never
client-assertable; a request body carrying `origin` is refused. The current
runtime assigns only `unattributed` — to writes under the static diagnostic
token and to writes on the pre-claim trusted-local path with no credential.
Operator- and identity-session writes stay unlabeled until ADR 0116 W2
assigns their classes; an absent `origin` never means "trusted". On a
duplicate append the stored origin wins: origin sticks to the content at
first intake, and a replay never relabels the stored row.

#### `avatar.state_changed.payload.mode`

```text
everyday
technical
wwg
firefighter
security
organization
smart_home
```

#### `avatar.state_changed.payload.state`

```text
idle
listening
thinking
working
unsure
warning
confirmation_required
blocked
success
sleeping
```

#### `avatar.state_changed.payload.intensity`

```text
low
normal
high
```

#### `avatar.state_changed.payload.statusColor`

```text
neutral
blue
green
yellow
red
violet
```

### Reserved payload posture direction

These names are reserved privacy and deletability direction for later additive protocol work (ADR 0014, operationalized by ADR 0067). They are exported as `payloadPostures` in `@pico/protocol`:

```text
inline_operational
inline_test
reference_only
summary_only
redacted
```

The Foundation `PicoEvent` shape now carries an optional additive `payloadPosture` envelope field (ADR 0067); an absent value is treated as `inline_operational` and existing events stay unchanged. Only `inline_operational` and `inline_test` are writable through `POST /api/events`; `reference_only`, `summary_only` and `redacted` are reserved for future memory-referencing events and are rejected with a 400. These names do not implement memory storage, tombstones, retention policy, privacy domains, crypto-shredding or deleteable memory. Inline Foundation payloads remain development/foundation data only.

### Reserved memory item deletion states

Reserved deleteable-memory direction (ADR 0014, defined by ADR 0068), exported as `memoryItemDeletionStates` in `@pico/protocol`. There is no memory store, deletion or tombstone runtime:

```text
active
deleted
tombstoned
```

### Reserved reference target resolution states

Reserved reference-target direction (ADR 0068), exported as `referenceTargetResolutionStates` in `@pico/protocol`. A reference target names where a deleteable memory item lives; it is not the content and is not accepted on any current write path:

```text
resolvable
deleted
unknown
```

### Reserved memory content postures

Reserved memory-content protection direction (ADR 0070), exported as `memoryContentPostures` in `@pico/protocol`. Storage metadata for how a memory item's content is protected at rest, not an access decision. `plaintext_foundation` is the current state (content stored as plaintext, foundation/development data only); `domain_encrypted` is the target state (encrypted under a privacy-domain content key with a key-envelope reference). No encryption, key management or crypto-shredding exists yet:

```text
plaintext_foundation
domain_encrypted
```

### Reserved memory retention modes

Reserved memory retention direction (ADR 0074), exported as `memoryRetentionModes` in `@pico/protocol`. How a memory item's retention is governed, referenced by the item's retention policy. `keep_until_deleted` is the system default (no automatic expiry; content lives until a user or controller deletes it); `delete_after_max_age` expires content once the item is older than the policy's maximum age, deleting through the tombstoned deletion path. A missing or unresolvable policy never deletes (fail-safe keep). No compliance or legal-hold semantics:

```text
keep_until_deleted
delete_after_max_age
```

### Reserved context-signal direction

`ContextSignalLevel` is a TypeScript planning type with the values `untrusted`, `known` and `trusted`. It is not a field in the current Foundation event payload schema and does not create an authorization, membership or host-administration boundary.

Future work should separate context evidence, roles, capabilities and membership credentials explicitly before any context-signal data becomes writable or security-relevant.

### Product action event types

These names are product-facing protocol direction. They are reserved and not writable through the current Foundation `POST /api/events` endpoint until dedicated Pico Rules, Action Runner and Action History write paths exist:

```text
action.requested
pico_rules.decision_created
approval.requested
approval.resolved
action_runner.action_started
action_runner.action_completed
```

Six names for the five facts of ADR 0139: requested, decided, answered where a person was required, started, finished. Two names left on 2026-08-10 under ADR 0139 AC5. `action.completed` duplicated `action_runner.action_completed`, and `action_history.event_created` recorded a fact the ADR 0121 chain already makes tamper-evident, which is why ADR 0141 makes Action History a view over the event log rather than a store beside it. Revised in place under ADR 0134: these names are reserved, never writable, and nothing holds an artifact produced under them.

### Pre-release action terminology consolidation

Before the first deployment or external protocol publication, the unused aliases for earlier tool, policy, confirmation, executor and audit terminology were removed. The product action names above are the only exported action-event direction. No stored data, deployed client or published compatibility surface required an adapter or alias period. Any later rename after deployment or publication still requires the versioned compatibility process defined by ADR 0025 and ADR 0026.

### Pico Home event direction

These names describe future Pico Home Link direction:

```text
pico_home.claim_requested
pico_home.claim_completed
pico_home.invite_created
pico_home.resident_joined
pico_home.resident_removed
```

They are not writable through the current Foundation `POST /api/events` endpoint. They are not yet a host claim API, membership API, residency protocol or eviction protocol.

## Compatibility surfaces to separate

Pico compatibility has at least two different surfaces.

| Surface | Compatibility focus |
|---|---|
| Pico Link | peer communication, client communication, relayed messages, identity-level interaction |
| Pico Home Link | host claim, move-in, residency, eviction, sync, routing and privacy-domain handling |
| PICO Appearance | durable parametric appearance identity, its compatibility core and semantic fallbacks |

A project may be compatible with one surface and not the other.

For example, a client may implement Pico Link but not host a Pico Home.

A server may implement Pico Home Link but not act as a peer companion.

### PICO Appearance surface status

The appearance document surface (ADR 0125,
[`appearance-document-v1.md`](appearance-document-v1.md)) is, after the
current milestone, implemented only as a package/codec contract:
`@pico/appearance` encodes, decodes, validates and projects the `pad1_`
appearance document and the `pa1_` profile payload, with authoritative
fixtures under `fixtures/appearance-document/v1/`. Honest boundary: nothing
synchronizes appearance profiles over Pico Link or Pico Home Link, no
Foundation route reads or writes them, no runtime capability advertises
them, no companion or web surface renders a full PICO from them, no custom
asset bytes are transferred and no generator is character-approved. The
appearance envelope carries its own version axis and is deliberately not
coupled to the Pico protocol version. Capability names
(`pico.appearance.document.v1`, `pico.appearance.compatibility-core.v1`,
`pico.appearance.profile.parametric.v1`, `pico.appearance.head-generator.v2`,
`pico.appearance.custom-asset-reference.v1`) and the typed claim shape
`PicoAppearanceCompatibilityClaimV1` are defined in `@pico/protocol` as
name/type contracts only.

## Experimental versus stable

Before `1.0.0`, APIs may change. However, compatibility claims must still be honest.

If an implementation claims compatibility with protocol version `0.1.7`, it must preserve the documented semantics for that version.

Breaking changes require at least one of:

- a new protocol version
- explicit version negotiation
- a new capability flag
- an extension namespace
- a migration path
- a compatibility adapter

## Capability naming

Capability names should be lowercase, namespaced and versioned.

### Current runtime capability flags

The current Pico Home Core status response advertises these implemented experimental runtime capability flags:

```text
pico.core.events.v1
pico.core.websocket.v1
pico.avatar_state.v1
pico.home.setup.v1
```

These flags do not imply L2 Pico Link compatibility, L3 Pico Home Link compatibility, production readiness or commercial permission.

### Current Pico Home claim-state values

The current `GET /api/system/status` diagnostic shape exposes a minimal Pico Home claim-state value. This is diagnostic metadata only. It is not a claim API, membership credential or authorization boundary.

```text
unclaimed
claimed
```

Examples:

```text
pico.core.events.v1
pico.core.websocket.v1
pico.avatar_state.v1
pico_link.messages.v1
pico_home.claim.v1
pico_home.residency.v1
pico_home.eviction.v1
pico_rules.decisions.v1
action_runner.actions.v1
action_history.records.v1
```

Fork or extension capability names should use their own namespace:

```text
example_fork.custom_visuals.v1
example_fork.custom_storage.v1
```

## Compatibility claim format

A future compatibility claim should include at least:

```json
{
  "implementationName": "Example Pico Home",
  "implementationVersion": "0.1.0",
  "protocolVersion": "0.1.7",
  "surfaces": {
    "pico_link": false,
    "pico_home_link": true
  },
  "capabilities": {
    "pico_home.claim.v1": true,
    "pico_home.residency.v1": true
  },
  "commercialPermission": false
}
```

`commercialPermission` is informational only and does not replace a written license grant.

## Conformance fixture planning

Future compatibility claims need published fixtures and runner semantics before they can become strong claims.

The planned fixture layout and current Foundation event/realtime fixture seed are documented in [`conformance-fixtures.md`](conformance-fixtures.md).

That document and the seed fixtures do not publish a conformance suite, certify L4 compatibility or make current Foundation APIs production-ready.

## Naming and user trust

A compatibility claim must not imply official status.

Allowed wording:

```text
Compatible with Pico Home Link protocol version 0.1.7.
```

Not allowed without permission:

```text
Official Pico Home
Pico Home Managed
Pico Certified
Official Pico-compatible Hosting
```

## Non-goals

This document does not define:

- final event schemas
- final sync protocol
- final encryption envelopes
