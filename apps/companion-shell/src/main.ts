import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
  defaultPicoCompanionProfilePath,
  readPicoCompanionProfile,
} from '@pico/companion/profile';
import type { PicoCompanionAutomaticVaultUnlock } from '@pico/companion/platform-unlock';
import type { PicoCompanionPlatformSecretPort } from '@pico/companion/platform-secrets';
import type { PicoCompanionFirstRunOutcome } from '@pico/companion/first-run';
import {
  openPicoCompanionVaultProductSession,
} from '@pico/companion/vault-product-session';
import type {
  PicoCompanionApprovalDecisionPort,
} from '@pico/companion/approval-carrier';
import type { PicoVaultDaemonApprovalRequestDescriptor } from '@pico/vault-daemon';
import {
  parsePicoCompanionFirstRunScanSource,
  parsePicoCompanionRecoveryCardSetupInput,
  parsePicoCompanionPresentation,
  picoCompanionFoundingStepLine,
  picoCompanionFoundingDelegationValidUntil,
  picoCompanionIpcChannels,
  picoCompanionDeviceRevocationReasonLines,
  picoCompanionEnrolmentStepLine,
  picoCompanionEnrolmentValidUntil,
  picoCompanionHostRotationLine,
  picoCompanionHostRotationReasonLines,
  picoCompanionMembershipEndingLines,
  type PicoCompanionEnrolmentStep,
  type PicoCompanionFirstRunScanSource,
  type PicoCompanionDeviceCode,
  type PicoCompanionPresentation,
} from './contract.js';
import { startPicoCompanionNetworkRegainMonitor } from './network-monitor.js';
import {
  createPicoCompanionPresentationAdapter,
  type PicoCompanionPresentationPort,
  type PicoCompanionShellNotifications,
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
const reachabilityProbe = process.env.PICO_COMPANION_RELEASE_PROBE === 'reachability-v1';

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
/**
 * ADR 0118 O4. The network monitor starts before the service core does, so its
 * first reading arrives with nowhere to go. Keeping it here lets the core
 * replay it once the adapter exists - otherwise "offline since boot" would be
 * the one state that never gets stated, which is the case the display is most
 * needed for.
 */
let shellNotifications: PicoCompanionShellNotifications | null = null;
let lastNetworkState: boolean | null = null;
let quitting = false;
let productOperationActive = false;
let pendingApprovalDecision: ((approved: boolean) => void) | null = null;

/**
 * ADR 0141 RN4. The session a person's answer is given in.
 *
 * **Minted with the window and dropped with it**, because that is what the
 * window *is*: ADR 0113 says it exists only while somebody is interacting, so
 * its lifetime is the honest span of "a person is here". A session that
 * survived the window would let a question asked this evening be answered by
 * whoever opens the laptop tomorrow, which is the standing grant RN4 refuses.
 *
 * Never given to the renderer. The renderer names *which* question it is
 * answering; that a person is present at all is something only the process
 * that owns the window can say.
 */
let presenceSessionId: string | null = null;

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
    const notification = buildNotification(parsePicoCompanionPresentation(state));
    notification.show();
    showWindow();
  },
};

/**
 * ADR 0130 E1. The notification is a door, so the thing that opens it is
 * named rather than written inline.
 *
 * A notification with no action is an announcement: it tells somebody Pico
 * needs them and gives them nowhere to go, which on a desktop with no tray
 * host is the difference between reachable and not. The probe drives this
 * same function, because a door proven on a copy of the code is not proven.
 */
/** The window as it is now, not as the last assignment left it. */
function currentWindow(): BrowserWindow | null {
  return window;
}

function buildNotification(state: PicoCompanionPresentation): Notification {
  const notification = new Notification({
    title: state.title,
    body: state.body,
    urgency: 'critical',
    timeoutType: 'never',
    silent: false,
  });
  notification.on('click', () => showWindow());
  return notification;
}

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
    if (trayMemoryProbe || reachabilityProbe) {
      // Both probes are driven by a verifier that waits on their report. An
      // error surface here would leave the process alive and the verifier
      // blocked for its full timeout, with the actual exception never told.
      const reason = error instanceof Error ? error.message : 'unknown_probe_error';
      const name = trayMemoryProbe ? 'tray memory' : 'reachability';
      process.stderr.write(`Pico ${name} probe failed: ${reason}\n`);
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
  if (reachabilityProbe) {
    await runReachabilityProbe();
    return;
  }
  lockDownRendererSession();
  registerIpc();
  createTray();
  powerMonitor.on('resume', () => {
    void runtime?.checkNow();
  });
  powerMonitor.on('unlock-screen', () => {
    void runtime?.checkNow();
  });
  powerMonitor.on('suspend', () => {
    void runtime?.lockVault();
  });
  powerMonitor.on('lock-screen', () => {
    void runtime?.lockVault();
  });
  const networkMonitor = startPicoCompanionNetworkRegainMonitor({
    isOnline: () => net.isOnline(),
    onRegain: async () => {
      await runtime?.checkNow();
    },
    // ADR 0118 O4. The state, not just the edge: a companion that started
    // offline has to say so, and the regain hook only ever fires on the way
    // back - by which point the person no longer needs telling.
    onState: async (online) => {
      lastNetworkState = online;
      await shellNotifications?.reportNetworkState(online);
    },
  });
  app.once('will-quit', () => {
    networkMonitor.stop();
    void runtime?.stop();
  });

  await startServiceCore();
}

/**
 * Runs once the device has a profile. A device without one has nothing to
 * watch yet: that is a first run, not a broken install, and must not read like
 * one - so it is offered the first-run surface instead of a service error.
 */
async function startServiceCore(): Promise<void> {
  try {
    await sodium.ready;
    const notifications = createPicoCompanionPresentationAdapter(presentationPort);
    shellNotifications = notifications;
    if (lastNetworkState !== null) {
      await notifications.reportNetworkState(lastNetworkState);
    }
    const profilePath = defaultPicoCompanionProfilePath();
    // Dynamic, like the Platform Keystore adapter beside it: the ADR 0113 C3
    // tray budget is measured on a probe that never reaches this line, and a
    // static import would put the whole recovery ceremony runtime into it.
    const { readPicoCompanionFirstRunNeed } =
      await import('@pico/companion/first-run');
    if (readPicoCompanionFirstRunNeed({ profilePath }).need !== 'nothing') {
      await presentFirstRun();
      return;
    }
    const profile = readPicoCompanionProfile(profilePath);
    const {
      createPicoCompanionAutomaticVaultUnlock,
      defaultPicoCompanionPlatformUnlockPath,
      hasPicoCompanionPlatformUnlock,
    } = await import('@pico/companion/platform-unlock');
    const platformUnlockPath =
      defaultPicoCompanionPlatformUnlockPath(profilePath);
    let automaticVaultUnlock: PicoCompanionAutomaticVaultUnlock | undefined;
    if (hasPicoCompanionPlatformUnlock(platformUnlockPath)) {
      const [electronModule, platformKeystoreModule] = await Promise.all([
        import('electron'),
        import('./platform-keystore.js'),
      ]);
      automaticVaultUnlock = createPicoCompanionAutomaticVaultUnlock({
        path: platformUnlockPath,
        profile,
        socketPath: defaultPicoVaultDaemonSocketPath(),
        secrets: platformKeystoreModule.createLinuxElectronPlatformSecretPort(
          electronModule.safeStorage,
        ),
      });
    }
    /**
     * ADR 0154. The keystore this session can reach, offered rather than
     * required: without it the relay surface refuses, and everything else in
     * the window is unaffected.
     */
    const platformSecrets = await relayKeystore();
    /**
     * ADR 0126 P2. What this machine can do, looked up rather than assumed -
     * and looked up here, because the probe is the one part of an
     * announcement that depends on the platform.
     */
    const { createLinuxPicoCompanionPresenceProbe } = await import('./presence-probe.js');
    runtime = await startPicoCompanionShellRuntime({
      notifications,
      sodium,
      profilePath,
      presenceProbe: createLinuxPicoCompanionPresenceProbe(),
      ...(automaticVaultUnlock === undefined
        ? {}
        : { automaticVaultUnlock }),
      ...(platformSecrets === undefined ? {} : { platformSecrets }),
    });
  } catch (error) {
    presentServiceError(error);
  }
}

/**
 * ADR 0130 E1. Measures the doors from inside a packaged companion.
 *
 * **In-process facts only.** Whether a session hosts a tray or a notification
 * daemon is a question about the bus, and the verifier asks it there; what
 * only this process can answer is whether *its* doors are wired - that the
 * second launch of this executable raised this window instead of starting a
 * second companion, and that the notification it raises carries an action
 * that opens that window.
 *
 * The second launch is real. A test that asserted `app.on('second-instance')`
 * is registered would pass on a build whose desktop entry launches a different
 * binary, which is the failure that looks like success: two companions, each
 * holding half the state, and a window on screen so nothing reads as broken.
 */
async function runReachabilityProbe(): Promise<void> {
  /**
   * The same two steps a real start does before any window exists. A probe
   * that opened a window without them would raise one the renderer cannot
   * talk to, and then measure that as a working door.
   */
  lockDownRendererSession();
  registerIpc();
  process.stdout.write('Pico reachability probe: ipc ready.\n');
  let trayCreated = false;
  try {
    createTray();
    trayCreated = true;
  } catch {
    // A desktop with no host does not usually throw - it accepts an icon and
    // shows it to nobody - but a refusal here is still an absent door rather
    // than a failed probe.
    trayCreated = false;
  }

  process.stdout.write('Pico reachability probe: tray step done.\n');
  /**
   * Observed, never helped. Raising the window belongs to the handler the
   * product registers, and a probe that called `showWindow` here would keep
   * passing on a build that had lost it - proving the probe rather than the
   * door. The product's handler runs first - it registered first - so by the
   * time this listener fires, the window it created either exists or the door
   * is not wired. It shows itself only once the renderer has loaded, which
   * takes as long as it takes: waited for on the window's own `show` event
   * under the one 15s ceiling, because a fixed grace period read a slow
   * renderer load as a missing door.
   */
  const raised = new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 15_000);
    app.once('second-instance', () => {
      const opened = currentWindow();
      if (opened === null || opened.isDestroyed()) {
        clearTimeout(timer);
        resolve(false);
        return;
      }
      if (opened.isVisible()) {
        clearTimeout(timer);
        resolve(true);
        return;
      }
      opened.once('show', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  });
  process.stdout.write('Pico reachability probe: launching a second copy.\n');
  const second = spawn(process.execPath, process.argv.slice(1), { stdio: 'ignore' });
  /**
   * Waited for rather than detached. The second copy quits the moment it finds
   * the lock held, and a probe that returned while it was still starting left
   * a process writing into the extraction directory the verifier was deleting
   * - which surfaced as `ENOTEMPTY` and reads like a packaging fault. A copy
   * still running at the deadline is killed for the same reason: abandoning it
   * reopens exactly that race. And a spawn that fails emits `error`, which
   * without a listener would kill the probe before any report.
   */
  const secondExited = new Promise<void>((resolve) => {
    const deadline = setTimeout(() => {
      second.kill('SIGKILL');
      setTimeout(resolve, 1_000);
    }, 15_000);
    const settled = () => {
      clearTimeout(deadline);
      resolve();
    };
    second.once('exit', settled);
    second.once('error', settled);
  });
  const delivered = await raised;
  const opened = currentWindow();
  const secondLaunchRaisedTheFirst = delivered
    && opened !== null && !opened.isDestroyed() && opened.isVisible();
  await secondExited;
  process.stdout.write('Pico reachability probe: second copy exited.\n');

  /**
   * The notification door, driven through the function the product uses. The
   * click is emitted rather than clicked: a daemon's delivery is the session's
   * to prove, and what belongs to this process is that the action leads
   * somewhere.
   */
  await destroyAfterLoadSettles(currentWindow());
  window = null;
  const notification = buildNotification(parsePicoCompanionPresentation({
    kind: 'idle',
    severity: 'active',
    symbol: '●',
    decision: 'none',
    title: 'Pico reachability probe',
    body: 'Raised by the ADR 0130 E1 probe and not by anything that needs you.',
    observedAt: new Date().toISOString(),
  }));
  process.stdout.write('Pico reachability probe: notification built.\n');
  notification.emit('click');
  // Read back through a call: the assignment happens inside the handler, and
  // a direct read here is narrowed to the `null` two statements above.
  const afterClick = currentWindow();
  const notificationOpensTheWindow = afterClick !== null && !afterClick.isDestroyed();

  // Closed before the report, so the exit does not race a renderer still
  // loading its page.
  await destroyAfterLoadSettles(afterClick);
  window = null;
  process.stdout.write(`${JSON.stringify({
    schema: 'pico.companion.reachability.v1',
    packaged: app.isPackaged,
    executable: process.execPath,
    trayCreated,
    secondLaunchRaisedTheFirst,
    notificationsSupported: Notification.isSupported(),
    notificationOpensTheWindow,
  })}\n`);
  tray?.destroy();
  app.exit(0);
}

/**
 * A window is destroyed only once its page load has settled. Destroying one
 * mid-load rejects the `loadFile` behind it, and `app.exit` with a renderer
 * still being brought up has hung Electron's teardown here - which reads as
 * a probe that never answered, on a machine busy enough to lose the race.
 */
async function destroyAfterLoadSettles(target: BrowserWindow | null): Promise<void> {
  if (target === null || target.isDestroyed()) {
    return;
  }
  if (target.webContents.isLoading()) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 10_000);
      const settled = (): void => {
        clearTimeout(timer);
        resolve();
      };
      target.webContents.once('did-finish-load', settled);
      target.webContents.once('did-fail-load', settled);
    });
  }
  if (!target.isDestroyed()) {
    target.destroy();
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
    picoCompanionIpcChannels.beginFirstRun,
    async (event: IpcMainInvokeEvent, value: unknown) => {
      assertRendererSender(event);
      if (productOperationActive || presentation.decision !== 'begin_first_run') {
        return;
      }
      try {
        const source = parsePicoCompanionFirstRunScanSource(value);
        productOperationActive = true;
        await runFirstRun(source);
      } catch (error) {
        await presentFirstRunFailure(error);
      } finally {
        productOperationActive = false;
      }
    },
  );
  /**
   * ADR 0130 E2. The other first run: a Home nobody lives in yet.
   *
   * **Everything it needs is collected here, not in the window.** The address
   * is ordinary, but the line a person pastes carries the one-time move-in
   * code, which is what authorises taking the Home - and ADR 0113 C2 keeps
   * anything that authorises out of the renderer. So the window chooses the
   * situation and this process asks for the content, exactly as it does for
   * the Recovery Card.
   */
  ipcMain.handle(
    picoCompanionIpcChannels.beginFounding,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (productOperationActive || presentation.decision !== 'begin_first_run') {
        return;
      }
      try {
        productOperationActive = true;
        await runFounding();
      } catch (error) {
        await presentFirstRunFailure(error);
      } finally {
        productOperationActive = false;
      }
    },
  );
  /**
   * ADR 0130 E3. The third first run: a Home that exists, on a device that is
   * not in it yet.
   *
   * Same rule as the two above - the window picks the situation and whether
   * the camera or the keyboard reads the codes, and every code, key and
   * passphrase is handled here.
   */
  ipcMain.handle(
    picoCompanionIpcChannels.joinFromDevice,
    async (event: IpcMainInvokeEvent, value: unknown) => {
      assertRendererSender(event);
      if (productOperationActive || presentation.decision !== 'begin_first_run') {
        return;
      }
      try {
        const source = parsePicoCompanionFirstRunScanSource(value);
        productOperationActive = true;
        await runJoinFromDevice(source);
      } catch (error) {
        await presentFirstRunFailure(error);
      } finally {
        productOperationActive = false;
      }
    },
  );
  /**
   * The sponsor's half, from settings rather than from first run: this device
   * already has a Home, and is adding another device to it.
   */
  ipcMain.handle(
    picoCompanionIpcChannels.beginEnrolment,
    async (event: IpcMainInvokeEvent, value: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      if (productOperationActive) {
        throw new Error('companion_operation_in_progress');
      }
      const source = parsePicoCompanionFirstRunScanSource(value);
      try {
        productOperationActive = true;
        await runEnrolment(source, runtime);
      } finally {
        productOperationActive = false;
      }
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.getPresentation,
    (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      return presentation;
    },
  );
  /**
   * ADR 0152. The three the window needs, and nothing it does not.
   *
   * A read that fails does not become a blocked presentation: not knowing what
   * computes for you is not an alarm, and ADR 0118 O4's rule is that no
   * absence renders a working thing as broken. The window shows nothing and
   * the person can ask again.
   */
  ipcMain.handle(
    picoCompanionIpcChannels.getModelProviders,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (runtime === null) {
        return [];
      }
      try {
        return await runtime.readModelProviders();
      } catch {
        return [];
      }
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.decideModelProvider,
    async (event: IpcMainInvokeEvent, decision: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      const record = decision as Record<string, unknown> | undefined;
      if (typeof record?.entryId !== 'string'
        || typeof record.providerClass !== 'string'
        || typeof record.carries !== 'string') {
        // The renderer is the least interesting attacker here and still the
        // one closest to the wire, so the shape is checked rather than passed.
        throw new Error('invalid_model_provider_decision');
      }
      await runtime.decideModelProvider({
        entryId: record.entryId,
        providerClass: record.providerClass,
        carries: record.carries,
        ...(typeof record.credentialRef === 'string'
          ? { credentialRef: record.credentialRef }
          : {}),
      });
    },
  );
  /**
   * ADR 0151 PV1 with ADR 0113 C2. The secret is typed where no page sees it.
   *
   * The renderer asks for the widening and never touches the credential: the
   * keystrokes are captured in this process, exactly as the Vault passphrase
   * and the Card PIN already are, and the window is told a character count.
   * That is what keeps the preload's own rule true - no secret crosses that
   * bridge - now that there is a secret to keep off it.
   */
  ipcMain.handle(
    picoCompanionIpcChannels.widenModelProvider,
    async (event: IpcMainInvokeEvent, widening: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      const record = widening as Record<string, unknown> | undefined;
      if (typeof record?.entryId !== 'string' || typeof record.providerClass !== 'string') {
        throw new Error('invalid_model_provider_widening');
      }
      const secret = await captureSecret({
        title: 'Enter the credential for this provider',
        instruction: 'Type what this machine asks Pico to prove itself with, then press '
          + 'Enter. Your Home seals it; this device keeps no copy.',
        maximumLength: 4_096,
        validate: (value: string) => value.length > 0,
      });
      await runtime.widenModelProvider({
        entryId: record.entryId,
        providerClass: record.providerClass,
        secret,
      });
    },
  );
  /**
   * ADR 0116 W1. A question this person asked, and the list of them.
   *
   * The ask throws on a refusal and the read does not: not knowing what you
   * asked before is an absence (ADR 0118 O4), while a question that never
   * reached your Home is something the person needs told - they are standing
   * there waiting for an answer that is not coming.
   */
  ipcMain.handle(
    picoCompanionIpcChannels.askRecall,
    async (event: IpcMainInvokeEvent, ask: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      const record = ask as Record<string, unknown> | undefined;
      if (typeof record?.privacyDomain !== 'string' || typeof record.question !== 'string') {
        throw new Error('invalid_recall_ask');
      }
      return await runtime.askRecall({
        privacyDomain: record.privacyDomain,
        question: record.question,
      });
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.getRecalls,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (runtime === null) {
        return [];
      }
      try {
        return await runtime.readRecalls();
      } catch {
        return [];
      }
    },
  );
  /**
   * ADR 0082 with ADR 0100. The person's own device issuing the grant.
   *
   * It throws on a refusal rather than answering an empty result: somebody
   * pressed a button and is standing there, and the three refusals this can
   * give are three different things to do next.
   */
  /**
   * ADR 0116 W5. A keep that fails must not be quiet: somebody pressed a
   * button and is waiting to be told their answer was kept.
   */
  ipcMain.handle(
    picoCompanionIpcChannels.keepRecall,
    async (event: IpcMainInvokeEvent, jobId: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      if (typeof jobId !== 'string') {
        throw new Error('invalid_recall_keep');
      }
      return await runtime.keepRecall(jobId);
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.grantDomainRead,
    async (event: IpcMainInvokeEvent, privacyDomain: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      if (typeof privacyDomain !== 'string' || privacyDomain.trim() === '') {
        throw new Error('invalid_domain_read_grant');
      }
      return await runtime.grantDomainRead({ privacyDomain: privacyDomain.trim() });
    },
  );
  /**
   * ADR 0138 CO3/CO4. What is attached, and whether it may reach out.
   *
   * The read fails quietly; the decision throws, because a person pressed it
   * and is waiting to be told whether it took - and this one is about their
   * money.
   */
  /**
   * ADR 0142 PE2. The person names a machine and the Home times it.
   *
   * The provider class is not in the payload. A typed address is ADR 0048's
   * `declared_own_host` or it is nothing, and the companion module is where
   * that is stated once - a renderer sending a class would be choosing what
   * kind of thing somebody's machine is.
   */
  ipcMain.handle(
    picoCompanionIpcChannels.askModelProviderMeasurement,
    async (event: IpcMainInvokeEvent, request: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      const record = request as Record<string, unknown> | undefined;
      if (typeof record?.reach !== 'string' || typeof record.model !== 'string') {
        throw new Error('invalid_model_provider_measurement');
      }
      return await runtime.askModelProviderMeasurement({
        reach: record.reach,
        model: record.model,
      });
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.getModelProviderMeasurements,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (runtime === null) {
        return [];
      }
      try {
        return await runtime.readModelProviderMeasurements();
      } catch {
        return [];
      }
    },
  );
  /** ADR 0071. One memory item, unmade by the person who made it. */
  ipcMain.handle(
    picoCompanionIpcChannels.forgetMemory,
    async (event: IpcMainInvokeEvent, memoryItemId: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      if (typeof memoryItemId !== 'string') {
        throw new Error('invalid_memory_item');
      }
      await runtime.forgetMemory(memoryItemId);
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.getSuppliers,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      // Both halves, or neither. An empty array here would parse as "no
      // suppliers at all" rather than as "the Home could not be asked".
      const nothing = { suppliers: [], declared: [] };
      if (runtime === null) {
        return nothing;
      }
      try {
        return await runtime.readSuppliers();
      } catch {
        return nothing;
      }
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.decideSupplierReach,
    async (event: IpcMainInvokeEvent, request: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      const record = request as Record<string, unknown> | undefined;
      if (typeof record?.identifier !== 'string'
        || typeof record.mayReachOutside !== 'boolean'
        || typeof record.mayReachUnasked !== 'boolean') {
        throw new Error('invalid_supplier_reach_decision');
      }
      await runtime.decideSupplierReach({
        identifier: record.identifier,
        mayReachOutside: record.mayReachOutside,
        mayReachUnasked: record.mayReachUnasked,
      });
    },
  );
  /**
   * ADR 0137 IN5. The person names the space a declared supplier's material
   * lands in, which is what attaches it.
   */
  ipcMain.handle(
    picoCompanionIpcChannels.attachSupplier,
    async (event: IpcMainInvokeEvent, request: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      const record = request as Record<string, unknown> | undefined;
      if (typeof record?.identifier !== 'string'
        || typeof record.privacyDomain !== 'string') {
        throw new Error('invalid_supplier_attachment');
      }
      return await runtime.attachSupplier({
        identifier: record.identifier,
        privacyDomain: record.privacyDomain,
      });
    },
  );
  /**
   * Everything a person added, taken back. One shape three times: the
   * identifier, and nothing else - what each removal reaches is the Home's to
   * decide, not this window's to describe.
   */
  ipcMain.handle(
    picoCompanionIpcChannels.detachSupplier,
    async (event: IpcMainInvokeEvent, identifier: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      if (typeof identifier !== 'string') {
        throw new Error('invalid_supplier_identifier');
      }
      await runtime.detachSupplier(identifier);
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.detachDepot,
    async (event: IpcMainInvokeEvent, remote: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      if (typeof remote !== 'string') {
        throw new Error('invalid_depot_remote');
      }
      await runtime.detachDepot(remote);
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.forgetModelProvider,
    async (event: IpcMainInvokeEvent, entryId: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      if (typeof entryId !== 'string') {
        throw new Error('invalid_model_provider_entry');
      }
      await runtime.forgetModelProvider(entryId);
    },
  );
  /** ADR 0143 DP1. What is pinned, a new pin, and whether Pico may fetch it. */
  ipcMain.handle(
    picoCompanionIpcChannels.getDepots,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (runtime === null) {
        return [];
      }
      try {
        return await runtime.readDepots();
      } catch {
        return [];
      }
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.attachDepot,
    async (event: IpcMainInvokeEvent, pin: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      if (typeof pin !== 'object' || pin === null || Array.isArray(pin)) {
        throw new Error('invalid_depot_pin');
      }
      // Passed on whole. The Home's parser is what tells somebody that asking
      // for a branch is the thing this cannot do, and a pin picked apart here
      // would lose the field that says so.
      return await runtime.attachDepot(pin as Record<string, unknown>);
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.decideDepotReach,
    async (event: IpcMainInvokeEvent, request: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      const record = request as Record<string, unknown> | undefined;
      if (typeof record?.remote !== 'string'
        || typeof record.mayFetch !== 'boolean'
        || typeof record.mayFetchUnasked !== 'boolean') {
        throw new Error('invalid_depot_reach_decision');
      }
      await runtime.decideDepotReach({
        remote: record.remote,
        mayFetch: record.mayFetch,
        mayFetchUnasked: record.mayFetchUnasked,
      });
    },
  );
  /**
   * ADR 0126 P2/P6. The person's devices, and their word about each one.
   *
   * The read fails quietly - not knowing which devices you have is an absence
   * (ADR 0118 O4) - while a switch throws, because somebody pressed it and is
   * waiting to be told whether it took.
   */
  /**
   * ADR 0143 DP8 with ADR 0141 RN4. *Fetch now*, and the question it produces.
   *
   * The presence session is put in here rather than sent by the renderer: it
   * says a person is at this window, and a renderer asserting that would be
   * the window vouching for itself.
   */
  ipcMain.handle(
    picoCompanionIpcChannels.fetchDepotsNow,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      if (presenceSessionId === null) {
        // No window, no session, no question. Reached only if a renderer
        // outlived the window that loaded it.
        throw new Error('no_presence_session');
      }
      return await runtime.askDepotFetch(presenceSessionId);
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.getPendingActions,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (runtime === null || presenceSessionId === null) {
        // ADR 0118 O4: nothing waiting reads as nothing waiting. A window that
        // cannot ask has no questions to show, which is the truth.
        return [];
      }
      try {
        return await runtime.readPendingActions(presenceSessionId);
      } catch {
        return [];
      }
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.resolvePendingAction,
    async (event: IpcMainInvokeEvent, request: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      if (presenceSessionId === null) {
        throw new Error('no_presence_session');
      }
      const record = request as Record<string, unknown> | undefined;
      if (typeof record?.requestedEventId !== 'string'
        || typeof record.approved !== 'boolean') {
        throw new Error('invalid_pending_action_decision');
      }
      return await runtime.resolvePendingAction({
        requestedEventId: record.requestedEventId,
        presenceSessionId,
        approved: record.approved,
      });
    },
  );
  /** ADR 0139 AC4. What the parts of Pico may do, agreed to one at a time. */
  ipcMain.handle(
    picoCompanionIpcChannels.getModuleConsent,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (runtime === null) {
        return [];
      }
      try {
        return await runtime.readModuleConsent();
      } catch {
        return [];
      }
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.recordModuleConsent,
    async (event: IpcMainInvokeEvent, identifier: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      if (typeof identifier !== 'string') {
        throw new Error('invalid_module_consent');
      }
      await runtime.recordModuleConsent(identifier);
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.getDevices,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (runtime === null) {
        return [];
      }
      try {
        return await runtime.readDevices();
      } catch {
        return [];
      }
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.switchDevice,
    async (event: IpcMainInvokeEvent, request: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      const record = request as Record<string, unknown> | undefined;
      if (typeof record?.presenceId !== 'string'
        || typeof record.enabled !== 'boolean'
        || (record.affordance !== undefined && typeof record.affordance !== 'string')) {
        throw new Error('invalid_device_switch');
      }
      await runtime.switchDevice({
        presenceId: record.presenceId,
        ...(record.affordance === undefined ? {} : { affordance: record.affordance }),
        enabled: record.enabled,
      });
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.forgetDevice,
    async (event: IpcMainInvokeEvent, presenceId: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      if (typeof presenceId !== 'string') {
        throw new Error('invalid_device_forget');
      }
      await runtime.forgetDevice(presenceId);
    },
  );
  /**
   * ADR 0130 E3. Both of these throw, and the read throwing is the point.
   *
   * `getDevices` above answers `[]` when the read fails, because not knowing
   * which devices are here is an absence (ADR 0118 O4). Not knowing which
   * devices may act as you is not an absence - answering `[]` would tell a
   * person their Home answers to nothing, which is the one thing that can
   * never be true of a founded Home.
   */
  ipcMain.handle(
    picoCompanionIpcChannels.getDeviceAuthority,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      return await runtime.readDeviceAuthority();
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.endDeviceAuthority,
    async (event: IpcMainInvokeEvent, request: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      const record = request as Record<string, unknown> | undefined;
      /**
       * Read out of the same list the window offered rather than repeated
       * here. The vocabulary is the person's three and not the protocol's
       * five, and a third copy of it in this file is how the boundary and the
       * surface would come to disagree about what a person may say.
       */
      const offered = picoCompanionDeviceRevocationReasonLines();
      const reason = offered.find((line) => line.reason === record?.reason);
      if (typeof record?.delegationId !== 'string' || reason === undefined) {
        throw new Error('invalid_device_authority_end');
      }
      return await runtime.revokeDeviceAuthority({
        targetDelegationId: record.delegationId,
        reason: reason.reason,
      });
    },
  );
  /**
   * ADR 0130 E4. The Home itself, from the device that decides about it.
   *
   * The fingerprint of the Pico being admitted is collected here rather than
   * in the window - not because it is secret (it is the opposite: it is what
   * somebody reads out to you) but because everything that ends in a
   * signature is collected in this process (ADR 0113 C2), and this one ends
   * in the identity root signing a membership.
   */
  ipcMain.handle(
    picoCompanionIpcChannels.getHomeMembers,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      return await runtime.readHomeMembers();
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.admitHomeMember,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      if (productOperationActive) {
        throw new Error('companion_operation_in_progress');
      }
      try {
        productOperationActive = true;
        const picoIdentityFingerprintHex = await captureSecret({
          title: 'Which Pico may live here?',
          instruction: 'Paste the identity fingerprint the other person reads out of their '
            + 'own Pico. It is public, it names nobody, and they do not have to agree to '
            + 'anything - a membership is given rather than accepted.',
          maximumLength: 128,
          validate: (value: string) => /^[0-9a-f]{64}$/u.test(value.trim()),
        });
        return await runtime.admitHomeMember({
          picoIdentityFingerprintHex: picoIdentityFingerprintHex.trim(),
        });
      } finally {
        productOperationActive = false;
      }
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.endHomeMembership,
    async (event: IpcMainInvokeEvent, request: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      const record = request as Record<string, unknown> | undefined;
      const ending = picoCompanionMembershipEndingLines()
        .find((line) => line.ending === record?.ending);
      if (typeof record?.credentialId !== 'string'
        || typeof record.picoIdentityFingerprintHex !== 'string'
        || ending === undefined) {
        throw new Error('invalid_home_membership_ending');
      }
      return await runtime.endHomeMembership({
        credentialId: record.credentialId,
        picoIdentityFingerprintHex: record.picoIdentityFingerprintHex,
        ending: ending.ending,
      });
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.rotateHostKeys,
    async (event: IpcMainInvokeEvent, value: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      const reason = picoCompanionHostRotationReasonLines()
        .find((line) => line.reason === value);
      if (reason === undefined) {
        throw new Error('invalid_host_rotation_reason');
      }
      if (productOperationActive) {
        throw new Error('companion_operation_in_progress');
      }
      try {
        productOperationActive = true;
        const rotated = await runtime.rotateHostKeys({ reason: reason.reason });
        const line = picoCompanionHostRotationLine(rotated);
        await presentationPort.present(parsePicoCompanionPresentation({
          kind: 'host_keys_rotated',
          severity: rotated.repinned ? 'active' : 'warning',
          symbol: rotated.repinned ? '\u25cf' : '!',
          decision: 'none',
          title: line.title,
          body: line.body,
          observedAt: new Date().toISOString(),
        }));
        return rotated;
      } finally {
        productOperationActive = false;
      }
    },
  );
  /**
   * ADR 0154. The relay surface. Every one of these throws its refusal rather
   * than answering empty: somebody pressed a button and is waiting, and
   * "already claimed", "wrong code" and "no keystore" are three different
   * things to do next.
   */
  ipcMain.handle(
    picoCompanionIpcChannels.getRelays,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (runtime === null) {
        return [];
      }
      try {
        return await runtime.readRelays();
      } catch {
        return [];
      }
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.claimRelay,
    async (event: IpcMainInvokeEvent, claim: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      const record = claim as Record<string, unknown> | undefined;
      if (typeof record?.baseUrl !== 'string' || typeof record.claimCode !== 'string') {
        throw new Error('invalid_relay_claim');
      }
      return await runtime.claimRelay({
        baseUrl: record.baseUrl.trim(),
        claimCode: record.claimCode.trim(),
      });
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.createRelayAccount,
    async (event: IpcMainInvokeEvent, request: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      const record = request as Record<string, unknown> | undefined;
      if (typeof record?.baseUrl !== 'string'
        || typeof record.mailboxQuota !== 'number'
        || typeof record.maxCapacity !== 'number') {
        throw new Error('invalid_relay_account_request');
      }
      return await runtime.createRelayAccount({
        baseUrl: record.baseUrl,
        mailboxQuota: record.mailboxQuota,
        maxCapacity: record.maxCapacity,
      });
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.revokeRelayAccount,
    async (event: IpcMainInvokeEvent, request: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      const record = request as Record<string, unknown> | undefined;
      if (typeof record?.baseUrl !== 'string' || typeof record.accountRef !== 'string') {
        throw new Error('invalid_relay_account_request');
      }
      return await runtime.revokeRelayAccount({
        baseUrl: record.baseUrl,
        accountRef: record.accountRef,
      });
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.forgetRelay,
    async (event: IpcMainInvokeEvent, baseUrl: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      if (typeof baseUrl !== 'string') {
        throw new Error('invalid_relay_forget');
      }
      await runtime.forgetRelay(baseUrl);
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.revokeModelProvider,
    async (event: IpcMainInvokeEvent, entryId: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      if (typeof entryId !== 'string') {
        throw new Error('invalid_model_provider_entry');
      }
      await runtime.revokeModelProvider(entryId);
    },
  );
  /**
   * ADR 0116 W5. A read that fails shows nothing; a keep that fails must not.
   *
   * The asymmetry is the rule, not a style: not knowing what is waiting is an
   * absence and ADR 0118 O4 says an absence never renders as broken. But a
   * person who pressed "keep this" asked for something to happen, and silence
   * there would leave them believing it did.
   */
  ipcMain.handle(
    picoCompanionIpcChannels.getAnsweredReads,
    async (event: IpcMainInvokeEvent) => {
      assertRendererSender(event);
      if (runtime === null) {
        return [];
      }
      try {
        return await runtime.readAnsweredReads();
      } catch {
        return [];
      }
    },
  );
  ipcMain.handle(
    picoCompanionIpcChannels.keepAnsweredRead,
    async (event: IpcMainInvokeEvent, jobId: unknown) => {
      assertRendererSender(event);
      if (runtime === null) {
        throw new Error('companion_service_unavailable');
      }
      if (typeof jobId !== 'string') {
        throw new Error('invalid_answered_read');
      }
      return await runtime.keepAnsweredRead(jobId);
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

async function presentFirstRun(): Promise<void> {
  const { readPicoCompanionFirstRunNeed } =
    await import('@pico/companion/first-run');
  const need = readPicoCompanionFirstRunNeed({
    profilePath: defaultPicoCompanionProfilePath(),
  });
  if (need.need === 'nothing') {
    return;
  }
  presentationPort.present(parsePicoCompanionPresentation({
    kind: 'first_run',
    severity: 'warning',
    symbol: '!',
    decision: 'begin_first_run',
    title: need.need === 'card_and_secrets'
      ? 'Set this device up from your Recovery Card'
      : 'Finish setting this device up',
    body: need.need === 'card_and_secrets'
      ? 'This device belongs to no Home yet. Your Recovery Card restores your identity here and asks your Home to replace your devices with this one. Your Home waits out an objection window first, so any device you still have can stop it.'
      : `Your identity is already restored on this device and your Home ${
        need.step === 'submitted'
          ? 'is holding the objection window open'
          : 'has not been asked yet'
      }. Pico needs the Vault passphrase you chose to continue; the Recovery Card is not needed again.`,
    observedAt: new Date().toISOString(),
  }));
  showWindow();
}

/**
 * The whole first run happens in the main process. The card, its PIN and the
 * passphrase are collected here - by camera decoder or by main-process
 * keystroke capture - and the renderer only ever learns which source was
 * chosen and how the attempt ended.
 */
async function runFirstRun(source: PicoCompanionFirstRunScanSource): Promise<void> {
  if (window === null || window.isDestroyed()) {
    throw new Error('companion_window_unavailable');
  }
  const profilePath = defaultPicoCompanionProfilePath();
  const { readPicoCompanionFirstRunNeed, runPicoCompanionFirstRun } =
    await import('@pico/companion/first-run');
  const need = readPicoCompanionFirstRunNeed({ profilePath });
  if (need.need === 'nothing') {
    return;
  }

  let cardTransport: string | undefined;
  let pin: string | undefined;
  if (need.need === 'card_and_secrets') {
    cardTransport = source === 'camera'
      ? await scanCardWithCamera()
      : await captureSecret({
        title: 'Scan or type the Recovery Card code',
        instruction: 'Use a USB scanner, or type the code printed under the QR block, then press Enter.',
        maximumLength: 8_192,
        validate: (value: string) => value.startsWith('pico-recovery-card-v2:'),
      });
    pin = await captureSecret({
      title: 'Enter the Card PIN',
      instruction: 'Type the PIN you chose when this card was printed, then press Enter.',
      maximumLength: 64,
      validate: (value: string) => /^[0-9a-z]{6,64}$/u.test(value),
    });
  }
  const passphrase = await captureSecret({
    title: need.need === 'card_and_secrets'
      ? 'Choose this device\'s Vault passphrase'
      : 'Enter this device\'s Vault passphrase',
    instruction: need.need === 'card_and_secrets'
      ? 'This passphrase protects the keys Pico is about to create on this device. It is not the Card PIN.'
      : 'Type the Vault passphrase you chose when this device started its setup, then press Enter.',
    maximumLength: 1_024,
    validate: (value: string) => value.length > 0,
  });

  const outcome = await runPicoCompanionFirstRun({
    profilePath,
    sodium,
    socketPath: defaultPicoVaultDaemonSocketPath(),
    secrets: {
      ...(cardTransport === undefined ? {} : { cardTransport }),
      ...(pin === undefined ? {} : { pin }),
      passphrase,
    },
    notifications: createPicoCompanionPresentationAdapter(presentationPort),
    decisions: approvalDecisionPort,
    ...(await firstRunPlatformSecrets()),
  });
  await presentFirstRunOutcome(outcome);
  if (outcome.status === 'complete') {
    await startServiceCore();
  }
}

/**
 * A keystore that cannot seal is not a reason to refuse the run: the profile
 * is what makes the device real, and automatic unlock is an optimisation the
 * journal records the absence of.
 */
async function firstRunPlatformSecrets(): Promise<{
  platformSecrets?: PicoCompanionPlatformSecretPort;
}> {
  try {
    const [electronModule, platformKeystoreModule] = await Promise.all([
      import('electron'),
      import('./platform-keystore.js'),
    ]);
    const platformSecrets = platformKeystoreModule
      .createLinuxElectronPlatformSecretPort(electronModule.safeStorage);
    return platformSecrets.isEncryptionAvailable()
      ? { platformSecrets }
      : {};
  } catch {
    return {};
  }
}

async function scanCardWithCamera(): Promise<string> {
  await presentationPort.present(parsePicoCompanionPresentation({
    kind: 'secure_input',
    severity: 'warning',
    symbol: '!',
    decision: 'none',
    title: 'Hold the card in front of the camera',
    body: 'Pico is reading the QR block through the system camera. The code is decoded outside this page and never reaches it.',
    observedAt: new Date().toISOString(),
  }));
  const { scanPicoRecoveryCardWithCamera } = await import('./camera-scan.js');
  return await scanPicoRecoveryCardWithCamera();
}

async function captureSecret(prompt: {
  title: string;
  instruction: string;
  maximumLength: number;
  validate: (value: string) => boolean;
  /** ADR 0130 E3. A code that stays visible while this is answered. */
  code?: PicoCompanionDeviceCode;
}): Promise<string> {
  if (window === null || window.isDestroyed()) {
    throw new Error('companion_window_unavailable');
  }
  return await collectPicoCompanionSecureInput({
    window,
    prompt,
    presentCount: async (count, invalid) => {
      await presentSecureInput(prompt, count, invalid);
    },
  });
}

/**
 * ADR 0130 E2. Founds a Home from this device, with no terminal in it.
 *
 * The three things asked for are asked in the order a person has them: the
 * address of the Home they just started, the line it printed, and a passphrase
 * they choose now. The line is validated before anything is created, because
 * a typo in it should cost a retype rather than a vault.
 */
async function runFounding(): Promise<void> {
  if (window === null || window.isDestroyed()) {
    throw new Error('companion_window_unavailable');
  }
  const { foundPicoCompanionHome, parsePicoHomeSetupAnnouncement } =
    await import('@pico/companion/founding');

  const coreUrl = await captureSecret({
    title: 'Where is your Pico Home?',
    instruction: 'Type the address it is reachable at, then press Enter. '
      + 'For a Home on this machine that is usually http://127.0.0.1:3100.',
    maximumLength: 2_048,
    validate: (value: string) => /^https?:\/\/\S+$/u.test(value.trim()),
  });
  const announcementLine = await captureSecret({
    title: 'Paste the line your Home printed when it started',
    instruction: 'It contains the one-time move-in code and the keys this device will pin '
      + 'your Home to. Pico checks it against the Home before using it, which is why it '
      + 'comes from your own log rather than from the Home itself.',
    maximumLength: 8_192,
    validate: (value: string) => value.includes('picoHomeMoveInCode'),
  });
  // Parsed before a passphrase is asked for, so a mistyped line costs a
  // retype and not a vault nobody can open.
  const announcement = parsePicoHomeSetupAnnouncement(announcementLine);

  const passphrase = await captureSecret({
    title: 'Choose a Vault passphrase',
    instruction: 'It protects the keys this device is about to make. Nothing can recover '
      + 'them without it, and Pico never sends it anywhere.',
    maximumLength: 1_024,
    validate: (value: string) => value.length > 0,
  });

  const outcome = await foundPicoCompanionHome({
    socketPath: defaultPicoVaultDaemonSocketPath(),
    profilePath: defaultPicoCompanionProfilePath(),
    coreUrl: coreUrl.trim(),
    announcement,
    passphrase,
    sodium: sodium as never,
    decisions: approvalDecisionPort,
    // The same seal a restored device gets, for the same reason: which door a
    // person came through must not decide whether they type a passphrase at
    // every start.
    ...(await firstRunPlatformSecrets()),
    announce: (step) => {
      presentationPort.present(parsePicoCompanionPresentation({
        kind: 'first_run',
        severity: 'active',
        symbol: '●',
        decision: 'none',
        title: picoCompanionFoundingStepLine(step).title,
        body: picoCompanionFoundingStepLine(step).body,
        observedAt: new Date().toISOString(),
      }));
    },
    delegationValidUntil: picoCompanionFoundingDelegationValidUntil(new Date()),
  });

  presentationPort.present(parsePicoCompanionPresentation({
    kind: 'idle',
    severity: 'active',
    symbol: '●',
    decision: 'none',
    title: 'Your Home is yours',
    body: `This device founded ${outcome.homeId} and moved in. Make a Recovery Card next: `
      + 'without one, nothing can put your identity on another device.'
      + (outcome.platformUnlockBound
        ? ''
        : ' This system has no usable keystore, so Pico will ask for your Vault '
          + 'passphrase each time it starts.'),
    observedAt: new Date().toISOString(),
  }));
  await startServiceCore();
}

/**
 * ADR 0130 E3. The two halves of adding a device, from whichever side this
 * machine is on.
 *
 * Both are walked here rather than in the window for ADR 0113 C2's reason:
 * the codes carry an activation this device signs and the pins it will trust
 * a Home by, and nothing that authorises reaches the renderer. The window
 * chose the situation and whether the camera or the keyboard reads.
 */
async function readDeviceCode(
  step: PicoCompanionEnrolmentStep,
  prefix: string,
  source: PicoCompanionFirstRunScanSource,
  showing?: PicoCompanionDeviceCode,
): Promise<string> {
  const line = picoCompanionEnrolmentStepLine(step);
  if (source === 'camera') {
    await presentationPort.present(parsePicoCompanionPresentation({
      kind: showing === undefined ? 'secure_input' : 'device_code',
      severity: 'warning',
      symbol: '!',
      decision: 'none',
      title: line.title,
      body: `${line.body} The code is decoded outside this page and never reaches it.`,
      ...(showing === undefined ? {} : { code: showing }),
      observedAt: new Date().toISOString(),
    }));
    const { scanPicoRecoveryCardWithCamera } = await import('./camera-scan.js');
    return await scanPicoRecoveryCardWithCamera({ prefix });
  }
  return await captureSecret({
    title: line.title,
    instruction: `${line.body} Paste it, or use a scanner, then press Enter.`,
    maximumLength: 8_192,
    validate: (value: string) => value.startsWith(prefix),
    ...(showing === undefined ? {} : { code: showing }),
  });
}

async function presentDeviceCode(
  step: PicoCompanionEnrolmentStep,
  code: PicoCompanionDeviceCode,
): Promise<void> {
  const line = picoCompanionEnrolmentStepLine(step);
  await presentationPort.present(parsePicoCompanionPresentation({
    kind: 'device_code',
    severity: 'active',
    symbol: '●',
    decision: 'none',
    title: line.title,
    body: line.body,
    code,
    observedAt: new Date().toISOString(),
  }));
}

async function presentEnrolmentStep(step: PicoCompanionEnrolmentStep): Promise<void> {
  const line = picoCompanionEnrolmentStepLine(step);
  await presentationPort.present(parsePicoCompanionPresentation({
    kind: step === 'joined' ? 'idle' : 'first_run',
    severity: 'active',
    symbol: '●',
    decision: 'none',
    title: line.title,
    body: line.body,
    observedAt: new Date().toISOString(),
  }));
}

/** The device that already has the Home: it reads, signs, and submits. */
async function runEnrolment(
  source: PicoCompanionFirstRunScanSource,
  service: PicoCompanionShellRuntime,
): Promise<void> {
  const { picoCompanionDeviceCode } = await import('./enrolment-code.js');
  const offerCode = await readDeviceCode(
    'read_offer',
    'pico-device-offer-v1:',
    source,
  );
  const enrolled = await service.enrolDevice({
    offerCode,
    validUntil: picoCompanionEnrolmentValidUntil(new Date()),
    exchange: async (grantCode: string) => {
      const shown = picoCompanionDeviceCode(grantCode);
      await presentDeviceCode('show_grant', shown);
      /**
       * The grant stays on screen while the answer is read. On the camera
       * path the other device is reading it at that moment; on the typed one
       * the person still needs it in front of them.
       */
      return await readDeviceCode(
        'read_acceptance',
        'pico-device-acceptance-v1:',
        source,
        shown,
      );
    },
  });
  const line = picoCompanionEnrolmentStepLine('added');
  await presentationPort.present(parsePicoCompanionPresentation({
    kind: 'idle',
    severity: 'active',
    symbol: '●',
    decision: 'none',
    title: line.title,
    body: `${line.body} It is known by ${
      enrolled.targetSigningKeyFingerprintHex.slice(0, 12)
    }, which is what that device showed you.`,
    observedAt: new Date().toISOString(),
  }));
}

/** The device that has nothing: it makes keys, signs, and waits to be let in. */
async function runJoinFromDevice(source: PicoCompanionFirstRunScanSource): Promise<void> {
  const [{ acceptPicoCompanionEnrolment, offerPicoCompanionEnrolment }, { picoCompanionDeviceCode }] =
    await Promise.all([
      import('@pico/companion/enrolment'),
      import('./enrolment-code.js'),
    ]);

  const passphrase = await captureSecret({
    title: 'Choose a Vault passphrase for this device',
    instruction: 'It protects the keys this device is about to make for itself. Your other '
      + 'device keeps its own; nothing can recover either without its passphrase.',
    maximumLength: 1_024,
    validate: (value: string) => value.length > 0,
  });

  const offer = await offerPicoCompanionEnrolment({
    socketPath: defaultPicoVaultDaemonSocketPath(),
    passphrase,
  });
  const shownOffer = picoCompanionDeviceCode(offer.offerCode);
  await presentDeviceCode('show_offer', shownOffer);
  const grantCode = await readDeviceCode(
    'read_grant',
    'pico-device-grant-v1:',
    source,
    shownOffer,
  );

  const accepted = await acceptPicoCompanionEnrolment({
    socketPath: defaultPicoVaultDaemonSocketPath(),
    passphrase,
    grantCode,
    profilePath: defaultPicoCompanionProfilePath(),
    sodium: sodium as never,
    decisions: approvalDecisionPort,
    device: offer.device,
    ...(await firstRunPlatformSecrets()),
  });
  await presentDeviceCode(
    'show_acceptance',
    picoCompanionDeviceCode(accepted.acceptanceCode),
  );

  /**
   * The wait, and it is the person's too: the other device has to carry the
   * answer to the Home before this one is anybody. `confirm` ends when the
   * Home says so, and the profile is written then and not before.
   */
  const waiting = presentEnrolmentStep('waiting');
  try {
    await accepted.confirm();
  } finally {
    await waiting;
  }
  await presentEnrolmentStep('joined');
  await startServiceCore();
}

async function presentFirstRunOutcome(
  outcome: PicoCompanionFirstRunOutcome,
): Promise<void> {
  if (outcome.status === 'awaiting_window') {
    await presentationPort.present(parsePicoCompanionPresentation({
      kind: 'recovery_waiting',
      severity: 'warning',
      symbol: '!',
      decision: 'none',
      title: 'Your Home is holding the objection window open',
      body: `Any device you still have can stop this until ${outcome.pending.effectiveAt}. Come back after that and Pico will finish setting this device up; it will ask for the Vault passphrase again, and nothing else.`,
      observedAt: new Date().toISOString(),
    }));
    return;
  }
  if (outcome.status === 'blocked') {
    await presentProductError(
      'This device was not set up',
      outcome.reason === 'completion_window_lapsed'
        ? 'The window to finish has passed, so your Home refused the replacement. Print a fresh Recovery Card from a device you still have, or start again from this one.'
        : 'Pico could not finish with your Home. Nothing changed there. Check that your Home is reachable, then try again.',
    );
    return;
  }
  await presentationPort.present(parsePicoCompanionPresentation({
    kind: 'recovery_completed',
    severity: 'active',
    symbol: '●',
    decision: 'none',
    title: 'This device is now your Pico',
    body: `Your Home replaced every earlier device with this one. ${
      outcome.platformUnlockBound
        ? 'Pico will unlock this device\'s keys for you after you sign in.'
        : 'Automatic unlock is off on this device, so Pico will ask for the Vault passphrase when it needs the keys.'
    }`,
    observedAt: new Date().toISOString(),
  }));
}

/**
 * Every failure returns to the first-run offer, because the person's next step
 * is always the same: try again. The distinctions worth making are the ones
 * that change what they should do - a card this device cannot use, a camera
 * that is not there, or a cancelled entry - and each keeps its own words while
 * the reason string stays public.
 */
async function presentFirstRunFailure(error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : '';
  const body = message.startsWith('invalid_recovery_card_scan')
    || message.startsWith('noncanonical_recovery_card')
    ? 'That code is not a Pico Recovery Card this device can use. A card printed before your Home pinned its acceptor cannot start a device on its own.'
    : message.startsWith('camera_scan_')
      ? message === 'camera_scan_unavailable'
        ? 'Pico found no camera decoder on this system. Install zbar-tools, or use a USB scanner or typing instead.'
        : 'Pico did not read a card from the camera. Try again, or use a USB scanner or typing instead.'
      : message === 'secure_input_cancelled'
        ? 'Setup was cancelled. Nothing was sent to your Home.'
        : message.startsWith('first_run_home_unverified')
          ? 'This device could not verify that the Home on the card is really your Home, so it did nothing. Check that you are on the right network and try again.'
          : `Pico could not set this device up (${
            picoCompanionPublicServiceErrorReason(error)
          }). Nothing was changed at your Home.`;
  await presentationPort.present(parsePicoCompanionPresentation({
    kind: 'first_run',
    severity: 'blocked',
    symbol: '×',
    decision: 'begin_first_run',
    title: 'This device was not set up',
    body,
    observedAt: new Date().toISOString(),
  }));
  showWindow();
}

async function runRecoveryCardIssuance(
  details: ReturnType<typeof parsePicoCompanionRecoveryCardSetupInput>,
): Promise<void> {
  if (window === null || window.isDestroyed()) {
    throw new Error('companion_window_unavailable');
  }
  // Loaded here rather than at the top of the file, because issuing a card
  // reaches `pdf-lib` - a 1.7 MB bundle whose parsed form is private dirty
  // memory, the class ADR 0113 C3 budgets. A tray that has done nothing has no
  // reason to have paid for it, and this ceremony runs when a person asks.
  //
  // Before the prompts, not beside the call that needs it: the load stalls for
  // as long as it stalls, and the moment to spend that is while nothing is
  // waiting on it - not between the last PIN keystroke and the printer. A
  // packaged build missing the module also says so before anyone types a
  // passphrase.
  const { issuePicoCompanionRecoveryCard } = await import('@pico/companion/recovery-card');
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
  prompt: { title: string; instruction: string; code?: PicoCompanionDeviceCode },
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
    // ADR 0130 E3. Kept on screen while the answer is typed: the code this
    // device is showing is what the other device is answering.
    ...(prompt.code === undefined ? {} : { code: prompt.code }),
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
    presenceSessionId = `presence-${randomUUID()}`;
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.on('will-attach-webview', (event) => event.preventDefault());
    window.once('closed', () => {
      window = null;
      /**
       * The session ends with the window, and the questions asked in it are
       * left *unanswered* rather than denied - ADR 0141 RN4's third state.
       * Nothing is sent to the Home to say so: the Home is already holding
       * them against a session and against a clock, and a person walking away
       * from a question did not refuse it.
       */
      presenceSessionId = null;
      const deny = pendingApprovalDecision;
      pendingApprovalDecision = null;
      deny?.(false);
    });
    void window.loadFile(rendererPath).then(() => {
      window?.show();
      window?.focus();
    }).catch(() => {
      // A window closed while its page was still loading rejects the load;
      // there is nobody left to show anything to.
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

/**
 * ADR 0154 with ADR 0081 P3. The OS keystore, if this desktop has a real one.
 *
 * Returns nothing rather than throwing when it does not: a missing keystore
 * costs the relay surface and nothing else, and a window that failed to start
 * over it would be trading the whole product for one screen.
 */
async function relayKeystore(): Promise<PicoCompanionPlatformSecretPort | undefined> {
  try {
    const [electronModule, platformKeystoreModule] = await Promise.all([
      import('electron'),
      import('./platform-keystore.js'),
    ]);
    const secrets = platformKeystoreModule
      .createLinuxElectronPlatformSecretPort(electronModule.safeStorage);
    return secrets.isEncryptionAvailable() ? secrets : undefined;
  } catch {
    return undefined;
  }
}
