import { maxPicoVaultPassphraseLength } from '@pico/vault';
import { describe, expect, it } from 'vitest';
import {
  picoCompanionVaultPassphrasePrompt,
  type PicoCompanionVaultPassphrasePurpose,
} from './vault-passphrase-prompt.js';

/**
 * Ausgeschrieben statt aus dem Typ abgeleitet: ein Typ kann eine Absicht
 * dazubekommen, ohne dass jemand die Worte nachzieht, und genau das soll
 * dieser Test bemerken.
 */
const purposes: PicoCompanionVaultPassphrasePurpose[] = [
  'found', 'join', 'first_run', 'resume', 'recovery_card',
];

describe('die eine Frage nach einer Vault-Passphrase', () => {
  it('gibt jeder Absicht Titel und Erklärung, damit keine stumm ankommt', () => {
    for (const purpose of purposes) {
      const prompt = picoCompanionVaultPassphrasePrompt(purpose);
      expect(prompt.title.length, purpose).toBeGreaterThan(0);
      expect(prompt.instruction.length, purpose).toBeGreaterThan(0);
    }
  });

  it('unterscheidet die fünf Absichten, weil sie fünf Momente sind', () => {
    // Zwei gleiche Titel wären der Beweis, dass eine Variante keine ist -
    // und dann gehörte sie zusammengelegt statt aufgeführt.
    const titles = purposes.map((p) => picoCompanionVaultPassphrasePrompt(p).title);
    expect(new Set(titles).size).toBe(purposes.length);
  });

  it('sagt "device", nie "phone" - auch dort, wo ein Telefon fragt', () => {
    /**
     * Der Befund vom 2026-08-21: die Android-Activity schrieb "this phone is
     * about to make its keys", während elf Sätze daneben im selben Beitritt
     * "device" sagen. Nicht der Kern war zu allgemein; der eine Bildschirm war
     * zu speziell.
     */
    for (const purpose of purposes) {
      const prompt = picoCompanionVaultPassphrasePrompt(purpose);
      expect(`${prompt.title} ${prompt.instruction}`.toLowerCase(), purpose)
        .not.toContain('phone');
    }
  });

  it('trennt Wählen von Eingeben, weil das zwei verschiedene Fragen sind', () => {
    for (const purpose of ['found', 'join', 'first_run'] as const) {
      expect(picoCompanionVaultPassphrasePrompt(purpose).title, purpose)
        .toMatch(/^Choose /);
    }
    for (const purpose of ['resume', 'recovery_card'] as const) {
      expect(picoCompanionVaultPassphrasePrompt(purpose).title, purpose)
        .toMatch(/^Enter /);
    }
  });

  it('nennt die Karten-PIN, wo eine Karte im Spiel ist, und sonst nicht', () => {
    // Wer eine Recovery-Karte in der Hand hält, hat gerade eine PIN gewählt
    // oder wird gleich eine wählen. Das ist der einzige Moment, in dem die
    // Verwechslung droht - und der einzige, in dem der Hinweis nicht Ballast
    // ist.
    const mentions = purposes.filter((purpose) =>
      picoCompanionVaultPassphrasePrompt(purpose).instruction.includes('Card PIN'));
    expect(mentions).toEqual(['first_run', 'recovery_card']);
  });

  it('lehnt mit einem Satz ab, der beide Enden nennt', () => {
    /**
     * "A passphrase cannot be empty" war richtig neben `value.length > 0` und
     * wurde falsch, als die Prüfung die Vault-Regel wurde: eine zu lange
     * Passphrase hätte gehört, sie sei leer. Im Fenster deckelt
     * `maximumLength` das Tippen, auf dem Telefon deckelt nichts.
     */
    const { refusal, validate } = picoCompanionVaultPassphrasePrompt('join');
    expect(validate('x'.repeat(maxPicoVaultPassphraseLength + 1))).toBe(false);
    expect(refusal).toContain(String(maxPicoVaultPassphraseLength));
    expect(refusal.toLowerCase()).not.toContain('empty');
  });

  it('nimmt Grenze und Regel aus dem Vault statt eigene zu erfinden', () => {
    const prompt = picoCompanionVaultPassphrasePrompt('found');
    expect(prompt.maximumLength).toBe(maxPicoVaultPassphraseLength);
    expect(prompt.validate('')).toBe(false);
    expect(prompt.validate('x')).toBe(true);
    // Die Grenze, die sechs Aufrufstellen als `value.length > 0` schrieben und
    // damit nicht kannten.
    expect(prompt.validate('x'.repeat(maxPicoVaultPassphraseLength))).toBe(true);
    expect(prompt.validate('x'.repeat(maxPicoVaultPassphraseLength + 1))).toBe(false);
  });
});
