import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PICO_HOME_URL,
  buildEndpointUrl,
  createRetentionPolicy,
  defaultPicoHomeUrl,
  listDomainContent,
  listRetentionPolicies,
  loginOperator,
  mintRealtimeTicket,
  normalizePicoHomeUrl,
  shredPrivacyDomain,
} from './api.js';

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

describe('foundation administration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists retention policies under the operator session', async () => {
    const policy = {
      retentionPolicyId: 'short-lived',
      displayName: 'Short lived notes',
      mode: 'delete_after_max_age',
      maxAgeDays: 30,
      createdAt: '2026-07-17T10:00:00.000Z',
      updatedAt: '2026-07-17T10:00:00.000Z',
    };
    const fetchMock = vi.fn(async (_url: URL, _init: RequestInit) => jsonResponse(200, { retentionPolicies: [policy] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listRetentionPolicies('http://localhost:3100', { operatorSession: 'session-value' })).resolves.toEqual([policy]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe('http://localhost:3100/api/memory/retention-policies');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-value');
  });

  it('creates a retention policy from the given shape', async () => {
    const created = {
      retentionPolicyId: 'short-lived',
      displayName: 'Short lived notes',
      mode: 'delete_after_max_age',
      maxAgeDays: 30,
      createdAt: '2026-07-17T10:00:00.000Z',
      updatedAt: '2026-07-17T10:00:00.000Z',
    };
    const fetchMock = vi.fn(async (_url: URL, _init: RequestInit) => jsonResponse(201, created));
    vi.stubGlobal('fetch', fetchMock);

    await createRetentionPolicy('http://localhost:3100', { operatorSession: 'session-value' }, {
      retentionPolicyId: 'short-lived',
      displayName: 'Short lived notes',
      mode: 'delete_after_max_age',
      maxAgeDays: 30,
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      retentionPolicyId: 'short-lived',
      displayName: 'Short lived notes',
      mode: 'delete_after_max_age',
      maxAgeDays: 30,
    });
  });

  it('sends the shred confirmation exactly as typed and never derives it from the domain', async () => {
    const fetchMock = vi.fn(async (_url: URL, _init: RequestInit) => jsonResponse(200, { privacyDomain: 'domain-private', removedKeyVersions: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    // A mismatched confirmation must travel as-is so the server can reject it.
    // Deriving it here would confirm nothing.
    await shredPrivacyDomain('http://localhost:3100', { operatorSession: 'session-value' }, {
      privacyDomain: 'domain-private',
      confirm: 'domain-work',
    }).catch(() => undefined);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe('http://localhost:3100/api/memory/domains/domain-private/shred');
    expect(JSON.parse(String(init.body))).toEqual({ confirm: 'domain-work' });
  });

  it('reports the shred result and omits an empty reason', async () => {
    const fetchMock = vi.fn(async (_url: URL, _init: RequestInit) => jsonResponse(200, { privacyDomain: 'domain-private', removedKeyVersions: 2 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(shredPrivacyDomain('http://localhost:3100', { operatorSession: 'session-value' }, {
      privacyDomain: 'domain-private',
      confirm: 'domain-private',
      reason: '  ',
    })).resolves.toEqual({ removedKeyVersions: 2 });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toEqual({ confirm: 'domain-private' });
  });

  it("surfaces the server's own refusal rather than a bare status code", async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: URL, _init: RequestInit) => jsonResponse(409, {
      error: 'Crypto-shred requires memory encryption. Content is plaintext at rest, so destroying keys would protect nothing.',
    })));

    await expect(shredPrivacyDomain('http://localhost:3100', { operatorSession: 'session-value' }, {
      privacyDomain: 'domain-private',
      confirm: 'domain-private',
    })).rejects.toThrow('requires memory encryption');
  });
});

describe('memory content read', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sampleItem = {
    memoryItemId: 'mem-1',
    privacyDomain: 'domain-private',
    contentType: 'text/plain',
    contentPosture: 'plaintext_foundation',
    deletionState: 'active',
    content: 'A private secret.',
    createdAt: '2026-07-17T10:00:00.000Z',
    updatedAt: '2026-07-17T10:00:00.000Z',
  };

  it('reads a domain under the operator session and returns the page', async () => {
    const fetchMock = vi.fn(async (_url: URL, _init: RequestInit) => jsonResponse(200, { items: [sampleItem], nextCursor: 'cursor-2', hasMore: true }));
    vi.stubGlobal('fetch', fetchMock);

    const page = await listDomainContent('http://localhost:3100', { operatorSession: 'session-value' }, 'domain-private');
    expect(page.items).toEqual([sampleItem]);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('cursor-2');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe('http://localhost:3100/api/memory/domains/domain-private/items');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-value');
  });

  it('carries the previous page cursor forward as after', async () => {
    const fetchMock = vi.fn(async (_url: URL, _init: RequestInit) => jsonResponse(200, { items: [], nextCursor: null, hasMore: false }));
    vi.stubGlobal('fetch', fetchMock);

    await listDomainContent('http://localhost:3100', { operatorSession: 'session-value' }, 'domain-private', 'cursor-2');

    const [url] = fetchMock.mock.calls[0];
    expect(url.searchParams.get('after')).toBe('cursor-2');
  });

  it('encodes the privacy domain into the path', async () => {
    const fetchMock = vi.fn(async (_url: URL, _init: RequestInit) => jsonResponse(200, { items: [], nextCursor: null, hasMore: false }));
    vi.stubGlobal('fetch', fetchMock);

    await listDomainContent('http://localhost:3100', { operatorSession: 'session-value' }, 'domain a/b');

    const [url] = fetchMock.mock.calls[0];
    expect(url.toString()).toContain('/api/memory/domains/domain%20a%2Fb/items');
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
