/**
 * Route access classes (ADR 0075 A2, route table in ADR 0076).
 *
 * Every route above `public` resolves to exactly one class. Authority comes
 * from local host access, the founding Home Host Pico, and domain readership;
 * none implies either of the others.
 * Administration is not readership (ADR 0075 A7) — the ADR 0024 host-admin
 * boundary, enforced here for both operator and identity principals.
 *
 * The registry is the enforcement mechanism, not a checklist: `assertClassified`
 * runs at route registration, so a Foundation API route added without a class
 * fails at boot instead of shipping open (ADR 0075 A2/A3).
 */

export const accessClasses = [
  // No authority required.
  'public',
  // Only while no operator exists.
  'setup-bootstrap',
  // Static token where configured, or an operator session.
  'foundation-diagnostic',
  // Any authenticated principal, no role required.
  'authenticated',
  // Authenticated principal with readership of the domain. Gate C; unused.
  'domain-content',
  // Operator role. The static token never reaches this.
  'host-admin',
  // Operator role plus explicit confirmation of the exact target.
  'host-admin-destructive',
  // Signed Home-authority evidence may be relayed by the exact Home-bound
  // operator fallback or by the active founding Home Host Pico. The route
  // handler still verifies the evidence signature before changing state.
  'home-authority-relay',
  // ADR 0107: the Pico Link Direct intake. Deliberately carries no session and
  // no token - authentication is inside the envelope, where a signature binds
  // the sender, the audience and the arguments together. That is what lets
  // this one route be reachable while every class above it stays local: the
  // intake exposes envelopes and nothing else.
  'link-intake',
] as const;

export type AccessClass = typeof accessClasses[number];

/** Classes the principal-less static token may satisfy (ADR 0075: its ceiling). */
export const staticTokenCeiling: readonly AccessClass[] = ['public', 'foundation-diagnostic'];

export const FOUNDATION_API_PREFIX = '/api/';

export interface RouteKey {
  method: string;
  url: string;
}

/**
 * Route-to-class registry. Keys are Fastify route patterns, so a route is
 * classified by its declaration and not by a request-time path guess.
 */
export class AccessClassRegistry {
  private readonly classes = new Map<string, AccessClass>();

  public register(method: string, url: string, accessClass: AccessClass): void {
    this.classes.set(routeKey(method, url), accessClass);
  }

  public lookup(method: string, url: string): AccessClass | undefined {
    const direct = this.classes.get(routeKey(method, url));

    if (direct !== undefined) {
      return direct;
    }

    // Fastify exposes a HEAD route for every GET route. It serves the same
    // resource, so it inherits the GET class rather than being classified
    // twice — but a HEAD route without a GET still fails closed.
    if (method.toUpperCase() === 'HEAD') {
      return this.classes.get(routeKey('GET', url));
    }

    return undefined;
  }

  /**
   * Fails closed for an unclassified Foundation API route. Called from Fastify's
   * `onRoute` hook, this turns "someone added a route and forgot the class" into
   * a boot failure rather than an open endpoint.
   */
  public assertClassified(method: string, url: string): void {
    if (!isFoundationApiRoute(url)) {
      return;
    }

    if (this.lookup(method, url) === undefined) {
      throw new Error(
        `Foundation API route ${method} ${url} has no access class. `
        + 'Register one in the access-class registry (ADR 0075 A2) before serving it.',
      );
    }
  }
}

export function isFoundationApiRoute(url: string): boolean {
  return url.startsWith(FOUNDATION_API_PREFIX);
}

/**
 * The confirmation field an irreversible operation must carry (ADR 0075 A8).
 * Its value must be the exact name of the thing being destroyed, so a
 * mis-addressed request cannot destroy the wrong one: the target in the URL and
 * the name in the body have to agree.
 */
export const DESTRUCTIVE_CONFIRM_FIELD = 'confirm';

function routeKey(method: string, url: string): string {
  return `${method.toUpperCase()} ${url}`;
}
