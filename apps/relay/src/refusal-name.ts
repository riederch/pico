/**
 * What may leave this relay as the reason for a refusal.
 *
 * **Found by walking it** (2026-09-09, finding B110). The mailbox port's inner
 * catch passed `error.message` to the caller, three lines under a comment
 * saying *"Refusal names travel; nothing else does."* A store failure inside
 * the answering path is caught there, so an anonymous caller received:
 *
 * ```
 * 400 {"error":"ENOENT: no such file or directory, open /home/somebody/relay.sqlite"}
 * ```
 *
 * The absolute path of the relay's database, to whoever knocks. The log line
 * beside it already filtered exactly this shape and answered `unnamed_failure`
 * - the same truth, written once for the log and not for the response.
 *
 * **A name, and at most one field behind a colon.** The refusals this product
 * really returns look like `mailbox_unknown` and
 * `pico_link_packet_carries_no:body`; the suffix names a field of the caller's
 * own request, which is a fact they already hold. A message with a space, a
 * slash or a path is not a refusal name and does not travel.
 */
export const picoRelayRefusalNamePattern = /^[a-z0-9_]+(?::[A-Za-z0-9_.-]{1,64})?$/u;

/** The refusal name an error carries, or `fallback` when it carries none. */
export function picoRelayRefusalName(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  return picoRelayRefusalNamePattern.test(message) ? message : fallback;
}
