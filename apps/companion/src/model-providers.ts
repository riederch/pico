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
