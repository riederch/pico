import type { DashboardSnapshot, EventListResponse, HealthResponse, PicoEvent, SystemStatus } from './types.js';
import { isPicoEvent, isRecord } from './types.js';

export const DEFAULT_PICO_HOME_URL = 'http://localhost:3100';
const EVENT_PAGE_LIMIT = 500;
const MAX_EVENT_PAGES = 20;

/** @deprecated Use DEFAULT_PICO_HOME_URL. */
export const DEFAULT_CORE_URL = DEFAULT_PICO_HOME_URL;

export function defaultPicoHomeUrl(location: Location): string {
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return location.origin;
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

export async function loadDashboardSnapshot(baseUrl: string): Promise<DashboardSnapshot> {
  const [health, systemStatus, events] = await Promise.all([
    fetchHealth(baseUrl),
    fetchSystemStatus(baseUrl),
    fetchAllEvents(baseUrl),
  ]);

  return {
    health,
    systemStatus,
    events,
  };
}

async function fetchHealth(baseUrl: string): Promise<HealthResponse> {
  return fetchJson(buildEndpointUrl(baseUrl, '/health'), isHealthResponse, 'health');
}

async function fetchSystemStatus(baseUrl: string): Promise<SystemStatus> {
  return fetchJson(buildEndpointUrl(baseUrl, '/api/system/status'), isSystemStatus, 'system status');
}

async function fetchAllEvents(baseUrl: string): Promise<PicoEvent[]> {
  const events: PicoEvent[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_EVENT_PAGES; page += 1) {
    const eventList = await fetchEvents(baseUrl, cursor);
    events.push(...eventList.events);

    if (!eventList.hasMore || eventList.nextCursor === null) {
      return events;
    }

    cursor = eventList.nextCursor;
  }

  return events;
}

async function fetchEvents(baseUrl: string, cursor: string | null): Promise<EventListResponse> {
  const url = buildEndpointUrl(baseUrl, '/api/events');
  url.searchParams.set('limit', String(EVENT_PAGE_LIMIT));

  if (cursor !== null) {
    url.searchParams.set('after', cursor);
  }

  return fetchJson(url, isEventListResponse, 'events');
}

async function fetchJson<T>(url: URL, validate: (value: unknown) => value is T, label: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
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
    && (value.claimState.state === 'unclaimed' || value.claimState.state === 'claimed')
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

function hasProtocol(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value);
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
