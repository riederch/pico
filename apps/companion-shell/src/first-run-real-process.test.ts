import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPicoRecoveryCardV2ScanTransport,
  picoHomeDeviceRecoveryTiming,
} from '@pico/protocol';
import {
  createPicoVaultKeyfile,
  writePicoVaultKeyfile,
  type CreatePicoVaultKeyfileResult,
} from '@pico/vault';
import { connectPicoVaultDaemonClient } from '@pico/vault-daemon';
import {
  readPicoCompanionFirstRunNeed,
  runPicoCompanionFirstRun,
} from '@pico/companion/first-run';
import {
  readPicoCompanionFirstRunJournal,
} from '@pico/companion/first-run-journal';
import { readPicoCompanionProfile } from '@pico/companion/profile';
import type { PicoCompanionApprovalDecisionPort } from '@pico/companion/approval-carrier';
import type { PicoCompanionRecoveryNotifications } from '@pico/companion/recovery-controller';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const CLI = join(import.meta.dirname, '..', '..', 'vault-daemon', 'dist', 'cli.js');
const CORE = join(import.meta.dirname, '..', '..', 'core', 'dist', 'index.js');
const TEST_FIXED_CLOCK = join(
  import.meta.dirname, '..', '..', 'vault-daemon', 'src', 'test-fixed-clock.cjs',
);
const identityPassphrase = 'first run identity passphrase';
const signingPassphrase = 'first run signing passphrase';
const agreementPassphrase = 'first run agreement passphrase';
const cardPin = 'firstrunpin01';
const devicePassphrase = 'first run device passphrase';

/** T0 is pinned so the window arithmetic in this test is readable. */
const startedAtMs = Date.parse('2026-09-01T09:00:00.000Z');
const afterVetoMs = startedAtMs + picoHomeDeviceRecoveryTiming.vetoDelayMs + 60_000;

const temporaryDirectories: string[] = [];
const childProcesses: ChildProcess[] = [];
let identity: CreatePicoVaultKeyfileResult;
let signing: CreatePicoVaultKeyfileResult;
let agreement: CreatePicoVaultKeyfileResult;

beforeAll(async () => {
  await sodium.ready;
  identity = createPicoVaultKeyfile(sodium, {
    keyRole: 'pico_identity',
    passphrase: identityPassphrase,
  });
  signing = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_signing',
    passphrase: signingPassphrase,
  });
  agreement = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_key_agreement',
    passphrase: agreementPassphrase,
  });
}, 120_000);

afterEach(() => {
  vi.useRealTimers();
  for (const child of childProcesses.splice(0)) {
    child.kill('SIGKILL');
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('ADR 0112 S3 first run against real processes', () => {
  it('carries a scanned Card v2 through a real Home into a committed profile', async () => {
    // Client and Home share one clock throughout: Link envelopes carry a
    // 30-second freshness bound, so a test that moves only the Home would fail
    // on staleness rather than on anything this test is about.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(startedAtMs);
    const core = await startCore({ nowMs: startedAtMs });
    const living = await startDaemon('pico-first-run-living-', [
      ['pico_identity', identity],
      ['device_signing', signing],
      ['device_key_agreement', agreement],
    ]);
    await startApprover(living, 'pico_identity', identity, identityPassphrase);
    await startApprover(living, 'device_signing', signing, signingPassphrase);
    await startApprover(living, 'device_key_agreement', agreement, agreementPassphrase);
    const founded = await runFounding(living, core);
    expect(founded.code, founded.stderr).toBe(0);
    const homeId = (JSON.parse(founded.stdout) as {
      claimState: { homeId: string };
    }).claimState.homeId;

    // The card is issued by the real approval-gated ceremony, so the bytes this
    // test scans are the bytes a printed card carries.
    const transport = await issueCardV2(living, core, homeId);

    const target = await startDaemon('pico-first-run-target-', []);
    const paths = firstRunPaths();
    const shared = {
      ...paths,
      sodium,
      socketPath: target.socketPath,
      notifications: silentNotifications(),
      decisions: approveEverything(),
    };
    expect(readPicoCompanionFirstRunNeed(paths).need).toBe('card_and_secrets');

    const submitted = await runPicoCompanionFirstRun({
      ...shared,
      secrets: {
        cardTransport: transport,
        pin: cardPin,
        passphrase: devicePassphrase,
      },
    });
    // The Home holds its objection window open first; nothing is a member yet.
    expect(submitted.status).toBe('awaiting_window');
    expect(existsSync(paths.profilePath)).toBe(false);
    const journal = readPicoCompanionFirstRunJournal(paths.journalPath);
    expect(journal?.step).toBe('submitted');
    const recoveryId = journal?.step === 'submitted'
      ? journal.pending.recoveryId
      : '';
    expect(recoveryId).not.toBe('');

    // A restart in the middle of the window resumes forward: the card is spent
    // and must not be asked for again, and the vault must not be re-bootstrapped.
    const need = readPicoCompanionFirstRunNeed(paths);
    expect(need).toMatchObject({ need: 'passphrase', step: 'submitted' });
    const resumed = await runPicoCompanionFirstRun({
      ...shared,
      secrets: { passphrase: devicePassphrase },
    });
    expect(resumed.status).toBe('awaiting_window');
    expect(resumed.status === 'awaiting_window' && resumed.pending.recoveryId)
      .toBe(recoveryId);

    // The Home is restarted past its own veto delay against the same database;
    // the client follows, or its envelopes would be stale on arrival.
    core.stop();
    const resumedCore = await startCore({ nowMs: afterVetoMs, reuse: core });
    expect(resumedCore.linkBaseUrl).toBe(core.linkBaseUrl);
    vi.setSystemTime(afterVetoMs);

    const completed = await runPicoCompanionFirstRun({
      ...shared,
      secrets: { passphrase: devicePassphrase },
    });
    expect(completed.status).toBe('complete');
    if (completed.status !== 'complete') {
      return;
    }
    expect(completed.receipt.recoveryId).toBe(recoveryId);
    expect(completed.receipt.leavesExactlyOneActiveDevice).toBe(true);
    // No Platform Keystore was supplied, and that is recorded rather than faked.
    expect(completed.platformUnlockBound).toBe(false);

    const profile = readPicoCompanionProfile(paths.profilePath);
    expect(profile.coreUrl).toBe(core.linkBaseUrl);
    expect(profile.home.homeHostPicoIdentityFingerprintHex)
      .toBe(identity.keyFingerprintHex);
    expect(profile.identity.keyFingerprintHex).toBe(identity.keyFingerprintHex);
    expect(profile.device.signingKeyFingerprintHex)
      .not.toBe(signing.keyFingerprintHex);
    expect(readPicoCompanionFirstRunJournal(paths.journalPath)).toBeNull();
    expect(readPicoCompanionFirstRunNeed(paths).need).toBe('nothing');

    // A lost journal cannot silently restart a vault whose one bootstrap is
    // spent: the daemon's freshness test is the backstop behind the journal.
    vi.useRealTimers();
    const spent = await connectPicoVaultDaemonClient({
      socketPath: target.socketPath,
    });
    try {
      await spent.hello();
      await expect(spent.recoveryBootstrap({
        canonicalCardPayloadHex: transportPayloadHex(transport),
        pin: cardPin,
        passphrase: devicePassphrase,
        targetDelegationId: 'delegation-second-attempt',
      })).rejects.toThrow('recovery_bootstrap_requires_fresh_vault');
    } finally {
      await spent.close();
    }
  }, 240_000);

  it('spends nothing when the card names a Home this device cannot verify', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(startedAtMs);
    const core = await startCore({ nowMs: startedAtMs });
    const living = await startDaemon('pico-first-run-unverified-', [
      ['pico_identity', identity],
      ['device_signing', signing],
      ['device_key_agreement', agreement],
    ]);
    await startApprover(living, 'pico_identity', identity, identityPassphrase);
    await startApprover(living, 'device_signing', signing, signingPassphrase);
    await startApprover(living, 'device_key_agreement', agreement, agreementPassphrase);
    const founded = await runFounding(living, core);
    expect(founded.code, founded.stderr).toBe(0);
    const homeId = (JSON.parse(founded.stdout) as {
      claimState: { homeId: string };
    }).claimState.homeId;

    // A card pinning a host signing key this endpoint cannot produce. The
    // continuity read is client-side verification, so it fails before the one
    // irreversible step rather than after it.
    //
    // Deliberately not the acceptor pin: on a Home that has never rotated its
    // host key the chain is empty, so the acceptor constrains nothing yet and a
    // wrong one is undetectable here. It binds rotation *acceptance*, and a
    // card carrying a wrong one leaves a device that fails closed at its Home's
    // next rotation instead of at first run. At first run the card is the trust
    // root for all three pins, which is ADR 0110's premise.
    const forged = await issueCardV2(living, core, homeId, {
      hostSigningKeyFingerprintHex: 'a'.repeat(64),
    });
    const target = await startDaemon('pico-first-run-unverified-target-', []);
    const paths = firstRunPaths();

    await expect(runPicoCompanionFirstRun({
      ...paths,
      sodium,
      socketPath: target.socketPath,
      notifications: silentNotifications(),
      decisions: approveEverything(),
      secrets: {
        cardTransport: forged,
        pin: cardPin,
        passphrase: devicePassphrase,
      },
    })).rejects.toThrow('first_run_home_unverified');

    // The vault is untouched, so the person can still use a real card here.
    expect(readPicoCompanionFirstRunJournal(paths.journalPath)).toBeNull();
    expect(existsSync(paths.profilePath)).toBe(false);
    const fresh = await connectPicoVaultDaemonClient({
      socketPath: target.socketPath,
    });
    try {
      await fresh.hello();
      expect((await fresh.status()).keyfiles).toEqual([]);
    } finally {
      await fresh.close();
    }
  }, 240_000);
});

function firstRunPaths(): {
  profilePath: string;
  journalPath: string;
  recoveryStatePath: string;
} {
  const directory = tempDirectory('pico-first-run-profile-');
  return {
    profilePath: join(directory, 'profile.json'),
    journalPath: join(directory, 'first-run-journal.json'),
    recoveryStatePath: join(directory, 'recovery-state.json'),
  };
}

function approveEverything(): PicoCompanionApprovalDecisionPort {
  return { decideApproval: async () => true };
}

function silentNotifications(): PicoCompanionRecoveryNotifications {
  return {
    presentRecoveryWaiting: () => undefined,
    notifyRecoveryCompleted: () => undefined,
    notifyRecoveryCompletionBlocked: () => undefined,
  };
}

function transportPayloadHex(transport: string): string {
  return Buffer.from(
    transport.slice('pico-recovery-card-v2:'.length),
    'base64url',
  ).toString('hex');
}

async function issueCardV2(
  daemon: RunningDaemon,
  core: RunningCore,
  homeId: string,
  overrides: {
    homeHostPicoIdentityFingerprintHex?: string;
    hostSigningKeyFingerprintHex?: string;
  } = {},
): Promise<string> {
  const client = await connectPicoVaultDaemonClient({
    socketPath: daemon.socketPath,
  });
  try {
    await client.hello();
    const issued = await client.ceremonyIssueRecoveryCardV2({
      signerKeyFingerprintHex: identity.keyFingerprintHex,
      picoName: 'Ada',
      homeNameOrId: 'First Run Home',
      homeId,
      homeHostPicoIdentityFingerprintHex:
        overrides.homeHostPicoIdentityFingerprintHex
          ?? identity.keyFingerprintHex,
      hostSigningKeyFingerprintHex: overrides.hostSigningKeyFingerprintHex
        ?? core.host.signingKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: core.host.keyAgreementKeyFingerprintHex,
      hostKeyAgreementPublicKeyHex: core.host.keyAgreementPublicKeyHex,
      endpointHint: core.linkBaseUrl,
      issuedAt: new Date(startedAtMs).toISOString(),
      pin: cardPin,
    });
    return buildPicoRecoveryCardV2ScanTransport(
      Uint8Array.from(Buffer.from(issued.canonicalPayloadHex, 'hex')),
    );
  } finally {
    await client.close();
  }
}

interface RunningCore {
  linkBaseUrl: string;
  moveInCode: string;
  dataDir: string;
  port: number;
  linkPort: number;
  stop: () => void;
  host: {
    signingPublicKeyHex: string;
    signingKeyFingerprintHex: string;
    keyAgreementPublicKeyHex: string;
    keyAgreementKeyFingerprintHex: string;
  };
}

interface RunningDaemon {
  vaultHomePath: string;
  socketPath: string;
  stderr: () => string;
}

function tempDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function freePort(): Promise<number> {
  return await new Promise<number>((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolvePromise(port));
    });
  });
}

async function waitFor(condition: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 800; attempt += 1) {
    if (condition()) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  throw new Error(`wait_timeout:${label}`);
}

/**
 * `reuse` restarts an already founded Home against its own database, ports and
 * host keys. A second boot does not repeat the setup log line - there is
 * nothing left to set up - so the host bundle is carried over rather than
 * re-parsed.
 */
async function startCore(options: {
  nowMs: number;
  reuse?: RunningCore;
}): Promise<RunningCore> {
  const port = options.reuse?.port ?? await freePort();
  let linkPort = options.reuse?.linkPort ?? await freePort();
  while (linkPort === port) {
    linkPort = await freePort();
  }
  const data = options.reuse?.dataDir ?? tempDirectory('pico-first-run-core-');
  const child = spawn(process.execPath, [
    '--require', TEST_FIXED_CLOCK,
    CORE,
  ], {
    env: {
      ...process.env,
      PICO_DATABASE_PATH: join(data, 'pico.sqlite'),
      PICO_BACKUP_DIRECTORY: join(data, 'backups'),
      PICO_KEY_STORE_PATH: join(data, 'keys'),
      PICO_HOME_HOST_KEY_STORE_PATH: join(data, 'home-host-keys'),
      PICO_HOST: '127.0.0.1',
      PICO_PORT: String(port),
      PICO_FOUNDATION_ACCESS_MODE: 'loopback-dev',
      PICO_LINK_INTAKE_HOST: '127.0.0.1',
      PICO_LINK_INTAKE_PORT: String(linkPort),
      PICO_TEST_NOW_MS: String(options.nowMs),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  childProcesses.push(child);
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream!.setEncoding('utf8');
    stream!.on('data', (chunk: string) => { output += chunk; });
  }
  try {
    await waitFor(
      () => output.includes('Server listening at')
        && output.includes('Pico Link restricted intake listening'),
      'core_ready',
    );
  } catch {
    throw new Error(`core_ready_failed:${output}`);
  }
  const common = {
    linkBaseUrl: `http://127.0.0.1:${linkPort}`,
    dataDir: data,
    port,
    linkPort,
    stop: () => child.kill('SIGKILL'),
  };
  if (options.reuse !== undefined) {
    return {
      ...common,
      moveInCode: options.reuse.moveInCode,
      host: options.reuse.host,
    };
  }
  const setup = output.split('\n').map((line) => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }).find((line) => line?.hostSigningPublicKeyHex !== undefined);
  if (setup === undefined) {
    throw new Error(`core_setup_not_logged:${output}`);
  }
  return {
    ...common,
    moveInCode: String(setup.picoHomeMoveInCode ?? ''),
    host: {
      signingPublicKeyHex: String(setup.hostSigningPublicKeyHex),
      signingKeyFingerprintHex: String(setup.hostSigningKeyFingerprintHex),
      keyAgreementPublicKeyHex: String(setup.hostKeyAgreementPublicKeyHex),
      keyAgreementKeyFingerprintHex: String(setup.hostKeyAgreementKeyFingerprintHex),
    },
  };
}

async function startDaemon(
  prefix: string,
  keyfiles: ReadonlyArray<readonly [
    'pico_identity' | 'device_signing' | 'device_key_agreement',
    CreatePicoVaultKeyfileResult,
  ]>,
): Promise<RunningDaemon> {
  const vaultHomePath = tempDirectory(prefix);
  for (const [role, fixture] of keyfiles) {
    writePicoVaultKeyfile(
      join(vaultHomePath, 'keyfiles', `${role}-${fixture.keyFingerprintHex}.json`),
      fixture.keyfile,
    );
  }
  const child = spawn(process.execPath, [
    CLI,
    'daemon',
    '--vault-home', vaultHomePath,
    '--foundation-data', tempDirectory(`${prefix}data-`),
    '--foundation-backup', tempDirectory(`${prefix}backup-`),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  childProcesses.push(child);
  let stdout = '';
  let stderr = '';
  child.stdout!.setEncoding('utf8');
  child.stderr!.setEncoding('utf8');
  child.stdout!.on('data', (chunk: string) => { stdout += chunk; });
  child.stderr!.on('data', (chunk: string) => { stderr += chunk; });
  await waitFor(() => stdout.includes('\n'), 'daemon_ready');
  return {
    vaultHomePath,
    socketPath: join(vaultHomePath, 'run', 'daemon.sock'),
    stderr: () => stderr,
  };
}

async function startApprover(
  daemon: RunningDaemon,
  role: 'pico_identity' | 'device_signing' | 'device_key_agreement',
  key: CreatePicoVaultKeyfileResult,
  passphrase: string,
): Promise<void> {
  const before = daemon.stderr().split('"event":"approval_watch_started"').length - 1;
  const child = spawn(process.execPath, [
    CLI,
    'unlock',
    '--vault-home', daemon.vaultHomePath,
    '--role', role,
    '--fingerprint', key.keyFingerprintHex,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  childProcesses.push(child);
  let stderr = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => { stderr += chunk; });
  child.stdin!.write(`${passphrase}\n`);
  await waitFor(() => stderr.includes('Vault unlocked.'), `unlock_${role}`);
  child.stdin!.write('y\n'.repeat(64));
  await waitFor(
    () => daemon.stderr().split('"event":"approval_watch_started"').length - 1 > before,
    `approval_${role}`,
  );
}

async function runFounding(
  daemon: RunningDaemon,
  core: RunningCore,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [
    '--require', TEST_FIXED_CLOCK,
    CLI,
    'ceremony', 'claim-home',
    '--vault-home', daemon.vaultHomePath,
    '--fingerprint', identity.keyFingerprintHex,
    '--core-url', core.linkBaseUrl,
    '--move-in-code', core.moveInCode,
    '--host-signing-fingerprint', core.host.signingKeyFingerprintHex,
    '--host-agreement-fingerprint', core.host.keyAgreementKeyFingerprintHex,
    '--signing-fingerprint', signing.keyFingerprintHex,
    '--agreement-fingerprint', agreement.keyFingerprintHex,
    '--delegation-valid-until',
    new Date(startedAtMs + 365 * 24 * 60 * 60 * 1_000).toISOString(),
    '--transport', 'link',
    '--link-signing-fingerprint', signing.keyFingerprintHex,
    '--link-agreement-fingerprint', agreement.keyFingerprintHex,
    '--host-signing-public-key', core.host.signingPublicKeyHex,
    '--host-agreement-public-key', core.host.keyAgreementPublicKeyHex,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PICO_TEST_NOW_MS: String(startedAtMs) },
  });
  childProcesses.push(child);
  let stdout = '';
  let stderr = '';
  child.stdout!.setEncoding('utf8');
  child.stderr!.setEncoding('utf8');
  child.stdout!.on('data', (chunk: string) => { stdout += chunk; });
  child.stderr!.on('data', (chunk: string) => { stderr += chunk; });
  const code = await new Promise<number | null>((resolvePromise) => {
    child.once('exit', resolvePromise);
  });
  return { code, stdout, stderr };
}
