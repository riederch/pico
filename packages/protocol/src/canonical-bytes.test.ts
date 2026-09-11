import { describe, expect, it } from 'vitest';

import {
  PicoCanonicalFieldError,
  assertAsciiToken,
  assertExactKeys,
  assertHexOfBytes,
  bytesToHex,
  concatCanonicalElements,
  fixedHexBytes,
  hasExactKeys,
  hexOfBytesPattern,
  hexToBytes,
  isAsciiToken,
  isHexOfBytes,
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

describe('so viele Bytes als Hex (Befund B140)', () => {
  const zweiunddreissig = 'a1'.repeat(32);

  it('nimmt genau die Laenge und nichts daneben', () => {
    expect(isHexOfBytes(zweiunddreissig, 32)).toBe(true);
    expect(isHexOfBytes(zweiunddreissig, 31)).toBe(false);
    expect(isHexOfBytes(zweiunddreissig, 64)).toBe(false);
    expect(isHexOfBytes('ab', 1)).toBe(true);
    expect(isHexOfBytes('', 1)).toBe(false);
  });

  it('besteht auf Kleinschreibung, weil ein Fingerabdruck sonst zwei Schreibweisen hat', () => {
    expect(isHexOfBytes('AB'.repeat(32), 32)).toBe(false);
    expect(isHexOfBytes('aB'.repeat(32), 32)).toBe(false);
  });

  it('nimmt nichts an, was keine Zeichenkette ist', () => {
    for (const value of [undefined, null, 42, {}, ['ab']]) {
      expect(isHexOfBytes(value, 1)).toBe(false);
    }
  });

  it('weist eine Bytezahl zurueck, die keine ist', () => {
    // Ein Vertipper hier gaebe sonst ein Praedikat, das die leere Zeichenkette
    // annimmt - und das liest sich wie eine Pruefung.
    for (const byteLength of [0, -1, 1.5, Number.NaN]) {
      expect(() => isHexOfBytes('ab', byteLength))
        .toThrow(/invalid_hex_byte_length/u);
      expect(() => hexOfBytesPattern(byteLength))
        .toThrow(/invalid_hex_byte_length/u);
    }
  });

  it('baut ein Muster, das dasselbe sagt wie das Praedikat', () => {
    /**
     * Die vier exportierten Muster des Protokolls - Postfachadresse, Pakettag,
     * Betreiberkreditiv, Relaiskonto - sind alle sechzehn Bytes und alle
     * verschiedene Begriffe. Sie behalten Namen, Typ und Export und holen nur
     * die Form; also muss die Form beider Wege dieselbe sein.
     */
    const muster = hexOfBytesPattern(16);
    for (const value of ['ab'.repeat(16), 'ab'.repeat(15), 'AB'.repeat(16), '', 'zz'.repeat(16)]) {
      expect(muster.test(value)).toBe(isHexOfBytes(value, 16));
    }
  });

  it('laesst einen Aufrufer seine eigene Ablehnung waehlen', () => {
    expect(() => assertHexOfBytes(zweiunddreissig, 32)).not.toThrow();
    expect(() => assertHexOfBytes('nope', 32)).toThrow('invalid_hex');
    expect(() => assertHexOfBytes('nope', 32, 'invalid_fingerprint'))
      .toThrow('invalid_fingerprint');
  });
});

describe('ein kanonisches Token, hoechstens so lang (Befund B141)', () => {
  it('nimmt die kanonische Zeichenmenge und die Grenze', () => {
    expect(isAsciiToken('home_abc')).toBe(true);
    expect(isAsciiToken('a+b')).toBe(true);
    expect(isAsciiToken('x'.repeat(1024))).toBe(true);
    expect(isAsciiToken('x'.repeat(1025))).toBe(false);
    expect(isAsciiToken('x'.repeat(256), 256)).toBe(true);
    expect(isAsciiToken('x'.repeat(257), 256)).toBe(false);
    expect(isAsciiToken('')).toBe(false);
    expect(isAsciiToken('a b')).toBe(false);
    expect(isAsciiToken('ä')).toBe(false);
  });

  it('haelt `undefined` nicht fuer ein Token, und das war der Fehler', () => {
    /**
     * **Die Luecke, die dieser Befund geschlossen hat.** Zwei Fassungen von
     * `isAsciiReference` riefen `muster.test(wert)` ohne `typeof`-Pruefung, und
     * `RegExp.test` wandelt sein Argument in eine Zeichenkette um: aus
     * `undefined` wird `"undefined"`, aus `null` `"null"`, aus `42` `"42"` -
     * alles Zeichen, die die Menge erlaubt. Die Werte kamen ueber die
     * Transportnaht aus ADR 0089 herein, und diese Pruefung war ihre einzige.
     */
    for (const value of [undefined, null, 42, true, Number.NaN]) {
      expect(isAsciiToken(value)).toBe(false);
      // Und der Beleg, warum es passieren konnte:
      expect(/^[A-Za-z0-9._:/+-]{1,256}$/u.test(value as never)).toBe(true);
    }
  });

  it('nimmt das `+`, das zwei Fassungen aus der Menge gelassen hatten', () => {
    // Strenger als die Regel schliesst zu, ist aber eine Uneinigkeit darueber,
    // was ein Token ist - und die hatte niemand gewaehlt.
    expect(isAsciiToken('seq+1')).toBe(true);
    expect(/^[A-Za-z0-9._:/-]{1,256}$/u.test('seq+1')).toBe(false);
  });

  it('misst Bytes und nicht Zeichen, so wie die Zusicherung daneben', () => {
    // Beide Zahlen sind nur dieselbe, solange die Menge ASCII bleibt - das
    // sagt der Kopf dieser Datei, und hier steht es als Test.
    expect(isAsciiToken('ä'.repeat(10), 10)).toBe(false);
    expect(() => assertAsciiToken('x'.repeat(1025))).toThrow('field_too_long');
    expect(isAsciiToken('x'.repeat(1025))).toBe(false);
  });

  it('weist eine Grenze zurueck, die keine ist', () => {
    for (const maxBytes of [0, -1, 2.5, Number.NaN]) {
      expect(() => isAsciiToken('ab', maxBytes)).toThrow(/invalid_ascii_token_length/u);
    }
  });
});
