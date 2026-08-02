import { describe, expect, it } from 'vitest';
import { createPicoAppearanceCacheKeyV1 } from './appearance-cache-key-v1.js';
import { encodeAppearanceProfileV1 } from './appearance-profile-v1-codec.js';
import { encodeBase64Url } from './base64url.js';
import { antennaProfile, expectAppearanceError } from './test-fixtures.js';

describe('appearance cache key v1', () => {
  it('builds the documented key shape from the profile bytes', () => {
    const key = createPicoAppearanceCacheKeyV1(antennaProfile, 'renderer-1.0.0', 'lod1');
    expect(key).toBe(`pico-appearance:pa1:${encodeBase64Url(encodeAppearanceProfileV1(antennaProfile))}:renderer-1.0.0:lod1`);
    expect(key.split(':')).toHaveLength(5);
  });

  it('rejects renderer versions with colons, uppercase or empty values', () => {
    expectAppearanceError(() => createPicoAppearanceCacheKeyV1(antennaProfile, 'a:b', 'lod0'), 'invalid_shape');
    expectAppearanceError(() => createPicoAppearanceCacheKeyV1(antennaProfile, 'Renderer', 'lod0'), 'invalid_shape');
    expectAppearanceError(() => createPicoAppearanceCacheKeyV1(antennaProfile, '', 'lod0'), 'invalid_shape');
  });

  it('rejects unknown levels of detail', () => {
    expectAppearanceError(
      () => createPicoAppearanceCacheKeyV1(antennaProfile, 'renderer-1.0.0', 'lod3' as never),
      'invalid_shape',
    );
  });
});
