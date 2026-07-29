#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertVaultCustodyPathSeparation,
  createPicoVaultKeyfile,
  writePicoVaultKeyfile,
  type VaultSodium,
} from '@pico/vault';
import {
  picoHomeMembershipCredentialSchema,
  picoHomeSignatureInputLabels,
  picoIdentityDelegationScopes,
  picoIdentityReaderKeyFreshnessSignatureInputLabel,
  picoIdentitySignatureInputLabels,
  picoHomeMembershipRoles,
  picoHomeMembershipScopes,
  picoIdentityReaderKeyFreshnessCheckpointSchema,
  picoIdentityReaderKeyFreshnessStatuses,
  picoHomeClaimEnvelopeSchema,
  picoHomeFoundingAcceptanceSchema,
  picoHomeSealedClaimPayloadSchema,
  picoIdentitySuite,
  picoVaultPersonKeyRoles,
  type PicoHomeClaimSignatureInput,
  type PicoHomeFoundingSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoHomeMembershipRole,
  type PicoIdentityDelegationScope,
  type PicoIdentityDelegationSignatureInput,
  type PicoHomeMembershipScope,
  type PicoHomeMembershipSignatureInput,
  type PicoIdentityReaderKeyFreshnessSignatureInput,
  type PicoIdentityReaderKeyFreshnessStatus,
  type PicoVaultPersonKeyRole,
} from '@pico/protocol';
import sodium from 'libsodium-wrappers-sumo';
import { connectPicoVaultDaemonClient, type PicoVaultDaemonClient } from './client.js';
import { startPicoVaultDaemon } from './daemon.js';

const cliCommands = ['daemon', 'create', 'status', 'unlock', 'lock', 'sign', 'ceremony'] as const;
type CliCommand = typeof cliCommands[number];

/**
 * Ceremonies run inside the daemon boundary and deliver their finished record
 * to a Foundation. ADR 0103 C1 starts with `claim-home`, because no domain
 * record is accepted before a Home has been founded.
 */
/** ADR 0085's ceiling, mirrored so an over-long window fails before signing. */
const MAX_READER_KEY_FRESHNESS_MS = 5 * 60 * 1_000;

const ceremonySubcommands = [
  'claim-home',
  'create-domain',
  'rotate-domain',
  'grant-reader',
  'publish-checkpoint',
  'issue-membership',
  'delegate-device',
  'open-identity-session',
] as const;
type CeremonySubcommand = typeof ceremonySubcommands[number];

const flagNamesByCommand: Record<CliCommand, readonly string[]> = {
  daemon: ['vault-home', 'foundation-data', 'foundation-backup'],
  create: ['vault-home', 'foundation-data', 'foundation-backup', 'role'],
  status: ['vault-home'],
  unlock: ['vault-home', 'role', 'fingerprint'],
  lock: ['vault-home'],
  sign: ['vault-home', 'fingerprint', 'label', 'fields-json'],
  ceremony: [],
};

const flagNamesByCeremony: Record<CeremonySubcommand, readonly string[]> = {
  'claim-home': [
    'vault-home',
    'fingerprint',
    'core-url',
    'move-in-code',
    'host-signing-fingerprint',
    'host-agreement-fingerprint',
  ],
  'create-domain': [
    'vault-home',
    'fingerprint',
    'agreement-fingerprint',
    'core-url',
    'session',
    'domain-id',
    'lifecycle-order',
  ],
  'delegate-device': [
    'vault-home',
    'fingerprint',
    'signing-fingerprint',
    'agreement-fingerprint',
    'scopes',
    'valid-from',
    'valid-until',
    'lifecycle-order',
  ],
  'open-identity-session': [
    'vault-home',
    'fingerprint',
    'signing-fingerprint',
    'agreement-fingerprint',
    'core-url',
    'delegation',
  ],
  'issue-membership': [
    'vault-home',
    'fingerprint',
    'core-url',
    'session',
    'home-id',
    'subject-identity-fingerprint',
    'host-signing-fingerprint',
    'role',
    'scopes',
    'valid-until',
    'valid-from',
    'lifecycle-order',
  ],
  'publish-checkpoint': [
    'vault-home',
    'fingerprint',
    'core-url',
    'session',
    'home-id',
    'reader-device-signing-fingerprint',
    'reader-device-agreement-fingerprint',
    'reader-delegation-id',
    'status',
    'observed-through-lifecycle-order',
    'fresh-for-seconds',
  ],
  'rotate-domain': [
    'vault-home',
    'fingerprint',
    'core-url',
    'session',
    'domain-record',
    'rotation-records',
    'reader-grant-lifecycle-records',
    'writer-grant-lifecycle-records',
    'remaining-reader-grant-records',
    'lifecycle-order',
  ],
  'grant-reader': [
    'vault-home',
    'fingerprint',
    'agreement-fingerprint',
    'core-url',
    'session',
    'domain-record',
    'rotation-records',
    'reader-key-record',
    'reader-identity-fingerprint',
    'reader-device-signing-fingerprint',
    'reader-delegation-id',
    'access-mode',
    'first-kek-version',
    'valid-from',
    'valid-until',
    'lifecycle-order',
  ],
};

export interface PicoVaultCliInvocation {
  command: CliCommand;
  ceremony?: CeremonySubcommand;
  flags: Map<string, string>;
}

export function parsePicoVaultCliArguments(argv: readonly string[]): PicoVaultCliInvocation {
  const command = argv.at(0);
  if (command === undefined || !(cliCommands as readonly string[]).includes(command)) {
    throw new Error('unknown_cli_command');
  }
  let rest = argv.slice(1);
  let ceremony: CeremonySubcommand | undefined;
  let allowed = flagNamesByCommand[command as CliCommand];

  if (command === 'ceremony') {
    const subcommand = argv.at(1);
    if (subcommand === undefined || !(ceremonySubcommands as readonly string[]).includes(subcommand)) {
      throw new Error('unknown_ceremony');
    }
    ceremony = subcommand as CeremonySubcommand;
    allowed = flagNamesByCeremony[ceremony];
    rest = argv.slice(2);
  }

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
  return ceremony === undefined
    ? { command: command as CliCommand, flags }
    : { command: command as CliCommand, ceremony, flags };
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

/**
 * Whatever arrives past the newline stays for the next prompt. A person who
 * pastes ahead, or a script that queues answers, must not have input silently
 * dropped between two sequential reads.
 */
let bufferedStdin = '';

function takeBufferedLine(): string | undefined {
  const newlineIndex = bufferedStdin.indexOf('\n');
  if (newlineIndex < 0) {
    return undefined;
  }
  const line = bufferedStdin.slice(0, newlineIndex);
  bufferedStdin = bufferedStdin.slice(newlineIndex + 1);
  return line.replace(/\r$/, '').trim();
}

async function readLine(prompt: string): Promise<string> {
  process.stderr.write(prompt);
  const alreadyBuffered = takeBufferedLine();
  if (alreadyBuffered !== undefined) {
    return alreadyBuffered;
  }

  const stdin = process.stdin;
  return await new Promise<string>((resolvePromise, rejectPromise) => {
    const onData = (chunk: Buffer): void => {
      bufferedStdin += chunk.toString('utf8');
      const line = takeBufferedLine();
      if (line !== undefined) {
        stdin.off('data', onData);
        stdin.pause();
        resolvePromise(line);
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
    const isCeremony = pending.label.startsWith('pico.vault.daemon.ceremony.');
    // ADR 0106: the statement is rendered by the daemon from the same fields
    // the signature covers. Family, key and digest stay visible underneath -
    // a person who can check them still may; nobody has to.
    process.stderr.write(
      `\nApproval requested\n`
      + `\n  ${pending.statement}\n\n`
      + `  family      ${pending.label}\n`
      + `  key         ${pending.keyRole} ${pending.keyFingerprintHex}\n`
      + `  digest      ${pending.signatureInputDigestHex}\n`
      + (isCeremony
        ? `  authorizes  exactly one ceremony over exactly this request\n`
        : `  authorizes  exactly one signature over these bytes\n`),
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
      const label = invocation.flags.get('label');
      const fieldsJson = invocation.flags.get('fields-json');
      const keyFingerprintHex = invocation.flags.get('fingerprint');
      if (label === undefined || fieldsJson === undefined || keyFingerprintHex === undefined) {
        throw new Error('invalid_cli_flag');
      }
      const fields = JSON.parse(fieldsJson) as Record<string, unknown>;
      const signed = await withClient(vaultHomePath, async (client) => await client.sign({
        keyFingerprintHex,
        label,
        fields,
      }));
      process.stdout.write(`${JSON.stringify(signed)}\n`);
      return;
    }
    case 'ceremony': {
      await sodium.ready;
      if (invocation.ceremony === 'create-domain') {
        const domain = await withClient(vaultHomePath, async (client) => await runCreateDomainCeremony({
          client,
          vaultSodium: sodium as unknown as VaultSodium,
          coreUrl: requireFlag(invocation.flags, 'core-url'),
          session: requireFlag(invocation.flags, 'session'),
          signerKeyFingerprintHex: requireFlag(invocation.flags, 'fingerprint'),
          agreementKeyFingerprintHex: requireFlag(invocation.flags, 'agreement-fingerprint'),
          domainId: requireFlag(invocation.flags, 'domain-id'),
          lifecycleOrder: invocation.flags.get('lifecycle-order') ?? 'seq:0000000000000001',
        }));
        process.stdout.write(`${JSON.stringify(domain)}\n`);
        return;
      }
      if (invocation.ceremony === 'delegate-device') {
        const scopes = (invocation.flags.get('scopes')
          ?? 'surface_session,decrypt_domain,receive_key_envelope').split(',').map((v) => v.trim());
        for (const scope of scopes) {
          if (!(picoIdentityDelegationScopes as readonly string[]).includes(scope)) {
            throw new Error(`invalid_delegation_scope:${scope}`);
          }
        }
        const delegation = await withClient(vaultHomePath, async (client) => await runDelegateDeviceCeremony({
          client,
          signerKeyFingerprintHex: requireFlag(invocation.flags, 'fingerprint'),
          subjectSigningKeyFingerprintHex: requireFlag(invocation.flags, 'signing-fingerprint'),
          subjectKeyAgreementKeyFingerprintHex: requireFlag(invocation.flags, 'agreement-fingerprint'),
          scopes: scopes as PicoIdentityDelegationScope[],
          validFrom: invocation.flags.get('valid-from') ?? new Date().toISOString(),
          validUntil: requireFlag(invocation.flags, 'valid-until'),
          lifecycleOrder: invocation.flags.get('lifecycle-order') ?? 'seq:0000000000000001',
        }));
        process.stdout.write(`${JSON.stringify(delegation)}\n`);
        return;
      }
      if (invocation.ceremony === 'open-identity-session') {
        const opened = await withClient(vaultHomePath, async (client) => await runOpenIdentitySessionCeremony({
          client,
          coreUrl: requireFlag(invocation.flags, 'core-url'),
          identityKeyFingerprintHex: requireFlag(invocation.flags, 'fingerprint'),
          signingKeyFingerprintHex: requireFlag(invocation.flags, 'signing-fingerprint'),
          agreementKeyFingerprintHex: requireFlag(invocation.flags, 'agreement-fingerprint'),
          delegation: readRecordFile(requireFlag(invocation.flags, 'delegation'), 'delegation'),
        }));
        process.stdout.write(`${JSON.stringify(opened)}\n`);
        return;
      }
      if (invocation.ceremony === 'issue-membership') {
        const roleFlag = invocation.flags.get('role') ?? 'home_member';
        if (!(picoHomeMembershipRoles as readonly string[]).includes(roleFlag)) {
          throw new Error('invalid_membership_role');
        }
        const scopes = (invocation.flags.get('scopes') ?? 'host.use').split(',').map((s) => s.trim());
        for (const scope of scopes) {
          if (!(picoHomeMembershipScopes as readonly string[]).includes(scope)) {
            throw new Error(`invalid_membership_scope:${scope}`);
          }
        }
        const issued = await withClient(vaultHomePath, async (client) => await runIssueMembershipCeremony({
          client,
          coreUrl: requireFlag(invocation.flags, 'core-url'),
          session: requireFlag(invocation.flags, 'session'),
          signerKeyFingerprintHex: requireFlag(invocation.flags, 'fingerprint'),
          homeId: requireFlag(invocation.flags, 'home-id'),
          subjectPicoIdentityFingerprintHex: requireFlag(
            invocation.flags,
            'subject-identity-fingerprint',
          ),
          hostSigningKeyFingerprintHex: requireFlag(invocation.flags, 'host-signing-fingerprint'),
          role: roleFlag as PicoHomeMembershipRole,
          scopes: scopes as PicoHomeMembershipScope[],
          validFrom: invocation.flags.get('valid-from') ?? new Date().toISOString(),
          validUntil: requireFlag(invocation.flags, 'valid-until'),
          lifecycleOrder: invocation.flags.get('lifecycle-order') ?? 'seq:0000000000000001',
        }));
        process.stdout.write(`${JSON.stringify(issued)}\n`);
        return;
      }
      if (invocation.ceremony === 'publish-checkpoint') {
        const statusFlag = invocation.flags.get('status') ?? 'current';
        if (!(picoIdentityReaderKeyFreshnessStatuses as readonly string[]).includes(statusFlag)) {
          throw new Error('invalid_checkpoint_status');
        }
        const published = await withClient(vaultHomePath, async (client) => await runPublishCheckpointCeremony({
          client,
          coreUrl: requireFlag(invocation.flags, 'core-url'),
          session: requireFlag(invocation.flags, 'session'),
          signerKeyFingerprintHex: requireFlag(invocation.flags, 'fingerprint'),
          homeId: requireFlag(invocation.flags, 'home-id'),
          deviceSigningKeyFingerprintHex: requireFlag(
            invocation.flags,
            'reader-device-signing-fingerprint',
          ),
          deviceKeyAgreementKeyFingerprintHex: requireFlag(
            invocation.flags,
            'reader-device-agreement-fingerprint',
          ),
          delegationId: requireFlag(invocation.flags, 'reader-delegation-id'),
          status: statusFlag as PicoIdentityReaderKeyFreshnessStatus,
          observedThroughLifecycleOrder: requireFlag(
            invocation.flags,
            'observed-through-lifecycle-order',
          ),
          freshForSeconds: Number(invocation.flags.get('fresh-for-seconds') ?? '240'),
        }));
        process.stdout.write(`${JSON.stringify(published)}\n`);
        return;
      }
      if (invocation.ceremony === 'rotate-domain') {
        const rotation = await withClient(vaultHomePath, async (client) => await runRotateDomainCeremony({
          client,
          vaultSodium: sodium as unknown as VaultSodium,
          coreUrl: requireFlag(invocation.flags, 'core-url'),
          session: requireFlag(invocation.flags, 'session'),
          signerKeyFingerprintHex: requireFlag(invocation.flags, 'fingerprint'),
          domainRecord: readRecordFile(requireFlag(invocation.flags, 'domain-record'), 'domain_record'),
          rotationRecords: readRecordListFile(invocation.flags.get('rotation-records'), 'rotation_records'),
          readerGrantLifecycleRecords: readRecordListFile(
            invocation.flags.get('reader-grant-lifecycle-records'),
            'reader_grant_lifecycle_records',
          ),
          writerGrantLifecycleRecords: readRecordListFile(
            invocation.flags.get('writer-grant-lifecycle-records'),
            'writer_grant_lifecycle_records',
          ),
          remainingReaderGrantRecords: readRecordListFile(
            invocation.flags.get('remaining-reader-grant-records'),
            'remaining_reader_grant_records',
          ),
          lifecycleOrder: invocation.flags.get('lifecycle-order') ?? 'seq:0000000000000002',
        }));
        process.stdout.write(`${JSON.stringify(rotation)}\n`);
        return;
      }
      if (invocation.ceremony === 'grant-reader') {
        const grant = await withClient(vaultHomePath, async (client) => await runGrantReaderCeremony({
          client,
          coreUrl: requireFlag(invocation.flags, 'core-url'),
          session: requireFlag(invocation.flags, 'session'),
          signerKeyFingerprintHex: requireFlag(invocation.flags, 'fingerprint'),
          agreementKeyFingerprintHex: requireFlag(invocation.flags, 'agreement-fingerprint'),
          domainRecord: readRecordFile(requireFlag(invocation.flags, 'domain-record'), 'domain_record'),
          rotationRecords: readRecordListFile(invocation.flags.get('rotation-records'), 'rotation_records'),
          readerKeyRecord: readRecordFile(
            requireFlag(invocation.flags, 'reader-key-record'),
            'reader_key_record',
          ),
          readerGrantId: `reader_grant_${Buffer.from(sodium.randombytes_buf(16)).toString('hex')}`,
          readerIdentityKeyFingerprintHex: requireFlag(invocation.flags, 'reader-identity-fingerprint'),
          readerDeviceSigningKeyFingerprintHex: requireFlag(
            invocation.flags,
            'reader-device-signing-fingerprint',
          ),
          readerDelegationId: requireFlag(invocation.flags, 'reader-delegation-id'),
          accessMode: invocation.flags.get('access-mode') ?? 'forward_only',
          firstKekVersion: Number(invocation.flags.get('first-kek-version') ?? '1'),
          validFrom: invocation.flags.get('valid-from') ?? new Date().toISOString(),
          validUntil: requireFlag(invocation.flags, 'valid-until'),
          lifecycleOrder: invocation.flags.get('lifecycle-order') ?? 'seq:0000000000000001',
        }));
        process.stdout.write(`${JSON.stringify(grant)}\n`);
        return;
      }
      if (invocation.ceremony !== 'claim-home') {
        throw new Error('unknown_ceremony');
      }
      const founding = await withClient(vaultHomePath, async (client) => await runClaimHomeCeremony({
        client,
        vaultSodium: sodium as unknown as VaultSodium,
        coreUrl: requireFlag(invocation.flags, 'core-url'),
        moveInCode: requireFlag(invocation.flags, 'move-in-code'),
        signerKeyFingerprintHex: requireFlag(invocation.flags, 'fingerprint'),
        expectedHostSigningKeyFingerprintHex: requireFlag(invocation.flags, 'host-signing-fingerprint'),
        expectedHostKeyAgreementKeyFingerprintHex: requireFlag(invocation.flags, 'host-agreement-fingerprint'),
      }));
      process.stdout.write(`${JSON.stringify(founding)}\n`);
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
        + '| pico-vault ceremony claim-home --core-url <url> --move-in-code <code> '
        + '--fingerprint <hex> --host-signing-fingerprint <hex> --host-agreement-fingerprint <hex>\n'
        + '[--vault-home <path>] [--foundation-data <path>] [--foundation-backup <path>] '
        + '[--role <keyRole>] [--fingerprint <hex>] [--input-hex <hex>]\n',
      );
      process.exit(1);
    },
  );
}

/**
 * ADR 0103 C1. Founds a Pico Home from the person's side.
 *
 * Everything that needs the identity key crosses the daemon socket, so this
 * process never holds a private key: the two signatures are `sign` calls, each
 * raising an approval on the terminal holding the unlock, because founding a
 * Home creates authority and is not on the ADR 0099 exempt list. Sealing the
 * claim needs only the host's public key, so it stays local.
 *
 * The host key fingerprints the person read from the add-on log are compared
 * against what the Foundation serves. That comparison is the whole reason the
 * log prints them: without it, whatever answers on `--core-url` could hand out
 * its own key and receive a claim sealed to itself.
 */
async function runClaimHomeCeremony(input: {
  client: PicoVaultDaemonClient;
  vaultSodium: VaultSodium;
  coreUrl: string;
  moveInCode: string;
  signerKeyFingerprintHex: string;
  expectedHostSigningKeyFingerprintHex: string;
  expectedHostKeyAgreementKeyFingerprintHex: string;
}): Promise<Record<string, unknown>> {
  const status = await input.client.status();
  const signer = status.sessions.find(
    (session) => session.keyFingerprintHex === input.signerKeyFingerprintHex,
  );
  if (signer === undefined) {
    throw new Error('claim_signer_not_unlocked');
  }
  if (signer.keyRole !== 'pico_identity') {
    throw new Error('claim_requires_pico_identity_key');
  }

  const setup = await foundationRequest(input.coreUrl, '/api/home/setup', undefined) as {
    setupMode: { hostSetupNonceHex: string };
    host: {
      signingKeyFingerprintHex: string;
      keyAgreementKeyFingerprintHex: string;
      keyAgreementPublicKeyHex: string;
    };
  };

  // Trust the person's log, not the endpoint's self-description.
  if (setup.host.signingKeyFingerprintHex !== input.expectedHostSigningKeyFingerprintHex
    || setup.host.keyAgreementKeyFingerprintHex !== input.expectedHostKeyAgreementKeyFingerprintHex) {
    throw new Error('host_key_fingerprint_mismatch');
  }

  const claimantIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'pico_identity',
    publicKeyHex: signer.publicKeyHex,
  };
  const claim: PicoHomeClaimSignatureInput = {
    suite: picoIdentitySuite,
    claimId: `claim_${Buffer.from(input.vaultSodium.randombytes_buf(16)).toString('hex')}`,
    hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex: setup.host.keyAgreementKeyFingerprintHex,
    moveInCode: input.moveInCode,
    claimantIdentityKeyFingerprintHex: signer.keyFingerprintHex,
    claimantNonceHex: Buffer.from(input.vaultSodium.randombytes_buf(32)).toString('hex'),
    hostSetupNonceHex: setup.setupMode.hostSetupNonceHex,
  };

  process.stderr.write('Approve the Home claim on the terminal holding the unlock.\n');
  const claimSignature = await input.client.sign({
    keyFingerprintHex: signer.keyFingerprintHex,
    label: picoHomeSignatureInputLabels.claim,
    fields: claim as unknown as Record<string, unknown>,
  });

  const sealedClaimPayload = {
    schema: picoHomeSealedClaimPayloadSchema,
    claim,
    claimantIdentityKeyRecord,
    claimantSignatureHex: claimSignature.signatureHex,
  };
  const sealedClaimPayloadHex = Buffer.from(input.vaultSodium.crypto_box_seal(
    Uint8Array.from(Buffer.from(JSON.stringify(sealedClaimPayload), 'utf8')),
    Uint8Array.from(Buffer.from(setup.host.keyAgreementPublicKeyHex, 'hex')),
  )).toString('hex');

  const pending = await foundationRequest(input.coreUrl, '/api/home/claim', {
    claimEnvelope: { schema: picoHomeClaimEnvelopeSchema, sealedClaimPayloadHex },
  }) as { pendingClaim: { founding: PicoHomeFoundingSignatureInput } };

  process.stderr.write('Claim accepted. Approve the founding acceptance to complete it.\n');
  const foundingSignature = await input.client.sign({
    keyFingerprintHex: signer.keyFingerprintHex,
    label: picoHomeSignatureInputLabels.founding,
    fields: pending.pendingClaim.founding as unknown as Record<string, unknown>,
  });

  return await foundationRequest(input.coreUrl, '/api/home/claim', {
    foundingAcceptance: {
      schema: picoHomeFoundingAcceptanceSchema,
      claimId: claim.claimId,
      foundingId: pending.pendingClaim.founding.foundingId,
      claimantFoundingSignatureHex: foundingSignature.signatureHex,
    },
  }) as Record<string, unknown>;
}

/**
 * The Foundation's refusal is authority, not a transport failure (ADR 0103
 * C4): its `error` is surfaced verbatim and nothing is retried, because a
 * retry would either repeat a spent Move-In Code or hide the reason.
 */
async function foundationRequest(
  coreUrl: string,
  path: string,
  body: Record<string, unknown> | undefined,
  session?: string,
): Promise<unknown> {
  const url = new URL(path, coreUrl.endsWith('/') ? coreUrl : `${coreUrl}/`);
  const headers: Record<string, string> = session === undefined
    ? {}
    : { authorization: `Bearer ${session}` };
  const response = await fetch(url, body === undefined
    ? { method: 'GET', headers }
    : {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text === '' ? {} : JSON.parse(text);
  } catch {
    throw new Error(`foundation_invalid_response:${response.status}`);
  }

  if (!response.ok) {
    const reason = (parsed as { error?: unknown }).error;
    throw new Error(`foundation_rejected:${response.status}:${typeof reason === 'string' ? reason : text}`);
  }

  return parsed;
}

function requireFlag(flags: Map<string, string>, name: string): string {
  const value = flags.get(name);
  if (value === undefined || value.trim() === '') {
    throw new Error(`missing_required_flag:--${name}`);
  }
  return value;
}

/**
 * ADR 0103 C2. Creates a reader-custody domain in a founded Home.
 *
 * The KEK is born, sealed and zeroized inside the daemon (ADR 0101), so this
 * process only ever sees the finished signed record and relays it. Two keys
 * must be unlocked: the identity root signs, and the owner's key-agreement
 * public key is read from its unlocked session because the daemon publishes
 * public keys only for sessions the person opened. That is the two-terminal
 * cost ADR 0102 records rather than a limitation introduced here.
 *
 * `homeId` and the host signing fingerprint are read from the Foundation's
 * own claim state instead of being passed in: they are facts about the Home,
 * and a mistyped one would produce a signed record the Home then rejects.
 */
async function runCreateDomainCeremony(input: {
  client: PicoVaultDaemonClient;
  vaultSodium: VaultSodium;
  coreUrl: string;
  session: string;
  signerKeyFingerprintHex: string;
  agreementKeyFingerprintHex: string;
  domainId: string;
  lifecycleOrder: string;
}): Promise<Record<string, unknown>> {
  const status = await input.client.status();
  const signer = status.sessions.find(
    (session) => session.keyFingerprintHex === input.signerKeyFingerprintHex,
  );
  if (signer === undefined || signer.keyRole !== 'pico_identity') {
    throw new Error('domain_signer_not_unlocked');
  }
  const agreement = status.sessions.find(
    (session) => session.keyFingerprintHex === input.agreementKeyFingerprintHex,
  );
  if (agreement === undefined || agreement.keyRole !== 'device_key_agreement') {
    throw new Error('owner_agreement_key_not_unlocked');
  }

  const foundation = await foundationRequest(
    input.coreUrl,
    '/api/system/status',
    undefined,
    input.session,
  ) as {
    picoHome: {
      claimState: {
        state: string;
        homeId?: string;
        hostSigningKeyFingerprintHex?: string;
      };
    };
  };
  const claimState = foundation.picoHome.claimState;
  if (claimState.state !== 'claimed'
    || claimState.homeId === undefined
    || claimState.hostSigningKeyFingerprintHex === undefined) {
    throw new Error('home_is_not_claimed');
  }

  process.stderr.write('Approve the domain ceremony on the terminal holding the identity unlock.\n');
  const ceremony = await input.client.ceremonyCreateDomain({
    signerKeyFingerprintHex: signer.keyFingerprintHex,
    ownerReaderKeyRecord: {
      suite: picoIdentitySuite,
      keyRole: 'device_key_agreement',
      publicKeyHex: agreement.publicKeyHex,
    },
    domainAuthorityId: `domain_authority_${Buffer.from(input.vaultSodium.randombytes_buf(16)).toString('hex')}`,
    homeId: claimState.homeId,
    hostSigningKeyFingerprintHex: claimState.hostSigningKeyFingerprintHex,
    domainId: input.domainId,
    authorizedAt: new Date().toISOString(),
    lifecycleOrder: input.lifecycleOrder,
  });

  const accepted = await foundationRequest(
    input.coreUrl,
    '/api/home/reader-custody/domains',
    ceremony.domainRecord,
    input.session,
  ) as Record<string, unknown>;

  // The signed record is returned to the caller, not just the Foundation's
  // view of it. `GET .../domains` answers with a view that carries no
  // signature and no key records, so the Foundation cannot hand this back
  // later - and every later ceremony on this domain needs it as input. The
  // owner holds their own records; keep this output.
  return { accepted, domainRecord: ceremony.domainRecord };
}

/**
 * ADR 0103 C2. Rotates a domain KEK, and grants a reader access to it.
 *
 * Both take the signed domain record as a file rather than fetching it,
 * because the Foundation only ever returns views. That is the custody model
 * working as intended - the owner's records are the owner's - and it means a
 * person who loses them cannot rotate or grant again without re-founding the
 * domain. Recording that here because nothing else states it.
 */
function readRecordFile(path: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolve(path), 'utf8'));
  } catch (error) {
    throw new Error(`invalid_${label}_file:${(error as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`invalid_${label}_file:not_an_object`);
  }
  return parsed as Record<string, unknown>;
}

function readRecordListFile(path: string | undefined, label: string): Record<string, unknown>[] {
  if (path === undefined) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolve(path), 'utf8'));
  } catch (error) {
    throw new Error(`invalid_${label}_file:${(error as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`invalid_${label}_file:not_an_array`);
  }
  return parsed as Record<string, unknown>[];
}

async function runRotateDomainCeremony(input: {
  client: PicoVaultDaemonClient;
  vaultSodium: VaultSodium;
  coreUrl: string;
  session: string;
  signerKeyFingerprintHex: string;
  domainRecord: Record<string, unknown>;
  rotationRecords: Record<string, unknown>[];
  readerGrantLifecycleRecords: Record<string, unknown>[];
  writerGrantLifecycleRecords: Record<string, unknown>[];
  remainingReaderGrantRecords: Record<string, unknown>[];
  lifecycleOrder: string;
}): Promise<Record<string, unknown>> {
  const status = await input.client.status();
  const signer = status.sessions.find(
    (session) => session.keyFingerprintHex === input.signerKeyFingerprintHex,
  );
  if (signer === undefined || signer.keyRole !== 'pico_identity') {
    throw new Error('domain_signer_not_unlocked');
  }

  process.stderr.write('Approve the rotation on the terminal holding the identity unlock.\n');
  const ceremony = await input.client.ceremonyRotateDomain({
    signerKeyFingerprintHex: signer.keyFingerprintHex,
    domainRecord: input.domainRecord,
    rotationRecords: input.rotationRecords,
    readerGrantLifecycleRecords: input.readerGrantLifecycleRecords,
    writerGrantLifecycleRecords: input.writerGrantLifecycleRecords,
    remainingReaderGrantRecords: input.remainingReaderGrantRecords,
    rotationId: `rotation_${Buffer.from(input.vaultSodium.randombytes_buf(16)).toString('hex')}`,
    rotatedAt: new Date().toISOString(),
    lifecycleOrder: input.lifecycleOrder,
  });

  const accepted = await foundationRequest(
    input.coreUrl,
    '/api/home/reader-custody/kek-rotations',
    ceremony.rotationRecord,
    input.session,
  ) as Record<string, unknown>;

  return { accepted, rotationRecord: ceremony.rotationRecord };
}

async function runGrantReaderCeremony(input: {
  client: PicoVaultDaemonClient;
  coreUrl: string;
  session: string;
  signerKeyFingerprintHex: string;
  agreementKeyFingerprintHex: string;
  domainRecord: Record<string, unknown>;
  rotationRecords: Record<string, unknown>[];
  readerKeyRecord: Record<string, unknown>;
  readerGrantId: string;
  readerIdentityKeyFingerprintHex: string;
  readerDeviceSigningKeyFingerprintHex: string;
  readerDelegationId: string;
  accessMode: string;
  firstKekVersion: number;
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
}): Promise<Record<string, unknown>> {
  const status = await input.client.status();
  const signer = status.sessions.find(
    (session) => session.keyFingerprintHex === input.signerKeyFingerprintHex,
  );
  if (signer === undefined || signer.keyRole !== 'pico_identity') {
    throw new Error('domain_signer_not_unlocked');
  }
  const agreement = status.sessions.find(
    (session) => session.keyFingerprintHex === input.agreementKeyFingerprintHex,
  );
  if (agreement === undefined || agreement.keyRole !== 'device_key_agreement') {
    throw new Error('owner_agreement_key_not_unlocked');
  }

  process.stderr.write('Approve the reader grant on the terminal holding the identity unlock.\n');
  const ceremony = await input.client.ceremonyCreateReaderGrant({
    signerKeyFingerprintHex: signer.keyFingerprintHex,
    agreementKeyFingerprintHex: agreement.keyFingerprintHex,
    domainRecord: input.domainRecord,
    rotationRecords: input.rotationRecords,
    readerKeyRecord: input.readerKeyRecord,
    readerGrantId: input.readerGrantId,
    readerIdentityKeyFingerprintHex: input.readerIdentityKeyFingerprintHex,
    readerDeviceSigningKeyFingerprintHex: input.readerDeviceSigningKeyFingerprintHex,
    readerDelegationId: input.readerDelegationId,
    accessMode: input.accessMode,
    firstKekVersion: input.firstKekVersion,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    lifecycleOrder: input.lifecycleOrder,
  });

  const accepted = await foundationRequest(
    input.coreUrl,
    '/api/home/reader-custody/reader-grants',
    ceremony.readerGrantRecord,
    input.session,
  ) as Record<string, unknown>;

  return { accepted, readerGrantRecord: ceremony.readerGrantRecord };
}

/**
 * ADR 0103 Weg A. Publishes an ADR 0085 freshness checkpoint so a reader
 * grant can be judged at all.
 *
 * Signed through `sign` rather than the ceremony signer adapter, for the same
 * reason claim-home is: the adapter blocks its thread, and this needs none of
 * it. `reader-key-freshness` is on the ADR 0099 exempt list, so no approval is
 * raised - which is a requirement rather than a convenience, because a
 * checkpoint is valid for at most five minutes and has to be reissued often.
 * A person cannot be asked every five minutes.
 *
 * The five-minute ceiling is enforced here as well as in the verifier, so an
 * over-long window fails before the person's key is ever used on it.
 */
async function runPublishCheckpointCeremony(input: {
  client: PicoVaultDaemonClient;
  coreUrl: string;
  session: string;
  signerKeyFingerprintHex: string;
  homeId: string;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  delegationId: string;
  status: PicoIdentityReaderKeyFreshnessStatus;
  observedThroughLifecycleOrder: string;
  freshForSeconds: number;
}): Promise<Record<string, unknown>> {
  const status = await input.client.status();
  const signer = status.sessions.find(
    (session) => session.keyFingerprintHex === input.signerKeyFingerprintHex,
  );
  if (signer === undefined || signer.keyRole !== 'pico_identity') {
    throw new Error('checkpoint_signer_not_unlocked');
  }
  if (!Number.isSafeInteger(input.freshForSeconds)
    || input.freshForSeconds < 1
    || input.freshForSeconds * 1_000 > MAX_READER_KEY_FRESHNESS_MS) {
    throw new Error('reader_key_freshness_window_too_long');
  }

  const checkedAtMs = Date.now();
  const checkpoint: PicoIdentityReaderKeyFreshnessSignatureInput = {
    suite: picoIdentitySuite,
    checkpointId: `checkpoint_${Buffer.from(sodium.randombytes_buf(16)).toString('hex')}`,
    homeId: input.homeId,
    // The issuer is the reader's own identity root: a reader asserts the
    // freshness of its own device keys.
    issuerIdentityKeyFingerprintHex: signer.keyFingerprintHex,
    deviceSigningKeyFingerprintHex: input.deviceSigningKeyFingerprintHex,
    deviceKeyAgreementKeyFingerprintHex: input.deviceKeyAgreementKeyFingerprintHex,
    delegationId: input.delegationId,
    status: input.status,
    observedThroughLifecycleOrder: input.observedThroughLifecycleOrder,
    checkedAt: new Date(checkedAtMs).toISOString(),
    freshUntil: new Date(checkedAtMs + (input.freshForSeconds * 1_000)).toISOString(),
  };

  const signature = await input.client.sign({
    keyFingerprintHex: signer.keyFingerprintHex,
    label: picoIdentityReaderKeyFreshnessSignatureInputLabel,
    fields: checkpoint as unknown as Record<string, unknown>,
  });

  const record = {
    schema: picoIdentityReaderKeyFreshnessCheckpointSchema,
    checkpoint,
    issuerIdentityKeyRecord: {
      suite: picoIdentitySuite,
      keyRole: 'pico_identity',
      publicKeyHex: signer.publicKeyHex,
    },
    issuerSignatureHex: signature.signatureHex,
  };

  const accepted = await foundationRequest(
    input.coreUrl,
    '/api/home/reader-key-freshness-checkpoints',
    record,
    input.session,
  ) as Record<string, unknown>;

  // Returned so a caller can see exactly what it published, and when it stops
  // being usable.
  return { accepted, freshUntil: checkpoint.freshUntil, checkpointId: checkpoint.checkpointId };
}

/**
 * ADR 0103 Weg A. Issues a Home membership credential for another Pico.
 *
 * The credential has two halves and only one of them is a person's. The
 * issuer statement carries the authority (ADR 0080 H6) and is signed here,
 * under approval, by the identity that founded the Home. The host's
 * activation signature is added by the Foundation at intake, because it is
 * made with the Home host key - infrastructure custody that lives in the
 * Foundation and never in a Vault. So this command deliberately sends an
 * issuer statement, not a finished credential.
 */
async function runIssueMembershipCeremony(input: {
  client: PicoVaultDaemonClient;
  coreUrl: string;
  session: string;
  signerKeyFingerprintHex: string;
  homeId: string;
  subjectPicoIdentityFingerprintHex: string;
  hostSigningKeyFingerprintHex: string;
  role: PicoHomeMembershipRole;
  scopes: PicoHomeMembershipScope[];
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
}): Promise<Record<string, unknown>> {
  const status = await input.client.status();
  const signer = status.sessions.find(
    (session) => session.keyFingerprintHex === input.signerKeyFingerprintHex,
  );
  if (signer === undefined || signer.keyRole !== 'pico_identity') {
    throw new Error('membership_issuer_not_unlocked');
  }

  const membership: PicoHomeMembershipSignatureInput = {
    suite: picoIdentitySuite,
    credentialId: `membership_${Buffer.from(sodium.randombytes_buf(16)).toString('hex')}`,
    homeId: input.homeId,
    issuerPicoIdentityFingerprintHex: signer.keyFingerprintHex,
    subjectPicoIdentityFingerprintHex: input.subjectPicoIdentityFingerprintHex,
    hostSigningKeyFingerprintHex: input.hostSigningKeyFingerprintHex,
    role: input.role,
    scopes: input.scopes,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    lifecycleOrder: input.lifecycleOrder,
  };

  process.stderr.write('Approve the membership on the terminal holding the identity unlock.\n');
  const signature = await input.client.sign({
    keyFingerprintHex: signer.keyFingerprintHex,
    label: picoHomeSignatureInputLabels.membership,
    fields: membership as unknown as Record<string, unknown>,
  });

  const issuerStatement = {
    schema: picoHomeMembershipCredentialSchema,
    membership,
    issuerIdentityKeyRecord: {
      suite: picoIdentitySuite,
      keyRole: 'pico_identity',
      publicKeyHex: signer.publicKeyHex,
    },
    issuerSignatureHex: signature.signatureHex,
  };

  const accepted = await foundationRequest(
    input.coreUrl,
    '/api/home/memberships',
    issuerStatement,
    input.session,
  ) as Record<string, unknown>;

  return { accepted, issuerStatement };
}

/**
 * ADR 0103 Weg A. The identity root delegates to its own device keys.
 *
 * Purely local: nothing is delivered anywhere, because a delegation is not a
 * Home's business until its holder presents it. The signed record is printed
 * for the person to keep, and `open-identity-session` takes it back as a file.
 * Losing it means re-delegating, the same way losing a domain record means
 * the domain cannot be rotated.
 *
 * Delegating creates authority - it is what lets a device key act for an
 * identity - so it is not on the ADR 0099 exempt list and costs one approval.
 */
async function runDelegateDeviceCeremony(input: {
  client: PicoVaultDaemonClient;
  signerKeyFingerprintHex: string;
  subjectSigningKeyFingerprintHex: string;
  subjectKeyAgreementKeyFingerprintHex: string;
  scopes: PicoIdentityDelegationScope[];
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
}): Promise<Record<string, unknown>> {
  const status = await input.client.status();
  const signer = status.sessions.find(
    (session) => session.keyFingerprintHex === input.signerKeyFingerprintHex,
  );
  if (signer === undefined || signer.keyRole !== 'pico_identity') {
    throw new Error('delegation_issuer_not_unlocked');
  }

  const record: PicoIdentityDelegationSignatureInput = {
    suite: picoIdentitySuite,
    delegationId: `delegation_${Buffer.from(sodium.randombytes_buf(16)).toString('hex')}`,
    issuerIdentityKeyFingerprintHex: signer.keyFingerprintHex,
    subjectSigningKeyFingerprintHex: input.subjectSigningKeyFingerprintHex,
    subjectKeyAgreementKeyFingerprintHex: input.subjectKeyAgreementKeyFingerprintHex,
    scopes: input.scopes,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    lifecycleOrder: input.lifecycleOrder,
  };

  process.stderr.write('Approve the device delegation on the terminal holding the identity unlock.\n');
  const signature = await input.client.sign({
    keyFingerprintHex: signer.keyFingerprintHex,
    label: picoIdentitySignatureInputLabels.delegation,
    fields: record as unknown as Record<string, unknown>,
  });

  return { record, signatureHex: signature.signatureHex };
}

/**
 * ADR 0103 Weg A. Opens an identity-bound Foundation session, which is also
 * the only way a reader key is ever registered (`app.ts:1733`).
 *
 * Needs all three of the identity's keys unlocked, because the proof carries a
 * public key record for each and the daemon publishes a public key only for a
 * session the person opened. Three unlocked keys means three terminals today -
 * the cost ADR 0102 recorded and ADR 0105 is the answer to.
 *
 * The possession signature is made by the *device signing* key, not the root:
 * it proves the device holds what the delegation names. It is on the ADR 0099
 * exempt list, so opening a session costs no approval - correct, because a
 * session is proof of possession rather than a new authority.
 */
async function runOpenIdentitySessionCeremony(input: {
  client: PicoVaultDaemonClient;
  coreUrl: string;
  identityKeyFingerprintHex: string;
  signingKeyFingerprintHex: string;
  agreementKeyFingerprintHex: string;
  delegation: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const status = await input.client.status();
  const find = (fingerprint: string, role: string, reason: string) => {
    const session = status.sessions.find(
      (candidate) => candidate.keyFingerprintHex === fingerprint && candidate.keyRole === role,
    );
    if (session === undefined) {
      throw new Error(reason);
    }
    return session;
  };
  const identity = find(input.identityKeyFingerprintHex, 'pico_identity', 'identity_key_not_unlocked');
  const signing = find(input.signingKeyFingerprintHex, 'device_signing', 'device_signing_key_not_unlocked');
  const agreement = find(
    input.agreementKeyFingerprintHex,
    'device_key_agreement',
    'device_key_agreement_key_not_unlocked',
  );

  const challenge = await foundationRequest(
    input.coreUrl,
    '/api/auth/identity-challenges',
    {},
  ) as { challengeId: string; verifierNonceHex: string; verifierContext: string };

  const possession = {
    suite: picoIdentitySuite,
    subjectKeyFingerprintHex: signing.keyFingerprintHex,
    verifierNonceHex: challenge.verifierNonceHex,
    verifierContext: challenge.verifierContext,
  };
  const possessionSignature = await input.client.sign({
    keyFingerprintHex: signing.keyFingerprintHex,
    label: picoIdentitySignatureInputLabels.possession,
    fields: possession,
  });

  const keyRecord = (session: { keyRole: string; publicKeyHex: string }) => ({
    suite: picoIdentitySuite,
    keyRole: session.keyRole,
    publicKeyHex: session.publicKeyHex,
  });

  // The route takes these flat, not nested under a `proof` object.
  return await foundationRequest(input.coreUrl, '/api/auth/identity-session', {
    challengeId: challenge.challengeId,
    identityKeyRecord: keyRecord(identity),
    deviceSigningKeyRecord: keyRecord(signing),
    deviceKeyAgreementKeyRecord: keyRecord(agreement),
    delegation: input.delegation,
    revocations: [],
    possessionSignatureHex: possessionSignature.signatureHex,
  }) as Record<string, unknown>;
}
