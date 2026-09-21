import { describe, expect, it } from 'vitest';
import {
  assertPicoCompanionRendererSender,
  picoCompanionSenderIsWindow,
  picoCompanionUntrustedSenderTrace,
} from './renderer-sender.js';

/**
 * Befund B241. Diese Grenze steht vor allen 67 `ipcMain`-Registrierungen der
 * Schale und ist bis heute von keinem Test gegangen worden -
 * `check-companion-boundary.mjs` hielt fest, dass die Spurzeile *dasteht*.
 * Hier wird sie gegangen.
 */
describe('ADR 0113 C2 - which sender the main process answers', () => {
  const webContents = { id: 'the app window' };
  const expected = { rendererUrl: 'file:///opt/pico/renderer/index.html', webContents };
  const fromWindow = { senderFrame: { url: expected.rendererUrl }, sender: webContents };

  const traced: string[] = [];
  const trace = (line: string) => void traced.push(line);

  it('lets the app window through and writes nothing about it', () => {
    traced.length = 0;
    expect(picoCompanionSenderIsWindow(fromWindow, expected)).toBe(true);
    expect(() => assertPicoCompanionRendererSender(fromWindow, expected, trace)).not.toThrow();
    expect(traced).toEqual([]);
  });

  it('refuses every sender that differs in either half', () => {
    /**
     * Beide Haelften einzeln, weil jede allein erreichbar ist: ein zweiter
     * Frame im Fenster teilt die WebContents, und ein anderes Fenster laesst
     * sich auf dieselbe Datei-URL richten.
     */
    const strangers = [
      { name: 'ein fremder Frame in unserem Fenster', event: { senderFrame: { url: 'https://example.invalid/' }, sender: webContents } },
      { name: 'unsere URL aus fremden WebContents', event: { senderFrame: { url: expected.rendererUrl }, sender: { id: 'another window' } } },
      { name: 'beides fremd', event: { senderFrame: { url: 'file:///tmp/evil.html' }, sender: { id: 'another window' } } },
      { name: 'gar kein Frame', event: { sender: webContents } },
      { name: 'ein abgeraeumter Frame', event: { senderFrame: null, sender: webContents } },
      { name: 'ein Frame ohne Adresse', event: { senderFrame: {}, sender: webContents } },
      { name: 'gar kein Absender', event: { senderFrame: { url: expected.rendererUrl } } },
      { name: 'eine Adresse, die unsere nur praefixiert', event: { senderFrame: { url: `${expected.rendererUrl}.evil` }, sender: webContents } },
    ];
    for (const stranger of strangers) {
      traced.length = 0;
      expect(picoCompanionSenderIsWindow(stranger.event, expected), stranger.name).toBe(false);
      expect(() => assertPicoCompanionRendererSender(stranger.event, expected, trace), stranger.name)
        .toThrow('untrusted_companion_ipc_sender');
      expect(traced, stranger.name).toEqual([picoCompanionUntrustedSenderTrace]);
    }
  });

  it('answers nobody while there is no window, not even a sender of undefined', () => {
    /**
     * Ohne Fenster war die Vergleichsseite `undefined`, und ein Ereignis ohne
     * `sender` haette sie getroffen. Electron setzt die Eigenschaft immer -
     * die Tuer war also von aussen zu, aber sie war es durch den Besucher und
     * nicht durch das Schloss.
     */
    const noWindow = { rendererUrl: expected.rendererUrl, webContents: undefined };
    for (const event of [
      { senderFrame: { url: expected.rendererUrl } },
      { senderFrame: { url: expected.rendererUrl }, sender: undefined },
      fromWindow,
    ]) {
      expect(picoCompanionSenderIsWindow(event, noWindow)).toBe(false);
      expect(() => assertPicoCompanionRendererSender(event, noWindow, trace))
        .toThrow('untrusted_companion_ipc_sender');
    }
    expect(picoCompanionSenderIsWindow(fromWindow, { ...expected, webContents: null })).toBe(false);
  });

  it('says that it refused and says nothing about who', () => {
    /**
     * Befund B76. Nach aussen schweigen, nach innen sprechen - aber die Spur
     * darf die Adresse des Absenders nicht tragen.
     */
    traced.length = 0;
    const secret = 'https://attacker.invalid/steal?token=abc';
    expect(() => assertPicoCompanionRendererSender(
      { senderFrame: { url: secret }, sender: { id: 'x' } }, expected, trace,
    )).toThrow('untrusted_companion_ipc_sender');
    expect(traced).toHaveLength(1);
    expect(traced[0]).not.toContain(secret);
    expect(traced[0]).not.toContain('attacker.invalid');
    expect(traced[0]).not.toContain(expected.rendererUrl);
    expect(traced[0]).toContain('refused an IPC call');
    expect(traced[0].endsWith('\n')).toBe(true);
  });

  it('leaves its trace before it throws, so a throw that is caught still told somebody', () => {
    /**
     * Jede der 67 Registrierungen wirft in einen Electron-Handler hinein, der
     * dem Absender antwortet. Wenn die Spur erst nach dem Wurf geschrieben
     * wuerde, gaebe es sie nie.
     */
    const order: string[] = [];
    try {
      assertPicoCompanionRendererSender(
        { senderFrame: { url: 'file:///tmp/evil.html' }, sender: {} },
        expected,
        () => void order.push('traced'),
      );
    } catch {
      order.push('threw');
    }
    expect(order).toEqual(['traced', 'threw']);
  });
});
