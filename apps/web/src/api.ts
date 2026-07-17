import { memoryRetentionModes, picoHomeClaimStates } from '@pico/protocol';
import type {
  DashboardSnapshot,
  EventHistoryStatus,
  EventListResponse,
  HealthResponse,
  PicoEvent,
  RealtimeTicketResponse,
  RetentionPolicy,
  RetentionPolicyInput,
  RetentionPolicyListResponse,
  SystemStatus,
} from './types.js';
import { isPicoEvent, isRecord } from './types.js';

export const DEFAULT_PICO_HOME_URL = 'http://localhost:3100';
const EVENT_TAIL_LIMIT = 500;

/**
 * The bearer credential the dashboard sends. An operator session (ADR 0076)
 * takes precedence over the temporary static token (ADR 0038); both travel in
 * the `Authorization` header, never in a cookie, so the browser attaches no
 * ambient authority and there is no CSRF surface to defend.
 *
 * The session lives in memory for the page's lifetime only: not in local
 * storage, session storage, IndexedDB, cookies or the URL (ADR 0039 rule, kept
 * by ADR 0076). A reload therefore requires a new login.
 */
export interface FoundationAccessOptions {
  foundationToken?: string;
  operatorSession?: string;
}

interface BrowserLocation {
  href: string;
  origin: string;
  protocol: string;
}

/** @deprecated Use DEFAULT_PICO_HOME_URL. */
export const DEFAULT_CORE_URL = DEFAULT_PICO_HOME_URL;

export function defaultPicoHomeUrl(location: BrowserLocation): string {
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    const basePath = defaultBasePath(location);
    return `${location.origin}${basePath}`;
  }

  return DEFAULT_PICO_HOME_URL;
}

/** @deprecated Use defaultPicoHomeUrl. */
export const defaultCoreUrl = defaultPicoHomeUrl;

export function normalizePicoHomeUrl(rawValue: string): string {
  const trimmedValue = rawValue.trim() || DEFAULT_PICO_HOME_URL;
  const candidate = hasProtocol(trimmedValue) ? trimmedValue : `http://${trimmedValue}`;
  const url = new URL(candidate);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Pico Home URL must use http or https.');
  }

  const pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${pathname === '/' ? '' : pathname}`;
}

/** @deprecated Use normalizePicoHomeUrl. */
export const normalizeCoreUrl = normalizePicoHomeUrl;

export function buildEndpointUrl(baseUrl: string, endpoint: string): URL {
  const url = new URL(baseUrl);
  const basePath = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath}${endpoint}`;
  url.search = '';
  url.hash = '';
  return url;
}

export async function loadDashboardSnapshot(baseUrl: string, options: FoundationAccessOptions = {}): Promise<DashboardSnapshot> {
  const [health, systemStatus, events] = await Promise.all([
    fetchHealth(baseUrl),
    fetchSystemStatus(baseUrl, options),
    fetchLatestEvents(baseUrl, options),
  ]);

  return {
    health,
    systemStatus,
    events: events.events,
    eventHistory: events.history,
  };
}

/**
 * Exchanges the operator passphrase for a session. The passphrase is used once,
 * here, and never stored; only the returned session is kept, in memory.
 */
export async function loginOperator(baseUrl: string, passphrase: string): Promise<string> {
  const url = buildEndpointUrl(baseUrl, '/api/auth/session');
  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase }),
    });
  } catch (error) {
    throw new Error(`Could not reach the operator login endpoint at ${url.toString()}: ${formatUnknownError(error)}`);
  }

  if (response.status === 401) {
    throw new Error('Operator passphrase is invalid.');
  }

  if (!response.ok) {
    throw new Error(`Operator login returned HTTP ${response.status}.`);
  }

  const data = (await response.json()) as unknown;

  if (!isRecord(data) || typeof data.session !== 'string' || data.session === '') {
    throw new Error('Operator login did not return a session.');
  }

  return data.session;
}

export async function listRetentionPolicies(baseUrl: string, options: FoundationAccessOptions): Promise<RetentionPolicy[]> {
  const response = await fetchJson(
    buildEndpointUrl(baseUrl, '/api/memory/retention-policies'),
    isRetentionPolicyListResponse,
    'retention policies',
    options,
  );

  return response.retentionPolicies;
}

export async function createRetentionPolicy(
  baseUrl: string,
  options: FoundationAccessOptions,
  input: RetentionPolicyInput,
): Promise<RetentionPolicy> {
  return sendJson(buildEndpointUrl(baseUrl, '/api/memory/retention-policies'), 'POST', input, options, isRetentionPolicy, 'retention policy');
}

export async function updateRetentionPolicy(
  baseUrl: string,
  options: FoundationAccessOptions,
  retentionPolicyId: string,
  input: Omit<RetentionPolicyInput, 'retentionPolicyId'>,
): Promise<RetentionPolicy> {
  return sendJson(
    buildEndpointUrl(baseUrl, `/api/memory/retention-policies/${encodeURIComponent(retentionPolicyId)}`),
    'PUT',
    input,
    options,
    isRetentionPolicy,
    'retention policy',
  );
}

export async function deleteRetentionPolicy(
  baseUrl: string,
  options: FoundationAccessOptions,
  retentionPolicyId: string,
): Promise<void> {
  const url = buildEndpointUrl(baseUrl, `/api/memory/retention-policies/${encodeURIComponent(retentionPolicyId)}`);
  const response = await fetch(url, { method: 'DELETE', headers: buildFoundationHeaders(options) });

  if (!response.ok) {
    throw new Error(await describeFailure(response, 'Revoking the retention policy'));
  }
}

/**
 * Destroys a privacy domain's keys. Irreversible: the content becomes
 * unreadable, including in existing backups (ADR 0071).
 *
 * `confirm` must repeat the domain exactly. It is passed in by the caller and
 * never derived from `privacyDomain` here — deriving it would defeat the point
 * of confirming.
 */
export async function shredPrivacyDomain(
  baseUrl: string,
  options: FoundationAccessOptions,
  input: { privacyDomain: string; confirm: string; reason?: string },
): Promise<{ removedKeyVersions: number }> {
  const url = buildEndpointUrl(baseUrl, `/api/memory/domains/${encodeURIComponent(input.privacyDomain)}/shred`);
  const body: Record<string, unknown> = { confirm: input.confirm };

  if (input.reason !== undefined && input.reason.trim() !== '') {
    body.reason = input.reason.trim();
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { ...buildFoundationHeaders(options), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await describeFailure(response, 'Shredding the privacy domain'));
  }

  const data = (await response.json()) as unknown;

  if (!isRecord(data) || typeof data.removedKeyVersions !== 'number') {
    throw new Error('Shred response did not report how many key versions were destroyed.');
  }

  return { removedKeyVersions: data.removedKeyVersions };
}

async function sendJson<T>(
  url: URL,
  method: 'POST' | 'PUT',
  body: unknown,
  options: FoundationAccessOptions,
  validate: (value: unknown) => value is T,
  label: string,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: { ...buildFoundationHeaders(options), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`Could not reach the ${label} endpoint at ${url.toString()}: ${formatUnknownError(error)}`);
  }

  if (!response.ok) {
    throw new Error(await describeFailure(response, `Saving the ${label}`));
  }

  const data = (await response.json()) as unknown;

  if (!validate(data)) {
    throw new Error(`${label} endpoint returned an unexpected shape.`);
  }

  return data;
}

/** Surfaces the server's own reason where it sent one; the API answers in plain sentences. */
async function describeFailure(response: Response, action: string): Promise<string> {
  let detail: string | undefined;

  try {
    const data = (await response.json()) as unknown;
    if (isRecord(data) && typeof data.error === 'string') {
      detail = data.error;
    }
  } catch {
    detail = undefined;
  }

  if (response.status === 401) {
    return detail ?? 'An operator session is required.';
  }

  return detail ?? `${action} failed with HTTP ${response.status}.`;
}

export async function mintRealtimeTicket(baseUrl: string, options: FoundationAccessOptions): Promise<string> {
  const response = await fetchJson(
    buildEndpointUrl(baseUrl, '/api/realtime/tickets'),
    isRealtimeTicketResponse,
    'realtime ticket',
    options,
    { method: 'POST' },
  );

  return response.ticket;
}

async function fetchHealth(baseUrl: string): Promise<HealthResponse> {
  return fetchJson(buildEndpointUrl(baseUrl, '/health'), isHealthResponse, 'health');
}

async function fetchSystemStatus(baseUrl: string, options: FoundationAccessOptions): Promise<SystemStatus> {
  return fetchJson(buildEndpointUrl(baseUrl, '/api/system/status'), isSystemStatus, 'system status', options);
}

async function fetchLatestEvents(baseUrl: string, options: FoundationAccessOptions): Promise<{ events: PicoEvent[]; history: EventHistoryStatus }> {
  const eventList = await fetchEventTail(baseUrl, options);

  return {
    events: eventList.events,
    history: {
      loadedCount: eventList.events.length,
      hasMore: eventList.hasMore,
    },
  };
}

async function fetchEventTail(baseUrl: string, options: FoundationAccessOptions): Promise<EventListResponse> {
  const url = buildEndpointUrl(baseUrl, '/api/events/tail');
  url.searchParams.set('limit', String(EVENT_TAIL_LIMIT));

  return fetchJson(url, isEventListResponse, 'events', options);
}

async function fetchJson<T>(
  url: URL,
  validate: (value: unknown) => value is T,
  label: string,
  options: FoundationAccessOptions = {},
  init: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: buildFoundationHeaders(options),
    });
  } catch (error) {
    throw new Error(`Could not reach ${label} endpoint at ${url.toString()}: ${formatUnknownError(error)}`);
  }

  if (!response.ok) {
    throw new Error(`${label} endpoint returned HTTP ${response.status}.`);
  }

  let data: unknown;

  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`${label} endpoint did not return valid JSON: ${formatUnknownError(error)}`);
  }

  if (!validate(data)) {
    throw new Error(`${label} endpoint returned an unexpected JSON shape.`);
  }

  return data;
}

function buildFoundationHeaders(options: FoundationAccessOptions): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const credential = readBearerCredential(options);
  if (credential !== undefined) {
    headers.Authorization = `Bearer ${credential}`;
  }

  return headers;
}

function readBearerCredential(options: FoundationAccessOptions): string | undefined {
  const session = options.operatorSession?.trim();
  if (session !== undefined && session !== '') {
    return session;
  }

  const token = options.foundationToken?.trim();
  if (token !== undefined && token !== '') {
    return token;
  }

  return undefined;
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    isRecord(value)
    && typeof value.ok === 'boolean'
    && typeof value.service === 'string'
    && typeof value.deviceId === 'string'
  );
}

function isSystemStatus(value: unknown): value is SystemStatus {
  return (
    isRecord(value)
    && typeof value.service === 'string'
    && typeof value.version === 'string'
    && typeof value.protocolVersion === 'string'
    && typeof value.deviceId === 'string'
    && isCapabilityMap(value.capabilities)
    && isPicoHomeStatus(value.picoHome)
    && isRecord(value.database)
    && typeof value.database.maxLamport === 'number'
    && Number.isInteger(value.database.maxLamport)
    && Array.isArray(value.database.migrations)
    && value.database.migrations.every(isAppliedMigration)
  );
}

function isCapabilityMap(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every((enabled) => typeof enabled === 'boolean');
}

function isPicoHomeStatus(value: unknown): value is SystemStatus['picoHome'] {
  return (
    isRecord(value)
    && isRecord(value.claimState)
    && typeof value.claimState.state === 'string'
    && picoHomeClaimStates.includes(value.claimState.state as SystemStatus['picoHome']['claimState']['state'])
  );
}

function isAppliedMigration(value: unknown): value is SystemStatus['database']['migrations'][number] {
  return isRecord(value) && typeof value.id === 'string' && typeof value.appliedAt === 'string';
}

function isEventListResponse(value: unknown): value is EventListResponse {
  return (
    isRecord(value)
    && Array.isArray(value.events)
    && value.events.every(isPicoEvent)
    && (value.nextCursor === null || typeof value.nextCursor === 'string')
    && typeof value.hasMore === 'boolean'
  );
}

function isRetentionPolicy(value: unknown): value is RetentionPolicy {
  return (
    isRecord(value)
    && typeof value.retentionPolicyId === 'string'
    && typeof value.displayName === 'string'
    && typeof value.mode === 'string'
    && (memoryRetentionModes as readonly string[]).includes(value.mode)
    && (value.maxAgeDays === undefined || typeof value.maxAgeDays === 'number')
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
  );
}

function isRetentionPolicyListResponse(value: unknown): value is RetentionPolicyListResponse {
  return (
    isRecord(value)
    && Array.isArray(value.retentionPolicies)
    && value.retentionPolicies.every(isRetentionPolicy)
  );
}

function isRealtimeTicketResponse(value: unknown): value is RealtimeTicketResponse {
  return (
    isRecord(value)
    && typeof value.ticket === 'string'
    && value.ticket !== ''
    && typeof value.expiresAt === 'string'
  );
}

function hasProtocol(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value);
}

function defaultBasePath(location: BrowserLocation): string {
  const currentUrl = new URL(location.href);
  let pathname = currentUrl.pathname;

  if (pathname === '/' || pathname === '') {
    return '';
  }

  if (!pathname.endsWith('/')) {
    const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);

    if (lastSegment.includes('.')) {
      pathname = pathname.slice(0, pathname.lastIndexOf('/'));
    }
  }

  const trimmedPathname = pathname.replace(/\/+$/, '');
  return trimmedPathname === '' ? '' : trimmedPathname;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
