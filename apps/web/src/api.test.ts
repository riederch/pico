import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PICO_HOME_URL, buildEndpointUrl, defaultPicoHomeUrl, loginOperator, mintRealtimeTicket, normalizePicoHomeUrl } from './api.js';

describe('foundation URL helpers', () => {
  it('defaults to the same origin for a direct root dashboard', () => {
    expect(defaultPicoHomeUrl(browserLocation('http://localhost:3100/'))).toBe('http://localhost:3100');
  });

  it('preserves a Home Assistant ingress path prefix from the dashboard location', () => {
    expect(defaultPicoHomeUrl(browserLocation('https://ha.local/api/hassio_ingress/pico_core/')))
      .toBe('https://ha.local/api/hassio_ingress/pico_core');
  });

  it('preserves a non-file path prefix when the dashboard URL has no trailing slash', () => {
    expect(defaultPicoHomeUrl(browserLocation('https://ha.local/api/hassio_ingress/pico_core')))
      .toBe('https://ha.local/api/hassio_ingress/pico_core');
  });

  it('uses the parent path when the dashboard URL points to an html file', () => {
    expect(defaultPicoHomeUrl(browserLocation('https://ha.local/api/hassio_ingress/pico_core/index.html?cache=1#top')))
      .toBe('https://ha.local/api/hassio_ingress/pico_core');
  });

  it('falls back to the local development URL outside http(s)', () => {
    expect(defaultPicoHomeUrl(browserLocation('file:///tmp/pico/index.html'))).toBe(DEFAULT_PICO_HOME_URL);
  });

  it('normalizes manually entered base URLs with path prefixes', () => {
    expect(normalizePicoHomeUrl('https://ha.local/api/hassio_ingress/pico_core/'))
      .toBe('https://ha.local/api/hassio_ingress/pico_core');
  });

  it('builds endpoint URLs below the configured base path', () => {
    expect(buildEndpointUrl('https://ha.local/api/hassio_ingress/pico_core', '/api/system/status').toString())
      .toBe('https://ha.local/api/hassio_ingress/pico_core/api/system/status');
  });

  it('clears base URL query strings and fragments when building endpoints', () => {
    expect(buildEndpointUrl('https://ha.local/api/hassio_ingress/pico_core?old=1#section', '/health').toString())
      .toBe('https://ha.local/api/hassio_ingress/pico_core/health');
  });
});

describe('foundation credentials', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exchanges the passphrase for a session and returns only the session', async () => {
    const fetchMock = vi.fn(async (_url: URL, _init: RequestInit) => jsonResponse(201, { session: 'session-value', expiresAt: '2026-07-17T10:00:00.000Z' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loginOperator('http://localhost:3100', 'correct horse battery staple')).resolves.toBe('session-value');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe('http://localhost:3100/api/auth/session');
    expect(init.method).toBe('POST');
    // The passphrase goes in the body, never in the URL.
    expect(url.search).toBe('');
    expect(JSON.parse(String(init.body))).toEqual({ passphrase: 'correct horse battery staple' });
  });

  it('reports an invalid passphrase without leaking why', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: URL, _init: RequestInit) => jsonResponse(401, { error: 'Foundation operator credentials are invalid.' })));

    await expect(loginOperator('http://localhost:3100', 'wrong')).rejects.toThrow('Operator passphrase is invalid.');
  });

  it('sends the operator session as a bearer header, preferring it over the static token', async () => {
    const fetchMock = vi.fn(async (_url: URL, _init: RequestInit) => jsonResponse(201, { ticket: 'ticket-value', expiresAt: '2026-07-17T10:00:30.000Z' }));
    vi.stubGlobal('fetch', fetchMock);

    await mintRealtimeTicket('http://localhost:3100', { foundationToken: 'dev-token', operatorSession: 'session-value' });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer session-value');
  });

  it('falls back to the static token when no session exists', async () => {
    const fetchMock = vi.fn(async (_url: URL, _init: RequestInit) => jsonResponse(201, { ticket: 'ticket-value', expiresAt: '2026-07-17T10:00:30.000Z' }));
    vi.stubGlobal('fetch', fetchMock);

    await mintRealtimeTicket('http://localhost:3100', { foundationToken: 'dev-token' });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer dev-token');
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function browserLocation(href: string): Pick<Location, 'href' | 'origin' | 'protocol'> {
  const url = new URL(href);

  return {
    href: url.href,
    origin: url.origin,
    protocol: url.protocol,
  };
}
