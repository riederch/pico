import { describe, expect, it } from 'vitest';
import {
  picoCompanionEnrolmentStepLine,
  picoCompanionFoundingStepLine,
  type PicoCompanionEnrolmentStep,
} from './enrolment-steps.js';

/**
 * Die elf Schritte des Walks, hier ausgeschrieben statt aus dem Typ abgeleitet:
 * ein Typ kann sich ändern, ohne dass jemand die Worte nachzieht, und genau das
 * soll dieser Test bemerken.
 */
const steps: PicoCompanionEnrolmentStep[] = [
  'read_offer', 'show_grant', 'read_acceptance', 'added',
  'show_offer', 'read_grant', 'show_acceptance',
  'waiting', 'joined', 'renewed', 'kept',
];

describe('ADR 0131 A5 - die drei Verben und ihre Worte liegen beim selben Eigentümer', () => {
  it('gibt jedem Schritt des Walks einen Satz, damit keiner stumm ankommt', () => {
    /**
     * `PicoCompanionEnrolmentSurface` reicht `announce(step)` nur einen Namen
     * hinüber. Bis zum 2026-08-21 standen die Sätze dazu in
     * `apps/companion-shell/src/contract.ts`, also in der Electron-Schale - eine
     * Android-Fläche hätte denselben Vertrag erfüllt und elf eigene Sätze
     * geschrieben. Zwei Clients, die einer Person zwei verschiedene Dinge über
     * denselben Moment sagen, sind der Defekt, den A5 entfernt.
     */
    for (const step of steps) {
      const line = picoCompanionEnrolmentStepLine(step);
      expect(line.title.length, `${step} title`).toBeGreaterThan(0);
      expect(line.body.length, `${step} body`).toBeGreaterThan(20);
    }
  });

  it('nennt in keinem Schritt die Zeremonie beim technischen Namen', () => {
    /**
     * Die Regel, die der Doc-Kommentar aufstellt, als Test: eine Person hält
     * zwei Bildschirme und braucht zu wissen, auf welchen sie sehen soll -
     * "Delegation", "Aktivierung" und "Evidence" sind wahr und sagen ihr
     * nichts, was sie tun kann.
     */
    for (const step of steps) {
      const line = picoCompanionEnrolmentStepLine(step);
      const said = `${line.title} ${line.body}`.toLowerCase();
      for (const jargon of ['delegation', 'activation', 'evidence', 'digest', 'canonical']) {
        expect(said, `${step} sagt "${jargon}"`).not.toContain(jargon);
      }
    }
  });

  it('gibt auch den Gründungsschritten ihre Sätze', () => {
    for (const step of ['device_delegation', 'home_claim', 'founding_acceptance'] as const) {
      const line = picoCompanionFoundingStepLine(step);
      expect(line.title.length, `${step} title`).toBeGreaterThan(0);
      expect(line.body.length, `${step} body`).toBeGreaterThan(20);
      // Kein Terminal: das ist der Unterschied, den der CLI-Satz macht und den
      // eine Bildschirmfläche nicht erben darf.
      expect(line.body.toLowerCase()).not.toContain('terminal');
    }
  });
});
