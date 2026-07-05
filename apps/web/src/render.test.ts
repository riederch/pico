import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { eventTableColumnLabels } from './render.js';

describe('dashboard event table', () => {
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
