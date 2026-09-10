import { chmodSync, closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Wie dieses Gerät eine eigene Aufzeichnung ablegt: ganz oder gar nicht, und
 * nur für sich.
 *
 * **Der Anlass** (2026-09-10, Befund B121). `profile.ts` machte es seit jeher
 * richtig - Zwischendatei mit `0600`, `chmod` dagegen die Maske, `fsync`,
 * umbenennen, Verzeichnis `fsync`. Die Datei **daneben**, im selben
 * Verzeichnis geschrieben von derselben Anwendung, machte nichts davon:
 * `writeFileSync(pfad, json, 'utf8')`, dreimal.
 *
 * **Der Modus ist die kleinere Hälfte.** Die grössere ist, dass ein Absturz
 * mitten im Schreiben eine abgeschnittene Datei hinterlässt - und
 * `readPicoCompanionReaderCustodySpace` fängt den Parse-Fehler und antwortet
 * `undefined`, weil *"kein Raum ist eine Antwort und kein Fehler"*. Das
 * stimmt, solange die Abwesenheit echt ist. Eine abgeschnittene Datei liest
 * sich damit als **"dieses Gerät hat keinen Verwahrraum"**, und die Fläche
 * bietet an, einen anzulegen - während der Satz für die Ablehnung daneben
 * sagt, was das kostet: *"Making a second one would leave what is in the first
 * unreachable from this device."*
 *
 * Ein halb geschriebener Zustand, der als sauberer Anfangszustand gelesen
 * wird, ist die teuerste Sorte kaputt.
 *
 * **`chmod` neben dem `mode`**, und der Grund ist ein anderer als der, den ich
 * zuerst hingeschrieben hatte. Die Behauptung war *"`mode` geht durch die
 * `umask`"* - gemessen stimmt sie für diesen Wert nicht: eine Maske nimmt nur
 * Bits weg, und `0600` hat keine, die `022` wegnähme. Der wirkliche Grund ist,
 * dass `mode` **nur beim Anlegen** gilt:
 *
 * ```
 * neu angelegt mit mode 0600 unter umask 022: 600
 * vorhandene 0644 mit mode 0600 ueberschrieben: 644
 * ```
 *
 * Nach einem Absturz liegt eine `.tmp` von vorher da. `writeFileSync` öffnet
 * sie, lässt ihre Rechte, wie sie sind, und das Umbenennen trägt sie auf das
 * Ziel. Ohne `chmodSync` überlebt so ein offener Modus einen Absturz - und
 * genau das prüft der Test daneben. Aufgefallen ist es, weil die Pflanzung
 * *"`chmodSync` weg"* zuerst **nicht** feuerte.
 */
export function writePicoCompanionFileAtomically(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, contents, { mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  fsyncFile(temporaryPath);
  renameSync(temporaryPath, path);
  fsyncDirectory(dirname(path));
}

function fsyncFile(path: string): void {
  const handle = openSync(path, 'r+');
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

function fsyncDirectory(path: string): void {
  const handle = openSync(path, 'r');
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}
