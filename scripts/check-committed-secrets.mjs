import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Kein Schluesselmaterial im Baum (Befund B93).
 *
 * **Der Anlass ist ein sauberer Befund** (2026-09-08): der verfolgte Baum
 * enthaelt keine Schluesseldatei und keinen PEM-Block. Das war der gute
 * Zustand ohne Netz - dieselbe Lage wie in B82, B90 und B92 -, und bei dieser
 * Klasse ist das Fehlen des Netzes teurer als bei den anderen: ein Schluessel,
 * der einmal in der Geschichte steht, ist auch nach dem Loeschen dort.
 *
 * **Absichtlich eng.** Ein Scanner, der nach „sieht aus wie ein Geheimnis"
 * sucht, findet in diesem Baum vor allem Bezeichner: eine erste Messung ergab
 * 329 Treffer, alle falsch, und nach dem Schaerfen 94, wieder alle falsch -
 * lange camelCase-Namen und die Testvektoren des Designsystems. Eine Pruefung,
 * deren Fehlschlaege meistens falsch sind, bringt Leute dazu, Pruefungen zu
 * ueberspringen.
 *
 * Deshalb genau zwei Fragen, die keine Meinung brauchen:
 *
 * 1. Traegt eine verfolgte Datei einen Namen, den nur Schluesselmaterial
 *    traegt? Dateiendungen und die zwei ueblichen SSH-Namen.
 * 2. Steht in einer verfolgten Textdatei ein PEM-Block mit einem privaten
 *    Schluessel?
 *
 * Beides faengt den Fall, der nicht mehr gutzumachen ist, und nichts sonst.
 * Was es *nicht* faengt, steht hier, statt dass jemand mehr hineinliest: ein
 * Zugangstoken als gewoehnliche Zeichenkette, ein Schluessel in einer Datei
 * ohne verraeterischen Namen, und alles, was nicht verfolgt ist -
 * `.dockerignore` und `.gitignore` sind fuer das Ungefolgte zustaendig (B91).
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

/** Namen, die nur Schluesselmaterial traegt. */
const keyNames = [
  /\.pem$/u, /\.key$/u, /\.p12$/u, /\.pfx$/u, /\.jks$/u, /\.keystore$/u,
  /\.asc$/u, /\.gpg$/u, /(?:^|\/)id_rsa$/u, /(?:^|\/)id_ed25519$/u,
  /(?:^|\/)\.env$/u,
];

/** Was ein privater Schluessel in Textform ueber sich selbst sagt. */
const pemBlock = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/u;

/** Endungen, die Text tragen und deshalb gelesen werden. */
const readable = /\.(?:ts|tsx|mjs|cjs|js|json|ya?ml|md|txt|sh|cts|toml|ini|conf|env|xml|html|css)$/u;

const tracked = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf8' })
  .split('\n')
  .filter((line) => line !== '');

if (tracked.length === 0) {
  console.error(
    'Committed-secrets check failed: git tracks nothing here, so this check read '
    + 'nothing and must not report a clean tree.',
  );
  process.exit(1);
}

let filesRead = 0;
for (const path of tracked) {
  if (keyNames.some((pattern) => pattern.test(path))) {
    errors.push(
      `${path}: is tracked and carries a name that only key material carries. A key `
      + 'in the history stays in the history after it is deleted, so this is the one '
      + 'class that has to be caught before the commit rather than after.',
    );
    continue;
  }
  if (!readable.test(path)) {
    continue;
  }
  const absolute = join(repoRoot, path);
  // Grosse Dateien sind hier Vektoren und Sperrdateien, keine Schluessel.
  if (statSync(absolute).size > 2_000_000) {
    continue;
  }
  filesRead += 1;
  if (pemBlock.test(readFileSync(absolute, 'utf8'))) {
    errors.push(
      `${path}: contains a PEM private-key block. Whatever it was for, it is now `
      + 'in the history of this repository and has to be treated as disclosed.',
    );
  }
}

if (filesRead === 0) {
  errors.push(
    'no readable tracked file was opened, so the PEM question passed over nothing.',
  );
}

if (errors.length > 0) {
  console.error('Committed-secrets check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Committed-secrets check passed (${tracked.length} tracked paths named, `
  + `${filesRead} of them read for a private-key block; neither a key file nor a key).`,
);
