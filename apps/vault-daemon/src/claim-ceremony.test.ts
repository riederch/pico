import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPicoVaultKeyfile,
  writePicoVaultKeyfile,
  type CreatePicoVaultKeyfileResult,
} from '@pico/vault';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * ADR 0103 C1/C3/C4/C5. The first test that drives a real Foundation and a
 * real Vault daemon as separate processes through a product path.
 *
 * Both sides run as spawned processes rather than in-process fixtures,
 * because the deployment shape is the thing under test: the Vault is on the
 * person's machine, the Foundation is in the Home, and they only ever meet
 * over HTTP carrying finished records.
 */

const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');
const CORE = join(import.meta.dirname, '..', '..', 'core', 'dist', 'index.js');
const IDENTITY_PASSPHRASE = 'claim ceremony identity passphrase';

const temporaryDirectories: string[] = [];
const childProcesses: ChildProcess[] = [];

let ownerIdentity: CreatePicoVaultKeyfileResult;

beforeAll(async () => {
  await sodium.ready;
  ownerIdentity = createPicoVaultKeyfile(sodium, {
    keyRole: 'pico_identity',
    passphrase: IDENTITY_PASSPHRASE,
  });
}, 60_000);

afterEach(() => {
  for (const child of childProcesses.splice(0)) {
    child.kill('SIGKILL');
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function waitFor(condition: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (condition()) {
      return;
    }
    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 25);
    });
  }
  throw new Error(`wait_for_timeout:${label}`);
}

interface RunningCore {
  baseUrl: string;
  moveInCode: string;
  hostSigningKeyFingerprintHex: string;
  hostKeyAgreementKeyFingerprintHex: string;
}

/**
 * Starts a Foundation in Setup Mode and reads the Move-In Code out of its log,
 * exactly as a person has to. `loopback-dev` keeps the access mode honest for
 * a loopback bind without inventing a token.
 */
/** The Foundation refuses PICO_PORT=0, so the test picks a concrete free one. */
async function freePort(): Promise<number> {
  return await new Promise<number>((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => {
        resolvePromise(port);
      });
    });
  });
}

async function startCore(): Promise<RunningCore> {
  const dataDir = tempDir('pico-claim-core-');
  const port = await freePort();
  const child = spawn(process.execPath, [CORE], {
    env: {
      ...process.env,
      PICO_DATABASE_PATH: join(dataDir, 'pico.sqlite'),
      PICO_BACKUP_DIRECTORY: join(dataDir, 'backups'),
      PICO_KEY_STORE_PATH: join(dataDir, 'keys'),
      PICO_HOME_HOST_KEY_STORE_PATH: join(dataDir, 'home-host-keys'),
      PICO_HOST: '127.0.0.1',
      PICO_PORT: String(port),
      PICO_FOUNDATION_ACCESS_MODE: 'loopback-dev',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  childProcesses.push(child);

  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream!.setEncoding('utf8');
    stream!.on('data', (chunk: string) => {
      output += chunk;
    });
  }

  await waitFor(
    () => output.includes('picoHomeMoveInCode') && output.includes('Server listening at'),
    'core_ready',
  );

  const claim = output.split('\n')
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return undefined;
      }
    })
    .find((line) => line?.picoHomeMoveInCode !== undefined);
  if (claim === undefined) {
    throw new Error(`move_in_code_not_logged:${output}`);
  }

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    moveInCode: String(claim.picoHomeMoveInCode),
    hostSigningKeyFingerprintHex: String(claim.hostSigningKeyFingerprintHex),
    hostKeyAgreementKeyFingerprintHex: String(claim.hostKeyAgreementKeyFingerprintHex),
  };
}

interface RunningDaemon {
  vaultHomePath: string;
  stderr: () => string;
}

async function startDaemon(): Promise<RunningDaemon> {
  const vaultHomePath = tempDir('pico-claim-vault-');
  writePicoVaultKeyfile(
    join(vaultHomePath, 'keyfiles', `pico_identity-${ownerIdentity.keyFingerprintHex}.json`),
    ownerIdentity.keyfile,
  );

  const child = spawn(process.execPath, [
    CLI, 'daemon',
    '--vault-home', vaultHomePath,
    '--foundation-data', tempDir('pico-claim-data-'),
    '--foundation-backup', tempDir('pico-claim-backup-'),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  childProcesses.push(child);

  let stderr = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => {
    stderr += chunk;
  });

  // The daemon announces readiness with a single JSON line on stdout.
  await new Promise<void>((resolvePromise, rejectPromise) => {
    let stdout = '';
    const timer = setTimeout(() => {
      rejectPromise(new Error(`daemon_start_timeout:${stderr}`));
    }, 20_000);
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.includes('\n')) {
        clearTimeout(timer);
        resolvePromise();
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      rejectPromise(new Error(`daemon_exited:${String(code)}:${stderr}`));
    });
  });

  return { vaultHomePath, stderr: () => stderr };
}

/** The person: a scripted `pico-vault unlock` that answers every prompt yes. */
async function startApprover(daemon: RunningDaemon): Promise<{ approvals: () => number }> {
  const child = spawn(process.execPath, [
    CLI, 'unlock',
    '--vault-home', daemon.vaultHomePath,
    '--role', 'pico_identity',
    '--fingerprint', ownerIdentity.keyFingerprintHex,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  childProcesses.push(child);

  let stderr = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => {
    stderr += chunk;
  });
  child.stdin!.write(`${IDENTITY_PASSPHRASE}\n`);

  await waitFor(() => stderr.includes('Vault unlocked.'), 'approver_unlock');
  child.stdin!.write('y\n'.repeat(8));
  await waitFor(
    () => daemon.stderr().includes('"event":"approval_watch_started"'),
    'approval_watch_started',
  );

  return { approvals: () => stderr.split('Approve? [y/N]').length - 1 };
}

function runCeremony(
  daemon: RunningDaemon,
  core: RunningCore,
  overrides: { hostSigningKeyFingerprintHex?: string; moveInCode?: string } = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [
    CLI, 'ceremony', 'claim-home',
    '--vault-home', daemon.vaultHomePath,
    '--fingerprint', ownerIdentity.keyFingerprintHex,
    '--core-url', core.baseUrl,
    '--move-in-code', overrides.moveInCode ?? core.moveInCode,
    '--host-signing-fingerprint',
    overrides.hostSigningKeyFingerprintHex ?? core.hostSigningKeyFingerprintHex,
    '--host-agreement-fingerprint', core.hostKeyAgreementKeyFingerprintHex,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  childProcesses.push(child);

  let stdout = '';
  let stderr = '';
  child.stdout!.setEncoding('utf8');
  child.stderr!.setEncoding('utf8');
  child.stdout!.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr!.on('data', (chunk: string) => {
    stderr += chunk;
  });

  return new Promise((resolvePromise) => {
    child.once('exit', (code) => {
      resolvePromise({ code, stdout, stderr });
    });
  });
}

describe('Home claim ceremony over the Vault daemon (ADR 0103 C1)', () => {
  it('founds a Home end to end without a private key in the client process', async () => {
    const core = await startCore();
    const daemon = await startDaemon();
    const approver = await startApprover(daemon);

    const before = await fetch(`${core.baseUrl}/api/system/status`);
    expect(((await before.json()) as { picoHome: { claimState: { state: string } } })
      .picoHome.claimState.state).toBe('unclaimed');

    const run = await runCeremony(daemon, core);
    expect(run.code).toBe(0);

    const founding = JSON.parse(run.stdout) as { claimState: { state: string; homeId: string } };
    expect(founding.claimState.state).toBe('claimed');
    expect(founding.claimState.homeId).toMatch(/^home_[0-9a-f]{32}$/);

    // Founding creates authority twice - the claim and the acceptance - and
    // neither is on the ADR 0099 exempt list, so the person was asked twice.
    expect(approver.approvals()).toBe(2);

    // Setup Mode closes behind a claimed Home.
    expect((await fetch(`${core.baseUrl}/api/home/setup`)).status).toBe(404);

    const after = await fetch(`${core.baseUrl}/api/system/status`);
    expect(((await after.json()) as { picoHome: { claimState: { state: string } } })
      .picoHome.claimState.state).toBe('claimed');
  }, 120_000);

  it('cannot sign without the person: a locked daemon fails the ceremony', async () => {
    const core = await startCore();
    const daemon = await startDaemon();
    // No approver, so no session is unlocked. The client holds the keyfile
    // path but not the passphrase, so if it could sign on its own this would
    // succeed - that is what makes C3 a result rather than a claim.
    const run = await runCeremony(daemon, core);

    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('claim_signer_not_unlocked');

    const status = await fetch(`${core.baseUrl}/api/system/status`);
    expect(((await status.json()) as { picoHome: { claimState: { state: string } } })
      .picoHome.claimState.state).toBe('unclaimed');
  }, 120_000);

  it('refuses a host key fingerprint that does not match the log', async () => {
    const core = await startCore();
    const daemon = await startDaemon();
    await startApprover(daemon);

    const run = await runCeremony(daemon, core, {
      hostSigningKeyFingerprintHex: 'aa'.repeat(32),
    });

    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('host_key_fingerprint_mismatch');
    // The Home is untouched: a mismatch is refused before anything is signed.
    const status = await fetch(`${core.baseUrl}/api/system/status`);
    expect(((await status.json()) as { picoHome: { claimState: { state: string } } })
      .picoHome.claimState.state).toBe('unclaimed');
  }, 120_000);

  it('surfaces a Foundation refusal verbatim and does not retry', async () => {
    const core = await startCore();
    const daemon = await startDaemon();
    await startApprover(daemon);

    const run = await runCeremony(daemon, core, { moveInCode: 'WRONG-MOVE-IN-CODE-0000000000000' });

    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('foundation_rejected:401');
    expect(run.stderr).toContain('Move-In Code is invalid.');

    const status = await fetch(`${core.baseUrl}/api/system/status`);
    expect(((await status.json()) as { picoHome: { claimState: { state: string } } })
      .picoHome.claimState.state).toBe('unclaimed');
  }, 120_000);
});
