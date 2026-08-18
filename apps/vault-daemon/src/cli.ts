#!/usr/bin/env node
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertVaultCustodyPathSeparation,
  createPicoVaultKeyfile,
  restorePicoVaultIdentityFromRecovery,
  writePicoVaultKeyfile,
  type PicoVaultRecoveryCard,
  type VaultSodium,
} from '@pico/vault';
import {
  picoHomeContinuityReasonCategories,
  picoHomeContinuityRecordSchema,
  picoHomeMembershipCredentialSchema,
  picoHomeSignatureInputLabels,
  picoIdentityDelegationScopes,
  picoIdentityReaderKeyFreshnessSignatureInputLabel,
  picoIdentitySignatureInputLabels,
  picoHomeMembershipRoles,
  picoHomeMembershipScopes,
  picoIdentityRevocationReasonCategories,
  picoIdentityReaderKeyFreshnessCheckpointSchema,
  picoIdentityReaderKeyFreshnessStatuses,
  picoHomeClaimEnvelopeSchema,
  picoHomeFoundingAcceptanceSchema,
  picoHomeSealedClaimPayloadV2Schema,
  picoHomeV2SignatureInputLabels,
  picoIdentitySuite,
  picoVaultPersonKeyRoles,
  type PicoHomeClaimSignatureInput,
  type PicoHomeDeviceRecoveryPendingView,
  type PicoHomeFoundingSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoHomeMembershipRole,
  type PicoIdentityDelegationScope,
  type PicoIdentityDelegationSignatureInput,
  type PicoHomeMembershipScope,
  type PicoHomeContinuityReasonCategory,
  type PicoHomeContinuitySignatureInput,
  type PicoHomeMembershipSignatureInput,
  type PicoIdentityReaderKeyFreshnessSignatureInput,
  type PicoIdentityReaderKeyFreshnessStatus,
  type PicoIdentityRevocationReasonCategory,
  type PicoVaultPersonKeyRole,
} from '@pico/protocol';
import sodium from 'libsodium-wrappers-sumo';
import { connectPicoVaultDaemonClient, type PicoVaultDaemonClient } from './client.js';
import { startPicoVaultDaemon } from './daemon.js';
import {
  createPicoLinkDirectClient,
  type PicoLinkDirectClient,
} from './link-direct-client.js';
import { refreshPicoHomeHostPins } from './host-pin-refresh.js';
import {
  enrollPicoHomeDevice,
  picoHomeDeviceTargetSignerFromVault,
  readPicoHomeDeviceLifecycle,
  renewPicoHomeDevice,
  revokePicoHomeDevice,
} from './device-lifecycle-ceremony.js';
import {
  completePicoHomeDeviceRecovery,
  initiatePicoHomeDeviceRecovery,
  vetoPicoHomeDeviceRecovery,
} from './device-recovery-ceremony.js';
import {
  picoFoundationRequest as foundationRequest,
  runPicoClaimHomeCeremony,
  runPicoDelegateDeviceCeremony,
  type PicoClaimHomeCeremonyStep,
} from './claim-home-ceremony.js';

/**
 * ADR 0130 E2. The ceremony's approval moments, in this caller's medium.
 *
 * The sentences were `process.stderr.write` calls inside the ceremony until it
 * was lifted out so the Pico Client could run the same one. "On the terminal
 * holding the unlock" is true here and false in a window, which is why the
 * ceremony announces a moment and each caller writes the words.
 */
const announceOnTerminal = (step: PicoClaimHomeCeremonyStep): void => {
  const lines: Record<PicoClaimHomeCeremonyStep, string> = {
    device_delegation:
      'Approve the device delegation on the terminal holding the identity unlock.',
    home_claim: 'Approve the Home claim on the terminal holding the unlock.',
    founding_acceptance: 'Claim accepted. Approve the founding acceptance to complete it.',
  };
  process.stderr.write(`${lines[step]}\n`);
};
import { generatePicoRecoveryCardPdfs } from './recovery-card-pdf.js';

const cliCommands = [
  'daemon',
  'create',
  'status',
  'unlock',
  'lock',
  'sign',
  'refresh-host-pins',
  'ceremony',
] as const;
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
  'enroll-device',
  'renew-device',
  'revoke-device',
  'inspect-device-lifecycle',
  'issue-recovery-card',
  'restore-identity',
  'initiate-recovery',
  'complete-recovery',
  'veto-recovery',
  'rotate-host-key',
] as const;
type CeremonySubcommand = typeof ceremonySubcommands[number];

const flagNamesByCommand: Record<CliCommand, readonly string[]> = {
  daemon: ['vault-home', 'foundation-data', 'foundation-backup'],
  create: ['vault-home', 'foundation-data', 'foundation-backup', 'role'],
  status: ['vault-home'],
  unlock: ['vault-home', 'role', 'fingerprint'],
  lock: ['vault-home'],
  sign: ['vault-home', 'fingerprint', 'label', 'fields-json'],
  // ADR 0115 U4: pure verification, no vault and no daemon - a stranded
  // client must be able to heal without an unlock. The acceptor flag is what
  // makes the chain walk mean anything (see host-pin-refresh.ts).
  'refresh-host-pins': [
    'core-url',
    'host-signing-fingerprint',
    'host-agreement-fingerprint',
    'home-host-pico-fingerprint',
  ],
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
    'signing-fingerprint',
    'agreement-fingerprint',
    'delegation-valid-until',
    'transport',
    'link-signing-fingerprint',
    'link-agreement-fingerprint',
    'host-signing-public-key',
    'host-agreement-public-key',
  ],
  'create-domain': [
    'vault-home',
    'fingerprint',
    'agreement-fingerprint',
    'core-url',
    'session',
    'domain-id',
    'lifecycle-order',
    'transport',
    'link-signing-fingerprint',
    'link-agreement-fingerprint',
    'link-delegation-id',
    'host-signing-fingerprint',
    'host-agreement-fingerprint',
    'host-signing-public-key',
    'host-agreement-public-key',
    'link-vault-home',
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
  'enroll-device': [
    'vault-home',
    'sponsor-vault-home',
    'target-vault-home',
    'fingerprint',
    'core-url',
    'target-signing-fingerprint',
    'target-agreement-fingerprint',
    'scopes',
    'valid-from',
    'valid-until',
    'link-signing-fingerprint',
    'link-agreement-fingerprint',
    'link-delegation-id',
    'host-signing-fingerprint',
    'host-agreement-fingerprint',
    'host-signing-public-key',
    'host-agreement-public-key',
  ],
  'renew-device': [
    'vault-home',
    'sponsor-vault-home',
    'target-vault-home',
    'fingerprint',
    'core-url',
    'target-signing-fingerprint',
    'target-agreement-fingerprint',
    'target-delegation-id',
    'scopes',
    'valid-from',
    'valid-until',
    'link-signing-fingerprint',
    'link-agreement-fingerprint',
    'link-delegation-id',
    'host-signing-fingerprint',
    'host-agreement-fingerprint',
    'host-signing-public-key',
    'host-agreement-public-key',
  ],
  'revoke-device': [
    'vault-home',
    'sponsor-vault-home',
    'fingerprint',
    'core-url',
    'target-delegation-id',
    'subject',
    'reason-category',
    'link-signing-fingerprint',
    'link-agreement-fingerprint',
    'link-delegation-id',
    'host-signing-fingerprint',
    'host-agreement-fingerprint',
    'host-signing-public-key',
    'host-agreement-public-key',
  ],
  'inspect-device-lifecycle': [
    'vault-home',
    'fingerprint',
    'identity-public-key',
    'core-url',
    'link-signing-fingerprint',
    'link-agreement-fingerprint',
    'link-delegation-id',
    'host-signing-fingerprint',
    'host-agreement-fingerprint',
    'host-signing-public-key',
    'host-agreement-public-key',
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
    'transport',
    'link-signing-fingerprint',
    'link-agreement-fingerprint',
    'link-delegation-id',
    'host-agreement-fingerprint',
    'host-signing-public-key',
    'host-agreement-public-key',
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
    'transport',
    'link-signing-fingerprint',
    'link-agreement-fingerprint',
    'link-delegation-id',
    'host-signing-fingerprint',
    'host-agreement-fingerprint',
    'host-signing-public-key',
    'host-agreement-public-key',
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
    'transport',
    'link-signing-fingerprint',
    'link-agreement-fingerprint',
    'link-delegation-id',
    'host-signing-fingerprint',
    'host-agreement-fingerprint',
    'host-signing-public-key',
    'host-agreement-public-key',
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
    'transport',
    'link-signing-fingerprint',
    'link-agreement-fingerprint',
    'link-delegation-id',
    'host-signing-fingerprint',
    'host-agreement-fingerprint',
    'host-signing-public-key',
    'host-agreement-public-key',
  ],
  'issue-recovery-card': [
    'vault-home',
    'fingerprint',
    'pico-name',
    'home-name',
    'home-id',
    'home-host-identity-fingerprint',
    'host-signing-fingerprint',
    'host-agreement-fingerprint',
    'host-agreement-public-key',
    'endpoint-hint',
    'output-dir',
  ],
  'restore-identity': [
    'vault-home',
    'foundation-data',
    'foundation-backup',
    'fingerprint',
  ],
  'initiate-recovery': [
    'vault-home',
    'target-vault-home',
    'fingerprint',
    'core-url',
    'home-id',
    'target-delegation-id',
    'target-signing-fingerprint',
    'target-agreement-fingerprint',
    'scopes',
    'valid-from',
    'valid-until',
    'host-signing-fingerprint',
    'host-agreement-fingerprint',
    'host-signing-public-key',
    'host-agreement-public-key',
  ],
  'complete-recovery': [
    'vault-home',
    'fingerprint',
    'identity-public-key',
    'core-url',
    'pending-file',
    'target-delegation-id',
    'target-signing-fingerprint',
    'target-agreement-fingerprint',
    'host-signing-fingerprint',
    'host-agreement-fingerprint',
    'host-signing-public-key',
    'host-agreement-public-key',
  ],
  'rotate-host-key': [
    'vault-home',
    'fingerprint',
    'core-url',
    'reason',
    'transport',
    'link-signing-fingerprint',
    'link-agreement-fingerprint',
    'link-delegation-id',
    'host-signing-fingerprint',
    'host-agreement-fingerprint',
    'host-signing-public-key',
    'host-agreement-public-key',
  ],
  'veto-recovery': [
    'vault-home',
    'fingerprint',
    'identity-public-key',
    'core-url',
    'recovery-id',
    'link-signing-fingerprint',
    'link-agreement-fingerprint',
    'link-delegation-id',
    'host-signing-fingerprint',
    'host-agreement-fingerprint',
    'host-signing-public-key',
    'host-agreement-public-key',
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
    // Piped input goes through the shared line buffer, so queued lines for
    // sequential prompts (passphrase plus repeat, PIN plus repeat) are not
    // lost when they arrive inside one chunk. Unlike approval answers, a
    // passphrase line is never trimmed.
    const alreadyBuffered = takeBufferedRawLine();
    if (alreadyBuffered !== undefined) {
      return alreadyBuffered;
    }
    return await new Promise<string>((resolvePromise, rejectPromise) => {
      const onData = (chunk: Buffer): void => {
        bufferedStdin += chunk.toString('utf8');
        const line = takeBufferedRawLine();
        if (line !== undefined) {
          stdin.off('data', onData);
          stdin.pause();
          resolvePromise(line);
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

function takeBufferedRawLine(): string | undefined {
  const newlineIndex = bufferedStdin.indexOf('\n');
  if (newlineIndex < 0) {
    return undefined;
  }
  const line = bufferedStdin.slice(0, newlineIndex);
  bufferedStdin = bufferedStdin.slice(newlineIndex + 1);
  return line.replace(/\r$/, '');
}

function takeBufferedLine(): string | undefined {
  return takeBufferedRawLine()?.trim();
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

async function runDeviceLifecycleCli(
  ceremony: Extract<
    CeremonySubcommand,
    'enroll-device' | 'renew-device' | 'revoke-device' | 'inspect-device-lifecycle'
  >,
  flags: Map<string, string>,
  rootVaultHomePath: string,
  vaultSodium: VaultSodium,
): Promise<Record<string, unknown>> {
  const identityKeyFingerprintHex = requireFlag(flags, 'fingerprint');
  const sponsor = {
    identityKeyFingerprintHex,
    deviceSigningKeyFingerprintHex: requireFlag(flags, 'link-signing-fingerprint'),
    deviceKeyAgreementKeyFingerprintHex: requireFlag(flags, 'link-agreement-fingerprint'),
    delegationId: requireFlag(flags, 'link-delegation-id'),
  };

  if (ceremony === 'inspect-device-lifecycle') {
    return await withClient(rootVaultHomePath, async (signerClient) => {
      const identityPublicKeyHex = requireFlag(flags, 'identity-public-key');
      const linkClient = await createLifecycleLinkClient(
        flags,
        signerClient,
        vaultSodium,
        identityPublicKeyHex,
      );
      return await readPicoHomeDeviceLifecycle(linkClient, {
        identityKeyFingerprintHex,
        sponsor: { ...sponsor, identityPublicKeyHex },
      }) as unknown as Record<string, unknown>;
    });
  }

  return await withClient(rootVaultHomePath, async (rootClient) => {
    const identityPublicKeyHex = await unlockedIdentityPublicKey(
      rootClient,
      identityKeyFingerprintHex,
    );
    const sponsorVaultHomePath = resolve(
      flags.get('sponsor-vault-home') ?? rootVaultHomePath,
    );
    return await withClient(sponsorVaultHomePath, async (sponsorClient) => {
      const sponsorWithIdentity = { ...sponsor, identityPublicKeyHex };
      const sponsorLinkClient = await createLifecycleLinkClient(
        flags,
        sponsorClient,
        vaultSodium,
        identityPublicKeyHex,
      );

      if (ceremony === 'revoke-device') {
        const reasonCategory = flags.get('reason-category') ?? 'device_retired';
        if (!(picoIdentityRevocationReasonCategories as readonly string[])
          .includes(reasonCategory)) {
          throw new Error('invalid_revocation_reason_category');
        }
        const subject = flags.get('subject') ?? 'delegation';
        if (![
          'delegation',
          'device_signing_key',
          'device_key_agreement_key',
        ].includes(subject)) {
          throw new Error('invalid_revocation_subject');
        }
        return await revokePicoHomeDevice({
          rootClient,
          sponsorLinkClient,
          sodium: vaultSodium,
          identityKeyFingerprintHex,
          sponsor: sponsorWithIdentity,
          targetDelegationId: requireFlag(flags, 'target-delegation-id'),
          subject: subject as
            | 'delegation'
            | 'device_signing_key'
            | 'device_key_agreement_key',
          reasonCategory: reasonCategory as PicoIdentityRevocationReasonCategory,
        }) as unknown as Record<string, unknown>;
      }

      const targetVaultHomePath = resolve(requireFlag(flags, 'target-vault-home'));
      return await withClient(targetVaultHomePath, async (targetClient) => {
        const common = {
          rootClient,
          // ADR 0130 E3. The tool's target vault is on this machine, so its
          // signer is built from the client it already opened; the same
          // ceremony takes one built across a camera.
          target: await picoHomeDeviceTargetSignerFromVault(targetClient, {
            signingKeyFingerprintHex:
              requireFlag(flags, 'target-signing-fingerprint'),
            keyAgreementKeyFingerprintHex:
              requireFlag(flags, 'target-agreement-fingerprint'),
          }),
          sponsorLinkClient,
          sodium: vaultSodium,
          identityKeyFingerprintHex,
          sponsor: sponsorWithIdentity,
          scopes: lifecycleScopes(flags),
          ...(flags.has('valid-from')
            ? { validFrom: requireFlag(flags, 'valid-from') }
            : {}),
          validUntil: requireFlag(flags, 'valid-until'),
        };
        return ceremony === 'enroll-device'
          ? await enrollPicoHomeDevice(common) as unknown as Record<string, unknown>
          : await renewPicoHomeDevice({
            ...common,
            replacedDelegationId: requireFlag(flags, 'target-delegation-id'),
          }) as unknown as Record<string, unknown>;
      });
    });
  });
}

/**
 * ADR 0112 S1: transitional wrappers over the proven ADR 0110 R3 recovery
 * ceremonies. Secrets (PIN, Recovery Phrase, keyfile passphrase) travel only
 * over prompts, never flags; the card wrapper writes the two normative PDFs
 * person-side and prints public metadata only. These are tooling under ADR
 * 0105, not a product surface - the companion (0112 S2/S3) is the real one.
 */
async function runDeviceRecoveryCli(
  ceremony: Extract<
    CeremonySubcommand,
    | 'issue-recovery-card'
    | 'restore-identity'
    | 'initiate-recovery'
    | 'complete-recovery'
    | 'veto-recovery'
  >,
  flags: Map<string, string>,
  rootVaultHomePath: string,
  vaultSodium: VaultSodium,
): Promise<Record<string, unknown>> {
  if (ceremony === 'issue-recovery-card') {
    const outputDir = resolve(requireFlag(flags, 'output-dir'));
    const pin = await readPassphrase(
      'Card PIN (digits and lowercase letters; never printed, never stored): ',
    );
    const pinConfirmation = await readPassphrase('Repeat Card PIN: ');
    if (pin !== pinConfirmation) {
      throw new Error('recovery_pin_mismatch');
    }
    return await withClient(rootVaultHomePath, async (client) => {
      const homeId = requireFlag(flags, 'home-id');
      const card = await client.ceremonyIssueRecoveryCard({
        signerKeyFingerprintHex: requireFlag(flags, 'fingerprint'),
        picoName: requireFlag(flags, 'pico-name'),
        homeNameOrId: flags.get('home-name') ?? homeId,
        homeId,
        homeHostPicoIdentityFingerprintHex:
          requireFlag(flags, 'home-host-identity-fingerprint'),
        hostSigningKeyFingerprintHex: requireFlag(flags, 'host-signing-fingerprint'),
        hostKeyAgreementKeyFingerprintHex: requireFlag(flags, 'host-agreement-fingerprint'),
        hostKeyAgreementPublicKeyHex: requireFlag(flags, 'host-agreement-public-key'),
        endpointHint: requireFlag(flags, 'endpoint-hint'),
        issuedAt: new Date().toISOString(),
        pin,
      }) as unknown as PicoVaultRecoveryCard;
      const pdfs = await generatePicoRecoveryCardPdfs(card);
      mkdirSync(outputDir, { recursive: true, mode: 0o700 });
      const cardPrinterPdfPath = join(outputDir, 'pico-recovery-card-card-printer.pdf');
      const paperPrintablePdfPath = join(outputDir, 'pico-recovery-card-paper-printable.pdf');
      // `mode` only applies when the file is created, so a re-issue over an
      // existing, more permissive file would silently keep those permissions -
      // on a file that is the identity root behind a PIN.
      for (const [pdfPath, bytes] of [
        [cardPrinterPdfPath, pdfs.cardPrinterPdf],
        [paperPrintablePdfPath, pdfs.paperPrintablePdf],
      ] as const) {
        writeFileSync(pdfPath, bytes, { mode: 0o600 });
        chmodSync(pdfPath, 0o600);
      }
      process.stderr.write(
        'These PDFs are your identity root behind the Card PIN (ADR 0110): '
        + 'print and laminate now, then delete both files. Never photograph '
        + 'the back side.\n',
      );
      return {
        identityKeyFingerprintHex: card.payload.identityKeyFingerprintHex,
        picoName: card.payload.picoName,
        homeId: card.payload.homeId,
        issuedAt: card.payload.issuedAt,
        pinProtected: card.payload.pinProtected,
        cardPrinterPdfPath,
        paperPrintablePdfPath,
      };
    });
  }

  if (ceremony === 'restore-identity') {
    const foundationPaths = resolveFoundationPaths(flags, process.env);
    assertVaultCustodyPathSeparation({
      vaultKeyfilePath: rootVaultHomePath,
      foundationDataPath: foundationPaths.foundationDataPath,
      foundationBackupPath: foundationPaths.foundationBackupPath,
    });
    const phrase = await readPassphrase('Recovery Phrase (24 words, one line): ');
    const pin = await readPassphrase('Card PIN: ');
    const passphrase = await readPassphrase(
      'Passphrase for the restored pico_identity keyfile: ',
    );
    const confirmation = await readPassphrase('Repeat passphrase: ');
    if (passphrase !== confirmation) {
      throw new Error('passphrase_mismatch');
    }
    const restored = restorePicoVaultIdentityFromRecovery(vaultSodium, {
      recoveryPhrase: phrase.trim().toLowerCase().split(/\s+/u).join(' '),
      pinProtected: true,
      pin,
      identityKeyFingerprintHex: requireFlag(flags, 'fingerprint'),
      passphrase,
    });
    const path = join(
      rootVaultHomePath,
      'keyfiles',
      `pico_identity-${restored.keyFingerprintHex}.json`,
    );
    writePicoVaultKeyfile(path, restored.keyfile);
    return {
      keyRole: 'pico_identity',
      keyFingerprintHex: restored.keyFingerprintHex,
      publicKeyHex: restored.publicKeyHex,
      path,
    };
  }

  if (ceremony === 'initiate-recovery') {
    return await withClient(rootVaultHomePath, async (rootClient) => {
      const identityKeyFingerprintHex = requireFlag(flags, 'fingerprint');
      const identityPublicKeyHex = await unlockedIdentityPublicKey(
        rootClient,
        identityKeyFingerprintHex,
      );
      const targetVaultHomePath = resolve(requireFlag(flags, 'target-vault-home'));
      return await withClient(targetVaultHomePath, async (targetClient) => {
        const targetLinkClient = await createRecoveryTargetLinkClient(
          flags,
          targetClient,
          vaultSodium,
          identityPublicKeyHex,
        );
        return await initiatePicoHomeDeviceRecovery({
          rootClient,
          targetClient,
          targetLinkClient,
          sodium: vaultSodium,
          homeId: requireFlag(flags, 'home-id'),
          hostSigningKeyFingerprintHex: requireFlag(flags, 'host-signing-fingerprint'),
          hostKeyAgreementKeyFingerprintHex:
            requireFlag(flags, 'host-agreement-fingerprint'),
          identityKeyFingerprintHex,
          targetDelegationId: requireFlag(flags, 'target-delegation-id'),
          targetDeviceSigningKeyFingerprintHex:
            requireFlag(flags, 'target-signing-fingerprint'),
          targetDeviceKeyAgreementKeyFingerprintHex:
            requireFlag(flags, 'target-agreement-fingerprint'),
          ...(flags.has('valid-from')
            ? { validFrom: requireFlag(flags, 'valid-from') }
            : {}),
          validUntil: requireFlag(flags, 'valid-until'),
          ...(flags.has('scopes') ? { scopes: lifecycleScopes(flags) } : {}),
        }) as unknown as Record<string, unknown>;
      });
    });
  }

  if (ceremony === 'complete-recovery') {
    const pending = readRecordFile(
      requireFlag(flags, 'pending-file'),
      'pending_recovery',
    ) as unknown as PicoHomeDeviceRecoveryPendingView;
    return await withClient(rootVaultHomePath, async (targetClient) => {
      const targetLinkClient = await createRecoveryTargetLinkClient(
        flags,
        targetClient,
        vaultSodium,
        requireFlag(flags, 'identity-public-key'),
      );
      return await completePicoHomeDeviceRecovery({
        targetLinkClient,
        pending,
      }) as unknown as Record<string, unknown>;
    });
  }

  return await withClient(rootVaultHomePath, async (livingClient) => {
    const livingDeviceLinkClient = await createLifecycleLinkClient(
      flags,
      livingClient,
      vaultSodium,
      requireFlag(flags, 'identity-public-key'),
    );
    return await vetoPicoHomeDeviceRecovery({
      livingDeviceLinkClient,
      recoveryId: requireFlag(flags, 'recovery-id'),
    }) as unknown as Record<string, unknown>;
  });
}

/**
 * ADR 0110 pins the outer Link sender of a recovery submission to the claim's
 * exact target binding, so the sender is built from the target flags by
 * construction rather than from separate link-* flags that could diverge.
 */
async function createRecoveryTargetLinkClient(
  flags: Map<string, string>,
  targetClient: PicoVaultDaemonClient,
  vaultSodium: VaultSodium,
  identityPublicKeyHex: string,
): Promise<PicoLinkDirectClient> {
  return await createPicoLinkDirectClient({
    sodium: vaultSodium,
    daemonClient: targetClient,
    coreUrl: requireFlag(flags, 'core-url'),
    host: {
      signingPublicKeyHex: requireFlag(flags, 'host-signing-public-key'),
      signingKeyFingerprintHex: requireFlag(flags, 'host-signing-fingerprint'),
      keyAgreementPublicKeyHex: requireFlag(flags, 'host-agreement-public-key'),
      keyAgreementKeyFingerprintHex: requireFlag(flags, 'host-agreement-fingerprint'),
    },
    sender: {
      identityKeyFingerprintHex: requireFlag(flags, 'fingerprint'),
      identityPublicKeyHex,
      deviceSigningKeyFingerprintHex: requireFlag(flags, 'target-signing-fingerprint'),
      deviceKeyAgreementKeyFingerprintHex:
        requireFlag(flags, 'target-agreement-fingerprint'),
      delegationId: requireFlag(flags, 'target-delegation-id'),
    },
  });
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
    case 'refresh-host-pins': {
      // ADR 0115 U4, transitional S1 idiom: verify the Home's continuity
      // chain from this client's existing pins and print the proven head.
      // The daemon is pin-stateless (pins ride flags), so "re-pin" here means
      // handing the caller pins it may now use; the durable profile is the
      // companion's.
      await sodium.ready;
      const refreshed = await refreshPicoHomeHostPins(
        sodium as unknown as VaultSodium,
        {
          coreUrl: requireFlag(invocation.flags, 'core-url'),
          pinnedHostSigningKeyFingerprintHex:
            requireFlag(invocation.flags, 'host-signing-fingerprint'),
          pinnedHostKeyAgreementKeyFingerprintHex:
            requireFlag(invocation.flags, 'host-agreement-fingerprint'),
          pinnedHomeHostPicoIdentityFingerprintHex:
            requireFlag(invocation.flags, 'home-host-pico-fingerprint'),
        },
      );
      process.stdout.write(`${JSON.stringify(refreshed)}\n`);
      if (refreshed.status === 'unverified') {
        // The endpoint claims a head the chain walk could not prove. Staying
        // on the old pin is the safe state; the nonzero exit is the alarm.
        throw new Error('host_pins_unverified');
      }
      if (refreshed.status === 'repinned') {
        process.stderr.write(
          'Host keys rotated: re-pin this device with the printed head and '
          + 'treat printed Recovery Cards for the old keys as stale (ADR '
          + '0110/0115).\n',
        );
      }
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
      if (
        invocation.ceremony === 'issue-recovery-card'
        || invocation.ceremony === 'restore-identity'
        || invocation.ceremony === 'initiate-recovery'
        || invocation.ceremony === 'complete-recovery'
        || invocation.ceremony === 'veto-recovery'
      ) {
        const result = await runDeviceRecoveryCli(
          invocation.ceremony,
          invocation.flags,
          vaultHomePath,
          sodium as unknown as VaultSodium,
        );
        process.stdout.write(`${JSON.stringify(result)}\n`);
        return;
      }
      if (
        invocation.ceremony === 'enroll-device'
        || invocation.ceremony === 'renew-device'
        || invocation.ceremony === 'revoke-device'
        || invocation.ceremony === 'inspect-device-lifecycle'
      ) {
        const result = await runDeviceLifecycleCli(
          invocation.ceremony,
          invocation.flags,
          vaultHomePath,
          sodium as unknown as VaultSodium,
        );
        process.stdout.write(`${JSON.stringify(result)}\n`);
        return;
      }
      if (invocation.ceremony === 'create-domain') {
        const domain = await withClient(vaultHomePath, async (client) => {
          const coreUrl = requireFlag(invocation.flags, 'core-url');
          const run = async (
            linkSignerClient: PicoVaultDaemonClient,
            identityPublicKeyHex?: string,
          ) => await runCreateDomainCeremony({
            client,
            vaultSodium: sodium as unknown as VaultSodium,
            coreUrl,
            session: transportRequiresSession(invocation.flags)
              ? requireFlag(invocation.flags, 'session')
              : undefined,
            linkClient: await createCeremonyLinkClient(
              invocation.flags,
              linkSignerClient,
              sodium as unknown as VaultSodium,
              coreUrl,
              identityPublicKeyHex === undefined
                ? undefined
                : {
                  identityKeyFingerprintHex: requireFlag(invocation.flags, 'fingerprint'),
                  identityPublicKeyHex,
                  deviceSigningKeyFingerprintHex:
                    requireFlag(invocation.flags, 'link-signing-fingerprint'),
                  deviceKeyAgreementKeyFingerprintHex:
                    requireFlag(invocation.flags, 'link-agreement-fingerprint'),
                  delegationId: requireFlag(invocation.flags, 'link-delegation-id'),
                },
            ),
            signerKeyFingerprintHex: requireFlag(invocation.flags, 'fingerprint'),
            agreementKeyFingerprintHex: requireFlag(invocation.flags, 'agreement-fingerprint'),
            domainId: requireFlag(invocation.flags, 'domain-id'),
            lifecycleOrder: invocation.flags.get('lifecycle-order') ?? 'seq:0000000000000001',
          });

          const linkVaultHome = invocation.flags.get('link-vault-home');
          if (linkVaultHome === undefined) {
            return await run(client);
          }
          if (ceremonyTransport(invocation.flags) !== 'link') {
            throw new Error('link_vault_home_requires_link_transport');
          }
          const identityPublicKeyHex = await unlockedIdentityPublicKey(
            client,
            requireFlag(invocation.flags, 'fingerprint'),
          );
          return await withClient(
            resolve(linkVaultHome),
            async (linkSignerClient) => await run(
              linkSignerClient,
              identityPublicKeyHex,
            ),
          );
        });
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
        const delegation = await withClient(vaultHomePath, async (client) => await runPicoDelegateDeviceCeremony({
          announce: announceOnTerminal,
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
      if (invocation.ceremony === 'rotate-host-key') {
        const reasonFlag = invocation.flags.get('reason') ?? 'host_key_rotated';
        if (!(picoHomeContinuityReasonCategories as readonly string[]).includes(reasonFlag)) {
          throw new Error('invalid_continuity_reason');
        }
        if (ceremonyTransport(invocation.flags) !== 'link') {
          // Rotation is carried by the founder's own authenticated device;
          // there is no local path to a Home's host keys on purpose.
          throw new Error('rotate_host_key_requires_link_transport');
        }
        const rotated = await withClient(vaultHomePath, async (client) => {
          const coreUrl = requireFlag(invocation.flags, 'core-url');
          const linkClient = await createCeremonyLinkClient(
            invocation.flags,
            client,
            sodium as unknown as VaultSodium,
            coreUrl,
          );
          if (linkClient === undefined) {
            throw new Error('rotate_host_key_requires_link_transport');
          }
          return await runRotateHostKeyCeremony({
            client,
            linkClient,
            signerKeyFingerprintHex: requireFlag(invocation.flags, 'fingerprint'),
            pinnedHostSigningKeyFingerprintHex:
              requireFlag(invocation.flags, 'host-signing-fingerprint'),
            reasonCategory: reasonFlag as PicoHomeContinuityReasonCategory,
          });
        });
        process.stdout.write(`${JSON.stringify(rotated)}\n`);
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
        const issued = await withClient(vaultHomePath, async (client) => {
          const coreUrl = requireFlag(invocation.flags, 'core-url');
          return await runIssueMembershipCeremony({
            client,
            coreUrl,
            session: transportRequiresSession(invocation.flags)
              ? requireFlag(invocation.flags, 'session')
              : undefined,
            linkClient: await createCeremonyLinkClient(
              invocation.flags,
              client,
              sodium as unknown as VaultSodium,
              coreUrl,
            ),
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
          });
        });
        process.stdout.write(`${JSON.stringify(issued)}\n`);
        return;
      }
      if (invocation.ceremony === 'publish-checkpoint') {
        const statusFlag = invocation.flags.get('status') ?? 'current';
        if (!(picoIdentityReaderKeyFreshnessStatuses as readonly string[]).includes(statusFlag)) {
          throw new Error('invalid_checkpoint_status');
        }
        const published = await withClient(vaultHomePath, async (client) => {
          const coreUrl = requireFlag(invocation.flags, 'core-url');
          return await runPublishCheckpointCeremony({
            client,
            coreUrl,
            session: transportRequiresSession(invocation.flags)
              ? requireFlag(invocation.flags, 'session')
              : undefined,
            linkClient: await createCeremonyLinkClient(
              invocation.flags,
              client,
              sodium as unknown as VaultSodium,
              coreUrl,
            ),
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
          });
        });
        process.stdout.write(`${JSON.stringify(published)}\n`);
        return;
      }
      if (invocation.ceremony === 'rotate-domain') {
        const rotation = await withClient(vaultHomePath, async (client) => {
          const coreUrl = requireFlag(invocation.flags, 'core-url');
          return await runRotateDomainCeremony({
            client,
            vaultSodium: sodium as unknown as VaultSodium,
            coreUrl,
            session: transportRequiresSession(invocation.flags)
              ? requireFlag(invocation.flags, 'session')
              : undefined,
            linkClient: await createCeremonyLinkClient(
              invocation.flags,
              client,
              sodium as unknown as VaultSodium,
              coreUrl,
            ),
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
          });
        });
        process.stdout.write(`${JSON.stringify(rotation)}\n`);
        return;
      }
      if (invocation.ceremony === 'grant-reader') {
        const grant = await withClient(vaultHomePath, async (client) => {
          const coreUrl = requireFlag(invocation.flags, 'core-url');
          return await runGrantReaderCeremony({
            client,
            coreUrl,
            session: transportRequiresSession(invocation.flags)
              ? requireFlag(invocation.flags, 'session')
              : undefined,
            linkClient: await createCeremonyLinkClient(
              invocation.flags,
              client,
              sodium as unknown as VaultSodium,
              coreUrl,
            ),
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
          });
        });
        process.stdout.write(`${JSON.stringify(grant)}\n`);
        return;
      }
      if (invocation.ceremony !== 'claim-home') {
        throw new Error('unknown_ceremony');
      }
      const founding = await withClient(vaultHomePath, async (client) => {
        const coreUrl = requireFlag(invocation.flags, 'core-url');
        const firstDeviceSigningKeyFingerprintHex = invocation.flags.get('signing-fingerprint')
          ?? requireFlag(invocation.flags, 'link-signing-fingerprint');
        const firstDeviceKeyAgreementKeyFingerprintHex =
          invocation.flags.get('agreement-fingerprint')
          ?? requireFlag(invocation.flags, 'link-agreement-fingerprint');
        const firstDeviceDelegationId =
          `delegation_${Buffer.from(sodium.randombytes_buf(16)).toString('hex')}`;
        return await runPicoClaimHomeCeremony({
          announce: announceOnTerminal,
          client,
          vaultSodium: sodium as unknown as VaultSodium,
          coreUrl,
          linkClient: await createCeremonyLinkClient(
            invocation.flags,
            client,
            sodium as unknown as VaultSodium,
            coreUrl,
            {
              identityKeyFingerprintHex: requireFlag(invocation.flags, 'fingerprint'),
              deviceSigningKeyFingerprintHex: firstDeviceSigningKeyFingerprintHex,
              deviceKeyAgreementKeyFingerprintHex:
                firstDeviceKeyAgreementKeyFingerprintHex,
              delegationId: firstDeviceDelegationId,
            },
          ),
          moveInCode: requireFlag(invocation.flags, 'move-in-code'),
          signerKeyFingerprintHex: requireFlag(invocation.flags, 'fingerprint'),
          firstDeviceSigningKeyFingerprintHex,
          firstDeviceKeyAgreementKeyFingerprintHex,
          firstDeviceDelegationId,
          firstDeviceDelegationValidUntil:
            requireFlag(invocation.flags, 'delegation-valid-until'),
          expectedHostSigningKeyFingerprintHex: requireFlag(invocation.flags, 'host-signing-fingerprint'),
          expectedHostKeyAgreementKeyFingerprintHex: requireFlag(invocation.flags, 'host-agreement-fingerprint'),
        });
      });
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
        'usage: pico-vault <daemon|create|status|unlock|lock|sign|refresh-host-pins> '
        + '| pico-vault ceremony <claim-home|create-domain|rotate-domain|grant-reader'
        + '|publish-checkpoint|issue-membership|delegate-device|open-identity-session'
        + '|enroll-device|renew-device|revoke-device|inspect-device-lifecycle'
        + '|issue-recovery-card|restore-identity|initiate-recovery'
        + '|complete-recovery|veto-recovery|rotate-host-key> [flags]\n'
        + '[--vault-home <path>] [--foundation-data <path>] [--foundation-backup <path>] '
        + '[--role <keyRole>] [--fingerprint <hex>]\n',
      );
      process.exit(1);
    },
  );
}

/**
 * ADR 0103 C1. Founds a Pico Home from the person's side.
 *
 * Everything that needs the identity key crosses the daemon socket, so this
 * process never holds a private key. The identity root first delegates to the
 * first device, then signs the claim and founding acceptance; those three
 * authority-creating signatures each raise an approval. The device co-signs
 * the fresh claim bytes operationally, without another approval.
 *
 * The host key fingerprints the person read from the add-on log are compared
 * against what the Foundation serves. That comparison is the whole reason the
 * log prints them: without it, whatever answers on `--core-url` could hand out
 * its own key and receive a claim sealed to itself.
 */

/**
 * The Foundation's refusal is authority, not a transport failure (ADR 0103
 * C4): its `error` is surfaced verbatim and nothing is retried, because a
 * retry would either repeat a spent Move-In Code or hide the reason.
 */


function requireFlag(flags: Map<string, string>, name: string): string {
  const value = flags.get(name);
  if (value === undefined || value.trim() === '') {
    throw new Error(`missing_required_flag:--${name}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ceremonyTransport(flags: Map<string, string>): 'local' | 'link' {
  const transport = flags.get('transport') ?? 'local';
  if (transport !== 'local' && transport !== 'link') {
    throw new Error('invalid_ceremony_transport');
  }
  return transport;
}

function transportRequiresSession(flags: Map<string, string>): boolean {
  return ceremonyTransport(flags) === 'local';
}

async function createCeremonyLinkClient(
  flags: Map<string, string>,
  client: PicoVaultDaemonClient,
  vaultSodium: VaultSodium,
  coreUrl: string,
  senderOverride?: {
    identityKeyFingerprintHex: string;
    identityPublicKeyHex?: string;
    deviceSigningKeyFingerprintHex: string;
    deviceKeyAgreementKeyFingerprintHex: string;
    delegationId: string;
  },
): Promise<PicoLinkDirectClient | undefined> {
  if (ceremonyTransport(flags) === 'local') {
    return undefined;
  }
  if (flags.has('session')) {
    throw new Error('link_transport_does_not_accept_session');
  }

  return await createPicoLinkDirectClient({
    sodium: vaultSodium,
    daemonClient: client,
    coreUrl,
    host: {
      signingPublicKeyHex: requireFlag(flags, 'host-signing-public-key'),
      signingKeyFingerprintHex: requireFlag(flags, 'host-signing-fingerprint'),
      keyAgreementPublicKeyHex: requireFlag(flags, 'host-agreement-public-key'),
      keyAgreementKeyFingerprintHex: requireFlag(flags, 'host-agreement-fingerprint'),
    },
    sender: {
      identityKeyFingerprintHex: senderOverride?.identityKeyFingerprintHex
        ?? requireFlag(flags, 'fingerprint'),
      ...(senderOverride?.identityPublicKeyHex === undefined
        ? {}
        : { identityPublicKeyHex: senderOverride.identityPublicKeyHex }),
      deviceSigningKeyFingerprintHex: senderOverride?.deviceSigningKeyFingerprintHex
        ?? requireFlag(flags, 'link-signing-fingerprint'),
      deviceKeyAgreementKeyFingerprintHex:
        senderOverride?.deviceKeyAgreementKeyFingerprintHex
        ?? requireFlag(flags, 'link-agreement-fingerprint'),
      delegationId: senderOverride?.delegationId
        ?? requireFlag(flags, 'link-delegation-id'),
    },
  });
}

async function createLifecycleLinkClient(
  flags: Map<string, string>,
  signerClient: PicoVaultDaemonClient,
  vaultSodium: VaultSodium,
  identityPublicKeyHex: string,
): Promise<PicoLinkDirectClient> {
  return await createPicoLinkDirectClient({
    sodium: vaultSodium,
    daemonClient: signerClient,
    coreUrl: requireFlag(flags, 'core-url'),
    host: {
      signingPublicKeyHex: requireFlag(flags, 'host-signing-public-key'),
      signingKeyFingerprintHex: requireFlag(flags, 'host-signing-fingerprint'),
      keyAgreementPublicKeyHex: requireFlag(flags, 'host-agreement-public-key'),
      keyAgreementKeyFingerprintHex: requireFlag(flags, 'host-agreement-fingerprint'),
    },
    sender: {
      identityKeyFingerprintHex: requireFlag(flags, 'fingerprint'),
      identityPublicKeyHex,
      deviceSigningKeyFingerprintHex: requireFlag(flags, 'link-signing-fingerprint'),
      deviceKeyAgreementKeyFingerprintHex:
        requireFlag(flags, 'link-agreement-fingerprint'),
      delegationId: requireFlag(flags, 'link-delegation-id'),
    },
  });
}

async function unlockedIdentityPublicKey(
  client: PicoVaultDaemonClient,
  fingerprintHex: string,
): Promise<string> {
  const status = await client.status();
  const identity = status.sessions.find(
    (session) =>
      session.keyRole === 'pico_identity'
      && session.keyFingerprintHex === fingerprintHex,
  );
  if (identity === undefined) {
    throw new Error('lifecycle_identity_key_not_unlocked');
  }
  return identity.publicKeyHex;
}

function lifecycleScopes(flags: Map<string, string>): PicoIdentityDelegationScope[] {
  const scopes = (flags.get('scopes')
    ?? 'surface_session,decrypt_domain,receive_key_envelope')
    .split(',')
    .map((value) => value.trim());
  for (const scope of scopes) {
    if (!(picoIdentityDelegationScopes as readonly string[]).includes(scope)) {
      throw new Error(`invalid_delegation_scope:${scope}`);
    }
  }
  if (!scopes.includes('surface_session')) {
    throw new Error('device_lifecycle_requires_surface_session');
  }
  return scopes as PicoIdentityDelegationScope[];
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
  session?: string;
  linkClient?: PicoLinkDirectClient;
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
    input.linkClient,
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
    input.linkClient,
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
  session?: string;
  linkClient?: PicoLinkDirectClient;
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
    input.linkClient,
  ) as Record<string, unknown>;

  return { accepted, rotationRecord: ceremony.rotationRecord };
}

async function runGrantReaderCeremony(input: {
  client: PicoVaultDaemonClient;
  coreUrl: string;
  session?: string;
  linkClient?: PicoLinkDirectClient;
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
    input.linkClient,
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
  session?: string;
  linkClient?: PicoLinkDirectClient;
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
    input.linkClient,
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
/**
 * ADR 0115 U3. The person-side half of a host-key rotation.
 *
 * The Foundation stages the successor keys and returns a proposal already
 * carrying both host signatures - custody signs what custody holds, so the
 * only signature that can come back from here is the one custody cannot
 * make: the Home Host Pico's acceptance, approval-gated over the ADR 0106
 * statement that names everything the acceptance retires.
 */
async function runRotateHostKeyCeremony(input: {
  client: PicoVaultDaemonClient;
  linkClient: PicoLinkDirectClient;
  signerKeyFingerprintHex: string;
  pinnedHostSigningKeyFingerprintHex: string;
  reasonCategory: PicoHomeContinuityReasonCategory;
}): Promise<Record<string, unknown>> {
  const status = await input.client.status();
  const signer = status.sessions.find(
    (session) => session.keyFingerprintHex === input.signerKeyFingerprintHex,
  );
  if (signer === undefined || signer.keyRole !== 'pico_identity') {
    throw new Error('continuity_acceptor_not_unlocked');
  }

  const prepared = await input.linkClient.request('home.host.rotation.prepare', {
    reasonCategory: input.reasonCategory,
  });
  if (prepared.outcome !== 'ok') {
    throw new Error(`host_rotation_prepare_rejected:${prepared.outcome}`);
  }
  const proposalKeys = [
    'continuity',
    'outgoingHostSigningKeyRecord',
    'incomingHostSigningKeyRecord',
    'outgoingHostSignatureHex',
    'incomingHostSignatureHex',
  ];
  const resultKeys = Object.keys(prepared.result);
  if (resultKeys.length !== proposalKeys.length
    || proposalKeys.some((key) => !(key in prepared.result))) {
    throw new Error('host_rotation_proposal_malformed');
  }
  const proposal = prepared.result as unknown as {
    continuity: PicoHomeContinuitySignatureInput;
    outgoingHostSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
    incomingHostSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
    outgoingHostSignatureHex: string;
    incomingHostSignatureHex: string;
  };
  // The acceptance about to be approved must be this root's to give, and it
  // must retire exactly the keys this client is pinned to - a proposal that
  // retires anything else is asking the person to approve a rotation of a
  // Home they never trusted under that key.
  if (proposal.continuity.homeHostPicoIdentityFingerprintHex
    !== signer.keyFingerprintHex) {
    throw new Error('host_rotation_acceptor_mismatch');
  }
  if (proposal.continuity.outgoingHostSigningKeyFingerprintHex
    !== input.pinnedHostSigningKeyFingerprintHex) {
    throw new Error('host_rotation_retires_unpinned_key');
  }

  process.stderr.write(
    'Approve the host-key rotation on the terminal holding the identity '
    + 'unlock. Approving retires the current host keys and makes every '
    + 'printed Recovery Card stale.\n',
  );
  const acceptance = await input.client.sign({
    keyFingerprintHex: signer.keyFingerprintHex,
    label: picoHomeSignatureInputLabels.continuity,
    fields: proposal.continuity as unknown as Record<string, unknown>,
  });

  const submitted = await input.linkClient.request('home.host.continuity.submit', {
    record: {
      schema: picoHomeContinuityRecordSchema,
      continuity: proposal.continuity,
      outgoingHostSigningKeyRecord: proposal.outgoingHostSigningKeyRecord,
      incomingHostSigningKeyRecord: proposal.incomingHostSigningKeyRecord,
      homeHostPicoIdentityKeyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'pico_identity',
        publicKeyHex: signer.publicKeyHex,
      },
      outgoingHostSignatureHex: proposal.outgoingHostSignatureHex,
      incomingHostSignatureHex: proposal.incomingHostSignatureHex,
      homeHostPicoSignatureHex: acceptance.signatureHex,
      createdAt: new Date().toISOString(),
    },
  });
  if (submitted.outcome !== 'ok') {
    throw new Error(`host_rotation_submit_rejected:${submitted.outcome}`);
  }

  process.stderr.write(
    'Host keys rotated. Use the printed newHostPublicKeys for every future '
    + 'invocation - the old pins are retired - and re-issue the Recovery '
    + 'Card now (ADR 0110/0115).\n',
  );
  return submitted.result;
}

async function runIssueMembershipCeremony(input: {
  client: PicoVaultDaemonClient;
  coreUrl: string;
  session?: string;
  linkClient?: PicoLinkDirectClient;
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
    input.linkClient,
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
