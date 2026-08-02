import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  picoLinuxProcessTreeMemory,
  readPicoLinuxCoreDumpLimits,
  readPicoLinuxProcessTable,
} from './linux-process-tree.js';

describe('Linux process-tree RSS measurement', () => {
  it('sums only the root process and transitive descendants', () => {
    expect(picoLinuxProcessTreeMemory([
      {
        pid: 10, parentPid: 1, rssBytes: 10_000, proportionalBytes: 5_000,
        privateBytes: 4_000,
      },
      {
        pid: 11, parentPid: 10, rssBytes: 20_000, proportionalBytes: 8_000,
        privateBytes: 6_000,
      },
      {
        pid: 12, parentPid: 11, rssBytes: 30_000, proportionalBytes: 10_000,
        privateBytes: 7_000,
      },
      {
        pid: 20, parentPid: 1, rssBytes: 40_000, proportionalBytes: 20_000,
        privateBytes: 15_000,
      },
    ], 10)).toEqual({
      processCount: 3,
      rssBytes: 60_000,
      proportionalBytes: 23_000,
      privateBytes: 17_000,
    });
  });

  it('reads stable process records and tolerates missing RSS', () => {
    const procRoot = mkdtempSync(join(tmpdir(), 'pico-proc-'));
    mkdirSync(join(procRoot, '101'), { recursive: true });
    mkdirSync(join(procRoot, '102'), { recursive: true });
    mkdirSync(join(procRoot, 'not-a-pid'), { recursive: true });
    writeFileSync(join(procRoot, '101', 'status'), 'Name:\tpico\nPPid:\t1\nVmRSS:\t42 kB\n');
    writeFileSync(join(procRoot, '102', 'status'), 'Name:\tpico-child\nPPid:\t101\n');
    writeFileSync(join(procRoot, '101', 'smaps_rollup'), [
      'Rss: 42 kB',
      'Pss: 21 kB',
      'Private_Clean: 3 kB',
      'Private_Dirty: 4 kB',
    ].join('\n'));
    writeFileSync(join(procRoot, '102', 'smaps_rollup'), [
      'Rss: 0 kB',
      'Pss: 0 kB',
      'Private_Clean: 0 kB',
      'Private_Dirty: 0 kB',
    ].join('\n'));

    try {
      expect(readPicoLinuxProcessTable(procRoot)).toEqual([
        {
          pid: 101,
          parentPid: 1,
          rssBytes: 42 * 1_024,
          proportionalBytes: 21 * 1_024,
          privateBytes: 7 * 1_024,
        },
        {
          pid: 102,
          parentPid: 101,
          rssBytes: 0,
          proportionalBytes: 0,
          privateBytes: 0,
        },
      ]);
      mkdirSync(join(procRoot, '103'), { recursive: true });
      writeFileSync(
        join(procRoot, '103', 'status'),
        'Name:\tunrelated\nPPid:\t1\nVmRSS:\t99 kB\n',
      );
      writeFileSync(join(procRoot, '103', 'smaps_rollup'), [
        'Rss: 99 kB',
        'Pss: 50 kB',
        'Private_Clean: 10 kB',
      ].join('\n'));
      expect(readPicoLinuxProcessTable(procRoot, 101)).toEqual([
        {
          pid: 101,
          parentPid: 1,
          rssBytes: 42 * 1_024,
          proportionalBytes: 21 * 1_024,
          privateBytes: 7 * 1_024,
        },
        {
          pid: 102,
          parentPid: 101,
          rssBytes: 0,
          proportionalBytes: 0,
          privateBytes: 0,
        },
      ]);
    } finally {
      rmSync(procRoot, { recursive: true });
    }
  });

  it('reads finite and unlimited core-dump limits from procfs', () => {
    const procRoot = mkdtempSync(join(tmpdir(), 'pico-proc-limits-'));
    const limitsPath = join(procRoot, 'limits');
    writeFileSync(limitsPath, [
      'Limit                     Soft Limit           Hard Limit           Units',
      'Max core file size        0                    unlimited            bytes     ',
      'Max open files            1024                 4096                 files',
    ].join('\n'));

    try {
      expect(readPicoLinuxCoreDumpLimits(limitsPath)).toEqual({
        softBytes: 0,
        hardBytes: 'unlimited',
      });
    } finally {
      rmSync(procRoot, { recursive: true });
    }
  });
});
