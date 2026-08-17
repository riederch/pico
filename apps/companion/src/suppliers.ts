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

/**
 * ADR 0139 AC4. What a part of Pico says it will do, waiting for a person.
 *
 * `declares` carries the sentences rather than the effect names, because the
 * names are Pico's vocabulary and the sentences are what somebody agrees to.
 */
export interface PicoCompanionModuleConsentView {
  identifier: string;
  drift: { added: readonly string[]; removed: readonly string[]; changed: readonly string[] };
  declares: ReadonlyArray<{ name: string; description: string; risk: string }>;
}

export async function readPicoCompanionModuleConsent(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
}): Promise<readonly PicoCompanionModuleConsentView[]> {
  const read = await input.livingDeviceLinkClient.request('home.modules.consent.read', {});
  if (read.outcome !== 'ok') {
    throw new Error(`module_consent_read_rejected:${read.outcome}`);
  }
  const awaiting = (read.result as { awaiting?: unknown }).awaiting;
  if (!Array.isArray(awaiting)) {
    throw new Error('invalid_pico_module_consent_read');
  }
  return Object.freeze(awaiting as PicoCompanionModuleConsentView[]);
}

/**
 * ADR 0139 AC4. The person agrees to what one module declares.
 *
 * Only the identifier travels. The sentences a person read came from the
 * Home's own manifest and the record is written from that same manifest, so
 * there is nothing here for this side to get wrong or to overstate.
 */
export async function recordPicoCompanionModuleConsent(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  identifier: string;
}): Promise<void> {
  const answer = await input.livingDeviceLinkClient.request('home.modules.consent.record', {
    identifier: input.identifier,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `module_consent_${answer.outcome}`);
  }
}

/**
 * ADR 0141 RN4. A question this Home is holding for the session in front of it.
 *
 * `expiresAt` is carried rather than a remaining duration, because a duration
 * computed here would be this device's clock deciding when a question the Home
 * is holding runs out.
 */
export interface PicoCompanionPendingApproval {
  requestedEventId: string;
  prompt: string;
  risk: string;
  expiresAt: string;
}

/**
 * ADR 0143 DP8. A person asking for a fetch now.
 *
 * Returns what came back whole, including the standing precondition that
 * stopped it. A caller that only saw a count could not tell "everything is
 * already current" from "nobody has agreed this may happen at all", and the
 * second is the one a person can do something about.
 */
export async function askPicoCompanionDepotFetch(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  presenceSessionId: string;
}): Promise<{
  requested: number;
  blocked?: string;
  waiting: readonly PicoCompanionPendingApproval[];
}> {
  const answer = await input.livingDeviceLinkClient.request('home.depot.fetch.ask', {
    presenceSessionId: input.presenceSessionId,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `depot_fetch_ask_${answer.outcome}`);
  }
  const result = answer.result as {
    requested?: unknown;
    blocked?: unknown;
    waiting?: unknown;
  };
  if (typeof result.requested !== 'number' || !Array.isArray(result.waiting)) {
    throw new Error('invalid_pico_depot_fetch_ask_result');
  }
  return {
    requested: result.requested,
    ...(typeof result.blocked === 'string' ? { blocked: result.blocked } : {}),
    waiting: Object.freeze(result.waiting as PicoCompanionPendingApproval[]),
  };
}

/** ADR 0141 RN4. What is still waiting, for the session that was asked. */
export async function readPicoCompanionPendingApprovals(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  presenceSessionId: string;
}): Promise<readonly PicoCompanionPendingApproval[]> {
  const read = await input.livingDeviceLinkClient.request('home.action.approval.read', {
    presenceSessionId: input.presenceSessionId,
  });
  if (read.outcome !== 'ok') {
    throw new Error(`approval_read_rejected:${read.outcome}`);
  }
  const waiting = (read.result as { waiting?: unknown }).waiting;
  if (!Array.isArray(waiting)) {
    throw new Error('invalid_pico_approval_read');
  }
  return Object.freeze(waiting as PicoCompanionPendingApproval[]);
}

/**
 * ADR 0141 RN4. The answer, in the session the question was asked in.
 *
 * `approved` is required here even though the Home accepts it absent: an
 * absent answer is what the *window running out* means, and a device sending
 * it would be claiming a person went quiet at a moment of its own choosing.
 */
export async function resolvePicoCompanionApproval(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  requestedEventId: string;
  presenceSessionId: string;
  approved: boolean;
}): Promise<{ outcome: string; ran: boolean; succeeded?: boolean }> {
  const answer = await input.livingDeviceLinkClient.request('home.action.approval.resolve', {
    requestedEventId: input.requestedEventId,
    presenceSessionId: input.presenceSessionId,
    approved: input.approved,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `approval_resolve_${answer.outcome}`);
  }
  const result = answer.result as { outcome?: unknown; ran?: unknown; succeeded?: unknown };
  if (typeof result.outcome !== 'string' || typeof result.ran !== 'boolean') {
    throw new Error('invalid_pico_approval_resolve_result');
  }
  return {
    outcome: result.outcome,
    ran: result.ran,
    ...(typeof result.succeeded === 'boolean' ? { succeeded: result.succeeded } : {}),
  };
}
