import { existsSync, readFileSync } from 'node:fs';

const DEFAULT_OPTIONS_PATH = '/data/options.json';

type Environment = Record<string, string | undefined>;

interface HomeAssistantAddonOptions {
  pico_foundation_token?: unknown;
}

export function applyHomeAssistantAddonOptions(env: Environment = process.env, optionsPath = DEFAULT_OPTIONS_PATH): void {
  if (!existsSync(optionsPath)) {
    return;
  }

  if (env.PICO_FOUNDATION_ACCESS_MODE === undefined) {
    env.PICO_FOUNDATION_ACCESS_MODE = 'ha-ingress';
  }

  const options = readHomeAssistantAddonOptions(optionsPath);
  const token = readOptionalStringOption(options, 'pico_foundation_token');

  if (token !== undefined && token.trim() !== '' && env.PICO_FOUNDATION_TOKEN === undefined) {
    env.PICO_FOUNDATION_TOKEN = token;
  }
}

function readHomeAssistantAddonOptions(optionsPath: string): HomeAssistantAddonOptions {
  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(optionsPath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read Home Assistant add-on options at ${optionsPath}: ${formatUnknownError(error)}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`Home Assistant add-on options at ${optionsPath} must be a JSON object.`);
  }

  return parsed;
}

function readOptionalStringOption(options: HomeAssistantAddonOptions, name: keyof HomeAssistantAddonOptions): string | undefined {
  const value = options[name];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`Home Assistant add-on option ${String(name)} must be a string when provided.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
