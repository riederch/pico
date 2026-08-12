import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  assertPicoLinkMailboxExchangeAnsweredThisDevice,
  parsePicoLinkMailboxExchangeResponse,
  picoLinkMailboxExchangeRequestSchema,
} from '@pico/protocol/link-mailbox-exchange';
import {
  formatPicoLinkPacketAddress,
  parsePicoLinkPacketAddress,
} from '@pico/protocol/link-packet';
import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';
import type { PicoCompanionProfile } from './profile.js';

/**
 * ADR 0148, the device half. What this device holds after exchanging relay
 * mailbox addresses with its own Home.
 *
 * Two addresses, issued by opposite sides (ADR 0147 RY2). `inbound` is the one
 * this device issued and handed over, so the Home writes there; `outbound` is
 * the one the Home issued, so this device writes there. Neither is a secret in
 * the key sense and both are capabilities: anyone who learns a mailbox can
 * fill it, and a full mailbox refuses (ADR 0147 RY6), so the file is written
 * `0600` beside the profile like every other device-local record here.
 *
 * **It holds one relationship, deliberately.** A device has exactly one Home
 * in the product this ADR serves, and a book keyed by peer would be a shape
 * with one entry pretending to be general. The Home's side is the book,
 * because a Home holds many devices; this side is a pair.
 */
export const picoCompanionLinkMailboxSchema =
  'pico.companion.link-mailbox.v1' as const;

export interface PicoCompanionLinkMailbox {
  schema: typeof picoCompanionLinkMailboxSchema;
  /** Issued by this device; the Home sends here. */
  inbound: string;
  /** Issued by the Home; this device sends there. */
  outbound: string;
  /**
   * The device key the Home said it issued to, checked against the one this
   * device signs with before anything is written (ADR 0148 EX2).
   */
  deviceSigningKeyFingerprintHex: string;
  exchangedAt: string;
}

export function defaultPicoCompanionLinkMailboxPath(profilePath: string): string {
  return join(dirname(profilePath), 'link-mailbox.json');
}

/**
 * ADR 0147 RY2/RY3. A fresh mailbox at the operator this device uses.
 *
 * 128 bits from the system CSPRNG, because an address somebody can guess is an
 * open relay into this device's one relationship. Issued here rather than
 * asked of the Home: an address is *ours* to issue and theirs to write to, and
 * a device that let its Home name its inbound mailbox would have handed over
 * the one thing it can revoke on its own.
 *
 * **Registering it at the operator is the caller's precondition.** ADR 0148
 * does not try to detect an unregistered address - the difference between one
 * that was never registered and one whose operator is briefly unreachable is
 * not visible from here, and guessing would turn a network into a refusal.
 */
export function issuePicoCompanionLinkMailbox(operator: string): string {
  return formatPicoLinkPacketAddress({
    mailbox: randomBytes(16).toString('hex'),
    operator,
  });
}

export function parsePicoCompanionLinkMailbox(value: unknown): PicoCompanionLinkMailbox {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_companion_link_mailbox');
  }
  const record = value as Record<string, unknown>;
  const known = ['schema', 'inbound', 'outbound', 'deviceSigningKeyFingerprintHex', 'exchangedAt'];
  const unexpected = Object.keys(record).find((key) => !known.includes(key));
  if (unexpected !== undefined) {
    throw new Error(`companion_link_mailbox_carries_no:${unexpected}`);
  }
  const missing = known.find((key) => !(key in record));
  if (missing !== undefined) {
    throw new Error(`missing_companion_link_mailbox_field:${missing}`);
  }
  if (record.schema !== picoCompanionLinkMailboxSchema) {
    throw new Error('invalid_companion_link_mailbox_schema');
  }
  if (typeof record.inbound !== 'string' || typeof record.outbound !== 'string') {
    throw new Error('invalid_pico_link_address');
  }
  parsePicoLinkPacketAddress(record.inbound);
  parsePicoLinkPacketAddress(record.outbound);
  if (record.inbound === record.outbound) {
    // We would write to the mailbox we told the Home to write to, so our own
    // traffic would come back as theirs (ADR 0147 RY2).
    throw new Error('pico_link_mailbox_points_at_itself');
  }
  if (typeof record.deviceSigningKeyFingerprintHex !== 'string'
    || !/^[0-9a-f]{64}$/u.test(record.deviceSigningKeyFingerprintHex)) {
    throw new Error('invalid_pico_link_peer');
  }
  if (typeof record.exchangedAt !== 'string' || record.exchangedAt === '') {
    throw new Error('invalid_companion_link_mailbox');
  }
  return Object.freeze({
    schema: picoCompanionLinkMailboxSchema,
    inbound: record.inbound,
    outbound: record.outbound,
    deviceSigningKeyFingerprintHex: record.deviceSigningKeyFingerprintHex,
    exchangedAt: record.exchangedAt,
  });
}

export function readPicoCompanionLinkMailbox(path: string): PicoCompanionLinkMailbox | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return parsePicoCompanionLinkMailbox(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    throw new Error(`unreadable_companion_link_mailbox:${(error as Error).message}`);
  }
}

export function writePicoCompanionLinkMailbox(
  path: string,
  mailbox: PicoCompanionLinkMailbox,
): void {
  const parsed = parsePicoCompanionLinkMailbox(mailbox);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  fsyncPath(temporaryPath, 'r+');
  renameSync(temporaryPath, path);
  fsyncPath(dirname(path), 'r');
}

export function clearPicoCompanionLinkMailbox(path: string): void {
  if (!existsSync(path)) {
    return;
  }
  unlinkSync(path);
  fsyncPath(dirname(path), 'r');
}

/**
 * ADR 0148 EX1/EX4. Runs the exchange and files what came back.
 *
 * **The order is: issue, exchange, check, write.** Nothing is written before
 * the Home has answered, because a device that recorded its own inbound
 * address first would, on a failed exchange, hold an address it had told
 * nobody about - and would then believe the Home could reach it.
 *
 * Re-running is rotation (ADR 0148 EX5) and needs no separate call: a fresh
 * inbound is issued each time and the Home replaces its row, so the flooded
 * mailbox remedy and the first exchange are one path.
 */
export async function exchangePicoCompanionLinkMailbox(input: {
  linkClient: PicoLinkDirectClient;
  profile: PicoCompanionProfile;
  operator: string;
  now?: () => Date;
}): Promise<PicoCompanionLinkMailbox> {
  const inbound = issuePicoCompanionLinkMailbox(input.operator);

  const response = await input.linkClient.request('home.link.mailbox.exchange', {
    schema: picoLinkMailboxExchangeRequestSchema,
    deviceInbound: inbound,
  });
  if (response.outcome !== 'ok') {
    // Named rather than swallowed. A silent failure here leaves a device that
    // believes it is reachable and is not, which is the state a relay exists
    // to prevent.
    throw new Error(`link_mailbox_exchange_rejected:${response.outcome}`);
  }

  const answered = parsePicoLinkMailboxExchangeResponse(response.result);
  // ADR 0148 EX2. The Home says which device it issued to; this device knows
  // which key it signed with. A mismatch is an address for a relationship this
  // device is not in.
  assertPicoLinkMailboxExchangeAnsweredThisDevice({
    response: answered,
    signingKeyFingerprintHex: input.profile.device.signingKeyFingerprintHex,
  });
  if (answered.homeInbound === inbound) {
    // The Home handed back the address we just issued. Nothing legitimate
    // produces that, and filing it would make this device write to its own
    // mailbox.
    throw new Error('pico_link_mailbox_points_at_itself');
  }

  return Object.freeze({
    schema: picoCompanionLinkMailboxSchema,
    inbound,
    outbound: answered.homeInbound,
    deviceSigningKeyFingerprintHex: answered.peerFingerprintHex,
    exchangedAt: (input.now?.() ?? new Date()).toISOString(),
  });
}

function fsyncPath(path: string, flags: 'r' | 'r+'): void {
  const handle = openSync(path, flags);
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}
