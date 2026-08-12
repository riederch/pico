import { describe, expect, it } from 'vitest';
import {
  assertPicoLinkMailboxExchangeAnsweredThisDevice,
  parsePicoLinkMailboxExchangeRequest,
  parsePicoLinkMailboxExchangeResponse,
  picoLinkMailboxExchangeRequestSchema,
  picoLinkMailboxExchangeResponseSchema,
} from './link-mailbox-exchange.js';

/**
 * ADR 0148 EX1/EX2. One round trip carrying both directions, and a request
 * that cannot say who it is.
 */
const device = 'd'.repeat(64);
const other = 'e'.repeat(64);
const deviceInbound = `${'1'.repeat(32)}@relay.example.invalid`;
const homeInbound = `${'2'.repeat(32)}@relay.example.invalid`;

describe('ADR 0148 EX1 - the exchange request', () => {
  it('carries the address the device issues and nothing else', () => {
    expect(parsePicoLinkMailboxExchangeRequest({
      schema: picoLinkMailboxExchangeRequestSchema,
      deviceInbound,
    })).toEqual({ schema: picoLinkMailboxExchangeRequestSchema, deviceInbound });
  });

  it('refuses a device that names its own peer key', () => {
    // EX2's absence. A device choosing which mailbox it is would be the same
    // class of mistake as a supplier naming its own directory - the Home reads
    // this from the principal ADR 0107 already verified, or not at all.
    expect(() => parsePicoLinkMailboxExchangeRequest({
      schema: picoLinkMailboxExchangeRequestSchema,
      deviceInbound,
      peerFingerprintHex: device,
    })).toThrow('pico_link_mailbox_exchange_request_carries_no:peerFingerprintHex');
  });

  it('refuses any other unknown key, and a missing one by name', () => {
    expect(() => parsePicoLinkMailboxExchangeRequest({
      schema: picoLinkMailboxExchangeRequestSchema,
      deviceInbound,
      rotateEveryMs: 86_400_000,
    })).toThrow('pico_link_mailbox_exchange_request_carries_no:rotateEveryMs');

    expect(() => parsePicoLinkMailboxExchangeRequest({
      schema: picoLinkMailboxExchangeRequestSchema,
    })).toThrow('missing_pico_link_mailbox_exchange_field:deviceInbound');
  });

  it('refuses an address that is not one, through ADR 0147 RY3', () => {
    for (const bad of ['device-1', `alice@relay.example.invalid`, 42, null]) {
      expect(() => parsePicoLinkMailboxExchangeRequest({
        schema: picoLinkMailboxExchangeRequestSchema,
        deviceInbound: bad,
      })).toThrow();
    }
  });

  it('refuses an unknown schema and a non-object', () => {
    expect(() => parsePicoLinkMailboxExchangeRequest({
      schema: 'pico.link.mailbox-exchange.request.v2',
      deviceInbound,
    })).toThrow('unknown_pico_link_mailbox_exchange_schema');
    for (const value of [null, 'request', [], 42]) {
      expect(() => parsePicoLinkMailboxExchangeRequest(value))
        .toThrow('invalid_pico_link_mailbox_exchange_request');
    }
  });
});

describe('ADR 0148 EX1 - the exchange response', () => {
  const response = {
    schema: picoLinkMailboxExchangeResponseSchema,
    homeInbound,
    peerFingerprintHex: device,
  };

  it('carries the Home address and the device it was issued to', () => {
    expect(parsePicoLinkMailboxExchangeResponse(response)).toEqual(response);
  });

  it('refuses a peer that is not a fingerprint', () => {
    for (const bad of ['device-1', 'd'.repeat(63), 'D'.repeat(64), 42]) {
      expect(() => parsePicoLinkMailboxExchangeResponse({ ...response, peerFingerprintHex: bad }))
        .toThrow('invalid_pico_link_peer');
    }
  });

  it('refuses an unknown key, naming it', () => {
    expect(() => parsePicoLinkMailboxExchangeResponse({ ...response, expiresAt: 'never' }))
      .toThrow('pico_link_mailbox_exchange_response_carries_no:expiresAt');
  });
});

describe('ADR 0148 EX2 - the device checks it was answered', () => {
  const response = parsePicoLinkMailboxExchangeResponse({
    schema: picoLinkMailboxExchangeResponseSchema,
    homeInbound,
    peerFingerprintHex: device,
  });

  it('accepts an answer issued to the key it signed with', () => {
    expect(() => assertPicoLinkMailboxExchangeAnsweredThisDevice({
      response,
      signingKeyFingerprintHex: device,
    })).not.toThrow();
  });

  it('refuses an answer issued to another device', () => {
    // The address would belong to a relationship this device is not in, and
    // filing it produces an entry that stops working at the next rotation
    // with nothing to point at.
    expect(() => assertPicoLinkMailboxExchangeAnsweredThisDevice({
      response,
      signingKeyFingerprintHex: other,
    })).toThrow('pico_link_mailbox_exchange_answered_another_device');
  });
});
