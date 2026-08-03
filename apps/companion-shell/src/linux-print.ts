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
      const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'] });
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
          resolve({ destination: 'default printer' });
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
