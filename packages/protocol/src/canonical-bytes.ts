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
/**
 * Ob ein Wert ein kanonisches Token ist, hoechstens so viele Bytes lang.
 *
 * **Die Praedikatsform der Zusicherung darunter, und sie stand einundzwanzigmal
 * im Baum** (Befund B141): elfmal mit der Grenze 1024, siebenmal mit 256, und
 * dreimal unter dem Namen `isAsciiReference` - bei dem die Fassungen
 * auseinandergelaufen sind.
 *
 * **Zwei der drei liessen das `+` aus der Zeichenmenge weg.** Sie pruefen
 * `homeId`, `delegationId` und `sourceRef` - dieselben Werte, die anderswo
 * gegen die kanonische Menge gehalten werden. Strenger als die Regel, also
 * schliesst es zu; aber es ist eine Uneinigkeit darueber, was ein Token ist,
 * und die hat niemand gewaehlt.
 *
 * **Und dieselben zwei nahmen `undefined`, `null`, `42` und `true` an.** Sie
 * riefen `muster.test(wert)` ohne `typeof`-Pruefung, und `RegExp.test` wandelt
 * sein Argument in eine Zeichenkette um: aus `undefined` wird `"undefined"`,
 * und das besteht aus erlaubten Zeichen. Gemessen an der Stelle, an der es
 * zaehlt: `sourceRef` kommt ueber die Transportnaht von ADR 0089 herein -
 * *„HTTP, Pico Link or another sync mechanism may implement this lookup"* -,
 * und diese Pruefung war seine einzige. Die Nachbarn in derselben Bedingung
 * pruefen alle `typeof`.
 *
 * Dass die Zusicherung darunter das Praedikat *nicht* ruft, ist Absicht: sie
 * unterscheidet drei Ablehnungen - leer, zu lang, falsches Zeichen -, weil ihre
 * Testvektoren das tun. Was beide teilen, ist das Muster und der Kodierer
 * darueber, also die Frage selbst.
 */
export function isAsciiToken(value: unknown, maxBytes = 1024): value is string {
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new Error(`invalid_ascii_token_length:${String(maxBytes)}`);
  }
  if (typeof value !== 'string') {
    return false;
  }
  const bytes = canonicalTextEncoder.encode(value);
  return bytes.length > 0 && bytes.length <= maxBytes && canonicalAsciiTokenPattern.test(value);
}

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

/**
 * Ob ein Wert genau so viele Bytes als Kleinbuchstaben-Hex traegt.
 *
 * **Die syntaktische Haelfte von `fixedHexBytes` darunter, und sie stand
 * dreiundfuenfzigmal im Baum** (Befund B140, gemessen in B139): einunddreissig
 * Mal fuer zweiunddreissig Bytes, sechzehn Mal fuer vierundsechzig, fuenf Mal
 * fuer sechzehn, einmal fuer zwanzig. Der Namenszaehler sah davon fast nichts,
 * weil die meisten Stellen gar keinen Namen tragen - ein `/^[0-9a-f]{64}$/`
 * mitten in einer Bedingung heisst nichts.
 *
 * **Und was hier ausdruecklich *nicht* passiert, ist das Zusammenlegen der
 * Begriffe.** Dieselben vierundsechzig Zeichen bewachen im Baum mindestens
 * vier verschiedene Dinge: Schluesselfingerabdruecke, oeffentliche Schluessel,
 * Digests und einen Zweig der Git-Commit-Form. In `founding.ts` standen
 * `fingerprintPattern` und `publicKeyPattern` byte-gleich untereinander. Sie
 * nach der Form zusammenzuziehen waere die Umkehrung von Befund B124: **eine
 * Form ist kein Begriff.** Jeder behaelt seinen Namen und seine Ablehnung -
 * was er von hier holt, ist nur die Frage, ob die Zeichen stimmen.
 */
/**
 * Dieselbe Form als Muster, fuer die Begriffe, die eines exportieren.
 *
 * Zwoelf benannte Konstanten schrieben sie aus (Befund B140), und **vier davon
 * sind Teil der Paketoberflaeche**: `picoLinkMailboxPattern`,
 * `picoLinkPacketTagPattern`, `picoRelayOperatorCredentialPattern` und
 * `picoLinkRelayAccountPattern` - eine Postfachadresse, ein Pakettag, ein
 * Betreiberkreditiv und ein Relaiskonto, alle sechzehn Bytes, alle
 * verschieden. Sie zu einem Praedikat zu machen haette ihre Signatur
 * geaendert; sie zu verschmelzen haette vier Begriffe zu einem gemacht. Sie
 * behalten Namen, Typ und Export, und holen nur die Form von hier.
 */
export function hexOfBytesPattern(byteLength: number): RegExp {
  if (!Number.isInteger(byteLength) || byteLength <= 0) {
    throw new Error(`invalid_hex_byte_length:${String(byteLength)}`);
  }
  return new RegExp(`^[0-9a-f]{${byteLength * 2}}$`, 'u');
}

export function isHexOfBytes(value: unknown, byteLength: number): value is string {
  if (!Number.isInteger(byteLength) || byteLength <= 0) {
    // Ein Aufrufer, der sich hier vertippt, bekaeme sonst ein Praedikat, das
    // die leere Zeichenkette annimmt - und das liest sich wie eine Pruefung.
    throw new Error(`invalid_hex_byte_length:${String(byteLength)}`);
  }
  return typeof value === 'string'
    && value.length === byteLength * 2
    && canonicalHexPattern.test(value);
}

/** Dieselbe Frage als Zusicherung, mit dem Namen, den der Aufrufer waehlt. */
export function assertHexOfBytes(
  value: unknown,
  byteLength: number,
  reason = 'invalid_hex',
): asserts value is string {
  if (!isHexOfBytes(value, byteLength)) {
    throw new Error(reason);
  }
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
/**
 * Ob ein Datensatz genau diese Felder traegt, nicht mehr und nicht weniger.
 *
 * **Die Praedikatsform derselben Regel, die `assertExactKeys` darunter wirft**
 * - und sie stand achtmal im Baum (Befund B136): einmal in `app.ts`, zweimal
 * als Laengenvergleich, viermal im Vault-Daemon und einmal im Protokoll
 * selbst, das die Regel eine Datei weiter schon exportierte. Sieben davon
 * stimmen ueber alle dreizehn gemessenen Eingaben mit dieser hier ueberein;
 * sie waren dieselbe Regel in drei Schreibweisen.
 *
 * **Die achte war schwaecher, und zwar auf eine Art, die man nicht sieht.**
 * Sie pruefte „jeder erwartete Schluessel ist `in` dem Datensatz" statt „die
 * Schluesselmengen sind gleich". `in` fragt die Prototypkette mit, also galt
 * ein Feld als vorhanden, wenn sein Name auf `Object.prototype` lebt: ein
 * leerer Datensatz bestand die Pruefung gegen `['toString']`, und `{a: 1}`
 * bestand sie gegen `['a', 'constructor']`. Zwoelf solche Namen gibt es,
 * darunter `valueOf`, `hasOwnProperty` und `__proto__`. Gemessen: keiner der
 * dreiundzwanzig Aufrufer nannte einen davon, es war also eine schlummernde
 * Schwaeche und kein lebender Fehler - aber die Namen, um die es geht, sind
 * genau die, die ein Angreifer in eine Nutzlast schreibt.
 *
 * Dass die Zusicherung darunter diese Funktion *benutzt*, ist der Punkt: sie
 * ist das Praedikat plus ein Wurf, also koennen die beiden nicht
 * auseinanderlaufen. Bis hierher stand die Regel in beiden ausgeschrieben.
 */
export function hasExactKeys(record: object, keys: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

export function assertExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  error: string,
): void {
  if (!hasExactKeys(record, keys)) {
    throw new Error(error);
  }
}

/**
 * Bytes als Hex, so wie dieses Produkt Hex schreibt: klein und zweistellig.
 *
 * **Der Anlass** (2026-09-10, Befund B125). Diese eine Zeile stand **achtmal**
 * im Baum, in drei Schreibweisen - `Buffer.from(...).toString('hex')`, eine
 * Schleife mit `padStart`, und zweimal `Array.from(...).map(...).join('')`.
 * Ausgefuehrt liefern alle vier dasselbe, auch an den Raendern (leer, Nullen,
 * Werte unter sechzehn) - gemessen und nicht gelesen.
 *
 * **Warum eine Zeile eine Regel ist.** `padStart(2, '0')` zu vergessen faellt
 * nicht auf: aus einem Byte `10` wird `'a'` statt `'0a'`, die Zeichenkette
 * bleibt Hex, und jeder Fingerabdruck danach ist um ein Zeichen verschoben.
 * `canonicalHexPattern` daneben verlangt Kleinschreibung; wer `toUpperCase`
 * schriebe, bekaeme eine Zeichenkette, die dieses Produkt nirgends annimmt.
 * Acht Gelegenheiten, das einmal falsch zu machen, sind sieben zu viel.
 *
 * `Buffer` statt einer Schleife, weil das Protokollpaket ohnehin darauf steht
 * und die Umwandlung damit die des Laufzeitsystems ist statt einer eigenen.
 */
/**
 * Hex als Bytes - die Umkehrung von `bytesToHex` darunter, und bis zum
 * 2026-09-11 achtmal geschrieben (Befund B137 zaehlte sie, B138 mass sie).
 *
 * **Befund B125 hat diese acht angesehen und stehen lassen**, mit dem Grund
 * *„die Pruefungen unterscheiden sich wirklich"*. Ausgefuehrt ueber neun
 * Eingaben stimmt das nicht: die drei Fassungen, die *pruefen*, urteilen ueber
 * jede einzelne gleich - leer, ungerade Laenge, Grossbuchstaben, gemischt,
 * Nicht-Hex, halber Muell, Leerzeichen, `0x`-Praefix. Sie unterscheiden sich
 * im *Namen* der Ablehnung, und dafuer gibt es einen Parameter.
 *
 * **Die fuenf, die nicht pruefen, unterscheiden sich dagegen wirklich - und
 * zwar voneinander.** `Buffer.from(h, 'hex')` schneidet still ab (`'abc'` gibt
 * ein Byte), nimmt Grossbuchstaben an und gibt fuer `'zzzz'` nichts zurueck.
 * Die von Hand geschriebene Paarschleife macht aus demselben `'zzzz'` **zwei
 * Nullbytes**, aus `'aa bb'` die Bytes `[170, 11]` und aus `'0xaabb'` drei
 * Bytes. Zwei Wege, die dasselbe heissen und aus derselben kaputten Eingabe
 * verschiedene Antworten bauen, ohne dass einer davon meldet.
 *
 * Gepruefte Laenge, gepruefte Kleinschreibung, und leer ist keine leere Folge
 * sondern eine Ablehnung - denn `hexToBytes('')` gibt sonst ein Array ohne
 * Bytes zurueck, und ein Schluessel ohne Bytes ist kein leerer Schluessel.
 */
/**
 * Ob ein Wert Hex in Paaren ist: nicht leer, gerade Laenge, Kleinbuchstaben.
 *
 * **Die Pruefung, die `hexToBytes` darunter ohnehin macht - und sie stand
 * siebenmal daneben, in drei Schreibweisen** (Befund B142): dreimal als
 * `isCanonicalHex` mit einer ausgeschriebenen Laengenbedingung (zweimal
 * `length > 0`, einmal `length >= 2`, ueber allen gemessenen Eingaben
 * gleichwertig), dreimal als `/^(?:[0-9a-f]{2})+$/`, und einmal als blankes
 * Zeichenmuster mit einer Laengenzahl daneben - das war in Wahrheit
 * `isHexOfBytes(wert, 32)`.
 *
 * Die gerade Laenge ist die Haelfte, die man vergisst: `0` ist durch zwei
 * teilbar, also laesst eine Bedingung, die nur `% 2 === 0` prueft, die leere
 * Zeichenkette durch - und leere Bytes sind kein leerer Schluessel.
 */
export function isCanonicalHex(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length % 2 === 0
    && canonicalHexPattern.test(value);
}

export function hexToBytes(value: unknown, reason = 'invalid_hex'): Uint8Array {
  if (!isCanonicalHex(value)) {
    throw new Error(reason);
  }
  return Uint8Array.from(Buffer.from(value, 'hex'));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}
