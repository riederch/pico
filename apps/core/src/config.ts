import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// The default lives with the workspace that uses it rather than being spelled
// a second time here. The four paths above predate that rule and each state
// their default twice; this one does not add a fifth.
import { defaultPicoDepotFetchIntervalMs } from '@pico/protocol/depot';
import {
  defaultPicoLinkRelayOperator,
  defaultPicoLinkRelaySweepIntervalMs,
} from '@pico/protocol/link-packet';
import { PicoDepotWorkspace } from './depot-workspace.js';
import { PicoSupplierScratch } from './supplier-scratch.js';
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
   * `recovery-anchor/anchor.json` beside the database, which the host
   * excludes from its backups; installations that can mount storage outside
   * the data directory should point this there instead.
   */
  recoveryAnchorPath?: string;
  /**
   * ADR 0143 DP8. Where depot working copies are materialised. Defaults to
   * `depots` beside the database, the idiom the four paths above already use.
   *
   * A deployment binding rather than a Pico setting: it holds third-party code
   * at commits a person accepted, reconstructible from the pins that are
   * already recorded, so an installation with a separate volume for code is
   * free to point it there.
   */
  depotRoot?: string;
  /**
   * ADR 0143 DP8. Where per-attachment supplier scratch areas are created.
   * Defaults to `scratch` beside the database.
   *
   * A workspace rather than a store: absent from `picoDurableStores`, so no
   * ADR 0119 Q5 ceiling, no place in the shred cascade and no backup to
   * exclude. An installation whose suppliers unpack large corpora is free to
   * point this at the volume with room on it.
   */
  supplierScratchRoot?: string;
  /**
   * ADR 0143 DP8. How often the depot sweep runs. Defaults to
   * `defaultPicoDepotFetchIntervalMs`, and floors at
   * `minPicoDepotTaskIntervalMs` - below that a task is a poller and CO4's
   * distinction between answering and sweeping stops meaning anything.
   *
   * The sweep is a repair rather than a poll for commits, so an installation
   * with a depot that matters more, or a link that costs money, is the one
   * placed to change it.
   */
  depotFetchIntervalMs?: number;
  /**
   * ADR 0148 EX1. The relay operator this Home issues its own mailboxes at.
   *
   * A deployment binding: which operator a person uses is theirs to choose,
   * and ADR 0147 RY3 keeps several possible by naming the operator inside
   * every address rather than configuring one globally. This is only the
   * default for addresses *this Home issues*; an address a device hands over
   * carries its own.
   */
  linkRelayOperator?: string;
  /**
   * ADR 0149. Where the operator named above actually answers, and the account
   * credential this Home holds there.
   *
   * Separate from the operator on purpose: ADR 0147 RY3's operator is a
   * hostname people hand each other inside an address, while scheme, port and
   * path are a deployment's. Both absent is a Home with no relay, which is the
   * ordinary state until somebody chooses one.
   */
  linkRelayBaseUrl?: string;
  linkRelayAccountId?: string;
  /** ADR 0149. How often this Home reads its relay mailboxes. */
  linkRelaySweepIntervalMs?: number;
  /** ADR 0049. How often the model job queue is drained, one job a tick. */
  modelJobSweepIntervalMs?: number;
  /**
   * When true, recorded memory content is stored domain_encrypted (ADR 0071).
   *
   * **Absent is not false.** ADR 0104 S3 made this an inheritance source and
   * nothing else, and an inheritance source that cannot say "I have no value"
   * is one that answers for an instance whose option was already removed. The
   * field is therefore present only when the variable is (ADR 0117 X1's
   * construction): what a missing entry means is the boot's question, not the
   * parser's.
   */
  memoryEncryption?: boolean;
  deviceId: string;
  webRootPath?: string;
  wsAllowedOrigins?: string[];
  foundationToken?: string;
  foundationAccessMode?: FoundationAccessMode;
  /**
   * The former name a person actually configured, when they used one. Carried
   * so the boot log can say the old spelling still works (ADR 0128 H5); absent
   * whenever the current name was used.
   */
  foundationAccessModeAlias?: string;
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

/**
 * ADR 0041, renamed under ADR 0128 H5. What stands in front of the Foundation
 * surface - not which product it is.
 *
 * `trusted-proxy` was called `ha-ingress`, and the old name claimed more than
 * the code ever did: traced through, it is simply the one mode that requires
 * neither a loopback host nor a token, because something in front has already
 * authenticated the person. Home Assistant ingress is one such thing; any
 * authenticating reverse proxy is another.
 */
const foundationAccessModes = [
  'loopback-dev',
  'direct-token',
  'trusted-proxy',
] as const;

/**
 * ADR 0128 H5 with ADR 0122. Former names that still resolve.
 *
 * `ha-ingress` is documented for installed instances and may sit in someone's
 * container environment right now. A rename that refused it would turn an
 * update into an outage, so the old spelling keeps working and the boot log
 * says so once. Dropping it is a release decision, not a cleanup.
 */
const formerFoundationAccessModeNames: Readonly<Record<string, FoundationAccessMode>> = {
  'ha-ingress': 'trusted-proxy',
};

export function defaultWebRootPath(): string {
  return fileURLToPath(new URL('../../web', import.meta.url));
}

export function loadConfig(env: Environment = process.env): CoreConfig {
  const databasePath = readNonEmptyString(env, 'PICO_DATABASE_PATH', 'apps/core/data/pico.sqlite');
  const host = readNonEmptyString(env, 'PICO_HOST', '127.0.0.1');
  const port = readPort(env.PICO_PORT, 'PICO_PORT', '3100');
  const foundationToken = readOptionalNonEmptyString(env.PICO_FOUNDATION_TOKEN, 'PICO_FOUNDATION_TOKEN');
  const accessMode = resolveFoundationAccessMode({
    host,
    foundationToken,
    requestedAccessMode: readOptionalNonEmptyString(env.PICO_FOUNDATION_ACCESS_MODE, 'PICO_FOUNDATION_ACCESS_MODE'),
  });
  const linkIntake = readPicoLinkIntakeBinding(env, port, accessMode.mode);

  return {
    host,
    port,
    linkIntake,
    databasePath,
    backupDirectory: readNonEmptyString(env, 'PICO_BACKUP_DIRECTORY', join(dirname(databasePath), 'backups')),
    keyStorePath: readNonEmptyString(env, 'PICO_KEY_STORE_PATH', join(dirname(databasePath), 'keys')),
    homeHostKeyStorePath: readNonEmptyString(env, 'PICO_HOME_HOST_KEY_STORE_PATH', join(dirname(databasePath), 'home-host-keys')),
    recoveryAnchorPath: readNonEmptyString(env, 'PICO_RECOVERY_ANCHOR_PATH', join(dirname(databasePath), 'recovery-anchor', 'anchor.json')),
    depotRoot: readNonEmptyString(env, 'PICO_DEPOT_ROOT', PicoDepotWorkspace.defaultRoot(databasePath)),
    supplierScratchRoot: readNonEmptyString(env, 'PICO_SUPPLIER_SCRATCH_ROOT', PicoSupplierScratch.defaultRoot(databasePath)),
    linkRelayOperator: readNonEmptyString(env, 'PICO_LINK_RELAY_OPERATOR', defaultPicoLinkRelayOperator),
    ...(readOptionalNonEmptyString(env.PICO_LINK_RELAY_BASE_URL, 'PICO_LINK_RELAY_BASE_URL') === undefined
      ? {}
      : { linkRelayBaseUrl: readNonEmptyString(env, 'PICO_LINK_RELAY_BASE_URL', '') }),
    ...(readOptionalNonEmptyString(env.PICO_LINK_RELAY_ACCOUNT_ID, 'PICO_LINK_RELAY_ACCOUNT_ID') === undefined
      ? {}
      : { linkRelayAccountId: readNonEmptyString(env, 'PICO_LINK_RELAY_ACCOUNT_ID', '') }),
    linkRelaySweepIntervalMs: readPositiveInteger(
      env.PICO_LINK_RELAY_SWEEP_INTERVAL_MS,
      'PICO_LINK_RELAY_SWEEP_INTERVAL_MS',
      defaultPicoLinkRelaySweepIntervalMs,
    ),
    depotFetchIntervalMs: readPositiveInteger(
      env.PICO_DEPOT_FETCH_INTERVAL_MS,
      'PICO_DEPOT_FETCH_INTERVAL_MS',
      defaultPicoDepotFetchIntervalMs,
    ),
    ...(env.PICO_MEMORY_ENCRYPTION === undefined || env.PICO_MEMORY_ENCRYPTION.trim() === ''
      ? {}
      : { memoryEncryption: readBooleanFlag(env.PICO_MEMORY_ENCRYPTION, 'PICO_MEMORY_ENCRYPTION') }),
    deviceId: readNonEmptyString(env, 'PICO_DEVICE_ID', 'pico-core'),
    webRootPath: readNonEmptyString(env, 'PICO_WEB_ROOT', defaultWebRootPath()),
    wsAllowedOrigins: readAllowedOrigins(env.PICO_WS_ALLOWED_ORIGINS),
    foundationToken,
    foundationAccessMode: accessMode.mode,
    ...(accessMode.alias === undefined ? {} : { foundationAccessModeAlias: accessMode.alias }),
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
}): { mode: FoundationAccessMode; alias?: string } {
  const requestedAccessMode = options.requestedAccessMode;

  if (requestedAccessMode === undefined) {
    if (isLoopbackHost(options.host)) {
      return { mode: 'loopback-dev' };
    }

    if (options.foundationToken !== undefined) {
      return { mode: 'direct-token' };
    }

    throw new Error(
      'PICO_FOUNDATION_ACCESS_MODE must be set when PICO_HOST is not loopback and PICO_FOUNDATION_TOKEN is not configured.',
    );
  }

  const former = formerFoundationAccessModeNames[requestedAccessMode];
  const mode = former ?? requestedAccessMode;

  if (!isFoundationAccessMode(mode)) {
    throw new Error(
      'PICO_FOUNDATION_ACCESS_MODE must be one of: '
      + `${foundationAccessModes.join(', ')}`
      + ` (also accepted: ${Object.keys(formerFoundationAccessModeNames).join(', ')}).`,
    );
  }

  // The checks below are stated against the current name, so a former spelling
  // reaches exactly the same rules rather than a parallel set that can drift.
  if (mode === 'loopback-dev' && !isLoopbackHost(options.host)) {
    throw new Error('PICO_FOUNDATION_ACCESS_MODE=loopback-dev requires PICO_HOST to be a loopback host.');
  }

  if (mode === 'direct-token' && options.foundationToken === undefined) {
    throw new Error('PICO_FOUNDATION_ACCESS_MODE=direct-token requires PICO_FOUNDATION_TOKEN.');
  }

  return former === undefined ? { mode } : { mode, alias: requestedAccessMode };
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

function readPositiveInteger(
  rawValue: string | undefined,
  name: string,
  defaultValue: number,
): number {
  if (rawValue === undefined) {
    return defaultValue;
  }
  const parsed = Number(rawValue.trim());
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}
