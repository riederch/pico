import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPicoTpm2AnchorCounter } from './platform-anchor.js';
import { openPicoHomeRecoveryAnchor } from './recovery-anchor.js';

/**
 * ADR 0027 IM1 against a real TPM implementation.
 *
 * The unit tests above drive the adapter with a fake `run`, which proves the
 * parsing and the error split but not that the commands are the right ones. A
 * software TPM closes that gap: same `tpm2-tools` binaries, same NV counter
 * semantics, no dependence on the developer's own hardware - and nothing
 * written to it. Defining an NV index consumes limited, persistent storage on
 * a real TPM, so this must never point at one.
 *
 * Skipped rather than failed where the tools are absent, which is most CI
 * images. A skipped run is reported as such by vitest, so this cannot quietly
 * become a test that proves nothing.
 */
const toolsPresent = ['swtpm', 'tpm2_nvdefine', 'tpm2_nvincrement', 'tpm2_nvread']
  .every((binary) => spawnSync('sh', ['-c', `command -v ${binary}`]).status === 0);

const nvIndex = '0x1500017';

let stateDir: string | undefined;
let daemon: ChildProcess | undefined;
let tcti: string | undefined;

beforeAll(async () => {
  if (!toolsPresent) {
    return;
  }
  // Short prefix on purpose: a unix socket path is capped near 108 bytes, and
  // the usual scratch directory is already longer than that.
  stateDir = mkdtempSync('/tmp/pico-tpm-');
  const socketPath = join(stateDir, 's');
  daemon = spawn('swtpm', [
    'socket',
    '--tpmstate', `dir=${stateDir}`,
    '--ctrl', `type=unixio,path=${socketPath}.ctrl`,
    '--server', `type=unixio,path=${socketPath}`,
    '--tpm2',
    '--flags', 'not-need-init,startup-clear',
  ], { stdio: 'ignore', detached: true });

  tcti = `swtpm:path=${socketPath}`;
  const env = { ...process.env, TPM2TOOLS_TCTI: tcti };

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (spawnSync('tpm2_getcap', ['properties-fixed'], { env, timeout: 5_000 }).status === 0) {
      break;
    }
    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 100);
    });
  }

  const defined = spawnSync(
    'tpm2_nvdefine',
    [nvIndex, '-C', 'o', '-a', 'ownerread|authread|authwrite|nt=1'],
    { env, timeout: 10_000 },
  );
  expect(defined.status, defined.stderr?.toString()).toBe(0);
  // A fresh NV counter must be incremented once before it can be read.
  expect(spawnSync('tpm2_nvincrement', [nvIndex], { env, timeout: 10_000 }).status).toBe(0);
}, 30_000);

afterAll(() => {
  if (daemon?.pid !== undefined) {
    try {
      process.kill(-daemon.pid, 'SIGKILL');
    } catch {
      daemon.kill('SIGKILL');
    }
  }
  if (stateDir !== undefined) {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

describe.skipIf(!toolsPresent)('ADR 0027 IM1 tpm2 counter against a software TPM', () => {
  it('reads and increments a real NV counter', () => {
    const counter = openPicoTpm2AnchorCounter({ nvIndex, tcti });

    const first = counter.read();
    expect(Number.isSafeInteger(first)).toBe(true);
    expect(first).toBeGreaterThan(0);

    expect(counter.increment()).toBe(first + 1);
    expect(counter.read()).toBe(first + 1);
    expect(counter.increment()).toBe(first + 2);
  });

  it('cannot be rewound, which is the only property the anchor needs', () => {
    const counter = openPicoTpm2AnchorCounter({ nvIndex, tcti });
    const before = counter.read();

    // There is no tpm2 command that lowers an `nt=1` counter; a write attempt
    // is refused by the hardware, not by this code.
    const attempt = spawnSync(
      'tpm2_nvwrite',
      [nvIndex, '-i', '-'],
      {
        env: { ...process.env, TPM2TOOLS_TCTI: tcti ?? '' },
        input: Buffer.alloc(8),
        timeout: 10_000,
      },
    );
    expect(attempt.status).not.toBe(0);
    expect(counter.read()).toBe(before);
  });

  it('catches a rolled-back anchor document end to end', () => {
    const dir = mkdtempSync('/tmp/pico-tpm-anchor-');
    try {
      const anchorPath = join(dir, 'anchor.json');
      const counter = openPicoTpm2AnchorCounter({ nvIndex, tcti });
      const entry = (recoveryId: string) => ({
        recoveryId,
        claimDigestHex: 'aa'.repeat(32),
        picoIdentityFingerprintHex: 'bb'.repeat(32),
        state: 'accepted' as const,
        expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
      });

      const anchor = openPicoHomeRecoveryAnchor(anchorPath, { platformCounter: counter });
      anchor.record(entry('recovery-1'));
      const snapshot = readFileSync(anchorPath, 'utf8');
      anchor.record(entry('recovery-2'));

      // The whole-filesystem rollback all of ADR 0110, 0120 and 0121 name -
      // against a counter the operating system cannot rewind.
      writeFileSync(anchorPath, snapshot);
      expect(() => openPicoHomeRecoveryAnchor(anchorPath, { platformCounter: counter }))
        .toThrow(/pico_platform_anchor_rolled_back/u);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
