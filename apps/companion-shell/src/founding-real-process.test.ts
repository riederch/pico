import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import type { VaultSodium } from '@pico/vault';
import {
  foundPicoCompanionHome,
  parsePicoHomeSetupAnnouncement,
} from '@pico/companion/founding';

/**
 * ADR 0130 E2 - a Home founded from the Pico Client, against real processes.
 *
 * **The roadmap's Phase 1 sentence, tested rather than repeated.** It said a
 * Home can only be founded through `pico-vault` today, and that was true: the
 * ceremony lived inside the CLI and nothing else could call it. This drives
 * the companion's founding path against a real Home process and a real vault
 * daemon over its real socket - no CLI anywhere in the walk.
 *
 * The pieces underneath are each proven elsewhere: the daemon's founding
 * bootstrap against a real daemon, the ceremony against real processes. What
 * is proven here is the assembly, which is the part that had no test in every
 * defect found this week.
 */
const children: ChildProcess[] = [];
const dirs: string[] = [];

afterEach(async () => {
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

/** An unclaimed Home, and the boot line a person would copy out of it. */
async function startUnclaimedHome(): Promise<{ coreUrl: string; announcementLine: string }> {
  const port = await freePort();
  const data = tempDirectory('pico-founding-core-');
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
  const announcementLine = output.split('\n')
    .find((line) => line.includes('picoHomeMoveInCode'))!;
  return { coreUrl: `http://127.0.0.1:${port}`, announcementLine };
}

/** A daemon over an empty vault: the state a person founding starts from. */
async function startEmptyDaemon(): Promise<string> {
  const vaultHomePath = tempDirectory('pico-founding-vault-');
  let output = '';
  const child = spawn(process.execPath, [
    CLI, 'daemon',
    '--vault-home', vaultHomePath,
    '--foundation-data', tempDirectory('pico-founding-data-'),
    '--foundation-backup', tempDirectory('pico-founding-backup-'),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  for (const stream of [child.stdout!, child.stderr!]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => { output += chunk; });
  }
  await waitFor(() => output.includes('\n'), 'daemon_start');
  return join(vaultHomePath, 'run', 'daemon.sock');
}

describe('ADR 0130 E2 - founding from the Client, with no CLI in the walk', () => {
  it('founds a Home, writes the profile, and leaves the Home claimed', async () => {
    await sodium.ready;
    const home = await startUnclaimedHome();
    const socketPath = await startEmptyDaemon();
    const profilePath = join(tempDirectory('pico-founding-profile-'), 'profile.json');

    const announcement = parsePicoHomeSetupAnnouncement(home.announcementLine);
    expect(announcement.moveInCode).not.toBe('');

    const announced: string[] = [];
    /**
     * The profile is what makes this device real to everything else in the
     * companion, so it must not exist before the Home has agreed. Observed at
     * the last approval rather than asserted afterwards, because afterwards
     * every ordering looks the same.
     */
    const profileSeenDuringCeremony: boolean[] = [];
    const outcome = await foundPicoCompanionHome({
      socketPath,
      profilePath,
      coreUrl: home.coreUrl,
      announcement,
      passphrase: 'a-passphrase-the-person-chose',
      sodium: sodium as unknown as VaultSodium,
      announce: (step) => {
        announced.push(step);
        profileSeenDuringCeremony.push(existsSync(profilePath));
      },
      // ADR 0099. A window would raise these; here they are answered directly,
      // because what is under test is the walk rather than who says yes.
      decisions: { decideApproval: async () => true },
      delegationValidUntil: '2027-01-01T00:00:00.000Z',
    });

    expect(outcome.homeId).toMatch(/^home_[0-9a-f]{32}$/u);
    expect(outcome.identityKeyFingerprintHex).toMatch(/^[0-9a-f]{64}$/u);

    /**
     * The three moments the ceremony asks about, in order. The CLI wrote these
     * to stderr as sentences about a terminal; a client gets the moments and
     * writes its own words.
     */
    expect(announced).toEqual(['device_delegation', 'home_claim', 'founding_acceptance']);
    expect(profileSeenDuringCeremony).toEqual([false, false, false]);

    // The profile is what makes this device real, and it is written last.
    expect(existsSync(profilePath)).toBe(true);
    const profile = JSON.parse(readFileSync(profilePath, 'utf8')) as {
      coreUrl: string;
      home: { homeHostPicoIdentityFingerprintHex: string };
      host: { signingKeyFingerprintHex: string };
      identity: { keyFingerprintHex: string };
      device: { delegationId: string };
    };
    expect(profile.coreUrl).toBe(home.coreUrl);
    // ADR 0115 U4. Founding is the one moment where the acceptor pin and this
    // device's own identity are the same fingerprint.
    expect(profile.home.homeHostPicoIdentityFingerprintHex)
      .toBe(outcome.identityKeyFingerprintHex);
    expect(profile.identity.keyFingerprintHex).toBe(outcome.identityKeyFingerprintHex);
    // The pins are the person's line, which is also what the ceremony checked
    // the endpoint against.
    expect(profile.host.signingKeyFingerprintHex)
      .toBe(announcement.hostSigningKeyFingerprintHex);

    // No secret anywhere in what this process wrote.
    const written = readFileSync(profilePath, 'utf8');
    expect(written).not.toContain('a-passphrase-the-person-chose');

    /**
     * And the Home is founded rather than merely spoken to: setup mode closes
     * once somebody has claimed it, which is what makes the move-in code a
     * one-time door rather than a standing one.
     */
    const setup = await fetch(`${home.coreUrl}/api/home/setup`);
    expect(setup.status).toBe(404);
  }, 180_000);

  it('refuses a Home somebody already founded, without touching the vault', async () => {
    /**
     * The second person to paste the same line meets a Home that has no setup
     * mode left. The refusal has to arrive before anything is written, because
     * a device that made keys for a Home it never joined would look founded to
     * everything except the Home.
     */
    await sodium.ready;
    const home = await startUnclaimedHome();
    const announcement = parsePicoHomeSetupAnnouncement(home.announcementLine);

    const first = await foundPicoCompanionHome({
      socketPath: await startEmptyDaemon(),
      profilePath: join(tempDirectory('pico-founding-profile-'), 'profile.json'),
      coreUrl: home.coreUrl,
      announcement,
      passphrase: 'a-passphrase-the-person-chose',
      sodium: sodium as unknown as VaultSodium,
      decisions: { decideApproval: async () => true },
      delegationValidUntil: '2027-01-01T00:00:00.000Z',
    });
    expect(first.homeId).toMatch(/^home_/u);

    const secondProfile = join(tempDirectory('pico-founding-profile-'), 'profile.json');
    await expect(foundPicoCompanionHome({
      socketPath: await startEmptyDaemon(),
      profilePath: secondProfile,
      coreUrl: home.coreUrl,
      announcement,
      passphrase: 'another-passphrase',
      sodium: sodium as unknown as VaultSodium,
      decisions: { decideApproval: async () => true },
      delegationValidUntil: '2027-01-01T00:00:00.000Z',
    })).rejects.toThrow();

    expect(existsSync(secondProfile)).toBe(false);
  }, 180_000);
});

describe('the line a person copies out of their Home', () => {
  it('reads the fields the ceremony pins against', () => {
    const line = JSON.stringify({
      level: 40,
      picoHomeMoveInCode: 'a-move-in-code',
      hostSigningKeyFingerprintHex: 'a'.repeat(64),
      hostSigningPublicKeyHex: 'b'.repeat(64),
      hostKeyAgreementKeyFingerprintHex: 'c'.repeat(64),
      hostKeyAgreementPublicKeyHex: 'd'.repeat(64),
      msg: 'Pico Home is waiting for its first Pico.',
    });
    expect(parsePicoHomeSetupAnnouncement(line)).toEqual({
      moveInCode: 'a-move-in-code',
      hostSigningKeyFingerprintHex: 'a'.repeat(64),
      hostSigningPublicKeyHex: 'b'.repeat(64),
      hostKeyAgreementKeyFingerprintHex: 'c'.repeat(64),
      hostKeyAgreementPublicKeyHex: 'd'.repeat(64),
    });
  });

  it('tells a claimed Home apart from something that is not a Home log', () => {
    // Two different situations that send a person to two different places: a
    // Home already claimed, and a line pasted from somewhere else entirely.
    expect(() => parsePicoHomeSetupAnnouncement(JSON.stringify({ msg: 'Pico Home Core starting' })))
      .toThrow('pico_home_setup_announcement_has_no_move_in_code');
    expect(() => parsePicoHomeSetupAnnouncement('not json at all'))
      .toThrow('invalid_pico_home_setup_announcement');
  });

  it('refuses a line whose pins are not pins', () => {
    // The fingerprints are the whole point of pasting a line rather than
    // trusting the endpoint, so a malformed one is refused by name.
    const line = JSON.stringify({
      picoHomeMoveInCode: 'a-move-in-code',
      hostSigningKeyFingerprintHex: 'too-short',
      hostSigningPublicKeyHex: 'b'.repeat(64),
      hostKeyAgreementKeyFingerprintHex: 'c'.repeat(64),
      hostKeyAgreementPublicKeyHex: 'd'.repeat(64),
    });
    expect(() => parsePicoHomeSetupAnnouncement(line))
      .toThrow('invalid_pico_home_setup_announcement_field:hostSigningKeyFingerprintHex');
  });
});
