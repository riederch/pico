import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  isPicoFloorFamilyAvailableUnderAbsence,
  mayPicoFailOverBetweenProviders,
  mayPicoQueueUntilReachable,
  picoAbsenceStates,
  picoOfflineFloorFamilies,
  picoProviderClasses,
  type PicoDegradationState,
} from './offline-floor.js';

describe('ADR 0118 O1 the floor', () => {
  it('names the five families ADR 0118 guarantees', () => {
    expect([...picoOfflineFloorFamilies]).toEqual([
      'capture',
      'time_bound_entry',
      'local_recall',
      'decide',
      'recovery_access',
    ]);
  });

  it('is declared in the manifest the release gate checks', () => {
    // The mechanical check reads `offline-floor.json`; this is the other half
    // of that binding. Without it a family could be added here and silently
    // never enforced, or dropped from the manifest without anyone noticing.
    const manifest = JSON.parse(readFileSync(
      fileURLToPath(new URL('../../../offline-floor.json', import.meta.url)),
      'utf8',
    )) as { families: Record<string, { modules?: string[]; unimplemented?: string }> };

    expect(Object.keys(manifest.families).sort())
      .toEqual([...picoOfflineFloorFamilies].sort());

    for (const [family, declaration] of Object.entries(manifest.families)) {
      const declaresModules = (declaration.modules?.length ?? 0) > 0;
      const declaresGap = (declaration.unimplemented ?? '').trim() !== '';
      // Exactly one of the two, so a family cannot sit in the manifest saying
      // nothing and be counted as covered.
      expect(declaresModules !== declaresGap, family).toBe(true);
    }
  });
});

describe('ADR 0118 O4 two absences', () => {
  it('keeps the two states distinct and independently true', () => {
    expect([...picoAbsenceStates]).toEqual(['no_network', 'no_model']);
  });

  it('never reports a floor operation as blocked, under any absence', () => {
    // The load-bearing half of O4. An avatar that reports itself broken while
    // capture works teaches the person that Pico is unreliable offline, which
    // is the opposite of what this contract buys.
    const states: PicoDegradationState[] = [
      { absences: [] },
      { absences: ['no_network'] },
      { absences: ['no_model'] },
      { absences: ['no_network', 'no_model'] },
    ];

    for (const state of states) {
      for (const family of picoOfflineFloorFamilies) {
        expect(
          isPicoFloorFamilyAvailableUnderAbsence(family, state),
          `${family} under ${state.absences.join('+') || 'none'}`,
        ).toBe(true);
      }
    }
  });
});

describe('ADR 0118 O2 absence is stated, never routed around', () => {
  it('refuses failover across provider classes and allows it within one', () => {
    for (const from of picoProviderClasses) {
      for (const to of picoProviderClasses) {
        // Availability must not select a privacy posture: an attacker who can
        // degrade the on-device provider would otherwise choose where the data
        // goes, and the person would never see the substitution happen.
        expect(mayPicoFailOverBetweenProviders(from, to), `${from}->${to}`)
          .toBe(from === to);
      }
    }
  });

  it('queues an approved delivery and never an approval', () => {
    expect(mayPicoQueueUntilReachable({ kind: 'delivery', alreadyApproved: true })).toBe(true);

    // Not approved yet is not "approve it when the route returns".
    expect(mayPicoQueueUntilReachable({ kind: 'delivery', alreadyApproved: false })).toBe(false);

    // An approval never queues, whatever its flag says: a path that could not
    // be approved offline must not be treated as approved once the network is
    // back. ADR 0116 W5's no-auto-forward rule under a different pressure.
    expect(mayPicoQueueUntilReachable({ kind: 'approval', alreadyApproved: false })).toBe(false);
    expect(mayPicoQueueUntilReachable({ kind: 'approval', alreadyApproved: true })).toBe(false);
  });
});
