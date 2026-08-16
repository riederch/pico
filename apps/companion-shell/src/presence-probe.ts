import { existsSync, readdirSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { PicoCompanionPresenceProbe } from '@pico/companion/presence';

/**
 * ADR 0126 P2 on Linux. The two affordances this shell cannot know without
 * looking.
 *
 * **Looked up rather than run.** A probe that spawned `zbarcam` to find out
 * whether it exists would open a camera to answer a question about a
 * filesystem, and one that spawned `lp` would put a job in a queue. Both would
 * also have to happen on every refresh. A `PATH` walk and a directory listing
 * cost nothing and cannot have a side effect on the thing they are asking
 * about, which is the property a fact-gathering probe needs.
 */

export function createLinuxPicoCompanionPresenceProbe(
  environment: NodeJS.ProcessEnv = process.env,
  deviceRoot = '/dev',
): PicoCompanionPresenceProbe {
  return {
    canScanWithCamera: () =>
      // ADR 0112 S3 needs both halves: the decoder that reads the QR block and
      // a device for it to read from. Either alone scans nothing, and
      // declaring the affordance on either alone would be declaring a fact
      // that fails at the moment somebody needs it.
      onPath('zbarcam', environment) && hasVideoDevice(deviceRoot),
    canPrint: () => onPath('lp', environment),
  };
}

function onPath(command: string, environment: NodeJS.ProcessEnv): boolean {
  const path = environment.PATH;
  if (typeof path !== 'string' || path === '') {
    return false;
  }
  return path
    .split(delimiter)
    .filter((entry) => entry !== '')
    .some((entry) => existsSync(join(entry, command)));
}

function hasVideoDevice(deviceRoot: string): boolean {
  try {
    return readdirSync(deviceRoot).some((entry) => /^video\d+$/u.test(entry));
  } catch {
    // No `/dev` to read is not a camera. A throw here would make a probe about
    // hardware into a reason the presence never announces at all.
    return false;
  }
}
