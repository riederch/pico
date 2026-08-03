import { describe, expect, it } from 'vitest';
import { picoLinuxRecoveryCardPrintArguments } from './linux-print.js';

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
});
