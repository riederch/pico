import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { picoLinkMailboxExchangeResponseSchema } from '@pico/protocol/link-mailbox-exchange';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearPicoCompanionLinkMailbox,
  defaultPicoCompanionLinkMailboxPath,
  exchangePicoCompanionLinkMailbox,
  issuePicoCompanionLinkMailbox,
  parsePicoCompanionLinkMailbox,
  picoCompanionLinkMailboxSchema,
  readPicoCompanionLinkMailbox,
  writePicoCompanionLinkMailbox,
} from './link-mailbox.js';
import type { PicoCompanionProfile } from './profile.js';

/**
 * ADR 0148, the device half. The device issues its own address, hands it over,
 * checks the answer belongs to the key it signed with, and only then writes.
 */
const tempDirs: string[] = [];
const operator = 'relay.example.invalid';
const deviceFingerprint = 'd'.repeat(64);
const otherFingerprint = 'e'.repeat(64);
const homeInbound = `${'a'.repeat(32)}@${operator}`;

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function profilePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-companion-mailbox-'));
  tempDirs.push(dir);
  return join(dir, 'profile.json');
}

const profile = {
  device: { signingKeyFingerprintHex: deviceFingerprint },
} as unknown as PicoCompanionProfile;

/** A Link client that answers one operation and records what it was asked. */
function linkClient(over: {
  outcome?: string;
  result?: unknown;
  seen?: Array<{ operation: string; args: unknown }>;
} = {}) {
  return {
    request: async (operation: string, args: unknown) => {
      over.seen?.push({ operation, args });
      return {
        outcome: over.outcome ?? 'ok',
        result: over.result ?? {
          schema: picoLinkMailboxExchangeResponseSchema,
          homeInbound,
          peerFingerprintHex: deviceFingerprint,
        },
      };
    },
  } as never;
}

describe('ADR 0147 RY2 - the device issues its own inbound address', () => {
  it('issues 128 bits at the operator it was given', () => {
    const address = issuePicoCompanionLinkMailbox(operator);
    expect(address).toMatch(new RegExp(`^[0-9a-f]{32}@${operator.replace(/\./g, '\\.')}$`, 'u'));
  });

  it('issues a different one every time, or it would not be a rotation', () => {
    const issued = new Set(Array.from({ length: 32 }, () => issuePicoCompanionLinkMailbox(operator)));
    expect(issued.size).toBe(32);
  });
});

describe('ADR 0148 EX1/EX2 - the exchange', () => {
  it('hands over the address it issued and files what came back', async () => {
    const seen: Array<{ operation: string; args: unknown }> = [];
    const mailbox = await exchangePicoCompanionLinkMailbox({
      linkClient: linkClient({ seen }),
      profile,
      operator,
      now: () => new Date('2026-08-12T12:00:00.000Z'),
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.operation).toBe('home.link.mailbox.exchange');
    expect((seen[0]?.args as { deviceInbound: string }).deviceInbound).toBe(mailbox.inbound);
    expect(mailbox.outbound).toBe(homeInbound);
    expect(mailbox.deviceSigningKeyFingerprintHex).toBe(deviceFingerprint);
    expect(mailbox.exchangedAt).toBe('2026-08-12T12:00:00.000Z');
  });

  it('never tells the Home which device it is', async () => {
    // ADR 0148 EX2. The Home reads that from the authenticated principal, and
    // a request carrying it would be a device choosing which mailbox it is.
    const seen: Array<{ operation: string; args: unknown }> = [];
    await exchangePicoCompanionLinkMailbox({ linkClient: linkClient({ seen }), profile, operator });
    expect(Object.keys(seen[0]?.args as object).sort()).toEqual(['deviceInbound', 'schema']);
  });

  it('refuses an answer issued to another device', async () => {
    await expect(exchangePicoCompanionLinkMailbox({
      linkClient: linkClient({
        result: {
          schema: picoLinkMailboxExchangeResponseSchema,
          homeInbound,
          peerFingerprintHex: otherFingerprint,
        },
      }),
      profile,
      operator,
    })).rejects.toThrow('pico_link_mailbox_exchange_answered_another_device');
  });

  it('refuses an answer that hands back the address we just issued', async () => {
    // Nothing legitimate produces it, and filing it would make this device
    // write to its own mailbox.
    const client = {
      request: async (_operation: string, args: { deviceInbound: string }) => ({
        outcome: 'ok',
        result: {
          schema: picoLinkMailboxExchangeResponseSchema,
          homeInbound: args.deviceInbound,
          peerFingerprintHex: deviceFingerprint,
        },
      }),
    } as never;
    await expect(exchangePicoCompanionLinkMailbox({ linkClient: client, profile, operator }))
      .rejects.toThrow('pico_link_mailbox_points_at_itself');
  });

  it('names a refused exchange rather than swallowing it', async () => {
    // A silent failure leaves a device that believes it is reachable and is
    // not - the state a relay exists to prevent.
    await expect(exchangePicoCompanionLinkMailbox({
      linkClient: linkClient({ outcome: 'invalid_arguments' }),
      profile,
      operator,
    })).rejects.toThrow('link_mailbox_exchange_rejected:invalid_arguments');
  });

  it('writes nothing when the exchange fails', async () => {
    // Issue, exchange, check, write. A device that recorded its inbound first
    // would hold an address it had told nobody about and believe the Home
    // could reach it.
    const path = defaultPicoCompanionLinkMailboxPath(profilePath());
    await exchangePicoCompanionLinkMailbox({
      linkClient: linkClient({ outcome: 'unauthorized' }),
      profile,
      operator,
    }).catch(() => undefined);
    expect(existsSync(path)).toBe(false);
  });
});

describe('ADR 0148 - the device-local record', () => {
  const record = {
    schema: picoCompanionLinkMailboxSchema,
    inbound: `${'1'.repeat(32)}@${operator}`,
    outbound: homeInbound,
    deviceSigningKeyFingerprintHex: deviceFingerprint,
    exchangedAt: '2026-08-12T12:00:00.000Z',
  };

  it('round-trips through an atomic 0600 write', () => {
    const path = defaultPicoCompanionLinkMailboxPath(profilePath());
    writePicoCompanionLinkMailbox(path, record);
    expect(readPicoCompanionLinkMailbox(path)).toEqual(record);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it('sits beside the profile rather than anywhere of its own', () => {
    const profile = profilePath();
    expect(defaultPicoCompanionLinkMailboxPath(profile))
      .toBe(join(profile, '..', 'link-mailbox.json'));
  });

  it('answers null before the first exchange, and clears', () => {
    const path = defaultPicoCompanionLinkMailboxPath(profilePath());
    expect(readPicoCompanionLinkMailbox(path)).toBeNull();
    writePicoCompanionLinkMailbox(path, record);
    clearPicoCompanionLinkMailbox(path);
    expect(readPicoCompanionLinkMailbox(path)).toBeNull();
    expect(() => clearPicoCompanionLinkMailbox(path)).not.toThrow();
  });

  it('refuses a record whose schema names a version this build does not have', () => {
    /**
     * The schema word is the one refusal in this parser that no test walked
     * until 2026-09-15 (B181). It cannot fire for a *foreign* document - the
     * key checks above refuse that first - so the only value it ever sees is
     * one of our own files carrying a version this build does not have, which
     * is what the first read after an upgrade hands it.
     */
    expect(() => parsePicoCompanionLinkMailbox({ ...record, schema: 'pico.companion.link-mailbox.v2' }))
      .toThrow('invalid_companion_link_mailbox_schema');
  });

  it('refuses a record whose two addresses are the same', () => {
    expect(() => parsePicoCompanionLinkMailbox({ ...record, outbound: record.inbound }))
      .toThrow('pico_link_mailbox_points_at_itself');
  });

  it('refuses an unknown key, a missing one and a bad address', () => {
    expect(() => parsePicoCompanionLinkMailbox({ ...record, operator }))
      .toThrow('companion_link_mailbox_carries_no:operator');
    const { outbound: _dropped, ...without } = record;
    expect(() => parsePicoCompanionLinkMailbox(without))
      .toThrow('missing_companion_link_mailbox_field:outbound');
    expect(() => parsePicoCompanionLinkMailbox({ ...record, inbound: 'device-1' }))
      .toThrow('invalid_pico_link_address');
    expect(() => parsePicoCompanionLinkMailbox({ ...record, deviceSigningKeyFingerprintHex: 'd' }))
      .toThrow('invalid_pico_link_peer');
  });

  it('names an unreadable file rather than answering null', () => {
    // Null means "no exchange yet". A corrupt file answering null would make a
    // device silently re-exchange and leave the Home holding an address it
    // will never be written to.
    const path = defaultPicoCompanionLinkMailboxPath(profilePath());
    writeFileSync(path, '{ not json');
    expect(() => readPicoCompanionLinkMailbox(path)).toThrow('unreadable_companion_link_mailbox');
    expect(readFileSync(path, 'utf8')).toBe('{ not json');
  });
});
