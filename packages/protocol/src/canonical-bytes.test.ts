import { describe, expect, it } from 'vitest';

import {
  PicoCanonicalFieldError,
  assertAsciiToken,
  assertExactKeys,
  bytesToHex,
  concatCanonicalElements,
  fixedHexBytes,
  hasExactKeys,
  hexToBytes,
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

describe('ob ein Datensatz genau diese Felder traegt (Befund B136)', () => {
  it('nimmt dieselbe Menge in jeder Reihenfolge und weist jede andere ab', () => {
    expect(hasExactKeys({ a: 1, b: 2 }, ['a', 'b'])).toBe(true);
    expect(hasExactKeys({ b: 2, a: 1 }, ['a', 'b'])).toBe(true);
    expect(hasExactKeys({}, [])).toBe(true);
    expect(hasExactKeys({ a: 1, b: 2, c: 3 }, ['a', 'b'])).toBe(false);
    expect(hasExactKeys({ a: 1 }, ['a', 'b'])).toBe(false);
    expect(hasExactKeys({}, ['a'])).toBe(false);
  });

  it('zaehlt ein Feld mit dem Wert `undefined` als vorhanden', () => {
    // `Object.keys` sieht es, also ist es da. Wer etwas anderes will, prueft
    // den Wert - nicht die Schluesselmenge.
    expect(hasExactKeys({ a: undefined }, ['a'])).toBe(true);
  });

  it('haelt einen Namen von `Object.prototype` nicht fuer ein Feld', () => {
    /**
     * **Die Schwaeche, die eine der acht Fassungen hatte** (Befund B136). Sie
     * fragte `key in record` statt die Schluesselmengen zu vergleichen, und
     * `in` sieht die Prototypkette mit. Ein leerer Datensatz bestand damit die
     * Pruefung gegen `['toString']`, und `{ a: 1 }` bestand sie gegen
     * `['a', 'constructor']`.
     *
     * Zwoelf solche Namen gibt es - `constructor`, `valueOf`,
     * `hasOwnProperty`, `__proto__` und die uebrigen -, und es sind genau die,
     * die jemand in eine Nutzlast schreibt, der etwas versucht.
     */
    for (const name of Object.getOwnPropertyNames(Object.prototype)) {
      expect(hasExactKeys({}, [name])).toBe(false);
      expect(hasExactKeys({ a: 1 }, ['a', name])).toBe(false);
    }
    // Und ein Feld, das wirklich so heisst, zaehlt trotzdem.
    expect(hasExactKeys(JSON.parse('{"toString":1}'), ['toString'])).toBe(true);
  });

  it('weist eine doppelt genannte Erwartung ab, statt sie wegzukuerzen', () => {
    // Eine Liste, die einen Namen zweimal nennt, ist ein Fehler beim Aufrufer.
    // Ihn stillschweigend zu dulden hiesse, den einen Fall zu verstecken, in
    // dem die Erwartung selbst kaputt ist.
    expect(hasExactKeys({ a: 1 }, ['a', 'a'])).toBe(false);
    expect(hasExactKeys({ a: 1, b: 2 }, ['a', 'a', 'b'])).toBe(false);
  });

  it('ist die Regel, die `assertExactKeys` wirft', () => {
    // Strukturell und nicht nebeneinander: die Zusicherung ruft dieses
    // Praedikat, also koennen die beiden nicht auseinanderlaufen.
    expect(() => assertExactKeys({ a: 1 }, ['a'], 'nope')).not.toThrow();
    expect(() => assertExactKeys({}, ['toString'], 'unexpected_field')).toThrow('unexpected_field');
  });
});

describe('Hex als Bytes, und was bei schlechter Eingabe passiert (Befund B138)', () => {
  it('nimmt kanonisches Hex und gibt genau diese Bytes', () => {
    expect(Array.from(hexToBytes('00ff10'))).toEqual([0, 255, 16]);
    expect(Array.from(hexToBytes('aa'))).toEqual([170]);
    // Und es ist die Umkehrung des Nachbarn darueber.
    expect(bytesToHex(hexToBytes('deadbeef'))).toBe('deadbeef');
  });

  it('weist jede Gestalt ab, die eine der acht Fassungen still angenommen hat', () => {
    /**
     * Ausgefuehrt ueber diese neun Eingaben unterschieden sich die acht
     * Fassungen: `Buffer.from` schnitt ab und nahm Grossbuchstaben an, die
     * Paarschleife machte aus `zzzz` zwei Nullbytes und aus `aa bb` die Bytes
     * 170 und 11. Zwei Wege unter einem Namen, die aus derselben kaputten
     * Eingabe verschiedene Antworten bauen und keiner davon meldet.
     */
    for (const broken of ['', 'abc', 'ABFF', 'aBfF', 'zzzz', 'aazz', 'aa bb', '0xaabb', 'a']) {
      expect(() => hexToBytes(broken)).toThrow('invalid_hex');
    }
    expect(() => hexToBytes(undefined)).toThrow('invalid_hex');
    expect(() => hexToBytes(255)).toThrow('invalid_hex');
  });

  it('weist leer ab, statt keine Bytes zurueckzugeben', () => {
    // Ein Schluessel ohne Bytes ist kein leerer Schluessel, und ein Aufrufer,
    // der ein leeres Array bekommt, merkt den Unterschied nicht.
    expect(() => hexToBytes('')).toThrow('invalid_hex');
  });

  it('laesst einen Aufrufer seinen eigenen Satz waehlen', () => {
    expect(() => hexToBytes('zz', 'Pico Home host key material must be lowercase hex.'))
      .toThrow('Pico Home host key material must be lowercase hex.');
  });
});
