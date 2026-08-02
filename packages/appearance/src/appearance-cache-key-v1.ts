import { PicoAppearanceError } from './appearance-errors.js';
import type { PicoAppearanceProfileV1 } from './appearance-profile-v1.js';
import { encodeAppearanceProfileV1 } from './appearance-profile-v1-codec.js';
import { encodeBase64Url } from './base64url.js';

export type PicoAppearanceLevelOfDetail = 'lod0' | 'lod1' | 'lod2';

/**
 * Renderer version segment: lowercase letters, digits, dot and hyphen. No
 * colon, so the cache key segments stay unambiguous.
 */
export const appearanceCacheKeyRendererVersionPattern = /^[a-z0-9.-]+$/;

const levelsOfDetail: readonly PicoAppearanceLevelOfDetail[] = ['lod0', 'lod1', 'lod2'];

/**
 * Derived cache key for rendered appearance artifacts (PAS brief section
 * 15.1). The cache is fully derived state and may be deleted at any time;
 * the key never carries status, context or presentation-quality identity.
 */
export function createPicoAppearanceCacheKeyV1(
  profile: PicoAppearanceProfileV1,
  rendererVersion: string,
  lod: PicoAppearanceLevelOfDetail,
): string {
  if (typeof rendererVersion !== 'string' || !appearanceCacheKeyRendererVersionPattern.test(rendererVersion)) {
    throw new PicoAppearanceError('invalid_shape', 'rendererVersion must match [a-z0-9.-]+');
  }
  if (!levelsOfDetail.includes(lod)) {
    throw new PicoAppearanceError('invalid_shape', 'lod must be lod0, lod1 or lod2');
  }
  return `pico-appearance:pa1:${encodeBase64Url(encodeAppearanceProfileV1(profile))}:${rendererVersion}:${lod}`;
}
