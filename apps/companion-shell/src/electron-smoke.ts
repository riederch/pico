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
 */
async function smoke(): Promise<void> {
  await app.whenReady();
  const rendererPath = join(import.meta.dirname, 'renderer', 'index.html');
  const preloadPath = join(import.meta.dirname, 'preload.cjs');
  const expectedState = picoCompanionIdlePresentation(
    new Date('2026-08-02T12:00:00.000Z'),
  );
  ipcMain.handle(picoCompanionIpcChannels.getPresentation, () => expectedState);
  ipcMain.handle(picoCompanionIpcChannels.requestCheck, () => undefined);
  ipcMain.handle(picoCompanionIpcChannels.vetoRecovery, () => undefined);
  ipcMain.handle(picoCompanionIpcChannels.openRecoveryCard, () => undefined);
  ipcMain.handle(picoCompanionIpcChannels.submitRecoveryCard, () => undefined);
  ipcMain.handle(picoCompanionIpcChannels.decideApproval, () => undefined);
  ipcMain.handle(picoCompanionIpcChannels.beginFirstRun, () => undefined);
  ipcMain.on(picoCompanionIpcChannels.closeWindow, () => undefined);

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
  const expected = {
    processType: 'undefined',
    requireType: 'undefined',
    bridgeKeys: [
      'beginFirstRun',
      'closeWindow',
      'decideApproval',
      'getPresentation',
      'onPresentationChanged',
      'openRecoveryCard',
      'requestCheck',
      'submitRecoveryCard',
      'vetoRecovery',
    ],
    state: expectedState,
  };
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    throw new Error(`electron_renderer_boundary_failed:${JSON.stringify(observed)}`);
  }
  process.stdout.write(`${JSON.stringify({
    electronVersion: process.versions.electron,
    rendererBoundary: observed,
  })}\n`);
  window.destroy();
  app.exit(0);
}

smoke().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  app.exit(1);
});
