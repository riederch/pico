import { PicoAppearanceError } from './appearance-errors.js';
import type { PicoAppearanceProfileV1 } from './appearance-profile-v1.js';
import { encodeAppearanceProfileV1 } from './appearance-profile-v1-codec.js';
import type { PicoAppearanceDocumentV1 } from './appearance-document-v1.js';
import { encodeAppearanceDocumentV1 } from './appearance-document-v1-codec.js';
import { encodeBase64Url } from './base64url.js';

export type PicoAppearanceLevelOfDetail = 'lod0' | 'lod1' | 'lod2';

/**
 * Renderer version segment: lowercase letters, digits, dot and hyphen. No
 * colon, so the cache key segments stay unambiguous.
 */
export const appearanceCacheKeyRendererVersionPattern = /^[a-z0-9.-]+$/;

const levelsOfDetail: readonly PicoAppearanceLevelOfDetail[] = ['lod0', 'lod1', 'lod2'];

/**
 * Derived cache key for artifacts rendered from the **profile alone** (PAS
 * brief section 15.1). It deliberately covers only the 18/38 profile bytes:
 * two documents with the same profile but different custom assets,
 * extensions or core model pin share this key. Artifacts derived from a
 * full document use `createPicoAppearanceDocumentCacheKeyV1`. The cache is
 * fully derived state and may be deleted at any time; the key never carries
 * status, context or presentation-quality identity.
 */
export function createPicoAppearanceCacheKeyV1(
  profile: PicoAppearanceProfileV1,
  rendererVersion: string,
  lod: PicoAppearanceLevelOfDetail,
): string {
  return `pico-appearance:pa1:${encodeBase64Url(encodeAppearanceProfileV1(profile))}:${requireKeySegments(rendererVersion, lod)}`;
}

/**
 * Derived cache key over the complete canonical document bytes, so custom
 * assets, extensions and the core model pin all separate the key. Uses the
 * canonical `pad1` payload itself instead of a hash: the package has no
 * hashing dependency, and canonical bytes are already deterministic.
 */
export function createPicoAppearanceDocumentCacheKeyV1(
  document: PicoAppearanceDocumentV1,
  rendererVersion: string,
  lod: PicoAppearanceLevelOfDetail,
): string {
  return `pico-appearance:pad1:${encodeBase64Url(encodeAppearanceDocumentV1(document))}:${requireKeySegments(rendererVersion, lod)}`;
}

function requireKeySegments(rendererVersion: string, lod: PicoAppearanceLevelOfDetail): string {
  if (typeof rendererVersion !== 'string' || !appearanceCacheKeyRendererVersionPattern.test(rendererVersion)) {
    throw new PicoAppearanceError('invalid_shape', 'rendererVersion must match [a-z0-9.-]+');
  }
  if (!levelsOfDetail.includes(lod)) {
    throw new PicoAppearanceError('invalid_shape', 'lod must be lod0, lod1 or lod2');
  }
  return `${rendererVersion}:${lod}`;
}
