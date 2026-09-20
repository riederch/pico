import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { buildApp } from '@pico/core/app';
import { afterEach, describe, expect, it } from 'vitest';
import { picoFoundationRequest } from './claim-home-ceremony.js';

/**
 * Der Vault-Daemon und ein echtes Home, zum ersten Mal am selben Draht
 * (Befund B233, 2026-09-20).
 *
 * **Beide sind gruendlich geprueft und nie einander begegnet.** Kein Test
 * dieses Pakets baut ein Home, kein Test des Kerns faehrt den Daemon - und
 * `@pico/core` steht seit jeher als Dev-Abhaengigkeit in diesem Manifest,
 * ohne dass eine Zeile sie importiert - und sie war auch nicht benutzbar:
 * `main` des Kernpakets zeigt auf den Einstiegspunkt, der ein Home **startet**,
 * und der exportiert nichts. Das Relay hat diese Trennung (ein Fass als
 * `index.ts`, ein `main.ts`, das laeuft), der Kern hatte sie nicht; deshalb
 * kann der Kern ein echtes Relay fahren und niemand ein echtes Home.
 * `@pico/core/app` ist die Tuer, die das behebt, ohne anzuruehren, was laeuft.
 *
 * Was hier gehalten wird, ist der **Vertrag zwischen zwei Prozessen**: welche
 * Gestalt eine Antwort hat, wenn sie gelingt, und welchen Namen eine
 * Ablehnung traegt, wenn das Home sie ausspricht. `picoFoundationRequest`
 * uebersetzt eine Absage in `foundation_rejected:<status>:<grund>`, und dieser
 * Grund ist der Satz des Homes. Benennt das Home ihn um oder aendert es den
 * Status, faellt es hier auf - und heute faellt es nirgends auf.
 *
 * Die zwei Routen unten sind genau die, die `route:walk` am 2026-09-20 als
 * ungegangen meldete, obwohl sie einen Aufrufer haben (B232): ihr Aufrufer ist
 * dieser Daemon, und das Szenario jenes Laufs faehrt ihn nicht.
 */
const directories: string[] = [];
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of closers.splice(0)) {
    await close();
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function startHome(): Promise<string> {
  const directory = mkdtempSync(join(tmpdir(), 'pico-home-meeting-'));
  directories.push(directory);
  const app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath: join(directory, 'pico.sqlite'),
    deviceId: 'home-meeting-test',
    logDestination: new Writable({
      write(_chunk, _encoding, callback: () => void) {
        callback();
      },
    }),
  });
  closers.push(() => app.close());
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('home listener has no TCP address');
  }
  return `http://127.0.0.1:${address.port}`;
}

describe('the vault daemon and a real Home on one wire (B233)', () => {
  it('reads the status a Home answers without any credential', async () => {
    const home = await startHome();
    const status = await picoFoundationRequest(home, '/api/system/status', undefined);

    // Kein Fixture: das sind die Felder, die ein laufendes Home wirklich
    // schickt, und der Daemon liest sie als Objekt und nicht als Text.
    expect(status).toMatchObject({ service: 'pico-home-core' });
  });

  it('carries the Home\'s own refusal through, word for word', async () => {
    const home = await startHome();

    // Beide Routen verlangen eine Autoritaets-Sitzung, die ein frisches Home
    // nicht vergeben hat. Der Daemon muss daraus eine benannte Ablehnung
    // machen - nicht "unreachable" und nicht "invalid response".
    for (const [path, body] of [
      ['/api/home/reader-custody/kek-rotations', undefined],
      ['/api/home/membership-lifecycle', { anything: true }],
    ] as const) {
      await expect(picoFoundationRequest(home, path, body)).rejects.toThrow(
        'foundation_rejected:401:Current Pico Home authority relay session is required.',
      );
    }
  });
});
