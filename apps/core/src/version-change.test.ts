import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describePicoVersionChange } from '@pico/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openPicoHomeRecoveryAnchor } from './recovery-anchor.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('ADR 0122 Y6 which way the version moved', () => {
  it('calls the first boot a first boot, not an upgrade', () => {
    expect(describePicoVersionChange({ previousVersion: null, version: '0.1.9' }))
      .toEqual({ previousVersion: null, version: '0.1.9', direction: 'first_boot' });
  });

  it('says nothing when the version did not move', () => {
    // The common boot must not fill the log with a sentence about standing
    // still.
    expect(describePicoVersionChange({ previousVersion: '0.1.9', version: '0.1.9' }))
      .toBeNull();
  });

  it('names a downgrade as a downgrade', () => {
    // The one direction that can reintroduce a fixed flaw. An installation
    // that cannot say which way it moved cannot tell an update from an attack.
    expect(describePicoVersionChange({ previousVersion: '0.2.0', version: '0.1.9' })?.direction)
      .toBe('downgrade');
  });

  it('orders numerically rather than as text', () => {
    // '0.1.10' sorts below '0.1.9' as a string, which would report a real
    // upgrade as a downgrade and hide a real one.
    expect(describePicoVersionChange({ previousVersion: '0.1.9', version: '0.1.10' })?.direction)
      .toBe('upgrade');
    expect(describePicoVersionChange({ previousVersion: '0.1.10', version: '0.1.9' })?.direction)
      .toBe('downgrade');
  });

  it('reports a change it cannot order without guessing the direction wrong', () => {
    const change = describePicoVersionChange({ previousVersion: '0.1.9-rc1', version: '0.1.9' });
    expect(change?.previousVersion).toBe('0.1.9-rc1');
    expect(change?.version).toBe('0.1.9');
  });
});

describe('ADR 0122 Y6 the boot records it', () => {
  it('records the first boot without announcing a change', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-version-'));
    tempDirs.push(dir);
    const databasePath = join(dir, 'pico.sqlite');

    const first = await buildApp({
      host: '127.0.0.1', port: 0, databasePath, deviceId: 'pico-core',
    });
    let events = (await first.inject({ method: 'GET', url: '/api/events?limit=50' }))
      .json().events as Array<{ type: string; payload: Record<string, unknown> }>;
    // Nothing changed - this is the beginning. The version is recorded so the
    // next boot has something to compare against.
    expect(events.filter((event) => event.type === 'home.version_changed')).toHaveLength(0);
    await first.close();

    // Restarting on the same version says nothing new.
    const second = await buildApp({
      host: '127.0.0.1', port: 0, databasePath, deviceId: 'pico-core',
    });
    try {
      events = (await second.inject({ method: 'GET', url: '/api/events?limit=50' }))
        .json().events as Array<{ type: string; payload: Record<string, unknown> }>;
      expect(events.filter((event) => event.type === 'home.version_changed')).toHaveLength(0);
    } finally {
      await second.close();
    }
  });

  it('records into an anchor that owns something, and never creates one', () => {
    // Where the version lives is the point: a restore brings back the
    // Foundation snapshot *and* its record of what was running, so a downgrade
    // would look like continuity. The anchor is outside every restorable
    // snapshot, so it still remembers.
    //
    // The second half is the one a test had to catch. ADR 0110 R6 keeps a Home
    // closed when its anchor is missing until a person re-seeds it. If
    // recording the version wrote a file, a lost anchor would quietly become a
    // fresh empty one that answers every question with "nothing was ever
    // consumed" - and the block that exists to notice a restore would be gone.
    const dir = mkdtempSync(join(tmpdir(), 'pico-version-anchor-'));
    tempDirs.push(dir);
    const anchorPath = join(dir, 'anchor.json');

    const untouched = openPicoHomeRecoveryAnchor(anchorPath);
    expect(untouched.isEmpty()).toBe(true);
    expect(untouched.observeServiceVersion('0.1.9')).toBeNull();
    expect(existsSync(anchorPath)).toBe(false);

    // Once it owns something, it remembers.
    untouched.seed({ homeId: 'home_version', entries: [] });
    expect(untouched.observeServiceVersion('0.1.9')).toBeNull();
    expect(JSON.parse(readFileSync(anchorPath, 'utf8')).serviceVersion).toBe('0.1.9');
    expect(untouched.observeServiceVersion('0.2.0')).toBe('0.1.9');
    expect(JSON.parse(readFileSync(anchorPath, 'utf8')).serviceVersion).toBe('0.2.0');
  });
});
