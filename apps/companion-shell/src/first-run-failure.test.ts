import { describe, expect, it } from 'vitest';
import {
  picoCompanionFirstRunFailureBody,
  picoCompanionServiceErrorBody,
} from './contract.js';

describe('ADR 0130 E2 - a first run that failed says which failure it was', () => {
  it('tells a second-boot line apart from something that is not a Home log', () => {
    /**
     * `founding.ts` distinguishes these two on purpose - its own comment says
     * they "send a person to different places" - and until 2026-08-19 the
     * distinction could not reach anybody: the window pre-checked the pasted
     * line for the move-in code's field name, and a line without one was
     * rejected by the secure input, which answers with a character count and
     * no sentence at all. The person most likely to hit it is the one whose
     * Home has been restarted once.
     */
    const alreadyClaimed = picoCompanionFirstRunFailureBody(
      'pico_home_setup_announcement_has_no_move_in_code',
      'unknown',
    );
    const notAHomeLog = picoCompanionFirstRunFailureBody(
      'invalid_pico_home_setup_announcement',
      'unknown',
    );

    expect(alreadyClaimed).not.toBe(notAHomeLog);
    expect(alreadyClaimed).toMatch(/already|claimed/i);
    expect(notAHomeLog).toMatch(/line|log/i);
  });

  it('keeps saying what the other named failures are', () => {
    expect(picoCompanionFirstRunFailureBody('secure_input_cancelled', 'x'))
      .toMatch(/cancelled/i);
    expect(picoCompanionFirstRunFailureBody('camera_scan_unavailable', 'x'))
      .toMatch(/zbar/i);
    expect(picoCompanionFirstRunFailureBody('invalid_recovery_card_scan:bad', 'x'))
      .toMatch(/Recovery Card/i);
  });

  it('falls back to the reason it was given rather than inventing one', () => {
    /**
     * Die Absicht dieses Tests ist unverändert - eine unbenannte Fehlschlag
     * muss etwas Wahres und Spezifisches sagen, und „nothing was changed at
     * your Home" ist der Teil, den eine Person zuerst braucht. Was er bis zum
     * 2026-08-24 zusätzlich festhielt, war der **Code** in der Ausgabe. Der
     * einzige Aufrufer übergibt einen der vier öffentlichen Gründe aus
     * `public-error.ts`, und die haben jetzt Sätze; ein Grund, den niemand
     * erzeugt, bekommt den ehrlichen Satz statt seines Wortlauts.
     */
    const body = picoCompanionFirstRunFailureBody('something_new_broke', 'pico_vault_unavailable');
    expect(body).not.toContain('pico_vault_unavailable');
    expect(body).toMatch(/Pico Vault is not answering/i);
    expect(body).toMatch(/nothing was changed/i);
  });
});

describe('was den Companion aufhielt, als Satz statt als Code', () => {
  /**
   * Die vier öffentlichen Gründe aus `public-error.ts`, ausgeschrieben statt
   * aus dem Modul gezogen: dort entstehen sie aus Fehlerformen, hier soll
   * auffallen, wenn einer dazukommt und keinen Satz bekommt.
   */
  const reasons = [
    'companion_profile_unavailable',
    'companion_profile_invalid',
    'pico_vault_unavailable',
    'companion_service_unavailable',
  ];

  it('gibt jedem Grund einen eigenen Satz und keinem den Code', () => {
    const bodies = reasons.map((reason) => picoCompanionServiceErrorBody(reason));
    for (const [index, body] of bodies.entries()) {
      expect(body.length, reasons[index]).toBeGreaterThan(0);
      // Der Code ist das, was vorher auf dem Bildschirm stand.
      expect(body, reasons[index]).not.toContain(reasons[index]);
      expect(body, reasons[index]).not.toContain('_');
    }
    // Vier gleiche Sätze wären der Beweis, dass die Unterscheidung keine ist.
    expect(new Set(bodies).size).toBe(reasons.length);
  });

  it('sagt bei einem unbekannten Grund, dass es nicht genauer geht', () => {
    const unknown = picoCompanionServiceErrorBody('etwas_ganz_anderes');
    expect(unknown).not.toContain('etwas_ganz_anderes');
    expect(unknown).toBe(picoCompanionServiceErrorBody('companion_service_unavailable'));
  });

  it('trägt denselben Satz in den Erstlauf, ohne den Code mitzunehmen', () => {
    const body = picoCompanionFirstRunFailureBody('etwas_unerwartetes', 'pico_vault_unavailable');
    expect(body).not.toContain('pico_vault_unavailable');
    expect(body).toContain(picoCompanionServiceErrorBody('pico_vault_unavailable'));
    expect(body).toMatch(/nothing was changed/i);
  });
});
