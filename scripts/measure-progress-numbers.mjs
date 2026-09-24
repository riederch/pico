import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flattenPicoVerifyChain } from './verify-chain.mjs';

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
  // Befund B237: `progress.md` nennt Testdateien, Faelle und
  // Erwartungsausdruecke, und `tests:check` zaehlt genau die - statisch, ohne
  // Lauf, und druckt sie in seiner Erfolgszeile.
  'tests:check',
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
    /**
     * Ausgeschrieben war es bis zum 2026-09-24, mit `spelled: 12`. Die
     * sechste Reader-Custody-Ressource (ADR 0078 K9) machte daraus 13, und
     * eine Zahl, die waechst, gehoert in Ziffern - sonst zieht die naechste
     * Aenderung zwei Schreibweisen hinter sich her.
     */
    phrase: 'Autoritätsressourcen darunter',
    from: /operations and (\d+) authority resources/u,
  },
  { phrase: 'acht Affordances', from: /Presence affordance check passed \((\d+)/u, spelled: 8 },
  { phrase: 'einmalig geschriebene Wire-Labels', from: /\((\d+) protocol labels spelled once/u },
  { phrase: 'versionierte Stämme', from: /(\d+) versioned stems held to the versions/u },
  {
    phrase: 'auf allen vier Seiten verbundene IPC-Kanäle',
    from: /(\d+) IPC channels, named identically/u,
  },
  { phrase: 'geprüfte Fensterelemente', from: /(\d+) elements the window requires/u },
  { phrase: 'elf Stores', from: /passed \((\d+) stores, \d+ writing methods/u, spelled: 11 },
  { phrase: 'Schreibmethoden', from: /\d+ stores, (\d+) writing methods/u },
  { phrase: 'exportierte Fähigkeiten', from: /Capability reach check passed \((\d+)/u },
  { phrase: 'Tabellen benennen ihr Wachstumsende', from: /passed \((\d+) tables/u },
  /**
   * **Drei Zahlen, die dieses Werkzeug nicht kannte** (Befund B237,
   * 2026-09-20). `progress.md` nennt Testdateien, Faelle und
   * Erwartungsausdruecke, und alle drei waren am 2026-09-20 veraltet - 265
   * statt 266, 2.979 statt 2.996, 9.304 statt 9.360.
   *
   * Der Satz unten sagt weiterhin, dass dieses Werkzeug *ausgefuehrte*
   * Testzahlen nicht prueft: dafuer braucht es einen vollen Lauf. Diese drei
   * sind etwas anderes - `tests:check` zaehlt sie **statisch**, aus dem
   * Bestand, und druckt sie in seiner Erfolgszeile. Was ein Tor ohnehin
   * druckt, gehoert gehalten.
   */
  { phrase: 'Testdateien', from: /passed \((\d+) test files/u },
  { phrase: 'Fällen', from: /\d+ test files, (\d+) cases/u },
  { phrase: 'Erwartungsausdrücken', from: /(\d+) assertions, each with a matcher/u },
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

/**
 * Die Schrittzahl der Kette, aus `package.json` gezaehlt statt aus einer
 * Torzeile gelesen.
 *
 * Die einzige Zahl hier, die keine Ausgabe braucht - und deshalb die
 * verlaesslichste: `release:verify` ist eine `&&`-Kette, und ihre Glieder sind
 * zaehlbar. Sie stand am 2026-09-04 richtig, und das war Glueck: sie wurde an
 * dem Tag zweimal von Hand mitgezogen.
 */
{
  const { scripts } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  // Aufgefaltet statt gezaehlt: seit dem 2026-09-05 ist `release:verify` nur
  // noch `verify:gates && verify:passes`, damit CI die Testdurchgaenge
  // nebeneinander fahren kann. Zwei waere hier die Zahl der Haelften und nicht
  // der Schritte (Befund B67).
  const measured = flattenPicoVerifyChain(scripts, scripts['release:verify']).length;
  const written = /umfasst (\d+) Schritte/u.exec(progress);
  if (written === null) {
    unchecked += 1;
    process.stdout.write('?    Schritte in release:verify: steht so nicht in progress.md\n');
  } else if (Number(written[1]) !== measured) {
    differing += 1;
    process.stdout.write(
      `XX   Schritte in release:verify: progress.md sagt ${written[1]}, gezaehlt ${measured}\n`,
    );
  } else {
    process.stdout.write(`     Schritte in release:verify: ${measured}\n`);
  }
}

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

const total = claims.length + 1;
process.stdout.write(
  `\n${total - differing - unchecked} von ${total} Behauptungen stimmen, `
  + `${differing} weichen ab, ${unchecked} konnten nicht geprüft werden.\n`,
);
/**
 * **Was hier nicht geprueft wird, und warum es dasteht.** Die Testzahlen -
 * „2.933 Tests: Core 1.096, …" - brauchen einen vollen Lauf von Minuten, und
 * dieses Werkzeug soll in Sekunden antworten, sonst wird es nicht benutzt. Sie
 * sind am 2026-09-04 von Hand nachgezaehlt worden, und dabei wichen drei ab:
 * Core, Companion-Core und Web, alle drei von Aenderungen desselben Tages. Am
 * 2026-09-05 noch einmal, und wieder wichen zwei ab: Spatial Recall (22 -> 32)
 * und Companion-Core (273 -> 274) - beide von der Verdichtung auf dem Geraet.
 * Zwei Nachzaehlungen, vier Abweichungen: von Hand gepflegte Zahlen driften,
 * und das ist der Grund, warum die sechzehn darueber maschinell gehalten
 * werden.
 *
 * Am 2026-09-07 wurden zuerst zwei Zahlen fortgeschrieben - Core 1.096 ->
 * 1.097 und Protocol 619 -> 620, die beiden Pakete, die an dem Tag ein Netz
 * dazubekamen (Befund B68). Danach lief die ganze Menge einmal durch, und
 * alle siebzehn Paketzahlen stimmten: 2.935 in der Summe, keine Abweichung.
 * Die erste Nachzaehlung ohne eine - und der Grund ist kein Verdienst,
 * sondern dass die geaenderten Zahlen am selben Tag mitgezogen wurden.
 *
 * Am 2026-09-08 dasselbe, und wieder ohne Abweichung: 2.948 in der Summe,
 * siebzehn von siebzehn. Was sich bewegt hat, sind die Pakete, die an dem Tag
 * ein Netz dazubekamen - Core, Relay, Vault-Daemon -, und sie sind mit ihrer
 * Aenderung mitgezogen worden statt am Ende nachgetragen. Das ist die ganze
 * Kunst an von Hand gepflegten Zahlen, und sie ist geringer, als der Aufwand
 * vermuten laesst, den ihr Driften kostet.
 * Wer sie nachrechnen will: `pnpm test` und die `Tests  N passed`-Zeilen je
 * Paket addieren.
 */
process.stdout.write(
  'Die Testzahlen prueft dies nicht - sie brauchen einen vollen Lauf. '
  + 'Vollstaendig von Hand nachgezaehlt zuletzt am 2026-09-10, 17 von 17 ohne Abweichung.\n',
);
if (unchecked > 0) {
  process.stdout.write(
    'Eine ungeprüfte Behauptung ist eine Lücke und keine Bestätigung: entweder hat das Tor '
    + 'seine Zeile umformuliert, oder progress.md hat den Satz umgeschrieben.\n',
  );
}
process.exitCode = differing > 0 ? 1 : 0;
