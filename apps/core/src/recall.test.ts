import { describe, expect, it } from 'vitest';
import { picoModelJobAllowanceFor } from '@pico/protocol/model-job';
import {
  maxPicoRecallQuestionChars,
  picoRecallItemOf,
  picoRecallJob,
  picoRecallPlan,
  picoRecallReservedTokens,
} from './recall.js';
import type { MemoryItem } from './memory-store.js';

/**
 * ADR 0116 W1-W3. The requesting side, where a person's question and their
 * memories meet - and where keeping them apart decides two different things.
 */
const item = (overrides: Partial<MemoryItem> = {}): MemoryItem => ({
  memoryItemId: 'mem_1',
  privacyDomain: 'domain-private',
  owner: 'pico-owner',
  controller: 'pico-owner',
  contentType: 'text/plain',
  content: 'a note about the car',
  deletionState: 'active',
  contentPosture: 'plaintext_foundation',
  origin: 'person_present',
  createdAt: '2026-08-16T10:00:00.000Z',
  updatedAt: '2026-08-16T10:00:00.000Z',
  ...overrides,
});

const recallItem = (content: string, origin: MemoryItem['origin'] = 'person_present') =>
  picoRecallItemOf(item({ content, origin }))!;

describe('ADR 0116 W2 - what was included decides where it may go', () => {
  it('needs only the live turn for a question over the person\'s own words', () => {
    // The whole point of labelling every unit: nothing here chooses an
    // allowance, it falls out of what was actually included.
    const job = picoRecallJob({
      jobId: 'job_recall_1',
      question: 'where did I park?',
      items: [recallItem('parked on Bergstrasse')],
      nowMs: Date.parse('2026-08-16T12:00:00.000Z'),
    });

    expect(job.carries).toBe('live_turn');
    expect(picoModelJobAllowanceFor(job.units, job.references)).toBe('live_turn');
  });

  it('needs a provider that proved who it is once anything else is in', () => {
    // A housemate's note or a supplier's document carries words their author
    // never offered to a provider - ADR 0151 PV1's whole subject.
    const job = picoRecallJob({
      jobId: 'job_recall_2',
      question: 'what did we agree?',
      items: [recallItem('my own note'), recallItem('their note', 'external_content')],
      nowMs: Date.parse('2026-08-16T12:00:00.000Z'),
    });

    expect(job.carries).toBe('live_turn_and_retrieved_memory');
  });

  it('carries each item\'s recorded origin rather than one of its own', () => {
    const job = picoRecallJob({
      jobId: 'job_recall_3',
      question: 'what happened?',
      items: [recallItem('derived by pico', 'own_pico')],
      nowMs: Date.parse('2026-08-16T12:00:00.000Z'),
    });

    // The question is the only thing above the instruction threshold.
    expect(job.units.map((unit) => unit.originClass)).toEqual(['person_present', 'own_pico']);
  });

  it('reads an item recorded before origins existed as not the person speaking', () => {
    // The conservative reading costs the wider allowance rather than a wrong
    // label, and a wrong label here is a laundering step.
    expect(picoRecallItemOf(item({ origin: undefined }))?.origin).toBe('own_pico');
  });

  it('offers nothing for an item whose content cannot be produced', () => {
    // Shredded, undecryptable or empty: one silence for all three, and none of
    // them has words to send anyway.
    expect(picoRecallItemOf(item({ content: undefined }))).toBeUndefined();
    expect(picoRecallItemOf(item({ content: '   ' }))).toBeUndefined();
  });
});

describe('ADR 0119 Q5 - what fits, and what was left out', () => {
  it('says how many did not fit rather than reporting the same success', () => {
    // A bound that silently dropped the rest would report the same success as
    // one that read everything, and a person asking about their own memory
    // deserves to know the answer was formed from part of it.
    const candidates = Array.from({ length: 10 }, (_, index) =>
      recallItem('x'.repeat(400) + String(index)));
    const plan = picoRecallPlan({
      question: 'what did I write?',
      candidates,
      // Room for roughly two of them once the reserve is taken out.
      contextTokens: picoRecallReservedTokens + 220,
    });

    expect(plan.included.length).toBeGreaterThan(0);
    expect(plan.included.length).toBeLessThan(candidates.length);
    expect(plan.omitted).toBe(candidates.length - plan.included.length);
  });

  it('keeps the newest and stops rather than cutting one in half', () => {
    // Half a note is a sentence nobody wrote, and a reader cannot tell it from
    // one somebody did.
    const plan = picoRecallPlan({
      question: 'q',
      candidates: [recallItem('short'), recallItem('y'.repeat(10_000)), recallItem('also short')],
      contextTokens: picoRecallReservedTokens + 20,
    });

    expect(plan.included.map((included) => included.content))
      .toEqual(['short', 'also short']);
    expect(plan.omitted).toBe(1);
  });

  it('includes nothing rather than overrunning a window that has no room', () => {
    const plan = picoRecallPlan({
      question: 'q',
      candidates: [recallItem('anything')],
      contextTokens: picoRecallReservedTokens,
    });

    expect(plan.included).toEqual([]);
    expect(plan.omitted).toBe(1);
  });

  it('leaves room for the answer inside the same window', () => {
    // The policy block, the question and the answer live in the window with
    // the material. Filling it with memories leaves nothing to answer in.
    const plan = picoRecallPlan({
      question: 'q',
      candidates: [recallItem('z'.repeat(4_000))],
      // Enough for the material at four characters a token, but not once the
      // reserve is taken out.
      contextTokens: 1_000 + picoRecallReservedTokens - 1,
    });

    expect(plan.included).toEqual([]);
  });
});

describe('ADR 0117 X2 - a reader with a declared shape', () => {
  it('asks for an answer and for whether the memory contained one', () => {
    // "I could not find that" arrives as a fact a surface can act on rather
    // than a sentence a person has to interpret.
    const job = picoRecallJob({
      jobId: 'job_recall_4',
      question: 'where did I park?',
      items: [recallItem('a note')],
      nowMs: Date.parse('2026-08-16T12:00:00.000Z'),
    });

    expect(job.expects).toEqual([
      { name: 'answer', type: 'text' },
      { name: 'found_in_memory', type: 'boolean' },
    ]);
    expect(job.role).toBe('reader');
  });

  it('refuses a question this Home will not carry, rather than trimming it', () => {
    for (const question of ['', '   ', 'x'.repeat(maxPicoRecallQuestionChars + 1)]) {
      expect(() => picoRecallJob({
        jobId: 'job_recall_5',
        question,
        items: [],
        nowMs: Date.parse('2026-08-16T12:00:00.000Z'),
      })).toThrow('invalid_pico_recall_question');
    }
  });

  it('is a question even when nothing was remembered to answer it with', () => {
    // An empty domain is an answerable state - "I have nothing about that" -
    // and refusing to ask would make the emptiness invisible.
    const job = picoRecallJob({
      jobId: 'job_recall_6',
      question: 'where did I park?',
      items: [],
      nowMs: Date.parse('2026-08-16T12:00:00.000Z'),
    });

    expect(job.units).toHaveLength(1);
    expect(job.carries).toBe('live_turn');
  });
});
