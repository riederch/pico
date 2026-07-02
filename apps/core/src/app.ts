import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { PicoEvent, PicoEventType } from '@pico/protocol';
import { LamportClock } from '@pico/sync';
import { EventFactory } from './event-factory.js';
import { EventStore } from './event-store.js';
import type { CoreConfig } from './config.js';

interface IncomingEventBody {
  deviceId?: string;
  sessionId?: string;
  type?: PicoEventType;
  stream?: string;
  lamport?: number;
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

  app.get('/api/events', async (request) => {
    const query = request.query as { limit?: string };
    const limit = query.limit ? Number.parseInt(query.limit, 10) : 100;

    return {
      events: store.list(Number.isFinite(limit) ? limit : 100),
    };
  });

  app.post('/api/events', async (request, reply) => {
    const body = request.body as IncomingEventBody;

    if (!body.deviceId || !body.type || body.payload === undefined) {
      return reply.code(400).send({
        error: 'deviceId, type and payload are required.',
      });
    }

    const event = factory.create({
      deviceId: body.deviceId,
      sessionId: body.sessionId,
      type: body.type,
      stream: body.stream,
      payload: body.payload,
      remoteLamport: body.lamport,
    });

    store.append(event);
    broadcast(event);

    return reply.code(201).send({ event });
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
