/**
 * ADR 0128 H5. Where a host gets to speak, and nowhere else.
 *
 * Pico Home runs on more than one host shape - a Home Assistant App today, the
 * ADR 0027 appliance image next, a plain container or a developer's machine
 * beside them. Each has its own way of handing a service its configuration: a
 * mounted options file, a first-boot answer, an environment.
 *
 * Everything downstream of this file reads the environment and nothing else.
 * That is the whole point of the seam: `config.ts` decides what a value means,
 * an adapter decides where it came from, and only the adapter is allowed to
 * know a host's name.
 *
 * **Defaults, never overrides.** An adapter fills in what nobody said. An
 * explicit environment variable was set by a person who meant it, and a host
 * that could quietly overrule it would make the same deployment behave
 * differently depending on where it ran - which is the failure this seam
 * exists to prevent, not a convenience it may trade away.
 *
 * The first detected adapter wins and the rest are not consulted. Two hosts at
 * once is not a real deployment, and merging their answers would produce a
 * configuration neither of them describes.
 */
export type PicoHostEnvironment = Record<string, string | undefined>;

export interface PicoHostAdapter {
  /** For the startup log. A person reading it should recognise their host. */
  readonly hostName: string;
  /** Whether this host is the one we are running on, right now. */
  detect(env: PicoHostEnvironment): boolean;
  /** Fill in what nobody set. Never replace what someone did. */
  applyDefaults(env: PicoHostEnvironment): void;
}

export interface PicoHostDetection {
  /** The host that answered, or `undefined` for a plain environment. */
  hostName?: string;
}

export function applyPicoHostEnvironment(
  adapters: readonly PicoHostAdapter[],
  env: PicoHostEnvironment = process.env,
): PicoHostDetection {
  for (const adapter of adapters) {
    if (!adapter.detect(env)) {
      continue;
    }
    adapter.applyDefaults(env);
    return { hostName: adapter.hostName };
  }
  return {};
}
