import type { DashboardSnapshot, EventListResponse, HealthResponse, SystemStatus } from './types.js';
import { isPicoEvent, isRecord } from './types.js';

export const DEFAULT_CORE_URL = 'http://localhost:3100';

export function normalizeCoreUrl(rawValue: string): string {
  const trimmedValue = rawValue.trim() || DEFAULT_CORE_URL;
  const candidate = hasProtocol(trimmedValue) ? trimmedValue : `http://${trimmedValue}`;
  const url = new URL(candidate);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Core URL must use http or https.');
  }

  const pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${pathname === '/' ? '' : pathname}`;
}

export function buildEndpointUrl(baseUrl: string, endpoint: string): URL {
  const url = new URL(baseUrl);
  const basePath = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath}${endpoint}`;
  url.search = '';
  url.hash = '';
  return url;
}

export async function loadDashboardSnapshot(baseUrl: string): Promise<DashboardSnapshot> {
  const [health, systemStatus, eventList] = await Promise.all([
    fetchHealth(baseUrl),
    fetchSystemStatus(baseUrl),
    fetchEvents(baseUrl),
  ]);

  return {
    health,
    systemStatus,
    events: eventList.events,
  };
}

async function fetchHealth(baseUrl: string): Promise<HealthResponse> {
  return fetchJson(buildEndpointUrl(baseUrl, '/health'), isHealthResponse, 'health');
}

async function fetchSystemStatus(baseUrl: string): Promise<SystemStatus> {
  return fetchJson(buildEndpointUrl(baseUrl, '/api/system/status'), isSystemStatus, 'system status');
}

async function fetchEvents(baseUrl: string): Promise<EventListResponse> {
  return fetchJson(buildEndpointUrl(baseUrl, '/api/events'), isEventListResponse, 'events');
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
    && isRecord(value.database)
    && typeof value.database.maxLamport === 'number'
    && Number.isInteger(value.database.maxLamport)
    && Array.isArray(value.database.migrations)
    && value.database.migrations.every(isAppliedMigration)
  );
}

function isAppliedMigration(value: unknown): value is SystemStatus['database']['migrations'][number] {
  return isRecord(value) && typeof value.id === 'string' && typeof value.appliedAt === 'string';
}

function isEventListResponse(value: unknown): value is EventListResponse {
  return isRecord(value) && Array.isArray(value.events) && value.events.every(isPicoEvent);
}

function hasProtocol(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value);
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
