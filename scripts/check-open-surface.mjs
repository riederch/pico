import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * What a stranger reaches without any credential, and why each of those is
 * allowed to be there.
 *
 * **The occasion** (2026-09-20, finding B235). Measured: 61 Foundation routes,
 * of which **seven** need nothing. Three are `public`, three are
 * `setup-bootstrap`, one is the Link intake. That is small and deliberate -
 * and it grows by one `accessClasses.register(..., 'public')` that nobody
 * reviews, because nothing holds the set.
 *
 * **Three rules, and each is about what makes its class safe.**
 *
 * `public` is open to anybody, forever. What makes the three that exist
 * acceptable is that they are how somebody *becomes* authenticated - they live
 * under `/api/auth/`. A public route that is not about acquiring a credential
 * is a different decision and has to be argued as one.
 *
 * `setup-bootstrap` is open only while a Home has nobody: the request hook
 * scopes each one to "no operator yet" or "not claimed yet", and an unscoped
 * one falls to a 500 with *"setup-bootstrap route is not scoped"*. That fails
 * closed, which is right, and it fails **when somebody calls it** - so a route
 * registered and forgotten is a feature that is dead rather than a hole that
 * is open. This check moves that discovery to the chain by requiring every
 * such route to be named in the hook, and every name in the hook to be such a
 * route.
 *
 * `link-intake` is authenticated one layer in, inside a sealed envelope, and
 * there is exactly one of it: the path the intake listener forwards.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const ts = createRequire(import.meta.url)('typescript');
import { picoRegisteredRoutes, picoStringConstants } from './registered-routes.mjs';
const appPath = join('apps', 'core', 'src', 'app.ts');
const text = readFileSync(join(repoRoot, appPath), 'utf8');
const source = ts.createSourceFile(appPath, text, ts.ScriptTarget.Latest, true);

const errors = [];
const failures = errors;

/** A route that needs no credential and is not about acquiring one. */
const argued = [
  {
    method: 'GET',
    route: '/api/home/link/continuity',
    why: 'ADR 0115 U4. The unsealed continuity read, deliberately parameterless: a device that '
      + 'lost its Home asks where the Home went, and it cannot prove anything yet because what '
      + 'it would prove with is what it lost. It answers a pointer and never content, and the '
      + 'intake listener refuses it with a query string so the target cannot be widened',
  },
];

const { registrations, unreadable } = picoRegisteredRoutes();
for (const registration of unreadable) {
  errors.push(
    `${appPath} registers an access class this reader cannot resolve: ${registration}. A `
    + 'registration it cannot read is a route it is not holding.',
  );
}

/** The routes the request hook scopes for `setup-bootstrap`, from its own branch. */
const scoped = new Set();
(function scan(node) {
  if (ts.isIfStatement(node)
    && node.expression.getText().replace(/\s+/gu, '') === "accessClass==='setup-bootstrap'") {
    (function collect(inner) {
      if (ts.isStringLiteralLike(inner) && inner.text.startsWith('/api/')) scoped.add(inner.text);
      inner.forEachChild(collect);
    })(node.thenStatement);
  }
  node.forEachChild(scan);
})(source);

if (registrations.length === 0) {
  errors.push(
    `${appPath} registers no access class at all, so this check has nothing to read. A reader `
    + 'that finds nothing passes by having no subject.',
  );
}
if (scoped.size === 0) {
  errors.push(
    `${appPath} has no setup-bootstrap branch this reader can find, so the second rule has no `
    + 'subject.',
  );
}

const open = registrations.filter((entry) => ['public', 'setup-bootstrap', 'link-intake'].includes(entry.accessClass));

for (const entry of open) {
  if (entry.accessClass === 'public' && !entry.route.startsWith('/api/auth/')) {
    const argument = argued.find((one) => one.route === entry.route && one.method === entry.method);
    if (argument === undefined) {
      errors.push(
        `${entry.method} ${entry.route} is public and is not under /api/auth/. Anybody reaches it, `
        + 'forever, and it is not how somebody becomes authenticated. Say here why that is right.',
      );
    }
  }
  if (entry.accessClass === 'setup-bootstrap' && !scoped.has(entry.route)) {
    errors.push(
      `${entry.method} ${entry.route} is setup-bootstrap and the request hook does not scope it. `
      + 'It answers 500 to everybody - a feature that is dead rather than a hole that is open, '
      + 'and nobody learns it until they call it.',
    );
  }
}
for (const route of scoped) {
  if (!open.some((entry) => entry.route === route && entry.accessClass === 'setup-bootstrap')) {
    errors.push(
      `the request hook scopes ${route} as setup-bootstrap and no registration says it is one. A `
      + 'scope for a route that moved reads as protection and is furniture.',
    );
  }
}

const intake = open.filter((entry) => entry.accessClass === 'link-intake');
if (intake.length !== 1) {
  errors.push(
    `${intake.length} routes carry the link-intake class and there is exactly one intake. Each `
    + 'one is a door that authenticates inside the envelope rather than at the door.',
  );
} else if (intake[0].route !== picoStringConstants.get('PICO_LINK_INTAKE_PATH')) {
  errors.push(
    `${intake[0].route} carries the link-intake class and PICO_LINK_INTAKE_PATH is `
    + `${picoStringConstants.get('PICO_LINK_INTAKE_PATH') ?? '(unreadable)'}. The listener forwards one path `
    + 'and the app classes another, so the published door leads to a 404.',
  );
}

if (errors.length > 0) {
  console.error('Open surface check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const counted = (name) => open.filter((entry) => entry.accessClass === name).length;
console.log(
  `Open surface check passed (${registrations.length} classed routes, ${open.length} of them `
  + `reachable without a credential: ${counted('public')} public - ${counted('public') - argued.length} `
  + `of them under /api/auth/, where somebody becomes authenticated, and ${argued.length} argued `
  + `open for another reason; ${counted('setup-bootstrap')} setup-bootstrap, every one scoped by `
  + `the request hook to a Home that has nobody yet; ${counted('link-intake')} intake, `
  + 'authenticated inside its envelope and equal to the path the listener forwards).',
);
