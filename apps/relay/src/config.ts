import { picoLinkOperatorPattern } from '@pico/protocol/link-packet';

/**
 * ADR 0153 PK2. What a relay needs to be told before it can be a deliverable
 * rather than a library.
 *
 * **Nothing here has a default that would be a decision.** The operator name
 * is the hostname senders resolve to reach this machine (ADR 0147 RY3), and a
 * relay that guessed it would hand out addresses pointing somewhere else. So
 * an unset operator is a refusal to start, not a fallback: a relay answering
 * as the wrong operator refuses every packet delivered to it and looks like a
 * network fault while being a configuration one.
 *
 * The ports and the database path do have defaults, because being wrong about
 * them is visible immediately and costs nothing but a restart.
 */

/** The public surface. Five routes, and nothing that says so (ADR 0149). */
export const defaultPicoRelayPort = 3200;

/**
 * ADR 0153 PK3. The health signal, on its own port and on loopback.
 *
 * Separate because ADR 0149 made an unknown route and a wrong method answer
 * identically on the public port, so that the surface carries no map of
 * itself. A `GET /health` there would be the one request that answers
 * differently, and that difference is a map with one entry - "a Pico relay
 * lives here".
 *
 * Loopback by default because the reader is the container's own health check.
 * An operator who terminates health checks elsewhere sets the host; that is a
 * deployment they chose, rather than one they got.
 */
export const defaultPicoRelayHealthPort = 3201;
export const defaultPicoRelayHealthHost = '127.0.0.1';

/**
 * ADR 0154 RO1/RO7. The administration surface, on its own port and closed.
 *
 * Loopback by default for the same reason the health port is: an operator who
 * wants to administer this relay from their own device says so and arranges a
 * transport. Nobody gets a remote administration port by installing.
 */
export const defaultPicoRelayOperatorPort = 3202;
export const defaultPicoRelayOperatorHost = '127.0.0.1';

export interface PicoRelayConfig {
  host: string;
  port: number;
  healthHost: string;
  healthPort: number;
  operatorHost: string;
  operatorPort: number;
  databasePath: string;
  operator: string;
  maxConnections?: number;
}

export function loadPicoRelayConfig(
  env: NodeJS.ProcessEnv = process.env,
): PicoRelayConfig {
  const operator = (env.PICO_RELAY_OPERATOR ?? '').trim();
  if (operator === '') {
    throw new Error(
      'PICO_RELAY_OPERATOR is required: it is the hostname senders resolve to '
      + 'reach this relay, and a guessed one would issue addresses that point '
      + 'elsewhere.',
    );
  }
  if (!picoLinkOperatorPattern.test(operator)) {
    throw new Error(`PICO_RELAY_OPERATOR is not a valid operator hostname: ${operator}`);
  }

  const config: PicoRelayConfig = {
    host: (env.PICO_RELAY_HOST ?? '0.0.0.0').trim(),
    port: readPort(env.PICO_RELAY_PORT, 'PICO_RELAY_PORT', defaultPicoRelayPort),
    healthHost: (env.PICO_RELAY_HEALTH_HOST ?? defaultPicoRelayHealthHost).trim(),
    healthPort: readPort(
      env.PICO_RELAY_HEALTH_PORT,
      'PICO_RELAY_HEALTH_PORT',
      defaultPicoRelayHealthPort,
    ),
    operatorHost: (env.PICO_RELAY_OPERATOR_HOST ?? defaultPicoRelayOperatorHost).trim(),
    operatorPort: readPort(
      env.PICO_RELAY_OPERATOR_PORT,
      'PICO_RELAY_OPERATOR_PORT',
      defaultPicoRelayOperatorPort,
    ),
    databasePath: (env.PICO_RELAY_DATABASE_PATH ?? '/data/relay.sqlite').trim(),
    operator,
  };

  // The whole point of PK3 and RO1 is that these are three listeners. Sharing
  // a port would put a route back on the public surface through configuration
  // rather than through code, which is worse - it would pass every test.
  if (config.port === config.healthPort) {
    throw new Error('PICO_RELAY_HEALTH_PORT must differ from PICO_RELAY_PORT');
  }
  if (config.port === config.operatorPort) {
    throw new Error('PICO_RELAY_OPERATOR_PORT must differ from PICO_RELAY_PORT');
  }
  if (config.healthPort === config.operatorPort) {
    throw new Error('PICO_RELAY_OPERATOR_PORT must differ from PICO_RELAY_HEALTH_PORT');
  }

  const maxConnections = env.PICO_RELAY_MAX_CONNECTIONS;
  if (maxConnections !== undefined && maxConnections.trim() !== '') {
    const parsed = Number(maxConnections);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`PICO_RELAY_MAX_CONNECTIONS must be a positive integer, got ${maxConnections}`);
    }
    config.maxConnections = parsed;
  }

  return Object.freeze(config);
}

function readPort(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  // Port 0 is excluded on purpose: it means "any free port", which is right
  // for a test and never right for a machine other machines have to find.
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`${name} must be a port number between 1 and 65535, got ${value}`);
  }
  return parsed;
}
