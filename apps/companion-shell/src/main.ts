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
  issuePicoCompanionRecoveryCard,
} from '@pico/companion/recovery-card';
import {
  defaultPicoCompanionProfilePath,
  readPicoCompanionProfile,
} from '@pico/companion/profile';
import {
  openPicoCompanionVaultProductSession,
} from '@pico/companion/vault-product-session';
import type {
  PicoCompanionApprovalDecisionPort,
} from '@pico/companion/approval-carrier';
import type { PicoVaultDaemonApprovalRequestDescriptor } from '@pico/vault-daemon';
import {
  parsePicoCompanionRecoveryCardSetupInput,
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
  defaultPicoVaultDaemonSocketPath,
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
import { collectPicoCompanionSecureInput } from './secure-input.js';
import { createLinuxLpRecoveryCardPrinter } from './linux-print.js';

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
  decision: 'none',
  title: 'Pico is starting',
  body: 'Connecting to this device\'s Pico service core.',
  observedAt: new Date().toISOString(),
});
let window: BrowserWindow | null = null;
let tray: Tray | null = null;
let runtime: PicoCompanionShellRuntime | null = null;
let quitting = false;
let productOperationActive = false;
let pendingApprovalDecision: ((approved: boolean) => void) | null = null;

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
    picoCompanionIpcChannels.openRecoveryCard,
    (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (
        productOperationActive
        || (presentation.kind !== 'idle'
          && presentation.kind !== 'recovery_card_printed')
      ) {
        return;
      }
      presentationPort.present(parsePicoCompanionPresentation({
        kind: 'recovery_card_setup',
        severity: 'warning',
        symbol: '!',
        decision: 'recovery_card_details',
        title: 'Print a Pico Recovery Card',
        body: 'This exports your identity root once for printing. Choose the exact Home and print form; Pico will collect the Vault passphrase and Card PIN without sending either through the renderer.',
        observedAt: new Date().toISOString(),
      }));
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.submitRecoveryCard,
    async (event: IpcMainInvokeEvent, value: unknown) => {
      assertRendererSender(event);
      if (productOperationActive || presentation.decision !== 'recovery_card_details') {
        return;
      }
      try {
        const details = parsePicoCompanionRecoveryCardSetupInput(value);
        productOperationActive = true;
        await runRecoveryCardIssuance(details);
      } catch {
        await presentRecoveryCardRetry();
      } finally {
        productOperationActive = false;
      }
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.decideApproval,
    (event: IpcMainInvokeEvent, approved: unknown) => {
      assertRendererSender(event);
      if (
        typeof approved !== 'boolean'
        || pendingApprovalDecision === null
        || presentation.decision !== 'approve_or_deny'
      ) {
        return;
      }
      const decide = pendingApprovalDecision;
      pendingApprovalDecision = null;
      decide(approved);
      presentationPort.present(parsePicoCompanionPresentation({
        kind: 'starting',
        severity: approved ? 'active' : 'blocked',
        symbol: approved ? '●' : '×',
        decision: 'none',
        title: approved ? 'Approval recorded' : 'Request denied',
        body: approved
          ? 'Pico is completing the exact approved operation.'
          : 'Pico will not perform the authority-creating operation.',
        observedAt: new Date().toISOString(),
      }));
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.getPresentation,
    (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      return presentation;
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.vetoRecovery,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (runtime === null || presentation.decision !== 'veto_recovery') {
        return;
      }
      try {
        await runtime.vetoPendingRecovery();
      } catch {
        const failed = parsePicoCompanionPresentation({
          kind: 'service_error',
          severity: 'blocked',
          symbol: '×',
          decision: 'none',
          title: 'Recovery veto did not complete',
          body: 'Pico did not record a veto. The recovery alarm remains armed and will rise again on the next authenticated check.',
          observedAt: new Date().toISOString(),
        });
        await presentationPort.present(failed);
        await presentationPort.notify(failed);
      }
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.requestCheck,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (runtime === null || productOperationActive) {
        if (runtime !== null) {
          return;
        }
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

async function runRecoveryCardIssuance(
  details: ReturnType<typeof parsePicoCompanionRecoveryCardSetupInput>,
): Promise<void> {
  if (window === null || window.isDestroyed()) {
    throw new Error('companion_window_unavailable');
  }
  const profile = readPicoCompanionProfile(defaultPicoCompanionProfilePath());
  const passphrasePrompt = {
    title: 'Enter the Vault passphrase',
    instruction: 'Type this device\'s Vault passphrase, then press Enter. It is not the Recovery Phrase or Card PIN.',
    maximumLength: 1_024,
    validate: (value: string) => value.length > 0,
  };
  const passphrase = await collectPicoCompanionSecureInput({
    window,
    prompt: passphrasePrompt,
    presentCount: async (count, invalid) => {
      await presentSecureInput(passphrasePrompt, count, invalid);
    },
  });
  const pinPrompt = {
    title: 'Choose the Card PIN',
    instruction: 'Type 6–64 digits or lowercase letters, then press Enter. Keep this PIN somewhere the card is not.',
    maximumLength: 64,
    validate: (value: string) => /^[0-9a-z]{6,64}$/u.test(value),
  };
  const pin = await collectPicoCompanionSecureInput({
    window,
    prompt: pinPrompt,
    presentCount: async (count, invalid) => {
      await presentSecureInput(pinPrompt, count, invalid);
    },
  });
  const confirmationPrompt = {
    ...pinPrompt,
    title: 'Repeat the Card PIN',
    instruction: 'Type the same Card PIN again, then press Enter.',
  };
  const confirmation = await collectPicoCompanionSecureInput({
    window,
    prompt: confirmationPrompt,
    presentCount: async (count, invalid) => {
      await presentSecureInput(confirmationPrompt, count, invalid);
    },
  });
  if (pin !== confirmation) {
    throw new Error('recovery_pin_mismatch');
  }

  const session = await openPicoCompanionVaultProductSession({
    socketPath: defaultPicoVaultDaemonSocketPath(),
    unlock: [{
      keyRole: 'pico_identity',
      keyFingerprintHex: profile.identity.keyFingerprintHex,
      passphrase,
    }],
    decisions: approvalDecisionPort,
  });
  try {
    const issued = await issuePicoCompanionRecoveryCard({
      daemonClient: session.consumerClient,
      profile,
      picoName: details.picoName,
      homeNameOrId: details.homeNameOrId,
      homeId: details.homeId,
      pin,
      form: details.form,
      printer: createLinuxLpRecoveryCardPrinter(),
    });
    await presentationPort.present(parsePicoCompanionPresentation({
      kind: 'recovery_card_printed',
      severity: 'active',
      symbol: '●',
      decision: 'none',
      title: 'Recovery Card sent to the printer',
      body: `Pico sent the ${details.form === 'paper' ? 'folded A4' : 'ID-1'} card for ${issued.metadata.picoName} to the ${issued.destination}. Print and laminate it now, keep the Card PIN elsewhere, and never photograph the secret side.`,
      observedAt: new Date().toISOString(),
    }));
  } finally {
    await session.close();
  }
}

const approvalDecisionPort: PicoCompanionApprovalDecisionPort = {
  decideApproval: async (
    approval: PicoVaultDaemonApprovalRequestDescriptor,
  ): Promise<boolean> => {
    if (pendingApprovalDecision !== null) {
      throw new Error('companion_approval_already_pending');
    }
    await presentationPort.present(parsePicoCompanionPresentation({
      kind: 'approval',
      severity: 'warning',
      symbol: '!',
      decision: 'approve_or_deny',
      title: 'Pico needs your approval',
      body: `${approval.statement} Signing key ${shortFingerprint(approval.keyFingerprintHex)}; exact request digest ${shortFingerprint(approval.signatureInputDigestHex)}.`,
      observedAt: new Date().toISOString(),
    }));
    showWindow();
    return await new Promise<boolean>((resolvePromise) => {
      const timer = setTimeout(() => {
        if (pendingApprovalDecision !== null) {
          pendingApprovalDecision = null;
          resolvePromise(false);
        }
      }, Math.max(1, approval.expiresInMs - 250));
      timer.unref();
      pendingApprovalDecision = (approved) => {
        clearTimeout(timer);
        resolvePromise(approved);
      };
    });
  },
  notifyApprovalChannelFailure: async () => {
    await presentProductError(
      'Pico approval channel stopped',
      'No authority was approved. Unlock the Vault and start the operation again.',
    );
  },
};

async function presentSecureInput(
  prompt: { title: string; instruction: string },
  count: number,
  invalid: boolean,
): Promise<void> {
  await presentationPort.present(parsePicoCompanionPresentation({
    kind: 'secure_input',
    severity: invalid ? 'blocked' : 'warning',
    symbol: invalid ? '×' : '!',
    decision: 'none',
    title: prompt.title,
    body: `${prompt.instruction} ${count} character${count === 1 ? '' : 's'} entered${invalid ? '; the value is not valid yet' : ''}. The page receives neither keystrokes nor value.`,
    observedAt: new Date().toISOString(),
  }));
}

async function presentProductError(title: string, body: string): Promise<void> {
  const state = parsePicoCompanionPresentation({
    kind: 'service_error',
    severity: 'blocked',
    symbol: '×',
    decision: 'none',
    title,
    body,
    observedAt: new Date().toISOString(),
  });
  await presentationPort.present(state);
  await presentationPort.notify(state);
}

async function presentRecoveryCardRetry(): Promise<void> {
  await presentationPort.present(parsePicoCompanionPresentation({
    kind: 'recovery_card_setup',
    severity: 'blocked',
    symbol: '×',
    decision: 'recovery_card_details',
    title: 'Recovery Card was not printed',
    body: 'Pico retained no PDF, Recovery Phrase or Card PIN. Check the Vault passphrase, approval and default printer, then try again.',
    observedAt: new Date().toISOString(),
  }));
  showWindow();
}

function shortFingerprint(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
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
      const deny = pendingApprovalDecision;
      pendingApprovalDecision = null;
      deny?.(false);
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
    decision: 'none',
    title: 'Pico companion needs attention',
    body: `The local companion service could not start (${reason}). `
      + 'Check this device\'s companion profile and Pico Vault service.',
    observedAt: new Date().toISOString(),
  });
  presentationPort.present(state);
  presentationPort.notify(state);
}
