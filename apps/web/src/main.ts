import { realtimeMessageType } from '@pico/protocol';
import { defaultPicoHomeUrl, loadDashboardSnapshot, normalizePicoHomeUrl } from './api.js';
import { createDashboardView } from './render.js';
import type { DashboardState, EventFilters, PicoEvent, RealtimeMessage } from './types.js';
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

  view.setBaseUrl(state.baseUrl);
  view.render(state);

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
      const snapshotLoaded = await refreshSnapshot(generation);

      if (generation !== connectionGeneration) {
        return;
      }

      if (!snapshotLoaded) {
        return;
      }

      openRealtime(baseUrl, generation);
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

  async function refreshCurrentSnapshot(): Promise<void> {
    const generation = connectionGeneration;

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

    const snapshot = await loadDashboardSnapshot(state.baseUrl);

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

  function openRealtime(baseUrl: string, generation: number): void {
    try {
      realtimeClient = connectRealtime({
        baseUrl,
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
      openRealtime(baseUrl, generation);
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
