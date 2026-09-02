import { join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import {
  picoCompanionIdlePresentation,
  picoCompanionIpcChannels,
} from './contract.js';
import { picoCompanionWindowOptions } from './window-options.js';

/**
 * Real-runtime C2 seam proof. This intentionally drives the production
 * preload, renderer document and BrowserWindow options, but never a profile,
 * Vault socket or secret. Run after build with `pnpm test:electron`.
 *
 * **Es lief bis zum 2026-09-02 nicht** (Befund B59). Der erwartete Satz von
 * Brueckenschluesseln stand hier als *Liste* von neun Namen, und das Preload
 * bietet achtundsechzig. Der Lauf waere also gescheitert - nur rief ihn
 * nichts: nicht `release:verify`, nicht die CI-Datei, kein Skript, kein
 * Dokument. Der einzige Beweis dieses Baums, dass die Isolationsnaht am
 * *echten* Fenster haelt - kein `process`, kein `require`, genau die
 * freigegebenen Namen - war seit dem Wachsen der Bruecke unbelegt.
 *
 * Zwei Dinge folgen daraus, und beide stehen jetzt hier:
 *
 * 1. **Die Erwartung wird abgeleitet, nicht aufgeschrieben.** Sie kommt aus
 *    dem Kanalvertrag, der auch das Preload baut; eine Liste daneben ist
 *    genau die zweite Fassung, die driftet.
 * 2. **Ein Druck gehoert dazu.** Die Naht zu beweisen, ohne je etwas zu
 *    druecken, laesst die letzte Spanne offen, die Befund B36 eine Ebene
 *    hoeher gemessen hat: benannt ist nicht angenommen. Also wird der
 *    Pruef-Knopf des Ruhezustands wirklich gedrueckt, und der Hauptprozess
 *    sagt, ob er angekommen ist.
 */
async function smoke(): Promise<void> {
  await app.whenReady();
  const rendererPath = join(import.meta.dirname, 'renderer', 'index.html');
  const preloadPath = join(import.meta.dirname, 'preload.cjs');
  const expectedState = picoCompanionIdlePresentation(
    new Date('2026-08-02T12:00:00.000Z'),
  );

  /**
   * Jeder Kanal bekommt einen Halter, und zwar abgeleitet.
   *
   * Sieben von Hand gehaltene Kanaele standen hier, und das Fenster ruft beim
   * Laden mehr - der Lauf schrieb deshalb `No handler registered for ...` und
   * mass die Naht mit einem halb toten Fenster.
   */
  const invoked: string[] = [];
  for (const [name, channel] of Object.entries(picoCompanionIpcChannels)) {
    if (name === 'closeWindow') {
      ipcMain.on(channel, () => invoked.push(name));
      continue;
    }
    if (name === 'presentationChanged') {
      // Kein Aufruf des Fensters, sondern ein Schub des Hauptprozesses.
      continue;
    }
    ipcMain.handle(channel, () => {
      invoked.push(name);
      return name === 'getPresentation' ? expectedState : undefined;
    });
  }

  const window = new BrowserWindow(picoCompanionWindowOptions(preloadPath));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  await window.loadFile(rendererPath);
  const observed = await window.webContents.executeJavaScript(`(async () => ({
    processType: typeof globalThis.process,
    requireType: typeof globalThis.require,
    bridgeKeys: Object.keys(window.picoCompanion).sort(),
    state: await window.picoCompanion.getPresentation()
  }))()`);
  /**
   * Abgeleitet aus dem Vertrag, der auch das Preload baut.
   *
   * `presentationChanged` ist der eine Kanal, der keine Bruecke gleichen
   * Namens hat: das Fenster *hoert* darauf, statt ihn zu rufen, und die
   * Bruecke dafuer heisst `onPresentationChanged`.
   */
  const expectedBridgeKeys = Object.keys(picoCompanionIpcChannels)
    .map((name) => (name === 'presentationChanged' ? 'onPresentationChanged' : name))
    .sort();
  const expected = {
    processType: 'undefined',
    requireType: 'undefined',
    bridgeKeys: expectedBridgeKeys,
    state: expectedState,
  };
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    throw new Error(`electron_renderer_boundary_failed:${JSON.stringify(observed)}`);
  }
  /**
   * **Und jetzt ein Druck** (Befund B59). Bis hierher beweist der Lauf, dass
   * die Naht steht und die Bruecke die richtigen Namen traegt - nicht, dass
   * ein Bedienelement einen davon erreicht. Der Pruef-Knopf des Ruhezustands
   * wird deshalb wirklich gedrueckt, im echten Dokument, ueber den echten
   * Zuhoerer und das echte Preload; der Hauptprozess sagt danach, ob es
   * ankam.
   *
   * Ein `click()` im Fenster und kein Tastendruck von aussen: was hier
   * bewiesen wird, ist die Kette vom Element bis zum Hauptprozess. Dass ein
   * Druck des Fenstersystems dort ankommt, ist eine andere Frage - sie stellt
   * sich bei der sicheren Eingabe, und dort beantwortet sie ein echter
   * Tastendruck.
   */
  const before = invoked.length;
  await window.webContents.executeJavaScript(
    "document.getElementById('check').click()",
  );
  const pressReached = await new Promise<boolean>((resolve) => {
    const startedAtMs = Date.now();
    const poll = (): void => {
      if (invoked.includes('requestCheck')) {
        resolve(true);
        return;
      }
      if (Date.now() - startedAtMs > 5_000) {
        resolve(false);
        return;
      }
      setTimeout(poll, 25);
    };
    poll();
  });
  if (!pressReached) {
    throw new Error(
      `electron_press_did_not_reach_main:${JSON.stringify(invoked.slice(before))}`,
    );
  }

  process.stdout.write(`${JSON.stringify({
    electronVersion: process.versions.electron,
    rendererBoundary: observed,
    pressReachedMain: 'requestCheck',
  })}\n`);
  window.destroy();
  app.exit(0);
}

smoke().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  app.exit(1);
});
