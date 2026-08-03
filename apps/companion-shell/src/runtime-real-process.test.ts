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
import {
  connectPicoVaultDaemonClient,
  createPicoLinkDirectClient,
  initiatePicoHomeDeviceRecovery,
} from '@pico/vault-daemon';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { writePicoCompanionProfile } from '@pico/companion';
import type { PicoCompanionPresentation } from './contract.js';
import { createPicoCompanionPresentationAdapter } from './presentation-adapter.js';
import { startPicoCompanionShellRuntime } from './runtime.js';

const CLI = join(import.meta.dirname, '..', '..', 'vault-daemon', 'dist', 'cli.js');
const CORE = join(import.meta.dirname, '..', '..', 'core', 'dist', 'index.js');
const identityPassphrase = 'companion shell identity passphrase';
const signingPassphrase = 'companion shell signing passphrase';
const agreementPassphrase = 'companion shell agreement passphrase';
const targetPassphrase = 'companion shell target passphrase';

const temporaryDirectories: string[] = [];
const childProcesses: ChildProcess[] = [];
let identity: CreatePicoVaultKeyfileResult;
let signing: CreatePicoVaultKeyfileResult;
let agreement: CreatePicoVaultKeyfileResult;
let targetSigning: CreatePicoVaultKeyfileResult;
let targetAgreement: CreatePicoVaultKeyfileResult;

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
  targetSigning = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_signing',
    passphrase: targetPassphrase,
  });
  targetAgreement = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_key_agreement',
    passphrase: targetPassphrase,
  });
}, 120_000);

afterEach(() => {
  for (const child of childProcesses.splice(0)) {
    child.kill('SIGKILL');
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Electron-hosted companion runtime against real processes', () => {
  it('raises the ADR 0112 alarm from a real founded Home pending recovery', async () => {
    const core = await startCore();
    const living = await startDaemon('pico-companion-living-', [
      ['pico_identity', identity],
      ['device_signing', signing],
      ['device_key_agreement', agreement],
    ]);
    await startApprover(living, 'pico_identity', identity, identityPassphrase);
    await startApprover(living, 'device_signing', signing, signingPassphrase);
    await startApprover(living, 'device_key_agreement', agreement, agreementPassphrase);
    const founded = await runFounding(living, core);
    expect(founded.code, founded.stderr).toBe(0);
    const founding = JSON.parse(founded.stdout) as {
      claimState: { homeId: string };
      foundingRecord: {
        firstDeviceDelegation: { record: { delegationId: string } };
      };
    };
    const firstDelegationId =
      founding.foundingRecord.firstDeviceDelegation.record.delegationId;

    const target = await startDaemon('pico-companion-target-', [
      ['device_signing', targetSigning],
      ['device_key_agreement', targetAgreement],
    ]);
    await startApprover(target, 'device_signing', targetSigning, targetPassphrase);
    await startApprover(target, 'device_key_agreement', targetAgreement, targetPassphrase);
    const livingClient = await connectPicoVaultDaemonClient({ socketPath: living.socketPath });
    const targetClient = await connectPicoVaultDaemonClient({ socketPath: target.socketPath });
    await Promise.all([livingClient.hello(), targetClient.hello()]);
    const targetDelegationId = 'delegation_companion_shell_recovery';
    const targetLink = await createPicoLinkDirectClient({
      sodium,
      daemonClient: targetClient,
      coreUrl: core.linkBaseUrl,
      host: core.host,
      sender: {
        identityKeyFingerprintHex: identity.keyFingerprintHex,
        identityPublicKeyHex: identity.publicKeyHex,
        deviceSigningKeyFingerprintHex: targetSigning.keyFingerprintHex,
        deviceKeyAgreementKeyFingerprintHex: targetAgreement.keyFingerprintHex,
        delegationId: targetDelegationId,
      },
    });
    const recovery = await initiatePicoHomeDeviceRecovery({
      rootClient: livingClient,
      targetClient,
      targetLinkClient: targetLink,
      sodium,
      homeId: founding.claimState.homeId,
      hostSigningKeyFingerprintHex: core.host.signingKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: core.host.keyAgreementKeyFingerprintHex,
      identityKeyFingerprintHex: identity.keyFingerprintHex,
      targetDelegationId,
      targetDeviceSigningKeyFingerprintHex: targetSigning.keyFingerprintHex,
      targetDeviceKeyAgreementKeyFingerprintHex: targetAgreement.keyFingerprintHex,
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000).toISOString(),
    });
    await Promise.all([livingClient.close(), targetClient.close()]);

    const profilePath = join(tempDirectory('pico-companion-profile-'), 'profile.json');
    writePicoCompanionProfile(profilePath, {
      schema: 'pico.companion.profile.v1',
      coreUrl: core.linkBaseUrl,
      home: {
        homeHostPicoIdentityFingerprintHex: identity.keyFingerprintHex,
      },
      host: core.host,
      identity: {
        keyFingerprintHex: identity.keyFingerprintHex,
        publicKeyHex: identity.publicKeyHex,
      },
      device: {
        signingKeyFingerprintHex: signing.keyFingerprintHex,
        keyAgreementKeyFingerprintHex: agreement.keyFingerprintHex,
        delegationId: firstDelegationId,
      },
    });
    const presented: PicoCompanionPresentation[] = [];
    const notified: PicoCompanionPresentation[] = [];
    const runtime = await startPicoCompanionShellRuntime({
      profilePath,
      vaultSocketPath: living.socketPath,
      sodium,
      notifications: createPicoCompanionPresentationAdapter({
        present: (state) => { presented.push(state); },
        notify: (state) => { notified.push(state); },
      }),
    });
    expect(runtime.status()).toMatchObject({
      alarmActive: true,
      checks: 1,
      readFailures: 0,
      notifyFailures: 0,
    });
    expect(presented.at(-1)).toMatchObject({
      kind: 'pending_recovery',
      severity: 'blocked',
    });
    expect(presented.at(-1)?.body).toContain(recovery.pending.recoveryId);
    expect(notified).toHaveLength(1);
    await runtime.vetoPendingRecovery();
    expect(runtime.status()).toMatchObject({
      alarmActive: false,
      checks: 2,
      readFailures: 0,
    });
    expect(presented.at(-1)?.kind).toBe('idle');
    await runtime.stop();
  }, 180_000);
});

interface RunningCore {
  linkBaseUrl: string;
  moveInCode: string;
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

async function startCore(): Promise<RunningCore> {
  const port = await freePort();
  let linkPort = await freePort();
  while (linkPort === port) {
    linkPort = await freePort();
  }
  const data = tempDirectory('pico-companion-core-');
  const child = spawn(process.execPath, [CORE], {
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
        && output.includes('Pico Link restricted intake listening')
        && output.includes('picoHomeMoveInCode'),
      'core_ready',
    );
  } catch {
    throw new Error(`core_ready_failed:${output}`);
  }
  const setup = output.split('\n').map((line) => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }).find((line) => line?.picoHomeMoveInCode !== undefined);
  if (setup === undefined) {
    throw new Error(`core_setup_not_logged:${output}`);
  }
  return {
    linkBaseUrl: `http://127.0.0.1:${linkPort}`,
    moveInCode: String(setup.picoHomeMoveInCode),
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
  child.stdin!.write('y\n'.repeat(32));
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
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000).toISOString(),
    '--transport', 'link',
    '--link-signing-fingerprint', signing.keyFingerprintHex,
    '--link-agreement-fingerprint', agreement.keyFingerprintHex,
    '--host-signing-public-key', core.host.signingPublicKeyHex,
    '--host-agreement-public-key', core.host.keyAgreementPublicKeyHex,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
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
