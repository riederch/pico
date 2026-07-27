# 0081 - Pico Vault Person-Role Key Custody Threat Model and Direction

## Status

Accepted as the threat model and custody direction for **person-role private keys** — the Pico Identity Key and the owner's device keys under `pico.suite.id.v1` (ADR 0079): the exclusive Vault boundary (the Foundation host and every browser context are structurally excluded custody locations), one canonical encrypted at-rest format (`pico.vault.keyfile.v1`: Argon2id-derived key, XChaCha20-Poly1305 with an AAD-bound labeled header), the agent-pattern process boundary with label-checked signing, root minimization (one primary Vault, delegated device keys everywhere else), encrypted-or-absent export, and the honest loss rule — behind three gates. **Gate P1 is implemented**: `@pico/protocol` exports the Vault keyfile vocabulary plus a pure `buildPicoVaultKeyfileHeaderAad` builder, and `docs/protocol/fixtures/vault-keyfile/` publishes the authoritative header-AAD vector suite. **Gate P2 is implemented as a minimal package-level runtime in `@pico/vault`**: create/open encrypted person-role keyfiles, Argon2id execution, XChaCha20-Poly1305 seal/open with the P1 header AAD, explicit lock, idle auto-lock, role-scoped label-checked signing, key-agreement sealed-box unwrap, encrypted export only, private file mode writes and Foundation data/backup path separation tests. This discharges ADR 0079 Gate G2 for the person-role custody floor. Remaining: no Vault product shell, local IPC/daemon, approval UX, platform-keystore unlock, storage integration with verified lifecycle, recovery path or compatibility certification; Gate P3 remains platform-keystore work.

## Context

ADR 0079 decided the primitives, canonical byte method and lifecycle direction for identity and device keys, and split custody by role: host-role keys got file custody alongside the claim flow (ADR 0080 Gate M2), and person-role keys got a hard fence — *no person-identity private key is created on the Foundation host until a dedicated custody ADR exists*. ADR 0080 then made that fence the precondition of the entire claim path: the founding record is signed by a person-role identity key, so the Empty Pico Home stays empty until a real holder of person keys exists.

The concept layer has always named that holder. ADR 0015 gives Full Clients the keys-and-backups role; ADR 0026 names it the **Pico Vault**; ADR 0029 requires private identity material to stay under Pico Vaults, platform keystores or hardware-backed storage, never as plaintext host state; ADR 0033 places identity creation inside a Vault or reviewed setup path and fences recovery; ADR 0016 lists the allowed directions this ADR draws from — platform keystores, libsodium primitives, age-style backup protection, passkeys/hardware "where appropriate".

What is missing is the custody decision itself: where person-role private keys live at rest, what unlocks them, what boundary they never cross, and what the first real deployment can honestly offer. The honest starting answer to the last question: **nothing that exists today can hold them** — the Home Assistant add-on is a Core Host (ADR 0024 forbids it the role) and the dashboard is a browser Surface. The first Vault is new software, and this ADR fixes what it must be before anyone builds an expedient substitute.

## Scope

Covers: custody for person-role private keys — at-rest format, unlock model, process boundary, creation, export/backup, root-versus-device-key custody asymmetry, platform-keystore posture, and the loss/recovery honesty boundary.

Does not cover: recovery of any kind (ADR 0033 boundary unchanged), passkey/hardware-backed identity (a future suite per ADR 0079 I2), key synchronization between devices, the Vault's product shape and UX beyond the custody floor, multi-person shared Vaults, host-role custody (ADR 0080 Gate M2), or any change to the Foundation auth layer (ADR 0075/0076). The current runtime slice is a minimal library package, not a deployable Vault daemon, GUI or local-agent transport.

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

Stated for the current deployment because the temptation is concrete: the Home Assistant add-on and the dashboard contain **no Vault-capable surface**, must not fake one, and must not grow one by convenience. The first holder now exists only as the `@pico/vault` library package; that does not make the add-on, Core host or browser dashboard a custody surface. ADR 0080's claimant-side precondition has a minimal holder, but the claim runtime still needs its own founding-record, host-custody and membership gates.

### The keyfile: `pico.vault.keyfile.v1`

One canonical encrypted at-rest format, from the toolkit already in the tree and the age pattern ADR 0016 points at:

- **KDF**: Argon2id (libsodium `crypto_pwhash`) derives the file key from the passphrase; algorithm, opslimit, memlimit and salt live in the header, so files are self-describing and parameters upgrade on rewrite (the ADR 0076 `needs_rehash` idea, applied to a file format). Parameters are bounded on both sides: the moderate class is the floor, and libsodium's own SENSITIVE class (`4` / `1 GiB`) is the ceiling. The ceiling is not a memory-exhaustion defence - the paragraph below still holds - it is a failure-mode bound. These fields are read before the AEAD authenticates the header, so the AAD cannot protect them, and `crypto_pwhash` is a synchronous, non-interruptible call: at the moderate memory cost one pass takes roughly 215 ms, so an unbounded `opsLimit` turns one damaged byte into an unlock that never returns rather than one that fails. Bounded, the worst declared cost is a slow unlock, and anything past it is `kdf_parameter_unsupported`. The default is the **moderate** cost class, not interactive: a Vault runs on the person's own device where unlock is a local, user-initiated act — there is no unauthenticated network surface to protect from memory exhaustion (the inverse of ADR 0076's appliance rationale), and the keyfile's realistic attacker is offline grinding, which is exactly what higher memory cost punishes.
- **AEAD**: XChaCha20-Poly1305 (`crypto_aead_xchacha20poly1305_ietf`, the ADR 0071 cipher family) over the private-key payload, with the complete labeled header — family label first, then suite, key role, KDF parameters, salt, nonce — bound as associated data in an I3 layout. A tampered header (swapped role, downgraded KDF parameters, foreign suite) fails authentication, not review.
- **Payload**: private key material for exactly one key role under `pico.suite.id.v1`. Gate P1 chooses one keyfile per keypair, matching the ADR 0072 one-file-per-key pattern and keeping root, device-signing and device-key-agreement lifecycles independently movable, revocable and exportable.

Authoritative accept/reject vectors for the family are now Gate P1 work inside the ADR 0079 G1 program — wrong label, tampered header fields, wrong passphrase, truncation and parameter downgrade all have negative vectors before the format carries a single real key.

### Gate P1 keyfile header AAD layout and vectors

The Gate P1 builder constructs **only** the authenticated header bytes. It does not derive a file key, encrypt, decrypt, parse private key payloads or authenticate ciphertext. Its purpose is to freeze the bytes that an eventual `crypto_aead_xchacha20poly1305_ietf_*` call must pass as associated data.

Encoding uses the same I3 element rule as ADR 0073/0079:

```text
element(b) = U32BE(len(b)) || b
header_aad = concat(element(field_0), element(field_1), ...)
```

Header AAD elements, in fixed order:

| # | Field | Encoding | Rule |
|---|---|---|---|
| 0 | `format` | ASCII | exactly `pico.vault.keyfile.v1` |
| 1 | `suite` | ASCII | suite label, currently `pico.suite.id.v1`; foreign ASCII suites bind different bytes |
| 2 | `keyRole` | ASCII | one of `pico_identity`, `device_signing`, `device_key_agreement` |
| 3 | `keyFingerprint` | raw bytes from hex | exactly 32 bytes |
| 4 | `kdfAlgorithm` | ASCII | `argon2id` |
| 5 | `kdfProfile` | ASCII | `moderate` |
| 6 | `kdfOpsLimit` | ASCII decimal | minimum `3`, maximum `4` |
| 7 | `kdfMemLimitBytes` | ASCII decimal | minimum `268435456`, maximum `1073741824` |
| 8 | `kdfSalt` | raw bytes from hex | exactly 16 bytes |
| 9 | `aeadAlgorithm` | ASCII | `xchacha20poly1305-ietf` |
| 10 | `aeadNonce` | raw bytes from hex | exactly 24 bytes |

Reject reasons are stable for P1 fixture purposes: `wrong_keyfile_label`, `invalid_vault_key_role`, `invalid_fingerprint_length`, `invalid_kdf_algorithm`, `invalid_kdf_profile`, `kdf_parameter_downgrade`, `kdf_parameter_unsupported`, `invalid_kdf_salt_length`, `invalid_aead_algorithm`, `invalid_aead_nonce_length` and `field_reordering`. Header tampering that preserves a canonical header, such as suite, role or nonce swaps, is represented as `build: accept` with different AAD; the future open operation must then fail authentication because the ciphertext was sealed under the original AAD.

Authoritative accepted header-AAD vectors:

| Case | Len | Header AAD hex |
|---|---:|---|
| `identity-root-moderate` | 214 | `000000157069636f2e7661756c742e6b657966696c652e7631000000107069636f2e73756974652e69642e76310000000d7069636f5f6964656e746974790000002066e6e80bcd9fc83d805ac5f7d9021aa10fb1166671c05ca9148bc92ac6e73616000000086172676f6e326964000000086d6f646572617465000000013300000009323638343335343536000000101010101010101010101010101010101000000016786368616368613230706f6c79313330352d6965746600000018111111111111111111111111111111111111111111111111` |
| `device-signing-moderate` | 215 | `000000157069636f2e7661756c742e6b657966696c652e7631000000107069636f2e73756974652e69642e76310000000e6465766963655f7369676e696e67000000205dba9b41e6f3f034b84d142eeac499f404237f4dd9ff4add17b5f4843e2240b5000000086172676f6e326964000000086d6f646572617465000000013300000009323638343335343536000000102020202020202020202020202020202000000016786368616368613230706f6c79313330352d6965746600000018222222222222222222222222222222222222222222222222` |
| `device-key-agreement-moderate` | 221 | `000000157069636f2e7661756c742e6b657966696c652e7631000000107069636f2e73756974652e69642e7631000000146465766963655f6b65795f61677265656d656e74000000202263a4d54b123d8227780014ec313e7afe88a0f8f880a07026a3f931b098e06a000000086172676f6e326964000000086d6f646572617465000000013300000009323638343335343536000000103030303030303030303030303030303000000016786368616368613230706f6c79313330352d6965746600000018333333333333333333333333333333333333333333333333` |
| `tampered-header-suite-swap` | 214 | `000000157069636f2e7661756c742e6b657966696c652e7631000000107069636f2e73756974652e69642e76320000000d7069636f5f6964656e746974790000002066e6e80bcd9fc83d805ac5f7d9021aa10fb1166671c05ca9148bc92ac6e73616000000086172676f6e326964000000086d6f646572617465000000013300000009323638343335343536000000101010101010101010101010101010101000000016786368616368613230706f6c79313330352d6965746600000018111111111111111111111111111111111111111111111111` |
| `tampered-header-role-swap` | 215 | `000000157069636f2e7661756c742e6b657966696c652e7631000000107069636f2e73756974652e69642e76310000000e6465766963655f7369676e696e670000002066e6e80bcd9fc83d805ac5f7d9021aa10fb1166671c05ca9148bc92ac6e73616000000086172676f6e326964000000086d6f646572617465000000013300000009323638343335343536000000101010101010101010101010101010101000000016786368616368613230706f6c79313330352d6965746600000018111111111111111111111111111111111111111111111111` |
| `tampered-header-nonce-swap` | 214 | `000000157069636f2e7661756c742e6b657966696c652e7631000000107069636f2e73756974652e69642e76310000000d7069636f5f6964656e746974790000002066e6e80bcd9fc83d805ac5f7d9021aa10fb1166671c05ca9148bc92ac6e73616000000086172676f6e326964000000086d6f646572617465000000013300000009323638343335343536000000101010101010101010101010101010101000000016786368616368613230706f6c79313330352d6965746600000018444444444444444444444444444444444444444444444444` |

Reject vectors:

| Case | Expected reason |
|---|---|
| `wrong-label` | `wrong_keyfile_label` |
| `host-role-rejected` | `invalid_vault_key_role` |
| `kdf-parameter-downgrade` | `kdf_parameter_downgrade` |
| `kdf-parameter-unsupported` | `kdf_parameter_unsupported` |
| `field-order-override` | `field_reordering` |
| `invalid-salt-length` | `invalid_kdf_salt_length` |
| `invalid-nonce-length` | `invalid_aead_nonce_length` |
| `invalid-fingerprint-length` | `invalid_fingerprint_length` |

Open-negative fixtures reuse the `identity-root-moderate` header AAD and carry synthetic ciphertext metadata only: `wrong-passphrase` expects `authentication_error` / `wrong_passphrase`, and `truncated-ciphertext` expects `malformed_ciphertext` / `truncated_ciphertext`. These expectations document the open boundary for the vector suite; Gate P2's runtime tests now exercise real open failures in `@pico/vault`, but the fixture suite itself still carries no real keyfiles or private material.

### Gate P2 minimal runtime slice

`@pico/vault` is the first concrete Vault holder. It is deliberately small and package-level:

- `createPicoVaultKeyfile(...)` generates exactly one person-role keypair (`pico_identity`, `device_signing` or `device_key_agreement`) using libsodium, derives a file key with the P1 Argon2id moderate parameters, encrypts a length-prefixed private-key payload with XChaCha20-Poly1305 and binds the complete P1 header AAD.
- `openPicoVaultKeyfile(...)` authenticates/decrypts the keyfile, validates suite, role, key lengths and BLAKE2b-256 key-record fingerprint against the header, and returns a `PicoVaultSession` containing only session metadata plus private material held inside the object.
- `PicoVaultSession.sign(...)` signs only recognized canonical signature-input family labels, scoped by key role, and refuses everything else; key-agreement keys cannot sign at all. An identity key signs the ADR 0079 identity families plus the two ADR 0080 families a claimant produces (`pico.home.claim.v1`, `pico.home.founding.v1`) - without those the Move-In ceremony could not be completed from the only place V1 allows the identity key to live. Host families are absent by construction: host-role keys are not Vault keys.
- `PicoVaultSession.unwrapSealedBox(...)` unwraps libsodium sealed boxes only for `device_key_agreement`; signing keys cannot unwrap.
- `exportEncryptedKeyfile()` and `serializeEncryptedKeyfile()` return only the encrypted keyfile envelope. There is no raw private-key export API.
- `writePicoVaultKeyfile(...)` creates parent directories with private mode intent and writes the keyfile with mode `0600` using exclusive create; `assertPicoVaultKeyfileMode(...)` enforces the ADR 0072-style custody-file mode.
- `assertVaultCustodyPathSeparation(...)` rejects a Vault keyfile path inside the Foundation data or backup scopes, binding V1 as code rather than prose.

Memory hygiene is bounded, not oversold. The runtime zeroizes the derived file key, plaintext payload buffers and session private key on explicit lock, and supports an idle `autoLockAfterMs`. Because this slice runs in JavaScript over `libsodium-wrappers-sumo`, it cannot promise guarded pages, no GC copies, `mlock`, swap/hibernation exclusion or core-dump hardening. Gate P2 is therefore a custody floor and testable boundary, not a hardened endpoint story.

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

1. **Gate P1 — Keyfile layout and authoritative vectors. Done.** The `pico.vault.keyfile.v1` labeled header-AAD layout is fixed with one keyfile per person-role keypair, ADR 0073-style accept/reject vectors and synthetic open-negative metadata. It covers wrong-label, tampered-header, role-swap, suite-swap, KDF-parameter-downgrade, wrong-passphrase and truncation negatives before any real key exists.
2. **Gate P2 — Minimal Vault runtime under custody tests. Done.** `@pico/vault` implements create, unlock/open, lock, label-checked sign, key-agreement unwrap, encrypted export only, private keyfile writes and path separation from Foundation scopes. Tests bind V1 (host/browser exclusion by path separation), V2 (encrypted keyfile envelope, no raw private-key export), V4 (no blind signing; unknown labels refused), V7 (explicit lock, idle auto-lock and documented JS memory-hygiene limits) and the ADR 0072 permission pattern for custody files. **This gate discharges ADR 0079 G2 for the person role**; ADR 0086 consumes it for Vault-only reader-custody KEK creation, owner self-envelope unwrap, per-item DEK wrapping/encryption and exact writer signing. ADR 0088 adds historical/additional-reader sealing, additional-reader unwrap and revocation-coupled fresh KEK generation. The deployable Vault shell and reader transport remain future.
3. **Gate P3 — Platform keystore integrations.** Per platform, additive to the keyfile, each with its own written analysis of what the keystore protects against there, and with the passphrase floor kept intact.

## Non-goals

This ADR does not define or implement:

- any recovery: social recovery, quorum schemes, memorable encodings, identity replacement continuity (ADR 0033 future work)
- passkey or hardware-backed identity (a future suite under ADR 0079 I2, with its own custody analysis)
- key synchronization or multi-device root custody (V5 forbids it by default; a future ADR would have to design reconciliation first)
- the Vault's product form, GUI, approval UX or local IPC details beyond the `@pico/vault` library boundary rules
- multi-person shared Vaults or family-device semantics
- secure-input hardening, OS hardening guidance or enterprise HSM support
- any change to the Foundation host, operator auth (ADR 0075/0076) or host-role custody (ADR 0080 M2)
- any loosening of the ADR 0051/0055 fixture fences beyond the explicitly implemented 0079 G1 and 0081 P1/P2 scopes; a library runtime does not turn draft placeholders into compatibility or production-security claims

## Open questions

- **Passphrase policy and UX**: minimum-strength guidance, zxcvbn-style feedback, and how the creation flow teaches the loss rule without terrifying people — Vault runtime work above the custody floor.
- **Auto-lock defaults** (V7): idle thresholds, lock-on-suspend, lock-on-screen-lock — per platform/product runtime, and alongside Gate P3 where platform keystores are involved.
- **Local consumer transport** for the agent boundary (unix socket permissions, peer credentials, per-app authorization) — future daemon/product work, with the V4/V10 rules fixed here.
- **Paper/offline backup of the *encrypted* export** (printed QR of ciphertext with the passphrase held separately) — allowed in principle by V8; encoding and UX undecided.
- **Whether the first Vault ships as CLI, daemon or app**, and on which platform first — product sequencing, not custody.
- **Argon2id parameter defaults over time**: when moderate stops being enough, and how rewrite-on-unlock upgrades interact with exports that were made under older parameters.

## Consequences

Positive:

- ADR 0079 G2's person-role fence now has both its dedicated ADR and a minimal runtime custody floor: the identity strand has a concrete path from primitives (0079) through host-role custody and ceremony direction (0080) to person-role custody (this ADR), all from the same libsodium toolkit with zero new primitives
- one canonical, vector-covered at-rest header format instead of per-platform key storage drift; platform keystores add convenience without forking the format
- the blind-signing oracle is closed structurally (label-checked signing), extending the I3 label discipline from verification into the agent boundary
- browser and host custody are excluded by structure, not policy — the two most tempting shortcuts (keys in the dashboard, keys on the add-on) are named defects
- loss stays visible and honest: no hidden recovery channel exists to become tomorrow's backdoor, and creation-time export prompting mitigates the real risk the honest way

Negative:

- the largest cost remains stated plainly: a **new software component** (the Vault) must exist before any real person key, any real reader key (ADR 0078 R1) and any claim (ADR 0080) — Gate P2 reduces that to a tested library floor, but a product shell, local transport, approval UX, platform keystore integration and lifecycle machinery still have to exist before this is usable by people
- no recovery means real, irreversible loss for people who skip the export — the price of refusing backdoors until a reviewed recovery ADR exists
- passphrase UX burden lands on a local-first product, softened only where Gate P3 platform integrations are honest
- a GC-runtime Vault cannot promise complete memory erasure; the limit is documented rather than solved
- root copying cannot be technically prevented — V5 is a supported-model rule with stated divergence risks, not an enforcement mechanism
- per-platform keystore analyses are real, unglamorous work that cannot be averaged into one claim

## Relationship to other ADRs

- Discharges the ADR `0079` G2 requirement for the person role at the minimal runtime floor; inherits and sharpens I7 (disjoint custody paths), applies I3 as the agent's label-checked-signing rule, and relies on I8/I9 for the custody-carries-no-authority property (V9).
- Makes the ADR `0080` precondition concrete at the claimant-side holder layer: a founding record's future identity signature can come from behind this custody boundary, while the claim ceremony itself still needs its own layouts, host custody and membership runtime.
- Supplies the custody holder for ADR `0078` R1's reader keys: the device X25519 private halves live in the device's Vault and unwrap stays behind the agent boundary. ADR 0086 proves that boundary end to end for one owner-bootstrap reader-custody domain and exact writer; ADR 0088 adds local additional-reader distribution and rotation without exposing raw keys. Product transport remains future.
- Constrained by ADR `0016` and built from its allowed directions: libsodium Argon2id + XChaCha20-Poly1305 (age-style protection), platform keystores as unlock paths, CSPRNG generation; passkeys/hardware stay future suites.
- Realizes the ADR `0015`/`0026` Pico Vault role custody-wise (Full Clients own keys and backups; Light Clients/Surfaces never do) and the ADR `0029` rule that private identity material never becomes host state.
- Keeps the ADR `0033` recovery boundary fully intact and adopts its posture: visible loss over hidden impersonation; lost-device handling stays lifecycle work; nothing here becomes a recovery mechanism.
- Kin to ADR `0072` (file custody, permission pattern, backup separation) with the scope inverted: host key custody excludes files from host backups — Vault custody excludes the host entirely (V1).
- Leaves ADR `0075`/`0076` untouched: operator sessions and Vault unlock are unrelated acts with no ambient bridge (V10, A11/I10 family); the ADR `0051`/`0055` fixture fences stay strict beyond the implemented ADR 0079 G1 and ADR 0081 P1/P2 scopes until their matching higher-level runtimes exist.
