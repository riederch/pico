import { describe, expect, it } from 'vitest';
import { picoCompanionEnrolmentRefusalLine } from './enrolment-steps.js';

/**
 * Die vier, an denen eine Person etwas ändern kann - ausgeschrieben, damit
 * ein fünfter nicht stillschweigend im Achselzucken landet.
 */
const spoken = [
  'pico_companion_enrolment_offer_is_this_device',
  'pico_companion_enrolment_acceptance_is_for_another_activation',
  'pico_companion_enrolment_vault_is_not_new',
  'pico_companion_enrolment_was_not_accepted',
];

/** Zustände und Defekte: wahr, aber nichts, was jemand anders machen kann. */
const shrugged = [
  'pico_companion_enrolment_needs_an_approver',
  'pico_companion_enrolment_signer_mismatch',
  'pico_companion_renewal_keys_are_locked',
  'unreadable_companion_profile',
  'invalid_companion_profile_schema',
];

describe('was ein Pico sagt, wenn ein Beitritt nicht zustande kommt', () => {
  it('gibt jeder Ablehnung Titel und Satz, damit keine stumm ankommt', () => {
    for (const refusal of [...spoken, ...shrugged]) {
      const line = picoCompanionEnrolmentRefusalLine(refusal);
      expect(line.title.length, refusal).toBeGreaterThan(0);
      expect(line.body.length, refusal).toBeGreaterThan(0);
    }
  });

  it('sagt den vier Handlungsfähigen etwas Eigenes', () => {
    const titles = spoken.map((r) => picoCompanionEnrolmentRefusalLine(r).title);
    expect(new Set(titles).size).toBe(spoken.length);
    for (const refusal of spoken) {
      // Kein Code im Satz: wer etwas tun kann, soll lesen, was - und nicht
      // eine Zeichenkette, die für ein Fehlerprotokoll gemacht ist.
      const line = picoCompanionEnrolmentRefusalLine(refusal);
      expect(`${line.title} ${line.body}`, refusal).not.toContain('pico_companion');
    }
  });

  it('zuckt für den Rest mit den Schultern und nennt dabei den Code', () => {
    for (const refusal of shrugged) {
      const line = picoCompanionEnrolmentRefusalLine(refusal);
      expect(line.title, refusal).toBe('This device was not added');
      // Der Code steht darin, weil er das Einzige ist, was hier hilft.
      expect(line.body, refusal).toContain(refusal);
    }
  });

  it('liest den Grund, der an manchen Codes mitreist', () => {
    // `was_not_accepted` trägt die Ablehnung des Homes hinter einem
    // Doppelpunkt. Für die Auswahl zählt der Kopf - sonst fiele der Code mit
    // Grund ins Achselzucken und derselbe ohne Grund nicht.
    const withReason = picoCompanionEnrolmentRefusalLine(
      'pico_companion_enrolment_was_not_accepted:home_said_no');
    const bare = picoCompanionEnrolmentRefusalLine(
      'pico_companion_enrolment_was_not_accepted');
    expect(withReason).toEqual(bare);
    expect(withReason.title).toBe('Your Home has not said yes');
  });

  it('nennt im Achselzucken den ganzen String, nicht nur den Kopf', () => {
    // Der Kopf wählt aus, der ganze String wird gezeigt: was hinter dem
    // Doppelpunkt steht, ist oft die eigentliche Auskunft.
    const line = picoCompanionEnrolmentRefusalLine('some_unknown_refusal:with_detail');
    expect(line.body).toContain('some_unknown_refusal:with_detail');
  });

  it('spricht die Zeremonie nicht bei ihrem technischen Namen an', () => {
    for (const refusal of spoken) {
      const line = `${picoCompanionEnrolmentRefusalLine(refusal).title} `
        + `${picoCompanionEnrolmentRefusalLine(refusal).body}`;
      for (const jargon of ['delegation', 'activation', 'evidence', 'digest', 'canonical']) {
        expect(line.toLowerCase(), `${refusal} / ${jargon}`).not.toContain(jargon);
      }
    }
  });
});
