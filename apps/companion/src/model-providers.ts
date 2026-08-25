import {
  picoModelIsReachable,
  picoModelProviderStates,
  type PicoModelProviderState,
} from '@pico/protocol/model-provider-state';
import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';

/**
 * ADR 0152 on the device side of the wire.
 *
 * Three calls over the ADR 0107 direct channel, and one thing worth saying
 * about all three: **the reply is parsed rather than believed.** These
 * operations answer a device from a Home over a sealed envelope, and a
 * companion that trusted the shape would be a companion whose window says
 * whatever arrives.
 *
 * The refusal travels too. ADR 0151 PV4's missing credential arrives as
 * `refusal` beside an `invalid_arguments` outcome, and a device that turned
 * that into "something went wrong" would make the person guess at what their
 * decision needed.
 */

export interface PicoCompanionModelProviderView {
  entryId: string;
  model: string;
  /**
   * ADR 0048 with ADR 0152 SE2. What the finding says this machine is.
   *
   * Carried because the decision restates it: a person confirming where their
   * words may go is confirming *this*, and a device that sent a class it made
   * up would be declaring on their behalf.
   */
  providerClass: string;
  contextTokens: number;
  measuredAt: string;
  decided: boolean;
  sees: string;
  needsCredentialToSeeMore: boolean;
  /**
   * ADR 0152 SE5. Optional: a Home built before this answers without it, and
   * a device that refused the list over a missing word would render an older
   * Home as broken (ADR 0118 O4).
   */
  state?: PicoModelProviderState;
}

function asProviders(value: unknown): readonly PicoCompanionModelProviderView[] {
  const providers = (value as { providers?: unknown }).providers;
  if (!Array.isArray(providers)) {
    throw new Error('invalid_pico_model_providers_result');
  }
  return Object.freeze(providers.map((entry) => {
    const record = entry as Record<string, unknown>;
    if (typeof record.entryId !== 'string'
      || typeof record.model !== 'string'
      || typeof record.providerClass !== 'string'
      || typeof record.contextTokens !== 'number'
      || typeof record.measuredAt !== 'string'
      || typeof record.decided !== 'boolean'
      || typeof record.sees !== 'string'
      || typeof record.needsCredentialToSeeMore !== 'boolean') {
      throw new Error('invalid_pico_model_provider_result');
    }
    // A word this version does not know is dropped rather than carried: it
    // would end up rendered, and an unknown state rendered is a sentence
    // nobody wrote.
    const state = (picoModelProviderStates as readonly string[])
      .includes(record.state as string)
      ? record.state as PicoModelProviderState
      : undefined;
    return Object.freeze({
      entryId: record.entryId,
      model: record.model,
      providerClass: record.providerClass,
      contextTokens: record.contextTokens,
      measuredAt: record.measuredAt,
      decided: record.decided,
      sees: record.sees,
      needsCredentialToSeeMore: record.needsCredentialToSeeMore,
      ...(state === undefined ? {} : { state }),
    });
  }));
}

export async function readPicoCompanionModelProviders(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
}): Promise<readonly PicoCompanionModelProviderView[]> {
  const read = await input.livingDeviceLinkClient.request('home.model.providers.read', {});
  if (read.outcome !== 'ok') {
    throw new Error(`model_providers_read_rejected:${read.outcome}`);
  }
  return asProviders(read.result);
}

/**
 * ADR 0142 PE2. A measurement of one host, while it runs and just after.
 *
 * Read from the same answer the provider list comes from rather than from a
 * route of its own: a measurement and the entry it produces are one subject,
 * and ADR 0119 Q4's stranger budget is sixty requests a minute *shared* - a
 * surface polling its own route while a card works for minutes is what that
 * bound is measured against.
 */
export interface PicoCompanionMeasurementView {
  entryId: string;
  reach: string;
  model: string;
  state: string;
  startedAt: string;
  settledAt?: string;
  refusal?: string;
  notes?: readonly string[];
}

export async function readPicoCompanionMeasurements(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
}): Promise<readonly PicoCompanionMeasurementView[]> {
  const read = await input.livingDeviceLinkClient.request('home.model.providers.read', {});
  if (read.outcome !== 'ok') {
    throw new Error(`model_providers_read_rejected:${read.outcome}`);
  }
  const measurements = (read.result as { measurements?: unknown }).measurements;
  if (!Array.isArray(measurements)) {
    throw new Error('invalid_pico_measurements_read');
  }
  return Object.freeze(measurements as PicoCompanionMeasurementView[]);
}

/**
 * ADR 0048's sixth class, and the only one a typed address can be.
 *
 * **A bare inference host is `declared_own_host` or it is nothing.** The other
 * five classes describe runtimes Pico itself mediates - the same device, a
 * Home, a Vault, a Pico endpoint, a cloud connector reached through one - and
 * none of them is a machine somebody names by address. So the declaration is
 * not a field with options; it is the precondition, and a person who will not
 * make it has not chosen a different class but named a machine Pico has no
 * class for.
 *
 * ADR 0152 keeps that declaration in front of the disclosure rather than
 * behind it, which is why this is a sentence in the surface rather than a
 * default in the code.
 */
export const picoCompanionMeasurableProviderClass = 'declared_own_host';

/**
 * ADR 0142 PE1/PE2. Points the Home at a host and asks what it can do.
 *
 * Returns when the work *starts*. Measuring is minutes on a real card, so the
 * caller learns the entry identifier and watches the measurement list; a call
 * that waited would hold a socket open across somebody's whole benchmark.
 */
export async function askPicoCompanionModelProviderMeasurement(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  reach: string;
  model: string;
  /**
   * ADR 0151 PV1. What the credential this measurement sends is called.
   *
   * A host behind an authenticating proxy refuses every probe a measurement
   * makes, so measuring one at all means measuring it the way a job reaches
   * it. The name is required whenever a secret is sent and sufficient on its
   * own afterwards.
   */
  credentialRef?: string;
  /**
   * The secret itself, on a first measurement only.
   *
   * **Sent here because there is nowhere earlier to send it.** The Home seals
   * a credential against an entry, and an entry exists only once a
   * measurement has written one - so a host that has never been measured
   * cannot have a credential filed for it in advance. The Home seals this
   * after the entry lands; a later measurement names `credentialRef` and
   * sends no secret, and nothing here keeps a copy to send twice.
   */
  credential?: string;
}): Promise<{ entryId: string; state: string }> {
  const answer = await input.livingDeviceLinkClient.request('home.model.provider.measure.ask', {
    reach: input.reach,
    model: input.model,
    providerClass: picoCompanionMeasurableProviderClass,
    ...(input.credentialRef === undefined ? {} : { credentialRef: input.credentialRef }),
    ...(input.credential === undefined ? {} : { credential: input.credential }),
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `measure_ask_${answer.outcome}`);
  }
  const result = answer.result as { entryId?: unknown; state?: unknown };
  if (typeof result.entryId !== 'string' || typeof result.state !== 'string') {
    throw new Error('invalid_pico_measure_ask_result');
  }
  return { entryId: result.entryId, state: result.state };
}

/**
 * ADR 0118 O4. Whether the model this person decided on is answering.
 *
 * **Only decided entries count.** A measured machine nobody chose is not a
 * model this Home uses, and letting it raise `no_model` would put a standing
 * absence on a Home that is working exactly as its owner set it up.
 *
 * `undefined` is the third answer and it is load-bearing: no decided provider,
 * or none that has ever been asked, is *not knowable* rather than absent - and
 * ADR 0118 O4's unset field states nothing, which is not the same as stating
 * that all is well.
 */
export async function readPicoCompanionModelReachability(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
}): Promise<boolean | undefined> {
  const providers = await readPicoCompanionModelProviders(input);
  return picoModelIsReachable(providers
    .filter((provider) => provider.decided)
    .map((provider) => provider.state)
    .filter((state): state is PicoModelProviderState => state !== undefined));
}

/**
 * ADR 0151 PV1. Hands the Home the secret its entry's reference names.
 *
 * **The secret leaves this device once and is never asked for again.** The
 * Home seals it on arrival and answers with the reference; there is no read
 * operation, so nothing here - or anywhere else - can pull it back out. A
 * companion that kept a copy "for convenience" would be a second custody
 * nobody decided on.
 */
export async function supplyPicoCompanionModelProviderCredential(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  entryId: string;
  credentialRef: string;
  secret: string;
}): Promise<string> {
  const supplied = await input.livingDeviceLinkClient.request(
    'home.model.provider.credential.submit',
    {
      entryId: input.entryId,
      credentialRef: input.credentialRef,
      secret: input.secret,
    },
  );
  if (supplied.outcome !== 'ok') {
    const refusal = (supplied.result as { refusal?: unknown }).refusal;
    throw new Error(
      typeof refusal === 'string'
        ? `model_provider_credential_rejected:${refusal}`
        : `model_provider_credential_rejected:${supplied.outcome}`,
    );
  }
  const credentialRef = (supplied.result as { credentialRef?: unknown }).credentialRef;
  if (typeof credentialRef !== 'string') {
    throw new Error('invalid_pico_model_provider_credential_result');
  }
  return credentialRef;
}

export async function decidePicoCompanionModelProvider(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  entryId: string;
  providerClass: string;
  carries: string;
  credentialRef?: string;
}): Promise<void> {
  const decided = await input.livingDeviceLinkClient.request(
    'home.model.provider.decision.submit',
    {
      entryId: input.entryId,
      providerClass: input.providerClass,
      carries: input.carries,
      ...(input.credentialRef === undefined ? {} : { credentialRef: input.credentialRef }),
    },
  );
  if (decided.outcome !== 'ok') {
    // Carried out as itself: ADR 0151 PV4's missing credential is a sentence
    // about what the decision needed, and a person told "something went wrong"
    // would have to guess it.
    const refusal = (decided.result as { refusal?: unknown }).refusal;
    throw new Error(
      typeof refusal === 'string'
        ? `model_provider_decision_rejected:${refusal}`
        : `model_provider_decision_rejected:${decided.outcome}`,
    );
  }
}

export async function revokePicoCompanionModelProvider(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  entryId: string;
}): Promise<void> {
  const revoked = await input.livingDeviceLinkClient.request(
    'home.model.provider.decision.revoke',
    { entryId: input.entryId },
  );
  if (revoked.outcome !== 'ok') {
    throw new Error(`model_provider_revoke_rejected:${revoked.outcome}`);
  }
}

export interface PicoCompanionAnsweredReadView {
  jobId: string;
  supplier: string;
  revision: string;
  answeredAt: string;
}

/**
 * ADR 0116 W5. What is waiting, without what it found.
 *
 * The reply is parsed rather than believed, and a value that arrived anyway is
 * not carried forward - a device that rendered one would be persisting derived
 * output onto a screen, which is the same rule with a different medium.
 */
export async function readPicoCompanionAnsweredReads(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
}): Promise<readonly PicoCompanionAnsweredReadView[]> {
  const read = await input.livingDeviceLinkClient.request('home.model.reads.read', {});
  if (read.outcome !== 'ok') {
    throw new Error(`model_reads_read_rejected:${read.outcome}`);
  }
  const reads = (read.result as { reads?: unknown }).reads;
  if (!Array.isArray(reads)) {
    throw new Error('invalid_pico_model_reads_result');
  }
  return Object.freeze(reads.map((entry) => {
    const record = entry as Record<string, unknown>;
    if (typeof record.jobId !== 'string'
      || typeof record.supplier !== 'string'
      || typeof record.revision !== 'string'
      || typeof record.answeredAt !== 'string') {
      throw new Error('invalid_pico_model_read_result');
    }
    return Object.freeze({
      jobId: record.jobId,
      supplier: record.supplier,
      revision: record.revision,
      answeredAt: record.answeredAt,
    });
  }));
}

/** ADR 0116 W5's explicit write, sent from the device the person holds. */
export async function keepPicoCompanionAnsweredRead(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  jobId: string;
}): Promise<string> {
  const kept = await input.livingDeviceLinkClient.request('home.model.read.keep', {
    jobId: input.jobId,
  });
  if (kept.outcome !== 'ok') {
    const refusal = (kept.result as { refusal?: unknown }).refusal;
    throw new Error(
      typeof refusal === 'string'
        ? `model_read_keep_rejected:${refusal}`
        : `model_read_keep_rejected:${kept.outcome}`,
    );
  }
  const memoryItemId = (kept.result as { memoryItemId?: unknown }).memoryItemId;
  if (typeof memoryItemId !== 'string') {
    throw new Error('invalid_pico_model_read_keep_result');
  }
  return memoryItemId;
}

/**
 * ADR 0116 W1 on the device. A question, and what came back.
 *
 * The values arrive here where a library read's do not, and the difference is
 * the act rather than the data: a recall is something this person asked a
 * moment ago, so putting the answer in front of them is the delivery. A
 * library read is a background inventory of material nobody asked to see, and
 * W5 keeps its values behind an explicit keep.
 */
export interface PicoCompanionRecallView {
  jobId: string;
  question: string;
  askedAt: string;
  /** Absent while the provider has not answered - waiting is an absence. */
  settledAt?: string;
  outcome?: string;
  answer?: string;
  /** ADR 0117 X2. Whether the material contained an answer at all. */
  foundInMemory?: boolean;
  /**
   * ADR 0071. What this answer became when the person kept it.
   *
   * Absent means there is nothing to take back - not kept, or kept and since
   * forgotten, which are the same statement to a surface offering to forget.
   */
  keptAs?: { memoryItemId: string; privacyDomain: string };
}

/**
 * ADR 0116 W1. Asks, and answers with what the question will be formed from.
 *
 * The counts come back before any answer exists, because ADR 0119 Q5's posture
 * is that a bound says what it left out: "answered from four of your notes,
 * and there were nine" is a fact a person can act on, and discovering it
 * afterwards is not.
 */
export async function askPicoCompanionRecall(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  privacyDomain: string;
  question: string;
}): Promise<{ jobId: string; included: number; omitted: number; carries: string }> {
  const asked = await input.livingDeviceLinkClient.request('home.recall.ask', {
    privacyDomain: input.privacyDomain,
    question: input.question,
  });
  if (asked.outcome !== 'ok') {
    // Carried out as itself. Every refusal this operation gives names
    // something a person can do next, and "something went wrong" would throw
    // all four away.
    const refusal = (asked.result as { refusal?: unknown }).refusal;
    throw new Error(
      typeof refusal === 'string'
        ? `recall_rejected:${refusal}`
        : `recall_rejected:${asked.outcome}`,
    );
  }
  const record = asked.result as Record<string, unknown>;
  if (typeof record.jobId !== 'string'
    || typeof record.included !== 'number'
    || typeof record.omitted !== 'number'
    || typeof record.carries !== 'string') {
    throw new Error('invalid_pico_recall_result');
  }
  return {
    jobId: record.jobId,
    included: record.included,
    omitted: record.omitted,
    carries: record.carries,
  };
}

export async function readPicoCompanionRecalls(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
}): Promise<readonly PicoCompanionRecallView[]> {
  const read = await input.livingDeviceLinkClient.request('home.recall.read', {});
  if (read.outcome !== 'ok') {
    throw new Error(`recall_read_rejected:${read.outcome}`);
  }
  const recalls = (read.result as { recalls?: unknown }).recalls;
  if (!Array.isArray(recalls)) {
    throw new Error('invalid_pico_recall_read_result');
  }
  return Object.freeze(recalls.map((entry) => {
    const record = entry as Record<string, unknown>;
    if (typeof record.jobId !== 'string'
      || typeof record.question !== 'string'
      || typeof record.askedAt !== 'string') {
      throw new Error('invalid_pico_recall_entry');
    }
    // The declared values, read by name rather than by position: a reader
    // answers a shape, and a device that trusted the order would render the
    // wrong field the first time a shape grew.
    const values = Array.isArray(record.values) ? record.values : [];
    const valueOf = (name: string): unknown => (values as Array<Record<string, unknown>>)
      .find((value) => value.name === name)?.value;
    const answer = valueOf('answer');
    const found = valueOf('found_in_memory');
    return Object.freeze({
      jobId: record.jobId,
      question: record.question,
      askedAt: record.askedAt,
      ...(typeof record.settledAt === 'string' ? { settledAt: record.settledAt } : {}),
      ...(typeof record.outcome === 'string' ? { outcome: record.outcome } : {}),
      ...(typeof answer === 'string' ? { answer } : {}),
      ...(typeof found === 'boolean' ? { foundInMemory: found } : {}),
    });
  }));
}

/**
 * ADR 0116 W5. The person's own write, and the only thing that persists an
 * answer.
 *
 * The refusals are the answer to different questions and travel as themselves:
 * `no_answer` means it is not finished, `nothing_to_derive_from` means there
 * was nothing in that domain to be right or wrong about, and a deleted source
 * means the material this was formed from is gone - which is the one case
 * where a person is being told that keeping it would outlive their own
 * deletion.
 */
export async function keepPicoCompanionRecall(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  jobId: string;
  /**
   * ADR 0126 P3. Which presence is releasing this into durable memory.
   *
   * Named by this device and checked by the Home against its own registry, so
   * the crossing record can say where something came from. Optional because a
   * device that has not announced itself has no honest answer, and inventing
   * one would put a presence in an audit trail that never said it was there.
   */
  presenceId?: string;
}): Promise<string> {
  const kept = await input.livingDeviceLinkClient.request('home.recall.keep', {
    jobId: input.jobId,
    ...(input.presenceId === undefined ? {} : { presenceId: input.presenceId }),
  });
  if (kept.outcome !== 'ok') {
    const refusal = (kept.result as { refusal?: unknown }).refusal;
    throw new Error(
      typeof refusal === 'string'
        ? `recall_keep_rejected:${refusal}`
        : `recall_keep_rejected:${kept.outcome}`,
    );
  }
  const memoryItemId = (kept.result as { memoryItemId?: unknown }).memoryItemId;
  if (typeof memoryItemId !== 'string') {
    throw new Error('invalid_pico_recall_keep_result');
  }
  return memoryItemId;
}

/**
 * ADR 0071 with ADR 0116 W5. Unmakes a memory the person made by keeping.
 *
 * Only the item travels. The domain is not the caller's to name - the Home has
 * it on the row that records the keep, and taking it from here would let a
 * client go looking in a domain by guessing.
 */
export async function forgetPicoCompanionMemory(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  memoryItemId: string;
}): Promise<void> {
  const answer = await input.livingDeviceLinkClient.request('home.memory.forget', {
    memoryItemId: input.memoryItemId,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `memory_forget_${answer.outcome}`);
  }
}

/**
 * ADR 0049 mit ADR 0071. Nimmt einen Austausch zurück, nicht die Notiz daraus.
 *
 * Der Nachbar darüber hebt die **Erinnerung** auf, die jemand aus einer
 * Antwort behalten hat. Diese Operation hebt den **Austausch** auf: die Frage,
 * die Antwort und den erinnerten Kontext. Das sind zwei Handlungen, und bis
 * zum 2026-08-25 gab es nur eine - wer seinen Chat loswerden wollte, musste
 * die Notiz opfern, und wer die Notiz behielt, behielt den Chat.
 *
 * Nur die Jobkennung reist. Was dabei geleert wird und was als Handhabe
 * stehen bleibt, entscheidet das Home auf der Zeile, die es dazu führt.
 */
export async function forgetPicoCompanionRecall(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  jobId: string;
}): Promise<void> {
  const answer = await input.livingDeviceLinkClient.request('home.recall.forget', {
    jobId: input.jobId,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `recall_forget_${answer.outcome}`);
  }
}

/**
 * ADR 0142 PE1. Forgets a measured machine, and every decision about it.
 *
 * The decisions go with it on the Home's side rather than being revoked one
 * by one: an entry identifier is derived from the model name, so a later
 * measurement of the same model would otherwise inherit an old answer about a
 * different finding.
 */
export async function forgetPicoCompanionModelProvider(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  entryId: string;
}): Promise<void> {
  const answer = await input.livingDeviceLinkClient.request('home.model.provider.forget', {
    entryId: input.entryId,
  });
  if (answer.outcome !== 'ok') {
    const refusal = (answer.result as { refusal?: unknown }).refusal;
    throw new Error(typeof refusal === 'string' ? refusal : `provider_forget_${answer.outcome}`);
  }
}
