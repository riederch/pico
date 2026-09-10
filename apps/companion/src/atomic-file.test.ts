import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writePicoCompanionFileAtomically } from './atomic-file.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pico-atomic-file-'));
  directories.push(directory);
  return directory;
}

describe('Befund B121 - wie dieses Geraet eine eigene Aufzeichnung ablegt', () => {
  it('legt sie so ab, dass nur der Eigentuemer sie lesen kann', () => {
    const directory = temporaryDirectory();
    const path = join(directory, 'space', 'reader-custody-space.json');

    writePicoCompanionFileAtomically(path, '{"a":1}\n');

    expect(statSync(path).mode & 0o777).toBe(0o600);
    // Das Verzeichnis daneben, das dabei entsteht, ebenso.
    expect(statSync(join(directory, 'space')).mode & 0o777).toBe(0o700);
  });

  it('nimmt einer offen liegenden Vorgaengerdatei ihre Offenheit', () => {
    const directory = temporaryDirectory();
    const path = join(directory, 'record.json');
    writeFileSync(path, 'alt');
    chmodSync(path, 0o644);

    writePicoCompanionFileAtomically(path, 'neu');

    expect(readFileSync(path, 'utf8')).toBe('neu');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('erbt die Rechte einer liegengebliebenen Zwischendatei nicht', () => {
    /**
     * Befund B121. Nach einem Absturz liegt eine `.tmp` von vorher da;
     * `writeFileSync` oeffnet sie und laesst ihre Rechte, wie sie sind - das
     * `mode`-Feld gilt nur beim Anlegen. Ohne `chmodSync` traegt das
     * Umbenennen den offenen Modus auf das Ziel.
     */
    const directory = temporaryDirectory();
    const path = join(directory, 'record.json');
    writeFileSync(`${path}.tmp`, 'halb');
    chmodSync(`${path}.tmp`, 0o644);

    writePicoCompanionFileAtomically(path, 'ganz');

    expect(readFileSync(path, 'utf8')).toBe('ganz');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('laesst keine Zwischendatei liegen', () => {
    const directory = temporaryDirectory();
    const path = join(directory, 'record.json');

    writePicoCompanionFileAtomically(path, 'x');

    // Eine `.tmp` daneben waere der halbe Zustand, den der Leser als
    // Abwesenheit lesen wuerde - und Abwesenheit heisst hier "lege einen
    // zweiten Raum an".
    expect(readdirSync(directory)).toEqual(['record.json']);
  });

  it('faellt, wenn das Ziel ein Verzeichnis ist, statt still nichts zu tun', () => {
    const directory = temporaryDirectory();
    const path = join(directory, 'record.json');
    mkdirSync(path, { recursive: true });

    expect(() => writePicoCompanionFileAtomically(path, 'x')).toThrow();
  });
});
