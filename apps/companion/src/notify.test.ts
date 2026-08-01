import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createLinuxNotifySendAdapter,
  renderPicoCompanionPendingRecoveryAlarm,
} from './notify.js';
import type { PicoHomeDeviceRecoveryPendingView } from '@pico/protocol';
import type { PicoCompanionPendingRecoveryAlarm } from './alarm-carrier.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const identityFingerprintHex = `ab${'99'.repeat(30)}cd`;

function alarm(): PicoCompanionPendingRecoveryAlarm {
  return { picoIdentityFingerprintHex: identityFingerprintHex, pending: pendingView() };
}

function pendingView(): PicoHomeDeviceRecoveryPendingView {
  return {
    recoveryId: 'recovery_notify_0001',
    claimDigestHex: 'aa'.repeat(32),
    targetDelegationId: 'delegation_recovery_target',
    targetDeviceSigningKeyFingerprintHex: `bb${'11'.repeat(30)}cc`,
    targetDeviceKeyAgreementKeyFingerprintHex: 'cc'.repeat(32),
    acceptedAt: '2026-07-31T10:00:00.000Z',
    effectiveAt: '2026-08-02T10:00:00.000Z',
    completionExpiresAt: '2026-08-09T10:00:00.000Z',
  };
}

/** A fake notify-send that records its argv - the adapter test is a real spawn. */
function fakeNotifySend(behavior: 'record' | 'fail'): { command: string; argvFile: string } {
  const directory = mkdtempSync('/tmp/pico-companion-notify-');
  temporaryDirectories.push(directory);
  const argvFile = join(directory, 'argv.json');
  const command = join(directory, 'notify-send');
  writeFileSync(command, [
    '#!/usr/bin/env node',
    `require('node:fs').writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(process.argv.slice(2)));`,
    behavior === 'fail' ? 'process.exit(3);' : 'process.exit(0);',
    '',
  ].join('\n'));
  chmodSync(command, 0o700);
  return { command, argvFile };
}

describe('Linux notify-send alarm adapter (ADR 0113 C1)', () => {
  it('renders the loud alarm statement from the signed pending view', () => {
    const { title, body } = renderPicoCompanionPendingRecoveryAlarm(alarm());
    expect(title).toContain('recovery pending');
    // ADR 0112 pins "which identity" as part of the statement.
    expect(body).toContain('ab999999…999999cd');
    expect(body).toContain('bb111111…111111cc');
    expect(body).toContain('2026-08-02T10:00:00.000Z');
    expect(body).toContain('every other device is revoked');
    expect(body).toContain('veto');
    expect(body).toContain('recovery_notify_0001');
  });

  it('spawns notify-send with critical urgency, icon and the rendered text', async () => {
    const fake = fakeNotifySend('record');
    const adapter = createLinuxNotifySendAdapter({ command: fake.command });
    await adapter.notifyPendingRecovery(alarm());

    const argv = JSON.parse(readFileSync(fake.argvFile, 'utf8')) as string[];
    expect(argv[0]).toBe('--urgency=critical');
    expect(argv[1]).toBe('--app-name=Pico');
    expect(argv[2]).toBe('--icon=dialog-warning');
    expect(argv[3]).toContain('recovery pending');
    expect(argv[4]).toContain('recovery_notify_0001');
  });

  it('surfaces a failing notifier as an error the carrier can count', async () => {
    const fake = fakeNotifySend('fail');
    const adapter = createLinuxNotifySendAdapter({ command: fake.command });
    await expect(adapter.notifyPendingRecovery(alarm()))
      .rejects.toThrow('notify_send_failed');
  });
});
