import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  buildPicoHomeClaimSignatureInput,
  validateFoundationEventPayload,
  foundationEventTypes,
  serverSynthesizedFoundationEventTypes,
  payloadPostures,
  picoEventTypes,
  picoHomeClaimEnvelopeSchema,
  picoHomeSealedClaimPayloadSchema,
  picoIdentitySuite,
  protocolCapabilities,
  memoryRetentionModes,
  realtimeMessageType,
  writablePayloadPostures,
  type FoundationEventPayload,
  type FoundationEventType,
  type MemoryRecordedPayload,
  type MemoryRetentionMode,
  type MemoryTombstonePayload,
  type PayloadPosture,
  type PicoCoreConnectedMessage,
  type PicoEvent,
  type PicoEventCreatedMessage,
  type PicoEventCreateResponse,
  type PicoEventListResponse,
  type PicoEventType,
  type PicoHealthResponse,
  type PicoHomeClaimEnvelope,
  type PicoHomeClaimResponse,
  type PicoHomeClaimStateResponse,
  type PicoHomeClaimSignatureInput,
  type PicoHomeSealedClaimPayload,
  type PicoHomeSetupResponse,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoMemoryContentItem,
  type PicoMemoryContentListResponse,
  type PicoRealtimeTicketResponse,
  type PicoRetentionPolicyListResponse,
  type PicoRetentionPolicyResponse,
  type PicoSystemStatusResponse,
  type PicoSystemVersionResponse,
} from '@pico/protocol';
import {
  verifyPicoIdentityDetachedSignature,
  verifyPicoIdentityKeyRecordFingerprint,
} from '@pico/identity';
import sodium from 'libsodium-wrappers-sumo';
import { LamportClock } from '@pico/sync';
import { EventFactory } from './event-factory.js';
import { EventStore, type EventCursor, type PicoHomeClaimState } from './event-store.js';
import type { MemoryContentCursor, MemoryItem, MemoryStore } from './memory-store.js';
import { SoleResidentReadership, type DomainReadership } from './domain-readership.js';
import { registerWebDashboard } from './static-web.js';
import { assertKeyStoreSeparation, KeyStore } from './key-store.js';
import { MemoryContentCrypto } from './memory-content-crypto.js';
import { RetentionSweeper } from './retention-sweep.js';
import { AccessClassRegistry, DESTRUCTIVE_CONFIRM_FIELD, isFoundationApiRoute, type AccessClass } from './access-classes.js';
import { OperatorOverloadedError, type OperatorStore } from './operator-store.js';
import { SessionStore } from './session-store.js';
import { consumeOperatorResetMarker, OperatorBootstrapCode } from './operator-bootstrap.js';
import { shredDomainWithAudit } from './domain-shred.js';
import { defaultWebRootPath, type CoreConfig } from './config.js';
import {
  assertHomeHostKeyStoreSeparation,
  consumeHomeResetMarker,
  HomeHostKeyStore,
  MoveInCode,
  type HomeHostKeyPairSet,
} from './home-setup.js';

const SERVICE_VERSION = '0.1.7';
const PROTOCOL_VERSION = '0.1.7';
const DEFAULT_EVENT_LIMIT = 100;
const MAX_EVENT_LIMIT = 500;
const MAX_TEXT_LENGTH = 8_000;
const MAX_PAYLOAD_BYTES = 32 * 1024;
const REQUEST_BODY_LIMIT_BYTES = MAX_PAYLOAD_BYTES + (8 * 1024);
const MAX_INCOMING_LAMPORT = 1_000_000_000;
const WEBSOCKET_KEEPALIVE_INTERVAL_MS = 30_000;
const RETENTION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const REALTIME_TICKET_TTL_MS = 30_000;
const MAX_OUTSTANDING_REALTIME_TICKETS = 128;

const serverOnlyEventTypes = new Set<FoundationEventType>(serverSynthesizedFoundationEventTypes);
const writableEventTypes = new Set<FoundationEventType>(
  foundationEventTypes.filter((type) => !serverOnlyEventTypes.has(type)),
);
const knownEventTypes = new Set<PicoEventType>(picoEventTypes);

interface IncomingEventBody {
  deviceId?: unknown;
  sessionId?: unknown;
  type?: unknown;
  stream?: unknown;
  lamport?: unknown;
  payload?: unknown;
  payloadPosture?: unknown;
}

interface ValidatedIncomingEventBody {
  deviceId: string;
  sessionId?: string;
  type: FoundationEventType;
  stream?: string;
  lamport?: number;
  payload: FoundationEventPayload;
  payloadPosture?: PayloadPosture;
}

interface MemoryRecordedRequest {
  deviceId: string;
  sessionId?: string;
  stream?: string;
  lamport?: number;
  privacyDomain: string;
  contentType: string;
  content: string;
  summary?: string;
  owner?: string;
  controller?: string;
  retentionPolicyRef?: string;
}

interface RealtimeSocket {
  readyState: number;
  OPEN: number;
  isAlive?: boolean;
  send(payload: string): void;
  ping(): void;
  terminate(): void;
  on(event: 'close' | 'pong', listener: () => void): void;
}

interface RealtimeTicketRecord {
  expiresAtMs: number;
  // Set when the ticket was minted under an operator session: revoking that
  // session invalidates its outstanding tickets (ADR 0076).
  sessionDigest?: string;
}

interface PicoHomeClaimRequestContext {
  homeHostKeyStore: HomeHostKeyStore;
  homeHostKeys: HomeHostKeyPairSet;
  homeSetupNonceHex: string;
}

type ParsedPicoHomeClaimRequest =
  | {
    ok: true;
    moveInCode: unknown;
    homeHostPicoId: string;
  }
  | {
    ok: false;
    statusCode: number;
    error: string;
  };

// Which authority a request carries. The bearer header holds either the
// principal-less static token or an operator session; they are resolved apart
// so the token can never reach beyond its ceiling (ADR 0075).
type RequestAuthority = 'operator' | 'static-token' | 'none';

export async function buildApp(config: CoreConfig): Promise<FastifyInstance> {
  // Fail loudly on a key/backup-separation misconfiguration before opening any
  // resource (ADR 0072 R6).
  const keyStorePath = config.keyStorePath ?? join(dirname(config.databasePath), 'keys');
  const homeHostKeyStorePath = config.homeHostKeyStorePath ?? join(dirname(config.databasePath), 'home-host-keys');
  assertKeyStoreSeparation({
    keyStorePath,
    databasePath: config.databasePath,
    backupDirectory: config.backupDirectory ?? join(dirname(config.databasePath), 'backups'),
  });
  assertHomeHostKeyStoreSeparation({
    homeHostKeyStorePath,
    keyStorePath,
    databasePath: config.databasePath,
    backupDirectory: config.backupDirectory ?? join(dirname(config.databasePath), 'backups'),
  });

  // Memory-content encryption is off by default: content stays plaintext
  // foundation data (ADR 0070). When enabled, the domain_encrypted posture
  // becomes usable (ADR 0071 suite, ADR 0073 AD, ADR 0072 key store).
  // libsodium is needed unconditionally now: the operator credential uses its
  // Argon2id (ADR 0076), whether or not memory encryption is on.
  await sodium.ready;

  let memoryCrypto: MemoryContentCrypto | undefined;
  if (config.memoryEncryption === true) {
    memoryCrypto = new MemoryContentCrypto(sodium, new KeyStore(keyStorePath));
  }

  const app = Fastify({
    logger: {
      ...(config.logDestination === undefined ? {} : { stream: config.logDestination }),
      serializers: {
        req(request: { method?: string; url?: string; host?: string; remoteAddress?: string; remotePort?: number }) {
          return {
            method: request.method,
            url: redactTicketQueryValue(request.url),
            host: request.host,
            remoteAddress: request.remoteAddress,
            remotePort: request.remotePort,
          };
        },
      },
    },
    bodyLimit: REQUEST_BODY_LIMIT_BYTES,
  });
  await app.register(websocket);
  registerWebDashboard(app, config.webRootPath ?? defaultWebRootPath());

  const store = await EventStore.open(config.databasePath, {
    backupDirectory: config.backupDirectory,
    memoryCrypto,
  });
  const clock = new LamportClock(store.maxLamport());
  const factory = new EventFactory(clock);
  const sockets = new Set<RealtimeSocket>();
  const realtimeTickets = new Map<string, RealtimeTicketRecord>();
  const operators: OperatorStore = store.operators(sodium);
  const sessions = new SessionStore();
  const bootstrapCode = new OperatorBootstrapCode();
  const moveInCode = new MoveInCode();
  const homeHostKeyStore = new HomeHostKeyStore(homeHostKeyStorePath);
  let homeHostKeys: HomeHostKeyPairSet | undefined;
  let homeSetupNonceHex: string | undefined;
  const accessClasses = new AccessClassRegistry();
  // Domain readership for the `domain-content` class (ADR 0077 A7 seam). A
  // distinct authority from the operator role; the foundation-phase default
  // resolves to the sole principal reading every domain (ADR 0077 C1).
  const readership: DomainReadership = config.readership ?? new SoleResidentReadership();

  function appendServerEvent(type: FoundationEventType, payload: FoundationEventPayload): void {
    const event = factory.create({ deviceId: config.deviceId, type, payload });

    if (store.append(event) === 'inserted') {
      broadcast(event);
    }
  }

  function activateHomeSetupMode(): void {
    const claimState = store.picoHomeClaimState();
    if (claimState.state !== 'unclaimed') {
      moveInCode.clear();
      homeSetupNonceHex = undefined;
      return;
    }

    homeHostKeys = homeHostKeyStore.ensure(sodium);
    homeSetupNonceHex = randomBytes(32).toString('hex');
    const code = moveInCode.mint();

    app.log.warn(
      {
        picoHomeMoveInCode: code,
        claimEndpoint: '/api/home/claim',
        hostSetupNonceHex: homeSetupNonceHex,
        hostSigningKeyFingerprintHex: homeHostKeys.publicBundle.signingKeyFingerprintHex,
        hostKeyAgreementKeyFingerprintHex: homeHostKeys.publicBundle.keyAgreementKeyFingerprintHex,
      },
      'Pico Home is unclaimed. The Move-In Code is valid for this process only and must be read from this local host channel.',
    );
  }

  // An explicit local reset clears the operator and returns the host to
  // bootstrap (ADR 0076). Creating the marker requires filesystem control, and
  // it is consumed here so a reset happens once, not on every restart. It never
  // touches keys, memory content or the event log.
  if (consumeOperatorResetMarker(config.databasePath)) {
    const cleared = operators.clear();
    const revokedSessions = sessions.revokeAll();

    if (cleared) {
      appendServerEvent('auth.operator_reset', { reason: 'local reset marker' });
    }

    if (revokedSessions > 0) {
      appendServerEvent('auth.sessions_revoked', { revokedSessions });
    }

    app.log.warn('Foundation operator cleared by local reset marker; the host is back in bootstrap.');
  }

  if (consumeHomeResetMarker(config.databasePath)) {
    const removed = homeHostKeyStore.clear();
    store.resetPicoHome();
    homeHostKeys = undefined;
    homeSetupNonceHex = undefined;
    moveInCode.clear();
    appendServerEvent('home.reset', {});
    app.log.warn(
      { removedHostKeyFiles: removed.removedFiles },
      'Pico Home reset by local reset marker; host identity keys were removed and setup mode will mint a fresh Move-In Code.',
    );
  }

  activateHomeSetupMode();

  // While no operator exists, mint the per-process bootstrap code and surface it
  // on the host's local channel only (ADR 0076). A restart mints a new one.
  if (!operators.exists()) {
    const code = bootstrapCode.mint();
    app.log.warn(
      { operatorBootstrapCode: code },
      'No Foundation operator exists. Bootstrap one by POSTing this code and a passphrase to /api/auth/bootstrap. '
      + 'This code is valid for this process only and is single-use.',
    );
  }
  const websocketKeepalive = setInterval(() => {
    for (const socket of sockets) {
      if (socket.isAlive === false) {
        socket.terminate();
        sockets.delete(socket);
        continue;
      }

      socket.isAlive = false;

      if (socket.readyState === socket.OPEN) {
        socket.ping();
      }
    }
  }, WEBSOCKET_KEEPALIVE_INTERVAL_MS);

  websocketKeepalive.unref();

  // Retention sweep (ADR 0074): deletion-only, fail-safe, runs on boot and
  // periodically. A no-op until items reference a delete_after_max_age policy.
  const retentionSweeper = new RetentionSweeper(
    store.memory(),
    store.retentionPolicies(),
    ({ memoryItemId, privacyDomain, reason }) => {
      const tombstone = factory.create({
        deviceId: config.deviceId,
        type: 'memory.tombstone',
        payload: { memoryItemId, privacyDomain, reason },
      });
      if (store.append(tombstone) === 'inserted') {
        broadcast(tombstone);
      }
    },
  );

  function runRetentionSweep(): void {
    try {
      retentionSweeper.sweep();
    } catch (error) {
      app.log.error({ err: error }, 'retention sweep failed');
    }
  }

  runRetentionSweep();
  const retentionSweep = setInterval(runRetentionSweep, RETENTION_SWEEP_INTERVAL_MS);
  retentionSweep.unref();

  app.addHook('onClose', async () => {
    clearInterval(websocketKeepalive);
    clearInterval(retentionSweep);
    sockets.clear();
    store.close();
  });

  function broadcast(event: PicoEvent): void {
    const message: PicoEventCreatedMessage = { type: realtimeMessageType.eventCreated, event };
    const serialized = JSON.stringify(message);

    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(serialized);
      }
    }
  }

  // Fail closed at registration time: a Foundation API route without an access
  // class must not become routable (ADR 0075 A2/A3). This is why the registry is
  // a mechanism and not a checklist — forgetting a class breaks the boot.
  app.addHook('onRoute', (routeOptions) => {
    const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];

    for (const method of methods) {
      accessClasses.assertClassified(method, routeOptions.url);
    }
  });

  /**
   * Resolves the single bearer credential to one authority. The static token and
   * an operator session share the header, so they are told apart here: the token
   * is matched first, and anything else is looked up in the session store.
   */
  function resolveAuthority(authorizationHeader: string | string[] | undefined): RequestAuthority {
    if (config.foundationToken !== undefined && isBearerTokenAuthorized(authorizationHeader, config.foundationToken)) {
      return 'static-token';
    }

    if (sessions.touch(readBearerCredential(authorizationHeader)) !== undefined) {
      return 'operator';
    }

    return 'none';
  }

  app.addHook('onRequest', async (request, reply) => {
    const routeUrl = request.routeOptions?.url;

    if (routeUrl === undefined || !isFoundationApiRoute(routeUrl)) {
      return;
    }

    const accessClass = accessClasses.lookup(request.method, routeUrl);

    if (accessClass === undefined) {
      // Defence in depth: the onRoute hook should have caught this at boot.
      request.log.error({ route: routeUrl }, 'Foundation API route has no access class.');
      return reply.code(500).send({ error: 'Route is not classified.' });
    }

    if (accessClass === 'public') {
      return;
    }

    if (accessClass === 'setup-bootstrap') {
      if (routeUrl === '/api/auth/bootstrap') {
        // Only reachable while the host has no operator (ADR 0075 A10).
        if (operators.exists()) {
          return reply.code(404).send({ error: 'Foundation operator bootstrap is not available.' });
        }

        return;
      }

      if (routeUrl === '/api/home/setup' || routeUrl === '/api/home/claim') {
        // Only reachable while no Home exists (ADR 0080 M2). This is separate
        // from the operator bootstrap: either can exist without the other.
        if (store.picoHomeClaimState().state !== 'unclaimed') {
          return reply.code(404).send({ error: 'Pico Home setup is not available.' });
        }

        return;
      }

      request.log.error({ route: routeUrl }, 'setup-bootstrap route is not scoped.');
      return reply.code(500).send({ error: 'Setup route is not scoped.' });
    }

    const authority = resolveAuthority(request.headers.authorization);

    if (accessClass === 'foundation-diagnostic') {
      if (authority !== 'none') {
        return;
      }

      // Unchanged trusted-local behaviour only while nothing claims this host:
      // no token configured and no operator bootstrapped. Establishing an
      // operator is an explicit act and means the API needs a credential.
      if (config.foundationToken === undefined && !operators.exists()) {
        return;
      }

      return unauthorized(reply, 'Foundation credential is required.');
    }

    if (accessClass === 'domain-content') {
      // Readership is a DISTINCT authority from the operator role (ADR 0077 C1):
      // this branch runs the readership evaluation and must NOT fall through to
      // the operator check below, or being the operator would authorize a read.
      // It needs an authenticated session principal — the principal-less static
      // token is capped at foundation-diagnostic and cannot reach here — plus a
      // positive readership evaluation for the target domain. Swapping the
      // readership policy narrows what the operator reads without touching this
      // authentication gate; that is the seam a second principal plugs into.
      if (authority !== 'operator') {
        return unauthorized(reply, 'Foundation operator session is required.');
      }

      const privacyDomain = (request.params as { privacyDomain?: string }).privacyDomain;
      const sessionDigest = sessions.digestOf(readBearerCredential(request.headers.authorization)) ?? '';

      if (privacyDomain === undefined || !readership.mayRead({ sessionDigest }, privacyDomain)) {
        // Non-enumerating denial (ADR 0077 C4): does not reveal whether the
        // domain exists or holds content.
        return sendNoStore(reply.code(404), { error: 'Not found.' });
      }

      return;
    }

    // Every remaining class needs the operator role, so the principal-less
    // static token cannot reach them: its ceiling is foundation-diagnostic
    // (ADR 0075).
    if (authority !== 'operator') {
      return unauthorized(reply, 'Foundation operator session is required.');
    }
  });

  // Irreversible operations must carry an explicit confirmation (ADR 0075 A8).
  // Enforced here rather than left to each handler, so a destructive route
  // cannot be added without one; the handler still checks that the confirmed
  // name matches the actual target. This runs after body parsing.
  app.addHook('preHandler', async (request, reply) => {
    const routeUrl = request.routeOptions?.url;

    if (routeUrl === undefined || accessClasses.lookup(request.method, routeUrl) !== 'host-admin-destructive') {
      return;
    }

    const body = request.body;
    const confirm = isRecord(body) ? body[DESTRUCTIVE_CONFIRM_FIELD] : undefined;

    if (!isNonEmptyString(confirm, 256)) {
      return sendNoStore(reply.code(400), {
        error: `This operation is irreversible and requires "${DESTRUCTIVE_CONFIRM_FIELD}" to name the exact target.`,
      });
    }
  });

  // The access class of every Foundation API route (ADR 0075 table, ADR 0076
  // route shapes). `/api/auth/*` is deliberately not diagnostic: the login and
  // bootstrap surfaces must be reachable without the static token, or the token
  // would become a prerequisite for the principal that outranks it.
  accessClasses.register('POST', '/api/auth/bootstrap', 'setup-bootstrap');
  accessClasses.register('GET', '/api/home/setup', 'setup-bootstrap');
  accessClasses.register('POST', '/api/home/claim', 'setup-bootstrap');
  accessClasses.register('POST', '/api/auth/session', 'public');
  accessClasses.register('GET', '/api/auth/session', 'authenticated');
  accessClasses.register('DELETE', '/api/auth/session', 'authenticated');
  accessClasses.register('DELETE', '/api/auth/sessions', 'host-admin');
  accessClasses.register('PUT', '/api/auth/credential', 'host-admin');
  // Retention policies decide when memory is deleted, so administering them is
  // a host-admin power (ADR 0074 behind ADR 0075 Gate A). They are policy
  // objects, never content: an operator session grants no readership.
  accessClasses.register('GET', '/api/memory/retention-policies', 'host-admin');
  accessClasses.register('POST', '/api/memory/retention-policies', 'host-admin');
  accessClasses.register('GET', '/api/memory/retention-policies/:retentionPolicyId', 'host-admin');
  accessClasses.register('PUT', '/api/memory/retention-policies/:retentionPolicyId', 'host-admin');
  accessClasses.register('DELETE', '/api/memory/retention-policies/:retentionPolicyId', 'host-admin');
  // Destroying a domain's keys is irreversible by design, so it is the one
  // class that needs an operator session *and* explicit confirmation of the
  // exact target (ADR 0075 Gate B / A8, ADR 0071 step 4).
  accessClasses.register('POST', '/api/memory/domains/:privacyDomain/shred', 'host-admin-destructive');
  // The memory content read surface (ADR 0075 Gate C, ADR 0077). `domain-content`
  // is authorized by domain readership, not the operator role: an operator
  // session alone does not read content, and the static token never reaches here.
  accessClasses.register('GET', '/api/memory/domains/:privacyDomain/items', 'domain-content');
  accessClasses.register('GET', '/api/memory/domains/:privacyDomain/items/:memoryItemId', 'domain-content');
  accessClasses.register('GET', '/api/system/version', 'foundation-diagnostic');
  accessClasses.register('GET', '/api/system/status', 'foundation-diagnostic');
  accessClasses.register('POST', '/api/realtime/tickets', 'foundation-diagnostic');
  accessClasses.register('GET', '/api/events', 'foundation-diagnostic');
  accessClasses.register('GET', '/api/events/tail', 'foundation-diagnostic');
  accessClasses.register('POST', '/api/events', 'foundation-diagnostic');

  app.get('/health', async (): Promise<PicoHealthResponse> => ({
    ok: true,
    service: 'pico-home-core',
    deviceId: config.deviceId,
  }));

  app.get('/api/system/version', async (_request, reply) => {
    const response: PicoSystemVersionResponse = {
      service: 'pico-home-core',
      version: SERVICE_VERSION,
      protocolVersion: PROTOCOL_VERSION,
    };

    return sendNoStore(reply, response);
  });

  app.get('/api/system/status', async (_request, reply) => {
    const response: PicoSystemStatusResponse = {
      service: 'pico-home-core',
      version: SERVICE_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      deviceId: config.deviceId,
      capabilities: protocolCapabilities,
      picoHome: {
        claimState: toPicoHomeClaimStateResponse(store.picoHomeClaimState(), moveInCode.isPending()),
      },
      database: {
        maxLamport: store.maxLamport(),
        migrations: store.appliedMigrations(),
      },
    };

    return sendNoStore(reply, response);
  });

  app.get('/api/home/setup', async (_request, reply) => {
    if (homeHostKeys === undefined || homeSetupNonceHex === undefined || !moveInCode.isPending()) {
      return sendNoStore(reply.code(409), { error: 'Pico Home setup mode is not active.' });
    }

    const response: PicoHomeSetupResponse = {
      setupMode: {
        active: true,
        moveInCodePending: true,
        claimEndpoint: '/api/home/claim',
        hostSetupNonceHex: homeSetupNonceHex,
      },
      host: {
        suite: homeHostKeys.publicBundle.suite,
        signingPublicKeyHex: homeHostKeys.publicBundle.signingPublicKeyHex,
        signingKeyFingerprintHex: homeHostKeys.publicBundle.signingKeyFingerprintHex,
        keyAgreementPublicKeyHex: homeHostKeys.publicBundle.keyAgreementPublicKeyHex,
        keyAgreementKeyFingerprintHex: homeHostKeys.publicBundle.keyAgreementKeyFingerprintHex,
      },
    };

    return sendNoStore(reply, response);
  });

  app.post('/api/home/claim', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;

    if (homeHostKeys === undefined || homeSetupNonceHex === undefined || !moveInCode.isPending()) {
      return sendNoStore(reply.code(409), { error: 'Pico Home setup mode is not active.' });
    }

    const claimRequest = readPicoHomeClaimRequest(body, {
      homeHostKeyStore,
      homeHostKeys,
      homeSetupNonceHex,
    });
    if (!claimRequest.ok) {
      return sendNoStore(reply.code(claimRequest.statusCode), { error: claimRequest.error });
    }

    const code = moveInCode.consume(claimRequest.moveInCode);
    if (!code.ok) {
      return sendNoStore(reply.code(code.exhausted ? 429 : 401), {
        error: code.exhausted
          ? 'Move-In Code is exhausted; restart the Pico Home process to mint a fresh code.'
          : 'Move-In Code is invalid.',
      });
    }

    let claimState: PicoHomeClaimState;
    try {
      claimState = store.claimPicoHome({
        homeId: createHomeId(),
        hostAdminPicoId: claimRequest.homeHostPicoId,
        hostSigningKeyFingerprintHex: homeHostKeys.publicBundle.signingKeyFingerprintHex,
        hostKeyAgreementKeyFingerprintHex: homeHostKeys.publicBundle.keyAgreementKeyFingerprintHex,
      });
    } catch (error) {
      return sendNoStore(reply.code(409), { error: (error as Error).message });
    }

    appendServerEvent('home.claimed', {});
    homeSetupNonceHex = undefined;
    app.log.warn(
      {
        homeId: claimState.homeId,
        homeHostPicoId: claimState.hostAdminPicoId,
        hostSigningKeyFingerprintHex: claimState.hostSigningKeyFingerprintHex,
        hostKeyAgreementKeyFingerprintHex: claimState.hostKeyAgreementKeyFingerprintHex,
      },
      'Pico Home claimed; setup mode ended.',
    );

    const response: PicoHomeClaimResponse = {
      claimState: toPicoHomeClaimStateResponse(claimState, moveInCode.isPending()) as PicoHomeClaimResponse['claimState'],
    };

    return reply.code(201).header('Cache-Control', 'no-store').send(response);
  });

  app.post('/api/auth/bootstrap', async (request, reply) => {
    const body = (request.body ?? {}) as { bootstrapCode?: unknown; passphrase?: unknown };

    // Consume the code first: a wrong code must not reach the KDF at all.
    if (!bootstrapCode.consume(body.bootstrapCode)) {
      return reply.code(401).send({ error: 'Bootstrap code is invalid.' });
    }

    try {
      await operators.create(body.passphrase as string);
    } catch (error) {
      if (error instanceof OperatorOverloadedError) {
        return reply.code(503).send({ error: 'Too many credential operations in flight.' });
      }

      // The code is spent either way; a failed attempt must not leave a usable
      // one behind. Re-mint so a legitimate operator can retry from the log.
      const code = bootstrapCode.mint();
      app.log.warn({ operatorBootstrapCode: code }, 'Operator bootstrap failed; a new bootstrap code was minted.');

      return reply.code(400).send({ error: (error as Error).message });
    }

    appendServerEvent('auth.operator_bootstrapped', {});
    app.log.warn('Foundation operator bootstrapped.');

    const session = sessions.issue();

    return reply
      .code(201)
      .header('Cache-Control', 'no-store')
      .send({ session: session.value, expiresAt: new Date(session.expiresAtMs).toISOString() });
  });

  app.post('/api/auth/session', async (request, reply) => {
    const body = (request.body ?? {}) as { passphrase?: unknown };

    let verified: boolean;

    try {
      verified = await operators.verify(body.passphrase as string);
    } catch (error) {
      if (error instanceof OperatorOverloadedError) {
        return reply.code(503).send({ error: 'Too many credential operations in flight.' });
      }

      throw error;
    }

    if (!verified) {
      // Uniform failure: a wrong passphrase and an absent operator must not be
      // distinguishable. Failed logins stay in operational logging and never
      // reach the append-only log (ADR 0075 A9).
      request.log.warn('Foundation operator login failed.');

      return unauthorized(reply, 'Foundation operator credentials are invalid.');
    }

    const session = sessions.issue();

    return reply
      .code(201)
      .header('Cache-Control', 'no-store')
      .send({ session: session.value, expiresAt: new Date(session.expiresAtMs).toISOString() });
  });

  app.get('/api/auth/session', async (request, reply) => {
    // The onRequest hook already validated and extended the session.
    const touched = sessions.touch(readBearerCredential(request.headers.authorization));

    if (touched === undefined) {
      return unauthorized(reply, 'Foundation operator session is required.');
    }

    return sendNoStore(reply, { expiresAt: new Date(touched.expiresAtMs).toISOString() });
  });

  app.delete('/api/auth/session', async (request, reply) => {
    const credential = readBearerCredential(request.headers.authorization);
    const sessionDigest = sessions.digestOf(credential);

    sessions.revoke(credential);

    if (sessionDigest !== undefined) {
      purgeSessionRealtimeTickets(realtimeTickets, sessionDigest);
    }

    return reply.code(204).send();
  });

  app.delete('/api/auth/sessions', async (_request, reply) => {
    const revokedSessions = sessions.revokeAll();
    purgeAllSessionRealtimeTickets(realtimeTickets);

    if (revokedSessions > 0) {
      appendServerEvent('auth.sessions_revoked', { revokedSessions });
    }

    return sendNoStore(reply, { revokedSessions });
  });

  app.put('/api/auth/credential', async (request, reply) => {
    const body = (request.body ?? {}) as { currentPassphrase?: unknown; passphrase?: unknown };

    let changed: boolean;

    try {
      changed = await operators.changePassphrase(body.currentPassphrase as string, body.passphrase as string);
    } catch (error) {
      if (error instanceof OperatorOverloadedError) {
        return reply.code(503).send({ error: 'Too many credential operations in flight.' });
      }

      return reply.code(400).send({ error: (error as Error).message });
    }

    if (!changed) {
      // A live session is not enough: the current passphrase is required so a
      // stolen session cannot lock the real operator out (ADR 0076).
      return unauthorized(reply, 'Current operator passphrase is invalid.');
    }

    appendServerEvent('auth.credential_changed', {});

    // Replacing the credential ends every session, including this one.
    const revokedSessions = sessions.revokeAll();
    purgeAllSessionRealtimeTickets(realtimeTickets);

    if (revokedSessions > 0) {
      appendServerEvent('auth.sessions_revoked', { revokedSessions });
    }

    return sendNoStore(reply, { revokedSessions });
  });

  app.get('/api/memory/retention-policies', async (_request, reply) => {
    const response: PicoRetentionPolicyListResponse = {
      retentionPolicies: store.retentionPolicies().list(),
    };

    return sendNoStore(reply, response);
  });

  app.post('/api/memory/retention-policies', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const input = validateRetentionPolicyBody(body, { requireFullShape: true });

    if (!input.ok) {
      return sendNoStore(reply.code(400), { error: input.error });
    }

    let policy: PicoRetentionPolicyResponse;

    try {
      policy = store.retentionPolicies().create({
        retentionPolicyId: input.value.retentionPolicyId as string,
        displayName: input.value.displayName as string,
        mode: input.value.mode as MemoryRetentionMode,
        ...(input.value.maxAgeDays === undefined ? {} : { maxAgeDays: input.value.maxAgeDays }),
      });
    } catch (error) {
      return sendNoStore(reply.code(400), { error: (error as Error).message });
    }

    return reply.code(201).header('Cache-Control', 'no-store').send(policy);
  });

  app.get('/api/memory/retention-policies/:retentionPolicyId', async (request, reply) => {
    const { retentionPolicyId } = request.params as { retentionPolicyId: string };
    const policy = store.retentionPolicies().get(retentionPolicyId);

    if (policy === undefined) {
      return sendNoStore(reply.code(404), { error: 'Retention policy not found.' });
    }

    return sendNoStore(reply, policy);
  });

  app.put('/api/memory/retention-policies/:retentionPolicyId', async (request, reply) => {
    const { retentionPolicyId } = request.params as { retentionPolicyId: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const input = validateRetentionPolicyBody(body, { requireFullShape: false });

    if (!input.ok) {
      return sendNoStore(reply.code(400), { error: input.error });
    }

    if (input.value.retentionPolicyId !== undefined && input.value.retentionPolicyId !== retentionPolicyId) {
      return sendNoStore(reply.code(400), { error: 'retentionPolicyId cannot be changed.' });
    }

    if (store.retentionPolicies().get(retentionPolicyId) === undefined) {
      return sendNoStore(reply.code(404), { error: 'Retention policy not found.' });
    }

    try {
      // An edit takes effect at the next sweep for every item that references
      // this policy (ADR 0074): policies are inspectable and revocable, so
      // shortening one can expire existing items sooner.
      const policy = store.retentionPolicies().update(retentionPolicyId, {
        ...(input.value.displayName === undefined ? {} : { displayName: input.value.displayName as string }),
        ...(input.value.mode === undefined ? {} : { mode: input.value.mode as MemoryRetentionMode }),
        ...('maxAgeDays' in body ? { maxAgeDays: input.value.maxAgeDays } : {}),
      });

      return sendNoStore(reply, policy);
    } catch (error) {
      return sendNoStore(reply.code(400), { error: (error as Error).message });
    }
  });

  app.delete('/api/memory/retention-policies/:retentionPolicyId', async (request, reply) => {
    const { retentionPolicyId } = request.params as { retentionPolicyId: string };

    // Revoking a policy never deletes memory: items that still reference it
    // fall back to fail-safe keep (ADR 0074).
    if (store.retentionPolicies().delete(retentionPolicyId) === 'not_found') {
      return sendNoStore(reply.code(404), { error: 'Retention policy not found.' });
    }

    return reply.code(204).send();
  });

  app.post('/api/memory/domains/:privacyDomain/shred', async (request, reply) => {
    const { privacyDomain } = request.params as { privacyDomain: string };
    const body = (request.body ?? {}) as { confirm?: unknown; reason?: unknown };

    // The preHandler proved a confirmation exists; it must also name this
    // domain, so a mis-addressed request cannot shred a different one.
    if (body.confirm !== privacyDomain) {
      return sendNoStore(reply.code(400), {
        error: 'confirm must repeat the exact privacy domain being shredded.',
      });
    }

    if (body.reason !== undefined && !isNonEmptyString(body.reason, 1_000)) {
      return sendNoStore(reply.code(400), { error: 'reason must be a non-empty string when provided.' });
    }

    // Without encryption there are no keys to destroy, so a "shred" would
    // remove nothing while sounding final. Refuse rather than lie (ADR 0070).
    if (memoryCrypto === undefined) {
      return sendNoStore(reply.code(409), {
        error: 'Crypto-shred requires memory encryption. Content is plaintext at rest, so destroying keys would protect nothing.',
      });
    }

    const { removedKeyVersions } = shredDomainWithAudit(
      store.memory(),
      (audit) => {
        appendServerEvent('memory.domain_shredded', audit);
      },
      {
        privacyDomain,
        ...(body.reason === undefined ? {} : { reason: body.reason as string }),
      },
    );

    request.log.warn({ privacyDomain, removedKeyVersions }, 'Privacy domain crypto-shredded.');

    return sendNoStore(reply, { privacyDomain, removedKeyVersions });
  });

  // Memory content read API (ADR 0075 Gate C, ADR 0077). Readership for the
  // target domain was already enforced in the onRequest hook (domain-content).
  // Here we only page and resolve content: the store decrypts in-process and
  // reports contentUnavailable for a crypto-shredded item (ADR 0071); the API
  // adds no at-rest or transport confidentiality (ADR 0077 C7).
  app.get('/api/memory/domains/:privacyDomain/items', async (request, reply) => {
    const { privacyDomain } = request.params as { privacyDomain: string };
    const query = request.query as { limit?: string; after?: string };

    const limitResult = parseLimit(query.limit);
    if (!limitResult.ok) {
      return sendNoStore(reply.code(400), { error: limitResult.error });
    }

    const cursorResult = parseMemoryContentCursor(query.after);
    if (!cursorResult.ok) {
      return sendNoStore(reply.code(400), { error: cursorResult.error });
    }

    const page = store.memory().listInDomainPage(privacyDomain, {
      limit: limitResult.limit,
      after: cursorResult.cursor,
    });

    const response: PicoMemoryContentListResponse = {
      items: page.items.map(toMemoryContentItem),
      nextCursor: page.nextCursor === null ? null : encodeMemoryContentCursor(page.nextCursor),
      hasMore: page.hasMore,
    };

    return sendNoStore(reply, response);
  });

  app.get('/api/memory/domains/:privacyDomain/items/:memoryItemId', async (request, reply) => {
    const { privacyDomain, memoryItemId } = request.params as { privacyDomain: string; memoryItemId: string };
    const item = store.memory().getInDomain(memoryItemId, privacyDomain);

    // Deleted and tombstoned items are not content; a missing item and a
    // non-readable one answer the same way (ADR 0077 C4/C5).
    if (item === undefined || item.deletionState !== 'active') {
      return sendNoStore(reply.code(404), { error: 'Not found.' });
    }

    return sendNoStore(reply, toMemoryContentItem(item));
  });

  app.post('/api/realtime/tickets', async (request, reply) => {
    // Tickets exist to carry a credential through a browser WebSocket handshake.
    // With neither a token nor an operator, `WS /ws` needs no credential and a
    // ticket would be meaningless.
    if (config.foundationToken === undefined && !operators.exists()) {
      return reply.code(404).send({ error: 'Realtime tickets are not enabled.' });
    }

    const ticket = createRealtimeTicket(realtimeTickets, sessions.digestOf(readBearerCredential(request.headers.authorization)));
    const response: PicoRealtimeTicketResponse = {
      ticket: ticket.value,
      expiresAt: new Date(ticket.expiresAtMs).toISOString(),
    };

    return reply
      .code(201)
      .header('Cache-Control', 'no-store')
      .send(response);
  });

  app.get('/api/events', async (request, reply) => {
    const query = request.query as { limit?: string; after?: string };
    const limitResult = parseLimit(query.limit);

    if (!limitResult.ok) {
      return sendNoStore(reply.code(400), { error: limitResult.error });
    }

    const cursorResult = parseEventCursor(query.after);

    if (!cursorResult.ok) {
      return sendNoStore(reply.code(400), { error: cursorResult.error });
    }

    const page = store.listPage({
      limit: limitResult.limit,
      after: cursorResult.cursor,
    });

    const response: PicoEventListResponse = {
      events: resolveReferenceEvents(page.events, store.memory()),
      nextCursor: page.nextCursor === null ? null : encodeEventCursor(page.nextCursor),
      hasMore: page.hasMore,
    };

    return sendNoStore(reply, response);
  });

  app.get('/api/events/tail', async (request, reply) => {
    const query = request.query as { limit?: string };
    const limitResult = parseLimit(query.limit);

    if (!limitResult.ok) {
      return sendNoStore(reply.code(400), { error: limitResult.error });
    }

    const page = store.listTail(limitResult.limit);
    const response: PicoEventListResponse = {
      events: resolveReferenceEvents(page.events, store.memory()),
      nextCursor: null,
      hasMore: page.hasMore,
    };

    return sendNoStore(reply, response);
  });

  app.post('/api/events', async (request, reply) => {
    const body = request.body as IncomingEventBody | undefined;

    // memory.recorded is content-splitting and server-derived (ADR 0069): the
    // request carries content, the server stores it and records a reference-only
    // event that never holds the content. It cannot use the generic event path.
    if (isRecord(body) && body.type === 'memory.recorded') {
      const memoryRequest = validateMemoryRecordedRequest(body);
      if (!memoryRequest.ok) {
        return sendNoStore(reply.code(400), { error: memoryRequest.error });
      }

      const request_ = memoryRequest.request;

      // A domain_encrypted item's privacy domain becomes a per-domain KEK file
      // name, so it must satisfy the stricter key-store domain charset (ADR
      // 0072) on top of the AD charset. Reject at write time (ADR 0073).
      if (memoryCrypto !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/.test(request_.privacyDomain)) {
        return sendNoStore(reply.code(400), {
          error: 'privacyDomain must match [a-zA-Z0-9_-]{1,128} when memory encryption is enabled.',
        });
      }

      // An unknown policy reference would be kept forever by the sweep's
      // fail-safe rule (ADR 0074), which is safe but silent. Reject a typo here
      // instead of letting the writer believe expiry was configured.
      if (request_.retentionPolicyRef !== undefined && store.retentionPolicies().get(request_.retentionPolicyRef) === undefined) {
        return sendNoStore(reply.code(400), { error: 'retentionPolicyRef does not match a known retention policy.' });
      }

      const memoryItemId = `mem_${randomUUID()}`;
      const owner = request_.owner ?? request_.deviceId;
      store.memory().create({
        memoryItemId,
        privacyDomain: request_.privacyDomain,
        owner,
        controller: request_.controller ?? owner,
        contentType: request_.contentType,
        content: request_.content,
        ...(request_.retentionPolicyRef === undefined ? {} : { retentionPolicyRef: request_.retentionPolicyRef }),
        ...(memoryCrypto === undefined ? {} : { contentPosture: 'domain_encrypted' as const }),
      });

      const recordedPayload: MemoryRecordedPayload = {
        memoryItemId,
        privacyDomain: request_.privacyDomain,
        contentType: request_.contentType,
        ...(request_.summary === undefined ? {} : { summary: request_.summary }),
      };

      const recordedEvent = factory.create({
        deviceId: request_.deviceId,
        sessionId: request_.sessionId,
        type: 'memory.recorded',
        stream: request_.stream,
        payload: recordedPayload,
        remoteLamport: request_.lamport,
        payloadPosture: 'reference_only',
      });

      const recordedAppend = store.append(recordedEvent);
      if (recordedAppend === 'inserted') {
        broadcast(recordedEvent);
      }

      const recordedResponse: PicoEventCreateResponse = { event: recordedEvent, appendResult: recordedAppend };
      return sendNoStore(reply.code(201), recordedResponse);
    }

    const validation = validateIncomingEvent(body);

    if (!validation.ok) {
      return sendNoStore(reply.code(400), { error: validation.error });
    }

    const event = factory.create({
      deviceId: validation.body.deviceId,
      sessionId: validation.body.sessionId,
      type: validation.body.type,
      stream: validation.body.stream,
      payload: validation.body.payload,
      remoteLamport: validation.body.lamport,
      payloadPosture: validation.body.payloadPosture,
    });

    const appendResult = store.append(event);

    if (appendResult === 'duplicate_conflict') {
      return sendNoStore(reply.code(409), { error: 'Event id already exists with different payload.' });
    }

    if (appendResult === 'inserted') {
      broadcast(event);

      if (event.type === 'memory.tombstone') {
        // Best-effort projection: the event log is the source of truth, so a
        // tombstone for a missing or not-yet-deleted item still records.
        const tombstone = event.payload as MemoryTombstonePayload;
        store.memory().tombstone(tombstone.memoryItemId, tombstone.privacyDomain);
      }
    }

    const response: PicoEventCreateResponse = { event, appendResult };
    return sendNoStore(reply.code(201), response);
  });

  app.get('/ws', {
    websocket: true,
    preValidation: async (request, reply) => {
      if (!isWebSocketOriginAllowed(request.headers.origin, request.headers.host, config.wsAllowedOrigins ?? [])) {
        return reply.code(403).send({ error: 'WebSocket origin is not allowed.' });
      }

      // A credential is required once anything claims this host: a configured
      // token, or a bootstrapped operator. Browsers cannot set headers on a
      // WebSocket handshake, so they present a short-lived single-use ticket
      // (ADR 0039); non-browser clients may send a bearer token or session.
      const realtimeCredentialRequired = config.foundationToken !== undefined || operators.exists();

      if (realtimeCredentialRequired && !isRealtimeConnectionAuthorized(request.url, request.headers.authorization, config.foundationToken, realtimeTickets, sessions)) {
        return reply
          .code(401)
          .header('WWW-Authenticate', 'Bearer realm="Pico Foundation"')
          .send({ error: 'Foundation realtime credential is required.' });
      }
    },
  }, (connection) => {
    const socket = connection as RealtimeSocket;
    socket.isAlive = true;
    sockets.add(socket);
    const message: PicoCoreConnectedMessage = { type: realtimeMessageType.coreConnected, deviceId: config.deviceId };
    socket.send(JSON.stringify(message));

    socket.on('pong', () => {
      socket.isAlive = true;
    });

    socket.on('close', () => {
      sockets.delete(socket);
    });
  });

  return app;
}

function sendNoStore<TPayload>(reply: FastifyReply, payload: TPayload): FastifyReply {
  return reply
    .header('Cache-Control', 'no-store')
    .send(payload);
}

function toPicoHomeClaimStateResponse(
  state: PicoHomeClaimState,
  moveInCodePending: boolean,
): PicoHomeClaimStateResponse {
  const setupMode = {
    active: state.state === 'unclaimed' && moveInCodePending,
    moveInCodePending,
  };

  if (state.state === 'unclaimed') {
    return {
      state: 'unclaimed',
      setupMode,
    };
  }

  return {
    state: 'claimed',
    setupMode,
    ...(state.homeId === null ? {} : { homeId: state.homeId }),
    homeHostPicoId: state.hostAdminPicoId,
    ...(state.hostSigningKeyFingerprintHex === null ? {} : { hostSigningKeyFingerprintHex: state.hostSigningKeyFingerprintHex }),
    ...(state.hostKeyAgreementKeyFingerprintHex === null ? {} : { hostKeyAgreementKeyFingerprintHex: state.hostKeyAgreementKeyFingerprintHex }),
    claimedAt: state.claimedAt,
  };
}

function readPicoHomeClaimRequest(
  body: Record<string, unknown>,
  context: PicoHomeClaimRequestContext,
): ParsedPicoHomeClaimRequest {
  if ('claimEnvelope' in body) {
    if (body.moveInCode !== undefined || body.homeHostPicoId !== undefined || body.hostAdminPicoId !== undefined) {
      return {
        ok: false,
        statusCode: 400,
        error: 'claimEnvelope cannot be combined with legacy Move-In Code fields.',
      };
    }

    return readSealedPicoHomeClaimRequest(body.claimEnvelope, context);
  }

  const homeHostPicoId = readHomeHostPicoId(body);
  if (!homeHostPicoId.ok) {
    return { ok: false, statusCode: 400, error: homeHostPicoId.error };
  }

  return {
    ok: true,
    moveInCode: body.moveInCode,
    homeHostPicoId: homeHostPicoId.value,
  };
}

function readSealedPicoHomeClaimRequest(
  claimEnvelope: unknown,
  context: PicoHomeClaimRequestContext,
): ParsedPicoHomeClaimRequest {
  let envelope: PicoHomeClaimEnvelope;
  let payload: PicoHomeSealedClaimPayload;

  try {
    envelope = parsePicoHomeClaimEnvelope(claimEnvelope);
    payload = parsePicoHomeSealedClaimPayload(
      context.homeHostKeyStore.openSealedClaimPayload(sodium, envelope.sealedClaimPayloadHex),
    );
  } catch (error) {
    return {
      ok: false,
      statusCode: 400,
      error: (error as Error).message,
    };
  }

  const claim = payload.claim;
  const host = context.homeHostKeys.publicBundle;
  if (
    claim.suite !== picoIdentitySuite
    || claim.hostSigningKeyFingerprintHex !== host.signingKeyFingerprintHex
    || claim.hostKeyAgreementKeyFingerprintHex !== host.keyAgreementKeyFingerprintHex
    || claim.hostSetupNonceHex !== context.homeSetupNonceHex
  ) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Pico Home claim is not bound to this setup session.',
    };
  }

  if (
    payload.claimantIdentityKeyRecord.suite !== picoIdentitySuite
    || payload.claimantIdentityKeyRecord.keyRole !== 'pico_identity'
  ) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Pico Home claim requires a pico_identity claimant key.',
    };
  }

  try {
    if (!verifyPicoIdentityKeyRecordFingerprint(sodium, {
      keyRecord: payload.claimantIdentityKeyRecord,
      expectedFingerprintHex: claim.claimantIdentityKeyFingerprintHex,
    })) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Pico Home claimant identity fingerprint does not match the key record.',
      };
    }

    if (!verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: payload.claimantIdentityKeyRecord.publicKeyHex,
      signatureInput: buildPicoHomeClaimSignatureInput(claim),
      signatureHex: payload.claimantSignatureHex,
    })) {
      return {
        ok: false,
        statusCode: 401,
        error: 'Pico Home claim signature is invalid.',
      };
    }
  } catch {
    return {
      ok: false,
      statusCode: 400,
      error: 'Pico Home claim payload is invalid.',
    };
  }

  return {
    ok: true,
    moveInCode: claim.moveInCode,
    homeHostPicoId: `pico:identity:${claim.claimantIdentityKeyFingerprintHex}`,
  };
}

function readHomeHostPicoId(body: { homeHostPicoId?: unknown; hostAdminPicoId?: unknown }):
  | { ok: true; value: string }
  | { ok: false; error: string } {
  const primary = body.homeHostPicoId;
  const compatibility = body.hostAdminPicoId;

  if (primary !== undefined && compatibility !== undefined && primary !== compatibility) {
    return { ok: false, error: 'homeHostPicoId and hostAdminPicoId must match when both are provided.' };
  }

  const value = primary ?? compatibility;
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:/+-]{1,256}$/.test(value)) {
    return { ok: false, error: 'homeHostPicoId must be a non-empty ASCII token.' };
  }

  return { ok: true, value };
}

function createHomeId(): string {
  return `home_${randomBytes(16).toString('hex')}`;
}

function parsePicoHomeClaimEnvelope(source: unknown): PicoHomeClaimEnvelope {
  if (!isRecord(source) || !hasExactKeys(source, ['schema', 'sealedClaimPayloadHex'])) {
    throw new Error('Pico Home claim envelope is invalid.');
  }

  const envelope = {
    schema: stringField(source, 'schema', 'Pico Home claim envelope is invalid.'),
    sealedClaimPayloadHex: stringField(source, 'sealedClaimPayloadHex', 'Pico Home claim envelope is invalid.'),
  };

  if (envelope.schema !== picoHomeClaimEnvelopeSchema || !/^[0-9a-f]{1,16384}$/.test(envelope.sealedClaimPayloadHex)) {
    throw new Error('Pico Home claim envelope is invalid.');
  }

  return {
    schema: picoHomeClaimEnvelopeSchema,
    sealedClaimPayloadHex: envelope.sealedClaimPayloadHex,
  };
}

function parsePicoHomeSealedClaimPayload(serialized: string): PicoHomeSealedClaimPayload {
  let source: unknown;
  try {
    source = JSON.parse(serialized);
  } catch {
    throw new Error('Pico Home claim payload is invalid.');
  }

  if (!isRecord(source) || !hasExactKeys(source, ['schema', 'claim', 'claimantIdentityKeyRecord', 'claimantSignatureHex'])) {
    throw new Error('Pico Home claim payload is invalid.');
  }

  const payload = {
    schema: stringField(source, 'schema'),
    claim: parsePicoHomeClaim(source.claim),
    claimantIdentityKeyRecord: parsePicoIdentityKeyRecord(source.claimantIdentityKeyRecord),
    claimantSignatureHex: stringField(source, 'claimantSignatureHex'),
  };

  if (payload.schema !== picoHomeSealedClaimPayloadSchema || !/^[0-9a-f]{128}$/.test(payload.claimantSignatureHex)) {
    throw new Error('Pico Home claim payload is invalid.');
  }

  return {
    schema: picoHomeSealedClaimPayloadSchema,
    claim: payload.claim,
    claimantIdentityKeyRecord: payload.claimantIdentityKeyRecord,
    claimantSignatureHex: payload.claimantSignatureHex,
  };
}

function parsePicoHomeClaim(source: unknown): PicoHomeClaimSignatureInput {
  if (!isRecord(source) || !hasExactKeys(source, [
    'suite',
    'claimId',
    'hostSigningKeyFingerprintHex',
    'hostKeyAgreementKeyFingerprintHex',
    'moveInCode',
    'claimantIdentityKeyFingerprintHex',
    'claimantNonceHex',
    'hostSetupNonceHex',
  ])) {
    throw new Error('Pico Home claim payload is invalid.');
  }

  const claim: PicoHomeClaimSignatureInput = {
    suite: stringField(source, 'suite'),
    claimId: stringField(source, 'claimId'),
    hostSigningKeyFingerprintHex: stringField(source, 'hostSigningKeyFingerprintHex'),
    hostKeyAgreementKeyFingerprintHex: stringField(source, 'hostKeyAgreementKeyFingerprintHex'),
    moveInCode: stringField(source, 'moveInCode'),
    claimantIdentityKeyFingerprintHex: stringField(source, 'claimantIdentityKeyFingerprintHex'),
    claimantNonceHex: stringField(source, 'claimantNonceHex'),
    hostSetupNonceHex: stringField(source, 'hostSetupNonceHex'),
  };

  buildPicoHomeClaimSignatureInput(claim);
  return claim;
}

function parsePicoIdentityKeyRecord(source: unknown): PicoIdentityKeyRecordSignatureInput {
  if (!isRecord(source) || !hasExactKeys(source, ['suite', 'keyRole', 'publicKeyHex'])) {
    throw new Error('Pico Home claim payload is invalid.');
  }

  return {
    suite: stringField(source, 'suite'),
    keyRole: stringField(source, 'keyRole') as PicoIdentityKeyRecordSignatureInput['keyRole'],
    publicKeyHex: stringField(source, 'publicKeyHex'),
  };
}

function parseLimit(rawLimit: string | undefined): { ok: true; limit: number } | { ok: false; error: string } {
  if (rawLimit === undefined) {
    return { ok: true, limit: DEFAULT_EVENT_LIMIT };
  }

  if (!/^[1-9]\d*$/.test(rawLimit)) {
    return { ok: false, error: 'limit must be a positive integer.' };
  }

  const limit = Number.parseInt(rawLimit, 10);

  return { ok: true, limit: Math.min(limit, MAX_EVENT_LIMIT) };
}

function parseEventCursor(rawCursor: string | undefined): { ok: true; cursor: EventCursor | null } | { ok: false; error: string } {
  if (rawCursor === undefined) {
    return { ok: true, cursor: null };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8')) as unknown;
  } catch {
    return { ok: false, error: 'after cursor is invalid.' };
  }

  if (!isEventCursor(parsed)) {
    return { ok: false, error: 'after cursor is invalid.' };
  }

  return { ok: true, cursor: parsed };
}

function encodeEventCursor(cursor: EventCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/**
 * Projects a stored memory item to the content read shape (ADR 0077). Carries
 * the already-readable metadata and exactly one of content / contentUnavailable;
 * the unverified stored owner/controller are omitted (C2), and so is the key
 * envelope reference, which is key plumbing and not content.
 */
function toMemoryContentItem(item: MemoryItem): PicoMemoryContentItem {
  return {
    memoryItemId: item.memoryItemId,
    privacyDomain: item.privacyDomain,
    contentType: item.contentType,
    contentPosture: item.contentPosture,
    deletionState: item.deletionState,
    ...(item.retentionPolicyRef === undefined ? {} : { retentionPolicyRef: item.retentionPolicyRef }),
    ...(item.content === undefined ? {} : { content: item.content }),
    ...(item.contentUnavailable === undefined ? {} : { contentUnavailable: item.contentUnavailable }),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function parseMemoryContentCursor(rawCursor: string | undefined): { ok: true; cursor: MemoryContentCursor | null } | { ok: false; error: string } {
  if (rawCursor === undefined) {
    return { ok: true, cursor: null };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8')) as unknown;
  } catch {
    return { ok: false, error: 'after cursor is invalid.' };
  }

  if (!isMemoryContentCursor(parsed)) {
    return { ok: false, error: 'after cursor is invalid.' };
  }

  return { ok: true, cursor: parsed };
}

function encodeMemoryContentCursor(cursor: MemoryContentCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function isMemoryContentCursor(value: unknown): value is MemoryContentCursor {
  return isRecord(value) && typeof value.createdAt === 'string' && typeof value.memoryItemId === 'string';
}

function isWebSocketOriginAllowed(originHeader: string | string[] | undefined, hostHeader: string | string[] | undefined, allowedOrigins: readonly string[]): boolean {
  if (originHeader === undefined) {
    return true;
  }

  if (typeof originHeader !== 'string') {
    return false;
  }

  const origin = parseHttpOrigin(originHeader);

  if (origin === null) {
    return false;
  }

  if (allowedOrigins.includes(origin.origin)) {
    return true;
  }

  const requestHost = parseHostHeader(hostHeader);

  return requestHost !== null && origin.host === requestHost;
}

function parseHttpOrigin(rawOrigin: string): { origin: string; host: string } | null {
  let url: URL;

  try {
    url = new URL(rawOrigin);
  } catch {
    return null;
  }

  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    return null;
  }

  return { origin: url.origin, host: url.host };
}

function parseHostHeader(hostHeader: string | string[] | undefined): string | null {
  if (typeof hostHeader !== 'string' || hostHeader.trim() === '') {
    return null;
  }

  let url: URL;

  try {
    url = new URL(`http://${hostHeader}`);
  } catch {
    return null;
  }

  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    return null;
  }

  return url.host;
}

function isFoundationApiPath(requestUrl: string): boolean {
  let url: URL;

  try {
    url = new URL(requestUrl, 'http://pico.local');
  } catch {
    return false;
  }

  return url.pathname.startsWith('/api/');
}

function createRealtimeTicket(
  tickets: Map<string, RealtimeTicketRecord>,
  sessionDigest?: string,
): { value: string; expiresAtMs: number } {
  purgeExpiredRealtimeTickets(tickets);

  while (tickets.size >= MAX_OUTSTANDING_REALTIME_TICKETS) {
    const oldestDigest = tickets.keys().next().value as string | undefined;
    if (oldestDigest === undefined) {
      break;
    }

    tickets.delete(oldestDigest);
  }

  const value = randomBytes(32).toString('base64url');
  const expiresAtMs = Date.now() + REALTIME_TICKET_TTL_MS;
  tickets.set(secureDigest(value), {
    expiresAtMs,
    ...(sessionDigest === undefined ? {} : { sessionDigest }),
  });
  return { value, expiresAtMs };
}

// A ticket minted under a session dies with it (ADR 0076).
function purgeSessionRealtimeTickets(tickets: Map<string, RealtimeTicketRecord>, sessionDigest: string): void {
  for (const [digest, record] of tickets) {
    if (record.sessionDigest === sessionDigest) {
      tickets.delete(digest);
    }
  }
}

function purgeAllSessionRealtimeTickets(tickets: Map<string, RealtimeTicketRecord>): void {
  for (const [digest, record] of tickets) {
    if (record.sessionDigest !== undefined) {
      tickets.delete(digest);
    }
  }
}

function isRealtimeConnectionAuthorized(
  requestUrl: string,
  authorizationHeader: string | string[] | undefined,
  expectedToken: string | undefined,
  tickets: Map<string, RealtimeTicketRecord>,
  sessions: SessionStore,
): boolean {
  if (expectedToken !== undefined && isBearerTokenAuthorized(authorizationHeader, expectedToken)) {
    return true;
  }

  if (sessions.touch(readBearerCredential(authorizationHeader)) !== undefined) {
    return true;
  }

  const ticket = readRealtimeTicketQueryValue(requestUrl);
  if (ticket === null) {
    return false;
  }

  return consumeRealtimeTicket(tickets, ticket);
}

function readRealtimeTicketQueryValue(requestUrl: string): string | null {
  let url: URL;

  try {
    url = new URL(requestUrl, 'http://pico.local');
  } catch {
    return null;
  }

  const ticket = url.searchParams.get('ticket');
  if (ticket === null || ticket.trim() === '') {
    return null;
  }

  return ticket;
}

function consumeRealtimeTicket(tickets: Map<string, RealtimeTicketRecord>, ticket: string): boolean {
  purgeExpiredRealtimeTickets(tickets);

  const digest = secureDigest(ticket);
  const record = tickets.get(digest);
  if (record === undefined) {
    return false;
  }

  tickets.delete(digest);
  return record.expiresAtMs > Date.now();
}

function purgeExpiredRealtimeTickets(tickets: Map<string, RealtimeTicketRecord>): void {
  const now = Date.now();

  for (const [digest, record] of tickets) {
    if (record.expiresAtMs <= now) {
      tickets.delete(digest);
    }
  }
}

function isBearerTokenAuthorized(authorizationHeader: string | string[] | undefined, expectedToken: string): boolean {
  const providedToken = readBearerCredential(authorizationHeader);

  if (providedToken === undefined) {
    return false;
  }

  return secureTokenEquals(providedToken, expectedToken);
}

// The raw bearer credential, which is either the static token or an operator
// session; the caller decides which authority it resolves to.
function readBearerCredential(authorizationHeader: string | string[] | undefined): string | undefined {
  if (typeof authorizationHeader !== 'string') {
    return undefined;
  }

  const prefix = 'Bearer ';
  if (!authorizationHeader.startsWith(prefix)) {
    return undefined;
  }

  const credential = authorizationHeader.slice(prefix.length);

  return credential === '' ? undefined : credential;
}

function unauthorized(reply: FastifyReply, error: string): FastifyReply {
  return reply
    .code(401)
    .header('WWW-Authenticate', 'Bearer realm="Pico Foundation"')
    .header('Cache-Control', 'no-store')
    .send({ error });
}

function secureTokenEquals(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left, 'utf8').digest();
  const rightDigest = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function secureDigest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

function redactTicketQueryValue(requestUrl: string | undefined): string | undefined {
  if (requestUrl === undefined || !requestUrl.includes('ticket=')) {
    return requestUrl;
  }

  let url: URL;

  try {
    url = new URL(requestUrl, 'http://pico.local');
  } catch {
    return requestUrl.replace(/([?&]ticket=)[^&]*/g, '$1[redacted]');
  }

  if (url.searchParams.has('ticket')) {
    url.searchParams.set('ticket', '[redacted]');
  }

  const path = `${url.pathname}${url.search}${url.hash}`;
  return path || requestUrl;
}

function isEventCursor(value: unknown): value is EventCursor {
  return isRecord(value)
    && typeof value.eventId === 'string'
    && value.eventId.trim() !== ''
    && typeof value.wallTime === 'string'
    && value.wallTime.trim() !== ''
    && typeof value.lamport === 'number'
    && Number.isSafeInteger(value.lamport)
    && value.lamport >= 0;
}

function validateIncomingEvent(body: IncomingEventBody | undefined): { ok: true; body: ValidatedIncomingEventBody } | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: 'Request body must be an object.' };
  }

  if (!isNonEmptyString(body.deviceId, 128) || !isKnownEventType(body.type) || body.payload === undefined) {
    return { ok: false, error: 'deviceId, type and payload are required.' };
  }

  if (!writableEventTypes.has(body.type as FoundationEventType)) {
    return { ok: false, error: 'This event type is reserved for a later Pico Rules, Action Runner or Pico Home API.' };
  }

  const type = body.type as FoundationEventType;

  if (body.sessionId !== undefined && !isNonEmptyString(body.sessionId, 128)) {
    return { ok: false, error: 'sessionId must be a non-empty string when provided.' };
  }

  if (body.stream !== undefined && !isNonEmptyString(body.stream, 256)) {
    return { ok: false, error: 'stream must be a non-empty string when provided.' };
  }

  if (body.lamport !== undefined) {
    if (typeof body.lamport !== 'number' || !Number.isInteger(body.lamport) || body.lamport < 0 || body.lamport > MAX_INCOMING_LAMPORT) {
      return { ok: false, error: 'lamport is outside the accepted range.' };
    }
  }

  const payloadSize = Buffer.byteLength(JSON.stringify(body.payload), 'utf8');
  if (payloadSize > MAX_PAYLOAD_BYTES) {
    return { ok: false, error: 'payload is too large.' };
  }

  const payloadResult = validateFoundationEventPayload(type, body.payload, {
    maxMessageTextLength: MAX_TEXT_LENGTH,
    maxAvatarMessageLength: 1_000,
  });

  if (!payloadResult.ok) {
    return { ok: false, error: payloadResult.error };
  }

  if (body.payloadPosture !== undefined) {
    if (typeof body.payloadPosture !== 'string' || !payloadPostures.includes(body.payloadPosture as PayloadPosture)) {
      return { ok: false, error: 'payloadPosture must be a known posture.' };
    }

    if (!writablePayloadPostures.includes(body.payloadPosture as (typeof writablePayloadPostures)[number])) {
      return { ok: false, error: 'This payloadPosture is reserved for future memory-referencing events and is not writable yet.' };
    }
  }

  return {
    ok: true,
    body: {
      deviceId: body.deviceId,
      sessionId: body.sessionId as string | undefined,
      type,
      stream: body.stream as string | undefined,
      lamport: body.lamport,
      payload: payloadResult.payload,
      payloadPosture: body.payloadPosture as PayloadPosture | undefined,
    },
  };
}

// Read-time reference resolution (ADR 0069): enrich reference_only
// memory.recorded events with the current resolutionState of their reference
// target. This is a read projection; the stored event is unchanged.
function resolveReferenceEvents(events: PicoEvent[], memory: MemoryStore): PicoEvent[] {
  return events.map((event) => {
    if (event.type !== 'memory.recorded') {
      return event;
    }

    const payload = event.payload as MemoryRecordedPayload;
    const resolutionState = memory.resolutionState(payload.memoryItemId, payload.privacyDomain);
    return { ...event, payload: { ...payload, resolutionState } };
  });
}

interface RetentionPolicyBody {
  retentionPolicyId?: string;
  displayName?: string;
  mode?: string;
  maxAgeDays?: number;
}

/**
 * Validates the request shape only. The mode/maxAgeDays combination rules live
 * in RetentionPolicyStore, so create and update cannot drift apart.
 */
function validateRetentionPolicyBody(
  body: Record<string, unknown>,
  options: { requireFullShape: boolean },
): { ok: true; value: RetentionPolicyBody } | { ok: false; error: string } {
  for (const key of Object.keys(body)) {
    if (!['retentionPolicyId', 'displayName', 'mode', 'maxAgeDays'].includes(key)) {
      return { ok: false, error: `retention policy has unexpected field: ${key}.` };
    }
  }

  if (options.requireFullShape && !isNonEmptyString(body.retentionPolicyId, 256)) {
    return { ok: false, error: 'retentionPolicyId is required.' };
  }

  if (body.retentionPolicyId !== undefined && !isNonEmptyString(body.retentionPolicyId, 256)) {
    return { ok: false, error: 'retentionPolicyId must be a non-empty string when provided.' };
  }

  if (options.requireFullShape && !isNonEmptyString(body.displayName, 256)) {
    return { ok: false, error: 'displayName is required.' };
  }

  if (body.displayName !== undefined && !isNonEmptyString(body.displayName, 256)) {
    return { ok: false, error: 'displayName must be a non-empty string when provided.' };
  }

  if (options.requireFullShape && !isRetentionMode(body.mode)) {
    return { ok: false, error: `mode must be one of: ${memoryRetentionModes.join(', ')}.` };
  }

  if (body.mode !== undefined && !isRetentionMode(body.mode)) {
    return { ok: false, error: `mode must be one of: ${memoryRetentionModes.join(', ')}.` };
  }

  if (body.maxAgeDays !== undefined && (typeof body.maxAgeDays !== 'number' || !Number.isInteger(body.maxAgeDays) || body.maxAgeDays < 1)) {
    return { ok: false, error: 'maxAgeDays must be a positive whole number of days when provided.' };
  }

  return {
    ok: true,
    value: {
      ...(body.retentionPolicyId === undefined ? {} : { retentionPolicyId: body.retentionPolicyId as string }),
      ...(body.displayName === undefined ? {} : { displayName: body.displayName as string }),
      ...(body.mode === undefined ? {} : { mode: body.mode as string }),
      ...(body.maxAgeDays === undefined ? {} : { maxAgeDays: body.maxAgeDays as number }),
    },
  };
}

function validateMemoryRecordedRequest(body: Record<string, unknown>): { ok: true; request: MemoryRecordedRequest } | { ok: false; error: string } {
  if (!isNonEmptyString(body.deviceId, 128)) {
    return { ok: false, error: 'deviceId is required.' };
  }

  if (body.sessionId !== undefined && !isNonEmptyString(body.sessionId, 128)) {
    return { ok: false, error: 'sessionId must be a non-empty string when provided.' };
  }

  if (body.stream !== undefined && !isNonEmptyString(body.stream, 256)) {
    return { ok: false, error: 'stream must be a non-empty string when provided.' };
  }

  if (body.lamport !== undefined && (typeof body.lamport !== 'number' || !Number.isInteger(body.lamport) || body.lamport < 0 || body.lamport > MAX_INCOMING_LAMPORT)) {
    return { ok: false, error: 'lamport is outside the accepted range.' };
  }

  const payload = body.payload;
  if (!isRecord(payload)) {
    return { ok: false, error: 'memory.recorded payload must be an object.' };
  }

  for (const key of Object.keys(payload)) {
    if (!['privacyDomain', 'contentType', 'content', 'summary', 'owner', 'controller', 'retentionPolicyRef'].includes(key)) {
      return { ok: false, error: `memory.recorded payload has unexpected field: ${key}.` };
    }
  }

  if (!isNonEmptyString(payload.privacyDomain, 256) || !isNonEmptyString(payload.contentType, 256) || typeof payload.content !== 'string' || payload.content.trim().length === 0) {
    return { ok: false, error: 'memory.recorded payload requires privacyDomain, contentType and content.' };
  }

  if (Buffer.byteLength(payload.content, 'utf8') > MAX_PAYLOAD_BYTES) {
    return { ok: false, error: 'memory.recorded content is too large.' };
  }

  if (payload.summary !== undefined && !isNonEmptyString(payload.summary, 1_000)) {
    return { ok: false, error: 'memory.recorded summary must be a non-empty string when provided.' };
  }

  if (payload.owner !== undefined && !isNonEmptyString(payload.owner, 256)) {
    return { ok: false, error: 'memory.recorded owner must be a non-empty string when provided.' };
  }

  if (payload.controller !== undefined && !isNonEmptyString(payload.controller, 256)) {
    return { ok: false, error: 'memory.recorded controller must be a non-empty string when provided.' };
  }

  if (payload.retentionPolicyRef !== undefined && !isNonEmptyString(payload.retentionPolicyRef, 256)) {
    return { ok: false, error: 'memory.recorded retentionPolicyRef must be a non-empty string when provided.' };
  }

  return {
    ok: true,
    request: {
      deviceId: body.deviceId,
      sessionId: body.sessionId as string | undefined,
      stream: body.stream as string | undefined,
      lamport: body.lamport as number | undefined,
      privacyDomain: payload.privacyDomain,
      contentType: payload.contentType,
      content: payload.content,
      summary: payload.summary as string | undefined,
      owner: payload.owner as string | undefined,
      controller: payload.controller as string | undefined,
      retentionPolicyRef: payload.retentionPolicyRef as string | undefined,
    },
  };
}

function isKnownEventType(value: unknown): value is PicoEventType {
  return typeof value === 'string' && knownEventTypes.has(value as PicoEventType);
}

function isRetentionMode(value: unknown): value is MemoryRetentionMode {
  return typeof value === 'string' && (memoryRetentionModes as readonly string[]).includes(value);
}

function stringField(source: Record<string, unknown>, key: string, error = 'Pico Home claim payload is invalid.'): string {
  const value = source[key];
  if (typeof value !== 'string') {
    throw new Error(error);
  }

  return value;
}

function hasExactKeys(source: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const expected = new Set(expectedKeys);
  return Object.keys(source).every((key) => expected.has(key))
    && expectedKeys.every((key) => key in source);
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
