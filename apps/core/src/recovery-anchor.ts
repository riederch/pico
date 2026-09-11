import { hexOfBytesPattern } from '@pico/protocol/canonical-bytes';
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  verifyPicoPlatformAnchorGeneration,
  type PicoPlatformAnchorCounter,
} from './platform-anchor.js';

/**
 * ADR 0110 R6. The consumption anchor.
 *
 * The gap this closes: pending and consumed recovery state lives in the
 * Foundation database, so a fully matching backup taken before consumption
 * restores a resolved recovery back to `pending`. Every in-database defence
 * is restored together with the thing it defends. The anchor is therefore
 * kept outside every restorable Foundation snapshot and only moves forward.
 *
 * It is authoritative for the whole life of a recovery id, not just for its
 * end. A terminal-only anchor would still accept a restored snapshot whose
 * pending row predates the anchor's knowledge; requiring that the anchor
 * itself saw the acceptance closes that case too. The rule is one sentence:
 * a recovery can only be completed if this anchor accepted it and has not
 * resolved it.
 *
 * What it honestly is not: a platform monotonic counter. A TPM NV counter is
 * unreachable from a container on most hosts and an external service would
 * break local-first, so the substrate is the filesystem, in a directory the
 * host excludes from its own backups - on Home Assistant the Supervisor does,
 * as it already does for `keys/**` - with a deployment override for
 * installations that can mount something outside the data directory. That
 * raises the bar from "restore a host backup through the supported path" to
 * "write to the excluded directory";
 * a whole-filesystem rollback (VM image, disk copy, rsync host migration)
 * still moves anchor and database together. The interface exists so a real
 * platform anchor can replace the substrate without touching a caller.
 *
 * The anchor can only ever refuse. It never authorizes a recovery, never
 * creates or revokes device authority, and never substitutes for a root
 * signature or a target possession proof - Home administration stays outside
 * identity authority (ADR 0024/0033/0080/0087).
 */

export const picoHomeRecoveryAnchorSchema =
  'pico.home.recovery-anchor.v1' as const;

/**
 * `lapsed` is deliberately absent: a lapse follows from the completion window
 * carried in the record itself, so a restored row re-lapses against the Home
 * clock without any anchor help. `superseded` is present because nothing in a
 * restored row would otherwise reveal that a newer claim replaced it.
 */
export const picoHomeRecoveryAnchorStates = [
  'accepted',
  'consumed',
  'vetoed',
  'superseded',
] as const;

export type PicoHomeRecoveryAnchorState =
  typeof picoHomeRecoveryAnchorStates[number];

export interface PicoHomeRecoveryAnchorEntry {
  recoveryId: string;
  claimDigestHex: string;
  picoIdentityFingerprintHex: string;
  state: PicoHomeRecoveryAnchorState;
  /** Increases on every accepted state change; never reused, never rewound. */
  sequence: number;
  updatedAt: string;
  /**
   * The recovery's completion window end. Once it passes, a restored row
   * lapses against the Home clock on its own, so anchor knowledge about it
   * buys nothing and the entry is pruned - which is what keeps ADR 0110 A9
   * true here: a root holder cycling initiations cannot grow this file
   * without bound.
   */
  expiresAt: string;
}

export interface PicoHomeRecoveryAnchorDocument {
  schema: typeof picoHomeRecoveryAnchorSchema;
  homeId: string | null;
  /**
   * ADR 0120 N2. The greatest instant this anchor has ever justified: the
   * durable lower bound an objection window needs once it outlives the process
   * that opened it.
   *
   * It advances only by time this Home actually observed - monotonic progress
   * within a running process, persisted on write - and never by the wall
   * clock. That is the whole point: a wall clock wound forward is a claim, and
   * a claim must not retire a veto period.
   *
   * The consequence is deliberate and worth stating: a Home that is switched
   * off does not burn its objection windows. That reads as conservative, and
   * it is also simply correct - a person could not have objected while their
   * Home was off either.
   *
   * `null` on an anchor that has never taken ownership. Absence refuses.
   */
  highWaterAt?: string | null;
  /**
   * ADR 0027 IM1. The platform counter generation this document was written
   * at, when a platform anchor is in use. Absent on the filesystem substrate,
   * which is the honest fallback rather than a downgrade.
   */
  platformCounter?: number | null;
  /**
   * ADR 0122 Y6. The service version this anchor last saw running.
   *
   * Here rather than in the database because that is the point: a restore that
   * brought back an older Foundation snapshot would also bring back its record
   * of which version was running, and the downgrade would look like continuity.
   * The anchor is outside every restorable snapshot, so it still remembers.
   */
  serviceVersion?: string | null;
  /**
   * When this anchor took ownership of the Home. An anchor with no entries is
   * not the same thing as an anchor that never existed - a fresh Home has the
   * former for as long as nobody recovers - so seeding is recorded explicitly
   * rather than inferred from emptiness.
   */
  seededAt: string | null;
  sequence: number;
  entries: PicoHomeRecoveryAnchorEntry[];
  /**
   * ADR 0121 J2. One checkpoint per writer: the head of that writer's audit
   * chain, forward-only. Rewriting history in the database is cheap;
   * rewriting it so this excluded file still agrees means writing to the one
   * location the supported restore path does not carry.
   */
  auditCheckpoints?: PicoHomeAuditCheckpoint[];
}

export interface PicoHomeAuditCheckpoint {
  writerId: string;
  chainPosition: number;
  headDigestHex: string;
  updatedAt: string;
}

export type PicoHomeRecoveryAnchorRecordInput =
  Omit<PicoHomeRecoveryAnchorEntry, 'sequence' | 'updatedAt'>
  & { updatedAt?: string };

export interface PicoHomeRecoveryAnchor {
  /**
   * Records acceptance or a terminal resolution. Callers record *before*
   * committing the matching database transaction: an anchor ahead of the
   * database costs one re-initiation, an anchor behind it resurrects a spent
   * root authorization.
   */
  record(input: PicoHomeRecoveryAnchorRecordInput): void;
  lookup(recoveryId: string): PicoHomeRecoveryAnchorEntry | undefined;
  /** True when this anchor accepted the recovery and has not resolved it. */
  isCompletable(input: { recoveryId: string; claimDigestHex: string }): boolean;
  document(): PicoHomeRecoveryAnchorDocument;
  /**
   * Seeds an empty anchor. Silent and harmless on a Home with no recovery
   * history; on a Home that has one this is the explicit, audited re-seed
   * after anchor loss. Only terminal entries may be seeded - seeding a
   * pending recovery as `accepted` would hand back exactly the resurrection
   * this anchor exists to refuse, so those recoveries stay uncompletable and
   * must be initiated again.
   */
  seed(input: {
    homeId: string | null;
    entries: PicoHomeRecoveryAnchorRecordInput[];
  }): void;
  /**
   * True only for an anchor that never took ownership - neither seeded nor
   * ever written to. An anchor whose entries have all been pruned is not
   * empty in this sense, or a quiet Home would fail closed after nine days.
   */
  isEmpty(): boolean;
  /**
   * ADR 0121 J2. Records a chain head. Forward-only: a lower position for a
   * writer is refused, so a rolled-back log cannot walk its checkpoint back.
   * The anchor keeps its invariant - it can refuse to confirm a head, and it
   * can never make one valid.
   */
  recordAuditCheckpoint(input: {
    writerId: string;
    chainPosition: number;
    headDigestHex: string;
  }): void;
  auditCheckpoint(writerId: string): PicoHomeAuditCheckpoint | undefined;
  /**
   * ADR 0122 Y6. Reads the version last seen and records the running one.
   *
   * Returns what was there before, so the caller can name the direction. The
   * write happens whatever the direction: this is a record of what ran, not a
   * high-water mark, and refusing to record a downgrade would leave the next
   * boot comparing against a version that never ran.
   */
  observeServiceVersion(version: string): string | null;
  /**
   * ADR 0120 N2/N3. The durable floor, including monotonic progress made since
   * this process opened the anchor. `null` while the anchor has never taken
   * ownership, which refuses every objection window rather than defaulting one
   * open.
   *
   * N3 holds by construction: this value can only be compared against a
   * window's end, and the comparison can only withhold elapse. No anchor state
   * makes a window elapse that the record itself did not already end.
   */
  highWaterInstant(): string | null;
  /**
   * Persists the progress observed so far. Called at boot and before
   * irreversible housekeeping, so a long-running Home does not keep its whole
   * floor advance in memory. Losing unpersisted progress rewinds the floor,
   * which only ever refuses more.
   */
  observe(): void;
}

export function defaultPicoHomeRecoveryAnchorPath(databasePath: string): string {
  return join(dirname(databasePath), 'recovery-anchor', 'anchor.json');
}

/**
 * The anchor must not share a directory with anything a Foundation backup
 * captures, or it travels with the snapshot it is supposed to outlive.
 */
export function assertPicoHomeRecoveryAnchorSeparation(input: {
  anchorPath: string;
  databasePath: string;
  backupDirectory: string;
}): void {
  const anchorDirectory = dirname(input.anchorPath);
  if (anchorDirectory === dirname(input.databasePath)) {
    throw new Error('recovery_anchor_shares_database_directory');
  }
  if (
    isInside(anchorDirectory, input.backupDirectory)
    || isInside(input.backupDirectory, anchorDirectory)
  ) {
    throw new Error('recovery_anchor_inside_backup_directory');
  }
}

export function openPicoHomeRecoveryAnchor(
  anchorPath: string,
  options: {
    now?: () => Date;
    monotonicNowMs?: () => number;
    /** ADR 0027 IM1. Absent keeps the filesystem substrate. */
    platformCounter?: PicoPlatformAnchorCounter;
  } = {},
): PicoHomeRecoveryAnchor {
  const now = options.now ?? (() => new Date());
  const monotonicNowMs = options.monotonicNowMs ?? (() => performance.now());
  mkdirSync(dirname(anchorPath), { recursive: true, mode: 0o700 });
  let document = readAnchorDocument(anchorPath);

  // ADR 0027 IM1. Checked before anything is read out of the document, because
  // a rolled-back anchor must not answer one question correctly before it is
  // caught. The anchor can only ever refuse, so refusing to open is in
  // character: every caller of a missing anchor already fails closed.
  const platformCounter = options.platformCounter;
  let platformGeneration: number | null = null;
  if (platformCounter !== undefined) {
    const counterValue = platformCounter.read();
    const verdict = verifyPicoPlatformAnchorGeneration({
      documentValue: document.platformCounter ?? null,
      counterValue,
    });
    if (verdict === 'rolled_back' || verdict === 'foreign_counter') {
      throw new Error(`pico_platform_anchor_${verdict}`);
    }
    platformGeneration = document.platformCounter ?? counterValue;
  }

  // ADR 0120 N2. The floor this process last justified, and the monotonic
  // reading it was justified at. Everything above the baseline is observed
  // time; the baseline itself is only ever raised.
  let floorBaselineMs = parseFloorMs(document);
  let floorBaselineMonotonicMs = monotonicNowMs();

  const currentFloorMs = (): number | null => {
    if (floorBaselineMs === null) {
      return null;
    }
    const observed = monotonicNowMs() - floorBaselineMonotonicMs;
    return floorBaselineMs + Math.max(0, observed);
  };

  const persist = (next: PicoHomeRecoveryAnchorDocument): void => {
    // Three candidates, and the greatest wins so nothing can rewind a floor
    // another writer already justified: what this process observed, what the
    // document already carried, and - only when an anchor first takes
    // ownership - the wall clock at that moment.
    //
    // That bootstrap is the single unavoidable claim, and it reads the
    // anchor's own clock rather than the entry's `updatedAt`: `updatedAt` is
    // the caller's statement about when something happened and may be
    // historical, while the reading here is what this anchor itself observed.
    // Every advance after the bootstrap is observed time, never a claim - a
    // later write may not raise the floor to its own `now()`.
    const takingOwnership = currentFloorMs() === null
      && parseFloorMs(next) === null
      && next.seededAt !== null;
    const advancedMs = greatestDefined([
      currentFloorMs(),
      parseFloorMs(next),
      takingOwnership ? now().getTime() : null,
    ]);
    const withFloor: PicoHomeRecoveryAnchorDocument = {
      ...next,
      highWaterAt: advancedMs === null
        ? null
        : new Date(advancedMs).toISOString(),
    };
    if (advancedMs !== null) {
      floorBaselineMs = advancedMs;
      floorBaselineMonotonicMs = monotonicNowMs();
    }
    // Atomic replace plus fsync of file and directory: a torn anchor is
    // indistinguishable from a rolled-back one, and both must fail closed.
    // ADR 0027 IM1. The document is written at the *next* generation and the
    // counter is bumped afterwards. A crash between the two leaves the document
    // one ahead, which the open-time check reads as `pending_write` and
    // accepts - the same direction the anchor already prefers, where being
    // ahead costs one re-initiation and being behind resurrects a spent
    // authorization. Bumping first would invert that and brick the anchor on
    // any crash.
    const withGeneration: PicoHomeRecoveryAnchorDocument = platformGeneration === null
      ? withFloor
      : { ...withFloor, platformCounter: platformGeneration + 1 };

    const temporaryPath = `${anchorPath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(withGeneration, null, 2)}\n`, { mode: 0o600 });
    fsyncPath(temporaryPath);
    renameSync(temporaryPath, anchorPath);
    fsyncPath(dirname(anchorPath), true);

    if (platformCounter !== undefined && platformGeneration !== null) {
      const advanced = platformCounter.increment();
      if (advanced !== platformGeneration + 1) {
        // Something else is spending this counter. Continuing would compare
        // generations that no longer mean what they say.
        throw new Error('pico_platform_anchor_counter_contended');
      }
      platformGeneration = advanced;
    }
    document = withGeneration;
  };

  pruneExpiredEntries();

  return {
    record: (input) => {
      assertRecordInput(input);
      const existing = document.entries.find(
        (entry) => entry.recoveryId === input.recoveryId,
      );
      if (existing !== undefined && existing.claimDigestHex !== input.claimDigestHex) {
        throw new Error('recovery_anchor_claim_digest_conflict');
      }
      if (existing !== undefined) {
        if (existing.state === input.state) {
          // Idempotent: a retried commit must not burn a second sequence.
          return;
        }
        if (existing.state !== 'accepted') {
          // Terminal is terminal. Nothing may walk a resolution back, and no
          // caller may swap one resolution for another.
          throw new Error('recovery_anchor_state_is_terminal');
        }
        if (input.state === 'accepted') {
          throw new Error('recovery_anchor_already_accepted');
        }
      }
      // A terminal state may be recorded for a recovery this anchor never
      // accepted. That happens after a re-seed, where restored pending rows
      // are deliberately left unknown: without this, superseding or vetoing
      // such a row would be impossible and the person would stay locked out
      // of recovery until the old row lapsed. It grants nothing - an entry
      // born terminal is never `isCompletable`, so this can only refuse more.
      const sequence = document.sequence + 1;
      const entry: PicoHomeRecoveryAnchorEntry = {
        recoveryId: input.recoveryId,
        claimDigestHex: input.claimDigestHex,
        picoIdentityFingerprintHex: input.picoIdentityFingerprintHex,
        state: input.state,
        sequence,
        updatedAt: input.updatedAt ?? now().toISOString(),
        // The window is set once, at acceptance; a later transition may not
        // extend how long this entry survives.
        expiresAt: existing?.expiresAt ?? input.expiresAt,
      };
      persist({
        ...document,
        // Recording is ownership too. Without this, pruning the last expired
        // entry would make a long-running Home look like a never-initialized
        // one on the next boot - and an anchor that reports itself missing
        // blocks every recovery, which is the opposite of what pruning is
        // for.
        seededAt: document.seededAt ?? entry.updatedAt,
        sequence,
        entries: [
          ...document.entries.filter(
            (candidate) => candidate.recoveryId !== input.recoveryId,
          ),
          entry,
        ],
      });
    },
    lookup: (recoveryId) => {
      const entry = document.entries.find(
        (candidate) => candidate.recoveryId === recoveryId,
      );
      return entry === undefined ? undefined : { ...entry };
    },
    isCompletable: (input) => document.entries.some(
      (entry) => entry.recoveryId === input.recoveryId
        && entry.claimDigestHex === input.claimDigestHex
        && entry.state === 'accepted',
    ),
    document: () => ({
      ...document,
      entries: document.entries.map((entry) => ({ ...entry })),
    }),
    seed: (input) => {
      if (document.seededAt !== null || document.entries.length > 0) {
        throw new Error('recovery_anchor_already_seeded');
      }
      let sequence = 0;
      const entries = input.entries.map((entry) => {
        assertRecordInput(entry);
        if (entry.state === 'accepted') {
          throw new Error('recovery_anchor_cannot_seed_accepted');
        }
        sequence += 1;
        return {
          recoveryId: entry.recoveryId,
          claimDigestHex: entry.claimDigestHex,
          picoIdentityFingerprintHex: entry.picoIdentityFingerprintHex,
          state: entry.state,
          sequence,
          updatedAt: entry.updatedAt ?? now().toISOString(),
          expiresAt: entry.expiresAt,
        };
      });
      persist({
        schema: picoHomeRecoveryAnchorSchema,
        homeId: input.homeId,
        seededAt: now().toISOString(),
        sequence,
        entries,
      });
    },
    isEmpty: () => document.seededAt === null && document.entries.length === 0,
    recordAuditCheckpoint: (input) => {
      if (!asciiTokenPattern.test(input.writerId)) {
        throw new Error('invalid_audit_checkpoint_writer');
      }
      if (!Number.isSafeInteger(input.chainPosition) || input.chainPosition < 1) {
        throw new Error('invalid_audit_checkpoint_position');
      }
      if (!hexPattern.test(input.headDigestHex)) {
        throw new Error('invalid_audit_checkpoint_digest');
      }
      const existing = (document.auditCheckpoints ?? []).find(
        (candidate) => candidate.writerId === input.writerId,
      );
      if (existing !== undefined) {
        if (input.chainPosition < existing.chainPosition) {
          // Forward-only. A rolled-back log asking to walk its own checkpoint
          // back is precisely the case this refuses.
          throw new Error('audit_checkpoint_not_forward');
        }
        if (input.chainPosition === existing.chainPosition) {
          if (input.headDigestHex !== existing.headDigestHex) {
            // Same position, different head: two histories claiming one place
            // in the sequence. Reported by refusing, never repaired.
            throw new Error('audit_checkpoint_head_conflict');
          }
          return;
        }
      }
      persist({
        ...document,
        seededAt: document.seededAt ?? now().toISOString(),
        auditCheckpoints: [
          ...(document.auditCheckpoints ?? []).filter(
            (candidate) => candidate.writerId !== input.writerId,
          ),
          {
            writerId: input.writerId,
            chainPosition: input.chainPosition,
            headDigestHex: input.headDigestHex,
            updatedAt: now().toISOString(),
          },
        ],
      });
    },
    auditCheckpoint: (writerId) => {
      const found = (document.auditCheckpoints ?? []).find(
        (candidate) => candidate.writerId === writerId,
      );
      return found === undefined ? undefined : { ...found };
    },
    observeServiceVersion: (version) => {
      if (typeof version !== 'string' || version.trim() === '') {
        throw new Error('invalid_pico_service_version');
      }
      // An anchor that never took ownership must not be brought into existence
      // by this. ADR 0110 R6 keeps a Home closed when its anchor is missing,
      // until a person re-seeds it deliberately - and a file written here would
      // turn that loss into a fresh empty anchor that answers every question
      // with "nothing was ever consumed". Recording which version ran is not
      // worth defeating the block that exists to notice a restore.
      if (document.seededAt === null && document.entries.length === 0) {
        return null;
      }
      const previous = document.serviceVersion ?? null;
      if (previous === version) {
        // Nothing changed, so nothing is written: the common boot must not
        // rewrite the anchor and spend a platform-counter generation on it.
        return previous;
      }
      persist({ ...document, serviceVersion: version });
      return previous;
    },
    highWaterInstant: () => {
      const floorMs = currentFloorMs();
      return floorMs === null ? null : new Date(floorMs).toISOString();
    },
    observe: () => {
      if (currentFloorMs() !== null) {
        persist(document);
      }
    },
  };

  /**
   * ADR 0110 A9. Entries are dropped once their completion window has passed:
   * a restored row beyond its window lapses against the Home clock anyway, so
   * keeping the entry adds no refusal, and dropping it stops a root holder
   * from growing this file by cycling initiations. The sequence counter is
   * never rewound - only entries leave.
   */
  function pruneExpiredEntries(): void {
    if (document.entries.length === 0) {
      return;
    }
    const nowMs = now().getTime();
    const surviving = document.entries.filter(
      (entry) => Date.parse(entry.expiresAt) > nowMs,
    );
    if (surviving.length !== document.entries.length) {
      persist({ ...document, entries: surviving });
    }
  }
}

const asciiTokenPattern = /^[A-Za-z0-9._:/+-]+$/;
const hexPattern = hexOfBytesPattern(32);

function parseFloorMs(
  document: PicoHomeRecoveryAnchorDocument,
): number | null {
  if (document.highWaterAt === undefined || document.highWaterAt === null) {
    return null;
  }
  const parsed = Date.parse(document.highWaterAt);
  return Number.isFinite(parsed) ? parsed : null;
}

function greatestDefined(values: readonly (number | null)[]): number | null {
  let greatest: number | null = null;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) {
      continue;
    }
    greatest = greatest === null ? value : Math.max(greatest, value);
  }
  return greatest;
}

function assertRecordInput(input: PicoHomeRecoveryAnchorRecordInput): void {
  if (typeof input.recoveryId !== 'string' || !asciiTokenPattern.test(input.recoveryId)) {
    throw new Error('invalid_recovery_anchor_id');
  }
  if (typeof input.claimDigestHex !== 'string' || !hexPattern.test(input.claimDigestHex)) {
    throw new Error('invalid_recovery_anchor_claim_digest');
  }
  if (
    typeof input.picoIdentityFingerprintHex !== 'string'
    || !hexPattern.test(input.picoIdentityFingerprintHex)
  ) {
    throw new Error('invalid_recovery_anchor_identity');
  }
  if (!(picoHomeRecoveryAnchorStates as readonly string[]).includes(input.state)) {
    throw new Error('invalid_recovery_anchor_state');
  }
  if (
    input.updatedAt !== undefined
    && (typeof input.updatedAt !== 'string' || input.updatedAt.length === 0)
  ) {
    throw new Error('invalid_recovery_anchor_instant');
  }
  if (
    typeof input.expiresAt !== 'string'
    || Number.isNaN(Date.parse(input.expiresAt))
  ) {
    throw new Error('invalid_recovery_anchor_expiry');
  }
}

function readAnchorDocument(anchorPath: string): PicoHomeRecoveryAnchorDocument {
  let raw: string;
  try {
    raw = readFileSync(anchorPath, 'utf8');
  } catch (error) {
    /**
     * Nur "es gibt noch keinen Anker" ist ein leerer Anker (Befund B73).
     *
     * Alles andere - eine Rechteverweigerung, ein E/A-Fehler, ein Verzeichnis
     * da, wo eine Datei hingehoert, zu viele offene Dateien - faellt unter den
     * Satz, den der naechste Block schon schreibt: "unreadable" darf nie zu
     * "nichts wurde je verbraucht" werden. Das galt bisher nur fuer den
     * Inhalt und nicht fuer das Lesen selbst, und die beiden Faelle sind
     * derselbe: ein Anker, der da ist und schweigt, ist kein Anker, der nie
     * da war.
     *
     * Die Folge war nicht nur eine falsche Auskunft. Ein leer gelesener Anker
     * ist ein Anker, den `reseedPicoHomeRecoveryAnchor` neu saeen darf - und
     * das Saeen schreibt die Datei, die eben nur voruebergehend unlesbar war.
     */
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error('unreadable_recovery_anchor');
    }
    return {
      schema: picoHomeRecoveryAnchorSchema,
      homeId: null,
      seededAt: null,
      sequence: 0,
      entries: [],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // "Unreadable" must never collapse into "nothing was ever consumed".
    throw new Error('unreadable_recovery_anchor');
  }
  if (
    typeof parsed !== 'object'
    || parsed === null
    || Array.isArray(parsed)
    || (parsed as PicoHomeRecoveryAnchorDocument).schema !== picoHomeRecoveryAnchorSchema
    || !Array.isArray((parsed as PicoHomeRecoveryAnchorDocument).entries)
  ) {
    throw new Error('unreadable_recovery_anchor');
  }
  const document = parsed as PicoHomeRecoveryAnchorDocument;
  const seen = new Set<string>();
  let highest = 0;
  for (const entry of document.entries) {
    assertRecordInput(entry);
    if (seen.has(entry.recoveryId)) {
      throw new Error('duplicate_recovery_anchor_entry');
    }
    seen.add(entry.recoveryId);
    if (!Number.isSafeInteger(entry.sequence) || entry.sequence <= 0) {
      throw new Error('non_monotonic_recovery_anchor');
    }
    highest = Math.max(highest, entry.sequence);
  }
  if (!Number.isSafeInteger(document.sequence) || document.sequence < highest) {
    throw new Error('non_monotonic_recovery_anchor');
  }
  if (
    document.seededAt !== null
    && (typeof document.seededAt !== 'string' || document.seededAt.length === 0)
  ) {
    throw new Error('unreadable_recovery_anchor');
  }
  if (
    document.highWaterAt !== undefined
    && document.highWaterAt !== null
    && (typeof document.highWaterAt !== 'string'
      || !Number.isFinite(Date.parse(document.highWaterAt)))
  ) {
    // An unreadable floor must not collapse into "no floor", which would open
    // every objection window this anchor exists to hold shut.
    throw new Error('unreadable_recovery_anchor');
  }
  const auditCheckpoints = document.auditCheckpoints ?? [];
  if (!Array.isArray(auditCheckpoints)) {
    throw new Error('unreadable_recovery_anchor');
  }
  const seenWriters = new Set<string>();
  for (const checkpoint of auditCheckpoints) {
    if (typeof checkpoint !== 'object' || checkpoint === null
      || !asciiTokenPattern.test(String(checkpoint.writerId))
      || !Number.isSafeInteger(checkpoint.chainPosition)
      || checkpoint.chainPosition < 1
      || !hexPattern.test(String(checkpoint.headDigestHex))
      || typeof checkpoint.updatedAt !== 'string') {
      throw new Error('unreadable_recovery_anchor');
    }
    if (seenWriters.has(checkpoint.writerId)) {
      // Two checkpoints for one writer is two histories; there is no rule for
      // picking between them, so this fails closed rather than choosing.
      throw new Error('duplicate_audit_checkpoint');
    }
    seenWriters.add(checkpoint.writerId);
  }
  return {
    ...document,
    seededAt: document.seededAt ?? null,
    highWaterAt: document.highWaterAt ?? null,
    auditCheckpoints,
  };
}

/**
 * Durability is the whole point of this file, so a failed flush is reported
 * rather than swallowed - the same rule the ADR 0090 reader-sync store
 * follows. A caller that cannot fsync turns this into a refusal, which is the
 * honest outcome: an anchor that only reached the page cache proves nothing
 * about what survived the crash.
 */
function fsyncPath(path: string, directory = false): void {
  const handle = openSync(path, directory ? 'r' : 'r+');
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

function isInside(candidate: string, parent: string): boolean {
  const normalizedParent = parent.endsWith('/') ? parent : `${parent}/`;
  return candidate === parent || candidate.startsWith(normalizedParent);
}
