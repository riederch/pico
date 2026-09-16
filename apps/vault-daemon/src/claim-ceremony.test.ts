import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPicoVaultKeyfile,
  restorePicoVaultIdentityFromRecovery,
  writePicoVaultKeyfile,
  type CreatePicoVaultKeyfileResult,
  type PicoVaultRecoveryCard,
} from '@pico/vault';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { connectPicoVaultDaemonClient, type PicoVaultDaemonClient } from './client.js';
import {
  completePicoHomeDeviceRecovery,
  initiatePicoHomeDeviceRecovery,
  vetoPicoHomeDeviceRecovery,
} from './device-recovery-ceremony.js';
import { readPicoHomeDeviceLifecycle } from './device-lifecycle-ceremony.js';
import {
  createPicoLinkDirectClient,
  type PicoLinkDirectClient,
} from './link-direct-client.js';

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
const TEST_FIXED_CLOCK = join(import.meta.dirname, 'test-fixed-clock.cjs');
const IDENTITY_PASSPHRASE = 'claim ceremony identity passphrase';
const SIGNING_PASSPHRASE = 'claim ceremony signing passphrase';
const AGREEMENT_PASSPHRASE = 'claim ceremony agreement passphrase';
const READER_PASSPHRASE = 'reader vault passphrase';
const TARGET_PASSPHRASE = 'target device vault passphrase';
const RESTORED_IDENTITY_PASSPHRASE = 'restored recovery identity passphrase';
const RECOVERY_PIN = 'mira42';

const temporaryDirectories: string[] = [];
const childProcesses: ChildProcess[] = [];

let ownerIdentity: CreatePicoVaultKeyfileResult;
let ownerSigning: CreatePicoVaultKeyfileResult;
let ownerAgreement: CreatePicoVaultKeyfileResult;
let readerIdentity: CreatePicoVaultKeyfileResult;
let readerSigning: CreatePicoVaultKeyfileResult;
let readerAgreement: CreatePicoVaultKeyfileResult;
let targetSigning: CreatePicoVaultKeyfileResult;
let targetAgreement: CreatePicoVaultKeyfileResult;

beforeAll(async () => {
  await sodium.ready;
  ownerIdentity = createPicoVaultKeyfile(sodium, {
    keyRole: 'pico_identity',
    passphrase: IDENTITY_PASSPHRASE,
  });
  ownerSigning = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_signing',
    passphrase: SIGNING_PASSPHRASE,
  });
  ownerAgreement = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_key_agreement',
    passphrase: AGREEMENT_PASSPHRASE,
  });
  readerIdentity = createPicoVaultKeyfile(sodium, {
    keyRole: 'pico_identity',
    passphrase: READER_PASSPHRASE,
  });
  readerSigning = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_signing',
    passphrase: READER_PASSPHRASE,
  });
  readerAgreement = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_key_agreement',
    passphrase: READER_PASSPHRASE,
  });
  targetSigning = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_signing',
    passphrase: TARGET_PASSPHRASE,
  });
  targetAgreement = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_key_agreement',
    passphrase: TARGET_PASSPHRASE,
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
  child: ChildProcess;
  dataDir: string;
  baseUrl: string;
  linkBaseUrl?: string;
  moveInCode: string;
  hostSigningKeyFingerprintHex: string;
  hostSigningPublicKeyHex: string;
  hostKeyAgreementKeyFingerprintHex: string;
  hostKeyAgreementPublicKeyHex: string;
  log: () => string;
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

/**
 * ADR 0120 N2. An objection window elapses only when the anchor's floor has
 * passed its end, and that floor rises with time the Home actually observed -
 * never with a wall-clock claim. Restarting a core two days ahead is therefore
 * exactly the move the gate refuses, and no longer a way to simulate waiting.
 *
 * These ceremony tests are about the recovery flow across real processes, not
 * about the floor's mechanics, which are counter-proven in
 * `apps/core/src/device-recovery.test.ts` - including the wound-clock case.
 * So the Home is put into the state a ceremony test assumes: one that was
 * running through its window.
 */
function observeAnchorThrough(dataDir: string, instantMs: number): void {
  const anchorPath = join(dataDir, 'recovery-anchor', 'anchor.json');
  if (!existsSync(anchorPath)) {
    return;
  }
  const document = JSON.parse(readFileSync(anchorPath, 'utf8')) as Record<string, unknown>;
  const existing = typeof document.highWaterAt === 'string'
    ? Date.parse(document.highWaterAt)
    : Number.NEGATIVE_INFINITY;
  if (existing >= instantMs) {
    return;
  }
  writeFileSync(
    anchorPath,
    `${JSON.stringify({
      ...document,
      highWaterAt: new Date(instantMs).toISOString(),
    }, null, 2)}\n`,
  );
}

async function startCore(
  options: {
    restrictedLinkIntake?: boolean;
    dataDir?: string;
    restoredFrom?: RunningCore;
    nowMs?: number;
    /** The instant this Home is treated as having observed time up to. */
    observedThroughMs?: number;
  } = {},
): Promise<RunningCore> {
  const dataDir = options.dataDir ?? tempDir('pico-claim-core-');
  if (options.observedThroughMs !== undefined) {
    observeAnchorThrough(dataDir, options.observedThroughMs);
  }
  const port = await freePort();
  let linkPort: number | undefined;
  if (options.restrictedLinkIntake === true) {
    do {
      linkPort = await freePort();
    } while (linkPort === port);
  }
  const child = spawn(process.execPath, [
    ...(options.nowMs === undefined
      ? []
      : ['--require', TEST_FIXED_CLOCK]),
    CORE,
  ], {
    env: {
      ...process.env,
      PICO_DATABASE_PATH: join(dataDir, 'pico.sqlite'),
      PICO_BACKUP_DIRECTORY: join(dataDir, 'backups'),
      PICO_KEY_STORE_PATH: join(dataDir, 'keys'),
      PICO_HOME_HOST_KEY_STORE_PATH: join(dataDir, 'home-host-keys'),
      PICO_HOST: '127.0.0.1',
      PICO_PORT: String(port),
      PICO_FOUNDATION_ACCESS_MODE: 'loopback-dev',
      ...(options.nowMs === undefined
        ? {}
        : { PICO_TEST_NOW_MS: String(options.nowMs) }),
      ...(linkPort === undefined
        ? {}
        : {
          PICO_LINK_INTAKE_HOST: '127.0.0.1',
          PICO_LINK_INTAKE_PORT: String(linkPort),
        }),
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
    () => output.includes('Server listening at')
      && (linkPort === undefined || output.includes('Pico Link restricted intake listening')),
    'core_ready',
  );

  let claim: Record<string, unknown> | undefined;
  if (options.restoredFrom === undefined) {
    await waitFor(() => output.includes('picoHomeMoveInCode'), 'move_in_code');
    claim = output.split('\n')
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
  }
  const source = options.restoredFrom;

  return {
    child,
    dataDir,
    baseUrl: `http://127.0.0.1:${port}`,
    ...(linkPort === undefined ? {} : { linkBaseUrl: `http://127.0.0.1:${linkPort}` }),
    moveInCode: source?.moveInCode ?? String(claim!.picoHomeMoveInCode),
    hostSigningKeyFingerprintHex: source?.hostSigningKeyFingerprintHex
      ?? String(claim!.hostSigningKeyFingerprintHex),
    hostSigningPublicKeyHex: source?.hostSigningPublicKeyHex
      ?? String(claim!.hostSigningPublicKeyHex),
    hostKeyAgreementKeyFingerprintHex: source?.hostKeyAgreementKeyFingerprintHex
      ?? String(claim!.hostKeyAgreementKeyFingerprintHex),
    hostKeyAgreementPublicKeyHex: source?.hostKeyAgreementPublicKeyHex
      ?? String(claim!.hostKeyAgreementPublicKeyHex),
    log: () => output,
  };
}

interface RunningDaemon {
  child: ChildProcess;
  vaultHomePath: string;
  stderr: () => string;
}

async function startDaemon(): Promise<RunningDaemon> {
  const vaultHomePath = tempDir('pico-claim-vault-');
  writePicoVaultKeyfile(
    join(vaultHomePath, 'keyfiles', `pico_identity-${ownerIdentity.keyFingerprintHex}.json`),
    ownerIdentity.keyfile,
  );
  writePicoVaultKeyfile(
    join(vaultHomePath, 'keyfiles', `device_signing-${ownerSigning.keyFingerprintHex}.json`),
    ownerSigning.keyfile,
  );
  writePicoVaultKeyfile(
    join(vaultHomePath, 'keyfiles', `device_key_agreement-${ownerAgreement.keyFingerprintHex}.json`),
    ownerAgreement.keyfile,
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

  return { child, vaultHomePath, stderr: () => stderr };
}

/**
 * The reader's own Vault, on its own daemon: a reader is a different person
 * with different keys, and pretending otherwise would test nothing.
 */
async function startReaderDaemon(): Promise<RunningDaemon> {
  const vaultHomePath = tempDir('pico-reader-vault-');
  for (const [role, fixture] of [
    ['pico_identity', readerIdentity],
    ['device_signing', readerSigning],
    ['device_key_agreement', readerAgreement],
  ] as const) {
    writePicoVaultKeyfile(
      join(vaultHomePath, 'keyfiles', `${role}-${fixture.keyFingerprintHex}.json`),
      fixture.keyfile,
    );
  }

  const child = spawn(process.execPath, [
    CLI, 'daemon',
    '--vault-home', vaultHomePath,
    '--foundation-data', tempDir('pico-reader-data-'),
    '--foundation-backup', tempDir('pico-reader-backup-'),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  childProcesses.push(child);

  let stderr = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => {
    stderr += chunk;
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    let stdout = '';
    const timer = setTimeout(() => {
      rejectPromise(new Error(`reader_daemon_start_timeout:${stderr}`));
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
      rejectPromise(new Error(`reader_daemon_exited:${String(code)}:${stderr}`));
    });
  });

  return { child, vaultHomePath, stderr: () => stderr };
}

/**
 * A later device has no identity-root keyfile. It receives the public identity
 * key through the ceremony and proves Link authority only with its delegated
 * device-signing key.
 */
async function startTargetDaemon(): Promise<RunningDaemon> {
  const vaultHomePath = tempDir('pico-target-vault-');
  for (const [role, fixture] of [
    ['device_signing', targetSigning],
    ['device_key_agreement', targetAgreement],
  ] as const) {
    writePicoVaultKeyfile(
      join(vaultHomePath, 'keyfiles', `${role}-${fixture.keyFingerprintHex}.json`),
      fixture.keyfile,
    );
  }

  const child = spawn(process.execPath, [
    CLI, 'daemon',
    '--vault-home', vaultHomePath,
    '--foundation-data', tempDir('pico-target-data-'),
    '--foundation-backup', tempDir('pico-target-backup-'),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  childProcesses.push(child);

  let stderr = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => {
    stderr += chunk;
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    let stdout = '';
    const timer = setTimeout(() => {
      rejectPromise(new Error(`target_daemon_start_timeout:${stderr}`));
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
      rejectPromise(new Error(`target_daemon_exited:${String(code)}:${stderr}`));
    });
  });

  return { child, vaultHomePath, stderr: () => stderr };
}

async function startDaemonWithKeyfiles(
  prefix: string,
  keyfiles: ReadonlyArray<{
    role: 'pico_identity' | 'device_signing' | 'device_key_agreement';
    fixture: CreatePicoVaultKeyfileResult;
  }>,
): Promise<RunningDaemon> {
  const vaultHomePath = tempDir(prefix);
  for (const { role, fixture } of keyfiles) {
    writePicoVaultKeyfile(
      join(vaultHomePath, 'keyfiles', `${role}-${fixture.keyFingerprintHex}.json`),
      fixture.keyfile,
    );
  }

  const child = spawn(process.execPath, [
    CLI, 'daemon',
    '--vault-home', vaultHomePath,
    '--foundation-data', tempDir(`${prefix}data-`),
    '--foundation-backup', tempDir(`${prefix}backup-`),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  childProcesses.push(child);

  let stderr = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => {
    stderr += chunk;
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    let stdout = '';
    const timer = setTimeout(() => {
      rejectPromise(new Error(`recovery_daemon_start_timeout:${stderr}`));
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
      rejectPromise(new Error(`recovery_daemon_exited:${String(code)}:${stderr}`));
    });
  });

  return { child, vaultHomePath, stderr: () => stderr };
}

function startRestoredRootDaemon(
  restoredIdentity: CreatePicoVaultKeyfileResult,
): Promise<RunningDaemon> {
  return startDaemonWithKeyfiles('pico-restored-root-vault-', [{
    role: 'pico_identity',
    fixture: restoredIdentity,
  }]);
}

function startStaleDeviceDaemon(): Promise<RunningDaemon> {
  return startDaemonWithKeyfiles('pico-stale-device-vault-', [
    { role: 'device_signing', fixture: ownerSigning },
    { role: 'device_key_agreement', fixture: ownerAgreement },
  ]);
}

async function openDaemonClient(
  daemon: RunningDaemon,
): Promise<PicoVaultDaemonClient> {
  const client = await connectPicoVaultDaemonClient({
    socketPath: join(daemon.vaultHomePath, 'run', 'daemon.sock'),
  });
  await client.hello();
  return client;
}

async function createRecoveryLinkClient(input: {
  core: RunningCore;
  daemonClient: PicoVaultDaemonClient;
  signing: CreatePicoVaultKeyfileResult;
  agreement: CreatePicoVaultKeyfileResult;
  delegationId: string;
  nowMs?: number;
}): Promise<PicoLinkDirectClient> {
  return await createPicoLinkDirectClient({
    sodium,
    daemonClient: input.daemonClient,
    coreUrl: requireLinkBaseUrl(input.core),
    host: {
      signingPublicKeyHex: input.core.hostSigningPublicKeyHex,
      signingKeyFingerprintHex: input.core.hostSigningKeyFingerprintHex,
      keyAgreementPublicKeyHex: input.core.hostKeyAgreementPublicKeyHex,
      keyAgreementKeyFingerprintHex:
        input.core.hostKeyAgreementKeyFingerprintHex,
    },
    sender: {
      identityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      identityPublicKeyHex: ownerIdentity.publicKeyHex,
      deviceSigningKeyFingerprintHex: input.signing.keyFingerprintHex,
      deviceKeyAgreementKeyFingerprintHex: input.agreement.keyFingerprintHex,
      delegationId: input.delegationId,
    },
    ...(input.nowMs === undefined
      ? {}
      : { now: () => new Date(input.nowMs!) }),
  });
}

async function issueRecoveryCard(
  daemon: RunningDaemon,
  core: RunningCore,
  homeId: string,
): Promise<PicoVaultRecoveryCard> {
  const client = await openDaemonClient(daemon);
  try {
    const card = await client.ceremonyIssueRecoveryCard({
      signerKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      picoName: 'Mira',
      homeNameOrId: homeId,
      homeId,
      homeHostPicoIdentityFingerprintHex: ownerIdentity.keyFingerprintHex,
      hostSigningKeyFingerprintHex: core.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex:
        core.hostKeyAgreementKeyFingerprintHex,
      hostKeyAgreementPublicKeyHex: core.hostKeyAgreementPublicKeyHex,
      endpointHint: requireLinkBaseUrl(core),
      issuedAt: new Date().toISOString(),
      pin: RECOVERY_PIN,
    });
    return card as unknown as PicoVaultRecoveryCard;
  } finally {
    await client.close();
  }
}

function restoreIdentityFromCard(
  card: PicoVaultRecoveryCard,
): CreatePicoVaultKeyfileResult {
  return restorePicoVaultIdentityFromRecovery(sodium, {
    recoveryPhrase: card.recoveryPhrase,
    pinProtected: true,
    pin: RECOVERY_PIN,
    identityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
    passphrase: RESTORED_IDENTITY_PASSPHRASE,
  });
}

function foundingFacts(stdout: string): {
  homeId: string;
  firstDelegationId: string;
} {
  const founded = JSON.parse(stdout) as {
    claimState: { homeId: string };
    foundingRecord: {
      firstDeviceDelegation: { record: { delegationId: string } };
    };
  };
  return {
    homeId: founded.claimState.homeId,
    firstDelegationId:
      founded.foundingRecord.firstDeviceDelegation.record.delegationId,
  };
}

/** The person: a scripted `pico-vault unlock` that answers every prompt yes. */
async function startApprover(
  daemon: RunningDaemon,
  fixture: CreatePicoVaultKeyfileResult = ownerIdentity,
  role: 'pico_identity' | 'device_key_agreement' | 'device_signing' = 'pico_identity',
  passphrase: string = IDENTITY_PASSPHRASE,
): Promise<{ approvals: () => number }> {
  const before = daemon.stderr().split('"event":"approval_watch_started"').length - 1;
  const child = spawn(process.execPath, [
    CLI, 'unlock',
    '--vault-home', daemon.vaultHomePath,
    '--role', role,
    '--fingerprint', fixture.keyFingerprintHex,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  childProcesses.push(child);

  let stderr = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => {
    stderr += chunk;
  });
  child.stdin!.write(`${passphrase}\n`);

  await waitFor(() => stderr.includes('Vault unlocked.'), 'approver_unlock');
  child.stdin!.write('y\n'.repeat(16));
  await waitFor(
    () => daemon.stderr().split('"event":"approval_watch_started"').length - 1 > before,
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
    '--signing-fingerprint', ownerSigning.keyFingerprintHex,
    '--agreement-fingerprint', ownerAgreement.keyFingerprintHex,
    '--delegation-valid-until',
    new Date(Date.now() + (365 * 24 * 60 * 60 * 1_000)).toISOString(),
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

function runLinkCeremony(
  daemon: RunningDaemon,
  core: RunningCore,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const linkBaseUrl = requireLinkBaseUrl(core);
  const child = spawn(process.execPath, [
    CLI, 'ceremony', 'claim-home',
    '--vault-home', daemon.vaultHomePath,
    '--fingerprint', ownerIdentity.keyFingerprintHex,
    '--core-url', linkBaseUrl,
    '--move-in-code', core.moveInCode,
    '--host-signing-fingerprint', core.hostSigningKeyFingerprintHex,
    '--host-agreement-fingerprint', core.hostKeyAgreementKeyFingerprintHex,
    '--transport', 'link',
    '--link-signing-fingerprint', ownerSigning.keyFingerprintHex,
    '--link-agreement-fingerprint', ownerAgreement.keyFingerprintHex,
    '--delegation-valid-until',
    new Date(Date.now() + (365 * 24 * 60 * 60 * 1_000)).toISOString(),
    '--host-signing-public-key', core.hostSigningPublicKeyHex,
    '--host-agreement-public-key', core.hostKeyAgreementPublicKeyHex,
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

function runDaemonCli(
  daemon: RunningDaemon,
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [
    CLI,
    ...args,
    '--vault-home', daemon.vaultHomePath,
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

function runCreateDomainOverLink(
  daemon: RunningDaemon,
  core: RunningCore,
  domainId: string,
  delegationId: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const linkBaseUrl = requireLinkBaseUrl(core);
  return runDaemonCli(daemon, [
    'ceremony', 'create-domain',
    '--fingerprint', ownerIdentity.keyFingerprintHex,
    '--agreement-fingerprint', ownerAgreement.keyFingerprintHex,
    '--core-url', linkBaseUrl,
    '--domain-id', domainId,
    '--transport', 'link',
    '--link-signing-fingerprint', ownerSigning.keyFingerprintHex,
    '--link-agreement-fingerprint', ownerAgreement.keyFingerprintHex,
    '--link-delegation-id', delegationId,
    '--host-signing-fingerprint', core.hostSigningKeyFingerprintHex,
    '--host-agreement-fingerprint', core.hostKeyAgreementKeyFingerprintHex,
    '--host-signing-public-key', core.hostSigningPublicKeyHex,
    '--host-agreement-public-key', core.hostKeyAgreementPublicKeyHex,
  ]);
}

function lifecycleLinkFlags(
  core: RunningCore,
  signingKeyFingerprintHex: string,
  agreementKeyFingerprintHex: string,
  delegationId: string,
): string[] {
  return [
    '--fingerprint', ownerIdentity.keyFingerprintHex,
    '--core-url', requireLinkBaseUrl(core),
    '--link-signing-fingerprint', signingKeyFingerprintHex,
    '--link-agreement-fingerprint', agreementKeyFingerprintHex,
    '--link-delegation-id', delegationId,
    '--host-signing-fingerprint', core.hostSigningKeyFingerprintHex,
    '--host-agreement-fingerprint', core.hostKeyAgreementKeyFingerprintHex,
    '--host-signing-public-key', core.hostSigningPublicKeyHex,
    '--host-agreement-public-key', core.hostKeyAgreementPublicKeyHex,
  ];
}

function inspectDeviceLifecycle(
  signerDaemon: RunningDaemon,
  core: RunningCore,
  signingKeyFingerprintHex: string,
  agreementKeyFingerprintHex: string,
  delegationId: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return runCli([
    'ceremony', 'inspect-device-lifecycle',
    '--vault-home', signerDaemon.vaultHomePath,
    '--identity-public-key', ownerIdentity.publicKeyHex,
    ...lifecycleLinkFlags(
      core,
      signingKeyFingerprintHex,
      agreementKeyFingerprintHex,
      delegationId,
    ),
  ]);
}

function runLifecycleCeremony(
  action: 'enroll-device' | 'renew-device' | 'revoke-device',
  rootDaemon: RunningDaemon,
  sponsorDaemon: RunningDaemon,
  core: RunningCore,
  input: {
    sponsorSigningKeyFingerprintHex: string;
    sponsorAgreementKeyFingerprintHex: string;
    sponsorDelegationId: string;
    targetDaemon?: RunningDaemon;
    targetSigningKeyFingerprintHex?: string;
    targetAgreementKeyFingerprintHex?: string;
    targetDelegationId?: string;
  },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const targetFlags = action === 'revoke-device'
    ? [
      '--target-delegation-id', input.targetDelegationId!,
    ]
    : [
      '--target-vault-home', input.targetDaemon!.vaultHomePath,
      '--target-signing-fingerprint', input.targetSigningKeyFingerprintHex!,
      '--target-agreement-fingerprint', input.targetAgreementKeyFingerprintHex!,
      '--valid-until', new Date(Date.now() + (365 * 24 * 60 * 60 * 1_000)).toISOString(),
      ...(action === 'renew-device'
        ? ['--target-delegation-id', input.targetDelegationId!]
        : []),
    ];
  return runCli([
    'ceremony', action,
    '--vault-home', rootDaemon.vaultHomePath,
    '--sponsor-vault-home', sponsorDaemon.vaultHomePath,
    ...lifecycleLinkFlags(
      core,
      input.sponsorSigningKeyFingerprintHex,
      input.sponsorAgreementKeyFingerprintHex,
      input.sponsorDelegationId,
    ),
    ...targetFlags,
  ]);
}

function runCreateDomainThroughDevice(
  rootDaemon: RunningDaemon,
  linkDaemon: RunningDaemon,
  core: RunningCore,
  delegationId: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return runDaemonCli(rootDaemon, [
    'ceremony', 'create-domain',
    '--fingerprint', ownerIdentity.keyFingerprintHex,
    '--agreement-fingerprint', ownerAgreement.keyFingerprintHex,
    '--core-url', requireLinkBaseUrl(core),
    '--domain-id', 'later_device_authority_domain',
    '--transport', 'link',
    '--link-vault-home', linkDaemon.vaultHomePath,
    '--link-signing-fingerprint', targetSigning.keyFingerprintHex,
    '--link-agreement-fingerprint', targetAgreement.keyFingerprintHex,
    '--link-delegation-id', delegationId,
    '--host-signing-fingerprint', core.hostSigningKeyFingerprintHex,
    '--host-agreement-fingerprint', core.hostKeyAgreementKeyFingerprintHex,
    '--host-signing-public-key', core.hostSigningPublicKeyHex,
    '--host-agreement-public-key', core.hostKeyAgreementPublicKeyHex,
  ]);
}

async function stopCore(core: RunningCore): Promise<void> {
  if (core.child.exitCode !== null) {
    return;
  }
  const exited = new Promise<void>((resolvePromise) => {
    core.child.once('exit', () => {
      resolvePromise();
    });
  });
  core.child.kill('SIGTERM');
  await exited;
}

async function stopDaemon(daemon: RunningDaemon): Promise<void> {
  if (daemon.child.exitCode !== null) {
    return;
  }
  const exited = new Promise<void>((resolvePromise) => {
    daemon.child.once('exit', () => {
      resolvePromise();
    });
  });
  daemon.child.kill('SIGTERM');
  await exited;
}

function requireLinkBaseUrl(core: RunningCore): string {
  if (core.linkBaseUrl === undefined) {
    throw new Error('restricted_link_intake_not_started');
  }
  return core.linkBaseUrl;
}

function runCreateDomain(
  daemon: RunningDaemon,
  core: RunningCore,
  session: string,
  domainId: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [
    CLI, 'ceremony', 'create-domain',
    '--vault-home', daemon.vaultHomePath,
    '--fingerprint', ownerIdentity.keyFingerprintHex,
    '--agreement-fingerprint', ownerAgreement.keyFingerprintHex,
    '--core-url', core.baseUrl,
    '--session', session,
    '--domain-id', domainId,
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

async function bootstrapOperator(core: RunningCore): Promise<string> {
  const code = /"operatorBootstrapCode":"([^"]+)"/.exec(core.log());
  if (code === null) {
    throw new Error('operator_bootstrap_code_not_logged');
  }
  const response = await fetch(`${core.baseUrl}/api/auth/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bootstrapCode: code[1], passphrase: 'operator relay passphrase' }),
  });
  if (response.status !== 201) {
    throw new Error(`operator_bootstrap_failed:${response.status}`);
  }
  return ((await response.json()) as { session: string }).session;
}

function runIssueMembership(
  daemon: RunningDaemon,
  core: RunningCore,
  session: string,
  homeId: string,
  subjectFingerprintHex: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return runCli([
    'ceremony', 'issue-membership',
    '--vault-home', daemon.vaultHomePath,
    '--fingerprint', ownerIdentity.keyFingerprintHex,
    '--core-url', core.baseUrl,
    '--session', session,
    '--home-id', homeId,
    '--subject-identity-fingerprint', subjectFingerprintHex,
    '--host-signing-fingerprint', core.hostSigningKeyFingerprintHex,
    '--valid-until', new Date(Date.now() + (365 * 24 * 60 * 60 * 1_000)).toISOString(),
  ]);
}

function runCli(
  args: string[],
  options: { nowMs?: number } = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  // A CLI run that has to agree with a Foundation whose clock was moved
  // forward needs the same clock, or its own envelope freshness bounds put it
  // outside the window it is talking to.
  const child = spawn(process.execPath, [
    ...(options.nowMs === undefined ? [] : ['--require', TEST_FIXED_CLOCK]),
    CLI,
    ...args,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...(options.nowMs === undefined
      ? {}
      : { env: { ...process.env, PICO_TEST_NOW_MS: String(options.nowMs) } }),
  });
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

function runRotateDomain(
  daemon: RunningDaemon,
  core: RunningCore,
  session: string,
  domainRecordPath: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [
    CLI, 'ceremony', 'rotate-domain',
    '--vault-home', daemon.vaultHomePath,
    '--fingerprint', ownerIdentity.keyFingerprintHex,
    '--core-url', core.baseUrl,
    '--session', session,
    '--domain-record', domainRecordPath,
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
    await startApprover(daemon, ownerSigning, 'device_signing', SIGNING_PASSPHRASE);
    await startApprover(daemon, ownerAgreement, 'device_key_agreement', AGREEMENT_PASSPHRASE);

    const before = await fetch(`${core.baseUrl}/api/system/status`);
    expect(((await before.json()) as { picoHome: { claimState: { state: string } } })
      .picoHome.claimState.state).toBe('unclaimed');

    const run = await runCeremony(daemon, core);
    expect(run.code).toBe(0);

    const founding = JSON.parse(run.stdout) as { claimState: { state: string; homeId: string } };
    expect(founding.claimState.state).toBe('claimed');
    expect(founding.claimState.homeId).toMatch(/^home_[0-9a-f]{32}$/);

    // Delegation, claim and founding acceptance create authority. The device
    // co-signature proves possession and raises no additional approval.
    expect(approver.approvals()).toBe(3);

    // Setup Mode closes behind a claimed Home.
    expect((await fetch(`${core.baseUrl}/api/home/setup`)).status).toBe(404);

    const after = await fetch(`${core.baseUrl}/api/system/status`);
    expect(((await after.json()) as { picoHome: { claimState: { state: string } } })
      .picoHome.claimState.state).toBe('claimed');
  }, 120_000);

  it('founds a Home through the restricted Pico Link listener without exposing Foundation routes', async () => {
    const core = await startCore({ restrictedLinkIntake: true });
    const daemon = await startDaemon();
    const identityApprover = await startApprover(daemon);
    const signingApprover = await startApprover(
      daemon,
      ownerSigning,
      'device_signing',
      SIGNING_PASSPHRASE,
    );
    await startApprover(daemon, ownerAgreement, 'device_key_agreement', AGREEMENT_PASSPHRASE);

    const linkBaseUrl = requireLinkBaseUrl(core);
    for (const path of ['/', '/health', '/api/system/status', '/api/home/setup', '/api/events']) {
      const response = await fetch(`${linkBaseUrl}${path}`);
      expect(response.status, path).toBe(404);
    }
    expect((await fetch(`${linkBaseUrl}/api/home/link`)).status).toBe(405);

    const run = await runLinkCeremony(daemon, core);
    expect(run.code).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({
      claimState: { state: 'claimed' },
    });
    expect(core.log()).toContain('/api/home/link');

    // The claim and founding records create authority and remain approval
    // gated. The three outer Link requests only authenticate short-lived
    // operations, so the delegated device key is never asked for approval.
    expect(identityApprover.approvals()).toBe(3);
    expect(signingApprover.approvals()).toBe(0);
  }, 120_000);

  it('creates a reader-custody domain in the Home it just founded', async () => {
    const core = await startCore();
    const daemon = await startDaemon();
    const identityApprover = await startApprover(daemon);
    await startApprover(daemon, ownerSigning, 'device_signing', SIGNING_PASSPHRASE);
    await startApprover(daemon, ownerAgreement, 'device_key_agreement', AGREEMENT_PASSPHRASE);

    const claim = await runCeremony(daemon, core);
    expect(claim.code).toBe(0);

    // The operator is bootstrapped after founding, so its session carries the
    // Home binding that `home-authority-relay` requires. A relay only
    // transports; the authority stays in the owner's signature on the record.
    const bootstrapCode = /"operatorBootstrapCode":"([^"]+)"/.exec(core.log());
    expect(bootstrapCode).not.toBeNull();
    const bootstrap = await fetch(`${core.baseUrl}/api/auth/bootstrap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bootstrapCode: bootstrapCode![1], passphrase: 'operator relay passphrase' }),
    });
    expect(bootstrap.status).toBe(201);
    const session = ((await bootstrap.json()) as { session: string }).session;

    // The founding ceremony already required and kept open the owner's
    // key-agreement terminal, so the same person-held unlock supplies the
    // public key for the domain ceremony.

    const domain = await runCreateDomain(daemon, core, session, 'first_domain');
    expect(domain.code).toBe(0);

    const created = JSON.parse(domain.stdout) as {
      accepted: unknown;
      domainRecord: Record<string, unknown>;
    };
    expect(JSON.stringify(created.accepted)).toContain('first_domain');

    // Founding costs three approvals, the domain one more, all on the identity
    // terminal - the agreement key is used but signs nothing (ADR 0102).
    expect(identityApprover.approvals()).toBe(4);

    const listed = await fetch(`${core.baseUrl}/api/home/reader-custody/domains`, {
      headers: { authorization: `Bearer ${session}` },
    });
    expect(listed.status).toBe(200);
    expect(JSON.stringify(await listed.json())).toContain('first_domain');

    // The Foundation answers `GET .../domains` with a view that carries no
    // signature, so the owner's copy of the signed record is the only input a
    // later ceremony can take. Round-tripping it through `rotate-domain`
    // proves the client half works: the record is read, the daemon signs a
    // rotation from it, and the Foundation judges the result.
    //
    // It judges it unrotatable, and correctly so. A rotation answers a
    // revocation (ADR 0088 rotation debt); a domain with no readers has
    // nothing to rotate, so `invalid_rotation_causes` is the right answer and
    // reaching it means everything before it worked. A green end-to-end
    // rotation needs a reader grant first, and that needs a freshness
    // checkpoint the deployment default does not supply.
    const recordPath = join(tempDir('pico-claim-records-'), 'domain.json');
    writeFileSync(recordPath, JSON.stringify(created.domainRecord), 'utf8');

    const rotation = await runRotateDomain(daemon, core, session, recordPath);
    expect(rotation.code).not.toBe(0);
    expect(rotation.stderr).toContain('invalid_rotation_causes');
    // The person was still asked: the daemon signed before the Foundation
    // judged, which is the order the approval boundary requires.
    expect(identityApprover.approvals()).toBe(5);
  }, 180_000);

  it('delivers an authorized domain ceremony through Pico Link without a Foundation session', async () => {
    const core = await startCore({ restrictedLinkIntake: true });
    const daemon = await startDaemon();
    const identityApprover = await startApprover(daemon);
    await startApprover(daemon, ownerSigning, 'device_signing', SIGNING_PASSPHRASE);
    await startApprover(daemon, ownerAgreement, 'device_key_agreement', AGREEMENT_PASSPHRASE);

    const founded = await runLinkCeremony(daemon, core);
    expect(founded.code, founded.stderr).toBe(0);
    const delegationId = (JSON.parse(founded.stdout) as {
      foundingRecord: {
        firstDeviceDelegation: { record: { delegationId: string } };
      };
    }).foundingRecord.firstDeviceDelegation.record.delegationId;

    const domain = await runCreateDomainOverLink(daemon, core, 'link_domain', delegationId);
    expect(domain.code, domain.stderr).toBe(0);
    expect(JSON.stringify(JSON.parse(domain.stdout).accepted)).toContain('link_domain');
    expect(core.log()).toContain('/api/home/link');
    expect(core.log()).not.toContain('/api/auth/identity-session');

    // Delegation, claim, founding acceptance and domain authority are the four
    // root decisions. Claim possession and every outer Link request are
    // operational; no local identity-session ceremony exists in this path.
    expect(identityApprover.approvals()).toBe(4);
  }, 180_000);

  it('enrolls, renews and revokes later devices over real Vault and Link processes', async () => {
    const core = await startCore({ restrictedLinkIntake: true });
    const rootDaemon = await startDaemon();
    const rootApprover = await startApprover(rootDaemon);
    const firstDeviceApprover = await startApprover(
      rootDaemon,
      ownerSigning,
      'device_signing',
      SIGNING_PASSPHRASE,
    );
    await startApprover(
      rootDaemon,
      ownerAgreement,
      'device_key_agreement',
      AGREEMENT_PASSPHRASE,
    );
    const targetDaemon = await startTargetDaemon();
    const targetApprover = await startApprover(
      targetDaemon,
      targetSigning,
      'device_signing',
      TARGET_PASSPHRASE,
    );
    await startApprover(
      targetDaemon,
      targetAgreement,
      'device_key_agreement',
      TARGET_PASSPHRASE,
    );

    const founded = await runLinkCeremony(rootDaemon, core);
    expect(founded.code, founded.stderr).toBe(0);
    const firstDelegationId = (JSON.parse(founded.stdout) as {
      foundingRecord: {
        firstDeviceDelegation: { record: { delegationId: string } };
      };
    }).foundingRecord.firstDeviceDelegation.record.delegationId;

    const enrollment = await runLifecycleCeremony(
      'enroll-device',
      rootDaemon,
      rootDaemon,
      core,
      {
        sponsorSigningKeyFingerprintHex: ownerSigning.keyFingerprintHex,
        sponsorAgreementKeyFingerprintHex: ownerAgreement.keyFingerprintHex,
        sponsorDelegationId: firstDelegationId,
        targetDaemon,
        targetSigningKeyFingerprintHex: targetSigning.keyFingerprintHex,
        targetAgreementKeyFingerprintHex: targetAgreement.keyFingerprintHex,
      },
    );
    expect(enrollment.code, enrollment.stderr).toBe(0);
    const enrolled = JSON.parse(enrollment.stdout) as {
      accepted: {
        inserted: boolean;
        record: { receipt: { leavesNoActiveDevice: boolean } };
      };
      submission: { evidence: { targetDelegationId: string } };
    };
    const enrolledDelegationId = enrolled.submission.evidence.targetDelegationId;
    expect(enrolled.accepted).toMatchObject({
      inserted: true,
      record: { receipt: { leavesNoActiveDevice: false } },
    });

    // The target Vault has no identity-root keyfile. Its delegated device key
    // nevertheless authenticates a real Home-authority operation while the
    // root Vault separately creates the signed domain authority.
    const domain = await runCreateDomainThroughDevice(
      rootDaemon,
      targetDaemon,
      core,
      enrolledDelegationId,
    );
    expect(domain.code, domain.stderr).toBe(0);
    expect(domain.stdout).toContain('later_device_authority_domain');

    // Renewal is replacement: the target itself sponsors the request, its
    // Vault co-signs the activation, and the root holder approves two distinct
    // signatures (new delegation, old-delegation revocation).
    const renewal = await runLifecycleCeremony(
      'renew-device',
      rootDaemon,
      targetDaemon,
      core,
      {
        sponsorSigningKeyFingerprintHex: targetSigning.keyFingerprintHex,
        sponsorAgreementKeyFingerprintHex: targetAgreement.keyFingerprintHex,
        sponsorDelegationId: enrolledDelegationId,
        targetDaemon,
        targetSigningKeyFingerprintHex: targetSigning.keyFingerprintHex,
        targetAgreementKeyFingerprintHex: targetAgreement.keyFingerprintHex,
        targetDelegationId: enrolledDelegationId,
      },
    );
    expect(renewal.code, renewal.stderr).toBe(0);
    const renewed = JSON.parse(renewal.stdout) as {
      submission: { evidence: { targetDelegationId: string } };
    };
    const renewedDelegationId = renewed.submission.evidence.targetDelegationId;
    expect(renewedDelegationId).not.toBe(enrolledDelegationId);

    const oldTarget = await inspectDeviceLifecycle(
      targetDaemon,
      core,
      targetSigning.keyFingerprintHex,
      targetAgreement.keyFingerprintHex,
      enrolledDelegationId,
    );
    expect(oldTarget.code).not.toBe(0);
    expect(oldTarget.stderr).toContain('sender_is_not_authorized');

    const currentTarget = await inspectDeviceLifecycle(
      targetDaemon,
      core,
      targetSigning.keyFingerprintHex,
      targetAgreement.keyFingerprintHex,
      renewedDelegationId,
    );
    expect(currentTarget.code, currentTarget.stderr).toBe(0);
    expect(currentTarget.stdout).toContain(renewedDelegationId);

    // The renewed second device revokes the first. The first device's old
    // record stops authenticating immediately.
    const revokeFirst = await runLifecycleCeremony(
      'revoke-device',
      rootDaemon,
      targetDaemon,
      core,
      {
        sponsorSigningKeyFingerprintHex: targetSigning.keyFingerprintHex,
        sponsorAgreementKeyFingerprintHex: targetAgreement.keyFingerprintHex,
        sponsorDelegationId: renewedDelegationId,
        targetDelegationId: firstDelegationId,
      },
    );
    expect(revokeFirst.code, revokeFirst.stderr).toBe(0);
    const oldFirst = await inspectDeviceLifecycle(
      rootDaemon,
      core,
      ownerSigning.keyFingerprintHex,
      ownerAgreement.keyFingerprintHex,
      firstDelegationId,
    );
    expect(oldFirst.code).not.toBe(0);
    expect(oldFirst.stderr).toContain('sender_is_not_authorized');

    // Last-device self-revocation must return its signed accepted response,
    // even though the same key cannot authenticate the next request.
    const revokeLast = await runLifecycleCeremony(
      'revoke-device',
      rootDaemon,
      targetDaemon,
      core,
      {
        sponsorSigningKeyFingerprintHex: targetSigning.keyFingerprintHex,
        sponsorAgreementKeyFingerprintHex: targetAgreement.keyFingerprintHex,
        sponsorDelegationId: renewedDelegationId,
        targetDelegationId: renewedDelegationId,
      },
    );
    expect(revokeLast.code, revokeLast.stderr).toBe(0);
    expect(JSON.parse(revokeLast.stdout)).toMatchObject({
      accepted: {
        inserted: true,
        record: { receipt: { leavesNoActiveDevice: true } },
      },
    });
    const closed = await inspectDeviceLifecycle(
      targetDaemon,
      core,
      targetSigning.keyFingerprintHex,
      targetAgreement.keyFingerprintHex,
      renewedDelegationId,
    );
    expect(closed.code).not.toBe(0);
    expect(closed.stderr).toContain('sender_is_not_authorized');

    // Boot reconciliation verifies and reprojects the durable transition
    // chain. Zero-device state stays closed after a real Foundation restart.
    await stopCore(core);
    const restarted = await startCore({
      restrictedLinkIntake: true,
      dataDir: core.dataDir,
      restoredFrom: core,
    });
    const closedAfterRestart = await inspectDeviceLifecycle(
      targetDaemon,
      restarted,
      targetSigning.keyFingerprintHex,
      targetAgreement.keyFingerprintHex,
      renewedDelegationId,
    );
    expect(closedAfterRestart.code).not.toBe(0);
    expect(closedAfterRestart.stderr).toContain('sender_is_not_authorized');

    // Root: founding 3, enrollment 1, domain 1, renewal 2, revocations 2.
    // Device signatures are possession/transport only and never prompt.
    expect(rootApprover.approvals()).toBe(9);
    expect(firstDeviceApprover.approvals()).toBe(0);
    expect(targetApprover.approvals()).toBe(0);
  }, 300_000);

  it('recovers from a destroyed zero-device Vault after delay and real process restarts', async () => {
    const core = await startCore({ restrictedLinkIntake: true });
    const originalRootDaemon = await startDaemon();
    const originalRootApprover = await startApprover(originalRootDaemon);
    await startApprover(
      originalRootDaemon,
      ownerSigning,
      'device_signing',
      SIGNING_PASSPHRASE,
    );
    await startApprover(
      originalRootDaemon,
      ownerAgreement,
      'device_key_agreement',
      AGREEMENT_PASSPHRASE,
    );
    const targetDaemon = await startTargetDaemon();
    const targetSigningApprover = await startApprover(
      targetDaemon,
      targetSigning,
      'device_signing',
      TARGET_PASSPHRASE,
    );
    await startApprover(
      targetDaemon,
      targetAgreement,
      'device_key_agreement',
      TARGET_PASSPHRASE,
    );

    const founded = await runLinkCeremony(originalRootDaemon, core);
    expect(founded.code, founded.stderr).toBe(0);
    const { homeId, firstDelegationId } = foundingFacts(founded.stdout);
    const card = await issueRecoveryCard(originalRootDaemon, core, homeId);

    const revokeLast = await runLifecycleCeremony(
      'revoke-device',
      originalRootDaemon,
      originalRootDaemon,
      core,
      {
        sponsorSigningKeyFingerprintHex: ownerSigning.keyFingerprintHex,
        sponsorAgreementKeyFingerprintHex: ownerAgreement.keyFingerprintHex,
        sponsorDelegationId: firstDelegationId,
        targetDelegationId: firstDelegationId,
      },
    );
    expect(revokeLast.code, revokeLast.stderr).toBe(0);
    expect(JSON.parse(revokeLast.stdout)).toMatchObject({
      accepted: {
        inserted: true,
        record: { receipt: { leavesNoActiveDevice: true } },
      },
    });

    // The original Vault is genuinely gone. Recovery below starts from the
    // printed phrase and PIN in a different Vault directory and process.
    await stopDaemon(originalRootDaemon);
    rmSync(originalRootDaemon.vaultHomePath, { recursive: true, force: true });
    expect(existsSync(originalRootDaemon.vaultHomePath)).toBe(false);
    await stopCore(core);
    let restartedCore = await startCore({
      restrictedLinkIntake: true,
      dataDir: core.dataDir,
      restoredFrom: core,
    });

    const restoredIdentity = restoreIdentityFromCard(card);
    expect(restoredIdentity.publicKeyHex).toBe(ownerIdentity.publicKeyHex);
    const restoredRootDaemon = await startRestoredRootDaemon(restoredIdentity);
    const restoredRootApprover = await startApprover(
      restoredRootDaemon,
      restoredIdentity,
      'pico_identity',
      RESTORED_IDENTITY_PASSPHRASE,
    );
    const rootClient = await openDaemonClient(restoredRootDaemon);
    const targetClient = await openDaemonClient(targetDaemon);
    const targetDelegationId = 'delegation_recovery_zero_device';
    let targetLink = await createRecoveryLinkClient({
      core: restartedCore,
      daemonClient: targetClient,
      signing: targetSigning,
      agreement: targetAgreement,
      delegationId: targetDelegationId,
    });
    const initiated = await initiatePicoHomeDeviceRecovery({
      rootClient,
      targetClient,
      targetLinkClient: targetLink,
      sodium,
      homeId,
      hostSigningKeyFingerprintHex:
        restartedCore.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex:
        restartedCore.hostKeyAgreementKeyFingerprintHex,
      identityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      targetDelegationId,
      targetDeviceSigningKeyFingerprintHex: targetSigning.keyFingerprintHex,
      targetDeviceKeyAgreementKeyFingerprintHex:
        targetAgreement.keyFingerprintHex,
      validUntil: new Date(
        Date.now() + (365 * 24 * 60 * 60 * 1_000),
      ).toISOString(),
    });
    expect(initiated.preparationView.activeDevices).toEqual([]);

    // Restart neither loses the durable pending record nor bypasses its
    // 48-hour veto delay.
    await stopCore(restartedCore);
    restartedCore = await startCore({
      restrictedLinkIntake: true,
      dataDir: core.dataDir,
      restoredFrom: core,
    });
    targetLink = await createRecoveryLinkClient({
      core: restartedCore,
      daemonClient: targetClient,
      signing: targetSigning,
      agreement: targetAgreement,
      delegationId: targetDelegationId,
    });
    await expect(completePicoHomeDeviceRecovery({
      targetLinkClient: targetLink,
      pending: initiated.pending,
    })).rejects.toThrow('recovery_not_effective');

    const effectiveNowMs = Date.parse(initiated.pending.effectiveAt) + 1_000;
    await stopCore(restartedCore);
    restartedCore = await startCore({
      restrictedLinkIntake: true,
      dataDir: core.dataDir,
      restoredFrom: core,
      nowMs: effectiveNowMs,
      observedThroughMs: effectiveNowMs,
    });
    targetLink = await createRecoveryLinkClient({
      core: restartedCore,
      daemonClient: targetClient,
      signing: targetSigning,
      agreement: targetAgreement,
      delegationId: targetDelegationId,
      nowMs: effectiveNowMs,
    });
    const completed = await completePicoHomeDeviceRecovery({
      targetLinkClient: targetLink,
      pending: initiated.pending,
    });
    expect(completed).toMatchObject({
      status: 'consumed',
      record: {
        receipt: {
          recoveryId: initiated.pending.recoveryId,
          leavesExactlyOneActiveDevice: true,
        },
      },
    });
    /**
     * The two schema words in the completion record, measured unwalked on
     * 2026-09-16 (B182): nothing in the tree names
     * `invalid_recovery_completion_result`, and this is the record that says a
     * recovery really happened. A Home of another build answering here would
     * otherwise be read as a completed recovery.
     *
     * A stand-in link client is enough: the ceremony only reads `sender` for
     * the target binding, and then whatever the Home answered.
     */
    const standInResult = (record: unknown) => ({
      ...targetLink,
      request: async () => ({
        outcome: 'ok' as const,
        result: { status: 'consumed', record },
      }),
    }) as unknown as typeof targetLink;
    const goodRecord = completed.record as unknown as Record<string, unknown>;

    await expect(completePicoHomeDeviceRecovery({
      targetLinkClient: standInResult({
        ...goodRecord,
        schema: 'pico.home.device-recovery-record.v2',
      }),
      pending: initiated.pending,
    })).rejects.toThrow('invalid_recovery_completion_result');

    await expect(completePicoHomeDeviceRecovery({
      targetLinkClient: standInResult({
        ...goodRecord,
        submission: {
          ...(goodRecord.submission as Record<string, unknown>),
          schema: 'pico.home.device-recovery-submission.v2',
        },
      }),
      pending: initiated.pending,
    })).rejects.toThrow('invalid_recovery_completion_result');

    const recoveredView = await readPicoHomeDeviceLifecycle(targetLink, {
      identityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      sponsor: targetLink.sender,
    });
    expect(recoveredView.pendingRecovery).toBeNull();
    expect(recoveredView.devices.filter((device) => device.status === 'active'))
      .toEqual([expect.objectContaining({
        delegationId: targetDelegationId,
        deviceSigningKeyFingerprintHex: targetSigning.keyFingerprintHex,
        deviceKeyAgreementKeyFingerprintHex: targetAgreement.keyFingerprintHex,
      })]);

    // A fresh daemon containing only the destroyed device's copied keys still
    // cannot authenticate: total replacement revoked its old delegation.
    const staleDaemon = await startStaleDeviceDaemon();
    await startApprover(
      staleDaemon,
      ownerSigning,
      'device_signing',
      SIGNING_PASSPHRASE,
    );
    await startApprover(
      staleDaemon,
      ownerAgreement,
      'device_key_agreement',
      AGREEMENT_PASSPHRASE,
    );
    const staleClient = await openDaemonClient(staleDaemon);
    const staleLink = await createRecoveryLinkClient({
      core: restartedCore,
      daemonClient: staleClient,
      signing: ownerSigning,
      agreement: ownerAgreement,
      delegationId: firstDelegationId,
      nowMs: effectiveNowMs,
    });
    await expect(readPicoHomeDeviceLifecycle(staleLink, {
      identityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      sponsor: staleLink.sender,
    })).rejects.toThrow('sender_is_not_authorized');

    expect(originalRootApprover.approvals()).toBe(5);
    expect(restoredRootApprover.approvals()).toBe(3);
    expect(targetSigningApprover.approvals()).toBe(0);
    await Promise.all([rootClient.close(), targetClient.close(), staleClient.close()]);
  }, 300_000);

  it('surfaces pending recovery to a living device and honors veto and lifecycle cancellation', async () => {
    const core = await startCore({ restrictedLinkIntake: true });
    const livingDaemon = await startDaemon();
    await startApprover(livingDaemon);
    await startApprover(
      livingDaemon,
      ownerSigning,
      'device_signing',
      SIGNING_PASSPHRASE,
    );
    await startApprover(
      livingDaemon,
      ownerAgreement,
      'device_key_agreement',
      AGREEMENT_PASSPHRASE,
    );
    const founded = await runLinkCeremony(livingDaemon, core);
    expect(founded.code, founded.stderr).toBe(0);
    const { homeId, firstDelegationId } = foundingFacts(founded.stdout);
    const card = await issueRecoveryCard(livingDaemon, core, homeId);

    const restoredIdentity = restoreIdentityFromCard(card);
    const restoredRootDaemon = await startRestoredRootDaemon(restoredIdentity);
    await startApprover(
      restoredRootDaemon,
      restoredIdentity,
      'pico_identity',
      RESTORED_IDENTITY_PASSPHRASE,
    );
    const targetDaemon = await startTargetDaemon();
    await startApprover(
      targetDaemon,
      targetSigning,
      'device_signing',
      TARGET_PASSPHRASE,
    );
    await startApprover(
      targetDaemon,
      targetAgreement,
      'device_key_agreement',
      TARGET_PASSPHRASE,
    );
    const rootClient = await openDaemonClient(restoredRootDaemon);
    const livingClient = await openDaemonClient(livingDaemon);
    const targetClient = await openDaemonClient(targetDaemon);
    const livingLink = await createRecoveryLinkClient({
      core,
      daemonClient: livingClient,
      signing: ownerSigning,
      agreement: ownerAgreement,
      delegationId: firstDelegationId,
    });

    const firstRecoveryDelegationId = 'delegation_recovery_veto';
    let targetLink = await createRecoveryLinkClient({
      core,
      daemonClient: targetClient,
      signing: targetSigning,
      agreement: targetAgreement,
      delegationId: firstRecoveryDelegationId,
    });
    const firstRecovery = await initiatePicoHomeDeviceRecovery({
      rootClient,
      targetClient,
      targetLinkClient: targetLink,
      sodium,
      homeId,
      hostSigningKeyFingerprintHex: core.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex:
        core.hostKeyAgreementKeyFingerprintHex,
      identityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      targetDelegationId: firstRecoveryDelegationId,
      targetDeviceSigningKeyFingerprintHex: targetSigning.keyFingerprintHex,
      targetDeviceKeyAgreementKeyFingerprintHex:
        targetAgreement.keyFingerprintHex,
      validUntil: new Date(
        Date.now() + (365 * 24 * 60 * 60 * 1_000),
      ).toISOString(),
    });
    expect(firstRecovery.preparationView.activeDevices).toEqual([
      expect.objectContaining({ delegationId: firstDelegationId }),
    ]);
    const alarmView = await readPicoHomeDeviceLifecycle(livingLink, {
      identityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      sponsor: livingLink.sender,
    });
    expect(alarmView.pendingRecovery).toEqual(firstRecovery.pending);

    await expect(vetoPicoHomeDeviceRecovery({
      livingDeviceLinkClient: livingLink,
      recoveryId: firstRecovery.pending.recoveryId,
    })).resolves.toEqual({ status: 'vetoed' });
    await expect(completePicoHomeDeviceRecovery({
      targetLinkClient: targetLink,
      pending: firstRecovery.pending,
    })).rejects.toThrow('recovery_vetoed');
    expect((await readPicoHomeDeviceLifecycle(livingLink, {
      identityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      sponsor: livingLink.sender,
    })).pendingRecovery).toBeNull();

    const secondRecoveryDelegationId = 'delegation_recovery_cancelled';
    targetLink = await createRecoveryLinkClient({
      core,
      daemonClient: targetClient,
      signing: targetSigning,
      agreement: targetAgreement,
      delegationId: secondRecoveryDelegationId,
    });
    const secondRecovery = await initiatePicoHomeDeviceRecovery({
      rootClient,
      targetClient,
      targetLinkClient: targetLink,
      sodium,
      homeId,
      hostSigningKeyFingerprintHex: core.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex:
        core.hostKeyAgreementKeyFingerprintHex,
      identityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      targetDelegationId: secondRecoveryDelegationId,
      targetDeviceSigningKeyFingerprintHex: targetSigning.keyFingerprintHex,
      targetDeviceKeyAgreementKeyFingerprintHex:
        targetAgreement.keyFingerprintHex,
      validUntil: new Date(
        Date.now() + (365 * 24 * 60 * 60 * 1_000),
      ).toISOString(),
    });
    const enrollment = await runLifecycleCeremony(
      'enroll-device',
      restoredRootDaemon,
      livingDaemon,
      core,
      {
        sponsorSigningKeyFingerprintHex: ownerSigning.keyFingerprintHex,
        sponsorAgreementKeyFingerprintHex: ownerAgreement.keyFingerprintHex,
        sponsorDelegationId: firstDelegationId,
        targetDaemon,
        targetSigningKeyFingerprintHex: targetSigning.keyFingerprintHex,
        targetAgreementKeyFingerprintHex: targetAgreement.keyFingerprintHex,
      },
    );
    expect(enrollment.code, enrollment.stderr).toBe(0);
    await expect(completePicoHomeDeviceRecovery({
      targetLinkClient: targetLink,
      pending: secondRecovery.pending,
    })).rejects.toThrow('recovery_vetoed');
    expect((await readPicoHomeDeviceLifecycle(livingLink, {
      identityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      sponsor: livingLink.sender,
    })).pendingRecovery).toBeNull();
    expect(core.log()).toContain('accepted_device_lifecycle_transition');

    await Promise.all([rootClient.close(), livingClient.close(), targetClient.close()]);
  }, 300_000);

  it('rotates the host keys through the transitional CLI and re-pins from its output', async () => {
    // ADR 0115 U3. The custody machine is proven in-process; what this
    // proves is the ceremony a person actually reaches: the CLI prepares
    // over Link, the acceptance is approval-gated on the terminal holding
    // the identity unlock, the submit reply verifies under the retiring
    // pin, and the printed newHostPublicKeys are sufficient to keep working
    // - the old pins are refused from the next request on.
    const core = await startCore({ restrictedLinkIntake: true });
    const rootDaemon = await startDaemon();
    await startApprover(rootDaemon);
    await startApprover(rootDaemon, ownerSigning, 'device_signing', SIGNING_PASSPHRASE);
    await startApprover(
      rootDaemon,
      ownerAgreement,
      'device_key_agreement',
      AGREEMENT_PASSPHRASE,
    );
    const founded = await runLinkCeremony(rootDaemon, core);
    expect(founded.code, founded.stderr).toBe(0);
    const { firstDelegationId } = foundingFacts(founded.stdout);

    const rotated = await runCli([
      'ceremony', 'rotate-host-key',
      '--vault-home', rootDaemon.vaultHomePath,
      '--transport', 'link',
      ...lifecycleLinkFlags(
        core,
        ownerSigning.keyFingerprintHex,
        ownerAgreement.keyFingerprintHex,
        firstDelegationId,
      ),
    ]);
    expect(rotated.code, rotated.stderr).toBe(0);
    const rotation = JSON.parse(rotated.stdout) as {
      link: { chainPosition: number };
      newHostPublicKeys: {
        signingKeyFingerprintHex: string;
        signingPublicKeyHex: string;
        keyAgreementKeyFingerprintHex: string;
        keyAgreementPublicKeyHex: string;
      };
      recoveryCardsStale: boolean;
    };
    expect(rotation.link.chainPosition).toBe(0);
    expect(rotation.recoveryCardsStale).toBe(true);
    expect(rotation.newHostPublicKeys.signingKeyFingerprintHex)
      .not.toBe(core.hostSigningKeyFingerprintHex);
    // The consequence is said where the person is: the CLI warns before the
    // approval, and the rendered 0106 statement itself is pinned by the
    // sign-rendering vectors.
    expect(rotated.stderr).toContain('makes every printed Recovery Card stale');

    // The printed bundle is the re-pin: the same read that worked before the
    // rotation works with the new pins, and the retired pins are refused.
    const inspectFlags = (pins: {
      signingKeyFingerprintHex: string;
      signingPublicKeyHex: string;
      keyAgreementKeyFingerprintHex: string;
      keyAgreementPublicKeyHex: string;
    }) => [
      'ceremony', 'inspect-device-lifecycle',
      '--vault-home', rootDaemon.vaultHomePath,
      '--identity-public-key', ownerIdentity.publicKeyHex,
      '--fingerprint', ownerIdentity.keyFingerprintHex,
      '--core-url', requireLinkBaseUrl(core),
      '--link-signing-fingerprint', ownerSigning.keyFingerprintHex,
      '--link-agreement-fingerprint', ownerAgreement.keyFingerprintHex,
      '--link-delegation-id', firstDelegationId,
      '--host-signing-fingerprint', pins.signingKeyFingerprintHex,
      '--host-agreement-fingerprint', pins.keyAgreementKeyFingerprintHex,
      '--host-signing-public-key', pins.signingPublicKeyHex,
      '--host-agreement-public-key', pins.keyAgreementPublicKeyHex,
    ];
    const rePinned = await runCli(inspectFlags(rotation.newHostPublicKeys));
    expect(rePinned.code, rePinned.stderr).toBe(0);
    expect((JSON.parse(rePinned.stdout) as {
      devices: { status: string }[];
    }).devices.some((device) => device.status === 'active')).toBe(true);

    const stalePinned = await runCli(inspectFlags({
      signingKeyFingerprintHex: core.hostSigningKeyFingerprintHex,
      signingPublicKeyHex: core.hostSigningPublicKeyHex,
      keyAgreementKeyFingerprintHex: core.hostKeyAgreementKeyFingerprintHex,
      keyAgreementPublicKeyHex: core.hostKeyAgreementPublicKeyHex,
    }));
    expect(stalePinned.code).not.toBe(0);

    // ADR 0115 U4. Every client beyond the accepting one is exactly here:
    // stranded on the retired pins, unable to use the sealed channel at all.
    // The unsealed chain read on the same restricted listener plus the
    // acceptor pin is what un-strands it - proven over the real processes.
    const refreshFlags = (acceptorFingerprintHex: string) => [
      'refresh-host-pins',
      '--core-url', requireLinkBaseUrl(core),
      '--host-signing-fingerprint', core.hostSigningKeyFingerprintHex,
      '--host-agreement-fingerprint', core.hostKeyAgreementKeyFingerprintHex,
      '--home-host-pico-fingerprint', acceptorFingerprintHex,
    ];
    const refreshed = await runCli(refreshFlags(ownerIdentity.keyFingerprintHex));
    expect(refreshed.code, refreshed.stderr).toBe(0);
    const refresh = JSON.parse(refreshed.stdout) as {
      status: string;
      followedLinks?: number;
      head: {
        signingPublicKeyHex: string;
        signingKeyFingerprintHex: string;
        keyAgreementPublicKeyHex: string;
        keyAgreementKeyFingerprintHex: string;
      };
    };
    expect(refresh.status).toBe('repinned');
    expect(refresh.followedLinks).toBe(1);
    expect(refresh.head).toEqual({
      signingPublicKeyHex: rotation.newHostPublicKeys.signingPublicKeyHex,
      signingKeyFingerprintHex: rotation.newHostPublicKeys.signingKeyFingerprintHex,
      keyAgreementPublicKeyHex: rotation.newHostPublicKeys.keyAgreementPublicKeyHex,
      keyAgreementKeyFingerprintHex:
        rotation.newHostPublicKeys.keyAgreementKeyFingerprintHex,
    });
    // The verified head is a working pin, not just a printout.
    const chainRePinned = await runCli(inspectFlags(refresh.head));
    expect(chainRePinned.code, chainRePinned.stderr).toBe(0);

    // Already-current pins get `current`, never an invented rotation.
    const current = await runCli([
      'refresh-host-pins',
      '--core-url', requireLinkBaseUrl(core),
      '--host-signing-fingerprint', refresh.head.signingKeyFingerprintHex,
      '--host-agreement-fingerprint', refresh.head.keyAgreementKeyFingerprintHex,
      '--home-host-pico-fingerprint', ownerIdentity.keyFingerprintHex,
    ]);
    expect(current.code, current.stderr).toBe(0);
    expect((JSON.parse(current.stdout) as { status: string }).status)
      .toBe('current');

    // A wrong acceptor pin makes the same served chain prove nothing: the
    // stolen-disk defence, exercised against the real Home. The client
    // stays on its pins and exits loudly.
    const foreignAcceptor = await runCli(refreshFlags('ab'.repeat(32)));
    expect(foreignAcceptor.code).not.toBe(0);
    expect((JSON.parse(foreignAcceptor.stdout) as { status: string }).status)
      .toBe('unverified');
  }, 240_000);

  it('drives initiate, veto and complete through the transitional recovery CLI', async () => {
    // ADR 0112 S1. The library ceremonies are proven above; what this proves
    // is the wrapper a person actually reaches - its flags, its transport
    // construction, its file handoff and its output - over real processes.
    const core = await startCore({ restrictedLinkIntake: true });
    const rootDaemon = await startDaemon();
    await startApprover(rootDaemon);
    await startApprover(rootDaemon, ownerSigning, 'device_signing', SIGNING_PASSPHRASE);
    await startApprover(
      rootDaemon,
      ownerAgreement,
      'device_key_agreement',
      AGREEMENT_PASSPHRASE,
    );
    const targetDaemon = await startTargetDaemon();
    await startApprover(targetDaemon, targetSigning, 'device_signing', TARGET_PASSPHRASE);
    await startApprover(
      targetDaemon,
      targetAgreement,
      'device_key_agreement',
      TARGET_PASSPHRASE,
    );

    const founded = await runLinkCeremony(rootDaemon, core);
    expect(founded.code, founded.stderr).toBe(0);
    const { homeId, firstDelegationId } = foundingFacts(founded.stdout);
    const targetDelegationId = 'delegation_recovery_cli';
    const recoveryFlags = [
      '--vault-home', rootDaemon.vaultHomePath,
      '--target-vault-home', targetDaemon.vaultHomePath,
      '--fingerprint', ownerIdentity.keyFingerprintHex,
      '--core-url', requireLinkBaseUrl(core),
      '--home-id', homeId,
      '--target-delegation-id', targetDelegationId,
      '--target-signing-fingerprint', targetSigning.keyFingerprintHex,
      '--target-agreement-fingerprint', targetAgreement.keyFingerprintHex,
      '--valid-until', new Date(Date.now() + (365 * 24 * 60 * 60 * 1_000)).toISOString(),
      '--host-signing-fingerprint', core.hostSigningKeyFingerprintHex,
      '--host-agreement-fingerprint', core.hostKeyAgreementKeyFingerprintHex,
      '--host-signing-public-key', core.hostSigningPublicKeyHex,
      '--host-agreement-public-key', core.hostKeyAgreementPublicKeyHex,
    ];

    const initiated = await runCli(['ceremony', 'initiate-recovery', ...recoveryFlags]);
    expect(initiated.code, initiated.stderr).toBe(0);
    const firstPending = (JSON.parse(initiated.stdout) as {
      pending: { recoveryId: string; effectiveAt: string };
      preparationView: { activeDevices: unknown[] };
    });
    // The Home still has its founding device, so this is the thief's shape:
    // a root-signed recovery against a living identity.
    expect(firstPending.preparationView.activeDevices).toHaveLength(1);

    // The living device vetoes through the CLI. Nothing else may.
    const vetoed = await runCli([
      'ceremony', 'veto-recovery',
      '--vault-home', rootDaemon.vaultHomePath,
      '--identity-public-key', ownerIdentity.publicKeyHex,
      '--recovery-id', firstPending.pending.recoveryId,
      ...lifecycleLinkFlags(
        core,
        ownerSigning.keyFingerprintHex,
        ownerAgreement.keyFingerprintHex,
        firstDelegationId,
      ),
    ]);
    expect(vetoed.code, vetoed.stderr).toBe(0);
    expect(JSON.parse(vetoed.stdout)).toEqual({ status: 'vetoed' });

    // A vetoed recovery is spent: completing it must fail even before the
    // clock is anywhere near its window.
    const pendingPath = join(tempDir('pico-claim-pending-'), 'pending.json');
    writeFileSync(pendingPath, JSON.stringify(firstPending.pending));
    const completeVetoed = await runCli([
      'ceremony', 'complete-recovery',
      '--vault-home', targetDaemon.vaultHomePath,
      '--fingerprint', ownerIdentity.keyFingerprintHex,
      '--identity-public-key', ownerIdentity.publicKeyHex,
      '--core-url', requireLinkBaseUrl(core),
      '--pending-file', pendingPath,
      '--target-delegation-id', targetDelegationId,
      '--target-signing-fingerprint', targetSigning.keyFingerprintHex,
      '--target-agreement-fingerprint', targetAgreement.keyFingerprintHex,
      '--host-signing-fingerprint', core.hostSigningKeyFingerprintHex,
      '--host-agreement-fingerprint', core.hostKeyAgreementKeyFingerprintHex,
      '--host-signing-public-key', core.hostSigningPublicKeyHex,
      '--host-agreement-public-key', core.hostKeyAgreementPublicKeyHex,
    ]);
    expect(completeVetoed.code).toBe(1);
    expect(completeVetoed.stderr).toContain('recovery_vetoed');

    // The owner's own recovery: a second initiation, completed after the
    // delay from the same target device.
    const second = await runCli(['ceremony', 'initiate-recovery', ...recoveryFlags]);
    expect(second.code, second.stderr).toBe(0);
    const secondPending = (JSON.parse(second.stdout) as {
      pending: { recoveryId: string; effectiveAt: string };
    }).pending;
    expect(secondPending.recoveryId).not.toBe(firstPending.pending.recoveryId);
    writeFileSync(pendingPath, JSON.stringify(secondPending));

    // The Foundation is restarted below and comes back on a fresh port, so
    // the flags are derived from whichever Core is being talked to.
    const completionFlags = (target: RunningCore): string[] => [
      'ceremony', 'complete-recovery',
      '--vault-home', targetDaemon.vaultHomePath,
      '--fingerprint', ownerIdentity.keyFingerprintHex,
      '--identity-public-key', ownerIdentity.publicKeyHex,
      '--core-url', requireLinkBaseUrl(target),
      '--pending-file', pendingPath,
      '--target-delegation-id', targetDelegationId,
      '--target-signing-fingerprint', targetSigning.keyFingerprintHex,
      '--target-agreement-fingerprint', targetAgreement.keyFingerprintHex,
      '--host-signing-fingerprint', target.hostSigningKeyFingerprintHex,
      '--host-agreement-fingerprint', target.hostKeyAgreementKeyFingerprintHex,
      '--host-signing-public-key', target.hostSigningPublicKeyHex,
      '--host-agreement-public-key', target.hostKeyAgreementPublicKeyHex,
    ];
    const tooEarly = await runCli(completionFlags(core));
    expect(tooEarly.code).toBe(1);
    expect(tooEarly.stderr).toContain('recovery_not_effective');

    // Move the Home past the veto window; the CLI has to carry the same
    // clock or its envelope bounds fall outside it.
    const effectiveNowMs = Date.parse(secondPending.effectiveAt) + 1_000;
    await stopCore(core);
    const laterCore = await startCore({
      restrictedLinkIntake: true,
      dataDir: core.dataDir,
      restoredFrom: core,
      nowMs: effectiveNowMs,
      observedThroughMs: effectiveNowMs,
    });
    const completed = await runCli(completionFlags(laterCore), { nowMs: effectiveNowMs });
    expect(completed.code, completed.stderr).toBe(0);
    expect(JSON.parse(completed.stdout)).toMatchObject({
      status: 'consumed',
      record: {
        receipt: {
          recoveryId: secondPending.recoveryId,
          leavesExactlyOneActiveDevice: true,
        },
      },
    });

    // Total replacement really happened: the target is the only device left,
    // and the founding device is dead.
    const inspected = await runCli([
      'ceremony', 'inspect-device-lifecycle',
      '--vault-home', targetDaemon.vaultHomePath,
      '--identity-public-key', ownerIdentity.publicKeyHex,
      ...lifecycleLinkFlags(
        laterCore,
        targetSigning.keyFingerprintHex,
        targetAgreement.keyFingerprintHex,
        targetDelegationId,
      ),
    ], { nowMs: effectiveNowMs });
    expect(inspected.code, inspected.stderr).toBe(0);
    const view = JSON.parse(inspected.stdout) as {
      pendingRecovery: unknown;
      devices: { delegationId: string; status: string }[];
    };
    expect(view.pendingRecovery).toBeNull();
    expect(view.devices.filter((device) => device.status === 'active'))
      .toEqual([expect.objectContaining({ delegationId: targetDelegationId })]);
  }, 300_000);

  it('lapses an uncompleted recovery across a future Foundation restart', async () => {
    const core = await startCore({ restrictedLinkIntake: true });
    const livingDaemon = await startDaemon();
    await startApprover(livingDaemon);
    await startApprover(
      livingDaemon,
      ownerSigning,
      'device_signing',
      SIGNING_PASSPHRASE,
    );
    await startApprover(
      livingDaemon,
      ownerAgreement,
      'device_key_agreement',
      AGREEMENT_PASSPHRASE,
    );
    const founded = await runLinkCeremony(livingDaemon, core);
    expect(founded.code, founded.stderr).toBe(0);
    const { homeId, firstDelegationId } = foundingFacts(founded.stdout);
    const card = await issueRecoveryCard(livingDaemon, core, homeId);
    const restoredIdentity = restoreIdentityFromCard(card);
    const restoredRootDaemon = await startRestoredRootDaemon(restoredIdentity);
    await startApprover(
      restoredRootDaemon,
      restoredIdentity,
      'pico_identity',
      RESTORED_IDENTITY_PASSPHRASE,
    );
    const targetDaemon = await startTargetDaemon();
    await startApprover(
      targetDaemon,
      targetSigning,
      'device_signing',
      TARGET_PASSPHRASE,
    );
    await startApprover(
      targetDaemon,
      targetAgreement,
      'device_key_agreement',
      TARGET_PASSPHRASE,
    );
    const rootClient = await openDaemonClient(restoredRootDaemon);
    const livingClient = await openDaemonClient(livingDaemon);
    const targetClient = await openDaemonClient(targetDaemon);
    const targetDelegationId = 'delegation_recovery_lapse';
    let targetLink = await createRecoveryLinkClient({
      core,
      daemonClient: targetClient,
      signing: targetSigning,
      agreement: targetAgreement,
      delegationId: targetDelegationId,
    });
    const initiated = await initiatePicoHomeDeviceRecovery({
      rootClient,
      targetClient,
      targetLinkClient: targetLink,
      sodium,
      homeId,
      hostSigningKeyFingerprintHex: core.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex:
        core.hostKeyAgreementKeyFingerprintHex,
      identityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      targetDelegationId,
      targetDeviceSigningKeyFingerprintHex: targetSigning.keyFingerprintHex,
      targetDeviceKeyAgreementKeyFingerprintHex:
        targetAgreement.keyFingerprintHex,
      validUntil: new Date(
        Date.now() + (365 * 24 * 60 * 60 * 1_000),
      ).toISOString(),
    });

    const lapsedNowMs = Date.parse(initiated.pending.completionExpiresAt) + 1_000;
    await stopCore(core);
    const restartedCore = await startCore({
      restrictedLinkIntake: true,
      dataDir: core.dataDir,
      restoredFrom: core,
      nowMs: lapsedNowMs,
      observedThroughMs: lapsedNowMs,
    });
    targetLink = await createRecoveryLinkClient({
      core: restartedCore,
      daemonClient: targetClient,
      signing: targetSigning,
      agreement: targetAgreement,
      delegationId: targetDelegationId,
      nowMs: lapsedNowMs,
    });
    await expect(completePicoHomeDeviceRecovery({
      targetLinkClient: targetLink,
      pending: initiated.pending,
    })).rejects.toThrow('recovery_lapsed');

    const livingLink = await createRecoveryLinkClient({
      core: restartedCore,
      daemonClient: livingClient,
      signing: ownerSigning,
      agreement: ownerAgreement,
      delegationId: firstDelegationId,
      nowMs: lapsedNowMs,
    });
    expect((await readPicoHomeDeviceLifecycle(livingLink, {
      identityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      sponsor: livingLink.sender,
    })).pendingRecovery).toBeNull();

    await Promise.all([rootClient.close(), livingClient.close(), targetClient.close()]);
  }, 300_000);

  it('issues a Home membership whose host activation the Foundation adds', async () => {
    const core = await startCore();
    const daemon = await startDaemon();
    const approver = await startApprover(daemon);
    await startApprover(daemon, ownerSigning, 'device_signing', SIGNING_PASSPHRASE);
    await startApprover(daemon, ownerAgreement, 'device_key_agreement', AGREEMENT_PASSPHRASE);

    const claim = await runCeremony(daemon, core);
    expect(claim.code).toBe(0);
    const homeId = (JSON.parse(claim.stdout) as { claimState: { homeId: string } }).claimState.homeId;
    const session = await bootstrapOperator(core);

    // A membership for some other Pico. The subject never signs anything: a
    // membership is given by the Home's authority, not claimed by its holder.
    const subjectFingerprintHex = 'ab'.repeat(32);
    const issued = await runIssueMembership(daemon, core, session, homeId, subjectFingerprintHex);
    expect(issued.code).toBe(0);

    // The client sent an issuer statement and nothing else: the activation
    // signature is made with the Home host key, which no Vault holds.
    const result = JSON.parse(issued.stdout) as {
      accepted: Record<string, unknown>;
      issuerStatement: Record<string, unknown>;
    };
    expect(result.issuerStatement.hostActivationSignatureHex).toBeUndefined();

    // That the Foundation added a valid one is proven by the record existing
    // at all: the store re-verifies both halves before writing, so a stored
    // membership cannot carry a bad or missing activation signature. The
    // route answers with a view, so it is not visible in the response.
    expect(JSON.stringify(result.accepted)).toContain(subjectFingerprintHex);

    // Founding cost three approvals, the membership a fourth.
    expect(approver.approvals()).toBe(4);

    const listed = await fetch(`${core.baseUrl}/api/home/memberships`, {
      headers: { authorization: `Bearer ${session}` },
    });
    expect(listed.status).toBe(200);
    expect(JSON.stringify(await listed.json())).toContain(subjectFingerprintHex);
  }, 180_000);

  it('grants a reader access to a domain, end to end across two Vaults', async () => {
    const core = await startCore();
    const ownerDaemon = await startDaemon();
    const ownerApprover = await startApprover(ownerDaemon);
    await startApprover(ownerDaemon, ownerSigning, 'device_signing', SIGNING_PASSPHRASE);
    await startApprover(ownerDaemon, ownerAgreement, 'device_key_agreement', AGREEMENT_PASSPHRASE);

    const claim = await runCeremony(ownerDaemon, core);
    expect(claim.code).toBe(0);
    const homeId = (JSON.parse(claim.stdout) as { claimState: { homeId: string } }).claimState.homeId;
    const session = await bootstrapOperator(core);

    // 1. The owner admits the reader to the Home. Without this the reader
    //    cannot even open a session.
    const membership = await runIssueMembership(
      ownerDaemon, core, session, homeId, readerIdentity.keyFingerprintHex,
    );
    if (membership.code !== 0) {
      throw new Error(`MEMBERSHIP_FAILED: ${membership.stderr}`);
    }

    // 2. The reader delegates to its own device keys, in its own Vault.
    const readerDaemon = await startReaderDaemon();
    await startApprover(readerDaemon, readerIdentity, 'pico_identity', READER_PASSPHRASE);
    await startApprover(readerDaemon, readerSigning, 'device_signing', READER_PASSPHRASE);
    await startApprover(readerDaemon, readerAgreement, 'device_key_agreement', READER_PASSPHRASE);

    const delegated = await runCli([
      'ceremony', 'delegate-device',
      '--vault-home', readerDaemon.vaultHomePath,
      '--fingerprint', readerIdentity.keyFingerprintHex,
      '--signing-fingerprint', readerSigning.keyFingerprintHex,
      '--agreement-fingerprint', readerAgreement.keyFingerprintHex,
      '--valid-until', new Date(Date.now() + (365 * 24 * 60 * 60 * 1_000)).toISOString(),
    ]);
    if (delegated.code !== 0) {
      throw new Error(`DELEGATE_FAILED: ${delegated.stderr}`);
    }
    const delegationPath = join(tempDir('pico-reader-records-'), 'delegation.json');
    writeFileSync(delegationPath, delegated.stdout.trim(), 'utf8');
    const delegationId = (JSON.parse(delegated.stdout) as {
      record: { delegationId: string };
    }).record.delegationId;

    // 3. Opening the session is what registers the reader key (app.ts:1733).
    const opened = await runCli([
      'ceremony', 'open-identity-session',
      '--vault-home', readerDaemon.vaultHomePath,
      '--fingerprint', readerIdentity.keyFingerprintHex,
      '--signing-fingerprint', readerSigning.keyFingerprintHex,
      '--agreement-fingerprint', readerAgreement.keyFingerprintHex,
      '--core-url', core.baseUrl,
      '--delegation', delegationPath,
    ]);
    if (opened.code !== 0) {
      throw new Error(`OPEN_SESSION_FAILED: ${opened.stderr}`);
    }

    // 4. The reader asserts its own device keys are current. Exempt from
    //    approval, because a checkpoint lasts five minutes and is reissued
    //    constantly.
    const published = await runCli([
      'ceremony', 'publish-checkpoint',
      '--vault-home', readerDaemon.vaultHomePath,
      '--fingerprint', readerIdentity.keyFingerprintHex,
      '--core-url', core.baseUrl,
      '--session', session,
      '--home-id', homeId,
      '--reader-device-signing-fingerprint', readerSigning.keyFingerprintHex,
      '--reader-device-agreement-fingerprint', readerAgreement.keyFingerprintHex,
      '--reader-delegation-id', delegationId,
      '--observed-through-lifecycle-order', 'seq:0000000000000001',
    ]);
    if (published.code !== 0) {
      throw new Error(`PUBLISH_FAILED: ${published.stderr}`);
    }

    // 5. The owner creates the domain and grants the reader access to it.
    //    Both reuse the agreement-key unlock held since founding - it never
    //    signs, but its public key seals the KEK to the reader.
    const domain = await runCreateDomain(ownerDaemon, core, session, 'shared_domain');
    if (domain.code !== 0) {
      throw new Error(`DOMAIN_FAILED: ${domain.stderr}`);
    }
    const domainRecordPath = join(tempDir('pico-owner-records-'), 'domain.json');
    writeFileSync(
      domainRecordPath,
      JSON.stringify((JSON.parse(domain.stdout) as { domainRecord: unknown }).domainRecord),
      'utf8',
    );
    const readerKeyRecordPath = join(tempDir('pico-owner-records-'), 'reader-key.json');
    writeFileSync(readerKeyRecordPath, JSON.stringify({
      suite: 'pico.suite.id.v1',
      keyRole: 'device_key_agreement',
      publicKeyHex: readerAgreement.publicKeyHex,
    }), 'utf8');

    const granted = await runCli([
      'ceremony', 'grant-reader',
      '--vault-home', ownerDaemon.vaultHomePath,
      '--fingerprint', ownerIdentity.keyFingerprintHex,
      '--agreement-fingerprint', ownerAgreement.keyFingerprintHex,
      '--core-url', core.baseUrl,
      '--session', session,
      '--domain-record', domainRecordPath,
      '--reader-key-record', readerKeyRecordPath,
      '--reader-identity-fingerprint', readerIdentity.keyFingerprintHex,
      '--reader-device-signing-fingerprint', readerSigning.keyFingerprintHex,
      '--reader-delegation-id', delegationId,
      '--valid-until', new Date(Date.now() + (365 * 24 * 60 * 60 * 1_000)).toISOString(),
    ]);
    if (granted.code !== 0) {
      throw new Error(`GRANT_FAILED: ${granted.stderr}`);
    }

    const grants = await fetch(`${core.baseUrl}/api/home/reader-custody/reader-grants`, {
      headers: { authorization: `Bearer ${session}` },
    });
    expect(grants.status).toBe(200);
    expect(JSON.stringify(await grants.json())).toContain(readerIdentity.keyFingerprintHex);

    // Owner terminal: claim, founding, membership, domain, grant.
    expect(ownerApprover.approvals()).toBe(6);
  }, 300_000);

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
    await startApprover(daemon, ownerSigning, 'device_signing', SIGNING_PASSPHRASE);
    await startApprover(daemon, ownerAgreement, 'device_key_agreement', AGREEMENT_PASSPHRASE);

    const run = await runCeremony(daemon, core, { moveInCode: 'WRONG-MOVE-IN-CODE-0000000000000' });

    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('foundation_rejected:401');
    expect(run.stderr).toContain('Move-In Code is invalid.');

    const status = await fetch(`${core.baseUrl}/api/system/status`);
    expect(((await status.json()) as { picoHome: { claimState: { state: string } } })
      .picoHome.claimState.state).toBe('unclaimed');
  }, 120_000);
});
