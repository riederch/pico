import { memoryRetentionModes } from '@pico/protocol';
import type { ConnectionStatus, DashboardState, EventFilters, PicoEvent, RetentionMode, RetentionPolicy, SystemStatus } from './types.js';

export interface DashboardView {
  getBaseUrl(): string;
  setBaseUrl(value: string): void;
  getFoundationToken(): string;
  /** Reads and clears the passphrase field: it is used once and never kept. */
  takeOperatorPassphrase(): string;
  setOperatorStatus(message: string, state?: 'idle' | 'active' | 'error'): void;
  onOperatorLoginRequested(handler: () => void): void;
  /** Shows the administration section. It is useless without an operator session. */
  setAdminVisible(visible: boolean): void;
  renderRetentionPolicies(policies: RetentionPolicy[]): void;
  readRetentionPolicyForm(): RetentionPolicyFormValue;
  fillRetentionPolicyForm(policy: RetentionPolicy | null): void;
  setRetentionPolicyStatus(message: string, state?: 'idle' | 'active' | 'error'): void;
  onRetentionPolicySubmitted(handler: () => void): void;
  onRetentionPolicyEditRequested(handler: (retentionPolicyId: string) => void): void;
  onRetentionPolicyRevokeRequested(handler: (retentionPolicyId: string) => void): void;
  onRetentionPolicyEditCancelled(handler: () => void): void;
  readShredForm(): ShredFormValue;
  clearShredForm(): void;
  setShredStatus(message: string, state?: 'idle' | 'active' | 'error'): void;
  onShredRequested(handler: () => void): void;
  onConnectRequested(handler: () => void): void;
  onRefreshRequested(handler: () => void): void;
  onEventFiltersChanged(handler: (filters: EventFilters) => void): void;
  onEventSelected(handler: (eventId: string) => void): void;
  render(state: DashboardState): void;
}

interface DashboardElements {
  form: HTMLFormElement;
  coreUrlInput: HTMLInputElement;
  foundationTokenInput: HTMLInputElement;
  operatorPassphraseInput: HTMLInputElement;
  operatorLoginButton: HTMLButtonElement;
  operatorStatus: HTMLElement;
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
  eventsNotice: HTMLElement;
  eventsBody: HTMLTableSectionElement;
  eventsEmpty: HTMLElement;
  eventDetail: HTMLElement;
  rawStatus: HTMLPreElement;
  adminSection: HTMLElement;
  retentionPolicyForm: HTMLFormElement;
  retentionPolicyIdInput: HTMLInputElement;
  retentionPolicyNameInput: HTMLInputElement;
  retentionPolicyModeSelect: HTMLSelectElement;
  retentionPolicyMaxAgeInput: HTMLInputElement;
  retentionPolicySubmitButton: HTMLButtonElement;
  retentionPolicyCancelButton: HTMLButtonElement;
  retentionPolicyStatus: HTMLElement;
  retentionPolicyCount: HTMLElement;
  retentionPoliciesBody: HTMLTableSectionElement;
  retentionPoliciesEmpty: HTMLElement;
  shredForm: HTMLFormElement;
  shredDomainInput: HTMLInputElement;
  shredConfirmInput: HTMLInputElement;
  shredReasonInput: HTMLInputElement;
  shredStatus: HTMLElement;
}

export interface RetentionPolicyFormValue {
  retentionPolicyId: string;
  displayName: string;
  mode: RetentionMode;
  maxAgeDays: number | null;
}

export interface ShredFormValue {
  privacyDomain: string;
  confirm: string;
  reason: string;
}

interface MetricRow {
  key: string;
  value: string;
  monospace?: boolean;
}

interface EventTableColumn {
  label: string;
  value(event: PicoEvent): string;
  monospace?: boolean;
}

const eventTableColumns: EventTableColumn[] = [
  { label: 'Lamport', value: (event) => event.lamport.toString(), monospace: true },
  { label: 'Time', value: (event) => formatDateTime(event.wallTime) },
  { label: 'Type', value: (event) => event.type },
  { label: 'Stream', value: (event) => event.stream, monospace: true },
  { label: 'Device', value: (event) => event.deviceId, monospace: true },
];

export const eventTableColumnLabels = eventTableColumns.map((column) => column.label);

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

export function createDashboardView(document: Document): DashboardView {
  let refreshRequested: (() => void) | null = null;
  let eventFiltersChanged: ((filters: EventFilters) => void) | null = null;
  let eventSelected: ((eventId: string) => void) | null = null;
  let retentionPolicyEditRequested: ((retentionPolicyId: string) => void) | null = null;
  let retentionPolicyRevokeRequested: ((retentionPolicyId: string) => void) | null = null;

  const elements: DashboardElements = {
    form: requireElement(document, 'connection-form', HTMLFormElement),
    coreUrlInput: requireElement(document, 'core-url', HTMLInputElement),
    foundationTokenInput: requireElement(document, 'foundation-token', HTMLInputElement),
    operatorPassphraseInput: requireElement(document, 'operator-passphrase', HTMLInputElement),
    operatorLoginButton: requireElement(document, 'operator-login-button', HTMLButtonElement),
    operatorStatus: requireElement(document, 'operator-status', HTMLElement),
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
    eventsNotice: requireElement(document, 'events-notice', HTMLElement),
    eventsBody: requireElement(document, 'events-body', HTMLTableSectionElement),
    eventsEmpty: requireElement(document, 'events-empty', HTMLElement),
    eventDetail: requireElement(document, 'event-detail', HTMLElement),
    rawStatus: requireElement(document, 'raw-status', HTMLPreElement),
    adminSection: requireElement(document, 'admin-section', HTMLElement),
    retentionPolicyForm: requireElement(document, 'retention-policy-form', HTMLFormElement),
    retentionPolicyIdInput: requireElement(document, 'policy-id', HTMLInputElement),
    retentionPolicyNameInput: requireElement(document, 'policy-name', HTMLInputElement),
    retentionPolicyModeSelect: requireElement(document, 'policy-mode', HTMLSelectElement),
    retentionPolicyMaxAgeInput: requireElement(document, 'policy-max-age', HTMLInputElement),
    retentionPolicySubmitButton: requireElement(document, 'policy-submit-button', HTMLButtonElement),
    retentionPolicyCancelButton: requireElement(document, 'policy-cancel-button', HTMLButtonElement),
    retentionPolicyStatus: requireElement(document, 'retention-policy-status', HTMLElement),
    retentionPolicyCount: requireElement(document, 'retention-policy-count', HTMLElement),
    retentionPoliciesBody: requireElement(document, 'retention-policies-body', HTMLTableSectionElement),
    retentionPoliciesEmpty: requireElement(document, 'retention-policies-empty', HTMLElement),
    shredForm: requireElement(document, 'shred-form', HTMLFormElement),
    shredDomainInput: requireElement(document, 'shred-domain', HTMLInputElement),
    shredConfirmInput: requireElement(document, 'shred-confirm', HTMLInputElement),
    shredReasonInput: requireElement(document, 'shred-reason', HTMLInputElement),
    shredStatus: requireElement(document, 'shred-status', HTMLElement),
  };

  elements.retentionPolicyModeSelect.replaceChildren(
    ...memoryRetentionModes.map((mode) => createOption(document, mode, mode)),
  );

  // Max age belongs to delete_after_max_age only, so the field follows the mode
  // rather than letting the server reject an impossible combination later.
  const syncMaxAgeField = (): void => {
    const expiring = elements.retentionPolicyModeSelect.value === 'delete_after_max_age';
    elements.retentionPolicyMaxAgeInput.disabled = !expiring;

    if (!expiring) {
      elements.retentionPolicyMaxAgeInput.value = '';
    }
  };

  elements.retentionPolicyModeSelect.addEventListener('change', syncMaxAgeField);
  syncMaxAgeField();

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
    getFoundationToken(): string {
      return elements.foundationTokenInput.value;
    },
    takeOperatorPassphrase(): string {
      const passphrase = elements.operatorPassphraseInput.value;
      // The passphrase is exchanged for a session and must not linger in the
      // DOM afterwards.
      elements.operatorPassphraseInput.value = '';
      return passphrase;
    },
    setOperatorStatus(message: string, state: 'idle' | 'active' | 'error' = 'idle'): void {
      elements.operatorStatus.textContent = message;
      elements.operatorStatus.dataset.state = state;
    },
    onOperatorLoginRequested(handler: () => void): void {
      elements.operatorLoginButton.addEventListener('click', () => {
        handler();
      });
    },
    setAdminVisible(visible: boolean): void {
      elements.adminSection.hidden = !visible;
    },
    renderRetentionPolicies(policies: RetentionPolicy[]): void {
      elements.retentionPolicyCount.textContent = policies.length === 1 ? '1 policy' : `${policies.length} policies`;
      elements.retentionPoliciesEmpty.hidden = policies.length > 0;
      elements.retentionPoliciesBody.replaceChildren(
        ...policies.map((policy) => createRetentionPolicyRow(
          elements.retentionPoliciesBody.ownerDocument,
          policy,
          (retentionPolicyId) => retentionPolicyEditRequested?.(retentionPolicyId),
          (retentionPolicyId) => retentionPolicyRevokeRequested?.(retentionPolicyId),
        )),
      );
    },
    readRetentionPolicyForm(): RetentionPolicyFormValue {
      const rawMaxAge = elements.retentionPolicyMaxAgeInput.value.trim();

      return {
        retentionPolicyId: elements.retentionPolicyIdInput.value.trim(),
        displayName: elements.retentionPolicyNameInput.value.trim(),
        mode: elements.retentionPolicyModeSelect.value as RetentionMode,
        maxAgeDays: rawMaxAge === '' ? null : Number(rawMaxAge),
      };
    },
    fillRetentionPolicyForm(policy: RetentionPolicy | null): void {
      // A null policy resets the form to "create"; a policy switches it to
      // editing that one, with its id locked so an edit cannot rename it.
      elements.retentionPolicyIdInput.value = policy?.retentionPolicyId ?? '';
      elements.retentionPolicyIdInput.readOnly = policy !== null;
      elements.retentionPolicyNameInput.value = policy?.displayName ?? '';
      elements.retentionPolicyModeSelect.value = policy?.mode ?? memoryRetentionModes[0];
      elements.retentionPolicyModeSelect.dispatchEvent(new Event('change'));
      elements.retentionPolicyMaxAgeInput.value = policy?.maxAgeDays === undefined ? '' : String(policy.maxAgeDays);
      elements.retentionPolicySubmitButton.textContent = policy === null ? 'Create policy' : 'Save policy';
      elements.retentionPolicyCancelButton.hidden = policy === null;
    },
    setRetentionPolicyStatus(message: string, state: 'idle' | 'active' | 'error' = 'idle'): void {
      elements.retentionPolicyStatus.textContent = message;
      elements.retentionPolicyStatus.dataset.state = state;
    },
    onRetentionPolicySubmitted(handler: () => void): void {
      elements.retentionPolicyForm.addEventListener('submit', (event) => {
        event.preventDefault();
        handler();
      });
    },
    onRetentionPolicyEditRequested(handler: (retentionPolicyId: string) => void): void {
      retentionPolicyEditRequested = handler;
    },
    onRetentionPolicyRevokeRequested(handler: (retentionPolicyId: string) => void): void {
      retentionPolicyRevokeRequested = handler;
    },
    onRetentionPolicyEditCancelled(handler: () => void): void {
      elements.retentionPolicyCancelButton.addEventListener('click', () => {
        handler();
      });
    },
    readShredForm(): ShredFormValue {
      return {
        privacyDomain: elements.shredDomainInput.value.trim(),
        // Deliberately read as typed and never derived from the domain field:
        // a confirmation the UI fills in would confirm nothing.
        confirm: elements.shredConfirmInput.value.trim(),
        reason: elements.shredReasonInput.value.trim(),
      };
    },
    clearShredForm(): void {
      elements.shredDomainInput.value = '';
      elements.shredConfirmInput.value = '';
      elements.shredReasonInput.value = '';
    },
    setShredStatus(message: string, state: 'idle' | 'active' | 'error' = 'idle'): void {
      elements.shredStatus.textContent = message;
      elements.shredStatus.dataset.state = state;
    },
    onShredRequested(handler: () => void): void {
      elements.shredForm.addEventListener('submit', (event) => {
        event.preventDefault();
        handler();
      });
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
    { key: 'Capabilities', value: enabledCapabilityNames(status), monospace: true },
    { key: 'Pico Home Claim', value: status.picoHome.claimState.state, monospace: true },
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

function enabledCapabilityNames(status: SystemStatus): string {
  const enabled = Object.entries(status.capabilities)
    .filter(([, isEnabled]) => isEnabled)
    .map(([name]) => name)
    .sort();

  return enabled.length === 0 ? 'none' : enabled.join(', ');
}

function createRetentionPolicyRow(
  document: Document,
  policy: RetentionPolicy,
  onEdit: (retentionPolicyId: string) => void,
  onRevoke: (retentionPolicyId: string) => void,
): HTMLTableRowElement {
  const row = document.createElement('tr');

  for (const value of [
    policy.retentionPolicyId,
    policy.displayName,
    policy.mode,
    policy.maxAgeDays === undefined ? '-' : `${policy.maxAgeDays} days`,
  ]) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.append(cell);
  }

  const actions = document.createElement('td');
  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'secondary-button row-button';
  editButton.textContent = 'Edit';
  editButton.addEventListener('click', () => {
    onEdit(policy.retentionPolicyId);
  });

  const revokeButton = document.createElement('button');
  revokeButton.type = 'button';
  revokeButton.className = 'secondary-button row-button';
  revokeButton.textContent = 'Revoke';
  revokeButton.addEventListener('click', () => {
    onRevoke(policy.retentionPolicyId);
  });

  actions.append(editButton, revokeButton);
  row.append(actions);

  return row;
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
  const eventNotice = eventHistoryNoticeLabel(state.eventHistory, state.events.length);
  elements.eventsNotice.hidden = eventNotice === null;
  elements.eventsNotice.textContent = eventNotice ?? '';
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
    ...eventTableColumns.map((column) => createCell(document, column.value(event), column.monospace === true)),
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

export function eventHistoryNoticeLabel(eventHistory: DashboardState['eventHistory'], visibleCount: number): string | null {
  if (eventHistory === null) {
    return null;
  }

  if (eventHistory.hasMore) {
    return `Showing latest ${formatCount(visibleCount)} events. Older stored events may be omitted.`;
  }

  if (eventHistory.loadedCount > visibleCount) {
    return `Showing latest ${formatCount(visibleCount)} of ${formatCount(eventHistory.loadedCount)} loaded events.`;
  }

  return null;
}

function formatCount(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
