import type { ConnectionStatus, DashboardState, EventFilters, PicoEvent, SystemStatus } from './types.js';

export interface DashboardView {
  getBaseUrl(): string;
  setBaseUrl(value: string): void;
  onConnectRequested(handler: () => void): void;
  onRefreshRequested(handler: () => void): void;
  onEventFiltersChanged(handler: (filters: EventFilters) => void): void;
  onEventSelected(handler: (eventId: string) => void): void;
  render(state: DashboardState): void;
}

interface DashboardElements {
  form: HTMLFormElement;
  coreUrlInput: HTMLInputElement;
  connectButton: HTMLButtonElement;
  refreshButton: HTMLButtonElement;
  errorBanner: HTMLElement;
  httpStatus: HTMLElement;
  websocketStatus: HTMLElement;
  websocketRetry: HTMLElement;
  lastUpdate: HTMLElement;
  coreSummary: HTMLElement;
  databaseSummary: HTMLElement;
  eventCount: HTMLElement;
  eventTypeFilter: HTMLSelectElement;
  eventStreamFilter: HTMLInputElement;
  eventDeviceFilter: HTMLInputElement;
  eventsBody: HTMLTableSectionElement;
  eventsEmpty: HTMLElement;
  eventDetail: HTMLElement;
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
  let refreshRequested: (() => void) | null = null;
  let eventFiltersChanged: ((filters: EventFilters) => void) | null = null;
  let eventSelected: ((eventId: string) => void) | null = null;

  const elements: DashboardElements = {
    form: requireElement(document, 'connection-form', HTMLFormElement),
    coreUrlInput: requireElement(document, 'core-url', HTMLInputElement),
    connectButton: requireElement(document, 'connect-button', HTMLButtonElement),
    refreshButton: requireElement(document, 'refresh-button', HTMLButtonElement),
    errorBanner: requireElement(document, 'error-banner', HTMLElement),
    httpStatus: requireElement(document, 'http-status', HTMLElement),
    websocketStatus: requireElement(document, 'ws-status', HTMLElement),
    websocketRetry: requireElement(document, 'ws-retry', HTMLElement),
    lastUpdate: requireElement(document, 'last-update', HTMLElement),
    coreSummary: requireElement(document, 'core-summary', HTMLElement),
    databaseSummary: requireElement(document, 'database-summary', HTMLElement),
    eventCount: requireElement(document, 'event-count', HTMLElement),
    eventTypeFilter: requireElement(document, 'event-type-filter', HTMLSelectElement),
    eventStreamFilter: requireElement(document, 'event-stream-filter', HTMLInputElement),
    eventDeviceFilter: requireElement(document, 'event-device-filter', HTMLInputElement),
    eventsBody: requireElement(document, 'events-body', HTMLTableSectionElement),
    eventsEmpty: requireElement(document, 'events-empty', HTMLElement),
    eventDetail: requireElement(document, 'event-detail', HTMLElement),
    rawStatus: requireElement(document, 'raw-status', HTMLPreElement),
  };

  elements.refreshButton.addEventListener('click', () => {
    refreshRequested?.();
  });

  const notifyFilterChange = (): void => {
    eventFiltersChanged?.({
      type: elements.eventTypeFilter.value,
      stream: elements.eventStreamFilter.value,
      deviceId: elements.eventDeviceFilter.value,
    });
  };

  elements.eventTypeFilter.addEventListener('change', notifyFilterChange);
  elements.eventStreamFilter.addEventListener('input', notifyFilterChange);
  elements.eventDeviceFilter.addEventListener('input', notifyFilterChange);

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
    onRefreshRequested(handler: () => void): void {
      refreshRequested = handler;
    },
    onEventFiltersChanged(handler: (filters: EventFilters) => void): void {
      eventFiltersChanged = handler;
    },
    onEventSelected(handler: (eventId: string) => void): void {
      eventSelected = handler;
    },
    render(state: DashboardState): void {
      renderStatusPill(elements.httpStatus, state.httpStatus, httpLabel(state.httpStatus));
      renderStatusPill(elements.websocketStatus, state.websocketStatus, websocketLabel(state.websocketStatus));
      elements.websocketRetry.textContent = state.websocketRetryAt === null ? 'none' : formatDateTime(state.websocketRetryAt.toISOString());
      elements.lastUpdate.textContent = state.lastUpdatedAt === null ? 'never' : dateTimeFormatter.format(state.lastUpdatedAt);
      elements.connectButton.disabled = state.httpStatus === 'checking' || state.websocketStatus === 'connecting';
      elements.connectButton.textContent = connectButtonLabel(state);
      elements.refreshButton.disabled = state.httpStatus === 'checking';
      elements.refreshButton.textContent = elements.refreshButton.disabled ? 'Refreshing' : 'Refresh';

      elements.errorBanner.hidden = state.errorMessage === null;
      elements.errorBanner.textContent = state.errorMessage ?? '';

      renderCoreSummary(elements.coreSummary, state.systemStatus);
      renderDatabaseSummary(elements.databaseSummary, state.systemStatus);
      renderEventControls(elements, state);
      renderEvents(elements, state, (eventId) => eventSelected?.(eventId));
      renderEventDetail(elements.eventDetail, state.events, state.selectedEventId);
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

function renderEventControls(elements: DashboardElements, state: DashboardState): void {
  renderEventTypeFilter(elements.eventTypeFilter, state.events, state.eventFilters.type);
  elements.eventStreamFilter.value = state.eventFilters.stream;
  elements.eventDeviceFilter.value = state.eventFilters.deviceId;
}

function renderEventTypeFilter(select: HTMLSelectElement, events: PicoEvent[], selectedType: string): void {
  const document = select.ownerDocument;
  const types = new Set<string>(events.map((event) => event.type));

  if (selectedType !== '') {
    types.add(selectedType);
  }

  const options = [
    createOption(document, '', 'All types'),
    ...[...types].sort().map((type) => createOption(document, type, type)),
  ];

  select.replaceChildren(...options);
  select.value = selectedType;
}

function createOption(document: Document, value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function renderEvents(
  elements: DashboardElements,
  state: DashboardState,
  onEventSelected: (eventId: string) => void,
): void {
  const filteredEvents = filterEvents(state.events, state.eventFilters);
  elements.eventCount.textContent = eventCountLabel(filteredEvents.length, state.events.length);
  elements.eventsEmpty.hidden = filteredEvents.length > 0;
  elements.eventsEmpty.textContent = state.events.length === 0 ? 'No events loaded.' : 'No events match the current filters.';

  const rows = [...filteredEvents]
    .sort(compareEventsDescending)
    .map((event) => createEventRow(
      elements.eventsBody.ownerDocument,
      event,
      event.eventId === state.selectedEventId,
      onEventSelected,
    ));

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

function createEventRow(
  document: Document,
  event: PicoEvent,
  isSelected: boolean,
  onEventSelected: (eventId: string) => void,
): HTMLTableRowElement {
  const row = document.createElement('tr');
  row.className = isSelected ? 'event-row is-selected' : 'event-row';
  row.tabIndex = 0;
  row.setAttribute('aria-selected', isSelected ? 'true' : 'false');
  row.addEventListener('click', () => {
    onEventSelected(event.eventId);
  });
  row.addEventListener('keydown', (keyboardEvent) => {
    if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
      keyboardEvent.preventDefault();
      onEventSelected(event.eventId);
    }
  });
  row.replaceChildren(
    createCell(document, event.lamport.toString(), true),
    createCell(document, event.type),
    createCell(document, event.stream, true),
    createCell(document, event.deviceId, true),
    createCell(document, formatDateTime(event.wallTime)),
  );
  return row;
}

function renderEventDetail(container: HTMLElement, events: PicoEvent[], selectedEventId: string | null): void {
  const document = container.ownerDocument;
  const title = document.createElement('h3');
  title.textContent = 'Event detail';

  if (selectedEventId === null) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No event selected.';
    container.replaceChildren(title, empty);
    return;
  }

  const selectedEvent = events.find((event) => event.eventId === selectedEventId);

  if (selectedEvent === undefined) {
    const missing = document.createElement('p');
    missing.className = 'muted';
    missing.textContent = 'The selected event is no longer available.';
    container.replaceChildren(title, missing);
    return;
  }

  const eventId = document.createElement('p');
  eventId.className = 'event-detail-id monospace';
  eventId.textContent = selectedEvent.eventId;

  const json = document.createElement('pre');
  json.className = 'event-detail-json monospace';
  json.textContent = JSON.stringify(selectedEvent, null, 2);

  container.replaceChildren(title, eventId, json);
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

function filterEvents(events: PicoEvent[], filters: EventFilters): PicoEvent[] {
  const streamFilter = filters.stream.trim().toLowerCase();
  const deviceFilter = filters.deviceId.trim().toLowerCase();

  return events.filter((event) => (
    (filters.type === '' || event.type === filters.type)
    && (streamFilter === '' || event.stream.toLowerCase().includes(streamFilter))
    && (deviceFilter === '' || event.deviceId.toLowerCase().includes(deviceFilter))
  ));
}

function eventCountLabel(filteredCount: number, totalCount: number): string {
  const filteredLabel = `${filteredCount} ${filteredCount === 1 ? 'event' : 'events'}`;

  if (filteredCount === totalCount) {
    return filteredLabel;
  }

  return `${filteredLabel} of ${totalCount}`;
}

function httpLabel(status: ConnectionStatus): string {
  switch (status) {
    case 'checking':
      return 'checking';
    case 'connected':
      return 'reachable';
    case 'reconnecting':
      return 'checking';
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
    case 'reconnecting':
      return 'reconnecting';
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

function connectButtonLabel(state: DashboardState): string {
  if (state.websocketStatus === 'connecting') {
    return 'Connecting';
  }

  if (state.httpStatus === 'checking') {
    return 'Checking';
  }

  return 'Connect';
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
