import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import type { VaultSodium } from '@pico/vault';
import { picoFoundationRequest } from '@pico/vault-daemon/claim-home-ceremony';
import {
  issuePicoCompanionMembership,
  readPicoCompanionHomeMembers,
  rotatePicoCompanionHostKeys,
} from '@pico/companion/home-authority';
import {
  foundPicoCompanionHome,
  parsePicoHomeSetupAnnouncement,
} from '@pico/companion/founding';
import { readPicoCompanionProfile } from '@pico/companion/profile';
import { createPicoCompanionLinkClient } from '@pico/companion/recovery-controller';
import {
  openPicoCompanionVaultProductSession,
  type PicoCompanionVaultProductSession,
} from '@pico/companion/vault-product-session';

/**
 * ADR 0130 E4 - what the Home Host Pico decides about the Home itself, from
 * the Client and against real processes.
 *
 * Two ceremonies that lived inside `pico-vault` behind sixteen flags each.
 * What is proved here is the assembly and the consequence: after a rotation
 * this device answers under the new host key and *cannot* answer under the
 * old one, and a membership this device issued is one the Home holds.
 */
const children: ChildProcess[] = [];
const dirs: string[] = [];
const sessions: PicoCompanionVaultProductSession[] = [];

afterEach(async () => {
  for (const session of sessions.splice(0)) {
    await session.close().catch(() => undefined);
  }
  for (const child of children.splice(0)) {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      child.once('exit', resolve);
      setTimeout(resolve, 4_000);
    });
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const CLI = join(import.meta.dirname, '..', '..', 'vault-daemon', 'dist', 'cli.js');
const CORE = join(import.meta.dirname, '..', '..', 'core', 'dist', 'index.js');
const passphrase = 'a-passphrase-the-person-chose';

function tempDirectory(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('no_port'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timeout:${label}`);
}

async function startUnclaimedHome(): Promise<{ coreUrl: string; announcementLine: string }> {
  const port = await freePort();
  const data = tempDirectory('pico-e4-core-');
  let output = '';
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
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  for (const stream of [child.stdout!, child.stderr!]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => { output += chunk; });
  }
  await waitFor(
    () => output.includes('picoHomeMoveInCode') && output.includes('Server listening at'),
    'core_start',
  );
  return {
    coreUrl: `http://127.0.0.1:${port}`,
    announcementLine: output.split('\n').find((line) => line.includes('picoHomeMoveInCode'))!,
  };
}

async function startEmptyDaemon(): Promise<string> {
  const vaultHomePath = tempDirectory('pico-e4-vault-');
  let output = '';
  const child = spawn(process.execPath, [
    CLI, 'daemon',
    '--vault-home', vaultHomePath,
    '--foundation-data', tempDirectory('pico-e4-data-'),
    '--foundation-backup', tempDirectory('pico-e4-backup-'),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  for (const stream of [child.stdout!, child.stderr!]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => { output += chunk; });
  }
  await waitFor(() => output.includes('\n'), 'daemon_start');
  return join(vaultHomePath, 'run', 'daemon.sock');
}

async function foundedDevice(): Promise<{
  profilePath: string;
  session: PicoCompanionVaultProductSession;
}> {
  const home = await startUnclaimedHome();
  const socketPath = await startEmptyDaemon();
  const profilePath = join(tempDirectory('pico-e4-profile-'), 'profile.json');
  await foundPicoCompanionHome({
    socketPath,
    profilePath,
    coreUrl: home.coreUrl,
    announcement: parsePicoHomeSetupAnnouncement(home.announcementLine),
    passphrase,
    sodium: sodium as unknown as VaultSodium,
    decisions: { decideApproval: async () => true },
    delegationValidUntil: '2027-01-01T00:00:00.000Z',
  });
  const profile = readPicoCompanionProfile(profilePath);
  const session = await openPicoCompanionVaultProductSession({
    socketPath,
    unlock: [
      {
        keyRole: 'pico_identity',
        keyFingerprintHex: profile.identity.keyFingerprintHex,
        passphrase,
      },
      {
        keyRole: 'device_signing',
        keyFingerprintHex: profile.device.signingKeyFingerprintHex,
        passphrase,
      },
      {
        keyRole: 'device_key_agreement',
        keyFingerprintHex: profile.device.keyAgreementKeyFingerprintHex,
        passphrase,
      },
    ],
    decisions: { decideApproval: async () => true },
  });
  sessions.push(session);
  return { profilePath, session };
}

describe('ADR 0130 E4 - the Home’s own keys, and who else lives in it', () => {
  it('rotates the host keys and re-pins this device onto the proven chain', async () => {
    await sodium.ready;
    const { profilePath, session } = await foundedDevice();
    const before = readPicoCompanionProfile(profilePath);

    /**
     * The same call, before anything rotates. Without it the refusal at the
     * end of this test proves nothing: a client built from these pins might
     * have been refused for any reason at all, and "it stopped working" is
     * only interesting once "it worked" has been shown.
     */
    const beforeClient = await createPicoCompanionLinkClient({
      profile: before,
      daemonClient: session.consumerClient,
      sodium: sodium as unknown as VaultSodium,
    });
    expect((await beforeClient.request('home.device.lifecycle.read', {})).outcome).toBe('ok');

    const rotated = await rotatePicoCompanionHostKeys({
      profile: before,
      profilePath,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: beforeClient,
      sodium: sodium as unknown as VaultSodium,
      reason: 'host_key_rotated',
    });

    expect(rotated.retiredHostSigningKeyFingerprintHex)
      .toBe(before.host.signingKeyFingerprintHex);
    expect(rotated.hostSigningKeyFingerprintHex)
      .not.toBe(before.host.signingKeyFingerprintHex);
    // Not a courtesy: a device left pinned to a key its own Home retired
    // makes the next ordinary read look like an attack (ADR 0115 U4).
    expect(rotated.repinned).toBe(true);

    const after = readPicoCompanionProfile(profilePath);
    expect(after.host.signingKeyFingerprintHex).toBe(rotated.hostSigningKeyFingerprintHex);
    expect(after.home.homeHostPicoIdentityFingerprintHex)
      .toBe(before.home.homeHostPicoIdentityFingerprintHex);

    // The new era answers.
    const nowClient = await createPicoCompanionLinkClient({
      profile: after,
      daemonClient: session.consumerClient,
      sodium: sodium as unknown as VaultSodium,
    });
    expect((await nowClient.request('home.device.lifecycle.read', {})).outcome).toBe('ok');

    /**
     * **And the old one does not.** This is the assertion that separates a
     * rotation from a record about a rotation: a Home that still answered
     * under the retired key would have changed nothing that matters.
     */
    await expect((async () => {
      const stale = await createPicoCompanionLinkClient({
        profile: before,
        daemonClient: session.consumerClient,
        sodium: sodium as unknown as VaultSodium,
      });
      return await stale.request('home.device.lifecycle.read', {});
    })()).rejects.toThrow();
  }, 300_000);

  it('admits another Pico, and the Home holds what this device signed', async () => {
    await sodium.ready;
    const { profilePath, session } = await foundedDevice();
    const profile = readPicoCompanionProfile(profilePath);
    const linkClient = await createPicoCompanionLinkClient({
      profile,
      daemonClient: session.consumerClient,
      sodium: sodium as unknown as VaultSodium,
    });
    const subject = 'ab'.repeat(32);

    const membership = await issuePicoCompanionMembership({
      profile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: linkClient,
      sodium: sodium as unknown as VaultSodium,
      subjectPicoIdentityFingerprintHex: subject,
      validUntil: '2027-01-01T00:00:00.000Z',
    });
    expect(membership.credentialId).toMatch(/^membership_[0-9a-f]{32}$/u);

    /**
     * Read back from the Home rather than believed: the subject signs
     * nothing, so the only evidence that a membership exists is that the Home
     * says so. This read did not exist over Link until this block - a surface
     * that admits somebody and cannot then show who is in cannot check its
     * own work.
     */
    const listed = await picoFoundationRequest(
      profile.coreUrl,
      '/api/home/memberships',
      undefined,
      undefined,
      linkClient,
    );
    expect(JSON.stringify(listed)).toContain(subject);

    const members = await readPicoCompanionHomeMembers({ profile, livingDeviceLinkClient: linkClient });
    // Two rows: the founder's own membership is the founding record, and the
    // one this device just issued.
    expect(members.filter((member) => member.isThisIdentity)).toHaveLength(1);
    /**
     * The founder's own membership has no end date, and it comes back as
     * `null` rather than as a date far away. A Home whose owner's place in it
     * expired would be a Home nobody could get back into.
     */
    expect(members.find((member) => member.isThisIdentity)?.validUntil).toBeNull();
    expect(members.find((member) => member.isThisIdentity)?.role).toBe('home_host');
    const admitted = members.find(
      (member) => member.picoIdentityFingerprintHex === subject,
    );
    expect(admitted?.role).toBe('home_member');
    expect(admitted?.status).toBe('active');
    expect(admitted?.validUntil).toBe('2027-01-01T00:00:00.000Z');
  }, 300_000);

  it('refuses to make this identity a member of its own Home', async () => {
    /**
     * The founding record is the Home Host Pico's own membership, and the
     * Home refuses to re-issue it. Refusing here means the person is told
     * what is true - they are already the person whose Home this is - rather
     * than reading a rejected credential.
     */
    await sodium.ready;
    const { profilePath, session } = await foundedDevice();
    const profile = readPicoCompanionProfile(profilePath);
    const linkClient = await createPicoCompanionLinkClient({
      profile,
      daemonClient: session.consumerClient,
      sodium: sodium as unknown as VaultSodium,
    });

    await expect(issuePicoCompanionMembership({
      profile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: linkClient,
      sodium: sodium as unknown as VaultSodium,
      subjectPicoIdentityFingerprintHex: profile.identity.keyFingerprintHex,
      validUntil: '2027-01-01T00:00:00.000Z',
    })).rejects.toThrow('subject_is_this_identity');

    await expect(issuePicoCompanionMembership({
      profile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: linkClient,
      sodium: sodium as unknown as VaultSodium,
      subjectPicoIdentityFingerprintHex: 'not-a-fingerprint',
      validUntil: '2027-01-01T00:00:00.000Z',
    })).rejects.toThrow('invalid_pico_companion_membership_subject');
  }, 300_000);
});
