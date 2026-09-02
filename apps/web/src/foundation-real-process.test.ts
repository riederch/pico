import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RealtimeMessage } from './types.js';
import { realtimeMessageType } from './protocol-values.js';
import { connectRealtime } from './websocket.js';
import {
  changeOperatorPassphrase,
  createRetentionPolicy,
  createTimeBoundEntry,
  decideMemoryEncryption,
  decideRelayIdentity,
  deleteRetentionPolicy,
  listDomainContent,
  listModelProviders,
  listRetentionPolicies,
  loadDashboardSnapshot,
  loginOperator,
  mintRealtimeTicket,
  readMemoryEncryption,
  readRelayIdentity,
  revokeAllSessions,
  setModuleActivation,
  setModuleCapture,
  shredPrivacyDomain,
  updateRetentionPolicy,
} from './api.js';

/**
 * Die Foundation-Fläche gegen ein laufendes Home, statt gegen ein
 * vorgetäuschtes `fetch`.
 *
 * **Warum das fehlte.** `api.test.ts` prüft zweiundzwanzigmal gegen einen
 * ausgetauschten `fetch`: es hält fest, *was* geschickt wird, und das ist eine
 * andere Aussage als die, dass ein Home es annimmt. Genau diese Lücke hat die
 * Befunde B31, B34 und B36 durchgelassen - dreimal ein Aufrufer, dessen Bytes
 * kein Home je gesehen hatte, und dreimal ein Bedienelement, das nie
 * funktioniert hat.
 *
 * Zwanzig Funktionen tragen diese Fläche, und keine von ihnen war je gegen
 * einen echten Prozess gefahren. Dieser Weg fährt achtzehn davon der Reihe
 * nach, in der Ordnung, in der eine Person sie benutzt: anmelden, nachsehen,
 * einstellen, etwas anlegen, es wieder wegnehmen, und zuletzt die Sitzungen
 * beenden, mit denen das alles ging.
 *
 * **Kein Browser.** Die Fläche ist eine Schicht aus `fetch`-Aufrufen, und die
 * fährt in Node genauso wie im Fenster; was ein Browser zusätzlich prüfte, ist
 * das Zeichnen und nicht das Annehmen.
 */
const dirs: string[] = [];
const children: ChildProcess[] = [];

afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill('SIGTERM');
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const OPERATOR_PASSPHRASE = 'a long enough operator passphrase';
const NEXT_PASSPHRASE = 'another long enough operator passphrase';

interface RunningHome {
  baseUrl: string;
  operatorBootstrapCode: string;
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => { resolve(port); });
    });
  });
}

async function waitFor(condition: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => { setTimeout(resolve, 100); });
  }
  throw new Error(`timed_out_waiting_for:${label}`);
}

async function startHome(
  options: { memoryEncryption?: boolean } = {},
): Promise<RunningHome> {
  const port = await freePort();
  let linkPort = await freePort();
  while (linkPort === port) {
    linkPort = await freePort();
  }
  const data = mkdtempSync(join(tmpdir(), 'pico-web-core-'));
  dirs.push(data);
  const child = spawn(process.execPath, [
    join(import.meta.dirname, '..', '..', 'core', 'dist', 'index.js'),
  ], {
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
      /**
       * ADR 0104. Die Entscheidung gilt beim *Start*, nicht beim Umlegen -
       * deshalb steht sie hier und nicht als Aufruf im Durchlauf. Genau das
       * ist der Grund, warum das Schreddern im Durchlauf darueber nur
       * abgelehnt wird: dieses Home liegt im Klartext.
       */
      ...(options.memoryEncryption === true ? { PICO_MEMORY_ENCRYPTION: 'true' } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream!.setEncoding('utf8');
    stream!.on('data', (chunk: string) => { output += chunk; });
  }
  try {
    await waitFor(
      () => output.includes('Server listening at') && output.includes('operatorBootstrapCode'),
      'home_ready',
    );
  } catch {
    throw new Error(`home_ready_failed:${output}`);
  }
  const bootstrap = output.split('\n').map((line) => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }).find((line) => line?.operatorBootstrapCode !== undefined);
  if (bootstrap === undefined) {
    throw new Error(`bootstrap_code_not_logged:${output}`);
  }
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    operatorBootstrapCode: String(bootstrap.operatorBootstrapCode),
  };
}

/**
 * ADR 0076. Den ersten Betreiber gibt es, bevor die Fläche etwas kann - und
 * dafür hat sie keine Funktion, weil das Fenster diesen Schritt nicht anbietet:
 * der Code steht auf dem lokalen Kanal des Homes, und wer ihn liest, sitzt
 * schon davor.
 */
async function bootstrapOperator(home: RunningHome): Promise<void> {
  const response = await fetch(`${home.baseUrl}/api/auth/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      bootstrapCode: home.operatorBootstrapCode,
      passphrase: OPERATOR_PASSPHRASE,
    }),
  });
  if (response.status !== 201) {
    throw new Error(`operator_bootstrap_failed:${response.status}:${await response.text()}`);
  }
}

describe('the Foundation surface against a running Home', () => {
  it('meldet an, stellt ein, legt an, nimmt weg und beendet die Sitzungen', async () => {
    const home = await startHome();
    await bootstrapOperator(home);

    const session = await loginOperator(home.baseUrl, OPERATOR_PASSPHRASE);
    expect(session).not.toBe('');
    const access = { operatorSession: session };

    /**
     * Das Erste, was jemand sieht. Drei Lesevorgänge auf einmal, und dass sie
     * zusammen zurückkommen, sagt mehr als jeder einzeln: die Fläche zeigt
     * keine halbe Übersicht.
     */
    const snapshot = await loadDashboardSnapshot(home.baseUrl, access);
    expect(snapshot.health).toMatchObject({ ok: true, service: 'pico-home-core' });
    expect(snapshot.systemStatus).toBeDefined();
    expect(Array.isArray(snapshot.events)).toBe(true);

    /**
     * ADR 0104. Die Entscheidung wird jetzt aufgeschrieben und gilt beim
     * nächsten Start - der Schlüsselspeicher steht, bevor dieser Prozess seine
     * Datenbank geöffnet hat. Deshalb ändert sich `enabled` hier *nicht*, und
     * `decided` schon: die Fläche soll „aufgeschrieben" nicht als „umgestellt"
     * zeigen, sonst glaubte jemand, sein Inhalt liege anders, während er genau
     * so liegt wie vorher.
     */
    const encryptionBefore = await readMemoryEncryption(home.baseUrl, access);
    expect(encryptionBefore).toMatchObject({ decided: false });
    await decideMemoryEncryption(home.baseUrl, access, !encryptionBefore.enabled);
    const encryptionAfter = await readMemoryEncryption(home.baseUrl, access);
    expect(encryptionAfter.decided).toBe(true);
    expect(encryptionAfter.enabled).toBe(encryptionBefore.enabled);

    // ADR 0127 M3/M4. Ein Modul abschalten sagt, was dabei wegfällt.
    const deactivated = await setModuleActivation(home.baseUrl, access, {
      identifier: 'calendar',
      active: false,
    });
    expect(deactivated.modules.find((entry) => entry.identifier === 'calendar')?.active)
      .toBe(false);
    await setModuleActivation(home.baseUrl, access, { identifier: 'calendar', active: true });

    // ADR 0129 SR6. Aufzeichnen ist eine zweite Frage, und ihre Voreinstellung
    // ist nein - das Gegenteil der Aktivierung darüber.
    const capturing = await setModuleCapture(home.baseUrl, access, {
      identifier: 'spatial-recall',
      capturing: true,
    });
    expect(capturing.find((entry) => entry.identifier === 'spatial-recall')?.capturing)
      .toBe(true);

    // ADR 0071. Eine Aufbewahrungsregel, angelegt, geändert und weggenommen.
    expect(await listRetentionPolicies(home.baseUrl, access)).toEqual([]);
    const policy = await createRetentionPolicy(home.baseUrl, access, {
      retentionPolicyId: 'keep-a-year',
      displayName: 'A year, and then it goes',
      mode: 'delete_after_max_age',
      maxAgeDays: 365,
    });
    expect(policy.retentionPolicyId).toBe('keep-a-year');
    const updated = await updateRetentionPolicy(home.baseUrl, access, 'keep-a-year', {
      displayName: 'A year and a day',
      mode: 'delete_after_max_age',
      maxAgeDays: 366,
    });
    expect(updated.maxAgeDays).toBe(366);
    expect(await listRetentionPolicies(home.baseUrl, access)).toHaveLength(1);
    await deleteRetentionPolicy(home.baseUrl, access, 'keep-a-year');
    expect(await listRetentionPolicies(home.baseUrl, access)).toEqual([]);

    // ADR 0118 O1. Ein Termin, den die Fläche anlegt und danach wiederfindet.
    const entry = await createTimeBoundEntry(home.baseUrl, access, {
      deviceId: 'pico-web-walk',
      privacyDomain: 'household',
      kind: 'appointment',
      title: 'Die Heizung wird gewartet.',
      dueAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
    });
    expect(entry.memoryItemId).not.toBe('');
    const content = await listDomainContent(home.baseUrl, access, 'household');
    expect(content.items.map((item) => item.memoryItemId)).toContain(entry.memoryItemId);

    // ADR 0152. Noch nie etwas gemessen heisst: eine leere Liste, keine Stille.
    expect(await listModelProviders(home.baseUrl, access)).toEqual([]);

    /**
     * ADR 0147. Wohin dieses Home seine Post schicken lässt - und die
     * Abwesenheit ist eine Abwesenheit: ein Home ohne Relay-Konto erreicht
     * andere Picos direkt und ist nicht kaputt (ADR 0118 O4). `decided` fehlt
     * also, statt `false` zu sein.
     */
    expect(await readRelayIdentity(home.baseUrl, access)).toEqual({ mailboxes: 0 });
    await decideRelayIdentity(home.baseUrl, access, {
      operator: 'relay.example.test',
      accountId: 'account-for-this-home',
    });
    expect(await readRelayIdentity(home.baseUrl, access)).toMatchObject({
      decided: true,
      operator: 'relay.example.test',
    });

    // ADR 0030. Ein Ticket für den Ereignisstrom, das für sich allein steht.
    expect(await mintRealtimeTicket(home.baseUrl, access)).not.toBe('');

    /**
     * ADR 0072. Einen Raum schreddern nimmt seine Schlüsselfassungen mit - und
     * dieses Home liegt im Klartext, weil die Entscheidung von oben erst beim
     * nächsten Start gilt. Also lehnt es ab, und zwar mit dem Satz, der den
     * Grund trägt: Schlüssel zu zerstören schützt nichts, wo nichts damit
     * verschlossen ist. Genau das ist der Weg, den eine Person hier nimmt,
     * wenn sie die Verschlüsselung gerade erst eingeschaltet hat.
     */
    await expect(shredPrivacyDomain(home.baseUrl, access, {
      privacyDomain: 'household',
      confirm: 'household',
      reason: 'walked by a test',
    })).rejects.toThrow('Crypto-shred requires memory encryption');

    /**
     * Zuletzt die beiden, die sich selbst die Grundlage entziehen. Das neue
     * Kennwort gilt, das alte nicht mehr, und danach beendet ein Widerruf jede
     * Sitzung - auch die, die ihn geschickt hat.
     */
    const changed = await changeOperatorPassphrase(home.baseUrl, access, {
      currentPassphrase: OPERATOR_PASSPHRASE,
      passphrase: NEXT_PASSPHRASE,
    });
    expect(changed.revokedSessions).toBeGreaterThan(0);
    await expect(loginOperator(home.baseUrl, OPERATOR_PASSPHRASE))
      .rejects.toThrow('Operator passphrase is invalid.');

    const second = await loginOperator(home.baseUrl, NEXT_PASSPHRASE);
    const revoked = await revokeAllSessions(home.baseUrl, { operatorSession: second });
    expect(revoked.revokedSessions).toBeGreaterThan(0);
    await expect(listRetentionPolicies(home.baseUrl, { operatorSession: second }))
      .rejects.toThrow();
  }, 180_000);

  /**
   * ADR 0039 mit ADR 0030. Der Ereignisstrom, die eine Hälfte dieser Fläche,
   * die keine Frage-und-Antwort ist.
   *
   * `websocket.test.ts` prüft heute nur den URL-Bau; `connectRealtime` selbst
   * hatte keinen Test und hat noch nie eine Verbindung hergestellt. Das ist
   * dieselbe Lage wie bei den zwanzig Funktionen daneben, nur schärfer: hier
   * wird nicht einmal behauptet, *was* geschickt wird.
   *
   * Ein Browser kann bei einem WebSocket-Handschlag keine Kopfzeile setzen,
   * also legt er ein kurzlebiges Einwegticket in die Adresse. Der Weg zieht
   * eines, verbindet sich damit, löst am Home ein Ereignis aus und wartet, bis
   * es ankommt - womit auch die Form geprüft ist, die der Leser hier erwartet:
   * eine Nachricht, die er nicht versteht, wirft er weg, und ohne diesen
   * Durchlauf sähe das genauso aus wie ein Home, das schweigt.
   */
  /**
   * ADR 0071 mit ADR 0072. Einen Raum wirklich schreddern - und nicht nur die
   * Ablehnung daneben gehen.
   *
   * **Bis zum 2026-09-02 war `POST /api/memory/domains/:d/shred` die eine
   * Route, die ein getrennter Prozess nur *abgelehnt* bekommen hatte** (Befund
   * B44/B54, `pnpm route:walk`). Der Durchlauf darueber geht die Ablehnung,
   * und die ist richtig: ohne Verschluesselung gibt es keine Schluessel zu
   * zerstoeren. Der Erfolgsweg aber - der, bei dem wirklich etwas
   * unwiederbringlich wird - war nie gegangen.
   *
   * Er braucht ein *anderes* Home, weil die Entscheidung beim Start gilt und
   * nicht beim Umlegen (ADR 0104). Deshalb steht hier ein zweites, mit
   * `PICO_MEMORY_ENCRYPTION` von Anfang an.
   */
  it('schreddert einen Raum, dessen Inhalt wirklich verschlüsselt liegt', async () => {
    const home = await startHome({ memoryEncryption: true });
    await bootstrapOperator(home);
    const access = { operatorSession: await loginOperator(home.baseUrl, OPERATOR_PASSPHRASE) };

    // Jetzt sagt die Fläche, was der Start entschieden hat - und nicht, was
    // jemand aufgeschrieben hat: `enabled`, nicht nur `decided`.
    expect(await readMemoryEncryption(home.baseUrl, access)).toMatchObject({ enabled: true });

    /**
     * Etwas hineinlegen, über die Tür, die eine Person dafür hat. Zwei Räume,
     * weil ein Schreddern, das den Nachbarraum mitnimmt, sonst wie ein Erfolg
     * aussähe.
     */
    const kept = await createTimeBoundEntry(home.baseUrl, access, {
      deviceId: 'pico-web-walk',
      privacyDomain: 'household',
      kind: 'reminder',
      title: 'Der Ersatzschlüssel liegt beim Nachbarn.',
      dueAt: '2027-01-01T10:00:00.000Z',
    });
    expect(kept.memoryItemId).not.toBe('');
    const elsewhere = await createTimeBoundEntry(home.baseUrl, access, {
      deviceId: 'pico-web-walk',
      privacyDomain: 'ownnotes',
      kind: 'reminder',
      title: 'Und der Zählerstand war 41870.',
      dueAt: '2027-01-02T10:00:00.000Z',
    });

    const before = await listDomainContent(home.baseUrl, access, 'household');
    expect(before.items.length).toBeGreaterThan(0);

    /**
     * ADR 0072. Der Raum wird beim Namen genannt, und zwar zweimal: einmal in
     * der Adresse und einmal als Bestätigung. Ein Schreddern, das aus einem
     * Klick folgt, wäre eines, das aus einem Klick folgt.
     */
    const shredded = await shredPrivacyDomain(home.baseUrl, access, {
      privacyDomain: 'household',
      confirm: 'household',
      reason: 'walked against a running Home',
    });
    expect(shredded.removedKeyVersions).toBeGreaterThan(0);

    /**
     * **Die Zeile bleibt, der Inhalt ist fort** - und das ist die genauere
     * Aussage als „weg". Erwartet war hier zuerst eine leere Liste; der
     * Durchlauf hat das widerlegt und dabei gezeigt, was Schreddern in diesem
     * Haus heisst: die Schlüssel sind zerstört, also sagt der Eintrag
     * `contentUnavailable: 'key_shredded'` und steht weiter als `active` da.
     * Ein Haus, das die Zeile mitnaehme, verloere die Auskunft, *dass* es
     * etwas gab - und ADR 0071 unterscheidet Vergessen von Verschwiegenheit.
     */
    const after = await listDomainContent(home.baseUrl, access, 'household');
    expect(after.items.length).toBe(before.items.length);
    for (const item of after.items) {
      expect(item).toMatchObject({
        contentUnavailable: 'key_shredded',
        deletionState: 'active',
      });
      expect(item).not.toHaveProperty('content');
    }

    // Und der Nachbarraum steht, mit lesbarem Inhalt.
    const neighbour = await listDomainContent(home.baseUrl, access, 'ownnotes');
    expect(neighbour.items.length).toBeGreaterThan(0);
    expect(neighbour.items.every((item) => item.contentUnavailable === undefined)).toBe(true);
    expect(elsewhere.memoryItemId).not.toBe(kept.memoryItemId);
  }, 120_000);

  it('zieht ein Ticket, hört zu und bekommt ein Ereignis', async () => {
    const home = await startHome();
    await bootstrapOperator(home);
    const access = { operatorSession: await loginOperator(home.baseUrl, OPERATOR_PASSPHRASE) };
    const ticket = await mintRealtimeTicket(home.baseUrl, access);

    const messages: RealtimeMessage[] = [];
    let opened = false;
    let closed = false;
    const errors: string[] = [];
    const client = connectRealtime({
      baseUrl: home.baseUrl,
      ticket,
      onOpen: () => { opened = true; },
      onClose: () => { closed = true; },
      onError: (message) => { errors.push(message); },
      onMessage: (message) => { messages.push(message); },
    });

    try {
      await waitFor(() => opened, 'realtime_open');
      expect(errors).toEqual([]);

      // Etwas, das dieses Home als Ereignis anhängt und weitersagt.
      await setModuleCapture(home.baseUrl, access, {
        identifier: 'spatial-recall',
        capturing: true,
      });

      await waitFor(
        () => messages.some((message) => message.type === realtimeMessageType.eventCreated),
        `realtime_event:${JSON.stringify(messages)}`,
      );
      const created = messages.find(
        (message) => message.type === realtimeMessageType.eventCreated,
      );
      expect(created).toBeDefined();
    } finally {
      client.close();
    }

    // Und das Zumachen ist auch eine Aussage: die Fläche erfährt es.
    await waitFor(() => closed, 'realtime_close');
  }, 180_000);
});
