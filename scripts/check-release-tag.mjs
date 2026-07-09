import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const refType = process.env.GITHUB_REF_TYPE;
const refName = process.env.GITHUB_REF_NAME;

if (refType === undefined && refName === undefined) {
  console.log('Release tag check skipped: no GitHub ref context.');
  process.exit(0);
}

if (refType !== 'tag') {
  console.log(`Release tag check skipped: GITHUB_REF_TYPE is ${JSON.stringify(refType)}.`);
  process.exit(0);
}

const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const version = packageJson.version;

if (typeof version !== 'string' || !version.trim()) {
  console.error('Release tag check failed: package.json version must be a non-empty string.');
  process.exit(1);
}

const expectedTag = `v${version}`;

if (refName !== expectedTag) {
  console.error(`Release tag mismatch: expected ${expectedTag} from package.json, got ${refName ?? '<unset>'}.`);
  process.exit(1);
}

console.log(`Release tag check passed for ${expectedTag}.`);
