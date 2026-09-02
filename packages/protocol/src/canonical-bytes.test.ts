import { describe, expect, it } from 'vitest';

import {
  PicoCanonicalFieldError,
  assertAsciiToken,
  concatCanonicalElements,
  fixedHexBytes,
} from './canonical-bytes.js';

/**
 * Befund B50 mit B51. Die Regel, die entscheidet, was unterschrieben werden
 * darf - und die Auskunft, die sie über eine Ablehnung gibt.
 *
 * **Warum diese Datei überhaupt entsteht.** Am 2026-09-01 wurde gemessen, dass
 * die Regel zweimal im Paket stand und in vier von neunzehn Proben verschieden
 * ablehnte. Gesehen hat das keiner der 613 Tests des Pakets - weil keiner die
 * *Ablehnung* festhielt. Ein Tor kann das nicht nachholen:
 * `check-canonical-bytes.mjs` zählt Definitionen, es führt keine aus.
 */
describe('ADR 0106 R5 eine Ebene tiefer - ein Feld wird zu Bytes', () => {
  it('nennt den Fehler, wenn niemand ein Feld benennt', () => {
    // Genau die drei Namen, die heute auf dem Signierweg stehen und die sechs
    // andere Teststellen festhalten. Sie ändern sich nicht.
    for (const [value, fault] of [
      ['', 'empty_field'],
      ['x'.repeat(1_025), 'field_too_long'],
      ['a b', 'invalid_field_charset'],
    ] as const) {
      expect(() => assertAsciiToken(value)).toThrow(fault);
    }
  });

  it('nennt das Feld, wenn der Aufrufer es benennt, und trägt den Fehler mit', () => {
    /**
     * B51, vom Nutzer am 2026-09-02 entschieden. Die Fassung im
     * Identitätspaket sagte `invalid_delegation_id` und nannte damit das
     * *Feld*; die des Protokolls nennt den *Fehler*. Beide sind jetzt da, und
     * zwar so, dass kein bestehender Name sich verschiebt.
     */
    for (const [value, fault] of [
      ['', 'empty_field'],
      ['x'.repeat(1_025), 'field_too_long'],
      ['a b', 'invalid_field_charset'],
    ] as const) {
      let caught: unknown;
      try {
        assertAsciiToken(value, 'invalid_delegation_id');
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(PicoCanonicalFieldError);
      expect((caught as Error).message).toBe('invalid_delegation_id');
      expect((caught as PicoCanonicalFieldError).fault).toBe(fault);
    }
  });

  it('nimmt nichts an, was keine Zeichenkette ist', () => {
    // Ohne diese Zeile machte `encode` aus einer Zahl klaglos ein Feld.
    expect(() => assertAsciiToken(123)).toThrow('invalid_field_charset');
    expect(() => assertAsciiToken(undefined)).toThrow('invalid_field_charset');
  });

  it('misst die Länge in Bytes und nicht in Zeichen', () => {
    /**
     * Die dritte Tatsache aus B50: die eine alte Fassung zählte Zeichen, die
     * andere Bytes, und sie waren sich nur einig, weil das Muster ASCII ist.
     * Diese Probe hält fest, welche der beiden gilt - `'ä'` ist ein Zeichen
     * und zwei Bytes.
     */
    expect(() => assertAsciiToken('ä'.repeat(513))).toThrow('field_too_long');
  });

  it('setzt jedes Element mit seiner Länge davor zusammen', () => {
    // Ohne die Länge davor ergäben zwei verschiedene Feldfolgen dieselben
    // Bytes, und eine Unterschrift über die einen wäre eine über die anderen.
    const encoder = new TextEncoder();
    const one = concatCanonicalElements([encoder.encode('ab'), encoder.encode('c')]);
    const other = concatCanonicalElements([encoder.encode('a'), encoder.encode('bc')]);
    expect([...one]).not.toEqual([...other]);
    expect([...one.slice(0, 4)]).toEqual([0, 0, 0, 2]);
  });

  it('liest Hex nur in fester Länge und nur klein geschrieben', () => {
    expect([...fixedHexBytes('00ff', 2, 'wrong_length')]).toEqual([0, 255]);
    expect(() => fixedHexBytes('00FF', 2, 'wrong_length')).toThrow('invalid_hex');
    expect(() => fixedHexBytes('00', 2, 'wrong_length')).toThrow('wrong_length');
  });
});
