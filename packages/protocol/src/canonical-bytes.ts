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

/** Was einem kanonischen Feld fehlen kann. Drei, und nicht mehr. */
export type PicoCanonicalFieldFault = 'empty_field' | 'field_too_long' | 'invalid_field_charset';

/**
 * Ein abgelehntes Feld, mit dem Fehler *und* - wenn der Aufrufer ihn nennen
 * konnte - dem Feld.
 *
 * **Warum beides** (2026-09-02, Entscheidung des Nutzers, Befund B51). Diese
 * Regel stand viermal im Baum, und die zwei ausgebauten Fassungen lehnten
 * verschieden ab: das Protokoll sagte, *was* falsch ist (`field_too_long`),
 * das Identitaetspaket, *welches Feld* (`invalid_delegation_id`). Keine der
 * beiden war die bessere - die eine sagt einer Person, wo etwas falsch ist,
 * die andere was.
 *
 * Also sagt die gemeinsame Fassung beides, und zwar so, dass sich kein
 * Ablehnungsname aendert: die Meldung bleibt, was der Aufrufer schon bekam,
 * und der Fehler reist als Feld mit. Dieselbe Gestalt, die
 * `PicoModelProviderNarrowingError` mit `refusal` und `measured` benutzt, und
 * aus demselben Grund: eine Ablehnung ohne die zweite Haelfte laesst raten.
 */
export class PicoCanonicalFieldError extends Error {
  public constructor(
    public readonly fault: PicoCanonicalFieldFault,
    reason?: string,
  ) {
    super(reason ?? fault);
    this.name = 'PicoCanonicalFieldError';
  }
}

/**
 * Prueft ein kanonisches Feld und sagt, *was* ihm fehlt - und woran, wenn der
 * Aufrufer es benennt.
 *
 * Drei Gruende statt einem, weil es drei sind: leer, zu lang, falsche
 * Zeichen. Die Fassung in `recovery.ts` warf fuer alle drei
 * `invalid_field_charset` - richtig in der Richtung, unbrauchbar als Auskunft.
 * Gemessen in Bytes, nicht in Zeichen: die Grenze ist eine ueber das, was
 * unterschrieben wird, und unterschrieben werden Bytes.
 *
 * `reason` ist der Name, den der Aufrufer seinem Feld gibt. Ohne ihn heisst
 * die Meldung wie der Fehler - unveraendert fuer alles, was heute daran
 * haengt; mit ihm heisst sie wie das Feld, und der Fehler steht auf `.fault`.
 *
 * **Was hier nicht steht, ist eine Zeichenkette**: `value` ist `unknown`, weil
 * die Fassung im Companion-Profil es so hatte und recht damit hatte. Was keine
 * Zeichenkette ist, ist kein kanonisches Feld, und ohne diese Zeile machte
 * `encode` aus einer Zahl klaglos eine.
 */
export function assertAsciiToken(value: unknown, reason?: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new PicoCanonicalFieldError('invalid_field_charset', reason);
  }
  const bytes = canonicalTextEncoder.encode(value);
  if (bytes.length === 0) {
    throw new PicoCanonicalFieldError('empty_field', reason);
  }
  if (bytes.length > 1024) {
    throw new PicoCanonicalFieldError('field_too_long', reason);
  }
  if (!canonicalAsciiTokenPattern.test(value)) {
    throw new PicoCanonicalFieldError('invalid_field_charset', reason);
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

/**
 * Ein Datensatz traegt genau diese Schluessel - nicht weniger und nicht mehr.
 *
 * **Der Anlass** (2026-09-10, Befund B124). Unter diesem Namen standen
 * **dreizehn** Funktionen in `packages/protocol/src`. Neun davon waren
 * dieselbe Regel - hier ist sie, einmal.
 *
 * **Warum das mehr ist als Doppelung.** Diese Funktion entscheidet, welche
 * Felder ein Datensatz haben darf, *bevor* daraus Signatureingaben gebaut
 * werden. Eine Fassung, die ein Feld mehr durchliesse, hiesse: eine
 * Unterschrift ueber etwas, das der Bauer nebenan abgelehnt haette. Genau die
 * Klasse Fehler, wegen der `canonical-bytes.ts` ueberhaupt existiert - und der
 * Kopf dieser Datei sagt, dass im Protokollpaket jede dieser Regeln genau eine
 * Fassung hat.
 *
 * **Gefunden ueber die Luecke, die der Pruefer selbst nennt**: *"Eine Regel,
 * die unter einem anderen Namen noch einmal geschrieben wird, ginge an ihr
 * vorbei."* Gesucht wurde deshalb nicht nach Namen, sondern nach *Gestalt* -
 * Funktionsruempfe mit umbenannten Bezeichnern verglichen. Sechsundsiebzig
 * Gruppen gleicher Gestalt kamen heraus; die meisten sind Zwillinge mit
 * Absicht (eine Delegation und eine Widerrufung pruefen sich gleich).
 *
 * **Und dann waren es doch nicht dreizehn.** Der erste Satz dieses Kommentars
 * hiess "alle dreizehn Ruempfe waren Zeichen fuer Zeichen dieselben" - er
 * stammte aus fuenf angesehenen und acht angenommenen. Nachgemessen sind es
 * *sieben verschiedene Ruempfe*: neun sind wirklich diese Regel, und vier sind
 * andere, die nur so heissen:
 *
 * - `index.ts` verbietet zusaetzlich einen Schluessel `fieldOrder` und
 *   unterscheidet drei Ablehnungen.
 * - `model-context.ts` verbietet nur *unerwartete* Schluessel und verlangt
 *   fehlende nicht.
 * - `recovery.ts` ist die reichste: `isRecord`, `fieldOrder`, unerwartet,
 *   fehlend.
 * - `device-enrolment.ts` baut den Fehlernamen aus einem `kind` und ist
 *   dieselbe Pruefung - die wurde zusammengelegt.
 *
 * Die drei anderen bleiben, wo sie sind. Aufgefallen ist es an zwei Tests, die
 * nach dem Zusammenlegen `unexpected_field` erwarteten und `invalid_record`
 * bekamen: **von einer Stichprobe auf die Menge geschlossen**, und die Tests
 * haben es gefangen, nicht das Nachdenken.
 */
export function assertExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  error: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    throw new Error(error);
  }
}
