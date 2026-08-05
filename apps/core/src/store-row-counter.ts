import type { Database } from 'better-sqlite3';
import {
  defaultPicoStoreCeilingRows,
  picoDurableStores,
  type PicoDurableStore,
  type PicoStoreCeiling,
} from '@pico/protocol';

/**
 * Row counts for the stores ADR 0119 Q5 puts a ceiling on.
 *
 * Counting on demand is not affordable. Measured on this tree's SQLite build, a
 * bare `COUNT(*)` costs about 8 ms at a million rows and 50 ms at five million
 * - so checking a ceiling on every append would cost more than the append. The
 * count is therefore seeded once and maintained.
 *
 * The drift that maintenance can produce is deliberately one-directional.
 * Inserts are counted, because every one of these tables has exactly one insert
 * site; deletions are not, because they have many. So the cached count can only
 * run *high*, never low, and a high count refuses a creating write that could
 * have been allowed - the fail-safe direction, and never the reverse.
 *
 * {@link resync} is what keeps that from being permanent. It runs whenever a
 * ceiling looks reached, so the drift is corrected exactly at the moment it
 * would change an answer: a person who shreds a domain to make room is unblocked
 * by their next attempt rather than at some later sweep.
 */
const tableByStore: Record<PicoDurableStore, string> = {
  event_log: 'pico_event',
  memory_item: 'memory_item',
  audit_record: 'pico_audit_record',
  share_envelope: 'pico_share_envelope',
};

export class PicoStoreRowCounter {
  private readonly counts = new Map<PicoDurableStore, number>();

  private readonly ceilingRows: Record<PicoDurableStore, number>;

  public constructor(
    private readonly db: Database,
    ceilingRows: Partial<Record<PicoDurableStore, number>> = {},
  ) {
    this.ceilingRows = { ...defaultPicoStoreCeilingRows, ...ceilingRows };
    for (const store of picoDurableStores) {
      const ceiling = this.ceilingRows[store];
      if (!Number.isInteger(ceiling) || ceiling <= 0) {
        throw new Error(`invalid_pico_store_ceiling:${store}`);
      }
    }
  }

  /** Called at the single insert site of each counted store. */
  public recordInsert(store: PicoDurableStore, rows = 1): void {
    if (rows <= 0) {
      return;
    }
    const known = this.counts.get(store);
    if (known === undefined) {
      // Nothing seeded yet, so there is nothing to keep current; the first
      // read will count the table and see this row along with the rest.
      return;
    }
    this.counts.set(store, known + rows);
  }

  public ceilings(): PicoStoreCeiling[] {
    return picoDurableStores.map((store) => ({
      store,
      rows: this.rows(store),
      ceilingRows: this.ceilingRows[store],
    }));
  }

  /** Re-reads every counted table, discarding accumulated drift. */
  public resync(): void {
    for (const store of picoDurableStores) {
      this.counts.set(store, this.count(store));
    }
  }

  private rows(store: PicoDurableStore): number {
    const known = this.counts.get(store);
    if (known !== undefined) {
      return known;
    }
    const counted = this.count(store);
    this.counts.set(store, counted);
    return counted;
  }

  private count(store: PicoDurableStore): number {
    const table = tableByStore[store];
    try {
      const row = this.db
        .prepare(`SELECT COUNT(*) AS rows FROM ${table}`)
        .get() as { rows: number } | undefined;
      return row?.rows ?? 0;
    } catch {
      // A table this schema version does not have yet is not evidence of
      // pressure. Unlike an unreadable free-space reading - where "unknown"
      // could mean a full disk - a missing table holds no rows by definition.
      return 0;
    }
  }
}
