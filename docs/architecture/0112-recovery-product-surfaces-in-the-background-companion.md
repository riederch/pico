# 0112 - Recovery Product Surfaces in the Background Companion

## Status

Status note, 2026-08-19 (second, and the worse one): **a printed Recovery
Card could be photographed but not typed.** The first-run window offers two
ways to hand over the code under the QR block - a camera, or a USB scanner
and the keyboard. The camera path read the prefix from
`picoRecoveryCardScanPrefix`; the branch beside it demanded
`pico-recovery-card-v2:`, a spelling no card has ever carried. The card's
*metadata* schema is v2 and its scan transport is v1, and the two got
confused in the one place nothing checked.

`buildPicoRecoveryCardScanTransport` emits the v1 prefix and
`parsePicoRecoveryCardScanTransport` refuses anything else, so this was not
a drift risk but a broken path: every real card was rejected. And rejected
silently - `collectPicoCompanionSecureInput` answers a rejected value with a
character count and nothing else - so a person restoring their identity
without a camera would have typed a correct code from a card in their hand
into a box that only blinked at them. That is the ADR 0112 scenario itself:
the printed card is what this ADR prefers over a file export, and the person
using it is the one who has already lost a device.

Both prompts now come from the contract with the prefix passed in from
`@pico/protocol`, so no spelling of it exists in the window at all, and a
test builds a real transport and requires the prompt to accept it. The
`docs:check` gate could not run in this verification: an untracked
`packages/gesture` from a parallel session is not yet named in the
repository structure. Everything else - workspace typecheck, all suites, and
every other gate - was run and passed.

Status note, 2026-08-19: **the window's Card PIN rule is bound to the vault's
rule now, rather than resembling it.** `picoRecoveryPinProtection` states the
lengths and the alphabet once and the vault and daemon both derive from it;
the companion window carried a hand-written `/^[0-9a-z]{6,64}$/` and said the
numbers a third time in its instruction. Today the three agree, which is
exactly the state in which such a copy stops being noticed.

It deserved more care than the usual duplicate for a reason that has nothing
to do with the PIN: a value this window refuses never becomes an error
message. `collectPicoCompanionSecureInput` answers a rejected value with a
character count and nothing else, so a person typing a PIN their vault would
accept would watch a box blink at them with no sentence anywhere - the same
silence that hid the founding-line failure found the same day (ADR 0130 E2).

The rule and its sentence now come from one function in the shell contract,
with the numbers interpolated into the prose, and a test binds it to
`picoRecoveryPinProtection` - the arrangement `browser:check` names as the
remedy for a copy that cannot be an import, since the contract loads in the
renderer where a bare specifier does not resolve.


Accepted; partially implemented. The transitional CLI wrappers (gate S1)
landed with this ADR; ADR 0113 C1/C2 have since implemented S2's alarm
carrier, Electron adapters and real-process proof. S3 now has a first bounded
product vertical: one-decision veto, on-demand Recovery Card re-issue,
approval rendering and durable pull-completion/receipt state. Card v2 now
carries ADR 0115's acceptor pin, the Vault daemon can bootstrap a fresh Vault
from its strictly parsed canonical payload, and the Linux companion has a
fail-closed Platform Keystore unlock owner for the target device keys.
First run is a proven vertical: a scanned or camera-decoded v2 card, secrets
captured in Main, a crash-replay journal, the unchanged initiation ceremony,
and a committed profile with its keystore binding. A trusted v1 acceptor-pin
fallback remains open, as does S4 on ADR 0105 B3. **Status note (ADR 0134 F2, 2026-08-10):** where the paragraph above says
"Card v2" and "a scanned or camera-decoded v2 card", read "the Recovery Card":
ADR 0134 F2 collapsed the two card layouts into one, which keeps the name
`v1` and always carries the acceptor pin. The "trusted v1 acceptor-pin
fallback" listed as open is closed with it - there is no format left that
lacks the pin, so there is nothing for a fallback to accept.

This ADR takes over the product half
of ADR 0110's R5:
where a person actually issues a card, restores from it, sees a pending
alarm, vetoes, and completes a recovery. It deliberately does not choose
the client shell technology - that choice belongs to the ADR that starts
ADR 0105 B2, with an implementation milestone attached, and is recorded
here as an explicit non-goal so this contract cannot be read as having
made it in passing.

## Context

ADR 0110 R1-R4 are implemented and proven in real processes: canonical
forms, durable pending state, the composite prepare/initiate/complete
ceremony with 3+N root approvals, the veto, and the zero-device path
across restarts. But every one of those proofs drives library functions
(`initiatePicoHomeDeviceRecovery`, `completePicoHomeDeviceRecovery`,
`vetoPicoHomeDeviceRecovery`, the daemon's `issue-recovery-card` family,
`restorePicoVaultIdentityFromRecovery`) from test code. Unlike the twelve
existing `pico-vault ceremony` subcommands, recovery has no
human-invokable wrapper: with 0.1.9 installed as an add-on, a person who
lost their last device could not execute the recovery this repository
proves works.

The pending alarm has the same gap one level up. ADR 0110 requires that
"the product must alarm loudly" during pendency, and the authenticated
lifecycle read now carries `pendingRecovery` - but a read only alarms
somebody who performs it. There is no person-side long-running process,
which is exactly the open ADR 0105 B2 (background service) and B3 (avatar
interaction).

ADR 0105 fixed the product form: a background service reached through the
avatar; the CLI stays a tool. The design system fixes the visual
authority: PICO Character Design v3.2.1 is binding, no approved
production asset exists yet, product code may not draw or recolor the
character, and status is always color plus symbol plus text.

## Scope

Covers:

- which product surface carries each of the five recovery moments -
  issuance, restore, pending alarm, veto, completion;
- the alarm-carrier contract for the background service, including its
  check cadence against the 48-hour veto window;
- what every recovery surface must render, bound to ADR 0106 statements;
- the character-asset gate for any avatar visual on these surfaces;
- the explicit non-surfaces; and
- the transitional CLI wrappers as the interim executable path.

Does not cover:

- the client shell technology, platform order or packaging (the ADR that
  starts ADR 0105 B2);
- avatar visual design or any new character asset (Character Design
  v3.2.1 workflow);
- relay transport or reachability of a Home from outside (ADR 0031/0107
  future work);
- ADR 0110 R6, the restore-proof consumption anchor; and
- any change to ceremonies, canonical bytes, approvals or custody.

## Decision

### The five moments and their surfaces

**Issuance belongs to onboarding.** The companion offers the Recovery
Card at the end of person onboarding - "print and laminate this now" -
and again on demand from settings (re-issue after loss or host-key
rotation). Issuance is the approval-gated `issue-recovery-card` ceremony;
the companion renders the ADR 0106 statement ("this exports your identity
root once for printing"), prefers direct-to-printer, warns about file
copies, and never persists the phrase, the PIN or the PDF beyond the
print job. The PIN is chosen at issuance, entered only there and at
restore, and never stored.

**Restore is a first-run path.** A fresh companion install asks one
question before creating anything: "new identity, or do you have a
Recovery Card?" The card path takes the 24 words or the QR scan plus the
PIN, restores into a fresh Vault, and continues directly into recovery
initiation. The prompt language keeps the three-codes rule: the Vault
passphrase, the Recovery Phrase and the Card PIN are never called by one
another's names.

**The background service carries the alarm.** While any device of an
identity runs the companion, the service performs the authenticated
lifecycle read on a bounded cadence: at least once every six hours while
running, plus immediately on start, wake and network regain. A
`pendingRecovery` in the response is a loud alarm, not a badge: an
interrupting notification on every channel the device has, the avatar in
its blocked/warning state, and a plain statement rendered from the signed
pending view - which identity, which target device fingerprints, when it
becomes effective. Six hours against a 48-hour window gives a running
device at least seven independent chances to see the alarm; a device
that is off for the whole window misses it, which is ADR 0110's stated
veto residual, not a new one.

**Veto is one decision away from the alarm.** The alarm notification
opens directly into the veto decision; no navigation may sit between
them. The veto renders what is vetoed (recovery id, target fingerprints,
effective instant) and executes the authenticated
`home.device.recovery.veto` operation. Dismissing the alarm without
deciding keeps the alarm armed; it re-raises on every later check while
pendency lasts.

**Completion is a waiting surface, not a button hunt.** After
initiation, the recovering companion shows the time lock honestly: when
the recovery becomes effective, that nothing can hurry it, and that
every other device of the identity will be revoked. After `effectiveAt`
the same companion completes automatically on its next check within the
completion window, then shows the receipt summary: exactly one active
device remains, everything else is revoked, surviving hardware re-enrolls
through the normal sponsor path.

### Approval rendering is the companion's, unchanged

Every root approval in these flows renders the ADR 0106 statement built
from the canonical bytes - the avatar asks, the background service holds
the unlock (ADR 0105). Recovery adds no new approval semantics and no
exemption beyond the pinned role-aware target co-signature.

### No avatar visual before a registered production asset

The alarm, veto and completion surfaces work with color, symbol and text
alone - the design system's minimum status contract. Any rendering of
the character on these surfaces requires a production asset registered
for exactly that surface, state and size under Character Design v3.2.1.
The alarm must never wait for the asset: a companion without an approved
character rendering still alarms at full loudness.

### Non-surfaces

The Foundation dashboard and HTTP surface stay diagnosis: they never
gain issuance, restore, veto or completion. The CLI wrappers below are
transitional tooling under ADR 0105, not a product surface, and no
future work may cite their existence as a reason to skip S2/S3.

### Transitional CLI wrappers (this milestone)

`pico-vault ceremony` gains five subcommands, in the exact idiom of the
existing twelve: `issue-recovery-card`, `restore-identity`,
`initiate-recovery`, `complete-recovery` and `veto-recovery`. They wrap
the proven library ceremonies unchanged; secrets (PIN, phrase,
passphrase) travel only over prompts, never flags; the card wrapper
writes the two normative PDFs and prints only public metadata to stdout.
They exist because a shipped add-on whose recovery is proven but humanly
unreachable would make "implemented" an overclaim - and they are named
transitional for the same reason the other twelve are.

## Gates

- **S1 - Transitional CLI wrappers (implemented):** the five subcommands
  over the unchanged library ceremonies, secrets only via prompts, PDFs
  written person-side with private modes enforced on re-issue,
  public-metadata-only stdout. Proven as processes, not just parsed:
  issuance under a real approval and phrase/PIN restore with wrong-PIN
  refusal, plus a founded Home where the CLI initiates a recovery, a
  living device vetoes it, the spent recovery refuses completion, a
  second recovery refuses completion before its window and succeeds
  after it, and the resulting device set is read back through the CLI.
- **S2 - Background alarm carrier (implemented via ADR 0113 C1/C2):**
  the long-running service performing the authenticated lifecycle read
  on the pinned cadence, raising the loud alarm and keeping it armed
  through pendency. The carrier, its cadence/re-arm behavior and the
  Linux notification path exist as the tested companion service core.
  The Electron main process now hosts it with tray, critical notification,
  wake and network-regain adapters; a strict display-only renderer raises
  the color+symbol+text alarm. The full path is process-proven against a
  real founded Home and real Vault daemons with pending recovery. Closing
  the C2 window does not claim to veto; that one-decision ceremony remains
  S3.
- **S3 - Companion ceremonies (partially implemented):** the alarm exposes
  exactly one authenticated veto decision, and a real founded Home proves the
  pending alarm and veto through the hosted runtime. The settings surface can
  re-issue the approval-gated Card directly to Linux CUPS without a
  companion-owned PDF; passphrase and Card PIN are captured in Electron Main
  before renderer delivery, and generated PDF byte arrays are zeroed after the
  print call. The product approval carrier renders the daemon's ADR 0106
  statement and echoes only the exact id/digest decision. A private atomic
  continuation file carries only the signed public pending view or public
  receipt summary; before `effectiveAt` it renders the honest wait, and on a
  later authenticated check it attempts exact-target completion and records
  the exactly-one-device receipt. The additive Card v2/parser/fresh-Vault
  daemon bootstrap and Linux
  libsecret/KWallet-backed device-session owner now provide the custody
  prerequisites without changing the daemon's bounded unlock ceilings.

  First run is now a vertical rather than a prerequisite. A v2 card reaches
  Electron Main as a fixed ASCII transport whose parser is intolerant by
  construction - exact prefix, unpadded base64url only, and a re-encode
  comparison that refuses the second spelling a tolerant decoder would accept -
  and it arrives either from an external camera decoder or from the same
  main-process keystroke capture the Card PIN uses, so the renderer learns only
  which source was chosen. A device with no profile is offered that surface
  instead of a service error.

  The run itself crosses one irreversible step, the fresh-Vault daemon
  bootstrap, and several that must end up wholly done or plainly unfinished.
  A private atomic journal records which step was reached and lets a restart
  resume forward: it holds public facts only, never the card, PIN or
  passphrase, refuses to move backwards or to change its binding, and is
  dropped only once the profile it produced reads back. Because the passphrase
  is deliberately not journaled, a resumed run asks for it again and never for
  the card, which has already been spent. Recovery initiation runs the
  unchanged ADR 0110 ceremony over Link Direct, and completion reuses the same
  controller the ordinary cadence uses rather than a first-run copy of it.
  Every signature still travels the ADR 0099 hold channel; first run owns no
  approval exemption. The commit writes the profile first, because that is
  what makes the device real, and records whether the Platform Keystore
  binding was written beside it - a crash that took the passphrase leaves
  automatic unlock off and says so.

  Proven as processes against a real founded Home, a real approval-gated card
  issuance and a real fresh vault: scan to submitted, restart mid-window
  resuming forward on the passphrase alone, the Home restarted past its own
  veto delay, completion, committed profile, and a spent vault refusing a
  second bootstrap. A card naming host keys the endpoint cannot prove is
  refused before the vault is touched.

  Still open: trusted v1 acceptor-pin fallback, and S4.

  Honest limit worth stating: at first run the card is the trust root for all
  three pins it carries. A wrong acceptor pin is undetectable here, because on
  a Home that has not yet rotated its host key the continuity chain is empty
  and the acceptor constrains nothing; it binds rotation *acceptance*, so a
  card carrying a wrong one produces a device that fails closed at its Home's
  next rotation rather than at first run.
- **S4 - Character visuals (open, needs registered production assets):**
  avatar renderings for alarm/veto/completion states, each gated on a
  purpose-registered Character 3.2.1 production asset.

## Consequences

Positive:

- ADR 0110's "the product must alarm loudly" stops being a sentence and
  becomes a carrier, a cadence and a reachability rule;
- recovery is humanly executable today, honestly labeled transitional;
- the companion work (B2/B3) inherits a fixed product target for its
  first security-critical vertical instead of inventing one;
- the character governance holds: nothing here draws a Pico.

Negative and residual:

- the CLI wrappers are a terminal surface for the most safety-critical
  ceremony; the mitigation is the shared rendering path and their
  explicit transitional status, and S3 is the real fix;
- a device that is off or disconnected for the whole veto window still
  misses the alarm - unchanged ADR 0110 residual;
- the six-hour cadence is a product default pinned here; making it a
  per-identity Pico setting is legitimate ADR 0104 work later, never
  host configuration;
- S3 still lacks onboarding/profile creation and first-run restore/initiation;
  the implemented Linux unlock owner can renew only a binding that onboarding
  has created, so that missing call remains explicit rather than being hidden
  behind the continuation state. Window close never
  means veto, and closing an approval surface denies rather than consents.

## Relationship to other ADRs

- Executes ADR `0105` for the recovery slice: the background service and
  first typed renderer surface exist; the CLI stays a transitional tool;
  B2 packaging/unlock ownership and the broader B3 avatar flow remain.
- Takes over the product half of ADR `0110` R5; its documentation-honesty
  half stays in ADR 0110. The veto residual and 48-hour default are
  unchanged.
- Binds every approval surface to ADR `0106` rendered statements over
  ADR `0099` hold-channel approval, adding no exemption.
- Applies ADR `0013` and the checked-in design system: Character 3.2.1
  gates visuals, status is color plus symbol plus text, tokens are the
  palette source.
- Applies ADR `0104` to the alarm cadence: a pinned product default that
  may later become a per-identity Pico setting.
- Leaves ADR `0009`'s separation intact: the avatar renders state and
  asks; it decides nothing.

## References

- [ADR 0009](0009-avatar-and-interaction-model.md)
- [ADR 0013](0013-visual-design-language.md)
- [ADR 0099](0099-hold-channel-approval-for-authority-creating-signatures.md)
- [ADR 0104](0104-settings-belong-to-pico-not-to-host-configuration.md)
- [ADR 0105](0105-pico-runs-as-a-background-companion-not-a-cli.md)
- [ADR 0106](0106-approval-rendering-from-the-signed-bytes.md)
- [ADR 0110](0110-recovery-card-and-time-locked-zero-device-recovery.md)
- [ADR 0113](0113-electron-shell-over-a-shell-free-companion-service-core.md)
