#!/usr/bin/env node
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertVaultCustodyPathSeparation,
  createPicoVaultKeyfile,
  writePicoVaultKeyfile,
  type VaultSodium,
} from '@pico/vault';
import { picoVaultPersonKeyRoles, type PicoVaultPersonKeyRole } from '@pico/protocol';
import sodium from 'libsodium-wrappers-sumo';
import { connectPicoVaultDaemonClient, type PicoVaultDaemonClient } from './client.js';
import { startPicoVaultDaemon } from './daemon.js';

const cliCommands = ['daemon', 'create', 'status', 'unlock', 'lock', 'sign'] as const;
type CliCommand = typeof cliCommands[number];

const flagNamesByCommand: Record<CliCommand, readonly string[]> = {
  daemon: ['vault-home', 'foundation-data', 'foundation-backup'],
  create: ['vault-home', 'foundation-data', 'foundation-backup', 'role'],
  status: ['vault-home'],
  unlock: ['vault-home', 'role', 'fingerprint'],
  lock: ['vault-home'],
  sign: ['vault-home', 'input-hex'],
};

export interface PicoVaultCliInvocation {
  command: CliCommand;
  flags: Map<string, string>;
}

export function parsePicoVaultCliArguments(argv: readonly string[]): PicoVaultCliInvocation {
  const command = argv.at(0);
  if (command === undefined || !(cliCommands as readonly string[]).includes(command)) {
    throw new Error('unknown_cli_command');
  }
  const rest = argv.slice(1);
  const allowed = flagNamesByCommand[command as CliCommand];
  const flags = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest.at(index);
    const value = rest.at(index + 1);
    if (flag === undefined || !flag.startsWith('--') || value === undefined) {
      throw new Error('invalid_cli_flag');
    }
    const name = flag.slice(2);
    if (!allowed.includes(name) || flags.has(name)) {
      throw new Error('invalid_cli_flag');
    }
    flags.set(name, value);
  }
  return { command: command as CliCommand, flags };
}

function resolveVaultHome(flags: Map<string, string>, env: NodeJS.ProcessEnv): string {
  return resolve(flags.get('vault-home') ?? env.PICO_VAULT_HOME ?? join(homedir(), '.pico', 'vault'));
}

function resolveFoundationPaths(
  flags: Map<string, string>,
  env: NodeJS.ProcessEnv,
): { foundationDataPath: string; foundationBackupPath: string } {
  return {
    foundationDataPath: flags.get('foundation-data') ?? env.PICO_FOUNDATION_DATA_PATH ?? '/data',
    foundationBackupPath: flags.get('foundation-backup') ?? env.PICO_FOUNDATION_BACKUP_PATH ?? '/backup',
  };
}

function socketPathOf(vaultHomePath: string): string {
  return join(vaultHomePath, 'run', 'daemon.sock');
}

function requireRole(flags: Map<string, string>): PicoVaultPersonKeyRole {
  const role = flags.get('role');
  if (role === undefined || !(picoVaultPersonKeyRoles as readonly string[]).includes(role)) {
    throw new Error('invalid_cli_key_role');
  }
  return role as PicoVaultPersonKeyRole;
}

async function readPassphrase(prompt: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return await new Promise<string>((resolvePromise, rejectPromise) => {
      let buffered = '';
      const onData = (chunk: Buffer): void => {
        buffered += chunk.toString('utf8');
        const newlineIndex = buffered.indexOf('\n');
        if (newlineIndex >= 0) {
          stdin.off('data', onData);
          stdin.pause();
          resolvePromise(buffered.slice(0, newlineIndex).replace(/\r$/, ''));
        }
      };
      stdin.on('data', onData);
      stdin.once('end', () => {
        rejectPromise(new Error('missing_passphrase_input'));
      });
      stdin.resume();
    });
  }

  process.stderr.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  return await new Promise<string>((resolvePromise) => {
    const bytes: number[] = [];
    const finish = (): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      process.stderr.write('\n');
    };
    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        if (byte === 0x03) {
          finish();
          process.exit(130);
        } else if (byte === 0x0d || byte === 0x0a) {
          finish();
          resolvePromise(Buffer.from(bytes).toString('utf8'));
          return;
        } else if (byte === 0x7f || byte === 0x08) {
          while (bytes.length > 0 && ((bytes.pop() as number) & 0b1100_0000) === 0b1000_0000) {
            // drop UTF-8 continuation bytes until the lead byte is removed too
          }
        } else {
          bytes.push(byte);
        }
      }
    };
    stdin.on('data', onData);
  });
}

async function readLine(prompt: string): Promise<string> {
  process.stderr.write(prompt);
  const stdin = process.stdin;
  return await new Promise<string>((resolvePromise, rejectPromise) => {
    let buffered = '';
    const onData = (chunk: Buffer): void => {
      buffered += chunk.toString('utf8');
      const newlineIndex = buffered.indexOf('\n');
      if (newlineIndex >= 0) {
        stdin.off('data', onData);
        stdin.pause();
        resolvePromise(buffered.slice(0, newlineIndex).replace(/\r$/, '').trim());
      }
    };
    stdin.on('data', onData);
    stdin.once('end', () => {
      rejectPromise(new Error('missing_approval_input'));
    });
    stdin.resume();
  });
}

/**
 * The ADR 0099 approval channel. The person is shown the family, the key and
 * the digest that binds the decision - deliberately not a rendered statement of
 * the record, because no renderer exists yet and an informal one would be worse
 * than none. Anything other than an explicit yes denies.
 */
async function runApprovalLoop(client: PicoVaultDaemonClient): Promise<void> {
  let stopping = false;
  const stop = (): void => {
    stopping = true;
    void client.close();
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, stop);
  }

  while (!stopping) {
    let waited;
    try {
      waited = await client.approvalWait();
    } catch {
      return;
    }
    if (stopping) {
      return;
    }
    if (waited.pending === null) {
      continue;
    }

    const pending = waited.pending;
    process.stderr.write(
      `\nApproval requested\n`
      + `  family      ${pending.label}\n`
      + `  key         ${pending.keyRole} ${pending.keyFingerprintHex}\n`
      + `  digest      ${pending.signatureInputDigestHex}\n`
      + `  authorizes  exactly one signature over these bytes\n`,
    );
    let answer = '';
    try {
      answer = await readLine('Approve? [y/N] ');
    } catch {
      answer = '';
    }
    const approved = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
    try {
      await client.approvalDecide({
        approvalId: pending.approvalId,
        signatureInputDigestHex: pending.signatureInputDigestHex,
        approved,
      });
      process.stderr.write(approved ? 'Approved.\n' : 'Denied.\n');
    } catch (error) {
      process.stderr.write(
        `Decision not recorded: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
}

async function withClient<T>(
  vaultHomePath: string,
  operation: (client: PicoVaultDaemonClient) => Promise<T>,
): Promise<T> {
  const client = await connectPicoVaultDaemonClient({ socketPath: socketPathOf(vaultHomePath) });
  try {
    await client.hello();
    return await operation(client);
  } finally {
    await client.close();
  }
}

export async function runPicoVaultCli(argv: readonly string[]): Promise<void> {
  const invocation = parsePicoVaultCliArguments(argv);
  const vaultHomePath = resolveVaultHome(invocation.flags, process.env);

  switch (invocation.command) {
    case 'daemon': {
      await sodium.ready;
      const daemon = await startPicoVaultDaemon({
        sodium: sodium as unknown as VaultSodium,
        vaultHomePath,
        ...resolveFoundationPaths(invocation.flags, process.env),
      });
      process.stdout.write(`${JSON.stringify({ vaultHomePath, socketPath: daemon.socketPath })}\n`);
      await new Promise<void>((resolvePromise) => {
        for (const signal of ['SIGINT', 'SIGTERM'] as const) {
          process.once(signal, () => {
            void daemon.close().then(resolvePromise);
          });
        }
      });
      return;
    }
    case 'create': {
      await sodium.ready;
      const keyRole = requireRole(invocation.flags);
      const foundationPaths = resolveFoundationPaths(invocation.flags, process.env);
      assertVaultCustodyPathSeparation({
        vaultKeyfilePath: vaultHomePath,
        foundationDataPath: foundationPaths.foundationDataPath,
        foundationBackupPath: foundationPaths.foundationBackupPath,
      });
      const passphrase = await readPassphrase(`Passphrase for new ${keyRole} keyfile: `);
      const confirmation = await readPassphrase('Repeat passphrase: ');
      if (passphrase !== confirmation) {
        throw new Error('passphrase_mismatch');
      }
      const created = createPicoVaultKeyfile(sodium as unknown as VaultSodium, { keyRole, passphrase });
      const path = join(vaultHomePath, 'keyfiles', `${keyRole}-${created.keyFingerprintHex}.json`);
      writePicoVaultKeyfile(path, created.keyfile);
      process.stdout.write(`${JSON.stringify({
        keyRole,
        keyFingerprintHex: created.keyFingerprintHex,
        publicKeyHex: created.publicKeyHex,
        path,
      })}\n`);
      process.stderr.write(
        'The keyfile is the encrypted export (ADR 0081 V6): copy it to offline '
        + 'backup storage now. A lost un-exported keyfile plus a forgotten '
        + 'passphrase is unrecoverable by design.\n',
      );
      return;
    }
    case 'status': {
      const status = await withClient(vaultHomePath, async (client) => await client.status());
      process.stdout.write(`${JSON.stringify(status)}\n`);
      return;
    }
    case 'lock': {
      const locked = await withClient(vaultHomePath, async (client) => await client.lock());
      process.stdout.write(`${JSON.stringify(locked)}\n`);
      return;
    }
    case 'sign': {
      const signatureInputHex = invocation.flags.get('input-hex');
      if (signatureInputHex === undefined) {
        throw new Error('invalid_cli_flag');
      }
      const signed = await withClient(vaultHomePath, async (client) => await client.sign({ signatureInputHex }));
      process.stdout.write(`${JSON.stringify(signed)}\n`);
      return;
    }
    case 'unlock': {
      const keyRole = requireRole(invocation.flags);
      const client = await connectPicoVaultDaemonClient({ socketPath: socketPathOf(vaultHomePath) });
      try {
        await client.hello();
        let keyFingerprintHex = invocation.flags.get('fingerprint');
        if (keyFingerprintHex === undefined) {
          const status = await client.status();
          const matching = status.keyfiles.filter((keyfile) => keyfile.keyRole === keyRole);
          const only = matching.at(0);
          if (only === undefined || matching.length !== 1) {
            throw new Error('ambiguous_keyfile_selection');
          }
          keyFingerprintHex = only.keyFingerprintHex;
        }
        const passphrase = await readPassphrase(`Passphrase for ${keyRole} ${keyFingerprintHex}: `);
        const session = await client.unlock({ keyRole, keyFingerprintHex, passphrase });
        process.stdout.write(`${JSON.stringify(session)}\n`);
        process.stderr.write(
          'Vault unlocked. This terminal is the approval channel for '
          + 'authority-creating signatures; the session locks when it exits (Ctrl-C).\n',
        );
        await runApprovalLoop(client);
      } finally {
        await client.close();
      }
      return;
    }
  }
}

const isMainModule = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runPicoVaultCli(process.argv.slice(2)).then(
    () => {
      process.exit(0);
    },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.stderr.write(
        'usage: pico-vault <daemon|create|status|unlock|lock|sign> '
        + '[--vault-home <path>] [--foundation-data <path>] [--foundation-backup <path>] '
        + '[--role <keyRole>] [--fingerprint <hex>] [--input-hex <hex>]\n',
      );
      process.exit(1);
    },
  );
}
