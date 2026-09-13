import type { PicoTimeBoundEntryKind } from '@pico/protocol/time-bound-entry';
import { memoryRetentionModes, picoHomeClaimStates } from './protocol-values.js';
import type {
  DashboardSnapshot,
  EventHistoryStatus,
  EventListResponse,
  HealthResponse,
  MemoryContentItem,
  MemoryContentListResponse,
  PicoEvent,
  RealtimeTicketResponse,
  RetentionPolicy,
  RetentionPolicyInput,
  RetentionPolicyListResponse,
  SystemStatus,
} from './types.js';
import { isPicoEvent, isRecord } from './types.js';

export const DEFAULT_PICO_HOME_URL = 'http://localhost:3100';
const EVENT_TAIL_LIMIT = 500;

/**
 * The bearer credential the dashboard sends. An operator session (ADR 0076)
 * takes precedence over the temporary static token (ADR 0038); both travel in
 * the `Authorization` header, never in a cookie, so the browser attaches no
 * ambient authority and there is no CSRF surface to defend.
 *
 * The session lives in memory for the page's lifetime only: not in local
 * storage, session storage, IndexedDB, cookies or the URL (ADR 0039 rule, kept
 * by ADR 0076). A reload therefore requires a new login.
 */
export interface FoundationAccessOptions {
  foundationToken?: string;
  operatorSession?: string;
}

interface BrowserLocation {
  href: string;
  origin: string;
  protocol: string;
}

export function defaultPicoHomeUrl(location: BrowserLocation): string {
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    const basePath = defaultBasePath(location);
    return `${location.origin}${basePath}`;
  }

  return DEFAULT_PICO_HOME_URL;
}

export function normalizePicoHomeUrl(rawValue: string): string {
  const trimmedValue = rawValue.trim() || DEFAULT_PICO_HOME_URL;
  const candidate = hasProtocol(trimmedValue) ? trimmedValue : `http://${trimmedValue}`;
  const url = new URL(candidate);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Pico Home URL must use http or https.');
  }

  const pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${pathname === '/' ? '' : pathname}`;
}

export function buildEndpointUrl(baseUrl: string, endpoint: string): URL {
  const url = new URL(baseUrl);
  const basePath = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath}${endpoint}`;
  url.search = '';
  url.hash = '';
  return url;
}

export async function loadDashboardSnapshot(baseUrl: string, options: FoundationAccessOptions = {}): Promise<DashboardSnapshot> {
  const [health, systemStatus, events] = await Promise.all([
    fetchHealth(baseUrl),
    fetchSystemStatus(baseUrl, options),
    fetchLatestEvents(baseUrl, options),
  ]);

  return {
    health,
    systemStatus,
    events: events.events,
    eventHistory: events.history,
  };
}

/**
 * Exchanges the operator passphrase for a session. The passphrase is used once,
 * here, and never stored; only the returned session is kept, in memory.
 */
export async function loginOperator(baseUrl: string, passphrase: string): Promise<string> {
  const url = buildEndpointUrl(baseUrl, '/api/auth/session');
  const response = await reachFoundation(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ passphrase }),
  }, 'operator login');

  if (response.status === 401) {
    throw new Error('Operator passphrase is invalid.');
  }

  if (!response.ok) {
    throw new Error(`Operator login returned HTTP ${response.status}.`);
  }

  const data = (await response.json()) as unknown;

  if (!isRecord(data) || typeof data.session !== 'string' || data.session === '') {
    throw new Error('Operator login did not return a session.');
  }

  return data.session;
}

export async function listRetentionPolicies(baseUrl: string, options: FoundationAccessOptions): Promise<RetentionPolicy[]> {
  const response = await fetchJson(
    buildEndpointUrl(baseUrl, '/api/memory/retention-policies'),
    isRetentionPolicyListResponse,
    'retention policies',
    options,
  );

  return response.retentionPolicies;
}

export async function createRetentionPolicy(
  baseUrl: string,
  options: FoundationAccessOptions,
  input: RetentionPolicyInput,
): Promise<RetentionPolicy> {
  return sendJson(buildEndpointUrl(baseUrl, '/api/memory/retention-policies'), 'POST', input, options, isRetentionPolicy, 'retention policy');
}

export async function updateRetentionPolicy(
  baseUrl: string,
  options: FoundationAccessOptions,
  retentionPolicyId: string,
  input: Omit<RetentionPolicyInput, 'retentionPolicyId'>,
): Promise<RetentionPolicy> {
  return sendJson(
    buildEndpointUrl(baseUrl, `/api/memory/retention-policies/${encodeURIComponent(retentionPolicyId)}`),
    'PUT',
    input,
    options,
    isRetentionPolicy,
    'retention policy',
  );
}

export async function deleteRetentionPolicy(
  baseUrl: string,
  options: FoundationAccessOptions,
  retentionPolicyId: string,
): Promise<void> {
  const url = buildEndpointUrl(baseUrl, `/api/memory/retention-policies/${encodeURIComponent(retentionPolicyId)}`);
  const response = await reachFoundation(url, { method: 'DELETE', headers: buildFoundationHeaders(options) }, 'retention policy');

  if (!response.ok) {
    throw new Error(await describeFailure(response, 'Revoking the retention policy'));
  }
}

/**
 * Destroys a privacy domain's keys. Irreversible: the content becomes
 * unreadable, including in existing backups (ADR 0071).
 *
 * `confirm` must repeat the domain exactly. It is passed in by the caller and
 * never derived from `privacyDomain` here — deriving it would defeat the point
 * of confirming.
 */
export async function shredPrivacyDomain(
  baseUrl: string,
  options: FoundationAccessOptions,
  input: { privacyDomain: string; confirm: string; reason?: string },
): Promise<{ removedKeyVersions: number }> {
  const url = buildEndpointUrl(baseUrl, `/api/memory/domains/${encodeURIComponent(input.privacyDomain)}/shred`);
  const body: Record<string, unknown> = { confirm: input.confirm };

  if (input.reason !== undefined && input.reason.trim() !== '') {
    body.reason = input.reason.trim();
  }

  const response = await reachFoundation(url, {
    method: 'POST',
    headers: { ...buildFoundationHeaders(options), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 'privacy domain shred');

  if (!response.ok) {
    throw new Error(await describeFailure(response, 'Shredding the privacy domain'));
  }

  const data = (await response.json()) as unknown;

  if (!isRecord(data) || typeof data.removedKeyVersions !== 'number') {
    throw new Error('Shred response did not report how many key versions were destroyed.');
  }

  return { removedKeyVersions: data.removedKeyVersions };
}

/**
 * ADR 0076. Replacing the operator credential, and what it costs.
 *
 * **The current passphrase is required even though a session is open.** A live
 * session is not enough: a stolen one must not be able to lock the real
 * operator out, so possession of the session and knowledge of the passphrase
 * are two different claims and the dangerous change needs both.
 *
 * The reply counts what it ended. Every session goes, **including the one
 * making this call** - so a caller that carried on afterwards would be holding
 * a credential the Home no longer knows.
 */
export class PicoOperatorPassphraseInvalidError extends Error {
  public constructor() {
    super('operator_passphrase_invalid');
    this.name = 'PicoOperatorPassphraseInvalidError';
  }
}

export async function changeOperatorPassphrase(
  baseUrl: string,
  options: FoundationAccessOptions,
  input: { currentPassphrase: string; passphrase: string },
): Promise<{ revokedSessions: number }> {
  const url = buildEndpointUrl(baseUrl, '/api/auth/credential');
  const response = await reachFoundation(url, {
    method: 'PUT',
    headers: { ...buildFoundationHeaders(options), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, 'operator passphrase');

  if (response.status === 401) {
    throw new PicoOperatorPassphraseInvalidError();
  }
  if (!response.ok) {
    // The shape rule is the Home's and its sentence travels: a second copy
    // here would be a second place to change when the rule does.
    throw new Error(await describeFailure(response, 'Changing the passphrase'));
  }

  return { revokedSessions: readRevokedSessions(await response.json()) };
}

/** ADR 0076. Ends every session, this one included. */
export async function revokeAllSessions(
  baseUrl: string,
  options: FoundationAccessOptions,
): Promise<{ revokedSessions: number }> {
  const url = buildEndpointUrl(baseUrl, '/api/auth/sessions');
  const response = await reachFoundation(url, {
    method: 'DELETE',
    headers: buildFoundationHeaders(options),
  }, 'session revocation');

  if (!response.ok) {
    throw new Error(await describeFailure(response, 'Ending the sessions'));
  }

  return { revokedSessions: readRevokedSessions(await response.json()) };
}

function readRevokedSessions(data: unknown): number {
  if (!isRecord(data) || typeof data.revokedSessions !== 'number') {
    throw new Error('The session endpoint did not report how many sessions it ended.');
  }
  return data.revokedSessions;
}

/**
 * ADR 0127 M3 with ADR 0129 SR6. The two switches a module has.
 *
 * They are separate calls because they are separate decisions: activation says
 * whether a feature exists, capture says whether Pico may write down what the
 * module observes. Somebody who turns recording off for an afternoon still
 * wants yesterday's answers.
 */
export interface PicoModuleView {
  identifier: string;
  kind: string;
  active: boolean;
  capturing: boolean;
  effectBearing: boolean;
  dependencies: readonly string[];
}

/** ADR 0127 M4. What a deactivation means will not happen. */
export interface PicoModuleDroppedStatement {
  module: string;
  total: number;
  shown: ReadonlyArray<{ kind: string; dueAt: string; reference: string }>;
}

/**
 * ADR 0127 M3. Refused rather than merely failed, and it names who.
 *
 * A person who turned one thing off should not have to guess which of several
 * others is holding it on.
 */
export class PicoModuleHasDependentsError extends Error {
  public constructor(public readonly dependents: readonly string[]) {
    super(`pico_module_has_active_dependents:${dependents.join(',')}`);
    this.name = 'PicoModuleHasDependentsError';
  }
}

export async function setModuleActivation(
  baseUrl: string,
  options: FoundationAccessOptions,
  input: { identifier: string; active: boolean },
): Promise<{ modules: readonly PicoModuleView[]; dropped: readonly PicoModuleDroppedStatement[] }> {
  const url = buildEndpointUrl(baseUrl, '/api/home/modules');
  const response = await reachFoundation(url, {
    method: 'POST',
    headers: { ...buildFoundationHeaders(options), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, 'module activation');

  if (response.status === 409) {
    const data = (await response.json()) as unknown;
    if (isRecord(data) && Array.isArray(data.dependents)) {
      throw new PicoModuleHasDependentsError(data.dependents as string[]);
    }
  }
  if (!response.ok) {
    throw new Error(await describeFailure(response, 'Switching the module'));
  }

  const data = (await response.json()) as unknown;
  if (!isRecord(data) || !isRecord(data.modules) || !Array.isArray(data.modules.modules)) {
    throw new Error('The module endpoint returned an unexpected shape.');
  }
  return {
    modules: data.modules.modules as PicoModuleView[],
    // ADR 0127 M4. Absent means nothing was outstanding, which is a fact and
    // not a missing field.
    dropped: Array.isArray(data.dropped) ? data.dropped as PicoModuleDroppedStatement[] : [],
  };
}

export async function setModuleCapture(
  baseUrl: string,
  options: FoundationAccessOptions,
  input: { identifier: string; capturing: boolean },
): Promise<readonly PicoModuleView[]> {
  const url = buildEndpointUrl(baseUrl, '/api/home/modules/capture');
  const response = await reachFoundation(url, {
    method: 'POST',
    headers: { ...buildFoundationHeaders(options), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, 'module recording');

  if (!response.ok) {
    throw new Error(await describeFailure(response, 'Switching recording'));
  }

  const data = (await response.json()) as unknown;
  if (!isRecord(data) || !isRecord(data.modules) || !Array.isArray(data.modules.modules)) {
    throw new Error('The module endpoint returned an unexpected shape.');
  }
  return data.modules.modules as PicoModuleView[];
}

/**
 * ADR 0152 SE1 with ADR 0142. What machines compute for this Home.
 *
 * The reply is parsed rather than believed, `sees` included: the sentence is
 * the Home's, because what an entry carries is decided where the entry is
 * held. A dashboard that composed its own would be a second place deciding
 * what a person is told about where their words go.
 */
export interface PicoModelProviderEntryView {
  entryId: string;
  model: string;
  providerClass: string;
  sees: string;
  needsCredentialToSeeMore: boolean;
  measured: {
    at: string;
    contextTokens: number;
    generationTokensPerSecond: number;
    concurrentJobs: number;
  };
  narrowing?: { contextTokens?: number; concurrentJobs?: number };
  effective: { contextTokens: number; concurrentJobs: number };
  /** ADR 0152 SE5. What it last did, derived by the Home from settled jobs. */
  state?: string;
}

export async function listModelProviders(
  baseUrl: string,
  options: FoundationAccessOptions,
): Promise<PicoModelProviderEntryView[]> {
  const response = await fetchJson(
    buildEndpointUrl(baseUrl, '/api/model/providers'),
    isModelProviderListResponse,
    'model providers',
    options,
  );
  return response.providers;
}

/**
 * ADR 0152 SE4. A narrowing that would widen is refused with the measurement
 * it was measured against - "too large" without the number is a person
 * guessing at what would fit.
 */
export class PicoModelProviderNarrowingRefusedError extends Error {
  public constructor(
    public readonly refusal: string,
    public readonly measured: Record<string, number> | undefined,
  ) {
    super(refusal);
    this.name = 'PicoModelProviderNarrowingRefusedError';
  }
}

export async function narrowModelProvider(
  baseUrl: string,
  options: FoundationAccessOptions,
  entryId: string,
  narrowing: { contextTokens?: number; concurrentJobs?: number },
): Promise<void> {
  const url = buildEndpointUrl(
    baseUrl,
    `/api/model/providers/${encodeURIComponent(entryId)}/narrowing`,
  );
  const response = await reachFoundation(url, {
    method: 'POST',
    headers: { ...buildFoundationHeaders(options), 'Content-Type': 'application/json' },
    body: JSON.stringify(narrowing),
  }, 'model provider');

  if (response.status === 409) {
    const data = (await response.json()) as unknown;
    if (isRecord(data) && typeof data.error === 'string') {
      throw new PicoModelProviderNarrowingRefusedError(
        data.error,
        isRecord(data.measured) ? (data.measured as Record<string, number>) : undefined,
      );
    }
  }

  if (!response.ok) {
    throw new Error(await describeFailure(response, 'Narrowing the provider'));
  }
}

/**
 * ADR 0104 S3. What this Home is running under, and who decided it.
 *
 * Two facts, kept apart on purpose. `enabled` is the posture this *process*
 * booted with; `decided` says whether a person answered or Pico inherited the
 * host option. Collapsing them would make a recorded decision look like a
 * change that already happened - and the key store is built before the
 * database opens, so it has not.
 */
export interface PicoMemoryEncryptionState {
  enabled: boolean;
  decided: boolean;
  decidedAt?: string;
}

export async function readMemoryEncryption(
  baseUrl: string,
  options: FoundationAccessOptions,
): Promise<PicoMemoryEncryptionState> {
  return await fetchJson(
    buildEndpointUrl(baseUrl, '/api/memory/encryption'),
    isMemoryEncryptionState,
    'memory encryption',
    options,
  );
}

/** Records the answer. The reply says it applies at the next start, and it does. */
export async function decideMemoryEncryption(
  baseUrl: string,
  options: FoundationAccessOptions,
  enabled: boolean,
): Promise<void> {
  const url = buildEndpointUrl(baseUrl, '/api/memory/encryption');
  const response = await reachFoundation(url, {
    method: 'POST',
    headers: { ...buildFoundationHeaders(options), 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  }, 'memory encryption decision');

  if (!response.ok) {
    throw new Error(await describeFailure(response, 'Recording the encryption decision'));
  }
}

/**
 * ADR 0104 S5 with ADR 0031. The relay account this Home holds.
 *
 * `mailboxes` travels with the read rather than with the refusal, because what
 * a change costs is worth knowing before somebody wants one. An absent
 * identity is an absence: a Home with no relay account reaches other Picos
 * directly and is not broken (ADR 0118 O4).
 */
export interface PicoRelayIdentityState {
  operator?: string;
  accountId?: string;
  decided?: boolean;
  decidedAt?: string;
  mailboxes: number;
}

export async function readRelayIdentity(
  baseUrl: string,
  options: FoundationAccessOptions,
): Promise<PicoRelayIdentityState> {
  return await fetchJson(
    buildEndpointUrl(baseUrl, '/api/link/relay-identity'),
    isRelayIdentityState,
    'relay identity',
    options,
  );
}

/**
 * ADR 0148. A refusal here is a `409` carrying the count, and it is carried out
 * as itself: "something went wrong" would leave a person to discover that the
 * change would have stranded every relationship they have.
 */
export class PicoRelayIdentityInUseError extends Error {
  public constructor(public readonly mailboxes: number) {
    super(`relay_identity_in_use:${mailboxes}`);
    this.name = 'PicoRelayIdentityInUseError';
  }
}

export async function decideRelayIdentity(
  baseUrl: string,
  options: FoundationAccessOptions,
  input: { operator: string; accountId: string },
): Promise<void> {
  const url = buildEndpointUrl(baseUrl, '/api/link/relay-identity');
  const response = await reachFoundation(url, {
    method: 'POST',
    headers: { ...buildFoundationHeaders(options), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, 'relay account decision');

  if (response.status === 409) {
    const data = (await response.json()) as unknown;
    if (isRecord(data) && data.error === 'mailboxes_exist' && typeof data.mailboxes === 'number') {
      throw new PicoRelayIdentityInUseError(data.mailboxes);
    }
  }

  if (!response.ok) {
    throw new Error(await describeFailure(response, 'Recording the relay account'));
  }
}

/**
 * ADR 0118 O1. Records an appointment or reminder: a memory item that carries
 * the instant the person meant.
 *
 * It goes through the ordinary memory write rather than a route of its own,
 * which is what gives it the same privacy domain, retention and shredding as
 * everything else the person stores. The core names the resulting event
 * `memory.time_bound_entry_recorded` because it carries an instant.
 */
export async function createTimeBoundEntry(
  baseUrl: string,
  options: FoundationAccessOptions,
  input: {
    deviceId: string;
    privacyDomain: string;
    kind: PicoTimeBoundEntryKind;
    title: string;
    dueAt: string;
  },
): Promise<{ memoryItemId: string }> {
  const url = buildEndpointUrl(baseUrl, '/api/events');
  const response = await reachFoundation(url, {
    method: 'POST',
    headers: { ...buildFoundationHeaders(options), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: input.deviceId,
      type: 'memory.recorded',
      payload: {
        privacyDomain: input.privacyDomain,
        contentType: input.kind === 'appointment'
          ? 'application/vnd.pico.appointment'
          : 'application/vnd.pico.reminder',
        content: input.title,
        dueAt: input.dueAt,
      },
    }),
  }, 'time-bound entry');

  if (!response.ok) {
    throw new Error(await describeFailure(response, 'Recording the entry'));
  }

  const data = (await response.json()) as unknown;
  if (!isRecord(data)
    || !isRecord(data.event)
    || !isRecord((data.event as Record<string, unknown>).payload)) {
    throw new Error('The entry response did not carry the recorded event.');
  }
  const payload = (data.event as Record<string, unknown>).payload as Record<string, unknown>;
  if (typeof payload.memoryItemId !== 'string') {
    throw new Error('The entry response did not carry a memory item reference.');
  }
  return { memoryItemId: payload.memoryItemId };
}

/**
 * Reads a privacy domain's content (ADR 0077 Gate C). Authorized by domain
 * readership, not the operator role: in this single-operator instance the
 * operator reads every domain, but that is readership, not administration.
 * Cursor-paged; pass the previous page's `nextCursor` as `after`.
 */
export async function listDomainContent(
  baseUrl: string,
  options: FoundationAccessOptions,
  privacyDomain: string,
  after?: string,
): Promise<MemoryContentListResponse> {
  const url = buildEndpointUrl(baseUrl, `/api/memory/domains/${encodeURIComponent(privacyDomain)}/items`);

  if (after !== undefined) {
    url.searchParams.set('after', after);
  }

  return fetchJson(url, isMemoryContentListResponse, 'memory content', options);
}

async function sendJson<T>(
  url: URL,
  method: 'POST' | 'PUT',
  body: unknown,
  options: FoundationAccessOptions,
  validate: (value: unknown) => value is T,
  label: string,
): Promise<T> {
  const response = await reachFoundation(url, {
    method,
    headers: { ...buildFoundationHeaders(options), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, label);

  if (!response.ok) {
    throw new Error(await describeFailure(response, `Saving the ${label}`));
  }

  const data = (await response.json()) as unknown;

  if (!validate(data)) {
    throw new Error(`${label} endpoint returned an unexpected shape.`);
  }

  return data;
}

/** Surfaces the server's own reason where it sent one; the API answers in plain sentences. */
async function describeFailure(response: Response, action: string): Promise<string> {
  let detail: string | undefined;

  try {
    const data = (await response.json()) as unknown;
    if (isRecord(data) && typeof data.error === 'string') {
      detail = data.error;
    }
  } catch {
    detail = undefined;
  }

  if (response.status === 401) {
    return detail ?? 'An operator session is required.';
  }

  return detail ?? `${action} failed with HTTP ${response.status}.`;
}

export async function mintRealtimeTicket(baseUrl: string, options: FoundationAccessOptions): Promise<string> {
  const response = await fetchJson(
    buildEndpointUrl(baseUrl, '/api/realtime/tickets'),
    isRealtimeTicketResponse,
    'realtime ticket',
    options,
    { method: 'POST' },
  );

  return response.ticket;
}

async function fetchHealth(baseUrl: string): Promise<HealthResponse> {
  return fetchJson(buildEndpointUrl(baseUrl, '/health'), isHealthResponse, 'health');
}

async function fetchSystemStatus(baseUrl: string, options: FoundationAccessOptions): Promise<SystemStatus> {
  return fetchJson(buildEndpointUrl(baseUrl, '/api/system/status'), isSystemStatus, 'system status', options);
}

async function fetchLatestEvents(baseUrl: string, options: FoundationAccessOptions): Promise<{ events: PicoEvent[]; history: EventHistoryStatus }> {
  const eventList = await fetchEventTail(baseUrl, options);

  return {
    events: eventList.events,
    history: {
      loadedCount: eventList.events.length,
      hasMore: eventList.hasMore,
    },
  };
}

async function fetchEventTail(baseUrl: string, options: FoundationAccessOptions): Promise<EventListResponse> {
  const url = buildEndpointUrl(baseUrl, '/api/events/tail');
  url.searchParams.set('limit', String(EVENT_TAIL_LIMIT));

  return fetchJson(url, isEventListResponse, 'events', options);
}

function isModelProviderListResponse(
  value: unknown,
): value is { providers: PicoModelProviderEntryView[] } {
  return isRecord(value)
    && Array.isArray(value.providers)
    && value.providers.every((entry) => isRecord(entry)
      && typeof entry.entryId === 'string'
      && typeof entry.model === 'string'
      && typeof entry.providerClass === 'string'
      && typeof entry.sees === 'string'
      && typeof entry.needsCredentialToSeeMore === 'boolean'
      && isRecord(entry.measured)
      && typeof (entry.measured as Record<string, unknown>).at === 'string'
      && isRecord(entry.effective));
}

function isMemoryEncryptionState(value: unknown): value is PicoMemoryEncryptionState {
  return isRecord(value)
    && typeof value.enabled === 'boolean'
    && typeof value.decided === 'boolean'
    && (value.decidedAt === undefined || typeof value.decidedAt === 'string');
}

function isRelayIdentityState(value: unknown): value is PicoRelayIdentityState {
  return isRecord(value)
    && typeof value.mailboxes === 'number'
    && (value.operator === undefined || typeof value.operator === 'string')
    && (value.accountId === undefined || typeof value.accountId === 'string')
    && (value.decided === undefined || typeof value.decided === 'boolean');
}

async function fetchJson<T>(
  url: URL,
  validate: (value: unknown) => value is T,
  label: string,
  options: FoundationAccessOptions = {},
  init: RequestInit = {},
): Promise<T> {
  const response = await reachFoundation(url, {
    ...init,
    headers: buildFoundationHeaders(options),
  }, label);

  if (!response.ok) {
    throw new Error(`${label} endpoint returned HTTP ${response.status}.`);
  }

  let data: unknown;

  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`${label} endpoint did not return valid JSON: ${formatUnknownError(error)}`);
  }

  if (!validate(data)) {
    throw new Error(`${label} endpoint returned an unexpected JSON shape.`);
  }

  return data;
}

function buildFoundationHeaders(options: FoundationAccessOptions): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const credential = readBearerCredential(options);
  if (credential !== undefined) {
    headers.Authorization = `Bearer ${credential}`;
  }

  return headers;
}

function readBearerCredential(options: FoundationAccessOptions): string | undefined {
  const session = options.operatorSession?.trim();
  if (session !== undefined && session !== '') {
    return session;
  }

  const token = options.foundationToken?.trim();
  if (token !== undefined && token !== '') {
    return token;
  }

  return undefined;
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    isRecord(value)
    && typeof value.ok === 'boolean'
    && typeof value.service === 'string'
    && typeof value.deviceId === 'string'
  );
}

function isSystemStatus(value: unknown): value is SystemStatus {
  return (
    isRecord(value)
    && typeof value.service === 'string'
    && typeof value.version === 'string'
    && typeof value.protocolVersion === 'string'
    && typeof value.deviceId === 'string'
    && isCapabilityMap(value.capabilities)
    && isPicoHomeStatus(value.picoHome)
    && isRecord(value.database)
    && typeof value.database.maxLamport === 'number'
    && Number.isInteger(value.database.maxLamport)
    && Array.isArray(value.database.migrations)
    && value.database.migrations.every(isAppliedMigration)
  );
}

function isCapabilityMap(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every((enabled) => typeof enabled === 'boolean');
}

function isPicoHomeStatus(value: unknown): value is SystemStatus['picoHome'] {
  return (
    isRecord(value)
    && isRecord(value.claimState)
    && typeof value.claimState.state === 'string'
    && picoHomeClaimStates.includes(value.claimState.state as SystemStatus['picoHome']['claimState']['state'])
  );
}

function isAppliedMigration(value: unknown): value is SystemStatus['database']['migrations'][number] {
  return isRecord(value) && typeof value.id === 'string' && typeof value.appliedAt === 'string';
}

function isEventListResponse(value: unknown): value is EventListResponse {
  return (
    isRecord(value)
    && Array.isArray(value.events)
    && value.events.every(isPicoEvent)
    && (value.nextCursor === null || typeof value.nextCursor === 'string')
    && typeof value.hasMore === 'boolean'
  );
}

function isRetentionPolicy(value: unknown): value is RetentionPolicy {
  return (
    isRecord(value)
    && typeof value.retentionPolicyId === 'string'
    && typeof value.displayName === 'string'
    && typeof value.mode === 'string'
    && (memoryRetentionModes as readonly string[]).includes(value.mode)
    && (value.maxAgeDays === undefined || typeof value.maxAgeDays === 'number')
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
  );
}

function isRetentionPolicyListResponse(value: unknown): value is RetentionPolicyListResponse {
  return (
    isRecord(value)
    && Array.isArray(value.retentionPolicies)
    && value.retentionPolicies.every(isRetentionPolicy)
  );
}

function isMemoryContentItem(value: unknown): value is MemoryContentItem {
  return (
    isRecord(value)
    && typeof value.memoryItemId === 'string'
    && typeof value.privacyDomain === 'string'
    && typeof value.contentType === 'string'
    && typeof value.contentPosture === 'string'
    && typeof value.deletionState === 'string'
    && (value.retentionPolicyRef === undefined || typeof value.retentionPolicyRef === 'string')
    && (value.content === undefined || typeof value.content === 'string')
    && (value.contentUnavailable === undefined || typeof value.contentUnavailable === 'string')
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
  );
}

function isMemoryContentListResponse(value: unknown): value is MemoryContentListResponse {
  return (
    isRecord(value)
    && Array.isArray(value.items)
    && value.items.every(isMemoryContentItem)
    && (value.nextCursor === null || typeof value.nextCursor === 'string')
    && typeof value.hasMore === 'boolean'
  );
}

function isRealtimeTicketResponse(value: unknown): value is RealtimeTicketResponse {
  return (
    isRecord(value)
    && typeof value.ticket === 'string'
    && value.ticket !== ''
    && typeof value.expiresAt === 'string'
  );
}

function hasProtocol(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value);
}

function defaultBasePath(location: BrowserLocation): string {
  const currentUrl = new URL(location.href);
  let pathname = currentUrl.pathname;

  if (pathname === '/' || pathname === '') {
    return '';
  }

  if (!pathname.endsWith('/')) {
    const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);

    if (lastSegment.includes('.')) {
      pathname = pathname.slice(0, pathname.lastIndexOf('/'));
    }
  }

  const trimmedPathname = pathname.replace(/\/+$/, '');
  return trimmedPathname === '' ? '' : trimmedPathname;
}

/**
 * Ein Fehlschlag des Transports bekommt hier einen **Satz** statt eines
 * Symptoms (Befund B162, 2026-09-13).
 *
 * **Der Satz stand schon da - dreimal, und einmal schon gedriftet.**
 * `loginOperator`, `sendJson` und `fetchJson` schrieben ihn je selbst, und bei
 * einem fehlte der Artikel. Zehn weitere Aufrufe hatten ihn gar nicht: dort
 * drang `fetch failed` oder `NetworkError` nach aussen, also das, was die
 * Plattform gerade sagt. ADR 0131 A7 verlangt fuer genau diese Lage einen
 * Satz - "nichts wartet" und "niemand hat nachgesehen" sind verschiedene
 * Auskuenfte -, und was der Link-Klient auf seiner Seite tut, tut diese Flaeche
 * jetzt auf ihrer.
 *
 * **Die Statusbehandlung bleibt bei den Aufrufern.** Ein 401 heisst hier etwas
 * anderes als ein 409, und das gehoert dorthin, wo der Unterschied etwas
 * bedeutet. Gefaltet ist nur, was ueberall dasselbe war.
 *
 * **Hier gehoert auch die Frist hin**, wenn sie entschieden ist: die dreizehn
 * Aufrufe dieser Datei haben keine, und ein Browser bricht `fetch` von sich
 * aus nicht ab (Befund B160, offener Punkt 4 im Handoff). Ein Signal an dieser
 * einen Stelle deckt sie alle.
 */
async function reachFoundation(
  url: URL,
  init: RequestInit,
  label: string,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw new Error(
      `Could not reach the ${label} endpoint at ${url.toString()}: ${formatUnknownError(error)}`,
    );
  }
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
