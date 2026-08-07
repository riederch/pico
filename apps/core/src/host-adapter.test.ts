import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyPicoHomeAssistantAppOptions,
  createPicoHomeAssistantHostAdapter,
  picoHomeAssistantOptionsPath,
} from './host-adapter-home-assistant.js';
import { applyPicoHostEnvironment, type PicoHostAdapter } from './host-adapter.js';

describe('ADR 0128 H5 the host adapter seam', () => {
  it('applies the first detected adapter and consults no other', () => {
    const applied: string[] = [];
    const adapter = (hostName: string, detects: boolean): PicoHostAdapter => ({
      hostName,
      detect: () => detects,
      applyDefaults: () => {
        applied.push(hostName);
      },
    });

    const detection = applyPicoHostEnvironment(
      [adapter('absent', false), adapter('first', true), adapter('second', true)],
      {},
    );

    // Two hosts at once is not a real deployment, and merging their answers
    // would produce a configuration neither of them describes.
    expect(applied).toEqual(['first']);
    expect(detection.hostName).toBe('first');
  });

  it('reports no host when none detects, and changes nothing', () => {
    const env: Record<string, string | undefined> = { PICO_HOST: '127.0.0.1' };
    const detection = applyPicoHostEnvironment(
      [{ hostName: 'absent', detect: () => false, applyDefaults: () => { throw new Error('called'); } }],
      env,
    );

    expect(detection.hostName).toBeUndefined();
    expect(env).toEqual({ PICO_HOST: '127.0.0.1' });
  });
});

describe('ADR 0128 H5 the Home Assistant host adapter', () => {
  it('detects by the options file the host mounts, not by a claim', () => {
    // Presence of the mounted file is a fact about the running deployment.
    // Anything self-reported could be set by whoever starts the container.
    expect(createPicoHomeAssistantHostAdapter(writeOptions({})).detect({})).toBe(true);
    expect(createPicoHomeAssistantHostAdapter(join(tmpdir(), 'missing-pico-options.json'))
      .detect({})).toBe(false);
  });

  it('names itself for the startup log', () => {
    expect(createPicoHomeAssistantHostAdapter().hostName).toBe('home-assistant');
  });

  it('defaults to the path Home Assistant actually mounts', () => {
    // `index.ts` builds this adapter with no argument, so this constant is the
    // only part of the chain no other test reaches. Getting it wrong would
    // mean the App silently never detects its own host.
    expect(picoHomeAssistantOptionsPath).toBe('/data/options.json');
    expect(createPicoHomeAssistantHostAdapter(picoHomeAssistantOptionsPath).hostName)
      .toBe(createPicoHomeAssistantHostAdapter().hostName);
  });

  it('does nothing when the options file is missing', () => {
    const env: Record<string, string | undefined> = {};

    applyPicoHomeAssistantAppOptions(env, join(tmpdir(), 'missing-pico-options.json'));

    expect(env.PICO_FOUNDATION_TOKEN).toBeUndefined();
    expect(env.PICO_FOUNDATION_ACCESS_MODE).toBeUndefined();
  });

  it('defaults the access mode to trusted-proxy, naming what stands in front', () => {
    const env: Record<string, string | undefined> = {};

    applyPicoHomeAssistantAppOptions(env, writeOptions({}));

    // Not `ha-ingress`: the mode says what stands in front of the Foundation
    // surface, not which product it is (ADR 0128).
    expect(env.PICO_FOUNDATION_ACCESS_MODE).toBe('trusted-proxy');
  });

  it('does not replace an explicitly configured access mode', () => {
    const env: Record<string, string | undefined> = {
      PICO_FOUNDATION_ACCESS_MODE: 'direct-token',
    };

    applyPicoHomeAssistantAppOptions(env, writeOptions({}));

    expect(env.PICO_FOUNDATION_ACCESS_MODE).toBe('direct-token');
  });

  it('maps pico_foundation_token to PICO_FOUNDATION_TOKEN', () => {
    const env: Record<string, string | undefined> = {};
    const optionsPath = writeOptions({ pico_foundation_token: 'direct-token' });

    applyPicoHomeAssistantAppOptions(env, optionsPath);

    expect(env.PICO_FOUNDATION_TOKEN).toBe('direct-token');
    expect(env.PICO_FOUNDATION_ACCESS_MODE).toBe('trusted-proxy');
  });

  it('does not replace an explicitly configured environment token', () => {
    const env: Record<string, string | undefined> = {
      PICO_FOUNDATION_TOKEN: 'env-token',
    };
    const optionsPath = writeOptions({ pico_foundation_token: 'option-token' });

    applyPicoHomeAssistantAppOptions(env, optionsPath);

    expect(env.PICO_FOUNDATION_TOKEN).toBe('env-token');
  });

  it('ignores missing, null and blank token options', () => {
    for (const options of [{}, { pico_foundation_token: null }, { pico_foundation_token: '   ' }]) {
      const env: Record<string, string | undefined> = {};

      applyPicoHomeAssistantAppOptions(env, writeOptions(options));

      expect(env.PICO_FOUNDATION_TOKEN).toBeUndefined();
    }
  });

  it('maps memory_encryption to PICO_MEMORY_ENCRYPTION and leaves it unset otherwise', () => {
    const enabled: Record<string, string | undefined> = {};
    applyPicoHomeAssistantAppOptions(enabled, writeOptions({ memory_encryption: true }));
    expect(enabled.PICO_MEMORY_ENCRYPTION).toBe('true');

    for (const options of [{}, { memory_encryption: false }, { memory_encryption: null }]) {
      const env: Record<string, string | undefined> = {};
      applyPicoHomeAssistantAppOptions(env, writeOptions(options));
      expect(env.PICO_MEMORY_ENCRYPTION).toBeUndefined();
    }

    const explicit: Record<string, string | undefined> = { PICO_MEMORY_ENCRYPTION: 'false' };
    applyPicoHomeAssistantAppOptions(explicit, writeOptions({ memory_encryption: true }));
    expect(explicit.PICO_MEMORY_ENCRYPTION).toBe('false');
  });

  it('fills in defaults and overrides nothing, through the seam', () => {
    // The rule the seam exists for, checked once at the level a caller uses:
    // a host that could overrule an explicit value would make the same
    // deployment behave differently depending on where it ran.
    const env: Record<string, string | undefined> = {
      PICO_FOUNDATION_ACCESS_MODE: 'direct-token',
      PICO_FOUNDATION_TOKEN: 'env-token',
      PICO_MEMORY_ENCRYPTION: 'false',
    };
    const optionsPath = writeOptions({
      pico_foundation_token: 'option-token',
      memory_encryption: true,
    });

    const detection = applyPicoHostEnvironment(
      [createPicoHomeAssistantHostAdapter(optionsPath)],
      env,
    );

    expect(detection.hostName).toBe('home-assistant');
    expect(env).toEqual({
      PICO_FOUNDATION_ACCESS_MODE: 'direct-token',
      PICO_FOUNDATION_TOKEN: 'env-token',
      PICO_MEMORY_ENCRYPTION: 'false',
    });
  });

  it('rejects invalid option files', () => {
    expect(() => applyPicoHomeAssistantAppOptions({}, writeRawOptions('not json')))
      .toThrow('Could not read Home Assistant App options');

    expect(() => applyPicoHomeAssistantAppOptions({}, writeRawOptions('[]')))
      .toThrow('Home Assistant App options');

    expect(() => applyPicoHomeAssistantAppOptions({}, writeOptions({ pico_foundation_token: 123 })))
      .toThrow('Home Assistant App option pico_foundation_token must be a string when provided.');

    expect(() => applyPicoHomeAssistantAppOptions({}, writeOptions({ memory_encryption: 'yes' })))
      .toThrow('Home Assistant App option memory_encryption must be a boolean when provided.');
  });
});

function writeOptions(options: unknown): string {
  return writeRawOptions(JSON.stringify(options));
}

function writeRawOptions(content: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'pico-host-options-'));
  const optionsPath = join(directory, 'options.json');
  writeFileSync(optionsPath, content);
  return optionsPath;
}
