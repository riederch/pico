# 0081 - Pico Vault Person-Role Key Custody Threat Model and Direction

## Status

Accepted as the threat model and custody direction for **person-role private keys** — the Pico Identity Key and the owner's device keys under `pico.suite.id.v1` (ADR 0079): the exclusive Vault boundary (the Foundation host and every browser context are structurally excluded custody locations), one canonical encrypted at-rest format (`pico.vault.keyfile.v1` direction: Argon2id-derived key, XChaCha20-Poly1305 with an AAD-bound labeled header), the agent-pattern process boundary with label-checked signing, root minimization (one primary Vault, delegated device keys everywhere else), encrypted-or-absent export, and the honest loss rule — behind three gates. This is the dedicated custody ADR that ADR 0079 Gate G2 requires before any person-identity key exists anywhere. **It implements nothing**: no Vault exists, no key is generated, and every draft fixture fence (ADR 0051/0055) stays in force.

## Context

ADR 0079 decided the primitives, canonical byte method and lifecycle direction for identity and device keys, and split custody by role: host-role keys got file custody alongside the claim flow (ADR 0080 Gate M2), and person-role keys got a hard fence — *no person-identity private key is created on the Foundation host until a dedicated custody ADR exists*. ADR 0080 then made that fence the precondition of the entire claim path: the founding record is signed by a person-role identity key, so the Empty Pico Home stays empty until a real holder of person keys exists.

The concept layer has always named that holder. ADR 0015 gives Full Clients the keys-and-backups role; ADR 0026 names it the **Pico Vault**; ADR 0029 requires private identity material to stay under Pico Vaults, platform keystores or hardware-backed storage, never as plaintext host state; ADR 0033 places identity creation inside a Vault or reviewed setup path and fences recovery; ADR 0016 lists the allowed directions this ADR draws from — platform keystores, libsodium primitives, age-style backup protection, passkeys/hardware "where appropriate".

What is missing is the custody decision itself: where person-role private keys live at rest, what unlocks them, what boundary they never cross, and what the first real deployment can honestly offer. The honest starting answer to the last question: **nothing that exists today can hold them** — the Home Assistant add-on is a Core Host (ADR 0024 forbids it the role) and the dashboard is a browser Surface. The first Vault is new software, and this ADR fixes what it must be before anyone builds an expedient substitute.

## Scope

Covers: custody for person-role private keys — at-rest format, unlock model, process boundary, creation, export/backup, root-versus-device-key custody asymmetry, platform-keystore posture, and the loss/recovery honesty boundary.

Does not cover: recovery of any kind (ADR 0033 boundary unchanged), passkey/hardware-backed identity (a future suite per ADR 0079 I2), key synchronization between devices, the Vault's product shape and UX beyond the custody floor, multi-person shared Vaults, host-role custody (ADR 0080 Gate M2), or any change to the Foundation auth layer (ADR 0075/0076). No runtime ships from this ADR.

## Threat model

### Protected assets

- the identity root private key — its compromise is identity compromise (ADR 0031 lists it first; ADR 0079 repeats it), and its *loss* is identity loss, because recovery deliberately does not exist yet: custody defends availability as much as secrecy
- the owner's device private keys — operational signing and domain decryption within delegated scope
- the unlock secret (passphrase or platform-keystore-held key) — the only thing standing between a stolen keyfile and the keys
- unlocked key material in process memory
- encrypted exports — backups that must stay as strong as the original at rest

### Attacker model

| Attacker | Capability | Posture direction |
|---|---|---|
| Keyfile thief (stolen disk, cloud-synced directory, a backup that swept a Vault path) | Holds ciphertext; grinds the passphrase offline. | Argon2id at moderate cost is the mitigation, not a proof — a weak passphrase falls (the ADR 0076 honesty, restated). V1 path separation makes "a host backup captured the Vault" a defect rather than fate; a platform-keystore-held unlock secret (Gate P3) removes the passphrase-only failure mode where the platform honestly supports it. |
| Malware on the Vault device | Reads unlocked memory; asks the agent for signatures. | Endpoint compromise wins — stated, the ADR 0071 running-process rule applied to the Vault. Bounded, not solved: label-checked signing kills the blind-signing oracle (V4), auto-lock bounds the window (V7), device keys carry scoped delegations (I8) and revocation exists (I9). Root compromise remains identity compromise — the reason the root lives in as few places as possible (V5). |
| Keylogger / shoulder surfer | Captures the passphrase. | Named; the passphrase alone is useless without the keyfile (two artifacts), and secure-input paths are per-platform work (Gate P3). |
| Swap, hibernation, core dumps | Capture unlocked pages. | Guarded memory and zeroization are best-effort duties (V7); a garbage-collected runtime cannot promise complete key erasure, and Gate P2 must state the chosen runtime's actual limits instead of assuming them away. |
| Stale Vault backup | Restores an old keyfile. | Intended for the root — that is what backups are for. It cannot resurrect revoked device delegations, because custody artifacts carry keys, never lifecycle truth (V9, ADR 0079 I9): verifiers consume signed records, not Vault contents. |
| Compromised local consumer (blind-signing abuse) | Submits attacker-chosen bytes to the signing boundary. | V4: the Vault signs only inputs that begin with a recognized family label under the I3 layout discipline — unlabeled or unknown-family bytes are refused. Cross-protocol signature abuse fails structurally; approval UX can tighten further later. |
| Browser context (XSS, extension, cache) | Steals keys from a web app. | Structurally void: person-role keys never exist in a browser context (V1). The dashboard is a Pico Surface (ADR 0015/0026) and stays one. |
| Foundation host, hostile operator, host backups | Read host disk and backup artifacts. | Structurally void: V1 keeps Vault custody paths disjoint from every host data and backup scope — there is nothing to find (ADR 0079 I7), even when Vault and host share a physical machine (ADR 0024 role separation). |
| Malicious Vault binary / supply chain | Owns everything at install time. | Out of scope for the custody layer and named: packaging and release trust is ADR 0005/0019-family work. No custody format defends against the software that legitimately opens it. |

### The ADR 0016 questions, answered for person-key custody

1. **Who controls keys?** The person, through a Vault process on a device they control. No server, host, registry or platform holds person-role private material; a platform keystore may hold the *unlock secret* where a Gate P3 analysis accepts it — never the keys as the canonical form.
2. **Which devices can read which domain?** Custody changes nothing here: readership comes from domain grants and envelopes (ADR 0077/0078); this ADR only decides where the reader's private half lives.
3. **What can a server see?** Public key records, delegations, lifecycle statements — the ADR 0079 public surface. The host additionally sees nothing: no keyfile, no unlock secret, no export, under any path it stores or backs up.
4. **What can a relay see?** Nothing; Vault custody is device-local. Exports travel only where the person carries them.
5. **What happens after device loss?** A lost secondary device is ADR 0079 lifecycle work: the root (from the primary Vault or its restored export) signs the revocation; ADR 0078 rotation handles domain impact. A lost *primary* Vault without an export is identity loss — stated as the design's honest consequence, and the reason creation ends with an export prompt (V6).
6. **What happens after relationship revocation?** Not a custody question; unchanged from ADR 0079.
7. **How does backup restore work?** The encrypted export is the backup unit and restores capability, not authority: lifecycle state reconciles from signed records toward the freshest statement (I9), so restoring an old Vault never silently undoes a revocation (V9).
8. **How does deletion interact with protected payloads?** Destroying every keyfile and export of an identity is the person's own irreversible act — effectively crypto-shredding their identity's future. It deletes no history and unverifies no past signature (ADR 0033: revocation and deletion are never erasure of the record).

## Required properties

- **V1 — The Vault boundary is exclusive.** Person-role private keys exist only inside a Vault process on a device the person controls. The Foundation host process, its data directory, its database, its backups, and every browser context are structurally excluded custody locations — the ADR 0079 I7 floor sharpened to *disjoint paths*: no host data or backup scope may even contain a Vault custody path.
- **V2 — At rest means encrypted, always.** The canonical at-rest form is the `pico.vault.keyfile.v1` family. A plaintext person-role private key on disk is a defect in every environment — production, development and test fixtures alike (fixtures use the ADR 0055 placeholders, never real material).
- **V3 — One at-rest format, many unlock paths.** The passphrase-derived key is the universal floor. A platform keystore may hold the unlock secret so the person types nothing — as an additive, per-platform decision with its own honest analysis (Gate P3). Hardware-backed keys are a future suite (ADR 0079 I2), not a variant of this format. The format never forks per platform.
- **V4 — The process boundary is the custody boundary, and it never signs blind.** Consumers submit canonical bytes and receive detached signatures or unwrap results; private key bytes cross the boundary in exactly one form — the explicit encrypted export. The Vault signs only inputs beginning with a recognized versioned family label (the I3 discipline turned into an agent rule) and refuses everything else.
- **V5 — Root minimization.** The identity root operates in exactly one primary Vault; every other device runs on delegated device keys (I8), never on a root copy. Encrypted exports are backups, not concurrent custody: the design neither supports nor reconciles a root active in two Vaults, and file copying cannot be technically prevented — the supported model is stated instead, with divergence bounded by I9 ordering.
- **V6 — Creation is local, self-contained and export-prompting.** Keys are generated in the Vault from the OS CSPRNG with no network dependency; the first device delegation is signed at creation; and the creation flow immediately offers the encrypted export — because under V8 and the absent recovery path, an un-exported primary Vault is one device failure away from identity loss.
- **V7 — Unlock is explicit and bounded.** Unlock requires the unlock secret and is never ambient; unlocked material lives in guarded memory best-effort, with zeroization on lock, auto-lock on idle and an explicit lock operation. The chosen runtime's real memory-hygiene limits (GC copies, swap, hibernation) are documented at Gate P2, not assumed away.
- **V8 — Export is encrypted or absent.** The only key-material output is the keyfile-family encrypted export. No seed phrase, no plaintext dump, no raw-key QR. A human-memorable recovery encoding would be recovery work (ADR 0033), not custody work, and deliberately does not exist here.
- **V9 — Custody artifacts carry keys, never authority.** Keyfiles and exports contain private material and nothing lifecycle-shaped. Verifiers consume signed delegation and revocation records (I8/I9); restoring any Vault state therefore restores the ability to sign, never a rollback of what has been signed.
- **V10 — No ambient unlock.** An OS login by itself, a browser session, a Foundation operator session, host reachability, Move-In Codes and bootstrap codes neither unlock a Vault nor substitute for its secret (ADR 0079 I10 applied to custody). Where a platform keystore gates the unlock secret behind the platform's own authentication, that is a named Gate P3 decision per platform — never a silent default.

## Decision

### The Vault is software on the person's device — and nothing that exists today

The Pico Vault (ADR 0026; the Full Client custody role of ADR 0015) is a dedicated local process on a device the person controls. The first implementable shape may be minimal — a local CLI/agent is acceptable — but the role assignment is strict: the browser dashboard is a Pico Surface and never holds person keys; the Foundation host is infrastructure and never holds person keys (ADR 0024), even when Vault and host share hardware — separate process, separate custody paths, outside every host data and backup scope (V1).

Stated for the current deployment because the temptation is concrete: the Home Assistant add-on and the dashboard contain **no Vault-capable surface**, must not fake one, and must not grow one by convenience. Person identity waits for the Vault tool; ADR 0080's precondition is dischargeable only when it exists (Gate P2).

### The keyfile: `pico.vault.keyfile.v1`

One canonical encrypted at-rest format, from the toolkit already in the tree and the age pattern ADR 0016 points at:

- **KDF**: Argon2id (libsodium `crypto_pwhash`) derives the file key from the passphrase; algorithm, opslimit, memlimit and salt live in the header, so files are self-describing and parameters upgrade on rewrite (the ADR 0076 `needs_rehash` idea, applied to a file format). The default is the **moderate** cost class, not interactive: a Vault runs on the person's own device where unlock is a local, user-initiated act — there is no unauthenticated network surface to protect from memory exhaustion (the inverse of ADR 0076's appliance rationale), and the keyfile's realistic attacker is offline grinding, which is exactly what higher memory cost punishes.
- **AEAD**: XChaCha20-Poly1305 (`crypto_aead_xchacha20poly1305_ietf`, the ADR 0071 cipher family) over the private-key payload, with the complete labeled header — family label first, then suite, key role, KDF parameters, salt, nonce — bound as associated data in an I3 layout. A tampered header (swapped role, downgraded KDF parameters, foreign suite) fails authentication, not review.
- **Payload**: private key material for one key role under `pico.suite.id.v1`. Whether a file holds one keypair (the ADR 0072 one-file-per-key pattern) or a per-identity bundle is a Gate P1 layout decision; the vectors decide it, not convenience.

Authoritative accept/reject vectors for the family are Gate P1 work inside the ADR 0079 G1 program — wrong label, tampered header fields, wrong passphrase, truncation, parameter downgrade all get negative vectors before the format carries a single real key.

### Platform keystores hold the unlock secret, never the format

Where a platform keystore exists, it may store the file key (or a wrapping of it) so that unlock needs no typed passphrase. The keyfile stays canonical: one format to specify, test, vector-cover and carry across platforms; the keystore is an unlock path, not a storage backend. Each platform integration is its own Gate P3 decision with an honest analysis of what that keystore actually defends against on that platform — a Linux Secret Service unlocked with login is a different promise than an iOS Keychain entry behind biometrics, and the difference is written down, not averaged. The passphrase floor always remains available (V3), so no platform integration ever becomes load-bearing for the format.

### The agent boundary and label-checked signing

The Vault process is the signer and unwrapper. Local consumers — future Pico apps, the claim ceremony's client side (ADR 0080), envelope handling (ADR 0078) — submit canonical bytes and receive detached signatures or unwrapped payloads. Two structural rules make the boundary worth having:

1. **No export API exists** beyond the explicit encrypted export (V8). There is no "give me the private key" operation to misuse, in any mode, including debugging.
2. **The Vault never signs blind** (V4): every signing input must begin with a versioned family label the Vault recognizes under the I3 discipline. A compromised consumer can still request signatures within recognized families — endpoint compromise is bounded, not solved — but it cannot turn the Vault into a raw signing oracle for foreign protocols or unlabeled bytes. Per-family approval semantics (asking the person before high-consequence families like founding records or revocations) are a UX layer deliberately left to the Vault runtime, above this floor, never below it.

### Root and device keys: the custody asymmetry

The identity root signs rarely and constitutionally — delegations, lifecycle statements, founding records (ADR 0079/0080). Its custody is therefore biased toward loss-resistance and minimal exposure: one primary Vault (V5), encrypted exports as backups, and no requirement to be online or co-located with daily operations. Device keys sign and decrypt routinely; they live in the Vault of the device that uses them, are individually revocable (I9), and their loss is an inconvenience by design, never a catastrophe — re-delegate and move on (ADR 0033's lost-device posture, realized by custody choices).

### Loss is real, and the design says so

There is no recovery path in this ADR, and none may be improvised around it: no security questions, no email reset, no host-assisted escrow, no cloud copy — each would be a quiet second root of identity (the ADR 0033 rule; the ADR 0076 no-backdoor stance applied to identity). A forgotten passphrase or a destroyed un-exported primary Vault means the identity's future is gone; history stays verifiable (ADR 0033), relationships need re-establishment under a future replacement flow. Pico prefers visible loss over hidden impersonation — ADR 0033 already chose this; custody inherits it and mitigates the honest way: creation-time export prompting (V6) and, later, reviewed recovery designs in their own ADR.

## Ordering gates

1. **Gate P1 — Keyfile layout and authoritative vectors.** The `pico.vault.keyfile.v1` labeled layout (header fields, AAD binding, bundle-vs-per-key decision) with ADR 0073-style accept/reject vectors, joined into the ADR 0079 G1 vector program: wrong-label, tampered-header, role-swap, suite-swap, KDF-parameter-downgrade, wrong-passphrase and truncation negatives before any real key exists.
2. **Gate P2 — Minimal Vault runtime under custody tests.** Create, unlock, lock, label-checked sign, unwrap, encrypted export — with tests binding V1 (path separation from host scopes), V2 (no plaintext anywhere, including temp files), V4 (no export API; unknown labels refused), V7 (auto-lock; documented memory-hygiene limits of the chosen runtime) and the ADR 0072 permission pattern for custody files. **This gate discharges ADR 0079 G2 for the person role**; together with 0079 G1/G3 it makes ADR 0078 R1 and the ADR 0080 precondition dischargeable.
3. **Gate P3 — Platform keystore integrations.** Per platform, additive to the keyfile, each with its own written analysis of what the keystore protects against there, and with the passphrase floor kept intact.

## Non-goals

This ADR does not define or implement:

- any recovery: social recovery, quorum schemes, memorable encodings, identity replacement continuity (ADR 0033 future work)
- passkey or hardware-backed identity (a future suite under ADR 0079 I2, with its own custody analysis)
- key synchronization or multi-device root custody (V5 forbids it by default; a future ADR would have to design reconciliation first)
- the Vault's product form, GUI, approval UX or local IPC details beyond the boundary rules (Gate P2 territory)
- multi-person shared Vaults or family-device semantics
- secure-input hardening, OS hardening guidance or enterprise HSM support
- any change to the Foundation host, operator auth (ADR 0075/0076) or host-role custody (ADR 0080 M2)
- any loosening of the ADR 0051/0055 fixture fences before ADR 0079 G1 vectors exist

## Open questions

- **Passphrase policy and UX**: minimum-strength guidance, zxcvbn-style feedback, and how the creation flow teaches the loss rule without terrifying people — Vault runtime work above the custody floor.
- **Bundle versus per-key files** (Gate P1): one keyfile per identity with roles inside, or the ADR 0072 one-file-per-key pattern; the vector families decide.
- **Auto-lock defaults** (V7): idle thresholds, lock-on-suspend, lock-on-screen-lock — per platform, at Gate P2/P3.
- **Local consumer transport** for the agent boundary (unix socket permissions, peer credentials, per-app authorization) — Gate P2, with the V4/V10 rules fixed here.
- **Paper/offline backup of the *encrypted* export** (printed QR of ciphertext with the passphrase held separately) — allowed in principle by V8; encoding and UX undecided.
- **Whether the first Vault ships as CLI, daemon or app**, and on which platform first — product sequencing, not custody.
- **Argon2id parameter defaults over time**: when moderate stops being enough, and how rewrite-on-unlock upgrades interact with exports that were made under older parameters.

## Consequences

Positive:

- ADR 0079 G2's person-role fence gets its dedicated ADR: the identity strand now has a complete direction from primitives (0079) through host-role custody and ceremony (0080) to person-role custody (this ADR), all from the same libsodium toolkit with zero new primitives
- one canonical, vector-covered at-rest format instead of per-platform key storage drift; platform keystores add convenience without forking the format
- the blind-signing oracle is closed structurally (label-checked signing), extending the I3 label discipline from verification into the agent boundary
- browser and host custody are excluded by structure, not policy — the two most tempting shortcuts (keys in the dashboard, keys on the add-on) are named defects
- loss stays visible and honest: no hidden recovery channel exists to become tomorrow's backdoor, and creation-time export prompting mitigates the real risk the honest way

Negative:

- the largest cost is stated plainly: a **new software component** (the Vault) must exist before any real person key, any real reader key (ADR 0078 R1) and any claim (ADR 0080) — accepted; the alternative was generating person identities on the host, which inverts the entire ownership model
- no recovery means real, irreversible loss for people who skip the export — the price of refusing backdoors until a reviewed recovery ADR exists
- passphrase UX burden lands on a local-first product, softened only where Gate P3 platform integrations are honest
- a GC-runtime Vault cannot promise complete memory erasure; the limit is documented rather than solved
- root copying cannot be technically prevented — V5 is a supported-model rule with stated divergence risks, not an enforcement mechanism
- per-platform keystore analyses are real, unglamorous work that cannot be averaged into one claim

## Relationship to other ADRs

- Discharges the ADR `0079` G2 requirement for the person role at the direction level (the runtime discharge is Gate P2); inherits and sharpens I7 (disjoint custody paths), applies I3 as the agent's label-checked-signing rule, and relies on I8/I9 for the custody-carries-no-authority property (V9).
- Makes the ADR `0080` precondition concrete: the claimant-side holder of person keys is the Gate P2 Vault; the founding record's identity signature comes from behind this custody boundary.
- Supplies the custody story for ADR `0078` R1's reader keys: the device X25519 private halves live in the device's Vault, unwrap happens behind the agent boundary.
- Constrained by ADR `0016` and built from its allowed directions: libsodium Argon2id + XChaCha20-Poly1305 (age-style protection), platform keystores as unlock paths, CSPRNG generation; passkeys/hardware stay future suites.
- Realizes the ADR `0015`/`0026` Pico Vault role custody-wise (Full Clients own keys and backups; Light Clients/Surfaces never do) and the ADR `0029` rule that private identity material never becomes host state.
- Keeps the ADR `0033` recovery boundary fully intact and adopts its posture: visible loss over hidden impersonation; lost-device handling stays lifecycle work; nothing here becomes a recovery mechanism.
- Kin to ADR `0072` (file custody, permission pattern, backup separation) with the scope inverted: host key custody excludes files from host backups — Vault custody excludes the host entirely (V1).
- Leaves ADR `0075`/`0076` untouched: operator sessions and Vault unlock are unrelated acts with no ambient bridge (V10, A11/I10 family); the ADR `0051`/`0055` fixture fences stay exactly as strict until ADR 0079 G1 vectors exist.
