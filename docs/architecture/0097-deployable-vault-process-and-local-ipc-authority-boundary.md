# 0097 - Deployable Vault Process and Local IPC Authority Boundary

## Status

Accepted as the product-form decision and local process/IPC authority
direction for the first deployable Pico Vault, with the first process slice
implemented. The decision, taken explicitly with the product owner on
2026-07-28: the first Vault ships as a **CLI plus a local daemon** on a
person-controlled computer, **Linux first**, with macOS as the named second
POSIX target and Windows deferred. Native desktop and mobile apps are
sequenced later as shells and delegated devices over the same contract, never
as a replacement for it. Browser contexts and the Home Assistant add-on
remain structurally excluded custody locations (ADR 0081 V1).

The implemented slice is `@pico/vault-daemon` (`apps/vault-daemon`): a
foreground daemon that owns the only `@pico/vault` sessions in deployment
shape, a pathname Unix-socket boundary with private directory modes, a strict
framed wire contract with named request families (`hello`, `status`,
`unlock`, `lock`, `sign`), hold-connection unlock with idle/duration/suspend/
rollback locking, unlock throttling, content-free audit and startup custody
path separation, plus the `pico-vault` CLI. It is not a network API, platform
keystore integration, approval UX, recovery path or Pico Link surface.

## Context

Every Vault capability so far — keyfiles (ADR 0081), reader-custody
authority, envelopes and rotation (ADR 0086/0088), checkpoint signing (ADR
0085), sealed sync batches (ADR 0089) and the one-shot reader access session
(ADR 0096) — runs as a library inside the consumer's own process. That was
deliberate while the crypto floor stabilized, but it leaves the custody
promise structurally unfinished: whichever process links `@pico/vault` holds
raw private keys in its own memory, the ADR 0096 unlock port has no
deployable provider, and nothing yet enforces V4's agent boundary between a
consumer and the keys it asks to use.

ADR 0081 fixed what the boundary must be (exclusive process custody,
label-checked signing, no blind signatures, no raw export, explicit bounded
unlock) and left two things open as product sequencing: the Vault's first
product form and its first platform. The temptation it warned about is now
concrete on both sides: the Foundation host and dashboard must not grow a
Vault by convenience, and the Vault must not stay a library forever, because
a library cannot refuse its host process anything.

This ADR records the product decision and turns the ADR 0081 agent pattern
into a deployable process contract: which process holds keys, what crosses
the IPC boundary, who may connect, what unlocks, and when it locks.

## Scope

Covers: the first Vault product form and target platform; the daemon process
model and single-instance rule; the Unix-socket transport and its
peer-authorization floor; the framed wire contract and its named request
families; per-connection authority; the unlock/approval, hold, idle,
duration, suspend, rollback, crash and restart lifecycle; unlock throttling;
content-free audit; custody paths, permissions and backup exclusion; and the
threat model for compromised local consumers.

Does not cover: any network or remote surface, Pico Link or Relay transport,
platform-keystore unlock (ADR 0081 Gate P3), per-request approval UX,
recovery (ADR 0033 boundary unchanged), packaging/autostart (systemd or
launchd units), Windows or macOS implementations, multi-person or shared
Vaults, promotion of the wire contract to a public protocol surface, or any
change to the `@pico/vault` library crypto.

## Threat model

Protected assets: the unlocked `PicoVaultSession` private key material inside
the daemon process, the keyfiles under the Vault home, the passphrase in
transit during unlock, and the authority to obtain signatures at all.

| Attacker | Capability | Posture |
|---|---|---|
| Other local OS users | Can see the filesystem and try to connect. | Structurally excluded: the socket lives in a `0700` run directory under the `0700` Vault home; pathname sockets are connect-authorized by directory permissions, which the OS enforces. Abstract-namespace sockets are forbidden because they bypass exactly this. |
| Compromised same-user local consumer | Can connect, speak the protocol, submit requests while a session is unlocked, guess passphrases through the unlock family, and flood connections or frames. | Bounded, not solved (the ADR 0081 endpoint honesty). It can never read keys or the passphrase back, never exports key material, and can only request label-checked families the Vault already recognizes; unlock guessing meets Argon2id cost plus daemon throttling and audit; frames, connection counts and in-flight requests are capped. During an unlock window it can request signatures within recognized families — per-request approval is the named later tightening, above this floor, and ADR 0099 now implements it for the authority-creating families. |
| Malware with the person's uid reading daemon memory | ptrace, /proc/pid/mem, core dumps. | Endpoint compromise wins — stated. The daemon narrows exposure to one process instead of every consumer, and sessions are bounded (idle, duration, suspend, hold) so the window is short, but a GC runtime still cannot promise erasure (ADR 0081 V7 limits restated). |
| Foundation host process or backup sweep | Reads Foundation data and backup scopes. | Structurally void: startup refuses a Vault home (keyfiles and socket) inside the Foundation data or backup scope via `assertVaultCustodyPathSeparation` — V1's disjoint-paths rule executed at boot, not policied. |
| Keyfile thief | Steals disk or synced directory. | ADR 0081 posture unchanged: keyfiles are Argon2id/XChaCha20-Poly1305 encrypted; the socket is not a secret; nothing session-shaped is ever persisted. |
| Passphrase interception | Reads the unlock frame or logs. | The passphrase crosses exactly one boundary, once per unlock: from the person's own CLI prompt (TTY echo off) over the same-uid socket into the daemon. It is never logged, never audited, never returned, and never part of any consumer-facing family. JavaScript strings cannot be zeroized — stated, as in ADR 0081/0096, not assumed away. |
| Crash, suspend, restart | Daemon dies or machine sleeps. | Sessions are memory-only; every restart starts locked; there is no re-unlock without the person (no cached unlock secret exists in v1). Suspend is detected by a wall-versus-monotonic gap and locks; a stale socket is taken over only after a live-probe proves it dead. |

## Decision

### The first Vault is a CLI plus a local daemon, Linux first

The first deployable Pico Vault is a local daemon plus a CLI on a computer
the person controls, in the ssh-agent/gpg-agent tradition that ADR 0081
already named acceptable. The deciding reasons, recorded:

1. **The IPC authority boundary is the deliverable.** Only a daemon with
   consumers in foreign processes forces the contract this ADR exists to
   fix — named request families, peer authorization, per-connection
   authority. Inside a native app the same boundary would be an internal
   library seam, and extracting it later would produce exactly the wrong
   first process contract this ADR is meant to prevent.
2. **The tested custody runtime ships unchanged.** `@pico/vault` runs as-is
   in a Node daemon. Every native-app route either embeds a browser context
   near the keys (Electron — against the V1 posture and a large supply
   chain), smuggles the daemon back in as a sidecar, or re-implements the
   crypto outside the vector-bound reference before any conformance runner
   exists.
3. **Consumers only exist here.** The claim ceremony, reader-sync runs and
   Foundation-adjacent tooling are Node processes on desktops and servers.
   Mobile has no consumer stack, no cross-app local IPC and no daemon
   backgrounding; a mobile-first Vault would immediately demand the network
   API this ADR refuses.
4. **The path forward stays open.** The wire contract is UI-shell-agnostic:
   a future native desktop app is a client of the same daemon, and mobile
   arrives later as a delegated device (device keys under Pico Link
   ceremonies), never as the first home of the identity root — V5 root
   minimization applied to product sequencing.

First platform: **Linux** (the development, CI and self-hosting reality),
using pathname Unix stream sockets. macOS is the named second target and
shares the same socket model; Windows requires a named-pipe transport with a
different peer-authorization story and is deferred to its own gate. Neither
is claimed until implemented and tested.

### Process model and single instance

The daemon serves exactly one person and one Vault home per process, running
under the person's own uid. The Vault home layout is fixed:

```text
$PICO_VAULT_HOME/            0700  (default ~/.pico/vault)
  keyfiles/                  0700  one pico.vault.keyfile.v1 file per role key, 0600
  run/                       0700  runtime state
  run/daemon.sock            0600  pathname Unix stream socket
```

Startup fails closed on: a Vault home, keyfiles directory or run directory
that is not owned by the daemon's uid with mode `0700`; a keyfile that is not
`0600`; a Vault home or socket inside the Foundation data or backup scope
(`vault_path_inside_foundation_scope`); a socket path longer than the
portable `sun_path` bound (`socket_path_too_long`); or a live daemon already
serving the same home (`daemon_already_running`). Stale sockets are removed
only after a connect probe proves no daemon answers. Daemon start is an
explicit act (`pico-vault daemon`, foreground); nothing autostarts in v1.

Exactly one daemon instance may serve a Vault home at a time, and the daemon
is the only process that opens keyfiles in deployment shape: consumers hold a
socket, never a session.

### Transport and peer authorization floor

The transport is a pathname `SOCK_STREAM` Unix domain socket inside the
`0700` run directory. Connect authorization is the OS directory-permission
check: only the person's uid (and root) can traverse `run/`. Abstract-
namespace sockets (leading NUL) are forbidden — they have no path and no
permission check. TCP of any kind, including loopback, is forbidden as a
substitute.

`SO_PEERCRED`-based per-process identification (pid/uid enrichment of audit,
per-binary authority) is a named future gate: Node core does not expose it,
and adopting a native binding is its own supply-chain decision. Until then,
the authority model below deliberately grants nothing that same-uid malware
could not already take by other means — the floor is honest, not oversold.

### Wire contract: named request families only

Frames are `U32BE(length) || UTF-8 JSON`, with a hard frame cap of 128 KiB.
Each connection speaks strict request/response: exactly one request in
flight; a second frame before the response is a protocol violation and
closes the connection. Every request carries a versioned `family` label and a
client `requestId`; every response is labeled
`pico.vault.daemon.response.v1`, echoes the `requestId` and is either
`ok: true` with a family-specific result or `ok: false` with a stable
`reason`. Unknown families, malformed JSON, oversized frames, unexpected
fields and out-of-order requests fail with named reasons and close the
connection — the V4 label discipline extended from signing inputs to the
wire itself.

The v1 request families:

| Family | Purpose | Result crosses the boundary |
|---|---|---|
| `pico.vault.daemon.hello.v1` | mandatory first request; exact `protocolVersion: 1` match | protocol version, daemon version, lock state |
| `pico.vault.daemon.status.v1` | public inventory | lock state plus per-keyfile role and fingerprint (public header metadata; the public key sits inside the encrypted payload and returns only with unlock and sign results) |
| `pico.vault.daemon.unlock.v1` | explicit person-initiated unlock of one role keyfile; binds the session to this connection | public session metadata and the effective idle/duration bounds |
| `pico.vault.daemon.lock.v1` | explicit lock, allowed from any connection | confirmation |
| `pico.vault.daemon.sign.v1` | detached signature over canonical labeled bytes, allowed from any connection while unlocked | the signature and public signer metadata |

Only named request families, public key metadata and required crypto results
cross the boundary. What structurally never crosses outward: private key
bytes in any encoding, passphrases, raw KEKs/DEKs, keyfile contents — v1 has
**no export family at all**, not even the encrypted one; the encrypted
keyfile is a local file the person already owns, and the CLI reads it from
disk, not from the wire. What never crosses inward except on the person's
own unlock: a passphrase. Unlock of `device_key_agreement` keyfiles is
refused (`key_role_not_served`) until a wire family exists that such a
session could serve; an unlocked-but-unusable window would be pure exposure.

The wire contract is a **local, private contract** of this daemon. It is not
a `docs/protocol` public surface, carries no fixtures, no compatibility or
conformance claims, and may change until a later ADR explicitly promotes it.

### Unlock, hold and the lock lifecycle

Unlock is explicit and singular: the person runs `pico-vault unlock`, which
prompts the passphrase on the person's own TTY with echo off and submits it
once over the socket. Daemon start does not unlock. OS login does not
unlock. A Foundation operator session does not unlock. Nothing re-unlocks
silently — the daemon holds no passphrase, no derived unlock secret and no
session state across restarts (ADR 0081 V10 applied to the process).

At most one session is unlocked per daemon at a time (`already_unlocked`
otherwise), and every unlocked session is **hold-bound**: it belongs to the
connection that unlocked it, and the daemon locks immediately when that
connection closes — closing the terminal is locking, a control the person
can see and touch. While the hold connection lives, other same-uid
connections may use `sign` (that is the consumer story) and may always
`lock`; locking is never privileged.

A session locks on the first of: explicit `lock` from any connection; hold
connection close; the `@pico/vault` idle auto-lock (default and ceiling five
minutes — deployments may configure lower, never higher); the maximum unlock
duration (default and ceiling fifteen minutes, lower-only likewise) checked
against both the monotonic and wall clocks; a detected suspend (wall clock
advancing more than 45 seconds beyond the monotonic clock between checks); a
wall-clock rollback; daemon shutdown (SIGINT/SIGTERM lock, unlink the
socket, exit); or any unlock-path error. Lifecycle checks run on every
request admission and on an internal sweep tick, so a quiet daemon still
locks on time. Restart recovery is trivial by construction: there is nothing
to recover — the daemon comes back locked.

Approval in v1 **is** the unlock act: possession of the Vault home, the
passphrase and the held terminal, for a bounded window. Per-request and
per-family approval semantics (asking before high-consequence families such
as founding records) remain the named UX layer above this floor, exactly
where ADR 0081 put them — never below it.

### Throttling and audit

Failed unlocks are throttled: after five failed attempts within a rolling
sixty-second window, further unlock attempts fail pre-KDF with
`unlock_throttled` until the window drains. Argon2id moderate cost applies
to every real attempt on top. The counter is in-memory; a crash resets it
and also resets to locked, which is the stronger state.

The daemon emits single-line, content-free audit records (JSON to stderr in
v1): family, outcome, stable reason, public role/fingerprint metadata and
timestamps — never passphrases, key bytes, signature inputs or signatures.
A durable audit store is future work; v1 audit is operational visibility,
not evidence.

## Gates

- **D1 — Product form and platform decision: Done.** CLI plus local daemon,
  Linux first, macOS second POSIX target, Windows deferred; native shells
  and mobile delegated devices sequenced behind the same contract; recorded
  in this ADR with the rejected alternatives and reasons.
- **D2 — Private socket boundary: Done.** `0700` home/keyfiles/run
  directories, `0600` socket and keyfiles, ownership checks, pathname-only
  sockets, `sun_path` bound, stale-socket probe takeover, single instance,
  and startup path separation from Foundation data/backup scopes.
- **D3 — Named-family wire contract: Done.** Framed strict JSON with frame
  cap, mandatory versioned hello, one in-flight request, unknown-family/
  malformed/oversize rejection with named reasons and connection close, and
  the five v1 families with public-metadata-and-results-only responses.
- **D4 — Unlock/lock lifecycle: Done.** Hold-bound single session, explicit
  unlock only, `key_role_not_served` for unservable roles, idle and
  duration ceilings with lower-only configuration, suspend and rollback
  detection, lock on disconnect/shutdown, restart-starts-locked, and
  unlock throttling with content-free audit.
- **D5 — CLI: Done.** `pico-vault daemon | create | status | unlock | lock |
  sign` with TTY no-echo passphrase prompts, creation-time encrypted-export
  reminder (ADR 0081 V6) and same-uid client transport.
- **D6 — Lifecycle and boundary tests: Done.** Vitest coverage with real
  crypto for permissions, path separation, stale/second-instance handling,
  hello/protocol negatives, unlock/hold/disconnect/idle/duration/suspend/
  rollback locking, throttling, label-check pass-through, signature
  verification, restart-locked and passphrase-free audit.
- **D7 — Future (each its own decision):** `SO_PEERCRED` audit enrichment
  and per-client authority via a vetted native binding; per-request
  approval; ADR 0081 Gate P3 platform-keystore unlock behind the same
  seam; macOS verification and Windows named-pipe transport;
  packaging/autostart units; migration of the remaining ceremonies (claim,
  checkpoint publication, envelope issuance, rotation); any promotion of
  the wire contract toward a public surface. **ADR 0098 discharges the
  reader-sync part**: it adds the reader-access lease families, supplies
  the first real consumer and lifts the `device_key_agreement`
  `key_role_not_served` refusal recorded above. **ADR 0099 discharges
  per-request approval** for the authority-creating families and enforces
  the one-request-in-flight rule this contract always implied.

## Non-goals

- any network, remote or Relay reachability, and any Pico Link claim;
- Foundation, dashboard or add-on custody of person keys, in any mode;
- cloud escrow, account recovery, seed phrases or any recovery mechanism;
- platform keystore, secure enclave, biometric or OS-credential unlock;
- background/auto-started daemons, session persistence or cached unlock;
- multi-person daemons, shared Vaults or per-client authorization tiers;
- protocol fixtures, conformance or compatibility claims for the wire
  contract;
- Windows and macOS support claims before their gates run.

## Consequences

Positive:

- the ADR 0081 agent boundary finally exists as a process: consumers hold a
  socket and receive results; raw keys stop materializing in consumer
  memory the moment consumers migrate to the daemon;
- the custody contract (families, peer floor, lifecycle) is fixed before
  any UI exists, so future shells inherit it instead of shaping it;
- every lock path is an observable, tested behavior rather than library
  advice, and restart is fail-closed by construction;
- the product sequencing is recorded: native desktop as shell, mobile as
  delegated device, both behind the same contract.

Negative and residual:

- terminal approval is coarse: any same-uid process can request recognized
  signatures during an unlock window — bounded by labels, throttles and
  short windows, honestly not solved until per-request approval;
- the same-uid floor cannot distinguish clients until a `SO_PEERCRED`
  binding is adopted; audit names connections, not binaries;
- a GC runtime still cannot promise memory erasure, and JS passphrase
  strings remain non-zeroizable — inherited limits, restated;
- the person carries daemon operation (start, unlock, hold) without UX
  polish; that is the price of contract-first sequencing;
- Linux-only verification for now; macOS and Windows remain claims-free
  until their gates.

## Relationship to other ADRs

- Executes the ADR `0081` decision layer above the custody floor: V1
  (exclusive boundary, disjoint paths at startup), V4 (label-checked
  signing now behind a wire), V7/V10 (explicit bounded unlock, no ambient
  unlock) become process behavior; the open product-form question closes.
- Provides the deployment answer ADR `0096` deliberately left out: the
  daemon is where a future reader-access unlock port lives; its hold-bound
  window follows 0096's one-shot, verified-lock philosophy at process
  scale.
- Serves the ADR `0079`/`0080` signing families through the existing
  role-scoped label sets, unchanged.
- Keeps ADR `0075`/`0076` separation intact: operator sessions and Vault
  unlock stay unrelated acts on disjoint surfaces.
- Applies ADR `0072`-family file custody patterns (`0700`/`0600`, backup
  exclusion) to the Vault home and socket.
- Leaves ADR `0033` recovery and ADR `0016` primitive boundaries untouched;
  no new cryptography exists at this layer.
- Respects ADR `0024`/`0015`/`0026`: the Core Host and Surfaces gain no
  custody role; the Pico Vault node role gains its first deployable body.

## References

- [ADR 0015](0015-full-clients-light-clients-and-relay.md)
- [ADR 0016](0016-cryptography-boundaries-and-non-goals.md)
- [ADR 0033](0033-key-lifecycle-rotation-revocation-and-recovery.md)
- [ADR 0072](0072-memory-domain-key-storage-and-backup-separation.md)
- [ADR 0079](0079-pico-identity-and-device-key-threat-model-and-primitive-direction.md)
- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0096](0096-reader-access-session-and-vault-lock-lifecycle.md)
