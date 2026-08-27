import { picoTestValidityWindow } from '@pico/protocol';
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
  endPicoCompanionMembership,
  issuePicoCompanionMembership,
  readPicoCompanionHomeMembers,
  rotatePicoCompanionHostKeys,
  readPicoCompanionDomainReadership,
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
 * Ein Jahr ab jetzt, nicht der Neujahrstag 2027.
 *
 * Diese Tests fahren ein echtes Home hoch, das an seiner eigenen Uhr misst.
 * Ein festes Ende hätte sie am 2027-01-01 gemeinsam umgeworfen - dieselbe
 * Sorte Fehlschlag, die am 2026-08-27 drei Tests im Kern erwischt hat, nur
 * vier Monate später und mit neunzehn auf einmal. `pnpm clock:check` stellt
 * die Uhr ein Jahr vor und sucht danach.
 */
const VALID_UNTIL = picoTestValidityWindow().validUntil;

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

async function startUnclaimedHome(): Promise<{
  coreUrl: string;
  announcementLine: string;
  /** Damit ein Test beweisen kann, dass eine Antwort vom Home kam. */
  child: ChildProcess;
}> {
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
    child,
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
  home: ChildProcess;
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
    delegationValidUntil: VALID_UNTIL,
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
  return { profilePath, session, home: home.child };
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
      validUntil: VALID_UNTIL,
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
    expect(admitted?.validUntil).toBe(VALID_UNTIL);
  }, 300_000);

  it('ends a membership, and the Home says so afterwards', async () => {
    /**
     * ADR 0130 E5's first finding, and the reason it came before the domains:
     * there was no ceremony for this anywhere - not here, not among the
     * CLI's eighteen subcommands - and over Link there was not even a path.
     * Somebody could be let in from a person's own device and not let out.
     *
     * Nothing is deleted. The Home keeps every statement and projects the
     * latest one, which is what lets a member who was removed be told apart
     * from one who was never admitted.
     */
    await sodium.ready;
    const { profilePath, session } = await foundedDevice();
    const profile = readPicoCompanionProfile(profilePath);
    const linkClient = await createPicoCompanionLinkClient({
      profile,
      daemonClient: session.consumerClient,
      sodium: sodium as unknown as VaultSodium,
    });
    const subject = 'cd'.repeat(32);

    const membership = await issuePicoCompanionMembership({
      profile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: linkClient,
      sodium: sodium as unknown as VaultSodium,
      subjectPicoIdentityFingerprintHex: subject,
      validUntil: VALID_UNTIL,
    });
    const admitted = (await readPicoCompanionHomeMembers({
      profile,
      livingDeviceLinkClient: linkClient,
    })).find((entry) => entry.picoIdentityFingerprintHex === subject);
    expect(admitted?.status).toBe('active');
    // The credential the statement has to name, which is not the row id.
    expect(admitted?.credentialId).toBe(membership.credentialId);

    const ended = await endPicoCompanionMembership({
      profile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: linkClient,
      sodium: sodium as unknown as VaultSodium,
      credentialId: admitted!.credentialId!,
      subjectPicoIdentityFingerprintHex: subject,
      ending: 'removed',
    });
    expect(ended.status).toBe('revoked');

    const after = await readPicoCompanionHomeMembers({
      profile,
      livingDeviceLinkClient: linkClient,
    });
    const removed = after.find((entry) => entry.picoIdentityFingerprintHex === subject);
    // Still a row, and that is the point: gone is not the same as never here.
    expect(removed?.status).toBe('revoked');
    expect(after.find((entry) => entry.isThisIdentity)?.status).toBe('active');

    /**
     * **What the lifecycle order is for**, and the first version of this test
     * did not touch it: with one statement the Home has nothing to compare,
     * so any order at all would have passed. It decides between statements
     * about the same credential - so a second one rises above the first, and
     * a third carrying an older order changes nothing however late it lands.
     */
    const second = new Date(Date.now() + 60_000);
    await endPicoCompanionMembership({
      profile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: linkClient,
      sodium: sodium as unknown as VaultSodium,
      credentialId: admitted!.credentialId!,
      subjectPicoIdentityFingerprintHex: subject,
      ending: 'security',
      now: () => second,
    });
    expect((await readPicoCompanionHomeMembers({ profile, livingDeviceLinkClient: linkClient }))
      .find((entry) => entry.picoIdentityFingerprintHex === subject)?.status).toBe('evicted');

    await endPicoCompanionMembership({
      profile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: linkClient,
      sodium: sodium as unknown as VaultSodium,
      credentialId: admitted!.credentialId!,
      subjectPicoIdentityFingerprintHex: subject,
      ending: 'removed',
      now: () => new Date(second.getTime() - 30_000),
    });
    expect((await readPicoCompanionHomeMembers({ profile, livingDeviceLinkClient: linkClient }))
      .find((entry) => entry.picoIdentityFingerprintHex === subject)?.status).toBe('evicted');
  }, 300_000);

  it('refuses to end the Home\u2019s own place in itself', async () => {
    await sodium.ready;
    const { profilePath, session } = await foundedDevice();
    const profile = readPicoCompanionProfile(profilePath);
    const linkClient = await createPicoCompanionLinkClient({
      profile,
      daemonClient: session.consumerClient,
      sodium: sodium as unknown as VaultSodium,
    });
    const members = await readPicoCompanionHomeMembers({
      profile,
      livingDeviceLinkClient: linkClient,
    });
    /**
     * The founder's row comes from the founding record rather than from a
     * credential, so there is nothing to end - and a Home whose owner removed
     * themselves would answer to nobody.
     */
    expect(members.find((entry) => entry.isThisIdentity)?.credentialId).toBeNull();
    await expect(endPicoCompanionMembership({
      profile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: linkClient,
      sodium: sodium as unknown as VaultSodium,
      credentialId: 'membership_00000000000000000000000000000000',
      subjectPicoIdentityFingerprintHex: profile.identity.keyFingerprintHex,
      ending: 'removed',
    })).rejects.toThrow('subject_is_this_identity');
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
      validUntil: VALID_UNTIL,
    })).rejects.toThrow('subject_is_this_identity');

    await expect(issuePicoCompanionMembership({
      profile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: linkClient,
      sodium: sodium as unknown as VaultSodium,
      subjectPicoIdentityFingerprintHex: 'not-a-fingerprint',
      validUntil: VALID_UNTIL,
    })).rejects.toThrow('invalid_pico_companion_membership_subject');
  }, 300_000);
});

/**
 * **Eine Falle beim Falsifizieren hier, gefunden am 2026-08-24.**
 *
 * Diese Datei importiert `@pico/companion/*` als *gebautes* Paket - die
 * Exports zeigen auf `dist/`. Wer eine Pflanzung in `apps/companion/src`
 * setzt und den Test laufen lässt, ändert nichts an dem, was der Test lädt,
 * und bekommt Grün. Das liest sich wie „der Test greift ins Leere" und ist in
 * Wahrheit „die Pflanzung ist nie angekommen".
 *
 * `pnpm --filter @pico/companion build` dazwischen, und danach wieder zurück.
 */
describe('ADR 0130 E5 - wer welche Domäne lesen darf', () => {
  it('liest die Leserschaft von einem echten Home, statt sie zu behaupten', async () => {
    await sodium.ready;
    const { profilePath, session, home } = await foundedDevice();
    const profile = readPicoCompanionProfile(profilePath);
    const linkClient = await createPicoCompanionLinkClient({
      profile,
      daemonClient: session.consumerClient,
      sodium: sodium as unknown as VaultSodium,
    });

    /**
     * Zwei Autoritätsressourcen, ein Ergebnis. Der Weg ist nie gelaufen, bevor
     * dieser Block existierte: die Unit-Tests prüfen das Vokabular an
     * Fixtures, und ein Typecheck sagt nichts darüber, ob dieses Gerät die
     * beiden Ressourcen überhaupt lesen darf. Ein frisch gegründetes Home hat
     * keine Domäne, also ist die leere Liste die richtige Antwort - und dass
     * es eine Liste ist statt eines Fehlschlags, ist die Aussage.
     */
    const readership = await readPicoCompanionDomainReadership({
      livingDeviceLinkClient: linkClient,
    });
    expect(Array.isArray(readership)).toBe(true);
    expect(readership).toHaveLength(0);

    /**
     * **Und dass die Antwort vom Home kam.** Eine leere Liste ist genau das,
     * was ein Prüfer auch bekäme, der gar nicht gefragt hat; ohne diese Hälfte
     * wäre der Test über einem Client grün, der nie eine Verbindung aufbaut.
     */
    home.kill('SIGTERM');
    await expect(readPicoCompanionDomainReadership({ livingDeviceLinkClient: linkClient }))
      .rejects.toThrow();
  }, 300_000);
});
