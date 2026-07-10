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
  });

  it('maps pico_foundation_token to PICO_FOUNDATION_TOKEN', () => {
    const env: Record<string, string | undefined> = {};
    const optionsPath = writeOptions({ pico_foundation_token: 'direct-token' });

    applyHomeAssistantAddonOptions(env, optionsPath);

    expect(env.PICO_FOUNDATION_TOKEN).toBe('direct-token');
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

  it('rejects invalid option files', () => {
    expect(() => applyHomeAssistantAddonOptions({}, writeRawOptions('not json')))
      .toThrow('Could not read Home Assistant add-on options');

    expect(() => applyHomeAssistantAddonOptions({}, writeRawOptions('[]')))
      .toThrow('Home Assistant add-on options');

    expect(() => applyHomeAssistantAddonOptions({}, writeOptions({ pico_foundation_token: 123 })))
      .toThrow('Home Assistant add-on option pico_foundation_token must be a string when provided.');
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
