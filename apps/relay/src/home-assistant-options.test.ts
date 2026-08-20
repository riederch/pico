import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyPicoRelayHomeAssistantOptions,
  picoRelayHomeAssistantOptionNames,
  picoRelayHomeAssistantOptionsPath,
} from './home-assistant-options.js';

/**
 * ADR 0155 HR2. The bridge between what a Supervisor hands an add-on and what
 * a relay reads.
 *
 * Everything else in this package is tested against a real listener. This one
 * cannot be: the file it reads only exists inside an installed add-on, and the
 * failure it prevents - options typed into Home Assistant that the process
 * never sees - is silent by construction. A relay ignoring its configuration
 * starts, listens, and refuses every packet as `unknown_account`, which is
 * indistinguishable at the door from an unprovisioned one.
 */
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Writes an options file the way the Supervisor mounts one, and returns it. */
function optionsFile(contents: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-relay-options-'));
  dirs.push(dir);
  const path = join(dir, 'options.json');
  writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents));
  return path;
}

/** The image's own defaults, so a test says what it is overriding. */
function containerEnv(): NodeJS.ProcessEnv {
  return {
    PICO_RELAY_HOST: '0.0.0.0',
    PICO_RELAY_PORT: '3200',
    PICO_RELAY_HEALTH_HOST: '127.0.0.1',
    PICO_RELAY_OPERATOR_HOST: '127.0.0.1',
  };
}

describe('detecting the host rather than being told about it', () => {
  it('does nothing at all when there is no options file', () => {
    const env = containerEnv();
    expect(applyPicoRelayHomeAssistantOptions(env, join(tmpdir(), 'pico-relay-absent.json')))
      .toBe(false);
    expect(env).toEqual(containerEnv());
  });

  it('reports the host it found, so the boot log can say which one it is', () => {
    expect(applyPicoRelayHomeAssistantOptions(containerEnv(), optionsFile({}))).toBe(true);
  });

  it('mounts where Home Assistant mounts', () => {
    // Pinned because `main.ts` constructs no path and takes the default. This
    // constant is the one link in the chain no other test can reach.
    expect(picoRelayHomeAssistantOptionsPath).toBe('/data/options.json');
  });
});

describe('the operator hostname, which has no default anywhere', () => {
  it('carries what somebody typed in the Configuration tab', () => {
    const env = containerEnv();
    applyPicoRelayHomeAssistantOptions(env, optionsFile({ operator: 'relay.example.org' }));
    expect(env.PICO_RELAY_OPERATOR).toBe('relay.example.org');
  });

  it('leaves an environment that already said so alone', () => {
    // A container run with both keeps behaving like a container.
    const env = { ...containerEnv(), PICO_RELAY_OPERATOR: 'relay.from-compose' };
    applyPicoRelayHomeAssistantOptions(env, optionsFile({ operator: 'relay.from-options' }));
    expect(env.PICO_RELAY_OPERATOR).toBe('relay.from-compose');
  });

  it('treats an unset and a blank option the same way', () => {
    // `str?` in the schema means the field can be saved empty, and an empty
    // string set here would fail the hostname check with a message about a
    // malformed hostname rather than a missing one.
    const env = containerEnv();
    applyPicoRelayHomeAssistantOptions(env, optionsFile({ operator: '   ' }));
    expect(env.PICO_RELAY_OPERATOR).toBeUndefined();

    const empty = containerEnv();
    applyPicoRelayHomeAssistantOptions(empty, optionsFile({}));
    expect(empty.PICO_RELAY_OPERATOR).toBeUndefined();
  });

  it('refuses a value of the wrong type instead of stringifying it', () => {
    expect(() => applyPicoRelayHomeAssistantOptions(containerEnv(), optionsFile({ operator: 3200 })))
      .toThrow('must be a string');
  });
});

describe('ADR 0154 RO1/RO7 - the administration port stays shut by default', () => {
  it('leaves the listener on loopback when nobody asked', () => {
    const env = containerEnv();
    applyPicoRelayHomeAssistantOptions(env, optionsFile({ operator_api_on_lan: false }));
    expect(env.PICO_RELAY_OPERATOR_HOST).toBe('127.0.0.1');

    const untouched = containerEnv();
    applyPicoRelayHomeAssistantOptions(untouched, optionsFile({}));
    expect(untouched.PICO_RELAY_OPERATOR_HOST).toBe('127.0.0.1');
  });

  it('overrides the image default when somebody did ask', () => {
    /**
     * The one place this file deliberately outranks the environment. The image
     * sets `PICO_RELAY_OPERATOR_HOST=127.0.0.1`, so an "only if unset" guard
     * would make the option dead on arrival - it would save, show as enabled,
     * and change nothing. That is worse than not offering it.
     */
    const env = containerEnv();
    applyPicoRelayHomeAssistantOptions(env, optionsFile({ operator_api_on_lan: true }));
    expect(env.PICO_RELAY_OPERATOR_HOST).toBe('0.0.0.0');
  });

  it('moves the bind address and nothing else', () => {
    // Publishing port 3202 is the second act, and it is Home Assistant's to
    // perform. Neither one alone makes the relay administrable from the network.
    const env = containerEnv();
    applyPicoRelayHomeAssistantOptions(env, optionsFile({ operator_api_on_lan: true }));
    expect(env.PICO_RELAY_HOST).toBe('0.0.0.0');
    expect(env.PICO_RELAY_HEALTH_HOST).toBe('127.0.0.1');
    expect(env.PICO_RELAY_PORT).toBe('3200');
  });

  it('refuses a value of the wrong type', () => {
    expect(() => applyPicoRelayHomeAssistantOptions(
      containerEnv(),
      optionsFile({ operator_api_on_lan: 'true' }),
    )).toThrow('must be a boolean');
  });
});

describe('an options file that is not one', () => {
  it('names the path it could not read', () => {
    expect(() => applyPicoRelayHomeAssistantOptions(containerEnv(), optionsFile('{not json')))
      .toThrow(/Could not read Home Assistant add-on options at .*options\.json/u);
  });

  it('refuses a JSON document that is not an object', () => {
    expect(() => applyPicoRelayHomeAssistantOptions(containerEnv(), optionsFile(['operator'])))
      .toThrow('must be a JSON object');
  });
});

describe('ADR 0155 HR3 - the add-on and the reader name the same options', () => {
  it('reads every option the add-on declares, and declares every one it reads', () => {
    /**
     * The drift this package cannot otherwise see. Renaming an option in
     * `pico_relay/config.yaml` leaves a Configuration tab that saves happily
     * into a field nothing reads, and every test in this file still passes -
     * because they all supply the names themselves.
     */
    const config = readFileSync(
      fileURLToPath(new URL('../../../pico_relay/config.yaml', import.meta.url)),
      'utf8',
    );
    const lines = config.split('\n');
    const start = lines.indexOf('schema:');
    expect(start).toBeGreaterThan(-1);
    const declared: string[] = [];
    for (const line of lines.slice(start + 1)) {
      if (line.trim() === '' || line.trimStart().startsWith('#')) {
        continue;
      }
      if (!/^\s/u.test(line)) {
        break;
      }
      const match = /^\s+([^:\s]+):/u.exec(line);
      if (match) {
        declared.push(match[1]);
      }
    }
    expect(declared.sort()).toEqual([...picoRelayHomeAssistantOptionNames].sort());
  });
});
