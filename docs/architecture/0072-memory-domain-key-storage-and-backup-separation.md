# 0072 - Memory Domain Key Storage and Backup Separation

## Status

Accepted as the key-storage design for memory Domain Content Keys on a single Foundation host. It realizes the ADR 0033 lifecycle boundary for this scope and satisfies gate point 2 of the ADR 0071 security-relevance gate (the design exists; implementation stays deferred). It stores no keys yet and implements nothing.

## Context

ADR 0071 decided the memory encryption suite and made key storage a hard requirement: **R6 — KEKs must never live in the SQLite database file and never in the same backup artifact as the ciphertext they protect.** Without R6, crypto-shredding is a false promise: destroying a key that every data backup still contains destroys nothing.

ADR 0033 requires that no single secret or backup artifact become universal recovery authority, and that stale backups must not silently resurrect retired key material.

ADR 0016 allows platform keystores, libsodium primitives and age-style backup protection as reviewed directions.

The real deployment surfaces this design must fit:

- **Home Assistant add-on:** the only persistent volume is `/data`; the database defaults to `/data/pico.sqlite`, SQLite backups to `/data/backups`. Home Assistant add-on backups capture the add-on's `/data` directory — so anything stored under `/data` lands in the same backup artifact as the database **unless the add-on explicitly excludes it** via the Supervisor's backup-exclude mechanism.
- **Bare Node process:** database path from `PICO_DATABASE_PATH` (default: `data/pico.sqlite` unter `apps/core`, zur Laufzeit angelegt), backup directory from `PICO_BACKUP_DIRECTORY` (default `<db-dir>/backups`). The user owns whatever additional backup tooling copies these paths.
- **No platform keystore is reliably available** in the add-on container: no OS keyring, no assumed TPM. The design must work with plain files first and allow stronger anchors later.

## Decision

Memory Domain Content Keys (KEKs) live in a **dedicated file-based key store, separated from the database and from every database backup artifact**:

1. **Location.** A key-store directory configured via `PICO_KEY_STORE_PATH`, defaulting to `<data-dir>/keys` (add-on: `/data/keys`; bare Node: next to, but never inside, the database file or backup directory). One file per KEK version: `domain_<domainId>.v<version>.key`. Directory mode `0700`, files `0600`, owned by the Foundation process user.
2. **Generation.** KEKs are generated locally with the suite CSPRNG (ADR 0071). They are never derived from, transported through or written to environment variables, add-on options, logs or the event log.
3. **R6 is an operational invariant with three enforcement points:**
   - the SQLite backup flow copies database files only, so its artifacts are key-free **by construction**;
   - the Home Assistant add-on **must** exclude the key-store directory from Supervisor backups (the add-on config's backup-exclude mechanism) — this is a release-blocking packaging requirement, not a recommendation;
   - user-managed backups are the user's enforcement point: operator documentation must state plainly that data backups and key backups have to remain separate artifacts.
   The key-store module must also refuse obviously broken configurations at startup (key-store path equal to or inside the database directory's backup path, or the database file's own directory listed as key store), so misconfiguration fails loudly instead of silently violating R6.
4. **Shredding.** A domain crypto-shred deletes **all** KEK version files of that domain (with best-effort file and directory sync) and records an audit event carrying references, never content. Stated honestly: deleting files on modern storage (SSD wear-leveling, copy-on-write filesystems) is best-effort erasure of the local medium. The dependable shred property comes from R6 — backups never contained the keys — and, later, from the optional passphrase layer below.
5. **Restore semantics — availability loses to shred honesty.** Restoring a database backup without the key store leaves every `domain_encrypted` item permanently unreadable. That is the designed behaviour, not a failure mode: it is exactly what makes crypto-shredding true for backup artifacts. The mitigation is never to weaken R6 but to offer **explicit, user-initiated key export**: a passphrase-protected recovery artifact (age-style protection with a memory-hard KDF, per the ADR 0016 allowed directions) that the owner creates deliberately and stores separately from data backups. Consistent with ADR 0033, the export artifact must not become universal recovery: it covers memory domain KEKs only, and holding it plus a data backup must remain a deliberate two-artifact act.
6. **Stronger anchors are additive, not prerequisites.** Where a platform keystore, TPM or hardware token is available, it may later wrap the key files (a keystore-wrapped KEK file replaces a plain one). The file layout is the stable interface; the anchor upgrades underneath it.

## Core rule

```text
Keys and data never share a backup artifact.
A data backup restores ciphertext; only the owner's separate, deliberate key artifact restores readability.
Delete every KEK version of a domain and its backups go dark - that is the point.
```

## Honest protection analysis

What this design does and does not defend, extending the ADR 0071 threat model:

| Attacker | Effect of this design |
|---|---|
| Backup-artifact attacker (cloud/NAS/USB copies of HA backups or `backups/`) | **Defended**: artifacts hold ciphertext and wrapped DEKs, never KEKs. |
| Stale-restore attacker | **Defended in combination**: tombstone reconciliation re-enforces deletions (ADR 0070); a shredded domain stays unreadable because restored artifacts never contained its KEK. |
| Stolen disk / full device image | **Not defended by separation alone**: the live disk holds key files and database together. This honestly stated gap is closed only by the optional passphrase/keystore layer (future step), not by pretending file separation helps here. |
| Compromised running process | Out of scope, as in ADR 0071: a running Foundation process legitimately reaches its keys. |

## Non-goals

This ADR does not define or implement:

- the key-store runtime module or any file I/O
- key rotation mechanics (the versioned filename layout merely leaves room for them; behaviour is ADR 0033 follow-up work)
- the passphrase-protected export/recovery flow and its UX (direction fixed above; its own step)
- identity, device, transport or Pico Link keys (ADR 0029/0033 scope)
- multi-device key distribution or domain membership (direction now scoped by ADR 0078: custody classes on top of this store, with a fail-closed refusal to hold KEK files for reader-custody domains)
- TPM/HSM/keystore integration (allowed later as an additive anchor)
- any change to what backups contain today (the store is still plaintext-at-rest foundation data under ADR 0070/0071)

## Implementation implications

Additive steps, all still behind the remaining ADR 0071 gate point (canonical AD test vectors):

1. Key-store module: create/load/delete KEK version files with the mandated permissions, `PICO_KEY_STORE_PATH` config wiring, and the startup sanity guard against R6-violating paths. (Done: `apps/core/src/key-store.ts` provides `KeyStore` (create/load/list/shred, 0700/0600, strict domain-id validation) and `assertKeyStoreSeparation`, run at `buildApp` startup; `PICO_KEY_STORE_PATH` defaults to `<data-dir>/keys`. Nothing populates the store in production - no encryption yet.)
2. Add-on packaging: exclude the key-store directory from Supervisor backups in the add-on configuration, and document the separation rule and restore semantics in `pico_core/DOCS.md` (release-blocking for any encrypting release). (Done: `pico_core/config.yaml` `backup_exclude` covers `/data/keys`; `pico_core/DOCS.md` documents the separation rule and the unreadable-without-keys restore consequence.)
3. Domain shred operation over the key store, with its audit trail.
4. Passphrase-protected key export (age-style, memory-hard KDF) as a deliberate owner action — its own reviewed step.

## Relationship to other ADRs

Realizes for the memory scope:

- `0033-key-lifecycle-rotation-revocation-and-recovery.md` (storage and backup-separation boundary; rotation/recovery mechanics stay there)
- `0071-memory-content-encryption-threat-model-and-primitive-direction.md` (gate point 2: the key-storage design satisfying R6)

Stays within:

- `0016-cryptography-boundaries-and-non-goals.md` (age-style protection and platform keystores as reviewed directions; no custom schemes)
- `0029-identity-device-home-keys-and-e2e-boundaries.md` (Domain Content Key role only; no identity or host authority)
- `0070-memory-store-encryption-at-rest-and-crypto-shredding-boundary.md` (protection before exposure; foundation-data boundary until the full gate passes)

## Consequences

Positive:

- R6 stops being an aspiration and becomes a concrete layout with named enforcement points per deployment surface
- crypto-shredding gains its dependable half: backup artifacts are key-free by construction, so key destruction genuinely darkens them
- restore behaviour is decided and honest: ciphertext without the separate key artifact stays dark, and the recovery path is a deliberate owner act
- works in the real add-on constraint set (only `/data` persists, no keystore) while leaving room for stronger anchors

Negative:

- stolen-disk protection is explicitly not provided until the passphrase layer exists — the gap is documented rather than papered over
- users gain a new responsibility: losing the key store (without an export) after losing the database means encrypted domains are gone — by design, but it must be communicated bluntly
- the add-on's backup-exclude becomes release-blocking packaging surface that tests and docs must track
