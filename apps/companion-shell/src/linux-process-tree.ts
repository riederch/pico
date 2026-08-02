import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface PicoLinuxProcessMemory {
  pid: number;
  parentPid: number;
  rssBytes: number;
  proportionalBytes: number;
  privateBytes: number;
}

export interface PicoLinuxProcessTreeMemory {
  processCount: number;
  rssBytes: number;
  proportionalBytes: number;
  privateBytes: number;
}

export type PicoLinuxResourceLimit = number | 'unlimited';

export interface PicoLinuxCoreDumpLimits {
  softBytes: PicoLinuxResourceLimit;
  hardBytes: PicoLinuxResourceLimit;
}

export function readPicoLinuxCoreDumpLimits(
  limitsPath = '/proc/self/limits',
): PicoLinuxCoreDumpLimits {
  const limits = readFileSync(limitsPath, 'utf8');
  const match = /^Max core file size\s+(\S+)\s+(\S+)\s+bytes\s*$/m.exec(limits);
  if (match === null) {
    throw new Error('linux_core_dump_limit_unavailable');
  }
  return {
    softBytes: parseResourceLimit(match[1]),
    hardBytes: parseResourceLimit(match[2]),
  };
}

export function readPicoLinuxProcessTable(
  procRoot = '/proc',
  rootPid?: number,
): PicoLinuxProcessMemory[] {
  const processStatuses: Array<{
    pid: number;
    parentPid: number;
    rssBytes: number;
  }> = [];
  for (const entry of readdirSync(procRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) {
      continue;
    }
    try {
      const status = readFileSync(join(procRoot, entry.name, 'status'), 'utf8');
      const parentPid = Number(/^PPid:\s+(\d+)$/m.exec(status)?.[1]);
      const rssKiB = Number(/^VmRSS:\s+(\d+)\s+kB$/m.exec(status)?.[1] ?? 0);
      if (!Number.isSafeInteger(parentPid) || !Number.isSafeInteger(rssKiB)) {
        continue;
      }
      processStatuses.push({
        pid: Number(entry.name),
        parentPid,
        rssBytes: rssKiB * 1_024,
      });
    } catch {
      // Processes may exit while /proc is being read.
    }
  }

  const selectedPids = rootPid === undefined
    ? new Set(processStatuses.map((process) => process.pid))
    : processTreePids(processStatuses, rootPid);
  const processes: PicoLinuxProcessMemory[] = [];
  for (const process of processStatuses) {
    if (!selectedPids.has(process.pid)) {
      continue;
    }
    try {
      const rollup = readFileSync(
        join(procRoot, String(process.pid), 'smaps_rollup'),
        'utf8',
      );
      const proportionalKiB = Number(/^Pss:\s+(\d+)\s+kB$/m.exec(rollup)?.[1] ?? 0);
      const privateKiB = [...rollup.matchAll(
        /^Private_(?:Clean|Dirty|Hugetlb):\s+(\d+)\s+kB$/gm,
      )].reduce((total, match) => total + Number(match[1]), 0);
      processes.push({
        ...process,
        proportionalBytes: proportionalKiB * 1_024,
        privateBytes: privateKiB * 1_024,
      });
    } catch {
      // A selected process may still exit between status and smaps reads.
    }
  }
  return processes;
}

export function picoLinuxProcessTreeMemory(
  processes: readonly PicoLinuxProcessMemory[],
  rootPid: number,
): PicoLinuxProcessTreeMemory {
  const treePids = processTreePids(processes, rootPid);

  let rssBytes = 0;
  let proportionalBytes = 0;
  let privateBytes = 0;
  let processCount = 0;
  for (const process of processes) {
    if (treePids.has(process.pid)) {
      rssBytes += process.rssBytes;
      proportionalBytes += process.proportionalBytes;
      privateBytes += process.privateBytes;
      processCount += 1;
    }
  }
  return { processCount, rssBytes, proportionalBytes, privateBytes };
}

function parseResourceLimit(value: string | undefined): PicoLinuxResourceLimit {
  if (value === 'unlimited') {
    return value;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('invalid_linux_resource_limit');
  }
  return parsed;
}

function processTreePids(
  processes: ReadonlyArray<{ pid: number; parentPid: number }>,
  rootPid: number,
): Set<number> {
  const treePids = new Set([rootPid]);
  let discovered = true;
  while (discovered) {
    discovered = false;
    for (const process of processes) {
      if (treePids.has(process.parentPid) && !treePids.has(process.pid)) {
        treePids.add(process.pid);
        discovered = true;
      }
    }
  }
  return treePids;
}
