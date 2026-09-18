import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  openPicoTpm2AnchorCounter,
  picoPlatformAnchorVerdicts,
  verifyPicoPlatformAnchorGeneration,
  type PicoPlatformAnchorCounter,
} from './platform-anchor.js';
import { openPicoHomeRecoveryAnchor } from './recovery-anchor.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function anchorPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-platform-anchor-'));
  tempDirs.push(dir);
  return join(dir, 'anchor.json');
}

/** A counter with the one property that matters: it never goes down. */
function fakeCounter(start = 0): PicoPlatformAnchorCounter & { value: number } {
  const counter = {
    value: start,
    read: () => counter.value,
    increment: () => {
      counter.value += 1;
      return counter.value;
    },
  };
  return counter;
}

function recordInput(recoveryId: string) {
  return {
    recoveryId,
    claimDigestHex: 'aa'.repeat(32),
    picoIdentityFingerprintHex: 'bb'.repeat(32),
    state: 'accepted' as const,
    expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
  };
}

describe('ADR 0027 IM1 platform anchor generation', () => {
  it('accepts a document written at the generation the counter reads', () => {
    expect(verifyPicoPlatformAnchorGeneration({ documentValue: 7, counterValue: 7 }))
      .toBe('consistent');
  });

  it('adopts the counter for a document that never took ownership', () => {
    // Nothing to have been rolled back to yet, so adoption is correct here and
    // only here.
    expect(verifyPicoPlatformAnchorGeneration({ documentValue: null, counterValue: 42 }))
      .toBe('consistent');
  });

  it('reads one generation ahead as the crash window, not as tampering', () => {
    // The document is written before the counter is bumped, so this is what a
    // crash between the two looks like. Being ahead costs one re-initiation;
    // the opposite ordering would brick the anchor on every crash.
    expect(verifyPicoPlatformAnchorGeneration({ documentValue: 8, counterValue: 7 }))
      .toBe('pending_write');
  });

  it('catches a document from a generation the platform has already passed', () => {
    // The whole point. A whole-filesystem rollback restores an older document,
    // and the counter cannot be rolled back with it.
    expect(verifyPicoPlatformAnchorGeneration({ documentValue: 3, counterValue: 9 }))
      .toBe('rolled_back');
  });

  it('separates a foreign counter from a rollback', () => {
    // Further ahead than one write can explain: a cloned image or a replaced
    // secure element. Not a rollback, and not something to guess about.
    expect(verifyPicoPlatformAnchorGeneration({ documentValue: 30, counterValue: 9 }))
      .toBe('foreign_counter');
  });

  it('refuses a counter reading it cannot compare', () => {
    for (const counterValue of [-1, 1.5, Number.NaN]) {
      expect(() => verifyPicoPlatformAnchorGeneration({ documentValue: 1, counterValue }))
        .toThrow(/invalid_pico_platform_anchor_counter/u);
    }
    expect(() => verifyPicoPlatformAnchorGeneration({ documentValue: -2, counterValue: 1 }))
      .toThrow(/invalid_pico_platform_anchor_generation/u);
  });

  it('names every verdict it can return', () => {
    expect([...picoPlatformAnchorVerdicts])
      .toEqual(['consistent', 'pending_write', 'rolled_back', 'foreign_counter']);
  });
});

describe('ADR 0027 IM1 anchor on the platform substrate', () => {
  it('advances the counter with every write and records the generation', () => {
    const path = anchorPath();
    const counter = fakeCounter();
    const anchor = openPicoHomeRecoveryAnchor(path, { platformCounter: counter });

    anchor.record(recordInput('recovery-1'));
    const afterFirst = counter.value;
    expect(afterFirst).toBeGreaterThan(0);
    expect(JSON.parse(readFileSync(path, 'utf8')).platformCounter).toBe(afterFirst);

    anchor.record(recordInput('recovery-2'));
    expect(counter.value).toBe(afterFirst + 1);
    expect(JSON.parse(readFileSync(path, 'utf8')).platformCounter).toBe(afterFirst + 1);
  });

  it('refuses to open a rolled-back anchor', () => {
    const path = anchorPath();
    const counter = fakeCounter();

    const anchor = openPicoHomeRecoveryAnchor(path, { platformCounter: counter });
    anchor.record(recordInput('recovery-1'));
    const snapshot = readFileSync(path, 'utf8');
    anchor.record(recordInput('recovery-2'));
    anchor.record(recordInput('recovery-3'));

    // The filesystem goes back; the counter cannot. This is the residual ADR
    // 0110, 0120 and 0121 all name, closed on this path.
    writeFileSync(path, snapshot);

    expect(() => openPicoHomeRecoveryAnchor(path, { platformCounter: counter }))
      .toThrow(/pico_platform_anchor_rolled_back/u);
  });

  it('still opens after a crash between the write and the bump', () => {
    const path = anchorPath();
    const counter = fakeCounter();
    const anchor = openPicoHomeRecoveryAnchor(path, { platformCounter: counter });
    anchor.record(recordInput('recovery-1'));

    // Exactly the crash window: the document landed, the counter did not move.
    const document = JSON.parse(readFileSync(path, 'utf8')) as { platformCounter: number };
    counter.value = document.platformCounter - 1;

    const reopened = openPicoHomeRecoveryAnchor(path, { platformCounter: counter });
    expect(reopened.isCompletable({
      recoveryId: 'recovery-1',
      claimDigestHex: 'aa'.repeat(32),
    })).toBe(true);
  });

  it('refuses a document written against a different counter', () => {
    const path = anchorPath();
    const anchor = openPicoHomeRecoveryAnchor(path, { platformCounter: fakeCounter(500) });
    anchor.record(recordInput('recovery-1'));

    // A replaced secure element reads far below what the document claims.
    expect(() => openPicoHomeRecoveryAnchor(path, { platformCounter: fakeCounter(2) }))
      .toThrow(/pico_platform_anchor_foreign_counter/u);
  });

  it('leaves the filesystem substrate untouched when no counter is supplied', () => {
    // ADR 0027 IM1: hardware without a secure element is not a lesser
    // appliance. No counter means no generation field and no new failure mode -
    // the filesystem substrate with its stated residuals, exactly as before.
    const path = anchorPath();
    const anchor = openPicoHomeRecoveryAnchor(path);
    anchor.record(recordInput('recovery-1'));

    expect(JSON.parse(readFileSync(path, 'utf8')).platformCounter).toBeUndefined();
    expect(() => openPicoHomeRecoveryAnchor(path)).not.toThrow();
  });

  it('stops if something else is spending the counter', () => {
    const path = anchorPath();
    const counter = fakeCounter();
    const contended: PicoPlatformAnchorCounter = {
      read: () => counter.read(),
      increment: () => {
        counter.increment();
        return counter.increment();
      },
    };
    const anchor = openPicoHomeRecoveryAnchor(path, { platformCounter: contended });

    // Generations that skip are generations that no longer mean what they say.
    expect(() => anchor.record(recordInput('recovery-1')))
      .toThrow(/pico_platform_anchor_counter_contended/u);
  });
});

describe('ADR 0027 IM1 tpm2 counter adapter', () => {
  it('reads a big-endian 64-bit counter', () => {
    const calls: string[] = [];
    const counter = openPicoTpm2AnchorCounter({
      run: (command) => {
        calls.push(command);
        const stdout = Buffer.alloc(8);
        stdout.writeBigUInt64BE(9n, 0);
        return { status: 0, stdout, stderr: Buffer.alloc(0) };
      },
    });

    expect(counter.read()).toBe(9);
    expect(calls).toEqual(['tpm2_nvread']);
  });

  it('increments before reading back', () => {
    const calls: string[] = [];
    let value = 4n;
    const counter = openPicoTpm2AnchorCounter({
      run: (command) => {
        calls.push(command);
        if (command === 'tpm2_nvincrement') {
          value += 1n;
          return { status: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
        }
        const stdout = Buffer.alloc(8);
        stdout.writeBigUInt64BE(value, 0);
        return { status: 0, stdout, stderr: Buffer.alloc(0) };
      },
    });

    expect(counter.increment()).toBe(5);
    expect(calls).toEqual(['tpm2_nvincrement', 'tpm2_nvread']);
  });

  it('refuses a counter too large to compare exactly', () => {
    // Rounding a 64-bit value into a double would let a rollback compare equal.
    const counter = openPicoTpm2AnchorCounter({
      run: () => {
        const stdout = Buffer.alloc(8);
        stdout.writeBigUInt64BE(2n ** 60n, 0);
        return { status: 0, stdout, stderr: Buffer.alloc(0) };
      },
    });

    expect(() => counter.read()).toThrow(/pico_tpm2_counter_out_of_range/u);
  });

  it('refuses a reading that is not eight bytes', () => {
    const counter = openPicoTpm2AnchorCounter({
      run: () => ({ status: 0, stdout: Buffer.alloc(4), stderr: Buffer.alloc(0) }),
    });

    expect(() => counter.read()).toThrow(/pico_tpm2_unexpected_counter_width:4/u);
  });

  it('distinguishes a missing tool from a refusing one', () => {
    const missing = openPicoTpm2AnchorCounter({
      run: () => ({
        status: null,
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        error: new Error('spawn tpm2_nvread ENOENT'),
      }),
    });
    expect(() => missing.read()).toThrow(/pico_tpm2_unavailable/u);

    const refusing = openPicoTpm2AnchorCounter({
      run: () => ({
        status: 1,
        stdout: Buffer.alloc(0),
        stderr: Buffer.from('ERROR: authorization failure\n'),
      }),
    });
    // A TPM that refuses is not a TPM that is absent, and the difference
    // decides whether the honest fallback applies.
    expect(() => refusing.read()).toThrow(/pico_tpm2_failed:tpm2_nvread:ERROR: authorization failure/u);
  });
});

/**
 * Befund B214. Der Anker traegt die Rechte einer liegengebliebenen `.tmp` nicht.
 *
 * **Warum gerade dieser Fall.** `mode` in `writeFileSync` gilt nur beim
 * Anlegen; oeffnet es eine `.tmp` von einem abgestuerzten Vorlauf, bleiben
 * deren Rechte stehen und das Umbenennen traegt sie auf den Anker. Ein Test,
 * der nur "die Datei ist 0600" prueft, besteht auch ohne die Verengung - genau
 * das hat B121 an der eigenen Pflanzung gemessen. Deshalb wird hier eine offene
 * Zwischendatei **hingelegt**, bevor der Anker schreibt.
 *
 * Was auf dem Spiel steht: der Zeitboden der Einspruchsfenster (ADR 0120 N2),
 * der Plattformzaehlerstand und die Auditpruefpunkte.
 */
describe('ADR 0120 N2 mit B214 - die Rechte des Ankers', () => {
  it('erbt die Rechte einer liegengebliebenen Zwischendatei nicht', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-anchor-mode-'));
    tempDirs.push(dir);
    const anchorPath = join(dir, 'recovery-anchor.json');
    // Ein abgestuerzter Vorlauf hat sie offen liegenlassen.
    writeFileSync(`${anchorPath}.tmp`, '{}\n', { mode: 0o644 });
    chmodSync(`${anchorPath}.tmp`, 0o644);

    const anchor = openPicoHomeRecoveryAnchor(anchorPath);
    anchor.auditCheckpoint('pico-core');
    anchor.recordAuditCheckpoint({
      writerId: 'pico-core', chainPosition: 1, headDigestHex: 'ab'.repeat(32),
    });

    expect(statSync(anchorPath).mode & 0o777).toBe(0o600);
  });
});
