import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

/**
 * ADR 0153 PK6, second half: a release asset is attached once and never
 * replaced.
 *
 * Until 2026-09-10 the client job attached its package with `--clobber`, and
 * the two image jobs beside it ran `check-release-monotonic.mjs` while the
 * client job waited only on `verify` and `suites`. So a tag that the registry
 * refused - already published, or below the newest - could still have its
 * `.deb` and checksum swapped under the same name. Two artifacts of one
 * version from two source states, which is what a version must never be. An
 * external review found it (2026-09-09, §3); measured, it stood exactly so.
 *
 * The rule is the same one the images have, applied to what the client has
 * instead of a registry: the assets already attached to the release. Pure and
 * exported for the same reason as `decidePicoRelease` - a rule that could only
 * be exercised by publishing would never be exercised at all.
 */
export function decidePicoReleaseAssets(input) {
  const { existing, candidates } = input;
  if (candidates.length === 0) {
    // Nothing to attach is not a clean run; it is a job that lost its package
    // somewhere between verification and here.
    return { ok: false, reason: 'no_candidates', detail: 'no asset was offered for attachment.' };
  }
  const attached = new Set(existing);
  const collisions = candidates.filter((name) => attached.has(name));
  if (collisions.length > 0) {
    return {
      ok: false,
      reason: 'asset_exists',
      detail: `${collisions.join(', ')} ${collisions.length === 1 ? 'is' : 'are'} already attached; `
        + 'a published artifact never changes what it is.',
    };
  }
  return { ok: true, attaching: candidates.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [assetsPath, ...files] = process.argv.slice(2);
  if (assetsPath === undefined || files.length === 0) {
    console.error(
      'Release asset check failed: usage is <release-assets.json> <file>..., where the JSON is '
      + 'the output of `gh release view --json assets`.',
    );
    process.exit(1);
  }
  let existing;
  try {
    const body = JSON.parse(readFileSync(assetsPath, 'utf8'));
    if (!Array.isArray(body.assets)) {
      throw new Error('no_assets_array');
    }
    existing = body.assets.map((asset) => asset.name);
  } catch (error) {
    // A release whose assets cannot be read is not a release that said yes.
    console.error(`Release asset check failed: cannot read ${assetsPath}: ${String(error)}`);
    process.exit(1);
  }
  const decision = decidePicoReleaseAssets({ existing, candidates: files.map((file) => basename(file)) });
  if (!decision.ok) {
    console.error(`Release asset check failed: ${decision.detail}`);
    process.exit(1);
  }
  console.log(
    `Release asset check passed: ${decision.attaching} asset${decision.attaching === 1 ? '' : 's'} `
    + `to attach, none of ${existing.length} already attached.`,
  );
}
