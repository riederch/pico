import { afterEach, describe, expect, it, vi } from 'vitest';
import { picoFoundationRequest } from './claim-home-ceremony.js';
import { PICO_LINK_DIRECT_CLIENT_REQUEST_LIFETIME_MS } from './link-direct-client.js';

/**
 * ADR 0131 A7 auf dem **unversiegelten** Weg (Befund B161, 2026-09-13).
 *
 * `picoFoundationRequest` ist der Weg, den ein Companion vor dem Anspruch
 * geht - wenn es noch keinen versiegelten Klienten gibt, an den er sich haengen
 * koennte. Der versiegelte Weg eine Datei weiter hatte seine Frist seit dem
 * 2026-08-22; dieser nicht, und ein schweigendes Home liess damit die
 * Gruendung ohne Ende warten.
 *
 * Mit gestellter Uhr gemessen, damit die **Grenze** geprueft wird und nicht
 * nur, dass irgendwann etwas geschieht.
 */
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('picoFoundationRequest - ein Home, das nicht antwortet (B161)', () => {
  it('gibt ein schweigendes Home auf, statt fuer immer zu warten', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', (async (_url: unknown, init: { signal?: AbortSignal }) =>
      await new Promise<never>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason as Error);
        });
      })) as unknown as typeof fetch);

    const asked = picoFoundationRequest('http://127.0.0.1:1', 'setup', undefined);
    const settled = vi.fn();
    void asked.then(settled, settled);

    await vi.advanceTimersByTimeAsync(PICO_LINK_DIRECT_CLIENT_REQUEST_LIFETIME_MS - 1_000);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(asked).rejects.toThrow('foundation_timed_out');
  });

  it('nennt ein Home, das niemand erreicht, unerreichbar und nicht schweigend', async () => {
    vi.stubGlobal('fetch', (async () => {
      throw Object.assign(new Error('fetch failed'), {
        cause: { code: 'ECONNREFUSED' },
      });
    }) as unknown as typeof fetch);

    await expect(picoFoundationRequest('http://127.0.0.1:1', 'setup', undefined))
      .rejects.toThrow('foundation_unreachable:ECONNREFUSED');
  });
});
