import type { PicoActionArgument } from '@pico/protocol/action';
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

/**
 * ADR 0136 with ADR 0129 SR6. Stops a supplier, and forgets nothing.
 *
 * **What was derived stays.** A person taking a library back is taking back
 * the library, not what Pico read out of it - those are ordinary memory items
 * under ordinary custody. A supplier the depot still declares is offered
 * again afterwards, because this took back the answer rather than the question.
 */
export async function detachPicoCompanionSupplier(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  identifier: string;
}): Promise<void> {
  const answer = await input.livingDeviceLinkClient.request('home.supplier.detach', {
    identifier: input.identifier,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `supplier_detach_${answer.outcome}`);
  }
}

/**
 * ADR 0143 DP8. Takes back "this material may be here", and the files with it.
 *
 * The working copy goes on the Home's side, immediately rather than at the
 * next boot sweep: until then it is executable code on disk that no attachment
 * stands behind.
 */
export async function detachPicoCompanionDepot(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  remote: string;
}): Promise<void> {
  const answer = await input.livingDeviceLinkClient.request('home.depot.detach', {
    remote: input.remote,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `depot_detach_${answer.outcome}`);
  }
}

/**
 * ADR 0143 DP3. A supplier a fetched depot brings, which nobody has accepted.
 *
 * `needs` comes from the Home rather than being known here, because what a
 * depot may not supply is the Home's rule and a second copy of it on this side
 * would be a second thing to keep true.
 */
export interface PicoCompanionDeclaredSupplierView {
  identifier: string;
  kind: string;
  remote: string;
  needs: readonly string[];
}

/**
 * ADR 0138 CO3/CO4 with ADR 0143 DP3. Both halves, in one read.
 *
 * **Declared and attached are two states, not one absence** (ADR 0117 X1).
 * This returned only the attached ones, and there was no way to make one - so
 * the answer was the empty list on every real Home and the window's section
 * hid itself while a depot's suppliers sat on disk.
 */
export async function readPicoCompanionSuppliers(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
}): Promise<{
  suppliers: readonly PicoCompanionSupplierView[];
  declared: readonly PicoCompanionDeclaredSupplierView[];
}> {
  const read = await input.livingDeviceLinkClient.request('home.suppliers.read', {});
  if (read.outcome !== 'ok') {
    throw new Error(`suppliers_read_rejected:${read.outcome}`);
  }
  const result = read.result as { suppliers?: unknown; declared?: unknown };
  if (!Array.isArray(result.suppliers) || !Array.isArray(result.declared)) {
    throw new Error('invalid_pico_suppliers_read');
  }
  return {
    suppliers: Object.freeze(result.suppliers as PicoCompanionSupplierView[]),
    declared: Object.freeze(result.declared as PicoCompanionDeclaredSupplierView[]),
  };
}

/**
 * ADR 0143 DP3 with ADR 0137 IN5. The person says where this supplier's
 * material belongs, which is what attaches it.
 *
 * Only the identifier and the domain travel. Everything else was declared by
 * the depot and is read there, so there is nothing here for this side to
 * overstate.
 */
export async function attachPicoCompanionSupplier(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  identifier: string;
  privacyDomain: string;
}): Promise<{ identifier: string; privacyDomain: string }> {
  const answer = await input.livingDeviceLinkClient.request('home.supplier.attach', {
    identifier: input.identifier,
    privacyDomain: input.privacyDomain,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `supplier_attach_${answer.outcome}`);
  }
  const result = answer.result as { identifier?: unknown; privacyDomain?: unknown };
  if (typeof result.identifier !== 'string' || typeof result.privacyDomain !== 'string') {
    throw new Error('invalid_pico_supplier_attach_result');
  }
  return { identifier: result.identifier, privacyDomain: result.privacyDomain };
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
  /**
   * ADR 0143 DP1. Das Zustandswort des Depot-Moduls, nicht eines von hier.
   *
   * Es reist als Wort und nicht als Satz: was eine Person liest, entscheidet
   * die Fläche. Bis zum 2026-08-25 reiste es gar nicht - `picoDepotState` war
   * gebaut, geprüft und im laufenden Produkt unerreicht.
   */
  state: string;
  /** Gesetzt, wenn ein neuerer Commit auf eine Person wartet. */
  offeredCommit?: string;
}

/**
 * ADR 0140 RL4 mit ADR 0143 DP8. Ob ein planmäßiger Lauf ohne Anwesende
 * handeln darf, und in welcher Domäne der Home das entscheidet.
 *
 * Die Domäne kommt mit dem Lesevorgang, statt hier zu stehen: ADR 0143 DP6
 * sagt, ein Depot lebt in keinem Raum, und welchen der Home für RL6 wählt, ist
 * seine Sache. Ein Client, der ihn mitschriebe, wäre die zweite Stelle, an der
 * er steht - und die, die abweichen kann.
 */
export interface PicoCompanionUnattendedFetching {
  effectName: string;
  privacyDomain: string;
  decision?: 'allow' | 'require_approval' | 'deny';
}

export async function readPicoCompanionDepots(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
}): Promise<{
  depots: readonly PicoCompanionDepotView[];
  unattendedFetching: PicoCompanionUnattendedFetching;
}> {
  const read = await input.livingDeviceLinkClient.request('home.depots.read', {});
  if (read.outcome !== 'ok') {
    throw new Error(`depots_read_rejected:${read.outcome}`);
  }
  const result = read.result as { depots?: unknown; unattendedFetching?: unknown };
  if (!Array.isArray(result.depots)
    || typeof result.unattendedFetching !== 'object'
    || result.unattendedFetching === null) {
    throw new Error('invalid_pico_depots_read');
  }
  return Object.freeze({
    depots: Object.freeze(result.depots as PicoCompanionDepotView[]),
    unattendedFetching: result.unattendedFetching as PicoCompanionUnattendedFetching,
  });
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

/**
 * ADR 0140 RL4. Zeichnet auf, was eine Anfrage nach diesem Effekt beantwortet.
 *
 * Die Domäne kommt vom Home und wird hier durchgereicht: welchen Raum er für
 * einen Effekt nennt, ist seine Sache, und ein Client, der sie mitschriebe,
 * wäre die zweite Stelle, an der sie steht.
 */
export async function decidePicoCompanionRule(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  effectName: string;
  privacyDomain: string;
  decision: 'allow' | 'require_approval' | 'deny';
}): Promise<void> {
  const answer = await input.livingDeviceLinkClient.request('home.rule.decide', {
    effectName: input.effectName,
    privacyDomain: input.privacyDomain,
    decision: input.decision,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `rule_decide_${answer.outcome}`);
  }
}

/** ADR 0140 RL4. Nimmt eine Regel zurück, so dass wieder keine gilt. */
export async function forgetPicoCompanionRule(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  effectName: string;
  privacyDomain: string;
}): Promise<void> {
  const answer = await input.livingDeviceLinkClient.request('home.rule.forget', {
    effectName: input.effectName,
    privacyDomain: input.privacyDomain,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `rule_forget_${answer.outcome}`);
  }
}

/**
 * ADR 0143 DP1. Nimmt ein Angebot an, indem sie seinen Commit nennt.
 *
 * Der Commit wird mitgeschickt und nicht vom Home erraten: was hier zugesagt
 * wird, ist Code, der ausgeführt wird, und „ja zu dieser Revision" ist etwas
 * anderes als „ja zu dem, was gerade das Neueste ist". Ein Fetch zwischen der
 * Frage und der Antwort wird dadurch zu einer Ablehnung statt zu einer
 * stillen Zustimmung.
 */
export async function acceptPicoCompanionDepotOffer(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  remote: string;
  acceptedCommit: string;
}): Promise<{ remote: string; commit: string }> {
  const answer = await input.livingDeviceLinkClient.request('home.depot.offer.accept', {
    remote: input.remote,
    acceptedCommit: input.acceptedCommit,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `depot_offer_accept_${answer.outcome}`);
  }
  const result = answer.result as { remote?: unknown; commit?: unknown };
  if (typeof result.remote !== 'string' || typeof result.commit !== 'string') {
    throw new Error('invalid_pico_depot_offer_accept_result');
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
  /**
   * ADR 0141 RN3's data layer, on a question that is still waiting (Befund
   * B37, 2026-09-01). Was ausgefuehrt wird, als beschriftete Daten - nie im
   * Satz, damit kein fremder Wert eine Bestaetigung etwas sagen lassen kann.
   * Zwei Depots unterscheiden sich hier und sonst nirgends.
   */
  arguments: readonly PicoActionArgument[];
  /** True, wenn eines dieser Argumente von ausserhalb dieses Picos kam. */
  carriesExternalContent: boolean;
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
