import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
import { writePicoCompanionProfile, type PicoCompanionProfile } from '@pico/companion';
import type { PicoCompanionPlatformSecretPort } from '@pico/companion/platform-secrets';
import type { PicoCompanionPresentation } from './contract.js';
import { createPicoCompanionPresentationAdapter } from './presentation-adapter.js';
import { exchangePicoCompanionLinkMailbox } from '@pico/companion/link-mailbox';
import {
  keepPicoCompanionDerivedObservation,
  submitPicoCompanionObservations,
} from '@pico/companion/observations';
import { condensePicoCompanionObservations } from '@pico/companion/observation-condensation';
import { startPicoCompanionShellRuntime } from './runtime.js';

const CLI = join(import.meta.dirname, '..', '..', 'vault-daemon', 'dist', 'cli.js');
const CORE = join(import.meta.dirname, '..', '..', 'core', 'dist', 'index.js');
const RELAY = join(import.meta.dirname, '..', '..', 'relay', 'dist', 'main.js');
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
    const { living, delegationId } = await foundedDevice({ core, prefix: 'pico-companion-suppliers-' });

    const { runtime } = await runtimeFor({
      core,
      living,
      delegationId,
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

    const { living, delegationId } = await foundedDevice({ core, prefix: 'pico-companion-due-' });

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
        delegationId,
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
    const { living, delegationId } = await foundedDevice({ core, prefix: 'pico-companion-observations-' });

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
        delegationId,
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
      // Einmal angemeldet und weitergereicht: ein zweiter Beitritt desselben
      // Betreibers wird abgelehnt, und das ist richtig.
      const session = await operatorSession(core);
      const consented = await fetch(`${core.apiBaseUrl}/api/home/modules/capture`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session}`,
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

      /**
       * **Und die andere Hälfte der Zustandsgrenze** (ADR 0126 P3, Phase 3,
       * aufgemacht am 2026-09-03).
       *
       * Bis hierher geht der Weg von 2026-08-26: das Gerät schickt Messungen,
       * der Home puffert sie. P3 will das Gegenteil — der Puffer liegt auf dem
       * Gerät, die Verdichtung auch, und was die Grenze überquert, ist eine
       * Erinnerung. `derived_observation` stand seit dem 2026-08-18 als
       * Übergangsart im Vokabular, deklariert und unbenutzt.
       *
       * Hier wird sie benutzt. Verdichtet wird mit derselben Funktion, die auf
       * dem Telefon läuft; über die Tür geht nur ihr Ergebnis.
       */
      /**
       * **Ohne einen einzigen Klassifikator-Wert** (seit dem 2026-09-04): die
       * Bewegungsarten leitet das Gerät aus den Messungen selbst ab. Was hier
       * hineingeht, ist genau das, was ein Telefon liefert — eine Fahrt, ein
       * Halt, ein Weggehen.
       */
      const derived = condensePicoCompanionObservations({
        locationFixes: [
          { at: '2026-09-04T08:00:00.000Z', latitudeDeg: 48.2, longitudeDeg: 16.37, accuracyM: 8 },
          { at: '2026-09-04T08:01:00.000Z', latitudeDeg: 48.2, longitudeDeg: 16.3821, accuracyM: 8 },
          { at: '2026-09-04T08:02:00.000Z', latitudeDeg: 48.2, longitudeDeg: 16.3942, accuracyM: 8 },
          { at: '2026-09-04T08:03:00.000Z', latitudeDeg: 48.2, longitudeDeg: 16.39427, accuracyM: 8 },
          { at: '2026-09-04T08:04:00.000Z', latitudeDeg: 48.2, longitudeDeg: 16.39548, accuracyM: 8 },
        ],
        mobilitySamples: [],
      });
      expect(derived, 'die Verdichtung muss hier etwas ergeben').toBeDefined();

      const kept = await keepPicoCompanionDerivedObservation({
        linkClient,
        derived: derived!,
      });
      expect(kept.crossed).toBe(true);
      expect(kept.memoryItemId).toMatch(/^mem_derived_[0-9a-f]{32}$/u);

      /**
       * **Und die Übergabe ist aufgeschrieben** — das ist ADR 0126s tragende
       * Aussage: „a rule a surface enforces is a rule anything else walks
       * past; here promoting *is* recording." Der Nachweis ist deshalb die
       * Aufzeichnung und nicht der Rückgabewert.
       *
       * Sie ist inhaltsfrei: welche Übergangsart, in welchen Raum, aus wie
       * vielen Quellen — nie, *was* übergegangen ist.
       */
      const tail = await fetch(`${core.apiBaseUrl}/api/events/tail?limit=50`, {
        headers: { authorization: `Bearer ${session}` },
      });
      expect(tail.status, await tail.clone().text()).toBe(200);
      const events = ((await tail.json()) as {
        events: ReadonlyArray<{ type: string; payload: Record<string, unknown> }>;
      }).events;
      const crossing = events.find((event) => event.type === 'home.state_crossed'
        && event.payload.kind === 'derived_observation');
      expect(crossing, JSON.stringify(events.map((event) => event.type))).toBeDefined();
      expect(crossing!.payload).toMatchObject({
        kind: 'derived_observation',
        privacyDomain: 'private',
        sourceCount: 1,
      });
      // Inhaltsfrei: der Text der Ableitung steht nicht in der Aufzeichnung.
      expect(JSON.stringify(crossing!.payload)).not.toContain('parkedAt');

      /**
       * Und ein zweites Mal dieselbe Ableitung ist kein Fehler, aber auch kein
       * zweiter Übergang: nur „gerade angekommen" erlaubt einem Gerät, seinen
       * Puffer zu leeren.
       */
      const again = await keepPicoCompanionDerivedObservation({ linkClient, derived: derived! });
      expect(again.memoryItemId).toBe(kept.memoryItemId);
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
   *
   * Gepflanzt: schickt der Client die ungefragte Erlaubnis nie mit, liest der
   * Weg sie als nicht erteilt vom Home zurück.
   */
  it('hängt ein Depot an, entscheidet sein Hinausgreifen und hängt es wieder ab', async () => {
    const core = await startCore();
    const { living, delegationId } = await foundedDevice({ core, prefix: 'pico-companion-depot-' });

    const { runtime } = await runtimeFor({
      core,
      living,
      delegationId,
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
    const { living, delegationId } = await foundedDevice({ core, prefix: 'pico-companion-fetch-' });

    const { runtime } = await runtimeFor({
      core,
      living,
      delegationId,
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
       * **Zwei Depots stellen zwei Fragen, und sie unterscheiden sich** (ADR
       * 0141 RN3 mit RN4, Befund B37, entschieden am 2026-09-01). Bis hierher
       * trug ein Eintrag vier Felder - Ereignis-Id, Satz, Risikoklasse und
       * Ablauf -, und der Satz ist der des Effekts: wer zwei Depots angehaengt
       * hatte, bekam zweimal dieselbe Zeile und beantwortete sie, ohne zu
       * wissen, welches Depot gemeint war, bei dem einen Effekt im Baum, der
       * Code installiert.
       *
       * Repariert in der Gestalt, die RN3 fuer die Zustimmungsaussage schon
       * entschieden hatte, und nicht in einer neuen: der Satz bleibt der des
       * Manifests (ADR 0139 AC4), und die Argumente stehen als beschriftete
       * Daten daneben. Deshalb steht unten beides - derselbe Satz zweimal, und
       * zwei verschiedene `remote`.
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
        arguments: ReadonlyArray<{ name: string; value: unknown; originClass: string }>;
        carriesExternalContent: boolean;
      }>;
      expect(both).toHaveLength(2);
      // Der Satz ist unveraendert derselbe. Das ist keine Schwaeche mehr,
      // sondern die Aussage: es wird nicht daneben komponiert.
      expect(new Set(both.map((waiting) => waiting.prompt)).size).toBe(1);
      expect(Object.keys(both[0]!).sort()).toEqual([
        'arguments', 'carriesExternalContent', 'expiresAt', 'prompt', 'requestedEventId', 'risk',
      ]);
      expect(new Set(both.map((waiting) =>
        waiting.arguments.find((argument) => argument.name === 'remote')?.value)))
        .toEqual(new Set([remote, 'file:///srv/depots/others']));
      /**
       * Die Herkunftsklasse reist mit, und sie ist `own_pico` und nicht
       * `person_present`: die Person hat *jetzt holen* gedrueckt, aber die
       * Werte selbst kommen aus der Anheftungszeile - Picos eigener Aufschrieb
       * einer frueheren Entscheidung, nicht etwas, das eben getippt wurde.
       * Erwartet war hier zuerst `person_present`; der Lauf hat das
       * widerlegt, und die Zeile im Home, die es entscheidet, sagt genau
       * diesen Grund.
       *
       * Nichts an dieser Frage kam von aussen, und das sagt das letzte Feld -
       * ADR 0116 W3 heisst hier, dass eine Bestaetigung nichts Beruhigendes
       * sagen kann, was ein fremder Wert ihr in den Mund gelegt haette.
       */
      for (const waiting of both) {
        expect(waiting.carriesExternalContent).toBe(false);
        expect(waiting.arguments.map((argument) => argument.originClass))
          .toEqual(['own_pico', 'own_pico']);
      }
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
   *
   * Gepflanzt: setzt der Client eine andere Domäne ein als die, die die Person
   * genannt hat, liest der Weg die andere zurück - das eine Feld, das ihr
   * gehört, ist auch das eine, an dem es auffällt.
   */
  it('holt ein echtes Depot und hängt den Zulieferer an, den es erklärt', async () => {
    const { remote, commit, git } = createDepotRemote();

    const modelHost = await startFakeModelHost();
    const core = await startCore();
    const { living, delegationId } = await foundedDevice({ core, prefix: 'pico-companion-supplier-' });

    const { runtime } = await runtimeFor({
      core,
      living,
      delegationId,
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

      /**
       * **Und was das Depot erklärt hat, wird auch gelesen** (ADR 0116 W5 mit
       * ADR 0136 BR2, Befund B53).
       *
       * `home.model.read.keep` war bis zum 2026-09-02 die eine Link-Tür, die
       * niemand je aufbekommen hat, und der Grund lag im Produkt und nicht im
       * Doppel: das Haus sagte einem Modell für einen `token` nur `string` an
       * und hielt die Antwort danach gegen ein Muster, also fiel jede
       * Bibliotheksmessung als `answer_was_not_the_declared_shape` durch.
       * Seit die Ansage vollständig ist, geht der Weg.
       *
       * Der Anbieter trägt hier die breitere Erlaubnis, und das ist keine
       * Bequemlichkeit: ein Bibliothekslesen schliesst einen Auszug aus einem
       * Dokument ein, also verlangt es mehr als den lebenden Zug.
       */
      await runtime.askModelProviderMeasurement({
        reach: modelHost.reach,
        model: 'a-model:measured',
      });
      expect(await eventually(async () => {
        const entries = (await runtime.readModelProviderMeasurements()) as ReadonlyArray<{
          entryId: string;
          state: string;
        }>;
        const entry = entries.find((candidate) => candidate.entryId === 'a-model:measured');
        return entry !== undefined && entry.state !== 'running' ? entry : undefined;
      })).toMatchObject({ state: 'settled' });
      await runtime.decideModelProvider({
        entryId: 'a-model:measured',
        providerClass: 'declared_own_host',
        carries: 'live_turn_and_retrieved_memory',
      });

      /**
       * Die Lesearbeit entsteht beim Holen und nicht beim Anhängen: der
       * Zulieferer sagt erst jetzt, wohin das Material gehört, also wird erst
       * jetzt etwas eingereiht. Deshalb hier ein zweiter Abruf.
       */
      await runtime.decideRule({
        effectName: 'depot.fetch',
        privacyDomain: 'private',
        decision: 'allow',
      });
      expect(await runtime.askDepotFetch('pico-shell-read-session'))
        .toMatchObject({ requested: 1 });

      const answered = await eventually(async () => {
        const reads = (await runtime.readAnsweredReads()) as ReadonlyArray<{
          jobId: string;
          supplier: string;
        }>;
        return reads.find((read) => read.supplier === 'git-library');
      });
      /**
       * Was die Messung gefunden hat, steht *nicht* darin. ADR 0116 W5: ein
       * Gerät, das den Wert schon zeigte, hätte abgeleitetes Material auf
       * einen Bildschirm geschrieben, bevor jemand ja gesagt hat.
       */
      expect(Object.keys(answered!).sort())
        .toEqual(['answeredAt', 'jobId', 'revision', 'supplier']);

      // Der Druck ist der Schreibvorgang, und er geht durch dieselbe Tür wie
      // ein behaltener Rückruf (ADR 0126 P3).
      const keptItemId = await runtime.keepAnsweredRead(answered!.jobId);
      expect(keptItemId).toMatch(/^memory_[0-9a-f]{32}$/u);
      // ADR 0071. Und der Schreibvorgang hat eine Rücknahme.
      await runtime.forgetMemory(keptItemId);

      await runtime.detachSupplier('git-library');
      const detached = await runtime.readSuppliers();
      expect(detached.suppliers).toEqual([]);
      // Und die Erklärung steht wieder da: abgehängt ist nicht weggeworfen,
      // das Depot liegt weiter auf der Platte und erklärt weiter, was es hat.
      expect((detached.declared as ReadonlyArray<Record<string, unknown>>)
        .map((entry) => entry.identifier)).toEqual(['git-library']);

      /**
       * **Und das Angebot, das lange kein Home je sah** (Befund B38).
       *
       * Der Autor des Depots legt einen neueren Commit hin. ADR 0143 DP1 sagt,
       * das sei ein Angebot: nichts wird deswegen geholt, und eine Person
       * entscheidet. Der Weg dorthin endete bis zum 2026-09-01 immer hier -
       * `offered_commit` hatte in diesem Baum keinen Erzeuger, also war
       * `offeredCommit` an einem echten Home immer abwesend und
       * `home.depot.offer.accept` antwortete immer `no_offer_standing`.
       */
      git(['commit', '-q', '--allow-empty', '-m', 'was der Autor danach veröffentlicht hat']);
      const newer = git(['rev-parse', 'HEAD']).trim();
      expect(newer).not.toBe(commit);

      /**
       * **Und jetzt sieht es jemand** (ADR 0143 DP1, entschieden 2026-09-01).
       * Ein von einer Person ausgelöster Abruf fragt das Remote zusätzlich,
       * was es veröffentlicht; der planmässige Lauf tut das nicht und bleibt
       * eine Instandsetzung. Bis dahin schrieb niemand die Spalte, und die
       * Annahme antwortete immer `no_offer_standing` (Befund B38).
       */
      await runtime.decideRule({
        effectName: 'depot.fetch',
        privacyDomain: 'private',
        decision: 'allow',
      });
      await runtime.recordModuleConsent('depot');
      expect(await runtime.askDepotFetch('pico-shell-offer-session'))
        .toMatchObject({ requested: 1 });
      expect(((await runtime.readDepots()) as {
        depots: ReadonlyArray<Record<string, unknown>>;
      }).depots[0]).toMatchObject({ commit, offeredCommit: newer });

      /**
       * Angenommen wird, indem der Commit genannt wird - ein Angebot, das sich
       * zwischen Frage und Antwort bewegt hat, fällt damit auf, statt still
       * das Falsche zu übernehmen (ADR 0137 IN5s Gestalt an höherem Einsatz).
       */
      await runtime.acceptDepotOffer(remote, newer);
      expect(((await runtime.readDepots()) as {
        depots: ReadonlyArray<Record<string, unknown>>;
      }).depots[0]).toMatchObject({ commit: newer });
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
   *
   * Gepflanzt: nennt der Client ein Modell, das dieser Host nicht bedient,
   * kommt der Eintrag unter dem falschen Namen zurück.
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

    const { living, delegationId, signedDelegation } = await foundedDevice({
      core,
      prefix: 'pico-companion-model-',
    });

    /**
     * Und dieselbe Notiz noch einmal, diesmal von einer nachgewiesenen Person.
     * Zwei Räume, weil die Herkunft am Material hängt und nicht an der Frage:
     * ein Raum, in dem etwas Fremdes liegt, verlangt mehr, auch wenn daneben
     * Eigenes liegt.
     */
    const session = await openIdentitySession({
      daemon: living,
      core,
      delegation: signedDelegation,
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

    const { runtime } = await runtimeFor({
      core,
      living,
      delegationId,
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

      /**
       * **Und die Betreiberfläche verengt, was das Gerät gemessen hat** (ADR
       * 0152 SE4, Befund B55).
       *
       * `POST /api/model/providers/:entryId/narrowing` hat einen Aufrufer -
       * `narrowModelProvider` in `apps/web/src/api.ts` - und hatte nie einem
       * getrennten Prozess mit einem Erfolg geantwortet. Der Grund ist die
       * Arbeitsteilung: der Eintrag entsteht auf dem Gerät der Person, über
       * Link, und verengt wird er auf der Fläche des Betreibers. Keine der
       * beiden Testmengen hatte beide Hälften.
       *
       * Hier stehen sie beide. Die Anfrage wird - wie die anderen
       * Foundation-Schritte in dieser Datei - von Hand gestellt und nicht über
       * den Web-Client geschickt: dieses Paket hängt nicht an `@pico/web`, und
       * eine Abhängigkeit dafür einzuführen wäre eine Änderung am Baum für
       * einen Testweg.
       *
       * **Und sie braucht eine Betreibersitzung**, anders als die
       * Ereignis-Schritte weiter oben: `narrowing` steht in der Klasse
       * `host-admin`, und `loopback-dev` lässt sie nicht durch. Gemessen und
       * nicht angenommen - der erste Lauf bekam 401, und das ist die richtige
       * Antwort: wer die Maschine des Hauses enger stellt, spricht als
       * Betreiber und nicht als Gerät.
       */
      const operatorPassphrase = 'walked-operator-passphrase-2026';
      const bootstrapped = await fetch(`${core.apiBaseUrl}/api/auth/bootstrap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bootstrapCode: core.operatorBootstrapCode,
          passphrase: operatorPassphrase,
        }),
      });
      expect(bootstrapped.status, await bootstrapped.clone().text()).toBe(201);
      const loggedIn = await fetch(`${core.apiBaseUrl}/api/auth/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passphrase: operatorPassphrase }),
      });
      expect(loggedIn.status, await loggedIn.clone().text()).toBe(201);
      const operatorSession = ((await loggedIn.json()) as { session: string }).session;
      const asOperator = {
        'content-type': 'application/json',
        authorization: `Bearer ${operatorSession}`,
      };

      const narrowed = await fetch(
        `${core.apiBaseUrl}/api/model/providers/${encodeURIComponent('a-model:measured')}/narrowing`,
        {
          method: 'POST',
          headers: asOperator,
          body: JSON.stringify({ contextTokens: 2_048, concurrentJobs: 1 }),
        },
      );
      expect(narrowed.status, await narrowed.clone().text()).toBe(200);
      expect(await narrowed.json())
        .toEqual({ narrowing: { contextTokens: 2_048, concurrentJobs: 1 } });

      /**
       * **Und mehr als gemessen wurde, geht nicht.** Eine Verengung, die über
       * den Befund hinausginge, wäre keine - und die Ablehnung nennt die Zahl,
       * gegen die gehalten wurde, weil „zu gross" ohne sie eine Person raten
       * lässt (ADR 0152 SE4 mit ADR 0119 Q5).
       */
      const tooWide = await fetch(
        `${core.apiBaseUrl}/api/model/providers/${encodeURIComponent('a-model:measured')}/narrowing`,
        {
          method: 'POST',
          headers: asOperator,
          body: JSON.stringify({ contextTokens: 1_000_000 }),
        },
      );
      expect(tooWide.status).toBe(409);
      expect(await tooWide.json()).toMatchObject({ measured: expect.anything() });

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

  /**
   * ADR 0154 RO1/RO3/RO5. Ein Relay beanspruchen, ein Konto ausstellen, es
   * beenden und das Relay wieder vergessen — vom Fenster aus, gegen ein
   * laufendes Relay.
   *
   * **Warum gerade diese fünf.** Befund B40 hat gezählt, welche der
   * zweiundsechzig Fenstermethoden nie ein Realprozess-Weg aufruft: 31, und für
   * die meisten läuft der Weg *darunter* trotzdem. Die Relay-Betreiber-Familie
   * ist die Ausnahme — sie war auf keiner Schicht gegangen. `apps/relay` hat
   * einen eigenen Realprozess-Test, aber der treibt das Relay über HTTP von
   * Hand; was hier zum ersten Mal fährt, ist der Weg, den eine Person nimmt.
   *
   * **Ein Relay zu betreiben ist ein anderer Hut als ein Pico zu haben**, und
   * das ist an diesem Weg zu sehen: nichts davon berührt das Home. Der Zugang
   * liegt verschlüsselt neben dem Profil, nicht im Vault — er gehört diesem
   * Gerät und keiner Identität —, und `forgetRelay` nimmt die Zeile hier weg,
   * ohne dem Relay etwas zu sagen.
   *
   * Der Schlüsselbund ist ein Doppelgänger, und das ist die Grenze dieses Wegs:
   * geprüft wird der Ablauf und nicht, dass ein echter Keyring den Zugang
   * schützt. Was der echte tut, misst `companion:release-check` an anderer
   * Stelle.
   */
  it('beansprucht ein Relay, stellt ein Konto aus und nimmt beides zurück', async () => {
    const relay = await startRelay();
    const core = await startCore();
    const { living, delegationId } = await foundedDevice({ core, prefix: 'pico-companion-relay-' });

    const { runtime } = await runtimeFor({
      core,
      living,
      delegationId,
      platformSecrets: standInKeystore(),
    });

    try {
      expect(await runtime.readRelays()).toEqual([]);

      expect(await runtime.claimRelay({
        baseUrl: relay.operatorBaseUrl,
        claimCode: relay.claimCode,
      })).toEqual({ operator: 'relay.example.test' });

      /**
       * Ein zweites Beanspruchen desselben Relays wird hier abgelehnt und nicht
       * erst dort: zwei Zeilen für eine Maschine wären zwei Zugänge für einen
       * Betreiber, und der Code ist ohnehin verbraucht.
       */
      await expect(runtime.claimRelay({
        baseUrl: relay.operatorBaseUrl,
        claimCode: relay.claimCode,
      })).rejects.toThrow('relay_already_claimed_here');

      const claimed = await runtime.readRelays();
      expect(claimed).toHaveLength(1);
      expect(claimed[0]).toMatchObject({
        baseUrl: relay.operatorBaseUrl,
        operator: 'relay.example.test',
        accounts: [],
      });

      /**
       * ADR 0154 RO3. Der Zugang kommt einmal zurück und wird nirgends
       * behalten - die Liste danach kennt das Konto und nicht sein Geheimnis.
       */
      const account = await runtime.createRelayAccount({
        baseUrl: relay.operatorBaseUrl,
        mailboxQuota: 4,
        maxCapacity: 16,
      });
      expect(account.credential).not.toBe('');
      expect(account.accountRef).not.toBe('');

      const withAccount = await runtime.readRelays();
      expect(withAccount[0]?.accounts).toEqual([
        expect.objectContaining({
          accountRef: account.accountRef,
          status: 'active',
          mailboxQuota: 4,
          maxCapacity: 16,
          openMailboxes: 0,
        }),
      ]);
      expect(JSON.stringify(withAccount)).not.toContain(account.credential);

      /**
       * ADR 0154 RO5. Was endete, sagt das Relay, weil es sonst niemand
       * beobachten kann: wieviele Postfächer geschlossen und wieviele Pakete
       * fallengelassen wurden.
       */
      expect(await runtime.revokeRelayAccount({
        baseUrl: relay.operatorBaseUrl,
        accountRef: account.accountRef,
      })).toEqual({ mailboxesEnded: 0, packetsDropped: 0 });
      expect((await runtime.readRelays())[0]?.accounts)
        .toEqual([expect.objectContaining({ status: 'revoked' })]);

      // Vergessen ist eine Sache dieses Geräts. Das Relay läuft weiter und
      // erfährt nichts davon.
      await runtime.forgetRelay(relay.operatorBaseUrl);
      expect(await runtime.readRelays()).toEqual([]);
    } finally {
      await runtime.stop();
      await relay.stop();
    }
  }, 300_000);

  /**
   * ADR 0148 EX1/EX2/EX5 mit ADR 0149 RS2. Zwei Enden tauschen Adressen, über
   * ein Relay, das wirklich läuft.
   *
   * `home.link.mailbox.exchange` war eine der neun Türen aus Befund B36, und
   * ihr Grund war ein anderer als bei den übrigen: die Geräteseite des
   * Relay-Wegs hat keinen Produktaufrufer, und `check-capability-reach` lässt
   * sie seit dem 2026-08-24 namentlich begründet stehen — „nothing starts it
   * because nothing starts the sweep below it". Das ändert dieser Weg nicht.
   * Was er ändert, ist die andere Hälfte: dass der Weg *trägt*, wenn ihn
   * jemand startet. Bis heute lief er nur gegen erfundene Gegenstellen.
   *
   * **Drei echte Prozesse**, und der Tausch berührt alle drei: das Gerät gibt
   * sich eine Eingangsadresse beim Betreiber, das Home legt sich beim Relay
   * ein Postfach an und gibt seine zurück, und *registriert wird vor dem
   * Aushändigen* — ein Gerät mit einer Adresse, die es beim Betreiber nicht
   * gibt, schriebe ins Leere, und beide Seiten hielten den Tausch für
   * gelungen.
   *
   * Der direkte Weg bleibt davon unberührt, und das ist der Grund, warum
   * dieser Tausch ausgerechnet über ihn reist: er funktioniert genau dann,
   * wenn das Relay nicht gebraucht wird.
   *
   * Gepflanzt: gibt sich das Gerät beim zweiten Mal dieselbe Eingangsadresse,
   * ist der Tausch keine Rotation mehr und der Weg sagt es.
   */
  it('tauscht Postfachadressen mit seinem Home, über ein laufendes Relay', async () => {
    const relay = await startRelay();

    // Die Betreiberhälfte steht im Weg nebenan; hier zählt, dass es ein Konto
    // gibt, unter dem ein Home Postfächer anlegen darf.
    const claimed = await fetch(`${relay.operatorBaseUrl}/operator/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ claimCode: relay.claimCode }),
    });
    expect(claimed.status, await claimed.clone().text()).toBe(200);
    const operatorCredential = ((await claimed.json()) as { credential: string }).credential;
    const created = await fetch(`${relay.operatorBaseUrl}/operator/accounts/create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-pico-relay-operator': operatorCredential,
      },
      /**
       * Dieselben Zahlen, die das Fenster einsetzt (4 und 64). Die Obergrenze
       * muss über der Postfachgrösse liegen, mit der ein Home sich anmeldet -
       * ein Konto mit einer kleineren nimmt kein Postfach an, und das Home
       * schreibt den Grund auf seinen eigenen Kanal, während das Gerät nur
       * `unavailable` sieht.
       */
      body: JSON.stringify({ mailboxQuota: 4, maxCapacity: 64 }),
    });
    expect(created.status, await created.clone().text()).toBe(200);
    const accountCredential = ((await created.json()) as { credential: string }).credential;

    /**
     * ADR 0149 RS2: der Zugang *ist* die Kennung. Das Home bekommt beides über
     * seine Umgebung, was es als vom Betreiber geerbt aufschreibt - eine
     * Entscheidung, die eine Person später überschreiben kann, ohne dass diese
     * hier je als ihre ausgegeben wird.
     */
    const core = await startCore({
      PICO_LINK_RELAY_BASE_URL: relay.mailboxBaseUrl,
      PICO_LINK_RELAY_OPERATOR: 'relay.example.test',
      PICO_LINK_RELAY_ACCOUNT_ID: accountCredential,
    });
    const { living, delegationId } = await foundedDevice({ core, prefix: 'pico-companion-mailbox-' });

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
        delegationId,
      },
    });
    const profile = profileFor(core, delegationId);

    try {
      const exchanged = await exchangePicoCompanionLinkMailbox({
        linkClient,
        profile,
        operator: 'relay.example.test',
      }).catch((refused: unknown) => {
        // Der Grund liegt im Home, nicht in der Antwort: es sagt auf seinem
        // eigenen Kanal, warum es die Registrierung nicht bekommen hat.
        throw new Error(`${String(refused)} | home said: ${core.logs().slice(-2_000)}`);
      });

      // ADR 0148 EX2. Das Home sagt, welchem Gerät es ausgestellt hat, und
      // dieses Gerät weiss, womit es unterschrieben hat.
      expect(exchanged.deviceSigningKeyFingerprintHex).toBe(signing.keyFingerprintHex);
      expect(exchanged.inbound).toContain('relay.example.test');
      expect(exchanged.outbound).toContain('relay.example.test');
      // Nichts legitimes gibt die eigene Adresse zurück; wer sie ablegte,
      // schriebe in sein eigenes Postfach.
      expect(exchanged.outbound).not.toBe(exchanged.inbound);

      /**
       * ADR 0148 EX5. Ein zweiter Tausch ist die Rotation und kein Leerlauf -
       * beide Seiten geben eine frische Adresse aus, und das ist zugleich das
       * Mittel gegen ein geflutetes Postfach.
       */
      const again = await exchangePicoCompanionLinkMailbox({
        linkClient,
        profile,
        operator: 'relay.example.test',
      });
      expect(again.inbound).not.toBe(exchanged.inbound);
      expect(again.outbound).not.toBe(exchanged.outbound);
    } finally {
      await daemonClient.close();
      await relay.stop();
    }
  }, 300_000);


  /**
   * ADR 0116 W1/W5 mit ADR 0071 - eine Person fragt ihre eigene Erinnerung,
   * behält die Antwort und nimmt beides wieder zurück.
   *
   * **Dieser Weg war bis zum 2026-09-01 unmöglich** (Befund B39): ein Rückruf
   * holt Material aus einem Speicher und verlangt damit die weitere Erlaubnis;
   * die gab es nur mit einem Zugang; und einen Zugang nicht über einfaches
   * HTTP. Ein Modell auf der eigenen Maschine konnte gemessen und entschieden
   * werden und beantwortete danach nichts. Seit PV4 einen erklärten eigenen
   * Host ausnimmt, geht er - und dass er geht, ist die Aussage dieses Tests.
   *
   * Die Notiz wird unter einer identitätsgebundenen Sitzung geschrieben, weil
   * sie einer nachgewiesenen Person gehören soll; für die *Erlaubnis* spielt
   * das seit der Ausnahme keine Rolle mehr, für die Herkunft in der Ablage
   * schon.
   */
  it('fragt die eigene Erinnerung, behält die Antwort und nimmt sie zurück', async () => {
    const modelHost = await startFakeModelHost();
    /**
     * **Der Takt steht hier auf einer Stunde, und das ist die Aussage.** Seit
     * dem 2026-09-01 löst eine gestellte Frage den Lauf selbst aus (Befund
     * B42); käme die Antwort vom Zeitgeber, wäre dieser Weg nach einer Stunde
     * fertig statt nach Sekunden.
     */
    const core = await startCore({ PICO_MODEL_JOB_SWEEP_INTERVAL_MS: '3600000' });
    const { living, delegationId, signedDelegation } = await foundedDevice({
      core,
      prefix: 'pico-companion-recall-',
    });
    const session = await openIdentitySession({ daemon: living, core, delegation: signedDelegation });
    const written = await fetch(`${core.apiBaseUrl}/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` },
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
    expect(written.status, await written.clone().text()).toBe(201);
    const { runtime } = await runtimeFor({ core, living, delegationId });

    try {
      expect(await runtime.askModelProviderMeasurement({
        reach: modelHost.reach,
        model: 'a-model:measured',
      })).toEqual({ entryId: 'a-model:measured', state: 'running' });
      await eventually(async () => {
        const entries = (await runtime.readModelProviderMeasurements()) as ReadonlyArray<{
          entryId: string;
          state: string;
        }>;
        const entry = entries.find((candidate) => candidate.entryId === 'a-model:measured');
        return entry !== undefined && entry.state !== 'running' ? entry : undefined;
      });
      /**
       * ADR 0151 PV4, wie er seit dem 2026-09-01 lautet: eine Maschine, die
       * die Person als ihre erklärt, trägt geholte Erinnerung ohne Zugang -
       * ein Zugang beantwortet, *wer* am anderen Ende ist, und hier gibt es
       * kein anderes Ende. Über einfaches HTTP wäre ein Zugang ohnehin
       * abgewiesen worden (PV5), was genau die Sackgasse war.
       */
      await runtime.decideModelProvider({
        entryId: 'a-model:measured',
        providerClass: 'declared_own_host',
        carries: 'live_turn_and_retrieved_memory',
      });

      // ADR 0082. „Darf dieses Home benutzen" ist nicht „darf diesen Raum
      // lesen" - das Gerät erteilt sich den Lesezugang selbst.
      await runtime.grantDomainRead({ privacyDomain: 'household' });
      const ask = await runtime.askRecall({
        privacyDomain: 'household',
        question: 'Was stand am Monatsanfang auf dem Zähler?',
      });
      expect(ask.included).toBeGreaterThan(0);
      expect(ask.carries).toBe('live_turn_and_retrieved_memory');

      const answered = await eventually(async () => {
        const recalls = await runtime.readRecalls();
        const recall = recalls.find((candidate) => candidate.jobId === ask.jobId);
        return recall?.settledAt === undefined ? undefined : recall;
      });
      expect(answered.outcome, JSON.stringify(answered)).toBe('answered');

      /**
       * ADR 0116 W5 mit ADR 0049 und ADR 0071. Behalten ist die eigene Schrift
       * der Person, und die beiden Rücknahmen sind zwei Sätze: „ich will diese
       * Notiz nicht mehr" und „ich will diesen Austausch nicht mehr" nehmen
       * Verschiedenes zurück.
       */
      const kept = await runtime.keepRecall(ask.jobId);
      expect(kept).not.toBe('');
      await runtime.forgetMemory(kept);
      await runtime.forgetRecall(ask.jobId);
      expect((await runtime.readRecalls()).map((recall) => recall.jobId))
        .not.toContain(ask.jobId);
    } finally {
      await runtime.stop();
      await modelHost.close();
    }
  }, 300_000);
});

interface RunningCore {
  linkBaseUrl: string;
  /**
   * Was das Home auf seinen eigenen Kanal geschrieben hat.
   *
   * Ein Fehlschlag, dessen Erklärung im Prozess daneben liegt und nirgends
   * ankommt, kostet einen ganzen Durchgang, nur um ihn noch einmal zu
   * erzeugen - Befund B21, eine Ebene höher.
   */
  logs(): string;
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

/**
 * `overrides` statt einer zweiten Startfunktion: was ein Home zusätzlich
 * bekommt - etwa ein Relay - ist eine Umgebung und keine andere Sorte Home.
 */
async function startCore(overrides: Record<string, string> = {}): Promise<RunningCore> {
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
      ...overrides,
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
    logs: () => output,
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

/**
 * ADR 0154. Ein laufendes Relay, aus demselben `dist` gestartet wie das Home.
 *
 * Der Beanspruchungscode steht in der ersten Zeile, die es schreibt: ein Relay
 * ohne Betreiber sagt, wie es einen bekommt, und sagt es auf seinen eigenen
 * lokalen Kanal, weil es sonst niemanden gibt, dem es das sagen könnte.
 */
async function startRelay(): Promise<{
  operatorBaseUrl: string;
  mailboxBaseUrl: string;
  claimCode: string;
  stop(): Promise<void>;
}> {
  const mailboxPort = await freePort();
  let healthPort = await freePort();
  while (healthPort === mailboxPort) {
    healthPort = await freePort();
  }
  let operatorPort = await freePort();
  while (operatorPort === mailboxPort || operatorPort === healthPort) {
    operatorPort = await freePort();
  }
  const data = tempDirectory('pico-relay-');
  const child = spawn(process.execPath, [RELAY], {
    env: {
      ...process.env,
      PICO_RELAY_OPERATOR: 'relay.example.test',
      PICO_RELAY_HOST: '127.0.0.1',
      PICO_RELAY_PORT: String(mailboxPort),
      PICO_RELAY_HEALTH_PORT: String(healthPort),
      PICO_RELAY_OPERATOR_PORT: String(operatorPort),
      PICO_RELAY_DATABASE_PATH: join(data, 'relay.sqlite'),
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
    await waitFor(() => output.includes('relay_unclaimed'), 'relay_ready');
  } catch {
    throw new Error(`relay_ready_failed:${output}`);
  }
  const unclaimed = output.split('\n').map((line) => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }).find((line) => line?.event === 'relay_unclaimed');
  if (unclaimed === undefined) {
    throw new Error(`relay_claim_code_not_logged:${output}`);
  }
  return {
    operatorBaseUrl: `http://127.0.0.1:${operatorPort}`,
    // Wo Postfächer angelegt und geleert werden - eine andere Tür als die des
    // Betreibers, weil das zwei Rollen sind und nicht zwei Pfade.
    mailboxBaseUrl: `http://127.0.0.1:${mailboxPort}`,
    claimCode: String(unclaimed.claimCode),
    stop: async () => {
      child.kill('SIGTERM');
    },
  };
}

/**
 * ADR 0113. Der Schlüsselbund, den dieses Gerät im Betrieb hat - hier ein
 * Doppelgänger.
 *
 * Er ist ein Port, damit die Laufzeit nicht weiss, wo ein Geheimnis liegt, und
 * ein Doppelgänger ist genau das, wofür ein Port da ist. Was er *nicht* prüft,
 * steht im Test daneben: dass ein echter Keyring den Zugang schützt, misst
 * `companion:release-check` und nicht dieser Weg.
 */
function standInKeystore(): PicoCompanionPlatformSecretPort {
  return {
    platform: 'linux',
    selectedBackend: () => 'gnome_libsecret',
    isEncryptionAvailable: () => true,
    // Umkehrbar und nicht geheim: dieser Weg fragt, ob der Ablauf trägt.
    encryptString: (plainText) => Buffer.from(`stand-in:${plainText}`, 'utf8'),
    decryptString: (encrypted) => Buffer.from(encrypted).toString('utf8').replace(/^stand-in:/u, ''),
  };
}

/**
 * Ein gegründetes Gerät: ein Daemon mit den drei Schlüsseln, drei Zusagen und
 * die Gründungszeremonie über Link.
 *
 * Herausgehoben, weil derselbe Block hier zehnmal stand. Eine Wahrheit, die
 * zehnmal geschrieben ist, driftet - und das Erste, was driftet, ist die Frage,
 * ob zwei Wege dasselbe Gerät meinen.
 */
async function foundedDevice(input: {
  core: RunningCore;
  prefix: string;
}): Promise<{ living: RunningDaemon; delegationId: string; signedDelegation: Record<string, unknown> }> {
  const living = await startDaemon(input.prefix, [
    ['pico_identity', identity],
    ['device_signing', signing],
    ['device_key_agreement', agreement],
  ]);
  await startApprover(living, 'pico_identity', identity, identityPassphrase);
  await startApprover(living, 'device_signing', signing, signingPassphrase);
  await startApprover(living, 'device_key_agreement', agreement, agreementPassphrase);
  const founded = await runFounding(living, input.core);
  expect(founded.code, founded.stderr).toBe(0);
  const founding = JSON.parse(founded.stdout) as {
    foundingRecord: {
      firstDeviceDelegation: Record<string, unknown> & { record: { delegationId: string } };
    };
  };
  return {
    living,
    delegationId: founding.foundingRecord.firstDeviceDelegation.record.delegationId,
    signedDelegation: founding.foundingRecord.firstDeviceDelegation,
  };
}

/** Das Profil, das dieses Gerät über sein Home führt. */
function profileFor(core: RunningCore, delegationId: string): PicoCompanionProfile {
  return {
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
      delegationId,
    },
  };
}

/**
 * Die Laufzeit des Fensters über einem gegründeten Gerät.
 *
 * Getrennt vom Gründen, weil zwischen beiden etwas passieren darf - eine
 * Notiz, die einer nachgewiesenen Person gehört, braucht eine Sitzung, und die
 * gibt es erst nach der Gründung.
 */
async function runtimeFor(input: {
  core: RunningCore;
  living: RunningDaemon;
  delegationId: string;
  platformSecrets?: PicoCompanionPlatformSecretPort;
  notify?: (state: PicoCompanionPresentation) => void;
}): Promise<{
  runtime: Awaited<ReturnType<typeof startPicoCompanionShellRuntime>>;
  profilePath: string;
}> {
  const profilePath = join(tempDirectory('pico-companion-profile-'), 'profile.json');
  writePicoCompanionProfile(profilePath, profileFor(input.core, input.delegationId));
  const runtime = await startPicoCompanionShellRuntime({
    profilePath,
    vaultSocketPath: input.living.socketPath,
    sodium,
    ...(input.platformSecrets === undefined ? {} : { platformSecrets: input.platformSecrets }),
    notifications: createPicoCompanionPresentationAdapter({
      present: () => {},
      notify: (state) => { input.notify?.(state); },
    }),
  });
  return { runtime, profilePath };
}

/**
 * Ein Depot, wie sein Autor es veröffentlicht hätte - ein echtes Repository mit
 * einem Manifest, dem ausgelieferten Zulieferer und einer Zeile Korpus.
 *
 * `file://` ist eine Adresse und ein blosser Pfad nicht: ein Depot wird über die
 * Stelle benannt, von der sein Code kommt, und `../depots/x` ist eine Position
 * relativ zu dem, der fragt (ADR 0143 DP1).
 *
 * Der Zulieferer wird aus `bridges/` hereinkopiert statt nachgebaut. Ein
 * zweiter, der nur so aussieht, wäre eine zweite Auffassung davon, was ein
 * Zulieferer ist - und der Weg, der ihn wirklich laufen lässt, liefe gegen die
 * Nachbildung.
 */
function createDepotRemote(): {
  remote: string;
  commit: string;
  git: (args: readonly string[]) => string;
} {
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
  cpSync(
    join(import.meta.dirname, '..', '..', '..', 'bridges', 'suppliers', 'git-library', 'index.js'),
    join(depot, 'suppliers', 'git-library', 'index.js'),
  );
  writeFileSync(join(depot, 'note.md'), 'Der Zählerstand am Monatsanfang war 41870.\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'the depot as its author published it']);
  return { remote: `file://${depot}`, commit: git(['rev-parse', 'HEAD']).trim(), git };
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
