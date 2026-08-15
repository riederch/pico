import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createModelProviderRow,
  createModuleRow,
  createRetentionPolicyRow,
  eventHistoryNoticeLabel,
  eventTableColumnLabels,
  picoMemoryContentLabel,
  picoMemoryEncryptionLines,
  picoModuleDroppedLine,
  picoSessionsEndedLine,
  picoModuleLines,
  picoModelProviderLines,
  picoRelayIdentityLines,
  storageSummary,
} from './render.js';

describe('dashboard event table', () => {
  it('shows the foundation security warning in the static dashboard shell', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');

    expect(html).toContain('Foundation diagnostics only.');
    expect(html).toContain('not production authentication or remote access');
    expect(html).toContain('Do not expose port 3100.');
  });

  it('keeps the static Foundation token field available for direct access hardening', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');

    expect(html).toContain('id="foundation-token"');
    expect(html).toContain('type="password"');
  });

  it('hides administration until an operator logs in', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');

    // The section is useless without an operator session, and the shell must
    // not suggest otherwise before one exists.
    expect(html).toContain('id="admin-section"');
    expect(/<section id="admin-section"[^>]*\shidden/.test(html)).toBe(true);
  });

  it('makes the shred surface state that it is irreversible and asks for the domain twice', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');

    expect(html).toContain('id="shred-domain"');
    expect(html).toContain('id="shred-confirm"');
    expect(html).toContain('irreversible');
    expect(html).toContain('no undo and no recovery');
    // The confirmation field must be a separate empty input the user types, so
    // the shell must not pre-fill it from the domain field.
    expect(/<input id="shred-confirm"[^>]*value=/.test(html)).toBe(false);
  });

  it('offers a memory content reader, hidden until an operator logs in', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');

    expect(html).toContain('id="content-section"');
    expect(/<section id="content-section"[^>]*\shidden/.test(html)).toBe(true);
    expect(html).toContain('id="content-domain"');
    expect(html).toContain('id="content-read-button"');
    // The load-more control must not offer to page before a domain is read.
    expect(/<button id="content-load-more-button"[^>]*\shidden/.test(html)).toBe(true);
  });

  it('frames content reading as readership, not administration (ADR 0077 A7)', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');

    // The shell must not sell reading content as a host-admin power, and must
    // state the honest transport limit.
    expect(html).toContain('different authority from host administration');
    expect(html).toContain('cleartext');
  });

  it('offers an operator login and never persists the session in the shell', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');

    expect(html).toContain('id="operator-passphrase"');
    expect(html).toContain('id="operator-login-button"');
    // The session is memory-only (ADR 0076): the shell must not reach for any
    // persistent browser store or carry a credential in the URL.
    expect(html).not.toContain('localStorage');
    expect(html).not.toContain('sessionStorage');
    expect(html).not.toContain('document.cookie');
  });

  it('keeps static table headers aligned with rendered event cells', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');
    const tableHead = /<thead><tr>([\s\S]*?)<\/tr><\/thead>/.exec(html);

    if (tableHead === null) {
      throw new Error('Could not find event table header.');
    }

    const labels = Array.from(tableHead[1].matchAll(/<th>(.*?)<\/th>/g), (match) => match[1]);

    expect(labels).toEqual(eventTableColumnLabels);
  });
});

describe('dashboard event history notice', () => {
  it('stays hidden while all loaded events are visible', () => {
    expect(eventHistoryNoticeLabel({ loadedCount: 4, hasMore: false }, 4)).toBeNull();
  });

  it('shows when the dashboard keeps only the latest visible loaded events', () => {
    expect(eventHistoryNoticeLabel({ loadedCount: 600, hasMore: false }, 500))
      .toBe('Showing latest 500 of 600 loaded events.');
  });

  it('shows when the latest event tail omits older stored events', () => {
    expect(eventHistoryNoticeLabel({ loadedCount: 10_000, hasMore: true }, 500))
      .toBe('Showing latest 500 events. Older stored events may be omitted.');
  });
});

describe('ADR 0119 Q5 storage condition in the Foundation summary', () => {
  it('shows the bare state when nothing applies', () => {
    expect(storageSummary({ state: 'normal', reasons: [] })).toBe('normal');
  });

  it('names the store, the numbers and the action that clears it', () => {
    // The gate asks for the condition *and* what to do about it. A state on its
    // own would tell the person something is wrong and leave them guessing,
    // which is barely better than meeting the refusal cold.
    expect(storageSummary({
      state: 'reserved',
      reasons: [{
        cause: 'store_ceiling',
        remedy: 'reduce_stored_data',
        store: 'event_log',
        rows: 5_000_000,
        ceilingRows: 5_000_000,
      }],
    })).toBe(
      'reserved: event_log at ceiling (5000000/5000000 rows) '
      + '- export, migrate or shred to reduce stored data',
    );
  });

  it('shows every reason, so fixing one does not reveal the next by surprise', () => {
    expect(storageSummary({
      state: 'exhausted',
      reasons: [
        { cause: 'low_disk', remedy: 'free_disk_space' },
        {
          cause: 'store_ceiling',
          remedy: 'reduce_stored_data',
          store: 'memory_item',
          rows: 12,
          ceilingRows: 10,
        },
      ],
    })).toBe(
      'exhausted: low disk - free disk space; '
      + 'memory_item at ceiling (12/10 rows) - export, migrate or shred to reduce stored data',
    );
  });
});

describe('ADR 0117 X5 - content is labeled or it is your own', () => {
  const base = {
    memoryItemId: 'memory_x5',
    privacyDomain: 'household',
    contentType: 'text/plain',
    contentPosture: 'plaintext_foundation' as const,
    deletionState: 'active' as const,
    content: 'The boiler is due in March.',
    createdAt: '2026-08-14T12:00:00.000Z',
    updatedAt: '2026-08-14T12:00:00.000Z',
  };

  it('says nothing about the person\'s own words, which is what makes a label mean something', () => {
    // A label on everything would say nothing. Absence means "yours".
    expect(picoMemoryContentLabel({ ...base, origin: 'person_present' })).toBeNull();
    expect(picoMemoryContentLabel(base)).toBeNull();
  });

  it('names the origin of anything below the instruction threshold', () => {
    expect(picoMemoryContentLabel({ ...base, origin: 'external_content' }))
      .toBe('from external content');
    expect(picoMemoryContentLabel({ ...base, origin: 'home_member' }))
      .toBe('from home member');
  });

  it('names the library and the revision an answer was read at', () => {
    // ADR 0136 BR6 with ADR 0133: the revision is the correction point.
    expect(picoMemoryContentLabel({
      ...base,
      origin: 'own_pico',
      derivedFrom: {
        supplierIdentifier: 'a-library',
        pin: { kind: 'commit', value: 'd'.repeat(40) },
        pinCoversContent: true,
      },
    })).toBe('from own pico; read from a-library at dddddddddddd');
  });

  it('says when the pin does not cover the bytes, rather than implying it does', () => {
    // "This is what the document said at that revision" and "this is what a
    // document said" are different claims.
    expect(picoMemoryContentLabel({
      ...base,
      derivedFrom: {
        supplierIdentifier: 'a-library',
        pin: { kind: 'commit', value: 'd'.repeat(40) },
        pinCoversContent: false,
      },
    })).toBe('read from a-library at dddddddddddd, which the pin does not cover');
  });
});

/**
 * ADR 0104 at the surface where the person who administers this instance
 * answers. Both settings say what is *running* separately from what was
 * *decided*, because a decision here is read at the next start.
 */
describe('ADR 0104 S3 - memory encryption in words', () => {
  it('keeps a recorded decision apart from the posture it is running under', () => {
    // The failure this prevents: somebody records "encrypt", the surface says
    // "encrypted", and they believe their content changed while it sat as it
    // was. The key store is built before the database opens.
    const lines = picoMemoryEncryptionLines({
      enabled: false,
      decided: true,
      decidedAt: '2026-08-14T10:00:00.000Z',
    });

    expect(lines.running).toBe('Memory content is stored as plaintext foundation data.');
    expect(lines.origin).toMatch(/^A person decided this on /u);
  });

  it('says nobody decided rather than showing a default as an answer', () => {
    expect(picoMemoryEncryptionLines({ enabled: false, decided: false }).origin)
      .toContain('Nobody has decided this');
  });
});

describe('ADR 0104 S5 - the relay account in words', () => {
  it('says what a change costs before anybody asks for one', () => {
    // ADR 0148 gives every relationship its own address pair at this operator
    // under this account. The number is what a move costs, and reading it in
    // the refusal afterwards is too late to be a decision.
    const lines = picoRelayIdentityLines({
      operator: 'relay.example.org',
      accountId: 'acct_home',
      decided: true,
      mailboxes: 3,
    });

    expect(lines.identity).toBe('acct_home at relay.example.org');
    expect(lines.origin).toBe('A person decided this.');
    expect(lines.cost).toContain('3 mailboxes at this account');
  });

  it('counts one mailbox as one', () => {
    expect(picoRelayIdentityLines({
      operator: 'relay.example.org',
      accountId: 'acct_home',
      mailboxes: 1,
    }).cost).toContain('1 mailbox at this account');
  });

  it('reads an inherited account as inherited rather than as somebody\'s answer', () => {
    expect(picoRelayIdentityLines({
      operator: 'relay.example.org',
      accountId: 'acct_home',
      decided: false,
      mailboxes: 0,
    }).origin).toBe('Inherited from this host\'s configuration.');
  });

  it('renders no account as an absence rather than as a fault', () => {
    // ADR 0118 O4. A Home with no relay reaches other Picos directly, which
    // works - and no absence may render a working thing as broken.
    const lines = picoRelayIdentityLines({ mailboxes: 0 });

    expect(lines.identity).toBe('No relay account.');
    expect(lines.origin).toBe('This Home reaches other Picos over the direct channel.');
    expect(lines.cost).toContain('strands nothing');
  });
});

describe('ADR 0076 - what ending every session did', () => {
  it('says this one went too, because it did', () => {
    // The surface has to behave as though it is true. A dashboard that
    // reported success and stayed logged in would look connected, fail on the
    // next call, and the person would blame the Home.
    expect(picoSessionsEndedLine(3))
      .toBe('3 sessions ended, this one included. Log in again to continue.');
  });

  it('counts one session as one', () => {
    expect(picoSessionsEndedLine(1)).toContain('1 session ended');
  });

  it('does not report nothing as an accomplishment', () => {
    // A static-token caller holds no session at all, and "0 sessions ended"
    // phrased as a success would read as if something happened.
    expect(picoSessionsEndedLine(0)).toBe('No operator sessions were open. Nothing was ended.');
  });
});

describe('ADR 0127 M3 with ADR 0129 SR6 - two switches, never one', () => {
  const module = {
    identifier: 'spatial-recall',
    kind: 'product',
    active: true,
    capturing: false,
    effectBearing: false,
    dependencies: [] as readonly string[],
  };

  it('says recording is off without saying the module is', () => {
    // Collapsing the two would make "stop recording" and "remove the feature"
    // the same act. Somebody who turns recording off for an afternoon still
    // wants to be told where they parked this morning.
    const lines = picoModuleLines(module);
    expect(lines.state).toBe('On.');
    expect(lines.recording).toContain('Not recording');
    expect(lines.recording).toContain('kept');
  });

  it('says an off module keeps its data, because it does', () => {
    // ADR 0127 M3: deactivation drops nothing. A person hesitating over the
    // switch should be able to read that, or the hesitation keeps a module on
    // for no reason.
    expect(picoModuleLines({ ...module, active: false }).state)
      .toBe('Off. Its data is kept, and turning it on restores what was there.');
  });

  it('says when switching it off stops the world changing', () => {
    // ADR 0128. An effect-bearing module is the one where "off" is sometimes
    // exactly the point.
    expect(picoModuleLines({ ...module, effectBearing: true }).state)
      .toContain('change things outside this Home');
  });

  it('names what a module depends on rather than showing an empty cell', () => {
    expect(picoModuleLines(module).depends).toBe('Nothing.');
    expect(picoModuleLines({ ...module, dependencies: ['depot'] }).depends).toBe('depot');
  });
});

describe('ADR 0127 M4 - what will not happen, with the full count', () => {
  it('says nothing when nothing was outstanding', () => {
    expect(picoModuleDroppedLine([])).toBeNull();
  });

  it('names the total and admits the list is shorter', () => {
    // A truncated list that did not say it was truncated would be a lie, and
    // "and 9,987 more" is information.
    expect(picoModuleDroppedLine([{
      module: 'calendar',
      total: 30,
      shown: Array.from({ length: 20 }, (_, index) => ({
        kind: 'calendar.reminder',
        dueAt: '2026-08-15T09:00:00.000Z',
        reference: `ref_${index}`,
      })),
    }])).toBe('calendar: 30 things it promised will not happen (20 listed, 10 more)');
  });

  it('counts one promise as one', () => {
    expect(picoModuleDroppedLine([{
      module: 'calendar',
      total: 1,
      shown: [{ kind: 'calendar.reminder', dueAt: '2026-08-15T09:00:00.000Z', reference: 'r' }],
    }])).toBe('calendar: 1 thing it promised will not happen');
  });
});

describe('ADR 0152 SE1 - a measured provider in words', () => {
  const measured = {
    entryId: 'a-measured-host',
    model: 'a-model:measured',
    providerClass: 'declared_own_host',
    sees: 'this conversation only',
    needsCredentialToSeeMore: true,
    measured: {
      at: '2026-08-13T17:43:04.923Z',
      contextTokens: 40_960,
      generationTokensPerSecond: 26.31,
      concurrentJobs: 1,
    },
    effective: { contextTokens: 40_960, concurrentJobs: 1 },
  };

  it('shows the measurement with the date it was taken', () => {
    // ADR 0142 is measured rather than advertised, and a measurement with no
    // date is an advertisement again: a figure taken while the machine was
    // idle says nothing about the machine that has been busy since.
    const lines = picoModelProviderLines(measured);

    expect(lines.measured).toContain('40,960 tokens');
    expect(lines.measured).toContain('26.3 tokens/s');
    expect(lines.measured).toMatch(/measured .+2026/u);
  });

  it('tells a narrow machine from a narrowed one', () => {
    // SE4 lets this host lower a ceiling and never raise it. One number would
    // hide which of the two a person is looking at, and only the second is a
    // decision somebody here made.
    expect(picoModelProviderLines(measured).ceiling)
      .toBe('Not narrowed: this Home uses what was measured.');
    expect(picoModelProviderLines({
      ...measured,
      narrowing: { contextTokens: 8_192 },
      effective: { contextTokens: 8_192, concurrentJobs: 1 },
    }).ceiling).toContain('Narrowed here to 8,192 tokens');
  });

  it('says what the provider last did, and what an unknown word is', () => {
    // ADR 0152 SE5 on the host surface. A word this dashboard does not know is
    // reported as unknown rather than printed raw: an unrecognised token on a
    // screen is a state nobody wrote.
    expect(picoModelProviderLines({ ...measured, state: 'did_not_answer' }).state)
      .toBe('Did not answer the last job.');
    expect(picoModelProviderLines({ ...measured, state: 'sulking' }).state)
      .toContain('does not know');
    expect(picoModelProviderLines(measured).state).toBe('Not reported by this Home.');
  });

  it('carries the Home\'s sentence about what it sees rather than composing one', () => {
    // What an entry carries is decided where the entry is held. A dashboard
    // that composed its own would be a second place deciding what a person is
    // told about where their words go.
    expect(picoModelProviderLines(measured).sees)
      .toBe('Sees this conversation only. Reading more needs a credential.');
    expect(picoModelProviderLines({
      ...measured,
      sees: 'this conversation and what Pico remembers',
      needsCredentialToSeeMore: false,
    }).sees).toBe('Sees this conversation and what Pico remembers.');
  });
});

describe('the dashboard shell carries what the view requires', () => {
  it('has an element for every id the view demands', () => {
    // `requireElement` throws at load, so a missing id is a blank dashboard
    // rather than a missing field. Checking every id rather than the ones
    // somebody remembered is the difference between a test and a habit.
    const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');
    const source = readFileSync(resolve(import.meta.dirname, 'render.ts'), 'utf8');
    const ids = [...source.matchAll(/requireElement\(document, '([^']+)'/gu)]
      .map(([, id]) => id);

    expect(ids.length).toBeGreaterThan(30);
    for (const id of ids) {
      expect(html, `index.html is missing id="${id}"`).toContain(`id="${id}"`);
    }
  });

  it('offers both Home settings before the danger card', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');

    expect(html).toContain('id="encryption-form"');
    expect(html).toContain('id="relay-identity-form"');
    expect(html.indexOf('id="relay-identity-form"')).toBeLessThan(html.indexOf('danger-card'));
  });
});

/**
 * ADR 0076. The wiring layer has no test harness in this app, so the rule that
 * lives there is read from the source - the same arrangement the companion
 * renderer uses, and for the same reason: a rule that only holds because
 * somebody remembered it is a rule that stops holding.
 */
describe('ADR 0076 - the dashboard logs itself out when the Home does', () => {
  const main = readFileSync(resolve(import.meta.dirname, 'main.ts'), 'utf8');

  it('forgets the session after a passphrase change and after ending sessions', () => {
    // Both routes end every session, this one included. A dashboard that
    // stayed as it was would look connected and fail on the next call.
    const changed = main.slice(main.indexOf('async function changePassphrase'));
    expect(changed.slice(0, changed.indexOf('async function endEverySession')))
      .toContain('forgetOperatorSession(');

    const ended = main.slice(main.indexOf('async function endEverySession'));
    expect(ended.slice(0, ended.indexOf('\n  /**'))).toContain('forgetOperatorSession(');
  });

  it('hides what an ended session can no longer reach', () => {
    const forget = main.slice(main.indexOf('function forgetOperatorSession'));
    const body = forget.slice(0, forget.indexOf('\n  }'));
    expect(body).toContain('operatorSession = undefined;');
    expect(body).toContain('view.setAdminVisible(false)');
    expect(body).toContain('view.setContentReadVisible(false)');
  });

  it('clears the passphrase fields whichever way it went', () => {
    // A passphrase left in a field is one a person walks away from.
    const changed = main.slice(main.indexOf('async function changePassphrase'));
    const body = changed.slice(0, changed.indexOf('async function endEverySession'));
    expect(body.match(/view\.clearPassphraseForm\(\)/gu)?.length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * The same question ADR 0152 SE2 turned out to need on the device: not "is
 * there a button" but "does it act on the row it sits on".
 *
 * A row action pointed at the wrong subject is a defect a screenshot passes
 * and a person discovers by losing something - a revoked policy that was not
 * theirs to revoke, a module switched off that they were reading about.
 */
function fakeDocument(): Document {
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
      addEventListener: (_name: string, handler: () => void) => { listeners.push(handler); },
      classList: { add: () => {} },
    };
  };
  return { createElement } as unknown as Document;
}

interface FakeNode {
  tag: string;
  textContent: string;
  children: FakeNode[];
  listeners: Array<() => void>;
}

function buttons(row: unknown): FakeNode[] {
  const node = row as unknown as FakeNode;
  return node.children
    .flatMap((child) => [child, ...child.children])
    .filter((child) => child.tag === 'button');
}

describe('every row acts on the row it sits on', () => {
  it('edits and revokes the policy in that row, not another', () => {
    const pressed: string[] = [];
    const row = createRetentionPolicyRow(
      fakeDocument(),
      {
        retentionPolicyId: 'short-lived',
        displayName: 'Short lived',
        mode: 'keep_until_deleted',
        createdAt: '2026-08-14T12:00:00.000Z',
        updatedAt: '2026-08-14T12:00:00.000Z',
      },
      (id) => { pressed.push(`edit:${id}`); },
      (id) => { pressed.push(`revoke:${id}`); },
    );

    const [edit, revoke] = buttons(row);
    expect([edit?.textContent, revoke?.textContent]).toEqual(['Edit', 'Revoke']);
    edit?.listeners.forEach((run) => { run(); });
    revoke?.listeners.forEach((run) => { run(); });
    expect(pressed).toEqual(['edit:short-lived', 'revoke:short-lived']);
  });

  it('switches the module in that row, and asks for the opposite of what it is', () => {
    // ADR 0127 M3. A button that sent the state it already has would do
    // nothing and look like it worked.
    const pressed: unknown[] = [];
    const row = createModuleRow(
      fakeDocument(),
      {
        identifier: 'spatial-recall',
        kind: 'product',
        active: true,
        capturing: false,
        effectBearing: false,
        dependencies: [],
      },
      (input) => { pressed.push(input); },
      (input) => { pressed.push(input); },
    );

    const [activation, capture] = buttons(row);
    expect(activation?.textContent).toBe('Switch off');
    expect(capture?.textContent).toBe('Start recording');
    activation?.listeners.forEach((run) => { run(); });
    capture?.listeners.forEach((run) => { run(); });
    expect(pressed).toEqual([
      { identifier: 'spatial-recall', active: false },
      { identifier: 'spatial-recall', capturing: true },
    ]);
  });

  it('narrows the entry in that row', () => {
    const pressed: string[] = [];
    const row = createModelProviderRow(
      fakeDocument(),
      {
        entryId: 'a-measured-host',
        model: 'a-model:measured',
        providerClass: 'declared_own_host',
        sees: 'this conversation only',
        needsCredentialToSeeMore: true,
        measured: {
          at: '2026-08-13T17:43:04.923Z',
          contextTokens: 40_960,
          generationTokensPerSecond: 26.31,
          concurrentJobs: 1,
        },
        effective: { contextTokens: 40_960, concurrentJobs: 1 },
      },
      (entryId) => { pressed.push(entryId); },
    );

    const [narrow] = buttons(row);
    expect(narrow?.textContent).toBe('Narrow');
    narrow?.listeners.forEach((run) => { run(); });
    expect(pressed).toEqual(['a-measured-host']);
  });
});
