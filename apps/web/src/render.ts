import type { PicoMemoryEncryptionState, PicoRelayIdentityState } from './api.js';
import { memoryRetentionModes } from './protocol-values.js';
import type { ConnectionStatus, DashboardState, EventFilters, MemoryContentItem, PicoEvent, RetentionMode, RetentionPolicy, SystemStatus } from './types.js';

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
  /**
   * Shows the memory content reading section. Distinct from administration
   * (ADR 0077 A7): it is reading, not host management, and both happen to need
   * the same session in the single-operator phase.
   */
  setContentReadVisible(visible: boolean): void;
  readContentDomain(): string;
  onContentReadRequested(handler: () => void): void;
  onContentLoadMoreRequested(handler: () => void): void;
  /** Replaces the content table, or appends the next page when `append` is set. */
  renderContentItems(items: MemoryContentItem[], options: { append: boolean; hasMore: boolean }): void;
  clearContentItems(): void;
  setContentReadStatus(message: string, state?: 'idle' | 'active' | 'error'): void;
  renderRetentionPolicies(policies: RetentionPolicy[]): void;
  readRetentionPolicyForm(): RetentionPolicyFormValue;
  fillRetentionPolicyForm(policy: RetentionPolicy | null): void;
  setRetentionPolicyStatus(message: string, state?: 'idle' | 'active' | 'error'): void;
  onRetentionPolicySubmitted(handler: () => void): void;
  onRetentionPolicyEditRequested(handler: (retentionPolicyId: string) => void): void;
  onRetentionPolicyRevokeRequested(handler: (retentionPolicyId: string) => void): void;
  onRetentionPolicyEditCancelled(handler: () => void): void;
  /** ADR 0118 O1. Reads the entry form; the instant is normalised to UTC. */
  readTimeBoundEntryForm(): TimeBoundEntryFormValue;
  clearTimeBoundEntryForm(): void;
  setTimeBoundEntryStatus(message: string, state?: 'idle' | 'active' | 'error'): void;
  onTimeBoundEntryRequested(handler: () => void): void;
  /**
   * ADR 0104. The two decisions that belong to Pico, shown as what is running
   * and what was decided - never as one line.
   */
  renderMemoryEncryption(state: PicoMemoryEncryptionState): void;
  readMemoryEncryptionForm(): boolean;
  setMemoryEncryptionStatus(message: string, state?: 'idle' | 'active' | 'error'): void;
  onMemoryEncryptionSubmitted(handler: () => void): void;
  renderRelayIdentity(state: PicoRelayIdentityState): void;
  readRelayIdentityForm(): { operator: string; accountId: string };
  setRelayIdentityStatus(message: string, state?: 'idle' | 'active' | 'error'): void;
  onRelayIdentitySubmitted(handler: () => void): void;
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
  contentSection: HTMLElement;
  contentReadForm: HTMLFormElement;
  contentDomainInput: HTMLInputElement;
  contentReadStatus: HTMLElement;
  contentCount: HTMLElement;
  contentItemsBody: HTMLTableSectionElement;
  contentItemsEmpty: HTMLElement;
  contentLoadMoreButton: HTMLButtonElement;
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
  entryForm: HTMLFormElement;
  entryTitleInput: HTMLInputElement;
  entryKindSelect: HTMLSelectElement;
  entryDueInput: HTMLInputElement;
  entryDomainInput: HTMLInputElement;
  entryStatus: HTMLElement;
  entriesBody: HTMLTableSectionElement;
  entriesEmpty: HTMLElement;
  encryptionState: HTMLElement;
  encryptionOrigin: HTMLElement;
  encryptionForm: HTMLFormElement;
  encryptionEnabledSelect: HTMLSelectElement;
  encryptionStatus: HTMLElement;
  relayIdentityState: HTMLElement;
  relayIdentityOrigin: HTMLElement;
  relayIdentityCost: HTMLElement;
  relayIdentityForm: HTMLFormElement;
  relayOperatorInput: HTMLInputElement;
  relayAccountInput: HTMLInputElement;
  relayIdentityStatus: HTMLElement;
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

export interface TimeBoundEntryFormValue {
  title: string;
  kind: 'appointment' | 'reminder';
  privacyDomain: string;
  dueAt: string;
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
  let contentLoadMoreRequested: (() => void) | null = null;

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
    contentSection: requireElement(document, 'content-section', HTMLElement),
    contentReadForm: requireElement(document, 'content-read-form', HTMLFormElement),
    contentDomainInput: requireElement(document, 'content-domain', HTMLInputElement),
    contentReadStatus: requireElement(document, 'content-read-status', HTMLElement),
    contentCount: requireElement(document, 'content-count', HTMLElement),
    contentItemsBody: requireElement(document, 'content-items-body', HTMLTableSectionElement),
    contentItemsEmpty: requireElement(document, 'content-items-empty', HTMLElement),
    contentLoadMoreButton: requireElement(document, 'content-load-more-button', HTMLButtonElement),
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
    entryForm: requireElement(document, 'entry-form', HTMLFormElement),
    entryTitleInput: requireElement(document, 'entry-title', HTMLInputElement),
    entryKindSelect: requireElement(document, 'entry-kind', HTMLSelectElement),
    entryDueInput: requireElement(document, 'entry-due', HTMLInputElement),
    entryDomainInput: requireElement(document, 'entry-domain', HTMLInputElement),
    entryStatus: requireElement(document, 'entry-status', HTMLElement),
    entriesBody: requireElement(document, 'entries-body', HTMLTableSectionElement),
    entriesEmpty: requireElement(document, 'entries-empty', HTMLElement),
    encryptionState: requireElement(document, 'encryption-state', HTMLElement),
    encryptionOrigin: requireElement(document, 'encryption-origin', HTMLElement),
    encryptionForm: requireElement(document, 'encryption-form', HTMLFormElement),
    encryptionEnabledSelect: requireElement(document, 'encryption-enabled', HTMLSelectElement),
    encryptionStatus: requireElement(document, 'encryption-status', HTMLElement),
    relayIdentityState: requireElement(document, 'relay-identity-state', HTMLElement),
    relayIdentityOrigin: requireElement(document, 'relay-identity-origin', HTMLElement),
    relayIdentityCost: requireElement(document, 'relay-identity-cost', HTMLElement),
    relayIdentityForm: requireElement(document, 'relay-identity-form', HTMLFormElement),
    relayOperatorInput: requireElement(document, 'relay-operator', HTMLInputElement),
    relayAccountInput: requireElement(document, 'relay-account', HTMLInputElement),
    relayIdentityStatus: requireElement(document, 'relay-identity-status', HTMLElement),
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

  elements.contentLoadMoreButton.addEventListener('click', () => {
    contentLoadMoreRequested?.();
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
    setContentReadVisible(visible: boolean): void {
      elements.contentSection.hidden = !visible;
    },
    readContentDomain(): string {
      return elements.contentDomainInput.value.trim();
    },
    onContentReadRequested(handler: () => void): void {
      elements.contentReadForm.addEventListener('submit', (event) => {
        event.preventDefault();
        handler();
      });
    },
    onContentLoadMoreRequested(handler: () => void): void {
      contentLoadMoreRequested = handler;
    },
    renderContentItems(items: MemoryContentItem[], options: { append: boolean; hasMore: boolean }): void {
      const rows = items.map((item) => createContentItemRow(elements.contentItemsBody.ownerDocument, item));

      if (options.append) {
        elements.contentItemsBody.append(...rows);
      } else {
        elements.contentItemsBody.replaceChildren(...rows);
      }

      const total = elements.contentItemsBody.childElementCount;
      elements.contentCount.textContent = total === 1 ? '1 item' : `${total} items`;
      // The empty state only speaks after a read that returned nothing, never
      // for an appended page that simply added no rows.
      elements.contentItemsEmpty.hidden = options.append || total > 0;
      elements.contentLoadMoreButton.hidden = !options.hasMore;
    },
    clearContentItems(): void {
      elements.contentItemsBody.replaceChildren();
      elements.contentItemsEmpty.hidden = true;
      elements.contentLoadMoreButton.hidden = true;
      elements.contentCount.textContent = 'No domain loaded';
    },
    setContentReadStatus(message: string, state: 'idle' | 'active' | 'error' = 'idle'): void {
      elements.contentReadStatus.textContent = message;
      elements.contentReadStatus.dataset.state = state;
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
    readTimeBoundEntryForm(): TimeBoundEntryFormValue {
      const local = elements.entryDueInput.value;
      return {
        title: elements.entryTitleInput.value.trim(),
        kind: elements.entryKindSelect.value === 'appointment' ? 'appointment' : 'reminder',
        privacyDomain: elements.entryDomainInput.value.trim(),
        // `datetime-local` has no zone, so the browser's own is the only
        // reading of what the person meant. Normalised to a canonical UTC
        // instant here, because the core refuses anything else - two spellings
        // of one instant would sort apart.
        dueAt: local === '' ? '' : new Date(local).toISOString(),
      };
    },
    clearTimeBoundEntryForm(): void {
      elements.entryTitleInput.value = '';
      elements.entryDueInput.value = '';
    },
    setTimeBoundEntryStatus(message: string, state: 'idle' | 'active' | 'error' = 'idle'): void {
      elements.entryStatus.textContent = message;
      elements.entryStatus.dataset.state = state;
    },
    onTimeBoundEntryRequested(handler: () => void): void {
      elements.entryForm.addEventListener('submit', (event) => {
        event.preventDefault();
        handler();
      });
    },
    renderMemoryEncryption(state: PicoMemoryEncryptionState): void {
      const lines = picoMemoryEncryptionLines(state);
      elements.encryptionState.textContent = lines.running;
      elements.encryptionOrigin.textContent = lines.origin;
      // The form shows what is running, so the field a person changes starts
      // from the truth rather than from the last thing they typed.
      elements.encryptionEnabledSelect.value = state.enabled ? 'true' : 'false';
    },
    readMemoryEncryptionForm(): boolean {
      return elements.encryptionEnabledSelect.value === 'true';
    },
    setMemoryEncryptionStatus(message: string, state: 'idle' | 'active' | 'error' = 'idle'): void {
      elements.encryptionStatus.textContent = message;
      elements.encryptionStatus.dataset.state = state;
    },
    onMemoryEncryptionSubmitted(handler: () => void): void {
      elements.encryptionForm.addEventListener('submit', (event) => {
        event.preventDefault();
        handler();
      });
    },
    renderRelayIdentity(state: PicoRelayIdentityState): void {
      const lines = picoRelayIdentityLines(state);
      elements.relayIdentityState.textContent = lines.identity;
      elements.relayIdentityOrigin.textContent = lines.origin;
      elements.relayIdentityCost.textContent = lines.cost;
      elements.relayOperatorInput.value = state.operator ?? '';
      elements.relayAccountInput.value = state.accountId ?? '';
    },
    readRelayIdentityForm(): { operator: string; accountId: string } {
      return {
        operator: elements.relayOperatorInput.value.trim(),
        accountId: elements.relayAccountInput.value.trim(),
      };
    },
    setRelayIdentityStatus(message: string, state: 'idle' | 'active' | 'error' = 'idle'): void {
      elements.relayIdentityStatus.textContent = message;
      elements.relayIdentityStatus.dataset.state = state;
    },
    onRelayIdentitySubmitted(handler: () => void): void {
      elements.relayIdentityForm.addEventListener('submit', (event) => {
        event.preventDefault();
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

      renderTimeBoundEntries(elements, state.events);
      renderCoreSummary(elements.coreSummary, state.systemStatus);
      renderDatabaseSummary(elements.databaseSummary, state.systemStatus);
      renderEventControls(elements, state);
      renderEvents(elements, state, (eventId) => eventSelected?.(eventId));
      renderEventDetail(elements.eventDetail, state.events, state.selectedEventId);
      elements.rawStatus.textContent = state.systemStatus === null ? '{}' : JSON.stringify(state.systemStatus, null, 2);
    },
  };
}

/**
 * ADR 0118 O1. Soonest first, and overdue rows marked - the person reads this
 * to find the next thing they have to deal with, so the ordering is the point
 * rather than a preference.
 *
 * `textContent` throughout: the title is the person's own content, but it
 * still arrives through the event stream, and a surface that builds markup
 * from stored strings is one injection away from being someone else's.
 */
function renderTimeBoundEntries(
  elements: DashboardElements,
  events: readonly PicoEvent[],
): void {
  const rows = timeBoundEntriesFromEvents(events, new Date().toISOString());
  elements.entriesBody.replaceChildren();
  elements.entriesEmpty.hidden = rows.length > 0;

  for (const row of rows) {
    const tr = document.createElement('tr');
    if (row.overdue) {
      tr.dataset.overdue = 'true';
    }
    if (row.raisedAt !== undefined) {
      tr.dataset.raised = 'true';
    }
    for (const [value, monospace] of [
      [formatDateTime(row.dueAt), false],
      [row.kind, false],
      // Three states, not two: waiting, late, and done. Collapsing "done" into
      // "not late" would leave the person unable to tell an entry that
      // reached them from one that simply is not due yet.
      [row.raisedAt === undefined
        ? (row.overdue ? 'overdue' : 'waiting')
        : `raised ${formatDateTime(row.raisedAt)}`, false],
      [row.privacyDomain, true],
      [row.memoryItemId, true],
    ] as Array<[string, boolean]>) {
      const cell = document.createElement('td');
      cell.textContent = value;
      if (monospace) {
        cell.classList.add('monospace');
      }
      tr.append(cell);
    }
    elements.entriesBody.append(tr);
  }
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
    { key: 'Storage', value: storageSummary(status.storage), monospace: true },
  ]);
}

/**
 * ADR 0119 Q5. The named state, and for anything other than `normal` the
 * reasons and the action that clears each one. A refusal the person meets with
 * no warning is the outcome this gate exists to prevent, so the condition is
 * shown while there is still room to act rather than only at the moment a write
 * is declined.
 *
 * The core names the remedy as a class; the words are chosen here, because
 * phrasing belongs to whichever surface is speaking to the person.
 */
export interface TimeBoundEntryRow {
  memoryItemId: string;
  kind: 'appointment' | 'reminder';
  privacyDomain: string;
  dueAt: string;
  /** Set once the entry reached the person. */
  raisedAt?: string;
  /** True only while it is late *and* still waiting. */
  overdue: boolean;
}

/**
 * ADR 0118 O1. The entries, taken from the events the dashboard already loaded
 * rather than from a second endpoint.
 *
 * Sorted by the instant, soonest first, so the next thing the person has to
 * deal with is at the top - the order the list is *for*. Overdue is computed
 * against the clock rather than stored, because whether something is late
 * changes without anything being written.
 *
 * `raisedAt` is a read projection the core adds, not a stored field: whether
 * an entry reached the person changes after the event was written. An entry
 * that has been raised is never overdue - it is done, and calling it late
 * would keep nagging about something already delivered.
 */
export function timeBoundEntriesFromEvents(
  events: readonly PicoEvent[],
  nowIso: string,
): TimeBoundEntryRow[] {
  const nowMs = Date.parse(nowIso);
  const rows: TimeBoundEntryRow[] = [];
  for (const event of events) {
    if (event.type !== 'memory.time_bound_entry_recorded') {
      continue;
    }
    const payload = event.payload as Record<string, unknown>;
    const dueAt = payload.dueAt;
    const memoryItemId = payload.memoryItemId;
    if (typeof dueAt !== 'string' || typeof memoryItemId !== 'string') {
      continue;
    }
    const raisedAt = typeof payload.raisedAt === 'string' ? payload.raisedAt : undefined;
    rows.push({
      memoryItemId,
      kind: payload.contentType === 'application/vnd.pico.appointment'
        ? 'appointment'
        : 'reminder',
      privacyDomain: typeof payload.privacyDomain === 'string' ? payload.privacyDomain : '',
      dueAt,
      ...(raisedAt === undefined ? {} : { raisedAt }),
      overdue: raisedAt === undefined && Date.parse(dueAt) <= nowMs,
    });
  }
  return rows.sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt));
}

export function storageSummary(storage: SystemStatus['storage']): string {
  if (storage.reasons.length === 0) {
    return storage.state;
  }

  const remedyText: Record<string, string> = {
    free_disk_space: 'free disk space',
    reduce_stored_data: 'export, migrate or shred to reduce stored data',
  };

  const reasons = storage.reasons.map((reason) => {
    const remedy = remedyText[reason.remedy] ?? reason.remedy;
    if (reason.cause === 'store_ceiling') {
      return `${reason.store ?? 'store'} at ceiling `
        + `(${String(reason.rows ?? 0)}/${String(reason.ceilingRows ?? 0)} rows) - ${remedy}`;
    }
    return `low disk - ${remedy}`;
  });

  return `${storage.state}: ${reasons.join('; ')}`;
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

/**
 * ADR 0104 S3, in words. What this Home runs under, and who decided it.
 *
 * **Two sentences, because they are two facts.** The key store is built before
 * the database opens, so a decision taken now is one the next start reads: a
 * surface that showed one line would either hide the answer somebody just gave
 * or claim a change that has not happened. Neither is a rendering detail - one
 * of them tells a person their content changed posture while it sat as it was.
 */
export function picoMemoryEncryptionLines(state: PicoMemoryEncryptionState): {
  running: string;
  origin: string;
} {
  return {
    running: state.enabled
      ? 'Memory content is encrypted at rest.'
      : 'Memory content is stored as plaintext foundation data.',
    origin: state.decided
      ? `A person decided this${
        state.decidedAt === undefined ? '' : ` on ${formatDateTime(state.decidedAt)}`
      }.`
      : 'Nobody has decided this. Pico inherited it and will keep the answer once somebody gives one.',
  };
}

/**
 * ADR 0104 S5 with ADR 0031 and ADR 0148. Which operator carries this Home's
 * messages, and what changing that would cost.
 *
 * **The cost is said before anybody asks for a change.** Every mailbox is an
 * address at this operator under this account, so a change strands all of them
 * and each relationship needs a fresh exchange. A person deciding to move
 * should read the number while they are deciding, not in the refusal
 * afterwards.
 *
 * **No account is an absence, not a fault.** A Home that has never chosen an
 * operator reaches other Picos over the direct channel, which works; ADR 0118
 * O4 forbids rendering that as broken.
 */
export function picoRelayIdentityLines(state: PicoRelayIdentityState): {
  identity: string;
  origin: string;
  cost: string;
} {
  const named = state.operator !== undefined && state.accountId !== undefined;
  return {
    identity: named
      ? `${state.accountId} at ${state.operator}`
      : 'No relay account.',
    origin: !named
      ? 'This Home reaches other Picos over the direct channel.'
      : state.decided === true
        ? 'A person decided this.'
        : 'Inherited from this host\'s configuration.',
    cost: state.mailboxes === 0
      ? 'No mailboxes yet, so changing the account strands nothing.'
      : `${state.mailboxes} ${state.mailboxes === 1 ? 'mailbox' : 'mailboxes'} at this account. `
        + 'Changing it means every one of them needs a fresh exchange.',
  };
}

/**
 * ADR 0117 X5. What a person is told about a piece of content before they read
 * it.
 *
 * **Content is never rendered without this.** X5's rule is that person-facing
 * renderings of untrusted content stay labeled content, and the only way that
 * holds is if the label is produced by the same call that produces the row -
 * a labelling step somebody must remember is a labelling step somebody will
 * forget.
 *
 * `person_present` gets no label, and that is the point rather than an
 * omission: everything else is below ADR 0116's instruction threshold, so the
 * absence of a label means "your own words" and its presence means "somebody
 * else's". A label on everything would say nothing.
 */
export function picoMemoryContentLabel(item: MemoryContentItem): string | null {
  const parts: string[] = [];
  if (item.origin !== undefined && item.origin !== 'person_present') {
    parts.push(`from ${item.origin.replace(/_/gu, ' ')}`);
  }
  if (item.derivedFrom !== undefined) {
    // ADR 0136 BR6 with ADR 0133. The revision is the correction point, and
    // whether the pin covers the bytes is the difference between "this is what
    // the document said" and "this is what a document said".
    parts.push(
      `read from ${item.derivedFrom.supplierIdentifier} at `
      + `${item.derivedFrom.pin.value.slice(0, 12)}`
      + (item.derivedFrom.pinCoversContent ? '' : ', which the pin does not cover'),
    );
  }
  return parts.length === 0 ? null : parts.join('; ');
}

function createContentItemRow(document: Document, item: MemoryContentItem): HTMLTableRowElement {
  const row = document.createElement('tr');

  const idCell = document.createElement('td');
  idCell.className = 'monospace';
  idCell.textContent = item.memoryItemId;

  const typeCell = document.createElement('td');
  typeCell.textContent = item.contentType;

  const contentCell = document.createElement('td');
  if (item.content !== undefined) {
    // ADR 0117 X5. The label goes in first, so content never appears above
    // its own provenance - a reader who scrolls away has already been told.
    const label = picoMemoryContentLabel(item);
    if (label !== null) {
      const labelLine = document.createElement('p');
      labelLine.className = 'muted';
      labelLine.textContent = label;
      contentCell.append(labelLine);
    }
    const text = document.createElement('p');
    // Always textContent, never innerHTML: memory content is arbitrary text and
    // must not be interpreted as markup.
    text.textContent = item.content;
    contentCell.append(text);
  } else {
    // A crypto-shredded or provider-absent item reports why, rather than showing
    // an empty cell that would read as "no content" (ADR 0077 C5).
    contentCell.className = 'muted';
    contentCell.textContent = `unavailable (${item.contentUnavailable ?? 'unknown'})`;
  }

  const createdCell = document.createElement('td');
  createdCell.textContent = formatDateTime(item.createdAt);

  row.append(idCell, typeCell, contentCell, createdCell);
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
