import { describe, expect, it } from 'vitest';
import {
  assertPicoTrayMemoryBudgets,
  picoTrayMemoryBudgetMode,
  picoTrayPrivateDirtyAndHugetlbBudgetBytes,
  picoTrayProportionalBudgetBytes,
} from './tray-memory-budget.mjs';

/**
 * ADR 0113 C3's residual, tested in the branch nobody runs.
 *
 * The strict half only executes under the root-owned setuid probe, which needs
 * sudo and therefore never runs on the machine where a regression would first
 * appear. Held here instead, so "the gate stopped failing locally" cannot
 * quietly become "the gate stopped checking".
 */
const report = {
  proportionalBudgetBytes: picoTrayProportionalBudgetBytes,
  privateDirtyAndHugetlbBudgetBytes: picoTrayPrivateDirtyAndHugetlbBudgetBytes,
  proportionalBytes: 210_000_000,
  privateDirtyAndHugetlbBytes: 100_000_000,
  privateBytes: 112_000_000,
  rssBytes: 520_000_000,
  underBudget: true,
};

const check = (overrides = {}, mode = picoTrayMemoryBudgetMode) =>
  assertPicoTrayMemoryBudgets({
    report: { ...report, ...overrides },
    mode,
    memoryContext: 'a context',
    environmentVariable: 'PICO_COMPANION_ROOT_OWNED_PACKAGE_PROBE',
  });

describe('the mode the budget was defined for', () => {
  it('asserts the PSS limit strictly and says nothing when it holds', () => {
    expect(check()).toEqual([]);
  });

  it('fails on an overrun, naming the number and the mode', () => {
    expect(() => check({ proportionalBytes: 225_000_001 }))
      .toThrow('exceeds the strict 225 MB budget');
    // Equality is an overrun: the budget is a ceiling the run stays below.
    expect(() => check({ proportionalBytes: picoTrayProportionalBudgetBytes }))
      .toThrow('exceeds the strict 225 MB budget');
  });

  it('does not let the probe’s own verdict smuggle the limit back in', () => {
    // A probe that measured itself under budget while reporting false is a
    // disagreement, and a gate that trusts the number over the verdict has
    // stopped checking one of them.
    expect(() => check({ underBudget: false }))
      .toThrow('did not pass its own PSS/private budget gates');
  });
});

describe('every other mode', () => {
  it('reports the PSS number and declines to assert it', () => {
    const [line] = check({ proportionalBytes: 240_000_000 }, 'user_namespace');
    expect(line).toContain('measured but not asserted');
    expect(line).toContain('240000000');
    // Says how to get the assertion back, so declining is a redirection
    // rather than a dead end.
    expect(line).toContain('PICO_COMPANION_ROOT_OWNED_PACKAGE_PROBE=1');
    expect(line).toContain('user_namespace');
  });

  it('still fails on private dirty, which does not move with page sharing', () => {
    /**
     * The load-bearing half of not loosening anything. PSS divides shared
     * pages by the number of processes mapping them, so it moves with the
     * host; private dirty is the memory this application owns, and a bigger
     * bundle or a wider import hull appears there in every mode.
     */
    expect(() => check({ privateDirtyAndHugetlbBytes: 110_000_001 }, 'user_namespace'))
      .toThrow('exceeds the strict 110 MB budget');
    expect(() => check({ privateDirtyAndHugetlbBytes: 110_000_001 }))
      .toThrow('exceeds the strict 110 MB budget');
  });

  it('does not consult the probe’s verdict, which is the PSS budget again', () => {
    // Asserting `underBudget` outside the budget's mode would fail for the
    // documented mode difference under a different message - the same trained
    // shrug, one indirection further away.
    expect(check({ underBudget: false }, 'user_namespace')).toHaveLength(1);
  });
});

describe('a report this gate does not recognise', () => {
  it('refuses budgets it was not written against, rather than checking nothing', () => {
    // ADR 0117 X1. A probe that shipped its own looser numbers would pass a
    // gate that read them out of the report and compared them to themselves.
    expect(() => check({ proportionalBudgetBytes: 400_000_000 }))
      .toThrow('carries a PSS budget this gate does not know');
    expect(() => check({ privateDirtyAndHugetlbBudgetBytes: 400_000_000 }))
      .toThrow('carries a private budget this gate does not know');
    expect(() => check({ proportionalBudgetBytes: 400_000_000 }, 'user_namespace'))
      .toThrow('carries a PSS budget this gate does not know');
  });
});
