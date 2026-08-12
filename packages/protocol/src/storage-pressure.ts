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

/**
 * ADR 0119 Q5 - durable growth is a decided quantity rather than an emergent
 * one.
 *
 * Reaching a ceiling is the same `reserved` condition as low disk: creating
 * writes refused, protective paths alive, person informed. It is deliberately
 * never `exhausted` - the disk still has room, so a tombstone can certainly
 * commit, and the two conditions should not be conflated just because they
 * share a refusal.
 *
 * The append-only log gets no expiry here. ADR 0014 made it append-only for
 * reasons resource pressure does not overturn, and an expiry that quietly
 * forgets signed evidence is a worse failure than a refusal. A ceiling
 * *refuses*; it never trims. What it forces is the conversation the person
 * should be having - export, migrate, shred a domain, or provision more space.
 */
export const picoDurableStores = [
  'event_log',
  'memory_item',
  'audit_record',
  'share_envelope',
  /**
   * ADR 0129 SR2. The observation buffer, which is a store the core owns and
   * therefore a store that answers to this ceiling like the rest.
   */
  'observation',
  /**
   * ADR 0137 IN1/IN5. Attached suppliers. The instance list is deliberately
   * **open** - what a supplier may produce is fixed, how many exist is a
   * person's business - so this ceiling is what stands in place of the closed
   * enumeration ADR 0127 gives modules.
   */
  'supplier_attachment',
  /**
   * ADR 0143 DP1. Attached depots. A person adds these the way they add a
   * supplier, and there are fewer of them, since one depot provides several.
   */
  'depot_attachment',
  /**
   * ADR 0148 EX5. One row per device that has exchanged mailbox addresses
   * with this Home.
   *
   * Bounded by devices rather than by traffic: a row appears when a device
   * first exchanges and is replaced when it exchanges again, so this counts
   * devices a person has enrolled over the life of the Home rather than
   * anything that grows with use.
   */
  'link_mailbox',
] as const;

export type PicoDurableStore = typeof picoDurableStores[number];

/**
 * Conservative for a personal appliance, and stated rather than guessed: at a
 * thousand events a day the event ceiling is roughly thirteen years, the audit
 * ceiling tracks it because authority-bearing events chain one record each, and
 * a million memory items is past any one person's lifetime of notes.
 *
 * The pending inbox is held far tighter than the rest. It is the only one of
 * these an outside sender can grow, so it is the only one where the ceiling is
 * sized against a peer rather than against the person.
 *
 * Supplier attachments are tighter again, and for the opposite reason: nothing
 * but a person adds one, so the ceiling is sized against a runaway rather than
 * against use.
 */
export const defaultPicoStoreCeilingRows: Record<PicoDurableStore, number> = {
  event_log: 5_000_000,
  memory_item: 1_000_000,
  audit_record: 5_000_000,
  share_envelope: 100_000,
  // ADR 0129 SR2. Two orders of magnitude below the record stores, because
  // this one is a working buffer and not a record. Under the adaptive capture
  // ADR 0129 asks for - a reading every half minute across two streams - a
  // 48-hour window holds roughly twelve thousand rows, so this leaves ample
  // headroom while still stopping a producer that has come loose.
  observation: 200_000,
  // ADR 0137 IN1. Four orders of magnitude below the record stores, and the
  // reason is what grows the table: **every row is a person deciding
  // something**. Attaching means choosing a Private Space, and for a bridge
  // supplying a credential; nothing loops it and no peer can add to it.
  //
  // The realistic count is small. Three Home Assistants and two knowledge
  // bases is five; an estate that attached every building, every corpus and
  // every subscription it had might reach fifty. A thousand is twenty times
  // that, which leaves a person no reason to meet it - and it is still low
  // enough that something attaching in a loop stops in seconds instead of
  // filling a disk. That is the case this ceiling exists for, because ADR 0119
  // Q5's rule is that the one thing which cannot be enumerated must not be the
  // one thing that is unprotected.
  supplier_attachment: 1_000,
  // ADR 0143 DP1. Tighter again, for the same reason and one step further: a
  // depot provides one or more suppliers, so a person attaches fewer depots
  // than suppliers. Attaching one is also the heavier decision of the two -
  // it is a decision about code that will execute, not about material to read.
  depot_attachment: 100,
  /**
   * ADR 0148 EX5. Two orders of magnitude above any plausible device count,
   * in the posture the two attachment ceilings above already take: the number
   * is not a prediction, it is the point past which something has come loose.
   * A person enrolling a thousand devices is not a person.
   */
  link_mailbox: 1_000,
};

export interface PicoStoreCeiling {
  store: PicoDurableStore;
  rows: number;
  ceilingRows: number;
}

export const picoStoragePressureCauses = ['low_disk', 'store_ceiling'] as const;
export type PicoStoragePressureCause = typeof picoStoragePressureCauses[number];

/**
 * The action that clears the condition, as a named class rather than a
 * sentence. The core states which remedy applies; the words belong to whichever
 * surface is speaking to the person, so this does not hard-code one product's
 * phrasing into the protocol.
 */
export const picoStoragePressureRemedies = [
  'free_disk_space',
  'reduce_stored_data',
] as const;
export type PicoStoragePressureRemedy = typeof picoStoragePressureRemedies[number];

export interface PicoStoragePressureReason {
  cause: PicoStoragePressureCause;
  remedy: PicoStoragePressureRemedy;
  /** Present only for `store_ceiling`. */
  store?: PicoDurableStore;
  rows?: number;
  ceilingRows?: number;
}

export interface PicoStorageCondition {
  state: PicoStoragePressureState;
  /**
   * Every reason that currently applies, not just the most severe. A person
   * who frees disk space while a store is also at its ceiling would otherwise
   * fix one condition and meet the next one with no warning.
   */
  reasons: PicoStoragePressureReason[];
}

export function hasPicoStoreReachedCeiling(ceiling: PicoStoreCeiling): boolean {
  if (!Number.isFinite(ceiling.ceilingRows) || ceiling.ceilingRows <= 0) {
    throw new Error(`invalid_pico_store_ceiling:${ceiling.store}`);
  }
  return ceiling.rows >= ceiling.ceilingRows;
}

/**
 * The whole condition: disk and ceilings together, with the most severe state
 * winning and every applicable reason listed.
 */
export function evaluatePicoStorageCondition(input: {
  availableBytes?: number;
  reserveBytes?: number;
  ceilings?: readonly PicoStoreCeiling[];
}): PicoStorageCondition {
  const reasons: PicoStoragePressureReason[] = [];

  // A store with no free-space source stays `normal` on that axis, which is the
  // development posture ADR 0119 scopes itself against - not a claim of room.
  const diskState: PicoStoragePressureState = input.availableBytes === undefined
    ? 'normal'
    : evaluatePicoStoragePressure({
      availableBytes: input.availableBytes,
      ...(input.reserveBytes === undefined ? {} : { reserveBytes: input.reserveBytes }),
    });
  if (diskState !== 'normal') {
    reasons.push({ cause: 'low_disk', remedy: 'free_disk_space' });
  }

  let ceilingReached = false;
  for (const ceiling of input.ceilings ?? []) {
    if (!hasPicoStoreReachedCeiling(ceiling)) {
      continue;
    }
    ceilingReached = true;
    reasons.push({
      cause: 'store_ceiling',
      remedy: 'reduce_stored_data',
      store: ceiling.store,
      rows: ceiling.rows,
      ceilingRows: ceiling.ceilingRows,
    });
  }

  // `exhausted` can only come from the disk. A ceiling means the person has
  // stored a lot, not that the filesystem has run out, so the protective paths
  // still have room to commit - which is exactly what `reserved` means.
  if (diskState === 'exhausted') {
    return { state: 'exhausted', reasons };
  }
  return {
    state: diskState === 'reserved' || ceilingReached ? 'reserved' : 'normal',
    reasons,
  };
}

/**
 * ADR 0119 Q5. What a device is told over the Link: the state and which classes
 * of cause apply, and nothing more.
 *
 * Deliberately narrower than {@link PicoStorageCondition}, which the Foundation
 * surface reads locally. Row counts and free bytes would let a peer infer how
 * much the Home holds and how fast it grows, and no decision the person makes
 * changes with them.
 */
export interface PicoHomeStorageConditionView {
  state: PicoStoragePressureState;
  causes: readonly PicoStoragePressureCause[];
}

export function toPicoHomeStorageConditionView(
  condition: PicoStorageCondition,
): PicoHomeStorageConditionView {
  const causes: PicoStoragePressureCause[] = [];
  for (const reason of condition.reasons) {
    if (!causes.includes(reason.cause)) {
      causes.push(reason.cause);
    }
  }
  return { state: condition.state, causes };
}

export function parsePicoHomeStorageConditionView(
  value: unknown,
): PicoHomeStorageConditionView {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_pico_home_storage_condition');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== 'causes' || keys[1] !== 'state') {
    throw new Error('invalid_pico_home_storage_condition');
  }
  if (!(picoStoragePressureStates as readonly string[]).includes(record.state as string)) {
    throw new Error('invalid_pico_home_storage_condition');
  }
  if (!Array.isArray(record.causes)) {
    throw new Error('invalid_pico_home_storage_condition');
  }
  const causes: PicoStoragePressureCause[] = [];
  for (const cause of record.causes as unknown[]) {
    if (!(picoStoragePressureCauses as readonly string[]).includes(cause as string)) {
      throw new Error('invalid_pico_home_storage_condition');
    }
    if (causes.includes(cause as PicoStoragePressureCause)) {
      throw new Error('invalid_pico_home_storage_condition');
    }
    causes.push(cause as PicoStoragePressureCause);
  }
  return Object.freeze({
    state: record.state as PicoStoragePressureState,
    causes: Object.freeze(causes),
  });
}

export function assertKnownPicoProtectiveEventTypes(): void {
  for (const type of picoProtectiveEventTypes) {
    if (!(foundationEventTypes as readonly string[]).includes(type)) {
      throw new Error(`unknown_protective_event_type:${type}`);
    }
  }
}
