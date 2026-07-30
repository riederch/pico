import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPicoVaultKeyfile,
  writePicoVaultKeyfile,
  type CreatePicoVaultKeyfileResult,
} from '@pico/vault';
import { picoIdentitySuite } from '@pico/protocol';
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
const SIGNING_PASSPHRASE = 'claim ceremony signing passphrase';
const AGREEMENT_PASSPHRASE = 'claim ceremony agreement passphrase';
const READER_PASSPHRASE = 'reader vault passphrase';

const temporaryDirectories: string[] = [];
const childProcesses: ChildProcess[] = [];

let ownerIdentity: CreatePicoVaultKeyfileResult;
let ownerSigning: CreatePicoVaultKeyfileResult;
let ownerAgreement: CreatePicoVaultKeyfileResult;
let readerIdentity: CreatePicoVaultKeyfileResult;
let readerSigning: CreatePicoVaultKeyfileResult;
let readerAgreement: CreatePicoVaultKeyfileResult;

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

async function startCore(
  options: { restrictedLinkIntake?: boolean } = {},
): Promise<RunningCore> {
  const dataDir = tempDir('pico-claim-core-');
  const port = await freePort();
  let linkPort: number | undefined;
  if (options.restrictedLinkIntake === true) {
    do {
      linkPort = await freePort();
    } while (linkPort === port);
  }
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
    () => output.includes('picoHomeMoveInCode')
      && output.includes('Server listening at')
      && (linkPort === undefined || output.includes('Pico Link restricted intake listening')),
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
    ...(linkPort === undefined ? {} : { linkBaseUrl: `http://127.0.0.1:${linkPort}` }),
    moveInCode: String(claim.picoHomeMoveInCode),
    hostSigningKeyFingerprintHex: String(claim.hostSigningKeyFingerprintHex),
    hostSigningPublicKeyHex: String(claim.hostSigningPublicKeyHex),
    hostKeyAgreementKeyFingerprintHex: String(claim.hostKeyAgreementKeyFingerprintHex),
    hostKeyAgreementPublicKeyHex: String(claim.hostKeyAgreementPublicKeyHex),
    log: () => output,
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

  return { vaultHomePath, stderr: () => stderr };
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

  return { vaultHomePath, stderr: () => stderr };
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
  child.stdin!.write('y\n'.repeat(8));
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
    '--link-delegation-id', 'delegation_pre_authority_claim_0001',
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

function runCli(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [CLI, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
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
    expect(identityApprover.approvals()).toBe(2);
    expect(signingApprover.approvals()).toBe(0);
  }, 120_000);

  it('creates a reader-custody domain in the Home it just founded', async () => {
    const core = await startCore();
    const daemon = await startDaemon();
    const identityApprover = await startApprover(daemon);

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

    // The owner's key-agreement key needs its own terminal: the daemon
    // publishes a public key only for a session the person opened.
    await startApprover(daemon, ownerAgreement, 'device_key_agreement', AGREEMENT_PASSPHRASE);

    const domain = await runCreateDomain(daemon, core, session, 'first_domain');
    expect(domain.code).toBe(0);

    const created = JSON.parse(domain.stdout) as {
      accepted: unknown;
      domainRecord: Record<string, unknown>;
    };
    expect(JSON.stringify(created.accepted)).toContain('first_domain');

    // Founding cost two approvals, the domain one more, all on the identity
    // terminal - the agreement key is used but signs nothing (ADR 0102).
    expect(identityApprover.approvals()).toBe(3);

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
    expect(identityApprover.approvals()).toBe(4);
  }, 180_000);

  it('delivers an authorized domain ceremony through Pico Link without a Foundation session', async () => {
    const core = await startCore({ restrictedLinkIntake: true });
    const daemon = await startDaemon();
    const identityApprover = await startApprover(daemon);
    await startApprover(daemon, ownerSigning, 'device_signing', SIGNING_PASSPHRASE);
    await startApprover(daemon, ownerAgreement, 'device_key_agreement', AGREEMENT_PASSPHRASE);

    expect((await runCeremony(daemon, core)).code).toBe(0);

    const delegated = await runDaemonCli(daemon, [
      'ceremony', 'delegate-device',
      '--fingerprint', ownerIdentity.keyFingerprintHex,
      '--signing-fingerprint', ownerSigning.keyFingerprintHex,
      '--agreement-fingerprint', ownerAgreement.keyFingerprintHex,
      '--valid-until', '2027-07-29T00:00:00.000Z',
    ]);
    expect(delegated.code).toBe(0);
    const delegationId = (JSON.parse(delegated.stdout) as {
      record: { delegationId: string };
    }).record.delegationId;
    const delegationPath = join(tempDir('pico-owner-link-'), 'delegation.json');
    writeFileSync(delegationPath, delegated.stdout, 'utf8');

    const opened = await runDaemonCli(daemon, [
      'ceremony', 'open-identity-session',
      '--fingerprint', ownerIdentity.keyFingerprintHex,
      '--signing-fingerprint', ownerSigning.keyFingerprintHex,
      '--agreement-fingerprint', ownerAgreement.keyFingerprintHex,
      '--core-url', core.baseUrl,
      '--delegation', delegationPath,
    ]);
    expect(opened.code).toBe(0);

    const domain = await runCreateDomainOverLink(daemon, core, 'link_domain', delegationId);
    expect(domain.code, domain.stderr).toBe(0);
    expect(JSON.stringify(JSON.parse(domain.stdout).accepted)).toContain('link_domain');
    expect(core.log()).toContain('/api/home/link');

    // Two founding approvals, one delegation and one domain authority. The
    // identity session proof and both outer Link requests are operational.
    expect(identityApprover.approvals()).toBe(4);
  }, 180_000);

  it('issues a Home membership whose host activation the Foundation adds', async () => {
    const core = await startCore();
    const daemon = await startDaemon();
    const approver = await startApprover(daemon);

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

    // Founding cost two approvals, the membership a third.
    expect(approver.approvals()).toBe(3);

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
    //    Both need the owner's agreement key unlocked - it never signs, but
    //    its public key seals the KEK to the reader.
    await startApprover(ownerDaemon, ownerAgreement, 'device_key_agreement', AGREEMENT_PASSPHRASE);
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
    expect(ownerApprover.approvals()).toBe(5);
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

    const run = await runCeremony(daemon, core, { moveInCode: 'WRONG-MOVE-IN-CODE-0000000000000' });

    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('foundation_rejected:401');
    expect(run.stderr).toContain('Move-In Code is invalid.');

    const status = await fetch(`${core.baseUrl}/api/system/status`);
    expect(((await status.json()) as { picoHome: { claimState: { state: string } } })
      .picoHome.claimState.state).toBe('unclaimed');
  }, 120_000);
});
