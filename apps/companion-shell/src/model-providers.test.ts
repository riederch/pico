import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { picoModelProviderStates } from '@pico/protocol/model-provider-state';
import {
  renderPicoCompanionAnsweredReads,
  renderPicoCompanionModelProviders,
} from './model-provider-views.js';
import {
  parsePicoCompanionAnsweredReads,
  picoCompanionModelProviderStates,
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

describe('the window asks for both lists when it opens', () => {
  // A view that exists and is never called is a view nobody sees, which is
  // how the provider list spent a day: markup, renderer, IPC and no caller.
  const renderer = readFileSync(
    join(import.meta.dirname, 'renderer.ts'),
    'utf8',
  );

  it('calls both renderers from one refresh', () => {
    expect(renderer).toContain('renderPicoCompanionModelProviders(');
    expect(renderer).toContain('renderPicoCompanionAnsweredReads(');
    expect(renderer).toContain('refreshModelViews();');
  });

  it('asks again after a keep rather than editing the list in place', () => {
    // What is waiting is the Home's answer, not this window's guess about it.
    expect(renderer).toMatch(/keepAnsweredRead\(jobId\)\.then\(refreshModelViews\)/u);
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
