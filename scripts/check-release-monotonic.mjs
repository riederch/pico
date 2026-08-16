import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ADR 0122 Y4: no re-tag, no silent downgrade.
 *
 * GHCR tags are mutable. `docs/release/upgrade-contract.md` used to lean on
 * their immutability, and anyone with `packages: write` can re-point a version
 * at different bytes. This check does not make a tag immutable - nothing here
 * can - but it removes the *legitimate* path to a moved tag, so a version that
 * changes bytes is always evidence rather than possibly a re-run.
 *
 * Two refusals, and they are different failures:
 *
 * - **Already published.** Publishing a version that exists means either an
 *   accidental re-run or an attempt to change what a version means. Both are
 *   answered the same way, because the pipeline cannot tell them apart and the
 *   safe reading of an ambiguous one is the hostile one.
 * - **Below the newest published.** A release older than what is out there is
 *   a downgrade, and a downgrade that arrives through the normal channel is
 *   indistinguishable from a rollback attack. Rolling back is a deliberate
 *   act, so it does not travel this path.
 *
 * The published set is read from the registry rather than from anything in
 * this repository: what is out there is the fact, and a local list would be
 * exactly what an attacker rewrites.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));

export function comparePicoVersions(left, right) {
  const parse = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(value);
    if (match === null) {
      throw new Error(`unparseable_pico_version:${value}`);
    }
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] < b[index] ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Decides publishability from the candidate and what the registry already has.
 * Pure, so the rule is testable without a registry - the network part is the
 * caller's problem, and a rule that could only be exercised by publishing
 * would never be exercised at all.
 */
export function decidePicoRelease(input) {
  const { candidate, published } = input;
  const known = published.filter((version) => /^\d+\.\d+\.\d+$/u.test(version));

  if (known.includes(candidate)) {
    return {
      ok: false,
      reason: 'already_published',
      detail: `${candidate} is already published; a version never changes what it means.`,
    };
  }

  let newest = null;
  for (const version of known) {
    if (newest === null || comparePicoVersions(version, newest) > 0) {
      newest = version;
    }
  }

  if (newest !== null && comparePicoVersions(candidate, newest) < 0) {
    return {
      ok: false,
      reason: 'downgrade',
      detail: `${candidate} is below the newest published ${newest}; a downgrade does not travel this path.`,
    };
  }

  return { ok: true, newest };
}

async function readPublishedVersions(image, token) {
  // The registry's own list. Anonymous pulls are allowed for a public package,
  // and the workflow token is used where it is present.
  const [, owner, ...rest] = image.split('/');
  const name = rest.join('%2F');
  const url = `https://ghcr.io/v2/${owner}/${name}/tags/list`;
  const authority = Buffer.from(`v:${token ?? ''}`).toString('base64');
  const response = await fetch(url, {
    headers: token === undefined ? {} : { authorization: `Bearer ${authority}` },
  });
  if (response.status === 404) {
    // Nothing published yet is not an error: the first release has no
    // predecessor to be older than.
    return [];
  }
  if (!response.ok) {
    throw new Error(`registry_unreadable:${response.status}`);
  }
  const body = await response.json();
  return Array.isArray(body.tags) ? body.tags : [];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const refType = process.env.GITHUB_REF_TYPE;
  if (refType !== undefined && refType !== 'tag') {
    console.log(`Release monotonicity check skipped: GITHUB_REF_TYPE is ${JSON.stringify(refType)}.`);
    process.exit(0);
  }

  const candidate = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version;
  const image = process.env.PICO_RELEASE_IMAGE ?? 'ghcr.io/riederch/pico/home';

  let published;
  try {
    published = await readPublishedVersions(image, process.env.GITHUB_TOKEN);
  } catch (error) {
    // A registry that cannot be read is not a registry that said yes. Failing
    // closed here costs a re-run; failing open would publish over whatever is
    // already there.
    console.error(`Release monotonicity check failed: ${String(error)}`);
    process.exit(1);
  }

  const decision = decidePicoRelease({ candidate, published });
  if (!decision.ok) {
    console.error(`Release monotonicity check failed: ${decision.detail}`);
    process.exit(1);
  }

  console.log(
    `Release monotonicity check passed for ${candidate}`
    + `${decision.newest === null ? ' (first published version).' : ` (newest published ${decision.newest}).`}`,
  );
}
