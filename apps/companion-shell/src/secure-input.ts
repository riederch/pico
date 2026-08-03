import type { BrowserWindow, Event, Input } from 'electron';

export interface PicoCompanionSecureInputPrompt {
  title: string;
  instruction: string;
  maximumLength: number;
  validate(value: string): boolean;
}

/**
 * Main-process keystroke capture for ADR 0113's no-secret renderer contract.
 * `before-input-event` is prevented before the page receives it; renderer
 * state gets only a character count. Paste and modifier shortcuts are refused
 * so clipboard contents never become a hidden second secret channel.
 */
export async function collectPicoCompanionSecureInput(input: {
  window: BrowserWindow;
  prompt: PicoCompanionSecureInputPrompt;
  presentCount(count: number, invalid: boolean): void | Promise<void>;
}): Promise<string> {
  let value = '';
  let settled = false;

  return await new Promise<string>((resolvePromise, rejectPromise) => {
    const cleanup = (): void => {
      input.window.webContents.off('before-input-event', onInput);
      input.window.off('closed', onClosed);
    };
    const finish = (result: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolvePromise(result);
    };
    const cancel = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      value = '';
      cleanup();
      rejectPromise(new Error('secure_input_cancelled'));
    };
    const onClosed = (): void => cancel();
    const onInput = (event: Event, key: Input): void => {
      if (key.type !== 'keyDown') {
        return;
      }
      event.preventDefault();
      if (key.key === 'Escape') {
        cancel();
        return;
      }
      if (key.key === 'Backspace') {
        value = Array.from(value).slice(0, -1).join('');
        void input.presentCount(Array.from(value).length, false);
        return;
      }
      if (key.key === 'Enter') {
        if (input.prompt.validate(value)) {
          finish(value);
        } else {
          void input.presentCount(Array.from(value).length, true);
        }
        return;
      }
      if (key.control || key.meta || key.alt || Array.from(key.key).length !== 1) {
        return;
      }
      if (Array.from(value).length >= input.prompt.maximumLength) {
        void input.presentCount(Array.from(value).length, true);
        return;
      }
      value += key.key;
      void input.presentCount(Array.from(value).length, false);
    };

    input.window.webContents.on('before-input-event', onInput);
    input.window.once('closed', onClosed);
    input.window.focus();
    void input.presentCount(0, false);
  });
}
