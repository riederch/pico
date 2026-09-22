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
  picoModelJobKinds,
  picoModelJobRefusalIsFinal,
  type PicoModelJobKind,
} from './model-job-queue.js';
import { picoLibraryReadJob } from './library-read.js';

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

/**
 * Befund B253: die Domäne gehört an die Referenz und nicht als feste
 * Zeichenkette in jede Vorlage. Vorher trug *jeder* Job hier
 * `privacyDomain: 'household'` in seiner Referenz - auch der, dessen
 * Rückrufkontext `private` sagte. Das war nur stimmig, solange niemand in die
 * Referenzen sah; seit der Shred es tut, ist so eine Zeile ein Job mit
 * Haushaltsmaterial, der sich privat nennt.
 */
function job(jobId = 'job_queue_0001', privacyDomain = 'household') {
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
      privacyDomain,
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

/**
 * Befund B204. Ein Auftrag traegt seinen Anbieter, und nichts verschiebt ihn.
 *
 * **Warum das eine Sicherheitszusage ist.** ADR 0118 O2 verbietet, bei einem
 * Fehlschlag auf eine andere Anbieterklasse auszuweichen - sonst waehlte
 * Verfuegbarkeitsdruck die Datenschutzhaltung, und genau darauf zielt "ein
 * Angreifer verschlechtert den lokalen Anbieter, um einen Cloud-Weg zu
 * erzwingen". B195 hielt diese Regel fuer eine, die nur durch die *Abwesenheit*
 * von Code gilt; gemessen gilt sie staerker, naemlich durch die Gestalt der
 * Zeile: `entry_id` wird beim Einstellen geschrieben, und keines der fuenf
 * `UPDATE` dieser Datei fasst es an.
 *
 * Eine Zusicherung aus einer Abwesenheit faellt still, wenn jemand die
 * Abwesenheit fuellt. Dieser Test geht deshalb **jeden veraendernden Weg der
 * Warteschlange** ab und behauptet danach dieselbe Bindung - er faellt an dem
 * Tag, an dem ein sechstes `UPDATE` sie mitnimmt.
 */
describe('ADR 0118 O2 mit B204 - die Anbieterbindung eines Auftrags', () => {
  it('ueberlebt jeden veraendernden Weg der Warteschlange', async () => {
    const { queue: jobs, db, close } = await queue();
    const gebunden = () => (db
      .prepare('SELECT entry_id AS entryId FROM pico_model_job_queue WHERE job_id = ?')
      .get('job_queue_0001') as { entryId: string } | undefined)?.entryId;

    // Mit Herkunft, wie die Nachbartests: ohne sie gilt der Auftrag als
    // Bibliothekslesung und wird abgelehnt, bevor die Bindung ueberhaupt
    // entsteht - dann pruefte dieser Test eine leere Tabelle (Regel 13).
    jobs.enqueue({
      job: job(),
      picoIdentityFingerprintHex: 'a'.repeat(64),
      entryId: 'entry-der-bleibt',
      derivedFrom: {
        supplierIdentifier: 'a-library',
        commit: 'a'.repeat(40),
        pinCoversContent: true,
      },
      at: '2026-08-14T12:00:00.000Z',
    });
    expect(gebunden()).toBe('entry-der-bleibt');

    jobs.recordAttempt('job_queue_0001', '2026-08-14T12:01:00.000Z');
    jobs.settle({
      jobId: 'job_queue_0001',
      outcome: 'provider_unreachable',
      at: '2026-08-14T12:02:00.000Z',
    });
    jobs.forgetRecall({
      picoIdentityFingerprintHex: 'a'.repeat(64),
      jobId: 'job_queue_0001',
      at: '2026-08-14T12:03:00.000Z',
    });

    // Fehlgeschlagen, abgeschlossen, vergessen - und immer noch derselbe
    // Anbieter. Ausweichen waere ein neuer Auftrag, und der ist eine andere
    // Handlung mit eigener Zustimmung.
    expect(gebunden()).toBe('entry-der-bleibt');
    close();
  });
});

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

describe('ADR 0116 W5 - what waits, and whose it is', () => {
  it('shows a person only their own answered reads', async () => {
    // Two people's reads of two corpora are two private facts, and a list that
    // mixed them would tell each what the other had Pico look at.
    const { queue: q, close } = await queue();
    try {
      const mine = 'a'.repeat(64);
      const theirs = 'b'.repeat(64);
      for (const [jobId, person] of [['job_queue_0001', mine], ['job_queue_0002', theirs]] as const) {
        q.enqueue({
          job: job(jobId),
          picoIdentityFingerprintHex: person,
          entryId: 'a-measured-host',
          derivedFrom: {
            supplierIdentifier: 'a-library',
            commit: 'c'.repeat(40),
            pinCoversContent: true,
          },
          at: '2026-08-14T11:00:00.000Z',
        });
        q.settle({
          jobId,
          outcome: 'answered',
          result: { values: [{ name: 'month', type: 'token', value: 'march', originClass: 'own_pico' }] },
          at: '2026-08-14T12:00:00.000Z',
        });
      }

      expect(q.answeredFor(mine).map((read) => read.jobId)).toEqual(['job_queue_0001']);
      expect(q.answeredFor(theirs).map((read) => read.jobId)).toEqual(['job_queue_0002']);
    } finally {
      close();
    }
  });

  it('lists nothing that has not been answered', async () => {
    const { queue: q, close } = await queue();
    try {
      q.enqueue({
        job: job(),
        picoIdentityFingerprintHex: 'a'.repeat(64),
        entryId: 'a-measured-host',
        derivedFrom: { supplierIdentifier: 'a-library', commit: 'c'.repeat(40), pinCoversContent: true },
        at: '2026-08-14T11:00:00.000Z',
      });
      expect(q.answeredFor('a'.repeat(64))).toHaveLength(0);

      // A settled refusal is not something to keep either.
      q.settle({ jobId: 'job_queue_0001', outcome: 'provider_unreachable', at: '2026-08-14T12:00:00.000Z' });
      expect(q.answeredFor('a'.repeat(64))).toHaveLength(0);
    } finally {
      close();
    }
  });
});

/**
 * ADR 0071 mit ADR 0049 - ein Shred erreicht auch diese Tabelle.
 *
 * Bis zum 2026-09-10 tat er es nicht, und ADR 0049 sagte es seit dem
 * 2026-08-24 im Klartext. Was das schwerer macht als die Nachbarlücken
 * derselben Zeile: ein Shred zerstört die Schlüssel einer Domäne, damit ihr
 * Inhalt unlesbar wird - und diese Zeilen halten Frage, Antwort und gelesenen
 * Kontext derselben Domäne im Klartext, überleben ihn also unberührt.
 */
describe('ADR 0071 mit ADR 0049 - ein Domänen-Shred erreicht die Warteschlange', () => {
  async function queueWithTwoDomains(): Promise<{
    queue: PicoModelJobQueue;
    db: Database.Database;
    close: () => void;
  }> {
    const opened = await queue();
    for (const [jobId, privacyDomain, answer] of [
      ['job_household_1', 'household', 'the boiler service is due in March'],
      ['job_private_1', 'private', 'the spare key is under the third pot'],
    ] as const) {
      opened.queue.enqueue({
        job: job(jobId, privacyDomain),
        picoIdentityFingerprintHex: 'aa'.repeat(32),
        entryId: `entry_${jobId}`,
        at: '2026-08-14T12:00:00.000Z',
        kind: 'recall',
        recallContext: { privacyDomain, memoryItemIds: [`mem_${jobId}`] },
      });
      opened.queue.settle({
        jobId,
        outcome: 'answered',
        result: { values: [{ name: 'sentence', value: answer }] },
        at: '2026-08-14T12:00:01.000Z',
      });
    }
    return opened;
  }

  const rowOf = (db: Database.Database, jobId: string) => db.prepare(`
    SELECT job_json AS jobJson, result_json AS resultJson,
           recall_context_json AS recallContextJson, forgotten_at AS forgottenAt,
           outcome, kept_memory_item_id AS keptMemoryItemId
    FROM pico_model_job_queue WHERE job_id = ?
  `).get(jobId) as {
    jobJson: string; resultJson: string | null; recallContextJson: string | null;
    forgottenAt: string | null; outcome: string | null; keptMemoryItemId: string | null;
  };

  it('erreicht eine Zeile jeder Jobart, nicht nur die mit Rückrufkontext', async () => {
    /**
     * Befund B253. Eine Domäne kann an **drei** Orten in dieser Zeile stehen -
     * im `recallContext`, in `kept_privacy_domain` und an einer Referenz *im
     * Job selbst*. Gesucht wurde an zweien, und `picoLibraryContextRef` legt
     * sie an den dritten: ein Shred erreichte null Bibliotheks-Lesejobs,
     * während die Frage der Person und der Auszug aus ihrem Depot in
     * `job_json` stehenblieben.
     *
     * Der Gang geht über `picoModelJobKinds`, nicht über eine Liste hier:
     * eine dritte Jobart soll diesen Test erweitern statt an ihm vorbeizugehen.
     */
    const opened = await queue();
    const nowMsHere = Date.parse('2026-08-14T12:00:00.000Z');
    const enqueued = new Map<PicoModelJobKind, string>();

    for (const kind of picoModelJobKinds) {
      const jobId = `job_kind_${kind}`;
      enqueued.set(kind, jobId);
      if (kind === 'recall') {
        opened.queue.enqueue({
          job: job(jobId, 'household'),
          picoIdentityFingerprintHex: 'aa'.repeat(32),
          entryId: 'entry_kind',
          at: '2026-08-14T12:00:00.000Z',
          kind,
          recallContext: { privacyDomain: 'household', memoryItemIds: [] },
        });
        continue;
      }
      // Der echte Bauer, nicht ein von Hand gebautes Objekt: wo die Domäne
      // landet, ist genau die Frage, und ein Nachbau würde sie beantworten,
      // statt sie zu stellen.
      opened.queue.enqueue({
        job: picoLibraryReadJob({
          jobId,
          contextRefId: `ref_${jobId}`,
          privacyDomain: 'household',
          excerpt: { path: 'notes.md', text: 'the boiler service is due in March', commit: 'c'.repeat(40) },
          expects: [{ name: 'month', type: 'token' }],
          question: 'What is due?',
          nowMs: nowMsHere,
        }),
        picoIdentityFingerprintHex: 'aa'.repeat(32),
        entryId: 'entry_kind',
        at: '2026-08-14T12:00:00.000Z',
        derivedFrom: { supplierIdentifier: 'supplier', commit: 'c'.repeat(40), pinCoversContent: true },
      });
    }

    expect(enqueued.size).toBe(picoModelJobKinds.length);
    expect(opened.queue.forgetDomainRecalls({
      privacyDomain: 'household',
      at: '2026-08-15T09:00:00.000Z',
    })).toBe(picoModelJobKinds.length);

    for (const [kind, jobId] of enqueued) {
      const row = rowOf(opened.db, jobId);
      expect(row.forgottenAt, kind).toBe('2026-08-15T09:00:00.000Z');
      expect(row.jobJson, kind).not.toContain('What is due?');
      expect(row.jobJson, kind).not.toContain('boiler service');
    }
    opened.close();
  });

  it('nimmt die Worte der geschredderten Domäne und lässt die andere unberührt', async () => {
    const { queue: jobs, db, close } = await queueWithTwoDomains();

    expect(rowOf(db, 'job_household_1').resultJson).toContain('boiler service');
    expect(jobs.forgetDomainRecalls({ privacyDomain: 'household', at: '2026-08-15T09:00:00.000Z' }))
      .toBe(1);

    const shredded = rowOf(db, 'job_household_1');
    expect(shredded.jobJson).not.toContain('What is due?');
    expect(shredded.resultJson).toBeNull();
    expect(shredded.recallContextJson).toBeNull();
    expect(shredded.forgottenAt).toBe('2026-08-15T09:00:00.000Z');

    // Und die Nachbardomäne steht unverändert da: ein Shred gilt einer Domäne
    // und nicht dem Verlauf.
    const untouched = rowOf(db, 'job_private_1');
    expect(untouched.resultJson).toContain('spare key');
    expect(untouched.forgottenAt).toBeNull();
    close();
  });

  it('sagt `domain_shredded` und nicht `taken_back`, weil niemand etwas zurücknahm', async () => {
    const { queue: jobs, db, close } = await queueWithTwoDomains();
    // Eine Zeile, die noch läuft: sie bekommt ihr Ergebnis nie und muss es
    // sagen, sonst wartet der Zähler auf Arbeit, die niemand mehr will.
    jobs.enqueue({
      job: job('job_household_running'),
      picoIdentityFingerprintHex: 'aa'.repeat(32),
      entryId: 'entry_running',
      at: '2026-08-14T12:00:00.000Z',
      kind: 'recall',
      recallContext: { privacyDomain: 'household', memoryItemIds: ['mem_running'] },
    });

    expect(jobs.forgetDomainRecalls({ privacyDomain: 'household', at: '2026-08-15T09:00:00.000Z' }))
      .toBe(2);
    expect(rowOf(db, 'job_household_running').outcome).toBe('domain_shredded');
    // Die schon beantwortete behält ihr eigenes Ergebniswort.
    expect(rowOf(db, 'job_household_1').outcome).toBe('answered');
    close();
  });

  it('lässt die Handhabe auf eine behaltene Notiz stehen', async () => {
    const { queue: jobs, db, close } = await queueWithTwoDomains();
    jobs.markKept({ jobId: 'job_household_1', memoryItemId: 'mem_kept', privacyDomain: 'household' });

    jobs.forgetDomainRecalls({ privacyDomain: 'household', at: '2026-08-15T09:00:00.000Z' });

    // ADR 0126. Ohne sie wäre die Notiz unaufhebbar - der Fehler, den die
    // Handhabe überhaupt erst gegen sich hat.
    expect(rowOf(db, 'job_household_1').keptMemoryItemId).toBe('mem_kept');
    close();
  });

  it('greift eine Zeile über ihre behaltene Domäne, auch ohne Kontext', async () => {
    const { queue: jobs, db, close } = await queueWithTwoDomains();
    // Ein Bibliothekslauf hat keinen Recall-Kontext. Wurde aus ihm etwas in
    // dieser Domäne behalten, gehören seine Worte trotzdem dazu.
    jobs.enqueue({
      job: job('job_library_1'),
      picoIdentityFingerprintHex: 'aa'.repeat(32),
      entryId: 'entry_library',
      at: '2026-08-14T12:00:00.000Z',
      derivedFrom: { supplierIdentifier: 'supplier_a', commit: 'c'.repeat(40), pinCoversContent: true },
    });
    jobs.markKept({ jobId: 'job_library_1', memoryItemId: 'mem_lib', privacyDomain: 'household' });

    expect(jobs.forgetDomainRecalls({ privacyDomain: 'household', at: '2026-08-15T09:00:00.000Z' }))
      .toBe(2);
    expect(rowOf(db, 'job_library_1').forgottenAt).not.toBeNull();
    close();
  });

  it('zählt beim zweiten Lauf nichts mehr, statt Zeilen zweimal zu stempeln', async () => {
    const { queue: jobs, db, close } = await queueWithTwoDomains();
    expect(jobs.forgetDomainRecalls({ privacyDomain: 'household', at: '2026-08-15T09:00:00.000Z' }))
      .toBe(1);
    expect(jobs.forgetDomainRecalls({ privacyDomain: 'household', at: '2026-08-16T09:00:00.000Z' }))
      .toBe(0);
    // Der erste Zeitpunkt bleibt stehen: wann etwas fortkam, ist eine Tatsache
    // und kein Zähler.
    expect(rowOf(db, 'job_household_1').forgottenAt).toBe('2026-08-15T09:00:00.000Z');
    close();
  });

  it('meldet null für eine Domäne, in der nichts steht', async () => {
    const { queue: jobs, close } = await queueWithTwoDomains();
    expect(jobs.forgetDomainRecalls({ privacyDomain: 'nobody-uses-this', at: '2026-08-15T09:00:00.000Z' }))
      .toBe(0);
    close();
  });
});
