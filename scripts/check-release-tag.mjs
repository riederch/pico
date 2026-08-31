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

/**
 * Gelesen statt geglaubt, und ein Fehlschlag hier heisst, was er ist.
 *
 * Ohne diese Zeilen warf der Aufruf über einem Baum ohne `package.json` einen
 * ungefangenen `ENOENT` - richtig herum (der Prozess endet ungleich null), aber
 * als Bericht unbrauchbar: `check-vacuous-gates` kann einen Absturz nicht von
 * einer Ablehnung unterscheiden, und wer die Ausgabe liest, sieht einen
 * Stapelabzug statt eines Satzes. Am 2026-08-31 gemeldet als „meldet Erfolg
 * über einem leeren Baum"; das tut es nicht - aber was es tat, war nicht
 * lesbar genug, um das auseinanderzuhalten.
 */
let packageJson;
try {
  packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
} catch (unreadable) {
  console.error(
    'Release tag check failed: there is no readable package.json beside this script, so '
    + 'there is no version to hold a tag against. A reader that finds no subject is broken, '
    + `not clean (${unreadable instanceof Error ? unreadable.message : 'unreadable'}).`,
  );
  process.exit(1);
}
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
