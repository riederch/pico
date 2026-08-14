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
    return Object.freeze({
      entryId: record.entryId,
      model: record.model,
      contextTokens: record.contextTokens,
      measuredAt: record.measuredAt,
      decided: record.decided,
      sees: record.sees,
      needsCredentialToSeeMore: record.needsCredentialToSeeMore,
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
