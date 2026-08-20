/**
 * How this client shows a key fingerprint to a person.
 *
 * **ADR 0079 I5 deliberately leaves this open** - "display encoding of
 * fingerprints is UX and decided with the surfaces that show them" - and
 * until 2026-08-20 this surface had never decided. It had three answers:
 * `8…8` in the shell-free core's alarms, the same rule written a second time
 * as a private helper in the Electron main process, and a bare twelve-
 * character prefix in the renderer contract. One key could therefore reach
 * one person in two spellings on one desktop: a host-key rotation arrives as
 * a notification saying `a1b2c3d4…7f8e9d0c` and is confirmed in the window
 * as `a1b2c3d4e5f6`.
 *
 * Head **and** tail, because of the attack ADR 0079's own threat table names:
 * grinding a key whose truncated fingerprint matches a target's *display
 * prefix*. A prefix of twelve hex characters is forty-eight bits to match;
 * eight from each end is sixty-four, and costs a person nothing to read.
 * Neither form may be a comparison input (I5) - full digests are - but the
 * one shown should not be the cheaper one to fake.
 *
 * Spelled once here rather than in the shell, because ADR 0131 A5 makes
 * Android the second client to show these strings: a rule that lives in the
 * desktop's main process is a rule the phone re-invents, and two clients
 * disagreeing about how one key looks is the same defect one desktop already
 * had.
 */
export function picoCompanionDisplayFingerprint(fingerprintHex: string): string {
  // Short enough to show whole is shown whole: an ellipsis between two halves
  // of one short string hides nothing and reads as though something is
  // missing.
  return fingerprintHex.length <= 17
    ? fingerprintHex
    : `${fingerprintHex.slice(0, 8)}…${fingerprintHex.slice(-8)}`;
}
