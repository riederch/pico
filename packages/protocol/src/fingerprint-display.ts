/**
 * How a key fingerprint is shown to a person. One rule, for the whole product.
 *
 * **ADR 0079 I5 leaves the form open on purpose** - "display encoding of
 * fingerprints is UX and decided with the surfaces that show them" - and it is
 * worth reading the preposition. *With* the surfaces, not *separately by each
 * of them*: a person who is shown one key twice is one reader, however many
 * processes did the showing.
 *
 * Three surfaces had decided separately by 2026-08-20. The companion's
 * shell-free core shortened head-and-tail; the Electron main process carried a
 * byte-identical private copy of that rule; the renderer contract took a bare
 * twelve-character prefix. That was found and fixed inside the companion, and
 * the fix was put where a second client could reach it, because ADR 0131 A5
 * makes Android the next surface to show these strings.
 *
 * **It was still the wrong place, and the reason is the ceremony.** The Vault
 * daemon renders the sentence a person approves (ADR 0106: from the same
 * validated fields the signed bytes are built from), and it had a fourth
 * spelling - a twelve-character prefix of its own. The two meet:
 *
 *     Admit 9f8e7d6c5b4a… to Home … as member (…) until 2027-01-02.
 *     Signing key a1b2c3d4…7f8e9d0c; exact request digest ….
 *
 * That is one string in one dialogue, assembled from two apps, naming keys in
 * two alphabets. A person cannot check that the membership the window confirms
 * afterwards is the membership they approved, because the two renderings of the
 * same identity share no visible characters beyond the first eight - and the
 * first eight are precisely the part an attacker grinds.
 *
 * So the decision moves to the one package both surfaces already depend on. It
 * could not move the other way: `@pico/companion` depends on
 * `@pico/vault-daemon`, so a Vault reaching back into the companion is a cycle.
 * The precedent is next door - `approval-statement.ts` holds the sentence a
 * person is asked to approve, for the same reason: what a person reads before
 * consenting is not a per-surface style question.
 *
 * **Head and tail, not a prefix.** The attack ADR 0079's own threat table names
 * is grinding a key whose truncated fingerprint matches a target's *display
 * prefix*. Twelve hex characters of head is forty-eight bits to match; eight
 * from each end is sixty-four, and costs a person nothing to read. Neither form
 * is ever a comparison input - I5 keeps full labeled digests for that - but the
 * one a person is shown should not be the cheaper one to fake.
 *
 * ICU-free by construction: the runtime the first Android client embeds has no
 * `Intl` at all (ADR 0131 A1), and a rendering rule that cannot run on the
 * surface it was written for is not shared, only copied.
 */
export function picoDisplayFingerprint(fingerprintHex: string): string {
  // Short enough to show whole is shown whole: an ellipsis between two halves
  // of one short string hides nothing and reads as though something is
  // missing.
  return fingerprintHex.length <= 17
    ? fingerprintHex
    : `${fingerprintHex.slice(0, 8)}…${fingerprintHex.slice(-8)}`;
}
