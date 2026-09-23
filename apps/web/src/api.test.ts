import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PICO_HOME_URL,
  PicoModuleHasDependentsError,
  PicoOperatorPassphraseInvalidError,
  changeOperatorPassphrase,
  revokeAllSessions,
  setModuleActivation,
  setModuleCapture,
  PicoRelayIdentityInUseError,
  decideRelayIdentity,
  readRelayIdentity,
  buildEndpointUrl,
  createRetentionPolicy,
  defaultPicoHomeUrl,
  listDomainContent,
  listRetentionPolicies,
  loginOperator,
  mintRealtimeTicket,
  normalizePicoHomeUrl,
  picoDashboardRefusalSentences,
  shredPrivacyDomain,
} from './api.js';

/**
 * Befund B162. Ein Fehlschlag des Transports muss ein **Satz** sein und kein
 * Symptom (ADR 0131 A7). Bis zum 2026-09-13 schrieben ihn drei Stellen selbst -
 * und bei einer fehlte schon der Artikel -, waehrend zehn weitere Aufrufe gar
 * keinen hatten: dort drang `fetch failed` nach aussen, also das, was die
 * Plattform gerade sagt.
 *
 * Geprueft wird ueber drei verschiedene Wege, weil die Faltung genau das
 * behauptet: dass es fuer alle derselbe Satz ist.
 */
describe('ein Fehlschlag des Transports bekommt einen Satz (B162)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('nennt jede Flaeche beim Namen, statt die Plattform durchzureichen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed');
    }));

    await expect(loginOperator('http://localhost:3100', 'irgendetwas'))
      .rejects.toThrow('Could not reach the operator login endpoint at');
    await expect(shredPrivacyDomain('http://localhost:3100', {}, { privacyDomain: 'haushalt', confirm: 'haushalt' }))
      .rejects.toThrow('Could not reach the privacy domain shred endpoint at');
    await expect(listRetentionPolicies('http://localhost:3100', {}))
      .rejects.toThrow('Could not reach the retention policies endpoint at');
  });

  it('haengt den Grund der Plattform an, statt ihn zu verschlucken', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed');
    }));
    // Die Diagnose bleibt moeglich: der Satz sagt, was nicht erreichbar war,
    // und das Symptom steht dahinter.
    await expect(loginOperator('http://localhost:3100', 'irgendetwas'))
      .rejects.toThrow('fetch failed');
  });
});

describe('foundation URL helpers', () => {
  it('defaults to the same origin for a direct root dashboard', () => {
    expect(defaultPicoHomeUrl(browserLocation('http://localhost:3100/'))).toBe('http://localhost:3100');
  });

  it('preserves a Home Assistant ingress path prefix from the dashboard location', () => {
    expect(defaultPicoHomeUrl(browserLocation('https://ha.local/api/hassio_ingress/pico_home/')))
      .toBe('https://ha.local/api/hassio_ingress/pico_home');
  });

  it('preserves a non-file path prefix when the dashboard URL has no trailing slash', () => {
    expect(defaultPicoHomeUrl(browserLocation('https://ha.local/api/hassio_ingress/pico_home')))
      .toBe('https://ha.local/api/hassio_ingress/pico_home');
  });

  it('uses the parent path when the dashboard URL points to an html file', () => {
    expect(defaultPicoHomeUrl(browserLocation('https://ha.local/api/hassio_ingress/pico_home/index.html?cache=1#top')))
      .toBe('https://ha.local/api/hassio_ingress/pico_home');
  });

  it('falls back to the local development URL outside http(s)', () => {
    expect(defaultPicoHomeUrl(browserLocation('file:///tmp/pico/index.html'))).toBe(DEFAULT_PICO_HOME_URL);
  });

  it('normalizes manually entered base URLs with path prefixes', () => {
    expect(normalizePicoHomeUrl('https://ha.local/api/hassio_ingress/pico_home/'))
      .toBe('https://ha.local/api/hassio_ingress/pico_home');
  });

  it('builds endpoint URLs below the configured base path', () => {
    expect(buildEndpointUrl('https://ha.local/api/hassio_ingress/pico_home', '/api/system/status').toString())
      .toBe('https://ha.local/api/hassio_ingress/pico_home/api/system/status');
  });

  it('clears base URL query strings and fragments when building endpoints', () => {
    expect(buildEndpointUrl('https://ha.local/api/hassio_ingress/pico_home?old=1#section', '/health').toString())
      .toBe('https://ha.local/api/hassio_ingress/pico_home/health');
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

describe('ADR 0076 - replacing the operator credential', () => {
  it('sends both passphrases, because a session alone is not enough', async () => {
    // A stolen session must not be able to lock the real operator out, so
    // possession and knowledge are two claims and this needs both.
    const fetchMock = vi.fn(async () => jsonResponse(200, { revokedSessions: 2 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await changeOperatorPassphrase('http://localhost:3100', {}, {
      currentPassphrase: 'the old one',
      passphrase: 'the new one',
    })).toEqual({ revokedSessions: 2 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('http://localhost:3100/api/auth/credential');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({
      currentPassphrase: 'the old one',
      passphrase: 'the new one',
    });
  });

  it('tells a wrong current passphrase apart from a refused new one', async () => {
    // Only one of the two is worth retrying, and a single message would leave
    // a person changing the wrong field.
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: 'invalid' })));
    await expect(changeOperatorPassphrase('http://localhost:3100', {}, {
      currentPassphrase: 'wrong',
      passphrase: 'a new passphrase',
    })).rejects.toThrow(PicoOperatorPassphraseInvalidError);

    // The shape rule is the Home's and its sentence travels rather than being
    // restated here, where it would be a second place to change.
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(400, { error: 'Operator passphrase must be at least 12 characters.' })));
    await expect(changeOperatorPassphrase('http://localhost:3100', {}, {
      currentPassphrase: 'the old one',
      passphrase: 'short',
    })).rejects.toThrow(/at least 12 characters/u);
  });

  it('refuses a reply that does not say how many sessions it ended', async () => {
    // The count is what the surface tells the person; inventing one would be
    // reporting an outcome nobody observed.
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    await expect(revokeAllSessions('http://localhost:3100', {}))
      .rejects.toThrow(/did not report how many sessions/u);
  });

  it('ends every session over the session route', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { revokedSessions: 4 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await revokeAllSessions('http://localhost:3100', {})).toEqual({ revokedSessions: 4 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('http://localhost:3100/api/auth/sessions');
    expect(init.method).toBe('DELETE');
  });
});

describe('ADR 0127 M3 - switching a module', () => {
  it('carries a refusal that names who is holding it on', async () => {
    // "Refused" alone would leave a person guessing which of several others
    // depends on the one they tried to switch off.
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(409, {
        error: 'pico_module_has_active_dependents',
        dependents: ['calendar', 'spatial-recall'],
      })));

    await expect(setModuleActivation('http://localhost:3100', {}, {
      identifier: 'depot',
      active: false,
    })).rejects.toThrow(PicoModuleHasDependentsError);
  });

  it('reads an absent dropped list as nothing outstanding', async () => {
    // ADR 0127 M4. Absent is a fact - nothing was promised - and turning it
    // into a failure would make an ordinary switch-off look like one.
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(200, { modules: { modules: [] } })));

    expect(await setModuleActivation('http://localhost:3100', {}, {
      identifier: 'depot',
      active: true,
    })).toEqual({ modules: [], dropped: [] });
  });

  it('sends the capture decision to its own endpoint', async () => {
    // ADR 0129 SR6: a second decision, not the same one, so a second call.
    const fetchMock = vi.fn(async () => jsonResponse(200, { modules: { modules: [] } }));
    vi.stubGlobal('fetch', fetchMock);

    await setModuleCapture('http://localhost:3100', {}, {
      identifier: 'spatial-recall',
      capturing: false,
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('http://localhost:3100/api/home/modules/capture');
    expect(JSON.parse(String(init.body))).toEqual({
      identifier: 'spatial-recall',
      capturing: false,
    });
  });
});

describe('ADR 0148 - a refused relay account change', () => {
  it('carries the count out as itself rather than as a failure', async () => {
    // "Something went wrong" would leave somebody to discover that the change
    // would have stranded every relationship they have.
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(409, { error: 'mailboxes_exist', mailboxes: 4 })));

    await expect(decideRelayIdentity('http://localhost:3100', {}, {
      operator: 'other.example.org',
      accountId: 'acct_second',
    })).rejects.toThrow(PicoRelayIdentityInUseError);

    try {
      await decideRelayIdentity('http://localhost:3100', {}, {
        operator: 'other.example.org',
        accountId: 'acct_second',
      });
    } catch (error) {
      expect((error as PicoRelayIdentityInUseError).mailboxes).toBe(4);
    }
  });

  it('reads an absent account as an absence rather than an unexpected shape', async () => {
    // A Home with no relay answers the count and nothing else, and the reader
    // must not treat that as a broken endpoint.
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { mailboxes: 0 })));

    await expect(readRelayIdentity('http://localhost:3100', {}))
      .resolves.toEqual({ mailboxes: 0 });
  });
});

/**
 * Entscheidung 12 vom 2026-09-22: das Dashboard bekommt dieselbe volle
 * Satztabelle wie die Schale. Vorher reichte es den Namen einer Ablehnung
 * unveraendert nach aussen - `invalid_authority_submit_arguments` stand in der
 * Meldung, und wer sie las, wusste nicht, ob er etwas falsch getippt hatte.
 *
 * Begangen wird beides: dass ein benannter Grund seinen Satz bekommt und der
 * Name trotzdem meldbar bleibt, und dass die drei Wege ohne Eintrag
 * (unbekannter Name, fertiger Satz, gar kein Grund) ebenfalls bei einem Satz
 * enden. `one-voice:check` haelt die Tabelle zusaetzlich gegen die der Schale.
 */
describe('Entscheidung 12 - jede Ablehnung erreicht das Dashboard als Satz', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sagt bei einem benannten Grund den Satz und laesst den Namen stehen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(400, { error: 'invalid_authority_submit_arguments' })));

    await expect(createRetentionPolicy('http://localhost:3100', {}, {
      retentionPolicyId: 'household',
      displayName: 'Household',
      mode: 'delete_after_max_age',
      maxAgeDays: 30,
    })).rejects.toThrow(
      'Pico could not read that request. That is a defect in Pico and not something '
      + 'you did; nothing was changed. (invalid_authority_submit_arguments)',
    );
  });

  it('faellt bei einem unbekannten Namen auf einen Satz zurueck, nicht auf den Namen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(409, { error: 'some_refusal_nobody_has_written_yet' })));

    await expect(shredPrivacyDomain('http://localhost:3100', {}, {
      privacyDomain: 'household',
      confirm: 'household',
    })).rejects.toThrow(
      'Pico refused what this page sent (some_refusal_nobody_has_written_yet). '
      + 'That is a defect in Pico and not something you did; nothing was changed.',
    );
  });

  it('laesst einen Grund, der schon ein Satz ist, unveraendert', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(400, { error: 'This Home does not keep that domain.' })));

    await expect(shredPrivacyDomain('http://localhost:3100', {}, {
      privacyDomain: 'household',
      confirm: 'household',
    })).rejects.toThrow('This Home does not keep that domain.');
  });

  it('gibt auch der abgelaufenen Sitzung ihren Satz', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(401, { error: 'no_founding_record' })));

    await expect(listRetentionPolicies('http://localhost:3100', {}))
      .rejects.toThrow(
        'This Home has not been founded yet, so there is nothing to administer '
        + 'here. (no_founding_record)',
      );
  });

  it('haelt jeden Eintrag der Tabelle auf der Form eines Satzes', () => {
    // Ein Fragment mit einem Namen daneben waere wieder das, was vorher stand.
    for (const [name, sentence] of Object.entries(picoDashboardRefusalSentences)) {
      expect(sentence, name).toMatch(/^[A-Z][^]*[.]$/u);
      expect(sentence, name).not.toContain(name);
    }

    expect(Object.keys(picoDashboardRefusalSentences).length).toBeGreaterThan(0);
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
