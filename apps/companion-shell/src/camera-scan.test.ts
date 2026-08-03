import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { picoRecoveryCardV2ScanPrefix } from '@pico/protocol';
import { describe, expect, it } from 'vitest';
import {
  picoCompanionCameraScanArguments,
  scanPicoRecoveryCardWithCamera,
  type PicoCompanionCameraScanSpawn,
} from './camera-scan.js';

const transport = `${picoRecoveryCardV2ScanPrefix}AAAAFXBpY28`;

describe('ADR 0112 S3 camera scan path', () => {
  it('returns the transport line and kills the decoder immediately', async () => {
    const fake = fakeSpawn();
    const scanned = scanPicoRecoveryCardWithCamera({
      spawn: fake.spawn,
      device: '/dev/video2',
    });
    fake.emitStdout(`${transport}\n`);
    expect(await scanned).toBe(transport);
    expect(fake.signals).toEqual(['SIGTERM']);
    expect(fake.invocations).toEqual([{
      command: 'zbarcam',
      args: picoCompanionCameraScanArguments('/dev/video2'),
    }]);
  });

  it('ignores decoder chatter and CRLF framing', async () => {
    const fake = fakeSpawn();
    const scanned = scanPicoRecoveryCardWithCamera({ spawn: fake.spawn });
    fake.emitStdout('scanning...\nWIFI:S:home;\r\n');
    fake.emitStdout(`${transport}\r\n`);
    expect(await scanned).toBe(transport);
  });

  it('reports an empty scan rather than returning a partial read', async () => {
    const fake = fakeSpawn();
    const scanned = scanPicoRecoveryCardWithCamera({ spawn: fake.spawn });
    fake.emitStdout('https://example.invalid\n');
    fake.emitClose();
    await expect(scanned).rejects.toThrow('camera_scan_no_card');
  });

  it('bounds decoder output, timeouts and cancellation', async () => {
    const large = fakeSpawn();
    const bounded = scanPicoRecoveryCardWithCamera({ spawn: large.spawn });
    large.emitStdout('x'.repeat(64 * 1_024 + 1));
    await expect(bounded).rejects.toThrow('camera_scan_output_too_large');
    expect(large.signals).toEqual(['SIGTERM']);

    const slow = fakeSpawn();
    await expect(scanPicoRecoveryCardWithCamera({
      spawn: slow.spawn,
      timeoutMs: 1,
    })).rejects.toThrow('camera_scan_timeout');

    const cancelled = fakeSpawn();
    const controller = new AbortController();
    const pending = scanPicoRecoveryCardWithCamera({
      spawn: cancelled.spawn,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow('camera_scan_cancelled');
    expect(cancelled.signals).toEqual(['SIGTERM']);
  });

  it('reports a missing decoder as unavailable', async () => {
    const fake = fakeSpawn();
    const scanned = scanPicoRecoveryCardWithCamera({ spawn: fake.spawn });
    fake.emitError();
    await expect(scanned).rejects.toThrow('camera_scan_unavailable');
  });
});

function fakeSpawn(): {
  spawn: PicoCompanionCameraScanSpawn;
  emitStdout: (chunk: string) => void;
  emitClose: () => void;
  emitError: () => void;
  signals: string[];
  invocations: Array<{ command: string; args: readonly string[] }>;
} {
  const signals: string[] = [];
  const invocations: Array<{ command: string; args: readonly string[] }> = [];
  const stdout = new Readable({ read: () => undefined });
  const child = Object.assign(new EventEmitter(), {
    stdout,
    kill: (signal: string) => {
      signals.push(signal);
      return true;
    },
  });
  return {
    spawn: (command, args) => {
      invocations.push({ command, args });
      return child as unknown as ReturnType<PicoCompanionCameraScanSpawn>;
    },
    emitStdout: (chunk: string) => stdout.push(chunk),
    emitClose: () => child.emit('close', 0),
    emitError: () => child.emit('error', new Error('ENOENT')),
    signals,
    invocations,
  };
}
