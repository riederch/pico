import { describe, expect, it } from 'vitest';
import { LamportClock } from '@pico/sync';
import type { CreateEventInput } from './event-factory.js';
import { EventFactory } from './event-factory.js';

describe('EventFactory', () => {
  it('creates events with a device stream when no session is provided', () => {
    const clock = new LamportClock();
    const factory = new EventFactory(clock);

    const event = factory.create({
      deviceId: 'device-1',
      type: 'device.seen',
      payload: { status: 'online' },
    });

    expect(event.eventId).toEqual(expect.any(String));
    expect(event.deviceId).toBe('device-1');
    expect(event.sessionId).toBeUndefined();
    expect(event.lamport).toBe(1);
    expect(Date.parse(event.wallTime)).not.toBeNaN();
    expect(event.type).toBe('device.seen');
    expect(event.stream).toBe('device:device-1');
    expect(event.payload).toEqual({ status: 'online' });
    expect(clock.current()).toBe(1);
  });

  it('carries an explicit payload posture and omits it when absent', () => {
    const factory = new EventFactory(new LamportClock());

    const withPosture = factory.create({
      deviceId: 'device-1',
      type: 'device.seen',
      payload: { status: 'online' },
      payloadPosture: 'inline_operational',
    });
    expect(withPosture.payloadPosture).toBe('inline_operational');

    const withoutPosture = factory.create({
      deviceId: 'device-1',
      type: 'device.seen',
      payload: { status: 'online' },
    });
    expect(withoutPosture.payloadPosture).toBeUndefined();
    expect('payloadPosture' in withoutPosture).toBe(false);
  });

  it('creates events with a session stream when a session is provided', () => {
    const factory = new EventFactory(new LamportClock());

    const event = factory.create({
      deviceId: 'device-1',
      sessionId: 'session-1',
      type: 'message.created',
      payload: {
        role: 'user',
        text: 'Hallo Pico',
      },
    });

    expect(event.sessionId).toBe('session-1');
    expect(event.stream).toBe('session:session-1');
  });

  it('uses explicit streams and advances from remote Lamport values', () => {
    const clock = new LamportClock();
    const factory = new EventFactory(clock);

    const event = factory.create({
      deviceId: 'device-1',
      sessionId: 'session-1',
      type: 'message.created',
      stream: 'custom:stream',
      remoteLamport: 41,
      payload: {
        role: 'user',
        text: 'Hallo Pico',
      },
    });

    expect(event.lamport).toBe(42);
    expect(event.stream).toBe('custom:stream');
    expect(clock.current()).toBe(42);
  });

  it('rejects invalid input before advancing the Lamport clock', () => {
    const invalidInputs: Array<[Record<string, unknown>, string]> = [
      [{ deviceId: '   ' }, 'Event deviceId must be a non-empty string.'],
      [{ sessionId: '   ' }, 'Event sessionId must be a non-empty string.'],
      [{ type: '   ' }, 'Event type must be a non-empty string.'],
      [{ stream: '   ' }, 'Event stream must be a non-empty string.'],
      [{ payload: undefined }, 'Event payload is required.'],
    ];

    for (const [overrides, error] of invalidInputs) {
      const clock = new LamportClock();
      const factory = new EventFactory(clock);
      const input = {
        deviceId: 'device-1',
        type: 'device.seen',
        payload: { status: 'online' },
        ...overrides,
      } as CreateEventInput<unknown>;

      expect(() => factory.create(input)).toThrow(error);
      expect(clock.current()).toBe(0);
    }
  });
});
