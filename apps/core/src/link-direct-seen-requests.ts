import type Database from 'better-sqlite3';

/**
 * ADR 0107 D2. Which request ids this Home has already answered, on disk.
 *
 * **This lived in a `Map` until 2026-09-10 and did not survive a restart.**
 * ADR 0107's own threat table said so from the first day - *"the seen set is
 * in-memory; a restart inside a request's remaining validity window can admit
 * the same otherwise-valid request again"* - and an external review asked
 * about it on 2026-09-09. Measured, the residue is small: it takes a request
 * signed with a valid device key, and a restart inside its own remaining
 * validity of at most sixty seconds. Small is not none, and a remote protocol
 * whose replay guard is a property of the process has none.
 *
 * Two bounds, both enforced here rather than by a sweep somewhere else:
 *
 * - **Every row expires**, and expired rows are deleted on the next request -
 *   the same lazy eviction the map did, moved to a `DELETE` with an index
 *   behind it. A Home that stops receiving requests keeps at most what the
 *   ceiling allows and nothing more arrives.
 * - **The ceiling is the row count.** At capacity the insert evicts before it
 *   writes, so a caller holding a valid key cannot grow this without bound.
 *   Refusing instead would be worse: the request would run and go
 *   unremembered, which is the replay this table exists to stop.
 *
 * Who gets evicted is `(expires_at_ms, seq)`: the row closest to expiring, and
 * among equals the oldest inserted. The second half is what the map did; the
 * first half is new and strictly kinder, because the entry that leaves is the
 * one whose remaining replayability was shortest anyway.
 */
/**
 * How many ids this table holds at once.
 *
 * It stood in `link-direct.ts` beside the request lifetime until 2026-09-10,
 * where the intake defaulted its constructor from it. It belongs to whoever
 * enforces it, and that is this file.
 */
export const MAX_PICO_LINK_DIRECT_SEEN_REQUESTS = 1_024;

export class PicoLinkDirectSeenRequests {
  public constructor(
    private readonly db: Database.Database,
    private readonly maxRows: number,
  ) {
    if (!Number.isInteger(maxRows) || maxRows <= 0) {
      throw new Error(`invalid_pico_link_direct_seen_request_ceiling:${String(maxRows)}`);
    }
  }

  /**
   * Whether this id is still remembered, after dropping whatever has expired.
   *
   * The eviction runs first and unconditionally, so a request never has to pay
   * for a sweep it did not cause and an expired id is never reported as seen.
   */
  public hasSeen(requestId: string, nowMs: number): boolean {
    this.db
      .prepare('DELETE FROM pico_link_direct_seen_request WHERE expires_at_ms <= ?')
      .run(nowMs);
    return this.db
      .prepare('SELECT 1 FROM pico_link_direct_seen_request WHERE request_id = ?')
      .get(requestId) !== undefined;
  }

  /** Records an id until its own expiry, evicting first if the table is full. */
  public remember(requestId: string, expiresAtMs: number): void {
    /*
     * **In einer Transaktion, seit Befund B163 (2026-09-13).** Der Kopf dieser
     * Datei sagt es selbst - *"at capacity the insert evicts before it
     * writes"* -, und genau das ist der Satz, der die zwei Schreibvorgaenge zu
     * einer Handlung erklaert. Geschrieben war er, eingefasst war er nicht.
     *
     * Bricht das Einfuegen fuer sich ab, ist die Verdraengung trotzdem
     * geschehen: der Eintrag mit der kuerzesten Restgueltigkeit ist fort und
     * der neue nie entstanden. Zwei Kennungen sind dann wiederholbar statt
     * einer, in genau der Tabelle, die Wiederholungen verhindern soll. Die
     * Verdraengung ist allein durch das Einfuegen gerechtfertigt, das ihr
     * folgt - und darf es deshalb nicht ueberleben.
     */
    this.db.transaction(() => {
      const { rows } = this.db
        .prepare('SELECT COUNT(*) AS rows FROM pico_link_direct_seen_request')
        .get() as { rows: number };
      if (rows >= this.maxRows) {
        this.db.prepare(`
          DELETE FROM pico_link_direct_seen_request
          WHERE request_id = (
            SELECT request_id FROM pico_link_direct_seen_request
            ORDER BY expires_at_ms ASC, seq ASC
            LIMIT 1
          )
        `).run();
      }
      const { next } = this.db
        .prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM pico_link_direct_seen_request')
        .get() as { next: number };
      this.db.prepare(`
        INSERT INTO pico_link_direct_seen_request (request_id, expires_at_ms, seq)
        VALUES (?, ?, ?)
        ON CONFLICT(request_id) DO NOTHING
      `).run(requestId, expiresAtMs, next);
    })();
  }
}
