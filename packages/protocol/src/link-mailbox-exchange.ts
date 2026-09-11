import { parsePicoLinkPacketAddress } from './link-packet.js';
import { assertPicoLinkPeerFingerprint } from './link-mailbox.js';

/**
 * ADR 0148 EX1 - what `home.link.mailbox.exchange` carries.
 *
 * One round trip, both directions. There are two addresses and they are
 * issued by opposite sides: the device sends the one it issues to the Home,
 * and the Home answers with the one it issues to the device. Two operations
 * would leave a window where one side can reach the other and not be reached,
 * which reads as a working relay and is half of one.
 *
 * **These are the inner payloads of an ADR 0107 envelope**, so they are sealed
 * and signed by that machinery and carry no crypto of their own. An address is
 * a capability - anyone who learns a mailbox can fill it, and ADR 0147 RY6
 * makes a full mailbox refuse - so it may travel nowhere else: not an envelope
 * field, not a header, not a URL, not a log line (ADR 0148 EX4).
 *
 * **Neither side names its own peer key here, and that absence is EX2.** The
 * Home takes the device from the authenticated principal ADR 0107 already
 * verified. A device that could name its own fingerprint would be a device
 * choosing which mailbox it is - the same class of mistake as a supplier
 * naming its own directory (ADR 0143 DP8) - so there is no field for it.
 */

export const picoLinkMailboxExchangeRequestSchema =
  'pico.link.mailbox-exchange.request.v1' as const;
export const picoLinkMailboxExchangeResponseSchema =
  'pico.link.mailbox-exchange.response.v1' as const;

export interface PicoLinkMailboxExchangeRequest {
  schema: typeof picoLinkMailboxExchangeRequestSchema;
  /**
   * The address the device issues to the Home, so the Home can reach it.
   *
   * Registering it at the named operator is the sender's precondition. ADR
   * 0148 does not try to detect an address that was never registered: the
   * Home cannot tell the difference between one that is missing and one whose
   * operator is briefly unreachable, and guessing would turn a network into a
   * refusal.
   */
  deviceInbound: string;
}

export interface PicoLinkMailboxExchangeResponse {
  schema: typeof picoLinkMailboxExchangeResponseSchema;
  /** The address the Home issues to this device, so the device can reach it. */
  homeInbound: string;
  /**
   * Which device this was issued to, echoed from the principal the Home
   * authenticated - never taken from the request.
   *
   * Echoed rather than omitted so the device can check the Home issued to the
   * key it actually signed with. A device holding several delegations would
   * otherwise have to assume, and an address filed under the wrong peer is one
   * that stops working at the next rotation for no visible reason.
   */
  peerFingerprintHex: string;
}

function assertAddress(value: unknown, reason: string): string {
  if (typeof value !== 'string') {
    throw new Error(reason);
  }
  parsePicoLinkPacketAddress(value);
  return value;
}

function assertExactly(record: Record<string, unknown>, known: readonly string[], label: string): void {
  const unexpected = Object.keys(record).find((key) => !known.includes(key));
  if (unexpected !== undefined) {
    // `peerFingerprintHex` on a request is the one worth naming: it is a
    // device asking to be filed as somebody, and EX2 says the Home reads that
    // from the principal or not at all.
    throw new Error(`pico_link_mailbox_exchange_${label}_carries_no:${unexpected}`);
  }
  const missing = known.find((key) => !(key in record));
  if (missing !== undefined) {
    throw new Error(`missing_pico_link_mailbox_exchange_field:${missing}`);
  }
}

function asRecord(value: unknown, reason: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(reason);
  }
  return value as Record<string, unknown>;
}

export function parsePicoLinkMailboxExchangeRequest(
  value: unknown,
): PicoLinkMailboxExchangeRequest {
  const record = asRecord(value, 'invalid_pico_link_mailbox_exchange_request');
  assertExactly(record, ['schema', 'deviceInbound'], 'request');
  if (record.schema !== picoLinkMailboxExchangeRequestSchema) {
    throw new Error('unknown_pico_link_mailbox_exchange_schema');
  }
  return Object.freeze({
    schema: picoLinkMailboxExchangeRequestSchema,
    deviceInbound: assertAddress(record.deviceInbound, 'invalid_pico_link_address'),
  });
}

export function parsePicoLinkMailboxExchangeResponse(
  value: unknown,
): PicoLinkMailboxExchangeResponse {
  const record = asRecord(value, 'invalid_pico_link_mailbox_exchange_response');
  assertExactly(record, ['schema', 'homeInbound', 'peerFingerprintHex'], 'response');
  if (record.schema !== picoLinkMailboxExchangeResponseSchema) {
    throw new Error('unknown_pico_link_mailbox_exchange_schema');
  }
  return Object.freeze({
    schema: picoLinkMailboxExchangeResponseSchema,
    homeInbound: assertAddress(record.homeInbound, 'invalid_pico_link_address'),
    peerFingerprintHex: assertPicoLinkPeerFingerprint(record.peerFingerprintHex),
  });
}

/**
 * ADR 0148 EX2. What a device checks before filing the answer.
 *
 * The device signed with one key; the Home says it issued to one key. If they
 * differ, the address belongs to a relationship the device is not in, and
 * filing it would produce an entry that stops working at the next rotation
 * with nothing to point at.
 *
 * Separate from the parser because it needs a fact the payload cannot carry -
 * which key this device actually signed with - and a parser that took it as
 * an argument would invite a caller to pass the value it just read.
 */
export function assertPicoLinkMailboxExchangeAnsweredThisDevice(input: {
  response: PicoLinkMailboxExchangeResponse;
  signingKeyFingerprintHex: string;
}): void {
  if (input.response.peerFingerprintHex !== input.signingKeyFingerprintHex) {
    throw new Error('pico_link_mailbox_exchange_answered_another_device');
  }
}
