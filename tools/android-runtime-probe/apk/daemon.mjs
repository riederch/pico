// ADR 0131 A2, custody side: the real vault daemon in its own Android
// process, under the embedded runtime. The socket lives in the app-private
// files dir; READY is announced through a file the client polls, because the
// two processes share a filesystem before they share a socket.
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPicoVaultDaemon } from '@pico/vault-daemon';

const stage = dirname(fileURLToPath(import.meta.url));
const files = dirname(stage);
const requireFromVault = createRequire(
  realpathSync(join(stage, 'node_modules/@pico/vault/package.json')),
);
const sodium = (await import(requireFromVault.resolve('libsodium-wrappers-sumo'))).default;
await sodium.ready;

for (const dir of ['vault', 'fdata', 'fbackup']) {
  mkdirSync(join(files, dir), { recursive: true });
}
const daemon = await startPicoVaultDaemon({
  sodium,
  vaultHomePath: join(files, 'vault'),
  foundationDataPath: join(files, 'fdata'),
  foundationBackupPath: join(files, 'fbackup'),
});
writeFileSync(join(files, 'daemon-ready'), daemon.socketPath);
console.log(JSON.stringify({ step: 'custody_daemon_listening', socketPath: daemon.socketPath }));
setInterval(() => {}, 60_000);
