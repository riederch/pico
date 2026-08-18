import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Browser-loaded module graphs resolve no bare specifiers.
 *
 * Two surfaces here are served as plain ES modules - the Foundation dashboard
 * and the companion renderer. `tsc` emits import specifiers verbatim, nothing
 * bundles them and no import map exists, so a bare `@pico/protocol` fails with
 * "Failed to resolve module specifier" and takes the entire module graph with
 * it. The page still renders its HTML and CSS, which is what makes this
 * failure quiet.
 *
 * It was quiet. The dashboard shipped that way: its unit tests run under Node,
 * where the specifier resolves through `node_modules`, and the container smoke
 * test greps the served HTML for a title without loading a script. Both were
 * green while none of the dashboard's JavaScript had executed in a browser.
 *
 * Type-only imports are not walked and not flagged - they are erased before
 * anything is emitted, so they cost the browser nothing. Only values matter,
 * and a surface needing a protocol value declares it locally with a test
 * binding it to the protocol.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

/**
 * Each entry names where the browser is told to start, so a changed `src`
 * attribute fails here rather than leaving this check quietly inspecting a
 * file nobody loads.
 */
const surfaces = [
  {
    html: join(repoRoot, 'apps', 'web', 'index.html'),
    expectSrc: './dist/main.js',
    entry: join(repoRoot, 'apps', 'web', 'src', 'main.ts'),
  },
  {
    html: join(repoRoot, 'apps', 'companion-shell', 'src', 'renderer', 'index.html'),
    expectSrc: '../renderer.js',
    entry: join(repoRoot, 'apps', 'companion-shell', 'src', 'renderer.ts'),
  },
];

const typeOnly = /(?:^|[^\w$])(?:import|export)\s+type\s[^'"]*$/u;
const importPattern = /(?:^|[^\w$])(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/gu;

function valueImportsOf(source) {
  const specifiers = [];
  for (const match of source.matchAll(importPattern)) {
    const preceding = source.slice(0, match.index + match[0].length - match[1].length - 2);
    if (typeOnly.test(preceding)) {
      continue;
    }
    /**
     * No module specifier contains whitespace, and English does.
     *
     * The pattern reads a file as text, which is what makes it cheap and
     * proof against every syntax TypeScript grows. It also reads prose: a
     * comment ending "...could not follow the chain from" and a sentence
     * saying `tell "they moved out" from "we had a problem"` both parse as
     * `from '...'` and were both reported as imports of nothing. Skipping
     * whitespace hides no real import and stops the check from being a
     * constraint on how sentences may end.
     */
    if (/\s/u.test(match[1])) {
      continue;
    }
    specifiers.push(match[1]);
  }
  return specifiers;
}

function resolveRelative(specifier, fromFile) {
  const base = resolve(dirname(fromFile), specifier).replace(/\.js$/u, '');
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

for (const surface of surfaces) {
  const html = readFileSync(surface.html, 'utf8');
  if (!html.includes(`src="${surface.expectSrc}"`)) {
    errors.push(
      `${relative(repoRoot, surface.html)}: expected a module script at `
      + `${surface.expectSrc}; this check would otherwise inspect a file the `
      + 'browser does not load.',
    );
    continue;
  }

  const seen = new Set();
  const queue = [surface.entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const specifier of valueImportsOf(source)) {
      if (!specifier.startsWith('.')) {
        errors.push(
          `${relative(repoRoot, file)}: value import of ${specifier} reaches the `
          + 'browser, where a bare specifier does not resolve. Declare the value '
          + 'locally and bind it to the protocol with a test, or make the import '
          + 'type-only.',
        );
        continue;
      }
      const resolved = resolveRelative(specifier, file);
      if (resolved !== null) {
        queue.push(resolved);
      }
    }
  }
}

if (errors.length > 0) {
  console.error('Browser module check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Browser module check passed.');
