import { picoHomeClaimStates } from '@pico/protocol';
import type { DashboardSnapshot, EventHistoryStatus, EventListResponse, HealthResponse, PicoEvent, SystemStatus } from './types.js';
import { isPicoEvent, isRecord } from './types.js';

export const DEFAULT_PICO_HOME_URL = 'http://localhost:3100';
const EVENT_TAIL_LIMIT = 500;

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
    fetchLatestEvents(baseUrl),
  ]);

  return {
    health,
    systemStatus,
    events: events.events,
    eventHistory: events.history,
  };
}

async function fetchHealth(baseUrl: string): Promise<HealthResponse> {
  return fetchJson(buildEndpointUrl(baseUrl, '/health'), isHealthResponse, 'health');
}

async function fetchSystemStatus(baseUrl: string): Promise<SystemStatus> {
  return fetchJson(buildEndpointUrl(baseUrl, '/api/system/status'), isSystemStatus, 'system status');
}

async function fetchLatestEvents(baseUrl: string): Promise<{ events: PicoEvent[]; history: EventHistoryStatus }> {
  const eventList = await fetchEventTail(baseUrl);

  return {
    events: eventList.events,
    history: {
      loadedCount: eventList.events.length,
      hasMore: eventList.hasMore,
    },
  };
}

async function fetchEventTail(baseUrl: string): Promise<EventListResponse> {
  const url = buildEndpointUrl(baseUrl, '/api/events/tail');
  url.searchParams.set('limit', String(EVENT_TAIL_LIMIT));

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

function hasProtocol(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value);
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
