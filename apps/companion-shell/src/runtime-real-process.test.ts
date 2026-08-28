import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPicoVaultKeyfile,
  writePicoVaultKeyfile,
  type CreatePicoVaultKeyfileResult,
} from '@pico/vault';
import {
  connectPicoVaultDaemonClient,
  createPicoLinkDirectClient,
  initiatePicoHomeDeviceRecovery,
} from '@pico/vault-daemon';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { writePicoCompanionProfile } from '@pico/companion';
import type { PicoCompanionPresentation } from './contract.js';
import { createPicoCompanionPresentationAdapter } from './presentation-adapter.js';
import { startPicoCompanionShellRuntime } from './runtime.js';

const CLI = join(import.meta.dirname, '..', '..', 'vault-daemon', 'dist', 'cli.js');
const CORE = join(import.meta.dirname, '..', '..', 'core', 'dist', 'index.js');
const identityPassphrase = 'companion shell identity passphrase';
const signingPassphrase = 'companion shell signing passphrase';
const agreementPassphrase = 'companion shell agreement passphrase';
const targetPassphrase = 'companion shell target passphrase';

const temporaryDirectories: string[] = [];
const childProcesses: ChildProcess[] = [];
let identity: CreatePicoVaultKeyfileResult;
let signing: CreatePicoVaultKeyfileResult;
let agreement: CreatePicoVaultKeyfileResult;
let targetSigning: CreatePicoVaultKeyfileResult;
let targetAgreement: CreatePicoVaultKeyfileResult;

beforeAll(async () => {
  await sodium.ready;
  identity = createPicoVaultKeyfile(sodium, {
    keyRole: 'pico_identity',
    passphrase: identityPassphrase,
  });
  signing = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_signing',
    passphrase: signingPassphrase,
  });
  agreement = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_key_agreement',
    passphrase: agreementPassphrase,
  });
  targetSigning = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_signing',
    passphrase: targetPassphrase,
  });
  targetAgreement = createPicoVaultKeyfile(sodium, {
    keyRole: 'device_key_agreement',
    passphrase: targetPassphrase,
  });
}, 120_000);

afterEach(() => {
  for (const child of childProcesses.splice(0)) {
    child.kill('SIGKILL');
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/**
 * ADR 0131 A3 - the start is an operation too, and it forgot to ask.
 *
 * **Found by standing a window up against a Home founded minutes earlier.**
 * The keystore held the passphrase, the automatic unlock opened the vault when
 * it was called by hand, and the shell never called it: `startServiceCore`
 * built one, passed it in, and the runtime went straight to a lifecycle reader
 * that builds a Link client - which signs with the device key, which is in a
 * locked vault. The person saw "the local companion service could not start"
 * on a device whose automatic unlock was configured and working.
 *
 * A cold vault is the normal state of a laptop in the morning, which is why
 * every run that followed an unlocked one looked fine.
 */
describe('ADR 0131 A3 - a cold vault at the moment the runtime starts', () => {
  it('asks the automatic unlock before it needs the device key', async () => {
    const core = await startCore();
    // Deliberately no approver and no unlock. This is the morning.
    const daemon = await startDaemon('pico-companion-cold-', [
      ['pico_identity', identity],
      ['device_signing', signing],
      ['device_key_agreement', agreement],
    ]);
    const profilePath = join(tempDirectory('pico-companion-cold-profile-'), 'profile.json');
    writePicoCompanionProfile(profilePath, {
      schema: 'pico.companion.profile.v1',
      coreUrl: core.linkBaseUrl,
      home: { homeHostPicoIdentityFingerprintHex: identity.keyFingerprintHex },
      host: core.host,
      identity: {
        keyFingerprintHex: identity.keyFingerprintHex,
        publicKeyHex: identity.publicKeyHex,
      },
      device: {
        signingKeyFingerprintHex: signing.keyFingerprintHex,
        keyAgreementKeyFingerprintHex: agreement.keyFingerprintHex,
        delegationId: 'delegation_companion_shell_cold_start',
      },
    });

    const start = async (
      automaticVaultUnlock?: {
        ensureUnlocked(): Promise<void>;
        lock(): Promise<void>;
        close(): Promise<void>;
      },
    ): Promise<unknown> => await startPicoCompanionShellRuntime({
      profilePath,
      vaultSocketPath: daemon.socketPath,
      sodium,
      notifications: createPicoCompanionPresentationAdapter({
        present: () => undefined,
        notify: () => undefined,
      }),
      ...(automaticVaultUnlock === undefined
        ? {}
        : { automaticVaultUnlock: automaticVaultUnlock as never }),
    });

    // Nobody to ask, so the vault stays shut and the start says which key it
    // wanted rather than failing blankly.
    await expect(start()).rejects.toThrow('link_device_signing_key_not_unlocked');

    /**
     * And with one, it is asked *first* - proven by letting it refuse. The
     * sentinel is what surfaces; a start that still built the Link client
     * before asking would fail on the device key one line further on, which is
     * exactly what it did until 2026-08-21.
     */
    const asked: string[] = [];
    await expect(start({
      ensureUnlocked: async () => {
        asked.push('ensureUnlocked');
        throw new Error('the_keystore_refused');
      },
      lock: async () => { asked.push('lock'); },
      close: async () => { asked.push('close'); },
    })).rejects.toThrow('the_keystore_refused');
    // Asked, refused, and closed again: a start that fails leaves no hold on
    // the vault behind it. Written as the whole sequence rather than one
    // membership check, because the order is the subject.
    expect(asked).toEqual(['ensureUnlocked', 'close']);
  }, 120_000);
});

describe('Electron-hosted companion runtime against real processes', () => {
  it('raises the ADR 0112 alarm from a real founded Home pending recovery', async () => {
    const core = await startCore();
    const living = await startDaemon('pico-companion-living-', [
      ['pico_identity', identity],
      ['device_signing', signing],
      ['device_key_agreement', agreement],
    ]);
    await startApprover(living, 'pico_identity', identity, identityPassphrase);
    await startApprover(living, 'device_signing', signing, signingPassphrase);
    await startApprover(living, 'device_key_agreement', agreement, agreementPassphrase);
    const founded = await runFounding(living, core);
    expect(founded.code, founded.stderr).toBe(0);
    const founding = JSON.parse(founded.stdout) as {
      claimState: { homeId: string };
      foundingRecord: {
        firstDeviceDelegation: { record: { delegationId: string } };
      };
    };
    const firstDelegationId =
      founding.foundingRecord.firstDeviceDelegation.record.delegationId;

    const target = await startDaemon('pico-companion-target-', [
      ['device_signing', targetSigning],
      ['device_key_agreement', targetAgreement],
    ]);
    await startApprover(target, 'device_signing', targetSigning, targetPassphrase);
    await startApprover(target, 'device_key_agreement', targetAgreement, targetPassphrase);
    const livingClient = await connectPicoVaultDaemonClient({ socketPath: living.socketPath });
    const targetClient = await connectPicoVaultDaemonClient({ socketPath: target.socketPath });
    await Promise.all([livingClient.hello(), targetClient.hello()]);
    const targetDelegationId = 'delegation_companion_shell_recovery';
    const targetLink = await createPicoLinkDirectClient({
      sodium,
      daemonClient: targetClient,
      coreUrl: core.linkBaseUrl,
      host: core.host,
      sender: {
        identityKeyFingerprintHex: identity.keyFingerprintHex,
        identityPublicKeyHex: identity.publicKeyHex,
        deviceSigningKeyFingerprintHex: targetSigning.keyFingerprintHex,
        deviceKeyAgreementKeyFingerprintHex: targetAgreement.keyFingerprintHex,
        delegationId: targetDelegationId,
      },
    });
    const recovery = await initiatePicoHomeDeviceRecovery({
      rootClient: livingClient,
      targetClient,
      targetLinkClient: targetLink,
      sodium,
      homeId: founding.claimState.homeId,
      hostSigningKeyFingerprintHex: core.host.signingKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: core.host.keyAgreementKeyFingerprintHex,
      identityKeyFingerprintHex: identity.keyFingerprintHex,
      targetDelegationId,
      targetDeviceSigningKeyFingerprintHex: targetSigning.keyFingerprintHex,
      targetDeviceKeyAgreementKeyFingerprintHex: targetAgreement.keyFingerprintHex,
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000).toISOString(),
    });
    await Promise.all([livingClient.close(), targetClient.close()]);

    const profilePath = join(tempDirectory('pico-companion-profile-'), 'profile.json');
    writePicoCompanionProfile(profilePath, {
      schema: 'pico.companion.profile.v1',
      coreUrl: core.linkBaseUrl,
      home: {
        homeHostPicoIdentityFingerprintHex: identity.keyFingerprintHex,
      },
      host: core.host,
      identity: {
        keyFingerprintHex: identity.keyFingerprintHex,
        publicKeyHex: identity.publicKeyHex,
      },
      device: {
        signingKeyFingerprintHex: signing.keyFingerprintHex,
        keyAgreementKeyFingerprintHex: agreement.keyFingerprintHex,
        delegationId: firstDelegationId,
      },
    });
    const presented: PicoCompanionPresentation[] = [];
    const notified: PicoCompanionPresentation[] = [];
    const runtime = await startPicoCompanionShellRuntime({
      profilePath,
      vaultSocketPath: living.socketPath,
      sodium,
      notifications: createPicoCompanionPresentationAdapter({
        present: (state) => { presented.push(state); },
        notify: (state) => { notified.push(state); },
      }),
    });
    expect(runtime.status()).toMatchObject({
      alarmActive: true,
      checks: 1,
      readFailures: 0,
      notifyFailures: 0,
    });
    expect(presented.at(-1)).toMatchObject({
      kind: 'pending_recovery',
      severity: 'blocked',
    });
    expect(presented.at(-1)?.body).toContain(recovery.pending.recoveryId);
    expect(notified).toHaveLength(1);
    await runtime.vetoPendingRecovery();
    expect(runtime.status()).toMatchObject({
      alarmActive: false,
      checks: 2,
      readFailures: 0,
    });
    expect(presented.at(-1)?.kind).toBe('idle');
    await runtime.stop();
  }, 180_000);

  /**
   * ADR 0139 AC4 mit ADR 0140 RL4 - und der Grund, warum dieser Weg fehlte.
   *
   * Am 2026-08-28 wurde gemessen, welche der vierundfünfzig Link-Operationen
   * je von einem echten Client an einem echten Home **angenommen** wurden -
   * nicht, welche ein Test bei Namen nennt. Es waren achtzehn. Sechzehn der
   * übrigen liegen hinter Bedienelementen, die dieses Fenster längst zeigt,
   * und alle sechzehn stehen in einer Datei: `@pico/companion/suppliers`. Dass
   * ein Test gegen einen erfundenen Client die *Operation* behauptet, hat
   * zweimal nicht gereicht (Befunde B31 und B34).
   *
   * Gegangen wird die Kette, die eine Person geht, und ihre Reihenfolge ist
   * Teil der Aussage: eine Regel über einen Effekt, dem niemand zugestimmt
   * hat, weist das Home mit `effect_not_consented` ab. Erst die Zustimmung
   * macht die Regel entscheidbar - hier steht also nicht nur, dass jeder
   * einzelne Aufruf durchkommt, sondern dass sie in dieser Folge aufeinander
   * aufbauen.
   *
   * Und die drei Listen davor sind an einem frisch gegründeten Home leer.
   * `leer heißt leer` ist hier eine Aussage über die Antwort und nicht über
   * ihr Ausbleiben: ein `invalid_arguments` käme als geworfener Fehler an,
   * nicht als leere Liste.
   */
  it('liest die Listen des Fensters, stimmt einem Modul zu und entscheidet eine Regel', async () => {
    const core = await startCore();
    const living = await startDaemon('pico-companion-suppliers-', [
      ['pico_identity', identity],
      ['device_signing', signing],
      ['device_key_agreement', agreement],
    ]);
    await startApprover(living, 'pico_identity', identity, identityPassphrase);
    await startApprover(living, 'device_signing', signing, signingPassphrase);
    await startApprover(living, 'device_key_agreement', agreement, agreementPassphrase);
    const founded = await runFounding(living, core);
    expect(founded.code, founded.stderr).toBe(0);
    const founding = JSON.parse(founded.stdout) as {
      foundingRecord: {
        firstDeviceDelegation: { record: { delegationId: string } };
      };
    };

    const profilePath = join(tempDirectory('pico-companion-profile-'), 'profile.json');
    writePicoCompanionProfile(profilePath, {
      schema: 'pico.companion.profile.v1',
      coreUrl: core.linkBaseUrl,
      home: {
        homeHostPicoIdentityFingerprintHex: identity.keyFingerprintHex,
      },
      host: core.host,
      identity: {
        keyFingerprintHex: identity.keyFingerprintHex,
        publicKeyHex: identity.publicKeyHex,
      },
      device: {
        signingKeyFingerprintHex: signing.keyFingerprintHex,
        keyAgreementKeyFingerprintHex: agreement.keyFingerprintHex,
        delegationId: founding.foundingRecord.firstDeviceDelegation.record.delegationId,
      },
    });
    const runtime = await startPicoCompanionShellRuntime({
      profilePath,
      vaultSocketPath: living.socketPath,
      sodium,
      notifications: createPicoCompanionPresentationAdapter({
        present: () => {},
        notify: () => {},
      }),
    });

    try {
      expect(await runtime.readSuppliers()).toEqual({ suppliers: [], declared: [] });
      expect(await runtime.readDepots()).toMatchObject({ depots: [] });
      /**
       * Die Sitzung reist mit, weil eine wartende Frage zu einer Sitzung
       * gehört (ADR 0141 RN4). Dass hier nichts wartet, ist die Antwort und
       * nicht ihr Fehlen.
       */
      expect(await runtime.readPendingActions('pico-shell-walk-session')).toEqual([]);
      /**
       * Und die beiden Listen, die zeigen, was ein Modellanbieter für diese
       * Person getan hat. An einem Home, das nie eines gefragt hat, sind sie
       * leer - und leer ist eine Antwort: eine abgewiesene Anfrage käme hier
       * als geworfener Fehler an und nicht als kurze Liste.
       */
      expect(await runtime.readRecalls()).toEqual([]);
      expect(await runtime.readAnsweredReads()).toEqual([]);

      const awaiting = (await runtime.readModuleConsent()) as ReadonlyArray<{
        identifier: string;
        declares: ReadonlyArray<{ name: string }>;
      }>;
      /**
       * Aktivierung ist voreingestellt an, Zustimmung nicht - deshalb wartet
       * an einem frischen Home jedes ausgelieferte Modul auf sein erstes Wort.
       */
      const calendar = awaiting.find((entry) => entry.identifier === 'calendar');
      expect(calendar).toBeDefined();
      expect(calendar?.declares.map((effect) => effect.name)).toEqual(['calendar.raise-entry']);

      await runtime.recordModuleConsent('calendar');
      expect(((await runtime.readModuleConsent()) as ReadonlyArray<{ identifier: string }>)
        .map((entry) => entry.identifier)).not.toContain('calendar');

      // Und jetzt trägt der Effekt eine Regel, die er vor der Zustimmung nicht
      // tragen konnte.
      await runtime.decideRule({
        effectName: 'calendar.raise-entry',
        privacyDomain: 'household',
        decision: 'require_approval',
      });
      await runtime.forgetRule({
        effectName: 'calendar.raise-entry',
        privacyDomain: 'household',
      });
    } finally {
      await runtime.stop();
    }
  }, 300_000);

  /**
   * ADR 0118 O1 mit ADR 0082 - und der Unterschied zwischen „geschickt" und
   * „angenommen", diesmal als Aufbau statt als Satz.
   *
   * Beide Operationen hier waren am 2026-08-28 unbegangen:
   * `home.time_bound_entry.acknowledge` und `home.domain.read-grant.submit`.
   * Die zweite ist ein Bedienelement im Fenster („Let this device read one
   * part of your memory"), die erste geschieht von selbst, sobald einer Person
   * etwas gesagt wurde.
   *
   * **Der zweite Durchgang ist der Beweis.** Dass die Quittung *geschickt*
   * wurde, sagt schon der erste; dass das Home sie *angenommen* hat, sagt erst,
   * dass derselbe Eintrag beim nächsten Nachsehen nicht wieder fällig ist.
   * Genau diese Lücke - ein Test, der den Namen der Operation behauptet - hat
   * die Befunde B31 und B34 durchgelassen.
   *
   * Der Eintrag wird durch die Ortsseite des Homes geschrieben, weil Erinnerung
   * dort entsteht: Module schreiben sie, kein Link-Vorgang tut es. Das ist
   * zugleich die Voraussetzung der zweiten Operation - ein Lesezugang gilt für
   * eine Domäne, die es gibt, und ohne sie antwortet das Home
   * `domain_is_not_host_custody`.
   */
  it('quittiert einen fälligen Eintrag und erteilt sich den Lesezugang darauf', async () => {
    const core = await startCore();
    /**
     * Vor der Gründung geschrieben, über den vertrauten Ortsweg ohne
     * Berechtigung - die Tür, durch die ein Modul schreibt. Ein Link-Vorgang
     * legt keine Erinnerung an, und deshalb gibt es an einem Home, das nie ein
     * Modul gefüttert hat, auch keine Domäne, für die ein Lesezugang gälte.
     */
    const recorded = await fetch(`${core.apiBaseUrl}/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'pico-shell-walk',
        type: 'memory.recorded',
        payload: {
          privacyDomain: 'household',
          contentType: 'text/plain',
          content: 'Die Heizung wird gewartet.',
          dueAt: new Date(Date.now() - 60_000).toISOString(),
        },
      }),
    });
    expect(recorded.status, await recorded.clone().text()).toBe(201);

    const living = await startDaemon('pico-companion-due-', [
      ['pico_identity', identity],
      ['device_signing', signing],
      ['device_key_agreement', agreement],
    ]);
    await startApprover(living, 'pico_identity', identity, identityPassphrase);
    await startApprover(living, 'device_signing', signing, signingPassphrase);
    await startApprover(living, 'device_key_agreement', agreement, agreementPassphrase);
    const founded = await runFounding(living, core);
    expect(founded.code, founded.stderr).toBe(0);
    const founding = JSON.parse(founded.stdout) as {
      foundingRecord: {
        firstDeviceDelegation: { record: { delegationId: string } };
      };
    };

    const profilePath = join(tempDirectory('pico-companion-profile-'), 'profile.json');
    writePicoCompanionProfile(profilePath, {
      schema: 'pico.companion.profile.v1',
      coreUrl: core.linkBaseUrl,
      home: {
        homeHostPicoIdentityFingerprintHex: identity.keyFingerprintHex,
      },
      host: core.host,
      identity: {
        keyFingerprintHex: identity.keyFingerprintHex,
        publicKeyHex: identity.publicKeyHex,
      },
      device: {
        signingKeyFingerprintHex: signing.keyFingerprintHex,
        keyAgreementKeyFingerprintHex: agreement.keyFingerprintHex,
        delegationId: founding.foundingRecord.firstDeviceDelegation.record.delegationId,
      },
    });
    const notified: PicoCompanionPresentation[] = [];
    const runtime = await startPicoCompanionShellRuntime({
      profilePath,
      vaultSocketPath: living.socketPath,
      sodium,
      notifications: createPicoCompanionPresentationAdapter({
        present: () => {},
        notify: (state) => { notified.push(state); },
      }),
    });

    try {
      expect(notified.map((state) => state.kind)).toContain('time_bound_entry_due');
      expect(runtime.status()).toMatchObject({ checks: 1, readFailures: 0, notifyFailures: 0 });

      /**
       * Und jetzt die eigentliche Frage: hat das Home die Quittung genommen?
       * Ein zweites Nachsehen, und nichts ist mehr fällig. Ein Home, das die
       * Quittung abgewiesen hätte, böte denselben Eintrag wieder an - und der
       * erste Durchgang sähe genauso aus wie dieser.
       */
      await runtime.checkNow();
      expect(runtime.status()).toMatchObject({
        checks: 2,
        readFailures: 0,
        notifyFailures: 0,
        // Eine abgewiesene Quittung wird hier gezählt, nicht geworfen - die
        // Null ist also die eine Hälfte der Aussage.
        dueEntryAcknowledgeFailures: 0,
      });
      expect(notified.filter((state) => state.kind === 'time_bound_entry_due')).toHaveLength(1);

      /**
       * ADR 0082 mit ADR 0100. Der Lesezugang, den dieses Gerät sich selbst
       * erteilt - unterschrieben vom Identitätsschlüssel, den nur der Vault
       * hält, und vom Home Zeichen für Zeichen gegen seinen Gründungseintrag
       * geprüft.
       */
      const granted = await runtime.grantDomainRead({ privacyDomain: 'household' });
      expect(granted.privacyDomain).toBe('household');
      expect(granted.status).toBe('active');
    } finally {
      await runtime.stop();
    }
  }, 300_000);
});

interface RunningCore {
  linkBaseUrl: string;
  /** Die Ortsseite des Homes: dieselbe Tür, durch die die Foundation schreibt. */
  apiBaseUrl: string;
  moveInCode: string;
  host: {
    signingPublicKeyHex: string;
    signingKeyFingerprintHex: string;
    keyAgreementPublicKeyHex: string;
    keyAgreementKeyFingerprintHex: string;
  };
}

interface RunningDaemon {
  vaultHomePath: string;
  socketPath: string;
  stderr: () => string;
}

function tempDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function freePort(): Promise<number> {
  return await new Promise<number>((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolvePromise(port));
    });
  });
}

async function waitFor(condition: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 800; attempt += 1) {
    if (condition()) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  throw new Error(`wait_timeout:${label}`);
}

async function startCore(): Promise<RunningCore> {
  const port = await freePort();
  let linkPort = await freePort();
  while (linkPort === port) {
    linkPort = await freePort();
  }
  const data = tempDirectory('pico-companion-core-');
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
      PICO_LINK_INTAKE_HOST: '127.0.0.1',
      PICO_LINK_INTAKE_PORT: String(linkPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  childProcesses.push(child);
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream!.setEncoding('utf8');
    stream!.on('data', (chunk: string) => { output += chunk; });
  }
  try {
    await waitFor(
      () => output.includes('Server listening at')
        && output.includes('Pico Link restricted intake listening')
        && output.includes('picoHomeMoveInCode'),
      'core_ready',
    );
  } catch {
    throw new Error(`core_ready_failed:${output}`);
  }
  const setup = output.split('\n').map((line) => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }).find((line) => line?.picoHomeMoveInCode !== undefined);
  if (setup === undefined) {
    throw new Error(`core_setup_not_logged:${output}`);
  }
  return {
    linkBaseUrl: `http://127.0.0.1:${linkPort}`,
    apiBaseUrl: `http://127.0.0.1:${port}`,
    moveInCode: String(setup.picoHomeMoveInCode),
    host: {
      signingPublicKeyHex: String(setup.hostSigningPublicKeyHex),
      signingKeyFingerprintHex: String(setup.hostSigningKeyFingerprintHex),
      keyAgreementPublicKeyHex: String(setup.hostKeyAgreementPublicKeyHex),
      keyAgreementKeyFingerprintHex: String(setup.hostKeyAgreementKeyFingerprintHex),
    },
  };
}

async function startDaemon(
  prefix: string,
  keyfiles: ReadonlyArray<readonly [
    'pico_identity' | 'device_signing' | 'device_key_agreement',
    CreatePicoVaultKeyfileResult,
  ]>,
): Promise<RunningDaemon> {
  const vaultHomePath = tempDirectory(prefix);
  for (const [role, fixture] of keyfiles) {
    writePicoVaultKeyfile(
      join(vaultHomePath, 'keyfiles', `${role}-${fixture.keyFingerprintHex}.json`),
      fixture.keyfile,
    );
  }
  const child = spawn(process.execPath, [
    CLI,
    'daemon',
    '--vault-home', vaultHomePath,
    '--foundation-data', tempDirectory(`${prefix}data-`),
    '--foundation-backup', tempDirectory(`${prefix}backup-`),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  childProcesses.push(child);
  let stdout = '';
  let stderr = '';
  child.stdout!.setEncoding('utf8');
  child.stderr!.setEncoding('utf8');
  child.stdout!.on('data', (chunk: string) => { stdout += chunk; });
  child.stderr!.on('data', (chunk: string) => { stderr += chunk; });
  await waitFor(() => stdout.includes('\n'), 'daemon_ready');
  return {
    vaultHomePath,
    socketPath: join(vaultHomePath, 'run', 'daemon.sock'),
    stderr: () => stderr,
  };
}

async function startApprover(
  daemon: RunningDaemon,
  role: 'pico_identity' | 'device_signing' | 'device_key_agreement',
  key: CreatePicoVaultKeyfileResult,
  passphrase: string,
): Promise<void> {
  const before = daemon.stderr().split('"event":"approval_watch_started"').length - 1;
  const child = spawn(process.execPath, [
    CLI,
    'unlock',
    '--vault-home', daemon.vaultHomePath,
    '--role', role,
    '--fingerprint', key.keyFingerprintHex,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  childProcesses.push(child);
  let stderr = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => { stderr += chunk; });
  child.stdin!.write(`${passphrase}\n`);
  await waitFor(() => stderr.includes('Vault unlocked.'), `unlock_${role}`);
  child.stdin!.write('y\n'.repeat(32));
  await waitFor(
    () => daemon.stderr().split('"event":"approval_watch_started"').length - 1 > before,
    `approval_${role}`,
  );
}

async function runFounding(
  daemon: RunningDaemon,
  core: RunningCore,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [
    CLI,
    'ceremony', 'claim-home',
    '--vault-home', daemon.vaultHomePath,
    '--fingerprint', identity.keyFingerprintHex,
    '--core-url', core.linkBaseUrl,
    '--move-in-code', core.moveInCode,
    '--host-signing-fingerprint', core.host.signingKeyFingerprintHex,
    '--host-agreement-fingerprint', core.host.keyAgreementKeyFingerprintHex,
    '--signing-fingerprint', signing.keyFingerprintHex,
    '--agreement-fingerprint', agreement.keyFingerprintHex,
    '--delegation-valid-until',
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000).toISOString(),
    '--transport', 'link',
    '--link-signing-fingerprint', signing.keyFingerprintHex,
    '--link-agreement-fingerprint', agreement.keyFingerprintHex,
    '--host-signing-public-key', core.host.signingPublicKeyHex,
    '--host-agreement-public-key', core.host.keyAgreementPublicKeyHex,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  childProcesses.push(child);
  let stdout = '';
  let stderr = '';
  child.stdout!.setEncoding('utf8');
  child.stderr!.setEncoding('utf8');
  child.stdout!.on('data', (chunk: string) => { stdout += chunk; });
  child.stderr!.on('data', (chunk: string) => { stderr += chunk; });
  const code = await new Promise<number | null>((resolvePromise) => {
    child.once('exit', resolvePromise);
  });
  return { code, stdout, stderr };
}
