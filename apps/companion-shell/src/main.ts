import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  net,
  Notification,
  powerMonitor,
  session,
  Tray,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import sodium from 'libsodium-wrappers-sumo';
import {
  parsePicoCompanionPresentation,
  picoCompanionIpcChannels,
  type PicoCompanionPresentation,
} from './contract.js';
import { startPicoCompanionNetworkRegainMonitor } from './network-monitor.js';
import {
  createPicoCompanionPresentationAdapter,
  type PicoCompanionPresentationPort,
} from './presentation-adapter.js';
import {
  startPicoCompanionShellRuntime,
  type PicoCompanionShellRuntime,
} from './runtime.js';
import { picoCompanionPublicServiceErrorReason } from './public-error.js';
import {
  picoLinuxProcessTreeMemory,
  picoLinuxProcessRoleFromElectronType,
  readPicoLinuxCoreDumpLimits,
  readPicoLinuxProcessTable,
} from './linux-process-tree.js';
import { picoCompanionWindowOptions } from './window-options.js';

const rendererPath = join(import.meta.dirname, 'renderer', 'index.html');
const rendererUrl = pathToFileURL(rendererPath).href;
const preloadPath = join(import.meta.dirname, 'preload.cjs');
const assetPath = join(import.meta.dirname, 'assets');
const trayPssBudgetBytes = 225_000_000;
const trayPrivateDirtyAndHugetlbBudgetBytes = 110_000_000;
const trayMemoryProbe = process.env.PICO_COMPANION_RELEASE_PROBE === 'tray-memory-v2';

let presentation: PicoCompanionPresentation = parsePicoCompanionPresentation({
  kind: 'starting',
  severity: 'active',
  symbol: '●',
  title: 'Pico is starting',
  body: 'Connecting to this device\'s Pico service core.',
  observedAt: new Date().toISOString(),
});
let window: BrowserWindow | null = null;
let tray: Tray | null = null;
let runtime: PicoCompanionShellRuntime | null = null;
let quitting = false;

app.disableHardwareAcceleration();
Menu.setApplicationMenu(null);

const presentationPort: PicoCompanionPresentationPort = {
  present(state) {
    presentation = parsePicoCompanionPresentation(state);
    updateTray();
    window?.webContents.send(
      picoCompanionIpcChannels.presentationChanged,
      presentation,
    );
  },
  notify(state) {
    const current = parsePicoCompanionPresentation(state);
    const notification = new Notification({
      title: current.title,
      body: current.body,
      urgency: 'critical',
      timeoutType: 'never',
      silent: false,
    });
    notification.on('click', () => showWindow());
    notification.show();
    showWindow();
  },
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('window-all-closed', () => {
    // Tray process remains alive; windows are interaction/alarm surfaces only.
  });
  app.whenReady().then(start).catch((error: unknown) => {
    if (trayMemoryProbe) {
      const reason = error instanceof Error ? error.message : 'unknown_probe_error';
      process.stderr.write(`Pico tray memory probe failed: ${reason}\n`);
      tray?.destroy();
      app.exit(2);
      return;
    }
    presentServiceError(error);
  });
}

async function start(): Promise<void> {
  if (trayMemoryProbe) {
    await runTrayMemoryProbe();
    return;
  }
  lockDownRendererSession();
  registerIpc();
  createTray();
  powerMonitor.on('resume', () => {
    void runtime?.checkNow();
  });
  const networkMonitor = startPicoCompanionNetworkRegainMonitor({
    isOnline: () => net.isOnline(),
    onRegain: async () => {
      await runtime?.checkNow();
    },
  });
  app.once('will-quit', () => {
    networkMonitor.stop();
    void runtime?.stop();
  });

  try {
    await sodium.ready;
    const notifications = createPicoCompanionPresentationAdapter(presentationPort);
    runtime = await startPicoCompanionShellRuntime({ notifications, sodium });
  } catch (error) {
    presentServiceError(error);
  }
}

async function runTrayMemoryProbe(): Promise<void> {
  createTray();
  process.stderr.write('Pico tray memory probe: tray ready.\n');
  await waitForSodiumReady();
  process.stderr.write('Pico tray memory probe: sodium ready.\n');
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  process.stderr.write('Pico tray memory probe: measuring process tree.\n');
  const rolesByPid = new Map(app.getAppMetrics().map((metric) => [
    metric.pid,
    picoLinuxProcessRoleFromElectronType(metric.type),
  ]));
  const memory = picoLinuxProcessTreeMemory(
    readPicoLinuxProcessTable('/proc', process.pid, rolesByPid),
    process.pid,
    new Set(rolesByPid.keys()),
  );
  const coreDumpLimits = readPicoLinuxCoreDumpLimits();
  const underBudget = memory.proportionalBytes < trayPssBudgetBytes
    && memory.privateDirtyAndHugetlbBytes < trayPrivateDirtyAndHugetlbBudgetBytes;
  process.stdout.write(`${JSON.stringify({
    schema: 'pico.companion.tray-memory.v2',
    electronVersion: process.versions.electron,
    packaged: app.isPackaged,
    processCount: memory.processCount,
    rssBytes: memory.rssBytes,
    proportionalBytes: memory.proportionalBytes,
    privateCleanBytes: memory.privateCleanBytes,
    privateDirtyBytes: memory.privateDirtyBytes,
    privateHugetlbBytes: memory.privateHugetlbBytes,
    privateDirtyAndHugetlbBytes: memory.privateDirtyAndHugetlbBytes,
    privateBytes: memory.privateBytes,
    processMemoryByRole: memory.processMemoryByRole,
    proportionalBudgetBytes: trayPssBudgetBytes,
    privateDirtyAndHugetlbBudgetBytes: trayPrivateDirtyAndHugetlbBudgetBytes,
    underBudget,
    coreDumpSoftLimitBytes: coreDumpLimits.softBytes,
    coreDumpHardLimitBytes: coreDumpLimits.hardBytes,
  })}\n`);
  tray?.destroy();
  app.exit(underBudget ? 0 : 1);
}

async function waitForSodiumReady(): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      sodium.ready,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('tray_memory_probe_sodium_timeout'));
        }, 10_000);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function lockDownRendererSession(): void {
  const rendererSession = session.fromPartition('pico-companion');
  rendererSession.setPermissionCheckHandler(() => false);
  rendererSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

function registerIpc(): void {
  ipcMain.handle(
    picoCompanionIpcChannels.getPresentation,
    (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      return presentation;
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.requestCheck,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      await runtime.checkNow();
    },
  );
  ipcMain.on(
    picoCompanionIpcChannels.closeWindow,
    (event: IpcMainEvent) => {
      assertRendererSender(event);
      window?.close();
    },
  );
}

function assertRendererSender(event: IpcMainEvent | IpcMainInvokeEvent): void {
  if (event.senderFrame?.url !== rendererUrl || event.sender !== window?.webContents) {
    throw new Error('untrusted_companion_ipc_sender');
  }
}

function createTray(): void {
  tray = new Tray(iconFor('active'));
  tray.setToolTip('Pico companion');
  tray.on('click', () => showWindow());
  updateTray();
}

function updateTray(): void {
  if (tray === null) {
    return;
  }
  tray.setImage(iconFor(presentation.severity));
  tray.setToolTip(`${presentation.title} — ${presentation.body}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Pico', click: () => showWindow() },
    {
      label: 'Check now',
      enabled: runtime !== null,
      click: () => { void runtime?.checkNow(); },
    },
    { type: 'separator' },
    {
      label: 'Quit Pico',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]));
}

function iconFor(severity: PicoCompanionPresentation['severity']): Electron.NativeImage {
  const icon = severity === 'blocked'
    ? 'status-blocked.svg'
    : severity === 'warning'
      ? 'status-warning.svg'
      : 'status-active.svg';
  return nativeImage.createFromPath(join(assetPath, icon));
}

function showWindow(): void {
  if (!app.isReady() || quitting) {
    return;
  }
  if (window === null || window.isDestroyed()) {
    window = new BrowserWindow(picoCompanionWindowOptions(preloadPath));
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.on('will-attach-webview', (event) => event.preventDefault());
    window.once('closed', () => {
      window = null;
    });
    void window.loadFile(rendererPath).then(() => {
      window?.show();
      window?.focus();
    });
    return;
  }
  window.show();
  window.focus();
}

function presentServiceError(error: unknown): void {
  const reason = picoCompanionPublicServiceErrorReason(error);
  const state = parsePicoCompanionPresentation({
    kind: 'service_error',
    severity: 'blocked',
    symbol: '×',
    title: 'Pico companion needs attention',
    body: `The local companion service could not start (${reason}). `
      + 'Check this device\'s companion profile and Pico Vault service.',
    observedAt: new Date().toISOString(),
  });
  presentationPort.present(state);
  presentationPort.notify(state);
}
