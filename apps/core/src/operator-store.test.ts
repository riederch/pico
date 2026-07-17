import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';
import { OperatorOverloadedError, type OperatorStore } from './operator-store.js';
import { consumeOperatorResetMarker, OperatorBootstrapCode, operatorResetMarkerPath } from './operator-bootstrap.js';

const PASSPHRASE = 'correct horse battery staple';
const tempDirs: string[] = [];
const stores: EventStore[] = [];

function openOperators(): { operators: OperatorStore; databasePath: string } {
  const dir = mkdtempSync(join(tmpdir(), 'pico-operator-test-'));
  tempDirs.push(dir);

  const databasePath = join(dir, 'pico.sqlite');
  const store = new EventStore(databasePath);
  stores.push(store);

  return { operators: store.operators(sodium), databasePath };
}

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close();
  }

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('OperatorStore', () => {
  it('stores only an Argon2id verifier, never the passphrase', async () => {
    const { operators } = openOperators();

    expect(operators.exists()).toBe(false);
    await operators.create(PASSPHRASE);
    expect(operators.exists()).toBe(true);

    const record = operators.get();
    expect(record?.createdAt).toEqual(expect.any(String));

    // The stored verifier is an Argon2id string that does not contain the
    // passphrase; the parameters travel inside it.
    const verifier = readVerifier(operators);
    expect(verifier).toContain('$argon2id$');
    expect(verifier).not.toContain(PASSPHRASE);
  });

  it('verifies the right passphrase and rejects everything else', async () => {
    const { operators } = openOperators();
    await operators.create(PASSPHRASE);

    expect(await operators.verify(PASSPHRASE)).toBe(true);
    expect(await operators.verify('correct horse battery stapl')).toBe(false);
    expect(await operators.verify('')).toBe(false);
    expect(await operators.verify(undefined as unknown as string)).toBe(false);
  });

  it('reports no match when no operator exists, so absence looks like a wrong passphrase', async () => {
    const { operators } = openOperators();

    expect(await operators.verify(PASSPHRASE)).toBe(false);
  });

  it('refuses to bootstrap twice and refuses a too-short passphrase', async () => {
    const { operators } = openOperators();
    await operators.create(PASSPHRASE);

    await expect(operators.create('another passphrase entirely')).rejects.toThrow(/already exists/);

    const { operators: fresh } = openOperators();
    await expect(fresh.create('short')).rejects.toThrow(/at least/);
    expect(fresh.exists()).toBe(false);
  });

  it('requires the current passphrase to change it, so a stolen session cannot lock the operator out', async () => {
    const { operators } = openOperators();
    await operators.create(PASSPHRASE);

    expect(await operators.changePassphrase('wrong passphrase here', 'a brand new passphrase')).toBe(false);
    expect(await operators.verify(PASSPHRASE)).toBe(true);

    expect(await operators.changePassphrase(PASSPHRASE, 'a brand new passphrase')).toBe(true);
    expect(await operators.verify(PASSPHRASE)).toBe(false);
    expect(await operators.verify('a brand new passphrase')).toBe(true);
  });

  it('rejects excess concurrent verifications instead of piling up memory-hard work', async () => {
    const { operators } = openOperators();
    await operators.create(PASSPHRASE);

    // Each Argon2id verification holds a large allocation, so the queue is
    // bounded: beyond the cap the request fails instead of being admitted.
    const attempts = Array.from({ length: 12 }, () => operators.verify(PASSPHRASE));
    const results = await Promise.allSettled(attempts);

    const overloaded = results.filter(
      (result) => result.status === 'rejected' && result.reason instanceof OperatorOverloadedError,
    );
    const verified = results.filter((result) => result.status === 'fulfilled' && result.value === true);

    expect(overloaded.length).toBeGreaterThan(0);
    expect(verified.length).toBeGreaterThan(0);

    // The store stays usable once the burst drains.
    expect(await operators.verify(PASSPHRASE)).toBe(true);
  });

  it('clears the operator so the host returns to bootstrap', async () => {
    const { operators } = openOperators();
    await operators.create(PASSPHRASE);

    expect(operators.clear()).toBe(true);
    expect(operators.exists()).toBe(false);
    expect(operators.clear()).toBe(false);
    expect(await operators.verify(PASSPHRASE)).toBe(false);
  });
});

describe('OperatorBootstrapCode', () => {
  it('accepts its code exactly once', () => {
    const bootstrap = new OperatorBootstrapCode();

    expect(bootstrap.isPending()).toBe(false);
    expect(bootstrap.consume('anything')).toBe(false);

    const code = bootstrap.mint();
    expect(bootstrap.isPending()).toBe(true);
    expect(bootstrap.consume('wrong-code')).toBe(false);
    expect(bootstrap.consume(code)).toBe(true);

    // Single use: a leaked log line cannot be replayed after the first bootstrap.
    expect(bootstrap.consume(code)).toBe(false);
    expect(bootstrap.isPending()).toBe(false);
  });

  it('mints a fresh code per process and invalidates the previous one', () => {
    const bootstrap = new OperatorBootstrapCode();
    const first = bootstrap.mint();
    const second = bootstrap.mint();

    expect(second).not.toBe(first);
    expect(bootstrap.consume(first)).toBe(false);
    expect(bootstrap.consume(second)).toBe(true);
  });
});

describe('consumeOperatorResetMarker', () => {
  it('consumes the marker once so a reset happens on one restart, not every restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-operator-reset-test-'));
    tempDirs.push(dir);
    const databasePath = join(dir, 'pico.sqlite');

    expect(consumeOperatorResetMarker(databasePath)).toBe(false);

    writeFileSync(operatorResetMarkerPath(databasePath), '');
    expect(consumeOperatorResetMarker(databasePath)).toBe(true);
    expect(consumeOperatorResetMarker(databasePath)).toBe(false);
  });
});

function readVerifier(operators: OperatorStore): string {
  const db = (operators as unknown as { db: { prepare(sql: string): { get(): { credential_verifier: string } } } }).db;

  return db.prepare('SELECT credential_verifier FROM foundation_operator').get().credential_verifier;
}
