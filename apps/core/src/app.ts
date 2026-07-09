import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import {
  avatarIntensities,
  avatarModes,
  avatarStates,
  avatarStatusColors,
  foundationEventTypes,
  messageCreatedRoles,
  picoEventTypes,
  protocolCapabilities,
  realtimeMessageType,
  type PicoCoreConnectedMessage,
  type PicoEvent,
  type PicoEventCreatedMessage,
  type PicoEventCreateResponse,
  type PicoEventListResponse,
  type PicoEventType,
  type PicoHealthResponse,
  type PicoSystemStatusResponse,
  type PicoSystemVersionResponse,
} from '@pico/protocol';
import { LamportClock } from '@pico/sync';
import { EventFactory } from './event-factory.js';
import { EventStore, type EventCursor } from './event-store.js';
import { registerWebDashboard } from './static-web.js';
import { defaultWebRootPath, type CoreConfig } from './config.js';

const SERVICE_VERSION = '0.1.7';
const PROTOCOL_VERSION = '0.1.7';
const DEFAULT_EVENT_LIMIT = 100;
const MAX_EVENT_LIMIT = 500;
const MAX_TEXT_LENGTH = 8_000;
const MAX_PAYLOAD_BYTES = 32 * 1024;
const MAX_INCOMING_LAMPORT = 1_000_000_000;
const WEBSOCKET_KEEPALIVE_INTERVAL_MS = 30_000;

const writableEventTypes = new Set<PicoEventType>(foundationEventTypes);
const knownEventTypes = new Set<PicoEventType>(picoEventTypes);

const messageRoleSet = new Set<string>(messageCreatedRoles);
const avatarModeSet = new Set<string>(avatarModes);
const avatarStateSet = new Set<string>(avatarStates);
const avatarIntensitySet = new Set<string>(avatarIntensities);
const avatarStatusColorSet = new Set<string>(avatarStatusColors);

interface IncomingEventBody {
  deviceId?: unknown;
  sessionId?: unknown;
  type?: unknown;
  stream?: unknown;
  lamport?: unknown;
  payload?: unknown;
}

interface ValidatedIncomingEventBody {
  deviceId: string;
  sessionId?: string;
  type: PicoEventType;
  stream?: string;
  lamport?: number;
  payload: unknown;
}

interface RealtimeSocket {
  readyState: number;
  OPEN: number;
  isAlive?: boolean;
  send(payload: string): void;
  ping(): void;
  terminate(): void;
  on(event: 'close' | 'pong', listener: () => void): void;
}

export async function buildApp(config: CoreConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(websocket);
  registerWebDashboard(app, config.webRootPath ?? defaultWebRootPath());

  const store = new EventStore(config.databasePath);
  const clock = new LamportClock(store.maxLamport());
  const factory = new EventFactory(clock);
  const sockets = new Set<RealtimeSocket>();
  const websocketKeepalive = setInterval(() => {
    for (const socket of sockets) {
      if (socket.isAlive === false) {
        socket.terminate();
        sockets.delete(socket);
        continue;
      }

      socket.isAlive = false;

      if (socket.readyState === socket.OPEN) {
        socket.ping();
      }
    }
  }, WEBSOCKET_KEEPALIVE_INTERVAL_MS);

  websocketKeepalive.unref();

  app.addHook('onClose', async () => {
    clearInterval(websocketKeepalive);
    sockets.clear();
    store.close();
  });

  function broadcast(event: PicoEvent): void {
    const message: PicoEventCreatedMessage = { type: realtimeMessageType.eventCreated, event };
    const serialized = JSON.stringify(message);

    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(serialized);
      }
    }
  }

  app.get('/health', async (): Promise<PicoHealthResponse> => ({
    ok: true,
    service: 'pico-home-core',
    deviceId: config.deviceId,
  }));

  app.get('/api/system/version', async (): Promise<PicoSystemVersionResponse> => ({
    service: 'pico-home-core',
    version: SERVICE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
  }));

  app.get('/api/system/status', async (): Promise<PicoSystemStatusResponse> => ({
    service: 'pico-home-core',
    version: SERVICE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    deviceId: config.deviceId,
    capabilities: protocolCapabilities,
    picoHome: {
      claimState: {
        state: store.picoHomeClaimState().state,
      },
    },
    database: {
      maxLamport: store.maxLamport(),
      migrations: store.appliedMigrations(),
    },
  }));

  app.get('/api/events', async (request, reply) => {
    const query = request.query as { limit?: string; after?: string };
    const limitResult = parseLimit(query.limit);

    if (!limitResult.ok) {
      return reply.code(400).send({ error: limitResult.error });
    }

    const cursorResult = parseEventCursor(query.after);

    if (!cursorResult.ok) {
      return reply.code(400).send({ error: cursorResult.error });
    }

    const page = store.listPage({
      limit: limitResult.limit,
      after: cursorResult.cursor,
    });

    const response: PicoEventListResponse = {
      events: page.events,
      nextCursor: page.nextCursor === null ? null : encodeEventCursor(page.nextCursor),
      hasMore: page.hasMore,
    };

    return response;
  });

  app.get('/api/events/tail', async (request, reply) => {
    const query = request.query as { limit?: string };
    const limitResult = parseLimit(query.limit);

    if (!limitResult.ok) {
      return reply.code(400).send({ error: limitResult.error });
    }

    const page = store.listTail(limitResult.limit);
    const response: PicoEventListResponse = {
      events: page.events,
      nextCursor: null,
      hasMore: page.hasMore,
    };

    return response;
  });

  app.post('/api/events', async (request, reply) => {
    const body = request.body as IncomingEventBody | undefined;
    const validation = validateIncomingEvent(body);

    if (!validation.ok) {
      return reply.code(400).send({ error: validation.error });
    }

    const event = factory.create({
      deviceId: validation.body.deviceId,
      sessionId: validation.body.sessionId,
      type: validation.body.type,
      stream: validation.body.stream,
      payload: validation.body.payload,
      remoteLamport: validation.body.lamport,
    });

    const appendResult = store.append(event);

    if (appendResult === 'duplicate_conflict') {
      return reply.code(409).send({ error: 'Event id already exists with different payload.' });
    }

    if (appendResult === 'inserted') {
      broadcast(event);
    }

    const response: PicoEventCreateResponse = { event, appendResult };
    return reply.code(201).send(response);
  });

  app.get('/ws', {
    websocket: true,
    preValidation: async (request, reply) => {
      if (!isWebSocketOriginAllowed(request.headers.origin, request.headers.host, config.wsAllowedOrigins ?? [])) {
        return reply.code(403).send({ error: 'WebSocket origin is not allowed.' });
      }
    },
  }, (connection) => {
    const socket = connection as RealtimeSocket;
    socket.isAlive = true;
    sockets.add(socket);
    const message: PicoCoreConnectedMessage = { type: realtimeMessageType.coreConnected, deviceId: config.deviceId };
    socket.send(JSON.stringify(message));

    socket.on('pong', () => {
      socket.isAlive = true;
    });

    socket.on('close', () => {
      sockets.delete(socket);
    });
  });

  return app;
}

function parseLimit(rawLimit: string | undefined): { ok: true; limit: number } | { ok: false; error: string } {
  if (rawLimit === undefined) {
    return { ok: true, limit: DEFAULT_EVENT_LIMIT };
  }

  if (!/^[1-9]\d*$/.test(rawLimit)) {
    return { ok: false, error: 'limit must be a positive integer.' };
  }

  const limit = Number.parseInt(rawLimit, 10);

  return { ok: true, limit: Math.min(limit, MAX_EVENT_LIMIT) };
}

function parseEventCursor(rawCursor: string | undefined): { ok: true; cursor: EventCursor | null } | { ok: false; error: string } {
  if (rawCursor === undefined) {
    return { ok: true, cursor: null };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8')) as unknown;
  } catch {
    return { ok: false, error: 'after cursor is invalid.' };
  }

  if (!isEventCursor(parsed)) {
    return { ok: false, error: 'after cursor is invalid.' };
  }

  return { ok: true, cursor: parsed };
}

function encodeEventCursor(cursor: EventCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function isWebSocketOriginAllowed(originHeader: string | string[] | undefined, hostHeader: string | string[] | undefined, allowedOrigins: readonly string[]): boolean {
  if (originHeader === undefined) {
    return true;
  }

  if (typeof originHeader !== 'string') {
    return false;
  }

  const origin = parseHttpOrigin(originHeader);

  if (origin === null) {
    return false;
  }

  if (allowedOrigins.includes(origin.origin)) {
    return true;
  }

  const requestHost = parseHostHeader(hostHeader);

  return requestHost !== null && origin.host === requestHost;
}

function parseHttpOrigin(rawOrigin: string): { origin: string; host: string } | null {
  let url: URL;

  try {
    url = new URL(rawOrigin);
  } catch {
    return null;
  }

  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    return null;
  }

  return { origin: url.origin, host: url.host };
}

function parseHostHeader(hostHeader: string | string[] | undefined): string | null {
  if (typeof hostHeader !== 'string' || hostHeader.trim() === '') {
    return null;
  }

  let url: URL;

  try {
    url = new URL(`http://${hostHeader}`);
  } catch {
    return null;
  }

  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    return null;
  }

  return url.host;
}

function isEventCursor(value: unknown): value is EventCursor {
  return isRecord(value)
    && typeof value.eventId === 'string'
    && value.eventId.trim() !== ''
    && typeof value.wallTime === 'string'
    && value.wallTime.trim() !== ''
    && typeof value.lamport === 'number'
    && Number.isSafeInteger(value.lamport)
    && value.lamport >= 0;
}

function validateIncomingEvent(body: IncomingEventBody | undefined): { ok: true; body: ValidatedIncomingEventBody } | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: 'Request body must be an object.' };
  }

  if (!isNonEmptyString(body.deviceId, 128) || !isKnownEventType(body.type) || body.payload === undefined) {
    return { ok: false, error: 'deviceId, type and payload are required.' };
  }

  if (!writableEventTypes.has(body.type)) {
    return { ok: false, error: 'This event type is reserved for a later Pico Rules, Action Runner or Pico Home API.' };
  }

  if (body.sessionId !== undefined && !isNonEmptyString(body.sessionId, 128)) {
    return { ok: false, error: 'sessionId must be a non-empty string when provided.' };
  }

  if (body.stream !== undefined && !isNonEmptyString(body.stream, 256)) {
    return { ok: false, error: 'stream must be a non-empty string when provided.' };
  }

  if (body.lamport !== undefined) {
    if (typeof body.lamport !== 'number' || !Number.isInteger(body.lamport) || body.lamport < 0 || body.lamport > MAX_INCOMING_LAMPORT) {
      return { ok: false, error: 'lamport is outside the accepted range.' };
    }
  }

  const payloadSize = Buffer.byteLength(JSON.stringify(body.payload), 'utf8');
  if (payloadSize > MAX_PAYLOAD_BYTES) {
    return { ok: false, error: 'payload is too large.' };
  }

  const payloadError = validatePayload(body.type, body.payload);
  if (payloadError) {
    return { ok: false, error: payloadError };
  }

  return {
    ok: true,
    body: {
      deviceId: body.deviceId,
      sessionId: body.sessionId as string | undefined,
      type: body.type,
      stream: body.stream as string | undefined,
      lamport: body.lamport,
      payload: body.payload,
    },
  };
}

function validatePayload(type: PicoEventType, payload: unknown): string | null {
  if (!isRecord(payload)) {
    return 'payload must be an object.';
  }

  if (type === 'message.created') {
    if (!isStringMember(payload.role, messageRoleSet) || !isNonEmptyString(payload.text, MAX_TEXT_LENGTH)) {
      return 'message.created payload requires role and text.';
    }

    return null;
  }

  if (type === 'avatar.state_changed') {
    if (
      !isStringMember(payload.mode, avatarModeSet)
      || !isStringMember(payload.state, avatarStateSet)
      || !isStringMember(payload.intensity, avatarIntensitySet)
      || !isStringMember(payload.statusColor, avatarStatusColorSet)
    ) {
      return 'avatar.state_changed payload is invalid.';
    }

    if (payload.message !== undefined && !isNonEmptyString(payload.message, 1_000)) {
      return 'avatar.state_changed message must be a non-empty string when provided.';
    }

    return null;
  }

  return null;
}

function isKnownEventType(value: unknown): value is PicoEventType {
  return typeof value === 'string' && knownEventTypes.has(value as PicoEventType);
}

function isStringMember(value: unknown, allowedValues: Set<string>): value is string {
  return typeof value === 'string' && allowedValues.has(value);
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
