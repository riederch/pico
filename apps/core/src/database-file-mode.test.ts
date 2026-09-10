import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { narrowToOwner } from './database-file-mode.js';
import { EventStore } from './event-store.js';

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pico-database-mode-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('ADR 0071 - wer die Datenbank einer Person lesen darf', () => {
  /**
   * Befund B117, gegangen gegen ein echtes Home: startete es gegen ein
   * Datenverzeichnis, das schon existierte, blieb Folgendes liegen -
   * `755 data`, `644 data/pico.sqlite`, `644 -wal`, `644 -shm`, daneben
   * `700 data/home-host-keys` mit `600` Schluesseldateien. Die Schluessel sind
   * sorgfaeltig; die Datenbank, fuer die es sie gibt, lag offen.
   *
   * Existierte das Verzeichnis *nicht*, kam `700` heraus - aber nur, weil das
   * `mkdirSync(..., { mode: 0o700 })` des Schluesselspeichers den Elternteil
   * unterwegs mit anlegte. Ein Schutz, der aus Versehen gilt, gilt bis jemand
   * anders installiert, ein Volume einhaengt oder eine Sicherung zurueckspielt.
   */
  it('haelt Datenbank und ihre Begleitdateien beim Eigentuemer, auch in einem offenen Verzeichnis',
    () => {
      const directory = temporaryDirectory();
      const data = join(directory, 'data');
      mkdirSync(data, { recursive: true });
      chmodSync(data, 0o755);

      const store = new EventStore(join(data, 'pico.sqlite'));
      store.close();

      for (const name of ['pico.sqlite', 'pico.sqlite-wal', 'pico.sqlite-shm']) {
        const path = join(data, name);
        // `-wal` und `-shm` verschwinden beim sauberen Schliessen; was da ist,
        // muss eng sein.
        let mode: number | null = null;
        try {
          mode = statSync(path).mode & 0o777;
        } catch {
          continue;
        }
        expect(mode & ~0o600).toBe(0);
      }
    });

  it('verengt nur und weitet nie', () => {
    const directory = temporaryDirectory();
    const tighter = join(directory, 'tighter');
    writeFileSync(tighter, 'x', { mode: 0o400 });
    chmodSync(tighter, 0o400);

    narrowToOwner(tighter);

    // Wer enger gestellt hat, hat es so gemeint.
    expect(statSync(tighter).mode & 0o777).toBe(0o400);
  });

  it('nimmt jedem anderen das Lesen, auch wenn die Gruppe schreiben durfte', () => {
    const directory = temporaryDirectory();
    const open = join(directory, 'open');
    writeFileSync(open, 'x');
    chmodSync(open, 0o664);

    narrowToOwner(open);

    expect(statSync(open).mode & 0o777).toBe(0o600);
  });
});
