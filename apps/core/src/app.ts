import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  buildPicoHomeClaimResponseSignatureInput,
  buildPicoHomeClaimSignatureInput,
  buildPicoHomeFoundingSignatureInput,
  validateFoundationEventPayload,
  foundationEventTypes,
  serverSynthesizedFoundationEventTypes,
  payloadPostures,
  picoEventTypes,
  picoHomeClaimEnvelopeSchema,
  picoHomeClaimResponseRecordSchema,
  picoHomeFoundingAcceptanceSchema,
  picoHomeFoundingRecordSchema,
  picoHomeFoundingRecordV2Schema,
  picoHomeSealedClaimPayloadSchema,
  picoHomeSealedClaimPayloadV2Schema,
  buildPicoHomeContinuitySignatureInput,
  buildPicoHomeMembershipSignatureInput,
  picoHomeContinuityChainSchema,
  picoHomeContinuityReasonCategories,
  picoHomeDomainReadGrantLifecycleRecordSchema,
  picoHomeDomainReadGrantRecordSchema,
  picoHomeMembershipCredentialSchema,
  picoIdentitySuite,
  protocolCapabilities,
  clientWritableMessageCreatedRoles,
  memoryRetentionModes,
  realtimeMessageType,
  writablePayloadPostures,
  type FoundationEventPayload,
  type FoundationEventType,
  type MemoryRecordedPayload,
  type MessageCreatedPayload,
  type PicoEventOriginClass,
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
  type PicoHomeClaimResponseRecord,
  type PicoHomeClaimResponseSignatureInput,
  type PicoHomeClaimStateResponse,
  type PicoHomeClaimSignatureInput,
  type PicoHomeFoundingAcceptance,
  type PicoHomeFoundingRecord,
  type PicoHomeFoundingRecordV2,
  type PicoHomeFoundingSignatureInput,
  type PicoHomePendingClaimResponse,
  type PicoHomeSealedClaimPayload,
  type PicoHomeSetupResponse,
  type PicoHomeMembershipCredential,
  type PicoHomeMembershipIssuerStatement,
  type PicoHomeMembershipLifecycleRecord,
  type PicoHomeDomainReadGrantLifecycleRecord,
  type PicoHomeDomainReadGrantRecord,
  type PicoHomeDeviceLifecycleSubmission,
  type PicoHomeDeviceRecoverySubmission,
  type PicoHomeDeviceRecoveryPreparation,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoIdentityRevocationSignatureInput,
  type PicoIdentityRotationSignatureInput,
  type PicoHomeContinuityChainResponse,
  type PicoHomeContinuityRecord,
  type PicoHomeContinuityReasonCategory,
  type PicoHomeContinuitySignatureInput,
  type PicoMemoryContentItem,
  type PicoMemoryContentListResponse,
  type PicoReaderCustodyDomainRecord,
  type PicoReaderCustodyItemRecord,
  type PicoReaderCustodyKekRotationRecord,
  type PicoReaderCustodyReaderGrantLifecycleRecord,
  type PicoReaderCustodyReaderGrantRecord,
  type PicoReaderCustodyWriterGrantLifecycleRecord,
  type PicoReaderCustodyWriterGrantRecord,
  type PicoRealtimeTicketResponse,
  type PicoRetentionPolicyListResponse,
  type PicoRetentionPolicyResponse,
  type PicoShareEnvelopeRecord,
  type PicoSystemStatusResponse,
  type PicoSystemVersionResponse,
  buildPicoIdentityReaderKeyFreshnessSignatureInput,
  detectPicoClockDivergence,
  hasPicoExposureWindowElapsed,
  picoIdentityReaderKeyFreshnessCheckpointSchema,
  picoProtocolVersion,
  type PicoAuditCoverage,
  type PicoClockDivergence,
  type PicoIdentityReaderKeyFreshnessCheckpoint,
  type PicoIdentityReaderKeyFreshnessSignatureInput,
} from '@pico/protocol';
import {
  createVerifiedPicoIdentityLifecycleIndex,
  verifyPicoIdentityDetachedSignature,
  verifyPicoIdentityKeyRecordFingerprint,
  type PicoIdentitySignedDelegation,
  type PicoIdentitySignedRevocation,
} from '@pico/identity';
import sodium from 'libsodium-wrappers-sumo';
import { LamportClock } from '@pico/sync';
import { EventFactory } from './event-factory.js';
import {
  EventStore,
  type EventCursor,
  type PicoHomeClaimState,
  type PicoIdentityRotationSuccessorFirstDevice,
  type PicoShareEnvelopeStoredRecord,
} from './event-store.js';
import type { MemoryContentCursor, MemoryItem, MemoryStore } from './memory-store.js';
import { HomeMembershipReadership, SoleResidentReadership, type DomainReadership } from './domain-readership.js';
import { registerWebDashboard } from './static-web.js';
import { assertKeyStoreSeparation, KeyStore } from './key-store.js';
import {
  assertPicoHomeRecoveryAnchorSeparation,
  defaultPicoHomeRecoveryAnchorPath,
  openPicoHomeRecoveryAnchor,
} from './recovery-anchor.js';
import { MemoryContentCrypto } from './memory-content-crypto.js';
import { RetentionSweeper } from './retention-sweep.js';
import { AccessClassRegistry, DESTRUCTIVE_CONFIRM_FIELD, isFoundationApiRoute, type AccessClass } from './access-classes.js';
import {
  OperatorOverloadedError,
  type OperatorHomeBinding,
  type OperatorStore,
} from './operator-store.js';
import { SessionStore, type SessionPrincipal } from './session-store.js';
import { consumeOperatorResetMarker, OperatorBootstrapCode } from './operator-bootstrap.js';
import { LoginThrottle } from './login-throttle.js';
import { verifyPicoHomeMembershipAuthority } from './home-membership.js';
import {
  IdentitySessionChallengeStore,
  verifyIdentitySessionProof,
  type IdentitySessionProof,
} from './identity-session.js';
import { shredDomainWithAudit } from './domain-shred.js';
import { defaultWebRootPath, type CoreConfig } from './config.js';
import {
  assertHomeHostKeyStoreSeparation,
  consumeHomeResetMarker,
  consumeRecoveryAnchorReseedMarker,
  recoveryAnchorReseedMarkerPath,
  HomeHostKeyStore,
  MoveInCode,
  type HomeHostKeyPairSet,
} from './home-setup.js';
import { PicoIdentityReaderKeySelector } from './reader-key.js';
import {
  AuthenticatedPicoIdentityReaderKeyFreshnessSource,
} from './reader-key-freshness.js';
import { PicoIdentityReaderKeyFreshnessInbox } from './reader-key-freshness-inbox.js';
import {
  MAX_PICO_LINK_DIRECT_REQUEST_BODY_BYTES,
  PicoLinkDirectIntake,
  type PicoLinkDirectExecution,
  type PicoLinkDirectPrincipal,
} from './link-direct.js';
import { PICO_LINK_CONTINUITY_READ_PATH } from './link-intake-listener.js';
import {
  PicoShareEnvelopeIssuer,
  type PicoShareEnvelopePrepareInput,
} from './share-envelope.js';
import type { ReaderCustodyFailureReason } from './reader-custody.js';

const SERVICE_VERSION = '0.1.9';
// The wire-contract version, owned by @pico/protocol and deliberately not tied
// to SERVICE_VERSION: a packaging or documentation release must not advertise a
// protocol change that did not happen (ADR 0025).
const PROTOCOL_VERSION = picoProtocolVersion;
const DEFAULT_EVENT_LIMIT = 100;
const MAX_EVENT_LIMIT = 500;
const MAX_TEXT_LENGTH = 8_000;
const MAX_PAYLOAD_BYTES = 32 * 1024;
const REQUEST_BODY_LIMIT_BYTES = MAX_PAYLOAD_BYTES + (8 * 1024);
const MAX_INCOMING_LAMPORT = 1_000_000_000;
const WEBSOCKET_KEEPALIVE_INTERVAL_MS = 30_000;
const RETENTION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const REALTIME_TICKET_TTL_MS = 30_000;
// A pending claim holds Setup Mode open after the Move-In Code was consumed, so
// it must expire on its own and must not be retryable without limit. Both cases
// return the host to Setup Mode with a fresh Move-In Code instead of leaving a
// claimable Home wedged until the process is restarted (ADR 0080 M2).
const PENDING_HOME_CLAIM_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_HOME_CLAIM_ATTEMPTS = 10;
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
  // Never accepted; present so the refusal of a client-asserted origin
  // (ADR 0116 W1) reads the field instead of casting.
  origin?: unknown;
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
  /**
   * The session this connection was opened under, when it was opened under one.
   * Revoking that session has to reach the live stream too: the handshake is
   * where authority is checked, and without this binding the connection would
   * outlive the credential that opened it (ADR 0076). Absent for the static
   * token, which is not revocable, and for the credential-free local mode.
   */
  sessionDigest?: string;
  send(payload: string): void;
  ping(): void;
  terminate(): void;
  on(event: 'close' | 'pong', listener: () => void): void;
}

/**
 * What the realtime handshake resolved to. A ticket carries the session it was
 * minted under, so the connection inherits that binding rather than losing it
 * when the single-use ticket is consumed.
 */
type RealtimeAuthorization =
  | { authorized: false }
  | { authorized: true; sessionDigest?: string };

interface RealtimeTicketRecord {
  expiresAtMs: number;
  /**
   * ADR 0120 N1. A ticket is an exposure window - it exists to bound a
   * handoff - so it expires at the earliest instant either clock allows, and
   * a wall clock wound backward cannot give a spent handoff a second life.
   */
  startedAtMonotonicMs: number;
  // Set when the ticket was minted under an operator session: revoking that
  // session invalidates its outstanding tickets (ADR 0076).
  sessionDigest?: string;
}

interface PicoHomeClaimRequestContext {
  homeHostKeyStore: HomeHostKeyStore;
  homeHostKeys: HomeHostKeyPairSet;
  homeSetupNonceHex: string;
  at: string;
}

type ParsedPicoHomeClaimRequest =
  | {
    ok: true;
    kind: 'sealed';
    moveInCode: unknown;
    homeHostPicoId: string;
    claim: PicoHomeClaimSignatureInput;
    claimantIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
    claimantSignatureHex: string;
    firstDeviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
    firstDeviceKeyAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput;
    firstDeviceDelegation: PicoIdentitySignedDelegation;
    firstDeviceRevocations: PicoIdentitySignedRevocation[];
    firstDeviceSignatureHex: string;
    verifiedAt: string;
  }
  | {
    ok: true;
    kind: 'foundingAcceptance';
    acceptance: PicoHomeFoundingAcceptance;
  }
  | {
    ok: false;
    statusCode: number;
    error: string;
  };

interface PendingPicoHomeClaim {
  homeHostPicoId: string;
  claim: PicoHomeClaimSignatureInput;
  claimantIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  claimantSignatureHex: string;
  firstDeviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
  firstDeviceKeyAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput;
  firstDeviceDelegation: PicoIdentitySignedDelegation;
  firstDeviceRevocations: PicoIdentitySignedRevocation[];
  firstDeviceSignatureHex: string;
  claimResponse: PicoHomeClaimResponseRecord;
  founding: PicoHomeFoundingSignatureInput;
  createdAt: string;
  expiresAtMs: number;
  /**
   * ADR 0120 N1. A pending claim is an exposure window - it bounds a ceremony
   * holding a consumed Move-In Code and a setup nonce - so it ends at the
   * earliest instant either clock allows.
   */
  startedAtMonotonicMs: number;
  attempts: number;
}

type ParsedSealedPicoHomeClaimRequest = Extract<ParsedPicoHomeClaimRequest, { ok: true; kind: 'sealed' }>;

interface FoundationOperationResult {
  statusCode: number;
  body: Record<string, unknown>;
}

// A bearer resolves to one typed authority. In particular, an identity-bound
// session does not inherit operator or diagnostic powers (ADR 0082).
type RequestAuthority =
  | {
    kind: 'operator';
    sessionDigest: string;
    principal: Extract<SessionPrincipal, { kind: 'operator' }>;
  }
  | {
    kind: 'pico-identity';
    sessionDigest: string;
    principal: Extract<SessionPrincipal, { kind: 'pico_identity' }>;
  }
  | { kind: 'static-token' }
  | { kind: 'none' };

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
  // ADR 0110 R6: the recovery anchor only outlives a restore if it never
  // shares a directory with what the snapshot captures.
  const recoveryAnchorPath = config.recoveryAnchorPath
    ?? defaultPicoHomeRecoveryAnchorPath(config.databasePath);
  assertPicoHomeRecoveryAnchorSeparation({
    anchorPath: recoveryAnchorPath,
    databasePath: config.databasePath,
    backupDirectory: config.backupDirectory ?? join(dirname(config.databasePath), 'backups'),
  });

  // Memory-content encryption is off by default: content stays plaintext
  // foundation data (ADR 0070). When enabled, the domain_encrypted posture
  // becomes usable (ADR 0071 suite, ADR 0073 AD, ADR 0072 key store).
  // libsodium is needed unconditionally now: the operator credential uses its
  // Argon2id (ADR 0076), whether or not memory encryption is on.
  await sodium.ready;

  let keyStore: KeyStore | undefined;
  let memoryCrypto: MemoryContentCrypto | undefined;
  if (config.memoryEncryption === true) {
    keyStore = new KeyStore(keyStorePath);
    memoryCrypto = new MemoryContentCrypto(sodium, keyStore);
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

  /**
   * Baseline security headers on every Foundation HTTP response. The CSP can
   * be strict because the dashboard is framework-free with no inline script
   * and its styles live in `/styles.css` rather than an inline block, so no
   * 'unsafe-inline' carve-out exists to grow stale. `frame-ancestors 'self'`
   * instead of 'none' because Home Assistant ingress embeds the dashboard as
   * a same-origin iframe of the Home Assistant frontend; direct access never
   * frames it. This is transport-surface hardening only — it grants nothing
   * and is not part of any authority decision (ADR 0030/0038).
   */
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('content-security-policy', "default-src 'self'; frame-ancestors 'self'");
    reply.header('x-content-type-options', 'nosniff');
    return payload;
  });

  registerWebDashboard(app, config.webRootPath ?? defaultWebRootPath());

  const store = await EventStore.open(config.databasePath, {
    backupDirectory: config.backupDirectory,
    memoryCrypto,
    // ADR 0121 J1. Without this the chain is simply not written, and the
    // coverage report says so - which is the honest outcome, not a silent one.
    auditSodium: sodium,
    recoveryAnchor: openPicoHomeRecoveryAnchor(recoveryAnchorPath),
  });
  const clock = new LamportClock(store.maxLamport());
  const factory = new EventFactory(clock);
  const loginThrottle = new LoginThrottle();
  const sockets = new Set<RealtimeSocket>();
  // Carries the session a handshake resolved to from preValidation into the
  // socket handler, keyed by request so nothing leaks between connections.
  const handshakeSessionDigests = new WeakMap<FastifyRequest, string>();
  const realtimeTickets = new Map<string, RealtimeTicketRecord>();
  const operators: OperatorStore = store.operators(sodium);
  const sessions = new SessionStore();
  const identitySessionChallenges = new IdentitySessionChallengeStore();
  // ADR 0089's transport seam. An injected source still wins; otherwise the
  // local inbox serves what the owner published, and the unchanged ADR 0085
  // verifier judges it. Without either there is no source at all and every
  // reader-key check stays `freshness_unavailable`.
  const freshnessInbox = new PicoIdentityReaderKeyFreshnessInbox();
  /**
   * ADR 0107 D2. The authority surface the intake verifies against: this Home's
   * host key identity, its two sealed-box operations, and whether a sender may
   * act for its identity at all. The intake owns the verification order; this
   * owns the keys and the store lookups.
   */
  const linkIntake = new PicoLinkDirectIntake(sodium, {
    hostSigningKeyFingerprintHex: () => homeHostKeys?.publicBundle.signingKeyFingerprintHex,
    openSealedToHostKeyAgreement: (sealedHex) =>
      homeHostKeyStore.openSealedToKeyAgreement(sodium, sealedHex, 'Pico Link request'),
    signWithHostSigningKey: (signatureInput) =>
      homeHostKeyStore.signWithHostSigningKey(sodium, signatureInput),
    sealToReplyKey: (replyPublicKeyHex, plaintext) =>
      homeHostKeyStore.sealToPublicKey(sodium, replyPublicKeyHex, plaintext),
    // The same pair of conditions an identity session is held to in
    // `resolveAuthority`: membership admits, delegation authorizes these exact
    // device keys. A link request gets no weaker test than a session.
    isAuthorizedSender: (principal, at) =>
      store.hasActivePicoHomeMembership(principal.picoIdentityFingerprintHex, undefined, at)
      && store.hasActivePicoIdentityDelegation({
        picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
        deviceSigningKeyFingerprintHex: principal.deviceSigningKeyFingerprintHex,
        deviceKeyAgreementKeyFingerprintHex: principal.deviceKeyAgreementKeyFingerprintHex,
        delegationId: principal.delegationId,
        sodium,
        at,
      }),
  });
  const readerKeySelector = new PicoIdentityReaderKeySelector(
    store,
    sodium,
    new AuthenticatedPicoIdentityReaderKeyFreshnessSource(
      sodium,
      config.readerKeyFreshnessCheckpointSource ?? freshnessInbox,
    ),
  );
  const shareEnvelopeIssuer = new PicoShareEnvelopeIssuer(
    store,
    sodium,
    readerKeySelector,
    keyStore,
  );
  const readerCustody = store.readerCustody(sodium, readerKeySelector);
  const bootstrapCode = new OperatorBootstrapCode();
  const moveInCode = new MoveInCode();
  const homeHostKeyStore = new HomeHostKeyStore(homeHostKeyStorePath);
  let homeHostKeys: HomeHostKeyPairSet | undefined;
  let homeSetupNonceHex: string | undefined;
  let pendingHomeClaim: PendingPicoHomeClaim | undefined;
  const accessClasses = new AccessClassRegistry();
  // The sole-resident policy survives only while no signed Home exists. Claiming
  // switches the default at request time, including when claim happens in this
  // process, so there is no restart window where operator means read-all.
  const soleResidentReadership = new SoleResidentReadership();
  const homeMembershipReadership = new HomeMembershipReadership(store, store);
  const readership: DomainReadership = config.readership ?? {
    mayRead(principal, privacyDomain) {
      return store.picoHomeFoundingRecord() === undefined
        ? soleResidentReadership.mayRead(principal, privacyDomain)
        : homeMembershipReadership.mayRead(principal, privacyDomain);
    },
  };

  function appendServerEvent(type: FoundationEventType, payload: FoundationEventPayload): void {
    const event = factory.create({ deviceId: config.deviceId, type, payload });

    if (store.append(event) === 'inserted') {
      broadcast(event);
    }
  }

  function reconcileShareEnvelopes(): void {
    const reconciliation = store.reconcilePicoShareEnvelopes(
      sodium,
      (privacyDomain, kekVersion) => keyStore?.listVersions(privacyDomain, {
        custodyClass: 'host_custody',
      }).includes(kekVersion) === true,
    );
    for (const removed of reconciliation.removedForAuthority) {
      appendServerEvent('home.share_envelope_removed', {
        ...removed,
        reasonCategory: 'authority_reconciliation',
      });
    }
    for (const removed of reconciliation.removedForMissingKey) {
      appendServerEvent('home.share_envelope_removed', {
        ...removed,
        reasonCategory: 'key_unavailable',
      });
    }
  }

  function currentOperatorHomeBinding(): OperatorHomeBinding | undefined {
    const founding = store.picoHomeFoundingRecord()?.founding;

    // A row alone is not enough after restore. `homeHostKeys` is populated for
    // a claimed Home only after custody fingerprints and both founding
    // signatures have been re-verified. Treat unverifiable founding state as
    // no current binding, then distinguish it from a genuinely unclaimed Home
    // in `operatorPrincipalIsCurrent`.
    if (founding === undefined || homeHostKeys === undefined) {
      return undefined;
    }

    return {
      homeId: founding.homeId,
      foundingId: founding.foundingId,
      hostSigningKeyFingerprintHex: founding.hostSigningKeyFingerprintHex,
    };
  }

  function sameOperatorHomeBinding(
    left: OperatorHomeBinding | undefined,
    right: OperatorHomeBinding | undefined,
  ): boolean {
    if (left === undefined || right === undefined) {
      return left === right;
    }

    return left.homeId === right.homeId
      && left.foundingId === right.foundingId
      && left.hostSigningKeyFingerprintHex === right.hostSigningKeyFingerprintHex;
  }

  function currentOperatorPrincipal(): Extract<SessionPrincipal, { kind: 'operator' }> {
    const homeBinding = operators.get()?.homeBinding;

    return {
      kind: 'operator',
      ...(homeBinding === undefined ? {} : { homeBinding }),
    };
  }

  function operatorPrincipalIsCurrent(
    principal: Extract<SessionPrincipal, { kind: 'operator' }>,
  ): boolean {
    const operator = operators.get();
    const foundingExists = store.picoHomeFoundingRecord() !== undefined;
    const currentHomeBinding = currentOperatorHomeBinding();

    return operator !== undefined
      && !(foundingExists && currentHomeBinding === undefined)
      && sameOperatorHomeBinding(principal.homeBinding, operator.homeBinding)
      && sameOperatorHomeBinding(principal.homeBinding, currentHomeBinding);
  }

  function isCurrentHomeHostPico(
    principal: Extract<SessionPrincipal, { kind: 'pico_identity' }>,
  ): boolean {
    const founding = store.picoHomeFoundingRecord()?.founding;

    return founding !== undefined
      && currentOperatorHomeBinding() !== undefined
      && principal.picoIdentityFingerprintHex === founding.homeHostPicoIdentityFingerprintHex
      && store.hasActivePicoHomeMembership(principal.picoIdentityFingerprintHex, founding.homeId);
  }

  function activateHomeSetupMode(): void {
    const foundingRecord = store.picoHomeFoundingRecord();
    if (foundingRecord !== undefined) {
      moveInCode.clear();
      homeSetupNonceHex = undefined;
      pendingHomeClaim = undefined;
      return;
    }

    const claimState = store.picoHomeClaimState();
    if (claimState.state !== 'unclaimed') {
      moveInCode.clear();
      homeSetupNonceHex = undefined;
      pendingHomeClaim = undefined;
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
        hostSigningPublicKeyHex: homeHostKeys.publicBundle.signingPublicKeyHex,
        hostSigningKeyFingerprintHex: homeHostKeys.publicBundle.signingKeyFingerprintHex,
        hostKeyAgreementPublicKeyHex: homeHostKeys.publicBundle.keyAgreementPublicKeyHex,
        hostKeyAgreementKeyFingerprintHex: homeHostKeys.publicBundle.keyAgreementKeyFingerprintHex,
      },
      'Pico Home is unclaimed. The Move-In Code is valid for this process only and must be read from this local host channel.',
    );
  }

  /**
   * Returns the pending claim only while it is still live. An abandoned or
   * repeatedly failed ceremony must not keep the consumed Move-In Code and the
   * setup nonce hostage: dropping it reopens Setup Mode with fresh material.
   */
  function currentPendingHomeClaim(): PendingPicoHomeClaim | undefined {
    if (pendingHomeClaim === undefined) {
      return undefined;
    }

    if (!hasPicoExposureWindowElapsed({
      endsAtMs: pendingHomeClaim.expiresAtMs,
      nowMs: Date.now(),
      monotonic: {
        startedAtMs: pendingHomeClaim.startedAtMonotonicMs,
        nowMs: performance.now(),
        durationMs: PENDING_HOME_CLAIM_TTL_MS,
      },
    })) {
      return pendingHomeClaim;
    }

    discardPendingHomeClaim('expired');
    return undefined;
  }

  function discardPendingHomeClaim(reason: 'expired' | 'attempts_exhausted'): void {
    const discarded = pendingHomeClaim;
    pendingHomeClaim = undefined;
    moveInCode.clear();
    activateHomeSetupMode();

    app.log.warn(
      {
        reason,
        claimId: discarded?.claim.claimId,
        foundingId: discarded?.founding.foundingId,
      },
      'Pending Pico Home claim was discarded; setup mode reopened with a fresh Move-In Code.',
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
    const operatorUnbound = operators.clearHomeBinding();
    const revokedSessions = sessions.revokeAll();
    homeHostKeys = undefined;
    homeSetupNonceHex = undefined;
    pendingHomeClaim = undefined;
    moveInCode.clear();
    appendServerEvent('home.reset', {});
    app.log.warn(
      { removedHostKeyFiles: removed.removedFiles, operatorUnbound, revokedSessions },
      'Pico Home reset by local reset marker; host identity keys were removed and setup mode will mint a fresh Move-In Code.',
    );
  }

  const foundingReconciliation = store.reconcilePicoHomeFoundingEvidence();
  if (foundingReconciliation.restoredClaimState) {
    app.log.warn(
      'Pico Home claim state was reconciled from founding evidence; setup mode remains closed after restore.',
    );
  }
  // ADR 0115. The host-key chain is re-proven from the founding before
  // anything trusts it: the custody guard below compares against its head,
  // and every era-aware verifier reads the set it establishes.
  const hostContinuityReconciliation =
    store.reconcilePicoHomeHostContinuity(sodium);
  if (hostContinuityReconciliation.droppedLinks > 0) {
    app.log.error(
      hostContinuityReconciliation,
      'Pico Home host continuity links failed re-verification and were dropped '
      + 'with everything chained on them; the Home answers to the last proven '
      + 'head (ADR 0115).',
    );
  } else if (hostContinuityReconciliation.verifiedLinks > 0) {
    app.log.warn(
      hostContinuityReconciliation,
      'Pico Home host keys have rotated; records of earlier eras stay vouched '
      + 'for by the accepted continuity chain (ADR 0115).',
    );
  }
  // ADR 0115 U3. A crash between recording the link and promoting the staged
  // keys leaves custody one step behind the proven head; the staged files can
  // complete it, and only they can - anything else stays closed.
  {
    const provenHead = store.currentPicoHomeHostKeyHead();
    if (provenHead !== undefined) {
      try {
        const custody = homeHostKeyStore.load(sodium);
        if (custody !== undefined
          && (custody.publicBundle.signingKeyFingerprintHex
            !== provenHead.hostSigningKeyFingerprintHex
            || custody.publicBundle.keyAgreementKeyFingerprintHex
              !== provenHead.hostKeyAgreementKeyFingerprintHex)
          && homeHostKeyStore.completeInterruptedRotation(sodium, provenHead)) {
          app.log.warn(
            provenHead,
            'Pico Home host-key rotation was interrupted before the key swap '
            + 'and has been completed against the proven chain head (ADR 0115).',
          );
        }
      } catch {
        // Unreadable custody is the custody guard's case to report.
      }
    }
  }
  const claimedHomeFoundingVerified = reconcileClaimedHomeHostKeyCustody();
  const persistedOperator = operators.get();
  if (persistedOperator !== undefined
    && !sameOperatorHomeBinding(persistedOperator.homeBinding, currentOperatorHomeBinding())) {
    app.log.error(
      {
        operatorHomeBinding: persistedOperator.homeBinding ?? null,
        currentHomeBinding: currentOperatorHomeBinding() ?? null,
      },
      'Foundation operator binding does not match the current Pico Home founding; operator login is disabled until explicit local reset/bootstrap.',
    );
  }
  reconcileHomeMembershipCredentials();
  const identityEvidenceReconciliation = store.reconcilePicoIdentityLifecycleEvidence(sodium);
  if (identityEvidenceReconciliation.droppedDelegations > 0
    || identityEvidenceReconciliation.droppedRevocations > 0
    || identityEvidenceReconciliation.droppedReaderKeys > 0) {
    app.log.warn(
      identityEvidenceReconciliation,
      'Pico identity lifecycle evidence failed re-verification on boot and was dropped.',
    );
  }
  if (claimedHomeFoundingVerified) {
    const firstDeviceReconciliation = store.reconcilePicoHomeFirstDeviceEvidence(sodium);
    if ('reason' in firstDeviceReconciliation) {
      app.log.error(
        firstDeviceReconciliation,
        'Pico Home first-device evidence could not be re-projected from v2 founding evidence.',
      );
    }
    const deviceLifecycleReconciliation =
      store.reconcilePicoHomeDeviceLifecycleTransitions(sodium);
    if (deviceLifecycleReconciliation.quarantinedIdentities.length > 0) {
      app.log.error(
        deviceLifecycleReconciliation,
        'Pico Home device-lifecycle receipt verification failed; affected identity projections were quarantined.',
      );
    }
    const deviceRecoveryReconciliation =
      store.reconcilePicoHomeDeviceRecoveries(sodium);
    if (
      deviceRecoveryReconciliation.quarantinedIdentities.length > 0
      || deviceRecoveryReconciliation.lapsedPending > 0
    ) {
      app.log.warn(
        deviceRecoveryReconciliation,
        deviceRecoveryReconciliation.quarantinedIdentities.length > 0
          ? 'Pico Home device-recovery evidence failed verification; affected identity projections were quarantined.'
          : 'Expired pending Pico Home device recoveries were lapsed during startup.',
      );
    }
    // ADR 0114 T2. A rotation ends an identity's whole device authority, so
    // boot re-verifies its evidence before honoring it and promotes those
    // whose veto window has passed.
    const rootRotationReconciliation =
      store.reconcilePicoIdentityRootRotations(sodium);
    if (rootRotationReconciliation.quarantinedIdentities.length > 0) {
      app.log.error(
        rootRotationReconciliation,
        'Pico identity root rotation evidence failed verification; affected identity '
        + 'device authority was withdrawn until it is re-established (ADR 0114).',
      );
    } else if (rootRotationReconciliation.effectiveRotations > 0) {
      app.log.warn(
        rootRotationReconciliation,
        'Pico identity root rotations passed their veto window; the predecessor roots '
        + 'authorize nothing further and their relationships must be re-issued.',
      );
    }
    // ADR 0114 T5. Rotations belonging to another Home decide nothing here.
    // They should not exist in this database at all, so say so rather than
    // let a merged or misrestored database pass for an empty one.
    if (rootRotationReconciliation.foreignRotations > 0) {
      app.log.warn(
        rootRotationReconciliation,
        'This database holds Pico identity root rotations accepted by a different '
        + 'Home; they are ignored here. Accepting a rotation is a local act, so a '
        + 'rotation carried in from elsewhere must be presented to this Home.',
      );
    }
    // ADR 0110 R6. Both anchor faults are loud: a rollback is an attack
    // signature, and a lost anchor blocks every completion until an operator
    // re-seeds, so neither may be discovered by a person waiting for recovery.
    if (deviceRecoveryReconciliation.anchorStatus === 'rollback_detected') {
      app.log.error(
        deviceRecoveryReconciliation,
        'Pico Home recovery anchor holds resolutions this database no longer carries: '
        + 'the Foundation data was rolled back. Affected recoveries were re-resolved '
        + 'and the identities quarantined; the recoveries cannot be completed again.',
      );
    } else if (deviceRecoveryReconciliation.anchorStatus === 'anchor_lost') {
      // ADR 0110 R6. The operator's way out, in the same shape as the other
      // drastic host actions: a marker file beside the database, consumed
      // once. It rebuilds terminal knowledge from rows that are already
      // there and deliberately leaves restored pending rows unknown, so it
      // restores service without reviving anything.
      if (consumeRecoveryAnchorReseedMarker(config.databasePath)) {
        const reseeded = store.reseedPicoHomeRecoveryAnchor();
        if (reseeded.ok) {
          appendServerEvent('home.recovery_anchor_reseeded', {});
          app.log.warn(
            reseeded,
            'Pico Home recovery anchor was re-seeded from the local reset marker. '
            + 'Terminal recoveries were carried over; any pending recovery must be '
            + 'initiated again, and recoveries resolved before the anchor was lost '
            + 'cannot be re-detected (ADR 0110 R6).',
          );
        } else {
          app.log.error(
            reseeded,
            'Pico Home recovery anchor re-seed was requested but refused.',
          );
        }
      } else {
        app.log.error(
          deviceRecoveryReconciliation,
          'Pico Home recovery anchor is empty although recovery history exists. '
          + 'A wiped anchor cannot be told apart from a rollback, so device recovery '
          + 'stays closed until it is re-seeded explicitly: create the file '
          + `${recoveryAnchorReseedMarkerPath(config.databasePath)} and restart `
          + '(ADR 0110 R6).',
        );
      }
    }
  }
  const grantReconciliation = store.reconcilePicoHomeDomainReadGrants(sodium);
  if (grantReconciliation.droppedGrants > 0 || grantReconciliation.droppedLifecycleRecords > 0) {
    app.log.warn(
      grantReconciliation,
      'Pico Home domain read-grant evidence failed re-verification on boot and was dropped.',
    );
  }
  reconcileShareEnvelopes();
  const readerCustodyReconciliation = readerCustody.reconcile();
  if (Object.values(readerCustodyReconciliation).some((count) => count > 0)) {
    app.log.warn(
      readerCustodyReconciliation,
      'Reader-custody evidence failed re-verification on boot and was dropped.',
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
    { anchorFloorMs: () => store.recoveryAnchorFloorMs() },
  );

  /**
   * ADR 0121 J4. `signed` is stated as false rather than omitted: J3's
   * checkpoint signer does not exist, so every interval is unsigned, and a
   * missing field is exactly what a reader would mistake for coverage.
   */
  function auditCoverage(): PicoAuditCoverage {
    const verification = store.verifyPicoAuditChain();
    return {
      chained: verification.chained,
      signed: false,
      writers: verification.writers,
    };
  }

  // ADR 0121 J4. Boot re-proves the links in the ADR 0115 U2 posture: report
  // loudly, never drop, repair or hide the affected range. A break here is not
  // a reason to refuse service - the log is evidence, not authority - but it
  // must never pass in silence.
  {
    const coverage = auditCoverage();
    for (const writer of coverage.writers) {
      if (writer.status === 'verified') {
        continue;
      }
      app.log.error(
        {
          writerId: writer.writerId,
          status: writer.status,
          recordCount: writer.recordCount,
          ...(writer.brokenAtPosition === undefined
            ? {}
            : { brokenAtPosition: writer.brokenAtPosition }),
          ...(writer.checkpointedPosition === undefined
            ? {}
            : { checkpointedPosition: writer.checkpointedPosition }),
        },
        writer.status === 'rolled_back'
          ? 'audit chain rolled back: the anchor holds a head this database does not'
          : writer.status === 'broken'
            ? 'audit chain broken: a link does not verify and the range beyond it is not covered'
            : 'audit chain unanchored: no checkpoint exists for this writer',
      );
    }
    if (!coverage.chained) {
      app.log.warn('audit chain absent: no records are chained on this instance');
    }
  }

  // ADR 0120 N5. The two readings this process started from, so movement can
  // be measured against them rather than guessed at.
  const startedAtWallMs = Date.now();
  const startedAtMonotonicMs = performance.now();
  let reportedClockDivergence: PicoClockDivergence | null = null;

  /**
   * ADR 0120 N5. Recorded as a fact, never a silent correction: Pico does not
   * re-base its windows onto the new time. Appended once per distinct kind, so
   * a clock that stays moved does not fill the log with the same sentence.
   */
  function checkClockDivergence(): PicoClockDivergence | null {
    const divergence = detectPicoClockDivergence({
      wallMs: Date.now(),
      monotonicMs: performance.now(),
      startedAtWallMs,
      startedAtMonotonicMs,
      anchorFloorMs: store.recoveryAnchorFloorMs(),
    });
    if (divergence !== null && divergence.kind !== reportedClockDivergence?.kind) {
      appendServerEvent('home.clock_divergence_detected', {});
      app.log.warn(
        { kind: divergence.kind, differenceMs: divergence.differenceMs },
        'clock divergence detected',
      );
    }
    reportedClockDivergence = divergence;
    return divergence;
  }

  function runRetentionSweep(): void {
    try {
      // ADR 0120 N2. The retention tick doubles as the anchor heartbeat: the
      // floor rises with observed time, and observed time only becomes durable
      // once it is written down.
      store.observeRecoveryAnchor();
      checkClockDivergence();
      const result = retentionSweeper.sweep();
      if (result.refusedImplausibleClock === true) {
        // N5: recorded as a fact, never a silent skip and never a quiet
        // re-basing of the windows onto the new time.
        app.log.error(
          { scanned: result.scanned },
          'retention sweep refused: wall clock implausible against the recovery anchor floor',
        );
      }
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

  /**
   * Revocation has to reach the live stream, not just the next HTTP request.
   * These mirror the ticket purges: one session's connections, or every
   * session-backed connection. A connection opened under the static token or in
   * the credential-free local mode carries no session and is left alone.
   */
  function terminateSessionSockets(sessionDigest: string): void {
    for (const socket of sockets) {
      if (socket.sessionDigest === sessionDigest) {
        socket.terminate();
        sockets.delete(socket);
      }
    }
  }

  function terminateAllSessionSockets(): void {
    for (const socket of sockets) {
      if (socket.sessionDigest !== undefined) {
        socket.terminate();
        sockets.delete(socket);
      }
    }
  }

  function broadcast(event: PicoEvent): void {
    const message: PicoEventCreatedMessage = { type: realtimeMessageType.eventCreated, event };
    const serialized = JSON.stringify(message);

    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(serialized);
      }
    }
  }

  /**
   * Re-verifies stored membership credentials against the current founding
   * record on every boot, so a restored database cannot carry a member row whose
   * authority nobody can prove any more (ADR 0080 H6, the H8 rule applied to
   * membership).
   */
  function reconcileHomeMembershipCredentials(): void {
    const result = store.reconcilePicoHomeMembershipsFromCredentials(sodium);

    if (result.droppedCredentials > 0) {
      app.log.warn(
        result,
        'Pico Home membership credentials failed re-verification on boot and were dropped with their projected rows.',
      );
    }
  }

  function reconcileClaimedHomeHostKeyCustody(): boolean {
    const foundingRecord = store.picoHomeFoundingRecord();
    if (foundingRecord === undefined) {
      return false;
    }

    let restoredHomeHostKeys: HomeHostKeyPairSet | undefined;
    try {
      restoredHomeHostKeys = homeHostKeyStore.load(sodium);
    } catch (error) {
      app.log.error(
        { err: error, foundingId: foundingRecord.founding.foundingId, homeId: foundingRecord.founding.homeId },
        'Pico Home host key custody is invalid while founding evidence exists; setup mode remains closed.',
      );
      return false;
    }

    if (restoredHomeHostKeys === undefined) {
      app.log.error(
        { foundingId: foundingRecord.founding.foundingId, homeId: foundingRecord.founding.homeId },
        'Pico Home host key custody is missing while founding evidence exists; setup mode remains closed.',
      );
      return false;
    }

    const host = restoredHomeHostKeys.publicBundle;
    // ADR 0115. Custody must match the *proven chain head*, not the founding:
    // after a rotation the founding keys are honestly retired, and custody
    // still holding them - or holding keys no chain link ever accepted - is a
    // half-completed rotation or a swapped disk, both of which stay closed.
    const expectedHead = store.currentPicoHomeHostKeyHead() ?? {
      hostSigningKeyFingerprintHex: foundingRecord.founding.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: foundingRecord.founding.hostKeyAgreementKeyFingerprintHex,
    };
    if (
      host.signingKeyFingerprintHex !== expectedHead.hostSigningKeyFingerprintHex
      || host.keyAgreementKeyFingerprintHex !== expectedHead.hostKeyAgreementKeyFingerprintHex
    ) {
      app.log.error(
        {
          foundingId: foundingRecord.founding.foundingId,
          homeId: foundingRecord.founding.homeId,
          expectedHostSigningKeyFingerprintHex: expectedHead.hostSigningKeyFingerprintHex,
          actualHostSigningKeyFingerprintHex: host.signingKeyFingerprintHex,
          expectedHostKeyAgreementKeyFingerprintHex: expectedHead.hostKeyAgreementKeyFingerprintHex,
          actualHostKeyAgreementKeyFingerprintHex: host.keyAgreementKeyFingerprintHex,
        },
        'Pico Home host key custody does not match the proven host-key chain head; setup mode remains closed.',
      );
      return false;
    }

    const verification = verifyPicoHomeFoundingEvidence(
      foundingRecord,
      store.foundingEraHostSigningPublicKeyHex()
        ?? restoredHomeHostKeys.publicBundle.signingPublicKeyHex,
    );
    if (!verification.ok) {
      app.log.error(
        {
          foundingId: foundingRecord.founding.foundingId,
          homeId: foundingRecord.founding.homeId,
          reason: verification.reason,
        },
        'Pico Home founding evidence signature verification failed; setup mode remains closed.',
      );
      return false;
    }

    homeHostKeys = restoredHomeHostKeys;
    return true;
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
      return { kind: 'static-token' };
    }

    const credential = readBearerCredential(authorizationHeader);
    const touched = sessions.touch(credential);
    const sessionDigest = sessions.digestOf(credential);
    if (touched === undefined || sessionDigest === undefined) {
      return { kind: 'none' };
    }

    if (touched.principal.kind === 'operator') {
      if (!operatorPrincipalIsCurrent(touched.principal)) {
        sessions.revoke(credential);
        purgeSessionRealtimeTickets(realtimeTickets, sessionDigest);
        terminateSessionSockets(sessionDigest);
        return { kind: 'none' };
      }

      return { kind: 'operator', sessionDigest, principal: touched.principal };
    }

    const principal = touched.principal;
    const active = store.hasActivePicoHomeMembership(principal.picoIdentityFingerprintHex)
      && store.hasActivePicoIdentityDelegation({
        picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
        deviceSigningKeyFingerprintHex: principal.deviceSigningKeyFingerprintHex,
        deviceKeyAgreementKeyFingerprintHex: principal.deviceKeyAgreementKeyFingerprintHex,
        delegationId: principal.delegationId,
        sodium,
      });
    if (!active) {
      sessions.revoke(credential);
      purgeSessionRealtimeTickets(realtimeTickets, sessionDigest);
      terminateSessionSockets(sessionDigest);
      return { kind: 'none' };
    }

    return { kind: 'pico-identity', sessionDigest, principal };
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

    // ADR 0107: the link intake authenticates inside the envelope, so it takes
    // no Authorization header and must not be measured against one. Letting it
    // fall through to the session checks below would reject every legitimate
    // request; treating it as `public` would be wrong for the opposite reason,
    // because it is not open - it is authenticated one layer in.
    if (accessClass === 'link-intake') {
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
      if (authority.kind === 'operator' || authority.kind === 'static-token') {
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
      if (authority.kind !== 'operator' && authority.kind !== 'pico-identity') {
        return unauthorized(reply, 'Authenticated Foundation session is required.');
      }

      const privacyDomain = (request.params as { privacyDomain?: string }).privacyDomain;

      if (privacyDomain === undefined || !readership.mayRead({
        sessionDigest: authority.sessionDigest,
        ...(authority.kind === 'pico-identity'
          ? { picoIdentityFingerprintHex: authority.principal.picoIdentityFingerprintHex }
          : {}),
      }, privacyDomain)) {
        // Non-enumerating denial (ADR 0077 C4): does not reveal whether the
        // domain exists or holds content.
        return sendNoStore(reply.code(404), { error: 'Not found.' });
      }

      return;
    }

    if (accessClass === 'authenticated') {
      if (authority.kind === 'operator' || authority.kind === 'pico-identity') {
        return;
      }

      return unauthorized(reply, 'Authenticated Foundation session is required.');
    }

    if (accessClass === 'home-authority-relay') {
      if (authority.kind === 'operator' && authority.principal.homeBinding !== undefined) {
        return;
      }
      if (authority.kind === 'pico-identity' && isCurrentHomeHostPico(authority.principal)) {
        return;
      }

      return unauthorized(reply, 'Current Pico Home authority relay session is required.');
    }

    // Every remaining class is local host infrastructure and needs the
    // operator role, so the principal-less
    // static token cannot reach them: its ceiling is foundation-diagnostic
    // (ADR 0075).
    if (authority.kind !== 'operator') {
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
  // ADR 0107: one route, envelopes only. Every class above it stays local.
  accessClasses.register('POST', '/api/home/link', 'link-intake');
  // ADR 0115 U4: honestly `public`, not `link-intake` - there is no
  // authentication one layer in, and there must not be: the read exists for
  // clients the sealed channel refuses. It serves only self-authenticating
  // material. Publication beyond the host stays the restricted listener's
  // explicit decision, not this class's.
  accessClasses.register('GET', PICO_LINK_CONTINUITY_READ_PATH, 'public');
  accessClasses.register('GET', '/api/home/setup', 'setup-bootstrap');
  accessClasses.register('POST', '/api/home/claim', 'setup-bootstrap');
  accessClasses.register('POST', '/api/auth/session', 'public');
  accessClasses.register('POST', '/api/auth/identity-challenges', 'public');
  accessClasses.register('POST', '/api/auth/identity-session', 'public');
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
  // Every Home route transports or lists signed Home-authority evidence. The
  // local operator fallback is accepted only after exact binding to this
  // founding; the active founding Home Host Pico may use the same relay
  // surface. Neither session can mint authority: handlers verify the named
  // controller/issuer signature before every state transition (ADR 0087).
  accessClasses.register('POST', '/api/home/memberships', 'home-authority-relay');
  accessClasses.register('POST', '/api/home/membership-lifecycle', 'home-authority-relay');
  accessClasses.register('GET', '/api/home/memberships', 'home-authority-relay');
  accessClasses.register('POST', '/api/home/domain-read-grants', 'home-authority-relay');
  accessClasses.register('POST', '/api/home/domain-read-grant-lifecycle', 'home-authority-relay');
  accessClasses.register('GET', '/api/home/domain-read-grants', 'home-authority-relay');
  accessClasses.register('POST', '/api/home/reader-key-freshness-checkpoints', 'home-authority-relay');
  accessClasses.register('POST', '/api/home/share-envelope-issuance', 'home-authority-relay');
  accessClasses.register('POST', '/api/home/share-envelopes', 'home-authority-relay');
  accessClasses.register('GET', '/api/home/share-envelopes', 'home-authority-relay');
  // The exact-bound fallback or founding Home Host Pico may relay and inspect
  // opaque reader-custody evidence, but the routes never expose a raw KEK, DEK
  // or plaintext. This is signed-authority relay, not readership (ADR 0086/87).
  accessClasses.register('POST', '/api/home/reader-custody/domains', 'home-authority-relay');
  accessClasses.register('GET', '/api/home/reader-custody/domains', 'home-authority-relay');
  accessClasses.register('POST', '/api/home/reader-custody/reader-grants', 'home-authority-relay');
  accessClasses.register('GET', '/api/home/reader-custody/reader-grants', 'home-authority-relay');
  accessClasses.register('POST', '/api/home/reader-custody/reader-grant-lifecycle', 'home-authority-relay');
  accessClasses.register('POST', '/api/home/reader-custody/writer-grants', 'home-authority-relay');
  accessClasses.register('GET', '/api/home/reader-custody/writer-grants', 'home-authority-relay');
  accessClasses.register('POST', '/api/home/reader-custody/writer-grant-lifecycle', 'home-authority-relay');
  accessClasses.register('POST', '/api/home/reader-custody/kek-rotations', 'home-authority-relay');
  accessClasses.register('GET', '/api/home/reader-custody/kek-rotations', 'home-authority-relay');
  accessClasses.register('POST', '/api/home/reader-custody/items', 'home-authority-relay');
  accessClasses.register('GET', '/api/home/reader-custody/items', 'home-authority-relay');
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

  function readSystemStatus(): PicoSystemStatusResponse {
    return {
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
  }

  app.get('/api/system/status', async (_request, reply) => {
    return sendNoStore(reply, readSystemStatus());
  });

  function recordHomeMembership(body: unknown): FoundationOperationResult {
    if (homeHostKeys === undefined) {
      return { statusCode: 409, body: { error: 'Pico Home host keys are unavailable.' } };
    }

    const foundingRecord = store.picoHomeFoundingRecord();
    if (foundingRecord === undefined) {
      return { statusCode: 409, body: { error: 'no_founding_record' } };
    }

    let issuerStatement: PicoHomeMembershipIssuerStatement;
    try {
      issuerStatement = parsePicoHomeMembershipIssuerStatement(body);
    } catch (error) {
      return { statusCode: 400, body: { error: (error as Error).message } };
    }

    const authority = verifyPicoHomeMembershipAuthority(sodium, {
      credential: issuerStatement,
      foundingRecord,
    });
    if (!authority.ok) {
      return {
        statusCode: membershipFailureStatus(authority.reason),
        body: { error: authority.reason },
      };
    }

    const credential: PicoHomeMembershipCredential = {
      ...issuerStatement,
      hostActivationSignatureHex: homeHostKeyStore.signWithHostSigningKey(
        sodium,
        buildPicoHomeMembershipSignatureInput(issuerStatement.membership),
      ),
      createdAt: new Date().toISOString(),
    };
    const recorded = store.recordPicoHomeMembershipCredential({
      sodium,
      credential,
      hostSigningPublicKeyHex: homeHostKeys.publicBundle.signingPublicKeyHex,
    });
    if (!recorded.ok) {
      return {
        statusCode: membershipFailureStatus(recorded.reason),
        body: { error: recorded.reason },
      };
    }

    appendServerEvent('home.membership_recorded', {
      credentialId: recorded.membership.sourceRef,
      subjectPicoIdentityFingerprintHex: recorded.membership.picoIdentityFingerprintHex,
      status: recorded.membership.status,
    });
    return {
      statusCode: 201,
      body: { membership: recorded.membership as unknown as Record<string, unknown> },
    };
  }

  function publishReaderKeyFreshnessCheckpoint(body: unknown): FoundationOperationResult {
    if (!isRecord(body)
      || body.schema !== picoIdentityReaderKeyFreshnessCheckpointSchema
      || !isRecord(body.checkpoint)
      || !isRecord(body.issuerIdentityKeyRecord)
      || typeof body.issuerSignatureHex !== 'string') {
      return {
        statusCode: 400,
        body: { error: 'Invalid reader-key freshness checkpoint.' },
      };
    }

    try {
      buildPicoIdentityReaderKeyFreshnessSignatureInput(
        body.checkpoint as unknown as PicoIdentityReaderKeyFreshnessSignatureInput,
      );
    } catch {
      return {
        statusCode: 400,
        body: { error: 'Invalid reader-key freshness checkpoint.' },
      };
    }

    freshnessInbox.publish(body as unknown as PicoIdentityReaderKeyFreshnessCheckpoint);
    return { statusCode: 202, body: { accepted: true } };
  }

  function recordReaderCustodyDomain(body: unknown): FoundationOperationResult {
    const result = readerCustody.recordDomain(body as PicoReaderCustodyDomainRecord);
    if (!result.ok) {
      return {
        statusCode: readerCustodyFailureStatus(result.reason),
        body: { error: result.reason },
      };
    }
    return {
      statusCode: result.inserted ? 201 : 200,
      body: { domain: result.value as unknown as Record<string, unknown> },
    };
  }

  async function recordReaderCustodyReaderGrant(
    body: unknown,
  ): Promise<FoundationOperationResult> {
    const result = await readerCustody.recordReaderGrant(
      body as PicoReaderCustodyReaderGrantRecord,
    );
    if (!result.ok) {
      return {
        statusCode: readerCustodyFailureStatus(result.reason),
        body: { error: result.reason },
      };
    }
    return {
      statusCode: result.inserted ? 201 : 200,
      body: { readerGrant: result.value as unknown as Record<string, unknown> },
    };
  }

  function recordReaderCustodyKekRotation(body: unknown): FoundationOperationResult {
    const result = readerCustody.recordKekRotation(body as PicoReaderCustodyKekRotationRecord);
    if (!result.ok) {
      return {
        statusCode: readerCustodyFailureStatus(result.reason),
        body: { error: result.reason },
      };
    }
    return {
      statusCode: result.inserted ? 201 : 200,
      body: { rotation: result.value as unknown as Record<string, unknown> },
    };
  }

  async function executeHomeAuthoritySubmit(
    args: Record<string, unknown>,
  ): Promise<FoundationOperationResult> {
    if (typeof args.resource !== 'string'
      || !isRecord(args.record)
      || !hasExactKeys(args, ['resource', 'record'])) {
      return { statusCode: 400, body: { error: 'invalid_authority_submit_arguments' } };
    }

    switch (args.resource) {
      case 'membership':
        return recordHomeMembership(args.record);
      case 'reader_key_freshness_checkpoint':
        return publishReaderKeyFreshnessCheckpoint(args.record);
      case 'reader_custody_domain':
        return recordReaderCustodyDomain(args.record);
      case 'reader_custody_reader_grant':
        return await recordReaderCustodyReaderGrant(args.record);
      case 'reader_custody_kek_rotation':
        return recordReaderCustodyKekRotation(args.record);
      default:
        return { statusCode: 400, body: { error: 'unknown_authority_resource' } };
    }
  }

  function executeHomeAuthorityList(
    args: Record<string, unknown>,
  ): FoundationOperationResult {
    if (typeof args.resource !== 'string' || !hasExactKeys(args, ['resource'])) {
      return { statusCode: 400, body: { error: 'invalid_authority_list_arguments' } };
    }
    switch (args.resource) {
      case 'home_state':
        return {
          statusCode: 200,
          body: {
            claimState: toPicoHomeClaimStateResponse(
              store.picoHomeClaimState(),
              moveInCode.isPending(),
            ) as unknown as Record<string, unknown>,
          },
        };
      case 'reader_custody_domains':
        return {
          statusCode: 200,
          body: { domains: readerCustody.domains() },
        };
      default:
        return { statusCode: 400, body: { error: 'unknown_authority_resource' } };
    }
  }

  function toLinkExecution(result: FoundationOperationResult): PicoLinkDirectExecution {
    return {
      outcome: result.statusCode >= 200 && result.statusCode < 300
        ? 'ok'
        : 'foundation_rejected',
      result: {
        statusCode: result.statusCode,
        ...result.body,
      },
    };
  }

  /**
   * ADR 0107 D2. The only route reachable without a session, and the only one
   * that may be exposed beyond the host: it accepts sealed envelopes and
   * nothing else, so mapping a port for it no longer means exposing the
   * diagnostic surface ADR 0030 keeps local.
   *
   * The intake verifies; this dispatches. Each operation runs the same
   * authorization the local route runs, with the verified link principal
   * standing where the session principal stands - so remote capability is
   * opt-in per operation and cannot be inherited by adding a route.
   */
  app.post('/api/home/link', {
    bodyLimit: MAX_PICO_LINK_DIRECT_REQUEST_BODY_BYTES,
  }, async (request, reply) => {
    // ADR 0115 U3. The reply to a host-rotation submit is the last message of
    // the old era: the client can only verify it under the pin it still
    // holds, so custody must not swap until the response is sealed and
    // signed. The handler schedules the swap; it runs after the envelope is
    // built, and a crash in between is completed at the next boot.
    let afterReply: (() => void) | undefined;
    const handled = await linkIntake.handle(request.body, async (operation, args, principal) => {
      switch (operation) {
        case 'home.setup.read': {
          const setup = readHomeSetupState();
          return setup === undefined
            ? { outcome: 'setup_mode_inactive', result: {} }
            : { outcome: 'ok', result: setup as unknown as Record<string, unknown> };
        }
        case 'home.claim.submit': {
          return toLinkExecution(executeHomeClaim(args, principal));
        }
        case 'home.authority.submit': {
          if (principal === undefined
            || !isCurrentHomeHostPico({
              kind: 'pico_identity',
              picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
              deviceSigningKeyFingerprintHex: principal.deviceSigningKeyFingerprintHex,
              deviceKeyAgreementKeyFingerprintHex: principal.deviceKeyAgreementKeyFingerprintHex,
              delegationId: principal.delegationId,
            })) {
            return { outcome: 'sender_is_not_home_authority', result: {} };
          }
          return toLinkExecution(await executeHomeAuthoritySubmit(args));
        }
        case 'home.authority.list': {
          // Both require a Home-bound principal. `home-authority-relay` accepts
          // an identity session only when it is the current Home Host Pico, so
          // the link principal is held to exactly that and nothing broader.
          if (principal === undefined
            || !isCurrentHomeHostPico({
              kind: 'pico_identity',
              picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
              deviceSigningKeyFingerprintHex: principal.deviceSigningKeyFingerprintHex,
              deviceKeyAgreementKeyFingerprintHex: principal.deviceKeyAgreementKeyFingerprintHex,
              delegationId: principal.delegationId,
            })) {
            return { outcome: 'sender_is_not_home_authority', result: {} };
          }
          return toLinkExecution(executeHomeAuthorityList(args));
        }
        case 'home.device.lifecycle.read': {
          if (Object.keys(args).length !== 0) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const view = store.picoHomeDeviceLifecycleView({
            picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
            sodium,
          });
          return view === undefined
            ? { outcome: 'lifecycle_unavailable', result: {} }
            : {
              outcome: 'ok',
              result: {
                ...view,
                pendingRecovery:
                  store.picoHomeDeviceRecoveryPendingView(
                    principal.picoIdentityFingerprintHex,
                  ),
                // ADR 0114 T4. A pending rotation ends this identity's whole
                // device authority when its window runs out, so it belongs on
                // the read the ADR 0112 carrier already performs - the alarm
                // needs no second surface to find.
                pendingRootRotation: store.picoIdentityRootRotationView(
                  principal.picoIdentityFingerprintHex,
                ),
                // ADR 0120 N5. Where movement touches an objection window the
                // person hears about it, and it rides the read the ADR 0112
                // carrier already performs rather than getting a second
                // surface nobody would poll. Reported, never used to re-base
                // a window: the attempt is more interesting than the
                // correction.
                clockDivergence: checkClockDivergence(),
                // ADR 0114 T3/T4. What this identity's own rotation still owes
                // it, readable from the first authorized moment - which is the
                // instant the Home Host Pico re-admits the successor, not one
                // restart later. Before that moment the successor's device is
                // refused like any non-member, deliberately: the only step
                // that exists then belongs to the issuer, and a Home that
                // discussed the predecessor's memberships with a key its
                // issuer has not re-admitted would be acting on the
                // continuity before the issuer did.
                rotationDebt: store.picoIdentityRotationDebtView(
                  principal.picoIdentityFingerprintHex,
                ),
              } as unknown as Record<string, unknown>,
            };
        }
        case 'home.device.lifecycle.submit': {
          if (
            Object.keys(args).length !== 1
            || !('submission' in args)
            || !isRecord(args.submission)
            || homeHostKeys === undefined
          ) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const pendingBefore = store.picoHomeDeviceRecoveryPendingView(
            principal.picoIdentityFingerprintHex,
          );
          const result = store.recordPicoHomeDeviceLifecycleTransition({
            submission: args.submission as unknown as PicoHomeDeviceLifecycleSubmission,
            sponsor: principal,
            hostSigningKeyRecord: {
              suite: homeHostKeys.publicBundle.suite,
              keyRole: 'home_host_signing',
              publicKeyHex: homeHostKeys.publicBundle.signingPublicKeyHex,
            },
            signHostReceipt: (signatureInput) =>
              homeHostKeyStore.signWithHostSigningKey(sodium, signatureInput),
            sodium,
          });
          if (result.ok && result.inserted && pendingBefore !== null) {
            appendServerEvent('home.device_recovery_vetoed', {});
            app.log.warn(
              {
                recoveryId: pendingBefore.recoveryId,
                picoIdentityFingerprintHex:
                  principal.picoIdentityFingerprintHex,
                cause: 'accepted_device_lifecycle_transition',
              },
              'Pending Pico device recovery was cancelled by a living device lifecycle transition.',
            );
          }
          return result.ok
            ? {
              outcome: 'ok',
              result: {
                inserted: result.inserted,
                record: result.record,
              },
            }
            : { outcome: result.reason, result: {} };
        }
        case 'home.device.recovery.submit': {
          if (args.phase === 'prepare') {
            if (
              !hasExactKeys(args, ['phase', 'preparation'])
              || !isRecord(args.preparation)
            ) {
              return { outcome: 'invalid_arguments', result: {} };
            }
            const result = store.preparePicoHomeDeviceRecovery({
              preparation:
                args.preparation as unknown as PicoHomeDeviceRecoveryPreparation,
              sender: principal,
              sodium,
            });
            return result.ok
              ? {
                outcome: 'ok',
                result: {
                  preparationId:
                    (args.preparation as unknown as PicoHomeDeviceRecoveryPreparation)
                      .request.preparationId,
                  homeId: result.view.homeId,
                  picoIdentityFingerprintHex:
                    result.view.picoIdentityFingerprintHex,
                  observedLifecycleOrder:
                    result.view.observedLifecycleOrder,
                  activeDevices: result.view.devices
                    .filter((device) => device.status === 'active')
                    .map((device) => ({
                      delegationId: device.delegationId,
                      deviceSigningKeyFingerprintHex:
                        device.deviceSigningKeyFingerprintHex,
                      deviceKeyAgreementKeyFingerprintHex:
                        device.deviceKeyAgreementKeyFingerprintHex,
                    })),
                },
              }
              : { outcome: result.reason, result: {} };
          }
          if (args.phase === 'initiate') {
            if (
              !hasExactKeys(args, ['phase', 'submission'])
              || !isRecord(args.submission)
            ) {
              return { outcome: 'invalid_arguments', result: {} };
            }
            const result = store.initiatePicoHomeDeviceRecovery({
              submission:
                args.submission as unknown as PicoHomeDeviceRecoverySubmission,
              sender: principal,
              sodium,
            });
            if (!result.ok) {
              return { outcome: result.reason, result: {} };
            }
            app.log.warn(
              {
                recoveryId: result.pending.recoveryId,
                picoIdentityFingerprintHex:
                  principal.picoIdentityFingerprintHex,
                effectiveAt: result.pending.effectiveAt,
                completionExpiresAt: result.pending.completionExpiresAt,
                supersededExisting: result.status === 'superseded',
              },
              'Pico device recovery is pending.',
            );
            return {
              outcome: 'recovery_pending',
              result: {
                status: 'pending',
                ...result.pending,
              },
            };
          }
          if (args.phase === 'complete') {
            if (
              !hasExactKeys(args, ['phase', 'recoveryId', 'claimDigestHex'])
              || typeof args.recoveryId !== 'string'
              || !/^[A-Za-z0-9._:/+-]{1,1024}$/u.test(args.recoveryId)
              || typeof args.claimDigestHex !== 'string'
              || !/^[0-9a-f]{64}$/u.test(args.claimDigestHex)
              || homeHostKeys === undefined
            ) {
              return { outcome: 'invalid_arguments', result: {} };
            }
            const result = store.completePicoHomeDeviceRecovery({
              recoveryId: args.recoveryId,
              claimDigestHex: args.claimDigestHex,
              sender: principal,
              hostSigningKeyRecord: {
                suite: homeHostKeys.publicBundle.suite,
                keyRole: 'home_host_signing',
                publicKeyHex:
                  homeHostKeys.publicBundle.signingPublicKeyHex,
              },
              signHostReceipt: (signatureInput) =>
                homeHostKeyStore.signWithHostSigningKey(
                  sodium,
                  signatureInput,
                ),
              sodium,
            });
            if (!result.ok) {
              return { outcome: result.reason, result: {} };
            }
            appendServerEvent('home.device_recovered', {});
            app.log.warn(
              {
                recoveryId: args.recoveryId,
                picoIdentityFingerprintHex:
                  principal.picoIdentityFingerprintHex,
              },
              'Pico device recovery completed and replaced the projected device set.',
            );
            return {
              outcome: 'ok',
              result: {
                status: 'consumed',
                record: result.record,
              },
            };
          }
          return { outcome: 'invalid_arguments', result: {} };
        }
        case 'home.device.recovery.veto': {
          if (
            !hasExactKeys(args, ['recoveryId'])
            || typeof args.recoveryId !== 'string'
          ) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const result = store.vetoPicoHomeDeviceRecovery({
            recoveryId: args.recoveryId,
            picoIdentityFingerprintHex:
              principal.picoIdentityFingerprintHex,
          });
          if (!result.ok) {
            return { outcome: result.reason, result: {} };
          }
          appendServerEvent('home.device_recovery_vetoed', {});
          app.log.warn(
            {
              recoveryId: args.recoveryId,
              picoIdentityFingerprintHex:
                principal.picoIdentityFingerprintHex,
              cause: 'explicit_device_veto',
            },
            'Pending Pico device recovery was vetoed by a living device.',
          );
          return {
            outcome: 'ok',
            result: { status: 'vetoed' },
          };
        }
        case 'home.identity.rotation.submit': {
          if (
            !hasExactKeys(args, [
              'rotation',
              'predecessorIdentityKeyRecord',
              'successorIdentityKeyRecord',
              'predecessorSignatureHex',
              'successorSignatureHex',
              'successorFirstDevice',
            ])
            || !isRecord(args.rotation)
            || !isRecord(args.predecessorIdentityKeyRecord)
            || !isRecord(args.successorIdentityKeyRecord)
            || typeof args.predecessorSignatureHex !== 'string'
            || typeof args.successorSignatureHex !== 'string'
            || !isRecord(args.successorFirstDevice)
          ) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const result = store.submitPicoIdentityRootRotation({
            rotation: args.rotation as unknown as PicoIdentityRotationSignatureInput,
            predecessorIdentityKeyRecord:
              args.predecessorIdentityKeyRecord as unknown as PicoIdentityKeyRecordSignatureInput,
            successorIdentityKeyRecord:
              args.successorIdentityKeyRecord as unknown as PicoIdentityKeyRecordSignatureInput,
            predecessorSignatureHex: args.predecessorSignatureHex,
            successorSignatureHex: args.successorSignatureHex,
            successorFirstDevice:
              args.successorFirstDevice as unknown as PicoIdentityRotationSuccessorFirstDevice,
            sender: principal,
            sodium,
          });
          if (!result.ok) {
            return { outcome: result.reason, result: {} };
          }
          app.log.warn(
            {
              rotationId: result.rotation.rotationId,
              predecessorIdentityFingerprintHex:
                result.rotation.predecessorIdentityFingerprintHex,
              successorIdentityFingerprintHex:
                result.rotation.successorIdentityFingerprintHex,
              effectiveAt: result.rotation.effectiveAt,
            },
            'A Pico identity root rotation is pending; when its veto window '
            + 'runs out the predecessor root authorizes nothing further.',
          );
          return {
            outcome: 'rotation_pending',
            result: { ...result.rotation } as unknown as Record<string, unknown>,
          };
        }
        case 'home.identity.rotation.veto': {
          if (
            !hasExactKeys(args, ['rotationId'])
            || typeof args.rotationId !== 'string'
          ) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const result = store.vetoPicoIdentityRootRotation({
            rotationId: args.rotationId,
            sender: principal,
            sodium,
          });
          if (!result.ok) {
            return { outcome: result.reason, result: {} };
          }
          appendServerEvent('home.identity_root_rotation_vetoed', {});
          app.log.warn(
            {
              rotationId: args.rotationId,
              picoIdentityFingerprintHex:
                principal.picoIdentityFingerprintHex,
            },
            'A pending Pico identity root rotation was vetoed by another '
            + 'living device of the same identity.',
          );
          return { outcome: 'ok', result: { status: 'vetoed' } };
        }
        case 'home.host.rotation.prepare': {
          // Host keys are the Home's own infrastructure; only its governance
          // root may rotate them (ADR 0080), and the acceptance signature the
          // record needs is that root's anyway - this early check just keeps
          // a member from staging keys nobody could ever accept.
          const foundingRecord = store.picoHomeFoundingRecord();
          if (foundingRecord === undefined || homeHostKeys === undefined) {
            return { outcome: 'no_founding_record', result: {} };
          }
          if (principal.picoIdentityFingerprintHex
            !== foundingRecord.founding.homeHostPicoIdentityFingerprintHex) {
            return { outcome: 'sender_is_not_home_host_pico', result: {} };
          }
          if (
            !hasExactKeys(args, ['reasonCategory'])
            || typeof args.reasonCategory !== 'string'
            || !(picoHomeContinuityReasonCategories as readonly string[])
              .includes(args.reasonCategory)
          ) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const staged = homeHostKeyStore.stageRotation(sodium);
          const chain = store.picoHomeHostKeyChain();
          const tailOrder = chain[chain.length - 1]?.lifecycleOrder
            ?? foundingRecord.founding.lifecycleOrder;
          const continuity: PicoHomeContinuitySignatureInput = {
            suite: picoIdentitySuite,
            continuityId: `hostrot_${bytesToHexString(sodium.randombytes_buf(16))}`,
            homeId: foundingRecord.founding.homeId,
            outgoingHostSigningKeyFingerprintHex:
              homeHostKeys.publicBundle.signingKeyFingerprintHex,
            outgoingHostKeyAgreementKeyFingerprintHex:
              homeHostKeys.publicBundle.keyAgreementKeyFingerprintHex,
            incomingHostSigningKeyFingerprintHex:
              staged.publicBundle.signingKeyFingerprintHex,
            incomingHostKeyAgreementKeyFingerprintHex:
              staged.publicBundle.keyAgreementKeyFingerprintHex,
            homeHostPicoIdentityFingerprintHex:
              foundingRecord.founding.homeHostPicoIdentityFingerprintHex,
            reasonCategory:
              args.reasonCategory as PicoHomeContinuityReasonCategory,
            changedAt: new Date().toISOString(),
            lifecycleOrder: nextLifecycleOrder(tailOrder),
          };
          const signatureInput =
            buildPicoHomeContinuitySignatureInput(continuity);
          // Both host signatures are custody's own act; what comes back must
          // carry the one signature custody cannot make - the acceptance.
          return {
            outcome: 'ok',
            result: {
              continuity,
              outgoingHostSigningKeyRecord: {
                suite: picoIdentitySuite,
                keyRole: 'home_host_signing',
                publicKeyHex: homeHostKeys.publicBundle.signingPublicKeyHex,
              },
              incomingHostSigningKeyRecord: {
                suite: picoIdentitySuite,
                keyRole: 'home_host_signing',
                publicKeyHex: staged.publicBundle.signingPublicKeyHex,
              },
              outgoingHostSignatureHex:
                homeHostKeyStore.signWithHostSigningKey(sodium, signatureInput),
              incomingHostSignatureHex:
                homeHostKeyStore.signWithStagedSigningKey(sodium, signatureInput),
            } as unknown as Record<string, unknown>,
          };
        }
        case 'home.host.continuity.submit': {
          const foundingRecord = store.picoHomeFoundingRecord();
          if (foundingRecord === undefined) {
            return { outcome: 'no_founding_record', result: {} };
          }
          if (principal.picoIdentityFingerprintHex
            !== foundingRecord.founding.homeHostPicoIdentityFingerprintHex) {
            return { outcome: 'sender_is_not_home_host_pico', result: {} };
          }
          if (!hasExactKeys(args, ['record']) || !isRecord(args.record)) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const record = args.record as unknown as PicoHomeContinuityRecord;
          const continuity = record?.continuity;
          if (!isRecord(continuity)) {
            return { outcome: 'invalid_arguments', result: {} };
          }

          // Only a link custody can serve is recorded: the incoming keys must
          // be exactly the staged pair - otherwise a validly signed record
          // for keys this host never held would strand the Home the moment
          // it was accepted. A replay of the already-promoted head skips the
          // check, because custody already serves it.
          const alreadyHead = store.currentPicoHomeHostKeyHead();
          const isReplayOfHead = alreadyHead !== undefined
            && alreadyHead.hostSigningKeyFingerprintHex
              === continuity.incomingHostSigningKeyFingerprintHex
            && alreadyHead.hostKeyAgreementKeyFingerprintHex
              === continuity.incomingHostKeyAgreementKeyFingerprintHex;
          if (!isReplayOfHead) {
            const staged = homeHostKeyStore.loadStagedRotation(sodium);
            if (staged === undefined
              || continuity.incomingHostSigningKeyFingerprintHex
                !== staged.publicBundle.signingKeyFingerprintHex
              || continuity.incomingHostKeyAgreementKeyFingerprintHex
                !== staged.publicBundle.keyAgreementKeyFingerprintHex) {
              return { outcome: 'incoming_keys_not_staged', result: {} };
            }
          }

          const recorded = store.recordPicoHomeHostContinuity({
            record,
            sodium,
          });
          if (!recorded.ok) {
            return { outcome: recorded.reason, result: {} };
          }
          if (recorded.inserted) {
            // The link is durable; custody follows it only after the reply is
            // sealed and signed, because that reply must verify under the
            // retiring key - it is the old era's last message. A crash before
            // the deferred swap is completed at the next boot against the
            // proven head.
            afterReply = () => {
              homeHostKeyStore.promoteStagedRotation();
              homeHostKeys = homeHostKeyStore.load(sodium);
            };
            appendServerEvent('home.host_key_rotated', {});
            app.log.warn(
              {
                continuityId: recorded.link.continuityId,
                chainPosition: recorded.link.chainPosition,
                incomingHostSigningKeyFingerprintHex:
                  recorded.link.incomingHostSigningKeyFingerprintHex,
              },
              'Pico Home host keys rotated. Every printed Recovery Card pins '
              + 'the retired keys and is stale; re-issue is required (ADR '
              + '0110/0115).',
            );
          }
          return {
            outcome: 'ok',
            result: {
              link: recorded.link,
              // The new public bundle rides the result so the accepting
              // client can re-pin without a second trust source: it is the
              // same channel the acceptance traveled. Read from the staged
              // (or already-promoted) pair - custody itself swaps only after
              // this reply is sealed under the retiring key.
              newHostPublicKeys: (() => {
                const incoming = homeHostKeyStore.loadStagedRotation(sodium)
                  ?? homeHostKeyStore.load(sodium);
                return incoming === undefined ? null : {
                  signingPublicKeyHex: incoming.publicBundle.signingPublicKeyHex,
                  signingKeyFingerprintHex:
                    incoming.publicBundle.signingKeyFingerprintHex,
                  keyAgreementPublicKeyHex:
                    incoming.publicBundle.keyAgreementPublicKeyHex,
                  keyAgreementKeyFingerprintHex:
                    incoming.publicBundle.keyAgreementKeyFingerprintHex,
                };
              })(),
              recoveryCardsStale: true,
            } as unknown as Record<string, unknown>,
          };
        }
        default: {
          return { outcome: 'unknown_operation', result: {} };
        }
      }
    });

    if (!handled.ok) {
      // A pre-authentication refusal carries no signature, because there is no
      // verified reply key to seal one to. It says only that the envelope was
      // not accepted, never why in terms of the Home's state.
      return sendNoStore(reply.code(400), { error: handled.reason });
    }

    afterReply?.();
    return sendNoStore(reply.code(200), handled.envelope);
  });

  /**
   * ADR 0115 U4, decided by the user on 2026-08-01: the unsealed continuity
   * chain read, published beside the sealed intake by the restricted
   * listener. A stranded client seals to a deleted agreement key and pins a
   * refused audience, so the one read that can un-strand it cannot ride the
   * sealed channel. Serving it plain is sound because nothing in the
   * response asks to be trusted: the records carry their own signatures and
   * the client verifies them from the pin it already holds; the head bundle
   * is accepted only if it hashes to the fingerprints that verification
   * proved. Deliberately parameterless - the full chain, no query surface.
   */
  app.get(PICO_LINK_CONTINUITY_READ_PATH, async (request, reply) => {
    // A query string is a different target. The restricted listener refuses
    // it by exact match before routing; local delivery refuses it here the
    // same way, so the two surfaces cannot drift.
    if (request.raw.url !== PICO_LINK_CONTINUITY_READ_PATH) {
      return sendNoStore(reply.code(404), { error: 'Not found.' });
    }
    if (store.picoHomeFoundingRecord() === undefined || homeHostKeys === undefined) {
      return sendNoStore(reply.code(409), {
        error: 'Pico Home continuity is not available before founding.',
      });
    }
    const response: PicoHomeContinuityChainResponse = {
      schema: picoHomeContinuityChainSchema,
      records: store.picoHomeHostContinuityRecords(),
      head: {
        suite: homeHostKeys.publicBundle.suite,
        signingPublicKeyHex: homeHostKeys.publicBundle.signingPublicKeyHex,
        signingKeyFingerprintHex: homeHostKeys.publicBundle.signingKeyFingerprintHex,
        keyAgreementPublicKeyHex: homeHostKeys.publicBundle.keyAgreementPublicKeyHex,
        keyAgreementKeyFingerprintHex:
          homeHostKeys.publicBundle.keyAgreementKeyFingerprintHex,
      },
    };
    return sendNoStore(reply.code(200), response);
  });

  /** Shared with `GET /api/home/setup` so the link cannot drift from it. */
  function readHomeSetupState(): PicoHomeSetupResponse | undefined {
    currentPendingHomeClaim();
    if (homeHostKeys === undefined || homeSetupNonceHex === undefined || !moveInCode.isPending()) {
      return undefined;
    }

    return {
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
  }

  app.get('/api/home/setup', async (_request, reply) => {
    currentPendingHomeClaim();

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

  function executeHomeClaim(
    body: Record<string, unknown>,
    linkPrincipal?: PicoLinkDirectPrincipal,
  ): FoundationOperationResult {
    const livePendingClaim = currentPendingHomeClaim();

    if (homeHostKeys === undefined || homeSetupNonceHex === undefined || (!moveInCode.isPending() && livePendingClaim === undefined)) {
      return { statusCode: 409, body: { error: 'Pico Home setup mode is not active.' } };
    }

    const claimRequest = readPicoHomeClaimRequest(body, {
      homeHostKeyStore,
      homeHostKeys,
      homeSetupNonceHex,
      at: new Date().toISOString(),
    });
    if (!claimRequest.ok) {
      return { statusCode: claimRequest.statusCode, body: { error: claimRequest.error } };
    }

    if (linkPrincipal !== undefined) {
      const boundClaim = claimRequest.kind === 'sealed'
        ? claimRequest.claim
        : livePendingClaim?.claim;
      if (boundClaim === undefined
        || linkPrincipal.picoIdentityFingerprintHex
          !== boundClaim.claimantIdentityKeyFingerprintHex
        || linkPrincipal.deviceSigningKeyFingerprintHex
          !== boundClaim.firstDeviceSigningKeyFingerprintHex
        || linkPrincipal.deviceKeyAgreementKeyFingerprintHex
          !== boundClaim.firstDeviceKeyAgreementKeyFingerprintHex
        || linkPrincipal.delegationId !== boundClaim.firstDeviceDelegationId) {
        return {
          statusCode: 401,
          body: { error: 'Pico Link sender is not the first device bound to this Home claim.' },
        };
      }
    }

    if (claimRequest.kind === 'foundingAcceptance') {
      const pending = livePendingClaim;
      if (pending === undefined) {
        return {
          statusCode: 409,
          body: { error: 'No Pico Home claim is pending founding acceptance.' },
        };
      }

      // Every rejected acceptance counts, so guessing a founding signature is
      // as bounded as guessing the Move-In Code.
      const rejectAcceptance = (statusCode: number, error: string): FoundationOperationResult => {
        pending.attempts += 1;

        if (pending.attempts >= MAX_PENDING_HOME_CLAIM_ATTEMPTS) {
          discardPendingHomeClaim('attempts_exhausted');
          return {
            statusCode: 429,
            body: {
              error: 'Pico Home founding acceptance is exhausted; setup mode reopened with a fresh Move-In Code.',
            },
          };
        }

        return { statusCode, body: { error } };
      };

      if (
        claimRequest.acceptance.claimId !== pending.claim.claimId
        || claimRequest.acceptance.foundingId !== pending.founding.foundingId
      ) {
        return rejectAcceptance(400, 'Pico Home founding acceptance is not bound to the pending claim.');
      }

      try {
        if (!verifyPicoIdentityDetachedSignature(sodium, {
          publicKeyHex: pending.claimantIdentityKeyRecord.publicKeyHex,
          signatureInput: buildPicoHomeFoundingSignatureInput(pending.founding),
          signatureHex: claimRequest.acceptance.claimantFoundingSignatureHex,
        })) {
          return rejectAcceptance(401, 'Pico Home founding signature is invalid.');
        }
      } catch {
        return rejectAcceptance(400, 'Pico Home founding acceptance is invalid.');
      }

      const hostFoundingSignatureHex = homeHostKeyStore.signWithHostSigningKey(
        sodium,
        buildPicoHomeFoundingSignatureInput(pending.founding),
      );
      const foundingRecord: PicoHomeFoundingRecordV2 = {
        schema: picoHomeFoundingRecordV2Schema,
        founding: pending.founding,
        claimantIdentityKeyRecord: pending.claimantIdentityKeyRecord,
        firstDeviceSigningKeyRecord: pending.firstDeviceSigningKeyRecord,
        firstDeviceKeyAgreementKeyRecord: pending.firstDeviceKeyAgreementKeyRecord,
        firstDeviceDelegation: pending.firstDeviceDelegation,
        firstDeviceRevocations: pending.firstDeviceRevocations,
        claimantFoundingSignatureHex: claimRequest.acceptance.claimantFoundingSignatureHex,
        hostClaimResponse: pending.claimResponse,
        hostFoundingSignatureHex,
        createdAt: pending.createdAt,
      };

      let claimState: PicoHomeClaimState;
      const operatorBeforeClaim = operators.get();
      const claimedOperatorBinding: OperatorHomeBinding = {
        homeId: pending.founding.homeId,
        foundingId: pending.founding.foundingId,
        hostSigningKeyFingerprintHex: pending.founding.hostSigningKeyFingerprintHex,
      };
      if (operatorBeforeClaim?.homeBinding !== undefined
        && !sameOperatorHomeBinding(operatorBeforeClaim.homeBinding, claimedOperatorBinding)) {
        return {
          statusCode: 409,
          body: {
            error: 'Foundation operator is bound to a different Pico Home founding; local operator reset is required.',
          },
        };
      }

      try {
        claimState = store.claimPicoHome({
          homeId: pending.founding.homeId,
          hostAdminPicoId: pending.homeHostPicoId,
          hostSigningKeyFingerprintHex: pending.founding.hostSigningKeyFingerprintHex,
          hostKeyAgreementKeyFingerprintHex: pending.founding.hostKeyAgreementKeyFingerprintHex,
          foundingRecord,
          sodium,
          claimedAt: pending.founding.foundedAt,
        });
        if (operatorBeforeClaim !== undefined) {
          operators.bindToHome(claimedOperatorBinding);
        }
      } catch (error) {
        return { statusCode: 409, body: { error: (error as Error).message } };
      }

      // A pre-claim session carried unclaimed-phase authority. Even though the
      // binding check would reject it, revoke it explicitly so no derived
      // realtime ticket/socket survives the authority transition.
      const revokedSessions = sessions.revokeAll();
      if (revokedSessions > 0) {
        purgeAllSessionRealtimeTickets(realtimeTickets);
        terminateAllSessionSockets();
        appendServerEvent('auth.sessions_revoked', { revokedSessions });
      }
      appendServerEvent('home.claimed', {});
      pendingHomeClaim = undefined;
      homeSetupNonceHex = undefined;
      app.log.warn(
        {
          homeId: claimState.homeId,
          homeHostPicoId: claimState.hostAdminPicoId,
          foundingId: foundingRecord.founding.foundingId,
          hostSigningKeyFingerprintHex: claimState.hostSigningKeyFingerprintHex,
          hostKeyAgreementKeyFingerprintHex: claimState.hostKeyAgreementKeyFingerprintHex,
        },
        'Pico Home claimed with a signed founding record; setup mode ended.',
      );

      const response: PicoHomeClaimResponse = {
        claimState: toPicoHomeClaimStateResponse(claimState, moveInCode.isPending()) as PicoHomeClaimResponse['claimState'],
        claimResponse: pending.claimResponse,
        foundingRecord,
      };

      return {
        statusCode: 201,
        body: response as unknown as Record<string, unknown>,
      };
    }

    if (livePendingClaim !== undefined) {
      return {
        statusCode: 409,
        body: { error: 'A Pico Home claim is pending founding acceptance.' },
      };
    }

    if (!moveInCode.isPending()) {
      return { statusCode: 409, body: { error: 'Pico Home setup mode is not active.' } };
    }

    const code = moveInCode.consume(claimRequest.moveInCode);
    if (!code.ok) {
      return {
        statusCode: code.exhausted ? 429 : 401,
        body: {
          error: code.exhausted
            ? 'Move-In Code is exhausted; restart the Pico Home process to mint a fresh code.'
            : 'Move-In Code is invalid.',
        },
      };
    }

    const pending = createPendingPicoHomeClaim({
      request: claimRequest,
      homeHostKeys,
      homeHostKeyStore,
    });
    pendingHomeClaim = pending;
    app.log.warn(
      {
        claimId: pending.claim.claimId,
        foundingId: pending.founding.foundingId,
        homeId: pending.founding.homeId,
        homeHostPicoId: pending.homeHostPicoId,
      },
      'Pico Home claim verified; waiting for claimant founding acceptance.',
    );

    const response: PicoHomePendingClaimResponse = {
      pendingClaim: {
        claimResponse: pending.claimResponse,
        founding: pending.founding,
      },
    };

    return {
      statusCode: 202,
      body: response as unknown as Record<string, unknown>,
    };
  }

  app.post('/api/home/claim', async (request, reply) => {
    const result = executeHomeClaim((request.body ?? {}) as Record<string, unknown>);
    return sendNoStore(reply.code(result.statusCode), result.body);
  });

  app.get('/api/home/memberships', async (_request, reply) => {
    return sendNoStore(reply, { memberships: store.picoHomeMemberships() });
  });

  app.post('/api/home/memberships', async (request, reply) => {
    const result = recordHomeMembership(request.body);
    return sendNoStore(reply.code(result.statusCode), result.body);
  });

  app.post('/api/home/membership-lifecycle', async (request, reply) => {
    const record = (request.body ?? {}) as PicoHomeMembershipLifecycleRecord;
    const recorded = store.recordPicoHomeMembershipLifecycle({ sodium, record });

    if (!recorded.ok) {
      return sendNoStore(reply.code(membershipFailureStatus(recorded.reason)), { error: recorded.reason });
    }

    appendServerEvent('home.membership_changed', {
      credentialId: recorded.membership.sourceRef,
      lifecycleId: record.lifecycle?.lifecycleId ?? '',
      subjectPicoIdentityFingerprintHex: recorded.membership.picoIdentityFingerprintHex,
      status: recorded.membership.status,
    });
    if (recorded.membership.status !== 'active') {
      reconcileShareEnvelopes();
    }

    return sendNoStore(reply, { membership: recorded.membership });
  });

  app.get('/api/home/domain-read-grants', async (_request, reply) => {
    return sendNoStore(reply, { grants: store.picoHomeDomainReadGrants() });
  });

  app.post('/api/home/domain-read-grants', async (request, reply) => {
    let statement: Omit<PicoHomeDomainReadGrantRecord, 'createdAt'>;
    try {
      statement = parsePicoHomeDomainReadGrantStatement(request.body);
    } catch (error) {
      return sendNoStore(reply.code(400), { error: (error as Error).message });
    }

    const record: PicoHomeDomainReadGrantRecord = {
      ...statement,
      createdAt: new Date().toISOString(),
    };
    const recorded = store.recordPicoHomeDomainReadGrant({ sodium, record });
    if (!recorded.ok) {
      return sendNoStore(reply.code(domainReadGrantFailureStatus(recorded.reason)), { error: recorded.reason });
    }

    if (recorded.inserted) {
      appendServerEvent('home.domain_read_granted', {
        grantId: recorded.grant.grantId,
        privacyDomain: recorded.grant.privacyDomain,
        readerPicoIdentityFingerprintHex: recorded.grant.readerPicoIdentityFingerprintHex,
      });
    }

    return sendNoStore(reply.code(recorded.inserted ? 201 : 200), { grant: recorded.grant });
  });

  app.post('/api/home/domain-read-grant-lifecycle', async (request, reply) => {
    let statement: Omit<PicoHomeDomainReadGrantLifecycleRecord, 'createdAt'>;
    try {
      statement = parsePicoHomeDomainReadGrantLifecycleStatement(request.body);
    } catch (error) {
      return sendNoStore(reply.code(400), { error: (error as Error).message });
    }

    const record: PicoHomeDomainReadGrantLifecycleRecord = {
      ...statement,
      createdAt: new Date().toISOString(),
    };
    const recorded = store.recordPicoHomeDomainReadGrantLifecycle({ sodium, record });
    if (!recorded.ok) {
      return sendNoStore(reply.code(domainReadGrantFailureStatus(recorded.reason)), { error: recorded.reason });
    }

    if (recorded.inserted) {
      appendServerEvent('home.domain_read_revoked', {
        grantId: recorded.grant.grantId,
        lifecycleId: record.lifecycle.lifecycleId,
        privacyDomain: recorded.grant.privacyDomain,
        readerPicoIdentityFingerprintHex: recorded.grant.readerPicoIdentityFingerprintHex,
      });
      reconcileShareEnvelopes();
    }

    return sendNoStore(reply.code(recorded.inserted ? 201 : 200), { grant: recorded.grant });
  });

  /**
   * ADR 0089's transport seam, filled locally. The owner delivers an ADR 0085
   * checkpoint the Foundation cannot fetch for itself, because the Vault has
   * no network surface (ADR 0097).
   *
   * This route stores bytes and judges nothing: signature, exact binding,
   * five-minute age ceiling and anti-rollback floors all run later, in the
   * unchanged verifier, on every authority check. Accepting a checkpoint here
   * therefore grants no freshness by itself - it only makes one available to
   * be judged.
   */
  app.post('/api/home/reader-key-freshness-checkpoints', async (request, reply) => {
    const result = publishReaderKeyFreshnessCheckpoint(request.body);
    return sendNoStore(reply.code(result.statusCode), result.body);
  });

  app.post('/api/home/share-envelope-issuance', async (request, reply) => {
    const result = await shareEnvelopeIssuer.prepare(
      (request.body ?? {}) as PicoShareEnvelopePrepareInput,
    );
    if (!result.ok) {
      return sendNoStore(reply.code(shareEnvelopeFailureStatus(result.reason)), {
        error: result.reason,
      });
    }
    return sendNoStore(reply.code(201), { issuance: result.pending });
  });

  app.post('/api/home/share-envelopes', async (request, reply) => {
    const body = (request.body ?? {}) as {
      issuanceId?: unknown;
      issuerSignatureHex?: unknown;
    };
    const result = await shareEnvelopeIssuer.finalize(
      typeof body.issuanceId === 'string' ? body.issuanceId : '',
      typeof body.issuerSignatureHex === 'string' ? body.issuerSignatureHex : '',
    );
    if (!result.ok) {
      return sendNoStore(reply.code(shareEnvelopeFailureStatus(result.reason)), {
        error: result.reason,
      });
    }
    if (result.inserted) {
      appendServerEvent('home.share_envelope_issued', {
        grantId: result.envelope.record.envelope.grantId,
        privacyDomain: result.envelope.record.envelope.domainId,
        readerKeyFingerprintHex: result.envelope.record.envelope.readerKeyFingerprintHex,
        kekVersion: result.envelope.record.envelope.kekVersion,
      });
    }
    return sendNoStore(reply.code(result.inserted ? 201 : 200), {
      envelope: publicPicoShareEnvelope(result.envelope),
    });
  });

  app.get('/api/home/share-envelopes', async (_request, reply) => {
    reconcileShareEnvelopes();
    return sendNoStore(reply, {
      envelopes: store.picoShareEnvelopes().map(publicPicoShareEnvelope),
    });
  });

  app.post('/api/home/reader-custody/domains', async (request, reply) => {
    const result = recordReaderCustodyDomain(request.body ?? {});
    return sendNoStore(reply.code(result.statusCode), result.body);
  });

  app.get('/api/home/reader-custody/domains', async (_request, reply) => {
    return sendNoStore(reply, { domains: readerCustody.domains() });
  });

  app.post('/api/home/reader-custody/reader-grants', async (request, reply) => {
    const result = await recordReaderCustodyReaderGrant(request.body ?? {});
    return sendNoStore(reply.code(result.statusCode), result.body);
  });

  app.get('/api/home/reader-custody/reader-grants', async (_request, reply) => {
    return sendNoStore(reply, { readerGrants: readerCustody.readerGrants() });
  });

  app.post(
    '/api/home/reader-custody/reader-grant-lifecycle',
    async (request, reply) => {
      const result = readerCustody.recordReaderGrantLifecycle(
        (request.body ?? {}) as PicoReaderCustodyReaderGrantLifecycleRecord,
      );
      if (!result.ok) {
        return sendNoStore(
          reply.code(readerCustodyFailureStatus(result.reason)),
          { error: result.reason },
        );
      }
      return sendNoStore(reply.code(result.inserted ? 201 : 200), {
        readerGrant: result.value,
      });
    },
  );

  app.post('/api/home/reader-custody/writer-grants', async (request, reply) => {
    const result = readerCustody.recordWriterGrant(
      (request.body ?? {}) as PicoReaderCustodyWriterGrantRecord,
    );
    if (!result.ok) {
      return sendNoStore(reply.code(readerCustodyFailureStatus(result.reason)), {
        error: result.reason,
      });
    }
    return sendNoStore(reply.code(result.inserted ? 201 : 200), {
      writerGrant: result.value,
    });
  });

  app.get('/api/home/reader-custody/writer-grants', async (_request, reply) => {
    return sendNoStore(reply, { writerGrants: readerCustody.writerGrants() });
  });

  app.post(
    '/api/home/reader-custody/writer-grant-lifecycle',
    async (request, reply) => {
      const result = readerCustody.recordWriterGrantLifecycle(
        (request.body ?? {}) as PicoReaderCustodyWriterGrantLifecycleRecord,
      );
      if (!result.ok) {
        return sendNoStore(
          reply.code(readerCustodyFailureStatus(result.reason)),
          { error: result.reason },
        );
      }
      return sendNoStore(reply.code(result.inserted ? 201 : 200), {
        writerGrant: result.value,
      });
    },
  );

  app.post('/api/home/reader-custody/kek-rotations', async (request, reply) => {
    const result = recordReaderCustodyKekRotation(request.body ?? {});
    return sendNoStore(reply.code(result.statusCode), result.body);
  });

  app.get('/api/home/reader-custody/kek-rotations', async (request, reply) => {
    const query = request.query as { domainAuthorityId?: unknown };
    const domainAuthorityId = typeof query.domainAuthorityId === 'string'
      ? query.domainAuthorityId
      : undefined;
    return sendNoStore(reply, {
      rotations: readerCustody.kekRotations(domainAuthorityId),
    });
  });

  app.post('/api/home/reader-custody/items', async (request, reply) => {
    const result = readerCustody.recordItem(
      (request.body ?? {}) as PicoReaderCustodyItemRecord,
    );
    if (!result.ok) {
      return sendNoStore(reply.code(readerCustodyFailureStatus(result.reason)), {
        error: result.reason,
      });
    }
    return sendNoStore(reply.code(result.inserted ? 201 : 200), {
      item: result.value,
    });
  });

  app.get('/api/home/reader-custody/items', async (request, reply) => {
    const query = request.query as { domainAuthorityId?: unknown };
    const domainAuthorityId = typeof query.domainAuthorityId === 'string'
      ? query.domainAuthorityId
      : undefined;
    return sendNoStore(reply, {
      items: readerCustody.items(domainAuthorityId),
    });
  });

  app.post('/api/auth/identity-challenges', async (_request, reply) => {
    const foundingRecord = store.picoHomeFoundingRecord();
    if (foundingRecord === undefined || homeHostKeys === undefined) {
      return reply.code(404).send({ error: 'Pico identity sessions are not available.' });
    }

    const challenge = identitySessionChallenges.issue(
      foundingRecord.founding.hostSigningKeyFingerprintHex,
    );
    return sendNoStore(reply.code(201), {
      challengeId: challenge.challengeId,
      verifierNonceHex: challenge.verifierNonceHex,
      verifierContext: challenge.verifierContext,
      expiresAt: new Date(challenge.expiresAtMs).toISOString(),
    });
  });

  app.post('/api/auth/identity-session', async (request, reply) => {
    let parsed: { challengeId: string; proof: IdentitySessionProof };
    try {
      parsed = parseIdentitySessionRequest(request.body);
    } catch (error) {
      return sendNoStore(reply.code(400), { error: (error as Error).message });
    }

    // Consume before any crypto or membership check: every attempt is one-use.
    const challenge = identitySessionChallenges.consume(parsed.challengeId);
    if (challenge === undefined) {
      return unauthorized(reply, 'Pico identity session proof is invalid.');
    }

    const verified = verifyIdentitySessionProof(sodium, {
      proof: parsed.proof,
      challenge,
      at: new Date().toISOString(),
    });
    if (!verified.ok
      || !store.hasActivePicoHomeMembership(verified.principal.picoIdentityFingerprintHex)) {
      return unauthorized(reply, 'Pico identity session proof is invalid.');
    }

    const recorded = store.recordPicoIdentityLifecycleEvidence({
      sodium,
      identityKeyRecord: parsed.proof.identityKeyRecord,
      delegation: verified.delegation,
      revocations: verified.revocations,
    });
    if (recorded.ok && verified.revocations.length > 0) {
      reconcileShareEnvelopes();
    }
    const registered = recorded.ok
      ? store.registerPicoIdentityReaderKey({
        sodium,
        picoIdentityFingerprintHex: verified.principal.picoIdentityFingerprintHex,
        deviceSigningKeyFingerprintHex: verified.principal.deviceSigningKeyFingerprintHex,
        delegationId: verified.principal.delegationId,
        deviceKeyAgreementKeyRecord: parsed.proof.deviceKeyAgreementKeyRecord,
      })
      : recorded;
    if (!recorded.ok
      || !registered.ok
      || !store.hasActivePicoIdentityDelegation({
        picoIdentityFingerprintHex: verified.principal.picoIdentityFingerprintHex,
        deviceSigningKeyFingerprintHex: verified.principal.deviceSigningKeyFingerprintHex,
        deviceKeyAgreementKeyFingerprintHex: verified.principal.deviceKeyAgreementKeyFingerprintHex,
        delegationId: verified.principal.delegationId,
        sodium,
      })) {
      return unauthorized(reply, 'Pico identity session proof is invalid.');
    }

    const session = sessions.issue(verified.principal);
    return sendNoStore(reply.code(201), {
      session: session.value,
      expiresAt: new Date(session.expiresAtMs).toISOString(),
      principal: {
        kind: 'pico_identity',
        picoIdentityFingerprintHex: verified.principal.picoIdentityFingerprintHex,
        deviceSigningKeyFingerprintHex: verified.principal.deviceSigningKeyFingerprintHex,
        deviceKeyAgreementKeyFingerprintHex: verified.principal.deviceKeyAgreementKeyFingerprintHex,
        delegationId: verified.principal.delegationId,
      },
    });
  });

  app.post('/api/auth/bootstrap', async (request, reply) => {
    const body = (request.body ?? {}) as { bootstrapCode?: unknown; passphrase?: unknown };
    const homeBinding = currentOperatorHomeBinding();

    if (store.picoHomeFoundingRecord() !== undefined && homeBinding === undefined) {
      return sendNoStore(reply.code(409), {
        error: 'Pico Home founding or host-key custody is unavailable; operator bootstrap cannot bind safely.',
      });
    }

    // Consume the code first: a wrong code must not reach the KDF at all.
    if (!bootstrapCode.consume(body.bootstrapCode)) {
      return reply.code(401).send({ error: 'Bootstrap code is invalid.' });
    }

    try {
      await operators.create(body.passphrase as string, homeBinding);
    } catch (error) {
      // The code is spent either way; a failed attempt must not leave a usable
      // one behind. Re-mint so a legitimate operator can retry from the log —
      // including when the failure was an overload, which used to return early
      // and burn the code against this very rule.
      const code = bootstrapCode.mint();
      app.log.warn({ operatorBootstrapCode: code }, 'Operator bootstrap failed; a new bootstrap code was minted.');

      if (error instanceof OperatorOverloadedError) {
        return reply.code(503).send({ error: 'Too many credential operations in flight.' });
      }

      return reply.code(400).send({ error: (error as Error).message });
    }

    appendServerEvent('auth.operator_bootstrapped', {});
    app.log.warn('Foundation operator bootstrapped.');

    const session = sessions.issue(currentOperatorPrincipal());

    return reply
      .code(201)
      .header('Cache-Control', 'no-store')
      .send({ session: session.value, expiresAt: new Date(session.expiresAtMs).toISOString() });
  });

  app.post('/api/auth/session', async (request, reply) => {
    const body = (request.body ?? {}) as { passphrase?: unknown };

    // Before the KDF, so a throttled attempt costs no memory-hard work either.
    const throttle = loginThrottle.check();
    if (!throttle.allowed) {
      request.log.warn({ retryAfterSeconds: throttle.retryAfterSeconds }, 'Foundation operator login is throttled.');

      return reply
        .code(429)
        .header('Retry-After', String(throttle.retryAfterSeconds))
        .header('Cache-Control', 'no-store')
        .send({ error: 'Too many failed login attempts. Try again shortly.' });
    }

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
      loginThrottle.recordFailure();

      // Uniform failure: a wrong passphrase and an absent operator must not be
      // distinguishable. Failed logins stay in operational logging and never
      // reach the append-only log (ADR 0075 A9).
      request.log.warn('Foundation operator login failed.');

      return unauthorized(reply, 'Foundation operator credentials are invalid.');
    }

    const principal = currentOperatorPrincipal();
    if (!operatorPrincipalIsCurrent(principal)) {
      loginThrottle.recordFailure();
      request.log.error(
        {
          operatorHomeBinding: principal.homeBinding ?? null,
          currentHomeBinding: currentOperatorHomeBinding() ?? null,
        },
        'Foundation operator login refused because its Home binding is stale.',
      );
      return unauthorized(reply, 'Foundation operator credentials are invalid.');
    }

    loginThrottle.recordSuccess();
    const session = sessions.issue(principal);

    return reply
      .code(201)
      .header('Cache-Control', 'no-store')
      .send({ session: session.value, expiresAt: new Date(session.expiresAtMs).toISOString() });
  });

  app.get('/api/auth/session', async (request, reply) => {
    // The onRequest hook already validated and extended the session.
    const touched = sessions.touch(readBearerCredential(request.headers.authorization));

    if (touched === undefined) {
      return unauthorized(reply, 'Authenticated Foundation session is required.');
    }

    return sendNoStore(reply, {
      expiresAt: new Date(touched.expiresAtMs).toISOString(),
      principal: touched.principal,
    });
  });

  app.delete('/api/auth/session', async (request, reply) => {
    const credential = readBearerCredential(request.headers.authorization);
    const sessionDigest = sessions.digestOf(credential);

    sessions.revoke(credential);

    if (sessionDigest !== undefined) {
      purgeSessionRealtimeTickets(realtimeTickets, sessionDigest);
      terminateSessionSockets(sessionDigest);
    }

    return reply.code(204).send();
  });

  app.delete('/api/auth/sessions', async (_request, reply) => {
    const revokedSessions = sessions.revokeAll();
    purgeAllSessionRealtimeTickets(realtimeTickets);
    terminateAllSessionSockets();

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
    terminateAllSessionSockets();

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
    reconcileShareEnvelopes();

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
      // ADR 0121 J4. This is the surface that reads audit records today, so it
      // is the one that has to say what its integrity covers. Reading the rows
      // without the coverage beside them is how a green mark that means
      // "nobody checked" gets invented downstream.
      auditCoverage: auditCoverage(),
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

    // ADR 0116 W1: origin is assigned by the server from the write authority
    // and is never client-assertable - a client that tries is refused loudly
    // rather than silently corrected.
    if (isRecord(body) && body.origin !== undefined) {
      return sendNoStore(reply.code(400), { error: 'origin is assigned by the server and cannot be written.' });
    }

    // W1's durable label: a row written under the static token - or on the
    // pre-claim trusted-local path with no credential at all - is
    // `unattributed`.
    //
    // W2 assigns the two W1 left open, and both take the lower of the readings
    // available:
    //
    // - an authenticated Pico identity is `home_member`, not `person_present`.
    //   The higher class would require proving the writer is the subject person
    //   of what they are writing, and the write path carries `owner` only as a
    //   free string. `home_member` is what is actually proven, and a later
    //   milestone that can prove more may raise it deliberately.
    // - a Foundation operator is `unattributed`, the vocabulary's own "every-
    //   thing else". There is no host-administration class, and inventing one
    //   is an ADR change rather than an implementation detail; ADR 0087 keeps
    //   host infrastructure separate from Home governance, so administration is
    //   emphatically not a voice that may instruct.
    const authority = resolveAuthority(request.headers.authorization);
    const origin: PicoEventOriginClass =
      authority.kind === 'pico-identity' ? 'home_member' : 'unattributed';

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
        // ADR 0116 W2: the item carries the same server-assigned class as the
        // reference event it produces. The store is what retrieval reads, so
        // labeling only the event would leave the retrieved copy unlabeled.
        origin,
      });

      const recordedPayload: MemoryRecordedPayload = {
        memoryItemId,
        privacyDomain: request_.privacyDomain,
        contentType: request_.contentType,
        ...(request_.summary === undefined ? {} : { summary: request_.summary }),
      };

      const recordedEvent = {
        ...factory.create({
          deviceId: request_.deviceId,
          sessionId: request_.sessionId,
          type: 'memory.recorded',
          stream: request_.stream,
          payload: recordedPayload,
          remoteLamport: request_.lamport,
          payloadPosture: 'reference_only',
        }),
        origin,
      };

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

    const event = {
      ...factory.create({
        deviceId: validation.body.deviceId,
        sessionId: validation.body.sessionId,
        type: validation.body.type,
        stream: validation.body.stream,
        payload: validation.body.payload,
        remoteLamport: validation.body.lamport,
        payloadPosture: validation.body.payloadPosture,
      }),
      origin,
    };

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

      if (!realtimeCredentialRequired) {
        return;
      }

      const authorization = authorizeRealtimeConnection(
        request.url,
        request.headers.authorization,
        config.foundationToken,
        realtimeTickets,
        sessions,
      );

      if (!authorization.authorized) {
        return reply
          .code(401)
          .header('WWW-Authenticate', 'Bearer realm="Pico Foundation"')
          .send({ error: 'Foundation realtime credential is required.' });
      }

      // A single-use ticket is spent here, so the session it stood for has to be
      // carried across to the handler; the handshake is the only place that
      // still knows it.
      if (authorization.sessionDigest !== undefined) {
        handshakeSessionDigests.set(request, authorization.sessionDigest);
      }
    },
  }, (connection, request) => {
    const socket = connection as RealtimeSocket;
    socket.isAlive = true;
    socket.sessionDigest = handshakeSessionDigests.get(request);
    handshakeSessionDigests.delete(request);
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
  if ('foundingAcceptance' in body) {
    if (!hasExactKeys(body, ['foundingAcceptance'])) {
      return {
        ok: false,
        statusCode: 400,
        error: 'foundingAcceptance cannot be combined with claim fields.',
      };
    }

    try {
      return { ok: true, kind: 'foundingAcceptance', acceptance: parsePicoHomeFoundingAcceptance(body.foundingAcceptance) };
    } catch (error) {
      return { ok: false, statusCode: 400, error: (error as Error).message };
    }
  }

  if (!('claimEnvelope' in body)) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Pico Home claim requires a sealed claimEnvelope.',
    };
  }

  if (!hasExactKeys(body, ['claimEnvelope'])) {
    return {
      ok: false,
      statusCode: 400,
      error: 'claimEnvelope cannot be combined with other claim fields.',
    };
  }

  return readSealedPicoHomeClaimRequest(body.claimEnvelope, context);
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

    if (payload.firstDeviceSigningKeyRecord.suite !== picoIdentitySuite
      || payload.firstDeviceSigningKeyRecord.keyRole !== 'device_signing'
      || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
        keyRecord: payload.firstDeviceSigningKeyRecord,
        expectedFingerprintHex: claim.firstDeviceSigningKeyFingerprintHex,
      })) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Pico Home first-device signing fingerprint does not match the key record.',
      };
    }

    if (payload.firstDeviceKeyAgreementKeyRecord.suite !== picoIdentitySuite
      || payload.firstDeviceKeyAgreementKeyRecord.keyRole !== 'device_key_agreement'
      || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
        keyRecord: payload.firstDeviceKeyAgreementKeyRecord,
        expectedFingerprintHex: claim.firstDeviceKeyAgreementKeyFingerprintHex,
      })) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Pico Home first-device agreement fingerprint does not match the key record.',
      };
    }

    const delegation = payload.firstDeviceDelegation.record;
    if (delegation.delegationId !== claim.firstDeviceDelegationId
      || delegation.issuerIdentityKeyFingerprintHex
        !== claim.claimantIdentityKeyFingerprintHex
      || delegation.subjectSigningKeyFingerprintHex
        !== claim.firstDeviceSigningKeyFingerprintHex
      || delegation.subjectKeyAgreementKeyFingerprintHex
        !== claim.firstDeviceKeyAgreementKeyFingerprintHex) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Pico Home first-device delegation does not match the signed claim.',
      };
    }

    let lifecycle;
    try {
      lifecycle = createVerifiedPicoIdentityLifecycleIndex(sodium, {
        issuerIdentityKeyRecord: payload.claimantIdentityKeyRecord,
        signedDelegations: [payload.firstDeviceDelegation],
        signedRevocations: payload.firstDeviceRevocations,
      });
    } catch {
      return {
        ok: false,
        statusCode: 400,
        error: 'Pico Home first-device lifecycle evidence is invalid.',
      };
    }
    if (lifecycle.lookupDelegation(claim.firstDeviceDelegationId, {
      at: context.at,
      requiredScopes: ['surface_session'],
    }).status !== 'active') {
      return {
        ok: false,
        statusCode: 400,
        error: 'Pico Home first-device delegation is not active for surface_session at founding.',
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

    if (!verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: payload.firstDeviceSigningKeyRecord.publicKeyHex,
      signatureInput: buildPicoHomeClaimSignatureInput(claim),
      signatureHex: payload.firstDeviceSignatureHex,
    })) {
      return {
        ok: false,
        statusCode: 401,
        error: 'Pico Home first-device co-signature is invalid.',
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
    kind: 'sealed',
    moveInCode: claim.moveInCode,
    homeHostPicoId: `pico:identity:${claim.claimantIdentityKeyFingerprintHex}`,
    claim,
    claimantIdentityKeyRecord: payload.claimantIdentityKeyRecord,
    claimantSignatureHex: payload.claimantSignatureHex,
    firstDeviceSigningKeyRecord: payload.firstDeviceSigningKeyRecord,
    firstDeviceKeyAgreementKeyRecord: payload.firstDeviceKeyAgreementKeyRecord,
    firstDeviceDelegation: payload.firstDeviceDelegation,
    firstDeviceRevocations: payload.firstDeviceRevocations,
    firstDeviceSignatureHex: payload.firstDeviceSignatureHex,
    verifiedAt: context.at,
  };
}

/**
 * A credential the host cannot verify is not a server fault: 409 says "this
 * Home cannot accept that", 401 says the signature does not hold, 400 says the
 * record is malformed. Reasons are returned verbatim because they are a closed
 * vocabulary and name no key material.
 */
function membershipFailureStatus(reason: string): number {
  if (reason === 'invalid_issuer_signature' || reason === 'invalid_host_activation_signature') {
    return 401;
  }

  if (reason === 'no_founding_record' || reason === 'conflicting_record' || reason === 'unknown_credential') {
    return 409;
  }

  return 400;
}

function domainReadGrantFailureStatus(reason: string): number {
  if (reason === 'invalid_issuer_signature') {
    return 401;
  }

  if (reason === 'no_founding_record'
    || reason === 'conflicting_record'
    || reason === 'unknown_grant'
    || reason === 'reader_is_not_active_member'
    || reason === 'domain_is_not_host_custody') {
    return 409;
  }

  return 400;
}

function shareEnvelopeFailureStatus(reason: string): number {
  if (reason === 'invalid_issuer_signature') {
    return 401;
  }
  if (reason === 'unknown_or_expired_issuance') {
    return 404;
  }
  if (reason === 'invalid_request') {
    return 400;
  }
  if (reason === 'freshness_unavailable' || reason === 'envelope_issuance_unavailable') {
    return 503;
  }
  return 409;
}

function readerCustodyFailureStatus(
  reason: ReaderCustodyFailureReason,
): number {
  if (reason === 'invalid_record' || reason === 'wrong_home') {
    return 400;
  }
  if (reason === 'freshness_unavailable') {
    return 503;
  }
  return 409;
}

function publicPicoShareEnvelope(stored: PicoShareEnvelopeStoredRecord): {
  issuanceId: string;
  record: PicoShareEnvelopeRecord;
} {
  return {
    issuanceId: stored.issuanceId,
    record: stored.record,
  };
}

/**
 * The intake shape: the Home Host Pico's issuer statement, without the
 * activation half this Home has not added yet and without a `createdAt` the
 * host stamps itself.
 */
function parsePicoHomeMembershipIssuerStatement(source: unknown): PicoHomeMembershipIssuerStatement {
  if (!isRecord(source) || !hasExactKeys(source, ['schema', 'membership', 'issuerIdentityKeyRecord', 'issuerSignatureHex'])) {
    throw new Error('Pico Home membership credential is invalid.');
  }

  if (source.schema !== picoHomeMembershipCredentialSchema
    || !isRecord(source.membership)
    || !isRecord(source.issuerIdentityKeyRecord)
    || !/^[0-9a-f]{128}$/.test(stringField(source, 'issuerSignatureHex'))) {
    throw new Error('Pico Home membership credential is invalid.');
  }

  return {
    schema: picoHomeMembershipCredentialSchema,
    membership: source.membership as unknown as PicoHomeMembershipIssuerStatement['membership'],
    issuerIdentityKeyRecord: parsePicoIdentityKeyRecord(source.issuerIdentityKeyRecord),
    issuerSignatureHex: stringField(source, 'issuerSignatureHex'),
  };
}

function parsePicoHomeDomainReadGrantStatement(
  source: unknown,
): Omit<PicoHomeDomainReadGrantRecord, 'createdAt'> {
  if (!isRecord(source)
    || !hasExactKeys(source, ['schema', 'grant', 'issuerIdentityKeyRecord', 'issuerSignatureHex'])
    || source.schema !== picoHomeDomainReadGrantRecordSchema
    || !isRecord(source.grant)
    || !isRecord(source.issuerIdentityKeyRecord)
    || !/^[0-9a-f]{128}$/.test(stringField(source, 'issuerSignatureHex'))) {
    throw new Error('Pico Home domain read grant is invalid.');
  }

  return {
    schema: picoHomeDomainReadGrantRecordSchema,
    grant: source.grant as unknown as PicoHomeDomainReadGrantRecord['grant'],
    issuerIdentityKeyRecord: parsePicoIdentityKeyRecord(source.issuerIdentityKeyRecord),
    issuerSignatureHex: stringField(source, 'issuerSignatureHex'),
  };
}

function parsePicoHomeDomainReadGrantLifecycleStatement(
  source: unknown,
): Omit<PicoHomeDomainReadGrantLifecycleRecord, 'createdAt'> {
  if (!isRecord(source)
    || !hasExactKeys(source, ['schema', 'lifecycle', 'issuerIdentityKeyRecord', 'issuerSignatureHex'])
    || source.schema !== picoHomeDomainReadGrantLifecycleRecordSchema
    || !isRecord(source.lifecycle)
    || !isRecord(source.issuerIdentityKeyRecord)
    || !/^[0-9a-f]{128}$/.test(stringField(source, 'issuerSignatureHex'))) {
    throw new Error('Pico Home domain read-grant lifecycle statement is invalid.');
  }

  return {
    schema: picoHomeDomainReadGrantLifecycleRecordSchema,
    lifecycle: source.lifecycle as unknown as PicoHomeDomainReadGrantLifecycleRecord['lifecycle'],
    issuerIdentityKeyRecord: parsePicoIdentityKeyRecord(source.issuerIdentityKeyRecord),
    issuerSignatureHex: stringField(source, 'issuerSignatureHex'),
  };
}

function parseIdentitySessionRequest(
  source: unknown,
): { challengeId: string; proof: IdentitySessionProof } {
  if (!isRecord(source)
    || !hasExactKeys(source, [
      'challengeId',
      'identityKeyRecord',
      'deviceSigningKeyRecord',
      'deviceKeyAgreementKeyRecord',
      'delegation',
      'revocations',
      'possessionSignatureHex',
    ])
    || !isNonEmptyString(source.challengeId, 256)
    || !isRecord(source.identityKeyRecord)
    || !isRecord(source.deviceSigningKeyRecord)
    || !isRecord(source.deviceKeyAgreementKeyRecord)
    || !isRecord(source.delegation)
    || !Array.isArray(source.revocations)
    || source.revocations.length > 128
    || !/^[0-9a-f]{128}$/.test(stringField(source, 'possessionSignatureHex'))) {
    throw new Error('Pico identity session request is invalid.');
  }

  return {
    challengeId: source.challengeId,
    proof: {
      identityKeyRecord: parsePicoIdentityKeyRecord(source.identityKeyRecord),
      deviceSigningKeyRecord: parsePicoIdentityKeyRecord(source.deviceSigningKeyRecord),
      deviceKeyAgreementKeyRecord: parsePicoIdentityKeyRecord(source.deviceKeyAgreementKeyRecord),
      delegation: parseSignedPicoIdentityDelegation(source.delegation),
      revocations: source.revocations.map(parseSignedPicoIdentityRevocation),
      possessionSignatureHex: stringField(source, 'possessionSignatureHex'),
    },
  };
}

function parseSignedPicoIdentityDelegation(source: unknown): PicoIdentitySignedDelegation {
  if (!isRecord(source)
    || !hasExactKeys(source, ['record', 'signatureHex'])
    || !isRecord(source.record)
    || !/^[0-9a-f]{128}$/.test(stringField(source, 'signatureHex'))) {
    throw new Error('Pico identity delegation is invalid.');
  }

  return {
    record: source.record as unknown as PicoIdentityDelegationSignatureInput,
    signatureHex: stringField(source, 'signatureHex'),
  };
}

function parseSignedPicoIdentityRevocation(source: unknown): PicoIdentitySignedRevocation {
  if (!isRecord(source)
    || !hasExactKeys(source, ['record', 'signatureHex'])
    || !isRecord(source.record)
    || !/^[0-9a-f]{128}$/.test(stringField(source, 'signatureHex'))) {
    throw new Error('Pico identity revocation is invalid.');
  }

  return {
    record: source.record as unknown as PicoIdentityRevocationSignatureInput,
    signatureHex: stringField(source, 'signatureHex'),
  };
}

function createHomeId(): string {
  return `home_${randomBytes(16).toString('hex')}`;
}

function createFoundingId(): string {
  return `founding_${randomBytes(16).toString('hex')}`;
}

function createPendingPicoHomeClaim(params: {
  request: ParsedSealedPicoHomeClaimRequest;
  homeHostKeys: HomeHostKeyPairSet;
  homeHostKeyStore: HomeHostKeyStore;
}): PendingPicoHomeClaim {
  const homeId = createHomeId();
  const hostNonceHex = randomBytes(32).toString('hex');
  const foundingId = createFoundingId();
  const createdAt = params.request.verifiedAt;
  const claimResponse: PicoHomeClaimResponseSignatureInput = {
    suite: picoIdentitySuite,
    claimId: params.request.claim.claimId,
    homeId,
    hostSigningKeyFingerprintHex: params.homeHostKeys.publicBundle.signingKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex: params.homeHostKeys.publicBundle.keyAgreementKeyFingerprintHex,
    claimantIdentityKeyFingerprintHex: params.request.claim.claimantIdentityKeyFingerprintHex,
    claimantNonceHex: params.request.claim.claimantNonceHex,
    hostNonceHex,
    foundingRecordId: foundingId,
  };
  const claimResponseRecord: PicoHomeClaimResponseRecord = {
    schema: picoHomeClaimResponseRecordSchema,
    claimResponse,
    hostSignatureHex: params.homeHostKeyStore.signWithHostSigningKey(
      sodium,
      buildPicoHomeClaimResponseSignatureInput(claimResponse),
    ),
  };
  const founding: PicoHomeFoundingSignatureInput = {
    suite: picoIdentitySuite,
    foundingId,
    homeId,
    hostSigningKeyFingerprintHex: params.homeHostKeys.publicBundle.signingKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex: params.homeHostKeys.publicBundle.keyAgreementKeyFingerprintHex,
    homeHostPicoIdentityFingerprintHex: params.request.claim.claimantIdentityKeyFingerprintHex,
    firstDeviceSigningKeyFingerprintHex:
      params.request.claim.firstDeviceSigningKeyFingerprintHex,
    firstDeviceKeyAgreementKeyFingerprintHex:
      params.request.claim.firstDeviceKeyAgreementKeyFingerprintHex,
    firstDeviceDelegationId: params.request.claim.firstDeviceDelegationId,
    claimantNonceHex: params.request.claim.claimantNonceHex,
    hostNonceHex,
    foundedAt: createdAt,
    lifecycleOrder: 'seq:0000000000000001',
  };

  // Fail here if a future edit drifts from the M1 canonical field contract.
  buildPicoHomeFoundingSignatureInput(founding);

  return {
    homeHostPicoId: params.request.homeHostPicoId,
    claim: params.request.claim,
    claimantIdentityKeyRecord: params.request.claimantIdentityKeyRecord,
    claimantSignatureHex: params.request.claimantSignatureHex,
    firstDeviceSigningKeyRecord: params.request.firstDeviceSigningKeyRecord,
    firstDeviceKeyAgreementKeyRecord: params.request.firstDeviceKeyAgreementKeyRecord,
    firstDeviceDelegation: params.request.firstDeviceDelegation,
    firstDeviceRevocations: params.request.firstDeviceRevocations,
    firstDeviceSignatureHex: params.request.firstDeviceSignatureHex,
    claimResponse: claimResponseRecord,
    founding,
    createdAt,
    expiresAtMs: Date.now() + PENDING_HOME_CLAIM_TTL_MS,
    startedAtMonotonicMs: performance.now(),
    attempts: 0,
  };
}

/** ADR 0115 U3. The next chain order after the given one ('seq:%016d'). */
function nextLifecycleOrder(previous: string): string {
  const match = /^seq:(\d{16})$/.exec(previous);
  const next = match === null ? 1 : Number.parseInt(match[1], 10) + 1;
  return `seq:${String(next).padStart(16, '0')}`;
}

function bytesToHexString(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function verifyPicoHomeFoundingEvidence(
  record: PicoHomeFoundingRecord,
  // ADR 0115: the founding was signed by the founding-era host key. Before a
  // rotation that is custody's key; afterwards the retired public key comes
  // from the first continuity link, or the founding could never re-verify.
  hostSigningPublicKeyHex: string,
): { ok: true } | { ok: false; reason: string } {
  const claimantKey = record.claimantIdentityKeyRecord;

  try {
    if (record.schema !== picoHomeFoundingRecordSchema
      && record.schema !== picoHomeFoundingRecordV2Schema) {
      return { ok: false, reason: 'invalid_founding_record_schema' };
    }
    if (claimantKey.suite !== picoIdentitySuite || claimantKey.keyRole !== 'pico_identity') {
      return { ok: false, reason: 'invalid_claimant_key_role' };
    }

    if (!verifyPicoIdentityKeyRecordFingerprint(sodium, {
      keyRecord: claimantKey,
      expectedFingerprintHex: record.founding.homeHostPicoIdentityFingerprintHex,
    })) {
      return { ok: false, reason: 'claimant_key_fingerprint_mismatch' };
    }

    if (record.schema === picoHomeFoundingRecordV2Schema) {
      const founding = record.founding;
      if (record.firstDeviceSigningKeyRecord.suite !== picoIdentitySuite
        || record.firstDeviceSigningKeyRecord.keyRole !== 'device_signing'
        || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
          keyRecord: record.firstDeviceSigningKeyRecord,
          expectedFingerprintHex: founding.firstDeviceSigningKeyFingerprintHex,
        })) {
        return { ok: false, reason: 'first_device_signing_key_mismatch' };
      }
      if (record.firstDeviceKeyAgreementKeyRecord.suite !== picoIdentitySuite
        || record.firstDeviceKeyAgreementKeyRecord.keyRole !== 'device_key_agreement'
        || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
          keyRecord: record.firstDeviceKeyAgreementKeyRecord,
          expectedFingerprintHex: founding.firstDeviceKeyAgreementKeyFingerprintHex,
        })) {
        return { ok: false, reason: 'first_device_agreement_key_mismatch' };
      }
      const delegation = record.firstDeviceDelegation.record;
      if (delegation.delegationId !== founding.firstDeviceDelegationId
        || delegation.issuerIdentityKeyFingerprintHex
          !== founding.homeHostPicoIdentityFingerprintHex
        || delegation.subjectSigningKeyFingerprintHex
          !== founding.firstDeviceSigningKeyFingerprintHex
        || delegation.subjectKeyAgreementKeyFingerprintHex
          !== founding.firstDeviceKeyAgreementKeyFingerprintHex) {
        return { ok: false, reason: 'first_device_delegation_mismatch' };
      }
      const lifecycle = createVerifiedPicoIdentityLifecycleIndex(sodium, {
        issuerIdentityKeyRecord: claimantKey,
        signedDelegations: [record.firstDeviceDelegation],
        signedRevocations: record.firstDeviceRevocations,
      });
      if (lifecycle.lookupDelegation(founding.firstDeviceDelegationId, {
        at: founding.foundedAt,
        requiredScopes: ['surface_session'],
      }).status !== 'active') {
        return { ok: false, reason: 'inactive_first_device_delegation' };
      }
    }

    if (!verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: claimantKey.publicKeyHex,
      signatureInput: buildPicoHomeFoundingSignatureInput(record.founding),
      signatureHex: record.claimantFoundingSignatureHex,
    })) {
      return { ok: false, reason: 'invalid_claimant_founding_signature' };
    }

    if (!verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: hostSigningPublicKeyHex,
      signatureInput: buildPicoHomeClaimResponseSignatureInput(record.hostClaimResponse.claimResponse),
      signatureHex: record.hostClaimResponse.hostSignatureHex,
    })) {
      return { ok: false, reason: 'invalid_host_claim_response_signature' };
    }

    if (!verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: hostSigningPublicKeyHex,
      signatureInput: buildPicoHomeFoundingSignatureInput(record.founding),
      signatureHex: record.hostFoundingSignatureHex,
    })) {
      return { ok: false, reason: 'invalid_host_founding_signature' };
    }
  } catch {
    return { ok: false, reason: 'malformed_founding_evidence' };
  }

  return { ok: true };
}

function parsePicoHomeFoundingAcceptance(source: unknown): PicoHomeFoundingAcceptance {
  if (!isRecord(source) || !hasExactKeys(source, ['schema', 'claimId', 'foundingId', 'claimantFoundingSignatureHex'])) {
    throw new Error('Pico Home founding acceptance is invalid.');
  }

  const acceptance = {
    schema: stringField(source, 'schema', 'Pico Home founding acceptance is invalid.'),
    claimId: stringField(source, 'claimId', 'Pico Home founding acceptance is invalid.'),
    foundingId: stringField(source, 'foundingId', 'Pico Home founding acceptance is invalid.'),
    claimantFoundingSignatureHex: stringField(source, 'claimantFoundingSignatureHex', 'Pico Home founding acceptance is invalid.'),
  };

  if (
    acceptance.schema !== picoHomeFoundingAcceptanceSchema
    || !/^[A-Za-z0-9._:/+-]{1,256}$/.test(acceptance.claimId)
    || !/^[A-Za-z0-9._:/+-]{1,256}$/.test(acceptance.foundingId)
    || !/^[0-9a-f]{128}$/.test(acceptance.claimantFoundingSignatureHex)
  ) {
    throw new Error('Pico Home founding acceptance is invalid.');
  }

  return {
    schema: picoHomeFoundingAcceptanceSchema,
    claimId: acceptance.claimId,
    foundingId: acceptance.foundingId,
    claimantFoundingSignatureHex: acceptance.claimantFoundingSignatureHex,
  };
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

  if (isRecord(source) && source.schema === picoHomeSealedClaimPayloadSchema) {
    throw new Error('Pico Home v1 claim payload is no longer accepted.');
  }

  if (!isRecord(source) || !hasExactKeys(source, [
    'schema',
    'claim',
    'claimantIdentityKeyRecord',
    'firstDeviceSigningKeyRecord',
    'firstDeviceKeyAgreementKeyRecord',
    'firstDeviceDelegation',
    'firstDeviceRevocations',
    'claimantSignatureHex',
    'firstDeviceSignatureHex',
  ])) {
    throw new Error('Pico Home claim payload is invalid.');
  }

  const payload = {
    schema: stringField(source, 'schema'),
    claim: parsePicoHomeClaim(source.claim),
    claimantIdentityKeyRecord: parsePicoIdentityKeyRecord(source.claimantIdentityKeyRecord),
    firstDeviceSigningKeyRecord: parsePicoIdentityKeyRecord(source.firstDeviceSigningKeyRecord),
    firstDeviceKeyAgreementKeyRecord:
      parsePicoIdentityKeyRecord(source.firstDeviceKeyAgreementKeyRecord),
    firstDeviceDelegation: parseSignedPicoIdentityDelegation(source.firstDeviceDelegation),
    firstDeviceRevocations: Array.isArray(source.firstDeviceRevocations)
      && source.firstDeviceRevocations.length <= 128
      ? source.firstDeviceRevocations.map(parseSignedPicoIdentityRevocation)
      : undefined,
    claimantSignatureHex: stringField(source, 'claimantSignatureHex'),
    firstDeviceSignatureHex: stringField(source, 'firstDeviceSignatureHex'),
  };

  if (payload.schema !== picoHomeSealedClaimPayloadV2Schema
    || payload.firstDeviceRevocations === undefined
    || !/^[0-9a-f]{128}$/.test(payload.claimantSignatureHex)
    || !/^[0-9a-f]{128}$/.test(payload.firstDeviceSignatureHex)) {
    throw new Error('Pico Home claim payload is invalid.');
  }

  return {
    schema: picoHomeSealedClaimPayloadV2Schema,
    claim: payload.claim,
    claimantIdentityKeyRecord: payload.claimantIdentityKeyRecord,
    firstDeviceSigningKeyRecord: payload.firstDeviceSigningKeyRecord,
    firstDeviceKeyAgreementKeyRecord: payload.firstDeviceKeyAgreementKeyRecord,
    firstDeviceDelegation: payload.firstDeviceDelegation,
    firstDeviceRevocations: payload.firstDeviceRevocations,
    claimantSignatureHex: payload.claimantSignatureHex,
    firstDeviceSignatureHex: payload.firstDeviceSignatureHex,
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
    'firstDeviceDelegationId',
    'firstDeviceSigningKeyFingerprintHex',
    'firstDeviceKeyAgreementKeyFingerprintHex',
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
    firstDeviceDelegationId: stringField(source, 'firstDeviceDelegationId'),
    firstDeviceSigningKeyFingerprintHex:
      stringField(source, 'firstDeviceSigningKeyFingerprintHex'),
    firstDeviceKeyAgreementKeyFingerprintHex:
      stringField(source, 'firstDeviceKeyAgreementKeyFingerprintHex'),
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
    // ADR 0116 W2: content and its class leave together, or the receiver has
    // no way to tell whether what it just read may instruct.
    ...(item.origin === undefined ? {} : { origin: item.origin }),
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
    startedAtMonotonicMs: performance.now(),
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

function authorizeRealtimeConnection(
  requestUrl: string,
  authorizationHeader: string | string[] | undefined,
  expectedToken: string | undefined,
  tickets: Map<string, RealtimeTicketRecord>,
  sessions: SessionStore,
): RealtimeAuthorization {
  if (expectedToken !== undefined && isBearerTokenAuthorized(authorizationHeader, expectedToken)) {
    return { authorized: true };
  }

  const credential = readBearerCredential(authorizationHeader);
  const touched = sessions.touch(credential);
  if (touched?.principal.kind === 'operator') {
    const sessionDigest = sessions.digestOf(credential);
    return { authorized: true, ...(sessionDigest === undefined ? {} : { sessionDigest }) };
  }

  const ticket = readRealtimeTicketQueryValue(requestUrl);
  if (ticket === null) {
    return { authorized: false };
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

function consumeRealtimeTicket(tickets: Map<string, RealtimeTicketRecord>, ticket: string): RealtimeAuthorization {
  purgeExpiredRealtimeTickets(tickets);

  const digest = secureDigest(ticket);
  const record = tickets.get(digest);
  if (record === undefined) {
    return { authorized: false };
  }

  tickets.delete(digest);
  if (hasRealtimeTicketElapsed(record, Date.now())) {
    return { authorized: false };
  }

  return {
    authorized: true,
    ...(record.sessionDigest === undefined ? {} : { sessionDigest: record.sessionDigest }),
  };
}

function purgeExpiredRealtimeTickets(tickets: Map<string, RealtimeTicketRecord>): void {
  const now = Date.now();

  for (const [digest, record] of tickets) {
    if (hasRealtimeTicketElapsed(record, now)) {
      tickets.delete(digest);
    }
  }
}

/** ADR 0120 N1 exposure evaluation for one ticket. */
function hasRealtimeTicketElapsed(
  record: RealtimeTicketRecord,
  nowMs: number,
): boolean {
  return hasPicoExposureWindowElapsed({
    endsAtMs: record.expiresAtMs,
    nowMs,
    monotonic: {
      startedAtMs: record.startedAtMonotonicMs,
      nowMs: performance.now(),
      durationMs: REALTIME_TICKET_TTL_MS,
    },
  });
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

  // ADR 0116 W1: `system` and `tool` are reserved exactly like the action
  // vocabulary. A role is earned at the write path, not asserted in the
  // payload; these two return once a write path exists whose authority
  // actually is the system or a completed tool run.
  if (type === 'message.created') {
    const role = (payloadResult.payload as MessageCreatedPayload).role;
    if (!(clientWritableMessageCreatedRoles as readonly string[]).includes(role)) {
      return { ok: false, error: 'This message.created role is reserved for a later system or tool write path.' };
    }
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
