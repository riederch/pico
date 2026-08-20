import { existsSync, readFileSync } from 'node:fs';

/**
 * ADR 0155 HR2. The one file in `apps/relay` that knows what Home Assistant is.
 *
 * A relay reads its deployment from the environment (`config.ts`), and under a
 * Supervisor there is no environment to read: Home Assistant hands an installed
 * add-on a JSON file and nothing else. Without this bridge the add-on would
 * install, start, and refuse every packet with no way for anybody to tell it
 * what it is - which is a deliverable that exists everywhere except where
 * somebody can run it, the exact failure ADR 0153 PK2 was written about.
 *
 * **Presence of the options file is the detection**, the same signal
 * `apps/core/src/host-adapter-home-assistant.ts` uses: Home Assistant mounts
 * `/data/options.json` for an installed add-on and a plain container has no
 * such file. A fact about the running deployment beats a claim something made
 * about itself.
 *
 * **Both options are deployment parameters and neither is a setting.** The
 * operator hostname is what senders resolve to reach this machine, and the
 * administration bind address is where a listener sits. Two people in the same
 * Home cannot answer either of them differently, which is ADR 0104's test for
 * what may live in host configuration at all.
 */
export const picoRelayHomeAssistantOptionsPath = '/data/options.json';

/**
 * The option names this file reads, exported so the add-on's `schema` can be
 * checked against them rather than kept in step by hand. A renamed option in
 * `pico_relay/config.yaml` would otherwise be a relay that silently ignores
 * what somebody typed - and it would pass every test in this package.
 */
export const picoRelayHomeAssistantOptionNames = ['operator', 'operator_api_on_lan'] as const;

interface PicoRelayHomeAssistantOptions {
  operator?: unknown;
  operator_api_on_lan?: unknown;
}

/**
 * Applies an installed add-on's options to `env`. Returns whether a Home
 * Assistant deployment was detected at all, so the boot log can say which host
 * it decided it is running on instead of leaving that to be inferred.
 */
export function applyPicoRelayHomeAssistantOptions(
  env: NodeJS.ProcessEnv,
  optionsPath = picoRelayHomeAssistantOptionsPath,
): boolean {
  if (!existsSync(optionsPath)) {
    return false;
  }

  const options = readOptions(optionsPath);
  const operator = readOptionalString(options, 'operator');

  // The environment still wins where there is one, which keeps a container run
  // with both an options file and `-e PICO_RELAY_OPERATOR` predictable. Under a
  // Supervisor there is no such environment, so this branch is the only voice
  // the person installing the add-on has.
  if (operator !== undefined && operator.trim() !== '' && env.PICO_RELAY_OPERATOR === undefined) {
    env.PICO_RELAY_OPERATOR = operator;
  }

  /**
   * ADR 0154 RO1/RO7 under a Supervisor. The administration listener stays on
   * loopback unless somebody asks for it, and asking is two deliberate acts:
   * this option moves the bind address, and publishing port 3202 in the
   * add-on's network panel is what makes it reachable. Neither alone opens it.
   *
   * **This one overrides the image's own value rather than deferring to it**,
   * which is the opposite of the operator branch above and is deliberate.
   * `docker/relay.Dockerfile` sets `PICO_RELAY_OPERATOR_HOST=127.0.0.1`, so a
   * "only if unset" guard here would mean the option could never do anything.
   * An image default is not a decision somebody made; the option is.
   */
  const operatorApiOnLan = readOptionalBoolean(options, 'operator_api_on_lan');

  if (operatorApiOnLan === true) {
    env.PICO_RELAY_OPERATOR_HOST = '0.0.0.0';
  }

  return true;
}

function readOptions(optionsPath: string): PicoRelayHomeAssistantOptions {
  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(optionsPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Could not read Home Assistant add-on options at ${optionsPath}: ${formatUnknownError(error)}`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Home Assistant add-on options at ${optionsPath} must be a JSON object.`);
  }

  return parsed;
}

function readOptionalString(
  options: PicoRelayHomeAssistantOptions,
  name: 'operator',
): string | undefined {
  const value = options[name];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`Home Assistant add-on option ${name} must be a string when provided.`);
  }

  return value;
}

function readOptionalBoolean(
  options: PicoRelayHomeAssistantOptions,
  name: 'operator_api_on_lan',
): boolean | undefined {
  const value = options[name];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new Error(`Home Assistant add-on option ${name} must be a boolean when provided.`);
  }

  return value;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
