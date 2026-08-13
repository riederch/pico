/**
 * ADR 0150 PU3. How long one push may be valid for.
 *
 * Held here rather than imported from the companion, because both ends need
 * it and neither may depend on the other: a Home that imported a device
 * module would be a Home shipping device code, and the reverse would be
 * worse. The two are checked against each other by
 * `scripts/check-push-lifetime.mjs` - one number, two places that must agree,
 * and a check rather than a hope, since a Home minting pushes longer than a
 * device will honour would send ones that are dead on arrival.
 */
export const maxPicoLinkPushLifetimeMs = 15 * 60 * 1_000;
