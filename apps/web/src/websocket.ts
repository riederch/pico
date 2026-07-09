import { realtimeMessageType } from '@pico/protocol';
import { buildEndpointUrl } from './api.js';
import type { RealtimeMessage } from './types.js';
import { isPicoEvent, isRecord } from './types.js';

export interface RealtimeClient {
  close(): void;
}

export interface RealtimeClientOptions {
  baseUrl: string;
  ticket?: string;
  onOpen(): void;
  onClose(): void;
  onError(message: string): void;
  onMessage(message: RealtimeMessage): void;
}

export function connectRealtime(options: RealtimeClientOptions): RealtimeClient {
  const socket = new WebSocket(buildWebSocketUrl(options.baseUrl, options.ticket));

  socket.addEventListener('open', () => {
    options.onOpen();
  });

  socket.addEventListener('close', () => {
    options.onClose();
  });

  socket.addEventListener('error', () => {
    options.onError('WebSocket connection failed.');
  });

  socket.addEventListener('message', (event: MessageEvent<unknown>) => {
    const message = parseRealtimeMessage(event.data);

    if (message !== null) {
      options.onMessage(message);
    }
  });

  return {
    close(): void {
      socket.close();
    },
  };
}

function buildWebSocketUrl(baseUrl: string, ticket: string | undefined): string {
  const url = buildEndpointUrl(baseUrl, '/ws');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

  if (ticket !== undefined && ticket !== '') {
    url.searchParams.set('ticket', ticket);
  }

  return url.toString();
}

function parseRealtimeMessage(data: unknown): RealtimeMessage | null {
  if (typeof data !== 'string') {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.type !== 'string') {
    return null;
  }

  if (parsed.type === realtimeMessageType.coreConnected && typeof parsed.deviceId === 'string') {
    return {
      type: parsed.type,
      deviceId: parsed.deviceId,
    };
  }

  if (parsed.type === realtimeMessageType.eventCreated && isPicoEvent(parsed.event)) {
    return {
      type: parsed.type,
      event: parsed.event,
    };
  }

  return null;
}
