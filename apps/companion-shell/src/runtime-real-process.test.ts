import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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
import { submitPicoCompanionObservations } from '@pico/companion/observations';
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

  /**
   * ADR 0129 SR5/SR6. Was ein Gerät gemessen hat, auf dem Weg in den Puffer -
   * und die Antwort davor, die es nicht ist.
   *
   * `home.observations.submit` war am 2026-08-28 unbegangen (Befund B36). Sie
   * gehört keinem Knopf, sondern der Sonde auf dem Telefon, und genau deshalb
   * lohnt der Weg hier: gegen ein erfundenes Home lässt sich nicht prüfen, was
   * ein echtes zur *Aufzeichnungszustimmung* sagt, und die ist die eine
   * Voreinstellung, die auf „nein" steht. Ein Home, dessen Kalender aus wäre,
   * sähe kaputt aus; eines, das die Wege seiner Person mitschriebe, weil
   * jemand etwas installiert hat, wäre nicht kaputt, sondern falsch.
   *
   * Deshalb geht der Weg beide Antworten. Die erste ist eine Ablehnung **mit
   * Namen**: eine Sonde, die „nichts angekommen" läse, misst weiter und
   * schickt weiter, und niemand sagte ihr je, warum es nirgends ankommt.
   */
  it('schreibt Messungen erst auf, wenn jemand der Aufzeichnung zugestimmt hat', async () => {
    const core = await startCore();
    const living = await startDaemon('pico-companion-observations-', [
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

    const daemonClient = await connectPicoVaultDaemonClient({ socketPath: living.socketPath });
    await daemonClient.hello();
    const linkClient = await createPicoLinkDirectClient({
      sodium,
      daemonClient,
      coreUrl: core.linkBaseUrl,
      host: core.host,
      sender: {
        identityKeyFingerprintHex: identity.keyFingerprintHex,
        identityPublicKeyHex: identity.publicKeyHex,
        deviceSigningKeyFingerprintHex: signing.keyFingerprintHex,
        deviceKeyAgreementKeyFingerprintHex: agreement.keyFingerprintHex,
        delegationId: founding.foundingRecord.firstDeviceDelegation.record.delegationId,
      },
    });

    const measured = [
      {
        kind: 'location_fix' as const,
        payload: JSON.stringify({
          at: new Date(Date.now() - 120_000).toISOString(),
          latitudeDeg: 48.2082,
          longitudeDeg: 16.3738,
          accuracyM: 12,
        }),
      },
      {
        kind: 'mobility_sample' as const,
        payload: JSON.stringify({
          at: new Date(Date.now() - 60_000).toISOString(),
          mobility: 'walking',
          confidence: 'high',
        }),
      },
    ];

    try {
      await expect(submitPicoCompanionObservations({
        linkClient,
        observations: measured,
      })).rejects.toThrow('capture_not_consented');

      // Die Zustimmung ist eine Handlung der Person an ihrem Home und kommt
      // nicht von dem Gerät, das aufzeichnen möchte.
      const consented = await fetch(`${core.apiBaseUrl}/api/home/modules/capture`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${await operatorSession(core)}`,
        },
        body: JSON.stringify({ identifier: 'spatial-recall', capturing: true }),
      });
      expect(consented.status, await consented.clone().text()).toBe(200);

      /**
       * Wie viele *angekommen* sind, nicht wie viele geschickt wurden: ein
       * Deckel nach ADR 0119 Q5 kann weniger annehmen als angeboten wurde, und
       * wer „alles gut" liest, misst weiter ins Leere.
       */
      expect(await submitPicoCompanionObservations({
        linkClient,
        observations: measured,
      })).toEqual({ appended: 2 });
    } finally {
      await daemonClient.close();
    }
  }, 300_000);

  /**
   * ADR 0143 DP1 mit ADR 0138 CO3/CO4. Ein Depot anhängen, entscheiden, ob es
   * hinausgreifen darf, und es wieder abhängen.
   *
   * Drei der sechzehn Bedienelemente aus Befund B36, die nie ein Home gesehen
   * hatten. Anhängen holt nichts - es schreibt auf, woher Code kommen dürfte,
   * und **nichts wird geholt, bis jemand es sagt**. Deshalb steht das
   * Zurückgelesene neben dem Zurückgegebenen: dass ein frisch angehängtes
   * Depot nicht greifen darf, ist eine Aussage des Homes und keine des
   * Aufrufers.
   *
   * Die beiden Ablehnungen gehören mit auf den Weg, weil sie Entscheidungen
   * sind und keine Formfehler: ein Aufrufer, der `branch` nennt, macht keinen
   * Tippfehler, sondern verlangt genau das, was ADR 0143 DP1 verhindert - ein
   * fremdes Repository, das zwischen zwei Releases Code in ein laufendes Pico
   * schiebt. Und ein zweites Abhängen ist eine Ablehnung mit Namen statt einer
   * stillen Bestätigung.
   */
  it('hängt ein Depot an, entscheidet sein Hinausgreifen und hängt es wieder ab', async () => {
    const core = await startCore();
    const living = await startDaemon('pico-companion-depot-', [
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

    // Eine Adresse und ein Commit, und `file://` ist eine Adresse: sie nennt
    // denselben Ort von überall, ein blosser Pfad nur von hier aus.
    const remote = 'file:///srv/depots/bridges';
    const commit = '0'.repeat(39) + '1';
    const depotsNow = async (): Promise<ReadonlyArray<Record<string, unknown>>> =>
      ((await runtime.readDepots()) as { depots: ReadonlyArray<Record<string, unknown>> }).depots;

    try {
      expect(await runtime.attachDepot({ remote, commit })).toEqual({ remote, commit });
      expect(await depotsNow()).toEqual([
        expect.objectContaining({ remote, commit, mayFetch: false, mayFetchUnasked: false }),
      ]);

      await runtime.decideDepotReach({ remote, mayFetch: true, mayFetchUnasked: true });
      expect((await depotsNow())[0]).toMatchObject({ mayFetch: true, mayFetchUnasked: true });

      /**
       * Das Hinausgreifen abzuschalten nimmt die ungefragte Erlaubnis mit.
       * Wer „darf nicht hinausgreifen" sagt, hat ersichtlich nicht „aber tu es
       * weiter von selbst" gemeint - und das Home wiese das Paar ohnehin als
       * `unasked_needs_fetching` ab, statt es stillschweigend zu ordnen.
       */
      await runtime.decideDepotReach({ remote, mayFetch: false, mayFetchUnasked: true });
      expect((await depotsNow())[0]).toMatchObject({ mayFetch: false, mayFetchUnasked: false });

      await expect(runtime.attachDepot({ remote, commit, branch: 'main' }))
        .rejects.toThrow('pico_depot_cannot_follow_a_ref');

      await runtime.detachDepot(remote);
      expect(await depotsNow()).toEqual([]);
      await expect(runtime.detachDepot(remote)).rejects.toThrow('not_attached');
    } finally {
      await runtime.stop();
    }
  }, 300_000);

  /**
   * ADR 0143 DP8 mit ADR 0141 RN4 und ADR 0139 AC4. Eine Person bittet um
   * einen Abruf, und wird zurückgefragt.
   *
   * Die letzten beiden Bedienelemente der Zuliefererfamilie aus Befund B36:
   * `home.depot.fetch.ask` und `home.action.approval.resolve`. Sie gehören
   * zusammen, weil die eine die andere erzeugt - `depot.fetch` ist der einzige
   * Effekt im Baum, der Code installiert, also fällt er unter ADR 0140s
   * RL3-Boden nie von selbst auf „erlaubt", und ohne aufgezeichnete Regel wird
   * gefragt.
   *
   * **Und die Antwort davor ist die interessantere.** Ohne Zustimmung zum
   * Modul sagt das Home `effects_not_consented` statt „nichts zu tun" - eine
   * Unterscheidung, die dieselbe Sorte Durchlauf schon einmal erzwungen hat:
   * `depot` wird aktiv ausgeliefert, Effektzustimmung wird nur beim Übergang
   * von aus auf an geschrieben, und ein Modul, das nie aus war, macht diesen
   * Übergang nie. Jeder Depot-Abruf war unerreichbar, und jeder Test schrieb
   * sich die Zustimmungszeile selbst.
   *
   * Beantwortet wird mit **nein**, und deshalb wird hier kein Repository
   * gebraucht: was geprüft wird, ist die Frage und ihr Weg zurück, nicht was
   * git danach täte.
   */
  it('bittet um einen Abruf, wird gefragt und antwortet nein', async () => {
    const core = await startCore();
    const living = await startDaemon('pico-companion-fetch-', [
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

    const remote = 'file:///srv/depots/bridges';
    const session = 'pico-shell-fetch-session';

    try {
      await runtime.attachDepot({ remote, commit: 'a'.repeat(40) });
      await runtime.decideDepotReach({ remote, mayFetch: true, mayFetchUnasked: false });

      // Vor der Zustimmung: keine Frage, aber ein Grund.
      expect(await runtime.askDepotFetch(session)).toMatchObject({
        requested: 0,
        blocked: 'effects_not_consented',
      });
      expect(await runtime.readPendingActions(session)).toEqual([]);

      await runtime.recordModuleConsent('depot');

      const asked = await runtime.askDepotFetch(session);
      expect(asked.blocked).toBeUndefined();
      expect(asked.waiting).toHaveLength(1);
      const [question] = asked.waiting as ReadonlyArray<{
        requestedEventId: string;
        prompt: string;
        risk: string;
      }>;
      expect(question?.risk).toBe('external_write');
      /**
       * Der Satz kommt aus dem Manifest des Moduls und nicht von hier - ADR
       * 0139 AC4: was jemand zugesagt bekommt, schreibt die Seite auf, die es
       * tut, und nicht die, die davon profitiert. Er nennt deshalb den Effekt
       * und nicht das Depot.
       */
      expect(question?.prompt).toContain('Fetches a depot at the commit you accepted');
      // Dieselbe Frage über die eigene Tür gelesen, nicht aus der Antwort von
      // eben abgeschrieben.
      expect((await runtime.readPendingActions(session) as ReadonlyArray<{
        requestedEventId: string;
      }>).map((waiting) => waiting.requestedEventId)).toEqual([question?.requestedEventId]);

      /**
       * Nein ist eine Antwort, und sie unterscheidet sich von „niemand war
       * da": ADR 0141 RN4 kennt dafür `unanswered`, und deshalb reist
       * `approved` hier ausdrücklich mit.
       */
      expect(await runtime.resolvePendingAction({
        requestedEventId: question!.requestedEventId,
        presenceSessionId: session,
        approved: false,
      })).toMatchObject({ outcome: 'refused', ran: false });
      expect(await runtime.readPendingActions(session)).toEqual([]);

      /**
       * **Gemessen, nicht behauptet: zwei Depots stellen zwei Fragen, die
       * nichts unterscheidet.** Der Eintrag trägt vier Felder - Ereignis-Id,
       * Satz, Risikoklasse und Ablauf -, und der Satz ist der des Effekts. Wer
       * zwei Depots angehängt hat, bekommt zweimal dieselbe Zeile und
       * beantwortet sie, ohne zu wissen, welches Depot gemeint ist - bei dem
       * einen Effekt im Baum, der Code installiert.
       *
       * Das steht hier als Messung und nicht als Reparatur: *was* eine Person
       * gefragt wird, entscheidet ADR 0139 AC4 (der Satz kommt aus dem
       * Manifest, nicht vom Aufrufer), und einen Betreff daneben zu setzen ist
       * eine Entscheidung und keine Implementierung. Befund B37 hält sie fest.
       */
      await runtime.attachDepot({
        remote: 'file:///srv/depots/others',
        commit: 'b'.repeat(40),
      });
      await runtime.decideDepotReach({
        remote: 'file:///srv/depots/others',
        mayFetch: true,
        mayFetchUnasked: false,
      });
      const both = (await runtime.askDepotFetch(session)).waiting as ReadonlyArray<{
        requestedEventId: string;
        prompt: string;
        risk: string;
        expiresAt: string;
      }>;
      expect(both).toHaveLength(2);
      expect(new Set(both.map((waiting) => waiting.prompt)).size).toBe(1);
      expect(Object.keys(both[0]!).sort())
        .toEqual(['expiresAt', 'prompt', 'requestedEventId', 'risk']);
    } finally {
      await runtime.stop();
    }
  }, 300_000);

  /**
   * ADR 0143 DP1/DP3 mit ADR 0136 und ADR 0137 IN5. Ein Depot wirklich holen,
   * und den Zulieferer anhängen, den es dabei erklärt.
   *
   * Die letzten drei Bedienelemente der Zuliefererfamilie aus Befund B36 -
   * `home.supplier.attach`, `home.supplier.reach.decide`,
   * `home.supplier.detach`. Sie sind nicht einzeln erreichbar: was angehängt
   * werden kann, steht in `pico-depot.json` eines Depots, das wirklich geholt
   * wurde, und *erklärt* wird es dort und nicht hier. Deshalb geht dieser Weg
   * die ganze Kette, mit einem echten `git`.
   *
   * **Das Repository ist echt und die Adresse ist eine.** `file://` steht auf
   * der Liste und ein blosser Pfad nicht: ein Depot wird über die Stelle
   * benannt, von der sein Code kommt, und `../depots/x` ist eine Position
   * relativ zu dem, der fragt. Geholt wird der Commit und nie ein Zweig - ADR
   * 0143 DP1s fehlendes `branch`-Feld als fehlendes Argument.
   *
   * **Und was ankam, wird gegen das gehalten, was angenommen wurde**: das Home
   * liest `HEAD` zurück. Dass hier derselbe Commit steht, den der Test
   * geschrieben hat, ist deshalb keine Tautologie - dazwischen liegen ein
   * `git fetch`, ein losgelöster Checkout und ein Vergleich.
   */
  it('holt ein echtes Depot und hängt den Zulieferer an, den es erklärt', async () => {
    const depot = tempDirectory('pico-depot-remote-');
    const git = (args: readonly string[]): string => execFileSync('git', [...args], {
      cwd: depot,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' },
    });
    git(['init', '-q', '-b', 'main', '.']);
    git(['config', 'user.email', 'depot@example.invalid']);
    git(['config', 'user.name', 'Depot']);
    git(['config', 'commit.gpgsign', 'false']);
    writeFileSync(join(depot, 'pico-depot.json'), JSON.stringify({
      schema: 'pico.depot.manifest.v1',
      suppliers: [{
        identifier: 'git-library',
        kind: 'library',
        slots: ['memory_item'],
        coverage: ['knowledge_base'],
        entryPoint: 'suppliers/git-library/index.js',
        protocolVersion: 1,
      }],
    }, null, 2));
    mkdirSync(join(depot, 'suppliers', 'git-library'), { recursive: true });
    writeFileSync(join(depot, 'suppliers', 'git-library', 'index.js'), 'export {};\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'the depot as its author published it']);
    const commit = git(['rev-parse', 'HEAD']).trim();
    const remote = `file://${depot}`;

    const core = await startCore();
    const living = await startDaemon('pico-companion-supplier-', [
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
    const session = 'pico-shell-supplier-session';

    try {
      await runtime.attachDepot({ remote, commit });
      await runtime.recordModuleConsent('depot');
      await runtime.decideDepotReach({ remote, mayFetch: true, mayFetchUnasked: false });

      // Nichts ist erklärt, solange nichts geholt wurde: angehängt und geholt
      // sind zwei Zustände und nicht einer mit einer Lücke.
      expect(await runtime.readSuppliers()).toEqual({ suppliers: [], declared: [] });

      const asked = await runtime.askDepotFetch(session);
      const [question] = asked.waiting as ReadonlyArray<{ requestedEventId: string }>;
      expect(await runtime.resolvePendingAction({
        requestedEventId: question!.requestedEventId,
        presenceSessionId: session,
        approved: true,
      })).toMatchObject({ outcome: 'approved', ran: true, succeeded: true });

      const fetched = await runtime.readSuppliers();
      expect(fetched.suppliers).toEqual([]);
      expect(fetched.declared).toEqual([
        {
          identifier: 'git-library',
          kind: 'library',
          remote,
          // ADR 0137 IN5. Das eine Feld, das das Depot nicht liefern darf.
          needs: ['privacyDomain'],
        },
      ]);

      /**
       * ADR 0137 IN5. Die Person sagt, wohin das Material gehört - und nur
       * das. Alles andere schreibt das Home aus der Erklärung des Depots ab,
       * nicht aus dem, was hier geschickt wurde.
       */
      expect(await runtime.attachSupplier({
        identifier: 'git-library',
        privacyDomain: 'household',
      })).toEqual({ identifier: 'git-library', privacyDomain: 'household' });

      const attached = await runtime.readSuppliers();
      expect(attached.declared).toEqual([]);
      expect(attached.suppliers).toEqual([
        expect.objectContaining({
          identifier: 'git-library',
          kind: 'library',
          // Frisch angehängt greift auch ein Zulieferer nach nichts hinaus.
          mayReachOutside: false,
          mayReachUnasked: false,
        }),
      ]);

      await runtime.decideSupplierReach({
        identifier: 'git-library',
        mayReachOutside: true,
        mayReachUnasked: true,
      });
      expect(((await runtime.readSuppliers()).suppliers as ReadonlyArray<Record<string, unknown>>)[0])
        .toMatchObject({ mayReachOutside: true, mayReachUnasked: true });

      await runtime.detachSupplier('git-library');
      const detached = await runtime.readSuppliers();
      expect(detached.suppliers).toEqual([]);
      // Und die Erklärung steht wieder da: abgehängt ist nicht weggeworfen,
      // das Depot liegt weiter auf der Platte und erklärt weiter, was es hat.
      expect((detached.declared as ReadonlyArray<Record<string, unknown>>)
        .map((entry) => entry.identifier)).toEqual(['git-library']);

      /**
       * **Und das Angebot, das kein Home je sieht** (Befund B38).
       *
       * Der Autor des Depots legt einen neueren Commit hin. ADR 0143 DP1 sagt,
       * das sei ein Angebot: nichts wird deswegen geholt, und eine Person
       * entscheidet. Der Weg dorthin endet aber immer hier - `offered_commit`
       * hat in diesem Baum keinen Erzeuger. `recordPicoDepotFetchOutcome` ist
       * die einzige Tür in die Spalte, und ihr einziger Aufrufer im Produkt
       * gibt das Feld nie mit, also ist `offeredCommit` an einem echten Home
       * immer abwesend und `home.depot.offer.accept` antwortet immer
       * `no_offer_standing`.
       *
       * Das steht hier als Messung und nicht als Reparatur: *woher* ein Home
       * erfährt, dass es etwas Neueres gibt, ist offen. Die ADR verbietet dem
       * planmässigen Lauf, danach zu suchen - er ist eine Instandsetzung und
       * keine Abfrage nach Commits -, und sie sagt nicht, wer stattdessen
       * fragen darf. ADR 0143 hat die datierte Notiz dazu.
       */
      git(['commit', '-q', '--allow-empty', '-m', 'was der Autor danach veröffentlicht hat']);
      const newer = git(['rev-parse', 'HEAD']).trim();
      expect(newer).not.toBe(commit);
      await expect(runtime.acceptDepotOffer(remote, newer)).rejects.toThrow('no_offer_standing');
    } finally {
      await runtime.stop();
    }
  }, 300_000);

  /**
   * ADR 0142 PE1/PE2 mit ADR 0152 und ADR 0116 W1/W5. Eine Maschine messen,
   * sich für sie entscheiden, sie fragen, die Antwort behalten und alles
   * wieder zurücknehmen.
   *
   * Zehn der vierzehn Türen, die Befund B36 offen liess, hängen an einem
   * gemessenen Modellanbieter. Der Host dafür musste nicht erfunden werden -
   * `apps/core/src/test-model-provider-host.ts` ist einer, den dieses Haus
   * gebaut hat, und sein Kommentar begründet ihn: ein *echter* Server statt
   * eines gefälschten `fetch`, weil die Messung eine Reihenfolge ist und eine
   * nach URL antwortende Funktion sie nicht falsch machen kann.
   *
   * **Er läuft hier als eigener Prozess**, gestartet aus demselben `dist`, aus
   * dem auch das Home gestartet wird - keine zweite Kopie und kein Import quer
   * durch die Paketgrenze.
   *
   * Was diesen Weg von `whole-chain.test.ts` unterscheidet, ist das, was B31,
   * B34 und B36 durchgelassen hat: dort baut der Test die Link-Anfragen
   * selbst, hier schickt sie der Companion-Client an ein Home, das nebenan
   * wirklich läuft.
   */
  it('misst eine Maschine, fragt sie und nimmt beides wieder zurück', async () => {
    const modelHost = await startFakeModelHost();
    const core = await startCore();
    /**
     * Eine Erinnerung, über die sich fragen lässt - durch die Ortsseite, weil
     * Module sie schreiben und kein Link-Vorgang es tut.
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
          content: 'Der Zählerstand am Monatsanfang war 41870.',
        },
      }),
    });
    expect(recorded.status, await recorded.clone().text()).toBe(201);

    const living = await startDaemon('pico-companion-model-', [
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
        firstDeviceDelegation: Record<string, unknown> & {
          record: { delegationId: string };
        };
      };
    };

    /**
     * Und dieselbe Notiz noch einmal, diesmal von einer nachgewiesenen Person.
     * Zwei Räume, weil die Herkunft am Material hängt und nicht an der Frage:
     * ein Raum, in dem etwas Fremdes liegt, verlangt mehr, auch wenn daneben
     * Eigenes liegt.
     */
    const session = await openIdentitySession({
      daemon: living,
      core,
      delegation: founding.foundingRecord.firstDeviceDelegation,
    });
    const mine = await fetch(`${core.apiBaseUrl}/api/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session}`,
      },
      body: JSON.stringify({
        deviceId: 'pico-shell-walk',
        type: 'memory.recorded',
        payload: {
          privacyDomain: 'ownnotes',
          contentType: 'text/plain',
          content: 'Der Zählerstand am Monatsanfang war 41870.',
        },
      }),
    });
    expect(mine.status, await mine.clone().text()).toBe(201);

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
      const asked = await runtime.askModelProviderMeasurement({
        reach: modelHost.reach,
        model: 'a-model:measured',
      });
      // Laufend, nicht fertig: die Messung ist eine Folge von Anfragen an eine
      // fremde Maschine, und ein Aufrufer, der hier eine Zahl bekäme, bekäme
      // eine erfundene.
      expect(asked).toEqual({ entryId: 'a-model:measured', state: 'running' });

      /**
       * Zwei `state` mit demselben Namen und verschiedenen Vokabularen: der
       * der *Messung* (läuft, fertig, abgelehnt) und der des *Eintrags*, den
       * das Fenster zeigt (noch nicht benutzt, antwortet, antwortet nicht).
       * Gewartet wird auf den ersten.
       */
      const measured = await eventually(async () => {
        const entries = (await runtime.readModelProviderMeasurements()) as ReadonlyArray<{
          entryId: string;
          state: string;
          refusal?: string;
        }>;
        const entry = entries.find((candidate) => candidate.entryId === 'a-model:measured');
        return entry !== undefined && entry.state !== 'running' ? entry : undefined;
      });
      expect(measured, JSON.stringify(measured)).toMatchObject({ state: 'settled' });

      /**
       * ADR 0142 PE2 mit ADR 0152 SE6. Ein gemessener Eintrag ist ein Befund
       * und keine Erlaubnis: nichts benutzt ihn, bis eine Person sich
       * entscheidet, und die Entscheidung fällt auf ihrem eigenen Gerät.
       */
      await runtime.decideModelProvider({
        entryId: 'a-model:measured',
        providerClass: 'declared_own_host',
        carries: 'live_turn',
      });

      // ADR 0082. Und lesen darf dieses Gerät die Domäne erst, wenn es sich
      // den Zugang erteilt hat - „darf dieses Home benutzen" ist nicht „darf
      // diesen Raum lesen" (ADR 0077).
      await runtime.grantDomainRead({ privacyDomain: 'household' });

      /**
       * **Und die erste Antwort ist ein Nein mit Namen** (ADR 0151 PV1). Was
       * der Anbieter tragen darf, steht in seiner Entscheidung, und was
       * getragen werden müsste, liest das Home aus der Herkunft dessen, was
       * eingeschlossen wäre. Diese Notiz kam über die Ortsseite herein und
       * gehört damit keiner nachgewiesenen Person, also verlangt sie mehr als
       * den lebenden Zug - und die Ablehnung nennt genau das, statt eine leere
       * Antwort zu liefern.
       */
      await expect(runtime.askRecall({
        privacyDomain: 'household',
        question: 'Was stand am Monatsanfang auf dem Zähler?',
      })).rejects.toThrow('entry_may_not_carry_these_words');

      /**
       * ADR 0151 PV1 mit PV4/PV5. Das Geheimnis hinreichen und danach
       * erweitern, als eine Handlung - und das Home nimmt hier die eine Hälfte
       * an und weist die andere ab.
       *
       * Angenommen wird `home.model.provider.credential.submit`: das
       * Geheimnis wird versiegelt und der Name zurückgegeben. Abgewiesen wird
       * die Entscheidung, die ihn nennt, weil dieser Host über einfaches HTTP
       * erreichbar ist. PV5 lehnt das rundheraus ab statt es zu verengen - ein
       * Bearer über ungeschütztem Transport ist für jeden lesbar, der den Port
       * ohnehin erreicht, unterscheidet den Anbieter also von niemandem und
       * sieht nur so aus, als täte er es.
       *
       * Der Doppelgänger dieses Hauses spricht HTTP; ein erweiterter Anbieter
       * bräuchte einen mit TLS. Das ist der Grund, aus dem die Rückruffamilie
       * hier offen bleibt und nicht ein Versäumnis dieses Wegs.
       */
      await expect(runtime.widenModelProvider({
        entryId: 'a-model:measured',
        providerClass: 'declared_own_host',
        secret: 'a secret this Home seals and never hands back',
      })).rejects.toThrow('pico_model_provider_credential_on_unprotected_transport');

      /**
       * **Und dasselbe Nein über die eigenen Notizen dieser Person** - das ist
       * die Messung, die die Frage schliesst, und sie fiel anders aus als
       * erwartet (Befund B39).
       *
       * Die Notiz oben kam über die Ortsseite herein und trägt deshalb
       * `unattributed`; diese hier wurde unter einer identitätsgebundenen
       * Sitzung geschrieben und trägt `home_member`. Sie wird trotzdem
       * abgewiesen, und damit ist die Herkunft nicht das fehlende Stück: ein
       * Rückruf holt Material aus einem Speicher, das ist per Definition
       * *retrieved memory*, und die weitere Erlaubnis dafür verlangt einen
       * Zugang (ADR 0151 PV4), der über einfaches HTTP abgewiesen wird (PV5).
       *
       * Die Klasse `person_present` läge über der Schwelle - nur schreibt sie
       * heute kein Weg: die Ortsseite sagt selbst, eine nachgewiesene Identität
       * sei `home_member` und nicht die Person im Raum.
       */
      await runtime.grantDomainRead({ privacyDomain: 'ownnotes' });
      await expect(runtime.askRecall({
        privacyDomain: 'ownnotes',
        question: 'Was stand am Monatsanfang auf dem Zähler?',
      })).rejects.toThrow('entry_may_not_carry_these_words');

      // Und alles wieder zurück: erst die Entscheidung, dann der Befund.
      await runtime.revokeModelProvider('a-model:measured');
      await runtime.forgetModelProvider('a-model:measured');
      expect((await runtime.readModelProviders()).map((entry) => entry.entryId))
        .not.toContain('a-model:measured');
    } finally {
      await runtime.stop();
      await modelHost.close();
    }
  }, 300_000);
});

interface RunningCore {
  linkBaseUrl: string;
  /** Die Ortsseite des Homes: dieselbe Tür, durch die die Foundation schreibt. */
  apiBaseUrl: string;
  /**
   * ADR 0076. Der einmalige Code, mit dem der erste Operator entsteht.
   *
   * Das Home schreibt ihn beim Start auf seinen eigenen lokalen Kanal, weil es
   * sonst niemanden gibt, dem er gegeben werden könnte. Er gilt für diesen
   * Prozess und einmal.
   */
  operatorBootstrapCode: string;
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
        && output.includes('picoHomeMoveInCode')
        && output.includes('operatorBootstrapCode'),
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
  const bootstrap = output.split('\n').map((line) => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }).find((line) => line?.operatorBootstrapCode !== undefined);
  if (bootstrap === undefined) {
    throw new Error(`core_bootstrap_code_not_logged:${output}`);
  }
  return {
    linkBaseUrl: `http://127.0.0.1:${linkPort}`,
    apiBaseUrl: `http://127.0.0.1:${port}`,
    operatorBootstrapCode: String(bootstrap.operatorBootstrapCode),
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

/**
 * ADR 0076. Eine Operator-Sitzung an einem laufenden Home.
 *
 * Was der Host verwaltet, ist nicht, was ein Bewohner entscheidet (ADR 0087) -
 * die Aufzeichnungszustimmung eines Moduls liegt heute auf der
 * Foundation-Seite, also holt der Weg sich die Sitzung, die diese Seite
 * verlangt, statt sie zu umgehen.
 */
async function operatorSession(core: RunningCore): Promise<string> {
  const bootstrapped = await fetch(`${core.apiBaseUrl}/api/auth/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      bootstrapCode: core.operatorBootstrapCode,
      passphrase: 'a long enough operator passphrase',
    }),
  });
  if (bootstrapped.status !== 201) {
    throw new Error(`operator_bootstrap_failed:${bootstrapped.status}:${await bootstrapped.text()}`);
  }
  const { session } = await bootstrapped.json() as { session?: unknown };
  if (typeof session !== 'string' || session === '') {
    throw new Error('operator_bootstrap_returned_no_session');
  }
  return session;
}

/**
 * ADR 0142 PE2. Ein Modell-Host, klein genug für einen Test und echt genug,
 * gemessen zu werden - als eigener Prozess.
 *
 * Er stammt aus `apps/core`, wo er neben dem Messer wohnt, weil zwei Tests ihn
 * brauchen und eine zweite Kopie eines gefälschten Hosts eine zweite Sache
 * wäre, die ehrlich gehalten werden muss. Hier wird er deshalb aus demselben
 * `dist` gestartet, aus dem auch das Home gestartet wird, statt über die
 * Paketgrenze importiert zu werden.
 */
async function startFakeModelHost(): Promise<{ reach: string; close(): Promise<void> }> {
  const source = join(import.meta.dirname, '..', '..', 'core', 'dist', 'test-model-provider-host.js');
  const child = spawn(process.execPath, [
    '--input-type=module',
    '-e',
    `import { startPicoFakeModelHost } from ${JSON.stringify(pathToFileURL(source).href)};\n`
    + 'const host = await startPicoFakeModelHost();\n'
    + 'process.stdout.write(JSON.stringify({ reach: host.reach }) + "\\n");\n',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  childProcesses.push(child);
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream!.setEncoding('utf8');
    stream!.on('data', (chunk: string) => { output += chunk; });
  }
  try {
    await waitFor(() => output.includes('"reach"'), 'model_host_ready');
  } catch {
    throw new Error(`model_host_failed:${output}`);
  }
  const { reach } = JSON.parse(output.split('\n').find((line) => line.includes('"reach"'))!) as {
    reach: string;
  };
  return {
    reach,
    close: async () => {
      child.kill('SIGTERM');
    },
  };
}

/**
 * Wartet, bis etwas *da* ist, und gibt es zurück.
 *
 * Neben `waitFor` und nicht statt seiner: das eine wartet auf eine Bedingung,
 * die der Aufrufer selbst prüft, das andere auf einen Wert, den er danach
 * braucht. Eine Messung ist eine Folge von Anfragen an eine fremde Maschine,
 * also wird sie abgewartet und nicht angenommen.
 */
async function eventually<T>(read: () => Promise<T | undefined>): Promise<T> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const value = await read();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => { setTimeout(resolve, 1_000); });
  }
  throw new Error('never_settled');
}

/**
 * ADR 0082. Eine identitätsgebundene Foundation-Sitzung, über die Zeremonie,
 * die es dafür gibt.
 *
 * Gebraucht, um eine Notiz zu schreiben, die *einer nachgewiesenen Person*
 * gehört: die Ortsseite ohne Berechtigung schreibt `unattributed`, und ADR
 * 0151 PV1 liest genau diese Herkunft, wenn es entscheidet, wieviel ein
 * Anbieter tragen können muss. Der Besitznachweis kommt vom Geräteschlüssel
 * und steht auf ADR 0099s Freistellungsliste, kostet also keine Zustimmung -
 * richtig, denn eine Sitzung ist ein Nachweis und keine neue Vollmacht.
 */
async function openIdentitySession(input: {
  daemon: RunningDaemon;
  core: RunningCore;
  delegation: Record<string, unknown>;
}): Promise<string> {
  const delegationPath = join(tempDirectory('pico-delegation-'), 'delegation.json');
  writeFileSync(delegationPath, JSON.stringify(input.delegation));
  const child = spawn(process.execPath, [
    CLI,
    'ceremony', 'open-identity-session',
    '--vault-home', input.daemon.vaultHomePath,
    '--fingerprint', identity.keyFingerprintHex,
    '--signing-fingerprint', signing.keyFingerprintHex,
    '--agreement-fingerprint', agreement.keyFingerprintHex,
    '--core-url', input.core.apiBaseUrl,
    '--delegation', delegationPath,
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
  if (code !== 0) {
    throw new Error(`open_identity_session_failed:${code}:${stderr}`);
  }
  const { session } = JSON.parse(stdout) as { session?: unknown };
  if (typeof session !== 'string' || session === '') {
    throw new Error(`open_identity_session_returned_nothing:${stdout}`);
  }
  return session;
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
