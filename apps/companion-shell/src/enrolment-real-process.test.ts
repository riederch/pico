import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import type { VaultSodium } from '@pico/vault';
import {
  buildPicoDeviceEnrolmentAcceptance,
} from '@pico/protocol/device-enrolment';
import { readPicoCompanionDeviceAuthority } from '@pico/companion/device-lifecycle';
import {
  acceptPicoCompanionEnrolment,
  enrolPicoCompanionDevice,
  offerPicoCompanionEnrolment,
  renewPicoCompanionDeviceOverCodes,
} from '@pico/companion/enrolment';
import {
  foundPicoCompanionHome,
  parsePicoHomeSetupAnnouncement,
} from '@pico/companion/founding';
import {
  readPicoCompanionProfile,
  type PicoCompanionProfile,
} from '@pico/companion/profile';
import { createPicoCompanionLinkClient } from '@pico/companion/recovery-controller';
import {
  openPicoCompanionVaultProductSession,
  type PicoCompanionVaultProductSession,
} from '@pico/companion/vault-product-session';

/**
 * ADR 0130 E3 - a second device joins over camera and code, against real
 * processes.
 *
 * Two vaults, two daemons, one Home, three codes and no CLI. The camera is
 * the one thing not here: what a camera produces is a string, and the string
 * is what this drives. Everything a person would carry between two screens is
 * carried by `exchange` instead, which is the same function the window hands
 * a scanner to.
 *
 * **What only a real Home can prove is the last step.** The new device writes
 * no profile on the strength of having signed something - it waits until the
 * Home answers it as one of its own, and that read is refused until the
 * sponsor's submission lands.
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
const targetPassphrase = 'the-other-machine-has-its-own';

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
  const data = tempDirectory('pico-enrol-core-');
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

async function startEmptyDaemon(label: string): Promise<string> {
  const vaultHomePath = tempDirectory(`pico-enrol-${label}-vault-`);
  let output = '';
  const child = spawn(process.execPath, [
    CLI, 'daemon',
    '--vault-home', vaultHomePath,
    '--foundation-data', tempDirectory(`pico-enrol-${label}-data-`),
    '--foundation-backup', tempDirectory(`pico-enrol-${label}-backup-`),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  for (const stream of [child.stdout!, child.stderr!]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => { output += chunk; });
  }
  await waitFor(() => output.includes('\n'), 'daemon_start');
  return join(vaultHomePath, 'run', 'daemon.sock');
}

/** The device that founded the Home, with the session a window holds open. */
async function sponsorDevice(): Promise<{
  profilePath: string;
  session: PicoCompanionVaultProductSession;
}> {
  const home = await startUnclaimedHome();
  const socketPath = await startEmptyDaemon('sponsor');
  const profilePath = join(tempDirectory('pico-enrol-profile-'), 'profile.json');
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

describe('ADR 0130 E3 - a second device over camera and code', () => {
  it('joins a Home from another device, and the Home answers it', async () => {
    await sodium.ready;
    const { profilePath, session } = await sponsorDevice();
    const sponsorProfile = readPicoCompanionProfile(profilePath);
    const targetSocketPath = await startEmptyDaemon('target');
    const targetProfilePath = join(tempDirectory('pico-enrol-target-'), 'profile.json');

    // The new device, which has never met a Home: two keys and a code.
    const offer = await offerPicoCompanionEnrolment({
      socketPath: targetSocketPath,
      passphrase: targetPassphrase,
    });
    expect(offer.offerCode.startsWith('pico-device-offer-v1:')).toBe(true);

    /**
     * The person, as a function. The window hands this a camera; here it
     * hands the grant to the other device and brings its answer back.
     */
    let accepted: Awaited<ReturnType<typeof acceptPicoCompanionEnrolment>> | null = null;
    let confirming: Promise<PicoCompanionProfile> | null = null;
    let confirmedWhileWaiting = false;
    const enrolled = await enrolPicoCompanionDevice({
      profile: sponsorProfile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: await createPicoCompanionLinkClient({
        profile: sponsorProfile,
        daemonClient: session.consumerClient,
        sodium: sodium as unknown as VaultSodium,
      }),
      sodium: sodium as unknown as VaultSodium,
      offerCode: offer.offerCode,
      validUntil: '2027-01-01T00:00:00.000Z',
      exchange: async (grantCode) => {
        expect(grantCode.startsWith('pico-device-grant-v1:')).toBe(true);
        accepted = await acceptPicoCompanionEnrolment({
          socketPath: targetSocketPath,
          passphrase: targetPassphrase,
          grantCode,
          profilePath: targetProfilePath,
          sodium: sodium as unknown as VaultSodium,
          decisions: { decideApproval: async () => true },
          device: offer.device,
        });
        /**
         * Nothing written yet, and that is the ordering that matters: at this
         * moment the Home has not seen the submission, so a device that
         * believed itself enrolled would be believing its own signature.
         */
        expect(existsSync(targetProfilePath)).toBe(false);

        /**
         * The wait, started before the sponsor has submitted anything - which
         * is where a person actually is: holding a phone that has signed and
         * showing it to a laptop that has not sent yet. It must not finish
         * here, and a `confirm` that returned on its own signature would.
         */
        confirming = accepted.confirm().then((profile) => {
          confirmedWhileWaiting = true;
          return profile;
        });
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        expect(confirmedWhileWaiting).toBe(false);
        expect(existsSync(targetProfilePath)).toBe(false);
        return accepted.acceptanceCode;
      },
    });

    expect(enrolled.targetSigningKeyFingerprintHex)
      .toBe(offer.device.signingKeyFingerprintHex);
    expect(enrolled.delegationId).toMatch(/^delegation_[0-9a-f]{32}$/u);

    const targetProfile = await confirming!;
    expect(existsSync(targetProfilePath)).toBe(true);
    // The same Home, named the same way, without either device asking it.
    expect(targetProfile.coreUrl).toBe(sponsorProfile.coreUrl);
    expect(targetProfile.identity.keyFingerprintHex)
      .toBe(sponsorProfile.identity.keyFingerprintHex);
    expect(targetProfile.host.signingKeyFingerprintHex)
      .toBe(sponsorProfile.host.signingKeyFingerprintHex);
    expect(targetProfile.home.homeHostPicoIdentityFingerprintHex)
      .toBe(sponsorProfile.home.homeHostPicoIdentityFingerprintHex);
    expect(targetProfile.device.delegationId).toBe(enrolled.delegationId);

    // And the sponsor sees two devices, both active.
    const view = await readPicoCompanionDeviceAuthority({
      profile: sponsorProfile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: await createPicoCompanionLinkClient({
        profile: sponsorProfile,
        daemonClient: session.consumerClient,
        sodium: sodium as unknown as VaultSodium,
      }),
    });
    expect(view.devices.filter((device) => device.status === 'active')).toHaveLength(2);
    expect(view.devices.find(
      (device) => device.delegationId === enrolled.delegationId,
    )?.isThisDevice).toBe(false);
  }, 300_000);

  it('holds no identity key, and says so from the new device', async () => {
    /**
     * The branch that had only a unit test until enrolment existed. A
     * delegated device can see every device its Home answers to and can end
     * none of them, because the ceremony is signed by an identity root that
     * stayed on the machine that founded the Home.
     */
    await sodium.ready;
    const { profilePath, session } = await sponsorDevice();
    const sponsorProfile = readPicoCompanionProfile(profilePath);
    const targetSocketPath = await startEmptyDaemon('target');
    const targetProfilePath = join(tempDirectory('pico-enrol-target-'), 'profile.json');

    const offer = await offerPicoCompanionEnrolment({
      socketPath: targetSocketPath,
      passphrase: targetPassphrase,
    });
    let accepted: Awaited<ReturnType<typeof acceptPicoCompanionEnrolment>> | null = null;
    await enrolPicoCompanionDevice({
      profile: sponsorProfile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: await createPicoCompanionLinkClient({
        profile: sponsorProfile,
        daemonClient: session.consumerClient,
        sodium: sodium as unknown as VaultSodium,
      }),
      sodium: sodium as unknown as VaultSodium,
      offerCode: offer.offerCode,
      validUntil: '2027-01-01T00:00:00.000Z',
      exchange: async (grantCode) => {
        accepted = await acceptPicoCompanionEnrolment({
          socketPath: targetSocketPath,
          passphrase: targetPassphrase,
          grantCode,
          profilePath: targetProfilePath,
          sodium: sodium as unknown as VaultSodium,
          decisions: { decideApproval: async () => true },
          device: offer.device,
        });
        return accepted.acceptanceCode;
      },
    });
    const targetProfile = await accepted!.confirm();

    const targetSession = await openPicoCompanionVaultProductSession({
      socketPath: targetSocketPath,
      unlock: [
        {
          keyRole: 'device_signing',
          keyFingerprintHex: targetProfile.device.signingKeyFingerprintHex,
          passphrase: targetPassphrase,
        },
        {
          keyRole: 'device_key_agreement',
          keyFingerprintHex: targetProfile.device.keyAgreementKeyFingerprintHex,
          passphrase: targetPassphrase,
        },
      ],
      decisions: { decideApproval: async () => true },
    });
    sessions.push(targetSession);

    const view = await readPicoCompanionDeviceAuthority({
      profile: targetProfile,
      daemonClient: targetSession.consumerClient,
      livingDeviceLinkClient: await createPicoCompanionLinkClient({
        profile: targetProfile,
        daemonClient: targetSession.consumerClient,
        sodium: sodium as unknown as VaultSodium,
      }),
    });
    expect(view.devices).toHaveLength(2);
    expect(view.devices.find((device) => device.isThisDevice)?.delegationId)
      .toBe(targetProfile.device.delegationId);
    expect(view.mayEndAuthority).toBe(false);
  }, 300_000);

  it('renews the other device over the same three codes', async () => {
    /**
     * Measured against a running Home before this was built: a second device
     * whose year runs out cannot be enrolled again *ever* - the `enroll`
     * transition refuses a target whose keys the Home has known under this
     * identity, before or after a revocation - and it cannot make new keys
     * without its vault being wiped. The Recovery Card needs a fresh vault
     * too and replaces the whole device set behind a 48-hour window. So this
     * is the only path that keeps a second device working, and it has to
     * happen while its authority is still active.
     */
    await sodium.ready;
    const { profilePath, session } = await sponsorDevice();
    const sponsorProfile = readPicoCompanionProfile(profilePath);
    const targetSocketPath = await startEmptyDaemon('target');
    const targetProfilePath = join(tempDirectory('pico-enrol-target-'), 'profile.json');

    const sponsorLink = async () => await createPicoCompanionLinkClient({
      profile: sponsorProfile,
      daemonClient: session.consumerClient,
      sodium: sodium as unknown as VaultSodium,
    });

    /** The exchange, which is the person carrying two screens. */
    const carry = async (
      offer: Awaited<ReturnType<typeof offerPicoCompanionEnrolment>>,
      grantCode: string,
    ) => await acceptPicoCompanionEnrolment({
      socketPath: targetSocketPath,
      passphrase: targetPassphrase,
      grantCode,
      profilePath: targetProfilePath,
      sodium: sodium as unknown as VaultSodium,
      decisions: { decideApproval: async () => true },
      device: offer.device,
    });

    const first = await offerPicoCompanionEnrolment({
      socketPath: targetSocketPath,
      passphrase: targetPassphrase,
    });
    let accepted: Awaited<ReturnType<typeof acceptPicoCompanionEnrolment>> | null = null;
    const enrolled = await enrolPicoCompanionDevice({
      profile: sponsorProfile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: await sponsorLink(),
      sodium: sodium as unknown as VaultSodium,
      offerCode: first.offerCode,
      validUntil: '2027-01-01T00:00:00.000Z',
      exchange: async (grantCode) => {
        accepted = await carry(first, grantCode);
        return accepted.acceptanceCode;
      },
    });
    const joined = await accepted!.confirm();
    expect(joined.device.delegationId).toBe(enrolled.delegationId);

    /**
     * A year later, in one step: the same device shows its code again - its
     * vault holds exactly the two device keys, so the offer is the same keys
     * rather than new ones - and the sponsor renews instead of enrolling.
     */
    const again = await offerPicoCompanionEnrolment({
      socketPath: targetSocketPath,
      passphrase: targetPassphrase,
    });
    expect(again.device.signingKeyFingerprintHex)
      .toBe(first.device.signingKeyFingerprintHex);

    let renewedAccept: Awaited<ReturnType<typeof acceptPicoCompanionEnrolment>> | null = null;
    const renewed = await renewPicoCompanionDeviceOverCodes({
      profile: sponsorProfile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: await sponsorLink(),
      sodium: sodium as unknown as VaultSodium,
      offerCode: again.offerCode,
      validUntil: '2028-01-01T00:00:00.000Z',
      exchange: async (grantCode) => {
        renewedAccept = await carry(again, grantCode);
        return renewedAccept.acceptanceCode;
      },
    });
    expect(renewed.replacedDelegationId).toBe(enrolled.delegationId);
    expect(renewed.delegationId).not.toBe(enrolled.delegationId);

    // The other device follows the Home rather than its own signature, the
    // same as on its first day.
    const renewedProfile = await renewedAccept!.confirm();
    expect(renewedProfile.device.delegationId).toBe(renewed.delegationId);
    expect(renewedProfile.device.signingKeyFingerprintHex)
      .toBe(joined.device.signingKeyFingerprintHex);

    const view = await readPicoCompanionDeviceAuthority({
      profile: sponsorProfile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: await sponsorLink(),
    });
    const active = view.devices.filter((device) => device.status === 'active');
    expect(active).toHaveLength(2);
    expect(active.map((device) => device.delegationId)).toContain(renewed.delegationId);
    expect(view.devices.find(
      (device) => device.delegationId === enrolled.delegationId,
    )?.status).toBe('revoked');
    expect(active.find((device) => device.delegationId === renewed.delegationId)?.validUntil)
      .toBe('2028-01-01T00:00:00.000Z');
  }, 300_000);

  it('refuses to renew a device the Home has no active authority for', async () => {
    /**
     * The two cases that end the same way for a person: a device the Home
     * never knew, and one whose year already ran out. Neither is "try
     * again" - that device has to be reset and added as a new one - so the
     * refusal is one sentence rather than the ceremony's.
     */
    await sodium.ready;
    const { profilePath, session } = await sponsorDevice();
    const sponsorProfile = readPicoCompanionProfile(profilePath);
    const strangerSocketPath = await startEmptyDaemon('stranger');
    const stranger = await offerPicoCompanionEnrolment({
      socketPath: strangerSocketPath,
      passphrase: targetPassphrase,
    });

    let asked = 0;
    await expect(renewPicoCompanionDeviceOverCodes({
      profile: sponsorProfile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: await createPicoCompanionLinkClient({
        profile: sponsorProfile,
        daemonClient: session.consumerClient,
        sodium: sodium as unknown as VaultSodium,
      }),
      sodium: sodium as unknown as VaultSodium,
      offerCode: stranger.offerCode,
      validUntil: '2028-01-01T00:00:00.000Z',
      exchange: async () => {
        asked += 1;
        return '';
      },
    })).rejects.toThrow('no_active_authority');
    // And the other device was never asked to sign anything.
    expect(asked).toBe(0);
  }, 300_000);

  it('refuses an answer to a question it did not ask', async () => {
    /**
     * A code from an earlier attempt, shown again. Accepting it would submit
     * a signature over bytes this ceremony never built - and the person would
     * be told a device joined that never signed anything.
     */
    await sodium.ready;
    const { profilePath, session } = await sponsorDevice();
    const sponsorProfile = readPicoCompanionProfile(profilePath);
    const targetSocketPath = await startEmptyDaemon('target');

    const offer = await offerPicoCompanionEnrolment({
      socketPath: targetSocketPath,
      passphrase: targetPassphrase,
    });
    await expect(enrolPicoCompanionDevice({
      profile: sponsorProfile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: await createPicoCompanionLinkClient({
        profile: sponsorProfile,
        daemonClient: session.consumerClient,
        sodium: sodium as unknown as VaultSodium,
      }),
      sodium: sodium as unknown as VaultSodium,
      offerCode: offer.offerCode,
      validUntil: '2027-01-01T00:00:00.000Z',
      // A well-formed code from an earlier attempt, built the way a real one
      // is - so what is under test is the binding and not the parser.
      exchange: async () => buildPicoDeviceEnrolmentAcceptance({
        activationId: 'device_enrollment_from_an_earlier_attempt',
        targetSignatureHex: 'ab'.repeat(64),
      }),
    })).rejects.toThrow('another_activation');

    // And nothing joined: the Home still answers to one device.
    const view = await readPicoCompanionDeviceAuthority({
      profile: sponsorProfile,
      daemonClient: session.consumerClient,
      livingDeviceLinkClient: await createPicoCompanionLinkClient({
        profile: sponsorProfile,
        daemonClient: session.consumerClient,
        sodium: sodium as unknown as VaultSodium,
      }),
    });
    expect(view.devices.filter((device) => device.status === 'active')).toHaveLength(1);
  }, 300_000);
});
