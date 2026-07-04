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
    assertCreateEventInput(input);

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

function assertCreateEventInput(input: CreateEventInput<unknown>): void {
  assertNonEmptyString(input.deviceId, 'deviceId');

  if (input.sessionId !== undefined) {
    assertNonEmptyString(input.sessionId, 'sessionId');
  }

  assertNonEmptyString(input.type, 'type');

  if (input.stream !== undefined) {
    assertNonEmptyString(input.stream, 'stream');
  }

  if (input.payload === undefined) {
    throw new Error('Event payload is required.');
  }
}

function assertNonEmptyString(value: unknown, label: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Event ${label} must be a non-empty string.`);
  }
}
