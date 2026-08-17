import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { connectPicoVaultDaemonClient, type PicoVaultDaemonClient } from './client.js';

/**
 * ADR 0130 E2 - the keys a first device needs, made where they stay.
 *
 * **The founding twin of `recoveryBootstrap`, and it exists for that request's
 * reason.** A Home can be founded today only through `pico-vault ceremony
 * claim-home`, which creates keyfiles by calling `createPicoVaultKeyfile` in
 * the CLI process. The Pico Client may not do that: the property the claim
 * ceremony's own test asserts by name is that a Home is founded *without a
 * private key in the client process*, and a client that wrote keyfiles would
 * hold one.
 *
 * So founding gets its own daemon request, and this drives it against a real
 * daemon over its real socket - the shape the recovery path already has.
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

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

/** A daemon over an **empty** vault, which is the state founding starts from. */
async function startEmptyDaemon(): Promise<{ vaultHomePath: string; stderr: () => string }> {
  const vaultHomePath = tempDir('pico-founding-vault-');
  const child = spawn(process.execPath, [
    CLI, 'daemon',
    '--vault-home', vaultHomePath,
    '--foundation-data', tempDir('pico-founding-data-'),
    '--foundation-backup', tempDir('pico-founding-backup-'),
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

describe('ADR 0130 E2 - founding bootstrap over the daemon', () => {
  it('makes an identity and this device’s two keys, and returns no secret', async () => {
    const daemon = await startEmptyDaemon();
    const client = await connect(daemon.vaultHomePath);

    const result = await client.foundingBootstrap({
      passphrase: 'a-passphrase-for-this-vault',
      targetDelegationId: 'delegation_founding_0001',
    });

    expect(result.identity.keyFingerprintHex).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.device.signingKeyFingerprintHex).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.device.keyAgreementKeyFingerprintHex).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.device.delegationId).toBe('delegation_founding_0001');

    /**
     * **The whole reason this is a daemon request.** What comes back names the
     * keys and carries their public halves; a private key crossing this socket
     * would put it in the client process, which is exactly what the claim
     * ceremony's test asserts never happens.
     */
    const answered = JSON.stringify(result);
    expect(answered).not.toContain('a-passphrase-for-this-vault');
    expect(answered).not.toContain('secretKey');
    expect(answered).not.toContain('privateKey');
    expect(answered).not.toContain('seed');

    // Three keyfiles on disk, named for their roles.
    const written = keyfiles(daemon.vaultHomePath);
    expect(written).toHaveLength(3);
    expect(written.some((name) => name.startsWith('pico_identity-'))).toBe(true);
    expect(written.some((name) => name.startsWith('device_signing-'))).toBe(true);
    expect(written.some((name) => name.startsWith('device_key_agreement-'))).toBe(true);
  }, 60_000);

  it('writes keyfiles a passphrase opens, not material anybody can read', async () => {
    const daemon = await startEmptyDaemon();
    const client = await connect(daemon.vaultHomePath);
    const result = await client.foundingBootstrap({
      passphrase: 'a-passphrase-for-this-vault',
      targetDelegationId: 'delegation_founding_0001',
    });

    for (const name of keyfiles(daemon.vaultHomePath)) {
      const contents = readFileSync(join(daemon.vaultHomePath, 'keyfiles', name), 'utf8');
      expect(contents).not.toContain('a-passphrase-for-this-vault');
      // The public half may be there; the private half may not be readable.
      expect(contents.toLowerCase()).not.toContain('"secretkey"');
    }

    /**
     * And the keys work: unlocking all three is what the claim ceremony
     * requires before it will run, so a bootstrap that produced unusable
     * keyfiles would fail one step later and look like a ceremony bug.
     */
    for (const [keyRole, keyFingerprintHex] of [
      ['pico_identity', result.identity.keyFingerprintHex],
      ['device_signing', result.device.signingKeyFingerprintHex],
      ['device_key_agreement', result.device.keyAgreementKeyFingerprintHex],
    ] as const) {
      await client.unlock({
        keyRole,
        keyFingerprintHex,
        passphrase: 'a-passphrase-for-this-vault',
      });
    }
    const status = await client.status();
    expect(status.sessions.map((session) => session.keyRole).sort())
      .toEqual(['device_key_agreement', 'device_signing', 'pico_identity']);
  }, 60_000);

  it('refuses a vault that already holds keys, by name', async () => {
    /**
     * One vault, one identity. A second root here would give this device two,
     * with no way to say which one a signature belongs to - which is why the
     * recovery twin refuses the same way, and why the rule lives in the daemon
     * rather than in the habits of its callers.
     */
    const daemon = await startEmptyDaemon();
    const client = await connect(daemon.vaultHomePath);
    await client.foundingBootstrap({
      passphrase: 'a-passphrase-for-this-vault',
      targetDelegationId: 'delegation_founding_0001',
    });

    await expect(client.foundingBootstrap({
      passphrase: 'another-passphrase',
      targetDelegationId: 'delegation_founding_0002',
    })).rejects.toThrow('founding_bootstrap_requires_fresh_vault');

    // And the refusal changed nothing.
    expect(keyfiles(daemon.vaultHomePath)).toHaveLength(3);
  }, 60_000);

  it('refuses a request carrying anything a card would bring', async () => {
    /**
     * `assertExactKeys` is the load-bearing half of the parser. A founding
     * request that *could* carry a card payload or a PIN would be a second way
     * to start an identity, arriving through the door that makes one - so the
     * shape is closed, and a field this request has no source for is refused
     * before the daemon looks at it.
     */
    const daemon = await startEmptyDaemon();

    for (const smuggled of [
      { canonicalCardPayloadHex: 'ab'.repeat(32) },
      { pin: '123456' },
      { keyRole: 'pico_identity' },
    ]) {
      /**
       * A fresh connection each time, because a protocol violation is
       * fail-closed: the daemon answers the reason and then ends the socket.
       * Reusing one client made the second refusal read as
       * `daemon_connection_closed`, which looks like a different defect and is
       * the guard working.
       */
      const client = await connect(daemon.vaultHomePath);
      await expect(client.foundingBootstrap({
        passphrase: 'a-passphrase-for-this-vault',
        targetDelegationId: 'delegation_founding_0001',
        ...smuggled,
      } as never), JSON.stringify(smuggled)).rejects.toThrow('invalid_request');

      // And it does not get to keep talking.
      await expect(client.status()).rejects.toThrow();
    }

    // None of the refusals left a vault behind.
    expect(keyfiles(daemon.vaultHomePath)).toEqual([]);
  }, 60_000);

  it('leaves no half-written vault when it refuses', async () => {
    // A partial vault is worse than none: the next attempt meets its own
    // leftovers and refuses as "not fresh", with nothing to open them.
    const daemon = await startEmptyDaemon();
    const client = await connect(daemon.vaultHomePath);

    await expect(client.foundingBootstrap({
      passphrase: '',
      targetDelegationId: 'delegation_founding_0001',
    })).rejects.toThrow();

    expect(keyfiles(daemon.vaultHomePath)).toEqual([]);
  }, 60_000);
});
