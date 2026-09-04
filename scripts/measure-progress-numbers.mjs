import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Die Zahlen, die `progress.md` über den Zustand dieses Baums behauptet,
 * gegen das gehalten, was die Tore drucken.
 *
 * **Der Anlass** (2026-09-04). `progress.md` ist das Dokument, aus dem ein
 * Leser den Stand nimmt, und seine Zahlen werden von Hand gepflegt. Am
 * 2026-09-02 wurden sechzehn davon einmal von Hand nachgerechnet - alle
 * stimmten. Zwei Tage später, nach Phase 3, wich eine ab: die Fähigkeitenzahl
 * stand auf 433, gemessen waren 436, weil drei neue Ausfuhren dazugekommen
 * waren und niemand die Zeile mitzog.
 *
 * Eine von Hand nachgerechnete Zahl ist einmal richtig. Deshalb dieses
 * Werkzeug.
 *
 * **Kein Tor, und der Name sagt es**: `measure-` statt `check-`, wie bei
 * `measure-link-walk` und `measure-route-walk`. `release:verify` ruft es
 * nicht, und der Grund ist nicht Bequemlichkeit, sondern was es liest -
 * **Prosa**. Es sucht Zahlen in Sätzen, auf beiden Seiten, und ein Muster
 * über Prosa geht irgendwann daneben. Das ist keine Vermutung: beim ersten
 * Lauf traf mein eigenes Muster die Wire-Label-Zeile nicht, weil das Tor
 * „129 protocol labels spelled once" schreibt und ich „wire labels" gesucht
 * hatte. Ein Tor, das so danebengreift, meldet einen Fehlschlag, den niemand
 * verursacht hat - und ein Tor, das das zweimal tut, wird überlesen.
 *
 * Was es dafür kann: es sagt, welche Behauptung es *nicht* prüfen konnte,
 * statt sie stillschweigend als richtig zu zählen. Eine Zeile mit `?` ist
 * eine Lücke und keine Bestätigung.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));

/**
 * Die Tore, deren Zeilen hier gelesen werden - alle schnell und ohne Netz.
 * Gebaut wird nicht: wer die Zahlen nach einer Änderung will, baut vorher.
 */
const gates = [
  'surface:check',
  'reach:check',
  'capability:check',
  'companion:check',
  'store:check',
  'ceiling:check',
  'presence:check',
  'wire:check',
  'label:check',
];

/**
 * Was `progress.md` sagt, und woher die Zahl kommt.
 *
 * `spelled` steht dort, wo der Satz ein Zahlwort benutzt - „zehn kanonische
 * Formen" -, weil ein Leser das so schreibt und eine Ziffer daneben eine
 * zweite Schreibweise wäre.
 */
const claims = [
  { phrase: 'klassifizierte Flächen', from: /(\d+) surfaces, \d+ canonical forms/u },
  { phrase: 'zehn kanonische Formen', from: /\d+ surfaces, (\d+) canonical forms/u, spelled: 10 },
  { phrase: 'bediente HTTP-Routen', from: /(\d+) served routes and \d+ Link operations/u },
  { phrase: 'Pico-Link-Operationen', from: /\d+ served routes and (\d+) Link operations/u },
  { phrase: 'Aufrufern', from: /(\d+) of those routes have a caller/u },
  { phrase: 'begründeten Lücken', from: /have a caller and (\d+) are argued without one/u },
  {
    phrase: 'zwölf Autoritätsressourcen',
    from: /operations and (\d+) authority resources/u,
    spelled: 12,
  },
  { phrase: 'acht Affordances', from: /Presence affordance check passed \((\d+)/u, spelled: 8 },
  { phrase: 'einmalig geschriebene Wire-Labels', from: /\((\d+) protocol labels spelled once/u },
  { phrase: 'versionierte Stämme', from: /(\d+) versioned stems held to the versions/u },
  {
    phrase: 'auf allen vier Seiten verbundene IPC-Kanäle',
    from: /(\d+) IPC channels, named identically/u,
  },
  { phrase: 'geprüfte Fensterelemente', from: /(\d+) elements the window requires/u },
  { phrase: 'zehn Stores', from: /passed \((\d+) stores, \d+ writing methods/u, spelled: 10 },
  { phrase: 'Schreibmethoden', from: /\d+ stores, (\d+) writing methods/u },
  { phrase: 'exportierte Fähigkeiten', from: /Capability reach check passed \((\d+)/u },
  { phrase: 'Tabellen benennen ihr Wachstumsende', from: /passed \((\d+) tables/u },
  {
    /**
     * Zwei Zahlen in einem Satz: vollständig beurteilte Signierstellen und
     * die, deren Bewilligung an der Schlüsselrolle hängt. `progress.md` nennt
     * die Summe, und das ist richtig - beide nennen eine Protokollkonstante.
     */
    phrase: 'Signierstellen mit benannten Protokollkonstanten',
    from: /passed \((\d+) signing calls[\s\S]*?; (\d+) name a family whose approval/u,
    sum: true,
  },
];

let output = '';
for (const gate of gates) {
  try {
    output += execFileSync('npx', ['pnpm@9.0.0', gate], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (failed) {
    // Ein rotes Tor misst weniger, aber es misst - und die Zeile mit dem
    // Hinweis daneben ist ehrlicher als gar keine.
    output += String(failed.stdout ?? '');
    process.stdout.write(`${gate} lief nicht durch; seine Zahlen fehlen unten.\n`);
  }
}

const progress = readFileSync(join(repoRoot, 'progress.md'), 'utf8');
let differing = 0;
let unchecked = 0;

for (const claim of claims) {
  const found = claim.from.exec(output);
  if (found === null) {
    unchecked += 1;
    process.stdout.write(`?    ${claim.phrase}: im Torlauf nicht gefunden\n`);
    continue;
  }
  const measured = claim.sum === true
    ? Number(found[1]) + Number(found[2])
    : Number(found[1]);
  const stated = claim.spelled ?? (() => {
    const written = new RegExp(String.raw`(\d+(?:\.\d+)?)\s+${claim.phrase}`, 'u').exec(progress);
    return written === null ? undefined : Number(written[1].replace('.', ''));
  })();
  if (stated === undefined) {
    unchecked += 1;
    process.stdout.write(`?    ${claim.phrase}: steht so nicht in progress.md\n`);
    continue;
  }
  if (stated !== measured) {
    differing += 1;
    process.stdout.write(`XX   ${claim.phrase}: progress.md sagt ${stated}, gemessen ${measured}\n`);
    continue;
  }
  process.stdout.write(`     ${claim.phrase}: ${measured}\n`);
}

process.stdout.write(
  `\n${claims.length - differing - unchecked} von ${claims.length} Behauptungen stimmen, `
  + `${differing} weichen ab, ${unchecked} konnten nicht geprüft werden.\n`,
);
if (unchecked > 0) {
  process.stdout.write(
    'Eine ungeprüfte Behauptung ist eine Lücke und keine Bestätigung: entweder hat das Tor '
    + 'seine Zeile umformuliert, oder progress.md hat den Satz umgeschrieben.\n',
  );
}
process.exitCode = differing > 0 ? 1 : 0;
