import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CoreConfig {
  host: string;
  port: number;
  databasePath: string;
  backupDirectory?: string;
  deviceId: string;
  webRootPath?: string;
  wsAllowedOrigins?: string[];
  foundationToken?: string;
}

type Environment = Record<string, string | undefined>;

export function defaultWebRootPath(): string {
  return fileURLToPath(new URL('../../web', import.meta.url));
}

export function loadConfig(env: Environment = process.env): CoreConfig {
  const databasePath = readNonEmptyString(env, 'PICO_DATABASE_PATH', 'apps/core/data/pico.sqlite');

  return {
    host: readNonEmptyString(env, 'PICO_HOST', '0.0.0.0'),
    port: readPort(env.PICO_PORT),
    databasePath,
    backupDirectory: readNonEmptyString(env, 'PICO_BACKUP_DIRECTORY', join(dirname(databasePath), 'backups')),
    deviceId: readNonEmptyString(env, 'PICO_DEVICE_ID', 'pico-core'),
    webRootPath: readNonEmptyString(env, 'PICO_WEB_ROOT', defaultWebRootPath()),
    wsAllowedOrigins: readAllowedOrigins(env.PICO_WS_ALLOWED_ORIGINS),
    foundationToken: readOptionalNonEmptyString(env.PICO_FOUNDATION_TOKEN, 'PICO_FOUNDATION_TOKEN'),
  };
}

function readPort(rawPort: string | undefined): number {
  const port = rawPort ?? '3100';

  if (!/^[1-9]\d*$/.test(port)) {
    throw new Error('PICO_PORT must be an integer from 1 to 65535.');
  }

  const parsedPort = Number.parseInt(port, 10);

  if (parsedPort > 65_535) {
    throw new Error('PICO_PORT must be an integer from 1 to 65535.');
  }

  return parsedPort;
}

function readNonEmptyString(env: Environment, name: string, defaultValue: string): string {
  const value = env[name] ?? defaultValue;

  if (!value.trim()) {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value;
}

function readOptionalNonEmptyString(value: string | undefined, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!value.trim()) {
    throw new Error(`${name} must be a non-empty string when provided.`);
  }

  return value;
}

function readAllowedOrigins(rawOrigins: string | undefined): string[] {
  if (rawOrigins === undefined || rawOrigins.trim() === '') {
    return [];
  }

  return rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '')
    .map(normalizeHttpOrigin);
}

function normalizeHttpOrigin(rawOrigin: string): string {
  let url: URL;

  try {
    url = new URL(rawOrigin);
  } catch {
    throw new Error('PICO_WS_ALLOWED_ORIGINS must contain comma-separated http(s) origins.');
  }

  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error('PICO_WS_ALLOWED_ORIGINS must contain comma-separated http(s) origins.');
  }

  return url.origin;
}
