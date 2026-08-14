import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';
import { PicoModelJobQueue } from './model-job-queue.js';
import {
  enqueuePicoDepotLibraryReads,
  pickPicoDepotIntakeEntry,
  maxPicoDepotLibraryReadsPerAttachment,
  picoDepotLibraryReadPlan,
} from './depot-library-intake.js';

/**
 * ADR 0143 DP1 with ADR 0136 BR3. Attaching a library is the occasion.
 */
const dirs: string[] = [];
const nowMs = Date.parse('2026-08-14T12:00:00.000Z');

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function queue(): Promise<{ queue: PicoModelJobQueue; close: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-intake-'));
  dirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  (await EventStore.open(databasePath, {})).close();
  const db = new Database(databasePath);
  return { queue: new PicoModelJobQueue(db), close: () => { db.close(); } };
}

function intake(q: PicoModelJobQueue, readExcerpt: (path: string) => Promise<{
  text: string;
  commit: string;
} | null>) {
  return {
    readExcerpt,
    queue: q,
    jobId: (path: string) => `job_${path.replace(/[^a-z0-9]/gu, '_')}`,
    nowMs: () => nowMs,
    at: () => '2026-08-14T12:00:00.000Z',
  };
}

const question = 'What is this document about?';
const expects = [{ name: 'topic', type: 'token' }, { name: 'summary', type: 'text' }];

describe('ADR 0119 Q5 - an attachment does not become unbounded work', () => {
  it('caps the plan and says how many it left out', () => {
    const paths = Array.from({ length: 250 }, (_, index) => `notes/${String(index).padStart(4, '0')}.md`);
    const plan = picoDepotLibraryReadPlan({ paths });
    expect(plan.paths).toHaveLength(maxPicoDepotLibraryReadsPerAttachment);
    // A bound that silently dropped the rest would report the same success as
    // one that read everything.
    expect(plan.omitted).toBe(50);
  });

  it('plans the same corpus the same way twice', () => {
    // A plan that depended on the filesystem's mood would make "did this
    // already run?" unanswerable.
    const paths = ['b.md', 'a.md', 'c.md'];
    expect(picoDepotLibraryReadPlan({ paths }).paths).toEqual(['a.md', 'b.md', 'c.md']);
    expect(picoDepotLibraryReadPlan({ paths: [...paths].reverse() }).paths)
      .toEqual(['a.md', 'b.md', 'c.md']);
  });
});

describe('ADR 0136 BR2 - the core lists and the supplier reads', () => {
  it('queues one job per file, from excerpts that crossed the slot', async () => {
    const { queue: q, close } = await queue();
    try {
      const asked: string[] = [];
      const report = await enqueuePicoDepotLibraryReads(
        intake(q, async (path) => {
          asked.push(path);
          return { text: `contents of ${path}`, commit: 'a'.repeat(40) };
        }),
        {
          supplierIdentifier: 'git-library',
          privacyDomain: 'household',
          picoIdentityFingerprintHex: 'a'.repeat(64),
          entryId: 'a-measured-host',
          plan: picoDepotLibraryReadPlan({ paths: ['a.md', 'b.md'] }),
          expects,
          question,
        },
      );
      expect(report).toEqual({ queued: 2, absent: 0, refused: 0, omitted: 0 });
      // Every byte was asked for rather than read: the paths are the core's
      // knowledge, the contents are not.
      expect(asked).toEqual(['a.md', 'b.md']);
      expect(q.pendingCount()).toBe(2);
    } finally {
      close();
    }
  });

  it('counts what was absent and what was refused instead of failing the attachment', async () => {
    // ADR 0137 IN2's neighbour: one refusal is about one subject, and a person
    // owed twenty missing files is owed a number rather than silence.
    const { queue: q, close } = await queue();
    try {
      const report = await enqueuePicoDepotLibraryReads(
        intake(q, async (path) => {
          if (path === 'gone.md') {
            return null;
          }
          if (path === 'huge.md') {
            throw new Error('excerpt_too_large');
          }
          return { text: 'fine', commit: 'a'.repeat(40) };
        }),
        {
          supplierIdentifier: 'git-library',
          privacyDomain: 'household',
          picoIdentityFingerprintHex: 'a'.repeat(64),
          entryId: 'a-measured-host',
          plan: picoDepotLibraryReadPlan({ paths: ['fine.md', 'gone.md', 'huge.md'] }),
          expects,
          question,
        },
      );
      expect(report).toEqual({ queued: 1, absent: 1, refused: 1, omitted: 0 });
      expect(q.pendingCount()).toBe(1);
    } finally {
      close();
    }
  });

  it('refuses a job at the file that caused it, not as a row somebody finds later', async () => {
    const { queue: q, close } = await queue();
    try {
      const report = await enqueuePicoDepotLibraryReads(
        intake(q, async () => ({ text: 'fine', commit: 'a'.repeat(40) })),
        {
          supplierIdentifier: 'git-library',
          privacyDomain: 'household',
          picoIdentityFingerprintHex: 'a'.repeat(64),
          entryId: 'a-measured-host',
          plan: picoDepotLibraryReadPlan({ paths: ['a.md'] }),
          // ADR 0117 X2: a reader with no declared shape answers in prose.
          expects: [],
          question,
        },
      );
      expect(report.queued).toBe(0);
      expect(report.refused).toBe(1);
      expect(q.pendingCount()).toBe(0);
    } finally {
      close();
    }
  });

  it('queues and dispatches nothing, because the timer owns that', async () => {
    // An attachment that dispatched would hold the accelerator while a person
    // waited for a dialog to close.
    const { queue: q, close } = await queue();
    try {
      await enqueuePicoDepotLibraryReads(
        intake(q, async () => ({ text: 'fine', commit: 'a'.repeat(40) })),
        {
          supplierIdentifier: 'git-library',
          privacyDomain: 'household',
          picoIdentityFingerprintHex: 'a'.repeat(64),
          entryId: 'a-measured-host',
          plan: picoDepotLibraryReadPlan({ paths: ['a.md'] }),
          expects,
          question,
        },
      );
      expect(q.pendingCount()).toBe(1);
      expect(q.outcomeOf('job_a_md').settledAt).toBeNull();
    } finally {
      close();
    }
  });
});

describe('ADR 0152 - a fetch does not choose a provider for a person', () => {
  it('runs nothing when nobody decided, which is not a failure', () => {
    // ADR 0138: reaching outside is off until somebody says so.
    expect(pickPicoDepotIntakeEntry([])).toEqual({ refusal: 'no_decided_entry' });
  });

  it('uses the only entry, because one is not a choice', () => {
    expect(pickPicoDepotIntakeEntry(['a-measured-host'])).toEqual({ entryId: 'a-measured-host' });
  });

  it('refuses to pick among several, by name', () => {
    // A fetch that took the first would be a background task deciding whose
    // machine reads this person's corpus, silently, while they were not
    // looking.
    expect(pickPicoDepotIntakeEntry(['a-measured-host', 'another-host']))
      .toEqual({ refusal: 'more_than_one_decided_entry' });
  });
});
