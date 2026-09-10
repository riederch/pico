import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { picoDockerfiles } from './workspace-members.mjs';

/**
 * ADR 0122 Y1: the commit determines the build.
 *
 * Every mutable reference in a build is a place where the bytes that run can
 * change without the repository changing. A tag says what someone called a
 * commit; it does not say which commit, and it can be moved. The same holds
 * for a base image tag and for a package manager pinned by version alone.
 *
 * This check exists because pinning is the kind of thing that is done once and
 * quietly undone by the next person adding a step, and the cost of noticing
 * late is a build nobody can reproduce.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

// --- Workflows: every action pinned to a full commit SHA --------------------

const workflowDir = join(repoRoot, '.github', 'workflows');
/** Counted so a pass states its own scope rather than only its verdict. */
let workflowsRead = 0;
let actionsPinned = 0;
let dockerFilesRead = 0;
for (const entry of readdirSync(workflowDir)) {
  if (!entry.endsWith('.yml') && !entry.endsWith('.yaml')) {
    continue;
  }
  const path = join(workflowDir, entry);
  const content = readFileSync(path, 'utf8');
  workflowsRead += 1;
  for (const match of content.matchAll(/uses:\s*([^\s#]+)/gu)) {
    actionsPinned += 1;
    const reference = match[1];
    // A local or reusable-workflow path has no registry to move under it.
    if (reference.startsWith('./') || reference.startsWith('docker://')) {
      continue;
    }
    const at = reference.lastIndexOf('@');
    const version = at < 0 ? '' : reference.slice(at + 1);
    if (!/^[0-9a-f]{40}$/u.test(version)) {
      errors.push(
        `${relative(repoRoot, path)}: ${reference} is not pinned to a commit SHA. `
        + 'A tag can be moved; keep the version as a trailing comment.',
      );
    }
  }
}

// --- Base images: pinned by digest ------------------------------------------

// Dieselbe Entdeckung wie in `check-addon-config.mjs`, seit dem 2026-09-10 aus
// einer Hand: welche Bilder dieses Repositorium veroeffentlicht, ist eine
// Frage und keine zwei.
for (const dockerfilePath of picoDockerfiles(repoRoot)) {
  dockerFilesRead += 1;
  const path = join(repoRoot, dockerfilePath);
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^FROM\s+(\S+)/u.exec(line.trim());
    if (match === null) {
      continue;
    }
    const image = match[1];
    // A stage referring to an earlier stage in the same file carries no
    // registry reference to pin.
    if (!image.includes('/') && !image.includes(':')) {
      continue;
    }
    if (!image.includes('@sha256:')) {
      errors.push(
        `${relative(repoRoot, path)}: base image ${image} is not pinned by digest.`,
      );
    }
  }

  /**
   * Wer als root laeuft, sagt warum (Befund B90).
   *
   * Beide Bilder laufen als root, weil `node:22-bookworm-slim` keinen anderen
   * Benutzer setzt. Das Home begruendete das ausfuehrlich - ein gemountetes
   * `/data` waere fuer den `node`-Benutzer auf manchen Installationen nicht
   * beschreibbar -, das Relay sagte dazu nichts und erbte denselben Zustand
   * stillschweigend.
   *
   * Die Regel verlangt keinen `USER`: sie verlangt, dass die Entscheidung im
   * Bild steht. Ein drittes Bild, das morgen dazukommt, erbt sie dann nicht
   * mehr aus Versehen - und wer die Vertagung beendet, nimmt einfach den
   * Absatz heraus und setzt `USER`.
   */
  const dockerfile = readFileSync(path, 'utf8');
  const setsUser = /^USER\s+\S+/mu.test(dockerfile);
  // Nach der Sache gefragt, nicht nach dem Wort: eine Begruendung nennt
  // `root` und sagt, wer statt dessen liefe oder was aufgegeben wuerde.
  const saysWhy = dockerfile
    .split('\n')
    .filter((line) => line.trimStart().startsWith('#'))
    .some((line) => /root/iu.test(line))
    && /privileg|user/iu.test(dockerfile);
  if (!setsUser && !saysWhy) {
    errors.push(
      `${relative(repoRoot, path)}: sets no \`USER\` and says nothing about it. The `
      + 'base image runs as root, so an image without either is one nobody decided '
      + 'about. Set a user, or write down why this one stays root and what would '
      + 'end that.',
    );
  }
}

/**
 * Was git nicht will, will ein Bauzusammenhang auch nicht (Befund B91).
 *
 * Der erste Satz von `.dockerignore` sagt es selbst: „Docker does not read
 * .gitignore." Genau deshalb muessen die beiden Dateien von Hand
 * uebereinstimmen - und am 2026-09-08 taten sie es nicht. Der
 * Bauzusammenhang mass **294 MB**, davon 268 MB gepacktes Electron unter
 * `apps/companion-shell/out`, hochgeladen in jedem der sechs Bauschritte und
 * in keinem der beiden Bilder vorkommend. Dazu zwei Recovery-Card-PDFs im
 * Wurzelverzeichnis, die `.gitignore` beim Namen kennt: eine gedruckte Karte
 * traegt Wurzelmaterial, also genau die Klasse, fuer die diese Datei
 * geschrieben wurde. Danach 26,6 MB, und das Home-Bild gebaut, gestartet und
 * an `/health` mit 200 geantwortet.
 *
 * Die Regel vergleicht die beiden Listen. Was in `.gitignore` steht und nicht
 * in `.dockerignore`, muss hier mit einem Grund stehen - keine Mustersprache
 * nachgebaut, nur Namen verglichen, denn ein Name, der in einer Datei steht
 * und in der anderen fehlt, ist die Frage.
 */
const dockerignoreExempt = new Map([
  ['!.env.example', 'eine Ausnahme *von* einer Ausnahme; sie schliesst nichts aus'],
  ['*.py[cod]', 'Glob-Klassen in eckigen Klammern kennt `.dockerignore` nicht; '
    + '`__pycache__` deckt dieselben Dateien'],
  ['/.claude/settings.local.json', 'als `.claude/settings.local.json` ohne fuehrenden '
    + 'Schraegstrich eingetragen - dieselbe Datei, andere Schreibweise'],
]);
{
  const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
  const dockerignore = readFileSync(join(repoRoot, '.dockerignore'), 'utf8');
  const dockerNames = new Set(dockerignore
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.replace(/^\*\*\//u, '').replace(/\/$/u, '')));
  let compared = 0;
  for (const raw of gitignore.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    compared += 1;
    const name = line.replace(/^\*\*\//u, '').replace(/\/$/u, '');
    if (dockerNames.has(name) || dockerNames.has(name.replace(/^\//u, ''))) {
      continue;
    }
    if (dockerignoreExempt.has(line)) {
      continue;
    }
    errors.push(
      `.dockerignore: \`${line}\` is excluded from git and not from the build `
      + 'context. Docker does not read .gitignore, so a name in one file and not '
      + 'the other is either bulk nobody meant to upload or a secret nobody meant '
      + 'to send. Exclude it, or say here why it belongs in the context.',
    );
  }
  if (compared === 0) {
    errors.push('.gitignore excluded nothing, so the build-context comparison passed over nothing.');
  }
}

// --- Package manager: pinned with an integrity hash -------------------------

const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const packageManager = packageJson.packageManager;
if (typeof packageManager !== 'string' || !/\+sha(?:224|256|384|512)\.[0-9a-f]+$/u.test(packageManager)) {
  errors.push(
    'package.json: packageManager must carry an integrity hash, '
    + 'so corepack verifies what it downloaded rather than trusting the version alone.',
  );
}

// --- The install-script exception stays recorded ----------------------------

const ciWorkflow = readFileSync(join(workflowDir, 'ci.yml'), 'utf8');
if (!/install scripts?/iu.test(ciWorkflow)) {
  // ADR 0122 Y1 keeps install scripts enabled because native modules need
  // them, and requires the exception to be written down where it applies
  // rather than remembered.
  errors.push(
    '.github/workflows/ci.yml: the enabled-install-scripts exception is not recorded.',
  );
}

/**
 * ADR 0122 Y2. Actions that need permissions their name does not suggest.
 *
 * Build provenance needs an OIDC token and somewhere to record the result, and
 * a job that merely publishes has neither by default. The failure is quiet in
 * the worst way: without `id-token` the step dies with "Unable to get
 * ACTIONS_ID_TOKEN_REQUEST_URL", which reads like an infrastructure fault
 * rather than a permission the workflow never asked for. Without
 * `attestations` it fails later, after the image is already published.
 *
 * Y2 could not be exercised before it shipped - a pull request does not
 * publish, so the first real run was its first proof, and that run found
 * exactly this. The check exists so the second one is not also the proof.
 */
const permissionHungryActions = [
  {
    action: 'actions/attest-build-provenance',
    required: ['id-token: write', 'attestations: write'],
  },
];

for (const entry of readdirSync(workflowDir)) {
  if (!entry.endsWith('.yml') && !entry.endsWith('.yaml')) {
    continue;
  }
  const path = join(workflowDir, entry);
  const content = readFileSync(path, 'utf8');

  for (const { action, required } of permissionHungryActions) {
    if (!content.includes(`uses: ${action}`)) {
      continue;
    }
    // The job's own block, because a workflow-level grant would hand the
    // permission to every job, including the one that only verifies.
    const job = jobContaining(content, `uses: ${action}`);
    for (const permission of required) {
      if (job === null || !grantsPermission(job, permission)) {
        errors.push(
          `${relative(repoRoot, path)}: the job using ${action} does not grant `
          + `${permission}. Without it the attestation fails on the run that `
          + 'publishes, which is the one run nobody can repeat cheaply.',
        );
      }
    }
  }
}

/**
 * Whether a job block grants a permission as a key, rather than mentioning it.
 *
 * A key on its own line, not a substring. The workflow explains both
 * permissions in a comment a few lines above the block that grants them, and a
 * substring match is satisfied by the explanation - which is how this check
 * first passed against a workflow that granted neither, the same way prose in
 * a comment once satisfied the offline-floor import scan.
 */
function grantsPermission(job, permission) {
  const separator = permission.indexOf(':');
  const name = permission.slice(0, separator).trim();
  const value = permission.slice(separator + 1).trim();
  const pattern = new RegExp(`^\\s+${name}:\\s*${value}\\s*$`, 'u');
  return job
    .split('\n')
    .some((line) => !line.trimStart().startsWith('#') && pattern.test(line));
}

/**
 * The text of the job a line belongs to.
 *
 * A targeted reader rather than a YAML dependency, in the tradeoff the other
 * check scripts make: jobs are two-space keys under `jobs:`, so the block runs
 * from that key to the next one at the same indent.
 */
function jobContaining(content, needle) {
  const lines = content.split('\n');
  const at = lines.findIndex((line) => line.includes(needle));
  if (at === -1) {
    return null;
  }
  const isJobKey = (line) => /^ {2}[A-Za-z0-9_-]+:\s*$/u.test(line);
  let start = at;
  while (start > 0 && !isJobKey(lines[start])) {
    start -= 1;
  }
  let end = start + 1;
  while (end < lines.length && !isJobKey(lines[end])) {
    end += 1;
  }
  return lines.slice(start, end).join('\n');
}

/**
 * ADR 0122 Y2. A build with no provenance may not look like one that has it.
 *
 * GitHub refuses to store an attestation for a user-owned private repository,
 * so the step is conditional. That is a defensible answer to a platform limit
 * - failing every push would make a wall out of a gate - but a conditional
 * step is invisible when it does not run, and "no attestation" would then be
 * indistinguishable from "attestation succeeded" to anyone reading the run.
 *
 * So: if the attestation is conditional, the workflow must also say so where a
 * person meets it. Same rule as the enabled-install-scripts exception above,
 * and for the same reason - an exception nobody records is an exception nobody
 * remembers.
 */
if (/uses: actions\/attest-build-provenance/u.test(ciWorkflow)) {
  const attestStep = /- name: Attest build provenance\n\s+if: ([^\n]*)\n/u.exec(ciWorkflow);
  const conditional = attestStep !== null && /repository\.private/u.test(attestStep[1]);
  const recorded = /not attested/iu.test(ciWorkflow);
  if (conditional && !recorded) {
    errors.push(
      ".github/workflows/ci.yml: build provenance is skipped for private "
      + "repositories and the skip is not reported. A build without an "
      + "attestation must not read like one that has it.",
    );
  }
}

if (errors.length > 0) {
  console.error('Workflow pinning check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Workflow pinning check passed (${workflowsRead} workflows, ${actionsPinned} action`
  + ` references, ${dockerFilesRead} docker files; every reference a commit SHA).`,
);
