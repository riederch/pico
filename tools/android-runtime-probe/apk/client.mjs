// ADR 0131 A1/A2, client side: the probe's custody walk against a daemon in
// ANOTHER process of the same app - the decided split, under the embedded
// runtime on both sides.
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectPicoVaultDaemonClient } from '@pico/vault-daemon/client';
import { buildPicoIdentityKeyRecordSignatureInput, picoIdentitySignatureInputLabels, picoIdentitySuite } from '@pico/protocol';

const stage = dirname(fileURLToPath(import.meta.url));
const files = dirname(stage);
const report = (step, fields = {}) => console.log(JSON.stringify({ step, ...fields }));
const now = () => Number(process.hrtime.bigint() / 1000n) / 1000;

try {
  report('environment', {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    embedded: true,
  });
  const requireFromVault = createRequire(
    realpathSync(join(stage, 'node_modules/@pico/vault/package.json')),
  );
  let t = now();
  const sodium = (await import(requireFromVault.resolve('libsodium-wrappers-sumo'))).default;
  await sodium.ready;
  report('sodium_ready', { ms: Math.round(now() - t) });

  const readyFile = join(files, 'daemon-ready');
  t = now();
  for (let attempt = 0; attempt < 300 && !existsSync(readyFile); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const socketPath = readFileSync(readyFile, 'utf8');
  report('custody_process_ready', { waitedMs: Math.round(now() - t), socketPath });

  const hold = await connectPicoVaultDaemonClient({ socketPath });
  await hold.hello();
  const passphrase = 'a-passphrase-the-person-chose';
  t = now();
  const founded = await hold.foundingBootstrap({
    passphrase,
    targetDelegationId: `delegation_${'0'.repeat(32)}`,
  });
  report('founding_bootstrap', { ms: Math.round(now() - t) });
  t = now();
  await hold.unlock({
    keyRole: 'pico_identity',
    keyFingerprintHex: founded.identity.keyFingerprintHex,
    passphrase,
  });
  report('daemon_unlock', { ms: Math.round(now() - t) });

  const consumer = await connectPicoVaultDaemonClient({ socketPath });
  await consumer.hello();
  await hold.approvalWatch();
  const watched = hold.approvalWait();
  const fields = {
    suite: picoIdentitySuite,
    keyRole: 'pico_identity',
    publicKeyHex: founded.identity.publicKeyHex,
  };
  const signing = consumer.sign({
    keyFingerprintHex: founded.identity.keyFingerprintHex,
    label: picoIdentitySignatureInputLabels.keyrecord,
    fields,
  });
  signing.catch(() => undefined);
  const pending = (await watched).pending;
  if (pending === undefined || pending === null) {
    throw new Error('approval_never_arrived');
  }
  await hold.approvalDecide({
    approvalId: pending.approvalId,
    signatureInputDigestHex: pending.signatureInputDigestHex,
    approved: true,
  });
  const signed = await signing;
  const verified = sodium.crypto_sign_verify_detached(
    Buffer.from(signed.signatureHex, 'hex'),
    buildPicoIdentityKeyRecordSignatureInput(fields),
    Buffer.from(founded.identity.publicKeyHex, 'hex'),
  );
  if (!verified) {
    throw new Error('approved_signature_does_not_verify');
  }
  report('approval_binding_across_processes', { verified: true });

  t = now();
  const rounds = 200;
  for (let i = 0; i < rounds; i += 1) {
    await consumer.status();
  }
  report('ipc_round_trip', { rounds, meanMs: Number(((now() - t) / rounds).toFixed(3)) });

  console.log('PROBE_OK');
  await consumer.close();
  await hold.close();
  process.exit(0);
} catch (error) {
  report('failure', { error: error instanceof Error ? error.message : String(error) });
  console.log('PROBE_FAILED');
  process.exit(1);
}
