# 0123 - Runtime Key Hygiene and Memory Exposure Limits

## Status

Accepted as an honest statement of what a garbage-collected runtime
can and cannot promise about secrets in memory, plus the cheap
mitigations worth taking; the initiative and its scope were chosen by
the user on 2026-08-01. Z3 is partially implemented for the ADR 0113 C3
Linux companion package; Z1, Z2 and Z4 plus the remaining Z3 artifacts are
open. This ADR is deliberately small: it decides rules and platform
requirements, not new machinery.

## Context

What exists is real discipline, and it is worth stating before the
limits. Key material is handled as byte arrays and zeroed after use -
`@pico/vault` alone carries thirty-six `memzero` sites, ADR 0086
zeroes KEK and DEK after every item operation, and Core's
share-envelope and home-setup paths do the same. The daemon holds
private keys in exactly one process (ADR 0097), sessions are bounded
by idle, duration, suspend detection and hold (ADR 0096/0102), every
restart starts locked, keyfiles and sockets are written 0600 in 0700
directories (ADR 0081 P2), and the key directories are excluded from
every backup artifact (ADR 0072 R6). ADR 0100/0101/0102 moved whole
ceremonies into the daemon precisely so raw keys stop visiting
consumer processes.

What a Node.js runtime cannot do is equally concrete. There is no
`mlock`: every buffer is swappable memory. JavaScript strings are
immutable and cannot be zeroed - the unlock passphrase arrives as one
and stays one, stated in ADR 0081, 0096 and 0097 each time. The
garbage collector copies and compacts without notice, so a zeroed
buffer says nothing about the copies GC made earlier. All crypto runs
through `libsodium-wrappers-sumo`, a WASM build whose linear heap is
ordinary swappable pages. And the daemon's IPC protocol is JSON, so
anything that crosses it - including reader-access payloads and, on
some internal seams, key bytes hex-encoded - exists as an
unzeroizable string on both sides of the socket.

The ADR 0113 C3 Linux companion package now launches with both soft and hard
core-dump limits at zero and proves the inherited limits in a real packaged
process. The add-on entrypoint and future appliance/Vault-service artifacts
do not yet carry that control. Swap remains unregulated (no requirement
anywhere that a generic host encrypts it), as do the claims other documents
might someday make about "wiping" keys.

ADR 0097's threat table already concedes the endgame: malware with
the person's uid reads daemon memory via ptrace or `/proc/pid/mem`,
and endpoint compromise wins. This ADR does not reopen that. Its
subject is the narrower, winnable question: what does key material
cost an attacker who gets a *snapshot* - a core dump, a swap
partition, a stolen disk with a hibernation image - rather than a
live debugger.

## Scope

Covers: rules for how secret bytes are carried, zeroed and logged;
the direction rule for moving operations instead of secrets; platform
requirements on core dumps and swap; and what may be claimed.

Does not cover:

- live-memory attackers with the person's uid - conceded in ADR 0097
  and unchanged here;
- platform-keystore design beyond the implemented ADR 0081 P3 Linux
  desktop tranche; this ADR still governs the transient JavaScript strings
  that integration cannot erase;
- at-rest key protection, custody floors and backup separation,
  already decided in ADR 0072/0081;
- TTY and clipboard exposure of secrets the person types or prints,
  which belong to the surfaces that prompt (ADR 0103/0110/0112).

## Decision

### Erasure is narrowing, never a guarantee - and no one may claim it

The truthful property of every `memzero` in this codebase is: it
shortens the window and reduces the copy count. It does not erase a
secret from a machine, because GC copies, the WASM heap, swap and
dumps are outside its reach. No Pico document, UI text or product
claim may state that keys are "wiped", "erased" or "removed from
memory" as a property. The claimable quantities are the ones the
architecture actually controls: **how many processes** hold a secret
(one), **how long** (bounded sessions, locked restarts), and **how
many copies** the code makes on purpose (as few as it can, zeroed at
last use).

### Secret bytes stay bytes, and every stringification is a named debt

Secret material lives in byte views, is zeroed at last use on every
path including error paths, and never appears in a log line, an error
message, a thrown object, an audit record or a repository fixture.
Two string exceptions exist and both are named rather than implied:
the passphrase, which arrives from the terminal as a string and
cannot be otherwise in this runtime; and the JSON IPC boundary, which
hex-encodes what crosses it. Every site that turns secret bytes into
a string must carry a comment naming this ADR - making the debt
greppable - and new code must not add sites where a byte path exists.
Replacing the JSON frames with binary frames was considered and
declined for now: the protocol is small, proven and testable, and the
string cost on a same-uid 0600 socket is real but bounded, while a
protocol rewrite is exactly the kind of machinery this ADR refuses to
buy with hygiene arguments.

### Operations move to the secret, not the secret to the operation

ADR 0100/0101/0102 established the pattern one ceremony at a time;
this ADR makes it the standing rule: when a flow needs a computation
over private key material, the computation moves into the daemon
rather than the key bytes moving out. A new consumer-side use of raw
key bytes is a design defect unless the daemon boundary genuinely
cannot host the operation, and the remaining inward migrations ADR
0102 already lists (M6's `ceremony.encrypt-item`, the `apps/core`
caller migration) inherit their justification from here: every
migration deletes copies that no discipline could have zeroed.

### The platform floor: no dumps, encrypted swap where Pico owns the image

Two mitigations are cheap and decided. Every packaging artifact that
ships a secret-holding process - the daemon's future service unit
(ADR 0097 D7, ADR 0113 C3), the add-on entrypoint, the appliance
image - disables core dumps for that process (`LimitCORE=0`, or
`ulimit -c 0` before `exec` where no init exists), and no crash
tooling that captures process memory ships with Pico. The ADR 0027
appliance image is required to run with encrypted swap (or none), and
that requirement joins its gate list rather than staying a footnote.
On hosts Pico does not image - a person's desktop, a generic Home
Assistant installation - swap encryption cannot be imposed; the
deployment documentation states it as the operator's lever, and the
absence is an accepted, stated residual, not a silent one.

### Considered and declined: `sodium-native` for locked memory

A native sodium binding could provide `sodium_malloc` guarded, locked
allocations. Declined for now, for three reasons that belong on the
record: it protects only the native heap while JS and WASM copies
continue to exist, so it narrows less than it appears to; it adds a
native module with install scripts to every consumer - precisely the
supply-chain class ADR 0122 names as its least-defended residual; and
the real structural answer is the ADR 0081 P3 platform keystore,
which removes long-lived root secrets from Pico's process memory
entirely instead of locking Pico's copy of them. Revisit alongside
P3, not before.

## Gates

- **Z1 - Carriage rules enforced (binds all key-handling code):**
  secret bytes in byte views, zeroed at last use on success and error
  paths, never in logs, errors, thrown objects, audit records or
  fixtures; every bytes-to-string site carries a comment naming this
  ADR; a review check makes the sites enumerable.
- **Z2 - Inward migration is the default (binds every new ceremony
  and the ADR 0102 M6 backlog):** new flows host key-material
  computations in the daemon; a consumer-side raw-key use requires a
  stated impossibility argument in its ADR or review.
- **Z3 - Platform floor shipped (partially implemented for the ADR 0113 C3
  Linux companion package; still binds the add-on entrypoint and ADR 0027):**
  core dumps disabled in every
  artifact that ships a secret-holding process; encrypted-or-absent
  swap becomes a named requirement gate of the ADR 0027 image;
  deployment docs state the swap lever for hosts Pico does not image.
- **Z4 - The claim ban (binds documentation and product text):** no
  erasure guarantee anywhere; documents state process count, session
  bounds and copy discipline - the quantities that are true.

## Threat ledger

| Attacker | Posture |
|---|---|
| Reads a core dump after a crash | Z3 closes the shipped Linux companion path and proves its runtime limits; add-on and future appliance/Vault-service artifacts remain open. A host with its own crash tooling reopens even a closed path - operator lever, named. |
| Reads swap or a hibernation image from a stolen disk | Closed on the ADR 0027 image by requirement; open and stated on generic hosts. The bounded session means what was swappable is mostly *sealed* material, but unlock windows are real. |
| Live ptrace / `/proc/pid/mem` with the person's uid | Conceded in ADR 0097, unchanged: endpoint compromise wins. The daemon bounds it to one process and a bounded window; nothing here claims more. |
| Harvests GC copies from a memory snapshot | The copies exist; discipline cannot zero what GC duplicated. Bounded by session lifetime and by Z2 shrinking how many processes ever held the bytes. This row is why Z4 bans erasure claims. |
| Reads secrets out of logs, errors or crash reports | Z1: secrets never enter them; the existing daemon practice (never logged, never audited, reasons snake-cased) becomes the rule everywhere. |
| Captures the JSON IPC frames | Requires the same uid (0600 socket) - at which point the previous rows already apply. The hex strings inside the receiving process are the named string debt, not a new channel. |
| Future crash reporter or telemetry ships memory | Forbidden by Z3's no-memory-capture rule; a diagnostic feature that needs process memory needs its own ADR against this one. |

## Consequences

Positive:

- the gap between what the code does (real, disciplined narrowing)
  and what a reader might believe (erasure) is closed in the honest
  direction, matching ADR 0121's detection-not-prevention stance;
- the two cheap platform holes - dumps and swap - get decided answers
  at the cost of a few lines in packaging artifacts and one gate on
  the image ADR;
- the inward-migration pattern stops being a per-ceremony argument
  and becomes the default, with the M6 backlog inheriting its
  rationale;
- declining `sodium-native` here keeps the supply-chain surface flat
  and points the effort at the platform keystore, which actually
  changes the topology.

Negative and residual:

- generic hosts keep unencrypted swap unless the operator acts, and
  Pico can only say so;
- the Linux platform keystore now removes the passphrase from companion
  persistence, but `safeStorage.decryptString` and the daemon's JSON unlock
  frame still create transient unzeroizable strings; the binary-protocol
  half of that named debt remains;
- GC copies remain untouchable from inside the runtime, permanently,
  and Z4 makes sure no document forgets it;
- disabling core dumps costs post-mortem debuggability for the
  processes that most deserve debugging - accepted, with logs and the
  ADR 0121 audit chain as the remaining diagnostic surface;
- greppable stringification comments are discipline, not enforcement;
  the review check in Z1 is only as good as review.

## Relationship to other ADRs

- Restates ADR `0081` V7's honesty limits as binding rules. Its first P3
  Linux tranche changes at-rest topology without making a memory-erasure
  claim; other platforms and the transient-string remainder stay structural
  successor work.
- Makes ADR `0097`'s per-threat concessions and passphrase honesty
  normative for every process, not just the daemon, and leaves its
  boundary mechanics unchanged.
- Turns the ADR `0100`/`0101`/`0102` inward-migration precedent into
  the default rule and gives the M6 backlog its standing rationale.
- Adds the encrypted-swap requirement to ADR `0027`'s gate list and
  the dump/no-memory-capture requirement to ADR `0113` C3 packaging
  and the add-on entrypoint.
- Declines `sodium-native` partly on ADR `0122`'s named install-script
  residual - hygiene must not widen the supply chain it depends on.
- Leaves ADR `0072`'s at-rest custody floors and backup separation
  untouched; this ADR is about the copies that exist while the
  process runs.

## References

- [ADR 0027](0027-dedicated-pico-home-image-and-first-boot-setup.md)
- [ADR 0072](0072-memory-domain-key-storage-and-backup-separation.md)
- [ADR 0081](0081-pico-vault-person-role-key-custody-threat-model-and-direction.md)
- [ADR 0086](0086-reader-custody-authority-and-opaque-storage.md)
- [ADR 0096](0096-reader-access-session-and-vault-lock-lifecycle.md)
- [ADR 0097](0097-deployable-vault-process-and-local-ipc-authority-boundary.md)
- [ADR 0101](0101-daemon-side-kek-ceremony-families-and-ceremony-approval.md)
- [ADR 0102](0102-multi-session-unlock-and-two-role-ceremonies.md)
- [ADR 0113](0113-electron-shell-over-a-shell-free-companion-service-core.md)
- [ADR 0121](0121-tamper-evident-audit-records-and-anchored-checkpoints.md)
- [ADR 0122](0122-update-and-release-integrity-threat-model-and-hardening-gates.md)
