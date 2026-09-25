import { spawn } from 'node:child_process';
import type {
  PicoCompanionRecoveryCardPrintPort,
} from '@pico/companion/recovery-card';

/** Direct CUPS spool: PDF bytes use stdin and no companion-owned file exists. */
export function createLinuxLpRecoveryCardPrinter(input: {
  command?: string;
} = {}): PicoCompanionRecoveryCardPrintPort {
  const command = input.command ?? 'lp';
  return {
    printRecoveryCard: async ({ form, pdf }) => await new Promise((resolve, reject) => {
      const args = picoLinuxRecoveryCardPrintArguments(form);
      /**
       * Befund B209. `stdout` wird gelesen, weil dort steht, wohin die Karte
       * ging.
       *
       * **Vorher stand hier `'ignore'`**, und dieser Weg gab die feste
       * Zeichenkette `'default printer'` zurueck - die die Schale einer Person
       * in einen Satz setzt, neben der Bitte, den Card-PIN getrennt zu halten
       * und die Geheimseite nie zu fotografieren. Wohin die Karte wirklich
       * ging, entscheidet aber die geerbte Umgebung (`PRINTER`, `LPDEST`,
       * `CUPS_SERVER`), und `lp` sagt es: sein Bericht ueber die
       * Auftragskennung ist voreingestellt an - dafuer gibt es `-s`, um ihn
       * abzuschalten -, und eine CUPS-Kennung traegt das Ziel im Namen.
       *
       * Ein Satz ueber das empfindlichste Stueck dieses Produkts nennt keinen
       * Ort, an dem niemand nachgesehen hat.
       */
      /**
       * Befund B279. `lp` reicht die Karte nur an den Spooler und kehrt
       * sofort zurueck - ausser CUPS antwortet nicht, und dann kehrte es nie
       * zurueck: die Person saesse vor dem empfindlichsten Schritt dieses
       * Produkts ohne Antwort. Nach der Frist endet der Prozess, und `close`
       * meldet es als gescheiterten Druck.
       */
      const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: picoLinuxPrintTimeoutMs,
        killSignal: 'SIGKILL',
      });
      let stdout = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        if (stdout.length < 4_096) {
          stdout += chunk.slice(0, 4_096 - stdout.length);
        }
      });
      let stderr = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        if (stderr.length < 4_096) {
          stderr += chunk.slice(0, 4_096 - stderr.length);
        }
      });
      child.once('error', () => reject(new Error('recovery_card_printer_unavailable')));
      child.once('close', (code) => {
        if (code === 0) {
          resolve({ destination: picoLinuxPrintDestination(stdout) });
        } else {
          reject(new Error(
            stderr.trim().length === 0
              ? 'recovery_card_print_failed'
              : 'recovery_card_print_refused',
          ));
        }
      });
      child.stdin.on('error', () => undefined);
      child.stdin.end(Buffer.from(pdf));
    }),
  };
}

/** Wie lange `lp` fuer die Uebergabe an den Spooler haben darf (Befund B279). */
export const picoLinuxPrintTimeoutMs = 30_000;

/**
 * Das Ziel aus dem Bericht von `lp`, oder ein Satz, der keinen Ort nennt.
 *
 * Eine CUPS-Auftragskennung ist `<ziel>-<nummer>`, und ein Ziel darf selbst
 * Bindestriche tragen - deshalb endet das Muster an der Zahl. Was sich nicht
 * lesen laesst, wird nicht geraten: dann sagt der Satz, dass das System
 * gewaehlt hat, und nennt kein Ziel (Befund B209).
 */
export function picoLinuxPrintDestination(report: string): string {
  const destination = /request id is (\S+)-\d+/u.exec(report)?.[1];
  return destination === undefined || destination.trim() === ''
    ? 'printer your system chose'
    : `printer ${destination}`;
}

export function picoLinuxRecoveryCardPrintArguments(
  form: 'paper' | 'card_printer',
): string[] {
  return [
    '-t', 'Pico Recovery Card',
    '-o', form === 'paper' ? 'media=A4' : 'media=Custom.85.6x53.98mm',
    ...(form === 'paper' ? ['-o', 'fit-to-page'] : []),
    '-',
  ];
}
