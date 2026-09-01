/**
 * Wie ein Feld zu Bytes wird, die jemand unterschreibt - einmal geschrieben.
 *
 * **Der Anlass** (2026-09-01, gemessen statt vermutet, Befund B50). Diese
 * Regeln standen zweimal im Paket, das Zeichenmuster sogar dreimal: in
 * `index.ts` fuer die Identitaetsfamilien, in `recovery.ts` fuer die sechs
 * Familien des Wiederherstellungswegs, und das Muster noch einmal in
 * `model-context.ts`. Beide Fassungen wurden gegeneinander gemessen - neunzehn
 * Proben ueber Zeichenketten, Hex und Verkettung -, und das Ergebnis ist
 * genau:
 *
 * - **Die Bytes waren nie verschieden.** Keine Probe erzeugte zwei
 *   Ergebnisse.
 * - **Vier von neunzehn Ablehnungen waren verschieden.** `''` heisst in der
 *   einen Fassung `empty_field` und in der anderen `invalid_field_charset`;
 *   zu lang heisst dort `field_too_long` und hier wieder
 *   `invalid_field_charset`. Wer eine Ablehnung liest, bekommt je nach Datei
 *   eine andere Auskunft ueber dieselbe Sache.
 *
 * **Und sie waren sich nur wegen einer dritten Tatsache einig.** Die eine
 * Fassung misst die Laenge in Bytes, die andere in Zeichen. Das faellt heute
 * nicht auf, weil das Zeichenmuster nur ASCII zulaesst und dort beide Zahlen
 * dieselbe sind. Liesse eine der drei Kopien je ein mehrbytiges Zeichen zu,
 * naehme die eine Fassung ein Feld an, das die andere ablehnt - bei genau der
 * Frage, was unterschrieben werden darf. Eine Einigkeit, die von einer
 * Tatsache in einer dritten Datei abhaengt, ist keine Regel, sondern ein
 * Zufall mit einer Frist.
 *
 * Deshalb steht das hier und nirgends sonst. Ein Blatt ohne eigene Importe:
 * es kann in keinem Zyklus liegen (Befund B49), und alle drei Aufrufer holen
 * es von hier.
 */

export const canonicalTextEncoder = new TextEncoder();

/**
 * Was in einem kanonischen Feld stehen darf.
 *
 * Reines ASCII mit Absicht: die Laengengrenze unten zaehlt Bytes, und nur
 * solange ein Zeichen ein Byte ist, sagt eine Zeichenzahl daneben dasselbe.
 * Wer dieses Muster erweitert, verschiebt damit auch, was `assertAsciiToken`
 * misst - das ist keine Nebenwirkung, sondern die Regel.
 */
export const canonicalAsciiTokenPattern = /^[A-Za-z0-9._:/+-]+$/u;

export const canonicalHexPattern = /^[0-9a-f]+$/u;

/**
 * Jedes Element mit seiner Laenge davor, vier Bytes, big-endian.
 *
 * Die Laenge davor ist das, was die Verkettung eindeutig macht: ohne sie
 * ergaeben zwei verschiedene Feldfolgen dieselben Bytes, und eine Unterschrift
 * ueber die einen waere eine ueber die anderen.
 */
export function concatCanonicalElements(elements: readonly Uint8Array[]): Uint8Array {
  const parts = elements.flatMap((element) => {
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, element.byteLength, false);
    return [length, element];
  });
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

/**
 * Prueft ein kanonisches Feld und sagt, *was* ihm fehlt.
 *
 * Drei Gruende statt einem, weil es drei sind: leer, zu lang, falsche
 * Zeichen. Die Fassung in `recovery.ts` warf fuer alle drei
 * `invalid_field_charset` - richtig in der Richtung, unbrauchbar als Auskunft.
 * Gemessen in Bytes, nicht in Zeichen: die Grenze ist eine ueber das, was
 * unterschrieben wird, und unterschrieben werden Bytes.
 */
export function assertAsciiToken(value: string): void {
  const bytes = canonicalTextEncoder.encode(value);
  if (bytes.length === 0) {
    throw new Error('empty_field');
  }
  if (bytes.length > 1024) {
    throw new Error('field_too_long');
  }
  if (!canonicalAsciiTokenPattern.test(value)) {
    throw new Error('invalid_field_charset');
  }
}

export function asciiBytes(value: string): Uint8Array {
  assertAsciiToken(value);
  return canonicalTextEncoder.encode(value);
}

export function fixedHexBytes(
  value: string,
  expectedByteLength: number,
  lengthReason: string,
): Uint8Array {
  if (typeof value !== 'string' || !canonicalHexPattern.test(value)) {
    throw new Error('invalid_hex');
  }
  if (value.length !== expectedByteLength * 2) {
    throw new Error(lengthReason);
  }
  const output = new Uint8Array(expectedByteLength);
  for (let i = 0; i < expectedByteLength; i += 1) {
    output[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return output;
}
