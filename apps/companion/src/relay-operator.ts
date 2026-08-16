import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  PicoRelayOperatorClient,
  type PicoRelayIssuedAccount,
} from '@pico/link-relay-client';
import {
  maxPicoRelayAccountCapacity,
  maxPicoRelayMailboxQuota,
  picoRelayOperatorCredentialPattern,
  type PicoRelayAccountSummary,
} from '@pico/protocol/link-relay-operator';
import {
  requirePicoCompanionKeystoreBackend,
  type PicoCompanionLinuxKeystoreBackend,
  type PicoCompanionPlatformSecretPort,
} from './platform-secrets.js';

/**
 * ADR 0154 - the device side of administering a relay, with no terminal
 * anywhere on the path.
 *
 * **The credential lives in the OS keystore, not in a JSON file and not in
 * the Home.** The Home is deliberately not involved: a relay operator need not
 * have one, and a transport that can only be administered while some
 * household's Home is running has the availability shape ADR 0153 rejected for
 * the relay itself. So this device holds it, under the same rules ADR 0081 P3
 * already put on the automatic unlock secret - a real keystore backend or
 * nothing, `basic_text` refused by name rather than accepted quietly.
 *
 * What is on disk is a pointer and a ciphertext: where the relay answers, what
 * hostname it answers as, and the credential encrypted by a key this process
 * cannot read without the running desktop session.
 *
 * **The client is constructed here rather than injected as a port**, which is
 * the opposite of what `link-relay-sweep.ts` does and is deliberate: the
 * decrypted credential must not leave this layer. A port would mean the shell
 * builds the client, and then the credential has to be handed to it. Here it
 * is read from the keystore, used, and never returned to a caller.
 */

export const picoCompanionRelayOperatorsSchema =
  'pico.companion.relay-operators.v1' as const;

export interface PicoCompanionRelayOperatorRecord {
  /** Where the administration listener answers (ADR 0154 RO1). */
  baseUrl: string;
  /** The hostname senders resolve to reach it (ADR 0147 RY3). */
  operator: string;
  backend: PicoCompanionLinuxKeystoreBackend;
  encryptedCredentialBase64: string;
  claimedAt: string;
}

interface PicoCompanionRelayOperatorsFile {
  schema: typeof picoCompanionRelayOperatorsSchema;
  relays: PicoCompanionRelayOperatorRecord[];
}

export function defaultPicoCompanionRelayOperatorsPath(profilePath: string): string {
  return join(dirname(profilePath), 'relay-operators.json');
}

/**
 * What a surface may show about a relay this device administers.
 *
 * No credential and no ciphertext: a view that carried either would put a key
 * on the IPC channel to the renderer, which ADR 0113 C2 forbids for exactly
 * the reason it looks harmless.
 */
export interface PicoCompanionRelayOperatorView {
  baseUrl: string;
  operator: string;
  claimedAt: string;
}

export function readPicoCompanionRelayOperators(
  path: string,
): readonly PicoCompanionRelayOperatorView[] {
  return Object.freeze(readFile(path).relays.map((relay) => Object.freeze({
    baseUrl: relay.baseUrl,
    operator: relay.operator,
    claimedAt: relay.claimedAt,
  })));
}

/**
 * ADR 0154 RO2. Trades a claim code for the operator credential and keeps it.
 *
 * **The keystore is checked before the code is spent.** A claim consumes a
 * single-use code; doing that and then discovering there is nowhere to put the
 * answer would leave the operator with a relay they can never administer until
 * they restart it. So the backend is demanded first, and the round trip is
 * only made if there is somewhere for the answer to land.
 */
export async function claimPicoCompanionRelay(input: {
  path: string;
  baseUrl: string;
  claimCode: string;
  secrets: PicoCompanionPlatformSecretPort;
  at: string;
  fetch?: typeof globalThis.fetch;
}): Promise<{ ok: true; operator: string } | { ok: false; refusal: string }> {
  const backend = requirePicoCompanionKeystoreBackend(input.secrets);
  const file = readFile(input.path);
  if (file.relays.some((relay) => relay.baseUrl === normalizeUrl(input.baseUrl))) {
    // Two records for one relay would be two credentials for one machine, and
    // the second claim cannot succeed anyway - the relay refuses it.
    return { ok: false, refusal: 'relay_already_claimed_here' };
  }

  const client = new PicoRelayOperatorClient({
    baseUrl: input.baseUrl,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });
  const claimed = await client.claim(input.claimCode);
  if (!claimed.ok) {
    return { ok: false, refusal: claimed.refusal };
  }
  if (!picoRelayOperatorCredentialPattern.test(claimed.value.credential)) {
    throw new Error('invalid_pico_relay_operator_credential');
  }

  const encrypted = input.secrets.encryptString(claimed.value.credential);
  if (!(encrypted instanceof Uint8Array)
    || encrypted.byteLength === 0
    || encrypted.byteLength > 16 * 1_024) {
    throw new Error('invalid_relay_operator_ciphertext');
  }
  file.relays.push({
    baseUrl: normalizeUrl(input.baseUrl),
    operator: claimed.value.operator,
    backend,
    encryptedCredentialBase64: Buffer.from(encrypted).toString('base64'),
    claimedAt: input.at,
  });
  writeFile(input.path, file);
  return { ok: true, operator: claimed.value.operator };
}

/** ADR 0154 RO3. Issues an account and hands its credential back once. */
export async function createPicoCompanionRelayAccount(input: {
  path: string;
  baseUrl: string;
  mailboxQuota: number;
  maxCapacity: number;
  secrets: PicoCompanionPlatformSecretPort;
  fetch?: typeof globalThis.fetch;
}): Promise<{ ok: true; issued: PicoRelayIssuedAccount } | { ok: false; refusal: string }> {
  if (!Number.isInteger(input.mailboxQuota)
    || input.mailboxQuota <= 0
    || input.mailboxQuota > maxPicoRelayMailboxQuota) {
    return { ok: false, refusal: 'invalid_pico_relay_mailbox_quota' };
  }
  if (!Number.isInteger(input.maxCapacity)
    || input.maxCapacity <= 0
    || input.maxCapacity > maxPicoRelayAccountCapacity) {
    return { ok: false, refusal: 'invalid_pico_relay_account_capacity' };
  }
  return await withCredential(input, async (client, credential) => {
    const created = await client.createAccount({
      credential,
      mailboxQuota: input.mailboxQuota,
      maxCapacity: input.maxCapacity,
    });
    return created.ok
      ? { ok: true as const, issued: created.value }
      : { ok: false as const, refusal: created.refusal };
  });
}

/** ADR 0154 RO5. Ends an account by the handle the relay named it with. */
export async function revokePicoCompanionRelayAccount(input: {
  path: string;
  baseUrl: string;
  accountRef: string;
  secrets: PicoCompanionPlatformSecretPort;
  fetch?: typeof globalThis.fetch;
}): Promise<{ ok: true } | { ok: false; refusal: string }> {
  return await withCredential(input, async (client, credential) => {
    const revoked = await client.revokeAccount({ credential, accountRef: input.accountRef });
    return revoked.ok ? { ok: true as const } : { ok: false as const, refusal: revoked.refusal };
  });
}

export async function readPicoCompanionRelayAccounts(input: {
  path: string;
  baseUrl: string;
  secrets: PicoCompanionPlatformSecretPort;
  fetch?: typeof globalThis.fetch;
}): Promise<
  { ok: true; accounts: readonly PicoRelayAccountSummary[] } | { ok: false; refusal: string }
  > {
  return await withCredential(input, async (client, credential) => {
    const listed = await client.listAccounts(credential);
    return listed.ok
      ? { ok: true as const, accounts: listed.value }
      : { ok: false as const, refusal: listed.refusal };
  });
}

/** Forgets a relay on this device. The relay itself is untouched. */
export function forgetPicoCompanionRelay(input: { path: string; baseUrl: string }): boolean {
  const file = readFile(input.path);
  const target = normalizeUrl(input.baseUrl);
  const before = file.relays.length;
  file.relays = file.relays.filter((relay) => relay.baseUrl !== target);
  if (file.relays.length === before) {
    return false;
  }
  writeFile(input.path, file);
  // Said plainly rather than implied: this drops the only copy of the
  // credential. The relay still considers itself claimed, and getting back in
  // means `/data/operator-reset` and a restart (ADR 0154 RO8).
  return true;
}

async function withCredential<TResult extends { ok: boolean }>(
  input: {
    path: string;
    baseUrl: string;
    secrets: PicoCompanionPlatformSecretPort;
    fetch?: typeof globalThis.fetch;
  },
  use: (client: PicoRelayOperatorClient, credential: string) => Promise<TResult>,
): Promise<TResult | { ok: false; refusal: string }> {
  const target = normalizeUrl(input.baseUrl);
  const record = readFile(input.path).relays.find((relay) => relay.baseUrl === target);
  if (record === undefined) {
    return { ok: false, refusal: 'relay_not_claimed_here' };
  }
  const backend = requirePicoCompanionKeystoreBackend(input.secrets);
  if (record.backend !== backend) {
    // The same refusal the unlock record makes: a keystore that changed under
    // the ciphertext will not decrypt it, and saying so beats a decrypt error.
    return { ok: false, refusal: 'platform_keystore_backend_changed' };
  }
  const credential = input.secrets.decryptString(
    Buffer.from(record.encryptedCredentialBase64, 'base64'),
  );
  if (!picoRelayOperatorCredentialPattern.test(credential)) {
    return { ok: false, refusal: 'invalid_pico_relay_operator_credential' };
  }
  const client = new PicoRelayOperatorClient({
    baseUrl: record.baseUrl,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });
  return await use(client, credential);
}

function normalizeUrl(value: string): string {
  if (typeof value !== 'string' || !/^https?:\/\/[^\s]+$/u.test(value)) {
    throw new Error('invalid_pico_relay_operator_base_url');
  }
  return value.replace(/\/+$/u, '');
}

function readFile(path: string): PicoCompanionRelayOperatorsFile {
  if (!existsSync(path)) {
    return { schema: picoCompanionRelayOperatorsSchema, relays: [] };
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('invalid_pico_companion_relay_operators');
  }
  const record = parsed as Record<string, unknown>;
  if (record.schema !== picoCompanionRelayOperatorsSchema || !Array.isArray(record.relays)) {
    throw new Error('invalid_pico_companion_relay_operators');
  }
  return {
    schema: picoCompanionRelayOperatorsSchema,
    relays: (record.relays as PicoCompanionRelayOperatorRecord[]).map((relay) => {
      if (typeof relay?.baseUrl !== 'string'
        || typeof relay.operator !== 'string'
        || typeof relay.backend !== 'string'
        || typeof relay.encryptedCredentialBase64 !== 'string'
        || typeof relay.claimedAt !== 'string') {
        throw new Error('invalid_pico_companion_relay_operators');
      }
      return relay;
    }),
  };
}

function writeFile(path: string, file: PicoCompanionRelayOperatorsFile): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  fsyncPath(temporaryPath, 'r+');
  renameSync(temporaryPath, path);
  fsyncPath(dirname(path), 'r');
}

function fsyncPath(path: string, flags: 'r' | 'r+'): void {
  const handle = openSync(path, flags);
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}
