import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLinuxPicoCompanionPresenceProbe } from './presence-probe.js';

/**
 * ADR 0126 P2 on Linux. The two affordances this shell cannot know without
 * looking - and the property that makes looking safe.
 */
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function sandbox(): { binDir: string; devDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'pico-presence-probe-'));
  dirs.push(dir);
  const binDir = join(dir, 'bin');
  const devDir = join(dir, 'dev');
  mkdirSync(binDir);
  mkdirSync(devDir);
  return { binDir, devDir };
}

describe('ADR 0126 P2 - observing rather than assuming', () => {
  it('needs the decoder and a device before it claims a camera', () => {
    // ADR 0112 S3 needs both halves: either alone scans nothing, and
    // declaring the affordance on either alone would be a fact that fails at
    // the moment somebody needs it.
    const { binDir, devDir } = sandbox();
    const probe = () => createLinuxPicoCompanionPresenceProbe({ PATH: binDir }, devDir);

    expect(probe().canScanWithCamera()).toBe(false);

    writeFileSync(join(binDir, 'zbarcam'), '');
    expect(probe().canScanWithCamera()).toBe(false);

    writeFileSync(join(devDir, 'video0'), '');
    expect(probe().canScanWithCamera()).toBe(true);
  });

  it('claims a printer only with a spooler on the path', () => {
    const { binDir, devDir } = sandbox();
    expect(createLinuxPicoCompanionPresenceProbe({ PATH: binDir }, devDir).canPrint()).toBe(false);
    writeFileSync(join(binDir, 'lp'), '');
    expect(createLinuxPicoCompanionPresenceProbe({ PATH: binDir }, devDir).canPrint()).toBe(true);
  });

  it('answers no rather than throwing when there is nothing to look at', () => {
    // A throw here would make a probe about hardware into a reason the
    // presence never announces at all.
    const probe = createLinuxPicoCompanionPresenceProbe({}, '/nonexistent-root');
    expect(probe.canScanWithCamera()).toBe(false);
    expect(probe.canPrint()).toBe(false);
  });

  it('reads a directory rather than running the thing it is asking about', () => {
    // A probe that spawned `zbarcam` would open a camera to answer a question
    // about a filesystem, and one that spawned `lp` would put a job in a
    // queue. Named files with no execute bit are enough to answer, which is
    // the proof nothing was run.
    const { binDir, devDir } = sandbox();
    writeFileSync(join(binDir, 'zbarcam'), 'not an executable');
    writeFileSync(join(binDir, 'lp'), 'not an executable');
    writeFileSync(join(devDir, 'video3'), '');
    const probe = createLinuxPicoCompanionPresenceProbe({ PATH: binDir }, devDir);
    expect(probe.canScanWithCamera()).toBe(true);
    expect(probe.canPrint()).toBe(true);
  });
});
