/**
 * Which companion-shell files run inside the Electron window.
 *
 * Named once, here, because two checks need the same answer and for two
 * different reasons - and a list of filenames written twice is the shape of
 * defect both of those checks exist to catch.
 *
 * The window loads plain ESM under a `script-src 'self'` policy, so renderer-
 * reachable files resolve relative paths only: a bare `@pico/...` specifier
 * there compiles, passes every test, and breaks the window at runtime. That
 * makes the window unable to reach a shared rendering rule, which is why it
 * must not render - ADR 0113 C2 hands it presentation state already rendered,
 * and the main process is where the deciding belongs.
 */
export const rendererReachableFiles = new Set([
  'apps/companion-shell/src/contract.ts',
  'apps/companion-shell/src/renderer.ts',
  'apps/companion-shell/src/model-provider-views.ts',
]);
