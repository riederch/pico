/**
 * The protocol values this dashboard needs **at runtime**, declared locally.
 *
 * The dashboard is served as plain ES modules: `index.html` loads
 * `./dist/main.js` and `tsc` emits imports verbatim, with no bundler and no
 * import map. A bare specifier like `@pico/protocol` therefore does not resolve
 * in the browser at all - it fails the whole module graph with
 * "Failed to resolve module specifier", so the page renders and nothing works.
 *
 * That is not a hypothetical: it is what this file fixes. The unit tests run
 * under Node, where `@pico/protocol` resolves through `node_modules`, and the
 * CI smoke test only greps the served HTML for a title - so both stayed green
 * while the dashboard's JavaScript had not executed in a browser.
 *
 * **Type-only imports are unaffected** and stay as they are: they are erased
 * before anything is emitted, so they cost the browser nothing. Only values
 * have to be declared here.
 *
 * `protocol-values.test.ts` binds every constant below to the protocol's own,
 * which is what stops a local copy from becoming a second source of truth -
 * the same arrangement the companion's renderer contract already uses for the
 * ADR 0118 floor families, and for the same reason.
 */
export const realtimeMessageType = {
  coreConnected: 'pico.core.connected',
  eventCreated: 'pico.event.created',
} as const;

export const memoryRetentionModes = [
  'keep_until_deleted',
  'delete_after_max_age',
] as const;

export const picoHomeClaimStates = [
  'unclaimed',
  'claimed',
] as const;
