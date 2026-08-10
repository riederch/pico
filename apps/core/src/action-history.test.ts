import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EventStore, picoActionHistoryFactTypes } from './event-store.js';
import { EventFactory } from './event-factory.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function openStore() {
  const dir = mkdtempSync(join(tmpdir(), 'pico-action-history-'));
  dirs.push(dir);
  return new EventStore(join(dir, 'pico.sqlite'));
}

const clock = { tick: (() => { let n = 0; return () => { n += 1; return n; }; })(), receive: (v: number) => v };

function record(store: EventStore, type: string, payload: Record<string, unknown>) {
  const factory = new EventFactory(clock as never);
  const event = factory.create({ deviceId: 'test-core', type: type as never, payload });
  store.append(event);
  return event.eventId;
}

/**
 * ADR 0141 RN5. Action History is a view over the event log and the ADR 0121
 * chain - not a store, and not an event type announcing that an event
 * happened.
 */
describe('ADR 0141 RN5 - history is a view', () => {
  it('reads the action facts back out of the ordinary event log', () => {
    const store = openStore();
    const requested = record(store, 'action.requested', {
      actionName: 'calendar.raise-entry',
      risk: 'local_write',
      input: {},
    });
    record(store, 'pico_rules.decision_created', {
      requestedEventId: requested,
      decision: 'allow',
      reason: 'allow',
      dataSpace: 'private',
    });

    const history = store.picoActionHistory();
    expect(history.map((entry) => entry.type))
      .toEqual(['pico_rules.decision_created', 'action.requested']);
    expect(history[1]?.payload.actionName).toBe('calendar.raise-entry');
    store.close();
  });

  it('leaves ordinary events out', () => {
    const store = openStore();
    record(store, 'memory.time_bound_entry_due', { memoryItemId: 'item_1', dueAt: 'x' });
    expect(store.picoActionHistory()).toEqual([]);
    store.close();
  });

  it('reports whether a fact is chained rather than assuming it', () => {
    // A gap is the whole point of the chain; a history that quietly dropped
    // unchained rows would be the one place tampering would not show.
    const store = openStore();
    record(store, 'action.requested', { actionName: 'x', risk: 'read_only', input: {} });
    const [entry] = store.picoActionHistory();
    expect(entry).toHaveProperty('chained');
    expect(typeof entry?.chained).toBe('boolean');
    store.close();
  });

  it('bounds what it returns and refuses a nonsense bound', () => {
    const store = openStore();
    for (let index = 0; index < 5; index += 1) {
      record(store, 'action.requested', { actionName: `a${index}`, risk: 'read_only', input: {} });
    }
    expect(store.picoActionHistory({ limit: 2 })).toHaveLength(2);
    expect(() => store.picoActionHistory({ limit: 0 }))
      .toThrow('invalid_pico_action_history_limit');
    store.close();
  });

  it('names the six facts it reads', () => {
    expect(picoActionHistoryFactTypes).toEqual([
      'action.requested',
      'pico_rules.decision_created',
      'approval.requested',
      'approval.resolved',
      'action_runner.action_started',
      'action_runner.action_completed',
    ]);
  });
});
