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
 * unreachable from the add-on container and an external service would break
 * local-first, so the substrate is the filesystem, in a directory the Home
 * Assistant Supervisor excludes from add-on backups (as `keys/**` already
 * is), with a deployment override for installations that can mount something
 * outside the data directory. That raises the bar from "restore an add-on
 * backup through the supported path" to "write to the excluded directory";
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
}

export interface PicoHomeRecoveryAnchorDocument {
  schema: typeof picoHomeRecoveryAnchorSchema;
  homeId: string | null;
  /**
   * When this anchor took ownership of the Home. An anchor with no entries is
   * not the same thing as an anchor that never existed - a fresh Home has the
   * former for as long as nobody recovers - so seeding is recorded explicitly
   * rather than inferred from emptiness.
   */
  seededAt: string | null;
  sequence: number;
  entries: PicoHomeRecoveryAnchorEntry[];
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
  /** True only for an anchor that has never been seeded and holds nothing. */
  isEmpty(): boolean;
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
): PicoHomeRecoveryAnchor {
  mkdirSync(dirname(anchorPath), { recursive: true, mode: 0o700 });
  let document = readAnchorDocument(anchorPath);

  const persist = (next: PicoHomeRecoveryAnchorDocument): void => {
    // Atomic replace plus fsync of file and directory: a torn anchor is
    // indistinguishable from a rolled-back one, and both must fail closed.
    const temporaryPath = `${anchorPath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    fsyncPath(temporaryPath);
    renameSync(temporaryPath, anchorPath);
    fsyncPath(dirname(anchorPath), true);
    document = next;
  };

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
      } else if (input.state !== 'accepted') {
        throw new Error('recovery_anchor_unknown_recovery');
      }
      const sequence = document.sequence + 1;
      const entry: PicoHomeRecoveryAnchorEntry = {
        recoveryId: input.recoveryId,
        claimDigestHex: input.claimDigestHex,
        picoIdentityFingerprintHex: input.picoIdentityFingerprintHex,
        state: input.state,
        sequence,
        updatedAt: input.updatedAt ?? new Date().toISOString(),
      };
      persist({
        ...document,
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
          updatedAt: entry.updatedAt ?? new Date().toISOString(),
        };
      });
      persist({
        schema: picoHomeRecoveryAnchorSchema,
        homeId: input.homeId,
        seededAt: new Date().toISOString(),
        sequence,
        entries,
      });
    },
    isEmpty: () => document.seededAt === null && document.entries.length === 0,
  };
}

const asciiTokenPattern = /^[A-Za-z0-9._:/+-]+$/;
const hexPattern = /^[0-9a-f]{64}$/;

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
}

function readAnchorDocument(anchorPath: string): PicoHomeRecoveryAnchorDocument {
  let raw: string;
  try {
    raw = readFileSync(anchorPath, 'utf8');
  } catch {
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
  return { ...document, seededAt: document.seededAt ?? null };
}

function fsyncPath(path: string, directory = false): void {
  let handle: number;
  try {
    handle = openSync(path, directory ? 'r' : 'r+');
  } catch {
    return;
  }
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
