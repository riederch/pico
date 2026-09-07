import type { PicoObservationKind } from '@pico/protocol/observation';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { openPicoHomeWithDevice, sendPicoLinkDirectRequest } from './test-claimed-home.js';

/**
 * ADR 0129 SR5 - der Port bekommt sein anderes Ende.
 *
 * SR5 erklärte die Erfassung ausdrücklich für unimplementiert, mit einem
 * Grund, der ein Zustand der Welt war: „whoever fills this port is a mobile
 * runtime that does not exist, and an adapter that cannot be run against a
 * real device would be code nobody can verify". Seit ADR 0131 A5 gibt es die
 * Laufzeit, und seit dem 2026-08-26 tut sie echte Produktarbeit.
 *
 * Was hier geprüft wird, ist nicht der Sensor - der gehört dem Telefon - ,
 * sondern die beiden Entscheidungen, die der Home behält: **ob** aufgeschrieben
 * werden darf, und **wo** es liegt.
 */
const dirs: string[] = [];
const apps: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close();
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const fix = (at: string) => ({
  at,
  latitudeDeg: 47.0707,
  longitudeDeg: 15.4395,
  accuracyM: 8,
});

async function claimedHome() {
  const dir = mkdtempSync(join(tmpdir(), 'pico-observations-'));
  dirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  const logLines: string[] = [];
  const app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath,
    deviceId: 'pico-core',
    logDestination: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        logLines.push(chunk.toString('utf8'));
        callback();
      },
    }),
  } as never) as unknown as {
    inject(request: { method: string; url: string }): Promise<{ json(): unknown }>;
    close(): Promise<void>;
  };
  apps.push(app);

  const moveInCode = logLines
    .map((line) => JSON.parse(line) as { picoHomeMoveInCode?: string })
    .find((line) => typeof line.picoHomeMoveInCode === 'string')!.picoHomeMoveInCode!;
  const setup = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as {
    host: { signingKeyFingerprintHex: string; keyAgreementPublicKeyHex: string };
  };
  const { device, sealedClaim } = await openPicoHomeWithDevice(app as never, {
    moveInCode,
    idSuffix: 'observations',
  });
  const send = async (operation: string, args: Record<string, unknown>) =>
    await sendPicoLinkDirectRequest(app as never, {
      operation: operation as never,
      args,
      sender: device,
      identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
      hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
      hostKeyAgreementPublicKeyHex: setup.host.keyAgreementPublicKeyHex,
    });
  return { app, send, databasePath };
}

/** ADR 0129 SR6. Die Entscheidung, ohne die nichts aufgeschrieben wird. */
const capturing = async (databasePath: string) => {
  const store = await EventStore.open(databasePath, {});
  store.setPicoModuleCapture({
    identifier: 'spatial-recall',
    capturing: true,
    decidedAt: '2026-08-26T08:00:00.000Z',
  } as never);
  store.close();
};

const buffered = async (databasePath: string) => {
  const store = await EventStore.open(databasePath, {});
  const rows = [
    ...store.picoObservationWindow({ kind: 'location_fix', privacyDomain: 'private' }),
    ...store.picoObservationWindow({ kind: 'mobility_sample', privacyDomain: 'private' }),
  ];
  store.close();
  return rows;
};

/** Wie eine Messung reist: die Sprache des Puffers, ohne die Domäne. */
const reading = (kind: PicoObservationKind, payload: unknown) =>
  ({ kind, payload: JSON.stringify(payload) });

describe('ADR 0129 SR5 - was ein Gerät gemessen hat', () => {
  it('lehnt ab, solange niemand die Erfassung erlaubt hat', async () => {
    /**
     * SR6: ob Pico aufschreiben darf, wo eine Person hingeht, ist eine
     * dauerhafte Entscheidung über ihr Leben und keine Eigenschaft eines
     * Sensoradapters. Ein Home, das Messungen annimmt, weil sie ankommen,
     * hätte diese Entscheidung dem Gerät überlassen.
     */
    const { send, databasePath } = await claimedHome();
    const refused = await send('home.observations.submit', {
      observations: [reading('location_fix', fix('2026-08-26T08:00:00.000Z'))],
    });
    expect(refused.response.outcome).toBe('invalid_arguments');
    // Und es sagt, welcher der beiden Fälle es ist: „nichts angekommen" ließe
    // ein Telefon weiter messen und senden.
    expect(refused.result.refusal).toBe('capture_not_consented');
    expect(await buffered(databasePath)).toHaveLength(0);
  });

  it('nimmt Messungen an und legt sie in die Domäne, die der Home nennt', async () => {
    const { send, databasePath } = await claimedHome();
    await capturing(databasePath);

    const accepted = await send('home.observations.submit', {
      observations: [
        reading('location_fix', fix('2026-08-26T08:00:00.000Z')),
        reading('location_fix', fix('2026-08-26T08:00:30.000Z')),
        reading('mobility_sample',
          { at: '2026-08-26T08:00:10.000Z', mobility: 'walking', confidence: 'high' }),
      ],
    });
    expect(accepted.result.refusal ?? accepted.response.outcome).toBe('ok');
    // Was angekommen ist, nicht was geschickt wurde: ein Q5-Deckel kann
    // weniger annehmen als angeboten wurde.
    expect(accepted.result).toEqual({ appended: 3 });

    const rows = await buffered(databasePath);
    expect(rows).toHaveLength(3);
    // **Die Domäne kommt vom Home.** Sie steht in keiner Übergabe, und ein
    // Gerät, das sie nennen dürfte, legte seine Messungen in den Raum eines
    // anderen - an ihr hängt die einzige Custody, die eine Beobachtung hat.
    expect(new Set(rows.map((row: { privacyDomain: string }) => row.privacyDomain)))
      .toEqual(new Set(['private']));
    expect(rows.filter((row: { kind: string }) => row.kind === 'location_fix')).toHaveLength(2);
    expect(rows.filter((row: { kind: string }) => row.kind === 'mobility_sample'))
      .toHaveLength(1);
  });

  it('weist eine Übergabe zurück, statt sie halb zu behalten', async () => {
    /**
     * Eine Übergabe, die stillschweigend die Hälfte behielte, sähe für den
     * Absender wie ein Erfolg aus - und die fehlenden Messungen wären genau
     * die, aus denen eine Ableitung ihren Schluss zieht.
     */
    const { send, databasePath } = await claimedHome();
    await capturing(databasePath);

    const tooMany = await send('home.observations.submit', {
      observations: Array.from({ length: 201 }, (_unused, index) =>
        reading('location_fix',
          fix(new Date(Date.parse('2026-08-26T08:00:00.000Z') + index * 1_000).toISOString()))),
    });
    expect(tooMany.response.outcome).toBe('invalid_arguments');
    expect(tooMany.result.refusal).toBe('too_many_observations');
    expect(await buffered(databasePath)).toHaveLength(0);
  });

  it('weist eine kaputte Messung mit ihrem Namen zurück', async () => {
    // Der Parser des Protokolls steht vor dem Speicher, damit eine Übergabe,
    // die auseinandergefallen ist, mit einem Namen scheitert, den ein Absender
    // lesen kann - und nicht mit einer Zeile im Home-Protokoll.
    const { send, databasePath } = await claimedHome();
    await capturing(databasePath);

    const broken = await send('home.observations.submit', {
      observations: [reading('location_fix',
        { at: 'gestern', latitudeDeg: 47, longitudeDeg: 15, accuracyM: 8 })],
    });
    expect(broken.response.outcome).toBe('invalid_arguments');
    expect(String(broken.result.refusal)).toBe('invalid_pico_location_fix_at');
    expect(await buffered(databasePath)).toHaveLength(0);
  });
});
