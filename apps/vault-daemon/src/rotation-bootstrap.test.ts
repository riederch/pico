import { spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { connectPicoVaultDaemonClient, type PicoVaultDaemonClient } from './client.js';

/**
 * ADR 0114 - the successor root of a rotation, made where it will live.
 *
 * **The third row of the bootstrap table** (Nutzerentscheidung 1 vom
 * 2026-09-22). `foundingBootstrap` and `deviceBootstrap` refuse a vault that
 * already holds keys; a rotation is the opposite case by definition, because
 * it happens in a living vault and the old root has to still be there while
 * the new one is made.
 *
 * Until today that was the one thing blocking the rotation ceremony on the
 * Vault side - not a design gap but a rule, and the rule was right for its
 * twins. So the rule is not relaxed here, it is stated the other way round,
 * and what this walk holds is the *bound*: exactly one successor, exactly
 * once. Without that, a door that may add a root to a living vault is a way
 * to fill one with roots.
 */
const children: ChildProcess[] = [];
const dirs: string[] = [];
const clients: PicoVaultDaemonClient[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) {
    await client.close();
  }
  for (const child of children.splice(0)) {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      child.once('exit', resolve);
      setTimeout(resolve, 4_000);
    });
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');
const CURRENT_PASSPHRASE = 'the-passphrase-this-vault-has-today';
const SUCCESSOR_PASSPHRASE = 'a-different-passphrase-for-the-successor';

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

async function startEmptyDaemon(): Promise<{ vaultHomePath: string; stderr: () => string }> {
  const vaultHomePath = tempDir('pico-rotation-vault-');
  const child = spawn(process.execPath, [
    CLI, 'daemon',
    '--vault-home', vaultHomePath,
    '--foundation-data', tempDir('pico-rotation-data-'),
    '--foundation-backup', tempDir('pico-rotation-backup-'),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);

  let stderr = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => { stderr += chunk; });

  await new Promise<void>((resolve, reject) => {
    let stdout = '';
    const timer = setTimeout(() => reject(new Error(`daemon_start_timeout:${stderr}`)), 20_000);
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.includes('\n')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`daemon_exited:${String(code)}:${stderr}`));
    });
  });

  return { vaultHomePath, stderr: () => stderr };
}

async function connect(vaultHomePath: string): Promise<PicoVaultDaemonClient> {
  const client = await connectPicoVaultDaemonClient({
    socketPath: join(vaultHomePath, 'run', 'daemon.sock'),
  });
  clients.push(client);
  await client.hello();
  return client;
}

const keyfiles = (vaultHomePath: string): string[] =>
  readdirSync(join(vaultHomePath, 'keyfiles')).sort();

const roots = (vaultHomePath: string): string[] =>
  keyfiles(vaultHomePath).filter((name) => name.startsWith('pico_identity-'));

/** A vault in the state a rotation starts from: founded, in use, one root. */
async function startLivingDaemon(): Promise<{
  vaultHomePath: string;
  client: PicoVaultDaemonClient;
  identityKeyFingerprintHex: string;
}> {
  const daemon = await startEmptyDaemon();
  const client = await connect(daemon.vaultHomePath);
  const founded = await client.foundingBootstrap({
    passphrase: CURRENT_PASSPHRASE,
    targetDelegationId: 'delegation_rotation_0001',
  });
  return {
    vaultHomePath: daemon.vaultHomePath,
    client,
    identityKeyFingerprintHex: founded.identity.keyFingerprintHex,
  };
}

describe('ADR 0114 - rotation bootstrap over the daemon', () => {
  it('stages one successor root beside the current one, and returns no secret', async () => {
    const living = await startLivingDaemon();

    const result = await living.client.rotationBootstrap({
      passphrase: SUCCESSOR_PASSPHRASE,
    });

    expect(result.identity.keyFingerprintHex).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.identity.keyFingerprintHex).not.toBe(living.identityKeyFingerprintHex);

    // The same reason this is a daemon request at all: no private half crosses
    // the socket, so no client process ever holds one.
    const answered = JSON.stringify(result);
    expect(answered).not.toContain(SUCCESSOR_PASSPHRASE);
    expect(answered).not.toContain('secretKey');
    expect(answered).not.toContain('privateKey');
    expect(answered).not.toContain('seed');

    // Two roots now, and the device keys untouched: a rotation replaces who a
    // person is to their Home, not which machines they are at.
    expect(roots(living.vaultHomePath)).toHaveLength(2);
    expect(keyfiles(living.vaultHomePath)).toHaveLength(4);
    expect(keyfiles(living.vaultHomePath)
      .filter((name) => name.startsWith('device_'))).toHaveLength(2);

    const contents = readFileSync(
      join(living.vaultHomePath, 'keyfiles', `pico_identity-${result.identity.keyFingerprintHex}.json`),
      'utf8',
    );
    expect(contents).not.toContain(SUCCESSOR_PASSPHRASE);
    expect(contents.toLowerCase()).not.toContain('"secretkey"');
  }, 60_000);

  it('leaves the current root usable, and opens the successor under its own passphrase', async () => {
    /**
     * The half that makes a rotation a *succession* rather than a swap: until
     * the ceremony runs, the root a person's Home knows is still the one that
     * signs. A bootstrap that broke it would strand somebody mid-rotation.
     */
    const living = await startLivingDaemon();
    const staged = await living.client.rotationBootstrap({
      passphrase: SUCCESSOR_PASSPHRASE,
    });

    await living.client.unlock({
      keyRole: 'pico_identity',
      keyFingerprintHex: living.identityKeyFingerprintHex,
      passphrase: CURRENT_PASSPHRASE,
    });
    await living.client.unlock({
      keyRole: 'pico_identity',
      keyFingerprintHex: staged.identity.keyFingerprintHex,
      passphrase: SUCCESSOR_PASSPHRASE,
    });

    // Two roots unlocked side by side, told apart by fingerprint - which is
    // what `#unlockedSessions` is keyed by, and the thing an earlier note in
    // Roadmap.md got wrong when it called a rotation blocked.
    const status = await living.client.status();
    expect(status.sessions
      .filter((session) => session.keyRole === 'pico_identity')
      .map((session) => session.keyFingerprintHex)
      .sort())
      .toEqual([living.identityKeyFingerprintHex, staged.identity.keyFingerprintHex].sort());
  }, 60_000);

  it('refuses an empty vault by name: that door is founding', async () => {
    const daemon = await startEmptyDaemon();
    const client = await connect(daemon.vaultHomePath);

    await expect(client.rotationBootstrap({ passphrase: SUCCESSOR_PASSPHRASE }))
      .rejects.toThrow('rotation_bootstrap_requires_existing_root');

    // A rotation is a succession, and an empty vault has nothing to succeed.
    expect(keyfiles(daemon.vaultHomePath)).toEqual([]);
  }, 60_000);

  it('refuses a second successor, so a living vault cannot fill with roots', async () => {
    /**
     * The bound this whole request lives or dies by. One staged successor is a
     * rotation in progress; two is a person who can no longer say which root
     * is theirs, in the one vault where nobody may be unsure of that.
     */
    const living = await startLivingDaemon();
    await living.client.rotationBootstrap({ passphrase: SUCCESSOR_PASSPHRASE });

    await expect(living.client.rotationBootstrap({ passphrase: 'a-third-passphrase' }))
      .rejects.toThrow('rotation_bootstrap_successor_already_staged');

    // And the refusal changed nothing.
    expect(roots(living.vaultHomePath)).toHaveLength(2);
  }, 60_000);

  it('refuses a request carrying anything a card or a delegation would bring', async () => {
    /**
     * `assertExactKeys` again. A successor root names no authority of its own
     * and is restored from nothing; a request that *could* carry a card
     * payload, a PIN or a delegation id would be a second door into restoring
     * an identity or naming an authority, through the door that makes a key.
     */
    const living = await startLivingDaemon();

    for (const smuggled of [
      { canonicalCardPayloadHex: 'ab'.repeat(32) },
      { pin: '123456' },
      { targetDelegationId: 'delegation_rotation_0002' },
      { keyRole: 'pico_identity' },
    ]) {
      // A fresh connection each time: a protocol violation is fail-closed, so
      // the daemon answers the reason and then ends the socket.
      const client = await connect(living.vaultHomePath);
      await expect(client.rotationBootstrap({
        passphrase: SUCCESSOR_PASSPHRASE,
        ...smuggled,
      } as never), JSON.stringify(smuggled)).rejects.toThrow('invalid_request');

      await expect(client.status()).rejects.toThrow();
    }

    // None of the refusals staged anything.
    expect(roots(living.vaultHomePath)).toHaveLength(1);
  }, 60_000);

  it('stages nothing when the request itself is refused', async () => {
    const living = await startLivingDaemon();

    await expect(living.client.rotationBootstrap({ passphrase: '' })).rejects.toThrow();

    expect(roots(living.vaultHomePath)).toHaveLength(1);
  }, 60_000);

  it('survives a write that fails, and leaves the vault readable', async () => {
    /**
     * The case the cleanup exists for, and the reason it is sharper here than
     * in the twins: a leftover from a failed rotation would count as the
     * second root above and lock the person out of ever staging a real one -
     * a failed rotation that makes rotation impossible.
     *
     * A read-only keyfile directory is how this walk reaches the catch block.
     * A genuinely torn file needs a full disk and cannot be produced here; the
     * ordering that makes the cleanup able to reach such a file is argued in
     * `daemon.ts` rather than walked, and what is walked is the property that
     * matters either way: after a failed stage, the vault is exactly as it was
     * and still opens.
     */
    const living = await startLivingDaemon();
    const keyfilesPath = join(living.vaultHomePath, 'keyfiles');

    chmodSync(keyfilesPath, 0o500);
    try {
      await expect(living.client.rotationBootstrap({ passphrase: SUCCESSOR_PASSPHRASE }))
        .rejects.toThrow();
    } finally {
      chmodSync(keyfilesPath, 0o700);
    }

    expect(roots(living.vaultHomePath)).toHaveLength(1);
    expect(keyfiles(living.vaultHomePath)).toHaveLength(3);

    // And the root a person's Home knows still opens, which is the thing a
    // botched rotation must never take away.
    await living.client.unlock({
      keyRole: 'pico_identity',
      keyFingerprintHex: living.identityKeyFingerprintHex,
      passphrase: CURRENT_PASSPHRASE,
    });
    expect((await living.client.status()).sessions.map((session) => session.keyRole))
      .toContain('pico_identity');
  }, 60_000);
});
