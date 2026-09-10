/**
 * ADR 0142 and ADR 0151 - what a model provider entry says, and the four
 * things it has no way of saying.
 *
 * ADR 0049 named a registry, ADR 0061 reserved a draft shape, and ADR 0142
 * decided the contract from measurements taken on a real host. None of them
 * had a consumer: the contract existed as prose that nothing could refuse. So
 * the point of this module is the refusals, not the type.
 *
 * **PE1: an entry describes one deployment, not a model.** This model, at this
 * version, on this host, behind this reach. Nothing here is portable between
 * installations without re-measurement, which is why there is no field for a
 * model's own claims about itself and no way to write a preset.
 *
 * **PE2: capacity is observed, never advertised.** The measured host declares a
 * 32768 context and serves 8192, because 13.35 GiB of weights leave 1.95 GiB
 * for KV cache and generation falls from 17.8 tok/s at 8k to 5.1 tok/s at 27k
 * on a slope with no runtime-detectable cliff. An entry copying 32768 out of
 * the model metadata would be accurate about the model and wrong about the
 * deployment. The construction that enforces it: capacity lives inside a
 * measurement that carries its own date, so **a capacity with no observation
 * behind it has nowhere to be written**.
 *
 * **PV1/PV4: the proof buys the memory, not the provider.** An entry with no
 * credential is a valid entry that carries the live turn. The wider allowance
 * does not parse without a credential reference - not a lax entry, not an
 * entry - which is ADR 0117 X1's construction: the refusal is a missing field
 * rather than a rule somebody has to remember to run.
 *
 * **PV5: a credential its transport does not protect refuses outright** rather
 * than narrowing, because it is a claim about identity the transport
 * contradicts, and something that claims to be a proof and is not should never
 * have been written down.
 */

import { assertExactKeys } from './canonical-bytes.js';

/**
 * ADR 0048's list, closed and ordered as that ADR wrote it, with the sixth
 * added by the user's 2026-08-11 decision.
 *
 * **The class is not the allowance** (ADR 0151 PV2), and keeping them apart is
 * load-bearing rather than tidy: ADR 0118 O2 forbids failover *across* classes
 * so that degrading a local provider cannot force a cloud path. An
 * unauthenticated host filed under `cloud_connector` would make a degraded LAN
 * box and a hosted API the same class, and O2 would then permit exactly the
 * failover it exists to forbid.
 */
export const picoModelProviderClasses = [
  /** The same local device. Delegation to itself, and still a provider. */
  'same_device',
  'pico_home',
  'pico_vault',
  'pico_endpoint',
  /** A cloud model connector mediated by a trusted Pico runtime. */
  'cloud_connector',
  /** A bare inference host the person declares is their own, running no Pico. */
  'declared_own_host',
] as const;

export type PicoModelProviderClass = typeof picoModelProviderClasses[number];

/**
 * ADR 0048's egress split, which ADR 0151 turned into a property of the entry.
 *
 * Two values and no third, because the split is what the classes were drawn
 * around: the person's own words in the turn they are having, and the
 * remembered words of people who were never asked.
 */
export const picoModelProviderAllowances = [
  'live_turn',
  'live_turn_and_retrieved_memory',
] as const;

export type PicoModelProviderAllowance = typeof picoModelProviderAllowances[number];

/**
 * ADR 0048, and the one class-level rule the allowance cannot override.
 *
 * The 2026-08-04 decision was that only the live turn leaves the device; the
 * sixth class was added on 2026-08-11 as the one retrieved memory may reach,
 * on the reasoning that the person's own hardware is not a second party
 * learning other people's words. A hosted API is. ADR 0151 states it kept the
 * fifth class untouched, so this is not a new rule - it is the old one, said
 * where an entry is written.
 */
export function picoModelProviderClassMayCarryRetrievedMemory(
  providerClass: PicoModelProviderClass,
): boolean {
  return providerClass !== 'cloud_connector';
}

/**
 * ADR 0142 PE2/PE3. What was observed, in the units it was observed in.
 *
 * `contextTokens` is what the deployment *served*, not what the model declares.
 * `concurrentJobs` is ADR 0142 PE3's lane count, measured rather than
 * defaulted here: the default of one lane belongs where an entry is created,
 * because a parser that defaulted it would be inventing a measurement.
 */
export interface PicoModelProviderCapacity {
  contextTokens: number;
  generationTokensPerSecond: number;
  promptTokensPerSecond: number;
  concurrentJobs: number;
}

/**
 * ADR 0142 PE4. Warm-up belongs to the availability contract.
 *
 * The measured host takes 31 s to load cold and 8 s to reload under a 5 m
 * keep-alive, so ADR 0118 O2's absence threshold has to exceed the declared
 * residency cost or the first job after any idle period reports no model while
 * one is loading - and a loading provider still never selects a different
 * provider class.
 */
export interface PicoModelProviderResidency {
  coldLoadMs: number;
  reloadMs: number;
  keepAliveMs: number;
}

/**
 * ADR 0142 PE2's construction. Capacity cannot be stated without the moment it
 * was observed, because the two are one fact.
 */
export interface PicoModelProviderMeasurement {
  measuredAt: string;
  capacity: PicoModelProviderCapacity;
  residency: PicoModelProviderResidency;
}

/**
 * ADR 0142 PE6. The tag is mutable and the digest is the identity.
 *
 * On the measured host the same port answers unauthenticated `pull` and
 * `create`, so the model behind a stable tag can be replaced by anyone who can
 * reach it, and the measured numbers do not survive its replacement. ADR 0151
 * made the pin bind both allowances rather than only the wider one: the live
 * turn is still the person's own words going to whatever is answering there.
 */
export interface PicoModelProviderModel {
  identifier: string;
  digestHex: string;
}

export const picoModelProviderEntrySchema = 'pico.model.provider.entry.v1' as const;

export interface PicoModelProviderEntry {
  schema: typeof picoModelProviderEntrySchema;
  entryId: string;
  providerClass: PicoModelProviderClass;
  /** `http:` or `https:`. Reachability, never identity (ADR 0142 PE5). */
  reach: string;
  model: PicoModelProviderModel;
  measurement: PicoModelProviderMeasurement;
  carries: PicoModelProviderAllowance;
  /**
   * A name for a credential under ADR 0138 CO1 custody - never the credential.
   * Absent means the narrower allowance, which is what saying nothing yields.
   */
  credentialRef?: string;
}

/**
 * The fields an entry has no place for, kept as data because an absent field
 * cannot document itself.
 *
 * Same construction as ADR 0150's push envelope: each is refused **by name**
 * rather than ignored, because writing one is not a typo - it is asking for
 * the thing the contract removed, and a person who wrote it deserves the
 * sentence rather than a shrug.
 */
export const picoModelProviderEntrySaysNothingAbout = Object.freeze({
  nominalContext:
    'ADR 0142 PE2: the model\'s own claim about its context is accurate about '
    + 'the model and wrong about the deployment. The entry states what this '
    + 'host was measured serving.',
  trusted:
    'ADR 0049: a registry entry is not a trust grant. An entry describes what '
    + 'a host can do; whether a job may go there is decided elsewhere, from '
    + 'consent and the allowance.',
  riskClass:
    'ADR 0140 RL3: risk is decided from a closed input the core owns. A '
    + 'provider setting its own risk class would be arguing about its own '
    + 'permission.',
  credential:
    'ADR 0138 CO1 and ADR 0143 DP3: the entry names a credential and never '
    + 'holds one. A secret in a registry entry is a secret in whatever backs '
    + 'the registry up.',
});

const entryKeysWithoutCredential = [
  'schema', 'entryId', 'providerClass', 'reach', 'model', 'measurement', 'carries',
] as const;

const identifierPattern = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const digestPattern = /^[0-9a-f]{64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}


/** A count of something real: finite, whole and greater than zero. */
function assertPositiveInteger(value: unknown, error: string): number {
  if (typeof value !== 'number'
    || !Number.isInteger(value)
    || value <= 0
    || !Number.isFinite(value)) {
    throw new Error(error);
  }
  return value;
}

function assertPositiveRate(value: unknown, error: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(error);
  }
  return value;
}

/**
 * ADR 0142 PE5 as ADR 0151 amended it. The reach says where, never who.
 *
 * Only the two transports a running server is actually reachable over. A third
 * scheme is a decision about what may carry a job, and this refuses rather
 * than guessing which side of PV5 it falls on.
 */
function assertReach(value: unknown): { reach: string; protectedTransport: boolean } {
  if (typeof value !== 'string' || value === '') {
    throw new Error('invalid_pico_model_provider_reach');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('invalid_pico_model_provider_reach');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('pico_model_provider_reach_is_not_a_network_transport');
  }
  if (url.username !== '' || url.password !== '') {
    // A credential in the address is the credential this entry may not hold,
    // wearing a URL. Named separately because the author meant to authenticate
    // and reached for the one place that keeps no custody at all.
    throw new Error('pico_model_provider_reach_carries_a_credential');
  }
  return { reach: value, protectedTransport: url.protocol === 'https:' };
}

function parseCapacity(value: unknown): PicoModelProviderCapacity {
  if (!isRecord(value)) {
    throw new Error('invalid_pico_model_provider_capacity');
  }
  assertExactKeys(
    value,
    ['contextTokens', 'generationTokensPerSecond', 'promptTokensPerSecond', 'concurrentJobs'],
    'invalid_pico_model_provider_capacity',
  );
  return Object.freeze({
    contextTokens: assertPositiveInteger(
      value.contextTokens,
      'invalid_pico_model_provider_capacity',
    ),
    generationTokensPerSecond: assertPositiveRate(
      value.generationTokensPerSecond,
      'invalid_pico_model_provider_capacity',
    ),
    promptTokensPerSecond: assertPositiveRate(
      value.promptTokensPerSecond,
      'invalid_pico_model_provider_capacity',
    ),
    concurrentJobs: assertPositiveInteger(
      value.concurrentJobs,
      'invalid_pico_model_provider_capacity',
    ),
  });
}

function parseResidency(value: unknown): PicoModelProviderResidency {
  if (!isRecord(value)) {
    throw new Error('invalid_pico_model_provider_residency');
  }
  assertExactKeys(
    value,
    ['coldLoadMs', 'reloadMs', 'keepAliveMs'],
    'invalid_pico_model_provider_residency',
  );
  const coldLoadMs = assertPositiveInteger(
    value.coldLoadMs,
    'invalid_pico_model_provider_residency',
  );
  const reloadMs = assertPositiveInteger(
    value.reloadMs,
    'invalid_pico_model_provider_residency',
  );
  if (reloadMs > coldLoadMs) {
    // Reloading a model already on disk cannot cost more than loading it the
    // first time. A pair that says otherwise was not measured, and PE2 is
    // about measurements rather than plausible numbers.
    throw new Error('pico_model_provider_reload_exceeds_cold_load');
  }
  return Object.freeze({
    coldLoadMs,
    reloadMs,
    keepAliveMs: assertPositiveInteger(
      value.keepAliveMs,
      'invalid_pico_model_provider_residency',
    ),
  });
}

function parseMeasurement(value: unknown): PicoModelProviderMeasurement {
  if (!isRecord(value)) {
    throw new Error('invalid_pico_model_provider_measurement');
  }
  assertExactKeys(
    value,
    ['measuredAt', 'capacity', 'residency'],
    'invalid_pico_model_provider_measurement',
  );
  if (typeof value.measuredAt !== 'string'
    || Number.isNaN(Date.parse(value.measuredAt))) {
    // PE2's hinge. Without the moment, every number here is a claim that
    // cannot go stale, which is exactly what an advertised figure is.
    throw new Error('invalid_pico_model_provider_measured_at');
  }
  return Object.freeze({
    measuredAt: value.measuredAt,
    capacity: parseCapacity(value.capacity),
    residency: parseResidency(value.residency),
  });
}

function parseModel(value: unknown): PicoModelProviderModel {
  if (!isRecord(value)) {
    throw new Error('invalid_pico_model_provider_model');
  }
  assertExactKeys(value, ['identifier', 'digestHex'], 'invalid_pico_model_provider_model');
  if (typeof value.identifier !== 'string' || !identifierPattern.test(value.identifier)) {
    throw new Error('invalid_pico_model_provider_model');
  }
  if (typeof value.digestHex !== 'string' || !digestPattern.test(value.digestHex)) {
    // PE6. A tag without a digest is a name somebody else can move.
    throw new Error('invalid_pico_model_provider_model_digest');
  }
  return Object.freeze({ identifier: value.identifier, digestHex: value.digestHex });
}

/**
 * ADR 0142 PE1-PE6 with ADR 0151 PV1-PV5. Refuses rather than repairing, for
 * ADR 0117 X2's reason: an entry that half-parsed is one nobody wrote.
 */
export function parsePicoModelProviderEntry(value: unknown): PicoModelProviderEntry {
  if (!isRecord(value)) {
    throw new Error('invalid_pico_model_provider_entry');
  }

  for (const [field, reason] of Object.entries(picoModelProviderEntrySaysNothingAbout)) {
    if (field in value) {
      throw new Error(`pico_model_provider_entry_says_nothing_about_${field}: ${reason}`);
    }
  }

  const hasCredential = 'credentialRef' in value;
  assertExactKeys(
    value,
    hasCredential ? [...entryKeysWithoutCredential, 'credentialRef'] : entryKeysWithoutCredential,
    'invalid_pico_model_provider_entry',
  );

  if (value.schema !== picoModelProviderEntrySchema) {
    throw new Error('invalid_pico_model_provider_entry_schema');
  }
  if (typeof value.entryId !== 'string' || !identifierPattern.test(value.entryId)) {
    throw new Error('invalid_pico_model_provider_entry_id');
  }
  if (typeof value.providerClass !== 'string'
    || !(picoModelProviderClasses as readonly string[]).includes(value.providerClass)) {
    throw new Error('invalid_pico_model_provider_class');
  }
  const providerClass = value.providerClass as PicoModelProviderClass;
  const { reach, protectedTransport } = assertReach(value.reach);

  if (typeof value.carries !== 'string'
    || !(picoModelProviderAllowances as readonly string[]).includes(value.carries)) {
    throw new Error('invalid_pico_model_provider_allowance');
  }
  const carries = value.carries as PicoModelProviderAllowance;

  let credentialRef: string | undefined;
  if (hasCredential) {
    if (typeof value.credentialRef !== 'string'
      || !identifierPattern.test(value.credentialRef)) {
      throw new Error('invalid_pico_model_provider_credential_ref');
    }
    if (!protectedTransport) {
      // ADR 0151 PV5. Refused outright rather than narrowed: a bearer token
      // over plain HTTP is capturable by anyone who could already reach the
      // port, so it distinguishes the provider from nobody and only looks as
      // though it does.
      throw new Error('pico_model_provider_credential_on_unprotected_transport');
    }
    credentialRef = value.credentialRef;
  }

  if (carries === 'live_turn_and_retrieved_memory') {
    /**
     * ADR 0151 PV4. Not a lax entry - not an entry. The narrower allowance is
     * what saying nothing yields, and the wider one is stated together with
     * the thing that earns it.
     *
     * **A machine the person declares is theirs is the one exception, decided
     * on 2026-09-01.** A credential answers one question: *who* is on the other
     * end. For every other class there is another end - a Home, a Vault, a
     * connector, somebody's endpoint - and the proof is what keeps this
     * person's retrieved memory from going to a stranger who answers on the
     * same address. `declared_own_host` has no other end. The person named the
     * machine as their own, and a secret handed to it would be a secret they
     * hold at both ends and prove to nobody.
     *
     * **What this cost while it stood.** PV4 and PV5 together closed the whole
     * memory path for the ordinary self-hosted case: a model on `127.0.0.1`
     * has no TLS to carry a bearer over and usually no bearer to carry, so it
     * could be measured and decided and then answer nothing - not the person's
     * notes, and not even a corpus this Pico fetched itself, because a library
     * read carries a reference and a reference is retrieved memory whatever
     * its origin class. Roadmap finding B39 measured that against running
     * processes before this exception was written.
     *
     * The class gate below still stands, and it is the one that matters here:
     * declaring a machine yours does not make a cloud connector into one.
     */
    if (credentialRef === undefined && providerClass !== 'declared_own_host') {
      throw new Error('pico_model_provider_allowance_without_credential');
    }
    if (!picoModelProviderClassMayCarryRetrievedMemory(providerClass)) {
      // ADR 0048. A credential proves who answers; it does not make a second
      // party into the person's own hardware.
      throw new Error('pico_model_provider_class_may_not_carry_retrieved_memory');
    }
  }

  return Object.freeze({
    schema: picoModelProviderEntrySchema,
    entryId: value.entryId,
    providerClass,
    reach,
    model: parseModel(value.model),
    measurement: parseMeasurement(value.measurement),
    carries,
    ...(credentialRef === undefined ? {} : { credentialRef }),
  });
}

/**
 * ADR 0151 PV3. Whether a job carrying this much may run on this entry.
 *
 * The allowance travels with the job, set where the job was assembled, so this
 * asks about the job's need rather than about the provider's wish. A job does
 * not become sendable by the provider it lands on - which is the failover case
 * ADR 0118 O2 alone no longer covers, once one class holds entries with
 * different allowances.
 */
export function picoModelProviderMayCarry(
  entry: PicoModelProviderEntry,
  needed: PicoModelProviderAllowance,
): boolean {
  return needed === 'live_turn' || entry.carries === 'live_turn_and_retrieved_memory';
}

export function assertPicoModelProviderMayCarry(
  entry: PicoModelProviderEntry,
  needed: PicoModelProviderAllowance,
): void {
  if (!picoModelProviderMayCarry(entry, needed)) {
    throw new Error('pico_model_provider_may_not_carry_retrieved_memory');
  }
}

/**
 * ADR 0142 PE6. Whether the model answering is the model that was measured.
 *
 * Separate from parsing on purpose: an entry is well-formed whatever is
 * running right now, and a mismatch is a refusal at selection time rather than
 * a malformed record. What it protects is the whole entry - the numbers were
 * measured against these weights, and a different model behind the same tag
 * makes every one of them a guess.
 */
export function picoModelProviderDigestMatches(
  entry: PicoModelProviderEntry,
  observedDigestHex: string,
): boolean {
  return digestPattern.test(observedDigestHex) && observedDigestHex === entry.model.digestHex;
}
