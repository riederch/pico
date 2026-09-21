/**
 * ADR 0113 C2. Which sender the main process answers, and what it does with
 * every other one.
 *
 * **Why this is its own module** (2026-09-21, finding B241). The rule lived
 * inside `main.ts`, in front of all 67 `ipcMain` registrations - and `main.ts`
 * is executed by no test. `check-companion-boundary.mjs` said so about itself:
 * it held that the trace line *stands*, not that it runs, and wrote "das ist
 * weniger, als ein Gang waere". A security boundary that nothing walks is a
 * claim, not a guard. Here it has no Electron in it, so a test can hand it a
 * foreign sender and watch what happens.
 *
 * **Two things must be true, not one.** The frame's URL has to be the window's
 * own document, *and* the WebContents has to be this app's window. Either
 * alone is reachable: a second frame inside the window shares the WebContents,
 * and a different window can be pointed at the same file URL.
 */

/** The window this process answers. Both halves, because either alone is not enough. */
export interface PicoCompanionSenderExpectation {
  /** The document the app's own window has loaded. */
  rendererUrl: string;
  /** The app window's WebContents, or `undefined` while there is no window. */
  webContents: unknown;
}

/** As much of an Electron IPC event as this decision reads. */
export interface PicoCompanionIpcSender {
  senderFrame?: { url?: string } | null;
  sender?: unknown;
}

/**
 * Nach aussen schweigen, nach innen sprechen (Befund B76).
 *
 * Weder Bild noch Adresse: der Umstand genuegt, und eine URL im Protokoll ist
 * genau das, was hier nicht hingehoert.
 */
export const picoCompanionUntrustedSenderTrace =
  'Pico companion: refused an IPC call from a sender that is not the app window.\n';

export function picoCompanionSenderIsWindow(
  event: PicoCompanionIpcSender,
  expected: PicoCompanionSenderExpectation,
): boolean {
  if (expected.webContents === undefined || expected.webContents === null) {
    /**
     * No window means nothing to answer. Without this the comparison below is
     * `event.sender === undefined`, which an event carrying no sender would
     * satisfy - a guard that is safe only because every real caller happens to
     * set a property. Electron always sets it, so this was not a door anybody
     * could walk through; it was a door held shut by the visitor.
     */
    return false;
  }
  return event.senderFrame?.url === expected.rendererUrl
    && event.sender === expected.webContents;
}

export function assertPicoCompanionRendererSender(
  event: PicoCompanionIpcSender,
  expected: PicoCompanionSenderExpectation,
  trace: (line: string) => void,
): void {
  if (picoCompanionSenderIsWindow(event, expected)) {
    return;
  }
  trace(picoCompanionUntrustedSenderTrace);
  throw new Error('untrusted_companion_ipc_sender');
}
