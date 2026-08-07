import { existsSync, readFileSync } from 'node:fs';
import type { PicoHostAdapter, PicoHostEnvironment } from './host-adapter.js';

/**
 * ADR 0128 H5. Home Assistant as one host adapter.
 *
 * This is the only file in `apps/core` that knows what Home Assistant is, and
 * that is deliberate: ADR 0128 separates the host Pico runs on from the
 * connected house it might one day talk to, and the host half is packaging.
 * Nothing downstream reads a host name.
 *
 * **Presence of the options file is the detection.** Home Assistant mounts
 * `/data/options.json` for an installed App; a plain container has no such
 * file. That is a fact about the running deployment rather than a claim
 * something made about itself, which is why it is the signal.
 *
 * The two options it bridges are ADR 0104 debt and are recorded as such:
 * `pico_foundation_token` is the transitional Foundation hardening ADR
 * 0038/0041 already call it, and `memory_encryption` is a person's privacy
 * decision living in host configuration until a settings surface exists. This
 * adapter is where they are carried, not where they are justified.
 */
/**
 * Where Home Assistant mounts an installed App's options.
 *
 * Exported rather than left as a default parameter so the one link a test
 * cannot otherwise reach is pinned: `index.ts` constructs this adapter with no
 * argument, and every other test injects a temporary path. Without this
 * constant the path itself would be the only part of the chain nothing checks.
 */
export const picoHomeAssistantOptionsPath = '/data/options.json';

const DEFAULT_OPTIONS_PATH = picoHomeAssistantOptionsPath;

interface PicoHomeAssistantAppOptions {
  pico_foundation_token?: unknown;
  memory_encryption?: unknown;
}

export function createPicoHomeAssistantHostAdapter(
  optionsPath = DEFAULT_OPTIONS_PATH,
): PicoHostAdapter {
  return {
    hostName: 'home-assistant',
    detect: () => existsSync(optionsPath),
    applyDefaults: (env) => {
      applyPicoHomeAssistantAppOptions(env, optionsPath);
    },
  };
}

export function applyPicoHomeAssistantAppOptions(
  env: PicoHostEnvironment,
  optionsPath = DEFAULT_OPTIONS_PATH,
): void {
  if (!existsSync(optionsPath)) {
    return;
  }

  if (env.PICO_FOUNDATION_ACCESS_MODE === undefined) {
    // Ingress terminates in front of the Foundation surface and authenticates
    // the person, which is what `trusted-proxy` names. The mode says what
    // stands in front, not which product it is (ADR 0128).
    env.PICO_FOUNDATION_ACCESS_MODE = 'trusted-proxy';
  }

  const options = readPicoHomeAssistantAppOptions(optionsPath);
  const token = readOptionalStringOption(options, 'pico_foundation_token');

  if (token !== undefined && token.trim() !== '' && env.PICO_FOUNDATION_TOKEN === undefined) {
    env.PICO_FOUNDATION_TOKEN = token;
  }

  const memoryEncryption = readOptionalBooleanOption(options, 'memory_encryption');

  if (memoryEncryption === true && env.PICO_MEMORY_ENCRYPTION === undefined) {
    env.PICO_MEMORY_ENCRYPTION = 'true';
  }
}

function readPicoHomeAssistantAppOptions(optionsPath: string): PicoHomeAssistantAppOptions {
  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(optionsPath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read Home Assistant App options at ${optionsPath}: ${formatUnknownError(error)}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`Home Assistant App options at ${optionsPath} must be a JSON object.`);
  }

  return parsed;
}

function readOptionalStringOption(
  options: PicoHomeAssistantAppOptions,
  name: keyof PicoHomeAssistantAppOptions,
): string | undefined {
  const value = options[name];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`Home Assistant App option ${String(name)} must be a string when provided.`);
  }

  return value;
}

function readOptionalBooleanOption(
  options: PicoHomeAssistantAppOptions,
  name: keyof PicoHomeAssistantAppOptions,
): boolean | undefined {
  const value = options[name];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new Error(`Home Assistant App option ${String(name)} must be a boolean when provided.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
