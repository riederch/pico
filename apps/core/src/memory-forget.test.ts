import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { picoRecallJob } from './recall.js';
import {
  keyRecordFingerprintHex,
  openPicoHomeWithDevice,
  sendPicoLinkDirectRequest,
} from './test-claimed-home.js';

/**
 * ADR 0071 with ADR 0116 W5 - a person unmaking a memory they made.
 *
 * **The half of deletion that had no surface.** A retention policy deletes by
 * age and a domain shred takes everything; deleting one thing had no path at
 * all, and `store:check` found it as `MemoryStore.deleteInDomain` having no
 * caller outside its own tests.
 *
 * The user chose where it happens: from what they kept, on the line where they
 * kept it, rather than from a browser over their memory. So the job now records
 * what its answer became - the identifier was minted at keep time, handed back
 * once and kept by nobody, which is why a day later there was no way to name
 * the thing again.
 *
 * The kept state is built through `markKept`, which is what `home.recall.keep`
 * calls. Driving a real recall would need a decided provider and a model that
 * answers, and neither is the subject: what is under test is taking it back.
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

interface AppUnderTest {
  inject(request: { method: string; url: string }): Promise<{ json(): unknown }>;
  close(): Promise<void>;
}

const memoryItemId = 'mem_recall_0001';
const jobId = 'job_recall_0001';
const privacyDomain = 'domain-private';
const sentence = 'Bergstrasse, bay 114.';

async function homeWithAKeptAnswer(options: { kept?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pico-memory-forget-'));
  dirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  const logLines: string[] = [];
  const app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath,
    deviceId: 'pico-core',
    logDestination: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        logLines.push(chunk.toString('utf8'));
        callback();
      },
    }),
  } as never) as unknown as AppUnderTest;
  apps.push(app);

  const moveInCode = logLines
    .map((line) => JSON.parse(line) as { picoHomeMoveInCode?: string })
    .find((line) => typeof line.picoHomeMoveInCode === 'string')!.picoHomeMoveInCode!;
  const setup = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as {
    host: { signingKeyFingerprintHex: string; keyAgreementPublicKeyHex: string };
  };
  const { device, sealedClaim } = await openPicoHomeWithDevice(app as never, {
    moveInCode,
    idSuffix: 'memory_forget',
  });
  const person = keyRecordFingerprintHex(sealedClaim.claimantIdentityKeyRecord);
  const send = async (operation: string, args: Record<string, unknown>) =>
    await sendPicoLinkDirectRequest(app as never, {
      operation: operation as never,
      args,
      sender: device,
      identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
      hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
      hostKeyAgreementPublicKeyHex: setup.host.keyAgreementPublicKeyHex,
    });

  const writing = await EventStore.open(databasePath, {});
  writing.memory().create({
    memoryItemId,
    privacyDomain,
    owner: `pico:identity:${person}`,
    controller: `pico:identity:${person}`,
    contentType: 'text/plain',
    content: sentence,
  } as never);
  const queue = writing.picoModelJobQueue();
  // Built through the same constructor `home.recall.ask` uses, because the
  // queue parses what it is handed - a hand-shaped job is refused, correctly.
  queue.enqueue({
    job: picoRecallJob({
      jobId,
      question: 'where did I park?',
      items: [{
        memoryItemId,
        content: sentence,
        origin: 'own_pico',
      }] as never,
      nowMs: Date.parse('2026-08-17T10:00:00.000Z'),
    }),
    picoIdentityFingerprintHex: person,
    entryId: 'an-entry',
    at: '2026-08-17T10:00:00.000Z',
    // The kind is not a detail: the queue defaults to `library_read` and
    // refuses one without its derivation, which is ADR 0136 BR6 arriving a
    // step before the keep would have caught it.
    kind: 'recall',
    recallContext: { privacyDomain, memoryItemIds: [memoryItemId] },
  } as never);
  queue.settle({
    jobId,
    outcome: 'answered',
    result: { values: { answer: sentence } },
    at: '2026-08-17T10:00:05.000Z',
  });
  if (options.kept !== false) {
    queue.markKept({ jobId, memoryItemId, privacyDomain });
  }
  writing.close();

  return { app, databasePath, send, person };
}

const itemIn = async (databasePath: string) => {
  const store = await EventStore.open(databasePath, {});
  const item = store.memory().getInDomain(memoryItemId, privacyDomain);
  store.close();
  return item;
};

describe('ADR 0116 W5 - a kept answer says what it became', () => {
  it('carries the memory item on the line, and stops carrying it once forgotten', async () => {
    const { send } = await homeWithAKeptAnswer();

    const before = (await send('home.recall.read', {})).result as unknown as {
      recalls: Array<{ jobId: string; keptAs?: { memoryItemId: string } }>;
    };
    expect(before.recalls[0]).toMatchObject({
      jobId,
      keptAs: { memoryItemId, privacyDomain },
    });

    expect((await send('home.memory.forget', { memoryItemId })).result)
      .toEqual({ forgotten: true });

    const after = (await send('home.recall.read', {})).result as unknown as {
      recalls: Array<{ jobId: string; keptAs?: unknown; outcome?: string }>;
    };
    /**
     * The answer stays and the memory goes. What was taken back is the memory,
     * not the record that an answer was once given - and the line then offers
     * to keep it again, which is the honest state: they have one and did not
     * keep it.
     */
    expect(after.recalls[0]?.outcome).toBe('answered');
    expect(after.recalls[0]).not.toHaveProperty('keptAs');
  });

  it('says nothing about keeping when nothing was kept', async () => {
    // ADR 0117 X1. Absent rather than a null: not kept and kept-then-forgotten
    // are the same state here, and both are "there is nothing to take back".
    const { send } = await homeWithAKeptAnswer({ kept: false });
    const read = (await send('home.recall.read', {})).result as unknown as {
      recalls: Array<Record<string, unknown>>;
    };
    expect(read.recalls[0]).not.toHaveProperty('keptAs');
  });
});

describe('ADR 0071 - forgetting takes the sentence and leaves the record', () => {
  it('nulls the content and marks it deleted', async () => {
    const { databasePath, send } = await homeWithAKeptAnswer();
    expect((await itemIn(databasePath))?.content).toBe(sentence);

    await send('home.memory.forget', { memoryItemId });

    const item = await itemIn(databasePath);
    /**
     * **Terminal, not merely deleted.** `deleteInDomain` sets `deleted` and
     * nulls the content; appending the tombstone projects it straight to
     * `tombstoned`, which is the state ADR 0070's boot reconcile enforces. The
     * order matters and is the reason both steps are there: `tombstone`
     * refuses an item that was not deleted first, so the event alone would
     * record a deletion that never happened.
     */
    expect(item?.deletionState).toBe('tombstoned');
    expect(item?.content ?? null).toBeNull();
  });

  it('appends the tombstone, so a restore cannot resurrect it', async () => {
    /**
     * ADR 0070. Deleting is a projection; the append-only record is what makes
     * it durable, because the reconcile re-applies recorded deletions at boot.
     * Without the event a backup would return the sentence somebody deleted.
     */
    const { app, send } = await homeWithAKeptAnswer();
    await send('home.memory.forget', { memoryItemId });

    const events = (await app.inject({
      method: 'GET',
      url: '/api/events/tail?limit=40',
    })).json() as { events: Array<{ type: string; payload: Record<string, unknown> }> };
    const tombstones = events.events.filter((event) => event.type === 'memory.tombstone');
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]?.payload).toEqual({
      memoryItemId,
      privacyDomain,
      reason: 'forgotten_by_person',
    });
    // Content-free, like every record in this family: what was deleted, never
    // what it said.
    expect(JSON.stringify(tombstones[0])).not.toContain('Bergstrasse');
  });

  it('ignores a domain the caller sends, and uses the one on the row', async () => {
    /**
     * The domain is not the caller's to name. Taking it from the request would
     * let somebody go looking in a domain by guessing - and the row already
     * knows, because keeping wrote it there. Sent here as a wrong one, which is
     * the shape a mistake and an attempt both have.
     */
    const { databasePath, send } = await homeWithAKeptAnswer();
    expect((await send('home.memory.forget', {
      memoryItemId,
      privacyDomain: 'domain-somewhere-else',
    })).result).toEqual({ forgotten: true });

    const item = await itemIn(databasePath);
    expect(item?.deletionState).toBe('tombstoned');
  });

  it('refuses a second forget rather than reporting success twice', async () => {
    const { send } = await homeWithAKeptAnswer();
    expect((await send('home.memory.forget', { memoryItemId })).result)
      .toEqual({ forgotten: true });
    const again = await send('home.memory.forget', { memoryItemId });
    // The job stopped naming it, so it is no longer theirs to take back.
    expect(again.result.refusal).toBe('not_kept_by_you');
  });
});

describe('ADR 0077 C4 - the refusal is not an inventory', () => {
  it('answers the same way for an item that exists and one that never did', async () => {
    /**
     * Naming any memory item and being told whether it exists would make this
     * a probe over somebody's memory. The item is reached through the job
     * holding it, scoped to the asking identity, so an item that exists but
     * this person did not keep is refused exactly like an invented one.
     */
    const { databasePath, send } = await homeWithAKeptAnswer({ kept: false });
    const writing = await EventStore.open(databasePath, {});
    writing.memory().create({
      memoryItemId: 'mem_somebody_elses',
      privacyDomain: 'domain-other',
      owner: 'somebody-else',
      controller: 'somebody-else',
      contentType: 'text/plain',
      content: 'Not theirs to take back.',
    } as never);
    writing.close();

    const real = await send('home.memory.forget', { memoryItemId: 'mem_somebody_elses' });
    const invented = await send('home.memory.forget', { memoryItemId: 'mem_never_existed' });
    expect(real.result).toEqual(invented.result);
    expect(real.result.refusal).toBe('not_kept_by_you');

    const store = await EventStore.open(databasePath, {});
    const untouched = store.memory().getInDomain('mem_somebody_elses', 'domain-other');
    store.close();
    expect(untouched?.deletionState).toBe('active');
  });
});
