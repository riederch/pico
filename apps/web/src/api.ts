import { picoHomeClaimStates } from '@pico/protocol';
import type { DashboardSnapshot, EventHistoryStatus, EventListResponse, HealthResponse, PicoEvent, RealtimeTicketResponse, SystemStatus } from './types.js';
import { isPicoEvent, isRecord } from './types.js';

export const DEFAULT_PICO_HOME_URL = 'http://localhost:3100';
const EVENT_TAIL_LIMIT = 500;

export interface FoundationAccessOptions {
  foundationToken?: string;
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

  const token = options.foundationToken?.trim();
  if (token !== undefined && token !== '') {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
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
