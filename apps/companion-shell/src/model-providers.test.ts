import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { picoModelProviderStates } from '@pico/protocol/model-provider-state';
import {
  renderPicoCompanionAnsweredReads,
  renderPicoCompanionModelProviders,
  renderPicoCompanionDeclaredSuppliers,
  renderPicoCompanionMeasurements,
  renderPicoCompanionModuleConsent,
  renderPicoCompanionPendingApprovals,
  renderPicoCompanionRecalls,
} from './model-provider-views.js';
import {
  parsePicoCompanionAnsweredReads,
  picoCompanionModelProviderStates,
  picoCompanionRecallLines,
  parsePicoCompanionRecalls,
  picoCompanionAnsweredReadLines,
  parsePicoCompanionModelProviders,
  picoCompanionModelProviderLines,
  type PicoCompanionModelProvider,
} from './contract.js';

/**
 * ADR 0152 SE1 on the device, tested where the words are chosen.
 *
 * The renderer prints these strings and decides nothing, which is the only
 * arrangement in which a rule about wording can be held to anything.
 */
function provider(overrides: Partial<PicoCompanionModelProvider> = {}): PicoCompanionModelProvider {
  return {
    entryId: 'a-measured-host',
    model: 'a-model:measured',
    providerClass: 'declared_own_host',
    contextTokens: 40960,
    measuredAt: '2026-08-13T17:43:04.923Z',
    decided: false,
    sees: 'nothing yet - you have not decided about this one',
    needsCredentialToSeeMore: true,
    ...overrides,
  };
}

describe('ADR 0152 SE1 - three states, and never two', () => {
  it('says an undecided provider is undecided, not off', () => {
    // ADR 0138: reaching outside is off until somebody says so. "Off" is an
    // answer somebody gave, and nobody gave one - a person should be able to
    // tell "not yet asked" from "answered no".
    const [line] = picoCompanionModelProviderLines([provider()]);
    expect(line?.headline).toBe('a-model:measured is available and you have not decided about it');
    expect(line?.detail).toBe('Pico will not send anything here until you say so.');
    expect(line?.action).toBe('decide');
  });

  it('names the quiet outcome where the choice is, not in a help page', () => {
    // ADR 0151 recorded it as a negative consequence and left open where it
    // would be said: a person who never adds a credential gets a Pico whose
    // model never sees their memory, and nothing else will tell them.
    const [line] = picoCompanionModelProviderLines([
      provider({ decided: true, needsCredentialToSeeMore: true }),
    ]);
    expect(line?.headline).toBe('a-model:measured sees this conversation');
    expect(line?.detail).toContain('does not see what Pico remembers');
    expect(line?.detail).toContain('prove who it is');
    expect(line?.action).toBe('widen');
  });

  it('offers exactly one thing to do per provider', () => {
    const actions = picoCompanionModelProviderLines([
      provider(),
      provider({ entryId: 'a', decided: true, needsCredentialToSeeMore: true }),
      provider({ entryId: 'b', decided: true, needsCredentialToSeeMore: false }),
    ]).map((line) => line.action);
    expect(actions).toEqual(['decide', 'widen', 'revoke']);
  });

  it('says the wider allowance can be withdrawn, because ADR 0048 makes it standing', () => {
    const [line] = picoCompanionModelProviderLines([
      provider({ decided: true, needsCredentialToSeeMore: false }),
    ]);
    expect(line?.headline).toBe('a-model:measured sees this conversation and what Pico remembers');
    expect(line?.detail).toBe('You can withdraw this at any time.');
  });
});

describe('ADR 0152 - what arrives from a Home is parsed, not trusted', () => {
  it('accepts the ADR 0107 reply shape', () => {
    expect(parsePicoCompanionModelProviders([provider()])).toHaveLength(1);
    expect(parsePicoCompanionModelProviders([])).toHaveLength(0);
  });

  it('refuses anything else, because this arrives over a wire', () => {
    expect(() => parsePicoCompanionModelProviders({})).toThrow('invalid_pico_companion_model_providers');
    expect(() => parsePicoCompanionModelProviders([null]))
      .toThrow('invalid_pico_companion_model_provider');
    for (const field of ['entryId', 'model', 'contextTokens', 'decided', 'sees'] as const) {
      const broken = { ...provider(), [field]: undefined };
      expect(() => parsePicoCompanionModelProviders([broken]))
        .toThrow('invalid_pico_companion_model_provider');
    }
  });
});

describe('ADR 0116 W5 - a waiting read says that it waits, not what it found', () => {
  const read = {
    jobId: 'job_library_abc',
    supplier: 'a-library',
    revision: 'c'.repeat(12),
    answeredAt: '2026-08-14T12:00:00.000Z',
  };

  it('never renders the answer, because the keep is what releases it', () => {
    // A headline that summarised the answer would be the answer, shown - and
    // the whole point of the keep is that the person decides before derived
    // output goes anywhere it stays.
    const [line] = picoCompanionAnsweredReadLines([read]);
    expect(line?.headline).toBe('Pico read something from a-library');
    expect(line?.detail).toContain('Keep it');
    expect(line?.detail).toContain('nothing is stored');
    expect(JSON.stringify(line)).not.toContain('march');
  });

  it('shows the revision, because that is the correction point', () => {
    // ADR 0133: if the answer turns out wrong, this says which version of the
    // material it was wrong about.
    const [line] = picoCompanionAnsweredReadLines([read]);
    expect(line?.detail).toContain(read.revision);
  });

  it('drops a value that arrived anyway rather than rendering it', () => {
    // This window has no place for one, and a field nobody declared is a field
    // nobody checked.
    const [parsed] = parsePicoCompanionAnsweredReads([
      { ...read, values: [{ name: 'month', value: 'march' }] },
    ]);
    expect(JSON.stringify(parsed)).not.toContain('march');
    expect(Object.keys(parsed!).sort())
      .toEqual(['answeredAt', 'jobId', 'revision', 'supplier']);
  });

  it('refuses what did not arrive in the declared shape', () => {
    expect(() => parsePicoCompanionAnsweredReads({}))
      .toThrow('invalid_pico_companion_answered_reads');
    for (const field of ['jobId', 'supplier', 'revision', 'answeredAt'] as const) {
      expect(() => parsePicoCompanionAnsweredReads([{ ...read, [field]: undefined }]))
        .toThrow('invalid_pico_companion_answered_read');
    }
  });
});

describe('every view fetches what it shows', () => {
  /**
   * A view that exists and is never called is a view nobody sees, which is
   * how the provider list spent a day: markup, renderer, IPC and no caller.
   *
   * Since 2026-08-17 the window has two views and each fetches only its own
   * lists (ADR 0113), which makes that failure *easier* rather than harder -
   * a section can now sit in a view whose refresh forgot it, and look exactly
   * like a section with nothing in it. So the pairing is asserted.
   */
  const renderer = readFileSync(
    join(import.meta.dirname, 'renderer.ts'),
    'utf8',
  );
  // `\}` escaped: an unescaped closing brace is a syntax error under `/u`.
  const showView = /function showView[\s\S]*?\n\}/u.exec(renderer)?.[0] ?? '';

  it('calls every renderer it has', () => {
    for (const render of [
      'renderPicoCompanionModelProviders(',
      'renderPicoCompanionAnsweredReads(',
      'renderPicoCompanionRecalls(',
      'renderPicoCompanionDevices(',
      'renderPicoCompanionSuppliers(',
      'renderPicoCompanionDepots(',
      'renderPicoCompanionRelays(',
      'renderPicoCompanionModuleConsent(',
      'renderPicoCompanionPendingApprovals(',
      'renderPicoCompanionDeclaredSuppliers(',
      'renderPicoCompanionMeasurements(',
    ]) {
      expect(renderer).toContain(render);
    }
  });

  it('reaches every refresh from the view switch', () => {
    // The one place a section can be orphaned now.
    for (const refresh of [
      'refreshRecalls();',
      'refreshAnsweredReads();',
      'refreshModelProviders();',
      'refreshSuppliers();',
      'refreshDepots();',
      'refreshDevices();',
      'refreshRelays();',
      'refreshPendingActions();',
      'refreshModuleConsent();',
      'refreshMeasurements();',
    ]) {
      expect(showView).toContain(refresh);
    }
  });

  it('asks the occasion view for nothing a setting owns', () => {
    // ADR 0113. The window used to send six reads on every open, four of them
    // for lists a person answering an approval will never look at.
    const now = showView.slice(showView.indexOf("if (view === 'now')"), showView.indexOf('} else'));
    expect(now).toContain('refreshRecalls();');
    expect(now).not.toContain('refreshDevices();');
    expect(now).not.toContain('refreshSuppliers();');
    expect(now).not.toContain('refreshDepots();');
    expect(now).not.toContain('refreshModelProviders();');
    expect(now).not.toContain('refreshRelays();');
  });

  it('asks again after a keep rather than editing the list in place', () => {
    // What is waiting is the Home's answer, not this window's guess about it.
    expect(renderer).toMatch(/keepAnsweredRead\(jobId\)\.then\(refreshAnsweredReads\)/u);
  });

  it('hides a section it could not load instead of reporting a fault', () => {
    // ADR 0118 O4: no absence renders a working thing as broken.
    expect(renderer).toContain('providerSection.hidden = true;');
    expect(renderer).toContain('readSection.hidden = true;');
  });
});

describe('ADR 0152 SE5 - loading and gone are told apart in the simple layer', () => {
  it('says a provider is thinking rather than leaving a person to guess', () => {
    // Working and gone are different absences: one ends by itself and the
    // other needs somebody. The first answer after a quiet spell legitimately
    // takes as long as the entry's declared residency (ADR 0142 PE4).
    const [line] = picoCompanionModelProviderLines([
      provider({ decided: true, needsCredentialToSeeMore: false, state: 'working' }),
    ]);
    expect(line?.detail).toContain('answering something now');
    expect(line?.detail).toContain('loaded first');
  });

  it('says a provider did not answer, and what that costs', () => {
    // ADR 0118 O4: the sentence names what still works, because no absence may
    // render a working thing as broken.
    const [line] = picoCompanionModelProviderLines([
      provider({ decided: true, needsCredentialToSeeMore: false, state: 'did_not_answer' }),
    ]);
    expect(line?.detail).toContain('did not answer');
    expect(line?.detail).toContain('everything you do yourself is unaffected');
  });

  it('states a changed model as a sentence about re-pinning', () => {
    // ADR 0142 PE6 with SE5: never a dismissable warning. The numbers this
    // decision was made on were measured against the old weights.
    const [line] = picoCompanionModelProviderLines([
      provider({ decided: true, needsCredentialToSeeMore: false, state: 'different_model' }),
    ]);
    expect(line?.detail).toContain('different model than the one that was measured');
    expect(line?.detail).toContain('measures it again');
  });

  it('says nothing extra about a provider that is doing its job', () => {
    // A note on every line is noise, and noise is what makes the sentences
    // above stop being read.
    for (const state of ['answered', 'not_used_yet'] as const) {
      const [line] = picoCompanionModelProviderLines([
        provider({ decided: true, needsCredentialToSeeMore: false, state }),
      ]);
      expect(line?.detail).toBe('You can withdraw this at any time.');
    }
  });

  it('drops a state this version does not know instead of rendering it', () => {
    // An unknown word rendered is a sentence nobody wrote.
    const [parsed] = parsePicoCompanionModelProviders([{
      entryId: 'a-measured-host',
      model: 'a-model:measured',
      providerClass: 'declared_own_host',
      contextTokens: 40960,
      measuredAt: '2026-08-13T17:43:04.923Z',
      decided: true,
      sees: 'this conversation only',
      needsCredentialToSeeMore: false,
      state: 'sulking',
    }]);
    expect(parsed?.state).toBeUndefined();
  });

  it('reads a Home that answers without a state at all', () => {
    // ADR 0118 O4. An older Home is not a broken one.
    const [parsed] = parsePicoCompanionModelProviders([{
      entryId: 'a-measured-host',
      model: 'a-model:measured',
      providerClass: 'declared_own_host',
      contextTokens: 40960,
      measuredAt: '2026-08-13T17:43:04.923Z',
      decided: true,
      sees: 'this conversation only',
      needsCredentialToSeeMore: false,
    }]);
    expect(parsed?.state).toBeUndefined();
  });
});

describe('ADR 0152 SE2 - the decision is on the line that states it', () => {
  it('labels the control with the consequence rather than the mechanism', () => {
    // What a person agrees to is what this machine will see. "Submit" would be
    // the one sentence in this surface no test could hold to anything - and
    // the one they actually act on.
    const [undecided] = picoCompanionModelProviderLines([provider()]);
    expect(undecided?.actionLabel).toBe('Let it see this conversation');

    const [narrow] = picoCompanionModelProviderLines([
      provider({ decided: true, needsCredentialToSeeMore: true }),
    ]);
    expect(narrow?.actionLabel).toContain('credential');
    expect(narrow?.actionLabel).toContain('what Pico remembers');

    const [wide] = picoCompanionModelProviderLines([
      provider({ decided: true, needsCredentialToSeeMore: false }),
    ]);
    expect(wide?.actionLabel).toBe('Withdraw');
  });

  it('carries the declaration the person is confirming rather than inventing one', () => {
    // ADR 0048: the class is a person's judgement. A device that sent one it
    // made up would be declaring on their behalf.
    expect(picoCompanionModelProviderLines([provider()])[0]?.providerClass)
      .toBe('declared_own_host');
  });
});

describe('ADR 0151 PV1 - the secret does not cross the renderer bridge', () => {
  const preload = readFileSync(join(import.meta.dirname, 'preload.cts'), 'utf8');
  const renderer = readFileSync(join(import.meta.dirname, 'renderer.ts'), 'utf8');
  const main = readFileSync(join(import.meta.dirname, 'main.ts'), 'utf8');

  /** Code without the paragraphs explaining it: a comment that says "secret"
   * is a file keeping its reason, not carrying one. */
  const withoutComments = (source: string): string => source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/\/\/[^\n]*/gu, '');

  it('never mentions a credential, in any call it makes', () => {
    // ADR 0113 C2's no-secret renderer contract, kept when a secret arrived.
    // The rule is the whole file rather than the one call somebody thought of:
    // a secret smuggled through a *different* bridge call would satisfy a
    // narrower check and break the same contract.
    expect(withoutComments(renderer)).not.toContain('secret');
    expect(withoutComments(preload)).not.toContain('secret');
    expect(preload).toContain('widenModelProvider');
  });

  it('captures the keystrokes in the main process, as the passphrase already is', () => {
    const handler = main.slice(main.indexOf('picoCompanionIpcChannels.widenModelProvider'));
    const body = handler.slice(0, handler.indexOf('ipcMain.handle', 1));
    expect(body).toContain('captureSecret(');
    expect(body).toContain('runtime.widenModelProvider(');
  });
});

/**
 * A document just real enough to render into. The renderer takes its document
 * as an argument, so what it puts on a line can be read rather than inferred
 * from the source - and "the control exists" and "the control is on the line"
 * are different claims.
 */
function fakeDocument(): { document: Document; list: HTMLElement; section: HTMLElement } {
  const createElement = (tag: string): Record<string, unknown> => {
    const children: unknown[] = [];
    const listeners: Array<() => void> = [];
    return {
      tag,
      children,
      listeners,
      className: '',
      textContent: '',
      type: '',
      value: '',
      maxLength: 0,
      autocomplete: '',
      dataset: {} as Record<string, string>,
      hidden: false,
      append: (...nodes: unknown[]) => { children.push(...nodes); },
      replaceChildren: (...nodes: unknown[]) => { children.splice(0, children.length, ...nodes); },
      addEventListener: (_name: string, handler: () => void) => { listeners.push(handler); },
      click: () => { for (const handler of listeners) handler(); },
    };
  };
  const document = { createElement } as unknown as Document;
  return {
    document,
    list: createElement('ul') as unknown as HTMLElement,
    section: createElement('section') as unknown as HTMLElement,
  };
}

describe('ADR 0152 SE2 - the control is on the line, and it acts', () => {
  it('puts the labelled button on the line and reports what was pressed', () => {
    // A button built and never appended is a decision surface that cannot
    // decide - which is what this window was until today.
    const root = fakeDocument();
    const acted: unknown[] = [];
    renderPicoCompanionModelProviders(root, [{
      entryId: 'a-measured-host',
      model: 'a-model:measured',
      providerClass: 'declared_own_host',
      contextTokens: 40960,
      measuredAt: '2026-08-13T17:43:04.923Z',
      decided: false,
      sees: 'nothing yet - you have not decided about this one',
      needsCredentialToSeeMore: true,
    }], (act: unknown) => { acted.push(act); });

    const line = (root.list as unknown as { children: Array<{ children: Array<Record<string, unknown>> }> })
      .children[0]!;
    const button = line.children.find((child) => child.tag === 'button');
    expect(button?.textContent).toBe('Let it see this conversation');

    (button as unknown as { click(): void }).click();
    expect(acted).toEqual([{
      action: 'decide',
      entryId: 'a-measured-host',
      providerClass: 'declared_own_host',
    }]);
  });

  it('keeps the read on the line it sits on', () => {
    // ADR 0116 W5. The press is the write, so a button pointed at another job
    // would persist somebody else's answer - and the list carries several.
    const root = fakeDocument();
    const kept: string[] = [];
    renderPicoCompanionAnsweredReads(root, [
      {
        jobId: 'job_one',
        supplier: 'a-library',
        revision: 'dddddddddddd',
        answeredAt: '2026-08-14T12:00:00.000Z',
      },
      {
        jobId: 'job_two',
        supplier: 'a-library',
        revision: 'eeeeeeeeeeee',
        answeredAt: '2026-08-14T12:05:00.000Z',
      },
    ], (jobId: string) => { kept.push(jobId); });

    const lines = (root.list as unknown as {
      children: Array<{ children: Array<Record<string, unknown>> }>;
    }).children;
    for (const line of lines) {
      const button = line.children.find((child) => child.tag === 'button');
      (button as unknown as { click(): void }).click();
    }
    expect(kept).toEqual(['job_one', 'job_two']);
  });

  it('hides the section when a Home has nothing measured', () => {
    // ADR 0118 O4: nothing computing for you is an absence, not a fault.
    const root = fakeDocument();
    renderPicoCompanionModelProviders(root, [], () => {});
    expect(root.section.hidden).toBe(true);
  });
});

describe('ADR 0113 C2 - the renderer copy of a closed list is bound to it', () => {
  it('lists exactly the states the protocol defines', () => {
    // This file loads in the renderer, where a bare specifier does not
    // resolve, so the words are declared locally. A local copy of a closed
    // list is the drift this project keeps hitting; the binding is this test
    // rather than anybody's intent.
    expect([...picoCompanionModelProviderStates]).toEqual([...picoModelProviderStates]);
  });
});

describe('ADR 0116 W1 - four states, and never fewer', () => {
  const asked = {
    jobId: 'job_recall_1',
    question: 'where did I park?',
    askedAt: '2026-08-16T12:00:00.000Z',
  };

  it('says waiting rather than failed while nobody has answered', () => {
    // Nobody has looked yet. "Nothing found" and "did not answer" are both
    // claims about a look that has not happened.
    expect(picoCompanionRecallLines([asked])[0]?.state)
      .toBe('Waiting for the provider you decided on.');
  });

  it('tells an empty answer apart from an unanswered question', () => {
    // The pair a single "answered" would collapse - and the empty one is the
    // more useful, because it is what sends a person to look elsewhere.
    const [found] = picoCompanionRecallLines([{
      ...asked,
      settledAt: '2026-08-16T12:01:00.000Z',
      outcome: 'answered',
      foundInMemory: false,
    }]);
    expect(found?.state).toBe('Nothing in what it read answers that.');

    const [refused] = picoCompanionRecallLines([{
      ...asked,
      settledAt: '2026-08-16T12:01:00.000Z',
      outcome: 'provider_unreachable',
    }]);
    expect(refused?.state).toContain('did not answer this one');
    // ADR 0118 O4: what still works is part of what happened.
    expect(refused?.state).toContain('Nothing else is affected');
  });

  it('never carries an answer without the label that says what it is', () => {
    // ADR 0117 X5. A model's words about a person's material are not
    // something Pico knows, and the label is produced by the same call as the
    // answer so no caller can forget it.
    const [line] = picoCompanionRecallLines([{
      ...asked,
      settledAt: '2026-08-16T12:01:00.000Z',
      outcome: 'answered',
      foundInMemory: true,
      answer: 'On Bergstrasse, next to the pharmacy.',
    }]);

    expect(line?.answer?.text).toBe('On Bergstrasse, next to the pharmacy.');
    expect(line?.answer?.label).toContain('A model wrote this');
    expect(line?.answer?.label).toContain('Pico did not check it');
  });

  it('shows no answer at all when the reader returned none', () => {
    const [line] = picoCompanionRecallLines([{
      ...asked,
      settledAt: '2026-08-16T12:01:00.000Z',
      outcome: 'answered',
      foundInMemory: true,
    }]);
    expect(line?.answer).toBeUndefined();
  });
});

describe('ADR 0117 X5 - the label reaches the window, above the answer', () => {
  it('puts the label before the answer on the line', () => {
    // A person who reads the answer and scrolls away has already been told
    // what it is.
    const root = fakeDocument();
    renderPicoCompanionRecalls(root, [{
      jobId: 'job_recall_1',
      question: 'where did I park?',
      askedAt: '2026-08-16T12:00:00.000Z',
      settledAt: '2026-08-16T12:01:00.000Z',
      outcome: 'answered',
      foundInMemory: true,
      answer: 'On Bergstrasse.',
    }], () => {});

    const line = (root.list as unknown as {
      children: Array<{ children: Array<{ textContent: string }> }>;
    }).children[0]!;
    const texts = line.children.map((child) => child.textContent);
    expect(texts[0]).toBe('where did I park?');
    expect(texts).toContain('On Bergstrasse.');
    const labelAt = texts.findIndex((text) => text.includes('A model wrote this'));
    expect(labelAt).toBeGreaterThan(-1);
    expect(labelAt).toBeLessThan(texts.indexOf('On Bergstrasse.'));
  });

  it('refuses a list that is not the declared shape', () => {
    expect(() => parsePicoCompanionRecalls([{ jobId: 'job_1' }]))
      .toThrow('invalid_pico_companion_recall');
  });
});

describe('ADR 0116 W5 - the press is the write', () => {
  it('offers a keep only where there is an answer, and keeps that one', () => {
    // Nothing persists without it, so a button on a question that is still
    // waiting would be a promise this window cannot make.
    const root = fakeDocument();
    const kept: string[] = [];
    renderPicoCompanionRecalls(root, [
      {
        jobId: 'job_waiting',
        question: 'where did I park?',
        askedAt: '2026-08-16T12:00:00.000Z',
      },
      {
        jobId: 'job_answered',
        question: 'when is the dentist?',
        askedAt: '2026-08-16T12:00:00.000Z',
        settledAt: '2026-08-16T12:01:00.000Z',
        outcome: 'answered',
        foundInMemory: true,
        answer: 'The 3rd of September.',
      },
    ], (jobId: string) => { kept.push(jobId); });

    const lines = (root.list as unknown as {
      children: Array<{ children: Array<Record<string, unknown>> }>;
    }).children;
    expect(lines[0]!.children.some((child) => child.tag === 'button')).toBe(false);

    const button = lines[1]!.children.find((child) => child.tag === 'button');
    expect(button?.textContent).toBe('Keep this answer');
    (button as unknown as { click(): void }).click();
    expect(kept).toEqual(['job_answered']);
  });

  it('offers no keep for an answer that found nothing', () => {
    // There is nothing to keep: the reader said the material does not answer
    // it, and keeping that sentence would put an absence in somebody's memory
    // as if it were a finding.
    const root = fakeDocument();
    renderPicoCompanionRecalls(root, [{
      jobId: 'job_empty',
      question: 'what is my neighbour called?',
      askedAt: '2026-08-16T12:00:00.000Z',
      settledAt: '2026-08-16T12:01:00.000Z',
      outcome: 'answered',
      foundInMemory: false,
      answer: 'Nothing here says.',
    }], () => {});

    const line = (root.list as unknown as {
      children: Array<{ children: Array<Record<string, unknown>> }>;
    }).children[0]!;
    expect(line.children.some((child) => child.tag === 'button')).toBe(false);
  });
});

describe('ADR 0139 AC4 - the agreement, where somebody can give it', () => {
  it('shows the module’s own sentences and a button that agrees', () => {
    // The sentences are what a person agrees to, so they are shown rather
    // than counted, and they are the module's rather than this window's.
    const root = fakeDocument();
    const agreed: string[] = [];
    renderPicoCompanionModuleConsent(root, [{
      identifier: 'depot',
      drift: { added: ['depot.fetch'], removed: [], changed: [] },
      declares: [{
        name: 'depot.fetch',
        description: 'Fetches a depot at the commit you accepted.',
        risk: 'external_write',
      }],
    }], (identifier) => agreed.push(identifier));

    const line = (root.list as unknown as {
      children: Array<{ children: Array<Record<string, unknown>> }>;
    }).children[0]!;
    const texts = line.children.map((child) => String(child.textContent));
    expect(texts).toContain('Fetches a depot at the commit you accepted.');
    const button = line.children.find((child) => child.tag === 'button')!;
    expect(button.textContent).toBe('Agree');
    (button as unknown as { click(): void }).click();
    expect(agreed).toEqual(['depot']);
  });

  it('says a changed declaration is a change rather than a new thing', () => {
    // ADR 0127 M4. Shipping `destructive` under an agreement somebody gave
    // for `local_write` is the escalation this gate exists for, and being
    // told "would like to do this" would hide that they already answered.
    const root = fakeDocument();
    renderPicoCompanionModuleConsent(root, [{
      identifier: 'depot',
      drift: { added: [], removed: [], changed: ['depot.fetch'] },
      declares: [{ name: 'depot.fetch', description: 'Now also deletes.', risk: 'destructive' }],
    }], () => {});

    const line = (root.list as unknown as {
      children: Array<{ children: Array<Record<string, unknown>> }>;
    }).children[0]!;
    expect(String(line.children[0]?.textContent)).toContain('different from what you agreed');
    expect(line.children.find((child) => child.tag === 'button')?.textContent)
      .toBe('Agree to the change');
  });

  it('shows nothing when nothing is awaiting an answer', () => {
    // A section reading "all agreed" would be a permanent fixture reporting
    // the ordinary case.
    const root = fakeDocument();
    renderPicoCompanionModuleConsent(root, [], () => {});
    expect(root.section.hidden).toBe(true);
  });
});

describe('ADR 0141 RN4 - the question, and the two answers it has', () => {
  it('offers yes and no, and nothing that means walking away', () => {
    /**
     * Unanswered is a third state and it is not a button: it is what closing
     * the window or the clock running out produces. A control for it would
     * make walking away and declining the same act.
     */
    const root = fakeDocument();
    const acted: Array<{ requestedEventId: string; approved: boolean }> = [];
    renderPicoCompanionPendingApprovals(root, [{
      requestedEventId: 'event-1',
      prompt: 'Fetches a depot at the commit you accepted.',
      risk: 'external_write',
      expiresAt: '2026-08-17T12:19:24.143Z',
    }], (decision) => acted.push(decision));

    const line = (root.list as unknown as {
      children: Array<{ children: Array<Record<string, unknown>> }>;
    }).children[0]!;
    const buttons = line.children.filter((child) => child.tag === 'button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Do it', 'No']);
    // The sentence is the one the module declared, so it is recognisable as
    // the thing that was agreed to earlier.
    expect(line.children.some((child) =>
      String(child.textContent) === 'Fetches a depot at the commit you accepted.')).toBe(true);

    (buttons[1] as unknown as { click(): void }).click();
    expect(acted).toEqual([{ requestedEventId: 'event-1', approved: false }]);
  });

  it('is not there when nothing is waiting', () => {
    const root = fakeDocument();
    renderPicoCompanionPendingApprovals(root, [], () => {});
    expect(root.section.hidden).toBe(true);
  });
});

describe('ADR 0141 RN4 - the session belongs to the window, not to the renderer', () => {
  const preload = readFileSync(join(import.meta.dirname, 'preload.cts'), 'utf8');
  const renderer = readFileSync(join(import.meta.dirname, 'renderer.ts'), 'utf8');
  const main = readFileSync(join(import.meta.dirname, 'main.ts'), 'utf8');

  it('never lets the renderer name the session it is answering in', () => {
    /**
     * That a person is present is something only the process owning the
     * window can say. A renderer that carried the session id would be the
     * window vouching for itself, and a page kept open in a corner would go
     * on asserting somebody is there.
     */
    expect(renderer).not.toContain('presenceSessionId');
    expect(preload).not.toContain('presenceSessionId');
    expect(main).toContain('presenceSessionId');
  });

  it('mints it with the window and drops it when the window closes', () => {
    // The lifetime is the point: ADR 0113's window exists only while somebody
    // is interacting, so a session outliving it would let tomorrow's opener
    // answer tonight's question.
    const show = /function showWindow[\s\S]*?\n\}/u.exec(main)?.[0] ?? '';
    expect(show).toContain('presenceSessionId = `presence-${randomUUID()}`');
    expect(show).toContain('presenceSessionId = null;');
  });

  it('refuses to ask or answer without one', () => {
    for (const channel of ['fetchDepotsNow', 'resolvePendingAction']) {
      const handler = main.slice(main.indexOf(`picoCompanionIpcChannels.${channel}`));
      const body = handler.slice(0, handler.indexOf('ipcMain.handle', 1));
      expect(body).toContain('no_presence_session');
    }
  });
});

describe('ADR 0143 DP3 - the supplier a depot brought, in front of the person', () => {
  it('asks for the one thing the depot could not say, and names the depot', () => {
    /**
     * A person agreeing to a space for somebody else's code is owed the name
     * of whose code it is - and the question is *where its material belongs*,
     * which is a name they choose rather than a yes or a no.
     */
    const root = fakeDocument();
    const acted: Array<{ identifier: string; privacyDomain: string }> = [];
    renderPicoCompanionDeclaredSuppliers(root, [{
      identifier: 'git-library',
      kind: 'library',
      remote: 'file:///srv/depots/notes',
      needs: ['privacyDomain'],
    }], (attachment) => acted.push(attachment));

    const line = (root.list as unknown as {
      children: Array<{ children: Array<Record<string, unknown>> }>;
    }).children[0]!;
    expect(String(line.children[0]?.textContent)).toContain('file:///srv/depots/notes');
    // Said as what it will do with the space, not as what it is: "library" is
    // Pico's word for a shape, and the person is deciding about their memory.
    expect(String(line.children[1]?.textContent)).toContain('your memory');
    const input = line.children.find((child) => child.tag === 'input')!;
    const button = line.children.find((child) => child.tag === 'button')!;
    // Never "enable" or "allow": ADR 0138 CO3 keeps whether Pico may go out
    // for it a separate answer, and this line must not look like that one.
    expect(String(button.textContent).toLowerCase()).not.toContain('allow');
    expect(String(button.textContent).toLowerCase()).not.toContain('enable');

    (input as unknown as { value: string }).value = '  knowledge  ';
    (button as unknown as { click(): void }).click();
    // Read at the press and trimmed, so a stray space is not a new domain.
    expect(acted).toEqual([{ identifier: 'git-library', privacyDomain: 'knowledge' }]);
  });

  it('shows nothing when a depot brought nothing to decide', () => {
    const root = fakeDocument();
    renderPicoCompanionDeclaredSuppliers(root, [], () => {});
    expect(root.section.hidden).toBe(true);
  });
});

describe('ADR 0142 PE2 - a measurement, said as work rather than a number', () => {
  it('explains what is happening and that nobody has to wait', () => {
    /**
     * Minutes of somebody's card working. A spinner with no explanation makes
     * a person think their Home has hung, which is the failure ADR 0118 O4
     * names one level up: an absence must not render a working thing broken.
     */
    const root = fakeDocument();
    renderPicoCompanionMeasurements(root, [{
      entryId: 'a-model:measured',
      reach: 'http://192.168.1.9:11434',
      model: 'a-model:measured',
      state: 'running',
      startedAt: '2026-08-17T14:00:00.000Z',
    }]);

    const line = (root.list as unknown as {
      children: Array<{ children: Array<Record<string, unknown>> }>;
    }).children[0]!;
    expect(String(line.children[0]?.textContent)).toContain('192.168.1.9');
    expect(String(line.children[1]?.textContent)).toContain('several minutes');
    // Nothing to press: the work is happening, and the decision it leads to is
    // on the provider line below.
    expect(line.children.some((child) => child.tag === 'button')).toBe(false);
  });

  it('gives the measurement’s own reason when it did not finish', () => {
    // ADR 0118 O4. Flattening every cause into "failed" tells somebody nothing
    // they can act on - a host that serves a different model is a fixable fact.
    const root = fakeDocument();
    renderPicoCompanionMeasurements(root, [{
      entryId: 'a-model:measured',
      reach: 'http://192.168.1.9:11434',
      model: 'a-model:measured',
      state: 'failed',
      startedAt: '2026-08-17T14:00:00.000Z',
      refusal: 'pico_model_provider_model_not_served:a-model:measured',
    }]);
    const line = (root.list as unknown as {
      children: Array<{ children: Array<Record<string, unknown>> }>;
    }).children[0]!;
    expect(String(line.children[1]?.textContent)).toContain('model_not_served');
  });

  it('carries what only a measurement could know, and says nothing uses it yet', () => {
    // ADR 0151 PV5's note is the reason a settled measurement is not a tick.
    const root = fakeDocument();
    renderPicoCompanionMeasurements(root, [{
      entryId: 'a-model:measured',
      reach: 'http://192.168.1.9:11434',
      model: 'a-model:measured',
      state: 'settled',
      startedAt: '2026-08-17T14:00:00.000Z',
      notes: ['this host answered a credential that cannot be right.'],
    }]);
    const line = (root.list as unknown as {
      children: Array<{ children: Array<Record<string, unknown>> }>;
    }).children[0]!;
    const detail = String(line.children[1]?.textContent);
    expect(detail).toContain('credential that cannot be right');
    expect(detail).toContain('until you decide');
  });

  it('never renders a measured number on the line', () => {
    // ADR 0152 SE1. The entry states its consequence in words before any
    // figure, and a throughput rendered here would be a second place to drift.
    const root = fakeDocument();
    renderPicoCompanionMeasurements(root, [{
      entryId: 'a-model:measured',
      reach: 'http://192.168.1.9:11434',
      model: 'a-model:measured',
      state: 'settled',
      startedAt: '2026-08-17T14:00:00.000Z',
    }]);
    const rendered = JSON.stringify((root.list as unknown as { children: unknown }).children);
    expect(rendered).not.toContain('tokens per second');
    expect(rendered).not.toMatch(/\d+ tok/u);
  });
});

describe('ADR 0048 - the declaration is a precondition, not a field', () => {
  const renderer = readFileSync(join(import.meta.dirname, 'renderer.ts'), 'utf8');

  it('refuses in words when the machine was not declared, rather than greying out', () => {
    /**
     * Pico cannot tell from an address whether a machine stands in somebody's
     * home, and the five other provider classes all describe runtimes Pico
     * mediates - so a typed address is `declared_own_host` or it is nothing.
     * A disabled button invites somebody to wonder what it would have done.
     */
    expect(renderer).toContain('picoCompanionOwnMachineUndeclared');
    expect(renderer).toContain('!measureOwn.checked');
    expect(renderer).not.toContain('measureSubmit.disabled');
  });

  it('never lets the renderer choose the provider class', () => {
    // What kind of thing somebody's machine is is not a renderer's to send.
    expect(renderer).not.toContain('declared_own_host');
    expect(readFileSync(join(import.meta.dirname, 'preload.cts'), 'utf8'))
      .not.toContain('declared_own_host');
  });
});

describe('ADR 0071 - the line that made a memory is the line that unmakes it', () => {
  it('offers to forget once kept, and never beside the keep control', () => {
    /**
     * An answer is kept or it is not, so exactly one control is on a line.
     * Two would ask a person to work out which applies to the state in front
     * of them - and the word is *forget* rather than *delete*, because what
     * goes is one sentence out of their memory.
     */
    const root = fakeDocument();
    const forgotten: string[] = [];
    renderPicoCompanionRecalls(root, [{
      jobId: 'job_kept',
      question: 'where did I park?',
      askedAt: '2026-08-17T10:00:00.000Z',
      settledAt: '2026-08-17T10:00:05.000Z',
      outcome: 'answered',
      foundInMemory: true,
      answer: 'Bergstrasse, bay 114.',
      keptAs: { memoryItemId: 'mem_recall_0001', privacyDomain: 'domain-private' },
    }], () => {}, (memoryItemId) => forgotten.push(memoryItemId));

    const line = (root.list as unknown as {
      children: Array<{ children: Array<Record<string, unknown>> }>;
    }).children[0]!;
    const buttons = line.children.filter((child) => child.tag === 'button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe('Forget this');
    // The state says what is true now, so the control reads as an undo.
    expect(String(line.children[1]?.textContent)).toContain('kept');

    (buttons[0] as unknown as { click(): void }).click();
    expect(forgotten).toEqual(['mem_recall_0001']);
  });

  it('offers to keep while nothing was kept, and nothing to forget', () => {
    const root = fakeDocument();
    renderPicoCompanionRecalls(root, [{
      jobId: 'job_unkept',
      question: 'where did I park?',
      askedAt: '2026-08-17T10:00:00.000Z',
      settledAt: '2026-08-17T10:00:05.000Z',
      outcome: 'answered',
      foundInMemory: true,
      answer: 'Bergstrasse, bay 114.',
    }], () => {}, () => {});

    const line = (root.list as unknown as {
      children: Array<{ children: Array<Record<string, unknown>> }>;
    }).children[0]!;
    const buttons = line.children.filter((child) => child.tag === 'button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Keep this answer']);
  });
});
