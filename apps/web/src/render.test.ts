import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { eventHistoryNoticeLabel, eventTableColumnLabels } from './render.js';

describe('dashboard event table', () => {
  it('shows the foundation security warning in the static dashboard shell', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');

    expect(html).toContain('Foundation diagnostics only. Optional token protection is not production authentication. Do not expose port 3100.');
  });

  it('keeps the static Foundation token field available for direct access hardening', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');

    expect(html).toContain('id="foundation-token"');
    expect(html).toContain('type="password"');
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
