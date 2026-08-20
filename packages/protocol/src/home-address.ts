/**
 * What a Pico Home's address is, decided once.
 *
 * **Four answers were in the tree on 2026-08-20, and they disagreed in three
 * different directions.** The founding prompt in the Electron shell tested
 * `/^https?:\/\/\S+$/` and allowed 2,048 characters; the companion profile
 * parsed with `new URL` and allowed 2,048; the enrolment grant's parser
 * checked a lowercase prefix and allowed 512; and `founding.ts`, the one
 * place a Home address is first written down, checked nothing at all.
 *
 * | address                    | prompt | profile | grant |
 * | -------------------------- | ------ | ------- | ----- |
 * | `HTTP://192.168.1.20:3000` | no     | **yes** | no    |
 * | a 612-character `http://…` | yes    | **yes** | no    |
 * | `http://exa mple:3000`     | no     | no      | **yes** |
 *
 * The middle row is the one a person reaches: found a Home at a long address,
 * and the founding works. Adding a second device later fails with
 * `invalid_pico_device_enrolment_grant_core_url`, which reads as a bad code
 * and is nothing of the kind - the address was accepted by the door it came
 * through and refused by a door three ceremonies away.
 *
 * So the binding constraint sets the rule, and the binding constraint is the
 * wire: the address travels inside a grant a person reads out or scans, and
 * `maxPicoDeviceEnrolmentBytes` is why 512 rather than 2,048. Everything that
 * writes an address down asks here first, which makes the refusal arrive
 * while the person is still looking at what they typed.
 */

/**
 * Bounded by what a grant can carry, not by what a URL may be.
 *
 * A person types this address once and reads it back off a second screen; an
 * address longer than a line is a different problem than this rule can fix.
 */
export const maxPicoHomeCoreUrlLength = 512;

/**
 * The scheme is required in lowercase deliberately.
 *
 * `new URL` normalises `HTTP://` to `http:` and would let this pass, and then
 * the string kept in the profile is the one the person typed - which the
 * grant parser, reading bytes rather than a URL, refuses. Normalising here
 * would rewrite an address somebody chose (`new URL('http://x:3000').href`
 * also grows a trailing slash), so the answer is to refuse it at the door,
 * where a sentence can say what to change.
 */
export function isPicoHomeCoreUrl(value: unknown): value is string {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > maxPicoHomeCoreUrlLength
    || !(value.startsWith('http://') || value.startsWith('https://'))) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    // A space in the middle, a missing host, a port that is not a number.
    // The grant's own prefix check saw none of those.
    return false;
  }
}

export function assertPicoHomeCoreUrl(value: unknown, reason: string): string {
  if (!isPicoHomeCoreUrl(value)) {
    throw new Error(reason);
  }
  return value;
}
