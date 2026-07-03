import type { ConnectionStatus, DashboardState, PicoEvent, SystemStatus } from './types.js';

export interface DashboardView {
  getBaseUrl(): string;
  setBaseUrl(value: string): void;
  onConnectRequested(handler: () => void): void;
  render(state: DashboardState): void;
}

interface DashboardElements {
  form: HTMLFormElement;
  coreUrlInput: HTMLInputElement;
  connectButton: HTMLButtonElement;
  errorBanner: HTMLElement;
  httpStatus: HTMLElement;
  websocketStatus: HTMLElement;
  lastUpdate: HTMLElement;
  coreSummary: HTMLElement;
  databaseSummary: HTMLElement;
  eventCount: HTMLElement;
  eventsBody: HTMLTableSectionElement;
  eventsEmpty: HTMLElement;
  rawStatus: HTMLPreElement;
}

interface MetricRow {
  key: string;
  value: string;
  monospace?: boolean;
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

export function createDashboardView(document: Document): DashboardView {
  const elements: DashboardElements = {
    form: requireElement(document, 'connection-form', HTMLFormElement),
    coreUrlInput: requireElement(document, 'core-url', HTMLInputElement),
    connectButton: requireElement(document, 'connect-button', HTMLButtonElement),
    errorBanner: requireElement(document, 'error-banner', HTMLElement),
    httpStatus: requireElement(document, 'http-status', HTMLElement),
    websocketStatus: requireElement(document, 'ws-status', HTMLElement),
    lastUpdate: requireElement(document, 'last-update', HTMLElement),
    coreSummary: requireElement(document, 'core-summary', HTMLElement),
    databaseSummary: requireElement(document, 'database-summary', HTMLElement),
    eventCount: requireElement(document, 'event-count', HTMLElement),
    eventsBody: requireElement(document, 'events-body', HTMLTableSectionElement),
    eventsEmpty: requireElement(document, 'events-empty', HTMLElement),
    rawStatus: requireElement(document, 'raw-status', HTMLPreElement),
  };

  return {
    getBaseUrl(): string {
      return elements.coreUrlInput.value;
    },
    setBaseUrl(value: string): void {
      elements.coreUrlInput.value = value;
    },
    onConnectRequested(handler: () => void): void {
      elements.form.addEventListener('submit', (event) => {
        event.preventDefault();
        handler();
      });
    },
    render(state: DashboardState): void {
      renderStatusPill(elements.httpStatus, state.httpStatus, httpLabel(state.httpStatus));
      renderStatusPill(elements.websocketStatus, state.websocketStatus, websocketLabel(state.websocketStatus));
      elements.lastUpdate.textContent = state.lastUpdatedAt === null ? 'never' : dateTimeFormatter.format(state.lastUpdatedAt);
      elements.connectButton.disabled = state.httpStatus === 'checking' || state.websocketStatus === 'connecting';
      elements.connectButton.textContent = elements.connectButton.disabled ? 'Connecting' : 'Connect';

      elements.errorBanner.hidden = state.errorMessage === null;
      elements.errorBanner.textContent = state.errorMessage ?? '';

      renderCoreSummary(elements.coreSummary, state.systemStatus);
      renderDatabaseSummary(elements.databaseSummary, state.systemStatus);
      renderEvents(elements, state.events);
      elements.rawStatus.textContent = state.systemStatus === null ? '{}' : JSON.stringify(state.systemStatus, null, 2);
    },
  };
}

function renderCoreSummary(container: HTMLElement, status: SystemStatus | null): void {
  if (status === null) {
    renderEmpty(container, 'No status loaded.');
    return;
  }

  renderMetricRows(container, [
    { key: 'Service', value: status.service },
    { key: 'Version', value: status.version, monospace: true },
    { key: 'Protocol Version', value: status.protocolVersion, monospace: true },
    { key: 'Device ID', value: status.deviceId, monospace: true },
  ]);
}

function renderDatabaseSummary(container: HTMLElement, status: SystemStatus | null): void {
  if (status === null) {
    renderEmpty(container, 'No database status loaded.');
    return;
  }

  const migrationRows: MetricRow[] = status.database.migrations.length === 0
    ? [{ key: 'Applied migrations', value: 'none' }]
    : status.database.migrations.map((migration) => ({
      key: migration.id,
      value: formatDateTime(migration.appliedAt),
      monospace: true,
    }));

  renderMetricRows(container, [
    { key: 'maxLamport', value: status.database.maxLamport.toString(), monospace: true },
    ...migrationRows,
  ]);
}

function renderEvents(elements: DashboardElements, events: PicoEvent[]): void {
  elements.eventCount.textContent = `${events.length} ${events.length === 1 ? 'event' : 'events'}`;
  elements.eventsEmpty.hidden = events.length > 0;

  const rows = [...events]
    .sort(compareEventsDescending)
    .map((event) => createEventRow(elements.eventsBody.ownerDocument, event));

  elements.eventsBody.replaceChildren(...rows);
}

function renderMetricRows(container: HTMLElement, rows: MetricRow[]): void {
  const document = container.ownerDocument;
  container.replaceChildren(...rows.map((row) => createMetricRow(document, row)));
}

function createMetricRow(document: Document, row: MetricRow): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'metric-row';

  const key = document.createElement('span');
  key.className = 'metric-key';
  key.textContent = row.key;

  const value = document.createElement('span');
  value.className = row.monospace === true ? 'metric-value monospace' : 'metric-value';
  value.textContent = row.value;

  wrapper.replaceChildren(key, value);
  return wrapper;
}

function createEventRow(document: Document, event: PicoEvent): HTMLTableRowElement {
  const row = document.createElement('tr');
  row.replaceChildren(
    createCell(document, event.lamport.toString(), true),
    createCell(document, event.type),
    createCell(document, event.stream, true),
    createCell(document, event.deviceId, true),
    createCell(document, formatDateTime(event.wallTime)),
  );
  return row;
}

function createCell(document: Document, value: string, monospace = false): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.className = monospace ? 'monospace' : '';
  cell.textContent = value;
  return cell;
}

function renderStatusPill(element: HTMLElement, status: ConnectionStatus, label: string): void {
  const document = element.ownerDocument;
  const dot = document.createElement('span');
  dot.className = 'status-dot';

  const text = document.createElement('span');
  text.textContent = label;

  element.dataset.status = status;
  element.replaceChildren(dot, text);
}

function renderEmpty(container: HTMLElement, message: string): void {
  const paragraph = container.ownerDocument.createElement('p');
  paragraph.className = 'muted';
  paragraph.textContent = message;
  container.replaceChildren(paragraph);
}

function httpLabel(status: ConnectionStatus): string {
  switch (status) {
    case 'checking':
      return 'checking';
    case 'connected':
      return 'reachable';
    case 'error':
      return 'unreachable';
    case 'connecting':
      return 'checking';
    case 'disconnected':
      return 'unreachable';
    case 'idle':
      return 'not checked';
  }
}

function websocketLabel(status: ConnectionStatus): string {
  switch (status) {
    case 'connecting':
      return 'connecting';
    case 'connected':
      return 'connected';
    case 'error':
      return 'error';
    case 'checking':
      return 'connecting';
    case 'disconnected':
      return 'disconnected';
    case 'idle':
      return 'disconnected';
  }
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : dateTimeFormatter.format(new Date(timestamp));
}

function compareEventsDescending(left: PicoEvent, right: PicoEvent): number {
  return (
    right.lamport - left.lamport
    || right.wallTime.localeCompare(left.wallTime)
    || right.eventId.localeCompare(left.eventId)
  );
}

function requireElement<T extends HTMLElement>(
  document: Document,
  id: string,
  constructor: new () => T,
): T {
  const element = document.getElementById(id);

  if (!(element instanceof constructor)) {
    throw new Error(`Missing required element #${id}.`);
  }

  return element;
}
