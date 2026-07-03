import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { PicoEvent, PicoEventType } from '@pico/protocol';
import { LamportClock } from '@pico/sync';
import { EventFactory } from './event-factory.js';
import { EventStore } from './event-store.js';
import type { CoreConfig } from './config.js';

const DEFAULT_EVENT_LIMIT = 100;
const MAX_EVENT_LIMIT = 500;
const MAX_TEXT_LENGTH = 8_000;
const MAX_PAYLOAD_BYTES = 32 * 1024;
const MAX_LAMPORT_VALUE = 1_000_000_000;

const writableEventTypes = new Set<PicoEventType>([
  'device.registered',
  'device.seen',
  'session.created',
  'message.created',
  'avatar.state_changed',
]);

const knownEventTypes = new Set<PicoEventType>([
  'device.registered',
  'device.seen',
  'session.created',
  'message.created',
  'avatar.state_changed',
  'tool.call_requested',
  'tool.call_completed',
  'policy.decision_created',
  'confirmation.requested',
  'confirmation.resolved',
  'executor.action_started',
  'executor.action_completed',
  'audit.event_created',
]);

const messageRoles = new Set(['user', 'assistant', 'system', 'tool']);
const avatarModes = new Set(['everyday', 'technical', 'wwg', 'firefighter', 'security', 'organization', 'smart_home']);
const avatarStates = new Set(['idle', 'listening', 'thinking', 'working', 'unsure', 'warning', 'confirmation_required', 'blocked', 'success', 'sleeping']);
const avatarIntensities = new Set(['low', 'normal', 'high']);
const avatarStatusColors = new Set(['neutral', 'blue', 'green', 'yellow', 'red', 'violet']);

interface IncomingEventBody {
  deviceId?: unknown;
  sessionId?: unknown;
  type?: unknown;
  stream?: unknown;
  lamport?: unknown;
  payload?: unknown;
}

interface RealtimeSocket {
  readyState: number;
  OPEN: number;
  send(payload: string): void;
  on(event: 'close', listener: () => void): void;
}

export async function buildApp(config: CoreConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(websocket);

  const store = new EventStore(config.databasePath);
  const clock = new LamportClock(store.maxLamport());
  const factory = new EventFactory(clock);
  const sockets = new Set<RealtimeSocket>();

  function broadcast(event: PicoEvent): void {
    const serialized = JSON.stringify({ type: 'pico.event.created', event });

    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(serialized);
      }
    }
  }

  app.get('/health', async () => ({
    ok: true,
    service: 'pico-core',
    deviceId: config.deviceId,
  }));

  app.get('/api/events', async (request, reply) => {
    const query = request.query as { limit?: string };
    const limitResult = parseLimit(query.limit);

    if (!limitResult.ok) {
      return reply.code(400).send({ error: limitResult.error });
    }

    return {
      events: store.list(limitResult.limit),
    };
  });

  app.post('/api/events', async (request, reply) => {
    const body = request.body as IncomingEventBody | undefined;
    const validationError = validateIncomingEvent(body);

    if (validationError) {
      return reply.code(400).send({ error: validationError });
    }

    const event = factory.create({
      deviceId: body.deviceId,
      sessionId: body.sessionId,
      type: body.type,
      stream: body.stream,
      payload: body.payload,
      remoteLamport: body.lamport,
    });

    const appendResult = store.append(event);

    if (appendResult === 'duplicate_conflict') {
      return reply.code(409).send({ error: 'Event id already exists with different payload.' });
    }

    if (appendResult === 'inserted') {
      broadcast(event);
    }

    return reply.code(201).send({ event, appendResult });
  });

  app.get('/ws', { websocket: true }, (connection) => {
    const socket = connection as RealtimeSocket;
    sockets.add(socket);
    socket.send(JSON.stringify({ type: 'pico.core.connected', deviceId: config.deviceId }));

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

  const limit = Number.parseInt(rawLimit, 10);

  if (!Number.isInteger(limit) || limit <= 0) {
    return { ok: false, error: 'limit must be a positive integer.' };
  }

  return { ok: true, limit: Math.min(limit, MAX_EVENT_LIMIT) };
}

function validateIncomingEvent(body: IncomingEventBody | undefined): string | null {
  if (!isRecord(body)) {
    return 'Request body must be an object.';
  }

  if (!isNonEmptyString(body.deviceId, 128) || !isKnownEventType(body.type) || body.payload === undefined) {
    return 'deviceId, type and payload are required.';
  }

  if (!writableEventTypes.has(body.type)) {
    return 'This event type is reserved for a later policy-gated API.';
  }

  if (body.sessionId !== undefined && !isNonEmptyString(body.sessionId, 128)) {
    return 'sessionId must be a non-empty string when provided.';
  }

  if (body.stream !== undefined && !isNonEmptyString(body.stream, 256)) {
    return 'stream must be a non-empty string when provided.';
  }

  if (body.lamport !== undefined && (!Number.isInteger(body.lamport) || body.lamport < 0 || body.lamport > MAX_LAMPORT_VALUE)) {
    return 'lamport is outside the accepted range.';
  }

  const payloadSize = Buffer.byteLength(JSON.stringify(body.payload), 'utf8');
  if (payloadSize > MAX_PAYLOAD_BYTES) {
    return 'payload is too large.';
  }

  return validatePayload(body.type, body.payload);
}

function validatePayload(type: PicoEventType, payload: unknown): string | null {
  if (!isRecord(payload)) {
    return 'payload must be an object.';
  }

  if (type === 'message.created') {
    if (!isStringMember(payload.role, messageRoles) || !isNonEmptyString(payload.text, MAX_TEXT_LENGTH)) {
      return 'message.created payload requires role and text.';
    }

    return null;
  }

  if (type === 'avatar.state_changed') {
    if (
      !isStringMember(payload.mode, avatarModes)
      || !isStringMember(payload.state, avatarStates)
      || !isStringMember(payload.intensity, avatarIntensities)
      || !isStringMember(payload.statusColor, avatarStatusColors)
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
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
