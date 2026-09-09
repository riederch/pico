import { isPicoInstant } from '@pico/protocol/instant';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  PicoModelProviderMeasurements,
  picoModelProviderEntryIdFor,
} from './model-provider-measurement.js';
import {
  PicoPendingActions,
  maxPicoActionApprovalWindowMs,
} from './pending-action.js';
import { crossPicoStateBoundary } from './state-crossing.js';
import {
  picoPresenceAffordances,
  type PicoPresenceAffordance,
} from '@pico/protocol/presence';
import { statfsSync } from 'node:fs';
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
  describePicoVersionChange,
  toPicoHomeStorageConditionView,
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
import {
  defaultPicoFoundationMaxConnections,
  defaultPicoFoundationMaxInFlight,
  PicoConcurrencyCap,
  picoLinkIntakeRequestMark,
} from './concurrency-cap.js';
import { EventFactory } from './event-factory.js';
// ADR 0127. A runtime imports a module; a module never imports a runtime. The
// edge points one way, or the two packages form a cycle.
import { picoCalendarDueEntriesView } from '@pico/module-calendar/calendar';
import { picoCalendarStandingCommitments } from '@pico/module-calendar/commitments';
import { maxPicoObservationSubmission } from '@pico/protocol/observation';
import {
  parsePicoLocationFix,
  parsePicoMobilitySample,
} from '@pico/protocol/spatial-recall';
import { parsePicoPlace } from '@pico/protocol/place';
import { picoDeclaredEffectNames, type PicoActionRequest } from '@pico/protocol/action';
import type { PicoLinkDirectOperation } from '@pico/protocol';
import { bindPicoModuleEffects } from '@pico/protocol/module';
import {
  decidePicoAction,
  executePicoAction,
  resolvePicoActionApproval,
  type PicoActionFactType,
  type PicoEffectCapabilities,
} from './action-path.js';
import { picoCalendarModuleManifest } from '@pico/module-calendar/manifest';
import { picoDepotModuleManifest } from '@pico/module-depot/manifest';
import {
  picoDepotFetchIntent,
  picoDepotState,
  type PicoDepotView,
} from '@pico/module-depot/depot';
import {
  defaultPicoDepotFetchIntervalMs,
  parsePicoDepotTask,
} from '@pico/protocol/depot';
import {
  parsePicoDepotManifest,
  picoDepotSupplierNeedsFromPerson,
  type PicoDepotManifest,
} from '@pico/protocol/depot-manifest';
import { startPicoPeriodicTaskScheduler } from './periodic-task-scheduler.js';
import { createPicoLinkRelayTransport } from './link-relay-transport.js';
import { PicoSupplierHost } from './supplier-host.js';
import { PicoModelDispatchError, PicoModelRuntime } from './model-runtime.js';
import { defaultPicoModelJobSweepIntervalMs } from '@pico/protocol/model-job';
import {
  picoModelJobRefusalIsFinal,
  type PicoModelJobQueueRow,
} from './model-job-queue.js';
import { buildPicoLibraryDerivation } from '@pico/protocol/library-pin';
import {
  enqueuePicoDepotLibraryReads,
  picoDepotLibraryReadPlan,
  pickPicoDepotIntakeEntry,
} from './depot-library-intake.js';
import {
  PicoModelProviderNarrowingError,
  picoModelProviderEffectiveEntry,
} from './model-provider-registry.js';
import type {
  PicoModelProviderAllowance,
  PicoModelProviderClass,
} from '@pico/protocol/model-provider';
import { picoModelProviderClasses } from '@pico/protocol/model-provider';
import {
  PicoModelProviderMeasurer,
  picoModelProviderEntryFromMeasurement,
} from './model-provider-measure.js';
import { picoModelProviderState } from '@pico/protocol/model-provider-state';
import {
  maxPicoRecallCandidates,
  picoRecallItemOf,
  picoRecallJob,
  picoRecallPlan,
} from './recall.js';
import { pickPicoDecidedModelEntry } from './model-provider-registry.js';
import { picoModelJobRefusal, type PicoModelJob } from '@pico/protocol/model-job';
import {
  ModelProviderCredentialCrypto,
  type PicoModelProviderCredentialSeal,
} from './model-provider-credential-crypto.js';
import type { PicoModelProviderEntry } from '@pico/protocol/model-provider';
import { picoLinkPushCandidates } from './link-push-occasion.js';
import { sendPicoLinkPush } from './link-push-send.js';
import {
  PicoLinkRelayUnauthenticatedError,
  assertPicoLinkRelayPacketSender,
  collectPicoLinkRelayPackets,
} from './link-relay-collector.js';
import {
  parsePicoLinkMailboxExchangeRequest,
  picoLinkMailboxExchangeRequestSchema,
  picoLinkMailboxExchangeResponseSchema,
} from '@pico/protocol/link-mailbox-exchange';
import {
  defaultPicoLinkMailboxCapacity,
  defaultPicoLinkRelayOperator,
  defaultPicoLinkRelaySweepIntervalMs,
  formatPicoLinkPacketAddress,
} from '@pico/protocol/link-packet';
import { picoHomeAssistantModuleManifest } from '@pico/module-home-assistant/manifest';
import { picoSpatialRecallModuleManifest } from '@pico/module-spatial-recall/manifest';
import {
  picoModuleIdentifiers,
  resolvePicoModuleActivation,
  resolvePicoModuleCapture,
  toPicoModuleActivationView,
  toPicoModuleDeactivationStatement,
  type PicoModuleCommitment,
  type PicoModuleIdentifier,
} from '@pico/protocol/module';
import { PicoRequestQuota } from './request-quota.js';
import { startPicoTimeBoundScheduler } from './time-bound-scheduler.js';
import {
  EventStore,
  type EventCursor,
  type PicoDepotAttachment,
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
  OperatorRequestError,
  type OperatorHomeBinding,
  type OperatorStore,
} from './operator-store.js';
import { SessionStore, type SessionPrincipal } from './session-store.js';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fetchPicoDepot } from './depot-fetch.js';
import { PicoDepotWorkspace } from './depot-workspace.js';
import { PicoSupplierScratch } from './supplier-scratch.js';
import { consumeOperatorResetMarker, OperatorBootstrapCode } from './operator-bootstrap.js';
import { LoginThrottle } from './login-throttle.js';
import { verifyPicoHomeMembershipAuthority } from './home-membership.js';
import {
  IdentitySessionChallengeStore,
  verifyIdentitySessionProof,
  type IdentitySessionProof,
} from './identity-session.js';
import { picoLinkPushLedgerHorizonMs } from './link-push-floor.js';
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

const SERVICE_VERSION = '0.2.1';
// The wire-contract version, owned by @pico/protocol and deliberately not tied
// to SERVICE_VERSION: a packaging or documentation release must not advertise a
// protocol change that did not happen (ADR 0025).
const PROTOCOL_VERSION = picoProtocolVersion;
const DEFAULT_EVENT_LIMIT = 100;
const MAX_EVENT_LIMIT = 500;
const MAX_TEXT_LENGTH = 8_000;
const MAX_PAYLOAD_BYTES = 32 * 1024;
const REQUEST_BODY_LIMIT_BYTES = MAX_PAYLOAD_BYTES + (8 * 1024);

/**
 * Wie lange diese Flaeche auf eine Anfrage wartet, die schon begonnen hat
 * (Befund B78).
 *
 * Dieselbe Frage ist in diesem Baum zweimal entschieden: der Link-Eingang und
 * das Relay setzen beide genau diese drei Werte, mit derselben Begruendung -
 * „abuse guardrails, not authentication". Die groesste Flaeche des Produkts,
 * einundsechzig Routen, hatte sie nicht.
 *
 * Der Grund ist die Vorgabe des Rahmens: Node begrenzt das Empfangen einer
 * Anfrage von sich aus auf fuenf Minuten, und Fastify setzt `requestTimeout`
 * auf 0. Wer den Rahmen nimmt, verliert den Schutz, den die Laufzeit mitbringt
 * - und merkt es nicht, weil nichts fehlt, sondern etwas abgeschaltet wurde.
 *
 * `requestTimeout` begrenzt das *Empfangen*, nicht die Laufzeit eines
 * Behandlers: eine Route, die lange rechnet, wird davon nicht abgeschnitten.
 * `connectionTimeout` waere das andere und steht deshalb bewusst nicht hier -
 * es misst Stille auf dem Socket, und Stille ist genau das, was ein Behandler
 * erzeugt, waehrend er arbeitet.
 */
const PICO_FOUNDATION_REQUEST_TIMEOUT_MS = 10_000;
const PICO_FOUNDATION_HEADERS_TIMEOUT_MS = 5_000;
const PICO_FOUNDATION_KEEP_ALIVE_TIMEOUT_MS = 5_000;
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
  /** ADR 0118 O1. Present turns this into a time-bound entry. */
  dueAt?: string;
  /**
   * ADR 0129 SR3. Where this was, if it was anywhere.
   *
   * Optional, and all three of its parts or none - which is the manual path
   * issue #3 asks for: a person confirming where they left the car is
   * recording a place, and that must not need a sensor.
   */
  place?: { latitudeDeg: number; longitudeDeg: number; accuracyM: number };
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

  /**
   * ADR 0104 S3. Whether memory content is encrypted, decided in Pico.
   *
   * **Read in its own pass, and the reason is an ordering nobody chose.** The
   * key store has to exist before the event store opens, and the decision
   * lives inside the event store - so the decision is read from a connection
   * that opens, migrates and closes before any of that. Two opens at boot is
   * the cost of a setting that actually decides something; a decision read
   * afterwards would be a setting that takes effect never.
   *
   * An instance with no decision inherits the host option and records that it
   * inherited. That is ADR 0104's migration path: nothing changes for an
   * existing install on the day it upgrades, and the next answer comes from
   * Pico rather than from the add-on.
   */
  const memoryEncryptionDecision = await (async (): Promise<boolean> => {
    const bootstrapStore = await EventStore.open(config.databasePath, {});
    try {
      const decided = bootstrapStore.picoMemoryEncryptionDecision();
      if (decided !== undefined && !decided.inheritedFromHost) {
        return decided.enabled;
      }
      // **Absent is not off.** The host option is retiring (ADR 0104 S3), so
      // an instance upgrading late arrives with the variable already stripped
      // - and reading that as `false` would tell a Home with encrypted
      // memories that it has none of the machinery to read them. With nothing
      // passed, its own content answers.
      const inherited = config.memoryEncryption ?? bootstrapStore.holdsEncryptedMemoryContent();
      bootstrapStore.decidePicoMemoryEncryption({
        enabled: inherited,
        at: new Date().toISOString(),
        inheritedFromHost: true,
      });
      return inherited;
    } finally {
      bootstrapStore.close();
    }
  })();

  let keyStore: KeyStore | undefined;
  let memoryCrypto: MemoryContentCrypto | undefined;
  if (memoryEncryptionDecision) {
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
    requestTimeout: PICO_FOUNDATION_REQUEST_TIMEOUT_MS,
    keepAliveTimeout: PICO_FOUNDATION_KEEP_ALIVE_TIMEOUT_MS,
  });
  // Node kennt diesen dritten Wert, Fastify reicht ihn nicht durch.
  app.server.headersTimeout = PICO_FOUNDATION_HEADERS_TIMEOUT_MS;
  await app.register(websocket);

  /**
   * Baseline security headers on every Foundation HTTP response. The CSP can
   * be strict because the dashboard is framework-free with no inline script
   * and its styles live in `/styles.css` rather than an inline block, so no
   * 'unsafe-inline' carve-out exists to grow stale. `frame-ancestors 'self'`
   * instead of 'none' because a trusted proxy may embed the dashboard as a
   * same-origin iframe of its own frontend - Home Assistant ingress does -
   * while direct access never frames it. It is unconditional rather than
   * mode-dependent: 'self' permits only same-origin framing, so the narrower
   * value would buy nothing and would tie a security header to a deployment
   * label. This is transport-surface hardening only — it grants nothing and is
   * not part of any authority decision (ADR 0030/0038/0128).
   */
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('content-security-policy', "default-src 'self'; frame-ancestors 'self'");
    reply.header('x-content-type-options', 'nosniff');
    /**
     * `no-store` als Vorgabe statt als Gewohnheit (Befund B94).
     *
     * Diese Fläche antwortet mit den Erinnerungen einer Person, und dass keine
     * davon in einem Zwischenspeicher landet, hing an 126 Aufrufen von
     * `sendNoStore` - also daran, dass jeder Weg an *jeder* Stelle daran
     * gedacht hat. Gemessen: sechzehn Antworten setzen ihn nicht, und alle
     * sechzehn sind Fehler oder ein 204 - also heute kein Leck. Aber die
     * Eigenschaft gilt durch Aufmerksamkeit und nicht durch Bauart, und die
     * siebzehnte Antwort waere die, die Daten traegt.
     *
     * **Gesetzt und nicht ueberschrieben.** Wer bewusst einen anderen Wert
     * angibt - eine Datei des Dashboards etwa, die zwischengespeichert werden
     * darf -, behaelt ihn. Das hier ist eine Vorgabe fuer alles, was keine
     * Meinung dazu hat, und die sichere Richtung ist, nichts aufzuheben.
     */
    if (!reply.hasHeader('cache-control')) {
      reply.header('cache-control', 'no-store');
    }
    return payload;
  });

  registerWebDashboard(app, config.webRootPath ?? defaultWebRootPath());

  const store = await EventStore.open(config.databasePath, {
    backupDirectory: config.backupDirectory,
    memoryCrypto,
    // ADR 0119 Q1. Free space on the filesystem the database actually lives
    // on. Read per call rather than cached: pressure is a condition, not a
    // startup fact, and a cached reading would refuse writes long after the
    // person freed space - or admit them long after they stopped having room.
    availableBytes: () => {
      try {
        const stats = statfsSync(dirname(config.databasePath));
        return stats.bavail * stats.bsize;
      } catch {
        // Unreadable is not evidence of room; the evaluator fails closed on
        // a reading it cannot use.
        return Number.NaN;
      }
    },
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
    // Befund B74. Der einzige Ort, an dem eine geworfene Operation eine Spur
    // hinterlaesst. `warn` und nicht `error`, weil das Home weiterlaeuft und
    // dem Geraet richtig geantwortet hat - aber es steht da, denn seit B72
    // kommt hier an, dass die Datenbank nicht schreiben konnte.
    reportOperationFailure: (operation, message) => {
      app.log.warn({ operation, message }, 'Pico Link operation threw and was answered as operation_failed.');
    },
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
  }, undefined, new PicoRequestQuota(config.linkRequestQuota));
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
  // ADR 0049. One runtime per Home, because ADR 0142 PE3's lane is per entry
  // and a second runtime would be a second lane over one accelerator.
  const modelRuntime = new PicoModelRuntime({
    log: (line, detail) => {
      app.log.info(detail ?? {}, line);
    },
  });
  /**
   * ADR 0151 PV1 with ADR 0138 CO1. What turns a reference into a secret.
   *
   * Its key store is built whatever the memory-encryption decision says,
   * because that decision is about *memory content*: a Home that keeps its
   * notes in plaintext has not thereby decided to keep a provider credential
   * in plaintext, and there would be nowhere to put one.
   */
  const modelProviderCredentials = new ModelProviderCredentialCrypto(
    sodium,
    new KeyStore(keyStorePath),
  );
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

  /**
   * ADR 0143 DP8. The depot working copies are brought back to what the
   * attachment rows say, before anything can be pointed at one.
   *
   * ADR 0070's tombstone posture: the durable record decides and the
   * filesystem is brought to it. A detach interrupted between the row and the
   * files would otherwise leave executable code on disk that no attachment
   * stands behind - and unlike a leftover scratch directory, this is what a
   * supplier process would be handed.
   *
   * At boot rather than on a timer, for the same reason the share-envelope
   * reconciliation above is: the window that matters is the one between a
   * crash and the next start.
   */
  const depotWorkspace = new PicoDepotWorkspace(
    config.depotRoot ?? PicoDepotWorkspace.defaultRoot(config.databasePath),
  );
  const removedDepotDirectories = depotWorkspace.removeOrphans(
    store.picoDepotAttachments().map((attachment) => attachment.pin.remote),
  );
  if (removedDepotDirectories.length > 0) {
    app.log.warn(
      { removedDepotDirectories },
      'Depot working copies with no attachment behind them were removed.',
    );
  }

  /**
   * ADR 0143 DP8, the same reconciliation for the supplier scratch areas.
   *
   * Orphans only, not an empty sweep. The ADR says a scratch area is removed
   * *when the attachment is removed*, which is a different sentence from
   * "discarded at every start" - a supplier that unpacked a 1.4 GB corpus and
   * indexed it would pay for that again on every restart, and nothing here
   * asked for that.
   */
  const supplierScratch = new PicoSupplierScratch(
    config.supplierScratchRoot ?? PicoSupplierScratch.defaultRoot(config.databasePath),
  );
  const removedScratchDirectories = supplierScratch.removeOrphans(
    store.picoSupplierAttachments().map((attachment) => attachment.identifier),
  );
  if (removedScratchDirectories.length > 0) {
    app.log.warn(
      { removedScratchDirectories },
      'Supplier scratch areas with no attachment behind them were removed.',
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
        'Pico Home first-device evidence could not be re-projected from the founding record.',
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
  // ADR 0122 Y6. Once per boot, before anything else can append: the record
  // that the running code changed is evidence about this boot, and evidence
  // that arrives after the work it describes is worth less.
  //
  // A downgrade is named as one. Arriving on older code is the direction that
  // can reintroduce a fixed flaw, and an installation unable to say which way
  // it moved cannot tell an update from an attack.
  const versionChange = describePicoVersionChange({
    previousVersion: store.observeServiceVersion(SERVICE_VERSION),
    version: SERVICE_VERSION,
  });
  //
  // A first boot records the version but appends nothing. Nothing *changed* -
  // this is the beginning, and the gate asks for a record where the running
  // version differs from the recorded one. An anchor that was re-seeded would
  // also read as a first boot, and that case already has its own, more precise
  // record in `home.recovery_anchor_reseeded`.
  if (versionChange !== null && versionChange.direction !== 'first_boot') {
    appendServerEvent('home.version_changed', versionChange as unknown as FoundationEventPayload);
    if (versionChange.direction === 'downgrade') {
      app.log.warn(versionChange, 'running an older version than last recorded');
    }
  }

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
      /**
       * ADR 0150 PU5. The push ledger, kept to its horizon.
       *
       * **It had no caller at all**, so every push a Home ever made stayed on
       * record for the life of the installation - a table that only grows, in
       * a family whose whole point is not keeping what nobody needs. Here
       * rather than on its own timer: this tick already exists for exactly
       * this kind of forgetting, and a second interval would be a second thing
       * to stop on close.
       */
      const prunedPushes = store.prunePicoLinkPushLedger(
        new Date(Date.now() - picoLinkPushLedgerHorizonMs).toISOString(),
      );
      if (prunedPushes > 0) {
        app.log.info({ prunedPushes }, 'push ledger pruned to its horizon');
      }
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

  /**
   * ADR 0129 SR2. The observation buffer is pruned at open.
   *
   * This answers two of the five places at once. It is boot reconciliation,
   * and it is what a restore does to a buffer: a snapshot older than the
   * window comes back empty, because a buffer restored from last week
   * describes a past the derivation would read as recent.
   */
  const prunedObservations = store.prunePicoObservations();
  if (prunedObservations > 0) {
    app.log.info({ prunedObservations }, 'observation buffer pruned to its window');
  }

  runRetentionSweep();
  const retentionSweep = setInterval(runRetentionSweep, RETENTION_SWEEP_INTERVAL_MS);
  retentionSweep.unref();

  /**
   * ADR 0118 O1. The scheduler runs.
   *
   * It was written, tested and never started, so no entry in a running Pico
   * had ever come due - the third state a surface can show was unreachable in
   * the product. Starting it needed the delivery question answered first,
   * because a scheduler that marked entries delivered would have emptied the
   * companion's list without anybody being told.
   *
   * What it does now is record that the instant passed. Durable, because the
   * person's device may be asleep or in a tunnel, and unreachable is not the
   * same as forgotten. Whether anyone was *told* is a separate fact that only
   * the device that told them can report.
   */
  /**
   * ADR 0128 H3 wiring, which exists for the first time because a module
   * finally declares an effect (ADR 0139 AC6). `bindPicoModuleEffects` refuses
   * both directions: power supplied that no manifest declared, and a
   * declaration the runtime does not implement.
   *
   * The implementation is what the scheduler used to do inline - record that
   * the instant passed, content-free. What changed is that it now happens
   * because an action was requested, decided and started, rather than because
   * a timer fired.
   */
  type PicoBoundEffect = (
    request: PicoActionRequest,
    capabilities: PicoEffectCapabilities,
  ) => void;

  const calendarEffects: Record<string, PicoBoundEffect> = {
    'calendar.raise-entry': (request, capabilities) => {
      const argument = (name: string) => request.arguments
        .find((entry) => entry.name === name)?.value as string;
      const event = factory.create({
        deviceId: config.deviceId,
        type: 'memory.time_bound_entry_due',
        // Content-free: which item and when it was due. The words stay in the
        // privacy domain that governs them.
        payload: {
          memoryItemId: argument('memory_item_id'),
          dueAt: argument('due_at'),
        },
      });
      // ADR 0141 RN2: the write goes through the capability the runner handed
      // over, which a `read_only` effect would not have received.
      capabilities.write(() => {
        store.append(event);
        broadcast(event);
      });
    },
  };
  /**
   * ADR 0143 DP8. Fetching a depot to the commit a person accepted.
   *
   * The module declares this effect and cannot perform it - `module:check`
   * refuses `node:child_process` in a module and the fetch is `git`. That is
   * ADR 0128 H3 working as written, and this is the other side of it: the core
   * decides whether to cause what a module said it could cause.
   *
   * **A condition is recorded and then thrown.** ADR 0138 CO2 makes an
   * unreachable remote a state rather than a fault, and it is recorded as one
   * on the row above. But the *action* did not do what it was asked to, and
   * `executePicoAction` would otherwise write `success: true` into the ADR
   * 0121 chain about a fetch that brought nothing. The two records say
   * different things on purpose: the row says what is true now, the chain says
   * what happened.
   */
  /**
   * ADR 0136 BR2. The three things the intake needs, kept beside each other so
   * the boundary they draw is readable in one place.
   *
   * `depotLibraryPaths` lists the core's own working copy - Pico fetched it,
   * so the names are its knowledge. `depotLibraryExcerpt` asks the supplier
   * for the bytes, because those never are. And the requester is read from the
   * action rather than assumed, since whose corpus this is decides where it
   * may be read.
   */
  const picoDepotLibraryReadExpectations = Object.freeze([
    Object.freeze({ name: 'topic', type: 'token' }),
    Object.freeze({ name: 'summary', type: 'text' }),
  ]);
  const picoDepotLibraryReadQuestion =
    'What is this document about? Answer only from the quoted data.';

/**
   * Where the shipped library supplier lives, resolved from this module.
   *
   * **It was resolved from `process.cwd()`, and that worked by coincidence.**
   * The image sets `WORKDIR /app` and starts `apps/core/dist/index.js` from
   * there, so the relative walk happened to land - and a Home started from any
   * other directory read nothing at all, silently: a missing entry point makes
   * every path count as *refused*, and the caller was handed `queued: 0` with
   * no reason. A working directory is the operator's choice; the location of
   * shipped code is not, so it is derived from where this module actually is.
   *
   * Three levels up from `apps/core/{src,dist}`, which is the repository root
   * in development and `/app` in the image.
   */
  const picoShippedLibrarySupplierEntryPoint = join(
    import.meta.dirname, '..', '..', '..', 'bridges', 'suppliers', 'git-library', 'index.js',
  );

  function depotLibraryPaths(remote: string): readonly string[] {
    const root = depotWorkspace.pathFor(remote);
    if (!existsSync(root)) {
      return [];
    }
    const found: string[] = [];
    const walk = (current: string, prefix: string): void => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          // `.git` above all: a working copy's own plumbing is not the corpus,
          // and a plan that queued it would spend a person's afternoon on
          // object files.
          continue;
        }
        const path = `${prefix}${entry.name}`;
        if (entry.isDirectory()) {
          walk(join(current, entry.name), `${path}/`);
        } else if (entry.isFile()) {
          found.push(path);
        }
      }
    };
    walk(root, '');
    return found;
  }

  async function depotLibraryExcerpt(
    remote: string,
    path: string,
  ): Promise<{ text: string; commit: string } | null> {
    const host = new PicoSupplierHost({
      // The shipped depot, which ADR 0143 DP6 pins to the release. A depot a
      // person attached brings its own entry point, and that is the version of
      // this line the first external library will need.
      entryPoint: picoShippedLibrarySupplierEntryPoint,
      requestTimeoutMs: 10_000,
    });
    try {
      await host.hello();
      const offered = await host.offer({
        workingCopy: depotWorkspace.pathFor(remote),
        path,
      });
      const items = (offered.items ?? []) as Array<{ text?: string; pin?: { value?: string } }>;
      const first = items[0];
      return first?.text === undefined || first.pin?.value === undefined
        ? null
        : { text: first.text, commit: first.pin.value };
    } finally {
      host.close();
    }
  }

  /**
   * ADR 0143 DP1 with ADR 0136 BR3. The fetch is the occasion, and this is
   * **not** inside the `depot.fetch` effect.
   *
   * It cannot be. An ADR 0139 AC1 request names an effect and its arguments
   * and nothing else - who may ask was decided before the effect ran, and the
   * effect deliberately never learns it. So an effect cannot pick the entry a
   * person decided about, because it does not know whose fetch this is.
   *
   * That is the request contract working rather than a gap, and the honest
   * consequence is that queuing happens where the requester is still known:
   * one call from whatever ran the action, with the person named. Until a
   * caller passes one, no reads are queued and nothing pretends otherwise.
   */
  /**
   * ADR 0137 IN5. Which library suppliers this depot declares, and the space
   * each of them lands material in.
   *
   * **Both were constants until 2026-08-14 and both were wrong.** The
   * identifier came from the shipped depot being the only one, and the domain
   * from nowhere at all - which is the shape ADR 0143 DP6 argues against, one
   * layer up from the column it forbids.
   *
   * The depot declares its suppliers and the *attachment* declares the domain,
   * exactly one and never a Pico. A supplier the person has not attached has
   * no domain, so it queues nothing: an unattached supplier is one nobody has
   * said where the material of belongs.
   */
  function depotLibrarySuppliers(remote: string): ReadonlyArray<{
    identifier: string;
    privacyDomain: string;
  }> {
    const manifestPath = join(depotWorkspace.pathFor(remote), 'pico-depot.json');
    if (!existsSync(manifestPath)) {
      return [];
    }
    let declared: PicoDepotManifest;
    try {
      declared = parsePicoDepotManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
    } catch {
      // A depot whose manifest does not parse is a depot Pico will not act on.
      // ADR 0143 DP3 holds the shipped one to the same parser as any other.
      return [];
    }
    return Object.freeze(declared.suppliers
      .filter((supplier) => supplier.kind === 'library')
      .flatMap((supplier) => {
        const attached = store.picoSupplierAttachment(supplier.identifier);
        return attached === undefined
          ? []
          : [{ identifier: supplier.identifier, privacyDomain: attached.privacyDomain }];
      }));
  }

  /**
   * ADR 0143 DP3 with ADR 0137 IN5. Every supplier a fetched depot declares,
   * whether or not anybody has attached it.
   *
   * **The declared side had no reader at all until 2026-08-17.** A depot could
   * be attached, permitted and fetched, its `pico-depot.json` landed on disk
   * naming a library supplier - and `home.suppliers.read` answered with the
   * empty list, because it listed only *attachments* and nothing in the
   * product could make one. `attachPicoSupplier` had no caller outside its own
   * tests, `picoDepotSupplierNeedsFromPerson` had none at all, and the window's
   * supplier section hid itself on every real Home. A live walk found it: the
   * material was on disk and the person was shown nothing.
   *
   * Declared and attached are two states rather than one absence (ADR 0117
   * X1). "This depot brings a library and nobody has said where its material
   * belongs" is a sentence a person can act on; an empty list is not.
   */
  function depotDeclaredSuppliers(): ReadonlyArray<{
    remote: string;
    declaration: PicoDepotManifest['suppliers'][number];
  }> {
    const declared: Array<{
      remote: string;
      declaration: PicoDepotManifest['suppliers'][number];
    }> = [];
    for (const attachment of store.picoDepotAttachments()) {
      const manifestPath = join(
        depotWorkspace.pathFor(attachment.pin.remote),
        'pico-depot.json',
      );
      if (!existsSync(manifestPath)) {
        // Attached but never fetched, or fetched and the manifest is not
        // there. Neither is a declaration.
        continue;
      }
      try {
        const manifest = parsePicoDepotManifest(
          JSON.parse(readFileSync(manifestPath, 'utf8')),
        );
        for (const declaration of manifest.suppliers) {
          declared.push({ remote: attachment.pin.remote, declaration });
        }
      } catch {
        // Same posture as `depotLibrarySuppliers`: a manifest that does not
        // parse is one Pico will not act on, and it will not half-read it
        // either.
        continue;
      }
    }
    return Object.freeze(declared);
  }

  const queuePicoDepotLibraryReads = async (input: {
    remote: string;
    picoIdentityFingerprintHex: string;
  }): Promise<{
    queued: number;
    absent?: number;
    refused?: number;
    refusal?: string;
  }> => {
    const chosen = pickPicoDepotIntakeEntry(
      store.picoModelProviderConsent()
        .listFor(input.picoIdentityFingerprintHex)
        .map((entry) => entry.entryId),
    );
    if (!('entryId' in chosen)) {
      // Not a failure. ADR 0138: reaching outside is off until somebody says
      // so, and choosing among several is ADR 0152's surface's question.
      return { queued: 0, refusal: chosen.refusal };
    }
    const suppliers = depotLibrarySuppliers(input.remote);
    if (suppliers.length === 0) {
      return { queued: 0, refusal: 'no_attached_library_supplier' };
    }
    if (!existsSync(picoShippedLibrarySupplierEntryPoint)) {
      // Named rather than discovered as three hundred refused paths. ADR 0118
      // O4: this is a broken installation, not a corpus with nothing in it.
      return { queued: 0, refusal: 'shipped_library_supplier_missing' };
    }

    let queued = 0;
    let absent = 0;
    let refused = 0;
    for (const supplier of suppliers) {
    const report = await enqueuePicoDepotLibraryReads({
      readExcerpt: async (path) => await depotLibraryExcerpt(input.remote, path),
      // ADR 0136 BR6, asked of the working copy rather than assumed. Until the
      // condition read is wired here, an unproven coverage is `false`, which
      // is the honest half of "an unasked question and a negative answer are
      // different facts" - the derivation says the pin does not cover, and a
      // person keeping it sees that rather than a claim.
      pinCoversContent: false,
      queue: store.picoModelJobQueue(),
      jobId: (path) => `job_library_${createHash('sha256')
        .update(`${input.remote}\u0000${path}`).digest('hex').slice(0, 32)}`,
      nowMs: () => Date.now(),
      at: () => new Date().toISOString(),
    }, {
      supplierIdentifier: supplier.identifier,
      privacyDomain: supplier.privacyDomain,
      picoIdentityFingerprintHex: input.picoIdentityFingerprintHex,
      entryId: chosen.entryId,
      plan: picoDepotLibraryReadPlan({ paths: depotLibraryPaths(input.remote) }),
      expects: picoDepotLibraryReadExpectations,
      question: picoDepotLibraryReadQuestion,
    });
    app.log.info(
      { remote: input.remote, supplier: supplier.identifier, ...report },
      'Queued library reads after fetch.',
    );
    queued += report.queued;
    absent += report.absent;
    refused += report.refused;
    }
    /**
     * The counts come back, not just the successes. `queued: 0` alone cannot
     * tell "this corpus had nothing to read" from "every file was refused",
     * and only the second is something somebody can fix.
     */
    return { queued, absent, refused };
  };

  app.decorate('picoQueueDepotLibraryReads', queuePicoDepotLibraryReads);

  /**
   * ADR 0143 DP1, seit dem 2026-09-01. Derselbe Effekt, zwei Anlässe.
   *
   * `asked` sagt, ob eine Person gerade *jetzt holen* gedrückt hat. Nur dann
   * fragt der Abruf das Remote zusätzlich, was es veröffentlicht, und
   * schreibt ein abweichendes Ergebnis als Angebot auf. Der planmässige Lauf
   * bleibt eine Instandsetzung und fragt nichts - der Satz, mit dem ADR 0143
   * ihn von einer Abfrage nach Commits unterscheidet, bleibt damit wahr.
   *
   * Als Fabrik statt als Feld im Aufruf, weil der Anlass nichts ist, was in
   * den Aufzeichnungen einer Handlung steht: was eine Person freigibt, ist ein
   * Abruf dieses Depots, und ob sie dabei danebenstand, gehört nicht in ihre
   * Argumente.
   */
  const depotEffectsFor = (asked: boolean): Record<string, PicoBoundEffect> => ({
    'depot.fetch': (request, capabilities) => {
      const depotRemote = request.arguments
        .find((entry) => entry.name === 'remote')?.value as string;
      const attachment = store.picoDepotAttachment(depotRemote);
      if (attachment === undefined) {
        // Detached between the decision and the run. Refusing is the only
        // honest answer: the pin that was decided about no longer exists.
        throw new Error('pico_depot_not_attached');
      }
      const outcome = fetchPicoDepot({
        pin: attachment.pin,
        into: depotWorkspace.ensure(depotRemote),
        askWhatIsPublished: asked,
      });
      capabilities.write(() => {
        store.recordPicoDepotFetchOutcome({
          remote: depotRemote,
          at: new Date().toISOString(),
          ...(outcome.status === 'condition' ? { condition: outcome.condition } : {}),
          // Absent when nobody asked, so a scheduled run says nothing about an
          // offer rather than withdrawing one.
          ...(outcome.status === 'fetched' && outcome.offeredCommit !== undefined
            ? { offeredCommit: outcome.offeredCommit }
            : {}),
        });
      });
      if (outcome.status === 'condition') {
        throw new Error(`pico_depot_fetch_condition:${outcome.condition}`);
      }

    },
  });

  // Bound per manifest, because `bindPicoModuleEffects` asserts an exact match
  // in both directions: everything declared is supplied and everything
  // supplied is declared. One merged map checked against one manifest would
  // report every other module's effects as undeclared.
  bindPicoModuleEffects({
    manifest: picoCalendarModuleManifest,
    supplied: calendarEffects,
  });
  bindPicoModuleEffects({
    manifest: picoDepotModuleManifest,
    // Die Namen sind bei beiden Anlässen dieselben; gebunden wird gegen einen
    // von ihnen, weil die Zusage über den Effekt geht und nicht über seinen
    // Anlass.
    supplied: depotEffectsFor(false),
  });
  /** Der Zeitplan fragt nichts; wer danebensteht, fragt mit. */
  const moduleEffectsFor = (asked: boolean): Record<string, PicoBoundEffect> => ({
    ...calendarEffects,
    ...depotEffectsFor(asked),
  });
  const moduleEffects = moduleEffectsFor(false);
  const emitActionFact = (type: PicoActionFactType, payload: Record<string, unknown>): string => {
    const fact = factory.create({ deviceId: config.deviceId, type, payload });
    store.append(fact);
    broadcast(fact);
    return fact.eventId;
  };
  /**
   * ADR 0127 M3. The shipped modules, listed rather than discovered.
   *
   * A runtime imports a module; a module never imports a runtime. This is that
   * edge, and it is the only place the manifests are named - adding a module is
   * a decision spoken here and in the protocol's closed list, not a side effect
   * of a directory existing.
   */
  const shippedModuleManifests = [
    picoCalendarModuleManifest,
    picoDepotModuleManifest,
    picoHomeAssistantModuleManifest,
    picoSpatialRecallModuleManifest,
  ];

  // The closed list and this one are two places, so they can disagree - and
  // they did: the Home Assistant module shipped, was listed in the protocol,
  // and was never registered here, so it was absent from the activation view
  // without anything saying so. Asserted at boot, in the idiom
  // `assertClassified` already uses for routes: a module the runtime forgot
  // fails to start rather than quietly not existing.
  for (const identifier of picoModuleIdentifiers) {
    if (!shippedModuleManifests.some((manifest) => manifest.identifier === identifier)) {
      throw new Error(`unregistered_pico_module:${identifier}`);
    }
  }

  /**
   * ADR 0139 AC1's authority, derived from the shipped manifests rather than
   * listed beside them.
   *
   * It used to be its own literal, and it drifted the way a second list does:
   * `depot` shipped, was registered above, declared `depot.fetch` - and was
   * missing here, so the one effect in the tree that installs code was absent
   * from the list AC1 decides against. Nothing had requested it yet, which is
   * the only reason this was latent rather than a bug. The assertion above
   * catches a module the runtime forgot; nothing caught a module whose effects
   * the runtime forgot, and now there is nothing to catch.
   *
   * Still collected from manifests rather than from anything the core keeps at
   * runtime, which was the point of naming it here in the first place.
   */
  const declaredModuleEffectNames = picoDeclaredEffectNames(shippedModuleManifests);

  /**
   * ADR 0140 RL4 mit ADR 0139 AC4. Jeder Effekt, dem jemand zugestimmt hat.
   *
   * Über die geschlossene Modulliste gebildet und nicht über eine zweite
   * Abfrage: welche Module es gibt, ist ADR 0127s Entscheidung, und eine
   * eigene Liste daneben wäre eine, die von ihr abweichen kann. Was pro Modul
   * zugestimmt wurde, steht im Speicher - ein Modul, dem niemand zugestimmt
   * hat, trägt hier nichts bei.
   */
  const consentedModuleEffects = () => shippedModuleManifests
    .flatMap((manifest) => store.picoModuleEffectConsent(manifest.identifier));

  /**
   * Said once per process, not once per tick. A precondition that has not
   * changed is not news, and a line per due appointment per tick would bury
   * the log it is trying to be visible in.
   */
  let calendarConsentReported = false;

  const timeBoundScheduler = startPicoTimeBoundScheduler({
    store: {
      picoUnannouncedTimeBoundEntries: (limit) => store.picoUnannouncedTimeBoundEntries(limit),
      markPicoTimeBoundEntryAnnounced: (input) => store.markPicoTimeBoundEntryAnnounced(input),
    },
    announce: (entry) => {
      /**
       * ADR 0139 AC4 as a standing precondition, read rather than discovered
       * by failing - the same shape the depot sweep uses, and here for a
       * reason a live boot found.
       *
       * An unconsented effect makes `decidePicoAction` *throw*, and the
       * scheduler's retry catches every throw and tries again next tick. So
       * an ordinary Home - where nobody had ever recorded consent, because
       * consent was only written on an off-to-on transition modules never
       * make (ADR 0127 M3) - manufactured an exception per due appointment
       * per tick, forever, and announced nothing. "Being told never is the
       * one this family exists to prevent" is what the scheduler says, and
       * it was what happened.
       *
       * **It still refuses rather than returning**, and that distinction cost
       * a second live boot to find. Returning quietly reads to the scheduler
       * as *announced*, so it marks the entry - and an entry the Home
       * believes it handled is never tried again, which would turn "not yet
       * agreed to" into an appointment silently lost for good, even after the
       * person agrees. Left unannounced, it arrives the moment they do.
       *
       * What changed is only the silence: the reason is said once, and the
       * question is in front of them in settings through
       * `home.modules.consent.read`.
       */
      const calendarConsent = store.picoModuleEffectConsent('calendar');
      if (!calendarConsent.some((effect) => effect.name === 'calendar.raise-entry')) {
        if (!calendarConsentReported) {
          calendarConsentReported = true;
          app.log.warn(
            { module: 'calendar', effect: 'calendar.raise-entry' },
            'Appointments are not being announced: nobody has agreed to this effect yet. '
            + 'The agreement is offered in the companion, under what the parts of Pico may do.',
          );
        }
        throw new Error('pico_calendar_effect_not_consented');
      }
      // ADR 0139 AC6. Announcing is reaching a person, and reaching is an
      // effect (user decision, 2026-08-10). So the scheduler stops writing the
      // event itself and becomes a *requester* - untrusted like any other,
      // because being Pico's own code buys no exemption.
      // ADR 0140 RL5: decide first, record it, then execute against the
      // record. The runner is never handed the inputs.
      const decided = decidePicoAction({
        requested: {
          effectName: 'calendar.raise-entry',
          arguments: [
            { name: 'memory_item_id', value: entry.memoryItemId },
            { name: 'due_at', value: entry.dueAt },
          ],
        },
        // Both are values Pico computed from what it already holds.
        argumentSources: {
          memory_item_id: ['own_pico'],
          due_at: ['own_pico'],
        },
        declaredEffectNames: declaredModuleEffectNames,
        consentedEffects: store.picoModuleEffectConsent('calendar'),
        privacyDomain: 'private',
        personPresent: false,
        instance: null,
        reachesOutside: false,
        reachPermitted: false,
        emit: emitActionFact,
      });
      if (decided.decision === 'allow') {
        executePicoAction({ decided, effects: moduleEffects, emit: emitActionFact });
      }
    },
  });

  /**
   * ADR 0143 DP1 with ADR 0127. What a depot looks like to the module.
   *
   * `materialised` is read here and handed over, because a module reaches
   * nothing - a fact about the filesystem is the one kind it must be told.
   */
  const picoDepotViewFor = (attachment: PicoDepotAttachment): PicoDepotView => ({
    pin: attachment.pin,
    acceptedAt: attachment.acceptedAt,
    mayFetch: attachment.mayFetch,
    mayFetchUnasked: attachment.mayFetchUnasked,
    materialised: existsSync(depotWorkspace.pathFor(attachment.pin.remote)),
    ...(attachment.offeredCommit === undefined ? {} : { offeredCommit: attachment.offeredCommit }),
    ...(attachment.lastFetchCondition === undefined
      ? {}
      : { lastFetchCondition: attachment.lastFetchCondition }),
  });

  /**
   * ADR 0143 DP8. The sweep that keeps depot working copies at their pins.
   *
   * One task rather than one per depot, because a task list fixed at boot
   * would go stale the moment somebody attached or detached one. What the task
   * does is read the attachments as they are now and ask about each.
   *
   * It **asks**: `picoDepotFetchIntent` decides whether a request is worth
   * making, `decidePicoAction` decides whether to allow it, and only then does
   * anything reach `git`. The scheduler never touches an effect, which is what
   * keeps this from being the second privileged path ADR 0138 CO4 separates
   * from answering a question.
   */
  /**
   * ADR 0143 DP6 says a depot lives in no space, and ADR 0140 RL6 requires
   * every decision to name the domain it spoke for. Both cannot be satisfied,
   * so a depot fetch speaks for the narrowest domain rather than inventing one
   * for a delivery vehicle - and it is named once here, because a rule a
   * person records has to be found under the same name the decision was made
   * under.
   */
  const depotFetchPrivacyDomain = 'private';

  /**
   * ADR 0129 SR5 mit SR2. In welchem Raum die Messungen eines Geräts liegen.
   *
   * Der Home nennt ihn, nicht der Absender. Die Domäne ist die einzige
   * Custody, die eine Beobachtung trägt - an ihr hängt die Shred-Kaskade -,
   * und ein Gerät, das seine eigene nennen dürfte, legte seine Messungen in
   * den Raum eines anderen oder in einen, den kein Shred je erreicht.
   */
  const spatialCapturePrivacyDomain = 'private';

  /**
   * ADR 0149. The relay this Home uses, or nothing.
   *
   * Absent is the ordinary state: a Home whose owner has not chosen an
   * operator has no relay, and the direct path is unaffected. Built once
   * rather than per request, because it holds a bounded client and no secret
   * beyond the account credential the config already carries.
   */
  /**
   * ADR 0104 S5 with ADR 0031. The account is Pico's; the URL is the host's.
   *
   * The identity is read from the store and inherited from the environment
   * only when nobody has decided - the same shape as the encryption decision,
   * and unlike it this one can be read after the store opens, because a relay
   * transport is built long after.
   *
   * The base URL stays configuration. Where an operator answers can change
   * without anybody deciding anything, which is exactly what separates
   * reachability from identity in ADR 0031 and in the provider entry.
   */
  const relayIdentity = (() => {
    const decided = store.picoLinkRelayIdentity();
    if (decided !== undefined && !decided.inheritedFromHost) {
      return { operator: decided.operator, accountId: decided.accountId };
    }
    if (config.linkRelayAccountId === undefined) {
      return undefined;
    }
    store.decidePicoLinkRelayIdentity({
      operator: config.linkRelayOperator ?? defaultPicoLinkRelayOperator,
      accountId: config.linkRelayAccountId,
      at: new Date().toISOString(),
      inheritedFromHost: true,
    });
    return {
      operator: config.linkRelayOperator ?? defaultPicoLinkRelayOperator,
      accountId: config.linkRelayAccountId,
    };
  })();

  /**
   * The operator the addresses this Home hands out name.
   *
   * Resolved once at start, like the transport, because the two have to agree:
   * an address naming one operator while the transport talks to another is a
   * device writing into nothing. That is also why the route answers
   * `appliesAtNextStart`.
   */
  const relayOperator = relayIdentity?.operator
    ?? config.linkRelayOperator ?? defaultPicoLinkRelayOperator;

  const relayTransport = (config.linkRelayBaseUrl !== undefined
    && relayIdentity !== undefined)
    ? createPicoLinkRelayTransport({
      baseUrl: config.linkRelayBaseUrl,
      accountId: relayIdentity.accountId,
    })
    : undefined;

  /**
   * ADR 0141 RN4. Questions waiting for the person who was asked.
   *
   * Beside the sweep because the sweep is what asks them, and in memory
   * because a question outliving the session it was asked in is the standing
   * grant RN4 refuses.
   */
  const pendingActions = new PicoPendingActions();

  /**
   * ADR 0142 PE2. Measurements in flight, and how the recent ones ended.
   *
   * In memory beside `pendingActions` for a different reason: an approval must
   * not outlive the session it was asked in, while a measurement simply has no
   * durable state worth keeping - what it produces is a registry entry, and the
   * registry persists that. The event pair is the durable record of the work.
   */
  const modelProviderMeasurements = new PicoModelProviderMeasurements();

  /**
   * What a sweep did, and what stopped it before it could do anything.
   *
   * A count alone answers "how many" and cannot answer "why none", which are
   * different questions to a person who just pressed a button.
   */
  interface PicoDepotSweepResult {
    requested: number;
    blocked?: 'effects_not_consented';
  }

  const sweepPicoDepotFetches = (
    asked: boolean,
    /**
     * ADR 0141 RN4. The presence session a `require_approval` would be parked
     * against. A person's "fetch now" carries one; a scheduled sweep has none.
     */
    approvalWindow?: {
      presenceSessionId: string;
      endsAtMs: number;
      startedAtMs: number;
      durationMs: number;
    },
  ): PicoDepotSweepResult => {
      let requested = 0;
      // ADR 0139 AC4 read once, ahead of the loop, because it is a fact about
      // the module rather than about any one depot.
      //
      // Read at all because an unconsented effect makes `decidePicoAction`
      // *throw* rather than return a refusal - correctly, since a request for
      // an effect nobody agreed to exists is not a question with an answer.
      // But a sweep that hit it would take the whole sweep down, and every
      // depot after it, over something no depot could have fixed. Same
      // rationale as `picoDepotFetchIntent`: a standing precondition is read,
      // not discovered by failing.
      const consentedEffects = store.picoModuleEffectConsent('depot');
      if (!consentedEffects.some((effect) => effect.name === 'depot.fetch')) {
        /**
         * **Named rather than counted as nothing to do.**
         *
         * This returned a bare `0` and a live walk found what that hid: a
         * person attached a depot, permitted reaching, pressed *fetch now* -
         * and got `requested: 0` with no reason, because `depot` ships active
         * (ADR 0127 M3) and effect consent is only written on the off-to-on
         * transition, which a module that was never off never makes. Every
         * depot fetch was unreachable, and every test of one recorded the
         * consent row itself, so nothing ever noticed.
         *
         * ADR 0118 O4: an absence must not render a working thing broken. The
         * absence here is real and the person can fix it, so it is said.
         */
        return { requested: 0, blocked: 'effects_not_consented' };
      }
      for (const attachment of store.picoDepotAttachments()) {
        const intent = picoDepotFetchIntent({
          depot: picoDepotViewFor(attachment),
          asked,
        });
        if (intent.intent !== 'request') {
          continue;
        }
        const recordedRule = store.picoRuleDecision({
          effectName: 'depot.fetch',
          privacyDomain: depotFetchPrivacyDomain,
        });
        if (recordedRule !== 'allow' && approvalWindow === undefined) {
          // **Act where a rule allows it, ask where someone is there to be
          // asked, and otherwise do neither.**
          //
          // `depot.fetch` is `external_write`, which under ADR 0140's RL3
          // floor never resolves to `allow` from the risk class alone - the
          // correct default for the only effect in the tree that installs
          // code. Without a recorded rule the decision is `require_approval`,
          // and ADR 0141 RN4 requires that to carry the presence session the
          // question will be answered in.
          //
          // A scheduled sweep has none. Inventing one would undo the whole
          // point of RN4: a question nobody was present for, parked against a
          // session that never existed. So it does not ask, and the fetch
          // waits for either a person or a rule.
          continue;
        }
        const decided = decidePicoAction({
          requested: {
            effectName: 'depot.fetch',
            arguments: [
              { name: 'remote', value: attachment.pin.remote },
              { name: 'commit', value: attachment.pin.commit },
            ],
          },
          // Both come off the attachment row, which is Pico's own record of a
          // decision a person made. Neither was said by a model or a stranger.
          argumentSources: {
            remote: ['own_pico'],
            commit: ['own_pico'],
          },
          declaredEffectNames: declaredModuleEffectNames,
          consentedEffects,
          privacyDomain: depotFetchPrivacyDomain,
          personPresent: false,
          instance: null,
          reachesOutside: true,
          // ADR 0138 CO3 as a precondition rather than an input: an `allow`
          // never creates reach, and this is the same switch the intent above
          // already read.
          reachPermitted: attachment.mayFetch,
          // ADR 0140 RL4. Absent is not `deny`: the AC4 consent record already
          // says this effect may exist, and a rule refines that rather than
          // being its precondition.
          ...(recordedRule === undefined ? {} : { recordedRule }),
          ...(approvalWindow === undefined ? {} : { approvalWindow }),
          emit: emitActionFact,
        });
        requested += 1;
        if (decided.decision === 'require_approval' && decided.pending !== undefined) {
          /**
           * ADR 0141 RN4. The question is kept so the person can answer it.
           *
           * Without this the decision was recorded, the `approval.requested`
           * fact was emitted, and the record it has to be answered against was
           * dropped on the floor - a question asked into the air.
           */
          const held = pendingActions.add({
            decided,
            presenceSessionId: decided.pending.presenceSessionId,
            endsAtMs: decided.pending.endsAtMs,
            prompt: consentedEffects
              .find((effect) => effect.name === 'depot.fetch')?.description
              ?? 'depot.fetch',
            risk: decided.risk,
          });
          if (!held.ok) {
            // ADR 0119 Q5. The ceiling refuses rather than forgetting an
            // older question, and the person is left with the questions they
            // already have rather than a new one that replaced one.
            continue;
          }
        }
        if (decided.decision === 'allow') {
          executePicoAction({ decided, effects: moduleEffectsFor(asked), emit: emitActionFact });
          /**
           * ADR 0143 DP1 with ADR 0136 BR3. The fetch brought material, so
           * this is the moment reads can be queued - and it is here rather
           * than in the effect because ADR 0139 AC1 keeps the requester out of
           * an effect on purpose.
           *
           * **Attributed to whoever accepted the attachment, or not at all.**
           * A fetch runs on a timer with nobody present, so the person is the
           * one who said this material may be here - and an attachment made
           * before anybody recorded that has nobody, which means no reads.
           * Picking somebody would be Pico deciding whose corpus this is.
           */
          if (attachment.acceptedBy !== undefined) {
            void queuePicoDepotLibraryReads({
              remote: attachment.pin.remote,
              picoIdentityFingerprintHex: attachment.acceptedBy,
            }).catch((error: unknown) => {
              // A fetch that brought material succeeded. What Pico then failed
              // to queue is a separate fact and does not undo it.
              app.log.warn(
                {
                  remote: attachment.pin.remote,
                  reason: error instanceof Error ? error.message : 'failed',
                },
                'Library reads were not queued after fetch.',
              );
            });
          }
        }
      }
      return { requested };
  };

  const depotFetchScheduler = startPicoPeriodicTaskScheduler({
    tasks: [parsePicoDepotTask({
      identifier: 'depot-fetch',
      intervalMs: config.depotFetchIntervalMs ?? defaultPicoDepotFetchIntervalMs,
      requestsEffect: 'depot.fetch',
    })],
    // ADR 0138 CO4: a sweep is the case nobody asked for, and the switch that
    // decides whether it may proceed is a different one from CO3.
    request: () => {
      sweepPicoDepotFetches(false);
    },
  });

  /**
   * ADR 0149. The Home reads its own mailboxes on a cadence.
   *
   * **This is not an ADR 0139 action, and that is a decision.** A depot fetch
   * installs code, so it asks; collecting mail addressed to this Home is the
   * Home *listening*, moved to a place where listening means asking somebody
   * to hand it over. The person decided that when they configured an operator,
   * and a per-sweep question would put the same choice in front of them every
   * two minutes about something they already set up.
   *
   * What arrives decides nothing on its own. Each payload is an ADR 0107
   * envelope run through the same `linkIntake` and the same
   * `dispatchPicoLinkOperation` the direct route uses - one list of what this
   * Home offers remotely, which is the only way ADR 0107's per-operation
   * opt-in keeps meaning anything.
   */
  const sweepPicoLinkRelayMailboxes = async (): Promise<void> => {
    if (relayTransport === undefined) {
      return;
    }
    await collectPicoLinkRelayPackets({
      reader: relayTransport,
      // ADR 0148 EX3. Honoured, never the whole book: a mailbox whose
      // delegation went inactive is one to stop reading, and a sweep is where
      // that rule would be quietly skipped.
      mailboxes: store.picoLinkMailboxes().length === 0
        ? []
        : store.honouredPicoLinkMailboxes(sodium),
      handle: async ({ payload, expectedDeviceSigningKeyFingerprintHex }) => {
        const envelope = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as unknown;
        const handled = await linkIntake.handle(
          envelope,
          async (operation, args, principal) => {
            // The disagreement, checked where the principal exists and by the
            // one function that owns the rule. It throws, and the intake
            // swallows what `execute` throws - so the refusal is re-raised
            // after `handle` returns, from the flag below.
            assertPicoLinkRelayPacketSender({
              expectedDeviceSigningKeyFingerprintHex,
              signerDeviceSigningKeyFingerprintHex: principal.deviceSigningKeyFingerprintHex,
            });
            return await dispatchPicoLinkOperation(operation, args, principal, () => {
              // ADR 0115 U3's deferred custody swap has no meaning here: there
              // is no reply socket to seal under the retiring key, so a host
              // rotation does not travel this way.
            });
          },
        );
        if (!handled.ok) {
          throw new PicoLinkRelayUnauthenticatedError(handled.reason);
        }
      },
      onRefused: ({ tag, refusal }) => {
        // The mailbox is deliberately absent. `link:check` caught it here on
        // the first attempt, which is the point of having it: an address is a
        // capability and a log line is where one gets copied out (ADR 0148
        // EX4). The tag is fresh per packet and names nothing.
        app.log.warn({ tag, refusal }, 'Relay packet refused.');
      },
    });
  };

  /**
   * ADR 0150. The Home looking for something worth waking a device about.
   *
   * Reads its own candidates and sends; every judgement it could have made is
   * somewhere else on purpose. **Who** is `picoLinkPushCandidates` - the
   * device being recovered onto is not the one to tell. **Whether** is
   * `decidePicoLinkPush` inside it - one per event, a floor per device, no
   * retry. **What** is the envelope, which cannot say more than "ask me".
   * What is left here is fetching a key and calling three functions, and that
   * is the shape this was aiming for.
   *
   * A device whose reader key has gone answers nothing rather than throwing:
   * `picoIdentityReaderKeyCandidate` refuses without a claimed Home and an
   * active membership, so a member who left simply stops being pushable - the
   * same derived-not-remembered posture ADR 0148 EX3 takes for mailboxes.
   */
  const sweepPicoLinkPushes = async (): Promise<number> => {
    const homeId = store.picoHomeClaimState().homeId;
    if (relayTransport === undefined
      || homeHostKeys === undefined
      || homeId === null
      || homeId === undefined) {
      return 0;
    }

    const nowMs = Date.now();
    const candidates = picoLinkPushCandidates({
      mailboxes: store.honouredPicoLinkMailboxes(sodium),
      pendingRecoveryFor: (picoIdentityFingerprintHex) =>
        store.picoHomeDeviceRecoveryPendingView(picoIdentityFingerprintHex),
      ledger: store.picoLinkPushLedger(),
      nowMs,
    });

    let sent = 0;
    for (const candidate of candidates) {
      const readerKey = store.picoIdentityReaderKeyCandidate({
        homeId,
        picoIdentityFingerprintHex: candidate.mailbox.picoIdentityFingerprintHex,
        delegationId: candidate.mailbox.delegationId,
        deviceKeyAgreementKeyFingerprintHex:
          candidate.mailbox.deviceKeyAgreementKeyFingerprintHex,
        sodium,
      });
      if (readerKey === undefined) {
        // Not the same refusal the mailbox layer already made. That one drops
        // devices with no reader key at all; this one drops devices that have
        // one and were never delegated the scopes an envelope needs. A Home
        // that pushed anyway would be deciding for itself what a delegation
        // said.
        continue;
      }

      const outcome = await sendPicoLinkPush({
        candidate,
        deviceKeyAgreementPublicKeyHex: readerKey.deviceKeyAgreementKeyRecord.publicKeyHex,
        hostSigningKeyFingerprintHex: homeHostKeys.publicBundle.signingKeyFingerprintHex,
        suite: picoIdentitySuite,
        pushId: `push_${randomBytes(16).toString('hex')}`,
        packetTag: randomBytes(16).toString('hex'),
        nowMs,
        seal: (plaintext, recipientPublicKeyHex) => sodium.crypto_box_seal(
          plaintext,
          Buffer.from(recipientPublicKeyHex, 'hex'),
        ),
        sign: (bytes) => homeHostKeyStore.signWithHostSigningKey(sodium, bytes),
        deliver: async (packet) => await relayTransport.deliver(packet),
        recordSent: ({ candidate: pushed, at }) => {
          store.recordPicoLinkPush({
            deviceSigningKeyFingerprintHex: pushed.mailbox.deviceSigningKeyFingerprintHex,
            occasion: pushed.occasion,
            eventId: pushed.eventId,
            pushedAt: at,
          });
        },
      });
      if (outcome === 'accepted') {
        sent += 1;
      } else {
        // Not recorded, so the next sweep tries again under the floor. Named
        // rather than silent: `mailbox_revoked` means that relationship needs
        // a new address, which no amount of retrying produces.
        app.log.warn({ outcome }, 'Relay push was not accepted.');
      }
    }
    return sent;
  };

  /**
   * ADR 0049. The scheduler that drains the queue, and does not fill it.
   *
   * **One job per tick, on purpose.** ADR 0142 PE3 measured one lane, so a
   * tick that drained the queue would be a tick that held the accelerator for
   * as long as the queue was long - and the sweep beside this one, which reads
   * a relay, would wait behind somebody's summarisation. The queue empties at
   * the rate the provider actually has.
   *
   * A refusal that cannot change settles the row. Retrying
   * `entry_may_not_carry_these_words` would be a Home asking the same question
   * every six minutes and receiving the same answer, which is the shape ADR
   * 0150 PU5 refused for pushes and refuses here for the same reason.
   */
  const sweepPicoModelJobs = async (): Promise<number> => {
    const queue = store.picoModelJobQueue();
    const consent = store.picoModelProviderConsent();
    const nowMs = Date.now();
    const at = new Date(nowMs).toISOString();

    /**
     * One job, start to finish. Never throws: a tick that failed on one job
     * would abandon the others it started in the same breath.
     */
    const runOne = async (
      row: PicoModelJobQueueRow,
      entry: PicoModelProviderEntry,
    ): Promise<number> => {
      queue.recordAttempt(row.job.jobId, at);
      try {
        const result = await modelRuntime.dispatch({
          job: row.job,
          entry,
          ...(credentialFor(row, entry) === undefined
            ? {}
            : { credential: credentialFor(row, entry) }),
        });
        queue.settle({ jobId: row.job.jobId, outcome: 'answered', result: result.output, at });
        return 1;
      } catch (error) {
        const refusal = error instanceof PicoModelDispatchError
          ? error.refusal
          : 'dispatch_failed';
        if (picoModelJobRefusalIsFinal(refusal)) {
          queue.settle({ jobId: row.job.jobId, outcome: refusal, at });
        } else {
          // Left pending. The world may be different in six minutes; whose words
          // these are will not be.
          app.log.warn({ jobId: row.job.jobId, refusal }, 'Model job did not run.');
        }
        return 0;
      }
    };

    /**
     * ADR 0151 PV1. The secret this person's decision named, opened here.
     *
     * `key_unavailable` is answered as absence rather than thrown: a restored
     * database holds the seal and no key (ADR 0072 R6), and that is a Home
     * that cannot prove who it is rather than a Home that is broken. The
     * dispatch says so and the provider's own refusal names the rest.
     */
    const credentialFor = (
      row: PicoModelJobQueueRow,
      entry: PicoModelProviderEntry,
    ): string | undefined => {
      if (entry.credentialRef === undefined) {
        return undefined;
      }
      const seal = consent.credentialSealFor(
        row.entryId,
        row.picoIdentityFingerprintHex,
        entry.credentialRef,
      );
      if (seal === undefined) {
        return undefined;
      }
      const opened = modelProviderCredentials.open({
        seal: seal as PicoModelProviderCredentialSeal,
        entryId: row.entryId,
        picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
        credentialRef: entry.credentialRef,
      });
      return opened.status === 'ok' ? opened.secret : undefined;
    };

    /**
     * The entry this job may run on, or a settled row saying nobody said so.
     *
     * ADR 0138's posture: reaching outside is off until somebody says so, and
     * a queue that waited for a person to change their mind would be holding a
     * job against a decision already made. Asked per job rather than per
     * entry, because two jobs on one entry can belong to two people and only
     * one of them may have decided.
     */
    const entryFor = (row: PicoModelJobQueueRow): PicoModelProviderEntry | undefined => {
      const entry = consent.entryFor(row.entryId, row.picoIdentityFingerprintHex);
      if (entry === undefined) {
        queue.settle({ jobId: row.job.jobId, outcome: 'no_decision_for_this_entry', at });
      }
      return entry;
    };

    /**
     * The oldest job somebody decided for.
     *
     * Undecided rows are settled on the way past rather than ending the tick:
     * a person who queued two hundred reads and then withdrew would otherwise
     * cost the *other* residents one tick per row, and a queue that drained at
     * one settled refusal a minute is a queue that looks stuck.
     *
     * It terminates because every turn of this loop either settles a row - so
     * the next pick cannot return it again - or finds an entry and stops.
     */
    let first: PicoModelJobQueueRow | undefined;
    let firstEntry: PicoModelProviderEntry | undefined;
    while (firstEntry === undefined) {
      first = queue.next(nowMs, at);
      if (first === undefined) {
        return 0;
      }
      firstEntry = entryFor(first);
    }

    /**
     * ADR 0142 PE3. As many as the entry measured, from that entry's queue.
     *
     * The lanes in the runtime enforce the ceiling; this is what lets the
     * measured number mean anything at all. Before it, a two-lane provider
     * drained at exactly the rate of a one-lane one, because the sweep took a
     * single job per tick - the number was measured, stored, shown, and used
     * by nothing.
     *
     * Only this entry's jobs join the batch. Another provider's oldest job is
     * not this tick's business, and letting it stop the batch would make the
     * lane count depend on what else happens to be waiting.
     */
    const batch: Array<{ row: PicoModelJobQueueRow; entry: PicoModelProviderEntry }> = [
      { row: first!, entry: firstEntry },
    ];
    while (batch.length < firstEntry.measurement.capacity.concurrentJobs) {
      const more = queue.next(nowMs, at, {
        entryId: first!.entryId,
        excluding: batch.map((held) => held.row.job.jobId),
      });
      if (more === undefined) {
        break;
      }
      const entry = entryFor(more);
      if (entry !== undefined) {
        batch.push({ row: more, entry });
      }
      // An undecided one was settled just now, so it is no longer pending and
      // the next pick moves past it rather than round it.
    }

    const answered = await Promise.all(batch.map(async (held) => await runOne(held.row, held.entry)));
    return answered.reduce((total, one) => total + one, 0);
  };

  /**
   * ADR 0116 W1. Eine gestellte Frage wartet nicht auf den nächsten Takt.
   *
   * W1 begründet die *sofortige* Ablehnung damit, dass jemand dasteht: „a
   * person who asked a question deserves the answer now". Kam die Frage durch,
   * lag sie bis zum 2026-09-01 bis zu einer Minute in der Warteschlange,
   * während die Maschine daneben nichts tat - Befund B42 hat diese Spannung
   * gemessen und der Nutzer sie an diesem Tag entschieden.
   *
   * **Entprellt, und die Sperre ist der Grund, warum der Zeitgeber bleibt.**
   * Der Takt begrenzt, wie oft dieses Home gegen einen Beschleuniger läuft, der
   * beschäftigt sein kann; ein Aufruf je Frage nähme genau diese Grenze weg.
   * Also läuft höchstens einer, und der nächste erst nach der Sperre - was ein
   * Schwall Fragen kostet, ist damit ein Lauf je Fenster statt einer je Frage.
   *
   * **Nicht abgewartet**, denn die Antwort auf „frag das" ist die
   * Vorgangsnummer und nicht die Antwort des Modells; wer hier wartete, machte
   * aus einem Einreihen einen Anruf. Fehlschläge gehören dem Lauf und nicht
   * dem Fragenden: der Zeitgeber versucht es wieder.
   */
  const kickModelJobSweepDebounceMs = 1_000;
  let modelJobSweepRunning = false;
  let modelJobSweepAllowedAtMs = 0;
  const kickModelJobSweep = (): void => {
    const nowMs = Date.now();
    if (modelJobSweepRunning || nowMs < modelJobSweepAllowedAtMs) {
      return;
    }
    modelJobSweepRunning = true;
    modelJobSweepAllowedAtMs = nowMs + kickModelJobSweepDebounceMs;
    void sweepPicoModelJobs()
      .catch((error: unknown) => {
        app.log.warn(
          { reason: error instanceof Error ? error.message : 'failed' },
          'Model job sweep after a question did not complete.',
        );
      })
      .finally(() => {
        modelJobSweepRunning = false;
      });
  };

  app.decorate('picoSweepModelJobs', sweepPicoModelJobs);

  app.decorate('picoSweepLinkPushes', sweepPicoLinkPushes);

  /**
   * ADR 0049 with ADR 0118 O1. The queue drains on its own timer.
   *
   * Separate from the relay sweep rather than folded into it, because the two
   * wait on different things: a relay sweep waits on an operator that may be
   * unreachable, and this waits on an accelerator that may be busy. One timer
   * for both would make each one's slowest case the other's.
   *
   * It runs whether or not a relay is configured - a Home with no relay still
   * has a provider, and a queue that only drained when a relay existed would
   * be a coupling nobody meant.
   */
  const modelJobScheduler = startPicoPeriodicTaskScheduler({
    tasks: [{
      identifier: 'model-job-sweep',
      intervalMs: config.modelJobSweepIntervalMs ?? defaultPicoModelJobSweepIntervalMs,
    }],
    request: async () => {
      try {
        await sweepPicoModelJobs();
      } catch (error) {
        // A provider that is absent is the world failing, not this Home. The
        // row stays pending and the next tick tries again.
        app.log.warn(
          { reason: error instanceof Error ? error.message : 'failed' },
          'Model job sweep did not complete.',
        );
      }
    },
  });

  const linkRelaySweepScheduler = relayTransport === undefined ? undefined
    : startPicoPeriodicTaskScheduler({
      tasks: [{
        identifier: 'link-relay-sweep',
        intervalMs: config.linkRelaySweepIntervalMs ?? defaultPicoLinkRelaySweepIntervalMs,
      }],
      request: async () => {
        try {
          // Both halves of talking to a relay, on one timer: read what is
          // waiting, then say what is worth waking somebody for. Collecting
          // first because an answer already at the operator is older than
          // anything this Home is about to notice.
          await sweepPicoLinkRelayMailboxes();
          await sweepPicoLinkPushes();
        } catch (error) {
          // An operator that cannot be reached is the world failing, not this
          // Home. Nothing was acknowledged, so the next sweep tries again.
          app.log.warn(
            { reason: error instanceof Error ? error.message : 'failed' },
            'Relay sweep did not complete.',
          );
        }
      },
    });

  app.decorate('picoSweepLinkRelayMailboxes', sweepPicoLinkRelayMailboxes);

  /**
   * ADR 0143 DP8's other caller. A person asking for this now takes the same
   * path with `asked: true`, which is the distinction CO4 draws - not a
   * shortcut around the decision, the same decision with one input changed.
   *
   * Exposed rather than internal because it is the function a "fetch now"
   * surface calls. That it also lets a test drive the sweep without waiting
   * six hours is a consequence, not the reason.
   */
  app.decorate('picoSweepDepotFetches', sweepPicoDepotFetches);

  app.addHook('onClose', async () => {
    clearInterval(websocketKeepalive);
    clearInterval(retentionSweep);
    timeBoundScheduler.stop();
    depotFetchScheduler.stop();
    linkRelaySweepScheduler?.stop();
    modelJobScheduler.stop();
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

  // ADR 0119 Q4. Registered before the access-class hook so it runs first:
  // a request refused for concurrency should cost no session lookup and no
  // credential comparison.
  const foundationInFlight = new PicoConcurrencyCap(
    config.foundationMaxInFlight ?? defaultPicoFoundationMaxInFlight,
  );
  app.addHook('onRequest', async (request, reply) => {
    // A request forwarded by the Link intake listener already spent that
    // listener's budget. Charging it here too would let an intake flood
    // exhaust the surface the person's own device uses, which is the coupling
    // the separate counters exist to break.
    if ((request.raw as { [picoLinkIntakeRequestMark]?: true })[picoLinkIntakeRequestMark]) {
      return;
    }
    if (!foundationInFlight.acquire()) {
      return reply.code(503).send({ error: 'Busy.' });
    }
    // `close` on the raw response rather than `onResponse`: an aborted
    // connection never reaches `onResponse`, and a counter that only
    // decrements on success leaks upward to a permanent 503.
    reply.raw.once('close', () => {
      foundationInFlight.release();
    });
  });

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
  // ADR 0152 SE6 with ADR 0104. Which machine computes for this Home is Home
  // infrastructure the operator configures, like a retention policy - the
  // per-person half of ADR 0152 (consent, allowance) is a different surface
  // and is not this route.
  accessClasses.register('GET', '/api/model/providers', 'host-admin');
  // ADR 0152, and ADR 0087's line held at a route. These are a *person's*
  // decisions about their own words, so the class admits any authenticated
  // principal and the handler then refuses the operator by name. Host
  // administration installs and backs up; it does not decide on somebody's
  // behalf whether their memory may leave the house.
  // ADR 0143 DP1 with ADR 0104. Attaching a corpus is a person's decision
  // about their own material - two residents attach different libraries - so
  // the class admits any authenticated principal and the handler refuses the
  // operator by name, exactly as the model decision does.
  accessClasses.register('POST', '/api/depot/attachments', 'authenticated');
  // ADR 0116 W5. Keeping what a read produced is an explicit write by the
  // person whose material it is - never a consequence of the read finishing.
  accessClasses.register('POST', '/api/model/jobs/:jobId/keep', 'authenticated');
  accessClasses.register('GET', '/api/model/providers/mine', 'authenticated');
  accessClasses.register('POST', '/api/model/providers/:entryId/decision', 'authenticated');
  accessClasses.register('DELETE', '/api/model/providers/:entryId/decision', 'authenticated');
  accessClasses.register('POST', '/api/model/providers/:entryId/narrowing', 'host-admin');
  // ADR 0104 S3. One answer for the instance rather than one per person - two
  // residents cannot have their shared storage encrypted and not - so it sits
  // where a retention policy does. What ADR 0104 objected to was the decision
  // living in *host configuration*, not who sets it: this one is Pico's, moves
  // with the Home, and is reachable from a Pico surface.
  // ADR 0104 S5 with ADR 0031. One account per Home, so one answer for the
  // instance - and it survives moving the Home, which is what makes it Pico's
  // rather than the environment's.
  accessClasses.register('GET', '/api/link/relay-identity', 'host-admin');
  accessClasses.register('POST', '/api/link/relay-identity', 'host-admin');
  accessClasses.register('GET', '/api/memory/encryption', 'host-admin');
  accessClasses.register('POST', '/api/memory/encryption', 'host-admin');
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
  // ADR 0127 M3 with ADR 0104: activation is a durable decision a person makes
  // about their own Pico, so it is an authenticated Pico operation rather than
  // a host configuration option. Host-admin because it changes what the Home
  // does, and `host-admin` is the class that already means exactly that.
  accessClasses.register('POST', '/api/home/modules', 'host-admin');
  // ADR 0118 O1. A surface says it told the person. Authenticated, because
  // clearing someone's outstanding promise is a claim about their life.
  accessClasses.register('POST', '/api/memory/time-bound-entries/:memoryItemId/acknowledge', 'authenticated');
  // ADR 0129 SR6. Consent to record is a decision about the person's own life,
  // so it carries the same class as the other durable decisions about this
  // Home rather than a lighter one.
  accessClasses.register('POST', '/api/home/modules/capture', 'host-admin');
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

  /**
   * ADR 0127 M4. Where a module's outstanding promises come from.
   *
   * A map rather than a branch in the handler, and rather than a method every
   * module has to implement: a module with nothing outstanding simply has no
   * entry, so nothing here grows a per-module `if`. The core supplies the
   * data - custody is its - and the module says which of it is a promise.
   *
   * This is runtime wiring, which is exactly the part ADR 0127 leaves with the
   * runtime that hosts the modules.
   */
  const moduleCommitmentReaders: Partial<Record<
    PicoModuleIdentifier,
    () => readonly PicoModuleCommitment[]
  >> = {
    calendar: () => picoCalendarStandingCommitments(store.picoTimeBoundEntries(Number.MAX_SAFE_INTEGER)),
  };

  function readModuleCommitments(
    identifier: PicoModuleIdentifier,
  ): readonly PicoModuleCommitment[] {
    return moduleCommitmentReaders[identifier]?.() ?? [];
  }

  function readModuleActivation(): ReturnType<typeof toPicoModuleActivationView> {
    return toPicoModuleActivationView({
      manifests: shippedModuleManifests,
      active: store.picoActiveModules(),
      // ADR 0129 SR6. Shown beside activation because they are different
      // questions: whether a feature exists, and whether Pico may write down
      // where somebody goes.
      capturing: store.picoCapturingModules(),
    });
  }

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
      // ADR 0119 Q5. Read per call, like the pressure it reports: a condition
      // cached at boot would tell the person about a disk that was full an hour
      // ago, or stay silent about one that filled since.
      storage: store.storageCondition(),
      // ADR 0127 M3. Read per call for the same reason the storage condition
      // is: a state cached at boot would keep reporting a module the person
      // switched off ten minutes ago.
      modules: readModuleActivation(),
    };
  }

  app.get('/api/system/status', async (_request, reply) => {
    return sendNoStore(reply, readSystemStatus());
  });

  /**
   * ADR 0129 SR6. Whether a module may record.
   *
   * A separate decision from activation, and separate on purpose: someone who
   * turns capture off for an afternoon still wants to be told where they
   * parked this morning, and switching the module off would take that away
   * too. Collapsing the two would make "stop recording" and "remove the
   * feature" the same act.
   *
   * **Off by default**, which is the opposite of activation and for the
   * opposite reason. A Home whose calendar was off would look broken; a Home
   * that began writing down its person's movements because they installed it
   * would not be broken, it would be wrong.
   *
   * Switching capture off records the decision and stops nothing else: what
   * was already recorded stays under custody, because a module being off must
   * never mean nobody is responsible for what it holds. Erasing is a separate
   * act, through the paths that already exist.
   */
  app.post('/api/home/modules/capture', async (request, reply) => {
    const body = request.body as { identifier?: unknown; capturing?: unknown } | undefined;
    const identifier = body?.identifier;
    const capturing = body?.capturing;

    if (typeof identifier !== 'string'
      || !shippedModuleManifests.some((manifest) => manifest.identifier === identifier)) {
      return sendNoStore(reply.code(400), { error: 'identifier must name a shipped module.' });
    }
    if (typeof capturing !== 'boolean') {
      return sendNoStore(reply.code(400), { error: 'capturing must be a boolean.' });
    }

    const decision = resolvePicoModuleCapture({
      manifests: shippedModuleManifests,
      capturing: store.picoCapturingModules(),
      request: { identifier: identifier as PicoModuleIdentifier, capturing },
    });

    if (decision.outcome === 'unchanged') {
      return sendNoStore(reply, { modules: readModuleActivation() });
    }

    store.setPicoModuleCapture({
      identifier: identifier as PicoModuleIdentifier,
      capturing,
      decidedAt: new Date().toISOString(),
    });

    const event = factory.create({
      deviceId: config.deviceId,
      type: 'home.module_capture_changed',
      // Content-free: which module, and which way.
      payload: { identifier, capturing },
    });
    store.append(event);
    broadcast(event);

    return sendNoStore(reply, { modules: readModuleActivation() });
  });

  /**
   * ADR 0118 O1. The delivery half: a surface confirms the person was told.
   *
   * Only this sets `raised_at`. The Home cannot observe that a notification
   * was shown, and an entry it cleared on its own say-so would be a promise
   * nobody kept - so the one party that knows is the one that reports.
   *
   * Idempotent, and a second acknowledgement is not an error. A device that
   * retried after a dropped response should not have to reason about whether
   * it already succeeded.
   */
  app.post('/api/memory/time-bound-entries/:memoryItemId/acknowledge', async (request, reply) => {
    const { memoryItemId } = request.params as { memoryItemId: string };
    const acknowledged = store.markPicoTimeBoundEntryRaised({
      memoryItemId,
      raisedAt: new Date().toISOString(),
    });
    return sendNoStore(reply, { memoryItemId, acknowledged });
  });

  /**
   * ADR 0127 M3. Switching a module on or off.
   *
   * The decision itself is a pure function in the protocol, so the rule about
   * cascading and refusal is one expression rather than whatever this route
   * happened to do. What lives here is what only a runtime can do: authorize,
   * persist and record.
   *
   * **Deactivation stops behaviour and touches no stored data.** Nothing below
   * deletes, shreds or rewrites anything: items a disabled module wrote stay
   * memory items under core custody, and retention, shredding and the ADR 0119
   * Q5 ceilings keep running over them. A module being off must never mean
   * nobody is responsible.
   */
  app.post('/api/home/modules', async (request, reply) => {
    const body = request.body as { identifier?: unknown; active?: unknown } | undefined;
    const identifier = body?.identifier;
    const active = body?.active;

    if (typeof identifier !== 'string'
      || !shippedModuleManifests.some((manifest) => manifest.identifier === identifier)) {
      return sendNoStore(reply.code(400), { error: 'identifier must name a shipped module.' });
    }
    if (typeof active !== 'boolean') {
      return sendNoStore(reply.code(400), { error: 'active must be a boolean.' });
    }

    const decision = resolvePicoModuleActivation({
      manifests: shippedModuleManifests,
      active: store.picoActiveModules(),
      request: { identifier: identifier as PicoModuleIdentifier, active },
    });

    if (decision.outcome === 'refused_dependents') {
      // Named, not merely refused. A person who turned off one thing should not
      // have to guess which of several others is holding it on.
      return sendNoStore(reply.code(409), {
        error: 'pico_module_has_active_dependents',
        dependents: decision.dependents,
      });
    }

    if (decision.outcome === 'unchanged') {
      // No record and no event: a log that filled with no-ops would bury the
      // changes that mattered. Nothing is being dropped either, so there is
      // nothing to say.
      return sendNoStore(reply, { modules: readModuleActivation(), dropped: [] });
    }

    /**
     * ADR 0127 M4. What will not happen, gathered **before** the change so it
     * describes what was there rather than what is left.
     *
     * It does not gate the stop. ADR 0128 is explicit that deactivating an
     * effect-bearing module has to stay immediate - stopping the world
     * changing is sometimes the point - so this is told in the posture ADR
     * 0119 Q5 uses for storage pressure: said while there is still room to
     * act, never as a confirmation step standing in the way. Re-enabling
     * restores everything, because deactivation dropped no data (M3).
     */
    const dropped = decision.disabled
      .map((identifier) => toPicoModuleDeactivationStatement({
        module: identifier,
        commitments: readModuleCommitments(identifier),
      }))
      .filter((statement) => statement.total > 0);

    const decidedAt = new Date().toISOString();
    store.setPicoModuleActivation({
      decidedAt,
      changes: [
        // ADR 0139 AC4: what is switched on carries what is being consented
        // to, recorded in the same transaction so the two cannot part.
        ...decision.enabled.map((entry) => ({
          identifier: entry,
          active: true,
          effects: shippedModuleManifests
            .find((manifest) => manifest.identifier === entry)?.effects ?? [],
        })),
        ...decision.disabled.map((entry) => ({
          identifier: entry,
          active: false,
          effects: [],
        })),
      ],
    });

    const event = factory.create({
      deviceId: config.deviceId,
      type: 'home.module_activation_changed',
      payload: {
        // Content-free: identifiers and a direction, nothing about what the
        // modules hold.
        enabled: [...decision.enabled],
        disabled: [...decision.disabled],
      },
    });
    store.append(event);
    broadcast(event);

    return sendNoStore(reply, { modules: readModuleActivation(), dropped });
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

  /**
   * ADR 0080's lifecycle statement, shared by the Foundation route and the
   * Link relay.
   *
   * It was the route's own body until ADR 0130 E5 went looking for how a
   * person ends a membership from their own device and found there was no
   * way: `home.authority.submit` carried the credential and not the statement
   * that ends it. One implementation, two doors - a second copy behind the
   * Link path would be a second set of rules about who may remove somebody.
   */
  function recordHomeMembershipLifecycle(body: unknown): FoundationOperationResult {
    const record = (body ?? {}) as PicoHomeMembershipLifecycleRecord;
    const recorded = store.recordPicoHomeMembershipLifecycle({ sodium, record });

    if (!recorded.ok) {
      return {
        statusCode: membershipFailureStatus(recorded.reason),
        body: { error: recorded.reason },
      };
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

    return {
      statusCode: 200,
      body: { membership: recorded.membership as unknown as Record<string, unknown> },
    };
  }

  /**
   * ADR 0086 mit ADR 0130 E5. Das Schreibrecht als Autoritätsressource.
   *
   * **Es fehlte in dieser Liste**, und das war die einzige echte Lücke von
   * vieren, die am 2026-08-26 wie vier aussahen: Domäne, Leser-Grant,
   * Leser-Lebenslauf, Rotation und Frische-Nachweis gehen längst durch diese
   * eine Tür. Ein eigener Vorgang je Aufzeichnung wäre eine zweite Tür in
   * eine geschlossene Liste gewesen, die ADR 0107 absichtlich klein hält.
   */
  function recordReaderCustodyWriterGrant(body: unknown): FoundationOperationResult {
    const result = readerCustody.recordWriterGrant(
      body as PicoReaderCustodyWriterGrantRecord,
    );
    if (!result.ok) {
      return {
        statusCode: readerCustodyFailureStatus(result.reason),
        body: { error: result.reason },
      };
    }
    return {
      statusCode: result.inserted ? 201 : 200,
      body: { writerGrant: result.value as unknown as Record<string, unknown> },
    };
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

  /**
   * ADR 0082 mit ADR 0130 E5. Einen Lesezugang beenden, von dem Gerät aus,
   * das ihn vergeben hat.
   *
   * Dieselbe Asymmetrie, die E5 für Mitgliedschaften benannt hat, eine
   * Ressource weiter: `reader_custody_reader_grant` ging über Link, das
   * Beenden nicht. Jemand konnte also einen Lesezugang von seinem eigenen
   * Gerät aus vergeben und brauchte danach eine Foundation-Sitzung, um ihn zu
   * widerrufen - was in der Praxis heißt, ihn nicht widerrufen zu können.
   *
   * Der Speicheraufruf ist derselbe, den die Foundation-Route macht. Was hier
   * anders ist, ist nur der Kanal, über den er erreicht wird.
   */
  function recordReaderCustodyReaderGrantLifecycle(
    body: unknown,
  ): FoundationOperationResult {
    const result = readerCustody.recordReaderGrantLifecycle(
      body as PicoReaderCustodyReaderGrantLifecycleRecord,
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
      /**
       * ADR 0130 E5's first finding: a membership could be given from a
       * person's own device and never ended from one. The Foundation route
       * has existed since ADR 0080; over Link there was no way to reach it,
       * so somebody could be let in and not let out.
       */
      case 'membership_lifecycle':
        return recordHomeMembershipLifecycle(args.record);
      case 'reader_key_freshness_checkpoint':
        return publishReaderKeyFreshnessCheckpoint(args.record);
      case 'reader_custody_domain':
        return recordReaderCustodyDomain(args.record);
      case 'reader_custody_writer_grant':
        return recordReaderCustodyWriterGrant(args.record);
      case 'reader_custody_reader_grant':
        return await recordReaderCustodyReaderGrant(args.record);
      case 'reader_custody_reader_grant_lifecycle':
        return recordReaderCustodyReaderGrantLifecycle(args.record);
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
      /**
       * ADR 0130 E4. Who lives here, to the one identity that decides it.
       *
       * The Foundation has answered this since ADR 0080; over Link it was
       * write-only, so a Home Host Pico could admit somebody from their own
       * device and then had no way to see who was in. The caller is already
       * held to being the current Home Host Pico by the case above, which is
       * the same test the Foundation route's `home-authority-relay` class
       * applies - this adds a reader, not an authority.
       */
      case 'memberships':
        return {
          statusCode: 200,
          body: { memberships: store.picoHomeMemberships() as unknown as Record<string, unknown>[] },
        };
      /**
       * ADR 0082 mit ADR 0130 E4, und dieselbe Asymmetrie eine Ressource
       * weiter.
       *
       * `home.authority.submit` nimmt seit Langem `reader_custody_reader_grant`
       * entgegen: eine Person kann von ihrem eigenen Gerät aus jemandem das
       * Lesen einer Domäne erlauben. Zurücklesen konnte sie es nicht - dafür
       * brauchte es eine Foundation-Sitzung. Wer Zugang vergeben, aber nicht
       * nachsehen kann, wem er ihn vergeben hat, hat eine Fläche, die ihre
       * eigene Arbeit nicht prüfen kann; genau das steht bei `memberships`
       * eine Zeile höher, und es gilt hier unverändert.
       *
       * Autorität schafft das keine: der Fall darüber hält den Aufrufer schon
       * auf den aktuellen Home Host Pico fest, dieselbe Prüfung, die die
       * Foundation-Route über `home-authority-relay` anwendet. Das hier fügt
       * einen Leser hinzu, keine Befugnis.
       */
      case 'reader_custody_reader_grants':
        return {
          statusCode: 200,
          body: {
            readerGrants: readerCustody.readerGrants() as unknown as Record<string, unknown>[],
          },
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
  /**
   * ADR 0107 with ADR 0149. What a verified Link request actually does, in one
   * place both callers reach.
   *
   * It was the body of the route's callback until the relay sweep needed the
   * same operations. Two dispatches would have been two lists of what this
   * Home offers remotely, and ADR 0107's rule that remote capability is opt-in
   * *per operation* only means something while there is one list to opt into.
   *
   * `scheduleAfterReply` is the one thing the route knows and this does not:
   * ADR 0115 U3 defers a host-key custody swap until the reply is sealed under
   * the retiring key, so the caller decides when "after the reply" is.
   */
  const dispatchPicoLinkOperation = async (
    operation: PicoLinkDirectOperation,
    args: Record<string, unknown>,
    principal: PicoLinkDirectPrincipal,
    scheduleAfterReply: (run: () => void) => void,
  ): Promise<PicoLinkDirectExecution> => {
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
        // ADR 0119 Q5 with ADR 0107. Opted in deliberately: the person's own
        // device is where the storage condition has to be visible, because a
        // refusal met with no warning is exactly what Q5 exists to prevent and
        // the Foundation UI is not where the person is.
        //
        // Authorized senders only - it is Home state, not public. The reply
        // carries the state and the reason classes and stops there: row counts
        // and free bytes would let a peer infer how much the Home holds and
        // how fast it grows, and no decision the person makes changes with
        // them.
        /**
         * ADR 0152. What this device's person may reach, and their own answer
         * to it - never another resident's.
         *
         * Two people's decisions about the same box are two private facts. A
         * device asking on behalf of its own person has no business learning
         * what the other decided, so the read is scoped by the sender's
         * identity rather than filtered afterwards.
         *
         * **No throughput figure travels, and the canonical encoder is why it
         * was noticed rather than why it is absent.** ADR 0107's response is
         * canonical JSON with no floating point, so `26.31 tok/s` refused at
         * the boundary - and the refusal was right for a second reason: this
         * view is ADR 0152 SE1's simple layer on the person's own device, and
         * a rate is the layer behind it. The numbers stay where the
         * measurement is.
         */
        /**
         * ADR 0082 with ADR 0087. The device issues; this Home records.
         *
         * The same store call the Foundation relay route makes, reached from
         * the channel a person's own device speaks - so the grant that lets
         * somebody read their own memory no longer needs a second party with
         * a Foundation session to carry it.
         *
         * **Nothing here is authority.** The record arrives signed by the Home
         * Host Pico's identity key and `recordPicoHomeDomainReadGrant` refuses
         * it unless that signature verifies against the founding record, the
         * reader is an active member, and the domain is one this Home actually
         * holds. A sender who forged any of it gets the same refusal as a
         * sender who mistyped it.
         */
        case 'home.domain.read-grant.submit': {
          if (principal === undefined) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          let statement: Omit<PicoHomeDomainReadGrantRecord, 'createdAt'>;
          try {
            statement = parsePicoHomeDomainReadGrantStatement(args);
          } catch (error) {
            return {
              outcome: 'invalid_arguments',
              result: { refusal: error instanceof Error ? error.message : 'refused' },
            };
          }
          const recorded = store.recordPicoHomeDomainReadGrant({
            sodium,
            record: { ...statement, createdAt: new Date().toISOString() },
          });
          if (!recorded.ok) {
            return { outcome: 'invalid_arguments', result: { refusal: recorded.reason } };
          }
          if (recorded.inserted) {
            appendServerEvent('home.domain_read_granted', {
              grantId: recorded.grant.grantId,
              privacyDomain: recorded.grant.privacyDomain,
              readerPicoIdentityFingerprintHex: recorded.grant.readerPicoIdentityFingerprintHex,
            });
          }
          return {
            outcome: 'ok',
            result: {
              grantId: recorded.grant.grantId,
              privacyDomain: recorded.grant.privacyDomain,
              status: recorded.grant.status,
            },
          };
        }
        /**
         * ADR 0116 W1. The requesting side: a person asks about what their
         * Home remembers.
         *
         * **Four refusals before any words are assembled**, and each names
         * something the person can act on rather than something they have to
         * guess at: a domain they may not read, a provider nobody decided on,
         * a question this Home will not carry, and material that needs a wider
         * allowance than their provider has.
         *
         * The last one is the interesting one. Nothing here chooses an
         * allowance - `picoModelJobAllowanceFor` reads the origins of what was
         * actually included, so asking over your own notes needs only the live
         * turn and asking over a housemate's note needs a provider that proved
         * who it is (ADR 0151 PV1). The refusal happens here, before anything
         * is queued, rather than as a job that fails at dispatch: a person who
         * asked a question deserves the answer now.
         */
        case 'home.recall.ask': {
          if (principal === undefined
            || typeof args.privacyDomain !== 'string'
            || typeof args.question !== 'string'
            || Object.keys(args).length !== 2) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          // ADR 0077. "May use this Home" and "may read this domain" are two
          // authorities, and the sealed channel only answered the first.
          if (!readership.mayRead({
            sessionDigest: 'pico-link-direct',
            picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
          }, args.privacyDomain)) {
            // The same silence ADR 0077 C4 uses everywhere else: telling "you
            // may not" apart from "there is no such domain" makes this a
            // grant oracle.
            return { outcome: 'invalid_arguments', result: { refusal: 'not_readable' } };
          }

          const consent = store.picoModelProviderConsent();
          const chosen = pickPicoDecidedModelEntry(
            consent.listFor(principal.picoIdentityFingerprintHex)
              .map((entry) => entry.entryId),
          );
          if ('refusal' in chosen) {
            return { outcome: 'invalid_arguments', result: { refusal: chosen.refusal } };
          }
          const entry = consent.entryFor(chosen.entryId, principal.picoIdentityFingerprintHex)!;

          const candidates = store.memory()
            .recentInDomain(args.privacyDomain, maxPicoRecallCandidates)
            .flatMap((item: MemoryItem) => {
              const recallItem = picoRecallItemOf(item);
              return recallItem === undefined ? [] : [recallItem];
            });
          const plan = picoRecallPlan({
            question: args.question,
            candidates,
            contextTokens: entry.measurement.capacity.contextTokens,
          });

          const jobId = `job_recall_${randomBytes(16).toString('hex')}`;
          let job: PicoModelJob;
          try {
            job = picoRecallJob({
              jobId,
              question: args.question,
              items: plan.included,
              nowMs: Date.now(),
            });
          } catch (error) {
            return {
              outcome: 'invalid_arguments',
              result: { refusal: error instanceof Error ? error.message : 'refused' },
            };
          }

          const refusal = picoModelJobRefusal(job, entry);
          if (refusal !== null) {
            return { outcome: 'invalid_arguments', result: { refusal } };
          }

          store.picoModelJobQueue().enqueue({
            job,
            picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
            entryId: chosen.entryId,
            at: new Date().toISOString(),
            kind: 'recall',
            recallContext: {
              privacyDomain: args.privacyDomain,
              memoryItemIds: plan.included.map((item) => item.memoryItemId),
            },
          });
          // After the row exists and never before it: a refused question must
          // not cost a run, and there would be nothing for it to find.
          kickModelJobSweep();

          return {
            outcome: 'ok',
            result: {
              jobId,
              // What the answer will have been formed from, said before it
              // exists: ADR 0119 Q5's posture, so "answered from four of your
              // notes, and there were nine" is a fact rather than a surprise.
              included: plan.included.length,
              omitted: plan.omitted,
              carries: job.carries,
            },
          };
        }
        /**
         * ADR 0116 W1. The questions this person asked, and what came back.
         */
        case 'home.recall.read': {
          if (Object.keys(args).length !== 0 || principal === undefined) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          return {
            outcome: 'ok',
            result: {
              recalls: store.picoModelJobQueue()
                .recallsFor(principal.picoIdentityFingerprintHex),
            } as unknown as Record<string, unknown>,
          };
        }
        /**
         * ADR 0071 with ADR 0116 W5. One memory item, unmade by the person who
         * made it.
         *
         * **Only what they kept, and only theirs.** The item is found through
         * the job that holds it, scoped to the requesting identity, which is
         * what keeps this from becoming a way to name any memory item and see
         * whether it exists - ADR 0077 C4's rule that a refusal must not be an
         * inventory. The domain comes off that row rather than from the
         * caller, so a caller cannot go looking in a domain by guessing.
         *
         * Deleting nulls the content and drops the key envelope; the
         * `memory.tombstone` event is what makes it survive a restore, because
         * ADR 0070's reconcile re-applies recorded deletions at boot. Without
         * the event a backup could resurrect the sentence somebody deleted.
         *
         * The job keeps its answer. What was taken back is the memory, not the
         * record that an answer was once given - and the line then offers to
         * keep it again, which is the honest state: they have one and did not
         * keep it.
         */
        case 'home.memory.forget': {
          if (principal === undefined || typeof args.memoryItemId !== 'string') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const holding = store.picoModelJobQueue().jobKeepingMemoryItem({
            picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
            memoryItemId: args.memoryItemId,
          });
          if (holding === undefined) {
            return { outcome: 'invalid_arguments', result: { refusal: 'not_kept_by_you' } };
          }
          const removed = store.memory()
            .deleteInDomain(args.memoryItemId, holding.privacyDomain);
          if (removed !== 'deleted') {
            return { outcome: 'invalid_arguments', result: { refusal: removed } };
          }
          const tombstone = factory.create({
            deviceId: config.deviceId,
            type: 'memory.tombstone',
            payload: {
              memoryItemId: args.memoryItemId,
              privacyDomain: holding.privacyDomain,
              reason: 'forgotten_by_person',
            },
          });
          store.append(tombstone);
          broadcast(tombstone);
          store.picoModelJobQueue().markKept({
            jobId: holding.jobId,
            memoryItemId: null,
            privacyDomain: null,
          });
          return { outcome: 'ok', result: { forgotten: true } };
        }
        /**
         * ADR 0049 mit ADR 0071. Eine Person nimmt einen Austausch zurück.
         *
         * `home.memory.forget` hebt die *Erinnerung* auf, die aus einer
         * Antwort behalten wurde. Bis heute gab es nichts, was den Austausch
         * selbst zurücknimmt - Frage und Antwort standen weiter in der
         * Recall-Historie, im Klartext, und ein Vergessen-Knopf daneben hob
         * nur die Notiz auf. Zwei Handlungen, von denen es eine gab.
         *
         * Die Zeile bleibt als Handhabe für ein behaltenes Item; geleert
         * werden die Worte. Der Vermerk ist inhaltsfrei: welche Jobkennung,
         * und sonst nichts - ein Eintrag, der die Frage aufbewahrte, wäre die
         * Kopie, die das Vergessen aufhebt.
         */
        case 'home.recall.forget': {
          if (principal === undefined || typeof args.jobId !== 'string') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const forgotten = store.picoModelJobQueue().forgetRecall({
            picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
            jobId: args.jobId,
            at: new Date().toISOString(),
          });
          if (forgotten !== 'forgotten') {
            return { outcome: 'invalid_arguments', result: { refusal: forgotten } };
          }
          const record = factory.create({
            deviceId: config.deviceId,
            type: 'memory.recall_forgotten',
            payload: { jobId: args.jobId },
          });
          store.append(record);
          broadcast(record);
          return { outcome: 'ok', result: { forgotten: true } };
        }
        /**
         * ADR 0116 W5. One answer becomes a memory item, because a person said
         * so.
         *
         * **The derivation is real rather than stated.** `createDerived`
         * resolves every source from the store and takes the lowest origin
         * among them, so an answer formed partly from a housemate's note is
         * kept as `external_content` and not as something Pico knows - and an
         * answer whose sources have since been deleted cannot be kept at all,
         * because there is nothing left to derive it from.
         */
        case 'home.recall.keep': {
          if (principal === undefined || typeof args.jobId !== 'string') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          /**
           * ADR 0126 P3. Which of this person's devices released it.
           *
           * **Claimed by the device and checked against the registry**, not
           * taken on trust. A device can only ever name one of its own
           * identity's presences, because the request is already authenticated
           * as that identity and the lookup is scoped to it - so the worst a
           * lying client achieves is misattributing to a sibling device it
           * already knows about. That residual is smaller than the one it
           * replaces, which was a record that never said where anything came
           * from.
           *
           * Absent when the device did not name one, and absent when it named
           * a presence this identity does not have. Inventing a value would
           * put a device in an audit trail that never said it was there.
           */
          const releasedBy = typeof args.presenceId === 'string'
            && store.picoPresenceRegistry()
              .forIdentity(principal.picoIdentityFingerprintHex, Date.now())
              .some((presence) => presence.presenceId === args.presenceId)
            ? args.presenceId
            : undefined;
          const kept = store.picoModelJobQueue().recallKeptView(args.jobId);
          if (kept === undefined
            || kept.picoIdentityFingerprintHex !== principal.picoIdentityFingerprintHex) {
            return { outcome: 'invalid_arguments', result: { refusal: 'not_found' } };
          }
          if (kept.outcome !== 'answered' || kept.values === undefined) {
            return { outcome: 'invalid_arguments', result: { refusal: 'no_answer' } };
          }
          if (kept.memoryItemIds.length === 0) {
            // An answer formed from nothing is not a derivation, and keeping it
            // would put a sentence in somebody's memory with no source to be
            // wrong about.
            return { outcome: 'invalid_arguments', result: { refusal: 'nothing_to_derive_from' } };
          }
          const valueOf = (name: string): unknown =>
            (kept.values as Array<{ name: string; value: unknown }>)
              .find((value) => value.name === name)?.value;
          const answer = valueOf('answer');
          if (typeof answer !== 'string') {
            return { outcome: 'invalid_arguments', result: { refusal: 'no_answer' } };
          }
          if (valueOf('found_in_memory') === false) {
            /**
             * ADR 0117 X2's declared value, used. The reader said the material
             * does not answer the question, so what would be kept is a
             * sentence about an absence - and stored beside real notes it
             * reads as a finding.
             *
             * The window already declines to offer the button here. That was
             * not enough: a rule a surface enforces is a rule anything else
             * reaching this operation walks past, and the surface is the half
             * a person can replace.
             */
            return { outcome: 'invalid_arguments', result: { refusal: 'nothing_was_found' } };
          }
          const memoryItemId = `mem_recall_${randomBytes(16).toString('hex')}`;
          try {
            const memory = store.memory();
            /**
             * ADR 0116 W2/W3, and the correction a plain derivation does not
             * make.
             *
             * A derivation takes the lowest class among its sources - and over
             * the person's own notes that class is `person_present`, which
             * would file a model's sentence as the person speaking. W3 refuses
             * exactly that: output from a context is never an instruction, or
             * a read of a stranger's mail re-enters as something that may
             * instruct. So the answer boundary's rule applies here too.
             */
            const derived = memory.derivedOriginFor(kept.privacyDomain, kept.memoryItemIds);
            /**
             * ADR 0126 P3. Through the crossing rather than straight into the
             * store, and the difference is a record: this is a device's
             * derived sentence becoming something the identity keeps, which is
             * the one act ADR 0126 calls explicit *and* audited. It was
             * explicit and unaudited until this went through the door.
             */
            const crossed = crossPicoStateBoundary({
              store,
              kind: 'recall_answer',
              ...(releasedBy === undefined ? {} : { presenceId: releasedBy }),
              privacyDomain: kept.privacyDomain,
              owner: `pico:identity:${principal.picoIdentityFingerprintHex}`,
              controller: `pico:identity:${principal.picoIdentityFingerprintHex}`,
              contentType: 'text/plain',
              content: answer,
              origin: derived === 'person_present' ? 'own_pico' : derived,
              sourceCount: kept.memoryItemIds.length,
              deviceId: config.deviceId,
              memoryItemId,
              appendEvent: ({ type, payload }) => {
                const crossingEvent = factory.create({
                  deviceId: config.deviceId,
                  type,
                  payload,
                });
                store.append(crossingEvent);
                broadcast(crossingEvent);
              },
            });
            if (!crossed.ok) {
              return { outcome: 'invalid_arguments', result: { refusal: crossed.refusal } };
            }
            /**
             * ADR 0071. The job now names what it became, so it can be undone.
             *
             * Written here rather than derived later: the identifier was minted
             * a few lines up and handed back once, and nothing kept it - which
             * is why a person could make a memory and never unmake one.
             */
            store.picoModelJobQueue().markKept({
              jobId: args.jobId,
              memoryItemId,
              privacyDomain: kept.privacyDomain,
            });
          } catch (error) {
            return {
              outcome: 'invalid_arguments',
              result: { refusal: error instanceof Error ? error.message : 'refused' },
            };
          }
          return { outcome: 'ok', result: { memoryItemId } };
        }
        /**
         * ADR 0126 P2. A presence announcing itself and what its runtime can
         * do - one operation for registering and refreshing, because they are
         * the same statement.
         *
         * The identity comes from the signed request rather than the body: a
         * presence belongs to the identity that spoke, and a field naming one
         * would be a field somebody could put a different identity in.
         */
        case 'home.presence.announce': {
          if (principal === undefined) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          let announced;
          try {
            announced = store.picoPresenceRegistry().announce({
              picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
              announcement: args,
              at: new Date().toISOString(),
            });
          } catch (error) {
            // The parser's name travels: an unknown affordance, an unknown
            // field and a bad id are three different things for a runtime to
            // fix, and one refusal for all of them would send it guessing.
            return {
              outcome: 'invalid_arguments',
              result: { refusal: error instanceof Error ? error.message : 'invalid_presence' },
            };
          }
          if (!announced.ok) {
            return { outcome: 'invalid_arguments', result: { refusal: announced.refusal } };
          }
          return {
            outcome: 'ok',
            result: announced.presence as unknown as Record<string, unknown>,
          };
        }
        /** ADR 0126 P2. The person's own devices, as their Home knows them. */
        case 'home.presence.read': {
          if (Object.keys(args).length !== 0 || principal === undefined) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          return {
            outcome: 'ok',
            result: {
              presences: store.picoPresenceRegistry()
                .forIdentity(principal.picoIdentityFingerprintHex, Date.now()),
            } as unknown as Record<string, unknown>,
          };
        }
        /**
         * ADR 0126 P6, generalising ADR 0129 SR6. The person's word about what
         * one of their devices may be used for.
         *
         * A separate operation from announcing, because they are different
         * parties saying different things: a runtime states what it can do,
         * and a person states what it may. One operation would let a runtime
         * send its own switch.
         *
         * Absent `affordance` means the whole presence, which is a different
         * statement from switching each of its affordances - "not this device"
         * keeps meaning that after the device gains a microphone.
         */
        /**
         * ADR 0138 CO3/CO4. What is attached, and whether it may reach.
         *
         * The list carries no slots, no coverage and no privacy domain - a
         * person deciding whether something may spend their money needs to
         * know what it is and what it may do, not how it is wired.
         */
        case 'home.suppliers.read': {
          if (Object.keys(args).length !== 0 || principal === undefined) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          return {
            outcome: 'ok',
            result: {
              suppliers: store.picoSupplierAttachments().map((attachment) => ({
                identifier: attachment.identifier,
                kind: attachment.kind,
                mayReachOutside: attachment.mayReachOutside,
                mayReachUnasked: attachment.mayReachUnasked,
                attachedAt: attachment.attachedAt,
              })),
              /**
               * ADR 0143 DP3. What a fetched depot brings and nobody has
               * accepted yet, with the one thing it cannot supply itself.
               *
               * `slots` and `coverage` stay off this list for the same reason
               * they are off the one above: what a supplier is wired to is not
               * what a person deciding where its material belongs needs to
               * read.
               */
              declared: depotDeclaredSuppliers()
                .filter(({ declaration }) =>
                  store.picoSupplierAttachment(declaration.identifier) === undefined)
                .map(({ remote, declaration }) => ({
                  identifier: declaration.identifier,
                  kind: declaration.kind,
                  remote,
                  needs: picoDepotSupplierNeedsFromPerson(),
                })),
            } as unknown as Record<string, unknown>,
          };
        }
        /**
         * ADR 0143 DP3 with ADR 0137 IN5. The person says where a declared
         * supplier's material belongs, which is what attaches it.
         *
         * **What is recorded comes from the depot's declaration**, never from
         * the caller, in the idiom `home.modules.consent.record` uses: a
         * device naming its own slots and coverage would be writing the
         * capabilities it is about to be granted. The caller names which
         * supplier it is answering about and supplies the single field a depot
         * may not supply - exactly the one
         * `picoDepotSupplierNeedsFromPerson` names, which until now was a
         * value nothing read.
         *
         * Attaching creates no reach. ADR 0138 CO3/CO4 stays a separate
         * decision on `home.supplier.reach.decide`, and the row is written
         * with both switches off.
         */
        case 'home.supplier.attach': {
          if (principal === undefined
            || typeof args.identifier !== 'string'
            || typeof args.privacyDomain !== 'string') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const found = depotDeclaredSuppliers()
            .find(({ declaration }) => declaration.identifier === args.identifier);
          if (found === undefined) {
            // Named rather than generic: a person who mistyped, and a person
            // whose depot has not been fetched yet, are told different things
            // by this answer and the depot list beside it.
            return { outcome: 'invalid_arguments', result: { refusal: 'not_declared' } };
          }
          try {
            const attached = store.attachPicoSupplier({
              manifest: {
                identifier: found.declaration.identifier,
                kind: found.declaration.kind,
                slots: found.declaration.slots,
                coverage: found.declaration.coverage,
                // The person's word, and the only field that is theirs.
                privacyDomain: args.privacyDomain,
              },
              attachedAt: new Date().toISOString(),
            });
            const attachEvent = factory.create({
              deviceId: config.deviceId,
              type: 'home.supplier_attachment_changed',
              payload: {
                identifier: attached.identifier,
                mayReachOutside: false,
                mayReachUnasked: false,
              },
            });
            store.append(attachEvent);
            broadcast(attachEvent);
            return {
              outcome: 'ok',
              result: { identifier: attached.identifier, privacyDomain: attached.privacyDomain },
            };
          } catch (error: unknown) {
            // The parser's refusal and the ceiling's refusal both arrive here
            // and both are things a person can act on, so both are named.
            const reason = error instanceof Error ? error.message : 'supplier_attach_failed';
            return { outcome: 'invalid_arguments', result: { refusal: reason } };
          }
        }
        /**
         * ADR 0138 CO3/CO4. The two decisions, made where the person is.
         *
         * **They were unreachable until 2026-08-17.** The columns, the CHECK
         * that keeps unasked from being granted without asked, and the
         * content-free event all existed; `setPicoSupplierReach` had no caller
         * outside its own tests, so both defaults were the only state a Home
         * could be in. An ADR titled "off until someone says so" had nowhere
         * for anybody to say so.
         *
         * One operation for both, because CO4 depends on CO3: two would let a
         * client grant the second and then fail the first, and the database
         * would refuse the pair it was told to write in an order it did not
         * choose.
         */
        case 'home.supplier.reach.decide': {
          if (principal === undefined
            || typeof args.identifier !== 'string'
            || typeof args.mayReachOutside !== 'boolean'
            || typeof args.mayReachUnasked !== 'boolean') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          if (store.picoSupplierAttachment(args.identifier) === undefined) {
            return { outcome: 'invalid_arguments', result: { refusal: 'not_attached' } };
          }
          if (args.mayReachUnasked && !args.mayReachOutside) {
            // Named rather than left to the CHECK, because a person is owed
            // the reason: unasked traffic is visible to nobody, so it cannot
            // be the only thing they allowed.
            return {
              outcome: 'invalid_arguments',
              result: { refusal: 'unasked_needs_reaching' },
            };
          }
          store.setPicoSupplierReach({
            identifier: args.identifier,
            mayReachOutside: args.mayReachOutside,
            mayReachUnasked: args.mayReachUnasked,
            decidedAt: new Date().toISOString(),
          });
          // Content-free, in ADR 0129 SR6's shape: which supplier, and which
          // way. What it is for is nobody's business but the person's.
          const reachEvent = factory.create({
            deviceId: config.deviceId,
            type: 'home.supplier_attachment_changed',
            payload: {
              identifier: args.identifier,
              mayReachOutside: args.mayReachOutside,
              mayReachUnasked: args.mayReachUnasked,
            },
          });
          store.append(reachEvent);
          broadcast(reachEvent);
          return { outcome: 'ok', result: { decided: true } };
        }
        /**
         * ADR 0136 with ADR 0129 SR6. Stopping is not forgetting.
         *
         * **Nothing derived is touched.** What Pico read out of a library is
         * an ordinary memory item under ordinary custody, and it stays exactly
         * where it is - the thing being taken back is the library, which Pico
         * never owned.
         */
        case 'home.supplier.detach': {
          if (principal === undefined || typeof args.identifier !== 'string') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          if (store.picoSupplierAttachment(args.identifier) === undefined) {
            return { outcome: 'invalid_arguments', result: { refusal: 'not_attached' } };
          }
          store.detachPicoSupplier(args.identifier);
          const detachedEvent = factory.create({
            deviceId: config.deviceId,
            type: 'home.supplier_attachment_changed',
            payload: {
              identifier: args.identifier,
              mayReachOutside: false,
              mayReachUnasked: false,
            },
          });
          store.append(detachedEvent);
          broadcast(detachedEvent);
          return { outcome: 'ok', result: { detached: true } };
        }
        /**
         * ADR 0143 DP1. What is pinned, and at which commit.
         *
         * The commit travels whole rather than shortened: a person deciding
         * about material is entitled to the revision it is at, and a surface
         * that wants twelve characters can take them.
         */
        case 'home.depots.read': {
          if (Object.keys(args).length !== 0 || principal === undefined) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          return {
            outcome: 'ok',
            result: {
              depots: store.picoDepotAttachments().map((attachment) => ({
                remote: attachment.pin.remote,
                commit: attachment.pin.commit,
                mayFetch: attachment.mayFetch,
                mayFetchUnasked: attachment.mayFetchUnasked,
                acceptedAt: attachment.acceptedAt,
                /**
                 * ADR 0143 DP1. Das Zustandswort kommt aus dem Modul, nicht
                 * von hier - und bis zum 2026-08-25 kam es nirgendwo an:
                 * `picoDepotState` war gebaut, geprüft und im ganzen Produkt
                 * unerreicht, also war `offered` ein Zustand, den ein Typ
                 * kannte und ein Mensch nie sah.
                 *
                 * Das Wort reist, der Satz nicht. Welche Worte daraus werden,
                 * entscheidet die Fläche - `check-one-voice` hält fest, dass
                 * hier nichts formuliert wird.
                 */
                state: picoDepotState(picoDepotViewFor(attachment)),
                ...(attachment.offeredCommit === undefined
                  ? {}
                  : { offeredCommit: attachment.offeredCommit }),
              })),
              /**
               * ADR 0140 RL4 mit ADR 0143 DP8. Ob ein planmäßiger Lauf ohne
               * Anwesende handeln darf - und **in welcher Domäne** der Home
               * das entscheidet.
               *
               * Die Domäne reist mit, statt dass das Fenster sie kennt: ADR
               * 0143 DP6 sagt, ein Depot lebt in keinem Raum, und ADR 0140 RL6
               * verlangt trotzdem, dass jede Entscheidung ihren nennt. Welchen
               * der Home dafür wählt, ist seine Sache; eine Fläche, die ihn
               * mitschreibt, wäre die zweite Stelle, an der er steht.
               */
              unattendedFetching: {
                effectName: 'depot.fetch',
                privacyDomain: depotFetchPrivacyDomain,
                ...(store.picoRuleDecision({
                  effectName: 'depot.fetch',
                  privacyDomain: depotFetchPrivacyDomain,
                }) === undefined
                  ? {}
                  : {
                    decision: store.picoRuleDecision({
                      effectName: 'depot.fetch',
                      privacyDomain: depotFetchPrivacyDomain,
                    }),
                  }),
              },
            } as unknown as Record<string, unknown>,
          };
        }
        /**
         * ADR 0143 DP1. A person says this material may be here, from the
         * device they are holding.
         *
         * **Attaching creates no reach**, which is why the decision below is a
         * separate operation rather than a field here: saying "this corpus is
         * mine" and saying "go and get it, unwatched" are two decisions, and
         * one call doing both would collapse them at the moment a person is
         * least likely to notice.
         *
         * The Foundation route has done this since ADR 0143 and refuses an
         * operator session, because whose corpus this is is not
         * administration's to answer (ADR 0087). This is the same refusal seen
         * from the other side: the person's own device is where the answer
         * comes from.
         */
        case 'home.depot.attach': {
          if (principal === undefined) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          try {
            const attached = store.attachPicoDepot({
              /**
               * The arguments go to the parser whole rather than being picked
               * apart here. A handler that built `{ remote, commit }` from
               * them would silently drop a `branch` and answer as though the
               * caller had merely mistyped a commit - and ADR 0143 DP1's
               * refusal exists precisely to tell somebody that tracking a ref
               * is the thing this cannot do.
               */
              pin: args,
              acceptedAt: new Date().toISOString(),
              acceptedBy: principal.picoIdentityFingerprintHex,
            });
            return {
              outcome: 'ok',
              result: {
                remote: attached.pin.remote,
                commit: attached.pin.commit,
                // Said back rather than assumed: a person who attached
                // something is owed the fact that nothing will be fetched
                // until they say so.
                mayFetch: attached.mayFetch,
                mayFetchUnasked: attached.mayFetchUnasked,
              } as unknown as Record<string, unknown>,
            };
          } catch (error) {
            /**
             * The parser's name travels, and one of them is the point of the
             * gate: a caller naming a branch, a tag or a channel is refused as
             * `pico_depot_cannot_follow_a_ref` rather than as a shape failure,
             * because it is not a typo - it is a request for the thing ADR
             * 0143 DP1 exists to prevent, and it should be told so.
             */
            return {
              outcome: 'invalid_arguments',
              result: { refusal: error instanceof Error ? error.message : 'invalid_depot_pin' },
            };
          }
        }
        /** ADR 0138 CO3/CO4 for a depot: the two decisions, again as two. */
        case 'home.depot.reach.decide': {
          if (principal === undefined
            || typeof args.remote !== 'string'
            || typeof args.mayFetch !== 'boolean'
            || typeof args.mayFetchUnasked !== 'boolean') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          if (args.mayFetchUnasked && !args.mayFetch) {
            return {
              outcome: 'invalid_arguments',
              result: { refusal: 'unasked_needs_fetching' },
            };
          }
          try {
            store.setPicoDepotReach({
              remote: args.remote,
              mayFetch: args.mayFetch,
              mayFetchUnasked: args.mayFetchUnasked,
            });
          } catch (error) {
            return {
              outcome: 'invalid_arguments',
              result: {
                refusal: error instanceof Error && /not_attached/u.test(error.message)
                  ? 'not_attached'
                  : 'invalid_depot_reach',
              },
            };
          }
          const depotEvent = factory.create({
            deviceId: config.deviceId,
            type: 'home.supplier_attachment_changed',
            // Content-free, and the remote is what identifies a depot. Which
            // material it holds is nobody's business but the person's.
            payload: {
              identifier: args.remote,
              mayReachOutside: args.mayFetch,
              mayReachUnasked: args.mayFetchUnasked,
            },
          });
          store.append(depotEvent);
          broadcast(depotEvent);
          return { outcome: 'ok', result: { decided: true } };
        }
        /**
         * ADR 0139 AC4. What each module declares it will do, against what
         * was agreed to.
         *
         * The drift is returned rather than a boolean, in ADR 0127 M4's
         * posture: somebody being asked is told what moved, not merely that
         * something did. `declares` carries the sentences themselves, because
         * a list of effect names is not a thing a person can agree to.
         */
        /**
         * ADR 0140 RL4. Eine Regel aufzeichnen.
         *
         * Nur über einen Effekt, dem jemand zugestimmt hat: eine Regel über
         * etwas, das kein Modul erklärt hat, spricht über nichts, und sie
         * stünde da, bis irgendwann ein Modul den Namen benutzt - dann gälte
         * eine Entscheidung, die niemand über *diesen* Effekt getroffen hat.
         */
        case 'home.rule.decide': {
          if (principal === undefined
            || typeof args.effectName !== 'string'
            || typeof args.privacyDomain !== 'string'
            || args.privacyDomain.trim() === ''
            || (args.decision !== 'allow'
              && args.decision !== 'require_approval'
              && args.decision !== 'deny')
            || Object.keys(args).length !== 3) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          if (!consentedModuleEffects().some((effect) => effect.name === args.effectName)) {
            return { outcome: 'invalid_arguments', result: { refusal: 'effect_not_consented' } };
          }
          store.setPicoRuleDecision({
            effectName: args.effectName,
            privacyDomain: args.privacyDomain,
            decision: args.decision,
            decidedAt: new Date().toISOString(),
          });
          // Inhaltsfrei, in derselben Form wie Aktivierung und Aufzeichnung:
          // welcher Effekt, welche Domäne, welche der drei Antworten. Wofür
          // die Person das entschieden hat, geht niemanden etwas an.
          const ruledEvent = factory.create({
            deviceId: config.deviceId,
            type: 'home.rule_decision_changed',
            payload: {
              effectName: args.effectName,
              privacyDomain: args.privacyDomain,
              decision: args.decision,
            },
          });
          store.append(ruledEvent);
          broadcast(ruledEvent);
          return { outcome: 'ok', result: { decided: true } };
        }
        /**
         * ADR 0140 RL4. Eine Regel zurücknehmen, so dass wieder keine gilt.
         *
         * Abwesend ist nicht `deny`: die Zustimmung sagt weiter, dass dieser
         * Effekt existieren darf, und die Antwort fällt wieder aus der
         * Risikoklasse. Deshalb ein eigener Vorgang statt „auf require_approval
         * zurückstellen" - das wäre für einen `local_write` Effekt strenger als
         * vorher, also eine Rücknahme, die eine Verschärfung ist.
         */
        case 'home.rule.forget': {
          if (principal === undefined
            || typeof args.effectName !== 'string'
            || typeof args.privacyDomain !== 'string'
            || Object.keys(args).length !== 2) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const forgotten = store.forgetPicoRuleDecision({
            effectName: args.effectName,
            privacyDomain: args.privacyDomain,
          });
          if (forgotten !== 'forgotten') {
            return { outcome: 'invalid_arguments', result: { refusal: 'no_rule' } };
          }
          const forgottenEvent = factory.create({
            deviceId: config.deviceId,
            type: 'home.rule_decision_changed',
            payload: {
              effectName: args.effectName,
              privacyDomain: args.privacyDomain,
              // Was jetzt gilt, ist keine Regel - und `none` sagt das, statt
              // die Abwesenheit als `require_approval` zu verkleiden.
              decision: 'none',
            },
          });
          store.append(forgottenEvent);
          broadcast(forgottenEvent);
          return { outcome: 'ok', result: { forgotten: true } };
        }
        /**
         * ADR 0129 SR5. Der Port bekommt sein anderes Ende.
         *
         * **Zwei Dinge entscheidet der Home und nicht das Gerät.** Ob
         * überhaupt aufgeschrieben werden darf, steht in der SR6-Entscheidung
         * - ein Home, das Messungen annimmt, weil sie ankommen, hätte sie dem
         * Sensoradapter überlassen. Und in welchem Raum sie liegen, entscheidet
         * er auch: die Domäne ist die einzige Custody, die eine Beobachtung
         * trägt, und wer seine eigene nennen dürfte, legte seine Messungen in
         * den Raum eines anderen. Dieselbe Regel, mit der ADR 0116 W1 den
         * Ursprung beim Eingang setzt statt ihn zu glauben.
         *
         * Die Messungen selbst gehen durch die Parser des Protokolls, bevor
         * irgendetwas aus ihnen wird - der Speicher tut es gleich noch einmal,
         * und das ist keine Doppelung, sondern die Grenze: hier scheitert eine
         * kaputte Übergabe mit einem Namen, den ein Absender lesen kann.
         */
        /**
         * ADR 0094 mit ADR 0086. Das Bündel, das ein Leser zum Entschlüsseln
         * braucht - und nur für einen Leser.
         *
         * Die Aufzeichnungen gehen **ganz** hinaus, mit ihren Unterschriften:
         * der Daemon des Lesers prüft sie selbst, und ein Bündel, das hier
         * zurechtgeschnitten würde, machte dieses Home zur zweiten Meinung
         * über etwas, das es nicht entscheidet.
         *
         * `not_a_reader` für eine unbekannte Domäne **und** für eine, in die
         * dieser Absender nicht darf: ein Nein, das die beiden unterscheidet,
         * beantwortet die Frage „gibt es diesen Raum?" für jeden, der raten
         * will (ADR 0077 C4).
         */
        case 'home.reader_custody.read': {
          if (principal === undefined
            || typeof args.domainAuthorityId !== 'string'
            || Object.keys(args).length !== 1) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const bundle = readerCustody.readingBundleFor({
            domainAuthorityId: args.domainAuthorityId,
            readerIdentityKeyFingerprintHex: principal.picoIdentityFingerprintHex,
          });
          if (bundle === undefined) {
            return { outcome: 'invalid_arguments', result: { refusal: 'not_a_reader' } };
          }
          return {
            outcome: 'ok',
            result: bundle as unknown as Record<string, unknown>,
          };
        }
        /**
         * ADR 0101 mit ADR 0130 E5 - was eine Rotation nennen muss.
         *
         * **Eine eigene Tür und nicht das Lesebündel** (2026-08-27). Das
         * bedient Leser, und ihnen die verbleibenden Leserrechte aufzuzählen
         * wäre eine Karte, wer sonst noch hineindarf. Für die Besitzerin ist
         * dieselbe Aufzählung der Inhalt: eine Rotation versiegelt den neuen
         * KEK für jeden, der bleibt.
         *
         * Der Anlass kam von einem Durchlauf: seit einen Lesezugang zu beenden
         * wirklich geht (Befund B34), verschließt jedes Beenden die Domäne mit
         * `rotation_required` - und begleichen konnte das im Produkt niemand.
         */
        case 'home.reader_custody.rotation.read': {
          if (principal === undefined
            || typeof args.domainAuthorityId !== 'string'
            || Object.keys(args).length !== 1) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const bundle = readerCustody.rotationBundleFor({
            domainAuthorityId: args.domainAuthorityId,
            ownerIdentityKeyFingerprintHex: principal.picoIdentityFingerprintHex,
          });
          if (bundle === undefined) {
            /**
             * Derselbe Satz für „gibt es nicht" und „gehört dir nicht": wer
             * eine fremde Domäne errät, soll nicht daran merken, dass es sie
             * gibt.
             */
            return { outcome: 'invalid_arguments', result: { refusal: 'not_the_owner' } };
          }
          return {
            outcome: 'ok',
            result: bundle as unknown as Record<string, unknown>,
          };
        }
        /**
         * ADR 0086 mit ADR 0130 E5. Der Ast bekommt sein Subjekt.
         *
         * Das Prüfen und Speichern kann dieser Home seit langem - was fehlte,
         * war ein Weg dorthin von einem Gerät statt von einem zweiten Home.
         * `recordItem` bleibt der einzige Eingang: die Unterschrift des
         * Schreibers, sein Schreibrecht, die Domäne und die KEK-Version werden
         * dort geprüft, und diese Zeile fügt keine zweite Meinung dazu hinzu.
         *
         * **Der Grund der Ablehnung reist mit.** Ein „nein" ohne Namen ließe
         * ein Gerät raten, ob sein Recht abgelaufen ist, die Domäne rotiert
         * wurde oder es die falsche Home fragt - und die drei verlangen
         * verschiedene Antworten von der Person.
         */
        case 'home.reader_custody.item.submit': {
          if (principal === undefined
            || typeof args.record !== 'object'
            || args.record === null
            || Array.isArray(args.record)
            || Object.keys(args).length !== 1) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const recorded = readerCustody.recordItem(
            args.record as unknown as PicoReaderCustodyItemRecord,
          );
          if (!recorded.ok) {
            return { outcome: 'invalid_arguments', result: { refusal: recorded.reason } };
          }
          /**
           * `inserted` sagt, ob dies das erste Mal war. Ein Gerät, das nach
           * einem Abbruch erneut abgibt, ist kein Fehler und soll auch keinen
           * lesen - aber „schon da" ist etwas anderes als „gerade
           * angekommen", und nur das erste erlaubt ihm, den Klartext lokal
           * loszuwerden.
           */
          return {
            outcome: 'ok',
            result: { inserted: recorded.inserted, memoryItemId: recorded.value.memoryItemId },
          };
        }
        case 'home.observations.submit': {
          if (principal === undefined
            || !Array.isArray(args.observations)
            || Object.keys(args).length !== 1) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          if (!store.picoCapturingModules().includes('spatial-recall')) {
            // Nicht „nichts angekommen": das Home sagt, warum es nichts
            // aufschreibt, damit ein Gerät nicht weiter misst und sendet.
            return { outcome: 'invalid_arguments', result: { refusal: 'capture_not_consented' } };
          }
          if (args.observations.length > maxPicoObservationSubmission) {
            return { outcome: 'invalid_arguments', result: { refusal: 'too_many_observations' } };
          }
          let appended;
          try {
            appended = store.appendPicoObservations(args.observations.map((entry) => {
              const reading = entry as { kind?: unknown; payload?: unknown };
              if (typeof reading.payload !== 'string') {
                throw new Error('invalid_pico_observation_payload');
              }
              /**
               * **Der Zeitpunkt wird gelesen, nicht mitgeschickt.** Er steht
               * schon in der Messung; ihn daneben zu übergeben hieße, dieselbe
               * Wahrheit zweimal zu schreiben, und die beiden könnten
               * auseinanderlaufen - ein Absender könnte eine Messung von heute
               * als gestern ablegen.
               */
              const parsed: { at: string } = reading.kind === 'location_fix'
                ? parsePicoLocationFix(JSON.parse(reading.payload))
                : parsePicoMobilitySample(JSON.parse(reading.payload));
              return {
                kind: reading.kind,
                privacyDomain: spatialCapturePrivacyDomain,
                observedAt: parsed.at,
                payload: reading.payload,
              };
            }));
          } catch (refused) {
            return {
              outcome: 'invalid_arguments',
              result: { refusal: refused instanceof Error ? refused.message : 'refused' },
            };
          }
          /**
           * Wie viele angekommen sind, nicht wie viele geschickt wurden. Der
           * Deckel nach ADR 0119 Q5 kann weniger annehmen als angeboten
           * wurden, und ein Absender, der „alles gut" liest, während der
           * Puffer voll ist, misst weiter ins Leere.
           */
          return { outcome: 'ok', result: { appended } };
        }
        /**
         * ADR 0126 P3 mit ADR 0129 SR2. Was ein Gerät aus seinen eigenen
         * Messungen gemacht hat, überquert hier die Zustandsgrenze.
         *
         * **Die Messungen kommen nie an**, und das ist der ganze Punkt: der
         * Puffer liegt auf dem Gerät, die Verdichtung auch, und was der Home
         * sieht, ist eine Erinnerung. P3 nennt das seine andere Hälfte.
         *
         * **Dieselben zwei Entscheidungen wie beim Puffern**, weil sie
         * dieselben sind: *ob* überhaupt gemessen werden darf (SR6) und *in
         * welchem Raum* das Ergebnis liegt. Die Domäne reist nicht mit - ein
         * Absender, der seine eigene nennen dürfte, legte sie in den Raum
         * eines anderen.
         */
        case 'home.observation.derived.keep': {
          if (principal === undefined
            || typeof args.contentType !== 'string'
            || typeof args.content !== 'string'
            || typeof args.at !== 'string'
            || typeof args.place !== 'string') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          if (!store.picoCapturingModules().includes('spatial-recall')) {
            /**
             * Auch hier benannt und nicht stumm: wer nicht messen darf, darf
             * auch das Ergebnis einer Messung nicht abliefern. Die Zusage der
             * Person ist eine über ihr Leben (SR6) und nicht über einen
             * Transportweg.
             */
            return { outcome: 'invalid_arguments', result: { refusal: 'capture_not_consented' } };
          }
          let place;
          try {
            // Als Text, weil die kanonische Form der Link-Argumente keine
            // Fließkommazahlen trägt - dieselbe Sprache, die der Puffer daneben
            // spricht.
            place = parsePicoPlace(JSON.parse(args.place));
          } catch {
            return { outcome: 'invalid_arguments', result: { refusal: 'invalid_pico_place' } };
          }
          if (!isPicoInstant(args.at)) {
            return { outcome: 'invalid_arguments', result: { refusal: 'invalid_instant' } };
          }
          const derivedItemId = `mem_derived_${createHash('sha256')
            .update(`derived_observation\u0000${args.at}\u0000${args.content}`)
            .digest('hex').slice(0, 32)}`;
          /**
           * **Ein zweites Mal ist kein zweiter Uebergang** (ADR 0126 P3).
           *
           * Ein Geraet, dessen Verbindung nach dem Uebergang abbrach, bietet
           * dieselbe Ableitung noch einmal an - und das ist kein Fehler,
           * sondern der laute Fehlschlag, den ADR 0129 SR5 dem leisen Verlust
           * vorzieht. Ohne diese Zeile legte der Uebergang den Eintrag ein
           * zweites Mal an und scheiterte; das Geraet bekaeme einen Fehler
           * fuer etwas, das laengst angekommen ist, und behielte seine
           * Messungen im Klartext. **Gefunden beim Gehen, nicht beim
           * Schreiben.**
           *
           * Die Kennung ist aus dem Inhalt gebildet, also ist „schon da" eine
           * Aussage ueber dieselbe Ableitung und nicht ueber eine zufaellige
           * Namensgleichheit.
           */
          const already = store.memory()
            .getInDomain(derivedItemId, spatialCapturePrivacyDomain);
          if (already !== undefined) {
            return {
              outcome: 'ok',
              result: { memoryItemId: derivedItemId, crossed: false },
            };
          }
          const crossed = crossPicoStateBoundary({
            store,
            kind: 'derived_observation',
            privacyDomain: spatialCapturePrivacyDomain,
            owner: principal.picoIdentityFingerprintHex,
            controller: principal.picoIdentityFingerprintHex,
            contentType: args.contentType,
            content: args.content,
            /**
             * ADR 0116 W2. Abgeleitet aus dem, was das eigene Gerät gemessen
             * hat - also Picos Eigenes und nicht die Person, die daneben
             * stand. Eine Ableitung ist keine Anweisung.
             */
            origin: 'own_pico',
            /**
             * Eins, und die Zahl ist das Einzige, was über die Quellen gesagt
             * wird: der Home hat die Messungen nicht gesehen und kann sie
             * nicht zählen. Was er zählt, ist das, was ankam.
             */
            sourceCount: 1,
            deviceId: config.deviceId,
            memoryItemId: derivedItemId,
            appendEvent: ({ type, payload }) => {
              const crossingEvent = factory.create({
                deviceId: config.deviceId,
                type,
                payload,
              });
              store.append(crossingEvent);
              broadcast(crossingEvent);
            },
          });
          if (!crossed.ok) {
            return { outcome: 'invalid_arguments', result: { refusal: crossed.refusal } };
          }
          /**
           * ADR 0129 SR3. Der Ort ist eine Kernspalte und wird an den Eintrag
           * gehängt, nachdem es ihn gibt - genau wie ein fälliger Zeitpunkt.
           */
          store.setPicoMemoryItemPlace({ memoryItemId: derivedItemId, place });
          /**
           * `memoryItemId` zurück, damit das Gerät weiss, was angekommen ist,
           * und `crossed`, damit „schon da" von „gerade angekommen"
           * unterscheidbar bleibt - nur das Zweite erlaubt dem Gerät, seinen
           * Puffer zu leeren.
           */
          return {
            outcome: 'ok',
            result: { memoryItemId: derivedItemId, crossed: true },
          };
        }
        case 'home.modules.consent.read': {
          if (principal === undefined) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          return {
            outcome: 'ok',
            result: {
              awaiting: store.picoModulesAwaitingConsent(shippedModuleManifests)
                .map((entry) => ({
                  identifier: entry.identifier,
                  drift: entry.drift,
                  declares: shippedModuleManifests
                    .find((manifest) => manifest.identifier === entry.identifier)?.effects ?? [],
                })),
            } as unknown as Record<string, unknown>,
          };
        }
        /**
         * ADR 0139 AC4. The person agrees to what one module declares now.
         *
         * **What is recorded is the manifest, never what the caller sent.** A
         * device naming its own effects would be writing the record of what
         * was agreed from the side that benefits from it; the caller names
         * which module it is answering about, and the Home reads the sentences
         * out of the manifest it shipped.
         *
         * Activation is untouched by saying so - the module was already on
         * (ADR 0127 M3), and this is the separate statement that it may act.
         */
        case 'home.modules.consent.record': {
          if (principal === undefined || typeof args.identifier !== 'string') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const manifest = shippedModuleManifests
            .find((entry) => entry.identifier === args.identifier);
          if (manifest === undefined) {
            return { outcome: 'invalid_arguments', result: { refusal: 'unknown_module' } };
          }
          if (!store.picoActiveModules().includes(manifest.identifier)) {
            // Consenting to what an inactive module would do records an
            // agreement about behaviour that is switched off, which is an
            // answer to a question nobody is being asked.
            return { outcome: 'invalid_arguments', result: { refusal: 'module_not_active' } };
          }
          store.setPicoModuleActivation({
            decidedAt: new Date().toISOString(),
            changes: [{
              identifier: manifest.identifier,
              active: true,
              effects: manifest.effects,
            }],
          });
          const consentEvent = factory.create({
            deviceId: config.deviceId,
            type: 'home.module_activation_changed',
            payload: {
              // Content-free, and the direction is neither: nothing was
              // enabled or disabled, an agreement was recorded.
              consented: [manifest.identifier],
            },
          });
          store.append(consentEvent);
          broadcast(consentEvent);
          return { outcome: 'ok', result: { recorded: manifest.effects.length } };
        }
        /**
         * ADR 0143 DP8 with ADR 0141 RN4. A person asking for a fetch now.
         *
         * The session comes from the device, which is the only party that
         * knows a person is in front of it. An invented one buys nothing: only
         * the same session may answer, and a device can only ever answer its
         * own question.
         *
         * **The window is the device's, and bounded here.** A caller naming an
         * hour would be naming a standing grant with a number attached, which
         * is the thing RN4's two clocks exist to stop.
         */
        case 'home.depot.detach': {
          if (principal === undefined || typeof args.remote !== 'string') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          if (store.picoDepotAttachment(args.remote) === undefined) {
            return { outcome: 'invalid_arguments', result: { refusal: 'not_attached' } };
          }
          /**
           * ADR 0143 DP8. **The row first, then the files.** ADR 0070's
           * tombstone posture: the attachment record decides and the
           * filesystem is brought to it, so an interruption leaves a directory
           * with no attachment behind it rather than an attachment pointing at
           * nothing - and the boot-time orphan sweep already knows how to
           * clear the first. Done now rather than left to that sweep, because
           * until it runs there is executable code on disk that no attachment
           * stands behind, which is what a supplier process is pointed at.
           */
          store.detachPicoDepot(args.remote);
          depotWorkspace.detach(args.remote);
          const depotDetached = factory.create({
            deviceId: config.deviceId,
            type: 'home.supplier_attachment_changed',
            payload: {
              identifier: args.remote,
              mayReachOutside: false,
              mayReachUnasked: false,
            },
          });
          store.append(depotDetached);
          broadcast(depotDetached);
          return { outcome: 'ok', result: { detached: true } };
        }
        /**
         * ADR 0143 DP1. Ein Angebot annehmen, indem man seinen Commit nennt.
         *
         * Der Home baut das Angebot aus dem, was er gespeichert hat, und
         * vergleicht es mit dem, was die Person genannt hat. Ein Fetch, der
         * zwischen der Frage und der Antwort gelandet ist, erzeugt damit einen
         * Unterschied und wird abgelehnt - das ist der Unterschied zwischen
         * „ich habe zugestimmt, diesen Code auszuführen" und „ich habe
         * zugestimmt, auszuführen, was gerade das Neueste war".
         *
         * Kein Fetch hier. Das Annehmen bewegt den Pin; das Holen ist ADR 0138
         * CO3/CO4s eigene Entscheidung und läuft über den Sweep, der sie liest.
         */
        case 'home.depot.offer.accept': {
          if (principal === undefined
            || typeof args.remote !== 'string'
            || typeof args.acceptedCommit !== 'string'
            || Object.keys(args).length !== 2) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const attachment = store.picoDepotAttachment(args.remote);
          if (attachment === undefined || attachment.offeredCommit === undefined) {
            // Ein Depot, das es nicht gibt, und eines ohne Angebot bekommen
            // dasselbe Wort: das Nein ist kein Verzeichnis (ADR 0077 C4), und
            // beide Male gibt es nichts anzunehmen.
            return { outcome: 'invalid_arguments', result: { refusal: 'no_offer_standing' } };
          }
          try {
            const offer = store.picoDepotOffer({
              remote: args.remote,
              seenCommit: attachment.offeredCommit,
            });
            if (offer === null) {
              return { outcome: 'invalid_arguments', result: { refusal: 'no_offer_standing' } };
            }
            const moved = store.acceptPicoDepotOffer({
              offer,
              acceptedCommit: args.acceptedCommit,
              acceptedAt: new Date().toISOString(),
            });
            return {
              outcome: 'ok',
              result: { remote: moved.pin.remote, commit: moved.pin.commit },
            };
          } catch (refused) {
            return {
              outcome: 'invalid_arguments',
              result: { refusal: refused instanceof Error ? refused.message : 'refused' },
            };
          }
        }
        case 'home.depot.fetch.ask': {
          if (principal === undefined
            || typeof args.presenceSessionId !== 'string'
            || args.presenceSessionId.trim() === '') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const startedAtMs = Date.now();
          const before = pendingActions.size();
          const swept = sweepPicoDepotFetches(true, {
            presenceSessionId: args.presenceSessionId,
            startedAtMs,
            durationMs: maxPicoActionApprovalWindowMs,
            endsAtMs: startedAtMs + maxPicoActionApprovalWindowMs,
          });
          return {
            outcome: 'ok',
            result: {
              requested: swept.requested,
              // ADR 0117 X1. Present only when something stood in the way, so
              // a quiet sweep and a blocked one are not the same answer with a
              // different number in it.
              ...(swept.blocked === undefined ? {} : { blocked: swept.blocked }),
              // What is now waiting for this session, so a device does not
              // have to ask a second question to learn it asked one.
              waiting: pendingActions.forSession(args.presenceSessionId),
              asked: pendingActions.size() - before,
            } as unknown as Record<string, unknown>,
          };
        }
        /** ADR 0141 RN4. What stands, for the session that was asked. */
        case 'home.action.approval.read': {
          if (principal === undefined || typeof args.presenceSessionId !== 'string') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          return {
            outcome: 'ok',
            result: {
              waiting: pendingActions.forSession(args.presenceSessionId),
            } as unknown as Record<string, unknown>,
          };
        }
        /**
         * ADR 0141 RN4. The answer, in the session the question was asked in.
         *
         * `approved` may be absent, and that is a third state rather than a
         * missing second: a person who was asleep did not refuse, and the
         * window expiring is `unanswered`.
         */
        case 'home.action.approval.resolve': {
          if (principal === undefined
            || typeof args.requestedEventId !== 'string'
            || typeof args.presenceSessionId !== 'string'
            || (args.approved !== undefined && typeof args.approved !== 'boolean')) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const taken = pendingActions.take(args.requestedEventId, args.presenceSessionId);
          if (!taken.ok) {
            return { outcome: 'invalid_arguments', result: { refusal: taken.refusal } };
          }
          const resolved = resolvePicoActionApproval({
            decided: taken.entry.decided,
            presenceSessionId: args.presenceSessionId,
            ...(args.approved === undefined ? {} : { approved: args.approved }),
            nowMs: Date.now(),
            monotonicNowMs: performance.now(),
            // Die Frage entstand, weil jemand danebenstand, und die Antwort
            // kommt von derselben Person - also fragt dieser Abruf mit.
            effects: moduleEffectsFor(true),
            emit: emitActionFact,
          });
          return {
            outcome: 'ok',
            result: {
              outcome: resolved.outcome,
              ran: resolved.ran,
              ...(resolved.succeeded === undefined ? {} : { succeeded: resolved.succeeded }),
            } as unknown as Record<string, unknown>,
          };
        }
        case 'home.presence.switch': {
          if (principal === undefined
            || typeof args.presenceId !== 'string'
            || typeof args.enabled !== 'boolean'
            || (args.affordance !== undefined
              && !(picoPresenceAffordances as readonly string[]).includes(args.affordance as string))) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const changed = store.picoPresenceRegistry().setSwitch({
            picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
            presenceId: args.presenceId,
            ...(args.affordance === undefined
              ? {}
              : { affordance: args.affordance as PicoPresenceAffordance }),
            enabled: args.enabled,
            at: new Date().toISOString(),
          });
          if (changed.changed) {
            // Content-free, in the shape ADR 0129 SR6 already uses: which
            // device, which affordance if any, and which way. What the device
            // is *for* is nobody's business but the person's.
            const switchEvent = factory.create({
              deviceId: config.deviceId,
              type: 'home.presence_switch_changed',
              payload: {
                presenceId: args.presenceId,
                ...(args.affordance === undefined ? {} : { affordance: args.affordance }),
                enabled: args.enabled,
              },
            });
            store.append(switchEvent);
            broadcast(switchEvent);
          }
          return { outcome: 'ok', result: { changed: changed.changed } };
        }
        case 'home.presence.forget': {
          if (principal === undefined || typeof args.presenceId !== 'string') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const forgotten = store.picoPresenceRegistry().forget({
            picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
            presenceId: args.presenceId,
          });
          return forgotten
            ? { outcome: 'ok', result: { forgotten: true } }
            : { outcome: 'invalid_arguments', result: { refusal: 'not_found' } };
        }
        /**
         * ADR 0116 W5. What is waiting for this person, without the answers.
         */
        case 'home.model.reads.read': {
          if (Object.keys(args).length !== 0 || principal === undefined) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          return {
            outcome: 'ok',
            result: {
              reads: store.picoModelJobQueue()
                .answeredFor(principal.picoIdentityFingerprintHex)
                .map((read) => ({
                  jobId: read.jobId,
                  supplier: read.supplierIdentifier,
                  // Short, because a device shows it and a person recognises a
                  // revision by its first characters or not at all.
                  revision: read.commit.slice(0, 12),
                  answeredAt: read.settledAt,
                })),
            } as unknown as Record<string, unknown>,
          };
        }
        case 'home.model.read.keep': {
          if (principal === undefined || typeof args.jobId !== 'string') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const kept = store.picoModelJobQueue().keptView(args.jobId);
          if (kept === undefined
            || kept.picoIdentityFingerprintHex !== principal.picoIdentityFingerprintHex) {
            return { outcome: 'invalid_arguments', result: { refusal: 'not_found' } };
          }
          if (kept.outcome !== 'answered' || kept.values === undefined) {
            return { outcome: 'invalid_arguments', result: { refusal: 'no_answer' } };
          }
          const memoryItemId = `memory_${createHash('sha256')
            .update(`kept\u0000${args.jobId}`).digest('hex').slice(0, 32)}`;
          /**
           * ADR 0126 P3. The same door the recall keep goes through, because
           * it is the same act: material a device was shown becoming
           * something the identity keeps. This wrote the item straight into
           * the store until 2026-08-18 - explicit and unaudited, which is
           * exactly what P3 was written to end.
           */
          const releasedRead = typeof args.presenceId === 'string'
            && store.picoPresenceRegistry()
              .forIdentity(principal.picoIdentityFingerprintHex, Date.now())
              .some((presence) => presence.presenceId === args.presenceId)
            ? args.presenceId
            : undefined;
          try {
            const crossed = crossPicoStateBoundary({
              store,
              kind: 'answered_read',
              ...(releasedRead === undefined ? {} : { presenceId: releasedRead }),
              privacyDomain: kept.privacyDomain,
              owner: `pico:identity:${principal.picoIdentityFingerprintHex}`,
              controller: `pico:identity:${principal.picoIdentityFingerprintHex}`,
              contentType: 'application/json',
              content: JSON.stringify(kept.values),
              // One read, one source: the supplier revision the derivation
              // names. Counting the values would count fields, not sources.
              sourceCount: 1,
              deviceId: config.deviceId,
              memoryItemId,
              derivedFrom: buildPicoLibraryDerivation({
                supplierIdentifier: kept.supplierIdentifier,
                pin: { kind: 'commit', value: kept.commit },
                pinCoversContent: kept.pinCoversContent,
              }),
              appendEvent: ({ type, payload }) => {
                const crossingEvent = factory.create({
                  deviceId: config.deviceId,
                  type,
                  payload,
                });
                store.append(crossingEvent);
                broadcast(crossingEvent);
              },
            });
            if (!crossed.ok) {
              return { outcome: 'invalid_arguments', result: { refusal: crossed.refusal } };
            }
            /**
             * ADR 0071. The job names what it became, so a person can unmake
             * it: `home.memory.forget` finds a kept item through its job, and
             * without this line everything kept this way was permanent.
             */
            store.picoModelJobQueue().markKept({
              jobId: args.jobId,
              memoryItemId,
              privacyDomain: kept.privacyDomain,
            });
          } catch (error) {
            return {
              outcome: 'invalid_arguments',
              result: { refusal: error instanceof Error ? error.message : 'refused' },
            };
          }
          return { outcome: 'ok', result: { memoryItemId } };
        }
        case 'home.model.providers.read': {
          if (Object.keys(args).length !== 0 || principal === undefined) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const consent = store.picoModelProviderConsent();
          const mine = new Map(consent
            .listFor(principal.picoIdentityFingerprintHex)
            .map((entry) => [entry.entryId, entry]));
          // ADR 0152 SE5. Derived from settled jobs, so it costs no request
          // and reaches nothing: a surface read that probed a machine would be
          // this Home reaching outside because somebody opened a window.
          const queue = store.picoModelJobQueue();
          return {
            outcome: 'ok',
            result: {
              providers: store.picoModelProviderRegistry().list().map((record) => {
                const decided = mine.get(record.entry.entryId);
                const finding = picoModelProviderEffectiveEntry(record);
                const observation = queue.observationFor(record.entry.entryId);
                return {
                  entryId: record.entry.entryId,
                  model: record.entry.model.identifier,
                  // ADR 0048 with ADR 0152 SE2. What the finding says this
                  // machine is - sent because the decision restates it, and a
                  // person cannot confirm a declaration they were never shown.
                  providerClass: record.entry.providerClass,
                  contextTokens: finding.measurement.capacity.contextTokens,
                  measuredAt: record.entry.measurement.measuredAt,
                  state: picoModelProviderState(observation),
                  ...(observation.lastSettledAt === undefined
                    ? {}
                    : { stateSince: observation.lastSettledAt }),
                  // ADR 0152 SE1. The consequence in words, and the absence of
                  // a decision said as an absence rather than as a default.
                  decided: decided !== undefined,
                  sees: decided === undefined
                    ? 'nothing yet - you have not decided about this one'
                    : decided.carries === 'live_turn'
                      ? 'this conversation only'
                      : 'this conversation and what Pico remembers',
                  needsCredentialToSeeMore: decided?.credentialRef === undefined,
                };
              }),
              /**
               * ADR 0142 PE2. What is being measured, and how the recent ones
               * ended - here rather than behind its own read.
               *
               * A measurement and the entry it produces are one subject, and a
               * surface that polled a dedicated route while a card worked for
               * minutes would spend ADR 0119 Q4's stranger budget on
               * bookkeeping: sixty requests a minute, shared, is the bound a
               * flood is measured against. Riding along means the settings view
               * already asking this question learns the answer.
               */
              measurements: modelProviderMeasurements.list(),
            } as unknown as Record<string, unknown>,
          };
        }
        /**
         * ADR 0151 PV1 with ADR 0138 CO1. A secret arrives, and stops being
         * one.
         *
         * Sealed in the same breath it is received: nothing writes it to a
         * log, nothing keeps it in a field, and the reply carries the
         * reference rather than any part of it. There is no read-back
         * operation, which is what makes "the credential is Pico's" a property
         * of the shape rather than a promise about behaviour.
         *
         * A person may only supply one for themselves, because `principal` is
         * where the identity comes from - there is no argument for it, which
         * is ADR 0148 EX2's construction applied to a second subject.
         */
        /**
         * ADR 0142 PE1/PE2 with ADR 0152. The person points the Home at a host.
         *
         * **Returns as soon as the work starts.** Measuring is minutes - long
         * generations at several context widths, an unload to time a cold load,
         * two jobs at once to count lanes - so a caller that waited would be a
         * window holding a socket open while somebody's card worked. What comes
         * back is that it began; `home.model.provider.measurements.read` says
         * how it went.
         *
         * The entry it produces is *undecided* and carries `live_turn`. ADR
         * 0151 PV1 keeps the wider allowance something a credential buys, and a
         * measurement grants nothing - ADR 0152's decision surface is what asks.
         */
        case 'home.model.provider.measure.ask': {
          if (principal === undefined
            || typeof args.reach !== 'string'
            || typeof args.model !== 'string'
            || typeof args.providerClass !== 'string'
            || (args.credentialRef !== undefined && typeof args.credentialRef !== 'string')
            || (args.credential !== undefined && typeof args.credential !== 'string')
            || !picoModelProviderClasses.includes(args.providerClass as never)) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const reach = args.reach.trim();
          const model = args.model.trim();
          if (reach === '' || model === '') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          let entryId: string;
          try {
            entryId = picoModelProviderEntryIdFor(model);
          } catch {
            return { outcome: 'invalid_arguments', result: { refusal: 'model_has_no_name' } };
          }
          /**
           * ADR 0151 PV1. A host that reads a credential is measured with one.
           *
           * **Nothing about a secured host is measurable without it.** Every
           * probe the measurement makes is a request, so an unauthenticated
           * run against an authenticating proxy observes a 401 at
           * `/api/version` and stops - no window, no throughput, no lanes, and
           * an entry nobody can write. The secret is opened here, from the
           * seal this person submitted under this exact name, and lives for
           * the length of one measurement.
           *
           * **A reference that names nothing refuses rather than measuring
           * openly.** Falling back to an unauthenticated run would answer a
           * different question than the one asked and put its answer in the
           * same field - a report saying the host refuses everything, about a
           * host that was never asked properly. ADR 0142 PE2 is what forbids
           * that: an entry carries what was observed, and a measurement of the
           * wrong path observed nothing about this one.
           *
           * The credential rides on the measurement and buys no allowance:
           * PV1's proof is spent by a person at `decision.submit`, and the
           * entry this run writes still carries `live_turn`.
           */
          let credential: string | undefined;
          let credentialRefToSeal: string | undefined;
          if (args.credential !== undefined) {
            /**
             * **The first measurement of a secured host, which had no path at
             * all.** `putCredential` refuses an entry that does not exist, an
             * entry exists only once a measurement has written one, and a
             * measurement of a host behind an authenticating proxy needs the
             * credential to get past `/api/version`. Three rules that each
             * hold on their own, closing a circle nobody drew: on a Home that
             * has never measured this host, no order of the existing calls
             * reaches it.
             *
             * So the secret may arrive with the ask, and it is *sealed after
             * the entry lands* rather than before - which keeps
             * `putCredential`'s rule exactly as it was, and leaves a
             * measurement that failed holding nobody's secret.
             *
             * It travels on this route once, the way it travels on
             * `credential.submit` once: there is no read operation, and a
             * re-measurement names the reference instead.
             */
            if (args.credential === ''
              || typeof args.credentialRef !== 'string'
              || args.credentialRef === '') {
              return { outcome: 'invalid_arguments', result: {} };
            }
            credential = args.credential;
            credentialRefToSeal = args.credentialRef;
          } else if (args.credentialRef !== undefined) {
            if (args.credentialRef === '') {
              return { outcome: 'invalid_arguments', result: {} };
            }
            const seal = store.picoModelProviderConsent().credentialSealFor(
              entryId,
              principal.picoIdentityFingerprintHex,
              args.credentialRef,
            );
            if (seal === undefined) {
              return {
                outcome: 'invalid_arguments',
                result: { refusal: 'pico_model_provider_credential_not_held' },
              };
            }
            const opened = modelProviderCredentials.open({
              seal: seal as PicoModelProviderCredentialSeal,
              entryId,
              picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
              credentialRef: args.credentialRef,
            });
            if (opened.status !== 'ok') {
              // ADR 0072 R6. A restored database holds the seal and no key,
              // which is a Home that cannot prove who it is - said in those
              // words rather than measured as a host that refuses everything.
              return {
                outcome: 'invalid_arguments',
                result: { refusal: 'pico_model_provider_credential_key_unavailable' },
              };
            }
            credential = opened.secret;
          }

          const providerClass = args.providerClass as PicoModelProviderClass;
          const startedAt = new Date().toISOString();
          const started = modelProviderMeasurements.start({
            entryId, reach, model, providerClass, at: startedAt,
          });
          if (!started.ok) {
            return { outcome: 'invalid_arguments', result: { refusal: started.refusal } };
          }
          const announce = (payload: Record<string, unknown>): void => {
            const event = factory.create({
              deviceId: config.deviceId,
              type: 'home.model_provider_measurement_changed',
              payload,
            });
            store.append(event);
            broadcast(event);
          };
          announce({ entryId, model, reach, providerClass, state: 'running' });

          /**
           * Not awaited, and the failure path is the reason it is safe: every
           * outcome lands in the live view and in the log, so a measurement
           * that throws is a measurement a person can read about rather than an
           * unhandled rejection.
           */
          void (async () => {
            try {
              const measurer = new PicoModelProviderMeasurer({
                reach, model, providerClass, entryId,
                ...(credential === undefined ? {} : { credential }),
                /**
                 * ADR 0142's *residency is part of availability*, as a
                 * requirement rather than a flag.
                 *
                 * The option exists for the development script's `--cold`, and
                 * leaving it off here produced a measurement that ran fine and
                 * then refused with `pico_model_provider_measured_no_residency`
                 * - because an entry without a warm-up cost is one ADR 0118
                 * O2's absence threshold cannot be set against, so the
                 * conversion will not build it. There is one right answer from
                 * the product and this is it.
                 *
                 * Lane counting needs no flag: it is on unless switched off,
                 * and an unmeasured provider has one lane by ADR 0142's default
                 * rather than by omission.
                 */
                measureColdLoad: true,
                log: (line: string) => app.log.info({ entryId, reach }, line),
              });
              const report = await measurer.measure();
              const entry = picoModelProviderEntryFromMeasurement(report, {
                entryId, providerClass, measuredAt: new Date().toISOString(),
              });
              // ADR 0142 PE1. The first caller this has ever had outside a test.
              store.picoModelProviderRegistry().put(entry, new Date().toISOString());
              if (credentialRefToSeal !== undefined && credential !== undefined) {
                // Now there is an entry for it to belong to, and a measurement
                // that says what the far side does with it.
                store.picoModelProviderConsent().putCredential({
                  entryId,
                  picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
                  credentialRef: credentialRefToSeal,
                  seal: modelProviderCredentials.seal({
                    entryId,
                    picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
                    credentialRef: credentialRefToSeal,
                    secret: credential,
                  }),
                  at: new Date().toISOString(),
                });
              }
              modelProviderMeasurements.settle({
                entryId, at: new Date().toISOString(), notes: report.notes,
              });
              announce({ entryId, model, reach, providerClass, state: 'settled' });
            } catch (error: unknown) {
              /**
               * ADR 0118 O4. A host that could not be measured is a fact about
               * the host, said in the words the measurement used. Every refusal
               * `picoModelProviderEntryFromMeasurement` throws is one a person
               * can act on - a context that spilled, a residency it could not
               * time - so none of them are flattened into "failed".
               */
              const refusal = error instanceof Error ? error.message : 'measurement_failed';
              modelProviderMeasurements.settle({
                entryId, at: new Date().toISOString(), refusal,
              });
              announce({ entryId, model, reach, providerClass, state: 'failed', refusal });
            }
          })();

          return { outcome: 'ok', result: { entryId, state: 'running' } };
        }
        /**
         * ADR 0142 PE1. Forgets a measured machine, and every decision about
         * it.
         *
         * **The decisions go rather than being revoked.** Revoking keeps the
         * row so "withdrew" stays distinguishable from "never asked", which is
         * right while the entry exists; once it does not, there is nothing for
         * that distinction to be about, and an entry id derived from the model
         * name means a later measurement of the same model would inherit
         * somebody's old answer about a different finding.
         */
        case 'home.model.provider.forget': {
          if (principal === undefined || typeof args.entryId !== 'string') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const registry = store.picoModelProviderRegistry();
          if (registry.get(args.entryId) === undefined) {
            return { outcome: 'invalid_arguments', result: { refusal: 'not_measured' } };
          }
          store.picoModelProviderConsent().forget(args.entryId);
          registry.remove(args.entryId);
          return { outcome: 'ok', result: { forgotten: true } };
        }
        case 'home.model.provider.credential.submit': {
          if (principal === undefined
            || typeof args.entryId !== 'string'
            || typeof args.credentialRef !== 'string'
            || typeof args.secret !== 'string'
            || args.credentialRef === ''
            || args.secret === ''
            || Object.keys(args).length !== 3) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          try {
            store.picoModelProviderConsent().putCredential({
              entryId: args.entryId,
              picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
              credentialRef: args.credentialRef,
              seal: modelProviderCredentials.seal({
                entryId: args.entryId,
                picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
                credentialRef: args.credentialRef,
                secret: args.secret,
              }),
              at: new Date().toISOString(),
            });
          } catch (error) {
            return {
              outcome: 'invalid_arguments',
              result: { refusal: error instanceof Error ? error.message : 'refused' },
            };
          }
          return { outcome: 'ok', result: { credentialRef: args.credentialRef } };
        }
        case 'home.model.provider.decision.submit': {
          if (principal === undefined
            || typeof args.entryId !== 'string'
            || typeof args.providerClass !== 'string'
            || typeof args.carries !== 'string') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          try {
            store.picoModelProviderConsent().decide({
              entryId: args.entryId,
              picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
              providerClass: args.providerClass as PicoModelProviderClass,
              carries: args.carries as PicoModelProviderAllowance,
              ...(typeof args.credentialRef === 'string'
                ? { credentialRef: args.credentialRef }
                : {}),
              at: new Date().toISOString(),
            });
          } catch (error) {
            // The refusal travels as itself. ADR 0151 PV4's missing credential
            // is a sentence about what the decision needed, and a device that
            // received `invalid_arguments` would have to guess it.
            return {
              outcome: 'invalid_arguments',
              result: { refusal: error instanceof Error ? error.message : 'invalid' },
            };
          }
          return { outcome: 'ok', result: { decided: true } };
        }
        case 'home.model.provider.decision.revoke': {
          if (principal === undefined || typeof args.entryId !== 'string') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          store.picoModelProviderConsent().revoke(
            args.entryId,
            principal.picoIdentityFingerprintHex,
            new Date().toISOString(),
          );
          return { outcome: 'ok', result: { revoked: true } };
        }
        case 'home.storage.condition.read': {
          if (Object.keys(args).length !== 0) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          return {
            outcome: 'ok',
            result: toPicoHomeStorageConditionView(store.storageCondition()) as unknown as
              Record<string, unknown>,
          };
        }
        // ADR 0118 O1. Which entries are due, so the person's own device can
        // say something is waiting. No title: that is domain content behind
        // custody rules, and a Link read must satisfy them rather than route
        // around them - so the device says that something is due and since
        // when, and the person opens their Home to see what.
        case 'home.time_bound_entries.read': {
          if (Object.keys(args).length !== 0) {
            return { outcome: 'invalid_arguments', result: {} };
          }
          const memory = store.memory();

          // ADR 0127 M1. Which entries are due and how they read is the
          // calendar module's composition; what a caller is allowed to see
          // stays here. The ports below are the whole of what the module gets:
          // no store, no app, no readership object - it asks, and this decides.
          const view = picoCalendarDueEntriesView({
              now: () => new Date(),
              timeBoundEntries: (limit) => store.picoTimeBoundEntries(limit),
              countDueEntries: (nowIso) => store.picoDueTimeBoundEntryCount(nowIso),
              // Readership is asked per entry, not per request. ADR 0077 keeps
              // "may use this Home" separate from "may read this domain", and
              // the Link's own authorization only answers the first - so a
              // sender with a grant on one domain and none on another gets
              // exactly one title.
              //
              // The channel is named rather than dressed as a session: this
              // principal came from a sealed envelope, and the
              // membership-backed policy keys on the identity alone.
              readTitle: ({ memoryItemId, privacyDomain }) => {
                if (!readership.mayRead({
                  sessionDigest: 'pico-link-direct',
                  picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
                }, privacyDomain)) {
                  return undefined;
                }
                const content = memory.getInDomain(memoryItemId, privacyDomain)?.content;
                if (typeof content !== 'string' || content.trim() === '') {
                  // Shredded, undecryptable, or simply gone. One silence for
                  // all of them: telling them apart would make this reply a
                  // grant oracle.
                  return undefined;
                }
                return content;
              },
            });
          // ADR 0127 M5. The total travels with the list. Dropping it here
          // would put the cap back on the wire and leave the asking device
          // counting what fitted rather than what is due.
          return { outcome: 'ok', result: { entries: view.entries, total: view.total } };
        }
        /**
         * ADR 0118 O1. The device says it told the person.
         *
         * Opted in per operation (ADR 0107) because the device is the only
         * party that knows. It names an entry it was given by the read above,
         * so it discloses nothing it was not already told.
         */
        case 'home.time_bound_entry.acknowledge': {
          const memoryItemId = args.memoryItemId;
          if (Object.keys(args).length !== 1 || typeof memoryItemId !== 'string' || memoryItemId === '') {
            return { outcome: 'invalid_arguments', result: {} };
          }
          return {
            outcome: 'ok',
            result: {
              memoryItemId,
              acknowledged: store.markPicoTimeBoundEntryRaised({
                memoryItemId,
                raisedAt: new Date().toISOString(),
              }),
            },
          };
        }
        /**
         * ADR 0148 EX1/EX2. One round trip, both directions.
         *
         * **The device is never an argument.** It comes from `principal`,
         * which ADR 0107 authenticated and whose delegation and membership
         * were checked before this switch was reached. A device naming its own
         * peer key would be a device choosing which mailbox it is, so the
         * request payload has no field for one and this handler has nowhere to
         * read one from.
         *
         * The Home issues its address before recording the device's, in one
         * write, because a half-finished exchange is a relationship one side
         * can reach and the other cannot.
         */
        case 'home.link.mailbox.exchange': {
          let exchange: ReturnType<typeof parsePicoLinkMailboxExchangeRequest>;
          try {
            exchange = parsePicoLinkMailboxExchangeRequest({
              schema: picoLinkMailboxExchangeRequestSchema,
              ...args,
            });
          } catch {
            return { outcome: 'invalid_arguments', result: {} };
          }

          // Issued by this Home, for this device. Fresh every exchange, which
          // is what makes re-running it the rotation ADR 0148 EX4 describes
          // rather than a no-op.
          const mailbox = randomBytes(16).toString('hex');
          const homeInbound = formatPicoLinkPacketAddress({
            mailbox,
            operator: relayOperator,
          });

          // **Registered before it is handed over**, which closes ADR 0148's
          // named precondition. The other order looks harmless and is not: a
          // device given an address that does not exist at the operator writes
          // into nothing, and both sides believe the exchange succeeded. A
          // refused registration therefore fails the exchange rather than
          // being logged - the device retries, and retrying is free because
          // re-exchange is rotation.
          //
          // Absent transport is a deployment without a relay, which is the
          // ordinary state of a Home whose owner has not chosen an operator
          // (the default resolves nowhere on purpose). The exchange still
          // records the pair, so the direct path is unaffected.
          if (relayTransport !== undefined) {
            try {
              await relayTransport.register({
                mailbox,
                capacity: defaultPicoLinkMailboxCapacity,
              });
            } catch (error) {
              app.log.warn(
                { reason: error instanceof Error ? error.message : 'failed' },
                'Relay mailbox registration failed; the exchange was refused.',
              );
              return { outcome: 'unavailable', result: {} };
            }
          }

          try {
            const record = store.exchangePicoLinkMailbox({
              principal,
              homeInbound,
              deviceInbound: exchange.deviceInbound,
              exchangedAt: new Date().toISOString(),
            });
            return {
              outcome: 'ok',
              result: {
                schema: picoLinkMailboxExchangeResponseSchema,
                homeInbound: record.homeInbound,
                // Echoed from the principal so the device can check the Home
                // answered the key it signed with (ADR 0148 EX2).
                peerFingerprintHex: record.deviceSigningKeyFingerprintHex,
              },
            };
          } catch (error) {
            const reason = error instanceof Error ? error.message : 'failed';
            if (reason === 'pico_link_outbound_shared_between_peers'
              || reason === 'pico_link_mailbox_points_at_itself') {
              // The device handed us an address another device already gave
              // us, or our own. Both are the device's input and neither is a
              // fault of this Home, so they answer as a refused argument
              // rather than as a failure.
              return { outcome: 'invalid_arguments', result: {} };
            }
            throw error;
          }
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
            scheduleAfterReply(() => {
              homeHostKeyStore.promoteStagedRotation();
              homeHostKeys = homeHostKeyStore.load(sodium);
            });
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
          /**
           * ADR 0107. Unreachable twice over, and the second one is the point.
           *
           * The intake refuses anything not on the closed list before a
           * principal exists, so nothing arrives here. What this line adds is
           * the *other* direction: an operation added to the list with no case
           * written for it would compile, and a device would get
           * `unknown_operation` for something the protocol advertises. The
           * `never` makes that a build failure instead of a refusal somebody
           * has to reproduce.
           */
          const unhandled: never = operation;
          void unhandled;
          return { outcome: 'unknown_operation', result: {} };
        }
      }
  };

  app.post('/api/home/link', {
    bodyLimit: MAX_PICO_LINK_DIRECT_REQUEST_BODY_BYTES,
  }, async (request, reply) => {
    // ADR 0115 U3. The reply to a host-rotation submit is the last message of
    // the old era: the client can only verify it under the pin it still
    // holds, so custody must not swap until the response is sealed and
    // signed. The handler schedules the swap; it runs after the envelope is
    // built, and a crash in between is completed at the next boot.
    let afterReply: (() => void) | undefined;
    const handled = await linkIntake.handle(
      request.body,
      async (operation, args, principal) => await dispatchPicoLinkOperation(
        operation,
        args,
        principal,
        (run) => {
          afterReply = run;
        },
      ),
    );

    if (!handled.ok) {
      // ADR 0119 Q4. A quota refusal is its own status, because folding it into
      // the generic 400 would tell a well-behaved peer that its envelope was
      // malformed when in fact it was fine and merely early.
      //
      // No `Retry-After`. The header would have to be computed from whichever
      // bucket refused, and the two buckets refill at different rates - so a
      // truthful hint would say which tier the sender is in, which is the
      // membership oracle the single shared reason exists to prevent.
      if (handled.reason === 'quota_exceeded') {
        return sendNoStore(reply.code(429), { error: handled.reason });
      }
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
      const foundingRecord: PicoHomeFoundingRecord = {
        schema: picoHomeFoundingRecordSchema,
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
    const result = recordHomeMembershipLifecycle(request.body);
    return sendNoStore(reply.code(result.statusCode), result.body);
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

      /**
       * Befund B110: nur ein Satz, der fuer eine Person geschrieben wurde.
       *
       * Vorher ging hier `error.message` hinaus, welcher auch immer - eine
       * Bibliotheksmeldung oder ein `TypeError` an einen Anrufer, der diese
       * Route mit einem Bootstrap-Code und ohne Sitzung erreicht.
       */
      return reply.code(400).send({
        error: error instanceof OperatorRequestError
          ? error.message
          : 'That was not accepted.',
      });
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

      // Befund B110, wie oben: der kuratierte Satz oder gar keiner.
      return reply.code(400).send({
        error: error instanceof OperatorRequestError
          ? error.message
          : 'That was not accepted.',
      });
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

  /**
   * ADR 0152 SE1/SE3/SE5. What a person decides with, beside what was measured.
   *
   * The consequence comes first and the measurement stands behind it, so the
   * simple layer is a sentence rather than a table. What this route does *not*
   * do is decide anything: SE4's rule lives in the store, so a narrowing
   * refused here is refused identically by anything else that writes one.
   */
  /**
   * ADR 0152. What this person, specifically, may reach - and nothing about
   * anybody else's answer to the same finding.
   */
  function decidingPerson(request: FastifyRequest): string | undefined {
    const authority = resolveAuthority(request.headers.authorization);
    return authority.kind === 'pico-identity'
      ? authority.principal.picoIdentityFingerprintHex
      : undefined;
  }

  /**
   * ADR 0143 DP1. A person says this material may be here, and is named for
   * saying it.
   *
   * **Attaching creates no reach.** ADR 0138 CO3/CO4 default both fetch
   * switches off, and this route does not touch them: saying "this corpus is
   * mine" and saying "go and get it, unwatched" are two decisions, and a route
   * that did both would collapse them at the moment a person was least likely
   * to notice.
   */
  app.post('/api/depot/attachments', async (request, reply) => {
    const person = decidingPerson(request);
    if (person === undefined) {
      // ADR 0087. Administration installs and backs up; whose corpus this is
      // is not administration's to answer.
      return sendNoStore(reply.code(403), { error: 'pico_depot_attachment_is_personal' });
    }
    const body = request.body as { remote?: unknown; commit?: unknown } | undefined;
    try {
      const attachment = store.attachPicoDepot({
        pin: { remote: body?.remote, commit: body?.commit },
        acceptedAt: new Date().toISOString(),
        acceptedBy: person,
      });
      return sendNoStore(reply.code(201), {
        depot: {
          remote: attachment.pin.remote,
          commit: attachment.pin.commit,
          acceptedAt: attachment.acceptedAt,
          // Said back rather than assumed, and this one decides something: the
          // name recorded here is whose decision governs where this material
          // may later be read. A person who attached a corpus and was not
          // recorded would get no reads and no reason.
          acceptedBy: attachment.acceptedBy ?? null,
          // Said back for the same reason: a person who attached something is
          // owed the fact that nothing will be fetched until they say so.
          mayFetch: attachment.mayFetch,
          mayFetchUnasked: attachment.mayFetchUnasked,
        },
      });
    } catch (error) {
      // The pin parser's refusal travels out as itself - a remote that is not
      // a remote and a commit that is not a commit are different mistakes.
      return sendNoStore(reply.code(400), {
        error: error instanceof Error ? error.message : 'invalid_pico_depot_pin',
      });
    }
  });

  /**
   * ADR 0116 W5, and the reason this is a route rather than a line in the
   * sweep.
   *
   * **"No auto-persist of derived output."** A reader's values are derived
   * from material Pico did not author, and a result that became a memory item
   * on its own would be the replication step the planner-reader split, the
   * origin labels and the quarantined read were all built to remove. The last
   * inch is a person, and it is this route.
   *
   * What gets written keeps its provenance: ADR 0136 BR6's derivation names
   * the supplier and the commit, and `pinCoversContent` is asked rather than
   * assumed - a partial derivation cannot be constructed, so an item either
   * says what covers it or is not written.
   */
  app.post('/api/model/jobs/:jobId/keep', async (request, reply) => {
    const person = decidingPerson(request);
    if (person === undefined) {
      return sendNoStore(reply.code(403), { error: 'pico_kept_memory_is_personal' });
    }
    const jobId = (request.params as { jobId: string }).jobId;
    const kept = store.picoModelJobQueue().keptView(jobId);
    if (kept === undefined) {
      return sendNoStore(reply.code(404), { error: 'pico_model_job_not_found' });
    }
    if (kept.picoIdentityFingerprintHex !== person) {
      // Somebody else's read of somebody else's material. Not found rather
      // than forbidden: whose jobs exist is not this caller's business either.
      return sendNoStore(reply.code(404), { error: 'pico_model_job_not_found' });
    }
    if (kept.outcome !== 'answered' || kept.values === undefined) {
      return sendNoStore(reply.code(409), {
        error: 'pico_model_job_has_no_answer',
        outcome: kept.outcome,
      });
    }

    const memoryItemId = `memory_${createHash('sha256')
      .update(`kept\u0000${jobId}`).digest('hex').slice(0, 32)}`;
    try {
      /**
       * ADR 0126 P3, the same door as the Link operation above. No presence
       * is named here and that is honest rather than missing: this arrives
       * over a Foundation session, which is a person at a browser rather than
       * a device that has announced itself.
       */
      const crossed = crossPicoStateBoundary({
        store,
        kind: 'answered_read',
        privacyDomain: kept.privacyDomain,
        owner: `pico:identity:${person}`,
        controller: `pico:identity:${person}`,
        contentType: 'application/json',
        // The declared values, canonically. Not prose: ADR 0117 X2 kept the
        // reader's answer to named values, and flattening them into a sentence
        // here would give back the channel that closed.
        content: JSON.stringify(kept.values),
        sourceCount: 1,
        deviceId: config.deviceId,
        memoryItemId,
        derivedFrom: buildPicoLibraryDerivation({
          supplierIdentifier: kept.supplierIdentifier,
          pin: { kind: 'commit', value: kept.commit },
          pinCoversContent: kept.pinCoversContent,
        }),
        appendEvent: ({ type, payload }) => {
          const crossingEvent = factory.create({
            deviceId: config.deviceId,
            type,
            payload,
          });
          store.append(crossingEvent);
          broadcast(crossingEvent);
        },
      });
      if (!crossed.ok) {
        return sendNoStore(reply.code(400), { error: crossed.refusal });
      }
      // ADR 0071. What the job became, so the person can unmake it.
      store.picoModelJobQueue().markKept({
        jobId,
        memoryItemId,
        privacyDomain: kept.privacyDomain,
      });
      return sendNoStore(reply.code(201), { memoryItemId: crossed.item.memoryItemId });
    } catch (error) {
      return sendNoStore(reply.code(400), {
        error: error instanceof Error ? error.message : 'pico_kept_memory_refused',
      });
    }
  });

  app.get('/api/model/providers/mine', async (request, reply) => {
    const person = decidingPerson(request);
    if (person === undefined) {
      return sendNoStore(reply.code(403), { error: 'pico_model_provider_decision_is_personal' });
    }
    return sendNoStore(reply, {
      providers: store.picoModelProviderConsent().listFor(person).map((entry) => ({
        entryId: entry.entryId,
        model: entry.model.identifier,
        providerClass: entry.providerClass,
        sees: entry.carries === 'live_turn'
          ? 'this conversation only'
          : 'this conversation and what Pico remembers',
        contextTokens: entry.measurement.capacity.contextTokens,
      })),
    });
  });

  app.post('/api/model/providers/:entryId/decision', async (request, reply) => {
    const person = decidingPerson(request);
    if (person === undefined) {
      // ADR 0087. An operator session reaches this route's class and stops
      // here: administration is not a voice that may answer for a resident.
      return sendNoStore(reply.code(403), { error: 'pico_model_provider_decision_is_personal' });
    }
    const body = request.body as {
      providerClass?: unknown;
      carries?: unknown;
      credentialRef?: unknown;
    } | undefined;
    if (typeof body?.providerClass !== 'string' || typeof body.carries !== 'string') {
      return sendNoStore(reply.code(400), { error: 'invalid_pico_model_provider_decision' });
    }
    try {
      store.picoModelProviderConsent().decide({
        entryId: (request.params as { entryId: string }).entryId,
        picoIdentityFingerprintHex: person,
        providerClass: body.providerClass as PicoModelProviderClass,
        carries: body.carries as PicoModelProviderAllowance,
        ...(typeof body.credentialRef === 'string' ? { credentialRef: body.credentialRef } : {}),
        at: new Date().toISOString(),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'invalid';
      // The parser's refusals travel out as they are: ADR 0151 PV4's missing
      // credential is a sentence about what the decision needed, and turning
      // it into a generic 400 would make the surface guess at the reason.
      return sendNoStore(
        reply.code(reason === 'pico_model_provider_entry_not_found' ? 404 : 400),
        { error: reason },
      );
    }
    return sendNoStore(reply.code(201), { decided: true });
  });

  app.delete('/api/model/providers/:entryId/decision', async (request, reply) => {
    const person = decidingPerson(request);
    if (person === undefined) {
      return sendNoStore(reply.code(403), { error: 'pico_model_provider_decision_is_personal' });
    }
    // ADR 0048's standing consent is revocable, and revoking is not deleting:
    // the row keeps its date so "withdrew" stays distinguishable from "never
    // asked".
    store.picoModelProviderConsent().revoke(
      (request.params as { entryId: string }).entryId,
      person,
      new Date().toISOString(),
    );
    return sendNoStore(reply.code(200), { revoked: true });
  });

  app.get('/api/model/providers', async (_request, reply) => {
    const registry = store.picoModelProviderRegistry();
    const queue = store.picoModelJobQueue();
    return sendNoStore(reply, {
      providers: registry.list().map((record) => {
        const effective = picoModelProviderEffectiveEntry(record);
        return {
          entryId: record.entry.entryId,
          model: record.entry.model.identifier,
          providerClass: record.entry.providerClass,
          // ADR 0152 SE5. What it last did, derived from settled jobs.
          state: picoModelProviderState(queue.observationFor(record.entry.entryId)),
          // ADR 0152 SE1. The consequence, in words, before any number.
          sees: record.entry.carries === 'live_turn'
            ? 'this conversation only'
            : 'this conversation and what Pico remembers',
          needsCredentialToSeeMore: record.entry.credentialRef === undefined,
          measured: {
            at: record.entry.measurement.measuredAt,
            contextTokens: record.entry.measurement.capacity.contextTokens,
            generationTokensPerSecond:
              record.entry.measurement.capacity.generationTokensPerSecond,
            promptTokensPerSecond: record.entry.measurement.capacity.promptTokensPerSecond,
            concurrentJobs: record.entry.measurement.capacity.concurrentJobs,
            coldLoadMs: record.entry.measurement.residency.coldLoadMs,
            modelDigestHex: record.entry.model.digestHex,
          },
          narrowing: record.narrowing,
          effective: {
            contextTokens: effective.measurement.capacity.contextTokens,
            concurrentJobs: effective.measurement.capacity.concurrentJobs,
          },
        };
      }),
    });
  });

  app.post('/api/model/providers/:entryId/narrowing', async (request, reply) => {
    const { entryId } = request.params as { entryId: string };
    const body = request.body as { contextTokens?: unknown; concurrentJobs?: unknown } | undefined;
    const narrowing: { contextTokens?: number; concurrentJobs?: number } = {};
    for (const field of ['contextTokens', 'concurrentJobs'] as const) {
      const value = body?.[field];
      if (value === undefined || value === null) {
        continue;
      }
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        return sendNoStore(reply.code(400), { error: `invalid_${field}` });
      }
      narrowing[field] = value;
    }
    try {
      store.picoModelProviderRegistry().narrow(entryId, narrowing, new Date().toISOString());
    } catch (error) {
      if (error instanceof PicoModelProviderNarrowingError) {
        // ADR 0152 SE4 with ADR 0119 Q5. The refusal names the measurement it
        // was measured against, because "too large" without the number is a
        // person guessing at what would fit.
        return sendNoStore(reply.code(409), {
          error: error.refusal,
          measured: error.measured,
        });
      }
      return sendNoStore(reply.code(404), { error: 'pico_model_provider_entry_not_found' });
    }
    return sendNoStore(reply.code(200), { narrowing });
  });

  /**
   * ADR 0104 S3. The decision this Pico is running under, and where it came
   * from.
   */
  app.get('/api/link/relay-identity', async (_request, reply) => {
    const identity = store.picoLinkRelayIdentity();
    return sendNoStore(reply, {
      ...(identity === undefined ? {} : {
        operator: identity.operator,
        accountId: identity.accountId,
        decided: !identity.inheritedFromHost,
        decidedAt: identity.decidedAt,
      }),
      // ADR 0148. What a change would cost, said before anybody asks for one.
      mailboxes: store.picoLinkMailboxes().length,
    });
  });

  app.post('/api/link/relay-identity', async (request, reply) => {
    const body = request.body as { operator?: unknown; accountId?: unknown } | undefined;
    if (typeof body?.operator !== 'string' || typeof body.accountId !== 'string'
      || body.operator === '' || body.accountId === '') {
      return sendNoStore(reply.code(400), { error: 'invalid_pico_link_relay_identity' });
    }
    const decided = store.decidePicoLinkRelayIdentity({
      operator: body.operator,
      accountId: body.accountId,
      at: new Date().toISOString(),
      inheritedFromHost: false,
    });
    if (!decided.ok) {
      // ADR 0148. Not a validation failure - a move. Every mailbox is an
      // address at this operator under this account, so changing it strands
      // all of them and each relationship needs a fresh exchange.
      return sendNoStore(reply.code(409), {
        error: decided.reason,
        mailboxes: decided.mailboxes,
      });
    }
    return sendNoStore(reply.code(200), {
      operator: body.operator,
      accountId: body.accountId,
      decided: true,
      appliesAtNextStart: true,
    });
  });

  app.get('/api/memory/encryption', async (_request, reply) => {
    const decided = store.picoMemoryEncryptionDecision();
    return sendNoStore(reply, {
      enabled: memoryEncryptionDecision,
      // Inherited and decided are different facts, and a surface that showed
      // them alike would be inventing consent.
      decided: decided !== undefined && !decided.inheritedFromHost,
      ...(decided === undefined ? {} : { decidedAt: decided.decidedAt }),
    });
  });

  app.post('/api/memory/encryption', async (request, reply) => {
    const enabled = (request.body as { enabled?: unknown } | undefined)?.enabled;
    if (typeof enabled !== 'boolean') {
      return sendNoStore(reply.code(400), { error: 'invalid_memory_encryption_decision' });
    }
    store.decidePicoMemoryEncryption({
      enabled,
      at: new Date().toISOString(),
      inheritedFromHost: false,
    });
    return sendNoStore(reply.code(200), {
      enabled,
      decided: true,
      // **Said back rather than left to be discovered.** The key store is
      // built before this process opened its database, so a decision taken now
      // is a decision the next start reads. A surface that implied otherwise
      // would have a person believing their content changed posture while it
      // sat exactly as it was.
      appliesAtNextStart: enabled !== memoryEncryptionDecision,
    });
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

    const { removedKeyVersions, removedObservations } = shredDomainWithAudit(
      store.memory(),
      (audit) => {
        appendServerEvent('memory.domain_shredded', audit);
      },
      {
        privacyDomain,
        ...(body.reason === undefined ? {} : { reason: body.reason as string }),
      },
      // ADR 0129 SR2. The observation buffer is a store the core owns, so the
      // shred reaches it too. Deleted rather than made unreadable: these rows
      // carry no key envelope, and data designed not to outlive its window has
      // nothing worth leaving behind undecryptable.
      (domain) => store.deletePicoObservationsInDomain(domain),
    );

    request.log.warn(
      { privacyDomain, removedKeyVersions, removedObservations },
      'Privacy domain crypto-shredded.',
    );
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

      // ADR 0118 O1. An optional instant turns this into a time-bound entry.
      const dueAt = request_.dueAt;

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
      if (typeof dueAt === 'string') {
        store.setPicoTimeBoundEntryDue({ memoryItemId, dueAt });
      }
      // ADR 0129 SR3. A place is a core column, set the same way a due
      // instant is: the item exists first, and the capability is attached to
      // it rather than being a second kind of item.
      if (request_.place !== undefined) {
        store.setPicoMemoryItemPlace({ memoryItemId, place: request_.place });
      }

      const recordedPayload: MemoryRecordedPayload = {
        memoryItemId,
        privacyDomain: request_.privacyDomain,
        contentType: request_.contentType,
        ...(request_.summary === undefined ? {} : { summary: request_.summary }),
        ...(typeof dueAt === 'string' ? { dueAt } : {}),
      } as MemoryRecordedPayload;

      const recordedEvent = {
        ...factory.create({
          deviceId: request_.deviceId,
          sessionId: request_.sessionId,
          // The event names what was recorded. A commitment with an instant is
          // a different thing from a note, and a reader should not have to
          // inspect the payload to find that out.
          type: typeof dueAt === 'string'
            ? 'memory.time_bound_entry_recorded'
            : 'memory.recorded',
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

  // ADR 0119 Q4. Sockets that never send a request are bounded by nothing
  // above: the in-flight cap only counts requests. Set before `listen`, so it
  // is in force from the first accepted connection.
  app.server.maxConnections = config.foundationMaxConnections
    ?? defaultPicoFoundationMaxConnections;

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
    if (record.schema !== picoHomeFoundingRecordSchema) {
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
    // ADR 0136 BR6 with ADR 0117 X5. Provenance leaves with the content for
    // the same reason the origin class does: a receiver that gets the text and
    // not where it came from has no way to present it as anything but Pico's.
    ...(item.derivedFrom === undefined ? {} : { derivedFrom: item.derivedFrom }),
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
    // ADR 0118 O1. A time-bound entry is a memory item like any other, so it
    // gets the same read-time resolution; leaving it out would make a reminder
    // the one reference whose target could vanish unnoticed.
    if (event.type !== 'memory.recorded'
      && event.type !== 'memory.time_bound_entry_recorded') {
      return event;
    }

    const payload = event.payload as MemoryRecordedPayload;
    const resolutionState = memory.resolutionState(payload.memoryItemId, payload.privacyDomain);
    if (event.type !== 'memory.time_bound_entry_recorded') {
      return { ...event, payload: { ...payload, resolutionState } };
    }
    // ADR 0118 O1. Whether an entry has been raised changes after the event
    // was written, so the event cannot carry it - a surface reading only
    // events would show every reminder as forever pending. Projected here for
    // the same reason `resolutionState` is, and the stored event is unchanged.
    const raisedAt = memory.raisedAt(payload.memoryItemId);
    return {
      ...event,
      payload: {
        ...payload,
        resolutionState,
        ...(raisedAt === undefined ? {} : { raisedAt }),
      },
    };
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
    if (!['privacyDomain', 'contentType', 'content', 'summary', 'owner', 'controller', 'retentionPolicyRef', 'dueAt', 'place'].includes(key)) {
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

  // ADR 0118 O1. Canonical, not merely parseable: two spellings of the same
  // instant sort apart, and this value decides when something reaches the
  // person.
  // Befund B52. Hier stand nur die Rundlaufhaelfte - und der Kommentar
  // darueber sagt selbst, dass dieser Wert entscheidet, wann etwas eine Person
  // erreicht. `+275760-…` kam durch und sortiert vor jedem gewoehnlichen Jahr.
  if (payload.dueAt !== undefined && !isPicoInstant(payload.dueAt)) {
    return { ok: false, error: 'dueAt must be a canonical ISO-8601 instant when provided.' };
  }

  // ADR 0129 SR3. All three parts or none, refused here so a caller that lost
  // one is told which rather than meeting a column constraint. The meaning of
  // the three values is the protocol's, so this cannot drift from what a
  // location fix considers usable.
  if (payload.place !== undefined) {
    try {
      parsePicoPlace(payload.place);
    } catch (error) {
      return {
        ok: false,
        error: `place is not a usable position (${error instanceof Error ? error.message : 'unknown'}).`,
      };
    }
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
      dueAt: payload.dueAt as string | undefined,
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
