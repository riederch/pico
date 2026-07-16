import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyHomeAssistantAddonOptions } from './addon-options.js';

describe('Home Assistant add-on options', () => {
  it('does nothing when the options file is missing', () => {
    const env: Record<string, string | undefined> = {};

    applyHomeAssistantAddonOptions(env, join(tmpdir(), 'missing-pico-options.json'));

    expect(env.PICO_FOUNDATION_TOKEN).toBeUndefined();
    expect(env.PICO_FOUNDATION_ACCESS_MODE).toBeUndefined();
  });

  it('sets Home Assistant ingress access mode when an options file exists', () => {
    const env: Record<string, string | undefined> = {};

    applyHomeAssistantAddonOptions(env, writeOptions({}));

    expect(env.PICO_FOUNDATION_ACCESS_MODE).toBe('ha-ingress');
  });

  it('does not replace an explicitly configured access mode', () => {
    const env: Record<string, string | undefined> = {
      PICO_FOUNDATION_ACCESS_MODE: 'direct-token',
    };

    applyHomeAssistantAddonOptions(env, writeOptions({}));

    expect(env.PICO_FOUNDATION_ACCESS_MODE).toBe('direct-token');
  });

  it('maps pico_foundation_token to PICO_FOUNDATION_TOKEN', () => {
    const env: Record<string, string | undefined> = {};
    const optionsPath = writeOptions({ pico_foundation_token: 'direct-token' });

    applyHomeAssistantAddonOptions(env, optionsPath);

    expect(env.PICO_FOUNDATION_TOKEN).toBe('direct-token');
    expect(env.PICO_FOUNDATION_ACCESS_MODE).toBe('ha-ingress');
  });

  it('does not replace an explicitly configured environment token', () => {
    const env: Record<string, string | undefined> = {
      PICO_FOUNDATION_TOKEN: 'env-token',
    };
    const optionsPath = writeOptions({ pico_foundation_token: 'option-token' });

    applyHomeAssistantAddonOptions(env, optionsPath);

    expect(env.PICO_FOUNDATION_TOKEN).toBe('env-token');
  });

  it('ignores missing, null and blank token options', () => {
    for (const options of [{}, { pico_foundation_token: null }, { pico_foundation_token: '   ' }]) {
      const env: Record<string, string | undefined> = {};

      applyHomeAssistantAddonOptions(env, writeOptions(options));

      expect(env.PICO_FOUNDATION_TOKEN).toBeUndefined();
    }
  });

  it('maps memory_encryption to PICO_MEMORY_ENCRYPTION and leaves it unset otherwise', () => {
    const enabled: Record<string, string | undefined> = {};
    applyHomeAssistantAddonOptions(enabled, writeOptions({ memory_encryption: true }));
    expect(enabled.PICO_MEMORY_ENCRYPTION).toBe('true');

    for (const options of [{}, { memory_encryption: false }, { memory_encryption: null }]) {
      const env: Record<string, string | undefined> = {};
      applyHomeAssistantAddonOptions(env, writeOptions(options));
      expect(env.PICO_MEMORY_ENCRYPTION).toBeUndefined();
    }

    const explicit: Record<string, string | undefined> = { PICO_MEMORY_ENCRYPTION: 'false' };
    applyHomeAssistantAddonOptions(explicit, writeOptions({ memory_encryption: true }));
    expect(explicit.PICO_MEMORY_ENCRYPTION).toBe('false');
  });

  it('rejects invalid option files', () => {
    expect(() => applyHomeAssistantAddonOptions({}, writeRawOptions('not json')))
      .toThrow('Could not read Home Assistant add-on options');

    expect(() => applyHomeAssistantAddonOptions({}, writeRawOptions('[]')))
      .toThrow('Home Assistant add-on options');

    expect(() => applyHomeAssistantAddonOptions({}, writeOptions({ pico_foundation_token: 123 })))
      .toThrow('Home Assistant add-on option pico_foundation_token must be a string when provided.');

    expect(() => applyHomeAssistantAddonOptions({}, writeOptions({ memory_encryption: 'yes' })))
      .toThrow('Home Assistant add-on option memory_encryption must be a boolean when provided.');
  });
});

function writeOptions(options: unknown): string {
  return writeRawOptions(JSON.stringify(options));
}

function writeRawOptions(content: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'pico-addon-options-'));
  const optionsPath = join(directory, 'options.json');
  writeFileSync(optionsPath, content);
  return optionsPath;
}
