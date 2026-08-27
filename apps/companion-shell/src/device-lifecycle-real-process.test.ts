import { picoTestValidityWindow } from '@pico/protocol';
// The window never sees the core's rows: the main process renders them on
// their way across (ADR 0113 C2), and a test that skipped that step would be
// checking a shape nobody is shown.
import { picoCompanionRenderedDeviceAuthority } from './rendered-rows.js';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import type { VaultSodium } from '@pico/vault';
import {
  readPicoCompanionDeviceAuthority,
  renewPicoCompanionDeviceAuthority,
  revokePicoCompanionDeviceAuthority,
} from '@pico/companion/device-lifecycle';
import {
  foundPicoCompanionHome,
  parsePicoHomeSetupAnnouncement,
} from '@pico/companion/founding';
import {
  announcePicoCompanionPresence,
  readPicoCompanionDevices,
} from '@pico/companion/presence';
import { readPicoCompanionProfile } from '@pico/companion/profile';
import { createPicoCompanionLinkClient } from '@pico/companion/recovery-controller';
import {
  openPicoCompanionVaultProductSession,
  type PicoCompanionVaultProductSession,
} from '@pico/companion/vault-product-session';
import {
  picoCompanionDeviceAuthorityEndedLine,
  picoCompanionDeviceAuthorityLines,
  picoCompanionDeviceAuthoritySummary,
} from './contract.js';

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
 * ADR 0130 E3 - which devices a Home answers to, and ending one, against real
 * processes and with no CLI in the walk.
 *
 * **The read was already happening and the answer was being thrown away.**
 * ADR 0112's alarm carrier polls this exact endpoint on a schedule and keeps
 * three fields from it; the device list came back every time and had nowhere
 * to go. So "which machines can act as me" was a question only
 * `pico-vault inspect-device-lifecycle` could answer, and ending one - the
 * moment a person is in when a laptop is gone - meant argument parsing.
 *
 * What is proven here is the assembly against a real Home and a real vault
 * daemon over its socket: the read, the approval-gated signature, the
 * submission, and the consequence. The last one is the reason this cannot be
 * a unit test: ending a device's authority ends its ability to ask what
 * happened, and that is a property of a running Home rather than of a mock.
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
  const data = tempDirectory('pico-e3-core-');
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
  const vaultHomePath = tempDirectory('pico-e3-vault-');
  let output = '';
  const child = spawn(process.execPath, [
    CLI, 'daemon',
    '--vault-home', vaultHomePath,
    '--foundation-data', tempDirectory('pico-e3-data-'),
    '--foundation-backup', tempDirectory('pico-e3-backup-'),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  for (const stream of [child.stdout!, child.stderr!]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => { output += chunk; });
  }
  await waitFor(() => output.includes('\n'), 'daemon_start');
  return join(vaultHomePath, 'run', 'daemon.sock');
}

const passphrase = 'a-passphrase-the-person-chose';

/**
 * A founded device, with the session a window would be holding open.
 *
 * `onApproval` counts what the session is asked *after* founding - the
 * founding ceremony's own three approvals go through a session this one does
 * not share, so a test can tell "nobody was asked" from "somebody was".
 */
async function foundedDevice(onApproval: () => void = () => undefined): Promise<{
  profilePath: string;
  session: PicoCompanionVaultProductSession;
}> {
  const home = await startUnclaimedHome();
  const socketPath = await startEmptyDaemon();
  const profilePath = join(tempDirectory('pico-e3-profile-'), 'profile.json');
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
    // ADR 0099. A window raises these; here they are answered directly,
    // because what is under test is the walk rather than who says yes.
    decisions: {
      decideApproval: async () => {
        onApproval();
        return true;
      },
    },
  });
  sessions.push(session);
  return { profilePath, session };
}

describe('ADR 0130 E3 - the device lifecycle from the Client', () => {
  it('says which devices the Home answers to, in one row that is this one', async () => {
    await sodium.ready;
    const { profilePath, session } = await foundedDevice();
    const profile = readPicoCompanionProfile(profilePath);

    const linkClient = await createPicoCompanionLinkClient({
      profile,
      daemonClient: session.consumerClient,
      sodium: sodium as unknown as VaultSodium,
    });
    const view = await readPicoCompanionDeviceAuthority({
      profile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: linkClient,
    });

    expect(view.devices).toHaveLength(1);
    const [device] = view.devices;
    expect(device?.status).toBe('active');
    expect(device?.delegationId).toBe(profile.device.delegationId);
    expect(device?.isThisDevice).toBe(true);
    /**
     * The join with ADR 0126's presences, against a presence the Home
     * actually holds.
     *
     * **Asserting it against `picoCompanionPresenceId(profile)` was the first
     * version and it proved nothing**: both sides call that function, so
     * changing the derivation changed the expectation with it - a comparison
     * of a constant with itself. Planting a shorter id passed. What can
     * really drift is which *key* each side derives from, and only a presence
     * that went to the Home and came back can catch that.
     */
    expect(await announcePicoCompanionPresence({
      livingDeviceLinkClient: linkClient,
      profile,
      probe: { canScanWithCamera: () => false, canPrint: () => false },
    })).toEqual({ ok: true });
    const presences = await readPicoCompanionDevices({ livingDeviceLinkClient: linkClient });
    expect(presences.map((presence) => presence.presenceId)).toContain(device?.presenceId);
    // The founding device holds the identity key, which is what makes ending
    // an authority possible from here at all.
    expect(view.mayEndAuthority).toBe(true);

    const [line] = picoCompanionDeviceAuthorityLines(picoCompanionRenderedDeviceAuthority(view));
    expect(line?.headline).toBe('This device');
    // Der Tag, den die Bevollmächtigung wirklich trägt - aus derselben
    // Konstante, aus der sie gebaut wurde. Ein abgeschriebenes Datum sagte
    // dasselbe nur so lange, wie beide zufällig übereinstimmten.
    expect(line?.detail).toContain(VALID_UNTIL.slice(0, 10));
    expect(line?.endLabel).not.toBeNull();
    // One device, and the sentence says what ending it costs before it is
    // ended rather than afterwards.
    expect(line?.endWarning).toContain('only device');
    expect(picoCompanionDeviceAuthoritySummary(picoCompanionRenderedDeviceAuthority(view)))
      .toBe('Your Home answers to one device.');
  }, 180_000);

  it('renews this device, and the old authority stops working', async () => {
    /**
     * ADR 0104 pins a year. Without this, every device stops on a date the
     * window shows and nothing can extend it - and renewal is exactly the
     * thing that stops being possible once it has run out: the ceremony wants
     * the delegation active, and so does the Link request that carries it.
     *
     * **Renewal is replacement.** The new delegation and the revocation of
     * the old one are one transition, which is why the profile has to be
     * rewritten: every Link request this device makes names its delegation
     * id, and a device that kept the old one would have signed itself out of
     * its own Home at the moment it renewed.
     */
    await sodium.ready;
    const { profilePath, session } = await foundedDevice();
    const before = readPicoCompanionProfile(profilePath);
    const beforeClient = await createPicoCompanionLinkClient({
      profile: before,
      daemonClient: session.consumerClient,
      sodium: sodium as unknown as VaultSodium,
    });
    expect((await beforeClient.request('home.device.lifecycle.read', {})).outcome).toBe('ok');

    const renewed = await renewPicoCompanionDeviceAuthority({
      profile: before,
      profilePath,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: beforeClient,
      sodium: sodium as unknown as VaultSodium,
      validUntil: '2028-01-01T00:00:00.000Z',
    });
    expect(renewed.replacedDelegationId).toBe(before.device.delegationId);
    expect(renewed.delegationId).not.toBe(before.device.delegationId);

    const after = readPicoCompanionProfile(profilePath);
    expect(after.device.delegationId).toBe(renewed.delegationId);
    // The keys are the same device's; only the authority over them is new.
    expect(after.device.signingKeyFingerprintHex).toBe(before.device.signingKeyFingerprintHex);

    const view = await readPicoCompanionDeviceAuthority({
      profile: after,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: await createPicoCompanionLinkClient({
        profile: after,
        daemonClient: session.consumerClient,
        sodium: sodium as unknown as VaultSodium,
      }),
    });
    const active = view.devices.filter((device) => device.status === 'active');
    expect(active).toHaveLength(1);
    expect(active[0]?.delegationId).toBe(renewed.delegationId);
    expect(active[0]?.validUntil).toBe('2028-01-01T00:00:00.000Z');
    expect(view.devices.find(
      (device) => device.delegationId === before.device.delegationId,
    )?.status).toBe('revoked');

    /**
     * And the old authority is gone rather than merely superseded - the same
     * shape the host rotation is held to. A Home that still answered the
     * replaced delegation would have renewed nothing.
     */
    await expect(
      beforeClient.request('home.device.lifecycle.read', {}),
    ).rejects.toThrow();
  }, 300_000);

  it('ends a device, and the ending takes the ability to ask with it', async () => {
    await sodium.ready;
    let asked = 0;
    const { profilePath, session } = await foundedDevice(() => { asked += 1; });
    const profile = readPicoCompanionProfile(profilePath);
    const linkClient = await createPicoCompanionLinkClient({
      profile,
      daemonClient: session.consumerClient,
      sodium: sodium as unknown as VaultSodium,
    });

    const ended = await revokePicoCompanionDeviceAuthority({
      profile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: linkClient,
      sodium: sodium as unknown as VaultSodium,
      targetDelegationId: profile.device.delegationId,
      reason: 'lost_device',
    });

    expect(ended.delegationId).toBe(profile.device.delegationId);
    expect(ended.endedThisDevice).toBe(true);
    /**
     * ADR 0130 E3's own condition - *under ADR 0099 approval* - as a number
     * rather than as a claim. It also makes the refusal test below mean
     * something: "nobody was asked" is only a finding if somebody is asked
     * when the ceremony goes through.
     */
    expect(asked).toBeGreaterThan(0);
    /**
     * **The missing count is the proof.** A revocation this device submitted
     * about itself is only real if the Home stops answering it, so the read
     * that follows must fail - and reporting `null` rather than `0` is what
     * keeps "I could not ask" apart from "there is nothing".
     */
    expect(ended.activeDevicesLeft).toBeNull();
    expect(picoCompanionDeviceAuthorityEndedLine(ended))
      .toContain('can no longer ask your Home');

    // Said again as itself: the Home refuses this device now.
    await expect(readPicoCompanionDeviceAuthority({
      profile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: linkClient,
    })).rejects.toThrow();
  }, 180_000);

  it('refuses a delegation the Home does not know, before asking anybody', async () => {
    /**
     * ADR 0099. The refusal has to arrive before the approval: asking a person
     * to approve a signature that will then be refused teaches them that
     * approvals are noise, which is the one thing the gate cannot survive.
     */
    await sodium.ready;
    let asked = 0;
    const { profilePath, session } = await foundedDevice(() => { asked += 1; });
    const profile = readPicoCompanionProfile(profilePath);

    await expect(revokePicoCompanionDeviceAuthority({
      profile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: await createPicoCompanionLinkClient({
        profile,
        daemonClient: session.consumerClient,
        sodium: sodium as unknown as VaultSodium,
      }),
      sodium: sodium as unknown as VaultSodium,
      targetDelegationId: 'delegation_00000000000000000000000000000000',
      reason: 'device_retired',
    })).rejects.toThrow('pico_companion_device_authority_is_unknown');
    expect(asked).toBe(0);
  }, 180_000);
});
