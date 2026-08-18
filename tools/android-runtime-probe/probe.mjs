/**
 * ADR 0131 A1/A2 - what the shell-free core asks of a runtime, asked of one.
 *
 * This is the measured half of the runtime decision: the closure walk in
 * `check-companion-boundary.mjs` says which APIs the core reaches, and this
 * runs the *real* modules over those APIs on whatever host executes it - a
 * desktop for the baseline, an Android device or emulator for the evidence.
 * Nothing here is a re-implementation; every step calls the same functions
 * the product calls, because a probe that passed on stand-ins would prove
 * the stand-ins.
 *
 * What it exercises, in ADR terms:
 *  - the reviewed libsodium build (WASM) loading and running argon2id at the
 *    vault's own `moderate` profile - the number that decides whether unlock
 *    on a phone is a pause or a failure;
 *  - `pico.vault.keyfile.v1` create/open/write/read with the 0600 mode
 *    assertion, on the device's real filesystem;
 *  - the ADR 0097 daemon on an AF_UNIX pathname socket, its client, and the
 *    founding bootstrap - the exact custody shape A2 has to host;
 *  - the ADR 0099 approval binding: a gated sign that blocks until a second
 *    connection approves it, verified against the canonical bytes;
 *  - IPC round-trip latency, because every Link request crosses this socket;
 *  - the device-local profile write/read through the companion's own module.
 *
 * Output: one JSON line per step on stdout, `PROBE_OK` last. Any throw ends
 * it with `PROBE_FAILED` and a non-zero exit, so a runner needs no parser to
 * know what happened.
 */
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir, platform, arch, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPicoVaultKeyfile,
  openPicoVaultKeyfile,
  readPicoVaultKeyfile,
  writePicoVaultKeyfile,
  assertPicoVaultKeyfileMode,
} from '@pico/vault';
import {
  connectPicoVaultDaemonClient,
  startPicoVaultDaemon,
} from '@pico/vault-daemon';
import {
  buildPicoIdentityKeyRecordSignatureInput,
  picoIdentitySignatureInputLabels,
  picoIdentitySuite,
} from '@pico/protocol';
import {
  defaultPicoCompanionProfilePath,
  readPicoCompanionProfile,
  writePicoCompanionProfile,
} from '@pico/companion/profile';

const report = (step, fields = {}) => {
  process.stdout.write(`${JSON.stringify({ step, ...fields })}\n`);
};
const now = () => Number(process.hrtime.bigint() / 1000n) / 1000;

/**
 * Resolved through `@pico/vault`, whose dependency it is: the probe sits in a
 * strict pnpm layout where only the companion's direct dependencies are at
 * the top level, and importing sodium by bare name from here would need a
 * hoist the product does not rely on. `createRequire` rather than
 * `import.meta.resolve`, because the latter was still flagged on Node 18 -
 * the floor a mobile runtime is likely to sit at.
 */
const requireFromVault = createRequire(
  // The realpath, because the top-level entry is a symlink into `.pnpm` and
  // resolution is relative to where a file *is*, not where it was found.
  realpathSync(fileURLToPath(new URL('./node_modules/@pico/vault/package.json', import.meta.url))),
);
const sodium = (await import(requireFromVault.resolve('libsodium-wrappers-sumo'))).default;

const roots = [];
const clients = [];
let daemon = null;

try {
  report('environment', {
    node: process.version,
    platform: platform(),
    arch: arch(),
    kernel: release(),
    totalMemMb: Math.round(totalmem() / 1_048_576),
    fetchAvailable: typeof fetch === 'function',
    webAssemblyAvailable: typeof WebAssembly === 'object',
  });

  let t = now();
  await sodium.ready;
  report('sodium_ready', { ms: Math.round(now() - t) });

  // The vault's own KDF profile, through the vault's own function. One
  // keyfile is one argon2id derivation; unlock is a second.
  const passphrase = 'a-passphrase-the-person-chose';
  t = now();
  const created = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_signing',
    passphrase,
  });
  const createMs = Math.round(now() - t);
  t = now();
  const session = openPicoVaultKeyfile(sodium, {
    keyfile: created.keyfile,
    passphrase,
  });
  report('argon2id_moderate', {
    createKeyfileMs: createMs,
    openKeyfileMs: Math.round(now() - t),
    keyFingerprintHex: created.keyFingerprintHex.slice(0, 12),
  });
  session.lock?.();

  // The keyfile on the device's real filesystem, with the mode assertion the
  // daemon applies before it reads one. An Android app-private dir and
  // /data/local/tmp both have to hold a 0600.
  const fileRoot = mkdtempSync(join(tmpdir(), 'pico-probe-keyfile-'));
  roots.push(fileRoot);
  const keyfilePath = join(fileRoot, `device_signing-${created.keyFingerprintHex}.json`);
  writePicoVaultKeyfile(keyfilePath, created.keyfile);
  assertPicoVaultKeyfileMode(keyfilePath);
  const reread = readPicoVaultKeyfile(keyfilePath);
  if (reread.header.keyFingerprintHex !== created.keyFingerprintHex) {
    throw new Error('keyfile_roundtrip_mismatch');
  }
  report('keyfile_on_disk', { mode0600Held: true });

  // The custody process shape: the real daemon on a pathname AF_UNIX socket.
  const vaultHomePath = mkdtempSync(join(tmpdir(), 'pico-probe-vault-'));
  roots.push(vaultHomePath);
  t = now();
  // Disjoint roots, because the daemon refuses a vault inside the
  // Foundation's scope - a custody dir a Foundation backup would sweep up is
  // the boundary ADR 0097 draws, and the probe meets it like any caller.
  const foundationDataPath = mkdtempSync(join(tmpdir(), 'pico-probe-data-'));
  const foundationBackupPath = mkdtempSync(join(tmpdir(), 'pico-probe-backup-'));
  roots.push(foundationDataPath, foundationBackupPath);
  daemon = await startPicoVaultDaemon({
    sodium,
    vaultHomePath,
    foundationDataPath,
    foundationBackupPath,
  });
  report('daemon_listening', {
    ms: Math.round(now() - t),
    socketPathBytes: Buffer.byteLength(daemon.socketPath),
    // sun_path holds 108 bytes miuns the terminator; an Android app-private
    // path is ~55 bytes, so the report is a margin rather than a worry.
    withinSunPathLimit: Buffer.byteLength(daemon.socketPath) < 107,
  });

  const client = await connectPicoVaultDaemonClient({ socketPath: daemon.socketPath });
  clients.push(client);
  await client.hello();

  // Three more argon2id derivations, through the daemon: the founding
  // bootstrap is the most KDF-heavy moment a first run has.
  t = now();
  const founded = await client.foundingBootstrap({
    passphrase,
    targetDelegationId: `delegation_${'0'.repeat(32)}`,
  });
  report('founding_bootstrap', { ms: Math.round(now() - t) });

  t = now();
  await client.unlock({
    keyRole: 'pico_identity',
    keyFingerprintHex: founded.identity.keyFingerprintHex,
    passphrase,
  });
  report('daemon_unlock', { ms: Math.round(now() - t) });

  /**
   * ADR 0099, whole, in the product's own roles. The connection that made
   * the unlock is the *hold* connection - approvals route to it, because the
   * holder of the unlock is the person who decides what the key signs - and
   * a second connection is the consumer asking. Getting this backwards is
   * refused as `approval_wait_forbidden`, which this probe learned by doing.
   */
  const consumer = await connectPicoVaultDaemonClient({ socketPath: daemon.socketPath });
  clients.push(consumer);
  await consumer.hello();
  await client.approvalWatch();
  const watched = client.approvalWait();
  const keyRecordFields = {
    suite: picoIdentitySuite,
    keyRole: 'pico_identity',
    publicKeyHex: founded.identity.publicKeyHex,
  };
  const signing = consumer.sign({
    keyFingerprintHex: founded.identity.keyFingerprintHex,
    label: picoIdentitySignatureInputLabels.keyrecord,
    fields: keyRecordFields,
  });
  // Held so a refusal surfaces as this probe's failure line rather than as
  // an unhandled rejection after the report already ended.
  signing.catch(() => undefined);
  const pending = (await watched).pending;
  if (pending === undefined || pending === null) {
    throw new Error('approval_never_arrived');
  }
  await client.approvalDecide({
    approvalId: pending.approvalId,
    signatureInputDigestHex: pending.signatureInputDigestHex,
    approved: true,
  });
  const signed = await signing;
  const verified = sodium.crypto_sign_verify_detached(
    Buffer.from(signed.signatureHex, 'hex'),
    buildPicoIdentityKeyRecordSignatureInput(keyRecordFields),
    Buffer.from(founded.identity.publicKeyHex, 'hex'),
  );
  if (!verified) {
    throw new Error('approved_signature_does_not_verify');
  }
  report('approval_binding', { statement: pending.statement, verified: true });

  // What A2's process split costs per call: every Link request crosses this
  // socket once for its signature.
  t = now();
  const rounds = 200;
  for (let i = 0; i < rounds; i += 1) {
    await consumer.status();
  }
  report('ipc_round_trip', {
    rounds,
    meanMs: Number(((now() - t) / rounds).toFixed(3)),
  });

  // The device-local file the companion lives by, through its own module.
  const profileRoot = mkdtempSync(join(tmpdir(), 'pico-probe-profile-'));
  roots.push(profileRoot);
  const profilePath = join(profileRoot, 'profile.json');
  const profile = {
    schema: 'pico.companion.profile.v1',
    coreUrl: 'http://192.168.1.20:3000',
    home: { homeHostPicoIdentityFingerprintHex: founded.identity.keyFingerprintHex },
    host: {
      signingPublicKeyHex: 'a1'.repeat(32),
      signingKeyFingerprintHex: 'a2'.repeat(32),
      keyAgreementPublicKeyHex: 'a3'.repeat(32),
      keyAgreementKeyFingerprintHex: 'a4'.repeat(32),
    },
    identity: {
      keyFingerprintHex: founded.identity.keyFingerprintHex,
      publicKeyHex: founded.identity.publicKeyHex,
    },
    device: {
      signingKeyFingerprintHex: founded.device.signingKeyFingerprintHex,
      keyAgreementKeyFingerprintHex: founded.device.keyAgreementKeyFingerprintHex,
      delegationId: `delegation_${'0'.repeat(32)}`,
    },
  };
  writePicoCompanionProfile(profilePath, profile);
  if (readPicoCompanionProfile(profilePath).device.delegationId
    !== profile.device.delegationId) {
    throw new Error('profile_roundtrip_mismatch');
  }
  report('companion_profile', {
    roundTrip: true,
    defaultPathBytes: Buffer.byteLength(defaultPicoCompanionProfilePath()),
  });

  process.stdout.write('PROBE_OK\n');
} catch (error) {
  report('failure', { error: error instanceof Error ? error.message : String(error) });
  process.stdout.write('PROBE_FAILED\n');
  process.exitCode = 1;
} finally {
  for (const open of clients) {
    await open.close().catch(() => undefined);
  }
  await daemon?.close().catch(() => undefined);
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
}
