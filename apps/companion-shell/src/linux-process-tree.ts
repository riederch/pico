import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface PicoLinuxProcessMemory {
  pid: number;
  parentPid: number;
  role: PicoLinuxProcessRole;
  rssBytes: number;
  proportionalBytes: number;
  privateCleanBytes: number;
  privateDirtyBytes: number;
  privateHugetlbBytes: number;
  privateBytes: number;
}

export type PicoLinuxProcessRole =
  | 'browser'
  | 'zygote'
  | 'gpu-process'
  | 'utility'
  | 'renderer'
  | 'sandbox'
  | 'crashpad'
  | 'other';

export interface PicoLinuxProcessRoleMemory {
  role: PicoLinuxProcessRole;
  processCount: number;
  rssBytes: number;
  proportionalBytes: number;
  privateCleanBytes: number;
  privateDirtyBytes: number;
  privateHugetlbBytes: number;
  privateBytes: number;
}

export interface PicoLinuxProcessTreeMemory {
  processCount: number;
  rssBytes: number;
  proportionalBytes: number;
  privateCleanBytes: number;
  privateDirtyBytes: number;
  privateHugetlbBytes: number;
  privateBytes: number;
  processMemoryByRole: PicoLinuxProcessRoleMemory[];
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
  rolesByPid: ReadonlyMap<number, PicoLinuxProcessRole> = new Map(),
): PicoLinuxProcessMemory[] {
  const processStatuses: Array<{
    pid: number;
    parentPid: number;
    role: PicoLinuxProcessRole;
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
        role: readProcessRole(procRoot, Number(entry.name), rootPid, rolesByPid),
        rssBytes: rssKiB * 1_024,
      });
    } catch {
      // Processes may exit while /proc is being read.
    }
  }

  const selectedPids = rootPid === undefined
    ? new Set(processStatuses.map((process) => process.pid))
    : processTreePids(processStatuses, new Set([rootPid, ...rolesByPid.keys()]));
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
      const privateCleanKiB = readRollupKiB(rollup, 'Private_Clean');
      const privateDirtyKiB = readRollupKiB(rollup, 'Private_Dirty');
      const privateHugetlbKiB = readRollupKiB(rollup, 'Private_Hugetlb');
      processes.push({
        ...process,
        proportionalBytes: proportionalKiB * 1_024,
        privateCleanBytes: privateCleanKiB * 1_024,
        privateDirtyBytes: privateDirtyKiB * 1_024,
        privateHugetlbBytes: privateHugetlbKiB * 1_024,
        privateBytes: (privateCleanKiB + privateDirtyKiB + privateHugetlbKiB) * 1_024,
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
  associatedPids: ReadonlySet<number> = new Set(),
): PicoLinuxProcessTreeMemory {
  const treePids = processTreePids(processes, new Set([rootPid, ...associatedPids]));

  let rssBytes = 0;
  let proportionalBytes = 0;
  let privateCleanBytes = 0;
  let privateDirtyBytes = 0;
  let privateHugetlbBytes = 0;
  let privateBytes = 0;
  let processCount = 0;
  const roleMemory = new Map<PicoLinuxProcessRole, PicoLinuxProcessRoleMemory>();
  for (const process of processes) {
    if (treePids.has(process.pid)) {
      rssBytes += process.rssBytes;
      proportionalBytes += process.proportionalBytes;
      privateCleanBytes += process.privateCleanBytes;
      privateDirtyBytes += process.privateDirtyBytes;
      privateHugetlbBytes += process.privateHugetlbBytes;
      privateBytes += process.privateBytes;
      processCount += 1;
      const role = roleMemory.get(process.role) ?? emptyRoleMemory(process.role);
      role.processCount += 1;
      role.rssBytes += process.rssBytes;
      role.proportionalBytes += process.proportionalBytes;
      role.privateCleanBytes += process.privateCleanBytes;
      role.privateDirtyBytes += process.privateDirtyBytes;
      role.privateHugetlbBytes += process.privateHugetlbBytes;
      role.privateBytes += process.privateBytes;
      roleMemory.set(process.role, role);
    }
  }
  return {
    processCount,
    rssBytes,
    proportionalBytes,
    privateCleanBytes,
    privateDirtyBytes,
    privateHugetlbBytes,
    privateBytes,
    processMemoryByRole: processRoleOrder
      .flatMap((role) => roleMemory.has(role) ? [roleMemory.get(role)!] : []),
  };
}

const processRoleOrder: readonly PicoLinuxProcessRole[] = [
  'browser',
  'zygote',
  'gpu-process',
  'utility',
  'renderer',
  'sandbox',
  'crashpad',
  'other',
];

function emptyRoleMemory(role: PicoLinuxProcessRole): PicoLinuxProcessRoleMemory {
  return {
    role,
    processCount: 0,
    rssBytes: 0,
    proportionalBytes: 0,
    privateCleanBytes: 0,
    privateDirtyBytes: 0,
    privateHugetlbBytes: 0,
    privateBytes: 0,
  };
}

function readRollupKiB(rollup: string, field: string): number {
  return Number(new RegExp(`^${field}:\\s+(\\d+)\\s+kB$`, 'm').exec(rollup)?.[1] ?? 0);
}

function readProcessRole(
  procRoot: string,
  pid: number,
  rootPid: number | undefined,
  rolesByPid: ReadonlyMap<number, PicoLinuxProcessRole>,
): PicoLinuxProcessRole {
  const electronRole = rolesByPid.get(pid);
  if (electronRole !== undefined) {
    return electronRole;
  }
  if (pid === rootPid) {
    return 'browser';
  }
  try {
    const commandLine = readFileSync(join(procRoot, String(pid), 'cmdline'), 'utf8');
    const type = /(?:^|\0)--type=([^\0]+)(?:\0|$)/.exec(commandLine)?.[1];
    if (type === 'zygote' || type === 'gpu-process'
      || type === 'utility' || type === 'renderer') {
      return type;
    }
    if (type === 'crashpad-handler' || commandLine.includes('chrome_crashpad_handler')) {
      return 'crashpad';
    }
    if (commandLine.includes('chrome-sandbox')) {
      return 'sandbox';
    }
  } catch {
    // A selected process may exit or restrict cmdline while /proc is read.
  }
  return 'other';
}

export function picoLinuxProcessRoleFromElectronType(type: string): PicoLinuxProcessRole {
  switch (type) {
    case 'Browser':
      return 'browser';
    case 'Tab':
      return 'renderer';
    case 'Utility':
      return 'utility';
    case 'Zygote':
      return 'zygote';
    case 'Sandbox helper':
      return 'sandbox';
    case 'GPU':
      return 'gpu-process';
    default:
      return 'other';
  }
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
  rootPids: ReadonlySet<number>,
): Set<number> {
  const treePids = new Set(rootPids);
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
