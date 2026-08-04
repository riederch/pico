import { foundationEventTypes, type FoundationEventType } from './index.js';

/**
 * ADR 0119 Q1/Q2 - resource exhaustion posture.
 *
 * Under pressure, operations split by direction rather than by importance.
 * Operations that create or extend state fail closed, because a refusal is a
 * safe outcome for all of them and a partially written authority record is
 * not. Operations that remove authority or reclaim space must keep working,
 * because a full disk that blocks a revocation has converted a resource
 * problem into a security problem.
 *
 * The reserve is what makes the second half possible. The store runs SQLite in
 * WAL mode, where a delete is a write: it needs WAL space to commit and a
 * checkpoint to return space to the filesystem. On a genuinely full disk the
 * tombstone that would free gigabytes cannot commit, so Pico refuses ordinary
 * writes while there is still room rather than discovering the wall.
 */
export const picoStoragePressureStates = [
  /** Everything works. */
  'normal',
  /** Creating writes refused; protective writes and reads still working. */
  'reserved',
  /** What the reserve exists to prevent; fail-closed for everything writing. */
  'exhausted',
] as const;

export type PicoStoragePressureState = typeof picoStoragePressureStates[number];

/**
 * Conservative because it is sized from what a delete actually needs - WAL
 * space plus a checkpoint - rather than guessed. A deployment may raise it;
 * lowering it trades away the room the protective paths run in.
 */
export const defaultPicoStorageReserveBytes = 64 * 1_024 * 1_024;

export function evaluatePicoStoragePressure(input: {
  availableBytes: number;
  reserveBytes?: number;
}): PicoStoragePressureState {
  const reserveBytes = input.reserveBytes ?? defaultPicoStorageReserveBytes;
  if (!Number.isFinite(input.availableBytes) || input.availableBytes < 0) {
    // An unreadable free-space reading is not evidence of room. Treating it as
    // `normal` would make the one case we cannot measure the one case we do
    // not protect.
    return 'exhausted';
  }
  if (!Number.isFinite(reserveBytes) || reserveBytes < 0) {
    throw new Error('invalid_pico_storage_reserve');
  }
  if (input.availableBytes <= 0) {
    return 'exhausted';
  }
  return input.availableBytes < reserveBytes ? 'reserved' : 'normal';
}

/**
 * ADR 0119 Q2. The events that remove authority or reclaim space, listed
 * rather than derived: this is a security classification, and a prefix rule
 * would quietly enrol whatever a future type happens to be called.
 *
 * `home.membership_changed` is deliberately absent. It carries both grants and
 * revocations, so it cannot be classified by type - and the safe reading of an
 * ambiguous type is "creating", which refuses rather than admits.
 */
export const picoProtectiveEventTypes = [
  'memory.tombstone',
  'memory.domain_shredded',
  'home.reset',
  'home.domain_read_revoked',
  'home.share_envelope_removed',
  'home.device_recovery_vetoed',
  'home.identity_root_rotation_vetoed',
  'auth.sessions_revoked',
  'auth.operator_reset',
] as const satisfies readonly FoundationEventType[];

export type PicoProtectiveEventType = typeof picoProtectiveEventTypes[number];

export function isPicoProtectiveEventType(type: string): boolean {
  return (picoProtectiveEventTypes as readonly string[]).includes(type);
}

/**
 * Whether an event may be appended in the given state. Reads are unaffected -
 * this decides writes only.
 */
export function mayAppendUnderPicoStoragePressure(input: {
  state: PicoStoragePressureState;
  eventType: string;
}): boolean {
  if (input.state === 'normal') {
    return true;
  }
  if (input.state === 'exhausted') {
    // The reserve failed. Everything that writes stops, including the
    // protective paths, because there is no room left to commit them either -
    // pretending otherwise would produce a torn write instead of a refusal.
    return false;
  }
  return isPicoProtectiveEventType(input.eventType);
}

export function assertKnownPicoProtectiveEventTypes(): void {
  for (const type of picoProtectiveEventTypes) {
    if (!(foundationEventTypes as readonly string[]).includes(type)) {
      throw new Error(`unknown_protective_event_type:${type}`);
    }
  }
}
