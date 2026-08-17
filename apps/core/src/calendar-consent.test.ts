import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';

/**
 * ADR 0118 O1 with ADR 0139 AC4 - the appointment that never arrived.
 *
 * **Found by booting a Home with a due reminder in it.** Nobody had ever
 * recorded consent for `calendar.raise-entry`, because consent was written
 * only as a module crossed from off to on and ADR 0127 M3 ships modules on.
 * An unconsented effect makes `decidePicoAction` throw; the scheduler catches
 * every throw as a transient failure and tries again next tick. So every Home
 * manufactured an exception per due appointment per tick, announced nothing,
 * and said nothing about it - which is precisely the outcome the scheduler's
 * own comment says the family exists to prevent.
 *
 * The first fix was worse than the defect and this file is why it did not
 * ship: returning quietly instead of throwing reads to the scheduler as
 * *announced*, so it marked the entry, and an entry the Home believes it
 * handled is never retried. That would have turned "not agreed to yet" into
 * an appointment lost for good, surviving the person's later agreement.
 */
const dirs: string[] = [];
const apps: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close();
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function homeWithADueReminder(): Promise<{ databasePath: string; lines: string[] }> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-calendar-consent-'));
  dirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');

  const seed = await EventStore.open(databasePath, {});
  seed.memory().create({
    memoryItemId: 'mem_dentist_0001',
    privacyDomain: 'private',
    owner: 'person',
    controller: 'person',
    contentType: 'application/vnd.pico.reminder',
    content: 'Call the dentist',
  } as never);
  seed.setPicoTimeBoundEntryDue({
    memoryItemId: 'mem_dentist_0001',
    dueAt: new Date(Date.now() - 60_000).toISOString(),
  });
  seed.close();

  return { databasePath, lines: [] };
}

async function boot(databasePath: string, lines: string[]): Promise<void> {
  const app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath,
    deviceId: 'pico-core',
    logDestination: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString('utf8'));
        callback();
      },
    }),
  } as never) as unknown as { close(): Promise<void> };
  apps.push(app);
  // The scheduler arms at boot, and a reminder already due fires immediately.
  await new Promise((resolve) => setTimeout(resolve, 1_500));
}

const unannouncedIn = async (databasePath: string): Promise<number> => {
  const store = await EventStore.open(databasePath, {});
  const count = store.picoUnannouncedTimeBoundEntries().length;
  store.close();
  return count;
};

describe('ADR 0139 AC4 - an appointment nobody agreed to announce', () => {
  it('is not announced, is not marked, and says why once', async () => {
    const { databasePath, lines } = await homeWithADueReminder();
    await boot(databasePath, lines);

    /**
     * **Still waiting is the whole assertion.** Marked-but-never-announced
     * and announced are indistinguishable from the outside afterwards, and
     * only one of them is a person being told about their dentist.
     */
    expect(await unannouncedIn(databasePath)).toBe(1);

    const said = lines.filter((line) => line.includes('not being announced'));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('agreed');
  });

  it('arrives the moment the person agrees, without losing the appointment', async () => {
    const { databasePath, lines } = await homeWithADueReminder();
    await boot(databasePath, lines);
    expect(await unannouncedIn(databasePath)).toBe(1);

    const agreeing = await EventStore.open(databasePath, {});
    agreeing.setPicoModuleActivation({
      changes: [{
        identifier: 'calendar',
        active: true,
        effects: [{
          name: 'calendar.raise-entry',
          description: 'Tells you an appointment is due.',
          risk: 'local_write',
        }] as never,
      }],
      decidedAt: new Date().toISOString(),
    });
    agreeing.close();

    // No restart and no second reminder: the same entry, still due, now
    // allowed. This is what being left unannounced bought.
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(await unannouncedIn(databasePath)).toBe(0);
  });
});
