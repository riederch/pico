import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  eventHistoryNoticeLabel,
  eventTableColumnLabels,
  picoMemoryContentLabel,
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
