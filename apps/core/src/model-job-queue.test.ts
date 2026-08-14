import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { parsePicoModelJob } from '@pico/protocol/model-job';
import { afterEach, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';
import {
  PicoModelJobQueue,
  picoModelJobFinalRefusals,
  picoModelJobRefusalIsFinal,
} from './model-job-queue.js';

/**
 * ADR 0049. The queue makes one judgement, and it is which refusals are worth
 * trying again.
 */
const dirs: string[] = [];
const nowMs = Date.parse('2026-08-14T12:00:00.000Z');

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function job(jobId = 'job_queue_0001') {
  return parsePicoModelJob({
    schema: 'pico.model.job.v1',
    jobId,
    role: 'reader',
    units: [{ originClass: 'person_present', text: 'What is due?' }],
    references: [{
      schema: 'pico.model.context.ref.v1',
      contextRefId: `ref_${jobId}`,
      jobId,
      originClass: 'own_pico',
      privacyDomain: 'household',
      excerpt: 'The boiler service is due in March.',
      materializedAt: '2026-08-14T11:59:00.000Z',
      expiresAt: '2026-08-14T12:05:00.000Z',
    }],
    expects: [{ name: 'month', type: 'token' }],
    carries: 'live_turn_and_retrieved_memory',
  }, nowMs);
}

async function queue(): Promise<{
  queue: PicoModelJobQueue;
  db: Database.Database;
  close: () => void;
}> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-job-queue-'));
  dirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  (await EventStore.open(databasePath, {})).close();
  const db = new Database(databasePath);
  return { queue: new PicoModelJobQueue(db), db, close: () => { db.close(); } };
}

describe('ADR 0049 - which refusals are worth trying again', () => {
  it('treats what is about the job as final and what is about the world as not', () => {
    // Waiting changes whether a host answers. It does not change whose words
    // a job carries.
    for (const refusal of picoModelJobFinalRefusals) {
      expect(picoModelJobRefusalIsFinal(refusal)).toBe(true);
    }
    for (const transient of ['provider_unreachable', 'provider_did_not_answer_in_time', 'model_is_not_the_measured_one']) {
      expect(picoModelJobRefusalIsFinal(transient)).toBe(false);
    }
  });

  it('keeps a pinned-digest mismatch retryable, because a host can be put back', () => {
    // ADR 0142 PE6. Somebody pulled a different model behind the tag; somebody
    // can pull the measured one back. Settling that row would turn a reversible
    // mistake into a job nobody runs again.
    expect(picoModelJobRefusalIsFinal('model_is_not_the_measured_one')).toBe(false);
  });
});

describe('ADR 0049 - the queue holds jobs and forgets nothing quietly', () => {
  it('hands back the oldest waiting job, parsed', async () => {
    const { queue: q, close } = await queue();
    try {
      q.enqueue({
        job: job('job_queue_0001'),
        picoIdentityFingerprintHex: 'a'.repeat(64),
        entryId: 'a-measured-host',
        derivedFrom: {
          supplierIdentifier: 'a-library',
          commit: 'a'.repeat(40),
          pinCoversContent: true,
        },
        at: '2026-08-14T11:00:00.000Z',
      });
      q.enqueue({
        job: job('job_queue_0002'),
        picoIdentityFingerprintHex: 'a'.repeat(64),
        entryId: 'a-measured-host',
        derivedFrom: {
          supplierIdentifier: 'a-library',
          commit: 'a'.repeat(40),
          pinCoversContent: true,
        },
        at: '2026-08-14T11:30:00.000Z',
      });
      expect(q.pendingCount()).toBe(2);
      expect(q.next(nowMs, '2026-08-14T12:00:00.000Z')?.job.jobId).toBe('job_queue_0001');
    } finally {
      close();
    }
  });

  it('settles a job whose references have run out instead of stepping over it', async () => {
    // A row that cannot be parsed is not a row to skip: a queue that skipped it
    // would hold a job forever that nothing will ever run.
    const { queue: q, close } = await queue();
    try {
      q.enqueue({
        job: job(),
        picoIdentityFingerprintHex: 'a'.repeat(64),
        entryId: 'a-measured-host',
        derivedFrom: {
          supplierIdentifier: 'a-library',
          commit: 'a'.repeat(40),
          pinCoversContent: true,
        },
        at: '2026-08-14T11:00:00.000Z',
      });
      const muchLater = Date.parse('2026-08-14T13:00:00.000Z');
      expect(q.next(muchLater, '2026-08-14T13:00:00.000Z')).toBeUndefined();
      expect(q.pendingCount()).toBe(0);
      expect(q.outcomeOf('job_queue_0001').outcome).toContain('expired');
    } finally {
      close();
    }
  });

  it('counts attempts and settles with an outcome', async () => {
    const { queue: q, close } = await queue();
    try {
      q.enqueue({
        job: job(),
        picoIdentityFingerprintHex: 'a'.repeat(64),
        entryId: 'a-measured-host',
        derivedFrom: {
          supplierIdentifier: 'a-library',
          commit: 'a'.repeat(40),
          pinCoversContent: true,
        },
        at: '2026-08-14T11:00:00.000Z',
      });
      q.recordAttempt('job_queue_0001', '2026-08-14T12:00:00.000Z');
      q.recordAttempt('job_queue_0001', '2026-08-14T12:01:00.000Z');
      expect(q.next(nowMs, '2026-08-14T12:00:00.000Z')?.attempts).toBe(2);

      q.settle({ jobId: 'job_queue_0001', outcome: 'answered', at: '2026-08-14T12:02:00.000Z' });
      expect(q.pendingCount()).toBe(0);
      expect(q.outcomeOf('job_queue_0001')).toEqual({
        outcome: 'answered',
        settledAt: '2026-08-14T12:02:00.000Z',
      });
    } finally {
      close();
    }
  });

  it('does not enqueue the same job twice', async () => {
    // Whatever fills this queue later may be a sweep of its own, and a sweep
    // that ran twice over the same material must not double the work.
    const { queue: q, close } = await queue();
    try {
      q.enqueue({
        job: job('job_queue_0001'),
        picoIdentityFingerprintHex: 'a'.repeat(64),
        entryId: 'a-measured-host',
        derivedFrom: {
          supplierIdentifier: 'a-library',
          commit: 'a'.repeat(40),
          pinCoversContent: true,
        },
        at: '2026-08-14T11:00:00.000Z',
      });
      q.enqueue({
        job: job('job_queue_0002'),
        picoIdentityFingerprintHex: 'a'.repeat(64),
        entryId: 'a-measured-host',
        derivedFrom: {
          supplierIdentifier: 'a-library',
          commit: 'a'.repeat(40),
          pinCoversContent: true,
        },
        at: '2026-08-14T11:30:00.000Z',
      });
      // The same job again, later. It must not become one row more, and it
      // must not move: a re-enqueue that reset the timestamp would push the
      // oldest job behind whatever arrived while it waited, which is how a
      // queue starves the job it has been failing to run.
      q.enqueue({
        job: job('job_queue_0001'),
        picoIdentityFingerprintHex: 'a'.repeat(64),
        entryId: 'a-measured-host',
        derivedFrom: {
          supplierIdentifier: 'a-library',
          commit: 'a'.repeat(40),
          pinCoversContent: true,
        },
        at: '2026-08-14T11:45:00.000Z',
      });
      expect(q.pendingCount()).toBe(2);
      expect(q.next(nowMs, '2026-08-14T12:00:00.000Z')?.job.jobId).toBe('job_queue_0001');
    } finally {
      close();
    }
  });
});

describe('ADR 0116 W5 - what an explicit keep is allowed to read', () => {
  it('hands back the provenance recorded at enqueue, not reconstructed later', async () => {
    // By the time somebody keeps the answer the working copy has moved on, and
    // the commit this was read at is gone from it.
    const { queue: q, close } = await queue();
    try {
      q.enqueue({
        job: job(),
        picoIdentityFingerprintHex: 'a'.repeat(64),
        entryId: 'a-measured-host',
        derivedFrom: {
          supplierIdentifier: 'a-library',
          commit: 'c'.repeat(40),
          pinCoversContent: true,
        },
        at: '2026-08-14T11:00:00.000Z',
      });
      q.settle({
        jobId: 'job_queue_0001',
        outcome: 'answered',
        result: { values: [{ name: 'month', type: 'token', value: 'march', originClass: 'own_pico' }] },
        at: '2026-08-14T12:02:00.000Z',
      });

      const kept = q.keptView('job_queue_0001');
      expect(kept?.supplierIdentifier).toBe('a-library');
      expect(kept?.commit).toBe('c'.repeat(40));
      expect(kept?.pinCoversContent).toBe(true);
      expect(kept?.privacyDomain).toBe('household');
      expect(kept?.values).toHaveLength(1);
    } finally {
      close();
    }
  });

  it('says the pin does not cover when it does not, rather than rounding up', async () => {
    // ADR 0136 BR6: an unasked question and a negative answer are different
    // facts, and a keep that read `false` as `true` would put a claim in a
    // memory item that nobody made.
    const { queue: q, close } = await queue();
    try {
      q.enqueue({
        job: job(),
        picoIdentityFingerprintHex: 'a'.repeat(64),
        entryId: 'a-measured-host',
        derivedFrom: {
          supplierIdentifier: 'a-library',
          commit: 'c'.repeat(40),
          pinCoversContent: false,
        },
        at: '2026-08-14T11:00:00.000Z',
      });
      expect(q.keptView('job_queue_0001')?.pinCoversContent).toBe(false);
    } finally {
      close();
    }
  });

  it('is not a keep at all when the provenance is incomplete', async () => {
    // ADR 0136 BR6 refuses a partial derivation, so a row from before
    // provenance was recorded is not a keep with gaps.
    const { queue: q, db, close } = await queue();
    try {
      q.enqueue({
        job: job(),
        picoIdentityFingerprintHex: 'a'.repeat(64),
        entryId: 'a-measured-host',
        derivedFrom: { supplierIdentifier: 'a-library', commit: 'c'.repeat(40), pinCoversContent: true },
        at: '2026-08-14T11:00:00.000Z',
      });
      q.settle({ jobId: 'job_queue_0001', outcome: 'answered', at: '2026-08-14T12:00:00.000Z' });
      // A settled job with no values is not keepable either: there is nothing
      // a person could be keeping.
      expect(q.keptView('job_queue_0001')?.values).toBeUndefined();
      expect(q.keptView('nothing_here')).toBeUndefined();

      // And a row from before provenance was recorded is not a keep with
      // gaps - it is not a keep. ADR 0136 BR6 refuses a partial derivation.
      db.prepare(`
        UPDATE pico_model_job_queue SET derived_pin_value = NULL WHERE job_id = ?
      `).run('job_queue_0001');
      expect(q.keptView('job_queue_0001')).toBeUndefined();
    } finally {
      close();
    }
  });
});
