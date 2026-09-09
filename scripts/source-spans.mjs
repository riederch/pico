/**
 * Den Rumpf eines Aufrufs lesen, ohne an einer Zeichenkette zu verrutschen.
 *
 * **Der Anlass** (Befund B105). Eine Regel las den Zuhoerer eines Formulars
 * ueber ein Fenster von 400 Zeichen und fand darin ein `preventDefault`, das
 * dem *naechsten* Zuhoerer gehoerte. Die Pflanzung - dem echten Zuhoerer sein
 * `preventDefault` genommen - fiel nicht auf, und der Pruefer meldete gruen.
 * Es ist dieselbe Klasse wie Befund B96: eine Spanne, die nicht dort endet, wo
 * der Gegenstand endet, entlastet den Nachbarn.
 *
 * Eine Spanne endet hier an ihrer eigenen schliessenden Klammer, gezaehlt auf
 * einer Fassung, in der Zeichenketten und Kommentare durch Leerzeichen ersetzt
 * sind. Getrennte Ersetzungen (erst Zeichenketten, dann Kommentare, oder
 * umgekehrt) gehen an genau zwei Stellen schief: ein Apostroph in einem
 * Kommentar und ein `//` in einer Zeichenkette. Deshalb ein Durchgang.
 *
 * **`check-link-seal.mjs` behaelt seinen eigenen Filter**, und das ist kein
 * Versehen: der braucht das Gegenteil - er *erhaelt* den Inhalt von `${...}`,
 * weil er darin nach Namen sucht. Zwei Anforderungen, nicht dieselbe Wahrheit
 * zweimal.
 */
export function blankStringsAndComments(source) {
  const out = [...source];
  const blank = (from, to) => {
    for (let i = from; i < to && i < out.length; i += 1) {
      if (out[i] !== '\n') {
        out[i] = ' ';
      }
    }
  };
  let i = 0;
  while (i < source.length) {
    const character = source[i];
    if (character === '/' && source[i + 1] === '/') {
      let end = i;
      while (end < source.length && source[end] !== '\n') {
        end += 1;
      }
      blank(i, end);
      i = end;
      continue;
    }
    if (character === '/' && source[i + 1] === '*') {
      let end = i + 2;
      while (end < source.length && !(source[end] === '*' && source[end + 1] === '/')) {
        end += 1;
      }
      blank(i, end + 2);
      i = end + 2;
      continue;
    }
    /**
     * Ein regulaerer Ausdruck ist keine Division (Befund B108). `/<section
     * id="admin-section"[^>]*\\shidden/` traegt zwei Anfuehrungszeichen; ohne
     * diesen Zweig beginnt hier eine Zeichenkette, die bis irgendwohin laeuft,
     * und die Klammern der ganzen Datei gehen nicht mehr auf. Vier von 511
     * Dateien waren so - gefunden, indem nach dem Ausblenden nachgezaehlt
     * wurde, ob die Klammern noch aufgehen.
     *
     * Ob ein `/` teilt oder einen Ausdruck beginnt, entscheidet das letzte
     * Zeichen davor: nach einem Wert wird geteilt, nach einem Operator, einer
     * offenen Klammer oder einem Schluesselwort beginnt ein Ausdruck.
     */
    if (character === '/') {
      let back = i - 1;
      while (back >= 0 && /\s/u.test(source[back])) {
        back -= 1;
      }
      const previous = back < 0 ? '' : source[back];
      const word = /[\w$)\]]/u.test(previous)
        && !/\b(?:return|typeof|case|in|of|delete|void|instanceof|do|else|yield|await)$/u
          .test(source.slice(Math.max(0, back - 10), back + 1));
      if (!word) {
        let end = i + 1;
        let inClass = false;
        while (end < source.length && source[end] !== '\n') {
          if (source[end] === '\\') {
            end += 2;
            continue;
          }
          if (source[end] === '[') {
            inClass = true;
          } else if (source[end] === ']') {
            inClass = false;
          } else if (source[end] === '/' && !inClass) {
            break;
          }
          end += 1;
        }
        if (end < source.length && source[end] === '/') {
          blank(i + 1, end);
          i = end + 1;
          continue;
        }
      }
    }
    if (character === "'" || character === '"' || character === '`') {
      let end = i + 1;
      while (end < source.length) {
        if (source[end] === '\\') {
          end += 2;
          continue;
        }
        if (source[end] === character) {
          break;
        }
        end += 1;
      }
      blank(i + 1, end);
      i = end + 1;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/**
 * Von `at` bis zur schliessenden Klammer, die zu der ersten `(` danach
 * gehoert. `flat` muss die ausgeblendete Fassung sein; zurueck kommen die
 * Grenzen, damit der Aufrufer im Original lesen kann.
 */
export function callSpan(flat, at) {
  let depth = 0;
  let start = -1;
  for (let i = at; i < flat.length; i += 1) {
    if (flat[i] === '(') {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
    } else if (flat[i] === ')') {
      depth -= 1;
      if (depth === 0) {
        return [start, i + 1];
      }
    }
  }
  return null;
}

/**
 * Von `at` bis zur schliessenden Klammer des ersten `{` danach - der Rumpf
 * einer Funktion. `flat` muss die ausgeblendete Fassung sein.
 */
export function braceSpan(flat, at) {
  let depth = 0;
  let start = -1;
  for (let i = at; i < flat.length; i += 1) {
    if (flat[i] === '{') {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
    } else if (flat[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return [start, i + 1];
      }
    }
  }
  return null;
}
