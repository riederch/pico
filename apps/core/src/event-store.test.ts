import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';

const tempDirs: string[] = [];

function createDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-event-store-test-'));
  tempDirs.push(dir);
  return join(dir, 'pico.sqlite');
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('EventStore', () => {
  it('closes the SQLite connection idempotently', () => {
    const store = new EventStore(createDatabasePath());

    expect(store.maxLamport()).toBe(0);

    store.close();
    expect(() => store.close()).not.toThrow();
    expect(() => store.maxLamport()).toThrow('EventStore is closed.');
  });
});
