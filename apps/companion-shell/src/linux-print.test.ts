import { describe, expect, it } from 'vitest';
import {
  picoLinuxPrintDestination,
  picoLinuxRecoveryCardPrintArguments,
} from './linux-print.js';

describe('Linux Recovery Card direct-print boundary', () => {
  it('spools both forms through stdin without a companion-owned path', () => {
    expect(picoLinuxRecoveryCardPrintArguments('paper')).toEqual([
      '-t', 'Pico Recovery Card',
      '-o', 'media=A4',
      '-o', 'fit-to-page',
      '-',
    ]);
    expect(picoLinuxRecoveryCardPrintArguments('card_printer')).toEqual([
      '-t', 'Pico Recovery Card',
      '-o', 'media=Custom.85.6x53.98mm',
      '-',
    ]);
  });

  /**
   * Befund B209. Der Satz ueber die Wiederherstellungskarte nennt keinen Ort,
   * an dem niemand nachgesehen hat.
   *
   * Wohin die Karte geht, entscheidet die geerbte Umgebung - `PRINTER`,
   * `LPDEST`, `CUPS_SERVER`. Vorher gab dieser Weg `'default printer'` als
   * feste Zeichenkette zurueck, waehrend `lp`s eigener Bericht verworfen
   * wurde. Jetzt wird er gelesen, und was sich nicht lesen laesst, wird nicht
   * geraten.
   */
  it('nennt das Ziel aus dem Bericht und raet nichts, wenn es fehlt', () => {
    expect(picoLinuxPrintDestination('request id is Buero-Laser-42 (1 file(s))'))
      .toBe('printer Buero-Laser');
    expect(picoLinuxPrintDestination('request id is Flur-7 (1 file(s))'))
      .toBe('printer Flur');
    // Kein Bericht, kein Ort: die Person erfaehrt, dass ihr System gewaehlt
    // hat, und nicht einen Namen, den dieser Weg sich ausgedacht haette.
    expect(picoLinuxPrintDestination('')).toBe('printer your system chose');
    expect(picoLinuxPrintDestination('lp: irgendetwas anderes'))
      .toBe('printer your system chose');
  });
});
