import { realtimeMessageType } from './protocol-values.js';
import {
  PicoModelProviderNarrowingRefusedError,
  PicoModuleHasDependentsError,
  PicoRelayIdentityInUseError,
  createRetentionPolicy,
  decideMemoryEncryption,
  decideRelayIdentity,
  listModelProviders,
  narrowModelProvider,
  setModuleActivation,
  setModuleCapture,
  readMemoryEncryption,
  readRelayIdentity,
  defaultPicoHomeUrl,
  deleteRetentionPolicy,
  listDomainContent,
  listRetentionPolicies,
  loadDashboardSnapshot,
  loginOperator,
  mintRealtimeTicket,
  normalizePicoHomeUrl,
  createTimeBoundEntry,
  shredPrivacyDomain,
  updateRetentionPolicy,
} from './api.js';
import { createDashboardView, picoModuleDroppedLine } from './render.js';
import type { DashboardState, EventFilters, MemoryContentListResponse, PicoEvent, RealtimeMessage, RetentionPolicy } from './types.js';
import { connectRealtime, type RealtimeClient } from './websocket.js';

const MAX_VISIBLE_EVENTS = 500;
const REALTIME_RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000];
const EMPTY_EVENT_FILTERS: EventFilters = {
  type: '',
  stream: '',
  deviceId: '',
};

export function startDashboard(document: Document): void {
  const view = createDashboardView(document);
  const initialBaseUrl = defaultPicoHomeUrl(document.location);
  const state: DashboardState = {
    baseUrl: initialBaseUrl,
    foundationToken: '',
    httpStatus: 'idle',
    websocketStatus: 'idle',
    websocketRetryAt: null,
    lastUpdatedAt: null,
    systemStatus: null,
    events: [],
    eventHistory: null,
    eventFilters: EMPTY_EVENT_FILTERS,
    selectedEventId: null,
    errorMessage: null,
  };

  let realtimeClient: RealtimeClient | null = null;
  let realtimeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let realtimeReconnectAttempt = 0;
  let connectionGeneration = 0;

  // The operator session lives here and nowhere else: memory only, never
  // persisted and never rendered, so a reload asks for the passphrase again
  // (ADR 0076). It is deliberately not part of DashboardState.
  let operatorSession: string | undefined;
  let retentionPolicies: RetentionPolicy[] = [];

  // Which domain the content reader is paging through, and where it is. The
  // cursor is opaque server state; the dashboard only carries it forward.
  let contentDomain: string | undefined;
  let contentCursor: string | null = null;

  function foundationAccess(): { foundationToken: string; operatorSession?: string } {
    return {
      foundationToken: state.foundationToken,
      ...(operatorSession === undefined ? {} : { operatorSession }),
    };
  }

  view.setBaseUrl(state.baseUrl);
  view.render(state);

  // Administration is only reachable with an operator session, so the section
  // stays hidden until there is one, and disappears when it goes.
  let editedPolicyId: string | null = null;

  view.onOperatorLoginRequested(() => {
    void logInOperator();
  });

  view.onRetentionPolicySubmitted(() => {
    void saveRetentionPolicy();
  });

  view.onModuleActivationRequested((input) => {
    void switchModule(input);
  });

  view.onModuleCaptureRequested((input) => {
    void switchModuleCapture(input);
  });

  view.onModelNarrowingSubmitted(() => {
    void narrowProvider();
  });

  view.onMemoryEncryptionSubmitted(() => {
    void saveMemoryEncryption();
  });

  view.onRelayIdentitySubmitted(() => {
    void saveRelayIdentity();
  });

  view.onRetentionPolicyEditRequested((retentionPolicyId) => {
    const policy = retentionPolicies.find((candidate) => candidate.retentionPolicyId === retentionPolicyId);

    if (policy === undefined) {
      return;
    }

    editedPolicyId = retentionPolicyId;
    view.fillRetentionPolicyForm(policy);
    view.setRetentionPolicyStatus(`Editing ${retentionPolicyId}. Saving applies to every item referencing it at the next sweep.`);
  });

  view.onRetentionPolicyEditCancelled(() => {
    editedPolicyId = null;
    view.fillRetentionPolicyForm(null);
    view.setRetentionPolicyStatus('');
  });

  view.onRetentionPolicyRevokeRequested((retentionPolicyId) => {
    void revokeRetentionPolicy(retentionPolicyId);
  });

  view.onShredRequested(() => {
    void shredDomain();
  });

  view.onTimeBoundEntryRequested(() => {
    void recordTimeBoundEntry();
  });

  view.onContentReadRequested(() => {
    void readDomainContent();
  });

  view.onContentLoadMoreRequested(() => {
    void loadMoreDomainContent();
  });

  view.onConnectRequested(() => {
    void connect(view.getBaseUrl());
  });

  view.onRefreshRequested(() => {
    void refreshCurrentSnapshot();
  });

  view.onEventFiltersChanged((filters) => {
    state.eventFilters = filters;
    view.render(state);
  });

  view.onEventSelected((eventId) => {
    state.selectedEventId = eventId;
    view.render(state);
  });

  void connect(state.baseUrl);

  async function connect(rawBaseUrl: string): Promise<void> {
    const generation = connectionGeneration + 1;
    connectionGeneration = generation;

    cancelRealtimeReconnect();
    realtimeClient?.close();
    realtimeClient = null;

    let baseUrl: string;

    try {
      baseUrl = normalizePicoHomeUrl(rawBaseUrl);
    } catch (error) {
      state.httpStatus = 'error';
      state.websocketStatus = 'disconnected';
      state.errorMessage = formatUnknownError(error);
      view.render(state);
      return;
    }

    state.baseUrl = baseUrl;
    state.httpStatus = 'checking';
    state.websocketStatus = 'connecting';
    state.websocketRetryAt = null;
    state.errorMessage = null;
    view.setBaseUrl(baseUrl);
    view.render(state);

    try {
      state.foundationToken = view.getFoundationToken();
      const snapshotLoaded = await refreshSnapshot(generation);

      if (generation !== connectionGeneration) {
        return;
      }

      if (!snapshotLoaded) {
        return;
      }

      void openRealtime(baseUrl, generation);
    } catch (error) {
      if (generation !== connectionGeneration) {
        return;
      }

      state.httpStatus = 'error';
      state.websocketStatus = 'disconnected';
      state.errorMessage = formatUnknownError(error);
      view.render(state);
    }
  }

  async function logInOperator(): Promise<void> {
    const passphrase = view.takeOperatorPassphrase();

    if (passphrase.trim() === '') {
      view.setOperatorStatus('Enter the operator passphrase to log in.', 'error');
      return;
    }

    view.setOperatorStatus('Logging in...');

    try {
      operatorSession = await loginOperator(view.getBaseUrl(), passphrase);
    } catch (error) {
      operatorSession = undefined;
      view.setAdminVisible(false);
      view.setContentReadVisible(false);
      view.setOperatorStatus(formatUnknownError(error), 'error');
      return;
    }

    view.setOperatorStatus('Logged in as the Foundation operator. A reload asks again.', 'active');
    view.setAdminVisible(true);
    view.setContentReadVisible(true);
    view.fillRetentionPolicyForm(null);
    await refreshRetentionPolicies();
    await refreshHomeSettings();
    await refreshModelProviders();
    void connect(view.getBaseUrl());
  }

  /**
   * ADR 0127 M3 with ADR 0129 SR6. The two switches, and the two refusals.
   *
   * The module list arrives with the system status that is already polled, so
   * switching re-renders from what the route answered rather than asking
   * again: the response is the newest truth there is.
   */
  async function switchModule(input: { identifier: string; active: boolean }): Promise<void> {
    view.setModuleStatus(`${input.active ? 'Switching on' : 'Switching off'} ${input.identifier}...`);

    let answered: Awaited<ReturnType<typeof setModuleActivation>>;
    try {
      answered = await setModuleActivation(state.baseUrl, foundationAccess(), input);
    } catch (error) {
      // ADR 0127 M3. Named, not merely refused: a person who turned one thing
      // off should not have to guess which of several others is holding it on.
      view.setModuleStatus(
        error instanceof PicoModuleHasDependentsError
          ? `${input.identifier} stays on: ${error.dependents.join(', ')} `
            + `${error.dependents.length === 1 ? 'depends' : 'depend'} on it. `
            + 'Switch those off first.'
          : formatUnknownError(error),
        'error',
      );
      return;
    }

    view.renderModules(answered.modules);
    // ADR 0127 M4. What will not happen, said while there is still room to
    // act - never as a confirmation step standing in the way of the stop.
    const dropped = picoModuleDroppedLine(answered.dropped);
    view.setModuleStatus(
      dropped === null
        ? `${input.identifier} is ${input.active ? 'on' : 'off'}.`
        : `${input.identifier} is off. ${dropped}`,
      dropped === null ? 'active' : 'error',
    );
  }

  async function switchModuleCapture(
    input: { identifier: string; capturing: boolean },
  ): Promise<void> {
    view.setModuleStatus(
      `${input.capturing ? 'Starting' : 'Stopping'} recording for ${input.identifier}...`,
    );

    try {
      view.renderModules(await setModuleCapture(state.baseUrl, foundationAccess(), input));
    } catch (error) {
      view.setModuleStatus(formatUnknownError(error), 'error');
      return;
    }

    // ADR 0129 SR6. Stopping recording removes nothing, and saying so is what
    // keeps it a different act from switching the module off.
    view.setModuleStatus(
      input.capturing
        ? `${input.identifier} is recording.`
        : `${input.identifier} has stopped recording. What it recorded is kept.`,
      'active',
    );
  }

  /**
   * ADR 0152. What computes for this Home, listed as measured.
   *
   * An empty registry is not a failure: nothing measured means nothing
   * computes here yet, which is the ordinary state of a Home whose owner has
   * not run the measurement (ADR 0118 O4).
   */
  async function refreshModelProviders(): Promise<void> {
    if (operatorSession === undefined) {
      return;
    }

    try {
      view.renderModelProviders(await listModelProviders(state.baseUrl, foundationAccess()));
    } catch (error) {
      view.setModelNarrowingStatus(formatUnknownError(error), 'error');
    }
  }

  async function narrowProvider(): Promise<void> {
    const form = view.readModelNarrowingForm();

    if (form.entryId === '') {
      view.setModelNarrowingStatus('Name the entry to narrow.', 'error');
      return;
    }
    if (form.contextTokens === null && form.concurrentJobs === null) {
      // A narrowing with no number is not a narrowing, and sending it would
      // record a decision that says nothing.
      view.setModelNarrowingStatus('Give at least one ceiling to narrow to.', 'error');
      return;
    }

    view.setModelNarrowingStatus('Narrowing...');

    try {
      await narrowModelProvider(state.baseUrl, foundationAccess(), form.entryId, {
        ...(form.contextTokens === null ? {} : { contextTokens: form.contextTokens }),
        ...(form.concurrentJobs === null ? {} : { concurrentJobs: form.concurrentJobs }),
      });
    } catch (error) {
      // ADR 0152 SE4. The refusal names the measurement it was measured
      // against: "too large" without the number leaves a person guessing at
      // what would fit.
      view.setModelNarrowingStatus(
        error instanceof PicoModelProviderNarrowingRefusedError
          ? `Refused: ${error.refusal.replace(/_/gu, ' ')}.${
            error.measured === undefined
              ? ''
              : ` Measured: ${Object.entries(error.measured)
                .map(([field, value]) => `${field.replace(/_/gu, ' ')} ${value}`)
                .join(', ')}.`
          }`
          : formatUnknownError(error),
        'error',
      );
      return;
    }

    view.setModelNarrowingStatus('Narrowed. Jobs dispatched from now on use the lower ceiling.', 'active');
    await refreshModelProviders();
  }

  /**
   * ADR 0104. Both settings are read together because both are read the same
   * way: an operator session, one GET each, and a failure that is said in its
   * own place rather than banner-wide. One being unavailable must not blank the
   * other (ADR 0118 O4).
   */
  async function refreshHomeSettings(): Promise<void> {
    if (operatorSession === undefined) {
      return;
    }

    try {
      view.renderMemoryEncryption(await readMemoryEncryption(state.baseUrl, foundationAccess()));
    } catch (error) {
      view.setMemoryEncryptionStatus(formatUnknownError(error), 'error');
    }

    try {
      view.renderRelayIdentity(await readRelayIdentity(state.baseUrl, foundationAccess()));
    } catch (error) {
      view.setRelayIdentityStatus(formatUnknownError(error), 'error');
    }
  }

  async function saveMemoryEncryption(): Promise<void> {
    const enabled = view.readMemoryEncryptionForm();
    view.setMemoryEncryptionStatus('Recording...');

    try {
      await decideMemoryEncryption(state.baseUrl, foundationAccess(), enabled);
    } catch (error) {
      view.setMemoryEncryptionStatus(formatUnknownError(error), 'error');
      return;
    }

    // **Not "encryption is now on".** The key store is built before the
    // database opens, so this process keeps running under what it booted with,
    // and the re-read below shows exactly that.
    view.setMemoryEncryptionStatus(
      `Recorded: ${enabled ? 'encrypt' : 'do not encrypt'}. It takes effect at the next start.`,
      'active',
    );
    await refreshHomeSettings();
  }

  async function saveRelayIdentity(): Promise<void> {
    const form = view.readRelayIdentityForm();

    if (form.operator === '' || form.accountId === '') {
      view.setRelayIdentityStatus('A relay account needs an operator and an account.', 'error');
      return;
    }

    view.setRelayIdentityStatus('Recording...');

    try {
      await decideRelayIdentity(state.baseUrl, foundationAccess(), form);
    } catch (error) {
      // ADR 0148. Carried out as itself: the count is what the change costs,
      // and "something went wrong" would leave somebody to find that out by
      // losing every mailbox they have.
      view.setRelayIdentityStatus(
        error instanceof PicoRelayIdentityInUseError
          ? `Refused. ${error.mailboxes} ${error.mailboxes === 1 ? 'mailbox belongs' : 'mailboxes belong'} `
            + 'to the account this Home holds, and each one would need a fresh exchange. '
            + 'Remove them first if you mean to move.'
          : formatUnknownError(error),
        'error',
      );
      await refreshHomeSettings();
      return;
    }

    view.setRelayIdentityStatus('Recorded. It takes effect at the next start.', 'active');
    await refreshHomeSettings();
  }

  async function readDomainContent(): Promise<void> {
    const domain = view.readContentDomain();

    if (domain === '') {
      view.setContentReadStatus('Name the privacy domain to read.', 'error');
      return;
    }

    view.setContentReadStatus(`Reading ${domain}...`);

    let page: MemoryContentListResponse;
    try {
      page = await listDomainContent(state.baseUrl, foundationAccess(), domain);
    } catch (error) {
      view.setContentReadStatus(formatUnknownError(error), 'error');
      return;
    }

    contentDomain = domain;
    contentCursor = page.nextCursor;
    view.renderContentItems(page.items, { append: false, hasMore: page.hasMore });
    view.setContentReadStatus(
      page.items.length === 0 ? `No content in ${domain}.` : `Read ${domain}.`,
      'active',
    );
  }

  async function loadMoreDomainContent(): Promise<void> {
    // Guarded by the button being hidden without a next page, but a stale click
    // must still be a no-op rather than re-reading from the start.
    if (contentDomain === undefined || contentCursor === null) {
      return;
    }

    view.setContentReadStatus(`Loading more of ${contentDomain}...`);

    let page: MemoryContentListResponse;
    try {
      page = await listDomainContent(state.baseUrl, foundationAccess(), contentDomain, contentCursor);
    } catch (error) {
      view.setContentReadStatus(formatUnknownError(error), 'error');
      return;
    }

    contentCursor = page.nextCursor;
    view.renderContentItems(page.items, { append: true, hasMore: page.hasMore });
    view.setContentReadStatus(`Read ${contentDomain}.`, 'active');
  }

  async function refreshRetentionPolicies(): Promise<void> {
    if (operatorSession === undefined) {
      return;
    }

    try {
      retentionPolicies = await listRetentionPolicies(state.baseUrl, foundationAccess());
      view.renderRetentionPolicies(retentionPolicies);
    } catch (error) {
      view.setRetentionPolicyStatus(formatUnknownError(error), 'error');
    }
  }

  async function saveRetentionPolicy(): Promise<void> {
    const form = view.readRetentionPolicyForm();

    if (form.retentionPolicyId === '' || form.displayName === '') {
      view.setRetentionPolicyStatus('A policy needs an ID and a display name.', 'error');
      return;
    }

    const maxAgeDays = form.mode === 'delete_after_max_age' ? form.maxAgeDays : null;

    if (form.mode === 'delete_after_max_age' && (maxAgeDays === null || !Number.isInteger(maxAgeDays) || maxAgeDays < 1)) {
      view.setRetentionPolicyStatus('An expiring policy needs a whole number of days, at least 1.', 'error');
      return;
    }

    view.setRetentionPolicyStatus('Saving...');

    try {
      if (editedPolicyId === null) {
        await createRetentionPolicy(state.baseUrl, foundationAccess(), {
          retentionPolicyId: form.retentionPolicyId,
          displayName: form.displayName,
          mode: form.mode,
          ...(maxAgeDays === null ? {} : { maxAgeDays }),
        });
      } else {
        await updateRetentionPolicy(state.baseUrl, foundationAccess(), editedPolicyId, {
          displayName: form.displayName,
          mode: form.mode,
          ...(maxAgeDays === null ? {} : { maxAgeDays }),
        });
      }
    } catch (error) {
      view.setRetentionPolicyStatus(formatUnknownError(error), 'error');
      return;
    }

    const savedId = editedPolicyId ?? form.retentionPolicyId;
    editedPolicyId = null;
    view.fillRetentionPolicyForm(null);
    view.setRetentionPolicyStatus(`Saved ${savedId}.`, 'active');
    await refreshRetentionPolicies();
  }

  async function revokeRetentionPolicy(retentionPolicyId: string): Promise<void> {
    view.setRetentionPolicyStatus(`Revoking ${retentionPolicyId}...`);

    try {
      await deleteRetentionPolicy(state.baseUrl, foundationAccess(), retentionPolicyId);
    } catch (error) {
      view.setRetentionPolicyStatus(formatUnknownError(error), 'error');
      return;
    }

    if (editedPolicyId === retentionPolicyId) {
      editedPolicyId = null;
      view.fillRetentionPolicyForm(null);
    }

    // Revoking deletes no memory: items referencing it fall back to keep.
    view.setRetentionPolicyStatus(`Revoked ${retentionPolicyId}. Items that referenced it are kept, not deleted.`, 'active');
    await refreshRetentionPolicies();
  }

  /**
   * ADR 0118 O1. Records an appointment or reminder.
   *
   * Refuses an instant that has already passed. The core would accept it and
   * the scheduler would raise it immediately, which is defensible for an entry
   * that went stale while the Home was off - but a person typing a past time
   * into a form has almost certainly made a mistake, and silently firing it is
   * a worse answer than saying so.
   */
  async function recordTimeBoundEntry(): Promise<void> {
    const form = view.readTimeBoundEntryForm();

    if (form.title === '') {
      view.setTimeBoundEntryStatus('Say what the entry is.', 'error');
      return;
    }
    if (form.privacyDomain === '') {
      view.setTimeBoundEntryStatus('Name the privacy domain to record it in.', 'error');
      return;
    }
    if (form.dueAt === '' || Number.isNaN(Date.parse(form.dueAt))) {
      view.setTimeBoundEntryStatus('Give the date and time it is due.', 'error');
      return;
    }
    if (Date.parse(form.dueAt) <= Date.now()) {
      view.setTimeBoundEntryStatus('That instant has already passed.', 'error');
      return;
    }

    view.setTimeBoundEntryStatus('Recording...');

    try {
      await createTimeBoundEntry(state.baseUrl, foundationAccess(), {
        deviceId: 'pico-web',
        privacyDomain: form.privacyDomain,
        kind: form.kind,
        title: form.title,
        dueAt: form.dueAt,
      });
    } catch (error) {
      view.setTimeBoundEntryStatus(formatUnknownError(error), 'error');
      return;
    }

    view.clearTimeBoundEntryForm();
    view.setTimeBoundEntryStatus('Recorded. It works with no model and no network.');
    await refreshCurrentSnapshot();
  }

  async function shredDomain(): Promise<void> {
    const form = view.readShredForm();

    if (form.privacyDomain === '') {
      view.setShredStatus('Name the privacy domain to shred.', 'error');
      return;
    }

    if (form.confirm !== form.privacyDomain) {
      view.setShredStatus('The confirmation must repeat the domain exactly.', 'error');
      return;
    }

    view.setShredStatus(`Shredding ${form.privacyDomain}...`);

    let removedKeyVersions: number;

    try {
      ({ removedKeyVersions } = await shredPrivacyDomain(state.baseUrl, foundationAccess(), {
        privacyDomain: form.privacyDomain,
        confirm: form.confirm,
        ...(form.reason === '' ? {} : { reason: form.reason }),
      }));
    } catch (error) {
      view.setShredStatus(formatUnknownError(error), 'error');
      return;
    }

    view.clearShredForm();
    view.setShredStatus(
      `Shredded ${form.privacyDomain}: ${removedKeyVersions} key version(s) destroyed. Its content is unreadable for good, including in backups.`,
      'active',
    );
    await refreshCurrentSnapshot();
  }

  async function refreshCurrentSnapshot(): Promise<void> {
    const generation = connectionGeneration;
    state.foundationToken = view.getFoundationToken();

    try {
      await refreshSnapshot(generation);
    } catch (error) {
      if (generation !== connectionGeneration) {
        return;
      }

      state.httpStatus = 'error';
      state.errorMessage = formatUnknownError(error);
      view.render(state);
    }
  }

  async function refreshSnapshot(generation: number): Promise<boolean> {
    state.httpStatus = 'checking';
    state.errorMessage = null;
    view.render(state);

    const snapshot = await loadDashboardSnapshot(state.baseUrl, foundationAccess());

    if (generation !== connectionGeneration) {
      return false;
    }

    state.httpStatus = snapshot.health.ok ? 'connected' : 'error';
    state.systemStatus = snapshot.systemStatus;
    state.events = sortEventsAscending(snapshot.events).slice(-MAX_VISIBLE_EVENTS);
    state.eventHistory = snapshot.eventHistory;
    state.selectedEventId = keepSelectedEvent(state.events, state.selectedEventId);
    state.lastUpdatedAt = new Date();
    state.errorMessage = snapshot.health.ok ? null : 'Health endpoint returned ok=false.';
    view.render(state);
    return true;
  }

  async function openRealtime(baseUrl: string, generation: number): Promise<void> {
    try {
      const foundationToken = view.getFoundationToken();
      state.foundationToken = foundationToken;
      // A ticket carries the credential through the WebSocket handshake, which
      // cannot take headers. Without any credential the endpoint needs none.
      const realtimeTicket = foundationToken.trim() === '' && operatorSession === undefined
        ? undefined
        : await mintRealtimeTicket(baseUrl, foundationAccess());

      if (generation !== connectionGeneration) {
        return;
      }

      realtimeClient = connectRealtime({
        baseUrl,
        ticket: realtimeTicket,
        onOpen(): void {
          if (generation !== connectionGeneration) {
            return;
          }

          state.websocketStatus = 'connected';
          state.websocketRetryAt = null;
          realtimeReconnectAttempt = 0;
          state.lastUpdatedAt = new Date();
          view.render(state);
        },
        onClose(): void {
          if (generation !== connectionGeneration) {
            return;
          }

          realtimeClient = null;
          scheduleRealtimeReconnect(baseUrl, generation);
        },
        onError(_message: string): void {
          if (generation !== connectionGeneration) {
            return;
          }

          state.websocketStatus = 'error';
          view.render(state);
        },
        onMessage(message: RealtimeMessage): void {
          if (generation !== connectionGeneration) {
            return;
          }

          handleRealtimeMessage(message);
          state.lastUpdatedAt = new Date();
          view.render(state);
        },
      });
    } catch (error) {
      if (generation !== connectionGeneration) {
        return;
      }

      state.websocketStatus = 'error';
      state.errorMessage = formatUnknownError(error);
      view.render(state);
      scheduleRealtimeReconnect(baseUrl, generation);
    }
  }

  function scheduleRealtimeReconnect(baseUrl: string, generation: number): void {
    cancelRealtimeReconnect();

    if (generation !== connectionGeneration) {
      return;
    }

    const delay = REALTIME_RECONNECT_DELAYS_MS[Math.min(realtimeReconnectAttempt, REALTIME_RECONNECT_DELAYS_MS.length - 1)];
    realtimeReconnectAttempt += 1;
    state.websocketStatus = 'reconnecting';
    state.websocketRetryAt = new Date(Date.now() + delay);
    view.render(state);

    realtimeReconnectTimer = setTimeout(() => {
      if (generation !== connectionGeneration) {
        return;
      }

      realtimeReconnectTimer = null;
      state.websocketStatus = 'connecting';
      state.websocketRetryAt = null;
      view.render(state);
      void openRealtime(baseUrl, generation);
    }, delay);
  }

  function cancelRealtimeReconnect(): void {
    if (realtimeReconnectTimer !== null) {
      clearTimeout(realtimeReconnectTimer);
      realtimeReconnectTimer = null;
    }

    state.websocketRetryAt = null;
  }

  function handleRealtimeMessage(message: RealtimeMessage): void {
    if (message.type === realtimeMessageType.eventCreated) {
      const isNewEvent = !state.events.some((event) => event.eventId === message.event.eventId);
      state.events = upsertEvent(state.events, message.event).slice(-MAX_VISIBLE_EVENTS);
      state.eventHistory = updateEventHistoryAfterRealtimeEvent(state.eventHistory, isNewEvent);
      state.selectedEventId = keepSelectedEvent(state.events, state.selectedEventId);
    }
  }
}

function updateEventHistoryAfterRealtimeEvent(
  eventHistory: DashboardState['eventHistory'],
  isNewEvent: boolean,
): DashboardState['eventHistory'] {
  if (eventHistory === null || !isNewEvent) {
    return eventHistory;
  }

  return {
    ...eventHistory,
    loadedCount: eventHistory.loadedCount + 1,
  };
}

function upsertEvent(events: PicoEvent[], event: PicoEvent): PicoEvent[] {
  const byId = new Map<string, PicoEvent>();

  for (const existingEvent of events) {
    byId.set(existingEvent.eventId, existingEvent);
  }

  byId.set(event.eventId, event);
  return sortEventsAscending([...byId.values()]);
}

function sortEventsAscending(events: PicoEvent[]): PicoEvent[] {
  return [...events].sort((left, right) => (
    left.lamport - right.lamport
    || left.wallTime.localeCompare(right.wallTime)
    || left.eventId.localeCompare(right.eventId)
  ));
}

function keepSelectedEvent(events: PicoEvent[], selectedEventId: string | null): string | null {
  if (selectedEventId === null) {
    return null;
  }

  return events.some((event) => event.eventId === selectedEventId) ? selectedEventId : null;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

startDashboard(document);
