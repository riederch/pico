import { spawn as nodeSpawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { picoRecoveryCardScanPrefix } from '@pico/protocol';

/**
 * ADR 0112 S3 camera scan path.
 *
 * The decoded QR result is the Recovery Card itself - seed material included -
 * so it must never exist inside a renderer. Electron's `getUserMedia` lives in
 * the renderer by construction, so the camera is driven by an external decoder
 * process whose stdout is read in the Electron main process and nowhere else.
 * That also keeps the ADR 0113 C3 tray budget intact: no video pipeline, no
 * decoder library and no extra Chromium surface are loaded into this app.
 *
 * The decoder is scanned for the first line that looks like a v2 transport;
 * everything else it emits is discarded rather than interpreted, and the
 * process is killed the moment a candidate appears.
 */
export const picoCompanionCameraScanCommand = 'zbarcam' as const;

/** Raw payloads only, one result, no prefix chatter, no beep-on-scan noise. */
export function picoCompanionCameraScanArguments(device: string): string[] {
  return ['--raw', '--oneshot', '--quiet', '--nodisplay', device];
}

/**
 * Exactly the one `spawn` shape this module uses: stdin and stderr are closed,
 * only stdout is read. Narrowing it here keeps the injected test double honest
 * instead of casting away the real overload set.
 */
export type PicoCompanionCameraScanSpawn = (
  command: string,
  args: readonly string[],
  options: { stdio: ['ignore', 'pipe', 'ignore'] },
) => ChildProcessByStdio<null, Readable, null>;

export interface PicoCompanionCameraScanOptions {
  device?: string;
  timeoutMs?: number;
  command?: string;
  spawn?: PicoCompanionCameraScanSpawn;
  signal?: AbortSignal;
}

/**
 * Resolves with the exact transport string the card carries, with the
 * decoder's own line framing removed and nothing else altered - validation
 * belongs to the protocol parser, which is intolerant on purpose.
 */
export async function scanPicoRecoveryCardWithCamera(
  options: PicoCompanionCameraScanOptions = {},
): Promise<string> {
  const spawnProcess = options.spawn ?? nodeSpawn;
  const command = options.command ?? picoCompanionCameraScanCommand;
  const device = options.device ?? '/dev/video0';
  const timeoutMs = options.timeoutMs ?? 60_000;

  return await new Promise<string>((resolvePromise, rejectPromise) => {
    const child = spawnProcess(
      command,
      picoCompanionCameraScanArguments(device),
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let buffered = '';
    let settled = false;

    const finish = (result: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      // Dropping the buffer is best-effort scope reduction, not erasure: V8
      // strings cannot be wiped (ADR 0123).
      buffered = '';
      resolvePromise(result);
    };
    const fail = (reason: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      buffered = '';
      rejectPromise(new Error(reason));
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      child.stdout.removeAllListeners('data');
      child.kill('SIGTERM');
    };
    const onAbort = (): void => fail('camera_scan_cancelled');

    const timer = setTimeout(() => fail('camera_scan_timeout'), timeoutMs);
    timer.unref();
    options.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffered += chunk;
      if (buffered.length > maxBufferedChars) {
        fail('camera_scan_output_too_large');
        return;
      }
      const candidate = firstTransportLine(buffered);
      if (candidate !== null) {
        finish(candidate);
      }
    });
    child.once('error', () => fail('camera_scan_unavailable'));
    child.once('close', () => {
      // A candidate may arrive in the same tick as the exit; only a genuinely
      // empty result is a failure.
      const candidate = firstTransportLine(buffered);
      if (candidate === null) {
        fail('camera_scan_no_card');
      } else {
        finish(candidate);
      }
    });
  });
}

/**
 * Generously sized against a v2 card, tight enough that a decoder pointed at
 * something else cannot stream unbounded text into this process.
 */
const maxBufferedChars = 64 * 1_024;

function firstTransportLine(buffered: string): string | null {
  for (const line of buffered.split('\n')) {
    const candidate = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (candidate.startsWith(picoRecoveryCardScanPrefix)) {
      return candidate;
    }
  }
  return null;
}
