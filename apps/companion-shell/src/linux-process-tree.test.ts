import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  picoLinuxProcessTreeMemory,
  picoLinuxProcessRoleFromElectronType,
  readPicoLinuxCoreDumpLimits,
  readPicoLinuxProcessTable,
  type PicoLinuxProcessMemory,
  type PicoLinuxProcessRole,
} from './linux-process-tree.js';

function processMemory({
  pid,
  parentPid,
  role,
  rssBytes,
  proportionalBytes,
  privateCleanBytes,
  privateDirtyBytes,
  privateHugetlbBytes = 0,
}: Omit<PicoLinuxProcessMemory, 'privateBytes' | 'privateHugetlbBytes'> & {
  role: PicoLinuxProcessRole;
  privateHugetlbBytes?: number;
}): PicoLinuxProcessMemory {
  return {
    pid,
    parentPid,
    role,
    rssBytes,
    proportionalBytes,
    privateCleanBytes,
    privateDirtyBytes,
    privateHugetlbBytes,
    privateBytes: privateCleanBytes + privateDirtyBytes + privateHugetlbBytes,
  };
}

describe('Linux process-tree memory measurement', () => {
  it('sums only the root process and transitive descendants', () => {
    expect(picoLinuxProcessTreeMemory([
      processMemory({
        pid: 10, parentPid: 1, role: 'browser', rssBytes: 10_000,
        proportionalBytes: 5_000, privateCleanBytes: 1_000, privateDirtyBytes: 3_000,
      }),
      processMemory({
        pid: 11, parentPid: 10, role: 'zygote', rssBytes: 20_000,
        proportionalBytes: 8_000, privateCleanBytes: 2_000, privateDirtyBytes: 4_000,
        privateHugetlbBytes: 500,
      }),
      processMemory({
        pid: 12, parentPid: 11, role: 'utility', rssBytes: 30_000,
        proportionalBytes: 10_000, privateCleanBytes: 3_000, privateDirtyBytes: 4_000,
      }),
      processMemory({
        pid: 20, parentPid: 1, role: 'other', rssBytes: 40_000,
        proportionalBytes: 20_000, privateCleanBytes: 5_000, privateDirtyBytes: 10_000,
      }),
    ], 10)).toEqual({
      processCount: 3,
      rssBytes: 60_000,
      proportionalBytes: 23_000,
      privateCleanBytes: 6_000,
      privateDirtyBytes: 11_000,
      privateHugetlbBytes: 500,
      privateDirtyAndHugetlbBytes: 11_500,
      privateBytes: 17_500,
      processMemoryByRole: [
        {
          role: 'browser', processCount: 1, rssBytes: 10_000,
          proportionalBytes: 5_000, privateCleanBytes: 1_000,
          privateDirtyBytes: 3_000, privateHugetlbBytes: 0,
          privateDirtyAndHugetlbBytes: 3_000, privateBytes: 4_000,
        },
        {
          role: 'zygote', processCount: 1, rssBytes: 20_000,
          proportionalBytes: 8_000, privateCleanBytes: 2_000,
          privateDirtyBytes: 4_000, privateHugetlbBytes: 500,
          privateDirtyAndHugetlbBytes: 4_500, privateBytes: 6_500,
        },
        {
          role: 'utility', processCount: 1, rssBytes: 30_000,
          proportionalBytes: 10_000, privateCleanBytes: 3_000,
          privateDirtyBytes: 4_000, privateHugetlbBytes: 0,
          privateDirtyAndHugetlbBytes: 4_000, privateBytes: 7_000,
        },
      ],
    });
  });

  it('includes Electron-associated processes even when the sandbox re-parents them', () => {
    expect(picoLinuxProcessTreeMemory([
      processMemory({
        pid: 10, parentPid: 1, role: 'browser', rssBytes: 10_000,
        proportionalBytes: 5_000, privateCleanBytes: 1_000, privateDirtyBytes: 3_000,
      }),
      processMemory({
        pid: 20, parentPid: 1, role: 'sandbox', rssBytes: 2_000,
        proportionalBytes: 1_000, privateCleanBytes: 0, privateDirtyBytes: 500,
      }),
    ], 10, new Set([10, 20]))).toMatchObject({
      processCount: 2,
      rssBytes: 12_000,
      proportionalBytes: 6_000,
      privateDirtyAndHugetlbBytes: 3_500,
      privateBytes: 4_500,
      processMemoryByRole: [
        expect.objectContaining({ role: 'browser', processCount: 1 }),
        expect.objectContaining({ role: 'sandbox', processCount: 1 }),
      ],
    });
  });

  it('separates private memory classes and reports closed process roles', () => {
    const procRoot = mkdtempSync(join(tmpdir(), 'pico-proc-'));
    mkdirSync(join(procRoot, '101'), { recursive: true });
    mkdirSync(join(procRoot, '102'), { recursive: true });
    mkdirSync(join(procRoot, 'not-a-pid'), { recursive: true });
    writeFileSync(join(procRoot, '101', 'status'), 'Name:\tpico\nPPid:\t1\nVmRSS:\t42 kB\n');
    writeFileSync(join(procRoot, '102', 'status'), 'Name:\tpico-child\nPPid:\t101\n');
    writeFileSync(join(procRoot, '101', 'cmdline'), '/opt/pico\0--user-data-dir=/tmp\0');
    writeFileSync(join(procRoot, '102', 'cmdline'), '/opt/pico\0--type=utility\0');
    writeFileSync(join(procRoot, '101', 'smaps_rollup'), [
      'Rss: 42 kB',
      'Pss: 21 kB',
      'Private_Clean: 3 kB',
      'Private_Dirty: 4 kB',
      'Private_Hugetlb: 2 kB',
    ].join('\n'));
    writeFileSync(join(procRoot, '102', 'smaps_rollup'), [
      'Rss: 0 kB',
      'Pss: 0 kB',
      'Private_Clean: 0 kB',
      'Private_Dirty: 0 kB',
    ].join('\n'));

    const expectedProcesses: PicoLinuxProcessMemory[] = [
      {
        pid: 101,
        parentPid: 1,
        role: 'browser',
        rssBytes: 42 * 1_024,
        proportionalBytes: 21 * 1_024,
        privateCleanBytes: 3 * 1_024,
        privateDirtyBytes: 4 * 1_024,
        privateHugetlbBytes: 2 * 1_024,
        privateBytes: 9 * 1_024,
      },
      {
        pid: 102,
        parentPid: 101,
        role: 'utility',
        rssBytes: 0,
        proportionalBytes: 0,
        privateCleanBytes: 0,
        privateDirtyBytes: 0,
        privateHugetlbBytes: 0,
        privateBytes: 0,
      },
    ];
    const rolesByPid = new Map<number, PicoLinuxProcessRole>([
      [101, 'browser'],
      [102, 'utility'],
    ]);

    try {
      expect(readPicoLinuxProcessTable(procRoot, 101, rolesByPid)).toEqual(expectedProcesses);
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
      expect(readPicoLinuxProcessTable(procRoot, 101, rolesByPid)).toEqual(expectedProcesses);
    } finally {
      rmSync(procRoot, { recursive: true });
    }
  });

  it('maps Electron process metrics into a closed role vocabulary', () => {
    expect([
      'Browser',
      'Tab',
      'Utility',
      'Zygote',
      'Sandbox helper',
      'GPU',
      'Pepper Plugin',
      'Unknown',
    ].map(picoLinuxProcessRoleFromElectronType)).toEqual([
      'browser',
      'renderer',
      'utility',
      'zygote',
      'sandbox',
      'gpu-process',
      'other',
      'other',
    ]);
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
