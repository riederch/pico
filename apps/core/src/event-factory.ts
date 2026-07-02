import { randomUUID } from 'node:crypto';
import type { PicoEvent, PicoEventType } from '@pico/protocol';
import { LamportClock } from '@pico/sync';

export interface CreateEventInput<TPayload> {
  deviceId: string;
  sessionId?: string;
  type: PicoEventType;
  stream?: string;
  payload: TPayload;
  remoteLamport?: number;
}

export class EventFactory {
  public constructor(private readonly clock: LamportClock) {}

  public create<TPayload>(input: CreateEventInput<TPayload>): PicoEvent<TPayload> {
    const lamport = input.remoteLamport === undefined
      ? this.clock.tick()
      : this.clock.receive(input.remoteLamport);

    return {
      eventId: randomUUID(),
      deviceId: input.deviceId,
      sessionId: input.sessionId,
      lamport,
      wallTime: new Date().toISOString(),
      type: input.type,
      stream: input.stream ?? (input.sessionId ? `session:${input.sessionId}` : `device:${input.deviceId}`),
      payload: input.payload,
    };
  }
}
