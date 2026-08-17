import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';

/**
 * ADR 0138 CO3/CO4 on the device - the two decisions that stand between an
 * attached supplier and one reaching out.
 *
 * They were unreachable until 2026-08-17: the columns and the check existed
 * and nothing could set them, so *off* was not a default anybody could move
 * from. This is the half that lets a person move.
 *
 * The decision belongs here rather than in the Foundation dashboard because it
 * is about spending their money and telling somebody they asked, which ADR
 * 0087 keeps out of administration's hands and ADR 0113 puts on the device
 * they hold.
 */
export interface PicoCompanionSupplierView {
  identifier: string;
  kind: string;
  mayReachOutside: boolean;
  mayReachUnasked: boolean;
  attachedAt: string;
}

export async function readPicoCompanionSuppliers(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
}): Promise<readonly PicoCompanionSupplierView[]> {
  const read = await input.livingDeviceLinkClient.request('home.suppliers.read', {});
  if (read.outcome !== 'ok') {
    throw new Error(`suppliers_read_rejected:${read.outcome}`);
  }
  const suppliers = (read.result as { suppliers?: unknown }).suppliers;
  if (!Array.isArray(suppliers)) {
    throw new Error('invalid_pico_suppliers_read');
  }
  return Object.freeze(suppliers as PicoCompanionSupplierView[]);
}

/**
 * ADR 0138 CO3/CO4. Both answers in one call, because the second depends on
 * the first.
 *
 * **Turning reaching off takes the unasked permission with it.** The database
 * refuses the pair otherwise, and more to the point a person switching off
 * "may reach out" has plainly not meant "but keep doing it unprompted" - so
 * the caller does not get to send that combination by forgetting.
 */
export async function decidePicoCompanionSupplierReach(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  identifier: string;
  mayReachOutside: boolean;
  mayReachUnasked: boolean;
}): Promise<void> {
  const mayReachUnasked = input.mayReachOutside && input.mayReachUnasked;
  const answer = await input.livingDeviceLinkClient.request('home.supplier.reach.decide', {
    identifier: input.identifier,
    mayReachOutside: input.mayReachOutside,
    mayReachUnasked,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `supplier_reach_${answer.outcome}`);
  }
}

/**
 * ADR 0143 DP1. A depot: where supplier code comes from, pinned at a commit.
 *
 * Beside the supplier reader rather than in its own module, because a person
 * answering "may Pico go and get this, and unasked?" is answering one question
 * about two kinds of thing. ADR 0136's supplier holds material and ADR 0143's
 * depot holds what runs - a distinction that matters to the tree and not to
 * the money.
 */
export interface PicoCompanionDepotView {
  remote: string;
  commit: string;
  mayFetch: boolean;
  mayFetchUnasked: boolean;
  acceptedAt: string;
}

export async function readPicoCompanionDepots(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
}): Promise<readonly PicoCompanionDepotView[]> {
  const read = await input.livingDeviceLinkClient.request('home.depots.read', {});
  if (read.outcome !== 'ok') {
    throw new Error(`depots_read_rejected:${read.outcome}`);
  }
  const depots = (read.result as { depots?: unknown }).depots;
  if (!Array.isArray(depots)) {
    throw new Error('invalid_pico_depots_read');
  }
  return Object.freeze(depots as PicoCompanionDepotView[]);
}

/**
 * ADR 0143 DP1. Says this material may be here, and nothing more.
 *
 * The pin travels as the caller wrote it. A client that rebuilt it from named
 * fields would drop a `branch` on the floor and turn "I want you to track
 * main" into "you mistyped a commit", which is the one refusal ADR 0143 wants
 * a person to actually read.
 */
export async function attachPicoCompanionDepot(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  pin: Record<string, unknown>;
}): Promise<{ remote: string; commit: string }> {
  const answer = await input.livingDeviceLinkClient.request('home.depot.attach', input.pin);
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `depot_attach_${answer.outcome}`);
  }
  const result = answer.result as { remote?: unknown; commit?: unknown };
  if (typeof result.remote !== 'string' || typeof result.commit !== 'string') {
    throw new Error('invalid_pico_depot_attach_result');
  }
  return { remote: result.remote, commit: result.commit };
}

/** ADR 0138 CO3/CO4 for a depot. Switching fetching off takes unasked with it. */
export async function decidePicoCompanionDepotReach(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  remote: string;
  mayFetch: boolean;
  mayFetchUnasked: boolean;
}): Promise<void> {
  const answer = await input.livingDeviceLinkClient.request('home.depot.reach.decide', {
    remote: input.remote,
    mayFetch: input.mayFetch,
    mayFetchUnasked: input.mayFetch && input.mayFetchUnasked,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `depot_reach_${answer.outcome}`);
  }
}
