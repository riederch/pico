import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { picoRelayOperatorHeader, picoRelayOperatorRoutes } from '@pico/protocol/link-relay-operator';
import {
  claimPicoCompanionRelay,
  createPicoCompanionRelayAccount,
  defaultPicoCompanionRelayOperatorsPath,
  forgetPicoCompanionRelay,
  readPicoCompanionRelayAccounts,
  readPicoCompanionRelayOperators,
  revokePicoCompanionRelayAccount,
} from './relay-operator.js';
import type { PicoCompanionPlatformSecretPort } from './platform-unlock.js';

/**
 * ADR 0154 - the device side, and the one property everything else serves:
 * the operator credential is written once, into the OS keystore, and never
 * comes back out to a caller.
 */
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function path(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-relay-operator-companion-'));
  dirs.push(dir);
  return defaultPicoCompanionRelayOperatorsPath(join(dir, 'profile.json'));
}

/** A keystore that encrypts by reversing, which is enough to prove custody. */
function keystore(overrides: Partial<PicoCompanionPlatformSecretPort> = {}): PicoCompanionPlatformSecretPort {
  return {
    platform: 'linux',
    selectedBackend: () => 'gnome_libsecret',
    isEncryptionAvailable: () => true,
    encryptString: (plain) => new TextEncoder().encode([...plain].reverse().join('')),
    decryptString: (encrypted) => [...new TextDecoder().decode(encrypted)].reverse().join(''),
    ...overrides,
  };
}

const credential = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

/** A relay that claims once and then answers as a claimed one. */
function relayHost(state: { claimed: boolean; accounts: Array<Record<string, unknown>> }) {
  return (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const route = new URL(String(url)).pathname;
    const headers = new Headers(init?.headers);
    const body = init?.body === undefined
      ? {}
      : JSON.parse(String(init.body)) as Record<string, unknown>;

    if (route === picoRelayOperatorRoutes.claim) {
      if (state.claimed) {
        return new Response(JSON.stringify({ refusal: 'already_claimed' }), { status: 409 });
      }
      if (body.claimCode !== 'A'.repeat(43)) {
        return new Response(JSON.stringify({ refusal: 'invalid_claim_code' }), { status: 409 });
      }
      state.claimed = true;
      return new Response(JSON.stringify({ credential, operator: 'relay.example' }), { status: 200 });
    }
    if (headers.get(picoRelayOperatorHeader) !== credential) {
      return new Response(JSON.stringify({ error: 'invalid_pico_relay_operator_credential' }), {
        status: 401,
      });
    }
    if (route === picoRelayOperatorRoutes.accountCreate) {
      const account = {
        accountRef: '0123456789ab',
        status: 'active',
        mailboxQuota: body.mailboxQuota,
        maxCapacity: body.maxCapacity,
        openMailboxes: 0,
        createdAt: '2026-08-16T12:00:00.000Z',
      };
      state.accounts.push(account);
      return new Response(
        JSON.stringify({ account, credential: 'f'.repeat(32) }),
        { status: 200 },
      );
    }
    if (route === picoRelayOperatorRoutes.accountList) {
      return new Response(JSON.stringify({ accounts: state.accounts }), { status: 200 });
    }
    if (route === picoRelayOperatorRoutes.accountRevoke) {
      return new Response(
        JSON.stringify({ accountRef: body.accountRef, status: 'revoked' }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
  }) as unknown as typeof globalThis.fetch;
}

describe('ADR 0154 RO2 - claiming from the client', () => {
  it('keeps the credential encrypted and never in the file', async () => {
    const file = path();
    const state = { claimed: false, accounts: [] as Array<Record<string, unknown>> };

    const claimed = await claimPicoCompanionRelay({
      path: file,
      baseUrl: 'https://relay.example:3202/',
      claimCode: 'A'.repeat(43),
      secrets: keystore(),
      at: '2026-08-16T12:00:00.000Z',
      fetch: relayHost(state),
    });
    expect(claimed).toEqual({ ok: true, operator: 'relay.example' });

    const raw = readFileSync(file, 'utf8');
    expect(raw).not.toContain(credential);
    // Decoded, because base64 hides a plaintext credential from a substring
    // check - which is exactly how a test can pass while the file holds the
    // key. What is stored has to be unreadable, not merely unrecognisable.
    const stored = JSON.parse(raw) as {
      relays: Array<{ encryptedCredentialBase64: string }>;
    };
    expect(Buffer.from(stored.relays[0]!.encryptedCredentialBase64, 'base64').toString('utf8'))
      .not.toContain(credential);
    // The trailing slash is gone: one relay, one record, whatever was typed.
    expect(raw).toContain('https://relay.example:3202"');
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('offers a surface the relay and no key', async () => {
    const file = path();
    await claimPicoCompanionRelay({
      path: file,
      baseUrl: 'https://relay.example:3202',
      claimCode: 'A'.repeat(43),
      secrets: keystore(),
      at: '2026-08-16T12:00:00.000Z',
      fetch: relayHost({ claimed: false, accounts: [] }),
    });

    // ADR 0113 C2. What a window may be told about a relay is where it is and
    // what it calls itself.
    expect(readPicoCompanionRelayOperators(file)).toEqual([{
      baseUrl: 'https://relay.example:3202',
      operator: 'relay.example',
      claimedAt: '2026-08-16T12:00:00.000Z',
    }]);
  });

  it('refuses a keystore that would store the credential in the clear', async () => {
    // ADR 0081 P3's rule, inherited rather than restated: `basic_text` is
    // Electron's "we could not find a real keystore", and accepting it would
    // put a bearer credential in a file with a lock painted on it.
    await expect(claimPicoCompanionRelay({
      path: path(),
      baseUrl: 'https://relay.example:3202',
      claimCode: 'A'.repeat(43),
      secrets: keystore({ selectedBackend: () => 'basic_text' }),
      at: '2026-08-16T12:00:00.000Z',
      fetch: relayHost({ claimed: false, accounts: [] }),
    })).rejects.toThrow('platform_keystore_plaintext_refused');
  });

  it('demands the keystore before spending the code', async () => {
    // A claim consumes a single-use code. Spending it and then finding
    // nowhere to put the answer would leave an operator with a relay they
    // cannot administer until they restart it.
    const state = { claimed: false, accounts: [] as Array<Record<string, unknown>> };
    await expect(claimPicoCompanionRelay({
      path: path(),
      baseUrl: 'https://relay.example:3202',
      claimCode: 'A'.repeat(43),
      secrets: keystore({ isEncryptionAvailable: () => false }),
      at: '2026-08-16T12:00:00.000Z',
      fetch: relayHost(state),
    })).rejects.toThrow('platform_keystore_unavailable');
    expect(state.claimed).toBe(false);
  });

  it('refuses to claim the same relay twice on one device', async () => {
    const file = path();
    const state = { claimed: false, accounts: [] as Array<Record<string, unknown>> };
    const input = {
      path: file,
      baseUrl: 'https://relay.example:3202',
      claimCode: 'A'.repeat(43),
      secrets: keystore(),
      at: '2026-08-16T12:00:00.000Z',
      fetch: relayHost(state),
    };
    expect((await claimPicoCompanionRelay(input)).ok).toBe(true);
    expect(await claimPicoCompanionRelay(input))
      .toEqual({ ok: false, refusal: 'relay_already_claimed_here' });
  });

  it('carries the relay\'s own refusal rather than a shape of its own', async () => {
    expect(await claimPicoCompanionRelay({
      path: path(),
      baseUrl: 'https://relay.example:3202',
      claimCode: 'B'.repeat(43),
      secrets: keystore(),
      at: '2026-08-16T12:00:00.000Z',
      fetch: relayHost({ claimed: false, accounts: [] }),
    })).toEqual({ ok: false, refusal: 'invalid_claim_code' });
  });
});

describe('ADR 0154 RO3/RO5/RO6 - administering from the client', () => {
  async function claimedFile(): Promise<{
    file: string;
    state: { claimed: boolean; accounts: Array<Record<string, unknown>> };
  }> {
    const file = path();
    const state = { claimed: false, accounts: [] as Array<Record<string, unknown>> };
    await claimPicoCompanionRelay({
      path: file,
      baseUrl: 'https://relay.example:3202',
      claimCode: 'A'.repeat(43),
      secrets: keystore(),
      at: '2026-08-16T12:00:00.000Z',
      fetch: relayHost(state),
    });
    return { file, state };
  }

  it('creates an account and hands back the credential the relay issued', async () => {
    const { file, state } = await claimedFile();
    const created = await createPicoCompanionRelayAccount({
      path: file,
      baseUrl: 'https://relay.example:3202',
      mailboxQuota: 4,
      maxCapacity: 32,
      secrets: keystore(),
      fetch: relayHost(state),
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.issued.credential).toBe('f'.repeat(32));
      expect(created.issued.account.accountRef).toBe('0123456789ab');
    }
  });

  it('refuses bounds outside what the protocol allows, without a round trip', async () => {
    const { file } = await claimedFile();
    const refusingFetch = (() => {
      throw new Error('should not have been called');
    }) as unknown as typeof globalThis.fetch;

    expect(await createPicoCompanionRelayAccount({
      path: file,
      baseUrl: 'https://relay.example:3202',
      mailboxQuota: 0,
      maxCapacity: 8,
      secrets: keystore(),
      fetch: refusingFetch,
    })).toEqual({ ok: false, refusal: 'invalid_pico_relay_mailbox_quota' });

    expect(await createPicoCompanionRelayAccount({
      path: file,
      baseUrl: 'https://relay.example:3202',
      mailboxQuota: 1,
      maxCapacity: 10_001,
      secrets: keystore(),
      fetch: refusingFetch,
    })).toEqual({ ok: false, refusal: 'invalid_pico_relay_account_capacity' });
  });

  it('lists and revokes', async () => {
    const { file, state } = await claimedFile();
    await createPicoCompanionRelayAccount({
      path: file,
      baseUrl: 'https://relay.example:3202',
      mailboxQuota: 1,
      maxCapacity: 8,
      secrets: keystore(),
      fetch: relayHost(state),
    });

    const listed = await readPicoCompanionRelayAccounts({
      path: file,
      baseUrl: 'https://relay.example:3202',
      secrets: keystore(),
      fetch: relayHost(state),
    });
    expect(listed.ok && listed.accounts).toHaveLength(1);

    expect(await revokePicoCompanionRelayAccount({
      path: file,
      baseUrl: 'https://relay.example:3202',
      accountRef: '0123456789ab',
      secrets: keystore(),
      fetch: relayHost(state),
    })).toEqual({ ok: true });
  });

  it('says so rather than guessing when this device never claimed the relay', async () => {
    expect(await readPicoCompanionRelayAccounts({
      path: path(),
      baseUrl: 'https://elsewhere.example:3202',
      secrets: keystore(),
      fetch: relayHost({ claimed: true, accounts: [] }),
    })).toEqual({ ok: false, refusal: 'relay_not_claimed_here' });
  });

  it('refuses when the keystore backend changed under the ciphertext', async () => {
    const { file, state } = await claimedFile();
    expect(await readPicoCompanionRelayAccounts({
      path: file,
      baseUrl: 'https://relay.example:3202',
      secrets: keystore({ selectedBackend: () => 'kwallet6' }),
      fetch: relayHost(state),
    })).toEqual({ ok: false, refusal: 'platform_keystore_backend_changed' });
  });

  it('forgets a relay, and that is the only copy of the credential', async () => {
    const { file } = await claimedFile();
    expect(forgetPicoCompanionRelay({ path: file, baseUrl: 'https://relay.example:3202' }))
      .toBe(true);
    expect(readPicoCompanionRelayOperators(file)).toEqual([]);
    // The relay still considers itself claimed. Getting back in means the
    // reset marker and a restart (RO8), which is the honest cost.
    expect(forgetPicoCompanionRelay({ path: file, baseUrl: 'https://relay.example:3202' }))
      .toBe(false);
  });
});
