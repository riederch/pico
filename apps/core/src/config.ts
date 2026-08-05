import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DomainReadership } from './domain-readership.js';
import type { PicoRequestQuotaOptions } from './request-quota.js';
import type {
  PicoIdentityReaderKeyFreshnessCheckpointSource,
} from './reader-key-freshness.js';

export interface CoreConfig {
  host: string;
  port: number;
  /**
   * Optional restricted Pico Link listener (ADR 0107 D4). This is a deployment
   * binding, not a Pico setting: when present, it exposes exactly
   * `POST /api/home/link` on a second listener while the Foundation listener
   * remains local.
   */
  linkIntake?: PicoLinkIntakeBinding;
  databasePath: string;
  backupDirectory?: string;
  keyStorePath?: string;
  homeHostKeyStorePath?: string;
  /**
   * ADR 0110 R6 consumption anchor. A deployment binding, not a Pico setting:
   * it must live outside every restorable Foundation snapshot. Defaults to
   * `recovery-anchor/anchor.json` beside the database, which the add-on
   * excludes from backups; installations that can mount storage outside the
   * data directory should point this there instead.
   */
  recoveryAnchorPath?: string;
  /** When true, recorded memory content is stored domain_encrypted (ADR 0071). Default false (plaintext foundation data). */
  memoryEncryption?: boolean;
  deviceId: string;
  webRootPath?: string;
  wsAllowedOrigins?: string[];
  foundationToken?: string;
  foundationAccessMode?: FoundationAccessMode;
  /**
   * ADR 0119 Q4. Aggregate bounds on the Foundation listener, kept separate
   * from the Link intake's own so neither surface can starve the other.
   */
  foundationMaxConnections?: number;
  foundationMaxInFlight?: number;
  /** ADR 0119 Q4. Relationship-keyed send budgets for the Link intake. */
  linkRequestQuota?: PicoRequestQuotaOptions;
  /**
   * Where the process log goes. Defaults to the standard destination. The
   * operator bootstrap code is surfaced only on this log (ADR 0076), so tests
   * read it the same way an operator does instead of through a back door.
   */
  logDestination?: NodeJS.WritableStream;
  /**
   * Domain readership evaluation for the `domain-content` class (ADR 0077).
   * By default, unclaimed instances use the sole-resident policy and claimed
   * Homes use membership-plus-grant readership (ADR 0082). Tests may inject a
   * policy to prove the seam gates reads independently of the operator role.
   */
  readership?: DomainReadership;
  /**
   * Registry/Sync transport used only for reader-key selection immediately
   * before share-envelope preparation/finalization. Core always wraps it in
   * ADR 0085 signature, binding and anti-rollback verification, so callers
   * cannot inject a bare `current` answer. There is deliberately no
   * environment-backed shortcut; absence fails closed.
   */
  readerKeyFreshnessCheckpointSource?: PicoIdentityReaderKeyFreshnessCheckpointSource;
}

export interface PicoLinkIntakeBinding {
  host: string;
  port: number;
  /** ADR 0119 Q4. Deployment properties; conservative defaults apply. */
  maxConnections?: number;
  maxInFlight?: number;
}

type Environment = Record<string, string | undefined>;

export type FoundationAccessMode = typeof foundationAccessModes[number];

const foundationAccessModes = [
  'loopback-dev',
  'direct-token',
  'ha-ingress',
] as const;

export function defaultWebRootPath(): string {
  return fileURLToPath(new URL('../../web', import.meta.url));
}

export function loadConfig(env: Environment = process.env): CoreConfig {
  const databasePath = readNonEmptyString(env, 'PICO_DATABASE_PATH', 'apps/core/data/pico.sqlite');
  const host = readNonEmptyString(env, 'PICO_HOST', '127.0.0.1');
  const port = readPort(env.PICO_PORT, 'PICO_PORT', '3100');
  const foundationToken = readOptionalNonEmptyString(env.PICO_FOUNDATION_TOKEN, 'PICO_FOUNDATION_TOKEN');
  const foundationAccessMode = resolveFoundationAccessMode({
    host,
    foundationToken,
    requestedAccessMode: readOptionalNonEmptyString(env.PICO_FOUNDATION_ACCESS_MODE, 'PICO_FOUNDATION_ACCESS_MODE'),
  });
  const linkIntake = readPicoLinkIntakeBinding(env, port, foundationAccessMode);

  return {
    host,
    port,
    linkIntake,
    databasePath,
    backupDirectory: readNonEmptyString(env, 'PICO_BACKUP_DIRECTORY', join(dirname(databasePath), 'backups')),
    keyStorePath: readNonEmptyString(env, 'PICO_KEY_STORE_PATH', join(dirname(databasePath), 'keys')),
    homeHostKeyStorePath: readNonEmptyString(env, 'PICO_HOME_HOST_KEY_STORE_PATH', join(dirname(databasePath), 'home-host-keys')),
    recoveryAnchorPath: readNonEmptyString(env, 'PICO_RECOVERY_ANCHOR_PATH', join(dirname(databasePath), 'recovery-anchor', 'anchor.json')),
    memoryEncryption: readBooleanFlag(env.PICO_MEMORY_ENCRYPTION, 'PICO_MEMORY_ENCRYPTION'),
    deviceId: readNonEmptyString(env, 'PICO_DEVICE_ID', 'pico-core'),
    webRootPath: readNonEmptyString(env, 'PICO_WEB_ROOT', defaultWebRootPath()),
    wsAllowedOrigins: readAllowedOrigins(env.PICO_WS_ALLOWED_ORIGINS),
    foundationToken,
    foundationAccessMode,
  };
}

function readPort(rawPort: string | undefined, name: string, defaultValue?: string): number {
  const port = rawPort ?? defaultValue;
  if (port === undefined || !/^[1-9]\d*$/.test(port)) {
    throw new Error(`${name} must be an integer from 1 to 65535.`);
  }

  const parsedPort = Number.parseInt(port, 10);

  if (parsedPort > 65_535) {
    throw new Error(`${name} must be an integer from 1 to 65535.`);
  }

  return parsedPort;
}

function readPicoLinkIntakeBinding(
  env: Environment,
  foundationPort: number,
  foundationAccessMode: FoundationAccessMode,
): PicoLinkIntakeBinding | undefined {
  const rawHost = env.PICO_LINK_INTAKE_HOST;
  const rawPort = env.PICO_LINK_INTAKE_PORT;

  if (rawHost === undefined && rawPort === undefined) {
    return undefined;
  }
  if (rawHost === undefined || rawPort === undefined) {
    throw new Error('PICO_LINK_INTAKE_HOST and PICO_LINK_INTAKE_PORT must be provided together.');
  }

  const host = readOptionalNonEmptyString(rawHost, 'PICO_LINK_INTAKE_HOST');
  const port = readPort(rawPort, 'PICO_LINK_INTAKE_PORT');
  if (host === undefined) {
    throw new Error('PICO_LINK_INTAKE_HOST must be a non-empty string when provided.');
  }
  if (port === foundationPort) {
    throw new Error('PICO_LINK_INTAKE_PORT must differ from PICO_PORT.');
  }
  if (foundationAccessMode === 'direct-token') {
    throw new Error(
      'PICO_LINK_INTAKE_HOST/PICO_LINK_INTAKE_PORT cannot be combined with '
      + 'PICO_FOUNDATION_ACCESS_MODE=direct-token; keep the Foundation listener local.',
    );
  }

  return { host, port };
}

function readNonEmptyString(env: Environment, name: string, defaultValue: string): string {
  const value = env[name] ?? defaultValue;

  if (!value.trim()) {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value;
}

function readBooleanFlag(value: string | undefined, name: string): boolean {
  if (value === undefined || value.trim() === '') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  throw new Error(`${name} must be one of: true, false, 1, 0.`);
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

function resolveFoundationAccessMode(options: {
  host: string;
  foundationToken?: string;
  requestedAccessMode?: string;
}): FoundationAccessMode {
  const requestedAccessMode = options.requestedAccessMode;

  if (requestedAccessMode === undefined) {
    if (isLoopbackHost(options.host)) {
      return 'loopback-dev';
    }

    if (options.foundationToken !== undefined) {
      return 'direct-token';
    }

    throw new Error(
      'PICO_FOUNDATION_ACCESS_MODE must be set when PICO_HOST is not loopback and PICO_FOUNDATION_TOKEN is not configured.',
    );
  }

  if (!isFoundationAccessMode(requestedAccessMode)) {
    throw new Error('PICO_FOUNDATION_ACCESS_MODE must be one of: loopback-dev, direct-token, ha-ingress.');
  }

  if (requestedAccessMode === 'loopback-dev' && !isLoopbackHost(options.host)) {
    throw new Error('PICO_FOUNDATION_ACCESS_MODE=loopback-dev requires PICO_HOST to be a loopback host.');
  }

  if (requestedAccessMode === 'direct-token' && options.foundationToken === undefined) {
    throw new Error('PICO_FOUNDATION_ACCESS_MODE=direct-token requires PICO_FOUNDATION_TOKEN.');
  }

  return requestedAccessMode;
}

function isFoundationAccessMode(value: string): value is FoundationAccessMode {
  return foundationAccessModes.includes(value as FoundationAccessMode);
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();

  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized.startsWith('127.')
    || normalized === '::1'
    || normalized === '[::1]';
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
